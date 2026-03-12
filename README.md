# StudyPal

A study pal program for all - cross-platform desktop app built with Tauri + React + TypeScript.

## Features

- **File View**: Open and read PDF, EPUB, HTML, LaTeX, and text files with built-in viewers
- **Note View**: Rich text note-taking with TipTap editor, tabbed interface
- **AI View**: Chat with AI models (supports multiple providers)
  - Local: llama.cpp, Ollama, vLLM
  - Cloud: OpenAI, Anthropic, Custom endpoints
- **File Browser**: Navigate folders and open files within the app
- **Resizable Panels**: Flexible 3-pane layout
- **System Theme**: Automatically follows system dark/light mode
- **Session Persistence**: Remembers window size, panel layout, and open files

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Desktop**: Tauri 2.x (Rust backend)
- **State Management**: Zustand
- **Editor**: TipTap
- **PDF Rendering**: PDF.js

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
├── domain/           # Business logic & models
│   └── models/       # Note, Topic, File, AI-Context, Plugin
├── application/      # Application layer
│   └── store/       # Zustand stores
├── infrastructure/  # External integrations
│   ├── ai-providers/
│   ├── file-handlers/
│   └── plugins/
└── presentation/    # UI layer
    ├── components/
    └── layouts/
```

## AI Configuration

StudyPal supports multiple AI providers. Configure in the AI view settings:

### Local Providers
- **llama.cpp**: Connect to local llama.cpp server (`http://localhost:8080`)
- **Ollama**: Connect to local Ollama (`http://localhost:11434`)
- **vLLM**: Connect to local vLLM server

### Cloud Providers
- **OpenAI**: Connect to OpenAI API
- **Anthropic**: Connect to Anthropic Claude API
- **Custom**: Connect to any OpenAI-compatible endpoint

### Usage
1. Select a provider in AI view settings
2. Enter endpoint URL and API key
3. Select a model (auto-detected from endpoint)
4. Start chatting!

## Plugins

StudyPal supports plugins for extending functionality:

- **View Plugins**: Custom viewers for file types
- **File Handlers**: Custom file reading/rendering
- **AI Providers**: Custom AI backend integrations

## Roadmap

- [x] Persistence (save notes to markdown files)
- [x] Topic management
- [x] AI context triggers ("this page", "whole file", web search)
- [x] Plugin system for additional file formats
- [x] EPUB, HTML, and LaTeX support
- [ ] Translation plugin (AI-powered document translation)

## License

MIT
