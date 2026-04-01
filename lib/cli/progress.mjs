/**
 * 進度追蹤元件 — 靜態逐行輸出（不用 spinner 避免 listr2 衝突）
 */

import { spawn } from 'child_process'
import { StringDecoder } from 'string_decoder'
import pc from 'picocolors'

// ANSI escape sequence 正則：包含 CSI 控制序列（\x1B[...）與 OSC 序列（\x1B]...\x07）
const ANSI_RE = /\x1B\[[0-9;?]*[A-HJKSTfhilmnsu]|\x1B\][^\x07]*\x07/g

/**
 * 移除字串中的 ANSI 色彩碼與控制序列
 *
 * 同時移除 carriage return（\r）以避免行覆蓋符號殘留在輸出中。
 *
 * @param {string} s - 含 ANSI 碼的原始字串
 * @returns {string} 去除控制序列後的純文字字串
 */
export const stripAnsi = s => s.replace(ANSI_RE, '').replace(/\r/g, '')

/**
 * 執行外部命令並實時顯示逐 item 的進度（靜態行，無 spinner 動畫）
 *
 * parseProgress 返回值：
 *   - null：忽略此行
 *   - string：完成一個 item，使用該字串作為 label
 *   - { label: string }：同上
 *   - { statusOnly: true, label: string }：只更新狀態，不推進計數
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

    const [spawnCmd, ...spawnArgs] = cmd.trim().split(/\s+/)
    const child = spawn(spawnCmd, spawnArgs, { cwd })
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
          // 狀態更新不推進計數，靜默
        } else if (current < total) {
          current++
          const label = typeof result === 'string' ? result : result.label
          console.log(`  ${pc.green('✔')} ${pc.dim(`[${current}/${total}]`)} ${label}`)
        }
      }
    })
    child.stderr.on('data', chunk => { stderrChunks.push(chunk) })

    child.on('close', code => {
      if (code !== 0) {
        console.log(`  ${pc.red('✗')} ${pc.dim(`[${current}/${total}]`)} ${pc.red('失敗')}`)
        const stderr = Buffer.concat(stderrChunks).toString().trim()
        reject(new Error(`exit ${code}${stderr ? `\n${stderr}` : ''}`))
      } else {
        if (current < total) {
          console.log(`  ${pc.green('✔')} ${pc.dim(`[${total}/${total}]`)} 完成`)
        }
        resolve()
      }
    })
  })
}
