import type { AnalysisJob } from "@/lib/smart-analysis-types";
import type { ApiConfigView } from "@/lib/smart-api-types";

export const ANALYSIS_STATUS: Record<AnalysisJob["status"], string> = {
  queued: "等待开始", running: "正在整理", paused: "已暂停", completed: "整理完成", cancelled: "已取消", failed: "需要处理",
};

export function usesCurrentConnection(job: AnalysisJob, config: ApiConfigView | null) {
  return Boolean(config && job.config.id === config.id && job.config.version === config.version);
}

export function analysisOverview(jobs: AnalysisJob[], config: ApiConfigView | null) {
  const active = jobs.find(job => job.status === "queued" || job.status === "running");
  const current = jobs.filter(job => usesCurrentConnection(job, config));
  const latest = current.find(job => job.status === "queued" || job.status === "running") ?? current[0];
  return { active, latest, history: jobs.filter(job => job.id !== latest?.id), hasSuggestions: jobs.some(job => job.succeeded > 0) };
}
