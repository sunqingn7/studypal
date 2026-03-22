import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useNoteStore } from '../../../../application/store/note-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import './NoteView.css'

const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32]

function NoteView() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, renameTab, updateNoteContent, getActiveNote } = useNoteStore()
  const { activeTopicId } = useTopicStore()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [fontSize, setFontSize] = useState(16)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  const activeNote = getActiveNote()

  useEffect(() => {
    if (activeNote) {
      setEditContent(activeNote.content || '')
    }
  }, [activeNote?.id])

  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      if (activeNote && editContent !== activeNote.content) {
        updateNoteContent(activeNote.id, editContent)
      }
    } else {
      if (activeNote) {
        setEditContent(activeNote.content || '')
      }
    }
    setIsEditing(!isEditing)
  }, [isEditing, activeNote, editContent, updateNoteContent])

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setEditContent(value)
    const noteId = activeNote?.id
    if (noteId) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        updateNoteContent(noteId, value)
      }, 500)
    }
  }, [activeNote, updateNoteContent])

  const insertMarkdown = useCallback((prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = textarea.value.slice(start, end)
    const newValue = textarea.value.slice(0, start) + prefix + selected + suffix + textarea.value.slice(end)
    setEditContent(newValue)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    }, 0)
    const noteId = activeNote?.id
    if (noteId) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        updateNoteContent(noteId, newValue)
      }, 500)
    }
  }, [activeNote, updateNoteContent])

  const handleAddTab = useCallback(() => {
    addTab(activeTopicId)
  }, [addTab, activeTopicId])

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
    const tabElement = (e.target as HTMLElement).closest('.note-tab')
    if (tabElement) {
      tabElement.appendChild(input)
      input.focus()
      input.select()
    }
  }, [handleRenameTab])

  const decreaseFontSize = () => setFontSize((prev) => Math.max(10, prev - 2))
  const increaseFontSize = () => setFontSize((prev) => Math.min(48, prev + 2))
  const setSpecificFontSize = (size: number) => setFontSize(size)

  if (!activeNote) {
    return (
      <div className="view-container note-view">
        <div className="view-content note-view-content">
          <div className="note-empty">
            <p>No note selected. Create or open a note to start taking notes.</p>
          </div>
        </div>
      </div>
    )
  }

  const displayContent = activeNote.content || ''

  return (
    <div className="view-container note-view">
      <div className="view-header note-view-header">
        <div className="note-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`note-tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              onDoubleClick={(e) => handleDoubleClick(tab.id, tab.title, e)}
            >
              <span className="tab-title">{tab.title}</span>
              <button className="tab-close" onClick={(e) => handleRemoveTab(tab.id, e)}>×</button>
            </div>
          ))}
          <button className="add-tab-button" onClick={handleAddTab}>+</button>
        </div>

        <div className="note-toolbar">
          <div className="toolbar-group">
            <button className="toolbar-button view-edit-toggle" onClick={handleEditToggle} title={isEditing ? 'Preview (Ctrl+E)' : 'Edit (Ctrl+E)'}>
              {isEditing ? 'Preview' : 'Edit'}
            </button>
            <div className="toolbar-separator" />
            <button className="toolbar-button" onClick={() => insertMarkdown('**', '**')} title="Bold (Ctrl+B)"><strong>B</strong></button>
            <button className="toolbar-button" onClick={() => insertMarkdown('*', '*')} title="Italic (Ctrl+I)"><em>I</em></button>
            <button className="toolbar-button" onClick={() => insertMarkdown('\n## ', '\n')} title="Heading"><strong>H</strong></button>
            <button className="toolbar-button" onClick={() => insertMarkdown('\n- ', '')} title="Bullet list"><span>•</span> List</button>
            <button className="toolbar-button" onClick={() => insertMarkdown('\n1. ', '')} title="Numbered list"><span>1.</span> List</button>
            <button className="toolbar-button" onClick={() => insertMarkdown('$', '$')} title="Inline math (LaTeX)"><em>Σ</em></button>
            <button className="toolbar-button" onClick={() => insertMarkdown('\n$$\n', '\n$$\n')} title="Block math (LaTeX)"><em>∑</em></button>
          </div>

          <div className="toolbar-separator" />

          <div className="toolbar-group font-size-controls">
            <span className="font-size-label">Size:</span>
            <button className="toolbar-button font-size-button" onClick={decreaseFontSize} title="Decrease font size">A-</button>
            <select
              className="font-size-select"
              value={fontSize}
              onChange={(e) => setSpecificFontSize(Number(e.target.value))}
              title="Font size"
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
            <button className="toolbar-button font-size-button" onClick={increaseFontSize} title="Increase font size">A+</button>
          </div>
        </div>
      </div>

      <div className="view-content note-view-content">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="note-textarea"
            style={{ fontSize: `${fontSize}px` }}
            value={editContent}
            onChange={handleContentChange}
            placeholder="Start taking notes..."
            onBlur={() => {
              if (activeNote && editContent !== activeNote.content) {
                updateNoteContent(activeNote.id, editContent)
              }
            }}
          />
        ) : (
          <div className="note-preview" style={{ fontSize: `${fontSize}px` }}>
            {displayContent ? (
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {displayContent}
              </ReactMarkdown>
            ) : (
              <p className="note-placeholder">Start taking notes...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default NoteView
