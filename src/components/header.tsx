"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { nav, site } from "@/lib/site";

export function Header() {
  const pathname = usePathname();

  return <HeaderForPath key={pathname} pathname={pathname} />;
}

function HeaderForPath({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    const shouldLockPage = !desktopQuery.matches;
    const closeFrame = desktopQuery.matches
      ? window.requestAnimationFrame(() => setOpen(false))
      : null;

    if (shouldLockPage) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    desktopQuery.addEventListener("change", onBreakpointChange);

    return () => {
      document.removeEventListener("keydown", onKey);
      desktopQuery.removeEventListener("change", onBreakpointChange);
      if (closeFrame !== null) window.cancelAnimationFrame(closeFrame);
      if (shouldLockPage) document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <header className="site-header sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur-md">
      <div className="container-page grid h-[60px] grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          className="justify-self-start text-[24px] font-bold tracking-[-0.045em] text-[#07175c]"
        >
          {site.name}
          <span className="text-accent">.</span>
        </Link>

        <nav
          aria-label="主导航"
          className="hidden h-full items-center gap-7 lg:flex xl:gap-9"
        >
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`site-nav-link ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-self-end gap-2">
          <a
            href={site.shop.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-8 items-center rounded-md bg-[#07143d] px-4 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#102765] lg:inline-flex"
          >
            {site.shop.name}
            <span aria-hidden="true" className="ml-1">↗</span>
          </a>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-white text-[#07175c] lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? "关闭菜单" : "打开菜单"}</span>
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="border-t border-line bg-white lg:hidden"
        >
          <nav
            aria-label="移动端导航"
            className="container-page flex flex-col gap-1 py-4"
          >
            {nav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-3 py-3 text-base ${
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-[#405077]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
            <a
              href={site.shop.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-[#07143d] text-sm font-medium text-white"
            >
              {site.shop.name} · notvitamin.xyz
              <span aria-hidden="true" className="ml-1">↗</span>
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
        </>
      )}
    </svg>
  );
}
