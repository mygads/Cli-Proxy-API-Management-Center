import { apiClient } from './client';

export interface ImageRoutingEntry {
  priority: number;
  model: string;
}

export interface ImageRoutingConfig {
  enabled: boolean;
  routed_combos: string[];
  chain: ImageRoutingEntry[];
}

// Max chain entries = 1 target + 5 fallback (mirrors backend MaxChainEntries).
export const IMAGE_ROUTING_MAX_CHAIN = 6;

export const imageRoutingApi = {
  get: () => apiClient.get<{ config: ImageRoutingConfig }>('/image-routing'),

  update: (config: ImageRoutingConfig) =>
    apiClient.put<{ config: ImageRoutingConfig }>('/image-routing', config),
};
