# Vitamin 个人品牌站

个人品牌站。Next.js 16 + Tailwind v4。

bun install && bun run dev

构建：bun run build

## 编辑内容
- content/work/*.md — 作品（含背景/问题、我做了什么、结果与反思）
- content/blog/*.md — 博客
- src/lib/site.ts — 站点元信息
- src/app/globals.css — 设计令牌

placeholder: true 显示「示例内容」徽章。

## 部署到 Vercel
1. 导入本仓库到 Vercel（Framework: Next.js）
2. Domains 添加 notvitamin.com 与 www
3. 按 Vercel 控制台提示配置 DNS（以控制台为准）
4. 等待证书后验证站点

示例内容请替换为真实经历后再对外宣称成果。
