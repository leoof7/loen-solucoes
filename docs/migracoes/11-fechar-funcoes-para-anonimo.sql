-- ============================================================
-- LOEN SOLUÇÕES — migração 11
-- Fecha as funções internas para quem não tem login
--
-- O QUE FOI ENCONTRADO (31/08/2026, testando o link de aprovação)
--
-- Um visitante SEM LOGIN conseguia CHAMAR funções internas como
-- `listar_atendimentos`, `minha_meta` e `meus_totais`.
--
-- Nada vazou: todas fazem join com `perfis` por `auth.uid()`, que é
-- nulo para quem não está logado, então as consultas voltavam vazias.
-- Mas `meus_totais` devolvia `{"a_receber": 0}` em vez de nada — e o
-- fato de a chamada ser aceita já é uma camada de proteção a menos.
--
-- POR QUE ACONTECEU
--
-- O Postgres concede EXECUTE a PUBLIC em toda função nova, por padrão.
-- O `grant execute ... to authenticated` das migrações anteriores não
-- tirou esse acesso — só repetiu o que já estava aberto.
--
-- A CORREÇÃO
--
-- Tirar EXECUTE de PUBLIC em tudo e devolver só a quem precisa.
-- As duas funções do fluxo do cliente (`ver_orcamento_publico` e
-- `responder_orcamento`) continuam abertas para `anon` de propósito:
-- é por elas que o cliente abre o link e responde, sem login.
--
-- SEGURANÇA: só mexe em permissão de execução. Não apaga, não altera
-- e não move nenhum dado.
-- ============================================================

-- 1. Funções que exigem login. Ninguém mais chama sem estar logado.
revoke execute on function public.minha_meta()                       from public, anon;
revoke execute on function public.salvar_minha_meta(numeric, integer) from public, anon;
revoke execute on function public.listar_atendimentos(integer)        from public, anon;
revoke execute on function public.listar_orcamentos(integer)          from public, anon;
revoke execute on function public.meus_totais()                       from public, anon;
revoke execute on function public.gerar_link_orcamento(uuid)          from public, anon;
revoke execute on function public.registrar_evento(text, jsonb)       from public, anon;

grant execute on function public.minha_meta()                        to authenticated;
grant execute on function public.salvar_minha_meta(numeric, integer) to authenticated;
grant execute on function public.listar_atendimentos(integer)        to authenticated;
grant execute on function public.listar_orcamentos(integer)          to authenticated;
grant execute on function public.meus_totais()                       to authenticated;
grant execute on function public.gerar_link_orcamento(uuid)          to authenticated;
grant execute on function public.registrar_evento(text, jsonb)       to authenticated;


-- 2. As duas do cliente ficam abertas — é o que faz o link funcionar.
--    Revogamos de PUBLIC assim mesmo, para a permissão ficar declarada
--    em vez de herdada por padrão.
revoke execute on function public.ver_orcamento_publico(text)   from public;
revoke execute on function public.responder_orcamento(text, text) from public;

grant execute on function public.ver_orcamento_publico(text)    to anon, authenticated;
grant execute on function public.responder_orcamento(text, text) to anon, authenticated;


-- 3. `meus_totais` devolvia {"a_receber": 0} para quem não tem perfil.
--
-- A causa: `null <> 'dono'` não é verdadeiro nem falso em SQL, é NULO —
-- então o CASE caía no ELSE e somava um conjunto vazio. Agora a checagem
-- é explícita e a função devolve nada para quem não é dono.
create or replace function public.meus_totais()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select case
           when not exists (
             select 1 from public.perfis
              where id = auth.uid() and papel = 'dono'
           ) then null
           else json_build_object(
             'a_receber', coalesce((
               select sum(a.valor) from public.atendimentos a
                where a.negocio_id = (select negocio_id from public.perfis where id = auth.uid())
                  and a.situacao in ('realizado', 'pendente')), 0)
           )
         end;
$$;

revoke execute on function public.meus_totais() from public, anon;
grant  execute on function public.meus_totais() to authenticated;


-- ------------------------------------------------------------
-- CONFERÊNCIA
--
-- Logado, deve funcionar:
--   select public.minha_meta();
--   select public.meus_totais();
--
-- Quem verifica o lado anônimo é o app, saindo da conta e tentando
-- chamar as funções — foi assim que o problema apareceu.
-- ------------------------------------------------------------
