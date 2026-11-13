# Funcionalidades principais do sistema

Este documento descreve as funcionalidades centrais do Sistema de Gestão de Eventos Acadêmicos, explicando o objetivo de cada uma, o fluxo de uso e como foram implementadas no front-end (React) e no back-end (Node/Express). Todas foram testadas de ponta a ponta (interface e API) antes da entrega deste documento.

---

## 1. Questionário obrigatório e liberação condicionada do certificado

### Objetivo

Cada evento cadastrado no sistema possui um questionário de múltipla escolha com 10 perguntas (4 alternativas cada, sendo 1 correta). O aluno só pode emitir o certificado de participação depois de responder ao questionário e atingir, no mínimo, 60% de acertos (6 de 10 perguntas corretas).

### Fluxo do usuário

1. O administrador ou a secretaria cadastra o evento e define as 10 perguntas com suas alternativas, marcando qual é a correta em cada uma (tela **Eventos**).
2. O aluno se inscreve no evento, pede o check-in quando chega (botão **"Fazer check-in"** na tela Eventos) e o professor do evento, a secretaria ou o administrador aprova o pedido (tela **Check-in** ou painel "Check-ins" dentro do evento).
3. Na tela **Certificados**, o aluno vê o evento com um botão **"Questionário"**.
4. Ao responder as 10 perguntas e enviar, o sistema calcula o percentual de acertos e mostra o resultado na hora.
5. Se o aproveitamento for igual ou maior que 60%, o botão **"Emitir certificado"** é liberado e o aluno pode baixar o PDF. Caso contrário, o aluno pode clicar em **"Refazer questionário"** e tentar novamente (são 2 tentativas por evento).
6. A equipe (administrador/secretaria) enxerga, na tela de Certificados, a nota de todos os alunos em todos os eventos, mas essa liberação é uma regra aplicada apenas à visão do aluno.

### Como funciona por trás

- **Gabarito nunca é exposto antes da resposta.** O aluno recebe as perguntas sem o campo que indica a alternativa correta — isso é feito na API (`backend/src/utils/dto.ts`, função `eventoParaDTO` com o parâmetro `paraAluno`).
- **A correção acontece do lado do servidor**, nunca no navegador do aluno antes do envio — evita que a resposta certa seja descoberta inspecionando o código da página. Isso é feito em `backend/src/modules/questionario/questionario.service.ts` (função `responder`).
- Cada tentativa é armazenada (não sobrescreve a anterior), e a elegibilidade ao certificado usa sempre a **melhor tentativa** do aluno naquele evento (`certificadoService.ts`, função `enriquecer`).
- O percentual mínimo (60%) é uma constante única (`PERCENTUAL_APROVACAO`), usada tanto para calcular a liberação quanto para exibir a mensagem ao aluno — evita que as duas partes do sistema fiquem com regras divergentes.
- No back-end, as rotas do questionário exigem autenticação e, quando aplicável, perfil de ALUNO (`backend/src/modules/eventos/eventos.routes.ts`): um aluno só enxerga e responde ao próprio questionário, nunca o de outra pessoa. A rota que lista a nota de todos os alunos em todos os eventos (usada na tela de gestão) é restrita a ADMINISTRADOR/SECRETARIA.
- Só responde quem teve a presença confirmada naquele evento e está com a conta ativa — as duas regras são conferidas no servidor (`questionario.service.ts`), não só escondendo o botão.

### Verificação realizada

Testado via requisições reais à API (não apenas leitura de código):
- Login como aluno e conferência de que o campo de resposta correta não aparece nas perguntas recebidas.
- Envio de respostas todas erradas → resultado 0% registrado corretamente.
- Envio de respostas todas certas → resultado 100% registrado corretamente, ambas as tentativas guardadas.
- Tentativa de aluno acessar a lista de notas de todos os participantes → bloqueada (403), como esperado.
- Administrador acessando a mesma lista → permitido, com os registros das tentativas realizadas.

---

## 2. Validação de formulários com erro no próprio campo

