# Redesign visual — menu superior + marca amarelo/preto

Documentação da mudança de layout pedida: trocar o menu lateral por um menu
superior com ícone + nome (referência: sistema "Estoque Now") e migrar a
cor de marca do app de azul pra amarelo/preto.

## O que mudou, visualmente

- **Menu lateral → menu superior.** Antes o app tinha uma barra fixa à
  esquerda com a lista de telas. Agora são duas faixas no topo: uma preta
  com a marca "SGEA" e os dados do usuário logado, e logo abaixo uma
  branca com um item por tela, cada um com ícone em cima e nome embaixo —
  igual o padrão da referência.
- **Trilha de navegação (breadcrumb).** Uma linha fina abaixo do menu
  mostrando onde você está, tipo `Eventos / Detalhe`.
- **Cores.** Botão principal, item de menu ativo, campo em foco e links —
  tudo que antes era azul agora é amarelo (com preto por cima quando o
  texto precisa ficar legível). A tela de login ganhou fundo preto e uma
  faixa amarela no topo do card.
- **O que eu decidi NÃO mudar:** as cores de status (verde = presente,
  vermelho = ausente, laranja = pendente) continuam iguais — são cores que
  *significam* alguma coisa pro usuário, então trocar por amarelo ia
  confundir em vez de deixar mais bonito. Só toquei no que é "cor de
  marca" (botão, menu, foco, link).

## Arquivos que mudaram

### `frontend/src/styles/global.css`
Arquivo principal da mudança. Resumo do que foi feito:

1. **Paleta nova** — adicionei as variáveis `--yellow-500`, `--yellow-600`,
   `--yellow-50`, `--yellow-text`, `--black-900`, `--black-800` no topo do
   arquivo. `--yellow-text` é um dourado escurecido: amarelo puro em cima
   de fundo branco quase não dá pra ler, então uso ele pra texto/links, e
   o amarelo vibrante só como fundo de botão/destaque.
2. **Bloco do menu reescrito** — troquei as classes `.sidebar*` (menu
   lateral) por `.topbar` (faixa preta), `.main-nav`/`.nav-link` (faixa
   branca com os ícones) e `.breadcrumb-bar` (trilha de navegação).
3. **Toda referência a azul de marca virou amarelo** — botão primário,
   borda de campo em foco, item de lista selecionado, cor do link, cor do
   horário na Agenda, fundo do login.
4. Deixei um comentário no CSS explicando por que as cores de status
   (verde/vermelho/laranja) ficaram de fora dessa troca.

### `frontend/src/components/Layout.tsx`
Reescrito por completo. Antes montava `<aside className="sidebar">` com a
lista de links; agora monta duas faixas (`<header className="topbar">` e
`<nav className="main-nav">`) mais a trilha de navegação, calculada a
partir da URL atual (`useLocation`). Cada item do menu ganhou um ícone
(veja abaixo) além do nome que já existia — a lista de telas por perfil
(quem vê o quê) não mudou, só a forma de exibir.

### `frontend/src/components/ui/icons.tsx` (novo arquivo)
Um ícone por tela (calendário pra Eventos, microfone pra Palestrantes,
etc.), desenhados como SVG simples direto no código — não usei nenhuma
biblioteca de ícones nova, pra não pesar o projeto com mais uma
dependência só pra isso.

### `frontend/src/pages/Login/LoginPage.tsx`, `Cadastro/CadastroPage.tsx`, `EsqueciSenha/EsqueciSenhaPage.tsx`
Troquei o nome da classe CSS da marca "SGEA" de `sidebar-brand-mark` pra
`brand-mark` — o nome antigo não fazia mais sentido depois que o menu
lateral (sidebar) deixou de existir. É só o nome da classe mudando, a
tela continua igual.

## O que eu não toquei

Não mexi em nenhuma regra de negócio, rota, permissão por perfil ou
página de conteúdo — só na casca visual (menu, cores, ícones). As telas
continuam com a mesma estrutura de antes (tabela, formulário, cards),
só que agora dentro do novo cabeçalho.

## Testado

Rodei `npm run build` (sem erro de TypeScript) e testei visualmente login,
dashboard, detalhe de evento, tela de aluno e um formulário em modal — pra
confirmar que o contraste do amarelo em cima de fundo branco/preto ficou
legível em todos os casos.
