import { useEffect, useRef } from 'react'
import { useTranslationStore } from '../../../../application/store/translation-store'
import { useFileStore } from '../../../../application/store/file-store'
import './TranslationView.css'

function TranslationView() {
  const { isActive, translatedPdfPath, scrollPercent, error, translateAndPrefetch, isTranslating } = useTranslationStore()
  const currentFile = useFileStore(state => state.currentFile)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  
  // Translate when page changes
  useEffect(() => {
    if (isActive && currentFile) {
      translateAndPrefetch()
    }
  }, [isActive, currentFile, translateAndPrefetch])
  
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
          <iframe 
            src={`asset://localhost/${translatedPdfPath.replace(/\\/g, '/')}`}
            className="translation-pdf"
            title="Translated PDF"
          />
        )}
      </div>
    </div>
  )
}

export default TranslationView