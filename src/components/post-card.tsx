import Image from "next/image";
import Link from "next/link";
import { PlaceholderBadge } from "@/components/badge";
import { formatDate, type PostMeta } from "@/lib/content";

export function PostCard({ post }: { post: PostMeta }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="post-row group grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-line py-2 transition-colors last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_auto]"
    >
      <div className="relative row-span-2 h-11 w-16 shrink-0 overflow-hidden rounded-md bg-accent-soft sm:row-span-1 sm:h-[46px] sm:w-[72px]">
        {post.cover ? (
          <Image
            src={post.cover}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 639px) 64px, 72px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-accent">
            文
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 max-w-full line-clamp-2 text-sm font-semibold tracking-tight whitespace-normal text-[#07175c] transition-colors group-hover:text-accent sm:line-clamp-none sm:truncate sm:text-[15px]">
            {post.title}
          </h3>
          {post.placeholder ? <PlaceholderBadge /> : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs leading-[18px] text-[#526385] sm:text-[13px]">
          {post.summary}
        </p>
      </div>
      <div className="col-start-2 flex shrink-0 items-center gap-4 text-[11px] text-[#607091] sm:col-start-auto sm:min-w-[190px] sm:justify-end sm:text-xs">
        <time dateTime={post.date}>{post.date}</time>
        {post.readingTime ? (
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon />
            {post.readingTime}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function PostGridCard({ post }: { post: PostMeta }) {
  return (
    <article className="card-surface card-lift flex h-full flex-col overflow-hidden">
      {post.cover ? (
        <div className="relative h-36">
          <Image
            src={post.cover}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
          />
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

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.5V10l2.4 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
