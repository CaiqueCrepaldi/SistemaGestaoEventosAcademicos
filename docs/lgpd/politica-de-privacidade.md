# Política de Privacidade

**Versão 4 — 09/11/2026.** Substitui a Versão 3 (06/11/2026). Este é o mesmo texto
publicado na página `/politica-de-privacidade` do sistema
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

- **Identificação e contato (aluno):** nome completo, RGM (matrícula) e
  e-mail institucional, informados no cadastro.
- **Confirmação do e-mail no cadastro:** ao criar a conta, o sistema envia
  um código de 6 dígitos ao e-mail institucional para confirmar que o
  endereço é seu. Até a confirmação, nome, e-mail, RGM e a senha (só como
  hash) ficam guardados provisoriamente por até 15 minutos. Se o código não
  for confirmado, esses dados são apagados e nenhuma conta é criada.
- **Autenticação:** senha (nunca guardada em texto puro; ver seção 6).
- **Dados acadêmicos:** inscrições em eventos, confirmações de presença
  (check-in), respostas ao questionário de cada evento, resultado
  (aprovação ou reprovação) e feedback enviado sobre as palestras.
- **Certificados emitidos:** ao emitir um certificado, o sistema guarda uma
  cópia do que vai impresso nele (nome, RGM, evento, data e carga horária)
  e um código de validação.
- **Registros de acesso:** login (sucesso e falha), acesso negado,
  cadastro e alterações em registros críticos, para segurança e auditoria.
  Esses registros nunca guardam senha, código, e-mail ou RGM.
- **Endereço IP:** usado só para bloquear por alguns minutos o excesso de
  tentativas no login, na recuperação de senha, no envio do código do
  cadastro e na consulta pública de certificados.
- **Autenticação em dois fatores:** para quem decidir ativar (é opcional),
  uma chave secreta guardada cifrada e códigos de recuperação guardados
  apenas em forma irreversível.
- **Situação da conta:** se a secretaria inativar sua conta, fica
  registrado o motivo, visível só para a equipe.
- **Identificação e contato (palestrante):** nome e e-mail, informados pela
  equipe ou pelo professor ao cadastrar o evento. O nome aparece na agenda
  para quem está conectado (só depois de o palestrante ser aprovado pela
  equipe); o e-mail é visto só pela equipe e pelo professor que o cadastrou.
  O canal de privacidade vale também para palestrantes.
- **Identificação e contato (professor):** nome completo e e-mail
  institucional (`@umc.br`), informados pela administração ou pela
  secretaria ao criar a conta. Nada além disso. A conta só fica ativa depois
  do primeiro acesso, em que o professor informa o código de 6 dígitos
  enviado ao e-mail (guardado só como hash, vale 24 horas), define a senha
  e aceita os Termos de Uso.
- **Aprovação de eventos e palestrantes:** o que o professor cadastra passa
  pela aprovação da equipe. O histórico guarda cada envio, aprovação e
  recusa, com a data, o nome de quem agiu, o motivo da recusa e a resposta
  do professor.

**O que o professor vê dos alunos:** só nos eventos que ele criou, o nome,
o RGM, a presença, as notas do questionário e as avaliações enviadas pelos
alunos inscritos. Ele usa esses dados só para organizar o evento e registrar
a presença; não vê alunos de outros eventos nem a lista geral de alunos.

Não coletamos CPF, endereço, data de nascimento, foto ou dados de saúde.

## 3. Para que usamos cada dado

