import type { SmartImportAnalysisTarget } from "./smart-import-types";

export type AnalysisStatus = "queued" | "running" | "paused" | "completed" | "cancelled" | "failed";
export type AnalysisDestination = { id: string; version: string; name: string; baseUrl: string; model: string };
export type AnalysisLimits = { batchSize: number; maxRequests: number; concurrency: number; maxOutputTokens: number; maxCandidates: number };
export type AnalysisPreview = {
  confirmation: string;
  expiresAt: string;
  batchId: string;
  batchRevision: string;
  config: AnalysisDestination;
  targets: SmartImportAnalysisTarget[];
  excluded: { id: string; reason: string }[];
  limits: AnalysisLimits;
  estimatedRequests: number;
  estimatedCost: number | null;
  estimatedBudget: number | null;
};
export type AnalysisJob = {
  id: string;
  batchId: string;
  status: AnalysisStatus;
  revision: string;
  config: AnalysisDestination;
  total: number;
  pending: number;
  succeeded: number;
  ignored: number;
  failed: number;
  requests: number;
  possibleCharge: boolean;
  estimatedReservedCost: number | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
};
export type AnalysisRequest =
  | { action: "preview"; batchId: string; batchRevision: string; groupIds: string[]; configVersion: string }
  | { action: "start"; confirmation: string; requestId: string }
  | { action: "get"; jobId: string }
  | { action: "list"; batchId: string }
  | { action: "pause" | "cancel"; jobId: string; revision: string }
  | { action: "resume"; jobId: string; revision: string; retryFailed?: boolean };

export type AnalysisJobResult = { job: AnalysisJob };
