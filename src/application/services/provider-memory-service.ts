/**
 * Provider Memory Service
 * Manages per-provider memories for LLM Pool discuss mode
 * Each provider has its own memory file to store ideas, facts, and learnings
 */

import { readTextFile, writeTextFile, exists, mkdir, readDir } from '@tauri-apps/plugin-fs'
import { appLocalDataDir, join } from '@tauri-apps/api/path'

export interface ProviderMemory {
  providerId: string
  providerName: string
  createdAt: number
  updatedAt: number
  // Memory entries
  ideas: MemoryEntry[]
  facts: MemoryEntry[]
  learnings: MemoryEntry[]
  preferences: Record<string, string>
  // Context from other providers
  peerInsights: PeerInsight[]
}

export interface MemoryEntry {
  id: string
  content: string
  timestamp: number
  category: 'idea' | 'fact' | 'learning'
  tags: string[]
  source?: string // discussion session ID or message ID
}

export interface PeerInsight {
  providerId: string
  providerName: string
  content: string
  timestamp: number
  relevance: number // 0-100
}

// Memory schema version for future migrations
// const MEMORY_VERSION = '1.0'

/**
 * Get the memory file path for a provider
 */
async function getMemoryFilePath(providerId: string): Promise<string> {
  const appDir = await appLocalDataDir()
  const memoriesDir = await join(appDir, 'provider-memories')
  return await join(memoriesDir, `${providerId}.json`)
}

/**
 * Initialize provider memory storage
 */
async function ensureMemoryDirectory(): Promise<void> {
  try {
    const appDir = await appLocalDataDir()
    const memoriesDir = await join(appDir, 'provider-memories')
    
    // Check if directory exists
    const dirExists = await exists(memoriesDir)
    if (!dirExists) {
      // Create directory using mkdir
      await mkdir(memoriesDir, { recursive: true })
    }
  } catch (error) {
    console.error('[ProviderMemory] Failed to create memory directory:', error)
  }
}

/**
 * Load provider memory from disk
 */
export async function loadProviderMemory(
  providerId: string,
  providerName: string
): Promise<ProviderMemory> {
  try {
    await ensureMemoryDirectory()
    const filePath = await getMemoryFilePath(providerId)
    
    // Check if memory file exists
    const fileExists = await exists(filePath)
    
    if (!fileExists) {
      // Return default memory structure
      return createDefaultMemory(providerId, providerName)
    }
    
    // Read and parse memory file
    const content = await readTextFile(filePath)
    const memory = JSON.parse(content) as ProviderMemory
    
    console.log(`[ProviderMemory] Loaded memory for ${providerName}:`, {
      ideas: memory.ideas.length,
      facts: memory.facts.length,
      learnings: memory.learnings.length,
      peerInsights: memory.peerInsights.length
    })
    
    return memory
  } catch (error) {
    console.error('[ProviderMemory] Failed to load memory:', error)
    return createDefaultMemory(providerId, providerName)
  }
}

/**
 * Save provider memory to disk
 */
export async function saveProviderMemory(memory: ProviderMemory): Promise<void> {
  try {
    await ensureMemoryDirectory()
    const filePath = await getMemoryFilePath(memory.providerId)
    
    // Update timestamp
    memory.updatedAt = Date.now()
    
    // Save to file
    const content = JSON.stringify(memory, null, 2)
    await writeTextFile(filePath, content)
    
    console.log(`[ProviderMemory] Saved memory for ${memory.providerName}`)
  } catch (error) {
    console.error('[ProviderMemory] Failed to save memory:', error)
    throw error
  }
}

/**
 * Create default memory structure
 */
function createDefaultMemory(providerId: string, providerName: string): ProviderMemory {
  return {
    providerId,
    providerName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ideas: [],
    facts: [],
    learnings: [],
    preferences: {},
    peerInsights: []
  }
}

/**
 * Add a memory entry
 */
export async function addMemoryEntry(
  providerId: string,
  providerName: string,
  content: string,
  category: 'idea' | 'fact' | 'learning',
  tags: string[] = [],
  source?: string
): Promise<void> {
  const memory = await loadProviderMemory(providerId, providerName)
  
  const entry: MemoryEntry = {
    id: crypto.randomUUID(),
    content,
    timestamp: Date.now(),
    category,
    tags,
    source
  }
  
  switch (category) {
    case 'idea':
      memory.ideas.unshift(entry) // Add to beginning
      break
    case 'fact':
      memory.facts.unshift(entry)
      break
    case 'learning':
      memory.learnings.unshift(entry)
      break
  }
  
  // Keep only recent entries (max 50 per category)
  memory.ideas = memory.ideas.slice(0, 50)
  memory.facts = memory.facts.slice(0, 50)
  memory.learnings = memory.learnings.slice(0, 50)
  
  await saveProviderMemory(memory)
}

