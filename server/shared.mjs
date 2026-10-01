import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { dirname } from "node:path";
export const token = () => randomBytes(24).toString("base64url");
export const sign = (value, secret) =>
  createHmac("sha256", secret).update(value).digest("hex");
export function equal(a = "", b = "") {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export function store(path, initial) {
  mkdirSync(dirname(path), { recursive: true });
  const data = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : initial;
  return {
    data,
    save() {
      writeFileSync(path + ".tmp", JSON.stringify(data, null, 2));
      renameSync(path + ".tmp", path);
    },
  };
}
export async function body(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 8 * 1024 * 1024) fail(413, "Maximum request size is 8 MB");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString();
  try {
    return { raw, value: JSON.parse(raw || "{}") };
  } catch {
    fail(400, "Invalid JSON");
  }
}
export function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export function handler(route, origins) {
  return async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin))
      return json(res, 403, { error: "Origin not allowed" });
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Idempotency-Key, X-API-Key",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    try {
      await route(req, res, new URL(req.url, "http://localhost").pathname);
    } catch (e) {
      json(res, e.status || 500, {
        error: e.status ? e.message : "An internal error occurred",
      });
    }
  };
}
export async function post(url, value, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (response.ok) return { received: true };
  }
  if (!response.ok) fail(response.status, data.error || "Service unavailable");
  return data;
}
export const documents = {
  gcc_citizen: ["national_id", "passport"],
  gcc_resident: ["residence_permit"],
  schengen_resident: ["residence_permit"],
  schengen_visa: ["visa"],
  us_resident: ["residence_permit"],
  us_visa: ["visa"],
};
export function validateDocument(document) {
  if (
    !document ||
    typeof document.base64 !== "string" ||
    !document.base64.length
  )
    fail(400, "Upload a document image");
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(document.base64) ||
    document.base64.length % 4
  )
    fail(400, "Invalid base64 image");
  const bytes = Buffer.from(document.base64, "base64");
  if (bytes.length > 5 * 1024 * 1024) fail(413, "Image must be 5 MB or less");
  const valid =
    document.mimeType === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : document.mimeType === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : document.mimeType === "image/webp"
          ? bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          : false;
  if (!valid)
    fail(
      400,
      "Only PNG, JPEG or WebP images with matching file signatures are accepted",
    );
  return bytes;
}
