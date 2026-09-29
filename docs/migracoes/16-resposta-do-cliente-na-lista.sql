-- ============================================================
-- LOEN SOLUÇÕES — migração 16
-- A lista de orçamentos passa a trazer a resposta do cliente
--
-- Não apaga nada. Só recria a função listar_orcamentos com dois
-- campos a mais.
-- ============================================================
--
-- POR QUE ISTO EXISTE
--
-- Quando o cliente aprova ou recusa pelo link, o banco grava a
-- resposta (resposta_cliente) e a hora (respondido_em) desde a
-- migração 09. Mas a listar_orcamentos não mandava esses campos para
-- o app — então quem usa o app não tinha como saber que foi o CLIENTE
-- que respondeu, nem quando. Pedido do Leandro em 29/09/2026.
-- ============================================================

create or replace function public.listar_orcamentos(p_limite integer default 200)
returns setof json
language sql
stable security definer
set search_path to 'public'
as $$
  select json_build_object(
           'id',               o.id,
           'negocio_id',       o.negocio_id,
           'cliente_id',       o.cliente_id,
           'atendimento_id',   o.atendimento_id,
           'origem',           o.origem,
           'titulo',           o.titulo,
           'descricao',        o.descricao,
           'prazo',            o.prazo,
           'validade',         o.validade,
           'status',           o.status,
           'enviado_em',       o.enviado_em,
           'endereco',         o.endereco,
           'referencia',       o.referencia,
           'criado_em',        o.criado_em,
           'forma_pagamento',  o.forma_pagamento,
           'parcelas',         o.parcelas,
           'resposta_cliente', o.resposta_cliente,
           'respondido_em',    o.respondido_em,
           'valor',            case when eu.papel = 'dono' then o.valor else null end,
           'pode_ver_valor',   (eu.papel = 'dono')
         )
    from public.orcamentos o
    join public.perfis eu on eu.id = auth.uid()
   where o.negocio_id = eu.negocio_id
   order by o.criado_em desc
   limit greatest(1, least(coalesce(p_limite, 200), 500));
$$;
