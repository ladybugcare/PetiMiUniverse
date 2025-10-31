# 🔄 Workflow Git - PetiVet

## 📋 Regras Importantes

### ✅ **SEMPRE FAÇA ASSIM:**
1. **Trabalhe em `staging`** - esta é sua branch principal de desenvolvimento
2. **Faça commits em `staging`** - todos os seus trabalhos vão aqui
3. **Atualize `main` com `staging`** - quando quiser sincronizar, use o script helper

### ❌ **NUNCA FAÇA:**
- ❌ Merge de `main` em `staging` manualmente
- ❌ Commits diretos em `main`
- ❌ `git merge main` enquanto está em `staging`

---

## 🚀 Workflow Diário

### 1. Desenvolvendo uma Feature

```bash
# Certifique-se de estar em staging
git checkout staging

# Atualize staging do remoto
git pull origin staging

# Faça suas mudanças e commits
git add .
git commit -m "feat: nova funcionalidade"

# Push para staging
git push origin staging
```

### 2. Atualizando Main com Staging

Quando você quiser que `main` tenha as mudanças de `staging`:

```bash
# Método 1: Usando o script helper (RECOMENDADO)
./scripts/update-main.sh

# Método 2: Usando alias (se configurado)
git sync-main
```

O script irá:
1. ✅ Verificar se você está em staging
2. ✅ Atualizar staging do remoto
3. ✅ Mostrar commits que serão mergeados
4. ✅ Fazer merge de staging em main
5. ✅ Fazer push para main (com confirmação)
6. ✅ Voltar para staging automaticamente

---

## 🛡️ Proteções Implementadas

### Hook Pre-Push
Um hook Git foi configurado para prevenir merges acidentais de `main` em `staging`. Se você tentar fazer push que inclua mudanças de `main` para `staging`, será avisado e poderá cancelar.

### Script Helper
O script `scripts/update-main.sh` garante que você sempre siga o workflow correto (staging → main).

---

## 📊 Fluxo Visual

```
┌─────────┐         ┌──────────┐
│ staging │ ───────►│   main   │
│ (work)  │  merge  │ (stable) │
└─────────┘         └──────────┘
     ▲
     │
     │ pull/push
     │
  Developer
```

**Sempre**: staging → main (nunca o contrário)

---

## 🆘 Troubleshooting

### "Merge bloqueado pelo hook"
- ✅ Isso é intencional! O hook está protegendo você
- ✅ Use `./scripts/update-main.sh` para atualizar main corretamente

### "Commits não aparecem em main"
- ✅ Verifique se fez push para staging
- ✅ Execute `./scripts/update-main.sh` para sincronizar

### "Quero desabilitar o hook temporariamente"
```bash
# Remover permissão de execução (não recomendado)
chmod -x .git/hooks/pre-push

# Reativar depois
chmod +x .git/hooks/pre-push
```

---

## 💡 Dicas

1. **Sempre trabalhe em staging**: Esta é sua branch principal
2. **Use o script helper**: `./scripts/update-main.sh` facilita tudo
3. **Commit frequentemente**: Commits pequenos e frequentes são melhores
4. **Teste em staging primeiro**: Sempre teste antes de atualizar main

---

## 📝 Exemplo Completo

```bash
# 1. Trabalhando em staging
git checkout staging
git pull origin staging

# 2. Fazendo mudanças
# ... editar arquivos ...

# 3. Commitando
git add .
git commit -m "feat: adiciona nova página"
git push origin staging

# 4. Quando estiver pronto, atualizar main
./scripts/update-main.sh

# 5. Voltar a trabalhar em staging (já está de volta automaticamente)
# Continue desenvolvendo...
```

---

## 🔧 Configurar Alias Git (Opcional)

Para usar `git sync-main` em vez do script completo:

```bash
git config alias נבsync-main '!./scripts/update-main.sh'
```

Ou adicione manualmente em `~/.gitconfig`:
```ini
[alias]
    sync-main = !./scripts/update-main.sh
```

---

**Lembrete**: O workflow correto é sempre **staging → main**. O script helper torna isso fácil e seguro! 🎉

