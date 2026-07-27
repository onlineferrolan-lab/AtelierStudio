/**
 * Cliente del «API del catàleg de ceràmica» (studio.ferrolan.es/cataleg/, §6.13).
 *
 * Réplica de solo lectura de la sección CE del ERP (~55.000 artículos),
 * actualizada 2 veces al día (no es tiempo real). Contrato REAL entregado por
 * el responsable del ERP: esto sustituye el adaptador especulativo que había
 * antes (`fuenteErp.ts`, con nombres de campo supuestos).
 *
 * ⚠ REGLA INNEGOCIABLE del proveedor: la clave X-API-Key NUNCA debe llegar al
 * navegador (el catálogo lleva tarifas de venta confidenciales). Por eso este
 * módulo llama SIEMPRE a `/api/cataleg/` (mismo origen, sin clave): en
 * producción nginx añade la cabecera (`nginx.conf.template`), en desarrollo lo
 * hace el proxy de `vite.config.ts`. Este fichero no conoce ninguna clave.
 *
 * ⚠ Esta API NO tiene endpoint de listado/búsqueda por texto: solo consulta
 * por código (uno o varios, máx. 50). La búsqueda por texto sigue viviendo en
 * el catálogo de muestra (`fuenteMuestra.ts`) como índice local; ver
 * PENDIENTES.md — pedir al responsable del ERP un endpoint de listado/búsqueda
 * es la solución de fondo, de momento no implementada.
 */

import type { Material, Mm } from '../domain/types';
import { eurosACentimos } from '../domain/money';
import { cmAMm, mm2Am2 } from '../domain/units';

// Raíz absoluta a propósito, NO cuelga de BASE_URL: aunque la app viva bajo
// /atelier-studio/, el proxy del catálogo es una `location` de nivel servidor
// (/api/cataleg/ → /cataleg/), igual que hace el dev server de Vite.
const BASE_PROXY = '/api/cataleg/';
/** Límite documentado del endpoint ?accio=articles. */
const MAX_CODIGOS_POR_LLAMADA = 50;

/**
 * Registro de artículo tal como lo documenta el proveedor: 31 campos, claves
 * siempre en minúscula, campo sin valor = null (no se omite). Se tipa como
 * `unknown` por campo y se lee con los helpers de abajo: más robusto que
 * confiar en que el proveedor nunca cambie un tipo.
 */
export type ArticuloCatalegJson = Record<string, unknown>;

