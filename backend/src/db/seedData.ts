// dados de demo carregados em memoria quando o servidor sobe
// mesmas contas do mock do frontend (frontend/src/services/seed.ts)
// some tudo a cada restart, o "banco" eh so em memoria (ver repositorio.ts)
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import type { Evento, Feedback, Inscricao, Palestrante, Participante, PerguntaQuestionario, Sala, Usuario } from "../types/domain";

const agora = new Date().toISOString();

// hashSync em vez do gerarHashSenha async, roda uma vez so no carregamento do modulo
function hashSincrono(senha: string): string {
  return bcrypt.hashSync(senha, 10);
}

// monta as 10 perguntas a partir de uma lista compacta (enunciado + 4 alternativas + indice da correta)
// mesma estrutura do seed do frontend
function montarQuestionario(
  itens: { enunciado: string; alternativas: [string, string, string, string]; correta: 0 | 1 | 2 | 3 }[],
): PerguntaQuestionario[] {
  return itens.map((item, indice) => ({
    id: `q${indice + 1}`,
    enunciado: item.enunciado,
    alternativas: item.alternativas.map((texto, i) => ({ texto, correta: i === item.correta })),
  }));
}

export const salasSeed: Sala[] = [
  { id: randomUUID(), nome: "Auditório A", capacidade: 120 },
  { id: randomUUID(), nome: "Sala 204", capacidade: 40 },
  { id: randomUUID(), nome: "Laboratório de Informática 1", capacidade: 30 },
];
const [salaAuditorio, sala204, salaLab1] = salasSeed;

export const palestrantesSeed: Palestrante[] = [
  {
    id: randomUUID(),
    nome: "Dra. Mariana Costa",
    email: "mariana.costa@umc.br",
    telefone: "(11) 98888-1111",
  },
  {
    id: randomUUID(),
    nome: "Msc. Felipe Andrade",
    email: "felipe.andrade@umc.br",
    telefone: "(11) 97777-2222",
  },
];
const [palestranteMariana, palestranteFelipe] = palestrantesSeed;

const questionarioIA = montarQuestionario([
  { enunciado: "O que é Inteligência Artificial, de forma geral?", alternativas: ["Um sistema capaz de simular capacidades cognitivas humanas", "Um tipo de banco de dados relacional", "Uma linguagem de programação", "Um protocolo de rede"], correta: 0 },
  { enunciado: "O que é Machine Learning?", alternativas: ["Um subcampo da IA em que sistemas aprendem padrões a partir de dados", "Um tipo de servidor web", "Uma técnica de compressão de imagens", "Um framework de front-end"], correta: 0 },
  { enunciado: "Qual exemplo abaixo é uma aplicação de IA na educação?", alternativas: ["Sistemas adaptativos que personalizam o conteúdo pro aluno", "Um editor de texto simples", "Um roteador Wi-Fi", "Uma planilha eletrônica"], correta: 0 },
  { enunciado: "O que são dados de treinamento em um modelo de IA?", alternativas: ["O conjunto de exemplos usado para o modelo aprender padrões", "O manual de instalação do software", "A senha de acesso ao sistema", "O layout da interface gráfica"], correta: 0 },
  { enunciado: "O que é um chatbot educacional?", alternativas: ["Um assistente virtual que interage com o aluno tirando dúvidas", "Um tipo de impressora", "Um cabo de rede", "Um sistema operacional"], correta: 0 },
  { enunciado: "Qual é um risco conhecido do uso de IA na correção automática de provas?", alternativas: ["Viés herdado dos dados usados para treinar o modelo", "Consumo de papel", "Incompatibilidade com lousas digitais", "Aumento do tempo de recreio"], correta: 0 },
  { enunciado: "O que é aprendizado adaptativo?", alternativas: ["Ajustar o ritmo/conteúdo do ensino conforme o desempenho do aluno", "Trocar o professor a cada semana", "Aumentar o número de provas", "Reduzir a carga horária do curso"], correta: 0 },
  { enunciado: "O que caracteriza um sistema de recomendação de conteúdo?", alternativas: ["Sugerir materiais com base no histórico e perfil do usuário", "Bloquear o acesso à internet", "Imprimir relatórios em papel", "Criar senhas aleatórias"], correta: 0 },
  { enunciado: "Por que a ética é um tema importante ao aplicar IA na educação?", alternativas: ["Envolve dados sensíveis de alunos e decisões que afetam seu aprendizado", "Porque encarece o hardware", "Porque exige mais espaço físico na sala", "Porque reduz a velocidade da internet"], correta: 0 },
  { enunciado: "O que é processamento de linguagem natural (PLN)?", alternativas: ["Área da IA que permite a máquina entender e gerar linguagem humana", "Um tipo de cabo de fibra óptica", "Um protocolo de impressão", "Um formato de arquivo de imagem"], correta: 0 },
]);

