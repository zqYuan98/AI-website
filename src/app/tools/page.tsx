import type { Metadata } from "next";
import Image from "next/image";
import { ToolsExplorer } from "@/components/tools/tools-explorer";
import styles from "@/components/tools/tools.module.css";
import { getAllRecommendations, getAllTools } from "@/lib/curation";
import { site } from "@/lib/site";

const title = "工具箱";
const description =
  "围绕 AI 工作流、产品研究、设计与工程的精选工具和权威资源；每一项都说明适用场景、选择理由与边界。";

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
              这里不做链接仓库。只保留能进入真实任务的工具、方法与资料，并写清它适合谁、解决什么，以及什么时候不该选。
            </p>
            <div className={styles.heroMeta} aria-label="工具箱内容概览">
              <span>
                <strong>{tools.length}</strong> tools
              </span>
              <span>
                <strong>{recommendations.length}</strong> resources
              </span>
              <span>
                <strong>1</strong> shared standard
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
            <p className={styles.sectionIndex}>02 / Curated set</p>
            <h2>少一些收藏，多一些选择依据。</h2>
          </div>
          <p>
            搜索会同时覆盖场景、适用对象、使用方式、替代项和限制。标记为「本站工作流在用」的内容，仅表示它能由当前站点流程直接验证。
          </p>
        </div>

        <ToolsExplorer tools={tools} recommendations={recommendations} />

        <noscript>
          <div className={styles.noScript}>
            <h2>精选工具</h2>
            <ul>
              {tools.map((tool) => (
                <li key={tool.slug}>
                  <a href={tool.url} target="_blank" rel="noopener noreferrer">
                    {tool.name}
                  </a>
                  ：{tool.scenario} 适用边界：
                  {tool.avoidWhen}
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
