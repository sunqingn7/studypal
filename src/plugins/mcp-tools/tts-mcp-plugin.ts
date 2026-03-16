import { MCPServerPlugin, PluginMetadata, MCPTool, MCPToolResult } from '../../domain/models/plugin';
import { ttsManager } from '../../infrastructure/tts/tts-manager';

export class TTSMCPServerPlugin implements MCPServerPlugin {
  readonly type = 'mcp-server';
  private _metadata: PluginMetadata;

  constructor() {
    this._metadata = {
      id: 'tts-mcp-server',
      name: 'TTS MCP Server',
      version: '1.0.0',
      description: 'Text-to-speech tools for converting text to audio',
      author: 'StudyPal',
      type: 'mcp-server',
    };
  }

  get metadata(): PluginMetadata {
    return this._metadata;
  }

  async initialize(): Promise<void> {
    console.log('TTS MCP Server initialized');
  }

  async destroy(): Promise<void> {
    console.log('TTS MCP Server destroyed');
  }

  getServerName(): string {
    return 'tts';
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'tts_speak',
        description: 'Convert text to speech and play audio using specified TTS backend',
        parameters: [
          {
            name: 'text',
            type: 'string',
            description: 'The text to convert to speech',
            required: true,
          },
          {
            name: 'backend',
            type: 'string',
            description: 'TTS backend to use (edge, qwen)',
            required: false,
          },
          {
            name: 'voice',
            type: 'string',
            description: 'Voice ID to use for synthesis',
            required: false,
          },
          {
            name: 'speed',
            type: 'number',
            description: 'Playback speed multiplier (0.5-2.0)',
            required: false,
            default: 1,
          },
        ],
      },
      {
        name: 'tts_list_voices',
        description: 'List available voices for a TTS backend',
        parameters: [
          {
            name: 'backend',
            type: 'string',
            description: 'TTS backend to query (edge, qwen)',
            required: false,
          },
        ],
      },
      {
        name: 'tts_list_backends',
        description: 'List available TTS backends',
        parameters: [],
      },
      {
        name: 'tts_stop',
        description: 'Stop currently playing audio',
        parameters: [],
      },
    ];
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      switch (toolName) {
        case 'tts_speak':
          return await this.handleSpeak(params);
        case 'tts_list_voices':
          return await this.handleListVoices(params);
        case 'tts_list_backends':
          return await this.handleListBackends(params);
        case 'tts_stop':
          return await this.handleStop(params);
        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private async handleSpeak(params: Record<string, unknown>): Promise<MCPToolResult> {
    const text = params.text as string;
    const backend = params.backend as string | undefined;
    const voice = params.voice as string | undefined;
    const speed = params.speed as number | undefined;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        success: false,
        error: 'Text parameter is required and must be a non-empty string',
      };
    }

    try {
      await ttsManager.speak(text, {
        backend,
        voice,
        speed: speed || 1,
      });

      return {
        success: true,
        data: {
          message: 'Audio playback started',
          text_length: text.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to speak text',
      };
    }
  }

  private async handleListVoices(params: Record<string, unknown>): Promise<MCPToolResult> {
    const backend = params.backend as string | undefined;

    try {
      const voices = await ttsManager.getAvailableVoices(backend);
      return {
        success: true,
        data: {
          voices: voices.map((v) => ({
            id: v.id,
            name: v.name,
            language: v.language,
            gender: v.gender,
          })),
          count: voices.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list voices',
      };
    }
  }

  private async handleListBackends(_params: Record<string, unknown>): Promise<MCPToolResult> {
    const backends = ttsManager.getAvailableBackends();
    return {
      success: true,
      data: {
        backends: backends.map((name) => ({
          name,
        })),
        count: backends.length,
      },
    };
  }

  private async handleStop(_params: Record<string, unknown>): Promise<MCPToolResult> {
    ttsManager.stopPlayback();
    return {
      success: true,
      data: {
        message: 'Audio playback stopped',
      },
    };
  }
}
