/**
 * 自動決策引擎 — 根據 repos 分析結果生成完整安裝計畫
 *
 * 用戶只需選 repos，其他全自動決定。
 */

import {
  ALL_COMMANDS, ALL_AGENTS, ALL_RULES,
  determineRole, getClaudeMdType,
} from './config-classifier.mjs'

// ── 全局 hooks（8 個規則）──

const ALL_HOOKS = [
  'PostToolUse:Edit|Write (prettier)',
  'PostToolUse:Edit|Write (eslint)',
  'PreToolUse:Edit|Write (檔案保護)',
  'PreToolUse:Bash (危險命令攔截)',
  'SessionStart:compact (壓縮提示)',
  'Stop (任務完成檢查)',
  'Notification (macOS 通知)',
  'UserPromptSubmit (空提示檢查)',
]

// ── Permission 白名單 ──

const PERMISSION_PRESETS = {
  allow: [
    'Bash(npm run *)', 'Bash(pnpm *)', 'Bash(npx *)', 'Bash(node *)',
    'Bash(git add *)', 'Bash(git commit *)', 'Bash(git checkout *)',
    'Bash(git branch *)', 'Bash(git diff *)', 'Bash(git log *)',
    'Bash(git status)', 'Bash(git stash *)', 'Bash(git pull)', 'Bash(git fetch *)',
    'Bash(ls *)', 'Bash(cat *)', 'Bash(mkdir *)', 'Bash(cp *)', 'Bash(mv *)',
    'Bash(which *)', 'Bash(echo *)', 'Bash(grep *)', 'Bash(find *)',
    'Bash(wc *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(sort *)',
    'Bash(curl *)', 'Bash(gh *)',
    'Read(*)', 'Edit(*)', 'Write(*)', 'Glob(*)', 'Grep(*)',
    'WebFetch(domain:github.com)', 'WebFetch(domain:npmjs.com)',
    'Agent(*)',
  ],
  deny: [
    'Bash(git push --force *)', 'Bash(git reset --hard *)',
    'Bash(rm -rf /)', 'Bash(rm -rf ~)',
    'Bash(DROP TABLE *)', 'Bash(DROP DATABASE *)',
  ],
}

// ── 快捷鍵 ──

const KEYBINDING_PRESETS = {
  'ctrl+r': 'code-review',
  'ctrl+t': 'tdd',
  'ctrl+p': 'pr-workflow',
  'ctrl+b': 'build-fix',
  'ctrl+shift+s': 'simplify',
}

// ── 全局 settings ──

const SETTINGS_PRESETS = {
  model: 'sonnet',
  effortLevel: 'medium',
  autoMemoryEnabled: true,
  env: {
    MAX_THINKING_TOKENS: '31999',
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '80',
  },
}

// ── zsh 模組 ──

const ALL_ZSH_MODULES = [
  'aliases', 'completion', 'fzf', 'git', 'history',
  'keybindings', 'nvm', 'plugins', 'pnpm', 'tools',
]

/**
 * 生成完整安裝計畫
 *
 * @param {Object} opts
 * @param {Array} opts.repos - 含 fullName/commits/pct/desc/stars 的 repo 物件
 * @param {Object} opts.pipelineResult - Pipeline 分析結果
 * @param {Object} opts.eccResult - ECC 規則匹配結果
 * @param {Object} opts.localPaths - { fullName: localPath } 映射
 * @param {Object} opts.profile - 開發者畫像
 * @returns {Object} plan
 */
export function generateInstallPlan({ repos, pipelineResult, eccResult, localPaths, roleOverrides, profile }) {
  const reposWithRoles = repos.map(r => ({
    ...r,
    role: roleOverrides?.[r.fullName] || determineRole(r),
    localPath: localPaths?.[r.fullName] || null,
  }))

  const mainRepos = reposWithRoles.filter(r => r.role === 'main')
  const tempRepos = reposWithRoles.filter(r => r.role === 'temp')
  const toolRepos = reposWithRoles.filter(r => r.role === 'tool')

  // 專案 CLAUDE.md（只有找到 localPath 的才生成）
  const projects = reposWithRoles.filter(r => r.localPath).map(r => ({
    repo: r.fullName,
    role: r.role,
    localPath: r.localPath,
    claudeMdType: getClaudeMdType(r.role),
  }))

  // 費用預估
  const aiCost = {
    classify: repos.length * 0.08,
    claudeMd: mainRepos.length * 0.03,
    profile: 0.02,
    total: repos.length * 0.08 + mainRepos.length * 0.03 + 0.02,
  }

  return {
    // 基本
    targets: ['claude-dev', 'slack', 'zsh'],
    mode: 'auto',
    installMode: 'full', // full | minimal

    // Repos
    repos: reposWithRoles,
    mainCount: mainRepos.length,
    tempCount: tempRepos.length,
    toolCount: toolRepos.length,

    // 技術棧
    techStacks: pipelineResult?.preselectedTechs || pipelineResult?.detectedSkills || [],

    // ECC
    ecc: eccResult?.recommended || [],

    // 全局配置（全部統一裝到 ~/.claude/）
    global: {
      commands: ALL_COMMANDS,
      agents: ALL_AGENTS,
      rules: ALL_RULES,
      hooks: ALL_HOOKS,
      permissions: PERMISSION_PRESETS,
      keybindings: KEYBINDING_PRESETS,
      settings: SETTINGS_PRESETS,
    },

    // 專案配置
    projects,

    // zsh
    zshModules: ALL_ZSH_MODULES,

    // 畫像
    profile: profile || null,

    // 費用
    aiCost,

    // 時間戳
    timestamp: new Date().toISOString(),
  }
}

/**
 * 精簡安裝計畫
 */
export function generateMinimalPlan(fullPlan) {
  return {
    ...fullPlan,
    installMode: 'minimal',
    global: {
      commands: ['code-review', 'pr-workflow'],
      agents: ['coder', 'reviewer', 'debugger'],
      rules: ['code-style', 'git-workflow'],
      hooks: [
        'PostToolUse:Edit|Write (prettier)',
        'PreToolUse:Edit|Write (檔案保護)',
      ],
      permissions: fullPlan.global.permissions,
      keybindings: fullPlan.global.keybindings,
      settings: fullPlan.global.settings,
    },
    projects: [],
    ecc: [],
    zshModules: [],
  }
}

// Re-export for convenience
export { PERMISSION_PRESETS, KEYBINDING_PRESETS, SETTINGS_PRESETS, ALL_ZSH_MODULES, ALL_HOOKS }
