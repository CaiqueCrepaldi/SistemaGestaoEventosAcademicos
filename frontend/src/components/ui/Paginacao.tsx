interface PaginacaoProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  carregando?: boolean;
  // "inscrição"/"inscrições", "registro"/"registros"...
  singular: string;
  plural: string;
  onMudarPagina: (page: number) => void;
}

// rodape das listas paginadas no servidor (mesmo visual da trilha de auditoria)
export function Paginacao({ page, pageSize, total, totalPages, carregando = false, singular, plural, onMudarPagina }: PaginacaoProps) {
  const primeiro = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const ultimo = Math.min(page * pageSize, total);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14 }}>
      <span className="form-hint">
        {total === 0 ? `0 ${plural}` : `Mostrando ${primeiro}–${ultimo} de ${total} ${total === 1 ? singular : plural}`}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={() => onMudarPagina(page - 1)} disabled={page <= 1 || carregando}>
          Anterior
        </button>
        <span className="form-hint">
          Página {Math.min(page, totalPages)} de {totalPages}
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => onMudarPagina(page + 1)} disabled={page >= totalPages || carregando}>
          Próxima
        </button>
      </div>
    </div>
  );
}
