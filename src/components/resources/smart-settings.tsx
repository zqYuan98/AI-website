"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { SMART_API_DEFAULT_SETTINGS, SMART_API_LIMITS, type ApiConfigView, type ApiSettings, type ApiTestResult } from "@/lib/smart-api-types";
import { ManagerDialog } from "./manager-primitives";
import { SmartFeedback } from "./smart-import-feedback";
import { smartDate, smartError, smartErrorStatus, smartRequest } from "./smart-api";
import styles from "./smart-import.module.css";

export function SmartSettings() {
  const [config, setConfig] = useState<ApiConfigView | null>(null);
  const [settings, setSettings] = useState<ApiSettings>({ ...SMART_API_DEFAULT_SETTINGS });
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<"test" | "clear" | null>(null);
  const dirty = Boolean(config && (JSON.stringify(settings) !== JSON.stringify(config.settings) || apiKey));
  const targetChanged = Boolean(config?.hasKey && settings.baseUrl.trim() !== config.settings.baseUrl);

  useEffect(() => {
    const controller = new AbortController();
    smartRequest<ApiConfigView>("smart-settings", { action: "read" }, controller.signal)
      .then(result => { setConfig(result); setSettings(result.settings); })
      .catch(failure => { if (!controller.signal.aborted) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadVersion]);

  function setField<K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) { setSettings(previous => ({ ...previous, [key]: value })); }
  function failed(failure: unknown) { setError(smartError(failure)); setErrorStatus(smartErrorStatus(failure)); }
  function reload() { setError(""); setLoading(true); setLoadVersion(value => value + 1); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!config || busy) return;
    setBusy("save"); setError(""); setMessage("");
    try {
      const result = await smartRequest<ApiConfigView>("smart-settings", { action: "save", version: config.version, settings, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
      setConfig(result); setSettings(result.settings); setApiKey("");
      setMessage("配置已保存。请测试连接，通过后再启用；保存不会发送书签。");
    } catch (failure) { failed(failure); }
    finally { setBusy(""); }
  }
  async function setEnabled(enabled: boolean) {
    if (!config || busy) return; setBusy("enabled"); setError(""); setMessage("");
    try {
      const result = await smartRequest<ApiConfigView>("smart-settings", { action: "set-enabled", version: config.version, enabled });
      setConfig(result); setMessage(enabled ? "智能建议已启用。每次分析前仍需确认发送范围。" : "智能建议已停用，后续请求将停止。规则建议和手工整理仍可使用。");
    } catch (failure) { failed(failure); }
    finally { setBusy(""); }
  }
  async function testConnection() {
    if (!config || busy) return; setBusy("test"); setError(""); setMessage("");
    try {
      const result = await smartRequest<ApiTestResult>("smart-settings", { action: "test", version: config.version });
      setConfig(result.config); setDialog(null);
      setMessage(`连接测试通过，返回的分类结果可用。${result.usage?.inputTokens != null || result.usage?.outputTokens != null ? `本次用量：输入 ${result.usage?.inputTokens ?? "未知"}、输出 ${result.usage?.outputTokens ?? "未知"} token。` : "服务商未返回完整用量，本次费用未知。"} 现在可以启用。`);
    } catch (failure) { failed(failure); }
    finally { setBusy(""); }
  }
  async function clearKey() {
    if (!config || busy) return; setBusy("clear"); setError("");
    try {
      const result = await smartRequest<ApiConfigView>("smart-settings", { action: "clear-key", version: config.version });
      setConfig(result); setApiKey(""); setDialog(null); setMessage("密钥已清除，智能建议已停用。后续使用需填写新密钥并重新测试。");
    } catch (failure) { failed(failure); }
    finally { setBusy(""); }
  }
  let targetHost = "尚未填写";
  try { targetHost = new URL(config?.settings.baseUrl || "").host; } catch { /* Display the empty-state label. */ }
  const endpoint = config?.settings.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const canEnable = Boolean(config?.encryptionReady && config.hasKey && config.testedVersion === config.version && !dirty);

  return <>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>A LITTLE HELP, ON YOUR TERMS</p><h1>AI 连接设置</h1><p>接入自己的模型服务，让分类建议更进一步。</p></div><Link href="/tools/manage/imports" className={styles.secondaryButton}>回到导入记录 <span aria-hidden="true">→</span></Link></header>
    <div className={styles.settingsIntro}><div><strong>规则先行，模型按需。</strong><p>不开启外部 API，也能去重、分类和私有入库。启用后，每次分析仍会先展示实际发送的标题与域名。</p></div><span className={styles.statusBadge}>{config?.enabled ? "已启用" : "未启用"}</span></div>
    {!dialog ? <SmartFeedback error={error} status={errorStatus} message={message} onRefresh={!config ? reload : undefined} /> : null}
    {loading ? <p className={styles.loading} role="status">正在读取连接设置…</p> : config ? <form className={styles.settingsForm} onSubmit={save}><fieldset disabled={Boolean(busy)} className={styles.settingsFields}>
      <section className={styles.settingsSection}><div className={styles.sectionHeading}><h2>01 <span>连接服务</span></h2><p>支持 OpenAI 兼容的 Chat Completions 接口。</p></div>
        <div className={styles.formGrid}><label>连接名称<input value={settings.name} maxLength={80} required onChange={event => setField("name", event.target.value)} placeholder="例如：我的模型服务" /></label><label>模型 ID<input value={settings.model} maxLength={200} required onChange={event => setField("model", event.target.value)} placeholder="填写服务商提供的模型 ID" /></label></div>
        <label>Base URL<input value={settings.baseUrl} type="url" maxLength={2048} required onChange={event => setField("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} /></label><p className={styles.help}>填写服务商的公网 HTTPS 地址。模型 ID 可手动输入，无需获取模型列表。</p>
        {targetChanged ? <p className={styles.notice}>目标地址已更改。保存后会清除旧密钥，并要求重新测试；旧服务的密钥不会发给新地址。</p> : null}
        <label>API Key <span className={styles.keyState}>{config.hasKey && !targetChanged ? "已安全保存" : "尚未保存"}</span><input value={apiKey} type="password" maxLength={4096} onChange={event => setApiKey(event.target.value)} placeholder={config.hasKey && !targetChanged ? "留空保留已保存的密钥；输入可替换" : "输入此服务的 API Key"} autoComplete="new-password" spellCheck={false} disabled={!config.encryptionReady} /></label>
        <p className={styles.help}>密钥保存后不会回显，也不会写入资源备份或公开内容。</p>
        {!config.encryptionReady ? <p className={styles.notice}>安全密钥存储尚未就绪，暂时不能保存密钥或启用服务。规则筛选与手工整理仍可使用。</p> : null}
        {config.hasKey ? <button type="button" className={styles.dangerLink} disabled={Boolean(busy)} onClick={() => { setError(""); setDialog("clear"); }}>清除已保存的密钥</button> : null}
      </section>
      <details className={styles.settingsSection}><summary className={styles.settingsSummary}>02 <span>用量与预算</span><small>按需要调整</small></summary><div className={styles.advancedSettings}>
        <div className={styles.formGrid}>{([{ key: "batchSize", label: "每次分析条数" }, { key: "maxRequests", label: "每次任务最多请求数" }, { key: "concurrency", label: "同时请求数" }, { key: "maxOutputTokens", label: "每次最大输出 token" }] as const).map(field => <label key={field.key}>{field.label}<input type="number" required min={SMART_API_LIMITS[field.key].min} max={SMART_API_LIMITS[field.key].max} step={1} value={settings[field.key]} onChange={event => setField(field.key, Number(event.target.value))} /></label>)}</div>
        <div className={styles.formGrid}>{([{ key: "inputPricePerMillion", label: "每百万输入 token 单价" }, { key: "outputPricePerMillion", label: "每百万输出 token 单价" }, { key: "estimatedBudget", label: "本次估算预算上限" }] as const).map(field => <label key={field.key}>{field.label}<input type="number" min={field.key === "estimatedBudget" ? 0.000001 : 0} max={1000000} step="any" value={settings[field.key] ?? ""} placeholder="选填" onChange={event => setField(field.key, event.target.value === "" ? null : Number(event.target.value))} /></label>)}</div>
        <p className={styles.help}>单价与预算使用同一计价单位。未填写价格时显示“费用未知”，仍按请求数与 token 上限控制。预算用于估算，实际账单可能不同。</p>
      </div></details>
      <section className={styles.settingsSection}><div className={styles.sectionHeading}><h2>03 <span>测试与启用</span></h2><p>测试只发送固定虚构样例，不使用你的书签。</p></div>
        <div className={styles.connectionState}><div><strong>{config.testedVersion === config.version ? "当前配置已通过测试" : "当前配置尚未通过测试"}</strong><p>{config.testedAt ? `上次测试：${smartDate(config.testedAt)}` : "先保存，再检查接口能否返回可用的分类结果。"}</p></div><button type="button" className={styles.secondaryButton} disabled={Boolean(busy) || dirty || !config.hasKey || !config.encryptionReady} onClick={() => { setError(""); setDialog("test"); }}>测试连接</button></div>
        <label className={styles.switchLabel}><input type="checkbox" checked={config.enabled} disabled={Boolean(busy) || (!config.enabled && !canEnable)} onChange={event => void setEnabled(event.target.checked)} /><span><strong>允许使用外部模型建议</strong><small>启用后仍需逐次确认发送范围；停用会停止后续请求。</small></span></label>
        {dirty ? <p className={styles.help}>有未保存的修改。保存会停用当前连接，需要重新测试后启用。</p> : null}
      </section>
      <footer className={styles.settingsFooter}><span className={styles.help}>{config.updatedAt ? `上次保存：${smartDate(config.updatedAt)}` : "还没有保存连接配置"}</span><button type="submit" className={styles.primaryButton} disabled={Boolean(busy)}>{busy === "save" ? "正在保存…" : "保存设置"}</button></footer>
    </fieldset></form> : null}
    {dialog === "test" && config ? <ManagerDialog title="确认测试这个连接" description="测试会向以下服务发送固定虚构样例，可能产生少量调用费用。不会发送任何真实书签。" onClose={() => setDialog(null)} busy={Boolean(busy)}><div className={styles.dialogBody}><dl className={styles.definitionList}><dt>目标主机</dt><dd>{targetHost}</dd><dt>请求地址</dt><dd>{endpoint}</dd><dt>模型</dt><dd>{config.settings.model}</dd></dl><SmartFeedback error={error} status={errorStatus} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => setDialog(null)}>取消</button><button type="button" className={styles.primaryButton} disabled={Boolean(busy)} onClick={testConnection}>{busy === "test" ? "正在测试…" : "发送虚构样例测试"}</button></div></div></ManagerDialog> : null}
    {dialog === "clear" ? <ManagerDialog title="清除已保存的密钥？" description="清除后会停用模型服务并停止后续请求。规则建议、人工决定和已入库资源都会保留。" onClose={() => setDialog(null)} busy={Boolean(busy)}><SmartFeedback error={error} status={errorStatus} /><div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => setDialog(null)}>保留密钥</button><button type="button" className={styles.primaryButton} disabled={Boolean(busy)} onClick={clearKey}>{busy ? "正在清除…" : "确认清除密钥"}</button></div></ManagerDialog> : null}
  </>;
}
