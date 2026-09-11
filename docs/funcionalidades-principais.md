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
5. Se o aproveitamento for igual ou maior que 60%, o botão **"Emitir certificado"** é liberado e o aluno pode baixar o PDF. Caso contrário, o aluno pode clicar em **"Refazer questionário"** e tentar novamente.
6. A equipe (administrador/secretaria) enxerga, na tela de Certificados, a nota de todos os alunos em todos os eventos, mas essa liberação é uma regra aplicada apenas à visão do aluno.

### Como funciona por trás

- **Gabarito nunca é exposto antes da resposta.** O aluno recebe as perguntas sem o campo que indica a alternativa correta — tanto no modo mock (`frontend/src/services/questionarioService.ts`, função `ocultarGabarito`) quanto na API (`backend/src/utils/dto.ts`, função `eventoParaDTO` com o parâmetro `paraAluno`).
- **A correção acontece do lado do servidor (ou do serviço, no modo mock)**, nunca no navegador do aluno antes do envio — evita que a resposta certa seja descoberta inspecionando o código da página. Isso é feito em `backend/src/modules/questionario/questionario.service.ts` (função `responder`) e replicado no mock em `frontend/src/utils/questionario.ts` (função `corrigirRespostas`).
- Cada tentativa é armazenada (não sobrescreve a anterior), e a elegibilidade ao certificado usa sempre a **melhor tentativa** do aluno naquele evento (`certificadoService.ts`, função `enriquecer`).
- O percentual mínimo (60%) é uma constante única (`PERCENTUAL_APROVACAO`), usada tanto para calcular a liberação quanto para exibir a mensagem ao aluno — evita que as duas partes do sistema fiquem com regras divergentes.
- No back-end, as rotas do questionário exigem autenticação e, quando aplicável, perfil de ALUNO (`backend/src/modules/eventos/eventos.routes.ts`): um aluno só enxerga e responde ao próprio questionário, nunca o de outra pessoa. A rota que lista a nota de todos os alunos em todos os eventos (usada na tela de gestão) é restrita a ADMINISTRADOR/SECRETARIA.

### Verificação realizada

Testado via requisições reais à API (não apenas leitura de código):
- Login como aluno e conferência de que o campo de resposta correta não aparece nas perguntas recebidas.
- Envio de respostas todas erradas → resultado 0% registrado corretamente.
- Envio de respostas todas certas → resultado 100% registrado corretamente, ambas as tentativas guardadas.
- Tentativa de aluno acessar a lista de notas de todos os participantes → bloqueada (403), como esperado.
- Administrador acessando a mesma lista → permitido, com os registros das tentativas realizadas.

---

## 2. Validação de cadastros com avisos visuais (sem `alert`/`console.log`)

### Objetivo

Garantir que os dados cadastrados no sistema (participantes, palestrantes, eventos, contas de aluno) sigam um formato consistente, evitando erros de digitação e dados inválidos, com mensagens de erro claras exibidas na própria tela — nunca em caixas de diálogo do navegador ou apenas no console.

### Regras aplicadas

| Campo | Regra |
|---|---|
| Nome | Apenas letras (com acentos), espaços e hífen — sem números |
| E-mail | Formato válido (`algo@dominio.algo`) |
| RGM | Exatamente 11 dígitos numéricos, sem espaços ou letras |
| Telefone (palestrante) | Máscara automática `(00) 00000-0000` |

### Fluxo do usuário

1. Ao preencher qualquer formulário do sistema (cadastro de participante, palestrante, evento, ou cadastro de conta de aluno) e tentar salvar com um campo inválido ou vazio, uma notificação (toast) aparece no canto da tela explicando exatamente o que está errado.
2. O campo de RGM já formata automaticamente em maiúsculo enquanto o usuário digita, e o campo de telefone aplica a máscara `(00) 00000-0000` sozinho.
3. Nada é salvo enquanto houver um campo inválido — o formulário permanece aberto para correção.
4. Confirmações de sucesso ("Participante cadastrado.", "Evento atualizado.", etc.) também aparecem como notificação, no lugar de um `alert()` do navegador.

### Como funciona por trás

- As regras de validação (nome, e-mail, RGM, telefone) existem em dois lugares espelhados: `frontend/src/utils/validacao.ts` (checagem imediata na tela) e `backend/src/utils/validacao.ts` + os schemas Zod de cada módulo (segunda barreira, caso a API seja chamada diretamente). Isso segue o princípio de nunca confiar apenas na validação do navegador.
- O sistema de notificação (`frontend/src/components/ui/Toast.tsx`) é um "pub/sub" simples: qualquer parte do código pode chamar `toast.error("mensagem")` ou `toast.success("mensagem")`, e um componente único (`ToastViewport`), montado uma vez na raiz da aplicação, exibe a notificação por alguns segundos e some sozinha.
- Antes de qualquer edição ou exclusão (participante, palestrante, sala, evento, inscrição), o sistema exibe uma caixa de confirmação (`ConfirmDialog.tsx`) — outra camada de proteção contra ações acidentais, especialmente importante numa aplicação usada por secretaria/administração.
- No back-end, a validação Zod (`validarCorpo` como middleware) barra a requisição antes mesmo de chegar à lógica de negócio, devolvendo código de erro `422` com a mensagem de qual campo falhou.

