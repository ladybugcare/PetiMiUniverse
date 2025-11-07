#!/usr/bin/env node
/**
 * Script para corrigir APENAS comentários @ts-ignore dentro de JSX
 * que causam o erro "Objects are not valid as a React child"
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../src');
let filesModified = 0;
let totalFixes = 0;

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

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const lines = content.split('\n');
  const newLines = [];
  let modified = false;
  let fixes = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
    
    // Verifica se é um comentário // @ts-ignore
    if (line.match(/^\s*\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react$/)) {
      // Verifica se está dentro de JSX (não em objeto JavaScript)
      const hasJSXAfter = nextLine.match(/^\s*<[A-Z][a-zA-Z]*\s+[^>]*\/>/) || 
                          nextLine.match(/^\s*<[a-z]+[^>]*>/) ||
                          nextLine.match(/^\s*icon=\{<[A-Z]/);
      
      const isInObject = prevLine.match(/icon:\s*$/) || 
                        prevLine.match(/^\s*\{/) ||
                        prevLine.trim().endsWith(',');
      
      // Se tem JSX depois E não está em objeto, está dentro de JSX
      if (hasJSXAfter && !isInObject) {
        // Verifica se é prop icon={...}
        if (nextLine.match(/^\s*icon=\{<[A-Z]/)) {
          // É uma prop - converte para inline
          const indent = nextLine.match(/^(\s*)/)[1];
          const iconMatch = nextLine.match(/icon=\{<([A-Z][a-zA-Z]*)\s+([^>]*)\/>\}/);
          if (iconMatch) {
            newLines.push(`${indent}icon={/* @ts-ignore - Type incompatibility between React 18 and lucide-react */<${iconMatch[1]} ${iconMatch[2]}/>}`);
            i++; // Pula a próxima linha
            modified = true;
            fixes++;
            continue;
          }
        } else {
          // Está dentro de JSX - converte para comentário JSX
          const indent = line.match(/^(\s*)/)[1];
          newLines.push(`${indent}{/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}`);
          modified = true;
          fixes++;
          continue;
        }
      }
    }
    
    newLines.push(line);
  }
  
  if (modified) {
    content = newLines.join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes;
    console.log(`✅ ${path.relative(srcDir, filePath)}: ${fixes} correção(ões)`);
  }
  
  return modified;
}

// Executa o script
console.log('🔍 Corrigindo comentários @ts-ignore dentro de JSX...\n');

const files = getAllTsxFiles(srcDir);
console.log(`📁 Encontrados ${files.length} arquivos TypeScript/TSX\n`);

files.forEach(file => {
  fixFile(file);
});

console.log(`\n✨ Processo concluído!`);
console.log(`   📝 ${filesModified} arquivos modificados`);
console.log(`   🔧 ${totalFixes} correções aplicadas`);

