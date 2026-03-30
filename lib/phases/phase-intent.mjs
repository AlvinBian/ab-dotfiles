/**
 * Phase 1：環境檢查 + 意圖收集（targets + mode）
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { handleCancel, multiselectWithAll } from '../ui/prompts.mjs'
import { ensureEnvironment } from '../doctor.mjs'
import { warmupCli } from '../claude-cli.mjs'

/**
 * @param {Object} opts
 * @param {Object} opts.targets - config.json targets
 * @param {string[]} opts.args - CLI 參數
 * @param {boolean} opts.flagAll
 * @param {boolean} opts.flagManual
 * @param {boolean} opts.flagQuick
 * @param {Object|null} opts.prev - 上次 session
 * @returns {Promise<{ selectedTargets: string[], manual: boolean, needsClaude: boolean, needsZsh: boolean }>}
 */
export async function runPhaseIntent({ targets, args, flagAll, flagManual, flagQuick, prev }) {
  await ensureEnvironment()

  // 背景預熱 Claude CLI（用戶選 targets 期間完成，後續 AI 呼叫更快）
  warmupCli()

  // 選 targets
  let selectedTargets
  if (flagAll || flagQuick) {
    selectedTargets = flagQuick && prev?.targets ? prev.targets : Object.keys(targets)
    p.log.info(`安裝目標：${selectedTargets.map(k => targets[k]?.label || k).join('、')}`)
  } else {
    const flagged = Object.entries(targets).filter(([, d]) => d.flag && args.includes(d.flag)).map(([k]) => k)
    if (flagged.length > 0) {
      selectedTargets = flagged
    } else {
      selectedTargets = await multiselectWithAll({
        message: '選擇要安裝的項目',
        options: Object.entries(targets).map(([k, d]) => ({ value: k, label: `${d.label}  ${pc.dim(d.hint || '')}` })),
        required: true,
        initialValues: prev?.targets || [],
      })
    }
    p.log.success(`已選擇：${selectedTargets.map(k => targets[k]?.label || k).join('、')}`)
  }

  // 選 mode（有 session 時用上次的模式，不再問）
  let manual = flagManual
  if (flagAll || flagManual || flagQuick) {
    if (flagQuick && prev?.mode) manual = prev.mode === 'manual'
  } else if (prev?.mode) {
    manual = prev.mode === 'manual'
    p.log.success(`模式：${manual ? pc.cyan('手動') : pc.cyan('自動')}（上次選擇）`)
  } else {
    const mode = handleCancel(await p.select({
      message: '安裝模式',
      options: [
        { value: 'auto', label: `自動安裝  ${pc.dim('直接部署 + 打包 plugins')}` },
        { value: 'manual', label: `手動模式  ${pc.dim('生成到 dist/preview/，自行複製')}` },
      ],
    }))
    manual = mode === 'manual'
    p.log.success(`模式：${manual ? pc.cyan('手動') : pc.cyan('自動')}`)
  }

  const needsClaude = selectedTargets.some(k => targets[k]?.requiresAnalysis) ||
    selectedTargets.includes('claude-dev') || selectedTargets.includes('slack')
  const needsZsh = selectedTargets.includes('zsh')

  return { selectedTargets, manual, needsClaude, needsZsh }
}
