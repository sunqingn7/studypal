import { useState } from 'react'
import { useClassroomStore } from '../../../../application/store/classroom-store'
import './ChatPanel.css'

export function ChatPanel() {
  const { teachingTranscript, addTranscript, ttsSpeaking } = useClassroomStore()
  const [inputText, setInputText] = useState('')

  const handleSend = () => {
    if (inputText.trim()) {
      addTranscript(inputText.trim())
      setInputText('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-title">Teacher Chat</span>
        <div className="chat-tts-status">
          {ttsSpeaking && <span className="tts-indicator">🔊 Speaking...</span>}
        </div>
      </div>
      
      <div className="chat-messages">
        {teachingTranscript.length === 0 ? (
          <div className="chat-empty">
            <p>No transcript yet</p>
            <p className="empty-hint">AI teaching transcript will appear here</p>
          </div>
        ) : (
          teachingTranscript.map((msg, index) => (
            <div key={index} className="chat-message">
              {msg}
            </div>
          ))
        )}
      </div>
      
      <div className="chat-input-container">
        <textarea
          className="chat-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          rows={2}
        />
        <button className="chat-send-btn" onClick={handleSend} disabled={!inputText.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
