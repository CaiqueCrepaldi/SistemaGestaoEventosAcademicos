# Política de Privacidade

**Versão 2 — rascunho de 27/09/2026.** Substitui a Versão 1 (25/09/2026)
quando a Fase 2 publicar este texto na página `/politica-de-privacidade` do
sistema (a Fase 2 importa este arquivo direto na página, pra nunca
divergirem). Até lá, a página ao vivo continua mostrando a Versão 1.
Algumas seções abaixo descrevem funcionalidade que só existe a partir da
Fase 2 (ex.: página "Meus dados") — marcadas como tal.

## 1. Quem trata os dados

O SGEA (Sistema de Gestão de Eventos Acadêmicos) é um protótipo acadêmico
desenvolvido como Projeto de Final de Curso na Universidade de Mogi das
Cruzes (UMC), pela equipe Caique Crepaldi e João Pedro Rachid de Abreu,
sob orientação do Prof. Bruno Messias Aguiar (o orientador acompanha o
projeto academicamente, mas não é controlador, encarregado nem responsável
pelos dados tratados).

- **Neste protótipo**, os responsáveis pelo tratamento são os integrantes
  da equipe citados acima.
- **Numa implantação real**, a controladora seria a própria Universidade
  de Mogi das Cruzes, com um encarregado (DPO) institucional nomeado pela
  UMC.
- **Operadores** (processam dados por conta do controlador, sob instrução):
  Vercel (hospedagem/execução), TiDB Cloud (banco de dados) e SendGrid/
  Twilio (envio de e-mail) — detalhados na seção 4.
- **Canal de privacidade:** a página "Meus dados", dentro do próprio
  sistema (a partir da Fase 2), e o e-mail
  `privacidade@sgeacademicos.com.br`.

## 2. Dados pessoais tratados

- **Identificação e contato (aluno):** nome completo, RGM (matrícula) e
  e-mail institucional, informados no cadastro.
- **Autenticação:** senha (nunca guardada em texto puro — ver seção 8).
- **Dados acadêmicos:** inscrições em eventos, confirmações de presença
  (check-in), respostas ao questionário obrigatório de cada evento,
  resultado (aprovação/reprovação) e feedback enviado sobre as palestras.
- **Registros de acesso:** login (sucesso e falha), acesso negado e
  alterações em registros críticos, para fins de segurança e auditoria.
- **Identificação e contato (palestrante):** nome e e-mail, informados
  pela secretaria ao cadastrar o evento. Palestrantes também são
  titulares de dados pessoais: se você foi convidado a ministrar uma
  palestra no SGEA, seu nome e e-mail ficam armazenados no sistema (nome
  visível na agenda pública do evento para qualquer pessoa autenticada,
  e-mail visível só à equipe organizadora e a você mesmo), pelo tempo em
  que o evento estiver cadastrado. O canal `privacidade@sgeacademicos.com.br`
  vale também para você, pra qualquer dúvida ou solicitação sobre seus
  dados.

Não coletamos CPF, endereço, data de nascimento, foto ou dado de saúde. A
idade do titular não é coletada como dado — em vez disso, o cadastro exige
uma declaração de maioridade (ver Termos de Uso, seção 2).

## 3. Para que usamos cada dado

Ver a tabela completa em `docs/lgpd/02-matriz-dados-finalidade-base-legal.md`
(documento técnico, não público). Resumo:

| Dado | Finalidade | Base legal |
|---|---|---|
| Nome, RGM, e-mail, senha | Criar e autenticar a conta | Execução de contrato/procedimento a pedido do titular (art. 7º, V, LGPD) |
| Inscrição, presença, questionário | Controlar vaga e liberar certificado | Execução de contrato (art. 7º, V) |
| Feedback da palestra | Avaliação do evento, opcional | Consentimento (art. 7º, I) |
| Logs de acesso/auditoria | Segurança e eventual exercício de direito em disputa | Legítimo interesse em segurança (art. 7º, IX) e exercício regular de direitos (art. 7º, VI) |
| Aceite de Termos/Política | Comprovar que você teve ciência das regras antes de usar o serviço | Formalização contratual — não é "consentimento" de tratamento de dado |

## 4. Compartilhamento com terceiros

