import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/badge";
import { SectionHeading } from "@/components/section-heading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "关于",
  description: `关于 ${site.name}：努力成为一名产品经理，记录实践与思考。`,
};

const skills = [
  { name: "问题定义与假设", level: "练习中" },
  { name: "用户访谈与洞察整理", level: "练习中" },
  { name: "原型与信息架构", level: "练习中" },
  { name: "写作与结构化表达", level: "持续" },
  { name: "基础数据分析意识", level: "学习中" },
  { name: "跨角色沟通", level: "学习中" },
];

const timeline = [
  {
    period: "现在",
    title: "系统练习产品基础功",
    body: "用个人项目与公开写作积累可讲述的案例：假设验证、研究复盘、概念设计。",
  },
  {
    period: "近期",
    title: "搭建个人品牌站",
    body: "把作品与文章集中到 notvitamin.com，方便展示学习轨迹，而不是空泛简历关键词。",
  },
  {
    period: "接下来",
    title: "更多真实反馈",
    body: "在合规与诚实的前提下，把示例内容逐步替换为真实项目经历与更扎实的研究。",
  },
];

export default function AboutPage() {
  return (
    <div className="container-page py-16 sm:py-20">
      <SectionHeading
        eyebrow="About"
        title={`你好，我是 ${site.name}`}
        description={site.description}
      />

      <section className="mt-12 grid gap-10 lg:grid-cols-12">
        <div className="space-y-5 text-base leading-8 text-foreground-muted lg:col-span-7">
          <p>
            我正在努力成为一名产品经理。比起堆砌职位头衔，我更在意把模糊问题拆清楚、用证据修正判断，并把过程写成别人能读懂的文字。
          </p>
          <p>
            这个站点是我的公开练习场：作品区放案例与概念稿，博客区放学习笔记。标有「示例内容」的条目用于展示站点结构与写作方式，
            <strong className="font-medium text-foreground">
              请勿当作已验证的商业成果
            </strong>
            。
          </p>
          <p>
            如果你也在学产品、做研究或写东西，欢迎通过 GitHub 打招呼，聊聊一次具体的问题定义或复盘。
          </p>
        </div>
        <aside className="card-surface h-fit p-6 lg:col-span-5">
          <p className="text-xs font-medium tracking-[0.16em] text-foreground-subtle uppercase">
            快速名片
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-subtle">方向</dt>
              <dd className="text-right font-medium">产品 / 研究 / 写作</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-subtle">站点</dt>
              <dd className="text-right font-medium">notvitamin.com</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-subtle">GitHub</dt>
              <dd className="text-right font-medium">{site.githubUser}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="mt-20">
        <SectionHeading
          eyebrow="Skills"
          title="能力地图"
          description="坦诚标注当前阶段：多数仍在刻意练习，而不是宣称精通。"
        />
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <li
              key={skill.name}
              className="card-surface flex items-center justify-between gap-3 px-4 py-3.5"
            >
              <span className="text-sm font-medium">{skill.name}</span>
              <Badge tone="accent">{skill.level}</Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20">
        <SectionHeading eyebrow="Timeline" title="近况时间线" />
        <ol className="mt-8 space-y-6 border-l border-line pl-6">
          {timeline.map((item) => (
            <li key={item.title} className="relative">
              <span className="absolute top-1.5 -left-[1.9rem] h-3 w-3 rounded-full border-2 border-accent bg-background" />
              <p className="text-xs font-medium tracking-wide text-accent">
                {item.period}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-7 text-foreground-muted">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="contact"
        className="mt-20 scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-accent-soft/60 p-8 sm:p-10"
      >
        <SectionHeading
          eyebrow="Contact"
          title="联系我"
          description="目前优先通过 GitHub 交流。请尽量带上具体语境：你在解什么问题、卡在哪一步。"
        />
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={site.social.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
          >
            打开 GitHub
          </a>
          <Link
            href="/work"
            className="inline-flex h-11 items-center rounded-full border border-line bg-background-elevated px-5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent"
          >
            先看看作品
          </Link>
        </div>
      </section>
    </div>
  );
}
