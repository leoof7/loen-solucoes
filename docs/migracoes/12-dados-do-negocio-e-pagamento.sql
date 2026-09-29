-- ============================================================
-- LOEN SOLUÇÕES — migração 12
-- Dados do negócio para o orçamento, e forma de pagamento
--
-- O QUE ENTRA E POR QUÊ
--
-- 1. CNPJ, site e Instagram no negócio.
--    O orçamento hoje mostra o CNPJ do CLIENTE, mas não o de quem
--    está cobrando — e é esse que a empresa pede para pagar nota.
--    Site e Instagram vão no rodapé do PDF: para esse público, o
--    Instagram costuma ser o portfólio.
--
-- 2. Forma de pagamento e parcelas, no orçamento e no atendimento.
--    "R$ 1.560 no cartão em 3x" é uma informação diferente de
--    "R$ 1.560". Quem recebe o orçamento precisa dela para decidir.
--
-- SEGURANÇA: só adiciona colunas opcionais. Não apaga, não altera e
-- não move nenhum dado. Rodar duas vezes não causa problema.
-- ============================================================

-- 1. Dados do negócio que aparecem no orçamento
alter table public.negocios
  add column if not exists cnpj      text,
  add column if not exists site      text,
  add column if not exists instagram text,
  add column if not exists endereco  text,
  add column if not exists email     text;

comment on column public.negocios.cnpj is
  'CNPJ de quem emite o orçamento. Aparece no PDF.';
comment on column public.negocios.instagram is
  'Perfil do Instagram, sem o @. Vai no rodapé do orçamento.';

-- 2. Como o cliente vai pagar
alter table public.orcamentos
  add column if not exists forma_pagamento text,
  add column if not exists parcelas        smallint;

alter table public.atendimentos
  add column if not exists parcelas smallint;

comment on column public.orcamentos.forma_pagamento is
  'à vista | pix | cartão | parcelado. Texto livre por escolha: a lista muda com o tempo.';
comment on column public.orcamentos.parcelas is
  'Quantidade de parcelas quando o pagamento é no cartão ou parcelado.';

-- Parcela negativa ou absurda não existe. O app já valida, mas o banco
-- é quem garante — é ele que não pode ser enganado.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orcamentos_parcelas_validas') then
    alter table public.orcamentos
      add constraint orcamentos_parcelas_validas
      check (parcelas is null or (parcelas >= 1 and parcelas <= 48));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'atendimentos_parcelas_validas') then
    alter table public.atendimentos
      add constraint atendimentos_parcelas_validas
      check (parcelas is null or (parcelas >= 1 and parcelas <= 48));
  end if;
end $$;


-- 3. CORREÇÃO DO BUG 16 — a migração 07 não funcionou de verdade.
--
-- Testado em 08/09/2026: uma funcionária ainda lia `prolabore_valor`,
-- tanto direto quanto pelo embed do PostgREST.
--
-- POR QUÊ: no Postgres, `revoke select (coluna)` NÃO tem efeito quando
-- existe um `grant select` na TABELA INTEIRA — e `negocios` tem. O
-- grant amplo vence o revoke específico, calado.
--
-- O jeito certo é o contrário: tirar o acesso à tabela toda e devolver
-- coluna por coluna, deixando de fora as que ninguém pode ver.
--
-- (A migração 08 pareceu funcionar em `atendimentos` porque lá o grant
-- de tabela já não existia. Mesma sintaxe, resultado diferente — é o
-- tipo de coisa que só aparece testando.)

revoke select on public.negocios from authenticated, anon;

grant select (
  id, nome, tipo_atividade, tem_equipe, logo_caminho, criado_em,
  cnpj, site, instagram, endereco, email
) on public.negocios to authenticated;

-- prolabore_valor e prolabore_dia ficam de fora de propósito: são a
-- meta do dono. Quem precisa delas usa `minha_meta()`, que confere o
-- papel antes de responder.

-- O dono continua podendo alterar o próprio negócio.
grant update (
  nome, tipo_atividade, tem_equipe, logo_caminho,
  cnpj, site, instagram, endereco, email,
  prolabore_valor, prolabore_dia
) on public.negocios to authenticated;


