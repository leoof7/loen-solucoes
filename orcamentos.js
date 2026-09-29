// ============================================================
// LOEN SOLUÇÕES — Orçamentos
//
// Etapa A: lista com filtros, orçamento rápido, detalhe e status.
// Etapa B (calculadora) e C (PDF e WhatsApp com anexo) vêm depois.
// Ver docs/bloco-orcamentos.md.
//
// A conta da calculadora é ACRÉSCIMO SOBRE O CUSTO, não margem.
// A palavra "margem" não aparece em tela nenhuma deste arquivo.
// ============================================================

const STATUS_ORC = {
  rascunho: { rotulo: 'Rascunho', classe: 'et-rascunho' },
  enviado:  { rotulo: 'Enviado',  classe: 'et-enviado'  },
  pensando: { rotulo: 'Pensando', classe: 'et-pensando' },
  aprovado: { rotulo: 'Aprovado', classe: 'et-pago'     },
  recusado: { rotulo: 'Recusado', classe: 'et-recusado' },
  vencido:  { rotulo: 'Vencido',  classe: 'et-vencido'  }
};

function diasDesde(quando) {
  if (!quando) return 0;
  return Math.floor((new Date() - new Date(quando)) / 86400000);
}

// Orçamento que passou da validade vira "vencido" sozinho, na tela e no
// banco. Sem isso a lista mostra como vivo algo que já morreu.
async function vencerOsVencidos() {
  const hj = hoje();
  const vencidos = (estado.orcamentos || []).filter(o =>
    o.validade && o.validade < hj && (o.status === 'enviado' || o.status === 'pensando'));

  if (!vencidos.length) return false;

  const { error } = await sb.from('orcamentos')
    .update({ status: 'vencido' })
    .in('id', vencidos.map(o => o.id));

  if (error) { console.error('Loen Soluções — vencer orçamentos:', error); return false; }
  vencidos.forEach(o => { o.status = 'vencido'; });
  return true;
}


// ------------------------------------------------------------
// Lista
// ------------------------------------------------------------

function desenharOrcamentos() {
  const lista = estado.orcamentos || [];

  if (!lista.length) {
    $('#aba-orcamentos').innerHTML =
      '<div class="vazio"><strong>Nenhum orçamento ainda</strong>' +
      'Toque no + para fazer o primeiro.</div>';
    return;
  }

  const f = estado.filtroOrcamentos || 'todos';
  const conta = (s) => lista.filter(o => o.status === s).length;

  const abas = [['todos', 'Todos', lista.length]].concat(
    Object.keys(STATUS_ORC)
      .map(s => [s, STATUS_ORC[s].rotulo, conta(s)])
      .filter(([s, , n]) => n > 0 || s === f));

  let h = '<div class="pastilhas rolante" id="filtro-orcamentos">' +
          abas.map(([v, rot, n]) =>
            '<button type="button" data-valor="' + v + '"' + (v === f ? ' class="marcada"' : '') +
            '>' + rot + ' <span class="conta">' + n + '</span></button>').join('') +
          '</div>';

  // Enviado há 3 dias ou mais e ninguém respondeu: vale um empurrãozinho.
  const parados = lista.filter(o =>
    o.status === 'enviado' && o.enviado_em && diasDesde(o.enviado_em) >= 3);

  if (parados.length && f === 'todos') {
    const o = parados[0];
    const c = estado.clientes.find(x => x.id === o.cliente_id) || {};
    h += '<div class="cartao lembrete">' +
         '<p class="rotulo">Sem resposta</p>' +
         '<p style="margin:0 0 12px">O orçamento de <strong>' + escapar(o.titulo) +
         '</strong> foi para ' + escapar(c.nome || 'o cliente') + ' há ' +
         diasDesde(o.enviado_em) + ' dias. Quer perguntar?</p>' +
         (c.telefone
           ? '<button class="btn btn-verde" data-cobrar-orc="' + o.id + '">Perguntar no WhatsApp</button>'
           : '<p class="rotulo">Este cliente não tem telefone cadastrado.</p>') +
         '</div>';
  }

  const filtrada = f === 'todos' ? lista : lista.filter(o => o.status === f);

  h += filtrada.length
     ? filtrada.map(linhaOrcamento).join('')
     : '<div class="vazio"><strong>Nada aqui</strong>Nenhum orçamento com esse filtro.</div>';

  $('#aba-orcamentos').innerHTML = h;

  $$('#filtro-orcamentos button').forEach(b =>
    b.addEventListener('click', () => {
      estado.filtroOrcamentos = b.dataset.valor;
      desenharOrcamentos();
    }));

  $$('#aba-orcamentos [data-orcamento]').forEach(b =>
    b.addEventListener('click', () => abrirOrcamento(b.dataset.orcamento)));

  $$('#aba-orcamentos [data-status]').forEach(b =>
    b.addEventListener('click', (e) => { e.stopPropagation(); escolherStatus(b.dataset.status); }));

  $$('#aba-orcamentos [data-cobrar-orc]').forEach(b =>
    b.addEventListener('click', () => perguntarNoWhatsApp(b.dataset.cobrarOrc)));
}

