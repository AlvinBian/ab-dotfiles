# ── Git 增強 ──────────────────────────────────────────────────────
if _command_exists delta; then
  git config --global core.pager delta
  git config --global delta.navigate true
  git config --global delta.light false
  git config --global delta.line-numbers true
  git config --global interactive.diffFilter "delta --color-only"
fi

if _command_exists lazygit; then alias lg='lazygit'; fi

alias gs='git status'
alias gst='git status --short --branch'
alias gd='git diff'
alias gds='git diff --staged'
alias gl='git log --oneline --graph --decorate --all'
alias gll='git log --pretty=format:"%C(yellow)%h%Creset %C(blue)%ad%Creset %s %C(green)[%an]%Creset" --date=short'
alias ga='git add'
alias gaa='git add --all'
alias gc='git commit -m'
alias gca='git commit --amend'
alias gco='git checkout'
alias gcb='git checkout -b'
alias gb='git branch'
alias gba='git branch -a'
alias gp='git push'
alias gpf='git push --force-with-lease'
alias gpl='git pull'
alias gplr='git pull --rebase'
