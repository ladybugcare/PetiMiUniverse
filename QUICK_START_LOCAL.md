# 🚀 Guia Rápido - Iniciar Backend Local

## Problema: Erros de Conexão (ERR_CONNECTION...)

Os erros `ERR_CONNECTION...` indicam que o **backend não está rodando**.

## ✅ Solução: Iniciar o Backend

### Passo 1: Abrir Terminal para o Backend

```bash
cd backend
```

### Passo 2: Verificar Dependências

```bash
npm install
```

### Passo 3: Verificar Variáveis de Ambiente

Certifique-se de ter um arquivo `.env` no diretório `backend/` com as variáveis necessárias:

```env
# Supabase
SUPABASE_URL=http://127.0.0.1:54321  # ou sua URL do Supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_aqui
SUPABASE_ANON_KEY=sua_chave_anon_aqui

# Porta (opcional, padrão é 3000)
PORT=3000

# Ambiente
NODE_ENV=development
```

### Passo 4: Iniciar o Backend

```bash
npm run dev
```

Você deve ver:
```
🐾 Server running on port 3000
```

### Passo 5: Verificar se Está Funcionando

Abra no navegador: http://localhost:3000

Deve retornar:
```json
{
  "status": "healthy",
  "message": "🐾 PetiVet API is running!",
  "timestamp": "..."
}
```

## 🔍 Diagnóstico

### Verificar se a porta está em uso:
```bash
lsof -ti:3000
```

Se retornar um número, a porta está em uso. Para liberar:
```bash
lsof -ti:3000 | xargs kill
```

### Verificar logs do backend

O backend deve mostrar logs de requisições quando o frontend tentar conectar.

## ⚠️ Problemas Comuns

1. **Porta 3000 já em uso:**
   - Use `npm run dev:clean` (mata processos na porta 3000 e inicia)
   - Ou mude a porta: `PORT=3001 npm run dev`

2. **Erro de Supabase:**
   - Verifique se o Supabase está rodando (se local)
   - Verifique as variáveis de ambiente

3. **Dependências não instaladas:**
   - Execute `npm install` no diretório `backend/`

## 📝 Nota

As mudanças que fizemos (rate limiter, retry, cache) estão apenas no código.
**Elas não precisam ser aplicadas agora** - o problema atual é que o backend não está rodando.

Depois que o backend estiver rodando, as melhorias já estarão ativas automaticamente.

