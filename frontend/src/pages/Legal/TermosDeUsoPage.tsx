import { Link } from "react-router-dom";

// pagina publica, sem autenticacao — termos especificos do SGEA, nao um texto generico. Mesmo texto de
// docs/lgpd/termos-de-uso.md: ao mudar um, mude o outro. A versao vigente fica em VERSAO_TERMOS_ATUAL
// (backend/src/config/termos.ts)
export function TermosDeUsoPage() {
  return (
    <div className="login-screen">
      <div className="login-card legal-card">
        <h1>Termos de Uso</h1>
        <p className="legal-versao">Versão 4 — 09/11/2026.</p>

        <h2>1. O que é o SGEA</h2>
        <p>
          O Sistema de Gestão de Eventos Acadêmicos (SGEA) é uma plataforma para inscrição e check-in em eventos acadêmicos
          (palestras, minicursos, workshops), aplicação de questionário obrigatório, emissão de certificado de participação
          e envio de feedback. É um protótipo desenvolvido como Projeto de Final de Curso da UMC, com finalidade
          exclusivamente acadêmica, e não é um serviço comercial.
        </p>

        <h2>2. Quem pode usar</h2>
        <p>
          O cadastro de aluno é público e exige e-mail institucional terminando em <code>@alunos.umc.br</code>. A conta só
          é criada depois que você confirma esse e-mail: o sistema envia a ele um código de 6 dígitos, que vale por 15
          minutos. Se o código não for confirmado, nenhuma conta é criada e os dados informados são apagados.
        </p>
        <p>Contas de administrador e secretaria são criadas diretamente pela instituição, sem cadastro público.</p>
        <p>
          Contas de <strong>professor</strong> são criadas pela administração ou pela secretaria, só com o nome completo e o
          e-mail institucional (<code>@umc.br</code>). O professor recebe por e-mail um código de 6 dígitos, válido por 24
          horas, e ativa a conta na tela &ldquo;Primeiro acesso&rdquo;: informa o código, define a senha e aceita estes
          Termos. Antes disso a conta não entra no sistema.
        </p>

        <h2>3. Sua conta</h2>
        <ul>
          <li>Os dados informados no cadastro (nome, RGM e e-mail) precisam ser verdadeiros, e o e-mail precisa ser seu.</li>
          <li>
            O e-mail não pode ser alterado depois do cadastro: ele é a sua identificação de acesso, confirmada por código.
            Nome e RGM podem ser corrigidos pelo canal de privacidade. Se o seu e-mail institucional mudar, escreva para o
            canal de privacidade e a equipe analisa o caso.
          </li>
          <li>
            A senha precisa ter de 8 a 64 caracteres, com pelo menos uma letra maiúscula, um número e um caractere especial
            (por exemplo, ! @ # $ %).
          </li>
          <li>
            Você é responsável por manter sua senha em segredo e não compartilhá-la com ninguém. Se desconfiar que outra
            pessoa a conhece, troque-a pela opção "Esqueci a senha" na tela de login.
          </li>
          <li>
            A autenticação em dois fatores é opcional para todos os perfis; você pode ativar ou desativar na página "Minha
            conta".
          </li>
          <li>
            A secretaria pode <strong>inativar</strong> sua conta em caso de uso indevido, dado incorreto ou a seu pedido,
            sempre informando um motivo (visível só para a equipe). Enquanto a conta estiver inativa, você não consegue
            entrar no sistema, se inscrever, fazer check-in nem responder questionário; suas inscrições pendentes em eventos
            futuros são canceladas, e os certificados já emitidos continuam válidos. A secretaria pode reativar a conta
            depois.
          </li>
        </ul>

        <h2>4. Condutas proibidas</h2>
        <ul>
          <li>Tentar acessar dados, inscrições ou certificados de outra pessoa.</li>
          <li>Fornecer RGM, e-mail ou nome que não sejam seus.</li>
          <li>Tentar burlar a liberação do certificado sem atingir o aproveitamento exigido no questionário.</li>
        </ul>

        <h2>5. Questionário e certificado</h2>
        <p>
          O certificado de participação só é liberado depois que você realiza o check-in presencial no evento e atinge, no
          mínimo, 60% de acertos no questionário obrigatório daquele evento, em até 2 tentativas. Essa liberação é uma
          decisão automatizada do sistema: você pode pedir a revisão humana do resultado pelo canal de privacidade. O
          certificado é gerado em PDF, é destinado ao uso pessoal do titular e não pode ser alterado nem emitido em nome de
          terceiros.
        </p>

        <h2>6. Feedback</h2>
        <p>
          O envio de feedback sobre uma palestra é opcional e só fica disponível depois que você tem direito ao certificado
          daquela palestra (presença confirmada e aproveitamento mínimo no questionário). Ao enviá-lo, você autoriza o SGEA
          a exibi-lo para a equipe organizadora avaliar o evento; ele não é publicado para outros alunos.
        </p>
        <p>
          Depois de enviado, o feedback não pode ser editado, nem por você nem pela equipe. Você pode excluir o seu a
          qualquer momento e enviar outro. A equipe só pode excluir um feedback informando o motivo, e toda exclusão fica
          registrada na auditoria.
        </p>

        <h2>7. Eventos do professor e aprovação</h2>
        <ul>
          <li>
            O professor cria e organiza os próprios eventos e palestrantes. Tudo o que ele cadastra fica{" "}
            <strong>aguardando a aprovação da equipe</strong> e só aparece para os alunos depois de aprovado. Um evento
            aguardando aprovação já reserva a sala no horário.
          </li>
          <li>
            A equipe aprova ou recusa. A recusa traz um motivo, que o professor vê no sistema; ele corrige e reenvia, com uma
            resposta opcional. Cada passo fica registrado num histórico, com data e autor.
          </li>
          <li>
            O professor só vê e só altera os eventos que ele criou: inscrições, presença, certificados e notas, e avaliações.
            Dos alunos inscritos nesses eventos, ele vê o nome, o RGM, a presença, as notas do questionário e as avaliações, e
            deve usar esses dados só para organizar o evento e registrar a presença. Ele não exclui avaliações e não acessa a
            lista geral de alunos.
          </li>
          <li>
            Depois que um evento termina (horário + carga horária), ninguém mais o edita nem o exclui; a presença e a
            inscrição retroativa continuam possíveis pela equipe e pelo professor do evento.
          </li>
        </ul>

        <h2>8. Disponibilidade</h2>
        <p>
          Por ser um sistema acadêmico, o SGEA pode passar por manutenções ou instabilidades sem aviso prévio. Não há
          garantia de disponibilidade contínua.
        </p>

        <h2>9. Encerramento da conta</h2>
        <p>
          Você pode pedir a qualquer momento, pelo canal de privacidade ou à secretaria, a inativação e, em seguida, a
          exclusão definitiva da sua conta. A exclusão remove permanentemente o histórico de inscrições, feedbacks e
          tentativas de questionário vinculados a ela. Quem já tem certificado emitido tem a conta inativada em vez de
          excluída, para o certificado continuar válido.
        </p>

        <h2>10. Limitação de responsabilidade</h2>
        <p>
          Estes Termos não transferem a você a responsabilidade pela segurança do sistema, nem autorizam o SGEA a usar seus
          dados para outra finalidade além das descritas na Política de Privacidade. Direitos previstos em lei não são
          reduzidos por nenhuma cláusula destes Termos.
        </p>

        <h2>11. Legislação aplicável</h2>
        <p>
          Estes Termos são regidos pela legislação brasileira, em especial a Lei Geral de Proteção de Dados Pessoais (Lei
          nº 13.709/2018) e o Código de Defesa do Consumidor. Para saber como seus dados são tratados, veja a{" "}
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>.
        </p>

        <p className="legal-versao">
          Versão 4 — 09/11/2026. Quando este texto mudar, a nova versão é publicada nesta página com a data, e a versão
          que você aceitou fica registrada na sua conta.
        </p>

        <div className="login-links">
          <Link to="/cadastro">Voltar para o cadastro</Link>
        </div>
      </div>
    </div>
  );
}
