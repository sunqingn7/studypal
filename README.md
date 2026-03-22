# StudyPal

A cross-platform desktop study companion for reading, note-taking, and AI-assisted learning.

## Overview

StudyPal combines document viewing, rich text note-taking, and AI chat in a flexible three-pane interface. Built with modern web technologies and Rust for performance.

## Features

### 📚 Document Viewer
- **PDF**: Rendering via PDF.js, text selection, text extraction via Rust `pdftotext`
- **EPUB**: Full support via epub.js
- **HTML**: Native browser rendering
- **LaTeX**: Mathematical notation support
- **Markdown/Text**: Native support with syntax highlighting

### ✍️ Note-Taking
- Markdown editor with **Edit/Preview toggle**
- LaTeX math rendering (`$inline$` and `$$block$$`) via **KaTeX**
- NoteIt button — save AI chat messages directly to notes
- Discussion summarization — auto-generate structured summaries from chat
- Document-bound notes (persisted per file)
- Tabbed interface for multiple notes

### 🤖 AI Chat
- **LLM Pool**: Configure multiple AI providers, assign nicknames (e.g. "G", "小g"), mark primary provider
- **Chat Routing**: Auto-route to primary, or explicitly `@mention` a provider by nickname
- **Discuss Mode**: `@everyone` or `@all` — sends your message to all enabled providers simultaneously, responses displayed in a grid layout with dancing dots while streaming
- **Local Providers**: llama.cpp, Ollama, vLLM
- **Cloud Providers**: OpenAI, Anthropic, Google Gemini, OpenRouter, Custom endpoints
- **Context Triggers**:
  - `this page` — current page content
  - `whole file` — entire document
  - `selected text` — highlighted selection
  - `topic notes` — topic-related notes
- **Web Search**: Supports Tavily, DuckDuckGo, Brave, and Serper with clickable results
- **Paper Discovery**: Search academic papers with direct download links
- **Discussion Summarization**: Trigger with "summarize above discussion and make it a note" — auto-generates structured summaries using the LLM Pool

### 🌐 Web Search
- **Providers**: DuckDuckGo (official API), Tavily, Brave, Serper
- **Features**: 
  - Clickable search results that download and open files
  - Academic paper search with PDF download links
  - Paper metadata extraction (arxiv, IEEE, ACM)

### 📋 History & Sessions
- **File History**: Automatically tracks recently opened files (sorted by open time, latest first)
- **Sidebar Tabs**: Switch between EXPLORER (folder view) and HISTORY views
- **New Session**: Create empty session that clears file/notes/chat while preserving window state

### 🎨 Interface
- **Resizable 3-Pane Layout**: Sidebar, document viewer, AI/notes panels
- **Sidebar Tabs**: EXPLORER and HISTORY tabs for file browsing
- **Theme Support**: Dark/light mode following system preferences
- **Session Persistence**: Window size, panel layout, file history, and open files restored on restart

### 🔌 Plugin System
- **View Plugins**: Custom view components
- **File Handlers**: Support for new file formats
- **AI Providers**: Custom AI backend integrations
- **Action Plugins**: User actions and commands
- **MCP Servers**: Model Context Protocol tool support

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite |
| **Desktop** | Tauri 2.x (Rust) |
| **State** | Zustand (with persistence) |
| **Styling** | Tailwind CSS |
| **Editor** | ReactMarkdown + KaTeX (notes), textarea (edit mode) |
| **PDF** | PDF.js (render), pdftotext (extract) |
| **EPUB** | epub.js |
| **Markdown** | react-markdown, remark-math, rehype-katex |

## Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.77+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
src/
├── domain/           # Business models
│   └── models/       # Note, Topic, File, AI-Context, Plugin
├── application/      # Application layer
│   ├── store/       # Zustand stores
│   └── services/    # Session management
├── infrastructure/  # External integrations
│   ├── plugins/     # Plugin system
│   ├── file-handlers/ # File reading/rendering
│   └── web-service.ts # AI service
└── presentation/    # UI layer
    ├── components/  # Reusable components
    ├── layouts/     # Page layouts
    └── views/       # Feature views

