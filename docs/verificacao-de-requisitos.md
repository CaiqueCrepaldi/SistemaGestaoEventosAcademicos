# Verificação de requisitos — SGEA

**Data:** 29/09/2026 · **Versão:** 1

Lista dos requisitos do sistema, como cada um foi testado, o resultado e o
que precisou ser corrigido. Os requisitos vêm de
`docs/funcionalidades-principais.md` e `docs/api-contract.md` (não havia
lista anexada), mais as melhorias pedidas pelo orientador nesta rodada
(itens B a G: hash de senha, inativação, feedback, campos obrigatórios, 2FA
opcional e dados pessoais sem criptografia).

## Como foi testado

Todos os testes rodaram em 29/09/2026 contra o banco de desenvolvimento
(`SGEA_dev`), nunca contra a produção — cada script se recusa a rodar se o
`DATABASE_URL` não for o do dev. Cada um cria os próprios dados de teste e
apaga no final (os registros de auditoria ficam, como em qualquer operação).

| Teste | O que faz | Comando | Resultado |
|---|---|---|---|
| Requisitos pela API | Sobe o backend numa porta local e faz as chamadas HTTP de verdade, requisito por requisito | `cd backend && npx tsx scripts/testar-requisitos.ts` | **123/123** verificações |
| 2FA pela API | Ativação, login em duas etapas, reuso de código, bloqueio, recuperação, reset, desativação | `cd backend && npx tsx scripts/testar-2fa.ts` | **53/53** |
| Interface | Navegador de verdade (Google Chrome, sem janela) usando as telas no frontend local ligado ao backend local | ver `frontend/testes-interface/testar-interface.mjs` (passo a passo no topo do arquivo) | **60/60** |
| Hash de senha | Mostra o formato do hash bcrypt gravado no banco de dev e prova que a mesma senha gera hashes diferentes | `cd backend && npx tsx scripts/demonstrar-hash-senha.ts` | ver `docs/lgpd/07` |
| Conversão dos dados pessoais | Simulação, aplicação e segunda aplicação (idempotência) no dev | `cd backend && npx tsx scripts/converter-dados-pessoais.ts [--aplicar]` | 3 usuários, 3 participantes e 98 logs convertidos; a 2ª rodada não achou nada |

Na coluna "Teste", **API Rxx** é a seção de mesmo código em
`testar-requisitos.ts` e **Interface** é a seção de mesmo nome em
`testar-interface.mjs`.

## Requisitos

