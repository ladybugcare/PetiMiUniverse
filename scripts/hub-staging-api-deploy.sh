#!/usr/bin/env bash
# Redeploy da API Hub em Railway staging a partir de um SHA do Git.
# Nunca usa `railway up` (evita upload de working tree sujo).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVICE="${HUB_STAGING_RAILWAY_SERVICE:-backend}"
ENVIRONMENT="${HUB_STAGING_RAILWAY_ENV:-staging}"
API_URL="${HUB_STAGING_API_URL:-https://backend-staging-334260f3.up.railway.app}"
TIMEOUT_SEC="${HUB_STAGING_DEPLOY_TIMEOUT_SEC:-600}"
POLL_SEC="${HUB_STAGING_DEPLOY_POLL_SEC:-15}"
HEALTH_PATH="${HUB_STAGING_HEALTH_PATH:-/health/live}"

die() { echo "ERRO: $*" >&2; exit 1; }
info() { echo "→ $*"; }

usage() {
  cat <<'EOF'
Uso: ./scripts/hub-staging-api-deploy.sh <comando> [sha]

  status [sha]   Mostra o deploy ativo (commitHash, status) e health. Se [sha]
                 for passado, sai 0 só se o commit ativo corresponder.
  deploy <sha>   railway redeploy --commit <sha> no serviço staging, depois wait.
  wait <sha>     Aguarda deploy SUCCESS com commitHash == sha + health OK.

Variáveis (opcional):
  HUB_STAGING_RAILWAY_SERVICE   default: backend
  HUB_STAGING_RAILWAY_ENV       default: staging
  HUB_STAGING_API_URL           default: https://backend-staging-334260f3.up.railway.app
  HUB_STAGING_DEPLOY_TIMEOUT_SEC  default: 600
  HUB_STAGING_DEPLOY_POLL_SEC     default: 15
  HUB_STAGING_HEALTH_PATH         default: /health/live

Regras:
  - Ambiente deve ser staging (produção bloqueada).
  - Não usa `railway up`.
  - SHA precisa existir no Git local (objeto alcançável após fetch se necessário).
EOF
}

require_railway() {
  command -v railway >/dev/null 2>&1 || die "CLI railway não encontrada"
  command -v python3 >/dev/null 2>&1 || die "python3 é necessário para parsear JSON"
}

assert_staging_env() {
  local env_lc
  env_lc="$(printf '%s' "$ENVIRONMENT" | tr '[:upper:]' '[:lower:]')"
  if [[ "$env_lc" == "production" || "$env_lc" == "prod" ]]; then
    die "recusado: HUB_STAGING_RAILWAY_ENV=$ENVIRONMENT (só staging nesta rotina)"
  fi
  if [[ "$env_lc" != "staging" ]]; then
    die "recusado: ambiente '$ENVIRONMENT' — use staging (ou ajuste só com intenção explícita fora deste script)"
  fi
}

# Resolve SHA completo a partir de ref/prefixo; exige objeto no Git.
resolve_sha() {
  local ref="${1:-}"
  [[ -n "$ref" ]] || die "SHA obrigatório"
  [[ "$ref" =~ ^[0-9a-fA-F]{7,40}$ ]] || die "SHA inválido: '$ref' (esperado hex 7–40)"
  if ! git cat-file -e "${ref}^{commit}" 2>/dev/null; then
    info "SHA não encontrado localmente — git fetch origin"
    git fetch origin --quiet || true
  fi
  git cat-file -e "${ref}^{commit}" 2>/dev/null || die "commit '$ref' não existe no Git"
  git rev-parse --verify "${ref}^{commit}"
}

railway_cwd() {
  # Link do serviço costuma estar em backend/ (ver railway status).
  if [[ -d "$ROOT/backend" ]]; then
    echo "$ROOT/backend"
  else
    echo "$ROOT"
  fi
}

# Imprime: id|status|commitHash|createdAt  do deploy mais recente do serviço.
latest_deployment_line() {
  local json
  json="$(
    cd "$(railway_cwd)"
    railway deployment list \
      --service "$SERVICE" \
      --environment "$ENVIRONMENT" \
      --limit 5 \
      --json
  )" || die "falha ao listar deployments Railway"
  python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception as e:
    print(f"ERRO parse JSON: {e}", file=sys.stderr)
    sys.exit(2)
items = data if isinstance(data, list) else data.get("deployments") or data.get("edges") or []
if not items:
    print("ERRO: lista de deployments vazia", file=sys.stderr)
    sys.exit(3)
first = items[0]
if isinstance(first, dict) and "node" in first:
    first = first["node"]
