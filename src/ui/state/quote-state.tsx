/**
 * Estado global de la cotización (una sola pieza configurada por orden, §1).
 *
 * Los campos de entrada se guardan como TEXTO CRUDO para validar con mensajes
 * concretos (§1.③); la conversión a mm/céntimos pasa por el motor.
 */

import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { Configuracion } from '../../domain/config';
import type { EntradaCotizacion, Material, Mm, SalidaMotor } from '../../domain/types';
import { eurosACentimos } from '../../domain/money';
import {
  calcularCotizacion,
  figuraPorId,
  mermaSugeridaPorcentaje,
  validarMedidasCrudas,
} from '../../domain/engine';

export interface EstadoAtelier {
  readonly material: Material | null;
  readonly figuraId: string | null;
  /** Medidas crudas en cm, por id de medida de la figura. */
  readonly medidas: Readonly<Record<string, string>>;
  readonly cantidad: string;
  readonly suplementos: Readonly<Record<string, boolean>>;
  /**
   * Piezas a las que se aplica cada suplemento POR PIEZA (texto, como cantidad).
   * Hoy solo «Angular»: en un tramo de escalera solo rematan las de esquina, no
   * todas (2026-07-30). Los suplementos por cm no aparecen aquí.
   */
  readonly unidadesSuplemento: Readonly<Record<string, string>>;
  readonly pintado: boolean;
  /** Precio de material editado por el comercial, en € (texto). '' = usar tarifa. */
  readonly precioMaterialEditadoEuros: string;
  /**
   * % de merma escrito a mano por el comercial (texto). **'' = usar la sugerida**
   * por formato + figura (`mermaSugeridaPorcentaje`), igual que el precio del
   * material usa la tarifa cuando no se edita. Se guarda la edición, no el valor
   * resuelto, para que al cambiar de material o de figura la sugerencia se
   * recalcule sola mientras nadie la haya tocado.
   */
  readonly mermaEditadaPorcentaje: string;
  /**
   * Comentarios libres del comercial para taller (indicaciones de corte, avisos
   * de obra…). Salen tal cual en la orden de trabajo; no tocan el cálculo.
   */
  readonly comentarios: string;
}

export type AccionAtelier =
  | { tipo: 'seleccionarMaterial'; material: Material | null }
  | { tipo: 'seleccionarFigura'; figuraId: string | null }
  | { tipo: 'cambiarMedida'; medida: string; valor: string }
  | { tipo: 'cambiarCantidad'; cantidad: string }
  | { tipo: 'alternarSuplemento'; suplemento: string; activo: boolean }
  | { tipo: 'cambiarUnidadesSuplemento'; suplemento: string; unidades: string }
  | { tipo: 'cambiarPintado'; pintado: boolean }
  | { tipo: 'cambiarPrecioMaterialEditado'; euros: string }
  | { tipo: 'cambiarMerma'; porcentaje: string }
  | { tipo: 'cambiarComentarios'; comentarios: string }
  | { tipo: 'reiniciar' };

export function estadoInicial(): EstadoAtelier {
  return {
    material: null,
    figuraId: null,
    medidas: {},
    cantidad: '1',
    suplementos: {},
    unidadesSuplemento: {},
    pintado: false,
    precioMaterialEditadoEuros: '',
    mermaEditadaPorcentaje: '',
    comentarios: '',
  };
}

function reductor(estado: EstadoAtelier, accion: AccionAtelier): EstadoAtelier {
  switch (accion.tipo) {
    case 'seleccionarMaterial':
      return { ...estado, material: accion.material };
    case 'seleccionarFigura':
      // Cambiar de figura reinicia medidas y suplementos: no son transferibles.
      return {
        ...estado,
        figuraId: accion.figuraId,
        medidas: {},
        suplementos: {},
        unidadesSuplemento: {},
        pintado: false,
      };
    case 'cambiarMedida':
      return { ...estado, medidas: { ...estado.medidas, [accion.medida]: accion.valor } };
    case 'cambiarCantidad':
      return { ...estado, cantidad: accion.cantidad };
    case 'alternarSuplemento':
      return {
        ...estado,
        suplementos: { ...estado.suplementos, [accion.suplemento]: accion.activo },
        // Al activarlo se propone UNA pieza; el comercial ajusta cuántas.
        unidadesSuplemento: {
          ...estado.unidadesSuplemento,
          [accion.suplemento]: accion.activo
            ? (estado.unidadesSuplemento[accion.suplemento] ?? '1')
            : '',
        },
      };
    case 'cambiarUnidadesSuplemento':
      return {
        ...estado,
        unidadesSuplemento: {
          ...estado.unidadesSuplemento,
          [accion.suplemento]: accion.unidades,
        },
      };
    case 'cambiarPintado':
      return { ...estado, pintado: accion.pintado };
    case 'cambiarPrecioMaterialEditado':
      return { ...estado, precioMaterialEditadoEuros: accion.euros };
    case 'cambiarMerma':
      return { ...estado, mermaEditadaPorcentaje: accion.porcentaje };
    case 'cambiarComentarios':
      // Son de la orden, no de la pieza: cambiar de figura NO los borra.
      return { ...estado, comentarios: accion.comentarios };
    case 'reiniciar':
      return estadoInicial();
  }
}

