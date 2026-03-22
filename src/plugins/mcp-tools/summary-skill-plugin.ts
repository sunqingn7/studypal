import { MCPServerPlugin, MCPTool, MCPToolResult, PluginMetadata } from '../../domain/models/plugin';
import { useAIChatStore } from '../../application/store/ai-chat-store';
import { useNoteStore } from '../../application/store/note-store';
import { useLLMPoolStore } from '../../application/store/llm-pool-store';
import { getProvider } from '../../infrastructure/ai-providers/provider-factory';
import type { ChatMessage } from '../../domain/models/ai-context';
import type { PoolProvider } from '../../domain/models/llm-pool';

export class SummarySkillMCPServerPlugin implements MCPServerPlugin {
  metadata: PluginMetadata = {
    id: 'mcp-summary-skill',
    name: 'Summary Skill MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'Summarizes chat discussions and writes to notes. Trigger: "summarize above discussion and make it a note"',
    author: 'StudyPal Team',
    configSchema: {
      autoTrigger: {
        type: 'boolean',
        default: true,
        description: 'Automatically detect summary requests in chat'
      },
      defaultProviderStrategy: {
        type: 'string',
        default: 'leader',
        enum: ['leader', 'random-non-primary', 'random'],
        description: 'Strategy for selecting which LLM to use for summarization'
      },
      maxSummaryLength: {
        type: 'number',
        default: 2000,
        description: 'Maximum length of summary in characters'
      }
    }
  };

  type: 'mcp-server' = 'mcp-server';
  private autoTrigger: boolean = true;
  private defaultProviderStrategy: string = 'leader';
  private maxSummaryLength: number = 2000;

  // Keywords to detect summary requests
  private summaryTriggerPatterns = [
    /summarize\s+(above|this|the)\s+discuss/i,
    /summarize\s+and\s+make\s+(it|this)\s+(a|into)\s+note/i,
    /create\s+a?\s*summary\s+(of|for)\s+(above|this|the)\s+discuss/i,
    /write\s+a?\s*summary\s+(to|into)\s+(note|the note)/i,
    /save\s+(this|the)\s+discuss\s+(as|to)\s+(a\s+)?note/i,
    /turn\s+this\s+discuss\s+into\s+(a\s+)?note/i
  ];

  async initialize(config?: Record<string, unknown>): Promise<void> {
    if (config?.autoTrigger !== undefined) {
      this.autoTrigger = config.autoTrigger as boolean;
    }
    if (config?.defaultProviderStrategy !== undefined) {
      this.defaultProviderStrategy = config.defaultProviderStrategy as string;
    }
    if (config?.maxSummaryLength !== undefined) {
      this.maxSummaryLength = config.maxSummaryLength as number;
    }
    console.log('[SummarySkill] MCP plugin initialized');
  }

  async destroy(): Promise<void> {
    console.log('[SummarySkill] MCP plugin destroyed');
  }

  getConfig(): Record<string, unknown> {
    return {
      autoTrigger: this.autoTrigger,
      defaultProviderStrategy: this.defaultProviderStrategy,
      maxSummaryLength: this.maxSummaryLength
    };
  }

  setConfig(config: Record<string, unknown>): void {
    if (config.autoTrigger !== undefined) {
      this.autoTrigger = config.autoTrigger as boolean;
    }
    if (config.defaultProviderStrategy !== undefined) {
      this.defaultProviderStrategy = config.defaultProviderStrategy as string;
    }
    if (config.maxSummaryLength !== undefined) {
      this.maxSummaryLength = config.maxSummaryLength as number;
    }
  }

