// ============================================================
// LOEN SOLUÇÕES — Calculadora de orçamento
//
// A CONTA (não mexer sem falar com o Leandro):
//
//   custos = materiais + trabalho + deslocamento + outros
//   ganho  = custos × (percentual / 100)
//   total  = custos + ganho
//
// Isto é ACRÉSCIMO SOBRE O CUSTO, não margem. R$ 1.600 com 20%
// dá R$ 1.920 — e não R$ 2.000, que seria margem de 20%.
//
// A palavra "margem" não aparece em tela nenhuma. O rótulo é
// "Quanto quer ganhar acima dos custos?". No banco a coluna
// já se chama tipo='margem' e isso fica como está.
// ============================================================

// Cada linha de material ou "outro custo" que a pessoa adiciona.
let proximaLinha = 0;

function linhaItem(area, descricaoPadrao) {
  const n = proximaLinha++;
  const div = document.createElement('div');
  div.className = 'linha-item';
  div.innerHTML =
    '<input type="text" class="desc" placeholder="' + descricaoPadrao + '">' +
    '<input type="text" class="qtd" data-dinheiro inputmode="decimal" placeholder="1">' +
    '<input type="text" class="unit" data-dinheiro inputmode="decimal" placeholder="R$">' +
    '<button type="button" class="tirar" aria-label="Remover">×</button>';

  div.querySelector('.tirar').addEventListener('click', () => {
    div.remove();
    recalcular();
  });
  // Estas linhas nascem depois que a pagina carregou, entao o filtro de
  // digitacao precisa ser ligado aqui — o $() do app.js ja tinha passado.
  div.querySelectorAll('input[data-dinheiro]').forEach(filtrarCampoDinheiro);
  div.querySelectorAll('input').forEach(i => i.addEventListener('input', recalcular));

  $('#' + area).appendChild(div);
  return div;
}

// Lê as linhas de uma área e devolve os itens com subtotal.
function lerLinhas(area, tipo) {
  return $$('#' + area + ' .linha-item').map((l, i) => {
    const qtd  = lerDinheiroPositivo(l.querySelector('.qtd'));
    const unit = lerDinheiroPositivo(l.querySelector('.unit'));
    return {
      tipo,
      descricao: l.querySelector('.desc').value.trim() || null,
      quantidade: qtd === null ? 1 : qtd,
      valor_unitario: unit === null ? 0 : unit,
      ordem: i,
      subtotal: (qtd === null ? 1 : qtd) * (unit === null ? 0 : unit)
    };
  }).filter(x => x.subtotal > 0 || x.descricao);
}

function percentualEscolhido() {
  const v = valorPastilha('#ca-ganho');
  if (v === 'outro') {
    const p = lerDinheiroPositivo('#ca-ganho-outro');
    return p === null ? 0 : p;
  }
  return Number(v || 0);
}

// O coração: faz a conta e devolve tudo aberto, para a tela mostrar.
function contaDaCalculadora() {
  const materiais = lerLinhas('ca-materiais', 'material');
  const outros    = lerLinhas('ca-outros', 'outro');

  const qtdTrab   = lerDinheiroPositivo('#ca-qtd-trabalho') || 0;
  const valorTrab = lerDinheiroPositivo('#ca-valor-trabalho') || 0;
  const trabalho  = qtdTrab * valorTrab;

  const deslocamento = lerDinheiroPositivo('#ca-deslocamento') || 0;

  const somaMateriais = materiais.reduce((s, m) => s + m.subtotal, 0);
  const somaOutros    = outros.reduce((s, o) => s + o.subtotal, 0);

  const custos = somaMateriais + trabalho + deslocamento + somaOutros;
  const pct    = percentualEscolhido();
  const ganho  = custos * (pct / 100);

  return {
    materiais, outros,
    somaMateriais, somaOutros, trabalho, deslocamento,
    qtdTrab, valorTrab, unidade: valorPastilha('#ca-unidade') || 'dia',
    custos, pct, ganho,
    total: custos + ganho
  };
}

