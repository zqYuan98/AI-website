import { isToolCategory, isToolSubcategory } from "./tool-taxonomy";
import { validatedToolUrl } from "./tool-url";

export function isLocalManagementRequest(request: Request, mode: string | undefined): boolean {
  if (mode !== "development") return false;
  try {
    const host = request.headers.get("host");
    const origin = request.headers.get("origin");
    if (!host || !origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
    const target = new URL(`http://${host}`);
    const source = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
      && source.host === target.host
      && source.protocol === "http:"
      && source.origin === origin;
  } catch { return false; }
}

export function validateLocalToolInput(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("表单格式不正确。");
  const input = data as Record<string, unknown>;
  if (Object.keys(input).some(key => !["name", "url", "category", "subcategory", "scenario"].includes(key))) {
    throw new Error("表单包含未知字段。");
  }
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) {
    throw new Error("名称需为 1–80 个字符。");
  }
  const url = validatedToolUrl(input.url);
  if (!isToolCategory(input.category)) throw new Error("请选择有效的分类。");
  const subcategory = input.subcategory ?? "";
  if (!isToolSubcategory(input.category, subcategory)) throw new Error("子分类不属于所选分类。");
  const scenario = input.scenario ?? "";
  if (typeof scenario !== "string" || scenario.trim().length > 200) throw new Error("一句话说明不能超过 200 个字符。");
  return { name: input.name.trim(), url, category: input.category, subcategory, scenario: scenario.trim() };
}