  getServerName(): string {
    return 'summary-skill-mcp';
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'summarize_discussion',
        description: 'Summarize the current chat discussion and append it to the active note. Automatically triggered when user says things like "summarize above discussion and make it a note"',
        parameters: [
          {
            name: 'style',
            type: 'string',
            description: 'Summary style: bullet_points, concise, or detailed',
            required: false,
            enum: ['bullet_points', 'concise', 'detailed'],
            default: 'bullet_points'
          },
          {
            name: 'include_thinking',
            type: 'boolean',
            description: 'Whether to include thinking/reasoning from the discussion',
            required: false,
            default: false
          },
          {
            name: 'max_length',
            type: 'number',
            description: 'Maximum summary length in characters',
            required: false,
            default: this.maxSummaryLength
          }
        ]
      }
    ];
  }

  /**
   * Check if a message triggers the summary action
   */
  isSummaryTrigger(message: string): boolean {
    if (!this.autoTrigger) return false;
    const lowerMessage = message.toLowerCase();
    return this.summaryTriggerPatterns.some(pattern => pattern.test(lowerMessage));
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    if (toolName !== 'summarize_discussion') {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    try {
      // 1. Get chat messages
      const chatStore = useAIChatStore.getState();
      const activeTab = chatStore.getActiveTab();

      if (!activeTab || activeTab.messages.length === 0) {
        return { success: false, error: 'No chat messages to summarize' };
      }

      // Filter out system messages and get actual discussion
      const discussionMessages = activeTab.messages.filter(m => 
        m.role === 'user' || m.role === 'assistant'
      );

      if (discussionMessages.length === 0) {
        return { success: false, error: 'No discussion messages to summarize' };
      }

      // Format messages for LLM
      const formattedDiscussion = discussionMessages.map(m => {
        const prefix = m.providerNickname ? `[${m.providerNickname}] ` : '';
        const role = m.role === 'user' ? 'User' : 'Assistant';
        let content = m.content;
        
        // Strip HTML if present
        if (content.includes('<')) {
          content = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        
        return `${prefix}${role}: ${content}`;
      }).join('\n\n');

      // 2. Get active note
      const noteStore = useNoteStore.getState();
      const activeNote = noteStore.getActiveNote();

      if (!activeNote) {
        return { success: false, error: 'No active note to write summary to. Please open or create a note first.' };
      }

      // 3. Select provider for summarization
      const poolStore = useLLMPoolStore.getState();
      const selectedProvider = this.selectProvider(poolStore);

      if (!selectedProvider) {
        return { success: false, error: 'No available LLM providers for summarization' };
      }

      console.log(`[SummarySkill] Selected provider for summarization: ${selectedProvider.nickname || selectedProvider.name}`);

      // 4. Generate summary by calling the provider directly (bypass task queue)
      const style = (params.style as string) || 'bullet_points';
      const maxLength = (params.max_length as number) || this.maxSummaryLength;

      const prompt = this.buildSummaryPrompt(formattedDiscussion, style, maxLength, false);

      const aiProvider = getProvider(selectedProvider.config.provider);
      const config = {
        ...selectedProvider.config,
        maxTokens: Math.min(Math.ceil(maxLength / 2), 1500),
        temperature: 0.3,
      };

      // Build messages
      const messages: ChatMessage[] = [];
      if (selectedProvider.config.systemPrompt) {
        messages.push({ id: crypto.randomUUID(), role: 'system', content: selectedProvider.config.systemPrompt, timestamp: Date.now() });
      }
      messages.push({ id: crypto.randomUUID(), role: 'user', content: prompt, timestamp: Date.now() });

      // 5. Generate and write summary to note
      const timestamp = new Date().toLocaleString();
      const providerName = selectedProvider.nickname || selectedProvider.name;
      
      const summaryHeader = `\n\n---\n📋 **Discussion Summary** (${timestamp})\n*Summarized by: ${providerName}*\n\n`;
      const summaryFooter = `\n---\n`;
      
      // Find and activate the tab for this note
      const tabs = noteStore.tabs;
      const noteTab = tabs.find(t => t.noteId === activeNote.id);
      if (noteTab) {
        noteStore.setActiveTab(noteTab.id);
      } else {
        const newTabId = noteStore.createTabForNote(activeNote.id, activeNote.title);
        noteStore.setActiveTab(newTabId);
      }

      // Get current content
      const currentContent = noteStore.getNoteContent(activeNote.id);

      // Get full response (non-streaming for reliability + clean format)
      let response: string;
      try {
        response = await aiProvider.chat(messages, config);
      } catch (err) {
        console.error('[SummarySkill] Provider call failed:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Failed to generate summary' };
      }

      // Clean the response: strip thinking JSON, tool calls, markdown code fences if any
      let summaryText = response.trim()

      // Try to extract clean markdown - check if response is JSON with thinking
      if (summaryText.startsWith('{')) {
        try {
          const parsed = JSON.parse(summaryText)
          summaryText = parsed.content || parsed.text || parsed.summary || parsed.response || ''
        } catch {
          // Not JSON - try to strip thinking JSON from the text
        }
      }

      // Strip thinking JSON patterns aggressively
      summaryText = summaryText
        // Match {"content":"","thinking":"..."} or similar patterns with thinking field
        .replace(/\{[^{}]*?"thinking"\s*:\s*"[\s\S]*?"[\s\S]*?\}/g, '')
        .replace(/\{[^{}]*?"content"\s*:\s*""[\s\S]*?\}/g, '')
        // Match any JSON object containing thinking-like content at the start
        .replace(/^\s*\{[\s\S]*?"thinking"[\s\S]*?\}\s*/, '')
        // Remove tool call JSON
        .replace(/\{[\s\S]*?"tool_call"[\s\S]*?\}\s*/g, '')
        // Remove triple backtick code fences
        .replace(/```[\s\S]*?```/g, '')
        // Remove leading/trailing markdown code fences
        .replace(/^```markdown\s*/im, '')
        .replace(/^```\s*/im, '')
        .replace(/```\s*$/gm, '')
        .trim()

      // Last resort: if text still contains thinking patterns, find the first markdown heading
      if (/Analyze the Request|Analyze the Source|Synthesize|Drafting|Step \d+:/i.test(summaryText)) {
        const headingMatch = summaryText.match(/(#{1,6}\s+.+?(?=\n|$))/)
        const bulletMatch = summaryText.match(/^[\s]*[-*•]\s+\S/i)
        const match = headingMatch || bulletMatch
        if (match?.index !== undefined && match.index > 0) {
          summaryText = summaryText.slice(match.index).trim()
        }
      }

      const fullSummary = summaryHeader + summaryText + summaryFooter;
      const newContent = currentContent + fullSummary;
      noteStore.updateNoteContent(activeNote.id, newContent);

      return {
        success: true,
        data: {
          noteId: activeNote.id,
          noteTitle: activeNote.title,
          summaryLength: summaryText.length,
          provider: providerName,
          messagesSummarized: discussionMessages.length,
          message: `Summary written to note "${activeNote.title}"`
        }
      };

    } catch (error) {
      console.error('[SummarySkill] Error executing tool:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Select provider for summarization based on strategy
   */
  private selectProvider(poolStore: ReturnType<typeof useLLMPoolStore.getState>): PoolProvider | undefined {
    const healthyProviders = poolStore.getHealthyProviders();

    if (healthyProviders.length === 0) {
      return undefined;
    }

    switch (this.defaultProviderStrategy) {
      case 'leader': {
        // Find provider with leader role
        const leader = healthyProviders.find(p => p.personaRole === 'leader');
        if (leader) return leader;
        
        // Fallback to primary if no leader
        const primary = poolStore.getPrimaryProvider();
        if (primary && healthyProviders.some(p => p.id === primary.id)) {
          return primary;
        }
        
        // Fallback to first healthy provider
        return healthyProviders[0];
      }

      case 'random-non-primary': {
        // Filter out primary provider
        const primary = poolStore.getPrimaryProvider();
        const nonPrimaryProviders = healthyProviders.filter(p => p.id !== primary?.id);
        
        if (nonPrimaryProviders.length > 0) {
          return nonPrimaryProviders[Math.floor(Math.random() * nonPrimaryProviders.length)];
        }
        
        // Fallback to any healthy provider
        return healthyProviders[Math.floor(Math.random() * healthyProviders.length)];
      }

      case 'random':
      default: {
        // Random selection from all healthy providers
        return healthyProviders[Math.floor(Math.random() * healthyProviders.length)];
      }
    }
  }

  /**
   * Build the summary prompt for the LLM
   */
  private buildSummaryPrompt(
    discussion: string, 
    style: string, 
    maxLength: number,
    _includeThinking: boolean
  ): string {
    const styleInstructions: Record<string, string> = {
      bullet_points: `Use bullet points. Group related points together.`,
      concise: `Brief, 2-3 paragraphs capturing key points and conclusions.`,
      detailed: `Cover main points, conclusions, and key insights. Organize by themes.`
    };

    return `You are a skilled summarizer. Summarize the following chat discussion.

IMPORTANT RULES:
- Output ONLY the summary in Markdown. NO thinking, NO reasoning, NO JSON, NO tool calls.
- Just the clean formatted summary text.
- Maximum ${maxLength} characters.
- Preserve key technical details.
- ${styleInstructions[style] || styleInstructions.bullet_points}

---

Discussion:

${discussion}

---

Summary:`;
  }
}

export const summarySkillMCPServerPlugin = new SummarySkillMCPServerPlugin();
