# PENDIENTES — Atelier Studio

Lista viva de lo **no decidido**. Regla de la especificación (§0): lo pendiente no se
implementa con suposiciones; se deja parámetro configurable con marca PROVISIONAL y se pregunta.
**Inventar una regla de negocio, una tarifa o una geometría se considera un error.**

## 1. Preguntas abiertas de la especificación (§6) — estado en el código

| # | Pregunta (responde) | Qué hay en el código mientras tanto |
|---|---|---|
| 1 | ¿Qué significa "mínimo 3" en merma? (Taller) | **No implementado.** La merma es solo `ceil(baldosas × (1+%))`. |
| 2 | Ancho real del disco de corte (Taller) | `parametros.json → discoMm: 3` **PROVISIONAL**. |
| 3 | Tolerancia de fabricación (Taller) | `parametros.json → toleranciaMm: 2` **PROVISIONAL**. |
| 4 | Reglas de saneado: ¿cuándo aplica y cuántos mm? (Taller) | `parametros.json → saneadoPorLadoMm: 5`, aplicado 2× por fila de colocación **PROVISIONAL**. La receta completa de ocupación (Σ anchos + (n−1)·disco + 2·saneado + tolerancia) es provisional. |
| 5 | Geometría, foto y tarifa de la Figura 5 (Taller) | Figura 5 en `figuras.json` como `pendiente` (bloqueada en la galería). |
| 6 | Tarifas de pasamanos y vierteaguas; ¿rodapié recto = tarifa de corte? (Taller) | Los tres como `pendiente`. El pasamanos admite "dos manipulaciones y un solo arranque" (§2): sin implementar. |
| 7 | ¿Qué es "menudio"? (Taller) | Sin referencia en el código. |
| 8 | Formato de los mínimos de compra (Compras) | **No implementado** (material de pedido: solo cajas completas). |
| 9 | ¿El 10 % de merma vale para todo o varía? (Taller) | `mermaPorcentajeDefecto: 10` (valor de desarrollo de §4), visible y editable en UI. |
| 10 | ¿El comercial puede modificar la merma? (Dirección) | `mermaEditable: true` **PROVISIONAL**; si es false, el campo se muestra bloqueado. |
| 11 | Contenido definitivo del PDF (Taller + comercial) | Rediseñado (2026-07-24): logo e identidad de marca, foto del material, total con IVA destacado. **A petición directa, ya no lleva ningún aviso visible de "provisional"** (se quitaron tanto la banda superior como la nota al pie): el contenido sigue sin estar validado por taller/comercial (§6.11), pero eso ya no se ve en el documento — solo queda constancia aquí. |
| 12 | ¿Dónde viven tarifas y parámetros: Google Sheet o JSON? (Valeri) | JSON en `/config` tras la interfaz `FuenteConfiguracion` (`src/domain/config.ts`): cambiar el origen no toca motor ni UI. |
| 13 | Búsqueda de material: ¿mecanismo de Top Studio o ElasticSearch? (Valeri) | Búsqueda en cliente tras la interfaz `FuenteCatalogo` (`src/data/`). |
| 14 | ¿Se parte del código de Top Studio o se replica desde cero? (Valeri) | Replicado el patrón desde cero (sin acceso al código de Top Studio). |

## 2. Croquis acotados (§3) — bloqueante para el motor

La spec exige croquis acotado con nombres de medida por figura antes de implementarla.
Los dibujos de la **tarifa PDF de Torelos (Juny 2023)** muestran perfiles pero sin acotar.
Lo implementado es **PROVISIONAL** (cada figura lleva `croquisPendiente: true` e insignia
«croquis provisional» en la galería):

- Figuras 1–4: receta tapa + frontal (+ retorno en Figura 4) deducida de los dibujos.
- **2026-07-24 (indicación directa del encargo, reemplaza el intento anterior basado en un
  croquis sin acotar):** el visor pasa de dibujar un chaflán/escocia con "dientes" colgantes a
  una ESCALERA de escalones hacia dentro bajo la tapa: Figura 1 sigue a ras (sin escalón);
  Figura 2 = Figura 1 con UN escalón hacia dentro, de anchura y alto = grosor de baldosa
  ("lo que miden las baldosas"); Figuras 3 y 4 = la misma escalera con un escalón más (dos en
  total) — la Figura 4 añade además su retorno en la base, sin cambios. Ver
  `src/viewer/geometria.ts`. Sigue siendo solo forma visual (no toca el motor ni las medidas
  que introduce el comercial): el tamaño de cada escalón sigue siendo la constante provisional
  de grosor de baldosa hasta que taller entregue el croquis ACOTADO oficial.