### Objetivo

Garantir que os dados cadastrados no sistema (salas, palestrantes, eventos, inscrições, feedbacks, contas de aluno) sigam um formato consistente, com a mensagem de erro aparecendo embaixo do campo que precisa ser corrigido — nunca em caixas de diálogo do navegador ou apenas no console.

### Regras aplicadas

| Campo | Regra |
|---|---|
| Nome | Apenas letras (com acentos), espaços e hífen — sem números |
| E-mail | Formato válido (`algo@dominio.algo`) |
| RGM | Exatamente 11 dígitos numéricos, sem espaços ou letras |

### Fluxo do usuário

1. Todo campo obrigatório tem um asterisco vermelho (`*`) ao lado do rótulo, e o formulário explica o que o asterisco significa.
2. Ao tentar salvar com um campo vazio ou inválido, o campo fica com a borda vermelha, a mensagem aparece logo embaixo dele e o cursor vai para o primeiro campo com problema.
3. Se o servidor recusar algum campo (ex.: e-mail já cadastrado), a mensagem dele também aparece embaixo do campo certo.
4. Ao corrigir o campo, o erro some. Nada é salvo enquanto houver campo inválido — o formulário continua aberto.
5. Vale para todos os formulários: login, cadastro, esqueci a senha, eventos (incluindo cada pergunta do questionário), salas, palestrantes, participantes, inscrições, feedback, questionário do aluno e 2FA.
6. Confirmações de sucesso ("Palestrante cadastrado.", "Evento atualizado.", etc.) aparecem como notificação (toast), no lugar de um `alert()` do navegador.

### Como funciona por trás

- As regras de validação (nome, e-mail, RGM) existem em dois lugares espelhados: `frontend/src/utils/validacao.ts` (checagem imediata na tela) e `backend/src/utils/validacao.ts` + os schemas Zod de cada módulo (segunda barreira, caso a API seja chamada diretamente). Isso segue o princípio de nunca confiar apenas na validação do navegador.
- Todos os formulários usam o mesmo componente de campo (`frontend/src/components/ui/Campo.tsx`: rótulo, asterisco, mensagem de erro e ligação acessível entre campo e mensagem) e o mesmo controle de erros (`frontend/src/hooks/useErrosFormulario.ts`: guarda os erros por campo, foca o primeiro inválido e distribui os `erros` do `422` da API pelos campos). O estilo é um só, em `global.css`.
- O sistema de notificação (`frontend/src/components/ui/Toast.tsx`) é um "pub/sub" simples: qualquer parte do código pode chamar `toast.error("mensagem")` ou `toast.success("mensagem")`, e um componente único (`ToastViewport`), montado uma vez na raiz da aplicação, exibe a notificação por alguns segundos e some sozinha. Ele fica para avisos gerais e de sucesso; erro de campo aparece no campo.
- Antes de qualquer edição ou exclusão (palestrante, sala, evento, inscrição), o sistema exibe uma caixa de confirmação (`ConfirmDialog.tsx`) — outra camada de proteção contra ações acidentais, especialmente importante numa aplicação usada por secretaria/administração.
- No back-end, a validação Zod (`validarCorpo` como middleware) barra a requisição antes mesmo de chegar à lógica de negócio, devolvendo código de erro `422` com a lista `erros` (campo + mensagem).

### Verificação realizada

Testado via requisições reais à API e na interface (Playwright, `frontend/testes-interface/`):
- Nome com número → rejeitado (422).
- RGM com 10 caracteres → rejeitado (422).
- E-mail em formato inválido → rejeitado (422).
- RGM digitado em minúsculo e misturado com caractere inválido → aceito e automaticamente normalizado para maiúsculo antes de salvar.

---

## 3. Busca de participante por nome, e-mail ou RGM (Inscrições e Check-in)

### Objetivo

Agilizar a inscrição de alunos em eventos e o check-in no dia do evento, permitindo localizar um participante digitando qualquer um dos três dados que a secretaria normalmente tem em mãos (nome, e-mail ou RGM), em vez de procurar numa lista suspensa longa com todos os participantes cadastrados.

