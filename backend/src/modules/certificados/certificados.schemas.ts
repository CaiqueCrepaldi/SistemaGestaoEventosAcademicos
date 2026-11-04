import { z } from "zod";

// base32 de Crockford: 32 simbolos, sem I, L, O e U (nao se confundem com 1, 0 e V ao digitar)
export const ALFABETO_CODIGO_VALIDACAO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const TAMANHO_CODIGO_VALIDACAO = 12;

// o codigo que a pessoa digitou na pagina publica -> formato gravado no banco. Aceita minusculas,
// espacos e hifens (o PDF imprime em grupos, "ABCD-EFGH-JKMN") e troca as letras que o alfabeto nao
// usa pelo digito que elas imitam (O -> 0, I/L -> 1). Fora do formato = invalido (vira 404 na rota)
export const codigoValidacaoSchema = z
  .string()
  .transform((texto) =>
    texto
      .toUpperCase()
      .replace(/[\s-]/g, "")
      .replace(/O/g, "0")
      .replace(/[IL]/g, "1"),
  )
  .pipe(z.string().regex(new RegExp(`^[${ALFABETO_CODIGO_VALIDACAO}]{${TAMANHO_CODIGO_VALIDACAO}}$`)));
