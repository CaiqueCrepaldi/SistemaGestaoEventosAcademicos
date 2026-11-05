import { Link, useSearchParams } from "react-router-dom";
import { ValidacaoCertificado } from "../../components/certificados/ValidacaoCertificado";

// pagina PUBLICA (fora do ProtectedRoute) que o link impresso no PDF abre, ja com ?codigo=...: quem
// recebe o certificado (ex.: a coordenacao conferindo horas complementares) valida sem ter conta.
// Nao tem mais link na tela de login: dentro do sistema, a validacao fica na tela Certificados
export function ValidarCertificadoPage() {
  const [parametros] = useSearchParams();

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <p>Validar certificado</p>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--gray-500)", margin: "4px 0 0" }}>
            Sistema de Gestão de Eventos Acadêmicos — UMC
          </p>
        </div>

        <ValidacaoCertificado codigoInicial={parametros.get("codigo")} botaoLargo autoFocus />

        <div className="login-links">
          <Link to="/login">Ir para o login</Link>
        </div>
      </div>
    </div>
  );
}
