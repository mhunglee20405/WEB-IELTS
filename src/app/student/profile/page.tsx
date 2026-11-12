"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Info, ShieldAlert, UserCircle2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader, QueryState, StatusBadge } from "@/components/ui";
import { authApi, usersApi } from "@/lib/api/endpoints";
import { ApiError, getFriendlyErrorMessage } from "@/lib/api/error";
import { studentKeys } from "@/lib/api/query-keys";
import {
  ProfileUpdateFormSchema,
  type ProfileUpdateFormValues,
} from "@/lib/api/schemas";
import type { StudentProfile } from "@/lib/api/types";
import { DEFAULT_TIMEZONE } from "@/lib/time/vn-time";

const TIMEZONE_OPTIONS = [
  { value: "Asia/Ho_Chi_Minh", label: "Asia/Ho_Chi_Minh (Việt Nam GMT+7)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok (GMT+7)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (GMT+8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (GMT+9)" },
  { value: "UTC", label: "UTC (Giờ phối hợp quốc tế)" },
] as const;

interface ProfileEditFormProps {
  profile: StudentProfile;
}

function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentTimezone = profile.user.timezone || DEFAULT_TIMEZONE;
  const hasKnownTimezone = TIMEZONE_OPTIONS.some((opt) => opt.value === currentTimezone);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfileUpdateFormValues>({
    resolver: zodResolver(ProfileUpdateFormSchema),
    mode: "onTouched",
    values: {
      fullName: profile.user.fullName,
      timezone: currentTimezone,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProfileUpdateFormValues) =>
      usersApi.update(profile.user.id, {
        fullName: values.fullName.trim(),
        timezone: values.timezone.trim(),
      }),
    onSuccess: async () => {
      setSubmitError(null);
      setSavedMessage("Đã cập nhật thông tin cá nhân thành công.");
      await queryClient.invalidateQueries({ queryKey: studentKeys.profile });
      await refreshUser();
    },
    onError: (err) => {
      setSavedMessage(null);
      if (err instanceof ApiError && err.statusCode === 403) {
        setSubmitError(
          "Tài khoản học viên hiện chỉ được xem thông tin hồ sơ. Vui lòng liên hệ Quản trị viên nếu cần thay đổi họ tên hoặc múi giờ.",
        );
        return;
      }
      setSubmitError(getFriendlyErrorMessage(err));
    },
  });

  const onSubmit = (values: ProfileUpdateFormValues) => {
    setSavedMessage(null);
    setSubmitError(null);
    updateMutation.mutate(values);
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="lms-card space-y-5"
      aria-labelledby="profile-form-heading"
    >
      <div className="space-y-1">
        <h2 id="profile-form-heading" className="text-lg font-semibold text-slate-900">
          Cập nhật thông tin cá nhân
        </h2>
        <p className="text-sm text-slate-600">
          Các trường quyền hạn (vai trò, trạng thái khóa, mục tiêu lớp) do Quản trị viên quản lý.
        </p>
      </div>

      {savedMessage ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden={true} />
          <span>{savedMessage}</span>
        </div>
      ) : null}

      {submitError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden={true} />
          <span>{submitError}</span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="profile-email" className="block text-sm font-medium text-slate-800">
          Email tài khoản
        </label>
        <input
          id="profile-email"
          type="email"
          readOnly
          value={profile.user.email}
          className="lms-input cursor-not-allowed bg-slate-100 text-slate-600"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profile-full-name" className="block text-sm font-medium text-slate-800">
          Họ và tên
        </label>
        <p id="profile-full-name-hint" className="text-xs text-slate-600">
          Hiển thị trên bài nộp, lịch học và thông báo với giáo viên.
        </p>
        <input
          id="profile-full-name"
          type="text"
          autoComplete="name"
          aria-describedby="profile-full-name-hint"
          aria-invalid={errors.fullName ? "true" : undefined}
          className="lms-input"
          {...register("fullName")}
        />
        {errors.fullName ? (
          <p role="alert" className="text-xs font-medium text-red-700">
            {errors.fullName.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profile-timezone" className="block text-sm font-medium text-slate-800">
          Múi giờ hiển thị cá nhân
        </label>
        <p id="profile-timezone-hint" className="text-xs text-slate-600">
          Lịch mở bài tập hàng ngày và hạn nộp chuẩn vẫn được neo cố định theo Asia/Ho_Chi_Minh.
        </p>
        <select
          id="profile-timezone"
          aria-describedby="profile-timezone-hint"
          aria-invalid={errors.timezone ? "true" : undefined}
          className="lms-input"
          {...register("timezone")}
        >
          {!hasKnownTimezone ? (
            <option value={currentTimezone}>{currentTimezone}</option>
          ) : null}
          {TIMEZONE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {errors.timezone ? (
          <p role="alert" className="text-xs font-medium text-red-700">
            {errors.timezone.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={updateMutation.isPending || !isDirty}
          className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateMutation.isPending ? "Đang lưu thay đổi..." : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}

export default function StudentProfilePage() {
  const profileQuery = useQuery({
    queryKey: studentKeys.profile,
    queryFn: () => authApi.getStudentProfile(),
  });

  const profile = profileQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hồ sơ học viên"
        subtitle="Xem thông tin tài khoản, hạn mức gia hạn và cập nhật thông tin hiển thị an toàn."
      />

      <QueryState
        isLoading={profileQuery.isLoading}
        isError={profileQuery.isError}
        error={profileQuery.error}
        onRetry={() => void profileQuery.refetch()}
        loadingLabel="Đang tải hồ sơ học viên..."
      >
        {profile ? (
          <div className="grid gap-6 lg:grid-cols-5">
            <section aria-label="Thông tin học tập tổng hợp" className="space-y-4 lg:col-span-2">
              <article className="lms-card space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-800">
                      <UserCircle2 className="h-7 w-7" aria-hidden={true} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {profile.user.fullName}
                      </h2>
                      <p className="text-xs text-slate-600">{profile.user.email}</p>
                    </div>
                  </div>
                  <StatusBadge status={profile.user.status} />
                </div>

                <dl className="grid gap-3 border-t border-slate-100 pt-3 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-600">Mục tiêu IELTS Band</dt>
                    <dd className="font-semibold text-slate-900">
                      {profile.targetBand ? `Band ${profile.targetBand.toFixed(1)}` : "Chưa đặt"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-600">Khóa học đang tham gia</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {profile.enrolledCoursesCount}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-600">Điểm phạt đang hiệu lực</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {profile.activePenaltiesCount}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-600">Gia hạn đã dùng trong tháng</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {profile.extensionsUsedThisMonth} / {profile.maxExtensionsPerMonth} lượt
                    </dd>
                  </div>
                </dl>

                <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden={true} />
                  <span>
                    Múi giờ chuẩn của hệ thống để khóa/mở bài tập và tính lượt gia hạn hàng tháng là{" "}
                    <strong className="font-semibold text-slate-800">Asia/Ho_Chi_Minh</strong>.
                  </span>
                </div>
              </article>
            </section>

            <div className="lg:col-span-3">
              <ProfileEditForm profile={profile} />
            </div>
          </div>
        ) : null}
      </QueryState>
    </div>
  );
}

