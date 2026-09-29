// ============================================================
// LOEN SOLUÇÕES — O app depois de entrar
// Abas: Início · Serviços · Orçamentos · Clientes · Financeiro
// ============================================================

const estado = {
  perfil: null,
  negocio: null,
  catalogo: [],
  clientes: [],
  atendimentos: [],
  lancamentos: [],
  retiradas: [],
  clienteAberto: null
};

// Data de HOJE no fuso de quem está usando o app.
//
// Antes isto era toISOString(), que devolve a data em UTC. No Brasil
// (3h atrás), qualquer serviço registrado depois das 21h ia gravado
// com a data do DIA SEGUINTE — e na virada do mês o dinheiro caía no
// mês errado. Testado: às 22h do dia 30, gravava 31.
function dataLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const hoje = () => dataLocal();
const inicioDoMes = () => dataLocal().slice(0, 8) + '01';

// "Setembro de 2026" — a pessoa entende na hora de que periodo
// aquele bloco esta falando.
const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho',
                  'julho','agosto','setembro','outubro','novembro','dezembro'];

function nomeDoMes(d = new Date()) {
  const nome = MESES_PT[d.getMonth()];
  return nome.charAt(0).toUpperCase() + nome.slice(1) + ' de ' + d.getFullYear();
}

function moeda(v) {
  // Quem não é dono recebe o valor como null do banco (migração 08).
  // Mostrar "R$ 0,00" aí seria mentira — é ausência de permissão, não
  // ausência de dinheiro. O traço diz "isto não é para você ver".
  if (v === null || v === undefined) return '—';

  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataCurta(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d + '/' + m + '/' + a.slice(2);
}

function iniciais(nome) {
  return (nome || '?').trim().split(/\s+/).slice(0, 2)
    .map(p => p[0]).join('').toUpperCase();
}


// ------------------------------------------------------------
// Carregar tudo do banco
// ------------------------------------------------------------

// Atendimentos e orçamentos passam pelas funções do banco quando a
// migração 08 já rodou. São elas que decidem se o `valor` sai ou não,
// conforme quem está pedindo — o app não tem como burlar isso.
//
// Enquanto a 08 não rodar, cai no caminho antigo. Assim o app funciona
// nos dois estados e você pode rodar a migração quando quiser, sem
// deixar ninguém na mão no meio do caminho.
// Depois de descobrir que a migração não rodou, para de tentar. Sem
// isto, cada carregamento bate duas vezes numa função que não existe e
// enche o console de 404 — o que atrapalha na hora de achar erro de
// verdade. Volta a tentar quando a página for recarregada.
async function lerAtendimentos() {
  if (estado.temRpcListagem !== false) {
    const rpc = await sb.rpc('listar_atendimentos', { p_limite: 200 });
    if (!rpc.error) {
      estado.temRpcListagem = true;
      estado.podeVerValores = rpc.data?.[0]?.pode_ver_valor ?? true;
      return { data: rpc.data || [] };
    }
    estado.temRpcListagem = false;
  }

  estado.podeVerValores = true;
  return await sb.from('atendimentos')
    .select('*, clientes(nome)').order('data', { ascending: false }).limit(200);
}

async function lerOrcamentos() {
  if (estado.temRpcListagem !== false) {
    const rpc = await sb.rpc('listar_orcamentos', { p_limite: 200 });
    if (!rpc.error) return { data: rpc.data || [] };
  }
  return await sb.from('orcamentos')
    .select('*').order('criado_em', { ascending: false }).limit(200);
}

// Guarda o perfil e o negócio no estado.
function perfilCarregado(perfil) {
  estado.perfil  = perfil;
  estado.negocio = perfil.negocios || {};
}

// A meta vem por função, não pelo select: ela é dado do dono e a
// tabela não deixa mais lê-la direto (migração 12). Para quem não é
// dono, a função devolve nada — e a barra de meta simplesmente não
// aparece, que é o comportamento certo.
async function carregarMinhaMeta() {
  if (estado.perfil?.papel !== 'dono') return;

  const { data, error } = await sb.rpc('minha_meta');
  if (error) {
    // Migração 07 ainda não rodou: cai para a leitura antiga.
    const { data: n } = await sb.from('negocios')
      .select('prolabore_valor, prolabore_dia').eq('id', estado.perfil.negocio_id).maybeSingle();
    if (n) Object.assign(estado.negocio, n);
    return;
  }
  if (data) Object.assign(estado.negocio, data);
}

// Descobre quais migrações já rodaram, perguntando ao banco por cada
// coluna. Pedir uma coluna que não existe devolve erro na hora, sem
// depender de haver dado na tabela.
async function detectarColunas() {
  const temColuna = async (tabela, coluna) => {
    const { error } = await sb.from(tabela).select(coluna).limit(1);
    return !error;
  };

  const [hora, parcelas] = await Promise.all([
    temColuna('atendimentos', 'hora'),
    temColuna('atendimentos', 'parcelas')
  ]);

  estado.temHora     = hora;      // migração 06
  estado.temParcelas = parcelas;  // migração 12
}

async function carregarTudo() {
  const id = await meuId();
  if (!id) return false;

  // O filtro por id é obrigatório: num negócio com equipe esta consulta
  // devolveria também os perfis dos colegas. Ver comentário em app.js.
  // A meta (prolabore_valor / prolabore_dia) NÃO vem neste select, de
  // propósito: ela é do dono, e a partir da migração 12 a tabela nem
  // deixa mais lê-la direto. Quem precisa dela usa minha_meta(), que
  // confere o papel antes de responder.
  const { data: perfil, error: erroPerfil } = await sb
    .from('perfis')
    .select('id, nome, papel, celular, foto_caminho, negocio_id, email_recuperacao, ' +
            'negocios(id, nome, tipo_atividade, tem_equipe, logo_caminho, ' +
            'cnpj, site, instagram, endereco, email)')
    .eq('id', id)
    .maybeSingle();

  if (erroPerfil) {
    // Migração 12 ainda não rodou: as colunas novas não existem.
    // Tenta de novo com o mínimo, para o app não ficar de fora do ar.
    console.warn('Loen Soluções — tentando carregar sem os campos novos:', erroPerfil.message);
    const basico = await sb.from('perfis')
      .select('id, nome, papel, celular, foto_caminho, negocio_id, ' +
              'negocios(id, nome, tipo_atividade, tem_equipe, logo_caminho)')
      .eq('id', id).maybeSingle();
    if (basico.error || !basico.data) {
      console.error('Loen Soluções — perfil:', basico.error || 'sem perfil');
      return false;
    }
    perfilCarregado(basico.data);
  } else {
    if (!perfil) return false;
    perfilCarregado(perfil);
  }

  await carregarMinhaMeta();

  // Daqui para baixo o perfil vem SEMPRE do estado, nunca da variável
  // `perfil` — no caminho de recuperação acima ela fica nula, e usá-la
  // aqui derrubava quem entrava com a migração 12 pendente.
  const ehDono = estado.perfil.papel === 'dono';

  const [cat, cli, ate, orc] = await Promise.all([
    sb.from('servicos_catalogo').select('*').eq('ativo', true).order('nome'),
    sb.from('clientes').select('*').eq('arquivado', false).order('nome'),
    lerAtendimentos(),
    lerOrcamentos()
  ]);

  // Quais colunas novas o banco já tem.
  //
  // Antes isto olhava a PRIMEIRA LINHA de atendimentos — e quem acabou
  // de criar a conta não tem nenhuma. O campo de hora nunca aparecia
  // justamente para quem está começando. Agora pergunta ao banco pela
  // coluna, o que funciona com a tabela vazia.
  await detectarColunas();

  estado.catalogo     = cat.data || [];
  estado.clientes     = cli.data || [];
  estado.atendimentos = ate.data || [];
  estado.orcamentos   = orc.data || [];

  // Dinheiro só o dono enxerga. A regra está no banco; aqui só evitamos pedir.
  //
  // Duas consultas com finalidades diferentes, de propósito:
  //
  //   LISTA  — os últimos 50, com todas as colunas, só para mostrar na tela.
  //   TOTAIS — TODOS os registros, mas só as colunas que entram na conta
  //            e no gráfico de gastos. Sem `categoria`, o gráfico jogava
  //            tudo em "Sem categoria".
  //
  // Antes havia só a lista, limitada a 200, e o saldo era somado em cima
  // dela. A partir do lançamento 201 o saldo passava a mentir: R$ 30.000
  // reais apareciam como R$ 20.000. Somar tem que ver tudo.
  //
  // Trazer só 4 colunas deixa cada linha ~6x menor, então buscar o
  // histórico inteiro custa menos tráfego do que a lista antiga de 200.
  if (ehDono) {
    const [lan, ret, lanTotais, retTotais] = await Promise.all([
      sb.from('lancamentos').select('*').order('data', { ascending: false }).limit(50),
      sb.from('retiradas').select('*').order('data', { ascending: false }).limit(50),
      sb.from('lancamentos').select('tipo, valor, data, natureza, categoria'),
      sb.from('retiradas').select('valor, data')
    ]);
    estado.lancamentos      = lan.data || [];
    estado.retiradas        = ret.data || [];
    estado.lancamentosTotal = lanTotais.data || [];
    estado.retiradasTotal   = retTotais.data || [];
  } else {
    estado.lancamentos = estado.retiradas = [];
    estado.lancamentosTotal = estado.retiradasTotal = [];
  }

  return true;
}


// ------------------------------------------------------------
// Contas do mês
// ------------------------------------------------------------

// Todas as contas de dinheiro saem daqui, e todas usam os totais
// completos — nunca a lista que está na tela.
//
// REGRA DO CAIXA (decidida em 30/08/2026, ADR-004):
// tudo que sai, sai do saldo. Saída do negócio, saída pessoal e retirada
// baixam o caixa igual, porque no mundo real o dinheiro saiu da carteira
// dela nos três casos. O rótulo "pessoal" existe só para ela ver na lista.
//
// Antes, saída pessoal não baixava nada e o app mostrava mais dinheiro
// do que existia de verdade na carteira.
function resumo() {
  const de = inicioDoMes();
  const soma = (lista) => lista.reduce((s, x) => s + Number(x.valor || 0), 0);

  const lancamentos = estado.lancamentosTotal || [];
  const retiradas   = estado.retiradasTotal   || [];

  const entradas = lancamentos.filter(l => l.tipo === 'entrada');
  const saidas   = lancamentos.filter(l => l.tipo === 'despesa');
  const doMes    = (x) => x.data >= de;

  const entradasMes = soma(entradas.filter(doMes));
  const despesasMes = soma(saidas.filter(doMes));
  const retiradoMes = soma(retiradas.filter(doMes));

  // Só informativo: quanto das saídas do mês ela marcou como pessoal.
  // Não muda conta nenhuma — já está dentro de despesasMes.
  const gastosPessoaisMes = soma(saidas.filter(l => l.natureza === 'pessoal' && doMes(l)));

  const aReceber = estado.atendimentos
    .filter(a => a.situacao === 'realizado' || a.situacao === 'pendente')
    .reduce((s, a) => s + Number(a.valor), 0);

  const proximos = estado.atendimentos
    .filter(a => a.situacao === 'agendado' && a.data >= hoje())
    .sort((a, b) => a.data.localeCompare(b.data));

  return {
    entradasMes, despesasMes, retiradoMes, aReceber, proximos, gastosPessoaisMes,
    // Saída pessoal e retirada contam igual na meta: não importa por qual
    // caminho ela registrou, o dinheiro foi para ela do mesmo jeito.
    tiradoParaSiMes: retiradoMes + gastosPessoaisMes,
    // O que sobrou olhando só este mês. E o que sobra tem que bater com
    // as linhas que aparecem na tela — por isso sai daqui, e não de uma
    // conta feita na hora de desenhar.
    sobrouNoMes: entradasMes - despesasMes - retiradoMes,
    saldo: soma(entradas) - soma(saidas) - soma(retiradas),
    meta: Number(estado.negocio?.prolabore_valor || 0)
  };
}


// ------------------------------------------------------------
// Navegação entre abas
// ------------------------------------------------------------

function abrirAba(nome) {
  $$('.aba').forEach(a => a.classList.toggle('ativa', a.id === 'aba-' + nome));
  $$('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
  $('.cabecalho').classList.toggle('no-inicio', nome === 'inicio');
  $('#titulo-aba').textContent = {
    inicio: 'Início', agenda: 'Agenda', servicos: 'Serviços', orcamentos: 'Orçamentos',
    clientes: 'Clientes', financeiro: 'Financeiro'
  }[nome];
  window.scrollTo(0, 0);
  desenhar();
}

$$('.abas button').forEach(b => {
  b.addEventListener('click', () => abrirAba(b.dataset.aba));
});


// ------------------------------------------------------------
// Folhas (janelas que sobem de baixo)
// ------------------------------------------------------------

function abrirFolha(id) { $('#' + id).classList.add('aberta'); }
function fecharFolha(id) { $('#' + id).classList.remove('aberta'); }

$$('[data-fecha]').forEach(b => {
  b.addEventListener('click', () => fecharFolha(b.dataset.fecha));
});

$$('.folha').forEach(f => {
  // Folha travada (data-travada) não fecha tocando fora: é o caso do
  // e-mail obrigatório para quem ainda não tem.
  f.addEventListener('click', (e) => { if (e.target === f && !f.dataset.travada) f.classList.remove('aberta'); });
});


// ------------------------------------------------------------
// Desenhar as telas
// ------------------------------------------------------------

function desenhar() {
  desenharCabecalho();
  desenharInicio();
  desenharAgenda();
  desenharServicos();
  desenharClientes();
  desenharFinanceiro();
  desenharOrcamentos();
}

function desenharCabecalho() {
  const av = $('#avatar');
  av.textContent = iniciais(estado.perfil?.nome);
  if (estado.urlImagem) av.innerHTML = '<img src="' + estado.urlImagem + '" alt="">';
}

// ---------- INÍCIO ----------

function desenharInicio() {
  const r = resumo();
  const ehDono = estado.perfil.papel === 'dono';
  const primeiroNome = (estado.perfil.nome || '').trim().split(/\s+/)[0];
  let h = '<div class="saudacao"><p class="ola">Olá' + (primeiroNome ? ', ' + escapar(primeiroNome) : '') +
          ' 👋</p><p class="rotulo">Seu mês até agora</p></div>';

  // Tutorial: some sozinho quando as três tarefas estiverem feitas
  const tem = {
    servicos: estado.catalogo.length > 0,
    cliente:  estado.clientes.length > 0,
    servico:  estado.atendimentos.length > 0
  };

  if (!(tem.servicos && tem.cliente && tem.servico)) {
    h += '<div class="cartao"><p class="rotulo">Primeiros passos</p>' +
         '<ul class="passos">' +
         passo(tem.servicos, 'Cadastre seus serviços e preços', 'ir-catalogo') +
         passo(tem.cliente,  'Cadastre seu primeiro cliente',   'ir-cliente') +
         passo(tem.servico,  'Registre um serviço feito',       'ir-servico') +
         '</ul></div>';
  }

  // Serviços marcados para hoje, na ordem da hora.
  const deHoje = agendados().filter(a => a.data === hoje());
  // Orçamentos que foram para o cliente e ainda não voltaram.
  const aguardando = (estado.orcamentos || [])
    .filter(o => o.status === 'enviado' || o.status === 'pensando').length;

  if (ehDono) {
    h += '<div class="dupla">' +
         '<button class="cartao cor-lima" data-ir-aba="financeiro"><p class="rotulo">Entrou</p>' +
         '<p class="valor">' + moeda(r.entradasMes) + '</p></button>' +
         '<button class="cartao cor-lilas" data-ir-aba="financeiro"><p class="rotulo">Saiu</p>' +
         '<p class="valor">' + moeda(r.despesasMes) + '</p></button></div>';
  }

  h += '<div class="cartao hoje"><p class="rotulo-forte">Hoje</p>' +
       (deHoje.length
         ? deHoje.map(a =>
             '<button class="linha-hoje" data-atendimento="' + a.id + '">' +
             '<span>' + (a.hora ? a.hora.slice(0, 5) + ' · ' : '') +
             escapar(a.clientes?.nome || 'Sem cliente') + '</span>' +
             '<span>' + escapar(a.servico_nome || '') + '</span></button>').join('')
         : '<p class="rotulo" style="margin:0">Nada marcado para hoje.</p>') +
       '<button class="btn-texto" data-ir-aba="agenda" style="text-align:left;padding:10px 0 0;width:auto">Ver a agenda</button>' +
       '</div>';

  h += '<button class="cartao cor-ceu" data-ir-aba="orcamentos">' +
       '<p class="rotulo">Orçamentos aguardando resposta</p>' +
       '<p class="valor">' + aguardando + '</p></button>';

  if (ehDono) {
    // A meta mede o que ENTROU no mês (decidido em 29/09/2026 — antes
    // media só as retiradas, e ninguém entendia a barra parada). Ver
    // ADR-012 no escopo.
    if (r.meta > 0) {
      const pct = Math.min(100, (r.entradasMes / r.meta) * 100);
      const chegou = r.entradasMes >= r.meta;
      h += '<button class="cartao" data-ir-aba="financeiro">' +
           '<p class="rotulo">Sua meta do mês</p>' +
           '<p class="valor">' + moeda(r.entradasMes) + ' <span style="font-size:17px;color:#4A4A4A">de ' + moeda(r.meta) + '</span></p>' +
           '<div class="barra"><i style="width:' + pct + '%"></i></div>' +
           (chegou ? '<p class="rotulo" style="margin-top:8px">Você chegou na meta deste mês.</p>' : '') +
           '</button>';
    } else {
      h += '<button class="cartao" data-ir-aba="financeiro">' +
           '<p class="rotulo">Sua meta do mês</p>' +
           '<p class="valor" style="font-size:19px">Definir quanto quero receber</p></button>';
    }

    h += '<div class="cartao destaque"><p class="rotulo">Saldo do negócio</p>' +
         '<p class="valor">' + moeda(r.saldo) + '</p></div>';
  }

  const qtdReceber = estado.atendimentos
    .filter(a => a.situacao === 'realizado' || a.situacao === 'pendente').length;

  // Quem não pode ver valores vê a CONTAGEM, não o dinheiro. Saber que
  // tem 3 serviços em aberto ajuda a trabalhar; saber quanto o negócio
  // tem a receber é do dono.
  h += '<button class="cartao" data-ir-aba="servicos"><p class="rotulo">A receber</p>' +
       (estado.podeVerValores === false
         ? '<p class="valor laranj">' + qtdReceber + '</p>' +
           '<p class="rotulo" style="margin:6px 0 0">serviço(s) sem pagamento</p>'
         : '<p class="valor laranj">' + moeda(r.aReceber) + '</p>' +
           '<p class="rotulo" style="margin:6px 0 0">' + qtdReceber + ' serviço(s) sem pagamento</p>') +
       '</button>';

  $('#aba-inicio').innerHTML = h;

  $$('#aba-inicio [data-ir-aba]').forEach(b =>
    b.addEventListener('click', () => abrirAba(b.getAttribute('data-ir-aba'))));
  ligarListas('#aba-inicio');

  // Guarda que a pessoa veio do tutorial. Ao terminar de preencher, o app
  // devolve ela para o Inicio, onde o passo aparece marcado — em vez de
  // largar ela numa aba qualquer sem sinal de que avancou.
  const atalhos = {
    'ir-catalogo': () => { estado.veioDoTutorial = true; abrirCatalogo(); },
    'ir-cliente':  () => { estado.veioDoTutorial = true; abrirFormCliente(); },
    'ir-servico':  () => { estado.veioDoTutorial = true; abrirFormServico(); }
  };
  Object.keys(atalhos).forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('click', atalhos[id]);
  });
}

