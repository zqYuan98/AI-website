import type { Metadata } from "next";
import { PostCard } from "@/components/post-card";
import { SectionHeading } from "@/components/section-heading";
import { getAllPosts, getAllTags } from "@/lib/content";

export const metadata: Metadata = {
  title: "博客",
  description: "关于 AI 产品、交付与职业判断的笔记。",
};

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const tags = getAllTags();

  return (
    <div className="container-page py-16 sm:py-20">
      <SectionHeading
        title="博客"
        description="记录 AI 时代产品判断、交付方法与阶段性思考。"
      />

      {tags.length > 0 ? (
        <div className="mt-8 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-line bg-background-elevated px-3 py-1 text-xs text-foreground-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-10 rounded-[var(--radius-card)] border border-line bg-background-elevated px-4 shadow-[var(--shadow-soft)] sm:px-6">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </div>
  );
}
