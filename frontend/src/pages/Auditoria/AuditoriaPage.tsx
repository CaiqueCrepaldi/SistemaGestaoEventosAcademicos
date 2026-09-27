import { useEffect, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { auditoriaService, SEM_RESPONSAVEL } from "../../services";
import type { PaginaAuditoria, ResponsavelAuditoria } from "../../services";

// traduz o codigo da acao pra um texto legivel na tela (a ordem aqui eh a do filtro de acao)
const ACAO_LABEL: Record<string, string> = {
  LOGIN_SUCESSO: "Login realizado",
  LOGIN_FALHA: "Falha de login",
  ACESSO_NEGADO: "Acesso negado",
  USUARIO_REGISTRADO: "Conta registrada",
  CONSENTIMENTO_LGPD_ACEITO: "Consentimento LGPD aceito",
  RECUPERACAO_SENHA_SOLICITADA: "Recuperação de senha solicitada",
  RECUPERACAO_SENHA_FALHA: "Falha na recuperação de senha",
  SENHA_REDEFINIDA: "Senha redefinida",
  EMAIL_ENVIADO: "E-mail enviado",
  EMAIL_FALHA: "Falha no envio de e-mail",
  SALA_CRIADA: "Sala criada",
  SALA_ATUALIZADA: "Sala atualizada",
  SALA_REMOVIDA: "Sala removida",
  PALESTRANTE_CRIADO: "Palestrante criado",
  PALESTRANTE_ATUALIZADO: "Palestrante atualizado",
  PALESTRANTE_REMOVIDO: "Palestrante removido",
  EVENTO_CRIADO: "Evento criado",
  EVENTO_ATUALIZADO: "Evento atualizado",
  EVENTO_REMOVIDO: "Evento removido",
  PARTICIPANTE_ATUALIZADO: "Participante atualizado",
  PARTICIPANTE_INATIVADO: "Participante inativado",
  PARTICIPANTE_REATIVADO: "Participante reativado",
  PARTICIPANTE_REMOVIDO: "Participante removido",
  INSCRICAO_CRIADA: "Inscrição criada",
  INSCRICAO_ATUALIZADA: "Inscrição atualizada",
  INSCRICAO_REMOVIDA: "Inscrição removida",
  PRESENCA_CONFIRMADA: "Presença confirmada",
  PRESENCA_MARCADA_AUSENTE: "Presença marcada como ausente",
  QUESTIONARIO_RESPONDIDO: "Questionário respondido",
  FEEDBACK_CRIADO: "Feedback criado",
  FEEDBACK_ATUALIZADO: "Feedback atualizado",
  FEEDBACK_REMOVIDO: "Feedback removido",
};

const TAMANHOS_PAGINA = [25, 50, 100];
const FILTROS_VAZIOS = { acao: "", usuarioId: "", dataInicial: "", dataFinal: "" };

// converte "AAAA-MM-DD" (input date) pro instante ISO do inicio/fim daquele dia no fuso do navegador
function inicioDoDia(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 0, 0, 0, 0).toISOString();
}
function fimDoDia(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString();
}

