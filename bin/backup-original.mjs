#!/usr/bin/env node

/**
 * 首次使用前備份原始配置 → ~/.ab-dotfiles-original/
 *
 * 備份：~/.zshrc、~/.claude/（整個目錄）
 * 只在首次執行，已有備份不覆蓋。
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";

const HOME = process.env.HOME;
const BACKUP_DIR = path.join(HOME, ".ab-dotfiles-original");

function backupItem(src, destName) {
	const dest = path.join(BACKUP_DIR, destName);
	if (!fs.existsSync(src)) return null;

	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		fs.cpSync(src, dest, { recursive: true });
	} else {
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(src, dest);
	}
	return destName;
}

export function ensureOriginalBackup() {
	if (fs.existsSync(BACKUP_DIR)) {
		// 檢查備份是否完整（若有新增項目但備份缺失，補備份）
		const TIMESTAMP_FILE = path.join(BACKUP_DIR, ".timestamp");
		const backupTime = fs.existsSync(TIMESTAMP_FILE)
			? new Date(fs.readFileSync(TIMESTAMP_FILE, "utf8").trim()).getTime()
			: 0;

		const CRITICAL_ITEMS = [
			[path.join(HOME, ".zshrc"), "zshrc"],
			[path.join(HOME, ".claude"), "claude"],
		];
		let needsUpdate = false;
		for (const [src, name] of CRITICAL_ITEMS) {
			if (!fs.existsSync(src)) continue;
			const dest = path.join(BACKUP_DIR, name);
			if (!fs.existsSync(dest)) {
				needsUpdate = true; // 備份存在但缺少此項目
				break;
			}
			// 若源文件比備份新且備份不是今天的，標記需要更新（偵測手動修改）
			const srcMtime = fs.statSync(src).mtimeMs;
			if (
				srcMtime > backupTime &&
				!fs.existsSync(path.join(BACKUP_DIR, ".manual-preserved"))
			) {
				needsUpdate = true;
				break;
			}
		}
		if (!needsUpdate) return false; // 已備份且完整
		// 備份不完整或已過時 — 補備份缺失項目（不覆蓋已有的）
		const backed = [];
		for (const [src, name] of [
			[path.join(HOME, ".zshrc"), "zshrc"],
			[path.join(HOME, ".zshrc.local"), "zshrc.local"],
			[path.join(HOME, ".zsh"), "zsh"],
			[path.join(HOME, ".claude"), "claude"],
			[path.join(HOME, ".zsh_history"), "zsh_history"],
			[path.join(HOME, ".ripgreprc"), "ripgreprc"],
		]) {
			const dest = path.join(BACKUP_DIR, name);
			if (fs.existsSync(dest)) continue; // 已備份，保留不動
			const result = backupItem(src, name);
			if (result) backed.push(result);
		}
		fs.writeFileSync(TIMESTAMP_FILE, new Date().toISOString());
		return backed.length > 0 ? backed : false;
	}

	fs.mkdirSync(BACKUP_DIR, { recursive: true });

	const backed = [];
	const items = [
		[path.join(HOME, ".zshrc"), "zshrc"],
		[path.join(HOME, ".zshrc.local"), "zshrc.local"],
		[path.join(HOME, ".zsh"), "zsh"],
		[path.join(HOME, ".claude"), "claude"],
		[path.join(HOME, ".zsh_history"), "zsh_history"],
		[path.join(HOME, ".ripgreprc"), "ripgreprc"],
	];

	for (const [src, name] of items) {
		const result = backupItem(src, name);
		if (result) backed.push(result);
	}

	// 記錄備份時間
	fs.writeFileSync(
		path.join(BACKUP_DIR, ".timestamp"),
		new Date().toISOString(),
	);

	return backed;
}

// 直接執行時顯示結果
if (process.argv[1]?.endsWith("backup-original.mjs")) {
	const result = ensureOriginalBackup();
	if (result === false) {
		p.log.info(`原始備份已存在：${BACKUP_DIR}`);
	} else if (result.length > 0) {
		p.log.success(
			`已備份原始配置 → ${BACKUP_DIR}\n${result.map((r) => `  ${r}`).join("\n")}`,
		);
	} else {
		p.log.info("無需備份（沒有找到現有配置）");
	}
}
