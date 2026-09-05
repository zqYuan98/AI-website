"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type MotionState = "initial" | "playing" | "paused" | "reduced" | "unavailable";

export function HeroMotion({ children }: { children: ReactNode }) {
  const artworkRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const toggleRef = useRef<(() => void) | null>(null);
  const [motionState, setMotionState] = useState<MotionState>("initial");

  useEffect(() => {
    const artwork = artworkRef.current;
    const video = videoRef.current;
    if (!artwork || !video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bounds = artwork.getBoundingClientRect();
    let inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
    let manuallyPaused = false;
    let autoplayBlocked = false;
    let unavailable = false;
    let pending = false;
    let attempt = 0;
    let disposed = false;

    const shouldPlay = () =>
      !reducedMotion.matches &&
      !document.hidden &&
      inView &&
      !manuallyPaused &&
      !autoplayBlocked &&
      !unavailable;

    const pause = () => {
      attempt += 1;
      pending = false;
      video.pause();
    };

    const syncPlayback = () => {
      if (disposed) return;

      if (reducedMotion.matches) {
        pause();
        // CSS alone cannot prevent media requests. The server and first client
        // render have no source; remove an existing source when the OS changes.
        if (video.hasAttribute("src")) {
          video.removeAttribute("src");
          video.load();
        }
        setMotionState("reduced");
        return;
      }

      if (!shouldPlay()) {
        pause();
        setMotionState(unavailable ? "unavailable" : "paused");
        return;
      }

      if (!video.hasAttribute("src")) {
        video.src = "/images/home/hero-orbit-loop.mp4";
      }
      if (!video.paused || pending) return;

      pending = true;
      const currentAttempt = ++attempt;
      void video.play().then(() => {
        if (disposed || currentAttempt !== attempt) return;
        pending = false;
        setMotionState(video.paused ? "paused" : "playing");
      }).catch(() => {
        if (disposed || currentAttempt !== attempt) return;
        pending = false;
        // A rejected autoplay waits for an explicit click, without retries on
        // each viewport or visibility change.
        autoplayBlocked = true;
        setMotionState("paused");
      });
    };

    const onPlaying = () => {
      if (shouldPlay()) setMotionState("playing");
      else syncPlayback();
    };
    const onPause = () => {
      setMotionState(
        reducedMotion.matches ? "reduced" : unavailable ? "unavailable" : "paused",
      );
    };
    const onError = () => {
      if (!video.hasAttribute("src")) return;
      unavailable = true;
      syncPlayback();
    };

    toggleRef.current = () => {
      if (reducedMotion.matches || unavailable) return;
      manuallyPaused = pending || !video.paused;
      if (!manuallyPaused) autoplayBlocked = false;
      syncPlayback();
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting === inView) return;
      inView = entry.isIntersecting;
      syncPlayback();
    });
    observer.observe(artwork);
    reducedMotion.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    const initialFrame = window.requestAnimationFrame(syncPlayback);

    return () => {
      disposed = true;
      toggleRef.current = null;
      window.cancelAnimationFrame(initialFrame);
      observer.disconnect();
      reducedMotion.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
      pause();
      if (video.hasAttribute("src")) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, []);

  const playing = motionState === "playing";

  return (
    <div
      ref={artworkRef}
      className="home-hero-art animate-rise animate-delay-2 relative"
      data-motion-playing={playing}
    >
      <div className="home-hero-halo" aria-hidden="true" />
      <div className="home-hero-media">
        {children}
        <video
          ref={videoRef}
          id="home-hero-video"
          className="home-hero-motion home-hero-layer home-hero-image"
          loop
          muted
          playsInline
          preload="none"
          aria-hidden="true"
        />
      </div>
      {motionState === "playing" || motionState === "paused" ? (
        <button
          type="button"
          className="home-hero-motion-control"
          aria-controls="home-hero-video"
          onClick={() => toggleRef.current?.()}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">
            {playing ? (
              <path d="M4 3h3v10H4zm5 0h3v10H9z" />
            ) : (
              <path d="m5 2 8 6-8 6z" />
            )}
          </svg>
          {playing ? "暂停动效" : "播放动效"}
        </button>
      ) : null}
    </div>
  );
}
