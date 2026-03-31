---
name: pr-workflow
description: >
  PR 全流程：分支建立 → commit → 自我 review → changeset → 發 PR → ready。
  Use when: "發 PR", "open PR", "pull request", "commit", "開分支", "create branch", "pr flow".
metadata:
  version: 2.0.0
matchWhen:
  always: true
---

# PR Workflow

## Phase 0 — 環境偵測

```bash
# 偵測當前狀態
BRANCH=$(git branch --show-current)
TICKET=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1)
BASE=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}')
BASE=${BASE:-$(git branch -r | grep -oE 'origin/(develop|main|master)' | head -1 | sed 's/origin\///')}
BASE=${BASE:-main}
DIRTY=$(git status --porcelain | wc -l | tr -d ' ')
STAGED=$(git diff --cached --stat | tail -1)
AHEAD=$(git rev-list --count origin/${BASE}..HEAD 2>/dev/null || echo 0)

echo "Branch : $BRANCH"
echo "Ticket : ${TICKET:-（未偵測到）}"
echo "Base   : $BASE"
echo "Dirty  : $DIRTY 個未提交變更"
echo "Staged : ${STAGED:-（無 staged）}"
echo "Ahead  : $AHEAD commits"
```

根據偵測結果決定從哪個 Phase 開始：
- 無 branch → Phase 1
- 有 branch 無 commit → Phase 2
- 有 commit 未發 PR → Phase 3
- 已有 PR → Phase 5

---

## Phase 1 — 建立分支

格式：`{type}/{TICKET}-{kebab-desc}` 或 `{type}/{kebab-desc}`（無 ticket 時）

| type       | 用途                    | 範例                           |
| ---------- | ----------------------- | ------------------------------ |
| `feat`     | 新功能                  | `feat/KBS-123-add-payment`     |
| `fix`      | 修復 bug                | `fix/KBS-456-login-crash`      |
| `refactor` | 重構，不改行為          | `refactor/cleanup-auth-module` |
| `chore`    | 依賴、設定、CI          | `chore/upgrade-vite-5`         |
| `docs`     | 文件                    | `docs/update-api-readme`       |
| `test`     | 測試補充                | `test/add-payment-unit-tests`  |
| `perf`     | 效能優化                | `perf/reduce-bundle-size`      |
| `hotfix`   | 緊急修復（直接從 main） | `hotfix/KBS-789-prod-crash`    |

```bash
git checkout ${BASE}
git pull origin ${BASE}
git checkout -b {type}/{TICKET}-{desc}
```

---

## Phase 2 — Commit

### 2.1 確認變更範圍

```bash
git diff --stat
git status
```

### 2.2 Conventional Commits 格式

```
{type}({scope}): {description}

{body — 說明 why，不是 what}
{空行}
{TICKET}
```

規則：
- description 用英文小寫動詞開頭（add / fix / update / remove）
- body 說明「為什麼這樣改」，不是「改了什麼」
- 有 ticket 一定要帶在最後一行
- 單一 commit 只做一件事，不混 feat + fix

範例：
```
feat(payment): add stripe webhook handler

Handle payment.succeeded and payment.failed events.
Previously these were silently dropped causing reconciliation issues.

KBS-123
```

### 2.3 執行 commit

```bash
git add -p  # 逐 hunk 確認，避免誤 commit
git commit -m "{message}"
```

---

## Phase 3 — 自我 Review（發 PR 前必做）

```bash
git diff ${BASE}...HEAD --stat
git log ${BASE}...HEAD --oneline
```

執行 `/code-review` 進行深度審查，確認：

- [ ] 無多餘的 `console.log` / `debugger` / `TODO`（未完成的）
- [ ] 型別檢查：`tsc --noEmit` 或 `php -l {files}`
- [ ] Lint：`pnpm lint` / `npm run lint`
- [ ] 測試：`pnpm test --run` / `npm test`
- [ ] 無敏感資訊（API key / 密碼 / 個人資料）
- [ ] 變更範圍符合 branch 名稱，無無關修改
- [ ] API 變更有通知相關團隊（BE/FE 同步）

有問題先修，修完再繼續。

---

## Phase 4 — Changeset（有版本管理的 repo）

偵測是否需要 changeset：

```bash
ls .changeset 2>/dev/null && echo "需要 changeset" || echo "跳過"
```

如果需要，執行 `/changeset` 自動生成。

---

## Phase 5 — 生成 PR 描述

```bash
# 收集資訊
git diff ${BASE}...HEAD --stat
git log ${BASE}...HEAD --oneline --no-merges
cat .github/pull_request_template.md 2>/dev/null || echo "（無 template）"
```

生成 `pr-description.md`，結構：

```markdown
## Why
<!-- 解決什麼問題 / 對應 ticket -->
{TICKET} — {一句話說明背景}

## What
<!-- 主要變更，bullet list -->
- 

## How to Test
<!-- 驗證步驟，讓 reviewer 能重現 -->
1. 

## Screenshots
<!-- UI 變更必填，API 變更可略 -->

## Checklist
- [ ] 型別檢查通過
- [ ] Lint / Prettier 無錯
- [ ] 測試通過
- [ ] 無 console.log / debugger
- [ ] PR 描述完整
- [ ] Ticket 已關聯
```

---

## Phase 6 — 發 PR

### 6.1 先發 Draft（大型 PR 建議）

```bash
gh pr create \
  --title "{type}({scope}): {desc}${TICKET:+ [$TICKET]}" \
  --body-file pr-description.md \
  --base ${BASE} \
  --draft
```

### 6.2 直接發 Ready

```bash
gh pr create \
  --title "{type}({scope}): {desc}${TICKET:+ [$TICKET]}" \
  --body-file pr-description.md \
  --base ${BASE}
```

### 6.3 Draft → Ready

```bash
gh pr ready
```

### 6.4 確認 PR 狀態

```bash
gh pr view --web  # 瀏覽器開啟確認
gh pr checks      # 確認 CI 狀態
```

---

## Phase 7 — Review 後修改循環

收到 review 意見後：

```bash
# 確認 review 意見
gh pr view --comments

# 修改後追加 commit（不要 force push，除非 reviewer 要求）
git add -p
git commit -m "fix: address review comments"
git push

# 回覆 review（在 GitHub 上 resolve conversation）
```

如果需要整理 commit history（squash）：

```bash
# 只在 reviewer 同意後才做
git rebase -i origin/${BASE}
git push --force-with-lease  # 比 --force 安全
```

---

## 快速參考

```bash
# 完整流程一覽
git checkout -b feat/KBS-123-desc     # Phase 1
git add -p && git commit -m "..."     # Phase 2
# /code-review                        # Phase 3
# /changeset                          # Phase 4（有需要）
gh pr create --draft ...              # Phase 6
gh pr ready                           # 確認後轉 ready
gh pr checks                          # 確認 CI
```
