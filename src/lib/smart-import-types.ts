/** Browser-safe import workspace contracts. No storage, credentials, or server imports. */
import type { LibraryResource, ResourceCategory, ResourceKind } from "./resource-types";

export type SmartImportRevision = string;
export type SmartImportDecision = "defer" | "keep" | "ignore";
export type SmartImportBatchStatus = "reviewing" | "paused" | "partial" | "completed" | "cancelled" | "failed";
export type SmartImportView = "review" | "suggested" | "duplicates" | "invalid" | "excluded" | "all";
export type SmartImportMatchKind = "new" | "existing" | "archived" | "published-only";
export type SmartImportOutcomeKind = "created" | "linked" | "restored" | "merged" | "skipped" | "undone";

export type SmartImportSuggestion = {
  kind: ResourceKind;
  category: ResourceCategory;
  tags: string[];
  description: string;
  reason: string;
  confidence: "clear" | "review";
  source: "rule" | "model";
};

export type SmartImportFields = Pick<LibraryResource, "name" | "kind" | "category" | "tags" | "description">;
export type SmartImportMergeFields = SmartImportFields & Pick<LibraryResource, "notes">;

export type SmartImportSource = {
  id: string;
  ordinal: number;
  groupId: string | null;
  name: string;
  url: string;
  sourceFolder: string;
  createdAt: string;
  excluded: boolean;
  invalidReason: string | null;
};

export type SmartImportExistingMatch = {
  id: string;
  name: string;
  url: string;
  status: LibraryResource["status"] | null;
  visibility: LibraryResource["visibility"];
  location: "library" | "publication";
  exact: boolean;
  reason: string;
};

export type SmartImportOutcome = {
  kind: SmartImportOutcomeKind;
  resourceId: string | null;
  completedAt: string;
};

export type SmartImportGroup = {
  id: string;
  revision: SmartImportRevision;
  representativeId: string;
  representative: SmartImportSource;
  sourceCount: number;
  /** At most three origins; use the group action for paginated complete sources. */
  sourcesPreview: SmartImportSource[];
  matchKind: SmartImportMatchKind;
  matches: SmartImportExistingMatch[];
  suspectedMatches: SmartImportExistingMatch[];
  suspectedGroups: { id: string; name: string; url: string; reason: string }[];
  suspectedGroupCount: number;
  decision: SmartImportDecision;
  fields: SmartImportFields;
  categoryConfirmed: boolean;
  suggestion: SmartImportSuggestion | null;
  reviewRequired: boolean;
  reviewReasons: string[];
  outcome: SmartImportOutcome | null;
  error: string | null;
  readOnly: boolean;
};

export type SmartImportSummary = {
  /** These three source buckets partition rawTotal; groups are a separate unit. */
  rawTotal: number;
  validSources: number;
  invalidSources: number;
  excludedSources: number;
  /** Valid sources beyond the first source of each exact-URL group. */
  duplicateSources: number;
  groupTotal: number;
  /** Match buckets partition groupTotal; they are not added to source counts. */
  newGroups: number;
  existingGroups: number;
  archivedGroups: number;
  publishedOnlyGroups: number;
  /** Progress buckets partition groupTotal; failures remain retryable pending work. */
  pendingGroups: number;
  ignoredGroups: number;
  completedGroups: number;
  failedGroups: number;
  keptGroups: number;
  createdResources: number;
};

export type SmartImportBatch = {
  id: string;
  name: string;
  format: "html" | "lines";
  status: SmartImportBatchStatus;
  revision: SmartImportRevision;
  createdAt: string;
  updatedAt: string;
  summary: SmartImportSummary;
};

export type SmartImportFilters = {
  view?: SmartImportView;
  search?: string;
  folder?: string;
  domain?: string;
  kind?: ResourceKind;
  category?: ResourceCategory;
  decision?: SmartImportDecision;
};

export type SmartImportFacet = { value: string; count: number };
/** Facet counts describe all current batch groups, independently of active filters. */
export type SmartImportFacets = {
  folders: SmartImportFacet[];
  domains: SmartImportFacet[];
  kinds: SmartImportFacet[];
  categories: SmartImportFacet[];
};

export type SmartImportBatchContext = {
  batch: SmartImportBatch;
  batchRevision: SmartImportRevision;
  libraryRevision: SmartImportRevision;
};

export type SmartImportPage = SmartImportBatchContext & {
  groups: SmartImportGroup[];
  /** Invalid/excluded source rows are paged in their respective source views. */
  invalidSources: SmartImportSource[];
  page: number;
  pageSize: 50;
  total: number;
  facets: SmartImportFacets;
};

export type SmartImportSelection = SmartImportBatchContext & {
  /** Immutable explicit group scope. Never re-evaluate a filter during a mutation. */
  groupIds: string[];
  total: number;
};

