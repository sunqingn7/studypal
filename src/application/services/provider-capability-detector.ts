import { PoolProvider, ProviderCapabilities } from '../../domain/models/llm-pool'
import { getProvider } from '../../infrastructure/ai-providers/provider-factory'
import { AIConfig } from '../../domain/models/ai-context'

const DETECTION_TIMEOUT = 30000 // 30 seconds

function inferFromModelName(providerType: string, model: string): Partial<ProviderCapabilities> {
  const lower = model.toLowerCase()
  const caps: Partial<ProviderCapabilities> = {
    supportsStreaming: true,
    supportsSystemRole: true,
    supportsToolCalling: false,
    supportsThinking: false,
    supportsVision: false,
    supportsJsonMode: true,
    contextWindow: 0,
    maxOutputTokens: 4096,
    providerType,
    modelFamily: '',
    detectedAt: Date.now(),
    detectionMethod: 'known',
  }

  // Model family detection
  if (providerType === 'openai' || providerType === 'openai-compatible') {
    if (lower.includes('gpt-4o')) { caps.modelFamily = 'gpt-4o'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 128000 }
    else if (lower.includes('gpt-4-turbo')) { caps.modelFamily = 'gpt-4-turbo'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 128000 }
    else if (lower.includes('gpt-4')) { caps.modelFamily = 'gpt-4'; caps.supportsToolCalling = true; caps.contextWindow = 128000 }
    else if (lower.includes('gpt-3.5-turbo')) { caps.modelFamily = 'gpt-3.5'; caps.contextWindow = 16385 }
    else if (lower.includes('o1')) { caps.modelFamily = 'o1'; caps.supportsThinking = true; caps.supportsToolCalling = false; caps.supportsSystemRole = false }
    else if (lower.includes('o3')) { caps.modelFamily = 'o3'; caps.supportsThinking = true; caps.supportsToolCalling = false; caps.supportsSystemRole = false }
    else if (lower.includes('o4-mini')) { caps.modelFamily = 'o4-mini'; caps.supportsThinking = true; caps.supportsToolCalling = true; caps.contextWindow = 100000 }
  } else if (providerType === 'anthropic') {
    if (lower.includes('claude-sonnet-4')) { caps.modelFamily = 'claude-sonnet-4'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 200000 }
    else if (lower.includes('claude-opus-4')) { caps.modelFamily = 'claude-opus-4'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 200000 }
    else if (lower.includes('claude-opus-3')) { caps.modelFamily = 'claude-opus-3'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 200000 }
    else if (lower.includes('claude-sonnet-3-7')) { caps.modelFamily = 'claude-sonnet-3-7'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 200000 }
    else if (lower.includes('claude-3-5-sonnet')) { caps.modelFamily = 'claude-3-5-sonnet'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 200000 }
    else if (lower.includes('claude-3-opus')) { caps.modelFamily = 'claude-3-opus'; caps.contextWindow = 200000 }
    else if (lower.includes('claude-3-sonnet')) { caps.modelFamily = 'claude-3-sonnet'; caps.contextWindow = 200000 }
    else if (lower.includes('claude-3-haiku')) { caps.modelFamily = 'claude-3-haiku'; caps.contextWindow = 200000 }
  } else if (providerType === 'gemini') {
    if (lower.includes('gemini-2.5-pro') || lower.includes('gemini-2.0-pro')) { caps.modelFamily = 'gemini-pro'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 1000000 }
    else if (lower.includes('gemini-1.5-pro')) { caps.modelFamily = 'gemini-pro'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 2000000 }
    else if (lower.includes('gemini-1.5-flash')) { caps.modelFamily = 'gemini-flash'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 1000000 }
    else if (lower.includes('gemini-2.0-flash')) { caps.modelFamily = 'gemini-flash'; caps.supportsVision = true; caps.supportsToolCalling = true; caps.contextWindow = 1000000 }
    else if (lower.includes('gemini-pro')) { caps.modelFamily = 'gemini-pro'; caps.contextWindow = 32768 }
  } else if (providerType === 'ollama') {
    caps.supportsToolCalling = lower.includes('function') || lower.includes('tool')
    caps.contextWindow = 0 // Unknown for local models
  } else if (providerType === 'llamacpp') {
    caps.contextWindow = 0
  } else if (providerType === 'vllm') {
    caps.contextWindow = 0
  } else if (providerType === 'nvidia') {
    caps.supportsVision = lower.includes('vision') || lower.includes('llama-3.2')
    caps.supportsToolCalling = true
  } else if (providerType === 'openrouter') {
    // Infer from model name routed through openrouter
    if (lower.includes('deepseek')) {
      if (lower.includes('r1')) { caps.supportsThinking = true; caps.modelFamily = 'deepseek-r1' }
      else { caps.modelFamily = 'deepseek' }
    }
    if (lower.includes('claude')) { caps.supportsToolCalling = true; caps.supportsVision = true }
    if (lower.includes('gpt')) { caps.supportsToolCalling = true }
  }

  return caps
}