- **TiDB Cloud** (banco de dados): armazena os dados descritos acima, com
  nome/e-mail/RGM cifrados (ver seção 8).
- **SendGrid** (Twilio, envio de e-mail): recebe o e-mail e o nome do
  destinatário para mandar e-mails de recuperação de senha e confirmação
  de inscrição — só o necessário para entregar aquela mensagem.
- **Vercel** (hospedagem e execução do sistema): processa toda requisição
  feita ao SGEA, o que inclui o endereço IP de origem e os dados enviados
  em cada tela.

Nenhum dado é vendido, usado para publicidade ou compartilhado para
qualquer outra finalidade.

## 5. Transferência internacional e cookies

TiDB Cloud, SendGrid e Vercel têm infraestrutura nos Estados Unidos — usar
o SGEA implica que seus dados podem ser processados fora do Brasil. Como
protótipo acadêmico, essa transferência ocorre sob os termos padrão de uso
global desses provedores; numa implantação real, a instituição controladora
precisaria formalizar as salvaguardas cabíveis (ex.: cláusulas contratuais
padrão) com cada operador.

O sistema **não usa cookies** de rastreamento, publicidade ou de qualquer
outro tipo. O único dado guardado no navegador é o token de sessão (para
manter você conectado), removido ao sair da conta ou quando expira.

## 6. Retenção e descarte

Prazos detalhados em `docs/lgpd/04-plano-de-retencao-e-descarte.md`. Em
resumo:

- Sua conta fica ativa enquanto você a usa. Sem login por 24 meses, ela é
  **anonimizada** automaticamente.
- Você pode pedir a anonimização a qualquer momento (seção 7) — o sistema
  avisa antes para você baixar seus certificados, já que depois não será
  mais possível vinculá-los a você.
- Inscrições, presenças e certificados continuam existindo como
  estatística do evento, sem identificar você, depois da anonimização.
  Comentários de feedback são apagados; a nota permanece, também
  desvinculada.
- Logs de auditoria são mantidos por 5 anos e só removidos por uma rotina
  automática — nunca manualmente.
- Cópias de segurança (backup) do banco de dados são feitas 1 vez por dia
  pelo provedor (TiDB Cloud) e cada backup expira em 1 dia: um dado
  anonimizado ou excluído pode continuar existindo num backup já feito por
  no máximo 24 horas, até ser substituído pelo ciclo diário seguinte.

## 7. Seus direitos

A partir da Fase 2, a página **"Meus dados"**, dentro do sistema, permite:

- Ver todos os seus dados e exportá-los em um arquivo (portabilidade).
- Corrigir dados incorretos ou desatualizados.
- Pedir a anonimização da sua conta, com confirmação de senha.
- Pedir revisão humana do resultado do questionário/liberação do
  certificado (decisão tomada automaticamente pelo sistema).
- Fazer outras solicitações (informação sobre compartilhamento, oposição
  ao tratamento), registradas e respondidas pela equipe.

Alternativamente, qualquer solicitação pode ser feita para
`privacidade@sgeacademicos.com.br`.

## 8. Segurança

- Senhas são protegidas com hash forte e salt (bcrypt) — nunca ficam
  gravadas em texto legível.
- Nome, e-mail e RGM ficam cifrados no banco de dados.
- Toda regra de acesso é verificada no servidor, nunca só escondendo botão
  na tela.
- Login, falhas de acesso, acessos negados e alterações críticas ficam
  registrados numa trilha de auditoria imutável.
- Detalhes técnicos adicionais estão documentados internamente em
  `docs/lgpd/07-medidas-tecnicas-de-seguranca.md` (não público, para não
  facilitar ataque).

## 9. Incidentes de segurança

Em caso de incidente que exponha dado pessoal com risco ou dano relevante,
a equipe responsável avalia o risco e comunica os titulares afetados e,
quando exigido pela regulamentação vigente da Autoridade Nacional de
Proteção de Dados (ANPD), a própria ANPD, no prazo regulatório aplicável.
Processo detalhado em `docs/lgpd/05-plano-de-resposta-a-incidentes.md`.

---

*Versão 2 — 27/09/2026 (rascunho, publicação prevista na Fase 2). Mudanças
importantes em relação a versões futuras serão comunicadas e, quando a
mudança afetar a base do tratamento, um novo aceite será solicitado no
próximo login.*
