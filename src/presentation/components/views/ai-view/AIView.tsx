import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useAIChatStore } from '../../../../application/store/ai-chat-store'
import { useFileStore } from '../../../../application/store/file-store'
import { useNoteStore } from '../../../../application/store/note-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import { getProvider, AVAILABLE_PROVIDERS } from '../../../../infrastructure/ai-providers/provider-factory'
import { fetchAvailableModels, ModelInfo, getModelMaxTokens } from '../../../../infrastructure/ai-providers/model-detector'
import { getCurrentPageText, getAllPagesText } from '../../../../infrastructure/file-handlers/pdf-utils'
import { ChatMessage, AIProviderType } from '../../../../domain/models/ai-context'
import { updateAIConfig, updateProviderConfigs } from '../../../../application/services/session-manager'
import { getAllMCPTools, executeMCPTool } from '../../../../infrastructure/ai-providers/mcp-utils'
import { buildToolPrompt, parseToolCalls } from '../../../../infrastructure/ai-providers/tool-calling'
import { getProviderColor } from '../../../../application/services/provider-colors'
import { PERSONA_PROMPTS } from '../../../../domain/models/llm-pool'
import { loadProviderMemory, generateMemoryContext, extractAndStoreMemory } from '../../../../application/services/provider-memory-service'
import { PaperLink } from './components/PaperLink'
import './AIView.css'

const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32]

