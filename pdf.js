// ============================================================
// LOEN SOLUÇÕES — PDF do orçamento e envio pelo WhatsApp
//
// O PDF é montado NO CELULAR dela, com jsPDF. Não passa por
// servidor nenhum — combina com a arquitetura sem back-end.
//
// LIMITAÇÃO REAL DO WHATSAPP
// O link wa.me NÃO anexa arquivo, só leva texto. Por isso a ordem:
//   1. navigator.share() com o arquivo — funciona em Android e iOS
//      modernos, e é o caminho bom: abre o WhatsApp com o PDF junto
//   2. se não existir, baixa o PDF e abre o WhatsApp só com o texto,
//      avisando na tela para anexar à mão
// ============================================================

const AZUL_PDF  = [30, 63, 145];
const VERDE_PDF = [14, 92, 58];
const CINZA_PDF = [90, 100, 114];

// Busca a logo do negócio e devolve em base64, que é o que o jsPDF come.
// Se der qualquer problema, devolve null e o PDF sai sem logo — nunca
// deixa de sair por causa da imagem.
async function logoParaPdf() {
  const caminho = estado.negocio?.logo_caminho;
  if (!caminho) return null;

  try {
    const { data } = await sb.storage.from('imagens').createSignedUrl(caminho, 3600);
    if (!data?.signedUrl) return null;

    const resposta = await fetch(data.signedUrl);
    if (!resposta.ok) return null;
    const blob = await resposta.blob();

    return await new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onloadend = () => resolve(leitor.result);
      leitor.onerror = () => resolve(null);
      leitor.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Loen Soluções — logo do PDF:', e);
    return null;
  }
}

const primeiroNomeArquivo = (nome) =>
  (nome || 'cliente').trim().split(/\s+/)[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'cliente';

function nomeDoArquivo(cliente) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'orcamento-' + primeiroNomeArquivo(cliente?.nome) + '-' +
         p(d.getDate()) + p(d.getMonth() + 1) + d.getFullYear() + '.pdf';
}

// ------------------------------------------------------------
// Monta o PDF
// ------------------------------------------------------------

