"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  /**
   * High-risk confirmations (e.g., submitting graded attempts or deleting data)
   * should keep `lightDismiss` false.
   */
  lightDismiss?: boolean;
  isSubmitting?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Native top-layer modal confirmation dialog following modern-web-guidance:
 * - Uses `<dialog>.showModal()` and native Esc / top-layer inerting (no custom focus trap).
 * - Resets `returnValue` on open and reads `returnValue` on native close.
 * - Uses `closedby="any"` + bounding-rect fallback when `lightDismiss` is enabled.
 * - Moves initial focus to the safe cancel action for destructive variants.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  variant = "default",
  lightDismiss = false,
  isSubmitting = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (lightDismiss) {
      dialog.setAttribute("closedby", "any");
    } else {
      dialog.setAttribute("closedby", "closerequest");
    }

    if (open) {
      dialog.returnValue = "";
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close("cancel");
    }
  }, [open, lightDismiss]);

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (!dialog) {
      onClose();
      return;
    }
    const reason = dialog.returnValue;
    dialog.returnValue = "";
    if (reason === "confirm") {
      void onConfirm();
    } else {
      onClose();
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (!lightDismiss || isSubmitting) {
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    // Mandatory fallback when native closedBy attribute is unsupported
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      if (event.detail === 0) {
        return;
      }
      const rect = dialog.getBoundingClientRect();
      const clickedInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!clickedInside) {
        dialog.close("dismiss");
      }
    }
  };

  const handleConfirmClick = () => {
    const dialog = dialogRef.current;
    if (!dialog || isSubmitting) {
      return;
    }
    dialog.close("confirm");
  };

  const handleCancelClick = () => {
    const dialog = dialogRef.current;
    if (!dialog || isSubmitting) {
      return;
    }
    dialog.close("cancel");
  };

  return (
    <dialog
      ref={dialogRef}
      className="lms-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClose={handleDialogClose}
      onClick={handleBackdropClick}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                variant === "danger"
                  ? "bg-red-100 text-red-700"
                  : "bg-blue-100 text-blue-700",
              )}
            >
              {variant === "danger" ? (
                <AlertTriangle className="h-5 w-5" aria-hidden={true} />
              ) : (
                <HelpCircle className="h-5 w-5" aria-hidden={true} />
              )}
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">
                {title}
              </h2>
              <div id={descId} className="mt-2 text-sm leading-relaxed text-slate-700">
                {description}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancelClick}
            disabled={isSubmitting}
            aria-label="Đóng hộp thoại"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden={true} />
          </button>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            autoFocus={variant === "danger"}
            disabled={isSubmitting}
            onClick={handleCancelClick}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirmClick}
            className={cn(
              "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50",
              variant === "danger"
                ? "bg-red-700 hover:bg-red-800"
                : "bg-blue-700 hover:bg-blue-800",
            )}
          >
            {isSubmitting ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

