# Classroom Mode Implementation Plan

This document outlines the detailed implementation plan for adding MCP (Model Context Protocol) support and Classroom Mode to StudyPal.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Decisions](#architecture-decisions)
3. [Plugin-Based Architecture](#plugin-based-architecture)
4. [MCP Tool Calling Infrastructure](#mcp-tool-calling-infrastructure)
5. [Web Search Integration](#web-search-integration)
6. [Note Integration via MCP](#note-integration-via-mcp)
7. [TTS Integration](#tts-integration)
8. [Classroom Mode](#classroom-mode)
9. [Quiz System](#quiz-system)
10. [Global Settings View](#global-settings-view)
11. [Implementation Phases](#implementation-phases)
12. [Configuration Design](#configuration-design)
13. [API Specifications](#api-specifications)

---

## Overview

### Goals

1. **MCP Tool Support**: Enable the AI to use external tools (notes, web search, TTS, etc.) via tool calling
2. **Web Search Integration**: Enhance learning with latest developments, real-world examples, and diverse quiz questions
3. **Note Integration**: AI can read/write notes via MCP tools with user confirmation
4. **TTS Integration**: Text-to-speech with multiple backend support (Edge TTS default, Qwen TTS optional)
5. **Classroom Mode**: Simulate live teaching with PPT view, document view, chat view, and notes view
6. **Quiz System**: Generate and evaluate quizzes with configurable difficulty and adaptive learning

### Technology Stack

- **Frontend**: TypeScript + React
- **Backend**: Rust (Tauri)
- **TTS**: Edge TTS (default) + Qwen TTS (optional, external server)
- **Languages**: 2 (TypeScript + Rust), Python optional for Qwen TTS server

---

## Architecture Decisions

### 1. External MCP Server Support

**Decision**: Defer external MCP server support. Start with internal tools only.

**Rationale**:
- Internal tools (notes, files, web) cover most use cases
- External MCP (Google Drive, Slack) can be added later
- Reduces initial complexity

### 2. TTS Implementation

**Decision**: Rust backend with TypeScript frontend

**Architecture**:
```
┌─────────────────────────────────────────────────────────┐
│              TypeScript (Frontend)                      │
│  ├─ TTS MCP Tool                                       │
│  ├─ Audio Player (Web Audio API)                       │
│  └─ invoke('tts_speak', params)                        │
└──────────────────┬──────────────────────────────────────┘
                   │ Tauri IPC
┌──────────────────▼──────────────────────────────────────┐
│              Rust (Tauri Backend)                       │
│  ├─ tts_speak command                                  │
│  │   ├─ Edge TTS Client (HTTP) ✅                     │
│  │   └─ Qwen TTS Server Client (HTTP/WS) ✅           │
│  └─ Audio streaming to frontend (Base64/WAV)           │
└─────────────────────────────────────────────────────────┘
```

**Backends**:
| Backend | Quality | Offline | Dependencies |
|---------|---------|---------|--------------|
| Edge TTS | High | ❌ | Internet |
| Qwen TTS | Highest | ✅ | Python server |
| Web Speech API | Basic | ✅ | None |

### 3. Tool Calling Approach

**Decision**: Implement both with fallback

**Implementation**:
1. **Native Function Calling** (OpenAI, Anthropic, Ollama with function support)
   - LLM natively understands tools
   - More accurate tool selection
   
2. **Prompt-Based Fallback** (llama.cpp, vLLM, custom)
   - Tools described in system prompt
   - Parse JSON tool calls from response
   - Works with any LLM

### 4. Quiz View

**Decision**: Separate view (not modal)

**Rationale**:
- Modal dialogs can freeze the app if something goes wrong
- Separate view allows easier navigation
- Better for multi-step quiz flow

---

## Plugin-Based Architecture

### Overview

This project uses a loosely-coupled, plugin-based architecture to maximize flexibility and maintainability. Each functional unit is implemented as a plugin that registers itself and can be configured independently.

### Existing Plugin Types

The application already supports these plugin types:
- **`view`**: View plugins (e.g., PPT View, Quiz View)
- **`file-handler`**: File format handlers
- **`action`**: User actions
- **`ai-provider`**: AI backend providers
- **`mcp-server`**: MCP tool providers

### New Plugin Types

For this implementation, we will add:

| Plugin Type | Description | Examples |
|-------------|-------------|----------|
| **`tts-backend`** | TTS service providers | Edge TTS, Qwen TTS |
| **`quiz-provider`** | Quiz generation/evaluation | LLM-based quiz |
| **`ppt-generator`** | PPT slide generation | LLM-based PPT |

### Plugin Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Plugin Registry                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  getPlugins() → All registered plugins                    │  │
│  │  getPluginsByType('tts-backend') → TTS plugins           │  │
│  │  getPluginsByType('mcp-server') → MCP plugins            │  │
│  │  getViewPlugins() → View plugins                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┬───────────────┐
     │               │               │               │
┌────▼────┐    ┌─────▼─────┐  ┌─────▼────┐  ┌────▼─────┐
│  View   │    │  MCP      │  │  TTS     │  │  Quiz    │
│ Plugins │    │  Plugins  │  │  Plugins │  │ Providers│
├─────────┤    ├───────────┤  ├──────────┤  ├──────────┤
│ PPTView │    │NotePlugin │  │EdgeTTS   │  │LLMQuiz   │
│QuizView │    │WebSearch  │  │QwenTTS   │  │          │
│DocView  │    │Classroom  │  │          │  │          │
└─────────┘    └───────────┘  └──────────┘  └──────────┘
```

### Plugin Interface Examples

#### MCP Server Plugin (Individual)

```typescript
// src/plugins/mcp-tools/note-mcp-plugin.ts
export class NoteMCPServerPlugin implements MCPServerPlugin {
  metadata = {
    id: 'mcp-notes',
    name: 'Notes MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'MCP tools for note operations',
    configSchema: {
      requireConfirmationForModify: { type: 'boolean', default: true }
    }
  };

  getServerName(): string {
    return 'notes-mcp';
  }

  getTools(): MCPTool[] {
    return [
      { name: 'get_note', description: '...', parameters: [...] },
      { name: 'search_notes', description: '...', parameters: [...] },
      { name: 'create_note', description: '...', parameters: [...] },
      { name: 'update_note', description: '...', parameters: [...] },
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    // Implementation
  }
}
```

#### TTS Backend Plugin

```typescript
// src/plugins/tts-backends/edge-tts-backend.ts
export class EdgeTTSBackendPlugin implements TTSBackendPlugin {
  metadata = {
    id: 'tts-edge',
    name: 'Edge TTS',
    type: 'tts-backend',
    version: '1.0.0',
    description: 'Microsoft Edge Text-to-Speech',
    configSchema: {
      voice: { type: 'string', default: 'en-US-AriaNeural' },
      speed: { type: 'number', default: 1.0 }
    }
  };

  getBackendName(): string {
    return 'Edge TTS';
  }

  async synthesize(text: string, config?: TTSConfig): Promise<AudioData> {
    // Call Edge TTS API
  }

  async streamSynthesize(text: string, onChunk: (chunk: AudioChunk) => void): Promise<void> {
    // Streaming synthesis
  }

  getAvailableVoices(): VoiceInfo[] {
    return EDGE_TTS_VOICES;
  }
}
```

#### View Plugin

```typescript
// src/plugins/views/quiz-view-plugin.ts
export class QuizViewPlugin implements ViewPlugin {
  metadata = {
    id: 'view-quiz',
    name: 'Quiz View',
    type: 'view',
    version: '1.0.0',
    description: 'Interactive quiz view for students',
    configSchema: {
      showTimer: { type: 'boolean', default: true },
      showFeedback: { type: 'boolean', default: true }
    }
  };

  getViewComponent(): React.ComponentType<{ context: PluginContext }> {
    return QuizView;
  }

  canHandle(context: PluginContext): boolean {
    return context.viewMode === 'quiz';
  }

  getViewName(): string {
    return 'Quiz';
  }
}
```

### Plugin Manager Usage

```typescript
// How plugins are loaded and used
const pluginManager = new PluginManager();

// Load all built-in plugins at startup
await pluginManager.loadPlugin(new NoteMCPServerPlugin());
await pluginManager.loadPlugin(new WebSearchMCPServerPlugin());
await pluginManager.loadPlugin(new EdgeTTSBackendPlugin());
await pluginManager.loadPlugin(new QwenTTSBackendPlugin());
await pluginManager.loadPlugin(new PPTViewPlugin());
await pluginManager.loadPlugin(new QuizViewPlugin());

// Get all MCP tools from all MCP plugins
const allTools = pluginRegistry
  .getMCPServers()
  .flatMap(server => server.getTools());

// Get all TTS backends
const ttsBackends = pluginRegistry.getPluginsByType<TTSBackendPlugin>('tts-backend');

// Select TTS backend
const selectedBackend = ttsBackends.find(b => b.metadata.id === 'tts-edge');
const audio = await selectedBackend.synthesize(text, config);
```

### Benefits of Plugin Architecture

1. **Loose Coupling**: Each plugin is independent and can be enabled/disabled
2. **Easy Configuration**: Each plugin has its own config schema
3. **Extensibility**: Easy to add new TTS backends or quiz providers
4. **Maintainability**: Changes to one plugin don't affect others
5. **User Control**: Users can enable/disable plugins in settings

### Global Settings Integration

Each plugin registers its configuration schema in `metadata.configSchema`. The Global Settings View reads these schemas and generates UI automatically:

```typescript
// Global settings reads plugin config schemas
function PluginConfigPanel({ plugin }) {
  const schema = plugin.metadata.configSchema;
  // Auto-generate form from schema
  return <ConfigForm schema={schema} />;
}
```

---

## MCP Tool Calling Infrastructure

### Overview

Replace manual keyword detection with proper MCP tool calling. The AI decides when to use tools based on function calling capabilities.

### Implementation Steps

#### Step 1: Enhance AI Provider Interface

**File**: `src/infrastructure/ai-providers/base-provider.ts`

```typescript
export interface AIProvider {
  name: string
  chat(messages: ChatMessage[], config: AIConfig): Promise<string>
  streamChat(messages: ChatMessage[], config: AIConfig, onChunk: (chunk: string) => void | Promise<void>): Promise<void>
  streamChatWithThinking?(messages: ChatMessage[], config: AIConfig, onChunk: (chunk: string) => void | Promise<void>, onThinking: (thinking: string) => void | Promise<void>): Promise<void>
  
  // NEW: Tool calling support
  supportsNativeFunctionCalling?(): boolean
  chatWithTools?(messages: ChatMessage[], config: AIConfig, tools: MCPTool[]): Promise<ChatWithToolsResult>
  streamChatWithTools?(messages: ChatMessage[], config: AIConfig, tools: MCPTool[], onChunk: (chunk: string) => void, onToolCall: (toolCall: ToolCall) => void): Promise<void>
}

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface ChatWithToolsResult {
  content: string
  toolCalls?: ToolCall[]
}
```

#### Step 2: Add MCP Tools as Individual Plugins

Instead of one monolithic MCP plugin, we create individual plugins for each tool category:

**File**: `src/plugins/mcp-tools/note-mcp-plugin.ts`

```typescript
export class NoteMCPServerPlugin implements MCPServerPlugin {
  metadata = {
    id: 'mcp-notes',
    name: 'Notes MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'MCP tools for note operations',
    configSchema: {
      requireConfirmationForModify: { type: 'boolean', default: true }
    }
  };

  getServerName(): string {
    return 'notes-mcp';
  }

  getTools(): MCPTool[] {
    return [
      {
        name: "get_note",
        description: "Retrieve a specific note by ID",
        parameters: [
          { name: "note_id", type: "string", required: true }
        ]
      },
      {
        name: "search_notes",
        description: "Search notes by query",
        parameters: [
          { name: "query", type: "string", required: true },
          { name: "topic_id", type: "string", required: false },
          { name: "note_type", type: "string", enum: ["note", "ai-note", "all"], default: "all" }
        ]
      },
      {
        name: "list_notes",
        description: "List all notes",
        parameters: [
          { name: "topic_id", type: "string", required: false },
          { name: "note_type", type: "string", enum: ["note", "ai-note", "all"], default: "all" },
          { name: "limit", type: "number", default: 20 }
        ]
      },
      {
        name: "create_note",
        description: "Create a new note (requires user confirmation)",
        parameters: [
          { name: "title", type: "string", required: true },
          { name: "content", type: "string", required: true },
          { name: "topic_id", type: "string", required: false },
          { name: "note_type", type: "string", enum: ["note", "ai-note"], default: "note" }
        ]
      },
      {
        name: "update_note",
        description: "Update an existing note (requires user confirmation)",
        parameters: [
          { name: "note_id", type: "string", required: true },
          { name: "content", type: "string", required: true }
        ]
      },
      {
        name: "delete_note",
        description: "Delete a note (requires user confirmation)",
        parameters: [
          { name: "note_id", type: "string", required: true }
        ]
      }
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    // Implementation with user confirmation for write operations
  }
}
```

**File**: `src/plugins/mcp-tools/web-search-mcp-plugin.ts`

```typescript
export class WebSearchMCPServerPlugin implements MCPServerPlugin {
  metadata = {
    id: 'mcp-web-search',
    name: 'Web Search MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'MCP tools for web search and content fetching',
    configSchema: {
      maxResults: { type: 'number', default: 10 },
      autoTrigger: { type: 'object', default: {} }
    }
  };

  getTools(): MCPTool[] {
    return [
      {
        name: "web_search",
        description: "Search the web for information, latest developments, or examples",
        parameters: [
          { name: "query", type: "string", required: true },
          { name: "max_results", type: "number", required: false, default: 5 },
          { name: "search_type", type: "string", enum: ["general", "latest", "examples", "quiz_questions"], default: "general" }
        ]
      },
      {
        name: "fetch_web_content",
        description: "Fetch content from a URL",
        parameters: [
          { name: "url", type: "string", required: true }
        ]
      }
    ];
  }
}
```

**File**: `src/plugins/mcp-tools/classroom-mcp-plugin.ts`

```typescript
export class ClassroomMCPServerPlugin implements MCPServerPlugin {
  metadata = {
    id: 'mcp-classroom',
    name: 'Classroom MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'MCP tools for classroom mode (PPT, quiz, control)',
    configSchema: {
      autoSummary: { type: 'boolean', default: true }
    }
  };

  getTools(): MCPTool[] {
    return [
      {
        name: "generate_ppt_slide",
        description: "Generate a presentation slide with key points",
        parameters: [
          { name: "page_number", type: "number", required: true },
          { name: "section_title", type: "string", required: true },
          { name: "max_key_points", type: "number", default: 5 }
        ]
      },
      {
        name: "generate_quiz",
        description: "Generate quiz questions from document content or web search",
        parameters: [
          { name: "num_questions", type: "number", required: true },
          { name: "difficulty", type: "string", enum: ["easy", "medium", "hard", "mixed"], required: true },
          { name: "scope", type: "string", enum: ["current_page", "entire_document"], required: true },
          { name: "question_types", type: "array", items: "string", enum: ["multiple_choice", "short_answer", "essay"] },
          { name: "use_web_search", type: "boolean", default: true },
          { name: "web_search_topics", type: "array", items: "string" }
        ]
      },
      {
        name: "evaluate_quiz",
        description: "Evaluate quiz answers and provide feedback",
        parameters: [
          { name: "quiz_id", type: "string", required: true },
          { name: "answers", type: "array", required: true }
        ]
      },
      {
        name: "classroom_control",
        description: "Control classroom mode",
        parameters: [
          { name: "action", type: "string", enum: ["next_page", "prev_page", "pause", "resume", "get_status"], required: true }
        ]
      },
      {
        name: "generate_summary",
        description: "Generate a concise summary of document section or lecture",
        parameters: [
          { name: "scope", type: "string", enum: ["current_page", "section", "entire_document"], required: true },
          { name: "summary_type", type: "string", enum: ["brief", "detailed", "key_points"], default: "key_points" },
          { name: "max_length", type: "number", default: 500 }
        ]
      },
      {
        name: "generate_examples",
        description: "Generate real-world examples or code snippets for concepts",
        parameters: [
          { name: "concept", type: "string", required: true },
          { name: "example_type", type: "string", enum: ["real_world", "code", "math", "analogy"], required: true },
          { name: "num_examples", type: "number", default: 3 }
        ]
      },
      {
        name: "generate_discussion_prompts",
        description: "Generate open-ended discussion questions for critical thinking",
        parameters: [
          { name: "topic", type: "string", required: true },
          { name: "num_prompts", type: "number", default: 3 },
          { name: "depth", type: "string", enum: ["basic", "intermediate", "advanced"], default: "intermediate" }
        ]
      },
      {
        name: "generate_flashcards",
        description: "Generate flashcards from lecture content for review",
        parameters: [
          { name: "scope", type: "string", enum: ["current_page", "entire_document"], required: true },
          { name: "num_cards", type: "number", default: 10 },
          { name: "format", type: "string", enum: ["question_answer", "term_definition"], default: "question_answer" }
        ]
      }
    ];
  }
}
```

**File**: `src/plugins/mcp-tools/tts-mcp-plugin.ts`

```typescript
export class TTSMCPServerPlugin implements MCPServerPlugin {
  metadata = {
    id: 'mcp-tts',
    name: 'TTS MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'MCP tools for text-to-speech',
    configSchema: {
      defaultBackend: { type: 'string', default: 'tts-edge' },
      defaultVoice: { type: 'string', default: 'en-US-AriaNeural' },
      defaultSpeed: { type: 'number', default: 1.0 }
    }
  };

  getTools(): MCPTool[] {
    return [
      {
        name: "tts_speak",
        description: "Convert text to speech",
        parameters: [
          { name: "text", type: "string", required: true },
          { name: "backend", type: "string", enum: ["tts-edge", "tts-qwen", "tts-system"], default: "tts-edge" },
          { name: "voice", type: "string", required: false },
          { name: "speed", type: "number", default: 1.0 },
          { name: "stream", type: "boolean", default: true }
        ]
      },
      {
        name: "tts_stop",
        description: "Stop current TTS playback",
        parameters: []
      }
    ];
  }
}
```

**Plugin Registration:**

```typescript
// src/plugins/index.ts
export function registerAllPlugins() {
  // MCP Plugins
  pluginManager.loadPlugin(new NoteMCPServerPlugin());
  pluginManager.loadPlugin(new WebSearchMCPServerPlugin());
  pluginManager.loadPlugin(new ClassroomMCPServerPlugin());
  pluginManager.loadPlugin(new TTSMCPServerPlugin());
  
  // TTS Backend Plugins
  pluginManager.loadPlugin(new EdgeTTSBackendPlugin());
  pluginManager.loadPlugin(new QwenTTSBackendPlugin());
  
  // View Plugins
  pluginManager.loadPlugin(new PPTViewPlugin());
  pluginManager.loadPlugin(new QuizViewPlugin());
}
```

**Getting All Tools:**

```typescript
// When sending to LLM, aggregate all tools from all MCP plugins
function getAllMCPTools(): MCPTool[] {
  return pluginRegistry
    .getMCPServers()
    .flatMap(server => server.getTools());
}
        parameters: [
          { name: "text", type: "string", required: true },
          { name: "backend", type: "string", enum: ["edge_tts", "qwen_tts", "system"], default: "edge_tts" },
          { name: "voice", type: "string", required: false },
          { name: "speed", type: "number", default: 1.0 },
          { name: "stream", type: "boolean", default: true }
        ]
      },
      {
        name: "tts_stop",
        description: "Stop current TTS playback",
        parameters: []
      }
    ]
  }
  
  get classroomTools(): MCPTool[] {
    return [
      {
        name: "generate_ppt_slide",
        description: "Generate a presentation slide with key points",
        parameters: [
          { name: "page_number", type: "number", required: true },
          { name: "section_title", type: "string", required: true },
          { name: "max_key_points", type: "number", default: 5 }
        ]
      },
      {
        name: "generate_quiz",
        description: "Generate quiz questions from document content or web search",
        parameters: [
          { name: "num_questions", type: "number", required: true },
          { name: "difficulty", type: "string", enum: ["easy", "medium", "hard", "mixed"], required: true },
          { name: "scope", type: "string", enum: ["current_page", "entire_document"], required: true },
          { name: "question_types", type: "array", items: "string", enum: ["multiple_choice", "short_answer", "essay"] },
          { name: "use_web_search", type: "boolean", default: true },
          { name: "web_search_topics", type: "array", items: "string" }
        ]
      },
      {
        name: "evaluate_quiz",
        description: "Evaluate quiz answers and provide feedback",
        parameters: [
          { name: "quiz_id", type: "string", required: true },
          { name: "answers", type: "array", required: true }
        ]
      },
      {
        name: "classroom_control",
        description: "Control classroom mode",
        parameters: [
          { name: "action", type: "string", enum: ["next_page", "prev_page", "pause", "resume", "get_status"], required: true }
        ]
      },
      {
        name: "generate_summary",
        description: "Generate a concise summary of document section or lecture",
        parameters: [
          { name: "scope", type: "string", enum: ["current_page", "section", "entire_document"], required: true },
          { name: "summary_type", type: "string", enum: ["brief", "detailed", "key_points"], default: "key_points" },
          { name: "max_length", type: "number", default: 500 }
        ]
      },
      {
        name: "generate_examples",
        description: "Generate real-world examples or code snippets for concepts",
        parameters: [
          { name: "concept", type: "string", required: true },
          { name: "example_type", type: "string", enum: ["real_world", "code", "math", "analogy"], required: true },
          { name: "num_examples", type: "number", default: 3 }
        ]
      },
      {
        name: "generate_discussion_prompts",
        description: "Generate open-ended discussion questions for critical thinking",
        parameters: [
          { name: "topic", type: "string", required: true },
          { name: "num_prompts", type: "number", default: 3 },
          { name: "depth", type: "string", enum: ["basic", "intermediate", "advanced"], default: "intermediate" }
        ]
      },
      {
        name: "generate_flashcards",
        description: "Generate flashcards from lecture content for review",
        parameters: [
          { name: "scope", type: "string", enum: ["current_page", "entire_document"], required: true },
          { name: "num_cards", type: "number", default: 10 },
          { name: "format", type: "string", enum: ["question_answer", "term_definition"], default: "question_answer" }
        ]
      }
    ]
  }
}
```

#### Step 3: Update AIView Chat Flow

**File**: `src/presentation/components/views/ai-view/AIView.tsx`

**Current Flow** (keyword detection):
```typescript
if (lowerMessage.includes('search') || lowerMessage.includes('look up')) {
  additionalContext = await handleWebSearch(query)
}
```

**New Flow** (tool calling):
```typescript
async function handleSend() {
  // 1. Get available tools
  const mcpServers = pluginRegistry.getMCPServers();
  const tools = mcpServers.flatMap(server => server.getTools());
  
  // 2. Send message with tools to LLM
  const provider = getProvider(config.provider);
  
  if (provider.supportsNativeFunctionCalling?.()) {
    // Use native function calling
    const result = await provider.chatWithTools!(messages, config, tools);
    
    // Execute tool calls if any
    if (result.toolCalls) {
      for (const toolCall of result.toolCalls) {
        const toolResult = await executeTool(toolCall.name, toolCall.arguments);
        // Add result to messages and continue conversation
      }
    }
  } else {
    // Use prompt-based fallback
    const result = await handlePromptBasedToolCalling(messages, tools);
    // ...
  }
}
```

#### Step 4: Implement Prompt-Based Tool Calling

**File**: `src/infrastructure/ai-providers/tool-calling.ts`

```typescript
export class PromptBasedToolCallingWrapper implements AIProvider {
  constructor(private provider: AIProvider) {}
  
  async chatWithTools(messages: ChatMessage[], config: AIConfig, tools: MCPTool[]): Promise<ChatWithToolsResult> {
    // Build system prompt with tool definitions
    const systemPrompt = this.buildToolPrompt(tools);
    
    // Send to LLM with tool descriptions
    const messagesWithTools = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];
    
    const response = await this.provider.chat(messagesWithTools, config);
    
    // Parse tool calls from response
    const toolCalls = this.parseToolCalls(response);
    
    return {
      content: response, // May contain tool call + final response
      toolCalls
    };
  }
  
  private buildToolPrompt(tools: MCPTool[]): string {
    return `You have access to the following tools:

${tools.map(tool => {
  return `${tool.name}: ${tool.description}
Parameters:
${tool.parameters.map(p => `  - ${p.name} (${p.type})${p.required ? ' [required]' : ''}: ${p.description}`).join('\n')}`;
}).join('\n\n')}

When you need to use a tool, respond with JSON in this exact format:
{"tool_call": {"name": "tool_name", "parameters": {"param1": "value1"}}}

If no tool is needed, respond normally without JSON.

Available tools list: ${tools.map(t => t.name).join(', ')}`;
  }
  
  private parseToolCalls(response: string): ToolCall[] {
    const toolCallRegex = /\{"tool_call":\s*\{[^}]+\}\}/g;
    const matches = response.match(toolCallRegex);
    
    if (!matches) return [];
    
    return matches.map(match => {
      const parsed = JSON.parse(match);
      return parsed.tool_call;
    });
  }
}
```

---

## Web Search Integration

### Overview

Web search is integrated throughout the application to enhance learning with:
- Latest developments and current trends
- Real-world examples and case studies
- Diverse quiz questions
- Cross-referenced facts and data
- Extended lecture points

### Auto-Trigger Conditions

Web search is automatically triggered when:

| Condition | Example | Action |
|-----------|---------|--------|
| Time-sensitive topics | "latest AI trends", "current developments" | Search for recent articles |
| Quiz generation (hard) | Difficulty = hard | Search for challenging questions |
| Real-world examples | "give me an example" | Search for case studies |
| Fact verification | "is this correct" | Cross-reference sources |
| Extended learning | "tell me more about" | Find additional resources |

### Implementation

**File**: `src/plugins/mcp-tools/web-search-handler.ts`

```typescript
export type SearchType = 'general' | 'latest' | 'examples' | 'quiz_questions';

export interface SearchResult {
  title: string
  url: string
  snippet: string
  publishedDate?: string
}

export class WebSearchHandler {
  async executeSearch(query: string, searchType: SearchType): Promise<SearchResult[]> {
    // Enhance query based on search type
    const enhancedQuery = this.enhanceQuery(query, searchType);
    
    const results = await invoke<string>('search_web', { 
      query: enhancedQuery,
      max_results: 10 
    });
    
    return this.processResults(results, searchType);
  }
  
  private enhanceQuery(query: string, searchType: SearchType): string {
    switch (searchType) {
      case 'latest':
        return `${query} 2024 2025 latest developments`;
      case 'examples':
        return `${query} real world examples case studies`;
      case 'quiz_questions':
        return `${query} quiz questions practice problems`;
      case 'general':
      default:
        return query;
    }
  }
  
  private processResults(results: string, searchType: SearchType): SearchResult[] {
    // Parse and format results based on search type
    // Return structured SearchResult array
    const parsed = JSON.parse(results);
    return parsed.map((item: any) => ({
      title: item.title,
      url: item.url,
      snippet: item.body,
      publishedDate: item.date
    }));
  }
}
```

### Web Search Configuration

**File**: `src/domain/models/web-search-config.ts`

```typescript
export interface WebSearchConfig {
  enabled: boolean
  maxResults: number
  autoTrigger: {
    timeSensitiveTopics: boolean    // "latest developments"
    quizGeneration: boolean         // Hard questions from web
    realWorldExamples: boolean     // "give me an example"
    factVerification: boolean      // "is this correct"
  }
  searchTypes: {
    general: boolean
    latest: boolean
    examples: boolean
    quizQuestions: boolean
  }
}

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  enabled: true,
  maxResults: 10,
  autoTrigger: {
    timeSensitiveTopics: true,
    quizGeneration: true,
    realWorldExamples: true,
    factVerification: true,
  },
  searchTypes: {
    general: true,
    latest: true,
    examples: true,
    quizQuestions: true,
  }
}
```

---

## Note Integration via MCP

### Overview

Notes are accessed via MCP tools. AI can read notes freely but needs user confirmation to create/update/delete.

### Tool Definitions

| Tool | Description | User Confirmation |
|------|-------------|-------------------|
| `get_note` | Get note by ID | No |
| `search_notes` | Search notes by query | No |
| `list_notes` | List all notes | No |
| `create_note` | Create new note | Yes |
| `update_note` | Update existing note | Yes |
| `delete_note` | Delete a note | Yes |

### Implementation

**File**: `src/plugins/mcp-tools/note-tool-handler.ts`

```typescript
export class NoteToolHandler {
  constructor(private noteStore: typeof useNoteStore) {}
  
  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    const requiresConfirmation = ['create_note', 'update_note', 'delete_note'].includes(toolName);
    
    // For modification tools, check user confirmation
    if (requiresConfirmation) {
      const confirmed = await this.showUserConfirmation(toolName, params);
      if (!confirmed) {
        return {
          success: false,
          error: "User declined to execute tool"
        };
      }
    }
    
    switch (toolName) {
      case 'get_note':
        return this.getNote(params.note_id as string);
      case 'search_notes':
        return this.searchNotes(params.query as string, params.topic_id as string | undefined);
      case 'list_notes':
        return this.listNotes(params.topic_id as string | undefined, params.note_type as string);
      case 'create_note':
        return this.createNote(params);
      case 'update_note':
        return this.updateNote(params.note_id as string, params.content as string);
      case 'delete_note':
        return this.deleteNote(params.note_id as string);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }
  
  private async showUserConfirmation(toolName: string, params: Record<string, unknown>): Promise<boolean> {
    // Show dialog to user
    // This could be a modal, toast, or confirmation dialog
    return new Promise(resolve => {
      // Implementation depends on UI framework
      // For now, return true for demo
      resolve(true);
    });
  }
}
```

### User Confirmation UI

**Design Options**:
1. **Toast with buttons**: Show toast notification with "Confirm" and "Cancel" buttons
2. **Dialog modal**: Show confirmation dialog before executing
3. **Inline**: Highlight tool call in chat with confirmation buttons

**Recommendation**: Toast notification that auto-expires after 30 seconds if no response.

---

## TTS Integration

### Architecture (Plugin-Based)

```
┌─────────────────────────────────────────────────────────┐
│              TypeScript (Frontend)                      │
│  ├─ TTS MCP Plugin (tts-mcp-plugin.ts)                │
│  ├─ TTS Backend Plugins (via Plugin Registry)          │
│  ├─ Audio Player (Web Audio API)                       │
│  └─ TTS Manager (selects backend plugin)              │
└──────────────────┬──────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
┌────▼────┐   ┌───▼─────┐   ┌──▼──────────┐
│ EdgeTTS │   │ QwenTTS │   │ SystemTTS   │
│ Plugin  │   │ Plugin  │   │ Plugin      │
└────┬────┘   └────┬────┘   └─────┬────────┘
     │             │              │
     │             │    ┌─────────┴────────┐
     │             │    │                  │
┌────▼─────────────▼───▼──────────────────▼───────────┐
│              Rust (Tauri Backend)                     │
│  ├─ tts_speak command (routes to backend)            │
│  ├─ Edge TTS Client (HTTP API)                       │
│  ├─ Qwen TTS Server Client (HTTP/WebSocket)          │
│  └─ Audio caching                                    │
└──────────────────────────────────────────────────────┘
```

### New Plugin Type: TTS Backend

First, add the new plugin type to `src/domain/models/plugin.ts`:

```typescript
export type PluginType = 
  | 'view' 
  | 'file-handler' 
  | 'action' 
  | 'ai-provider' 
  | 'mcp-server'
  | 'tts-backend';  // NEW

export interface TTSBackendPlugin extends Plugin {
  type: 'tts-backend';
  getBackendName(): string;
  synthesize(text: string, config?: TTSConfig): Promise<AudioData>;
  streamSynthesize?(text: string, onChunk: (chunk: AudioChunk) => void): Promise<void>;
  getAvailableVoices?(): VoiceInfo[];
  getSupportedLanguages?(): string[];
  canHandle?(config: TTSConfig): boolean;
}
```

### TTS Backend Plugins

**File**: `src/plugins/tts-backends/edge-tts-backend.ts`

```typescript
export class EdgeTTSBackendPlugin implements TTSBackendPlugin {
  metadata = {
    id: 'tts-edge',
    name: 'Edge TTS',
    type: 'tts-backend',
    version: '1.0.0',
    description: 'Microsoft Edge Text-to-Speech - High quality neural voices',
    author: 'StudyPal Team',
    configSchema: {
      voice: { type: 'string', default: 'en-US-AriaNeural' },
      speed: { type: 'number', default: 1.0 },
      outputFormat: { type: 'string', default: 'audio-24khz-48kbitrate-mono-mp3' }
    }
  };

  getBackendName(): string {
    return 'Edge TTS';
  }

  async synthesize(text: string, config?: TTSConfig): Promise<AudioData> {
    const voice = config?.voice || this.metadata.configSchema.voice.default;
    const speed = config?.speed || this.metadata.configSchema.speed.default;
    
    // Call Edge TTS API via Rust backend
    return await invoke('tts_speak', {
      request: {
        text,
        backend: 'edge_tts',
        voice,
        speed
      }
    });
  }

  async streamSynthesize(text: string, onChunk: (chunk: AudioChunk) => void): Promise<void> {
    // Streaming via Tauri events
    await invoke('tts_stream', {
      text,
      backend: 'edge_tts',
      voice: this.metadata.configSchema.voice.default,
      speed: this.metadata.configSchema.speed.default
    });
    // Listen for 'tts-audio-chunk' events
  }

  getAvailableVoices(): VoiceInfo[] {
    return [
      { id: 'en-US-AriaNeural', name: 'Aria', language: 'en-US', gender: 'Female' },
      { id: 'en-US-GuyNeural', name: 'Guy', language: 'en-US', gender: 'Male' },
      { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', language: 'zh-CN', gender: 'Female' },
      // ... more voices
    ];
  }
}
```

**File**: `src/plugins/tts-backends/qwen-tts-backend.ts`

```typescript
export class QwenTTSBackendPlugin implements TTSBackendPlugin {
  metadata = {
    id: 'tts-qwen',
    name: 'Qwen TTS',
    type: 'tts-backend',
    version: '1.0.0',
    description: 'Alibaba Qwen Text-to-Speech - Highest quality (requires server)',
    author: 'StudyPal Team',
    dependencies: ['tts-server-proxy'],  // Optional
    configSchema: {
      serverUrl: { type: 'string', default: 'http://localhost:8083' },
      speaker: { type: 'string', default: 'Vivian' },
      modelType: { type: 'string', default: 'custom_voice_0.6b' },
      useStreaming: { type: 'boolean', default: true }
    }
  };

  getBackendName(): string {
    return 'Qwen TTS';
  }

  async synthesize(text: string, config?: TTSConfig): Promise<AudioData> {
    // Call Qwen TTS server
    const serverUrl = config?.serverUrl || this.metadata.configSchema.serverUrl.default;
    
    const response = await fetch(`${serverUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        speaker: config?.speaker || this.metadata.configSchema.speaker.default,
        model_type: config?.modelType || this.metadata.configSchema.modelType.default
      })
    });
    
    const audioBuffer = await response.arrayBuffer();
    return {
      format: 'mp3',
      data: btoa(String.fromCharCode(...new Uint8Array(audioBuffer))),
      duration_ms: 0  // Calculate from buffer
    };
  }

  getAvailableVoices(): VoiceInfo[] {
    return [
      { id: 'Vivian', name: 'Vivian', language: 'en', gender: 'Female' },
      { id: 'Serena', name: 'Serena', language: 'en', gender: 'Female' },
      { id: 'Uncle_Fu', name: 'Uncle Fu', language: 'zh', gender: 'Male' },
      { id: 'Ryan', name: 'Ryan', language: 'en', gender: 'Male' },
      { id: 'Aiden', name: 'Aiden', language: 'en', gender: 'Male' },
    ];
  }
}
```

### TTS Manager

**File**: `src/infrastructure/tts/tts-manager.ts`

```typescript
class TTSManager {
  private backends: Map<string, TTSBackendPlugin> = new Map();
  private currentBackend: TTSBackendPlugin | null = null;

  async initialize() {
    // Get all TTS backend plugins
    const backends = pluginRegistry.getPluginsByType<TTSBackendPlugin>('tts-backend');
    
    // Register each backend
    for (const backend of backends) {
      this.backends.set(backend.metadata.id, backend);
    }
    
    // Set default backend
    const defaultBackend = this.backends.get('tts-edge');
    if (defaultBackend) {
      this.currentBackend = defaultBackend;
    }
  }

  async synthesize(text: string, config?: TTSConfig): Promise<AudioData> {
    const backendId = config?.backend || this.currentBackend?.metadata.id || 'tts-edge';
    const backend = this.backends.get(backendId);
    
    if (!backend) {
      throw new Error(`TTS backend not found: ${backendId}`);
    }
    
    return backend.synthesize(text, config);
  }

  async streamSynthesize(
    text: string, 
    onChunk: (chunk: AudioChunk) => void,
    config?: TTSConfig
  ): Promise<void> {
    const backendId = config?.backend || this.currentBackend?.metadata.id || 'tts-edge';
    const backend = this.backends.get(backendId);
    
    if (!backend?.streamSynthesize) {
      // Fallback to non-streaming
      const audio = await this.synthesize(text, config);
      onChunk({ data: audio.data, done: true });
      return;
    }
    
    return backend.streamSynthesize(text, onChunk);
  }

  setBackend(backendId: string): void {
    const backend = this.backends.get(backendId);
    if (backend) {
      this.currentBackend = backend;
    }
  }

  getAvailableBackends(): TTSBackendPlugin[] {
    return Array.from(this.backends.values());
  }
}

export const ttsManager = new TTSManager();
```

### Rust Backend Implementation

**File**: `src-tauri/src/tts.rs`

```rust
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioData {
    pub format: String,  // "wav", "mp3"
    pub data: String,    // Base64 encoded
    pub duration_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TTSRequest {
    pub text: String,
    pub backend: String,  // "edge_tts", "qwen_tts", "system"
    pub voice: Option<String>,
    pub speed: Option<f32>,
}

#[tauri::command]
pub async fn tts_speak(request: TTSRequest) -> Result<AudioData, String> {
    match request.backend.as_str() {
        "edge_tts" => edge_tts_synthesize(&request).await,
        "qwen_tts" => qwen_tts_synthesize(&request).await,
        "system" => system_tts_synthesize(&request).await,
        _ => Err(format!("Unknown backend: {}", request.backend)),
    }
}

async fn edge_tts_synthesize(request: &TTSRequest) -> Result<AudioData, String> {
    // Use edge-tts CLI or HTTP API
    // Download MP3, convert to WAV if needed
    // Return Base64 encoded audio
}

async fn qwen_tts_synthesize(request: &TTSRequest) -> Result<AudioData, String> {
    // Connect to Qwen TTS server
    // Send request via HTTP/WebSocket
    // Receive audio response
    // Return Base64 encoded audio
}

async fn system_tts_synthesize(request: &TTSRequest) -> Result<AudioData, String> {
    // Platform-specific TTS
    // macOS: say command
    // Linux: espeak
    // Windows: SAPI
}
```

### TTS Streaming (for Classroom Mode)

**File**: `src-tauri/src/tts_stream.rs`

```rust
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn tts_stream(
    app_handle: AppHandle,
    text: String,
    backend: String,
    voice: Option<String>,
    speed: Option<f32>,
) -> Result<(), String> {
    // Similar to tts_speak but streams audio chunks
    // Emits "tts-audio-chunk" events to frontend
    
    match backend.as_str() {
        "edge_tts" => edge_tts_stream(&app_handle, &text, voice, speed).await,
        "qwen_tts" => qwen_tts_stream(&app_handle, &text, voice, speed).await,
        _ => Err(format!("Streaming not supported for: {}", backend)),
    }
}
```

### TypeScript Audio Player

**File**: `src/infrastructure/tts/audio-player.ts`

```typescript
export class TTSAudioPlayer {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  
  async play(audioData: AudioData): Promise<void> {
    // Stop any current playback
    this.stop();
    
    // Decode Base64 audio
    const audioBuffer = await this.decodeAudio(audioData.data);
    
    // Create source node
    this.sourceNode = this.audioContext!.createBufferSource();
    this.sourceNode.buffer = audioBuffer;
    this.sourceNode.connect(this.audioContext!.destination);
    
    // Start playback
    this.sourceNode.start();
    this.isPlaying = true;
  }
  
  stop(): void {
    if (this.sourceNode) {
      this.sourceNode.stop();
      this.sourceNode = null;
    }
    this.isPlaying = false;
  }
  
  pause(): void {
    // Implementation for pause
  }
  
  resume(): void {
    // Implementation for resume
  }
  
  setVolume(volume: number): void {
    // Set gain node volume
  }
  
  private async decodeAudio(base64Data: string): Promise<AudioBuffer> {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return await this.audioContext!.decodeAudioData(bytes.buffer);
  }
}
```

### Edge TTS Voices

| Voice ID | Name | Language |
|-----------|------|----------|
| en-US-AriaNeural | Aria | English (US) |
| en-US-GuyNeural | Guy | English (US) |
| en-GB-SoniaNeural | Sonia | English (UK) |
| zh-CN-XiaoxiaoNeural | Xiaoxiao | Chinese (Simplified) |
| zh-CN-YunjianNeural | Yunjian | Chinese (Simplified) |
| ja-JP-NanamiNeural | Nanami | Japanese |
| ko-KR-SunHiNeural | SunHi | Korean |

### Qwen TTS Speakers

| Speaker ID | Name | Description |
|------------|------|-------------|
| Vivian | Vivian | Bright, slightly edgy young female |
| Serena | Serena | Warm, gentle young female |
| Uncle_Fu | Uncle Fu | Seasoned male with low, mellow timbre |
| Ryan | Ryan | Dynamic male voice with strong rhythmic drive |
| Aiden | Aiden | Sunny American male voice |

---

## Classroom Mode

### Overview

Classroom Mode simulates a live teaching setting with:
- **PPT View**: Key points/slides generated from document
- **Document View**: Original document text
- **Chat View**: Teacher's (AI) transcript
- **Note View**: User's notes

### UI Layout

```
┌────────────────────────────────────────────────────────────────┐
│  StudyPal - Classroom Mode                    [Exit Classroom] │
├────────────────────────────────┬───────────────────────────────┤
│                                │                               │
│                                │                               │
│        PPT VIEW (60%)          │     DOCUMENT VIEW (40%)       │
│     (Key Points/Slides)        │   (Original Text/PDF)         │
│                                │                               │
│     ┌──────────────────┐       │   ┌─────────────────────┐    │
│     │ Slide Title      │       │   │ Page 1 of 10        │    │
│     │ - Point 1        │       │   │                     │    │
│     │ - Point 2        │       │   │ Content here...     │    │
│     │ - Point 3        │       │   │                     │    │
│     └──────────────────┘       │   └─────────────────────┘    │
│                                │                               │
├────────────────────────────────┼───────────────────────────────┤
│  ┌──────────────────────────────┬────────────────────────────┐ │
│  │                              │                            │ │
│  │    AI CHAT VIEW (50%)       │   NOTE VIEW (50%)          │ │
│  │  (Teacher Transcript)        │  (User Notes)              │ │
│  │                              │                            │ │
│  │  [Teacher speaking...]      │  [User types notes...]    │ │
│  │                              │                            │ │
│  └──────────────────────────────┴────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### State Management

**File**: `src/application/store/classroom-store.ts`

```typescript
interface ClassroomState {
  // Mode state
  isActive: boolean
  currentPage: number
  totalPages: number
  isPaused: boolean
  currentSection: string
  
  // Progress tracking
  coveredPages: number[]
  completionPercentage: number
  sessionStartTime: number
  totalDuration: number
  
  // Adaptive learning
  userPerformance: {
    quizScore: number
    weakTopics: string[]
    strongTopics: string[]
    topicScores: Record<string, number>
    totalQuizzes: number
  }
  
  // Recording (Phase 5)
  isRecording: boolean
  recordingPath: string | null
  
  // Content
  pptSlides: Slide[]
  teachingTranscript: string[]
  quizQuestions: QuizQuestion[]
  
  // Summaries
  sectionSummaries: Record<number, string>
  
  // TTS
  ttsSpeaking: boolean
  ttsBackend: "edge_tts" | "qwen_tts"
  ttsVoice: string
  ttsSpeed: number
  
  // Actions
  startClassroom: (documentPath: string) => Promise<void>
  stopClassroom: () => void
  nextPage: () => Promise<void>
  prevPage: () => void
  pauseClassroom: () => void
  resumeClassroom: () => void
  generateQuiz: (config: QuizGenerationConfig) => Promise<void>
  submitQuiz: (answers: Record<string, string>) => Promise<QuizResult>
  generateSummary: (page: number) => Promise<void>
  startRecording: () => void
  stopRecording: () => void
  exportSession: () => Promise<void>
}

interface Slide {
  id: string
  title: string
  keyPoints: string[]
  content: string
  pageNumber: number
}

interface QuizGenerationConfig {
  numQuestions: number
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  scope: 'current_page' | 'entire_document'
  useWebSearch: boolean
  questionTypes: ('multiple_choice' | 'short_answer' | 'essay')[]
}
```

### Enhanced Classroom Flow

```
1. User enters classroom mode (button or "let's start the class")
   ↓
2. AI generates lesson plan:
   - Analyze current page
   - Trigger web search for:
     * Latest developments (if topic is time-sensitive)
     * Real-world examples
     * Common questions
   ↓
3. Generate PPT slide:
   - Key points from material
   - Examples from web search
   - Latest developments
   ↓
4. Teach content with TTS
   ↓
5. Generate summary for current page
   → Save to notes (optional)
   ↓
6. Check for user questions
   ↓
7. Quiz generation (when requested):
   - Easy questions: from lecture material
   - Medium questions: from lecture material
   - Hard questions: web search for challenging questions
   → Mix based on difficulty config
   ↓
8. Track progress:
   - Mark page as covered
   - Update completion percentage
   - Track quiz scores
   - Identify weak topics
   ↓
9. Adaptive learning:
   - If user struggles with topic X:
     * Generate more examples
     * Simplify explanations
     * Suggest review
   ↓
10. End of session:
    - Generate overall summary
    - Export recording (if enabled)
    - Save progress
```

### Implementation Components

#### Classroom Store

```typescript
// src/application/store/classroom-store.ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export const useClassroomStore = create<ClassroomState>((set, get) => ({
  isActive: false,
  currentPage: 1,
  totalPages: 0,
  isPaused: false,
  currentSection: '',
  coveredPages: [],
  completionPercentage: 0,
  sessionStartTime: 0,
  totalDuration: 0,
  userPerformance: {
    quizScore: 0,
    weakTopics: [],
    strongTopics: [],
    topicScores: {},
    totalQuizzes: 0,
  },
  isRecording: false,
  recordingPath: null,
  pptSlides: [],
  teachingTranscript: [],
  quizQuestions: [],
  sectionSummaries: {},
  ttsSpeaking: false,
  ttsBackend: 'edge_tts',
  ttsVoice: 'en-US-AriaNeural',
  ttsSpeed: 1.0,
  
  startClassroom: async (documentPath: string) => {
    set({ 
      isActive: true, 
      currentPage: 1,
      sessionStartTime: Date.now()
    });
  },
  
  stopClassroom: () => {
    set({
      isActive: false,
      pptSlides: [],
      teachingTranscript: [],
      quizQuestions: [],
      coveredPages: [],
    });
  },
  
  nextPage: async () => {
    const { currentPage, totalPages, coveredPages } = get();
    if (currentPage < totalPages) {
      const newCoveredPages = [...coveredPages, currentPage];
      const completion = Math.round((newCoveredPages.length / totalPages) * 100);
      set({ 
        currentPage: currentPage + 1,
        coveredPages: newCoveredPages,
        completionPercentage: completion
      });
    }
  },
  
  pauseClassroom: () => {
    set({ isPaused: true });
  },
  
  resumeClassroom: () => {
    set({ isPaused: false });
  },
  
  generateQuiz: async (config: QuizGenerationConfig) => {
    // Call LLM with config to generate questions
    // Use web search for hard questions if configured
  },
  
  submitQuiz: async (answers: Record<string, string>) => {
    // Call LLM to evaluate answers
    // Update user performance tracking
  },
  
  generateSummary: async (page: number) => {
    // Generate summary for page and save to sectionSummaries
  },
  
  startRecording: () => {
    set({ isRecording: true });
  },
  
  stopRecording: () => {
    set({ isRecording: false });
  },
  
  exportSession: async () => {
    // Export audio recording + transcript + summary
  },
}))
```

#### Classroom View Component

**File**: `src/presentation/components/views/classroom-view/ClassroomView.tsx`

```typescript
import React from 'react'
import { useClassroomStore } from '../../../application/store/classroom-store'
import { PPTPanel } from './PPTPanel'
import { DocumentPanel } from './DocumentPanel'
import { ChatPanel } from './ChatPanel'
import { NotePanel } from './NotePanel'

export function ClassroomView() {
  const { isActive } = useClassroomStore()
  
  if (!isActive) return null
  
  return (
    <div className="flex flex-col h-full">
      {/* Main area: PPT + Document */}
      <div className="flex flex-1">
        <div className="w-3/5">
          <PPTPanel />
        </div>
        <div className="w-2/5">
          <DocumentPanel />
        </div>
      </div>
      
      {/* Bottom area: Chat + Notes */}
      <div className="flex h-1/2">
        <div className="w-1/2">
          <ChatPanel />
        </div>
        <div className="w-1/2">
          <NotePanel />
        </div>
      </div>
    </div>
  )
}
```

---

## Quiz System

### Quiz Configuration

**File**: `src/domain/models/quiz-config.ts`

```typescript
export interface QuizConfig {
  enabled: boolean
  
  questionSettings: {
    defaultQuestions: number
    minQuestions: number
    maxQuestions: number
  }
  
  difficulty: {
    level: 'easy' | 'medium' | 'hard' | 'mixed'
    adaptive: boolean  // Adjust based on user performance
  }
  
  sources: {
    easy: 'from_material' | 'from_web' | 'combined'
    medium: 'from_material' | 'from_web' | 'combined'
    hard: 'from_material' | 'from_web' | 'combined'
  }
  
  questionTypes: {
    multipleChoice: boolean
    shortAnswer: boolean
    essay: boolean
    code: boolean
    math: boolean
  }
  
  evaluation: {
    autoGrade: boolean
    detailedFeedback: boolean
    showCorrectAnswers: boolean
  }
}

export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  enabled: true,
  questionSettings: {
    defaultQuestions: 5,
    minQuestions: 3,
    maxQuestions: 20,
  },
  difficulty: {
    level: 'mixed',
    adaptive: true,
  },
  sources: {
    easy: 'from_material',
    medium: 'from_material',
    hard: 'from_web',  // Use web search for challenging questions
  },
  questionTypes: {
    multipleChoice: true,
    shortAnswer: true,
    essay: false,
    code: false,
    math: false,
  },
  evaluation: {
    autoGrade: true,
    detailedFeedback: true,
    showCorrectAnswers: true,
  },
}
```

### Quiz Generation Flow

```
1. User requests quiz (configurable num questions, difficulty)
   ↓
2. AI determines question sources:
   - Easy questions → from lecture material
   - Medium questions → from lecture material
   - Hard questions → web search for challenging questions
   ↓
3. Generate questions:
   - Multiple choice (with distractors)
   - Short answer
   - Essay (if enabled)
   ↓
4. Present quiz in Quiz View
   ↓
5. User submits answers
   ↓
6. AI evaluates:
   - Score calculation
   - Detailed feedback
   - Identify weak topics
   ↓
7. Update user performance tracking
   ↓
8. Show results with "Continue" button
```

### Adaptive Learning

```typescript
// In classroom-store.ts
interface UserPerformance {
  quizScore: number
  weakTopics: string[]
  strongTopics: string[]
  topicScores: Record<string, number>
  totalQuizzes: number
}

function updatePerformance(quizResult: QuizResult): void {
  const { topicScores, weakTopics, strongTopics } = get().userPerformance;
  
  // Track scores by topic
  quizResult.results.forEach(result => {
    const topic = result.questionId.split('-')[0];
    topicScores[topic] = topicScores[topic] || 0;
    topicScores[topic] += result.isCorrect ? 10 : 0;
  });
  
  // Identify weak/strong topics
  const updatedWeakTopics = Object.entries(topicScores)
    .filter(([_, score]) => score < 60)
    .map(([topic]) => topic);
    
  const updatedStrongTopics = Object.entries(topicScores)
    .filter(([_, score]) => score >= 80)
    .map(([topic]) => topic);
  
  set({
    userPerformance: {
      ...get().userPerformance,
      weakTopics: updatedWeakTopics,
      strongTopics: updatedStrongTopics,
      topicScores,
    }
  });
}
```

### Quiz View UI

```
┌────────────────────────────────────────────────────────────────┐
│  Quiz - Page 1                                    [Exit Quiz]  │
├────────────────────────────────────────────────────────────────┤
│  Difficulty: Medium  |  Questions: 5/10  |  Score: --         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Question 1: What is the main concept in this section?          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Your answer here...                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Question 2: Which of the following is TRUE?                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ( ) Option A                                             │  │
│  │ ( ) Option B                                             │  │
│  │ ( ) Option C                                             │  │
│  │ ( ) Option D                                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ...                                                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      [Submit Quiz]                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Quiz Results UI

```
┌────────────────────────────────────────────────────────────────┐
│  Quiz Results                                    [Exit Quiz]   │
├────────────────────────────────────────────────────────────────┤
│  Score: 4/5 (80%)  |  Weak Topics: [Topic A]                 │
│                                                                 │
│  ✓ Question 1: Correct!                                        │
│    Your answer: The main concept is X                          │
│                                                                 │
│  ✗ Question 2: Incorrect                                       │
│    Your answer: Option A                                       │
│    Correct answer: Option B                                     │
│    Explanation: The key difference is...                        │
│                                                                 │
│  ...                                                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    [Continue Class]                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### Quiz Store

**File**: `src/application/store/quiz-store.ts`

```typescript
interface QuizState {
  isActive: boolean
  questions: QuizQuestion[]
  answers: Record<string, string>
  results: QuizResult | null
  isEvaluating: boolean
  
  startQuiz: (config: QuizGenerationConfig) => Promise<void>
  submitAnswer: (questionId: string, answer: string) => void
  submitQuiz: () => Promise<QuizResult>
  exitQuiz: () => void
}

interface QuizQuestion {
  id: string
  question: string
  type: 'multiple_choice' | 'short_answer' | 'essay'
  options?: string[]
  expectedAnswer?: string
  difficulty: 'easy' | 'medium' | 'hard'
}

interface QuizResult {
  score: number
  totalQuestions: number
  results: QuestionResult[]
}

interface QuestionResult {
  questionId: string
  isCorrect: boolean
  userAnswer: string
  correctAnswer?: string
  explanation: string
}

interface QuizGenerationConfig {
  numQuestions: number
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  scope: 'current_page' | 'entire_document'
  useWebSearch: boolean
  questionTypes: ('multiple_choice' | 'short_answer' | 'essay')[]
}
```

---

## Global Settings View

### Overview

The Global Settings View provides a centralized place to configure all plugins and application settings. Each plugin registers its own configuration schema, which is automatically rendered in the settings UI.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Global Settings View                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ General Settings                                        │   │
│  │  ├─ Theme (light/dark/auto)                           │   │
│  │  ├─ Language                                           │   │
│  │  └─ Auto-save                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Plugin Settings                                         │   │
│  │  ├─ Notes MCP Plugin                                   │   │
│  │  │   └─ Require confirmation for modify: [Toggle]     │   │
│  │  ├─ Web Search Plugin                                  │   │
│  │  │   ├─ Max results: [Input]                          │   │
│  │  │   └─ Auto-trigger: [Checkboxes]                   │   │
│  │  ├─ TTS Backend: [Dropdown]                           │   │
│  │  │   └─ (Shows config based on selected backend)      │   │
│  │  │       ├─ Voice: [Dropdown]                         │   │
│  │  │       └─ Speed: [Slider]                           │   │
│  │  ├─ Quiz Plugin                                        │   │
│  │  │   ├─ Default questions: [Input]                   │   │
│  │  │   ├─ Difficulty: [Dropdown]                       │   │
│  │  │   └─ Adaptive learning: [Toggle]                   │   │
│  │  └─ Classroom Plugin                                   │   │
│  │      ├─ Progress tracking: [Toggle]                   │   │
│  │      └─ Auto summary: [Toggle]                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation

**File**: `src/application/store/settings-store.ts`

```typescript
interface SettingsStore {
  // Global settings
  global: {
    language: string;
    theme: 'light' | 'dark' | 'auto';
    autoSave: boolean;
  };
  
  // Plugin-specific settings (keyed by plugin ID)
  plugins: Record<string, PluginConfig>;
  
  // Actions
  updateGlobal: (settings: Partial<SettingsStore['global']>) => void;
  updatePluginConfig: (pluginId: string, config: PluginConfig) => void;
  getPluginConfig: (pluginId: string) => PluginConfig | undefined;
  resetToDefaults: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  global: {
    language: 'en',
    theme: 'auto',
    autoSave: true,
  },
  plugins: {},
  
  updateGlobal: (settings) => {
    set({ global: { ...get().global, ...settings } });
  },
  
  updatePluginConfig: (pluginId, config) => {
    set({ 
      plugins: { ...get().plugins, [pluginId]: config } 
    });
  },
  
  getPluginConfig: (pluginId) => {
    return get().plugins[pluginId];
  },
  
  resetToDefaults: () => {
    // Reset all to defaults
    set({ global: DEFAULT_GLOBAL_SETTINGS, plugins: {} });
  },
}));
```

**File**: `src/presentation/components/views/settings-view/GlobalSettingsView.tsx`

```typescript
export function GlobalSettingsView() {
  const { global, plugins, updateGlobal, updatePluginConfig } = useSettingsStore();
  const availablePlugins = pluginRegistry.getPlugins();
  
  return (
    <div className="settings-container">
      <h1>Settings</h1>
      
      {/* Global Settings Section */}
      <section>
        <h2>General</h2>
        <ThemeSelector value={global.theme} onChange={(t) => updateGlobal({ theme: t })} />
        <LanguageSelector value={global.language} onChange={(l) => updateGlobal({ language: l })} />
        <AutoSaveToggle value={global.autoSave} onChange={(v) => updateGlobal({ autoSave: v })} />
      </section>
      
      {/* Plugin Settings Section */}
      <section>
        <h2>Plugins</h2>
        {availablePlugins.map(plugin => (
          <PluginConfigPanel
            key={plugin.metadata.id}
            plugin={plugin}
            config={plugins[plugin.metadata.id]}
            onUpdate={(config) => updatePluginConfig(plugin.metadata.id, config)}
          />
        ))}
      </section>
    </div>
  );
}

function PluginConfigPanel({ plugin, config, onUpdate }) {
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  
  return (
    <div className="plugin-config-panel">
      <div className="plugin-header">
        <h3>{plugin.metadata.name}</h3>
        <Toggle
          checked={enabled}
          onChange={(checked) => {
            setEnabled(checked);
            onUpdate({ ...config, enabled: checked });
          }}
        />
      </div>
      
      <p className="plugin-description">{plugin.metadata.description}</p>
      
      {enabled && plugin.metadata.configSchema && (
        <ConfigForm
          schema={plugin.metadata.configSchema}
          values={config?.config || {}}
          onChange={(newConfig) => onUpdate({ enabled: true, config: newConfig })}
        />
      )}
    </div>
  );
}
```

**File**: `src/presentation/components/views/settings-view/ConfigForm.tsx`

```typescript
function ConfigForm({ schema, values, onChange }) {
  return (
    <div className="config-form">
      {Object.entries(schema).map(([key, field]) => (
        <div key={key} className="config-field">
          <label>{key}</label>
          {field.type === 'boolean' && (
            <Toggle
              checked={values[key] ?? field.default}
              onChange={(v) => onChange({ ...values, [key]: v })}
            />
          )}
          {field.type === 'string' && field.enum && (
            <Select
              value={values[key] ?? field.default}
              options={field.enum}
              onChange={(v) => onChange({ ...values, [key]: v })}
            />
          )}
          {field.type === 'string' && !field.enum && (
            <Input
              value={values[key] ?? field.default}
              onChange={(v) => onChange({ ...values, [key]: v })}
            />
          )}
          {field.type === 'number' && (
            <Input
              type="number"
              value={values[key] ?? field.default}
              onChange={(v) => onChange({ ...values, [key]: Number(v) })}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

### Plugin Config Schema Example

Each plugin defines its config schema in metadata:

```typescript
// Example: TTS Backend Plugin config schema
configSchema: {
  voice: { 
    type: 'string', 
    default: 'en-US-AriaNeural',
    enum: ['en-US-AriaNeural', 'en-US-GuyNeural', 'zh-CN-XiaoxiaoNeural']
  },
  speed: { 
    type: 'number', 
    default: 1.0,
    min: 0.5,
    max: 2.0
  }
}

// Example: Quiz Plugin config schema
configSchema: {
  defaultQuestions: { 
    type: 'number', 
    default: 5,
    min: 1,
    max: 20
  },
  difficulty: {
    type: 'string',
    default: 'mixed',
    enum: ['easy', 'medium', 'hard', 'mixed']
  },
  adaptiveLearning: {
    type: 'boolean',
    default: true
  }
}
```

### Navigation

The Global Settings View can be accessed:
- From the main navigation menu (new "Settings" tab)
- Via keyboard shortcut (Ctrl+, / Cmd+,)
- From the plugin toolbar (gear icon)

---

## Implementation Phases

### Phase 1: MCP Tool Calling Infrastructure (Week 1-2)

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Enhance AI Provider interface | `src/infrastructure/ai-providers/base-provider.ts` |
| 1.2 | Add new plugin types to plugin.ts (tts-backend) | `src/domain/models/plugin.ts` |
| 1.3 | Create Note MCP Plugin | `src/plugins/mcp-tools/note-mcp-plugin.ts` |
| 1.4 | Create Web Search MCP Plugin | `src/plugins/mcp-tools/web-search-mcp-plugin.ts` |
| 1.5 | Implement prompt-based tool calling | `src/infrastructure/ai-providers/tool-calling.ts` |
| 1.6 | Integrate tool calling into AIView | `src/presentation/components/views/ai-view/AIView.tsx` |
| 1.7 | Add user confirmation for note modifications | `src/plugins/mcp-tools/note-mcp-plugin.ts` |
| 1.8 | Create Global Settings infrastructure | `src/application/store/settings-store.ts` |

**Deliverable**: AI can use notes, web search, file tools via tool calling. Individual MCP plugins registered.

### Phase 2: TTS Integration (Week 2-3)

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Create Rust TTS module | `src-tauri/src/tts.rs` |
| 2.2 | Implement Edge TTS client in Rust | `src-tauri/src/tts/edge_tts.rs` |
| 2.3 | Implement Qwen TTS server client in Rust | `src-tauri/src/tts/qwen_tts.rs` |
| 2.4 | Add TTS commands to lib.rs | `src-tauri/src/lib.rs` |
| 2.5 | Create Edge TTS Backend Plugin | `src/plugins/tts-backends/edge-tts-backend.ts` |
| 2.6 | Create Qwen TTS Backend Plugin | `src/plugins/tts-backends/qwen-tts-backend.ts` |
| 2.7 | Create TTS Manager | `src/infrastructure/tts/tts-manager.ts` |
| 2.8 | Create TTS MCP Plugin | `src/plugins/mcp-tools/tts-mcp-plugin.ts` |
| 2.9 | Create TypeScript audio player | `src/infrastructure/tts/audio-player.ts` |

**Deliverable**: TTS works with Edge TTS (default) and Qwen TTS (optional) as plugins

### Phase 3: Classroom Mode (Week 3-4)

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Create classroom store (with progress tracking) | `src/application/store/classroom-store.ts` |
| 3.2 | Create classroom view layout | `src/presentation/components/views/classroom-view/` |
| 3.3 | Implement PPT View Plugin | `src/plugins/views/ppt-view-plugin.ts` |
| 3.4 | Create Classroom MCP Plugin | `src/plugins/mcp-tools/classroom-mcp-plugin.ts` |
| 3.5 | Implement web search integration | `src/plugins/mcp-tools/web-search-mcp-plugin.ts` |
| 3.6 | Integrate TTS into classroom flow | `src/application/store/classroom-store.ts` |
| 3.7 | Add classroom entry point (button + chat trigger) | `src/presentation/components/views/ai-view/` |

**Deliverable**: Classroom mode with 4-panel layout, PPT generation, page navigation, web search integration

### Phase 4: Quiz System (Week 4)

| Task | Description | Files |
|------|-------------|-------|
| 4.1 | Create quiz store (with adaptive learning) | `src/application/store/quiz-store.ts` |
| 4.2 | Create Quiz View Plugin | `src/plugins/views/quiz-view-plugin.ts` |
| 4.3 | Implement quiz functionality ( monolithic, can refactor to plugin later) | `src/application/services/quiz-service.ts` |
| 4.4 | Connect quiz to classroom flow | `src/application/store/classroom-store.ts` |
| 4.5 | Implement web search for hard questions | `src/plugins/mcp-tools/web-search-mcp-plugin.ts` |
| 4.6 | Add user performance tracking | `src/application/store/classroom-store.ts` |

**Deliverable**: Quiz generation with configurable difficulty, web search for hard questions, adaptive learning

### Phase 5: Polish & Advanced Features (Week 5)

| Task | Description | Files |
|------|-------------|-------|
| 5.1 | Native function calling (OpenAI/Anthropic) | `src/infrastructure/ai-providers/` |
| 5.2 | Tool call visualization in chat | `src/presentation/components/views/ai-view/` |
| 5.3 | Error handling and fallbacks | All files |
| 5.4 | Session recording (audio + transcript) | `src/infrastructure/tts/recorder.ts` |
| 5.5 | Export session (PDF summary + audio) | `src/application/services/export-service.ts` |
| 5.6 | Flashcard generation | `src/plugins/mcp-tools/flashcard-handler.ts` |
| 5.7 | UI polish and testing | All files |

---

## Configuration Design

### TTS Configuration

**File**: `src/domain/models/tts-config.ts`

```typescript
export interface TTSConfig {
  defaultBackend: 'edge_tts' | 'qwen_tts' | 'system'
  
  edgeTTS: {
    enabled: boolean
    defaultVoice: string
    speed: number
    languages: string[]  // Multiple language support
  }
  
  qwenTTS: {
    enabled: boolean
    serverUrl: string
    modelType: 'custom_voice_0.6b' | 'custom_voice_1.7b' | 'voice_design_1.7b'
    speaker: string
    language: string
    useStreaming: boolean
  }
  
  systemTTS: {
    enabled: boolean
    voice: string
  }
  
  autoPlayInClassroom: boolean
  volume: number
  recordSession: boolean  // NEW: Record audio for review
}

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  defaultBackend: 'edge_tts',
  edgeTTS: {
    enabled: true,
    defaultVoice: 'en-US-AriaNeural',
    speed: 1.0,
    languages: ['en-US', 'en-GB', 'zh-CN', 'ja-JP', 'ko-KR'],
  },
  qwenTTS: {
    enabled: false,
    serverUrl: 'http://localhost:8083',
    modelType: 'custom_voice_0.6b',
    speaker: 'Vivian',
    language: 'Auto',
    useStreaming: true,
  },
  systemTTS: {
    enabled: false,
    voice: '',
  },
  autoPlayInClassroom: true,
  volume: 1.0,
  recordSession: false,
}
```

### Quiz Configuration

See [Quiz System - Quiz Configuration](#quiz-configuration)

### Web Search Configuration

See [Web Search Integration - Web Search Configuration](#web-search-configuration)

### Classroom Configuration

```typescript
export interface ClassroomConfig {
  enabled: boolean
  progressTracking: boolean
  autoSummary: boolean
  recordSession: boolean
  adaptiveLearning: boolean
}

export const DEFAULT_CLASSROOM_CONFIG: ClassroomConfig = {
  enabled: true,
  progressTracking: true,
  autoSummary: true,
  recordSession: false,
  adaptiveLearning: true,
}
```

### MCP Configuration

**File**: `src/domain/models/mcp-config.ts`

```typescript
export interface MCPConfig {
  enabled: boolean
  
  noteTools: {
    enabled: boolean
    requireConfirmationForModify: boolean
  }
  
  fileTools: {
    enabled: boolean
    allowedDirectories: string[]
  }
  
  webTools: {
    enabled: boolean
    maxResults: number
    autoTrigger: {
      timeSensitiveTopics: boolean
      quizGeneration: boolean
      realWorldExamples: boolean
      factVerification: boolean
    }
  }
  
  ttsTools: {
    enabled: boolean
    defaultBackend: string
  }
  
  classroomTools: {
    enabled: boolean
  }
}
```

---

## API Specifications

### Rust TTS Commands

```rust
// src-tauri/src/tts.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct TTSRequest {
    pub text: String,
    pub backend: String,
    pub voice: Option<String>,
    pub speed: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioData {
    pub format: String,
    pub data: String,  // Base64
    pub duration_ms: u64,
}

#[tauri::command]
pub async fn tts_speak(request: TTSRequest) -> Result<AudioData, String>

#[tauri::command]
pub async fn tts_stream(
    app_handle: AppHandle,
    text: String,
    backend: String,
    voice: Option<String>,
    speed: Option<f32>,
) -> Result<(), String>

#[tauri::command]
pub async fn tts_stop() -> Result<(), String>

#[tauri::command]
pub async fn get_available_voices(backend: String) -> Result<Vec<VoiceInfo>, String>

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub language: String,
    pub gender: String,
}
```

### Tauri Events

```typescript
// Frontend listens for these events

// TTS streaming events
'tts-audio-chunk': { data: string, done: boolean }
'tts-stream-complete': { duration_ms: number }

// Chat events
'chat-stream-chunk': StreamChunk
```

---

## File Structure

```
src/
├── application/
│   ├── services/
│   │   ├── export-service.ts      # NEW (Phase 5)
│   │   └── quiz-service.ts        # NEW (Quiz functionality)
│   └── store/
│       ├── classroom-store.ts      # NEW
│       ├── quiz-store.ts          # NEW
│       ├── settings-store.ts      # NEW (Global settings)
│       └── tts-store.ts           # NEW
├── domain/
│   └── models/
│       ├── tts-config.ts          # NEW
│       ├── quiz-config.ts         # NEW
│       ├── web-search-config.ts   # NEW
│       ├── classroom-config.ts    # NEW
│       └── mcp-config.ts          # NEW
├── infrastructure/
│   ├── ai-providers/
│   │   ├── tool-calling.ts        # NEW
│   │   └── base-provider.ts       # MODIFY
│   ├── tts/
│   │   ├── tts-manager.ts        # NEW (TTS backend management)
│   │   ├── audio-player.ts       # NEW
│   │   └── recorder.ts           # NEW (Phase 5)
│   └── services/
│       └── export-service.ts      # NEW (Phase 5)
├── plugins/
│   ├── index.ts                  # NEW (Plugin registration)
│   ├── mcp-tools/
│   │   ├── note-mcp-plugin.ts    # NEW (Individual MCP plugin)
│   │   ├── web-search-mcp-plugin.ts  # NEW (Individual MCP plugin)
│   │   ├── classroom-mcp-plugin.ts   # NEW (Individual MCP plugin)
│   │   └── tts-mcp-plugin.ts    # NEW (Individual MCP plugin)
│   ├── tts-backends/
│   │   ├── edge-tts-backend.ts  # NEW (TTS backend plugin)
│   │   └── qwen-tts-backend.ts  # NEW (TTS backend plugin)
│   └── views/
│       ├── ppt-view-plugin.ts    # NEW (View plugin)
│       └── quiz-view-plugin.ts   # NEW (View plugin)
└── presentation/
    └── components/
        └── views/
            ├── settings-view/     # NEW (Global settings)
            │   ├── GlobalSettingsView.tsx
            │   ├── PluginConfigPanel.tsx
            │   └── ConfigForm.tsx
            ├── classroom-view/   # NEW
            │   ├── ClassroomView.tsx
            │   ├── PPTPanel.tsx
            │   ├── DocumentPanel.tsx
            │   ├── ChatPanel.tsx
            │   └── NotePanel.tsx
            └── quiz-view/        # NEW
                ├── QuizView.tsx
                └── QuizResults.tsx

src-tauri/src/
├── tts/                          # NEW
│   ├── mod.rs
│   ├── edge_tts.rs
│   └── qwen_tts.rs
├── tts.rs                        # NEW
└── lib.rs                        # MODIFY (add tts commands)
```

---

## Summary

This plan outlines a comprehensive implementation of:

1. **Plugin-Based Architecture**: Loosely coupled plugins for MCP tools, TTS backends, and views
2. **MCP Tool Calling Infrastructure**: AI can use tools via native function calling or prompt-based fallback
3. **Web Search Integration**: Auto-trigger for latest developments, examples, quiz questions
4. **Note Integration**: AI can access notes via MCP plugins with user confirmation for modifications
5. **TTS Integration**: Edge TTS + Qwen TTS as backend plugins with TTS Manager
6. **Classroom Mode**: 4-panel layout with PPT, document, chat, and notes as view plugins
7. **Quiz System**: Configurable questions (3-20), difficulty levels, web search for hard questions, adaptive learning
8. **Global Settings View**: Unified settings for all plugins

### Key Features Added:

- ✅ **Plugin-Based Design**: Each functional unit is a plugin (MCP, TTS Backend, View)
- ✅ **Configurable Quiz**: 3-20 questions, adjustable difficulty
- ✅ **Web Search Auto-Trigger**: For latest developments, examples, hard quiz questions
- ✅ **Adaptive Learning**: Track weak/strong topics, adjust difficulty automatically
- ✅ **Progress Tracking**: Covered pages, completion percentage, session duration
- ✅ **Summary Generation**: Auto-generate section summaries
- ✅ **Examples Generation**: Real-world examples, code snippets, analogies
- ✅ **Discussion Prompts**: Critical thinking questions
- ✅ **Flashcard Generation**: Review cards from lecture content
- ✅ **Session Recording**: Record audio + transcript (Phase 5)

The implementation is phased over 5 weeks, starting with core infrastructure and ending with polish.

---

## Next Steps

1. Review this plan and provide feedback
2. Confirm architecture decisions
3. Begin Phase 1 implementation

---

## Appendix A: Web Search Plugin for MCP and Topic-Based Workflow

### Overview

This appendix defines the enhanced web search MCP plugin implementation that supports multiple search providers and enables a topic-based workflow starting from AI chat.

### Goals

1. **Multi-Provider Search**: Support Brave, Tavily, DuckDuckGo, Serper, and custom search APIs
2. **Configurable via Global Settings**: Search provider and API keys managed in unified settings UI
3. **Topic-Based Workflow**: Start with AI chat → discover papers → download/open → switch to file view

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  AI Chat View (Frontend)                                 │
│  ┌──────────────────────────────────────────────────┐  │
│  │ User: "I want to study ResNet"                     │  │
│  │ AI: Overview + [Top Papers] with clickable links   │  │
│  │     [📄 Deep Residual Learning.pdf]                │  │
│  │     [📄 ResNet V2.pdf]                             │  │
│  └──────────────────────────────────────────────────┘  │
│                      │                                    │
│                      ▼                                    │
│  Click Paper Link ──► Download & Open ──► File View     │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Rust Backend (Tauri)                                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Web Search Command                               │  │
│  │ search_web(query, provider, api_key)             │  │
│  │ Support: brave, tavily, duckduckgo, serper       │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Paper Download Command                           │  │
│  │ download_and_open_paper(url, save_location)      │  │
│  │ Auto-detect: .pdf, arxiv.org, paperswithcode      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Implementation Phases

#### Phase 1: Web Search Configuration

**1.1 Extend Settings Store** (`src/application/store/settings-store.ts`)

```typescript
export interface GlobalSettings {
  language: string;
  theme: 'light' | 'dark' | 'auto';
  autoSave: boolean;
  webSearch: WebSearchConfig;  // NEW
}

export interface WebSearchConfig {
  provider: 'brave' | 'tavily' | 'duckduckgo' | 'serper' | 'custom';
  apiKey?: string;
  maxResults: number;
  defaultQueryType: 'general' | 'academic' | 'news';
  academicFilters?: {
    yearFrom?: number;
    yearTo?: number;
    pdfOnly: boolean;
  };
}

const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  provider: 'duckduckgo',
  maxResults: 10,
  defaultQueryType: 'academic',
  academicFilters: {
    pdfOnly: true
  }
};
```

**1.2 Create Global Settings View** (`src/presentation/components/views/settings-view/`)

New components:
- `GlobalSettingsView.tsx`: Main settings page
- `WebSearchSettings.tsx`: Web search configuration panel
- `ConfigForm.tsx`: Dynamic form based on configSchema

Features:
- Provider dropdown (Brave, Tavily, DuckDuckGo, Serper, Custom)
- API key input with visibility toggle
- Max results slider (1-50)
- Query type selector
- Academic filters (PDF-only toggle, year range)
- Test connection button

**1.3 Update Rust Backend** (`src-tauri/src/lib.rs`)

```rust
#[tauri::command]
async fn search_web(
    query: String,
    provider: String,
    api_key: Option<String>,
    max_results: Option<u32>,
    query_type: Option<String>,
) -> Result<String, String> {
    match provider.as_str() {
        "brave" => search_brave(&query, api_key, max_results).await,
        "tavily" => search_tavily(&query, api_key, max_results).await,
        "serper" => search_serper(&query, api_key, max_results).await,
        "duckduckgo" | _ => search_duckduckgo(&query, max_results).await,
    }
}

async fn search_brave(
    query: &str,
    api_key: Option<String>,
    max_results: Option<u32>,
) -> Result<String, String> {
    // Brave Search API implementation
    // Endpoint: https://api.search.brave.com/res/v1/web/search
    // Headers: X-Subscription-Token: {api_key}
}

async fn search_tavily(
    query: &str,
    api_key: Option<String>,
    max_results: Option<u32>,
) -> Result<String, String> {
    // Tavily API implementation
    // Academic search support
}
```

**1.4 Update Web Search MCP Plugin** (`src/plugins/mcp-tools/web-search-mcp-plugin.ts`)

Enhance tools:
- `web_search`: Add academic mode, PDF filtering
- `search_papers`: New tool specifically for academic papers
- `get_paper_metadata`: Extract metadata from paper URL

```typescript
getTools(): MCPTool[] {
  return [
    {
      name: 'web_search',
      description: 'Search the web for information, papers, or resources',
      parameters: [
        { name: 'query', type: 'string', required: true },
        { name: 'search_type', type: 'string', enum: ['general', 'academic', 'news'], default: 'general' },
        { name: 'pdf_only', type: 'boolean', default: false },
        { name: 'max_results', type: 'number', default: 10 }
      ]
    },
    {
      name: 'search_papers',
      description: 'Search for academic papers and research publications',
      parameters: [
        { name: 'topic', type: 'string', required: true },
        { name: 'year_from', type: 'number', required: false },
        { name: 'year_to', type: 'number', required: false },
        { name: 'max_results', type: 'number', default: 5 }
      ]
    }
  ];
}
```

#### Phase 2: Paper Download Workflow

**2.1 Smart Link Detection in Chat**

Update AI message rendering (`src/presentation/components/views/ai-view/`):

```typescript
// Detect paper links and render special UI
const PAPER_PATTERNS = [
  /arxiv\.org\/abs\/\d+/,
  /arxiv\.org\/pdf\/\d+/,
  /paperswithcode\.com\/paper\//,
  /openreview\.net\/forum\?id=/,
  /\.pdf$/i,
  /ieee\.org\/.*\/document\//,
  /acm\.org\/doi\//
];

function PaperLink({ url, title }: PaperLinkProps) {
  return (
    <div className="paper-link">
      <span className="paper-icon">📄</span>
      <span className="paper-title">{title}</span>
      <button 
        className="open-paper-btn"
        onClick={() => downloadAndOpenPaper(url)}
      >
        Open
      </button>
    </div>
  );
}
```

**2.2 Paper Download Command (Rust)**

```rust
#[tauri::command]
async fn download_and_open_paper(
    url: String,
    save_location: Option<String>,
) -> Result<DownloadResult, String> {
    // 1. Download the paper
    // 2. Save to ~/StudyMaterials/Papers/ or temp
    // 3. Return metadata (path, title, authors if available)
    // 4. Frontend opens file and switches to file view
}

#[derive(Serialize)]
struct DownloadResult {
    path: String,
    title: Option<String>,
    authors: Option<Vec<String>>,
    year: Option<u32>,
    file_size: u64,
}
```

**2.3 Workflow Integration**

```typescript
// In AIView.tsx
async function downloadAndOpenPaper(url: string) {
  try {
    const result = await invoke<DownloadResult>('download_and_open_paper', { url });
    
    // Open the downloaded file
    await openFile(result.path);
    
    // Switch to file view
    setCurrentFile({ path: result.path, name: result.title || 'Paper' });
    
    // Optional: Add note with paper metadata
    if (result.title) {
      addNote(`📄 Paper: ${result.title}`, 'paper', result.authors);
    }
  } catch (error) {
    showError('Failed to download paper: ' + error);
  }
}
```

**2.4 Chat AI Integration**

Update AI prompt to encourage paper links:

```
When the user asks to study a topic like "ResNet", you should:
1. Provide a brief overview
2. List the top 3-5 most important papers on this topic
3. For each paper, provide:
   - Title
   - Authors
   - Year
   - A clickable link (if available from search results)
   - Brief summary of key contributions

Format paper references as:
[📄 Paper Title](URL) by Authors, Year
Brief description of the paper.
```

### User Workflow Example

1. **User**: Types "I want to study ResNet" in AI chat
2. **AI**: Responds with overview and lists papers:
   - 📄 Deep Residual Learning for Image Recognition (ResNet)
     by Kaiming He et al., 2016
     [View Paper](https://arxiv.org/pdf/1512.03385.pdf)
3. **User**: Clicks "View Paper" link
4. **System**: 
   - Downloads PDF to `~/StudyMaterials/Papers/`
   - Opens PDF in file view
   - Creates note with paper metadata
   - Switches focus to file view
5. **User**: Now in file-centric workflow, can take notes, chat about specific pages

### Configuration Options

| Setting | Options | Default |
|---------|---------|---------|
| Provider | Brave, Tavily, DuckDuckGo, Serper, Custom | DuckDuckGo |
| API Key | Encrypted string | None |
| Max Results | 1-50 | 10 |
| Default Query Type | general, academic, news | academic |
| PDF Only Filter | boolean | true |
| Auto-Download Papers | boolean | false |
| Papers Save Location | Path string | ~/StudyMaterials/Papers/ |

### Security Considerations

1. **API Keys**: Store encrypted or use system keychain (Tauri secure storage)
2. **Downloads**: Validate URLs, scan for malware, limit file size
3. **Rate Limiting**: Implement per-provider rate limits
4. **Privacy**: Don't log search queries containing sensitive info

### Files to Modify/Create

**Frontend:**
- `src/application/store/settings-store.ts` - Add webSearch config
- `src/presentation/components/views/settings-view/GlobalSettingsView.tsx` - NEW
- `src/presentation/components/views/settings-view/WebSearchSettings.tsx` - NEW
- `src/presentation/components/views/ai-view/components/PaperLink.tsx` - NEW
- `src/plugins/mcp-tools/web-search-mcp-plugin.ts` - Update for multi-provider

**Backend:**
- `src-tauri/src/lib.rs` - Add search commands
- `src-tauri/src/web_search/` - NEW module
  - `mod.rs` - Module exports
  - `brave.rs` - Brave Search API
  - `tavily.rs` - Tavily API
  - `serper.rs` - Serper API
  - `duckduckgo.rs` - DuckDuckGo API
  - `paper_downloader.rs` - Paper download logic

### Dependencies

**Rust:**
```toml
[dependencies]
reqwest = { version = "0.12", features = ["json", "stream"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
urlencoding = "2.1"
```

**TypeScript:**
- Existing: `@tauri-apps/api/core`, `zustand`
- No new dependencies needed

---
