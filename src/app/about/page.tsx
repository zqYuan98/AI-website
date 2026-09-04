import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "关于",
  description: `关于${site.displayName}：${site.tagline}`,
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
    title: "天枢、灵析、钢印 OCR 研发、评测与部署",
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
  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `关于${site.displayName}`,
    url: `${site.url}/about`,
    mainEntity: {
      "@type": "Person",
      name: site.displayName,
      alternateName: site.name,
      url: `${site.url}/about`,
      description: site.tagline,
      knowsAbout: [...site.keywords, "AI 产品", "计算机视觉", "人机协作"],
      sameAs: [site.social.github],
    },
  };

  return (
    <div className="container-page py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(profileJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="about-portrait-hero relative overflow-hidden rounded-[28px] border border-[#dce7f7] bg-[linear-gradient(118deg,#ffffff_0%,#f8fbff_48%,#eaf2ff_100%)]">
        <div className="grid min-h-[430px] items-center lg:grid-cols-12">
          <div className="relative z-10 px-7 py-12 sm:px-12 lg:col-span-7 lg:py-16">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              About Vitamin
            </p>
            <h1 className="mt-4 max-w-2xl text-[38px] font-bold leading-[1.12] tracking-[-0.04em] text-[#07175c] sm:text-[52px]">
              从视觉算法走向
              <br />
              AI 产品
            </h1>
            <p className="mt-5 max-w-xl text-base font-medium leading-8 text-[#4f6387] sm:text-lg">
              {site.tagline}
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5 text-xs font-medium text-[#314a7a]">
              <span className="rounded-full border border-[#cbdaf0] bg-white/80 px-3 py-1.5">算法 → 产品</span>
              <span className="rounded-full border border-[#cbdaf0] bg-white/80 px-3 py-1.5">问题 → 验收</span>
              <span className="rounded-full border border-[#cbdaf0] bg-white/80 px-3 py-1.5">AI → 真实工作</span>
            </div>
          </div>
          <div className="relative min-h-[360px] self-stretch lg:col-span-5 lg:min-h-[430px]">
            <div className="absolute inset-x-[8%] bottom-5 h-16 rounded-[50%] bg-[#5c6ce0]/20 blur-2xl" aria-hidden="true" />
            <div className="absolute right-[8%] top-[12%] h-44 w-44 rounded-full border border-[#70a1ff]/25" aria-hidden="true" />
            <Image
              src="/images/about/vitamin-avatar-v5.png"
              alt="维他命的卡通形象"
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 38vw"
              className="relative z-10 object-contain object-bottom px-5 pt-4"
            />
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-10 lg:grid-cols-12">
        <div className="space-y-5 text-base leading-8 text-foreground-muted lg:col-span-8">
          <p>
            职业起点是算法工程师，做过人脸识别、活体检测和工业视觉缺陷检测。后来，工作逐渐延伸到算法平台、应用平台、钢印 OCR 研发，以及软件、硬件和项目交付。
          </p>
          <p>
            这些经历让我越来越确定：AI 产品最难的部分往往不在模型本身。问题是否真实、数据能否稳定获取、错误如何被发现和接管、结果由谁确认、产品怎样验收，以及一次交付能否沉淀为下一次可复用的能力，才真正决定它能不能落地。
          </p>
          <p>
            因此，我把长期方向定义为「AI 时代的产品经理」：保留对技术和能力边界的判断，同时连接业务、用户、工程与组织，让 AI 不只停留在演示中，而是真正进入工作、被使用、被验证并持续产生价值。
          </p>
        </div>
        <aside className="card-surface h-fit p-6 lg:col-span-4">
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
            rel="noopener noreferrer"
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