### Fluxo do usuário

**Inscrições:**
1. Ao clicar em "+ Nova inscrição", a secretaria digita parte do nome, e-mail ou RGM do aluno num campo de busca.
2. A lista de resultados aparece abaixo, atualizando a cada letra digitada.
3. Ao clicar no participante desejado, o campo é preenchido e o evento é selecionado normalmente; o sistema avisa (toast) se não houver vaga ou se o aluno já estiver inscrito naquele evento.

**Check-in (desde 09/11/2026, pedido pelo aluno):**
1. O próprio aluno pede o check-in na tela Eventos, dentro da janela (1 hora antes do início até 24 horas depois do fim), confirmando que está no local.
2. A tela Check-in da equipe e do professor lista os eventos com a janela aberta e quantos pedidos esperam decisão; clicar no evento abre o painel "Check-ins", com nome, RGM e horário de cada pedido e os botões Aprovar, Recusar e Aprovar todos (todos com confirmação). A busca de aluno por nome, e-mail ou RGM continua só na inscrição manual.

### Como funciona por trás

- A busca é feita inteiramente no navegador sobre a lista de participantes já carregada (sem round-trip ao servidor a cada tecla digitada), comparando o texto digitado (em minúsculo) contra nome, e-mail e RGM de cada participante — implementado em `frontend/src/services/checkinService.ts` (função `buscarParticipantes`) e replicado com a mesma lógica em `frontend/src/pages/Inscricoes/InscricoesPage.tsx`.
- Um campo vazio de busca não retorna nenhum resultado — evita mostrar a lista inteira de participantes por engano antes de o usuário começar a digitar.
- A tela de Inscrições valida três coisas antes de gravar: se um participante foi de fato selecionado na busca, se o evento tem vaga disponível (comparando capacidade da sala com o número de inscritos) e se o aluno já não está inscrito naquele mesmo evento — qualquer uma dessas situações é avisada por toast, sem travar a tela.

### Verificação realizada

Revisão de código completa do fluxo de busca (frontend) e testes de API confirmando que a listagem de participantes usada como base da busca reflete corretamente os cadastros existentes.

---

## 4. Cadastro de eventos, salas e palestrantes

> **Atualização:** o cadastro (criar/editar/excluir) de Salas e Palestrantes,
> que tinha sido removido em favor de gestão direta no banco, voltou a ser
> feito pela interface, restrito a administrador/secretaria.

### Objetivo

Antes de existir um evento no sistema, é preciso ter pelo menos uma sala e um palestrante cadastrados — o evento sempre referencia os dois. As telas de Salas e Eventos (restritas a administrador/secretaria) formam a base de todo o resto do sistema: sem sala não há evento, sem evento não há inscrição, check-in, questionário nem certificado.

### Fluxo do usuário

