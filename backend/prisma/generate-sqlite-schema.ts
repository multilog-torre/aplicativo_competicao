/**
 * Gera prisma/schema.sqlite.prisma a partir do schema canônico (PostgreSQL).
 *
 * O PostgreSQL é a ÚNICA fonte de verdade do modelo de dados (prisma/schema.prisma).
 * O schema SQLite existe apenas como conveniência para desenvolvimento local em
 * máquinas sem Docker/PostgreSQL, e NUNCA deve ser editado à mão — antes desta
 * automação os dois arquivos divergiram e a versão SQLite perdeu todos os @@index.
 *
 * Uso: npm run db:sqlite:sync
 */

import fs from 'fs';
import path from 'path';

const CANONICAL = path.resolve(__dirname, 'schema.prisma');
const TARGET = path.resolve(__dirname, 'schema.sqlite.prisma');

const canonical = fs.readFileSync(CANONICAL, 'utf-8');

const derived = canonical
  .replace(
    /^\/\/ Prisma Schema.*$/m,
    '// ARQUIVO GERADO AUTOMATICAMENTE — NÃO EDITE.\n' +
      '// Origem: prisma/schema.prisma (fonte de verdade). Regenere com: npm run db:sqlite:sync',
  )
  .replace(/provider = "postgresql"/, 'provider = "sqlite"')
  .replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url      = "file:./dev.db"');

if (derived === canonical) {
  console.error('❌ Nenhuma substituição aplicada — o schema canônico mudou de formato?');
  process.exit(1);
}

fs.writeFileSync(TARGET, derived, 'utf-8');
console.log('✅ schema.sqlite.prisma regenerado a partir de schema.prisma');
