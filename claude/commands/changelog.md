---
name: changelog
description: >
  從 git log 自動生成人讀 CHANGELOG，按類型分組，過濾無意義 commit。
  Use when: "生成 changelog", "changelog", "release notes", "版本記錄", "發版說明".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# Changelog 生成

## Step 1 — 取得 commit 範圍

```bash
# 兩個 tag 之間
git log v1.0.0..v1.1.0 --oneline --no-merges

# 上次 tag 到現在
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges

# 指定日期範圍
git log --since="2024-01-01" --until="2024-01-31" --oneline --no-merges
```

## Step 2 — 分析與分組

讀取 commit messages，依 Conventional Commits 類型分組：

| 類型 | Changelog 區塊 | 顯示 |
|------|---------------|------|
| `feat` | ✨ 新功能 | ✅ |
| `fix` | 🐛 修復 | ✅ |
| `perf` | ⚡ 效能 | ✅ |
| `security` | 🔒 安全 | ✅ 優先 |
| `refactor` | 🔧 重構 | 可選 |
| `docs` | 📖 文件 | 可選 |
| `chore` | 依賴更新 | 只列重大 |
| `test` / `ci` | — | 跳過 |
| merge commit | — | 跳過 |
| `wip` / `temp` | — | 跳過 |

**過濾原則**：
- 跳過 `fix typo`、`minor fix`、`update`、`WIP` 等模糊 commit
- 合併相同功能的多個小 commit 為一條
- Breaking change 加 `⚠️ BREAKING` 標記

## Step 3 — 輸出格式

```markdown
## [v{版本}] - {日期}

### ⚠️ Breaking Changes
- {描述} — 遷移方式：{說明}

### ✨ 新功能
- {功能描述}（{commit hash 縮寫}）
- {功能描述}

### 🐛 修復
- {修復描述}
- {修復描述}

### ⚡ 效能
- {改善描述}

### 🔒 安全
- {安全修復}（建議盡快升級）

### 🔧 其他改善
- {重構/依賴更新}
```

## Step 4 — 後續選項

1. 寫入 `CHANGELOG.md`（prepend 到最前）
2. 產出 GitHub Release notes 格式
3. 產出 Slack 公告格式（呼叫 `/draft-slack`）
