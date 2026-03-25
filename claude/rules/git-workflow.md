# Git Workflow 規範

- branch 命名：`<type>/<JIRA-TICKET>-<short-desc>`（e.g. `feat/VM-1234-add-login`）
- base branch：b2c-web 用 `develop`，member-ci 用 `develop`
- commit message 格式：`<type>(<scope>): <subject>`（Conventional Commits）
- PR 前必須跑測試通過
- 禁止 force push 到 main / develop / master
