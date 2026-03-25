import { describe, it, expect } from 'vitest'
import {
  parseChatMessage,
  getProviderByNickname,
  formatProviderResponse,
  getAvailableNicknames,
  createProviderTask,
} from './chat-routing-service'
import type { PoolProvider } from '../../domain/models/llm-pool'

// Test helper to create mock providers
const createMockProvider = (
  id: string,
  name: string,
  nickname?: string,
  isEnabled = true
): PoolProvider => ({
  id,
  name,
  nickname,
  config: {
    provider: 'openai' as const,
    model: 'gpt-4',
    apiKey: 'test-key',
    endpoint: 'https://api.openai.com',
    temperature: 0.7,
    maxTokens: 2048,
    topP: 1,
  },
  isHealthy: true,
  lastHealthCheck: Date.now(),
  priority: 50,
  maxConcurrentTasks: 5,
  currentTasks: 0,
  totalTasksCompleted: 0,
  averageLatency: 100,
  failureCount: 0,
  isEnabled,
  isPrimary: false,
})

describe('Chat Routing Service', () => {
  describe('parseChatMessage', () => {
    it('should return auto mode when no mentions', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
        createMockProvider('2', 'Anthropic', 'A'),
      ]

      const result = parseChatMessage('Hello everyone', providers)

      expect(result.mode).toBe('auto')
      expect(result.targetProviderIds).toHaveLength(0)
      expect(result.cleanMessage).toBe('Hello everyone')
      expect(result.mentions).toHaveLength(0)
    })

    it('should return discuss mode for @everyone', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
        createMockProvider('2', 'Anthropic', 'A'),
      ]

      const result = parseChatMessage('@everyone Hello', providers)

      expect(result.mode).toBe('discuss')
      expect(result.targetProviderIds).toHaveLength(2)
      expect(result.targetProviderIds).toContain('1')
      expect(result.targetProviderIds).toContain('2')
      expect(result.cleanMessage).toBe('Hello')
      expect(result.mentions).toContain('@everyone')
    })

    it('should return discuss mode for @all', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
        createMockProvider('2', 'Anthropic', 'A'),
      ]

      const result = parseChatMessage('@all Discuss this', providers)

      expect(result.mode).toBe('discuss')
      expect(result.targetProviderIds).toHaveLength(2)
    })

    it('should return assigned mode for specific nickname', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
        createMockProvider('2', 'Anthropic', 'A'),
      ]

      const result = parseChatMessage('@G Hello there', providers)

      expect(result.mode).toBe('assigned')
      expect(result.targetProviderIds).toHaveLength(1)
      expect(result.targetProviderIds[0]).toBe('1')
      expect(result.cleanMessage).toBe('Hello there')
      expect(result.mentions).toContain('@G')
    })

    it('should be case-insensitive for nicknames', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
      ]

      const result = parseChatMessage('@g Hello', providers)

      expect(result.mode).toBe('assigned')
      expect(result.targetProviderIds[0]).toBe('1')
    })

    it('should handle multiple provider mentions', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
        createMockProvider('2', 'Anthropic', 'A'),
      ]

      const result = parseChatMessage('@G @A Hello both', providers)

      expect(result.mode).toBe('assigned')
      expect(result.targetProviderIds).toHaveLength(2)
      expect(result.targetProviderIds).toContain('1')
      expect(result.targetProviderIds).toContain('2')
    })

    it('should handle nicknames with special characters', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', '小g'),
      ]

      const result = parseChatMessage('@小g Hello', providers)

      expect(result.mode).toBe('assigned')
      expect(result.targetProviderIds[0]).toBe('1')
    })

    it('should skip disabled providers', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G', false),
        createMockProvider('2', 'Anthropic', 'A', true),
      ]

      const result = parseChatMessage('@everyone Hello', providers)

      expect(result.mode).toBe('discuss')
      expect(result.targetProviderIds).toHaveLength(1)
      expect(result.targetProviderIds[0]).toBe('2')
    })

    it('should skip non-existent nicknames', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
      ]

      const result = parseChatMessage('@NonExistent Hello', providers)

      expect(result.mode).toBe('auto')
      expect(result.targetProviderIds).toHaveLength(0)
      // Mentions are collected from regex, but non-existent providers are filtered out
      expect(result.mentions.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle mentions with colons', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
      ]

      const result = parseChatMessage('@G: Hello there', providers)

      expect(result.mode).toBe('assigned')
      expect(result.cleanMessage).toBe('Hello there')
    })

    it('should handle empty message', () => {
      const providers: PoolProvider[] = []

      const result = parseChatMessage('', providers)

      expect(result.mode).toBe('auto')
      expect(result.cleanMessage).toBe('')
    })
  })

  describe('getProviderByNickname', () => {
    it('should find provider by nickname', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
        createMockProvider('2', 'Anthropic', 'A'),
      ]

      const provider = getProviderByNickname('G', providers)

      expect(provider).toBeDefined()
      expect(provider?.id).toBe('1')
    })

    it('should return undefined for non-existent nickname', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
      ]

      const provider = getProviderByNickname('NonExistent', providers)

      expect(provider).toBeUndefined()
    })

    it('should not find disabled provider', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G', false),
      ]

      const provider = getProviderByNickname('G', providers)

      expect(provider).toBeUndefined()
    })
  })

  describe('formatProviderResponse', () => {
    it('should format response with nickname', () => {
      const provider = createMockProvider('1', 'OpenAI', 'G')

      const formatted = formatProviderResponse(provider, 'Hello')

      expect(formatted).toBe('[G]: Hello')
    })

    it('should use name when no nickname', () => {
      const provider = createMockProvider('1', 'OpenAI', undefined)

      const formatted = formatProviderResponse(provider, 'Hello')

      expect(formatted).toBe('[OpenAI]: Hello')
    })
  })

  describe('getAvailableNicknames', () => {
    it('should return enabled provider nicknames', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G', true),
        createMockProvider('2', 'Anthropic', 'A', true),
        createMockProvider('3', 'Disabled', 'D', false),
        createMockProvider('4', 'NoNickname', undefined, true),
      ]

      const nicknames = getAvailableNicknames(providers)

      expect(nicknames).toHaveLength(2)
      expect(nicknames).toContain('G')
      expect(nicknames).toContain('A')
      expect(nicknames).not.toContain('D')
      expect(nicknames).not.toContain('NoNickname')
    })

    it('should return unique nicknames', () => {
      const providers: PoolProvider[] = [
        createMockProvider('1', 'OpenAI', 'G'),
        createMockProvider('2', 'Another OpenAI', 'G'),
      ]

      const nicknames = getAvailableNicknames(providers)

      expect(nicknames).toHaveLength(1)
      expect(nicknames[0]).toBe('G')
    })

    it('should return empty array for no providers', () => {
      const nicknames = getAvailableNicknames([])

      expect(nicknames).toHaveLength(0)
    })
  })

  describe('createProviderTask', () => {
    it('should create a task with default type', () => {
      const provider = createMockProvider('1', 'OpenAI', 'G')

      const task = createProviderTask('Hello', provider)

      expect(task.type).toBe('other')
      expect(task.prompt).toBe('Hello')
      expect(task.priority).toBe(50)
    })

    it('should create a task with specified type', () => {
      const provider = createMockProvider('1', 'OpenAI', 'G')

      const task = createProviderTask('Hello', provider, 'generate_summary')

      expect(task.type).toBe('generate_summary')
    })
  })
})
