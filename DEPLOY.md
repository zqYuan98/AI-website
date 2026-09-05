# 发布与验证

沿用现有 Vercel Git 集成。2026-09-05 审查时，正式域名 `notvitamin.com` / `www.notvitamin.com` 对应 `ai-website` 项目；同一提交另有其他项目部署记录。修改平台设置前应重新核实项目与域名归属，不删除用途未知的项目。

## 构建合同

- 包管理器：`packageManager` 声明的 Bun 1.4.0，唯一锁文件为 `bun.lock`。
- 安装命令：`bun ci`，依赖与锁文件不一致即失败。
- 构建命令：`bun run build`，先执行内容、工具、URL 状态、lint 和类型检查，再执行 `next build`。
- Node.js：本地与 GitHub 验证使用 24.14.0；Vercel 项目应使用兼容的 Node.js 24 运行时。
- 运行模式：正常 Next.js 构建，保留静态页面和必要服务端能力。

`typecheck` 先运行 Next 16 的 `next typegen`，不依赖上一次开发服务器或构建留下的类型文件。所有检查同步执行，失败立即停止，构建检查不会再次调用 `build` 形成递归。

首次锁定以当前本机安装的 npm 快照为种子，在独立临时目录补齐平台可选包后迁移到 Bun；已有安装条目的版本保持不变。根目录不保留中间 npm 锁文件，不在运行中的 `node_modules` 上重新安装依赖。

## GitHub 与 Vercel 的边界

`.github/workflows/quality.yml` 在 PR、推送 main 或手动触发时执行冻结安装、同一个构建入口、生产模式 HTTP 冒烟。工作流仅有仓库读取权限，无部署密钥、推送、发布或评论操作。

Vercel 按仓库 `build` 脚本构建时，检查失败会阻止该次构建。**平台若覆盖为直接 `next build`，会绕过这些检查；本地改动无法证明或修改该私有设置。** 有权限时核对正式项目的 Install Command 为 `bun ci`、Build Command 为 `bun run build`，并核对 Bun 版本。不要将 GitHub 工作流显示绿色当作 Vercel 必然等待它的证据。

GitHub 分支保护也需要在平台核实，将 `Checks, build and production smoke` 设为合并必需检查。当前工作流文件本身不会设置分支保护，也不会改变现有 Vercel Git 发布顺序。HTTP 冒烟目前约束 GitHub 检查；它不自动阻止已经独立启动的 Vercel 部署。

## 生产模式冒烟

```sh
bun ci
bun run build
bun run start --hostname 127.0.0.1 --port 3100
```

另一个终端：

```sh
bun run check:smoke http://127.0.0.1:3100
```

检查所有公开列表页及内容详情页（目前 13 个），要求状态 200、唯一 H1 和非空页面标题；本机维护页面/API 必须为 404。请求仅使用 GET，不调用维护写入。可将参数替换成已部署站点的最终 origin（例如 `https://www.notvitamin.com`）执行相同只读检查；不自动跟随重定向，避免错误路径跳回首页后误报通过。

发布后还需核对正式域名对应的提交版本，以及搜索 URL、前进后退、移动导航键盘焦点、动画暂停/减弱动效和 Lab 导出等浏览器交互。HTTP 冒烟不能替代这些行为检查。回滚时先确认正式项目的上一个已验证部署，再由有权限的维护者执行平台回滚。

参考：[Bun 冻结安装](https://bun.sh/docs/pm/cli/install#ci-cd)、[Vercel 构建命令设置](https://vercel.com/docs/builds/configure-a-build#build-command)。
