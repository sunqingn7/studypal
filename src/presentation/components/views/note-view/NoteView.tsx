import { useCallback, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useNoteStore } from '../../../../application/store/note-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import './NoteView.css'

function NoteView() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, renameTab, updateNoteContent, getActiveNote } = useNoteStore()
  const { activeTopicId } = useTopicStore()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const activeNote = getActiveNote()

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start taking notes...',
      }),
    ],
    content: activeNote?.content || '',
    onUpdate: ({ editor }) => {
      const noteId = activeNote?.id
      if (noteId) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
        }
        saveTimeoutRef.current = setTimeout(() => {
          updateNoteContent(noteId, editor.getHTML())
        }, 500)
      }
    },
  })

  useEffect(() => {
    if (editor && activeNote) {
      const currentContent = editor.getHTML()
      if (currentContent !== activeNote.content) {
        editor.commands.setContent(activeNote.content || '')
      }
    }
  }, [editor, activeNote?.id])

  useEffect(() => {
    if (tabs.length === 0) {
      addTab(activeTopicId)
    }
  }, [])

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
      </div>
      <div className="view-content note-view-content">
        {editor ? (
          <EditorContent editor={editor} className="note-editor" />
        ) : (
          <div className="note-empty">
            <p>Create a new note to get started</p>
            <button onClick={handleAddTab}>New Note</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default NoteView
