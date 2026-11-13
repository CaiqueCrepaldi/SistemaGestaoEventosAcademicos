# Política de Privacidade

**Versão 1 — 12/11/2026.** Este é o mesmo texto publicado na página
`/politica-de-privacidade` do sistema
(`frontend/src/pages/Legal/PoliticaDePrivacidadePage.tsx`): ao mudar um,
mude o outro. A versão vigente fica em `VERSAO_TERMOS_ATUAL`
(`backend/src/config/termos.ts`), publicada sempre junto com os Termos de Uso.

## 1. Quem trata os dados

O SGEA (Sistema de Gestão de Eventos Acadêmicos) é um protótipo acadêmico
desenvolvido como Projeto de Final de Curso na Universidade de Mogi das
Cruzes (UMC), pela equipe Caique Crepaldi e João Pedro Rachid de Abreu, sob
orientação do Prof. Bruno Messias Aguiar (o orientador acompanha o projeto
academicamente, mas não é controlador, encarregado nem responsável pelos
dados tratados).

- **Neste protótipo**, os responsáveis pelo tratamento são os integrantes
  da equipe citados acima.
- **Numa implantação real**, a controladora seria a própria Universidade de
  Mogi das Cruzes, com um encarregado (DPO) nomeado pela UMC.
- **Operadores** (tratam dados por conta do controlador, sob instrução):
  Vercel (hospedagem), TiDB Cloud (banco de dados) e SendGrid/Twilio (envio
  de e-mail), detalhados na seção 4.
- **Canal de privacidade:** a página "Meus dados", dentro do sistema, e o
  e-mail `privacidade@sgeacademicos.com.br` (seção 8).

## 2. Dados pessoais tratados

- **Aluno:** nome completo, RGM (matrícula) e e-mail institucional,
  informados no cadastro. Para confirmar que o e-mail é seu, o sistema envia
  a ele um código de 6 dígitos; até a confirmação, nome, e-mail, RGM e a
  senha (só como hash) ficam guardados provisoriamente por até 15 minutos.
  Sem a confirmação, esses dados são apagados e nenhuma conta é criada.
- **Professor e secretaria:** nome completo e e-mail institucional
  (`@umc.br`), informados ao criar a conta na tela Equipe: a conta de
  professor é criada pela secretaria ou pela administração; a de secretaria,
  só pela administração. Nada além disso. A pessoa recebe por e-mail um link
  de convite, válido por 24 horas e de uso único; a chave do link fica
  guardada só como hash. Ao usar o convite, ela define a senha e aceita os
  Termos de Uso.
- **E-mail de acesso:** cada e-mail identifica uma única conta em todo o
  sistema, qualquer que seja o perfil. O mesmo e-mail não é aceito para
  outra conta nem enquanto houver um cadastro em andamento com ele. O
  sistema compara e guarda o e-mail sempre em letras minúsculas e sem
  espaços.
- **Palestrante:** nome e e-mail, informados pela equipe ou pelo professor.
  O nome aparece na programação para quem está conectado, depois que o
  palestrante é aprovado pela equipe; o e-mail é visto só pela equipe e pelo
  professor que o cadastrou, é único entre os palestrantes e também é
  guardado em minúsculas. O palestrante não recebe e-mail do sistema. O
  canal de privacidade vale também para palestrantes.
- **Autenticação:** senha (nunca guardada em texto legível; ver seção 6) e,
  para quem decidir ativar a autenticação em dois fatores (opcional), uma
  chave secreta guardada cifrada e códigos de recuperação guardados só em
  forma irreversível.
- **Inscrições e check-in:** inscrições em eventos, o pedido de check-in
  feito pelo aluno (com a hora do pedido) e a decisão (aprovado ou recusado,
  com quem decidiu e quando). Quem não pede o check-in até o fim do prazo
  fica como ausente. Para recusar uma inscrição no mesmo horário de outra, o
  sistema consulta as inscrições do próprio aluno e informa o título e o
  horário do outro evento só a ele (ou a quem da equipe está fazendo a
  inscrição).
- **Evento cancelado:** se a equipe cancelar um evento aprovado antes do
  início, o sistema guarda quando, o motivo e quem cancelou. As inscrições
  não são apagadas: ficam no seu histórico, ligadas ao evento cancelado,
  que aparece para você com a etiqueta "Cancelado" e o motivo, sem nenhuma
  ação (não recebe inscrição, check-in, questionário, certificado nem
  avaliação). Quem cancelou é visto só pela equipe e pelo professor do
  evento. A inscrição no evento cancelado não impede você de se inscrever
  noutro evento no mesmo horário.
