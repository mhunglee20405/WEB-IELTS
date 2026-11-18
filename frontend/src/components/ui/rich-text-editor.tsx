"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileText, Loader2 } from "lucide-react";
import { SafeHtml } from "./safe-html";

export interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  height?: number;
  tinymceScriptSrc?: string;
}

/**
 * Chuẩn hóa HTML bài đọc:
 * 1. Loại bỏ toàn bộ thuộc tính inline style width, max-width, min-width trên mọi thẻ.
 * 2. Loại bỏ thuộc tính width / max-width trực tiếp trên các thẻ block.
 * 3. Chuyển đổi các thẻ <br> liên tiếp thành phân đoạn <p>.
 * 4. Loại bỏ các thẻ <br> ngắt dòng cứng giữa câu trong cùng một đoạn văn <p>
 *    (thay bằng dấu cách để văn bản trải dài 100% tự nhiên).
 */
export function normalizeReadingHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return rawHtml || "";

  // 1. Loại bỏ style inline width, max-width, min-width
  let html = rawHtml.replace(/style\s*=\s*(["'])(.*?)\1/gi, (_match, quote, styles) => {
    const kept = styles
      .split(";")
      .map((s: string) => s.trim())
      .filter((s: string) => s && !/^(width|max-width|min-width)\s*:/i.test(s))
      .join("; ");
    return kept ? `style=${quote}${kept}${quote}` : "";
  });

  // 2. Loại bỏ thuộc tính width/max-width/min-width dạng attribute trên các thẻ không phải hình ảnh
  html = html.replace(
    /<(?!img\b)([a-z0-9]+)\b([^>]*)>/gi,
    (_fullTag, tag, attrs) => {
      const cleanedAttrs = attrs.replace(
        /\b(?:width|max-width|min-width)\s*=\s*(["']).*?\1/gi,
        "",
      );
      return `<${tag}${cleanedAttrs}>`;
    },
  );

  // 3. Chuyển đổi các thẻ <br> liên tiếp (>= 2) thành ngắt đoạn </p><p>
  html = html.replace(/(?:<br\s*\/?>\s*){2,}/gi, "</p><p>");

  // 4. Nếu chưa có thẻ <p> nào mà có nội dung, bọc các đoạn văn bằng thẻ <p>
  if (!/<p\b/i.test(html) && html.trim()) {
    const blocks = html.split(/(?:<br\s*\/?>|\n){2,}/i);
    html = blocks
      .map((block) => `<p>${block.replace(/(?:<br\s*\/?>|\n)/gi, " ").trim()}</p>`)
      .join("");
  } else {
    // 5. Trong các đoạn văn <p>, xóa bỏ <br> ngắt dòng cưỡng bức giữa câu
    html = html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (_match, attrs, inner) => {
      let pContent = inner
        .replace(/^(?:\s*<br\s*\/?>\s*)+/gi, "")
        .replace(/(?:\s*<br\s*\/?>\s*)+$/gi, "")
        .replace(/\s*<br\s*\/?>\s*/gi, " ")
        .replace(/[ \t]{2,}/g, " ");
      return `<p${attrs}>${pContent}</p>`;
    });
  }

  return html;
}

const DynamicTinyMceEditor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => mod.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-lg border border-slate-300 bg-slate-50 p-6 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
        <span className="text-sm font-medium">Đang tải trình soạn thảo TinyMCE (Self-hosted)...</span>
      </div>
    ),
  },
);

