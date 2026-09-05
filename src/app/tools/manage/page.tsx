import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalToolForm } from "@/components/tools/local-tool-form";

export const metadata: Metadata = { title: "本地工具维护", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function LocalToolsManagePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LocalToolForm />;
}
