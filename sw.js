/* ============================================================
   健康小卫士扫描仪 — sw.js（Stage 6：PWA 离线缓存）
   - 版本化管理：改任何静态资源后把 VERSION +1（旧缓存在新 SW
     activate 时自动删除）；VERSION 进缓存名，一换即整包换代。
   - install ：预缓存全部静态资源（页面/脚本/样式/贴图/图标/manifest）。
   - fetch   ：同源 GET 一律 cache-first（导航请求忽略查询串，
     ?mock=1 离线也能打开）；未命中回源并顺手入缓存。
   - activate：清掉非当前版本旧缓存 + claim 立即接管已开页面。
   ============================================================ */
(() => {
  'use strict';

  const VERSION = 'v1';
  const CACHE = `kids-scanner-${VERSION}`;

  /* 预缓存清单 = 全部静态资源（与仓库文件一一对应） */
  const PRECACHE = [
    './',
    './index.html',
    './manifest.webmanifest',
    './styles.css',
    './mock.js',
    './canvas-art.js',
    './audio.js',
    './controls.js',
    './app.js',
    './assets/icon.svg',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/icon-maskable-192.png',
    './assets/icon-maskable-512.png',
    './assets/svg/star.svg',
    './assets/svg/sparkle.svg',
    './assets/svg/camera.svg',
    './assets/svg/gear.svg',
    './assets/svg/scan-frame.svg',
    './assets/svg/back.svg',
    './assets/svg/sound-on.svg',
    './assets/svg/sound-off.svg',
    './assets/svg/belly/clean-belly.svg',
    './assets/svg/belly/worm.svg',
    './assets/svg/hands/clean-hand.svg',
    './assets/svg/hands/germ.svg',
    './assets/svg/teeth/clean-tooth.svg',
    './assets/svg/teeth/cavity-germ.svg',
    './assets/svg/eyes/clean-eye.svg',
    './assets/svg/eyes/foreign-body.svg',
  ];

  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })());
  });

  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    event.respondWith(cacheFirst(req));
  });

  async function cacheFirst(req) {
    /* 导航请求带查询串（如 ?mock=1）：忽略查询串也能命中 './' 预缓存 */
    const cached = await caches.match(req, req.mode === 'navigate' ? { ignoreSearch: true } : undefined);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./');
        if (fallback) return fallback;
      }
      throw err;
    }
  }
})();