const questionarioMicrosservicos = montarQuestionario([
  { enunciado: "O que é uma arquitetura de microsserviços?", alternativas: ["Um sistema dividido em serviços pequenos e independentes", "Um único programa monolítico", "Um tipo de banco de dados", "Uma linguagem de marcação"], correta: 0 },
  { enunciado: "Qual a principal vantagem de microsserviços sobre uma arquitetura monolítica?", alternativas: ["Serviços podem ser implantados e escalados independentemente", "Menos código no total", "Não precisa de testes", "Elimina a necessidade de banco de dados"], correta: 0 },
  { enunciado: "O que normalmente é usado para a comunicação entre microsserviços?", alternativas: ["APIs (REST, gRPC) ou mensageria", "Disquetes", "Impressão em papel", "E-mail manual entre desenvolvedores"], correta: 0 },
  { enunciado: "O que é um API Gateway?", alternativas: ["Um ponto único de entrada que roteia requisições aos serviços internos", "Um tipo de teclado", "Um sistema de arquivos", "Um editor de código"], correta: 0 },
  { enunciado: "O que é 'service discovery' em microsserviços?", alternativas: ["Mecanismo para localizar dinamicamente instâncias de serviços", "Um antivírus", "Uma ferramenta de design gráfico", "Um formato de imagem"], correta: 0 },
  { enunciado: "Por que containers (como Docker) são comuns em microsserviços?", alternativas: ["Empacotam o serviço com suas dependências de forma isolada e portátil", "Porque aumentam o tamanho do código-fonte", "Porque substituem o sistema operacional", "Porque eliminam a necessidade de rede"], correta: 0 },
  { enunciado: "O que é resiliência em sistemas distribuídos?", alternativas: ["A capacidade do sistema de continuar funcionando mesmo com falhas parciais", "A velocidade máxima da CPU", "O tamanho do banco de dados", "A cor da interface do sistema"], correta: 0 },
  { enunciado: "O que é o padrão 'circuit breaker'?", alternativas: ["Um mecanismo que evita chamadas repetidas a um serviço que está falhando", "Um tipo de fonte de energia", "Um protocolo de e-mail", "Um formato de arquivo de log"], correta: 0 },
  { enunciado: "Cada microsserviço geralmente deve ter:", alternativas: ["Seu próprio banco de dados/armazenamento dedicado", "Acesso irrestrito ao banco de todos os outros serviços", "O mesmo código dos demais serviços", "Nenhuma forma de monitoramento"], correta: 0 },
  { enunciado: "Qual é um desafio conhecido de arquiteturas de microsserviços?", alternativas: ["Maior complexidade operacional e de monitoramento distribuído", "Impossibilidade de usar containers", "Ausência total de rede", "Incompatibilidade com qualquer linguagem de programação"], correta: 0 },
]);

const questionarioReact = montarQuestionario([
  { enunciado: "O que é React?", alternativas: ["Uma biblioteca JavaScript para construção de interfaces", "Um banco de dados NoSQL", "Um servidor web", "Uma linguagem de programação"], correta: 0 },
  { enunciado: "O que é um componente em React?", alternativas: ["Uma unidade reutilizável de interface, geralmente uma função", "Um arquivo de configuração do servidor", "Um tipo de banco de dados", "Um protocolo de rede"], correta: 0 },
  { enunciado: "Para que serve o hook useState?", alternativas: ["Para declarar e atualizar estado dentro de um componente", "Para conectar ao banco de dados", "Para estilizar a página com CSS", "Para compilar o projeto"], correta: 0 },
  { enunciado: "O que é o JSX?", alternativas: ["Uma extensão de sintaxe que mistura HTML com JavaScript", "Um formato de imagem", "Um tipo de banco de dados", "Um protocolo de autenticação"], correta: 0 },
  { enunciado: "Para que serve o hook useEffect?", alternativas: ["Para executar efeitos colaterais, como buscar dados, após a renderização", "Para criar variáveis CSS", "Para compactar arquivos", "Para gerenciar permissões de usuário"], correta: 0 },
  { enunciado: "O que são 'props' em React?", alternativas: ["Dados passados de um componente pai para um componente filho", "Um tipo de banco de dados", "Um servidor de e-mail", "Um framework de testes"], correta: 0 },
  { enunciado: "O que é o Virtual DOM?", alternativas: ["Uma representação em memória da interface, usada para otimizar atualizações", "Um disco rígido virtual", "Um tipo de banco de dados", "Um protocolo de rede sem fio"], correta: 0 },
  { enunciado: "Como React lida com a atualização da tela quando o estado muda?", alternativas: ["Recalcula o Virtual DOM e atualiza só o que mudou de fato", "Recarrega a página inteira do zero sempre", "Não atualiza nada automaticamente", "Envia um e-mail para o desenvolvedor"], correta: 0 },
  { enunciado: "O que é React Router usado para?", alternativas: ["Gerenciar a navegação entre páginas/rotas em uma aplicação React", "Roteamento de pacotes de rede física", "Gerenciamento de banco de dados", "Compilação de CSS"], correta: 0 },
  { enunciado: "O que caracteriza um componente 'controlado' em um formulário React?", alternativas: ["Seu valor é controlado pelo estado do React via props/state", "Ele nunca pode ser editado pelo usuário", "Ele roda fora do navegador", "Ele substitui o HTML por completo"], correta: 0 },
]);

