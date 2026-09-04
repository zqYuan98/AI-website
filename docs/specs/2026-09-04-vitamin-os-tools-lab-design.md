# Vitamin OS 首轮模块设计说明

日期：2026-09-04
状态：用户已批准视觉与范围，待实施

## 1. 目标

把 notvitamin.com 从作品/博客组合页扩展为「维他命的操作系统」首轮版本：

- 新增可策展、可搜索的 `/tools`，一期内含「工具」与「阅读与资源」两个 Tab。
- 新增 `/lab` 与首个可运行实验 `/lab/ai-feature-acceptance`。
- 首页在现有 Hero、作品与博客之后加入工具、Lab 与独立商店入口。
- About 使用卡通人物作为主要人格视觉；工具与 Lab 只使用小尺寸作者签名章。
- 把 `https://notvitamin.xyz/` 作为独立交易站「NV 补给站」直接外链。

SEO / GEO 不作为单独模块；价值来自可索引的原创判断、边界说明、真实内链和可运行 Lab。

## 2. 不做的内容

- 不新增空的 `/shop` 过渡页。
- 不 iframe 商店，不复制实时价格、库存、售后规则或商品目录。
- 不一期拆出独立 `/links`；推荐内容留在 `/tools` 的 Tab 中。
- 不为单个工具创建薄详情页。
- 不加入登录、数据库或服务端保存 Lab 填写结果。
- 不在任何公开页面、署名、元数据或结构化信息中出现真实姓名。

## 3. 信息架构

```text
/
├─ /about
├─ /work
│  └─ /work/[slug]
├─ /blog
│  └─ /blog/[slug]
├─ /tools
│  ├─ 工具 Tab
│  └─ 阅读与资源 Tab
├─ /lab
│  └─ /lab/ai-feature-acceptance
└─ NV 补给站 ↗ https://notvitamin.xyz/
```

桌面导航为「首页 · 关于 · 作品 · 博客 · 工具 · Lab」，右侧按钮为「NV 补给站 ↗」。联系入口保留在 About 与 Footer。移动端商店项显示域名，明确外跳。

## 4. 视觉方向

延续现有白底、深海军蓝、电光蓝与少量紫罗兰，不重做现有 Hero 动态球。新模块采用“编辑部工作台 / 控制面板”语言：

- 页面级主张大于分类和卡片。
- 卡片统一为冷灰描边、克制阴影、12px 左右圆角。
- 用编号、状态和细线表达工作流，而不是第三方 Logo 墙。
- Lab 用深海军蓝作为高对比主视觉，强调“可运行证据”。
- 商店入口使用独立深色胶囊，表示它是不同域名和不同职责。

## 5. 页面设计

### 5.1 `/tools`

顶部结构：

1. 主张：「工具不是答案，工作流才是。」
2. 说明：这里只保留真正进入工作的方法、工具与资源。
3. 工具箱模块图。
4. `工具 / 阅读与资源` 可访问 Tab。
5. 搜索框与分类筛选。
6. 卡片列表。
7. 「Vitamin 的选择标准」签名条。
8. 已知 Lobster Nav 公开 URL 后显示「完整导航 ↗」；URL 未确认前不显示失效链接。

工具字段：

```text
name | category | scenario | audience | usage | avoidWhen |
alternatives | url | usedByVitamin | featured | updatedAt
```

推荐字段：

```text
title | type | verdict | boundary | learned | url |
relatedHref | featured | updatedAt
```

搜索覆盖名称、分类、场景、受众、用法、边界与替代项。搜索、Tab 与筛选为客户端增强；工具和推荐数据在服务器渲染的初始 HTML 中同时存在，`<noscript>` 下两组内容均可读。无结果时显示清除筛选操作。第一人称体验只写有依据或经用户确认的内容，不能虚构。

### 5.2 `/lab`

首期只有一个实验时，列表页以旗舰 Lab 展示，不表现为空目录。卡片包含状态、解决的问题、使用方式、限制与相关内容。

### 5.3 `/lab/ai-feature-acceptance`

页面结构：

1. 问题与使用方法。
2. 固定 18 项交互式清单。
3. 分组完成度与遗漏项。
4. 复制 Markdown、下载 Markdown、重置。
5. 适用边界：「清单帮助发现缺口，不自动等于验收结论。」
6. 相关作品、博客与工具。

检查项覆盖：问题真实性、非 AI 对照方案、数据稳定性与合规、失败样本、人机确认、高风险接管、错误发现、证据回溯、上线指标、回退路径和复用沉淀。

18 项使用稳定 ID，并按问题与价值、数据与边界、人机协作、失败与回退、验收与复用五组组织。状态只保存到浏览器 `localStorage`，版本化 key 为 `vitamin:lab:ai-feature-acceptance:v1`；不可用时仍可填写，只是不持久化。下载文件名为 `ai-feature-acceptance-checklist.md`。交互组件单独使用 `use client`，解释内容保持 Server Component。Lab 的方法说明区出现一次小头像签名章。

### 5.4 首页

保留现有顺序与 Hero，在作品、博客之后增加：

1. 「维他命精选」：4 个可由当前站点工作流证实的紧凑工具条目；只对有依据的条目标记「站点在用」。
2. 「Lab 亮点」：一张横向卡片进入验收清单。
3. 「小商店 · NV 补给站」：解释两站关系的外链门户卡。
4. 首轮不增加带头像的 About CTA，严格保持已批准的 A+C；不把卡通人物放进首页 Hero。

