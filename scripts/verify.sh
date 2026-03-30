#!/bin/bash
# PR 合入前自動驗證腳本
set -e

cd "$(dirname "$0")/.."
echo "=== ab-dotfiles Verification ==="

# 1. JSON 合法性
echo ""
echo "--- JSON Validation ---"
node -e "JSON.parse(require('fs').readFileSync('config.json'))" && echo "✓ config.json"
node -e "JSON.parse(require('fs').readFileSync('claude/hooks.json'))" && echo "✓ hooks.json"

# 2. YAML frontmatter 檢查
echo ""
echo "--- Frontmatter Check ---"
MISSING=0
for f in claude/agents/*.md claude/commands/*.md claude/rules/*.md; do
  if ! head -1 "$f" | grep -q '^---$'; then
    echo "✗ $f missing frontmatter"
    MISSING=$((MISSING + 1))
  fi
done
if [ $MISSING -eq 0 ]; then
  echo "✓ All .md files have frontmatter"
fi

# 3. matchWhen 檢查
echo ""
echo "--- matchWhen Check ---"
MW_MISSING=0
for f in claude/agents/*.md claude/commands/*.md claude/rules/*.md; do
  if ! grep -q "matchWhen" "$f" 2>/dev/null; then
    echo "✗ $(basename $f) missing matchWhen"
    MW_MISSING=$((MW_MISSING + 1))
  fi
done
if [ $MW_MISSING -eq 0 ]; then
  echo "✓ All files have matchWhen"
fi

# 4. Module import 驗證
echo ""
echo "--- Module Import Check ---"
node -e "
const modules = [
  './lib/ui/prompts.mjs',
  './lib/ui/progress.mjs',
  './lib/ui/files.mjs',
  './lib/ui/preselect.mjs',
  './lib/install/index.mjs',
  './lib/install/common.mjs',
  './lib/utils/paths.mjs',
  './lib/utils/concurrency.mjs',
  './lib/session.mjs',
  './lib/repo-select.mjs',
  './lib/pipeline/tech-select-ui.mjs',
  './lib/pipeline/ecc-select-ui.mjs',
]
Promise.all(modules.map(m => import(m).then(() => '✓ ' + m).catch(e => '✗ ' + m + ': ' + e.message)))
  .then(results => {
    results.forEach(r => console.log(r))
    const fails = results.filter(r => r.startsWith('✗'))
    if (fails.length > 0) process.exit(1)
  })
"

# 5. 檔案統計
echo ""
echo "--- File Stats ---"
AGENTS=$(ls claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
COMMANDS=$(ls claude/commands/*.md 2>/dev/null | wc -l | tr -d ' ')
RULES=$(ls claude/rules/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Agents: $AGENTS | Commands: $COMMANDS | Rules: $RULES"

# 6. 無殘留舊路徑
echo ""
echo "--- Old Import Check ---"
OLD_IMPORTS=$(grep -rn "from.*['\"]\.\.*/ui\.mjs['\"]" lib/ bin/ 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
OLD_IH=$(grep -rn "from.*install-handlers" lib/ bin/ 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
if [ "$OLD_IMPORTS" -eq 0 ] && [ "$OLD_IH" -eq 0 ]; then
  echo "✓ No legacy import paths found"
else
  echo "✗ Found $OLD_IMPORTS ui.mjs refs + $OLD_IH install-handlers refs"
fi

echo ""
echo "=== Verification Complete ==="
