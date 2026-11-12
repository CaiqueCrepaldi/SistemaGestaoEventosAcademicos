import { VoltarDaPaginaLegal } from "../../components/legal/VoltarDaPaginaLegal";

// pagina publica, sem autenticacao — descreve o tratamento de dados feito pelo SGEA hoje. Mesmo texto de
// docs/lgpd/politica-de-privacidade.md. A versao vigente fica em VERSAO_TERMOS_ATUAL (backend/src/config/termos.ts).
// Gerado a partir do .md (mesmo texto); ao mudar um, mude o outro
export function PoliticaDePrivacidadePage() {
  return (
    <div className="login-screen">
      <div className="login-card legal-card">
        <h1>Política de Privacidade</h1>
        <p className="legal-versao">Versão 1 — 12/11/2026.</p>
        <h2>1. Quem trata os dados</h2>
        <p>
          O SGEA (Sistema de Gestão de Eventos Acadêmicos) é um protótipo acadêmico desenvolvido como Projeto de Final
          de Curso na Universidade de Mogi das Cruzes (UMC), pela equipe Caique Crepaldi e João Pedro Rachid de Abreu,
          sob orientação do Prof. Bruno Messias Aguiar (o orientador acompanha o projeto academicamente, mas não é
          controlador, encarregado nem responsável pelos dados tratados).
        </p>
        <ul>
          <li>
            <strong>Neste protótipo</strong>, os responsáveis pelo tratamento são os integrantes da equipe citados
            acima.
          </li>
          <li>
            <strong>Numa implantação real</strong>, a controladora seria a própria Universidade de Mogi das Cruzes, com
            um encarregado (DPO) nomeado pela UMC.
          </li>
          <li>
            <strong>Operadores</strong> (tratam dados por conta do controlador, sob instrução): Vercel (hospedagem),
            TiDB Cloud (banco de dados) e SendGrid/Twilio (envio de e-mail), detalhados na seção 4.
          </li>
          <li>
            <strong>Canal de privacidade:</strong> a página &ldquo;Meus dados&rdquo;, dentro do sistema, e o e-mail{" "}
            <code>privacidade@sgeacademicos.com.br</code> (seção 8).
          </li>
        </ul>
        <h2>2. Dados pessoais tratados</h2>
        <ul>
          <li>
            <strong>Aluno:</strong> nome completo, RGM (matrícula) e e-mail institucional, informados no cadastro. Para
            confirmar que o e-mail é seu, o sistema envia a ele um código de 6 dígitos; até a confirmação, nome, e-mail,
            RGM e a senha (só como hash) ficam guardados provisoriamente por até 15 minutos. Sem a confirmação, esses
            dados são apagados e nenhuma conta é criada.
          </li>
          <li>
            <strong>Professor e secretaria:</strong> nome completo e e-mail institucional (<code>@umc.br</code>),
            informados ao criar a conta na tela Equipe: a conta de professor é criada pela secretaria ou pela
            administração; a de secretaria, só pela administração. Nada além disso. A pessoa recebe por e-mail um link
            de convite, válido por 24 horas e de uso único; a chave do link fica guardada só como hash. Ao usar o
            convite, ela define a senha e aceita os Termos de Uso.
          </li>
          <li>
            <strong>Palestrante:</strong> nome e e-mail, informados pela equipe ou pelo professor. O nome aparece na
            programação para quem está conectado, depois que o palestrante é aprovado pela equipe; o e-mail é visto só
            pela equipe e pelo professor que o cadastrou. O palestrante não recebe e-mail do sistema. O canal de
            privacidade vale também para palestrantes.
          </li>
          <li>
            <strong>Autenticação:</strong> senha (nunca guardada em texto legível; ver seção 6) e, para quem decidir
            ativar a autenticação em dois fatores (opcional), uma chave secreta guardada cifrada e códigos de
            recuperação guardados só em forma irreversível.
          </li>
          <li>
            <strong>Inscrições e check-in:</strong> inscrições em eventos, o pedido de check-in feito pelo aluno (com a
            hora do pedido) e a decisão (aprovado ou recusado, com quem decidiu e quando). Quem não pede o check-in até
            o fim do prazo fica como ausente. Para recusar uma inscrição no mesmo horário de outra, o sistema consulta
            as inscrições do próprio aluno e informa o título e o horário do outro evento só a ele (ou a quem da equipe
            está fazendo a inscrição).
          </li>
          <li>
            <strong>Questionário e certificado:</strong> respostas ao questionário de cada evento e o resultado (acertos
            e percentual). Ao emitir um certificado, o sistema guarda uma cópia do que vai impresso nele (nome, RGM,
            evento, tema, palestrante, data e carga horária) e um código de validação.
          </li>
          <li>
            <strong>Avaliações das palestras:</strong> nota e comentário, enviados de forma opcional por quem teve a
            presença confirmada no evento (check-in aprovado), mesmo antes de responder o questionário. Se a presença
            for desfeita (o que só é possível enquanto o aluno não respondeu o questionário), a avaliação é apagada
            junto.
          </li>
          <li>
            <strong>Aprovação e histórico:</strong> o que o professor cadastra passa pela aprovação da equipe. O
            histórico guarda cada envio, aprovação, recusa e proposta de alteração, com a data, o nome de quem agiu, o
            motivo da recusa e a resposta do professor.
          </li>
          <li>
            <strong>Situação da conta:</strong> se a equipe inativar uma conta (de aluno, de professor ou de
            secretaria), fica registrado o motivo, visível só para a equipe.
          </li>
          <li>
            <strong>Registros de acesso e auditoria:</strong> login (sucesso e falha), acesso negado, cadastro, check-in
            e alterações em registros críticos, para segurança e auditoria. Esses registros nunca guardam senha, código,
            e-mail, RGM nem textos livres como motivos e comentários.
          </li>
          <li>
            <strong>Endereço IP:</strong> usado só para bloquear por alguns minutos o excesso de tentativas no login, na
            recuperação de senha, no envio do código do cadastro, no link de convite da conta da equipe e na consulta
            pública de certificados.
          </li>
        </ul>
        <p>
          <strong>O que o professor vê dos alunos:</strong> só nos eventos que ele criou, o nome, o RGM, a situação do
          check-in, as notas do questionário e as avaliações enviadas pelos alunos inscritos. Ele usa esses dados só
          para organizar o evento; não vê alunos de outros eventos nem a lista geral de alunos. No calendário, os
          eventos dos outros professores e da equipe aparecem para ele só como &ldquo;Sala ocupada&rdquo;, sem título,
          palestrante nem inscritos.
        </p>
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
              <td>Nome e e-mail do professor e da secretaria, convite (hash da chave)</td>
              <td>
                Criar a conta da equipe: o professor cria e organiza os próprios eventos; a secretaria administra o
                sistema junto com a administração
              </td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td>
                Dados dos alunos vistos pelo professor (nome, RGM, check-in, notas e avaliações, só dos eventos dele)
              </td>
              <td>Organizar o evento, decidir o check-in e acompanhar o resultado</td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Histórico da aprovação e propostas de alteração</td>
              <td>Registrar as decisões da equipe sobre o que o professor cadastra</td>
              <td>Legítimo interesse da instituição na organização dos eventos (art. 7º, IX)</td>
            </tr>
            <tr>
              <td>Inscrição e check-in (pedido, decisão, quem decidiu e quando)</td>
              <td>Controlar as vagas, registrar a presença e liberar o questionário e o certificado</td>
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
              <td>Avisos por e-mail (inscrição, cancelamento e mudança no evento)</td>
              <td>Manter o aluno informado sobre os eventos em que está inscrito</td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td>Avaliação da palestra</td>
              <td>Avaliação do evento pela organização (envio opcional)</td>
              <td>Consentimento (art. 7º, I)</td>
            </tr>
            <tr>
              <td>Motivo da inativação da conta</td>
              <td>Registrar por que a conta foi inativada</td>
              <td>Legítimo interesse da instituição na gestão dos eventos (art. 7º, IX)</td>
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
            <strong>SendGrid</strong> (Twilio, envio de e-mail): envia somente estes e-mails:
            <ul>
              <li>o código de confirmação do cadastro do aluno;</li>
              <li>o convite da conta de professor ou de secretaria (link para criar a senha);</li>
              <li>o código de recuperação de senha;</li>
              <li>
                o aviso de senha alterada pela página &ldquo;Minha conta&rdquo; (só a data e a hora da troca, nunca a
                senha);
              </li>
              <li>a confirmação de inscrição (com a sala, no formato da UMC, e o tipo);</li>
              <li>o aviso de inscrição cancelada pela equipe;</li>
              <li>
                o aviso de mudança de sala, horário, carga horária ou palestrante num evento em que o aluno está
                inscrito.
              </li>
            </ul>
            <p>
              Recebe o e-mail do destinatário e o conteúdo da mensagem (nos avisos, também o nome da pessoa e os dados
              do evento), só o necessário para entregar aquela mensagem.
            </p>
          </li>
          <li>
            <strong>Vercel</strong> (hospedagem): processa toda requisição feita ao SGEA, o que inclui o endereço IP de
            origem e os dados enviados em cada tela.
          </li>
        </ul>
        <p>
          Nenhum dado é vendido, usado para publicidade ou compartilhado para outra finalidade. A autenticação em dois
          fatores usa um aplicativo autenticador no seu celular, que gera os códigos no próprio aparelho: nenhum dado
          seu é enviado a terceiros por causa do 2FA.
        </p>
        <h2>5. Transferência internacional e armazenamento no navegador</h2>
        <p>
          TiDB Cloud, SendGrid e Vercel têm infraestrutura nos Estados Unidos: usar o SGEA implica que seus dados podem
          ser processados fora do Brasil. Como protótipo acadêmico, essa transferência segue os termos padrão desses
          provedores; numa implantação real, a instituição precisaria formalizar as salvaguardas cabíveis (como
          cláusulas contratuais padrão).
        </p>
        <p>
          O sistema não usa cookies. O navegador guarda só a sua sessão (o token de acesso e os dados da conta mostrados
          na tela, como nome e perfil), apagada ao sair ou quando a sessão expira.
        </p>
        <h2>6. Segurança</h2>
        <ul>
          <li>
            Senhas são protegidas com hash forte e salt aleatório por senha (bcrypt) e nunca ficam gravadas em texto
            legível. Toda senha nova precisa ter de 8 a 64 caracteres, com pelo menos uma letra maiúscula, um número e
            um caractere especial.
          </li>
          <li>
            Os códigos de confirmação do cadastro e de recuperação de senha ficam guardados só como hash, valem por 15
            minutos e deixam de valer depois de 5 tentativas erradas. A chave do convite da conta da equipe (professor
            ou secretaria) também fica só como hash, vale por 24 horas e só pode ser usada uma vez; um convite novo
            invalida o anterior. O envio de códigos é limitado por e-mail e por IP.
          </li>
          <li>O e-mail de acesso não pode ser alterado: ele identifica a sua conta.</li>
          <li>
            Nome, e-mail e RGM são dados pessoais comuns, guardados sem criptografia e protegidos por controle de acesso
            por perfil (cada perfil só vê o que precisa), conexão segura (HTTPS) e banco com acesso restrito. A chave do
            2FA fica cifrada.
          </li>
          <li>Toda regra de acesso é verificada no servidor, nunca só escondendo botões na tela.</li>
          <li>
            Autenticação em dois fatores por aplicativo autenticador, opcional para todos (página &ldquo;Minha
            conta&rdquo;).
          </li>
          <li>
            Você pode trocar a sua senha a qualquer momento na página &ldquo;Minha conta&rdquo;, informando a senha
            atual (e, com o 2FA ativo, o código do aplicativo ou um código de recuperação). Erros repetidos bloqueiam a
            troca por 15 minutos. Ao trocar, as outras sessões abertas da conta são encerradas, um código de recuperação
            de senha pedido antes deixa de valer e você recebe um aviso por e-mail, sem a senha.
          </li>
          <li>
            Tentativas de login em excesso bloqueiam o acesso por alguns minutos. Trocar a senha, inativar a conta ou
            mexer no 2FA encerra as sessões já abertas.
          </li>
          <li>
            Login, falhas de acesso, acessos negados e alterações críticas ficam registrados numa trilha de auditoria
            que não pode ser editada nem apagada pelo sistema e que só a administração consulta.
          </li>
          <li>
            Os e-mails do sistema seguem um modelo único, sem imagens nem conteúdo de fora, com a versão em texto puro
            junto, e nunca levam senha.
          </li>
        </ul>
        <h2>7. Por quanto tempo guardamos os dados</h2>
        <ul>
          <li>
            <strong>Cadastro aguardando confirmação:</strong> apagado ao concluir o cadastro (os dados passam para a
            conta) ou depois de expirar. Sem confirmação, o código deixa de valer em 15 minutos, e os dados são apagados
            na próxima vez que alguém entrar no sistema ou fizer um cadastro.
          </li>
          <li>
            <strong>Convite da conta da equipe:</strong> apagado quando é usado ou quando a conta que ainda esperava o
            convite é excluída; um convite novo substitui o anterior.
          </li>
          <li>
            <strong>Conta de professor ou de secretaria:</strong> permanece enquanto a pessoa faz parte da equipe. Na
            tela Equipe, a administração gerencia professores e secretarias, e a secretaria só professores; ninguém
            altera a própria conta por essa tela, e o sistema sempre mantém pelo menos um administrador ativo. Inativar
            encerra as sessões abertas (os eventos em aberto do professor passam antes para outro professor ou para a
            equipe). Só é possível excluir conta inativa ou que ainda não usou o convite (por exemplo, criada com o
            e-mail errado). Quem tem histórico no sistema (eventos ou palestrantes criados, decisões de aprovação,
            propostas, check-ins decididos ou pedidos de titular atendidos) não é excluído: a conta fica preservada como
            inativa. Os registros de auditoria ficam em qualquer caso.
          </li>
          <li>
            <strong>Conta do aluno:</strong> permanece enquanto você usa o sistema. A secretaria pode inativar a conta
            (o histórico de inscrições e certificados é preservado) e só pode excluí-la definitivamente depois de
            inativada. A exclusão apaga a conta e o histórico vinculado (inscrições, avaliações e tentativas de
            questionário) de forma permanente.
          </li>
          <li>
            <strong>Quem já tem certificado emitido</strong> não tem a conta excluída: o certificado é a prova da
            participação e precisa continuar válido (numa conferência de horas complementares, por exemplo). Nesse caso
            a conta fica inativada, sem acesso ao sistema, e o registro do certificado é mantido.
          </li>
          <li>
            <strong>Avaliação:</strong> você pode excluir a sua a qualquer momento e enviar outra. Se a sua presença no
            evento for desfeita, a avaliação é apagada junto.
          </li>
          <li>
            <strong>Registros de auditoria:</strong> guardados por até 5 anos e nunca editados ou apagados pelas telas
            do sistema.
          </li>
          <li>
            <strong>Cópias de segurança:</strong> o provedor do banco faz uma cópia por dia, que expira em 1 dia. Um
            dado excluído pode continuar numa cópia já feita por no máximo 24 horas.
          </li>
        </ul>
        <h2>8. Seus direitos</h2>
        <p>
          Na página <strong>&ldquo;Minha conta&rdquo;</strong>, qualquer pessoa conectada vê a versão destes termos que
          aceitou e quando, e abre os Termos de Uso e esta Política.
        </p>
        <p>
          Na página <strong>&ldquo;Meus dados&rdquo;</strong>, no menu do sistema depois que você entra com a sua conta
          de aluno, você vê tudo o que o SGEA guarda sobre você: dados cadastrais, aceite dos termos, situação do 2FA,
          inscrições e check-in (pedido e decisão), resultados dos questionários, certificados e avaliações.
        </p>
        <p>
          Os demais pedidos são feitos pelo e-mail <code>privacidade@sgeacademicos.com.br</code> e respondidos em até 15
          dias:
        </p>
        <ul>
          <li>Cópia dos seus dados para levar a outro serviço (portabilidade).</li>
          <li>
            Correção de dados: nome e RGM podem ser corrigidos pelo canal de privacidade. O e-mail não pode ser
            alterado, porque é a identificação de acesso. Se o seu e-mail institucional mudar, escreva para o canal de
            privacidade e a equipe analisa o caso.
          </li>
          <li>
            Exclusão da conta e dos dados (veja na seção 7 o caso de quem já tem certificado, que tem a conta
            inativada).
          </li>
          <li>
            Revisão humana do resultado do questionário, que é calculado automaticamente e libera o certificado (art. 20
            da LGPD). A revisão confere se a correção foi feita certo; não é uma nova tentativa: quem não atinge o
            mínimo nas 2 tentativas permitidas não recebe o certificado daquele evento.
          </li>
          <li>
            Oposição ao tratamento, informação sobre com quem seus dados são compartilhados e qualquer outro pedido
            sobre seus dados.
          </li>
        </ul>
        <p>Professores, secretarias e palestrantes fazem os pedidos pelo mesmo e-mail.</p>
        <h2>9. Incidentes de segurança</h2>
        <p>
          Em caso de incidente que exponha dados pessoais com risco ou dano relevante, a equipe responsável avalia o
          risco e comunica os titulares afetados e, quando exigido, a Autoridade Nacional de Proteção de Dados (ANPD),
          no prazo regulatório aplicável.
        </p>
        <p className="legal-versao">
          Versão 1 — 12/11/2026. Quando este texto mudar, a nova versão é publicada nesta página com a data, e a versão
          que você aceitou fica registrada na sua conta.
        </p>

        <div className="login-links">
          <VoltarDaPaginaLegal />
        </div>
      </div>
    </div>
  );
}