// Devolve true (e zera a marca) se a pessoa tinha vindo do tutorial.
function voltarDoTutorial() {
  const veio = !!estado.veioDoTutorial;
  estado.veioDoTutorial = false;
  return veio;
}

function passo(feito, texto, id) {
  return '<li class="' + (feito ? 'feito' : '') + '">' +
         '<div class="bolinha">' + (feito ? '✓' : '') + '</div>' +
         (feito ? '<span>' + texto + '</span>'
                : '<button id="' + id + '" type="button">' + texto + '</button>') +
         '</li>';
}

// ---------- SERVIÇOS ----------

function linhaAtendimento(a) {
  const et = a.situacao === 'pago' ? 'et-pago'
           : a.situacao === 'agendado' ? 'et-agendado' : 'et-pendente';
  const rotulo = { pago: 'Pago', agendado: 'Agendado',
                   realizado: 'A receber', pendente: 'A receber' }[a.situacao];
  return '<button class="item" data-atendimento="' + a.id + '"><div class="corpo">' +
         '<span class="titulo">' + escapar(a.clientes?.nome || 'Sem cliente') + '</span>' +
         '<span class="sub">' + escapar(a.servico_nome) + ' · ' + dataCurta(a.data) + '</span>' +
         '<span class="etiqueta ' + et + '">' + rotulo + '</span>' +
         '</div><div class="direita">' + moeda(a.valor) + '</div></button>';
}

// Guarda o que a pessoa escolheu no filtro entre um desenho e outro.
estado.filtroServicos = 'todos';

function desenharServicos() {
  if (!estado.atendimentos.length) {
    $('#aba-servicos').innerHTML =
      '<div class="vazio"><strong>Nenhum serviço registrado</strong>' +
      'Toque no botão + para registrar o primeiro.</div>';
    return;
  }

  const busca = ($('#busca-servico')?.value || '').toLowerCase();
  const f = estado.filtroServicos;

  const lista = estado.atendimentos.filter(a => {
    const casaFiltro =
      f === 'todos'    ? true
    : f === 'receber'  ? (a.situacao === 'realizado' || a.situacao === 'pendente')
    : f === 'agendado' ? a.situacao === 'agendado'
    : a.situacao === f;

    if (!casaFiltro) return false;
    if (!busca) return true;
    return (a.clientes?.nome || '').toLowerCase().includes(busca)
        || (a.servico_nome || '').toLowerCase().includes(busca);
  });

  const conta = (cond) => estado.atendimentos.filter(cond).length;
  const abas = [
    ['todos',    'Todos',     estado.atendimentos.length],
    ['receber',  'A receber', conta(a => a.situacao === 'realizado' || a.situacao === 'pendente')],
    ['agendado', 'Agendados', conta(a => a.situacao === 'agendado')],
    ['pago',     'Pagos',     conta(a => a.situacao === 'pago')]
  ];

  let h = '<div class="campo"><input id="busca-servico" type="search" ' +
          'placeholder="Buscar por cliente ou serviço" value="' + escapar(busca) + '"></div>';

  h += '<div class="pastilhas rolante" id="filtro-servicos">' +
       abas.map(([v, rot, n]) =>
         '<button type="button" data-valor="' + v + '"' + (v === f ? ' class="marcada"' : '') + '>' +
         rot + ' <span class="conta">' + n + '</span></button>').join('') +
       '</div>';

  h += lista.length
     ? lista.map(linhaAtendimento).join('')
     : '<div class="vazio"><strong>Nada aqui</strong>Nenhum serviço com esse filtro.</div>';

  $('#aba-servicos').innerHTML = h;
  ligarListas('#aba-servicos');

  $$('#filtro-servicos button').forEach(b =>
    b.addEventListener('click', () => { estado.filtroServicos = b.dataset.valor; desenharServicos(); }));

  const campo = $('#busca-servico');
  campo.addEventListener('input', () => {
    const v = campo.value, pos = campo.selectionStart;
    desenharServicos();
    const novo = $('#busca-servico');
    novo.value = v; novo.focus(); novo.setSelectionRange(pos, pos);
  });
}


// ---------- AGENDA ----------
//
// A agenda não é dado novo: um serviço com situação "agendado" e data
// no futuro JÁ é um agendamento. Aqui só damos a ele uma tela decente.
//
// Dois modos, porque servem a gente diferente:
//   LISTA — o dia a dia de quem quer saber "o que tenho pela frente".
//   MÊS   — a visão geral de quem quer achar um buraco na semana que vem.

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

