import { createHash, randomUUID } from "node:crypto";
import { bookmarkUrl, canonicalBookmarkUrl, MAX_BOOKMARK_BYTES, MAX_IMPORT_ITEMS, parseBookmarkHtmlDetailed, validateImportCandidate } from "./bookmark-import";
import { LibraryInputError } from "./library-domain";
import { RESOURCE_CATEGORIES, RESOURCE_KINDS, RESOURCE_KIND_LABELS, type LibraryResource, type PublicLibrarySnapshot } from "./resource-types";
import type { SmartImportDecision, SmartImportFields, SmartImportFilters, SmartImportGroup, SmartImportSource, SmartImportSuggestion, SmartImportSummary, SmartImportFacets, SmartImportExistingMatch, SmartImportProposal, SmartImportSuggestionMode, SmartImportResultStatus, SmartImportCurrentCollection } from "./smart-import-types";

export type ImportSourceRecord = SmartImportSource & {
  intent?: { decision: SmartImportDecision; fields: Partial<SmartImportFields>; categoryConfirmed: boolean };
};
export type ImportGroupRecord = Omit<SmartImportGroup, "proposal" | "resultStatus" | "resultReasons" | "currentCollection"> & {
  canonical: string;
  sourceIds: string[];
  sourceFolders: string[];
  manualFields: Partial<SmartImportFields>;
  formerMatchIds: string[];
  createdFingerprint?: string;
  firstPublishedAt?: string | null;
  existingChange?: { before: LibraryResource; afterFingerprint: string };
  /** Binds an explicit keep decision to the relationships the owner reviewed. */
  reviewAcknowledgement?: string;
  suspectedScopeHash?: string;
};

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}
export const importHash = (value: unknown) => createHash("sha256").update(JSON.stringify(ordered(value))).digest("hex");
/** PostgreSQL JSONB text inserts a space after each colon and separating comma. */
export function importJsonbBytes(value: unknown): number {
  function spaces(item: unknown): number {
    if (Array.isArray(item)) return Math.max(0, item.length - 1) + item.reduce((sum, child) => sum + spaces(child), 0);
    if (item && typeof item === "object") { const values = Object.values(item).filter(child => child !== undefined); return values.length + Math.max(0, values.length - 1) + values.reduce<number>((sum, child) => sum + spaces(child), 0); }
    return 0;
  }
  return Buffer.byteLength(JSON.stringify(value)) + spaces(value);
}
export function importRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryInputError("导入请求格式不正确。");
  return value as Record<string, unknown>;
}
export function importText(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new LibraryInputError(`文字${required ? "不能为空，且" : ""}不能超过 ${max} 个字符。`);
  return value.trim();
}
export function importIds(value: unknown, max = MAX_IMPORT_ITEMS): string[] {
  if (!Array.isArray(value) || !value.length || value.length > max || value.some(id => typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id))) throw new LibraryInputError(`请选择 1–${max} 项。`);
  return [...new Set(value)];
}
export function checkedImportFields(value: unknown): Partial<SmartImportFields> {
  const input = importRecord(value), result: Partial<SmartImportFields> = {};
  if (Object.keys(input).some(key => !["name", "kind", "category", "tags", "description"].includes(key))) throw new LibraryInputError("导入字段不受支持。");
  if (input.name !== undefined) result.name = importText(input.name, 120, true);
  if (input.description !== undefined) result.description = importText(input.description, 1000);
  if (input.kind !== undefined) {
    if (!RESOURCE_KINDS.includes(input.kind as never)) throw new LibraryInputError("资源类型不正确。");
    result.kind = input.kind as SmartImportFields["kind"];
  }
  if (input.category !== undefined) {
    if (!RESOURCE_CATEGORIES.includes(input.category as never)) throw new LibraryInputError("主分类不正确。");
    result.category = input.category as SmartImportFields["category"];
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 20) throw new LibraryInputError("标签最多 20 个。");
    result.tags = [...new Set(input.tags.map(tag => importText(tag, 40, true)))];
  }
  return result;
}

