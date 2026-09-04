export const site = {
  name: "Vitamin",
  displayName: "维他命",
  realName: "袁中群",
  githubUser: "zqYuan98",
  githubAlias: "YUANzq",
  url: "https://notvitamin.com",
  eyebrow: "HELLO, I'M VITAMIN",
  headline: "你好，我是维他命。",
  claim: "从让模型看见，到让 AI 真正工作。",
  tagline:
    "我的职业起点是算法工程师，做过人脸识别、活体检测和工业视觉缺陷检测。现在负责电力行业的算法、平台与产品工作，也在持续构建自己的产品、知识系统和数字实验。",
  description:
    "维他命（袁中群）的个人主页：记录作品、思考、实验和职业成长。AI 时代的产品经理。",
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
