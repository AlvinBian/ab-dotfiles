/**
 * ECC 外部資源選擇互動 UI
 *
 * 流程：AI 推薦摘要 → 確認/調整/查看全部/跳過
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { filterItems } from '../source-sync.mjs'
import { handleCancel, multiselectWithAll } from '../ui.mjs'

function extractDesc(content, fallbackName) {
  const lines = (content || '').split('\n')
  let inFrontmatter = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '---') { inFrontmatter = !inFrontmatter; continue }
    if (inFrontmatter) continue
    if (!trimmed) continue
    const desc = trimmed.replace(/^#+\s*/, '').trim()
    if (desc && desc !== '---') return desc
  }
  const descMatch = (content || '').match(/^description:\s*>?\s*\n?\s*(.+)/m)
  return descMatch ? descMatch[1].trim().split(/[。.]/)[0] : fallbackName.replace('.md', '')
}

export async function selectEcc({ eccFetchResult, existingNames, detectedSkills, allLangs, eccAiPromise }) {
  if (!eccFetchResult?.sources?.length) return null

  const allFilteredItems = { commands: [], agents: [], rules: [] }
  let totalEcc = 0

  for (const src of eccFetchResult.sources) {
    const filtered = filterItems(
      { commands: src.allFiles.commands, agents: src.allFiles.agents, rules: src.allFiles.rules },
      detectedSkills.length > 0 ? detectedSkills : allLangs.map(l => l.toLowerCase()),
      existingNames
    )
    for (const type of ['commands', 'agents', 'rules']) {
      allFilteredItems[type].push(...(filtered[type] || []))
    }
    totalEcc += (filtered.commands?.length || 0) + (filtered.agents?.length || 0) + (filtered.rules?.length || 0)
  }

  if (totalEcc === 0) return null

  // 等待 AI 推薦
  let aiRec = null
  if (eccAiPromise) {
    const sEcc = p.spinner()
    sEcc.start('ECC AI 推薦分析中...')
    aiRec = await eccAiPromise
    sEcc.stop(aiRec?.recommended?.length ? `ECC AI 推薦 ${aiRec.recommended.length} 個` : 'ECC AI 推薦完成')
  }
  // AI 推薦可能含或不含 .md 後綴，統一為兩種形式都加入
  const aiRecommendedRaw = aiRec?.recommended || []
  const aiRecommended = new Set()
  for (const name of aiRecommendedRaw) {
    aiRecommended.add(name)
    aiRecommended.add(name.endsWith('.md') ? name : name + '.md')
    aiRecommended.add(name.replace(/\.md$/, ''))
  }
  const aiCount = aiRecommendedRaw.length

  // 按類型統計 AI 推薦
  const aiByType = { commands: [], agents: [], rules: [] }
  const restByType = { commands: [], agents: [], rules: [] }
  const typeLabels = { commands: 'Commands', agents: 'Agents', rules: 'Rules' }
  const typePrefixes = { commands: '/', agents: '@', rules: '' }

  for (const type of ['commands', 'agents', 'rules']) {
    for (const item of allFilteredItems[type]) {
      if (aiRecommended.has(item.name)) {
        aiByType[type].push(item)
      } else {
        restByType[type].push(item)
      }
    }
  }

  // 顯示 AI 推薦摘要（每個 item 帶完整描述）
  const aiTotal = aiByType.commands.length + aiByType.agents.length + aiByType.rules.length
  if (aiTotal > 0) {
    const previewLines = []
    for (const type of ['commands', 'agents', 'rules']) {
      if (!aiByType[type].length) continue
      previewLines.push(typeLabels[type])
      for (const item of aiByType[type]) {
        const desc = extractDesc(item.content, item.name)
        const prefix = typePrefixes[type]
        previewLines.push(`  ${prefix}${item.name.replace('.md', '')}  ${desc}`)
      }
    }
    const restCount = totalEcc - aiTotal
    p.log.info(`AI 推薦 ${aiTotal} 個 ECC（另有 ${restCount} 個可選）：`)
    p.log.message(previewLines.join('\n'))
  } else {
    p.log.info(`ECC 匹配 ${totalEcc} 個（AI 未推薦，需手動選擇）`)
  }

  // 選擇操作
  const options = []
  if (aiTotal > 0) {
    options.push({ value: 'ai', label: `安裝 AI 推薦 (${aiTotal})`, hint: '推薦' })
    options.push({ value: 'ai-edit', label: `AI 推薦 + 調整`, hint: '在推薦基礎上增減' })
  }
  options.push({ value: 'browse', label: `瀏覽全部 (${totalEcc})`, hint: '逐類型選擇' })
  options.push({ value: 'skip', label: '跳過 ECC' })

  const action = handleCancel(await p.select({ message: 'ECC 外部資源', options }))

  if (action === 'skip') return null

  const selNames = { commands: new Set(), agents: new Set(), rules: new Set() }

  if (action === 'ai') {
    // 直接用 AI 推薦
    for (const type of ['commands', 'agents', 'rules']) {
      for (const item of aiByType[type]) selNames[type].add(item.name)
    }
  } else if (action === 'ai-edit') {
    // AI 推薦為基礎，可增減
    for (const type of ['commands', 'agents', 'rules']) {
      const items = allFilteredItems[type]
      if (!items.length) continue
      const opts = items.map(item => {
        const desc = extractDesc(item.content, item.name)
        const isAi = aiRecommended.has(item.name)
        const badge = isAi ? `${pc.cyan('*')} ` : '  '
        return { value: item.name, label: `${badge}${typePrefixes[type]}${item.name.replace('.md', '')}  ${pc.dim(desc)}` }
      })
      const initVals = aiByType[type].map(i => i.name)
      const chosen = await multiselectWithAll({
        message: `${typeLabels[type]}（${items.length}）${pc.cyan(' * = AI 推薦')}`,
        options: opts,
        initialValues: initVals,
      })
      selNames[type] = new Set(chosen)
    }
  } else {
    // 瀏覽全部，無預選
    for (const type of ['commands', 'agents', 'rules']) {
      const items = allFilteredItems[type]
      if (!items.length) continue
      const opts = items.map(item => {
        const desc = extractDesc(item.content, item.name)
        return { value: item.name, label: `${typePrefixes[type]}${item.name.replace('.md', '')}  ${pc.dim(desc)}` }
      })
      const chosen = await multiselectWithAll({
        message: `${typeLabels[type]}（${items.length}）`,
        options: opts,
        initialValues: [],
      })
      selNames[type] = new Set(chosen)
    }
  }

  // 確認
  const total = selNames.commands.size + selNames.agents.size + selNames.rules.size
  if (total === 0) return null

  const parts = []
  if (selNames.commands.size) parts.push(`${selNames.commands.size} cmd`)
  if (selNames.agents.size) parts.push(`${selNames.agents.size} agent`)
  if (selNames.rules.size) parts.push(`${selNames.rules.size} rule`)
  const ok = handleCancel(await p.confirm({ message: `確認安裝 ${total} 個 ECC？（${parts.join(' + ')}）`, initialValue: true }))
  if (!ok) return selectEcc({ eccFetchResult, existingNames, detectedSkills, allLangs, eccAiPromise: null })

  return selNames
}
