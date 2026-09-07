import { LibraryInputError } from "@/lib/library-domain";
import type { SaveApiConfig } from "@/lib/smart-api-types";
import { ownerJsonPost, privateUnsupportedMethod } from "@/lib/server/owner-json-api";
import { smartServices } from "@/lib/server/smart-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = ownerJsonPost(async (input, ownerId) => {
  const { settings } = smartServices();
  if (input.action === "read") return settings.read(ownerId);
  if (input.action === "save") return settings.save(ownerId, input as unknown as SaveApiConfig);
  if (typeof input.version !== "string") throw new LibraryInputError("请提供当前配置版本。");
  if (input.action === "test") return settings.test(ownerId, input.version);
  if (input.action === "clear-key") return settings.clearKey(ownerId, input.version);
  if (input.action === "set-enabled" && typeof input.enabled === "boolean") return settings.setEnabled(ownerId, input.version, input.enabled);
  throw new LibraryInputError("不支持的模型设置操作。");
});
export { privateUnsupportedMethod as GET, privateUnsupportedMethod as HEAD, privateUnsupportedMethod as OPTIONS,
  privateUnsupportedMethod as PUT, privateUnsupportedMethod as PATCH, privateUnsupportedMethod as DELETE };
