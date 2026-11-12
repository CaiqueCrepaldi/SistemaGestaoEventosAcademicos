# Termos de Uso

**Versão 1 — 12/11/2026.** Este é o mesmo texto publicado na página
`/termos-de-uso` do sistema (`frontend/src/pages/Legal/TermosDeUsoPage.tsx`):
ao mudar um, mude o outro. A versão vigente fica em `VERSAO_TERMOS_ATUAL`
(`backend/src/config/termos.ts`), publicada sempre junto com a Política de
Privacidade.

## 1. O que é o SGEA

O Sistema de Gestão de Eventos Acadêmicos (SGEA) organiza eventos
acadêmicos (palestras, minicursos, workshops, seminários): inscrição,
check-in, questionário obrigatório, certificado de participação e avaliação
das palestras. É um protótipo desenvolvido como Projeto de Final de Curso da
UMC, com finalidade exclusivamente acadêmica, e não é um serviço comercial.

## 2. Quem pode usar

- **Aluno:** o cadastro é público e exige e-mail institucional terminando em
  `@alunos.umc.br`. A conta só é criada depois que você confirma esse
  e-mail: o sistema envia a ele um código de 6 dígitos, que vale por 15
  minutos. Sem a confirmação, nenhuma conta é criada e os dados informados
  são apagados.
- **Professor:** a conta é criada pela secretaria ou pela administração, na
  tela Equipe, só com o nome completo e o e-mail institucional (`@umc.br`).
  O professor recebe por e-mail um convite com um link, válido por 24 horas
  e de uso único, em que define a senha e aceita estes Termos. Antes disso a
  conta não entra no sistema. Se o link vencer, quem criou a conta envia um
  novo convite, e o anterior deixa de valer.
- **Secretaria:** a conta é criada só pela administração, na tela Equipe, do
  mesmo jeito: nome completo, e-mail institucional (`@umc.br`) e o convite
  por link, em que a secretaria define a senha e aceita estes Termos.
- **Administração:** contas criadas diretamente pela instituição, sem
  cadastro público. O sistema sempre mantém pelo menos uma conta de
  administrador ativa.

## 3. Sua conta

- Os dados informados (nome, RGM e e-mail) precisam ser verdadeiros, e o
  e-mail precisa ser seu.
- O e-mail não pode ser alterado: ele é a sua identificação de acesso. Nome
  e RGM podem ser corrigidos pelo canal de privacidade. Se o seu e-mail
  institucional mudar, escreva para o canal de privacidade e a equipe
  analisa o caso.
