# always-on-worker

**One container that never sleeps: a signed webhook receiver, a cron heartbeat and a queue worker — with every byte of state in a managed backend, and no VPS to patch.**

This is the companion repository for the Back4app blog post *How to Run a Bot, Webhook or Cron Job 24/7 Without Renting a VPS*. Everything in the post was measured on this exact code, on September 15–16, 2026; the numbers below come from that run.

> Article: link added at publication.

## What it does

A single 75-line Node.js process (`server.js`) with three jobs that need a process to stay awake:

| Job | Trigger | What it writes to the backend |
|---|---|---|
| `POST /webhook` | Inbound GitHub-style webhook, verified with HMAC-SHA256 (`X-Hub-Signature-256`) | `Event {source, delivery, payload}` — answers `202 {"stored": id}`; an unsigned request gets `401` |
| Cron tick | `setInterval` every 60 s | `Heartbeat {at, up_s}` — count the rows and you have the real uptime |
| Queue worker | `setInterval` every 5 s | takes the oldest `Job` with `status: "pending"`, runs it, stores `result` and `ms` |

The container holds nothing that matters. All three classes live in a **Back4app backend** (managed Parse Server), reached over HTTPS with the Parse JS SDK. A 9-line Cloud Code hook (`cloud/main.js`) is the one rule the container cannot bypass: a `Job` with an unknown `kind` is rejected with `400 {"code":142,"error":"unknown job kind."}`.

```
GitHub ──signed webhook──▶ ┌─────────────────────┐        ┌──────────────────────┐
                           │  container (Node 22) │ ─SDK─▶ │  Back4app backend     │
                           │  /webhook · cron ·   │        │  Event · Heartbeat ·  │
                           │  queue loop          │        │  Job  + beforeSave    │
                           └─────────────────────┘        └──────────────────────┘
```

## What we measured (September 2026, Back4app Containers)

| Measurement | Result |
|---|---|
| Deploy click → `DEPLOYMENT READY` (first deploy, free plan) | 57 s (24 s of it the image build) |
| Job created via REST → picked up and finished | 2.8 s (`fetch-title` job done in 97 ms) |
| Free plan lifetime | container destroyed **60 min after the deploy started** — 60 heartbeats, then silence |
| Plan change to Shared ($5/mo, 0.5 vCPU, 512 MB) | redeployed on its own, same URL, 63 s; heartbeat #61 followed #60 |
| `git push` with Autodeploy on → new version live | 44 s, zero failed requests during the swap |
| RAM at idle | 25–34 MB |

Two findings worth knowing before you deploy your own: the platform's health check is a **port** check (a path that answered `404` passed it), and the first Cloud Code deploy on a fresh backend ships nothing — deploy twice and prove the hook with a request.

## Files

- `server.js` — the container: webhook route, cron tick, queue loop, `/healthz`, `/stats`.
- `cloud/main.js` — the backend rule, deployed as Cloud Code (`beforeSave("Job")`).
- `Dockerfile` — `node:22-alpine`, `npm ci --omit=dev`, `EXPOSE 8080`.
- `deploy-check.sh` — fires a signed and an unsigned webhook at a deployment URL and checks health and stats.

## Run locally

```bash
cp .env.example .env      # PARSE_APP_ID, PARSE_JS_KEY, WEBHOOK_SECRET
npm install               # pins parse@8 — on Node 25, an unpinned install silently gets parse@3.5.1
node --env-file=.env server.js
```

## Deploy

1. Create a Back4app backend app; paste `cloud/main.js` into **Cloud Code → main.js** and deploy (twice, see above).
2. Push this repo to GitHub, then **Back4app Containers → New App → Deploy from GitHub**.
3. Set `PARSE_APP_ID`, `PARSE_JS_KEY` and `WEBHOOK_SECRET` as environment variables; set the health check to `/healthz`; deploy.
4. Verify: `WEBHOOK_SECRET=… ./deploy-check.sh https://<your-app>.b4a.run`

On the free plan the container lives 60 minutes per deploy — enough to test everything here. For "24/7", change the plan (Shared starts at $5/month as of September 2026) and turn on **Autodeploy** under Settings → Build & deploy.

## Create a job from anywhere

```bash
curl -X POST "https://parseapi.back4app.com/classes/Job" \
  -H "X-Parse-Application-Id: $APP_ID" -H "X-Parse-REST-API-Key: $REST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind": "fetch-title", "input": {"url": "https://www.back4app.com/"}}'
```

The worker picks it up within 5 seconds; `GET /stats` on the container shows the counts.

## License

MIT
