/**
 * Public navigation import. GET/HEAD only; no login, cookies, remote code execution,
 * private-network requests, SVG storage, or removal of existing manual entries.
 * node scripts/import-nav-tools.mjs --collect-only
 * node scripts/import-nav-tools.mjs --icons-only
 * node scripts/import-nav-tools.mjs --check-links
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import matter from 'gray-matter';
import sharp from 'sharp';
import { canonicalToolUrl, validatedToolUrl } from '../src/lib/tool-url.ts';
import { TOOL_SUBCATEGORIES } from '../src/lib/tool-taxonomy.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = { name: '老王导航', url: 'https://nav.eooce.com/', importedAt: '2026-09-05' };
const COLLECTION = path.join(ROOT, 'content/tool-collection.json');
const ICON_MAP = path.join(ROOT, 'content/tool-icon-map.json');
const REPORT = path.join(ROOT, 'docs/reports/tool-import-2026-09-05.json');
const REPORT_MD = path.join(ROOT, 'docs/reports/tool-import-2026-09-05.md');
const ICON_DIR = path.join(ROOT, 'public/images/tools/icons');
const args = new Set(process.argv.slice(2));
const onlySlugs = [...args].find((argument) => argument.startsWith('--only='))?.slice(7).split(',');
const dnsCache = new Map();
const sourceExclusions = new Map([[291, '成人色情导航，非公开工具集合内容；未访问目标，报告不保留目标网址。']]);
const domainQueues = new Map();

function isPublicAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 192 && b === 0 && [0, 2].includes(c)) || (a === 198 && [18, 19].includes(b)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return !/^(::|fc|fd|fe[89ab]|ff|2001:db8)/.test(normalized);
  }
  return false;
}

async function publicAddress(hostname) {
  const hostnameLower = hostname.toLowerCase();
  if (!hostnameLower.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(hostnameLower)) {
    throw new Error('PRIVATE_OR_INVALID_HOST');
  }
  if (!dnsCache.has(hostnameLower)) {
    dnsCache.set(hostnameLower, dns.lookup(hostnameLower, { all: true }).catch(() => []).then(async (addresses) => {
      // Some local VPNs return 198.18/15 synthetic IPs. Resolve through a public
      // DNS-over-HTTPS endpoint and pin the verified public address instead.
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        const answer = await new Promise((resolve, reject) => {
          const request = https.get(`https://1.1.1.1/dns-query?name=${encodeURIComponent(hostnameLower)}&type=A`, {
            headers: { Accept: 'application/dns-json' },
          }, (response) => {
            const chunks = [];
            let bytes = 0;
            response.on('data', (chunk) => {
              bytes += chunk.length;
              if (bytes > 65_536) response.destroy(new Error('DNS_RESPONSE_TOO_LARGE'));
              else chunks.push(chunk);
            });
            response.on('error', reject);
            response.on('end', () => {
              try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
            });
          });
          request.setTimeout(5000, () => request.destroy(new Error('DNS_TIMEOUT')));
          request.on('error', reject);
        });
        addresses = (answer.Answer ?? []).filter((record) => record.type === 1).map((record) => ({ address: record.data, family: 4 }));
      }
      if (!addresses.length) throw new Error('DNS_NO_PUBLIC_A_RECORD');
      if (addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('PRIVATE_OR_RESERVED_ADDRESS');
      return addresses.find(({ family }) => family === 4) ?? addresses[0];
    }));
  }
  return dnsCache.get(hostnameLower);
}

async function safeRequest(raw, { method = 'GET', maxBytes = 2_500_000, timeout = 9000, redirects = 5, stopAtAccount = false } = {}) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('UNSAFE_URL');
  const address = await publicAddress(url.hostname);
  const previous = domainQueues.get(url.hostname) ?? Promise.resolve();
  let release;
  domainQueues.set(url.hostname, new Promise((resolve) => { release = resolve; }));
  await previous;
  let response;
  try {
    response = await new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https : http).request(url, {
        method,
        maxHeaderSize: 65_536,
        headers: { 'User-Agent': 'VitaminToolCollection/1.0 (public metadata import)', Accept: '*/*' },
        lookup: (_hostname, options, callback) => options.all
          ? callback(null, [address])
          : callback(null, address.address, address.family),
      }, (res) => {
        const chunks = [];
        let size = 0;
        res.on('error', reject);
        if (method === 'HEAD' || [301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.alloc(0), finalUrl: url.toString() });
          return;
        }
        if (Number(res.headers['content-length']) > maxBytes) {
          res.destroy(new Error('MAX_BYTES_EXCEEDED'));
          return;
        }
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBytes) res.destroy(new Error('MAX_BYTES_EXCEEDED'));
          else chunks.push(chunk);
        });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), finalUrl: url.toString() }));
      });
      const timer = setTimeout(() => request.destroy(new Error('REQUEST_TIMEOUT')), timeout);
      request.on('close', () => clearTimeout(timer));
      request.on('error', reject);
      request.end();
    });
  } finally {
    release();
  }
  if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
    if (redirects <= 0) throw new Error('REDIRECT_LIMIT');
    const next = new URL(response.headers.location, url);
    if (stopAtAccount && (/\/(?:signin|login|admin|authorize)(?:\/|$)/i.test(next.pathname) || /^(?:admin|account|accounts|auth)\./i.test(next.hostname))) {
      return { ...response, restrictedRedirect: true };
    }
    return safeRequest(next.toString(), { method, maxBytes, timeout, redirects: redirects - 1, stopAtAccount });
  }
  return response;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function pool(items, task, concurrency = 6) {
  let next = 0;
  const output = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await task(items[index], index);
    }
  }));
  return output;
}

