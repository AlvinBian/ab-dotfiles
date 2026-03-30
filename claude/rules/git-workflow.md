---
name: git-workflow
description: >
  Git 分支命名、commit message 格式、PR 流程規範。
matchWhen:
  always: true
---

# Git Workflow 規範

- branch 命名：`<type>/<TICKET>-<short-desc>`（e.g. `feat/PROJ-1234-add-login`）
- commit message 格式：`<type>(<scope>): <subject>`（Conventional Commits）
- PR 前必須跑測試通過
- 禁止 force push 到 main / develop / master