async function probeProvider(
  provider: PoolProvider,
  configOverride?: Partial<AIConfig>
): Promise<ProviderCapabilities | null> {
  const aiProvider = getProvider(provider.config.provider)
  if (!aiProvider) return null

  const config = { ...provider.config, ...configOverride, maxTokens: 50, temperature: 0.1 }
  const model = config.model || ''

  // Infer base capabilities from model name
  const baseCaps = inferFromModelName(provider.config.provider, model)

  // Probe for streaming support
  let streamingWorks = false
  if ('streamChat' in aiProvider) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      let streamed = false
      await aiProvider.streamChat(
        [{ id: 'probe', role: 'user', content: 'Hi', timestamp: Date.now() }],
        config,
        () => { streamed = true },
        controller.signal
      )
      clearTimeout(timeoutId)
      streamingWorks = streamed
    } catch {
      streamingWorks = false
    }
  }

  // Probe for thinking support
  let thinkingWorks = false
  if ('streamChatWithThinking' in aiProvider) {
    thinkingWorks = baseCaps.supportsThinking || false
  }

  // Probe for tool calling support
  let toolCallingWorks = false
  if (aiProvider.supportsNativeFunctionCalling?.()) {
    toolCallingWorks = true
  }

  const capabilities: ProviderCapabilities = {
    supportsStreaming: streamingWorks || baseCaps.supportsStreaming || false,
    supportsThinking: thinkingWorks || baseCaps.supportsThinking || false,
    supportsToolCalling: toolCallingWorks || baseCaps.supportsToolCalling || false,
    supportsVision: baseCaps.supportsVision || false,
    supportsJsonMode: baseCaps.supportsJsonMode || false,
    supportsSystemRole: baseCaps.supportsSystemRole !== false,
    contextWindow: baseCaps.contextWindow || 0,
    maxOutputTokens: baseCaps.maxOutputTokens || 0,
    providerType: provider.config.provider,
    modelFamily: baseCaps.modelFamily || model,
    detectedAt: Date.now(),
    detectionMethod: 'probe',
  }

  return capabilities
}

export async function detectProviderCapabilities(
  provider: PoolProvider,
  force = false
): Promise<ProviderCapabilities | null> {
  if (!force && provider.capabilities && provider.capabilitiesLastChecked) {
    const age = Date.now() - provider.capabilitiesLastChecked
    if (age < 3600000) { // 1 hour
      return provider.capabilities
    }
  }

  try {
    const caps = await Promise.race([
      probeProvider(provider),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Capability detection timeout')), DETECTION_TIMEOUT)
      ),
    ])
    return caps
  } catch (error) {
    console.warn(`[CapabilityDetector] Failed to detect capabilities for ${provider.name}:`, error)
    // Return inferred capabilities as fallback
    const inferred = inferFromModelName(provider.config.provider, provider.config.model || '')
    return {
      ...inferred as ProviderCapabilities,
      detectionMethod: 'known',
    }
  }
}

export async function detectAllProviderCapabilities(
  providers: PoolProvider[],
  onProgress?: (providerId: string, caps: ProviderCapabilities | null) => void
): Promise<Map<string, ProviderCapabilities | null>> {
  const results = new Map<string, ProviderCapabilities | null>()
  
  await Promise.all(
    providers.map(async (provider) => {
      const caps = await detectProviderCapabilities(provider)
      results.set(provider.id, caps)
      onProgress?.(provider.id, caps)
    })
  )
  
  return results
}
