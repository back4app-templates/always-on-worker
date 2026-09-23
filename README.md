# always-on-worker

[![Deploy on Back4app](https://img.shields.io/badge/Deploy%20on-Back4app-1568B8?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDJMMiA3djEwbDEwIDUgMTAtNVY3eiIvPjwvc3ZnPg==)](https://www.back4app.com/signup?utm_source=github&utm_medium=repo&utm_campaign=always-on-worker)

**Run a bot, a webhook receiver or a cron job 24/7 without renting a VPS.** One Node.js container that never sleeps, with a signed webhook receiver, a cron heartbeat and a queue worker, and every byte of state in a managed [Back4app](https://www.back4app.com/) backend. 75 lines of server code, an 8-line Dockerfile, nothing to patch.

Measured on September 15–16, 2026, on Back4app Containers: Deploy click → `DEPLOYMENT READY` in **57 s**, a job created over REST picked up and finished in **2.8 s**, a `git push` live in **44 s** with zero failed requests. Every number in the article comes from this exact code.

> **Read the article:** [How to Run a Node.js Bot, Webhook or Cron Job 24/7 Without a VPS](https://www.back4app.com/blog/run-a-bot-webhook-or-cron-24-7-without-a-vps?utm_source=github&utm_medium=repo&utm_campaign=always-on-worker)

## What it does

A single Node.js process (`server.js`) with three jobs that need a process to stay awake:

| Job | Trigger | What it writes to the backend |
|---|---|---|
| `POST /webhook` | Inbound GitHub-style webhook, verified with HMAC-SHA256 (`X-Hub-Signature-256`) | `Event {source, delivery, payload}` — answers `202 {"stored": id}`; an unsigned request gets `401` |
| Cron tick | `setInterval` every 60 s | `Heartbeat {at, up_s}` — count the rows and you have the real uptime |
| Queue worker | `setInterval` every 5 s | takes the oldest `Job` with `status: "pending"`, runs it, stores `result` and `ms` |

The container holds nothing that matters. All three classes live in the backend, reached over HTTPS with the Parse JS SDK. A 9-line Cloud Code hook (`cloud/main.js`) is the one rule the container cannot bypass: a `Job` with an unknown `kind` is rejected with `400 {"code":142,"error":"unknown job kind."}`.

```
GitHub ──signed webhook──▶ ┌─────────────────────┐        ┌──────────────────────┐
                           │  container (Node 22) │ ─SDK─▶ │  Back4app backend     │
                           │  /webhook · cron ·   │        │  Event · Heartbeat ·  │
                           │  queue loop          │        │  Job  + beforeSave    │
                           └─────────────────────┘        └──────────────────────┘
```

## What we measured

| Measurement | Result |
|---|---|
| Deploy click → `DEPLOYMENT READY` (first deploy, free plan) | 57 s (24 s of it the image build) |
| Job created via REST → picked up and finished | 2.8 s (`fetch-title` job done in 97 ms) |
| Free plan lifetime | container destroyed **60 min after the deploy started** — 60 heartbeats, then silence |
| Plan change to Shared ($5/mo, 0.5 vCPU, 512 MB) | redeployed on its own, same URL, 63 s; heartbeat #61 followed #60 |
| `git push` with Autodeploy on → new version live | 44 s, zero failed requests during the swap |
| RAM at idle | 25–34 MB |

Two findings before you deploy your own: the platform's health check is a **port** check (a path that answered `404` passed it), and the first Cloud Code deploy on a fresh backend ships nothing. Deploy twice and prove the hook with a request.

## Files

- `server.js` — the container: webhook route, cron tick, queue loop, `/healthz`, `/stats`.
- `cloud/main.js` — the backend rule, deployed as Cloud Code (`beforeSave("Job")`).
- `Dockerfile` — `node:22-alpine`, `npm ci --omit=dev`, `EXPOSE 8080`.
- `deploy-check.sh` — fires a signed and an unsigned webhook at a deployment URL and checks health and stats.

## Deploy your own

1. **Create a free account.** Sign up at [https://www.back4app.com/signup?utm_source=github&utm_medium=repo&utm_campaign=always-on-worker](https://www.back4app.com/signup?utm_source=github&utm_medium=repo&utm_campaign=always-on-worker). One account gives you both halves: **Build your Backend** (the three classes and the rule) and **Containers** (the process that never sleeps).
2. **Backend:** New App → Build your Backend. On Overview copy the App ID and the JavaScript key. **Cloud Code → main.js**: paste `cloud/main.js`, Deploy, then edit and deploy again; prove the hook with a request.
3. **Container:** push this repo to GitHub, then **Containers → New App → Deploy from GitHub**. Set `PARSE_APP_ID`, `PARSE_JS_KEY` and `WEBHOOK_SECRET` as environment variables and the health check to `/healthz`. Deploy.
4. Verify: `WEBHOOK_SECRET=… ./deploy-check.sh https://<your-app>.b4a.run`

On the free plan the container lives 60 minutes per deploy, enough to test everything here. For "24/7", change the plan (Shared starts at $5/month as of September 2026) and turn on **Autodeploy** under Settings → Build & deploy.

## Run locally

```bash
cp .env.example .env      # PARSE_APP_ID, PARSE_JS_KEY, WEBHOOK_SECRET
npm install               # pins parse@8 — on Node 25, an unpinned install silently gets parse@3.5.1
node --env-file=.env server.js
```

## Create a job from anywhere

```bash
curl -X POST "https://parseapi.back4app.com/classes/Job" \
  -H "X-Parse-Application-Id: $APP_ID" -H "X-Parse-REST-API-Key: $REST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind": "fetch-title", "input": {"url": "https://www.back4app.com/"}}'
```

The worker picks it up within 5 seconds; `GET /stats` on the container shows the counts.

## What the platform gives you

Containers build the Dockerfile, keep the process running behind HTTPS on a public URL and redeploy on push. The backend is a managed Parse Server with a database, REST and GraphQL APIs, Cloud Code and a dashboard where every Event, Heartbeat and Job is a row you can inspect. Documentation: [https://www.back4app.com/docs-containers?utm_source=github&utm_medium=repo&utm_campaign=always-on-worker](https://www.back4app.com/docs-containers?utm_source=github&utm_medium=repo&utm_campaign=always-on-worker) · [https://www.back4app.com/docs?utm_source=github&utm_medium=repo&utm_campaign=always-on-worker](https://www.back4app.com/docs?utm_source=github&utm_medium=repo&utm_campaign=always-on-worker).

## License

MIT
