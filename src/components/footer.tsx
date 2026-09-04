import Link from "next/link";
import { contactHref, nav, site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-line bg-background-subtle">
      <div className="container-page grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-6">
          <p className="text-lg font-semibold tracking-tight">
            {site.name}
            <span className="text-accent">.</span>
          </p>
          <p className="mt-3 max-w-md text-sm leading-7 text-foreground-muted">
            {site.tagline}
          </p>
        </div>
        <div className="md:col-span-3">
          <p className="text-xs font-medium tracking-[0.16em] text-foreground-subtle uppercase">
            导航
          </p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-foreground-muted transition-colors hover:text-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-3" id="site-contact">
          <p className="text-xs font-medium tracking-[0.16em] text-foreground-subtle uppercase">
            联系
          </p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <a
                href={site.social.github}
                target="_blank"
                rel="noreferrer"
                className="text-foreground-muted transition-colors hover:text-accent"
              >
                GitHub · {site.githubUser}
              </a>
            </li>
            <li>
              <Link
                href={contactHref}
                className="text-foreground-muted transition-colors hover:text-accent"
              >
                写一封自我介绍
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-5 text-xs text-foreground-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {site.name}. 保留对原创内容的权利。</p>
          <p>notvitamin.com</p>
        </div>
      </div>
    </footer>
  );
}
