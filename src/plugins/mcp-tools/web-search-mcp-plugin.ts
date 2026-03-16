import { MCPServerPlugin, MCPTool, MCPToolResult, PluginMetadata } from '../../domain/models/plugin';
import { invoke } from '@tauri-apps/api/core';

export type SearchType = 'general' | 'latest' | 'examples' | 'quiz_questions';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export class WebSearchMCPServerPlugin implements MCPServerPlugin {
  metadata: PluginMetadata = {
    id: 'mcp-web-search',
    name: 'Web Search MCP Server',
    type: 'mcp-server',
    version: '1.0.0',
    description: 'MCP tools for web search and content fetching - search the web, get latest developments, find examples',
    author: 'StudyPal Team',
    configSchema: {
      maxResults: { type: 'number', default: 10 },
      autoTrigger: { 
        type: 'object', 
        default: {
          timeSensitiveTopics: true,
          quizGeneration: true,
          realWorldExamples: true,
          factVerification: true
        }
      }
    }
  };

  type: 'mcp-server' = 'mcp-server';
  private maxResults: number = 10;

  async initialize(config?: Record<string, unknown>): Promise<void> {
    if (config?.maxResults !== undefined) {
      this.maxResults = config.maxResults as number;
    }
    console.log('Web Search MCP plugin initialized');
  }

  async destroy(): Promise<void> {
    console.log('Web Search MCP plugin destroyed');
  }

  getConfig(): Record<string, unknown> {
    return {
      maxResults: this.maxResults
    };
  }

  setConfig(config: Record<string, unknown>): void {
    if (config.maxResults !== undefined) {
      this.maxResults = config.maxResults as number;
    }
  }

  getServerName(): string {
    return 'web-search-mcp';
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'web_search',
        description: 'Search the web for information, latest developments, or examples',
        parameters: [
          { name: 'query', type: 'string', description: 'The search query', required: true },
          { name: 'max_results', type: 'number', description: 'Maximum number of results to return', required: false, default: 5 },
          { name: 'search_type', type: 'string', description: 'Type of search: general, latest, examples, or quiz_questions', required: false, enum: ['general', 'latest', 'examples', 'quiz_questions'], default: 'general' }
        ]
      },
      {
        name: 'fetch_web_content',
        description: 'Fetch content from a URL',
        parameters: [
          { name: 'url', type: 'string', description: 'The URL to fetch content from', required: true }
        ]
      }
    ];
  }

  private enhanceQuery(query: string, searchType: SearchType): string {
    switch (searchType) {
      case 'latest':
        return `${query} 2024 2025 latest developments`;
      case 'examples':
        return `${query} real world examples case studies`;
      case 'quiz_questions':
        return `${query} quiz questions practice problems`;
      case 'general':
      default:
        return query;
    }
  }

  private processResults(results: string, _searchType: SearchType): SearchResult[] {
    try {
      const parsed = JSON.parse(results);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          title: item.title || '',
          url: item.url || item.href || '',
          snippet: item.body || item.snippet || '',
          publishedDate: item.date || item.publishedDate
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'web_search': {
          const query = params.query as string;
          const maxResults = (params.max_results as number) || this.maxResults;
          const searchType = (params.search_type as SearchType) || 'general';
          
          // Enhance query based on search type
          const enhancedQuery = this.enhanceQuery(query, searchType);
          
          // Call Rust backend for search
          const result = await invoke<string>('search_web', { 
            query: enhancedQuery
          });
          
          const searchResults = this.processResults(result, searchType);
          
          return {
            success: true,
            data: {
              originalQuery: query,
              searchType,
              results: searchResults.slice(0, maxResults),
              total: searchResults.length
            }
          };
        }
        
        case 'fetch_web_content': {
          const url = params.url as string;
          
          // Call Rust backend for content fetching
          const content = await invoke<string>('fetch_web_content', { url });
          
          return {
            success: true,
            data: {
              url,
              content: content.slice(0, 50000), // Limit content size
              contentLength: content.length
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

export const webSearchMCPServerPlugin = new WebSearchMCPServerPlugin();
