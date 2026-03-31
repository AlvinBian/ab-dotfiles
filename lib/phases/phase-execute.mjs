/**
 * Phase: 安裝執行（listr2 8 子任務）
 *
 * 依序執行以下子任務：
 *   [1/8] 備份現有配置到 dist/backup/
 *   [2/8] 部署全局配置（settings.json + keybindings.json + hooks/slack-dispatch.sh）
 *   [3/8] 安裝 commands / agents / rules / hooks → ~/.claude/
 *   [4/8] ECC 外部資源融合 + 技術棧 Stacks 生成
 *   [5/8] CLAUDE.md 生成 → ~/.claude/projects/
 *   [6/8] Plugin 打包 → dist/release/
 *   [7/8] zsh 模組安裝 → ~/.zsh/modules/
 *   [8/8] 驗證安裝完整性
 */

import { spawn } from 'child_process'
import fs from 'fs'
import { Listr } from 'listr2'
import path from 'path'
import { backupIfExists } from '../core/backup.mjs'
import { updateSessionProgress } from '../core/session.mjs'
import { deploySettings } from '../deploy/deploy-global.mjs'
import { deployAllProjectClaudeMd } from '../deploy/deploy-project.mjs'
import { generateClaudeMd } from '../deploy/generate-claude-md.mjs'
import { buildSyncResult, writeSyncedFiles } from '../external/source-sync.mjs'
import { runTarget } from '../install/index.mjs'
import { notifyWarning } from '../slack/slack-notify.mjs'

/**
 * 執行安裝計畫
 *
 * @param {Object} plan - generateInstallPlan 產出
 * @param {Object} opts
 * @param {string} opts.repoDir - ab-dotfiles 根目錄
 * @param {string} opts.previewDir - dist/preview 路徑
 * @param {Object} opts.targets - config.json targets 定義
 * @param {Object|null} opts.prev - session
 * @param {Object|null} opts.pipelineResult
 * @param {Object|null} opts.fetchedSources
 * @returns {Promise<Object>} { installSelections, syncResult, startTime }
 */
