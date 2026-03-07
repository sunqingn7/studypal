import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import './PDFViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

interface PDFViewerProps {
  path: string
}

function PDFViewer({ path }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      try {
        const loadingTask = pdfjsLib.getDocument(path)
        const pdfDoc = await loadingTask.promise
        setPdf(pdfDoc)
        setTotalPages(pdfDoc.numPages)
        setCurrentPage(1)
      } catch (err) {
        console.error('Error loading PDF:', err)
        setError('Failed to load PDF')
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
    const renderPage = async () => {
      if (!pdf || !canvasRef.current) return

      try {
        const page = await pdf.getPage(currentPage)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
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
        console.error('Error rendering page:', err)
      }
    }

    renderPage()
  }, [pdf, currentPage, scale])

  const goToPrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1))
  }

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
  }

  const zoomIn = () => {
    setScale((prev) => Math.min(3, prev + 0.25))
  }

  const zoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.25))
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
            {currentPage} / {totalPages}
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
      </div>
      <div className="pdf-canvas-container">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}

export default PDFViewer
