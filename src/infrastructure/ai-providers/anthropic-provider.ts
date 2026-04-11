import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AIConfig, ChatMessage } from '../../domain/models/ai-context'
import type { AIProvider } from './base-provider'
import { MCPTool } from '../../domain/models/plugin'
import { mcpToolToAnthropicSchema } from './tool-calling'
import type { ChatWithToolsResult, ToolCall } from './tool-calling'

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

interface StreamChunkData {
  content: string
  thinking?: string
  done: boolean
}

export class AnthropicProvider implements AIProvider {
  name = 'Anthropic'

  async chat(messages: ChatMessage[], config: AIConfig): Promise<string> {
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

    try {
      const result = await invoke<string>('chat_with_provider', { request: payload, provider: 'anthropic' })
      return String(result)
  } catch (error) {
    console.error('[anthropic-provider] invoke failed with error:', error)
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[anthropic-provider] error:', errorMsg)
    throw error
  }
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

    let unlisten: UnlistenFn | null = null
    let fullContent = ''

    try {
      const streamId = `anthropic-stream-${crypto.randomUUID()}`
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

      await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'anthropic' })
    } catch (error) {
      console.error('[anthropic-provider] streamChat error:', error)
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

    let unlisten: UnlistenFn | null = null
    let fullContent = ''
    let fullThinking = ''

    try {
      const streamId = `anthropic-stream-${crypto.randomUUID()}`
      const payloadWithStream = { ...payload, streamEvent: streamId }

      unlisten = await listen<StreamChunkData>(streamId, (event) => {
        if (event.payload.done) {
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

      await invoke<void>('stream_chat_with_provider', { request: payloadWithStream, provider: 'anthropic' })
    } catch (error) {
      console.error('[anthropic-provider] streamChatWithThinking error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }

  supportsNativeFunctionCalling(): boolean {
    return true
  }

  async chatWithTools(
    messages: ChatMessage[],
    config: AIConfig,
    tools: MCPTool[]
  ): Promise<ChatWithToolsResult> {
    const anthropicTools = tools.map(tool => mcpToolToAnthropicSchema(tool))

    const payload = {
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
      tools: anthropicTools,
    }

    try {
      const result = await invoke<{
        content?: string
        tool_calls?: Array<{
          id: string
          type: string
          function: {
            name: string
            arguments: string
          }
        }>
      }>('chat_with_tools', { request: payload, provider: 'anthropic' })

      const toolCalls: ToolCall[] = (result.tool_calls || []).map((tc) => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}'),
      }))

      return {
        content: result.content || '',
        toolCalls,
      }
    } catch (error) {
      console.error('[anthropic-provider] chatWithTools error:', error)
      throw error
    }
  }

  async streamChatWithTools(
    messages: ChatMessage[],
    config: AIConfig,
    tools: MCPTool[],
    onChunk: (chunk: string) => void,
    onToolCall?: (toolCall: ToolCall) => void
  ): Promise<void> {
    const anthropicTools = tools.map(tool => mcpToolToAnthropicSchema(tool))

    const payload = {
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
      tools: anthropicTools,
    }

    let unlisten: UnlistenFn | null = null

    try {
      const streamId = `anthropic-tools-stream-${crypto.randomUUID()}`
      const payloadWithStream = { ...payload, streamEvent: streamId }

      unlisten = await listen<StreamChunkData>(streamId, (event) => {
        if (event.payload.done) {
          return
        }

        if (event.payload.content) {
          onChunk(event.payload.content)
        }

        if (event.payload.thinking && onToolCall) {
          try {
            const parsed = JSON.parse(event.payload.thinking)
            if (parsed.type === 'tool_call' && parsed.data) {
              const tc = parsed.data
              onToolCall({
                name: tc.name || '',
                arguments: typeof tc.input === 'object' ? tc.input : JSON.parse(tc.input || '{}'),
              })
            }
          } catch {
            // Not a tool call JSON
          }
        }
      })

      await invoke<void>('stream_chat_with_tools', { request: payloadWithStream, provider: 'anthropic' })
    } catch (error) {
      console.error('[anthropic-provider] streamChatWithTools error:', error)
      throw error
    } finally {
      if (unlisten) {
        unlisten()
      }
    }
  }
}

export const anthropicProvider = new AnthropicProvider()
