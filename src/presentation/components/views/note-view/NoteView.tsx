import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { marked } from 'marked'
import { useNoteStore } from '../../../../application/store/note-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import { useFileStore } from '../../../../application/store/file-store'
import './NoteView.css'

const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32]

function NoteView() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, renameTab, updateNoteContent, getActiveNote } = useNoteStore()
  const { activeTopicId } = useTopicStore()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [fontSize, setFontSize] = useState(16)

  const activeNote = getActiveNote()

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start taking notes...',
      }),
    ],
    content: activeNote?.content || '',
    editorProps: {
      attributes: {
        style: `font-size: ${fontSize}px`,
      },
    },
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
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            style: `font-size: ${fontSize}px`,
          },
        },
      })
    }
  }, [fontSize, editor])

  marked.use({ gfm: true, breaks: true })

  function isMarkdown(text: string): boolean {
    return /^(#{1,6}\s|\*\*|__|\*|_|`{1,3}|```|\[\[?|>\s|[-*]\s)/m.test(text)
  }

  function getDisplayContent(content: string): string {
    if (!content || !isMarkdown(content)) return content
    try {
      return marked.parse(content) as string
    } catch {
      return content
    }
  }

  useEffect(() => {
    if (editor && activeNote) {
      console.log('[NoteView] Syncing editor, activeNote:', activeNote.id, 'content length:', activeNote.content?.length)
      const displayContent = getDisplayContent(activeNote.content || '')
      editor.commands.setContent(displayContent)
    }
  }, [editor, activeNote?.id, activeNote?.content])

  // Track if we've initialized tabs to prevent duplicates
  const initializedRef = useRef(false)

  useEffect(() => {
    // Skip if already initialized
    if (initializedRef.current) return;

    // Don't auto-create tabs if no file is open (system state handles it)
    const currentFile = useFileStore.getState().currentFile;
    if (!currentFile && tabs.length === 0) {
      // System state will be loaded, don't create default tabs here
      return;
    }
    if (tabs.length === 0) {
      initializedRef.current = true;
      addTab(activeTopicId)
    }
  }, [])

  // Also handle when system state gets loaded
  useEffect(() => {
    const currentFile = useFileStore.getState().currentFile;
    if (!currentFile && tabs.length > 0) {
      // System state loaded tabs, mark as initialized
      initializedRef.current = true;
    }
  }, [tabs.length]);

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

  const decreaseFontSize = () => {
    setFontSize((prev) => Math.max(10, prev - 2))
  }

  const increaseFontSize = () => {
    setFontSize((prev) => Math.min(48, prev + 2))
  }

  const setSpecificFontSize = (size: number) => {
    setFontSize(size)
  }

  if (!editor) {
    return (
      <div className="view-container note-view">
        <div className="view-content note-view-content">
          <div className="note-empty">
            <p>Loading editor...</p>
          </div>
        </div>
      </div>
    )
  }

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
        
        <div className="note-toolbar">
          <div className="toolbar-group">
            <button
              className="toolbar-button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              disabled={!editor.can().chain().focus().toggleBold().run()}
              title="Bold (Ctrl+B)"
            >
              <strong>B</strong>
            </button>
            <button
              className="toolbar-button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              disabled={!editor.can().chain().focus().toggleItalic().run()}
              title="Italic (Ctrl+I)"
            >
              <em>I</em>
            </button>
            <button
              className="toolbar-button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              disabled={!editor.can().chain().focus().toggleHeading({ level: 1 }).run()}
              title="Heading 1"
            >
              H1
            </button>
            <button
              className="toolbar-button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              disabled={!editor.can().chain().focus().toggleHeading({ level: 2 }).run()}
              title="Heading 2"
            >
              H2
            </button>
            <button
              className="toolbar-button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              disabled={!editor.can().chain().focus().toggleBulletList().run()}
              title="Bullet List"
            >
              • List
            </button>
            <button
              className="toolbar-button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              disabled={!editor.can().chain().focus().toggleOrderedList().run()}
              title="Numbered List"
            >
              1. List
            </button>
          </div>
          
          <div className="toolbar-separator" />
          
          <div className="toolbar-group font-size-controls">
            <span className="font-size-label">Size:</span>
            <button
              className="toolbar-button font-size-button"
              onClick={decreaseFontSize}
              title="Decrease font size"
            >
              A-
            </button>
            <select
              className="font-size-select"
              value={fontSize}
              onChange={(e) => setSpecificFontSize(Number(e.target.value))}
              title="Font size"
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
            <button
              className="toolbar-button font-size-button"
              onClick={increaseFontSize}
              title="Increase font size"
            >
              A+
            </button>
          </div>
        </div>
      </div>
      
      <div className="view-content note-view-content">
        <EditorContent editor={editor} className="note-editor" />
      </div>
    </div>
  )
}

export default NoteView
