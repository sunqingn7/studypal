import { create } from 'zustand'

export interface Slide {
  id: string
  title: string
  keyPoints: string[]
  content: string
  pageNumber: number
}

export interface QuizQuestion {
  id: string
  question: string
  type: 'multiple_choice' | 'short_answer' | 'essay'
  options?: string[]
  expectedAnswer?: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface QuizResult {
  score: number
  totalQuestions: number
  results: QuestionResult[]
}

export interface QuestionResult {
  questionId: string
  isCorrect: boolean
  userAnswer: string
  correctAnswer?: string
  explanation: string
}

export interface QuizGenerationConfig {
  numQuestions: number
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  scope: 'current_page' | 'entire_document'
  useWebSearch: boolean
  questionTypes: ('multiple_choice' | 'short_answer' | 'essay')[]
}

export interface UserPerformance {
  quizScore: number
  weakTopics: string[]
  strongTopics: string[]
  topicScores: Record<string, number>
  totalQuizzes: number
}

export interface ClassroomState {
  isActive: boolean
  currentPage: number
  totalPages: number
  isPaused: boolean
  currentSection: string
  documentPath: string | null
  documentContent: string

  coveredPages: number[]
  completionPercentage: number
  sessionStartTime: number
  totalDuration: number

  userPerformance: UserPerformance

  isRecording: boolean
  recordingPath: string | null

  pptSlides: Slide[]
  teachingTranscript: string[]
  quizQuestions: QuizQuestion[]
  quizAnswers: Record<string, string>
  quizResult: QuizResult | null
  isQuizActive: boolean
  isEvaluatingQuiz: boolean

  sectionSummaries: Record<number, string>

  ttsSpeaking: boolean
  ttsBackend: 'edge_tts' | 'qwen_tts'
  ttsVoice: string
  ttsSpeed: number

  startClassroom: (documentPath: string, content: string, totalPages: number) => void
  stopClassroom: () => void
  nextPage: () => void
  prevPage: () => void
  pauseClassroom: () => void
  resumeClassroom: () => void
  setCurrentPage: (page: number) => void

  generateSlide: (pageNumber: number, title: string, keyPoints: string[], content: string) => void
  addTranscript: (text: string) => void

  generateQuiz: (config: QuizGenerationConfig) => void
  setQuizQuestions: (questions: QuizQuestion[]) => void
  submitAnswer: (questionId: string, answer: string) => void
  submitQuiz: () => void
  exitQuiz: () => void

  generateSummary: (page: number, summary: string) => void

  startRecording: () => void
  stopRecording: () => void

  setTTSSpeaking: (speaking: boolean) => void
  setTTSConfig: (backend?: 'edge_tts' | 'qwen_tts', voice?: string, speed?: number) => void

