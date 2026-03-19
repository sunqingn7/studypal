import { PoolProvider, LLMTask } from '../../domain/models/llm-pool'

// Chat routing modes
export type ChatRoutingMode = 'auto' | 'assigned' | 'discuss'

// Result of parsing a chat message
export interface ChatRoutingResult {
  mode: ChatRoutingMode
  targetProviderIds: string[] // Provider IDs to send message to
  cleanMessage: string // Message with @mentions removed
  mentions: string[] // Original mentions found
}

// Keywords for "everyone" mode (case insensitive)
const EVERYONE_KEYWORDS = ['@everyone', '@all', '@every', '@大家', '@みんな']

/**
 * Parse a chat message to determine routing mode and target providers
 * @param message The user's chat message
 * @param providers List of available pool providers
 * @returns ChatRoutingResult with mode, targets, and cleaned message
 */
export function parseChatMessage(
  message: string,
  providers: PoolProvider[]
): ChatRoutingResult {
  // Find all @mentions in the message
  const mentionRegex = /@(\w+|[^\s]+)/g
  const mentions: string[] = []
  let match

  while ((match = mentionRegex.exec(message)) !== null) {
    mentions.push(match[0]) // Full mention including @
  }

  // Check for everyone/discuss mode
  const hasEveryoneMention = mentions.some(m =>
    EVERYONE_KEYWORDS.some(kw => m.toLowerCase() === kw.toLowerCase())
  )

  if (hasEveryoneMention) {
    // Everyone mode - target all enabled providers
    const enabledProviders = providers.filter(p => p.isEnabled)
    const cleanMessage = removeMentions(message, EVERYONE_KEYWORDS)

    return {
      mode: 'discuss',
      targetProviderIds: enabledProviders.map(p => p.id),
      cleanMessage,
      mentions,
    }
  }

  // Check for specific provider mentions by nickname
  const targetProviders: PoolProvider[] = []
  const foundNicknames: string[] = []

  for (const mention of mentions) {
    const nickname = mention.substring(1) // Remove @
    const provider = providers.find(
      p =>
        p.isEnabled &&
        p.nickname &&
        p.nickname.toLowerCase() === nickname.toLowerCase()
    )

    if (provider) {
      targetProviders.push(provider)
      foundNicknames.push(mention)
    }
  }

  if (targetProviders.length > 0) {
    // Assigned mode - specific provider(s) mentioned
    const cleanMessage = removeMentions(message, foundNicknames)

    return {
      mode: 'assigned',
      targetProviderIds: targetProviders.map(p => p.id),
      cleanMessage,
      mentions,
    }
  }

  // Auto mode - no mentions found
  return {
    mode: 'auto',
    targetProviderIds: [],
    cleanMessage: message,
    mentions: [],
  }
}

/**
 * Remove mentions from message
 * Handles mentions with optional colon like "@G:" or "@G "
 */
function removeMentions(message: string, mentionsToRemove: string[]): string {
  let cleanMessage = message
  for (const mention of mentionsToRemove) {
    // Escape special regex characters in the mention
    const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Match mention followed by optional colon and whitespace
    const regex = new RegExp(escaped + '\\s*:?\\s*', 'gi')
    cleanMessage = cleanMessage.replace(regex, '')
  }
  return cleanMessage.trim()
}

/**
 * Get provider by nickname
 */
export function getProviderByNickname(
  nickname: string,
  providers: PoolProvider[]
): PoolProvider | undefined {
  return providers.find(
    p =>
      p.isEnabled &&
      p.nickname &&
      p.nickname.toLowerCase() === nickname.toLowerCase()
  )
}

/**
 * Create a task for a specific provider
 */
export function createProviderTask(
  message: string,
  _provider: PoolProvider,
  taskType: LLMTask['type'] = 'other'
): Omit<LLMTask, 'id' | 'retryCount' | 'createdAt' | 'maxRetries'> {
  return {
    type: taskType,
    prompt: message,
    priority: 50,
  }
}

/**
 * Format response from provider for display
 */
export function formatProviderResponse(
  provider: PoolProvider,
  response: string
): string {
  const name = provider.nickname || provider.name
  return `[${name}]: ${response}`
}

/**
 * Get available nicknames for autocomplete
 */
export function getAvailableNicknames(providers: PoolProvider[]): string[] {
  const nicknames = providers
    .filter(p => p.isEnabled && p.nickname)
    .map(p => p.nickname!)

  return [...new Set(nicknames)] // Remove duplicates
}
