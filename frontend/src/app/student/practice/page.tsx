"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Clock, Headphones, Layers, PlayCircle } from "lucide-react";
import {
  Badge,
  Card,
  FilterToolbar,
  PageHeader,
  QueryState,
  SearchInput,
  StatusBadge,
  Tabs,
} from "@/components/ui";
import { examAttemptsApi, examTestsApi } from "@/lib/api/endpoints";
import { examKeys } from "@/lib/api/query-keys";
import type { ExamMode, ExamSkill } from "@/lib/api/types";

type SkillTab = "ALL" | ExamSkill;

const DIFFICULTY_LABELS: Record<string, string> = {
  FOUNDATION: "Nền tảng (5.0–5.5)",
  INTERMEDIATE: "Trung cấp (6.0)",
  TARGET_65: "Mục tiêu 6.5",
  TARGET_75_PLUS: "Nâng cao 7.5+",
};

export default function StudentPracticeLibraryPage() {
  const [skillTab, setSkillTab] = useState<SkillTab>("ALL");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [modeFilter, setModeFilter] = useState<"" | ExamMode>("");

  const skillParam = skillTab === "ALL" ? undefined : skillTab;
  const modeParam = modeFilter || undefined;
  const diffParam = difficulty || undefined;
  const searchParam = search.trim() || undefined;

  const catalogQuery = useQuery({
    queryKey: examKeys.catalog(skillParam, modeParam, searchParam, diffParam),
    queryFn: () =>
      examTestsApi.list({
        skill: skillParam,
        mode: modeParam,
        difficulty: diffParam,
        search: searchParam,
        limit: 50,
      }),
  });

  const recentAttemptsQuery = useQuery({
    queryKey: examKeys.attemptList(undefined, undefined),
    queryFn: () => examAttemptsApi.list({ page: 1, limit: 5 }),
  });

  const tests = catalogQuery.data?.items ?? [];
  const attempts = recentAttemptsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thư viện luyện thi IELTS"
        subtitle="Chọn đề Reading hoặc Listening theo từng phần (Part Practice) hoặc thi trọn bộ (Full Test) chuẩn máy tính."
      />

      <FilterToolbar
        tabs={
          <Tabs
            ariaLabel="Lọc theo kỹ năng IELTS"
            items={[
              { id: "ALL", label: "Tất cả kỹ năng" },
              { id: "READING", label: "IELTS Reading" },
              { id: "LISTENING", label: "IELTS Listening" },
            ]}
            value={skillTab}
            hasPanels={false}
            onChange={(id) => setSkillTab(id as SkillTab)}
          />
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm theo tên đề, chủ đề..."
        />
        <select
          aria-label="Lọc theo chế độ"
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value as "" | ExamMode)}
          className="lms-input h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"
        >
          <option value="">Tất cả chế độ</option>
          <option value="PART">Hỗ trợ luyện từng Part</option>
          <option value="FULL">Hỗ trợ Full Test</option>
        </select>
        <select
          aria-label="Lọc theo độ khó"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="lms-input h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"
        >
          <option value="">Mọi trình độ</option>
          <option value="FOUNDATION">Nền tảng (5.0–5.5)</option>
          <option value="INTERMEDIATE">Trung cấp (6.0)</option>
          <option value="TARGET_65">Mục tiêu 6.5</option>
          <option value="TARGET_75_PLUS">Nâng cao 7.5+</option>
        </select>
      </FilterToolbar>

      <QueryState
        isLoading={catalogQuery.isLoading}
        isError={catalogQuery.isError}
        error={catalogQuery.error}
        isEmpty={tests.length === 0}
        emptyTitle="Chưa có đề thi phù hợp"
        emptyDescription="Thử bỏ bộ lọc hoặc chuyển tab kỹ năng khác."
        onRetry={() => void catalogQuery.refetch()}
      >
        <div className="lms-card-grid">
          {tests.map((test) => {
            const minutes = Math.max(1, Math.round(test.totalDurationSeconds / 60));
            return (
              <Card
                key={test.id}
                className="flex flex-col justify-between gap-4 border-slate-200"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {test.skill === "READING" ? (
                        <BookOpen className="h-3.5 w-3.5" />
                      ) : (
                        <Headphones className="h-3.5 w-3.5" />
                      )}
                      {test.skill === "READING" ? "Reading" : "Listening"}
                    </span>
                    {test.difficulty && (
                      <Badge variant="neutral">
                        {DIFFICULTY_LABELS[test.difficulty] ?? test.difficulty}
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h2 className="text-base font-bold text-slate-900">{test.title}</h2>
                    {test.subtitle && (
                      <p className="mt-1 text-xs text-slate-600">{test.subtitle}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-medium">
                      <Layers className="h-3.5 w-3.5" />
                      {test.partCount}{" "}
                      {test.skill === "READING" ? "Passage" : "Section"} ·{" "}
                      {test.totalQuestions} câu
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      {minutes} phút
                    </span>
                    {test.allowedModes.includes("PART") && (
                      <Badge variant="info">Part Practice</Badge>
                    )}
                    {test.allowedModes.includes("FULL") && (
                      <Badge variant="success">Full Test</Badge>
                    )}
                  </div>

                  {test.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {test.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end border-t border-slate-100 pt-3">
                  <Link
                    href={`/student/practice/${encodeURIComponent(test.id)}`}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Chọn chế độ &amp; Làm bài
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </QueryState>

      {attempts.length > 0 && (
        <section aria-label="Lịch sử làm bài gần đây" className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">
            Lượt thi gần đây của bạn
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="lms-table w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Đề thi</th>
                  <th className="px-4 py-3">Chế độ</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Điểm</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.map((item) => (
                  <tr key={item.attemptId}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.testTitle}</p>
                      {item.partTitle && (
                        <p className="text-xs text-slate-500">{item.partTitle}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">
                        {item.mode === "FULL" ? "Full Test" : "Part"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={
                          item.status === "IN_PROGRESS"
                            ? "in_progress"
                            : item.passed
                              ? "passed"
                              : "submitted"
                        }
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {item.scorePercent !== null && item.scorePercent !== undefined
                        ? `${item.scorePercent}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={
                          item.status === "IN_PROGRESS"
                            ? `/student/exam/${encodeURIComponent(item.attemptId)}`
                            : `/student/exam/${encodeURIComponent(item.attemptId)}/result`
                        }
                        className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        {item.status === "IN_PROGRESS" ? "Tiếp tục" : "Xem kết quả"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