// A etiqueta de status e um BOTAO dentro da linha. Tocar nela troca o
// status na hora, sem abrir nada — e a pessoa esta olhando justamente
// para ela quando lembra que o cliente respondeu.
// Tocar no resto da linha abre o detalhe, como antes.
// "Aprovado pelo cliente em 29/09/2026 às 14:32" — só quando foi o
// CLIENTE que respondeu pelo link. Se quem usa o app mudar o status à
// mão depois, a resposta do cliente continua registrada e aparecendo.
function respostaDoCliente(o) {
  if (!o.respondido_em || !o.resposta_cliente) return '';
  const d = new Date(o.respondido_em);
  const quando = d.toLocaleDateString('pt-BR') + ' às ' +
                 d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (o.resposta_cliente === 'aprovado' ? 'Aprovado' : 'Recusado') +
         ' pelo cliente em ' + quando;
}

function linhaOrcamento(o) {
  const s = STATUS_ORC[o.status] || STATUS_ORC.rascunho;
  const c = estado.clientes.find(x => x.id === o.cliente_id) || {};
  const resposta = respostaDoCliente(o);
  return '<div class="item linha-orcamento">' +
         '<button class="corpo" data-orcamento="' + o.id + '">' +
         '<span class="titulo">' + escapar(c.nome || 'Sem cliente') + '</span>' +
         '<span class="sub">' + escapar(o.titulo || '') + ' · ' + dataCurta(o.criado_em) + '</span>' +
         (resposta ? '<span class="sub resposta-cliente ' + o.resposta_cliente + '">' + resposta + '</span>' : '') +
         '</button>' +
         '<div class="direita">' +
         '<span class="dinheiro">' + moeda(o.valor) + '</span>' +
         '<button class="etiqueta toque ' + s.classe + '" data-status="' + o.id + '">' +
         s.rotulo + '</button>' +
         '</div></div>';
}


// ------------------------------------------------------------
// Criar e editar
// ------------------------------------------------------------

$('#novo-orcamento').addEventListener('click', () => {
  fecharFolha('folha-novo');
  abrirFolha('folha-tipo-orcamento');
});

$('#orc-rapido').addEventListener('click', () => {
  fecharFolha('folha-tipo-orcamento');
  abrirFormOrcamento();
});

$('#orc-calculadora').addEventListener('click', () => {
  fecharFolha('folha-tipo-orcamento');
  abrirCalculadora();
});

$('#or-novo-cliente').addEventListener('click', () => {
  estado.voltarParaOrcamento = true;
  fecharFolha('folha-orcamento');
  abrirFormCliente();
});

