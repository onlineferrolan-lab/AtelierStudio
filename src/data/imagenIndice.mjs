/**
 * Compactado del campo «imagen» del índice de catálogo.
 *
 * POR QUÉ EXISTE. Las URL de imagen eran el **62 % del índice** (2,23 MB de
 * 3,89 MB) y son casi siempre derivables: PrestaShop las forma como
 *
 *     https://ferrolan.es/<idImagen>/<slug-del-titulo>-<referencia>.jpg
 *
 * De lo único que no hay pista es del `idImagen`. Así que el índice guarda un
 * NÚMERO (el id) cuando la URL se puede reconstruir —el 94,6 % de los casos— y
 * la CADENA con la URL completa cuando no. Se distinguen por tipo, sin campo
 * extra. Ahorro medido: 1,97 MB (índice de 3,89 a ~1,92 MB).
 *
 * GARANTÍA (esto es lo importante). El indexador NUNCA guarda un id que no haya
 * verificado: reconstruye la URL y solo compacta si sale idéntica a la real
 * (`compactarImagen`). Si PrestaShop cambia su regla de slug, el resultado es
 * un índice con más excepciones —más grande—, nunca una imagen rota.
 *
 * La misma regla está duplicada en `scripts/generar-indice-cataleg.mjs`, que es
 * Node puro y no puede importar TypeScript. Es la convención ya establecida en
 * el proyecto para ese script (formato de tupla, títulos ocultos): **si cambia
 * aquí, hay que cambiarla allí**. Los tests de este módulo fijan la regla para
 * que una divergencia se vea.
 */

/** Prefijo común a todas las imágenes de producto (0,55 MB de puro repetido). */
const BASE_IMAGENES = 'https://ferrolan.es/';

/**
 * Caracteres que el slug de PrestaShop **se come** en vez de convertir en
 * guion: los decimales («29,5X120» → `295x120`) y el `&` («B&W» → `bw`).
 * Medido contra las 28.732 URL reales del índice.
 */
const COMIDOS = /['".,&°ªº]/g;

/**
 * Entidades HTML sin decodificar del sitemap. Vienen **doblemente escapadas**
 * (`B&amp;amp;W`), así que se decodifica hasta que deja de cambiar: sin esto el
 * comercial ve «EQUIPE CAPRICE BALANCE B&amp;amp;W» en pantalla (55 artículos).
 */
const ENTIDADES = [
  [/&amp;/g, '&'],
  [/&quot;/g, '"'],
  [/&#0?39;/g, "'"],
  [/&apos;/g, "'"],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&nbsp;/g, ' '],
];

/** Máximo de pasadas de decodificación (los datos reales necesitan 2). */
const MAX_PASADAS = 3;

/** Decodifica entidades HTML, incluso doblemente escapadas. */
export function desescaparTitulo(titulo) {
  let actual = titulo;
  for (let i = 0; i < MAX_PASADAS; i += 1) {
    let siguiente = actual;
    for (const [patron, reemplazo] of ENTIDADES) siguiente = siguiente.replace(patron, reemplazo);
    if (siguiente === actual) return actual;
    actual = siguiente;
  }
  return actual;
}

/** Slug de PrestaShop para un título: minúsculas sin diacríticos, con guiones. */
export function slugImagen(titulo) {
  return titulo
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(COMIDOS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Reconstruye la URL de imagen a partir del id, el título y la referencia. */
export function urlImagenDesdeId(idImagen, titulo, referencia) {
  return `${BASE_IMAGENES}${idImagen}/${slugImagen(titulo)}-${referencia}.jpg`;
}

/**
 * Campo «imagen» del índice → URL utilizable. Número = id compactado (se
 * reconstruye); cadena = URL literal (excepción, se usa tal cual).
 */
export function urlImagenDeIndice(imagen, titulo, referencia) {
  return typeof imagen === 'number' ? urlImagenDesdeId(imagen, titulo, referencia) : imagen;
}

/**
 * Decide cómo guardar una URL en el índice: el id (número) si reconstruirla da
 * exactamente la misma URL, o la URL completa (cadena) si no.
 *
 * `titulo` tiene que venir YA desescapado, el mismo que se guardará en el
 * índice: si no, la reconstrucción en la app partiría de otro texto.
 */
export function compactarImagen(urlReal, titulo, referencia) {
  const coincidencia = /^https:\/\/ferrolan\.es\/(\d+)\//.exec(urlReal);
  if (!coincidencia) return urlReal;
  const idImagen = Number(coincidencia[1]);
  if (!Number.isSafeInteger(idImagen)) return urlReal;
  return urlImagenDesdeId(idImagen, titulo, referencia) === urlReal ? idImagen : urlReal;
}