async function originalTools() {
  return Promise.all((await fs.readdir(path.join(ROOT, 'content/tools'))).filter((file) => file.endsWith('.md')).map(async (file) => {
    const { data } = matter(await fs.readFile(path.join(ROOT, 'content/tools', file), 'utf8'));
    return { slug: file.replace(/\.md$/, ''), name: data.name, url: data.url, icon: '' };
  }));
}

const CATEGORY_DEFAULTS = {
  'Ai-stuff': ['AI 工作流', '对话与搜索'],
  Cloud: ['开发与部署', '云服务'],
  Container: ['开发与部署', '容器平台'],
  'Container / Game Server': ['开发与部署', '游戏服务器'],
  Software: ['效率与系统', '软件应用'],
  'Software / Proxy': ['效率与系统', '网络代理'],
  'Software / Macos': ['效率与系统', 'macOS'],
  Tools: ['效率与系统', '在线工具'],
  'Tools / Free SMS': ['效率与系统', '短信服务'],
  'Tools / Other': ['效率与系统', '其他'],
  'Mail & Domain': ['开发与部署', '域名与邮箱'],
  Dev: ['开发与部署', '开发与数据'],
  Home: ['效率与系统', '在线工具'],
};
const CLASSIFICATIONS = [
  [[3,14,15,49], '开发与部署', '域名与邮箱'],
  [[4,13,22,44,46,47,91,117,124,130,131,175,176,198,201,217,220,234,238,279,281,283], '开发与部署', '开发与数据'],
  [[5,9,10,11,12,43,55,148,218], '开发与部署', '网络调试'],
  [[6], '开发与部署', '云服务'],
  [[8,63,72,110], 'AI 工作流', '模型与API'],
  [[57,64], 'AI 工作流', 'Agent与自动化'],
  [[59,60,61,62,70,73,74,138,139], 'AI 工作流', 'AI编程'],
  [[125], 'AI 工作流', '对话与搜索'],
  [[2,18,20,48,115,118,120,121,132,137,174,178,200,292], '设计与原型', '图像与音视频'],
  [[38,134,196,197,282,284], '设计与原型', '图标与素材'],
  [[119,140,199], '设计与原型', '设计与原型'],
  [[16,17,19,290], '产品与研究', '检索与研究'],
  [[23], '写作与知识管理', '笔记与资料'],
  [[21,146,147,295], '效率与系统', '网络代理'],
  [[112,113,153,221], '开发与部署', '网站部署'],
  [[24,135,289], '效率与系统', '在线工具'],
];
const neutralDescriptions = {
  1: '通知消息管理入口。', 2: '视频内容平台。', 3: 'Google 邮箱服务。',
  5: '查询当前网络的 IP 地址信息。', 6: 'CDN、域名解析与网站网络服务。',
  7: '网页定时访问管理工具。', 8: '模型、数据集与应用演示社区。',
  9: '在线 TCP 连通性检测。', 10: 'IP 地址与网络属性查询。', 11: '浏览器环境与指纹信息检测。',
  12: '服务器运行状态监控面板。', 13: '在浏览器中发送和调试 API 请求。',
  14: '域名可用性查询。', 15: '域名服务价格比较。', 16: '主机与服务器话题社区。',
  17: '技术交流社区。', 18: '在线音乐播放入口。', 19: '主机与技术交流社区。',
  20: '影视内容检索与播放入口。', 21: '代理订阅格式转换。', 22: '浏览器 SSH 终端管理。',
  23: '文件上传与分享工具。', 24: '地址格式生成工具。',
  26: 'Anthropic 的 AI 对话与协作工具。', 27: 'DeepSeek 模型与 AI 服务入口。',
  28: 'Google 的 AI 对话与多模态助手。', 29: '通义千问 AI 对话入口。', 30: 'Kimi AI 对话助手。',
  56: 'AI 对话与搜索工具。', 57: '多步骤 AI 任务与 Agent 工作台。', 58: 'Akash 的 AI 对话入口。',
  59: '通过自然语言生成界面和应用。', 60: 'AI 辅助网页与界面开发。', 61: 'AI 辅助应用搭建工具。',
  62: 'AI 辅助网站生成与编辑。', 63: '多模型 API 接入平台。', 64: '执行多步骤任务的 AI Agent。',
  66: 'Grok AI 对话助手。', 67: 'Microsoft AI 对话助手。', 68: '豆包 AI 对话与创作助手。',
  69: '百度 AI 对话助手入口。', 70: 'Google 的 AI 编程任务工具。', 72: '模型推理与 API 服务平台。',
  73: 'AI 辅助编程工具。', 74: '面向代码编写与修改的 AI 编辑器。',
  37: 'Windows 与办公软件资源索引。', 38: '设计工具与素材资源索引。', 39: 'Windows 软件资源索引。',
  40: '软件资源索引。', 90: '定时任务、快捷键与桌面流程自动化。', 92: '浏览器多环境管理工具。',
  116: 'Windows 激活相关工具入口。', 122: '桌面浏览器。', 123: '浏览器多环境管理工具。',
  124: 'SSH 连接与终端管理软件。', 125: '多模型 AI 对话客户端。', 126: '音乐播放器项目。',
  127: '桌面音乐播放器项目。', 128: '远程桌面控制工具。', 130: 'Android 屏幕投射与控制项目。',
  174: '音视频压缩与处理工具箱。', 175: '数据库查询与管理客户端。', 176: '数据库管理软件相关资源链接。',
  177: 'Windows 软件卸载工具。', 178: '截图、贴图与图像记录工具。', 179: 'Windows 内存管理工具。',
  217: '本地 Web 开发环境管理。', 234: 'HTTP 请求调试与 API 测试。', 235: '远程桌面连接工具。',
  43: 'Cloudflare Tunnel 配置辅助工具。', 44: 'Base64 编码与解码。', 45: '二维码生成工具。',
  46: 'JavaScript 代码混淆工具。', 47: 'Python 代码混淆工具。', 48: '图像背景移除工具。',
  55: '分析网页性能与加载体验。', 87: '网页定时访问管理工具。', 88: '定时触发网页请求。',
  89: '网址缩短服务。', 91: 'Linux 软件镜像源配置资料。', 115: '音轨与人声分离工具。',
  117: 'JSON 格式化与语法校验。', 118: 'AI 图像编辑工具。', 119: 'AI 辅助演示文稿制作。',
  120: '在线文件格式转换。', 121: '在线视频链接解析工具。', 131: '开发与编码小工具集合。',
  132: 'AI 图像清晰度增强工具。', 134: 'Emoji 分类查询。', 135: '支付表单测试数据生成工具。',
  137: '图像压缩与格式转换。', 138: '用 AI 构建 Web 应用。', 139: 'AI 应用代码生成工具。',
  140: '设计稿与界面转换工具。', 141: '在线实用工具集合。', 145: '在线实用工具集合。',
  146: '浏览器在线代理服务。', 147: '浏览器在线代理服务。', 148: '检查网络 DNS 查询出口。',
  153: '应用运行与网站托管平台。', 198: 'JavaScript 代码反混淆工具。', 200: '在线视频制作与编辑工具。',
  220: 'Shell 脚本混淆工具。', 236: '网页封装为应用的工具。', 238: 'PHP 代码混淆工具。',
  283: 'Punycode 域名编码与解码。', 196: '图标素材检索与下载。', 197: '矢量图标管理与检索平台。',
  199: '界面组件示例与样式资源。', 201: 'Vue 表单组件工具。', 218: 'GitHub 资源访问辅助服务。',
  221: '以 Markdown 生成文档网站。', 282: 'Iconify 图标集合检索。', 284: '壁纸素材检索。',
  289: '地址格式生成工具。', 290: '美国电话区号对照资料。', 292: '在线音乐入口。', 295: 'SOCKS5 代理资源查询。',
};

