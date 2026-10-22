# Interview Copilot

Interview Copilot is an Electron desktop app that captures macOS system audio,
transcribes it with Deepgram Nova-3, detects interview-style questions, and can
generate answer suggestions using Groq.

## Configuration

For development, copy `.env.example` to `.env` in the project root and add your
Deepgram and Groq API keys. For a packaged macOS app, put `.env` in the app's Electron
user-data directory (normally `~/Library/Application Support/YourAppName/.env`).
Do not put real keys in source control.

```env
DEEPGRAM_API_KEY=your-deepgram-api-key
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=openai/gpt-oss-120b
```

Groq question classification and answer generation require `GROQ_API_KEY`.
`GROQ_MODEL` is optional; the app defaults to `openai/gpt-oss-120b`. The Groq
key is read only by the Electron main process and is never sent to the renderer
or written to logs. The candidate profile is included as context, but the model
is instructed not to invent personal experience.

## Development

```sh
npm install
npm run dev
```

System audio capture requires macOS Screen Recording permission. The app's
existing Swift streamer converts captured audio to signed 16-bit, mono,
16 kHz PCM before sending it to Deepgram. Deepgram vocabulary keyterms improve
recognition of terms such as ChatGPT, LLM, and RAG, but cannot eliminate
recognition errors caused by audio quality, accents, or overlapping speech.

## Build

```sh
npm run build
```
