/**
 * Búsqueda de texto libre sobre el catálogo (§1.①).
 *
 * Compartida por la fuente de muestra y la fuente ERP (esta última filtra en
 * cliente de forma PROVISIONAL, hasta resolver §6.13: mismo mecanismo que
 * Top Studio o ElasticSearch).
 */

/**
 * Normaliza para comparar: minúsculas y sin diacríticos
 * («Mármol Baño» → «marmol bano»), para que la búsqueda ignore acentos.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * true si TODOS los términos del texto (separados por espacios) aparecen en
 * alguno de los campos dados. Texto vacío o solo espacios coincide con todo.
 */
export function coincideBusqueda(campos: readonly (string | null)[], texto: string): boolean {
  const terminos = normalizarTexto(texto)
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terminos.length === 0) return true;
  const camposNormalizados = campos
    .filter((campo): campo is string => campo !== null)
    .map(normalizarTexto);
  return terminos.every((termino) => camposNormalizados.some((campo) => campo.includes(termino)));
}
