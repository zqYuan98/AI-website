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
          className="pointer-events-none absolute inset-0"
        >
          <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-brand-400/30 blur-3xl dark:bg-brand-500/20" />
          <div className="absolute top-32 -left-20 h-80 w-80 rounded-full bg-violet-accent/20 blur-3xl dark:bg-violet-accent/15" />
          <div className="absolute right-[12%] bottom-0 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-400/10" />
        </div>

        <div className="container-page relative grid items-center gap-12 py-20 lg:grid-cols-12 lg:py-28">
          <div className="animate-rise lg:col-span-7">
            <p className="text-xs font-semibold tracking-[0.22em] text-accent uppercase">
              {site.eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem] lg:leading-[1.15]">
              {site.headline}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-foreground-muted sm:text-lg">
              {site.tagline}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/work"
                className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-contrast shadow-[var(--shadow-soft)] transition-colors hover:bg-accent-hover"
              >
                查看我的作品
              </Link>
              <Link
                href="/about"
                className="inline-flex h-11 items-center rounded-full border border-line bg-background-elevated px-5 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:text-accent"
              >
                了解更多
              </Link>
            </div>
          </div>

          <div className="animate-rise animate-delay-2 relative lg:col-span-5">
            <div className="relative mx-auto aspect-square max-w-md">
              <div className="absolute inset-[8%] rounded-[2rem] border border-line/80 bg-background-elevated/70 shadow-[var(--shadow-lift)] backdrop-blur-sm" />
              <div className="absolute inset-[18%] rounded-full bg-gradient-to-br from-brand-400 via-violet-accent to-cyan-400 opacity-90 blur-2xl" />
              <div className="absolute inset-[28%] rounded-full bg-gradient-to-tr from-brand-600 to-violet-accent shadow-[var(--shadow-glow)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl border border-white/30 bg-white/10 px-5 py-4 text-center text-white shadow-lg backdrop-blur-md dark:border-white/10">
                  <p className="text-xs tracking-[0.2em] uppercase opacity-80">
                    Product · Research · Writing
                  </p>
                  <p className="mt-2 text-lg font-semibold">{site.name}</p>
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
          linkLabel="全部作品"
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
            linkLabel="全部文章"
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