// Mostra a conta aberta enquanto ela preenche, em vez de só o resultado.
function recalcular() {
  const c = contaDaCalculadora();

  const linhas = [];
  if (c.somaMateriais) linhas.push(['Material', c.somaMateriais]);
  if (c.trabalho) {
    const comoConta = c.qtdTrab + (c.unidade === 'dia' ? ' dia(s)' : ' hora(s)') +
                      ' × ' + moeda(c.valorTrab);
    linhas.push(['Seu trabalho', c.trabalho, comoConta]);
  }
  if (c.deslocamento) linhas.push(['Deslocamento', c.deslocamento]);
  if (c.somaOutros)   linhas.push(['Outros custos', c.somaOutros]);

  let h = '';
  if (!linhas.length) {
    h = '<p class="rotulo" style="margin:0">Vá preenchendo acima. A conta aparece aqui.</p>';
  } else {
    h = linhas.map(l =>
      '<div class="linha-conta"><span>' + l[0] +
      (l[2] ? '<small>' + escapar(l[2]) + '</small>' : '') +
      '</span><span>' + moeda(l[1]) + '</span></div>').join('');

    h += '<div class="linha-conta soma"><span>Custo total</span><span>' +
         moeda(c.custos) + '</span></div>';

    if (c.pct > 0) {
      h += '<div class="linha-conta"><span>Seu ganho' +
           '<small>' + c.pct + '% acima dos custos</small></span><span>' +
           moeda(c.ganho) + '</span></div>';
    }

    h += '<div class="linha-conta total"><span>Total sugerido</span><span>' +
         moeda(c.total) + '</span></div>';
  }

  $('#ca-conta').innerHTML = h;
  $('#ca-subtotal').textContent = moeda(c.total);

  // O campo do total só é preenchido sozinho enquanto a pessoa não mexeu
  // nele. Depois que ela arredonda, o número dela manda.
  if (!estado.totalMexido) escreverDinheiro('#ca-total', Number(c.total.toFixed(2)));
}


// ------------------------------------------------------------
// Abrir
// ------------------------------------------------------------

function abrirCalculadora() {
  if (!estado.clientes.length) {
    estado.voltarParaOrcamento = true;
    avisarNaFolha('Falta um cliente',
      'Para fazer um orçamento você precisa de um cliente cadastrado. Vou abrir o cadastro.');
    return abrirFormCliente();
  }

  estado.totalMexido = false;
  estado.calculadoraEditando = null;
  $('#titulo-calculadora').textContent = 'Calcular o preço';
  $('#btn-salvar-calculadora').textContent = 'Gerar';

  $('#ca-cliente').innerHTML = estado.clientes
    .map(c => '<option value="' + c.id + '">' + escapar(c.nome) + '</option>').join('');

  $('#ca-titulo').value = '';
  $('#ca-qtd-trabalho').value = '';
  $('#ca-valor-trabalho').value = '';
  $('#ca-deslocamento').value = '';
  $('#ca-prazo').value = '';
  $('#ca-ganho-outro').value = '';
  $('#ca-campo-outro-ganho').style.display = 'none';

  const d = new Date();
  d.setDate(d.getDate() + 15);
  $('#ca-validade').value = dataLocal(d);

  marcarPastilha('#ca-unidade', 'dia');
  marcarPastilha('#ca-ganho', '20');
  $('#ca-rotulo-diaria').textContent = 'Valor da diária';

  // Começa com uma linha de material, para ela ver o formato.
  $('#ca-materiais').innerHTML = '';
  $('#ca-outros').innerHTML = '';
  linhaItem('ca-materiais', 'tinta, massa, lixa…');

  limparAviso('aviso-calculadora');
  recalcular();
  abrirFolha('folha-calculadora');
}

$('#ca-add-material').addEventListener('click', () => linhaItem('ca-materiais', 'tinta, massa, lixa…'));
$('#ca-add-outro').addEventListener('click', () => linhaItem('ca-outros', 'aluguel de andaime, ajudante…'));

['#ca-qtd-trabalho', '#ca-valor-trabalho', '#ca-deslocamento', '#ca-ganho-outro']
  .forEach(s => $(s).addEventListener('input', recalcular));

