import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { cloudAuthConfigured } from "@/lib/server/config";
import { getOwnerSession } from "@/lib/server/auth";

export const metadata: Metadata = { title: "登录我的资源库", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const configured = cloudAuthConfigured();
  let signedIn = false;
  let unavailable = false;
  if (configured) {
    try { signedIn = Boolean(await getOwnerSession(await headers())); }
    catch { unavailable = true; }
  }
  if (signedIn) redirect("/tools/manage");
  return <LoginForm enabled={configured} unavailable={unavailable} />;
}