// Lê 'AAAA-MM-DD' como data local. Passar a string direta para new Date()
// faz o navegador entender como UTC e voltar um dia no Brasil.
function dataDe(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

function tituloDoDia(iso) {
  const diff = Math.round((dataDe(iso) - dataDe(hoje())) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  const d = dataDe(iso);
  return DIAS_CURTOS[d.getDay()] + ' · ' + dataCurta(iso);
}

function agendados() {
  return estado.atendimentos
    .filter(a => a.situacao === 'agendado')
    .sort((a, b) => (a.data + (a.hora || '99:99')).localeCompare(b.data + (b.hora || '99:99')));
}

function linhaAgenda(a) {
  const hora = a.hora ? a.hora.slice(0, 5) : '—';
  return '<button class="item linha-agenda" data-atendimento="' + a.id + '">' +
         '<div class="hora">' + hora + '</div>' +
         '<div class="corpo">' +
         '<span class="titulo">' + escapar(a.clientes?.nome || 'Sem cliente') + '</span>' +
         '<span class="sub">' + escapar(a.servico_nome || '') + '</span>' +
         '</div><div class="direita">' + moeda(a.valor) + '</div></button>';
}

function montarAgenda() {
  return '<div class="troca-modo" id="modo-agenda">' +
         '<button type="button" data-modo="lista"' +
           (estado.modoAgenda === 'mes' ? '' : ' class="marcada"') + '>Lista</button>' +
         '<button type="button" data-modo="mes"' +
           (estado.modoAgenda === 'mes' ? ' class="marcada"' : '') + '>Mês</button>' +
         '</div>' +
         (estado.modoAgenda === 'mes' ? agendaDoMes() : agendaEmLista());
}

function agendaEmLista() {
  const proximos = agendados().filter(a => a.data >= hoje());
  if (!proximos.length) {
    return '<div class="vazio"><strong>Nada marcado</strong>' +
           'Toque em "Agendar um serviço" e ele aparece aqui, no dia marcado.</div>';
  }

  const porDia = {};
  proximos.forEach(a => { (porDia[a.data] = porDia[a.data] || []).push(a); });

  return Object.keys(porDia).sort().map(dia => {
    const doDia = porDia[dia];
    const total = doDia.reduce((s, a) => s + Number(a.valor || 0), 0);
    return '<div class="dia-agenda">' +
           '<span>' + tituloDoDia(dia) + '</span>' +
           '<span class="total">' + doDia.length + ' · ' + moeda(total) + '</span>' +
           '</div>' + doDia.map(linhaAgenda).join('');
  }).join('');
}

function agendaDoMes() {
  const base = estado.mesAgenda ? dataDe(estado.mesAgenda + '-01') : dataDe(hoje());
  const ano = base.getFullYear(), mes = base.getMonth();

  const noMes = {};
  agendados().forEach(a => {
    const d = dataDe(a.data);
    if (d.getFullYear() === ano && d.getMonth() === mes) {
      (noMes[a.data] = noMes[a.data] || []).push(a);
    }
  });

  const primeiro = new Date(ano, mes, 1).getDay();
  const dias = new Date(ano, mes + 1, 0).getDate();
  const p = (n) => String(n).padStart(2, '0');

  let grade = DIAS_CURTOS.map(d => '<div class="cabeca">' + d + '</div>').join('');
  for (let i = 0; i < primeiro; i++) grade += '<div></div>';

  for (let dia = 1; dia <= dias; dia++) {
    const iso = ano + '-' + p(mes + 1) + '-' + p(dia);
    const qtd = (noMes[iso] || []).length;
    grade += '<button type="button" class="dia' +
             (iso === hoje() ? ' e-hoje' : '') +
             (iso === estado.diaAgenda ? ' escolhido' : '') +
             (qtd ? ' tem' : '') + '" data-dia="' + iso + '">' +
             dia + (qtd ? '<i>' + (qtd > 3 ? 3 : qtd) + '</i>' : '') + '</button>';
  }

  let h = '<div class="mes-topo">' +
          '<button type="button" id="mes-antes" aria-label="Mês anterior">‹</button>' +
          '<strong>' + MESES[mes][0].toUpperCase() + MESES[mes].slice(1) + ' de ' + ano + '</strong>' +
          '<button type="button" id="mes-depois" aria-label="Próximo mês">›</button></div>' +
          '<div class="calendario">' + grade + '</div>';

  const escolhido = estado.diaAgenda && noMes[estado.diaAgenda];
  if (estado.diaAgenda) {
    h += '<div class="dia-agenda"><span>' + tituloDoDia(estado.diaAgenda) + '</span></div>';
    h += escolhido
       ? escolhido.map(linhaAgenda).join('')
       : '<div class="vazio">Nada marcado neste dia.</div>';
  } else if (!Object.keys(noMes).length) {
    h += '<div class="vazio">Nenhum serviço marcado neste mês.</div>';
  }
  return h;
}

// Aba própria desde 29/09/2026 (antes era um modo dentro de Serviços,
// e ninguém achava). Pedido do Leandro.
function desenharAgenda() {
  $('#aba-agenda').innerHTML =
    '<button class="btn btn-principal" id="agenda-novo" type="button" style="margin:0 0 18px">' +
    'Agendar um serviço</button>' + montarAgenda();
  ligarListas('#aba-agenda');
  ligarAgenda();
  $('#agenda-novo').addEventListener('click', () => abrirFormServico('agendado'));
}

function ligarAgenda() {
  $$('#modo-agenda button').forEach(b =>
    b.addEventListener('click', () => {
      estado.modoAgenda = b.dataset.modo;
      estado.diaAgenda = null;
      desenharAgenda();
    }));

  const mover = (passo) => {
    const base = estado.mesAgenda ? dataDe(estado.mesAgenda + '-01') : dataDe(hoje());
    base.setMonth(base.getMonth() + passo);
    estado.mesAgenda = base.getFullYear() + '-' + String(base.getMonth() + 1).padStart(2, '0');
    estado.diaAgenda = null;
    desenharAgenda();
  };
  $('#mes-antes')?.addEventListener('click', () => mover(-1));
  $('#mes-depois')?.addEventListener('click', () => mover(1));

  $$('.calendario .dia').forEach(b =>
    b.addEventListener('click', () => {
      estado.diaAgenda = estado.diaAgenda === b.dataset.dia ? null : b.dataset.dia;
      desenharAgenda();
    }));
}

// ---------- CLIENTES ----------

function desenharClientes() {
  const busca = ($('#busca-cliente')?.value || '').toLowerCase();
  const lista = estado.clientes.filter(c =>
    !busca
    || c.nome.toLowerCase().includes(busca)
    || (c.empresa || '').toLowerCase().includes(busca)
    || (c.telefone || '').includes(busca));

  let h = '<div class="campo"><input id="busca-cliente" type="search" ' +
          'placeholder="Buscar por nome, empresa ou telefone" value="' + escapar(busca) + '"></div>';

  if (!estado.clientes.length) {
    h += '<div class="vazio"><strong>Nenhum cliente ainda</strong>' +
         'Toque no botão + para cadastrar o primeiro.</div>';
  } else if (!lista.length) {
    h += '<div class="vazio"><strong>Ninguém encontrado</strong>Tente outro nome.</div>';
  } else {
    lista.forEach(c => {
      const ats = estado.atendimentos.filter(a => a.cliente_id === c.id);
      h += '<button class="item" data-cliente="' + c.id + '"><div class="corpo">' +
           '<span class="titulo">' + escapar(c.nome) + '</span>' +
           '<span class="sub">' + (c.empresa ? escapar(c.empresa) + ' · ' : '') +
           (ats.length ? ats.length + ' atendimento(s)' : 'Sem atendimentos') + '</span>' +
           '</div><div class="direita">›</div></button>';
    });
  }

  $('#aba-clientes').innerHTML = h;

  ligarListas('#aba-clientes');

  const campo = $('#busca-cliente');
  campo.addEventListener('input', () => {
    const v = campo.value; desenharClientes();
    const novo = $('#busca-cliente'); novo.value = v; novo.focus();
  });
}

// ---------- FINANCEIRO ----------

function desenharFinanceiro() {
  if (estado.perfil.papel !== 'dono') {
    $('#aba-financeiro').innerHTML =
      '<div class="vazio"><strong>Área do dono</strong>' +
      'O financeiro do negócio não fica visível para a equipe.</div>';
    return;
  }

  const r = resumo();
  let h = '<div class="dupla">' +
    '<button class="cartao" id="btn-entrada" style="background:#E6F2EC;border-color:#BFDDCE">' +
    '<p class="valor verde" style="font-size:19px">Entrada</p>' +
    '<p class="rotulo" style="margin:4px 0 0">Registrar dinheiro que entrou</p></button>' +
    '<button class="cartao" id="btn-saida" style="background:#FBE9E6;border-color:#EFC6BF">' +
    '<p class="valor verm" style="font-size:19px">Saída</p>' +
    '<p class="rotulo" style="margin:4px 0 0">Registrar dinheiro que saiu</p></button></div>';

  // O RESUMO DO MÊS FECHA EM SI MESMO.
  //
  // Antes, este bloco misturava duas bases: as linhas eram do mês e o
  // "Saldo do negócio" era o acumulado de todos os tempos. Quem tinha
  // uma saída no mês passado via "entradas 1.000, saídas 0, saldo 820"
  // e não conseguia fechar a conta de cabeça. Num app de dinheiro isso
  // derruba a confiança na tela inteira.
  //
  // Agora: o mês soma o mês, e o saldo acumulado fica separado, com o
  // rótulo dizendo o que é.
  h += '<p class="secao-titulo">' + escapar(nomeDoMes()) + '</p>';
  h += resumoLinha('Dinheiro que entrou', r.entradasMes, 'verde');
  h += resumoLinha('Dinheiro que saiu', r.despesasMes, 'verm');
  if (r.gastosPessoaisMes > 0) {
    h += resumoLinha('&nbsp;&nbsp;— disso, marcado como pessoal', r.gastosPessoaisMes, 'discreto');
  }
  h += resumoLinha('Você tirou para si', r.tiradoParaSiMes, '');
  h += resumoLinha('<strong>Sobrou este mês</strong>', r.sobrouNoMes,
                   r.sobrouNoMes < 0 ? 'verm' : 'verde');

  if (r.sobrouNoMes < 0) {
    h += '<p class="rotulo" style="margin:8px 2px 0">Neste mês saiu mais do que entrou. ' +
         'A diferença veio do que você já tinha guardado.</p>';
  }

  h += '<p class="secao-titulo">Saldo do negócio</p>';
  h += '<div class="cartao"><p class="rotulo">Tudo que entrou menos tudo que saiu, ' +
       'desde o começo</p><p class="valor ' + (r.saldo < 0 ? 'verm' : 'verde') + '">' +
       moeda(r.saldo) + '</p>';

  // Explica a diferença em vez de deixar a pessoa procurando.
  const deMesesAnteriores = r.saldo - r.sobrouNoMes;
  if (Math.abs(deMesesAnteriores) >= 0.01) {
    h += '<p class="rotulo" style="margin:8px 0 0">' +
         moeda(Math.abs(deMesesAnteriores)) +
         (deMesesAnteriores > 0 ? ' vieram de meses anteriores.' : ' saíram em meses anteriores.') +
         '</p>';
  }
  h += '</div>';

  if (r.aReceber > 0) {
    h += '<div class="cartao"><p class="rotulo">A receber</p>' +
         '<p class="valor laranj">' + moeda(r.aReceber) + '</p>' +
         '<p class="rotulo" style="margin:8px 0 0">Se todos pagarem, o saldo vira ' +
         moeda(r.saldo + r.aReceber) + '. Até lá, esse dinheiro ainda não é seu.</p></div>';
  }

  h += '<button class="btn btn-secundario" id="btn-grafico">Ver para onde vai o dinheiro</button>';

  h += '<p class="secao-titulo">Sua meta mensal</p>';
  h += '<button class="cartao" id="btn-meta">' +
       '<p class="rotulo">Quanto você quer receber por mês</p>' +
       '<p class="valor">' + (r.meta > 0 ? moeda(r.meta) : 'Não definido') + '</p>' +
       '<p class="rotulo" style="margin:8px 0 0">Toque para ' + (r.meta > 0 ? 'alterar' : 'definir') + '</p></button>';

  if (r.meta > 0) {
    h += '<button class="btn btn-secundario" id="btn-retirada">Registrar retirada</button>';
  }

  const ultimos = estado.lancamentos.slice(0, 15);
  if (ultimos.length) {
    h += '<p class="secao-titulo">Últimos lançamentos</p>';
    ultimos.forEach(l => {
      const ent = l.tipo === 'entrada';
      h += '<div class="item"><div class="corpo">' +
           '<span class="titulo">' + escapar(l.categoria || (ent ? 'Entrada' : 'Saída')) + '</span>' +
           '<span class="sub">' + dataCurta(l.data) +
           (l.natureza ? ' · ' + (l.natureza === 'negocio' ? 'do negócio' : 'pessoal') : '') +
           '</span></div><div class="direita ' + (ent ? 'verde' : 'verm') + '">' +
           (ent ? '+' : '−') + ' ' + moeda(l.valor) + '</div></div>';
    });
  }

  $('#aba-financeiro').innerHTML = h;

  $('#btn-entrada').addEventListener('click', () => abrirFormLancamento('entrada'));
  $('#btn-saida').addEventListener('click',   () => abrirFormLancamento('despesa'));
  $('#btn-meta').addEventListener('click',    abrirMeta);
  $('#btn-grafico').addEventListener('click', abrirGraficoDeGastos);
  const br = $('#btn-retirada');
  if (br) br.addEventListener('click', abrirRetirada);
}

function resumoLinha(rotulo, valor, cor) {
  return '<div class="item"><div class="corpo"><span class="titulo">' + rotulo + '</span></div>' +
         '<div class="direita ' + cor + '">' + moeda(valor) + '</div></div>';
}

// ------------------------------------------------------------
// Perguntar antes de fazer
//
// Substitui confirm() e alert() do navegador, que no celular abrem
// uma caixa cinza com o endereço do site em cima — feia e assustadora
// para quem não entende o que é.
//
// A única exceção continua sendo apagar a conta: ali a caixa feia
// ajuda, porque assusta mesmo.
// ------------------------------------------------------------

function confirmar(titulo, textoHtml, rotuloSim = 'Confirmar', perigo = false) {
  return new Promise(resolve => {
    if (typeof limparGradeStatus === 'function') limparGradeStatus();
    $('#pg-titulo').textContent = titulo;
    $('#pg-texto').innerHTML = textoHtml || '';

    const sim = $('#pg-sim');
    const nao = $('#pg-nao');
    $('#pg-nao').style.display = '';
    $('#pg-extra').style.display = 'none';
    sim.textContent = rotuloSim;
    sim.className = 'btn ' + (perigo ? 'btn-perigo' : 'btn-principal');
    nao.textContent = 'Cancelar';

    // Recria os botões para não empilhar cliques de perguntas anteriores.
    const novoSim = sim.cloneNode(true);
    const novoNao = nao.cloneNode(true);
    sim.replaceWith(novoSim);
    nao.replaceWith(novoNao);

    const fechar = (resposta) => { fecharFolha('folha-pergunta'); resolve(resposta); };
    novoSim.addEventListener('click', () => fechar(true));
    novoNao.addEventListener('click', () => fechar(false));

    abrirFolha('folha-pergunta');
  });
}

// Só avisa. Um botão, sem escolha.
//
// O terceiro argumento é opcional: quando vem, aparece um segundo
// botão que faz alguma coisa. É o que transforma "fale com a equipe"
// de instrução em caminho — a pessoa não precisa achar a tela sozinha.
function avisarNaFolha(titulo, textoHtml, acao) {
  if (typeof limparGradeStatus === 'function') limparGradeStatus();
  $('#pg-titulo').textContent = titulo;
  $('#pg-texto').innerHTML = textoHtml || '';

  const sim = $('#pg-sim');
  const novoSim = sim.cloneNode(true);
  novoSim.textContent = 'Entendi';
  novoSim.className = 'btn btn-principal';
  sim.replaceWith(novoSim);
  novoSim.addEventListener('click', () => fecharFolha('folha-pergunta'));

  // Num aviso não existe o que cancelar: só há um caminho.
  $('#pg-nao').style.display = 'none';

  const extra = $('#pg-extra');
  const novoExtra = extra.cloneNode(true);
  extra.replaceWith(novoExtra);

  if (acao) {
    novoExtra.textContent = acao.rotulo;
    novoExtra.style.display = 'flex';
    novoExtra.addEventListener('click', () => {
      fecharFolha('folha-pergunta');
      acao.fazer();
    });
  } else {
    novoExtra.style.display = 'none';
  }

  abrirFolha('folha-pergunta');
}

function escapar(t) {
  return String(t ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}


// ------------------------------------------------------------
// Botão + Novo
// ------------------------------------------------------------

$('#fab').addEventListener('click', () => abrirFolha('folha-novo'));

$('#novo-agendamento').addEventListener('click', () => { fecharFolha('folha-novo'); abrirFormServico('agendado'); });
$('#novo-servico').addEventListener('click',  () => { fecharFolha('folha-novo'); abrirFormServico(); });
$('#novo-cliente').addEventListener('click',  () => { fecharFolha('folha-novo'); abrirFormCliente(); });
$('#nova-entrada').addEventListener('click',  () => { fecharFolha('folha-novo'); abrirFormLancamento('entrada'); });
$('#nova-saida').addEventListener('click',    () => { fecharFolha('folha-novo'); abrirFormLancamento('despesa'); });


// ------------------------------------------------------------
// Formulário: cliente
// ------------------------------------------------------------

const CAMPOS_CLIENTE = ['cl-nome','cl-telefone','cl-obs','cl-empresa',
                        'cl-responsavel','cl-cnpj','cl-endereco','cl-email'];

// A mesma folha serve para cadastrar e para editar. Passar um cliente
// abre em modo edição.
//
// Editar não é luxo: telefone errado quebra o WhatsApp, que é o canal
// principal do app. Antes, um dígito trocado ficava errado para sempre.
function abrirFormCliente(cliente) {
  estado.clienteEditando = cliente || null;

  CAMPOS_CLIENTE.forEach(id => { $('#' + id).value = ''; });

  if (cliente) {
    $('#cl-nome').value        = cliente.nome || '';
    $('#cl-telefone').value    = cliente.telefone || '';
    $('#cl-obs').value         = cliente.observacao || '';
    $('#cl-empresa').value     = cliente.empresa || '';
    $('#cl-responsavel').value = cliente.responsavel || '';
    $('#cl-cnpj').value        = cliente.cnpj || '';
    $('#cl-endereco').value    = cliente.endereco || '';
    $('#cl-email').value       = cliente.email || '';
  }

  $('#titulo-cliente').textContent = cliente ? 'Editar cliente' : 'Novo cliente';
  $('#btn-salvar-cliente').textContent = cliente ? 'Salvar alterações' : 'Salvar cliente';
  $('#btn-arquivar-cliente').style.display = cliente ? 'flex' : 'none';

  limparAviso('aviso-cliente');
  limparAviso('aviso-duplicado');
  abrirFolha('folha-cliente');
  if (!cliente) setTimeout(() => $('#cl-nome').focus(), 200);
}

// Compara nomes ignorando acento, maiúscula e espaço sobrando.
// "José da Silva", "jose da silva" e "JOSE DA  SILVA" viram a mesma coisa.
function nomeSimplificado(nome) {
  return (nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Procura alguém já cadastrado com o mesmo nome ou o mesmo telefone.
// Devolve também o motivo, para o aviso dizer a verdade.
function clienteParecido(nome, telefone, ignorarId) {
  const n = nomeSimplificado(nome);
  const t = (telefone || '').replace(/\D/g, '');

  for (const c of estado.clientes) {
    if (c.id === ignorarId) continue;
    if (t.length >= 10 && (c.telefone || '').replace(/\D/g, '') === t) {
      return { cliente: c, motivo: 'telefone' };
    }
    if (n && nomeSimplificado(c.nome) === n) {
      return { cliente: c, motivo: 'nome' };
    }
  }
  return null;
}

$('#form-cliente').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nome = $('#cl-nome').value.trim();
  const telefone = $('#cl-telefone').value.trim();
  const editando = estado.clienteEditando;

  // Avisa antes de criar um cliente repetido. Não bloqueia — pode haver
  // duas Marias de verdade —, mas obriga a olhar. Cliente duplicado racha
  // o histórico em dois e ninguém percebe depois.
  const parecido = clienteParecido(nome, telefone, editando?.id);
  if (parecido && !estado.duplicadoConfirmado) {
    estado.duplicadoConfirmado = true;
    return aviso('aviso-duplicado',
      'Você já tem ' + escapar(parecido.cliente.nome) + ' cadastrado com ' +
      (parecido.motivo === 'telefone' ? 'este telefone' : 'este mesmo nome') +
      '. Se for outra pessoa, toque em salvar de novo.', 'erro');
  }

  const botao = $('#btn-salvar-cliente');
  ocupado(botao, true, 'Salvando…');

  const vazio = (id) => $('#' + id).value.trim() || null;

  const dados = {
    nome:        nome,
    telefone:    vazio('cl-telefone'),
    observacao:  vazio('cl-obs'),
    empresa:     vazio('cl-empresa'),
    responsavel: vazio('cl-responsavel'),
    cnpj:        vazio('cl-cnpj'),
    endereco:    vazio('cl-endereco'),
    email:       vazio('cl-email')
  };

  const { error } = editando
    ? await sb.from('clientes').update(dados).eq('id', editando.id)
    : await sb.from('clientes').insert({ ...dados, negocio_id: estado.perfil.negocio_id });

  ocupado(botao, false);
  estado.duplicadoConfirmado = false;
  if (error) return aviso('aviso-cliente', mensagemDeErro(error));

  registrar(editando ? 'editou_cliente' : 'criou_cliente');
  fecharFolha('folha-cliente');
  estado.clienteEditando = null;
  await recarregar();

  // Veio do orçamento: volta para lá, com o cliente novo já na lista.
  if (estado.voltarParaOrcamento) {
    estado.voltarParaOrcamento = false;
    return abrirFormOrcamento();
  }
  abrirAba(voltarDoTutorial() ? 'inicio' : 'clientes');
});

// Arquivar em vez de apagar: o histórico de atendimentos continua de pé,
// e o banco nem deixaria apagar um cliente que já foi atendido.
$('#btn-arquivar-cliente').addEventListener('click', async () => {
  const c = estado.clienteEditando;
  if (!c) return;

  const ok = await confirmar('Arquivar ' + escapar(c.nome) + '?',
    'Ele sai da sua lista, mas o histórico de atendimentos continua guardado. ' +
    'Dá para trazer de volta depois.', 'Arquivar');
  if (!ok) return;

  const { error } = await sb.from('clientes').update({ arquivado: true }).eq('id', c.id);
  if (error) return aviso('aviso-cliente', mensagemDeErro(error));

  fecharFolha('folha-cliente');
  fecharFolha('folha-perfil');
  estado.clienteEditando = null;
  await recarregar();
  abrirAba('clientes');
});


// ------------------------------------------------------------
// Formulário: serviço
// ------------------------------------------------------------

// situacao: 'pago' (padrão) ou 'agendado', quando vem da Agenda.
function abrirFormServico(situacao = 'pago') {
  if (!estado.clientes.length) {
    avisarNaFolha('Falta um cliente',
      'Para registrar um servico voce precisa ter pelo menos um cliente cadastrado. Vou abrir o cadastro para voce.');
    return abrirFormCliente();
  }

  $('#sv-cliente').innerHTML = estado.clientes
    .map(c => '<option value="' + c.id + '">' + escapar(c.nome) + '</option>').join('');

  $('#sv-servico').innerHTML =
    (estado.catalogo.length
      ? estado.catalogo.map(s =>
          '<option value="' + s.id + '" data-preco="' + (s.preco_atual ?? '') + '">' +
          escapar(s.nome) + '</option>').join('')
      : '') + '<option value="">Outro serviço…</option>';

  $('#sv-outro-nome').value = '';
  escreverDinheiro('#sv-valor', estado.catalogo[0]?.preco_atual);
  $('#sv-data').value = hoje();
  $('#sv-hora').value = '';
  $('#campo-hora').style.display = estado.temHora ? 'block' : 'none';
  $('#sv-endereco').value = '';
  marcarPastilha('#sv-situacao', situacao);
  marcarPastilha('#sv-pagamento', 'Dinheiro');
  encherParcelas('#sv-parcelas', 1);
  atualizarParcelasServico();
  atualizarCampoOutro();
  limparAviso('aviso-servico');
  abrirFolha('folha-servico');
}

function atualizarCampoOutro() {
  const usaOutro = $('#sv-servico').value === '';
  $('#campo-outro').style.display = usaOutro ? 'block' : 'none';
  $('#sv-outro-nome').required = usaOutro;
}

$('#sv-cadastrar-servico').addEventListener('click', () => {
  estado.voltarParaRegistro = valorPastilha('#sv-situacao') || 'pago';
  fecharFolha('folha-servico');
  abrirCatalogo();
  $('#btn-novo-servico-catalogo').click();
});

$('#sv-servico').addEventListener('change', () => {
  const op = $('#sv-servico').selectedOptions[0];
  const preco = op?.dataset.preco;
  if (preco) escreverDinheiro('#sv-valor', preco);
  atualizarCampoOutro();
});

function marcarPastilha(seletor, valor) {
  $$(seletor + ' button').forEach(b =>
    b.classList.toggle('marcada', b.dataset.valor === valor));
}

function valorPastilha(seletor) {
  return $(seletor + ' button.marcada')?.dataset.valor || null;
}

$$('.pastilhas').forEach(grupo => {
  grupo.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    Array.from(grupo.children).forEach(x => x.classList.remove('marcada'));
    b.classList.add('marcada');
  });
});

$('#form-servico').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = $('#btn-salvar-servico');
  ocupado(botao, true, 'Salvando…');

  const servicoId = $('#sv-servico').value || null;
  const nomeServico = servicoId
    ? estado.catalogo.find(s => s.id === servicoId)?.nome
    : $('#sv-outro-nome').value.trim();

  const situacao = valorPastilha('#sv-situacao') || 'realizado';

  // Data conferida antes de salvar. Um toque errado vira 2062 e o
  // servico some da lista, do mes e das contas.
  const problemaData = problemaNaData($('#sv-data').value, {
    naoPodeSerFutura: situacao === 'pago',
    mensagemFutura: 'Voce marcou como pago numa data que ainda nao chegou. Confira.'
  });
  if (problemaData) { ocupado(botao, false); return aviso('aviso-servico', problemaData); }
  const valor = lerDinheiro('#sv-valor');

  if (valor === null || valor <= 0) {
    ocupado(botao, false);
    return aviso('aviso-servico', 'Escreva quanto você cobrou. Exemplo: 85,00');
  }

  const { data: novo, error } = await sb.from('atendimentos').insert({
    negocio_id: estado.perfil.negocio_id,
    cliente_id: $('#sv-cliente').value,
    servico_id: servicoId,
    profissional_id: estado.perfil.id,
    criado_por: estado.perfil.id,
    tipo: 'rapido',
    servico_nome: nomeServico,   // cópia congelada
    valor: valor,                // cópia congelada
    data: $('#sv-data').value || hoje(),
    ...(estado.temHora && $('#sv-hora').value ? { hora: $('#sv-hora').value } : {}),
    endereco: $('#sv-endereco').value.trim() || null,
    forma_pagamento: valorPastilha('#sv-pagamento'),
    ...(estado.temParcelas && pagamentoParcelavel(valorPastilha('#sv-pagamento'))
        ? { parcelas: Number($('#sv-parcelas').value) || 1 } : {}),
    situacao: situacao
  }).select().single();

  ocupado(botao, false);
  if (error) return aviso('aviso-servico', mensagemDeErro(error));

  fecharFolha('folha-servico');

  registrar('registrou_servico', { situacao: situacao });

  // Serviço pago vira entrada no Financeiro, se a pessoa quiser
  if (situacao === 'pago') await ofereceLancarEntrada(novo);

  await recarregar();
  abrirAba(voltarDoTutorial() ? 'inicio' : 'servicos');
});


