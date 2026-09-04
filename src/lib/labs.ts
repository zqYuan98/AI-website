import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const LAB_ROOT = path.join(process.cwd(), "content", "lab");
const LAB_STATUSES = ["可用", "实验中"] as const;

export type LabStatus = (typeof LAB_STATUSES)[number];

export type LabMeta = {
  slug: string;
  title: string;
  summary: string;
  status: LabStatus;
  problem: string;
  usage: string;
  limitation: string;
  featured: boolean;
  order: number;
  updatedAt: string;
  cover: string;
  coverAlt: string;
};

export type LabPost = LabMeta & {
  body: string;
};

export type AcceptanceChecklistItem = {
  id: string;
  title: string;
  evidence: string;
};

export type AcceptanceChecklistGroup = {
  id: string;
  title: string;
  description: string;
  items: readonly AcceptanceChecklistItem[];
};

function fail(file: string, field: string, reason: string): never {
  throw new Error(`[content/lab/${file}] 字段“${field}”${reason}`);
}

function requiredString(
  data: Record<string, unknown>,
  field: string,
  file: string,
): string {
  const value = data[field];
  if (typeof value !== "string" || value.trim() === "") {
    fail(file, field, "必须是非空字符串");
  }
  return value.trim();
}

function requiredBoolean(
  data: Record<string, unknown>,
  field: string,
  file: string,
): boolean {
  const value = data[field];
  if (typeof value !== "boolean") {
    fail(file, field, "必须是布尔值");
  }
  return value;
}

function requiredNumber(
  data: Record<string, unknown>,
  field: string,
  file: string,
): number {
  const value = data[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(file, field, "必须是有限数字");
  }
  return value;
}

function requiredStatus(
  data: Record<string, unknown>,
  file: string,
): LabStatus {
  const value = requiredString(data, "status", file);
  if (!LAB_STATUSES.includes(value as LabStatus)) {
    fail(file, "status", `必须是 ${LAB_STATUSES.join(" / ")} 之一`);
  }
  return value as LabStatus;
}

function requiredDate(
  data: Record<string, unknown>,
  field: string,
  file: string,
): string {
  const raw = data[field];
  const value =
    raw instanceof Date && !Number.isNaN(raw.getTime())
      ? raw.toISOString().slice(0, 10)
      : typeof raw === "string"
        ? raw.trim()
        : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(file, field, "必须使用 YYYY-MM-DD 格式");
  }
  return value;
}

function parseLab(file: string): LabPost {
  const raw = fs.readFileSync(path.join(LAB_ROOT, file), "utf8");
  const { data: frontmatter, content } = matter(raw);
  const data = frontmatter as Record<string, unknown>;
  const cover = requiredString(data, "cover", file);
  const body = content.trim();

  if (!cover.startsWith("/")) {
    fail(file, "cover", "必须是 public 目录下的站内绝对路径");
  }
  if (!body) {
    fail(file, "正文", "不能为空");
  }

  return {
    slug: file.replace(/\.mdx?$/, ""),
    title: requiredString(data, "title", file),
    summary: requiredString(data, "summary", file),
    status: requiredStatus(data, file),
    problem: requiredString(data, "problem", file),
    usage: requiredString(data, "usage", file),
    limitation: requiredString(data, "limitation", file),
    featured: requiredBoolean(data, "featured", file),
    order: requiredNumber(data, "order", file),
    updatedAt: requiredDate(data, "updatedAt", file),
    cover,
    coverAlt: requiredString(data, "coverAlt", file),
    body,
  };
}

