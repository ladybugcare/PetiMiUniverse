#!/usr/bin/env node
/**
 * Script para adicionar @ts-ignore automaticamente em todos os ícones do lucide-react
 * que estão causando erros de tipo com React 18
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Padrão para encontrar linhas com ícones do lucide-react
// Procura por: <NomeDoIcone seguido de props como size, color, etc.
const iconPattern = /(\s*)(<[A-Z][a-zA-Z]*\s+size=)/g;

// Lista de arquivos para processar
const srcDir = path.join(__dirname, '../src');

function getAllTsxFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory() && !filePath.includes('node_modules')) {
      results = results.concat(getAllTsxFiles(filePath));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(filePath);
    }
  });
  
  return results;
}

function addTsIgnoreToFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let lines = content.split('\n');
  let newLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Verifica se a linha contém um ícone do lucide-react
    // Padrão: <NomeDoIcone seguido de props
    if (line.match(/<[A-Z][a-zA-Z]*\s+(size|color|fill|strokeWidth)=/)) {
      // Verifica se já tem @ts-ignore na linha anterior
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      if (!prevLine.includes('@ts-ignore') && !prevLine.includes('// @ts-ignore')) {
        // Adiciona @ts-ignore antes da linha do ícone
        const indent = line.match(/^(\s*)/)[1];
        newLines.push(`${indent}// @ts-ignore - Type incompatibility between React 18 and lucide-react`);
        modified = true;
      }
    }
    
    newLines.push(line);
  }
  
  if (modified) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    return true;
  }
  
  return false;
}

// Executa o script
console.log('🔍 Procurando arquivos com ícones do lucide-react...');
const files = getAllTsxFiles(srcDir);
console.log(`📁 Encontrados ${files.length} arquivos TypeScript/TSX`);

let modifiedCount = 0;
files.forEach(file => {
  if (addTsIgnoreToFile(file)) {
    modifiedCount++;
    console.log(`✅ Modificado: ${path.relative(srcDir, file)}`);
  }
});

console.log(`\n✨ Processo concluído! ${modifiedCount} arquivos modificados.`);

