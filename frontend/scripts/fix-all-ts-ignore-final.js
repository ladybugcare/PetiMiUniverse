#!/usr/bin/env node
/**
 * Script FINAL para corrigir TODOS os comentários @ts-ignore
 * Corrige automaticamente todos os padrões problemáticos
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
  let fixes = 0;
  
  // Padrão 1: // @ts-ignore seguido de JSX na próxima linha (dentro de tags JSX)
  // Exemplo: <div>\n  // @ts-ignore\n  <Icon />
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)(<[A-Z][a-zA-Z]*\s+[^>]*\/>)/g,
    (match, indent1, indent2, icon) => {
      fixes++;
      return `${indent1}{/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}\n${indent2}${icon}`;
    }
  );
  
  // Padrão 2: // @ts-ignore em props icon={...} (linha separada)
  // Exemplo: <Component\n  // @ts-ignore\n  icon={<Icon />}
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)icon=\{<([A-Z][a-zA-Z]*)\s+([^>]*)\/>\}/g,
    (match, indent1, indent2, iconName, iconProps) => {
      fixes++;
      return `${indent2}icon={/* @ts-ignore - Type incompatibility between React 18 and lucide-react */<${iconName} ${iconProps}/>}`;
    }
  );
  
  // Padrão 3: // @ts-ignore em objetos JavaScript (icon:)
  // Exemplo: {\n  // @ts-ignore\n  icon: <Icon />
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)icon:\s*(<[A-Z][a-zA-Z]*\s+[^>]*\/>)/g,
    (match, indent1, indent2, icon) => {
      fixes++;
      return `${indent2}icon: /* @ts-ignore - Type incompatibility between React 18 and lucide-react */${icon}`;
    }
  );
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes;
    console.log(`✅ ${path.relative(srcDir, filePath)}: ${fixes} correção(ões)`);
    return true;
  }
  
  return false;
}

// Executa o script
console.log('🔍 Corrigindo TODOS os comentários @ts-ignore...\n');

const files = getAllTsxFiles(srcDir);
console.log(`📁 Encontrados ${files.length} arquivos TypeScript/TSX\n`);

files.forEach(file => {
  fixFile(file);
});

console.log(`\n✨ Processo concluído!`);
console.log(`   📝 ${filesModified} arquivos modificados`);
console.log(`   🔧 ${totalFixes} correções aplicadas`);

