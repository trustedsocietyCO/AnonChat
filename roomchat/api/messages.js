// GET  /api/messages?code=XXXX&after=<id>&uid=<clientId>&name=<nick>
//      -> { messages: [...], online: [...] }   (also acts as heartbeat)
// POST /api/messages  { code, uid, name, text } -> { message }
import { exec } from "../lib/store.js";
import { ROOM_TTL, MAX_MESSAGES, MAX_TEXT, MAX_NAME, normCode, validCode, clean, body, rateLimit, send } from "../lib/util.js";
import { onlineUsers } from "./room.js";

const keys = (c) => ({ room: `room:${c}`, msgs: `room:${c}:msgs`, seq: `room:${c}:seq`, pres: `room:${c}:presence` });
const validUid = (u) => /^[a-zA-Z0-9_-]{8,64}$/.test(u || "");

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams;
      const code = normCode(q.get("code"));
      if (!validCode(code)) return send(res, 400, { error: "Invalid room code" });
      const k = keys(code);
      const after = Math.max(0, parseInt(q.get("after") || "0", 10) || 0);
      const uid = q.get("uid"), name = clean(q.get("name"), MAX_NAME);

      const cmds = [["GET", k.room], ["LRANGE", k.msgs, 0, -1], ["HGETALL", k.pres]];
      if (validUid(uid) && name) cmds.push(["HSET", k.pres, uid, JSON.stringify({ n: name, t: Date.now() })], ["EXPIRE", k.pres, ROOM_TTL]);
      const [meta, raw, presence] = await exec(cmds);
      if (!meta) return send(res, 404, { error: "Room not found or expired" });

      const messages = (raw || []).map((m) => JSON.parse(m)).filter((m) => m.id > after);
      return send(res, 200, { messages, online: onlineUsers(presence) });
    }

    if (req.method === "POST") {
      if (!(await rateLimit(req, "msg", 30, 10))) return send(res, 429, { error: "Slow down a bit." });
      const b = body(req);
      const code = normCode(b.code);
      const text = clean(b.text, MAX_TEXT);
      const name = clean(b.name, MAX_NAME);
      if (!validCode(code)) return send(res, 400, { error: "Invalid room code" });
      if (!validUid(b.uid)) return send(res, 400, { error: "Invalid client id" });
      if (!name) return send(res, 400, { error: "Nickname required" });
      if (!text) return send(res, 400, { error: "Message is empty" });
      const k = keys(code);

      const [meta] = await exec([["GET", k.room]]);
      if (!meta) return send(res, 404, { error: "Room not found or expired" });

      const [id] = await exec([["INCR", k.seq]]);
      const message = { id, uid: b.uid, name, text, ts: Date.now() };
      await exec([
        ["RPUSH", k.msgs, JSON.stringify(message)],
        ["LTRIM", k.msgs, -MAX_MESSAGES, -1],
        ["EXPIRE", k.room, ROOM_TTL], ["EXPIRE", k.msgs, ROOM_TTL], ["EXPIRE", k.seq, ROOM_TTL],
        ["HSET", k.pres, b.uid, JSON.stringify({ n: name, t: Date.now() })], ["EXPIRE", k.pres, ROOM_TTL],
      ]);
      return send(res, 201, { message });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Server error" });
  }
}
