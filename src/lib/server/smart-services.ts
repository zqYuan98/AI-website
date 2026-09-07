import "server-only";

import { LibraryInputError } from "@/lib/library-domain";
import { getDatabasePool } from "./database";
import { createSmartImportStore } from "./smart-import-store";
import { createApiConfigStore } from "./smart-api-store";
import { postChatCompletion } from "./smart-api-client";
import { createSmartAnalysisStore } from "./smart-analysis-store";
import { publicAnalysisTargets } from "./smart-analysis-privacy";

function ownerId() {
  const value = process.env.LIBRARY_OWNER_ID?.trim();
  if (!value || value.length > 128) throw new LibraryInputError("资源库尚未完成配置。", 503);
  return value;
}

export function smartServices() {
  const pool = getDatabasePool();
  const imports = createSmartImportStore(pool, ownerId);
  const settings = createApiConfigStore(pool, ownerId);
  const analysis = createSmartAnalysisStore(pool, ownerId, {
    readConfig: id => settings.read(id),
    checkPublicTargets: targets => publicAnalysisTargets(targets),
    capture: (input, id) => imports.claimTargets(input, id),
    revalidate: (input, id) => imports.revalidateTargets(input, id),
    apply: (input, id) => imports.applySuggestions(input, id),
    assertConfig: async (client, id, version) => { await settings.assertCurrent(client, id, version); },
    send: async (id, version, targets, beforeSend) => {
      const config = await settings.resolve(id, version);
      return postChatCompletion(config, targets.map(({ id, title, domain }) => ({ id, title, domain })), { beforeSend: async () => {
        const checked = await publicAnalysisTargets(targets);
        if (checked.targets.length !== targets.length) throw new LibraryInputError("部分域名无法确认为公网，已停止发送，请重新预览。", 409);
        await beforeSend();
      } });
    },
  });
  return { imports, settings, analysis };
}
