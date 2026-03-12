import { invoke } from '@tauri-apps/api/core'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: AnthropicMessage[]
  systemPrompt?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}

export class AnthropicProvider implements AIProvider {
  name = 'Anthropic'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    console.log('[anthropic-provider] chat() called with:', {
      endpoint: config.endpoint,
      model: config.model,
      messageCount: messages.length,
    })

    const payload: ChatRequestPayload = {
      endpoint: config.endpoint,
      model: config.model,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      systemPrompt: config.systemPrompt,
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      extraHeaders: config.extraHeaders,
      extraBody: config.extraBody,
    }

    console.log('[anthropic-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[anthropic-provider] About to call invoke...')
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'anthropic' })
      console.log('[anthropic-provider] invoke returned!')
      console.log('[anthropic-provider] result type:', typeof result)
      console.log('[anthropic-provider] result:', result)

      // Force convert to string if needed
      const resultStr = String(result)
      console.log('[anthropic-provider] converted to string, length:', resultStr.length)
      return resultStr
    } catch (error: any) {
      console.error('[anthropic-provider] invoke failed with error:', error)
      console.error('[anthropic-provider] error name:', error?.name)
      console.error('[anthropic-provider] error message:', error?.message)
      console.error('[anthropic-provider] error stack:', error?.stack)
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    console.log('[anthropic-provider] streamChat() called')

    try {
      // Tauri WebView doesn't support streaming fetch, use non-streaming and simulate
      console.log('[anthropic-provider] Calling chat()...')
      const response = await this.chat(messages, config)
      console.log('[anthropic-provider] Got response from chat(), type:', typeof response)
      console.log('[anthropic-provider] Response string:', response)

      if (!response || typeof response !== 'string') {
        console.error('[anthropic-provider] Invalid response:', response)
        throw new Error('Invalid response from chat()')
      }

      console.log('[anthropic-provider] Starting to stream chunks...')

      // Simulate streaming by chunking the response
      const chunks = response.split(/(?=\s+)/)
      console.log('[anthropic-provider] Split into', chunks.length, 'chunks')

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        if (chunk.trim()) {
          console.log(`[anthropic-provider] Sending chunk ${i}: "${chunk.slice(0, 20)}..."`)
          onChunk(chunk)
        }
      }
      console.log('[anthropic-provider] Streaming complete')
    } catch (error: any) {
      console.error('[anthropic-provider] streamChat error:', error)
      console.error('[anthropic-provider] error name:', error?.name)
      console.error('[anthropic-provider] error message:', error?.message)
      throw error
    }
  }
}

export const anthropicProvider = new AnthropicProvider()
