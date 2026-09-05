/** Approximate Chinese/English reading time from body text, never editorial metadata. */
export function estimateReadingTime(markdown: string): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/https?:\/\/[^\s，。；！？、：<>]+/g, "");
  const han = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const words = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? []).length;
  const minutes = han / 300 + words / 200;
  if (minutes === 0) return "";
  return minutes < 1 ? "不到 1 分钟阅读" : `约 ${Math.ceil(minutes)} 分钟阅读`;
}