function campoTexto(json: ArticuloCatalegJson, campo: string): string | null {
  const valor = json[campo];
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

function campoNumero(json: ArticuloCatalegJson, campo: string): number | null {
  const valor = json[campo];
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string') {
    const n = Number(valor.trim().replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * URL de la imagen del artículo en PrestaShop (relación catálogo.codigo =
 * PrestaShop.reference). PROVISIONAL (§1.①, ya lo era en el adaptador
 * anterior): se asume `<base>/<referencia>.jpg`. Null si no hay base
 * configurada; el visor 3D muestra «textura no disponible» sin bloquear.
 */
export function urlImagenPrestashop(
  referencia: string,
  prestashopImgBase: string | null | undefined,
): string | null {
  const base = prestashopImgBase?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(referencia)}.jpg`;
}

/** Resultado de mapear un artículo: `Material` completo, o aviso de mides ausentes. */
export type ResultadoMapeoCataleg =
  | { readonly tipo: 'material'; readonly material: Material }
  | {
      readonly tipo: 'sin_medidas';
      readonly referencia: string;
      readonly descripcion: string;
      readonly precioM2Centimos: import('../domain/types').Centimos | null;
    };

/**
 * Formato «LARGOxANCHO» en la descripción, en cm: «45X45», «60 x 120»,
 * «7,2×45». Primer número = largo, segundo = ancho, tal como viene escrito
 * (decisión 2026-07-27, ver PENDIENTES.md §8). Null si no hay patrón.
 *
 * Los artículos sin fitxa web llegan con llarg/ample a null pero suelen
 * llevar el formato en la descripción: mejor eso que no poder cotizarlos.
 */
export function extraerFormatoDeDescripcion(
  descripcion: string,
): { readonly largoMm: Mm; readonly anchoMm: Mm } | null {
  const m = descripcion.match(/(\d{1,3}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,3}(?:[.,]\d+)?)/i);
  if (!m) return null;
  const largoCm = Number(m[1].replace(',', '.'));
  const anchoCm = Number(m[2].replace(',', '.'));
  if (!(largoCm > 0) || !(anchoCm > 0)) return null;
  return { largoMm: cmAMm(largoCm), anchoMm: cmAMm(anchoCm) };
}

/**
 * Piezas por caja calculadas: m² por caja (`encaixat`) ÷ m² por pieza,
 * redondeado al entero más próximo (regla de taller 2026-07-27:
 * «30x60 → 0,18 m²; 1,08 / 0,18 = 6 piezas»). Verificado contra datos
 * reales: para artículos con fitxa web reproduce `peces_caixa`
 * (1,08/0,18 = 6,00; 1,42/0,2025 = 7,01 → 7; 1,13/0,5625 = 2,01 → 2).
 * Se usa solo cuando `peces_caixa` llega null. Null si no se puede
 * calcular o saldría menos de 1 pieza.
 */
export function piezasPorCajaDesdeEncaixat(
  encaixatM2: number | null,
  formato: { readonly largoMm: Mm; readonly anchoMm: Mm },
): number | null {
  if (encaixatM2 === null || !(encaixatM2 > 0)) return null;
  const piezas = Math.round(encaixatM2 / mm2Am2(formato.largoMm, formato.anchoMm));
  return piezas >= 1 ? piezas : null;
}

/**
 * Adaptador cataleg → Material. Punto único de ajuste si el proveedor añade
 * campos (§ «Suport» del contrato: pedirlos es un cambio pequeño a ambos lados).
 *
 * Campos usados de los 31 documentados:
 *  - codigo → referencia, descrip → descripcion
 *  - tarp → precioM2Centimos (PROVISIONAL §6: se asume TARP = €/m²; tarc/tara/
 *    taradc existen pero su uso no está decidido, ver PENDIENTES.md)
 *  - llarg/ample (cm) → formato. PUEDEN ser null (~21.000 artículos sin fitxa
 *    web): entonces se intenta extraer el formato de la descripción
 *    (`extraerFormatoDeDescripcion`, decisión 2026-07-27). Solo si tampoco
 *    hay formato en el texto se devuelve 'sin_medidas' — nunca se inventa
 *    un formato; el llamador debe ofrecer Entrada manual para completarlas.
 *  - peces_caixa → piezasPorCaja; si llega null, se calcula como encaixat ÷
 *    m²/pieza (`piezasPorCajaDesdeEncaixat`, regla de taller 2026-07-27).
 *    encaixat (m² por caja) → m2PorCaja
 *  - idmarca es un id numérico, no un nombre: no hay campo de marca utilizable
 *    tal cual (marca queda null; ver PENDIENTES.md)
 *
 * Lanza si falta codigo o descrip (igual que antes: mejor fallar rápido que
 * cotizar con un artículo sin identificar).
 */
export function mapearArticuloCataleg(
  json: ArticuloCatalegJson,
  prestashopImgBase: string | null = null,
): ResultadoMapeoCataleg {
  const referencia = campoTexto(json, 'codigo');
  if (referencia === null) {
    throw new Error(`Artículo del catálogo sin 'codigo': ${JSON.stringify(json)}`);
  }
  const descripcion = campoTexto(json, 'descrip');
  if (descripcion === null) {
    throw new Error(`Artículo del catálogo '${referencia}' sin 'descrip'`);
  }

  const tarp = campoNumero(json, 'tarp');
  const precioM2Centimos = tarp === null ? null : eurosACentimos(tarp);

  const largoCm = campoNumero(json, 'llarg');
  const anchoCm = campoNumero(json, 'ample');
  // Mandan las mides del API; la descripción solo se usa cuando faltan.
  const formato =
    largoCm !== null && anchoCm !== null
      ? { largoMm: cmAMm(largoCm), anchoMm: cmAMm(anchoCm) }
      : extraerFormatoDeDescripcion(descripcion);
  if (formato === null) {
    // Sin mides en el API ni formato en la descripción: no se inventa nada,
    // se avisa para que la UI ofrezca Entrada manual.
    return { tipo: 'sin_medidas', referencia, descripcion, precioM2Centimos };
  }

  const encaixatM2 = campoNumero(json, 'encaixat');
  const material: Material = {
    referencia,
    descripcion,
    // idmarca es un id numérico sin nombre resuelto (ver PENDIENTES.md).
    marca: null,
    formato,
    precioM2Centimos,
    precioUnidadCentimos: null,
    piezasPorCaja:
      campoNumero(json, 'peces_caixa') ?? piezasPorCajaDesdeEncaixat(encaixatM2, formato),
    m2PorCaja: encaixatM2,
    imagenUrl: urlImagenPrestashop(referencia, prestashopImgBase),
    esManual: false,
  };
  return { tipo: 'material', material };
}

// ---------------------------------------------------------------------------
// Llamadas HTTP (siempre vía /api/cataleg/, sin clave)
// ---------------------------------------------------------------------------

export type ResultadoArticuloCataleg =
  | { readonly ok: true; readonly resultado: ResultadoMapeoCataleg }
  | { readonly ok: false; readonly error: string };

async function mensajeDeRespuestaNoOk(res: Response): Promise<string> {
  if (res.status === 429) {
    const espera = res.headers.get('Retry-After') ?? '60';
    return `Límite de peticiones al catálogo alcanzado; reintenta en ${espera} s.`;
  }
  if (res.status === 401) {
    return 'El catálogo ha rechazado la clave de acceso (401): avisa al responsable del ERP.';
  }
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) return json.error;
  } catch {
    // Respuesta sin JSON: se usa el mensaje genérico de abajo.
  }
  return `Error del catálogo (${res.status} ${res.statusText})`;
}

/** Un artículo por código (`?accio=article&codi=...`). */
export async function obtenerArticuloCataleg(
  codigo: string,
  prestashopImgBase: string | null = null,
): Promise<ResultadoArticuloCataleg> {
  let res: Response;
  try {
    res = await fetch(`${BASE_PROXY}?accio=article&codi=${encodeURIComponent(codigo)}`);
  } catch {
    return { ok: false, error: 'No se pudo conectar con el catálogo de cerámica.' };
  }
  if (res.status === 404) return { ok: false, error: 'no_trobat' };
  if (!res.ok) return { ok: false, error: await mensajeDeRespuestaNoOk(res) };

  const json = (await res.json()) as { ok: boolean; article?: ArticuloCatalegJson; error?: string };
  if (!json.ok || !json.article) return { ok: false, error: json.error ?? 'no_trobat' };
  return { ok: true, resultado: mapearArticuloCataleg(json.article, prestashopImgBase) };
}

export interface ResultadoArticulosCataleg {
  readonly encontrados: ReadonlyMap<string, ResultadoMapeoCataleg>;
  readonly noEncontrados: readonly string[];
}

/**
 * Varios artículos por código (`?accio=articles&codis=...`), en tandas de
 * como máximo 50 (límite documentado del endpoint).
 */
export async function obtenerArticulosCataleg(
  codigos: readonly string[],
  prestashopImgBase: string | null = null,
): Promise<ResultadoArticulosCataleg> {
  const encontrados = new Map<string, ResultadoMapeoCataleg>();
  const noEncontrados: string[] = [];

  for (let i = 0; i < codigos.length; i += MAX_CODIGOS_POR_LLAMADA) {
    const tanda = codigos.slice(i, i + MAX_CODIGOS_POR_LLAMADA);
    const res = await fetch(`${BASE_PROXY}?accio=articles&codis=${tanda.map(encodeURIComponent).join(',')}`);
    if (!res.ok) {
      throw new Error(await mensajeDeRespuestaNoOk(res));
    }
    const json = (await res.json()) as {
      ok: boolean;
      articles?: ArticuloCatalegJson[];
      no_trobats?: string[];
      error?: string;
    };
    if (!json.ok) throw new Error(json.error ?? 'Respuesta inesperada del catálogo');
    for (const registro of json.articles ?? []) {
      const mapeado = mapearArticuloCataleg(registro, prestashopImgBase);
      const referencia = mapeado.tipo === 'material' ? mapeado.material.referencia : mapeado.referencia;
      encontrados.set(referencia, mapeado);
    }
    noEncontrados.push(...(json.no_trobats ?? []));
  }

  return { encontrados, noEncontrados };
}

export interface SaludCataleg {
  readonly ok: boolean;
  readonly articulos: number;
  readonly actualizado: string;
}

/** `?accio=salut`: sin clave, sin tarifas. Para monitoratge y «datos del <fecha>». */
export async function consultarSaludCataleg(): Promise<SaludCataleg> {
  const res = await fetch(`${BASE_PROXY}?accio=salut`);
  if (!res.ok) throw new Error(await mensajeDeRespuestaNoOk(res));
  const json = (await res.json()) as { ok: boolean; articles: number; actualitzat: string };
  return { ok: json.ok, articulos: json.articles, actualizado: json.actualitzat };
}
