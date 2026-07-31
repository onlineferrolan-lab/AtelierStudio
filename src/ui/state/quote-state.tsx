/**
 * Estado global de la cotización: la pieza que se está configurando ahora mismo
 * más el PEDIDO (carrito) de piezas ya añadidas.
 *
 * Los campos de entrada se guardan como TEXTO CRUDO para validar con mensajes
 * concretos (§1.③); la conversión a mm/céntimos pasa por el motor.
 *
 * El estado tiene dos niveles a propósito:
 *
 *  - `PiezaConfigurada` — lo que describe UNA pieza. Es exactamente lo que se
 *    guarda en cada línea del carrito, así que el editor y el carrito comparten
 *    forma y una sola función de conversión a entrada del motor.
 *  - Lo que es del PEDIDO y no de la pieza: el tipo de margen, los comentarios
 *    para taller y la lista de líneas. Cambiar de figura no los toca.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { Configuracion } from '../../domain/config';
import type {
  EntradaCotizacion,
  ErrorLineaPedido,
  Material,
  Mm,
  SalidaMotor,
  SalidaPedido,
  TipoMargen,
} from '../../domain/types';
import { eurosACentimos } from '../../domain/money';
import {
  calcularCotizacion,
  calcularPedido,
  figuraPorId,
  mermaSugeridaPorcentaje,
  validarMedidasCrudas,
  validarMedidasPorMetros,
  type ModoMedida,
} from '../../domain/engine';
import { guardarCarrito, leerCarrito } from './carrito-persistencia';

/** Todo lo que describe UNA pieza. Lo comparten el editor y las líneas del carrito. */
export interface PiezaConfigurada {
  readonly material: Material | null;
  readonly figuraId: string | null;
  /** Medidas crudas en cm, por id de medida de la figura. */
  readonly medidas: Readonly<Record<string, string>>;
  readonly cantidad: string;
  /**
   * Cómo se introduce el largo en las figuras que se venden por metro lineal
   * (rodapiés): tecleándolo ('largo') o deduciéndolo de los metros pedidos
   * ('metros'). En las demás figuras se ignora — solo tienen el modo 'largo'.
   */
  readonly modoMedida: ModoMedida;
  /** Metros totales pedidos (texto crudo, en m). Solo se usa en modo 'metros'. */
  readonly metrosTotales: string;
  readonly suplementos: Readonly<Record<string, boolean>>;
  /**
   * Piezas a las que se aplica cada suplemento POR PIEZA (texto, como cantidad).
   * Hoy solo «Angular»: en un tramo de escalera solo rematan las de esquina, no
   * todas (2026-07-30). Los suplementos por cm no aparecen aquí.
   */
  readonly unidadesSuplemento: Readonly<Record<string, string>>;
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
   * Margen escrito a mano (texto, en puntos porcentuales) para los artículos cuya
   * subfamilia no está en la tabla del ERP. '' = usar el de la tabla. Vive
   * SEPARADO del selector de tipo en la UI, no debajo de él.
   *
   * Es de la PIEZA y no del pedido porque depende del artículo: dos piezas de
   * materiales distintos pueden necesitar cada una el suyo.
   */
  readonly margenManualPorcentaje: string;
}

/**
 * Una pieza ya añadida al pedido. Material y figura dejan de ser opcionales: al
 * carrito solo se añade lo que está completo.
 */
export interface LineaCarrito extends PiezaConfigurada {
  /** Identidad estable de la línea, para quitarla o editarla sin depender del índice. */
  readonly id: string;
  readonly material: Material;
  readonly figuraId: string;
}

export interface EstadoAtelier extends PiezaConfigurada {
  /**
   * Margen comercial elegido en «Parámetros avanzados». Arranca en 'pvp'
   * (2026-07-31, indicación directa): es el más alto de los dos, así que por
   * defecto nunca se presupuesta por debajo del precio de público.
   *
   * Es del PEDIDO entero: un presupuesto no se hace medio a PVP y medio a
   * contratista.
   */
  readonly tipoMargen: TipoMargen;
  /**
   * Comentarios libres del comercial para taller (indicaciones de corte, avisos
   * de obra…). Salen tal cual en la orden de trabajo; no tocan el cálculo.
   */
  readonly comentarios: string;
  /**
   * PEDIDO: las piezas ya añadidas, en el orden en que se añadieron. Vacío = se
   * trabaja como siempre, con una sola pieza.
   */
  readonly carrito: readonly LineaCarrito[];
}

