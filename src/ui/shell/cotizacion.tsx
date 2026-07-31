/**
 * Bloque COTIZACIÓN (§1), siempre visible bajo los pasos de la columna
 * izquierda.
 *
 *  - Desglose: Material / Manipulación (con suplementos) / Arranque de máquina /
 *    Total sin IVA / IVA / Total con IVA, con `formatearEuros`. Las líneas
 *    quedan a «—» mientras el motor no devuelva resultado (faltan datos o hay
 *    errores de validación).
 *  - Datos logísticos cuando hay resultado: baldosas necesarias, baldosas con
 *    merma, piezas/cajas facturadas y m² facturados.
 *  - Precio del material editable por el comercial en €, con la tarifa original
 *    siempre visible junto al editado y botón de restablecer (§1 «Cotización»).
 *  - % de merma visible para el comercial (§4); editable solo si
 *    `parametros.mermaEditable`. PROVISIONAL (§6.9/§6.10): valor y editabilidad
 *    pendientes de taller/dirección — se marca en el tooltip de ayuda, sin
 *    insignia (decisión de UI: no añadir ruido visual junto al campo).
 *  - Errores de validación del motor listados con sus mensajes concretos. Los
 *    del paso ③ (medidas) se ocultan hasta que el comercial ha tecleado algo
 *    ahí (`medidasTecleadas`, mismo criterio que `PasoMedidas`): recién
 *    elegida la figura, "vacío" no es todavía un error que enseñar.
 *  - «Generar PDF»: construye `DatosOrdenTrabajo` (construirEntrada + resultado
 *    + la sección de la pieza para el croquis) y llama a
 *    `generarPdfOrdenTrabajo`; cualquier error se muestra en pantalla sin
 *    romper la app.
 */

import { useState } from 'react';
import { figuraPorId, mermaSugeridaPorcentaje } from '../../domain/engine';
import { formatearEuros } from '../../domain/money';
import type { Centimos } from '../../domain/types';
import { construirSeccion, rasgosDeSuplementos } from '../../piezas/piezaDeFigura';
import { Boton, Campo, EntradaNumero } from '../components/primitivas';
import { useConfig } from '../state/config-context';
import { ParametrosAvanzados } from './ParametrosAvanzados';
import { construirEntrada, medidasTecleadas, useAtelier, useSalidaMotor } from '../state/quote-state';

// Filtros de tecleo: solo números positivos con hasta 2 decimales. Sin ellos,
// un texto no parseable llegaría a `construirEntrada` como NaN y rompería la
// conversión a céntimos (money.ts exige enteros).
const RE_IMPORTE_EUROS = /^\d{0,7}([.,]\d{0,2})?$/;
const RE_PORCENTAJE = /^\d{0,3}([.,]\d{0,2})?$/;

/** La merma sugerida puede caer en decimales (16,67 %); se muestran hasta dos. */
const FORMATO_MERMA = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });

function formatearM2(m2: number): string {
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m2)} m²`;
}

function FilaImporte({
  concepto,
  valor,
  destacado = false,
}: {
  concepto: string;
  valor: Centimos | null;
  destacado?: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        destacado ? 'border-t border-slate-200 pt-2 text-base font-bold text-slate-900' : 'text-sm'
      }`}
    >
      <span className={destacado ? '' : 'text-slate-600'}>{concepto}</span>
      <span className={destacado ? '' : 'font-medium text-slate-800'}>
        {valor === null ? '—' : formatearEuros(valor)}
      </span>
    </div>
  );
}

function DatoLogistico({ etiqueta, valor }: { etiqueta: string; valor: string }): JSX.Element {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="font-semibold text-slate-800">{valor}</dd>
    </div>
  );
}

