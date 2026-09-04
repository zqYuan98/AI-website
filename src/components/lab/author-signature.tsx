import Image from "next/image";
import styles from "./lab.module.css";

export function AuthorSignature() {
  return (
    <aside className={styles.signature} aria-label="方法作者">
      <span className={styles.avatarWrap}>
        <Image
          src="/images/about/vitamin-avatar-v5.png"
          alt=""
          width={48}
          height={48}
          className={styles.avatar}
        />
      </span>
      <span>
        <strong>维他命的方法笔记</strong>
        <small>从真实工作、责任边界与验收证据出发</small>
      </span>
    </aside>
  );
}
