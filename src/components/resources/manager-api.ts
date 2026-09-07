export async function managerRequest<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/local-library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    body: JSON.stringify(payload),
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || (response.status === 404
      ? "本机管理仅在开发环境开放，请从本机开发地址进入。"
      : "操作未完成，请稍后重试。"));
  }
  if (!result) throw new Error("没有收到有效结果，请重试。");
  return result as T;
}

export function managerError(error: unknown): string {
  return error instanceof Error ? error.message : "操作未完成，请重试。";
}

export function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleDateString("zh-CN");
}
