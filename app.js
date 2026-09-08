/* ============================================================
   健康小卫士扫描仪 — app.js
   Stage 2：三视图状态机 go(view)、部位选择、扫描源接线。
   - 文案/词表：docs/DESIGN.md §4（肚肚/小手/牙齿/眼睛）
   - ?mock=1 或相机失败 → mock.js 卡通画面（PLAN 固定决策 7）
   - 相机完整生命周期（后台停流、扫描仪式感）在 Stage 3 落实
   ============================================================ */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  /* 部位词表（DESIGN §4） */
  const PARTS = { belly: '肚肚', hands: '小手', teeth: '牙齿', eyes: '眼睛' };
  const DEFAULT_PART = 'belly';

  const state = {
    view: 'home',   /* home | scan | result */
    part: null,     /* belly | hands | teeth | eyes */
    source: null,   /* camera | mock | null */
    stream: null,   /* getUserMedia 的 MediaStream */
  };

  let scanSeq = 0; /* 扫描会话序号：防止快速进出扫描页时旧相机流晚到串台 */

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
  const btnMockDone = $('#btn-mock-done');

  /* ---------- 状态机 ---------- */
  function go(name) {
    if (!views[name]) return;
    if (state.view === 'scan' && name !== 'scan') exitScan();
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

    if (window.MockCam && MockCam.isEnabled()) {
      startMock();
      return;
    }

    startCamera().then(
      () => {
        if (seq !== scanSeq || state.view !== 'scan') { stopStream(); return; } /* 等流期间已离开/又进入 */
        state.source = 'camera';
        scanStage.classList.add('mode-camera');
      },
      (err) => {
        console.warn('[app] 相机不可用，自动切换卡通模式：', err && (err.name || err.message || err));
        if (seq !== scanSeq || state.view !== 'scan') return;
        scanNotice.hidden = false; /* 相机在休息～用卡通模式也能扫！ */
        startMock();
      }
    );
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia unavailable');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    state.stream = stream;
    camVideo.srcObject = stream;
    try {
      await camVideo.play();
    } catch (err) {
      stopStream();
      throw err;
    }
  }

  function stopStream() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    camVideo.srcObject = null;
  }

  function startMock() {
    state.source = 'mock';
    scanStage.classList.add('mode-mock');
    btnMockDone.hidden = false; /* 临时：mock 画面下才显示（Stage 3 移除） */
    MockCam.start(mockCanvas, state.part);
  }

  function exitScan() {
    scanSeq++;
    stopStream();
    if (state.source === 'mock' && window.MockCam) MockCam.stop();
    state.source = null;
    btnMockDone.hidden = true;
    scanStage.classList.remove('mode-camera', 'mode-mock');
  }

  /* ---------- 其余按钮 ---------- */
  $('#btn-back').addEventListener('click', () => go('home'));
  $('#btn-mock-done').addEventListener('click', () => go('result')); /* Stage 3 换成 ~4s 计时 */
  $('#btn-again').addEventListener('click', () => go('scan'));
  $('#btn-change').addEventListener('click', () => go('home'));
})();
