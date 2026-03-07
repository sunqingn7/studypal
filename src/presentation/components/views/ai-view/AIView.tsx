import { useState, useRef, useEffect, useCallback } from 'react'
import { useAIStore } from '../../../../application/store/ai-store'
import { useFileStore } from '../../../../application/store/file-store'
import { useNoteStore } from '../../../../application/store/note-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import { llamaCppProvider } from '../../../../infrastructure/ai-providers/llamacpp-provider'
import { getCurrentPageText, getAllPagesText } from '../../../../infrastructure/file-handlers/pdf-utils'
import { searchWeb, fetchWebContent } from '../../../../infrastructure/web-service'
import { ChatMessage } from '../../../../domain/models/ai-context'
import './AIView.css'

function AIView() {
  const { config, chatHistory, addMessage, clearHistory, isStreaming, setStreaming } = useAIStore()
  const { currentFile, currentPage } = useFileStore()
  const { getActiveNote } = useNoteStore()
  const { activeTopicId } = useTopicStore()
  
  const [input, setInput] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatHistory])

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
            // Continue without PDF content
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
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
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
    console.log('[AIView] handleSend called')
    console.log('[AIView] Current config:', { endpoint: config.endpoint, model: config.model })

    if (!input.trim() || isStreaming || isProcessing) {
      console.log('[AIView] Early return - input empty or already processing')
      return
    }

    const userMessage = input.trim()
    console.log('[AIView] User message:', userMessage)
    setInput('')

    addMessage('user', userMessage)
    setStreaming(true)
    setIsProcessing(true)

    try {
      console.log('[AIView] Building context...')
      const context = await buildContext(userMessage)
      console.log('[AIView] Context built:', context ? 'yes (length: ' + context.length + ')' : 'no')
      
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
      
    // Build messages for API - use full context message for the last user message
    // Get all messages except the last user message we just added
    const previousMessages = chatHistory.slice(0, -1)
    // Create the full message with context for the current query
    const currentMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: fullMessage,
      timestamp: Date.now(),
    }
    const messages: ChatMessage[] = [...previousMessages, currentMessage]

    // Debug logging
    console.log('[AIView] Sending to AI:', {
      endpoint: config.endpoint,
      model: config.model,
      messageCount: messages.length,
      lastMessagePreview: messages[messages.length - 1]?.content?.slice(0, 100) + '...'
    })

    let fullResponse = ''
    console.log('[AIView] About to call llamaCppProvider.streamChat...')
    console.log('[AIView] Config being passed:', JSON.stringify(config))

    try {
      await llamaCppProvider.streamChat(
        messages,
        config,
        (chunk) => {
          console.log('[AIView] Received chunk, length:', chunk.length)
          fullResponse += chunk
        }
      )
      console.log('[AIView] streamChat completed successfully')
    } catch (e: any) {
      console.error('[AIView] streamChat threw error:', e)
      console.error('[AIView] error name:', e?.name)
      console.error('[AIView] error message:', e?.message)
      console.error('[AIView] error stack:', e?.stack)
      throw e
    }

      addMessage('assistant', fullResponse)
    } catch (error) {
      console.error('AI Error:', error)
      addMessage('assistant', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setStreaming(false)
      setIsProcessing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewChat = () => {
    clearHistory()
  }

  return (
    <div className="view-container ai-view">
      <div className="view-header ai-view-header">
        <span className="ai-title">AI Assistant</span>
        <div className="ai-actions">
          <button className="ai-action-button" onClick={handleNewChat} title="New Chat">
            💬
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
              onChange={(e) => useAIStore.getState().setConfig({ endpoint: e.target.value })}
              placeholder="http://localhost:8080"
            />
          </div>
          <div className="config-field">
            <label>Model:</label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => useAIStore.getState().setConfig({ model: e.target.value })}
              placeholder="llama2"
            />
          </div>
        </div>
      )}

      <div className="view-content ai-view-content">
        <div className="chat-messages">
          {chatHistory.length === 0 ? (
            <div className="chat-empty">
              <p>Ask me anything about your study materials!</p>
              <p className="chat-hint">
                Tip: Ask about "the page", "the whole file", or "search for..." to include content.
              </p>
            </div>
          ) : (
            chatHistory.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.role}`}>
                <div className="message-role">{msg.role === 'user' ? 'You' : 'AI'}</div>
                <div className="message-content">{msg.content}</div>
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
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question... (try 'search for...')"
            disabled={isStreaming || isProcessing}
          />
          <button
            className="send-button"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || isProcessing}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export default AIView
