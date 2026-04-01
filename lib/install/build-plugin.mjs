/**
 * build-plugin 步驟：打包 .plugin 檔案
 *
 * 透過 shell 腳本產生壓縮的 .plugin 套件，
 * 解析腳本 stdout 中的階段標記並更新 spinner 進度。
 */

import * as p from '@clack/prompts'
import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import pc from 'picocolors'
import { stripAnsi } from '../cli/progress.mjs'

/**
 * 執行 plugin 打包腳本並顯示進度
 *
 * 透過 spawn 執行 step.script，解析 stdout 輸出中的
 * 階段名稱（phases 陣列）更新 spinner 訊息；
 * 打包失敗時以 warn 記錄但不中斷流程。
 *
 * @param {string} repoDir - ab-dotfiles 根目錄（腳本執行目錄）
 * @param {Object} step - config.json 中的 step 定義
 * @param {string} step.script - 要執行的 shell 指令
 * @param {string[]} [step.phases] - 要追蹤的階段名稱陣列
 * @param {string} [step.successMsg] - 成功訊息文字
 * @param {string} stepLabel - 步驟前綴（如 '[2/3] '）
 * @returns {Promise<void>}
 */
export async function handleBuildPlugin(repoDir, step, stepLabel) {
  const phases = step.phases || []
  const seen = new Set()
  const spinner = p.spinner()
  spinner.start(`${stepLabel}打包 plugin...`)

  try {
    const [scriptCmd, ...scriptArgs] = step.script.split(/\s+/)
    const child = spawn(scriptCmd, scriptArgs, { cwd: repoDir })
    let buf = ''
    const decoder = new StringDecoder('utf8')
    const completedPhases = []

    let activePhase = null

    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => {
        buf += decoder.write(chunk)
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          const clean = stripAnsi(line)

          // Parse _progress_bar output: "  [████░░░]  3/11  label"
          const progressMatch = clean.match(/(\d+)\/(\d+)/)
          if (progressMatch && activePhase) {
            const [, cur, total] = progressMatch
            spinner.message(`${stepLabel}打包中 — ${activePhase} ${cur}/${total}`)
            continue
          }

          for (const phase of phases) {
            if (seen.has(phase)) continue
            if (phase === '打包完成') {
              if (/✅.*打包完成/.test(clean)) seen.add(phase)
            } else if (clean.includes(phase)) {
              seen.add(phase)
              completedPhases.push(phase)
              activePhase = phase
              spinner.message(`${stepLabel}打包中 — ${phase}`)
            }
          }
        }
      })
      child.stderr.on('data', () => {})
      child.on('close', code => code !== 0 ? reject(new Error(`exit ${code}`)) : resolve())
    })

    const phaseLines = completedPhases.length > 0
      ? '\n' + completedPhases.map(ph => `  ${pc.green('✔')} ${ph}`).join('\n')
      : ''
    spinner.stop(`${stepLabel}✔ ${step.successMsg || '打包完成'}${phaseLines}`)
  } catch (e) {
    p.log.warn(`${stepLabel}打包失敗：${e.message.slice(0, 60)}`)
  }
}