- **Salas** (`/salas`): código no padrão da UMC, escolhido em três seleções (prédio 1 a 3, andar T/1/2/3 e número 01 a 21, que formam códigos como `1T-01`, `22-07` e `33-21`), tipo (sala de aula, laboratório ou auditório) e capacidade (número de lugares), usada depois para calcular as vagas. A API recusa código fora do padrão e código repetido ("Já existe uma sala 1T-01."). A lista vem por prédio, andar e número, com filtro por prédio e por tipo, e a sala aparece em todo o sistema como "1T-01 · Laboratório".
- **Tela Equipe** (antes "Professores"; `/professores` leva para `/equipe`): contas de professor e de secretaria, com nome, e-mail, perfil, situação (Convite pendente, Ativo ou Inativo) e filtro por perfil. O administrador cria professores e secretarias; a secretaria só professores. As duas contas usam e-mail `@umc.br` e o mesmo convite por link (24 horas, uso único). Ninguém mexe na própria conta por essa tela, e contas de administrador não aparecem nela. Excluir vale só para conta inativa ou com convite pendente (útil para corrigir um e-mail digitado errado); quem tem histórico fica preservado como inativo, e a auditoria nunca é apagada. O e-mail é único no sistema todo: a tela recusa o de qualquer conta existente (de qualquer perfil, sem diferença de maiúsculas) ou de um cadastro de aluno em andamento ("Já existe uma conta com este e-mail."), e grava sempre em minúsculas.
- **Palestrantes** (`/palestrantes`): cadastro de nome e e-mail. O aluno enxerga essa tela em modo somente leitura, como uma grade de cards (avatar com as iniciais, nome e as próximas palestras de cada palestrante) — sem o e-mail, que o backend nem envia para o aluno. A equipe só exclui palestrante já decidido (aprovado ou recusado, sem proposta de alteração aguardando): para os outros, o botão Excluir fica desabilitado com a orientação "Aprove ou recuse este palestrante antes de excluir.", e a API responde `409` com a mesma mensagem. O e-mail do palestrante é único entre os palestrantes e gravado em minúsculas.
- **Eventos** (`/eventos`): título, sala, data/horário, palestrante responsável, tema e carga horária, além do construtor das 10 perguntas do questionário (ver funcionalidade 1). Só é possível abrir o formulário de novo evento se já existir pelo menos uma sala e um palestrante cadastrados.
- Nas três telas, editar ou excluir um registro pede confirmação antes de gravar ("Confirmar alteração" / "Remover ..."), e qualquer campo inválido ou vazio é avisado por notificação (toast) — nunca por `alert()`.

### Como funciona por trás

- **Integridade entre cadastros:** como todo evento exige uma sala e um palestrante (`Evento.salaId` e `Evento.palestranteId` são obrigatórios), o sistema impede excluir uma sala ou um palestrante que ainda esteja vinculado a algum evento. Essa checagem existe no back-end pros dois recursos (`salas.service.ts` e `palestrantes.service.ts`, função `remover`, devolvendo erro `409 CONFLITO_DEPENDENCIA`). No front-end, `SalasPage.tsx` (função `excluir`) confere a lista de eventos antes mesmo de chamar a API e avisa por toast; `PalestrantesPage.tsx` deixa essa checagem só para o backend e mostra a mensagem de erro retornada. Sem essa trava, um evento ficaria "orfão", apontando para uma sala ou palestrante que não existe mais.
- **Exclusão em cascata do evento:** ao excluir um evento, tudo o que depende dele também precisa sumir — inscrições, feedbacks e tentativas de questionário daquele evento. Isso é feito no back-end dentro de uma única operação (`eventos.service.ts`, função `remover`).
- O construtor de perguntas do formulário de evento trava o salvamento (com aviso indicando qual das 10 perguntas está incompleta) enquanto qualquer enunciado, alternativa ou marcação de "correta" estiver faltando — a validação (`validarEvento`, em `frontend/src/pages/Eventos/EventosPage.tsx`) mostra o problema embaixo de cada pergunta, e o backend confere as mesmas regras.

### Verificação realizada

Testado via requisições reais à API: criação de sala, palestrante e evento vinculando os dois; tentativa de excluir a sala e o palestrante em uso (bloqueada com `409` nos dois casos); edição do evento; exclusão do evento; e, só então, exclusão da sala e do palestrante — liberada com sucesso após o evento deixar de existir.

---

## 5. Inativação e reativação de aluno

### Objetivo

Permitir que a secretaria bloqueie o uso do sistema por um aluno (uso indevido, dado incorreto ou a pedido dele) sem apagar nada, e desfaça isso depois.

### Fluxo do usuário

1. Na tela **Participantes**, administrador ou secretaria clica em **"Inativar"**, informa o motivo (obrigatório) e confirma.
2. A partir daí o aluno aparece com o selo **"Inativo"** nas telas da equipe (Participantes, Inscrições, Check-in, Certificados).
3. Se o aluno estiver logado, a sessão cai. Ao tentar entrar de novo, vê "Sua conta está inativa. Procure a secretaria." — sem o motivo interno.
4. Ele não consegue se inscrever, fazer check-in nem responder questionário. As inscrições pendentes em eventos futuros são canceladas; os certificados já emitidos continuam valendo.
5. **"Reativar"** (com confirmação) libera o login de novo.