export function parseImportSources(content: unknown, format: unknown): ImportSourceRecord[] {
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_BOOKMARK_BYTES) throw new LibraryInputError("导入文件不能超过 2 MB。");
  let parsed;
  if (format === "html") parsed = parseBookmarkHtmlDetailed(content);
  else if (format === "lines") {
    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length > MAX_IMPORT_ITEMS) throw new LibraryInputError("每批最多 5000 条，请拆分文件。");
    parsed = lines.map(raw => {
      try { const url = bookmarkUrl(raw); return { name: new URL(url).hostname, url, sourceFolder: "", createdAt: "", invalidReason: null }; }
      catch (error) { return { name: raw.slice(0, 120), url: raw.slice(0, 2048), sourceFolder: "", createdAt: "", invalidReason: (error as Error).message }; }
    });
  } else throw new LibraryInputError("请选择 HTML 或逐行网址格式。");
  if (!parsed.length) throw new LibraryInputError("没有找到书签链接。");
  return parsed.map((source, index) => ({ ...source, id: randomUUID(), ordinal: index + 1, groupId: null, excluded: false }));
}

export function editImportSource(source: ImportSourceRecord, value: unknown): ImportSourceRecord {
  const changes = importRecord(value);
  if (!Object.keys(changes).length || Object.keys(changes).some(key => !["name", "url", "sourceFolder", "createdAt", "excluded"].includes(key))) throw new LibraryInputError("来源修改字段不正确。");
  const result = { ...source };
  for (const [key, max] of [["name", 120], ["url", 2048], ["sourceFolder", 1000], ["createdAt", 40]] as const) {
    if (changes[key] !== undefined) result[key] = importText(changes[key], max);
  }
  if (changes.excluded !== undefined) {
    if (typeof changes.excluded !== "boolean") throw new LibraryInputError("来源排除状态不正确。");
    result.excluded = changes.excluded;
  }
  try { Object.assign(result, validateImportCandidate(result), { invalidReason: null }); }
  catch (error) { result.invalidReason = (error as Error).message; }
  return result;
}

export function ruleImportSuggestion(source: SmartImportSource): SmartImportSuggestion {
  const clue = `${source.name} ${source.sourceFolder} ${source.url}`.toLowerCase();
  const choices: [RegExp, SmartImportFields["category"], string][] = [
    [/\b(ai|llm|gpt|claude|deepseek|automation)\b|人工智能|自动化|大模型/, "AI 与自动化", "标题、来源或域名包含 AI / 自动化线索"],
    [/github|gitlab|stackoverflow|developer|编程|开发|代码|技术文档/, "开发与技术", "标题、来源或域名包含开发线索"],
    [/figma|dribbble|behance|design|设计|绘画|配色|字体/, "设计与创作", "标题、来源或域名包含设计线索"],
    [/arxiv|scholar|course|research|学习|课程|论文|研究/, "学习与研究", "标题、来源或域名包含学习 / 研究线索"],
    [/writing|notion|obsidian|写作|笔记|知识|阅读/, "写作与知识", "标题、来源或域名包含写作 / 知识线索"],
    [/calendar|productivity|效率|日历|生活|旅行/, "效率与生活", "标题、来源或域名包含效率 / 生活线索"],
  ];
  const matched = choices.find(([pattern]) => pattern.test(clue));
  const kind = /\/(blog|posts?|articles?)\//i.test(source.url) ? "article" : /素材|字体|icons|fonts|textures/i.test(clue) ? "asset" : "website";
  return { kind, category: matched?.[1] ?? "效率与生活", tags: [], description: "", reason: matched?.[2] ?? "现有标题与来源线索不足，请人工判断", confidence: matched ? "clear" : "review", source: "rule" };
}

/** Only a review hint. Never use this key to drop or merge an item automatically. */
export function suspectedBookmarkKey(value: string): string {
  const url = new URL(value);
  return `${url.hostname.replace(/^www\./, "")}${url.port ? `:${url.port}` : ""}${url.pathname.replace(/\/+$/, "")}`;
}

