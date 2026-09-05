# 工具箱维护

## 本次交付

保留原工具页的 Hero、网格背景、蓝色插图、深蓝与荧光绿视觉；只重组下方浏览区。六个主类与开发类子分类结合，搜索覆盖名称、域名、本站分类和用途说明。桌面侧栏、手机下拉，每次显示 36 条，保留精选与阅读 Tab。

按最新展示要求，页面不展示导入来源名称、来源链接或原分类索引；这些字段仅留在服务端导入记录中用于维护，不传入浏览器，也不参与公开搜索。

2026-09-05 导入快照：参考站公开前端 8 个主类、5 个子类共 269 张卡片；新增 260 条，保留本站原有 8 条，共 268 条。源内重复合并 4 条、与原有工具合并 4 条，另排除 1 条成人导航。详细映射和检查记录见 [导入报告](reports/tool-import-2026-09-05.md)。本次没有部署、外发或增加 SEO 基建。

## 添加收藏

1. 在项目目录运行 `npm run dev`，使用终端显示的 `http://127.0.0.1:端口`。
2. 打开 `/tools/manage`，或点击工具页的“添加工具（本地维护）”。
3. 填名称、完整网址、分类；一句话说明选填。图标尝试自动获取，失败不影响保存。
4. 保存到 `content/tool-custom.json`，图标存入 `public/images/tools/icons/`。返回工具箱即可查到；部署项目后才会更新公开网站。

这是本机维护功能，不是线上 CMS：生产环境下维护页和 API 返回 404；没有公开写接口、账号后台或浏览器临时收藏。开发服务默认绑定 127.0.0.1，写请求要求本机同源。网址拒绝私有地址、非 HTTP(S)、账号密码；比较时合并 www、末尾斜杠、跟踪参数和已知别名，但保留不同路径、查询与锚点。图标服务不可用时使用文字占位，不承诺所有网站都能自动取得 logo。

新增收藏不会自动加“精选”或“本站工作流在用”。要升级为详细短评，在 `content/tools/` 按现有 Markdown 模板维护，并从普通收藏文件移除同网址项，避免重复。已有 8 个工具的原始短评文件没有改写。

## 数据位置

- `content/tools/*.md`：有完整评语的工具；保留原字段，可选 `subcategory`、`icon`。
- `content/tool-collection.json`：参考导航的导入快照，不是用户手动收藏。
- `content/tool-custom.json`：本机表单新增收藏。
- `content/tool-icon-map.json`：工具 slug 与本地图标的映射。
- `src/lib/tool-taxonomy.ts`：唯一分类词典；表单和浏览页共用。
- `content/recommendations/*.md`：原有阅读资源。

普通收藏支持字段：`slug`、`name`、`url`、`category`、`subcategory`、`scenario`、`icon`、`sourceCategories`、`linkStatus`。不要手动添加 `featured` 或 `usedByVitamin`；导入收藏不等于作者背书。

## 更新导入与校验

导入脚本需 Node.js 22.18+（支持直接加载本地 TypeScript 模块）；本次验证使用 Node.js 24。操作前先审阅现有修改，完成后检查 diff。

```bash
node scripts/import-nav-tools.mjs --collect-only
node scripts/import-nav-tools.mjs --icons-only
node scripts/import-nav-tools.mjs --check-links
node scripts/check-tools.mjs
npm run lint
npx tsc --noEmit
npm run build
```

脚本只读取参考站公开分类与卡片，不登录；导入与手动收藏分文件。重新收集会更新导入快照，不用于改写手动收藏或既有 Markdown。图标保存为经过验证的本地 PNG/ICO，不让访客直接请求参考站图标。

连通状态仅是检查当时本环境的自动请求结果，不是内容安全、产品可用性或服务质量认证。403、登录要求、超时等不会触发自动删除；人工点击确认后再决定是否移除。

## 验收记录

- 类型检查、全仓 ESLint、生产构建和 `check-tools.mjs`。
- 回归脚本检查分类归属、slug/网址去重、图标文件、导入非背书、原有短评和本机请求校验。
- 本地表单已实际保存测试项并在工具箱搜索到；验证后已清除自建测试项，未留下虚假收藏。
- 错误来源返回 403、内网网址返回 400、已有网址返回 409。
- 本地生产模式实测：维护页 404；API 的 GET、POST、HEAD、OPTIONS、PUT、PATCH、DELETE 均 404；工具页 200 且不含维护入口；258 个本地图标 URL 全部返回 200。
- 独立浏览器验收：精选 4、阅读 6、名称/域名/原分类搜索、清除与空结果、主子类筛选、加载 36 → 72 均通过；390px 和 320px 无横向溢出，工具面板 Axe 检查无违规。

桌面/手机交互结果见本次交付说明。不要将“本地已保存”描述为“线上已发布”。
