# ── 按鍵綁定 ──────────────────────────────────────────────────────
bindkey -e
bindkey '\e[1;3D' backward-word
bindkey '\e[1;3C' forward-word
bindkey '\eb'     backward-word
bindkey '\ef'     forward-word
bindkey '\e[1;5D' backward-word
bindkey '\e[1;5C' forward-word
bindkey '^[[A' history-search-backward
bindkey '^[[B' history-search-forward
bindkey '^U' backward-kill-line
bindkey '^K' kill-line
bindkey '^W' backward-kill-word
