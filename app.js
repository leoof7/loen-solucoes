// ============================================================
// LOEN SOLUÇÕES — Entrada no app
//
// A pessoa entra com CELULAR (ou e-mail) e SENHA.
// Por baixo, o login do Supabase é um e-mail gerado a partir do
// celular, que ela nunca vê e que nunca recebe mensagem.
// O e-mail de verdade é obrigatório: é para ele que vai o link de
// "Esqueci minha senha", e ele também serve para entrar.
//
// O cadastro é UMA tela. Serviços, preços e meta mensal
// ficam para dentro do app, depois que ela já entrou.
// ============================================================

// Se a biblioteca ou as chaves não carregarem, avisa na tela
// em vez de deixar o app mudo.
if (!window.supabase) {
  document.body.innerHTML =
    '<p style="padding:30px;font-family:sans-serif;color:#B3261E">' +
    'A biblioteca do Supabase não carregou. Verifique a internet e recarregue.</p>';
  throw new Error('supabase-js não carregou');
}
if (typeof CONFIG === 'undefined') {
  document.body.innerHTML =
    '<p style="padding:30px;font-family:sans-serif;color:#B3261E">' +
    'O arquivo config.js não foi encontrado. Confira se ele está na mesma pasta.</p>';
  throw new Error('config.js ausente');
}

const sb = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// Vira true quando o login já foi criado mas o negócio ainda não.
// Serve para não tentar criar o login duas vezes se algo falhar no meio.
let loginJaCriado = false;

// Quem está logado agora. O id do perfil é o mesmo id do login.
//
// Toda consulta a "perfis" PRECISA filtrar por este id. Num negócio com
// equipe, a regra do banco deixa a pessoa ver os colegas — então a consulta
// devolve várias linhas. Sem o filtro, quem pedia uma linha só recebia erro
// e o app concluía "esta pessoa não tem perfil", trancando todo mundo para
// fora, dono incluído.
async function meuId() {
  const { data } = await sb.auth.getUser();
  return data?.user?.id || null;
}

let temEquipe = false;


// ------------------------------------------------------------
// Celular
// ------------------------------------------------------------

// Deixa só os números. Aceita 10 ou 11 dígitos (com DDD).
// Se a pessoa digitar o 55 do Brasil na frente, tira.
function tirarCodigoPais(digitos) {
  // 12 ou 13 dígitos começando com 55 = veio com código do país.
  // Não mexe em 10 ou 11 dígitos, porque 55 também é DDD de Santa Maria.
  if (digitos.length > 11 && digitos.startsWith('55')) return digitos.slice(2);
  return digitos;
}

function limparCelular(valor) {
  const so = tirarCodigoPais((valor || '').replace(/\D/g, ''));
  if (so.length < 10 || so.length > 11) return null;
  return '55' + so;
}

// Vira o e-mail interno do login. A pessoa nunca vê isto.
function loginDoCelular(numero) {
  return 'c' + numero + '@' + CONFIG.DOMINIO_CELULAR;
}

// Escreve bonito enquanto digita: (31) 98842-7315
function formatarCelular(campo) {
  campo.addEventListener('input', () => {
    const d = tirarCodigoPais(campo.value.replace(/\D/g, '')).slice(0, 11);
    const corte = d.length > 10 ? 7 : 6;
    let saida = d;
    if (d.length > 2) saida = '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length > 6) saida = '(' + d.slice(0, 2) + ') ' + d.slice(2, corte) + '-' + d.slice(corte);
    campo.value = saida;
  });
}

$$('input[data-celular]').forEach(formatarCelular);

// Campo que aceita celular OU e-mail: só formata como celular enquanto
// não aparecer letra nem @. Assim quem digita e-mail não vê o texto
// virar "(ma) ria…".
function formatarCelularOuEmail(campo) {
  campo.addEventListener('input', () => {
    if (/[a-z@]/i.test(campo.value)) return;
    const d = tirarCodigoPais(campo.value.replace(/\D/g, '')).slice(0, 11);
    const corte = d.length > 10 ? 7 : 6;
    let saida = d;
    if (d.length > 2) saida = '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length > 6) saida = '(' + d.slice(0, 2) + ') ' + d.slice(2, corte) + '-' + d.slice(corte);
    campo.value = saida;
  });
}

$$('input[data-celular-ou-email]').forEach(formatarCelularOuEmail);