function classify(card, sourceCategories) {
  for (const [ids, category, subcategory] of CLASSIFICATIONS) {
    if (ids.includes(card.id)) return { category, subcategory };
  }
  const sourceCategory = sourceCategories.find((category) => category.includes(' / ')) ?? sourceCategories.find((category) => category !== 'Home') ?? 'Home';
  const [category, subcategory] = CATEGORY_DEFAULTS[sourceCategory];
  return { category, subcategory };
}

function describe(card, subcategory) {
  if (neutralDescriptions[card.id]) return neutralDescriptions[card.id];
  if (subcategory === '云服务') return `${card.title} 的云服务与主机管理入口。`;
  if (subcategory === '容器平台') return `${card.title} 应用与容器托管入口。`;
  if (subcategory === '游戏服务器') return `${card.title} 游戏服务器与应用托管入口。`;
  if (subcategory === '网络代理') return `${card.title} 代理连接与配置工具。`;
  if (subcategory === 'macOS') return `${card.title} 的 macOS 软件资源索引。`;
  if (subcategory === '短信服务') return `${card.title} 的公开短信接收服务。`;
  if (subcategory === '域名与邮箱') return /邮箱|mail|gmail|outlook|proton|yahoo|2925|88|22.do/i.test(`${card.title} ${card.url} ${card.desc ?? ''}`)
    ? `${card.title} 邮箱服务入口。` : `${card.title} 域名注册与管理入口。`;
  return '';
}

