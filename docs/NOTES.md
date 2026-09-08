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
