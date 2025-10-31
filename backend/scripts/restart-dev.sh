#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3000}"

echo "🔄 Encerrando processos na porta ${PORT} (se houver)..."
lsof -ti tcp:"${PORT}" | xargs -r kill

echo "🚀 Iniciando servidor com npm run dev..."
npm run dev