$('#ca-total').addEventListener('input', () => { estado.totalMexido = true; });

$$('#ca-unidade button').forEach(b =>
  b.addEventListener('click', () => {
    $('#ca-rotulo-diaria').textContent =
      b.dataset.valor === 'dia' ? 'Valor da diária' : 'Valor da hora';
    recalcular();
  }));

$$('#ca-ganho button').forEach(b =>
  b.addEventListener('click', () => {
    const ehOutro = b.dataset.valor === 'outro';
    $('#ca-campo-outro-ganho').style.display = ehOutro ? 'block' : 'none';
    if (ehOutro) $('#ca-ganho-outro').focus();
    recalcular();
  }));


// ------------------------------------------------------------
// Gerar
// ------------------------------------------------------------

$('#btn-salvar-calculadora').addEventListener('click', async () => {
  const titulo = $('#ca-titulo').value.trim();
  if (!titulo) return aviso('aviso-calculadora', 'Escreva o que é o serviço.');

  const c = contaDaCalculadora();
  const total = lerDinheiroPositivo('#ca-total');

  if (total === null || total <= 0) {
    return aviso('aviso-calculadora', 'A conta deu zero. Preencha os custos acima.');
  }

  const botao = $('#btn-salvar-calculadora');
  ocupado(botao, true, 'Gerando…');

  const editando = estado.calculadoraEditando;

  const campos = {
    titulo:   titulo,
    valor:    total,
    prazo:    $('#ca-prazo').value.trim() || null,
    validade: $('#ca-validade').value || null
  };

  // Editando: troca os campos e REFAZ os itens, para a conta guardada
  // continuar batendo com o que está na tela.
  if (editando) {
    const up = await sb.from('orcamentos').update(campos).eq('id', editando.id);
    if (up.error) { ocupado(botao, false); return aviso('aviso-calculadora', mensagemDeErro(up.error)); }
    await sb.from('orcamento_itens').delete().eq('orcamento_id', editando.id);
    await gravarItens(editando.id, c);
    ocupado(botao, false);
    estado.calculadoraEditando = null;
    fecharFolha('folha-calculadora');
    await recarregar();
    abrirAba('orcamentos');
    return abrirOrcamento(editando.id);
  }

  const { data: orc, error } = await sb.from('orcamentos').insert({
    negocio_id: estado.perfil.negocio_id,
    cliente_id: $('#ca-cliente').value,
    criado_por: estado.perfil.id,
    origem:    'calculadora',
    titulo:    titulo,
    valor:     total,
    prazo:     $('#ca-prazo').value.trim() || null,
    validade:  $('#ca-validade').value || null,
    status:    'rascunho'
  }).select().single();

  if (error) { ocupado(botao, false); return aviso('aviso-calculadora', mensagemDeErro(error)); }

  const { error: erroItens } = await gravarItens(orc.id, c);

  ocupado(botao, false);
  if (erroItens) return aviso('aviso-calculadora', mensagemDeErro(erroItens));

  registrar('usou_calculadora', { itens: itens.length, pct: c.pct });
  fecharFolha('folha-calculadora');
  await recarregar();
  abrirAba('orcamentos');
  abrirOrcamento(orc.id);
});


// Grava a conta inteira em orcamento_itens. Serve para criar e para
// editar — assim a conta guardada nunca fica diferente da tela.
//
// Guarda mesmo quando ela arredonda o total na mão: é isso que deixa
// duplicar o orçamento e reabrir a conta depois.
async function gravarItens(orcamentoId, c) {
  const itens = c.materiais.concat(c.outros).map(i => ({
    orcamento_id: orcamentoId,
    tipo: i.tipo,
    descricao: i.descricao,
    quantidade: i.quantidade,
    valor_unitario: i.valor_unitario,
    ordem: i.ordem
  }));

  if (c.trabalho > 0) {
    itens.push({
      orcamento_id: orcamentoId, tipo: 'trabalho',
      descricao: c.unidade === 'dia' ? 'Diária' : 'Hora de trabalho',
      quantidade: c.qtdTrab, valor_unitario: c.valorTrab, ordem: 90
    });
  }
  if (c.deslocamento > 0) {
    itens.push({
      orcamento_id: orcamentoId, tipo: 'deslocamento', descricao: 'Deslocamento',
      quantidade: 1, valor_unitario: c.deslocamento, ordem: 91
    });
  }
  // O percentual vai em quantidade, como combinado no escopo.
  itens.push({
    orcamento_id: orcamentoId, tipo: 'margem', descricao: 'Ganho acima dos custos',
    quantidade: c.pct, valor_unitario: c.ganho, ordem: 99
  });

  return await sb.from('orcamento_itens').insert(itens);
}


