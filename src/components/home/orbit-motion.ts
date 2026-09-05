export type OrbitState = {
  ready: boolean; awake: boolean; playing: boolean; reduced: boolean;
  blocked: boolean; unavailable: boolean; touched: boolean;
};

export const initialOrbitState: OrbitState = {
  ready: false, awake: true, playing: false, reduced: false,
  blocked: false, unavailable: false, touched: false,
};

export function orbitAction(state: OrbitState) {
  if (state.unavailable) return "动图暂不可用";
  if (state.reduced) return state.awake ? "让小助手休息（静态模式）" : "唤醒小助手（静态模式）";
  if (state.blocked) return "播放星球动画";
  return state.awake ? "让星球休息" : "唤醒星球";
}

type Media = Pick<HTMLVideoElement, "paused" | "src" | "play" | "pause" | "load" | "hasAttribute" | "removeAttribute">;
type Environment = { reduced: boolean; visible: boolean };

/** User intent survives environmental pauses; play promises belong to one attempt. */
export function createOrbitMotion(video: Media, publish: (state: OrbitState) => void) {
  let state = { ...initialOrbitState };
  let environment: Environment = { reduced: false, visible: false };
  let pending = false;
  let attempt = 0;
  let disposed = false;
  const mayPlay = () => state.awake && environment.visible && !environment.reduced && !state.blocked && !state.unavailable;
  const update = (patch: Partial<OrbitState>) => {
    if (disposed) return;
    const next = { ...state, ...patch };
    if ((Object.keys(next) as (keyof OrbitState)[]).every((key) => next[key] === state[key])) return;
    state = next;
    publish(state);
  };
  const pause = () => { attempt++; pending = false; video.pause(); };
  const removeSource = () => {
    if (video.hasAttribute("src")) { video.removeAttribute("src"); video.load(); }
  };
  const sync = () => {
    if (disposed) return;
    if (!mayPlay()) {
      pause();
      if (environment.reduced) removeSource();
      update({ playing: false });
      return;
    }
    if (!video.hasAttribute("src")) video.src = "/images/home/hero-orbit-loop.mp4";
    if (pending || !video.paused) return;
    pending = true;
    const current = ++attempt;
    void video.play().then(() => {
      if (disposed || current !== attempt) return;
      pending = false;
      update({ playing: mayPlay() && !video.paused });
    }).catch(() => {
      if (disposed || current !== attempt) return;
      pending = false;
      update({ blocked: true, playing: false });
      video.pause();
    });
  };
  return {
    getState: () => state,
    environment(next: Environment) {
      environment = next;
      update({ ready: true, reduced: next.reduced });
      sync();
    },
    toggle() {
      if (disposed || !state.ready || state.unavailable) return;
      // A blocked autoplay requires a gesture, not a change to sleep intent.
      update({ touched: true, awake: state.blocked && !state.reduced ? true : !state.awake, blocked: false });
      sync();
    },
    playing() { if (mayPlay()) update({ playing: true }); else sync(); },
    paused() { update({ playing: false }); },
    error() {
      if (!video.hasAttribute("src")) return;
      update({ unavailable: true, playing: false });
      sync();
    },
    dispose() { disposed = true; pause(); removeSource(); },
  };
}
