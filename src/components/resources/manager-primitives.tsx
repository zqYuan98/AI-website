import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./manager-workspace.module.css";

export type ManagerIconName = "collection" | "star" | "clock" | "award" | "archive" | "download" | "upload" | "search" | "list" | "grid" | "plus" | "close" | "arrow" | "edit" | "folder" | "check";

const paths: Record<ManagerIconName, ReactNode> = {
  collection: <><path d="M6 3h12v18l-6-4-6 4z" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  award: <><circle cx="12" cy="8" r="5" /><path d="m8 12-1 9 5-3 5 3-1-9" /></>,
  archive: <><path d="M4 8h16v12H4zM3 4h18v4H3zM10 12h4" /></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5" /></>,
  upload: <><path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  list: <path d="M5 6h14M5 12h14M5 18h14" />,
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  arrow: <path d="M7 17 17 7M7 7h10v10" />,
  edit: <><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z" /></>,
  folder: <path d="M3 6h7l2 3h9v11H3z" />,
  check: <path d="m5 12 4 4L19 6" />,
};

export function ManagerIcon({ name }: { name: ManagerIconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function ManagerResourceIcon({ name, icon }: { name: string; icon: string }) {
  const [failed, setFailed] = useState(false);
  const safeIcon = /^\/images\/tools\/icons\/[a-z0-9-]+\.(png|webp|ico)$/.test(icon);
  return <span className={styles.resourceIcon} aria-hidden="true">{safeIcon && !failed
    ? <Image src={icon} alt="" width={34} height={34} unoptimized onError={() => setFailed(true)} />
    : name.slice(0, 1).toLocaleUpperCase()}</span>;
}

export function ManagerErrorNotice({ message, status = 0, onRefresh }: { message: string; status?: number; onRefresh?: () => void }) {
  return <div className={styles.error} role="alert"><p>{message}</p><div className={styles.errorActions}>
    {status === 401 || status === 403 ? <a className={styles.secondaryButton} href="/login" target="_blank" rel="noopener noreferrer">在新标签页重新登录</a> : null}
    {status === 409 ? <a className={styles.secondaryButton} href="/tools/manage" target="_blank" rel="noopener noreferrer">查看最新资源</a> : null}
    {onRefresh ? <button type="button" className={styles.secondaryButton} onClick={onRefresh}>刷新列表</button> : null}
  </div></div>;
}

export function ManagerDialog({ title, description, children, onClose, busy = false, wide = false }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className={`${styles.dialog} ${wide ? styles.dialogWide : ""}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.dialogHeader}><div><p className={styles.eyebrow}>MY VITAMIN LIBRARY</p><h2 id={titleId}>{title}</h2></div><button type="button" className={styles.iconButton} onClick={onClose} disabled={busy} aria-label="关闭对话框"><ManagerIcon name="close" /></button></header>
    {description ? <p id={descriptionId} className={styles.dialogDescription}>{description}</p> : null}
    {children}
  </dialog>;
}