// ------------------------------------------------------------
// E-mail de verdade
// ------------------------------------------------------------

// Guardado sempre em minúsculas e sem espaço — o banco faz o mesmo.
function limparEmail(valor) {
  return (valor || '').trim().toLowerCase();
}

// Só confere se tem cara de e-mail. Quem garante que existe é o link
// de recuperação chegar; por isso o cadastro pede para digitar duas vezes.
function emailValido(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

// Devolve o aviso a mostrar, ou null se os dois campos estão certos.
function problemaNoEmail(email, repetido) {
  if (!email) return 'Digite seu e-mail. É por ele que você recupera a senha se esquecer.';
  if (!emailValido(email)) return 'Este e-mail parece incompleto. Confira. Exemplo: nome@gmail.com';
  if (email !== repetido) return 'Os dois e-mails não estão iguais. Confira e tente de novo.';
  return null;
}


// ------------------------------------------------------------
// Dinheiro
// ------------------------------------------------------------

// Lê um campo de dinheiro aceitando o jeito brasileiro de escrever.
//
// Estes campos eram type="number". O teclado do celular oferece VÍRGULA,
// e o navegador devolve string VAZIA quando recebe uma — então "150,50"
// virava zero e o app salvava R$ 0,00 calado. Agora são type="text" e a
// conversão é feita aqui.
//
// Devolve null quando não há número; nunca devolve zero por engano.
function lerDinheiro(seletor) {
  return lerDinheiroDe($(seletor));
}

// Mesma coisa, mas a partir do próprio campo — usado nas linhas de preço
// do catálogo, que são criadas na hora e não têm id.
function lerDinheiroDe(campo) {
  let t = (campo?.value || '').trim();
  if (!t) return null;

  t = t.replace(/[R$\s]/gi, '');

  // "1.234,56" → tira o ponto de milhar e troca a vírgula por ponto.
  // "1234.56"  → já está pronto.
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Só deixa digitar número, vírgula e ponto nos campos de dinheiro.
// Sem isto, letra e sinal de menos entram e viram valor errado.
function filtrarCampoDinheiro(campo) {
  if (!campo || campo.dataset.filtrado) return;
  campo.dataset.filtrado = '1';
  campo.addEventListener('input', () => {
    const limpo = campo.value.replace(/[^\d.,]/g, '');
    if (limpo !== campo.value) campo.value = limpo;
  });
}

$$('input[data-dinheiro]').forEach(filtrarCampoDinheiro);

// Dinheiro nunca é negativo neste app: nem preço, nem custo, nem valor
// cobrado. Um "-" que escape do filtro viraria desconto silencioso na
// conta da calculadora, então ele morre aqui também.
function lerDinheiroPositivo(seletorOuCampo) {
  const n = typeof seletorOuCampo === 'string'
    ? lerDinheiro(seletorOuCampo)
    : lerDinheiroDe(seletorOuCampo);
  if (n === null) return null;
  return n < 0 ? 0 : n;
}

// Escreve o valor no campo do jeito brasileiro, para edição.
// Sempre com duas casas: "1920" fica estranho num campo de dinheiro,
// e "1920,00" já mostra à pessoa o formato que o campo espera.
function escreverDinheiro(seletor, valor) {
  const campo = $(seletor);
  if (!campo) return;

  if (valor === null || valor === undefined || valor === '') { campo.value = ''; return; }

  const n = Number(valor);
  campo.value = Number.isFinite(n)
    ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(valor).replace('.', ',');
}


// ------------------------------------------------------------
// Tipos de atividade
// ------------------------------------------------------------

const SERVICOS_SUGERIDOS = {
  'Manicure e pedicure': ['Mão', 'Pé', 'Mão e pé', 'Esmaltação em gel', 'Alongamento'],
  'Cabeleireiro(a)':     ['Corte feminino', 'Corte masculino', 'Escova', 'Coloração', 'Hidratação'],
  'Barbeiro':            ['Corte', 'Barba', 'Corte e barba', 'Pezinho', 'Sobrancelha'],
  'Maquiador(a)':        ['Maquiagem social', 'Noiva', 'Madrinha', 'Curso'],
  'Esteticista':         ['Limpeza de pele', 'Massagem', 'Depilação', 'Drenagem'],
  'Podólogo(a)':         ['Pé diabético', 'Unha encravada', 'Calosidade', 'Micose', 'Consulta'],
  'Diarista':            ['Diária', 'Meia diária', 'Faxina pesada', 'Passar roupa'],
  'Costureira':          ['Bainha', 'Ajuste de cintura', 'Troca de zíper', 'Peça sob medida', 'Conserto simples'],
  'Jardineiro':          ['Corte de grama', 'Poda', 'Limpeza de terreno', 'Diária'],
  'Motorista':           ['Corrida', 'Frete', 'Mudança', 'Diária'],
  'Mecânico':            ['Troca de óleo', 'Revisão', 'Freios', 'Diagnóstico'],
  'Pedreiro':            ['Alvenaria (m²)', 'Reboco (m²)', 'Contrapiso (m²)', 'Assentamento de piso (m²)', 'Diária'],
  'Mestre de obras':     ['Diária', 'Empreitada', 'Administração de obra', 'Visita técnica'],
  'Pintor':              ['Pintura interna (m²)', 'Pintura externa (m²)', 'Textura', 'Massa corrida', 'Verniz'],
  'Eletricista':         ['Instalação de tomada', 'Troca de disjuntor', 'Instalação de chuveiro', 'Ponto de luz', 'Visita técnica'],
  'Encanador':           ['Desentupimento', 'Troca de registro', 'Conserto de vazamento', 'Instalação de torneira', 'Visita técnica'],
  'Marceneiro':          ['Móvel planejado (m²)', 'Conserto de móvel', 'Instalação', 'Porta sob medida', 'Diária'],
  'Gesseiro':            ['Forro de gesso (m²)', 'Sanca (m)', 'Drywall (m²)', 'Reparo'],
  'Serralheiro':         ['Portão', 'Grade (m²)', 'Corrimão (m)', 'Solda e reparo'],
  'Outro':               []
};

// Em ordem alfabética, com 'Outro' sempre no fim — é o último recurso,
// não uma opção no meio da lista.
const listaTipos = $('#c-tipo');
Object.keys(SERVICOS_SUGERIDOS)
  .filter(t => t !== 'Outro')
  .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  .concat('Outro')
  .forEach(tipo => {
    const op = document.createElement('option');
    op.value = tipo;
    op.textContent = tipo;
    listaTipos.appendChild(op);
  });

// 'Outro' abre um campo para a pessoa escrever o que faz. O campo já
// existia no HTML desde o começo, mas nada no código o usava — quem
// escolhia 'Outro' ficava sem dizer a profissão.
listaTipos.addEventListener('change', () => {
  const ehOutro = listaTipos.value === 'Outro';
  $('#campo-outra-atividade').style.display = ehOutro ? 'block' : 'none';
  $('#c-outra-atividade').required = ehOutro;
  if (ehOutro) $('#c-outra-atividade').focus();
});


// ------------------------------------------------------------
// Telas e avisos
// ------------------------------------------------------------

function irPara(id) {
  $$('.tela').forEach(t => t.classList.remove('ativa'));
  $('#' + id).classList.add('ativa');
  window.scrollTo(0, 0);
}

function aviso(id, texto, tipo = 'erro') {
  const el = $('#' + id);
  el.textContent = texto;
  el.className = 'aviso visivel ' + tipo;
  // sem isto, a mensagem nasce no topo e a pessoa não vê
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function limparAviso(id) { $('#' + id).className = 'aviso'; }

// Deixa o botão em "Salvando…" enquanto a ação acontece.
//
// O `if (botao.dataset.texto)` não é detalhe: sem ele, chamar duas vezes
// seguidas guardava "Salvando…" como se fosse o texto original, e o botão
// ficava travado nesse texto para sempre. Acontecia em qualquer falha de
// rede no meio de um salvamento.
function ocupado(botao, sim, textoOcupado = 'Aguarde…') {
  if (!botao) return;

  if (sim) {
    if (!botao.dataset.texto) botao.dataset.texto = botao.textContent;
    botao.textContent = textoOcupado;
    botao.disabled = true;
  } else {
    if (botao.dataset.texto) {
      botao.textContent = botao.dataset.texto;
      delete botao.dataset.texto;
    }
    botao.disabled = false;
  }
}

// Traduz o erro técnico para algo que a pessoa entende
function mensagemDeErro(erro) {
  console.error('Loen Soluções — erro:', erro);
  const m = (erro?.message || '').toLowerCase();

  if (m.includes('too many') || m.includes('rate limit') || erro?.status === 429)
    return 'Muitas tentativas seguidas. O servidor bloqueou por alguns minutos. ' +
           'Espere uns 15 minutos e tente de novo.';

  if (m.includes('could not find the function') || m.includes('schema cache'))
    return 'O banco de dados ainda não foi atualizado. Rode o arquivo 04-login-por-celular.sql no Supabase.';
  if (m.includes('invalid login'))       return 'Celular, e-mail ou senha não conferem. Tente de novo.';
  if (m.includes('e-mail já usado') ||
      m.includes('perfis_email_recuperacao_unico'))
                                         return 'Este e-mail já está em outra conta. Use outro.';
  if (m.includes('e-mail inválido'))     return 'Este e-mail parece incompleto. Confira.';
  if (m.includes('e-mail é obrigatório')) return 'Digite seu e-mail. É por ele que você recupera a senha.';
  if (m.includes('só a própria pessoa')) return 'Só a própria pessoa pode trocar o e-mail dela.';
  if (m.includes('already registered') ||
      m.includes('already been registered') ||
      m.includes('user already'))        return 'Este celular já tem conta. Toque em "Já tenho conta".';
  if (m.includes('weak') || m.includes('pwned')) return 'Esta senha é fácil de descobrir. Escolha outra.';
  if (m.includes('password'))            return 'A senha precisa ter pelo menos 8 caracteres.';
  if (m.includes('convite'))             return erro.message;
  if (m.includes('já foi criada'))       return 'Esta conta já está pronta. É só entrar.';
  if (m.includes('failed to fetch'))     return 'Sem conexão com o servidor. Verifique a internet.';

  // Mensagem técnica para conseguirmos diagnosticar durante os testes.
  // Trocar por texto amigável antes de abrir para os participantes.
  return 'Não deu certo. Detalhe técnico: ' + (erro?.message || 'sem mensagem');
}

// Mostrar e esconder senha
$$('.senha-caixa button').forEach(botao => {
  botao.addEventListener('click', () => {
    const campo = botao.previousElementSibling;
    const escondida = campo.type === 'password';
    campo.type = escondida ? 'text' : 'password';
    botao.textContent = escondida ? 'esconder' : 'mostrar';
  });
});


// Enter não envia o formulário. Ele passa para o campo seguinte.
// Sem isto, a pessoa envia o cadastro pela metade sem perceber.
$$('form').forEach(form => {
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') return;

    e.preventDefault();

    const campos = Array.from(
      form.querySelectorAll('input:not([type=hidden]), select')
    ).filter(c => c.offsetParent !== null);

    const proximo = campos[campos.indexOf(e.target) + 1];
    if (proximo) proximo.focus();
    else e.target.blur();
  });
});


// ------------------------------------------------------------
// 1. ENTRAR
// ------------------------------------------------------------

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  limparAviso('aviso-login');

  const digitado = $('#login-celular').value.trim();
  const senha = $('#login-senha').value;
  const botao = $('#btn-entrar');

  // Com @ é e-mail: quem confere é a função entrar-com-email, no
  // servidor, porque o login interno tem o celular dentro e não pode
  // vir para o navegador de quem só sabe o e-mail.
  if (digitado.includes('@')) {
    const email = limparEmail(digitado);
    if (!emailValido(email)) return aviso('aviso-login', 'Este e-mail parece incompleto. Confira.');

    ocupado(botao, true, 'Entrando…');
    const { data, error } = await sb.functions.invoke('entrar-com-email', {
      body: { email, senha }
    });

    if (error) {
      ocupado(botao, false);
      const status = error.context?.status;
      if (status === 429) return aviso('aviso-login', mensagemDeErro({ status: 429 }));
      if (status === 400) return aviso('aviso-login', mensagemDeErro({ message: 'invalid login' }));
      return aviso('aviso-login', mensagemDeErro(error));
    }

    const { error: erroSessao } = await sb.auth.setSession(data);
    ocupado(botao, false);
    if (erroSessao) return aviso('aviso-login', mensagemDeErro(erroSessao));
    return depoisDeEntrar();
  }

  const numero = limparCelular(digitado);
  if (!numero) return aviso('aviso-login', 'Digite o celular com DDD ou o seu e-mail. Exemplo: (31) 98842-7315');

  ocupado(botao, true, 'Entrando…');

  const { error } = await sb.auth.signInWithPassword({
    email: loginDoCelular(numero),
    password: senha
  });

  ocupado(botao, false);
  if (error) return aviso('aviso-login', mensagemDeErro(error));
  await depoisDeEntrar();
});


