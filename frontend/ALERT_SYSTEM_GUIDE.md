# 🎨 Sistema de Alertas Customizado - Guia de Uso

## 📋 Visão Geral

Este projeto agora usa um sistema de alertas customizado que segue nosso design system, substituindo os `alert()` padrões do navegador.

## ✨ Recursos

- ✅ Design consistente com a aplicação
- ✅ Animações suaves (fade in + slide up)
- ✅ 4 tipos de alertas: Success, Error, Warning, Info
- ✅ Ícones e cores específicas para cada tipo
- ✅ Suporte a confirmação com botões customizados
- ✅ Backdrop com blur
- ✅ Responsivo e acessível

## 🎯 Como Usar

### 1. Importar o Hook

```typescript
import { useAlert } from '../hooks/useAlert';
```

### 2. Usar no Componente

```typescript
const MyComponent: React.FC = () => {
  const { showSuccess, showError, showWarning, showInfo, showConfirm } = useAlert();

  // Resto do código...
};
```

### 3. Métodos Disponíveis

#### `showSuccess(message, title?)`
Exibe um alerta de sucesso com ícone ✓ verde.

```typescript
showSuccess('Operação realizada com sucesso!');
showSuccess('Dados salvos!', 'Sucesso');
```

#### `showError(message, title?)`
Exibe um alerta de erro com ícone ✕ vermelho.

```typescript
showError('Erro ao processar a solicitação');
showError('Não foi possível conectar ao servidor', 'Erro de Conexão');
```

#### `showWarning(message, title?)`
Exibe um alerta de aviso com ícone ⚠ amarelo.

```typescript
showWarning('Por favor, preencha todos os campos obrigatórios');
showWarning('Esta ação não pode ser desfeita', 'Atenção');
```

#### `showInfo(message, title?)`
Exibe um alerta informativo com ícone ℹ roxo.

```typescript
showInfo('Seus dados foram atualizados');
showInfo('A manutenção está agendada para amanhã', 'Informação');
```

#### `showConfirm(message, onConfirm, title?)`
Exibe um alerta de confirmação com botões Confirmar/Cancelar.

```typescript
showConfirm(
  'Tem certeza que deseja excluir este item?',
  () => {
    // Ação a ser executada quando confirmar
    deleteItem();
  },
  'Confirmação'
);
```

#### `showAlert(options)` - Método Avançado
Para casos mais complexos, use o método `showAlert` com todas as opções:

```typescript
showAlert({
  title: 'Título Customizado',
  message: 'Mensagem detalhada aqui',
  type: 'warning', // 'success' | 'error' | 'warning' | 'info'
  confirmText: 'Sim, continuar',
  cancelText: 'Não, voltar',
  showCancel: true,
  onConfirm: () => {
    // Ação ao confirmar
  },
});
```

## 🎨 Tipos de Alertas

| Tipo | Cor | Ícone | Uso |
|------|-----|-------|-----|
| **Success** | Verde (#10b981) | ✓ | Operações bem-sucedidas |
| **Error** | Vermelho (#ef4444) | ✕ | Erros e falhas |
| **Warning** | Amarelo (#f59e0b) | ⚠ | Avisos e validações |
| **Info** | Roxo (#7c3aed) | ℹ | Informações gerais |

## 🔄 Migração de `alert()` Padrão

### ❌ Antes (alert padrão)
```typescript
alert('Demanda criada com sucesso!');
alert('Erro ao carregar dados: ' + error.message);
alert('Por favor, preencha todos os campos');
```

### ✅ Depois (alert customizado)
```typescript
showSuccess('Demanda criada com sucesso!');
showError('Erro ao carregar dados: ' + error.message);
showWarning('Por favor, preencha todos os campos');
```

## 📝 Exemplos Práticos

### Exemplo 1: Sucesso após Criar Demanda
```typescript
try {
  await demandsApi.create(formData);
  showSuccess('Demanda criada com sucesso!');
  navigate('/demands');
} catch (error: any) {
  showError('Erro ao criar demanda: ' + error.message);
}
```

### Exemplo 2: Validação de Formulário
```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!formData.email) {
    showWarning('Por favor, preencha o email');
    return;
  }
  
  // Continuar com o submit...
};
```

### Exemplo 3: Confirmação de Exclusão
```typescript
const handleDelete = () => {
  showConfirm(
    'Tem certeza que deseja excluir esta demanda? Esta ação não pode ser desfeita.',
    async () => {
      try {
        await demandsApi.delete(demandId);
        showSuccess('Demanda excluída com sucesso!');
        loadDemands();
      } catch (error: any) {
        showError('Erro ao excluir demanda');
      }
    },
    'Confirmar Exclusão'
  );
};
```

### Exemplo 4: Informação ao Usuário
```typescript
useEffect(() => {
  if (isFirstLogin) {
    showInfo('Bem-vindo ao PetiVet! Complete seu perfil para começar.');
  }
}, [isFirstLogin]);
```

## 🎬 Animações

Os alertas incluem duas animações automáticas:
- **fadeIn**: O backdrop aparece suavemente
- **slideUp**: O modal desliza de baixo para cima com um pequeno scale

## 🔧 Customização

Para customizar o componente de Alert, edite:
- **Estilos**: `/frontend/src/components/Alert.tsx` (objeto `styles`)
- **Animações**: `/frontend/src/index.css` (keyframes `fadeIn` e `slideUp`)
- **Cores**: Altere as cores em `getIconAndColor()` no Alert.tsx

## ⚙️ Configuração

O `AlertProvider` já está configurado no `App.tsx` e envolve toda a aplicação:

```typescript
function App() {
  return (
    <AlertProvider>
      <Router>
        {/* Suas rotas aqui */}
      </Router>
    </AlertProvider>
  );
}
```

## 📦 Arquivos Principais

- `/frontend/src/components/Alert.tsx` - Componente visual do alert
- `/frontend/src/hooks/useAlert.tsx` - Hook e Provider para gerenciar alertas
- `/frontend/src/index.css` - Animações CSS

## ✅ Páginas Já Atualizadas

- ✅ DemandsPage.tsx
- ✅ DemandFormStep.tsx
- 🔄 Outras páginas em processo...

## 📌 Nota para Desenvolvedores

**A partir de agora, use SEMPRE o sistema customizado de alertas!**

❌ NÃO usar: `alert()`, `confirm()`, `window.alert()`
✅ USAR: `showSuccess()`, `showError()`, `showWarning()`, `showInfo()`, `showConfirm()`

---

💡 **Dica**: Para casos muito específicos onde você precisa de um modal completamente customizado, considere criar um componente de Modal separado baseado no componente Alert.

