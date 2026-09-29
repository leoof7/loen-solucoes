-- ============================================================
-- LOEN SOLUÇÕES — migração 09
-- O cliente aprova ou recusa o orçamento por um link
--
-- COMO FUNCIONA
--
-- Cada orçamento ganha um código secreto. Ela manda o link junto com
-- o PDF; o cliente abre no navegador, vê o orçamento e toca em
-- Aprovar ou Recusar. O status muda sozinho no app dela.
--
-- O cliente NÃO faz login. Quem abre o link vê aquele orçamento — e
-- só aquele. É por isso que o código precisa ser secreto e sorteado,
-- nunca sequencial.
--
-- ISTO NÃO É ASSINATURA DIGITAL. É um aceite: guardamos o que foi
-- respondido e quando. Assinatura com valor jurídico exigiria
-- Clicksign, D4Sign ou ICP-Brasil, que são pagos.
--
-- SEGURANÇA: adiciona colunas e cria funções. Não apaga, não altera
-- e não move nenhum dado. Rodar duas vezes não causa problema.
-- ============================================================

-- 1. O código do link e o registro da resposta do cliente.
alter table public.orcamentos
  add column if not exists token_publico    text,
  add column if not exists respondido_em    timestamptz,
  add column if not exists resposta_cliente text;

comment on column public.orcamentos.token_publico is
  'Código secreto do link público. Sorteado, nunca sequencial.';
comment on column public.orcamentos.respondido_em is
  'Quando o cliente respondeu pelo link. Nulo se respondeu por fora.';

create unique index if not exists orcamentos_token_publico_idx
  on public.orcamentos (token_publico)
  where token_publico is not null;


-- 2. Gera o código do link, só para quem é do negócio.
--
-- 16 caracteres sorteados de um alfabeto sem 0/O e 1/I/l, que são os
-- que a pessoa confunde ao ditar por telefone.
create or replace function public.gerar_link_orcamento(p_orcamento uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token   text;
  v_negocio uuid;
  v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
begin
  select o.negocio_id into v_negocio
    from public.orcamentos o
    join public.perfis p on p.negocio_id = o.negocio_id
   where o.id = p_orcamento
     and p.id = auth.uid();

  if v_negocio is null then
    raise exception 'Orçamento não encontrado.';
  end if;

  -- Já tem link? Devolve o mesmo, para não invalidar o que ela já mandou.
  select token_publico into v_token from public.orcamentos where id = p_orcamento;
  if v_token is not null then return v_token; end if;

  v_token := '';
  for i in 1..16 loop
    v_token := v_token || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
  end loop;

  update public.orcamentos set token_publico = v_token where id = p_orcamento;
  return v_token;
end;
$$;

grant execute on function public.gerar_link_orcamento(uuid) to authenticated;


-- 3. O que o cliente vê ao abrir o link.
--
-- Devolve só o necessário para ele decidir. Nada de id de negócio, de
-- perfil, nem de qualquer outro orçamento. O valor vai, obviamente —
-- é um orçamento.
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
           'vencido',       (o.validade is not null and o.validade < current_date),
           'negocio',       json_build_object(
                              'nome', coalesce(n.nome, n.tipo_atividade),
                              'atividade', n.tipo_atividade
                            ),
           'cliente',       json_build_object('nome', c.nome),
           'itens',         coalesce((
                              select json_agg(json_build_object(
                                       'descricao', i.descricao,
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

-- anon = quem abre o link sem estar logado. É o cliente dela.
grant execute on function public.ver_orcamento_publico(text) to anon, authenticated;


-- 4. A resposta do cliente.
--
-- Só aceita 'aprovado' ou 'recusado', só uma vez, e não aceita depois
-- da validade. Guarda a data e a hora — é isso que dá valor ao aceite.
create or replace function public.responder_orcamento(p_token text, p_resposta text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orcamentos%rowtype;
begin
  if p_resposta not in ('aprovado', 'recusado') then
    raise exception 'Resposta inválida.';
  end if;

  select * into o from public.orcamentos
   where token_publico = p_token and length(coalesce(p_token, '')) = 16;

  if o.id is null then
    raise exception 'Orçamento não encontrado.';
  end if;

  if o.respondido_em is not null then
    return json_build_object('ja_respondido', true, 'resposta', o.resposta_cliente);
  end if;

  if o.validade is not null and o.validade < current_date then
    raise exception 'Este orçamento venceu em %.', to_char(o.validade, 'DD/MM/YYYY');
  end if;

  update public.orcamentos
     set status           = p_resposta,
         resposta_cliente = p_resposta,
         respondido_em    = now()
   where id = o.id;

  return json_build_object('ok', true, 'resposta', p_resposta);
end;
$$;

grant execute on function public.responder_orcamento(text, text) to anon, authenticated;


-- ------------------------------------------------------------
-- CONFERÊNCIA
--
-- 1) Gere um link para um orçamento seu (troque o id):
--      select public.gerar_link_orcamento('COLE-O-ID-AQUI');
--
-- 2) Veja o que o cliente veria (troque pelo código devolvido acima):
--      select public.ver_orcamento_publico('CODIGO');
--
-- 3) Um código inventado deve devolver vazio, não erro:
--      select public.ver_orcamento_publico('AAAAAAAAAAAAAAAA');
-- ------------------------------------------------------------
