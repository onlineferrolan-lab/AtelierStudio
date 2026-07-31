/**
 * Atajo oculto Ctrl+Alt+H: descarga el manual de usuario.
 *
 * Se comprueba con `event.code` (no `event.key`) porque el atajo tiene que
 * funcionar igual con teclado español, catalán o inglés.
 */

import { fireEvent, render } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import {
  esAtajoManual,
  rutaManual,
  useAtajoManual,
} from '../../../../src/ui/shell/atajoManual';

function Sonda(): null {
  useAtajoManual();
  return null;
}

/** Intercepta el `click()` del enlace de descarga que crea `descargarManual`. */
function espiarDescargas(): { descargas: string[]; restaurar: () => void } {
  const descargas: string[] = [];
  const original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function interceptado(this: HTMLAnchorElement) {
    descargas.push(this.getAttribute('download') ?? '');
  };
  return {
    descargas,
    restaurar: () => {
      HTMLAnchorElement.prototype.click = original;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('esAtajoManual', () => {
  const evento = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', init);

  it('reconoce Ctrl+Alt+H por código de tecla, sea cual sea la distribución', () => {
    expect(esAtajoManual(evento({ ctrlKey: true, altKey: true, code: 'KeyH' }))).toBe(true);
    // Con teclado que devuelve otra `key` para la misma tecla física.
    expect(esAtajoManual(evento({ ctrlKey: true, altKey: true, code: 'KeyH', key: 'ĥ' }))).toBe(
      true,
    );
  });

  it('no se dispara con combinaciones parecidas', () => {
    expect(esAtajoManual(evento({ ctrlKey: true, code: 'KeyH' }))).toBe(false); // Ctrl+H del navegador
    expect(esAtajoManual(evento({ altKey: true, code: 'KeyH' }))).toBe(false);
    expect(esAtajoManual(evento({ ctrlKey: true, altKey: true, code: 'KeyG' }))).toBe(false);
    expect(
      esAtajoManual(evento({ ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyH' })),
    ).toBe(false);
  });
});

describe('useAtajoManual', () => {
  it('descarga el manual al pulsar Ctrl+Alt+H', () => {
    const espia = espiarDescargas();
    try {
      render(<Sonda />);
      fireEvent.keyDown(window, { ctrlKey: true, altKey: true, code: 'KeyH' });
      expect(espia.descargas).toEqual(['Manual de usuario - Atelier Studio.pdf']);
    } finally {
      espia.restaurar();
    }
  });

  it('no descarga nada con otras teclas', () => {
    const espia = espiarDescargas();
    try {
      render(<Sonda />);
      fireEvent.keyDown(window, { code: 'KeyH' });
      fireEvent.keyDown(window, { ctrlKey: true, code: 'KeyH' });
      expect(espia.descargas).toEqual([]);
    } finally {
      espia.restaurar();
    }
  });

  it('deja de escuchar al desmontar', () => {
    const espia = espiarDescargas();
    try {
      const { unmount } = render(<Sonda />);
      unmount();
      fireEvent.keyDown(window, { ctrlKey: true, altKey: true, code: 'KeyH' });
      expect(espia.descargas).toEqual([]);
    } finally {
      espia.restaurar();
    }
  });
});

describe('rutaManual', () => {
  it('cuelga de la base pública, no de la raíz del dominio', () => {
    expect(rutaManual()).toBe(`${import.meta.env.BASE_URL}manual-usuario.pdf`);
    expect(rutaManual().endsWith('/manual-usuario.pdf')).toBe(true);
  });
});
