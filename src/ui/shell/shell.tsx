/**
 * Layout principal de Atelier Studio, fiel a Top Studio (§1):
 *
 *  - Columna izquierda (~420-480 px) con los pasos ①-④, los comentarios para
 *    taller y, debajo, el bloque COTIZACIÓN siempre visible.
 *  - Panel derecho con pestañas Catálogo | Visor 3D (primitiva `Pestanas` +
 *    estado de `ProveedorPanel`): la pestaña Catálogo renderiza
 *    `<CatalogoPanel/>` y la pestaña Visor 3D renderiza `<VisorPieza/>` con la
 *    figura activa, las medidas validadas en mm y la textura del material.
 *  - Escritorio primero; en pantallas < lg las columnas se apilan.
 *
 * Aquí se engancha también el atajo oculto Ctrl+Alt+H, que descarga el manual de
 * usuario (`atajoManual.ts`); no tiene botón visible a propósito.
 */

import { Suspense, lazy } from 'react';
import { figuraPorId } from '../../domain/engine';
import { Pestanas } from '../components/primitivas';
import { useConfig } from '../state/config-context';
import { useAtelier, useMedidasValidadas } from '../state/quote-state';
import { CatalogoPanel } from '../steps/CatalogoPanel';
import { Comentarios } from '../steps/Comentarios';
import { PasoFigura } from '../steps/PasoFigura';
import { PasoMaterial } from '../steps/PasoMaterial';
import { PasoMedidas } from '../steps/PasoMedidas';
import { PasoSuplementos } from '../steps/PasoSuplementos';
import { useAtajoManual } from './atajoManual';
import { Cabecera } from './cabecera';
import { PanelCotizacion } from './cotizacion';
import { PanelPedido } from './pedido';
import { usePanelDerecho, type PestanaPanel } from './panel';

/**
 * El visor arrastra three.js (~505 kB). Se carga solo al abrir su pestaña: la
 * mayoría de presupuestos se cierran sin mirar el 3D, y hasta ahora ese peso se
 * descargaba siempre, en la primera pantalla.
 */
const VisorPieza = lazy(async () => ({
  default: (await import('../../viewer/VisorPieza')).VisorPieza,
}));

const PESTANAS: readonly { id: PestanaPanel; etiqueta: string }[] = [
  { id: 'catalogo', etiqueta: 'Catálogo' },
  { id: 'visor', etiqueta: 'Visor 3D' },
];

export function ShellAtelier(): JSX.Element {
  // Atajo oculto Ctrl+Alt+H: descarga el manual de usuario (ver `atajoManual`).
  useAtajoManual();
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Cabecera />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(420px,480px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <PasoMaterial />
            <PasoFigura />
            <PasoMedidas />
            <PasoSuplementos />
            <Comentarios />
            <PanelCotizacion />
            <PanelPedido />
          </div>
          <PanelDerecho />
        </div>
      </main>
    </div>
  );
}

function PanelDerecho(): JSX.Element {
  const config = useConfig();
  const { estado } = useAtelier();
  const { pestana, setPestana } = usePanelDerecho();
  const medidasMm = useMedidasValidadas(estado, config);

  const figuraActiva =
    estado.figuraId === null ? null : (figuraPorId(config, estado.figuraId) ?? null);
  const suplementosActivos = Object.entries(estado.suplementos)
    .filter(([, activo]) => activo)
    .map(([id]) => id);
  const cantidad = Number.parseInt(estado.cantidad, 10);

  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-6">
      <Pestanas pestanas={PESTANAS} activa={pestana} alCambiar={setPestana} />
      <div
        className={`flex min-h-[24rem] flex-col rounded-lg border border-slate-200 bg-white shadow-sm lg:h-[calc(100vh-3rem)] ${
          pestana === 'catalogo' ? 'p-4' : 'overflow-hidden'
        }`}
      >
        {pestana === 'catalogo' ? (
          <CatalogoPanel />
        ) : (
          // El visor ocupa la tarjeta entera, sin márgenes.
          <div className="h-full min-h-0 w-full flex-1">
            <Suspense fallback={<CargandoVisor />}>
              <VisorPieza
                figura={figuraActiva}
                medidasMm={medidasMm}
                imagenUrl={estado.material?.imagenUrl ?? null}
                cantidad={Number.isInteger(cantidad) && cantidad > 0 ? cantidad : undefined}
                suplementos={suplementosActivos}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

/** Mientras se descarga el motor 3D (solo la primera vez que se abre la pestaña). */
function CargandoVisor(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
      Cargando el visor 3D…
    </div>
  );
}