- **Questionário e certificado:** respostas ao questionário de cada evento
  e o resultado (acertos e percentual). Ao emitir um certificado, o sistema
  guarda uma cópia do que vai impresso nele (nome, RGM, evento, tema,
  palestrante, data e carga horária) e um código de validação. Dentro do
  sistema, o certificado é visto só pelo próprio aluno e pela equipe
  (secretaria e administração); o professor não acessa certificados.
- **Avaliações das palestras:** nota e comentário, enviados de forma
  opcional por quem teve a presença confirmada no evento (check-in
  aprovado), mesmo antes de responder o questionário. São vistas só pela
  equipe (secretaria e administração); o professor não acessa avaliações.
  Se a presença for desfeita (o que só é possível enquanto o aluno não
  respondeu o questionário), a avaliação é apagada junto.
- **Aprovação e histórico:** o que o professor cadastra passa pela aprovação
  da equipe. O histórico guarda cada envio, aprovação, recusa e proposta de
  alteração, com a data, o nome de quem agiu, o motivo da recusa e a
  resposta do professor.
- **Situação da conta:** se a equipe inativar uma conta (de aluno, de
  professor ou de secretaria), fica registrado o motivo, visível só para a
  equipe.
- **Registros de acesso e auditoria:** login (sucesso e falha), acesso
  negado, cadastro, check-in e alterações em registros críticos, para
  segurança e auditoria. Esses registros nunca guardam senha, código,
  e-mail, RGM nem textos livres como motivos e comentários.
- **Endereço IP:** usado só para bloquear por alguns minutos o excesso de
  tentativas no login, na recuperação de senha, no envio do código do
  cadastro, no link de convite da conta da equipe e na consulta pública de
  certificados.

**O que o professor vê dos alunos:** só nos eventos que ele criou, o nome, o
RGM, a situação do check-in e as notas do questionário dos alunos inscritos.
Ele usa esses dados só para organizar o evento e só inscreve alunos nos
eventos dele; não vê certificados, avaliações, alunos de outros eventos nem a
lista geral de alunos, e o Dashboard dele mostra só os números dos eventos
dele. No calendário, os eventos dos outros professores e da equipe aparecem
para ele só como "Sala ocupada", sem título, palestrante nem inscritos.

Não coletamos CPF, endereço, data de nascimento, foto ou dados de saúde.

## 3. Para que usamos cada dado

| Dado | Finalidade | Base legal |
|---|---|---|
| Nome, RGM, e-mail, senha | Criar e autenticar a conta | Execução de contrato a pedido do titular (art. 7º, V da LGPD) |
| Cadastro aguardando confirmação (nome, e-mail, RGM e hash da senha, por até 15 minutos) | Garantir que a conta e os certificados pertencem ao dono do e-mail | Procedimentos preliminares a pedido do titular (art. 7º, V) |
| Nome e e-mail do professor e da secretaria, convite (hash da chave) | Criar a conta da equipe: o professor cria e organiza os próprios eventos; a secretaria administra o sistema junto com a administração | Execução de contrato (art. 7º, V) |
| Dados dos alunos vistos pelo professor (nome, RGM, check-in e notas do questionário, só dos eventos dele; sem certificados nem avaliações) | Organizar o evento, decidir o check-in e acompanhar o resultado | Execução de contrato (art. 7º, V) |
| Histórico da aprovação e propostas de alteração | Registrar as decisões da equipe sobre o que o professor cadastra | Legítimo interesse da instituição na organização dos eventos (art. 7º, IX) |
| Inscrição e check-in (pedido, decisão, quem decidiu e quando) | Controlar as vagas, registrar a presença e liberar o questionário e o certificado | Execução de contrato (art. 7º, V) |
| Respostas do questionário | Calcular o aproveitamento e liberar o certificado | Execução de contrato (art. 7º, V) |
| Certificado emitido | Comprovar a participação: com o código, a consulta pública mostra só nome, evento, data e carga horária (nunca o RGM) | Execução de contrato (art. 7º, V) |
| Avisos por e-mail (inscrição, cancelamento, mudança no evento e evento cancelado) | Manter o aluno informado sobre os eventos em que está inscrito | Execução de contrato (art. 7º, V) |
| Avaliação da palestra | Avaliação do evento pela organização (envio opcional; vista só pela equipe) | Consentimento (art. 7º, I) |
| Motivo da inativação da conta | Registrar por que a conta foi inativada | Legítimo interesse da instituição na gestão dos eventos (art. 7º, IX) |
| Registros de acesso e auditoria | Detectar acesso indevido e investigar incidentes | Legítimo interesse em segurança (art. 7º, IX) e exercício regular de direitos (art. 7º, VI) |
| IP no limite de tentativas | Proteger as contas contra adivinhação de senha e o envio de códigos em massa | Legítimo interesse em segurança (art. 7º, IX) |
| Chave e códigos do 2FA | Proteger a sua conta, quando você decide ativar | A seu pedido (art. 7º, V) |
| Aceite dos Termos e da Política | Comprovar que você teve ciência das regras | Formalização do contrato (não é consentimento) |

