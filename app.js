/* ============================================================
   健康小卫士扫描仪 — app.js
   Stage 3：相机取流生命周期（获得流 / 重扫复用 / 切后台停流 / 离场停流）
   + ~4s 扫描计时（进度换词 + 每 0.5s 哔声）+ decideOutcome() 结果分发。
   Stage 4：到点后先把扫描源最后一帧交给 canvas-art.js 定格，
   再进 result 视图播放部位×结局动画（ResultArt.playResult）。
   Stage 5：decideOutcome = 父母面板单次锁定（controls.js）+ 随机
   干净 65%/发现 35%（PLAN 固定决策 5），扫完自动回落随机；
   Stage 4 的 ?outcome= 测试钩子已按约移除，自动化改经父母面板
   锁定结局。父母面板打开 = 停表 + 画面定格，关闭 = 从冻结处
   续扫（DESIGN §5）；结局旋律由 audio.js playOutcome 播。
   - 文案/词表：docs/DESIGN.md §4（进度换词 0s/1.5s/3s）
   - ?mock=1 或相机失败 → mock.js 卡通画面（PLAN 固定决策 7）
   ============================================================ */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  /* 部位词表（DESIGN §4） */
  const PARTS = { belly: '肚肚', hands: '小手', teeth: '牙齿', eyes: '眼睛' };
  const DEFAULT_PART = 'belly';

  /* 扫描节奏：约 4s（PLAN Stage 3）；进度换词时刻表（DESIGN §4 通用文案） */
  const SCAN_MS = 4000;
  const SCAN_BEEP_MS = 500;
  const SCAN_LINES = [
    { at: 0, text: '正在扫描…别动哦' },
    { at: 1500, text: '扫得真仔细…' },
    { at: 3000, text: '就快好啦…' },
  ];

  const state = {
    view: 'home',    /* home | scan | result */
    part: null,      /* belly | hands | teeth | eyes */
    source: null,    /* camera | mock | null */
    stream: null,    /* 活着的 MediaStream 才复用；离场/后台即停 */
    outcome: null,   /* 'clean' | 'found'：decideOutcome 结果，Stage 4 消费 */
    phase: 'idle',   /* idle | acquiring | scanning */
  };

  let scanSeq = 0;             /* 扫描会话序号：进出/重扫/前后台切换都会失效旧异步续体 */
  let scanTimer = 0;           /* setInterval 句柄 */
  let scanT0 = 0;              /* 本轮扫描起点 */
  let lastBeepIdx = -1;        /* 已哔过的 0.5s 档位 */
  let lastLine = '';           /* 当前进度词（去重写 DOM） */
  let resumeOnVisible = false; /* 后台被打断的扫描，回前台从头重扫 */
  let pausedElapsed = 0;       /* Stage 5：父母面板打开时冻结的已扫时长（ms） */

  /* ---------- DOM ---------- */
  const views = {
    home: $('#view-home'),
    scan: $('#view-scan'),
    result: $('#view-result'),
  };
  const scanStage = $('#scan-stage');
  const camVideo = $('#cam-video');
  const mockCanvas = $('#mock-canvas');
  const scanPartPill = $('#scan-part');
  const scanNotice = $('#scan-notice');
  const scanStatus = $('#scan-status');

  /* ---------- 状态机 ---------- */
  function go(name) {
    if (!views[name]) return;
    if (state.view === 'scan' && name !== 'scan') exitScan();
    if (state.view === 'result' && name !== 'result' && window.ResultArt) ResultArt.stop(); /* 离开结果页停动画 */
    for (const key of Object.keys(views)) {
      views[key].classList.toggle('active', key === name);
    }
    state.view = name;
    if (name === 'scan') enterScan();
  }
  window.go = go; /* 暴露给控制台/自动化（PLAN：?mock=1 全程可自动化走通） */

  /* ---------- 部位按钮 ---------- */
  for (const btn of document.querySelectorAll('.part-btn')) {
    btn.addEventListener('click', () => {
      state.part = btn.dataset.part;
      go('scan');
    });
  }

  /* ---------- 扫描源：相机优先；?mock=1 或相机失败 → mock ---------- */
  function enterScan() {
    const seq = ++scanSeq;
    if (!state.part) state.part = DEFAULT_PART;
    scanPartPill.textContent = PARTS[state.part];
    scanNotice.hidden = true;
    if (window.ScannerAudio) ScannerAudio.unlock(); /* 借按钮手势解锁 AudioContext */
    resetScanLine();
    acquireSource(seq);
  }

  async function acquireSource(seq) {
    state.phase = 'acquiring';

    if (window.MockCam && MockCam.isEnabled()) {
      startMock();
      beginScan(seq);
      return;
    }

    /* 重扫复用：上一条流还活着就直接接上，不再 getUserMedia */
    if (state.stream && state.stream.getVideoTracks().some((t) => t.readyState === 'live')) {
      camVideo.srcObject = state.stream;
      try {
        await camVideo.play();
      } catch (err) { /* 本就在播这条流，忽略 */ }
      if (seq !== scanSeq || state.view !== 'scan') return;
      useCamera();
      beginScan(seq);
      return;
    }

    let stream = null;
    try {
      stream = await openCamera();
    } catch (err) {
      console.warn('[app] 相机不可用，自动切换卡通模式：', err && (err.name || err.message || err));
      if (seq !== scanSeq || state.view !== 'scan') return;
      scanNotice.hidden = false; /* 相机在休息～用卡通模式也能扫！ */
      startMock();
      beginScan(seq);
      return;
    }
    if (seq !== scanSeq || state.view !== 'scan') {
      stream.getTracks().forEach((t) => t.stop()); /* 自己开的流自己收掉 */
      return;
    }
    state.stream = stream;
    useCamera();
    beginScan(seq);
  }

  async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia unavailable');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    camVideo.srcObject = stream;
    try {
      await camVideo.play();
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw err;
    }
    return stream;
  }

  function stopStream() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    camVideo.srcObject = null;
  }

  function useCamera() {
    if (window.MockCam) MockCam.stop(); /* 相机优先，mock 让位 */
    state.source = 'camera';
    scanStage.classList.remove('mode-mock');
    scanStage.classList.add('mode-camera');
  }

  function startMock() {
    stopStream(); /* 相机让位 */
    if (window.MockCam) MockCam.stop();
    state.source = 'mock';
    scanStage.classList.remove('mode-camera');
    scanStage.classList.add('mode-mock');
    MockCam.start(mockCanvas, state.part);
  }

  /* ---------- ~4s 扫描计时：进度换词 + 每 0.5s 哔声 ---------- */
  function beginScan(seq) {
    if (seq !== scanSeq || state.view !== 'scan') return;
    if (document.hidden) { /* 刚就绪就被切后台：停流等回前台重扫 */
      state.phase = 'idle';
      resumeOnVisible = true;
      stopStream();
      return;
    }
    if (window.ParentControls && ParentControls.isOpen()) {
      /* 取流期间面板已被唤起：直接进定格暂停态，等面板关闭再续扫 */
      state.phase = 'paused';
      pausedElapsed = 0;
      freezePicture();
      return;
    }
    state.phase = 'scanning';
    scanT0 = performance.now();
    lastBeepIdx = -1;
    resetScanLine();
    stopScanTimer();
    scanTimer = setInterval(() => tickScan(seq), 100);
  }

  function tickScan(seq) {
    if (seq !== scanSeq || state.view !== 'scan' || state.phase !== 'scanning') {
      stopScanTimer();
      return;
    }
    const elapsed = performance.now() - scanT0;
    setScanLine(elapsed);
    const beepIdx = Math.floor(elapsed / SCAN_BEEP_MS);
    if (beepIdx > lastBeepIdx && elapsed < SCAN_MS && window.ScannerAudio) ScannerAudio.beep();
    lastBeepIdx = beepIdx;
    if (elapsed >= SCAN_MS) {
      stopScanTimer();
      finishScan(seq);
    }
  }

  function finishScan(seq) {
    if (seq !== scanSeq || state.view !== 'scan') return;
    state.phase = 'idle';
    state.outcome = decideOutcome(state.part);
    if (window.ParentControls) ParentControls.clearForced(); /* 扫完自动回落随机（DESIGN §5） */
    if (window.ResultArt) ResultArt.captureBackground(); /* 在停流前定格相机/mock 最后一帧 */
    go('result'); /* 内部会 exitScan()：离开页面停流 */
    if (window.ResultArt) ResultArt.playResult(state.part, state.outcome); /* Stage 4：结果动画 */
    if (window.ScannerAudio) ScannerAudio.playOutcome(state.outcome); /* Stage 5：结局旋律 */
  }

  function stopScanTimer() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = 0;
    }
  }

  function scanLineAt(elapsed) {
    let text = SCAN_LINES[0].text;
    for (const line of SCAN_LINES) {
      if (elapsed >= line.at) text = line.text;
    }
    return text;
  }

  function setScanLine(elapsed) {
    const text = scanLineAt(elapsed);
    if (text !== lastLine) {
      lastLine = text;
      scanStatus.textContent = text;
    }
  }

  function resetScanLine() {
    lastLine = '';
    setScanLine(0);
  }

  /* ---------- Stage 5：父母面板 开=停表定格 / 关=续扫（DESIGN §5） ---------- */
  function freezePicture() {
    if (state.source === 'camera') camVideo.pause(); /* 相机定格：暂停预览即冻结画面 */
    else if (state.source === 'mock' && window.MockCam) MockCam.pause();
    scanStage.classList.add('panel-open'); /* 扫描线停走 */
  }

  function unfreezePicture() {
    if (state.source === 'camera') camVideo.play().catch(() => {});
    else if (state.source === 'mock' && window.MockCam) MockCam.resume();
    scanStage.classList.remove('panel-open');
  }

  /* 面板打开：记下已扫时长并停表 + 画面定格（哔声随计时一起停） */
  function pauseForPanel() {
    if (state.view !== 'scan') return;
    if (state.phase === 'scanning') {
      pausedElapsed = performance.now() - scanT0;
      stopScanTimer();
      state.phase = 'paused';
    }
    freezePicture();
  }

  /* 面板关闭：scanT0 回拨，从冻结处接着扫 */
  function resumeFromPanel() {
    if (state.view !== 'scan') return;
    if (state.phase === 'paused') {
      state.phase = 'scanning';
      scanT0 = performance.now() - pausedElapsed;
      pausedElapsed = 0;
      stopScanTimer();
      scanTimer = setInterval(() => tickScan(scanSeq), 100);
    }
    unfreezePicture();
  }

  /* 重新扫描：活流复用、计时归零（『重扫复用』入口） */
  function restartScan() {
    const seq = ++scanSeq;
    stopScanTimer();
    state.phase = 'idle';
    pausedElapsed = 0;
    scanStage.classList.remove('panel-open'); /* 后台静默收起面板可能残留 */
    resetScanLine();
    acquireSource(seq);
  }

  /* 页面离开（切 view）停流 */
  function exitScan() {
    scanSeq++; /* 失效在途异步续体 */
    stopScanTimer();
    if (window.ParentControls) ParentControls.close(true); /* 面板万一还开着：静默收起（不触发续扫钩子） */
    state.phase = 'idle';
    resumeOnVisible = false;
    pausedElapsed = 0;
    stopStream();
    if (window.MockCam) MockCam.stop();
    state.source = null;
    scanStage.classList.remove('mode-camera', 'mode-mock', 'panel-open');
  }

  /* ---------- 后台自动停流省电；回前台从头重扫 ---------- */
  function onVisibilityChange() {
    if (state.view !== 'scan') return;
    if (document.hidden) {
      if (state.phase === 'scanning') {
        stopScanTimer(); /* 后台自动停扫描（PLAN 决策 6） */
        state.phase = 'idle';
        resumeOnVisible = true;
      } else if (state.phase === 'paused') {
        /* 面板开着切后台：静默收起（相机流已停、续扫无意义），回前台从头重扫 */
        if (window.ParentControls) ParentControls.close(true);
        state.phase = 'idle';
        pausedElapsed = 0;
        resumeOnVisible = true;
      }
      if (state.source === 'camera') stopStream(); /* 切后台自动停流 */
    } else if (resumeOnVisible) {
      resumeOnVisible = false;
      restartScan(); /* 相机流已停 → 重新取流；mock → 直接重启计时 */
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  /* ---------- 结果分发（Stage 5）：父母面板单次锁定 + 随机 干净65%/发现35%（PLAN 固定决策 5） ---------- */
  function decideOutcome(part) {
    const forced = window.ParentControls ? ParentControls.getForced() : null;
    if (forced === 'found' || forced === 'clean') return forced; /* 单次锁定（扫完由 finishScan 清） */
    return Math.random() < 0.65 ? 'clean' : 'found';
  }
  window.decideOutcome = decideOutcome; /* 暴露给自动化（同 window.go） */

  /* ---------- 按钮 ---------- */
  $('#btn-back').addEventListener('click', () => go('home'));        /* 取消扫描 */
  $('#btn-rescan').addEventListener('click', () => {
    if (state.view === 'scan') restartScan();
  });
  $('#btn-scan-change').addEventListener('click', () => go('home')); /* 换个部位 */
  $('#btn-again').addEventListener('click', () => go('scan'));       /* 再来一次 */
  $('#btn-change').addEventListener('click', () => go('home'));
  $('#btn-tips').addEventListener('click', () => {                   /* 看看怎么赶走它 / 卫生小妙招 */
    const tips = $('#result-tips');
    const open = tips.hidden;
    tips.hidden = !open;
    $('#btn-tips').setAttribute('aria-expanded', String(open));
  });

  /* ---------- Stage 5：父母面板与静音开关接线 ---------- */
  if (window.ParentControls) {
    ParentControls.bind({ open: pauseForPanel, close: resumeFromPanel });
  }
  if (window.ScannerAudio) ScannerAudio.attach($('#btn-sound'));
})();
