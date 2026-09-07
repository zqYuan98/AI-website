import { sleep } from "workflow";

async function processAnalysisGroup(jobId: string) {
  "use step";
  const { smartServices } = await import("@/lib/server/smart-services");
  return smartServices().analysis.processNext(jobId);
}
// A retry can recover a DB interruption. Persisted request leases prevent repeating a model call.
processAnalysisGroup.maxRetries = 2;

export async function smartAnalysisWorkflow(jobId: string) {
  "use workflow";
  // Never pass keys, titles, URLs, or provider responses through workflow inputs/outputs.
  for (let wave = 0; wave < 3000; wave++) {
    const progress = await Promise.all([
      processAnalysisGroup(jobId), processAnalysisGroup(jobId), processAnalysisGroup(jobId),
    ]);
    if (!progress.some(item => item.more)) return { finished: true };
    await sleep("2s");
  }
  return { finished: false };
}
