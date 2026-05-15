/**
 * Provider-specific quota endpoints.
 *
 * The CLIProxyAPI backend exposes a `/v0/management/api-call` proxy that
 * the older quota probes (Codex, Gemini, Claude, etc.) lean on. Kiro and
 * GitHub need first-class endpoints because their upstream calls require
 * server-side token rotation that the proxy alone cannot do — see
 * internal/api/handlers/management/{kiro,github}_quota.go for the BE.
 */

import { apiClient } from './client';

export interface KiroModelEntry {
  id: string;
  name?: string;
  description?: string;
  rate_multiplier?: number;
  rate_unit?: string;
  max_input_tokens?: number;
  max_output_tokens?: number;
}

export interface KiroQuotaResponse {
  plan?: string;
  email?: string;
  profile_arn?: string;
  region?: string;
  default_model?: string;
  models?: KiroModelEntry[];
  message?: string;
}

export interface GithubQuotaUsage {
  used: number;
  total: number;
  remaining?: number;
  unlimited: boolean;
}

export interface GithubQuotaResponse {
  plan?: string;
  login?: string;
  reset_date?: string;
  quotas?: Record<string, GithubQuotaUsage>;
  message?: string;
  raw?: Record<string, unknown>;
}

export const kiroQuotaApi = {
  fetch: (authIndex: string) =>
    apiClient.get<KiroQuotaResponse>('/kiro-quota', {
      params: { auth_index: authIndex },
    }),
};

export const githubQuotaApi = {
  fetch: (authIndex: string) =>
    apiClient.get<GithubQuotaResponse>('/github-quota', {
      params: { auth_index: authIndex },
    }),
};
