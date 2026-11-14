import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/error";
import { DataTable, type DataTableColumn } from "./data-table";
import { StatusBadge } from "./status-badge";

interface SampleItem {
  id: string;
  student: string;
  score: string;
}

const COLUMNS: DataTableColumn<SampleItem>[] = [
  { key: "student", header: "Học viên", renderCell: (row) => row.student },
  { key: "score", header: "Trạng thái", renderCell: () => <StatusBadge status="passed" /> },
];

describe("DataTable & QueryState", () => {
  it("renders accessible region, caption, column headers, and row headers", () => {
    render(
      <DataTable
        caption="Bảng điểm học viên"
        columns={COLUMNS}
        rows={[{ id: "1", student: "Khổng Phú Cường", score: "90%" }]}
        getRowKey={(row) => row.id}
      />,
    );

    const region = screen.getByRole("region", { name: "Bảng điểm học viên" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("columnheader", { name: "Học viên" })).toHaveAttribute("scope", "col");
    expect(screen.getByRole("rowheader", { name: "Khổng Phú Cường" })).toHaveAttribute(
      "scope",
      "row",
    );
    expect(screen.getByText("Đạt (>=70%)")).toBeInTheDocument();
  });

  it("renders alert error state with requestId and working retry button", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <DataTable
        caption="Bảng điểm"
        columns={COLUMNS}
        rows={[]}
        getRowKey={(row) => row.id}
        isError={true}
        error={
          new ApiError({
            statusCode: 500,
            code: "INTERNAL",
            message: "Máy chủ bận",
            requestId: "req-999",
          })
        }
        onRetry={onRetry}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Mã tra cứu: req-999");

    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when rows are empty", () => {
    render(
      <DataTable
        caption="Bảng điểm"
        columns={COLUMNS}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyTitle="Chưa có bài làm nào"
      />,
    );

    expect(screen.getByText("Chưa có bài làm nào")).toBeInTheDocument();
  });
});