async function getSourceJson(endpoint) {
  const response = await safeRequest(new URL(endpoint, SOURCE.url).toString());
  if (response.status !== 200) throw new Error(`${endpoint}: HTTP ${response.status}`);
  return JSON.parse(response.body.toString('utf8'));
}

async function collect() {
  const menus = await getSourceJson('/api/menus');
  const scopes = menus.flatMap((menu) => [
    { label: menu.name, endpoint: `/api/cards/${menu.id}`, menuId: menu.id, subMenuId: null },
    ...menu.subMenus.map((sub) => ({ label: `${menu.name} / ${sub.name}`, endpoint: `/api/cards/${menu.id}?subMenuId=${sub.id}`, menuId: menu.id, subMenuId: sub.id })),
  ]);
  const coverage = [];
  const records = new Map();
  for (const scope of scopes) {
    const cards = await getSourceJson(scope.endpoint);
    if (!Array.isArray(cards)) throw new Error(`Unexpected card response: ${scope.endpoint}`);
    coverage.push({ ...scope, count: cards.length, cardIds: cards.map((card) => card.id) });
    for (const card of cards) {
      if (sourceExclusions.has(card.id)) {
        records.set(card.id, { id: card.id, sourceCategories: [scope.label], excluded: true });
        continue;
      }
      const current = records.get(card.id);
      if (current) current.sourceCategories = [...new Set([...current.sourceCategories, scope.label])];
      else records.set(card.id, { ...card, sourceCategories: [scope.label] });
    }
  }
  const originals = await originalTools();
  const previous = await readJson(COLLECTION, { source: SOURCE, tools: [] });
  const tools = previous.tools.map((tool) => ({ ...tool }));
  const known = new Map(originals.map((tool) => [canonicalToolUrl(tool.url), { type: 'original', slug: tool.slug }]));
  for (const tool of tools) known.set(canonicalToolUrl(tool.url), { type: 'existing-collection', slug: tool.slug, tool });
  const decisions = [];
  const iconSources = {};
  for (const card of [...records.values()].sort((a, b) => a.id - b.id)) {
    if (sourceExclusions.has(card.id)) {
      decisions.push({ sourceId: card.id, sourceCategories: card.sourceCategories, action: 'excluded', reason: sourceExclusions.get(card.id) });
      continue;
    }
    let url;
    try {
      const parsed = new URL(validatedToolUrl(card.url));
      for (const key of [...parsed.searchParams.keys()]) if (/^utm_/i.test(key)) parsed.searchParams.delete(key);
      url = parsed.toString();
    } catch (error) {
      decisions.push({ sourceId: card.id, sourceCategories: card.sourceCategories, action: 'excluded', reason: `Invalid public URL: ${error.message}` });
      continue;
    }
    const canonical = canonicalToolUrl(url);
    const duplicate = known.get(canonical);
    if (duplicate) {
      if (duplicate.type === 'new-import') duplicate.tool.sourceCategories = [...new Set([...duplicate.tool.sourceCategories, ...card.sourceCategories])];
      iconSources[duplicate.slug] ??= [];
      iconSources[duplicate.slug].push(...[card.display_logo, card.logo_url].filter(Boolean));
      decisions.push({ sourceId: card.id, name: card.title, sourceCategories: card.sourceCategories, action: 'merged', into: duplicate.slug, intoType: duplicate.type, reason: 'Canonical URL matches an existing tool.', canonical });
      continue;
    }
    const { category, subcategory } = classify(card, card.sourceCategories);
    if (!TOOL_SUBCATEGORIES[category]?.includes(subcategory)) throw new Error(`Unknown taxonomy: ${category}/${subcategory}`);
    const tool = { slug: `nav-${card.id}`, name: card.title.trim(), url, category, subcategory, scenario: describe(card, subcategory), icon: '', sourceCategories: card.sourceCategories, linkStatus: 'unchecked' };
    tools.push(tool);
    known.set(canonical, { type: 'new-import', slug: tool.slug, tool });
    iconSources[tool.slug] = [card.display_logo, card.logo_url].filter(Boolean);
    decisions.push({ sourceId: card.id, name: tool.name, sourceCategories: card.sourceCategories, action: 'imported', slug: tool.slug });
  }
  const collection = { source: SOURCE, tools };
  const oldReport = await readJson(REPORT, {});
  const report = {
    source: SOURCE,
    generatedAt: new Date().toISOString(),
    coverage,
    completenessEvidence: [
      'The public Home frontend imports cards(menuId, subMenuId); the public api bundle exposes GET /cards/{menuId} with only an optional subMenuId parameter.',
      'All eight menus and all five declared submenus were requested individually, matching the public navigation UI.',
      'Verified /api/cards/2?page=2 and ?limit=1000 return the same 30 IDs as the ordinary request. The public frontend exposes no pagination/cursor/load-more request. Counts refer to the full publicly exposed card arrays, not unpublished/admin records.',
    ],
    counts: { rawResponses: coverage.reduce((n, scope) => n + scope.count, 0), uniqueSourceCards: records.size, originalTools: originals.length, previousCollectionEntries: previous.tools.length, newlyImported: decisions.filter((d) => d.action === 'imported').length, mergedIntoOriginal: decisions.filter((d) => d.action === 'merged' && d.intoType === 'original').length, mergedWithinImport: decisions.filter((d) => d.action === 'merged' && d.intoType === 'new-import').length, mergedIntoPreviousCollection: decisions.filter((d) => d.action === 'merged' && d.intoType === 'existing-collection').length, excluded: decisions.filter((d) => d.action === 'excluded').length, collectionTools: tools.length, publicTotal: tools.length + originals.length },
    decisions,
    iconSources,
    originalSourceCards: [...records.values()],
    icons: oldReport.icons ?? [],
    links: oldReport.links ?? [],
    appearanceAudit: oldReport.appearanceAudit ?? null,
    notes: [
      'Original first-person reviews remain in the eight Markdown files. Imported descriptions are neutral task summaries; prices, free-credit claims, account-recycling tips and unverified company ownership are not copied.',
      'Existing collection entries are preserved on reruns. Newly discovered URLs are appended; canonical aliases use src/lib/tool-url.ts. No manual entry is overwritten or deleted.',
      'Link checks only describe the response visible to this environment; restrictions, timeouts and errors do not remove entries.',
    ],
  };
  await writeJson(COLLECTION, collection);
  await writeJson(REPORT, report);
  await writeReportMarkdown(report);
  console.log(JSON.stringify(report.counts));
  return { collection, report, originals };
}

