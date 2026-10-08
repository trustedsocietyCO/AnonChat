// POST /api/room            { name? }  -> create room, returns { code }
// GET  /api/room?code=XXXX            -> room info (exists, name, online users)
import { exec } from "../lib/store.js";
import { ROOM_TTL, newCode, normCode, validCode, clean, body, rateLimit, send } from "../lib/util.js";

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      if (!(await rateLimit(req, "create", 10, 600))) return send(res, 429, { error: "Too many rooms created. Try again later." });
      const { name } = body(req);
      const title = clean(name, 48) || "Untitled room";
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const meta = JSON.stringify({ title, createdAt: Date.now() });
        const [ok] = await exec([["SET", `room:${code}`, meta, "NX", "EX", ROOM_TTL]]);
        if (ok) return send(res, 201, { code, title });
      }
      return send(res, 500, { error: "Could not allocate a room code" });
    }

    if (req.method === "GET") {
      const code = normCode(new URL(req.url, "http://x").searchParams.get("code"));
      if (!validCode(code)) return send(res, 400, { error: "Invalid room code" });
      const [meta, presence] = await exec([["GET", `room:${code}`], ["HGETALL", `room:${code}:presence`]]);
      if (!meta) return send(res, 404, { error: "Room not found or expired" });
      return send(res, 200, { code, ...JSON.parse(meta), online: onlineUsers(presence) });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Server error" });
  }
}

export function onlineUsers(flat) {
  const now = Date.now(), users = [];
  for (let i = 0; i < (flat?.length || 0); i += 2) {
    try { const p = JSON.parse(flat[i + 1]); if (now - p.t < 15000) users.push(p.n); } catch {}
  }
  return users;
}