export type SmartImportGroupPage = SmartImportBatchContext & {
  group: SmartImportGroup;
  sources: SmartImportSource[];
  page: number;
  pageSize: 50;
  total: number;
};

export type SmartImportCommitItem = {
  groupId: string;
  /** Stable per-group proposal hash lets UI verify a previously confirmed multi-chunk scope. */
  planHash: string;
  name: string;
  disposition: "create" | "skip-existing" | "already-completed" | "needs-review" | "invalid";
  existingResourceId: string | null;
  reason: string | null;
};

export type SmartImportCommitPreview = SmartImportBatchContext & {
  groupIds: string[];
  items: SmartImportCommitItem[];
  confirmation: string;
};

export type SmartImportReceiptItem = {
  groupId: string;
  status: "created" | "skipped" | "already-completed" | "needs-review" | "failed" | "undone" | "linked" | "restored" | "merged";
  resourceId: string | null;
  reason: string | null;
};

export type SmartImportReceipt = {
  requestId: string;
  action: "commit" | "resolve" | "undo";
  completedAt: string;
  items: SmartImportReceiptItem[];
  /** Versions at the original commit; current versions remain in the response context. */
  batchRevision: SmartImportRevision;
  libraryRevision: SmartImportRevision;
};

export type SmartImportMutationResult = SmartImportBatchContext & {
  receipt: SmartImportReceipt;
  replayed: boolean;
};

export type SmartImportResolutionMode = "link" | "restore" | "merge";
export type SmartImportResolutionPreview = SmartImportBatchContext & {
  groupId: string;
  resourceId: string;
  mode: SmartImportResolutionMode;
  before: LibraryResource;
  after: LibraryResource;
  confirmation: string;
};

export type SmartImportUndoItem = {
  groupId: string;
  resourceId: string;
  name: string;
  disposition: "eligible" | "edited" | "protected" | "missing";
  reason: string;
};

export type SmartImportUndoPreview = SmartImportBatchContext & {
  items: SmartImportUndoItem[];
  defaultGroupIds: string[];
  confirmation: string;
};

type BatchId = { batchId: string };
type BatchWrite = BatchId & { batchRevision: SmartImportRevision };
type LibraryWrite = BatchWrite & { libraryRevision: SmartImportRevision; requestId: string; confirmation: string };
type Resolution = { groupId: string; resourceId: string; mode: SmartImportResolutionMode; fields?: Partial<SmartImportMergeFields> };

export type SmartImportRequest =
  | { action: "list"; page?: number }
  | { action: "create"; requestId: string; name: string; format: "html" | "lines"; content: string; forceNew?: boolean }
  | (BatchId & { action: "get"; page?: number; filters?: SmartImportFilters })
  | (BatchId & { action: "group"; groupId: string; page?: number })
  | (BatchWrite & { action: "select"; filters?: SmartImportFilters })
  | (BatchWrite & { action: "decide"; groupIds: string[]; decision?: SmartImportDecision; fields?: Partial<SmartImportFields>; adoptSuggestion?: boolean })
  | (BatchWrite & { action: "edit-source"; sourceId: string; changes: Partial<Pick<SmartImportSource, "name" | "url" | "sourceFolder" | "createdAt" | "excluded">> })
  | (BatchWrite & { action: "representative"; groupId: string; sourceId: string })
  | (BatchWrite & { action: "refresh" | "pause" | "resume" | "cancel" | "delete" })
  | (BatchWrite & { action: "commit-preview"; groupIds: string[] })
  | (LibraryWrite & { action: "commit"; groupIds: string[] })
  | (BatchWrite & Resolution & { action: "resolve-preview" })
  | (LibraryWrite & Resolution & { action: "resolve" })
  | (BatchWrite & { action: "undo-preview" })
  | (LibraryWrite & { action: "undo"; groupIds: string[]; includeEditedResourceIds?: string[] });

export type SmartImportList = { batches: SmartImportBatch[]; page: number; pageSize: 20; total: number };
export type SmartImportCreateResult = SmartImportBatchContext & { resumed: boolean };

/** Internal analysis capture. Only id/title/domain may enter an external model request. */
export type SmartImportAnalysisTarget = {
  id: string;
  title: string;
  domain: string;
  groupRevision: SmartImportRevision;
};
export type SmartImportAnalysisCapture = SmartImportBatchContext & {
  targets: SmartImportAnalysisTarget[];
  excluded: { id: string; reason: string }[];
};
export type SmartImportSuggestionResult = {
  id: string;
  groupRevision: SmartImportRevision;
  suggestion: SmartImportSuggestion;
};
export type SmartImportSuggestionsApplied = SmartImportBatchContext & {
  appliedIds: string[];
  ignored: { id: string; reason: string }[];
};
