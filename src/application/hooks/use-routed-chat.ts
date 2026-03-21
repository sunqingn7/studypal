import { useCallback } from 'react'
import { useLLMPoolStore } from '../store/llm-pool-store'
import { useAIChatStore } from '../store/ai-chat-store'
import {
  parseChatMessage,
  ChatRoutingResult,
  getAvailableNicknames,
} from '../services/chat-routing-service'
import { PoolProvider } from '../../domain/models/llm-pool'

export interface RoutedChatHook {
  // Send message with automatic routing
  sendRoutedMessage: (message: string) => Promise<void>
  // Get routing info without sending
  previewRouting: (message: string) => ChatRoutingResult
  // Get available nicknames for autocomplete
  availableNicknames: string[]
  // Currently targeted providers for UI display
  getTargetProviders: (result: ChatRoutingResult) => PoolProvider[]
}

export function useRoutedChat(): RoutedChatHook {
  const { providers, getPrimaryProvider, submitTask } = useLLMPoolStore()
  const { addMessage, activeTabId } = useAIChatStore()

  const previewRouting = useCallback(
    (message: string): ChatRoutingResult => {
      return parseChatMessage(message, providers)
    },
    [providers]
  )

  const getTargetProviders = useCallback(
    (result: ChatRoutingResult): PoolProvider[] => {
      if (result.mode === 'auto') {
        // In auto mode, use primary provider or first available
        const primary = getPrimaryProvider()
        return primary ? [primary] : []
      }

      return providers.filter(p => result.targetProviderIds.includes(p.id))
    },
    [providers, getPrimaryProvider]
  )

  const sendRoutedMessage = useCallback(
    async (message: string): Promise<void> => {
      if (!activeTabId || !message.trim()) return

      // Add user message to chat
      addMessage(activeTabId, 'user', message)

      // Parse routing
      const routing = parseChatMessage(message, providers)
      const targetProviders = getTargetProviders(routing)

      if (targetProviders.length === 0) {
        // No providers available - show error
        addMessage(
          activeTabId,
          'assistant',
          'No LLM providers are available. Please check your LLM Pool configuration.'
        )
        return
      }

      // Handle different modes
      switch (routing.mode) {
        case 'auto':
          // Auto mode: Send to primary provider (or random if configured)
          await handleAutoMode(routing.cleanMessage, targetProviders[0])
          break

        case 'assigned':
          // Assigned mode: Send to specific provider(s)
          await handleAssignedMode(routing.cleanMessage, targetProviders)
          break

        case 'discuss':
          // Discuss mode: Send to all providers
          await handleDiscussMode(routing.cleanMessage, targetProviders)
          break
      }
    },
    [activeTabId, providers, addMessage, getTargetProviders, submitTask]
  )

  const handleAutoMode = async (message: string, provider: PoolProvider) => {
    if (!activeTabId) return

    try {
      // Submit task to the provider
      // Note: This would be integrated with your actual LLM calling logic
      // For now, we'll just add a placeholder response
      addMessage(
        activeTabId,
        'assistant',
        `[${provider.nickname || provider.name}] Processing: ${message}`
      )
    } catch (_error) {
      addMessage(
        activeTabId,
        'assistant',
        `Error: Failed to get response from ${provider.nickname || provider.name}`
      )
    }
  }

  const handleAssignedMode = async (
    message: string,
    targetProviders: PoolProvider[]
  ) => {
    if (!activeTabId) return

    // Send to specific provider(s)
    for (const provider of targetProviders) {
      try {
        // Submit task to the provider
        // Note: This would be integrated with your actual LLM calling logic
        addMessage(
          activeTabId,
          'assistant',
          `[${provider.nickname || provider.name}] Processing: ${message}`
        )
      } catch (error) {
        addMessage(
          activeTabId,
          'assistant',
          `[${provider.nickname || provider.name}] Error: Failed to respond`
        )
      }
    }
  }

  const handleDiscussMode = async (
    message: string,
    targetProviders: PoolProvider[]
  ) => {
    if (!activeTabId) return

    // Start a discussion with all providers
    addMessage(
      activeTabId,
      'assistant',
      `**Brainstorm Session Started**\n${targetProviders.length} LLMs will contribute their thoughts on: "${message}"`
    )

    // Send to all providers
    for (const provider of targetProviders) {
      try {
        // Submit task to the provider
        // Note: This would be integrated with your actual LLM calling logic
        addMessage(
          activeTabId,
          'assistant',
          `[${provider.nickname || provider.name}] Processing discussion...`
        )
      } catch (error) {
        addMessage(
          activeTabId,
          'assistant',
          `[${provider.nickname || provider.name}] Error: Failed to respond`
        )
      }
    }
  }

  return {
    sendRoutedMessage,
    previewRouting,
    availableNicknames: getAvailableNicknames(providers),
    getTargetProviders,
  }
}
