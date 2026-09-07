"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ToolIcon } from "@/components/tools/tool-icon";
import { resourceHostname } from "@/lib/resource-explorer-state";
import { RESOURCE_KIND_LABELS, type PublicResource } from "@/lib/resource-types";
import styles from "./public-library.module.css";

export function PublicResourceDetail({ resource, onClose }: { resource: PublicResource; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus({ preventScroll: true });
    };
  }, []);

  const details = [
    ["为什么推荐", resource.recommendation],
    ["适合谁", resource.audience],
    ["怎样使用", resource.usage === resource.recommendation ? "" : resource.usage],
    ["适用边界", resource.boundary],
    ["也可以看看", resource.alternatives.join(" · ")],
  ].filter(([, value]) => value.trim());

  return (
    <dialog ref={dialogRef} className={styles.detailDialog} aria-labelledby="resource-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.detailPanel}>
        <div className={styles.detailTopline}>
          <span>{resource.featured ? "VITAMIN’S PICKS" : "阅读与使用笔记"}</span>
          <button className={styles.closeButton} onClick={onClose} aria-label="关闭资源详情" autoFocus><span aria-hidden="true">×</span></button>
        </div>
        <ToolIcon name={resource.name} src={resource.icon} size={56} />
        <h2 id="resource-detail-title" className={styles.detailTitle}>{resource.name}</h2>
        <p className={styles.detailSummary}>{resource.description}</p>
        <div className={styles.detailTags}><span>{RESOURCE_KIND_LABELS[resource.kind]}</span><span>{resource.category}</span>{resource.usedByVitamin ? <span>本站工作流在用</span> : null}</div>
        <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.primaryButton}>打开 {resourceHostname(resource.url)} <span aria-hidden="true">↗</span></a>
        <dl className={styles.detailSections}>
          {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {resource.relatedHref ? <Link href={resource.relatedHref} className={styles.relatedLink}>查看相关实践 <span aria-hidden="true">→</span></Link> : null}
        {resource.updatedAt ? <p className={styles.detailDate}>内容更新于 {resource.updatedAt}</p> : null}
      </div>
    </dialog>
  );
}