// ------------------------------------------------------------
// Formulário: entrada e saída
// ------------------------------------------------------------

function abrirFormLancamento(tipo) {
  $('#lc-tipo').value = tipo;
  $('#titulo-lancamento').textContent = tipo === 'entrada' ? 'Entrada' : 'Saída';
  $('#lc-valor').value = '';
  $('#lc-data').value = hoje();
  encherCategorias(tipo, null);
  $('#lc-categoria-outra').value = '';
  $('#lc-obs').value = '';
  $('#campo-natureza').style.display = tipo === 'despesa' ? 'block' : 'none';

  $('#lc-cliente').innerHTML = '<option value="">Nenhum</option>' +
    estado.clientes.map(c =>
      '<option value="' + c.id + '">' + escapar(c.nome) +
      (c.empresa ? ' — ' + escapar(c.empresa) : '') + '</option>').join('');
  marcarPastilha('#lc-natureza', 'negocio');
  $('#btn-salvar-lancamento').className = 'btn ' + (tipo === 'entrada' ? 'btn-verde' : 'btn-principal');
  limparAviso('aviso-lancamento');
  abrirFolha('folha-lancamento');
  setTimeout(() => $('#lc-valor').focus(), 200);
}

$('#form-lancamento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = $('#btn-salvar-lancamento');
  const tipo = $('#lc-tipo').value;

  const valor = lerDinheiro('#lc-valor');
  if (valor === null || valor <= 0) {
    return aviso('aviso-lancamento',
      'Escreva o valor. Exemplo: 150,50 — pode usar vírgula.');
  }

  const problemaData = problemaNaData($('#lc-data').value, {
    naoPodeSerFutura: true,
    mensagemFutura: 'Esta data ainda nao chegou. Lance o dinheiro quando ele entrar ou sair.'
  });
  if (problemaData) return aviso('aviso-lancamento', problemaData);

  ocupado(botao, true, 'Salvando…');

  const { error } = await sb.from('lancamentos').insert({
    negocio_id: estado.perfil.negocio_id,
    criado_por: estado.perfil.id,
    tipo: tipo,
    valor: valor,
    data: $('#lc-data').value || hoje(),
    categoria: categoriaEscolhida(),
    natureza: tipo === 'despesa' ? (valorPastilha('#lc-natureza') || 'negocio') : null,
    cliente_id: $('#lc-cliente').value || null,
    observacao: $('#lc-obs').value.trim() || null
  });

  ocupado(botao, false);
  if (error) return aviso('aviso-lancamento', mensagemDeErro(error));

  fecharFolha('folha-lancamento');
  await recarregar();
  abrirAba('financeiro');
});