| Dado | Finalidade | Base legal |
|---|---|---|
| Nome, RGM, e-mail, senha | Criar e autenticar a conta | Execução de contrato a pedido do titular (art. 7º, V da LGPD) |
| Nome e e-mail do professor, código do primeiro acesso | Criar a conta do professor e permitir que ele crie e organize os próprios eventos e registre a presença | Execução de contrato (art. 7º, V) |
| Dados dos alunos vistos pelo professor (nome, RGM, presença, notas e avaliações, só dos eventos dele) | Organizar o evento, registrar a presença e acompanhar o resultado | Execução de contrato (art. 7º, V) |
| Histórico da aprovação (quem enviou, aprovou ou recusou, motivo e resposta) | Registrar as decisões da equipe sobre o que o professor cadastra | Legítimo interesse da instituição na organização dos eventos (art. 7º, IX) |
| Cadastro aguardando confirmação (nome, e-mail, RGM e hash da senha, por até 15 minutos) | Garantir que a conta e os certificados pertencem ao dono do e-mail | Procedimentos preliminares a pedido do titular (art. 7º, V) |
| Inscrição e presença | Controlar as vagas e liberar o questionário e o certificado | Execução de contrato (art. 7º, V) |
| Respostas do questionário | Calcular o aproveitamento e liberar o certificado | Execução de contrato (art. 7º, V) |
| Certificado emitido | Comprovar a participação: com o código, a consulta pública mostra só nome, evento, data e carga horária (nunca o RGM) | Execução de contrato (art. 7º, V) |
| Feedback da palestra | Avaliação do evento pela organização (envio opcional) | Consentimento (art. 7º, I) |
| Registros de acesso e auditoria | Detectar acesso indevido e investigar incidentes | Legítimo interesse em segurança (art. 7º, IX) e exercício regular de direitos (art. 7º, VI) |
| IP no limite de tentativas | Proteger as contas contra adivinhação de senha e o envio de códigos em massa | Legítimo interesse em segurança (art. 7º, IX) |
| Chave e códigos do 2FA | Proteger a sua conta, quando você decide ativar | A seu pedido (art. 7º, V) |
| Aceite dos Termos e da Política | Comprovar que você teve ciência das regras | Formalização do contrato (não é consentimento) |

## 4. Compartilhamento com terceiros

- **TiDB Cloud** (banco de dados): armazena os dados descritos acima.
- **SendGrid** (Twilio, envio de e-mail): envia o código de confirmação do
  cadastro, o código do primeiro acesso do professor, o código de
  recuperação de senha e os avisos de confirmação e de cancelamento de
  inscrição. Recebe o e-mail do destinatário e o conteúdo
  da mensagem (nos avisos de inscrição, também o nome do aluno), só o
  necessário para entregar aquela mensagem.
- **Vercel** (hospedagem): processa toda requisição feita ao SGEA, o que
  inclui o endereço IP de origem e os dados enviados em cada tela.

Nenhum dado é vendido, usado para publicidade ou compartilhado para outra
finalidade. A autenticação em dois fatores usa um aplicativo autenticador
no seu celular, que gera os códigos no próprio aparelho: nenhum dado seu é
enviado a terceiros por causa do 2FA.

## 5. Transferência internacional e armazenamento no navegador

TiDB Cloud, SendGrid e Vercel têm infraestrutura nos Estados Unidos: usar o
SGEA implica que seus dados podem ser processados fora do Brasil. Como
protótipo acadêmico, essa transferência segue os termos padrão desses
provedores; numa implantação real, a instituição precisaria formalizar as
salvaguardas cabíveis (por exemplo, cláusulas contratuais padrão).

O sistema não usa cookies. O navegador guarda só a sua sessão (o token de
acesso e os dados da conta mostrados na tela, como nome e perfil), apagada
ao sair ou quando a sessão expira.

## 6. Segurança

- Senhas são protegidas com hash forte e salt aleatório por senha (bcrypt)
  e nunca ficam gravadas em texto legível. Toda senha nova precisa ter de 8
  a 64 caracteres, com pelo menos uma letra maiúscula, um número e um
  caractere especial.
- O código de confirmação do cadastro também fica guardado só como hash,
  vale por 15 minutos e deixa de valer depois de 5 tentativas erradas. O
  envio de códigos é limitado por e-mail e por IP.
- O e-mail de acesso não pode ser alterado depois do cadastro: ele foi
  confirmado por código e identifica a sua conta.
