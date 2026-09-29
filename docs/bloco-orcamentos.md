# LOEN SOLUÇÕES — Bloco Orçamentos

Escopo recebido do Leandro em 31/08/2026, vindo do chat anterior.
Este documento é a fonte da verdade deste bloco.

## Banco — já existe, não precisa migração

```
orcamentos
  id, negocio_id, cliente_id, atendimento_id, criado_por,
  origem      'rapido' | 'calculadora'
  titulo, descricao, valor, prazo (texto), validade (date),
  status      'rascunho' | 'enviado' | 'pensando' | 'aprovado' | 'recusado' | 'vencido'
  enviado_em, endereco, referencia, criado_em

orcamento_itens
  id, orcamento_id,
  tipo        'material' | 'trabalho' | 'deslocamento' | 'outro' | 'margem'
  descricao, quantidade, valor_unitario, ordem
```

Confirmado em 31/08: as duas tabelas existem e respondem.

## A conta — corrigida de propósito

```
custos = materiais + trabalho + deslocamento + outros
ganho  = custos × (percentual / 100)
total  = custos + ganho
```

Isto é **acréscimo sobre o custo**, não margem. A palavra "margem" não
aparece em lugar nenhum da tela. O rótulo é
**"Quanto quer ganhar acima dos custos?"**.

Abaixo do bloco de percentual, em texto pequeno:
"O valor da diária já paga o seu trabalho. Isto aqui é o ganho do negócio
em cima disso." — evita a pessoa contar a própria mão de obra duas vezes.

R$ 1.600 de custos com 20% dá R$ 1.920.

## Entrega em três etapas

Cada etapa é testável sozinha no navegador.

### Etapa A — a fundação  ✅ ENTREGUE 31/08
Lista com os 7 filtros e contagem · orçamento rápido · detalhe com troca de
status · vencimento automático quando `validade < hoje` · destaque de
"enviado há mais de 3 dias sem resposta".

### Etapa B — a calculadora  ✅ ENTREGUE 31/08
Blocos de materiais, trabalho, deslocamento e outros · percentual de ganho
com o rótulo certo · subtotal ao vivo no rodapé · total editável antes de
gerar · gravação em `orcamento_itens` (inclusive a linha `tipo='margem'`
com o percentual em `quantidade`) · duplicar · transformar em serviço.

### Etapa C — sair do app  ✅ ENTREGUE 31/08
PDF com jsPDF pelo CDN · envio pelo WhatsApp com `navigator.share()` e o
caminho alternativo de baixar + colar · cobrança pelo WhatsApp nos serviços
a receber.

## Limitação real do WhatsApp

`wa.me` **não anexa arquivo**, só leva texto. Ordem obrigatória:

1. Se `navigator.canShare({ files: [pdf] })` existir, usar
   `navigator.share()` com o arquivo — caminho bom, funciona em Android e
   iOS modernos.
2. Se não, baixar o PDF e abrir `wa.me/<numero>?text=<mensagem>`, avisando
   na tela: "O PDF foi baixado. No WhatsApp, toque no clipe e anexe o
   arquivo."

## Critérios de aceite

Testados no navegador contra o banco real em 31/08/2026.

| # | Critério | Estado |
|---|---|---|
| 1 | Calculadora até o PDF em menos de 2 minutos | Etapa C |
| 2 | R$ 1.600 + 20% = R$ 1.920 e a tela nunca diz "margem" | ✅ conferido, inclusive a busca pela palavra na tela |
| 3 | Aprovado vira serviço sem redigitar nada | ✅ orçamento de R$ 2.016 virou serviço agendado |
| 4 | Duplicar traz os itens da calculadora | ✅ os 4 itens vieram junto |
| 5 | PDF abre no celular com a logo | ✅ 1 página, 6 KB, `orcamento-ana-31082026.pdf` |
| 6 | Validade vencida muda de status sozinho | ✅ vira `vencido` ao entrar no app |
| 7 | Enviado há +3 dias sem resposta aparece destacado | ✅ cartão amarelo com botão de WhatsApp |


## Etapa D — aprovação pelo cliente  ✅ ENTREGUE 31/08

Cada orçamento ganha um código sorteado de 16 caracteres. Ela manda o
link junto com a mensagem; o cliente abre no navegador, vê o orçamento
e toca em Aprovar ou Recusar. O status muda sozinho no app dela.

Arquivos: `orcamento.html` e `orcamento-publico.js` — página separada,
sem login e sem menu. Banco: migração 09.

**Isto não é assinatura digital.** É um aceite com data e hora
registradas. Assinatura com valor jurídico exigiria Clicksign, D4Sign
ou ICP-Brasil, que são pagos.

Cuidados tomados:

- O cliente não consulta tabela nenhuma. Tudo passa por duas funções
  do banco, que devolvem só aquele orçamento
- O código vai depois do `#` do endereço, então não entra em log de
  servidor nenhum
- Alfabeto sem 0/O e 1/I/l, que são os que a pessoa confunde ao ditar
- Não aceita resposta depois da validade, nem duas vezes
- Gerar o link duas vezes devolve o mesmo código, para não invalidar
  o que ela já mandou

## Fluxo do link testado de ponta a ponta — 31/08/2026

Criado orçamento, gerado o link, aberto SEM LOGIN (sessão limpa),
aprovado pelo cliente e conferido no app da prestadora. O status virou
aprovado sozinho, com data e hora da resposta gravadas.

Testes de tentativa de burla, todos barrados:

| Tentativa | Resultado |
|---|---|
| Responder duas vezes | devolve ja_respondido, status não muda |
| Resposta inventada (pago) | recusada |
| Código adivinhado | não devolve nada |
| Código curto (força bruta) | não devolve nada |
| Gerar o link de novo | mesmo código, não invalida o que ela mandou |
| Ler qualquer tabela sem login | 42501 em todas |

**Um achado do teste virou a migração 11.** Funções internas
(`listar_atendimentos`, `minha_meta`, `meus_totais`) podiam ser
**chamadas** por quem não tem login — o Postgres concede EXECUTE a
PUBLIC por padrão em toda função nova, e o `grant ... to authenticated`
das migrações anteriores não tirava isso.

Nada vazou, porque todas filtram por `auth.uid()`, que é nulo sem
login. Mas `meus_totais` devolvia `{"a_receber": 0}` em vez de nada:
`null <> 'dono'` não é verdadeiro nem falso em SQL, é NULO, e o CASE
caía no ELSE. A 11 revoga de PUBLIC e corrige a checagem.

## Decisão sobre o PDF — 31/08/2026

A primeira versão listava quantidade, valor unitário e total de cada
item. Num orçamento de R$ 2.016, os itens somavam R$ 1.680 — qualquer
cliente faz essa conta no celular e ou acha que tem erro, ou pede
desconto exatamente da diferença.

**Decisão:** o PDF e a página pública listam o que está incluído
**sem valores por item**. O cliente vê o que vai receber; o preço é o
preço. A conta completa continua guardada em `orcamento_itens` para
ela reabrir e duplicar.

## Fora deste bloco

Assinatura digital com valor jurídico · contrato · envio por e-mail ·
parcelamento · imposto.

A **aprovação pelo cliente por link** estava nesta lista e saiu dela: o
Leandro aprovou em 31/08 e virou a Etapa D.
