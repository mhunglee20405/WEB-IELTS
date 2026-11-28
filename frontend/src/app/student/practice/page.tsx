"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Clock, FileCheck2, Headphones, Layers, PlayCircle, Sparkles } from "lucide-react";
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

  const tests = useMemo(() => {
    const rawItems = catalogQuery.data?.items ?? [];
    return rawItems.filter((test) => {
      if (skillParam && test.skill !== skillParam) return false;
      if (modeParam) {
        const modes =
          Array.isArray(test.allowedModes) && test.allowedModes.length > 0
            ? test.allowedModes
            : ["PART", "FULL"];
        if (!modes.includes(modeParam)) return false;
      }
      if (diffParam) {
        const testDiff = test.difficulty || "TARGET_65";
        if (testDiff !== diffParam) return false;
      }
      if (searchParam) {
        const q = searchParam.toLowerCase();
        const matchTitle = test.title.toLowerCase().includes(q);
        const matchSubtitle = test.subtitle?.toLowerCase().includes(q) ?? false;
        const matchTags = (test.tags ?? []).some((tag) => tag.toLowerCase().includes(q));
        if (!matchTitle && !matchSubtitle && !matchTags) return false;
      }
      return true;
    });
  }, [catalogQuery.data?.items, skillParam, modeParam, diffParam, searchParam]);

  const attempts = recentAttemptsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thư viện luyện thi IELTS"
        subtitle="Chọn đề Reading, Listening, Vocabulary hoặc Grammar để luyện tập và thi thử chuẩn máy tính."
      />

      <FilterToolbar
        tabs={
          <Tabs
            ariaLabel="Lọc theo kỹ năng IELTS"
            items={[
              { id: "ALL", label: "Tất cả" },
              { id: "READING", label: "Reading" },
              { id: "LISTENING", label: "Listening" },
              { id: "VOCABULARY", label: "Vocabulary" },
              { id: "GRAMMAR", label: "Grammar" },
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
            const isQuizSkill = test.skill === "VOCABULARY" || test.skill === "GRAMMAR";
            const minutes = Math.round(test.totalDurationSeconds / 60);
            const skillBadgeClass =
              test.skill === "READING"
                ? "bg-blue-50 text-blue-700"
                : test.skill === "LISTENING"
                  ? "bg-sky-50 text-sky-700"
                  : test.skill === "VOCABULARY"
                    ? "bg-violet-50 text-violet-700"
                    : "bg-teal-50 text-teal-700";
            const skillLabel =
              test.skill === "READING"
                ? "Reading"
                : test.skill === "LISTENING"
                  ? "Listening"
                  : test.skill === "VOCABULARY"
                    ? "Vocabulary"
                    : "Grammar";
            return (
              <Card
                key={test.id}
                className="flex flex-col justify-between gap-4 border-slate-200"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${skillBadgeClass}`}
                    >
                      {test.skill === "READING" ? (
                        <BookOpen className="h-3.5 w-3.5" />
                      ) : test.skill === "LISTENING" ? (
                        <Headphones className="h-3.5 w-3.5" />
                      ) : test.skill === "VOCABULARY" ? (
                        <Sparkles className="h-3.5 w-3.5" />
                      ) : (
                        <FileCheck2 className="h-3.5 w-3.5" />
                      )}
                      {skillLabel}
                    </span>
                    {!isQuizSkill && test.difficulty && (
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
                      {isQuizSkill
                        ? `${test.totalQuestions} câu trắc nghiệm`
                        : `${test.partCount} ${test.skill === "READING" ? "Passage" : "Section"} · ${test.totalQuestions} câu`}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      {minutes > 0 ? `${minutes} phút` : "Không giới hạn"}
                    </span>
                    {!isQuizSkill && test.allowedModes?.includes("PART") && (
                      <Badge variant="info">Part Practice</Badge>
                    )}
                    {!isQuizSkill && test.allowedModes?.includes("FULL") && (
                      <Badge variant="success">Full Test</Badge>
                    )}
                  </div>

                  {test.tags && test.tags.length > 0 && (
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
