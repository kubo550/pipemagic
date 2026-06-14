/**
 * Minimal redacting logger. Full Langfuse/OTel tracing arrives later (PRD §6);
 * for now the only hard requirement is that no tokens or third-party PII reach
 * stdout (PRD §8 — "logi bez PII").
 *
 * Strategy: redact by key name anywhere in the meta object, and never log raw
 * provider payloads. When in doubt, log a count or an id, not the content.
 */

const REDACT_KEYS = new Set(
  [
    "access_token",
    "accesstoken",
    "refresh_token",
    "refreshtoken",
    "id_token",
    "idtoken",
    "token",
    "code",
    "authorization",
    "email",
    "attendees",
    "summary",
    "description",
    "password",
    "scope",
  ].map((k) => k.toLowerCase()),
);

const REDACTED = "[redacted]";

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED; // guard against cycles / huge trees
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase())
        ? REDACTED
        : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Meta = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", msg: string, meta?: Meta) {
  const line = meta
    ? `${msg} ${JSON.stringify(sanitize(meta))}`
    : msg;
  console[level](`[pm] ${line}`);
}

export const log = {
  info: (msg: string, meta?: Meta) => emit("info", msg, meta),
  warn: (msg: string, meta?: Meta) => emit("warn", msg, meta),
  error: (msg: string, meta?: Meta) => emit("error", msg, meta),
};
