import { create } from 'zustand'
import {
  AIConfig,
  AIState,
  ChatMessage,
  CONTEXT_TRIGGERS,
  DEFAULT_AI_CONFIG,
  ContextSource,
} from '../../domain/models/ai-context'

interface AIStore extends AIState {
  setConfig: (config: Partial<AIConfig>) => void
  addMessage: (role: 'user' | 'assistant', content: string) => void
  clearHistory: () => void
  setStreaming: (isStreaming: boolean) => void
  addContext: (source: ContextSource, content: string, metadata?: Record<string, unknown>) => void
  clearContext: () => void
  detectContextTriggers: (message: string) => ContextSource[]
  setChatHistory: (history: ChatMessage[]) => void
}

export const useAIStore = create<AIStore>((set) => ({
  config: DEFAULT_AI_CONFIG,
  chatHistory: [],
  isStreaming: false,
  currentContext: { items: [], isComplete: false },

  setConfig: (config) => {
    set((state) => ({ config: { ...state.config, ...config } }))
  },

  addMessage: (role, content) => {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
    }
    set((state) => ({ chatHistory: [...state.chatHistory, message] }))
  },

  clearHistory: () => {
    set({ chatHistory: [] })
  },

  setChatHistory: (history) => {
    set({ chatHistory: history })
  },

  setStreaming: (isStreaming) => {
    set({ isStreaming })
  },

  addContext: (source, content, metadata) => {
    set((state) => ({
      currentContext: {
        ...state.currentContext,
        items: [
          ...state.currentContext.items,
          { source, content, metadata },
        ],
      },
    }))
  },

  clearContext: () => {
    set({ currentContext: { items: [], isComplete: false } })
  },

  detectContextTriggers: (message) => {
    const lowerMessage = message.toLowerCase()
    const triggers: ContextSource[] = []

    for (const [source, keywords] of Object.entries(CONTEXT_TRIGGERS)) {
      if (keywords.some((keyword) => lowerMessage.includes(keyword))) {
        triggers.push(source as ContextSource)
      }
    }

    return triggers
  },
}))