// ------------------------------------------------------------
// ESQUECI MINHA SENHA
//
// A função recuperar-senha, no servidor, acha a conta e manda o link
// para o e-mail de verdade. A resposta é sempre a mesma, exista a
// conta ou não — a tela não pode servir para descobrir quem usa o app.
// ------------------------------------------------------------

// Endereço do app para onde o link do e-mail vai levar. A função no
// servidor só aceita os endereços que ela conhece.
function enderecoDoApp() {
  return location.origin + location.pathname.replace(/[^/]*$/, '');
}

$('#btn-recuperar').addEventListener('click', () => {
  limparAviso('aviso-esqueci');
  $('#form-esqueci').style.display = '';
  // Aproveita o que ela já digitou na entrada.
  $('#es-usuario').value = $('#login-celular').value;
  abrirFolha('folha-esqueci');
});

$('#form-esqueci').addEventListener('submit', async (e) => {
  e.preventDefault();
  limparAviso('aviso-esqueci');

  const digitado = $('#es-usuario').value.trim();
  const corpo = { app: enderecoDoApp() };

  if (digitado.includes('@')) {
    corpo.email = limparEmail(digitado);
    if (!emailValido(corpo.email)) return aviso('aviso-esqueci', 'Este e-mail parece incompleto. Confira.');
  } else {
    corpo.celular = limparCelular(digitado);
    if (!corpo.celular) return aviso('aviso-esqueci', 'Digite o celular com DDD ou o seu e-mail.');
  }

  const botao = $('#btn-esqueci');
  ocupado(botao, true, 'Mandando…');
  const { error } = await sb.functions.invoke('recuperar-senha', { body: corpo });
  ocupado(botao, false);

  if (error) {
    return aviso('aviso-esqueci',
      'Não consegui mandar agora. Confira a internet e tente de novo daqui a pouco.');
  }

  $('#form-esqueci').style.display = 'none';
  aviso('aviso-esqueci',
    'Pronto. Se existir uma conta com esse ' + (corpo.email ? 'e-mail' : 'celular') +
    ', mandamos um link para o e-mail cadastrado. Ele chega em alguns minutos — ' +
    'olhe também a caixa de spam. O link vale por 1 hora.', 'ok');
});


