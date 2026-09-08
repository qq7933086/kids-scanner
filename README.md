# 健康小卫士扫描仪 🌟

爸妈逗小朋友玩的趣味「健康扫描仪」移动 Web App：用手机后摄对着**肚肚 / 小手 / 牙齿 / 眼睛**扫几秒，
卡通动画揭晓「有虫虫/有细菌」或「✨ 全干净」，顺便提醒一个马上能做的卫生小动作。

- **纯前端静态站**：无后端、无真实图像识别、零运行期外部请求（可离线，PWA）。
- **相机画面只在本地**：绝不上传、绝不外发，无任何 API key。
- **父母可控结果**：扫描界面藏了「爸妈小面板」，可把下一次结果锁定为 发现 / 干净 / 随机（教育工具，非纯随机）。
- **相机不可用也能玩**：被拒绝或无摄像头时自动降级为卡通画面模式。
- 技术栈：原生 HTML/CSS/JS + Canvas + WebAudio（音效为合成音，无音频文件）。设计规范见 `docs/DESIGN.md`。

## 本地运行

任选其一（**不要**直接双击 `index.html` 用 `file://` 打开：相机授权和 Service Worker 都要求 http/https）：

```bash
# 方式一：Python 自带静态服务器（推荐，零依赖）
python3 -m http.server 8080
# 打开 http://localhost:8080

# 方式二：Vite 当静态 dev server（无需任何配置/依赖安装）
npx vite
```

## 无相机测试（`?mock=1`）

无头环境、没有摄像头或不想授权相机时，加 `?mock=1` 打开：

```
http://localhost:8080/?mock=1
```

- 不请求相机，直接用 Canvas 画对应部位的卡通「假相机」画面，全流程可走通。
- 不加参数时：若相机授权被拒/不可用，会自动降级到同一卡通模式并提示「相机在休息～用卡通模式也能扫！」。

## 父母面板用法（控制下一次结果）

扫描界面里有**两个低调入口**（都在扫描页）：

1. 右下角小**齿轮**；
2. 在扫描画面上**长按 1.5 秒**（不抬起、不移动）。

打开后是一个底部小抽屉，三个选项：

| 选项 | 效果 |
|---|---|
| 这次发现 | 下一次扫描**必定**出「发现虫虫/细菌」结局 |
| 这次干净 | 下一次扫描**必定**出「✨ 干净」结局 |
| 随机（默认） | 干净 ~65% / 发现 ~35% |

- 只影响**下一次完成**的扫描，扫完自动回到随机；中途取消保留锁定。
- 纯内存态，不写 localStorage，刷新即清。
- 打开面板会暂停扫描计时、定格画面，关闭后从暂停处继续——不打断孩子的仪式感。

## 部署（必须 HTTPS）

`getUserMedia`（相机）只在**安全上下文**可用：`https://` 或 `http://localhost`。
所以部署到手机真机上玩，必须走 HTTPS。两个免费方案：

### GitHub Pages

1. 仓库 push 到 GitHub（仓库已是纯静态，无需构建）。
2. Settings → Pages → Source 选分支（如 `main` / root）→ Save。
3. 等几分钟访问 `https://<user>.github.io/<repo>/`。

> 项目内全部是相对路径（`./`、`assets/…`），子路径部署直接可用。

### Cloudflare Pages

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages → 连接 Git 仓库。
2. 构建命令留空，输出目录填 `/`（仓库根）。
3. 部署完成后得到 `https://<project>.pages.dev`（自动 HTTPS）。
   也可以不连 Git：`npx wrangler pages deploy .` 直接上传当前目录。

### 部署后真机验收清单

- [ ] **安卓 Chrome**：打开站点 → 授权相机 → 能看到实时画面 + 扫描线，扫描流畅不卡
- [ ] **iPhone Safari**：同上（若 iOS < 14.3，请直接用 Safari 打开而不是主屏图标——旧版 iOS 的主屏 WebApp 不支持相机）
- [ ] 菜单 →「安装应用 / 添加到主屏幕」→ 图标正确、独立窗口（standalone）打开
- [ ] 父母面板锁定「发现」→ 扫完稳定出虫虫；锁定「干净」→ 稳定出 ✨；随机两种都会出
- [ ] 拒绝相机授权 → 自动降级卡通模式，不白屏
- [ ] 断网 / 飞行模式后从主屏图标打开 → 仍可完整游玩（Service Worker 离线缓存）
- [ ] DevTools Network 面板：全部请求同源（无任何外部 CDN/请求）
- [ ] 静音开关生效且刷新后记住；切后台自动暂停扫描

## 开发说明

```
index.html            # 单页三视图：home → scan → result
app.js                # 状态机、相机取流、~4s 计时、结果分发
mock.js               # ?mock=1 / 相机失败时的卡通"假相机"
canvas-art.js         # 结果动画层（Canvas + assets/svg 贴图）
audio.js              # WebAudio 合成音（哔声 + 两结局旋律 + 静音）
controls.js           # 父母面板（齿轮 / 长按 1.5s）
manifest.webmanifest  # PWA 清单（display: standalone，主题色 = --paper）
sw.js                 # Service Worker：预缓存全部静态资源
assets/svg/           # 内置贴图集（风格 token 见 docs/DESIGN.md）
assets/icon*          # 应用图标（源 SVG + PNG 系列，见 DESIGN §3.2）
```

- **发新版**：改了任何静态资源后，把 `sw.js` 里的 `VERSION` 加一（`v1` → `v2`），老用户下次打开自动换新缓存。
- 设计 token / 文案词表唯一真源：`docs/DESIGN.md`；执行记录与偏离登记：`docs/NOTES.md`；总计划：`docs/PLAN.md`。

## 验收总表

见 `docs/PLAN.md`「验收（总）」。无头自动化自检已覆盖：`?mock=1` 全流程（含父母面板、两结局动画）、
manifest 合法性、SW 注册与预缓存、离线打开全流程、console 零错误、零外部请求。
