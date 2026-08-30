# Jarvis

Jarvis is a self-hosted web frontend for local AI chat. It talks to [Ollama](https://ollama.com) over HTTP, streams responses, and keeps conversation history on the browser.

The long-term goal is a homelab orchestration layer. This first version is deliberately smaller: select a model, chat, stream, continue the conversation.

## Architecture

```text
Browser (LAN)
    ↓
Jarvis UI  →  Jarvis API  →  AI provider  →  Ollama HTTP API
```

The UI never calls Ollama directly. Ollama is treated as an external inference service, configured with `OLLAMA_BASE_URL`. On the first Ubuntu VM that can be `http://localhost:11434`. Later it can point at another machine without changing application code.

Do not expose Ollama's port to the internet. Other devices on the LAN should use Jarvis (port 3000), not Ollama (port 11434).

## Requirements

- Ubuntu Server or Desktop (the intended runtime)
- Node.js 20 or newer
- npm
- Ollama
- At least one pulled Ollama model

## Ubuntu VM setup

### 1. Install Node.js

Using NodeSource (Node 22):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

### 2. Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 3. Start Ollama

Ollama typically installs as a systemd service and listens on `127.0.0.1:11434`:

```bash
sudo systemctl enable --now ollama
sudo systemctl status ollama
```

Confirm locally:

```bash
curl http://localhost:11434/api/tags
```

Leave Ollama bound to localhost while it shares the VM with Jarvis. If you later move Ollama to another host, set `OLLAMA_HOST=0.0.0.0:11434` **on that host only**, restrict it to the LAN, and point Jarvis at that URL. Do not publish port 11434 to the public internet.

### 4. Add models

```bash
ollama pull llama3.2
```

Use any model you want. Jarvis reads the live model list from Ollama; names are not hard-coded. Newly pulled models appear in the selector (it refreshes on open, on window focus, and every 30 seconds).

### 5. Install Jarvis

```bash
git clone <your-repo-url> ~/jarvis
cd ~/jarvis
cp .env.example .env
npm install
```

Edit `.env` if Ollama is not on localhost:

```env
OLLAMA_BASE_URL=http://localhost:11434
```

### 6. Start Jarvis

Development:

```bash
npm run dev
```

On the VM, for normal use:

```bash
npm run build
npm start
```

Both bind to `0.0.0.0:3000` so other machines on the LAN can connect.

### 7. Access from another machine

On the Ubuntu VM:

```bash
hostname -I
```

From a laptop or tablet on the same network, open:

```text
http://<vm-lan-ip>:3000
```

If you use `npm run dev` from another device and the browser is blocked, set `ALLOWED_DEV_ORIGINS` in `.env` to that client's IP (no protocol), or use `npm start` instead.

### 8. Firewall

If UFW is enabled, allow Jarvis from the LAN only. Example for a typical home network:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 3000 proto tcp
sudo ufw deny 11434
sudo ufw reload
sudo ufw status
```

Adjust the LAN range to match your network (`10.0.0.0/8`, `172.16.0.0/12`, or a single trusted IP). Do not open Ollama (11434) to the world.

### 9. Configure the Ollama URL

| Setup | `OLLAMA_BASE_URL` |
| --- | --- |
| Ollama on the same VM | `http://localhost:11434` |
| Ollama on another LAN host | `http://192.168.x.x:11434` |

Restart Jarvis after changing the value. No code changes are required.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama inference API |
| `OLLAMA_API_KEY` | unset | Ollama web search key (server-side only; can also be saved in Settings) |
| `OLLAMA_WEB_SEARCH_URL` | `https://ollama.com/api/web_search` | Hosted web search endpoint |
| `WEB_SEARCH_MODELS` | `*` | Models allowed to use web search (`*` or comma-separated IDs) |
| `DATABASE_URL` | unset | PostgreSQL connection string (server-side only) |
| `ALLOWED_DEV_ORIGINS` | unset | Extra hostnames allowed to use `next dev` from the LAN |

Copy `.env.example` to `.env` or `.env.local`. Secrets and hostnames stay in environment variables; nothing is hard-coded.

There is no telemetry. Chat goes to the configured local Ollama URL. If web search runs, the query and your server-side API key go to Ollama's hosted search API only — never through the browser.

Restrict search per model with `WEB_SEARCH_MODELS`. Example: `WEB_SEARCH_MODELS=llama3.2,qwen3`.

## Usage

1. Open Jarvis in a browser.
2. Confirm the status indicator shows Ollama connected.
3. Select a model.
4. Send a message.
5. Stop, regenerate, or copy assistant replies as needed.
6. Use the sidebar for conversation history. History is stored in the browser (`localStorage`) for this version.
7. Open **Directory → Context** to add persistent facts, or **Knowledge** to upload documents.

Facts stored in Context are read on each chat request and sent to Ollama as a trusted system message. Chat never writes context automatically. Knowledge documents are stored only; RAG is not implemented yet.

## Project structure

```text
app/                 Next.js App Router (UI + API routes)
  api/chat/          Streaming chat (SSE)
  api/models/        Live Ollama model list
  api/health/        Ollama connectivity
  api/settings/      Server-side Ollama API key status/save/clear
  api/context/       Persistent context CRUD
  api/documents/     Knowledge document upload/list/delete
components/          Chat UI and Directory views
lib/
  ai/                Provider interface, Ollama adapter, web search client
  tools/             Tool registry (web_search first; others later)
  context/           Persistent context CRUD and chat prompt injection
  knowledge/         Document storage service
  db/                PostgreSQL pool
  client/            Browser calls to the Jarvis API
  conversations/     localStorage persistence (swap-ready for a database)
  secrets.ts         Server-only API key store
  config.ts          Environment configuration
migrations/          SQL migrations
scripts/migrate.mjs  Migration runner
```

Adding another inference backend later means implementing `AIProvider` and teaching `lib/ai/router.ts` how to choose it. The UI should not need to know.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

```bash
npm run lint
npm test
npm run build
```

## Database

PostgreSQL is expected on port 5432 (for example Docker container `jarvis-postgres`, database `jarvis`). Jarvis never connects from the browser.

```bash
# After setting DATABASE_URL in .env or .env.local
npm run migrate
npm run migrate:status
```

`npm run db:migrate` and `npm run db:status` do the same thing.

Migrations are additive and do not drop existing data. Uploaded files live in `data/uploads/` (gitignored). Context and document metadata live in PostgreSQL.

pgvector is enabled by the first migration. Chunk/embedding tables are not created yet; a later RAG migration can add `document_chunks` with a `vector` column.

To rebuild only the Jarvis schema in a disposable database, create a new empty database and run `npm run db:migrate`. Do not drop a database that already has data you care about.

This layout is compatible with later containerisation: configuration is via environment variables, and the HTTP server binds to `0.0.0.0`. Docker is not required for this version.

## What this version does not include

Routing between multiple models/GPUs, ComfyUI, voice, automatic memory extraction (SAVE/UPDATE/IGNORE), RAG, and Home Assistant are intentionally out of scope. Persistent context is injected into chat as a read-only system message. Web search is an optional backend tool, not a full agent loop.
