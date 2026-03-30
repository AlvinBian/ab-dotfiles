/**
 * 配置分類引擎 — 全局 vs 專案級
 *
 * 全局（~/.claude/）= 通用工具，任何專案都用
 * 專案（repo/.claude/）= 技術棧匹配，按角色深淺
 */

// ── 全局配置（通用，不依賴技術棧）──

export const GLOBAL_COMMANDS = [
  'code-review', 'pr-workflow', 'tdd', 'build-fix',
  'simplify', 'refactor-clean', 'changeset',
]

export const GLOBAL_AGENTS = [
  'coder', 'reviewer', 'tester', 'debugger',
  'planner', 'deployer', 'documenter', 'explorer',
]

export const GLOBAL_RULES = ['code-style', 'git-workflow']

// ── 專案級配置池（按角色篩選）──

export const PROJECT_COMMANDS = [
  'e2e', 'multi-frontend', 'test-coverage',
  'auto-setup', 'draft-slack', 'review-slack', 'slack-formatting',
]

export const PROJECT_AGENTS = [
  'security', 'migrator', 'perf-analyzer', 'monitor', 'refactor',
]

export const PROJECT_RULES = [
  'project-conventions', 'testing', 'performance', 'slack-mrkdwn',
]

// ── 角色閾值 ──

export const MAIN_REPO_MIN_COMMITS = 3

// ── 角色判定 ──

export function determineRole(repo) {
  if (repo.commits >= MAIN_REPO_MIN_COMMITS) return 'main'
  if (repo.commits > 0) return 'temp'
  return 'temp'
}

// ── 按角色生成專案配置 ──

export function getProjectConfig(role, detectedSkills = []) {
  switch (role) {
    case 'main':
      return {
        claudeMd: 'full',
        commands: PROJECT_COMMANDS,
        agents: PROJECT_AGENTS,
        rules: PROJECT_RULES,
        stacks: detectedSkills,
        hooks: true,
      }
    case 'temp':
      return {
        claudeMd: 'concise',
        commands: [],
        agents: [],
        rules: ['project-conventions'],
        stacks: [],
        hooks: false,
      }
    case 'tool':
      return {
        claudeMd: 'minimal',
        commands: [],
        agents: [],
        rules: [],
        stacks: [],
        hooks: false,
      }
    default:
      return { claudeMd: 'minimal', commands: [], agents: [], rules: [], stacks: [], hooks: false }
  }
}