商店说明固定为：

> AI 工具与数字服务；实时库存、价格与售后规则以商店页面为准。

### 5.5 About

使用卡通人物透明底冷色版作为大尺寸主视觉；人物不出现在 Hero 动态球区域。正文延续已批准的匿名职业叙事。工具与 Lab 的签名条复用 32–48px 圆形裁切。

## 6. 图片资产

统一由内置 Image 2 图像生成流程制作并保存到项目：

| 文件 | 用途 | 约束 |
| --- | --- | --- |
| `public/images/about/vitamin-avatar-v2.png` | About 主视觉、签名章 | 1:1；依据原卡通形象；真实透明通道；保留面部、发型、米白上衣；冷蓝轮廓光；无文字 |
| `public/images/tools/tools-workbench.png` | `/tools` Hero | 3:2；主体在右侧安全区；抽象策展工作台与路径；蓝/海军蓝；无 Logo、无文字、非 UI 假截图 |
| `public/images/lab/acceptance-loop.png` | Lab Hero | 3:2；核心闭环位于中央偏右，移动裁切仍完整；候选结果、人工确认、证据与回退闭环；无文字 |
| `public/images/shop/nv-supply-portal.png` | 首页商店门户 | 3:2；主体靠右；抽象 NV 补给舱；黑白主体带蓝色光；不伪装成具体商品；无文字 |

首页复用模块图裁切，不为每张卡片额外生成装饰图。所有项目引用图片必须进入 `public/`，通过 `next/image` 加载；装饰图使用空 `alt`，承载内容的图使用准确描述。

## 7. 内容与代码边界

- `content/tools/*.md`：工具策展数据。`alternatives` 为字符串数组；`url` 必须是 HTTPS；`category` 使用固定枚举；`updatedAt` 为 `YYYY-MM-DD`；`featured` 与 `usedByVitamin` 为必填布尔值。首页按 `featured && usedByVitamin`、再按显式 `order` 升序取前 4 项。
- `content/recommendations/*.md`：阅读与资源。`relatedHref` 仅允许站内绝对路径或为空；`url` 必须是 HTTPS；`type` 使用固定枚举；`featured` 为必填布尔值；按显式 `order` 升序。
- `content/lab/*.md`：Lab 解释内容与元数据。
- `src/lib/curation.ts`：工具/推荐读取、字段校验、排序。
- `src/lib/labs.ts`：Lab 读取、字段校验与注册信息。
- `src/components/tools/*`：搜索、Tab、分类筛选。
- `src/components/lab/*`：验收清单客户端交互。

Markdown 只负责内容和元数据；交互 Lab 由 slug 到 React 工具组件的显式注册表渲染，不把 React 组件写进 Markdown。必填字段缺失时构建失败，不静默补空字符串。

## 8. 页面可发现性

不进行独立“SEO 基建项目”，但每个新模块随页面实现完成必要的页面语义：

- 独立 title 与 description。
- `/tools` 使用与页面可见内容一致的 `CollectionPage` / `ItemList` JSON-LD。
- Lab 只在确实可运行时使用 `WebApplication` 或 `SoftwareApplication` 语义，不承诺富结果。
- 内链连接首页、工具、Lab、作品和博客。
- 现有 sitemap 加入 `/tools`、`/lab` 与 `/lab/ai-feature-acceptance`；JSON-LD 序列化时将 `<` 转义为 `\u003c`。
- 外部商店与工具链接使用新窗口及 `noopener noreferrer`。

## 9. 可访问性与响应式

- Tab 使用 `tablist/tab/tabpanel` 语义并支持键盘。
- 搜索和分类有可见标签或可访问名称。
- 390px 宽度不产生横向滚动；筛选胶囊可横向滚动。
- 桌面导航断点提升到约 1024px，避免 7 个入口在平板宽度拥挤。
- Lab 结果区不固定遮挡内容；复制失败时保留可手动选择的 Markdown。
- 所有状态不仅依赖颜色表达。
- 尊重 `prefers-reduced-motion`。

## 10. 验收标准

- `/tools` 的两类数据无需 JavaScript 也存在于页面 HTML；搜索、筛选和 Tab 可用。
- `/lab/ai-feature-acceptance` 可勾选、刷新后恢复、复制、下载与重置。
- 外部商店入口在桌面和移动端都明确带 ↗，不误判为站内页面。
- 首页现有动态球仍工作，新增区与既有视觉统一。
- About 大图与签名章使用生成后的透明人物素材。
- 全站搜索不到用户真实姓名。
- `bun run lint`、`bunx tsc --noEmit` 和 `bun run build` 通过。
- 对首页、About、Tools、Lab 列表与 Lab 详情做 1392×928 和 390px 浏览器验证，无控制台错误和图片 404。
- 验证 sitemap 含三个新路由、`/shop` 仍不存在、localStorage 禁用时清单仍可操作，并覆盖复制失败回退、下载、重置与 `aria-live` 状态提示。

## 11. 后续输入

- Lobster Nav 的公开 URL 尚未确认；首轮条件隐藏「完整导航」链接，不猜测地址。
- 工具与推荐的第一人称使用经验属于用户事实。首轮可以提供结构和少量明确有依据的站点工作流条目，其余内容需用户后续确认后再标记为「正在用」。
