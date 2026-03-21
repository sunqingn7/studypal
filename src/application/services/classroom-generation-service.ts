import { TaskDistributor } from './task-distributor';
import { useClassroomStore } from '../store/classroom-store';
import { getCurrentPageText } from '../../infrastructure/file-handlers/pdf-utils';
import { FileReadingService } from '../../infrastructure/file-handlers/file-reading-service';

export interface SlideContent {
  title: string;
  keyPoints: string[];
  content: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'multiple_choice' | 'short_answer' | 'essay';
  options?: string[];
  expectedAnswer?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface QuizEvaluation {
  score: number;
  totalQuestions: number;
  results: {
    questionId: string;
    isCorrect: boolean;
    userAnswer: string;
    correctAnswer?: string;
    explanation: string;
  }[];
}

// Singleton task distributor
let taskDistributor: TaskDistributor | null = null;

function getTaskDistributor(): TaskDistributor {
  if (!taskDistributor) {
    taskDistributor = new TaskDistributor();
  }
  return taskDistributor;
}

// Generate slide content using LLM pool
export async function generateSlideContent(
  pageNumber: number,
  sectionTitle: string,
  maxKeyPoints: number
): Promise<SlideContent> {
  const classroomStore = useClassroomStore.getState();
  const documentContent = classroomStore.documentContent;
  const documentPath = classroomStore.documentPath;

  // Get page content
  let pageContent = '';
  try {
    if (documentPath?.endsWith('.pdf')) {
      pageContent = await getCurrentPageText(documentPath, pageNumber);
    } else if (documentPath) {
      const content = await FileReadingService.readTextFile(documentPath);
      // Try to extract page content (naive implementation)
      const pages = content.split(/\n\n+/).filter((p: string) => p.trim());
      pageContent = pages[pageNumber - 1] || content.slice(0, 2000);
    }
  } catch (e) {
    console.warn('Failed to get page content:', e);
    pageContent = documentContent.slice(0, 2000);
  }

  const prompt = `Generate a presentation slide for page ${pageNumber} with the title "${sectionTitle}".

Document content:
${pageContent.slice(0, 3000)}

Please provide:
1. Key points (maximum ${maxKeyPoints})
2. A concise summary suitable for teaching

Respond in this exact format:
KEY_POINTS:
- [point 1]
- [point 2]
...

CONTENT:
[summary]`;

  const distributor = getTaskDistributor();
  const result = await distributor.submitTask(
    'generate_slide',
    prompt,
    pageContent.slice(0, 3000),
    {
      maxTokens: 800,
      temperature: 0.3,
      priority: 70,
    }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to generate slide');
  }

  // Parse the response
  const content = result.content;
  const keyPointsMatch = content.match(/KEY_POINTS:\n((?:- .+\n?)+)/i);
  const contentMatch = content.match(/CONTENT:\n(.+)/is);

  const keyPoints = keyPointsMatch
    ? keyPointsMatch[1].split('\n').filter((line) => line.startsWith('-')).map((line) => line.slice(2).trim())
    : ['No key points generated'];

  return {
    title: sectionTitle,
    keyPoints: keyPoints.slice(0, maxKeyPoints),
    content: contentMatch ? contentMatch[1].trim() : content.slice(0, 500),
  };
}

// Generate quiz questions using LLM pool
export async function generateQuizQuestions(
  numQuestions: number,
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed',
  scope: 'current_page' | 'entire_document',
  questionTypes: ('multiple_choice' | 'short_answer' | 'essay')[]
): Promise<QuizQuestion[]> {
  const classroomStore = useClassroomStore.getState();
  const documentContent = classroomStore.documentContent;
  const currentPage = classroomStore.currentPage;
  const documentPath = classroomStore.documentPath;

  // Get content based on scope
  let content = '';
  try {
    if (scope === 'current_page' && documentPath) {
      if (documentPath.endsWith('.pdf')) {
        content = await getCurrentPageText(documentPath, currentPage);
      } else {
        const fullContent = await FileReadingService.readTextFile(documentPath);
        const pages = fullContent.split(/\n\n+/).filter((p: string) => p.trim());
        content = pages[currentPage - 1] || fullContent;
      }
    } else {
      content = documentContent;
    }
  } catch (e) {
    content = documentContent;
  }

  const typeInstructions: Record<string, string> = {
    multiple_choice: 'Include 4 options (A, B, C, D) with one correct answer marked as [CORRECT]',
    short_answer: 'Provide a brief expected answer of 1-3 sentences',
    essay: 'No expected answer needed',
  };

  const typesStr = questionTypes.map((t) => typeInstructions[t] || t).join('; ');

  const prompt = `Generate ${numQuestions} ${difficulty} difficulty quiz questions based on the following content.

Content:
${content.slice(0, 5000)}

Question types to include: ${questionTypes.join(', ')}

For each question:
${typesStr}

Respond in this exact format for each question:

Q1: [question text]
TYPE: ${questionTypes[0] || 'multiple_choice'}
DIFFICULTY: ${difficulty}
OPTIONS: A) [option1] B) [option2] C) [option3] D) [option4] [CORRECT]
ANSWER: [correct answer or explanation]

Q2: ...
(and so on)`;

  const distributor = getTaskDistributor();
  const result = await distributor.submitTask(
    'generate_quiz',
    prompt,
    content.slice(0, 5000),
    {
      maxTokens: 1500,
      temperature: 0.4,
      priority: 80,
    }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to generate quiz');
  }

  // Parse the response
  return parseQuizResponse(result.content, questionTypes);
}

function parseQuizResponse(content: string, allowedTypes: string[]): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  const questionBlocks = content.split(/Q\d+:\s*/).filter((block) => block.trim());

