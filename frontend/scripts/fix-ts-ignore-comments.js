#!/usr/bin/env node
/**
 * Script definitivo para corrigir todos os comentários @ts-ignore dentro de JSX
 * 
 * PROBLEMA:
 * Comentários `// @ts-ignore` são comentários JavaScript, não JSX.
 * Quando usados dentro de JSX, são interpretados como conteúdo, causando erro:
 * "Objects are not valid as a React child"
 * 
 * SOLUÇÃO:
 * Converter todos os `// @ts-ignore` dentro de JSX para `{/* @ts-ignore */}`
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

function isInsideJSX(content, lineIndex) {
  const lines = content.split('\n');
  const currentLine = lines[lineIndex];
  
  // Verifica se a linha anterior ou próxima contém JSX
  const prevLine = lineIndex > 0 ? lines[lineIndex - 1] : '';
  const nextLine = lineIndex < lines.length - 1 ? lines[lineIndex + 1] : '';
  
  // Padrões que indicam JSX
  const jsxPatterns = [
    /<[A-Z][a-zA-Z]*/,
    /<\/[a-zA-Z]+>/,
    /<[a-z]+[^>]*>/,
    /\{[^}]*<[^>]+>/,
  ];
  
  // Verifica se está dentro de um return JSX
  let inJSXReturn = false;
  let braceCount = 0;
  let parenCount = 0;
  
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i];
    if (line.includes('return') && (line.includes('(') || line.includes('{'))) {
      inJSXReturn = true;
      break;
    }
    if (line.includes('function') || line.includes('=>') || line.includes('const') || line.includes('let')) {
      break;
    }
  }
  
  // Verifica se a próxima linha tem JSX
  const hasJSXAfter = jsxPatterns.some(pattern => pattern.test(nextLine));
  const hasJSXBefore = jsxPatterns.some(pattern => pattern.test(prevLine));
  
  // Verifica se está dentro de um objeto (não JSX)
  const isInObject = prevLine.includes('icon:') || prevLine.includes('icon =') || prevLine.trim().endsWith(',');
  
  return (hasJSXAfter || hasJSXBefore || inJSXReturn) && !isInObject;
}

function fixTsIgnoreComments(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const lines = content.split('\n');
  let modified = false;
  let fixes = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Encontra linhas com // @ts-ignore
    if (line.match(/^\s*\/\/ @ts-ignore/)) {
      // Verifica se está dentro de JSX
      if (isInsideJSX(content, i)) {
        // Converte para comentário JSX
        const indent = line.match(/^(\s*)/)[1];
        const newLine = `${indent}{/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}`;
        lines[i] = newLine;
        modified = true;
        fixes++;
      } else {
        // Está em objeto JavaScript, converte para inline
        const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
        if (nextLine.includes('<') && nextLine.includes('size=')) {
          // É um ícone em objeto, converte para inline
          const iconMatch = nextLine.match(/(icon:\s*)(<[^>]+>)/);
          if (iconMatch) {
            const indent = line.match(/^(\s*)/)[1];
            lines[i] = `${indent}icon: /* @ts-ignore - Type incompatibility between React 18 and lucide-react */${iconMatch[2]}`;
            lines[i + 1] = ''; // Remove a linha do ícone
            modified = true;
            fixes++;
          }
        }
      }
    }
  }
  
  if (modified) {
    content = lines.join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes;
    console.log(`✅ ${path.relative(srcDir, filePath)}: ${fixes} correção(ões)`);
  }
  
  return modified;
}

// Executa o script
console.log('🔍 Procurando e corrigindo comentários @ts-ignore dentro de JSX...\n');

const files = getAllTsxFiles(srcDir);
console.log(`📁 Encontrados ${files.length} arquivos TypeScript/TSX\n`);

files.forEach(file => {
  fixTsIgnoreComments(file);
});

console.log(`\n✨ Processo concluído!`);
console.log(`   📝 ${filesModified} arquivos modificados`);
console.log(`   🔧 ${totalFixes} correções aplicadas`);

