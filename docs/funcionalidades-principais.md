# Funcionalidades principais do sistema

Este documento descreve as funcionalidades centrais do Sistema de Gestão de Eventos Acadêmicos, explicando o objetivo de cada uma, o fluxo de uso e como foram implementadas no front-end (React) e no back-end (Node/Express). Todas foram testadas de ponta a ponta (interface e API) antes da entrega deste documento.

---

## 1. Questionário obrigatório e liberação condicionada do certificado

### Objetivo

Cada evento cadastrado no sistema possui um questionário de múltipla escolha com 10 perguntas (4 alternativas cada, sendo 1 correta). O aluno só pode emitir o certificado de participação depois de responder ao questionário e atingir, no mínimo, 60% de acertos (6 de 10 perguntas corretas).

### Fluxo do usuário

1. O administrador ou a secretaria cadastra o evento e define as 10 perguntas com suas alternativas, marcando qual é a correta em cada uma (tela **Eventos**).
2. O aluno se inscreve no evento e tem a presença confirmada pela equipe (**Check-in**).
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

**Check-in:**
1. A secretaria digita nome, e-mail ou RGM do aluno que chegou ao evento.
2. Ao selecionar o participante na lista de resultados, aparecem todas as inscrições dele, com botões para confirmar presença ou marcar ausência.

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

- **Salas** (`/salas`): cadastro simples de nome e capacidade (número de lugares), usado depois para calcular vagas disponíveis nas inscrições.
- **Palestrantes** (`/palestrantes`): cadastro de nome e e-mail. O aluno enxerga essa tela em modo somente leitura.
- **Eventos** (`/eventos`): título, sala, data/horário, palestrante responsável, tema e carga horária, além do construtor das 10 perguntas do questionário (ver funcionalidade 1). Só é possível abrir o formulário de novo evento se já existir pelo menos uma sala e um palestrante cadastrados.
- Nas três telas, editar ou excluir um registro pede confirmação antes de gravar ("Confirmar alteração" / "Remover ..."), e qualquer campo inválido ou vazio é avisado por notificação (toast) — nunca por `alert()`.

### Como funciona por trás

- **Integridade entre cadastros:** como todo evento exige uma sala e um palestrante (`Evento.salaId` e `Evento.palestranteId` são obrigatórios), o sistema impede excluir uma sala ou um palestrante que ainda esteja vinculado a algum evento. Essa checagem existe no back-end pros dois recursos (`salas.service.ts` e `palestrantes.service.ts`, função `remover`, devolvendo erro `409 CONFLITO_DEPENDENCIA`). No front-end, `SalasPage.tsx` (função `excluir`) confere a lista de eventos antes mesmo de chamar a API e avisa por toast; `PalestrantesPage.tsx` deixa essa checagem só para o backend e mostra a mensagem de erro retornada. Sem essa trava, um evento ficaria "orfão", apontando para uma sala ou palestrante que não existe mais.
- **Exclusão em cascata do evento:** ao excluir um evento, tudo o que depende dele também precisa sumir — inscrições, feedbacks e tentativas de questionário daquele evento. Isso é feito no back-end dentro de uma única operação (`eventos.service.ts`, função `remover`).
- O construtor de perguntas do formulário de evento trava o salvamento (com aviso indicando qual das 10 perguntas está incompleta) enquanto qualquer enunciado, alternativa ou marcação de "correta" estiver faltando — a validação (`validarQuestionario`, em `frontend/src/utils/questionario.ts`) é a mesma usada para montar o formulário.

### Verificação realizada

Testado via requisições reais à API: criação de sala, palestrante e evento vinculando os dois; tentativa de excluir a sala e o palestrante em uso (bloqueada com `409` nos dois casos); edição do evento; exclusão do evento; e, só então, exclusão da sala e do palestrante — liberada com sucesso após o evento deixar de existir.

---

## 5. Inativação e reativação de aluno

### Objetivo

Permitir que a secretaria bloqueie o uso do sistema por um aluno (uso indevido, dado incorreto ou a pedido dele) sem apagar nada, e desfaça isso depois.

### Fluxo do usuário

1. Na tela **Participantes**, administrador ou secretaria clica em **"Inativar"**, informa o motivo (obrigatório) e confirma.
2. A partir daí o aluno aparece com o selo **"Inativo"** nas telas da equipe (Participantes, Inscrições, Check-in, Certificados, Usuários).
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

- O aluno envia um feedback (nota de 1 a 5 e comentário) das palestras em que já recebeu o certificado.
- Depois de enviado, **ninguém edita** o feedback. O aluno pode excluir o dele (com confirmação) e enviar outro.
- Administrador e secretaria veem todos os feedbacks e só podem excluir, escolhendo o motivo numa lista (conteúdo ofensivo, dado pessoal exposto, fora do tema, pedido do aluno).

### Como funciona por trás

- `PUT /api/feedbacks/:id` responde sempre `403`; o `DELETE` confere se o aluno é o dono, e para a equipe exige o motivo (`feedbacks.routes.ts`, `feedbacks.service.ts`).
- Toda exclusão gera `FEEDBACK_EXCLUIDO` na auditoria, dizendo se foi o próprio aluno ou a equipe (e o motivo). O motivo é de lista fechada para não gravar texto livre na trilha, que não pode ser apagada.

---

## 7. Senha e autenticação em dois fatores

- Senhas são guardadas só como hash bcrypt, custo 12, com salt aleatório por senha embutido no próprio hash. Contas com hash antigo (custo 10) são atualizadas no próximo login, sem o usuário perceber. Detalhes em `docs/lgpd/07-medidas-tecnicas-de-seguranca.md`.
- A autenticação em dois fatores (aplicativo autenticador) é **opcional para todos os perfis**: cada pessoa ativa ou desativa na página **Minha conta**. O administrador pode resetar o 2FA de quem perdeu o celular (tela **Usuários**).

---

## Contas de teste

O seed (`backend/prisma/seed.ts`) cria, no banco de desenvolvimento, um administrador, uma secretaria e um aluno de demonstração já inscrito e com presença confirmada no evento "Abertura e Palestra Magna: IA na Educação", pronto para testar o questionário e a emissão do certificado. Logins e senhas no `README.md` (valem só para o banco de desenvolvimento).
