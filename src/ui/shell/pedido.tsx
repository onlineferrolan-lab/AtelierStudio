/**
 * Bloque PEDIDO: las piezas ya añadidas y lo que cuestan juntas.
 *
 * Está debajo de COTIZACIÓN, que sigue siendo el de la pieza que se configura
 * ahora mismo. La diferencia que hay que ver de un vistazo es la que justifica
 * todo esto: **las cajas son del artículo, no del corte**. Por eso el bloque de
 * material va agrupado por artículo y no por pieza, y por eso el ahorro frente a
 * pedir las piezas por separado se enseña en euros, no se deja adivinar.
 *
 * Con el carrito vacío el bloque no desaparece: explica para qué sirve. Si
 * estuviera oculto hasta tener una pieza dentro, nadie descubriría que existe.
 */

import { useState } from 'react';
import { figuraPorId } from '../../domain/engine';
import { formatearEuros } from '../../domain/money';
import type { Centimos, GrupoMaterialPedido } from '../../domain/types';
import { construirSeccion, rasgosDeSuplementos } from '../../piezas/piezaDeFigura';
import { Boton, Insignia } from '../components/primitivas';
import { useConfig } from '../state/config-context';
import { useAtelier, usePedido, type LineaCarrito } from '../state/quote-state';

const FORMATO_M2 = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function FilaImporte({
  concepto,
  valor,
  destacado = false,
}: {
  concepto: string;
  valor: Centimos;
  destacado?: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        destacado ? 'border-t border-slate-200 pt-2 text-base font-bold text-slate-900' : 'text-sm'
      }`}
    >
      <span className={destacado ? '' : 'text-slate-600'}>{concepto}</span>
      <span className={destacado ? '' : 'font-medium text-slate-800'}>{formatearEuros(valor)}</span>
    </div>
  );
}

export function PanelPedido(): JSX.Element {
  const config = useConfig();
  const { estado, dispatch } = useAtelier();
  const pedido = usePedido(config);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);

  const carrito = estado.carrito;
  const resultado = pedido !== null && pedido.salida.ok ? pedido.salida.resultado : null;
  const errores = pedido !== null && !pedido.salida.ok ? pedido.salida.errores : [];

  /** Nombre legible de la figura de una línea (o su id si la configuración cambió). */
  function nombreFigura(linea: LineaCarrito): string {
    return figuraPorId(config, linea.figuraId)?.nombre ?? linea.figuraId;
  }

  /** Las medidas tal como se escribieron, en una línea. */
  function medidasDeLinea(linea: LineaCarrito): string {
    const figura = figuraPorId(config, linea.figuraId);
    if (!figura) return '';
    return figura.medidas
      .map((campo) => linea.medidas[campo.id])
      .filter((v) => v !== undefined && v.trim() !== '')
      .join(' × ');
  }

  async function alGenerarPdf(): Promise<void> {
    setErrorPdf(null);
    if (pedido === null || !pedido.salida.ok) return; // botón deshabilitado; guarda defensiva

    setGenerandoPdf(true);
    try {
      // jsPDF pesa ~580 kB y solo hace falta al pulsar este botón.
      const { generarPdfOrdenPedido } = await import('../../pdf/ordenPedido');
      const piezas = pedido.entradas.map((construida, i) => {
        const linea = carrito[i];
        const figura = figuraPorId(config, construida.entrada.figuraId);
        if (!figura) throw new Error(`La figura «${construida.entrada.figuraId}» ya no existe.`);
        return {
          figura,
          material: construida.entrada.material,
          medidasMm: construida.medidasMm,
          cantidad: construida.entrada.cantidad,
          suplementosActivos: construida.entrada.suplementos,
          unidadesSuplemento: construida.entrada.unidadesSuplemento,
          precioMaterialEditadoEuros: linea.precioMaterialEditadoEuros,
          // El MISMO croquis que extruye el visor 3D, con los suplementos
          // activos, para que el dibujo del taller no discrepe del modelo.
          seccion: construirSeccion(
            figura,
            construida.medidasMm,
            undefined,
            rasgosDeSuplementos(construida.entrada.suplementos),
          ),
        };
      });
      await generarPdfOrdenPedido({
        piezas,
        resultado: pedido.salida.resultado,
        comentarios: estado.comentarios,
        config,
        fecha: new Date(),
      });
    } catch (error: unknown) {
      setErrorPdf(error instanceof Error ? error.message : 'Error desconocido al generar el PDF.');
    } finally {
      setGenerandoPdf(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Pedido">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold uppercase tracking-wide text-slate-800">Pedido</h2>
        {carrito.length > 0 ? (
          <Insignia tono="info">
            {carrito.length} {carrito.length === 1 ? 'pieza' : 'piezas'}
          </Insignia>
        ) : null}
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        {carrito.length === 0 ? (
          <p className="text-sm text-slate-500">
            Añade varias piezas al pedido para sacarlas en una sola orden de trabajo. Las que se
            corten del mismo artículo <strong className="font-semibold">comparten caja</strong>: se
            compra una vez el material en lugar de una tanda de cajas por cada corte.
          </p>
        ) : null}

        {carrito.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {carrito.map((linea, indice) => {
              const erroresLinea = errores.filter((e) => e.indiceLinea === indice);
              return (
                <li
                  key={linea.id}
                  className={`rounded-md border p-2.5 ${
                    erroresLinea.length > 0 ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                      {indice + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        {nombreFigura(linea)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {medidasDeLinea(linea)} cm · {linea.cantidad} ud. ·{' '}
                        {linea.material.descripcion}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <BotonMini
                        etiqueta="Editar"
                        onClick={() => dispatch({ tipo: 'editarLineaPedido', id: linea.id })}
                      />
                      <BotonMini
                        etiqueta="Duplicar"
                        onClick={() => dispatch({ tipo: 'duplicarLineaPedido', id: linea.id })}
                      />
                      <BotonMini
                        etiqueta="Quitar"
                        peligro
                        onClick={() => dispatch({ tipo: 'quitarDelPedido', id: linea.id })}
                      />
                    </div>
                  </div>
                  {erroresLinea.length > 0 ? (
                    <ul className="mt-1.5 list-disc pl-9 text-xs text-red-700">
                      {erroresLinea.map((e, i) => (
                        <li key={i}>{e.error.mensaje}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        {errores.some((e) => e.indiceLinea === null) ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
            <ul className="list-disc pl-5 text-sm text-red-700">
              {errores
                .filter((e) => e.indiceLinea === null)
                .map((e, i) => (
                  <li key={i}>{e.error.mensaje}</li>
                ))}
            </ul>
          </div>
        ) : null}

        {resultado !== null ? (
          <>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Material y cajas
              </h3>
              {resultado.grupos.map((grupo) => (
                <FilaGrupo key={grupo.clave} grupo={grupo} />
              ))}
              {resultado.cajasAhorradas > 0 ? (
                <p className="rounded-md border border-marca/30 bg-marca-claro px-3 py-2 text-sm text-marca">
                  Compartiendo caja entre cortes se ahorran{' '}
                  <strong>
                    {resultado.cajasAhorradas}{' '}
                    {resultado.cajasAhorradas === 1 ? 'caja' : 'cajas'}
                  </strong>
                  : {formatearEuros(resultado.ahorroCentimos)} menos que pidiendo las piezas por
                  separado.
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <FilaImporte concepto="Material" valor={resultado.desglose.materialCentimos} />
              <FilaImporte
                concepto="Manipulación (con suplementos)"
                valor={resultado.desglose.manipulacionCentimos}
              />
              <FilaImporte
                concepto={`Arranque de máquina (${resultado.grupos.length} ${
                  resultado.grupos.length === 1 ? 'material' : 'materiales'
                })`}
                valor={resultado.desglose.arranqueCentimos}
              />
              <FilaImporte concepto="Total sin IVA" valor={resultado.desglose.totalSinIvaCentimos} />
              <FilaImporte
                concepto={`IVA (${config.parametros.ivaPorcentaje} %)`}
                valor={resultado.desglose.ivaCentimos}
              />
              <FilaImporte
                concepto="Total con IVA"
                valor={resultado.desglose.totalConIvaCentimos}
                destacado
              />
            </div>
          </>
        ) : null}

        {carrito.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <Boton onClick={() => void alGenerarPdf()} disabled={resultado === null || generandoPdf}>
              {generandoPdf
                ? 'Generando PDF…'
                : `Generar PDF del pedido (${carrito.length} ${carrito.length === 1 ? 'pieza' : 'piezas'})`}
            </Boton>
            {confirmandoVaciar ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span>¿Vaciar el pedido entero?</span>
                <Boton
                  variante="secundario"
                  onClick={() => {
                    dispatch({ tipo: 'vaciarPedido' });
                    setConfirmandoVaciar(false);
                  }}
                >
                  Sí, vaciar
                </Boton>
                <Boton variante="secundario" onClick={() => setConfirmandoVaciar(false)}>
                  Cancelar
                </Boton>
              </div>
            ) : (
              <Boton variante="secundario" onClick={() => setConfirmandoVaciar(true)}>
                Vaciar pedido
              </Boton>
            )}
            {errorPdf !== null ? (
              <p role="alert" className="text-sm text-red-600">
                {errorPdf}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Una línea del bloque «Material y cajas»: el reparto de caja de un artículo. */
function FilaGrupo({ grupo }: { grupo: GrupoMaterialPedido }): JSX.Element {
  return (
    <div className="rounded-md bg-slate-50 p-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
          {grupo.material.descripcion}
        </span>
        <span className="shrink-0 text-sm font-semibold text-slate-800">
          {grupo.cajasFacturadas} {grupo.cajasFacturadas === 1 ? 'caja' : 'cajas'}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {grupo.baldosasConMerma} de {grupo.unidadesFacturadas} baldosas ·{' '}
        {FORMATO_M2.format(grupo.m2Facturados)} m² · piezas{' '}
        {grupo.indicesLinea.map((i) => `#${i + 1}`).join(', ')}
        {grupo.baldosasSobrantes > 0
          ? ` · ${grupo.baldosasSobrantes} ${
              grupo.baldosasSobrantes === 1 ? 'sobrante' : 'sobrantes'
            }`
          : ' · sin sobrante'}
      </p>
    </div>
  );
}

/** Botón de acción de una línea: pequeño, sin sombra, para no competir con «Generar PDF». */
function BotonMini({
  etiqueta,
  onClick,
  peligro = false,
}: {
  etiqueta: string;
  onClick: () => void;
  peligro?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 text-xs font-medium transition-colors ${
        peligro
          ? 'border-red-200 text-red-600 hover:bg-red-50'
          : 'border-slate-200 text-slate-600 hover:bg-slate-100'
      }`}
    >
      {etiqueta}
    </button>
  );
}
