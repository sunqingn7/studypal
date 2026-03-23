import { useState } from 'react'
import { useClassroomStore } from '../../../../application/store/classroom-store'
import { classroomMCPServerPlugin } from '../../../../plugins/mcp-tools/classroom-mcp-plugin'
import './PPTPanel.css'

export function PPTPanel() {
  const { pptSlides, currentPage, nextPage, prevPage, isPaused, pauseClassroom, resumeClassroom, documentPath } = useClassroomStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  const currentSlide = pptSlides.find((s) => s.pageNumber === currentPage)

  const handleGenerateSlide = async () => {
    if (!documentPath) {
      setGenerationError('No document loaded')
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      const result = await classroomMCPServerPlugin.executeTool('generate_ppt_slide', {
        page_number: currentPage,
        section_title: `Page ${currentPage}`,
        max_key_points: 5
      })

      if (!result.success) {
        setGenerationError(result.error || 'Failed to generate slide')
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsGenerating(false)
    }
  }

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
            <button
              className="generate-slide-btn"
              onClick={handleGenerateSlide}
              disabled={isGenerating || !documentPath}
            >
              {isGenerating ? '⏳ Generating...' : '🎯 Generate Slide'}
            </button>
            {generationError && (
              <p className="generation-error">{generationError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
