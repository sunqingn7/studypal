import { invoke } from '@tauri-apps/api/core'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: OpenAIMessage[]
  apiKey?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}

export class OpenAIProvider implements AIProvider {
  name = 'OpenAI'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    console.log('[openai-provider] chat() called with:', {
      endpoint: config.endpoint,
      model: config.model,
      messageCount: messages.length,
    })

    const payload: ChatRequestPayload = {
      endpoint: config.endpoint,
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      extraHeaders: config.extraHeaders,
      extraBody: config.extraBody,
    }

    console.log('[openai-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[openai-provider] About to call invoke...')
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'openai' })
      console.log('[openai-provider] invoke returned!')
      console.log('[openai-provider] result type:', typeof result)
      console.log('[openai-provider] result:', result)

      // Force convert to string if needed
      const resultStr = String(result)
      console.log('[openai-provider] converted to string, length:', resultStr.length)
      return resultStr
    } catch (error: any) {
      console.error('[openai-provider] invoke failed with error:', error)
      console.error('[openai-provider] error name:', error?.name)
      console.error('[openai-provider] error message:', error?.message)
      console.error('[openai-provider] error stack:', error?.stack)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log('[openai-provider] streamChat() called')

    try {
      // Tauri WebView doesn't support streaming fetch, use non-streaming and simulate
      console.log('[openai-provider] Calling chat()...')
      const response = await this.chat(messages, config)
      console.log('[openai-provider] Got response from chat(), type:', typeof response)
      console.log('[openai-provider] Response string:', response)

      if (!response || typeof response !== 'string') {
        console.error('[openai-provider] Invalid response:', response)
        throw new Error('Invalid response from chat()')
      }

      console.log('[openai-provider] Starting to stream chunks...')

      // Simulate streaming by chunking the response
      const chunks = response.split(/(?=\s+)/)
      console.log('[openai-provider] Split into', chunks.length, 'chunks')

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        if (chunk.trim()) {
          console.log(`[openai-provider] Sending chunk ${i}: "${chunk.slice(0, 20)}..."`)
          onChunk(chunk)
        }
      }
      console.log('[openai-provider] Streaming complete')
    } catch (error: any) {
      console.error('[openai-provider] streamChat error:', error)
      console.error('[openai-provider] error name:', error?.name)
      console.error('[openai-provider] error message:', error?.message)
      throw error
    }
  }

  async streamChatWithThinking(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void,
    onThinking: (thinking: string) => void
  ): Promise<void> {
    try {
      const response = await this.chat(messages, config)
      if (!response || typeof response !== 'string') {
        throw new Error('Invalid response from chat()')
      }
      try {
        const parsed = JSON.parse(response)
        if (parsed.thinking) onThinking(parsed.thinking)
        if (parsed.content) {
          parsed.content.split(/(?=\s+)/).forEach((chunk: string) => {
            if (chunk.trim()) onChunk(chunk)
          })
        }
      } catch {
        response.split(/(?=\s+)/).forEach((chunk: string) => {
          if (chunk.trim()) onChunk(chunk)
        })
      }
    } catch (error: any) {
      console.error('[openai-provider] streamChatWithThinking error:', error)
      throw error
    }
  }
}

export const openaiProvider = new OpenAIProvider()
