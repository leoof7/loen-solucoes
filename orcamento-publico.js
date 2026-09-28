// ============================================================
// LOEN SOLUÇÕES — A página que o CLIENTE abre
//
// Quem chega aqui é o cliente do prestador, não quem usa o app.
// Ele não faz login: o código do link é a chave, e ele só abre
// aquele orçamento. Ver a migração 09.
//
// Tudo passa por duas funções do banco:
//   ver_orcamento_publico(token)  — o que ele pode ver
//   responder_orcamento(token, r) — aprovar ou recusar
//
// Nenhuma tabela é consultada direto daqui, de propósito. Assim não
// existe caminho para chegar em outro orçamento nem em outro dado.
// ============================================================

const sbp = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const tela = document.getElementById('tela');

function escapar(t) {
  return String(t ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function moeda(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataCurta(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d + '/' + m + '/' + a;
}

// O código vem depois do # para não ficar no histórico de servidor
// nenhum. Aceita também ?c= por compatibilidade, caso algum aplicativo
// de mensagem mastigue o #.
function tokenDaUrl() {
  const hash = (location.hash || '').replace('#', '').trim();
  if (hash) return hash;
  return new URLSearchParams(location.search).get('c') || '';
}

function recado(tipo, texto) {
  return '<div class="recado ' + tipo + '">' + texto + '</div>';
}

function mostrarErro(titulo, texto) {
  tela.innerHTML =
    '<div class="topo"><div class="quem">Orçamento</div></div>' +
    '<div class="cartao"><p class="servico">' + escapar(titulo) + '</p>' +
    '<p class="descricao">' + escapar(texto) + '</p></div>' +
    '<p class="rodape">Loen Soluções</p>';
}

// ------------------------------------------------------------

async function abrir() {
  const token = tokenDaUrl();

  if (token.length !== 16) {
    return mostrarErro('Link incompleto',
      'Confira se o endereço foi copiado inteiro. Se veio por WhatsApp, ' +
      'toque no link em vez de copiar e colar.');
  }

  const { data, error } = await sbp.rpc('ver_orcamento_publico', { p_token: token });

  if (error) {
    console.error(error);
    return mostrarErro('Não consegui abrir',
      'Tente de novo daqui a pouco. Se continuar assim, fale com quem te mandou o orçamento.');
  }

  if (!data) {
    return mostrarErro('Orçamento não encontrado',
      'Este link pode ter expirado ou estar errado. Peça um novo para quem te enviou.');
  }

  desenhar(token, data);
}

function desenhar(token, o) {
  const respondido = !!o.respondido_em;
  const vencido = o.vencido && !respondido;

  let h = '<div class="topo">' +
          '<div class="quem">' + escapar(o.negocio?.nome || 'Orçamento') + '</div>' +
          (o.negocio?.atividade
            ? '<div class="oque">' + escapar(o.negocio.atividade) + '</div>' : '') +
          '</div>';

  if (respondido) {
    h += o.resposta_cliente === 'recusado' || o.status === 'recusado'
      ? recado('nao', 'Você recusou este orçamento em ' + dataCurta(o.respondido_em) + '.')
      : recado('ok', '✓ Você aprovou este orçamento em ' + dataCurta(o.respondido_em) +
                     '.<br>Já avisamos ' + escapar(o.negocio?.nome || 'o prestador') + '.');
  } else if (vencido) {
    h += recado('aviso', 'Este orçamento valia até ' + dataCurta(o.validade) +
                         '. Peça um novo para confirmar o preço.');
  }

  // O serviço
  h += '<div class="cartao">' +
       (o.cliente?.nome ? '<p class="rotulo">Para ' + escapar(o.cliente.nome) + '</p>' : '') +
       '<p class="servico">' + escapar(o.titulo || '') + '</p>' +
       (o.descricao
         ? '<p class="descricao">' + escapar(o.descricao).replace(/\n/g, '<br>') + '</p>'
         : '') +
       '</div>';

  // O que está incluído — sem valores por item, igual ao PDF.
  if (o.itens?.length) {
    h += '<div class="cartao"><p class="rotulo">O que está incluído</p><ul class="inclui">';
    o.itens.forEach(i => {
      const q = Number(i.quantidade || 0);
      const nome = i.descricao || 'Item';
      h += '<li>' + (q > 1 ? String(q).replace('.', ',') + ' × ' : '') + escapar(nome) + '</li>';
    });
    h += '</ul></div>';
  }

  // O preço
  h += '<div class="cartao"><p class="rotulo">Valor total</p>' +
       '<p class="valor">' + moeda(o.valor) + '</p>';
  if (o.prazo)    h += '<div class="linha"><span>Prazo</span><span>' + escapar(o.prazo) + '</span></div>';
  if (o.validade) h += '<div class="linha"><span>Vale até</span><span>' + dataCurta(o.validade) + '</span></div>';
  if (o.endereco) h += '<div class="linha"><span>Onde</span><span>' + escapar(o.endereco) + '</span></div>';
  h += '</div>';

  // Os botões, só quando ainda dá para responder
  if (!respondido && !vencido) {
    h += '<p class="rotulo" style="text-align:center;margin:22px 0 12px">' +
         'O que você decide?</p>' +
         '<button class="btn btn-sim" id="aprovar">Aprovar orçamento</button>' +
         '<button class="btn btn-nao" id="recusar">Não vou fazer agora</button>' +
         '<div id="aviso"></div>';
  }

  h += '<p class="rodape">Orçamento enviado pelo Loen Soluções</p>';
  tela.innerHTML = h;

  if (!respondido && !vencido) {
    document.getElementById('aprovar').addEventListener('click', () => responder(token, 'aprovado'));
    document.getElementById('recusar').addEventListener('click', () => responder(token, 'recusado'));
  }
}

async function responder(token, resposta) {
  const sim = document.getElementById('aprovar');
  const nao = document.getElementById('recusar');
  const aviso = document.getElementById('aviso');

  // Aprovar é definitivo, então pergunta uma vez. Recusar não precisa:
  // se ele mudar de ideia, pede um orçamento novo.
  if (resposta === 'aprovado' && !confirm('Confirmar a aprovação deste orçamento?')) return;

  sim.disabled = nao.disabled = true;
  (resposta === 'aprovado' ? sim : nao).textContent = 'Enviando…';

  const { data, error } = await sbp.rpc('responder_orcamento', {
    p_token: token, p_resposta: resposta
  });

  if (error) {
    sim.disabled = nao.disabled = false;
    sim.textContent = 'Aprovar orçamento';
    nao.textContent = 'Não vou fazer agora';
    aviso.innerHTML = recado('aviso', escapar(error.message || 'Não consegui enviar. Tente de novo.'));
    return;
  }

  if (data?.ja_respondido) {
    aviso.innerHTML = recado('aviso', 'Este orçamento já tinha sido respondido.');
  }

  // Recarrega para mostrar o estado final, já vindo do banco.
  await abrir();
  window.scrollTo(0, 0);
}

abrir();
