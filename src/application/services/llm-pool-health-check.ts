import { PoolProvider, HealthCheckResult } from '../../domain/models/llm-pool'
import { getProvider } from '../../infrastructure/ai-providers/provider-factory'

// Simple health check - try to generate a response
const HEALTH_CHECK_PROMPT = 'Hello, are you there? Please respond with "OK" and nothing else.'
const HEALTH_CHECK_TIMEOUT = 10000 // 10 seconds

export async function checkProviderHealth(provider: PoolProvider): Promise<HealthCheckResult> {
  const startTime = Date.now()

  try {
    const aiProvider = getProvider(provider.config.provider)
    if (!aiProvider) {
      return {
        providerId: provider.id,
        isHealthy: false,
        latency: 0,
        error: 'Provider not available',
        timestamp: Date.now(),
      }
    }

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT)

    // Try a simple completion
    const messageContent = await Promise.race([
      aiProvider.chat(
        [{ id: 'health-check', role: 'user', content: HEALTH_CHECK_PROMPT, timestamp: Date.now() }],
        {
          ...provider.config,
          maxTokens: 10,
          temperature: 0,
        }
      ),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('Health check timeout')))
      }),
    ])

    clearTimeout(timeoutId)

    const latency = Date.now() - startTime

    // Check if response contains OK (case insensitive)
    const isHealthy = messageContent.toLowerCase().includes('ok')

    return {
      providerId: provider.id,
      isHealthy,
      latency,
      error: isHealthy ? undefined : 'Unexpected response',
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      providerId: provider.id,
      isHealthy: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    }
  }
}

// Check all providers in parallel
export async function checkAllProvidersHealth(
  providers: PoolProvider[]
): Promise<HealthCheckResult[]> {
  const results = await Promise.all(
    providers.map((provider) => checkProviderHealth(provider))
  )
  return results
}

// Start periodic health checks
export function startHealthCheckLoop(
  getProviders: () => PoolProvider[],
  onHealthUpdate: (result: HealthCheckResult) => void,
  intervalMs: number = 30000
): () => void {
  let intervalId: ReturnType<typeof setInterval>
  let isRunning = true

  const check = async () => {
    if (!isRunning) return

    const providers = getProviders().filter((p) => p.isEnabled)
    const results = await checkAllProvidersHealth(providers)

    results.forEach((result) => {
      onHealthUpdate(result)
    })
  }

  // Initial check
  check()

  // Start interval
  intervalId = setInterval(check, intervalMs)

  // Return cleanup function
  return () => {
    isRunning = false
    clearInterval(intervalId)
  }
}