const brandIcons = {
  chatgpt: 'chatgpt', codex: 'openai', figma: 'figma', github: 'github', notebooklm: 'notebooklm', obsidian: 'obsidian', perplexity: 'perplexity', vercel: 'vercel',
  'nav-2': 'youtube', 'nav-3': 'gmail', 'nav-6': 'cloudflare', 'nav-8': 'hugging-face', 'nav-13': 'hoppscotch', 'nav-20': 'moontv', 'nav-26': 'claude',
  'nav-27': 'deepseek', 'nav-28': 'google-gemini', 'nav-30': 'kimi', 'nav-31': 'alibaba-cloud', 'nav-33': 'oracle-cloud',
  'nav-34': 'aws', 'nav-35': 'digitalocean', 'nav-36': 'vultr', 'nav-50': 'microsoft-outlook', 'nav-51': 'proton-mail',
  'nav-59': 'v0', 'nav-63': 'openrouter', 'nav-66': 'grok', 'nav-67': 'microsoft-copilot', 'nav-74': 'cursor', 'nav-75': 'google-cloud',
  'nav-76': 'microsoft-azure', 'nav-77': 'linode', 'nav-93': 'koyeb', 'nav-94': 'render', 'nav-95': 'fly-io', 'nav-96': 'northflank',
  'nav-98': 'railway', 'nav-113': 'netlify', 'nav-122': 'zen-browser', 'nav-137': 'squoosh', 'nav-138': 'bolt',
  'nav-149': 'modal', 'nav-153': 'wasmer', 'nav-154': 'appwrite', 'nav-170': 'spaceship', 'nav-172': 'godaddy',
  'nav-175': 'beekeeper-studio', 'nav-176': 'navicat', 'nav-196': 'icons8', 'nav-197': 'iconfont', 'nav-221': 'vitepress',
  'nav-131': 'it-tools', 'nav-234': 'requestly', 'nav-279': 'databricks', 'nav-282': 'iconify', 'nav-287': 'namecheap',
};

