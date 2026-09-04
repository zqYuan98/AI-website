import type { Metadata } from "next";
import { PostCard } from "@/components/post-card";
import { SectionHeading } from "@/components/section-heading";
import { getAllPosts, getAllTags } from "@/lib/content";

export const metadata: Metadata = {
  title: "博客",
  description: "产品学习、写作与执行相关的笔记。",
};

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const tags = getAllTags();

  return (
    <div className="container-page py-16 sm:py-20">
      <SectionHeading
        eyebrow="Blog"
        title="博客"
        description="记录学习产品经理路上的方法、写作与「先做出来」的实践笔记。"
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

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </div>
  );
}
