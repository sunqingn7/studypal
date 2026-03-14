import { create } from 'zustand'
import { ChatMessage, AIConfig, DEFAULT_AI_CONFIG, AIProviderType, PROVIDER_DEFAULTS, ProviderConfigs } from '../../domain/models/ai-context'

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
  providerConfigs: ProviderConfigs
  isStreaming: boolean

  // Tab management
  addTab: (title?: string) => string
  removeTab: (tabId: string) => void
  setActiveTab: (tabId: string | null) => void
  renameTab: (tabId: string, newTitle: string) => void

  // Chat operations
  addMessage: (tabId: string, role: 'user' | 'assistant', content: string, thinking?: string) => void
  updateMessage: (tabId: string, messageId: string, content?: string, thinking?: string) => void
  clearChat: (tabId: string) => void
  getActiveTab: () => ChatTab | undefined
  getActiveMessages: () => ChatMessage[]

  // Config
  setConfig: (config: Partial<AIConfig>) => void
  switchProvider: (provider: AIProviderType) => void
  setStreaming: (isStreaming: boolean) => void
  // For loading saved state
  initializeProviderConfigs: (configs: Partial<ProviderConfigs>, savedProvider?: AIProviderType) => void

  // Serialize/deserialize for document persistence
  serialize: () => { tabs: ChatTab[] }
  deserialize: (data: { tabs: ChatTab[] }) => void
  clear: () => void
}

// Create default configs for all providers
const createDefaultProviderConfigs = (): ProviderConfigs => ({
  llamacpp: { ...DEFAULT_AI_CONFIG, provider: 'llamacpp', ...PROVIDER_DEFAULTS.llamacpp },
  ollama: { ...DEFAULT_AI_CONFIG, provider: 'ollama', ...PROVIDER_DEFAULTS.ollama },
  openai: { ...DEFAULT_AI_CONFIG, provider: 'openai', ...PROVIDER_DEFAULTS.openai },
  anthropic: { ...DEFAULT_AI_CONFIG, provider: 'anthropic', ...PROVIDER_DEFAULTS.anthropic },
  vllm: { ...DEFAULT_AI_CONFIG, provider: 'vllm', ...PROVIDER_DEFAULTS.vllm },
  custom: { ...DEFAULT_AI_CONFIG, provider: 'custom', ...PROVIDER_DEFAULTS.custom },
})

export const useAIChatStore = create<AIChatStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  config: DEFAULT_AI_CONFIG,
  providerConfigs: createDefaultProviderConfigs(),
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

  addMessage: (tabId, role, content, thinking) => {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      thinking,
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

  updateMessage: (tabId, messageId, content, thinking) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
        ? {
            ...t,
            messages: t.messages.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    ...(content !== undefined && { content }),
                    ...(thinking !== undefined && { thinking }),
                  }
                : m
            ),
          }
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
    set((state) => {
      const newConfig = { ...state.config, ...config }
      // Also update the provider-specific config
      const newProviderConfigs = {
        ...state.providerConfigs,
        [newConfig.provider]: newConfig,
      }
      return { config: newConfig, providerConfigs: newProviderConfigs }
    })
  },

  switchProvider: (provider) => {
    set((state) => {
      // Save current config before switching
      const currentProvider = state.config.provider
      const savedConfigs = {
        ...state.providerConfigs,
        [currentProvider]: state.config,
      }

      // Load config for new provider, or create default
      const newConfig = savedConfigs[provider] || {
        ...DEFAULT_AI_CONFIG,
        provider,
        ...PROVIDER_DEFAULTS[provider],
      }

      return {
        config: newConfig,
        providerConfigs: savedConfigs,
      }
    })
  },

  setStreaming: (isStreaming) => {
    set({ isStreaming })
  },

  initializeProviderConfigs: (configs, savedProvider?: AIProviderType) => {
    set((state) => {
      const mergedConfigs = { ...createDefaultProviderConfigs(), ...configs }
      const currentProvider = savedProvider || state.config.provider
      const savedConfig = mergedConfigs[currentProvider]
      
      if (savedConfig) {
        return {
          providerConfigs: mergedConfigs,
          config: { ...savedConfig, provider: currentProvider },
        }
      }
      
      return { 
        providerConfigs: mergedConfigs,
        // If no specific config for this provider, ensure the config has the right provider
        config: { ...state.config, provider: currentProvider }
      }
    })
  },

  serialize: () => {
    const { tabs } = get()
    return { tabs }
  },

  deserialize: (data) => {
    if (!data || !data.tabs) {
      set({
        tabs: [],
        activeTabId: null,
      })
      return
    }
    set({
      tabs: data.tabs || [],
      activeTabId: data.tabs?.find((t) => t.isActive)?.id || null,
    })
  },

  clear: () => {
    set({
      tabs: [],
      activeTabId: null,
    })
  },
}))