export function projectImportAcceptance(group: ImportGroupRecord, mode: SmartImportSuggestionMode = "accept-preserving-manual"): SmartImportProposal {
  const fields = { ...group.fields, tags: [...group.fields.tags] }, adoptedFields: (keyof SmartImportFields)[] = [];
  const retainedFields = (Object.keys(group.manualFields) as (keyof SmartImportFields)[]).sort();
  // Historical preserve imports must not acquire unaccepted suggestions merely by being displayed.
  if (group.readOnly) return { fields, categoryConfirmed: group.categoryConfirmed, status: group.categoryConfirmed ? "organized" : "inbox", adoptedFields, retainedFields, suggestionHash: null };
  if (mode === "accept-preserving-manual" && group.suggestion) {
    for (const key of ["kind", "category", "tags", "description"] as const) {
      // Presence is intentional: empty strings and empty tag arrays are owner decisions too.
      if (Object.prototype.hasOwnProperty.call(group.manualFields, key)) continue;
      Object.assign(fields, { [key]: key === "tags" ? [...group.suggestion.tags] : group.suggestion[key] });
      adoptedFields.push(key);
    }
  }
  Object.assign(fields, group.manualFields);
  const categoryConfirmed = group.categoryConfirmed || adoptedFields.includes("category");
  const suggestion = group.suggestion;
  // Evidence wording can change after an earlier chunk adds a same-site resource. Bind semantics instead.
  const suggestionHash = mode === "accept-preserving-manual" && suggestion ? importHash({ kind: suggestion.kind, category: suggestion.category, tags: suggestion.tags, description: suggestion.description, confidence: suggestion.confidence, source: suggestion.source }) : null;
  return { fields, categoryConfirmed, status: categoryConfirmed ? "organized" : "inbox", adoptedFields, retainedFields, suggestionHash };
}

export function importRelationshipHash(group: ImportGroupRecord): string {
  return importHash({ canonical: group.canonical, representativeId: group.representativeId, title: group.representative.name,
    sources: group.sourceIds, matches: group.matches, suspectedMatches: group.suspectedMatches, suspectedScopeHash: group.suspectedScopeHash ?? null,
    formerMatchIds: group.formerMatchIds, reviewReasons: group.reviewReasons });
}

/** One partition for the result list, counts, explicit selection and acceptance guard. */
export function importResult(group: ImportGroupRecord, collection?: SmartImportCurrentCollection | null): { status: SmartImportResultStatus; reasons: string[] } {
  if (group.readOnly && collection && collection.state !== "active") return { status: "removed", reasons: [collection.state === "missing" ? "关联收藏已不存在，导入记录保留" : "已移出收藏，可恢复为仅自己可见的已整理资源"] };
  if (group.readOnly) return group.outcome?.kind === "skipped" || group.outcome?.kind === "undone"
    ? { status: "skipped", reasons: [group.outcome.kind === "undone" ? "已撤回本次收藏" : "此网址已在收藏中"] }
    : { status: "collected", reasons: [] };
  if (group.decision === "ignore") return { status: "skipped", reasons: ["你已选择跳过，可在详情中恢复"] };
  if (group.error) return { status: "review", reasons: [group.error] };
  if (group.reviewRequired) return { status: "review", reasons: group.reviewReasons.length ? group.reviewReasons : ["资源关系已变化，请重新确认"] };
  if (group.matchKind === "existing") return { status: "skipped", reasons: ["相同规范化网址已在收藏中"] };
  if (group.matchKind === "archived") return { status: "review", reasons: ["已有收藏已归档，请明确选择恢复或跳过"] };
  const acknowledged = group.reviewAcknowledgement === importRelationshipHash(group);
  const reasons: string[] = [];
  if (!acknowledged && group.matchKind === "published-only") reasons.push("此网址目前公开但未在管理库中，请确认是否重新私有收藏");
  if (!acknowledged && (group.suspectedMatches.length || group.suspectedGroupCount)) reasons.push("存在相似网址，请比较后确认是否分别收藏");
  if (!group.categoryConfirmed && group.suggestion?.confidence !== "clear" && group.decision !== "keep") reasons.push("分类线索不足，请修改分类或确认当前内容");
  return reasons.length ? { status: "review", reasons: [...new Set(reasons)] } : { status: "ready", reasons: [] };
}

export type ImportCollectionLookup = (group: Pick<ImportGroupRecord, "readOnly" | "outcome">) => SmartImportCurrentCollection | null;
/** Resolve immutable associations by ID, never by a possibly edited or reused URL. */
export function importCollectionLookup(library: LibraryResource[], publication: PublicLibrarySnapshot): ImportCollectionLookup {
  const resources = new Map(library.map(resource => [resource.id, resource]));
  const published = new Set(publication.resources.map(resource => resource.id));
  return group => {
    if (!group.readOnly || !group.outcome?.resourceId || !["created", "linked", "restored", "merged"].includes(group.outcome.kind)) return null;
    const resourceId = group.outcome.resourceId, current = resources.get(resourceId);
    const resource = current ? { name: current.name, url: current.url, kind: current.kind, category: current.category, description: current.description, tags: [...current.tags] } : null;
    return { resourceId, resource, state: !current ? "missing" : current.status === "archived" ? "archived" : "active", publishedInSnapshot: published.has(resourceId) };
  };
}

