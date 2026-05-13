import { apiClient } from './client';

export interface ComboEntry {
  priority: number;
  model: string;
  trigger_on?: string[];
  weight?: number;
}

export interface Combo {
  name: string;
  description?: string;
  status: 'active' | 'draft' | 'disabled';
  load_balance: boolean;
  strategy?: 'fallback' | 'round-robin' | 'auto';
  sticky_limit?: number;
  entries: ComboEntry[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ComboMetricsEntry {
  entry_index: number;
  total_requests: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  latency_p50_sec: number;
  latency_p95_sec: number;
  latency_p99_sec: number;
  trigger_reasons: Record<string, number>;
  oldest_sample?: string;
  newest_sample?: string;
}

export interface ComboMetrics {
  combo: string;
  window: string;
  entries: ComboMetricsEntry[];
}

export const combosApi = {
  list: () => apiClient.get<{ object: string; data: Combo[] }>('/combos'),

  get: (name: string) =>
    apiClient.get<{ combo: Combo }>(`/combos/${encodeURIComponent(name)}`),

  create: (combo: Combo) =>
    apiClient.post<{ combo: Combo }>('/combos', combo),

  update: (name: string, combo: Partial<Combo>) =>
    apiClient.put<{ combo: Combo }>(`/combos/${encodeURIComponent(name)}`, combo),

  delete: (name: string) =>
    apiClient.delete(`/combos/${encodeURIComponent(name)}`),

  metrics: (name: string) =>
    apiClient.get<ComboMetrics>(`/combos/${encodeURIComponent(name)}/metrics`),
};
