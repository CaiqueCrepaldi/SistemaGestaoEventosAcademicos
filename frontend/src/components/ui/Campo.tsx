import { cloneElement, type ReactElement, type ReactNode } from "react";

interface CampoProps {
  // id/name do controle — o mesmo nome que o backend devolve em "erros[].campo"
  nome: string;
  rotulo: ReactNode;
  obrigatorio?: boolean;
  erro?: string;
  dica?: ReactNode;
  children: ReactElement<Record<string, unknown>>;
}

// campo padrao de todo formulario do sistema: rotulo (com * quando obrigatorio), o controle e,
// embaixo dele, a mensagem do que falta. O controle ganha borda vermelha via .field-invalido
export function Campo({ nome, rotulo, obrigatorio, erro, dica, children }: CampoProps) {
  const idMensagem = `${nome}-mensagem`;
  const controle = cloneElement(children, {
    id: nome,
    name: nome,
    "aria-invalid": erro ? true : undefined,
    "aria-required": obrigatorio || undefined,
    "aria-describedby": erro || dica ? idMensagem : undefined,
  });

  return (
    <div className={"field" + (erro ? " field-invalido" : "")}>
      <label htmlFor={nome}>
        {rotulo}
        {obrigatorio && <MarcaObrigatorio />}
      </label>
      {controle}
      {erro ? (
        <p className="form-error" id={idMensagem}>
          {erro}
        </p>
      ) : (
        dica && (
          <p className="form-hint" id={idMensagem}>
            {dica}
          </p>
        )
      )}
    </div>
  );
}

export function MarcaObrigatorio() {
  return (
    <span className="campo-obrigatorio" aria-hidden="true">
      {" "}*
    </span>
  );
}

// aviso no topo do formulario explicando o *
export function LegendaObrigatorio() {
  return (
    <p className="form-legenda">
      Campos marcados com <span className="campo-obrigatorio">*</span> são obrigatórios.
    </p>
  );
}
