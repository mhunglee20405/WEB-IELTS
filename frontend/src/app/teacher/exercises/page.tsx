"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FilePlus2, Headphones, BookOpen, Pencil } from "lucide-react";
import {
  buttonVariants,
  DataTable,
  MetaTag,
  PageHeader,
  Pagination,
  QueryState,
  SearchInput,
  StatusBadge,
  Tabs,
  Toolbar,
  type DataTableColumn,
  type TabItem,
} from "@/components/ui";
import { exercisesApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";
import type { ExerciseAuthoringDetail } from "@/lib/api/types";

type StatusFilter = "all" | "draft" | "published" | "archived";

const STATUS_TABS: readonly TabItem<StatusFilter>[] = [
  { id: "all", label: "Tất cả" },
  { id: "published", label: "Đã xuất bản" },
  { id: "draft", label: "Bản nháp" },
  { id: "archived", label: "Lưu trữ" },
];

export default function TeacherExercisesPage() {
  const tabsPrefix = useId();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: teacherKeys.exercises(typeFilter, statusFilter, searchTerm, page),
    queryFn: () =>
      exercisesApi.list({
        type: typeFilter === "all" ? undefined : typeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchTerm || undefined,
        page,
        limit: 12,
      }),
    placeholderData: keepPreviousData,
  });

  const exercises = query.data?.items ?? [];

  const columns: DataTableColumn<ExerciseAuthoringDetail>[] = [
    {
      key: "title",
      header: "Tiêu đề bài tập",
      renderCell: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.title}</p>
          <p className="text-xs text-slate-700">{row.questions.length} câu hỏi</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Kỹ năng",
      renderCell: (row) => (
        <MetaTag variant={row.type === "listening" ? "info" : "accent"}>
          {row.type === "listening" ? (
            <Headphones className="h-3.5 w-3.5" aria-hidden={true} />
          ) : (
            <BookOpen className="h-3.5 w-3.5" aria-hidden={true} />
          )}
          {row.type === "listening" ? "Listening" : "Reading"}
        </MetaTag>
      ),
    },
    {
      key: "version",
      header: "Phiên bản",
      renderCell: (row) => <MetaTag variant="code">v{row.version}</MetaTag>,
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "Thao tác",
      align: "end",
      renderCell: (row) => (
        <Link
          href={`/teacher/exercises/${encodeURIComponent(row.id)}/edit`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden={true} />
          {row.status === "published" ? "Xem / Tạo bản mới" : "Chỉnh sửa"}
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ngân hàng đề Reading & Listening"
        subtitle="Soạn thảo, xuất bản và quản lý phiên bản bất biến cho bài tập hằng ngày."
        actions={
          <Link
            href="/teacher/exercises/new"
            className={buttonVariants({ variant: "primary" })}
          >
            <FilePlus2 className="h-4 w-4" aria-hidden={true} />
            Tạo đề mới
          </Link>
        }
      />

      <Toolbar
        tabs={
          <Tabs
            idPrefix={tabsPrefix}
            ariaLabel="Lọc trạng thái đề"
            items={STATUS_TABS}
            value={statusFilter}
            hasPanels={false}
            onChange={(next) => {
              setStatusFilter(next);
              setPage(1);
            }}
          />
        }
      >
        <select
          aria-label="Lọc kỹ năng"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tất cả kỹ năng</option>
          <option value="reading">Reading</option>
          <option value="listening">Listening</option>
        </select>

        <SearchInput
          id="ex-search"
          label="Tìm kiếm bài tập"
          placeholder="Tìm tiêu đề đề..."
          value={searchTerm}
          onChange={(next) => {
            setSearchTerm(next.trim());
            setPage(1);
          }}
        />
      </Toolbar>

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Đang tải ngân hàng đề..."
      >
        <DataTable
          caption={`Danh sách bài tập (${query.data?.total ?? exercises.length})`}
          columns={columns}
          rows={exercises}
          getRowKey={(row) => row.id}
          emptyTitle="Chưa có bài tập nào phù hợp"
          emptyDescription="Tạo đề mới hoặc thay đổi bộ lọc trạng thái/kỹ năng."
        />

        {query.data ? (
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            totalItems={query.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </QueryState>
    </div>
  );
}
