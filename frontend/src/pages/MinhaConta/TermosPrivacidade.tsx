import { Link } from "react-router-dom";
import type { UsuarioPerfil } from "../../services/authService";

// "Termos e privacidade" da Minha conta (qualquer perfil): a versao aceita e quando, os links pros Termos de Uso e a
// Politica de Privacidade dentro do sistema e, pro aluno, o atalho pra "Meus dados". Os dados vem de GET /usuarios/me,
// que so devolve a propria conta
export function TermosPrivacidade({ perfil }: { perfil: UsuarioPerfil }) {
  const aceiteEm = perfil.consentimentoLgpdEm ? new Date(perfil.consentimentoLgpdEm) : null;
  return (
    <div className="card mfa-conta termos-conta">
      <h2 className="mfa-titulo">Termos e privacidade</h2>
      <p className="form-hint mfa-texto">
        {aceiteEm && perfil.versaoTermosAceitos
          ? `Você aceitou a versão ${perfil.versaoTermosAceitos} dos Termos de Uso e da Política de Privacidade em ${aceiteEm.toLocaleDateString("pt-BR")} às ${aceiteEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
          : "Não há registro do aceite dos Termos de Uso e da Política de Privacidade nesta conta."}
      </p>
      <ul className="termos-conta-links">
        <li>
          <Link to="/termos-de-uso">Termos de Uso</Link>
        </li>
        <li>
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
        </li>
        {perfil.perfil === "ALUNO" && (
          <li>
            <Link to="/meus-dados">Meus dados</Link> (tudo o que o sistema guarda sobre você)
          </li>
        )}
      </ul>
      <p className="form-hint mfa-texto">
        Dúvidas ou pedidos sobre os seus dados: <a href="mailto:privacidade@sgeacademicos.com.br">privacidade@sgeacademicos.com.br</a>
      </p>
    </div>
  );
}
