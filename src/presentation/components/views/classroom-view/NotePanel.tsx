import { useState } from 'react'
import { useNoteStore } from '../../../../application/store/note-store'
import './NotePanel.css'

export function NotePanel() {
  const [notes, setNotes] = useState('')
  const { createNote, updateNoteContent } = useNoteStore()

  const handleSaveNote = () => {
    if (!notes.trim()) return
    const note = createNote(null, `Classroom Notes - ${new Date().toLocaleDateString()}`, 'note')
    updateNoteContent(note.id, notes.trim())
    setNotes('')
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
