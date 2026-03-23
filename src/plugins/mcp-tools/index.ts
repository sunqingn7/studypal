import { MCPServerPlugin, MCPTool, MCPToolResult, PluginMetadata } from '../../domain/models/plugin';
import { invoke } from '@tauri-apps/api/core';

export class MCPToolsPlugin implements MCPServerPlugin {
  metadata: PluginMetadata = {
    id: 'mcp-tools',
    name: 'MCP Tools Plugin',
    version: '1.0.0',
    description: 'Provides AI tool calling capabilities including web search',
    author: 'StudyPal',
    type: 'mcp-server',
  };

  type: 'mcp-server' = 'mcp-server';

  async initialize(): Promise<void> {
  }

  async destroy(): Promise<void> {
  }

  getServerName(): string {
    return 'StudyPal MCP Server';
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'web_search',
        description: 'Search the web for information on a given query',
        parameters: [
          {
            name: 'query',
            type: 'string',
            description: 'The search query to look up on the web',
            required: true,
          },
          {
            name: 'max_results',
            type: 'number',
            description: 'Maximum number of results to return (default: 5)',
            required: false,
          },
        ],
      },
      {
        name: 'fetch_web_content',
        description: 'Fetch the content of a specific webpage URL',
        parameters: [
          {
            name: 'url',
            type: 'string',
            description: 'The URL of the webpage to fetch',
            required: true,
          },
        ],
      },
      {
        name: 'read_file',
        description: 'Read the content of a file at the specified path',
        parameters: [
          {
            name: 'file_path',
            type: 'string',
            description: 'The path to the file to read',
            required: true,
          },
        ],
      },
      {
        name: 'list_directory',
        description: 'List the contents of a directory',
        parameters: [
          {
            name: 'path',
            type: 'string',
            description: 'The directory path to list',
            required: true,
          },
        ],
      },
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'web_search': {
          const query = params.query as string;
          const maxResults = (params.max_results as number) || 5;
          
          const result = await invoke<string>('search_web', { query });
          const searchResults = JSON.parse(result);
          
          return {
            success: true,
            data: {
              query,
              results: searchResults.slice(0, maxResults),
              total: searchResults.length,
            },
          };
        }
        
        case 'fetch_web_content': {
          const url = params.url as string;
          const content = await invoke<string>('fetch_web_content', { url });
          
          return {
            success: true,
            data: {
              url,
              content: content.slice(0, 50000), // Limit content size
              contentLength: content.length,
            },
          };
        }
        
        case 'read_file': {
          const filePath = params.file_path as string;
          // This would use the existing file reading logic
          return {
            success: true,
            data: {
              filePath,
              message: 'File reading would be implemented here',
            },
          };
        }
        
        case 'list_directory': {
          const path = params.path as string;
          const items = await invoke('list_directory', { path });
          
          return {
            success: true,
            data: {
              path,
              items,
            },
          };
        }
        
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const mcpToolsPlugin = new MCPToolsPlugin();