export function RichTextEditor({
  id,
  value,
  onChange,
  disabled = false,
  placeholder = "Nhập và định dạng đoạn văn bài đọc tại đây...",
  height = 360,
  tinymceScriptSrc = "/tinymce/tinymce.min.js",
}: RichTextEditorProps) {
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"visual" | "preview">("visual");
  const initialNormalizedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Chuẩn hóa một lần khi giá trị khởi tạo chứa định dạng ngắt dòng/width thừa
  useEffect(() => {
    if (!initialNormalizedRef.current && value) {
      initialNormalizedRef.current = true;
      const cleaned = normalizeReadingHtml(value);
      if (cleaned !== value) {
        onChange(cleaned);
      }
    }
  }, [value, onChange]);

  const sanitizedPreviewValue = useMemo(() => normalizeReadingHtml(value), [value]);

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">
          Chế độ soạn thảo:
        </span>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setViewMode("visual")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
              viewMode === "visual"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>TinyMCE trực quan</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
              viewMode === "preview"
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Xem trước</span>
          </button>
        </div>
      </div>

      {/* Container TinyMCE - luôn duy trì mounted để bảo toàn con trỏ, vị trí cuộn & lịch sử Undo/Redo */}
      <div
        className={`w-full rounded-lg border border-slate-300 overflow-hidden shadow-xs [&_.tox-tinymce]:!w-full [&_.tox-tinymce]:!max-w-none [&_.tox-edit-area]:!w-full [&_.tox-edit-area__iframe]:!w-full [&_.tox-edit-area__iframe]:!max-w-none ${
          viewMode === "visual" ? "block" : "hidden"
        }`}
        style={{ width: "100%", maxWidth: "100%" }}
      >
        {mounted ? (
          <DynamicTinyMceEditor
            id={id}
            licenseKey="gpl"
            tinymceScriptSrc={tinymceScriptSrc}
            value={value}
            disabled={disabled}
            onEditorChange={(content) => onChange(content)}
            init={{
              width: "100%",
              base_url: "/tinymce",
              suffix: ".min",
              height,
              menubar: false,
              plugins: [
                "advlist",
                "autolink",
                "lists",
                "link",
                "image",
                "charmap",
                "preview",
                "anchor",
                "searchreplace",
                "visualblocks",
                "code",
                "fullscreen",
                "insertdatetime",
                "table",
                "help",
                "wordcount",
              ],
              toolbar:
                "undo redo | blocks fontfamily fontsize | " +
                "bold italic underline strikethrough | forecolor backcolor | " +
                "alignleft aligncenter alignright alignjustify | " +
                "bullist numlist outdent indent | table | removeformat | code help",
              font_family_formats:
                "Inter=Inter,sans-serif; " +
                "Arial=Arial,helvetica,sans-serif; " +
                "Times New Roman=Times New Roman,times,serif; " +
                "Georgia=Georgia,serif; " +
                "Roboto=Roboto,sans-serif; " +
                "Tahoma=Tahoma,sans-serif; " +
                "Verdana=Verdana,sans-serif",
              invalid_styles: {
                "*": "width max-width min-width",
              },
              paste_preprocess: (_plugin: unknown, args: { content: string }) => {
                args.content = normalizeReadingHtml(args.content);
              },
              setup: (editor) => {
                editor.on("init", () => {
                  const current = editor.getContent();
                  const cleaned = normalizeReadingHtml(current);
                  if (cleaned !== current) {
                    editor.setContent(cleaned);
                    onChange(cleaned);
                  }
                });

                editor.on("PastePostProcess", (e) => {
                  if (e.node) {
                    // 1. Gỡ bỏ width / max-width / min-width trên mọi node
                    const allElements = e.node.querySelectorAll("*");
                    allElements.forEach((el) => {
                      const htmlEl = el as HTMLElement;
                      if (htmlEl.style) {
                        htmlEl.style.removeProperty("width");
                        htmlEl.style.removeProperty("max-width");
                        htmlEl.style.removeProperty("min-width");
                      }
                      if (htmlEl.hasAttribute("width")) {
                        htmlEl.removeAttribute("width");
                      }
                      if (htmlEl.hasAttribute("max-width")) {
                        htmlEl.removeAttribute("max-width");
                      }
                    });
                    if (e.node.style) {
                      e.node.style.removeProperty("width");
                      e.node.style.removeProperty("max-width");
                      e.node.style.removeProperty("min-width");
                    }

                    // 2. Gỡ bỏ thẻ <br> ngắt dòng cứng giữa câu trong cùng đoạn văn <p>
                    const paragraphs = e.node.querySelectorAll("p");
                    paragraphs.forEach((p) => {
                      const brs = p.querySelectorAll("br");
                      brs.forEach((br) => {
                        const space = document.createTextNode(" ");
                        br.parentNode?.replaceChild(space, br);
                      });
                      p.normalize();
                    });
                  }
                });
              },
              content_style:
                "html, body { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 16px 24px !important; box-sizing: border-box !important; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1e293b; overflow-x: hidden; } " +
                "body > *, p, div, span, section, article, header, main, blockquote { max-width: none !important; width: auto !important; box-sizing: border-box !important; word-break: normal; overflow-wrap: break-word; } " +
                "p { margin-top: 0; margin-bottom: 1em; text-align: inherit; } " +
                "p[style*='text-align: right'], p[style*='text-align:right'] { text-align: right !important; } " +
                "p[style*='text-align: center'], p[style*='text-align:center'] { text-align: center !important; } " +
                "p[style*='text-align: justify'], p[style*='text-align:justify'] { text-align: justify !important; } " +
                "p[style*='text-align: left'], p[style*='text-align:left'] { text-align: left !important; } " +
                "strong { font-weight: 700; color: #0f172a; } " +
                "table { border-collapse: collapse; width: 100% !important; max-width: 100% !important; margin-bottom: 1em; box-sizing: border-box !important; } " +
                "td, th { border: 1px solid #cbd5e1; padding: 8px 12px; }",
              placeholder,
              branding: false,
              promotion: false,
              statusbar: true,
            }}
          />
        ) : (
          <div className="flex min-h-[300px] w-full items-center justify-center bg-slate-50 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
          </div>
        )}
      </div>

      {/* Tab Xem trước - đồng bộ 100% định dạng và không cắt chân chữ */}
      <div
        className={`w-full min-h-[360px] max-h-[600px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 text-[15px] leading-[1.65] text-slate-800 shadow-xs reading-preview-container ${
          viewMode === "preview" ? "block" : "hidden"
        }`}
        style={{ padding: "16px 24px" }}
      >
        {sanitizedPreviewValue.trim() ? (
          <SafeHtml
            html={sanitizedPreviewValue}
            preset="richText"
            className="reading-preview-prose w-full max-w-none text-slate-800 leading-relaxed"
          />
        ) : (
          <p className="italic text-slate-500">Chưa có nội dung bài đọc để xem trước.</p>
        )}
      </div>
    </div>
  );
}