export type AccionAtelier =
  | { tipo: 'seleccionarMaterial'; material: Material | null }
  | { tipo: 'seleccionarFigura'; figuraId: string | null }
  | { tipo: 'cambiarMedida'; medida: string; valor: string }
  | { tipo: 'cambiarCantidad'; cantidad: string }
  | { tipo: 'cambiarModoMedida'; modo: ModoMedida }
  | { tipo: 'cambiarMetros'; metros: string }
  | { tipo: 'alternarSuplemento'; suplemento: string; activo: boolean }
  | { tipo: 'cambiarUnidadesSuplemento'; suplemento: string; unidades: string }
  | { tipo: 'cambiarPrecioMaterialEditado'; euros: string }
  | { tipo: 'cambiarMerma'; porcentaje: string }
  | { tipo: 'cambiarComentarios'; comentarios: string }
  | { tipo: 'cambiarTipoMargen'; tipoMargen: TipoMargen }
  | { tipo: 'cambiarMargenManual'; porcentaje: string }
  | { tipo: 'anadirAlPedido' }
  | { tipo: 'quitarDelPedido'; id: string }
  | { tipo: 'editarLineaPedido'; id: string }
  | { tipo: 'duplicarLineaPedido'; id: string }
  | { tipo: 'vaciarPedido' }
  | { tipo: 'reiniciar' };

/** Los campos de la pieza, sin lo que es del pedido. Un sitio, no dos listas. */
function piezaVacia(): PiezaConfigurada {
  return {
    material: null,
    figuraId: null,
    medidas: {},
    cantidad: '1',
    modoMedida: 'largo',
    metrosTotales: '',
    suplementos: {},
    unidadesSuplemento: {},
    precioMaterialEditadoEuros: '',
    mermaEditadaPorcentaje: '',
    margenManualPorcentaje: '',
  };
}

export function estadoInicial(): EstadoAtelier {
  return {
    ...piezaVacia(),
    tipoMargen: 'pvp',
    comentarios: '',
    carrito: [],
  };
}

/**
 * Copia solo los campos de la pieza de un estado o línea. Se escribe campo a
 * campo (y no con un spread) para que añadir un campo al pedido — no a la
 * pieza — no acabe colándose en las líneas del carrito por descuido.
 */
function extraerPieza(origen: PiezaConfigurada): PiezaConfigurada {
  return {
    material: origen.material,
    figuraId: origen.figuraId,
    medidas: { ...origen.medidas },
    cantidad: origen.cantidad,
    // El modo de medida y los metros viajan con la pieza: una línea de rodapié
    // pedida por metros tiene que seguir siéndolo dentro del carrito.
    modoMedida: origen.modoMedida,
    metrosTotales: origen.metrosTotales,
    suplementos: { ...origen.suplementos },
    unidadesSuplemento: { ...origen.unidadesSuplemento },
    precioMaterialEditadoEuros: origen.precioMaterialEditadoEuros,
    mermaEditadaPorcentaje: origen.mermaEditadaPorcentaje,
    margenManualPorcentaje: origen.margenManualPorcentaje,
  };
}

/**
 * Contador de ids de línea. No se usa la posición porque las líneas se quitan y
 * se reordenan, ni `Date.now()` porque dos clics rápidos darían el mismo id.
 */
let ultimoIdLinea = 0;

function nuevoIdLinea(): string {
  ultimoIdLinea += 1;
  return `l${ultimoIdLinea}`;
}

/**
 * Convierte la pieza del editor en línea del carrito, o null si aún no está
 * completa (sin material o sin figura no hay nada que añadir).
 */
function lineaDesdePieza(pieza: PiezaConfigurada): LineaCarrito | null {
  if (pieza.material === null || pieza.figuraId === null) return null;
  return {
    ...extraerPieza(pieza),
    material: pieza.material,
    figuraId: pieza.figuraId,
    id: nuevoIdLinea(),
  };
}

