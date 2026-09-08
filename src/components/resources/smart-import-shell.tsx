"use client";

import Link from "next/link";
import { LibraryNavigation } from "./library-navigation";
import styles from "./smart-import.module.css";
import shellStyles from "./smart-import-shell.module.css";

export function SmartImportShell({ active, email, children }: { active: "imports" | "settings"; email?: string; children: React.ReactNode }) {
  return <section className={styles.workspace}>
    <header className={styles.workspaceTop}><Link className={styles.brand} href="/tools/manage"><span>NV</span>我的资源库 <small>私人云端</small></Link><div>{email ? <span className={styles.email}>{email}</span> : null}<Link href="/tools" className={styles.textLink}>公开资源页 <span aria-hidden="true">↗</span></Link></div></header>
    <LibraryNavigation active={active} />
    <div className={shellStyles.content}>{children}</div>
  </section>;
}
