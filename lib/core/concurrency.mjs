/**
 * 並行控制工具 — 取代手寫的 Promise.race 循環
 */

/**
 * 帶並行限制的 map
 *
 * @param {Array} items - 要處理的項目
 * @param {Function} fn - async (item, index) => result
 * @param {Object} [opts]
 * @param {number} [opts.concurrency=3] - 最大並行數
 * @param {Function} [opts.onProgress] - ({ done, total, result }) => void
 * @returns {Promise<Array>} 結果陣列（順序與 items 一致）
 */
export async function pMap(items, fn, { concurrency = 3, onProgress } = {}) {
	const results = new Array(items.length);
	const executing = new Set();

	for (const [i, item] of items.entries()) {
		const task = fn(item, i).then((result) => {
			executing.delete(task);
			results[i] = result;
			onProgress?.({ done: i + 1, total: items.length, result });
			return result;
		});
		executing.add(task);

		if (executing.size >= concurrency) {
			await Promise.race(executing);
		}
	}

	await Promise.all(executing);
	return results;
}
