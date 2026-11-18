import { describe, expect, it } from "vitest";
import { normalizeReadingHtml } from "./rich-text-editor";

describe("normalizeReadingHtml", () => {
  it("removes inline width, max-width and min-width styles", () => {
    const input =
      '<div style="width: 500px; max-width: 600px; min-width: 300px; color: #1e293b;"><p style="max-width: 450px;">Content</p></div>';
    const output = normalizeReadingHtml(input);

    expect(output).not.toContain("width: 500px");
    expect(output).not.toContain("max-width: 600px");
    expect(output).not.toContain("min-width: 300px");
    expect(output).not.toContain("max-width: 450px");
    expect(output).toContain('style="color: #1e293b"');
  });

  it("removes direct width/max-width HTML attributes from non-img elements", () => {
    const input = '<div width="500" max-width="600"><p width="100%">Paragraph</p></div>';
    const output = normalizeReadingHtml(input);

    expect(output).not.toContain('width="500"');
    expect(output).not.toContain('max-width="600"');
    expect(output).not.toContain('width="100%"');
  });

  it("replaces hard <br> line breaks inside <p> with a space so sentences flow full-width", () => {
    const input =
      "<p>Modern cities absorb solar radiation far more<br>intensely than surrounding rural landscapes, generating urban<br />heat islands that drive up summer cooling demand.</p>";
    const output = normalizeReadingHtml(input);

    expect(output).toBe(
      "<p>Modern cities absorb solar radiation far more intensely than surrounding rural landscapes, generating urban heat islands that drive up summer cooling demand.</p>",
    );
  });

  it("converts consecutive <br> tags into paragraph breaks </p><p>", () => {
    const input = "<p>First paragraph.<br><br>Second paragraph with<br>break.</p>";
    const output = normalizeReadingHtml(input);

    expect(output).toBe("<p>First paragraph.</p><p>Second paragraph with break.</p>");
  });

  it("wraps raw unparagraph text into <p> tags and cleans line breaks", () => {
    const input = "Paragraph A line 1\nline 2\n\nParagraph B line 3";
    const output = normalizeReadingHtml(input);

    expect(output).toContain("<p>Paragraph A line 1 line 2</p>");
    expect(output).toContain("<p>Paragraph B line 3</p>");
  });
});
