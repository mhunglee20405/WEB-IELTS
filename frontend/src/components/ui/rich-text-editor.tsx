"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AlertCircle, Eye, FileText, Loader2, PlusSquare, Upload } from "lucide-react";
import { SafeHtml } from "./safe-html";
import { mediaApi } from "@/lib/api/endpoints/media";

interface TinyMceEditorInstance {
  focus: () => void;
  insertContent: (content: string) => void;
  getContent: () => string;
}

const subscribeNoop = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

export interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  height?: number;
  tinymceScriptSrc?: string;
  /** Optional label for quick blank insertion button (used in IELTS Listening editor) */
  insertBlankLabel?: string;
  /** Callback returning the exact blank HTML token to insert at the editor cursor */
  onBuildBlankHtml?: () => string;
}

/**
 * Chuẩn hóa HTML bài đọc / ghi chú:
 * 1. Loại bỏ toàn bộ thuộc tính inline style width, max-width, min-width trên mọi thẻ.
 * 2. Loại bỏ thuộc tính width / max-width trực tiếp trên các thẻ block.
 * 3. Chuyển đổi các thẻ <br> liên tiếp thành phân đoạn <p>.
 * 4. Loại bỏ các thẻ <br> ngắt dòng cứng giữa câu trong cùng một đoạn văn <p>
 *    (thay bằng dấu cách để văn bản trải dài 100% tự nhiên).
 */
