import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlaceholderBadge } from "@/components/badge";
import { Markdown } from "@/components/markdown";
import {
  formatDate,
  getPostBySlug,
  getPostSlugs,
} from "@/lib/content";

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  props: PageProps<"/blog/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "未找到文章" };
  return {
    title: post.title,
    description: post.summary,
  };
}

export default async function BlogPostPage(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="container-page py-16 sm:py-20">
      <div className="prose-article mx-auto">
        <Link
          href="/blog"
          className="text-sm font-medium text-accent no-underline hover:text-accent-hover"
        >
          ← 返回博客
        </Link>

        <header className="mt-6 border-b border-line pb-8">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-subtle">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            {post.readingTime ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{post.readingTime}</span>
              </>
            ) : null}
            {post.placeholder ? <PlaceholderBadge /> : null}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-base leading-8 text-foreground-muted">
            {post.summary}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent"
              >
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div className="mt-10">
          <Markdown content={post.body} className="prose-article" />
        </div>
      </div>
    </article>
  );
}
