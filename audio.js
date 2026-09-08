/* ============================================================
   健康小卫士扫描仪 — audio.js
   Stage 3：扫描哔声 —— WebAudio 现场合成（无音频文件，PLAN 技术栈约定）。
   - unlock()：在用户手势同步调用栈里执行（如点部位按钮进扫描页），
     创建/唤醒 AudioContext —— 浏览器自动播放策略要求手势解锁，
     之后由定时器触发的哔声才能出声。
   - beep()：扫描哔，短促柔和的正弦短音；上下文不可用时静默跳过。
   Stage 5 再补：发现/干净 结尾旋律 + 静音开关（localStorage）。
   暴露 API：ScannerAudio.unlock() / ScannerAudio.beep()
   ============================================================ */
(() => {
  'use strict';

  let ctx = null;

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

  /* 用户手势里调用一次，确保后续哔声不被自动播放策略拦住 */
  function unlock() {
    getCtx();
  }

  /* 扫描哔：880Hz 正弦短音，约 70ms，快起快落（音量克制，逗趣不刺耳） */
  function beep() {
    const ac = getCtx();
    if (!ac || ac.state !== 'running') return; /* 被拦截就静默，不报错 */
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

  window.ScannerAudio = { unlock, beep };
})();
