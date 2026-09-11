import { useState } from "react";
import { OlhoFechadoIcon, OlhoIcon } from "./icons";

interface PasswordInputProps {
  value: string;
  onChange: (valor: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

// campo de senha com botao de olhinho pra alternar entre mostrar/ocultar, usado em toda tela com senha
export function PasswordInput({ value, onChange, required, autoFocus, placeholder }: PasswordInputProps) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="password-field">
      <input
        type={visivel ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
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
