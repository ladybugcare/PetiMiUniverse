import type { FormEvent } from 'react';

const DEFAULT_MSG = 'Preencha este campo.';

/** Props para inputs `required` com mensagem nativa em pt-BR (em vez do inglês do browser). */
export function requiredFieldPtProps(message = DEFAULT_MSG) {
  return {
    required: true as const,
    onInvalid: (e: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.currentTarget.setCustomValidity(message);
    },
    onInput: (e: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      e.currentTarget.setCustomValidity('');
    },
  };
}
