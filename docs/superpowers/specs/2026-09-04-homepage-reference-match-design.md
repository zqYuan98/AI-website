# 首页原图还原设计规范

日期：2026-09-04
状态：已获用户选择方案 1（在原站上精准改造）

## 目标

在现有 Next.js 站点 `zqYuan98/AI-website` 上修改首页与全局导航视觉，使用用户上传到 `C:\Users\24830\Desktop\综合站` 的七张静态图片及一份 Hero 循环 GIF，还原参考图的白底、深海军蓝文字、蓝紫科技感和紧凑信息密度。桌面基准视口为 1392×928；同时保持手机和平板可用。

本次是原站改造，不新建第二套站点，不把整张参考图当背景，不替换现有内容系统、路由或 Markdown 正文。

## 范围

### 包含

- 重做全局页头，使其接近参考图：60px 左右高度、左侧 `Vitamin.` 字标、居中导航、右侧蓝色描边“联系我”。
- 重做首页 Hero：左文右图，采用上传的蓝紫 3D 球体，背景为非常浅的蓝白渐变和克制的点阵/斜向光带。
- 重做首页“精选作品”：三列紧凑卡片，使用三张上传的作品封面。
- 重做首页“最近在写”：描边列表与三张上传的博客缩略图，日期和阅读时长在右侧。
- 把所有上传素材复制到 `public/images/home/` 并通过 Next.js 本地静态路径加载，移除首页对 Lovart 远程图片的依赖。
- 保留作品、博客、关于页及详情页路由；首页卡片继续链接现有详情页。
- 保留现有 Footer 在参考截图下方，不让它影响 1392×928 首屏构图。
- 保持键盘焦点、语义标题、图片替代文本和 reduced-motion 支持。

### 不包含

- 不改写作品或博客正文。
- 不新增 CMS、数据库、登录或后台。
- 不删除 Vercel 上的重复项目。
- 不把 `design.html` 直接嵌入 Next.js。
- 不伪造参考图中与现有 Markdown 不一致的项目成果或日期；页面继续显示真实的现有元数据。

## 视觉规格

### 桌面 1392×928 基准

- 内容最大宽度约 1120px，左右留白约 136px。
- 页头高约 60px，纯白背景与细底边；导航当前项采用蓝色文字和短下划线，不使用胶囊底色。
- Hero 高约 296px。左列约 52%，右列约 48%；标题约 46–50px、粗体、单行优先，正文约 16px。
- 主按钮为亮蓝实心矩形圆角，次按钮为纯文字加右箭头。
- Hero 球体约 430–480px 可视宽度，以 `object-fit: cover` 裁入右侧画面；静态 PNG 作为稳定底层，循环 GIF 以四边归零的无接缝径向遮罩叠加其上，并配合克制的整体漂浮与独立椭圆光晕呼吸。小屏在可见画面底缘增加纵向羽化，避免超大画面被 Hero 边界硬切；禁止额外文字卡片覆盖球体。正常动态模式下，首屏 GIF 由浏览器按视口懒加载并播放；`prefers-reduced-motion` 下，`picture` 使用 `getImageProps()` 生成的优化 PNG `source` 完成资源选择，同时 CSS 隐藏整个动画层，仅显示静态 PNG 底层。该 `source` 与底层使用相同尺寸和 `sizes`，复用 `/_next/image` URL，而非请求原始 PNG。
- 作品区为白底，三列等宽，间距约 22px。卡片圆角约 10px，1px 冷灰蓝描边和极轻阴影；图片维持 16:9。
- 卡片正文紧凑：标题约 17px，摘要约 13px，标签为小号浅蓝/浅紫圆角块。
- 博客区标题与“查看全部博客”同一行；三行列表共用一个描边容器。每行约 58–64px，缩略图约 72×46px，正文单行截断，日期和阅读时长横向排列在右侧。
- 整体颜色以 `#07175c` 深海军蓝、`#0f62fe` 品牌蓝、`#6f5cff` 紫色与白色为主；背景渐变只在 Hero 出现。

### 响应式

- 900px 以下：Hero 改为单列，文字在前、球体在后；作品区两列。
- 640px 以下：页头使用现有可访问的汉堡菜单；作品区单列；博客元信息移到标题摘要下方。
- 小屏不强行维持 928px 高度，优先保证阅读与触控。

### 主题

参考设计为明确的浅色方案。移除页头中可见的主题切换按钮，并将公开页面固定为浅色，以避免已保存的深色偏好破坏原图还原。主题基础文件可保留，避免无关重构。

## 素材映射

