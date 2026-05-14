import { create } from 'zustand';
import type { AntigravityQuotaState, ClaudeQuotaState, CodexQuotaState, GeminiCliQuotaState, KimiQuotaState, GitHubQuotaState, GenericOAuthQuotaState } from '@/types';

type QuotaUpdater<T> = T | ((prev: T) => T);

interface QuotaStoreState {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  geminiCliQuota: Record<string, GeminiCliQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  githubQuota: Record<string, GitHubQuotaState>;
  kiroQuota: Record<string, GenericOAuthQuotaState>;
  qwenQuota: Record<string, GenericOAuthQuotaState>;
  clineQuota: Record<string, GenericOAuthQuotaState>;
  kilocodeQuota: Record<string, GenericOAuthQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setGeminiCliQuota: (updater: QuotaUpdater<Record<string, GeminiCliQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  setGithubQuota: (updater: QuotaUpdater<Record<string, GitHubQuotaState>>) => void;
  setKiroQuota: (updater: QuotaUpdater<Record<string, GenericOAuthQuotaState>>) => void;
  setQwenQuota: (updater: QuotaUpdater<Record<string, GenericOAuthQuotaState>>) => void;
  setClineQuota: (updater: QuotaUpdater<Record<string, GenericOAuthQuotaState>>) => void;
  setKilocodeQuota: (updater: QuotaUpdater<Record<string, GenericOAuthQuotaState>>) => void;
  clearQuotaCache: () => void;
}

const resolveUpdater = <T,>(updater: QuotaUpdater<T>, prev: T): T => {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(prev);
  }
  return updater;
};

export const useQuotaStore = create<QuotaStoreState>((set) => ({
  antigravityQuota: {},
  claudeQuota: {},
  codexQuota: {},
  geminiCliQuota: {},
  kimiQuota: {},
  githubQuota: {},
  kiroQuota: {},
  qwenQuota: {},
  clineQuota: {},
  kilocodeQuota: {},
  setAntigravityQuota: (updater) =>
    set((state) => ({ antigravityQuota: resolveUpdater(updater, state.antigravityQuota) })),
  setClaudeQuota: (updater) =>
    set((state) => ({ claudeQuota: resolveUpdater(updater, state.claudeQuota) })),
  setCodexQuota: (updater) =>
    set((state) => ({ codexQuota: resolveUpdater(updater, state.codexQuota) })),
  setGeminiCliQuota: (updater) =>
    set((state) => ({ geminiCliQuota: resolveUpdater(updater, state.geminiCliQuota) })),
  setKimiQuota: (updater) =>
    set((state) => ({ kimiQuota: resolveUpdater(updater, state.kimiQuota) })),
  setGithubQuota: (updater) =>
    set((state) => ({ githubQuota: resolveUpdater(updater, state.githubQuota) })),
  setKiroQuota: (updater) =>
    set((state) => ({ kiroQuota: resolveUpdater(updater, state.kiroQuota) })),
  setQwenQuota: (updater) =>
    set((state) => ({ qwenQuota: resolveUpdater(updater, state.qwenQuota) })),
  setClineQuota: (updater) =>
    set((state) => ({ clineQuota: resolveUpdater(updater, state.clineQuota) })),
  setKilocodeQuota: (updater) =>
    set((state) => ({ kilocodeQuota: resolveUpdater(updater, state.kilocodeQuota) })),
  clearQuotaCache: () =>
    set({
      antigravityQuota: {},
      claudeQuota: {},
      codexQuota: {},
      geminiCliQuota: {},
      kimiQuota: {},
      githubQuota: {},
      kiroQuota: {},
      qwenQuota: {},
      clineQuota: {},
      kilocodeQuota: {},
    })
}));
