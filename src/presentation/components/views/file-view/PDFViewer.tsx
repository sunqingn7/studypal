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
}

function PDFViewer({ path }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { setCurrentPage: updateStorePage } = useFileStore()
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPageState] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageMode, setPageMode] = useState<PageMode>('single')
  const [canvasRefs] = useState(() => new Map<number, HTMLCanvasElement>())

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

      await page.render(renderContext).promise
    } catch (err) {
      console.error(`Error rendering page ${pageNum}:`, err)
    }
  }, [pdf, scale])

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      try {
        const fileData = await readFile(path)
        const typedArray = new Uint8Array(fileData)
        const loadingTask = pdfjsLib.getDocument({ data: typedArray })
        const pdfDoc = await loadingTask.promise
        setPdf(pdfDoc)
        setTotalPages(pdfDoc.numPages)
        setCurrentPage(1)
      } catch (err) {
        console.error('Error loading PDF:', err)
        setError(`Failed to load PDF: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }

    loadPdf()

    return () => {
      pdf?.destroy()
    }
  }, [path])

  useEffect(() => {
    if (!pdf) return

    const canvas1 = canvasRefs.get(1)
    const canvas2 = canvasRefs.get(2)

    renderPage(currentPage, canvas1 || null)
    const secondPage = getSecondPage()
    if (secondPage) {
      renderPage(secondPage, canvas2 || null)
    }
  }, [pdf, currentPage, scale, pageMode, renderPage, getSecondPage, canvasRefs])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || error) return

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
    return (
      <div className="pdf-viewer-error">
        <p>{error}</p>
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
          <canvas
            ref={(el) => {
              if (el) canvasRefs.set(1, el)
              else canvasRefs.delete(1)
            }}
          />
          {pageMode === 'double' && currentPage < totalPages && (
            <canvas
              ref={(el) => {
                if (el) canvasRefs.set(2, el)
                else canvasRefs.delete(2)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default PDFViewer
