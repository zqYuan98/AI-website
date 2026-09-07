import { ownerJsonPost, privateUnsupportedMethod } from "@/lib/server/owner-json-api";
import { smartServices } from "@/lib/server/smart-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = ownerJsonPost((input, ownerId) => smartServices().imports.handle(input, ownerId));
export { privateUnsupportedMethod as GET, privateUnsupportedMethod as HEAD, privateUnsupportedMethod as OPTIONS,
  privateUnsupportedMethod as PUT, privateUnsupportedMethod as PATCH, privateUnsupportedMethod as DELETE };
