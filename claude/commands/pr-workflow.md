---
name: pr-workflow
description: >
  PR 全流程：分支 → commit → PR 描述 → 發 PR。
  Use when: "發 PR", "open PR", "pull request", "commit", "開分支", "create branch".
metadata:
  version: 1.0.0
matchWhen:
  always: true
---

# PR Workflow

## 1 — 準備

```bash
BRANCH=$(git branch --show-current)
TICKET=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
BASE=$(git branch -r | grep -oE 'origin/(develop|main)' | head -1 | sed 's/origin\///')
echo "Branch: $BRANCH | Ticket: ${TICKET:-N/A} | Base: ${BASE:-main}"
```

## 2 — 建立分支

格式：`{type}/{TICKET}-{desc}`

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修復 |
| `refactor` | 重構 |
| `chore` | 雜項 |
| `docs` | 文件 |
| `test` | 測試 |
| `perf` | 效能 |

## 3 — Commit（Conventional Commits）

```
{type}({scope}): {description}

{body — 說明 why，不是 what}

{TICKET}
```

## 4 — PR 描述

```bash
git diff ${BASE}...HEAD --stat
git log ${BASE}...HEAD --oneline
cat .github/pull_request_template.md 2>/dev/null
```

輸出 `pr-description.md`：
- **Why** — 解決什麼問題 / 對應 ticket
- **What** — 主要變更摘要
- **How to test** — 驗證步驟
- **Checklist** — 型別檢查 / 測試 / lint / console.log

## 5 — 發 PR

```bash
gh pr create \
  --title "{type}({scope}): {desc} [{TICKET}]" \
  --body-file pr-description.md \
  --base ${BASE}
```

## 6 — 自我 Checklist

- [ ] 型別檢查通過（`tsc --noEmit` / `php -l`）
- [ ] Lint + Prettier 無錯
- [ ] 測試通過，無 `console.log`
- [ ] PR 描述完整，ticket 已關聯
