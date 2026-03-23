import { MCPServerPlugin, MCPTool, MCPToolResult, PluginMetadata } from '../../domain/models/plugin';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore, SearchProvider } from '../../application/store/settings-store';

export type SearchType = 'general' | 'latest' | 'examples' | 'quiz_questions' | 'academic';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  isPdf?: boolean;
}

export interface PaperSearchResult extends SearchResult {
  authors?: string[];
  year?: number;
  citations?: number;
}

export class WebSearchMCPServerPlugin implements MCPServerPlugin {
  metadata: PluginMetadata = {
    id: 'mcp-web-search',
    name: 'Web Search MCP Server',
    type: 'mcp-server',
    version: '2.0.0',
    description: 'MCP tools for web search and academic paper discovery - supports Brave, Tavily, Serper, and DuckDuckGo',
    author: 'StudyPal Team',
    configSchema: {
      maxResults: { 
        type: 'number', 
        default: 10,
        min: 1,
        max: 50
      },
      provider: {
        type: 'string',
        default: 'duckduckgo',
        enum: ['brave', 'tavily', 'serper', 'duckduckgo', 'custom']
      },
      apiKey: {
        type: 'string',
        default: '',
        sensitive: true
      },
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
  }

  async destroy(): Promise<void> {
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

  private parseResultsByProvider(results: string, provider: SearchProvider): SearchResult[] {
    try {
      const parsed = JSON.parse(results);
      
      switch (provider) {
        case 'tavily':
          return this.parseTavilyResults(parsed);
        case 'brave':
          return this.parseBraveResults(parsed);
        case 'serper':
          return this.parseSerperResults(parsed);
        case 'duckduckgo':
        default:
          return this.parseDuckDuckGoResults(parsed);
      }
    } catch {
      console.error('[WebSearchMCP] Failed to parse search results');
      return [];
    }
  }

  private parseTavilyResults(parsed: any): SearchResult[] {
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        title: item.title || '',
        url: item.url || item.href || '',
        snippet: item.snippet || item.content || item.description || '',
        publishedDate: item.published_date || item.date || undefined,
        isPdf: item.isPdf || item.url?.includes('.pdf') || false
      }));
    }
    if (parsed.results) {
      return parsed.results.map((item: any) => ({
        title: item.title || '',
        url: item.url || item.href || '',
        snippet: item.snippet || item.content || item.description || '',
        publishedDate: item.published_date || item.date || undefined,
        isPdf: item.isPdf || item.url?.includes('.pdf') || false
      }));
    }
    return [];
  }

  private parseBraveResults(parsed: any): SearchResult[] {
    if (parsed.web && Array.isArray(parsed.web.results)) {
      return parsed.web.results.map((item: any) => ({
        title: item.title || '',
        url: item.url || item.href || '',
        snippet: item.description || item.snippet || '',
        publishedDate: item.age || item.date || undefined,
        isPdf: item.url?.includes('.pdf') || false
      }));
    }
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        title: item.title || '',
        url: item.url || item.href || '',
        snippet: item.description || item.snippet || '',
        publishedDate: item.age || item.date || undefined,
        isPdf: item.url?.includes('.pdf') || false
      }));
    }
    return [];
  }

  private parseSerperResults(parsed: any): SearchResult[] {
    if (parsed.organic && Array.isArray(parsed.organic)) {
      return parsed.organic.map((item: any) => ({
        title: item.title || '',
        url: item.link || item.url || '',
        snippet: item.snippet || item.description || '',
        publishedDate: item.date || undefined,
        isPdf: item.link?.includes('.pdf') || false
      }));
    }
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        title: item.title || '',
        url: item.link || item.url || '',
        snippet: item.snippet || item.description || '',
        publishedDate: item.date || undefined,
        isPdf: item.link?.includes('.pdf') || false
      }));
    }
    return [];
  }

  private parseDuckDuckGoResults(parsed: any): SearchResult[] {
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        title: item.title || '',
        url: item.url || item.href || '',
        snippet: item.snippet || item.body || item.description || '',
        publishedDate: item.date || undefined,
        isPdf: item.url?.includes('.pdf') || false
      }));
    }
    if (parsed.RelatedTopics && Array.isArray(parsed.RelatedTopics)) {
      return parsed.RelatedTopics
        .filter((item: any) => item.URL || item.url)
        .map((item: any) => ({
          title: item.Text || item.text || '',
          url: item.URL || item.url || '',
          snippet: item.Text || item.text || '',
          publishedDate: undefined,
          isPdf: (item.URL || item.url)?.includes('.pdf') || false
        }));
    }
    return [];
  }

  getTools(): MCPTool[] {
    return [
      {
        name: 'web_search',
        description: 'Search the web for information, latest developments, or examples. Supports general and academic searches.',
        parameters: [
          { name: 'query', type: 'string', description: 'The search query', required: true },
          { name: 'max_results', type: 'number', description: 'Maximum number of results to return (1-50)', required: false, default: 10 },
          { name: 'search_type', type: 'string', description: 'Type of search: general, latest, examples, quiz_questions, or academic', required: false, enum: ['general', 'latest', 'examples', 'quiz_questions', 'academic'], default: 'general' },
          { name: 'pdf_only', type: 'boolean', description: 'Filter for PDF documents only (useful for papers)', required: false, default: false },
          { name: 'year_from', type: 'number', description: 'Filter results from this year onwards', required: false },
          { name: 'year_to', type: 'number', description: 'Filter results up to this year', required: false }
        ]
      },
      {
        name: 'search_papers',
        description: 'Search specifically for academic papers and research publications. Great for finding papers on specific topics like "ResNet", "Transformer", "GPT", etc.',
        parameters: [
          { name: 'topic', type: 'string', description: 'The research topic or paper title to search for (e.g., "ResNet", "Attention is All You Need", "BERT")', required: true },
          { name: 'max_results', type: 'number', description: 'Maximum number of papers to return (1-20)', required: false, default: 5 },
          { name: 'year_from', type: 'number', description: 'Filter papers from this year onwards', required: false },
          { name: 'year_to', type: 'number', description: 'Filter papers up to this year', required: false },
          { name: 'include_pdfs', type: 'boolean', description: 'Prioritize papers with PDF links (arxiv, ieee, etc.)', required: false, default: true }
        ]
      },
      {
        name: 'fetch_web_content',
        description: 'Fetch and extract text content from a URL. Useful for reading paper abstracts or article content.',
        parameters: [
          { name: 'url', type: 'string', description: 'The URL to fetch content from', required: true },
          { name: 'max_length', type: 'number', description: 'Maximum content length to return', required: false, default: 50000 }
        ]
      },
      {
        name: 'get_paper_metadata',
        description: 'Extract metadata (title, authors, year, abstract) from a paper URL if available. Works with arxiv.org, paperswithcode.com, and other academic sources.',
        parameters: [
          { name: 'url', type: 'string', description: 'The paper URL to extract metadata from', required: true }
        ]
      }
    ];
  }

  private getSearchConfig(): { provider: SearchProvider; apiKey?: string; maxResults: number } {
    const settings = useSettingsStore.getState().global.webSearch;
    return {
      provider: settings.provider,
      apiKey: settings.apiKey || undefined,
      maxResults: settings.maxResults || this.maxResults
    };
  }

  private enhanceQuery(query: string, searchType: SearchType): string {
    switch (searchType) {
      case 'latest':
        return `${query} 2024 2025 latest developments`;
      case 'examples':
        return `${query} real world examples case studies`;
      case 'quiz_questions':
        return `${query} quiz questions practice problems`;
      case 'academic':
        return `${query} research paper publication`;
      case 'general':
      default:
        return query;
    }
  }

  async executeTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    try {
      const config = this.getSearchConfig();

      switch (toolName) {
        case 'web_search': {
          const query = params.query as string;
          const maxResults = (params.max_results as number) || config.maxResults;
          const searchType = (params.search_type as SearchType) || 'general';
          const pdfOnly = params.pdf_only as boolean || false;
          const yearFrom = params.year_from as number | undefined;
          const yearTo = params.year_to as number | undefined;

          // Enhance query based on search type
          const enhancedQuery = this.enhanceQuery(query, searchType);

          // Call Rust backend for search
          const result = await invoke<string>('search_web', {
            query: enhancedQuery,
            provider: config.provider,
            apiKey: config.apiKey,
            maxResults,
            queryType: searchType,
            yearFrom,
            yearTo,
            pdfOnly
          });

          const searchResults = this.parseResultsByProvider(result, config.provider);

          return {
            success: true,
            data: {
              originalQuery: query,
              searchType,
              results: searchResults.slice(0, maxResults),
              total: searchResults.length,
              provider: config.provider
            }
          };
        }

        case 'search_papers': {
          const topic = params.topic as string;
          const maxResults = (params.max_results as number) || 5;
          const yearFrom = params.year_from as number | undefined;
          const yearTo = params.year_to as number | undefined;
          const includePdfs = params.include_pdfs as boolean ?? true;

          // Enhance query for paper search
          const paperQuery = `${topic} paper research arxiv pdf`;

          const result = await invoke<string>('search_web', {
            query: paperQuery,
            provider: config.provider,
            apiKey: config.apiKey,
            maxResults: Math.min(maxResults * 2, 20), // Get more results then filter
            queryType: 'academic',
            yearFrom,
            yearTo,
            pdfOnly: includePdfs
          });

          const searchResults = this.parseResultsByProvider(result, config.provider);
          
          // Prioritize PDF results
          const papers = searchResults
            .filter(r => !includePdfs || r.isPdf || r.url.includes('arxiv') || r.url.includes('pdf'))
            .slice(0, maxResults);

          return {
            success: true,
            data: {
              topic,
              papers: papers.map(p => ({
                title: p.title,
                url: p.url,
                snippet: p.snippet,
                year: p.publishedDate,
                isPdf: p.isPdf
              })),
              total: papers.length,
              provider: config.provider
            }
          };
        }

        case 'fetch_web_content': {
          const url = params.url as string;
          const maxLength = (params.max_length as number) || 50000;

          const content = await invoke<string>('fetch_web_content', { url });

          return {
            success: true,
            data: {
              url,
              content: content.slice(0, maxLength),
              contentLength: content.length,
              truncated: content.length > maxLength
            }
          };
        }

        case 'get_paper_metadata': {
          const url = params.url as string;
          
          // Try to extract metadata from URL
          let metadata: any = { url };
          
          // ArXiv extraction
          if (url.includes('arxiv.org')) {
            const arxivMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/);
            if (arxivMatch) {
              metadata.source = 'arxiv';
              metadata.id = arxivMatch[1];
            }
          }
          
          // IEEE extraction
          if (url.includes('ieee.org')) {
            metadata.source = 'ieee';
          }
          
          // ACM extraction
          if (url.includes('acm.org')) {
            metadata.source = 'acm';
          }

          // Try to fetch content for metadata extraction
          try {
            const content = await invoke<string>('fetch_web_content', { url });
            // Basic metadata extraction from HTML (simplified)
            const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
            if (titleMatch) {
              metadata.title = titleMatch[1].trim();
            }
          } catch (e) {
            // Ignore fetch errors
          }

          return {
            success: true,
            data: metadata
          };
        }

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      console.error('[WebSearchMCP] Tool execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const webSearchMCPServerPlugin = new WebSearchMCPServerPlugin();
