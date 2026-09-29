-- ============================================================
-- LOEN SOLUÇÕES — Backup pelo navegador (plano B, sem terminal)
--
-- Use isto quando o backup.ps1 não funcionar. Aqui não tem
-- chave, não tem terminal e não tem rede corporativa no meio:
-- roda dentro do painel do Supabase, que você já usa.
--
-- COMO USAR
--   1. Painel do Supabase > SQL Editor > New query
--   2. Cole tudo isto e clique em Run
--   3. Vai aparecer UMA linha com UMA coluna chamada "backup"
--   4. Clique na célula, copie o conteúdo inteiro
--   5. Cole no Bloco de Notas e salve como:
--        backups\loen_AAAA-MM-DD.json
--   6. Guarde uma cópia fora do computador (Drive, e-mail, HD)
--
-- O QUE ISTO SALVA
--   Os dados de todas as tabelas e a lista de logins.
--   A ESTRUTURA das tabelas não vem aqui — ela está nos arquivos
--   de docs/migracoes/, que ficam no git. Os dois juntos
--   reconstroem o banco inteiro.
--
-- Só leitura. Não altera, não apaga e não trava nada.
-- ============================================================

select json_build_object(
  'quando',            now(),
  'projeto',           'rtisqipntpnvlhetfoeb',

  'negocios',          (select coalesce(json_agg(t), '[]'::json) from public.negocios t),
  'perfis',            (select coalesce(json_agg(t), '[]'::json) from public.perfis t),
  'clientes',          (select coalesce(json_agg(t), '[]'::json) from public.clientes t),
  'servicos_catalogo', (select coalesce(json_agg(t), '[]'::json) from public.servicos_catalogo t),
  'atendimentos',      (select coalesce(json_agg(t), '[]'::json) from public.atendimentos t),
  'lancamentos',       (select coalesce(json_agg(t), '[]'::json) from public.lancamentos t),
  'retiradas',         (select coalesce(json_agg(t), '[]'::json) from public.retiradas t),
  'convites',          (select coalesce(json_agg(t), '[]'::json) from public.convites t),

  -- Os logins ficam fora das tabelas normais. Sem eles ninguém entra
  -- depois de uma restauração. Só id, e-mail e datas — nada de senha.
  'logins',            (select coalesce(json_agg(json_build_object(
                            'id', u.id,
                            'email', u.email,
                            'criado_em', u.created_at,
                            'ultimo_acesso', u.last_sign_in_at
                        )), '[]'::json) from auth.users u)
)::text as backup;


-- ------------------------------------------------------------
-- CONFERÊNCIA — rode depois para ver se o backup está completo.
-- Compare os números com o que você salvou.
-- ------------------------------------------------------------
-- select 'negocios' as tabela, count(*) from public.negocios
-- union all select 'perfis',            count(*) from public.perfis
-- union all select 'clientes',          count(*) from public.clientes
-- union all select 'servicos_catalogo', count(*) from public.servicos_catalogo
-- union all select 'atendimentos',      count(*) from public.atendimentos
-- union all select 'lancamentos',       count(*) from public.lancamentos
-- union all select 'retiradas',         count(*) from public.retiradas
-- union all select 'convites',          count(*) from public.convites
-- union all select 'logins (auth)',     count(*) from auth.users;