meta = first.get("meta") or {}
commit = meta.get("commitHash") or meta.get("commit_hash") or ""
print("|".join([
    str(first.get("id") or ""),
    str(first.get("status") or ""),
    str(commit),
    str(first.get("createdAt") or ""),
]))
' <<<"$json"
}

sha_matches() {
  local want="$1"
  local got="$2"
  [[ -n "$got" ]] || return 1
  [[ "$got" == "$want" || "$got" == "$want"* || "$want" == "$got"* ]]
}

health_ok() {
  local url="${API_URL%/}${HEALTH_PATH}"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' -m 20 "$url" || true)"
  [[ "$code" == "200" ]]
}

print_status() {
  local line id status commit created
  line="$(latest_deployment_line)"
  IFS='|' read -r id status commit created <<<"$line"
  echo "service:     $SERVICE"
  echo "environment: $ENVIRONMENT"
  echo "deployment:  $id"
  echo "status:      $status"
  echo "commitHash:  ${commit:-"(ausente)"}"
  echo "createdAt:   ${created:-"—"}"
  echo -n "health:      "
  if health_ok; then
    echo "OK ${API_URL%/}${HEALTH_PATH}"
  else
    echo "FAIL ${API_URL%/}${HEALTH_PATH}"
  fi
}

cmd_status() {
  require_railway
  assert_staging_env
  local want_sha=""
  if [[ -n "${1:-}" ]]; then
    want_sha="$(resolve_sha "$1")"
  fi
  print_status
  if [[ -z "$want_sha" ]]; then
    return 0
  fi
  local line status commit
  line="$(latest_deployment_line)"
  IFS='|' read -r _ status commit _ <<<"$line"
  if [[ "$status" != "SUCCESS" ]]; then
    die "deploy ativo status=$status (esperado SUCCESS) para SHA $want_sha"
  fi
  sha_matches "$want_sha" "$commit" || die "commitHash ativo '$commit' ≠ pedido '$want_sha'"
  health_ok || die "health falhou em ${API_URL%/}${HEALTH_PATH}"
  info "OK: staging na API com SHA $want_sha"
}

cmd_wait() {
  require_railway
  assert_staging_env
  local want_sha
  want_sha="$(resolve_sha "${1:-}")"
  info "aguardando deploy SUCCESS commit=$want_sha (timeout ${TIMEOUT_SEC}s)"
  local deadline start_ts now line id status commit
  start_ts="$(date +%s)"
  deadline=$((start_ts + TIMEOUT_SEC))
  while true; do
    now="$(date +%s)"
    if (( now > deadline )); then
      print_status || true
      die "timeout ${TIMEOUT_SEC}s — SHA $want_sha não ficou ativo com health OK"
    fi
    line="$(latest_deployment_line)"
    IFS='|' read -r id status commit _ <<<"$line"
    echo "  … status=$status commit=${commit:0:12}… id=${id:0:8}… (+$((now - start_ts))s)"
    if [[ "$status" == "FAILED" || "$status" == "CRASHED" || "$status" == "REMOVED" ]]; then
      if sha_matches "$want_sha" "$commit"; then
        die "deploy $id falhou (status=$status) para SHA $want_sha"
      fi
    fi
    if [[ "$status" == "SUCCESS" ]] && sha_matches "$want_sha" "$commit"; then
      if health_ok; then
        info "OK: deploy $id SUCCESS commit=$want_sha + health"
        print_status
        return 0
      fi
      echo "  … commit ok, aguardando health"
    fi
    sleep "$POLL_SEC"
  done
}

cmd_deploy() {
  require_railway
  assert_staging_env
  local want_sha
  want_sha="$(resolve_sha "${1:-}")"
  info "redeploy Railway service=$SERVICE env=$ENVIRONMENT commit=$want_sha"
  (
    cd "$(railway_cwd)"
    railway redeploy \
      --service "$SERVICE" \
      --environment "$ENVIRONMENT" \
      --commit "$want_sha" \
      --yes \
      --json
  ) || die "railway redeploy falhou"
  cmd_wait "$want_sha"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  status|check)
    cmd_status "${1:-}"
    ;;
  wait)
    [[ -n "${1:-}" ]] || die "uso: wait <sha>"
    cmd_wait "$1"
    ;;
  deploy)
    [[ -n "${1:-}" ]] || die "uso: deploy <sha>"
    cmd_deploy "$1"
    ;;
  -h|--help|help|"")
    usage
    [[ -n "$cmd" ]] || exit 1
    ;;
  *)
    usage
    die "comando desconhecido: $cmd"
    ;;
esac
