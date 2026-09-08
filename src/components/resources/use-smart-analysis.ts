"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisJob } from "@/lib/smart-analysis-types";
import type { ApiConfigView } from "@/lib/smart-api-types";
import { smartError, smartErrorStatus, smartRequest } from "./smart-api";

export function useSmartAnalysis(batchId: string, refreshVersion: number, onResults: () => void) {
  const [config, setConfig] = useState<ApiConfigView | null>(null);
  const [jobs, setJobs] = useState<AnalysisJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState({ message: "", status: 0 });
  const [version, setVersion] = useState(0);
  const previousProgress = useRef<string | null>(null);
  const settlingUntil = useRef(0);
  const callback = useRef(onResults);
  useEffect(() => { callback.current = onResults; }, [onResults]);

  useEffect(() => {
    const controller = new AbortController();
    if (!settlingUntil.current) settlingUntil.current = Date.now() + 120_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    async function load() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      if (timer) clearTimeout(timer);
      const [connection, records] = await Promise.allSettled([
        smartRequest<ApiConfigView>("smart-settings", { action: "read" }, controller.signal),
        smartRequest<{ jobs: AnalysisJob[] }>("analysis", { action: "list", batchId }, controller.signal),
      ]);
      inFlight = false;
      if (controller.signal.aborted) return;
      if (connection.status === "fulfilled") setConfig(connection.value);
      if (records.status === "fulfilled") {
        setJobs(records.value.jobs);
        const progress = records.value.jobs.map(job => `${job.id}:${job.succeeded}:${job.ignored}`).join("|");
        if (previousProgress.current !== null && previousProgress.current !== progress) callback.current();
        previousProgress.current = progress;
        if (records.value.jobs.some(job => job.status === "running" || job.status === "queued")) settlingUntil.current = Date.now() + 120_000;
      }
      const rejected = connection.status === "rejected" ? connection : records.status === "rejected" ? records : null;
      setFailure(rejected ? { message: smartError(rejected.reason), status: smartErrorStatus(rejected.reason) } : { message: "", status: 0 });
      setLoading(false);
      if (!rejected && records.status === "fulfilled" && records.value.jobs.some(job => job.status === "running" || job.status === "queued" || (job.status === "paused" && job.pending > 0 && Date.now() < settlingUntil.current))) timer = setTimeout(load, 5000);
    }
    function focus() { if (document.visibilityState === "visible") void load(); }
    void load();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [batchId, refreshVersion, version]);

  function refresh() { settlingUntil.current = Date.now() + 120_000; setVersion(value => value + 1); }
  return { config, jobs, loading, failure, refresh };
}
