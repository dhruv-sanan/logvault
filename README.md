# Log Explorer

A real-time log ingestion and query interface built with Next.js and Elasticsearch. Ingest structured logs via a REST API, then search, filter, and stream them live in the browser.

---

## What it does

- **Ingest** structured JSON logs via `POST /api/ingest`
- **Search** logs with full-text, level, service, and date-range filters
- **Live stream** new logs in real-time using Server-Sent Events (SSE)
- **Export** filtered results as CSV
- **Generate** demo logs directly in the browser (batch or continuous)
- **Inspect** the exact Elasticsearch query sent on every search
- **Verify** the Elasticsearch connection with raw API responses

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | shadcn/ui + Tailwind CSS |
| Search engine | Elasticsearch (local or Elastic Cloud Serverless) |
| ES client | `@elastic/elasticsearch` |
| Streaming | Server-Sent Events (SSE) |
| Language | TypeScript |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Elasticsearch

Create a `.env.local` file in the project root:

```env
# Local Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# — OR — Elastic Cloud Serverless
ELASTICSEARCH_URL=https://<deployment-id>.es.<region>.aws.elastic.cloud
ELASTICSEARCH_API_KEY=<your-api-key>
```

For local Elasticsearch, no API key is needed. For Elastic Cloud, both variables are required.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Ingesting logs

Send a `POST` request to `/api/ingest` with a JSON body:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "level": "error",
    "message": "Database connection failed",
    "service": "auth-service",
    "timestamp": "2026-03-22T10:00:00Z"
  }'
```

Or ingest a batch:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '[
    { "level": "info",  "message": "User logged in",  "service": "auth" },
    { "level": "error", "message": "Payment failed",  "service": "payments" }
  ]'
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `level` | string | yes | `info`, `warn`, `error`, or `debug` |
| `message` | string | yes | Log message text |
| `service` | string | yes | Name of the originating service |
| `timestamp` | ISO 8601 | no | Defaults to current time if omitted |
| any extra fields | any | no | Stored as-is in Elasticsearch |

---

## UI walkthrough

### Header buttons

#### Generate Logs
Opens a dialog to create demo logs directly in the browser — no external tools needed.

Two modes:

**One-shot batch** — inserts a fixed number of logs instantly with timestamps scattered over the past 24 hours (useful for testing date-range filters):
- 50 logs
- 200 logs
- 500 logs

**Continuous stream** — sends logs at a configurable rate until stopped or until the 1-minute safety limit is reached:
- Speed presets: Slow (30/min), Normal (100/min), Fast (300/min)
- Fine-tune with `−` and `+` buttons
- Auto-stops after 60 seconds to prevent accidental runaway generation
- The dialog can be **closed while logs are still being generated** — generation continues in the background; a pulsing indicator in the header button shows how many logs have been sent

> Continuous mode uses current timestamps so logs appear immediately in the Live feed.

---

#### Verify ES
Opens a dialog proving that Elasticsearch is actually being used — useful when Kibana is not accessible.

Shows:
- ES cluster health status (connected / error)
- Elasticsearch version and cluster name
- The **raw, unprocessed `_search` response** from `GET /logs/_search` — exactly as Elasticsearch returns it, including `_index`, `_id`, `_score`, and `_source` fields

---

#### Go Live / Live (toggle)
Starts or stops a real-time Server-Sent Events stream.

- When active, a green pulsing dot appears and new logs are prepended in a "Live feed" section above the main results
- Shows the count of new logs received since the stream opened
- **Clear** button discards streamed logs without stopping the stream
- The stream uses a timestamp cursor: only logs ingested *after* you click "Go Live" appear in the feed

---

#### ES Query
Toggles an amber panel showing the **exact JSON query** sent to Elasticsearch on every search.

Updates live as you change filters — useful for understanding how filters translate to ES queries and for debugging unexpected results.

---

#### Kibana *(only shown for Elastic Cloud)*
Opens Kibana Discover in ES|QL mode with the logs index pre-selected.

- Auto-creates a Kibana data view for the logs index if one doesn't exist yet
- Shows the query: `FROM logs | SORT timestamp DESC | LIMIT 100`
- Opens with auto-refresh paused (workaround for a WebKit/Safari bug in Kibana's refresh polling — use Chrome for best results, or click the refresh button manually in Kibana)

---

#### Export CSV
Downloads all logs matching the current filters as a CSV file. Pagination is ignored — the export includes all matching documents.

---

#### Refresh
Re-runs the current search against Elasticsearch. The spinner animates while loading.

---

### Filter bar

| Filter | Description |
|--------|-------------|
| Search | Full-text search across the `message` field. Supports plain text and Elasticsearch regular expressions (e.g. `fail.*timeout`). Plain terms like `fail` are automatically anchored (`.*fail.*`) so they match anywhere in the message. |
| Level | Filter by severity: All / Info / Warn / Error / Debug |
| Service | Filter by service name (exact match) |
| Start date | Show logs at or after midnight on this date (local timezone). Format: `YYYY-MM-DD`. |
| End date | Show logs up to and including 23:59:59 on this date (local timezone). Format: `YYYY-MM-DD`. |

**Date presets** (below the date inputs):
- Last 24 hours
- Last 7 days
- Last 30 days

Typing in the date fields works character-by-character; the filter updates once a complete `YYYY-MM-DD` date is entered. If you clear the field or enter an invalid date, the filter resets to "no date limit".

---

### Stats bar

Displays aggregate counts across **all logs in the index** (not just the current filter):

| Stat | Meaning |
|------|---------|
| Total | Total number of log documents in Elasticsearch |
| Errors | Count of logs with `level = error` |
| Warnings | Count of logs with `level = warn` |
| Services | Count of distinct services |

Click the refresh icon on the stats bar to update counts independently from the main search.

---

### Log table

Columns:

| Column | Description |
|--------|-------------|
| Timestamp | Log time in your local timezone |
| Level | Severity badge (color-coded) |
| Service | Originating service name |
| Message | Log message |

---

### Pagination

Results are paginated (default 20 per page). Use the Previous / Next buttons or click a page number to navigate.

---

## REST API reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ingest` | Ingest one or more log documents |
| `GET` | `/api/logs` | Search/filter logs with pagination |
| `GET` | `/api/logs/stream` | SSE stream of new logs (real-time) |
| `GET` | `/api/logs/export` | Download filtered logs as CSV |
| `GET` | `/api/logs/raw` | Raw Elasticsearch `_search` response (5 most recent) |
| `GET` | `/api/stats` | Aggregate counts (total, errors, warnings, services) |
| `GET` | `/api/health` | Health check — ES connection status, version, cluster name |
| `GET` | `/api/kibana-url` | Returns Kibana dev tools URL (Elastic Cloud only) |
| `GET` | `/api/kibana-redirect` | Creates data view + redirects to Kibana Discover |

