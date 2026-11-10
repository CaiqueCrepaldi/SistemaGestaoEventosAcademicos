# Evidências de implementação e testes — SGEA

**Data:** 09/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

Para cada controle, onde está no código, como foi testado e o resultado.
Controles que ainda não existem aparecem como "pendente", sem evidência. A
verificação de todos os requisitos funcionais está em
`docs/verificacao-de-requisitos.md`.

## Testes automatizados (banco de desenvolvimento `SGEA_dev`)

| Teste | Comando | Resultado em 10/11/2026 |
|---|---|---|
| Requisitos pela API | `cd backend && npx tsx scripts/testar-requisitos.ts` | **493/493** verificações |
| 2FA pela API | `cd backend && npx tsx scripts/testar-2fa.ts` | **55/55** |
| Interface com navegador de verdade | passo a passo no topo de `frontend/testes-interface/testar-interface.mjs` (rodado no Microsoft Edge, numa cópia com `channel: "msedge"`) | **169/169** |
| Demonstração do hash de senha | `cd backend && npx tsx scripts/demonstrar-hash-senha.ts` | ver `07`, "Formato do hash de senha" |
| Carga de demonstração | `cd backend && npx tsx scripts/carga-demonstracao.ts --aplicar` | 46 s; conferência no banco abaixo |

Os scripts de teste se recusam a rodar se o `DATABASE_URL` não for o
`SGEA_dev`, criam os próprios dados e apagam no final.

## Controles implementados

| Controle | Onde no código | Como foi testado | Resultado |
|---|---|---|---|
| Autorização por perfil em toda rota | `middleware/auth.ts` e todas as `*.routes.ts` | R04: aluno nas rotas da equipe → `403`; sem token → `401`. R36: professor sem Auditoria, Participantes e criação de sala; evento de outro → `404` | Confirmado |
| `participanteId` sempre do token | `feedbacks.routes.ts`, `eventos.routes.ts`, `inscricoes.routes.ts` | R08, R10 e R14: id de outro aluno no corpo ou na URL é ignorado | Confirmado |
| Hash de senha bcrypt custo 12 com salt; rehash no login | `utils/password.ts`, `auth.service.ts` | R20: hash de custo 10 vira 12 no login, sem trocar a senha; mesma senha em duas contas gera hashes diferentes | Confirmado |
| Nome, e-mail e RGM em texto, cada um numa tabela só | `schema.prisma`, `participantes.service.ts` | R24: cadastro grava em texto e a senha só como hash | Confirmado |
| Criptografia só do que é credencial | `utils/criptografia.ts`, `mfa.service.ts` | `testar-2fa.ts`: segredo do 2FA gravado cifrado | Confirmado |
| Conta do aluno só depois de confirmar o e-mail | `auth.service.ts`, `cadastros_pendentes` | R01 e R32: nenhuma conta antes do código; código e senha só em hash; 5 tentativas; reenvio com 60 s; expiração; limites por e-mail e IP | Confirmado |
| Regra da senha nova | `utils/validacao.ts` (backend e frontend) | R33 e R17: senha fora da regra → `422`; interface com a lista de requisitos | Confirmado |
| Troca de senha pela Minha Conta | `troca-senha.service.ts`, `auth.schemas.ts`, `AlterarSenha.tsx` | R46: os quatro perfis trocam; a senha antiga deixa de entrar; o token antigo cai e a sessão devolvida vale; senha atual errada conta no limite e 5 erros bloqueiam; regra, igual à atual e confirmação recusadas; com 2FA, sem código recusado e com código (ou de recuperação) aceito; código de "Esqueci minha senha" pendente invalidado; auditoria sem senha nem e-mail. Interface: trocar, sair e entrar com a nova | Confirmado |
| E-mail do aluno não editável | `participantes.routes.ts` | R15: `PUT` com e-mail → `422` | Confirmado |
| Professor ativado só pelo convite | `professores.service.ts`, `auth.routes.ts`, `PrimeiroAcessoPage.tsx` | R35: link com a chave depois do `#`, sem código; só o SHA-256 no banco; consultar não gasta; sem aceite → `422`; uso único; vencido recusado; reenvio invalida o anterior; chave errada cai no limite por IP; "Esqueci a senha" de quem espera o convite responde igual a e-mail inexistente; sem `APP_URL`, criar professor é recusado. Interface: login sem link de primeiro acesso; a chave some do endereço | Confirmado |
| Check-in pedido pelo aluno e decidido pelo professor do evento ou pela equipe | `modules/checkin/`, `utils/checkin.ts` | R12 e R43: fora da janela recusado; professor de outro evento → `403`; grava quem decidiu e quando; recusa impede novo pedido; reversão dentro do prazo; depois do questionário → `PRESENCA_TRAVADA`; expiração idempotente; dashboard pela regra nova | Confirmado |
| Aprovação, propostas de alteração e questionário travado | `eventos.service.ts`, `palestrantes.service.ts` | R37 a R41 | Confirmado |
| Inativação de aluno e de professor | `participantes.service.ts`, `professores.service.ts` | R16: aluno inativo não entra, sessões caem, inscrições sem pedido canceladas. R42: professor inativo não entra; eventos em aberto transferidos, com histórico e auditoria | Confirmado |
| Calendário: o professor vê os eventos dos outros só como "Sala ocupada" | `eventos.service.ts` (`calendario`) | R44: resposta ao professor sem título, palestrante, inscritos nem id dos outros. Interface: "Sala ocupada" sem título | Confirmado |
| Contas fictícias nunca recebem e-mail | `email.service.ts`, `usuarios.ficticio` | R45: envio para conta fictícia suprimido, conta normal recebe; inscrição, mudança de horário e cancelamento funcionam sem e-mail; o campo não aparece na API | Confirmado |
| Avaliação sem edição; exclusão pelo aluno ou pela equipe com motivo | `feedbacks.routes.ts`, `feedbacks.service.ts` | R22 e R14 | Confirmado |
| 2FA opcional, segredo e QR no servidor, códigos de recuperação, reuso, bloqueio, reset | `modules/mfa/`, `scripts/resetar-2fa.ts` | `testar-2fa.ts` (55 verificações) | Confirmado |
| Limite de tentativas (conta e IP) | `utils/limiteAcesso.ts` | R02, R32, R35 e `testar-2fa.ts` | Confirmado |
| Invalidação de sessão | `middleware/auth.ts`, `usuarios.versaoToken` | R16, R17, R42 e `testar-2fa.ts`: token antigo → `401` | Confirmado |
| Trilha de auditoria sem dado pessoal | `utils/auditoria.ts` | R18: nenhum log do teste tem e-mail, RGM, senha, código, comentário ou motivo de inativação | Confirmado, 0 vazamentos |
| Aceite dos Termos versão 1, datado pelo servidor | `config/termos.ts`, `auth.service.ts`, `professores.service.ts` | R01 e R35: a conta grava o instante e a versão "1" | Confirmado |
| Validação pública do certificado sem RGM | `certificados.service.ts` | R29 | Confirmado |
| Página "Meus dados" | `modules/titular/` | R30: só o próprio aluno; sem gabarito, senha ou ids; mostra o check-in | Confirmado |
| Separação de ambientes | `.env` → `SGEA_dev`; `.env.production.local` só com `--producao` | Todos os testes rodaram no `SGEA_dev` | Confirmado |
| Sem serviço externo além dos três documentados | `frontend/index.html`, `package.json` | Inspeção de dependências e imports | Confirmado |

