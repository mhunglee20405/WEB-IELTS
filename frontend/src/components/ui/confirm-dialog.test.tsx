import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("opens natively, resets returnValue, and invokes onConfirm when confirmed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Nộp bài làm?"
        description="Sau khi nộp bài hệ thống sẽ tính điểm lượt làm này."
        confirmLabel="Xác nhận nộp"
        cancelLabel="Hủy"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByText("Nộp bài làm?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xác nhận nộp" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses safe cancel button for danger variant and invokes onClose on cancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        variant="danger"
        title="Xóa học viên?"
        description="Hành động này sẽ gỡ học viên khỏi khóa học."
        confirmLabel="Xóa"
        cancelLabel="Giữ lại"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: "Giữ lại" });
    expect(cancelButton).toHaveFocus();

    await user.click(cancelButton);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

