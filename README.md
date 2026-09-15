# always-on-worker

One container, three jobs that need a process to stay awake: a signed webhook receiver, a cron heartbeat, and a queue worker. State lives in a Back4app backend. Companion to the Back4app blog post on running a bot, webhook or cron job 24/7 without a VPS.

Run locally: `cp .env.example .env`, fill it in, `npm install`, `node --env-file=.env server.js`.