// ------------------------------------------------------------
// Meta mensal e retirada
// ------------------------------------------------------------

function abrirMeta() {
  escreverDinheiro('#mt-valor', estado.negocio?.prolabore_valor);
  $('#mt-dia').value   = estado.negocio?.prolabore_dia ?? '';
  limparAviso('aviso-meta');
  abrirFolha('folha-meta');
}

$('#form-meta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = $('#btn-salvar-meta');

  const v = lerDinheiro('#mt-valor');
  if ($('#mt-valor').value.trim() && (v === null || v < 0)) {
    return aviso('aviso-meta', 'Valor não entendido. Exemplo: 2000,00');
  }

  ocupado(botao, true, 'Salvando…');

  const d = $('#mt-dia').value;
  const dia = d === '' ? null : Number(d);

  // Salva pela função, que confere se quem está pedindo é o dono.
  // Se a migração 07 ainda não rodou, cai no caminho antigo.
  let { error } = await sb.rpc('salvar_minha_meta', { p_valor: v, p_dia: dia });
  if (error) {
    ({ error } = await sb.from('negocios')
      .update({ prolabore_valor: v, prolabore_dia: dia })
      .eq('id', estado.perfil.negocio_id));
  }

  ocupado(botao, false);
  if (error) return aviso('aviso-meta', mensagemDeErro(error));

  fecharFolha('folha-meta');
  await recarregar();
});

function abrirRetirada() {
  escreverDinheiro('#rt-valor', estado.negocio?.prolabore_valor);
  $('#rt-data').value = hoje();
  marcarPastilha('#rt-tipo', 'prolabore');
  limparAviso('aviso-retirada');
  abrirFolha('folha-retirada');
}

$('#form-retirada').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = $('#btn-salvar-retirada');

  const valor = lerDinheiro('#rt-valor');
  if (valor === null || valor <= 0) {
    return aviso('aviso-retirada', 'Escreva quanto você retirou. Exemplo: 500,00');
  }

  ocupado(botao, true, 'Salvando…');

  const { error } = await sb.from('retiradas').insert({
    negocio_id: estado.perfil.negocio_id,
    tipo: valorPastilha('#rt-tipo') || 'prolabore',
    valor: valor,
    data: $('#rt-data').value || hoje()
  });

  ocupado(botao, false);
  if (error) return aviso('aviso-retirada', mensagemDeErro(error));

  fecharFolha('folha-retirada');
  await recarregar();
});


// ------------------------------------------------------------
// Ajustes
// ------------------------------------------------------------

$('#avatar').addEventListener('click', () => {
  $('#aj-nome').textContent = estado.perfil.nome;
  $('#aj-papel').textContent = estado.perfil.papel === 'dono' ? 'Dono do negócio' : 'Profissional';
  $('#aj-negocio').textContent = estado.negocio?.nome || estado.negocio?.tipo_atividade || '';
  $('#aj-qtd-servicos').textContent = estado.catalogo.length + ' cadastrado(s)';
  $('#aj-email-atual').textContent = estado.perfil.email_recuperacao || 'Nenhum — cadastre para recuperar a senha';
  abrirFolha('folha-ajustes');
});

// ------------------------------------------------------------
// Equipe
//
// A função criar_convite já existia no banco desde o começo, mas
// nenhuma tela chamava ela — então não havia jeito de montar uma
// equipe pelo app. Esta folha resolve isso.
// ------------------------------------------------------------

$('#aj-equipe').addEventListener('click', async () => {
  fecharFolha('folha-ajustes');
  limparAviso('aviso-convidar');
  $('#conteudo-convidar').innerHTML = '<p class="rotulo">Carregando…</p>';
  abrirFolha('folha-convidar');
  await desenharEquipe();
});

async function desenharEquipe() {
  const [{ data: equipe }, { data: convites }] = await Promise.all([
    sb.from('perfis').select('id, nome, papel, celular').order('nome'),
    sb.from('convites').select('*').is('usado_em', null).order('criado_em', { ascending: false })
  ]);

  let h = '<p class="secao-titulo">Quem já está</p>';
  (equipe || []).forEach(p => {
    h += '<div class="item"><div class="corpo">' +
         '<span class="titulo">' + escapar(p.nome) + '</span>' +
         '<span class="sub">' + (p.papel === 'dono' ? 'Dono do negócio' : 'Profissional') + '</span>' +
         '</div></div>';
  });

  const validos = (convites || []).filter(c => !c.expira_em || c.expira_em > new Date().toISOString());
  if (validos.length) {
    h += '<p class="secao-titulo">Códigos em aberto</p>';
    validos.forEach(c => {
      h += '<div class="item"><div class="corpo">' +
           '<span class="titulo codigo">' + escapar(c.codigo) + '</span>' +
           '<span class="sub">Vale até ' + dataCurta(c.expira_em) + '</span>' +
           '</div><div class="direita">' +
           '<button class="btn-texto" data-copiar="' + escapar(c.codigo) + '">copiar</button>' +
           '</div></div>';
    });
  }

  $('#conteudo-convidar').innerHTML = h;

  $$('#conteudo-convidar [data-copiar]').forEach(b =>
    b.addEventListener('click', async () => {
      const codigo = b.dataset.copiar;
      const texto = 'Olá! Use este código para entrar na equipe no app Loen Soluções: ' + codigo;
      try {
        await navigator.clipboard.writeText(texto);
        aviso('aviso-convidar', 'Copiado. Agora é só colar no WhatsApp da pessoa.', 'ok');
      } catch {
        aviso('aviso-convidar', 'Anote o código: ' + codigo, 'ok');
      }
    }));
}

$('#btn-gerar-convite').addEventListener('click', async () => {
  const botao = $('#btn-gerar-convite');
  ocupado(botao, true, 'Gerando…');
  limparAviso('aviso-convidar');

  const { error } = await sb.rpc('criar_convite');

  ocupado(botao, false);
  if (error) return aviso('aviso-convidar', mensagemDeErro(error));

  await desenharEquipe();
  aviso('aviso-convidar', 'Código criado. Toque em "copiar" e mande no WhatsApp.', 'ok');
});

$('#aj-catalogo').addEventListener('click', () => { fecharFolha('folha-ajustes'); abrirCatalogo(); });
$('#aj-imagem').addEventListener('click',  () => { fecharFolha('folha-ajustes'); abrirFolha('folha-imagem'); });

$('#aj-sair').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

$('#aj-apagar').addEventListener('click', async () => {
  if (!confirm('Isto apaga sua conta, seus clientes, serviços e todo o financeiro. Não tem volta. Continuar?')) return;
  if (prompt('Para confirmar, digite APAGAR em letras maiúsculas:') !== 'APAGAR') return;

  const { error } = await sb.rpc('apagar_minha_conta');
  if (error) return avisarNaFolha('Nao deu certo', escapar(error.message));
  localStorage.clear();
  location.reload();
});


// ------------------------------------------------------------
// Catálogo de serviços e preços
// ------------------------------------------------------------

function abrirCatalogo() {
  desenharCatalogo();
  abrirFolha('folha-catalogo');
}

