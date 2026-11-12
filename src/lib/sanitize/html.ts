export type SanitizePreset = "richText" | "inline";

const SANITIZE_CONFIGS: Record<
  SanitizePreset,
  { elements: string[]; attributes: string[] }
> = {
  richText: {
    elements: [
      "p",
      "br",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "ul",
      "ol",
      "li",
      "h2",
      "h3",
      "h4",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "span",
    ],
    attributes: ["class"],
  },
  inline: {
    elements: ["b", "strong", "i", "em", "u", "br", "span"],
    attributes: ["class"],
  },
};

type DOMPurifyInstance = typeof import("dompurify").default;

let domPurifyPromise: Promise<DOMPurifyInstance> | null = null;

async function loadDOMPurify(): Promise<DOMPurifyInstance> {
  domPurifyPromise ??= import("dompurify").then((mod) => mod.default ?? mod);
  return domPurifyPromise;
}

type ElementWithSanitizer = Element & {
  setHTML: (
    input: string,
    options?: {
      sanitizer?: {
        elements?: string[];
        attributes?: string[];
      };
    },
  ) => void;
};

/**
 * Safely parses and inserts untrusted HTML into an element.
 * Uses the native Sanitizer API (`Element.prototype.setHTML`) when supported,
 * and dynamically falls back to DOMPurify configured to match native behavior
 * (`ALLOW_ARIA_ATTR: false`, `ALLOW_DATA_ATTR: false`, `KEEP_CONTENT: false`).
 */
export async function safeSetHtml(
  element: Element,
  html: string,
  preset: SanitizePreset = "richText",
): Promise<void> {
  const { elements, attributes } = SANITIZE_CONFIGS[preset];

  if (typeof Element !== "undefined" && "setHTML" in Element.prototype) {
    (element as ElementWithSanitizer).setHTML(html, {
      sanitizer: { elements, attributes },
    });
    return;
  }

  const DOMPurify = await loadDOMPurify();
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...elements, "#text"],
    ALLOWED_ATTR: attributes,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: false,
  });
  element.innerHTML = clean;
}

/**
 * Produces a sanitized HTML string (for non-DOM / asynchronous preview pipelines).
 * Server-side calls escape angle brackets so untrusted HTML is never emitted raw during SSR.
 */
export async function sanitizeHtml(
  html: string,
  preset: SanitizePreset = "richText",
): Promise<string> {
  if (!html) {
    return "";
  }

  if (typeof window === "undefined") {
    return escapeHtmlText(html);
  }

  const { elements, attributes } = SANITIZE_CONFIGS[preset];

  if ("setHTML" in Element.prototype) {
    const scratch = document.createElement("div");
    (scratch as unknown as ElementWithSanitizer).setHTML(html, {
      sanitizer: { elements, attributes },
    });
    return scratch.innerHTML;
  }

  const DOMPurify = await loadDOMPurify();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...elements, "#text"],
    ALLOWED_ATTR: attributes,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: false,
  });
}

export function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Validates external URLs so only HTTP/HTTPS URLs are accepted.
 */
export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Validates HTTPS-only external URLs (such as Google Meet links and signed audio URLs).
 */
export function isHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const SAFE_MOCK_AUDIO_DATA_URL_RE =
  /^data:audio\/(?:wav|mpeg|mp3|ogg|webm|mp4);base64,[A-Za-z0-9+/=]+$/i;

/**
 * Validates signed audio stream URLs, permitting `/...` and HTTP/HTTPS URLs in all modes,
 * plus bounded base64 `data:audio/*` payloads only when explicitly enabled in dev mock mode.
 */
export function isSafeAudioStreamUrl(rawUrl: string, allowMockDataUrl = false): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  if (allowMockDataUrl && SAFE_MOCK_AUDIO_DATA_URL_RE.test(trimmed)) return true;
  return isSafeExternalUrl(trimmed);
}
