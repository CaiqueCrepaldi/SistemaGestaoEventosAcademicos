# Avaliações específicas por área — SGEA

**Data:** 27/09/2026 · **Versão:** 1

Segue a seção 5 do guia, área por área, com justificativa de aplicação ou
não aplicação — nenhuma marcada como "não se aplica" sem explicação, como
o próprio guia exige.

## 5.1 Educação — aplica-se

É o caso central do sistema. Cuidados adotados:

- **Perfis separados:** ADMINISTRADOR, SECRETARIA e ALUNO, com autorização
  checada no backend em toda rota (`03-matriz-perfis-e-permissoes.md`) —
  não professor/responsável/direção, porque o SGEA não modela esses papéis
  (é gestão de eventos de extensão/palestra, não sistema de notas de
  disciplina regular).
- **Presença e desempenho no questionário:** protegidos — só o próprio
  aluno e a equipe enxergam a nota de alguém; não existe tela nem endpoint
  que exponha ranking ou comparação entre alunos.
- **Quem pode alterar presença/nota:** só ADMINISTRADOR/SECRETARIA
  confirmam presença (rota de check-in); a nota do questionário é
  calculada pelo servidor a partir das respostas do próprio aluno, sem
  edição manual possível por ninguém. Toda confirmação de presença gera
  log de auditoria (`PRESENCA_CONFIRMADA`/`PRESENCA_MARCADA_AUSENTE`).

## 5.2 Crianças e adolescentes — não se aplica, com justificativa

O SGEA é destinado a alunos de graduação já matriculados na UMC, cadastro
feito com e-mail institucional próprio. Decisão da Fase 0: **não coletar
data de nascimento** (minimização — não há campo de idade em lugar
nenhum do sistema). Em vez de verificar idade tecnicamente, os Termos de
Uso e o aceite do cadastro passam a exigir a declaração "Tenho 18 anos ou
mais, ou tenho autorização do meu responsável legal" (Fase 2 item 2). Não
há fluxo de vínculo com responsável, publicidade comportamental ou
qualquer coleta adicional pensada para menor — se um caso real de aluno
menor de idade surgisse, exigiria desenho específico que este PFC não
cobre.

## 5.3 Saúde, odontologia e bem-estar — não se aplica

O sistema não trata dado de saúde, diagnóstico, prontuário, imagem clínica
ou qualquer informação relacionada a bem-estar físico/mental do titular.
Nenhum campo do schema (`backend/prisma/schema.prisma`) se aproxima dessa
categoria.

## 5.4 Finanças e investimentos — não se aplica

O sistema não trata renda, patrimônio, dado bancário, cartão de pagamento
nem qualquer simulação financeira. Não há cobrança nem pagamento
associado a evento, inscrição ou certificado.

## 5.5 Presença, imagem, voz e biometria — parcialmente relacionado, sem coleta biométrica

Há "presença" no sentido de check-in (confirmação booleana de comparecimento
físico ao evento, com data/hora e quem confirmou) — não é biometria, nem
imagem, nem voz. Nenhuma câmera, microfone, leitor biométrico ou
reconhecimento facial/de voz é usado em nenhum ponto do sistema. O único
dado ligado a "presença" é o registro administrativo de check-in descrito
na matriz de dados (`02-matriz-dados-finalidade-base-legal.md`).

## 5.6 Inteligência artificial — não se aplica, verificado no código

Nenhuma funcionalidade do SGEA depende de IA, generativa ou não:

- **Certificado:** montado inteiramente pelo `jsPDF` no navegador do
  próprio titular — vetores desenhados diretamente, sem chamada a nenhum
  serviço externo (confirmado em `frontend/src/services/certificadoService.ts`).
- **Correção do questionário:** comparação direta de índice de resposta
  contra o gabarito, feita no backend (`questionario.service.ts`) — não
  há modelo de linguagem nem qualquer inferência estatística envolvida.
- **Nenhuma dependência de IA no `package.json`** de nenhum dos dois
  lados (frontend ou backend) — confirmado na Fase 0.

Não há, portanto, prompt, modelo, fornecedor de IA, treinamento ou dado
enviado a serviço de IA para documentar aqui. Se uma versão futura do
sistema vier a incorporar IA (ex.: sugestão automática de perguntas do
questionário), este documento precisa ser atualizado antes de a
funcionalidade entrar em produção — não depois.
