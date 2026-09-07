import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/server/auth";
import { cloudLibraryEnabled } from "@/lib/server/config";
import { SmartImportList } from "@/components/resources/smart-import-list";
import { SmartImportShell } from "@/components/resources/smart-import-shell";

export const metadata: Metadata = { title: "导入记录 · 我的资源库", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ImportListPage() {
  if (!cloudLibraryEnabled()) notFound();
  let session: Awaited<ReturnType<typeof getOwnerSession>> = null;
  try { session = await getOwnerSession(await headers()); } catch { /* Login explains configuration and connection state. */ }
  if (!session) redirect("/login");
  return <SmartImportShell active="imports" email={session.user.email}><SmartImportList /></SmartImportShell>;
}
