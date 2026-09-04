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

export function WorkCard({ work, eager = false }: { work: WorkMeta; eager?: boolean }) {
  const gradient = accentMap[work.accent] ?? accentMap.blue;

  return (
    <Link
      href={`/work/${work.slug}`}
      className="work-card card-surface card-lift group flex flex-col overflow-hidden"
    >
      <div className="work-card-media relative aspect-video overflow-hidden bg-background-subtle">
        {work.cover ? (
          <Image
            src={work.cover}
            alt=""
            fill
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        )}
      </div>
      <div className="work-card-body flex flex-1 flex-col p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-tight text-[#07175c] transition-colors group-hover:text-accent">
              {work.title}
            </h3>
            {work.placeholder ? <PlaceholderBadge /> : null}
          </div>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-[#627093]">
            {work.summary}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          {work.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-[#eef4ff] px-2 py-0.5 text-[11px] leading-4 text-[#1f5fd7] even:bg-[#f1edff] even:text-[#5944d6]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