// ------------------------------------------------------------
// SENHA NOVA — quem chega pelo link do e-mail
//
// O link traz um código (?recuperar=...). O app troca o código por
// uma sessão (verifyOtp), e com ela a pessoa grava a senha nova.
// ------------------------------------------------------------

async function abrirRecuperacao(codigo) {
  // Tira o código do endereço na hora: ele só vale uma vez, e não
  // deve ficar no histórico nem ir junto se ela copiar o endereço.
  history.replaceState(null, '', location.pathname);
  irPara('tela-nova-senha');

  // Uma sessão antiga no aparelho confundiria de quem é a senha nova.
  await sb.auth.signOut({ scope: 'local' });

  const { error } = await sb.auth.verifyOtp({ token_hash: codigo, type: 'recovery' });

  if (error) {
    $('#nova-senha-texto').textContent =
      'Este link não vale mais. Ele dura 1 hora e só funciona uma vez.';
    $('#ns-voltar').style.display = 'block';
    return;
  }

  $('#nova-senha-texto').textContent = 'Escolha a senha que você vai usar daqui para frente.';
  $('#form-nova-senha').style.display = 'block';
  $('#ns-senha').focus();
}

$('#ns-voltar').addEventListener('click', () => {
  irPara('tela-login');
  $('#btn-recuperar').click();
});

