#!/usr/bin/env bash
# Ritual Git Hub: trabalhar em staging → promover para main.
# Evita mismatch entre branches.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

die() { echo "ERRO: $*" >&2; exit 1; }
info() { echo "→ $*"; }

cmd="${1:-}"
shift || true

require_clean() {
  if [[ -n "$(git status --porcelain)" ]]; then
    die "working tree sujo. Commit ou stash antes. (git status)"
  fi
}

sync_staging() {
  info "checkout staging + pull"
  git fetch origin
  git checkout staging
  git pull --ff-only origin staging
}

case "$cmd" in
  start|use-staging)
    # Leva você para staging (mantém mudanças locais se possível)
    git fetch origin
    info "trocando para staging (suas mudanças locais vêm junto se não houver conflito)"
    git checkout staging
    git pull --ff-only origin staging || true
    echo
    echo "OK. Trabalhe SEMPRE nesta branch."
    echo "  git status"
    echo "  # ... codar ..."
    echo "  git add … && git commit …"
    echo "  ./scripts/hub-git-staging.sh push"
    ;;

  push|push-staging)
    require_clean
    BRANCH="$(git branch --show-current)"
    [[ "$BRANCH" == "staging" ]] || die "você está em '$BRANCH'. Rode: ./scripts/hub-git-staging.sh start"
    info "push origin staging (Vercel + Railway staging devem pegar)"
    git push -u origin staging
    echo
    echo "Validar: https://hub-staging.petmi.app"
    echo "API:     https://backend-staging-334260f3.up.railway.app/health/live"
    ;;

  promote|to-main)
    require_clean
    BRANCH="$(git branch --show-current)"
    [[ "$BRANCH" == "staging" ]] || die "promova a partir de staging (agora: $BRANCH)"
    info "garantindo staging remoto atualizado"
    git push origin staging
    info "atualizando main e fazendo merge fast-forward de staging"
    git fetch origin
    git checkout main
    git pull --ff-only origin main
    # Preferir FF: main deve ser ancestral de staging
    if git merge-base --is-ancestor main staging; then
      git merge --ff-only staging
    else
      die "main e staging divergiram. Pare e peça ajuda — NÃO force push."
    fi
    git push origin main
    info "voltando para staging"
    git checkout staging
    echo
    echo "OK. main == staging. Produção (Vercel main / Railway production) deve seguir o deploy."
    ;;

  status|check)
    git fetch origin
    echo "branch local: $(git branch --show-current)"
    echo "main:         $(git rev-parse --short main) / origin/main $(git rev-parse --short origin/main)"
    echo "staging:      $(git rev-parse --short staging) / origin/staging $(git rev-parse --short origin/staging)"
    if git merge-base --is-ancestor origin/main origin/staging; then
      AHEAD=$(git rev-list --count origin/main..origin/staging)
      echo "staging está $AHEAD commit(s) à frente de main (ok se ainda não promoveu)"
    elif git merge-base --is-ancestor origin/staging origin/main; then
      AHEAD=$(git rev-list --count origin/staging..origin/main)
      echo "AVISO: main está $AHEAD commit(s) à frente de staging — rode promote ao contrário ou sync"
    else
      echo "AVISO: main e staging DIVERGIRAM — pare e alinhe antes de push"
    fi
    git status -sb
    ;;

  *)
    cat <<'EOF'
Uso: ./scripts/hub-git-staging.sh <comando>

  start         Troca para branch staging (onde você deve codar)
  push          Push limpo de staging → remoto (validar no hub-staging)
  promote       Depois de validar: staging → main (fast-forward) e push
  status        Mostra se main/staging estão alinhados

Regra de ouro:
  - NÃO code em main.
  - NÃO faça commit direto em main no dia a dia.
  - Só promote quando hub-staging estiver OK.
EOF
    exit 1
    ;;
esac