// Preço guardado (1920.5) no formato que a máscara usa ("1.920,50").
function precoNoCampo(v) {
  if (v === null || v === undefined || v === '') return '';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function desenharCatalogo() {
  let h = '';

  if (!estado.catalogo.length) {
    const sug = SERVICOS_SUGERIDOS[estado.negocio?.tipo_atividade] || [];
    if (sug.length) {
      h += '<p style="color:#4A4A4A;margin:0 0 14px">Estes são os serviços mais comuns de ' +
           escapar(estado.negocio.tipo_atividade).toLowerCase() +
           '. Desmarque o que você não faz e coloque quanto cobra.</p>';
      sug.forEach((nome, i) => {
        h += '<div class="servico-linha marcada">' +
             '<input type="checkbox" id="sg' + i + '" checked>' +
             '<label class="nome" for="sg' + i + '">' + escapar(nome) + '</label>' +
             '<input class="preco" type="text" data-dinheiro data-reais inputmode="numeric" placeholder="R$">' +
             '</div>';
      });
      h += '<button class="btn btn-verde" id="btn-salvar-sugeridos">Salvar meus serviços</button>';
    }
    h += '<button class="btn btn-secundario" id="btn-novo-servico-catalogo">Cadastrar outro serviço</button>';
  } else {
    estado.catalogo.forEach(s => {
      h += '<div class="item"><div class="corpo">' +
           '<span class="titulo">' + escapar(s.nome) + '</span>' +
           '<span class="sub">Preço alterado em ' + dataCurta(s.atualizado_em) + '</span></div>' +
           '<input class="preco" type="text" data-dinheiro data-reais inputmode="numeric" ' +
           'data-servico="' + s.id + '" value="' + precoNoCampo(s.preco_atual) + '"></div>';
    });
    h += '<button class="btn btn-principal" id="btn-salvar-precos">Salvar preços</button>';
    h += '<button class="btn btn-secundario" id="btn-novo-servico-catalogo">Cadastrar outro serviço</button>';
  }

  $('#conteudo-catalogo').innerHTML = h;
  $$('#conteudo-catalogo input[data-reais]').forEach(mascararReais);

  const bs = $('#btn-salvar-sugeridos');
  if (bs) bs.addEventListener('click', salvarSugeridos);

  const bp = $('#btn-salvar-precos');
  if (bp) bp.addEventListener('click', salvarPrecos);

  $('#btn-novo-servico-catalogo').addEventListener('click', () => {
    $('#form-novo-servico').style.display = 'block';
    $('#ns-nome').value = '';
    $('#ns-preco').value = '';
    limparAviso('aviso-novo-servico');
    $('#ns-nome').focus();
  });

  $$('#conteudo-catalogo .servico-linha input[type=checkbox]').forEach(c =>
    c.addEventListener('change', () =>
      c.closest('.servico-linha').classList.toggle('marcada', c.checked)));
}

async function salvarSugeridos() {
  const botao = $('#btn-salvar-sugeridos');
  ocupado(botao, true, 'Salvando…');

  const linhas = [];
  $$('#conteudo-catalogo .servico-linha').forEach(l => {
    if (!l.querySelector('input[type=checkbox]').checked) return;
    const p = lerDinheiroDe(l.querySelector('.preco'));
    linhas.push({
      negocio_id: estado.perfil.negocio_id,
      nome: l.querySelector('.nome').textContent,
      preco_atual: p ?? null
    });
  });

  if (!linhas.length) { ocupado(botao, false); return avisarNaFolha('Nenhum servico marcado', 'Marque pelo menos um servico da lista antes de salvar.'); }

  const { error } = await sb.from('servicos_catalogo').insert(linhas);
  ocupado(botao, false);
  if (error) return avisarNaFolha('Nao deu certo', escapar(mensagemDeErro(error)));

  await recarregar();

  // Veio do tutorial do Início: fecha o catálogo e devolve ela para lá,
  // onde o passo já aparece marcado.
  if (voltarDoTutorial()) {
    fecharFolha('folha-catalogo');
    return abrirAba('inicio');
  }
  desenharCatalogo();
}

async function salvarPrecos() {
  const botao = $('#btn-salvar-precos');
  ocupado(botao, true, 'Salvando…');

  // Antes este laço ignorava o erro de cada update e mostrava "Preços
  // salvos" de qualquer jeito. A pessoa saía achando que tinha salvo.
  let quantos = 0;
  const falhas = [];

  for (const campo of $$('#conteudo-catalogo input[data-servico]')) {
    const id = campo.dataset.servico;
    const servico = estado.catalogo.find(s => s.id === id);
    const atual = servico?.preco_atual;
    const novo = lerDinheiroPositivo(campo);

    if (Number(atual ?? NaN) === Number(novo ?? NaN)) continue;

    const { error } = await sb.from('servicos_catalogo')
      .update({ preco_atual: novo }).eq('id', id);

    if (error) falhas.push(servico?.nome || 'um serviço');
    else quantos++;
  }

  ocupado(botao, false);
  await recarregar();
  desenharCatalogo();

  if (falhas.length) {
    return $('#conteudo-catalogo').insertAdjacentHTML('afterbegin',
      '<div class="aviso visivel erro">Não consegui salvar o preço de ' +
      escapar(falhas.join(', ')) + '. Tente de novo.</div>');
  }

  $('#conteudo-catalogo').insertAdjacentHTML('afterbegin',
    '<div class="aviso visivel ok">' +
    (quantos ? quantos + ' preço(s) salvo(s). ' : 'Nenhum preço mudou. ') +
    'Os serviços já registrados continuam com o valor antigo.</div>');
}

$('#cancelar-novo-servico').addEventListener('click', () => {
  $('#form-novo-servico').style.display = 'none';
});

$('#form-novo-servico').addEventListener('submit', async (e) => {
  e.preventDefault();
  const botao = $('#btn-criar-servico');
  ocupado(botao, true, 'Adicionando…');

  const preco = lerDinheiro('#ns-preco');

  const { error } = await sb.from('servicos_catalogo').insert({
    negocio_id: estado.perfil.negocio_id,
    nome: $('#ns-nome').value.trim(),
    preco_atual: preco ?? null
  });

  ocupado(botao, false);
  if (error) return aviso('aviso-novo-servico', mensagemDeErro(error));

  $('#form-novo-servico').style.display = 'none';
  await recarregar();

  // Veio do "Cadastrar um serviço novo" do registro: volta para lá,
  // com o serviço recém-criado já escolhido.
  if (estado.voltarParaRegistro) {
    const situacao = estado.voltarParaRegistro;
    estado.voltarParaRegistro = null;
    fecharFolha('folha-catalogo');
    abrirFormServico(situacao);
    const criado = estado.catalogo.find(s => s.nome === $('#ns-nome').value.trim());
    if (criado) { $('#sv-servico').value = criado.id; $('#sv-servico').dispatchEvent(new Event('change')); }
    return;
  }
  desenharCatalogo();
});


// ------------------------------------------------------------
// Foto de perfil ou logo do negócio
// ------------------------------------------------------------

$('#form-imagem').addEventListener('submit', async (e) => {
  e.preventDefault();
  const arquivo = $('#img-arquivo').files[0];
  if (!arquivo) return aviso('aviso-imagem', 'Escolha uma imagem.');

  const ehLogo = valorPastilha('#img-tipo') === 'logo';
  if (ehLogo && estado.perfil.papel !== 'dono')
    return aviso('aviso-imagem', 'Só o dono do negócio pode trocar a logo.');

  const botao = $('#btn-salvar-imagem');
  ocupado(botao, true, 'Enviando…');

  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const caminho = estado.perfil.negocio_id + '/' +
    (ehLogo ? 'logo.' + ext : 'perfil-' + estado.perfil.id + '.' + ext);

  const { error: erroUp } = await sb.storage
    .from('imagens').upload(caminho, arquivo, { upsert: true });

  if (erroUp) { ocupado(botao, false); return aviso('aviso-imagem', mensagemDeErro(erroUp)); }

  const { error } = ehLogo
    ? await sb.from('negocios').update({ logo_caminho: caminho }).eq('id', estado.perfil.negocio_id)
    : await sb.from('perfis').update({ foto_caminho: caminho }).eq('id', estado.perfil.id);

  ocupado(botao, false);
  if (error) return aviso('aviso-imagem', mensagemDeErro(error));

  fecharFolha('folha-imagem');
  await recarregar();
});

async function carregarImagem() {
  const caminho = estado.perfil?.foto_caminho || estado.negocio?.logo_caminho;
  if (!caminho) { estado.urlImagem = null; return; }

  const { data } = await sb.storage.from('imagens').createSignedUrl(caminho, 3600);
  estado.urlImagem = data?.signedUrl || null;
}


// ------------------------------------------------------------
// Recarregar e abrir
// ------------------------------------------------------------

async function recarregar() {
  await carregarTudo();
  await carregarImagem();

  // Orçamento que passou da validade vira "vencido" sozinho, aqui, antes
  // de desenhar. Assim a lista nunca mostra como vivo algo que já morreu.
  if (typeof vencerOsVencidos === 'function') await vencerOsVencidos();

  desenhar();
}

// Os exemplos dentro dos campos saem da PROFISSÃO de quem usa: a
// manicure lê "Mão e pé", o pintor lê "Pintura interna". Antes todo
// mundo lia "Pintura da sala e do corredor" (pedido do Leandro,
// 29/09/2026). A lista é a mesma dos serviços sugeridos — diferença de
// nicho vive em dado, não em if espalhado.
// Quem escolheu "Outro" (ou uma profissão sem lista) fica com o exemplo
// neutro que já está no HTML.
function aplicarExemplos() {
  const sugeridos = SERVICOS_SUGERIDOS[estado.negocio?.tipo_atividade] || [];
  if (!sugeridos.length) return;
  // "Alvenaria (m²)" → "Alvenaria": a unidade confunde no exemplo.
  const limpo = (s) => s.replace(/\s*\([^)]*\)\s*$/, '');
  const principal = limpo(sugeridos.find(s => / e /.test(s)) || sugeridos[0]);
  ['#or-titulo', '#ca-titulo'].forEach(sel => { const c = $(sel); if (c) c.placeholder = principal; });
  const outro = limpo(sugeridos[sugeridos.length - 1]);
  const ns = $('#ns-nome'); if (ns) ns.placeholder = outro;
}

async function abrirApp() {
  const ok = await carregarTudo();
  if (!ok) return false;
  aplicarExemplos();
  await carregarImagem();

  // Mesma manutenção que o recarregar() faz. Entrar no app é justamente
  // quando isto mais importa: é a primeira coisa que ela vê no dia.
  if (typeof vencerOsVencidos === 'function') await vencerOsVencidos();

  $$('.tela').forEach(t => t.classList.remove('ativa'));
  $('.app').style.display = 'none';   // some com a área de login, senão sobra espaço em branco
  $('#painel').classList.add('ativo');
  abrirAba('inicio');
  pedirEmailSeFaltar();
  registrar('entrou');
  return true;
}


// ------------------------------------------------------------
// Partida
// ------------------------------------------------------------

iniciar();


// ------------------------------------------------------------
// Cliques nas listas
// ------------------------------------------------------------

function ligarListas(area) {
  $$(area + ' [data-cliente]').forEach(b =>
    b.addEventListener('click', () => abrirPerfilCliente(b.dataset.cliente)));

  $$(area + ' [data-atendimento]').forEach(b =>
    b.addEventListener('click', () => abrirAtendimento(b.dataset.atendimento)));
}


// ------------------------------------------------------------
// Perfil do cliente
// ------------------------------------------------------------

function abrirPerfilCliente(id) {
  const c = estado.clientes.find(x => x.id === id);
  if (!c) return;
  estado.clienteAberto = c;

  const ats = estado.atendimentos
    .filter(a => a.cliente_id === id)
    .sort((a, b) => b.data.localeCompare(a.data));

  // Para quem não pode ver valores (migração 08), somar daria R$ 0,00 —
  // e zero é mentira. null vira traço na tela.
  const total = estado.podeVerValores === false
    ? null
    : ats.reduce((s, a) => s + Number(a.valor || 0), 0);
  const ultimo = ats[0];

  const contagem = {};
  ats.forEach(a => { contagem[a.servico_nome] = (contagem[a.servico_nome] || 0) + 1; });
  const favorito = Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a])[0];

  let h = '<div class="cartao"><p class="valor" style="font-size:24px">' + escapar(c.nome) + '</p>';
  [c.empresa, c.responsavel && 'Resp.: ' + c.responsavel, c.cnpj && 'CNPJ ' + c.cnpj,
   c.telefone, c.email, c.endereco, c.observacao]
    .filter(Boolean)
    .forEach(linha => {
      h += '<p class="rotulo" style="margin:6px 0 0">' + escapar(linha) + '</p>';
    });
  h += '</div>';

  h += '<div class="dupla">' +
       '<div class="cartao"><p class="rotulo">Atendimentos</p><p class="valor">' + ats.length + '</p></div>' +
       '<div class="cartao"><p class="rotulo">Total gasto</p><p class="valor verde" style="font-size:19px">' +
       moeda(total) + '</p></div></div>';

  if (ultimo) {
    h += '<div class="cartao"><p class="rotulo">Último atendimento</p>' +
         '<p class="valor" style="font-size:19px">' + escapar(ultimo.servico_nome) + '</p>' +
         '<p class="rotulo" style="margin:6px 0 0">' + dataCurta(ultimo.data) + ' · ' + moeda(ultimo.valor) + '</p>' +
         (favorito ? '<p class="rotulo" style="margin:6px 0 0">Serviço mais feito: ' + escapar(favorito) + '</p>' : '') +
         '</div>';
  }

  if (c.telefone) {
    const so = c.telefone.replace(/\D/g, '');
    const numero = so.length > 11 ? so : '55' + so;
    h += '<a class="btn btn-verde" style="text-decoration:none" target="_blank" rel="noopener" ' +
         'href="https://wa.me/' + numero + '">Abrir conversa no WhatsApp</a>';
  }

  h += '<button class="btn btn-principal" id="pf-repetir">Repetir serviço</button>';
  h += '<button class="btn btn-secundario" id="pf-editar">Editar dados do cliente</button>';

  if (ats.length) {
    h += '<p class="secao-titulo">Histórico</p>';
    ats.forEach(a => { h += linhaAtendimento(a); });
  } else {
    h += '<div class="vazio">Nenhum serviço registrado para este cliente.</div>';
  }

  $('#conteudo-perfil').innerHTML = h;
  abrirFolha('folha-perfil');

  $('#pf-editar').addEventListener('click', () => {
    fecharFolha('folha-perfil');
    abrirFormCliente(c);
  });

  $('#pf-repetir').addEventListener('click', () => {
    fecharFolha('folha-perfil');
    abrirFormServico();
    $('#sv-cliente').value = c.id;
    if (ultimo?.servico_id) {
      $('#sv-servico').value = ultimo.servico_id;
      $('#sv-servico').dispatchEvent(new Event('change'));
    }
  });

  ligarListas('#conteudo-perfil');
}


// ------------------------------------------------------------
// Tocar num serviço: abre para ver e editar
//
// Antes, tocar num serviço só perguntava "marcar como pago?" e não
// havia nenhum jeito de corrigir valor, data ou cliente. Um serviço
// registrado errado ficava errado para sempre no histórico e na conta.
// ------------------------------------------------------------

function abrirAtendimento(id) {
  const a = estado.atendimentos.find(x => x.id === id);
  if (!a) return;
  estado.atendimentoAberto = a;

  $('#ed-cliente').innerHTML = estado.clientes
    .map(c => '<option value="' + c.id + '"' + (c.id === a.cliente_id ? ' selected' : '') +
              '>' + escapar(c.nome) + '</option>').join('');

  $('#ed-servico').value  = a.servico_nome || '';
  escreverDinheiro('#ed-valor', a.valor);
  $('#ed-data').value     = (a.data || '').slice(0, 10);
  $('#ed-hora').value     = (a.hora || '').slice(0, 5);
  $('#ed-endereco').value = a.endereco || '';

  // "realizado" é o nome antigo de "a receber" — as duas pastilhas
  // são a mesma coisa para quem usa o app.
  marcarPastilha('#ed-situacao', a.situacao === 'realizado' ? 'pendente' : a.situacao);
  marcarPastilha('#ed-pagamento', a.forma_pagamento || 'Dinheiro');

  $('#campo-hora-editar').style.display = estado.temHora ? 'block' : 'none';

  // Cobrar só faz sentido em serviço que já foi feito e não foi pago.
  const aReceber = a.situacao === 'pendente' || a.situacao === 'realizado';
  $('#btn-cobrar').style.display = aReceber ? 'flex' : 'none';

  limparAviso('aviso-editar');
  abrirFolha('folha-editar');
}

$('#btn-cobrar').addEventListener('click', () => {
  if (estado.atendimentoAberto) cobrarPeloWhatsApp(estado.atendimentoAberto);
});

