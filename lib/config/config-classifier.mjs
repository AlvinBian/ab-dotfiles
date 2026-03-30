/**
 * 配置分類引擎
 *
 * 所有 commands/agents/rules 統一裝到 ~/.claude/（全局）
 * 只有 CLAUDE.md 按 repo 角色差異化 → ~/.claude/projects/{path}/
 */

// ── 全部配置（統一安裝到 ~/.claude/）──

export const ALL_COMMANDS = [
  'code-review', 'pr-workflow', 'tdd', 'build-fix',
  'simplify', 'refactor-clean', 'changeset',
  'e2e', 'multi-frontend', 'test-coverage',
  'auto-setup', 'draft-slack', 'review-slack', 'slack-formatting',
]

export const ALL_AGENTS = [
  'coder', 'reviewer', 'tester', 'debugger',
  'planner', 'deployer', 'documenter', 'explorer',
  'security', 'migrator', 'perf-analyzer', 'monitor', 'refactor',
]

export const ALL_RULES = [
  'code-style', 'git-workflow',
  'project-conventions', 'testing', 'performance', 'slack-mrkdwn',
]

// 向後兼容 upgrade.mjs 的 import
export const GLOBAL_COMMANDS = ALL_COMMANDS
export const GLOBAL_AGENTS = ALL_AGENTS
export const GLOBAL_RULES = ALL_RULES

// 舊版時這些是專案級（現在全部統一到全局，但 upgrade.mjs 需要知道舊的分類來清理）
export const LEGACY_PROJECT_COMMANDS = [
  'e2e', 'multi-frontend', 'test-coverage',
  'auto-setup', 'draft-slack', 'review-slack', 'slack-formatting',
]
export const LEGACY_PROJECT_AGENTS = [
  'security', 'migrator', 'perf-analyzer', 'monitor', 'refactor',
]
export const LEGACY_PROJECT_RULES = [
  'project-conventions', 'testing', 'performance', 'slack-mrkdwn',
]

// ── 角色閾值 ──

export const MAIN_REPO_MIN_COMMITS = 3

// ── 角色判定 ──

export function determineRole(repo) {
  if (repo.commits >= MAIN_REPO_MIN_COMMITS) return 'main'
  return 'temp'
}

// ── 路徑編碼（Claude Code 原生格式）──

export function encodeProjectPath(localPath) {
  return localPath.replace(/\//g, '-')
}

// ── CLAUDE.md 模板類型（按角色）──

export function getClaudeMdType(role) {
  switch (role) {
    case 'main': return 'full'    // AI 生成完整版
    case 'temp': return 'concise' // 靜態精簡模板
    default: return 'minimal'     // 一行描述
  }
}
