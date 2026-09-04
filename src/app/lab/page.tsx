import type { Metadata } from "next";
import { LabCard } from "@/components/lab/lab-card";
import { SectionHeading } from "@/components/section-heading";
import { getAllLabs } from "@/lib/labs";
import { site } from "@/lib/site";
import styles from "@/components/lab/lab.module.css";

export const metadata: Metadata = {
  title: "Lab 实验室",
  description: "把 AI 产品判断做成可以打开即用、能够暴露缺口的清单与小工具。",
  alternates: { canonical: "/lab" },
  openGraph: {
    title: "Lab 实验室 · Vitamin",
    description: "把 AI 产品判断做成可以打开即用、能够暴露缺口的清单与小工具。",
    url: `${site.url}/lab`,
    images: [
      {
        url: "/images/lab/acceptance-loop.png",
        width: 1536,
        height: 1024,
        alt: "AI 功能验收闭环",
      },
    ],
  },
};

const principles = [
  {
    index: "01",
    title: "打开即用",
    body: "不需要登录，不先收集信息，先让工具解决一个具体问题。",
  },
  {
    index: "02",
    title: "说明边界",
    body: "每个实验都写清适用条件、局限与不能替代的判断。",
  },
  {
    index: "03",
    title: "连接实践",
    body: "方法会回到相关作品与文章，说明它如何进入真实工作。",
  },
];

export default function LabIndexPage() {
  const labs = getAllLabs();

  return (
    <div className="container-page py-16 sm:py-20">
      <div className={styles.indexIntro}>
        <SectionHeading
          level={1}
          eyebrow="LAB / WORKING PROOFS"
          title="把判断做成可运行的证据"
          description="这里不是功能陈列室。每个 Lab 都从一个真实工作问题出发，让方法可以被使用、检验，也可以被推翻。"
        />
        <aside className={styles.indexNote}>
          <strong>实验室约定</strong>
          首期只发布真正可用的条目。状态、使用方式与局限会随实验一起公开。
        </aside>
      </div>

      <section className="mt-14" aria-labelledby="flagship-lab-title">
        <p id="flagship-lab-title" className={styles.sectionLabel}>
          Flagship Lab
        </p>
        {labs.map((lab) => (
          <LabCard key={lab.slug} lab={lab} />
        ))}
      </section>

      <section className="mt-16" aria-labelledby="lab-principles-title">
        <p id="lab-principles-title" className={styles.sectionLabel}>
          How this lab works
        </p>
        <div className={styles.principles}>
          {principles.map((principle) => (
            <article key={principle.index} className={styles.principle}>
              <span>{principle.index}</span>
              <strong>{principle.title}</strong>
              <p>{principle.body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
