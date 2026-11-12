# Diagnóstico LGPD — SGEA

**Data:** 12/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

Comparação item a item entre o guia de adequação à LGPD do professor
Alessandro Aparecido da Silva (seções 1 a 7) e o que o SGEA faz hoje, com a
evidência no código. "Limitação" marca o que não está implementado e está
declarado como tal nos documentos (o guia trata esconder lacuna como pior do
que declará-la).

## Papéis

- **Protótipo acadêmico:** responsáveis pelo tratamento = Caique Crepaldi e
  João Pedro Rachid de Abreu (equipe do projeto). O Prof. Bruno Messias
  Aguiar é só orientador: não é controlador, encarregado nem responsável
  pelos dados.
- **Implantação real:** controladora = Universidade de Mogi das Cruzes, com o
  encarregado institucional.
- **Operadores:** Vercel, TiDB Cloud e SendGrid (Twilio) — ver `06`.
- **Canal de privacidade:** página "Meus dados" e
  `privacidade@sgeacademicos.com.br` — ver `08`.

## 1. Planejamento (seção 1 do guia)

| Requisito | Situação | Evidência |
|---|---|---|
| Inventário de tratamento (dado, tela, finalidade, base legal, obrigatoriedade, retenção, acesso, compartilhamento, direitos, incidente) | Atende | `01-inventario-e-fluxo-de-dados.md` e `02-matriz-dados-finalidade-base-legal.md` |
| Finalidade específica, não genérica | Atende | Uma linha por dado na matriz `02`, com o artigo da base legal |

## 2. Política de Privacidade (seção 2 do guia)

| Requisito | Situação | Evidência |
|---|---|---|
| 2.1 Controlador, operadores e canal que funciona | Atende | `politica-de-privacidade.md`, seção 1; página "Meus dados" (`GET /api/meus-dados`) e e-mail de privacidade |
| 2.2 Dados pessoais tratados | Atende | Seção 2 da Política, conferida contra `schema.prisma` (aluno, professor, palestrante, check-in, questionário, certificado, avaliação, histórico da aprovação, auditoria, IP, 2FA) |
| 2.3 Finalidades e bases legais (consentimento não é padrão) | Atende | Tabela da seção 3 da Política; consentimento só na avaliação da palestra, que é opcional. O aceite dos Termos é formalização do contrato, não consentimento (texto do aceite: "Li e aceito os Termos de Uso e estou ciente da Política de Privacidade") |
| 2.4 Compartilhamento e serviços externos | Atende | Seção 4 da Política: TiDB Cloud, SendGrid (com a lista exata dos e-mails enviados) e Vercel |
| 2.5 Transferência internacional e cookies | Atende | Seção 5 da Política: os três operadores nos EUA; sem cookies (sessão em `localStorage`) |
| 2.6 Retenção e descarte com critério verificável | Parcial | O que já é descartado está implementado e descrito (cadastro pendente, convite, exclusão a pedido, inativação). A rotina automática (conta sem uso, códigos vencidos, logs de 5 anos) é **plano** declarado em `04`, e a Política não a promete |
| 2.7 Direitos dos titulares com canal de verdade | Atende | Acesso pela página "Meus dados"; os demais pedidos pelo e-mail, com prazo de 15 dias e procedimento em `08` |
| 2.8 Segurança, incidentes, versão e data | Atende | Seções 6 e 9 da Política; plano de incidentes em `05`; versão 1, de 12/11/2026, gravada no aceite (`VERSAO_TERMOS_ATUAL`) |

## 3. Termos de Uso (seção 3 do guia)

| Requisito | Situação | Evidência |
|---|---|---|
| Descrição, finalidade e limitação do serviço | Atende | Seções 1 e 9 dos Termos |
| Quem pode usar | Atende | Seção 2: aluno (cadastro com e-mail institucional confirmado), professor (convite) e equipe |
| Idade e representação | Limitação | O sistema é para alunos de graduação e professores; não coleta idade nem pede declaração de maioridade (ver `09`, seção 5.2) |
| Conta, papéis, permissões e condutas proibidas | Atende | Seções 3, 4, 5 e 8 dos Termos e `03-matriz-perfis-e-permissoes.md` |
| Encerramento da conta | Atende | Seção 10 dos Termos: inativação e exclusão; com certificado, só inativação |
| Não transfere toda a responsabilidade ao usuário nem autoriza uso futuro genérico | Atende | Seção 11 dos Termos |
| Versão e data | Atende | Versão 1 — 12/11/2026, registrada na conta no aceite |

## 4. Requisitos técnicos mínimos (seção 4 do guia)

### 4.1 Minimização

| Item | Situação | Evidência |
|---|---|---|
| Aluno: nome, e-mail e RGM, todos necessários | Atende | `schema.prisma`; cada dado numa tabela só |
| Professor e secretaria (tela Equipe): só nome e e-mail institucional | Atende | `professores.schemas.ts` (`contaEquipeSchema`) |
| Palestrante: só nome e e-mail; o aluno não recebe o e-mail | Atende | `schema.prisma`, `utils/dto.ts` |
| Professor vê só os alunos dos próprios eventos; no calendário, só "Sala ocupada" dos outros | Atende | `utils/escopo.ts`, `eventos.service.ts` (`calendario`) |
| Sem CPF, endereço, nascimento, foto ou dado de saúde | Atende | Schema inteiro |

### 4.2 Autenticação

