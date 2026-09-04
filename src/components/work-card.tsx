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
      <div
        className={`relative h-36 bg-gradient-to-br ${gradient}`}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(255_255_255_/0.28),transparent_45%)]" />
        <div className="absolute right-4 bottom-4 left-4 flex items-center justify-between gap-2">
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
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
          {work.period ? (
            <span className="text-xs text-foreground-subtle">{work.period}</span>
          ) : null}
          {work.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-background-subtle px-2 py-0.5 text-xs text-foreground-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
