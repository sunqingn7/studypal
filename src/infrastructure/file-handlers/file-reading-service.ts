import { invoke } from '@tauri-apps/api/core'

export interface FileReadResult {
  path: string
  name: string
  extension: string | null
  size: number
  content: Uint8Array | null
  textContent: string | null
}

interface FileOpenResult {
  path: string
  name: string
  extension: string | null
  size: number
  content: number[] | null
}

// Cache for file contents
const fileCache = new Map<string, FileReadResult>()
const MAX_CACHE_SIZE = 50 // Maximum number of cached files

/**
 * Unified file reading service that uses Rust backend to avoid permission issues.
 * This service provides a standardized way to read any file type.
 */
export class FileReadingService {
  /**
   * Read a file and return both binary and text content
   * Uses Rust backend to bypass Tauri permission issues
   */
  static async readFile(filePath: string, useCache: boolean = true): Promise<FileReadResult> {
    // Check cache first, but validate the cached data
    if (useCache && fileCache.has(filePath)) {
      const cached = fileCache.get(filePath)!
      // Validate cached content is a proper Uint8Array
      if (cached.content instanceof Uint8Array && cached.content.length > 0) {
        return cached
      } else {
        fileCache.delete(filePath)
      }
    }

    try {
      const result = await invoke<FileOpenResult>('read_file', {
        filePath,
      })

      // Convert number array to Uint8Array
      const binaryContent = result.content ? new Uint8Array(result.content) : null
      
      // Try to decode as text if it's a text file
      let textContent: string | null = null
      if (binaryContent) {
        textContent = this.decodeToText(binaryContent)
      }

      const fileResult: FileReadResult = {
        path: result.path,
        name: result.name,
        extension: result.extension,
        size: result.size,
        content: binaryContent,
        textContent,
      }

      // Cache the result
      if (useCache) {
        this.addToCache(filePath, fileResult)
      }

      return fileResult
    } catch (error) {
      console.error('[FileReadingService] Error reading file:', error)
      throw new Error(`Failed to read file: ${error}`)
    }
  }

  /**
   * Read file as text only
   */
  static async readTextFile(filePath: string, useCache: boolean = true): Promise<string> {
    const result = await this.readFile(filePath, useCache)
    if (result.textContent === null) {
      throw new Error('File could not be decoded as text')
    }
    return result.textContent
  }

  /**
   * Read file as binary only
   */
  static async readBinaryFile(filePath: string, useCache: boolean = true): Promise<Uint8Array> {
    const result = await this.readFile(filePath, useCache)
    if (result.content === null) {
      throw new Error('File content is empty or too large')
    }
    return result.content
  }

  /**
   * Clear the file cache
   */
  static clearCache(): void {
    fileCache.clear()
  }

  /**
   * Remove a specific file from cache
   */
  static removeFromCache(filePath: string): void {
    fileCache.delete(filePath)
  }

  /**
   * Get cache size
   */
  static getCacheSize(): number {
    return fileCache.size
  }

  /**
   * Decode binary content to text
   */
  private static decodeToText(binaryContent: Uint8Array): string {
    try {
      // Try UTF-8 first
      const decoder = new TextDecoder('utf-8', { fatal: true })
      return decoder.decode(binaryContent)
    } catch {
      const decoder = new TextDecoder('latin1')
      return decoder.decode(binaryContent)
    }
  }

  /**
   * Add file to cache with LRU eviction
   */
  private static addToCache(filePath: string, result: FileReadResult): void {
    // Evict oldest entries if cache is full
    if (fileCache.size >= MAX_CACHE_SIZE) {
      const firstKey = fileCache.keys().next().value
      if (firstKey !== undefined) {
        fileCache.delete(firstKey)
      }
    }
    
    fileCache.set(filePath, result)
  }
}

// Export a singleton instance for convenience
export const fileReadingService = FileReadingService