const questionarioPosteres = montarQuestionario([
  { enunciado: "Qual é o principal objetivo de uma sessão de apresentação de pôsteres?", alternativas: ["Divulgar resultados de pesquisa de forma visual e objetiva", "Vender produtos comerciais", "Substituir a defesa oral do trabalho", "Divulgar vagas de emprego"], correta: 0 },
  { enunciado: "O que costuma compor a estrutura de um pôster científico?", alternativas: ["Introdução, metodologia, resultados e conclusão", "Somente uma lista de referências", "Apenas imagens sem texto", "Somente o título do trabalho"], correta: 0 },
  { enunciado: "Por que a Iniciação Científica é importante na graduação?", alternativas: ["Introduz o aluno à prática de pesquisa e ao método científico", "É obrigatória só para quem quer ser professor", "Substitui todas as disciplinas do curso", "Não tem relação com o curso do aluno"], correta: 0 },
  { enunciado: "O que é um resumo (abstract) de um trabalho científico?", alternativas: ["Uma síntese breve do objetivo, método e principais resultados", "A bibliografia completa do trabalho", "O currículo do autor", "O agradecimento aos financiadores"], correta: 0 },
  { enunciado: "O que caracteriza uma boa metodologia de pesquisa?", alternativas: ["Ser clara, reprodutível e adequada ao problema estudado", "Ser secreta e não divulgada", "Não precisar de nenhuma justificativa", "Ser copiada de outro trabalho sem citação"], correta: 0 },
  { enunciado: "Por que citar as fontes usadas em um trabalho é importante?", alternativas: ["Para dar crédito aos autores originais e evitar plágio", "Para aumentar artificialmente o número de páginas", "Porque é uma exigência apenas estética", "Porque deixa o texto mais colorido"], correta: 0 },
  { enunciado: "O que é uma hipótese de pesquisa?", alternativas: ["Uma suposição testável que orienta a investigação", "Um resultado já comprovado e definitivo", "O nome do orientador do projeto", "O local onde a pesquisa foi feita"], correta: 0 },
  { enunciado: "Qual é o papel do orientador em um projeto de Iniciação Científica?", alternativas: ["Orientar metodologicamente o aluno ao longo da pesquisa", "Escrever o trabalho inteiro no lugar do aluno", "Avaliar apenas a apresentação final, sem acompanhar o processo", "Nenhum papel formal"], correta: 0 },
  { enunciado: "O que geralmente se espera na seção de 'resultados' de um pôster?", alternativas: ["Dados obtidos na pesquisa, muitas vezes em gráficos ou tabelas", "Somente opiniões pessoais do autor", "Uma lista de agradecimentos", "O cronograma de outra pesquisa"], correta: 0 },
  { enunciado: "Por que perguntas da plateia durante a sessão de pôsteres são importantes?", alternativas: ["Ajudam o autor a esclarecer pontos e aprimorar a pesquisa", "Servem apenas para constranger o apresentador", "Não têm nenhuma utilidade acadêmica", "São proibidas nesse tipo de evento"], correta: 0 },
]);

