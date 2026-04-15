import { useEffect, useRef, useState } from 'react'
import { useTranslationStore } from '../../../../application/store/translation-store'
import { useFileStore } from '../../../../application/store/file-store'
import PDFViewer from '../file-view/PDFViewer'
import { TranslationErrorModal } from '../../modals/TranslationErrorModal'
import { useLLMPoolStore } from '../../../../application/store/llm-pool-store'
import { translateDocument } from '../../../../application/services/translation-service'
import { RotateCcw, Square, AlertCircle } from 'lucide-react'
import './TranslationView.css'

function TranslationView() {
  const translationStore = useTranslationStore()
  const {
    isActive,
    translatedPdfPath,
    error,
    translateAndPrefetch,
    forceRetranslate,
    stopTranslation,
    isTranslating,
    canStop,
  } = translationStore
  const currentFile = useFileStore((state) => state.currentFile)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [lastError, setLastError] = useState('')
  const llmPool = useLLMPoolStore()

  const containerRef = useRef<HTMLDivElement>(null)

  // Translate when activated - use translatedPdfPath to determine if we need to translate
  // This handles the case where translation is restored from session (translatedPdfPath might be cached)
  useEffect(() => {
    console.log('[TranslationView] Effect:', {
      isActive,
      currentFile: !!currentFile,
      translatedPdfPath,
      isTranslating,
    })

    // Only translate if:
    // 1. Translation is active
    // 2. We have a current file
    // 3. We don't already have a translated PDF (cached or new)
    // 4. We're not currently translating
    if (isActive && currentFile && !translatedPdfPath && !isTranslating) {
      console.log('[TranslationView] Calling translateAndPrefetch')
      handleTranslate()
    }
  }, [isActive, currentFile, translatedPdfPath, isTranslating])

  const handleTranslate = async () => {
    try {
      await translateAndPrefetch()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setLastError(errorMsg)
      setShowErrorModal(true)
    }
  }

  const handleStop = async () => {
    await stopTranslation()
  }

  const handleForceRetranslate = async () => {
    if (
      confirm(
        'Force retranslate? This will clear the cached translation and start over.'
      )
    ) {
      await forceRetranslate()
    }
  }

  const handleRetrySame = async () => {
    setShowErrorModal(false)
    await handleTranslate()
  }

  const handleRetryWithProvider = async (providerId: string) => {
    setShowErrorModal(false)
    if (!currentFile) return

    try {
      await translateDocument(currentFile.path, 'en', 'zh', {
        retryProviderId: providerId,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setLastError(errorMsg)
      setShowErrorModal(true)
    }
  }

  const handleFallbackToGoogle = async () => {
    setShowErrorModal(false)
    if (!currentFile) return

    try {
      // Force use google by setting service to google in temporary request
      const result = await translateDocument(currentFile.path, 'en', 'zh', {
        forceRetranslate: true,
      })
      if (!result.success) {
        setLastError(result.error || 'Google translation failed')
        setShowErrorModal(true)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setLastError(errorMsg)
      setShowErrorModal(true)
    }
  }

  const handleCancelError = () => {
    setShowErrorModal(false)
  }

  if (!isActive) {
    return null
  }

  const enabledProviders = llmPool.providers
    .filter((p) => p.isEnabled)
    .map((p) => ({
      id: p.id,
      name: p.nickname || p.name,
      type: p.config.provider,
    }))

  return (
    <div className="translation-view" ref={containerRef}>
      <div className="translation-header">
        <span className="translation-title">Translation</span>
        <div className="translation-controls">
          {isTranslating && canStop && (
            <button
              className="translation-btn stop"
              onClick={handleStop}
              title="Stop translation"
            >
              <Square size={14} />
              Stop
            </button>
          )}
          {translatedPdfPath && !isTranslating && (
            <button
              className="translation-btn redo"
              onClick={handleForceRetranslate}
              title="Force retranslate (clear cache)"
            >
              <RotateCcw size={14} />
              Redo
            </button>
          )}
          {isTranslating && (
            <span className="translating-indicator">Translating...</span>
          )}
        </div>
      </div>

      <div className="translation-content">
        {error && (
          <div className="translation-error">
            <AlertCircle size={16} />
            <p>{error}</p>
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
            <p className="translation-hint">
              This may take a few minutes for large documents
            </p>
          </div>
        )}

      {translatedPdfPath && (
        <PDFViewer
          path={translatedPdfPath}
          initialPage={translationStore.currentPage}
          isTranslationView={true}
        />
      )}
      </div>

      <TranslationErrorModal
        isOpen={showErrorModal}
        error={lastError}
        availableProviders={enabledProviders}
        onRetrySame={handleRetrySame}
        onRetryWithProvider={handleRetryWithProvider}
        onFallbackToGoogle={handleFallbackToGoogle}
        onCancel={handleCancelError}
      />
    </div>
  )
}

export default TranslationView
