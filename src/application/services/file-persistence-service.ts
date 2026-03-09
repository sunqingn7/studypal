import { invoke } from '@tauri-apps/api/core'
import { Note, NoteTab } from '../../domain/models/note'
import { ChatTab } from '../store/ai-chat-store'

export interface FileSessionData {
  fileId: string
  filePath: string
  notes: {
    tabs: NoteTab[]
    activeTabId: string | null
    globalNotes: Note[]
  }
  aiChat: {
    tabs: ChatTab[]
    activeTabId: string | null
  }
  savedAt: number
}

/**
 * Get the notes directory path for a given file
 * Example: /path/to/document.pdf -> /path/to/document.pdf.notes/
 */
export function getNotesDirectoryPath(filePath: string): string {
  return `${filePath}.notes`
}

/**
 * Get the chat file path for a given file
 * Example: /path/to/document.pdf -> /path/to/document.pdf.chat.json
 */
export function getChatFilePath(filePath: string): string {
  return `${filePath}.chat.json`
}

/**
 * Get note file path within the notes directory
 * Example: /path/to/document.pdf.notes/note1.md
 */
export function getNoteFilePath(filePath: string, noteId: string, title: string): string {
  const notesDir = getNotesDirectoryPath(filePath)
  // Sanitize title for filename
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '_').slice(0, 50)
  const filename = sanitizedTitle ? `${sanitizedTitle}_${noteId.slice(0, 8)}.md` : `note_${noteId.slice(0, 8)}.md`
  return `${notesDir}/${filename}`
}

interface NoteData {
  id: string
  title: string
  content: string
  type: 'note' | 'ai-note'
  createdAt: number
  updatedAt: number
}

/**
 * Save notes to .md files in the notes directory
 */
export async function saveNotesToFiles(
  filePath: string,
  tabs: NoteTab[],
  activeTabId: string | null,
  notes: Map<string, NoteData>
): Promise<void> {
  try {
    // Ensure notes directory exists
    const notesDir = getNotesDirectoryPath(filePath)
    await invoke('ensure_directory_exists', { path: notesDir })

    // Save each note as a separate .md file
    for (const tab of tabs) {
      const note = notes.get(tab.noteId)
      if (note) {
        const noteFilePath = getNoteFilePath(filePath, note.id, tab.title)
        
        // Add metadata header to the markdown file
        const contentWithMetadata = `---
id: ${note.id}
title: ${tab.title}
createdAt: ${note.createdAt}
updatedAt: ${note.updatedAt}
type: ${note.type}
---

${note.content}
`
        await invoke('write_file', { 
          path: noteFilePath, 
          content: contentWithMetadata 
        })
      }
    }

    // Save tabs metadata (to preserve tab order and active state)
    const tabsMetadata = {
      tabs: tabs.map(t => ({
        id: t.id,
        noteId: t.noteId,
        title: t.title,
        isActive: t.isActive,
      })),
      activeTabId,
      savedAt: Date.now(),
    }
    
    const metadataPath = `${notesDir}/.tabs.json`
    await invoke('write_file', { 
      path: metadataPath, 
      content: JSON.stringify(tabsMetadata, null, 2) 
    })
  } catch (error) {
    console.error('[FilePersistence] Error saving notes:', error)
    throw error
  }
}

/**
 * Load notes from .md files in the notes directory
 */
export async function loadNotesFromFiles(
  filePath: string
): Promise<{ tabs: NoteTab[]; activeTabId: string | null; notes: Note[] } | null> {
  try {
    const notesDir = getNotesDirectoryPath(filePath)
    
    // Check if notes directory exists
    const exists = await invoke<boolean>('directory_exists', { path: notesDir })
    if (!exists) {
      return null
    }

    // Read tabs metadata
    const metadataPath = `${notesDir}/.tabs.json`
    const metadataExists = await invoke<boolean>('file_exists', { path: metadataPath })
    
    let tabsMetadata: { tabs: any[]; activeTabId: string | null } = { tabs: [], activeTabId: null }
    
    if (metadataExists) {
      const metadataContent = await invoke<string>('read_text_file', { path: metadataPath })
      tabsMetadata = JSON.parse(metadataContent)
    }

    // Read all .md files
    const files = await invoke<string[]>('list_files', { path: notesDir })
    const mdFiles = files.filter(f => f.endsWith('.md'))

    const notes: Note[] = []
    const tabs: NoteTab[] = []

    for (const mdFile of mdFiles) {
      const content = await invoke<string>('read_text_file', { path: mdFile })
      const parsed = parseMarkdownWithMetadata(content, mdFile)
      
      if (parsed) {
        notes.push(parsed.note)
        
        // Find matching tab from metadata
        const tabMetadata = tabsMetadata.tabs.find(t => t.noteId === parsed.note.id)
        if (tabMetadata) {
          tabs.push({
            id: tabMetadata.id,
            noteId: tabMetadata.noteId,
            title: tabMetadata.title,
            isActive: tabMetadata.isActive,
          })
        }
      }
    }

    // Sort tabs according to metadata order
    const tabOrder = new Map(tabsMetadata.tabs.map((t, i) => [t.id, i]))
    tabs.sort((a, b) => (tabOrder.get(a.id) || 0) - (tabOrder.get(b.id) || 0))

    return {
      tabs,
      activeTabId: tabsMetadata.activeTabId,
      notes,
    }
  } catch (error) {
    console.error('[FilePersistence] Error loading notes:', error)
    return null
  }
}

