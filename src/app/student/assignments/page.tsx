"use client";

import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AssignmentCard } from "@/components/student/assignment-card";
import { PageHeader, QueryState, TabPanel, Tabs, Toolbar, type TabItem } from "@/components/ui";
import { assignmentsApi } from "@/lib/api/endpoints";
import { studentKeys } from "@/lib/api/query-keys";
import type { StudentAssignmentSummary } from "@/lib/api/types";
import { useNowMs } from "@/lib/time/use-now";
import { getZonedDateParts } from "@/lib/time/vn-time";

type AssignmentFilterTab =
  | "all"
  | "today"
  | "open"
  | "upcoming"
  | "passed"
  | "failed"
  | "overdue";

function isPreOpenAssignment(item: StudentAssignmentSummary, nowMs: number): boolean {
  const openMs = new Date(item.openAt).getTime();
  return !Number.isNaN(openMs) && openMs > nowMs;
}

function matchesFilter(
  item: StudentAssignmentSummary,
  filter: AssignmentFilterTab,
  todayKey: string,
  nowMs: number,
): boolean {
  const preOpen = isPreOpenAssignment(item, nowMs);

  switch (filter) {
    case "all":
      return true;
    case "today":
      return item.assignedDate === todayKey;
    case "upcoming":
      return preOpen;
    case "open":
      return !preOpen && !item.passed && item.status !== "overdue";
    case "passed":
      return item.passed || item.status === "passed";
    case "failed":
      return !preOpen && !item.passed && item.attemptsCount > 0 && item.status !== "overdue";
    case "overdue":
      return item.status === "overdue";
  }
}

export default function StudentAssignmentsPage() {
  const tabsPrefix = useId();
  const [activeTab, setActiveTab] = useState<AssignmentFilterTab>("all");
  const nowMs = useNowMs(60_000);
  const todayKey = getZonedDateParts(nowMs).dateKey;

  const assignmentsQuery = useQuery({
    queryKey: studentKeys.assignments("all", "all", 1),
    queryFn: () => assignmentsApi.listMine({ page: 1, limit: 100 }),
  });

  const allItems = useMemo(
    () => assignmentsQuery.data?.items ?? [],
    [assignmentsQuery.data],
  );

  const tabItems: readonly TabItem<AssignmentFilterTab>[] = useMemo(() => {
    const countFor = (filter: AssignmentFilterTab) =>
      allItems.filter((item) => matchesFilter(item, filter, todayKey, nowMs)).length;

    return [
      { id: "all", label: "Tất cả", count: allItems.length },
      { id: "today", label: "Hôm nay", count: countFor("today") },
      { id: "open", label: "Đang mở", count: countFor("open") },
      { id: "upcoming", label: "Sắp mở", count: countFor("upcoming") },
      { id: "passed", label: "Đạt (>=70%)", count: countFor("passed") },
      { id: "failed", label: "Cần làm lại", count: countFor("failed") },
      { id: "overdue", label: "Quá hạn", count: countFor("overdue") },
    ];
  }, [allItems, nowMs, todayKey]);

  const filteredItems = useMemo(
    () => allItems.filter((item) => matchesFilter(item, activeTab, todayKey, nowMs)),
    [allItems, activeTab, nowMs, todayKey],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bài tập IELTS của tôi"
        subtitle="Bài tập chưa đến giờ mở chỉ hiển thị lịch hẹn; bài tập Reading đạt từ 70% sẽ tự động mở đáp án và bài dịch."
      />

      <Toolbar
        tabs={
          <Tabs
            idPrefix={tabsPrefix}
            ariaLabel="Lọc danh sách bài tập"
            items={tabItems}
            value={activeTab}
            onChange={setActiveTab}
          />
        }
      />

      <TabPanel idPrefix={tabsPrefix} value={activeTab} activeValue={activeTab}>
        <QueryState
          isLoading={assignmentsQuery.isLoading}
          isError={assignmentsQuery.isError}
          error={assignmentsQuery.error}
          isEmpty={filteredItems.length === 0}
          onRetry={() => void assignmentsQuery.refetch()}
          loadingLabel="Đang tải danh sách bài tập..."
          emptyTitle="Không có bài tập trong mục này"
          emptyDescription="Bạn có thể chuyển sang tab khác để kiểm tra bài tập đã mở hoặc lịch sắp tới."
        >
          <div className="lms-card-grid">
            {filteredItems.map((item) => (
              <AssignmentCard
                key={item.studentAssignmentId}
                item={item}
                nowMs={nowMs}
              />
            ))}
          </div>
        </QueryState>
      </TabPanel>
    </div>
  );
}

