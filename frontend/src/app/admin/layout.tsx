import type { ReactNode } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { PortalShell } from "@/components/layout/portal-shell";

export default function AdminPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={["admin"]}>
      <PortalShell portal="admin">{children}</PortalShell>
    </RoleGuard>
  );
}