// trilha de auditoria — so leitura, exclusiva de administrador/secretaria
export function AuditoriaPage() {
  const [pagina, setPagina] = useState<PaginaAuditoria | null>(null);
  const [responsaveis, setResponsaveis] = useState<ResponsavelAuditoria[]>([]);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  // sobe a cada "Tentar novamente" pra refazer a mesma consulta
  const [tentativa, setTentativa] = useState(0);

  const periodoInvalido = Boolean(filtros.dataInicial && filtros.dataFinal && filtros.dataInicial > filtros.dataFinal);

  useEffect(() => {
    auditoriaService.responsaveis().then(setResponsaveis).catch(() => setResponsaveis([]));
  }, []);

  useEffect(() => {
    if (periodoInvalido) return;
    let descartar = false;
    setCarregando(true);
    setErroCarga(null);
    auditoriaService
      .listar({
        page,
        pageSize,
        acao: filtros.acao || undefined,
        usuarioId: filtros.usuarioId || undefined,
        de: filtros.dataInicial ? inicioDoDia(filtros.dataInicial) : undefined,
        ate: filtros.dataFinal ? fimDoDia(filtros.dataFinal) : undefined,
      })
      .then((resposta) => {
        if (descartar) return;
        // filtro novo pode ter deixado a pagina atual alem do fim: volta pra ultima que existe
        if (resposta.page > resposta.totalPages) setPage(resposta.totalPages);
        else setPagina(resposta);
      })
      .catch((e) => {
        if (descartar) return;
        // 401 nem chega a aparecer aqui de verdade: o AuthContext desloga e redireciona pro
        // login antes desse estado importar (ver SESSAO_EXPIRADA_EVENT em services/api.ts)
        setErroCarga(e instanceof Error ? e.message : "Não foi possível carregar a trilha de auditoria.");
      })
      .finally(() => {
        if (!descartar) setCarregando(false);
      });
    return () => {
      descartar = true;
    };
  }, [filtros, page, pageSize, periodoInvalido, tentativa]);

  // mudar qualquer filtro volta pra primeira pagina
  function alterarFiltro(campo: keyof typeof FILTROS_VAZIOS, valor: string) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
    setPage(1);
  }

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS);
    setPage(1);
  }

  const filtrosAtivos = Object.values(filtros).some(Boolean);
  const itens = pagina?.itens ?? [];
  const total = pagina?.total ?? 0;
  const totalPages = pagina?.totalPages ?? 1;
  const primeiro = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const ultimo = Math.min(page * pageSize, total);

  return (
    <div>
      <PageHeader title="Auditoria" />
      <div className="card">
        <p className="form-hint" style={{ marginBottom: 14 }}>
          Registro de tudo que grava, altera ou apaga dados no sistema, além de logins, recuperações de senha, envios de
          e-mail e acessos negados. Os registros não podem ser editados nem apagados.
        </p>

        <div className="field-row" style={{ flexWrap: "wrap", marginBottom: 14 }}>
          <label className="field" style={{ minWidth: 200 }}>
            <span>Ação</span>
            <select value={filtros.acao} onChange={(e) => alterarFiltro("acao", e.target.value)}>
              <option value="">Todas as ações</option>
              {Object.entries(ACAO_LABEL).map(([codigo, rotulo]) => (
                <option key={codigo} value={codigo}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 200 }}>
            <span>Responsável</span>
            <select value={filtros.usuarioId} onChange={(e) => alterarFiltro("usuarioId", e.target.value)}>
              <option value="">Todos</option>
              <option value={SEM_RESPONSAVEL}>Sem responsável (ações públicas)</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 150 }}>
            <span>Data inicial</span>
            <input type="date" value={filtros.dataInicial} onChange={(e) => alterarFiltro("dataInicial", e.target.value)} />
          </label>
          <label className="field" style={{ minWidth: 150 }}>
            <span>Data final</span>
            <input type="date" value={filtros.dataFinal} onChange={(e) => alterarFiltro("dataFinal", e.target.value)} />
          </label>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <span>&nbsp;</span>
            <button type="button" className="btn btn-ghost" onClick={limparFiltros} disabled={!filtrosAtivos}>
              Limpar filtros
            </button>
          </div>
        </div>
        {periodoInvalido && <p className="form-error">A data inicial não pode ser posterior à data final.</p>}

        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Responsável</th>
                <th>Ação</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {erroCarga ? (
                <tr>
                  <td colSpan={4} className="empty-cell" role="alert">
                    <p className="form-error" style={{ marginBottom: 10 }}>
                      {erroCarga}
                    </p>
                    <button type="button" className="btn btn-primary" onClick={() => setTentativa((n) => n + 1)}>
                      Tentar novamente
                    </button>
                  </td>
                </tr>
              ) : carregando && !pagina ? (
                <tr>
                  <td colSpan={4} className="empty-cell">
                    Carregando…
                  </td>
                </tr>
              ) : (
                <>
                  {itens.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.criadoEm).toLocaleString("pt-BR")}</td>
                      <td>
                        {log.atorNome ?? "—"}
                        {log.atorRemovido && <span className="form-hint"> (conta removida)</span>}
                      </td>
                      <td>{ACAO_LABEL[log.acao] ?? log.acao}</td>
                      <td>{log.detalhe ?? "—"}</td>
                    </tr>
                  ))}
                  {itens.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-cell">
                        {filtrosAtivos ? "Nenhum registro encontrado com esses filtros." : "Nenhum registro de auditoria ainda."}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {!erroCarga && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: 14,
          }}
        >
          <span className="form-hint">
            {total === 0 ? "0 registros" : `Mostrando ${primeiro}–${ultimo} de ${total} registro${total === 1 ? "" : "s"}`}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <label className="form-hint" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Por página
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {TAMANHOS_PAGINA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-ghost" onClick={() => setPage(page - 1)} disabled={page <= 1 || carregando}>
              Anterior
            </button>
            <span className="form-hint">
              Página {Math.min(page, totalPages)} de {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || carregando}
            >
              Próxima
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
