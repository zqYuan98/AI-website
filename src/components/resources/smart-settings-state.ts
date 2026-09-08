import type { ApiConfigView, ApiSettings } from "@/lib/smart-api-types";

export type SmartSettingsPhase = "loading" | "load-error" | "status-unknown" | "unavailable" | "draft" | "unconfigured" | "test-failed" | "needs-test" | "tested" | "ready" | "stopped";

export function settingsReturnTo(value: string | string[] | null | undefined): string {
  const fallback = "/tools/manage/imports";
  if (Array.isArray(value)) value = value.length === 1 ? value[0] : null;
  if (value === fallback) return value;
  return value && value === value.trim() && /^\/tools\/manage\/imports\/smart-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) ? value : fallback;
}

export function settingsAreDirty(config: ApiConfigView | null, settings: ApiSettings, apiKey: string): boolean {
  return Boolean(config && (JSON.stringify(settings) !== JSON.stringify(config.settings) || apiKey.trim()));
}

export function settingsPhase({ config, loading, dirty, stopped, testFailed, statusUnknown = false }: { config: ApiConfigView | null; loading: boolean; dirty: boolean; stopped: boolean; testFailed: boolean; statusUnknown?: boolean }): SmartSettingsPhase {
  if (loading) return "loading";
  if (!config) return "load-error";
  if (!config.encryptionReady) return "unavailable";
  if (dirty) return "draft";
  if (statusUnknown) return "status-unknown";
  if (!config.hasKey) return "unconfigured";
  if (testFailed) return "test-failed";
  if (config.testedVersion !== config.version) return "needs-test";
  if (config.enabled) return "ready";
  return stopped ? "stopped" : "tested";
}
