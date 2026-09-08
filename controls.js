/* ============================================================
   健康小卫士扫描仪 — controls.js
   Stage 5：父母面板（DESIGN §5）——低调双入口 + 底部抽屉。
   - 入口①：扫描画面右下小齿轮（gear.svg，约 36px、70% 不透明度，
     视觉权重低于扫描主体）
   - 入口②：扫描画面长按 1.5s（不抬起、不移动；容忍 12px 手抖）
   - 打开 = 调 app.js 注入的 open 钩子（停表 + 画面定格）；
     关闭 = close 钩子从冻结处续扫；静默收起（close(true)）不续扫，
     供后台切换/离场兜底
   - 三个单选：这次发现(橙) / 这次干净(绿) / 随机(蓝,默认)；
     选择即时生效 + 轻提示，只影响下一次扫描，
     扫完由 app.js 调 clearForced() 回落随机
   - 状态只存内存（刷新即清，不落盘，DESIGN §5）
   暴露 API：ParentControls.bind / open / close / isOpen /
             getForced / clearForced
   ============================================================ */
(() => {
  'use strict';

  /* 轻提示词表（DESIGN §5 仅示例 found 文案，其余自拟，登记在 NOTES） */
  const TOAST = {
    found: '下次扫描：发现小虫',
    clean: '下次扫描：超干净',
    random: '下次扫描：随机',
  };

  const HOLD_MS = 1500; /* 长按时长（DESIGN §5） */
  const MOVE_SLOP = 12; /* 「不移动」的手抖容差 px */

  let forced = null;  /* 'found' | 'clean' | null(=随机) */
  let openState = false;
  let hooks = null;   /* app.js 注入：{ open, close } */

  const overlay = document.getElementById('parent-overlay');
  const gearBtn = document.getElementById('btn-parent');
  const scanStage = document.getElementById('scan-stage');
  const toast = document.getElementById('parent-toast');
  const radios = Array.from(document.querySelectorAll('input[name="parent-force"]'));

  /* ---------- 对外 API ---------- */

  function bind(h) { hooks = h; }

  function isOpen() { return openState; }

  function getForced() { return forced; }

  function clearForced() { forced = null; } /* 扫完回落随机（app.js 调用） */

  function open() {
    if (openState) return;
    openState = true;
    syncRadios();
    toast.hidden = true;
    overlay.hidden = false;
    const checked = radios.find((r) => r.checked);
    if (checked) checked.focus();
    if (hooks && hooks.open) hooks.open(); /* 停表 + 定格 */
  }

  /* silent=true：不触发续扫钩子（后台切换/离场兜底用） */
  function close(silent) {
    if (!openState) return;
    openState = false;
    overlay.hidden = true;
    if (!silent && hooks && hooks.close) hooks.close(); /* 续扫 */
  }

  /* ---------- 选择：即时生效 + 轻提示 ---------- */
  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (!openState) return;
      forced = radio.value === 'random' ? null : radio.value;
      toast.textContent = TOAST[radio.value];
      toast.hidden = false;
    });
  }

  function syncRadios() {
    const v = forced || 'random';
    for (const radio of radios) radio.checked = radio.value === v;
  }

  /* ---------- 入口①：右下小齿轮 ---------- */
  gearBtn.addEventListener('click', open);

  /* ---------- 入口②：扫描画面长按 1.5s（不抬起、不移动） ---------- */
  let holdTimer = 0;
  let holdOrigin = null;

  function cancelHold() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = 0;
    holdOrigin = null;
  }

  scanStage.addEventListener('pointerdown', (e) => {
    if (openState || holdTimer) return;
    if (!e.isPrimary || e.target.closest('#btn-parent')) return; /* 齿轮自己走 click */
    holdOrigin = { x: e.clientX, y: e.clientY };
    holdTimer = setTimeout(() => {
      holdTimer = 0;
      holdOrigin = null;
      open();
    }, HOLD_MS);
  });
  scanStage.addEventListener('pointermove', (e) => {
    if (!holdOrigin) return;
    if (Math.hypot(e.clientX - holdOrigin.x, e.clientY - holdOrigin.y) > MOVE_SLOP) cancelHold();
  });
  scanStage.addEventListener('pointerup', cancelHold);
  scanStage.addEventListener('pointercancel', cancelHold);
  /* 移动端长按别弹系统菜单（触摸呼出由 CSS -webkit-touch-callout 关） */
  scanStage.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- 关闭：遮罩空白处 / 「收起」 ---------- */
  document.querySelector('.parent-mask').addEventListener('click', () => close());
  document.getElementById('btn-parent-close').addEventListener('click', () => close());

  window.ParentControls = { bind, open, close, isOpen, getForced, clearForced };
})();
