# Vitamin 个人品牌站

个人品牌站。Next.js 16 + Tailwind v4，页面和内容位于 `src/` 与 `content/`。

## 本地运行

使用 Node.js 24（CI 固定 24.14.0）和 Bun 1.4.0。仓库只保留 `bun.lock`，安装时使用冻结锁文件：

```sh
bun ci
bun run dev
```

没有安装 Bun 时，可使用 `npx --yes bun@1.4.0 ci`、`npx --yes bun@1.4.0 run dev`，无需全局安装。开发服务默认仅监听 `127.0.0.1`。

## 检查与构建

```sh
bun run check
bun run build
bun run start --hostname 127.0.0.1 --port 3100
```

`check` 依次执行内容验证、工具与本地维护安全回归、工具 URL 状态/搜索测试、ESLint、路由类型生成及 TypeScript 检查。`build` 执行相同检查，全部通过后才运行 `next build`。也可分别运行 `check:content`、`check:tools`、`check:tools-state`、`lint`、`typecheck`。

生产服务启动后，在另一个终端运行：

```sh
bun run check:smoke http://127.0.0.1:3100
```

冒烟检查用只读 HTTP 请求验证公开页面为 200、有唯一 H1 和标题，并要求 `/tools/manage`、`/api/local-tools` 为 404。它从内容文件自动枚举详情页，目前覆盖 13 个公开页面。该检查针对生产模式，不能用开发服务替代。

## 编辑内容

- content/work/*.md — 作品（含背景/问题、我做了什么、结果与反思）
- content/blog/*.md — 博客
- src/lib/site.ts — 站点元信息
- src/app/globals.css — 设计令牌

placeholder: true 显示「示例内容」徽章。

## 部署到 Vercel

现有 Git 集成继续使用，发布配置与验证见 [DEPLOY.md](DEPLOY.md)。GitHub 的 Quality 工作流只检查、构建和运行本地生产冒烟，不部署、不修改仓库，也不需要平台密钥。

依赖有意变更时使用 Bun 更新 `package.json` 与 `bun.lock`，一起审核和提交；日常安装继续用 `bun ci`，不要新增其他包管理器的锁文件。

示例内容请替换为真实经历后再对外宣称成果。
