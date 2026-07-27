/**
 * Utilidades para montar los pasos en tests: envuelve el componente en
 * `ProveedorAtelier` (con la config real de /public/config) y expone una
 * sonda con el estado/dispatch de `useAtelier` para preparar escenarios y
 * comprobar el estado global.
 *
 * La config llega a los pasos vía `useConfig`; cada test mockea ese hook del
 * módulo `config-context` (el contexto no se exporta y `ProveedorConfig`
 * haría fetch a /config, no disponible en jsdom).
 *
 * Estos tests montan CADA PASO AISLADO (sin los demás), así que el estado de
 * apertura automática (`pasos-context.tsx`) no tiene ocasión de abrir el paso
 * bajo prueba por sí solo: se monta con los cuatro abiertos, igual que antes
 * de que existiera el automatismo (ver `PasoCard`/`ProveedorPasos`).
 */

import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ProveedorAtelier, useAtelier } from '../../../../src/ui/state/quote-state';
import { ProveedorPasos } from '../../../../src/ui/state/pasos-context';
import { construirConfigPrueba } from './config-prueba';

export type AtelierApi = ReturnType<typeof useAtelier>;

export function montarPasos(ui: ReactElement): { api: () => AtelierApi } {
  let actual: AtelierApi | null = null;
  function Captura(): null {
    actual = useAtelier();
    return null;
  }
  render(
    <ProveedorAtelier config={construirConfigPrueba()}>
      <ProveedorPasos inicial={{ 1: true, 2: true, 3: true, 4: true }}>
        {ui}
        <Captura />
      </ProveedorPasos>
    </ProveedorAtelier>,
  );
  return {
    api: () => {
      if (!actual) throw new Error('El estado de Atelier aún no está montado');
      return actual;
    },
  };
}
