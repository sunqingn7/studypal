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
import { searchWeb, fetchWebContent } from '../../../../infrastructure/web-service'
import { ChatMessage, AIProviderType } from '../../../../domain/models/ai-context'
import { updateAIConfig, updateProviderConfigs } from '../../../../application/services/session-manager'
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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeMessages = getActiveMessages()

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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

  const handleWebSearch = async (query: string): Promise<string> => {
    try {
      const results = await searchWeb(query)
      if (results.length === 0) {
        return 'No search results found.'
      }

      const formatted = results.map((r, i) =>
        `${i + 1}. ${r.title}\n ${r.url}\n ${r.snippet}`
      ).join('\n\n')

      return `[Web Search Results]\n${formatted}`
    } catch (error) {
      return `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }

  const handleFetchUrl = async (url: string): Promise<string> => {
    try {
      const content = await fetchWebContent(url)
      const snippet = content.slice(0, 3000)
      return `[Web Content from ${url}]\n${snippet}${content.length > 3000 ? '\n...(truncated)' : ''}`
    } catch (error) {
      return `Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }

  const handleSend = async () => {
    if (!activeTabId || !editor || isStreaming || isProcessing) return

    const htmlContent = editor.getHTML()
    const textContent = editor.getText().trim()

    if (!textContent) return

    const userMessage = textContent
    editor.commands.clearContent()

    if (!activeTabId) return
    addMessage(activeTabId, 'user', htmlContent)
    setStreaming(true)
    setIsProcessing(true)

    try {
      const context = await buildContext(userMessage)

      const lowerMessage = userMessage.toLowerCase()
      let additionalContext = ''

      if (lowerMessage.includes('search') || lowerMessage.includes('look up') || lowerMessage.includes('find information')) {
        const query = userMessage.replace(/(search|look up|find information about)/gi, '').trim()
        additionalContext = await handleWebSearch(query)
      } else if (lowerMessage.match(/(https?:\/\/[^\s]+)/)) {
        const urlMatch = userMessage.match(/(https?:\/\/[^\s]+)/)
        if (urlMatch) {
          additionalContext = await handleFetchUrl(urlMatch[1])
        }
      }

      const fullMessage = context
        ? `[Context]\n${context}${additionalContext ? '\n\n' + additionalContext : ''}\n\n[User Question]\n${userMessage}`
        : additionalContext
        ? `${additionalContext}\n\n[User Question]\n${userMessage}`
        : userMessage

      const previousMessages = activeMessages.slice(0, -1)
      const currentMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: fullMessage,
        timestamp: Date.now(),
      }
      const messages: ChatMessage[] = [...previousMessages, currentMessage]

      let fullResponse = ''

    const provider = getProvider(config.provider)
    await provider.streamChat(
      messages,
      config,
      (chunk: string) => {
        fullResponse += chunk
      }
    )

      if (activeTabId) {
        addMessage(activeTabId, 'assistant', fullResponse)
      }
    } catch (error) {
      console.error('AI Error:', error)
      if (activeTabId) {
        addMessage(activeTabId, 'assistant', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
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
        <div className="chat-messages">
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
                  </div>
                )}
              </div>
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
              <div className="message-role">AI</div>
              <div className="message-content">
                <span className="typing-indicator">...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
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