/**
 * Cómo queda el editor tras añadir una pieza al pedido: se limpia la pieza pero
 * SE CONSERVA EL MATERIAL. El caso normal es encadenar varios cortes del mismo
 * artículo — que es justo de donde sale el ahorro de cajas —, así que volver a
 * buscarlo en el catálogo en cada pieza sería trabajo tirado. Cambiarlo es un
 * clic; volver a elegirlo, media docena.
 */
function editorTrasAnadir(estado: EstadoAtelier): EstadoAtelier {
  return {
    ...estado,
    ...piezaVacia(),
    material: estado.material,
    // El margen a mano es del ARTÍCULO, y el artículo se conserva: se conserva también.
    margenManualPorcentaje: estado.margenManualPorcentaje,
  };
}

function reductor(estado: EstadoAtelier, accion: AccionAtelier): EstadoAtelier {
  switch (accion.tipo) {
    case 'seleccionarMaterial':
      return { ...estado, material: accion.material };
    case 'seleccionarFigura':
      // Cambiar de figura reinicia medidas y suplementos: no son transferibles.
      // El modo de cálculo vuelve al normal porque la figura nueva puede no
      // venderse por metros, y quedarse en un modo que ya no existe dejaría el
      // paso sin campo de largo.
      return {
        ...estado,
        figuraId: accion.figuraId,
        medidas: {},
        modoMedida: 'largo',
        metrosTotales: '',
        suplementos: {},
        unidadesSuplemento: {},
      };
    case 'cambiarMedida':
      return { ...estado, medidas: { ...estado.medidas, [accion.medida]: accion.valor } };
    case 'cambiarCantidad':
      return { ...estado, cantidad: accion.cantidad };
    case 'cambiarModoMedida':
      // Lo tecleado en el otro modo se conserva: alternar para comparar los dos
      // resultados es justo el motivo de tener dos modos, y borrarlo obligaría a
      // volver a escribirlo en cada ida y vuelta.
      return { ...estado, modoMedida: accion.modo };
    case 'cambiarMetros':
      return { ...estado, metrosTotales: accion.metros };
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
    case 'cambiarPrecioMaterialEditado':
      return { ...estado, precioMaterialEditadoEuros: accion.euros };
    case 'cambiarMerma':
      return { ...estado, mermaEditadaPorcentaje: accion.porcentaje };
    case 'cambiarComentarios':
      // Son de la orden, no de la pieza: cambiar de figura NO los borra.
      return { ...estado, comentarios: accion.comentarios };
    case 'cambiarTipoMargen':
      return { ...estado, tipoMargen: accion.tipoMargen };
    case 'cambiarMargenManual':
      return { ...estado, margenManualPorcentaje: accion.porcentaje };

    case 'anadirAlPedido': {
      const linea = lineaDesdePieza(estado);
      if (linea === null) return estado; // sin material o figura no hay pieza que añadir
      return editorTrasAnadir({ ...estado, carrito: [...estado.carrito, linea] });
    }

    case 'quitarDelPedido':
      return { ...estado, carrito: estado.carrito.filter((l) => l.id !== accion.id) };

    case 'editarLineaPedido': {
      const linea = estado.carrito.find((l) => l.id === accion.id);
      if (!linea) return estado;
      // Es un INTERCAMBIO, no una carga: lo que hubiera empezado en el editor se
      // guarda en el pedido antes de traer la línea. Así «editar» nunca tira
      // trabajo a la basura sin avisar. Si el editor está a medias (sin figura o
      // sin medidas) no hay nada que guardar y se descarta.
      const enCurso = Object.keys(estado.medidas).length > 0 ? lineaDesdePieza(estado) : null;
      const resto = estado.carrito.filter((l) => l.id !== accion.id);
      return {
        ...estado,
        ...extraerPieza(linea),
        carrito: enCurso === null ? resto : [...resto, enCurso],
      };
    }

    case 'duplicarLineaPedido': {
      const linea = estado.carrito.find((l) => l.id === accion.id);
      if (!linea) return estado;
      const copia: LineaCarrito = { ...linea, id: nuevoIdLinea() };
      // Justo detrás de la original, que es donde se espera ver la copia.
      const indice = estado.carrito.indexOf(linea);
      const carrito = [...estado.carrito];
      carrito.splice(indice + 1, 0, copia);
      return { ...estado, carrito };
    }

    case 'vaciarPedido':
      return { ...estado, carrito: [] };

    case 'reiniciar':
      // Reinicia la PIEZA y los comentarios, no el pedido: vaciar un pedido de
      // diez piezas por pulsar «Reiniciar» sería un accidente caro. El pedido
      // tiene su propio «Vaciar pedido», que sí pide confirmación.
      return { ...estadoInicial(), tipoMargen: estado.tipoMargen, carrito: estado.carrito };
  }
}

