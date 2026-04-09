# PenPal AI — English Writing Coach

A desktop app that helps you improve your English writing through AI-powered conversations. The AI asks you questions, you write answers, and it returns corrections with explanations.

## Features

- **Guided writing practice** — AI asks topic-based questions for you to answer
- **Instant corrections** — every response shows what was wrong, the corrected version, and why
- **Selectable explanation language** — get correction explanations in English, German, Spanish, and more
- **Topic variety** — choose from 10 topic categories or let the AI pick randomly
- **Session history** — resume past conversations or review corrections
- **Streaming responses** — see the AI thinking in real-time

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Desktop:** Electron
- **AI Engine:** [GitHub Copilot SDK](https://github.com/github/copilot-sdk) (`@github/copilot-sdk`)
- **Persistence:** electron-store (local JSON)

## Prerequisites

- Node.js 18+
- A [GitHub Copilot](https://github.com/features/copilot) subscription (or BYOK configuration)
- Authenticated via `copilot` CLI or a `GITHUB_TOKEN` environment variable

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Package as desktop app
npm run package
```

## Project Structure

```
electron/
  main.ts          # Electron main process, IPC handlers, persistence
  preload.ts       # Secure IPC bridge to renderer
  copilot.ts       # Copilot SDK session management
  prompts.ts       # System prompt builder for the writing tutor
src/
  App.tsx          # App shell with screen routing
  components/
    HomeScreen.tsx     # Topic selection and settings
    PracticeScreen.tsx # Writing conversation UI
    CorrectionCard.tsx # Correction display component
    HistoryScreen.tsx  # Session history browser
  shared/
    types.ts       # Shared TypeScript types (IPC contracts)
  index.css        # Global styles (dark theme)
```

## How It Works

1. The app creates a Copilot SDK session with a system prompt that makes the AI act as a writing tutor
2. The AI asks a question about the chosen topic
3. You write your answer in the text box
4. The AI returns a structured JSON response with:
   - Your corrected text
   - Each correction with an explanation (in your chosen language)
   - Encouragement about what you did well
   - A follow-up question to continue the conversation

## License

MIT
