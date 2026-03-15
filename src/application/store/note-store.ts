import { create } from 'zustand'
import { Note, NoteTab, GlobalNote, TopicNote } from '../../domain/models/note'

interface NoteStore {
  tabs: NoteTab[]
  activeTabId: string | null
  globalNotes: GlobalNote[]
  topicNotes: Map<string, TopicNote[]>

  addTab: (topicId: string | null, title?: string) => string
  createTabForNote: (noteId: string, title: string) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string | null) => void
  renameTab: (tabId: string, newTitle: string) => void

  getNote: (noteId: string) => Note | undefined
  getNoteContent: (noteId: string) => string
  updateNoteContent: (noteId: string, content: string) => void
  createNote: (topicId: string | null, title: string, type: 'note' | 'ai-note') => Note
  deleteNote: (noteId: string) => void

  getActiveNote: () => Note | undefined
  getNotesForTopic: (topicId: string) => TopicNote[]
  getGlobalNotes: () => GlobalNote[]

  serialize: () => { tabs: NoteTab[]; globalNotes: GlobalNote[]; topicNotes: [string, TopicNote[]][] }
  deserialize: (data: { tabs: NoteTab[]; globalNotes: GlobalNote[]; topicNotes: [string, TopicNote[]][] }) => void
  clear: () => void
}

function generateDefaultTitle(notes: Note[], type: 'note' | 'ai-note'): string {
  const prefix = type === 'note' ? 'Note' : 'AINote'
  const existingNumbers = notes
    .filter((n) => n.title.startsWith(prefix))
    .map((n) => {
      const match = n.title.match(/(\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
  const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1
  return `${prefix}-${nextNumber}`
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  globalNotes: [],
  topicNotes: new Map(),

  addTab: (topicId, title) => {
    const note = get().createNote(topicId, title || '', title ? 'note' : 'note')
    const noteTitle = title || generateDefaultTitle(
      topicId ? get().topicNotes.get(topicId) || [] : get().globalNotes,
      'note'
    )
    
    const newTab: NoteTab = {
      id: crypto.randomUUID(),
      noteId: note.id,
      title: noteTitle,
      isActive: true,
    }

    set((state) => ({
      tabs: [...state.tabs.map((t) => ({ ...t, isActive: false })), newTab],
      activeTabId: newTab.id,
    }))

    return newTab.id
  },

  createTabForNote: (noteId, title) => {
    const newTab: NoteTab = {
      id: crypto.randomUUID(),
      noteId: noteId,
      title: title,
      isActive: true,
    }

    set((state) => ({
      tabs: [...state.tabs.map((t) => ({ ...t, isActive: false })), newTab],
      activeTabId: newTab.id,
    }))

    return newTab.id
  },

  removeTab: (tabId) => {
    set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== tabId)
    
    let newActiveTabId = state.activeTabId
      if (state.activeTabId === tabId && newTabs.length > 0) {
        newActiveTabId = newTabs[newTabs.length - 1].id
        newTabs[newTabs.length - 1].isActive = true
      } else if (newTabs.length === 0) {
        newActiveTabId = null
      }

      return { tabs: newTabs, activeTabId: newActiveTabId }
    })
  },

  setActiveTab: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((t) => ({ ...t, isActive: t.id === tabId })),
      activeTabId: tabId,
    }))
  },

  renameTab: (tabId, newTitle) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, title: newTitle } : t)),
    }))
  },

  getNote: (noteId) => {
    const { globalNotes, topicNotes } = get()
    const globalNote = globalNotes.find((n) => n.id === noteId)
    if (globalNote) return globalNote

    for (const notes of topicNotes.values()) {
      const topicNote = notes.find((n) => n.id === noteId)
      if (topicNote) return topicNote
    }
    return undefined
  },

  getNoteContent: (noteId) => {
    const note = get().getNote(noteId)
    return note?.content || ''
  },

  updateNoteContent: (noteId, content) => {
    set((state) => {
      const globalNotes = state.globalNotes.map((n) =>
        n.id === noteId ? { ...n, content, updatedAt: Date.now() } : n
      )
      const topicNotes = new Map(state.topicNotes)
      for (const [topicId, notes] of topicNotes.entries()) {
        topicNotes.set(
          topicId,
          notes.map((n) => (n.id === noteId ? { ...n, content, updatedAt: Date.now() } : n))
        )
      }
      return { globalNotes, topicNotes }
    })
  },

  createNote: (topicId, title, type) => {
    const note: Note = {
      id: crypto.randomUUID(),
      title,
      content: '',
      type,
      topicId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    if (topicId === null) {
      set((state) => ({ globalNotes: [...state.globalNotes, note as GlobalNote] }))
    } else {
      set((state) => {
        const topicNotes = new Map(state.topicNotes)
        const existing = topicNotes.get(topicId) || []
        topicNotes.set(topicId, [...existing, note as TopicNote])
        return { topicNotes }
      })
    }

    return note
  },

  deleteNote: (noteId) => {
    set((state) => ({
      globalNotes: state.globalNotes.filter((n) => n.id !== noteId),
      topicNotes: new Map(
        Array.from(state.topicNotes.entries()).map(([topicId, notes]) => [
          topicId,
          notes.filter((n) => n.id !== noteId),
        ])
      ),
      tabs: state.tabs.filter((t) => t.noteId !== noteId),
    }))
  },

  getActiveNote: () => {
    const { tabs, activeTabId } = get()
    if (!activeTabId) return undefined
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab) return undefined
    return get().getNote(activeTab.noteId)
  },

  getNotesForTopic: (topicId) => {
    return get().topicNotes.get(topicId) || []
  },

  getGlobalNotes: () => {
    return get().globalNotes
  },

  serialize: () => {
    const { tabs, globalNotes, topicNotes } = get()
    return {
      tabs,
      globalNotes,
      topicNotes: Array.from(topicNotes.entries()),
    }
  },

  deserialize: (data) => {
    if (!data) {
      set({
        tabs: [],
        activeTabId: null,
        globalNotes: [],
        topicNotes: new Map(),
      })
      return
    }
    set({
      tabs: data.tabs || [],
      activeTabId: data.tabs?.find((t) => t.isActive)?.id || null,
      globalNotes: data.globalNotes || [],
      topicNotes: new Map(data.topicNotes || []),
    })
  },

  clear: () => {
    console.log('[NoteStore] Clearing all notes and tabs')
    set({
      tabs: [],
      activeTabId: null,
      globalNotes: [],
      topicNotes: new Map(),
    })
    console.log('[NoteStore] Clear complete')
  },
}))
