// Local dev server (no Vercel CLI needed): `npm run dev` -> http://localhost:3000
// Uses in-memory storage unless KV_REST_API_URL / KV_REST_API_TOKEN are set.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import room from "./api/room.js";
import messages from "./api/messages.js";
import { usingRedis } from "./lib/store.js";

const routes = { "/api/room": room, "/api/messages": messages };
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (routes[path]) {
    let raw = ""; for await (const c of req) raw += c;
    req.body = raw;
    return routes[path](req, res);
  }
  const file = path === "/" || path.startsWith("/r/") ? "/index.html" : path;
  try {
    const data = await readFile(join(process.cwd(), "public", file.replace(/\.\./g, "")));
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }).end(data);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(PORT, () => console.log(`RoomChat on http://localhost:${PORT} (${usingRedis ? "Upstash Redis" : "in-memory store"})`));
