import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_LOGOUT_STARTED_EVENT,
  beginAuthLogout,
  endAuthLogout,
  getAuthLogoutGeneration,
  isAuthLogoutAbortError,
  isAuthLogoutInProgress,
  createAuthLogoutAbortError,
} from '../../web-core/src/authLogoutGate';

describe('authLogoutGate', () => {
  afterEach(() => {
    endAuthLogout();
  });

  it('marca logout em progresso e incrementa geração', () => {
    expect(isAuthLogoutInProgress()).toBe(false);
    const before = getAuthLogoutGeneration();
    const gen = beginAuthLogout();
    expect(isAuthLogoutInProgress()).toBe(true);
    expect(gen).toBe(before + 1);
  });

  it('dispara AUTH_LOGOUT_STARTED_EVENT quando window existe', () => {
    const spy = vi.fn();
    const listeners = new Map<string, Set<(ev: Event) => void>>();
    const fakeWindow = {
      addEventListener(type: string, fn: (ev: Event) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: (ev: Event) => void) {
        listeners.get(type)?.delete(fn);
      },
      dispatchEvent(ev: Event) {
        listeners.get(ev.type)?.forEach((fn) => fn(ev));
        return true;
      },
    };
    vi.stubGlobal('window', fakeWindow);
    fakeWindow.addEventListener(AUTH_LOGOUT_STARTED_EVENT, spy);

    beginAuthLogout();
    expect(spy).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('endAuthLogout libera o gate', () => {
    beginAuthLogout();
    expect(isAuthLogoutInProgress()).toBe(true);
    endAuthLogout();
    expect(isAuthLogoutInProgress()).toBe(false);
  });

  it('createAuthLogoutAbortError é reconhecido por isAuthLogoutAbortError', () => {
    const err = createAuthLogoutAbortError();
    expect(isAuthLogoutAbortError(err)).toBe(true);
    expect(isAuthLogoutAbortError(new Error('401'))).toBe(false);
  });
});
