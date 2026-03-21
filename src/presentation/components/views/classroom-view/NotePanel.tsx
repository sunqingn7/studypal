import { useState } from 'react'
import './NotePanel.css'

export function NotePanel() {
  const [notes, setNotes] = useState('')

  const handleSaveNote = () => {
    // TODO: Save to note store
    console.log('Saving note:', notes)
  }

  return (
    <div className="note-panel">
      <div className="note-header">
        <span className="note-title">My Notes</span>
        <button className="note-save-btn" onClick={handleSaveNote} disabled={!notes.trim()}>
          Save
        </button>
      </div>
      
      <div className="note-content">
        <textarea
          className="note-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Take notes here..."
        />
      </div>
      
      <div className="note-footer">
        <span className="note-hint">Press Ctrl+S to save</span>
      </div>
    </div>
  )
}
