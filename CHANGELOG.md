# ab-dotfiles

## 2.1.0

### New Features

- **Gmail 5-Tier 分級系統** — clasp + Google Apps Script 自動建立郵件分級 filter，5 個等級含顏色標籤、星號、封存動作，支援追溯分類已有郵件
- **`pnpm run status`** — 配置健康狀態 CLI，顯示所有已安裝項目的完整度
- **`pnpm run flow`** — 9 張互動式流程圖，瀏覽器開啟，支援 panzoom 縮放拖動
- **多組織同時選取** — repo 選擇支援跨多個 GitHub 組織 / 個人帳號同時操作
- **`@chief-of-staff` agent** — 跨 agent 任務協調與排程，目前共 14 個 agents
- **版本號動態化** — APP_VERSION 從 package.json 讀取，不再硬編碼
- **未完成 session 偵測** — crash 後重入自動提示恢復上次 session
- **CLAUDE.md 並行生成** — Promise.all 並行，加速多 repo 場景

### Config Protection

- **~/.zshrc 個人設定自動遷移** — 覆蓋前自動提取個人設定到 `~/.zshrc.local`，永不覆蓋
- **~/.ripgreprc skip-if-exists** — 已有設定不覆蓋
- **auto-update.sh 同步** — 更新腳本加入 `.zshrc.local` 遷移邏輯
- **備份範圍擴充** — 新增 `keybindings.json`、`.zshrc.local`、`.ripgreprc`
- **三層保護** — 原始備份 → 增量備份 → smart deploy（skip / never-overwrite）

### Bug Fixes

- 80+ bugs fixed across 5 rounds of 10-agent review
- BACK symbol 在 install pipeline 中正確傳播
- shell injection 修復（ghSync、doctor.mjs、slack-setup）
- Gmail：標籤顏色、重複 filter 去重、batchModify、V8 runtime、ICS 語法
- phase-execute / phase-complete null guards
- env.mjs `_loaded` flag、`parseInt('0')`、quote matching
- session `saveSession` try/catch、`updateSessionProgress` 首次執行
- keybindings 移除不部署（避免衝突）

### Performance

- `AI_CONCURRENCY = Infinity`（Claude CLI 自行處理 rate limiting）
- `GH_CONCURRENCY = 8`（防止 GitHub API 403）
- CLAUDE.md Promise.all 並行生成

---

## 2.0.0

### Major Changes