- Peldaño romo: tapa única; en 3D se dibuja media caña de radio = grosor.
- Grosor de baldosa en el visor: constante provisional 10 mm (no existe el dato; ¿vive en el ERP?).
- Giro de 90° de la baldosa: hoy se prueban ambas orientaciones y se elige la que quepa
  (regla exacta por figura pendiente del croquis, §4).
- Miniaturas SVG de la galería: perfiles simbólicos provisionales.

**Acción:** taller debe entregar el croquis acotado de cada figura (y la Figura 5 completa);
con él se corrigen las recetas de `figuras.json` y la geometría del visor.

## 3. Casos dorados (§5) — bloqueante para dar el motor por bueno

El motor no se considera correcto hasta reproducir 10–15 cálculos reales validados por taller.

- El arnés está listo: `tests/golden/` ejecuta como tests cualquier `*.json` depositado
  (formato documentado en `tests/golden/README.md`).
- `ejemplo-001.json` es un **EJEMPLO NO VALIDADO POR TALLER** (solo ilustra el formato).

**Acción:** taller rellena la tabla §5; cada fila se convierte en un JSON de `tests/golden/`.
*Si un caso dorado falla, el motor está mal, no el caso.*

## 4. Dudas surgidas durante el desarrollo (§0 exige entregarlas)

### Motor y tarifas
1. **Redondeo de manipulación:** hoy se calcula por pieza (redondeo half-up único) y luego se multiplica por cantidad. ¿O se tarifa sobre la longitud total? Afecta a los casos dorados.
2. **Arranque de máquina:** se aplica una vez por orden siempre que hay manipulación. ¿Aplica también si solo se vende material sin manipular? ¿Y si solo hay "corte de piezas"?
3. **Corte de piezas:** se tarifa el perímetro completo 2·(largo+ancho) **PROVISIONAL**. ¿O solo los cortes nuevos respecto a la baldosa de origen?
4. **Material manual con origen "pedido":** los campos mínimos del alta manual (§1.①) no incluyen piezas/caja ni m²/caja, así que hoy es error de validación. ¿Se permite ese flujo? ¿Con qué datos?
5. **Validación sobre mm redondeados:** 7,15 cm → 72 mm cumple el mínimo de 7,2 cm del rodapié estándar. ¿Correcto o se rechaza antes de redondear?
6. **Transporte 40 €** (condiciones de la tarifa PDF): no tiene línea en el desglose de §1 y no se ha incluido. ¿Se cotiza aquí o fuera?
7. **Mensajes de "no cabe"/incompatibilidad acortados (2026-07-24), a petición directa de dirección:** ya no citan literalmente el estilo largo de §1.③ (p. ej. "La longitud pedida es X cm; este formato solo permite Y cm en la orientación necesaria." → "La pieza mide X cm; el formato solo llega a Y cm."). Si taller/spec exige el texto largo exacto, avisar antes de dar esto por definitivo.