- A senha precisa ter de 8 a 64 caracteres, com pelo menos uma letra
  maiúscula, um número e um caractere especial (como ! @ # $ %).
- Você é responsável por manter sua senha em segredo. Se desconfiar que
  outra pessoa a conhece, troque-a pela opção "Esqueci minha senha" na tela
  de login, ou pela página "Minha conta". "Esqueci minha senha" não vale
  para a conta de professor ou de secretaria que ainda não usou o convite:
  ela só é ativada pelo link do convite.
- A autenticação em dois fatores é opcional para todos os perfis; você pode
  ativá-la ou desativá-la na página "Minha conta".
- Na página "Minha conta", a seção "Termos e privacidade" mostra a versão
  destes Termos e da Política de Privacidade que você aceitou, com a data e
  a hora do aceite, e abre os dois textos dentro do sistema.
- A secretaria pode **inativar** a conta de um aluno em caso de uso
  indevido, dado incorreto ou a pedido dele, sempre informando um motivo
  (visível só para a equipe). Com a conta inativa, o aluno não entra no
  sistema, não se inscreve, não pede check-in nem responde questionário; as
  inscrições sem pedido de check-in em eventos que ainda vão acontecer são
  canceladas, e os certificados já emitidos continuam válidos. A secretaria
  pode reativar a conta depois.

## 4. Condutas proibidas

- Tentar acessar dados, inscrições ou certificados de outra pessoa.
- Fornecer RGM, e-mail ou nome que não sejam seus.
- Pedir check-in sem estar no local do evento.
- Tentar burlar a liberação do certificado sem atingir o aproveitamento
  exigido no questionário.

## 5. Inscrição e check-in

- O aluno se inscreve nos eventos aprovados enquanto houver vaga e antes de
  o evento começar. Pode cancelar a inscrição até o início do evento,
  enquanto não tiver pedido o check-in.
- **Ninguém fica inscrito em dois eventos no mesmo horário.** Se o novo
  evento cruza com o horário de outro em que o aluno já está inscrito (do
  início até o início mais a carga horária), o sistema recusa a inscrição e
  mostra qual é o outro evento; para trocar, o aluno cancela aquela
  inscrição antes. Eventos que só encostam (um termina quando o outro
  começa) não contam. A regra vale também quando a equipe ou o professor
  inscrevem um aluno. Se o horário de um evento mudar depois da inscrição,
  ela continua valendo.
- O **check-in é pedido pelo próprio aluno**, na tela Eventos, de 1 hora
  antes do início até 24 horas depois do fim do evento, confirmando que está
  no local. O professor responsável pelo evento, a secretaria ou a
  administração aprova ou recusa o pedido; o sistema guarda quem decidiu e
  quando. Enquanto o check-in estiver aberto, a decisão pode ser revista,
  até o aluno responder o questionário daquele evento.
- A recusa é final para aquele evento: o aluno não pede de novo. Quem não
  pede o check-in até o fim do prazo fica como ausente, e o pedido que
  ninguém decidiu até o fim do prazo vira recusado.

## 6. Questionário e certificado

O certificado de participação só é liberado depois que o check-in é
aprovado e você atinge, no mínimo, 60% de acertos no questionário
obrigatório daquele evento, em até 2 tentativas. Essa liberação é uma
decisão automatizada do sistema: você pode pedir a revisão humana do
resultado pelo canal de privacidade. O certificado é gerado em PDF, tem um
código de validação que qualquer pessoa pode conferir na página pública de
validação, é destinado ao uso pessoal do titular e não pode ser alterado nem
emitido em nome de terceiros.

## 7. Avaliação das palestras

A avaliação de uma palestra (nota e comentário) é opcional e fica
disponível assim que a sua presença no evento é confirmada (check-in
aprovado), mesmo antes de você responder o questionário. Ela é vista pela
equipe e pelo professor responsável pelo evento, para avaliar o evento, e
não é publicada para outros alunos.

Enquanto você ainda não respondeu o questionário, quem aprovou o check-in
pode desfazer a presença (dentro do prazo do check-in). Nesse caso, a sua
avaliação daquele evento é apagada junto, e isso fica registrado na
auditoria. Depois que você responde o questionário, a presença não muda
mais.

Depois de enviada, a avaliação não pode ser editada. Você pode excluir a sua
a qualquer momento e enviar outra. A equipe só pode excluir uma avaliação
informando o motivo, e toda exclusão fica registrada na auditoria.

## 8. Eventos do professor

- O professor cria e organiza os próprios eventos e palestrantes. O que ele
  cadastra fica **aguardando a aprovação da equipe** e só aparece para os
  alunos depois de aprovado. Um evento aguardando aprovação já reserva a
  sala no horário.
- A equipe aprova ou recusa. A recusa traz um motivo, que o professor vê no
  sistema; ele corrige e reenvia, com uma resposta opcional. Cada passo fica
  registrado num histórico, com data e autor.
- Num evento já aprovado, o professor muda título, tema e questionário na
  hora; a mudança de sala, horário, carga horária ou palestrante vira uma
  **proposta de alteração**, e o evento continua valendo como está até a
  equipe decidir. Quando a mudança é aprovada (ou feita direto pela
  equipe), os alunos inscritos recebem um e-mail com o que mudou. No
  palestrante já aprovado, a mudança de nome ou e-mail também passa pela
  aprovação da equipe.
- Depois que um aluno responde o questionário de um evento, o questionário
  daquele evento não muda mais. Depois que o evento termina, ninguém mais o
  edita nem o exclui.
- O professor só vê e só altera os eventos que ele criou. Dos alunos
  inscritos nesses eventos, ele vê o nome, o RGM, a situação do check-in, as
  notas do questionário e as avaliações, e deve usar esses dados só para
  organizar o evento. Ele não acessa a lista geral de alunos nem a trilha de
  auditoria, e não exclui avaliações. No calendário, os eventos dos outros
  aparecem para ele só como "Sala ocupada", sem título, palestrante nem
  inscritos.
- A equipe pode **inativar** a conta de um professor, informando um motivo.
  Antes, os eventos dele ainda em aberto passam para outro professor ou para
  a equipe. O professor inativo não entra no sistema; a equipe pode reativar
  a conta depois.

## 9. Contas da equipe

- A trilha de auditoria (quem fez o quê no sistema) é consultada só pela
  administração.
- As contas de professor e de secretaria ficam na tela **Equipe**. A
  administração gerencia professores e secretarias; a secretaria gerencia só
  professores. Ninguém altera a própria conta por essa tela, e as contas de
  administrador não aparecem nela.
- Inativar uma conta da equipe pede um motivo (visível só para a equipe) e
  encerra as sessões abertas; a conta pode ser reativada depois.
- Só é possível **excluir** uma conta inativa ou que ainda não usou o
  convite (por exemplo, criada com o e-mail errado: a exclusão apaga a conta
  e o convite). A conta que tem histórico no sistema (eventos ou
  palestrantes criados, decisões de aprovação, propostas, check-ins
  decididos ou pedidos de titular atendidos) não é excluída: fica preservada
  como inativa. Os registros de auditoria nunca são apagados.

## 10. Disponibilidade

Por ser um sistema acadêmico, o SGEA pode passar por manutenções ou
instabilidades sem aviso prévio. Não há garantia de disponibilidade
contínua.

## 11. Encerramento da conta

Você pode pedir a qualquer momento, pelo canal de privacidade ou à
secretaria, a inativação e, em seguida, a exclusão definitiva da sua conta.
A exclusão remove permanentemente o histórico de inscrições, avaliações e
tentativas de questionário vinculados a ela. Quem já tem certificado emitido
tem a conta inativada em vez de excluída, para o certificado continuar
válido.

## 12. Limitação de responsabilidade

Estes Termos não transferem a você a responsabilidade pela segurança do
sistema, nem autorizam o SGEA a usar seus dados para outra finalidade além
das descritas na Política de Privacidade. Direitos previstos em lei não são
reduzidos por nenhuma cláusula destes Termos.

## 13. Legislação aplicável

Estes Termos são regidos pela legislação brasileira, em especial a Lei Geral
de Proteção de Dados Pessoais (Lei nº 13.709/2018) e o Código de Defesa do
Consumidor. Para saber como seus dados são tratados, veja a
[Política de Privacidade](./politica-de-privacidade.md).

---

*Versão 1 — 12/11/2026. Quando este texto mudar, a nova versão é publicada
nesta página com a data, e a versão que você aceitou fica registrada na sua
conta.*
