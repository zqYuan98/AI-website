import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AcceptanceChecklist } from "@/components/lab/acceptance-checklist";
import { AuthorSignature } from "@/components/lab/author-signature";
import styles from "@/components/lab/lab.module.css";
import { Markdown } from "@/components/markdown";
import {
  acceptanceChecklistGroups,
  getLabBySlug,
} from "@/lib/labs";
import { site } from "@/lib/site";

const slug = "ai-feature-acceptance";

export function generateMetadata(): Metadata {
  const lab = getLabBySlug(slug);
  if (!lab) return { title: "未找到实验" };

  return {
    title: lab.title,
    description: lab.summary,
    alternates: { canonical: `/lab/${slug}` },
    openGraph: {
      type: "website",
      title: `${lab.title} · Vitamin Lab`,
      description: lab.summary,
      url: `${site.url}/lab/${slug}`,
      images: [
        {
          url: lab.cover,
          width: 1536,
          height: 1024,
          alt: lab.coverAlt,
        },
      ],
    },
  };
}

const related = [
  {
    type: "WORK",
    title: "数智值班员",
    note: "看验收与人机边界如何进入行业 AI 工作闭环",
    href: "/work/digital-duty-officer",
  },
  {
    type: "BLOG",
    title: "企业 AI 别一上来就造 Agent",
    note: "先定义工作结果，再选择 Workflow、Skill 或 Agent",
    href: "/blog/dont-start-with-agent",
  },
  {
    type: "TOOLS",
    title: "维他命精选工具",
    note: "继续查看进入产品、研究与交付流程的工具",
    href: "/tools",
  },
];

export default function AcceptanceLabPage() {
  const lab = getLabBySlug(slug);
  if (!lab) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: lab.title,
    description: lab.summary,
    url: `${site.url}/lab/${slug}`,
    image: `${site.url}${lab.cover}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript for interactive checklist controls",
    isAccessibleForFree: true,
    inLanguage: "zh-CN",
    creator: {
      "@type": "Person",
      name: site.displayName,
      url: `${site.url}/about`,
    },
    featureList: [
      "18 项 AI 功能验收检查",
      "分组完成度与遗漏项汇总",
      "本地浏览器进度保存",
      "复制与下载 Markdown 清单",
    ],
  };

  return (
    <article className="container-page py-10 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <header className={styles.detailHeader}>
        <div className={styles.detailCopy}>
          <Link href="/lab" className={styles.backLink}>
            ← 返回实验室
          </Link>
          <h1>{lab.title}</h1>
          <p className={styles.detailSummary}>{lab.summary}</p>
          <div className={styles.detailMeta}>
            <span className={styles.status}>
              <span aria-hidden="true" />
              {lab.status}
            </span>
            <time dateTime={lab.updatedAt}>V1 · {lab.updatedAt}</time>
          </div>
        </div>
        <div className={styles.detailMedia}>
          <Image
            src={lab.cover}
            alt={lab.coverAlt}
            fill
            priority
            sizes="(max-width: 899px) 100vw, 55vw"
          />
        </div>
      </header>

      <section className={styles.methodSection} aria-labelledby="method-title">
        <div className={styles.methodCopy}>
          <p id="method-title" className={styles.sectionLabel}>
            Method note
          </p>
          <Markdown content={lab.body} />
        </div>
        <div className={styles.methodAside}>
          <aside className={styles.boundaryCard}>
            <strong>适用边界</strong>
            <p>{lab.limitation}</p>
          </aside>
          <AuthorSignature />
        </div>
      </section>

      <AcceptanceChecklist groups={acceptanceChecklistGroups} />

      <section className={styles.relatedSection} aria-labelledby="related-title">
        <p id="related-title" className={styles.sectionLabel}>
          Continue the loop
        </p>
        <div className={styles.relatedGrid}>
          {related.map((item) => (
            <Link key={item.href} href={item.href} className={styles.relatedCard}>
              <small>{item.type}</small>
              <strong>{item.title}</strong>
              <span>{item.note} →</span>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}