function abrirFormOrcamento(orc) {
  if (!estado.clientes.length) {
    estado.voltarParaOrcamento = true;
    avisarNaFolha('Falta um cliente',
      'Para fazer um orçamento você precisa de um cliente cadastrado. Vou abrir o cadastro.');
    return abrirFormCliente();
  }

  estado.orcamentoEditando = orc || null;

  $('#or-cliente').innerHTML = estado.clientes
    .map(c => '<option value="' + c.id + '"' +
              (orc && c.id === orc.cliente_id ? ' selected' : '') + '>' +
              escapar(c.nome) + '</option>').join('');

  $('#titulo-orcamento').textContent = orc ? 'Editar orçamento' : 'Novo orçamento';
  $('#or-titulo').value     = orc ? (orc.titulo || '') : '';
  $('#or-descricao').value  = orc ? (orc.descricao || '') : '';
  escreverDinheiro('#or-valor', orc ? orc.valor : null);
  $('#or-prazo').value      = orc ? (orc.prazo || '') : '';
  $('#or-endereco').value   = orc ? (orc.endereco || '') : '';
  $('#or-referencia').value = orc ? (orc.referencia || '') : '';

  // Validade padrão: 15 dias a partir de hoje.
  if (orc && orc.validade) {
    $('#or-validade').value = orc.validade.slice(0, 10);
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    $('#or-validade').value = dataLocal(d);
  }

  // Acerta o campo de parcelas JA AO ABRIR. Antes ele so aparecia
  // depois de mexer no select — quem escolhia Cartao e salvava direto
  // nunca via em quantas vezes ia parcelar.
  marcarPastilha('#or-pagamento', orc ? (orc.forma_pagamento || '') : '');
  encherParcelas('#or-parcelas', orc ? (orc.parcelas || 1) : 1);
  atualizarParcelasOrcamento();

  limparAviso('aviso-orcamento');
  abrirFolha('folha-orcamento');
}

$('#form-orcamento').addEventListener('submit', async (e) => {
  e.preventDefault();

  const valor = lerDinheiro('#or-valor');
  if (valor === null || valor <= 0) {
    return aviso('aviso-orcamento', 'Escreva quanto você vai cobrar. Exemplo: 1.920,00');
  }

  const botao = $('#btn-salvar-orcamento');
  ocupado(botao, true, 'Salvando…');

  const dados = {
    negocio_id: estado.perfil.negocio_id,
    cliente_id: $('#or-cliente').value,
    criado_por: estado.perfil.id,
    origem:     'rapido',
    titulo:     $('#or-titulo').value.trim(),
    descricao:  $('#or-descricao').value.trim() || null,
    valor:      valor,
    prazo:      $('#or-prazo').value.trim() || null,
    validade:   $('#or-validade').value || null,
    endereco:   $('#or-endereco').value.trim() || null,
    referencia: $('#or-referencia').value.trim() || null
  };

  if (estado.temParcelas) {
    const forma = valorPastilha('#or-pagamento');
    dados.forma_pagamento = forma || null;
    dados.parcelas = pagamentoParcelavel(forma) ? (Number($('#or-parcelas').value) || 1) : null;
  }

  const editando = estado.orcamentoEditando;
  const { error } = editando
    ? await sb.from('orcamentos').update(dados).eq('id', editando.id)
    : await sb.from('orcamentos').insert(Object.assign({}, dados, { status: 'rascunho' }));

  ocupado(botao, false);
  if (error) return aviso('aviso-orcamento', mensagemDeErro(error));

  registrar(editando ? 'editou_orcamento' : 'criou_orcamento');
  fecharFolha('folha-orcamento');
  estado.orcamentoEditando = null;
  await recarregar();
  abrirAba('orcamentos');
});


// ------------------------------------------------------------
// Detalhe
// ------------------------------------------------------------

