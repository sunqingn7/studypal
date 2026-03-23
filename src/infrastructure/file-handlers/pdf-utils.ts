import { invoke } from '@tauri-apps/api/core'
import * as pdfjsLib from 'pdfjs-dist'
import { FileReadingService } from './file-reading-service'

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

  // Use FileReadingService to avoid permission issues
  const fileData = await FileReadingService.readBinaryFile(path)
  const loadingTask = pdfjsLib.getDocument({ data: fileData })
  cachedPdf = await loadingTask.promise
  cachedPath = path
  return cachedPdf
}

export async function getPdfText(path: string, pageNumbers: number[]): Promise<string> {
  try {
    const cacheKey = `${path}:${pageNumbers.join(',')}`
    
    if (textCache.has(cacheKey)) {
      return textCache.get(cacheKey)!
    }
    
    const pageText = await invoke<string>('extract_pdf_text', { path, pageNumbers })
    
    textCache.set(cacheKey, pageText)
    
    return pageText
  } catch (error: any) {
    console.error('[pdf-utils] Error extracting PDF text:', error)
    return '' // Return empty on any error
  }
}

export async function getCurrentPageText(path: string, currentPage: number): Promise<string> {
  // Extract current page and next page (if available) for better context
  // This provides more context while keeping token usage reasonable
  const pages = [currentPage];
  if (currentPage > 1) {
    pages.unshift(currentPage - 1); // Previous page for context
  }
  pages.push(currentPage + 1); // Next page (backend will handle if it doesn't exist)
  
  return getPdfText(path, pages)
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
