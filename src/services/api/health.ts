import { apiClient } from './client';

export interface BreakerState {
  state: string;
  consecutive_fails: number;
  probe_successes: number;
  forced_closed: boolean;
  forced_open: boolean;
  opened_at?: string;
  last_transition?: string;
  reset_in_ms?: number;
  config?: Record<string, unknown>;
  label?: string;
  provider?: string;
}

export interface ExclusionEntry {
  level: number;
  last_reason: string;
  marked_at: string;
  expires_at?: string;
  label?: string;
  provider?: string;
}

export const healthApi = {
  listBreakers: () =>
    apiClient.get<{ breakers: Record<string, BreakerState> }>('/breakers'),

  forceBreaker: (authId: string, action: 'open' | 'closed' | 'clear') =>
    apiClient.post<{ status: string; auth_id: string; action: string }>(
      `/breakers/${encodeURIComponent(authId)}/force`,
      { action }
    ),

  listExclusions: () =>
    apiClient.get<{ exclusions: Record<string, ExclusionEntry> }>('/exclusions'),

  clearExclusion: (authId: string) =>
    apiClient.delete<{ status: string; auth_id: string }>(
      `/exclusions/${encodeURIComponent(authId)}`
    ),
};
