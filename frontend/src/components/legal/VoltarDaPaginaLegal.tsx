import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// link no fim dos Termos de Uso e da Politica de Privacidade: quem esta logado (abriu pela Minha conta) volta pra
// Minha conta; quem nao esta (veio do cadastro) volta pro cadastro, como antes
export function VoltarDaPaginaLegal() {
  const { usuario } = useAuth();
  return usuario ? <Link to="/minha-conta">Voltar para Minha conta</Link> : <Link to="/cadastro">Voltar para o cadastro</Link>;
}