interface ContextoAtelier {
  estado: EstadoAtelier;
  dispatch: React.Dispatch<AccionAtelier>;
}

const Contexto = createContext<ContextoAtelier | null>(null);

/**
 * Estado inicial con el pedido que hubiera guardado en el navegador. Los ids de
 * las líneas restauradas se han generado en OTRA sesión, así que el contador
 * arranca por encima del mayor de ellos: si no, la primera pieza que se añadiera
 * reutilizaría un id y «quitar» borraría dos líneas.
 */
function estadoInicialRestaurado(): EstadoAtelier {
  const carrito = leerCarrito();
  for (const linea of carrito) {
    const n = Number.parseInt(linea.id.replace(/^l/, ''), 10);
    if (Number.isInteger(n) && n > ultimoIdLinea) ultimoIdLinea = n;
  }
  return { ...estadoInicial(), carrito };
}

/**
 * Ya no recibe `config`: el estado inicial no depende de ella desde que la merma
 * por defecto se calcula a partir del formato del material (`merma.ts`), y no de
 * un valor suelto de configuración.
 */
export function ProveedorAtelier({ children }: { children: ReactNode }): JSX.Element {
  const [estado, dispatch] = useReducer(reductor, undefined, estadoInicialRestaurado);
  // El pedido sobrevive a una recarga; la pieza a medias del editor, no
  // (ver `carrito-persistencia.ts`).
  useEffect(() => guardarCarrito(estado.carrito), [estado.carrito]);
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
function unidadesDeSuplemento(pieza: PiezaConfigurada, id: string): number {
  const txt = (pieza.unidadesSuplemento[id] ?? '').trim();
  return txt === '' ? Number.NaN : Number.parseInt(txt, 10);
}

/**
 * Margen escrito a mano, en centésimas de punto. Null si está vacío, que es lo
 * que le dice al motor «usa el de la tabla». Un texto no numérico también cuenta
 * como vacío: el motor dará el error de «falta el margen», que es lo que procede.
 */
function margenManualCentesimas(pieza: PiezaConfigurada): number | null {
  const txt = pieza.margenManualPorcentaje.trim().replace(',', '.');
  if (txt === '') return null;
  const valor = Number.parseFloat(txt);
  return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) : null;
}

/** Entrada del motor lista para calcular, con las medidas ya en mm. */
export interface EntradaConstruida {
  readonly entrada: EntradaCotizacion;
  readonly medidasMm: Record<string, Mm>;
}

/**
 * Construye la entrada del motor a partir de una pieza cruda (la del editor o
 * una línea del pedido: tienen la misma forma a propósito).
 *
 * Devuelve null cuando faltan datos básicos (material o figura). El `tipoMargen`
 * llega aparte porque es del PEDIDO, no de la pieza: todas las líneas se cotizan
 * con el mismo.
 */
