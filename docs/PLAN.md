# 儿童健康「逗趣扫描仪」— PLAN（DSH 实施用）

> 本文件面向 DSH headless 执行。DSH 看不到 Hermes 会话，一切以本文为准；与本文不符一律停在 `docs/NOTES.md` 记录，不要擅自改设计。

**Goal:** 父母逗小朋友玩的趣味「扫描仪」移动 Web App：手机后摄对着肚子/手/牙/眼睛扫几秒，卡通动画显示「有虫/有细菌」或「✨全干净」，提醒卫生习惯 / 正向表扬。手机浏览器流畅不卡，浏览器打开即玩。

**Architecture:** 纯前端单页静态站，无后端、无图像识别。`getUserMedia`(后摄) 实时画面底 + 扫描线/CSS 营造"扫描感"；计时 ~4s 后播一段卡通结果动画（Canvas + 内置 SVG 贴图）。父母可低调指定结果（教育工具，非纯随机）。可离线、可 PWA。

**Tech Stack:** 原生 HTML/CSS/JS（允许用 Vite 做 dev server 与打包，但最终产物须静态、无运行期 CDN 依赖）。动画轻量：扫描线 CSS；卡通层 Canvas2D 绘制 + 逐帧引用 SVG 贴图。音效用 WebAudio 合成（无音频文件）。

---

## 已定，不要改（Fixed decisions）

1. **纯本地资源**：所有 SVG 贴图、CSS、JS、图标本地化，运行期零外部请求（离线可用）。不做真实图像识别/后端。
2. **内置 SVG 贴图集（美术一致性）**：不靠联网抓图拼凑。仓库内建一套 `assets/svg/`，全部同一视觉风格（扁平圆润卡通、统一描边/配色 token），覆盖所需贴图（见下节清单）。先保证风格统一，后续才谈换。
3. **界面中文、低龄友好**；文案温和（"小虫虫要搬家啦，我们去洗手"），不恐怖不吓哭。
4. **父母控制结果**：扫描界面藏一个低调入口（小齿轮或长按 1.5s），可把"本次"锁定为 干净 / 发现 随机 之一。
5. **默认结果分布**：干净 ~65% / 发现 ~35%（避免总中招麻木）。
6. **性能目标**：移动端 ≥50fps；DPR 上限 2；页面离屏/后台自动停扫描；`prefers-reduced-motion` 降级。
7. **移动优先**，桌面可玩即可；相机不可用/被拒 → 自动降级到"纯卡通背景"模式（不显示相机仍可玩），便于无头与无相机测试。
8. 项目 git 仓库本地（不 push 远程，除非另说）；DSH 每完成一阶段 git commit（中文 message）。
9. 秘钥/隐私：无 API key；相机画面只在本地，绝不外发。

---

## 内置 SVG 贴图清单（Stage 1 产出）

`assets/svg/`，一个目录，风格 token 见 `docs/DESIGN.md`（由 Stage 1 写）。每部位需两种结局素材：

- 通用：`star.svg`(✨干净特效)、`sparkle.svg`
- `belly/`：`clean-belly.svg`(健康肚/无虫)、`worm.svg`(卡通小虫，可多只/动画用单只循环)
- `hands/`：`clean-hand.svg`、`germ.svg`(卡通细菌)
- `teeth/`：`clean-tooth.svg`(白净牙)、`cavity-germ.svg`(牙菌斑小虫)
- `eyes/`：`clean-eye.svg`、`foreign-body.svg`(可选，眼睛异物/提醒少揉眼)
- UI 图标：`camera.svg`、`gear.svg`(父母面板)、`scan-frame.svg`(准星)、`back.svg`、`sound-on.svg`/`sound-off.svg`

来源：可自绘；也可参考开源 CC/MIT 图标集（如 OpenMoji/Twemoji）风格但**须本地化、统一改色为项目 token**。禁止直接抓 B 站/抖音素材进仓库（版权+一致性）。

---

## 文件结构（最终形态）

```
kids-scanner/
├── index.html
├── styles.css
├── app.js            # 状态机 home→scan→result、部位选择、相机、计时、结果分发
├── scan-illusions.js # 扫描特效层（扫描线、进度、哔声触发）
├── canvas-art.js     # 结果动画层：Canvas 播放，引用 assets/svg 贴图
├── audio.js          # WebAudio：哔声 + 发现/干净 旋律，静音开关
├── controls.js       # 父母结果控制面板
├── mock.js           # 当 location 带 ?mock=1 或 getCamera 失败时，生成"假相机"画面用于无相机测试
├── manifest.webmanifest
├── sw.js
├── assets/svg/*      # Stage 1
├── docs/DESIGN.md    # 设计 token + 文案 + 验收（Stage 1 产出）
├── docs/PLAN.md      # 本文
└── docs/NOTES.md     # DSH 停/记录处
```

---

## Stages（每阶段提交 + 验证）

