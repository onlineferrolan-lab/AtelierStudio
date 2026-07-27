/**
 * Paso ② Figura (§1.②).
 *
 * Galería visual cargada desde configuración (`config.figuras`, §3: nunca
 * cosida a la interfaz). Cada tarjeta muestra el dibujo de la figura + nombre.
 * - Figuras 'pendiente' (§6.5/§6.6): tarjeta deshabilitada con insignia
 *   PENDIENTE y el motivo visible.
 * La selección despacha `seleccionarFigura`, que reinicia medidas y
 * suplementos (reductor de `quote-state`).
 */

import type { Figura } from '../../domain/config';
import { useConfig } from '../state/config-context';
import { useAtelier } from '../state/quote-state';
import { usePasoCompletado, usePasos } from '../state/pasos-context';
import { Insignia, PasoCard } from '../components/primitivas';
import { MiniaturaFigura } from './MiniaturaFigura';

function TarjetaFigura({
  figura,
  seleccionada,
  alSeleccionar,
}: {
  figura: Figura;
  seleccionada: boolean;
  alSeleccionar: () => void;
}): JSX.Element {
  const pendiente = figura.estado === 'pendiente';
  return (
    <button
      type="button"
      disabled={pendiente}
      aria-pressed={seleccionada}
      onClick={alSeleccionar}
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-shadow ${
        pendiente
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
          : seleccionada
            ? 'border-marca bg-marca-claro/40 shadow-sm ring-2 ring-marca/40'
            : 'border-slate-200 bg-white hover:shadow-md'
      }`}
    >
      <MiniaturaFigura figura={figura} />
      <span className={`text-sm font-medium ${pendiente ? 'text-slate-500' : 'text-slate-800'}`}>
        {figura.nombre}
      </span>
      <span className="flex flex-wrap items-center justify-center gap-1">
        {pendiente ? <Insignia tono="pendiente">Pendiente</Insignia> : null}
      </span>
      {pendiente && figura.motivoPendiente ? (
        <span className="text-xs text-slate-500">{figura.motivoPendiente}</span>
      ) : null}
    </button>
  );
}

export function PasoFigura(): JSX.Element {
  const config = useConfig();
  const { estado, dispatch } = useAtelier();
  const pasos = usePasos();
  usePasoCompletado(2, estado.figuraId !== null);

  return (
    <PasoCard numero={2} titulo="Figura" abierto={pasos.estado[2] ?? false} alAlternar={() => pasos.alternar(2)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {config.figuras.map((figura) => (
          <TarjetaFigura
            key={figura.id}
            figura={figura}
            seleccionada={estado.figuraId === figura.id}
            alSeleccionar={() => dispatch({ tipo: 'seleccionarFigura', figuraId: figura.id })}
          />
        ))}
      </div>
    </PasoCard>
  );
}
