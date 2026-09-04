"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import styles from "./lab.module.css";

const STORAGE_KEY = "vitamin:lab:ai-feature-acceptance:v1";
const DOWNLOAD_NAME = "ai-feature-acceptance-checklist.md";

type ChecklistItem = {
  id: string;
  title: string;
  evidence: string;
};

type ChecklistGroup = {
  id: string;
  title: string;
  description: string;
  items: readonly ChecklistItem[];
};

type StorageState = "checking" | "persistent" | "memory-only";

const STORAGE_EVENT = "vitamin:acceptance-checklist-change";
const SERVER_SNAPSHOT = "checking:";
let memoryCheckedIds: string[] = [];
let forceMemoryOnly = false;

function parseSavedIds(value: string | null, validIds: Set<string>): string[] {
  if (!value) return [];

  const parsed: unknown = JSON.parse(value);
  const candidates = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "checked" in parsed
      ? (parsed as { checked?: unknown }).checked
      : [];

  if (!Array.isArray(candidates)) return [];
  return candidates.filter(
    (id): id is string => typeof id === "string" && validIds.has(id),
  );
}

function checkedMap(ids: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map((id) => [id, true]));
}

function readStorageSnapshot(): string {
  if (forceMemoryOnly) {
    return `memory-only:${JSON.stringify({ checked: memoryCheckedIds })}`;
  }

  try {
    return `persistent:${window.localStorage.getItem(STORAGE_KEY) ?? ""}`;
  } catch {
    forceMemoryOnly = true;
    return `memory-only:${JSON.stringify({ checked: memoryCheckedIds })}`;
  }
}

function subscribeToStorage(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_EVENT, onStoreChange);
  };
}

function publishCheckedIds(ids: string[]): StorageState {
  memoryCheckedIds = ids;
  let nextState: StorageState = "persistent";

  if (!forceMemoryOnly) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ checked: memoryCheckedIds }),
      );
    } catch {
      forceMemoryOnly = true;
    }
  }

  if (forceMemoryOnly) nextState = "memory-only";
  window.dispatchEvent(new Event(STORAGE_EVENT));
  return nextState;
}

function clearCheckedIds(): StorageState {
  memoryCheckedIds = [];
  let nextState: StorageState = "persistent";

  if (!forceMemoryOnly) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      forceMemoryOnly = true;
    }
  }

  if (forceMemoryOnly) nextState = "memory-only";
  window.dispatchEvent(new Event(STORAGE_EVENT));
  return nextState;
}