export function getAllLabs(): LabPost[] {
  if (!fs.existsSync(LAB_ROOT)) return [];

  return fs
    .readdirSync(LAB_ROOT)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map(parseLab)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getLabBySlug(slug: string): LabPost | undefined {
  return getAllLabs().find((lab) => lab.slug === slug);
}

export function getFeaturedLabs(limit = 1): LabPost[] {
  return getAllLabs()
    .filter((lab) => lab.featured)
    .slice(0, limit);
}

export const acceptanceChecklistGroups = [
  {
    id: "problem-value",
    title: "问题与价值",
    description: "先证明问题值得解决，再讨论是否需要 AI。",
    items: [
      {
        id: "problem-observed-evidence",
        title: "真实问题有可复查的现场证据，而不只是技术机会",
        evidence: "访谈、工单、操作记录或失败案例能够说明问题反复发生。",
      },
      {
        id: "baseline-non-ai",
        title: "记录了当前做法与至少一种非 AI 对照方案",
        evidence: "说明规则、流程优化或人工方案为何不足，或为何已经足够。",
      },
      {
        id: "user-and-owner",
        title: "明确实际使用者、结果接收者与最终责任人",
        evidence: "三种角色可以是同一人，也可以分开，但不能无人负责。",
      },
      {
        id: "outcome-threshold",
        title: "在选方案前写下业务结果与最低成功阈值",
        evidence: "阈值可被观察，并能支持继续、缩小范围或停止的决定。",
      },
    ],
  },
  {
    id: "data-boundary",
    title: "数据与边界",
    description: "确认输入能持续获得，也说清系统不能做什么。",
    items: [
      {
        id: "data-source-rights",
        title: "数据来源稳定，并完成授权、合规与保留周期确认",
        evidence: "上线后的真实输入能够合法持续获取，而非只依赖一次性样本。",
      },
      {
        id: "representative-samples",
        title: "评测集覆盖常见、边缘、近期和低质量输入",
        evidence: "样本分布贴近实际工作，不只挑选容易成功的案例。",
      },
      {
        id: "capability-boundary",
        title: "声明 AI 输出是候选、建议还是可直接执行的决定",
        evidence: "产品界面、流程和文档对能力边界采用同一种口径。",
      },
      {
        id: "failure-set",
        title: "保留已知失败样本，并定义不可接受的错误类型",
        evidence: "评审可以看到系统在哪里会错，而不只看到平均准确率。",
      },
    ],
  },
  {
    id: "human-collaboration",
    title: "人机协作",
    description: "把确认、行动和责任放进同一条工作链。",
    items: [
      {
        id: "human-confirmation",
        title: "需要人工确认的节点、时限和操作方式已经明确",
        evidence: "人不是抽象的兜底，而是在具体时刻收到具体任务。",
      },
      {
        id: "risk-handoff",
        title: "高风险、低置信度与异常输入会主动转交给人",
        evidence: "触发条件、接收角色与超时处理均可验证。",
      },
      {
        id: "decision-context",
        title: "确认者能看到做判断所需的上下文与不确定性",
        evidence: "不以单一结论替代原始证据、来源、时间和置信信息。",
      },
      {
        id: "action-ownership",
        title: "AI 输出之后的处置、复查与关闭责任可追踪",
        evidence: "每个结果都有状态、负责人和完成定义，不停在消息提醒。",
      },
    ],
  },
  {
    id: "failure-fallback",
    title: "失败与回退",
    description: "系统出错时，仍然要能被发现、解释和接管。",
    items: [
      {
        id: "error-detection",
        title: "有机制发现沉默错误、性能漂移与流程中断",
        evidence: "包含业务反馈、抽检或监控，而非只等待用户投诉。",
      },
      {
        id: "evidence-trace",
        title: "关键结果可回溯到输入、版本、规则与人工操作",
        evidence: "出现争议时能够重建一次完整决策过程。",
      },
      {
        id: "fallback-drill",
        title: "降级、回退与人工替代路径已经实际演练",
        evidence: "模型或依赖不可用时，核心工作不会被锁死。",
      },
    ],
  },
  {
    id: "acceptance-reuse",
    title: "验收与复用",
    description: "用上线后的证据做结论，并让一次交付留下资产。",
    items: [
      {
        id: "online-metrics",
        title: "上线指标同时覆盖模型、流程、结果与风险",
        evidence: "例如采纳率、处理时长、遗漏、误报、接管率和业务结果。",
      },
      {
        id: "acceptance-signoff",
        title: "验收周期、样本、门槛和签字责任人已经约定",
        evidence: "团队知道何时、基于什么证据、由谁作出验收结论。",
      },
      {
        id: "reuse-assets",
        title: "沉淀了可复用的数据、评测、流程或组件清单",
        evidence: "复盘说明下一次如何更快、更稳或更便宜，而非只交付代码。",
      },
    ],
  },
] as const satisfies readonly AcceptanceChecklistGroup[];

const acceptanceItemIds = acceptanceChecklistGroups.flatMap((group) =>
  group.items.map((item) => item.id),
);

if (acceptanceItemIds.length !== 18 || new Set(acceptanceItemIds).size !== 18) {
  throw new Error("AI 功能验收清单必须包含 18 个不重复的稳定 ID");
}
