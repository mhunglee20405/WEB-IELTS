import { apiRequest } from "../client";

export interface SetupStatus {
  isInitialized: boolean;
  adminCount: number;
  totalUsers: number;
}

export interface BootstrapAdminPayload {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  setupToken?: string;
}

export interface BootstrapAdminResponse {
  success: boolean;
  message: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
  };
}

export const systemApi = {
  async getSetupStatus(): Promise<SetupStatus> {
    return apiRequest<SetupStatus>({
      method: "GET",
      path: "/system/setup-status",
    });
  },

  async bootstrapAdmin(payload: BootstrapAdminPayload): Promise<BootstrapAdminResponse> {
    return apiRequest<BootstrapAdminResponse>({
      method: "POST",
      path: "/system/bootstrap-admin",
      body: payload,
    });
  },
};
