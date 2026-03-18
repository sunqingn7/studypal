import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import { NoteTab, GlobalNote, TopicNote } from '../../domain/models/note'

console.log('[SessionStore] Module loaded')

export interface SerializedNoteState {
  tabs: NoteTab[]
  globalNotes: GlobalNote[]
  topicNotes: [string, TopicNote[]][]
}

export interface SerializedChatState {
  tabs: {
    id: string
    title: string
    messages: ChatMessage[]
    isActive: boolean
  }[]
}

export interface PanelSizes {
  sidebar: number
  file: number
  ai: number
  note: number
}

export interface WindowState {
  width: number
  height: number
  x: number
  y: number
}

export interface FileHistoryItem {
  id: string
  path: string
  name: string
  lastOpened: number
}

export interface SessionData {
  window: WindowState
  panels: PanelSizes
  currentFile: string | null
  currentFilePath: string | null
  currentPage: number
  scrollPosition: number
  showFileBrowser: boolean
  theme: 'light' | 'dark'
  aiConfig: AIConfig | null
  chatHistory: ChatMessage[]
  documentNotes: Record<string, SerializedNoteState>
  documentChat: Record<string, SerializedChatState>
  fileHistory: FileHistoryItem[]
  lastUpdated: number
}

export const DEFAULT_SESSION: SessionData = {
  window: { width: 1200, height: 800, x: 100, y: 100 },
  panels: { sidebar: 25, file: 35, ai: 50, note: 50 },
  currentFile: null,
  currentFilePath: null,
  currentPage: 1,
  scrollPosition: 0,
  showFileBrowser: true,
  theme: 'light',
  aiConfig: null,
  chatHistory: [],
  documentNotes: {},
  documentChat: {},
  fileHistory: [],
  lastUpdated: Date.now(),
}

interface SessionStore {
  session: SessionData
  setPanelSize: (panel: keyof PanelSizes, size: number) => void
  setWindowState: (state: Partial<WindowState>) => void
  setCurrentFile: (file: string | null, filePath?: string | null, page?: number, scroll?: number) => void
  setShowFileBrowser: (show: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
  setAIConfig: (config: AIConfig) => void
  setChatHistory: (history: ChatMessage[]) => void
  setDocumentNotes: (documentId: string, notes: SerializedNoteState) => void
  getDocumentNotes: (documentId: string) => SerializedNoteState | undefined
  setDocumentChat: (documentId: string, chat: SerializedChatState) => void
  getDocumentChat: (documentId: string) => SerializedChatState | undefined
  addToFileHistory: (id: string, path: string, name: string) => void
  getFileHistory: () => FileHistoryItem[]
  clearFileHistory: () => void
  getSession: () => SessionData
  loadSession: (session: SessionData) => void
  clearSessionData: () => void
}

// Simple storage wrapper using localStorage
const storageWrapper = {
  getItem: (name: string): string | null => {
    const value = localStorage.getItem(name)
    console.log('[SessionStorage] getItem:', name, value ? 'found' : 'not found')
    return value
  },
  setItem: (name: string, value: string): void => {
    console.log('[SessionStorage] setItem:', name, value.substring(0, 80))
    localStorage.setItem(name, value)
  },
  removeItem: (name: string): void => {
    localStorage.removeItem(name)
    console.log('[SessionStorage] removeItem:', name)
  },
}

const logAction = (action: string) => {
  console.log('[SessionStore]', action)
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      session: DEFAULT_SESSION,

      setPanelSize: (panel, size) => {
        logAction('setPanelSize ' + panel + ' = ' + size)
        set({
          session: {
            ...get().session,
            panels: { ...get().session.panels, [panel]: size },
            lastUpdated: Date.now(),
          },
        })
      },

      setWindowState: (windowState) => {
        logAction('setWindowState')
        set({
          session: {
            ...get().session,
            window: { ...get().session.window, ...windowState },
            lastUpdated: Date.now(),
          },
        })
      },

      setCurrentFile: (file, filePath = null, page = 1, scroll = 0) => {
        logAction('setCurrentFile')
        set({
          session: {
            ...get().session,
            currentFile: file,
            currentFilePath: filePath,
            currentPage: page,
            scrollPosition: scroll,
            lastUpdated: Date.now(),
          },
        })
      },

      setShowFileBrowser: (show) => {
        logAction('setShowFileBrowser ' + show)
        set({
          session: {
            ...get().session,
            showFileBrowser: show,
            lastUpdated: Date.now(),
          },
        })
      },

      setTheme: (theme) => {
        logAction('setTheme ' + theme)
        set({
          session: {
            ...get().session,
            theme,
            lastUpdated: Date.now(),
          },
        })
      },

      setAIConfig: (config) => {
        logAction('setAIConfig')
        set({
          session: {
            ...get().session,
            aiConfig: config,
            lastUpdated: Date.now(),
          },
        })
      },

      setChatHistory: (history) => {
        logAction('setChatHistory')
        set({
          session: {
            ...get().session,
            chatHistory: history,
            lastUpdated: Date.now(),
          },
        })
      },

      setDocumentNotes: (documentId, notes) => {
        logAction('setDocumentNotes ' + documentId)
        set({
          session: {
            ...get().session,
            documentNotes: {
              ...(get().session.documentNotes || {}),
              [documentId]: notes,
            },
            lastUpdated: Date.now(),
          },
        })
      },

      getDocumentNotes: (documentId) => {
        return get().session.documentNotes?.[documentId]
      },

      setDocumentChat: (documentId, chat) => {
        logAction('setDocumentChat ' + documentId)
        set({
          session: {
            ...get().session,
            documentChat: {
              ...(get().session.documentChat || {}),
              [documentId]: chat,
            },
            lastUpdated: Date.now(),
          },
        })
      },

      getDocumentChat: (documentId) => {
        return get().session.documentChat?.[documentId]
      },

      addToFileHistory: (id, path, name) => {
        const history = get().session.fileHistory || []
        const existingIndex = history.findIndex(item => item.path === path)
        
        let newHistory: FileHistoryItem[]
        if (existingIndex !== -1) {
          newHistory = [
            { ...history[existingIndex], lastOpened: Date.now() },
            ...history.slice(0, existingIndex),
            ...history.slice(existingIndex + 1)
          ]
        } else {
          newHistory = [
            { id, path, name, lastOpened: Date.now() },
            ...history
          ].slice(0, 50)
        }
        
        set({
          session: {
            ...get().session,
            fileHistory: newHistory,
            lastUpdated: Date.now(),
          },
        })
      },

      getFileHistory: () => {
        return get().session.fileHistory || []
      },

      clearFileHistory: () => {
        set({
          session: {
            ...get().session,
            fileHistory: [],
            lastUpdated: Date.now(),
          },
        })
      },

      getSession: () => get().session,

      loadSession: (session) => {
        set({ session: { ...DEFAULT_SESSION, ...session, lastUpdated: Date.now() } })
      },

      clearSessionData: () => {
        console.log('[SessionStore] Clearing all session data')
        set({
          session: {
            ...DEFAULT_SESSION,
            documentNotes: {},
            documentChat: {},
            lastUpdated: Date.now(),
          }
        })
        console.log('[SessionStore] Session data cleared')
      },
    }),
    {
      name: 'studypal-session',
      storage: createJSONStorage(() => storageWrapper),
    }
  )
)