### Como funciona por trás

- Tudo é conferido no servidor (`participantes.service.ts`, `auth.service.ts`, `eventos.service.ts`, `inscricoes.service.ts`, `questionario.service.ts`). A sessão cai porque a inativação incrementa `versaoToken`.
- Inativação, reativação e cada inscrição cancelada ficam na auditoria (`PARTICIPANTE_INATIVADO`, `PARTICIPANTE_REATIVADO`, `INSCRICAO_CANCELADA`).
- "Inativo" é só essa ação da equipe. Conta sem login há 24 meses é outro conceito, chamado **conta sem uso** (critério de retenção da LGPD, ver `docs/lgpd/04-plano-de-retencao-e-descarte.md`).

---

## 6. Feedback sem edição

### Fluxo do usuário

- O aluno envia um feedback (nota de 1 a 5 e comentário) dos eventos em que a presença dele foi confirmada (check-in aprovado), mesmo antes de responder o questionário. Se a presença for desfeita (só possível antes do questionário), a avaliação é apagada junto, com aviso na tela e registro na auditoria.
- Depois de enviado, **ninguém edita** o feedback. O aluno pode excluir o dele (com confirmação) e enviar outro.
- Administrador e secretaria veem todos os feedbacks e só podem excluir, escolhendo o motivo numa lista (conteúdo ofensivo, dado pessoal exposto, fora do tema, pedido do aluno).

### Como funciona por trás

- `PUT /api/feedbacks/:id` responde sempre `403`; o `DELETE` confere se o aluno é o dono, e para a equipe exige o motivo (`feedbacks.routes.ts`, `feedbacks.service.ts`).
- Toda exclusão gera `FEEDBACK_EXCLUIDO` na auditoria, dizendo se foi o próprio aluno ou a equipe (e o motivo). O motivo é de lista fechada para não gravar texto livre na trilha, que não pode ser apagada.

---

## 7. Senha e autenticação em dois fatores

- Senhas são guardadas só como hash bcrypt, custo 12, com salt aleatório por senha embutido no próprio hash. Contas com hash antigo (custo 10) são atualizadas no próximo login, sem o usuário perceber. Detalhes em `docs/lgpd/07-medidas-tecnicas-de-seguranca.md`.
- A autenticação em dois fatores (aplicativo autenticador) é **opcional para todos os perfis**: cada pessoa ativa ou desativa na página **Minha conta**.
- Na mesma página, qualquer perfil **altera a própria senha**: senha atual, nova senha (com a lista de requisitos marcada a cada tecla) e confirmação; com o 2FA ativo, também o código do aplicativo ou um código de recuperação. Depois de confirmar, as outras sessões abertas são encerradas, quem trocou continua logado e recebe um aviso por e-mail (sem a senha). Erros de senha atual ou código contam no limite de tentativas (5 erros bloqueiam a troca por 15 minutos).
- A tela **Participantes** mostra, para cada aluno, as colunas **2FA** ("Ativado"/"Não ativado") e **Acesso** ("Liberado"/"Bloqueado" por excesso de tentativas). Administrador e secretaria veem as colunas; só o **administrador** tem os botões **"Resetar 2FA"** (aluno que perdeu o celular) e **"Desbloquear"**, sempre com confirmação — e o backend recusa a secretaria com `403` mesmo que ela chame a API direto.
- Contas de administrador e secretaria não são participantes, então não aparecem nessa tela: o reset do 2FA delas é feito pelo script `backend/scripts/resetar-2fa.ts` (que também serve de emergência se o único administrador perder o celular e os códigos), e o bloqueio por tentativas expira sozinho em 15 minutos.

## 8. Professor: só os próprios eventos

