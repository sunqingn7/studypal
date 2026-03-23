import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'

interface LlamaCppMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequestPayload {
  endpoint: string
  model: string
  messages: LlamaCppMessage[]
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

const MAX_RETRIES = 2
const RETRY_DELAY = 1000

export class LlamaCppProvider implements AIProvider {
  name = 'llama.cpp'

  supportsTrueStreaming(): boolean {
    return true
  }

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
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

    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'llamacpp' })
        return String(result)
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`[llamacpp-provider] Chat attempt ${attempt + 1} failed:`, lastError.message)
        
        if (attempt < MAX_RETRIES) {
          console.log(`[llamacpp-provider] Retrying in ${RETRY_DELAY}ms...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        }
      }
    }
    
    console.error('[llamacpp-provider] Chat failed after', MAX_RETRIES + 1, 'attempts')
    throw lastError
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>
  ): Promise<void> {
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

    let unlisten: UnlistenFn | null = null
    let fullContent = ''
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const streamId = `llamacpp-stream-${crypto.randomUUID()}`
        const payloadWithStream = { ...payload, streamEvent: streamId }

        unlisten = await listen<StreamChunkData>(streamId, (event) => {
          if (event.payload.done) {
            return
          }

          if (event.payload.content) {
            fullContent += event.payload.content
            onChunk(event.payload.content)
          }
        })

        await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'llamacpp' })
        return
      } catch (error: any) {
        lastError = error
        console.warn(`[llamacpp-provider] Stream attempt ${attempt + 1} failed:`, error?.message || error)
        
        if (unlisten) {
          unlisten()
          unlisten = null
        }
        
        if (attempt < MAX_RETRIES) {
          console.log(`[llamacpp-provider] Retrying in ${RETRY_DELAY}ms...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        }
      }
    }
    
    console.error('[llamacpp-provider] Stream failed after', MAX_RETRIES + 1, 'attempts')
    throw lastError
  }

  async streamChatWithThinking(
    messages: ChatMessage[],
    config: AIConfig,
    onChunk: (chunk: string) => void | Promise<void>,
    onThinking: (thinking: string) => void | Promise<void>
  ): Promise<void> {
    console.log('[llamacpp-provider] streamChatWithThinking() called - using true streaming')

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

    let unlisten: UnlistenFn | null = null
    let fullContent = ''
    let fullThinking = ''
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const streamId = `llamacpp-stream-${crypto.randomUUID()}`
        const payloadWithStream = { ...payload, streamEvent: streamId }

        unlisten = await listen<StreamChunkData>(streamId, (event) => {
          if (event.payload.done) {
            console.log('[llamacpp-provider] Stream complete, content:', fullContent.length, 'chars, thinking:', fullThinking.length, 'chars')
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

        await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'llamacpp' })
        return
      } catch (error: any) {
        lastError = error
        console.warn(`[llamacpp-provider] StreamWithThinking attempt ${attempt + 1} failed:`, error?.message || error)
        
        if (unlisten) {
          unlisten()
          unlisten = null
        }
        
        if (attempt < MAX_RETRIES) {
          console.log(`[llamacpp-provider] Retrying in ${RETRY_DELAY}ms...`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
        }
      }
    }
    
    console.error('[llamacpp-provider] StreamWithThinking failed after', MAX_RETRIES + 1, 'attempts')
    throw lastError
  }
}

export const llamaCppProvider = new LlamaCppProvider()