## 4. Compartilhamento com terceiros

- **TiDB Cloud** (banco de dados): armazena os dados descritos acima.
- **SendGrid** (Twilio, envio de e-mail): envia somente estes e-mails:
  - o código de confirmação do cadastro do aluno;
  - o convite da conta de professor ou de secretaria (link para criar a
    senha);
  - o código de recuperação de senha;
  - o aviso de senha alterada pela página "Minha conta" (só a data e a hora
    da troca, nunca a senha);
  - a confirmação de inscrição (com a sala, no formato da UMC, e o tipo);
  - o aviso de inscrição cancelada pela equipe;
  - o aviso de mudança de sala, horário, carga horária ou palestrante num
    evento em que o aluno está inscrito;
  - o aviso de evento cancelado pela equipe (com o motivo informado), para
    cada inscrito e para o professor responsável pelo evento.

  Recebe o e-mail do destinatário e o conteúdo da mensagem (nos avisos,
  também o nome da pessoa e os dados do evento), só o necessário para
  entregar aquela mensagem.
- **Vercel** (hospedagem): processa toda requisição feita ao SGEA, o que
  inclui o endereço IP de origem e os dados enviados em cada tela.

Nenhum dado é vendido, usado para publicidade ou compartilhado para outra
finalidade. A autenticação em dois fatores usa um aplicativo autenticador no
seu celular, que gera os códigos no próprio aparelho: nenhum dado seu é
enviado a terceiros por causa do 2FA.

## 5. Transferência internacional e armazenamento no navegador

TiDB Cloud, SendGrid e Vercel têm infraestrutura nos Estados Unidos: usar o
SGEA implica que seus dados podem ser processados fora do Brasil. Como
protótipo acadêmico, essa transferência segue os termos padrão desses
provedores; numa implantação real, a instituição precisaria formalizar as
salvaguardas cabíveis (como cláusulas contratuais padrão).

O sistema não usa cookies. O navegador guarda só a sua sessão (o token de
acesso e os dados da conta mostrados na tela, como nome e perfil), apagada
ao sair ou quando a sessão expira.

## 6. Segurança

- Senhas são protegidas com hash forte e salt aleatório por senha (bcrypt)
  e nunca ficam gravadas em texto legível. Toda senha nova precisa ter de 8
  a 64 caracteres, com pelo menos uma letra maiúscula, um número e um
  caractere especial.
- Os códigos de confirmação do cadastro e de recuperação de senha ficam
  guardados só como hash, valem por 15 minutos e deixam de valer depois de 5
  tentativas erradas. A chave do convite da conta da equipe (professor ou
  secretaria) também fica só como hash, vale por 24 horas e só pode ser usada
  uma vez; um convite novo invalida o anterior. O envio de códigos é limitado por e-mail e por IP.
- O e-mail de acesso não pode ser alterado: ele identifica a sua conta.
- Nome, e-mail e RGM são dados pessoais comuns, guardados sem criptografia e
  protegidos por controle de acesso por perfil (cada perfil só vê o que
  precisa), conexão segura (HTTPS) e banco com acesso restrito. A chave do
  2FA fica cifrada.
- Toda regra de acesso é verificada no servidor, nunca só escondendo botões
  na tela.
- Autenticação em dois fatores por aplicativo autenticador, opcional para
  todos (página "Minha conta").
- Você pode trocar a sua senha a qualquer momento na página "Minha conta",
  informando a senha atual (e, com o 2FA ativo, o código do aplicativo ou um
  código de recuperação). Erros repetidos bloqueiam a troca por 15 minutos.
  Ao trocar, as outras sessões abertas da conta são encerradas, um código de
  recuperação de senha pedido antes deixa de valer e você recebe um aviso
  por e-mail, sem a senha.
- Tentativas de login em excesso bloqueiam o acesso por alguns minutos.
  Trocar a senha, inativar a conta ou mexer no 2FA encerra as sessões já
  abertas.
- Login, falhas de acesso, acessos negados e alterações críticas ficam
  registrados numa trilha de auditoria que não pode ser editada nem apagada
  pelo sistema e que só a administração consulta.
- Os e-mails do sistema seguem um modelo único, sem imagens nem conteúdo de
  fora, com a versão em texto puro junto, e nunca levam senha.

## 7. Por quanto tempo guardamos os dados

