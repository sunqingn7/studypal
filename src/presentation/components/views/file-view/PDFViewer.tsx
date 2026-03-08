import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { readFile } from '@tauri-apps/plugin-fs'
import { useFileStore } from '../../../../application/store/file-store'
import './PDFViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

type PageMode = 'single' | 'double'

interface PDFViewerProps {
  path: string
  fileData?: Uint8Array | null
}

interface TextItem {
  str: string
  dir: string
  width: number
  height: number
  transform: number[]
  fontName: string
  hasEOL: boolean
}

interface TextContent {
  items: TextItem[]
  styles: Record<string, unknown>
}

function PDFViewer({ path, fileData }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { setCurrentPage: updateStorePage } = useFileStore()
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPageState] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageMode, setPageMode] = useState<PageMode>('single')
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map())

  const setCurrentPage = useCallback((page: number | ((prev: number) => number)) => {
    if (typeof page === 'function') {
      setCurrentPageState((prev) => {
        const newPage = page(prev)
        updateStorePage(newPage)
        return newPage
      })
    } else {
      setCurrentPageState(page)
      updateStorePage(page)
    }
  }, [updateStorePage])

  const getSecondPage = useCallback(() => {
    if (pageMode === 'double' && currentPage < totalPages) {
      return currentPage + 1
    }
    return null
  }, [currentPage, totalPages, pageMode])

  const renderPage = useCallback(async (pageNum: number, canvas: HTMLCanvasElement | null) => {
    if (!pdf || !canvas) return

    // Cancel any existing render task for this page
    const existingTask = renderTasksRef.current.get(pageNum)
    if (existingTask) {
      existingTask.cancel()
      renderTasksRef.current.delete(pageNum)
    }

    try {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const context = canvas.getContext('2d')

      if (!context) return

      canvas.height = viewport.height
      canvas.width = viewport.width

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      }

      const renderTask = page.render(renderContext)
      
      // Store the render task so we can cancel it if needed
      renderTasksRef.current.set(pageNum, {
        cancel: () => renderTask.cancel()
      })

      await renderTask.promise
      
      // Remove the task after completion
      renderTasksRef.current.delete(pageNum)

      // Extract and render text layer
      const textContent = await page.getTextContent()

      // Render text layer
      const textLayerDiv = textLayerRefs.current.get(pageNum)
      if (textLayerDiv) {
        renderTextLayer(textLayerDiv, textContent as TextContent, viewport)
      }
    } catch (err) {
      // Don't log cancellation errors as they're expected
      if (err instanceof Error && err.message.includes('Rendering cancelled')) {
        return
      }
      console.error(`Error rendering page ${pageNum}:`, err)
    }
  }, [pdf, scale])

  const renderTextLayer = (container: HTMLDivElement, textContent: TextContent, viewport: pdfjsLib.PageViewport) => {
    container.innerHTML = ''
    container.style.width = `${viewport.width}px`
    container.style.height = `${viewport.height}px`

    textContent.items.forEach((item: TextItem) => {
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const textDiv = document.createElement('div')
      textDiv.textContent = item.str
      textDiv.style.position = 'absolute'
      textDiv.style.left = `${tx[4]}px`
      textDiv.style.top = `${tx[5]}px`
      textDiv.style.fontSize = `${item.height}px`
      textDiv.style.fontFamily = item.fontName
      textDiv.style.whiteSpace = 'pre'
      textDiv.style.transform = `scaleX(${tx[0] / item.width})`
      textDiv.style.transformOrigin = 'left bottom'
      textDiv.style.userSelect = 'text'
      textDiv.style.cursor = 'text'
      container.appendChild(textDiv)
    })
  }

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      try {
        let typedArray: Uint8Array
        
        // Use provided fileData from backend if available
        if (fileData) {
          typedArray = fileData
        } else {
          // Fallback to reading file directly (may fail due to permissions)
          const data = await readFile(path)
          typedArray = new Uint8Array(data)
        }
        
        const loadingTask = pdfjsLib.getDocument({ data: typedArray })
        const pdfDoc = await loadingTask.promise
        setPdf(pdfDoc)
        setTotalPages(pdfDoc.numPages)
        setCurrentPage(1)
      } catch (err) {
        console.error('Error loading PDF:', err)
        const errorMessage = err instanceof Error ? err.message : String(err)
        
        // Check for permission errors
        if (errorMessage.includes('forbidden') || errorMessage.includes('permission') || errorMessage.includes('scope')) {
          setError(`PERMISSION_DENIED:${path}`)
        } else {
          setError(`Failed to load PDF: ${errorMessage}`)
        }
      } finally {
        setLoading(false)
      }
    }

    loadPdf()

    return () => {
      pdf?.destroy()
    }
  }, [path, fileData])

  useEffect(() => {
    if (!pdf) return

    const loadVisiblePages = async () => {
      const canvas1 = canvasRefs.current.get(1)
      const canvas2 = canvasRefs.current.get(2)

      if (canvas1) {
        await renderPage(currentPage, canvas1)
      }

      const secondPage = getSecondPage()
      if (secondPage && canvas2) {
        await renderPage(secondPage, canvas2)
      }
    }

    loadVisiblePages()
  }, [pdf, currentPage, scale, pageMode, renderPage, getSecondPage])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || error) return

      // Ignore keyboard events when typing in input fields
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // Allow copy shortcuts (Cmd+C, Ctrl+C)
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        return // Let the browser handle copy
      }

      switch (e.key) {
        case 'PageUp':
        case 'ArrowUp':
          e.preventDefault()
          goToPrevPage()
          break
        case 'PageDown':
        case 'ArrowDown':
        case ' ':
          e.preventDefault()
          goToNextPage()
          break
        case 'Home':
          e.preventDefault()
          setCurrentPage(1)
          break
        case 'End':
          e.preventDefault()
          setCurrentPage(totalPages)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [loading, error, totalPages])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (loading || error) return

    const container = containerRef.current
    if (!container) return

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      if (e.deltaY < 0) {
        zoomIn()
      } else {
        zoomOut()
      }
    } else {
      if (e.deltaY > 0) {
        goToNextPage()
      } else if (e.deltaY < 0) {
        goToPrevPage()
      }
    }
  }, [loading, error])

  const goToPrevPage = useCallback(() => {
    const step = pageMode === 'double' ? 2 : 1
    setCurrentPage((prev) => Math.max(1, prev - step))
  }, [pageMode])

  const goToNextPage = useCallback(() => {
    const step = pageMode === 'double' ? 2 : 1
    setCurrentPage((prev) => Math.min(totalPages, prev + step))
  }, [pageMode, totalPages])

  const zoomIn = () => {
    setScale((prev) => Math.min(3, prev + 0.2))
  }

  const zoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.2))
  }

  if (loading) {
    return (
      <div className="pdf-viewer-loading">
        <div className="spinner"></div>
        <p>Loading PDF...</p>
      </div>
    )
  }

  if (error) {
    const isPermissionError = error.startsWith('PERMISSION_DENIED:')
    const filePath = isPermissionError ? error.replace('PERMISSION_DENIED:', '') : ''
    
    return (
      <div className="pdf-viewer-error">
        {isPermissionError ? (
          <>
            <p>Permission denied to access this file.</p>
            <p className="error-path">{filePath}</p>
            <p className="error-hint">
              This file is outside the allowed directory scope. 
              Please move the file to your Documents folder or grant permission.
            </p>
            <button 
              className="permission-button"
              onClick={() => window.location.reload()}
            >
              Retry Loading
            </button>
          </>
        ) : (
          <p>{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <div className="pdf-navigation">
          <button onClick={goToPrevPage} disabled={currentPage <= 1}>
            ◀
          </button>
          <span>
            {pageMode === 'double' && currentPage < totalPages
              ? `${currentPage}-${currentPage + 1} / ${totalPages}`
              : `${currentPage} / ${totalPages}`}
          </span>
          <button onClick={goToNextPage} disabled={currentPage >= totalPages}>
            ▶
          </button>
        </div>
        <div className="pdf-zoom">
          <button onClick={zoomOut}>-</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn}>+</button>
        </div>
        <div className="pdf-mode">
          <button
            className={pageMode === 'single' ? 'active' : ''}
            onClick={() => setPageMode('single')}
            title="Single page"
          >
            1
          </button>
          <button
            className={pageMode === 'double' ? 'active' : ''}
            onClick={() => setPageMode('double')}
            title="Double page"
          >
            2
          </button>
        </div>
      </div>
      <div
        className={`pdf-canvas-container ${pageMode}`}
        ref={containerRef}
        onWheel={handleWheel}
      >
        <div className={`pdf-pages ${pageMode}`}>
          <div className="pdf-page-wrapper">
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(1, el)
                else canvasRefs.current.delete(1)
              }}
            />
            <div
              className="pdf-text-layer"
              ref={(el) => {
                if (el) textLayerRefs.current.set(currentPage, el)
                else textLayerRefs.current.delete(currentPage)
              }}
            />
          </div>
          {pageMode === 'double' && currentPage < totalPages && (
            <div className="pdf-page-wrapper">
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(2, el)
                  else canvasRefs.current.delete(2)
                }}
              />
              <div
                className="pdf-text-layer"
                ref={(el) => {
                  const secondPage = currentPage + 1
                  if (el) textLayerRefs.current.set(secondPage, el)
                  else textLayerRefs.current.delete(secondPage)
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PDFViewer
