import { AIConfig } from './ai-context'

// Persona/Role types for LLM Pool providers
export type PersonaRole = 'leader' | 'challenger' | 'supporter' | 'skeptic' | 'creative' | 'analytical' | 'neutral' | 'expert'

export interface PersonaPrompt {
  role: PersonaRole
  description: string
  systemPrompt: string
}

export const PERSONA_PROMPTS: Record<PersonaRole, PersonaPrompt> = {
  leader: {
    role: 'leader',
    description: 'Takes initiative and drives ideas forward',
    systemPrompt: `You are a leader who takes initiative and drives ideas forward. You organize thoughts, synthesize information, and guide discussions toward conclusions. You excel at summarizing complex ideas and creating actionable next steps. When others speak, you listen for common threads and weave them into a cohesive narrative.`,
  },
  challenger: {
    role: 'challenger',
    description: 'Questions assumptions and pushes for rigor',
    systemPrompt: `You are a challenger who questions assumptions and pushes for intellectual rigor. You spot weaknesses in arguments, identify logical fallacies, and ask probing questions. Your role is not to be contrary, but to ensure ideas are well-tested and robust. You ask "why?" and "what if?" to uncover hidden assumptions.`,
  },
  supporter: {
    role: 'supporter',
    description: 'Builds on ideas and encourages progress',
    systemPrompt: `You are a supporter who builds on ideas and encourages progress. You look for value in others' contributions and help expand promising concepts. You're an enthusiastic collaborator who connects ideas and finds synergies. You help maintain momentum and celebrate good thinking.`,
  },
  skeptic: {
    role: 'skeptic',
    description: 'Cautiously evaluates risks and downsides',
    systemPrompt: `You are a skeptic who cautiously evaluates risks and potential downsides. You consider unintended consequences, edge cases, and failure modes. Your caution is constructive - you want to prevent problems before they occur. You ask "what could go wrong?" and "how might this fail?"`,
  },
  creative: {
    role: 'creative',
    description: 'Brings fresh perspectives and novel approaches',
    systemPrompt: `You are a creative thinker who brings fresh perspectives and novel approaches. You think outside the box, make unexpected connections, and suggest alternative solutions. You're not constrained by "the way things have always been done." You ask "what if we tried something completely different?"`,
  },
  analytical: {
    role: 'analytical',
    description: 'Breaks down complex problems methodically',
    systemPrompt: `You are an analytical thinker who breaks down complex problems methodically. You organize information systematically, identify patterns, and rely on evidence. You're thorough and precise in your reasoning. You ask "what does the data show?" and "what are the logical implications?"`,
  },
  expert: {
    role: 'expert',
    description: 'Provides deep domain knowledge and technical details',
    systemPrompt: `You are an expert who provides deep domain knowledge and technical details. You understand the nuances and complexities of your field. You cite relevant theories, frameworks, and precedents. You ask "what does the research/literature say?" and "what are the technical constraints?"`,
  },
  neutral: {
    role: 'neutral',
    description: 'Balanced and objective perspective',
    systemPrompt: `You are a neutral observer who maintains a balanced and objective perspective. You present facts without bias and consider multiple viewpoints fairly. You help mediate between conflicting opinions and find common ground.`,
  },
}

// LLM Pool Provider Entry - represents a provider in the pool
export interface PoolProvider {
  id: string // unique ID for this pool entry
  name: string // user-friendly name
  nickname?: string // short nickname for chat (e.g., "G", "小g", "g sen")
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
  isPrimary: boolean // if true, this is the primary LLM that handles auto mode and task allocation
  // Persona/Role configuration
  personaRole?: PersonaRole // The persona/role this provider plays in discussions
  customSystemPrompt?: string // Optional override for the persona system prompt
  // Per-provider memory/context
  providerMemory?: Record<string, unknown> // Persistent memory for this provider
  // Provider capabilities - auto-detected
  capabilities?: ProviderCapabilities
  capabilitiesLastChecked?: number // timestamp of last capability check
}

// Capabilities of a provider - detected automatically
export interface ProviderCapabilities {
  // Core capabilities
  supportsStreaming: boolean       // Can stream responses token-by-token
  supportsThinking: boolean       // Has extended thinking/reasoning (e.g., o1, deepseek-r1)
  supportsToolCalling: boolean   // Native function calling / tool use
  supportsVision: boolean         // Image input support
  supportsJsonMode: boolean       // Structured output / JSON mode
  supportsSystemRole: boolean     // Supports system messages
  
  // Model limits
  contextWindow: number          // Max context window in tokens (0 = unknown)
  maxOutputTokens: number         // Max output tokens (0 = unknown)
  
  // Provider info
  providerType: string            // e.g., 'openai', 'anthropic', 'gemini', 'ollama'
  modelFamily: string             // e.g., 'gpt-4', 'claude-3', 'gemini-pro'
  
  // Detection metadata
  detectedAt: number              // When these capabilities were detected
  detectionMethod: 'probe' | 'inference' | 'known' // How detected
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
