"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { SMART_API_DEFAULT_SETTINGS, SMART_API_LIMITS, type ApiConfigView, type ApiSettings, type ApiTestResult } from "@/lib/smart-api-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { smartDate, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import { settingsAreDirty, settingsPhase, settingsReturnTo, type SmartSettingsPhase } from "./smart-settings-state";
import styles from "./smart-import.module.css";
import pageStyles from "./smart-settings.module.css";

const PHASE_COPY: Record<SmartSettingsPhase, { title: string; detail: string; action: string; next: string }> = {
  loading: { title: "正在读取连接状态…", detail: "稍等片刻，马上显示这项连接的真实状态。", action: "正在读取…", next: "读取连接设置" },
  "load-error": { title: "暂时无法读取连接状态", detail: "还不能确认连接是否可用。重新读取后可以继续。", action: "重新读取连接", next: "重新读取设置" },
  "status-unknown": { title: "连接状态需要重新确认", detail: "暂时未能读取服务端最新状态。刷新连接状态后再继续，已有输入不会自动保存。", action: "刷新连接状态", next: "先确认最新状态" },
  unavailable: { title: "安全存储暂不可用", detail: "目前不能保存密钥或启用 AI。已有书签仍可用规则和手工整理。", action: "连接暂不可用", next: "暂时无法启用" },
  draft: { title: "有修改，尚未保存", detail: "先保存这次修改，再测试并启用。保存不会发送书签。", action: "保存修改", next: "先保存连接配置" },
  unconfigured: { title: "还没有配置 AI 连接", detail: "填写服务地址、模型和密钥。书签整理也可以先用基础规则。", action: "填写连接信息后保存", next: "填写下方连接信息" },
  "test-failed": { title: "连接测试未通过", detail: "请根据错误提示核对设置。修改后先保存；再次测试仍只使用虚构样例。", action: "重新测试连接", next: "核对后重新测试" },
  "needs-test": { title: "配置已保存，下一步测试连接", detail: "测试只发送一个固定虚构样例，不会发送你的书签。", action: "测试连接", next: "检查服务能否正常返回" },
  tested: { title: "测试已通过，等待你启用", detail: "启用后可在整理结果中使用 AI。每次发送书签前仍由你确认范围。", action: "启用 AI 整理", next: "最后一步：启用连接" },
  ready: { title: "AI 已准备好，去整理书签", detail: "连接已经可用，无需再次保存。返回整理结果后，选择范围并确认发送才会开始。", action: "开始整理书签", next: "连接已就绪" },
  stopped: { title: "AI 已停用", detail: "已保存的建议和收藏保留。当前配置已通过测试，可以由你重新启用。", action: "重新启用 AI", next: "按需要恢复使用" },
};

export function SmartSettings() {
  return <Suspense fallback={<p className={styles.loading} role="status">正在读取连接设置…</p>}><SmartSettingsContent /></Suspense>;
}

function SmartSettingsContent() {
  const params = useSearchParams();
  const returnTo = settingsReturnTo(params.getAll("returnTo"));
  const returningToBatch = returnTo !== "/tools/manage/imports";
  const [config, setConfig] = useState<ApiConfigView | null>(null);
  const [settings, setSettings] = useState<ApiSettings>({ ...SMART_API_DEFAULT_SETTINGS });
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [syncError, setSyncError] = useState("");
  const [syncErrorStatus, setSyncErrorStatus] = useState(0);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<"test" | "clear" | null>(null);
  const [stopped, setStopped] = useState(false);
  const [testFailed, setTestFailed] = useState(false);
  const [statusUnknown, setStatusUnknown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const interactionVersion = useRef(0);
  const refreshBlocked = useRef(false);
  const refreshController = useRef<AbortController | null>(null);
  const dirty = settingsAreDirty(config, settings, apiKey);
  const targetChanged = Boolean(config?.hasKey && settings.baseUrl.trim() !== config.settings.baseUrl);
  const phase = settingsPhase({ config, loading, dirty, stopped, testFailed, statusUnknown });
  const copy = PHASE_COPY[phase];
  const visibleError = error || syncError;
  const visibleErrorStatus = error ? errorStatus : syncErrorStatus;
  useEffect(() => { refreshBlocked.current = dirty || Boolean(busy) || Boolean(dialog); });

  useEffect(() => {
    const controller = new AbortController();
    smartRequest<ApiConfigView>("smart-settings", { action: "read" }, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setConfig(result); setSettings(result.settings); } })
      .catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadVersion]);

  const refreshConnection = useCallback(async (afterTest = false) => {
    if (!config || dirty || (!afterTest && (busy || dialog || refreshBlocked.current || refreshController.current))) return;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    const startedAt = interactionVersion.current;
    setRefreshing(true);
    try {
      const result = await smartRequest<ApiConfigView>("smart-settings", { action: "read" }, controller.signal);
      // Typing or starting a mutation invalidates this snapshot, even if the user
      // subsequently returns a field to its original value before the read ends.
      if (controller.signal.aborted || startedAt !== interactionVersion.current || (!afterTest && refreshBlocked.current)) return;
      setConfig(result); setSettings(result.settings); setStatusUnknown(false); setSyncError(""); setSyncErrorStatus(0);
      setStopped(previous => !result.enabled && result.testedVersion === result.version && (previous || config.enabled));
      if (!afterTest && (result.version !== config.version || (result.testedVersion === result.version && ((result.enabled && !config.enabled) || result.testedAt !== config.testedAt)))) {
        setTestFailed(false); setError(""); setErrorStatus(0);
      }
    } catch (failure) {
      if (!controller.signal.aborted && startedAt === interactionVersion.current) {
        setStatusUnknown(true);
        setSyncError(smartError(failure)); setSyncErrorStatus(smartErrorStatus(failure));
      }
    } finally {
      if (refreshController.current === controller) { refreshController.current = null; setRefreshing(false); }
    }
  }, [config, dirty, busy, dialog]);

  useEffect(() => {
    function onReturn() { if (document.visibilityState === "visible") void refreshConnection(); }
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => { window.removeEventListener("focus", onReturn); document.removeEventListener("visibilitychange", onReturn); };
  }, [refreshConnection]);
  useEffect(() => () => { refreshController.current?.abort(); }, []);

  function setField<K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) { interactionVersion.current += 1; refreshBlocked.current = true; setSettings(previous => ({ ...previous, [key]: value })); setMessage(""); }
  function failed(failure: unknown) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); }
  function reload() { if (config || dirty || busy) return; setError(""); setLoading(true); setLoadVersion(value => value + 1); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || busy || !dirty || !config.encryptionReady) return;
    interactionVersion.current += 1; refreshBlocked.current = true; setBusy("save"); setError(""); setMessage("");
    try {
      const result = await smartRequest<ApiConfigView>("smart-settings", { action: "save", version: config.version, settings, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
      setConfig(result); setSettings(result.settings); setApiKey(""); setStopped(false); setTestFailed(false); setStatusUnknown(false); setSyncError(""); setSyncErrorStatus(0);
    } catch (failure) { failed(failure); }
    finally { setBusy(""); }
  }
  async function setEnabled(enabled: boolean) {
    if (!config || busy || dirty || statusUnknown || (enabled && (!config.hasKey || !config.encryptionReady || config.testedVersion !== config.version || testFailed))) return;
    interactionVersion.current += 1; refreshBlocked.current = true; setBusy("enabled"); setError(""); setMessage("");
    try {
      const result = await smartRequest<ApiConfigView>("smart-settings", { action: "set-enabled", version: config.version, enabled });
      setConfig(result); setStopped(!enabled);
    } catch (failure) { failed(failure); }
    finally { setBusy(""); }
  }
  function openTest() { if (!config || busy || dirty || statusUnknown || !config.hasKey || !config.encryptionReady) return; interactionVersion.current += 1; refreshBlocked.current = true; setError(""); setMessage(""); setDialog("test"); }
  async function testConnection() {
    if (!config || busy || dirty || statusUnknown || !config.hasKey || !config.encryptionReady) return;
    interactionVersion.current += 1; refreshBlocked.current = true; setBusy("test"); setError(""); setMessage("");
    try {
      const result = await smartRequest<ApiTestResult>("smart-settings", { action: "test", version: config.version });
      setConfig(result.config); setDialog(null); setTestFailed(false); setStopped(false); setStatusUnknown(false); setSyncError(""); setSyncErrorStatus(0);
      setMessage(result.usage?.inputTokens != null || result.usage?.outputTokens != null ? `本次测试用量：输入 ${result.usage?.inputTokens ?? "未知"}、输出 ${result.usage?.outputTokens ?? "未知"} token。` : "服务商未返回完整用量，本次测试费用未知。");
    } catch (failure) { setTestFailed(true); failed(failure); await refreshConnection(true); }
    finally { setBusy(""); }
  }
  async function clearKey() {
    if (!config || busy || dirty) return;
    interactionVersion.current += 1; refreshBlocked.current = true; setBusy("clear"); setError(""); setMessage("");
    try {
      const result = await smartRequest<ApiConfigView>("smart-settings", { action: "clear-key", version: config.version });
      setConfig(result); setSettings(result.settings); setApiKey(""); setDialog(null); setStopped(false); setTestFailed(false); setStatusUnknown(false); setSyncError(""); setSyncErrorStatus(0);
      setMessage("密钥已清除，AI 已停用。已有建议和收藏都会保留。");
    } catch (failure) { failed(failure); }
    finally { setBusy(""); }
  }
  let targetHost = "尚未填写";
  try { targetHost = new URL(config?.settings.baseUrl || "").host; } catch { /* Show the empty label. */ }
  const endpoint = config ? `${config.settings.baseUrl.replace(/\/+$/, "")}/chat/completions` : "";
  const canTest = Boolean(config?.hasKey && config.encryptionReady && !dirty && !busy && !statusUnknown);
  const buttonDisabled = Boolean(busy) || refreshing || ["loading", "unavailable", "unconfigured"].includes(phase);
  function nextAction() {
    if (phase === "load-error") reload();
    else if (phase === "status-unknown") void refreshConnection();
    else if (phase === "tested" || phase === "stopped") void setEnabled(true);
    else if (phase === "needs-test" || phase === "test-failed") openTest();
  }

  return <div className={pageStyles.page}>
    <header className={pageStyles.heading}><div><h1>AI 连接设置</h1><p>连接自己的模型服务，为书签补充分类、标签和简介。</p></div><Link href={returnTo} className={pageStyles.back}>{returningToBatch ? "返回这批书签" : "返回导入记录"} <span aria-hidden="true">↗</span></Link></header>
    <section className={`${pageStyles.status} ${phase === "ready" ? pageStyles.statusReady : ["test-failed", "load-error", "status-unknown", "unavailable"].includes(phase) ? pageStyles.statusIssue : ""}`} aria-label="当前连接状态" aria-live="polite"><span className={pageStyles.statusMark} aria-hidden="true">{phase === "ready" ? "✓" : "✧"}</span><div><h2>{copy.title}</h2><p>{phase === "draft" && config?.enabled ? "修改尚未保存，当前服务仍使用原配置。保存后需重新测试并启用。" : copy.detail}</p></div></section>
    {!dialog ? <SmartFeedback error={visibleError} status={visibleErrorStatus} message={message} onRefresh={!config ? reload : !dirty && !busy ? () => void refreshConnection() : undefined} /> : null}
    {!loading && config ? <form id="smart-settings-form" className={`${styles.settingsForm} ${pageStyles.form}`} onSubmit={save}><fieldset disabled={Boolean(busy)} className={styles.settingsFields}>
      <section className={`${styles.settingsSection} ${pageStyles.connectionFields}`}><div className={pageStyles.sectionTitle}><h2>连接信息</h2><p>使用服务商提供的 OpenAI 兼容 Chat Completions 接口。</p></div>
        <div className={styles.formGrid}><label>连接名称<input value={settings.name} maxLength={80} required onChange={event => setField("name", event.target.value)} placeholder="例如：我的模型服务" /></label><label>模型名称（Model ID）<input value={settings.model} maxLength={160} required onChange={event => setField("model", event.target.value)} placeholder="填写服务商提供的完整模型名称" /></label></div>
        <label>服务地址（Base URL）<input value={settings.baseUrl} type="url" maxLength={2048} required onChange={event => setField("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} /></label><p className={pageStyles.fieldHelp}>通常以 /v1 结尾，无需添加 /chat/completions。模型名称需与服务商提供的一致。</p>
        {targetChanged ? <p className={styles.notice}>服务地址已更换。请填写新服务的密钥；留空保存会清除旧密钥，旧密钥不会发给新地址。</p> : null}
        <label>服务密钥（API Key）<span className={styles.keyState}>{config.hasKey && !targetChanged ? "已安全保存" : "尚未保存"}</span><input value={apiKey} type="password" maxLength={4096} onChange={event => { interactionVersion.current += 1; refreshBlocked.current = true; setApiKey(event.target.value); setMessage(""); }} placeholder={config.hasKey && !targetChanged ? "留空保留当前密钥，填写可替换" : "粘贴此服务提供的 API Key"} autoComplete="new-password" spellCheck={false} disabled={!config.encryptionReady} /></label>
        <p className={pageStyles.fieldHelp}>密钥不会回显或公开。保存设置不会调用模型，也不会发送书签。</p>
      </section>
      <details className={styles.settingsSection}><summary className={styles.settingsSummary}><span>用量与预算</span><small>可保持默认</small></summary><div className={styles.advancedSettings}>
        <div className={styles.formGrid}>{([{ key: "batchSize", label: "每次分析条数" }, { key: "maxRequests", label: "每次任务最多请求数" }, { key: "concurrency", label: "同时请求数" }, { key: "maxOutputTokens", label: "每次最大输出 token" }] as const).map(field => <label key={field.key}>{field.label}<input type="number" required min={SMART_API_LIMITS[field.key].min} max={SMART_API_LIMITS[field.key].max} step={1} value={settings[field.key]} onChange={event => setField(field.key, Number(event.target.value))} /></label>)}</div>
        <div className={styles.formGrid}>{([{ key: "inputPricePerMillion", label: "每百万输入 token 单价" }, { key: "outputPricePerMillion", label: "每百万输出 token 单价" }, { key: "estimatedBudget", label: "本次估算预算上限" }] as const).map(field => <label key={field.key}>{field.label}<input type="number" min={field.key === "estimatedBudget" ? 0.000001 : 0} max={1000000} step="any" value={settings[field.key] ?? ""} placeholder="选填" onChange={event => setField(field.key, event.target.value === "" ? null : Number(event.target.value))} /></label>)}</div>
        <p className={styles.help}>单价与预算使用同一计价单位。未填写价格时显示“费用未知”；请求数与 token 上限仍会生效。预算是估算，实际账单可能不同。</p>
      </div></details>
      <details className={pageStyles.maintenance}><summary>连接维护与测试记录</summary><div className={pageStyles.maintenanceBody}><p>{config.testedAt ? `上次测试：${smartDate(config.testedAt)}。${config.testedVersion === config.version ? "当前版本已通过测试。" : "配置已修改，需要重新测试。"}` : "还没有通过测试的记录。测试只使用固定虚构样例。"}</p><div className={pageStyles.maintenanceActions}>
        <button type="button" className={styles.textLink} disabled={!canTest} onClick={openTest}>重新测试连接</button>
        {config.enabled && !statusUnknown ? <button type="button" className={styles.textLink} disabled={Boolean(busy) || dirty} onClick={() => void setEnabled(false)}>停用 AI</button> : null}
        {config.hasKey ? <button type="button" className={styles.dangerLink} disabled={Boolean(busy) || dirty} onClick={() => { setError(""); setDialog("clear"); }}>清除已保存的密钥</button> : null}
      </div>{dirty ? <p>有未保存的修改，先保存后再进行连接维护。</p> : null}</div></details>
      <p className={pageStyles.savedAt}>{config.updatedAt ? `上次保存：${smartDate(config.updatedAt)}。` : "连接信息尚未保存。"}只有修改后才需要保存。</p>
    </fieldset></form> : null}
    {!dialog ? <div className={pageStyles.nextAction} aria-label="连接设置下一步"><div><strong>{copy.next}</strong><span>{phase === "ready" ? "每次整理仍需确认发送" : dirty ? "未保存的修改保留在当前页面" : "不会自动发送真实书签"}</span></div>{phase === "ready" ? <Link href={returnTo} className={styles.primaryButton}>{returningToBatch ? "去整理这批书签" : copy.action} <span aria-hidden="true">→</span></Link> : <button type={phase === "draft" ? "submit" : "button"} form={phase === "draft" ? "smart-settings-form" : undefined} className={styles.primaryButton} disabled={buttonDisabled || (phase === "draft" && !dirty)} onClick={phase === "draft" ? undefined : nextAction}>{refreshing ? "正在同步状态…" : busy === "save" ? "正在保存…" : busy === "enabled" ? "正在更新…" : copy.action}</button>}</div> : null}
    {dialog === "test" && config ? <ManagerDialog title="确认测试这个连接" description="只向以下服务发送一个固定虚构样例，可能产生少量调用费用。不会发送真实书签。" onClose={() => setDialog(null)} busy={Boolean(busy)}><div className={styles.dialogBody}><dl className={styles.definitionList}><dt>目标服务</dt><dd>{config.settings.name} · {targetHost}</dd><dt>请求地址</dt><dd>{endpoint}</dd><dt>模型</dt><dd>{config.settings.model}</dd></dl><SmartFeedback error={visibleError} status={visibleErrorStatus} onRefresh={!busy && statusUnknown ? () => void refreshConnection(true) : undefined} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => setDialog(null)}>返回，不测试</button><button type="button" className={styles.primaryButton} disabled={Boolean(busy) || refreshing || statusUnknown} onClick={testConnection}>{busy === "test" ? "正在测试…" : "发送虚构样例测试"}</button></div></div></ManagerDialog> : null}
    {dialog === "clear" ? <ManagerDialog title="清除已保存的密钥？" description="清除后会停用 AI 并停止后续请求。已有建议、人工修改和收藏都会保留。" onClose={() => setDialog(null)} busy={Boolean(busy)}><div className={styles.dialogBody}><SmartFeedback error={visibleError} status={visibleErrorStatus} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => setDialog(null)}>保留密钥</button><button type="button" className={styles.primaryButton} disabled={Boolean(busy)} onClick={clearKey}>{busy ? "正在清除…" : "确认清除密钥"}</button></div></div></ManagerDialog> : null}
  </div>;
}
