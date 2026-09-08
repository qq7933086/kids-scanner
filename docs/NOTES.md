# NOTES — DSH 执行记录 / 偏离登记

> 按 `docs/PLAN.md` 约定：与计划不符的实现一律记录在此，不擅自改设计。

## Stage 2（单页骨架 + home + 状态机）

1. **相机失败降级路径提前接线**：本阶段任务明确要求"`?mock=1` **或相机失败**时走 mock 画布"，
   因此 `app.js` 已含最小 `getUserMedia({video:{facingMode:'environment'}})` 接线，失败时显示
   DESIGN §4 降级提示「相机在休息～用卡通模式也能扫！」并切 mock。完整的取流生命周期
   （后台自动停流、重新扫描复用流等）仍按计划留到 Stage 3 落实。
2. **临时按钮「模拟扫描完成」**：PLAN 要求 mock 模式"能走通全流程"（home→scan→result），
   但 scan→result 的 ~4s 计时属 Stage 3，故扫描视图加了一个仅在 mock 画面下显示的临时按钮
   （`hidden` 属性由 `app.js` 按 `state.source==='mock'` 控制）。**Stage 3 引入计时后移除。**
3. **本地验证工具链（不入库）**：`.pw-browsers/`（playwright chromium）、`.pw-verify.mjs`
   （53 项断言的自检脚本：文案/样式/交互流转/画布像素/console）、`.pw-shots/`（截图），
   均已加入 `.gitignore`。后续阶段可复用 `.pw-verify.mjs` 扩展断言。
4. mock 画面造型直接复用 Stage 1 贴图的 120×120 坐标与风格（DESIGN §3），属实现方式，非偏离。

其余严格按 PLAN Stage 2 与 DESIGN token/文案执行，无其他偏离。

## Stage 3（扫描界面 + 计时）

1. **Stage 2 临时按钮已按约移除**：「模拟扫描完成」按钮（index.html / styles.css / app.js）随 ~4s 计时
   引入而删除，自检脚本加了"按钮不存在"断言防回归。
2. **扫描页操作按钮文案为自拟（词表空白处）**：PLAN Stage 3 要求提供"重新扫描/取消/换部位"，但
   DESIGN §4 词表没有扫描页按钮文案，故自拟「重新扫描」「换个部位」（后者沿用结果页用词），
   「取消」由左上返回箭头（`back.svg`，aria-label 返回首页）承担。改词时只动这两处文本即可。
3. **后台回来后从头重扫（非续扫）**：PLAN 决策 6 只说"离屏/后台自动停扫描"，未定恢复策略。取最简
   实现：`visibilitychange` 隐藏时停计时 + 相机停流；回前台重新取流并从 0s 重扫（mock 源则直接重启
   计时）。已无头验证：后台进度词冻结、回前台归零、到点自动进 result。
4. **取流复用边界**：「重新扫描」复用活流（`readyState==='live'` 即不再 getUserMedia）；离开 scan
   view（含扫完自动进 result）一律停流——所以结果页「再来一次」会重新取流（授权已缓存，代价小）。
   这是"页面离开停流"的直接推论，非偏离，记录在此供后续阶段知悉。
5. **decideOutcome(part) 本阶段恒返回 `'clean'`**（默认干净），结果存 `state.outcome` 供 Stage 4
   消费；随机 ~65%/~35% 与父母锁定按计划留到 Stage 5。另暴露 `window.decideOutcome` 供自动化
   （同 `window.go` 先例）。
6. **哔声细节**：扫描开始后每 0.5s 一声（0.5s~3.5s 共 7 声，880Hz 正弦 ~70ms，音量克制）；
   AudioContext 在部位按钮的点击手势里同步 `unlock()`（浏览器自动播放策略要求手势解锁）。
   Stage 5 再补发现/干净旋律与静音开关。
7. **工具链备注**：无头 chrome-headless-shell 无音频设备时 `new AudioContext()` 会同步阻塞约
   190ms（一次性，进扫描页时发生），不影响功能，Stage 5 打磨音效时注意。自检脚本已扩到 84 项
   断言（计时到点自动进 result / 三档换词 / 哔声计数 / 重扫归零 / 后台冻结与恢复 / 离场画布冻结 /
   停流接线静态检查）。本阶段会话内 browser_* 工具因 `~/.cache` 只读无法启动浏览器，前端复核由
   同版本 chromium 的 playwright 脚本完成（截图在 `.pw-shots/`，不入库）。