src-tauri/
├── src/
│   ├── lib.rs       # Tauri commands (AI, PDF extraction)
│   ├── session.rs   # Session persistence
│   └── database/    # SQLite storage
└── Cargo.toml
```

## Architecture

### Layered Design
```
┌──────────────────┐
│  Presentation    │  React components, layouts
├──────────────────┤
│  Application     │  Zustand stores, services
├──────────────────┤
│  Infrastructure  │  Plugins, file handlers, AI
├──────────────────┤
│  Domain          │  Models, types, constants
└──────────────────┘
```

### Three-Pane Layout
```
┌───────────┬──────────────────┬──────────────┐
│           │                  │ ┌──────────┐ │
│  Sidebar  │   Document       │ │   AI     │ │
│ (Explorer/│   Viewer         │ │   Chat   │ │
│  History) │                  │ └──────────┘ │
│           │                  │              │
│           │                  │ ┌──────────┐ │
│           │                  │ │  Notes   │ │
│           │                  │ └──────────┘ │
└───────────┴──────────────────┴──────────────┘
```

### Data Flow
```
User UI (React)
    │
    ▼
Zustand Stores ←─── Persistence (localStorage)
    │
    ▼
Plugin Registry
    │
    ▼
Tauri Commands ←── Rust Backend (AI, PDF extraction)
```

## AI Configuration

Configure AI providers in the AI view settings via the LLM Pool panel.

### LLM Pool

The LLM Pool lets you configure multiple AI providers and route messages using `@mentions`:

- **Provider nicknames**: Assign short nicknames to each provider (e.g. "G", "小g", "g sen") for quick `@mention` routing
- **Primary provider**: Mark one provider as primary — messages without `@mention` go to the primary
- **Chat routing modes**:
  - **Auto** (no `@mention`) → routes to primary or first available provider
  - **Assigned** (`@nickname`) → routes to the specified provider
  - **Discuss** (`@everyone` / `@all`) → sends to ALL enabled providers simultaneously

### Supported Providers

### Supported Providers

**Local:**
- llama.cpp (`http://localhost:8080`)
- Ollama (`http://localhost:11434`)
- vLLM (`http://localhost:8000/v1`)

**Cloud:**
- OpenAI (`https://api.openai.com/v1`)
- Anthropic (`https://api.anthropic.com/v1`)
- Custom (any OpenAI-compatible endpoint)

### Configuration Options

```typescript
interface AIConfig {
  provider: AIProviderType
  endpoint: string
  model: string
  apiKey?: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  extraHeaders?: Record<string, string>
  extraBody?: Record<string, unknown>
}
```

## Plugin System

### Plugin Types

| Type | Purpose | Interface |
|------|---------|----------|
| `view` | Custom views | `ViewPlugin` |
| `file-handler` | File reading/rendering | `FileHandlerPlugin` |
| `action` | User actions | `ActionPlugin` |
| `ai-provider` | AI backends | `AIProviderPlugin` |
| `mcp-server` | MCP tools | `MCPServerPlugin` |

### Example Plugin

```typescript
const myPlugin: ViewPlugin = {
  metadata: {
    id: 'my-view',
    name: 'My View',
    version: '1.0.0',
    description: 'A custom view',
    author: 'Your Name',
    type: 'view',
  },
  getViewComponent() { return MyViewComponent; },
  canHandle(context) { return !!context.filePath; },
  getViewName() { return 'My View'; },
  initialize() { return Promise.resolve(); },
  destroy() { return Promise.resolve(); },
};
```

## Roadmap

- [x] Document persistence (notes saved per file)
- [x] Topic management
- [x] AI context triggers
- [x] Plugin system
- [x] EPUB, HTML, LaTeX support
- [x] File history tracking
- [x] Sidebar with Explorer/History tabs
- [x] Web search with clickable results
- [x] Academic paper search with PDF download
- [x] PDF text selection
- [x] LLM Pool with @mention routing
- [x] Discuss mode (multi-provider simultaneous chat)
- [x] NoteIt — save AI messages to notes
- [x] Discussion summarization to notes
- [ ] Translation plugin
- [ ] Collaborative notes
- [ ] Cloud sync

## License

MIT
