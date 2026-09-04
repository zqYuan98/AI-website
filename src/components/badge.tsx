import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "secondary" | "warning";
}) {
  const tones = {
    neutral: "bg-background-subtle text-foreground-muted border-line",
    accent: "bg-accent-soft text-accent border-transparent",
    secondary: "bg-secondary-soft text-secondary border-transparent",
    warning:
      "bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/50",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function PlaceholderBadge() {
  return <Badge tone="warning">示例内容</Badge>;
}