export function regroupImportSources(sources: ImportSourceRecord[], previous: ImportGroupRecord[], library: LibraryResource[], publication: PublicLibrarySnapshot, currentBatchId?: string): ImportGroupRecord[] {
  const exact = new Map<string, SmartImportExistingMatch[]>(), suspected = new Map<string, SmartImportExistingMatch[]>();
  const knownCategories = new Map<string, Set<SmartImportFields["category"]>>();
  // Earlier chunks of this same acceptance cannot rewrite its remaining rule proposals.
  // These resources still participate in exact and suspected duplicate matching below.
  for (const resource of library) if (resource.status === "organized" && (!currentBatchId || resource.importBatchId !== currentBatchId)) {
    const host = new URL(resource.url).hostname;
    if (!knownCategories.has(host)) knownCategories.set(host, new Set());
    knownCategories.get(host)!.add(resource.category);
  }
  const privateIds = new Set(library.map(resource => resource.id));
  for (const resource of [...library, ...publication.resources.filter(item => !privateIds.has(item.id))]) {
    const location = privateIds.has(resource.id) ? "library" : "publication";
    const match: SmartImportExistingMatch = { id: resource.id, name: resource.name, url: resource.url, status: location === "library" ? (resource as LibraryResource).status : null, visibility: location === "library" ? (resource as LibraryResource).visibility : "public", location, exact: true, reason: location === "publication" ? "目前公开，管理库未收录" : (resource as LibraryResource).status === "archived" ? "已有，已归档" : "相同规范化网址已在资源库中" };
    const key = canonicalBookmarkUrl(resource.url), loose = suspectedBookmarkKey(resource.url);
    if (!exact.has(key)) exact.set(key, []);
    exact.get(key)!.push(match);
    if (!suspected.has(loose)) suspected.set(loose, []);
    suspected.get(loose)!.push({ ...match, exact: false, reason: "协议、主机前缀、末尾斜杠或参数存在差异，请比较后决定" });
  }
  const buckets = new Map<string, ImportSourceRecord[]>();
  for (const source of sources) {
    if (source.excluded || source.invalidReason) { source.groupId = null; continue; }
    const key = canonicalBookmarkUrl(source.url);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(source);
  }
  const oldByKey = new Map(previous.map(group => [group.canonical, group]));
  const groups = [...buckets].map(([canonical, members]) => {
    const old = oldByKey.get(canonical);
    const representative = members.find(source => source.id === old?.representativeId) ?? members[0];
    const id = old?.id ?? randomUUID();
    for (const member of members) member.groupId = id;
    if (old?.readOnly) return { ...old, sourceIds: members.map(source => source.id), sourceFolders: [...new Set(members.map(source => source.sourceFolder))], sourceCount: members.length, representative, sourcesPreview: members.slice(0, 3) };
    const intents = members.flatMap(source => source.intent ? [source.intent] : []);
    const conflictingIntent = new Set(intents.map(importHash)).size > 1;
    const intent = intents[0];
    const manualFields = old?.manualFields ?? intent?.fields ?? {};
    const suggestion = old?.suggestion?.source === "model" && old.representative.name === representative.name && old.representative.url === representative.url ? old.suggestion : ruleImportSuggestion(representative);
    const known = knownCategories.get(new URL(representative.url).hostname);
    if (suggestion.source === "rule" && known?.size === 1) { suggestion.category = [...known][0]; suggestion.reason = "参考资源库同站点已确认分类"; suggestion.confidence = "clear"; }
    const allMatches = exact.get(canonical) ?? [], matches = allMatches.slice(0, 50);
    const draftMatches = allMatches.filter(match => match.location === "library");
    const suspectedMatches: SmartImportExistingMatch[] = [];
    for (const match of suspected.get(suspectedBookmarkKey(representative.url)) ?? []) {
      if (canonicalBookmarkUrl(match.url) !== canonical) suspectedMatches.push(match);
      if (suspectedMatches.length === 20) break;
    }
    const vanished = Boolean(old?.formerMatchIds.length && !old.formerMatchIds.some(matchId => draftMatches.some(match => match.id === matchId)));
    const reasons = [...new Set([...(old?.reviewRequired ? old.reviewReasons : []), ...(conflictingIntent ? ["合并后的来源有不同人工决定，请重新确认"] : []), ...(vanished ? ["原先匹配的库内资源已不存在，请重新确认"] : [])])];
    const group: ImportGroupRecord = {
      id, canonical, revision: old?.revision ?? "1", sourceIds: members.map(source => source.id), sourceFolders: [...new Set(members.map(source => source.sourceFolder))], representativeId: representative.id,
      representative, sourceCount: members.length, sourcesPreview: members.slice(0, 3),
      matchKind: draftMatches.length ? draftMatches.every(match => match.status === "archived") ? "archived" : "existing" : matches.length ? "published-only" : "new",
      matches, suspectedMatches,
      suspectedGroups: [], suspectedGroupCount: 0,
      decision: conflictingIntent ? "defer" : old?.decision ?? intent?.decision ?? "defer",
      fields: { name: representative.name, kind: "website", category: "效率与生活", tags: [], description: "", ...manualFields },
      categoryConfirmed: old?.categoryConfirmed ?? intent?.categoryConfirmed ?? false,
      suggestion, reviewRequired: reasons.length > 0, reviewReasons: reasons,
      outcome: old?.outcome ?? null, error: old?.error ?? null, readOnly: false, manualFields,
      formerMatchIds: vanished ? old!.formerMatchIds : draftMatches.map(match => match.id),
      firstPublishedAt: old?.firstPublishedAt ?? null,
      reviewAcknowledgement: old?.reviewAcknowledgement,
    };
    return group;
  });
  const peers = new Map<string, ImportGroupRecord[]>();
  for (const group of groups) { const key = suspectedBookmarkKey(group.representative.url); if (!peers.has(key)) peers.set(key, []); peers.get(key)!.push(group); }
  const oldById = new Map(previous.map(group => [group.id, group]));
  const peerHashes = new Map([...peers].map(([key, related]) => [key, importHash(related.map(group => ({ id: group.id, canonical: group.canonical })))]));
  for (const group of groups) {
    if (!group.readOnly) {
      const related = peers.get(suspectedBookmarkKey(group.representative.url))!;
      group.suspectedGroupCount = related.length - 1;
      group.suspectedScopeHash = peerHashes.get(suspectedBookmarkKey(group.representative.url));
      group.suspectedGroups = related.slice(0, 21).filter(peer => peer.id !== group.id).slice(0, 20).map(peer => ({ id: peer.id, name: peer.fields.name, url: peer.representative.url, reason: "本批另有协议、主机前缀、斜杠或参数不同的链接，可保留两条，请分别判断" }));
    }
    const old = oldById.get(group.id);
    if (old && importHash({ ...old, revision: "" }) !== importHash({ ...group, revision: "" })) group.revision = String(BigInt(old.revision) + BigInt(1));
  }
  return groups;
}

