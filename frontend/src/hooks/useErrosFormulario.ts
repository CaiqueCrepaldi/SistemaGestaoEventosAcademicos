import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../services/api";

export type ErrosFormulario = Record<string, string>;

// erros por campo de um formulario, com o mesmo comportamento em todo o sistema: ao enviar com
// algo faltando, cada campo mostra o que falta embaixo dele e o foco vai pro primeiro campo invalido.
// Os erros de validacao do backend ("erros": [{ campo, mensagem }]) caem no campo certo
export function useErrosFormulario() {
  const [erros, setErros] = useState<ErrosFormulario>({});
  const [tentativa, setTentativa] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // depois que os erros aparecem na tela, foca o primeiro campo invalido (ordem do formulario)
  useEffect(() => {
    if (tentativa === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [tentativa]);

  // mostra os erros e devolve true se havia algum (o formulario nao deve seguir)
  function mostrar(novos: ErrosFormulario): boolean {
    setErros(novos);
    const temErro = Object.keys(novos).length > 0;
    if (temErro) setTentativa((t) => t + 1);
    return temErro;
  }

  // 422 da API com a lista de campos: cada mensagem vai pro campo correspondente. "nomeDoCampo"
  // traduz o caminho do backend quando o formulario usa outro nome. Devolve true se tratou o erro
  function mostrarErroDaApi(erro: unknown, nomeDoCampo: (campo: string) => string = (c) => c): boolean {
    if (!(erro instanceof ApiError) || !erro.errors?.length) return false;
    const novos: ErrosFormulario = {};
    for (const item of erro.errors) {
      const campo = nomeDoCampo(item.campo);
      if (!novos[campo]) novos[campo] = item.mensagem;
    }
    return mostrar(novos);
  }

  function limpar(campo?: string) {
    setErros((atuais) => {
      if (!campo) return {};
      if (!(campo in atuais)) return atuais;
      const copia = { ...atuais };
      delete copia[campo];
      return copia;
    });
  }

  // no <form onChange>: quem corrige um campo ve o aviso daquele campo sumir na hora
  function limparAoEditar(evento: FormEvent<HTMLFormElement>) {
    const alvo = evento.target as HTMLInputElement;
    if (alvo.name) limpar(alvo.name);
  }

  return { erros, formRef, mostrar, mostrarErroDaApi, limpar, limparAoEditar };
}
