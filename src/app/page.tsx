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
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(59_130_246_/_0.16),transparent_52%),radial-gradient(ellipse_at_left,rgb(124_58_237_/_0.10),transparent_48%)]"
        />
        <div className="container-page relative grid items-center gap-10 py-16 sm:gap-12 sm:py-20 lg:grid-cols-12 lg:py-24">
          <div className="animate-rise lg:col-span-6">
            <p className="text-xs font-semibold tracking-[0.24em] text-accent uppercase">
              {site.eyebrow}
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.35rem] lg:leading-[1.12]">
              {site.headline}
            </h1>
            <p className="mt-3 text-xl font-medium tracking-tight text-navy-800 dark:text-navy-100 sm:text-2xl">
              {site.claim}
            </p>
            <p className="mt-5 max-w-xl text-base leading-8 text-foreground-muted sm:text-[1.05rem]">
              {site.tagline}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/work"
                className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-accent-contrast shadow-[var(--shadow-soft)] transition-colors hover:bg-accent-hover"
              >
                查看我的作品
              </Link>
              <Link
                href="/blog"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-accent"
              >
                阅读最新文章
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </div>
          </div>

          <div className="animate-rise animate-delay-2 relative lg:col-span-6">
            <div className="relative mx-auto aspect-square w-full max-w-md lg:max-w-none">
              <Image
                src="/hero/orb.svg"
                alt="蓝紫渐变 3D 玻璃球体主视觉"
                fill
                priority
                unoptimized
                className="object-contain drop-shadow-[0_24px_60px_rgba(99,102,241,0.28)]"
                sizes="(max-width: 1024px) 90vw, 42vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-16 sm:py-20">
        <SectionHeading
          title="精选作品"
          description="一个主案例，加上能解释职业跨度的精选实践。"
          href="/work"
          linkLabel="查看全部作品"
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((work) => (
            <WorkCard key={work.slug} work={work} />
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-background-subtle">
        <div className="container-page py-16 sm:py-20">
          <SectionHeading
            title="最近在写"
            description="关于 AI 产品、交付与职业判断的笔记。"
            href="/blog"
            linkLabel="查看全部博客"
          />
          <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-background-elevated px-4 shadow-[var(--shadow-soft)] sm:px-6">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16 text-center sm:py-20">
        <p className="mx-auto max-w-2xl text-base leading-8 text-foreground-muted">
          我会在这里持续记录做过的产品、被推翻的判断、正在验证的想法，以及一些真正帮我工作的工具和方法。
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-foreground-subtle">
          如果你也在做行业 AI、产品化、Agent 交付或个人数字产品，可以带着一个具体问题来找我。
        </p>
        <Link
          href={"/about#contact"}
          className="mt-8 inline-flex h-11 items-center rounded-full border border-accent px-6 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          联系我
        </Link>
      </section>
    </>
  );
}
