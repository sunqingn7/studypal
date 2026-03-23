import { MCPServerPlugin, MCPTool, MCPToolResult, PluginMetadata } from '../../domain/models/plugin';
import { Note } from '../../domain/models/note';
import { useNoteStore } from '../../application/store/note-store';

export class NoteMCPServerPlugin implements MCPServerPlugin {
  metadata: PluginMetadata = {
    id: 'mcp-notes',
    name: 'Notes MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'MCP tools for note operations - get, search, create, update, delete notes',
    author: 'StudyPal Team',
    configSchema: {
      requireConfirmationForModify: { type: 'boolean', default: true }
    }
  };

  type: 'mcp-server' = 'mcp-server';
  private requireConfirmationForModify: boolean = true;

  async initialize(config?: Record<string, unknown>): Promise<void> {
    if (config?.requireConfirmationForModify !== undefined) {
      this.requireConfirmationForModify = config.requireConfirmationForModify as boolean;
    }
  }

  async destroy(): Promise<void> {
  }

  getConfig(): Record<string, unknown> {
    return {
      requireConfirmationForModify: this.requireConfirmationForModify
    };
  }

  setConfig(config: Record<string, unknown>): void {
    if (config.requireConfirmationForModify !== undefined) {
      this.requireConfirmationForModify = config.requireConfirmationForModify as boolean;
    }
  }

  getServerName(): string {
    return 'notes-mcp';
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'get_note',
        description: 'Retrieve a specific note by ID',
        parameters: [
          { name: 'note_id', type: 'string', description: 'The ID of the note to retrieve', required: true }
        ]
      },
      {
        name: 'search_notes',
        description: 'Search notes by query string',
        parameters: [
          { name: 'query', type: 'string', description: 'Search query to find in notes', required: true },
          { name: 'topic_id', type: 'string', description: 'Optional topic ID to filter notes', required: false },
          { name: 'note_type', type: 'string', description: 'Type of notes to search: note, ai-note, or all', required: false, enum: ['note', 'ai-note', 'all'] }
        ]
      },
      {
        name: 'list_notes',
        description: 'List all notes, optionally filtered by topic',
        parameters: [
          { name: 'topic_id', type: 'string', description: 'Optional topic ID to filter notes', required: false },
          { name: 'note_type', type: 'string', description: 'Type of notes to list: note, ai-note, or all', required: false, enum: ['note', 'ai-note', 'all'], default: 'all' },
          { name: 'limit', type: 'number', description: 'Maximum number of notes to return', required: false, default: 20 }
        ]
      },
      {
        name: 'create_note',
        description: 'Create a new note. Requires user confirmation before execution.',
        parameters: [
          { name: 'title', type: 'string', description: 'Title of the new note', required: true },
          { name: 'content', type: 'string', description: 'Content of the new note', required: true },
          { name: 'topic_id', type: 'string', description: 'Optional topic ID to assign note to', required: false },
          { name: 'note_type', type: 'string', description: 'Type of note: note or ai-note', required: false, enum: ['note', 'ai-note'], default: 'note' }
        ]
      },
      {
        name: 'update_note',
        description: 'Update an existing note. Requires user confirmation before execution.',
        parameters: [
          { name: 'note_id', type: 'string', description: 'ID of the note to update', required: true },
          { name: 'content', type: 'string', description: 'New content for the note', required: true }
        ]
      },
      {
        name: 'delete_note',
        description: 'Delete a note. Requires user confirmation before execution.',
        parameters: [
          { name: 'note_id', type: 'string', description: 'ID of the note to delete', required: true }
        ]
      }
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    const noteStore = useNoteStore.getState();
    
    try {
      switch (toolName) {
        case 'get_note': {
          const noteId = params.note_id as string;
          const note = noteStore.getNote(noteId);
          
          if (!note) {
            return { success: false, error: `Note not found: ${noteId}` };
          }
          
          return {
            success: true,
            data: {
              id: note.id,
              title: note.title,
              content: note.content,
              type: note.type,
              topicId: note.topicId,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt
            }
          };
        }
        
        case 'search_notes': {
          const query = (params.query as string).toLowerCase();
          const topicId = params.topic_id as string | undefined;
          const noteType = (params.note_type as string) || 'all';
          
          let notes: Note[] = [];
          if (topicId) {
            notes = noteStore.getNotesForTopic(topicId);
          } else {
            notes = noteStore.getGlobalNotes() as Note[];
          }
          
          // Filter by type and search query
          const filteredNotes = notes
            .filter(note => {
              if (noteType !== 'all' && note.type !== noteType) return false;
              if (query) {
                return note.title.toLowerCase().includes(query) || 
                       note.content.toLowerCase().includes(query);
              }
              return true;
            })
            .slice(0, 20);
          
          return {
            success: true,
            data: {
              query,
              notes: filteredNotes.map(note => ({
                id: note.id,
                title: note.title,
                content: note.content.slice(0, 200) + (note.content.length > 200 ? '...' : ''),
                type: note.type
              })),
              count: filteredNotes.length
            }
          };
        }
        
        case 'list_notes': {
          const topicId = params.topic_id as string | undefined;
          const noteType = (params.note_type as string) || 'all';
          const limit = (params.limit as number) || 20;
          
          let notes: Note[] = [];
          if (topicId) {
            notes = noteStore.getNotesForTopic(topicId);
          } else {
            notes = noteStore.getGlobalNotes() as Note[];
          }
          
          // Filter by type
          const filteredNotes = notes
            .filter(note => noteType === 'all' || note.type === noteType)
            .slice(0, limit);
          
          return {
            success: true,
            data: {
              notes: filteredNotes.map(note => ({
                id: note.id,
                title: note.title,
                type: note.type,
                topicId: note.topicId,
                updatedAt: note.updatedAt
              })),
              count: filteredNotes.length
            }
          };
        }
        
        case 'create_note': {
          const title = params.title as string;
          const content = params.content as string;
          const topicId = params.topic_id as string | undefined;
          const noteType = (params.note_type as string) as 'note' | 'ai-note' || 'note';
          
          const note = noteStore.createNote(topicId || null, title, noteType);
          noteStore.updateNoteContent(note.id, content);
          noteStore.createTabForNote(note.id, title);
          
          return {
            success: true,
            data: {
              message: `Note created successfully: ${note.id}`,
              noteId: note.id,
              title: note.title
            }
          };
        }
        
        case 'update_note': {
          const noteId = params.note_id as string;
          const content = params.content as string;
          
          const existingNote = noteStore.getNote(noteId);
          if (!existingNote) {
            return { success: false, error: `Note not found: ${noteId}` };
          }
          
          noteStore.updateNoteContent(noteId, content);
          
          return {
            success: true,
            data: {
              message: `Note updated successfully: ${noteId}`,
              noteId
            }
          };
        }
        
        case 'delete_note': {
          const noteId = params.note_id as string;
          
          const existingNote = noteStore.getNote(noteId);
          if (!existingNote) {
            return { success: false, error: `Note not found: ${noteId}` };
          }
          
          noteStore.deleteNote(noteId);
          
          return {
            success: true,
            data: {
              message: `Note deleted successfully: ${noteId}`,
              noteId
            }
          };
        }
        
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const noteMCPServerPlugin = new NoteMCPServerPlugin();
