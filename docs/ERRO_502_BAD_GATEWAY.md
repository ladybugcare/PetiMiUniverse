# 🔴 Erro 502 Bad Gateway - Guia de Diagnóstico e Solução

## O Que É o Erro 502?

O erro **502 Bad Gateway** indica que o servidor (no caso, o Render.com) recebeu uma resposta inválida de um servidor upstream, ou o servidor não está conseguindo processar a requisição corretamente.

**No contexto do PetMi Vet Staging:**
- **URL da API**: `https://petivet-api-staging.onrender.com`
- **Endpoint afetado**: `/vets/check-document/:document_number`

---

## 🔍 Causas Comuns

### 1. ⏰ Servidor Render Dormindo (Free Tier)

**Causa**: O plano Free do Render dorme após **15 minutos de inatividade**.

**Sintomas**:
- Primeira requisição após dormir demora **30-60 segundos**
- Pode retornar 502 durante o "despertar"
- Requisições subsequentes funcionam normalmente

**Solução**:
- ✅ **Imediata**: Aguarde 30-60 segundos e tente novamente
- ✅ **Curto prazo**: Configure um ping automático (cron job) que acessa `/` a cada 10 minutos
- ✅ **Longo prazo**: Upgrade para Starter ($7/mês) - nunca dorme

**Como verificar**:
```bash
# Teste o health check
curl https://petivet-api-staging.onrender.com/
```

Se demorar muito na primeira vez, o servidor estava dormindo.

---

### 2. 💥 Erro no Código (Crash do Servidor)

**Causa**: O código está causando um crash ao processar a requisição.

**Sintomas**:
- Erro 502 persistente (não apenas na primeira requisição)
- Logs no Render mostram erros

**Como verificar**:
1. Acesse o Dashboard do Render
2. Vá em **Logs** do serviço `petivet-api-staging`
3. Procure por erros como:
   - `Error: Cannot read property...`
   - `TypeError: ...`
   - `ReferenceError: ...`
   - `SyntaxError: ...`

**Solução**:
- Corrija o erro no código
- Faça commit e push
- Render fará deploy automático

---

### 3. 🔌 Problema de Conexão com Supabase

**Causa**: O servidor não consegue se conectar ao Supabase.

**Sintomas**:
- Erro 502 em endpoints que usam banco de dados
- Logs mostram erros de conexão

**Como verificar**:
1. Render Dashboard → **Logs**
2. Procure por:
   - `Error: Invalid Supabase URL`
   - `Error: connect ECONNREFUSED`
   - `Error: Request failed`

**Solução**:
1. Verifique as variáveis de ambiente no Render:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Confirme que não há espaços extras
3. Teste as credenciais localmente primeiro

---

### 4. ⏱️ Timeout da Requisição

**Causa**: A requisição demora muito para processar (mais de 30 segundos no Render Free).

**Sintomas**:
- Erro 502 após alguns segundos
- Endpoint funciona localmente mas não no Render

**Solução**:
- ✅ Adicionar timeout no código (já implementado em `checkVetDocument.ts`)
- ✅ Otimizar queries do banco de dados
- ✅ Adicionar índices nas colunas usadas em `WHERE`

---

## 🛠️ Soluções Implementadas

### ✅ Melhorias no `checkVetDocument.ts`

1. **Timeout de 10 segundos**: Evita que requisições travem o servidor
2. **Validação melhorada**: Valida parâmetros antes de processar
3. **Logs detalhados**: Facilita debug quando há erros
4. **Tratamento de erros específicos**: Retorna códigos HTTP apropriados

---

## 📋 Checklist de Diagnóstico

Quando receber um erro 502:

- [ ] **1. Verificar se o servidor está dormindo**
  ```bash
  curl https://petivet-api-staging.onrender.com/
  ```
  Se demorar 30-60s na primeira vez, estava dormindo.

- [ ] **2. Verificar logs no Render**
  - Dashboard → `petivet-api-staging` → **Logs**
  - Procure por erros recentes

- [ ] **3. Verificar variáveis de ambiente**
  - Render → Environment
  - Confirme que todas estão configuradas

- [ ] **4. Testar endpoint diretamente**
  ```bash
  curl https://petivet-api-staging.onrender.com/vets/check-document/48166817012
  ```

- [ ] **5. Verificar status do Supabase**
  - Supabase Dashboard → verificar se o projeto está ativo

---

## 🚀 Soluções Preventivas

### 1. Ping Automático (Manter Servidor Acordado)

Crie um cron job que acessa o health check a cada 10 minutos:

**Opção A: Usar serviço externo (grátis)**
- [UptimeRobot](https://uptimerobot.com) - Monitora e faz ping automático
- [Cron-job.org](https://cron-job.org) - Cron jobs gratuitos

**Opção B: GitHub Actions (se tiver repositório)**
```yaml
# .github/workflows/keep-alive.yml
name: Keep Render Alive
on:
  schedule:
    - cron: '*/10 * * * *' # A cada 10 minutos
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping API
        run: curl https://petivet-api-staging.onrender.com/
```

### 2. Upgrade para Starter ($7/mês)

**Vantagens**:
- ✅ Servidor nunca dorme
- ✅ Performance melhor
- ✅ Mais recursos (512MB RAM vs 512MB)
- ✅ Suporte prioritário

**Como fazer**:
1. Render Dashboard → seu serviço
2. Settings → **Plan**
3. Upgrade para **Starter**

---

## 🔧 Como Testar Localmente

Para reproduzir e testar localmente:

```bash
cd backend
npm run dev
```

Em outro terminal:
```bash
curl http://localhost:3000/vets/check-document/48166817012
```

Se funcionar localmente mas não no Render, o problema é:
- Servidor dormindo
- Variáveis de ambiente incorretas
- Timeout do Render

---

## 📞 Quando Pedir Ajuda

Se após seguir este guia o erro persistir:

1. **Colete informações**:
   - Screenshot do erro no navegador
   - Logs do Render (últimas 50 linhas)
   - URL exata que está falhando
   - Timestamp do erro

2. **Verifique**:
   - Status do Render: https://status.render.com
   - Status do Supabase: https://status.supabase.com

3. **Documente**:
   - Quando começou o erro
   - Se funciona localmente
   - Se outros endpoints funcionam

---

## 📚 Referências

- [Render Documentation - Free Tier](https://render.com/docs/free)
- [Render Status Page](https://status.render.com)
- [Supabase Status Page](https://status.supabase.com)
- [HTTP Status Codes - 502](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/502)

---

**Última atualização**: 2025-01-XX  
**Versão**: 1.0

