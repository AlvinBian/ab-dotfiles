# ── FZF 整合 ──────────────────────────────────────────────────────
# key-bindings（Ctrl+R / Ctrl+T / Alt+C）與補全
_safe_source "${BREW_PREFIX}/opt/fzf/shell/key-bindings.zsh"
_safe_source "${BREW_PREFIX}/opt/fzf/shell/completion.zsh"

if _command_exists fzf; then
  # fd 作為 fzf default command（更快 + 尊重 .gitignore）
  if _command_exists fd; then
    export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
    export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
    export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
  fi

  # bat 預覽（Ctrl+T 選檔時顯示內容）
  if _command_exists bat; then
    export FZF_CTRL_T_OPTS="--preview 'bat --color=always --line-range=:50 {}' --preview-window=right:50%"
  fi

  export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border --info=inline"
fi
