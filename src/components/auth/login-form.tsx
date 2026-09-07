"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "./login-form.module.css";

function signInError(status: number): string {
  if (status === 429) return "登录尝试较多，请稍等片刻再试。";
  if (status === 401 || status === 400) return "邮箱或密码不正确，请检查后重试。";
  if (status === 403) return "请从本站登录页面重新操作；如果打开的是预览链接，请使用网站正式地址。";
  if (status === 404 || status === 503) return "登录服务尚未就绪，请稍后再试。";
  return "暂时无法登录，请稍后重试。";
}

export function LoginForm({ enabled, unavailable = false }: { enabled: boolean; unavailable?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(unavailable ? "登录服务暂时无法连接，请稍后重试。" : "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || busy) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-in/email", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin",
        body: JSON.stringify({ email, password, callbackURL: "/tools/manage" }),
      });
      if (!response.ok) { setError(signInError(response.status)); return; }
      const result = await response.json().catch(() => null);
      if (!result || result.error) { setError("没有收到有效的登录结果，请稍后重试。"); return; }
      // A successful sign-in is followed by the server's owner-session gate.
      router.replace("/tools/manage"); router.refresh();
    } catch { setError("网络连接中断，请检查连接后重试。"); }
    finally { setBusy(false); }
  }

  return <section className={styles.page}>
    <div className={styles.shell}>
      <Link href="/tools" className={styles.backLink}><span aria-hidden="true">←</span> 回到公开资源页</Link>
      <div className={styles.card}>
        <div className={styles.signature}><span>NV</span><p>MY VITAMIN LIBRARY</p></div>
        <header className={styles.heading}><h1>{enabled ? "回到你的资源库" : "私人资源库尚未启用"}</h1><p>{enabled ? "登录后，收藏、整理，再决定公开什么。" : "公开资源页可以正常浏览。管理入口准备完成后，即可使用所有者账号登录。"}</p></header>
        {enabled ? <form className={styles.form} onSubmit={submit}>
          <label htmlFor="owner-email">邮箱<input id="owner-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="你的登录邮箱" disabled={busy} /></label>
          <label htmlFor="owner-password">密码<span className={styles.passwordField}><input id="owner-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} placeholder="输入密码" disabled={busy} /><button type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "隐藏" : "显示"}</button></span></label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button type="submit" className={styles.submitButton} disabled={busy}>{busy ? "正在登录…" : "登录资源库"}<span aria-hidden="true">→</span></button>
          <details className={styles.recovery}><summary>忘记密码？</summary><p>请通过站点所有者的受控恢复流程重置密码。完成后，使用新密码重新登录。</p></details>
        </form> : <Link className={styles.submitButton} href="/tools">浏览公开资源 <span aria-hidden="true">→</span></Link>}
        <div className={styles.note}><span aria-hidden="true">▣</span><p>{enabled ? "此入口仅供站点所有者使用。私人收藏与备注不会随保存自动公开。" : "好工具和好内容，仍然在公开资源页等你。"}</p></div>
      </div>
    </div>
  </section>;
}