$('#form-nova-senha').addEventListener('submit', async (e) => {
  e.preventDefault();
  limparAviso('aviso-nova-senha');

  const s1 = $('#ns-senha').value, s2 = $('#ns-senha2').value;
  if (s1.length < 8) return aviso('aviso-nova-senha', 'A senha precisa ter pelo menos 8 caracteres.');
  if (s1 !== s2) return aviso('aviso-nova-senha', 'As duas senhas não estão iguais. Confira e tente de novo.');

  const botao = $('#btn-nova-senha');
  ocupado(botao, true, 'Salvando…');
  const { error } = await sb.auth.updateUser({ password: s1 });
  ocupado(botao, false);

  if (error) {
    const m = (error.message || '').toLowerCase();
    if (m.includes('different from the old'))
      return aviso('aviso-nova-senha', 'Essa já é a sua senha. Pode entrar com ela, ou escolha outra.');
    return aviso('aviso-nova-senha', mensagemDeErro(error));
  }

  await depoisDeEntrar();
});


// ------------------------------------------------------------
// 2. CRIAR CONTA — tela única
// ------------------------------------------------------------

$$('#escolha-equipe .escolha').forEach(botao => {
  botao.addEventListener('click', () => {
    $$('#escolha-equipe .escolha').forEach(b => b.classList.remove('marcada'));
    botao.classList.add('marcada');
    temEquipe = botao.dataset.equipe === 'sim';
  });
});

