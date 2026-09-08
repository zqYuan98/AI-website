"use client";

import Link from "next/link";
import { ManagerIcon } from "./manager-primitives";
import styles from "./smart-import.module.css";

export function SmartImportShell({ active, email, children }: { active: "imports" | "settings"; email?: string; children: React.ReactNode }) {
  return <section className={styles.workspace}>
    <header className={styles.workspaceTop}><Link className={styles.brand} href="/tools/manage"><span>NV</span>我的资源库 <small>私人云端</small></Link><div>{email ? <span className={styles.email}>{email}</span> : null}<Link href="/tools" className={styles.textLink}>公开资源页 <span aria-hidden="true">↗</span></Link></div></header>
    <div className={styles.workspaceGrid}><aside className={styles.sidebar}><p className={styles.navCaption}>我的资源库</p><nav aria-label="资源库导航"><Link href="/tools/manage"><ManagerIcon name="collection" />我的收藏</Link><Link href="/tools/manage/imports" aria-current={active === "imports" ? "page" : undefined}><ManagerIcon name="upload" />导入记录</Link><Link href="/tools/manage/settings" aria-current={active === "settings" ? "page" : undefined}><ManagerIcon name="grid" />AI 连接设置</Link></nav><p className={styles.sidebarNote}>导入后先看整理结果。<br />加入收藏，仅自己可见。</p></aside><div className={styles.main}>{children}</div></div>
  </section>;
}
