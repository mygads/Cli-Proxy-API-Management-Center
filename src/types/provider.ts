/**
 * AI 提供商相关类型
 * 基于原项目 src/modules/ai-providers.js
 */

export interface ModelAlias {
  name: string;
  alias?: string;
  priority?: number;
  testModel?: string;
}

export interface ApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
  authIndex?: string;
}

export interface CloakConfig {
  mode?: string;
  strictMode?: boolean;
  sensitiveWords?: string[];
}

export interface GeminiKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  models?: ModelAlias[];
  headers?: Record<string, string>;
  excludedModels?: string[];
  authIndex?: string;
}

export interface ProviderKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  websockets?: boolean;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  cloak?: CloakConfig;
  authIndex?: string;
}

/**
 * CommandCodeKeyConfig describes a stored Command Code (commandcode.ai)
 * API key entry. Phase 1: storage only — backend persists entries via
 * /v0/management/commandcode-api-key but no executor is wired yet.
 *
 * Shape mirrors ProviderKeyConfig (Codex/Claude) so existing edit UI and
 * transformers can be reused without forking the form layout.
 */
export type CommandCodeKeyConfig = ProviderKeyConfig;

export interface OpenAIProviderConfig {
  name: string;
  prefix?: string;
  baseUrl: string;
  apiKeyEntries: ApiKeyEntry[];
  disabled?: boolean;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  priority?: number;
  testModel?: string;
  authIndex?: string;
  [key: string]: unknown;
}
