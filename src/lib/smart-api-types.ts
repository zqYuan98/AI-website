import type { ResourceCategory, ResourceKind } from "./resource-types";

/** Browser-safe contracts. Secrets and encrypted envelopes only exist in server modules. */
export const SMART_API_LIMITS = {
  batchSize: { min: 1, max: 50 },
  maxRequests: { min: 1, max: 1000 },
  concurrency: { min: 1, max: 3 },
  maxOutputTokens: { min: 512, max: 8192 },
} as const;

export type ApiSettings = {
  name: string;
  baseUrl: string;
  model: string;
  batchSize: number;
  maxRequests: number;
  concurrency: number;
  maxOutputTokens: number;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  estimatedBudget: number | null;
};

export const SMART_API_DEFAULT_SETTINGS: ApiSettings = {
  name: "我的模型服务", baseUrl: "", model: "", batchSize: 20,
  maxRequests: 300, concurrency: 1, maxOutputTokens: 4096,
  inputPricePerMillion: null, outputPricePerMillion: null, estimatedBudget: null,
};

export type ApiConfigView = {
  id: string;
  version: string;
  testedVersion: string | null;
  enabled: boolean;
  hasKey: boolean;
  encryptionReady: boolean;
  settings: ApiSettings;
  testedAt: string | null;
  updatedAt: string | null;
};

export type SaveApiConfig = { version: string; settings: ApiSettings; apiKey?: string };
export type ApprovedModelInput = { id: string; title: string; domain: string };
export type ModelSuggestion = {
  id: string;
  kind: ResourceKind;
  category: ResourceCategory;
  tags: string[];
  description: string;
  reason: string;
  confidence: "clear" | "review";
  source: "model";
};
export type ModelUsage = { inputTokens: number | null; outputTokens: number | null };
export type ApiTestResult = { config: ApiConfigView; success: true; requestId: string; usage: ModelUsage | null };
