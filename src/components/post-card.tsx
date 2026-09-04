import Link from "next/link";
import { PlaceholderBadge } from "@/components/badge";
import { formatDate, type PostMeta } from "@/lib/content";

export function PostCard({ post }: { post: PostMeta }) {
  return (
    <article className="card-surface card-lift flex h-full flex-col p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-subtle">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        {post.readingTime ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{post.readingTime}</span>
          </>
        ) : null}
        {post.placeholder ? <PlaceholderBadge /> : null}
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-tight">
        <Link
          href={`/blog/${post.slug}`}
          className="transition-colors hover:text-accent"
        >
          {post.title}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm leading-6 text-foreground-muted">
        {post.summary}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
