import { Link } from "react-router-dom";

// pagina publica, sem autenticacao — descreve o tratamento de dados de verdade feito pelo SGEA (reflete
// o que o codigo faz hoje). Mesmo texto de docs/lgpd/politica-de-privacidade.md: ao mudar um, mude o
// outro. A versao vigente fica em VERSAO_TERMOS_ATUAL (backend/src/config/termos.ts)
export function PoliticaDePrivacidadePage() {
  return (
    <div className="login-screen">
      <div className="login-card legal-card">
        <h1>Política de Privacidade</h1>
        <p className="legal-versao">Versão 3 — 06/11/2026.</p>

        <h2>1. Quem trata os dados</h2>
        <p>
          O SGEA (Sistema de Gestão de Eventos Acadêmicos) é um protótipo acadêmico desenvolvido como Projeto de Final
          de Curso na Universidade de Mogi das Cruzes (UMC), pela equipe Caique Crepaldi e João Pedro Rachid de Abreu,
          sob orientação do Prof. Bruno Messias Aguiar (o orientador acompanha o projeto academicamente, mas não é
          controlador, encarregado nem responsável pelos dados tratados).
        </p>
        <ul>
          <li>
            <strong>Neste protótipo</strong>, os responsáveis pelo tratamento são os integrantes da equipe citados acima.
          </li>
          <li>
            <strong>Numa implantação real</strong>, a controladora seria a própria Universidade de Mogi das Cruzes, com um
            encarregado (DPO) nomeado pela UMC.
          </li>
          <li>
            <strong>Operadores</strong> (tratam dados por conta do controlador, sob instrução): Vercel (hospedagem), TiDB
            Cloud (banco de dados) e SendGrid/Twilio (envio de e-mail), detalhados na seção 4.
          </li>
          <li>
            <strong>Canal de privacidade:</strong> a página "Meus dados", dentro do sistema, e o e-mail{" "}
            <strong>privacidade@sgeacademicos.com.br</strong> (seção 8).
          </li>
        </ul>

        <h2>2. Dados pessoais tratados</h2>
        <ul>
          <li>
            <strong>Identificação e contato (aluno):</strong> nome completo, RGM (matrícula) e e-mail institucional,
            informados no cadastro.
          </li>
          <li>
            <strong>Confirmação do e-mail no cadastro:</strong> ao criar a conta, o sistema envia um código de 6 dígitos ao
            e-mail institucional para confirmar que o endereço é seu. Até a confirmação, nome, e-mail, RGM e a senha (só
            como hash) ficam guardados provisoriamente por até 15 minutos. Se o código não for confirmado, esses dados são
            apagados e nenhuma conta é criada.
          </li>
          <li>
            <strong>Autenticação:</strong> senha (nunca guardada em texto puro; ver seção 6).
          </li>
          <li>
            <strong>Dados acadêmicos:</strong> inscrições em eventos, confirmações de presença (check-in), respostas ao
            questionário de cada evento, resultado (aprovação ou reprovação) e feedback enviado sobre as palestras.
          </li>
          <li>
            <strong>Certificados emitidos:</strong> ao emitir um certificado, o sistema guarda uma cópia do que vai impresso
            nele (nome, RGM, evento, data e carga horária) e um código de validação.
          </li>
          <li>
            <strong>Registros de acesso:</strong> login (sucesso e falha), acesso negado, cadastro e alterações em registros
            críticos, para segurança e auditoria. Esses registros nunca guardam senha, código, e-mail ou RGM.
          </li>
          <li>
            <strong>Endereço IP:</strong> usado só para bloquear por alguns minutos o excesso de tentativas no login, na
            recuperação de senha, no envio do código do cadastro e na consulta pública de certificados.
          </li>
          <li>
            <strong>Autenticação em dois fatores:</strong> para quem decidir ativar (é opcional), uma chave secreta guardada
            cifrada e códigos de recuperação guardados apenas em forma irreversível.
          </li>
          <li>
            <strong>Situação da conta:</strong> se a secretaria inativar sua conta, fica registrado o motivo, visível só
            para a equipe.
          </li>
          <li>
            <strong>Identificação e contato (palestrante):</strong> nome e e-mail, informados pela secretaria ao cadastrar
            o evento. O nome aparece na agenda para quem está conectado; o e-mail é visto só pela equipe. O canal de
            privacidade vale também para palestrantes.
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
              <td>Criar e autenticar a conta</td>
              <td>Execução de contrato a pedido do titular (art. 7º, V da LGPD)</td>
            </tr>
            <tr>
              <td>Cadastro aguardando confirmação (nome, e-mail, RGM e hash da senha, por até 15 minutos)</td>
              <td>Garantir que a conta e os certificados pertencem ao dono do e-mail</td>
              <td>Procedimentos preliminares a pedido do titular (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Inscrição e presença</td>
              <td>Controlar as vagas e liberar o questionário e o certificado</td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Respostas do questionário</td>
              <td>Calcular o aproveitamento e liberar o certificado</td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Certificado emitido</td>
              <td>
                Comprovar a participação: com o código, a consulta pública mostra só nome, evento, data e carga horária
                (nunca o RGM)
              </td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Feedback da palestra</td>
              <td>Avaliação do evento pela organização (envio opcional)</td>
              <td>Consentimento (art. 7º, I)</td>
            </tr>
            <tr>
              <td>Registros de acesso e auditoria</td>
              <td>Detectar acesso indevido e investigar incidentes</td>
              <td>Legítimo interesse em segurança (art. 7º, IX) e exercício regular de direitos (art. 7º, VI)</td>
            </tr>
            <tr>
              <td>IP no limite de tentativas</td>
              <td>Proteger as contas contra adivinhação de senha e o envio de códigos em massa</td>
              <td>Legítimo interesse em segurança (art. 7º, IX)</td>
            </tr>
            <tr>
              <td>Chave e códigos do 2FA</td>
              <td>Proteger a sua conta, quando você decide ativar</td>
              <td>A seu pedido (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Aceite dos Termos e da Política</td>
              <td>Comprovar que você teve ciência das regras</td>
              <td>Formalização do contrato (não é consentimento)</td>
            </tr>
          </tbody>
        </table>

        <h2>4. Compartilhamento com terceiros</h2>
        <ul>
          <li>
            <strong>TiDB Cloud</strong> (banco de dados): armazena os dados descritos acima.
          </li>
          <li>
            <strong>SendGrid</strong> (Twilio, envio de e-mail): envia o código de confirmação do cadastro, o código de
            recuperação de senha e os avisos de confirmação e de cancelamento de inscrição. Recebe o e-mail do destinatário
            e o conteúdo da mensagem (nos avisos de inscrição, também o nome do aluno), só o necessário para entregar
            aquela mensagem.
          </li>
          <li>
            <strong>Vercel</strong> (hospedagem): processa toda requisição feita ao SGEA, o que inclui o endereço IP de
            origem e os dados enviados em cada tela.
          </li>
        </ul>
        <p>
          Nenhum dado é vendido, usado para publicidade ou compartilhado para outra finalidade. A autenticação em dois
          fatores usa um aplicativo autenticador no seu celular, que gera os códigos no próprio aparelho: nenhum dado seu é
          enviado a terceiros por causa do 2FA.
        </p>

        <h2>5. Transferência internacional e armazenamento no navegador</h2>
        <p>
          TiDB Cloud, SendGrid e Vercel têm infraestrutura nos Estados Unidos: usar o SGEA implica que seus dados podem ser
          processados fora do Brasil. Como protótipo acadêmico, essa transferência segue os termos padrão desses
          provedores; numa implantação real, a instituição precisaria formalizar as salvaguardas cabíveis (por exemplo,
          cláusulas contratuais padrão).
        </p>
        <p>
          O sistema não usa cookies. O navegador guarda só a sua sessão (o token de acesso e os dados da conta mostrados na
          tela, como nome e perfil), apagada ao sair ou quando a sessão expira.
        </p>

        <h2>6. Segurança</h2>
        <ul>
          <li>
            Senhas são protegidas com hash forte e salt aleatório por senha (bcrypt) e nunca ficam gravadas em texto
            legível. Toda senha nova precisa ter de 8 a 64 caracteres, com pelo menos uma letra maiúscula, um número e um
            caractere especial.
          </li>
          <li>
            O código de confirmação do cadastro também fica guardado só como hash, vale por 15 minutos e deixa de valer
            depois de 5 tentativas erradas. O envio de códigos é limitado por e-mail e por IP.
          </li>
          <li>
            O e-mail de acesso não pode ser alterado depois do cadastro: ele foi confirmado por código e identifica a sua
            conta.
          </li>
          <li>
            Nome, e-mail e RGM são dados pessoais comuns, guardados sem criptografia e protegidos por controle de acesso por
            perfil (cada perfil só vê o que precisa), conexão segura (HTTPS) e banco com acesso restrito. A chave do 2FA
            fica cifrada.
          </li>
          <li>Toda regra de acesso é verificada no servidor, nunca só escondendo botões na tela.</li>
          <li>Autenticação em dois fatores por aplicativo autenticador, opcional para todos (página "Minha conta").</li>
          <li>
            Tentativas de login em excesso bloqueiam o acesso por alguns minutos. Trocar a senha, inativar a conta ou mexer
            no 2FA encerra as sessões já abertas.
          </li>
          <li>
            Login, falhas de acesso, acessos negados e alterações críticas ficam registrados numa trilha de auditoria que
            não pode ser editada nem apagada pelo sistema.
          </li>
        </ul>

        <h2>7. Por quanto tempo guardamos os dados</h2>
        <ul>
          <li>
            <strong>Cadastro aguardando confirmação:</strong> apagado ao concluir o cadastro (os dados passam para a conta)
            ou depois de expirar. Sem confirmação, o código deixa de valer em 15 minutos, e os dados são apagados na
            próxima vez que alguém entrar no sistema ou fizer um cadastro.
          </li>
          <li>
            <strong>Conta:</strong> permanece enquanto você usa o sistema. A secretaria pode inativar a conta (o histórico
            de inscrições e certificados é preservado) e só pode excluí-la definitivamente depois de inativada. A exclusão
            apaga a conta e o histórico vinculado (inscrições, feedbacks e tentativas de questionário) de forma permanente.
          </li>
          <li>
            <strong>Quem já tem certificado emitido</strong> não tem a conta excluída: o certificado é a prova da
            participação e precisa continuar válido (por exemplo, numa conferência de horas complementares). Nesse caso a
            conta fica inativada, sem acesso ao sistema, e o registro do certificado é mantido.
          </li>
          <li>
            <strong>Feedback:</strong> você pode excluir o seu a qualquer momento e enviar outro.
          </li>
          <li>
            <strong>Registros de auditoria:</strong> guardados por até 5 anos e nunca editados ou apagados pelas telas do
            sistema.
          </li>
          <li>
            <strong>Cópias de segurança:</strong> o provedor do banco faz uma cópia por dia, que expira em 1 dia. Um dado
            excluído pode continuar numa cópia já feita por no máximo 24 horas.
          </li>
        </ul>

        <h2>8. Seus direitos</h2>
        <p>
          Na página <strong>"Meus dados"</strong>, no menu do sistema depois que você entra com a sua conta de aluno, você
          vê tudo o que o SGEA guarda sobre você: dados cadastrais, aceite dos termos, situação do 2FA, inscrições e
          presenças, resultados dos questionários, certificados e avaliações.
        </p>
        <p>
          Os demais pedidos são feitos pelo e-mail <strong>privacidade@sgeacademicos.com.br</strong> e respondidos em até
          15 dias:
        </p>
        <ul>
          <li>Cópia dos seus dados para levar a outro serviço (portabilidade).</li>
          <li>
            Correção de dados: nome e RGM podem ser corrigidos pelo canal de privacidade. O e-mail não pode ser alterado,
            porque é a identificação de acesso confirmada no cadastro. Se o seu e-mail institucional mudar, escreva para o
            canal de privacidade e a equipe analisa o caso.
          </li>
          <li>
            Exclusão da conta e dos dados (veja na seção 7 o caso de quem já tem certificado, que tem a conta inativada).
          </li>
          <li>
            Revisão humana do resultado do questionário, que é calculado automaticamente e libera o certificado (art. 20 da
            LGPD). A revisão confere se a correção foi feita certo; não é uma nova tentativa: quem não atinge o mínimo nas
            2 tentativas permitidas não recebe o certificado daquele evento.
          </li>
          <li>
            Oposição ao tratamento, informação sobre com quem seus dados são compartilhados e qualquer outro pedido sobre
            seus dados.
          </li>
        </ul>

        <h2>9. Incidentes de segurança</h2>
        <p>
          Em caso de incidente que exponha dados pessoais com risco ou dano relevante, a equipe responsável avalia o risco e
          comunica os titulares afetados e, quando exigido, a Autoridade Nacional de Proteção de Dados (ANPD), no prazo
          regulatório aplicável.
        </p>

        <p className="legal-versao">
          Versão 3 — 06/11/2026. Quando este texto mudar, a nova versão é publicada nesta página com a data, e a versão
          que você aceitou fica registrada na sua conta.
        </p>

        <div className="login-links">
          <Link to="/cadastro">Voltar para o cadastro</Link>
        </div>
      </div>
    </div>
  );
}