### `GET /api/logs` query parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Full-text / regex search on `message` |
| `level` | string | Filter by level (`info`, `warn`, `error`, `debug`) |
| `service` | string | Filter by service name |
| `startTime` | ISO 8601 | Start of time range |
| `endTime` | ISO 8601 | End of time range |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Results per page (default: 20) |

---

## Deploying to Vercel

### 1. Push to GitHub

Push the project to a GitHub repository.

### 2. Import on Vercel

Go to [vercel.com](https://vercel.com), click **Add New Project**, and import your repository. No build settings need changing — Vercel auto-detects Next.js.

### 3. Set environment variables

In the Vercel project settings under **Environment Variables**, add:

| Variable | Value |
|----------|-------|
| `ELASTICSEARCH_URL` | Your Elasticsearch URL (local won't work from Vercel — use Elastic Cloud) |
| `ELASTICSEARCH_API_KEY` | Your Elastic Cloud API key |

### 4. Deploy

Click **Deploy**. Vercel builds and deploys automatically.

> **Note on SSE / Live feed**: Vercel's free Hobby tier limits serverless function execution to 10 seconds; Pro tier allows 60 seconds. The live stream (`/api/logs/stream`) is configured with `maxDuration = 60`. On the free tier, the stream will disconnect after ~10 seconds — click "Go Live" again to reconnect. For persistent streaming, use the Pro tier or self-host.

### No other changes needed

- `output: "standalone"` is **not** set (that option is for Docker/self-hosted deployments only and breaks Vercel)
- No custom Vercel config file is required

---

## Running with Docker (optional)

If you prefer self-hosting over Vercel, uncomment `output: "standalone"` in `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
};
```

Then build and run:

```bash
docker build -t log-explorer .
docker run -p 3000:3000 \
  -e ELASTICSEARCH_URL=http://host.docker.internal:9200 \
  log-explorer
```

Or use the included `docker-compose.yml` which starts both Next.js and a local Elasticsearch instance together.

---

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── ingest/          POST /api/ingest
│   │   ├── logs/            GET  /api/logs (search + pagination)
│   │   │   ├── export/      GET  /api/logs/export (CSV download)
│   │   │   ├── raw/         GET  /api/logs/raw (raw ES response)
│   │   │   ├── stream/      GET  /api/logs/stream (SSE)
│   │   │   └── tail/        GET  /api/logs/tail
│   │   ├── stats/           GET  /api/stats
│   │   ├── health/          GET  /api/health
│   │   ├── kibana-url/      GET  /api/kibana-url
│   │   └── kibana-redirect/ GET  /api/kibana-redirect
│   ├── layout.tsx
│   └── page.tsx             Main UI
├── components/
│   ├── logs/
│   │   ├── filter-bar.tsx           Search + level/service/date filters
│   │   ├── generate-logs-dialog.tsx  Demo log generator
│   │   ├── log-table.tsx            Results table
│   │   ├── pagination.tsx           Page controls
│   │   ├── stats-bar.tsx            Aggregate stats
│   │   └── verify-es-dialog.tsx     Raw ES verification dialog
│   └── ui/                  shadcn/ui components
├── hooks/
│   ├── use-logs.ts          Search state + debounced fetch
│   ├── use-log-stream.ts    SSE live feed
│   └── use-stats.ts         Stats fetch
├── lib/
│   └── elasticsearch.ts     ES client singleton
└── types/
    └── log.ts               TypeScript interfaces
```
