# ╔══════════════════════════════════════════════════════════════════╗
# ║  zinit.zsh — 插件管理核心                                       ║
# ║  整合原有 plugins.zsh / completion.zsh / keybindings.zsh        ║
# ║  Zinit 官方：https://github.com/zdharma-continuum/zinit         ║
# ╚══════════════════════════════════════════════════════════════════╝

# ── Zinit 自動安裝 ────────────────────────────────────────────────
ZINIT_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/zinit/zinit.git"
if [[ ! -f "$ZINIT_HOME/zinit.zsh" ]]; then
  print -P "%F{cyan}⏳ 首次安裝 zinit...%f"
  command mkdir -p "$(dirname "$ZINIT_HOME")"
  command git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME" 2>/dev/null \
    && print -P "%F{green}✅ zinit 安裝完成%f" \
    || { print -P "%F{red}❌ zinit 安裝失敗，略過插件載入%f"; return 1; }
fi
source "${ZINIT_HOME}/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

# ── Powerlevel10k（取代 Starship；純 zsh，instant prompt 支援）───
zinit ice depth=1
zinit light romkatv/powerlevel10k
# 載入個人 p10k 設定（執行 `p10k configure` 生成 ~/.p10k.zsh）
[[ -f ~/.p10k.zsh ]] && source ~/.p10k.zsh

# ── 核心插件（turbo async — 不阻塞 shell 啟動）───────────────────
zinit wait lucid for \
  atinit"zicompinit; zicdreplay" \
    zdharma-continuum/fast-syntax-highlighting \
  blockf atpull'zinit creinstall -q .' \
    zsh-users/zsh-completions \
  atload"!_zsh_autosuggest_start" \
    zsh-users/zsh-autosuggestions

# 自動提示樣式
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'
ZSH_AUTOSUGGEST_STRATEGY=(history completion)

# ── fzf-tab（取代原生 tab，整合 fzf 預覽視窗）────────────────────
# 需在 compinit 之後，但 turbo 模式會自動處理順序
zinit light Aloxaf/fzf-tab

# fzf-tab 樣式設定
zstyle ':completion:*'             list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':fzf-tab:*'                fzf-command fzf
zstyle ':fzf-tab:complete:cd:*'    fzf-preview \
  'eza --color=always "$realpath" 2>/dev/null || ls -la "$realpath"'
zstyle ':fzf-tab:complete:*:*'     fzf-preview \
  'bat --color=always --line-range=:30 "${realpath}" 2>/dev/null'
zstyle ':fzf-tab:*'                switch-group ',' '.'

# ── 補全系統（原 completion.zsh）────────────────────────────────
# compinit 由 zicompinit 在 turbo atinit 中呼叫
# 手動補全設定保留於此
zstyle ':completion:*'       matcher-list 'm:{a-z}={A-Z}'
zstyle ':completion:*'       menu select
zstyle ':completion:*'       group-name ''
zstyle ':completion:*'       rehash true
zstyle ':completion:*:warnings' format '%F{red}找不到符合項目%f'

# ── 按鍵綁定（原 keybindings.zsh）───────────────────────────────
bindkey -e
bindkey '\e[1;3D' backward-word    # Option+Left
bindkey '\e[1;3C' forward-word     # Option+Right
bindkey '\eb'     backward-word
bindkey '\ef'     forward-word
bindkey '\e[1;5D' backward-word    # Ctrl+Left
bindkey '\e[1;5C' forward-word     # Ctrl+Right
bindkey '^[[A'    history-search-backward
bindkey '^[[B'    history-search-forward
bindkey '^U'      backward-kill-line
bindkey '^K'      kill-line
bindkey '^W'      backward-kill-word

# ── IDE shell integrations（原 plugins.zsh）──────────────────────
_safe_source "$HOME/.kiro/shell/zsh/init.zsh"
_safe_source "$HOME/.openclaw/init.zsh"