$('#form-editar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = estado.atendimentoAberto;
  if (!a) return;

  const valor = lerDinheiro('#ed-valor');
  if (valor === null || valor <= 0) {
    return aviso('aviso-editar', 'Escreva quanto você cobrou. Exemplo: 85,00');
  }

  const botao = $('#btn-salvar-editar');
  ocupado(botao, true, 'Salvando…');

  const situacao = valorPastilha('#ed-situacao') || 'pendente';

  const problemaData = problemaNaData($('#ed-data').value, {
    naoPodeSerFutura: situacao === 'pago',
    mensagemFutura: 'Voce marcou como pago numa data que ainda nao chegou. Confira.'
  });
  if (problemaData) return aviso('aviso-editar', problemaData);
  const eraPago  = a.situacao === 'pago';

  const mudanca = {
    cliente_id:      $('#ed-cliente').value,
    servico_nome:    $('#ed-servico').value.trim(),
    valor:           valor,
    data:            $('#ed-data').value || hoje(),
    endereco:        $('#ed-endereco').value.trim() || null,
    forma_pagamento: valorPastilha('#ed-pagamento'),
    situacao:        situacao
  };
  if (estado.temHora) mudanca.hora = $('#ed-hora').value || null;

  const { error } = await sb.from('atendimentos').update(mudanca).eq('id', a.id);

  ocupado(botao, false);
  if (error) return aviso('aviso-editar', mensagemDeErro(error));

  fecharFolha('folha-editar');
  fecharFolha('folha-perfil');

  // Virou pago agora: oferece lançar a entrada no financeiro.
  if (!eraPago && situacao === 'pago') await ofereceLancarEntrada({ ...a, ...mudanca });

  await recarregar();
});

$('#btn-apagar-servico').addEventListener('click', async () => {
  const a = estado.atendimentoAberto;
  if (!a) return;

  const ok = await confirmar(
    'Apagar este serviço?',
    escapar(a.servico_nome) + ' · ' + moeda(a.valor) + ' · ' + dataCurta(a.data) +
    '<br><br>Ele some do histórico e das contas. Não tem volta.',
    'Apagar', true);
  if (!ok) return;

  const { error } = await sb.from('atendimentos').delete().eq('id', a.id);
  if (error) return aviso('aviso-editar', mensagemDeErro(error));

  fecharFolha('folha-editar');
  fecharFolha('folha-perfil');
  await recarregar();
});

// Serviço pago pode virar entrada no Financeiro, se o dono quiser.
async function ofereceLancarEntrada(a) {
  if (estado.perfil.papel !== 'dono' || !(Number(a.valor) > 0)) return;

  const ok = await confirmar(
    'Registrar no Financeiro?',
    'Quer lançar a entrada de <strong>' + moeda(a.valor) + '</strong> no seu caixa?',
    'Sim, lançar');
  if (!ok) return;

  await sb.from('lancamentos').insert({
    negocio_id: estado.perfil.negocio_id,
    criado_por: estado.perfil.id,
    tipo: 'entrada',
    valor: a.valor,
    data: a.data || hoje(),
    categoria: a.servico_nome,
    cliente_id: a.cliente_id,
    atendimento_id: a.id,
    forma_pagamento: a.forma_pagamento
  });
}


// ------------------------------------------------------------
// Conta: senha, aparelhos e falar com a equipe
// ------------------------------------------------------------

// Trocar a senha aqui é para quem está logado. Quem esqueceu usa
// "Esqueci minha senha" na entrada, que manda o link para o e-mail.
$('#aj-senha').addEventListener('click', () => {
  fecharFolha('folha-ajustes');
  $('#sn-nova').value = '';
  $('#sn-confirma').value = '';
  limparAviso('aviso-senha');
  abrirFolha('folha-senha');
});

$('#form-senha').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nova = $('#sn-nova').value;
  const confirma = $('#sn-confirma').value;

  if (nova.length < 8) {
    return aviso('aviso-senha', 'A senha precisa ter pelo menos 8 caracteres.');
  }
  if (nova !== confirma) {
    return aviso('aviso-senha', 'As duas senhas não estão iguais. Confira e tente de novo.');
  }

  const botao = $('#btn-salvar-senha');
  ocupado(botao, true, 'Trocando…');

  const { error } = await sb.auth.updateUser({ password: nova });

  ocupado(botao, false);
  if (error) return aviso('aviso-senha', mensagemDeErro(error));

  fecharFolha('folha-senha');
  avisarNaFolha('Senha trocada',
    'Da próxima vez que entrar, use a senha nova. Guarde ela em lugar seguro.');
});

// ------------------------------------------------------------
// Meu e-mail — a porta de volta se esquecer a senha
//
// Toda conta precisa ter. Quem não tem (conta criada antes do e-mail
// virar obrigatório) vê esta folha ao entrar, travada: sem voltar e
// sem fechar tocando fora, até salvar.
// ------------------------------------------------------------

function abrirFolhaEmail(obrigatorio) {
  const folha = $('#folha-email');
  if (obrigatorio) folha.dataset.travada = '1';
  else delete folha.dataset.travada;

  $('#em-voltar').style.visibility = obrigatorio ? 'hidden' : 'visible';
  $('#em-texto').textContent = obrigatorio
    ? 'Antes de continuar, cadastre seu e-mail. Se um dia esquecer a senha, ' +
      'é para ele que mandamos o link para criar outra.'
    : 'É para este e-mail que mandamos o link se você esquecer a senha. ' +
      'Também dá para entrar no app com ele.';

  $('#em-email').value = estado.perfil?.email_recuperacao || '';
  $('#em-email2').value = '';
  limparAviso('aviso-email');
  abrirFolha('folha-email');
}

function pedirEmailSeFaltar() {
  if (!estado.perfil?.email_recuperacao) abrirFolhaEmail(true);
}

$('#aj-email').addEventListener('click', () => {
  fecharFolha('folha-ajustes');
  abrirFolhaEmail(false);
});

$('#form-email').addEventListener('submit', async (e) => {
  e.preventDefault();
  limparAviso('aviso-email');

  const email = limparEmail($('#em-email').value);
  const problema = problemaNoEmail(email, limparEmail($('#em-email2').value));
  if (problema) return aviso('aviso-email', problema);

  const botao = $('#btn-salvar-email');
  ocupado(botao, true, 'Salvando…');
  // O banco confere o formato, a repetição em outra conta e se é a
  // própria pessoa trocando (migração 14).
  const { error } = await sb.from('perfis')
    .update({ email_recuperacao: email })
    .eq('id', estado.perfil.id);
  ocupado(botao, false);

  if (error) return aviso('aviso-email', mensagemDeErro(error));

  estado.perfil.email_recuperacao = email;
  delete $('#folha-email').dataset.travada;
  fecharFolha('folha-email');
  avisarNaFolha('E-mail salvo',
    'Se esquecer a senha, toque em "Esqueci minha senha" na entrada ' +
    'e mandamos o link para ' + escapar(email) + '.');
});

// Sair de todos os aparelhos é o que salva quem perdeu o celular:
// derruba a sessão em qualquer lugar que estiver aberta.
$('#aj-sair-tudo').addEventListener('click', async () => {
  fecharFolha('folha-ajustes');

  const ok = await confirmar('Sair de todos os aparelhos?',
    'Você vai sair aqui e em qualquer outro celular onde sua conta esteja aberta. ' +
    'Para voltar, é só entrar de novo com seu celular e senha.',
    'Sair de todos');
  if (!ok) return;

  await sb.auth.signOut({ scope: 'global' });
  localStorage.clear();
  location.reload();
});

// Caminho para relatar problema. Sem isto, a pessoa manda áudio no
// WhatsApp e ninguém sabe em que tela ela estava.
$('#aj-reportar').addEventListener('click', () => {
  fecharFolha('folha-ajustes');
  falarComAEquipe();
});


// ------------------------------------------------------------
// Cobrar pelo WhatsApp
//
// Mensagem gentil e editável. O público cobra cliente que é vizinho,
// que vai voltar mês que vem — o tom não pode queimar a relação.
// ------------------------------------------------------------

function cobrarPeloWhatsApp(atendimento) {
  const c = estado.clientes.find(x => x.id === atendimento.cliente_id);
  if (!c?.telefone) {
    return avisarNaFolha('Sem telefone',
      'Este cliente não tem telefone cadastrado. Toque em "Editar dados do cliente" ' +
      'no perfil dele para colocar.');
  }

  const valor = atendimento.valor === null || atendimento.valor === undefined
    ? '' : ', no valor de ' + moeda(atendimento.valor);

  const texto =
    'Oi, ' + (c.nome || '').trim().split(/\s+/)[0] + ', tudo bem? ' +
    'Passando para lembrar do ' + atendimento.servico_nome +
    ' de ' + dataCurta(atendimento.data) + valor + '. ' +
    'Quando puder me avisa, por favor. Obrigado!';

  window.open(linkWhatsApp(c.telefone, texto), '_blank', 'noopener');
}


// ------------------------------------------------------------
// Medição
//
// Registra O QUE aconteceu e QUANDO. Nunca o que a pessoa escreveu:
// sem nome de cliente, sem valor, sem texto. Isso basta para saber se
// o piloto está andando, sem virar vigilância.
//
// Falha calada de propósito: medição nunca pode derrubar o app nem
// atrasar uma tela. Ver migração 10.
// ------------------------------------------------------------

function registrar(acao, detalhe) {
  // A migração 10 pode ainda não ter rodado. Descobre uma vez e desiste,
  // em vez de bater numa função inexistente a cada ação.
  if (estado.temLogDeEventos === false) return;

  try {
    sb.rpc('registrar_evento', { p_acao: acao, p_detalhe: detalhe || null })
      .then(({ error }) => {
        if (error) estado.temLogDeEventos = false;
        else estado.temLogDeEventos = true;
      })
      .catch(() => { estado.temLogDeEventos = false; });
  } catch (e) { /* medição nunca atrapalha o app */ }
}


// ------------------------------------------------------------
// Comprovante de renda
// ------------------------------------------------------------

$('#aj-renda').addEventListener('click', async () => {
  fecharFolha('folha-ajustes');

  if (estado.perfil.papel !== 'dono') {
    return avisarNaFolha('Área do dono',
      'O comprovante de renda usa o financeiro do negócio, que só o dono enxerga.');
  }

  const temEntrada = (estado.lancamentosTotal || []).some(l => l.tipo === 'entrada');
  if (!temEntrada) {
    return avisarNaFolha('Ainda não dá',
      'O comprovante usa o dinheiro que entrou. Registre suas entradas no Financeiro ' +
      'por alguns meses e ele fica pronto para usar.');
  }

  try {
    const { doc, resumo: r } = await gerarComprovanteDeRenda(6);

    const p = (n) => String(n).padStart(2, '0');
    const d = new Date();
    doc.save('comprovante-de-renda-' + p(d.getDate()) + p(d.getMonth() + 1) + d.getFullYear() + '.pdf');

    registrar('gerou_relatorio', { meses: r.mesesContados });

    avisarNaFolha('Comprovante baixado',
      'Sua renda média nos últimos meses deu <strong>' + moeda(r.media) + '</strong>.<br><br>' +
      'Use este papel para alugar, financiar ou abrir MEI. ' +
      'Quanto mais tempo você registrar, mais forte ele fica.');
  } catch (e) {
    console.error('Loen Soluções — comprovante:', e);
    avisarNaFolha('Não deu certo', escapar(e.message || 'Não consegui gerar o comprovante.'));
  }
});


// ------------------------------------------------------------
// Dados do negócio
//
// É o que aparece no orçamento que vai para o cliente. O CNPJ é o
// mais pedido: empresa costuma precisar dele para poder pagar.
// ------------------------------------------------------------

$('#aj-negocio').addEventListener('click', () => {
  if (estado.perfil.papel !== 'dono') {
    return avisarNaFolha('Área do dono',
      'Só o dono do negócio pode alterar estes dados.');
  }

  fecharFolha('folha-ajustes');
  const n = estado.negocio || {};
  $('#ng-nome').value      = n.nome || '';
  $('#ng-cnpj').value      = n.cnpj || '';
  $('#ng-instagram').value = n.instagram || '';
  $('#ng-site').value      = n.site || '';
  $('#ng-endereco').value  = n.endereco || '';
  $('#ng-email').value     = n.email || '';
  limparAviso('aviso-negocio');
  abrirFolha('folha-negocio');
});

// Escreve o CNPJ do jeito que a pessoa reconhece enquanto ela digita.
$('#ng-cnpj').addEventListener('input', () => {
  const campo = $('#ng-cnpj');
  const d = campo.value.replace(/\D/g, '').slice(0, 14);
  let saida = d;
  if (d.length > 2)  saida = d.slice(0,2) + '.' + d.slice(2);
  if (d.length > 5)  saida = d.slice(0,2) + '.' + d.slice(2,5) + '.' + d.slice(5);
  if (d.length > 8)  saida = d.slice(0,2) + '.' + d.slice(2,5) + '.' + d.slice(5,8) + '/' + d.slice(8);
  if (d.length > 12) saida = d.slice(0,2) + '.' + d.slice(2,5) + '.' + d.slice(5,8) + '/' +
                             d.slice(8,12) + '-' + d.slice(12);
  campo.value = saida;
});

// O Instagram é guardado sem @ e sem endereço, só o nome do perfil —
// assim o rodapé do PDF fica limpo e o link sempre funciona.
$('#ng-instagram').addEventListener('input', () => {
  const campo = $('#ng-instagram');
  campo.value = campo.value.trim()
    .replace(/^@+/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/.*$/, '')
    .replace(/[^A-Za-z0-9._]/g, '');
});

