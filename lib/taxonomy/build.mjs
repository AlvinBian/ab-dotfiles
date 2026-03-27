#!/usr/bin/env node
/**
 * 從 awesome-* 列表建構套件分類索引
 *
 * 用法：node lib/taxonomy/build.mjs
 * 產出：lib/taxonomy/node-packages.json + php-packages.json
 *
 * 資料來源：
 *   - sindresorhus/awesome-nodejs (npm)
 *   - ziadoz/awesome-php (composer)
 *   - vuejs/awesome-vue (vue ecosystem)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 載入分類映射
const { mapping } = JSON.parse(fs.readFileSync(path.join(__dirname, 'categories.json'), 'utf8'))

/**
 * 從 awesome-list markdown 解析 { awesomeCategory: [packageName] }
 */
function parseAwesomeMarkdown(content) {
  const result = {}
  let currentCategory = null

  for (const line of content.split('\n')) {
    // ### Category Name 或 ## Category Name
    const headingMatch = line.match(/^#{2,4}\s+(.+)/)
    if (headingMatch) {
      currentCategory = headingMatch[1].trim()
      continue
    }
    // - [PackageName](url) - description
    if (currentCategory && line.match(/^-\s+\[/)) {
      const nameMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (nameMatch) {
        if (!result[currentCategory]) result[currentCategory] = []
        result[currentCategory].push({
          name: nameMatch[1],
          url: nameMatch[2],
        })
      }
    }
  }
  return result
}

/**
 * 正規化 npm 套件名（去 scope、轉小寫）
 */
function normalizeNpm(name) {
  return name.toLowerCase()
    .replace(/^@/, '').replace(/\//g, '-')
    .replace(/\.js$/i, '').replace(/\.ts$/i, '')
}

/**
 * 從 GitHub URL 推斷 npm 套件名
 */
function inferNpmName(name, url) {
  // 先用 display name
  const lower = name.toLowerCase()
  // 常見映射
  const known = {
    'socket.io': 'socket.io',
    'next.js': 'next',
    'nuxt.js': 'nuxt',
    'day.js': 'dayjs',
    'kefir.js': 'kefir',
    'inquirer.js': 'inquirer',
    'highland.js': 'highland',
    'express': 'express',
    'koa': 'koa',
    'fastify': 'fastify',
    'nest': '@nestjs/core',
    'hono': 'hono',
    'vitest': 'vitest',
    'jest': 'jest',
    'webpack': 'webpack',
    'vite': 'vite',
    'rollup': 'rollup',
    'gulp': 'gulp',
    'parcel': 'parcel',
    'prisma': '@prisma/client',
    'drizzle orm': 'drizzle-orm',
  }
  if (known[lower]) return known[lower]
  // 從 URL 取 repo name 作為 npm name
  const repoMatch = url?.match(/github\.com\/[^/]+\/([^/#]+)/)
  if (repoMatch) return repoMatch[1].toLowerCase()
  return lower
}

async function main() {
  console.log('Building taxonomy from awesome-* lists...\n')

  // 1. awesome-nodejs
  console.log('Fetching awesome-nodejs...')
  const nodeResp = await fetch('https://raw.githubusercontent.com/sindresorhus/awesome-nodejs/main/readme.md')
  const nodeContent = await nodeResp.text()
  const nodeCategories = parseAwesomeMarkdown(nodeContent)

  const nodePackages = {}
  let nodeCount = 0
  for (const [cat, pkgs] of Object.entries(nodeCategories)) {
    const stdCat = mapping[cat]
    if (!stdCat) continue
    for (const pkg of pkgs) {
      const npmName = inferNpmName(pkg.name, pkg.url)
      nodePackages[npmName] = stdCat
      nodePackages[normalizeNpm(npmName)] = stdCat
      nodeCount++
    }
  }
  console.log(`  ${nodeCount} packages → ${new Set(Object.values(nodePackages)).size} categories`)

  // 2. awesome-php
  console.log('Fetching awesome-php...')
  const phpResp = await fetch('https://raw.githubusercontent.com/ziadoz/awesome-php/master/README.md')
  const phpContent = await phpResp.text()
  const phpCategories = parseAwesomeMarkdown(phpContent)

  const phpPackages = {}
  let phpCount = 0
  // awesome-php: ### heading + * [Name](url) 格式
  let currentH3 = null
  for (const line of phpContent.split('\n')) {
    const h3 = line.match(/^### (.+)/)
    if (h3) { currentH3 = h3[1].trim(); continue }
    if (currentH3 && line.match(/^\*\s+\[/)) {
      const nameMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (nameMatch) {
        const stdCat = mapping[currentH3]
        if (!stdCat) continue
        const name = nameMatch[1].toLowerCase()
        const url = nameMatch[2]
        const repoMatch = url.match(/github\.com\/([^/#]+\/[^/#]+)/)
        if (repoMatch) phpPackages[repoMatch[1].toLowerCase()] = stdCat
        phpPackages[name] = stdCat
        phpCount++
      }
    }
  }
  console.log(`  ${phpCount} packages → ${new Set(Object.values(phpPackages)).size} categories`)

  // 3. 補充 Vue 生態常見套件（手動，awesome-vue 太碎）
  const vueExtras = {
    'vue': '前端框架', 'vue-router': '前端框架', 'vuex': '狀態管理',
    'pinia': '狀態管理', 'pinia-nuxt': '狀態管理', '@pinia/nuxt': '狀態管理',
    'nuxt': '前端框架', '@nuxt/ui': 'UI 元件庫', '@nuxt/image': 'UI 元件庫',
    'vee-validate': '表單驗證', 'vueuse': '工具函式', '@vueuse/core': '工具函式',
    'vue-i18n': '國際化', 'element-plus': 'UI 元件庫', 'vant': 'UI 元件庫',
    'ant-design-vue': 'UI 元件庫', 'naive-ui': 'UI 元件庫', 'vuetify': 'UI 元件庫',
    'quasar': 'UI 元件庫', 'primevue': 'UI 元件庫', 'headlessui': 'UI 元件庫',
    'swiper': 'UI 元件庫', 'tailwindcss': 'CSS 與樣式', 'sass': 'CSS 與樣式',
    'postcss': 'CSS 與樣式', 'bootstrap': 'CSS 與樣式', 'bootstrap-vue': 'UI 元件庫',
    'typescript': '建構工具', 'turbo': '建構工具', 'esbuild': '建構工具',
    'docker': '容器化', 'docker-compose': '容器化',
    'nginx': '基礎設施', 'redis': '資料庫', 'postgres': '資料庫', 'postgresql': '資料庫',
    'mysql': '資料庫', 'mongodb': '資料庫',
    'xstate': '狀態管理', 'mobx': '狀態管理', 'zustand': '狀態管理', 'recoil': '狀態管理',
    'react': '前端框架', 'next': '前端框架', 'remix': '前端框架',
    'angular': '前端框架', 'svelte': '前端框架', 'solid-js': '前端框架',
    'storybook': '建構工具', 'lottie-web': 'UI 元件庫',
    'axios': 'HTTP 與 API', 'qs': 'HTTP 與 API',
    'socket.io-client': '即時通訊', 'socket.io': '即時通訊',
  }
  for (const [name, cat] of Object.entries(vueExtras)) {
    if (!nodePackages[name]) nodePackages[name] = cat
    if (!nodePackages[normalizeNpm(name)]) nodePackages[normalizeNpm(name)] = cat
  }

  // 寫入
  const outDir = path.resolve(__dirname, '..', '..', '.cache', 'taxonomy')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'node-packages.json'), JSON.stringify(nodePackages, null, 2) + '\n')
  fs.writeFileSync(path.join(outDir, 'php-packages.json'), JSON.stringify(phpPackages, null, 2) + '\n')

  console.log(`\nDone! → ${outDir}`)
  console.log(`  node-packages.json: ${Object.keys(nodePackages).length} entries`)
  console.log(`  php-packages.json: ${Object.keys(phpPackages).length} entries`)
}

main().catch(console.error)
