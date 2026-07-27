/**
 * Estado global de la cotización (una sola pieza configurada por orden, §1).
 *
 * Los campos de entrada se guardan como TEXTO CRUDO para validar con mensajes
 * concretos (§1.③); la conversión a mm/céntimos pasa por el motor.
 */

import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { Configuracion } from '../../domain/config';
import type { EntradaCotizacion, Material, Mm, OrigenMaterial, SalidaMotor } from '../../domain/types';
import { eurosACentimos } from '../../domain/money';
import { calcularCotizacion, figuraPorId, validarMedidasCrudas } from '../../domain/engine';

export interface EstadoAtelier {
  readonly material: Material | null;
  readonly origen: OrigenMaterial;
  readonly figuraId: string | null;
  /** Medidas crudas en cm, por id de medida de la figura. */
  readonly medidas: Readonly<Record<string, string>>;
  readonly cantidad: string;
  readonly suplementos: Readonly<Record<string, boolean>>;
  readonly pintado: boolean;
  /** Precio de material editado por el comercial, en € (texto). '' = usar tarifa. */
  readonly precioMaterialEditadoEuros: string;
  /** % de merma (texto). Se inicializa con el valor por defecto de configuración. */
  readonly mermaPorcentaje: string;
}

export type AccionAtelier =
  | { tipo: 'seleccionarMaterial'; material: Material | null }
  | { tipo: 'cambiarOrigen'; origen: OrigenMaterial }
  | { tipo: 'seleccionarFigura'; figuraId: string | null }
  | { tipo: 'cambiarMedida'; medida: string; valor: string }
  | { tipo: 'cambiarCantidad'; cantidad: string }
  | { tipo: 'alternarSuplemento'; suplemento: string; activo: boolean }
  | { tipo: 'cambiarPintado'; pintado: boolean }
  | { tipo: 'cambiarPrecioMaterialEditado'; euros: string }
  | { tipo: 'cambiarMerma'; porcentaje: string }
  | { tipo: 'reiniciar'; mermaPorcentajeDefecto: number };

export function estadoInicial(mermaPorcentajeDefecto: number): EstadoAtelier {
  return {
    material: null,
    origen: 'stock',
    figuraId: null,
    medidas: {},
    cantidad: '1',
    suplementos: {},
    pintado: false,
    precioMaterialEditadoEuros: '',
    mermaPorcentaje: String(mermaPorcentajeDefecto),
  };
}

function reductor(estado: EstadoAtelier, accion: AccionAtelier): EstadoAtelier {
  switch (accion.tipo) {
    case 'seleccionarMaterial':
      return { ...estado, material: accion.material };
    case 'cambiarOrigen':
      return { ...estado, origen: accion.origen };
    case 'seleccionarFigura':
      // Cambiar de figura reinicia medidas y suplementos: no son transferibles.
      return {
        ...estado,
        figuraId: accion.figuraId,
        medidas: {},
        suplementos: {},
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
      };
    case 'cambiarPintado':
      return { ...estado, pintado: accion.pintado };
    case 'cambiarPrecioMaterialEditado':
      return { ...estado, precioMaterialEditadoEuros: accion.euros };
    case 'cambiarMerma':
      return { ...estado, mermaPorcentaje: accion.porcentaje };
    case 'reiniciar':
      return estadoInicial(accion.mermaPorcentajeDefecto);
  }
}

interface ContextoAtelier {
  estado: EstadoAtelier;
  dispatch: React.Dispatch<AccionAtelier>;
}

const Contexto = createContext<ContextoAtelier | null>(null);

export function ProveedorAtelier({
  config,
  children,
}: {
  config: Configuracion;
  children: ReactNode;
}): JSX.Element {
  const [estado, dispatch] = useReducer(reductor, config.parametros.mermaPorcentajeDefecto, estadoInicial);
  const valor = useMemo(() => ({ estado, dispatch }), [estado]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAtelier(): ContextoAtelier {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useAtelier debe usarse dentro de <ProveedorAtelier>');
  return ctx;
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

  const precioEditadoTxt = estado.precioMaterialEditadoEuros.trim().replace(',', '.');
  const precioMaterialEditado =
    precioEditadoTxt === '' ? null : eurosACentimos(Number.parseFloat(precioEditadoTxt));

  const mermaTxt = estado.mermaPorcentaje.trim().replace(',', '.');
  const mermaPorcentaje = mermaTxt === '' ? config.parametros.mermaPorcentajeDefecto : Number.parseFloat(mermaTxt);

  return {
    medidasMm: validacion.medidasMm,
    entrada: {
      material,
      origen: estado.origen,
      figuraId,
      medidasMm: validacion.medidasMm,
      cantidad,
      suplementos: Object.entries(estado.suplementos)
        .filter(([, activo]) => activo)
        .map(([id]) => id),
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