function abrirOrcamento(id) {
  const o = (estado.orcamentos || []).find(x => x.id === id);
  if (!o) return;
  estado.orcamentoAberto = o;

  const c = estado.clientes.find(x => x.id === o.cliente_id) || {};
  const s = STATUS_ORC[o.status] || STATUS_ORC.rascunho;

  let h = '<div class="cartao">' +
          '<p class="rotulo">' + escapar(c.nome || 'Sem cliente') + '</p>' +
          '<p class="valor" style="font-size:22px">' + escapar(o.titulo || '') + '</p>' +
          '<p class="valor verde" style="margin-top:10px">' + moeda(o.valor) + '</p>' +
          '<span class="etiqueta ' + s.classe + '" style="display:inline-block;margin-top:10px">' +
          s.rotulo + '</span>' +
          (respostaDoCliente(o)
            ? '<p class="resposta-cliente ' + o.resposta_cliente + '" style="margin:10px 0 0">' +
              respostaDoCliente(o) + '</p>'
            : '') +
          '</div>';

  if (o.descricao) {
    h += '<div class="cartao"><p class="rotulo">Detalhes</p><p style="margin:0">' +
         escapar(o.descricao).replace(/\n/g, '<br>') + '</p></div>';
  }

  const linhas = [];
  const pg = textoPagamento(o);
  if (pg)           linhas.push(['Pagamento', pg]);
  if (o.prazo)      linhas.push(['Prazo', o.prazo]);
  if (o.validade)   linhas.push(['Vale até', dataCurta(o.validade)]);
  if (o.endereco)   linhas.push(['Endereço', o.endereco]);
  if (o.referencia) linhas.push(['Referência', o.referencia]);

  if (linhas.length) {
    h += '<div class="cartao">' + linhas.map(function (par) {
      return '<p class="rotulo" style="margin:0 0 6px">' + par[0] + ': <strong>' +
             escapar(par[1]) + '</strong></p>';
    }).join('') + '</div>';
  }

  h += '<p class="secao-titulo">Em que pé está</p>';
  h += '<div class="pastilhas rolante" id="status-orcamento">' +
       Object.keys(STATUS_ORC).map(function (k) {
         return '<button type="button" data-valor="' + k + '"' +
                (k === o.status ? ' class="marcada"' : '') + '>' +
                STATUS_ORC[k].rotulo + '</button>';
       }).join('') + '</div>';

  h += '<p class="secao-titulo">O que fazer</p>';
  h += '<button class="btn btn-verde" id="orc-whats">Mandar o orçamento</button>';
  h += '<button class="btn btn-secundario" id="orc-pdf">Só baixar o PDF</button>';
  h += '<button class="btn btn-secundario" id="orc-link">Mandar link para o cliente aprovar</button>';
  if (o.status === 'aprovado' && !o.atendimento_id) {
    h += '<button class="btn btn-principal" id="orc-virar">Transformar em serviço</button>';
  }
  h += '<button class="btn btn-secundario" id="orc-editar">Editar</button>';
  if (o.origem === 'calculadora') {
    h += '<button class="btn btn-secundario" id="orc-editar-conta">Editar a conta do preço</button>';
  }
  h += '<button class="btn btn-secundario" id="orc-duplicar">Duplicar</button>';
  h += '<button class="btn btn-perigo" id="orc-apagar">Apagar orçamento</button>';

  $('#conteudo-ver-orcamento').innerHTML = h;
  limparAviso('aviso-ver-orcamento');
  abrirFolha('folha-ver-orcamento');

  $$('#status-orcamento button').forEach(b =>
    b.addEventListener('click', () => trocarStatus(o, b.dataset.valor)));

  $('#orc-editar').addEventListener('click', () => {
    fecharFolha('folha-ver-orcamento');
    abrirFormOrcamento(o);
  });

  $('#orc-whats').addEventListener('click', () => mandarOrcamentoNoWhatsApp(o, c));
  $('#orc-pdf').addEventListener('click', () => baixarPdf(o, c));
  $('#orc-link').addEventListener('click', () => mandarLinkDeAprovacao(o, c));

  $('#orc-duplicar').addEventListener('click', () => duplicarOrcamento(o));

  const ec = $('#orc-editar-conta');
  if (ec) ec.addEventListener('click', () => {
    fecharFolha('folha-ver-orcamento');
    abrirCalculadoraParaEditar(o);
  });

  const v = $('#orc-virar');
  if (v) v.addEventListener('click', () => virarServico(o));

  $('#orc-apagar').addEventListener('click', async () => {
    const ok = await confirmar('Apagar este orçamento?',
      escapar(o.titulo) + ' · ' + moeda(o.valor) + '<br><br>Não tem volta.',
      'Apagar', true);
    if (!ok) return;

    const { error } = await sb.from('orcamentos').delete().eq('id', o.id);
    if (error) return aviso('aviso-ver-orcamento', mensagemDeErro(error));

    fecharFolha('folha-ver-orcamento');
    await recarregar();
  });
}

