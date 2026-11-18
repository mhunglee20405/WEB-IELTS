import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { CourseForm } from "./course-form";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("CourseForm — Course Status and Date Interaction", () => {
  it("enables status selection in create mode and defaults to 'active'", () => {
    renderWithClient(
      <CourseForm
        mode="create"
        isPending={false}
        serverError={null}
        submitLabel="Tạo khóa học"
        onSubmit={vi.fn()}
      />,
    );

    const statusSelect = screen.getByLabelText(/Trạng thái/i) as HTMLSelectElement;
    expect(statusSelect).toBeEnabled();
    expect(statusSelect.value).toBe("active");
  });

  it("sets status to 'active' when startDate is today", () => {
    renderWithClient(
      <CourseForm
        mode="create"
        isPending={false}
        serverError={null}
        submitLabel="Tạo khóa học"
        onSubmit={vi.fn()}
      />,
    );

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const startDateInput = screen.getByLabelText(/Ngày khai giảng/i);
    const statusSelect = screen.getByLabelText(/Trạng thái/i) as HTMLSelectElement;

    fireEvent.change(startDateInput, { target: { value: todayStr } });
    expect(statusSelect.value).toBe("active");
  });

  it("sets status to 'upcoming' when startDate is in the future", () => {
    renderWithClient(
      <CourseForm
        mode="create"
        isPending={false}
        serverError={null}
        submitLabel="Tạo khóa học"
        onSubmit={vi.fn()}
      />,
    );

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

    const startDateInput = screen.getByLabelText(/Ngày khai giảng/i);
    const statusSelect = screen.getByLabelText(/Trạng thái/i) as HTMLSelectElement;

    fireEvent.change(startDateInput, { target: { value: futureDateStr } });
    expect(statusSelect.value).toBe("upcoming");
  });

  it("submits the chosen status (active) with the course form payload", async () => {
    const onSubmit = vi.fn();
    renderWithClient(
      <CourseForm
        mode="create"
        defaultTeacherId="tch-01"
        isPending={false}
        serverError={null}
        submitLabel="Tạo khóa học"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Mã khóa học/i), { target: { value: "IELTS-ACT-01" } });
    fireEvent.change(screen.getByLabelText(/Tên khóa học/i), { target: { value: "Khóa học thử nghiệm Active" } });
    fireEvent.change(screen.getByLabelText(/Trạng thái/i), { target: { value: "active" } });

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    fireEvent.change(screen.getByLabelText(/Ngày khai giảng/i), { target: { value: todayStr } });

    const submitBtn = screen.getByRole("button", { name: /Tạo khóa học/i });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalled();
    const submittedPayload = onSubmit.mock.calls[0][0];
    expect(submittedPayload.status).toBe("active");
    expect(submittedPayload.code).toBe("IELTS-ACT-01");
  });
});
