#!/usr/bin/env node
/**
 * Script COMPLETO para corrigir TODOS os erros de React relacionados a lucide-react
 * Corrige:
 * 1. Comentários // @ts-ignore dentro de JSX
 * 2. Ícones sem wrapper adequado
 * 3. Comentários em objetos JavaScript
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
  
  // Padrão 1: // @ts-ignore dentro de JSX (antes de componente JSX)
  // Exemplo: <div>\n  // @ts-ignore\n  <Icon />
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)(<[A-Z][a-zA-Z]*\s+[^>]*\/>)/g,
    (match, indent1, indent2, icon) => {
      fixes++;
      return `${indent1}{/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}\n${indent2}${icon}`;
    }
  );
  
  // Padrão 2: // @ts-ignore em props icon={...} (linha separada)
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)icon=\{<([A-Z][a-zA-Z]*)\s+([^>]*)\/>\}/g,
    (match, indent1, indent2, iconName, iconProps) => {
      fixes++;
      return `${indent2}icon={/* @ts-ignore - Type incompatibility between React 18 and lucide-react */<${iconName} ${iconProps}/>}`;
    }
  );
  
  // Padrão 3: // @ts-ignore em objetos JavaScript (icon:)
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)icon:\s*(<[A-Z][a-zA-Z]*\s+[^>]*\/>)/g,
    (match, indent1, indent2, icon) => {
      fixes++;
      return `${indent2}icon: /* @ts-ignore - Type incompatibility between React 18 and lucide-react */${icon}`;
    }
  );
  
  // Padrão 4: Ícones lucide-react diretamente em <p> ou outros elementos inline
  // Procura por padrões como: <p>...<Icon />...</p> sem wrapper
  const lines = content.split('\n');
  const newLines = [];
  let inParagraph = false;
  let paragraphStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detecta início de <p> com style display:flex
    if (trimmed.match(/<p[^>]*style[^>]*display[^>]*flex/i) && !trimmed.includes('</p>')) {
      inParagraph = true;
      paragraphStart = i;
      newLines.push(line);
      continue;
    }
    
    // Detecta fim de </p>
    if (inParagraph && trimmed.includes('</p>')) {
      inParagraph = false;
      newLines.push(line);
      continue;
    }
    
    // Se estamos dentro de um <p> e encontramos um ícone lucide-react sem wrapper
    if (inParagraph && trimmed.match(/^\{\/\* @ts-ignore.*\*\/\}$/)) {
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      if (nextLine.trim().match(/^<[A-Z][a-zA-Z]*\s+size=/)) {
        // Envolve o ícone em um span
        const indent = line.match(/^(\s*)/)[1];
        newLines.push(line);
        newLines.push(`${indent}<span style={{ display: 'inline-flex', alignItems: 'center' }}>`);
        newLines.push(lines[i + 1]);
        newLines.push(`${indent}</span>`);
        i++; // Pula a próxima linha já que foi processada
        fixes++;
        continue;
      }
    }
    
    newLines.push(line);
  }
  
  if (newLines.length !== lines.length) {
    content = newLines.join('\n');
  }
  
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
console.log('🔍 Corrigindo TODOS os erros de React relacionados a lucide-react...\n');

const files = getAllTsxFiles(srcDir);
console.log(`📁 Encontrados ${files.length} arquivos TypeScript/TSX\n`);

files.forEach(file => {
  fixFile(file);
});

console.log(`\n✨ Processo concluído!`);
console.log(`   📝 ${filesModified} arquivos modificados`);
console.log(`   🔧 ${totalFixes} correções aplicadas`);

