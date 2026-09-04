import Image from "next/image";
import Link from "next/link";
import { PlaceholderBadge } from "@/components/badge";
import { formatDate, type PostMeta } from "@/lib/content";

export function PostCard({ post }: { post: PostMeta }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col gap-4 border-b border-line px-1 py-5 transition-colors last:border-b-0 sm:flex-row sm:items-center sm:gap-5"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-accent-soft">
        {post.cover ? (
          <Image
            src={post.cover}
            alt=""
            fill
            unoptimized
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-accent">
            文
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-accent">
            {post.title}
          </h3>
          {post.placeholder ? <PlaceholderBadge /> : null}
        </div>
        <p className="mt-1 line-clamp-1 text-sm text-foreground-muted">
          {post.summary}
        </p>
      </div>
      <div className="shrink-0 text-xs text-foreground-subtle sm:min-w-[7.5rem] sm:text-right">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        {post.readingTime ? <p className="mt-1">{post.readingTime}</p> : null}
      </div>
    </Link>
  );
}

export function PostGridCard({ post }: { post: PostMeta }) {
  return (
    <article className="card-surface card-lift flex h-full flex-col overflow-hidden">
      {post.cover ? (
        <div className="relative h-36">
          <Image src={post.cover} alt="" fill unoptimized className="object-cover" sizes="33vw" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
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
          <Link href={`/blog/${post.slug}`} className="hover:text-accent">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-foreground-muted">
          {post.summary}
        </p>
      </div>
    </article>
  );
}
