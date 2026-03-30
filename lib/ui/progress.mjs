/**
 * 進度追蹤元件 — spinner + 子程序實時進度
 */

import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import pc from 'picocolors'
import ora from 'ora'

// ANSI 清除正則
const ANSI_RE = /\x1B\[[0-9;?]*[A-HJKSTfhilmnsu]|\x1B\][^\x07]*\x07/g
export const stripAnsi = s => s.replace(ANSI_RE, '').replace(/\r/g, '')

/**
 * 執行外部命令並實時顯示逐 item 的 spinner 進度
 *
 * parseProgress 返回值：
 *   - null：忽略此行
 *   - string：完成一個 item，使用該字串作為 label
 *   - { label: string }：同上
 *   - { statusOnly: true, label: string }：只更新 spinner 文字，不推進計數
 *
 * @param {string} cmd - 要執行的 shell 命令
 * @param {Object} opts
 * @param {string} [opts.cwd] - 工作目錄
 * @param {number} opts.total - 預期的總 item 數
 * @param {string} [opts.initStatus='準備中...'] - 初始狀態文字
 * @param {Function} opts.parseProgress - 行解析回調 (cleanLine) => result
 * @returns {Promise<void>}
 */
export function runWithProgress(cmd, { cwd, total, initStatus = '準備中...', parseProgress }) {
  return new Promise((resolve, reject) => {
    let current = 0
    let spinner = ora({ text: `${pc.dim(`[0/${total}]`)} ${initStatus}`, indent: 2 }).start()

    const child = spawn(cmd, { shell: true, cwd })
    let buf = ''
    const stderrChunks = []
    const decoder = new StringDecoder('utf8')

    child.stdout.on('data', chunk => {
      buf += decoder.write(chunk)
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        const result = parseProgress(stripAnsi(line))
        if (result === null) continue
        if (typeof result === 'object' && result.statusOnly) {
          spinner.text = `${pc.dim(`[${current}/${total}]`)} ${result.label}`
        } else if (current < total) {
          current++
          const label = typeof result === 'string' ? result : result.label
          spinner.succeed(`${pc.dim(`[${current}/${total}]`)} ${label}`)
          if (current < total) {
            spinner = ora({ text: `${pc.dim(`[${current}/${total}]`)} ...`, indent: 2 }).start()
          }
        }
      }
    })
    child.stderr.on('data', chunk => { stderrChunks.push(chunk) })

    child.on('close', code => {
      if (code !== 0) {
        spinner.fail(`${pc.dim(`[${current}/${total}]`)} ${pc.red('失敗')}`)
        const stderr = Buffer.concat(stderrChunks).toString().trim()
        reject(new Error(`exit ${code}${stderr ? `\n${stderr}` : ''}`))
      } else {
        if (current < total) {
          spinner.succeed(`${pc.dim(`[${total}/${total}]`)} 完成`)
        }
        resolve()
      }
    })
  })
}
