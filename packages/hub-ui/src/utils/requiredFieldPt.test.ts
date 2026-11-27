import { describe, expect, it, vi } from 'vitest';
import { requiredFieldPtProps } from './requiredFieldPt';

describe('requiredFieldPtProps', () => {
  it('define required e mensagens em pt-BR', () => {
    const props = requiredFieldPtProps('Informe o nome.');
    expect(props.required).toBe(true);

    const setCustomValidity = vi.fn();
    const target = { setCustomValidity } as unknown as HTMLInputElement;
    props.onInvalid({ currentTarget: target } as never);
    expect(setCustomValidity).toHaveBeenCalledWith('Informe o nome.');

    props.onInput({ currentTarget: target } as never);
    expect(setCustomValidity).toHaveBeenCalledWith('');
  });
});