  for (const block of questionBlocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l);
    if (lines.length < 2) continue;

    const questionText = lines[0];
    const typeMatch = block.match(/TYPE:\s*(\w+)/i);
    const difficultyMatch = block.match(/DIFFICULTY:\s*(\w+)/i);
    const optionsMatch = block.match(/OPTIONS:\s*([^\n]+)/i);
    const answerMatch = block.match(/ANSWER:\s*([^\n]+)/i);

    const type = (typeMatch?.[1].toLowerCase() || 'multiple_choice') as QuizQuestion['type'];
    if (!allowedTypes.includes(type)) continue;

    const difficulty = (difficultyMatch?.[1].toLowerCase() || 'medium') as QuizQuestion['difficulty'];

    let options: string[] | undefined;
    if (type === 'multiple_choice' && optionsMatch) {
      const optsText = optionsMatch[1];
      const opts = optsText.split(/[A-D]\)\s*/).filter((o) => o.trim());
      options = opts.map((o) => o.trim().replace(/\s*\[CORRECT\]\s*/i, ''));
    }

    questions.push({
      id: crypto.randomUUID(),
      question: questionText,
      type,
      difficulty,
      options,
      expectedAnswer: answerMatch?.[1].trim(),
    });
  }

  return questions;
}

// Generate summary using LLM pool
export async function generateSummary(
  scope: 'current_page' | 'section' | 'entire_document',
  summaryType: 'brief' | 'detailed' | 'key_points',
  maxLength: number
): Promise<string> {
  const classroomStore = useClassroomStore.getState();
  const documentContent = classroomStore.documentContent;
  const currentPage = classroomStore.currentPage;
  const documentPath = classroomStore.documentPath;

  let content = '';
  try {
    if (scope === 'current_page' && documentPath) {
      if (documentPath.endsWith('.pdf')) {
        content = await getCurrentPageText(documentPath, currentPage);
      } else {
        const fullContent = await FileReadingService.readTextFile(documentPath);
        const pages = fullContent.split(/\n\n+/).filter((p: string) => p.trim());
        content = pages[currentPage - 1] || fullContent;
      }
    } else if (scope === 'entire_document') {
      content = documentContent;
    } else {
      // Section - use current page and surrounding pages
      content = documentContent;
    }
  } catch (e) {
    content = documentContent;
  }

  const typeDescriptions: Record<string, string> = {
    brief: 'a brief overview in 2-3 sentences',
    detailed: 'a detailed summary covering main concepts',
    key_points: 'bullet points of key concepts',
  };

  const prompt = `Create ${typeDescriptions[summaryType]} from the following content. Maximum ${maxLength} characters.

Content:
${content.slice(0, 6000)}

Respond with only the summary, no additional text.`;

  const distributor = getTaskDistributor();
  const result = await distributor.submitTask(
    'generate_summary',
    prompt,
    content.slice(0, 6000),
    {
      maxTokens: Math.min(maxLength / 3, 800),
      temperature: 0.3,
      priority: 60,
    }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to generate summary');
  }

  return result.content.slice(0, maxLength);
}

