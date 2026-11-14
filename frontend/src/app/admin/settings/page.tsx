"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, ShieldCheck } from "lucide-react";
import { buttonVariants, PageHeader, StatusBadge } from "@/components/ui";
import { healthApi } from "@/lib/api/endpoints";
import { adminKeys } from "@/lib/api/query-keys";
import {
  MAX_EXTENSIONS_PER_MONTH,
  PASS_SCORE_THRESHOLD,
} from "@/lib/api/types";
import { env } from "@/lib/env";
import { DEFAULT_TIMEZONE, formatVnDateTime } from "@/lib/time/vn-time";

export default function AdminSettingsPage() {
  const healthQuery = useQuery({
    queryKey: adminKeys.health,
    queryFn: async () => {
      const [live, ready] = await Promise.allSettled([
        healthApi.live(),
        healthApi.ready(),
      ]);
      return {
        live: live.status === "fulfilled" ? live.value : null,
        ready: ready.status === "fulfilled" ? ready.value : null,
      };
    },
  });

  const live = healthQuery.data?.live;
  const ready = healthQuery.data?.ready;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cấu hình & Sức khỏe hệ thống"
        subtitle="Theo dõi trạng thái backend (/health/live, /health/ready) và các tham số quy chế học vụ."
        actions={
          <button
            type="button"
            disabled={healthQuery.isFetching}
            onClick={() => void healthQuery.refetch()}
            className={buttonVariants({ variant: "secondary" })}
          >
            <RefreshCw
              className={`h-4 w-4 ${healthQuery.isFetching ? "animate-spin" : ""}`}
              aria-hidden={true}
            />
            Kiểm tra lại trạng thái
          </button>
        }
      />

      <section
        aria-label="Trạng thái máy chủ backend"
        className="lms-card-grid"
      >
        <div className="lms-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <Activity className="h-4 w-4 text-blue-700" aria-hidden={true} />
              Liveness Probe (/health/live)
            </h2>
            <StatusBadge
              status={live?.status === "ok" ? "active" : "suspended"}
              labelOverride={
                healthQuery.isLoading
                  ? "Đang kiểm tra"
                  : live?.status === "ok"
                    ? "Hoạt động (OK)"
                    : "Mất kết nối"
              }
            />
          </div>
          <dl className="space-y-1 text-xs text-slate-600">
            <div>
              Phiên bản:{" "}
              <strong className="text-slate-900">{live?.version ?? "—"}</strong>
            </div>
            <div>
              Kiểm tra lúc:{" "}
              <strong className="text-slate-900">
                {live?.timestamp ? formatVnDateTime(live.timestamp) : "—"}
              </strong>
            </div>
          </dl>
        </div>

        <div className="lms-card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden={true} />
              Readiness Probe (/health/ready)
            </h2>
            <StatusBadge
              status={ready?.status === "ok" ? "active" : "suspended"}
              labelOverride={
                healthQuery.isLoading
                  ? "Đang kiểm tra"
                  : ready?.status === "ok"
                    ? "Sẵn sàng (READY)"
                    : "Chưa sẵn sàng"
              }
            />
          </div>
          <dl className="space-y-1 text-xs text-slate-600">
            <div>
              Chế độ API Frontend:{" "}
              <strong className="uppercase text-slate-900">{env.NEXT_PUBLIC_API_MODE}</strong>
            </div>
            <div>
              Endpoint Base:{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">
                {env.NEXT_PUBLIC_API_BASE_URL}
              </code>
            </div>
          </dl>
        </div>
      </section>

      <section className="lms-card space-y-4">
        <h2 className="text-lg font-semibold text-slate-950">
          Quy chế học vụ hệ thống (Đồng bộ Backend)
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs font-medium text-slate-600">Múi giờ chuẩn hệ thống</dt>
            <dd className="mt-1 font-semibold text-slate-950">
              {DEFAULT_TIMEZONE} (GMT+7)
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs font-medium text-slate-600">Cửa sổ bài tập hằng ngày</dt>
            <dd className="mt-1 font-semibold text-slate-950">00:00 – 23:59 giờ Việt Nam</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs font-medium text-slate-600">Ngưỡng qua bài &amp; mở đáp án</dt>
            <dd className="mt-1 font-semibold text-slate-950 tabular-nums">
              Từ {PASS_SCORE_THRESHOLD}% trở lên
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs font-medium text-slate-600">Hạn mức xin gia hạn</dt>
            <dd className="mt-1 font-semibold text-slate-950 tabular-nums">
              {MAX_EXTENSIONS_PER_MONTH} lượt / tháng / học viên
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs font-medium text-slate-600">Quy tắc phạt quá hạn</dt>
            <dd className="mt-1 font-semibold text-slate-950">+1 điểm / ngày quá hạn</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs font-medium text-slate-600">Giới hạn khóa học 1:1</dt>
            <dd className="mt-1 font-semibold text-slate-950">
              Tối đa 1 học viên hoạt động
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
