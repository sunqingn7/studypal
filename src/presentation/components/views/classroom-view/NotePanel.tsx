import { useState, useRef, useEffect, useCallback } from 'react'
import { useClassroomStore } from '../../../../application/store/classroom-store'
import { useNoteStore } from '../../../../application/store/note-store'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import './NotePanel.css'

const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32]

export function NotePanel() {
  const [notes, setNotes] = useState('')
  const [isEditing, setIsEditing] = useState(true)
  const [fontSize, setFontSize] = useState(16)
  const { currentPage, documentPath } = useClassroomStore()
  const { createNote, updateNoteContent } = useNoteStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-save with debounce
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      // Auto-save to local storage or temporary storage
      if (notes.trim()) {
        localStorage.setItem('classroom-notes-draft', notes)
      }
    }, 1000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [notes])

  // Load draft on mount
  useEffect(() => {
    const draft = localStorage.getItem('classroom-notes-draft')
    if (draft) {
      setNotes(draft)
    }
  }, [])

  const insertMarkdown = useCallback((prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = textarea.value.slice(start, end)
    const newValue = textarea.value.slice(0, start) + prefix + selected + suffix + textarea.value.slice(end)
    
    setNotes(newValue)
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    }, 0)
  }, [])

  const handleSaveNote = () => {
    if (!notes.trim()) return
    
    const title = documentPath 
      ? `Classroom Notes - Page ${currentPage} - ${new Date().toLocaleDateString()}`
      : `Classroom Notes - ${new Date().toLocaleDateString()}`
    
    const note = createNote(null, title, 'note')
    updateNoteContent(note.id, notes.trim())
    
    // Clear the draft after saving
    localStorage.removeItem('classroom-notes-draft')
    setNotes('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSaveNote()
    }
  }

  const decreaseFontSize = () => setFontSize(prev => Math.max(10, prev - 2))
  const increaseFontSize = () => setFontSize(prev => Math.min(48, prev + 2))
  const setSpecificFontSize = (size: number) => setFontSize(size)

  const toggleEdit = () => {
    setIsEditing(!isEditing)
  }

  return (
    <div className="note-panel">
      <div className="note-header">
        <span className="note-title">My Notes</span>
        <div className="note-toolbar-compact">
          <div className="toolbar-group">
            <button 
              className="toolbar-button" 
              onClick={toggleEdit}
              title={isEditing ? 'Preview' : 'Edit'}
            >
              {isEditing ? 'Preview' : 'Edit'}
            </button>
            <div className="toolbar-separator" />
            {isEditing && (
              <>
                <button className="toolbar-button" onClick={() => insertMarkdown('**', '**')} title="Bold"><strong>B</strong></button>
                <button className="toolbar-button" onClick={() => insertMarkdown('*', '*')} title="Italic"><em>I</em></button>
                <button className="toolbar-button" onClick={() => insertMarkdown('\n## ', '\n')} title="Heading"><strong>H</strong></button>
                <button className="toolbar-button" onClick={() => insertMarkdown('\n- ', '')} title="Bullet list"><span>•</span> List</button>
                <button className="toolbar-button" onClick={() => insertMarkdown('\n1. ', '')} title="Numbered list"><span>1.</span> List</button>
                <button className="toolbar-button" onClick={() => insertMarkdown('$', '$')} title="Inline math"><em>Σ</em></button>
                <button className="toolbar-button" onClick={() => insertMarkdown('\n```\n', '\n```\n')} title="Code block">{`</>`}</button>
                <div className="toolbar-separator" />
              </>
            )}
            <div className="font-size-controls-compact">
              <button className="toolbar-button" onClick={decreaseFontSize} title="Decrease font size">A-</button>
              <select 
                className="font-size-select-compact"
                value={fontSize}
                onChange={(e) => setSpecificFontSize(Number(e.target.value))}
              >
                {FONT_SIZES.map(size => (
                  <option key={size} value={size}>{size}px</option>
                ))}
              </select>
              <button className="toolbar-button" onClick={increaseFontSize} title="Increase font size">A+</button>
            </div>
          </div>
          <button 
            className="note-save-btn" 
            onClick={handleSaveNote} 
            disabled={!notes.trim()}
          >
            Save to Notes
          </button>
        </div>
      </div>

      <div className="note-content">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Take notes here... (Markdown supported)&#10;Use **bold**, *italic*, ## headings, - lists, $math$, and ```code```"
            style={{ fontSize: `${fontSize}px` }}
          />
        ) : (
          <div className="note-preview-compact" style={{ fontSize: `${fontSize}px` }}>
            {notes ? (
              <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
              >
                {notes}
              </ReactMarkdown>
            ) : (
              <p className="note-placeholder">Start taking notes...</p>
            )}
          </div>
        )}
      </div>

      <div className="note-footer">
        <span className="note-hint">
          {isEditing 
            ? 'Markdown supported: **bold**, *italic*, ## headings, - lists, $math$' 
            : 'Preview mode - click Edit to modify'}
          {' • Press Ctrl+S to save'}
        </span>
        {notes.trim() && (
          <span className="note-stats">
            {notes.length} chars • {notes.split(/\s+/).filter(w => w.length > 0).length} words
          </span>
        )}
      </div>
    </div>
  )
}
