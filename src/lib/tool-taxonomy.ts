/** Shared by the server content reader and the interactive tool explorer. */
export const TOOL_CATEGORIES = [
  "AI 工作流",
  "产品与研究",
  "设计与原型",
  "开发与部署",
  "写作与知识管理",
  "效率与系统",
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const TOOL_SUBCATEGORIES: Record<ToolCategory, readonly string[]> = {
  "AI 工作流": ["对话与搜索", "Agent与自动化", "模型与API", "AI编程"],
  "产品与研究": ["检索与研究"],
  "设计与原型": ["设计与原型", "图标与素材", "图像与音视频"],
  "开发与部署": [
    "开发与数据", "云服务", "容器平台", "网站部署", "域名与邮箱", "网络调试", "游戏服务器",
  ],
  "写作与知识管理": ["笔记与资料"],
  "效率与系统": ["软件应用", "在线工具", "macOS", "网络代理", "短信服务", "其他"],
};

export const TOOL_CATEGORY_ALIASES: Record<string, string> = {
  "AI 工作流": "Ai-stuff AI",
  "开发与数据": "Dev 工程与数据",
  "云服务": "Cloud",
  "容器平台": "Container",
  "网站部署": "Hosting Container",
  "域名与邮箱": "Mail Domain",
  "游戏服务器": "Game Server",
  "软件应用": "Software",
  "在线工具": "Tools",
  "macOS": "Macos Mac",
  "网络代理": "Proxy",
  "短信服务": "Free SMS",
  "其他": "Other",
};

export function isToolCategory(value: unknown): value is ToolCategory {
  return typeof value === "string" && (TOOL_CATEGORIES as readonly string[]).includes(value);
}

export function isToolSubcategory(category: ToolCategory, value: unknown): value is string {
  return typeof value === "string" && (value === "" || TOOL_SUBCATEGORIES[category].includes(value));
}
