export type SmartService = "imports" | "smart-settings" | "analysis";

export class SmartRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message); this.name = "SmartRequestError";
  }
}

export async function smartRequest<T>(service: SmartService, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/library/${service}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
      body: JSON.stringify(payload), signal,
    });
  } catch (failure) {
    if (signal?.aborted) throw failure;
    throw new SmartRequestError("网络连接中断，已保存的决定不会丢失。请检查连接后重试。", 0);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "登录已过期。当前输入仍保留，请重新登录后再试。",
      403: "当前账号没有管理权限，请使用站点所有者账号登录。",
      409: "这份内容已在其他页面更新。当前输入仍保留，请刷新核对后再操作。",
      413: "提交内容过大，请减少条目或分批处理。",
      429: "操作较频繁，请稍等片刻再试。",
      503: "服务暂时无法连接，已保存的进度不会丢失，请稍后重试。",
    };
    const safeMessage = typeof result?.error === "string" && /[\u4e00-\u9fff]/.test(result.error) && result.error.length < 500 ? result.error : "操作未完成，请稍后重试。";
    const detail = safeMessage !== "操作未完成，请稍后重试。" ? safeMessage : messages[response.status] ?? safeMessage;
    const message = response.status === 401 || response.status === 403 ? messages[response.status] : response.status === 409 ? `${detail} 当前输入与已保存的决定会保留，请核对最新内容后再操作。` : detail;
    throw new SmartRequestError(message, response.status, result);
  }
  if (!result || typeof result !== "object") throw new SmartRequestError("未收到完整结果，请刷新确认操作状态后再试。", 502);
  return result as T;
}

export function smartError(error: unknown): string {
  return error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : "操作未完成，请稍后重试。";
}
export function smartErrorStatus(error: unknown): number { return error instanceof SmartRequestError ? error.status : 0; }

export function downloadSmartReport(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function smartDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
