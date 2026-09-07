import { start } from "workflow/api";
import type { AnalysisJobResult } from "@/lib/smart-analysis-types";
import { ownerJsonPost, privateUnsupportedMethod } from "@/lib/server/owner-json-api";
import { smartServices } from "@/lib/server/smart-services";
import { smartAnalysisWorkflow } from "@/workflows/smart-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = ownerJsonPost(async (input, ownerId) => {
  const { analysis } = smartServices();
  const result = await analysis.handle(input, ownerId);
  if (input.action === "start" || input.action === "resume") {
    const { job } = result as AnalysisJobResult;
    if (job.status === "queued") {
      try { await start(smartAnalysisWorkflow, [job.id]); }
      catch { return analysis.dispatchFailed(job.id, ownerId); }
    }
  }
  return result;
});
export { privateUnsupportedMethod as GET, privateUnsupportedMethod as HEAD, privateUnsupportedMethod as OPTIONS,
  privateUnsupportedMethod as PUT, privateUnsupportedMethod as PATCH, privateUnsupportedMethod as DELETE };