$('#form-negocio').addEventListener('submit', async (e) => {
  e.preventDefault();

  const cnpj = $('#ng-cnpj').value.trim();
  const soDigitos = cnpj.replace(/\D/g, '');
  if (cnpj && soDigitos.length !== 14) {
    return aviso('aviso-negocio',
      'O CNPJ tem 14 números. Você digitou ' + soDigitos.length + '. Confira ou deixe vazio.');
  }

  const botao = $('#btn-salvar-negocio');
  ocupado(botao, true, 'Salvando…');

  const vazio = (id) => $('#' + id).value.trim() || null;
  const dados = {
    nome:      vazio('ng-nome'),
    cnpj:      cnpj || null,
    instagram: vazio('ng-instagram'),
    site:      vazio('ng-site'),
    endereco:  vazio('ng-endereco'),
    email:     vazio('ng-email')
  };

  const { error } = await sb.from('negocios').update(dados).eq('id', estado.perfil.negocio_id);

  ocupado(botao, false);

  if (error) {
    // A migração 12 ainda não rodou: as colunas novas não existem.
    if ((error.message || '').includes('column') || error.code === 'PGRST204') {
      return aviso('aviso-negocio',
        'O banco ainda não tem os campos novos. Rode a migração 12.');
    }
    return aviso('aviso-negocio', mensagemDeErro(error));
  }

  fecharFolha('folha-negocio');
  await recarregar();
  avisarNaFolha('Salvo', 'Estes dados já vão aparecer no próximo orçamento que você mandar.');
});


// ------------------------------------------------------------
// Parcelas
//
// "R$ 1.560 no cartão em 3x" é uma informação diferente de
// "R$ 1.560". Quem recebe precisa dela para decidir — e quem cobra
// precisa dela para saber o que vai entrar por mês.
// ------------------------------------------------------------

// Só faz sentido parcelar no cartão ou quando ela diz "parcelado".
function pagamentoParcelavel(forma) {
  return forma === 'Cartão' || forma === 'Parcelado';
}

function encherParcelas(seletor, escolhida) {
  const sel = $(seletor);
  if (!sel) return;
  let h = '';
  for (let i = 1; i <= 12; i++) {
    h += '<option value="' + i + '"' + (Number(escolhida) === i ? ' selected' : '') + '>' +
         (i === 1 ? 'À vista (1x)' : i + 'x') + '</option>';
  }
  sel.innerHTML = h;
}

// Mostra quanto fica cada parcela, para ela conferir antes de mandar.
function mostrarValorDaParcela(seletorDica, valor, parcelas) {
  const el = $(seletorDica);
  if (!el) return;
  const n = Number(parcelas || 1);
  if (!valor || n <= 1) { el.textContent = ''; return; }
  el.textContent = n + ' parcelas de ' + moeda(valor / n);
}

// Mesmo cuidado do orcamento: o clique no botao vem antes da marcacao.
function atualizarParcelasServico(formaClicada) {
  const forma = formaClicada !== undefined ? formaClicada : valorPastilha('#sv-pagamento');
  const mostra = pagamentoParcelavel(forma) && estado.temParcelas;
  $('#campo-parcelas').style.display = mostra ? 'block' : 'none';
  if (mostra) mostrarValorDaParcela('#sv-parcela-valor', lerDinheiro('#sv-valor'), $('#sv-parcelas').value);
}

$$('#sv-pagamento button').forEach(b =>
  b.addEventListener('click', () => atualizarParcelasServico(b.dataset.valor)));
// Envolvido numa arrow de proposito: passar a funcao direto faz o
// navegador mandar o EVENTO como primeiro argumento — que aqui seria
// lido como 'forma de pagamento' e escondia o campo sem motivo.
$('#sv-parcelas')?.addEventListener('change', () => atualizarParcelasServico());
$('#sv-valor')?.addEventListener('input',  () => atualizarParcelasServico());


// ------------------------------------------------------------
// Categorias de entrada e saída
//
// Era campo de texto livre. A pessoa escrevia "esmalte", "Esmalte",
// "esmaltes" e "esmalte gel" — quatro fatias diferentes no gráfico,
// para a mesma coisa. Lista escolhida faz o dado nascer limpo.
//
// "Outro" continua existindo: lista fechada demais faz a pessoa
// escolher qualquer coisa só para passar da tela, e aí o dado mente.
// ------------------------------------------------------------

const CATEGORIAS_SAIDA = {
  comum: ['Material de trabalho', 'Transporte e combustível', 'Alimentação',
          'Ferramenta ou equipamento', 'Telefone e internet', 'Ajudante ou parceiro',
          'Aluguel', 'Água e luz', 'Imposto ou taxa', 'Saúde', 'Casa e família'],

  // Cada profissão gasta com coisas diferentes. Mostrar o que ela
  // realmente compra evita que "Outro" vire a resposta padrão.
  'Manicure e pedicure': ['Esmalte', 'Alicate e lixa', 'Acetona e algodão', 'Gel e acrílico'],
  'Cabeleireiro(a)':     ['Tinta e coloração', 'Shampoo e produtos', 'Tesoura e máquina'],
  'Barbeiro':            ['Lâmina e navalha', 'Máquina e pente', 'Produtos de barba'],
  'Esteticista':         ['Cosméticos', 'Cera e descartáveis'],
  'Podólogo(a)':         ['Instrumentos', 'Descartáveis', 'Medicação'],
  'Maquiador(a)':        ['Maquiagem', 'Pincéis e esponjas'],
  'Diarista':            ['Produto de limpeza', 'Pano e vassoura'],
  'Costureira':          ['Tecido', 'Linha e aviamento', 'Agulha e zíper'],
  'Pedreiro':            ['Cimento e areia', 'Tijolo e bloco', 'Ferramenta'],
  'Pintor':              ['Tinta', 'Massa corrida', 'Rolo, pincel e lixa', 'Fita e lona'],
  'Eletricista':         ['Fio e cabo', 'Disjuntor e tomada', 'Ferramenta'],
  'Encanador':           ['Cano e conexão', 'Registro e torneira', 'Veda rosca'],
  'Marceneiro':          ['Madeira e MDF', 'Parafuso e dobradiça', 'Verniz e cola'],
  'Gesseiro':            ['Gesso', 'Perfil e parafuso'],
  'Serralheiro':         ['Ferro e metalon', 'Eletrodo e disco'],
  'Jardineiro':          ['Muda e semente', 'Adubo e terra', 'Combustível de máquina'],
  'Mecânico':            ['Peça', 'Óleo e filtro', 'Ferramenta'],
  'Motorista':           ['Combustível', 'Manutenção do veículo', 'Pedágio']
};

const CATEGORIAS_ENTRADA = ['Serviço feito', 'Sinal ou entrada', 'Venda de produto',
                            'Gorjeta', 'Recebimento atrasado'];

function categoriasPara(tipo) {
  if (tipo === 'entrada') return CATEGORIAS_ENTRADA;
  const daAtividade = CATEGORIAS_SAIDA[estado.negocio?.tipo_atividade] || [];
  return daAtividade.concat(CATEGORIAS_SAIDA.comum);
}

function encherCategorias(tipo, escolhida) {
  const lista = categoriasPara(tipo);
  const conhecida = !escolhida || lista.includes(escolhida);

  let h = '<option value="">Escolha…</option>';
  lista.forEach(c => {
    h += '<option value="' + escapar(c) + '"' +
         (c === escolhida ? ' selected' : '') + '>' + escapar(c) + '</option>';
  });
  // Categoria antiga, escrita à mão antes desta lista existir: mantém,
  // para o histórico dela não mudar de nome sozinho.
  if (escolhida && !conhecida) {
    h += '<option value="' + escapar(escolhida) + '" selected>' + escapar(escolhida) + '</option>';
  }
  h += '<option value="__outro__">Outro…</option>';

  $('#lc-categoria').innerHTML = h;
  atualizarCampoOutraCategoria();
}

function atualizarCampoOutraCategoria() {
  const ehOutro = $('#lc-categoria').value === '__outro__';
  $('#campo-outra-categoria').style.display = ehOutro ? 'block' : 'none';
  if (ehOutro) $('#lc-categoria-outra').focus();
}

$('#lc-categoria').addEventListener('change', atualizarCampoOutraCategoria);

// O que vai para o banco: o nome escolhido, ou o que ela escreveu.
function categoriaEscolhida() {
  const v = $('#lc-categoria').value;
  if (v === '__outro__') return $('#lc-categoria-outra').value.trim() || null;
  return v || null;
}


// ------------------------------------------------------------
// Para onde vai o dinheiro
//
// Barras horizontais, não pizza: em tela de celular, sob sol forte,
// comparar comprimento é fácil e comparar ângulo é difícil. E barra
// deixa o valor escrito ao lado, que é o que ela quer saber.
// ------------------------------------------------------------

function gastosPorCategoria(mesesAtras = 0) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() - mesesAtras);
  const de  = dataLocal(base);
  const ate = dataLocal(new Date(base.getFullYear(), base.getMonth() + 1, 0));

  const saidas = (estado.lancamentosTotal || [])
    .filter(l => l.tipo === 'despesa' && l.data >= de && l.data <= ate);

  const porCategoria = {};
  saidas.forEach(l => {
    const nome = (l.categoria || '').trim() || 'Sem categoria';
    porCategoria[nome] = (porCategoria[nome] || 0) + Number(l.valor || 0);
  });

  const linhas = Object.keys(porCategoria)
    .map(nome => ({ nome, total: porCategoria[nome] }))
    .sort((a, b) => b.total - a.total);

  return {
    linhas,
    total: linhas.reduce((s, l) => s + l.total, 0),
    mes: nomeDoMes(base),
    quantos: saidas.length
  };
}

// Cores da paleta da Loen, na ordem. A maior fatia fica com o preto.
// Vizinhas contrastam entre si, para duas fatias não se confundirem.
const CORES_GRAFICO = ['#111111', '#F35204', '#5B3FC4', '#95BFF1',
                       '#17593A', '#C3ABFF', '#9A9A9A'];

function desenharGraficoDeGastos() {
  const g = gastosPorCategoria(estado.mesDoGrafico || 0);

  let h = '<div class="linha-topo" style="margin-bottom:14px">' +
          '<button class="voltar" data-fecha="folha-gastos" type="button">‹</button>' +
          '<h3>Para onde vai o dinheiro</h3></div>';

  h += '<div class="pastilhas" id="mes-grafico">' +
       [[0, 'Este mês'], [1, 'Mês passado'], [2, 'Dois meses atrás']]
         .map(([v, rot]) => '<button type="button" data-valor="' + v + '"' +
              ((estado.mesDoGrafico || 0) === v ? ' class="marcada"' : '') + '>' + rot + '</button>')
         .join('') + '</div>';

  if (!g.linhas.length) {
    h += '<div class="vazio"><strong>Nada em ' + escapar(g.mes) + '</strong>' +
         'Quando você registrar saídas, elas aparecem aqui separadas por tipo.</div>';
    $('#conteudo-gastos').innerHTML = h;
    ligarMesDoGrafico();
    return;
  }

  h += '<div class="cartao" style="margin-top:14px"><p class="rotulo">' +
       escapar(g.mes) + ' · ' + g.quantos + ' saída(s)</p>' +
       '<p class="valor verm">' + moeda(g.total) + '</p></div>';

  const maior = g.linhas[0].total;

  h += '<div class="barras">';
  g.linhas.forEach((l, i) => {
    const pct = maior > 0 ? (l.total / maior) * 100 : 0;
    const doTotal = g.total > 0 ? Math.round((l.total / g.total) * 100) : 0;
    const cor = CORES_GRAFICO[i % CORES_GRAFICO.length];

    h += '<div class="barra-linha">' +
         '<div class="barra-topo">' +
         '<span class="barra-nome">' + escapar(l.nome) + '</span>' +
         '<span class="barra-valor">' + moeda(l.total) + '</span></div>' +
         '<div class="barra-trilho">' +
         '<i style="width:' + pct.toFixed(1) + '%;background:' + cor + '"></i></div>' +
         '<span class="barra-pct">' + doTotal + '% do que saiu</span>' +
         '</div>';
  });
  h += '</div>';

  // A frase que faz o gráfico virar decisão, em vez de enfeite.
  const campea = g.linhas[0];
  if (g.linhas.length > 1) {
    h += '<p class="rotulo" style="margin:16px 2px 0">Seu maior gasto em ' +
         escapar(g.mes.toLowerCase()) + ' foi <strong>' + escapar(campea.nome) +
         '</strong>: ' + moeda(campea.total) + '. É aí que dá para economizar mais.</p>';
  }

  $('#conteudo-gastos').innerHTML = h;
  ligarMesDoGrafico();
}

function ligarMesDoGrafico() {
  $$('#mes-grafico button').forEach(b =>
    b.addEventListener('click', () => {
      estado.mesDoGrafico = Number(b.dataset.valor);
      desenharGraficoDeGastos();
    }));
  $$('#conteudo-gastos [data-fecha]').forEach(b =>
    b.addEventListener('click', () => fecharFolha(b.dataset.fecha)));
}

function abrirGraficoDeGastos() {
  estado.mesDoGrafico = 0;
  desenharGraficoDeGastos();
  abrirFolha('folha-gastos');
  registrar('viu_grafico_gastos');
}