$('#form-cadastro').addEventListener('submit', async (e) => {
  e.preventDefault();
  limparAviso('aviso-cadastro');

  const nome = $('#c-nome').value.trim();
  const tipo = listaTipos.value;

  if (!tipo) return aviso('aviso-cadastro', 'Escolha o que você faz.');

  const numero = limparCelular($('#c-celular').value);
  if (!numero) return aviso('aviso-cadastro', 'Digite o celular com DDD. Exemplo: (31) 98842-7315');

  // O e-mail é digitado duas vezes pelo mesmo motivo da senha: é a
  // única porta de volta se ela esquecer a senha. E-mail digitado
  // errado é o mesmo que nenhum — o link nunca chega.
  const email = limparEmail($('#c-email').value);
  const problemaEmail = problemaNoEmail(email, limparEmail($('#c-email2').value));
  if (problemaEmail) return aviso('aviso-cadastro', problemaEmail);

  if (!loginJaCriado) {
    const s1 = $('#c-senha').value, s2 = $('#c-senha2').value;
    if (s1.length < 8) return aviso('aviso-cadastro', 'A senha precisa ter pelo menos 8 caracteres.');
    if (s1 !== s2) return aviso('aviso-cadastro', 'As duas senhas não estão iguais. Confira e tente de novo.');
  }

  const botao = $('#btn-cadastro');
  ocupado(botao, true, 'Criando sua conta…');

  // Passo A — cria o login, se ainda não existir
  if (!loginJaCriado) {
    const { error } = await sb.auth.signUp({
      email: loginDoCelular(numero),
      password: $('#c-senha').value
    });

    if (error) { ocupado(botao, false); return aviso('aviso-cadastro', mensagemDeErro(error)); }

    const { data } = await sb.auth.getSession();
    if (!data.session) {
      ocupado(botao, false);
      return aviso('aviso-cadastro',
        'Conta criada, mas a sessão não abriu. Desligue "Confirm email" no Supabase.');
    }
    loginJaCriado = true;
  }

  // Passo B — cria o negócio e o perfil
  const { error } = await sb.rpc('criar_conta', {
    p_nome:              nome,
    p_celular:           $('#c-celular').value.trim(),
    p_negocio_nome:      $('#c-negocio').value.trim() || null,
    p_tipo_atividade:    tipo === 'Outro'
                           ? ($('#c-outra-atividade').value.trim() || 'Outro')
                           : tipo,
    p_tem_equipe:        temEquipe,
    p_email_recuperacao: email
  });

  ocupado(botao, false);

  if (error) {
    // A sessão guardada aponta para um usuário que não existe mais
    // (apagado no painel durante os testes). Limpa e recomeça.
    const texto = (error.message || '') + (error.code || '');
    if (texto.includes('23503') || texto.toLowerCase().includes('foreign key')) {
      await sb.auth.signOut();
      localStorage.clear();
      aviso('aviso-cadastro',
        'Sua sessão antiga expirou. Recarregando para começar de novo…', 'ok');
      return setTimeout(() => location.reload(), 1500);
    }
    return aviso('aviso-cadastro', mensagemDeErro(error));
  }

  await depoisDeEntrar();
});


// ------------------------------------------------------------
// 3. CONVITE DE EQUIPE
// ------------------------------------------------------------

