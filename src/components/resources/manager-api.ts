import type { LibraryResource } from "@/lib/resource-types";

export type ManagerMode = "local" | "cloud";
export type ManagerRequestContext = { mode: ManagerMode; libraryRevision?: string };
export type ManagerLibraryResult = { resources: LibraryResource[]; publishedAt?: string; libraryRevision?: string; publishedIds?: string[] };
export type ManagerPublishResult = { publishedAt: string; count: number; libraryRevision?: string; publishedIds?: string[]; cacheStatus?: "refreshed" | "pending" };
const WRITES = new Set(["save", "bulk", "import", "undo-import", "publish"]);

export class ManagerRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "ManagerRequestError"; }
}

function responseError(status: number, result: unknown, mode: ManagerMode): string {
  if (status === 401) return "登录已过期。当前输入会保留，请重新登录后再试。";
  if (status === 403) return "当前会话没有管理权限，请使用站点所有者账号登录。";
  if (status === 409) return "资源库已在其他页面更新，当前输入仍然保留。请先核对最新内容，再刷新列表后重新打开编辑器，避免覆盖他人的修改。";
  if (status === 413) return "本次提交内容过大，请减少条目或分批导入。";
  if (status === 429) return "操作太频繁，请稍等片刻再试。";
  if (status === 503) return "资源库暂时无法连接，当前输入会保留，请稍后重试。";
  if (status === 404) return mode === "local" ? "本机管理仅在开发环境开放，请从本机开发地址进入。" : "线上管理尚未启用，请稍后再试。";
  const message = result && typeof result === "object" && "error" in result ? result.error : null;
  return typeof message === "string" && /[\u4e00-\u9fff]/.test(message) && message.length <= 500 ? message : "操作未完成，当前输入会保留，请稍后重试。";
}

export async function managerRequest<T>(payload: Record<string, unknown>, context: ManagerRequestContext = { mode: "local" }, signal?: AbortSignal): Promise<T> {
  const writing = WRITES.has(String(payload.action));
  if (context.mode === "cloud" && writing && !context.libraryRevision) throw new ManagerRequestError("请先刷新资源列表，再执行保存或发布。", 428);
  let response: Response;
  try {
    response = await fetch(context.mode === "cloud" ? "/api/library" : "/api/local-library", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin",
      body: JSON.stringify({ ...payload, ...(context.mode === "cloud" && writing ? { libraryRevision: context.libraryRevision } : {}) }), signal,
    });
  } catch (failure) {
    if (signal?.aborted) throw failure;
    throw new ManagerRequestError("网络连接中断，当前输入会保留。请检查连接后重试。", 0);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new ManagerRequestError(responseError(response.status, result, context.mode), response.status);
  if (!result) throw new ManagerRequestError("没有收到有效结果。请刷新列表确认操作状态后再试。", 502);
  if (context.mode === "cloud" && (writing || payload.action === "list") && typeof result.libraryRevision !== "string") {
    throw new ManagerRequestError("没有收到完整的保存结果。请先刷新列表确认，避免重复提交。", 502);
  }
  return result as T;
}

export function managerError(error: unknown): string {
  return error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : "操作未完成，当前输入会保留，请稍后重试。";
}
export function managerErrorStatus(error: unknown): number { return error instanceof ManagerRequestError ? error.status : 0; }
export function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleDateString("zh-CN");
}
