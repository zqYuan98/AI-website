import type { Metadata } from "next";
import Link from "next/link";
import { PublicResourceExplorer } from "@/components/resources/public-resource-explorer";
import styles from "@/components/resources/public-library.module.css";
import { getPublicResources } from "@/lib/public-resources";
import { site } from "@/lib/site";

const title = "资源库";
const description = "把值得用的工具、值得读的内容放在一个地方。浏览 Vitamin 的精选、使用理由与阅读资料，按用途查找公开资源。";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tools" },
  openGraph: { type: "website", siteName: site.name, title: `${title} · ${site.name}`, description, url: "/tools" },
  twitter: { card: "summary", title: `${title} · ${site.name}`, description },
};

export default function ToolsPage() {
  const resources = getPublicResources();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${site.displayName}的资源库`,
    description,
    url: `${site.url}/tools`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: resources.length,
      itemListElement: resources.map((resource, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: { "@type": "Thing", name: resource.name, description: resource.description, url: resource.url },
      })),
    },
  };

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className={`container-page ${styles.container}`}>
        <header className={styles.pageHeading}>
          <div><p className={styles.eyebrow}>THE VITAMIN LIBRARY</p><h1>好工具，值得被找到<span>。</span></h1><p className={styles.intro}>把值得用的工具、值得读的内容，放在一个地方。</p></div>
          <span className={styles.authorSignature}>Curated by <strong>Vitamin</strong><span aria-hidden="true">↗</span></span>
        </header>
        <PublicResourceExplorer resources={resources} />
        <footer className={styles.pageFooter}><p>外部内容会持续变化，选择适合当下问题的资源。</p>{process.env.NODE_ENV === "development" ? <Link href="/tools/manage">我的收藏 <span>本机管理 ↗</span></Link> : null}</footer>
        <noscript><section className={styles.noScript}><h2>全部公开资源</h2><p>启用 JavaScript 可使用搜索与用途筛选，也可以直接浏览以下链接。</p><ul>{resources.map((resource) => <li key={resource.id}><a href={resource.url} target="_blank" rel="noopener noreferrer">{resource.name}</a>：{resource.description}</li>)}</ul></section></noscript>
      </div>
    </div>
  );
}
