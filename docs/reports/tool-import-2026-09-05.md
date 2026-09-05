# 工具集合公开导入报告 · 2026-09-05

来源：[老王导航](https://nav.eooce.com/)。仅请求公开 GET 数据与图片；没有登录、写入来源站或运行下载代码。

## 覆盖范围

| 原分类 | 公开卡片数 |
| --- | ---: |
| Home | 24 |
| Ai-stuff | 30 |
| Cloud | 24 |
| Container | 30 |
| Container / Game Server | 24 |
| Software | 24 |
| Software / Proxy | 9 |
| Software / Macos | 2 |
| Tools | 30 |
| Tools / Free SMS | 30 |
| Tools / Other | 3 |
| Mail & Domain | 29 |
| Dev | 10 |

- rawResponses: 269
- uniqueSourceCards: 269
- originalTools: 8
- previousCollectionEntries: 0
- newlyImported: 260
- mergedIntoOriginal: 4
- mergedWithinImport: 4
- mergedIntoPreviousCollection: 0
- excluded: 1
- collectionTools: 260
- publicTotal: 268
- iconAvailable: 258
- iconUnavailable: 10
- linkStatus: {"ok":189,"restricted":42,"unreachable":24,"unchecked":5}

## 完整性与合并规则

- The public Home frontend imports cards(menuId, subMenuId); the public api bundle exposes GET /cards/{menuId} with only an optional subMenuId parameter.
- All eight menus and all five declared submenus were requested individually, matching the public navigation UI.
- Verified /api/cards/2?page=2 and ?limit=1000 return the same 30 IDs as the ordinary request. The public frontend exposes no pagination/cursor/load-more request. Counts refer to the full publicly exposed card arrays, not unpublished/admin records.

- Original first-person reviews remain in the eight Markdown files. Imported descriptions are neutral task summaries; prices, free-credit claims, account-recycling tips and unverified company ownership are not copied.
- Existing collection entries are preserved on reruns. Newly discovered URLs are appended; canonical aliases use src/lib/tool-url.ts. No manual entry is overwritten or deleted.
- Link checks only describe the response visible to this environment; restrictions, timeouts and errors do not remove entries.

## 合并记录

- 源条目 4（GitHub，Home）→ github：Canonical URL matches an existing tool.
- 源条目 25（ChatGPT，Ai-stuff）→ chatgpt：Canonical URL matches an existing tool.
- 源条目 49（Gmail，Mail & Domain）→ nav-3：Canonical URL matches an existing tool.
- 源条目 65（Perplexity，Ai-stuff）→ perplexity：Canonical URL matches an existing tool.
- 源条目 87（自动访问，Tools）→ nav-7：Canonical URL matches an existing tool.
- 源条目 110（Huggingface，Container）→ nav-8：Canonical URL matches an existing tool.
- 源条目 112（Vercel，Container）→ vercel：Canonical URL matches an existing tool.
- 源条目 239（Boxmineworld，Container / Game Server）→ nav-215：Canonical URL matches an existing tool.

## 跳过记录

- 源条目 291（Tools / Other）：成人色情导航，非公开工具集合内容；未访问目标，报告不保留目标网址。

## 图标缺项

- nav-20：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-90：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-106：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-213：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-229：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-235：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-238：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-286：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-288：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。
- nav-292：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。

## 浅色背景可见性检查

- 已检查 258 个本地图标（209 PNG、49 ICO）。
- Codex 已改用同一 OpenAI 标记的浅色界面黑色版本，来源与哈希记录在 JSON。
- 来源仅取得白色透明标记的条目：nav-215（Boxmineworld）、nav-230（Spaceify）、nav-273（Altare）。保持原始图案，由 ToolIcon 内部的深色底承接，不修改位图或页面整体背景。
- 其余图标未检出同类纯白透明问题。

完整原始卡片（排除项的目标已移除）、每次图标尝试、来源和链接响应记录见同名 JSON 报告。

## 重跑

```powershell
node scripts/import-nav-tools.mjs --collect-only
node scripts/import-nav-tools.mjs --icons-only
node scripts/import-nav-tools.mjs --check-links
```

重复运行保留现有收藏内容，只添加新 URL；图标校验通过后复用本地缓存。链接不可达或受限制不会删除收藏。
