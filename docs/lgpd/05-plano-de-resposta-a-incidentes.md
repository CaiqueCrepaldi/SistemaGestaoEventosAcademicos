# Plano de resposta a incidentes de segurança — SGEA

**Data:** 27/09/2026 · **Versão:** 1

Aplica as 6 etapas da seção 4.7 do guia ao SGEA, com responsável por etapa
e o prazo regulatório vigente, conferido na fonte oficial da ANPD (ver
"Referência normativa" no fim do documento).

## Papéis

| Papel | Quem, hoje (protótipo) | Quem, numa implantação real |
|---|---|---|
| Responsável técnico | Equipe do PFC (Caique Crepaldi e João Pedro Rachid de Abreu) | Equipe técnica/TI da UMC |
| Decisão sobre comunicar ANPD/titulares | Equipe do PFC, simulado — numa implantação real essa decisão é do controlador | Encarregado (DPO) institucional da UMC + controlador |
| Canal de recebimento do alerta inicial | `privacidade@sgeacademicos.com.br` e a própria equipe monitorando `logs_auditoria` | Canal formal de TI/segurança da instituição |

## As 6 etapas aplicadas ao SGEA

### 1. Detectar e confirmar o incidente

Fontes de detecção no SGEA: alerta manual (alguém percebe algo estranho),
picos de `LOGIN_FALHA`/`ACESSO_NEGADO` na trilha de auditoria, erro
inesperado nos logs de execução da Vercel, ou aviso de terceiro (TiDB
Cloud, Vercel, SendGrid). Confirmar significa checar se o evento envolveu
dado pessoal de verdade (acesso indevido a registro, exposição de log,
vazamento de credencial) e não é falso positivo.

### 2. Conter o problema e preservar evidências

Ações possíveis, dependendo do tipo de incidente: revogar/rotacionar a
credencial comprometida (`JWT_SECRET`, `ENCRYPTION_KEY`, chave do
SendGrid), bloquear a conta afetada, reverter um deploy problemático na
Vercel. Preservar evidência aqui significa **não apagar nada da tabela
`logs_auditoria`** durante a investigação — ela é exatamente a fonte de
evidência que a arquitetura já garante ser imutável.

**Limitação conhecida de recuperação por backup:** o TiDB Cloud faz backup
do cluster 1 vez por dia (07:00 UTC), e cada backup expira em 1 dia — ou
seja, só é possível restaurar o estado de, no máximo, as últimas 24 horas.
Um incidente que corrompa ou apague dado e só seja percebido depois desse
prazo **não tem backup correspondente pra recuperação**; a única fonte de
reconstrução nesse cenário passa a ser a trilha de auditoria
(`logs_auditoria`, que não depende de backup porque nunca é apagada dentro
do prazo de retenção de 5 anos) e qualquer log de execução ainda
disponível na Vercel.

### 3. Identificar dados e titulares afetados

Consulta direta ao banco (por quem tem acesso de administrador),
cruzando `logs_auditoria` com o período do incidente. Como nome/e-mail/RGM
ficam cifrados, decifrar pra identificar o titular afetado é uma operação
sensível em si — só deve ser feita pelo responsável técnico, e o próprio
ato de decifrar em resposta a um incidente deveria virar um registro de
auditoria à parte (documentado, mesmo que não seja uma ação do usuário
comum do sistema).

### 4. Avaliar risco ou dano relevante

Critério: o incidente permite a alguém não autorizado ler, alterar ou
apagar dado pessoal de titular real (não dado de demonstração)? Um erro
que só afetou dados fictícios (`[TESTE]`) ou que não expôs nada legível
(ex.: um 500 genérico sem vazar conteúdo) não configura risco relevante.

### 5. Definir e executar as comunicações necessárias

Se houver risco ou dano relevante (art. 48 da LGPD):

- **Comunicação à ANPD:** prazo de **3 dias úteis**, contados de quando o
  controlador identifica que o incidente está de fato vinculado a dado
  pessoal (não da mera suspeita) — Resolução CD/ANPD nº 15/2024, art. 6º.
  A comunicação pode ser complementada em até **20 dias úteis** (art. 6º,
  §3º) enquanto a investigação avança.
- **Comunicação aos titulares:** em linguagem simples, descrevendo o que
  aconteceu, quais dados foram afetados e o que o titular pode fazer
  (ex.: trocar a senha).
- **Canal:** e-mail (`privacidade@sgeacademicos.com.br`) e, se cabível,
  aviso dentro do próprio sistema.

### 6. Corrigir a causa, acompanhar efeitos e registrar as medidas

Corrigir a vulnerabilidade de origem, registrar tudo (o que houve, quando,
quem foi afetado, o que foi feito) e manter esse registro pelo prazo
mínimo de **5 anos** exigido pela Resolução ANPD, mesmo para incidentes
que não chegaram a ser comunicados por não terem risco relevante (art. 9º
da Resolução).

## Referência normativa

Prazos conferidos na Resolução CD/ANPD nº 15, de 24 de abril de 2024
(Regulamento de Comunicação de Incidente de Segurança), fonte oficial:

- Prazo de comunicação à ANPD: 3 dias úteis a partir do conhecimento de
  que o incidente afeta dado pessoal (art. 6º).
- Complementação da comunicação: até 20 dias úteis (art. 6º, §3º).
- Registro do incidente (comunicado ou não): mantido por, no mínimo, 5 anos
  a partir do registro (art. 9º) — número que também baliza o prazo de
  retenção adotado para `logs_auditoria` em `04-plano-de-retencao-e-descarte.md`.

Sources:
- [RESOLUÇÃO CD/ANPD Nº 15, DE 24 DE ABRIL DE 2024](https://www.lgpd.ms.gov.br/wp-content/uploads/2024/05/REGULAMENTO-DE-COMUNICACAO-DE-INCIDENTE-DE-SEGURANCA-ABRIL-2024-ANPD-.pdf)
- [ANPD aprova o Regulamento de Comunicação de Incidente de Segurança — gov.br/anpd](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca)