export function construirEntradaDePieza(
  pieza: PiezaConfigurada,
  tipoMargen: TipoMargen,
  config: Configuracion,
): EntradaConstruida | SalidaMotor | null {
  const { material, figuraId } = pieza;
  if (!material || !figuraId) return null;
  const figura = figuraPorId(config, figuraId);
  if (!figura || figura.estado !== 'activa') return null;

  const cantidad = Number.parseInt(pieza.cantidad, 10);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return {
      ok: false,
      errores: [{ paso: 'medidas', medida: 'cantidad', mensaje: 'La cantidad debe ser un número entero mayor que 0.' }],
    };
  }

  // En las figuras que se venden por metro lineal el comercial puede pedir por
  // metros: entonces el largo de cada pieza sale de repartir los metros entre
  // las unidades, y no de un campo tecleado.
  const validacion =
    figura.medidaPorMetros !== null && pieza.modoMedida === 'metros'
      ? validarMedidasPorMetros(figura, pieza.medidas, pieza.metrosTotales, cantidad)
      : validarMedidasCrudas(figura, pieza.medidas);
  if (!validacion.ok) return { ok: false, errores: validacion.errores };

  const suplementosActivos = Object.entries(pieza.suplementos)
    .filter(([, activo]) => activo)
    .map(([id]) => id);

  const precioEditadoTxt = pieza.precioMaterialEditadoEuros.trim().replace(',', '.');
  const precioMaterialEditado =
    precioEditadoTxt === '' ? null : eurosACentimos(Number.parseFloat(precioEditadoTxt));

  // Sin edición manual se usa la sugerida por formato + figura; con ella, la del
  // comercial. Un texto no numérico se deja pasar (NaN) para que el error salga
  // del motor, como con la cantidad.
  const mermaTxt = pieza.mermaEditadaPorcentaje.trim().replace(',', '.');
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
        suplementosActivos.map((id) => [id, unidadesDeSuplemento(pieza, id)]),
      ),
      tipoMargen,
      // El margen a mano se guarda en puntos y el motor lo quiere en centésimas.
      margenManualCentesimas: margenManualCentesimas(pieza),
      precioMaterialEditado,
      mermaPorcentaje,
    },
  };
}

/** La entrada del motor para la pieza que se está editando ahora mismo. */
export function construirEntrada(
  estado: EstadoAtelier,
  config: Configuracion,
): EntradaConstruida | SalidaMotor | null {
  return construirEntradaDePieza(estado, estado.tipoMargen, config);
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
 * Entradas del motor para todas las líneas del pedido, o los errores con la
 * línea en la que están. Una línea sin material/figura no debería existir en el
 * carrito (solo se añade lo completo), pero si apareciera — un pedido guardado
 * por una versión anterior, p. ej. — se reporta como error de esa línea en vez
 * de desaparecer del cálculo sin decir nada.
 */
export function construirEntradasPedido(
  carrito: readonly LineaCarrito[],
  tipoMargen: TipoMargen,
  config: Configuracion,
):
  | { readonly ok: true; readonly entradas: readonly EntradaConstruida[] }
  | { readonly ok: false; readonly errores: readonly ErrorLineaPedido[] } {
  const entradas: EntradaConstruida[] = [];
  const errores: ErrorLineaPedido[] = [];

  carrito.forEach((linea, indice) => {
    const construida = construirEntradaDePieza(linea, tipoMargen, config);
    if (construida === null) {
      errores.push({
        indiceLinea: indice,
        error: { paso: 'figura', mensaje: 'La pieza no tiene material o figura válidos.' },
      });
      return;
    }
    if ('ok' in construida) {
      // `construirEntradaDePieza` solo devuelve `SalidaMotor` para señalar
      // errores; el caso `ok: true` no se da por aquí (el resultado llega en
      // `entrada`), pero se contempla para no depender de esa invariante.
      if (!construida.ok) {
        for (const error of construida.errores) errores.push({ indiceLinea: indice, error });
      }
      return;
    }
    entradas.push(construida);
  });

  return errores.length > 0 ? { ok: false, errores } : { ok: true, entradas };
}

/**
 * El pedido completo, calculado. `null` cuando el carrito está vacío: no es un
 * error, es que todavía no hay pedido.
 *
 * Devuelve también las medidas en mm de cada línea porque el PDF del pedido
 * dibuja el croquis de cada pieza y las necesita, igual que el de una pieza sola.
 */
export function usePedido(config: Configuracion): {
  readonly salida: SalidaPedido;
  readonly entradas: readonly EntradaConstruida[];
} | null {
  const { estado } = useAtelier();
  return useMemo(() => {
    if (estado.carrito.length === 0) return null;
    const construidas = construirEntradasPedido(estado.carrito, estado.tipoMargen, config);
    if (!construidas.ok) {
      return { salida: { ok: false, errores: construidas.errores }, entradas: [] };
    }
    return {
      salida: calcularPedido(
        construidas.entradas.map((c) => c.entrada),
        config,
      ),
      entradas: construidas.entradas,
    };
  }, [estado.carrito, estado.tipoMargen, config]);
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