- [#2](https://github.com/AlvinBian/ab-dotfiles/pull/2) — v2.0.0 全面重構

  ### 破壞性變更

  - 安裝流程從 14 步互動縮減為 **3 步自動化**（選 repos → 確認計畫 → 安裝）
  - `lib/` 目錄重組為分組架構（`core/` `detect/` `cli/` `config/` `external/` `slack/` `phases/`）
  - `ui/` 目錄重命名為 `cli/`，所有 UI 元件路徑更新
  - `lib/utils/` 合併至 `lib/core/`（`paths.mjs`、`concurrency.mjs`）
  - `lib/github.mjs` 移至 `lib/external/github.mjs`
  - `lib/claude-cli.mjs` 移至 `lib/external/claude-cli.mjs`
  - `lib/doctor.mjs` 移至 `lib/detect/doctor.mjs`
  - `lib/source-sync.mjs` 移至 `lib/external/source-sync.mjs`
  - `lib/ai-generate.mjs` 移至 `lib/external/ai-generate.mjs`
  - `lib/report.mjs` 保留原位
  - Rules 中 `kkday-conventions` 重命名為 `project-conventions`

  ### 新功能

  - **功能選擇 multiselect** — 用戶可選擇安裝 claude / claudemd / ecc / slack / zsh，未選的跳過
  - **角色分配選單** — ⭐主力 / 🔄臨時 / 🔧工具，支援互動調整
  - **fd 全自動 repo 偵測** — 三策略（fd + git remote → 文件夾映射 → Spotlight），無需手動輸入路徑
  - **CLAUDE.md AI 生成** — 按角色生成到 `~/.claude/projects/{path}/CLAUDE.md`
  - **Slack P0/P1/P2 分級通知** — 透過 Claude CLI MCP，不需 Bot Token
  - **Slack 互動設定精靈** — Channel / DM / 關閉三種模式
  - **listr2 進度顯示** — 8 步安裝任務，含子任務和計時
  - **首次安裝原始備份** — `pnpm run restore-original` 可完全還原
  - **卸載工具** — `pnpm run uninstall` 只移除 ab-dotfiles 管理的配置
  - **hooks 互動管理** — `pnpm run hooks` 啟用/停用個別 hook
  - **ECC 繁體中文描述** — 60+ 項目完整翻譯，runtime 讀取 + 快取
  - **安裝計畫 inline 摘要** — 網格排列，含現有安裝狀態對比
  - **Report 專案 Tab** — Repos + 專案合併，含角色、路徑、CLAUDE.md 狀態

  ### 架構重構

  - **lib/ 重組** — 從扁平結構改為 7 個功能分組目錄
  - **Phase 模組** — `phase-analyze` / `phase-plan` / `phase-execute` / `phase-complete`
  - **lodash-es 全面優化** — 取代手寫的 array/object 操作
  - **完整 JSDoc 中文註釋** — 所有 lib/ 模組補充完整 @param / @returns 文件

  ### 效能優化

  - 分析快取 key 改為 `repos + 角色`，角色沒變就不重跑 AI
  - lodash-es `countBy` / `sumBy` / `orderBy` 取代手寫迴圈
  - 背景預熱 Claude CLI 減少首次呼叫延遲

  ### UX 改善

  - 重入流程：上次安裝記錄顯示 repos 數 + stacks 數 + 日期
  - 「調整設定」清除 org 讓用戶重選組織
  - 「重新安裝」等同 --quick，直接用上次 session
  - 所有排序統一為 ⭐主力 → 🔄臨時 → 🔧工具

## 1.1.0

### Minor Changes

- [#1](https://github.com/AlvinBian/ab-dotfiles/pull/1) [`fb30605`](https://github.com/AlvinBian/ab-dotfiles/commit/fb30605941898f1e74685b107e8904b0f415bab2) Thanks [@AlvinBian](https://github.com/AlvinBian)! - ## v1.1.0 — 互動體驗重構 + 報告系統 + 模組拆分

  ### 新功能

  - **互動式多維度報告** — Tab 導航 + 5 張圖表 + 搜索過濾
  - **ECC 繁體中文翻譯** + AI 自動翻譯快取
  - **Session 記憶** — 全步驟選擇記憶恢復，續裝直接跳到執行
  - **smartSelect** — 帶編號+繁中描述的完整列表，ESC 回退上一步
  - **開發者畫像** — emoji 標示 + p.note 框顯示
  - **Changesets 版本管理** + /changeset 自動生成指令

  ### 架構重構

  - **setup.mjs 拆分** — 4 個 phase 模組（intent → analysis → execute → report）
  - **ui.mjs 拆分** — files / preselect / progress / prompts 四個子模組
  - **install 拆分** — build-plugin / common / hooks-merge / install-claude / install-modules / manifest
  - **repo-select** — 合併倉庫選擇為一步
  - **stacks** — 生成的 stacks 移到 .cache/stacks/

  ### 效能優化

  - ECC 推薦改規則匹配（即時）取代 AI 呼叫（30-90s）
  - 合併推薦+翻譯為單一 AI 呼叫
  - 背景預熱 Claude CLI，減少延遲
  - 畫像不阻塞 + 翻譯背景化

  ### UX 改善

  - ESC 回退 + 連續滾動取代分頁
  - 全面消除多餘空行
  - 備份加 spinner + 安裝選擇後加狀態提示
  - 報告圖表動態高度 + containLabel 自適應

  ### Claude 擴充

  - 新增 agents: migrator / perf-analyzer / security
  - 新增 commands: build-fix / changeset / e2e / multi-frontend / refactor-clean / simplify / tdd / test-coverage
  - 新增 rules: kkday-conventions / performance / testing
