// ============================================================
// LOEN SOLUÇÕES — Backup do banco, sem CLI
//
// O CLI do Supabase falha nesta máquina com "Transport error".
// Este script pula o CLI e fala direto com a API do projeto,
// que já testamos e responde normal.
//
// Usa só o Node, que você já tem. Não precisa da senha do banco,
// não precisa do pg_dump, não precisa de instalar nada.
//
// Gera dois arquivos por tabela dentro de backups/:
//   - .json  para eu ler e conferir
//   - .sql   com INSERTs, para repor os dados se precisar
//
// A ESTRUTURA das tabelas não vem aqui — ela vive nos arquivos
// de migração em docs/migracoes/, versionados no git. Os dois
// juntos reconstroem o banco inteiro.
// ============================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const PROJETO = 'rtisqipntpnvlhetfoeb';
const CHAVE   = process.env.SUPABASE_SECRET_KEY;
const BASE    = `https://${PROJETO}.supabase.co`;

const TABELAS = ['negocios', 'perfis', 'clientes', 'servicos_catalogo',
                 'atendimentos', 'lancamentos', 'retiradas', 'convites'];

if (!CHAVE) {
  console.error(`
Falta a chave secreta do projeto.

  1. Abra: https://supabase.com/dashboard/project/${PROJETO}/settings/api-keys
  2. Desca ate "Secret keys". Na linha "default", clique no icone de OLHO
     para revelar, e depois no icone de copiar. Ela comeca com sb_secret_
  3. Rode aqui, trocando pela sua chave:

     $env:SUPABASE_SECRET_KEY = "cole_a_chave_aqui"

  4. Rode de novo: node backup.mjs

ATENCAO: esta chave ignora todas as regras de seguranca do banco.
Ela NUNCA vai para o codigo, NUNCA para o git e NUNCA para um print.
Se ela vazar, revogue na mesma tela e crie outra.
`);
  process.exit(1);
}

// As chaves novas (sb_secret_...) NAO sao JWT. Se forem mandadas no
// cabecalho Authorization, o Supabase tenta ler como JWT e recusa com
// "Invalid JWT". Elas vao so no cabecalho apikey.
// As antigas (service_role, que comecam com eyJ) precisam dos dois.
const ehChaveNova = CHAVE.startsWith('sb_');
const cabecalho = ehChaveNova
  ? { apikey: CHAVE }
  : { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` };

// Traz a tabela inteira, de mil em mil, para não estourar o limite da API.
async function baixarTabela(nome) {
  const tudo = [];
  const passo = 1000;
  for (let de = 0; ; de += passo) {
    const r = await fetch(`${BASE}/rest/v1/${nome}?select=*`, {
      headers: { ...cabecalho, Range: `${de}-${de + passo - 1}` }
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const parte = await r.json();
    tudo.push(...parte);
    if (parte.length < passo) break;
  }
  return tudo;
}

// Os logins ficam no Auth, fora das tabelas. Sem eles ninguém entra.
async function baixarLogins() {
  const todos = [];
  for (let p = 1; ; p++) {
    const r = await fetch(`${BASE}/auth/v1/admin/users?page=${p}&per_page=200`, { headers: cabecalho });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const { users } = await r.json();
    if (!users?.length) break;
    todos.push(...users.map(u => ({
      id: u.id, email: u.email, criado_em: u.created_at, ultimo_acesso: u.last_sign_in_at
    })));
    if (users.length < 200) break;
  }
  return todos;
}

const valorSql = (v) =>
    v === null || v === undefined ? 'null'
  : typeof v === 'number'  ? String(v)
  : typeof v === 'boolean' ? (v ? 'true' : 'false')
  : typeof v === 'object'  ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  : `'${String(v).replace(/'/g, "''")}'`;

function gerarSql(tabela, linhas) {
  if (!linhas.length) return `-- ${tabela}: vazia\n`;
  const colunas = Object.keys(linhas[0]);
  const valores = linhas
    .map(l => '  (' + colunas.map(c => valorSql(l[c])).join(', ') + ')')
    .join(',\n');
  return `-- ${tabela}: ${linhas.length} linha(s)\n` +
         `insert into public.${tabela} (${colunas.join(', ')}) values\n${valores}\n` +
         `on conflict (id) do nothing;\n`;
}

// ------------------------------------------------------------

const carimbo = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
const pasta = join(process.cwd(), 'backups');
mkdirSync(pasta, { recursive: true });

console.log(`\nLoen Solucoes - Backup do banco`);
console.log(`======================\n`);

const resumo = {};
let sqlCompleto = `-- Loen Soluções — dados em ${new Date().toLocaleString('pt-BR')}\n` +
                  `-- Rode as migracoes de docs/migracoes/ ANTES deste arquivo.\n\n` +
                  `begin;\n\n`;
let falhou = false;

for (const t of TABELAS) {
  try {
    const linhas = await baixarTabela(t);
    resumo[t] = linhas.length;
    writeFileSync(join(pasta, `${carimbo}_${t}.json`), JSON.stringify(linhas, null, 2));
    sqlCompleto += gerarSql(t, linhas) + '\n';
    console.log(`  ${t.padEnd(20)} ${String(linhas.length).padStart(5)} linha(s)`);
  } catch (e) {
    falhou = true;
    console.log(`  ${t.padEnd(20)} FALHOU: ${e.message.slice(0, 70)}`);
  }
}

try {
  const logins = await baixarLogins();
  resumo['(logins do Auth)'] = logins.length;
  writeFileSync(join(pasta, `${carimbo}_logins.json`), JSON.stringify(logins, null, 2));
  console.log(`  ${'(logins do Auth)'.padEnd(20)} ${String(logins.length).padStart(5)} conta(s)`);
} catch (e) {
  falhou = true;
  console.log(`  (logins do Auth)     FALHOU: ${e.message.slice(0, 70)}`);
}

sqlCompleto += 'commit;\n';
writeFileSync(join(pasta, `${carimbo}_dados.sql`), sqlCompleto);
writeFileSync(join(pasta, `${carimbo}_resumo.json`),
  JSON.stringify({ quando: new Date().toISOString(), projeto: PROJETO, linhas: resumo }, null, 2));

console.log('');
if (falhou) {
  console.log('ATENCAO: algo falhou acima. Isto NAO e um backup completo.\n');
  process.exit(1);
}
console.log(`Tudo salvo em backups\\ com o carimbo ${carimbo}`);
console.log(`Guarde uma copia fora deste computador. Backup que so`);
console.log(`existe num lugar nao e backup.\n`);