/**
 * Add peer insight (learning from other providers)
 */
export async function addPeerInsight(
  providerId: string,
  providerName: string,
  peerProviderId: string,
  peerProviderName: string,
  content: string,
  relevance: number = 50
): Promise<void> {
  const memory = await loadProviderMemory(providerId, providerName)
  
  const insight: PeerInsight = {
    providerId: peerProviderId,
    providerName: peerProviderName,
    content,
    timestamp: Date.now(),
    relevance
  }
  
  // Add to beginning and limit to 30 insights
  memory.peerInsights.unshift(insight)
  memory.peerInsights = memory.peerInsights.slice(0, 30)
  
  await saveProviderMemory(memory)
}

/**
 * Generate memory context prompt for a provider
 * This is included in the system prompt
 */
export function generateMemoryContext(memory: ProviderMemory): string {
  const sections: string[] = []
  
  // Recent ideas
  if (memory.ideas.length > 0) {
    const recentIdeas = memory.ideas.slice(0, 5)
    sections.push(`Your Recent Ideas:\n${recentIdeas.map(i => `- ${i.content}`).join('\n')}`)
  }
  
  // Known facts
  if (memory.facts.length > 0) {
    const relevantFacts = memory.facts.slice(0, 5)
    sections.push(`Facts You Know:\n${relevantFacts.map(f => `- ${f.content}`).join('\n')}`)
  }
  
  // Learnings
  if (memory.learnings.length > 0) {
    const recentLearnings = memory.learnings.slice(0, 5)
    sections.push(`Things You've Learned:\n${recentLearnings.map(l => `- ${l.content}`).join('\n')}`)
  }
  
  // Peer insights
  if (memory.peerInsights.length > 0) {
    const topInsights = memory.peerInsights
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5)
    sections.push(`Insights from Other Providers:\n${topInsights.map(i => `[${i.providerName}]: ${i.content}`).join('\n')}`)
  }
  
  if (sections.length === 0) {
    return ''
  }
  
  return `[Your Memory Context]\n${sections.join('\n\n')}`
}

/**
 * Extract key points from a message and add to memory
 */
export async function extractAndStoreMemory(
  providerId: string,
  providerName: string,
  message: string,
  discussSessionId?: string
): Promise<void> {
  // Simple extraction: look for key statements
  const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 20)
  
  for (const sentence of sentences.slice(0, 3)) {
    const trimmed = sentence.trim()
    
    // Skip tool calls
    if (trimmed.includes('tool_call')) continue
    if (trimmed.includes('{')) continue
    
    // Categorize based on keywords
    if (trimmed.toLowerCase().includes('think') || trimmed.toLowerCase().includes('believe')) {
      await addMemoryEntry(providerId, providerName, trimmed, 'idea', [], discussSessionId)
    } else if (trimmed.toLowerCase().includes('is') || trimmed.toLowerCase().includes('are')) {
      await addMemoryEntry(providerId, providerName, trimmed, 'fact', [], discussSessionId)
    } else {
      await addMemoryEntry(providerId, providerName, trimmed, 'learning', [], discussSessionId)
    }
  }
}

/**
 * Clear all memories for a provider
 */
export async function clearProviderMemory(providerId: string, providerName: string): Promise<void> {
  const memory = createDefaultMemory(providerId, providerName)
  await saveProviderMemory(memory)
  console.log(`[ProviderMemory] Cleared memory for ${providerName}`)
}

/**
 * Get memory statistics for all providers
 */
export async function getMemoryStats(): Promise<{ providerId: string; providerName: string; ideas: number; facts: number; learnings: number; peerInsights: number }[]> {
  try {
    await ensureMemoryDirectory()
    const appDir = await appLocalDataDir()
    const memoriesDir = await join(appDir, 'provider-memories')
    
    const dirExists = await exists(memoriesDir)
    if (!dirExists) {
      return []
    }
    
    const entries = await readDir(memoriesDir)
    const stats: { providerId: string; providerName: string; ideas: number; facts: number; learnings: number; peerInsights: number }[] = []
    
    for (const entry of entries) {
      if (entry.name?.endsWith('.json')) {
        try {
          const filePath = await join(memoriesDir, entry.name)
          const content = await readTextFile(filePath)
          const memory = JSON.parse(content) as ProviderMemory
          
          stats.push({
            providerId: memory.providerId,
            providerName: memory.providerName,
            ideas: memory.ideas.length,
            facts: memory.facts.length,
            learnings: memory.learnings.length,
            peerInsights: memory.peerInsights.length
          })
        } catch (e) {
          console.warn(`[ProviderMemory] Failed to read memory file ${entry.name}:`, e)
        }
      }
    }
    
    return stats
  } catch (error) {
    console.error('[ProviderMemory] Failed to get memory stats:', error)
    return []
  }
}