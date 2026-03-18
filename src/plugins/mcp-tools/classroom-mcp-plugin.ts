import { MCPServerPlugin, MCPTool, MCPToolResult, PluginMetadata } from '../../domain/models/plugin';
import { useClassroomStore } from '../../application/store/classroom-store';

export class ClassroomMCPServerPlugin implements MCPServerPlugin {
  metadata: PluginMetadata = {
    id: 'mcp-classroom',
    name: 'Classroom MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'MCP tools for classroom mode - PPT slides, quiz, summary, and classroom control',
    author: 'StudyPal Team',
    configSchema: {
      autoSummary: { type: 'boolean', default: true }
    }
  };

  type: 'mcp-server' = 'mcp-server';
  private autoSummary: boolean = true;

  async initialize(config?: Record<string, unknown>): Promise<void> {
    if (config?.autoSummary !== undefined) {
      this.autoSummary = config.autoSummary as boolean;
    }
    console.log('Classroom MCP plugin initialized');
  }

  async destroy(): Promise<void> {
    console.log('Classroom MCP plugin destroyed');
  }

  getConfig(): Record<string, unknown> {
    return {
      autoSummary: this.autoSummary
    };
  }

  setConfig(config: Record<string, unknown>): void {
    if (config.autoSummary !== undefined) {
      this.autoSummary = config.autoSummary as boolean;
    }
  }

  getServerName(): string {
    return 'classroom-mcp';
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'generate_ppt_slide',
        description: 'Generate a presentation slide with key points for the current page',
        parameters: [
          { name: 'page_number', type: 'number', description: 'The page number to generate slide for', required: true },
          { name: 'section_title', type: 'string', description: 'Title for this slide/section', required: true },
          { name: 'max_key_points', type: 'number', description: 'Maximum number of key points to include', required: false, default: 5 }
        ]
      },
        {
          name: 'generate_quiz',
          description: 'Generate quiz questions from document content or web search',
          parameters: [
            { name: 'num_questions', type: 'number', description: 'Number of questions to generate', required: true },
            { name: 'difficulty', type: 'string', description: 'Difficulty level of questions', required: true, enum: ['easy', 'medium', 'hard', 'mixed'] },
            { name: 'scope', type: 'string', description: 'Scope of questions - current page or entire document', required: true, enum: ['current_page', 'entire_document'] },
            { name: 'question_types', type: 'array', description: 'Types of questions to include (multiple_choice, short_answer, essay)', required: false },
            { name: 'use_web_search', type: 'boolean', description: 'Use web search for additional questions', required: false, default: true },
            { name: 'web_search_topics', type: 'array', description: 'Topics to search for additional questions', required: false }
          ]
        },
      {
        name: 'evaluate_quiz',
        description: 'Evaluate quiz answers and provide feedback',
        parameters: [
          { name: 'quiz_id', type: 'string', description: 'ID of the quiz to evaluate', required: true },
          { name: 'answers', type: 'array', description: 'User answers to evaluate', required: true }
        ]
      },
      {
        name: 'classroom_control',
        description: 'Control classroom mode - navigate pages, pause/resume',
        parameters: [
          { name: 'action', type: 'string', description: 'Action to perform', required: true, enum: ['next_page', 'prev_page', 'pause', 'resume', 'get_status'] }
        ]
      },
      {
        name: 'generate_summary',
        description: 'Generate a concise summary of document section or lecture',
        parameters: [
          { name: 'scope', type: 'string', description: 'Scope of summary', required: true, enum: ['current_page', 'section', 'entire_document'] },
          { name: 'summary_type', type: 'string', description: 'Type of summary', required: false, enum: ['brief', 'detailed', 'key_points'], default: 'key_points' },
          { name: 'max_length', type: 'number', description: 'Maximum length in characters', required: false, default: 500 }
        ]
      },
      {
        name: 'generate_examples',
        description: 'Generate real-world examples or code snippets for concepts',
        parameters: [
          { name: 'concept', type: 'string', description: 'The concept to generate examples for', required: true },
          { name: 'example_type', type: 'string', description: 'Type of examples', required: true, enum: ['real_world', 'code', 'math', 'analogy'] },
          { name: 'num_examples', type: 'number', description: 'Number of examples to generate', required: false, default: 3 }
        ]
      },
      {
        name: 'generate_discussion_prompts',
        description: 'Generate open-ended discussion questions for critical thinking',
        parameters: [
          { name: 'topic', type: 'string', description: 'The topic for discussion', required: true },
          { name: 'num_prompts', type: 'number', description: 'Number of prompts to generate', required: false, default: 3 },
          { name: 'depth', type: 'string', description: 'Depth of discussion', required: false, enum: ['basic', 'intermediate', 'advanced'], default: 'intermediate' }
        ]
      },
      {
        name: 'generate_flashcards',
        description: 'Generate flashcards from lecture content for review',
        parameters: [
          { name: 'scope', type: 'string', description: 'Scope of content for flashcards', required: true, enum: ['current_page', 'entire_document'] },
          { name: 'num_cards', type: 'number', description: 'Number of flashcards to generate', required: false, default: 10 },
          { name: 'format', type: 'string', description: 'Format of flashcards', required: false, enum: ['question_answer', 'term_definition'], default: 'question_answer' }
        ]
      },
      {
        name: 'start_classroom',
        description: 'Start classroom mode with a document',
        parameters: [
          { name: 'document_path', type: 'string', description: 'Path to the document', required: true },
          { name: 'total_pages', type: 'number', description: 'Total number of pages in document', required: true }
        ]
      },
      {
        name: 'stop_classroom',
        description: 'Exit classroom mode',
        parameters: []
      }
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    console.log(`[Classroom MCP] Executing tool: ${toolName}`, params);

