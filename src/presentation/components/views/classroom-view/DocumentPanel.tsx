import { useClassroomStore } from '../../../../application/store/classroom-store'
import './DocumentPanel.css'

export function DocumentPanel() {
  const { documentContent, currentPage, totalPages, nextPage, prevPage, isPaused, pauseClassroom, resumeClassroom } = useClassroomStore()

  return (
    <div className="document-panel">
      <div className="document-header">
        <span className="document-title">Document</span>
        <div className="document-controls">
          <button className="doc-nav-btn" onClick={prevPage} disabled={currentPage <= 1}>
            ←
          </button>
          <span className="doc-page-indicator">{currentPage} / {totalPages}</span>
          <button className="doc-nav-btn" onClick={nextPage} disabled={currentPage >= totalPages}>
            →
          </button>
          <button 
            className="doc-pause-btn" 
            onClick={isPaused ? resumeClassroom : pauseClassroom}
          >
            {isPaused ? '▶' : '⏸'}
          </button>
        </div>
      </div>
      
      <div className="document-content">
        {documentContent ? (
          <div className="document-page">
            <pre className="document-text">{documentContent}</pre>
          </div>
        ) : (
          <div className="document-placeholder">
            <div className="placeholder-icon">📄</div>
            <p>No document loaded</p>
          </div>
        )}
      </div>
    </div>
  )
}
