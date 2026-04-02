/**
 * 決策審計鏈（JSONL 格式）
 *
 * 記錄每步分析的輸入、輸出、AI reasoning、token 消耗。
 * 用於 report 顯示「為何這個技術被分到這個分類」。
 *
 * 使用方式：
 *   const audit = createAuditTrail()
 *   audit.record({ phase: 'classify', repo: 'foo', action: 'ai-classify', reasoning: '...' })
 *   audit.save(baseDir)   // 寫入 .cache/audit/{timestamp}-pipeline.jsonl
 *   audit.toSummary()     // 給 report.mjs 的簡短摘要陣列
 */

import fs from "node:fs";
import path from "node:path";

/**
 * 建立審計鏈實例
 *
 * 回傳一個帶有 record / entries / save / toSummary 方法的物件。
 * 所有 record 呼叫的資料保存在記憶體中，呼叫 save() 才持久化。
 *
 * @returns {{ record: Function, entries: Function, save: Function, toSummary: Function }}
 */
export function createAuditTrail() {
	const entries = [];

	return {
		/**
		 * 記錄一筆審計條目
		 *
		 * @param {Object} entry - 任意結構，會自動加上 timestamp
		 * @param {string} entry.phase - 執行階段（fetch / classify / merge / ecc）
		 * @param {string} [entry.repo] - 對應的 repo 名稱
		 * @param {string} entry.action - 動作描述
		 * @param {string} [entry.reasoning] - AI 推理說明
		 * @param {Object} [entry.tokens] - token 消耗（含 costUSD）
		 */
		record(entry) {
			entries.push({ timestamp: new Date().toISOString(), ...entry });
		},

		/**
		 * 取得所有審計條目
		 *
		 * @returns {Object[]} 含 timestamp 的條目陣列
		 */
		entries() {
			return entries;
		},

		/**
		 * 將審計鏈寫入 JSONL 檔案，並保留最近 10 次
		 *
		 * @param {string} baseDir - 專案根目錄（寫入 baseDir/.cache/audit/）
		 * @returns {string} 寫入的檔案路徑
		 */
		save(baseDir) {
			const dir = path.join(baseDir, ".cache", "audit");
			fs.mkdirSync(dir, { recursive: true });
			// 時間戳作為檔名前綴，確保排序正確
			const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
			const filePath = path.join(dir, `${ts}-pipeline.jsonl`);
			const content = `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`;
			fs.writeFileSync(filePath, content, "utf8");

			// 保留最近 10 次，刪除舊檔
			const files = fs
				.readdirSync(dir)
				.filter((f) => f.endsWith(".jsonl"))
				.sort()
				.reverse();
			for (const f of files.slice(10)) {
				fs.unlinkSync(path.join(dir, f));
			}

			return filePath;
		},

		/**
		 * 產生精簡版摘要（給 report.mjs 用）
		 *
		 * 每條記錄格式：phase | repo | action | reasoning（截短 80 字）| $cost
		 *
		 * @returns {string[]} 摘要字串陣列
		 */
		toSummary() {
			return entries.map((e) => {
				const parts = [e.phase];
				if (e.repo) parts.push(e.repo);
				parts.push(e.action);
				if (e.reasoning) parts.push(`— ${e.reasoning.slice(0, 80)}`);
				if (e.tokens?.costUSD) parts.push(`$${e.tokens.costUSD.toFixed(4)}`);
				return parts.join(" | ");
			});
		},
	};
}
