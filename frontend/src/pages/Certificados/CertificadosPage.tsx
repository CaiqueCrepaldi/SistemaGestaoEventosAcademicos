import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ValidacaoCertificado } from "../../components/certificados/ValidacaoCertificado";
import { Badge } from "../../components/ui/Badge";
import { PageHeader } from "../../components/ui/PageHeader";
import { Paginacao } from "../../components/ui/Paginacao";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { certificadoService, eventoService, formatarCodigoValidacao, type CertificadoDisponivel } from "../../services";
import type { Evento, Pagina } from "../../types";
import { MAX_TENTATIVAS_QUESTIONARIO, PERCENTUAL_APROVACAO } from "../../utils/questionario";

const FILTROS_VAZIOS = { eventoId: "", busca: "" };

// tela de certificados, aluno emite o proprio, equipe ve de todo mundo (paginado no servidor). A emissao
// e sempre pelo backend (que confere os requisitos e grava o certificado na primeira vez); o PDF sai do
// que voltou
export function CertificadosPage() {
  const { usuario } = useAuth();
  const isEquipe = usuario?.perfil === "ADMINISTRADOR" || usuario?.perfil === "SECRETARIA";

  // aluno: a lista dele inteira (poucos itens)
  const [certificados, setCertificados] = useState<CertificadoDisponivel[]>([]);
  // equipe: uma pagina da situacao dos certificados, filtrada no servidor
  const [pagina, setPagina] = useState<Pagina<CertificadoDisponivel> | null>(null);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [page, setPage] = useState(1);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  // inscricao cujo certificado esta sendo emitido agora (evita clique duplo)
  const [emitindo, setEmitindo] = useState<string | null>(null);

  // aluno: carrega os proprios certificados uma vez
  useEffect(() => {
    if (isEquipe || !usuario?.participanteId) return;
    setCarregando(true);
    certificadoService
      .listarCertificadosDoParticipante(usuario.participanteId)
      .then(setCertificados)
      .catch((erro) => toast.error(erro instanceof Error ? erro.message : "Não foi possível carregar os certificados."))
      .finally(() => setCarregando(false));
  }, [usuario?.id]);

  // equipe: eventos pro filtro
  useEffect(() => {
    if (isEquipe) void eventoService.list().then((e) => setEventos([...e].sort((a, b) => a.horario.localeCompare(b.horario))));
  }, [usuario?.id]);

  // equipe: pagina atual com os filtros; a busca por texto espera 300 ms sem digitar
  useEffect(() => {
    if (!isEquipe) return;
    let descartar = false;
    setCarregando(true);
    const espera = setTimeout(() => {
      certificadoService
        .listarSituacao({ ...filtros, page })
        .then((resposta) => {
          if (descartar) return;
          setPagina(resposta);
          if (resposta.page > resposta.totalPages) setPage(resposta.totalPages);
        })
        .catch((erro) => {
          if (!descartar) toast.error(erro instanceof Error ? erro.message : "Não foi possível carregar os certificados.");
        })
        .finally(() => {
          if (!descartar) setCarregando(false);
        });
    }, filtros.busca ? 300 : 0);
    return () => {
      descartar = true;
      clearTimeout(espera);
    };
  }, [usuario?.id, filtros, page]);

  // mudar qualquer filtro volta pra primeira pagina
  function mudarFiltro(parcial: Partial<typeof FILTROS_VAZIOS>) {
    setFiltros((atual) => ({ ...atual, ...parcial }));
    setPage(1);
  }

  // pede a emissao ao backend e baixa o PDF; na primeira vez o codigo novo passa a aparecer na tela
  async function emitir(certificado: CertificadoDisponivel) {
    setEmitindo(certificado.inscricaoId);
    try {
      const emitido = await certificadoService.emitirEBaixar(certificado.inscricaoId);
      const comCodigo = (c: CertificadoDisponivel) =>
        c.inscricaoId === emitido.inscricaoId ? { ...c, codigoValidacao: emitido.codigoValidacao } : c;
      setCertificados((lista) => lista.map(comCodigo));
      setPagina((atual) => (atual ? { ...atual, itens: atual.itens.map(comCodigo) } : atual));
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível emitir o certificado.");
    } finally {
      setEmitindo(null);
    }
  }

  // RF027: confere se um certificado e autentico pelo codigo impresso no PDF (a mesma consulta da pagina
  // publica que o link do PDF abre). Fica aqui, dentro do sistema, e nao mais na tela de login
  const cartaoValidacao = (
    <div className="card">
      <h3>Validar certificado</h3>
      <p className="form-hint" style={{ marginBottom: 12 }}>
        Confira se um certificado é autêntico pelo código de validação impresso no PDF.
      </p>
      <div style={{ maxWidth: 520 }}>
        <ValidacaoCertificado />
      </div>
    </div>
  );

  // aluno ve lista simples com questionario/emitir, equipe ve tabela com filtro
  if (!isEquipe) {
    return (
      <div>
        <PageHeader title="Certificados" />
        <div className="card">
          {carregando ? (
            <p className="empty-cell">Carregando seus certificados…</p>
          ) : certificados.length === 0 ? (
            <p className="empty-cell">
              Você ainda não possui certificados. Os certificados são liberados após a confirmação de presença.
            </p>
          ) : (
            <ul className="simple-list">
              {certificados.map((c) => {
                const tentativasEsgotadas = !c.questionarioAprovado && c.tentativasUsadas >= MAX_TENTATIVAS_QUESTIONARIO;
                return (
                  <li key={c.inscricaoId} className="simple-list-item simple-list-item-row">
                    <div>
                      <div className="simple-list-title">{c.eventoTitulo}</div>
                      <div className="simple-list-sub">
                        {c.tema} · {c.data ? new Date(c.data).toLocaleDateString("pt-BR") : "—"}
                      </div>
                      <div className="simple-list-sub">
                        {c.questionarioAprovado
                          ? `Questionário aprovado: ${c.melhorPercentual}% de acertos.`
                          : tentativasEsgotadas
                            ? `Você usou as ${MAX_TENTATIVAS_QUESTIONARIO} tentativas permitidas e não atingiu o mínimo de ${PERCENTUAL_APROVACAO}%.`
                            : c.melhorPercentual === null
                              ? `Responda o questionário (mínimo ${PERCENTUAL_APROVACAO}% de acertos, ${MAX_TENTATIVAS_QUESTIONARIO} tentativas) para liberar o certificado.`
                              : `Última tentativa: ${c.melhorPercentual}% de acertos — mínimo de ${PERCENTUAL_APROVACAO}% necessário (${c.tentativasUsadas}/${MAX_TENTATIVAS_QUESTIONARIO} tentativas usadas).`}
                      </div>
                      {c.codigoValidacao && (
                        <div className="simple-list-sub">Código de validação: {formatarCodigoValidacao(c.codigoValidacao)}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {!c.questionarioAprovado && !tentativasEsgotadas && (
                        <Link className="btn btn-ghost" to={`/eventos/${c.eventoId}/questionario`}>
                          {c.tentativasUsadas === 0 ? "Questionário" : "Refazer questionário"}
                        </Link>
                      )}
                      <button
                        className="btn btn-primary"
                        onClick={() => void emitir(c)}
                        disabled={!c.questionarioAprovado || emitindo === c.inscricaoId}
                      >
                        {emitindo === c.inscricaoId ? "Emitindo…" : c.codigoValidacao ? "Baixar certificado" : "Emitir certificado"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {cartaoValidacao}
      </div>
    );
  }

  const itens = pagina?.itens ?? [];
  const filtrosAtivos = Boolean(filtros.eventoId || filtros.busca.trim());

  // equipe: a validacao vem antes da tabela, que pode ser longa
  return (
    <div>
      <PageHeader title="Certificados" />

      {cartaoValidacao}

      <div className="card">
        <div className="field-row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          <label className="field" style={{ minWidth: 240 }}>
            <span>Evento</span>
            <select value={filtros.eventoId} onChange={(e) => mudarFiltro({ eventoId: e.target.value })}>
              <option value="">Todos os eventos</option>
              {eventos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.titulo}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 240 }}>
            <span>Aluno</span>
            <input
              value={filtros.busca}
              onChange={(e) => mudarFiltro({ busca: e.target.value })}
              placeholder="Nome, e-mail ou RGM"
              aria-label="Buscar aluno"
            />
          </label>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Participante</th>
              <th>RGM</th>
              <th>Evento</th>
              <th>Carga horária</th>
              <th>Nota do questionário</th>
              <th>Código de validação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {itens.map((c) => (
              <tr key={c.inscricaoId}>
                <td>
                  {c.participanteNome} {!c.participanteAtivo && <Badge tone="red">Inativo</Badge>}
                </td>
                <td>{c.participanteRgm}</td>
                <td>{c.eventoTitulo}</td>
                <td>{c.cargaHoraria}h</td>
                <td>{c.melhorPercentual === null ? "—" : `${c.melhorPercentual}%`}</td>
                <td>{c.codigoValidacao ? formatarCodigoValidacao(c.codigoValidacao) : "Não emitido"}</td>
                <td className="table-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => void emitir(c)}
                    disabled={!c.questionarioAprovado || emitindo === c.inscricaoId}
                    title={c.questionarioAprovado ? undefined : `Liberado com presença confirmada e ${PERCENTUAL_APROVACAO}% no questionário`}
                  >
                    {emitindo === c.inscricaoId ? "Emitindo…" : c.codigoValidacao ? "Baixar certificado" : "Emitir certificado"}
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-cell">
                  {carregando
                    ? "Carregando…"
                    : filtrosAtivos
                      ? "Nenhum certificado disponível para os filtros aplicados."
                      : "Nenhum aluno com presença confirmada ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pagina && (
          <Paginacao
            page={page}
            pageSize={pagina.pageSize}
            total={pagina.total}
            totalPages={pagina.totalPages}
            carregando={carregando}
            singular="aluno com presença confirmada"
            plural="alunos com presença confirmada"
            onMudarPagina={setPage}
          />
        )}
      </div>
    </div>
  );
}