async function trocarStatus(o, novo) {
  if (novo === o.status) return;

  const mudanca = { status: novo };
  if (novo === 'enviado' && !o.enviado_em) mudanca.enviado_em = new Date().toISOString();

  const { error } = await sb.from('orcamentos').update(mudanca).eq('id', o.id);
  if (error) return aviso('aviso-ver-orcamento', mensagemDeErro(error));

  Object.assign(o, mudanca);
  await recarregar();

  // Acabou de aprovar: o momento certo de oferecer virar serviço é agora,
  // não depois, quando ela já saiu da tela.
  if (novo === 'aprovado' && !o.atendimento_id) return virarServico(o);

  abrirOrcamento(o.id);
}


// ------------------------------------------------------------
// WhatsApp
//
// wa.me só leva TEXTO — não anexa arquivo. O envio do PDF em anexo
// entra na Etapa C, com navigator.share().
// ------------------------------------------------------------

function linkWhatsApp(telefone, texto) {
  const so = (telefone || '').replace(/\D/g, '');
  const numero = so.length > 11 ? so : '55' + so;
  return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto);
}

const primeiroNome = (nome) => (nome || '').trim().split(/\s+/)[0] || '';

// Gera o PDF e abre a folha de compartilhar do aparelho, com o arquivo
// junto. Onde isso não existe, baixa o PDF e abre o WhatsApp só com o
// texto — avisando na tela para anexar à mão.
async function mandarOrcamentoNoWhatsApp(o, c) {
  const botao = $('#orc-whats');
  ocupado(botao, true, 'Preparando…');

  try {
    const r = await gerarPdfDoOrcamento(o, c, false);
    ocupado(botao, false);

    if (r.cancelou) return;

    // Só marca como enviado quando saiu de verdade.
    if (o.status === 'rascunho') await trocarStatus(o, 'enviado');

    if (r.precisaAnexar) {
      avisarNaFolha('O PDF foi baixado',
        'Seu aparelho não deixa anexar direto. No WhatsApp que abriu, ' +
        'toque no <strong>clipe</strong> e escolha o arquivo que acabou de baixar.');
    }
  } catch (e) {
    ocupado(botao, false);
    console.error('Loen Soluções — PDF:', e);
    aviso('aviso-ver-orcamento', e.message || 'Não consegui gerar o PDF.');
  }
}

async function baixarPdf(o, c) {
  const botao = $('#orc-pdf');
  ocupado(botao, true, 'Gerando…');
  try {
    await gerarPdfDoOrcamento(o, c, true);
    ocupado(botao, false);
  } catch (e) {
    ocupado(botao, false);
    console.error('Loen Soluções — PDF:', e);
    aviso('aviso-ver-orcamento', e.message || 'Não consegui gerar o PDF.');
  }
}

