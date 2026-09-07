import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ResourceManager } from "@/components/resources/manager-workspace";
import { getOwnerSession } from "@/lib/server/auth";
import { cloudLibraryEnabled } from "@/lib/server/config";

export const metadata: Metadata = { title: "我的收藏 · 管理", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ToolsManagePage() {
  if (cloudLibraryEnabled()) {
    let session: Awaited<ReturnType<typeof getOwnerSession>> = null;
    try { session = await getOwnerSession(await headers()); }
    catch { /* The login page explains unavailable configuration without exposing server errors. */ }
    if (!session) redirect("/login");
    return <ResourceManager mode="cloud" email={session.user.email} />;
  }
  if (process.env.NODE_ENV !== "development") notFound();
  return <ResourceManager mode="local" />;
}