async function montarPdf(o, cliente, itens) {
  if (!window.jspdf?.jsPDF) {
    throw new Error('A biblioteca do PDF não carregou. Verifique a internet.');
  }

  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const M = 16;                 // margem
  const LARG = 210;             // largura da folha A4
  const L = LARG - M * 2;       // largura útil
  const n = estado.negocio || {};

  // ---------- FAIXA AZUL DO TOPO ----------
  //
  // A faixa resolve dois problemas de uma vez: dá presença ao papel
  // logo no primeiro olhar, e faz o orçamento de quem NÃO tem logo
  // parecer tão cuidado quanto o de quem tem — o nome do negócio em
  // branco sobre o azul já sustenta o cabeçalho sozinho.
  const ALTURA_FAIXA = 40;
  doc.setFillColor(...AZUL_PDF);
  doc.rect(0, 0, LARG, ALTURA_FAIXA, 'F');

  const logo = await logoParaPdf();
  let x = M;

  if (logo) {
    // Fundo branco atrás da logo: a maioria vem com fundo transparente
    // ou claro, e sumiria no azul.
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, 9, 22, 22, 3, 3, 'F');
    try { doc.addImage(logo, 'PNG', M + 2, 11, 18, 18, undefined, 'FAST'); } catch (e) { /* segue sem logo */ }
    x = M + 28;
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(19);
  doc.text(doc.splitTextToSize(n.nome || estado.perfil?.nome || 'Meu negócio', L - (x - M) - 40)[0], x, 18);

  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  doc.setTextColor(200, 214, 240);
  let yTopo = 24;
  if (n.tipo_atividade) { doc.text(n.tipo_atividade, x, yTopo); yTopo += 4.6; }

  const contato = [estado.perfil?.nome, telefoneBonito(estado.perfil?.celular)]
    .filter(Boolean).join(' · ');
  if (contato) { doc.text(contato, x, yTopo); yTopo += 4.6; }
  if (n.cnpj) doc.text('CNPJ ' + n.cnpj, x, yTopo);

  // A palavra ORÇAMENTO na direita da faixa, como um carimbo.
  doc.setFont('helvetica', 'bold').setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('ORÇAMENTO', LARG - M, 17, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.setTextColor(200, 214, 240);
  doc.text(dataCurta(o.criado_em || hoje()), LARG - M, 22.5, { align: 'right' });

  let y = ALTURA_FAIXA + 13;

  // ---------- PARA QUEM ----------
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...CINZA_PDF);
  doc.text('PARA', M, y); y += 6;

  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(20, 32, 58);
  doc.text(cliente?.nome || 'Cliente', M, y); y += 5.4;

  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...CINZA_PDF);
  [ cliente?.empresa,
    cliente?.responsavel && 'Resp.: ' + cliente.responsavel,
    cliente?.cnpj && 'CNPJ ' + cliente.cnpj,
    telefoneBonito(cliente?.telefone),
    cliente?.email
  ].filter(Boolean).forEach(linha => { doc.text(String(linha), M, y); y += 4.6; });
  y += 7;

  // ---------- O SERVIÇO ----------
  doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...CINZA_PDF);
  doc.text('O SERVIÇO', M, y); y += 6.5;

  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...AZUL_PDF);
  doc.splitTextToSize(o.titulo || '', L).forEach(l => { doc.text(l, M, y); y += 7; });

  if (o.descricao) {
    y += 1;
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(60, 66, 78);
    doc.splitTextToSize(o.descricao, L).forEach(l => { doc.text(l, M, y); y += 5; });
  }

  if (o.endereco) {
    y += 3;
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...CINZA_PDF);
    doc.text('Onde: ' + o.endereco + (o.referencia ? ' — ' + o.referencia : ''), M, y);
    y += 5;
  }
  y += 7;

  // ---------- O QUE ESTÁ INCLUÍDO ----------
  //
  // SEM VALORES POR ITEM, de propósito. A versão anterior mostrava
  // quantidade e preço de cada linha — e a soma dava R$ 1.680 num
  // orçamento de R$ 2.016. Qualquer cliente faz essa conta no celular
  // e ou acha que tem erro, ou pede desconto da diferença.
  // (Decidido com o Leandro em 31/08/2026.)
  const doCusto = (itens || []).filter(i => i.tipo !== 'margem');
  if (doCusto.length) {
    const alturaBloco = 13 + doCusto.length * 6;
    doc.setFillColor(250, 247, 244);
    doc.roundedRect(M, y - 5, L, alturaBloco, 2.5, 2.5, 'F');

    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...CINZA_PDF);
    doc.text('O QUE ESTÁ INCLUÍDO', M + 6, y + 1); y += 8;

    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(20, 32, 58);
    doCusto.forEach(i => {
      const qtd = Number(i.quantidade || 0);
      const nome = i.descricao || rotuloDoTipo(i.tipo);
      // "5 diárias" ajuda a entender o tamanho do serviço.
      // "1 tinta e massa" não ajuda ninguém, então o 1 some.
      const texto = qtd > 1 ? String(qtd).replace('.', ',') + ' × ' + nome : nome;

      doc.setFillColor(...AZUL_PDF);
      doc.circle(M + 8, y - 1.2, 0.9, 'F');
      doc.text(doc.splitTextToSize(texto, L - 20)[0], M + 12, y);
      y += 6;
    });
    y += 8;
  }

  // ---------- O PREÇO ----------
  const alturaPreco = 26;
  doc.setFillColor(...VERDE_PDF);
  doc.roundedRect(M, y - 4, L, alturaPreco, 3, 3, 'F');

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(190, 225, 205);
  doc.text('VALOR TOTAL', M + 8, y + 4);

  doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(255, 255, 255);
  doc.text(moedaPdf(o.valor), M + 8, y + 15);

  // Forma de pagamento no canto direito do bloco verde.
  const pg = typeof textoPagamento === 'function' ? textoPagamento(o) : '';
  if (pg) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(190, 225, 205);
    doc.text('COMO PAGAR', LARG - M - 8, y + 4, { align: 'right' });
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(255, 255, 255);
    doc.splitTextToSize(pg, 70).slice(0, 2).forEach((l, i) => {
      doc.text(l, LARG - M - 8, y + 12 + i * 5, { align: 'right' });
    });
  }
  y += alturaPreco + 8;

  // ---------- PRAZO E VALIDADE ----------
  const info = [];
  if (o.prazo)    info.push(['Prazo para fazer', o.prazo]);
  if (o.validade) info.push(['Este orçamento vale até', dataCurta(o.validade)]);

  if (info.length) {
    doc.setDrawColor(228, 220, 214).setLineWidth(0.3);
    info.forEach(([rot, val]) => {
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...CINZA_PDF);
      doc.text(rot, M, y);
      doc.setFont('helvetica', 'bold').setTextColor(20, 32, 58);
      doc.text(String(val), LARG - M, y, { align: 'right' });
      y += 5;
      doc.line(M, y, LARG - M, y);
      y += 5.5;
    });
  }

  // ---------- RODAPÉ ----------
  //
  // Fica preso no fim da folha, não no fim do texto: assim o papel
  // termina sempre igual, com orçamento curto ou longo.
  const yRodape = 275;
  doc.setDrawColor(228, 220, 214).setLineWidth(0.3);
  doc.line(M, yRodape - 7, LARG - M, yRodape - 7);

  const contatos = [];
  if (n.instagram) contatos.push('@' + n.instagram);
  if (n.site)      contatos.push(n.site.replace(/^https?:\/\//i, ''));
  if (n.email)     contatos.push(n.email);

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...AZUL_PDF);
  if (contatos.length) doc.text(contatos.join('   ·   '), M, yRodape - 1);

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...CINZA_PDF);
  doc.text('Orçamento gerado pelo Loen Soluções', LARG - M, yRodape - 1, { align: 'right' });

  if (n.endereco) {
    doc.setFontSize(8).setTextColor(...CINZA_PDF);
    doc.text(n.endereco, M, yRodape + 4);
  }

  return doc;
}

