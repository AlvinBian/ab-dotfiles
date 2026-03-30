/**
 * ESM 路徑工具 — 取代每個檔案的 __dirname boilerplate
 */

import path from 'path'
import { fileURLToPath } from 'url'

/**
 * 取得 ESM 模組所在目錄的絕對路徑（取代 CommonJS 的 __dirname）
 *
 * @param {ImportMeta} importMeta - 模組的 import.meta 物件
 * @returns {string} 該模組檔案所在目錄的絕對路徑
 */
export const getDirname = (importMeta) => path.dirname(fileURLToPath(importMeta.url))

/**
 * 取得專案根目錄的絕對路徑
 *
 * 假設專案結構為 <repo-root>/lib/<subdir>/此模組，
 * 因此從 importMeta.url 向上兩層即為根目錄。
 *
 * @param {ImportMeta} importMeta - 模組的 import.meta 物件
 * @returns {string} 專案根目錄的絕對路徑
 */
export const getRepoRoot = (importMeta) => path.resolve(getDirname(importMeta), '..', '..')
