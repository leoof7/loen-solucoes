-- ============================================================
-- LOEN SOLUÇÕES — migração 13
-- Remover as tabelas que o app não usa
--
-- ⚠️  ESTA MIGRAÇÃO APAGA TABELAS E DADOS. NÃO TEM VOLTA.
--
-- Só rode depois de ler o que vai embora e decidir que é isso mesmo.
-- ============================================================
--
-- O QUE SERÁ APAGADO
--
--   checklists             3 linhas  ← TEM CONTEÚDO
--   checklist_itens       15 linhas  ← TEM CONTEÚDO
--   atendimento_checklist  0 linhas
--   historico_precos       0 linhas
--
-- As 18 linhas de conteúdo estão salvas em docs/checklists-modelo.md.
-- Se um dia a funcionalidade entrar, o texto é recuperável de lá — a
-- estrutura, não: teria que ser redesenhada.
--
-- ANTES DE RODAR, FAÇA O BACKUP:
--   .\backup.ps1
--
-- CONFERIDO EM 09/09/2026
--   - Nenhuma outra tabela aponta para estas (nenhuma chave estrangeira)
--   - Nenhum gatilho nelas
--   - Nenhuma função do banco as menciona
--   - Nenhuma tela do app as usa
--   Ou seja: remover não quebra nada do que existe hoje.
-- ============================================================


-- ------------------------------------------------------------
-- PASSO 1 — CONFIRA O QUE VAI EMBORA
--
-- Rode SÓ este bloco primeiro. Ele não apaga nada: só mostra.
-- ------------------------------------------------------------

select 'checklists'            as tabela, count(*) as linhas from public.checklists
union all
select 'checklist_itens',            count(*) from public.checklist_itens
union all
select 'atendimento_checklist',      count(*) from public.atendimento_checklist
union all
select 'historico_precos',           count(*) from public.historico_precos;


-- ------------------------------------------------------------
-- PASSO 2 — GUARDE O CONTEÚDO
--
-- Rode e salve o resultado. É a última chance de preservar o que
-- está nas tabelas antes de apagar.
-- ------------------------------------------------------------

select json_build_object(
         'salvo_em', now(),
         'checklists', (select coalesce(json_agg(c), '[]'::json) from public.checklists c),
         'checklist_itens', (select coalesce(json_agg(i), '[]'::json) from public.checklist_itens i),
         'atendimento_checklist', (select coalesce(json_agg(a), '[]'::json) from public.atendimento_checklist a),
         'historico_precos', (select coalesce(json_agg(h), '[]'::json) from public.historico_precos h)
       )::text as conteudo_antes_de_apagar;


-- ------------------------------------------------------------
-- PASSO 3 — APAGAR
--
-- ⚠️  DAQUI PARA BAIXO NÃO TEM VOLTA.
--
-- Rode só depois de fazer os passos 1 e 2 e de ter certeza.
--
-- A ordem importa: filho antes de pai, senão a chave estrangeira
-- impede. Por isso `checklist_itens` sai antes de `checklists`.
-- ------------------------------------------------------------

-- drop table public.atendimento_checklist;
-- drop table public.checklist_itens;
-- drop table public.checklists;
-- drop table public.historico_precos;


-- ------------------------------------------------------------
-- PASSO 4 — CONFERÊNCIA
--
-- Depois de apagar, isto deve devolver ZERO linhas.
-- ------------------------------------------------------------

-- select table_name
--   from information_schema.tables
--  where table_schema = 'public'
--    and table_name in ('checklists','checklist_itens',
--                       'atendimento_checklist','historico_precos');


-- ------------------------------------------------------------
-- DEPOIS DE RODAR
--
-- Refaça a exportação da estrutura, porque o arquivo
-- docs/estrutura-do-banco.json fica velho:
--   docs/exportar-estrutura.sql
-- ------------------------------------------------------------