const rotuloDoTipo = (t) => ({
  material: 'Material', trabalho: 'Mão de obra',
  deslocamento: 'Deslocamento', outro: 'Outros custos'
}[t] || 'Item');

// O jsPDF não desenha "R$" com a fonte padrão em alguns aparelhos,
// então escrevemos o cifrão junto do número, sem depender de símbolo.
function moedaPdf(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
}

function telefoneBonito(t) {
  const d = (t || '').replace(/\D/g, '');
  const so = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  if (so.length < 10) return t || '';
  const corte = so.length > 10 ? 7 : 6;
  return '(' + so.slice(0, 2) + ') ' + so.slice(2, corte) + '-' + so.slice(corte);
}


// ------------------------------------------------------------
// Gerar e mandar
// ------------------------------------------------------------

function mensagemDoOrcamento(o, cliente) {
  const partes = ['Olá, ' + primeiroNome(cliente?.nome) + '! Segue o orçamento de ' +
                  o.titulo + ': ' + moedaPdf(o.valor) + '.'];
  const pg = typeof textoPagamento === 'function' ? textoPagamento(o) : '';
  if (pg)         partes.push('Pagamento: ' + pg + '.');
  if (o.prazo)    partes.push('Prazo: ' + o.prazo + '.');
  if (o.validade) partes.push('Vale até ' + dataCurta(o.validade) + '.');
  partes.push('Qualquer dúvida é só chamar.');
  return partes.join(' ');
}

async function gerarPdfDoOrcamento(o, cliente, apenasBaixar) {
  const itens = o.origem === 'calculadora' ? await itensDoOrcamento(o.id) : [];
  const doc = await montarPdf(o, cliente, itens);
  const arquivo = nomeDoArquivo(cliente);

  if (apenasBaixar) {
    doc.save(arquivo);
    return { baixou: true };
  }

  const blob = doc.output('blob');
  const pdf = new File([blob], arquivo, { type: 'application/pdf' });
  const texto = mensagemDoOrcamento(o, cliente);

  // Caminho bom: o aparelho abre a folha de compartilhar com o PDF junto,
  // e ela escolhe o WhatsApp e a pessoa.
  if (navigator.canShare && navigator.canShare({ files: [pdf] })) {
    try {
      await navigator.share({ files: [pdf], text: texto });
      return { compartilhou: true };
    } catch (e) {
      // Ela cancelou a folha de compartilhar. Não é erro.
      if (e?.name === 'AbortError') return { cancelou: true };
    }
  }

  // Caminho alternativo: baixa o PDF e abre o WhatsApp só com o texto.
  doc.save(arquivo);
  if (cliente?.telefone) {
    window.open(linkWhatsApp(cliente.telefone, texto), '_blank', 'noopener');
  }
  return { baixou: true, precisaAnexar: true };
}


// ============================================================
// COMPROVANTE DE RENDA
//
// Prestador autônomo não tem holerite. Quando ela vai alugar casa,
// financiar uma moto, abrir MEI ou pedir empréstimo, pedem
// comprovante de renda — e ela não tem nenhum.
//
// Este papel é isso: quanto entrou nos últimos meses, a média, e o
// detalhe mês a mês. Vale porque os números vêm do que ela registrou
// ao longo do tempo, não de uma declaração escrita na hora.
// ============================================================

