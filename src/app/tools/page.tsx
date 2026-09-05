import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ToolsExplorer } from "@/components/tools/tools-explorer";
import styles from "@/components/tools/tools.module.css";
import { getAllRecommendations, getAllTools, toPublicTool } from "@/lib/curation";
import { site } from "@/lib/site";

const title = "工具箱";
const description =
  "收藏 AI、产品、设计、开发与部署工具和阅读资源；按用途查找，已实践的精选另附选择理由与适用边界。";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools" },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${title} · ${site.name}`,
    description,
    url: "/tools",
    images: [
      {
        url: "/images/tools/tools-workbench.png",
        width: 1536,
        height: 1024,
        alt: "维他命工具箱的策展工作台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} · ${site.name}`,
    description,
    images: ["/images/tools/tools-workbench.png"],
  },
};

export default function ToolsPage() {
  const tools = getAllTools();
  const recommendations = getAllRecommendations();
  const itemList = [
    ...tools.map((tool) => ({
      name: tool.name,
      description: tool.scenario,
      url: tool.url,
    })),
    ...recommendations.map((item) => ({
      name: item.title,
      description: item.verdict,
      url: item.url,
    })),
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${site.displayName}的工具箱`,
    description,
    url: `${site.url}/tools`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: itemList.length,
      itemListElement: itemList.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Thing",
          name: item.name,
          description: item.description,
          url: item.url,
        },
      })),
    },
  };

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <section className={styles.hero} aria-labelledby="tools-title">
        <div className={`container-page ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Curated workflow index · 01</p>
            <h1 id="tools-title">
              工具不是答案，<span>工作流才是。</span>
            </h1>
            <p className={styles.heroLead}>
              从 AI、产品与设计，到开发、部署和日常效率，把会用到的工具收在一起。经过实践的精选，再写清选择理由与适用边界。
            </p>
            <div className={styles.heroMeta} aria-label="工具箱内容概览">
              <span>
                <strong>{tools.length}</strong> tools
              </span>
              <span>
                <strong>{recommendations.length}</strong> resources
              </span>
              <span>
                <strong>{tools.filter((tool) => tool.featured).length}</strong> featured
              </span>
            </div>
          </div>

          <div className={styles.heroArt}>
            <Image
              className={styles.heroImage}
              src="/images/tools/tools-workbench.png"
              alt="透明卡片沿工作路径排列，放大镜聚焦其中一个选择"
              fill
              priority
              sizes="(min-width: 1024px) 48vw, 100vw"
            />
            <div className={styles.artNote}>
              <span>NV</span>
              <p>先看任务，再看证据，最后才看工具。</p>
            </div>
          </div>
        </div>
      </section>

      <section id="curation" className={`container-page ${styles.curationSection}`}>
        <div className={styles.sectionIntro}>
          <div>
            <p className={styles.sectionIndex}>02 / Tools & collections</p>
            <h2>收藏有归处，选择有依据。</h2>
          </div>
          <p>
            按分类找到工具，或搜索名称、网址与用途。普通收藏不代表使用背书；「本站工作流在用」和详细短评仅保留给已有实践的工具。
          </p>
        </div>

        {process.env.NODE_ENV === "development" ? (
          <div className="mb-4 flex justify-end">
            <Link href="/tools/manage" className="rounded-lg border border-line bg-background-elevated px-4 py-2 text-sm font-semibold text-accent">
              ＋ 添加工具（本地维护）
            </Link>
          </div>
        ) : null}

        <ToolsExplorer tools={tools.map(toPublicTool)} recommendations={recommendations} />

        <p className="mt-5 text-xs leading-6 text-foreground-muted">
          外部网站及其内容、价格、可用性可能变化，请以目标网站为准。
        </p>

        <noscript>
          <div className={styles.noScript}>
            <h2>全部工具与收藏</h2>
            <ul>
              {tools.map((tool) => (
                <li key={tool.slug}>
                  <a href={tool.url} target="_blank" rel="noopener noreferrer">
                    {tool.name}
                  </a>
                  ：{tool.scenario || tool.subcategory || tool.category}
                  {tool.avoidWhen ? ` 适用边界：${tool.avoidWhen}` : ""}
                </li>
              ))}
            </ul>
            <h2>阅读与资源</h2>
            <ul>
              {recommendations.map((item) => (
                <li key={item.slug}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                  ：{item.verdict} 适用边界：
                  {item.boundary}
                </li>
              ))}
            </ul>
          </div>
        </noscript>
      </section>

      <section className={`container-page ${styles.standardsSection}`} aria-labelledby="standards-title">
        <div className={styles.standardsCard}>
          <div className={styles.standardsSignature}>
            <span className={styles.avatarFrame}>
              <Image
                className={styles.avatar}
                src="/images/about/vitamin-avatar-v5.png"
                alt="维他命的卡通头像"
                fill
                sizes="48px"
              />
            </span>
            <div>
              <span>Curated by Vitamin</span>
              <strong id="standards-title">Vitamin 的选择标准</strong>
            </div>
          </div>
          <ol className={styles.standardList}>
            <li>
              <span>01</span>
              <p>先确认问题真实存在，工具不能代替问题定义。</p>
            </li>
            <li>
              <span>02</span>
              <p>结果需要能被检查，错误需要能被发现和接管。</p>
            </li>
            <li>
              <span>03</span>
              <p>只有进入稳定工作流，能力才可能持续产生价值。</p>
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}