export function importGroupDto(group: ImportGroupRecord, currentCollection: SmartImportCurrentCollection | null = null): SmartImportGroup {
  const { id, revision, representativeId, representative, sourceCount, sourcesPreview, matchKind, matches, suspectedMatches, suspectedGroups, suspectedGroupCount, decision, fields, categoryConfirmed, suggestion, reviewRequired, reviewReasons, outcome, error, readOnly } = group;
  const result = importResult(group, currentCollection);
  return { id, revision, representativeId, representative: sourceDto(representative), sourceCount, sourcesPreview: sourcesPreview.map(sourceDto), matchKind, matches, suspectedMatches, suspectedGroups, suspectedGroupCount, decision, fields, categoryConfirmed, suggestion, reviewRequired, reviewReasons, outcome, error, readOnly, proposal: projectImportAcceptance(group), resultStatus: result.status, resultReasons: result.reasons, currentCollection };
}
export function sourceDto(source: SmartImportSource): SmartImportSource {
  const { id, ordinal, groupId, name, url, sourceFolder, createdAt, excluded, invalidReason } = source;
  return { id, ordinal, groupId, name, url, sourceFolder, createdAt, excluded, invalidReason };
}
export function importSummary(sources: ImportSourceRecord[], groups: ImportGroupRecord[], collection?: ImportCollectionLookup): SmartImportSummary {
  const validSources = sources.filter(source => !source.excluded && !source.invalidReason).length;
  const count = (fn: (group: ImportGroupRecord) => boolean) => groups.filter(fn).length;
  const resultCounts = { ready: 0, review: 0, skipped: 0, collected: 0, removed: 0 };
  let skippedSources = sources.length - validSources;
  for (const group of groups) { const result = importResult(group, collection?.(group)); resultCounts[result.status]++; if (result.status === "skipped") skippedSources += group.sourceCount; }
  return { rawTotal: sources.length, validSources, invalidSources: sources.filter(source => !source.excluded && Boolean(source.invalidReason)).length,
    excludedSources: sources.filter(source => source.excluded).length, duplicateSources: validSources - groups.length, groupTotal: groups.length,
    newGroups: count(group => group.matchKind === "new"), existingGroups: count(group => group.matchKind === "existing"), archivedGroups: count(group => group.matchKind === "archived"), publishedOnlyGroups: count(group => group.matchKind === "published-only"),
    completedGroups: count(group => group.readOnly), ignoredGroups: count(group => !group.readOnly && group.decision === "ignore"), failedGroups: count(group => !group.readOnly && group.decision !== "ignore" && Boolean(group.error)),
    pendingGroups: count(group => !group.readOnly && group.decision !== "ignore" && !group.error), keptGroups: count(group => !group.readOnly && group.decision === "keep"), createdResources: count(group => group.outcome?.kind === "created"), resultCounts, skippedSources };
}

