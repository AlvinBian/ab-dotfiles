#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Claude Code Slack 通知分發器
#
# 用法：slack-dispatch.sh <event> [--msg "..."] [--file "..."] [--cmd "..."]
#
# 分級：P0（必達）P1（重要）P2（資訊）
# 抑制：CLAUDE_SLACK_LEVEL=quiet|normal|verbose
# 冷卻：同類事件在冷卻期內不重複發送
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── 配置 ──────────────────────────────────────────────────────

# 載入 .env（支持 ab-dotfiles 目錄或 HOME）
SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
for envfile in "$SCRIPT_DIR/.env" "$HOME/.env"; do
  [ -f "$envfile" ] && . "$envfile" 2>/dev/null && break
done

TOKEN="${SLACK_BOT_TOKEN:-}"
CHANNEL="${SLACK_NOTIFY_CHANNEL:-}"
LEVEL="${CLAUDE_SLACK_LEVEL:-normal}"
MIN_SESSION="${CLAUDE_SLACK_MIN_SESSION_SECS:-300}"
STATE_DIR="/tmp/claude-slack"
SESSION="${CLAUDE_SESSION_ID:-unknown}"
SESSION_SHORT="${SESSION:0:8}"

# 無 token → 靜默退出
[ -z "$TOKEN" ] && exit 0
[ -z "$CHANNEL" ] && exit 0
command -v curl >/dev/null 2>&1 || exit 0

mkdir -p "$STATE_DIR"

# ── 工具函式 ──────────────────────────────────────────────────

get_context() {
  REPO=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || echo 'unknown')")
  BRANCH=$(git branch --show-current 2>/dev/null || echo "")
  TICKET=$(echo "$BRANCH" | grep -oE '[A-Z]+-[0-9]+' | head -1 || echo "")
  PROJECT_INFO="\`$REPO\`"
  [ -n "$BRANCH" ] && PROJECT_INFO="$PROJECT_INFO · \`$BRANCH\`"
  [ -n "$TICKET" ] && PROJECT_INFO="$PROJECT_INFO · $TICKET"
}

should_notify() {
  local level="$1"
  case "$level" in
    P0) return 0 ;;  # 必達
    P1) [ "$LEVEL" != "quiet" ] && return 0 || return 1 ;;
    P2) [ "$LEVEL" = "verbose" ] && return 0 || return 1 ;;
  esac
  return 1
}

is_rate_limited() {
  local event="$1"
  local cooldown="${2:-60}"
  local lock="$STATE_DIR/rl_${SESSION_SHORT}_${event}"

  if [ -f "$lock" ]; then
    local age=$(( $(date +%s) - $(stat -f %m "$lock" 2>/dev/null || echo 0) ))
    [ "$age" -lt "$cooldown" ] && return 0  # rate limited
  fi

  touch "$lock"
  return 1  # not limited
}

send_slack() {
  local msg="$1"
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d "$(jq -n --arg ch "$CHANNEL" --arg txt "$msg" '{channel: $ch, text: $txt}')" \
    >/dev/null 2>&1 || true
}

get_session_duration() {
  local start_file="$STATE_DIR/start_$SESSION_SHORT"
  if [ -f "$start_file" ]; then
    local start_ts=$(cat "$start_file")
    local now=$(date +%s)
    echo $(( now - start_ts ))
  else
    echo 0
  fi
}

# ── 解析參數 ──────────────────────────────────────────────────

EVENT="${1:-}"
shift || true

MSG="" FILE="" CMD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --msg)  MSG="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --cmd)  CMD="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# ── 事件處理 ──────────────────────────────────────────────────

case "$EVENT" in

  # ━━ P0：危險命令被攔截 ━━
  dangerous-command)
    should_notify P0 || exit 0
    is_rate_limited "danger" 30 && exit 0
    get_context
    send_slack "🚨 *Claude Code：危險命令被攔截*

• 專案：$PROJECT_INFO
• 攔截模式：\`${CMD:0:60}\`

Claude 嘗試執行破壞性操作，已被阻止。"
    ;;

  # ━━ P0：受保護檔案被阻止 ━━
  protected-file)
    should_notify P0 || exit 0
    is_rate_limited "protect" 30 && exit 0
    get_context
    send_slack "🔒 *Claude Code：受保護檔案寫入被阻止*

• 專案：$PROJECT_INFO
• 檔案：\`$FILE\`"
    ;;

  # ━━ P1：Session 開始（記錄時間戳）━━
  session-start)
    date +%s > "$STATE_DIR/start_$SESSION_SHORT"
    should_notify P2 || exit 0
    get_context
    send_slack "🚀 *Claude Code：Session 開始*

• 專案：$PROJECT_INFO"
    ;;

  # ━━ P1：Session 結束 ━━
  session-stop)
    DURATION=$(get_session_duration)
    # 短會話不通知
    [ "$DURATION" -lt "$MIN_SESSION" ] && exit 0
    should_notify P1 || exit 0
    get_context
    MINS=$(( DURATION / 60 ))
    send_slack "✅ *Claude Code：任務完成*

• 專案：$PROJECT_INFO
• 耗時：${MINS} 分鐘
${MSG:+
_${MSG}_}"
    # 清理 session 狀態
    rm -f "$STATE_DIR/start_$SESSION_SHORT" "$STATE_DIR"/rl_"${SESSION_SHORT}"_*
    ;;

  # ━━ P1：Context 壓縮 ━━
  session-compact)
    should_notify P1 || exit 0
    is_rate_limited "compact" 600 && exit 0
    get_context
    send_slack "🔄 *Claude Code：Context 已壓縮*

• 專案：$PROJECT_INFO

工作記憶已重置，回來後建議重新確認任務上下文。"
    ;;

  # ━━ P1：Claude 需要注意（Notification hook）━━
  agent-blocked)
    should_notify P1 || exit 0
    is_rate_limited "attention" 60 && exit 0
    get_context
    send_slack "💬 *Claude Code：需要你的注意*

• 專案：$PROJECT_INFO
${MSG:+
_${MSG}_}"
    ;;

  # ━━ P1：子代理失敗 ━━
  subagent-fail)
    should_notify P1 || exit 0
    is_rate_limited "subagent" 120 && exit 0
    get_context
    send_slack "⚠️ *Claude Code：子代理失敗*

• 專案：$PROJECT_INFO
${MSG:+• 原因：_${MSG}_}"
    ;;

  # ━━ P2：檔案編輯摘要（verbose only）━━
  file-edited)
    should_notify P2 || exit 0
    # 累積到檔案，不立即發送
    echo "$FILE" >> "$STATE_DIR/edits_$SESSION_SHORT"
    is_rate_limited "edits" 120 && exit 0
    # 發送累積的摘要
    if [ -f "$STATE_DIR/edits_$SESSION_SHORT" ]; then
      COUNT=$(wc -l < "$STATE_DIR/edits_$SESSION_SHORT" | tr -d ' ')
      FILES=$(tail -5 "$STATE_DIR/edits_$SESSION_SHORT" | xargs -I{} basename {} | sort -u | paste -sd '、' -)
      get_context
      send_slack "📝 *Claude Code：檔案編輯*

• 專案：$PROJECT_INFO
• 最近 ${COUNT} 次編輯：${FILES}"
      > "$STATE_DIR/edits_$SESSION_SHORT"  # 清空
    fi
    ;;

  *)
    # 未知事件，靜默
    ;;
esac

exit 0
