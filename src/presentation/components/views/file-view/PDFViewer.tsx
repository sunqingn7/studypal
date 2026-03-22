import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import { FileReadingService } from '../../../../infrastructure/file-handlers/file-reading-service'
import { useDocumentMetadataStore } from '../../../../application/store/document-metadata-store'
import './PDFViewer.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

type PageMode = 'single' | 'double'

interface PDFViewerProps {
  path: string
  fileData?: Uint8Array | null
  initialPage?: number
}

function PDFViewer({ path, fileData, initialPage = 1 }: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const metadataStore = useDocumentMetadataStore()
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPageState] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageMode, setPageModeState] = useState<PageMode>('single')
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map())
  const isInitialPageSetRef = useRef(false)

  // Update page when initialPage changes (from file store) - only on mount
  useEffect(() => {
    if (initialPage && initialPage !== currentPage && !isInitialPageSetRef.current) {
      console.log('[PDFViewer] Setting page from initialPage:', initialPage)
      setCurrentPageState(initialPage)
      isInitialPageSetRef.current = true
    }
  }, [initialPage])

  // Load metadata when PDF opens - only apply view settings, not page (page comes from file store)
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const metadata = await metadataStore.loadMetadata(path)
        if (metadata) {
          console.log('[PDFViewer] Loaded metadata:', metadata)
          // Apply saved view settings (viewMode, scale)
          if (metadata.viewMode === 'double') {
            setPageModeState('double')
          }
          if (metadata.scale && metadata.scale !== 1.0) {
            setScale(metadata.scale)
          }
        }
      } catch (e) {
        console.log('[PDFViewer] No metadata found, using defaults')
      }
    }
    
    loadMetadata()
  }, [path])

  // Wrap setPageMode to save metadata
  const setPageMode = useCallback((mode: PageMode) => {
    setPageModeState(mode)
    metadataStore.updateMetadata({ viewMode: mode })
  }, [metadataStore])

  const setCurrentPage = useCallback((page: number | ((prev: number) => number)) => {
    console.log('[PDFViewer] setCurrentPage called with:', typeof page === 'function' ? '(function)' : page)
    if (typeof page === 'function') {
      setCurrentPageState((prev) => {
        const newPage = page(prev)
        console.log('[PDFViewer] setCurrentPage function updater: prev=', prev, 'newPage=', newPage)
        metadataStore.updateMetadata({ currentPage: newPage })
        return newPage
      })
    } else {
      console.log('[PDFViewer] setCurrentPage direct call: page=', page)
      metadataStore.updateMetadata({ currentPage: page })
      setCurrentPageState(page)
    }
  }, [metadataStore])

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

      // Render text layer
      const textLayerDiv = textLayerRefs.current.get(pageNum)
      if (textLayerDiv) {
        renderTextLayer(textLayerDiv, page)
      }
    } catch (err) {
      // Don't log cancellation errors as they're expected
      if (err instanceof Error && err.message.includes('Rendering cancelled')) {
        return
      }
      console.error(`Error rendering page ${pageNum}:`, err)
    }
  }, [pdf, scale])

const renderTextLayer = async (container: HTMLDivElement, page: pdfjsLib.PDFPageProxy) => {
  container.innerHTML = ''

  const viewport = page.getViewport({ scale })
  container.style.width = `${viewport.width}px`
  container.style.height = `${viewport.height}px`
  container.style.setProperty('--scale-factor', scale.toString())

  // Apply styles directly to container for guaranteed effect
  container.style.position = 'absolute'
  container.style.top = '0'
  container.style.left = '0'
  container.style.zIndex = '2'
  container.style.pointerEvents = 'auto'
  container.style.cursor = 'text'

  try {
    const textLayer = new TextLayer({
      container,
      textContentSource: page.streamTextContent(),
      viewport,
    })

    await textLayer.render()

    // Apply styles to all text spans after render
    const spans = container.querySelectorAll('span')
    spans.forEach((span) => {
      const htmlSpan = span as HTMLElement
      htmlSpan.style.color = 'transparent'
      htmlSpan.style.cursor = 'text'
      htmlSpan.style.userSelect = 'text'
      htmlSpan.style.webkitUserSelect = 'text'
      htmlSpan.style.pointerEvents = 'auto'
      htmlSpan.style.display = 'inline'
    })

    console.log('[PDFViewer] Text layer rendered, children:', container.children.length, 'spans:', spans.length)
  } catch (err) {
    console.warn('[PDFViewer] Failed to render text layer:', err)
  }
}

useEffect(() => {
    const loadPdf = async () => {
      // Clean up existing PDF before loading new one
      if (pdf) {
        pdf.destroy()
        setPdf(null)
      }

      // Cancel any pending render tasks
      renderTasksRef.current.forEach((task) => {
        task.cancel()
      })
      renderTasksRef.current.clear()

      setLoading(true)
      setError(null)

      try {
        let typedArray: Uint8Array

        // Use provided fileData from backend if available
        if (fileData) {
          typedArray = fileData
        } else {
          // Use FileReadingService to avoid permission issues
          typedArray = await FileReadingService.readBinaryFile(path)
        }

        const loadingTask = pdfjsLib.getDocument({ data: typedArray })
        const pdfDoc = await loadingTask.promise
        setPdf(pdfDoc)
        setTotalPages(pdfDoc.numPages)
        // Only set to page 1 if initialPage is not provided or is invalid
        if (!initialPage || initialPage < 1) {
          setCurrentPage(1)
        }
      } catch (err) {
        console.error('Error loading PDF:', err)
        
        // Check for DataCloneError specifically
        if (err instanceof Error && err.name === 'DataCloneError') {
          console.error('DataCloneError details:', {
            message: err.message,
            stack: err.stack,
            path,
            hasFileData: !!fileData,
            fileDataType: fileData ? fileData.constructor.name : null,
          })
          setError(`Failed to load PDF: DataCloneError - the file data may be corrupted. Try reopening the file.`)
        }
        
        const errorMessage = err instanceof Error ? err.message : String(err)

        // Check for permission errors
        if (errorMessage.includes('forbidden') || errorMessage.includes('permission') || errorMessage.includes('scope')) {
          setError(`PERMISSION_DENIED:${path}`)
        } else if (!errorMessage.includes('DataCloneError')) {
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
    setScale((prev) => {
      const newScale = Math.min(3, prev + 0.2)
      metadataStore.updateMetadata({ scale: newScale })
      return newScale
    })
  }

  const zoomOut = () => {
    setScale((prev) => {
      const newScale = Math.max(0.5, prev - 0.2)
      metadataStore.updateMetadata({ scale: newScale })
      return newScale
    })
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
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
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
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
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
