import * as pdfjsLib from 'pdfjs-dist'
import { readFile } from '@tauri-apps/plugin-fs'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

let cachedPdf: pdfjsLib.PDFDocumentProxy | null = null
let cachedPath: string | null = null

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

export async function getPdfText(path: string, pageNumbers: number[]): Promise<string> {
  const pdf = await loadPdf(path)
  const textParts: string[] = []

  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > pdf.numPages) continue

    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()

    if (pageText) {
      textParts.push(`--- Page ${pageNum} ---\n${pageText}`)
    }
  }

  return textParts.join('\n\n')
}

export async function getCurrentPageText(path: string, currentPage: number): Promise<string> {
  return getPdfText(path, [currentPage])
}

export async function getAllPagesText(path: string): Promise<string> {
  const pdf = await loadPdf(path)
  return getPdfText(path, Array.from({ length: pdf.numPages }, (_, i) => i + 1))
}

export function clearPdfCache(): void {
  cachedPdf?.destroy()
  cachedPdf = null
  cachedPath = null
}
