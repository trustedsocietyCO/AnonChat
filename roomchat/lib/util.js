import { exec } from "./store.js";

export const ROOM_TTL = 60 * 60 * 24;   // rooms expire 24h after last activity
export const MAX_MESSAGES = 300;         // per room history kept
export const MAX_TEXT = 2000;
export const MAX_NAME = 32;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function newCode(len = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
export const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
export const validCode = (c) => /^[A-Z2-9]{8}$/.test(c);
export const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, max);

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}
export function ip(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}
// Fixed-window rate limiter: `limit` hits per `windowSec` per IP+bucket.
export async function rateLimit(req, bucket, limit, windowSec) {
  const key = `rl:${bucket}:${ip(req)}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const [n] = await exec([["INCR", key], ["EXPIRE", key, windowSec]]);
  return n <= limit;
}
export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}
