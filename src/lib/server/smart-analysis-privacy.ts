import "server-only";
import type { SmartImportAnalysisTarget } from "@/lib/smart-import-types";
import { resolvePublicTarget, type AddressLookup } from "./smart-api-security";

/** Validate DNS without fetching pages. A syntactically public domain may still resolve to an internal host. */
export async function publicAnalysisTargets(targets: SmartImportAnalysisTarget[], lookup?: AddressLookup) {
  const domains = [...new Set(targets.map(target => target.domain))];
  const permitted = new Set<string>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(20, domains.length) }, async () => {
    while (cursor < domains.length) {
      const domain = domains[cursor++];
      try {
        await resolvePublicTarget(`https://${domain.includes(":") ? `[${domain}]` : domain}`, lookup, 2000);
        permitted.add(domain);
      } catch { /* Unknown DNS remains local/manual; no target or resolver diagnostic is exposed. */ }
    }
  }));
  return {
    targets: targets.filter(target => permitted.has(target.domain)),
    excluded: targets.filter(target => !permitted.has(target.domain)).map(target => ({ id: target.id, reason: "域名无法确认指向公网，仅保留规则建议与手工整理。" })),
  };
}