### Datos y catálogo
7. **TARP se asume €/m²** (material manual: €/unidad). Confirmado como razonable por el contrato real del catálogo (2026-07-24: `docs`/API `studio.ferrolan.es/cataleg/`), pero el comercial sigue pudiendo editar en la misma unidad que la tarifa de origen.
8. ~~**API del ERP (§6.13)**~~ **RESUELTO (2026-07-24):** el contrato real es el «API del catàleg de ceràmica» (`https://studio.ferrolan.es/cataleg/`, réplica de solo lectura de la sección CE, ~55.000 artículos, se actualiza 2×/día). Implementado en `src/data/fuenteCataleg.ts` (`mapearArticuloCataleg`). Detalles y huecos que quedan abiertos:
    - Autenticación `X-API-Key`: la clave NUNCA debe llegar al navegador (el catálogo lleva tarifas de venta). Se resuelve con un proxy same-origin (`/api/cataleg/`): nginx en producción (`nginx.conf.template`, clave inyectada vía `CATALEG_API_KEY`) y el dev server de Vite en local (`vite.config.ts`). Ver `.env.example`.
    - **Sin endpoint de listado/búsqueda:** la API real solo permite consultar por código (uno o hasta 50). El índice de búsqueda por texto es local (`indice-cataleg.json`, generado del sitemap público de ferrolan.es con `npm run indice:cataleg`); los candidatos de cada página se enriquecen en lote con los datos reales por código. **Pedir al responsable del ERP un endpoint de listado/búsqueda** (aunque sea solo código+descripción+marca) sigue siendo la solución de fondo — sin él, el índice de búsqueda seguirá desincronizado del catálogo real (códigos que no coinciden, artículos nuevos que no aparecen).
    - **Consulta directa por referencia exacta (2026-07-27):** si el texto de búsqueda es solo dígitos (≥4) y no hay coincidencia en el índice local, `fuenteIndiceCataleg.buscar()` hace UNA llamada `?accio=article&codi=…`. Así se encuentran artículos que están en el API pero no en el sitemap (sin página pública o sin imagen en ferrolan.es). Esos resultados no tienen imagen de índice (se usa el patrón PrestaShop si está configurado) y, si llegan sin mides en el API, se aplica la extracción desde la descripción (ver el punto de los artículos sin fitxa web).
    - **`idmarca` es un id numérico**, no hay nombre de marca en el contrato: `Material.marca` queda `null` para los artículos reales. Si se necesita el filtro por marca con datos reales, pedir al proveedor el nombre asociado a `idmarca` (o una tabla de marcas).
    - **~21.000 artículos CE sin fitxa web:** `llarg`/`ample` (y el resto de mides) llegan `null`. **Decidido (2026-07-27, dirección):** en ese caso `mapearArticuloCataleg` extrae el formato de la descripción (`extraerFormatoDeDescripcion`, patrón «LARGOxANCHO» en cm, p. ej. «45X45»; primer número = largo, segundo = ancho, tal como viene escrito — confirmar con taller si alguna descripción lo escribe al revés). Solo si la descripción tampoco trae formato se devuelve 'sin_medidas' y la UI ofrece «Entrada manual» conservando el precio real.
    - **`tarc`/`tara`/`taradc`:** el contrato expone tres tarifas hermanas de `tarp` sin explicar su uso en esta herramienta. De momento solo se usa `tarp`. Preguntar si alguna de las otras aplica a Atelier Studio.
    - **Piezas por caja calculadas (2026-07-27, regla de taller):** cuando `peces_caixa` llega null, `piezasPorCaja = round(encaixat ÷ m²/pieza)` (`piezasPorCajaDesdeEncaixat`; «30x60 → 0,18 m²; 1,08/0,18 = 6»). Verificado contra datos reales: reproduce `peces_caixa` en artículos con fitxa web (7,01→7, 2,01→2). Nota: en el taller hablan de «UNIVENTA/UNICOMPRA» para los m²/caja, pero en el API ese dato es `encaixat` — `unicompra` vale siempre 1 y `univenta` no existe en el contrato de 31 campos.
    - Si el `actualitzat` de `?accio=salut` se queda antiguo (>~14 h), es un fallo de sincronización del lado del ERP: avisar al responsable (no es un bug de la app).
9. **Imágenes PrestaShop:** patrón `<base>/<referencia>.jpg` **PROVISIONAL**. Confirmar el patrón real del web service (independiente del catálogo de cerámica; `catalogo.codigo = PrestaShop.reference`).
10. ~~¿El catálogo cabe en cliente (búsqueda local) o hará falta búsqueda/paginación en servidor?~~ **Resuelto de facto** por el contrato real: no hay paginación/búsqueda en servidor (solo consulta por código), así que la búsqueda sigue siendo en cliente sobre el catálogo de muestra hasta que exista un endpoint de listado (ver punto 8).

### UI y documento
11. **Unidad de los suplementos por pieza:** se muestra «€/peldaño» (ejemplo literal de §2). ¿Hay figuras futuras con otra unidad?
12. **PDF deshabilitado con errores de validación:** no se genera orden sin cotización válida. ¿Se quiere un PDF "borrador"?
13. El PDF incluye línea de producción «ocupación X de Y · N cortes · baldosa girada 90°» por relevancia para corte (no estaba en §1): ¿se queda?
14. Glifos `≤/≥` se sustituyen por `<=/>=` en el PDF (fuentes estándar jsPDF). Incrustar fuente Unicode si se quieren literales.
15. ¿El comercial necesita ver el €/m² equivalente en materiales manuales (€/unidad)?

## 5. Fuera de alcance de la v1 (§8) — no construido, se retoma tras validación en uso real

Login y roles · backoffice · offline/PWA · base de datos propia · sincronización nocturna ·
reutilización de sobrantes · flujo de estados de órdenes · auditoría de cambios.
