export const site = {
  name: "Vitamin",
  githubUser: "zqYuan98",
  githubAlias: "YUANzq",
  url: "https://notvitamin.com",
  headline: "努力成为一名产品经理",
  tagline: "记录产品实践、项目复盘与一路上的思考。",
  eyebrow: "HELLO, I'M VITAMIN",
  description:
    "Vitamin 的个人站点：记录产品实践、项目复盘与一路上的思考。努力成为一名产品经理。",
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
