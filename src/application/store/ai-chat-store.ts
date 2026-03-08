import { create } from 'zustand'
import { ChatMessage, AIConfig, DEFAULT_AI_CONFIG } from '../../domain/models/ai-context'

interface ChatTab {
  id: string
  title: string
  messages: ChatMessage[]
  isActive: boolean
}

interface AIChatStore {
  tabs: ChatTab[]
  activeTabId: string | null
  config: AIConfig
  isStreaming: boolean

  // Tab management
  addTab: (title?: string) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string | null) => void
  renameTab: (tabId: string, newTitle: string) => void

  // Chat operations
  addMessage: (tabId: string, role: 'user' | 'assistant', content: string) => void
  clearChat: (tabId: string) => void
  getActiveTab: () => ChatTab | undefined
  getActiveMessages: () => ChatMessage[]

  // Config
  setConfig: (config: Partial<AIConfig>) => void
  setStreaming: (isStreaming: boolean) => void
}

export const useAIChatStore = create<AIChatStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  config: DEFAULT_AI_CONFIG,
  isStreaming: false,

  addTab: (title) => {
    const newTab: ChatTab = {
      id: crypto.randomUUID(),
      title: title || `Chat ${get().tabs.length + 1}`,
      messages: [],
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
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, title: newTitle } : t
      ),
    }))
  },

  addMessage: (tabId, role, content) => {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
    }

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, messages: [...t.messages, message] }
          : t
      ),
    }))
  },

  clearChat: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, messages: [] } : t
      ),
    }))
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get()
    if (!activeTabId) return undefined
    return tabs.find((t) => t.id === activeTabId)
  },

  getActiveMessages: () => {
    const activeTab = get().getActiveTab()
    return activeTab?.messages || []
  },

  setConfig: (config) => {
    set((state) => ({ config: { ...state.config, ...config } }))
  },

  setStreaming: (isStreaming) => {
    set({ isStreaming })
  },
}))
