/* ============================================================
   健康小卫士扫描仪 — mock.js
   作用（PLAN Stage 2 / 固定决策 7）：?mock=1 或相机不可用时，
   用 Canvas 画一个"假相机"画面（肚肚/小手/牙齿/眼睛各自的示意），
   让无相机/无头环境也能走通全流程。
   - 造型直接沿用 assets/svg 贴图的 120×120 坐标与风格（DESIGN §3）
   - 用色只取 DESIGN §2 token 字面量（Canvas 吃不到 CSS 变量）
   - 性能（PLAN 决策 6）：DPR 上限 2；prefers-reduced-motion 画静帧；
     页面隐藏时暂停绘制
   暴露 API：MockCam.isEnabled() / start(canvas, part) / stop() /
             pause() / resume()（Stage 5：父母面板定格——只停/续 RAF，不动场景）
   ============================================================ */
(() => {
  'use strict';

  /* token 字面量（与 docs/DESIGN.md §2 一致） */
  const C = {
    ink: '#3E4C66',
    paper: '#FFF7EC',
    primary: '#4DA6E8',
    sky: '#D9EEFB',
    white: '#FFFFFF',
    skin: '#FFD8B8',
    blush: '#FFB3C6',
    pink: '#F87EA0',
  };

  /* 每个部位：画面底色 + 主体画法 + 主体缩放（相对贴图 120 坐标系；
     牙齿是一横排，缩小些保证整排都在画面里） */
  const BG = { belly: C.sky, hands: C.paper, teeth: C.pink, eyes: C.skin };
  const ZOOM = { belly: 1.6, hands: 1.5, teeth: 1.2, eyes: 1.7 };

  let canvas = null;
  let ctx = null;
  let part = 'belly';
  let rafId = 0;
  let running = false;
  let specks = [];
  let resizeObserver = null;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- 对外 API ---------- */

  function isEnabled() {
    return new URLSearchParams(window.location.search).get('mock') === '1';
  }

  function start(el, partName) {
    stop();
    canvas = el;
    if (!canvas || !canvas.getContext) { canvas = null; return; }
    ctx = canvas.getContext('2d');
    part = ZOOM[partName] ? partName : 'belly';
    specks = makeSpecks();
    running = true;

    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    if (!reducedMotion.matches) rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
    canvas = null;
    ctx = null;
  }

  /* Stage 5：父母面板定格——只停/续 RAF（位图留驻），与 stop() 的整装拆除区分 */
  function pause() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function resume() {
    if (running && !rafId && !reducedMotion.matches && !document.hidden) {
      rafId = requestAnimationFrame(loop);
    }
  }

  /* 页面离屏/后台自动停画，回来继续（PLAN 决策 6） */
  document.addEventListener('visibilitychange', () => {
    if (!running) return;
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!reducedMotion.matches && !rafId) {
      rafId = requestAnimationFrame(loop);
    }
  });

  /* ---------- 主循环 ---------- */

  function loop(now) {
    if (!running) return;
    draw(now);
    rafId = requestAnimationFrame(loop);
  }

  function resize() {
    if (!running || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); /* DPR 上限 2 */
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    draw(performance.now());
  }

  function draw(now) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const s = Math.min(w, h);

    ctx.fillStyle = BG[part];
    ctx.fillRect(0, 0, w, h);

    /* 轻微"手持"晃动，模拟真相机取景 */
    const bobY = Math.sin(now / 900) * s * 0.008;
    const tilt = Math.sin(now / 1400) * 0.012;

    ctx.save();
    ctx.translate(w / 2, h / 2 + bobY);
    ctx.rotate(tilt);
    const k = (s / 120) * ZOOM[part];
    ctx.scale(k, k);
    ctx.translate(-60, -60); /* 进入贴图 120×120 坐标系，主体居中 */
    PAINTERS[part](now); /* 画法用闭包 ctx，只传时间戳（paintEye 需要） */
    ctx.restore();

    drawSpecks(w, h, s);
  }

  /* 传感器噪点：几颗缓慢漂移的半透明小白点 */
  function makeSpecks() {
    return Array.from({ length: 24 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.002 + Math.random() * 0.004,
      vx: (Math.random() - 0.5) * 6e-5,
      vy: (Math.random() - 0.5) * 6e-5,
      a: 0.10 + Math.random() * 0.15,
    }));
  }

  function drawSpecks(w, h, s) {
    ctx.save();
    ctx.fillStyle = C.white;
    for (const p of specks) {
      p.x = (p.x + p.vx + 1) % 1;
      p.y = (p.y + p.vy + 1) % 1;
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- 部位示意画法（沿用贴图坐标与风格） ---------- */

  /* 描边规格：--ink、宽 6、圆头圆角（DESIGN §3.2） */
  function strokeProps() {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function dot(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* 实心墨点眼 + 1 个白高光（DESIGN §3.4） */
  function inkEye(x, y, r) {
    dot(x, y, r, C.ink);
    dot(x + r * 0.35, y - r * 0.35, Math.max(r * 0.3, 1), C.white);
  }

  function blushAt(x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.blush;
    ctx.fill();
  }

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /* 胶囊/圆角矩形：填充 + 描边 */
  function capsule(x, y, w, h, r = w / 2) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, rr);
    } else {
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }

  /* 肚肚：圆肚肚 + 脸（同 belly/clean-belly.svg，无徽章） */
  function paintBelly() {
    strokeProps();
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.ellipse(60, 66, 36, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    inkEye(46, 52, 4);
    inkEye(74, 52, 4);
    ctx.beginPath();
    ctx.moveTo(48, 74);
    ctx.quadraticCurveTo(60, 86, 72, 74);
    ctx.stroke();
    blushAt(34, 62, 4.5, 3.2);
    blushAt(86, 62, 4.5, 3.2);
  }

  /* 小手：四指 + 拇指 + 手掌脸（同 hands/clean-hand.svg，无徽章） */
  function paintHand() {
    strokeProps();
    ctx.fillStyle = C.skin;
    capsule(20, 62, 14, 30);
    capsule(34, 34, 12, 30);
    capsule(48, 28, 12, 36);
    capsule(62, 30, 12, 34);
    capsule(76, 38, 12, 26);
    capsule(32, 54, 56, 40, 18);
    inkEye(54, 70, 3.4);
    inkEye(70, 70, 3.4);
    ctx.beginPath();
    ctx.moveTo(54, 80);
    ctx.quadraticCurveTo(62, 87, 70, 80);
    ctx.stroke();
    blushAt(44, 78, 4, 2.8);
    blushAt(80, 78, 4, 2.8);
  }

  /* 牙齿：粉粉嘴巴里一排白白牙 */
  function paintTeeth() {
    strokeProps();
    ctx.fillStyle = C.white;
    capsule(10, 42, 22, 38);
    capsule(36, 34, 22, 46);
    capsule(62, 34, 22, 46);
    capsule(88, 42, 22, 38);
  }

  /* 眼睛：亮眼睛 + 睫毛（同 eyes/clean-eye.svg，无徽章），会眨眼、眼珠会慢慢转 */
  function paintEye(now) {
    strokeProps();
    const ph = (now % 3600) / 3600; /* 每 ~3.6s 眨一下 */
    const open = ph < 0.05 ? 1 - Math.sin((ph / 0.05) * Math.PI) * 0.9 : 1;
    const look = Math.sin(now / 1700) * 6; /* 眼珠左右慢慢看 */

    ctx.save();
    ctx.translate(0, 64);
    ctx.scale(1, Math.max(open, 0.08));
    ctx.translate(0, -64);

    ctx.beginPath();
    ctx.moveTo(24, 64);
    ctx.quadraticCurveTo(60, 24, 96, 64);
    ctx.quadraticCurveTo(60, 96, 24, 64);
    ctx.closePath();
    ctx.fillStyle = C.white;
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.clip(); /* 虹膜裁在眼白里 */
    dot(60 + look, 64, 17, C.primary);
    dot(60 + look, 64, 7.5, C.ink);
    dot(54.5 + look, 58.5, 3, C.white);
    dot(64.5 + look, 69, 1.6, C.white);
    ctx.restore();

    line(42, 49, 37, 41);
    line(52.8, 44.8, 50.5, 35.5);
    line(67.2, 44.8, 69.5, 35.5);
    ctx.restore();
  }

  const PAINTERS = { belly: paintBelly, hands: paintHand, teeth: paintTeeth, eyes: paintEye };

  window.MockCam = { isEnabled, start, stop, pause, resume };
})();
