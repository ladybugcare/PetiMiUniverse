#!/usr/bin/env node

/**
 * Script de validação para verificar se o IconWrapper está correto
 * e se não há problemas que possam causar erros de React child
 */

const fs = require('fs');
const path = require('path');

const errors = [];
const warnings = [];

// Verificar se IconWrapper.tsx existe e está correto
const iconWrapperPath = path.join(__dirname, 'src/components/IconWrapper.tsx');

if (!fs.existsSync(iconWrapperPath)) {
  errors.push('❌ IconWrapper.tsx não encontrado!');
  process.exit(1);
}

const iconWrapperContent = fs.readFileSync(iconWrapperPath, 'utf8');

// Verificar se usa JSX direto (não React.createElement)
if (iconWrapperContent.includes('React.createElement')) {
  errors.push('❌ IconWrapper ainda usa React.createElement! Deve usar JSX direto.');
}

if (!iconWrapperContent.includes('return <Icon')) {
  errors.push('❌ IconWrapper não está retornando JSX direto (<Icon .../>)');
}

// Verificar se exporta corretamente
if (!iconWrapperContent.includes('export default IconWrapper')) {
  warnings.push('⚠️  IconWrapper pode não estar exportado corretamente');
}

// Verificar arquivos que usam IconWrapper
const filesToCheck = [
  'src/pages/ClinicSignUpPage.tsx',
  'src/pages/VetSignUpPage.tsx',
  'src/pages/HomePage.tsx',
  'src/components/Alert.tsx',
];

filesToCheck.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Verificar se importa IconWrapper
    if (content.includes('IconWrapper') && !content.includes("import.*IconWrapper")) {
      if (!content.match(/import\s+.*IconWrapper.*from/)) {
        warnings.push(`⚠️  ${file} usa IconWrapper mas pode não ter import correto`);
      }
    }
    
    // Verificar se não usa React.createElement diretamente com ícones
    if (content.includes('React.createElement') && content.includes('lucide-react')) {
      warnings.push(`⚠️  ${file} pode estar usando React.createElement com ícones`);
    }
  }
});

// Resultado
console.log('\n🔍 Validação do IconWrapper\n');
console.log('='.repeat(50));

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Todas as validações passaram!');
  console.log('\n✓ IconWrapper usa JSX direto');
  console.log('✓ Nenhum problema encontrado nos arquivos verificados');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log('\n❌ ERROS ENCONTRADOS:');
    errors.forEach(err => console.log(err));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  AVISOS:');
    warnings.forEach(warn => console.log(warn));
  }
  
  process.exit(errors.length > 0 ? 1 : 0);
}