export function filteredImportGroups(groups: ImportGroupRecord[], filters: SmartImportFilters, collection?: ImportCollectionLookup): ImportGroupRecord[] {
  const query = filters.search?.trim().toLowerCase();
  return groups.filter(group => {
    const current = collection?.(group);
    if (filters.suggestionSource && group.suggestion?.source !== filters.suggestionSource) return false;
    if (filters.resultStatus && importResult(group, current).status !== filters.resultStatus) return false;
    if (filters.view === "invalid" || filters.view === "excluded") return false;
    if (filters.view === "duplicates" && group.matchKind === "new" && group.sourceCount === 1) return false;
    if (filters.view === "suggested" && (group.suggestion?.confidence !== "clear" || group.readOnly || group.reviewRequired || group.suspectedMatches.length || group.suspectedGroupCount || group.matchKind !== "new")) return false;
    if (filters.view === "review" && (group.readOnly || group.decision === "ignore" || (group.suggestion?.confidence === "clear" && !group.reviewRequired && !group.suspectedMatches.length && !group.suspectedGroupCount && group.matchKind !== "published-only"))) return false;
    if (filters.decision && filters.decision !== group.decision) return false;
    const proposed = current?.resource ?? (filters.resultStatus || filters.suggestionSource ? projectImportAcceptance(group).fields : null);
    if (filters.kind && filters.kind !== (proposed?.kind ?? group.fields.kind)) return false;
    if (filters.category && filters.category !== (proposed?.category ?? (group.categoryConfirmed ? group.fields.category : group.suggestion?.category ?? group.fields.category))) return false;
    if (filters.folder && !group.sourceFolders.includes(filters.folder)) return false;
    const displayUrl = current?.resource?.url ?? group.representative.url;
    if (filters.domain && new URL(displayUrl).hostname !== filters.domain) return false;
    const searchableFields = (current?.resource || filters.suggestionSource) && proposed
      ? `${proposed.name} ${proposed.kind} ${RESOURCE_KIND_LABELS[proposed.kind]} ${proposed.category} ${proposed.tags.join(" ")} ${proposed.description}`
      : group.fields.name;
    return !query || `${searchableFields} ${displayUrl} ${group.sourceFolders.join(" ")}`.toLowerCase().includes(query);
  });
}
export function importFacets(sources: ImportSourceRecord[], groups: ImportGroupRecord[], useProposals = false, collection?: ImportCollectionLookup): SmartImportFacets {
  const facets = (entries: [string, string][]) => {
    const buckets = new Map<string, Set<string>>();
    for (const [value, id] of entries) if (value) buckets.set(value, new Set([...(buckets.get(value) ?? []), id]));
    return [...buckets].map(([value, ids]) => ({ value, count: ids.size })).sort((a, b) => a.value.localeCompare(b.value));
  };
  return { folders: facets(sources.filter(source => source.groupId).map(source => [source.sourceFolder, source.groupId!])), domains: facets(groups.map(group => [new URL(collection?.(group)?.resource?.url ?? group.representative.url).hostname, group.id])), kinds: facets(groups.map(group => [collection?.(group)?.resource?.kind ?? (useProposals ? projectImportAcceptance(group).fields.kind : group.fields.kind), group.id])), categories: facets(groups.map(group => [collection?.(group)?.resource?.category ?? (useProposals ? projectImportAcceptance(group).fields.category : group.categoryConfirmed ? group.fields.category : group.suggestion?.category ?? group.fields.category), group.id])) };
}