// Generate examples using LLM pool
export async function generateExamples(
  concept: string,
  exampleType: 'real_world' | 'code' | 'math' | 'analogy',
  numExamples: number
): Promise<string[]> {
  const classroomStore = useClassroomStore.getState();
  const documentContent = classroomStore.documentContent;

  const typePrompts: Record<string, string> = {
    real_world: 'real-world applications and scenarios',
    code: 'code examples with explanations',
    math: 'mathematical examples and derivations',
    analogy: 'analogies and comparisons to everyday concepts',
  };

  const prompt = `Generate ${numExamples} ${typePrompts[exampleType]} for the concept: "${concept}"

Context from document:
${documentContent.slice(0, 3000)}

Respond with each example separated by "---EXAMPLE---" on its own line.`;

  const distributor = getTaskDistributor();
  const result = await distributor.submitTask(
    'generate_examples',
    prompt,
    documentContent.slice(0, 3000),
    {
      maxTokens: 1000,
      temperature: 0.4,
      priority: 65,
    }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to generate examples');
  }

  return result.content
    .split('---EXAMPLE---')
    .map((ex) => ex.trim())
    .filter((ex) => ex.length > 0);
}

// Generate discussion prompts using LLM pool
export async function generateDiscussionPrompts(
  topic: string,
  numPrompts: number,
  depth: 'basic' | 'intermediate' | 'advanced'
): Promise<string[]> {
  const classroomStore = useClassroomStore.getState();
  const documentContent = classroomStore.documentContent;

  const depthDescriptions: Record<string, string> = {
    basic: 'accessible questions for beginners',
    intermediate: 'questions that require some analysis',
    advanced: 'challenging questions requiring critical thinking and synthesis',
  };

  const prompt = `Generate ${numPrompts} open-ended discussion questions about "${topic}" at ${depth} level.

These should be ${depthDescriptions[depth]}.

Context from document:
${documentContent.slice(0, 3000)}

Respond with each question on a new line, numbered.`;

  const distributor = getTaskDistributor();
  const result = await distributor.submitTask(
    'generate_discussion',
    prompt,
    documentContent.slice(0, 3000),
    {
      maxTokens: 800,
      temperature: 0.5,
      priority: 55,
    }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to generate discussion prompts');
  }

  return result.content
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line) => line.length > 0 && line.includes('?'));
}