    const store = useClassroomStore.getState();

    try {
      switch (toolName) {
        case 'start_classroom': {
          const documentPath = params.document_path as string;
          const totalPages = params.total_pages as number;
          store.startClassroom(documentPath, '', totalPages);
          return {
            success: true,
            data: {
              message: 'Classroom mode started',
              documentPath,
              totalPages
            }
          };
        }

        case 'stop_classroom': {
          store.stopClassroom();
          return {
            success: true,
            data: {
              message: 'Classroom mode stopped'
            }
          };
        }

        case 'generate_ppt_slide': {
          const pageNumber = params.page_number as number;
          const sectionTitle = params.section_title as string;
          const maxKeyPoints = (params.max_key_points as number) || 5;
          
          return {
            success: true,
            data: {
              pageNumber,
              sectionTitle,
              maxKeyPoints,
              message: 'Slide generation requested. AI will generate content.'
            }
          };
        }

        case 'classroom_control': {
          const action = params.action as string;
          
          switch (action) {
            case 'next_page':
              store.nextPage();
              break;
            case 'prev_page':
              store.prevPage();
              break;
            case 'pause':
              store.pauseClassroom();
              break;
            case 'resume':
              store.resumeClassroom();
              break;
            case 'get_status':
              return {
                success: true,
                data: {
                  isActive: store.isActive,
                  currentPage: store.currentPage,
                  totalPages: store.totalPages,
                  isPaused: store.isPaused,
                  completionPercentage: store.completionPercentage
                }
              };
          }
          
          return {
            success: true,
            data: {
              action,
              message: `Action ${action} executed`,
              currentPage: store.currentPage
            }
          };
        }

        case 'generate_summary': {
          const scope = params.scope as string;
          const summaryType = (params.summary_type as string) || 'key_points';
          const maxLength = (params.max_length as number) || 500;
          
          return {
            success: true,
            data: {
              scope,
              summaryType,
              maxLength,
              message: 'Summary generation requested. AI will generate content.'
            }
          };
        }

        case 'generate_quiz': {
          const numQuestions = params.num_questions as number;
          const difficulty = params.difficulty as 'easy' | 'medium' | 'hard' | 'mixed';
          const scope = params.scope as 'current_page' | 'entire_document';
          
          store.generateQuiz({
            numQuestions,
            difficulty,
            scope,
            useWebSearch: (params.use_web_search as boolean) ?? true,
            questionTypes: ((params.question_types as string[]) || ['multiple_choice']) as ('multiple_choice' | 'short_answer' | 'essay')[]
          });
          
          return {
            success: true,
            data: {
              numQuestions,
              difficulty,
              scope,
              message: 'Quiz generation requested. AI will generate questions.'
            }
          };
        }

        case 'generate_examples': {
          const concept = params.concept as string;
          const exampleType = params.example_type as string;
          const numExamples = (params.num_examples as number) || 3;
          
          return {
            success: true,
            data: {
              concept,
              exampleType,
              numExamples,
              message: 'Examples generation requested. AI will generate content.'
            }
          };
        }

        case 'generate_discussion_prompts': {
          const topic = params.topic as string;
          const numPrompts = (params.num_prompts as number) || 3;
          const depth = (params.depth as string) || 'intermediate';
          
          return {
            success: true,
            data: {
              topic,
              numPrompts,
              depth,
              message: 'Discussion prompts generation requested. AI will generate content.'
            }
          };
        }

        case 'generate_flashcards': {
          const scope = params.scope as string;
          const numCards = (params.num_cards as number) || 10;
          const format = (params.format as string) || 'question_answer';
          
          return {
            success: true,
            data: {
              scope,
              numCards,
              format,
              message: 'Flashcards generation requested. AI will generate content.'
            }
          };
        }

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const classroomMCPServerPlugin = new ClassroomMCPServerPlugin();