| # | Requisito | Como foi testado | Resultado | O que foi corrigido |
|---|---|---|---|---|
| 1 | Cadastro público de aluno: nome só com letras, RGM de 11 dígitos, e-mail `@alunos.umc.br`, senha com 8+ caracteres, aceite dos Termos obrigatório, sem e-mail/RGM duplicado | API R01; Interface "Cadastro de aluno" | OK | Formulário passou a marcar cada campo com o problema (item E). Texto do aceite reescrito: "Li e aceito os Termos de Uso e estou ciente da Política de Privacidade" (não é consentimento). E-mail/RGM duplicado agora aparece embaixo do campo certo |
| 2 | Login com mensagem genérica (não revela se o e-mail existe) e limite de tentativas | API R02; testes do bloco 2 | OK | — |
| 3 | Dados da própria conta (`GET /usuarios/me`) | API R03 | OK | — |
| 4 | Permissões por perfil: aluno barrado em rota da equipe; sem token → 401 | API R04 | OK | — |
| 5 | Salas: cadastro, edição, leitura pelo aluno, exclusão bloqueada com evento vinculado | API R05 e R07; Interface "Salas" | OK | Campos obrigatórios (item E) |
| 6 | Palestrantes: nome só letras, e-mail válido e único, aluno não recebe o e-mail, exclusão bloqueada com evento vinculado | API R06 e R07; Interface "Palestrantes" | OK | E-mail duplicado (erro do backend) agora aparece embaixo do campo e-mail (item E) |
| 7 | Eventos com questionário de 10 perguntas × 4 alternativas × 1 correta, gabarito escondido do aluno | API R07; Interface "Eventos" | OK | Erro de cada pergunta aparece na própria pergunta (item E). **Corrigido:** excluir um evento pela tela apagava antes, uma por uma pela API, as inscrições e os feedbacks do evento — o backend já faz isso em cascata numa operação só; agora a tela faz uma chamada |
| 8 | Autoinscrição do aluno (sempre o participante do token, sem duplicidade, sem passar da capacidade) | API R08; Interface "Agenda e certificados" | OK | Aluno inativo também barrado no próprio serviço (item C) |
| 9 | Inscrição manual pela equipe | API R09; Interface "Inscrição manual" | OK | Bloqueia aluno inativo (item C); campos obrigatórios (item E) |
| 10 | Aluno só vê as próprias inscrições, mesmo forjando o parâmetro na URL | API R10 | OK | — |
| 11 | E-mail de confirmação da inscrição, só pelo dono | API R11 | OK | — |
| 12 | Check-in (presente/ausente) pela equipe; quem confirmou vem do token | API R12; Interface "Check-in pela tela da secretaria" | OK | — |
| 13 | Questionário obrigatório: correção no servidor, no máximo 2 tentativas, aprovado não refaz | API R13; Interface "Questionário" | OK após correção | **Corrigido:** o aluno conseguia responder o questionário de um evento sem ter presença confirmada (nem precisava estar inscrito). Agora o backend exige presença confirmada e conta ativa (403 caso contrário). Pergunta sem resposta fica destacada (item E) |
| 14 | Certificado liberado com presença + 60% no questionário, emitido em PDF pelo aluno | Interface "Agenda e certificados" (inclui o download do PDF) | OK após correção | **Corrigido:** a tela de Certificados do aluno nunca mostrava certificado nenhum. Ela buscava a lista de participantes, que só a equipe pode ler (403), e a tela ficava vazia sem aviso. Agora usa os dados da própria conta do aluno |
| 15 | Agenda com inscritos/capacidade de cada evento | API R09 (contagem); Interface "Agenda e certificados" | OK após correção | **Corrigido:** para o aluno a Agenda mostrava 0 ou 1 inscrito (contava só as inscrições dele, as únicas que ele enxerga). A API passou a devolver a contagem de inscritos por evento |
| 16 | Feedback só de palestra com certificado, um por evento, sempre em nome do próprio aluno | API R14 | OK | — |
| 17 | Feedback não é editado; aluno exclui o próprio e pode enviar outro; equipe só exclui, com motivo (item D) | API R22; Interface "Feedback do aluno" e "Feedback pela equipe" | OK | Implementado nesta rodada |
| 18 | Participantes: listagem e correção de nome/e-mail/RGM pela equipe | API R15 | OK após correção | **Corrigido:** corrigir o nome ou o e-mail do participante não atualizava a conta de login do aluno — ele continuava entrando com o e-mail antigo e o nome antigo aparecia no topo da tela e na auditoria. Agora a correção vale para os dois. E-mail gravado sempre em minúsculo |
| 19 | Inativação e reativação padronizadas (item C) | API R16; Interface "Inativação", "Inscrição manual" e "Tela Usuários" | OK | Implementado nesta rodada (ver `docs/lgpd/03` e `07`) |
| 20 | Recuperação de senha por código | API R17; Interface "Esqueci a senha" | OK | Campos obrigatórios (item E) |
| 21 | Trilha de auditoria: filtros, responsáveis, nada de dado pessoal no detalhe | API R18; Interface "Auditoria: filtro pelas ações novas" | OK após correção | **Corrigido:** a tela de Auditoria não conhecia as ações criadas nos blocos de segurança (2FA, bloqueio por tentativas etc.): elas não apareciam no filtro e a tabela mostrava só o código |
| 22 | Exclusão de evento em cascata (inscrições, feedbacks, tentativas) | API R19 | OK | — |
| 23 | Dashboard da equipe | Interface "Equipe entra só com a senha" (a tela abre com os 4 indicadores) | OK | — |
| 24 | 2FA opcional para todos os perfis (item F) | `testar-2fa.ts`; API R20; Interface "Equipe entra só com a senha" e "2FA na Minha conta" | OK | Implementado nesta rodada |
| 25 | Senha com bcrypt, salt por senha, custo 12 e rehash no login (item B) | API R20; `demonstrar-hash-senha.ts` | OK | Implementado nesta rodada |
| 26 | Nome, e-mail e RGM em texto puro, sem quebrar os registros antigos (item G, primeira implantação) | API R24; conversão no dev + as três suítes rodadas de novo depois dela | OK | Implementado nesta rodada; a conversão em produção depende de confirmação |
| 27 | Campos obrigatórios marcados e validados do mesmo jeito em todos os formulários (item E) | Interface (todas as seções "E") | OK | Implementado nesta rodada |
| 28 | Comentário de feedback longo | Leitura dos dois bancos (schema × dev × produção) | Corrigido | **Corrigido:** o schema dizia `VARCHAR(191)` e o banco de dev seguia isso (comentário com mais de 191 caracteres dava erro 500), enquanto a produção já tinha `TEXT`. Schema e dev alinhados com a produção por migration, com limite de 1000 caracteres e mensagem clara |

## Outras correções encontradas na verificação

- `docs/api-contract.md` e `docs/funcionalidades-principais.md` descreviam
  comportamentos antigos (formato do evento sem o questionário, domínio de
  e-mail de outra instituição, participantes sem tela de gestão, avisos só
  por notificação). Os dois foram atualizados.
- O tamanho de `motivoInativacao` no schema dizia 191 caracteres, mas a
  coluna sempre teve 500 (corrigido só no schema, sem migration).
- Os scripts `backfill-criptografia.ts` e `backfill-auditoria.ts` (migrações
  de dado de uso único, já rodadas) foram removidos: o primeiro voltaria a
  cifrar nome/e-mail/RGM, contrariando a decisão do item G.

## Pendências registradas (fora desta rodada)

- Página "Meus dados", anonimização da conta, rotina automática de retenção
  e publicação da Política/Termos v2 no site continuam pendentes (blocos 4 a
  7 da Fase 2) — o formulário de "Meus dados" ainda não existe, então não
  entrou na padronização do item E.
- `POST /auth/recuperacao-senha` responde 404 quando o e-mail não está
  cadastrado (limitação registrada em `docs/lgpd/07`, decisão pendente).
