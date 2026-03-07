import { invoke } from '@tauri-apps/api/core'

export async function fetchWebContent(url: string): Promise<string> {
  return invoke<string>('fetch_web_content', { url })
}

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const result = await invoke<string>('search_web', { query })
  try {
    return JSON.parse(result)
  } catch {
    return []
  }
}