  updateUserPerformance: (result: QuizResult) => void
}

export const useClassroomStore = create<ClassroomState>((set, get) => ({
  isActive: false,
  currentPage: 1,
  totalPages: 0,
  isPaused: false,
  currentSection: '',
  documentPath: null,
  documentContent: '',

  coveredPages: [],
  completionPercentage: 0,
  sessionStartTime: 0,
  totalDuration: 0,

  userPerformance: {
    quizScore: 0,
    weakTopics: [],
    strongTopics: [],
    topicScores: {},
    totalQuizzes: 0,
  },

  isRecording: false,
  recordingPath: null,

  pptSlides: [],
  teachingTranscript: [],
  quizQuestions: [],
  quizAnswers: {},
  quizResult: null,
  isQuizActive: false,
  isEvaluatingQuiz: false,

  sectionSummaries: {},

  ttsSpeaking: false,
  ttsBackend: 'edge_tts',
  ttsVoice: 'en-US-AriaNeural',
  ttsSpeed: 1.0,

  startClassroom: (documentPath: string, content: string, totalPages: number) => {
    set({
      isActive: true,
      currentPage: 1,
      totalPages,
      isPaused: false,
      documentPath,
      documentContent: content,
      coveredPages: [],
      completionPercentage: 0,
      sessionStartTime: Date.now(),
      pptSlides: [],
      teachingTranscript: [],
      quizQuestions: [],
      quizAnswers: {},
      quizResult: null,
      isQuizActive: false,
      sectionSummaries: {},
    })
  },

  stopClassroom: () => {
    set({
      isActive: false,
      currentPage: 1,
      totalPages: 0,
      isPaused: false,
      documentPath: null,
      documentContent: '',
      coveredPages: [],
      completionPercentage: 0,
      pptSlides: [],
      teachingTranscript: [],
      quizQuestions: [],
      quizAnswers: {},
      quizResult: null,
      isQuizActive: false,
      sectionSummaries: {},
      isRecording: false,
      recordingPath: null,
    })
  },

  nextPage: () => {
    const { currentPage, totalPages, coveredPages } = get()
    if (currentPage < totalPages) {
      const newCoveredPages = [...coveredPages, currentPage]
      const completion = Math.round((newCoveredPages.length / totalPages) * 100)
      set({
        currentPage: currentPage + 1,
        coveredPages: newCoveredPages,
        completionPercentage: completion,
      })
    }
  },

  prevPage: () => {
    const { currentPage } = get()
    if (currentPage > 1) {
      set({ currentPage: currentPage - 1 })
    }
  },

  pauseClassroom: () => {
    set({ isPaused: true })
  },

  resumeClassroom: () => {
    set({ isPaused: false })
  },

  setCurrentPage: (page: number) => {
    const { totalPages } = get()
    if (page >= 1 && page <= totalPages) {
      set({ currentPage: page })
    }
  },

  generateSlide: (pageNumber: number, title: string, keyPoints: string[], content: string) => {
    const slide: Slide = {
      id: crypto.randomUUID(),
      title,
      keyPoints,
      content,
      pageNumber,
    }
    set((state) => ({
      pptSlides: [...state.pptSlides.filter((s) => s.pageNumber !== pageNumber), slide],
    }))
  },

  addTranscript: (text: string) => {
    set((state) => ({
      teachingTranscript: [...state.teachingTranscript, text],
    }))
  },

  generateQuiz: () => {
    set({ isQuizActive: true, quizQuestions: [], quizAnswers: {}, quizResult: null })
  },

  setQuizQuestions: (questions: QuizQuestion[]) => {
    set((state) => ({
      quizQuestions: [...state.quizQuestions, ...questions],
    }))
  },

  submitAnswer: (questionId: string, answer: string) => {
    set((state) => ({
      quizAnswers: { ...state.quizAnswers, [questionId]: answer },
    }))
  },

  submitQuiz: () => {
    set({ isEvaluatingQuiz: true })
  },

  exitQuiz: () => {
    set({
      isQuizActive: false,
      quizQuestions: [],
      quizAnswers: {},
      quizResult: null,
      isEvaluatingQuiz: false,
    })
  },

  generateSummary: (page: number, summary: string) => {
    set((state) => ({
      sectionSummaries: { ...state.sectionSummaries, [page]: summary },
    }))
  },

  startRecording: () => {
    set({ isRecording: true })
  },

  stopRecording: () => {
    set({ isRecording: false, recordingPath: null })
  },

  setTTSSpeaking: (speaking: boolean) => {
    set({ ttsSpeaking: speaking })
  },

  setTTSConfig: (backend?: 'edge_tts' | 'qwen_tts', voice?: string, speed?: number) => {
    set((state) => ({
      ttsBackend: backend ?? state.ttsBackend,
      ttsVoice: voice ?? state.ttsVoice,
      ttsSpeed: speed ?? state.ttsSpeed,
    }))
  },

  updateUserPerformance: (result: QuizResult) => {
    const { userPerformance } = get()
    const newTopicScores = { ...userPerformance.topicScores }

    result.results.forEach((r) => {
      const topic = r.questionId.split('-')[0]
      newTopicScores[topic] = (newTopicScores[topic] || 0) + (r.isCorrect ? 10 : 0)
    })

    const updatedWeakTopics = Object.entries(newTopicScores)
      .filter(([, score]) => score < 60)
      .map(([topic]) => topic)

    const updatedStrongTopics = Object.entries(newTopicScores)
      .filter(([, score]) => score >= 80)
      .map(([topic]) => topic)

    set({
      userPerformance: {
        quizScore: userPerformance.quizScore + result.score,
        weakTopics: updatedWeakTopics,
        strongTopics: updatedStrongTopics,
        topicScores: newTopicScores,
        totalQuizzes: userPerformance.totalQuizzes + 1,
      },
      quizResult: result,
      isEvaluatingQuiz: false,
    })
  },
}))
