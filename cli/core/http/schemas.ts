// ABOUTME: Zod schemas for Darwinian analyzer HTTP responses consumed by drwn.
// ABOUTME: Keeps backend contract validation centralized across auth and analyze commands.

import { z } from "zod";

export const DeviceCodeResponseSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri_complete: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive().default(5),
});

export const DeviceTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

export const SessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().optional(),
  }),
  session: z.object({
    id: z.string().optional(),
    expiresAt: z.string().optional(),
  }).passthrough().optional(),
}).passthrough().nullable();

export const AnalyzeUploadResponseSchema = z.object({
  jobId: z.string(),
  status: z.literal("queued"),
});

export const JobInfoSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable(),
  reportId: z.string().nullable(),
});

export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>;
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type AnalyzeUploadResponse = z.infer<typeof AnalyzeUploadResponseSchema>;
export type JobInfo = z.infer<typeof JobInfoSchema>;
