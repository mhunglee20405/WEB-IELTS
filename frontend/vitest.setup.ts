import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom does not implement HTMLDialogElement top-layer APIs natively yet.
// Polyfill showModal() and close() in test environments while preserving returnValue and close events.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
  }

  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(returnValue?: string) {
      if (returnValue !== undefined) {
        this.returnValue = returnValue;
      }
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