其余严格按 PLAN Stage 3 与 DESIGN token/文案执行，无其他偏离。

## Stage 4（结果动画层 canvas-art.js）

1. **`?outcome=found|clean` 测试参数（临时桥接）**：PLAN Stage 4 验证要求"`?mock=1` 两种结局都能
   自动走到并播放对应动画"，但随机 ~65%/~35% 与父母锁定按计划属 Stage 5，Stage 3 的
   decideOutcome 恒返回 clean。故本阶段给 decideOutcome 加最小测试钩子：URL 参数强制结局
   （无参数仍默认 clean）。**Stage 5 接入父母面板后应移除或并入面板逻辑。**
2. **双层 canvas 架构（实现方式，非设计偏离）**：PLAN 只说"Canvas 播放"。实测无头软件渲染下，
   单画布每帧对定格帧做 cover 重采样（~110 万像素）会掉到 ~16fps；拆成"背景定格层（静态，
   仅 resize 时重绘一次）+ 动画层（clearRect + 小贴图，RAF 每帧）"后单帧绘制 ~1.2ms。
   sparkle 的闪烁改用透明度脉动而非尺寸脉动（避免 SVG 贴图逐帧重栅格化）。
3. **相机定格帧按预览同向镜像**：scan 视频预览带 `transform:scaleX(-1)`（Stage 3 约定），
   截帧时同样镜像，保证结果页定格与扫描页所见连续。mock 帧无此问题。
4. **手动触发兼容（PLAN 验证示例）**：`window.playResult` 暴露（同 `window.go` 先例）；
   outcome 除 `clean|found` 外收生物名别名（`worm/germ/cavity/cavity-germ/foreign-body`），
   兼容 PLAN 的 `playResult('belly','worm')` 调用方式；手动触发时若无定格帧，会从 mock
   画布位图补截（mock 停画后位图仍在，但相机流停后 video 不可靠，故正常流程由 app.js
   在停流前调用 `ResultArt.captureBackground()` 截帧）。
5. **揭示时机**：PLAN"结束出按钮"具体化为动画主段 ~2.6s 后揭示主/副文案卡 + 三按钮
   （320ms 上滑入场）；`prefers-reduced-motion` 下取动画 1.4s 时刻画一张静帧构图并立即揭示。
6. **自检脚本 `.pw-verify.mjs` 84→130 项（不入库）**：Stage 2 的 result 占位断言
   （"扫描完成！"标题/两按钮）随占位移除演进为 Stage 4 词表断言；eyes 眼白像素采样改
   两次取最大并将 Stage 2 遗留阈值 8%→7%（mock 眨眼/眼珠转动下实测满开 7.6%~9% 波动，
   8% 贴边抖动，两处均为测试脚本修正、非应用改动）；各场景页用完即
   `close()`——同一浏览器里多页的结果动画 RAF 会互相抢占软件渲染（实测 44fps→16fps）。
   另：本轮 chromium 启动还需
   `LD_LIBRARY_PATH=.pw-browsers/_libs/extracted/usr/lib/x86_64-linux-gnu`
   （缺 libnspr4/libnss3，Stage 3 未记录此细节）。
7. **帧率断言为相对值**：无头软件渲染（SwiftShader）下绝对帧率随 VM 负载在 16~63fps 波动
   （home 静页 63、mock 扫描动画 33~58、结果动画 16~44），绝对阈值不可靠。改为
   "动画进行中 ≥ 同页停播基线的 40% + 绝对下限 15fps"（实测动画 36~40fps / 停播 62fps）。
   draw 单帧耗时 ~1.2ms（clearRect 0.07 + 色罩 0.03 + 贴图 1.1），真机 60fps 有充足余量。
8. 本阶段会话 browser_* 工具依旧不可用（`~/.cache` 只读挂载，Stage 3 已记录），视觉复核由
   同版本 chromium 的 playwright 完成：布局断言（舞台/文案卡/按钮/小妙招的几何关系与
   DPR=2 位图尺寸）+ 截图存 `.pw-shots/`（不入库）。已无头验证：两结局自动走通、四部位
   found 生物齐全、词表文案/语义色严格对齐 DESIGN、console 零错误零失败请求。