const fallbackIconDomains = {
  'nav-5': 'ip.sb', 'nav-90': 'everauto.net', 'nav-105': 'claw.cloud', 'nav-106': 'cloudcat.one',
  'nav-156': 'xoxome.online', 'nav-162': 'publiczone.org', 'nav-164': 'digitalplat.org',
  'nav-212': 'daki.cc', 'nav-213': 'crosmo.de', 'nav-223': 'echohost.org', 'nav-225': 'zenix.sg',
  'nav-229': 'berrynodes.com', 'nav-231': 'freeserver.tw', 'nav-233': 'atomicnetworks.co',
  'nav-238': 'toolnb.com', 'nav-240': 'zampto.net', 'nav-278': 'lunes.host', 'nav-288': 'gv.uy',
};

async function rasterizeSelfContainedSvg(buffer) {
  const svg = buffer.toString('utf8');
  if (buffer.length > 250_000 || !/<svg[\s>]/i.test(svg) ||
      /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<(?:script|foreignObject|image|iframe|object|embed|audio|video|animate|set)\b|\son\w+\s*=|@import/i.test(svg) ||
      /(?:href|src)\s*=\s*["'](?!#)[^"']+/i.test(svg) || /url\(\s*["']?(?!#)[^)]/i.test(svg)) {
    throw new Error('SVG_NOT_SELF_CONTAINED');
  }
  return { buffer: await sharp(buffer, { limitInputPixels: 16_000_000 }).resize({ width: 128, height: 128, fit: 'inside' }).png().toBuffer(), extension: 'png' };
}

function rasterExtension(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (buffer.length > 22 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1 && buffer.readUInt16LE(4) > 0) return 'ico';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return 'webp';
  return null;
}

async function validRaster(buffer) {
  const extension = rasterExtension(buffer);
  if (!extension) throw new Error('NOT_A_SUPPORTED_RASTER');
  if (extension === 'ico') {
    const count = buffer.readUInt16LE(4);
    if (count > 64 || buffer.length < 6 + count * 16) throw new Error('INVALID_ICO_DIRECTORY');
    for (let index = 0; index < count; index++) {
      const entry = 6 + index * 16;
      const size = buffer.readUInt32LE(entry + 8);
      const offset = buffer.readUInt32LE(entry + 12);
      if (!size || offset < 6 + count * 16 || offset + size > buffer.length) throw new Error('INVALID_ICO_ENTRY');
      if (rasterExtension(buffer.subarray(offset, offset + size)) === 'png') return validRaster(buffer.subarray(offset, offset + size));
    }
    return { buffer, extension };
  }
  const metadata = await sharp(buffer, { limitInputPixels: 16_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 8 || metadata.height < 8) throw new Error('INVALID_ICON_DIMENSIONS');
  return { buffer: await sharp(buffer, { limitInputPixels: 16_000_000 }).resize({ width: 128, height: 128, fit: 'inside', withoutEnlargement: true }).png().toBuffer(), extension: 'png' };
}

async function downloadIcons(collection, report, originals) {
  const iconMap = await readJson(ICON_MAP, {});
  await fs.mkdir(ICON_DIR, { recursive: true });
  const defaultHashes = new Set();
  try {
    const fallback = await safeRequest('https://www.google.com/s2/favicons?domain=vitamin-import-nonexistent.invalid&sz=64');
    if (fallback.status === 200) defaultHashes.add(crypto.createHash('sha256').update(fallback.body).digest('hex'));
  } catch { /* A generic fallback is never synthesized locally. */ }
  const tasks = [...originals, ...collection.tools];
  const previousIconReports = new Map((report.icons ?? []).map((icon) => [icon.slug, icon]));
  const icons = await pool(tasks, async (tool, index) => {
    if (onlySlugs && !onlySlugs.includes(tool.slug)) return previousIconReports.get(tool.slug) ?? { slug: tool.slug, status: 'unavailable', path: tool.icon || iconMap[tool.slug] || '' };
    const existingPath = iconMap[tool.slug] || tool.icon;
    if (!args.has('--refresh-icons') && existingPath?.startsWith('/images/tools/icons/')) {
      try {
        await validRaster(await fs.readFile(path.join(ROOT, 'public', existingPath)));
        iconMap[tool.slug] = existingPath;
        tool.icon = existingPath;
        return { ...(previousIconReports.get(tool.slug) ?? {}), slug: tool.slug, status: 'cached', path: existingPath };
      } catch { /* Try known public sources again. */ }
    }
    const candidates = [];
    if (tool.slug === 'codex') candidates.push('https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/light/openai.png');
    if (tool.slug === 'notebooklm') candidates.push('https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/dark/notebooklm-color.png');
    if (brandIcons[tool.slug]) candidates.push(`https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/png/${brandIcons[tool.slug]}.png`);
    for (const source of report.iconSources[tool.slug] ?? []) {
      if (!/^https?:\/\//i.test(source) && !/^data:image\/(?:png;base64|svg\+xml[,;])/i.test(source)) continue;
      candidates.push(source);
    }
    candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(tool.url).hostname)}&sz=64`);
    candidates.push(new URL('/favicon.ico', tool.url).toString());
    if (fallbackIconDomains[tool.slug]) {
      candidates.push(`https://www.google.com/s2/favicons?domain=${fallbackIconDomains[tool.slug]}&sz=64`);
      candidates.push(`https://${fallbackIconDomains[tool.slug]}/favicon.ico`);
    }
    const attempts = [];
    for (const candidate of [...new Set(candidates)]) {
      try {
        let response;
        if (candidate.startsWith('data:image/png;base64,')) {
          if (candidate.length > 1_600_000) throw new Error('DATA_ICON_TOO_LARGE');
          response = { status: 200, body: Buffer.from(candidate.slice(candidate.indexOf(',') + 1), 'base64'), finalUrl: 'source:inline-png' };
        } else if (candidate.startsWith('data:image/svg+xml,')) {
          response = { status: 200, body: Buffer.from(decodeURIComponent(candidate.slice(candidate.indexOf(',') + 1).replace(/%(?![a-f\d]{2})/gi, '%25'))), finalUrl: 'source:inline-svg-rasterized' };
        } else response = await safeRequest(candidate, { timeout: 6500, maxBytes: 1_200_000, stopAtAccount: true });
        if (response.status !== 200) throw new Error(`HTTP_${response.status}`);
        if (defaultHashes.has(crypto.createHash('sha256').update(response.body).digest('hex'))) throw new Error('GENERIC_FAVICON_PLACEHOLDER');
        const { buffer, extension } = /<svg[\s>]/i.test(response.body.subarray(0, 2000).toString('utf8'))
          ? await rasterizeSelfContainedSvg(response.body) : await validRaster(response.body);
        const filename = `${tool.slug}.${extension}`;
        await fs.writeFile(path.join(ICON_DIR, filename), buffer);
        const iconPath = `/images/tools/icons/${filename}`;
        iconMap[tool.slug] = iconPath;
        tool.icon = iconPath;
        if ((index + 1) % 25 === 0) console.log(`Icons ${index + 1}/${tasks.length}`);
        return { slug: tool.slug, status: 'downloaded', path: iconPath, sourceUrl: candidate.startsWith('data:') ? response.finalUrl : candidate, finalUrl: response.finalUrl, bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), attempts };
      } catch (error) { attempts.push({ sourceUrl: candidate, error: error.message }); }
    }
    iconMap[tool.slug] = '';
    tool.icon = '';
    return { slug: tool.slug, status: 'unavailable', path: '', attempts };
  });
  report.icons = icons;
  report.counts.iconAvailable = icons.filter((icon) => icon.path).length;
  report.counts.iconUnavailable = icons.filter((icon) => !icon.path).length;
  await writeJson(ICON_MAP, iconMap);
  await writeJson(COLLECTION, collection);
  await writeJson(REPORT, report);
  await writeReportMarkdown(report);
  console.log(`Icons complete: ${report.counts.iconAvailable}/${tasks.length}`);
}

