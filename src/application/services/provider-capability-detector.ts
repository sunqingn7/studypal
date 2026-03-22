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
    else if (lower.includes('o1')) { caps.modelFamily = 'o1'; caps.supportsThinking = true; caps.contextWindow = 200000 }
    else if (lower.includes('o3')) { caps.modelFamily = 'o3'; caps.supportsThinking = true; caps.contextWindow = 200000 }
    else if (lower.includes('o4-mini')) { caps.modelFamily = 'o4-mini'; caps.supportsThinking = true; caps.supportsToolCalling = true; caps.contextWindow = 200000 }
  }
  if (lower.includes('claude')) { caps.supportsToolCalling = true; caps.supportsVision = true }
  if (lower.includes('gpt')) { caps.supportsToolCalling = true }


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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    try {
      let streamed = false
      await aiProvider.streamChat(
        [{ id: 'probe', role: 'user', content: 'Hi', timestamp: Date.now() }],
        config,
        () => { streamed = true },
        controller.signal
      )
      streamingWorks = streamed
    } catch {
      streamingWorks = false
    } finally {
      clearTimeout(timeoutId)
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
    // Return inferred capabilities as fallback with validation
    const inferred = inferFromModelName(provider.config.provider, provider.config.model || '')
    const validatedCaps: ProviderCapabilities = {
      supportsStreaming: inferred.supportsStreaming ?? false,
      supportsThinking: inferred.supportsThinking ?? false,
      supportsToolCalling: inferred.supportsToolCalling ?? false,
      supportsVision: inferred.supportsVision ?? false,
      supportsJsonMode: inferred.supportsJsonMode ?? false,
      supportsSystemRole: inferred.supportsSystemRole ?? true,
      contextWindow: inferred.contextWindow ?? 0,
      maxOutputTokens: inferred.maxOutputTokens ?? 0,
      providerType: inferred.providerType ?? provider.config.provider,
      modelFamily: inferred.modelFamily ?? provider.config.model ?? '',
      detectedAt: Date.now(),
      detectionMethod: 'known',
    }
    return validatedCaps
  }
}

const MAX_CONCURRENT_DETECTIONS = 3

async function withConcurrencyLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items]
  const executing: Promise<void>[] = []

  while (queue.length > 0) {
    const item = queue.shift()!
    const promise = fn(item).then(() => {
      // Remove completed promise from executing
      const index = executing.indexOf(promise)
      if (index > -1) executing.splice(index, 1)
    })
    executing.push(promise)

    if (executing.length >= limit) {
      await Promise.race(executing)
    }
  }

  // Wait for remaining
  await Promise.all(executing)
}

export async function detectAllProviderCapabilities(
  providers: PoolProvider[],
  onProgress?: (providerId: string, caps: ProviderCapabilities | null) => void
): Promise<Map<string, ProviderCapabilities | null>> {
  const results = new Map<string, ProviderCapabilities | null>()

  await withConcurrencyLimit(providers, MAX_CONCURRENT_DETECTIONS, async (provider) => {
    const caps = await detectProviderCapabilities(provider)
    results.set(provider.id, caps)
    onProgress?.(provider.id, caps)
  })

  return results
}
