# ab-dotfiles

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