export function AcceptanceChecklist({
  groups,
}: {
  groups: readonly ChecklistGroup[];
}) {
  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const allIds = useMemo(() => allItems.map((item) => item.id), [allItems]);
  const validIds = useMemo(() => new Set(allIds), [allIds]);
  const [status, setStatus] = useState("清单已就绪");
  const [copyFailed, setCopyFailed] = useState(false);
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);
  const storageSnapshot = useSyncExternalStore(
    subscribeToStorage,
    readStorageSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const separatorIndex = storageSnapshot.indexOf(":");
  const storageState = storageSnapshot.slice(0, separatorIndex) as StorageState;
  const storedValue = storageSnapshot.slice(separatorIndex + 1);
  let savedIds: string[] = [];
  try {
    savedIds = parseSavedIds(storedValue || null, validIds);
  } catch {
    savedIds = [];
  }
  const checked = checkedMap(savedIds);

  const completeCount = allItems.filter((item) => checked[item.id]).length;
  const missingItems = allItems.filter((item) => !checked[item.id]);
  const percent = Math.round((completeCount / allItems.length) * 100);
  const markdown = buildMarkdown(groups, checked, completeCount);

  function toggleItem(id: string) {
    const selectedIds = new Set(savedIds);
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    const nextStorageState = publishCheckedIds(
      allIds.filter((itemId) => selectedIds.has(itemId)),
    );
    if (nextStorageState === "memory-only") {
      setStatus("浏览器无法保存，但本页仍可继续填写");
    }
    setCopyFailed(false);
  }

  async function copyMarkdown() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(markdown);
      setCopyFailed(false);
      setStatus("已复制 Markdown 清单");
    } catch {
      setCopyFailed(true);
      setStatus("自动复制失败，请在下方手动选择 Markdown");
      window.setTimeout(() => {
        manualCopyRef.current?.focus();
        manualCopyRef.current?.select();
      }, 0);
    }
  }

  function downloadMarkdown() {
    try {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = DOWNLOAD_NAME;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus(`已下载 ${DOWNLOAD_NAME}`);
    } catch {
      setCopyFailed(true);
      setStatus("下载失败，请在下方手动复制 Markdown");
    }
  }

  function resetChecklist() {
    setCopyFailed(false);
    clearCheckedIds();
    setStatus("清单已重置，18 项均为未完成");
  }

  return (
    <section className={styles.workbench} aria-labelledby="checklist-title">
      <header className={styles.workbenchHeader}>
        <div>
          <p className={styles.consoleLabel}>RUNNABLE LAB · V1</p>
          <h2 id="checklist-title">开始检查</h2>
          <p>
            每次勾选都应对应一份证据，而不是一句“应该没问题”。你的进度只保存在当前浏览器。
          </p>
        </div>
        <div className={styles.scoreCard} aria-label={`已完成 ${completeCount} 项，共 18 项`}>
          <span className={styles.scoreNumber}>{completeCount}</span>
          <span className={styles.scoreDivider}>/</span>
          <span className={styles.scoreTotal}>18</span>
          <small>项已完成</small>
        </div>
      </header>

      <div className={styles.progressTrack} aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className={styles.progressMeta}>
        <span>{percent}% 完成</span>
        <span>
          {storageState === "checking"
            ? "正在读取本地进度"
            : storageState === "persistent"
              ? "进度自动保存在本浏览器"
              : "本地存储不可用 · 本页填写仍有效"}
        </span>
      </div>

      <div className={styles.workbenchGrid}>
        <div className={styles.checklistGroups}>
          {groups.map((group, groupIndex) => {
            const groupComplete = group.items.filter((item) => checked[item.id]).length;
            const headingId = `checklist-group-${group.id}`;

            return (
              <section
                key={group.id}
                className={styles.checklistGroup}
                aria-labelledby={headingId}
              >
                <div className={styles.groupHeader}>
                  <span className={styles.groupIndex} aria-hidden="true">
                    {String(groupIndex + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 id={headingId}>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>
                  <span className={styles.groupScore}>
                    {groupComplete}/{group.items.length}
                    <span className={styles.srOnly}> 项已完成</span>
                  </span>
                </div>

                <ul className={styles.itemList}>
                  {group.items.map((item) => (
                    <li key={item.id} className={checked[item.id] ? styles.itemChecked : undefined}>
                      <input
                        id={`acceptance-${item.id}`}
                        type="checkbox"
                        checked={Boolean(checked[item.id])}
                        onChange={() => toggleItem(item.id)}
                      />
                      <label htmlFor={`acceptance-${item.id}`}>
                        <strong>{item.title}</strong>
                        <span>{item.evidence}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className={styles.resultPanel} aria-labelledby="result-title">
          <p className={styles.consoleLabel}>GAP REPORT</p>
          <h3 id="result-title">
            {missingItems.length === 0
              ? "18 项均已覆盖"
              : `还缺 ${missingItems.length} 项`}
          </h3>
          <p className={styles.resultLead}>
            {missingItems.length === 0
              ? "清单已完成。现在请回到证据本身，由相关责任人作出验收结论。"
              : "未勾选项应进入下一次评审；必要时可以缩小范围、降级或停止。"}
          </p>

          {missingItems.length > 0 ? (
            <ol className={styles.missingList}>
              {missingItems.map((item) => (
                <li key={item.id}>{item.title}</li>
              ))}
            </ol>
          ) : (
            <div className={styles.completeMark} aria-hidden="true">
              ✓
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={copyMarkdown}>
              复制 Markdown
            </button>
            <button type="button" className={styles.secondaryButton} onClick={downloadMarkdown}>
              下载 .md
            </button>
            <button type="button" className={styles.resetButton} onClick={resetChecklist}>
              重置清单
            </button>
          </div>

          {copyFailed ? (
            <div className={styles.manualCopy}>
              <label htmlFor="acceptance-markdown">手动复制 Markdown</label>
              <textarea
                ref={manualCopyRef}
                id="acceptance-markdown"
                readOnly
                value={markdown}
                rows={10}
              />
            </div>
          ) : null}

          <p className={styles.disclaimer}>
            清单帮助发现缺口，不自动等于验收结论。
          </p>
          <p className={styles.liveStatus} role="status" aria-live="polite" aria-atomic="true">
            {status}
          </p>
        </aside>
      </div>
    </section>
  );
}

function buildMarkdown(
  groups: readonly ChecklistGroup[],
  checked: Record<string, boolean>,
  completeCount: number,
): string {
  const lines = [
    "# AI 功能验收清单",
    "",
    "> 清单帮助发现缺口，不自动等于验收结论。行业规范、安全等级与业务责任仍需由项目相关方确认。",
    "",
    `完成度：${completeCount}/18`,
    "",
  ];

  for (const group of groups) {
    const groupComplete = group.items.filter((item) => checked[item.id]).length;
    lines.push(`## ${group.title}（${groupComplete}/${group.items.length}）`, "");
    for (const item of group.items) {
      lines.push(
        `- [${checked[item.id] ? "x" : " "}] ${item.title}`,
        `  - 证据：${item.evidence}`,
      );
    }
    lines.push("");
  }

  const missing = groups.flatMap((group) =>
    group.items.filter((item) => !checked[item.id]),
  );
  lines.push("## 当前缺口", "");
  if (missing.length === 0) {
    lines.push("- 清单项目均已覆盖；请由相关责任人依据证据作出验收结论。");
  } else {
    for (const item of missing) lines.push(`- ${item.title}`);
  }
  lines.push("", "来源：notvitamin.com/lab/ai-feature-acceptance");

  return lines.join("\n");
}
