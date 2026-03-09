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
import { llamaCppProvider } from '../../../../infrastructure/ai-providers/llamacpp-provider'
import { getCurrentPageText, getAllPagesText } from '../../../../infrastructure/file-handlers/pdf-utils'
import { searchWeb, fetchWebContent } from '../../../../infrastructure/web-service'
import { ChatMessage } from '../../../../domain/models/ai-context'
import './AIView.css'

const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32]

function AIView() {
  const {
    tabs,
    activeTabId,
    config,
    isStreaming,
    addTab,
    removeTab,
    setActiveTab,
    renameTab,
    addMessage,
    clearChat,
    getActiveMessages,
    setConfig,
    setStreaming,
    addToMessageHistory,
    getPreviousMessage,
    getNextMessage,
    resetHistoryIndex,
    abortChat,
  } = useAIChatStore()

  const { currentFile, currentPage } = useFileStore()
  const { getActiveNote } = useNoteStore()
  const { activeTopicId } = useTopicStore()

  const [showConfig, setShowConfig] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const activeMessages = getActiveMessages()

  // Track current draft message when navigating history
  const [draftMessage, setDraftMessage] = useState('')

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

        // Up/Down arrow for message history
        if (event.key === 'ArrowUp' && !event.shiftKey) {
          const currentText = editor?.getText() || ''
          // If at start of line or empty, try to get previous message
          const selection = window.getSelection()
          const isAtStart = !selection || selection.anchorOffset === 0

          if (isAtStart || !currentText.trim()) {
            event.preventDefault()
            if (currentText && !draftMessage) {
              setDraftMessage(currentText)
            }
            const prevMessage = activeTabId ? getPreviousMessage(activeTabId) : null
            if (prevMessage !== null && editor) {
              editor.commands.clearContent()
              editor.commands.insertContent(prevMessage)
            }
            return true
          }
        }

        if (event.key === 'ArrowDown' && !event.shiftKey) {
          const currentText = editor?.getText() || ''
          const selection = window.getSelection()
          const isAtEnd = !selection || selection.anchorOffset >= (currentText?.length || 0)

          if (isAtEnd || !currentText.trim()) {
            event.preventDefault()
            const nextMessage = activeTabId ? getNextMessage(activeTabId) : null
            if (nextMessage !== null && editor) {
              editor.commands.clearContent()
              editor.commands.insertContent(nextMessage)
            } else if (draftMessage && editor) {
              // Restore draft when at end of history
              editor.commands.clearContent()
              editor.commands.insertContent(draftMessage)
              setDraftMessage('')
            }
            return true
          }
        }

        return false
      },
    },
  })

  useEffect(() => {
    if (tabs.length === 0) {
      addTab()
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [activeMessages])

const scrollToBottom = () => {
  const chatMessages = document.querySelector('.chat-messages')
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight
  }
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
    addToMessageHistory(activeTabId, textContent)
    setStreaming(true)
    setIsProcessing(true)

    // Create abort controller for this request
    abortControllerRef.current = new AbortController()
    let fullResponse = ''

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

      await llamaCppProvider.streamChat(
        messages,
        config,
        (chunk) => {
          fullResponse += chunk
        },
        abortControllerRef.current.signal
      )

      if (activeTabId) {
        addMessage(activeTabId, 'assistant', fullResponse)
      }
    } catch (error: any) {
      if (error.message === 'Chat aborted' || error.name === 'AbortError') {
        if (activeTabId) {
          addMessage(activeTabId, 'assistant', fullResponse ? `${fullResponse}\n\n[Aborted]` : '[Aborted]')
        }
      } else {
        console.error('AI Error:', error)
        if (activeTabId) {
          addMessage(activeTabId, 'assistant', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
    } finally {
      abortControllerRef.current = null
      setStreaming(false)
      setIsProcessing(false)
    }
  }

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    abortChat()
  }

  const handleNewChat = () => {
    if (activeTabId) {
      clearChat(activeTabId)
      resetHistoryIndex(activeTabId)
      setDraftMessage('')
      if (editor) {
        editor.commands.clearContent()
      }
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
            <label>Endpoint:</label>
            <input
              type="text"
              value={config.endpoint}
              onChange={(e) => setConfig({ endpoint: e.target.value })}
              placeholder="http://localhost:8080"
            />
          </div>
          <div className="config-field">
            <label>Model:</label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig({ model: e.target.value })}
              placeholder="llama2"
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
              <div className="message-role">{msg.role === 'user' ? 'You' : 'AI'}</div>
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
      {(isStreaming || isProcessing) ? (
        <button
          className="send-button abort-button"
          onClick={handleAbort}
        >
          Abort
        </button>
      ) : (
        <button
          className="send-button"
          onClick={handleSend}
          disabled={!editor?.getText().trim()}
        >
          Send
        </button>
      )}
    </div>
      </div>
    </div>
  )
}

export default AIView
