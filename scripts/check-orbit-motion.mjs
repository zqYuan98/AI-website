import assert from 'node:assert/strict';
import { createTsLoader } from './lib/load-ts.mjs';

const { createOrbitMotion, orbitAction } = createTsLoader()('src/components/home/orbit-motion.ts');
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup() {
  const requests = [];
  const states = [];
  const video = {
    src: '', paused: true, loads: 0,
    hasAttribute() { return !!this.src; },
    removeAttribute() { this.src = ''; },
    load() { this.loads++; },
    pause() { this.paused = true; },
    play() {
      this.paused = false;
      return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    },
  };
  const motion = createOrbitMotion(video, (state) => states.push(state));
  return { video, motion, requests, states };
}
const normal = { reduced: false, visible: true };
{
  const { video, motion, requests } = setup();
  assert.equal(motion.getState().ready, false);
  motion.toggle();
  assert.equal(requests.length, 0);
  motion.environment(normal);
  requests[0].resolve(); await flush();
  assert.equal(motion.getState().playing, true);
  motion.toggle();
  assert.equal(video.paused, true);
  assert.equal(orbitAction(motion.getState()), '唤醒星球');
  motion.environment({ ...normal, visible: false });
  motion.environment(normal);
  assert.equal(motion.getState().awake, false);
  assert.equal(requests.length, 1);
  motion.toggle(); requests[1].resolve(); await flush();
  motion.environment({ ...normal, visible: false });
  assert.equal(video.paused, true);
  assert.equal(motion.getState().awake, true);
  motion.environment(normal); requests[2].resolve(); await flush();
  assert.equal(motion.getState().playing, true);
  motion.dispose();
  assert.equal(video.src, '');
}
{
  const { video, motion, requests } = setup();
  motion.environment({ ...normal, reduced: true });
  assert.equal(video.src, ''); assert.equal(requests.length, 0);
  assert.equal(orbitAction(motion.getState()), '让小助手休息（静态模式）');
  motion.toggle();
  assert.equal(orbitAction(motion.getState()), '唤醒小助手（静态模式）');
  motion.environment(normal);
  assert.equal(requests.length, 0);
  motion.toggle(); requests[0].resolve(); await flush();
  motion.environment({ ...normal, reduced: true });
  assert.equal(video.src, ''); assert.equal(video.paused, true);
  motion.dispose();
}
{
  const { motion, requests } = setup();
  motion.environment(normal);
  requests[0].reject(new Error('autoplay denied')); await flush();
  assert.equal(orbitAction(motion.getState()), '播放星球动画');
  assert.equal(motion.getState().awake, true);
  motion.environment({ ...normal, visible: false }); motion.environment(normal);
  assert.equal(requests.length, 1);
  motion.toggle();
  assert.equal(motion.getState().awake, true);
  requests[1].reject(new Error('still denied')); await flush();
  assert.equal(motion.getState().blocked, true);
  motion.toggle(); requests[2].resolve(); await flush();
  assert.equal(orbitAction(motion.getState()), '让星球休息');
  motion.dispose();
}
{
  const { video, motion, requests, states } = setup();
  motion.environment(normal);
  motion.toggle(); motion.toggle(); motion.toggle();
  requests[0].reject(new Error('old attempt')); requests[1].resolve(); await flush();
  assert.equal(motion.getState().awake, false);
  assert.equal(motion.getState().blocked, false);
  assert.equal(motion.getState().playing, false);
  assert.equal(video.paused, true);
  motion.toggle(); motion.error();
  assert.equal(orbitAction(motion.getState()), '动图暂不可用');
  const count = requests.length;
  motion.toggle(); motion.environment(normal);
  assert.equal(requests.length, count);
  motion.dispose();
  const published = states.length;
  requests.at(-1).reject(new Error('unmounted')); await flush();
  assert.equal(states.length, published);
}
console.log('PASS: orbit intent, visibility, reduced-motion/no source, explicit autoplay retry, rapid toggles, media failure and disposal.');
