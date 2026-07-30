/**
 * Paso ① Material (§1.①).
 *
 * - Con material seleccionado: tarjeta-resumen (foto, descripción, referencia,
 *   marca, formato, datos de caja —piezas y m²— y precio; insignia MANUAL si
 *   es de entrada manual) con acciones «Cambiar» (abre la pestaña Catálogo
 *   del panel derecho) y «Quitar».
 * - Sin material: botón grande «Seleccionar del catálogo».
 * - Subsección plegable «Entrada manual» para cerámica fuera de ERP/PrestaShop.
 *
 * Ya NO hay selector de origen (stock/pedido): desde 2026-07-30 todo se factura
 * por cajas completas, así que el origen no cambiaba ningún importe y sobraba.
 */

import type { Material } from '../../domain/types';
import { useAtelier } from '../state/quote-state';
import { usePanelDerecho } from '../shell/panel';
import { usePasoCompletado, usePasos } from '../state/pasos-context';
import { Boton, Insignia, PasoCard } from '../components/primitivas';
import { EntradaManual } from './EntradaManual';
import { ImagenMaterial } from './ImagenMaterial';
import { formatoMaterialTexto, cajaMaterialTexto, precioMaterialTexto } from './materialUtil';

// ---------------------------------------------------------------------------
// Tarjeta-resumen del material seleccionado
// ---------------------------------------------------------------------------

function TarjetaResumen({
  material,
  alCambiar,
  alQuitar,
}: {
  material: Material;
  alCambiar: () => void;
  alQuitar: () => void;
}): JSX.Element {
  return (
    <div className="flex gap-3 rounded-lg border border-marca/40 bg-marca-claro/40 p-3">
      <ImagenMaterial material={material} className="h-20 w-20 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="truncate">{material.descripcion}</span>
          {material.esManual ? <Insignia tono="manual">Manual</Insignia> : null}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Ref. {material.referencia}
          {material.marca ? ` · ${material.marca}` : ''}
        </p>
        <p className="text-xs text-slate-500">Formato: {formatoMaterialTexto(material)}</p>
        {cajaMaterialTexto(material) ? (
          <p className="text-xs text-slate-500">Caja: {cajaMaterialTexto(material)}</p>
        ) : null}
        <p className="mt-0.5 text-sm font-semibold text-marca">{precioMaterialTexto(material)}</p>
        <div className="mt-2 flex gap-2">
          <Boton variante="secundario" onClick={alCambiar}>
            Cambiar
          </Boton>
          <Boton variante="secundario" onClick={alQuitar}>
            Quitar
          </Boton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paso
// ---------------------------------------------------------------------------

export function PasoMaterial(): JSX.Element {
  const { estado, dispatch } = useAtelier();
  const panel = usePanelDerecho();
  const pasos = usePasos();
  const material = estado.material;
  usePasoCompletado(1, material !== null);

  return (
    <PasoCard numero={1} titulo="Material" abierto={pasos.estado[1] ?? false} alAlternar={() => pasos.alternar(1)}>
      {material ? (
        <TarjetaResumen
          material={material}
          alCambiar={panel.abrirCatalogo}
          alQuitar={() => dispatch({ tipo: 'seleccionarMaterial', material: null })}
        />
      ) : (
        <Boton onClick={panel.abrirCatalogo} className="w-full py-3 text-base">
          Seleccionar del catálogo
        </Boton>
      )}

      <EntradaManual alCrear={(m) => dispatch({ tipo: 'seleccionarMaterial', material: m })} />
    </PasoCard>
  );
}
