-- ============================================================
-- LOEN SOLUÇÕES — migração 05
-- Dados de empresa no cadastro de cliente
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
--
-- O formulário de cliente tem a seção "Dados da empresa (opcional)"
-- com Nome da empresa, Responsável, CNPJ, Endereço e E-mail.
-- Essas colunas nunca foram criadas na tabela.
--
-- Resultado hoje: quem abre essa seção e preenche NÃO CONSEGUE
-- salvar o cliente. Recebe a mensagem técnica
-- "Could not find the 'cnpj' column of 'clientes'".
--
-- Como a seção fica escondida dentro de "Mais detalhes", o erro
-- passou despercebido até 30/08/2026.
--
-- Estes campos são o que vai alimentar o PDF do orçamento.
--
-- SEGURANÇA: só adiciona colunas novas, todas opcionais.
-- Não apaga, não altera e não move nenhum dado existente.
-- Rodar duas vezes por engano não causa problema.
-- ============================================================

alter table public.clientes
  add column if not exists empresa     text,
  add column if not exists responsavel text,
  add column if not exists cnpj        text,
  add column if not exists endereco    text,
  add column if not exists email       text;

comment on column public.clientes.empresa     is 'Razão social ou nome fantasia. Aparece no PDF do orçamento.';
comment on column public.clientes.responsavel is 'Quem responde pela empresa.';
comment on column public.clientes.cnpj        is 'Guardado como texto, com ou sem máscara.';
comment on column public.clientes.endereco    is 'Endereço de cobrança. Aparece no PDF do orçamento.';
comment on column public.clientes.email       is 'E-mail de contato do cliente.';

-- Busca por empresa, que a aba Clientes já oferece.
create index if not exists clientes_empresa_idx
  on public.clientes (negocio_id, empresa)
  where empresa is not null;

-- ------------------------------------------------------------
-- CONFERÊNCIA — deve devolver 5 linhas
-- ------------------------------------------------------------
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'clientes'
   and column_name in ('empresa','responsavel','cnpj','endereco','email')
 order by column_name;
