#!/bin/bash
# Script para adicionar @ts-ignore em todos os ícones do lucide-react

find src -name "*.tsx" -o -name "*.ts" | while read file; do
  # Adiciona @ts-ignore antes de cada linha que contém um ícone do lucide-react
  sed -i '' 's/\(<[A-Z][a-zA-Z]* size=\)/\/\* @ts-ignore - Type incompatibility between React 18 and lucide-react *\/\n            \1/g' "$file"
done

