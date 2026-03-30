/**
 * CLAUDE.md 生成 — 3 種模板（完整/精簡/最小）+ AI 生成 + 靜態 fallback
 */

import { callClaudeJSON } from '../claude-cli.mjs'
import { AI_ECC_MODEL, AI_ECC_TIMEOUT } from '../constants.mjs'

/**
 * 生成 CLAUDE.md 內容
 *
 * @param {Object} opts
 * @param {string} opts.repoName - repo 名稱
 * @param {string} opts.role - main | temp | tool
 * @param {string} opts.reasoning - AI 分析的一句話摘要
 * @param {Object} opts.stacks - { category: [techIds] }
 * @param {Object} opts.meta - { languages, description, stars }
 * @returns {Promise<string>} CLAUDE.md 內容
 */
export async function generateClaudeMd({ repoName, role, reasoning, stacks, meta }) {
  if (role === 'tool') {
    return generateToolTemplate(repoName, meta)
  }

  if (role === 'temp') {
    return generateTempTemplate(repoName, reasoning, stacks, meta)
  }

  // main: 嘗試 AI 生成，失敗用靜態模板
  try {
    return await generateMainWithAI(repoName, reasoning, stacks, meta)
  } catch {
    return generateMainTemplate(repoName, reasoning, stacks, meta)
  }
}

// ── 模板 ──

function generateToolTemplate(repoName, meta) {
  return `# ${repoName}\n\n${meta?.description || repoName}。使用方式見 README。\n`
}

function generateTempTemplate(repoName, reasoning, stacks, meta) {
  const techList = stacks
    ? Object.entries(stacks).map(([cat, items]) => `${items.join(' · ')}`).join(' · ')
    : ''

  return `# ${repoName}

${reasoning || meta?.description || repoName}

## 快速上手
- 安裝依賴後啟動開發
- 分支命名：\`feat/{TICKET}-{desc}\`
- PR base：\`develop\` 或 \`main\`

## 技術棧
${techList || '見 package.json'}

## 注意事項
- 遵循 .claude/rules/ 中的規範
- Commit 格式：Conventional Commits
`
}

function generateMainTemplate(repoName, reasoning, stacks, meta) {
  const stackSections = stacks
    ? Object.entries(stacks).map(([cat, items]) => `- ${cat}：${items.join(', ')}`).join('\n')
    : ''

  return `# ${repoName}

${reasoning || meta?.description || repoName}

## 技術棧
${stackSections || '見 package.json'}

## 開發規範
- 遵循 .claude/rules/ 中的規範
- Commit 格式：Conventional Commits
- PR 必須通過 code review
`
}

async function generateMainWithAI(repoName, reasoning, stacks, meta) {
  const stackText = stacks
    ? Object.entries(stacks).map(([cat, items]) => `${cat}: ${items.join(', ')}`).join('\n')
    : ''

  const prompt = `為 "${repoName}" 生成 CLAUDE.md，這是 Claude Code 的專案上下文檔案。

專案摘要：${reasoning || meta?.description || ''}
技術棧：
${stackText}

生成以下結構的 Markdown（不含 JSON 包裹，直接回傳 Markdown）：
# {repoName}
{一句話描述}
## 技術棧（列出主要框架和工具）
## 架構要點（3-5 點，幫助 AI 理解專案結構）
## 開發規範（Commit 格式、PR 流程）
## 常用指令（dev/test/build）

控制在 30 行以內。`

  const result = await callClaudeJSON(prompt, {
    model: AI_ECC_MODEL,
    effort: 'low',
    timeoutMs: AI_ECC_TIMEOUT,
    retries: 0,
  })

  // callClaudeJSON 可能返回 { result: "..." } 或純文字
  if (typeof result === 'string') return result
  if (result?.result) return result.result
  throw new Error('AI generation failed')
}
