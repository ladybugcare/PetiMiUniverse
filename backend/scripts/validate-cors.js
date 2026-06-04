#!/usr/bin/env node

/**
 * Script de validação de configuração CORS
 * Verifica se as variáveis de ambiente estão configuradas corretamente
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validando configuração CORS...\n');

// Carregar variáveis de ambiente
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL;

console.log(`📋 Ambiente: ${NODE_ENV}`);
console.log(`🌐 FRONTEND_URL: ${FRONTEND_URL || '❌ NÃO CONFIGURADA'}\n`);

// Origens esperadas por ambiente
const expectedOrigins = {
  development: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    FRONTEND_URL,
  ].filter(Boolean),
  staging: [
    'https://peti-vet-git-staging-petivet.vercel.app',
    FRONTEND_URL,
  ].filter(Boolean),
  production: [
    'https://peti-vet-petivet.vercel.app',
    FRONTEND_URL,
  ].filter(Boolean),
};

// Validações
let errors = [];
let warnings = [];

// 1. Verificar FRONTEND_URL
if (!FRONTEND_URL) {
  errors.push('❌ FRONTEND_URL não está configurada');
} else {
  console.log(`✅ FRONTEND_URL configurada: ${FRONTEND_URL}`);
  
  // Verificar se FRONTEND_URL corresponde ao ambiente
  if (NODE_ENV === 'staging' && !FRONTEND_URL.includes('staging')) {
    warnings.push('⚠️  FRONTEND_URL em staging não parece ser URL de staging');
  }
  
  if (NODE_ENV === 'production' && !FRONTEND_URL.includes('peti-vet-petivet')) {
    warnings.push('⚠️  FRONTEND_URL em produção não parece ser URL de produção');
  }
}

// 2. Verificar NODE_ENV
if (!['development', 'staging', 'production'].includes(NODE_ENV)) {
  warnings.push(`⚠️  NODE_ENV="${NODE_ENV}" não é um valor padrão (development/staging/production)`);
} else {
  console.log(`✅ NODE_ENV configurado: ${NODE_ENV}`);
}

// 3. Verificar origens esperadas
console.log(`\n📝 Origens permitidas para ${NODE_ENV}:`);
expectedOrigins[NODE_ENV].forEach(origin => {
  console.log(`   - ${origin}`);
});

// 4. Verificar arquivo app.ts
const appTsPath = path.join(__dirname, '../src/app.ts');
if (fs.existsSync(appTsPath)) {
  const appTsContent = fs.readFileSync(appTsPath, 'utf8');
  
  // Verificar se tem configuração de CORS
  if (!appTsContent.includes('allowedOrigins')) {
    errors.push('❌ Arquivo app.ts não contém configuração allowedOrigins');
  } else {
    console.log('\n✅ Arquivo app.ts contém configuração de CORS');
  }
  
  // Verificar se permite requisições sem origem apenas em dev/staging
  if (appTsContent.includes('if (!origin)')) {
    const hasRestriction = appTsContent.includes('NODE_ENV === \'development\'') && 
                          appTsContent.includes('NODE_ENV === \'staging\'');
    if (hasRestriction) {
      console.log('✅ Requisições sem origem permitidas apenas em dev/staging');
    } else {
      warnings.push('⚠️  Configuração de requisições sem origem pode estar muito permissiva');
    }
  }
} else {
  errors.push('❌ Arquivo app.ts não encontrado');
}

// Resumo
console.log('\n' + '='.repeat(50));
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Validação CORS: TUDO OK!\n');
  process.exit(0);
} else {
  if (errors.length > 0) {
    console.log('\n❌ ERROS ENCONTRADOS:');
    errors.forEach(err => console.log(`   ${err}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  AVISOS:');
    warnings.forEach(warn => console.log(`   ${warn}`));
  }
  
  console.log('\n');
  process.exit(errors.length > 0 ? 1 : 0);
}

