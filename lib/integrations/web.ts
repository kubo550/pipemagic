/**
 * Minimal, keyless web fetch for enrichment (PRD §5/§8). Read-only: fetch a
 * public URL, strip it to text. Web-sourced info is treated as "to verify"
 * upstream. Basic SSRF guards — only http(s), and obvious private/loopback
 * hosts are rejected. (Hardening note: DNS-rebinding-proof resolution is a
 * later improvement; this blocks the common cases.)
 */

const BLOCKED_HOST = /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|169\.254\.|::1$|\[::1\]$|172\.(1[6-9]|2\d|3[01])\.)/i;

export interface FetchedPage {
  url: string;
  title: string | null;
  text: string;
}

function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (BLOCKED_HOST.test(url.hostname)) {
    throw new Error("That host is not allowed.");
  }
  return url;
}

function htmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])).trim() : null;

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const text = decodeEntities(stripTags(body))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  return { title, text };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const MAX_CHARS = 5000;
const TIMEOUT_MS = 10_000;

export async function fetchUrl(raw: string): Promise<FetchedPage> {
  const url = assertSafeUrl(raw);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "PipeMagic/0.1 (+research)" },
    });
    if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);

    const ctype = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    if (ctype.includes("html")) {
      const { title, text } = htmlToText(raw);
      return { url: url.toString(), title, text: text.slice(0, MAX_CHARS) };
    }
    // Non-HTML (plain text, etc.) — return as-is, truncated.
    return { url: url.toString(), title: null, text: raw.slice(0, MAX_CHARS) };
  } finally {
    clearTimeout(timer);
  }
}
