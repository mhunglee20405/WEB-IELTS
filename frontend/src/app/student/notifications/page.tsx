"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookPlus,
  Check,
  Clock,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buttonVariants,
  PageHeader,
  Pagination,
  QueryState,
  TabPanel,
  Tabs,
  Toolbar,
  type TabItem,
} from "@/components/ui";
import { notificationsApi } from "@/lib/api/endpoints";
import { studentKeys } from "@/lib/api/query-keys";
import type { NotificationType } from "@/lib/api/types";
import { sanitizeNextPath } from "@/lib/auth/roles";
import { formatVnDateTime } from "@/lib/time/vn-time";
import { cn } from "@/lib/utils/cn";

type NotificationReadFilter = "all" | "unread" | "read";

const NOTIFICATION_TABS: readonly TabItem<NotificationReadFilter>[] = [
  { id: "all", label: "Tất cả" },
  { id: "unread", label: "Chưa đọc" },
  { id: "read", label: "Đã đọc" },
];

const NOTIFICATION_META: Record<
  NotificationType,
  {
    label: string;
    badgeClasses: string;
    Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  }
> = {
  assignment_new: {
    label: "Bài tập mới",
    badgeClasses: "bg-blue-50 text-blue-900",
    Icon: FileText,
  },
  overdue: {
    label: "Cảnh báo quá hạn",
    badgeClasses: "bg-red-50 text-red-900",
    Icon: AlertTriangle,
  },
  course_added: {
    label: "Ghi danh lớp",
    badgeClasses: "bg-emerald-50 text-emerald-900",
    Icon: BookPlus,
  },
  extension_decided: {
    label: "Kết quả gia hạn",
    badgeClasses: "bg-amber-50 text-amber-900",
    Icon: Clock,
  },
};

export default function StudentNotificationsPage() {
  const tabsPrefix = useId();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<NotificationReadFilter>("all");
  const [page, setPage] = useState(1);

  const notificationsQuery = useQuery({
    queryKey: studentKeys.notificationsList(filter, page),
    queryFn: () =>
      notificationsApi.list({
        read: filter === "unread" ? false : filter === "read" ? true : undefined,
        page,
        limit: 20,
      }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentKeys.notificationsRoot }),
        queryClient.invalidateQueries({ queryKey: studentKeys.dashboard }),
      ]);
    },
  });

  const items = notificationsQuery.data?.items ?? [];
  const totalPages = notificationsQuery.data?.totalPages ?? 1;
  const totalItems = notificationsQuery.data?.total ?? 0;
  const currentPage = notificationsQuery.data?.page ?? page;

  const handleTabChange = (nextFilter: NotificationReadFilter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thông báo"
        subtitle="Theo dõi thông báo giao bài tập, cảnh báo quá hạn, ghi danh lớp và quyết định gia hạn."
      />

      <Toolbar
        tabs={
          <Tabs
            idPrefix={tabsPrefix}
            ariaLabel="Lọc thông báo"
            items={NOTIFICATION_TABS}
            value={filter}
            onChange={handleTabChange}
          />
        }
      />

      <TabPanel idPrefix={tabsPrefix} value={filter} activeValue={filter} className="space-y-4">
        <QueryState
          isLoading={notificationsQuery.isLoading}
          isError={notificationsQuery.isError}
          error={notificationsQuery.error}
          isEmpty={items.length === 0}
          onRetry={() => void notificationsQuery.refetch()}
          loadingLabel="Đang tải thông báo..."
          emptyTitle="Không có thông báo nào"
          emptyDescription={
            filter === "unread"
              ? "Bạn đã đọc hết toàn bộ thông báo."
              : "Chưa có thông báo nào được ghi nhận trong mục này."
          }
        >
          <ul className="space-y-3">
            {items.map((item) => {
              const typeConfig = NOTIFICATION_META[item.type] ?? {
                label: "Thông báo",
                badgeClasses: "bg-slate-100 text-slate-800",
                Icon: Bell,
              };
              const TypeIcon = typeConfig.Icon;
              const safeTargetPath = item.targetUrl
                ? sanitizeNextPath(item.targetUrl, ["student"])
                : null;
              const isMarkingThis =
                markReadMutation.isPending && markReadMutation.variables === item.id;

              return (
                <li key={item.id}>
                  <article
                    className={cn(
                      "lms-card lms-card-split",
                      !item.read && "border-blue-300 bg-blue-50/30",
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
                            typeConfig.badgeClasses,
                          )}
                        >
                          <TypeIcon className="h-3.5 w-3.5" aria-hidden={true} />
                          {typeConfig.label}
                        </span>
                        {!item.read ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-900">
                            <span className="h-2 w-2 rounded-full bg-blue-700" aria-hidden={true} />
                            Chưa đọc
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-700">Đã đọc</span>
                        )}
                        <time
                          dateTime={item.createdAt}
                          className="text-xs text-slate-700"
                        >
                          {formatVnDateTime(item.createdAt)}
                        </time>
                      </div>

                      <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                      <p className="text-sm text-slate-700">{item.message}</p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {!item.read ? (
                        <button
                          type="button"
                          disabled={isMarkingThis}
                          onClick={() => markReadMutation.mutate(item.id)}
                          className={buttonVariants({ variant: "secondary", size: "sm" })}
                        >
                          <Check className="h-4 w-4 text-emerald-700" aria-hidden={true} />
                          {isMarkingThis ? "Đang cập nhật..." : "Đánh dấu đã đọc"}
                          <span className="sr-only">: {item.title}</span>
                        </button>
                      ) : null}

                      {safeTargetPath ? (
                        <Link
                          href={safeTargetPath}
                          className={buttonVariants({ variant: "soft", size: "sm" })}
                        >
                          Xem chi tiết
                          <ArrowRight className="h-4 w-4" aria-hidden={true} />
                          <span className="sr-only">: {item.title}</span>
                        </Link>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>

          <Pagination
            page={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            onPageChange={setPage}
          />
        </QueryState>
      </TabPanel>
    </div>
  );
}
