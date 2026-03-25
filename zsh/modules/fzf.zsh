# ── FZF 環境設定 ──────────────────────────────────────────────────
# key-bindings / completion 已由 zinit.zsh 的 fzf-tab 接管
# 此檔案只設定 FZF 行為選項與 fd / bat 整合

if _command_exists fzf; then
  # 使用 fd 作為 fzf 的 default command（更快 + 尊重 .gitignore）
  if _command_exists fd; then
    export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
    export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
    export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
  fi

  # bat 預覽（Ctrl+T 選檔時顯示內容）
  if _command_exists bat; then
    export FZF_CTRL_T_OPTS="--preview 'bat --color=always --line-range=:50 {}' --preview-window=right:50%"
  fi

  # 全局樣式
  export FZF_DEFAULT_OPTS="--height 40% --layout=reverse --border --info=inline"
fi
