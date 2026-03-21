import { useClassroomStore } from '../../../../application/store/classroom-store'
import './PPTPanel.css'

export function PPTPanel() {
  const { pptSlides, currentPage, nextPage, prevPage, isPaused, pauseClassroom, resumeClassroom } = useClassroomStore()

  const currentSlide = pptSlides.find((s) => s.pageNumber === currentPage)

  return (
    <div className="ppt-panel">
      <div className="ppt-header">
        <span className="ppt-title">Presentation</span>
        <div className="ppt-controls">
          <button className="ppt-nav-btn" onClick={prevPage} disabled={currentPage <= 1}>
            ← Previous
          </button>
          <button 
            className="ppt-pause-btn" 
            onClick={isPaused ? resumeClassroom : pauseClassroom}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button className="ppt-nav-btn" onClick={nextPage} disabled={currentPage >= 10}>
            Next →
          </button>
        </div>
      </div>
      
      <div className="ppt-content">
        {currentSlide ? (
          <div className="slide">
            <h2 className="slide-title">{currentSlide.title}</h2>
            <ul className="slide-points">
              {currentSlide.keyPoints.map((point, index) => (
                <li key={index} className="slide-point">
                  {point}
                </li>
              ))}
            </ul>
            <div className="slide-page">Page {currentSlide.pageNumber}</div>
          </div>
        ) : (
          <div className="slide-placeholder">
            <div className="placeholder-icon">📊</div>
            <p>No slide generated yet</p>
            <p className="placeholder-hint">Ask AI to generate slides for this page</p>
          </div>
        )}
      </div>
    </div>
  )
}
