import Link from "next/link";

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  linkLabel,
  level = 2,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";

  return (
    <div className="section-heading flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-[0.18em] text-accent uppercase">
            {eyebrow}
          </p>
        ) : null}
        <Heading className={`${eyebrow ? "mt-2" : ""} section-heading-title font-semibold tracking-tight text-foreground`}>
          {title}
        </Heading>
        {description ? (
          <p className="mt-3 text-sm leading-7 text-foreground-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {href && linkLabel ? (
        <Link
          href={href}
          className="section-heading-link inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
        >
          {linkLabel}
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}