- O menu do professor tem Dashboard, Eventos, Palestrantes, Inscrições, Check-in e Minha conta. **Certificados e Avaliações não aparecem**, e a API recusa essas rotas para ele com `403`, mesmo nos eventos dele; digitar `/certificados` ou `/feedback` leva ao Dashboard. A validação pública do certificado continua aberta.
- **Inscrições:** ele inscreve alunos, cancela inscrições e lista inscrições só nos eventos que criou; nos outros, a API responde `403` ("Você só pode inscrever alunos nos seus próprios eventos."), e o modal da tela já lista só os eventos dele. A equipe inscreve em qualquer evento, e o conflito de horário vale para todos.
- **Dashboard:** todos os números, gráficos e listas consideram só os eventos aprovados que ele criou, com o subtítulo "Dados dos seus eventos" e sem os cartões de certificados e de avaliações.
- **Aviso de recusa:** quando a equipe recusa um evento, um palestrante ou uma proposta dele, aparece no topo da tela "N itens seus foram recusados", com links para Eventos e Palestrantes e um X para fechar. Fechado, o aviso só volta quando chega uma recusa nova: a API manda um id por recusa em aberto e a tela guarda no navegador, por usuário, os que ele já viu (sem `localStorage`, fica fechado só até recarregar a página).

## 9. Cancelamento de evento pela equipe

- **Quem e quando:** só a secretaria e o administrador, num evento aprovado que ainda não começou. O professor não tem o botão e a API responde `403` (ele combina com a equipe por fora). O cancelamento não pode ser desfeito.
- **Na tela:** no calendário, o detalhe do evento tem o botão **Cancelar evento**, que abre um modal com o título, a data, quantos inscritos serão avisados e a caixa "Motivo do cancelamento" (obrigatória, com contador de caracteres e o erro embaixo). O botão de cancelar fica desativado até o motivo ter 10 caracteres e pede a confirmação "Tem certeza? Esta ação não pode ser desfeita e todos os inscritos serão avisados por e-mail."
- **O que acontece:** o evento guarda quando, o motivo e quem cancelou; a proposta de alteração pendente é encerrada como recusada ("Evento cancelado"); as inscrições ficam (histórico do aluno); a sala fica livre no horário. Cada inscrito e o professor responsável recebem o e-mail "Evento cancelado: <título>" com o cartão do evento, o motivo e o botão para os eventos abertos. A auditoria registra o cancelamento e quantos foram avisados, sem o motivo.
- **Depois:** o evento aparece com a etiqueta **Cancelado** e o título riscado no calendário (para a equipe, com o motivo, quem cancelou e quando; para o professor dono, com o motivo); para o aluno, sai de "Abertas" e fica em "Inscritas" e "Todas" com a etiqueta e o motivo, sem nenhum botão. Ninguém mais se inscreve, cancela inscrição, pede ou decide check-in, responde o questionário, emite certificado, avalia, edita ou exclui o evento (`409` "Este evento foi cancelado."). O aluno pode se inscrever noutro evento no mesmo horário. O Dashboard não conta o evento cancelado (o indicador de eventos diz quantos ficaram de fora).

---

## Contas de demonstração

O seed (`backend/prisma/seed.ts`) cria três contas: administrador (o e-mail de `SEED_ADMIN_EMAIL`, de quem apresenta, ou `admin@umc.br`), secretaria (`secretaria@umc.br`) e professor (`professor@umc.br`, já ativado); a secretaria e o professor de demonstração não recebem e-mail. Não há aluno de demonstração: para ter o sistema cheio, a carga de demonstração (`backend/scripts/carga-demonstracao.ts`) apaga tudo e cria salas, palestrantes, 150 professores, 1 secretaria e 1.000 alunos fictícios (que nunca recebem e-mail) e 201 eventos (150 encerrados, 25 futuros, 25 em aprovação e 1 futuro cancelado) com inscrições, check-in, notas, certificados, avaliações, propostas de alteração e os cenários da apresentação; a auditoria começa vazia. As senhas das três contas vêm das variáveis `SEED_*_SENHA` do `.env`, nunca do código nem da documentação.
