# 腳手架方案規劃

> 狀態：規劃中，尚未實作

## 目標

把 ab-dotfiles 從 `git clone` + `pnpm run setup` 改為 `npx ab-dotfiles init` 一行命令初始化。

## CLI 命令

```bash
npx ab-dotfiles init                    # 互動式初始化
npx ab-dotfiles init --preset vue       # 預設快速初始化
npx ab-dotfiles update                  # 差異更新
npx ab-dotfiles doctor                  # 環境檢查
npx ab-dotfiles restore                 # 還原備份
npx ab-dotfiles scan                    # 掃描技術棧
```

## 目錄結構

```
bin/
  cli.mjs              # 入口：npx ab-dotfiles <command>
commands/
  init.mjs             # 初始化（現有 setup.mjs 改造）
  update.mjs           # 差異更新
  doctor.mjs           # 環境檢查
  restore.mjs          # 還原備份
  scan.mjs             # 掃描技術棧
templates/
  presets/
    vue.json           # Vue 生態預設
    react.json         # React 生態預設
    php.json           # PHP/Laravel 預設
    fullstack.json     # 全端預設
    minimal.json       # 最小安裝
```

## Preset 格式

```json
{
  "name": "Vue 生態",
  "stacks": ["vue", "nuxt", "pinia", "vitest", "typescript", "vite"],
  "agents": ["explorer", "reviewer", "coder", "tester", "deployer"],
  "commands": ["code-review", "test-gen", "pr-workflow"],
  "rules": ["code-style", "git-workflow"],
  "hooks": ["PostToolUse:Edit|Write", "PreToolUse:Edit|Write"]
}
```

## 實作階段

1. **Phase 1** — `bin/cli.mjs` 入口 + 子命令路由
2. **Phase 2** — Preset 系統 + `--preset` 快速模式
3. **Phase 3** — `update` 命令（差異更新）
4. **Phase 4** — npm 發布 + `npx` 支持
5. **Phase 5** — 自定義 preset（用戶可分享 .json）

## npm 發布

```json
{
  "name": "ab-dotfiles",
  "bin": { "ab-dotfiles": "bin/cli.mjs" },
  "files": ["bin/", "lib/", "templates/", "claude/", "stacks/"]
}
```