export async function phaseExecute(plan, {
  repoDir, previewDir, targets, prev, pipelineResult, fetchedSources,
}) {
  const HOME = process.env.HOME
  const isManual = plan.mode === 'manual'
  const features = new Set(plan.features || ['claude', 'claudemd', 'ecc', 'slack', 'zsh'])
  const has = (f) => features.has(f)
  const startTime = Date.now()

  updateSessionProgress({
    lastPhase: 'execute',
    completedTargets: [],
    pendingTargets: plan.targets,
  })

  let installSelections = {}
  let syncResult = null

  const tasks = new Listr([
    // [1/8] 完整備份現有配置（先遷移再覆蓋，確保可還原）
    {
      title: '[1/8] 備份現有配置 → dist/backup/',
      task: async (_, task) => {
        const backupTasks = []
        const targets = plan.targets || []
        const needsClaude = targets.includes('claude-dev') || targets.includes('slack')
        const needsZsh = targets.includes('zsh')

        if (needsClaude) {
          const cd = path.join(HOME, '.claude')
          // 備份所有 Claude 配置（commands/agents/rules + 設定檔）
          for (const sub of ['commands', 'agents', 'rules']) {
            backupTasks.push(backupIfExists(path.join(cd, sub), `claude/${sub}`))
          }
          backupTasks.push(backupIfExists(path.join(cd, 'hooks.json'), 'claude/hooks.json'))
          backupTasks.push(backupIfExists(path.join(cd, 'settings.json'), 'claude/settings.json'))
          backupTasks.push(backupIfExists(path.join(cd, 'keybindings.json'), 'claude/keybindings.json'))
        }
        if (needsZsh) {
          // 備份 zsh 全部（.zshrc + modules + .zshrc.local + .ripgreprc）
          backupTasks.push(backupIfExists(path.join(HOME, '.zshrc'), 'zshrc'))
          backupTasks.push(backupIfExists(path.join(HOME, '.zshrc.local'), 'zshrc.local'))
          backupTasks.push(backupIfExists(path.join(HOME, '.zsh', 'modules'), 'zsh/modules'))
          backupTasks.push(backupIfExists(path.join(HOME, '.ripgreprc'), 'ripgreprc'))
        }

        const results = (await Promise.all(backupTasks)).filter(Boolean)
        task.output = results.length > 0
          ? `已備份 ${results.length} 項：${results.join('、')}`
          : '無需備份'
      },
    },

    // [2/8] 全局配置（settings + keybindings + hooks dispatch）
    {
      title: '[2/8] 全局配置 → ~/.claude/',
      enabled: () => has('claude') || has('slack'),
      task: (_, task) => task.newListr([
        {
          title: 'settings.json — 合併 permissions + model + autoMemory',
          task: async (_, subtask) => {
            const templatePath = path.join(repoDir, 'claude', 'settings-template.json')
            if (fs.existsSync(templatePath)) {
              const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'))
              const result = deploySettings(template)
              subtask.output = result.permissionsAdded > 0
                ? `新增 ${result.permissionsAdded} 條 permission 規則`
                : 'permissions 已是最新'
            }
          },
        },
        {
          title: 'hooks/slack-dispatch.sh — Slack 通知分發器',
          enabled: () => has('slack'),
          task: async (_, subtask) => {
            const src = path.join(repoDir, 'claude', 'hooks', 'slack-dispatch.sh')
            const destDir = path.join(HOME, '.claude', 'hooks')
            const dest = path.join(destDir, 'slack-dispatch.sh')
            if (fs.existsSync(src)) {
              fs.mkdirSync(destDir, { recursive: true })
              fs.copyFileSync(src, dest)
              fs.chmodSync(dest, 0o755)
              subtask.output = '已安裝 → ~/.claude/hooks/'
            } else {
              subtask.skip('來源檔案不存在')
            }
          },
        },
      ]),
    },

    // [3/8] Claude 安裝（commands + agents + rules + hooks → ~/.claude/）
    {
      title: '[3/8] Claude 安裝 → ~/.claude/commands + agents + rules + hooks',
      enabled: () => has('claude'),
      task: async (_, task) => {
        const completed = new Set()
        for (const key of plan.targets.filter(t => t !== 'zsh')) {
          if (!targets[key]) continue
          const result = await runTarget(repoDir, previewDir, key, targets[key], {
            selectedTargets: plan.targets,
            completed,
            flagAll: true,
            manual: isManual,
            skillIds: plan.techStacks,
            session: prev,
          })
          if (result) Object.assign(installSelections, result)
          completed.add(key)
        }
        const parts = []
        if (installSelections.commands?.length) parts.push(`${installSelections.commands.length} commands`)
        if (installSelections.agents?.length) parts.push(`${installSelections.agents.length} agents`)
        if (installSelections.rules?.length) parts.push(`${installSelections.rules.length} rules`)
        if (installSelections.hooks?.length) parts.push(`${installSelections.hooks.length} hooks`)
        task.output = parts.join(' · ') || '完成'
      },
    },

    // [4/8] ECC 外部資源 + 技術棧 Stacks
    {
      title: `[4/8] ECC（${plan.ecc?.length ?? 0}）+ Stacks（${plan.techStacks?.length ?? 0}）`,
      enabled: () => has('ecc') && (plan.ecc.length > 0 || plan.techStacks.length > 0),
      task: (_, task) => task.newListr([
        {
          title: `ECC 融合 — ${plan.ecc.length} 個外部 commands/agents/rules`,
          task: async (_, subtask) => {
            if (plan.ecc.length > 0 && fetchedSources?.sources?.length > 0) {
              syncResult = buildSyncResult(fetchedSources, {
                commands: new Set(plan.ecc),
                agents: new Set(plan.ecc),
                rules: new Set(plan.ecc),
              })
              const claudePreview = path.join(previewDir, 'claude')
              await writeSyncedFiles(syncResult.downloaded, claudePreview)
              if (!isManual) await writeSyncedFiles(syncResult.downloaded, path.join(HOME, '.claude'))
              const added = syncResult.downloaded?.length || 0
              subtask.output = `已融合 ${added} 個檔案`
            } else {
              subtask.output = '無 ECC 資源'
            }
          },
        },
        {
          title: `Stacks 生成（${plan.techStacks.length} 個技術棧）`,
          task: async (_, subtask) => {
            if (plan.techStacks.length > 0) {
              try {
                await new Promise((resolve, reject) => {
                  const child = spawn('node', ['bin/scan.mjs', '--init', '--no-ai', '--skills', plan.techStacks.join(',')], { cwd: repoDir })
                  child.on('close', code => {
                    if (code === 0) resolve()
                    else reject(new Error(`scan.mjs exit ${code}`))
                  })
                  child.on('error', reject)
                })
                subtask.output = `已生成 ${plan.techStacks.length} 個技術棧規則`
              } catch (e) {
                subtask.output = `生成失敗：${e.message?.slice(0, 50) || '未知錯誤'}`
                throw e
              }
            }
          },
        },
      ], { concurrent: true }),
    },

    // [5/8] CLAUDE.md 生成 → ~/.claude/projects/
    {
      title: `[5/8] CLAUDE.md → ~/.claude/projects/（${plan.projects?.length ?? 0} 個 repo）`,
      enabled: () => has('claudemd') && (plan.projects?.length ?? 0) > 0 && !isManual,
      task: async (_, task) => {
        const items = []
        for (const proj of plan.projects) {
          const perRepo = pipelineResult?.perRepo instanceof Map ? pipelineResult.perRepo.get(proj.repo) : null
          const content = await generateClaudeMd({
            repoName: proj.repo,
            role: proj.role,
            reasoning: perRepo?.reasoning || '',
            stacks: perRepo?.techStacks || {},
            meta: { description: '' },
          })
          items.push({ localPath: proj.localPath, content, repo: proj.repo })
        }
        const result = deployAllProjectClaudeMd(items)
        const parts = []
        if (result.deployed.length) parts.push(`已生成：${result.deployed.map(r => r.split('/').pop()).join('、')}`)
        if (result.skipped.length) parts.push(`跳過：${result.skipped.join('、')}`)
        task.output = parts.join('\n') || '無需生成'
      },
    },

    // [6/8] Plugin 打包
    {
      title: '[6/8] Plugin 打包 → dist/release/',
      enabled: () => has('claude'),
      task: (_, task) => task.newListr([
        {
          title: 'ab-claude-dev.plugin',
          enabled: () => plan.targets.includes('claude-dev'),
          task: async () => {
            await new Promise((resolve, reject) => {
              const child = spawn('bash', ['scripts/build-claude-dev-plugin.sh'], { cwd: repoDir })
              child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
              child.on('error', reject)
            })
          },
        },
        {
          title: 'ab-slack-message.plugin',
          enabled: () => plan.targets.includes('slack'),
          task: async () => {
            await new Promise((resolve, reject) => {
              const child = spawn('bash', ['scripts/build-slack-plugin.sh'], { cwd: repoDir })
              child.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
              child.on('error', reject)
            })
          },
        },
      ]),
    },

    // [7/8] zsh 模組 → ~/.zsh/modules/
    {
      title: `[7/8] zsh 模組（${plan.zshModules?.length ?? 0} 個）→ ~/.zsh/modules/`,
      enabled: () => has('zsh') && (plan.targets || []).includes('zsh') && (plan.zshModules?.length ?? 0) > 0,
      task: async (_, task) => {
        if (targets.zsh) {
          const result = await runTarget(repoDir, previewDir, 'zsh', targets.zsh, {
            selectedTargets: ['zsh'],
            completed: new Set(),
            flagAll: true,
            manual: isManual,
            skillIds: [],
            session: prev,
          })
          if (result) Object.assign(installSelections, result)
        }
        task.output = `已安裝 ${plan.zshModules.length} 個模組：${plan.zshModules.join('、')}`
      },
    },

    // [8/8] 驗證安裝完整性
    {
      title: '[8/8] 驗證安裝完整性',
      task: async (_, task) => {
        let passed = 0
        let total = 0
        const missing = []
        const checkDir = (dir, items, ext = '.md') => {
          for (const name of items) {
            total++
            if (fs.existsSync(path.join(dir, `${name}${ext}`))) {
              passed++
            } else {
              missing.push(name)
            }
          }
        }
        if (installSelections.commands?.length) checkDir(path.join(HOME, '.claude/commands'), installSelections.commands)
        if (installSelections.agents?.length) checkDir(path.join(HOME, '.claude/agents'), installSelections.agents)
        if (installSelections.rules?.length) checkDir(path.join(HOME, '.claude/rules'), installSelections.rules)

        // 也驗證 settings.json 和 hooks.json
        if (fs.existsSync(path.join(HOME, '.claude/settings.json'))) { total++; passed++ } else { total++; missing.push('settings.json') }
        if (fs.existsSync(path.join(HOME, '.claude/hooks.json'))) { total++; passed++ } else { total++; missing.push('hooks.json') }

        // 驗證 CLAUDE.md
        if (plan.projects?.length) {
          const { encodeProjectPath } = await import('../config/config-classifier.mjs')
          for (const proj of plan.projects) {
            if (!proj.localPath) continue
            total++
            const encoded = encodeProjectPath(proj.localPath)
            const mdPath = path.join(HOME, '.claude', 'projects', encoded, 'CLAUDE.md')
            if (fs.existsSync(mdPath)) passed++
            else missing.push(`CLAUDE.md (${proj.repo.split('/').pop()})`)
          }
        }

        if (missing.length > 0) {
          task.output = `${passed}/${total} 就位，缺少：${missing.join('、')}`
          notifyWarning('安裝驗證有缺失', [`${missing.length} 個檔案缺少`, ...missing])
        } else {
          task.output = `${passed}/${total} 檔案全部就位 ✓`
        }
      },
    },
  ], {
    concurrent: false,
    exitOnError: false,
    rendererOptions: {
      showTimer: true,
      collapseSubtasks: false,
      showSubtasks: true,
    },
  })

  await tasks.run()

  return { installSelections, syncResult, startTime }
}
