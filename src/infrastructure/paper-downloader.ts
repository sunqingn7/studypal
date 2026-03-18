import { invoke } from '@tauri-apps/api/core';

export interface PaperMetadata {
  url: string;
  title?: string;
  authors?: string[];
  year?: number;
  source: 'arxiv' | 'ieee' | 'acm' | 'paperswithcode' | 'openreview' | 'other';
  pdfUrl?: string;
}

export interface DownloadResult {
  success: boolean;
  path: string;
  metadata: PaperMetadata;
  fileSize?: number;
  error?: string;
}

// Patterns to detect paper URLs
const PAPER_PATTERNS = [
  {
    regex: /arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/,
    source: 'arxiv' as const,
    extractId: (match: RegExpMatchArray) => match[1],
    buildPdfUrl: (id: string) => `https://arxiv.org/pdf/${id}.pdf`
  },
  {
    regex: /openreview\.net\/forum\?id=([\w-]+)/,
    source: 'openreview' as const,
    extractId: (match: RegExpMatchArray) => match[1],
    buildPdfUrl: (id: string) => `https://openreview.net/pdf?id=${id}`
  },
  {
    regex: /paperswithcode\.com\/paper\/([^\/\s]+)/,
    source: 'paperswithcode' as const,
    extractId: (match: RegExpMatchArray) => match[1],
    buildPdfUrl: null // No direct PDF link, need to scrape
  },
  {
    regex: /ieee\.org\/.*\/document\/(\d+)/,
    source: 'ieee' as const,
    extractId: (match: RegExpMatchArray) => match[1],
    buildPdfUrl: null // IEEE requires access
  },
  {
    regex: /acm\.org\/doi\/([\d\.]+\/[^\s]+)/,
    source: 'acm' as const,
    extractId: (match: RegExpMatchArray) => match[1],
    buildPdfUrl: null // ACM requires access
  },
  {
    // Match any URL containing .pdf (more flexible)
    regex: /\/([^\/\s]*\.pdf)/i,
    source: 'other' as const,
    extractId: (match: RegExpMatchArray) => match[1],
    buildPdfUrl: (url: string) => url
  }
];

export function detectPaperUrl(url: string): PaperMetadata | null {
  for (const pattern of PAPER_PATTERNS) {
    const match = url.match(pattern.regex);
    if (match) {
      const id = pattern.extractId(match);
      const pdfUrl = pattern.buildPdfUrl 
        ? (pattern.source === 'other' ? url : pattern.buildPdfUrl(id))
        : undefined;
      return {
        url,
        source: pattern.source,
        pdfUrl
      };
    }
  }
  return null;
}

export function isPaperUrl(url: string): boolean {
  return PAPER_PATTERNS.some(p => p.regex.test(url));
}

export async function downloadPaper(
  url: string,
  saveLocation?: string
): Promise<DownloadResult> {
  try {
    const metadata = detectPaperUrl(url);
    if (!metadata) {
      throw new Error('Not a recognized paper URL');
    }

    // Use Rust backend to download
    const result = await invoke<DownloadResult>('download_and_open_paper', {
      url: metadata.pdfUrl || url,
      saveLocation
    });

    return {
      ...result,
      metadata: {
        ...result.metadata,
        ...metadata
      }
    };
  } catch (error) {
    return {
      success: false,
      path: '',
      metadata: { url, source: 'other' },
      error: error instanceof Error ? error.message : 'Download failed'
    };
  }
}

export function extractPaperTitleFromMarkdown(text: string): string | null {
  // Match patterns like "[📄 Paper Title](URL)"
  const match = text.match(/\[📄\s*([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

export function formatPaperLink(title: string, url: string): string {
  return `[📄 ${title}](${url})`;
}