function perguntarNoWhatsApp(id) {
  const o = (estado.orcamentos || []).find(x => x.id === id);
  if (!o) return;
  const c = estado.clientes.find(x => x.id === o.cliente_id) || {};
  if (!c.telefone) return;

  const texto = 'Oi, ' + primeiroNome(c.nome) + ', tudo bem? Passando para saber se você ' +
                'chegou a ver o orçamento de ' + o.titulo + '. Qualquer dúvida estou à disposição!';
  window.open(linkWhatsApp(c.telefone, texto), '_blank', 'noopener');
}


// ------------------------------------------------------------
// Duplicar e virar serviço
// ------------------------------------------------------------

// Traz os itens da calculadora de um orçamento. Usado para mostrar a
// conta no detalhe e para duplicar sem perder nada.
async function itensDoOrcamento(id) {
  const { data, error } = await sb.from('orcamento_itens')
    .select('*').eq('orcamento_id', id).order('ordem');
  if (error) { console.error('Loen Soluções — itens do orçamento:', error); return []; }
  return data || [];
}

async function duplicarOrcamento(o) {
  const ok = await confirmar('Duplicar este orçamento?',
    'Vou criar um rascunho novo com os mesmos dados e a mesma conta, com a data de hoje.',
    'Duplicar');
  if (!ok) return;

  const itens = await itensDoOrcamento(o.id);

  const { data: novo, error } = await sb.from('orcamentos').insert({
    negocio_id: o.negocio_id,
    cliente_id: o.cliente_id,
    criado_por: estado.perfil.id,
    origem:     o.origem,
    titulo:     o.titulo,
    descricao:  o.descricao,
    valor:      o.valor,
    prazo:      o.prazo,
    endereco:   o.endereco,
    referencia: o.referencia,
    status:     'rascunho',
    validade:   validadeDaqui(15)
  }).select().single();

  if (error) return aviso('aviso-ver-orcamento', mensagemDeErro(error));

  // A conta vai junto: é o que permite reabrir e ajustar depois.
  if (itens.length) {
    const copia = itens.map(i => ({
      orcamento_id:   novo.id,
      tipo:           i.tipo,
      descricao:      i.descricao,
      quantidade:     i.quantidade,
      valor_unitario: i.valor_unitario,
      ordem:          i.ordem
    }));
    const { error: erroItens } = await sb.from('orcamento_itens').insert(copia);
    if (erroItens) return aviso('aviso-ver-orcamento', mensagemDeErro(erroItens));
  }

  fecharFolha('folha-ver-orcamento');
  await recarregar();
  abrirAba('orcamentos');
  abrirOrcamento(novo.id);
}

function validadeDaqui(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return dataLocal(d);
}

// Orçamento aprovado vira serviço agendado, sem redigitar nada.
// Esta passagem é o que separa o app de uma planilha.
async function virarServico(o) {
  if (o.atendimento_id) {
    return avisarNaFolha('Já virou serviço',
      'Este orçamento já foi transformado em serviço. Você o encontra na aba Serviços.');
  }

  const ok = await confirmar('Transformar em serviço?',
    'Vou criar o serviço <strong>' + escapar(o.titulo) + '</strong> de ' +
    moeda(o.valor) + ' como <strong>agendado</strong>, com os mesmos dados. ' +
    'Você não precisa digitar nada de novo.',
    'Transformar');
  if (!ok) return;

  const { data: novo, error } = await sb.from('atendimentos').insert({
    negocio_id:      o.negocio_id,
    cliente_id:      o.cliente_id,
    profissional_id: estado.perfil.id,
    criado_por:      estado.perfil.id,
    tipo:            'detalhado',
    servico_nome:    o.titulo,
    titulo:          o.titulo,
    descricao:       o.descricao,
    valor:           o.valor,
    data:            hoje(),
    endereco:        o.endereco,
    referencia:      o.referencia,
    situacao:        'agendado'
  }).select().single();

  if (error) return aviso('aviso-ver-orcamento', mensagemDeErro(error));

  const { error: erroLigacao } = await sb.from('orcamentos')
    .update({ atendimento_id: novo.id }).eq('id', o.id);
  if (erroLigacao) return aviso('aviso-ver-orcamento', mensagemDeErro(erroLigacao));

  o.atendimento_id = novo.id;
  fecharFolha('folha-ver-orcamento');
  await recarregar();
  abrirAba('servicos');
}


