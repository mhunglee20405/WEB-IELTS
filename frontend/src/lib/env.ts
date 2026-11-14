import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z
    .string()
    .trim()
    .min(1)
    .default("http://localhost:3000/api/v1"),
  NEXT_PUBLIC_API_MODE: z.enum(["live", "mock"]).default("live"),
  NEXT_PUBLIC_DEFAULT_TIMEZONE: z.string().trim().min(1).default("Asia/Ho_Chi_Minh"),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || undefined,
  NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE || undefined,
  NEXT_PUBLIC_DEFAULT_TIMEZONE: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || undefined,
});

export const env = parsed.success
  ? parsed.data
  : {
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:3000/api/v1",
      NEXT_PUBLIC_API_MODE: "live" as const,
      NEXT_PUBLIC_DEFAULT_TIMEZONE: "Asia/Ho_Chi_Minh",
    };

export function isMockApiMode(): boolean {
  return env.NEXT_PUBLIC_API_MODE === "mock";
}

