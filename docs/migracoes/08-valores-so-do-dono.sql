-- ============================================================
-- LOEN SOLUÇÕES — migração 08
-- Valor de serviço e de orçamento passa a ser só do dono
--
-- A REGRA (definida pelo Leandro em 31/08/2026)
--
-- "O dado sensível é apenas valores. De resto, os dados do cliente
-- podem aparecer."
--
-- Ou seja: quem entra por convite de equipe vê o cliente inteiro
-- (nome, telefone, endereço, CNPJ) — precisa disso para trabalhar.
-- O que ela NÃO vê é quanto o negócio cobrou.
--
-- O QUE JÁ ESTAVA PROTEGIDO (conferido em 31/08)
--   - lancamentos  : profissional não lê nada
--   - retiradas    : profissional não lê nada
--   - lançar dinheiro: bloqueado
--   - alterar a meta: bloqueado
--   - a meta em si  : fechada pela migração 07
--
-- O QUE FALTAVA
--   - atendimentos.valor  : a funcionária via quanto a patroa cobrou
--   - orcamentos.valor    : idem
--
-- COMO FUNCIONA
--
-- A RLS filtra linhas, não colunas. Então tiramos a permissão de
-- leitura da coluna `valor` e devolvemos os dados por funções que
-- decidem, na hora, se quem chamou é dono.
--
-- Para quem NÃO é dono, `valor` volta como NULL — e o app mostra
-- um traço no lugar do dinheiro.
--
-- IMPORTANTE: o profissional CONTINUA podendo registrar um serviço
-- com valor. Ele sabe o que cobrou no atendimento que ele mesmo fez;
-- o que ele não vê é o histórico de valores do negócio. Escrever não
-- depende de poder ler.
--
-- SEGURANÇA: só mexe em permissão e cria funções de leitura.
-- Não apaga, não altera e não move nenhum dado.
-- ============================================================

-- 1. Ninguém lê a coluna `valor` direto da tabela.
revoke select (valor) on public.atendimentos from authenticated, anon;
revoke select (valor) on public.orcamentos   from authenticated, anon;


-- 2. Atendimentos, com o valor só para o dono.
create or replace function public.listar_atendimentos(p_limite integer default 200)
returns setof json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
           'id', a.id,
           'negocio_id', a.negocio_id,
           'cliente_id', a.cliente_id,
           'servico_id', a.servico_id,
           'profissional_id', a.profissional_id,
           'tipo', a.tipo,
           'servico_nome', a.servico_nome,
           'titulo', a.titulo,
           'descricao', a.descricao,
           'data', a.data,
           'hora', a.hora,
           'endereco', a.endereco,
           'referencia', a.referencia,
           'forma_pagamento', a.forma_pagamento,
           'situacao', a.situacao,
           'criado_em', a.criado_em,
           'clientes', json_build_object('nome', c.nome),
           -- O dinheiro só sai daqui se quem pediu for o dono.
           'valor', case when eu.papel = 'dono' then a.valor else null end,
           'pode_ver_valor', (eu.papel = 'dono')
         )
    from public.atendimentos a
    join public.perfis eu on eu.id = auth.uid()
    left join public.clientes c on c.id = a.cliente_id
   where a.negocio_id = eu.negocio_id
   order by a.data desc, a.criado_em desc
   limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;

grant execute on function public.listar_atendimentos(integer) to authenticated;


-- 3. Orçamentos, mesma ideia.
create or replace function public.listar_orcamentos(p_limite integer default 200)
returns setof json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
           'id', o.id,
           'negocio_id', o.negocio_id,
           'cliente_id', o.cliente_id,
           'atendimento_id', o.atendimento_id,
           'origem', o.origem,
           'titulo', o.titulo,
           'descricao', o.descricao,
           'prazo', o.prazo,
           'validade', o.validade,
           'status', o.status,
           'enviado_em', o.enviado_em,
           'endereco', o.endereco,
           'referencia', o.referencia,
           'criado_em', o.criado_em,
           'valor', case when eu.papel = 'dono' then o.valor else null end,
           'pode_ver_valor', (eu.papel = 'dono')
         )
    from public.orcamentos o
    join public.perfis eu on eu.id = auth.uid()
   where o.negocio_id = eu.negocio_id
   order by o.criado_em desc
   limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;

grant execute on function public.listar_orcamentos(integer) to authenticated;


-- 4. As somas de dinheiro, calculadas no banco e só para o dono.
--
-- De quebra isto resolve o velho problema de somar no navegador:
-- a conta passa a ver TODOS os registros, sem baixar todos eles.
create or replace function public.meus_totais()
returns json
language sql
security definer
stable
set search_path = public
as $$
  with eu as (
    select negocio_id, papel from public.perfis where id = auth.uid()
  )
  select case when (select papel from eu) <> 'dono' then null else
    json_build_object(
      'a_receber', coalesce((
        select sum(a.valor) from public.atendimentos a
         where a.negocio_id = (select negocio_id from eu)
           and a.situacao in ('realizado', 'pendente')), 0)
    )
  end;
$$;

grant execute on function public.meus_totais() to authenticated;


-- ------------------------------------------------------------
-- CONFERÊNCIA
--
-- 1) Como DONO, deve trazer os valores preenchidos:
--      select public.listar_atendimentos(5);
--
-- 2) Deve dar ERRO de permissão — é o resultado esperado:
--      select valor from public.atendimentos;
--
-- 3) Deve continuar funcionando, sem a coluna valor:
--      select id, servico_nome, data, situacao from public.atendimentos;
-- ------------------------------------------------------------