// ------------------------------------------------------------
// Trocar o status em um toque
//
// A pessoa está olhando a lista quando lembra que o cliente
// respondeu. O caminho tem que morrer ali: toca na etiqueta,
// escolhe, pronto. Sem abrir o orçamento, sem rolar tela.
// ------------------------------------------------------------

// Desfaz o que a escolha de status põe na folha de pergunta, que é
// compartilhada com os avisos e as confirmações do app.
function limparGradeStatus() {
  $$('#grade-status').forEach(g => g.remove());
  $('#pg-sim').style.display = '';
  $('#pg-nao').textContent = 'Cancelar';
}

function escolherStatus(id) {
  const o = (estado.orcamentos || []).find(x => x.id === id);
  if (!o) return;

  // Quem fecha a folha tocando fora não passa pelo "Fechar", e os
  // botões da vez anterior ficavam lá — a grade aparecia duplicada.
  // Limpa sempre antes de montar.
  limparGradeStatus();

  $('#pg-titulo').textContent = 'Em que pé está?';
  $('#pg-texto').innerHTML =
    escapar(o.titulo) + ' · <strong>' + moeda(o.valor) + '</strong>';

  // Um botão por status, cada um na cor dele. A pessoa vê as opções
  // e toca — em vez de decorar o que cada palavra significa.
  const escolhas = Object.keys(STATUS_ORC).map(k =>
    '<button type="button" class="escolha-status ' + STATUS_ORC[k].classe +
    (k === o.status ? ' atual' : '') + '" data-novo="' + k + '">' +
    STATUS_ORC[k].rotulo + (k === o.status ? ' ✓' : '') + '</button>').join('');

  $('#pg-texto').insertAdjacentHTML('afterend',
    '<div class="grade-status" id="grade-status">' + escolhas + '</div>');

  const sim = $('#pg-sim');
  sim.style.display = 'none';
  $('#pg-nao').textContent = 'Fechar';

  const limpar = limparGradeStatus;

  const nao = $('#pg-nao');
  const novoNao = nao.cloneNode(true);
  nao.replaceWith(novoNao);
  novoNao.addEventListener('click', () => { limpar(); fecharFolha('folha-pergunta'); });

  $$('#grade-status button').forEach(b =>
    b.addEventListener('click', async () => {
      const escolhido = b.dataset.novo;
      limpar();
      fecharFolha('folha-pergunta');
      if (escolhido === o.status) return;
      await trocarStatusDaLista(o, escolhido);
    }));

  abrirFolha('folha-pergunta');
}

// Igual ao trocarStatus, mas volta para a lista em vez do detalhe.
async function trocarStatusDaLista(o, novo) {
  const mudanca = { status: novo };
  if (novo === 'enviado' && !o.enviado_em) mudanca.enviado_em = new Date().toISOString();

  const { error } = await sb.from('orcamentos').update(mudanca).eq('id', o.id);
  if (error) return avisarNaFolha('Não deu certo', escapar(mensagemDeErro(error)));

  Object.assign(o, mudanca);
  await recarregar();

  // Aprovou: oferece virar serviço na hora, que é quando ela está pensando nisso.
  if (novo === 'aprovado' && !o.atendimento_id) return virarServico(o);
}


// ------------------------------------------------------------
// Link de aprovação para o cliente (Etapa D)
//
// O cliente abre o link, vê o orçamento e toca em Aprovar ou Recusar.
// O status muda sozinho aqui — ela não precisa marcar à mão.
//
// Isto NÃO é assinatura digital. É um aceite com data e hora, que é
// o que a maioria dos apps de orçamento faz.
// ------------------------------------------------------------

