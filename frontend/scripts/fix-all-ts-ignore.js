#!/usr/bin/env node
/**
 * Script definitivo para corrigir TODOS os comentários @ts-ignore
 * 
 * ESTRATÉGIA:
 * 1. Encontra todos os casos de // @ts-ignore
 * 2. Identifica se está em JSX ou em objeto JavaScript
 * 3. Converte apropriadamente:
 *    - Dentro de JSX: // @ts-ignore → {/* @ts-ignore */}
 *    - Em objetos (icon:): // @ts-ignore → icon: /* @ts-ignore */<Icon />
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
  const originalContent = content;
  let modified = false;
  let fixes = 0;
  
  // Padrão 1: // @ts-ignore seguido de JSX na próxima linha (dentro de JSX)
  // Exemplo:
  //   <div>
  //     // @ts-ignore
  //     <Icon />
  //   </div>
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)(<[A-Z][a-zA-Z]*\s+[^>]*\/>)/g,
    (match, indent1, indent2, icon) => {
      modified = true;
      fixes++;
      return `${indent1}{/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}\n${indent2}${icon}`;
    }
  );
  
  // Padrão 2: // @ts-ignore em objetos JavaScript (icon:)
  // Exemplo:
  //   {
  //     // @ts-ignore
  //     icon: <Icon />
  //   }
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)icon:\s*(<[A-Z][a-zA-Z]*\s+[^>]*\/>)/g,
    (match, indent1, indent2, icon) => {
      modified = true;
      fixes++;
      return `${indent2}icon: /* @ts-ignore - Type incompatibility between React 18 and lucide-react */${icon}`;
    }
  );
  
  // Padrão 3: // @ts-ignore em return statements de objetos
  // Exemplo:
  //   return {
  //     // @ts-ignore
  //     icon: <Icon />
  //   }
  content = content.replace(
    /(\s*)\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react\n(\s*)return\s*\{\s*icon:\s*(<[A-Z][a-zA-Z]*\s+[^>]*\/>)/g,
    (match, indent1, indent2, icon) => {
      modified = true;
      fixes++;
      return `${indent2}return { icon: /* @ts-ignore - Type incompatibility between React 18 and lucide-react */${icon}`;
    }
  );
  
  // Padrão 4: // @ts-ignore dentro de tags JSX (mais comum)
  // Exemplo:
  //   <p>
  //     // @ts-ignore
  //     <Icon />
  //   </p>
  const lines = content.split('\n');
  const newLines = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
    
    // Verifica se é um comentário // @ts-ignore
    if (line.match(/^\s*\/\/ @ts-ignore - Type incompatibility between React 18 and lucide-react$/)) {
      // Verifica se a próxima linha tem JSX
      if (nextLine.match(/^\s*<[A-Z][a-zA-Z]*\s+[^>]*\/>/)) {
        // Está dentro de JSX
        const indent = line.match(/^(\s*)/)[1];
        newLines.push(`${indent}{/* @ts-ignore - Type incompatibility between React 18 and lucide-react */}`);
        modified = true;
        fixes++;
        i++;
        continue;
      } else if (nextLine.match(/^\s*icon:\s*<[A-Z][a-zA-Z]*\s+[^>]*\/>/)) {
        // Está em objeto JavaScript
        const indent = nextLine.match(/^(\s*)/)[1];
        const iconMatch = nextLine.match(/icon:\s*(<[^>]+>)/);
        if (iconMatch) {
          newLines.push(`${indent}icon: /* @ts-ignore - Type incompatibility between React 18 and lucide-react */${iconMatch[1]}`);
          modified = true;
          fixes++;
          i += 2;
          continue;
        }
      }
    }
    
    newLines.push(line);
    i++;
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
console.log('🔍 Procurando e corrigindo TODOS os comentários @ts-ignore...\n');

const files = getAllTsxFiles(srcDir);
console.log(`📁 Encontrados ${files.length} arquivos TypeScript/TSX\n`);

files.forEach(file => {
  fixFile(file);
});

console.log(`\n✨ Processo concluído!`);
console.log(`   📝 ${filesModified} arquivos modificados`);
console.log(`   🔧 ${totalFixes} correções aplicadas`);