- Nome, e-mail e RGM são dados pessoais comuns, guardados sem criptografia
  e protegidos por controle de acesso por perfil (cada perfil só vê o que
  precisa), conexão segura (HTTPS) e banco com acesso restrito. A chave do
  2FA fica cifrada.
- Toda regra de acesso é verificada no servidor, nunca só escondendo botões
  na tela.
- Autenticação em dois fatores por aplicativo autenticador, opcional para
  todos (página "Minha conta").
- Tentativas de login em excesso bloqueiam o acesso por alguns minutos.
  Trocar a senha, inativar a conta ou mexer no 2FA encerra as sessões já
  abertas.
- Login, falhas de acesso, acessos negados e alterações críticas ficam
  registrados numa trilha de auditoria que não pode ser editada nem apagada
  pelo sistema.

## 7. Por quanto tempo guardamos os dados

- **Cadastro aguardando confirmação:** apagado ao concluir o cadastro (os
  dados passam para a conta) ou depois de expirar. Sem confirmação, o
  código deixa de valer em 15 minutos, e os dados são apagados na próxima
  vez que alguém entrar no sistema ou fizer um cadastro.
- **Conta:** permanece enquanto você usa o sistema. A secretaria pode
  inativar a conta (o histórico de inscrições e certificados é preservado)
  e só pode excluí-la definitivamente depois de inativada. A exclusão apaga
  a conta e o histórico vinculado (inscrições, feedbacks e tentativas de
  questionário) de forma permanente.
- **Quem já tem certificado emitido** não tem a conta excluída: o
  certificado é a prova da participação e precisa continuar válido (por
  exemplo, numa conferência de horas complementares). Nesse caso a conta
  fica inativada, sem acesso ao sistema, e o registro do certificado é
  mantido.
- **Feedback:** você pode excluir o seu a qualquer momento e enviar outro.
- **Registros de auditoria:** guardados por até 5 anos e nunca editados ou
  apagados pelas telas do sistema.
- **Cópias de segurança:** o provedor do banco faz uma cópia por dia, que
  expira em 1 dia. Um dado excluído pode continuar numa cópia já feita por
  no máximo 24 horas.

## 8. Seus direitos

Na página **"Meus dados"**, no menu do sistema depois que você entra com a
sua conta de aluno, você vê tudo o que o SGEA guarda sobre você: dados
cadastrais, aceite dos termos, situação do 2FA, inscrições e presenças,
resultados dos questionários, certificados e avaliações.

Os demais pedidos são feitos pelo e-mail `privacidade@sgeacademicos.com.br`
e respondidos em até 15 dias:

- Cópia dos seus dados para levar a outro serviço (portabilidade).
- Correção de dados: nome e RGM podem ser corrigidos pelo canal de
  privacidade. O e-mail não pode ser alterado, porque é a identificação de
  acesso confirmada no cadastro. Se o seu e-mail institucional mudar,
  escreva para o canal de privacidade e a equipe analisa o caso.
- Exclusão da conta e dos dados (veja na seção 7 o caso de quem já tem
  certificado, que tem a conta inativada).
- Revisão humana do resultado do questionário, que é calculado
  automaticamente e libera o certificado (art. 20 da LGPD). A revisão
  confere se a correção foi feita certo; não é uma nova tentativa: quem não
  atinge o mínimo nas 2 tentativas permitidas não recebe o certificado
  daquele evento.
- Oposição ao tratamento, informação sobre com quem seus dados são
  compartilhados e qualquer outro pedido sobre seus dados.

## 9. Incidentes de segurança

Em caso de incidente que exponha dados pessoais com risco ou dano
relevante, a equipe responsável avalia o risco e comunica os titulares
afetados e, quando exigido, a Autoridade Nacional de Proteção de Dados
(ANPD), no prazo regulatório aplicável.

---

*Versão 4 — 09/11/2026. Quando este texto mudar, a nova versão é publicada
nesta página com a data, e a versão que você aceitou fica registrada na sua
conta.*