### Stage 1 — 仓库约定 + 设计 token + SVG 贴图集
**Objective:** 定一致的美术语言并落地贴图。
- 写 `docs/DESIGN.md`：配色 token（主色/健康绿/警示橙/描边/背景）、贴图风格规则（圆角/描边/扁平）、每部位文案词表（发现版+干净版）、父母面板交互说明。
- 产出 `assets/svg/` 全部贴图，风格统一。
**验证：** 打开 `assets/svg/` 任一贴图，视觉风格/描边/用色一致；清单无缺项；`git status` 干净并 commit。

### Stage 2 — 单页骨架 + home 界面 + 状态机
**Objective:** 可运行静态页，三个 view 可切。
- `index.html`/`styles.css`/`app.js`：`#view-home #view-scan #view-result`，`go(view)`；home 四个部位大按钮 + 标题"健康小卫士扫描仪"+ 提示"请爸妈陪同"。
- `mock.js`：`?mock=1` 时不请求相机，用 Canvas 画个模拟"人体部位"占位画面（肚子/手/牙/眼睛各自的示意），让无相机/无头环境也能走通全流程。
**验证：** `python3 -m http.server 8080`；访问 `http://localhost:8080/?mock=1`，能切到 scan 且画面非黑。commit。

### Stage 3 — 扫描界面 + 计时
**Objective:** 相机取流 + 扫描仪式感。
- scan view：`getUserMedia({video:{facingMode:'environment'}})`（失败或 `?mock=1` 用 mock）；`video object-fit:cover; transform:scaleX(-1); playsinline muted`；叠加扫描框(assets 的 scan-frame)+ 上下往返扫描线(CSS) + "正在扫描…别动" + 每 0.5s 哔声(audio.js) + 进度换词；约 4s 后调 `decideOutcome()`。
- 提供"重新扫描/取消/换部位"；后台自动停流省电。
**验证：** 手机 HTTPS/localhost 授权见实时画面 + 扫描线流畅；`?mock=1` 无头可走。commit。

### Stage 4 — 结果动画层（核心）
**Objective:** Canvas 播放部位×结局的卡通动画。
- `canvas-art.js playResult(part, outcome)`：背景用相机最后一帧或 mock 帧 + 叠加卡通。
  - 干净版：星星/sparkle 撒落 + 部位贴图 + "✨ 没有虫子，超干净！"
  - 发现版：部位贴图 + 对应"生物"贴图按路径蠕动/爬行（RAF，DPR 限 2，离屏暂停）
- 结束出"再来一次 / 换个部位 / 看看怎么赶走它"。
**验证：** `?mock=1` 手动触发 `playResult('belly','worm')` 能看到会动的虫、clean 有星星；不卡顿。commit。

### Stage 5 — 父母控制 + 音效打磨
**Objective:** 结果可控、体验收尾。
- `controls.js`：长按扫描界面 1.5s 或点齿轮 → 小面板选"这次干净 / 这次发现 / 随机"；选择回写 `decideOutcome`。
- `audio.js` 全量：扫描哔、发现(低沉 buzz)、干净(欢快上行)；静音开关存 localStorage。
- 结果措辞按 DESIGN.md 词表，温和。
**验证：** `?mock=1` 用齿轮强制"发现"，扫完稳定出虫非随机；静音可关。commit。

### Stage 6 — PWA + 收尾
**Objective:** 可"添加到主屏" + README 部署说明。
- `manifest.webmanifest`、`sw.js`(缓存静态)；meta 图标。
- `README.md`：本地运行、`?mock`、HTTPS/部署（GitHub/Cloudflare Pages 免费 HTTPS，getUserMedia 必需）、真机验证清单。
**验证：** 添加主屏可开、缓存生效；`git log` 每阶段一条。commit。

---

## 验收（总）
- [ ] 真机 iPhone Safari + 安卓 Chrome：授权 → 扫 → 两结局都出、流畅（≥50fps）
- [ ] `?mock=1` 全程可自动化走通（Hermes/无头验证用）
- [ ] 相机被拒 → 自动降级纯卡通模式，不白屏
- [ ] 父母指定结果生效
- [ ] 全部资源本地、无运行期外部请求（DevTools Network 验证：仅 localhost）
- [ ] 每一阶段已 commit；偏离记录在 docs/NOTES.md

## Hermes 侧（非 DSH 职责）
- 真机相机/感官/审美最终由 Hermes + 用户验收（DSH headless 无法授权相机，只能用 `?mock=1` 自测逻辑）。
- DSH headless 如有可用浏览器/preview 工具可自验 DOM/console；若不可用，DOM 层由 Hermes 用真实浏览器复核。

## 风险 / 开放项
- 卡通可爱度：靠统一 token + 内置 SVG；丑了整体替换 `assets/svg/` 即可，不动代码。
- 年龄段措辞由用户最后定稿（DESIGN.md 词表可改，改动仅文案不破坏结构）。
- 是否需要真检测：v1 明确不做（YAGNI）。
