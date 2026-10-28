import { genKeyPair, b64 } from './engine.js';

let running = false, timer;

self.onmessage = async ({ data }) => {
  const { type, prefix, target } = data;
  if (type === 'stop') { running = false; clearInterval(timer); return; }
  if (type !== 'start') return;

  running = true;
  const p = prefix.toLowerCase();
  let attempts = 0, hits = 0, t0 = performance.now(), lastA = 0, lastT = t0;

  // 每 500ms 上报速度
  timer = setInterval(() => {
    const now = performance.now();
    const spd = Math.round((attempts - lastA) / ((now - lastT) / 1000) || 0);
    lastA = attempts; lastT = now;
    self.postMessage({ type: 'speed', speed: spd });
  }, 500);

  while (running && hits < target) {
    const { sk, pk, body } = await genKeyPair();
    attempts++;
    if (body.startsWith(p)) {
      hits++;
      self.postMessage({
        type: 'hit', address: body + '.onion',
        secretKeyB64: b64(sk), publicKeyB64: b64(pk)
      });
    }
    if ((attempts & 255) === 0) await new Promise(r => setTimeout(r, 0)); // 让出事件循环
  }

  clearInterval(timer);
  self.postMessage({ type: 'done', attempts });
};