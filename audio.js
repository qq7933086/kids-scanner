/* ============================================================
   健康小卫士扫描仪 — audio.js
   Stage 3：扫描哔声；Stage 5 补全：结局旋律 + 静音开关。
   - 全部 WebAudio 现场合成（无音频文件，PLAN 技术栈约定）
   - unlock()：在用户手势同步调用栈里执行（点部位按钮/静音开关），
     创建/唤醒 AudioContext —— 浏览器自动播放策略要求手势解锁
   - beep()：扫描哔，880Hz 正弦短音（app.js 扫描计时每 0.5s 触发）
   - playOutcome('found')：低沉 buzz —— 两声下滑锯齿脉冲过低通滤软，
     「温和的惊讶」不吓人（DESIGN §1 语气规则）
   - playOutcome('clean')：欢快上行两段旋律 —— C5·E5·G5｜A5·C6 长音
   - 静音开关：localStorage 持久化（key 'kids-scanner:sound'），
     初始默认开；attach(btn) 接管扫描页头部开关按钮
     （sound-on/off.svg 图标互换 + aria-pressed）；重新开声哔一声确认
   暴露 API：ScannerAudio.unlock / beep / playOutcome /
             toggle / isMuted / attach
   ============================================================ */
(() => {
  'use strict';

  const STORAGE_KEY = 'kids-scanner:sound';

  let ctx = null;
  let muted = false;

  /* 初始默认开：只有显式存过 'off' 才静音（localStorage 可能被禁，读失败按默认开） */
  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === 'off';
  } catch (err) { /* 隐私模式等场景静默跳过 */ }

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (err) {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /* 用户手势里调用一次，确保后续哔声/旋律不被自动播放策略拦住 */
  function unlock() {
    getCtx();
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
    } catch (err) { /* 存不进就算了，本次会话内仍生效 */ }
  }

  /* ---------- 扫描哔（Stage 3）：880Hz 正弦短音，约 70ms，快起快落 ---------- */
  function beep() {
    const ac = getCtx();
    if (muted || !ac || ac.state !== 'running') return; /* 静音/被拦截就跳过，不报错 */
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  /* ---------- 合成原语 ---------- */

  /* 单音：快起-保持-快落包络；to 有值则频率滑动 */
  function tone(ac, freq, t0, dur, type, gain, to) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.setValueAtTime(gain, Math.max(t0 + 0.02, t0 + dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /* 低沉 buzz 单脉冲：下滑锯齿过低通，圆钝不刺耳 */
  function buzz(ac, t0, f0, f1, dur) {
    const osc = ac.createOscillator();
    const lp = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.03);
    g.gain.setValueAtTime(0.15, t0 + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(lp).connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /* 发现：两声低沉下滑 buzz（「咦——？」温和惊讶，不吓哭） */
  function foundTune(ac) {
    const t = ac.currentTime + 0.02;
    buzz(ac, t, 150, 118, 0.20);
    buzz(ac, t + 0.30, 110, 84, 0.30);
  }

  /* 干净：欢快上行两段旋律（C5·E5·G5｜A5·C6 长音收尾，三角波柔亮） */
  function cleanTune(ac) {
    const t = ac.currentTime + 0.02;
    tone(ac, 523.25, t, 0.16, 'triangle', 0.14);        /* C5 */
    tone(ac, 659.25, t + 0.17, 0.16, 'triangle', 0.14); /* E5 */
    tone(ac, 783.99, t + 0.34, 0.16, 'triangle', 0.14); /* G5 */
    tone(ac, 880.00, t + 0.62, 0.16, 'triangle', 0.14); /* A5 */
    tone(ac, 1046.50, t + 0.79, 0.50, 'triangle', 0.16); /* C6 长音 */
  }

  /* ---------- 结局旋律（app.js finishScan 调用） ---------- */
  function playOutcome(outcome) {
    const ac = getCtx();
    if (muted || !ac || ac.state !== 'running') return;
    if (outcome === 'found') foundTune(ac);
    else cleanTune(ac);
  }

  /* ---------- 静音开关（localStorage 持久化，初始默认开） ---------- */
  let soundBtn = null;
  let soundImg = null;

  function isMuted() { return muted; }

  function toggle() {
    muted = !muted;
    persist();
    return muted;
  }

  function updateBtn() {
    if (!soundBtn || !soundImg) return;
    soundImg.src = muted ? 'assets/svg/sound-off.svg' : 'assets/svg/sound-on.svg';
    soundBtn.setAttribute('aria-label', muted ? '打开声音' : '静音');
    soundBtn.setAttribute('aria-pressed', String(muted));
  }

  /* 接管扫描页头部的静音按钮（app.js 装载时调用一次） */
  function attach(btn) {
    if (!btn) return;
    soundBtn = btn;
    soundImg = btn.querySelector('img');
    btn.addEventListener('click', () => {
      toggle();
      unlock();           /* 借按钮手势解锁，保证确认音能出 */
      if (!muted) beep(); /* 重新开声：哔一声确认 */
      updateBtn();
    });
    updateBtn(); /* 同步持久化的初始态（图标/aria） */
  }

  window.ScannerAudio = { unlock, beep, playOutcome, toggle, isMuted, attach };
})();
