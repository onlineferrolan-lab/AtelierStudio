/**
 * Layout principal de Atelier Studio, fiel a Top Studio (§1):
 *
 *  - Columna izquierda (~420-480 px) con los pasos ①-④ y, debajo, el bloque
 *    COTIZACIÓN siempre visible.
 *  - Panel derecho con pestañas Catálogo | Visor 3D (primitiva `Pestanas` +
 *    estado de `ProveedorPanel`): la pestaña Catálogo renderiza
 *    `<CatalogoPanel/>` y la pestaña Visor 3D renderiza `<VisorPieza/>` con la
 *    figura activa, las medidas validadas en mm y la textura del material.
 *  - Escritorio primero; en pantallas < lg las columnas se apilan.
 */

import { figuraPorId } from '../../domain/engine';
import { VisorPieza } from '../../viewer/VisorPieza';
import { Pestanas } from '../components/primitivas';
import { useConfig } from '../state/config-context';
import { useAtelier, useMedidasValidadas } from '../state/quote-state';
import { CatalogoPanel } from '../steps/CatalogoPanel';
import { PasoFigura } from '../steps/PasoFigura';
import { PasoMaterial } from '../steps/PasoMaterial';
import { PasoMedidas } from '../steps/PasoMedidas';
import { PasoSuplementos } from '../steps/PasoSuplementos';
import { Cabecera } from './cabecera';
import { PanelCotizacion } from './cotizacion';
import { usePanelDerecho, type PestanaPanel } from './panel';

const PESTANAS: readonly { id: PestanaPanel; etiqueta: string }[] = [
  { id: 'catalogo', etiqueta: 'Catálogo' },
  { id: 'visor', etiqueta: 'Visor 3D' },
];

export function ShellAtelier(): JSX.Element {
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
            <PanelCotizacion />
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
            <VisorPieza
              figura={figuraActiva}
              medidasMm={medidasMm}
              imagenUrl={estado.material?.imagenUrl ?? null}
              cantidad={Number.isInteger(cantidad) && cantidad > 0 ? cantidad : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