## Carga de demonstração (09/11/2026, `SGEA_dev`)

Conferido consultando o banco depois de `carga-demonstracao.ts --aplicar`:
nenhum conflito de sala; nenhum evento acima da capacidade; 1.153 contas com
1.153 e-mails distintos; 1.000 RGMs distintos no formato `09` + 9 dígitos;
nenhuma ocorrência de "teste", "demo", "fake" ou "exemplo" nos dados; as três
contas de demonstração entram sem 2FA, com o aceite da versão 1; o evento da
apresentação (13/11/2026, 21:00) tem 35 inscritos e 12 pedidos de check-in
entre 20:00 e 20:15, listados no painel do professor; a auditoria começa com
um único registro (`CARGA_DEMONSTRACAO`); o Dashboard mostra ocupação,
presença e certificados; um certificado da carga valida pela consulta
pública.

## Controles pendentes — sem evidência ainda

| Controle | Onde vai ficar | Como será testado |
|---|---|---|
| Tela de reaceite dos Termos quando a versão mudar | Frontend, depois do login (o backend já devolve `precisaAceitarTermos` e tem `POST /api/auth/aceitar-termos`) | Conta com versão antiga entra, a tela pede o aceite e registra `TERMOS_REACEITOS` |
| Tela da equipe para registrar e responder os pedidos do titular | Tabela `solicitacoes_titular` (já existe) | Pedido registrado, atendido e auditado |
| Cópia e correção feitas pelo próprio aluno em "Meus dados" | `modules/titular/` | Exportação com todos os campos esperados e nenhum a mais |
| Anonimização em vez de exclusão | `participantes.service.ts` | Depois da exclusão, nada identifica a pessoa; estatísticas preservadas |
| Rotina de retenção automática | Rota protegida + agendamento | Rodar duas vezes sem repetir ação; cada critério com dado fabricado |
