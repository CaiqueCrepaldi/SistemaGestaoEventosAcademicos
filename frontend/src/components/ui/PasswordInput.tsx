import { useState, type InputHTMLAttributes } from "react";
import { OlhoFechadoIcon, OlhoIcon } from "./icons";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (valor: string) => void;
}

// campo de senha com botao de olhinho pra alternar entre mostrar/ocultar, usado em toda tela com
// senha. Repassa id/name/aria-* pro input (o <Campo> usa isso pra ligar rotulo e mensagem de erro)
export function PasswordInput({ value, onChange, ...resto }: PasswordInputProps) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="password-field">
      <input {...resto} type={visivel ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={-1}
      >
        {visivel ? <OlhoFechadoIcon /> : <OlhoIcon />}
      </button>
    </div>
  );
}