-- 4. `listar_orcamentos` precisa devolver os campos novos.
--    Sem isto, a lista do app não enxerga a forma de pagamento.
--
-- ATENÇÃO AO TIPO DE RETORNO — foi onde a primeira versão quebrou.
--
-- Esta função já existe devolvendo `setof json`, e a primeira versão
-- desta migração tentava recriá-la como `setof public.orcamentos`.
-- O Postgres recusa: `create or replace` não muda tipo de retorno.
--   ERROR 42P13: cannot change return type of existing function
--
-- A correção não é dropar a função — é não mudar o tipo. Mantemos
-- `setof json` e só acrescentamos os dois campos novos.
--
-- O `valor` continua escondido de quem não é dono, como na migração 08.
create or replace function public.listar_orcamentos(p_limite integer default 200)
returns setof json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
           'id',              o.id,
           'negocio_id',      o.negocio_id,
           'cliente_id',      o.cliente_id,
           'atendimento_id',  o.atendimento_id,
           'origem',          o.origem,
           'titulo',          o.titulo,
           'descricao',       o.descricao,
           'prazo',           o.prazo,
           'validade',        o.validade,
           'status',          o.status,
           'enviado_em',      o.enviado_em,
           'endereco',        o.endereco,
           'referencia',      o.referencia,
           'criado_em',       o.criado_em,
           'forma_pagamento', o.forma_pagamento,
           'parcelas',        o.parcelas,
           'valor',           case when eu.papel = 'dono' then o.valor else null end,
           'pode_ver_valor',  (eu.papel = 'dono')
         )
    from public.orcamentos o
    join public.perfis eu on eu.id = auth.uid()
   where o.negocio_id = eu.negocio_id
   order by o.criado_em desc
   limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;

revoke execute on function public.listar_orcamentos(integer) from public, anon;
grant  execute on function public.listar_orcamentos(integer) to authenticated;


-- 4b. `listar_atendimentos` idem: ganha `parcelas`, mantendo o tipo.
create or replace function public.listar_atendimentos(p_limite integer default 200)
returns setof json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
           'id',              a.id,
           'negocio_id',      a.negocio_id,
           'cliente_id',      a.cliente_id,
           'servico_id',      a.servico_id,
           'profissional_id', a.profissional_id,
           'criado_por',      a.criado_por,
           'tipo',            a.tipo,
           'servico_nome',    a.servico_nome,
           'titulo',          a.titulo,
           'descricao',       a.descricao,
           'data',            a.data,
           'hora',            a.hora,
           'endereco',        a.endereco,
           'referencia',      a.referencia,
           'forma_pagamento', a.forma_pagamento,
           'parcelas',        a.parcelas,
           'situacao',        a.situacao,
           'observacao',      a.observacao,
           'criado_em',       a.criado_em,
           'clientes',        json_build_object('nome', c.nome),
           'valor',           case when eu.papel = 'dono' then a.valor else null end,
           'pode_ver_valor',  (eu.papel = 'dono')
         )
    from public.atendimentos a
    join public.perfis eu on eu.id = auth.uid()
    left join public.clientes c on c.id = a.cliente_id
   where a.negocio_id = eu.negocio_id
   order by a.data desc, a.criado_em desc
   limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;

revoke execute on function public.listar_atendimentos(integer) from public, anon;
grant  execute on function public.listar_atendimentos(integer) to authenticated;


-- 5. O cliente também precisa ver como pode pagar, na página do link.
create or replace function public.ver_orcamento_publico(p_token text)
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
           'titulo',        o.titulo,
           'descricao',     o.descricao,
           'valor',         o.valor,
           'prazo',         o.prazo,
           'validade',      o.validade,
           'status',        o.status,
           'criado_em',     o.criado_em,
           'respondido_em', o.respondido_em,
           'endereco',      o.endereco,
           'forma_pagamento', o.forma_pagamento,
           'parcelas',      o.parcelas,
           'vencido',       (o.validade is not null and o.validade < current_date),
           'negocio',       json_build_object(
                              'nome',      coalesce(n.nome, n.tipo_atividade),
                              'atividade', n.tipo_atividade,
                              'cnpj',      n.cnpj,
                              'site',      n.site,
                              'instagram', n.instagram
                            ),
           'cliente',       json_build_object('nome', c.nome),
           'itens',         coalesce((
                              select json_agg(json_build_object(
                                       'descricao',  i.descricao,
                                       'quantidade', i.quantidade
                                     ) order by i.ordem)
                                from public.orcamento_itens i
                               where i.orcamento_id = o.id
                                 and i.tipo <> 'margem'
                            ), '[]'::json)
         )
    from public.orcamentos o
    join public.negocios n on n.id = o.negocio_id
    left join public.clientes c on c.id = o.cliente_id
   where o.token_publico = p_token
     and p_token is not null
     and length(p_token) = 16;
$$;

revoke execute on function public.ver_orcamento_publico(text) from public;
grant  execute on function public.ver_orcamento_publico(text) to anon, authenticated;


-- ------------------------------------------------------------
-- CONFERÊNCIA — deve devolver 7 linhas
-- ------------------------------------------------------------
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'negocios'     and column_name in ('cnpj','site','instagram','endereco','email'))
     or (table_name = 'orcamentos'   and column_name in ('forma_pagamento','parcelas'))
     or (table_name = 'atendimentos' and column_name = 'parcelas'))
 order by table_name, column_name;