| Item | Situação | Evidência |
|---|---|---|
| Hash forte com salt | Atende | bcrypt custo 12, salt por senha (`utils/password.ts`) |
| Senha nunca em texto puro nem em log | Atende | `07`, "Logs do servidor sem dado pessoal" |
| Token temporário e de uso único na recuperação e no convite | Atende | Código de recuperação: hash bcrypt, 15 min, 5 tentativas. Convite do professor: chave de 32 bytes, só o SHA-256 no banco, 24 h, uso único |
| Limite de tentativas | Atende | `utils/limiteAcesso.ts`: por conta e por IP no login, na recuperação, no cadastro, no convite e no 2FA |
| Invalidar sessões na troca de senha, inativação e exclusão | Atende | `usuarios.versaoToken`, conferida em toda requisição |
| HTTPS | Atende | Vercel |
| Cookies de sessão | Não se aplica | Não há cookie; sessão em `localStorage` (limitação registrada em `07`) |
| Multifator | Atende (opcional) | 2FA por aplicativo autenticador, opcional para todos os perfis |

### 4.3 Autorização por perfil

| Item | Situação | Evidência |
|---|---|---|
| Negação por padrão e conferência no backend | Atende | `autenticar` e `autorizar` em toda rota; matriz completa em `03` |
| Ninguém lê dado de outra pessoa | Atende | `participanteId` sempre do token para o aluno; professor só nos eventos dele (`404` ou `403` nos outros) |
| Ninguém define o próprio perfil | Atende | Nenhuma rota aceita `perfil` no corpo |

### 4.4 Banco, dados, arquivos e segredos

| Item | Situação | Evidência |
|---|---|---|
| ORM e consultas parametrizadas | Atende | Prisma em todo o código de aplicação |
| Separar desenvolvimento, teste e produção | Atende | `SGEA_dev` para dev e testes; produção só com `.env.production.local`; os testes se recusam a rodar fora do `SGEA_dev` |
| Não usar dado real em teste e demonstração | Atende | Os testes criam e apagam os próprios dados. A demonstração usa contas fictícias (`usuarios.ficticio`), que nunca recebem e-mail (`email.service.ts`) |
| Backups e migrações documentados | Atende | `04` (backup diário do TiDB, 1 dia de retenção); migrations versionadas e só aditivas |
| Chaves fora do código | Atende | `.env`/`.env.*` no `.gitignore`; `src/config/env.ts` recusa valor de exemplo |
| Proteger o que é credencial | Atende | Senha e códigos em hash; segredo do 2FA cifrado (AES-256-GCM). Nome, e-mail e RGM são dados pessoais comuns, protegidos por acesso por perfil, TLS e auditoria |

### 4.5 Logs, auditoria e direitos

| Item | Situação | Evidência |
|---|---|---|
| Registrar login, falha, acesso negado e mudança crítica | Atende | `utils/auditoria.ts` (inclui check-in, aprovação, propostas, inativação e transferência) |
| Nunca gravar senha, token ou texto livre no log | Atende | `detalhe` só com ids, quantidades e motivos de lista fechada; teste R18 confere |
| Procedimento para atender os direitos | Parcial | Acesso na tela; os demais pedidos por e-mail, atendidos pelas telas de gestão (`08`). Falta a tela da equipe para registrar os pedidos (limitação) |

### 4.6 Plano de retenção

Parcial — ver `04-plano-de-retencao-e-descarte.md`: o descarte do cadastro
pendente, do convite usado, da conta excluída a pedido e das inscrições na
inativação está implementado; a rotina automática é plano.

### 4.7 Resposta a incidentes

Atende — `05-plano-de-resposta-a-incidentes.md`, com as 6 etapas do guia, os
papéis e o prazo da Resolução CD/ANPD nº 15/2024.

## 5. Cuidados específicos por área (seção 5 do guia)

Ver `09-avaliacoes-especificas.md`: educação se aplica (perfis separados,
check-in decidido pelo professor do evento ou pela equipe, notas sem
ranking); crianças e adolescentes, saúde, finanças, biometria e IA não se
aplicam, com justificativa.

## 6 e 7. Entregáveis e critérios de avaliação

| Critério do guia ("não será considerado suficiente") | Situação |
|---|---|
| Copiar política genérica ou declarar conformidade sem demonstrar | Atende — a Política descreve o SGEA, conferida contra o código; evidências em `10` |
| Consentimento obrigatório para todo tratamento | Atende — consentimento só na avaliação opcional |
| Esconder funções apenas no frontend | Atende — toda regra é conferida no backend (`03`) |
| Senha em texto puro ou chave de API versionada | Atende |
| Dados reais de aluno em testes | Atende — banco de dev separado e dados de teste próprios; demonstração com contas fictícias |
| Manter dado indefinidamente ou prometer exclusão sem implementar | Parcial — a Política só promete o que existe; a rotina automática está declarada como plano em `04` |
| Utilizar IA sem informar | Não se aplica — o sistema não usa IA |
| Transferir ao usuário toda a responsabilidade | Atende |
| Confundir Termos de Uso com Política de Privacidade | Atende — documentos e páginas separados, publicados juntos na mesma versão |

## Serviços externos que recebem dado pessoal ou IP

| Serviço | O que recebe | País |
|---|---|---|
| TiDB Cloud (banco) | Todos os dados do sistema | EUA (AWS us-east-1) |
| SendGrid (Twilio) | Destinatário e conteúdo dos 6 e-mails do sistema (ver `06`) | EUA |
| Vercel | IP, cabeçalhos e o tráfego da API | EUA |

O frontend não carrega CDN de fonte, analytics nem SDK de terceiro; o PDF
do certificado é montado no navegador (jsPDF).
