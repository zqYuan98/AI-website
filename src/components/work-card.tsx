import Image from "next/image";
import Link from "next/link";
import { PlaceholderBadge } from "@/components/badge";
import type { WorkMeta } from "@/lib/content";

const accentMap: Record<string, string> = {
  blue: "from-brand-500/90 to-brand-700/80",
  violet: "from-violet-accent/90 to-brand-700/70",
  teal: "from-cyan-500/90 to-brand-700/70",
  green: "from-emerald-500/90 to-brand-700/70",
};

export function WorkCard({ work }: { work: WorkMeta }) {
  const gradient = accentMap[work.accent] ?? accentMap.blue;

  return (
    <Link
      href={`/work/${work.slug}`}
      className="card-surface card-lift group flex h-full flex-col overflow-hidden"
    >
      <div className="relative h-44 overflow-hidden bg-background-subtle">
        {work.cover ? (
          <Image
            src={work.cover}
            alt=""
            fill
            unoptimized
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <div className="absolute right-3 bottom-3 left-3 flex items-center justify-between gap-2">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-navy-900 backdrop-blur-sm dark:bg-black/50 dark:text-white">
            {work.role}
          </span>
          {work.placeholder ? <PlaceholderBadge /> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground transition-colors group-hover:text-accent">
            {work.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-foreground-muted">
            {work.summary}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {work.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
