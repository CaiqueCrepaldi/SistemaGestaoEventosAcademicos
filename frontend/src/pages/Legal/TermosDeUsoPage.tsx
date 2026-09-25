import { Link } from "react-router-dom";

// pagina publica, sem autenticacao — termos especificos do SGEA, nao um texto generico
export function TermosDeUsoPage() {
  return (
    <div className="login-screen">
      <div className="login-card legal-card">
        <h1>Termos de Uso</h1>
        <p className="legal-versao">Versão 1 — atualizada em 25/09/2026.</p>

        <h2>1. O que é o SGEA</h2>
        <p>
          O Sistema de Gestão de Eventos Acadêmicos (SGEA) é uma plataforma para inscrição e
          check-in em eventos acadêmicos (palestras, minicursos, workshops), aplicação de
          questionário obrigatório, emissão de certificado de participação e envio de feedback.
          É um protótipo desenvolvido como Projeto de Final de Curso da UMC, com finalidade
          exclusivamente acadêmica — não é um serviço comercial.
        </p>

        <h2>2. Quem pode usar</h2>
        <p>
          O cadastro de aluno é público e exige e-mail institucional terminando em
          <code> @alunos.umc.br</code>. Contas de administrador e secretaria são criadas
          diretamente pela instituição, sem cadastro público.
        </p>

        <h2>3. Sua conta</h2>
        <ul>
          <li>Você é responsável por manter sua senha em sigilo e não compartilhá-la com terceiros.</li>
          <li>Os dados informados no cadastro (nome, RGM, e-mail) precisam ser verdadeiros.</li>
          <li>
            A secretaria pode inativar uma conta em caso de uso indevido, dado incorreto ou a
            pedido do próprio titular; a conta inativada pode depois ser excluída definitivamente.
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
          O certificado de participação só é liberado depois que o aluno realiza o check-in
          presencial no evento e atinge, no mínimo, 60% de acertos no questionário obrigatório
          daquele evento. O certificado é gerado automaticamente em PDF e destinado ao uso pessoal
          do titular, não podendo ser alterado ou emitido em nome de terceiros.
        </p>

        <h2>6. Feedback</h2>
        <p>
          O envio de feedback sobre uma palestra é opcional e só está disponível para quem
          efetivamente compareceu ao evento (com presença confirmada no check-in).
        </p>

        <h2>7. Disponibilidade</h2>
        <p>
          Por ser um sistema acadêmico, o SGEA pode passar por manutenções ou instabilidades sem
          aviso prévio. Não há garantia de disponibilidade contínua.
        </p>

        <h2>8. Encerramento da conta</h2>
        <p>
          Você pode solicitar a qualquer momento à secretaria a inativação e, em seguida, a
          exclusão definitiva da sua conta. A exclusão remove permanentemente o histórico de
          inscrições, feedbacks e tentativas de questionário vinculados a ela.
        </p>

        <h2>9. Legislação aplicável</h2>
        <p>
          Estes Termos são regidos pela legislação brasileira, em especial a Lei Geral de Proteção
          de Dados Pessoais (Lei nº 13.709/2018). Para saber como seus dados são tratados, veja a{" "}
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>.
        </p>

        <div className="login-links">
          <Link to="/cadastro">Voltar para o cadastro</Link>
        </div>
      </div>
    </div>
  );
}
