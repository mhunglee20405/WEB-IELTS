"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ModalDialogProps {
  open: boolean;
  title: string;
  description?: string;
  size?: "md" | "lg";
  /**
   * Keep `false` on modals containing forms or unsaved edits so an accidental
   * click outside does not discard the user's input.
   */
  lightDismiss?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Native `<dialog>` form/detail modal wrapper per modern-web-guidance:
 * - Uses `showModal()` for top-layer inerting and browser-managed focus return.
 * - Never adds redundant `role="dialog"` / `aria-modal` or unconditional `display`.
 * - Resets `returnValue` on open and on native `close`.
 */
export function ModalDialog({
  open,
  title,
  description,
  size = "md",
  lightDismiss = false,
  onClose,
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    dialog.setAttribute("closedby", lightDismiss ? "any" : "closerequest");

    if (open) {
      dialog.returnValue = "";
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close("programmatic");
    }
  }, [open, lightDismiss]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (!lightDismiss) {
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog || ("closedBy" in HTMLDialogElement.prototype)) {
      return;
    }
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
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className={cn("lms-dialog", size === "lg" && "lms-dialog--lg")}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-slate-950">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-slate-600">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close("close-button")}
            aria-label="Đóng hộp thoại"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-950"
          >
            <X className="h-5 w-5" aria-hidden={true} />
          </button>
        </div>

        <div className="lms-scroll-pane flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </dialog>
  );
}

