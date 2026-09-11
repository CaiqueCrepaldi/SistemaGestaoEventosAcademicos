import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { ApiError, eventoService } from "../../services";
import type { PerguntaSemGabarito } from "../../services/questionarioService";
import { questionarioService } from "../../services/questionarioService";
import type { Evento, TentativaQuestionario } from "../../types";
import { MAX_TENTATIVAS_QUESTIONARIO, PERCENTUAL_APROVACAO } from "../../utils/questionario";

// melhor percentual entre uma lista de tentativas, null se a lista estiver vazia
function melhorPercentualDe(tentativas: TentativaQuestionario[]): number | null {
  return tentativas.length > 0 ? Math.max(...tentativas.map((t) => t.percentual)) : null;
}

// pagina que o aluno acessa a partir do botao "Questionário" em Certificados
// no maximo 2 tentativas; ao aprovar (>= PERCENTUAL_APROVACAO) o questionario fecha, sem opcao de refazer
export function QuestionarioPage() {
  const { eventoId } = useParams<{ eventoId: string }>();
  const { usuario } = useAuth();

  const [evento, setEvento] = useState<Evento | null>(null);
  const [perguntas, setPerguntas] = useState<PerguntaSemGabarito[]>([]);
  const [tentativasAnteriores, setTentativasAnteriores] = useState<TentativaQuestionario[] | null>(null);
  const [respostas, setRespostas] = useState<Record<number, number>>({});
  const [resultado, setResultado] = useState<TentativaQuestionario | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!eventoId || !usuario?.participanteId) return;
    void carregar();
  }, [eventoId, usuario?.participanteId]);

  // busca evento, perguntas e as tentativas ja feitas, pra saber se o questionario ja fechou
  async function carregar() {
    if (!eventoId || !usuario?.participanteId) return;
    const [e, p, t] = await Promise.all([
      eventoService.get(eventoId),
      questionarioService.obterQuestionario(eventoId),
      questionarioService.listarTentativas(eventoId, usuario.participanteId),
    ]);
    setEvento(e ?? null);
    setPerguntas(p);
    setTentativasAnteriores(t);
  }

  // guarda a alternativa escolhida pra aquela pergunta
  function escolher(indicePergunta: number, indiceAlternativa: number) {
    setRespostas((prev) => ({ ...prev, [indicePergunta]: indiceAlternativa }));
  }

  // confere se respondeu tudo, envia e mostra o resultado
  async function enviar() {
    if (!eventoId || !usuario?.participanteId) return;
    if (Object.keys(respostas).length !== perguntas.length) {
      toast.error("Responda todas as 10 perguntas antes de enviar.");
      return;
    }

    setEnviando(true);
    try {
      const vetorRespostas = perguntas.map((_, indice) => respostas[indice]);
      const tentativa = await questionarioService.enviarRespostas(eventoId, usuario.participanteId, vetorRespostas);
      setResultado(tentativa);
      setTentativasAnteriores((prev) => [...(prev ?? []), tentativa]);
      if (tentativa.percentual >= PERCENTUAL_APROVACAO) {
        toast.success(`Parabéns! Você acertou ${tentativa.acertos}/${tentativa.totalPerguntas} (${tentativa.percentual}%).`);
      } else {
        toast.error(`Você acertou ${tentativa.acertos}/${tentativa.totalPerguntas} (${tentativa.percentual}%) — mínimo de ${PERCENTUAL_APROVACAO}% para liberar o certificado.`);
      }
    } catch (e) {
      // corrida rara (ex: duas abas abertas) — recarrega o estado real antes de deixar o aluno tentar de novo
      const mensagem = e instanceof ApiError ? e.message : "Não foi possível enviar suas respostas. Tente novamente.";
      toast.error(mensagem);
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  if (!evento || !tentativasAnteriores) {
    return (
      <div>
        <PageHeader title="Questionário" />
        <div className="card">
          <p className="empty-cell">Carregando…</p>
        </div>
      </div>
    );
  }

  const melhorPercentual = melhorPercentualDe(tentativasAnteriores);
  const aprovado = melhorPercentual !== null && melhorPercentual >= PERCENTUAL_APROVACAO;
  const tentativasUsadas = tentativasAnteriores.length;
  const esgotado = !aprovado && tentativasUsadas >= MAX_TENTATIVAS_QUESTIONARIO;

  return (
    <div>
      <PageHeader title={`Questionário — ${evento.titulo}`} />

      <div className="card">
        {resultado ? (
          <div className="questionario-resultado">
            <p>Resultado da sua tentativa</p>
            <div className="questionario-resultado-percentual">{resultado.percentual}%</div>
            <p className="form-hint">
              {resultado.acertos} de {resultado.totalPerguntas} perguntas corretas.
            </p>
            {resultado.percentual >= PERCENTUAL_APROVACAO ? (
              <p className="form-hint">Você atingiu o mínimo necessário — o certificado já pode ser emitido.</p>
            ) : esgotado ? (
              <p className="form-error">
                Você usou as {MAX_TENTATIVAS_QUESTIONARIO} tentativas permitidas e não atingiu o mínimo de{" "}
                {PERCENTUAL_APROVACAO}%.
              </p>
            ) : (
              <p className="form-error">
                É necessário pelo menos {PERCENTUAL_APROVACAO}% de acertos para liberar o certificado. Ainda resta{" "}
                {MAX_TENTATIVAS_QUESTIONARIO - tentativasUsadas} tentativa(s).
              </p>
            )}
            <div className="modal-footer" style={{ justifyContent: "center", marginTop: 16 }}>
              {!aprovado && !esgotado && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setResultado(null);
                    setRespostas({});
                  }}
                >
                  Refazer questionário
                </button>
              )}
              <Link className="btn btn-primary" to="/certificados">
                Voltar para Certificados
              </Link>
            </div>
          </div>
        ) : aprovado ? (
          <div className="questionario-resultado">
            <p className="form-hint">
              Você já atingiu o mínimo de {PERCENTUAL_APROVACAO}% neste questionário ({melhorPercentual}% de acertos) —
              não é possível refazê-lo. O certificado já pode ser emitido.
            </p>
            <div className="modal-footer" style={{ justifyContent: "center", marginTop: 16 }}>
              <Link className="btn btn-primary" to="/certificados">
                Voltar para Certificados
              </Link>
            </div>
          </div>
        ) : esgotado ? (
          <div className="questionario-resultado">
            <p className="form-error">
              Você já usou as {MAX_TENTATIVAS_QUESTIONARIO} tentativas permitidas e não atingiu o mínimo de{" "}
              {PERCENTUAL_APROVACAO}% de acertos.
            </p>
            <div className="modal-footer" style={{ justifyContent: "center", marginTop: 16 }}>
              <Link className="btn btn-primary" to="/certificados">
                Voltar para Certificados
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="form-hint" style={{ marginTop: 0 }}>
              Tentativa {tentativasUsadas + 1} de {MAX_TENTATIVAS_QUESTIONARIO}.
            </p>
            {perguntas.map((pergunta, indicePergunta) => (
              <div className="questionario-resposta" key={pergunta.id}>
                <strong>
                  {indicePergunta + 1}. {pergunta.enunciado}
                </strong>
                {pergunta.alternativas.map((alternativa, indiceAlternativa) => (
                  <label className="questionario-resposta-opcao" key={indiceAlternativa}>
                    <input
                      type="radio"
                      name={`pergunta-${pergunta.id}`}
                      checked={respostas[indicePergunta] === indiceAlternativa}
                      onChange={() => escolher(indicePergunta, indiceAlternativa)}
                    />
                    {alternativa.texto}
                  </label>
                ))}
              </div>
            ))}
            <div className="modal-footer" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <Link className="btn btn-ghost" to="/certificados">
                Cancelar
              </Link>
              <button className="btn btn-primary" onClick={() => void enviar()} disabled={enviando}>
                {enviando ? "Enviando…" : "Enviar respostas"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