其余严格按 PLAN Stage 4 与 DESIGN token/文案执行，无其他偏离。

## Stage 5（父母控制 + 音效打磨）

1. **`?outcome=` 测试钩子已按约移除**（Stage 4 登记项 1 的收尾）：decideOutcome 改为
   「父母面板单次锁定 + 随机 干净65%/发现35%」（PLAN 固定决策 5）。自动化验证改经
   父母面板锁定结局（与 PLAN Stage 5 验证「用齿轮强制『发现』，扫完稳定出虫非随机」
   一致），Stage 4 的 found/clean 两结局断言全部保留，仅锁定方式从 URL 参数换成面板。
2. **面板轻提示文案为自拟（词表空白处）**：DESIGN §5 只给了 found 的示例「下次扫描：
   发现小虫」，clean/随机 两句自拟为「下次扫描：超干净」「下次扫描：随机」
   （"超干净"取自 PLAN Stage 4 的干净版描述「✨ 没有虫子，超干净！」）。
3. **静音开关位置 DESIGN 未指定**：放在扫描页头部右侧（icon-btn 样式，与左上返回键
   对称）——扫描页是第一个出声的页面（0.5s 起哔声），爸妈陪同扫描时顺手可及；首页/
   结果页暂不放，要挪只动 index.html 一处按钮。localStorage key `kids-scanner:sound`
   （'on'/'off'），初始默认开；重新开声时哔一声作确认。
4. **长按「不移动」实现为 12px 容差**：真机手指微抖必然超 0px，取 12px 抖动容差；
   同时拦掉扫描画面的 contextmenu 与 iOS 触摸呼出（-webkit-touch-callout: none），
   避免长按 1.5s 被系统菜单/选择打断。
5. **定格实现**（DESIGN §5「打开时扫描计时暂停、画面定格」的具体化）：mock 源给
   MockCam 加 pause()/resume()（只停/续 RAF、位图留驻，与 stop() 的整装拆除区分）；
   相机源直接 video.pause()/play()（预览帧冻结，流不断）；扫描线走 CSS
   `animation-play-state: paused`。计时段：打开时记下已扫时长并停表，关闭时
   scanT0 回拨从冻结处续扫（哔声档位不重播）。
6. **面板开着切后台的兜底**（DESIGN 未覆盖）：取「静默收起 + 回前台从头重扫」
   （沿用 Stage 3 登记项 3 的回前台策略）——切后台时相机流已停、续扫无意义，
   close(true) 不触发续扫钩子，回前台 restartScan 归零重扫；panel-open 定格类
   由 restartScan/exitScan 兜底清除。
7. **锁定跨「取消」保留**：「只影响下一次扫描」理解为下一次**完成**的扫描——选完
   锁定后又按返回取消，锁定保留给再下一次扫描（纯内存态，刷新即清，符合
   DESIGN §5 不落盘）。decideOutcome 只读锁定（getForced），回落由 finishScan 的
   clearForced() 完成，保证测试/控制台反复调用 decideOutcome 不吃掉锁定。
8. **结局旋律时点与参数自拟**：进结果视图即播（动画开场=结局揭晓，色罩/生物/星星
   同步进场）；发现=两声低沉下滑锯齿 buzz（150→118、110→84Hz，520Hz 低通滤软，
   呼应「温和的惊讶」），干净=C5·E5·G5｜A5·C6(长音) 三角波上行两段。
9. **抽屉细边取 2px**：DESIGN §5 写「--ink 细边」，全站卡片语言是 3px（--border-w），
   此卡特意取 2px 以示「轻」，圆角按规范 20。
10. **自检脚本 .pw-verify.mjs 130→约 180 项（不入库）**：新增面板双入口（齿轮/长按
    1.5s，含提前抬起取消、12px 容差内微移不取消）、打开停表定格三件套（进度词/
    扫描线 play-state/画面像素）、三种选择的锁定值与提示、锁定跨取消保留、扫完
    自动回落、随机 300 次分布（55%~75% 容差）、点遮罩关闭与续扫、真出声探针
    （包 createOscillator 计数验证哔/两旋律/静音静默）、静音跨刷新持久化、
    console 零错误。本阶段会话 browser_* 工具仍不可用（~/.cache 只读，Stage 3
    已记录），前端复核继续由同版本 chromium 的 playwright 脚本完成。