interface ContextoAtelier {
  estado: EstadoAtelier;
  dispatch: React.Dispatch<AccionAtelier>;
}

const Contexto = createContext<ContextoAtelier | null>(null);

/**
 * Ya no recibe `config`: el estado inicial no depende de ella desde que la merma
 * por defecto se calcula a partir del formato del material (`merma.ts`), y no de
 * un valor suelto de configuración.
 */
export function ProveedorAtelier({ children }: { children: ReactNode }): JSX.Element {
  const [estado, dispatch] = useReducer(reductor, undefined, estadoInicial);
  const valor = useMemo(() => ({ estado, dispatch }), [estado]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAtelier(): ContextoAtelier {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAtelier debe usarse dentro de <ProveedorAtelier>');
  return ctx;
}

/**
 * Piezas a las que se aplica un suplemento por pieza. El texto vacío o no
 * numérico se deja pasar tal cual (NaN) para que sea el motor quien produzca el
 * mensaje de error, igual que con la cantidad: la validación vive en un sitio.
 */
function unidadesDeSuplemento(estado: EstadoAtelier, id: string): number {
  const txt = (estado.unidadesSuplemento[id] ?? '').trim();
  return txt === '' ? Number.NaN : Number.parseInt(txt, 10);
}

/**
 * Construye la entrada del motor a partir del estado crudo.
 * Devuelve null cuando faltan datos básicos (material, figura, cantidad válida).
 */
export function construirEntrada(
  estado: EstadoAtelier,
  config: Configuracion,
): { entrada: EntradaCotizacion; medidasMm: Record<string, import('../../domain/types').Mm> } | SalidaMotor | null {
  const { material, figuraId } = estado;
  if (!material || !figuraId) return null;
  const figura = figuraPorId(config, figuraId);
  if (!figura || figura.estado !== 'activa') return null;

  const cantidad = Number.parseInt(estado.cantidad, 10);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return {
      ok: false,
      errores: [{ paso: 'medidas', medida: 'cantidad', mensaje: 'La cantidad debe ser un número entero mayor que 0.' }],
    };
  }

  const validacion = validarMedidasCrudas(figura, estado.medidas);
  if (!validacion.ok) return { ok: false, errores: validacion.errores };

  const suplementosActivos = Object.entries(estado.suplementos)
    .filter(([, activo]) => activo)
    .map(([id]) => id);

  const precioEditadoTxt = estado.precioMaterialEditadoEuros.trim().replace(',', '.');
  const precioMaterialEditado =
    precioEditadoTxt === '' ? null : eurosACentimos(Number.parseFloat(precioEditadoTxt));

  // Sin edición manual se usa la sugerida por formato + figura; con ella, la del
  // comercial. Un texto no numérico se deja pasar (NaN) para que el error salga
  // del motor, como con la cantidad.
  const mermaTxt = estado.mermaEditadaPorcentaje.trim().replace(',', '.');
  const mermaPorcentaje =
    mermaTxt === ''
      ? mermaSugeridaPorcentaje(material.formato, figuraId, config)
      : Number.parseFloat(mermaTxt);

  return {
    medidasMm: validacion.medidasMm,
    entrada: {
      material,
      figuraId,
      medidasMm: validacion.medidasMm,
      cantidad,
      suplementos: suplementosActivos,
      unidadesSuplemento: Object.fromEntries(
        suplementosActivos.map((id) => [id, unidadesDeSuplemento(estado, id)]),
      ),
      pintado: estado.pintado,
      precioMaterialEditado,
      mermaPorcentaje,
    },
  };
}

/** Ejecuta el motor sobre el estado actual (null = aún no hay datos suficientes). */
export function useSalidaMotor(config: Configuracion): SalidaMotor | null {
  const { estado } = useAtelier();
  return useMemo(() => {
    const construida = construirEntrada(estado, config);
    if (!construida) return null;
    if ('ok' in construida) return construida;
    return calcularCotizacion(construida.entrada, config);
  }, [estado, config]);
}

/**
 * true si el comercial ha tecleado algo en el paso ③ desde que se eligió la
 * figura activa (el reductor vacía `medidas` en `seleccionarFigura`). Sirve
 * para no enseñar errores de "medida obligatoria" antes de que haya empezado
 * a rellenar nada — tanto en `PasoMedidas` como en el resumen de `PanelCotizacion`.
 */
export function medidasTecleadas(estado: EstadoAtelier): boolean {
  return Object.keys(estado.medidas).length > 0;
}

/**
 * Medidas validadas en mm para el visor 3D (contrato de `VisorPieza`:
 * null mientras estén incompletas o sean inválidas).
 */
export function useMedidasValidadas(
  estado: EstadoAtelier,
  config: Configuracion,
): Record<string, Mm> | null {
  return useMemo(() => {
    const construida = construirEntrada(estado, config);
    if (!construida || 'ok' in construida) return null;
    return construida.medidasMm;
  }, [estado, config]);
}
