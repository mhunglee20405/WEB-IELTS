"use client";

import { useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Pencil, UserPlus } from "lucide-react";
import {
  buttonVariants,
  DataTable,
  MetaTag,
  ModalDialog,
  PageHeader,
  Pagination,
  QueryState,
  SearchInput,
  StatusBadge,
  Toolbar,
  type DataTableColumn,
} from "@/components/ui";
import { usersApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { adminKeys } from "@/lib/api/query-keys";
import { CreateUserFormSchema, UpdateUserFormSchema } from "@/lib/api/schemas";
import type { AuthUser, UserRole, UserStatus } from "@/lib/api/types";
import { getRoleLabelVi } from "@/lib/auth/roles";
import { DEFAULT_TIMEZONE } from "@/lib/time/vn-time";

const ALL_ROLES: UserRole[] = ["student", "teacher", "admin"];

function CreateUserForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<UserRole[]>(["student"]);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.usersRoot });
      onSuccess(`Đã tạo tài khoản "${created.fullName}" (${created.email}).`);
      onClose();
    },
  });

  const toggleRole = (role: UserRole) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = CreateUserFormSchema.safeParse({
      email,
      fullName,
      password,
      roles,
      timezone: DEFAULT_TIMEZONE,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Thông tin tài khoản chưa hợp lệ.");
      return;
    }
    setFieldError(null);
    mutation.mutate(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {fieldError ? (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {fieldError}
        </div>
      ) : null}

      {mutation.isError ? (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {getFriendlyErrorMessage(mutation.error)}
        </div>
      ) : null}

      <div>
        <label htmlFor="new-user-name" className="block text-sm font-medium text-slate-900">
          Họ và tên <span className="text-red-700">*</span>
        </label>
        <input
          id="new-user-name"
          type="text"
          autoFocus
          autoComplete="off"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nguyễn Văn A"
          className="lms-input mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="new-user-email" className="block text-sm font-medium text-slate-900">
          Email đăng nhập <span className="text-red-700">*</span>
        </label>
        <input
          id="new-user-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nguoidung@ielts.vn"
          className="lms-input mt-1.5"
        />
      </div>

      <div>
        <label htmlFor="new-user-pass" className="block text-sm font-medium text-slate-900">
          Mật khẩu ban đầu <span className="text-red-700">*</span>
        </label>
        <input
          id="new-user-pass"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tối thiểu 8 ký tự"
          className="lms-input mt-1.5"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-900">Vai trò truy cập</legend>
        <div className="flex flex-wrap gap-3">
          {ALL_ROLES.map((role) => (
            <label key={role} className="lms-choice-label">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              <span className="text-sm font-medium text-slate-900">
                {getRoleLabelVi(role)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {mutation.isPending ? "Đang tạo..." : "Tạo tài khoản"}
        </button>
      </div>
    </form>
  );
}

function EditUserForm({
  target,
  onClose,
  onSuccess,
}: {
  target: AuthUser;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(target.fullName);
  const [roles, setRoles] = useState<UserRole[]>(target.roles);
  const [status, setStatus] = useState<UserStatus>(target.status);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof usersApi.update>[1]) =>
      usersApi.update(target.id, payload),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.usersRoot });
      onSuccess(`Đã cập nhật tài khoản "${updated.fullName}".`);
      onClose();
    },
  });

  const toggleRole = (role: UserRole) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = UpdateUserFormSchema.safeParse({
      fullName,
      roles,
      status,
      timezone: target.timezone || DEFAULT_TIMEZONE,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Dữ liệu cập nhật chưa hợp lệ.");
      return;
    }
    setFieldError(null);
    mutation.mutate(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {fieldError ? (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {fieldError}
        </div>
      ) : null}

      {mutation.isError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{getFriendlyErrorMessage(mutation.error)}</span>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium text-slate-600">
          Email: <span className="font-semibold text-slate-900">{target.email}</span>
        </p>
      </div>

      <div>
        <label htmlFor="edit-user-name" className="block text-sm font-medium text-slate-900">
          Họ và tên <span className="text-red-700">*</span>
        </label>
        <input
          id="edit-user-name"
          type="text"
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
        />
      </div>

      <div>
        <label htmlFor="edit-user-status" className="block text-sm font-medium text-slate-900">
          Trạng thái tài khoản
        </label>
        <select
          id="edit-user-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as UserStatus)}
          className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
        >
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Tạm ngưng</option>
          <option value="suspended">Bị khóa</option>
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-900">Vai trò truy cập</legend>
        <div className="flex flex-wrap gap-3">
          {ALL_ROLES.map((role) => (
            <label key={role} className="lms-choice-label">
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              <span className="text-sm font-medium text-slate-900">
                {getRoleLabelVi(role)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {mutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}

export default function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [createNonce, setCreateNonce] = useState(0);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const query = useQuery({
    queryKey: adminKeys.users(roleFilter, statusFilter, searchTerm, page),
    queryFn: () =>
      usersApi.list({
        role: roleFilter === "all" ? undefined : roleFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchTerm || undefined,
        page,
        limit: 15,
      }),
    placeholderData: keepPreviousData,
  });

  const users = query.data?.items ?? [];

  const columns: DataTableColumn<AuthUser>[] = [
    {
      key: "fullName",
      header: "Người dùng",
      renderCell: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.fullName}</p>
          <p className="text-xs text-slate-600">{row.email}</p>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Vai trò",
      renderCell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.roles.map((r) => (
            <MetaTag key={r} variant="neutral">
              {getRoleLabelVi(r)}
            </MetaTag>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "timezone",
      header: "Múi giờ",
      renderCell: (row) => <span className="text-xs text-slate-700">{row.timezone}</span>,
    },
    {
      key: "actions",
      header: "Thao tác",
      align: "end",
      renderCell: (row) => (
        <button
          type="button"
          onClick={() => setEditingUser(row)}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden={true} />
          Sửa quyền / Trạng thái
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý tài khoản & Phân quyền"
        subtitle="Cấp phát tài khoản mới, điều chỉnh nhiều vai trò (RBAC) và trạng thái truy cập."
        actions={
          <button
            type="button"
            onClick={() => {
              setCreateNonce((n) => n + 1);
              setCreateOpen(true);
            }}
            className={buttonVariants({ variant: "primary" })}
          >
            <UserPlus className="h-4 w-4" aria-hidden={true} />
            Tạo tài khoản mới
          </button>
        }
      />

      {feedback ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{feedback}</span>
        </div>
      ) : null}

      <Toolbar>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Lọc theo vai trò"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="student">Học viên</option>
            <option value="teacher">Giảng viên</option>
            <option value="admin">Quản trị viên</option>
          </select>

          <select
            aria-label="Lọc theo trạng thái tài khoản"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Tạm ngưng</option>
            <option value="suspended">Bị khóa</option>
          </select>
        </div>

        <SearchInput
          id="admin-user-search"
          label="Tìm tài khoản theo tên hoặc email"
          placeholder="Tìm theo tên hoặc email..."
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
        loadingLabel="Đang tải danh sách tài khoản..."
      >
        <DataTable
          caption={`Danh sách tài khoản (${query.data?.total ?? users.length})`}
          columns={columns}
          rows={users}
          getRowKey={(row) => row.id}
          emptyTitle="Không tìm thấy tài khoản nào"
          emptyDescription="Thay đổi bộ lọc tìm kiếm hoặc tạo tài khoản mới."
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

      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo tài khoản người dùng mới"
      >
        <CreateUserForm
          key={createNonce}
          onClose={() => setCreateOpen(false)}
          onSuccess={setFeedback}
        />
      </ModalDialog>

      <ModalDialog
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title="Chỉnh sửa vai trò & trạng thái"
      >
        {editingUser ? (
          <EditUserForm
            key={editingUser.id}
            target={editingUser}
            onClose={() => setEditingUser(null)}
            onSuccess={setFeedback}
          />
        ) : null}
      </ModalDialog>
    </div>
  );
}
