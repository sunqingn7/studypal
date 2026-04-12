import { useEffect, useRef } from 'react'
import { useTranslationStore } from '../../../../application/store/translation-store'
import { useFileStore } from '../../../../application/store/file-store'
import PDFViewer from '../file-view/PDFViewer'
import './TranslationView.css'

function TranslationView() {
  const { isActive, translatedPdfPath, scrollPercent, error, translateAndPrefetch, isTranslating } = useTranslationStore()
  const currentFile = useFileStore(state => state.currentFile)
  const hasTranslatedRef = useRef(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  
  // Translate only once when translation is activated
  useEffect(() => {
    if (isActive && currentFile && !hasTranslatedRef.current) {
      hasTranslatedRef.current = true
      translateAndPrefetch()
    }
    
    // Reset when deactivated
    if (!isActive) {
      hasTranslatedRef.current = false
    }
  }, [isActive, currentFile])
  
  // Sync scroll position from original PDF viewer
  useEffect(() => {
    if (pdfContainerRef.current && scrollPercent > 0) {
      const { scrollHeight, clientHeight } = pdfContainerRef.current
      const maxScroll = scrollHeight - clientHeight
      if (maxScroll > 0) {
        pdfContainerRef.current.scrollTop = scrollPercent * maxScroll
      }
    }
  }, [scrollPercent])

  // Render translated PDF using the same PDFViewer component
  const renderTranslatedPDF = () => {
    if (!translatedPdfPath) return null
    
    return (
      <PDFViewer 
        path={translatedPdfPath}
        initialPage={1}
      />
    )
  }
  
  if (!isActive) {
    return null
  }
  
  return (
    <div className="translation-view" ref={containerRef}>
      <div className="translation-header">
        <span className="translation-title">Translation</span>
        {isTranslating && (
          <span className="translating-indicator">Translating...</span>
        )}
      </div>
      
      <div className="translation-content" ref={pdfContainerRef}>
        {error && (
          <div className="translation-error">
            <p>Translation error: {error}</p>
          </div>
        )}
        
        {!translatedPdfPath && !isTranslating && !error && (
          <div className="translation-placeholder">
            <p>Click translate to start</p>
          </div>
        )}
        
        {isTranslating && !translatedPdfPath && (
          <div className="translation-loading">
            <div className="loading-spinner"></div>
            <p>Translating document...</p>
          </div>
        )}
        
        {translatedPdfPath && (
          renderTranslatedPDF()
        )}
      </div>
    </div>
  )
}

export default TranslationView