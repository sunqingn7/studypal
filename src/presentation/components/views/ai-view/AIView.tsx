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
import { buildToolPrompt, parseToolCalls, extractFinalResponse } from '../../../../infrastructure/ai-providers/tool-calling'
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
    deleteMessage,
    clearChat,
    getActiveMessages,
    setConfig,
    switchProvider,
    setStreaming,
  } = useAIChatStore()

  const { currentFile, currentPage } = useFileStore()
  const { getActiveNote } = useNoteStore()
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

  useEffect(() => {
    if (tabs.length === 0) {
      addTab()
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [activeMessages])

  // Save config changes to session
  useEffect(() => {
    updateAIConfig(config)
  }, [config])

  // Save provider configs changes to session
  useEffect(() => {
    updateProviderConfigs(providerConfigs)
  }, [providerConfigs])

  // Detect models on initial load or when provider changes
  useEffect(() => {
    const detectModels = async () => {
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
    
    // Only run on mount or when provider changes
    detectModels()
  }, [config.provider])

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
    addMessage(activeTabId, 'user', htmlContent)
    
    // Initialize local streaming state
    setStreamingContent('')
    setStreamingThinking('')
    
    setStreaming(true)
    setIsProcessing(true)

    try {
      // Build context from current file and notes
      const context = await buildContext(userMessage)

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

      const provider = getProvider(config.provider)
      
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
        
    // For now, we'll use the standard streamChat and parse for tool calls
    // Native function calling will be fully implemented in later phases
    await provider.streamChat(
      messagesWithTools,
      config,
      (chunk: string) => {
        // Filter out JSON tool calls from display
        const filteredChunk = chunk.replace(/\{"tool_call":\s*\{[^}]+\}\}/g, '')
        if (filteredChunk) {
          localContent += filteredChunk
          setStreamingContent(localContent)
        }
      }
    )
  } else if (supportsThinking) {
        // Use streamChatWithThinking for models that return thinking
        console.log('[AIView] Using streamChatWithThinking')
        
      await provider.streamChatWithThinking!(
        messagesWithTools,
        config,
        (chunk: string) => {
          // Filter out JSON tool calls from display
          const filteredChunk = chunk.replace(/\{"tool_call":\s*\{[^}]+\}\}/g, '')
          if (filteredChunk) {
            localContent += filteredChunk
            setStreamingContent(localContent)
          }
        },
        (thinking: string) => {
          // Filter out JSON tool calls from thinking
          const filteredThinking = thinking.replace(/\{"tool_call":\s*\{[^}]+\}\}/g, '')
          if (filteredThinking) {
            localThinking += filteredThinking
            setStreamingThinking(localThinking)
          }
        }
      )

      // Parse tool calls from response
      const toolCalls = parseToolCalls(localContent)

      if (toolCalls.length > 0) {
        console.log('[AIView] Found tool calls:', toolCalls)

        // Clear streaming content before executing tools (don't show raw JSON)
        setStreamingContent('Processing tools...')

        // Execute tool calls and get results
        for (const toolCall of toolCalls) {
          const result = await executeTool(toolCall.name, toolCall.arguments)

          // Add tool result to display
          const toolResultText = `\n\n[Used tool: ${toolCall.name}]\n${result.success ? JSON.stringify(result.data) : result.error}`
          localContent += toolResultText
          setStreamingContent(localContent)
        }

        // Get final response
        localContent = extractFinalResponse(localContent, toolCalls).content
      }
    } else {
        // Use prompt-based tool calling (fallback for llama.cpp, vLLM, etc.)
        console.log('[AIView] Using prompt-based tool calling')
        
      // First call: get response with potential tool calls
      await provider.streamChat(
        messagesWithTools,
        config,
        (chunk: string) => {
          // Filter out JSON tool calls from display
          const filteredChunk = chunk.replace(/\{"tool_call":\s*\{[^}]+\}\}/g, '')
          if (filteredChunk) {
            localContent += filteredChunk
            setStreamingContent(localContent)
          }
        }
      )

        // Parse tool calls from response
        const toolCalls = parseToolCalls(localContent)
        
      if (toolCalls.length > 0) {
        console.log('[AIView] Found tool calls:', toolCalls)

        // Clear streaming content before executing tools (don't show raw JSON)
        setStreamingContent('Processing tools...')

        // Execute tool calls and get results
        for (const toolCall of toolCalls) {
            const result = await executeTool(toolCall.name, toolCall.arguments)
            
            // Add tool result to display
            const toolResultText = `\n\n[Used tool: ${toolCall.name}]\n${result.success ? JSON.stringify(result.data) : result.error}`
            localContent += toolResultText
            setStreamingContent(localContent)
          }
          
          // Get final response
          localContent = extractFinalResponse(localContent, toolCalls).content
        } else {
          // No tool calls, but model might still output JSON format
          localContent = extractFinalResponse(localContent, []).content
        }
      }
      
      // Add the final assistant message to the chat
      addMessage(activeTabId, 'assistant', localContent, localThinking || undefined)

      // Clear local streaming state
      setStreamingContent('')
      setStreamingThinking('')
    } catch (error) {
      console.error('AI Error:', error)
      addMessage(activeTabId, 'assistant', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

      <div className="view-content ai-view-content">
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
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              <div className="message-header">
                <div className="message-role">{msg.role === 'user' ? 'You' : 'AI'}</div>
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
                      {msg.thinking}
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
              </div>
                )}
              </div>
            </div>
          ))
          )}
      {(isStreaming || isProcessing) && (
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
