# Avaliações específicas por área — SGEA

**Data:** 12/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

Segue a seção 5 do guia, área por área, com justificativa de aplicação ou
não aplicação — nenhuma marcada como "não se aplica" sem explicação, como o
próprio guia exige.

## 5.1 Educação — aplica-se

É o caso central do sistema. Cuidados adotados:

- **Perfis separados:** ADMINISTRADOR, SECRETARIA, PROFESSOR e ALUNO, com
  autorização conferida no backend em toda rota
  (`03-matriz-perfis-e-permissoes.md`). O SGEA é gestão de eventos
  acadêmicos (palestras, minicursos), não sistema de notas de disciplina:
  não modela responsável nem direção.
- **O professor só vê os próprios eventos:** dos alunos inscritos neles,
  nome, RGM, check-in e notas do questionário, e só inscreve alunos nesses
  eventos. Desde 12/11/2026 não acessa certificados nem avaliações (a API
  responde `403`), e o Dashboard dele mostra só os números dos eventos
  dele. Não vê a lista geral de alunos nem os eventos dos colegas (no
  calendário, só "Sala ocupada").
- **Presença e desempenho no questionário:** só o próprio aluno, a equipe e
  o professor do evento enxergam a nota de alguém; não existe tela nem rota
  que exponha ranking ou comparação entre alunos.
- **Quem altera presença e nota:** o aluno pede o check-in e só o professor
  do evento, a secretaria ou o administrador aprovam ou recusam (rotas
  `/api/checkin`); a nota do questionário é calculada pelo servidor a
  partir das respostas do próprio aluno, sem edição manual por ninguém.
  Depois da primeira tentativa do questionário, a presença não muda mais, e
  o questionário do evento também não. Todo pedido e toda decisão geram
  registro de auditoria (`CHECKIN_SOLICITADO`, `CHECKIN_APROVADO`,
  `CHECKIN_RECUSADO`, `CHECKIN_REVERTIDO`, `CHECKIN_APROVADO_TODOS`), só com
  ids.

## 5.2 Crianças e adolescentes — não se aplica, com justificativa

O SGEA é destinado a alunos de graduação matriculados na UMC, com cadastro
feito pelo e-mail institucional próprio (`@alunos.umc.br`), e a
professores da instituição (`@umc.br`). Por minimização, **não coleta data
de nascimento** nem qualquer dado de idade, e não há fluxo de vínculo com
responsável, publicidade comportamental ou coleta adicional pensada para
menor. O sistema não verifica idade nem pede declaração de maioridade: se
um caso real de aluno menor de idade surgir, ele exige um desenho
específico que este projeto não cobre.

## 5.3 Saúde, odontologia e bem-estar — não se aplica

O sistema não trata dado de saúde, diagnóstico, prontuário, imagem clínica
ou qualquer informação sobre o bem-estar físico ou mental do titular.
Nenhum campo do schema (`backend/prisma/schema.prisma`) se aproxima dessa
categoria. Eventos com tema de saúde são só conteúdo da programação.

## 5.4 Finanças e investimentos — não se aplica

O sistema não trata renda, patrimônio, dado bancário, cartão de pagamento
nem simulação financeira. Não há cobrança nem pagamento associado a
evento, inscrição ou certificado.

## 5.5 Presença, imagem, voz e biometria — relacionado, sem coleta biométrica

Há "presença" no sentido de check-in: o aluno pede, com data e hora, e o
professor do evento ou a equipe decide, com registro de quem decidiu e
quando. Não é biometria, nem imagem, nem voz: nenhuma câmera, microfone,
leitor biométrico, geolocalização ou reconhecimento facial ou de voz é
usado em nenhum ponto do sistema. O aluno só confirma, na tela, que está no
local do evento.

## 5.6 Inteligência artificial — não se aplica, verificado no código

Nenhuma funcionalidade do SGEA depende de IA, generativa ou não:

- **Certificado:** montado pelo `jsPDF` no navegador do próprio titular, sem
  chamada a serviço externo (`frontend/src/services/certificadoService.ts`).
- **Correção do questionário:** comparação direta do índice da resposta com
  o gabarito, no backend (`questionario.service.ts`), sem modelo de
  linguagem nem inferência estatística.
- **Nenhuma dependência de IA** no `package.json` do frontend nem do backend.

Não há prompt, modelo, fornecedor de IA, treinamento ou dado enviado a
serviço de IA para documentar. Se uma versão futura incorporar IA, este
documento precisa ser atualizado antes de a funcionalidade entrar em
produção.
