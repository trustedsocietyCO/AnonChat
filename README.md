# 💬 RoomChat

No-registration, room-based chat. Serverless and ready for Vercel. No frameworks and no npm dependencies.

- **Create a room** → get a unique 8-character code (e.g. `3YLW-GXC3`)
- **Share** the code or the invite link (`/r/CODE`)
- **Chat**, with "who's online" presence
- Rooms auto-expire **24h after last activity** (last 300 messages kept)

## Architecture
```
public/            static frontend (HTML/CSS/vanilla JS), served from Vercel's CDN
api/room.js        POST create room · GET room info      → Vercel Serverless Function
api/messages.js    GET poll messages + heartbeat · POST send
lib/store.js       Upstash Redis REST client (+ in-memory fallback for local dev)
lib/util.js        codes, validation, rate limiting
```
Serverless functions can't hold WebSocket connections, so clients **poll** every ~1.5s
(slower when the tab is hidden). State lives in **Upstash Redis**, since function instances share no memory.

## Deploy to Vercel
1. Push this folder to a GitHub repo, then **Import** it in Vercel. No build settings are needed.
2. In the project, go to **Storage → Marketplace → Upstash (Redis) → Create & Connect**.
   This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
   (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work.)
3. Redeploy. Done.

Or use the CLI: `npm i -g vercel && vercel` (then connect Upstash and run `vercel --prod`).

## Run locally
```
npm run dev        # http://localhost:3000, in-memory store
```
Set the env vars from `.env.example` to use real Redis locally.

## Security notes
- The room code is the only access key (32^8 ≈ 1 trillion combinations). Share it only with people you want in the room.
- Messages are rendered with `textContent`, so they're safe from XSS. Input is length-limited and per-IP rate-limited.
- Nicknames aren't verified, so anyone can pick any name.
