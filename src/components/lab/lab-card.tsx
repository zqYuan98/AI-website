import Image from "next/image";
import Link from "next/link";
import type { LabMeta } from "@/lib/labs";
import styles from "./lab.module.css";

export function LabCard({ lab }: { lab: LabMeta }) {
  return (
    <article className={styles.flagshipCard}>
      <div className={styles.flagshipCopy}>
        <div className={styles.flagshipMeta}>
          <span className={styles.status}>
            <span aria-hidden="true" />
            {lab.status}
          </span>
          <time dateTime={lab.updatedAt}>更新于 {lab.updatedAt}</time>
        </div>
        <h2>{lab.title}</h2>
        <p className={styles.summary}>{lab.summary}</p>

        <dl className={styles.labFacts}>
          <div>
            <dt>解决什么</dt>
            <dd>{lab.problem}</dd>
          </div>
          <div>
            <dt>怎么使用</dt>
            <dd>{lab.usage}</dd>
          </div>
          <div>
            <dt>使用边界</dt>
            <dd>{lab.limitation}</dd>
          </div>
        </dl>

        <Link href={`/lab/${lab.slug}`} className={styles.primaryLink}>
          打开实验
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      <Link
        href={`/lab/${lab.slug}`}
        className={styles.flagshipMedia}
        aria-label={`打开${lab.title}`}
      >
        <Image
          src={lab.cover}
          alt={lab.coverAlt}
          fill
          priority
          className={styles.flagshipImage}
          sizes="(max-width: 899px) 100vw, 48vw"
        />
        <span className={styles.mediaIndex} aria-hidden="true">
          LAB / 01
        </span>
      </Link>
    </article>
  );
}
