import { useState, useRef, useCallback, useEffect } from 'react'
import { useClassroomStore } from '../../../../application/store/classroom-store'
import { useSettingsStore } from '../../../../application/store/settings-store'
import { useLLMPoolStore } from '../../../../application/store/llm-pool-store'
import { getProvider } from '../../../../infrastructure/ai-providers/provider-factory'
import { ChatMessage } from '../../../../domain/models/ai-context'
import { PaperLink } from '../../views/ai-view/components/PaperLink'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import './ChatPanel.css'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  timestamp: number
  providerNickname?: string
  providerId?: string
}

export function ChatPanel() {
  const { teachingTranscript, addTranscript, ttsSpeaking, currentPage, totalPages, documentPath, documentContent } = useClassroomStore()
  const { providers, getPrimaryProvider } = useLLMPoolStore()
  const [inputText, setInputText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingThinking, setStreamingThinking] = useState('')
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set())
  const [fontSize, setFontSize] = useState(14)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, scrollToBottom])

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

  const handleSend = async () => {
    if (!inputText.trim() || isStreaming) return

    const userMessage = inputText.trim()
    setInputText('')

    // Add user message
    const newMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, newMessage])

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsStreaming(true)
    setStreamingContent('')
    setStreamingThinking('')

    try {
      // Get primary provider or first available
      const targetProvider = getPrimaryProvider() || providers.find(p => p.isEnabled)
      
      if (!targetProvider) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'No LLM providers available. Please configure providers in Settings > LLM Pool.',
          timestamp: Date.now(),
          providerNickname: 'System',
          providerId: 'system',
        }])
        setIsStreaming(false)
        return
      }

      const providerConfig = targetProvider.config
      const provider = getProvider(providerConfig.provider)

      // Build context from classroom state
      const contextParts: string[] = []
      if (documentPath) {
        contextParts.push(`[Current document: ${documentPath}]
`)
        contextParts.push(`[Current page: ${currentPage} of ${totalPages}]
`)
      }
      
      if (documentContent) {
        // Get current page content
        const lines = documentContent.split('\n')
        const linesPerPage = Math.ceil(lines.length / totalPages) || 50
        const startLine = (currentPage - 1) * linesPerPage
        const endLine = Math.min(startLine + linesPerPage, lines.length)
        const pageContent = lines.slice(startLine, endLine).join('\n')
        
        if (pageContent) {
          contextParts.push(`[Page Content]
${pageContent.substring(0, 2000)}
`)
        }
      }

      // Build messages
      const systemMessage: ChatMessage = {
        id: 'system',
        role: 'system',
        content: `You are a helpful teaching assistant. You help students understand the material they're studying. Be clear, concise, and educational in your responses. Use markdown formatting to make your answers readable.`,
        timestamp: Date.now(),
      }

      const contextMessage: ChatMessage | null = contextParts.length > 0 ? {
        id: 'context',
        role: 'system',
        content: `[Context]
${contextParts.join('')}`,
        timestamp: Date.now(),
      } : null

      const messageHistory: ChatMessage[] = messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }))

      const messagesWithContext: ChatMessage[] = [
        systemMessage,
        ...(contextMessage ? [contextMessage] : []),
        ...messageHistory,
        { id: crypto.randomUUID(), role: 'user', content: userMessage, timestamp: Date.now() },
      ]

      let localContent = ''
      let localThinking = ''
      const supportsThinking = 'streamChatWithThinking' in provider

      if (supportsThinking) {
        await (provider as any).streamChatWithThinking(
          messagesWithContext,
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
          },
          signal
        )
      } else {
        await provider.streamChat(
          messagesWithContext,
          providerConfig,
          (chunk: string) => {
            localContent += chunk
            const displayContent = localContent.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '')
            setStreamingContent(displayContent)
          },
          signal
        )
      }

      // Add assistant message
      const finalContent = localContent.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '').trim()
      const finalThinking = localThinking.replace(/\{\s*"tool_call"\s*:[\s\S]*?\}\s*\}/g, '').trim()

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalContent,
        thinking: finalThinking || undefined,
        timestamp: Date.now(),
        providerNickname: targetProvider.nickname || targetProvider.name,
        providerId: targetProvider.id,
      }])

      // Also add to transcript
      addTranscript(`Teacher: ${finalContent}`)

    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      
      console.error('[ChatPanel] Error:', error)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
        providerNickname: 'System',
        providerId: 'system',
      }])
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      setStreamingThinking('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleRead = async (content: string) => {
    try {
      const { global } = useSettingsStore.getState()
      const { ttsManager } = await import('../../../../infrastructure/tts/tts-manager')

      const plainText = content
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]*`/g, '')
        .replace(/[#*_~\[\]]/g, '')
        .replace(/\n+/g, ' ')
        .trim()

      if (!plainText) return

      const ttsConfig = global.tts || { defaultBackend: 'edge', edge: { voice: 'en-US-AriaNeural', speed: 1.0 }, qwen: { voice: 'Vivian', speed: 1.0 }, volume: 1.0 }

      const config: any = {}
      const backend = ttsConfig.defaultBackend

      if (backend === 'edge') {
        config.backend = 'edge'
        config.voice = ttsConfig.edge?.voice || 'auto'
        config.speed = ttsConfig.edge?.speed || 1.0
      } else if (backend === 'qwen') {
        config.backend = 'qwen'
        config.voice = ttsConfig.qwen?.voice || 'Vivian'
        config.speed = ttsConfig.qwen?.speed || 1.0
      } else {
        config.backend = 'edge'
        config.voice = 'auto'
        config.speed = 1.0
      }

      ttsManager.setVolume(ttsConfig.volume || 1.0)
      ttsManager.setPlaybackRate(config.speed || 1)
      await ttsManager.speak(plainText, config)
    } catch (error) {
      console.error('[ChatPanel] TTS error:', error)
    }
  }

  const handleCopy = (content: string) => {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    navigator.clipboard.writeText(text)
  }

  const decreaseFontSize = () => setFontSize(prev => Math.max(10, prev - 2))
  const increaseFontSize = () => setFontSize(prev => Math.min(48, prev + 2))

  const clearChat = () => {
    setMessages([])
  }

  const allMessages = [...messages]
  
  // Add teaching transcript as system messages
  teachingTranscript.forEach((transcript, index) => {
    allMessages.push({
      id: `transcript-${index}`,
      role: 'system',
      content: transcript,
      timestamp: Date.now() - (teachingTranscript.length - index) * 1000,
    })
  })

  // Sort by timestamp
  allMessages.sort((a, b) => a.timestamp - b.timestamp)

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">Teacher Chat</span>
        <div className="chat-actions">
          <div className="chat-font-controls">
            <button className="chat-action-btn" onClick={decreaseFontSize} title="Decrease font size">A-</button>
            <span className="font-size-display">{fontSize}px</span>
            <button className="chat-action-btn" onClick={increaseFontSize} title="Increase font size">A+</button>
          </div>
          <button className="chat-action-btn" onClick={clearChat} title="Clear chat">🗑️</button>
          {ttsSpeaking && <span className="tts-indicator">Speaking...</span>}
        </div>
      </div>

      <div className="chat-messages" style={{ fontSize: `${fontSize}px` }}>
        {allMessages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet</p>
            <p className="empty-hint">Ask the teacher a question about the current page</p>
          </div>
        ) : (
          allMessages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.role}`}>
              {msg.role === 'assistant' && msg.providerNickname && (
                <div className="message-provider" style={{ 
                  borderLeft: `3px solid ${msg.providerId ? `var(--provider-${msg.providerId})` : 'var(--accent-color)'}`
                }}>
                  {msg.providerNickname}
                </div>
              )}
              
              <div className="message-content">
                {msg.role === 'system' ? (
                  <div className="transcript-message">{msg.content}</div>
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      a: ({ href, children }) => (
                        <PaperLink href={href || ''}>
                          {children}
                        </PaperLink>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>

              {msg.thinking && msg.role === 'assistant' && (
                <div className="message-thinking">
                  <button 
                    className="thinking-toggle"
                    onClick={() => toggleThinking(msg.id)}
                  >
                    {expandedThinking.has(msg.id) ? '▼' : '▶'} Thinking
                  </button>
                  {expandedThinking.has(msg.id) && (
                    <div className="thinking-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {msg.thinking}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}

              {msg.role === 'assistant' && (
                <div className="message-actions">
                  <button 
                    className="message-action-btn" 
                    onClick={() => handleCopy(msg.content)}
                    title="Copy to clipboard"
                  >
                    📋
                  </button>
                  <button 
                    className="message-action-btn" 
                    onClick={() => handleRead(msg.content)}
                    title="Read aloud"
                  >
                    🔊
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        
        {isStreaming && (
          <div className="chat-message assistant streaming">
            <div className="message-content">
              {streamingContent ? (
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {streamingContent}
                </ReactMarkdown>
              ) : (
                <span className="streaming-indicator">Thinking...</span>
              )}
            </div>
            {streamingThinking && (
              <div className="message-thinking">
                <div className="thinking-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {streamingThinking}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about the current page..."
          rows={2}
          disabled={isStreaming}
        />
        <button 
          className="chat-send-btn" 
          onClick={handleSend} 
          disabled={!inputText.trim() || isStreaming}
        >
          {isStreaming ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
