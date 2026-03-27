/**
 * 決策審計鏈（JSONL 格式）
 *
 * 記錄每步分析的輸入、輸出、AI reasoning、token 消耗。
 * 用於 report 顯示「為何這個技術被分到這個分類」。
 */

import fs from 'fs'
import path from 'path'

export function createAuditTrail() {
  const entries = []

  return {
    record(entry) {
      entries.push({ timestamp: new Date().toISOString(), ...entry })
    },

    entries() {
      return entries
    },

    save(baseDir) {
      const dir = path.join(baseDir, '.cache', 'audit')
      fs.mkdirSync(dir, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filePath = path.join(dir, `${ts}-pipeline.jsonl`)
      const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n'
      fs.writeFileSync(filePath, content, 'utf8')

      // 保留最近 10 次
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort().reverse()
      for (const f of files.slice(10)) {
        fs.unlinkSync(path.join(dir, f))
      }

      return filePath
    },

    /** 精簡版：給 report.mjs 用 */
    toSummary() {
      return entries.map(e => {
        const parts = [e.phase]
        if (e.repo) parts.push(e.repo)
        parts.push(e.action)
        if (e.reasoning) parts.push(`— ${e.reasoning.slice(0, 80)}`)
        if (e.tokens?.costUSD) parts.push(`$${e.tokens.costUSD.toFixed(4)}`)
        return parts.join(' | ')
      })
    },
  }
}
