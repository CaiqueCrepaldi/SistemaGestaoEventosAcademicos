import { requisitosDaSenha, SENHA_MAX_CARACTERES } from "../../utils/validacao";

interface RequisitosSenhaProps {
  senha: string;
  // id usado no aria-describedby do campo de senha, pra o leitor de tela ligar a lista ao campo
  id?: string;
}

const ITENS = [
  { chave: "minimo", texto: "Mínimo de 8 caracteres" },
  { chave: "maiuscula", texto: "Uma letra maiúscula" },
  { chave: "numero", texto: "Um número" },
  { chave: "especial", texto: "Um caractere especial (ex.: ! @ # $ %)" },
] as const;

// lista de conferencia da senha nova, embaixo do campo (Cadastro e Esqueci a senha): cada requisito
// mostra ✓ verde quando cumprido e • cinza quando falta, atualizando a cada tecla. Icone + texto (nao
// so cor) e o estado escrito pro leitor de tela ("cumprido"/"pendente"). Mesma regra do backend
export function RequisitosSenha({ senha, id }: RequisitosSenhaProps) {
  const requisitos = requisitosDaSenha(senha);

  return (
    <div className="requisitos-senha" id={id}>
      <p className="requisitos-senha-titulo">A senha precisa ter:</p>
      <ul aria-live="polite">
        {ITENS.map((item) => {
          const ok = requisitos[item.chave];
          return (
            <li key={item.chave} className={ok ? "requisito-ok" : "requisito-pendente"}>
              <span className="requisito-icone" aria-hidden="true">
                {ok ? "✓" : "•"}
              </span>
              {item.texto}
              <span className="visualmente-oculto">{ok ? " (cumprido)" : " (pendente)"}</span>
            </li>
          );
        })}
      </ul>
      {!requisitos.maximo && (
        <p className="form-error" role="alert">
          A senha pode ter no máximo {SENHA_MAX_CARACTERES} caracteres.
        </p>
      )}
    </div>
  );
}
