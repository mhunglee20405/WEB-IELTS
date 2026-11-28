import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Badge, Button, MetaTag, Pagination, SearchInput, StatusBadge, Toolbar } from "./index";

describe("LMS Design System UI Primitives", () => {
  it("hides interactive pagination controls when totalPages <= 1 while keeping item count", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={1} totalItems={2} onPageChange={onPageChange} />);

    expect(screen.queryByRole("navigation", { name: "Phân trang" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trang trước" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trang sau" })).not.toBeInTheDocument();
    expect(screen.getByText(/Hiển thị toàn bộ/i)).toHaveTextContent("Hiển thị toàn bộ 2 mục");
  });

  it("renders interactive pagination controls when totalPages > 1", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={3} totalItems={30} onPageChange={onPageChange} />);

    expect(screen.getByRole("navigation", { name: "Phân trang" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("renders SearchInput with role=search, ignores IME Enter, commits non-IME Enter, and clears", () => {
    const onChange = vi.fn();
    render(
      <Toolbar>
        <SearchInput value="" onChange={onChange} placeholder="Tìm khóa học..." debounceMs={200} />
      </Toolbar>,
    );

    const searchLandmark = screen.getByRole("search");
    expect(searchLandmark).toBeInTheDocument();

    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "C01" } });

    // During IME composition Enter must NOT commit
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();

    // Non-IME Enter commits immediately
    fireEvent.keyDown(input, { key: "Enter", isComposing: false });
    expect(onChange).toHaveBeenCalledWith("C01");

    fireEvent.click(screen.getByRole("button", { name: "Xóa từ khóa tìm kiếm" }));
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("separates pill StatusBadge with status dot from rounded-md MetaTag and button variants", () => {
    render(
      <div>
        <MetaTag variant="code">C01-IELTS</MetaTag>
        <Badge variant="format">Lớp nhóm</Badge>
        <StatusBadge status="active" />
        <Button variant="primary">Tạo mới</Button>
        <Button variant="soft">Quản lý học viên</Button>
        <Button variant="ghost">Chỉnh sửa</Button>
      </div>,
    );

    expect(screen.getByText("C01-IELTS").className).toContain("rounded-md");
    expect(screen.getByText("Lớp nhóm").className).toContain("rounded-md");
    expect(screen.getByText("Đang hoạt động").parentElement?.className).toContain("rounded-full");
    expect(screen.getByRole("button", { name: "Tạo mới" }).className).toContain("bg-blue-700");
    expect(screen.getByRole("button", { name: "Quản lý học viên" }).className).toContain("bg-blue-50");
  });
});

