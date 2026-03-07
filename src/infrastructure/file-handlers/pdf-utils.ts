import { invoke } from '@tauri-apps/api/core'
import * as pdfjsLib from 'pdfjs-dist'
import { readFile } from '@tauri-apps/plugin-fs'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

let cachedPdf: pdfjsLib.PDFDocumentProxy | null = null
let cachedPath: string | null = null

// Cache for extracted text
const textCache = new Map<string, string>()

export async function loadPdf(path: string): Promise<pdfjsLib.PDFDocumentProxy> {
  if (cachedPdf && cachedPath === path) {
    return cachedPdf
  }

  const fileData = await readFile(path)
  const typedArray = new Uint8Array(fileData)
  const loadingTask = pdfjsLib.getDocument({ data: typedArray })
  cachedPdf = await loadingTask.promise
  cachedPath = path
  return cachedPdf
}

export async function getPdfText(path: string, _pageNumbers: number[]): Promise<string> {
  try {
    console.log('[pdf-utils] Extracting PDF text via Rust backend for:', path)
    
    // Check cache first
    if (textCache.has(path)) {
      console.log('[pdf-utils] Using cached text')
      return textCache.get(path)!
    }
    
    // Extract text using Rust backend
    const fullText = await invoke<string>('extract_pdf_text', { path })
    console.log('[pdf-utils] Extracted', fullText.length, 'characters')
    
    // Cache the result
    textCache.set(path, fullText)
    
    return fullText
  } catch (error: any) {
    console.error('[pdf-utils] Error extracting PDF text:', error)
    return ''  // Return empty on any error
  }
}

export async function getCurrentPageText(path: string, currentPage: number): Promise<string> {
  // For now, return all text since we extract the whole document
  // In the future, we could extract per-page if needed
  return getPdfText(path, [currentPage])
}

export async function getAllPagesText(path: string): Promise<string> {
  return getPdfText(path, [1])
}

export function clearPdfCache(): void {
  cachedPdf?.destroy()
  cachedPdf = null
  cachedPath = null
  textCache.clear()
}
