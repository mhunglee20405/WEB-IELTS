import { describe, expect, it, vi } from "vitest";
import { isHttpsUrl, isSafeExternalUrl, safeSetHtml, sanitizeHtml } from "./html";

describe("HTML sanitization & URL validation", () => {
  it("strips scripts, event handlers, data/aria attributes, and keeps safe reading markup", async () => {
    const dirty =
      '<p data-track="1" aria-label="hidden">Hello <strong>IELTS</strong></p><script>alert(1)</script><img src="x" onerror="alert(2)">';
    const clean = await sanitizeHtml(dirty, "richText");

    expect(clean).toContain("<p>");
    expect(clean).toContain("<strong>IELTS</strong>");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("alert(");
    expect(clean).not.toContain("onerror");
    expect(clean).not.toContain("data-track");
    expect(clean).not.toContain("aria-label");
  });

  it("delegates to native Element.prototype.setHTML when available", async () => {
    const host = document.createElement("div");
    const mockSetHTML = vi.fn();
    Object.defineProperty(Element.prototype, "setHTML", {
      configurable: true,
      writable: true,
      value: mockSetHTML,
    });

    try {
      await safeSetHtml(host, "<p>Passage</p><script>bad()</script>", "richText");
      expect(mockSetHTML).toHaveBeenCalledTimes(1);
      expect(mockSetHTML.mock.calls[0]?.[0]).toBe("<p>Passage</p><script>bad()</script>");
      expect(mockSetHTML.mock.calls[0]?.[1]).toMatchObject({
        sanitizer: {
          elements: expect.arrayContaining(["p", "strong"]),
          attributes: ["class"],
        },
      });
    } finally {
      delete (Element.prototype as unknown as Record<string, unknown>).setHTML;
    }
  });

  it("inserts sanitized HTML via DOMPurify fallback when native setHTML is unavailable", async () => {
    const host = document.createElement("div");
    await safeSetHtml(host, '<p onclick="evil()">Academic <em>Text</em></p><script>evil()</script>');
    expect(host.innerHTML).toBe("<p>Academic <em>Text</em></p>");
  });

  it("allows only http/https URLs for general external URLs and HTTPS-only for Meet links", () => {
    expect(isSafeExternalUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isSafeExternalUrl("http://localhost:3000/lesson")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeExternalUrl("not a url")).toBe(false);

    expect(isHttpsUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isHttpsUrl("http://meet.google.com/abc-defg-hij")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
  });
});

