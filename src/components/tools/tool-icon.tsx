"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./tool-icon.module.css";

type ToolIconProps = {
  name: string;
  src?: string;
  size?: number;
};

const DARK_SURFACE_ICONS = new Set([
  "/images/tools/icons/nav-215.png",
  "/images/tools/icons/nav-230.png",
  "/images/tools/icons/nav-273.png",
]);

export function ToolIcon({ name, src, size = 40 }: ToolIconProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageSize = Math.round(size * 0.7);
  const canShowImage = Boolean(src?.startsWith("/") && failedSrc !== src);
  const needsDarkSurface = Boolean(src && DARK_SURFACE_ICONS.has(src));
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("zh-CN") ?? "?";

  return (
    <span
      className={`${styles.icon}${needsDarkSurface ? ` ${styles.darkSurface}` : ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {canShowImage && src ? (
        <Image
          className={styles.image}
          src={src}
          width={imageSize}
          height={imageSize}
          sizes={`${imageSize}px`}
          alt=""
          unoptimized
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className={styles.fallback}>{initial}</span>
      )}
    </span>
  );
}
