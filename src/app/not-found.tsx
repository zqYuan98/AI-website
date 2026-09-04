import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-start justify-center py-28">
      <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
        404
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        页面不存在
      </h1>
      <p className="mt-4 max-w-md text-base leading-7 text-foreground-muted">
        你访问的地址可能已移动，或从未存在。可以回到首页继续浏览作品与博客。
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
        >
          返回首页
        </Link>
        <Link
          href="/work"
          className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-medium hover:border-accent/40 hover:text-accent"
        >
          查看作品
        </Link>
      </div>
    </div>
  );
}
