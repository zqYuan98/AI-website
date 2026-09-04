import type { Metadata } from "next";
import Link from "next/link";
import { SectionHeading } from "@/components/section-heading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "关于",
  description: `关于 ${site.displayName}（${site.realName}）：从算法工程师走向 AI 时代的产品经理。`,
};

const principles = [
  "先确认问题，再选择 AI",
  "先定义验收，再开始实现",
  "模型负责语义，代码负责确定性，人负责风险与取舍",
  "模型输出首先是候选，不自动等于业务事实",
  "技术资产可以降低验证成本，但不能替代市场证据",
  "一次交付应该让下一次更快、更稳、更便宜",
  "允许停止，允许承认「不值得继续做」",
];

const timeline = [
  {
    period: "算法工程师",
    title: "人脸识别、活体检测、工业视觉缺陷检测",
    body: "在一线理解数据、设备、环境、阈值与人工流程如何共同决定 AI 能否使用。",
  },
  {
    period: "算法与平台工程化",
    title: "天枢、灵析、OCR 替换、评测与部署",
    body: "从做一个模型，到管理算法的生产、部署、回退和复用。",
  },
  {
    period: "研发中台负责人",
    title: "平台、算法、软硬件、团队与交付",
    body: "把投入方向、验收、产品化与团队主航道纳入同一套决策。",
  },
  {
    period: "AI 时代的产品经理",
    title: "问题发现、人机边界、验收与产品经营",
    body: "让 AI 从会演示，到能进入真实工作并被验收。",
  },
];

export default function AboutPage() {
  return (
    <div className="container-page py-16 sm:py-20">
      <SectionHeading
        level={1}
        title={`你好，我是${site.displayName}`}
        description="电力行业研发中台负责人，一名从视觉算法工程师走向 AI 产品经理的实践者。"
      />

      <section className="mt-12 grid gap-10 lg:grid-cols-12">
        <div className="space-y-5 text-base leading-8 text-foreground-muted lg:col-span-7">
          <p>
            我是{site.realName}，也叫{site.displayName}。目前在一家电力软硬件集成公司负责研发中台。
          </p>
          <p>
            我的职业起点是算法工程师，做过人脸识别、活体检测和工业视觉缺陷检测。后来开始负责算法平台、应用平台、OCR 自研替换，以及更多与软件、硬件和交付相关的工作。
          </p>
          <p>
            做得越多，我越觉得 AI 产品最难的部分不只是模型。真实问题是否成立、数据能否获取、错误如何处理、谁来确认、产品如何验收、一次项目能不能被下一个项目复用，这些事情常常更决定结果。
          </p>
          <p>
            所以我把自己的长期方向定义为「AI 时代的产品经理」。我希望自己既保留技术判断，也能把业务、用户、工程和组织连接起来，让 AI 真正进入工作。
          </p>
        </div>
        <aside className="card-surface h-fit p-6 lg:col-span-5">
          <p className="text-xs font-medium tracking-[0.16em] text-foreground-subtle uppercase">
            快速名片
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-subtle">主张</dt>
              <dd className="text-right font-medium">{site.claim}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground-subtle">关键词</dt>
              <dd className="text-right font-medium">{site.keywords.join(" · ")}</dd>
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

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">职业路径</h2>
        <ol className="mt-8 space-y-6 border-l border-line pl-6">
          {timeline.map((item) => (
            <li key={item.period} className="relative">
              <span className="absolute -left-[1.7rem] top-1.5 h-3 w-3 rounded-full border-2 border-accent bg-background" />
              <p className="text-xs font-medium tracking-[0.14em] text-accent uppercase">
                {item.period}
              </p>
              <h3 className="mt-1 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-7 text-foreground-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">工作原则</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {principles.map((item) => (
            <li
              key={item}
              className="rounded-[var(--radius-card)] border border-line bg-background-elevated px-4 py-3 text-sm leading-6 text-foreground-muted"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section id="contact" className="mt-16 scroll-mt-24 card-surface p-8">
        <h2 className="text-2xl font-semibold tracking-tight">联系</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">
          如果你也在做行业 AI、产品化、Agent 交付或个人数字产品，可以带着一个具体问题来找我。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={site.social.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
          >
            GitHub · {site.githubUser}
          </a>
          <Link
            href="/work"
            className="inline-flex h-11 items-center rounded-full border border-line px-5 text-sm font-medium text-foreground-muted hover:border-accent/40 hover:text-accent"
          >
            先看作品
          </Link>
        </div>
      </section>
    </div>
  );
}