export const eventosSeed: Evento[] = [
  {
    id: randomUUID(),
    titulo: "Abertura e Palestra Magna: IA na Educação",
    horario: "2026-09-14T09:00:00-03:00",
    salaId: salaAuditorio.id,
    palestranteId: palestranteMariana.id,
    tema: "Inteligência Artificial aplicada à Educação",
    cargaHoraria: 2,
    questionario: questionarioIA,
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    titulo: "Minicurso: Arquitetura de Microsserviços",
    horario: "2026-09-14T14:00:00-03:00",
    salaId: sala204.id,
    palestranteId: palestranteFelipe.id,
    tema: "Arquitetura de Microsserviços na prática",
    cargaHoraria: 4,
    questionario: questionarioMicrosservicos,
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    titulo: "Workshop Prático: React na Prática",
    horario: "2026-09-15T10:00:00-03:00",
    salaId: salaLab1.id,
    palestranteId: palestranteFelipe.id,
    tema: "Desenvolvimento front-end com React",
    cargaHoraria: 4,
    questionario: questionarioReact,
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    titulo: "Sessão de Apresentação de Pôsteres",
    horario: "2026-10-05T13:30:00-03:00",
    salaId: sala204.id,
    palestranteId: palestranteMariana.id,
    tema: "Iniciação Científica: pôsteres e resultados",
    cargaHoraria: 3,
    questionario: questionarioPosteres,
    criadoEm: agora,
  },
];
const [eventoAbertura, eventoMicrosservicos] = eventosSeed;

export const participantesSeed: Participante[] = [
  { id: randomUUID(), nome: "João Pedro Lima", email: "joao.lima@aluno.umc.br", rgm: "20240100111", criadoEm: agora },
  { id: randomUUID(), nome: "Beatriz Fernandes", email: "beatriz.fernandes@aluno.umc.br", rgm: "20240100222", criadoEm: agora },
  { id: randomUUID(), nome: "Lucas Martins", email: "lucas.martins@aluno.umc.br", rgm: "20230100333", criadoEm: agora },
];
const [participanteJoao, participanteBeatriz, participanteLucas] = participantesSeed;

export const usuariosSeed: Usuario[] = [
  {
    id: randomUUID(),
    nome: "Ana Ribeiro",
    emailLogin: "admin@umc.br",
    senhaHash: hashSincrono("admin123"),
    perfil: "ADMINISTRADOR",
    rgm: null,
    participanteId: null,
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    nome: "Carlos Souza",
    emailLogin: "secretaria@umc.br",
    senhaHash: hashSincrono("secretaria123"),
    perfil: "SECRETARIA",
    rgm: null,
    participanteId: null,
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    nome: "João Pedro Lima",
    emailLogin: "aluno@aluno.umc.br",
    senhaHash: hashSincrono("aluno123"),
    perfil: "ALUNO",
    rgm: "20240100111",
    participanteId: participanteJoao.id,
    criadoEm: agora,
  },
];
const [usuarioAdmin] = usuariosSeed;

export const inscricoesSeed: Inscricao[] = [
  {
    id: randomUUID(),
    participanteId: participanteJoao.id,
    eventoId: eventoAbertura.id,
    statusPresenca: "PRESENTE",
    dataCheckin: "2026-09-14T09:05:00-03:00",
    usuarioId: usuarioAdmin.id,
    dataInscricao: agora,
  },
  {
    id: randomUUID(),
    participanteId: participanteBeatriz.id,
    eventoId: eventoAbertura.id,
    statusPresenca: "PENDENTE",
    dataCheckin: null,
    usuarioId: null,
    dataInscricao: agora,
  },
  {
    id: randomUUID(),
    participanteId: participanteLucas.id,
    eventoId: eventoMicrosservicos.id,
    statusPresenca: "PENDENTE",
    dataCheckin: null,
    usuarioId: null,
    dataInscricao: agora,
  },
  {
    id: randomUUID(),
    participanteId: participanteJoao.id,
    eventoId: eventoMicrosservicos.id,
    statusPresenca: "AUSENTE",
    dataCheckin: null,
    usuarioId: null,
    dataInscricao: agora,
  },
];

export const feedbacksSeed: Feedback[] = [
  {
    id: randomUUID(),
    eventoId: eventoAbertura.id,
    participanteId: participanteJoao.id,
    nota: 5,
    comentario: "Evento muito bem organizado, ótimas palestras.",
    criadoEm: agora,
  },
  {
    id: randomUUID(),
    eventoId: eventoAbertura.id,
    participanteId: participanteBeatriz.id,
    nota: 4,
    comentario: "Gostei bastante, só achei o intervalo curto.",
    criadoEm: agora,
  },
];
