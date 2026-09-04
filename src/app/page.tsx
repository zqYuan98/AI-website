import Link from "next/link";
import { PlaceholderBadge } from "@/components/badge";
import { SectionHeading } from "@/components/section-heading";
import { WorkCard } from "@/components/work-card";
import { formatDate, getFeaturedWork, getLatestPosts } from "@/lib/content";
import { site } from "@/lib/site";

export default function HomePage() {
  const featured = getFeaturedWork(3);
  const posts = getLatestPosts(3);

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(59_130_246_/_0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgb(124_58_237_/_0.12),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top_right,rgb(96_165_250_/_0.16),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgb(167_139_250_/_0.12),transparent_50%)]" />
          <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgb(15_23_42_/_0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_23_42_/_0.04)_1px,transparent_1px)] [background-size:64px_64px] dark:opacity-20" />
        </div>

        <div className="container-page relative grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-12 lg:gap-8 lg:py-24">
          <div className="animate-rise lg:col-span-6 xl:col-span-6">
            <p className="text-xs font-semibold tracking-[0.24em] text-accent uppercase">
              {site.eyebrow}
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.12]">
              {site.headline}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-foreground-muted sm:text-lg">
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
                href="/about"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-accent"
              >
                了解更多
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </div>
          </div>

          <div className="animate-rise animate-delay-2 relative lg:col-span-6">
            <div className="relative mx-auto aspect-[5/4] w-full max-w-lg lg:max-w-none">
              <div className="absolute inset-0 rounded-[1.75rem] border border-line/70 bg-background-elevated/80 shadow-[var(--shadow-lift)] backdrop-blur-sm" />
              <div className="absolute inset-[10%] rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-violet-accent opacity-90 blur-2xl" />
              <div className="absolute inset-[22%] rounded-full bg-gradient-to-tr from-[#2563eb] via-[#6366f1] to-[#7c3aed] shadow-[var(--shadow-glow)]" />
              <div className="absolute inset-[18%] rounded-full border border-white/25 dark:border-white/10" />
              <div className="absolute inset-[12%] rounded-full border border-white/10 dark:border-white/5" />
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="rounded-2xl border border-white/35 bg-white/15 px-6 py-5 text-center text-white shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-white/10">
                  <p className="text-[11px] font-medium tracking-[0.22em] uppercase opacity-85">
                    Product · Research · Writing
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-tight">{site.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-16 sm:py-20">
        <SectionHeading
          eyebrow="Work"
          title="精选作品"
          description="目前多为个人练习与概念稿，已用「示例内容」标明；欢迎当作思考过程来看。"
          href="/work"
          linkLabel="查看全部作品"
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((work, index) => (
            <div
              key={work.slug}
              className={`animate-rise animate-delay-${Math.min(index + 1, 4)}`}
            >
              <WorkCard work={work} />
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-background-subtle">
        <div className="container-page py-16 sm:py-20">
          <SectionHeading
            eyebrow="Blog"
            title="最近在写"
            description="关于学习产品、写作与把事情做出来的笔记。"
            href="/blog"
            linkLabel="查看全部博客"
          />
          <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-background-elevated shadow-[var(--shadow-soft)]">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="flex flex-col gap-3 px-5 py-5 transition-colors hover:bg-background-subtle sm:flex-row sm:items-center sm:gap-6 sm:px-6"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <span className="text-sm font-semibold">文</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold tracking-tight text-foreground">
                        {post.title}
                      </h3>
                      {post.placeholder ? <PlaceholderBadge /> : null}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-foreground-muted">
                      {post.summary}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs text-foreground-subtle sm:text-right">
                    <time dateTime={post.date}>{formatDate(post.date)}</time>
                    {post.readingTime ? (
                      <p className="mt-1">{post.readingTime}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