$('#form-convite').addEventListener('submit', async (e) => {
  e.preventDefault();
  limparAviso('aviso-convite');

  const numero = limparCelular($('#v-celular').value);
  if (!numero) return aviso('aviso-convite', 'Digite o celular com DDD.');

  const email = limparEmail($('#v-email').value);
  const problemaEmail = problemaNoEmail(email, limparEmail($('#v-email2').value));
  if (problemaEmail) return aviso('aviso-convite', problemaEmail);

  const s1 = $('#v-senha').value, s2 = $('#v-senha2').value;
  if (s1.length < 8) return aviso('aviso-convite', 'A senha precisa ter pelo menos 8 caracteres.');
  if (s1 !== s2) return aviso('aviso-convite', 'As duas senhas não estão iguais. Confira e tente de novo.');

  const botao = $('#btn-convite');
  ocupado(botao, true, 'Entrando…');

  const { error: erroCadastro } = await sb.auth.signUp({
    email: loginDoCelular(numero),
    password: $('#v-senha').value
  });

  if (erroCadastro) {
    ocupado(botao, false);
    return aviso('aviso-convite', mensagemDeErro(erroCadastro));
  }

  const { error } = await sb.rpc('aceitar_convite', {
    p_codigo:            $('#v-codigo').value.trim(),
    p_nome:              $('#v-nome').value.trim(),
    p_celular:           $('#v-celular').value.trim(),
    p_email_recuperacao: email
  });

  ocupado(botao, false);
  if (error) return aviso('aviso-convite', mensagemDeErro(error));
  await depoisDeEntrar();
});


// ------------------------------------------------------------
// 4. DEPOIS DE ENTRAR
// Tela provisória. O painel de Início entra no próximo bloco.
// ------------------------------------------------------------

async function depoisDeEntrar() {
  const id = await meuId();
  if (!id) return aviso('aviso-login', 'Sua sessão expirou. Entre de novo.');

  const { data: perfil } = await sb
    .from('perfis')
    .select('nome, papel, celular, negocios(nome, tipo_atividade)')
    .eq('id', id)
    .maybeSingle();

  // Tem login mas o negócio não foi criado: volta para terminar o cadastro
  if (!perfil) {
    loginJaCriado = true;
    $('#campo-senha').style.display = 'none';
    $('#campo-senha2').style.display = 'none';
    $('#c-senha2').removeAttribute('required');
    $('#c-senha').removeAttribute('required');
    $('#titulo-cadastro').textContent = 'Falta pouco';
    aviso('aviso-cadastro', 'Seu login já existe. Confirme os dados do negócio para terminar.', 'ok');
    return irPara('tela-cadastro');
  }

  await abrirApp();
}

// ------------------------------------------------------------
// 5. NAVEGAÇÃO
// ------------------------------------------------------------

$$('[data-ir]').forEach(el => {
  el.addEventListener('click', () => irPara(el.dataset.ir));
});


// ------------------------------------------------------------
// 6. ABERTURA
// ------------------------------------------------------------

async function iniciar() {
  // Chegou pelo link de "Esqueci minha senha"?
  const codigo = new URLSearchParams(location.search).get('recuperar');
  if (codigo) return abrirRecuperacao(codigo);

  const { data } = await sb.auth.getSession();
  if (data.session) await depoisDeEntrar();
}


// ------------------------------------------------------------
// Datas
// ------------------------------------------------------------

// Confere se a data faz sentido, e devolve o aviso a mostrar (ou null).
//
// O campo de data do celular deixa digitar qualquer coisa: um toque
// errado vira 2062 ou 0026 sem ninguém perceber, e aí o serviço some
// da lista, some do mês, e o dinheiro não bate.
function problemaNaData(iso, opcoes = {}) {
  if (!iso) return null;

  const [ano, mes, dia] = String(iso).slice(0, 10).split('-').map(Number);
  if (!ano || !mes || !dia) return 'Data inválida.';

  const anoAgora = new Date().getFullYear();
  if (ano < anoAgora - 5 || ano > anoAgora + 2) {
    return 'O ano ficou ' + ano + '. Confira a data.';
  }

  const hj = hoje();

  if (opcoes.naoPodeSerFutura && iso > hj) {
    return opcoes.mensagemFutura || 'Esta data ainda não chegou.';
  }
  if (opcoes.naoPodeSerPassada && iso < hj) {
    return opcoes.mensagemPassada || 'Esta data já passou.';
  }
  return null;
}


// ------------------------------------------------------------
// Rede de segurança
//
// Antes, qualquer erro não previsto — queda de internet no meio de um
// salvamento, resposta estranha do servidor — travava a tela em
// silêncio, com o botão preso em "Salvando…" para sempre.
//
// Em vez de espalhar try/catch por cima de cada função, o app escuta
// os erros que escaparam. Isso pega inclusive o que ninguém previu,
// que é justamente o caso perigoso.
// ------------------------------------------------------------