// Generate flashcards using LLM pool
export async function generateFlashcards(
  scope: 'current_page' | 'entire_document',
  numCards: number,
  format: 'question_answer' | 'term_definition'
): Promise<{ front: string; back: string }[]> {
  const classroomStore = useClassroomStore.getState();
  const documentContent = classroomStore.documentContent;
  const currentPage = classroomStore.currentPage;
  const documentPath = classroomStore.documentPath;

  let content = '';
  try {
    if (scope === 'current_page' && documentPath) {
      if (documentPath.endsWith('.pdf')) {
        content = await getCurrentPageText(documentPath, currentPage);
      } else {
        const fullContent = await FileReadingService.readTextFile(documentPath);
        const pages = fullContent.split(/\n\n+/).filter((p: string) => p.trim());
        content = pages[currentPage - 1] || fullContent;
      }
    } else {
      content = documentContent;
    }
  } catch (e) {
    content = documentContent;
  }

  const formatInstructions: Record<string, string> = {
    question_answer: 'Front: Question, Back: Answer',
    term_definition: 'Front: Term, Back: Definition',
  };

  const prompt = `Generate ${numCards} flashcards from the following content.

Format: ${formatInstructions[format]}

Content:
${content.slice(0, 4000)}

Respond in this format for each card:
CARD 1
FRONT: [front content]
BACK: [back content]

CARD 2
...`;

  const distributor = getTaskDistributor();
  const result = await distributor.submitTask(
    'generate_flashcards',
    prompt,
    content.slice(0, 4000),
    {
      maxTokens: 1200,
      temperature: 0.3,
      priority: 60,
    }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to generate flashcards');
  }

  // Parse flashcards
  const cards: { front: string; back: string }[] = [];
  const cardBlocks = result.content.split(/CARD\s*\d+/i).filter((b) => b.trim());

  for (const block of cardBlocks) {
    const frontMatch = block.match(/FRONT:\s*([^\n]+(?:\n(?!BACK:).+)*)/i);
    const backMatch = block.match(/BACK:\s*([^\n]+(?:\n(?!CARD).+)*)/is);

    if (frontMatch && backMatch) {
      cards.push({
        front: frontMatch[1].trim(),
        back: backMatch[1].trim(),
      });
    }
  }

  return cards;
}

// Evaluate quiz answers using LLM pool
export async function evaluateQuiz(
  questions: QuizQuestion[],
  answers: Record<string, string>
): Promise<QuizEvaluation> {
  const prompt = `Evaluate the following quiz answers and provide detailed feedback.

Questions and User Answers:
${questions.map((q, i) => {
  const answer = answers[q.id] || 'No answer provided';
  return `Q${i + 1}: ${q.question}
Type: ${q.type}
Expected: ${q.expectedAnswer || 'See rubric'}
User Answer: ${answer}`;
}).join('\n\n')}

For each question, determine if correct and explain why. Provide a score (0-100) and overall feedback.

Respond in this format:
SCORE: [total score]
TOTAL: [number of questions]

Q1: [correct/incorrect]
EXPLANATION: [why]

Q2: ...`;

  const distributor = getTaskDistributor();
  const result = await distributor.submitTask(
    'evaluate_quiz',
    prompt,
    '',
    {
      maxTokens: 1500,
      temperature: 0.2,
      priority: 90,
    }
  );

  if (!result.success) {
    throw new Error(result.error || 'Failed to evaluate quiz');
  }

  // Parse evaluation
  const scoreMatch = result.content.match(/SCORE:\s*(\d+)/i);
  const totalMatch = result.content.match(/TOTAL:\s*(\d+)/i);

  const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
  const totalQuestions = totalMatch ? parseInt(totalMatch[1]) : questions.length;

  const results = questions.map((q) => {
    const qMatch = result.content.match(new RegExp(`Q\\d+.*${q.id.substring(0, 8)}.*correct|incorrect`, 'i'));
    const isCorrect = qMatch ? qMatch[0].toLowerCase().includes('correct') && !qMatch[0].toLowerCase().includes('incorrect') : false;
    const explanationMatch = result.content.match(new RegExp(`Q\\d+.*${q.id.substring(0, 8)}[\\s\\S]*?EXPLANATION:\\s*([^\\n]+)`, 'i'));

    return {
      questionId: q.id,
      isCorrect,
      userAnswer: answers[q.id] || '',
      correctAnswer: q.expectedAnswer,
      explanation: explanationMatch?.[1] || 'No explanation provided',
    };
  });

  return {
    score,
    totalQuestions,
    results,
  };
}