// ------------------------------------------------------------
// Editar a conta de um orçamento já criado
//
// Sem isto, orçamento feito na calculadora ficava com os itens
// travados: se o cliente pedisse mais uma coisa, ela refazia tudo
// do zero. Agora a conta volta como estava e ela só acrescenta.
// ------------------------------------------------------------

async function abrirCalculadoraParaEditar(orc) {
  const itens = await itensDoOrcamento(orc.id);
  if (!itens.length) {
    return avisarNaFolha('Sem conta guardada',
      'Este orçamento não tem a conta detalhada. Use "Editar" para mudar o valor direto.');
  }

  abrirCalculadora();
  estado.calculadoraEditando = orc;
  estado.totalMexido = true;   // o valor que ela já tinha manda

  $('#titulo-calculadora').textContent = 'Editar a conta';
  $('#btn-salvar-calculadora').textContent = 'Salvar';

  // Cliente e título voltam como estavam
  $('#ca-cliente').value = orc.cliente_id;
  $('#ca-titulo').value  = orc.titulo || '';
  $('#ca-prazo').value   = orc.prazo || '';
  if (orc.validade) $('#ca-validade').value = orc.validade.slice(0, 10);

  // Recria as linhas de material e de outros custos
  $('#ca-materiais').innerHTML = '';
  $('#ca-outros').innerHTML = '';

  const porTipo = (t) => itens.filter(i => i.tipo === t);

  const repor = (area, lista, padrao) => {
    if (!lista.length) { linhaItem(area, padrao); return; }
    lista.forEach(i => {
      const linha = linhaItem(area, padrao);
      linha.querySelector('.desc').value = i.descricao || '';
      linha.querySelector('.qtd').value  = String(i.quantidade ?? 1).replace('.', ',');
      linha.querySelector('.unit').value = String(i.valor_unitario ?? 0).replace('.', ',');
    });
  };

  repor('ca-materiais', porTipo('material'), 'tinta, massa, lixa…');
  repor('ca-outros',    porTipo('outro'),    'aluguel de andaime, ajudante…');

  const trab = porTipo('trabalho')[0];
  if (trab) {
    $('#ca-qtd-trabalho').value   = String(trab.quantidade ?? '').replace('.', ',');
    $('#ca-valor-trabalho').value = String(trab.valor_unitario ?? '').replace('.', ',');
    const porHora = (trab.descricao || '').toLowerCase().includes('hora');
    marcarPastilha('#ca-unidade', porHora ? 'hora' : 'dia');
    $('#ca-rotulo-diaria').textContent = porHora ? 'Valor da hora' : 'Valor da diária';
  }

  const desl = porTipo('deslocamento')[0];
  if (desl) $('#ca-deslocamento').value = String(desl.valor_unitario ?? '').replace('.', ',');

  // O percentual foi guardado em `quantidade` na linha do ganho.
  const ganho = porTipo('margem')[0];
  const pct = ganho ? Number(ganho.quantidade || 0) : 20;
  if ([10, 20, 30].includes(pct)) {
    marcarPastilha('#ca-ganho', String(pct));
    $('#ca-campo-outro-ganho').style.display = 'none';
  } else {
    marcarPastilha('#ca-ganho', 'outro');
    $('#ca-campo-outro-ganho').style.display = 'block';
    $('#ca-ganho-outro').value = String(pct).replace('.', ',');
  }

  recalcular();
  escreverDinheiro('#ca-total', orc.valor);
}
