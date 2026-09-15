// Stack: Node.js 22.x | Express 5.x + Parse JS SDK 8.x | File: server.js
// Three things that need a process to be awake, in one container:
//   1. POST /webhook  — receives GitHub-style webhooks (HMAC-verified) and stores them
//   2. a cron tick    — every minute, writes a Heartbeat (that is how we measure uptime)
//   3. a queue worker — picks up pending Job objects every 5 s and completes them
const express = require("express");
const { createHmac, timingSafeEqual } = require("node:crypto");
const Parse = require("parse/node");

const { PORT = 8080, PARSE_APP_ID, PARSE_JS_KEY, WEBHOOK_SECRET = "",
        PARSE_SERVER_URL = "https://parseapi.back4app.com" } = process.env;
Parse.initialize(PARSE_APP_ID, PARSE_JS_KEY);
Parse.serverURL = PARSE_SERVER_URL;

const startedAt = new Date();
const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.get("/healthz", (_req, res) => res.json({ ok: true, version: require("./package.json").version, up_s: Math.round((Date.now() - startedAt) / 1000) }));

// 1. webhook receiver — verify the signature, store the event, answer fast
app.post("/webhook", async (req, res) => {
  const sig = req.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(req.rawBody).digest("hex");
  if (!WEBHOOK_SECRET || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    console.error("webhook rejected: bad signature");
    return res.status(401).json({ error: "bad signature" });
  }
  const ev = new Parse.Object("Event");
  ev.set("source", req.get("x-github-event") ?? "unknown");
  ev.set("delivery", req.get("x-github-delivery") ?? "");
  ev.set("payload", req.body);
  await ev.save();
  res.status(202).json({ stored: ev.id });
});

// 2. cron — a heartbeat every minute. Count them later and you know the real uptime.
setInterval(async () => {
  try { const hb = new Parse.Object("Heartbeat"); hb.set("at", new Date()); hb.set("up_s", Math.round((Date.now() - startedAt) / 1000)); await hb.save(); }
  catch (err) { console.error(`heartbeat failed: ${err.message}`); }
}, 60_000);

// 3. queue worker — anything can create a Job {kind, input}; this loop does the work
setInterval(async () => {
  try {
    const job = await new Parse.Query("Job").equalTo("status", "pending").ascending("createdAt").first();
    if (!job) return;
    job.set("status", "running"); await job.save();
    const t0 = Date.now();
    const result = await runJob(job.get("kind"), job.get("input"));
    job.set("status", "done"); job.set("result", result); job.set("ms", Date.now() - t0); await job.save();
    console.log(`job ${job.id} ${job.get("kind")} done in ${Date.now() - t0} ms`);
  } catch (err) { console.error(`worker failed: ${err.message}`); }
}, 5_000);

async function runJob(kind, input) {
  if (kind === "fetch-title") {           // fetch a page and return its <title>
    const html = await (await fetch(input.url, { signal: AbortSignal.timeout(10_000) })).text();
    return { title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null };
  }
  if (kind === "sleep") { await new Promise((r) => setTimeout(r, Number(input.ms ?? 1000))); return { slept: input.ms }; }
  throw new Error(`unknown job kind: ${kind}`);
}

app.get("/stats", async (_req, res) => {
  const count = (cls, q = (x) => x) => q(new Parse.Query(cls)).count();
  res.json({
    up_s: Math.round((Date.now() - startedAt) / 1000),
    heartbeats: await count("Heartbeat"),
    events: await count("Event"),
    jobs: { pending: await count("Job", (q) => q.equalTo("status", "pending")), done: await count("Job", (q) => q.equalTo("status", "done")) },
  });
});

app.listen(PORT, () => console.log(`always-on-worker listening on ${PORT}`));
