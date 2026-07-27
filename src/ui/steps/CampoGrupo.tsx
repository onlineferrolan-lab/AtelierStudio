/**
 * Envoltorio de campo para controles que NO son un único input (p. ej.
 * `ControlSegmentado`, un grupo de botones): misma presentación que `Campo`
 * (etiqueta + tooltip + error) pero con `<div>` en vez de `<label>`, porque un
 * `<label>` solo debe envolver a un control etiquetable y, de hacerlo,
 * corrompe el nombre accesible de los botones del grupo.
 */

import type { ReactNode } from 'react';
import { InfoTooltip } from '../components/primitivas';

export function CampoGrupo({
  etiqueta,
  error,
  ayuda,
  children,
}: {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div>
      <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {etiqueta}
        {ayuda ? <InfoTooltip texto={ayuda} /> : null}
      </span>
      {children}
      {error ? <span className="mt-1 block text-sm text-red-600">{error}</span> : null}
    </div>
  );
}
