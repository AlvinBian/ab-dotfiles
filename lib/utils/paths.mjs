/**
 * ESM 路徑工具 — 取代每個檔案的 __dirname boilerplate
 */

import path from 'path'
import { fileURLToPath } from 'url'

export const getDirname = (importMeta) => path.dirname(fileURLToPath(importMeta.url))
export const getRepoRoot = (importMeta) => path.resolve(getDirname(importMeta), '..', '..')
