/**
 * build-plugin 步驟：打包 .plugin 檔案
 */

import * as p from '@clack/prompts'
import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import pc from 'picocolors'
import { stripAnsi } from '../ui/progress.mjs'

export async function handleBuildPlugin(repoDir, step, stepLabel) {
  const phases = step.phases || []
  const seen = new Set()
  const spinner = p.spinner()
  spinner.start(`${stepLabel}打包 plugin...`)

  try {
    const child = spawn(step.script, { shell: true, cwd: repoDir })
    let buf = ''
    const decoder = new StringDecoder('utf8')
    const completedPhases = []

    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => {
        buf += decoder.write(chunk)
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          const clean = stripAnsi(line)
          for (const phase of phases) {
            if (seen.has(phase)) continue
            if (phase === '打包完成') {
              if (/✅.*打包完成/.test(clean)) seen.add(phase)
            } else if (clean.includes(phase)) {
              seen.add(phase)
              completedPhases.push(phase)
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
