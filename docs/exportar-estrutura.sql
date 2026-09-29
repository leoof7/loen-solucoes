-- ============================================================
-- LOEN SOLUÇÕES — Exportar a estrutura do banco
--
-- POR QUE ISTO EXISTE
--
-- As migrações 01 a 04 (as tabelas, as funções `criar_conta` e
-- `aceitar_convite`, e as regras de segurança) foram feitas no chat
-- anterior e existem SÓ DENTRO DO BANCO. Hoje ele é a única cópia.
--
-- Se o projeto for apagado, pausado ou perdido, não há como
-- reconstruir — nem por mim, nem por ninguém.
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É só leitura.
--
-- COMO USAR — 4 passos
--   1. Painel do Supabase > SQL Editor > New query
--   2. Cole TUDO isto e clique em Run
--   3. Vai aparecer UMA linha com UMA coluna chamada "estrutura".
--      Clique nela e copie o conteúdo inteiro
--   4. Cole no Bloco de Notas e salve como:
--         docs/estrutura-do-banco.json
--
-- Depois disso, o projeto passa a ter cópia de tudo:
--   - a ESTRUTURA fica neste arquivo
--   - os DADOS ficam no backup.ps1 (ou no backup pelo navegador)
--   - o APP fica no GitHub
-- ============================================================

select json_build_object(

  'exportado_em', now(),
  'projeto',      'rtisqipntpnvlhetfoeb',

  -- ---------- 1. As colunas de cada tabela ----------
  'colunas', (
    select json_agg(json_build_object(
             'tabela',    table_name,
             'ordem',     ordinal_position,
             'coluna',    column_name,
             'tipo',      data_type,
             'aceita_nulo', is_nullable,
             'padrao',    column_default
           ) order by table_name, ordinal_position)
      from information_schema.columns
     where table_schema = 'public'
  ),

  -- ---------- 2. Índices ----------
  'indices', (
    select json_agg(json_build_object(
             'tabela',  tablename,
             'nome',    indexname,
             'criacao', indexdef
           ) order by tablename, indexname)
      from pg_indexes
     where schemaname = 'public'
  ),

  -- ---------- 3. Chaves e restrições ----------
  'restricoes', (
    select json_agg(json_build_object(
             'tabela',    conrelid::regclass::text,
             'nome',      conname,
             'definicao', pg_get_constraintdef(oid)
           ) order by conrelid::regclass::text, conname)
      from pg_constraint
     where connamespace = 'public'::regnamespace
  ),

  -- ---------- 4. RLS ligada por tabela ----------
  'rls_ligada', (
    select json_agg(json_build_object(
             'tabela', tablename,
             'ligada', rowsecurity
           ) order by tablename)
      from pg_tables
     where schemaname = 'public'
  ),

  -- ---------- 5. As políticas de segurança ----------
  'politicas', (
    select json_agg(json_build_object(
             'tabela',    tablename,
             'nome',      policyname,
             'permissiva', permissive,
             'papeis',    roles::text,
             'comando',   cmd,
             'condicao',  qual,
             'condicao_insercao', with_check
           ) order by tablename, policyname)
      from pg_policies
     where schemaname = 'public'
  ),

  -- ---------- 6. O código das funções ----------
  -- Esta é a parte mais insubstituível: criar_conta, aceitar_convite
  -- e apagar_minha_conta não existem em arquivo nenhum.
  'funcoes', (
    select json_agg(json_build_object(
             'nome',      p.proname,
             'argumentos', pg_get_function_identity_arguments(p.oid),
             'codigo',    pg_get_functiondef(p.oid)
           ) order by p.proname)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  ),

  -- ---------- 7. Gatilhos ----------
  'gatilhos', (
    select json_agg(json_build_object(
             'tabela',   event_object_table,
             'nome',     trigger_name,
             'quando',   action_timing,
             'evento',   event_manipulation,
             'acao',     action_statement
           ) order by event_object_table, trigger_name)
      from information_schema.triggers
     where trigger_schema = 'public'
  ),

  -- ---------- 8. Permissões por coluna ----------
  -- É aqui que aparece o efeito das migrações 07, 08 e 12.
  'permissoes_por_coluna', (
    select json_agg(json_build_object(
             'tabela',    table_name,
             'coluna',    column_name,
             'permissao', privilege_type,
             'para_quem', grantee
           ) order by table_name, column_name, grantee)
      from information_schema.column_privileges
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated')
  ),

  -- ---------- 9. Permissões por tabela ----------
  'permissoes_por_tabela', (
    select json_agg(json_build_object(
             'tabela',    table_name,
             'permissao', privilege_type,
             'para_quem', grantee
           ) order by table_name, grantee, privilege_type)
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated')
  ),

  -- ---------- 10. Os baldes de arquivo ----------
  'storage_baldes', (
    select json_agg(json_build_object(
             'id',            id,
             'nome',          name,
             'publico',       public,
             'limite_tamanho', file_size_limit,
             'tipos_aceitos', allowed_mime_types
           ) order by id)
      from storage.buckets
  ),

  -- ---------- 11. As regras dos arquivos ----------
  'storage_politicas', (
    select json_agg(json_build_object(
             'nome',      policyname,
             'comando',   cmd,
             'condicao',  qual,
             'condicao_insercao', with_check
           ) order by policyname)
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
  )

)::text as estrutura;
