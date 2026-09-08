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
