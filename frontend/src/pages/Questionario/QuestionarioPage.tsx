import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { eventoService } from "../../services";
import type { PerguntaSemGabarito } from "../../services/questionarioService";
import { questionarioService } from "../../services/questionarioService";
import type { Evento, TentativaQuestionario } from "../../types";
import { PERCENTUAL_APROVACAO } from "../../utils/questionario";

// pagina que o aluno acessa a partir do botao "Questionário" em Certificados
export function QuestionarioPage() {
  const { eventoId } = useParams<{ eventoId: string }>();
  const { usuario } = useAuth();

  const [evento, setEvento] = useState<Evento | null>(null);
  const [perguntas, setPerguntas] = useState<PerguntaSemGabarito[]>([]);
  const [respostas, setRespostas] = useState<Record<number, number>>({});
  const [resultado, setResultado] = useState<TentativaQuestionario | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!eventoId) return;
    void Promise.all([eventoService.get(eventoId), questionarioService.obterQuestionario(eventoId)]).then(
      ([e, p]) => {
        setEvento(e ?? null);
        setPerguntas(p);
      },
    );
  }, [eventoId]);

  function escolher(indicePergunta: number, indiceAlternativa: number) {
    setRespostas((prev) => ({ ...prev, [indicePergunta]: indiceAlternativa }));
  }

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
      if (tentativa.percentual >= PERCENTUAL_APROVACAO) {
        toast.success(`Parabéns! Você acertou ${tentativa.acertos}/${tentativa.totalPerguntas} (${tentativa.percentual}%).`);
      } else {
        toast.error(`Você acertou ${tentativa.acertos}/${tentativa.totalPerguntas} (${tentativa.percentual}%) — mínimo de ${PERCENTUAL_APROVACAO}% para liberar o certificado.`);
      }
    } catch {
      toast.error("Não foi possível enviar suas respostas. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  function refazer() {
    setResultado(null);
    setRespostas({});
  }

  if (!evento) {
    return (
      <div>
        <PageHeader title="Questionário" />
        <div className="card">
          <p className="empty-cell">Carregando…</p>
        </div>
      </div>
    );
  }

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
            ) : (
              <p className="form-error">
                É necessário pelo menos {PERCENTUAL_APROVACAO}% de acertos para liberar o certificado.
              </p>
            )}
            <div className="modal-footer" style={{ justifyContent: "center", marginTop: 16 }}>
              {resultado.percentual < PERCENTUAL_APROVACAO && (
                <button className="btn btn-ghost" onClick={refazer}>
                  Refazer questionário
                </button>
              )}
              <Link className="btn btn-primary" to="/certificados">
                Voltar para Certificados
              </Link>
            </div>
          </div>
        ) : (
          <>
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