function AIView() {
  const {
    tabs,
    activeTabId,
    config,
    providerConfigs,
    isStreaming,
    addTab,
    removeTab,
    setActiveTab,
    renameTab,
    addMessage,
    updateMessage,
    deleteMessage,
    clearChat,
    getActiveMessages,
    setConfig,
    switchProvider,
    setStreaming,
  } = useAIChatStore()

  const { currentFile, currentPage } = useFileStore()
  const { getActiveNote, createNote, updateNoteContent, createTabForNote } = useNoteStore()
  const { activeTopicId } = useTopicStore()

  const [showConfig, setShowConfig] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [isDetectingModels, setIsDetectingModels] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  
  // Local state for real streaming (bypasses zustand batching)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingThinking, setStreamingThinking] = useState('')

  // Track discuss mode for visual grouping
  const [isDiscussMode, setIsDiscussMode] = useState(false)

  const activeMessages = getActiveMessages()
  
  const toggleThinking = (messageId: string) => {
    setExpandedThinking(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  // Rich text editor for input
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Ask a question... (try "search for...")',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'chat-editor',
      },
      handleKeyDown: (_, event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          handleSend()
          return true
        }
        return false
      },
    },
  })

  // Copy message to clipboard and optionally to editor
  const handleCopyMessage = useCallback((message: ChatMessage, insertToEditor: boolean = false) => {
    // Strip HTML tags if present
    const text = message.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(message.id)
      setTimeout(() => setCopiedMessageId(null), 2000)
      
      // Optionally insert into editor
      if (insertToEditor && editor) {
        editor.commands.setContent(text)
        editor.commands.focus()
      }
    }).catch(err => {
      console.error('Failed to copy:', err)
    })
  }, [editor])

  const handleNoteIt = useCallback((message: ChatMessage) => {
    const title = message.content.slice(0, 60).replace(/[#*_`]/g, '').trim() || 'Note from AI'
    const note = createNote(activeTopicId || null, title, 'ai-note')
    updateNoteContent(note.id, message.content)
    createTabForNote(note.id, title)
    console.log('[AIView] NoteIt: Created note', note.id, title)
  }, [activeTopicId, createNote, updateNoteContent, createTabForNote])

  // Track if we've initialized tabs to prevent duplicates
  const initializedRef = useRef(false)

  useEffect(() => {
    // Skip if already initialized
    if (initializedRef.current) return;
    
    // Don't auto-create tabs if no file is open (system state handles it)
    const currentFile = useFileStore.getState().currentFile;
    if (!currentFile && tabs.length === 0) {
      // System state will be loaded, don't create default tabs here
      return;
    }
    if (tabs.length === 0) {
      initializedRef.current = true;
      addTab()
    }
  }, [])

  // Also handle when system state gets loaded
  useEffect(() => {
    const currentFile = useFileStore.getState().currentFile;
    if (!currentFile && tabs.length > 0) {
      // System state loaded tabs, mark as initialized
      initializedRef.current = true;
    }
  }, [tabs.length]);

  useEffect(() => {
    scrollToBottom()
  }, [activeMessages])

  // Track if we've ever been in discuss mode - once set, never turns off
  const everInDiscussMode = useRef(false)
  useEffect(() => {
    if (activeMessages.some((msg) => msg.discussSessionId)) {
      everInDiscussMode.current = true
      setIsDiscussMode(true)
    }
  }, [activeMessages])

  // Detect discuss mode from loaded messages (for persistence on restart)
  useEffect(() => {
    if (activeMessages.length === 0) {
      setIsDiscussMode(false)
      everInDiscussMode.current = false
      return
    }
    // Don't turn off discuss mode once it's been enabled
    if (everInDiscussMode.current) {
      setIsDiscussMode(true)
      return
    }
    // Only check the last user message group when initially determining mode
    const lastUserMsgIdx = [...activeMessages].reverse().findIndex(m => m.role === 'user')
    if (lastUserMsgIdx === -1) {
      setIsDiscussMode(false)
      return
    }
    const lastUserIdx = activeMessages.length - 1 - lastUserMsgIdx
    const afterUserMessages = activeMessages.slice(lastUserIdx)
    const hasDiscussInCurrentGroup = afterUserMessages.some((msg) => msg.discussSessionId)
    setIsDiscussMode(hasDiscussInCurrentGroup)
  }, [activeMessages])

  // Save config changes to session
  useEffect(() => {
    updateAIConfig(config)
  }, [config])

  // Save provider configs changes to session
  useEffect(() => {
    updateProviderConfigs(providerConfigs)
  }, [providerConfigs])

  // Track if initial load is complete
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

  // Detect models on initial load or when provider changes
  useEffect(() => {
    const detectModels = async () => {
      // Skip if initial load not complete yet
      if (!initialLoadComplete) return
      
      if (!['llamacpp', 'ollama', 'vllm', 'custom'].includes(config.provider)) return
      if (!config.endpoint) return
      
      setIsDetectingModels(true)
      try {
        const models = await fetchAvailableModels(config.endpoint, config.apiKey)
        setAvailableModels(models)
        
        // Verify saved model still exists
        if (config.model && models.some((m) => m.id === config.model)) {
          const maxTokens = getModelMaxTokens(models, config.model)
          console.log('[AIView] Verified saved model exists:', config.model)
          setConfig({
            model: config.model,
            ...(maxTokens ? { maxTokens } : {})
          })
        } else if (models.length === 1) {
          // Auto-select if only one model
          const maxTokens = models[0].maxTokens || models[0].contextWindow
          setConfig({
            model: models[0].id,
            ...(maxTokens ? { maxTokens } : {})
          })
        }
      } catch (error) {
        console.log('[AIView] Model detection failed:', error)
      } finally {
        setIsDetectingModels(false)
      }
    }
    
    // Only run after initial load and when provider changes
    detectModels()
  }, [config.provider, initialLoadComplete])

  // Mark initial load complete after first render
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoadComplete(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [activeMessages, scrollToBottom])

  const handleAddTab = useCallback(() => {
    addTab()
  }, [addTab])

  const handleRemoveTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removeTab(tabId)
  }, [removeTab])

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId)
  }, [setActiveTab])

  const handleRenameTab = useCallback((tabId: string, newTitle: string) => {
    renameTab(tabId, newTitle)
  }, [renameTab])

  const handleDoubleClick = useCallback((tabId: string, currentTitle: string, e: React.MouseEvent) => {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = currentTitle
    input.className = 'tab-rename-input'
    input.addEventListener('blur', () => {
      if (input.value.trim()) {
        handleRenameTab(tabId, input.value.trim())
      }
      input.remove()
    })
    input.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Enter') {
        input.blur()
      } else if (keyEvent.key === 'Escape') {
        input.remove()
      }
    })

    const tabElement = (e.target as HTMLElement).closest('.chat-tab')
    if (tabElement) {
      tabElement.appendChild(input)
      input.focus()
      input.select()
    }
  }, [handleRenameTab])

  const extractPdfText = useCallback(async (message: string): Promise<string> => {
    if (!currentFile || currentFile.type !== 'pdf') return ''

    try {
      const lowerMessage = message.toLowerCase()

      if (lowerMessage.includes('whole') || lowerMessage.includes('entire') || lowerMessage.includes('all pages')) {
        return await getAllPagesText(currentFile.path)
      }

      return await getCurrentPageText(currentFile.path, currentPage)
    } catch (error: any) {
      console.error('[AIView] Error extracting PDF text:', error)
      return ''
    }
  }, [currentFile, currentPage])

  const extractNoteText = useCallback(() => {
    const activeNote = getActiveNote()
    if (!activeNote) return ''

    const text = activeNote.content.replace(/<[^>]*>/g, ' ').trim()
    return text ? `[Current Note: ${activeNote.title}]\n${text}` : ''
  }, [getActiveNote])

  const buildContext = useCallback(async (message: string): Promise<string> => {
    let context = ''

    try {
      if (currentFile) {
        context += `[Current file: ${currentFile.name}]\n`

        if (currentFile.type === 'pdf') {
          try {
            const pdfText = await extractPdfText(message)
            if (pdfText) {
              context += `[PDF Content]\n${pdfText}\n`
            }
          } catch (pdfError: any) {
            console.error('[AIView] PDF text extraction failed:', pdfError)
          }
        }
      }

      const noteText = extractNoteText()
      if (noteText) {
        context += `${noteText}\n`
      }

      if (activeTopicId) {
        context += `[Current topic ID: ${activeTopicId}]\n`
      }
    } catch (error: any) {
      console.error('[AIView] Error building context:', error)
    }

    return context
  }, [currentFile, activeTopicId, extractPdfText, extractNoteText])

  // Tool calling executor for MCP tools
  const executeTool = async (toolName: string, params: Record<string, unknown>) => {
    console.log(`[AIView] Executing tool: ${toolName}`, params)
    const result = await executeMCPTool(toolName, params)
    console.log(`[AIView] Tool result:`, result)
    return result
  }

  // Handle message with tool calling support
  const handleSend = async () => {
    if (!activeTabId || !editor || isStreaming || isProcessing) return

    const htmlContent = editor.getHTML()
    const textContent = editor.getText().trim()

    if (!textContent) return

    const userMessage = textContent
    editor.commands.clearContent()

    if (!activeTabId) return
    
    // Parse routing from message (before adding user message to determine discuss mode)
    const { parseChatMessage } = await import('../../../../application/services/chat-routing-service')
    const { useLLMPoolStore } = await import('../../../../application/store/llm-pool-store')
    const poolStore = useLLMPoolStore.getState()
    const { getPrimaryProvider } = poolStore
    const providers = poolStore.providers
    
    const routing = parseChatMessage(userMessage, providers)
    
    // Generate discuss session ID for discuss mode (before adding user message)
    const discussSessionId = routing.mode === 'discuss' ? crypto.randomUUID() : undefined
    
    // Add user message (with discussSessionId if discuss mode)
    addMessage(activeTabId, 'user', htmlContent, undefined, undefined, discussSessionId)

    // Check for summary trigger
    const { summarySkillMCPServerPlugin } = await import('../../../../plugins/mcp-tools/summary-skill-plugin')
    if (summarySkillMCPServerPlugin.isSummaryTrigger(userMessage)) {
      // Execute summary tool
      setIsProcessing(true)
      try {
        const result = await summarySkillMCPServerPlugin.executeTool('summarize_discussion', {
          style: 'bullet_points',
          include_thinking: false,
          max_length: 2000
        })

      if (result.success) {
        const data = result.data as { message?: string } | undefined
        addMessage(activeTabId, 'assistant', 
          `✅ ${data?.message || 'Discussion summarized and added to note.'}`,
            undefined,
            { providerId: 'system', nickname: 'System' }
          )
        } else {
          addMessage(activeTabId, 'assistant', 
            `❌ Failed to summarize: ${result.error}`,
            undefined,
            { providerId: 'system', nickname: 'System' }
          )
        }
      } catch (error) {
        console.error('[AIView] Summary execution error:', error)
        addMessage(activeTabId, 'assistant', 
          `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          { providerId: 'system', nickname: 'System' }
        )
      } finally {
        setIsProcessing(false)
      }
      return
    }

    // Determine which providers to use
    let targetProviders = providers.filter(p => routing.targetProviderIds.includes(p.id))
    
    // Auto mode: use primary or first available
    if (routing.mode === 'auto') {
      const primary = getPrimaryProvider()
      if (primary) {
        targetProviders = [primary]
      } else {
        targetProviders = providers.filter(p => p.isEnabled).slice(0, 1)
      }
    }

    // Check if any providers available
    if (targetProviders.length === 0) {
      addMessage(activeTabId, 'assistant', 
        'No LLM providers available. Please configure providers in Settings > LLM Pool.',
        undefined,
        { providerId: 'system', nickname: 'System' }
      )
      return
    }

    // Initialize local streaming state
    setStreamingContent('')
    setStreamingThinking('')

    setStreaming(true)
    setIsProcessing(true)

    // Declare targetProvider for use in single provider mode
    let targetProvider: typeof targetProviders[0] | undefined

    try {
      // Build context from current file and notes
      const context = await buildContext(routing.cleanMessage)

      // Get available MCP tools
      const mcpTools = getAllMCPTools()
      const toolPrompt = buildToolPrompt(mcpTools)

      // Build messages with tool context
      const systemMessage: ChatMessage = {
        id: 'system',
        role: 'system',
        content: toolPrompt,
        timestamp: Date.now()
      }

      // Build context message if there's context
      const contextMessage: ChatMessage | null = context ? {
        id: 'context',
        role: 'system',
        content: `[Context]\n${context}`,
        timestamp: Date.now()
      } : null

      const previousMessages = activeMessages.slice(0, -1)
      
      // Messages for initial call (with tools available)
      const messagesWithTools: ChatMessage[] = [
        systemMessage,
        ...(contextMessage ? [contextMessage] : []),
        ...previousMessages,
        { id: crypto.randomUUID(), role: 'user', content: userMessage, timestamp: Date.now() }
      ]

    // Set discuss mode for UI
    setIsDiscussMode(routing.mode === 'discuss')

  // Handle discuss mode (multiple providers) vs single provider mode
  if (routing.mode === 'discuss') {
    // Discuss mode: Send to all providers in parallel with streaming
    console.log('[AIView] Discuss mode: Sending to', targetProviders.length, 'providers')

    // Add a header message
    addMessage(activeTabId, 'assistant',
      `**Discuss Mode**: Starting discussion with ${targetProviders.length} providers...`,
      undefined,
      { providerId: 'system', nickname: 'System' },
      discussSessionId
    )

    // Create a map to track message IDs for each provider (for streaming updates)
    const providerMessageIds = new Map<string, string>()
    const providerStreamingContent = new Map<string, string>()
    const providerStreamingThinking = new Map<string, string>()
    const providerUpdateTimers = new Map<string, ReturnType<typeof setTimeout> | null>()

    // Initialize placeholder messages for each provider
    for (const targetProvider of targetProviders) {
      // Add placeholder to chat and capture the returned message ID
      const messageId = addMessage(activeTabId, 'assistant', '', undefined, {
        providerId: targetProvider.id,
        nickname: targetProvider.nickname || targetProvider.name,
        color: getProviderColor(targetProvider.id).border,
      }, discussSessionId)
      providerMessageIds.set(targetProvider.id, messageId)
      providerStreamingContent.set(targetProvider.id, '')
      providerStreamingThinking.set(targetProvider.id, '')
      providerUpdateTimers.set(targetProvider.id, null)
    }

    // Throttled update function to prevent React infinite loops
    const throttledUpdateMessage = (providerId: string, messageId: string, content: string | undefined, thinking: string | undefined, providerInfo: { providerId: string; nickname: string }) => {
      // Clear existing timer
      const existingTimer = providerUpdateTimers.get(providerId)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }
      
      // Set new timer to batch updates (50ms debounce)
      const timer = setTimeout(() => {
        updateMessage(activeTabId, messageId, content, thinking, providerInfo)
        providerUpdateTimers.set(providerId, null)
      }, 50)
      
      providerUpdateTimers.set(providerId, timer)
    }

    // Process all providers in parallel with streaming
    const providerPromises = targetProviders.map(async (targetProvider) => {
      const providerConfig = targetProvider.config
      const provider = getProvider(providerConfig.provider)
      const messageId = providerMessageIds.get(targetProvider.id)

      if (!messageId) {
        console.error('[AIView] No message ID found for provider:', targetProvider.name)
        return { provider: targetProvider, content: 'Error: No message ID', thinking: '', success: false }
      }

      // Load provider memory
      let memoryContext = ''
      try {
        const memory = await loadProviderMemory(targetProvider.id, targetProvider.nickname || targetProvider.name)
        memoryContext = generateMemoryContext(memory)
      } catch (error) {
        console.error(`[AIView] Failed to load memory for ${targetProvider.name}:`, error)
      }

      // Build persona system message if provider has a role
      const personaMessages: ChatMessage[] = []
      if (targetProvider.personaRole) {
        const personaPrompt = PERSONA_PROMPTS[targetProvider.personaRole]
        if (personaPrompt) {
          personaMessages.push({
            id: crypto.randomUUID(),
            role: 'system',
            content: `[PERSONA: You are ${targetProvider.nickname || targetProvider.name}, ${personaPrompt.description}]

${personaPrompt.systemPrompt}`,
            timestamp: Date.now()
          })
        }
      }

      // Add memory context message if exists
      const memoryMessages: ChatMessage[] = []
      if (memoryContext) {
        memoryMessages.push({
          id: crypto.randomUUID(),
          role: 'system',
          content: memoryContext,
          timestamp: Date.now()
        })
      }

      // Combine messages: persona + memory + tool prompt + context + history
      const providerMessages: ChatMessage[] = [
        systemMessage, // Tool instructions
        ...personaMessages, // Persona prompt
        ...memoryMessages, // Memory context
        ...(contextMessage ? [contextMessage] : []), // Context
        ...previousMessages, // Chat history
        { id: crypto.randomUUID(), role: 'user', content: userMessage, timestamp: Date.now() } // Current message
      ]

      let localContent = ''
      let localThinking = ''
      let lastUpdateTime = 0
      const UPDATE_INTERVAL = 100 // Minimum ms between updates

      try {
        const supportsToolCalling = 'chatWithTools' in provider && provider.supportsNativeFunctionCalling?.()
        const supportsThinking = 'streamChatWithThinking' in provider

        if (supportsToolCalling && mcpTools.length > 0) {
          await provider.streamChat(
            providerMessages,
            providerConfig,
            (chunk: string) => {
              localContent += chunk
              // Update streaming content map
              providerStreamingContent.set(targetProvider.id, localContent)
              // Throttled update to prevent React infinite loops
              const now = Date.now()
              if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                lastUpdateTime = now
                throttledUpdateMessage(targetProvider.id, messageId, localContent, undefined, {
                  providerId: targetProvider.id,
                  nickname: targetProvider.nickname || targetProvider.name
                })
              }
            }
          )
        } else if (supportsThinking) {
          await provider.streamChatWithThinking!(
            messagesWithTools,
            providerConfig,
            (chunk: string) => {
              localContent += chunk
              const displayContent = localContent.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '')
              providerStreamingContent.set(targetProvider.id, displayContent)
              // Throttled update
              const now = Date.now()
              if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                lastUpdateTime = now
                throttledUpdateMessage(targetProvider.id, messageId, displayContent, undefined, {
                  providerId: targetProvider.id,
                  nickname: targetProvider.nickname || targetProvider.name
                })
              }
            },
            (thinking: string) => {
              const filteredThinking = thinking.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '')
              if (filteredThinking) {
                localThinking = filteredThinking
                providerStreamingThinking.set(targetProvider.id, localThinking)
                // Throttled update
                const now = Date.now()
                if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                  lastUpdateTime = now
                  throttledUpdateMessage(targetProvider.id, messageId, undefined, localThinking, {
                    providerId: targetProvider.id,
                    nickname: targetProvider.nickname || targetProvider.name
                  })
                }
              }
            }
          )
        } else {
          await provider.streamChat(
            messagesWithTools,
            providerConfig,
            (chunk: string) => {
              localContent += chunk
              const displayContent = localContent.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '')
              providerStreamingContent.set(targetProvider.id, displayContent)
              // Throttled update
              const now = Date.now()
              if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                lastUpdateTime = now
                throttledUpdateMessage(targetProvider.id, messageId, displayContent, undefined, {
                  providerId: targetProvider.id,
                  nickname: targetProvider.nickname || targetProvider.name
                })
              }
            }
          )
        }

          // Handle tool calls after streaming
          const toolCalls = parseToolCalls(localContent)
          if (toolCalls.length > 0) {
            console.log(`[AIView] Provider ${targetProvider.name}: Found ${toolCalls.length} tool calls`)
            let toolResultText = ''
            
            for (const toolCall of toolCalls) {
              const result = await executeTool(toolCall.name, toolCall.arguments)
              if (result.success && toolCall.name === 'search_papers') {
                try {
                  const data = result.data as any
                  const papers = data?.papers || []
                  if (papers.length > 0) {
                    toolResultText += '\n\n**Found ' + papers.length + ' papers:**\n\n'
                    papers.forEach((paper: any, idx: number) => {
                      toolResultText += `${idx + 1}. [${paper.title}](${paper.url})\n`
                      if (paper.snippet) {
                        toolResultText += ` _${paper.snippet.slice(0, 150)}..._\n\n`
                      }
                    })
                    toolResultText += '\n*Click a link to download and open in file view*'
                  }
                } catch (e) {
                  toolResultText += '\n\n[Tool result: ' + JSON.stringify(result.data) + ']'
                }
              } else if (result.success && toolCall.name === 'web_search') {
                try {
                  const data = result.data as any
                  const results = data?.results || []
                  if (results.length > 0) {
                    toolResultText += '\n\n**Search Results:**\n\n'
                    results.forEach((item: any, idx: number) => {
                      toolResultText += `${idx + 1}. [${item.title}](${item.url})\n`
                      if (item.snippet) {
                        toolResultText += ` _${item.snippet.slice(0, 150)}_\n\n`
                      }
                    })
                    toolResultText += '\n*Click a link to open in file view*'
                  }
                } catch (e) {
                  toolResultText += '\n\n[Tool result: ' + JSON.stringify(result.data) + ']'
                }
              } else {
                toolResultText += `\n\n[Used tool: ${toolCall.name}]\n${result.success ? JSON.stringify(result.data) : result.error}`
              }
            }
            
      localContent += toolResultText
      // Flush any pending throttled updates before final update
      const pendingTimer = providerUpdateTimers.get(targetProvider.id)
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        providerUpdateTimers.set(targetProvider.id, null)
      }
      updateMessage(activeTabId, messageId, localContent, localThinking || undefined)
    }

    // Extract and store key points from this response to provider's memory
    try {
      await extractAndStoreMemory(
        targetProvider.id,
        targetProvider.nickname || targetProvider.name,
        localContent,
        discussSessionId
      )
    } catch (error) {
      console.error(`[AIView] Failed to extract memory for ${targetProvider.name}:`, error)
    }

    return { provider: targetProvider, content: localContent, thinking: localThinking, success: true }
  } catch (error) {
    console.error(`[AIView] Error from provider ${targetProvider.name}:`, error)
    const errorContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    // Flush pending updates before error update
    const pendingTimer = providerUpdateTimers.get(targetProvider.id)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      providerUpdateTimers.set(targetProvider.id, null)
    }
    updateMessage(activeTabId, messageId, errorContent, undefined)
          return { 
            provider: targetProvider, 
            content: errorContent, 
            thinking: '', 
            success: false 
          }
        }
      })

    // Wait for all providers to finish
    await Promise.all(providerPromises)

    // Flush any remaining pending updates
    providerUpdateTimers.forEach((timer, providerId) => {
      if (timer) {
        clearTimeout(timer)
        const messageId = providerMessageIds.get(providerId)
        const content = providerStreamingContent.get(providerId)
        const thinking = providerStreamingThinking.get(providerId)
        if (messageId) {
          updateMessage(activeTabId, messageId, content || '', thinking || undefined, {
            providerId: providerId,
            nickname: targetProviders.find(p => p.id === providerId)?.nickname || 'Unknown'
          })
        }
      }
    })

    setStreamingContent('')
    setStreamingThinking('')
    setStreaming(false)
    setIsProcessing(false)
    return
    }

    // Single provider mode (auto or assigned)
    const targetProvider = targetProviders[0]
    const providerConfig = targetProvider?.config || config
    const provider = getProvider(providerConfig.provider)

    // Use local state for streaming display
    let localContent = ''
    let localThinking = ''

    // Check if provider supports native function calling
    const supportsToolCalling = 'chatWithTools' in provider && provider.supportsNativeFunctionCalling?.()
    // Check if provider supports streaming with thinking
    const supportsThinking = 'streamChatWithThinking' in provider
    console.log('[AIView] Provider:', provider.name, 'supportsThinking:', supportsThinking, 'supportsToolCalling:', supportsToolCalling)

    if (supportsToolCalling && mcpTools.length > 0) {
      // Use native function calling (for OpenAI, Anthropic, etc.)
      console.log('[AIView] Using native function calling')
      await provider.streamChat(
        messagesWithTools,
        providerConfig,
        (chunk: string) => {
            localContent += chunk
            const displayContent = localContent.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '')
            setStreamingContent(displayContent)
          }
        )
      } else if (supportsThinking) {
        // Use streamChatWithThinking for models that return thinking
        console.log('[AIView] Using streamChatWithThinking')
        await provider.streamChatWithThinking!(
          messagesWithTools,
          providerConfig,
          (chunk: string) => {
            localContent += chunk
            const displayContent = localContent.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '')
            setStreamingContent(displayContent)
          },
          (thinking: string) => {
            const filteredThinking = thinking.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '')
            if (filteredThinking) {
              localThinking = filteredThinking
              setStreamingThinking(localThinking)
            }
          }
        )
      } else {
        // Fallback for llama.cpp, vLLM, etc.
        console.log('[AIView] Using prompt-based tool calling')
        await provider.streamChat(
          messagesWithTools,
          providerConfig,
          (chunk: string) => {
            localContent += chunk
            const displayContent = localContent.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '')
            setStreamingContent(displayContent)
          }
        )
      }

      console.log('[AIView] Stream complete, checking for tool calls...')
      const toolCalls = parseToolCalls(localContent)
      console.log('[AIView] toolCalls found:', toolCalls.length)

      if (toolCalls.length > 0) {
        console.log('[AIView] Found tool calls, executing...')
        setStreamingContent('Processing tools...')

        for (const toolCall of toolCalls) {
          console.log('[AIView] Executing tool:', toolCall.name, toolCall.arguments)
          const result = await executeTool(toolCall.name, toolCall.arguments)
          console.log('[AIView] Tool result:', result.success ? 'success' : 'error')

          // Format tool result with clickable paper links if it's search_papers
          let toolResultText = ''
          if (result.success && toolCall.name === 'search_papers') {
            // Parse papers from result
            try {
              const data = result.data as any
              const papers = data?.papers || []
              if (papers.length > 0) {
                toolResultText = '\n\n**Found ' + papers.length + ' papers:**\n\n'
                papers.forEach((paper: any, idx: number) => {
                  toolResultText += `${idx + 1}. [${paper.title}](${paper.url})\n`
                  if (paper.snippet) {
                    toolResultText += `   _${paper.snippet.slice(0, 150)}..._\n\n`
                  }
                })
                toolResultText += '\n*Click a link to download and open in file view*'
              } else {
                toolResultText = '\n\n[No papers found]'
              }
            } catch (e) {
              toolResultText = '\n\n[Tool result: ' + JSON.stringify(result.data) + ']'
            }
          } else if (result.success && toolCall.name === 'web_search') {
            // Parse search results from web_search
            try {
              const data = result.data as any
              const results = data?.results || []
              if (results.length > 0) {
                toolResultText = '\n\n**Search Results:**\n\n'
                results.forEach((item: any, idx: number) => {
                  toolResultText += `${idx + 1}. [${item.title}](${item.url})\n`
                  if (item.snippet) {
                    toolResultText += `   _${item.snippet.slice(0, 150)}_` + '\n\n'
                  }
                })
                toolResultText += '\n*Click a link to open in file view*'
              } else {
                toolResultText = '\n\n[No results found]'
              }
            } catch (e) {
              toolResultText = '\n\n[Tool result: ' + JSON.stringify(result.data) + ']'
            }
          } else if (result.success && toolCall.name === 'get_paper_metadata') {
            // Format paper metadata with clickable download link
            try {
              const data = result.data as any
              const url = data?.url || ''
              const title = data?.title || 'Unknown Paper'
              const source = data?.source || ''
              const id = data?.id || ''
              
              // Convert arxiv URL to PDF URL
              let downloadUrl = url
              if (url.includes('arxiv.org/abs/')) {
                downloadUrl = url.replace('/abs/', '/pdf/') + '.pdf'
              } else if (url.includes('arxiv.org/pdf/')) {
                downloadUrl = url
              }
              
              toolResultText = `\n\n**Paper Found:**\n\n[${title}](${downloadUrl})\n\n`
              if (source) {
                toolResultText += `*Source: ${source}`
                if (id) toolResultText += ` | ID: ${id}`
                toolResultText += '*\n'
              }
              toolResultText += '\n*Click the link to download and open in file view*'
            } catch (e) {
              toolResultText = '\n\n[Tool result: ' + JSON.stringify(result.data) + ']'
            }
          } else {
            toolResultText = `\n\n[Used tool: ${toolCall.name}]\n${result.success ? JSON.stringify(result.data) : result.error}`
          }
          
          localContent += toolResultText
          setStreamingContent(localContent)
        }
      }

      // Add final message - filter out any remaining tool call JSON
      const filterToolCalls = (text: string): string => {
        let result = '';
        let searchStart = 0;
        while (true) {
          const startIdx = text.indexOf('{"tool_call":', searchStart);
          if (startIdx === -1) {
            result += text.slice(searchStart);
            break;
          }
          result += text.slice(searchStart, startIdx);
          
          // Find matching closing brace
          let braceCount = 0;
          let inString = false;
          let endIdx = startIdx;
          for (let i = startIdx; i < text.length; i++) {
            const char = text[i];
            if (char === '\\') { i++; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (char === '{') braceCount++;
            else if (char === '}') {
              braceCount--;
              if (braceCount === 0) { endIdx = i + 1; break; }
            }
          }
          searchStart = endIdx;
        }
        return result.trim();
      }
      
    const finalContent = filterToolCalls(localContent)
    const finalThinking = filterToolCalls(localThinking || '')
    
    // Save message with the actual provider that responded
    addMessage(activeTabId, 'assistant', finalContent, finalThinking || undefined, {
      providerId: targetProvider?.id || config.provider,
      nickname: targetProvider?.nickname || targetProvider?.name || config.provider,
    })

    // Clear local streaming state
    setStreamingContent('')
    setStreamingThinking('')
  } catch (error) {
    console.error('AI Error:', error)
    addMessage(activeTabId, 'assistant', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, undefined, {
      providerId: targetProvider?.id || config.provider,
      nickname: targetProvider?.nickname || targetProvider?.name || config.provider,
    })
      setStreamingContent('')
      setStreamingThinking('')
    } finally {
      setStreaming(false)
      setIsProcessing(false)
    }
  }

  const handleNewChat = () => {
    if (activeTabId) {
      clearChat(activeTabId)
    }
  }

  return (
    <div className="view-container ai-view">
      <div className="view-header ai-view-header">
        <div className="chat-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`chat-tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              onDoubleClick={(e) => handleDoubleClick(tab.id, tab.title, e)}
            >
              <span className="tab-title">{tab.title}</span>
              <button
                className="tab-close"
                onClick={(e) => handleRemoveTab(tab.id, e)}
              >
                ×
              </button>
            </div>
          ))}
          <button className="add-tab-button" onClick={handleAddTab}>
            +
          </button>
        </div>
        <div className="ai-actions">
          <div className="font-size-controls">
            <span className="font-size-label">Size:</span>
            <button
              className="ai-action-button font-size-button"
              onClick={() => setFontSize((prev) => Math.max(10, prev - 2))}
              title="Decrease font size"
            >
              A-
            </button>
            <select
              className="font-size-select"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              title="Font size"
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
            <button
              className="ai-action-button font-size-button"
              onClick={() => setFontSize((prev) => Math.min(48, prev + 2))}
              title="Increase font size"
            >
              A+
            </button>
          </div>
          <button className="ai-action-button" onClick={handleNewChat} title="Clear Chat">
            🗑️
          </button>
          <button className="ai-action-button" onClick={() => setShowConfig(!showConfig)} title="Settings">
            ⚙️
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="ai-config">
          <div className="config-field">
            <label>Provider:</label>
            <select
              value={config.provider}
              onChange={async (e) => {
                const provider = e.target.value as AIProviderType
                switchProvider(provider)
                // Clear available models when switching providers
                setAvailableModels([])
                
                // For providers that use endpoint, try to fetch models
                if (['llamacpp', 'ollama', 'vllm', 'custom'].includes(provider)) {
                  // Get the new config after switch (since switchProvider updates the store)
                  const newConfig = useAIChatStore.getState().config
                  if (!newConfig.endpoint) return
                  
                  setIsDetectingModels(true)
                  try {
                    const models = await fetchAvailableModels(newConfig.endpoint, newConfig.apiKey)
                    setAvailableModels(models)
                    
                    // Auto-select if saved model exists in the list
                    if (newConfig.model && models.some((m) => m.id === newConfig.model)) {
                      const maxTokens = getModelMaxTokens(models, newConfig.model)
                      console.log('[AIView] Restored saved model:', newConfig.model)
                      setConfig({ 
                        model: newConfig.model,
                        ...(maxTokens ? { maxTokens } : {})
                      })
                    } else if (models.length === 1) {
                      // Auto-select if only one model found
                      const maxTokens = models[0].maxTokens || models[0].contextWindow
                      setConfig({ 
                        model: models[0].id,
                        ...(maxTokens ? { maxTokens } : {})
                      })
                    }
                  } catch (error) {
                    console.log('[AIView] Could not detect models:', error)
                  } finally {
                    setIsDetectingModels(false)
                  }
                }
              }}
            >
              {AVAILABLE_PROVIDERS.map((p) => (
                <option key={p.type} value={p.type}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="config-field">
            <label>Endpoint:</label>
            <input
              type="text"
              value={config.endpoint}
              onChange={(e) => setConfig({ endpoint: e.target.value })}
              onBlur={async () => {
                // Query models when endpoint input loses focus
                if (!config.endpoint || !['llamacpp', 'ollama', 'vllm', 'custom', 'openai'].includes(config.provider)) {
                  return
                }

                setIsDetectingModels(true)
                try {
                  const models = await fetchAvailableModels(config.endpoint, config.apiKey)
                  setAvailableModels(models)

                  // Auto-select if only one model found
                  if (models.length === 1) {
                    console.log('[AIView] Auto-selected model:', models[0].id)
                    const maxTokens = models[0].maxTokens || models[0].contextWindow
                    setConfig({ 
                      model: models[0].id,
                      ...(maxTokens ? { maxTokens } : {})
                    })
                  } else if (models.length > 1 && !config.model) {
                    // Keep dropdown open for user to select
                    console.log('[AIView] Found', models.length, 'models, waiting for user selection')
                  }
                } catch (error) {
                  console.log('[AIView] Could not detect models:', error)
                  setAvailableModels([])
                } finally {
                  setIsDetectingModels(false)
                }
              }}
              placeholder="http://localhost:8080"
            />
          </div>
          <div className="config-field">
            <label>Model:</label>
            {availableModels.length > 1 ? (
              <select
                value={config.model}
                onChange={(e) => {
                  const selectedModel = e.target.value
                  const maxTokens = getModelMaxTokens(availableModels, selectedModel)
                  setConfig({ 
                    model: selectedModel,
                    ...(maxTokens ? { maxTokens } : {})
                  })
                }}
                className="model-select"
              >
                <option value="">Select a model...</option>
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                    {m.maxTokens ? ` (${m.maxTokens} tokens)` : ''}
                    {m.description && !m.maxTokens ? ` - ${m.description}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig({ model: e.target.value })}
                placeholder="llama2"
                className={isDetectingModels ? 'detecting' : ''}
              />
            )}
            {isDetectingModels && (
              <span className="model-detecting-indicator">Detecting...</span>
            )}
            {availableModels.length === 1 && (
              <span className="model-auto-detected">✓ Auto-detected</span>
            )}
          </div>
      {/* Show API key field if:
          - Provider requires API key AND no key is configured (for OpenAI/Anthropic)
          - Or it's Custom provider (always allow API key configuration) */}
      {(() => {
        const providerInfo = AVAILABLE_PROVIDERS.find((p) => p.type === config.provider)
        const shouldShowApiKey = providerInfo?.requiresApiKey && (
          config.provider === 'custom' || !config.apiKey
        )
        return shouldShowApiKey ? (
          <div className="config-field">
            <label>API Key:</label>
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => setConfig({ apiKey: e.target.value })}
              placeholder="Enter your API key"
            />
          </div>
        ) : null
      })()}
          <div className="config-field">
            <label>Temperature:</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature ?? 0.7}
              onChange={(e) => setConfig({ temperature: parseFloat(e.target.value) })}
            />
          </div>
          <div className="config-field">
            <label>Max Tokens:</label>
            <input
              type="number"
              min="1"
              max="8192"
              value={config.maxTokens ?? 4096}
              onChange={(e) => setConfig({ maxTokens: parseInt(e.target.value) })}
            />
          </div>
        </div>
      )}

      <div className={`view-content ai-view-content ${isDiscussMode ? 'discuss-mode' : ''}`}>
        <div className="chat-messages" ref={messagesContainerRef}>
          {activeMessages.length === 0 ? (
            <div className="chat-empty">
              <p>Ask me anything about your study materials!</p>
              <p className="chat-hint">
                Tip: Ask about "the page", "the whole file", or "search for..." to include content.
              </p>
            </div>
          ) : (
            activeMessages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-message ${msg.role}`}
                style={msg.providerColor ? { borderLeft: `4px solid ${msg.providerColor}` } : undefined}
              >
              <div className="message-header">
                <div className="message-role">
                  {msg.role === 'user' 
                    ? 'You' 
                    : msg.providerNickname 
                      ? msg.providerNickname 
                      : 'AI'
                  }
                </div>
              {msg.role === 'user' && (
                <div className="message-actions">
                  <button
                    className="message-action-btn"
                    onClick={() => handleCopyMessage(msg, false)}
                    title="Copy to clipboard"
                  >
                    {copiedMessageId === msg.id ? '✓ Copied' : '📋 Copy'}
                  </button>
                  <button
                    className="message-action-btn"
                    onClick={() => handleCopyMessage(msg, true)}
                    title="Copy and edit"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="message-action-btn delete-btn"
                    onClick={() => activeTabId && deleteMessage(activeTabId, msg.id)}
                    title="Delete message and response"
                  >
                    🗑️ Delete
                  </button>
                </div>
              )}
              {msg.role === 'assistant' && msg.providerId !== 'system' && (
                <div className="message-actions">
                  <button
                    className="message-action-btn"
                    onClick={() => handleNoteIt(msg)}
                    title="Save to notes"
                  >
                    📝 NoteIt
                  </button>
                </div>
              )}
              </div>
              {msg.role === 'assistant' && msg.thinking && (
                <div className="message-thinking">
                  <button 
                    className="thinking-toggle"
                    onClick={() => toggleThinking(msg.id)}
                  >
                    {expandedThinking.has(msg.id) ? '▼' : '▶'} Thinking
                  </button>
      {expandedThinking.has(msg.id) && (
        <div className="thinking-content">
          {(() => {
            // Remove JSON tool calls from thinking (handles multiline)
            let thinking = msg.thinking || ''
            // Match {"tool_call": {...}} including nested braces
            thinking = thinking.replace(/\{\s*"tool_call"[\s\S]*?\}\s*\}/g, '[Tool execution hidden]')
            return thinking
          })()}
        </div>
      )}
                </div>
              )}
              <div className="message-content" style={{ fontSize: `${fontSize}px` }}>
                {msg.role === 'user' ? (
                  // User messages are HTML from TipTap editor
                  <div dangerouslySetInnerHTML={{ __html: msg.content }} />
                ) : (
              // AI messages are Markdown
              <div className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    a: ({ href, children }) => (
                      <PaperLink href={href || ''}>{children}</PaperLink>
                    )
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
                {msg.providerId === 'system' && isDiscussMode && (isStreaming || isProcessing) && (
                  <span className="typing-indicator">...</span>
                )}
              </div>
                )}
              </div>
            </div>
          ))
          )}
      {(isStreaming || isProcessing) && !isDiscussMode && (
        <div className="chat-message assistant streaming">
          <div className="message-header">
            <div className="message-role">AI</div>
          </div>
          {/* Thinking section - collapsible */}
          {streamingThinking && (
            <div className="message-thinking">
              <button
                className="thinking-toggle"
                onClick={() => toggleThinking('streaming')}
              >
                {expandedThinking.has('streaming') ? '▼' : '▶'} Thinking
              </button>
              {expandedThinking.has('streaming') && (
                <div className="thinking-content">
                  {streamingThinking}
                </div>
              )}
            </div>
          )}
          {/* Content section */}
          {streamingContent ? (
            <div className="message-content" style={{ fontSize: `${fontSize}px` }}>
              <div className="markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {streamingContent}
                </ReactMarkdown>
              </div>
            </div>
          ) : !streamingThinking ? (
            <div className="message-content">
              <span className="typing-indicator">...</span>
            </div>
          ) : null}
        </div>
      )}
        </div>

        <div className="chat-input-container">
          {editor && (
            <EditorContent
              editor={editor}
              className="chat-input"
            />
          )}
          <button
            className="send-button"
            onClick={handleSend}
            disabled={!editor?.getText().trim() || isStreaming || isProcessing}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export default AIView
