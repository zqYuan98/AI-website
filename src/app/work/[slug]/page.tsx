import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceholderBadge } from "@/components/badge";
import { Markdown } from "@/components/markdown";
import { getAllWork, getWorkBySlug, getWorkSlugs } from "@/lib/content";

export function generateStaticParams() {
  return getWorkSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  props: PageProps<"/work/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const work = getWorkBySlug(slug);
  if (!work) return { title: "未找到作品" };
  return {
    title: work.title,
    description: work.summary,
  };
}

export default async function WorkDetailPage(props: PageProps<"/work/[slug]">) {
  const { slug } = await props.params;
  const work = getWorkBySlug(slug);
  if (!work) notFound();

  const others = getAllWork()
    .filter((item) => item.slug !== work.slug)
    .slice(0, 2);

  const sections = [
    { title: "背景 / 问题", body: work.background },
    { title: "我做了什么", body: work.actions },
    { title: "结果与反思", body: work.outcome },
  ];

  return (
    <article className="container-page py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/work"
          className="text-sm font-medium text-accent hover:text-accent-hover"
        >
          ← 返回作品列表
        </Link>

        <header className="mt-6 border-b border-line pb-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-[0.16em] text-accent uppercase">
              {work.role}
            </span>
            {work.period ? (
              <span className="text-xs text-foreground-subtle">
                · {work.period}
              </span>
            ) : null}
            {work.placeholder ? <PlaceholderBadge /> : null}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {work.title}
          </h1>
          <p className="mt-4 text-base leading-8 text-foreground-muted">
            {work.summary}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {work.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background-subtle px-2.5 py-0.5 text-xs text-foreground-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className="mt-10 space-y-12">
          {sections.map((section) =>
            section.body ? (
              <section key={section.title}>
                <h2 className="text-xl font-semibold tracking-tight">
                  {section.title}
                </h2>
                <div className="mt-4">
                  <Markdown content={section.body} />
                </div>
              </section>
            ) : null,
          )}
        </div>

        {others.length > 0 ? (
          <aside className="mt-16 border-t border-line pt-10">
            <h2 className="text-sm font-medium tracking-[0.14em] text-foreground-subtle uppercase">
              其他作品
            </h2>
            <ul className="mt-4 space-y-3">
              {others.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/work/${item.slug}`}
                    className="font-medium text-foreground hover:text-accent"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-1 text-sm text-foreground-muted">
                    {item.summary}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </article>
  );
}
