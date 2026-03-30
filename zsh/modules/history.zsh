# ── 歷史記錄設定（全局 + 專案分離）─────────────────────────────

# 全局歷史（所有 shell 共享）
HISTFILE="$HOME/.zsh_history"
HISTSIZE=50000
SAVEHIST=50000

setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_SAVE_NO_DUPS
setopt HIST_REDUCE_BLANKS
setopt INC_APPEND_HISTORY
setopt SHARE_HISTORY

# ── 專案歷史（自動切換）────────────────────────────────────────
# 進入 git repo 時自動切換到專案專屬歷史檔
# 離開時回到全局歷史
# 專案歷史存放在 ~/.zsh/history.d/{repo-name}

_ZSH_HISTORY_GLOBAL="$HOME/.zsh_history"
_ZSH_HISTORY_DIR="$HOME/.zsh/history.d"

_update_project_history() {
  local git_root
  git_root=$(git rev-parse --show-toplevel 2>/dev/null)

  if [[ -n "$git_root" ]]; then
    local repo_name=$(basename "$git_root")
    local project_hist="$_ZSH_HISTORY_DIR/$repo_name"
    mkdir -p "$_ZSH_HISTORY_DIR"

    if [[ "$HISTFILE" != "$project_hist" ]]; then
      # 保存當前歷史到舊檔案
      fc -W 2>/dev/null
      # 切換到專案歷史
      HISTFILE="$project_hist"
      # 載入專案歷史 + 全局歷史
      fc -R "$_ZSH_HISTORY_GLOBAL" 2>/dev/null
      fc -R "$project_hist" 2>/dev/null
    fi
  else
    if [[ "$HISTFILE" != "$_ZSH_HISTORY_GLOBAL" ]]; then
      fc -W 2>/dev/null
      HISTFILE="$_ZSH_HISTORY_GLOBAL"
      fc -R "$_ZSH_HISTORY_GLOBAL" 2>/dev/null
    fi
  fi
}

# 每次 cd 時自動切換
autoload -Uz add-zsh-hook
add-zsh-hook chpwd _update_project_history

# 初始化時執行一次
_update_project_history
