export const site = {
  name: "Vitamin",
  displayName: "维他命",
  githubUser: "zqYuan98",
  githubAlias: "YUANzq",
  url: "https://notvitamin.com",
  eyebrow: "HELLO, I'M VITAMIN",
  headline: "你好，我是维他命。",
  claim: "从让模型看见，到让 AI 真正工作。",
  tagline: "从视觉算法走向 AI 产品，长期关注技术如何进入真实工作。",
  description: "维他命的个人品牌站：从视觉算法走向 AI 产品，记录技术如何进入真实工作。",
  keywords: ["技术根基", "产品判断", "真实交付"] as const,
  social: {
    github: "https://github.com/zqYuan98",
  },
} as const;

export const nav = [
  { href: "/", label: "首页" },
  { href: "/about", label: "关于" },
  { href: "/work", label: "作品" },
  { href: "/blog", label: "博客" },
] as const;

export const contactHref = "/about#contact";