// Junta as entradas por mês. Usa os TOTAIS, nunca a lista da tela.
function rendaPorMes(meses) {
  const entradas = (estado.lancamentosTotal || []).filter(l => l.tipo === 'entrada');

  const chaves = [];
  const base = new Date();
  base.setDate(1);
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    chaves.push(dataLocal(d).slice(0, 7));
  }

  const porMes = {};
  chaves.forEach(k => { porMes[k] = 0; });
  entradas.forEach(l => {
    const k = String(l.data).slice(0, 7);
    if (k in porMes) porMes[k] += Number(l.valor || 0);
  });

  const linhas = chaves.map(k => ({ mes: k, total: porMes[k] }));
  const total = linhas.reduce((s, l) => s + l.total, 0);

  // A média considera só os meses em que houve movimento. Contar mês
  // vazio de quem começou há dois meses achataria a renda dela à toa.
  const comMovimento = linhas.filter(l => l.total > 0).length || 1;

  return { linhas, total, media: total / comMovimento, mesesContados: comMovimento };
}

const MES_NOME = ['janeiro','fevereiro','março','abril','maio','junho',
                  'julho','agosto','setembro','outubro','novembro','dezembro'];

function mesPorExtenso(chave) {
  const [a, m] = chave.split('-').map(Number);
  return MES_NOME[m - 1] + ' de ' + a;
}

async function gerarComprovanteDeRenda(meses = 6) {
  if (!window.jspdf?.jsPDF) {
    throw new Error('A biblioteca do PDF não carregou. Verifique a internet.');
  }

  const r = rendaPorMes(meses);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  const M = 18, L = 210 - M * 2;
  let y = M + 6;

  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...AZUL_PDF);
  doc.text('Comprovante de renda', M, y); y += 8;

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...CINZA_PDF);
  doc.text('Emitido em ' + new Date().toLocaleDateString('pt-BR'), M, y); y += 10;

  doc.setDrawColor(220, 214, 208).line(M, y, M + L, y); y += 10;

  // Quem
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0, 0, 0);
  doc.text(estado.perfil?.nome || '', M, y); y += 6;

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...CINZA_PDF);
  [ estado.negocio?.tipo_atividade,
    estado.negocio?.nome,
    telefoneBonito(estado.perfil?.celular)
  ].filter(Boolean).forEach(l => { doc.text(String(l), M, y); y += 5; });
  y += 8;

  // O número que importa
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL_PDF);
  doc.text('Renda média por mês', M, y); y += 9;

  doc.setFont('helvetica', 'bold').setFontSize(28).setTextColor(...VERDE_PDF);
  doc.text(moedaPdf(r.media), M, y); y += 9;

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...CINZA_PDF);
  doc.text('Média de ' + r.mesesContados + ' ' +
           (r.mesesContados === 1 ? 'mês' : 'meses') + ' com movimento. ' +
           'Total recebido: ' + moedaPdf(r.total) + '.', M, y);
  y += 12;

  // Mês a mês
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...AZUL_PDF);
  doc.text('Mês a mês', M, y); y += 8;

  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(0, 0, 0);
  r.linhas.forEach(l => {
    doc.text(mesPorExtenso(l.mes), M, y);
    doc.text(moedaPdf(l.total), M + L, y, { align: 'right' });
    y += 6.5;
    doc.setDrawColor(240, 236, 232).line(M, y - 2, M + L, y - 2);
  });

  y += 6;
  doc.setDrawColor(220, 214, 208).line(M, y, M + L, y); y += 8;
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(0, 0, 0);
  doc.text('Total no período', M, y);
  doc.setTextColor(...VERDE_PDF);
  doc.text(moedaPdf(r.total), M + L, y, { align: 'right' });

  // O rodapé precisa ser honesto sobre o que este papel é.
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...CINZA_PDF);
  const nota = 'Este documento foi gerado pelo aplicativo Loen Soluções a partir dos ' +
               'registros feitos pelo próprio profissional. Não substitui declaração ' +
               'contábil nem documento fiscal.';
  let yr = 272;
  doc.splitTextToSize(nota, L).forEach(l => { doc.text(l, M, yr); yr += 4; });

  return { doc, resumo: r };
}
