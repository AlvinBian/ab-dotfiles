#!/usr/bin/env node

/**
 * 備份還原工具
 *
 * 用法：
 *   pnpm run restore          ← 互動式選擇備份版本還原
 *   pnpm run restore -- --list  ← 列出所有備份
 */

import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { cpDir } from "../lib/core/backup.mjs";
import { getDirname } from "../lib/core/paths.mjs";

const __dirname = getDirname(import.meta);
const REPO = path.resolve(__dirname, "..");
const BACKUP_BASE = path.join(REPO, "dist", "backup");
const HOME = process.env.HOME;

const args = process.argv.slice(2);
const flagList = args.includes("--list");

function getBackups() {
	if (!fs.existsSync(BACKUP_BASE)) return [];
	return fs
		.readdirSync(BACKUP_BASE, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => {
			const dir = path.join(BACKUP_BASE, d.name);
			const contents = fs.readdirSync(dir);
			return { name: d.name, dir, contents };
		})
		.sort((a, b) => b.name.localeCompare(a.name)); // 最新的在前
}

async function main() {
	console.log();
	p.intro(" ab-dotfiles 備份還原 ");

	const backups = getBackups();

	if (backups.length === 0) {
		p.log.warn(`沒有找到任何備份\n  備份目錄：${pc.dim(BACKUP_BASE)}`);
		p.outro("執行 pnpm run setup 會自動建立備份");
		return;
	}

	// 列出模式
	if (flagList) {
		const backupLines = backups
			.map((b) => `  ${pc.cyan(b.name)}  ${pc.dim(b.contents.join(", "))}`)
			.join("\n");
		p.log.info(`共 ${backups.length} 個備份：\n${backupLines}`);
		p.outro("");
		return;
	}

	// 互動式選擇
	const ORIGINAL_DIR = path.join(HOME, ".ab-dotfiles-original");
	const hasOriginal = fs.existsSync(ORIGINAL_DIR);

	const selected = await p.select({
		message: "選擇還原方式  ↑↓ 選擇 · Enter 確認",
		options: [
			...(hasOriginal
				? [
						{
							value: "__original__",
							label: `${pc.red("完全還原")}  恢復到首次 setup 前的原始狀態`,
							hint: "~/.ab-dotfiles-original/",
						},
					]
				: []),
			...backups.map((b) => ({
				value: b.name,
				label: `${b.name}  ${pc.dim(b.contents.join(", "))}`,
			})),
		],
	});
	if (p.isCancel(selected)) {
		p.cancel("已取消");
		process.exit(0);
	}

	// 完全還原（合併自 restore-original）
	if (selected === "__original__") {
		const items = fs.readdirSync(ORIGINAL_DIR);
		p.log.info(
			`即將從 ${pc.cyan("~/.ab-dotfiles-original/")} 恢復：\n  ${items.join(", ")}`,
		);
		const confirm = await p.confirm({
			message: "確認完全還原？這會覆蓋當前所有 Claude 和 ZSH 配置",
			initialValue: false,
		});
		if (p.isCancel(confirm) || !confirm) {
			p.cancel("已取消");
			process.exit(0);
		}
		const s = p.spinner();
		s.start("完全還原中...");
		for (const item of items) {
			const src = path.join(ORIGINAL_DIR, item);
			const dest = path.join(HOME, item.startsWith(".") ? item : `.${item}`);
			try {
				const stat = fs.statSync(src);
				if (stat.isDirectory()) cpDir(src, dest);
				else fs.copyFileSync(src, dest);
			} catch (err) {
				p.log.warn(`還原 ${item} 失敗：${err.message}`);
			}
		}
		s.stop("已恢復到首次 setup 前的原始狀態");
		p.outro(`執行 ${pc.cyan("source ~/.zshrc")} 讓設定生效`);
		return;
	}

	const backup = backups.find((b) => b.name === selected);

	// 確認還原
	const restoreLines = backup.contents
		.map((item) => {
			const targetPath =
				item === "zshrc"
					? path.join(HOME, ".zshrc")
					: path.join(HOME, `.${item}`);
			return `  ${pc.yellow(item)} → ${targetPath}`;
		})
		.join("\n");
	p.log.info(`即將還原 ${pc.cyan(selected)}：\n${restoreLines}`);

	const confirm = await p.confirm({
		message: "確認還原？  Y 確認 · n 取消",
		initialValue: false,
	});
	if (p.isCancel(confirm) || !confirm) {
		p.cancel("已取消");
		process.exit(0);
	}

	// 執行還原
	const s = p.spinner();
	s.start("還原中...");

	for (const item of backup.contents) {
		const src = path.join(backup.dir, item);
		let dest;
		if (item === "zshrc") dest = path.join(HOME, ".zshrc");
		else if (item === "zsh") dest = path.join(HOME, ".zsh");
		else if (item === "claude") dest = path.join(HOME, ".claude");
		else dest = path.join(HOME, `.${item}`);

		try {
			const stat = fs.statSync(src);
			if (stat.isDirectory()) {
				cpDir(src, dest);
			} else {
				fs.copyFileSync(src, dest);
			}
		} catch (err) {
			p.log.warn(`還原 ${item} 失敗：${err.message}`);
		}
	}

	const zshHint =
		backup.contents.includes("zshrc") || backup.contents.includes("zsh")
			? `\n  執行 ${pc.cyan("source ~/.zshrc")} 讓 zsh 設定生效`
			: "";
	s.stop(`已還原備份 ${pc.cyan(selected)}${zshHint}`);
	p.outro("✔ 還原完成");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