| 来源文件 | 目标路径 | 用途 |
|---|---|---|
| `vitamin-hero-glass-orb-loop.gif` | `/images/home/hero-orbit-loop.gif` | Hero 羽化动画叠加层 |
| `Vitamin 个人站 Hero 主视觉-蓝紫渐变3D球体.png` | `/images/home/hero-orbit.png` | Hero 稳定底图及 reduced-motion 结果 |
| `作品封面-从0到1的产品练习.png` | `/images/home/work-zero-to-one.png` | `digital-duty-officer` |
| `作品封面-一次用户研究复盘.png` | `/images/home/work-user-research.png` | `vision-algo-practice` |
| `作品封面-个人效率工具概念.png` | `/images/home/work-productivity.png` | `algo-platform` |
| `博客缩略图-从0到1做产品.png` | `/images/home/blog-zero-to-one.png` | `why-ai-era-pm` |
| `博客缩略图-用户研究方法.png` | `/images/home/blog-research.png` | `from-seeing-to-working` |
| `博客缩略图-结构化思维.png` | `/images/home/blog-structured-thinking.png` | `dont-start-with-agent` |

Markdown frontmatter 是卡片图片的唯一数据源；上表 slug 映射优先于源文件名语义。首页作品固定使用三个新版主案例（`digital-duty-officer`、`vision-algo-practice`、`algo-platform`）。博客图片分配给当前保留的三篇正式文章；图片只承担视觉作用，不改变文章标题和内容。首页和 `/work`、`/blog` 索引页均使用同一 frontmatter 图片路径，所有缩略图采用 `object-fit: cover`。

## 代码设计

- `src/app/page.tsx`：重组首页标记，使用 `next/image` 将静态 PNG 稳定底层与羽化 GIF 动画层组合为 Hero，并加载作品封面和博客缩略图；数据仍来自 `getFeaturedWork(3)` 与 `getLatestPosts(3)`。
- `src/components/header.tsx`：调整导航视觉与间距，保留当前路径高亮、移动菜单和联系链接；移除可见主题按钮。
- `src/components/work-card.tsx`：增加可选 `cover` 属性并渲染本地图片；保持详情链接和元数据渲染。
- `src/lib/content.ts`：若采用内容驱动映射，则为作品/博客元数据增加可选图片字段；不改变读取与排序语义。
- Markdown frontmatter：为三个作品和三篇博客补充本地图片路径，使首页与列表页能稳定按 slug 使用素材。
- `src/app/globals.css`：集中新增/调整首页专用组件类和设计令牌，避免在 JSX 中堆叠难以校准的大量任意 Tailwind 值。
- `src/app/layout.tsx` / 主题提供器：确保页面固定为浅色，同时保留现有元数据、Header、Footer 和内容结构。

实现应优先沿用现有组件边界；只有当参考图所需布局无法清晰表达时才新增小组件。

## 行为与异常处理

- 图片使用明确 `width`/`height` 或 `fill` + `sizes`，避免布局偏移。
- 本地图片不存在时由构建阶段或浏览器 404 暴露；提交前通过文件清单和页面检查验证全部八张。
- 导航和卡片链接沿用 Next.js `Link`，不添加空 `href`。
- Hero 动效在 `prefers-reduced-motion` 下禁用，并由 CSS 隐藏 `picture` 动画层；其中的静态 `source` 通过 `getImageProps()` 与底层共用优化后的 PNG `srcSet` 和 `sizes`，使浏览器在解析阶段不选择 GIF，也不重复下载原始 PNG。静态 PNG 底层保持为最终画面。
- 移动菜单打开时继续支持 Escape 关闭和页面滚动锁定。

## 验收标准

1. 1392×928 截图中，页头、Hero、三张作品卡和三行博客列表的层级、比例和色彩与参考图明显一致；不再出现现有的大型抽象渐变框和中央文字玻璃卡。
2. 页面以本地 PNG 作为 Hero 稳定底层，并在其上按视口懒加载一份四边完全透明、无矩形接缝的仓库内循环 GIF，不依赖 Lovart URL；开启减少动态效果时，浏览器从 `getImageProps()` 生成的优化 PNG `source` 完成资源选择，请求列表与 HTML preload 均不包含 GIF，页面仅呈现优化后的静态 PNG 底层。
3. `/`、`/about`、`/work`、`/blog` 及已有详情路由正常打开。
4. 390px 宽度无横向滚动，导航、卡片和博客列表可读可点。
5. `bun run lint` 与 `bun run build` 通过。
6. 部署后 `https://www.notvitamin.com/` 返回成功状态，首页肉眼检查通过。

## 发布方式

在本地完成并验证后提交到当前 `main` 分支并推送至 `origin`。Vercel 中自定义域名 `notvitamin.com` / `www.notvitamin.com` 当前连接到 `ai-website` 项目；该项目应由 GitHub 推送自动触发生产部署。部署完成后检查生产 URL，不修改域名、DNS 或访问权限。