// Destrava todo botão que ficou preso, para a pessoa poder tentar de novo.
function destravarBotoes() {
  $$('button[data-texto]').forEach(b => {
    b.textContent = b.dataset.texto;
    delete b.dataset.texto;
    b.disabled = false;
  });
  $$('button:disabled').forEach(b => { b.disabled = false; });
}

function avisarFalha(erro) {
  console.error('Loen Soluções — erro não tratado:', erro);
  destravarBotoes();

  const msg = String(erro?.message || erro || '');
  const semRede = /fetch|network|failed to fetch|load failed/i.test(msg);

  const titulo = semRede ? 'Sem conexão' : 'Algo deu errado';
  const texto  = semRede
    ? 'Não consegui falar com o servidor. Confira sua internet e tente de novo — ' +
      'o que você digitou continua aí na tela.'
    : 'Tente de novo. Se continuar assim, toque no botão abaixo para ' +
      'avisar a equipe Loen — eu já mando junto o que estava acontecendo.';

  // Usa a folha do app quando ela existe; senão, o aviso simples.
  if (typeof avisarNaFolha === 'function' && document.getElementById('folha-pergunta')) {
    // Mandar a pessoa "ir em Ajustes" é devolver o problema para ela.
    // O botão leva direto ao WhatsApp da equipe, e leva junto o que
    // aconteceu — assim ninguém precisa adivinhar depois.
    const acao = semRede ? null : {
      rotulo: 'Avisar a equipe Loen',
      fazer: () => falarComAEquipe(msg)
    };
    avisarNaFolha(titulo, texto, acao);
  } else {
    alert(titulo + '\n\n' + texto);
  }
}

// Abre o WhatsApp da equipe com o contexto já preenchido.
// Serve para o botão do erro e para o item de Ajustes — um lugar só,
// para as duas mensagens nunca ficarem diferentes.
function falarComAEquipe(detalheTecnico) {
  const aba = document.querySelector('.abas button.ativa')?.textContent?.trim() || 'Início';

  let texto = 'Oi, equipe Loen! Achei um problema no app.\n\n' +
              'O que aconteceu: (conte aqui)\n\n' +
              '--- para a equipe ---\n' +
              'Tela: ' + aba + '\n';

  if (typeof estado !== 'undefined') {
    texto += 'Perfil: ' + (estado.perfil?.papel || '?') + '\n' +
             'Atividade: ' + (estado.negocio?.tipo_atividade || '?') + '\n';
  }
  texto += 'Quando: ' + new Date().toLocaleString('pt-BR') + '\n';
  if (detalheTecnico) texto += 'Detalhe: ' + String(detalheTecnico).slice(0, 200) + '\n';

  window.open('https://wa.me/5531971589587?text=' + encodeURIComponent(texto),
              '_blank', 'noopener');
}

// Promessa que falhou e ninguém pegou — é o caso mais comum aqui,
// porque quase tudo no app é uma chamada ao Supabase.
window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  avisarFalha(e.reason);
});

// Erro de código de verdade. Não mostra para a pessoa quando vem de
// script de fora (CDN), porque aí ela não tem o que fazer.
window.addEventListener('error', (e) => {
  if (e.filename && !e.filename.includes(location.host)) return;
  avisarFalha(e.error || e.message);
});

// Voltou a ter internet: recarrega os dados sozinho, para a tela não
// ficar mostrando o que estava valendo antes da queda.
window.addEventListener('online', () => {
  if (typeof recarregar === 'function' && document.getElementById('painel')?.classList.contains('ativo')) {
    recarregar().catch(() => {});
  }
});


// ------------------------------------------------------------
// Faixa de ambiente
//
// Fora de produção, o app avisa na cara. Sem isso é fácil registrar
// um serviço de teste no banco de verdade — ou pior, achar que
// apagou algo de teste e ter apagado dado de participante.
// ------------------------------------------------------------

if (!CONFIG.EH_PRODUCAO) {
  const faixa = document.createElement('div');
  faixa.className = 'faixa-ambiente';
  faixa.textContent = 'Banco de ' + CONFIG.AMBIENTE_NOME + ' — não é dado real';
  document.body.appendChild(faixa);
  document.body.classList.add('tem-faixa');
}
