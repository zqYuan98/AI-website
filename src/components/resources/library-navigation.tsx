import Link from "next/link";
import { ManagerIcon, type ManagerIconName } from "./manager-primitives";
import styles from "./library-navigation.module.css";

type LibraryPage = "collection" | "imports" | "settings";
const PAGES: { id: LibraryPage; href: string; label: string; icon: ManagerIconName }[] = [
  { id: "collection", href: "/tools/manage", label: "我的收藏", icon: "collection" },
  { id: "imports", href: "/tools/manage/imports", label: "导入与AI整理", icon: "upload" },
  { id: "settings", href: "/tools/manage/settings", label: "AI连接设置", icon: "grid" },
];

export function LibraryNavigation({ active }: { active: LibraryPage }) {
  return <nav className={styles.navigation} aria-label="资源库页面">
    {PAGES.map(page => <Link key={page.id} href={page.href} aria-current={active === page.id ? "page" : undefined}><ManagerIcon name={page.icon} /><span>{page.label}</span></Link>)}
  </nav>;
}
