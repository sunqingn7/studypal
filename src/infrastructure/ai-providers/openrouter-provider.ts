import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: OpenRouterMessage[]
  apiKey?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}

interface StreamChunkData {
  content: string
  thinking?: string
  done: boolean
}

export class OpenRouterProvider implements AIProvider {
  name = 'OpenRouter'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
    console.log('[openrouter-provider] chat() called with:', {
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
      extraHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'StudyPal',
        ...config.extraHeaders,
      },
      extraBody: config.extraBody,
    }

    console.log('[openrouter-provider] Calling invoke with payload:', JSON.stringify(payload, null, 2))

    try {
      console.log('[openrouter-provider] About to call invoke...')
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'openai' })
      console.log('[openrouter-provider] invoke returned!')
      console.log('[openrouter-provider] result type:', typeof result)
      console.log('[openrouter-provider] result:', result)

      // Force convert to string if needed
      const resultStr = String(result)
      console.log('[openrouter-provider] converted to string, length:', resultStr.length)
      return resultStr
    } catch (error: any) {
      console.error('[openrouter-provider] invoke failed with error:', error)
      
      // Check for specific OpenRouter errors
      const errorStr = String(error)
      if (errorStr.includes('404') && errorStr.includes('guardrail')) {
        throw new Error(
          'OpenRouter: No endpoints available for this model. This model may not be accessible with your current privacy settings. ' +
          'Please check: https://openrouter.ai/settings/privacy or try a different model.'
        )
      }
      if (errorStr.includes('404')) {
        throw new Error(
          `OpenRouter: Model "${config.model}" not found or not accessible. ` +
          'Please verify the model ID is correct and your API key has access to this model.'
        )
      }
      if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
        throw new Error(
          'OpenRouter: Authentication failed. Please check your API key.'
        )
      }
      
      throw error
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[openrouter-provider] streamChat() called - using true streaming')

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
      extraHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'StudyPal',
        ...config.extraHeaders,
      },
      extraBody: config.extraBody,
    }

    // Set up event listener for streaming chunks
    let unlisten: UnlistenFn | null = null
    let fullContent = ''

    try {
      // Listen for stream chunks from the backend
      unlisten = await listen<StreamChunkData>('chat-stream-chunk', (event) => {
        if (event.payload.done) {
          console.log('[openrouter-provider] Stream complete, received', fullContent.length, 'chars')
          return
        }

        if (event.payload.content) {
          fullContent += event.payload.content
          onChunk(event.payload.content)
        }
      })

      // Start the streaming request
      await invoke<void>('stream_chat_with_provider', { request: payload, provider: 'openai' })
    } catch (error: any) {
      console.error('[openrouter-provider] streamChat error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }

  async streamChatWithThinking(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>,
    onThinking: (thinking: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[openrouter-provider] streamChatWithThinking() called - using true streaming')

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
      extraHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-Title': 'StudyPal',
        ...config.extraHeaders,
      },
      extraBody: config.extraBody,
    }

    // Set up event listener for streaming chunks
    let unlisten: UnlistenFn | null = null
    let fullContent = ''
    let fullThinking = ''

    try {
      // Listen for stream chunks from the backend
      unlisten = await listen<StreamChunkData>('chat-stream-chunk', (event) => {
        if (event.payload.done) {
          console.log('[openrouter-provider] Stream complete, content:', fullContent.length, 'chars, thinking:', fullThinking.length, 'chars')
          return
        }

        if (event.payload.thinking) {
          fullThinking += event.payload.thinking
          onThinking(fullThinking)
        }

        if (event.payload.content) {
          fullContent += event.payload.content
          onChunk(event.payload.content)
        }
      })

      // Start the streaming request
      await invoke<void>('stream_chat_with_provider', { request: payload, provider: 'openai' })
    } catch (error: any) {
      console.error('[openrouter-provider] streamChatWithThinking error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }
}

export const openrouterProvider = new OpenRouterProvider()
