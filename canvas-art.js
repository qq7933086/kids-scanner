/* ============================================================
   健康小卫士扫描仪 — canvas-art.js
   Stage 4：结果动画层 —— playResult(part, outcome)
   - 背景 = 相机/mock 最后一帧定格（captureBackground() 需在停流前调用，
     相机帧按预览同向镜像定格）+ 语义色罩 + Canvas 卡通叠加
   - clean：星星/sparkle 撒落 + 部位干净贴图（自带绿勾徽章）+ 绿色语义
   - found：对应生物贴图（worm/germ/cavity-germ/foreign-body）
     按波状路径蠕动/爬行/滚动/漂浮
   - 性能（PLAN 固定决策 6）：RAF 驱动；DPR 上限 2；页面离屏暂停；
     prefers-reduced-motion 降级为静帧 + 立即出文案与按钮
   - 文案/词表：docs/DESIGN.md §4（严格照抄）
   暴露 API：ResultArt.playResult / ResultArt.captureBackground / ResultArt.stop
   （另挂 window.playResult 供控制台/自动化，同 window.go 先例）
   ============================================================ */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  /* token 字面量（与 docs/DESIGN.md §2 一致；Canvas 吃不到 CSS 变量） */
  const C = {
    sky: '#D9EEFB',
    greenLight: '#DFF4E1',  /* 干净结局背景（含 Canvas 色罩） */
    orangeLight: '#FFEBD1', /* 发现结局背景（含 Canvas 色罩） */
  };

  /* ---------- 贴图（assets/svg，同源本地经 Image 加载，Canvas 绘制） ---------- */
  const SRC = {
    clean: {
      belly: 'assets/svg/belly/clean-belly.svg',
      hands: 'assets/svg/hands/clean-hand.svg',
      teeth: 'assets/svg/teeth/clean-tooth.svg',
      eyes: 'assets/svg/eyes/clean-eye.svg',
    },
    bug: {
      belly: 'assets/svg/belly/worm.svg',
      hands: 'assets/svg/hands/germ.svg',
      teeth: 'assets/svg/teeth/cavity-germ.svg',
      eyes: 'assets/svg/eyes/foreign-body.svg',
    },
    star: 'assets/svg/star.svg',
    sparkle: 'assets/svg/sparkle.svg',
  };

  /* ---------- 结果词表（DESIGN §4，严格照抄） ---------- */
  const TIP_MARK = ['①', '②', '③'];
  const COPY = {
    belly: {
      clean: { title: '肚肚干干净净，真棒！', sub: '洗手的好习惯保住啦，继续保持～', tips: ['继续饭前便后洗手', '蔬果洗净再吃', '不咬指甲'] },
      found: { title: '呀，肚肚里有小虫虫！', sub: '小虫虫最爱脏手指，我们去洗洗手！', tips: ['饭前便后认真洗手', '水果洗干净再吃', '指甲剪短，不咬手指'] },
    },
    hands: {
      clean: { title: '小手洗得真干净！', sub: '连手指缝都亮晶晶，超厉害！', tips: ['饭前便后要洗手', '外出回家先洗手', '不揉眼睛、不挖鼻鼻'] },
      found: { title: '小手上藏着小细菌！', sub: '细菌最怕肥皂泡泡，搓一搓就跑光光～', tips: ['肥皂搓出小泡泡', '手心手背指缝都搓到', '冲干净，擦干干'] },
    },
    teeth: {
      clean: { title: '牙齿白白亮亮的！', sub: '早晚刷牙的好习惯，保持住～', tips: ['早晚刷牙，每次两分钟', '甜食吃完漱漱口', '半年请牙医看看牙'] },
      found: { title: '牙齿上有小脏虫！', sub: '小脏虫爱吃甜甜渣，我们把它刷走咯！', tips: ['早晚认真刷，每次两分钟', '少吃糖果和甜饮料', '刷完请爸妈检查一下'] },
    },
    eyes: {
      clean: { title: '眼睛亮晶晶的！', sub: '不揉眼睛的好习惯，继续保持～', tips: ['保持不揉眼睛', '看书、画画记得休息', '离屏幕远一点'] },
      found: { title: '咦，眼睛里进了小灰尘！', sub: '别揉别揉，眨眨眼，请爸妈轻轻看看～', tips: ['不用手揉眼睛', '眨眨眼，让小灰尘出来', '还不舒服就请爸妈帮忙'] },
    },
  };
  /* 结果第三按钮（DESIGN §4 通用文案） */
  const TIPS_BTN = { clean: '卫生小妙招', found: '看看怎么赶走它' };

  /* found 的别名（PLAN Stage 4 验证示例 playResult('belly','worm')） */
  const FOUND_ALIAS = new Set(['found', 'worm', 'germ', 'cavity', 'cavity-germ', 'foreign-body']);
  const PARTS = new Set(['belly', 'hands', 'teeth', 'eyes']);

  /* ---------- 节奏 ---------- */
  const INTRO_MS = 2600;  /* 动画主段：到点揭示文案卡 + 按钮 */
  const WASH_IN_MS = 500; /* 语义色罩淡入 */
  const WASH_ALPHA = 0.55;
  const STATIC_E = 1400;  /* reduced-motion 静帧取的动画时刻 */
  const SPARKLE_N = 14;   /* sparkle 撒落数量 */

  /* found 生物运动参数：dur=横穿一圈 ms；lane=路径高度占比；amp/waves=波状路径；
     wig/wigMs=蠕动摆角；roll=滚动（rollMs 一圈）；float=漂浮（floatMs/floatAmp）；
     flip=向右爬时水平翻转（worm 头在贴图左侧） */
  const CRAWLERS = {
    belly: [ /* 小虫虫：弓背蠕动爬行 */
      { dur: 8200, lane: 0.30, amp: 0.050, waves: 1.6, size: 0.30, dir: -1, wig: 0.16, wigMs: 210, flip: true },
      { dur: 13000, lane: 0.55, amp: 0.060, waves: 2.0, size: 0.26, dir: 1, wig: 0.14, wigMs: 240 },
      { dur: 10500, lane: 0.74, amp: 0.045, waves: 1.2, size: 0.20, dir: -1, wig: 0.18, wigMs: 190, flip: true },
    ],
    hands: [ /* 小细菌：沿路径骨碌骨碌滚动 */
      { dur: 9500, lane: 0.32, amp: 0.050, waves: 1.4, size: 0.26, dir: -1, roll: true, rollMs: 1500 },
      { dur: 14000, lane: 0.56, amp: 0.050, waves: 1.8, size: 0.22, dir: 1, roll: true, rollMs: 1800 },
      { dur: 12000, lane: 0.76, amp: 0.040, waves: 1.1, size: 0.17, dir: -1, roll: true, rollMs: 2200 },
    ],
    teeth: [ /* 牙菌小脏虫：小碎步爬行 */
      { dur: 9000, lane: 0.34, amp: 0.055, waves: 1.5, size: 0.27, dir: -1, wig: 0.15, wigMs: 230 },
      { dur: 13500, lane: 0.58, amp: 0.055, waves: 1.9, size: 0.24, dir: 1, wig: 0.13, wigMs: 250 },
      { dur: 11500, lane: 0.78, amp: 0.040, waves: 1.2, size: 0.18, dir: -1, wig: 0.17, wigMs: 200 },
    ],
    eyes: [ /* 小灰尘：慢悠悠飘进来 */
      { dur: 15000, lane: 0.30, amp: 0.090, waves: 1.8, size: 0.24, dir: -1, float: true, floatMs: 1300, floatAmp: 0.18 },
      { dur: 22000, lane: 0.55, amp: 0.100, waves: 2.2, size: 0.26, dir: 1, float: true, floatMs: 1600, floatAmp: 0.20 },
      { dur: 21000, lane: 0.76, amp: 0.070, waves: 1.4, size: 0.15, dir: -1, float: true, floatMs: 1900, floatAmp: 0.15 },
    ],
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- 运行态 ---------- */
  /* 双层画布：bgCanvas=定格帧（静态，仅 resize 时重绘一次，避免每帧大图重采样）；
     canvas=卡通动画层（clearRect + 小贴图，RAF 每帧） */
  let canvas = null;
  let ctx = null;
  let bgCanvas = null;
  let bgCtx = null;
  let resizeObserver = null;
  let rafId = 0;
  let running = false;
  let revealed = false;
  let t0 = 0;
  let part = 'belly';
  let outcome = 'clean';
  let sparkles = [];
  let crawlers = [];
  let snap = null;   /* 定格帧（离屏 canvas） */
  let hasSnap = false;

  /* ---------- 贴图预加载（进扫描页前就绪，首帧即可绘制） ---------- */
  const IMG = {
    clean: {},
    bug: {},
  };
  for (const [k, src] of Object.entries(SRC.clean)) {
    const im = new Image();
    im.src = src;
    IMG.clean[k] = im;
  }
  for (const [k, src] of Object.entries(SRC.bug)) {
    const im = new Image();
    im.src = src;
    IMG.bug[k] = im;
  }
  for (const k of ['star', 'sparkle']) {
    const im = new Image();
    im.src = SRC[k];
    IMG[k] = im;
  }

  /* ---------- 对外 API ---------- */

  /* 定格扫描源最后一帧：相机取 video 当前帧（按预览同向镜像），
     否则取 mock 画布位图（停画后位图仍在，可随时补截） */
  function captureBackground() {
    const video = document.getElementById('cam-video');
    const mock = document.getElementById('mock-canvas');
    const stage = document.getElementById('scan-stage');
    let src = null;
    let mirror = false;

    const camLive = stage && stage.classList.contains('mode-camera') && video && video.videoWidth > 0;
    if (camLive) {
      src = video;
      mirror = true;
    } else if (mock && mock.width > 0) {
      src = mock;
    }
    if (!src) {
      hasSnap = false;
      return false;
    }

    const w = src === video ? video.videoWidth : mock.width;
    const h = src === video ? video.videoHeight : mock.height;
    if (!snap) snap = document.createElement('canvas');
    snap.width = w;
    snap.height = h;
    const sc = snap.getContext('2d');
    if (mirror) {
      sc.save();
      sc.translate(w, 0);
      sc.scale(-1, 1);
      sc.drawImage(src, 0, 0, w, h);
      sc.restore();
    } else {
      sc.drawImage(src, 0, 0, w, h);
    }
    hasSnap = true;
    return true;
  }

  /* 播放结果动画并填充结果页文案（part: belly|hands|teeth|eyes；
     outcome: clean|found，也收生物名别名） */
  function playResult(partName, outcomeName) {
    stop();
    part = PARTS.has(partName) ? partName : 'belly';
    outcome = FOUND_ALIAS.has(outcomeName) ? 'found' : 'clean';

    if (!hasSnap) captureBackground(); /* 手动触发时补截（mock 位图仍在） */
    buildScene();
    applyCopy();

    bgCanvas = document.getElementById('result-bg');
    bgCtx = bgCanvas.getContext('2d');
    canvas = document.getElementById('result-canvas');
    ctx = canvas.getContext('2d');
    running = true;
    revealed = false;
    t0 = performance.now();

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    if (reducedMotion.matches) {
      draw(STATIC_E);       /* 降级：静帧 */
      reveal();             /* 文案与按钮立即出现 */
    } else {
      rafId = requestAnimationFrame(loop);
    }
  }

  /* 停止动画（离开结果页/重播时由 app.js 或本模块调用） */
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  }

  /* 页面离屏暂停，回前台续播（PLAN 决策 6；静帧模式无循环可停） */
  document.addEventListener('visibilitychange', () => {
    if (!running || reducedMotion.matches) return;
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!rafId && canvas && canvas.isConnected) {
      rafId = requestAnimationFrame(loop);
    }
  });

  /* ---------- 结果页 DOM：词表文案 + 语义 class + 重置揭示态 ---------- */
  function applyCopy() {
    const view = $('#view-result');
    const copy = COPY[part][outcome];
    view.classList.remove('outcome-clean', 'outcome-found');
    view.classList.add(outcome === 'clean' ? 'outcome-clean' : 'outcome-found');

    $('#result-title').textContent = copy.title;
    $('#result-sub').textContent = copy.sub;
    const list = $('#result-tips');
    list.innerHTML = '';
    copy.tips.forEach((text, i) => {
      const li = document.createElement('li');
      li.textContent = `${TIP_MARK[i]} ${text}`;
      list.appendChild(li);
    });
    const btn = $('#btn-tips');
    btn.textContent = TIPS_BTN[outcome];
    btn.setAttribute('aria-expanded', 'false');

    /* 重置为"动画结束后揭示"的初始态 */
    $('#result-card').hidden = true;
    $('#result-actions').hidden = true;
    list.hidden = true;
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    $('#result-card').hidden = false;
    $('#result-actions').hidden = false;
  }

  /* ---------- 场景 ---------- */
  function buildScene() {
    sparkles = Array.from({ length: SPARKLE_N }, () => ({
      x: Math.random(),
      y0: Math.random(),
      vy: 0.00012 + Math.random() * 0.00012,  /* 相对 s：px/ms */
      sway: 0.010 + Math.random() * 0.022,    /* 相对 s */
      swayMs: 900 + Math.random() * 900,
      ph: Math.random() * Math.PI * 2,
      size: 0.045 + Math.random() * 0.050,    /* 相对 s */
      rot0: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.0024,     /* rad/ms */
      twPh: Math.random() * Math.PI * 2,
    }));
    /* 第 2 条（中线、最慢）固定从画面中部偏左出发：首帧即入画，
       开场前几秒始终巡游在画面中央一带 */
    crawlers = CRAWLERS[part].map((c, i) => ({
      ...c,
      u0: i === 1 ? 0.35 : Math.random(),
      ph: Math.random() * Math.PI * 2,
    }));
  }

  /* ---------- 主循环 ---------- */
  function loop(now) {
    if (!running) return;
    const e = now - t0;
    draw(e);
    if (!revealed && e >= INTRO_MS) reveal();
    rafId = requestAnimationFrame(loop);
  }

  function resize() {
    if (!running || !canvas || !bgCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); /* DPR 上限 2 */
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = bgCanvas.width = Math.round(w * dpr);
    canvas.height = bgCanvas.height = Math.round(h * dpr);
    drawBg(); /* 定格帧只在尺寸变化时重绘一次 */
    if (reducedMotion.matches) draw(STATIC_E); /* 静帧随尺寸重绘 */
  }

  /* 底层：定格帧 cover 铺满（静态层，一次绘制） */
  function drawBg() {
    if (!bgCtx || !bgCanvas) return;
    const w = bgCanvas.width;
    const h = bgCanvas.height;
    if (!w || !h) return;
    if (hasSnap && snap) {
      const k = Math.max(w / snap.width, h / snap.height);
      const dw = snap.width * k;
      const dh = snap.height * k;
      bgCtx.drawImage(snap, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      bgCtx.fillStyle = C.sky; /* 无定格帧兜底 */
      bgCtx.fillRect(0, 0, w, h);
    }
  }

  /* 顶层：语义色罩 + 卡通动画（每帧） */
  function draw(e) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return;
    const s = Math.min(w, h);

    ctx.clearRect(0, 0, w, h);

    /* 语义色罩淡入（绿=干净/表扬，橙=发现/提醒） */
    ctx.globalAlpha = Math.min(e / WASH_IN_MS, 1) * WASH_ALPHA;
    ctx.fillStyle = outcome === 'clean' ? C.greenLight : C.orangeLight;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    if (outcome === 'clean') drawClean(e, w, h, s);
    else drawFound(e, w, h, s);
  }

  /* 干净版：部位贴图 + 主角星星 + sparkle 撒落 */
  function drawClean(e, w, h, s) {
    /* 部位干净贴图（自带绿勾徽章=绿色语义）：居中弹入 + 轻轻浮动 */
    const k = popIn(e, 150, 620);
    const bob = Math.sin(e / 640) * s * 0.012;
    sprite(IMG.clean[part], w / 2, h / 2 + bob, s * 0.46 * k, Math.sin(e / 900) * 0.035);

    /* 主角星星 ×2（DESIGN §3.6：star 带脸） */
    sprite(IMG.star, w * 0.28, h * 0.24, s * 0.20 * popIn(e, 420, 560), Math.sin(e / 820) * 0.12);
    sprite(IMG.star, w * 0.72, h * 0.30, s * 0.145 * popIn(e, 640, 560), -Math.sin(e / 760) * 0.14);

    /* sparkle 撒落（无脸小粒子，透明度一闪一闪；尺寸恒定避免 SVG 反复重栅格化） */
    const span = h + s * 0.24;
    for (const p of sparkles) {
      const y = ((p.y0 * span + p.vy * s * e) % span) - s * 0.12;
      const x = p.x * w + Math.sin(e / p.swayMs + p.ph) * p.sway * s;
      const tw = 0.7 + 0.3 * Math.sin(e / 260 + p.twPh);
      ctx.globalAlpha = tw;
      sprite(IMG.sparkle, x, y, p.size * s, p.rot0 + p.vr * e);
    }
    ctx.globalAlpha = 1;
  }

  /* 发现版：生物按波状路径蠕动/爬行/滚动/漂浮 */
  function drawFound(e, w, h, s) {
    for (const cr of crawlers) {
      let u = (e / cr.dur + cr.u0) % 1;
      if (cr.dir < 0) u = 1 - u;
      const size = s * cr.size;
      const x = -size + u * (w + 2 * size);
      const y = h * cr.lane + Math.sin(u * cr.waves * Math.PI * 2 + cr.ph) * s * cr.amp;

      let rot = 0;
      let squash = 1;
      if (cr.roll) rot = ((e / cr.rollMs) * Math.PI * 2 * cr.dir);      /* 细菌滚动 */
      else if (cr.float) rot = Math.sin(e / cr.floatMs) * cr.floatAmp;  /* 灰尘漂浮 */
      else {                                                             /* 蠕动爬行 */
        rot = Math.sin(e / cr.wigMs) * cr.wig;
        squash = 1 + Math.cos(e / cr.wigMs) * 0.05;
      }
      sprite(IMG.bug[part], x, y, size, rot, !!cr.flip && cr.dir > 0, squash);
    }
  }

  /* ---------- 绘制原语 ---------- */

  /* 弹入（easeOutBack）：e<delay 不显示，scale 可能略过冲再回落 */
  function popIn(e, delay, dur) {
    if (e <= delay) return 0;
    const t = Math.min((e - delay) / dur, 1);
    return 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  }

  function sprite(img, x, y, size, rot = 0, flip = false, squashY = 1) {
    if (!img || !img.complete || !img.naturalWidth || size <= 1) return;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (squashY !== 1) ctx.scale(1, squashY);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  window.ResultArt = { playResult, captureBackground, stop };
  window.playResult = playResult; /* 供控制台/自动化（同 window.go 先例） */
})();
