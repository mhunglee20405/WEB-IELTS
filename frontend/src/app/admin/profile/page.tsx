"use client";

import { useState, useId, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { PageHeader, StatusBadge, buttonVariants } from "@/components/ui";
import { authApi, usersApi } from "@/lib/api/endpoints";
import { formatVnDateTime } from "@/lib/time/vn-time";
import {
  User,
  Mail,
  Lock,
  Phone,
  Shield,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  KeyRound,
  ShieldAlert,
} from "lucide-react";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_\-])[A-Za-z\d@$!%*?&#^_\-]{8,}$/;

export default function AdminProfilePage() {
  const { user, refreshUser, logout } = useAuth();

  // Basic Profile Form state
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Email Change Form state
  const [newEmail, setNewEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [showEmailCurrentPassword, setShowEmailCurrentPassword] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password Change Form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Accessible IDs
  const fullNameId = useId();
  const phoneId = useId();
  const newEmailId = useId();
  const emailPasswordId = useId();
  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  // Handlers
  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setProfileError("Họ và tên phải có ít nhất 2 ký tự.");
      return;
    }

    setProfileSaving(true);
    try {
      await usersApi.updateOwnProfile({
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
      });
      await refreshUser();
      setProfileSuccess("Cập nhật thông tin hồ sơ thành công!");
    } catch (err: any) {
      setProfileError(err?.message || "Không thể cập nhật hồ sơ. Vui lòng thử lại.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    const targetEmail = newEmail.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes("@")) {
      setEmailError("Vui lòng nhập định dạng email hợp lệ.");
      return;
    }

    if (targetEmail === user?.email.toLowerCase()) {
      setEmailError("Email mới không được trùng với email hiện tại.");
      return;
    }

    if (!emailCurrentPassword) {
      setEmailError("Vui lòng nhập mật khẩu hiện tại để xác thực thay đổi.");
      return;
    }

    setEmailSaving(true);
    try {
      const res = await authApi.changeEmail({
        newEmail: targetEmail,
        currentPassword: emailCurrentPassword,
      });
      await refreshUser();
      setEmailSuccess(res.message || "Đã đổi địa chỉ email đăng nhập thành công!");
      setNewEmail("");
      setEmailCurrentPassword("");
    } catch (err: any) {
      setEmailError(err?.message || "Không thể đổi email. Vui lòng kiểm tra lại mật khẩu hiện tại.");
    } finally {
      setEmailSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Vui lòng nhập mật khẩu hiện tại.");
      return;
    }

    if (!PASSWORD_REGEX.test(newPassword)) {
      setPasswordError(
        "Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ít nhất một ký tự đặc biệt (@$!%*?&#^_-).",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError("Mật khẩu mới không được trùng với mật khẩu hiện tại.");
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await authApi.changePassword({
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(
        `${res.message || "Đổi mật khẩu thành công!"} Đang chuyển hướng sang trang đăng nhập...`,
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Secure invalidation policy: Log out and redirect after brief delay
      setTimeout(() => {
        void logout();
      }, 2000);
    } catch (err: any) {
      setPasswordError(err?.message || "Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.");
      setPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hồ sơ Quản trị viên"
        subtitle="Quản lý thông tin tài khoản, cập nhật email đăng nhập và bảo mật mật khẩu hệ thống."
      />

      {/* Account Overview Card */}
      <section
        aria-labelledby="account-overview-heading"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Shield className="h-5 w-5" aria-hidden={true} />
          </div>
          <div>
            <h2 id="account-overview-heading" className="text-base font-bold text-slate-900">
              Tổng quan Tài khoản
            </h2>
            <p className="text-xs text-slate-500">Thông tin định danh và vai trò trong hệ thống WEB-IELTS</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Họ và tên</span>
            <p className="text-sm font-semibold text-slate-900">{user?.fullName || "—"}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Email đăng nhập</span>
            <p className="text-sm font-semibold text-slate-900">{user?.email || "—"}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Số điện thoại</span>
            <p className="text-sm font-semibold text-slate-900">{user?.phone || "Chưa cập nhật"}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Vai trò & Trạng thái</span>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                Quản trị viên
              </span>
              <StatusBadge status={user?.status || "active"} />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Ngày tạo tài khoản</span>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden={true} />
              {user?.createdAt ? formatVnDateTime(user.createdAt) : "—"}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Cập nhật lần cuối</span>
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden={true} />
              {user?.updatedAt ? formatVnDateTime(user.updatedAt) : "—"}
            </p>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-slate-500">Múi giờ vận hành</span>
            <p className="text-xs font-medium text-slate-700">GMT+7 (Asia/Ho_Chi_Minh)</p>
          </div>
        </div>
      </section>

      {/* Forms Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Basic Profile Editing */}
        <section
          aria-labelledby="basic-profile-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <User className="h-5 w-5" aria-hidden={true} />
            </div>
            <div>
              <h2 id="basic-profile-heading" className="text-base font-bold text-slate-900">
                Thông tin Cá nhân
              </h2>
              <p className="text-xs text-slate-500">Cập nhật họ tên hiển thị và số điện thoại liên hệ</p>
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="mt-6 space-y-4">
            {profileSuccess ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{profileSuccess}</span>
              </div>
            ) : null}

            {profileError ? (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{profileError}</span>
              </div>
            ) : null}

            <div>
              <label htmlFor={fullNameId} className="block text-xs font-semibold text-slate-700">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id={fullNameId}
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nhập họ và tên đầy đủ"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor={phoneId} className="block text-xs font-semibold text-slate-700">
                Số điện thoại liên hệ
              </label>
              <div className="relative mt-1.5">
                <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id={phoneId}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ví dụ: 0901234567"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={profileSaving}
                className={buttonVariants({ variant: "primary", className: "w-full justify-center" })}
              >
                <Save className="h-4 w-4" />
                {profileSaving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </section>

        {/* Change Login Email */}
        <section
          aria-labelledby="change-email-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Mail className="h-5 w-5" aria-hidden={true} />
            </div>
            <div>
              <h2 id="change-email-heading" className="text-base font-bold text-slate-900">
                Đổi Email Đăng nhập
              </h2>
              <p className="text-xs text-slate-500">Cập nhật danh tính đăng nhập kèm xác nhận mật khẩu</p>
            </div>
          </div>

          <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
            {emailSuccess ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{emailSuccess}</span>
              </div>
            ) : null}

            {emailError ? (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{emailError}</span>
              </div>
            ) : null}

            <div>
              <span className="block text-xs font-semibold text-slate-500">Email hiện tại (đang sử dụng)</span>
              <p className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-600">
                {user?.email || "—"}
              </p>
            </div>

            <div>
              <label htmlFor={newEmailId} className="block text-xs font-semibold text-slate-700">
                Email đăng nhập mới <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id={newEmailId}
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin.moi@example.com"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor={emailPasswordId} className="block text-xs font-semibold text-slate-700">
                Mật khẩu xác nhận thay đổi email <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id={emailPasswordId}
                  type={showEmailCurrentPassword ? "text" : "password"}
                  required
                  value={emailCurrentPassword}
                  onChange={(e) => setEmailCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại của bạn"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                />
                <button
                  type="button"
                  onClick={() => setShowEmailCurrentPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showEmailCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Yêu cầu nhập mật khẩu để đảm bảo an toàn tuyệt đối khi đổi email đăng nhập.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={emailSaving}
                className={buttonVariants({ variant: "secondary", className: "w-full justify-center" })}
              >
                <KeyRound className="h-4 w-4" />
                {emailSaving ? "Đang xử lý..." : "Cập nhật Email"}
              </button>
            </div>
          </form>
        </section>

        {/* Change Password Card (Full width on large screens) */}
        <section
          aria-labelledby="change-password-heading"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <Lock className="h-5 w-5" aria-hidden={true} />
            </div>
            <div>
              <h2 id="change-password-heading" className="text-base font-bold text-slate-900">
                Đổi Mật khẩu Tài khoản
              </h2>
              <p className="text-xs text-slate-500">
                Mật khẩu mới bảo vệ bằng Argon2id. Khi đổi thành công, mọi phiên làm việc khác sẽ tự động bị đóng.
              </p>
            </div>
          </div>

          <form onSubmit={handlePasswordSubmit} className="mt-6 space-y-4">
            {passwordSuccess ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <span>{passwordSuccess}</span>
              </div>
            ) : null}

            {passwordError ? (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3.5 text-sm font-medium text-red-800">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                <span>{passwordError}</span>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Current Password */}
              <div>
                <label htmlFor={currentPasswordId} className="block text-xs font-semibold text-slate-700">
                  Mật khẩu đăng nhập hiện tại <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id={currentPasswordId}
                    type={showCurrentPassword ? "text" : "password"}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Mật khẩu hiện tại"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label htmlFor={newPasswordId} className="block text-xs font-semibold text-slate-700">
                  Mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id={newPasswordId}
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Tối thiểu 8 ký tự"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor={confirmPasswordId} className="block text-xs font-semibold text-slate-700">
                  Xác nhận mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id={confirmPasswordId}
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                <span>Tiêu chuẩn bảo mật mật khẩu:</span>
              </div>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-slate-500">
                <li>Tối thiểu 8 ký tự, tối đa 64 ký tự.</li>
                <li>Bao gồm ít nhất: 1 chữ hoa, 1 chữ thường, 1 chữ số, 1 ký tự đặc biệt (@$!%*?&#^_-).</li>
                <li>Không được sử dụng lại mật khẩu hiện tại.</li>
              </ul>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={passwordSaving}
                className={buttonVariants({ variant: "danger", className: "w-full sm:w-auto px-6" })}
              >
                <Lock className="h-4 w-4" />
                {passwordSaving ? "Đang cập nhật mật khẩu..." : "Xác nhận đổi mật khẩu"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