export function normalizeReadingHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return rawHtml || "";

  // 1 & 2. Loại bỏ style inline width/max-width/min-width và attribute tương ứng trên thẻ không phải <img>;
  // trên <img> giữ lại width/height để hỗ trợ giáo viên kéo chỉnh kích thước ảnh trong TinyMCE
  let html = rawHtml.replace(
    /<([a-z0-9]+)\b([^>]*)>/gi,
    (_fullTag, tag: string, attrs: string) => {
      const isImg = tag.toLowerCase() === "img";
      let updatedAttrs = attrs.replace(
        /style\s*=\s*(["'])(.*?)\1/gi,
        (_m, quote: string, styles: string) => {
          const kept = styles
            .split(";")
            .map((s: string) => s.trim())
            .filter((s: string) => {
              if (!s) return false;
              if (isImg) {
                return !/^(max-width|min-width)\s*:/i.test(s);
              }
              return !/^(width|max-width|min-width)\s*:/i.test(s);
            })
            .join("; ");
          return kept ? `style=${quote}${kept}${quote}` : "";
        },
      );

      if (!isImg) {
        updatedAttrs = updatedAttrs.replace(
          /\b(?:width|max-width|min-width)\s*=\s*(["']).*?\1/gi,
          "",
        );
      }

      return `<${tag}${updatedAttrs}>`;
    },
  );

  // 3. Chuyển đổi các thẻ <br> liên tiếp (>= 2) thành ngắt đoạn </p><p>
  html = html.replace(/(?:<br\s*\/?>\s*){2,}/gi, "</p><p>");

  // 4. Chỉ bọc bằng thẻ <p> nếu nội dung thuần văn bản chưa có block HTML nào
  if (!/<(?:p|ul|ol|table|h[1-6]|div|blockquote|figure|img)\b/i.test(html) && html.trim()) {
    const blocks = html.split(/(?:<br\s*\/?>|\n){2,}/i);
    html = blocks
      .map((block) => `<p>${block.replace(/(?:<br\s*\/?>|\n)/gi, " ").trim()}</p>`)
      .join("");
  } else {
    // 5. Trong các đoạn văn <p>, xóa bỏ <br> ngắt dòng cưỡng bức giữa câu
    html = html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (_match, attrs, inner) => {
      const pContent = inner
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
      <div className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-lg border border-slate-300 bg-slate-50 p-6 text-slate-500">
        <Loader2 className="mb-2 h-6 w-6 animate-spin text-blue-600" />
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
  placeholder = "Nhập và định dạng nội dung tại đây...",
  height = 360,
  tinymceScriptSrc = "/tinymce/tinymce.min.js",
  insertBlankLabel,
  onBuildBlankHtml,
}: RichTextEditorProps) {
  const mounted = useSyncExternalStore(subscribeNoop, getClientTrue, getServerFalse);
  const [viewMode, setViewMode] = useState<"visual" | "preview">("visual");
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const initialNormalizedRef = useRef(false);
  const editorInstanceRef = useRef<TinyMceEditorInstance | null>(null);
  const onBuildBlankRef = useRef(onBuildBlankHtml);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onBuildBlankRef.current = onBuildBlankHtml;
  }, [onBuildBlankHtml]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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

  const handleInsertBlankAtCursor = () => {
    const buildFn = onBuildBlankRef.current;
    if (!buildFn || disabled) return;
    const blankHtml = buildFn();
    const editor = editorInstanceRef.current;
    if (editor && viewMode === "visual") {
      editor.focus();
      editor.insertContent(`${blankHtml}&nbsp;`);
      onChangeRef.current(editor.getContent());
    } else {
      onChangeRef.current(`${value ? `${value} ` : ""}${blankHtml}`);
    }
  };

  const handleInsertBlankRef = useRef(handleInsertBlankAtCursor);
  useEffect(() => {
    handleInsertBlankRef.current = handleInsertBlankAtCursor;
  });

  const sanitizedPreviewValue = useMemo(() => normalizeReadingHtml(value), [value]);

  const toolbarString = useMemo(() => {
    const base =
      "undo redo | blocks fontfamily fontsize | " +
      "bold italic underline strikethrough | forecolor backcolor | " +
      "alignleft aligncenter alignright alignjustify | " +
      "bullist numlist outdent indent | table image | removeformat";
    return onBuildBlankHtml ? `insertblank | ${base}` : `${base} | code help`;
  }, [onBuildBlankHtml]);

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {insertBlankLabel && onBuildBlankHtml && !disabled && (
            <button
              type="button"
              onClick={handleInsertBlankAtCursor}
              data-testid="rich-editor-insert-blank-btn"
              title="Đặt con trỏ ở vị trí muốn chèn (hoặc bấm Ctrl+Shift+B)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-2xs transition-colors hover:bg-blue-100"
            >
              <PlusSquare className="h-3.5 w-3.5" />
              <span>{insertBlankLabel}</span>
            </button>
          )}
          {!insertBlankLabel && (
            <span className="text-xs font-semibold text-slate-700">
              Chế độ soạn thảo:
            </span>
          )}
        </div>

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
            <span>Trình soạn thảo</span>
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

      {/* Trạng thái tải hình ảnh lên máy chủ */}
      {imageUploadProgress !== null && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700"
        >
          <Upload className="h-3.5 w-3.5 animate-pulse shrink-0" />
          <span>Đang tải hình ảnh lên máy chủ ({imageUploadProgress}%)...</span>
        </div>
      )}

      {imageUploadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
        >
          <span className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {imageUploadError}
          </span>
          <button
            type="button"
            onClick={() => setImageUploadError(null)}
            className="text-[11px] font-bold underline hover:text-rose-900"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Container TinyMCE - luôn duy trì mounted để bảo toàn con trỏ, vị trí cuộn & lịch sử Undo/Redo */}
      <div
        className={`w-full overflow-hidden rounded-lg border border-slate-300 shadow-xs [&_.tox-tinymce]:!w-full [&_.tox-tinymce]:!max-w-none [&_.tox-edit-area]:!w-full [&_.tox-edit-area__iframe]:!w-full [&_.tox-edit-area__iframe]:!max-w-none ${
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
              toolbar: toolbarString,
              font_family_formats:
                "Inter=Inter,sans-serif; " +
                "Arial=Arial,helvetica,sans-serif; " +
                "Times New Roman=Times New Roman,times,serif; " +
                "Georgia=Georgia,serif; " +
                "Roboto=Roboto,sans-serif; " +
                "Tahoma=Tahoma,sans-serif; " +
                "Verdana=Verdana,sans-serif",
              automatic_uploads: true,
              paste_data_images: true,
              object_resizing: "img",
              image_advtab: true,
              image_caption: true,
              file_picker_types: "image",
              file_picker_callback: (callback, _value, meta) => {
                if (meta.filetype !== "image") return;
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/png,image/jpeg,image/webp,image/gif";
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  setImageUploadError(null);
                  setImageUploadProgress(5);
                  try {
                    const url = await mediaApi.uploadImage(file, (pct) => {
                      setImageUploadProgress(pct);
                    });
                    callback(url, { alt: file.name.replace(/\.[^.]+$/, "") });
                  } catch (err) {
                    const msg =
                      err instanceof Error
                        ? err.message
                        : "Không thể tải hình ảnh lên máy chủ.";
                    setImageUploadError(msg);
                  } finally {
                    setImageUploadProgress(null);
                  }
                };
                input.click();
              },
              images_upload_handler: async (blobInfo, progress) => {
                const blob = blobInfo.blob();
                const rawName = blobInfo.filename() || "ielts-diagram.png";
                const mimeType =
                  blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
                const file = new File([blob], rawName, { type: mimeType });
                setImageUploadError(null);
                setImageUploadProgress(5);
                try {
                  const url = await mediaApi.uploadImage(file, (pct) => {
                    setImageUploadProgress(pct);
                    progress(pct);
                  });
                  return url;
                } catch (err) {
                  const msg =
                    err instanceof Error
                      ? err.message
                      : "Không thể tải hình ảnh lên máy chủ.";
                  setImageUploadError(msg);
                  throw err;
                } finally {
                  setImageUploadProgress(null);
                }
              },
              invalid_styles: {
                "*": "max-width min-width",
                p: "width max-width min-width",
                div: "width max-width min-width",
                span: "width max-width min-width",
                table: "width max-width min-width",
                td: "width max-width min-width",
                th: "width max-width min-width",
              },
              paste_preprocess: (_plugin: unknown, args: { content: string }) => {
                args.content = normalizeReadingHtml(args.content);
              },
              setup: (editor) => {
                editorInstanceRef.current = editor;

                if (onBuildBlankRef.current) {
                  editor.ui.registry.addButton("insertblank", {
                    text: "+ Chèn chỗ trống",
                    tooltip: "Chèn chỗ trống đánh số (Ctrl+Shift+B)",
                    onAction: () => {
                      handleInsertBlankRef.current();
                    },
                  });

                  editor.addShortcut("ctrl+shift+b", "Chèn chỗ trống đánh số", () => {
                    handleInsertBlankRef.current();
                  });
                }

                editor.on("init", () => {
                  const current = editor.getContent();
                  const cleaned = normalizeReadingHtml(current);
                  if (cleaned !== current) {
                    editor.setContent(cleaned);
                    onChangeRef.current(cleaned);
                  }
                });

                editor.on("PastePostProcess", (e) => {
                  if (e.node) {
                    const allElements = e.node.querySelectorAll("*");
                    allElements.forEach((el) => {
                      const htmlEl = el as HTMLElement;
                      const isImg = htmlEl.tagName === "IMG";
                      if (htmlEl.style) {
                        if (!isImg) {
                          htmlEl.style.removeProperty("width");
                        }
                        htmlEl.style.removeProperty("max-width");
                        htmlEl.style.removeProperty("min-width");
                      }
                      if (!isImg && htmlEl.hasAttribute("width")) {
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
                "html, body { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 14px 18px !important; box-sizing: border-box !important; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.65; color: #1e293b; overflow-x: hidden; } " +
                "body > *:not(img):not(figure), p, div, span, section, article, header, main, blockquote { max-width: none !important; width: auto !important; box-sizing: border-box !important; word-break: normal; overflow-wrap: break-word; } " +
                "p { margin-top: 0; margin-bottom: 0.75em; text-align: inherit; } " +
                "ul, ol { margin-top: 0.25em; margin-bottom: 0.75em; padding-left: 1.5em; } " +
                "li { margin-bottom: 0.35em; } " +
                "strong { font-weight: 700; color: #0f172a; } " +
                "img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; margin: 8px 0; } " +
                "figure.image { display: inline-block; max-width: 100%; margin: 8px 0; } " +
                "figure.image figcaption { font-size: 12px; color: #64748b; text-align: center; margin-top: 4px; } " +
                "table { border-collapse: collapse; width: 100% !important; max-width: 100% !important; margin-bottom: 1em; box-sizing: border-box !important; } " +
                "td, th { border: 1px solid #cbd5e1; padding: 8px 10px; vertical-align: top; } " +
                ".ielts-blank { display: inline-block; background: #eff6ff; border: 1px solid #93c5fd; color: #1d4ed8; border-radius: 6px; padding: 0 8px; margin: 0 2px; font-weight: 700; font-size: 0.92em; letter-spacing: 0.02em; }",
              placeholder,
              branding: false,
              promotion: false,
              statusbar: true,
            }}
          />
        ) : (
          <div className="flex min-h-[260px] w-full items-center justify-center bg-slate-50 text-slate-500">
            <Loader2 className="mb-2 h-6 w-6 animate-spin text-blue-600" />
          </div>
        )}
      </div>

      {/* Tab Xem trước - đồng bộ định dạng & blank token */}
      <div
        className={`reading-preview-container w-full min-h-[260px] max-h-[540px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/70 p-5 text-[14px] leading-[1.65] text-slate-800 shadow-xs ${
          viewMode === "preview" ? "block" : "hidden"
        }`}
      >
        {sanitizedPreviewValue.trim() ? (
          <SafeHtml
            html={sanitizedPreviewValue}
            preset="richText"
            className="reading-preview-prose flow-root w-full max-w-none leading-relaxed text-slate-800 [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_.ielts-blank]:inline-block [&_.ielts-blank]:rounded-md [&_.ielts-blank]:border [&_.ielts-blank]:border-blue-300 [&_.ielts-blank]:bg-blue-50 [&_.ielts-blank]:px-2 [&_.ielts-blank]:py-0.5 [&_.ielts-blank]:font-bold [&_.ielts-blank]:text-blue-700"
          />
        ) : (
          <p className="italic text-slate-500">Chưa có nội dung để xem trước.</p>
        )}
      </div>
    </div>
  );
}
