import { useEffect, useState } from "react";
import { Campo, LegendaObrigatorio } from "../../components/ui/Campo";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useErrosFormulario, type ErrosFormulario } from "../../hooks/useErrosFormulario";
import { eventoService, salaService } from "../../services";
import type { Sala, TipoSala } from "../../types";
import { ANDARES, montarCodigoSala, NUMEROS, ordenarSalas, partesDoCodigo, PREDIOS, rotuloSala, rotuloTipoSala, TIPOS_SALA } from "../../utils/salas";

// capacidade fica como texto no formulario pra campo vazio nao virar 0 sozinho. O codigo da sala (padrao da UMC,
// ex.: 1T-01) e montado das tres selecoes: predio, andar e numero
const VAZIO = { predio: "", andar: "", numero: "", tipo: "SALA_DE_AULA" as TipoSala, capacidade: "" };

// crud de salas, por predio, andar e numero, com filtro por predio e por tipo
export function SalasPage() {
  const [salas, setSalas] = useState<Sala[]>([]);
  // enquanto carrega a lista diz "Carregando" (e nao "Nenhuma sala cadastrada")
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Sala | null>(null);
  const [form, setForm] = useState(VAZIO);
  const [confirmandoSalvar, setConfirmandoSalvar] = useState(false);
  const [excluindo, setExcluindo] = useState<Sala | null>(null);
  const [filtroPredio, setFiltroPredio] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoSala>("");
  const { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar } = useErrosFormulario();

  useEffect(() => {
    void carregar();
  }, []);

  // busca a lista atualizada de salas
  async function carregar() {
    try {
      setSalas(ordenarSalas(await salaService.list()));
    } finally {
      setCarregando(false);
    }
  }

  // abre o modal em branco
  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    limpar();
    setModalAberto(true);
  }

  // abre o modal ja preenchido com os dados da sala clicada
  function abrirEdicao(sala: Sala) {
    setEditando(sala);
    setForm({ ...partesDoCodigo(sala.nome), tipo: sala.tipo, capacidade: String(sala.capacidade) });
    limpar();
    setModalAberto(true);
  }

  function validar(): ErrosFormulario {
    const faltando: ErrosFormulario = {};
    if (!form.predio) faltando.predio = "Escolha o prédio.";
    if (!form.andar) faltando.andar = "Escolha o andar.";
    if (!form.numero) faltando.numero = "Escolha o número da sala.";
    const capacidade = Number(form.capacidade);
    if (!form.capacidade.trim()) faltando.capacidade = "Informe a capacidade.";
    else if (!Number.isInteger(capacidade) || capacidade <= 0) faltando.capacidade = "A capacidade deve ser um número inteiro maior que zero.";
    return faltando;
  }

  // editar pede confirmacao antes de gravar, criar nao
  function pedirSalvar() {
    if (mostrar(validar())) return;
    if (editando) setConfirmandoSalvar(true);
    else void salvar();
  }

  // cria ou atualiza dependendo se ta editando
  async function salvar() {
    const dados = { nome: codigo, tipo: form.tipo, capacidade: Number(form.capacidade) };
    try {
      if (editando) {
        await salaService.update(editando.id, dados);
        toast.success("Sala atualizada.");
      } else {
        await salaService.create(dados);
        toast.success("Sala cadastrada.");
      }
      setConfirmandoSalvar(false);
      setModalAberto(false);
      await carregar();
    } catch (erro) {
      setConfirmandoSalvar(false);
      // o codigo vem da API no campo "nome": o aviso vai pra selecao do numero
      if (!mostrarErroDaApi(erro, (campo) => (campo === "nome" ? "numero" : campo))) toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar a sala.");
    }
  }

  // bloqueia exclusao se tiver evento vinculado, senao remove
  async function excluir() {
    if (!excluindo) return;
    // evento sempre precisa de sala, entao bloqueia se tiver vinculo
    const eventos = await eventoService.list();
    if (eventos.some((e) => e.salaId === excluindo.id)) {
      toast.error("Não é possível remover: há eventos vinculados a esta sala.");
      setExcluindo(null);
      return;
    }
    await salaService.remove(excluindo.id);
    toast.success("Sala removida.");
    setExcluindo(null);
    await carregar();
  }

  const codigo = montarCodigoSala(form.predio, form.andar, form.numero);
  const visiveis = salas.filter((sala) => (!filtroPredio || sala.nome.startsWith(filtroPredio)) && (!filtroTipo || sala.tipo === filtroTipo));

  return (
    <div>
      <PageHeader
        title="Salas"
        actions={
          <button className="btn btn-primary" onClick={abrirNovo}>
            + Nova sala
          </button>
        }
      />

      <div className="card table-scroll">
        <div className="filtros-linha">
          <select value={filtroPredio} onChange={(e) => setFiltroPredio(e.target.value)} aria-label="Filtrar por prédio">
            <option value="">Todos os prédios</option>
            {PREDIOS.map((p) => (
              <option key={p} value={p}>
                Prédio {p}
              </option>
            ))}
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as "" | TipoSala)} aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            {TIPOS_SALA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Sala</th>
              <th>Tipo</th>
              <th>Capacidade</th>
              <th>Eventos realizados</th>
              <th title="Presentes ÷ capacidade, média dos eventos encerrados">Ocupação média</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((sala) => (
              <tr key={sala.id}>
                <td>{sala.nome}</td>
                <td>{rotuloTipoSala(sala.tipo)}</td>
                <td>{sala.capacidade} lugares</td>
                <td>{sala.eventosRealizados ?? 0}</td>
                <td>
                  {sala.ocupacaoMedia == null ? (
                    <span title="Sem eventos encerrados nesta sala">—</span>
                  ) : (
                    <span title="Presentes ÷ capacidade, média dos eventos encerrados">{Math.round(sala.ocupacaoMedia)}%</span>
                  )}
                </td>
                <td className="table-actions">
                  <button className="btn btn-ghost" onClick={() => abrirEdicao(sala)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-danger" onClick={() => setExcluindo(sala)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-cell">
                  {carregando ? "Carregando…" : salas.length === 0 ? "Nenhuma sala cadastrada." : "Nenhuma sala com esses filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <Modal title={editando ? "Editar sala" : "Nova sala"} onClose={() => setModalAberto(false)}>
          <form
            className="form"
            ref={formRef}
            noValidate
            onChange={limparAoEditar}
            onSubmit={(e) => {
              e.preventDefault();
              pedirSalvar();
            }}
          >
            <LegendaObrigatorio />
            <div className="grid-3">
              <Campo nome="predio" rotulo="Prédio" obrigatorio erro={erros.predio}>
                <select value={form.predio} onChange={(e) => setForm({ ...form, predio: e.target.value })} autoFocus>
                  <option value="">Selecione…</option>
                  {PREDIOS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo nome="andar" rotulo="Andar" obrigatorio erro={erros.andar}>
                <select value={form.andar} onChange={(e) => setForm({ ...form, andar: e.target.value })}>
                  <option value="">Selecione…</option>
                  {ANDARES.map((a) => (
                    <option key={a.valor} value={a.valor}>
                      {a.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo nome="numero" rotulo="Número" obrigatorio erro={erros.numero}>
                <select value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })}>
                  <option value="">Selecione…</option>
                  {NUMEROS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <p className="form-hint" aria-live="polite">
              Código da sala: <strong>{form.predio && form.andar && form.numero ? codigo : "—"}</strong> (prédio, andar e
              número; T = térreo)
            </p>
            <Campo nome="tipo" rotulo="Tipo" obrigatorio erro={erros.tipo}>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoSala })}>
                {TIPOS_SALA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo nome="capacidade" rotulo="Capacidade (lugares)" obrigatorio erro={erros.capacidade}>
              <input
                type="number"
                min={1}
                step={1}
                value={form.capacidade}
                onChange={(e) => setForm({ ...form, capacidade: e.target.value })}
              />
            </Campo>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalAberto(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmandoSalvar && (
        <ConfirmDialog
          title="Confirmar alteração"
          message={`Salvar as alterações da sala ${codigo} · ${rotuloTipoSala(form.tipo)}?`}
          onConfirm={() => void salvar()}
          onCancel={() => setConfirmandoSalvar(false)}
        />
      )}

      {excluindo && (
        <ConfirmDialog
          title="Remover sala"
          message={`Tem certeza que deseja remover a sala ${rotuloSala(excluindo)}? Essa ação não pode ser desfeita.`}
          confirmLabel="Remover"
          tone="danger"
          onConfirm={() => void excluir()}
          onCancel={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
