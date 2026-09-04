import type { Metadata } from "next";
import { SectionHeading } from "@/components/section-heading";
import { WorkCard } from "@/components/work-card";
import { getAllWork } from "@/lib/content";

export const metadata: Metadata = {
  title: "作品",
  description: "产品练习、研究复盘与概念设计案例。",
};

export default function WorkIndexPage() {
  const works = getAllWork();

  return (
    <div className="container-page py-16 sm:py-20">
      <SectionHeading
        eyebrow="Work"
        title="作品与案例"
        description="以下内容多为个人练习与概念稿，标有「示例内容」的条目用于展示思考过程，不代表已验证的商业结果。"
      />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {works.map((work) => (
          <WorkCard key={work.slug} work={work} />
        ))}
      </div>
    </div>
  );
}
