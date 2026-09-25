import { Link } from "react-router-dom";

// pagina publica, sem autenticacao — descreve o tratamento de dados de verdade feito pelo
// SGEA (nao e um texto generico: reflete o que o codigo realmente faz hoje)
export function PoliticaDePrivacidadePage() {
  return (
    <div className="login-screen">
      <div className="login-card legal-card">
        <h1>Política de Privacidade</h1>
        <p className="legal-versao">Versão 1 — atualizada em 25/09/2026.</p>

        <h2>1. Quem trata os dados</h2>
        <p>
          O SGEA (Sistema de Gestão de Eventos Acadêmicos) é um protótipo acadêmico desenvolvido
          como Projeto de Final de Curso na Universidade de Mogi das Cruzes (UMC). Numa
          implantação real, o controlador dos dados seria a instituição ou o organizador do
          evento acadêmico responsável por operar o sistema. Dúvidas sobre privacidade podem ser
          enviadas à secretaria do evento.
        </p>

        <h2>2. Dados pessoais tratados</h2>
        <ul>
          <li>
            <strong>Identificação e contato:</strong> nome completo, RGM (matrícula) e e-mail
            institucional, informados no cadastro.
          </li>
          <li>
            <strong>Autenticação:</strong> senha (nunca guardada em texto puro — ver seção 6).
          </li>
          <li>
            <strong>Dados acadêmicos:</strong> inscrições em eventos, confirmações de presença
            (check-in), respostas ao questionário de cada evento e feedback enviado sobre as
            palestras.
          </li>
          <li>
            <strong>Registros de acesso:</strong> login (sucesso e falha) e alterações em
            registros críticos, para fins de segurança e auditoria.
          </li>
        </ul>
        <p>Não coletamos CPF, endereço, data de nascimento, foto ou dados de saúde.</p>

        <h2>3. Para que usamos cada dado</h2>
        <table className="legal-tabela">
          <thead>
            <tr>
              <th>Dado</th>
              <th>Finalidade</th>
              <th>Base legal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nome, RGM, e-mail, senha</td>
              <td>Criar e autenticar a conta do aluno</td>
              <td>Execução de contrato (cadastro solicitado pelo titular)</td>
            </tr>
            <tr>
              <td>Inscrição e presença</td>
              <td>Controlar vagas do evento e liberar questionário/certificado</td>
              <td>Execução de contrato</td>
            </tr>
            <tr>
              <td>Respostas do questionário</td>
              <td>Calcular aproveitamento e liberar a emissão do certificado</td>
              <td>Execução de contrato</td>
            </tr>
            <tr>
              <td>Feedback da palestra</td>
              <td>Avaliação do evento pela organização</td>
              <td>Consentimento (envio é opcional e feito pelo próprio aluno)</td>
            </tr>
            <tr>
              <td>Logs de login/auditoria</td>
              <td>Detectar acesso indevido e investigar incidentes</td>
              <td>Legítimo interesse em segurança da informação</td>
            </tr>
          </tbody>
        </table>

        <h2>4. Compartilhamento com terceiros</h2>
        <ul>
          <li>
            <strong>SendGrid</strong> (serviço de envio de e-mail): usado para mandar e-mails de
            confirmação de inscrição, recuperação de senha e certificado. Recebe o e-mail do
            destinatário, o nome do aluno e o conteúdo da mensagem — apenas o necessário para
            entregar aquele e-mail específico.
          </li>
          <li>
            <strong>TiDB Cloud</strong> (banco de dados hospedado): armazena os dados descritos
            acima, com nome/e-mail/RGM cifrados (ver seção 6).
          </li>
        </ul>
        <p>Nenhum dado é vendido, usado para publicidade ou compartilhado com outras finalidades.</p>

        <h2>5. Cookies e armazenamento local</h2>
        <p>
          O sistema não usa cookies de rastreamento ou publicidade. O único dado guardado no
          navegador é o token de sessão (para manter você conectado), removido ao sair da conta.
        </p>

        <h2>6. Segurança</h2>
        <ul>
          <li>Senhas são protegidas com hash forte e salt — nunca ficam gravadas em texto puro.</li>
          <li>Nome, e-mail e RGM ficam cifrados no banco de dados, não em texto legível.</li>
          <li>
            Toda regra de acesso é verificada no servidor, não apenas escondendo botões na tela.
          </li>
          <li>Login, falhas de acesso e alterações críticas ficam registrados numa trilha de auditoria.</li>
        </ul>

        <h2>7. Por quanto tempo guardamos os dados</h2>
        <p>
          A conta permanece ativa enquanto o aluno participa do sistema. Uma conta pode ser
          inativada pela secretaria (o histórico de inscrições/certificados é preservado nesse
          caso) e só é excluída definitivamente depois de inativada — a exclusão apaga a conta e
          todo o histórico vinculado (inscrições, feedbacks, tentativas de questionário) de forma
          permanente.
        </p>

        <h2>8. Seus direitos</h2>
        <p>Você pode solicitar à secretaria, a qualquer momento:</p>
        <ul>
          <li>Confirmação de quais dados seus estão armazenados e acesso a eles.</li>
          <li>Correção de dados incorretos ou desatualizados.</li>
          <li>Inativação da conta e, em seguida, exclusão definitiva dos dados.</li>
          <li>Informação sobre com quem seus dados são compartilhados.</li>
        </ul>

        <h2>9. Incidentes de segurança</h2>
        <p>
          Em caso de incidente que exponha dados pessoais, a equipe responsável avalia o risco e
          comunica os titulares afetados e, quando aplicável, a Autoridade Nacional de Proteção de
          Dados (ANPD).
        </p>

        <div className="login-links">
          <Link to="/cadastro">Voltar para o cadastro</Link>
        </div>
      </div>
    </div>
  );
}
