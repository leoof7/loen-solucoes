-- ============================================================
-- LOEN SOLUÇÕES — migração 06
-- Hora do atendimento (para a Agenda)
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
--
-- A tabela `atendimentos` guarda `data`, mas não guarda HORA.
-- Sem hora não dá para montar uma agenda de verdade: manicure e
-- cabeleireiro marcam "terça às 14h", não "terça".
--
-- O campo é OPCIONAL de propósito. Quem trabalha por diária
-- (pedreiro, diarista, jardineiro) marca o dia e pronto — a agenda
-- mostra esses atendimentos como "sem horário", no fim do dia.
--
-- SEGURANÇA: só adiciona coluna nova e opcional.
-- Não apaga, não altera e não move nenhum dado existente.
-- Rodar duas vezes por engano não causa problema.
-- ============================================================

alter table public.atendimentos
  add column if not exists hora time;

comment on column public.atendimentos.hora is
  'Hora do atendimento. Opcional: quem trabalha por diária não preenche.';

-- A agenda pergunta sempre "o que tem deste dia em diante, deste negócio".
-- Sem este índice, o banco varre a tabela inteira a cada abertura da tela.
create index if not exists atendimentos_agenda_idx
  on public.atendimentos (negocio_id, data, hora);

-- ------------------------------------------------------------
-- CONFERÊNCIA — deve devolver 1 linha, com data_type = 'time...'
-- ------------------------------------------------------------
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'atendimentos'
   and column_name  = 'hora';
