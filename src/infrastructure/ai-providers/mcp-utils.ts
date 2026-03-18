import { pluginRegistry } from '../plugins/plugin-registry';
import { MCPTool, MCPServerPlugin } from '../../domain/models/plugin';

export function getAllMCPTools(): MCPTool[] {
  const mcpServers = pluginRegistry.getMCPServers();
  return mcpServers.flatMap(server => server.getTools());
}

export function getMCPServerByToolName(toolName: string): MCPServerPlugin | undefined {
  const mcpServers = pluginRegistry.getMCPServers();
  return mcpServers.find(server => 
    server.getTools().some(tool => tool.name === toolName)
  );
}

export async function executeMCPTool(toolName: string, params: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const server = getMCPServerByToolName(toolName);
  
  if (!server) {
    return {
      success: false,
      error: `No MCP server found for tool: ${toolName}`
    };
  }
  
  try {
    return await server.executeTool(toolName, params);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export function getAvailableToolNames(): string[] {
  const tools = getAllMCPTools();
  return tools.map(tool => tool.name);
}
