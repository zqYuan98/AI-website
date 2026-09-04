import Image from "next/image";
import Link from "next/link";
import { PostCard } from "@/components/post-card";
import { SectionHeading } from "@/components/section-heading";
import { WorkCard } from "@/components/work-card";
import { getFeaturedWork, getLatestPosts } from "@/lib/content";
import { getFeaturedTools } from "@/lib/curation";
import { site } from "@/lib/site";

const heroImageSizes = "(max-width: 899px) calc(100vw + 72px), 620px";
const heroBaseImage = {
  src: "/images/home/hero-orbit.png",
  alt: "",
  width: 2048,
  height: 2048,
  sizes: heroImageSizes,
} as const;

export default function HomePage() {
  const featured = getFeaturedWork(3);
  const posts = getLatestPosts(3);
  const tools = getFeaturedTools(4);

  return (
    <>
      <section className="home-hero relative overflow-hidden border-b border-line">
        <div className="home-hero-glow" aria-hidden="true" />
        <div className="container-page home-hero-grid relative grid items-center">
          <div className="home-hero-copy animate-rise">
            <p className="text-xs font-medium tracking-[0.12em] text-[#1f5dde] uppercase">
              {site.eyebrow}
            </p>
            <h1 className="mt-3 max-w-xl text-[36px] font-bold leading-[1.14] tracking-[-0.035em] text-[#07175c] sm:text-[44px]">
              {site.headline}
            </h1>
            <p className="mt-1.5 text-lg font-semibold tracking-tight text-[#17275f] sm:text-xl">
              {site.claim}
            </p>
            <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-6 text-[#526385] sm:text-[15px]">
              {site.tagline}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-8">
              <Link
                href="/work"
                className="inline-flex h-[42px] items-center rounded-lg bg-[#0f62fe] px-6 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(15,98,254,0.22)] transition-colors hover:bg-[#0b52dc]"
              >
                查看我的作品
              </Link>
              <Link
                href="/about"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-[#2766ef] transition-colors hover:text-[#0b52dc]"
              >
                了解更多
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </div>
          </div>

          <div className="home-hero-art animate-rise animate-delay-2 relative">
            <div className="home-hero-halo" aria-hidden="true" />
            <div className="home-hero-media">
              <Image
                {...heroBaseImage}
                alt=""
                loading="eager"
                fetchPriority="high"
                className="home-hero-layer home-hero-base"
              />
              <video
                className="home-hero-motion home-hero-layer home-hero-image"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                aria-hidden="true"
              >
                <source src="/images/home/hero-orbit-loop.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-work-section">
        <div className="container-page">
          <SectionHeading title="精选作品" href="/work" linkLabel="查看全部作品" />
          <div className="home-work-grid grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((work, index) => (
              <WorkCard key={work.slug} work={work} eager={index === 0} />
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-blog-section">
        <div className="container-page">
          <SectionHeading title="最近在写" href="/blog" linkLabel="查看全部博客" />
          <div className="home-post-list rounded-[10px] border border-line bg-white px-3 sm:px-4">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>

      <section className="home-section border-t border-line py-8 sm:py-10">
        <div className="container-page">
          <SectionHeading
            eyebrow="Curated, not collected"
            title="维他命精选"
            description="不是把链接堆满一页，而是说明每个工具进入真实工作的场景与边界。"
            href="/tools"
            linkLabel="打开工具箱"
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tools.map((tool) => (
              <a
                key={tool.slug}
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl border border-line bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#9bbcff] hover:shadow-[0_14px_30px_rgba(25,66,140,0.09)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f62fe] text-sm font-bold text-white">
                    {tool.name.slice(0, 1)}
                  </span>
                  <span className="rounded-full bg-[#edf4ff] px-2 py-1 text-[10px] font-medium text-[#2363cf]">
                    站点在用
                  </span>
                </div>
                <h3 className="mt-3 flex items-center gap-1 text-sm font-semibold text-[#07175c]">
                  {tool.name}
                  <span aria-hidden="true" className="text-[#4f79cb] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
                </h3>
                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-foreground-muted">
                  {tool.scenario}
                </p>
                <p className="mt-3 text-[10px] font-medium tracking-[0.08em] text-foreground-subtle uppercase">
                  {tool.category}
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section pb-10 sm:pb-14">
        <div className="container-page grid gap-4 lg:grid-cols-12">
          <Link
            href="/lab/ai-feature-acceptance"
            className="group relative min-h-[260px] overflow-hidden rounded-2xl bg-[#07143d] text-white lg:col-span-7"
          >
            <Image
              src="/images/lab/acceptance-loop.png"
              alt=""
              fill
              sizes="(max-width: 1023px) 100vw, 58vw"
              className="object-cover object-center opacity-65 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-75"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,20,61,0.98)_0%,rgba(7,20,61,0.9)_42%,rgba(7,20,61,0.18)_100%)]" />
            <div className="relative z-10 flex min-h-[260px] max-w-md flex-col justify-end p-6 sm:p-8">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#95baff] uppercase">Lab 001 · 可立即使用</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">AI 功能验收清单</h2>
              <p className="mt-3 text-sm leading-6 text-[#c7d5f2]">用 18 个问题检查真实需求、数据、人机边界、失败回退与验收证据。</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-white">开始检查 <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span></span>
            </div>
          </Link>

          <a
            href={site.shop.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative min-h-[260px] overflow-hidden rounded-2xl border border-line bg-[#f8f8fa] lg:col-span-5"
          >
            <Image
              src="/images/shop/nv-supply-portal.png"
              alt=""
              fill
              sizes="(max-width: 1023px) 100vw, 42vw"
              className="object-cover object-center transition duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.99)_0%,rgba(255,255,255,0.92)_46%,rgba(255,255,255,0.18)_100%)]" />
            <div className="relative z-10 flex min-h-[260px] max-w-[19rem] flex-col justify-end p-6 sm:p-8">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#59657c] uppercase">Independent store</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#101522]">小商店 · {site.shop.name}</h2>
              <p className="mt-3 text-sm leading-6 text-[#606b80]">{site.shop.description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#111827]">去补给站看看 <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span></span>
            </div>
          </a>
        </div>
      </section>
    </>
  );
}
