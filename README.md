# NovelAI Proxy

A lightweight proxy and modern web client for the NovelAI image generation API.

## Project Structure

- `client/`: Vue 3 + Vite frontend application.
- `server/`: Express backend proxy server.

## Features

- Support for NovelAI Diffusion V3, V4, and V5 models.
- Text-to-Image and Image-to-Image generation capabilities.
- Local inpainting mask editor with 8x8 block alignment.
- Real-time streaming generation preview (SSE).
- Local history and prompt history caching.
- Account Anlas (balance) tracking.

## Development

### Prerequisites

Ensure you have Node.js and pnpm installed.

### Setup

Install dependencies for all workspaces:

```bash
pnpm install
```

### Running Locally

Start both the frontend and backend development servers concurrently:

```bash
pnpm run dev
```

- The client will be available at `http://localhost:5173`
- The proxy server will run on `http://localhost:3000`

### Building for Production

Build both the client and server for production deployment:

```bash
pnpm run build
```

## Environment Variables

Create a `.env` file in the `server` directory (or specify via environment variables during deployment). The client relies on the server for API routing, so make sure the server URL is correctly referenced if deploying to a different host.
