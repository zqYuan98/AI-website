import ReactMarkdown from "react-markdown";

export function Markdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={`prose prose-neutral dark:prose-invert prose-headings:scroll-mt-24 prose-headings:font-semibold prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-blockquote:border-accent/40 prose-blockquote:text-foreground-muted max-w-none ${className}`}
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