/**
 * Parse markdown content with YAML frontmatter metadata
 */
function parseMarkdownWithMetadata(content: string, filePath: string): { note: Note; content: string } | null {
  try {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/)
    
    if (!frontmatterMatch) {
      // No frontmatter, treat as simple note
      const id = crypto.randomUUID()
      const filename = filePath.split('/').pop()?.replace('.md', '') || 'Untitled'
      return {
        note: {
          id,
          title: filename,
          content: content,
          type: 'note',
          topicId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        content: content,
      }
    }

    const [, frontmatter, noteContent] = frontmatterMatch
    const metadata: Record<string, any> = {}
    
    for (const line of frontmatter.split('\n')) {
      const [key, ...valueParts] = line.split(':')
      if (key && valueParts.length > 0) {
        metadata[key.trim()] = valueParts.join(':').trim()
      }
    }

    return {
      note: {
        id: metadata.id || crypto.randomUUID(),
        title: metadata.title || 'Untitled',
        content: noteContent,
        type: (metadata.type as 'note' | 'ai-note') || 'note',
        topicId: null, // File-associated notes don't have topics
        createdAt: parseInt(metadata.createdAt) || Date.now(),
        updatedAt: parseInt(metadata.updatedAt) || Date.now(),
      },
      content: noteContent,
    }
  } catch (error) {
    console.error('[FilePersistence] Error parsing markdown:', error)
    return null
  }
}

/**
 * Save AI chat to JSON file
 */
export async function saveAIChatToFile(
  filePath: string,
  tabs: ChatTab[],
  activeTabId: string | null
): Promise<void> {
  try {
    const chatFilePath = getChatFilePath(filePath)
    
    const chatData = {
      tabs: tabs.map(t => ({
        id: t.id,
        title: t.title,
        messages: t.messages,
        isActive: t.isActive,
        userMessageHistory: t.userMessageHistory || [],
        historyIndex: t.historyIndex ?? -1,
      })),
      activeTabId,
      savedAt: Date.now(),
    }

    await invoke('write_file', {
      path: chatFilePath,
      content: JSON.stringify(chatData, null, 2),
    })
  } catch (error) {
    console.error('[FilePersistence] Error saving AI chat:', error)
    throw error
  }
}

/**
 * Load AI chat from JSON file
 */
export async function loadAIChatFromFile(
  filePath: string
): Promise<{ tabs: ChatTab[]; activeTabId: string | null } | null> {
  try {
    const chatFilePath = getChatFilePath(filePath)
    
    const exists = await invoke<boolean>('file_exists', { path: chatFilePath })
    if (!exists) {
      return null
    }

    const content = await invoke<string>('read_text_file', { path: chatFilePath })
    const data = JSON.parse(content)

    return {
      tabs: data.tabs || [],
      activeTabId: data.activeTabId || null,
    }
  } catch (error) {
    console.error('[FilePersistence] Error loading AI chat:', error)
    return null
  }
}

/**
 * Clear current file session data (called when switching files)
 */
export async function clearCurrentSession(): Promise<void> {
  // This is handled by the stores directly
  // We just provide this for clarity in the API
  console.log('[FilePersistence] Clearing current session')
}

/**
 * Check if file has existing notes/chat
 */
export async function hasExistingSession(filePath: string): Promise<boolean> {
  try {
    const notesDir = getNotesDirectoryPath(filePath)
    const chatFile = getChatFilePath(filePath)
    
    const [notesExists, chatExists] = await Promise.all([
      invoke<boolean>('directory_exists', { path: notesDir }),
      invoke<boolean>('file_exists', { path: chatFile }),
    ])
    
    return notesExists || chatExists
  } catch (error) {
    console.error('[FilePersistence] Error checking session:', error)
    return false
  }
}