- **Cadastro aguardando confirmação:** apagado ao concluir o cadastro (os
  dados passam para a conta) ou depois de expirar. Sem confirmação, o código
  deixa de valer em 15 minutos, e os dados são apagados na próxima vez que
  alguém entrar no sistema ou fizer um cadastro.
- **Convite da conta da equipe:** apagado quando é usado ou quando a conta
  que ainda esperava o convite é excluída; um convite novo substitui o
  anterior.
- **Conta de professor ou de secretaria:** permanece enquanto a pessoa faz
  parte da equipe. Na tela Equipe, a administração gerencia professores e
  secretarias, e a secretaria só professores; ninguém altera a própria conta
  por essa tela, e o sistema sempre mantém pelo menos um administrador
  ativo. Inativar encerra as sessões abertas (os eventos em aberto do
  professor passam antes para outro professor ou para a equipe). Só é
  possível excluir conta inativa ou que ainda não usou o convite (por
  exemplo, criada com o e-mail errado). Quem tem histórico no sistema
  (eventos ou palestrantes criados, decisões de aprovação, propostas,
  check-ins decididos ou pedidos de titular atendidos) não é excluído: a
  conta fica preservada como inativa. Os registros de auditoria ficam em
  qualquer caso.
- **Conta do aluno:** permanece enquanto você usa o sistema. A secretaria pode
  inativar a conta (o histórico de inscrições e certificados é preservado)
  e só pode excluí-la definitivamente depois de inativada. A exclusão apaga
  a conta e o histórico vinculado (inscrições, avaliações e tentativas de
  questionário) de forma permanente.
- **Quem já tem certificado emitido** não tem a conta excluída: o
  certificado é a prova da participação e precisa continuar válido (numa
  conferência de horas complementares, por exemplo). Nesse caso a conta
  fica inativada, sem acesso ao sistema, e o registro do certificado é
  mantido.
- **Avaliação:** você pode excluir a sua a qualquer momento e enviar outra.
  Se a sua presença no evento for desfeita, a avaliação é apagada junto.
- **Palestrante:** o cadastro permanece enquanto for útil para a
  programação. A equipe só o exclui depois de aprová-lo ou recusá-lo (e de
  decidir a proposta de alteração que estiver aguardando), e nunca enquanto
  ele estiver ligado a um evento.
- **Registros de auditoria:** guardados por até 5 anos e nunca editados ou
  apagados pelas telas do sistema.
- **Cópias de segurança:** o provedor do banco faz uma cópia por dia, que
  expira em 1 dia. Um dado excluído pode continuar numa cópia já feita por
  no máximo 24 horas.

## 8. Seus direitos

Na página **"Minha conta"**, qualquer pessoa conectada vê a versão destes
termos que aceitou e quando, e abre os Termos de Uso e esta Política.

Na página **"Meus dados"**, no menu do sistema depois que você entra com a
sua conta de aluno, você vê tudo o que o SGEA guarda sobre você: dados
cadastrais, aceite dos termos, situação do 2FA, inscrições e check-in (pedido
e decisão), resultados dos questionários, certificados e avaliações.

Os demais pedidos são feitos pelo e-mail `privacidade@sgeacademicos.com.br`
e respondidos em até 15 dias:

- Cópia dos seus dados para levar a outro serviço (portabilidade).
- Correção de dados: nome e RGM podem ser corrigidos pelo canal de
  privacidade. O e-mail não pode ser alterado, porque é a identificação de
  acesso. Se o seu e-mail institucional mudar, escreva para o canal de
  privacidade e a equipe analisa o caso.
- Exclusão da conta e dos dados (veja na seção 7 o caso de quem já tem
  certificado, que tem a conta inativada).
- Revisão humana do resultado do questionário, que é calculado
  automaticamente e libera o certificado (art. 20 da LGPD). A revisão
  confere se a correção foi feita certo; não é uma nova tentativa: quem não
  atinge o mínimo nas 2 tentativas permitidas não recebe o certificado
  daquele evento.
- Oposição ao tratamento, informação sobre com quem seus dados são
  compartilhados e qualquer outro pedido sobre seus dados.

Professores, secretarias e palestrantes fazem os pedidos pelo mesmo e-mail.

## 9. Incidentes de segurança

Em caso de incidente que exponha dados pessoais com risco ou dano relevante,
a equipe responsável avalia o risco e comunica os titulares afetados e,
quando exigido, a Autoridade Nacional de Proteção de Dados (ANPD), no prazo
regulatório aplicável.

---

*Versão 1 — 12/11/2026. Quando este texto mudar, a nova versão é publicada
nesta página com a data, e a versão que você aceitou fica registrada na sua
conta.*
