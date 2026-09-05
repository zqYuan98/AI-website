"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createOrbitMotion, initialOrbitState } from "./orbit-motion";
import { OrbitRobot } from "./orbit-robot";

export function HeroMotion({ children }: { children: ReactNode }) {
  const artworkRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const toggleRef = useRef<(() => void) | null>(null);
  const [state, setState] = useState(initialOrbitState);

  useEffect(() => {
    const artwork = artworkRef.current;
    const video = videoRef.current;
    if (!artwork || !video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const bounds = artwork.getBoundingClientRect();
    let inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
    let pointerFrame = 0;
    let pointer: { x: number; y: number } | null = null;
    const neutral = () => {
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      pointer = null;
      artwork.style.setProperty("--look-x", "0px");
      artwork.style.setProperty("--look-y", "0px");
      artwork.style.setProperty("--tilt", "0deg");
    };
    const motion = createOrbitMotion(video, (next) => {
      if (!next.playing) neutral();
      setState(next);
    });
    const syncEnvironment = () => motion.environment({ reduced: reduced.matches, visible: inView && !document.hidden });
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !fine.matches || !motion.getState().playing) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (!pointer || !motion.getState().playing) return;
        const robot = artwork.querySelector("[data-orbit-control]")?.getBoundingClientRect();
        if (!robot) return;
        const dx = Math.max(-1, Math.min(1, (pointer.x - robot.left - robot.width / 2) / 230));
        const dy = Math.max(-1, Math.min(1, (pointer.y - robot.top - robot.height / 2) / 190));
        artwork.style.setProperty("--look-x", `${dx * 4}px`);
        artwork.style.setProperty("--look-y", `${dy * 2.5}px`);
        artwork.style.setProperty("--tilt", `${dx * 5}deg`);
      });
    };
    toggleRef.current = motion.toggle;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry || entry.isIntersecting === inView) return;
      inView = entry.isIntersecting;
      syncEnvironment();
    });
    observer.observe(artwork);
    reduced.addEventListener("change", syncEnvironment);
    fine.addEventListener("change", neutral);
    document.addEventListener("visibilitychange", syncEnvironment);
    artwork.addEventListener("pointermove", onPointer, { passive: true });
    artwork.addEventListener("pointerleave", neutral);
    artwork.addEventListener("focusout", neutral);
    video.addEventListener("playing", motion.playing);
    video.addEventListener("pause", motion.paused);
    video.addEventListener("error", motion.error);
    const initialFrame = requestAnimationFrame(syncEnvironment);
    return () => {
      toggleRef.current = null;
      cancelAnimationFrame(initialFrame);
      neutral();
      observer.disconnect();
      reduced.removeEventListener("change", syncEnvironment);
      fine.removeEventListener("change", neutral);
      document.removeEventListener("visibilitychange", syncEnvironment);
      artwork.removeEventListener("pointermove", onPointer);
      artwork.removeEventListener("pointerleave", neutral);
      artwork.removeEventListener("focusout", neutral);
      video.removeEventListener("playing", motion.playing);
      video.removeEventListener("pause", motion.paused);
      video.removeEventListener("error", motion.error);
      motion.dispose();
    };
  }, []);

  return (
    <div ref={artworkRef} className="home-hero-art animate-rise animate-delay-2 relative"
      data-motion-playing={state.playing} data-motion-unavailable={state.unavailable}>
      <div className="home-hero-visual">
        <div className="home-hero-halo" aria-hidden="true" />
        <div className="home-hero-media">
          {children}
          <video ref={videoRef} id="home-hero-video" className="home-hero-motion home-hero-layer home-hero-image"
            loop muted playsInline preload="none" aria-hidden="true" />
        </div>
      </div>
      <OrbitRobot state={state} onToggle={() => toggleRef.current?.()} />
    </div>
  );
}
