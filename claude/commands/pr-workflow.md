---
name: pr-workflow
description: >
  KKday PR 生命週期：分支 → commit → PR 描述 → 發 PR。
  Use when: (1) "發 PR", "open PR", "PR", "pull request",
  (2) "commit", "開分支", "create branch", "PR 描述".
metadata:
  author: Alvin Bian
  version: 3.0.0
---

# PR Workflow

## 1. 準備：取得 Jira Ticket 與 base branch

```bash
BRANCH=$(git branch --show-current)
TICKET=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
echo "Ticket: ${TICKET:-無}"
BASE=$(git branch -r | grep -oE 'origin/(develop|main)' | head -1 | sed 's/origin\///')
echo "Base: ${BASE:-main}"
```

## 2. 建立分支

`git checkout -b {type}/{TICKET}-{desc}`

type: `feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `perf`

## 3. Commit（Conventional Commits）

```
{type}({scope}): {description}

{body - 說明 why，不是 what}

{TICKET}
```

## 4. 產出 PR 描述

```bash
git diff ${BASE}...HEAD --stat
git log ${BASE}...HEAD --oneline
cat .github/pull_request_template.md 2>/dev/null
```

PR 描述輸出到 `pr-description.md`，包含：
- **Why**：解決什麼問題 / 對應 Jira ticket
- **What**：主要變更摘要
- **How to test**：驗證步驟
- **Checklist**：型別檢查 / 測試 / lint / console.log 清理

## 5. 發 PR

```bash
gh pr create \
  --title "{type}({scope}): {desc} [{TICKET}]" \
  --body-file pr-description.md \
  --base ${BASE} \
  --repo kkday-it/{repo}
```

## 6. 自我 checklist

- [ ] `pnpm check:type` / `php -l` 無錯
- [ ] ESLint / Prettier 無錯 | 測試通過 | 無 `console.log`
- [ ] Jira ticket 已關聯 | Changeset 已建立（b2c-web）
- [ ] PR 描述填寫完整
