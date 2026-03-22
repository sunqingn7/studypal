import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import { useNoteStore } from '../../../../application/store/note-store'
import { useTopicStore } from '../../../../application/store/topic-store'
import './NoteView.css'

const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24, 28, 32]

function isHtmlContent(text: string): boolean {
  return /^<(p|div|span|h[1-6]|ul|ol|li|br|b|i|strong|em|blockquote|pre|code|table|tr|td|th|a|img)[^>]*>/i.test(text.trim())
}

function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const el = doc.body.firstElementChild as HTMLElement
  if (!el) return html

  function processEl(node: Node, inList = false): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').replace(/\n+/g, ' ').trim()
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    const inner = Array.from(el.childNodes).map(n => processEl(n, inList || tag === 'ul' || tag === 'ol')).join('')

    switch (tag) {
      case 'p':
      case 'div': {
        const text = inner.trim()
        if (!text) return ''
        const parts = text.split(/\n{2,}/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean)
        return parts.map(p => p + '\n').join('')
      }
      case 'br': return '\n'
      case 'strong':
      case 'b': return `**${inner}**`
      case 'em':
      case 'i': return `*${inner}*`
      case 'u': return `<u>${inner}</u>`
      case 's':
      case 'del': return `~~${inner}~~`
      case 'code': {
        const code = el.querySelector('br') ? inner.replace(/\n/g, ' ') : inner
        return code.includes(' ') && !code.startsWith(' ') && !code.endsWith(' ') ? `\`${code}\`` : code
      }
      case 'pre': return `\`\`\`\n${inner.replace(/\n+$/, '')}\n\`\`\`\n`
      case 'blockquote': {
        const lines = inner.split('\n').filter(l => l.trim())
        return lines.map(l => `> ${l}`).join('\n') + '\n'
      }
      case 'h1': return `# ${inner.trim()}\n`
      case 'h2': return `## ${inner.trim()}\n`
      case 'h3': return `### ${inner.trim()}\n`
      case 'h4': return `#### ${inner.trim()}\n`
      case 'h5': return `##### ${inner.trim()}\n`
      case 'h6': return `###### ${inner.trim()}\n`
      case 'ul': {
        const items = Array.from(el.querySelectorAll(':scope > li')).map(li => {
          return '  - ' + Array.from(li.childNodes).map(n => processEl(n, true)).join('').trim()
        })
        return items.join('\n') + '\n'
      }
      case 'ol': {
        const items = Array.from(el.querySelectorAll(':scope > li')).map((li, i) => {
          return `  ${i + 1}. ` + Array.from(li.childNodes).map(n => processEl(n, true)).join('').trim()
        })
        return items.join('\n') + '\n'
      }
      case 'li': {
        const children = Array.from(el.childNodes).filter(n => n.nodeType !== Node.TEXT_NODE || n.textContent?.trim())
        return children.map(n => processEl(n, true)).join('')
      }
      case 'a': {
        const href = el.getAttribute('href') || ''
        const text = inner.trim()
        return href === text ? `<${href}>` : `[${text}](${href})`
      }
      case 'img': {
        const src = el.getAttribute('src') || ''
        const alt = el.getAttribute('alt') || ''
        return `![${alt}](${src})`
      }
      case 'table': {
        const rows = el.querySelectorAll('tr')
        if (!rows.length) return inner
        const lines: string[] = []
        rows.forEach((row, ri) => {
          const cells = row.querySelectorAll('th, td')
          const rowText = Array.from(cells).map(c => {
            const cEl = c as HTMLElement
            return cEl.textContent?.trim() || ''
          }).map(t => ` ${t} |`).join('')
          lines.push('|' + rowText)
          if (ri === 0) {
            const sep = Array.from(cells).map(() => '---|').join('')
            lines.push('|' + sep)
          }
        })
        return lines.join('\n') + '\n'
      }
      case 'script':
      case 'style':
      case 'head':
      case 'html':
      case 'body': return inner
      default: {
        if (el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
          return inner
        }
        return inner
      }
    }
  }

  return processEl(el).replace(/\n{3,}/g, '\n\n').trim()
}

function NoteView() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, renameTab, updateNoteContent, getActiveNote } = useNoteStore()
  const { activeTopicId } = useTopicStore()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [fontSize, setFontSize] = useState(16)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  const activeNote = getActiveNote()

  const noteContent = activeNote?.content || ''

  const displayContent = useMemo(() => {
    if (!noteContent) return ''
    if (isHtmlContent(noteContent)) {
      return noteContent
    }
    return noteContent
  }, [noteContent])

  const isHtmlNote = useMemo(() => isHtmlContent(noteContent), [noteContent])

  useEffect(() => {
    if (activeNote) {
      const raw = activeNote.content || ''
      if (isHtmlContent(raw)) {
        const md = htmlToMarkdown(raw)
        setEditContent(md)
      } else {
        setEditContent(raw)
      }
    }
  }, [activeNote?.id])

  // Clean up save timeout on unmount to prevent timers firing on unmounted components
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      if (activeNote && editContent !== activeNote.content) {
        updateNoteContent(activeNote.id, editContent)
      }
    } else {
      if (activeNote) {
        const raw = activeNote.content || ''
        if (isHtmlContent(raw)) {
          const md = htmlToMarkdown(raw)
          setEditContent(md)
          updateNoteContent(activeNote.id, md)
        } else {
          setEditContent(raw)
        }
      }
    }
    setIsEditing(!isEditing)
  }, [isEditing, activeNote, editContent, updateNoteContent])

  const activeNoteIdRef = useRef(activeNote?.id)
  useEffect(() => {
    activeNoteIdRef.current = activeNote?.id
  }, [activeNote?.id])

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setEditContent(value)
    const currentNoteId = activeNoteIdRef.current
    if (currentNoteId) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        const currentNoteIdNow = activeNoteIdRef.current
        if (currentNoteIdNow) {
          updateNoteContent(currentNoteIdNow, value)
        }
      }, 500)
    }
  }, [updateNoteContent])

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

  const handleCreateNote = useCallback(() => {
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
        <div className="view-header note-view-header">
          <div className="note-tabs">
            <button className="add-tab-button" onClick={handleCreateNote}>+</button>
          </div>
        </div>
        <div className="view-content note-view-content">
          <div className="note-empty">
            <p>No note selected. Click + to create one.</p>
            <button className="note-empty-create" onClick={handleCreateNote}>Create Note</button>
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
              isHtmlNote ? (
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayContent) }} />
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkMath, remarkGfm]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {displayContent}
                </ReactMarkdown>
              )
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