async function checkLinks(collection, report) {
  const previous = new Map((report.links ?? []).map((item) => [item.slug, item]));
  const results = await pool(collection.tools, async (tool) => {
    if (onlySlugs && !onlySlugs.includes(tool.slug)) return previous.get(tool.slug) ?? { slug: tool.slug, status: 'unchecked' };
    try {
      // Do not follow known account/admin destination paths. Store public bookmark as supplied.
      if (/\/(?:signin|login|admin)(?:\/|$)/i.test(new URL(tool.url).pathname) || /^(?:admin|account)\./i.test(new URL(tool.url).hostname)) {
        return { slug: tool.slug, status: 'unchecked', reason: 'Account/login/admin destination: not requested.' };
      }
      const response = await safeRequest(tool.url, { method: 'HEAD', timeout: 6500, stopAtAccount: true });
      const status = response.restrictedRedirect ? 'restricted' : response.status >= 200 && response.status < 400 ? 'ok' : [401,403,405,417,429,451].includes(response.status) ? 'restricted' : 'unreachable';
      return { slug: tool.slug, status, httpStatus: response.status, finalUrl: response.finalUrl };
    } catch (error) { return { slug: tool.slug, status: 'unreachable', reason: error.message }; }
  });
  const bySlug = new Map(results.map((result) => [result.slug, result]));
  for (const tool of collection.tools) tool.linkStatus = bySlug.get(tool.slug).status;
  report.links = results;
  report.counts.linkStatus = results.reduce((counts, result) => ({ ...counts, [result.status]: (counts[result.status] ?? 0) + 1 }), {});
  await writeJson(COLLECTION, collection);
  await writeJson(REPORT, report);
  await writeReportMarkdown(report);
  console.log(JSON.stringify(report.counts.linkStatus));
}

