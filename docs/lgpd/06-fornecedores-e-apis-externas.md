# Fornecedores e APIs externas — SGEA

**Data:** 29/09/2026 · **Versão:** 2 (TiDB Cloud: nome, e-mail e RGM
deixaram de ser criptografados pela aplicação)

Todo serviço de terceiro identificado no diagnóstico da Fase 0 (código
completo revisado — backend, frontend, deploy). Os três são também os
**operadores** definidos na decisão 3 da Fase 0.

## TiDB Cloud (PingCAP)

- **Finalidade:** banco de dados relacional (MySQL-compatível) que
  armazena todos os dados do sistema.
- **Dados enviados:** todos os dados pessoais tratados pelo SGEA. Nome,
  e-mail e RGM ficam em texto puro desde 29/09/2026 (dados pessoais comuns;
  ver `07-medidas-tecnicas-de-seguranca.md`), como o restante (evento,
  sala, inscrição, log), atrás de autenticação e TLS na conexão. Continuam
  protegidos pela própria aplicação antes de chegar ao banco: senhas (hash
  bcrypt), códigos de recuperação (hash) e o segredo do 2FA (cifrado).
- **País:** Estados Unidos (região `us-east-1`, AWS), confirmado no host
  de conexão (`gateway01.us-east-1.prod.aws.tidbcloud.com`).
- **Salvaguardas:** conexão cifrada (TLS) entre o backend e o banco;
  credencial fora do código-fonte (`.env`, nunca versionado). Como
  protótipo acadêmico, não há Cláusula-Padrão Contratual (SCC) nem DPA
  formalizado com a PingCAP — numa implantação real, isso precisaria ser
  verificado/contratado pela instituição controladora.
- **Retenção/backup:** ver `04-plano-de-retencao-e-descarte.md`.

## SendGrid (Twilio)

- **Finalidade:** envio de e-mails transacionais — código de recuperação
  de senha, confirmação de inscrição.
- **Dados enviados:** e-mail e nome do destinatário, e o conteúdo da
  mensagem (que inclui o código de recuperação, quando aplicável). Nunca
  a senha nem outro dado sensível.
- **País:** Estados Unidos (Twilio Inc.).
- **Salvaguardas:** chamada via API autenticada por chave
  (`SENDGRID_API_KEY`, fora do código); o e-mail só é disparado pelo
  backend, nunca pelo navegador do titular diretamente.
- **Situação de configuração:** ver o alerta em `00-diagnostico.md`
  ("Não confirmado") — a Fase 2 corrige o comportamento de fallback pra
  nunca logar o conteúdo do e-mail no console, independentemente de o
  SendGrid estar ou não configurado.

## Vercel

- **Finalidade:** hospedagem e execução (função serverless) do backend, e
  hospedagem estática do frontend. Não guarda dado em banco — é quem
  processa e transporta a requisição.
- **Dados enviados:** todo o tráfego HTTP entre o navegador do titular e o
  sistema passa pela Vercel, incluindo endereço IP de origem, cabeçalhos e
  o corpo de cada requisição (que pode conter dado pessoal, ex.: o próprio
  cadastro).
- **País:** Estados Unidos (Vercel Inc.), com CDN global de borda — a
  requisição pode fisicamente tocar servidores fora do Brasil mesmo para
  um usuário no Brasil.
- **Salvaguardas:** HTTPS obrigatório; variáveis de ambiente
  (`ENCRYPTION_KEY`, `JWT_SECRET`, `DATABASE_URL`, etc.) configuradas
  como segredo na plataforma, não no código.
- **Observação da Fase 0:** este fornecedor **não estava mencionado** na
  Política de Privacidade v1 — corrigido na v2 (`politica-de-privacidade.md`).

## Nenhum outro serviço externo encontrado

Revisão completa do frontend (`frontend/index.html`, `frontend/package.json`,
`frontend/vite.config.ts`) não encontrou:
- CDN de fonte (ex.: Google Fonts);
- Script de analytics ou rastreamento;
- SDK de terceiro carregado no navegador além dos pacotes já citados
  (`react`, `react-dom`, `react-router-dom`, `jspdf` — nenhum deles faz
  chamada de rede a terceiro).

`jsPDF` (geração do certificado) roda inteiramente no navegador do próprio
titular, sem enviar nenhum dado a lugar nenhum — o PDF é montado e baixado
localmente.

Nenhum uso de inteligência artificial em nenhum ponto do sistema (ver
`09-avaliacoes-especificas.md`).
