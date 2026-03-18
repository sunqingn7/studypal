import { AIConfig } from './ai-context'

// LLM Pool Provider Entry - represents a provider in the pool
export interface PoolProvider {
  id: string  // unique ID for this pool entry
  name: string // user-friendly name
  config: AIConfig
  isHealthy: boolean
  lastHealthCheck: number
  priority: number // 0-100, higher = preferred
  maxConcurrentTasks: number
  currentTasks: number
  totalTasksCompleted: number
  averageLatency: number // in ms
  failureCount: number
  isEnabled: boolean
}

// Health check result
export interface HealthCheckResult {
  providerId: string
  isHealthy: boolean
  latency: number
  error?: string
  timestamp: number
}

// Task for distribution
export interface LLMTask {
  id: string
  type: 'generate_slide' | 'generate_quiz' | 'generate_summary' | 'generate_examples' | 'generate_discussion' | 'generate_flashcards' | 'evaluate_quiz' | 'other'
  prompt: string
  context?: string
  maxTokens?: number
  temperature?: number
  priority: number // 0-100, higher = more urgent
  timeout?: number // timeout in ms
  retryCount: number
  maxRetries: number
  createdAt: number
}

// Task execution result
export interface TaskResult {
  taskId: string
  providerId: string
  success: boolean
  content: string
  latency: number
  error?: string
  timestamp: number
}

// Task status
export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'retrying'

// Tracked task
export interface TrackedTask extends LLMTask {
  status: TaskStatus
  assignedProviderId?: string
  startedAt?: number
  completedAt?: number
  result?: TaskResult
}

// Pool statistics
export interface PoolStatistics {
  totalProviders: number
  healthyProviders: number
  busyProviders: number
  totalTasks: number
  pendingTasks: number
  runningTasks: number
  completedTasks: number
  failedTasks: number
  averageLatency: number
}

// Pool configuration
export interface PoolConfig {
  healthCheckInterval: number // ms
  taskTimeout: number // ms
  maxRetries: number
  enableLoadBalancing: boolean
  preferLowLatency: boolean
  randomSelection: boolean // if true, pick randomly from healthy providers
}

export const DEFAULT_POOL_CONFIG: PoolConfig = {
  healthCheckInterval: 600000, // 10 minutes
  taskTimeout: 60000, // 60 seconds
  maxRetries: 2,
  enableLoadBalancing: true,
  preferLowLatency: true,
  randomSelection: false,
}

// Main LLM Provider - the orchestrator
export interface MainLLMConfig {
  config: AIConfig
  isConfigured: boolean
}
