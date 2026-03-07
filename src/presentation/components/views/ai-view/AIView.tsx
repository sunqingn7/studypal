import { useState, useRef, useEffect, useCallback } from 'react'
import { useAIStore } from '../../../../application/store/ai-store'
import { useFileStore } from '../../../../application/store/file-store'
import { useNoteStore } from '../../../../application/store/note-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import { llamaCppProvider } from '../../../../infrastructure/ai-providers/llamacpp-provider'
import { ChatMessage } from '../../../../domain/models/ai-context'
import './AIView.css'

function AIView() {
  const { config, chatHistory, addMessage, clearHistory, isStreaming, setStreaming } = useAIStore()
  const { currentFile } = useFileStore()
  const { getActiveNote } = useNoteStore()
  const { activeTopicId } = useTopicStore()
  
  const [input, setInput] = useState('')
  const [showConfig, setShowConfig] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatHistory])

  const buildContext = useCallback(() => {
    let context = ''
    
    if (currentFile) {
      context += `[Current file: ${currentFile.name}]\n`
    }
    
    const activeNote = getActiveNote()
    if (activeNote) {
      context += `[Current note: ${activeNote.title}]\n${activeNote.content}\n`
    }
    
    if (activeTopicId) {
      context += `[Current topic ID: ${activeTopicId}]\n`
    }
    
    return context
  }, [currentFile, getActiveNote, activeTopicId])

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return

    const userMessage = input.trim()
    setInput('')

    addMessage('user', userMessage)
    setStreaming(true)

    try {
      const context = buildContext()
      const fullMessage = context ? `[Context]\n${context}\n\n[User Question]\n${userMessage}` : userMessage
      
      const messages: ChatMessage[] = [
        ...chatHistory,
        { id: crypto.randomUUID(), role: 'user', content: fullMessage, timestamp: Date.now() },
      ]

      let fullResponse = ''
      
      await llamaCppProvider.streamChat(
        messages,
        config,
        (chunk) => {
          fullResponse += chunk
        }
      )

      addMessage('assistant', fullResponse)
    } catch (error) {
      console.error('AI Error:', error)
      addMessage('assistant', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setStreaming(false)
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
                Tip: You can mention "this topic", "global notes", "the whole file" to include more context.
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
          {isStreaming && (
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
            placeholder="Ask a question..."
            disabled={isStreaming}
          />
          <button
            className="send-button"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export default AIView
