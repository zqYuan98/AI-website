import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/server/auth";
import { cloudLibraryEnabled } from "@/lib/server/config";
import { SmartImportWorkspace } from "@/components/resources/smart-import-workspace";
import { SmartImportShell } from "@/components/resources/smart-import-shell";

export const metadata: Metadata = { title: "整理导入批次 · 我的资源库", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ImportBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  if (!cloudLibraryEnabled()) notFound();
  let session: Awaited<ReturnType<typeof getOwnerSession>> = null;
  try { session = await getOwnerSession(await headers()); } catch { /* Login explains configuration and connection state. */ }
  if (!session) redirect("/login");
  const { batchId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(batchId)) notFound();
  return <SmartImportShell active="imports" email={session.user.email}><SmartImportWorkspace batchId={batchId} /></SmartImportShell>;
}