function enderecoDoLink(token) {
  // Mesma pasta do app, trocando index.html por orcamento.html.
  // O código vai depois do #, para não entrar em log de servidor.
  const base = location.href.replace(/[^/]*$/, '');
  return base + 'orcamento.html#' + token;
}

async function mandarLinkDeAprovacao(o, c) {
  const botao = $('#orc-link');
  ocupado(botao, true, 'Gerando…');

  const { data: token, error } = await sb.rpc('gerar_link_orcamento', { p_orcamento: o.id });

  ocupado(botao, false);

  if (error) {
    // A migração 09 ainda não rodou.
    if ((error.message || '').includes('gerar_link_orcamento') || error.code === 'PGRST202') {
      return avisarNaFolha('Ainda não disponível',
        'Rode a migração 09 no banco para liberar o link de aprovação.');
    }
    return aviso('aviso-ver-orcamento', mensagemDeErro(error));
  }

  const link = enderecoDoLink(token);
  const texto =
    'Olá, ' + primeiroNome(c?.nome) + '! Segue o orçamento de ' + o.titulo +
    ': ' + moeda(o.valor) + '.' +
    (o.prazo ? ' Prazo: ' + o.prazo + '.' : '') +
    (o.validade ? ' Vale até ' + dataCurta(o.validade) + '.' : '') +
    '\n\nVocê pode ver e responder por aqui:\n' + link;

  if (c?.telefone) {
    window.open(linkWhatsApp(c.telefone, texto), '_blank', 'noopener');
    if (o.status === 'rascunho') await trocarStatus(o, 'enviado');
    return;
  }

  // Sem telefone: copia o link para ela mandar por onde quiser.
  try {
    await navigator.clipboard.writeText(link);
    avisarNaFolha('Link copiado',
      'Este cliente não tem telefone cadastrado, então copiei o link. ' +
      'É só colar onde você quiser mandar.');
  } catch {
    avisarNaFolha('Link do orçamento', escapar(link));
  }
  if (o.status === 'rascunho') await trocarStatus(o, 'enviado');
}


// ------------------------------------------------------------
// Forma de pagamento no orçamento
// ------------------------------------------------------------

//  existe porque o clique no BOTAO roda antes de o grupo
// marcar a pastilha — ler valorPastilha() aqui devolveria a escolha
// ANTERIOR, e o campo de parcelas aparecia trocado: sumia no Cartao e
// aparecia no Pix. Quando vem do clique, usamos o valor do proprio botao.
function atualizarParcelasOrcamento(formaClicada) {
  const forma = formaClicada !== undefined ? formaClicada : valorPastilha('#or-pagamento');
  const mostra = pagamentoParcelavel(forma) && estado.temParcelas;
  $('#campo-or-parcelas').style.display = mostra ? 'block' : 'none';
  if (mostra) {
    mostrarValorDaParcela('#or-parcela-valor', lerDinheiro('#or-valor'), $('#or-parcelas').value);
  }
}

$$('#or-pagamento button').forEach(b =>
  b.addEventListener('click', () => atualizarParcelasOrcamento(b.dataset.valor)));
// Mesmo cuidado do servico: sem a arrow, o evento vira o argumento.
$('#or-parcelas')?.addEventListener('change', () => atualizarParcelasOrcamento());
$('#or-valor')?.addEventListener('input',  () => atualizarParcelasOrcamento());

// Como o cliente pode pagar, em uma linha, para reaproveitar em toda
// parte que mostra isso: detalhe, PDF, WhatsApp e página do cliente.
function textoPagamento(o) {
  if (!o.forma_pagamento) return '';
  const n = Number(o.parcelas || 1);
  if (n > 1 && Number(o.valor) > 0) {
    return o.forma_pagamento + ' em ' + n + 'x de ' + moeda(Number(o.valor) / n);
  }
  return o.forma_pagamento;
}
