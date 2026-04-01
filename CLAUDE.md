# ab-dotfiles

AI 驅動的開發環境統一管理工具 — 自動化技術棧偵測、Claude Code 技能庫生成、ZSH 環境配置。

## 技術棧

- **Node.js 18+ / pnpm** — 運行環境與包管理
- **@clack/prompts** — 交互式 CLI 引導
- **listr2** — 平行任務與進度展示
- **Anthropic Claude API** — AI 技術棧分類
- **GitHub API** — 倉庫分析與 ECC 同步

## 架構要點

1. **Pipeline 設計** — Fetch → Per-repo AI 分類（並行快取） → Taxonomy 查表 → 去重 → 決策執行
2. **三層快取策略** — Content-addressed AI + Awesome 索引 + ECC TTL 管理
3. **智能推薦** — 開發者畫像推斷 + 規則即時匹配 + 審計鏈
4. **模組化** — Claude Code 技能庫 + ZSH 配置 + Slack 通知

## 開發規範

- **分支命名** — `<type>/<TICKET>-<short-desc>`
- **Commit** — Conventional Commits，changeset 版本管理
- **發布** — `pnpm run release` 自動打 tag 並推送

## 常用指令

```bash
pnpm install         # 安裝依賴
pnpm run setup       # 互動式完整部署
pnpm run scan        # 技術棧掃描 + 技能庫生成
pnpm run doctor      # 環境診斷
```
