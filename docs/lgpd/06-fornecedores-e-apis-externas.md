# Fornecedores e APIs externas — SGEA

**Data:** 09/11/2026 · **Versão:** 1 (acompanha a versão 1 dos Termos de Uso e da
Política de Privacidade)

Todo serviço de terceiro que recebe dado pessoal ou IP do usuário (código
completo revisado — backend, frontend e deploy). Os três são os
**operadores** citados na Política de Privacidade.

## TiDB Cloud (PingCAP)

- **Finalidade:** banco de dados relacional (MySQL-compatível) que
  armazena todos os dados do sistema.
- **Dados enviados:** todos os dados pessoais tratados pelo SGEA. Nome,
  e-mail e RGM ficam em texto puro (dados pessoais comuns;
  ver `07-medidas-tecnicas-de-seguranca.md`), como o restante (evento,
  sala, inscrição, log), atrás de autenticação e TLS na conexão. Continuam
  protegidos pela própria aplicação antes de chegar ao banco: senhas (hash
  bcrypt), códigos de recuperação e de confirmação do cadastro (hash), a
  chave do convite do professor (hash SHA-256) e o segredo do 2FA (cifrado). O cadastro que ainda espera a confirmação do
  e-mail fica na tabela `cadastros_pendentes` por até 15 minutos.
- **País:** Estados Unidos (região `us-east-1`, AWS), confirmado no host
  de conexão (`gateway01.us-east-1.prod.aws.tidbcloud.com`).
- **Salvaguardas:** conexão cifrada (TLS) entre o backend e o banco;
  credencial fora do código-fonte (`.env`, nunca versionado). Como
  protótipo acadêmico, não há Cláusula-Padrão Contratual (SCC) nem DPA
  formalizado com a PingCAP — numa implantação real, isso precisaria ser
  verificado/contratado pela instituição controladora.
- **Retenção/backup:** ver `04-plano-de-retencao-e-descarte.md`.

## SendGrid (Twilio)

- **Finalidade:** envio de e-mails transacionais, e só estes
  (`backend/src/modules/email/email.service.ts`):
  1. código de confirmação do e-mail no cadastro do aluno;
  2. convite do professor (link para criar a senha e aceitar os Termos);
  3. código de recuperação de senha;
  4. aviso de senha alterada pela Minha Conta (só a data e a hora da troca e
     a orientação de usar "Esqueci minha senha" e avisar
     privacidade@sgeacademicos.com.br se não foi a pessoa);
  5. confirmação de inscrição;
  6. aviso de inscrição cancelada pela equipe;
  7. aviso de mudança de sala, horário, carga horária ou palestrante num
     evento em que o aluno está inscrito.
- **Dados enviados:** e-mail do destinatário e o conteúdo da mensagem (nos
  avisos, também o nome da pessoa e os dados do evento; nos e-mails de
  código, o próprio código; no convite, o link com a chave). Nunca a senha.
  O palestrante não recebe e-mail. As contas fictícias da carga de
  demonstração (`usuarios.ficticio`) nunca recebem e-mail: o envio é
  suprimido antes de chamar o SendGrid. O
  e-mail do código do cadastro avisa: "Se você não pediu este cadastro,
  ignore este e-mail: nenhuma conta será criada."
- **Se o envio falhar:** no cadastro, em produção, a API responde `503` e
  mantém o cadastro pendente para o aluno usar "Reenviar código"; a falha
  fica na auditoria (`EMAIL_FALHA`), sem o endereço. No aviso de senha
  alterada, a troca continua valendo e a falha também vai para a auditoria.
- **País:** Estados Unidos (Twilio Inc.).
- **Salvaguardas:** chamada via API autenticada por chave
  (`SENDGRID_API_KEY`, fora do código); o e-mail só é disparado pelo
  backend, nunca pelo navegador do titular diretamente.
- **Sem configuração:** sem `SENDGRID_API_KEY` e `EMAIL_FROM` válidos, o
  envio fica "simulado": o log do servidor diz só o tipo do e-mail, sem
  destinatário nem conteúdo (em produção, isso aparece como erro na
  inicialização).

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
