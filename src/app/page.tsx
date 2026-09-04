import Image from "next/image";
import Link from "next/link";
import { PostCard } from "@/components/post-card";
import { SectionHeading } from "@/components/section-heading";
import { WorkCard } from "@/components/work-card";
import { getFeaturedWork, getLatestPosts } from "@/lib/content";
import { site } from "@/lib/site";

export default function HomePage() {
  const featured = getFeaturedWork(3);
  const posts = getLatestPosts(3);

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
                src="/images/home/hero-orbit.png"
                alt=""
                width={2048}
                height={2048}
                loading="eager"
                fetchPriority="high"
                className="home-hero-layer home-hero-base"
                sizes="(max-width: 899px) calc(100vw + 72px), 620px"
              />
              <div className="home-hero-motion">
                <Image
                  src="/images/home/hero-orbit-loop.gif"
                  alt="蓝紫渐变玻璃球体与环绕轨道动画"
                  width={960}
                  height={960}
                  unoptimized
                  loading="eager"
                  className="home-hero-layer home-hero-image"
                  sizes="(max-width: 899px) calc(100vw + 72px), 620px"
                />
              </div>
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
    </>
  );
}
