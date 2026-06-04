# Correção de Validação de CNPJ - Request Pending

## Problema

A validação de CNPJ em staging estava ficando pendente (pending) e não retornava resposta.

## Causa Raiz

O middleware de validação com Zod estava causando o problema:
1. O schema esperava exatamente 14 dígitos: `/^\d{14}$/`
2. O middleware `validate()` estava falhando silenciosamente
3. O erro não estava sendo tratado corretamente pelo errorHandler
4. O logger Winston poderia estar causando problema se não estivesse disponível

## Solução Implementada

### 1. Removida Validação Zod Complexa

**Antes:**
```typescript
const cnpjParamSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos'),
});

export const checkClinicCnpj = [
  validate(cnpjParamSchema, 'params'),
  async (req: Request, res: Response) => { ... }
];
```

**Depois:**
```typescript
export const checkClinicCnpj = async (req: Request, res: Response) => {
  const { cnpj } = req.params;
  const normalizedCnpj = normalizeCNPJ(cnpj);
  
  // Validação simples e direta
  if (!normalizedCnpj || normalizedCnpj.length !== 14) {
    return res.status(400).json({ error: 'CNPJ inválido' });
  }
  // ... resto do código
};
```

### 2. Logging Seguro

Adicionado helper `safeLog` que não quebra se o logger falhar:
```typescript
const safeLog = (level: 'debug' | 'warn' | 'error', message: string, meta?: any) => {
  try {
    const { logger } = require('../../utils/logger.js');
    logger[level](message, meta);
  } catch (err) {
    // Fallback para console se logger não estiver disponível
    console[level === 'debug' ? 'log' : level](`[CNPJ] ${message}`, meta || '');
  }
};
```

### 3. Rota Simplificada

**Antes:**
```typescript
router.get('/check-cnpj/:cnpj', ...checkClinicCnpj);
```

**Depois:**
```typescript
router.get('/check-cnpj/:cnpj', checkClinicCnpj);
```

## Por Que Estava Pendente?

1. **Middleware de validação falhando:** O Zod estava rejeitando a validação mas o erro não estava sendo tratado corretamente
2. **ErrorHandler não capturando:** O erro do middleware não estava chegando ao errorHandler
3. **Logger causando problema:** Se Winston não estivesse disponível, poderia causar erro não tratado

## Teste

A requisição agora deve:
1. ✅ Receber CNPJ na URL (com ou sem formatação)
2. ✅ Normalizar o CNPJ (remover formatação)
3. ✅ Validar que tem 14 dígitos
4. ✅ Buscar no banco
5. ✅ Retornar resposta imediatamente

## Próximos Passos

1. ✅ Código corrigido
2. ⏳ Fazer commit e push
3. ⏳ Render fará deploy
4. ⏳ Testar validação de CNPJ em staging

