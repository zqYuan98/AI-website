import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/server/auth";
import { cloudLibraryEnabled } from "@/lib/server/config";
import { SmartSettings } from "@/components/resources/smart-settings";
import { SmartImportShell } from "@/components/resources/smart-import-shell";

export const metadata: Metadata = { title: "智能筛选设置 · 我的资源库", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SmartSettingsPage() {
  if (!cloudLibraryEnabled()) notFound();
  let session: Awaited<ReturnType<typeof getOwnerSession>> = null;
  try { session = await getOwnerSession(await headers()); } catch { /* Login explains configuration and connection state. */ }
  if (!session) redirect("/login");
  return <SmartImportShell active="settings" email={session.user.email}><SmartSettings /></SmartImportShell>;
}