async function writeReportMarkdown(report) {
  const lines = [
    '# 工具集合公开导入报告 · 2026-09-05', '',
    '来源：[老王导航](https://nav.eooce.com/)。仅请求公开 GET 数据与图片；没有登录、写入来源站或运行下载代码。', '',
    '## 覆盖范围', '', '| 原分类 | 公开卡片数 |', '| --- | ---: |',
    ...report.coverage.map((scope) => `| ${scope.label} | ${scope.count} |`), '',
    ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`), '',
    '## 完整性与合并规则', '', ...report.completenessEvidence.map((note) => `- ${note}`), '',
    ...report.notes.map((note) => `- ${note}`), '',
    '## 合并记录', '', ...report.decisions.filter((decision) => decision.action === 'merged').map((decision) => `- 源条目 ${decision.sourceId}（${decision.name}，${decision.sourceCategories.join(' / ')}）→ ${decision.into}：${decision.reason}`), '',
    '## 跳过记录', '', ...report.decisions.filter((decision) => decision.action === 'excluded').map((decision) => `- 源条目 ${decision.sourceId}（${decision.sourceCategories.join(' / ')}）：${decision.reason}`), '',
    '## 图标缺项', '', ...(report.icons ?? []).filter((icon) => !icon.path).map((icon) => `- ${icon.slug}：真实来源均未取得可校验的 PNG/ICO，保留空值；不会伪造品牌图标。`), '',
    ...(report.appearanceAudit ? [
      '## 浅色背景可见性检查', '',
      `- 已检查 ${report.appearanceAudit.checkedFiles} 个本地图标（${report.appearanceAudit.pngFiles} PNG、${report.appearanceAudit.icoFiles} ICO）。`,
      '- Codex 已改用同一 OpenAI 标记的浅色界面黑色版本，来源与哈希记录在 JSON。',
      `- 来源仅取得白色透明标记的条目：${report.appearanceAudit.requiresDarkIconSurface.join('、')}。保持原始图案，由 ToolIcon 内部的深色底承接，不修改位图或页面整体背景。`,
      '- 其余图标未检出同类纯白透明问题。', '',
    ] : []),
    '完整原始卡片（排除项的目标已移除）、每次图标尝试、来源和链接响应记录见同名 JSON 报告。', '',
    '## 重跑', '',
    '```powershell', 'node scripts/import-nav-tools.mjs --collect-only', 'node scripts/import-nav-tools.mjs --icons-only', 'node scripts/import-nav-tools.mjs --check-links', '```', '',
    '重复运行保留现有收藏内容，只添加新 URL；图标校验通过后复用本地缓存。链接不可达或受限制不会删除收藏。', '',
  ];
  await fs.mkdir(path.dirname(REPORT_MD), { recursive: true });
  await fs.writeFile(REPORT_MD, lines.join('\n'), 'utf8');
}

let context;
if (args.has('--icons-only') || args.has('--check-links')) {
  context = { collection: await readJson(COLLECTION), report: await readJson(REPORT), originals: await originalTools() };
} else context = await collect();
if (args.has('--check-links')) await checkLinks(context.collection, context.report);
else if (!args.has('--collect-only')) await downloadIcons(context.collection, context.report, context.originals);
