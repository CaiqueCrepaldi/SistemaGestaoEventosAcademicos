import { useEffect, useRef, useState, type FormEvent } from "react";
import { Campo } from "../ui/Campo";
import { useErrosFormulario } from "../../hooks/useErrosFormulario";
import { certificadoService, type CertificadoValidado } from "../../services";

function data(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface ValidacaoCertificadoProps {
  // codigo vindo do link impresso no PDF (?codigo=): consulta sozinho ao abrir
  codigoInicial?: string | null;
  // na pagina publica o formulario ocupa o cartao todo; dentro do sistema fica num cartao da tela Certificados
  botaoLargo?: boolean;
  autoFocus?: boolean;
}

// confere se um certificado e autentico pelo codigo impresso no PDF (GET /api/certificados/validar/{codigo}).
// Mostra so nome, evento, data, carga horaria e emissao — sem RGM nem e-mail. Usado na tela Certificados
// e na pagina publica que o link do PDF abre
export function ValidacaoCertificado({ codigoInicial, botaoLargo = false, autoFocus = false }: ValidacaoCertificadoProps) {
  const [codigo, setCodigo] = useState(codigoInicial ?? "");
  const [resultado, setResultado] = useState<CertificadoValidado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  // ultimo codigo do link ja consultado: o StrictMode roda o efeito duas vezes em dev, e sem isto a
  // consulta automatica contaria em dobro no limite por IP
  const ultimoCodigoInicial = useRef<string | null>(null);
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

  // link com ?codigo= (o do PDF): consulta sozinho ao abrir e quando o codigo do link muda
  useEffect(() => {
    if (!codigoInicial || ultimoCodigoInicial.current === codigoInicial) return;
    ultimoCodigoInicial.current = codigoInicial;
    setCodigo(codigoInicial);
    void consultar(codigoInicial);
  }, [codigoInicial]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void consultar(codigo);
  }

  return (
    <>
      <form onSubmit={handleSubmit} onChange={limparAoEditar} className="form" ref={formRef} noValidate>
        <Campo nome="codigo" rotulo="Código de validação" obrigatorio erro={erros.codigo} dica="Ex.: ABCD-EFGH-JKMN (com ou sem hífens)">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            style={{ textTransform: "uppercase", letterSpacing: 1 }}
            autoFocus={autoFocus}
          />
        </Campo>

        {erro && (
          <p className="form-error" role="alert">
            {erro}
          </p>
        )}

        <div>
          <button className={"btn btn-primary" + (botaoLargo ? " btn-block" : "")} type="submit" disabled={carregando}>
            {carregando ? "Consultando…" : "Validar"}
          </button>
        </div>
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
    </>
  );
}
