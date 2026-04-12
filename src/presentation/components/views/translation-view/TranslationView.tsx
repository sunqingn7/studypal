import { useEffect, useRef } from 'react'
import { useTranslationStore } from '../../../../application/store/translation-store'
import { useFileStore } from '../../../../application/store/file-store'
import './TranslationView.css'

function TranslationView() {
  const { isActive, translatedPages, translatingPages, scrollPercent, error, translateAndPrefetch } = useTranslationStore()
  const currentFile = useFileStore(state => state.currentFile)
  const currentPage = useFileStore(state => state.currentPage)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  
  // Get current translated page path
  const translatedPath = currentPage ? translatedPages.get(currentPage)?.path : null
  const isTranslatingCurrentPage = currentPage ? translatingPages.has(currentPage) : false
  
  // Translate current page + prefetch when page changes
  // Use default total pages (100) as fallback if unknown
  const TOTAL_PAGES_FALLBACK = 100
  
  useEffect(() => {
    if (isActive && currentPage && currentFile) {
      translateAndPrefetch(currentPage, TOTAL_PAGES_FALLBACK)
    }
  }, [isActive, currentPage, currentFile, translateAndPrefetch])
  
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
        {isTranslatingCurrentPage && (
          <span className="translating-indicator">Translating...</span>
        )}
      </div>
      
      <div className="translation-content" ref={pdfContainerRef}>
        {error && (
          <div className="translation-error">
            <p>Translation error: {error}</p>
          </div>
        )}
        
        {!translatedPath && !isTranslatingCurrentPage && !error && (
          <div className="translation-placeholder">
            <p>Click translate to start</p>
          </div>
        )}
        
        {isTranslatingCurrentPage && !translatedPath && (
          <div className="translation-loading">
            <div className="loading-spinner"></div>
            <p>Translating page {currentPage}...</p>
          </div>
        )}
        
        {translatedPath && (
          <iframe 
            src={`asset://localhost/${translatedPath.replace(/\\/g, '/')}`}
            className="translation-pdf"
            title="Translated PDF"
          />
        )}
      </div>
    </div>
  )
}

export default TranslationView