// Storage layer: Upstash Redis over REST (zero dependencies).
// Falls back to an in-memory store for local dev when no env vars are set.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const usingRedis = Boolean(URL_ && TOKEN);

async function pipeline(cmds) {
  const r = await fetch(`${URL_.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const out = await r.json();
  return out.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

// ---- In-memory fallback (single instance only; NOT for production) ----
const mem = globalThis.__roomchatMem || (globalThis.__roomchatMem = new Map());
function memGet(k) {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) { mem.delete(k); return null; }
  return e;
}
function memExec([cmd, key, ...a]) {
  const e = memGet(key);
  switch (cmd) {
    case "SET": {
      const nx = a.includes("NX"); const exIdx = a.indexOf("EX");
      if (nx && e) return null;
      mem.set(key, { v: a[0], exp: exIdx >= 0 ? Date.now() + a[exIdx + 1] * 1000 : 0 });
      return "OK";
    }
    case "GET": return e ? e.v : null;
    case "INCR": { const n = (e ? Number(e.v) : 0) + 1; mem.set(key, { v: String(n), exp: e?.exp || 0 }); return n; }
    case "EXPIRE": if (e) e.exp = Date.now() + a[0] * 1000; return e ? 1 : 0;
    case "RPUSH": { const l = e ? e.v : []; l.push(...a); mem.set(key, { v: l, exp: e?.exp || 0 }); return l.length; }
    case "LTRIM": { if (e) { const n = e.v.length; let s = +a[0], t = +a[1]; if (s < 0) s = Math.max(0, n + s); if (t < 0) t = n + t; e.v = e.v.slice(s, t + 1); } return "OK"; }
    case "LRANGE": { if (!e) return []; const n = e.v.length; let s = +a[0], t = +a[1]; if (s < 0) s = Math.max(0, n + s); if (t < 0) t = n + t; return e.v.slice(s, t + 1); }
    case "HSET": { const h = e ? e.v : {}; for (let i = 0; i < a.length; i += 2) h[a[i]] = a[i + 1]; mem.set(key, { v: h, exp: e?.exp || 0 }); return 1; }
    case "HGETALL": { if (!e) return []; return Object.entries(e.v).flat(); }
    case "HDEL": { if (e) for (const f of a) delete e.v[f]; return 1; }
    default: throw new Error("Unsupported cmd " + cmd);
  }
}

export async function exec(cmds) {
  if (usingRedis) return pipeline(cmds);
  return cmds.map(memExec);
}