export function PanelCotizacion(): JSX.Element {
  const config = useConfig();
  const { estado, dispatch } = useAtelier();
  const salida = useSalidaMotor(config);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const resultado = salida !== null && salida.ok ? salida.resultado : null;
  const medidasIniciadas = medidasTecleadas(estado);
  // «Cantidad» nunca empieza vacía: su error se enseña siempre. Las medidas
  // de la figura sí empiezan vacías al elegirla (mismo criterio que PasoMedidas).
  const erroresMotor =
    salida !== null && !salida.ok
      ? salida.errores.filter(
          (e) => e.paso !== 'medidas' || e.medida === 'cantidad' || medidasIniciadas,
        )
      : [];
  const desglose = resultado?.desglose ?? null;

  // Tarifa original visible junto al precio editado (§1). Con resultado manda
  // `precioMaterialOriginal` del motor; sin él, la tarifa del propio material
  // (TARP en €/m², o €/unidad en material manual).
  const material = estado.material;
  const unidadPrecio = material !== null && material.precioM2Centimos === null ? '€/unidad' : '€/m²';
  const tarifaOriginalCentimos =
    resultado?.precioMaterialOriginal ??
    material?.precioM2Centimos ??
    material?.precioUnidadCentimos ??
    null;
  const tarifaOriginalTexto =
    tarifaOriginalCentimos === null ? null : `${formatearEuros(tarifaOriginalCentimos)}${unidadPrecio === '€/m²' ? '/m²' : '/unidad'}`;

  // Merma sugerida por el formato de la baldosa (+ extra de figura numerada).
  // Sin material aún no hay formato del que deducirla, así que no se muestra.
  const mermaSugeridaTxt =
    material === null
      ? null
      : FORMATO_MERMA.format(mermaSugeridaPorcentaje(material.formato, estado.figuraId, config));

  function alCambiarPrecio(valor: string): void {
    if (RE_IMPORTE_EUROS.test(valor)) {
      dispatch({ tipo: 'cambiarPrecioMaterialEditado', euros: valor });
    }
  }

  function alCambiarMerma(valor: string): void {
    if (RE_PORCENTAJE.test(valor)) {
      dispatch({ tipo: 'cambiarMerma', porcentaje: valor });
    }
  }

  function alReiniciar(): void {
    setErrorPdf(null);
    dispatch({ tipo: 'reiniciar' });
  }

  async function alGenerarPdf(): Promise<void> {
    setErrorPdf(null);
    if (!salida || !salida.ok) return; // botón deshabilitado; guarda defensiva

    // construirEntrada es determinista: reproduce la entrada que produjo el
    // resultado. El motor nunca lanza por entrada de usuario (SalidaMotor).
    const construida = construirEntrada(estado, config);
    if (!construida || 'ok' in construida) {
      setErrorPdf('No se puede generar el PDF: faltan datos o la configuración tiene errores.');
      return;
    }
    const figura = figuraPorId(config, construida.entrada.figuraId);
    if (!figura) {
      setErrorPdf('No se puede generar el PDF: la figura seleccionada no está en la configuración.');
      return;
    }

    setGenerandoPdf(true);
    try {
      // jsPDF (y sus dependencias) pesan ~580 kB y solo hacen falta al pulsar
      // este botón: se cargan aquí, no en la primera pantalla.
      const { generarPdfOrdenTrabajo } = await import('../../pdf/ordenTrabajo');
      await generarPdfOrdenTrabajo({
        material: construida.entrada.material,
        figura,
        medidasMm: construida.medidasMm,
        cantidad: construida.entrada.cantidad,
        suplementosActivos: construida.entrada.suplementos,
        unidadesSuplemento: construida.entrada.unidadesSuplemento,
        precioMaterialEditadoEuros: estado.precioMaterialEditadoEuros,
        mermaPorcentaje: construida.entrada.mermaPorcentaje,
        comentarios: estado.comentarios,
        resultado: salida.resultado,
        config,
        fecha: new Date(),
        // Croquis de la pieza: la MISMA sección que extruye el visor 3D, para
        // que el dibujo del taller no pueda discrepar del modelo. Con los
        // suplementos activos, para que el croquis enseñe dónde van las ranuras.
        seccion: construirSeccion(
          figura,
          construida.medidasMm,
          undefined,
          rasgosDeSuplementos(construida.entrada.suplementos),
        ),
      });
    } catch (error: unknown) {
      setErrorPdf(error instanceof Error ? error.message : 'Error desconocido al generar el PDF.');
    } finally {
      setGenerandoPdf(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Cotización">
      <header className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-base font-semibold uppercase tracking-wide text-slate-800">Cotización</h2>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        {resultado === null && erroresMotor.length === 0 ? (
          <p className="text-sm text-slate-500">
            La cotización aparecerá al completar los pasos ① Material, ② Figura y ③ Medidas.
          </p>
        ) : null}

        {resultado !== null ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-slate-50 p-3 text-sm">
            <DatoLogistico
              etiqueta="Piezas por baldosa"
              valor={String(resultado.ocupacion.piezasPorBaldosa)}
            />
            <DatoLogistico etiqueta="Baldosas necesarias" valor={String(resultado.baldosasNecesarias)} />
            <DatoLogistico etiqueta="Baldosas con merma" valor={String(resultado.baldosasConMerma)} />
            <DatoLogistico etiqueta="Piezas facturadas" valor={String(resultado.unidadesFacturadas)} />
            {resultado.cajasFacturadas > 0 ? (
              <DatoLogistico
                etiqueta="Cajas facturadas (pedido)"
                valor={String(resultado.cajasFacturadas)}
              />
            ) : null}
            <DatoLogistico etiqueta="m² facturados" valor={formatearM2(resultado.m2Facturados)} />
          </dl>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <FilaImporte concepto="Material" valor={desglose ? desglose.materialCentimos : null} />
          <FilaImporte
            concepto="Manipulación (con suplementos)"
            valor={desglose ? desglose.manipulacionCentimos : null}
          />
          {resultado !== null && resultado.lineasManipulacion.length > 0 ? (
            <ul className="ml-3 flex flex-col gap-0.5 border-l border-slate-200 pl-3">
              {resultado.lineasManipulacion.map((linea, indice) => (
                <li key={`${linea.concepto}-${indice}`} className="flex justify-between gap-4 text-xs text-slate-500">
                  <span>{linea.concepto}</span>
                  <span>{formatearEuros(linea.centimos)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <FilaImporte concepto="Arranque de máquina" valor={desglose ? desglose.arranqueCentimos : null} />
          <FilaImporte concepto="Total sin IVA" valor={desglose ? desglose.totalSinIvaCentimos : null} />
          <FilaImporte
            concepto={`IVA (${config.parametros.ivaPorcentaje} %)`}
            valor={desglose ? desglose.ivaCentimos : null}
          />
          <FilaImporte concepto="Total con IVA" valor={desglose ? desglose.totalConIvaCentimos : null} destacado />
        </div>

        {material !== null ? (
          <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <Campo
              etiqueta={`Precio del material (${unidadPrecio})`}
              ayuda="Por defecto se aplica la tarifa del artículo; el comercial puede editarla. El valor original queda visible junto al editado."
            >
              <EntradaNumero
                valor={estado.precioMaterialEditadoEuros}
                alCambiar={alCambiarPrecio}
                placeholder={tarifaOriginalTexto ?? ''}
                aria-label="Precio del material editado, en euros"
              />
            </Campo>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Tarifa original:{' '}
                <strong className="text-slate-700">{tarifaOriginalTexto ?? 'sin tarifa'}</strong>
              </span>
              {estado.precioMaterialEditadoEuros !== '' ? (
                <Boton
                  variante="secundario"
                  onClick={() => dispatch({ tipo: 'cambiarPrecioMaterialEditado', euros: '' })}
                >
                  Restablecer a tarifa
                </Boton>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Campo
            etiqueta="Merma sobre baldosas (%)"
            ayuda="Porcentaje aplicado sobre las baldosas de origen, redondeando hacia arriba (§4). Se propone según el formato de la baldosa (lado mayor: 60 cm o menos → 10 %, 120 cm o más → 20 %, proporcional en medio) más el extra de las figuras numeradas. Puedes sobrescribirlo."
          >
            <EntradaNumero
              valor={estado.mermaEditadaPorcentaje}
              alCambiar={alCambiarMerma}
              disabled={!config.parametros.mermaEditable}
              placeholder={mermaSugeridaTxt ?? undefined}
              aria-label="Porcentaje de merma"
            />
          </Campo>
          {/* Igual que el precio del material: la sugerencia queda visible aunque
              se sobrescriba, para que se vea que la edición fue deliberada. */}
          {mermaSugeridaTxt !== null ? (
            <p className="text-xs text-slate-500">
              {estado.mermaEditadaPorcentaje.trim() === ''
                ? `Sugerida por el formato: ${mermaSugeridaTxt} %`
                : `Editada. Sugerida por el formato: ${mermaSugeridaTxt} %`}
            </p>
          ) : null}
          {!config.parametros.mermaEditable ? (
            <p className="text-xs text-slate-500">
              Edición desactivada en configuración (§6.10, pendiente de dirección).
            </p>
          ) : null}
        </div>

        <ParametrosAvanzados
          margenAplicado={resultado?.margen ?? null}
          faltaMargen={erroresMotor.some((e) => e.mensaje.includes('margen'))}
        />

        {erroresMotor.length > 0 ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="mb-1 text-sm font-semibold text-red-700">Revisa la configuración de la pieza:</p>
            <ul className="list-disc pl-5 text-sm text-red-700">
              {erroresMotor.map((error, indice) => (
                <li key={indice}>{error.mensaje}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <Boton onClick={() => void alGenerarPdf()} disabled={resultado === null || generandoPdf}>
            {generandoPdf ? 'Generando PDF…' : 'Generar PDF'}
          </Boton>
          <Boton variante="secundario" onClick={alReiniciar}>
            Reiniciar
          </Boton>
          {errorPdf !== null ? (
            <p role="alert" className="text-sm text-red-600">
              {errorPdf}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