### Verificação realizada

Testado via requisições reais à API:
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
3. Também é possível exportar a lista de presença de um evento em CSV.

### Como funciona por trás

- A busca é feita inteiramente no navegador sobre a lista de participantes já carregada (sem round-trip ao servidor a cada tecla digitada), comparando o texto digitado (em minúsculo) contra nome, e-mail e RGM de cada participante — implementado em `frontend/src/services/checkinService.ts` (função `buscarParticipantes`) e replicado com a mesma lógica em `frontend/src/pages/Inscricoes/InscricoesPage.tsx`.
- Um campo vazio de busca não retorna nenhum resultado — evita mostrar a lista inteira de participantes por engano antes de o usuário começar a digitar.
- A tela de Inscrições valida três coisas antes de gravar: se um participante foi de fato selecionado na busca, se o evento tem vaga disponível (comparando capacidade da sala com o número de inscritos) e se o aluno já não está inscrito naquele mesmo evento — qualquer uma dessas situações é avisada por toast, sem travar a tela.

### Verificação realizada

Revisão de código completa do fluxo de busca (frontend) e testes de API confirmando que a listagem de participantes usada como base da busca reflete corretamente os cadastros existentes.

---

## 4. Cadastro de eventos, salas e palestrantes

> **Atualização:** o cadastro (criar/editar/excluir) de Salas e Palestrantes
> pela interface foi removido — essas duas tabelas agora são geridas direto
> no banco de dados. As telas `/salas` e `/palestrantes` continuam existindo,
> mas só como listagem de leitura. O restante desta seção (Eventos e a
> verificação abaixo) descreve o comportamento de antes dessa mudança, na
> parte que ainda se aplica hoje.

### Objetivo

Antes de existir um evento no sistema, é preciso ter pelo menos uma sala e um palestrante cadastrados — o evento sempre referencia os dois. A tela de Eventos (restrita a administrador/secretaria) é a base de todo o resto do sistema: sem evento não há inscrição, check-in, questionário nem certificado.

### Fluxo do usuário

- **Salas** (`/salas`) e **Palestrantes** (`/palestrantes`): listagem somente leitura para todos os perfis (o aluno não vê o telefone do palestrante). Não há mais botão de criar/editar/excluir nessas telas.
- **Eventos** (`/eventos`): título, sala, data/horário, palestrante responsável, tema e carga horária, além do construtor das 10 perguntas do questionário (ver funcionalidade 1). Só é possível abrir o formulário de novo evento se já existir pelo menos uma sala e um palestrante cadastrados no banco.
- Editar ou excluir um evento pede confirmação antes de gravar ("Confirmar alteração" / "Remover ..."), e qualquer campo inválido ou vazio é avisado por notificação (toast) — nunca por `alert()`.

### Como funciona por trás

- **Integridade referencial:** como todo evento exige uma sala e um palestrante (`Evento.salaId` e `Evento.palestranteId` são obrigatórios), o schema do banco usa `onDelete: Restrict` nessas relações — não é possível apagar uma sala ou palestrante em uso, mesmo removendo direto no banco enquanto houver evento vinculado.
- **Exclusão em cascata do evento:** ao excluir um evento, tudo o que depende dele também precisa sumir — inscrições, feedbacks e tentativas de questionário daquele evento. Isso é feito no back-end dentro de uma única operação (`eventos.service.ts`, função `remover`).
- O construtor de perguntas do formulário de evento trava o salvamento (com aviso indicando qual das 10 perguntas está incompleta) enquanto qualquer enunciado, alternativa ou marcação de "correta" estiver faltando — a validação (`validarQuestionario`, em `frontend/src/utils/questionario.ts`) é a mesma usada para montar o formulário.

### Verificação realizada

Antes da remoção do cadastro de salas/palestrantes, foi testado via requisições reais à API: criação de sala, palestrante e evento vinculando os dois; tentativa de excluir a sala e o palestrante em uso (bloqueada com `409` nos dois casos); edição do evento; exclusão do evento; e, só então, exclusão da sala e do palestrante — liberada com sucesso após o evento deixar de existir. Depois da remoção, foi confirmado que as telas de Salas e Palestrantes continuam listando os dados existentes e que o formulário de Eventos continua preenchendo os `<select>` de sala/palestrante normalmente.

---

## Contas de teste (ambiente de demonstração)

| Perfil | Login | Senha |
|---|---|---|
| Administrador | admin@umc.br | admin123 |
| Secretaria | secretaria@umc.br | secretaria123 |
| Aluno | aluno@aluno.umc.br | aluno123 |

O aluno de demonstração já está inscrito e com presença confirmada no evento "Abertura e Palestra Magna: IA na Educação", pronto para testar o questionário e a emissão do certificado sem precisar repetir os passos de inscrição e check-in.
