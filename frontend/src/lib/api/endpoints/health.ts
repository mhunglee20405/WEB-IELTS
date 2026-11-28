import { apiRequest } from "../client";
import type { HealthStatus } from "../types";

export const healthApi = {
  live(): Promise<HealthStatus> {
    return apiRequest<HealthStatus>({
      method: "GET",
      path: "/health/live",
      skipAuth: true,
    });
  },

  ready(): Promise<HealthStatus> {
    return apiRequest<HealthStatus>({
      method: "GET",
      path: "/health/ready",
      skipAuth: true,
    });
  },
};