其余严格按 PLAN Stage 5 与 DESIGN §5 执行，无其他偏离。

## Stage 6（PWA + 收尾）

1. **应用图标为自拟构图（PLAN 留白处）**：PLAN 只说"meta 图标、可用现有贴图或简单生成
   assets/icon 系列"。实现：新建两个 SVG 源——`assets/icon.svg`（`--primary` 圆角方底
   rx28 + 放大 1.18 倍复用 `star.svg` 主角星；品牌记号＝「扫描后干干净净」的主角星）与
   `assets/icon-maskable.svg`（同底满铺 + 星缩至 80%，主体落在 maskable 安全区内切圆里），
   再经无头 chromium 按目标像素元素截图（`omitBackground` 保住圆角外透明）栅格化出
   `icon-192/512.png` + `icon-maskable-192/512.png` 四张入库；像素级验证过
   蓝底(77,166,232)/黄星(255,209,102)/圆角透明。按 DESIGN「新增贴图须登记」约定，
   在 DESIGN.md 新增 **§3.2 应用图标** 登记；生成脚本一次性用完即删（重生成方式
   §3.2 有说明）。
2. **manifest 细节自拟（PLAN 只定了应用名/图标/display/theme token）**：short_name
   「小卫士扫描仪」（≤12 字符）、lang zh-CN、description 自拟、`start_url`/`scope`
   均 `'./'`（全部相对路径，GitHub Pages 子路径可直接部署）；theme_color 与
   background_color 都取 `--paper #FFF7EC`（与既有 `meta theme-color` 一致，开屏与
   页面底色连续）；**未加 `orientation`**——平板横屏也能玩，不做过度约束。
3. **SW 策略（PLAN 只说"缓存静态、版本化管理"）**：`VERSION` 常量进缓存名
   （`kids-scanner-v1`），install 预缓存 31 项（页面/5 个 JS/CSS/manifest/4 图标/
   16 贴图），activate 删一切非当前版本缓存 + `clients.claim()` 立即接管，install
   `skipWaiting()`；fetch 只拦同源 GET，一律 cache-first，导航请求 `ignoreSearch`
   （`?mock=1` 离线也能开），未命中回源并顺手入缓存（只缓 2xx）。预缓存同时列
   `'./'` 与 `'./index.html'`：同一份内容占两个键（~7KB 冗余），换直链打开也命中。
4. **SW 注册写在 index.html 内联脚本**：PLAN 文件结构没给注册留新文件，为 5 行代码
   单开 `sw-register.js` 不值；`'serviceWorker' in navigator` 判空后静默跳过——
   真机用 `http://内网IP` 直连测试时（非安全上下文）不会刷 console 错误，README
   已提醒相机与 SW 都需要 HTTPS/localhost。
5. **「添加到主屏」无头无法验**（PLAN Stage 6 验证项）：headless 装不了 PWA，
   offline/预缓存已无头验透（见下），主屏图标/独立窗口留给 README 的真机验收
   清单与 Hermes 侧（PLAN「Hermes 侧」节职责）。
6. **自检脚本 199→232 项（不入库）**：新增 manifest 合法性（字段/图标四件套为真 PNG
   且 IHDR 尺寸与声明一致/图标像素构图 token 色）、head 接线（manifest/SVG icon/
   apple-touch-icon/theme-color/viewport）、SW 注册接管（controller 指向 ./sw.js）、
   预缓存 31 项逐项命中、伪造 `kids-scanner-v0` 旧缓存→重装→activate 行为级清除、
   受控重开后 26/26 子资源含导航文档 `transferSize=0`、`context.setOffline(true)`
   断网重开全流程（齿轮/长按两入口 × 发现/干净两结局 + console 零错 + 零失败请求）、
   全程零外部请求（page request 全同源，场景一同步加了此断言）。browser_* 工具本
   会话依旧不可用（`~/.cache` 只读，Stage 3 已记录），前端复核仍由同版本 chromium
   的 playwright 完成。
7. **README 的 vite 说法**：项目无 package.json，`npx vite` 是零配置静态伺服
   （PLAN 技术栈本就允许 vite 只当 dev server），不是构建依赖，产物仍是纯静态。

其余严格按 PLAN Stage 6 与 DESIGN token 执行，无其他偏离。
