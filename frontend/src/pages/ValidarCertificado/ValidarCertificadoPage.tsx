import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Campo } from "../../components/ui/Campo";
import { useErrosFormulario } from "../../hooks/useErrosFormulario";
import { certificadoService, type CertificadoValidado } from "../../services";

function data(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

// pagina PUBLICA (fora do ProtectedRoute): qualquer pessoa confere se um certificado e autentico pelo
// codigo impresso no PDF. Mostra so nome, evento, data, carga horaria e emissao — sem RGM nem e-mail.
// O link impresso no PDF ja traz ?codigo=..., e a consulta sai sozinha ao abrir
export function ValidarCertificadoPage() {
  const [parametros] = useSearchParams();
  const codigoDaUrl = parametros.get("codigo");
  const [codigo, setCodigo] = useState(codigoDaUrl ?? "");
  const [resultado, setResultado] = useState<CertificadoValidado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  // ultimo codigo da URL ja consultado: o StrictMode roda o efeito duas vezes em dev, e sem isto a
  // consulta automatica contaria em dobro no limite por IP
  const ultimoCodigoDaUrl = useRef<string | null>(null);
  const { erros, formRef, mostrar, limparAoEditar } = useErrosFormulario();

  async function consultar(valor: string) {
    setErro(null);
    setResultado(null);
    if (!valor.trim()) {
      mostrar({ codigo: "Informe o código de validação impresso no certificado." });
      return;
    }
    setCarregando(true);
    try {
      setResultado(await certificadoService.validar(valor));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível validar o certificado.");
    } finally {
      setCarregando(false);
    }
  }

  // link com ?codigo= (o do PDF): consulta sozinho ao abrir e quando o codigo da URL muda
  useEffect(() => {
    if (!codigoDaUrl || ultimoCodigoDaUrl.current === codigoDaUrl) return;
    ultimoCodigoDaUrl.current = codigoDaUrl;
    setCodigo(codigoDaUrl);
    void consultar(codigoDaUrl);
  }, [codigoDaUrl]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void consultar(codigo);
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <p>Validar certificado</p>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--gray-500)", margin: "4px 0 0" }}>
            Sistema de Gestão de Eventos Acadêmicos — UMC
          </p>
        </div>

        <form onSubmit={handleSubmit} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
          <Campo nome="codigo" rotulo="Código de validação" obrigatorio erro={erros.codigo} dica="Ex.: ABCD-EFGH-JKMN (com ou sem hífens)">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{ textTransform: "uppercase", letterSpacing: 1 }}
              autoFocus
            />
          </Campo>

          {erro && (
            <p className="form-error" role="alert">
              {erro}
            </p>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={carregando}>
            {carregando ? "Consultando…" : "Validar"}
          </button>
        </form>

        {resultado && (
          <div className="validacao-resultado" role="status">
            <p className="validacao-resultado-titulo">Certificado válido</p>
            <dl>
              <dt>Participante</dt>
              <dd>{resultado.nomeParticipante}</dd>
              <dt>Evento</dt>
              <dd>{resultado.tituloEvento}</dd>
              <dt>Data do evento</dt>
              <dd>{data(resultado.dataEvento)}</dd>
              <dt>Carga horária</dt>
              <dd>{resultado.cargaHoraria}h</dd>
              <dt>Emitido em</dt>
              <dd>{data(resultado.emitidoEm)}</dd>
            </dl>
          </div>
        )}

        <div className="login-links">
          <Link to="/login">Voltar ao login</Link>
        </div>
      </div>
    </div>
  );
}
