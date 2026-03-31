/**
 * Phase: 安裝執行（4 大區段 → 8 子任務）
 *
 * 並行策略：
 *   Groups 1+2（寫入 ~/.claude/）與 Group 3（寫入 ~/.zsh/）互不衝突 → 並行執行
 *   Group 4（驗證）在所有安裝完成後執行
 *
 * Group 1: Claude Code 開發配置（if has('claude') || has('slack')）— 寫 ~/.claude/
 *   [1a] 備份 Claude 配置 → dist/backup/
 *   [2]  全局配置（settings.json + hooks/slack-dispatch.sh）
 *   [3]  Claude 安裝（commands / agents / rules / hooks）
 *   [6]  Plugin 打包 → dist/release/
 *
 * Group 2: 專案配置（if has('claudemd') || has('ecc')）— 寫 ~/.claude/projects/
 *   [4]  ECC 外部資源融合 + 技術棧 Stacks 生成
 *   [5]  CLAUDE.md 生成 → ~/.claude/projects/
 *
 * Group 3: ZSH 環境模組（if has('zsh')）— 寫 ~/.zsh/（與 Groups 1+2 並行）
 *   [1b] 備份 ZSH 配置 → dist/backup/
 *   [7]  ZSH 模組安裝 → ~/.zsh/modules/
 *
 * Group 4: 驗證
 *   [8]  驗證安裝完整性
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
  if (!HOME) throw new Error('HOME 環境變數未設置，請確認 shell 環境正常')
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

    // ── 並行安裝：Groups 1+2（寫 ~/.claude/）與 Group 3（寫 ~/.zsh/）互不衝突 ──
    {
      task: (_, outerTask) => outerTask.newListr([

        // Branch A: Claude Code 開發配置 + 專案配置（順序執行，共用 ~/.claude/）
        {
          title: 'Claude Code + 專案配置',
          enabled: () => has('claude') || has('slack') || has('claudemd') || has('ecc'),
          task: (_, branchTask) => branchTask.newListr([

            // ━━━ Group 1: Claude Code 開發配置 ━━━
            {
              title: '━━━ Claude Code 開發配置 ━━━',
              enabled: () => has('claude') || has('slack'),
              task: (_, task) => task.newListr([

                // [1a] 備份 Claude 配置（commands/agents/rules + 設定檔）
                {
                  title: '備份 Claude 配置 → dist/backup/',
                  task: async (_, subtask) => {
                    const backupTasks = []
                    const cd = path.join(HOME, '.claude')
                    for (const sub of ['commands', 'agents', 'rules']) {
                      backupTasks.push(backupIfExists(path.join(cd, sub), `claude/${sub}`))
                    }
                    backupTasks.push(backupIfExists(path.join(cd, 'hooks.json'), 'claude/hooks.json'))
                    backupTasks.push(backupIfExists(path.join(cd, 'settings.json'), 'claude/settings.json'))
                    backupTasks.push(backupIfExists(path.join(cd, 'keybindings.json'), 'claude/keybindings.json'))
                    const results = (await Promise.all(backupTasks)).filter(Boolean)
                    subtask.output = results.length > 0
                      ? `已備份 ${results.length} 項：${results.join('、')}`
                      : '無需備份'
                  },
                },

                // [2] 全局配置（settings + keybindings + hooks dispatch）
                {
                  title: '全局配置 → ~/.claude/',
                  task: (_, subtask) => subtask.newListr([
                    {
                      title: 'settings.json — 合併 permissions + model + autoMemory',
                      task: async (_, sub) => {
                        const templatePath = path.join(repoDir, 'claude', 'settings-template.json')
                        if (fs.existsSync(templatePath)) {
                          const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'))
                          const result = deploySettings(template)
                          sub.output = result.permissionsAdded > 0
                            ? `新增 ${result.permissionsAdded} 條 permission 規則`
                            : 'permissions 已是最新'
                        }
                      },
                    },
                    {
                      title: 'hooks/slack-dispatch.sh — Slack 通知分發器',
                      enabled: () => has('slack'),
                      task: async (_, sub) => {
                        const src = path.join(repoDir, 'claude', 'hooks', 'slack-dispatch.sh')
                        const destDir = path.join(HOME, '.claude', 'hooks')
                        const dest = path.join(destDir, 'slack-dispatch.sh')
                        if (fs.existsSync(src)) {
                          fs.mkdirSync(destDir, { recursive: true })
                          fs.copyFileSync(src, dest)
                          fs.chmodSync(dest, 0o755)
                          sub.output = '已安裝 → ~/.claude/hooks/'
                        } else {
                          sub.skip('來源檔案不存在')
                        }
                        // 同步 Slack 設定到 ~/.claude/.env 和 settings.json
                        const repoEnv = path.join(repoDir, '.env')
                        if (fs.existsSync(repoEnv)) {
                          const repoEnvContent = fs.readFileSync(repoEnv, 'utf8')
                          const channel = repoEnvContent.match(/^SLACK_NOTIFY_CHANNEL=(.*)$/m)?.[1] ?? ''
                          const mode = repoEnvContent.match(/^SLACK_NOTIFY_MODE=(.*)$/m)?.[1] ?? ''
                          const channelName = repoEnvContent.match(/^SLACK_NOTIFY_CHANNEL_NAME=(.*)$/m)?.[1] ?? ''
                          const userId = repoEnvContent.match(/^SLACK_NOTIFY_USER_ID=(.*)$/m)?.[1] ?? ''
                          if (channel) {
                            // 寫 ~/.claude/.env（供 commands / hooks 讀取）
                            const claudeEnvPath = path.join(HOME, '.claude', '.env')
                            let content = fs.existsSync(claudeEnvPath) ? fs.readFileSync(claudeEnvPath, 'utf8') : ''
                            content = content
                              .replace(/^SLACK_[A-Z_]+=.*/gm, '')               // 清除所有 SLACK_ 開頭變數
                              .replace(/^CLAUDE_SLACK_MIN_SESSION_SECS=.*/gm, '') // 清除 session 閾值（重寫）
                              .trim()
                            const minSession = repoEnvContent.match(/^CLAUDE_SLACK_MIN_SESSION_SECS=(.*)$/m)?.[1] ?? '300'
                            content += `\nSLACK_NOTIFY_CHANNEL=${channel}\nSLACK_NOTIFY_MODE=${mode}\n`
                            if (channelName) content += `SLACK_NOTIFY_CHANNEL_NAME=${channelName}\n`
                            if (userId) content += `SLACK_NOTIFY_USER_ID=${userId}\n`
                            content += `CLAUDE_SLACK_MIN_SESSION_SECS=${minSession}\n`
                            fs.writeFileSync(claudeEnvPath, content)
                            // 寫 ~/.claude/settings.json env（讓 Claude session 直接取得變數）
                            const settingsPath = path.join(HOME, '.claude', 'settings.json')
                            let settings = {}
                            try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } catch {}
                            settings.env = {
                              ...settings.env,
                              SLACK_NOTIFY_CHANNEL: channel,
                              SLACK_NOTIFY_MODE: mode,
                              ...(channelName && { SLACK_NOTIFY_CHANNEL_NAME: channelName }),
                              ...(userId && { SLACK_NOTIFY_USER_ID: userId }),
                            }
                            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
                          }
                        }
                      },
                    },
                  ]),
                },

                // [3] Claude 安裝（commands + agents + rules + hooks → ~/.claude/）
                {
                  title: 'Claude 安裝 → ~/.claude/commands + agents + rules + hooks',
                  enabled: () => has('claude'),
                  task: async (_, subtask) => {
                    const completed = new Set()
                    for (const key of (plan.targets || []).filter(t => t !== 'zsh')) {
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
                    subtask.output = parts.join(' · ') || '完成'
                  },
                },

                // [6] Plugin 打包
                {
                  title: 'Plugin 打包 → dist/release/',
                  task: (_, subtask) => subtask.newListr([
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

              ], { concurrent: false }),
            },

            // ━━━ Group 2: 專案配置（repos + AI）━━━
            {
              title: '━━━ 專案配置（repos + AI）━━━',
              enabled: () => has('claudemd') || has('ecc'),
              task: (_, task) => task.newListr([

                // [4] ECC 外部資源 + 技術棧 Stacks
                {
                  title: `ECC（${plan.ecc?.length ?? 0}）+ Stacks（${plan.techStacks?.length ?? 0}）`,
                  enabled: () => has('ecc') && ((plan.ecc?.length ?? 0) > 0 || (plan.techStacks?.length ?? 0) > 0),
                  task: (_, subtask) => subtask.newListr([
                    {
                      title: `ECC 融合 — ${(plan.ecc?.length ?? 0)} 個外部 commands/agents/rules`,
                      task: async (_, sub) => {
                        if ((plan.ecc?.length ?? 0) > 0 && fetchedSources?.sources?.length > 0) {
                          syncResult = buildSyncResult(fetchedSources, {
                            commands: new Set(plan.ecc),
                            agents: new Set(plan.ecc),
                            rules: new Set(plan.ecc),
                          })
                          const claudePreview = path.join(previewDir, 'claude')
                          await writeSyncedFiles(syncResult.downloaded, claudePreview)
                          let skipped = []
                          if (!isManual) skipped = await writeSyncedFiles(syncResult.downloaded, path.join(HOME, '.claude'))
                          const added = syncResult.downloaded?.length || 0
                          sub.output = skipped.length
                            ? `已融合 ${added} 個檔案（跳過 ${skipped.length} 個用戶自訂：${skipped.join('、')}）`
                            : `已融合 ${added} 個檔案`
                        } else {
                          sub.output = '無 ECC 資源'
                        }
                      },
                    },
                    {
                      title: `Stacks 生成（${(plan.techStacks?.length ?? 0)} 個技術棧）`,
                      task: async (_, sub) => {
                        if ((plan.techStacks?.length ?? 0) > 0) {
                          try {
                            await new Promise((resolve, reject) => {
                              const child = spawn('node', ['bin/scan.mjs', '--init', '--no-ai', '--skills', plan.techStacks.join(',')], { cwd: repoDir })
                              child.on('close', code => {
                                if (code === 0) resolve()
                                else reject(new Error(`scan.mjs exit ${code}`))
                              })
                              child.on('error', reject)
                            })
                            sub.output = `已生成 ${(plan.techStacks?.length ?? 0)} 個技術棧規則`
                          } catch (e) {
                            sub.output = `生成失敗：${e.message?.slice(0, 50) || '未知錯誤'}`
                            throw e
                          }
                        }
                      },
                    },
                  ], { concurrent: true }),
                },

                // [5] CLAUDE.md 生成 → ~/.claude/projects/
                {
                  title: `CLAUDE.md → ~/.claude/projects/（${plan.projects?.length ?? 0} 個 repo）`,
                  enabled: () => has('claudemd') && (plan.projects?.length ?? 0) > 0 && !isManual,
                  task: async (_, subtask) => {
                    const items = await Promise.all(
                      (plan.projects || []).map(async (proj) => {
                        const perRepo = pipelineResult?.perRepo instanceof Map ? pipelineResult.perRepo.get(proj.repo) : null
                        const content = await generateClaudeMd({
                          repoName: proj.repo,
                          role: proj.role,
                          reasoning: perRepo?.reasoning || '',
                          stacks: perRepo?.techStacks || {},
                          meta: { description: '' },
                        })
                        return { localPath: proj.localPath, content, repo: proj.repo }
                      })
                    )
                    const result = deployAllProjectClaudeMd(items)
                    const parts = []
                    if (result.deployed.length) parts.push(`已生成：${result.deployed.map(r => r.split('/').pop()).join('、')}`)
                    if (result.repoDeployed.length) parts.push(`寫入 repo 根目錄：${result.repoDeployed.map(r => r.split('/').pop()).join('、')}`)
                    if (result.skipped.length) parts.push(`跳過：${result.skipped.join('、')}`)
                    subtask.output = parts.join('\n') || '無需生成'
                  },
                },

              ], { concurrent: false }),
            },

          ], { concurrent: false }),
        },

        // Branch B: ZSH 環境模組（與 Branch A 並行，寫 ~/.zsh/ 不衝突）
        {
          title: '━━━ ZSH 環境模組 ━━━',
          enabled: () => has('zsh'),
          task: (_, task) => task.newListr([

            // [1b] 備份 ZSH 配置（.zshrc + modules + .zshrc.local + .ripgreprc）
            {
              title: '備份 ZSH 配置 → dist/backup/',
              task: async (_, subtask) => {
                const backupTasks = [
                  backupIfExists(path.join(HOME, '.zshrc'), 'zshrc'),
                  backupIfExists(path.join(HOME, '.zshrc.local'), 'zshrc.local'),
                  backupIfExists(path.join(HOME, '.zsh', 'modules'), 'zsh/modules'),
                  backupIfExists(path.join(HOME, '.ripgreprc'), 'ripgreprc'),
                ]
                const results = (await Promise.all(backupTasks)).filter(Boolean)
                subtask.output = results.length > 0
                  ? `已備份 ${results.length} 項：${results.join('、')}`
                  : '無需備份'
              },
            },

            // [7] ZSH 模組 → ~/.zsh/modules/
            {
              title: `ZSH 模組（${plan.zshModules?.length ?? 0} 個）→ ~/.zsh/modules/`,
              enabled: () => (plan.targets || []).includes('zsh') && (plan.zshModules?.length ?? 0) > 0,
              task: async (_, subtask) => {
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
                subtask.output = `已安裝 ${plan.zshModules?.length ?? 0} 個模組：${plan.zshModules?.join('、') ?? ''}`
              },
            },

          ], { concurrent: false }),
        },

      ], { concurrent: true }),
    },

    // ━━━ Group 4: 驗證（所有安裝完成後）━━━
    {
      title: '━━━ 驗證 ━━━',
      task: (_, task) => task.newListr([

        // [8] 驗證安裝完整性
        {
          title: '驗證安裝完整性',
          task: async (_, subtask) => {
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

            // 驗證 settings.json（有 Claude 或 Slack 才檢查）
            if (has('claude') || has('slack')) {
              if (fs.existsSync(path.join(HOME, '.claude/settings.json'))) { total++; passed++ } else { total++; missing.push('settings.json') }
            }
            // 驗證 hooks.json（有 Slack 才檢查）
            if (has('slack')) {
              if (fs.existsSync(path.join(HOME, '.claude/hooks.json'))) { total++; passed++ } else { total++; missing.push('hooks.json') }
            }

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
              subtask.output = `${passed}/${total} 就位，缺少：${missing.join('、')}`
            } else {
              subtask.output = `${passed}/${total} 檔案全部就位 ✓`
            }
          },
        },

      ]),
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
