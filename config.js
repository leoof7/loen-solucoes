// ============================================================
// LOEN SOLUÇÕES — Configuração
//
// O app escolhe o banco SOZINHO, pelo endereço em que está aberto.
// Ninguém edita este arquivo para trocar de ambiente — editar à mão
// é como se sobe código de teste para produção sem perceber.
//
//   No seu computador (localhost)  → HOMOLOGAÇÃO
//   No site publicado              → PRODUÇÃO
//
// Estas chaves são públicas por natureza: ficam visíveis no navegador
// de qualquer app do mundo. Quem protege os dados é a regra do banco
// (RLS), não o segredo da chave.
//
// A chave "secret" NUNCA entra aqui.
// ============================================================

const AMBIENTES = {

  // ---------- PRODUÇÃO ----------
  // Onde estão os participantes do piloto. Dado real, gente de verdade.
  producao: {
    nome: 'produção',
    SUPABASE_URL: 'https://rtisqipntpnvlhetfoeb.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_DBUZzakv9rl2sJIbOUOOYg_6Z2OAjec'
  },

  // ---------- HOMOLOGAÇÃO ----------
  // Onde se testa à vontade. Pode quebrar, pode apagar, pode errar.
  //
  // ENQUANTO ESTIVER VAZIO, o app cai em produção e mostra um aviso
  // no console — melhor avisar do que apontar para o lugar errado
  // em silêncio.
  homologacao: {
    nome: 'homologação',
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: ''
  }
};

// Onde este app está aberto agora?
//
// Qualquer coisa que não seja o site publicado é tratada como
// homologação: seu computador, a rede local, um celular espelhando
// a máquina. Assim o padrão é o lado seguro.
function ambienteAtual() {
  const host = location.hostname;

  const ehProducao =
    host === 'app.loenstudiocriativo.com.br' ||
    host === 'leoof7.github.io';

  return ehProducao ? 'producao' : 'homologacao';
}

const AMBIENTE = ambienteAtual();
const escolhido = AMBIENTES[AMBIENTE];

// Homologação ainda não existe: usa produção, mas avisa alto.
const usandoProducaoPorFalta = AMBIENTE === 'homologacao' && !escolhido.SUPABASE_URL;
const efetivo = usandoProducaoPorFalta ? AMBIENTES.producao : escolhido;

const CONFIG = {
  AMBIENTE: usandoProducaoPorFalta ? 'producao' : AMBIENTE,
  AMBIENTE_NOME: efetivo.nome,
  EH_PRODUCAO: (usandoProducaoPorFalta ? 'producao' : AMBIENTE) === 'producao',

  SUPABASE_URL: efetivo.SUPABASE_URL,
  SUPABASE_ANON_KEY: efetivo.SUPABASE_ANON_KEY,

  // Domínio interno do login por celular. O final .invalid é reservado
  // no mundo todo para endereço que não existe: nenhuma mensagem do
  // sistema consegue cair na caixa de um desconhecido.
  DOMINIO_CELULAR: 'celular.loen.invalid'
};

if (usandoProducaoPorFalta) {
  console.warn(
    '%c ATENÇÃO ',
    'background:#A31208;color:#fff;font-weight:bold',
    'Você está no seu computador, mas MEXENDO NO BANCO DE PRODUÇÃO — ' +
    'com os dados dos participantes de verdade.\n' +
    'Preencha AMBIENTES.homologacao no config.js para parar de correr esse risco.'
  );
} else {
  console.info('Loen Soluções — banco de ' + CONFIG.AMBIENTE_NOME);
}
