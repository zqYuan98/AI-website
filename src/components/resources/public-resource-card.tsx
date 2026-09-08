"use client";

import { ToolIcon } from "@/components/tools/tool-icon";
import { resourceHostname, resourceReadingType } from "@/lib/resource-explorer-state";
import { RESOURCE_KIND_LABELS, type PublicResource } from "@/lib/resource-types";
import styles from "./public-library.module.css";

type ResourceCardProps = {
  resource: PublicResource;
  onDetails: (resource: PublicResource) => void;
  layout?: "grid" | "list";
  featured?: boolean;
};

export function PublicResourceCard({ resource, onDetails, layout = "grid", featured = false }: ResourceCardProps) {
  return (
    <article className={`${styles.resourceCard} ${layout === "list" ? styles.listCard : ""} ${featured ? styles.featuredCard : ""}`}>
      <div className={styles.cardIdentity}>
        <ToolIcon name={resource.name} src={resource.icon} size={featured ? 44 : 36} />
        <div className={styles.cardCopy}>
          <div className={styles.cardTitle}>
            <h3><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.name}<span className={styles.srOnly}>（在新标签页打开）</span></a></h3>
          </div>
          <div className={styles.cardMeta}>
            <span className={styles.kindLabel}>{RESOURCE_KIND_LABELS[resource.kind]}</span>
            <span aria-hidden="true">·</span><span>{resource.subcategory || resource.category}</span>
            {!featured && resource.featured ? <span className={styles.featuredLabel}>精选</span> : null}
          </div>
        </div>
        <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.externalLink} aria-label={`打开 ${resource.name}（新标签页）`}><span aria-hidden="true">↗</span></a>
      </div>
      <div className={styles.cardBody}>
        <p className={styles.description}>{resource.description || `${resource.subcategory || resource.category}相关${RESOURCE_KIND_LABELS[resource.kind]}。`}</p>
        {resource.recommendation.trim() ? (
          <button type="button" className={styles.detailLink} onClick={() => onDetails(resource)} aria-label={`为什么推荐 ${resource.name}`}>推荐理由</button>
        ) : null}
      </div>
    </article>
  );
}

const PUBLISHERS: Record<string, string> = {
  "openai.com": "OpenAI",
  "anthropic.com": "Anthropic",
  "pair.withgoogle.com": "Google PAIR",
  "developers.google.com": "Google",
  "martinfowler.com": "Martin Fowler",
};

export function PublicReadingList({ resources, onDetails }: { resources: PublicResource[]; onDetails: ResourceCardProps["onDetails"] }) {
  return (
    <ul className={styles.readingList}>
      {resources.map((resource) => {
        const host = resourceHostname(resource.url);
        return (
          <li className={styles.readingRow} key={resource.id}>
            <span className={styles.readingSource}>{PUBLISHERS[host] ?? host}</span>
            <a className={styles.readingTitle} href={resource.url} target="_blank" rel="noopener noreferrer">{resource.name}<span className={styles.srOnly}>（在新标签页打开）</span></a>
            <div className={styles.readingActions}>
              <span>{resourceReadingType(resource)}</span>
              {resource.recommendation.trim() ? <button onClick={() => onDetails(resource)} aria-label={`阅读 ${resource.name} 的推荐理由`} className={styles.readingDetail}>导读</button> : null}
              <a href={resource.url} target="_blank" rel="noopener noreferrer" aria-label={`打开 ${resource.name}（新标签页）`} className={styles.externalLink}><span aria-hidden="true">↗</span></a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
