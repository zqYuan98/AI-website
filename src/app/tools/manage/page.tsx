import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResourceManager } from "@/components/resources/manager-workspace";

export const metadata: Metadata = { title: "我的收藏 · 本机管理", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function LocalToolsManagePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ResourceManager />;
}
