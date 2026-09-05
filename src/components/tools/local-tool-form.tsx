"use client";

import { useState, type FormEvent } from "react";
import { TOOL_CATEGORIES, TOOL_SUBCATEGORIES } from "@/lib/tool-taxonomy";
import styles from "./local-tool-form.module.css";

export function LocalToolForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const [category, subcategory = ""] = String(data.get("classification")).split("/");
    setPending(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/local-tools", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name"), url: data.get("url"), category, subcategory, scenario: data.get("scenario") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败，请稍后重试。");
      setMessage(`「${result.name}」已保存到项目${result.iconSaved ? "，图标已缓存" : "，图标暂用首字母兜底"}。部署后会在公开网站显示。`);
      form.reset();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "保存失败。"); }
    finally { setPending(false); }
  }

  return (
    <section className={`container-page ${styles.page}`}>
      <a href="/tools#curation" className={styles.back}>← 返回工具箱</a>
      <p className={styles.eyebrow}>Local workspace · 仅本机</p>
      <h1>添加一个工具</h1>
      <p className={styles.lead}>名称、网址、分类，填好即可。图标自动尝试获取，一句话说明可以以后补。</p>
      <form className={styles.form} onSubmit={submit}>
        <label>名称 <span>*</span><input name="name" required maxLength={80} placeholder="例如：一个新的工作工具" autoComplete="off" /></label>
        <label>网址 <span>*</span><input name="url" type="url" required maxLength={2048} placeholder="https://example.com" autoComplete="url" /></label>
        <label>分类 <span>*</span><select name="classification" required defaultValue="">
          <option value="" disabled>选择用途分类</option>
          {TOOL_CATEGORIES.map(category => <optgroup key={category} label={category}>
            <option value={category}>{category}</option>
            {TOOL_SUBCATEGORIES[category].map(subcategory => <option key={subcategory} value={`${category}/${subcategory}`}>{category} / {subcategory}</option>)}
          </optgroup>)}
        </select></label>
        <details><summary>补充一句话说明（选填）</summary><label className={styles.optional}>用途说明<textarea name="scenario" maxLength={200} rows={3} placeholder="记一下它能帮你解决什么问题。" /></label></details>
        <div className={styles.actions}><button type="submit" disabled={pending}>{pending ? "正在保存…" : "保存到项目"}</button><a href="/tools#curation">返回工具箱</a></div>
        {message ? <p className={styles.success} role="status">{message}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </form>
      <p className={styles.note}>这是开发模式下的本地维护入口，内容保存在项目的收藏文件中，不是浏览器临时收藏。生产环境关闭此入口；保存不会自动部署或修改线上网站。</p>
    </section>
  );
}
