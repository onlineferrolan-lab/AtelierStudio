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
| 4 | Reglas de saneado: ¿cuándo aplica y cuántos mm? (Taller) | `parametros.json → saneadoPorLadoMm: 5`, aplicado 2× por fila de colocación **PROVISIONAL**. La receta completa de ocupación (Σ anchos + (n−1)·disco + 2·saneado + tolerancia) es provisional, y con ella el empaquetado en rejilla (piezas por baldosa, ver §4 duda 9). |
| 5 | Geometría, foto y tarifa de la Figura 5 (Taller) | Figura 5 **retirada de la galería** (2026-07-29, dirección): sin entrada en `figuras.json` hasta tener croquis y tarifa. |
| 6 | Tarifas de pasamanos y vierteaguas; ¿rodapié recto = tarifa de corte? (Taller) | **Pasamanos creados (2026-07-29)** con receta espejo del peldaño equivalente y tarifa PROVISIONAL = mismo precio que el peldaño (`pasamanos-*` en `tarifas.json`), a falta de tarifa confirmada. El pasamanos admite "dos manipulaciones y un solo arranque" (§2): **sin implementar** (hoy una sola línea de tarifa por figura). Vierteaguas y rodapié recto, **retirados de la galería** (2026-07-29, dirección): sin entrada en `figuras.json`. |
| 7 | ¿Qué es "menudio"? (Taller) | Sin referencia en el código. |
| 8 | Formato de los mínimos de compra (Compras) | **No implementado** (todo se factura por cajas completas). |
| 9 | ¿El 10 % de merma vale para todo o varía? (Taller) | `mermaPorcentajeDefecto: 10` (valor de desarrollo de §4), visible y editable en UI. |
| 10 | ¿El comercial puede modificar la merma? (Dirección) | `mermaEditable: true` **PROVISIONAL**; si es false, el campo se muestra bloqueado. |
| 10b | ¿A cuántas piezas se aplica «Angular»? (Taller) | **Resuelto 2026-07-30 (indicación directa):** ya no se cobra a todas las piezas. El comercial elige cuántas la llevan (`unidadesSuplemento` en la entrada del motor, campo en el paso ④); al activarlo se propone UNA y el motor rechaza más piezas de las pedidas. Es el único suplemento con este comportamiento, por ser el único `porPieza`. |
| 11 | Contenido definitivo del PDF (Taller + comercial) | Rediseñado (2026-07-24): logo e identidad de marca, foto del material, total con IVA destacado. **Ampliado 2026-07-29 (a petición directa), TAMPOCO validado por taller/comercial:** croquis acotado de la sección de la pieza junto al bloque Pieza, **código de orden** visible `OT-AAAAMMDD-HHMM` en la cabecera (no hay contador en servidor: §8 excluye base de datos propia, así que el sello fecha-hora es el identificador disponible — si taller quiere numeración correlativa hace falta decidir dónde vive el contador), pie de control «Cortado por / Fecha / Revisado por» para rellenar a mano, y valores en negro sobre etiquetas en gris. Todo esto entra en la misma pregunta abierta §6.11: confirmar con taller que el croquis les sirve y que el código de orden les vale así. **A petición directa, ya no lleva ningún aviso visible de "provisional"** (se quitaron tanto la banda superior como la nota al pie): el contenido sigue sin estar validado por taller/comercial (§6.11), pero eso ya no se ve en el documento — solo queda constancia aquí. |
| 12 | ¿Dónde viven tarifas y parámetros: Google Sheet o JSON? (Valeri) | JSON en `/config` tras la interfaz `FuenteConfiguracion` (`src/domain/config.ts`): cambiar el origen no toca motor ni UI. |
| 13 | Búsqueda de material: ¿mecanismo de Top Studio o ElasticSearch? (Valeri) | Búsqueda en cliente tras la interfaz `FuenteCatalogo` (`src/data/`). |
| 14 | ¿Se parte del código de Top Studio o se replica desde cero? (Valeri) | Replicado el patrón desde cero (sin acceso al código de Top Studio). |

## 2. Croquis acotados (§3) — bloqueante para el motor

La spec exige croquis acotado con nombres de medida por figura antes de implementarla.
Los dibujos de la **tarifa PDF de Torelos (Juny 2023)** muestran perfiles pero sin acotar.
Lo implementado es **PROVISIONAL** (cada figura lleva `croquisPendiente: true` e insignia
«croquis provisional» en la galería):

- Figuras 1–4: receta tapa + frontal (+ retorno en Figura 4) deducida de los dibujos.
- **2026-07-29 (dibujos de referencia vectorizados, LECTURA CORREGIDA):** el encargo entregó los
  dibujos de la tarifa PDF vectorizados (SVG) de las Figuras 1–4. Midiendo sus coordenadas
  (y comprobándolas contra los PNG extraídos de la tarifa) la forma es:
    - **Figura 1** = L a ras: tapa de un grosor sobre una nariz de UN grosor.
    - **Figura 2** = la misma L con la nariz de DOS grosores (un diente tras el frontal).
    - **Figura 3** = la misma L con la nariz de TRES grosores (dos dientes).
    - Los dientes van **a plena altura y con la base a ras del frontal, NO en escalera**: en los
      dibujos el borde inferior de la nariz es una sola recta (los cuatro vértices inferiores de
      la Figura 3 son colineales en la dirección del fondo). La escalera descendente que se
      implementó antes era una lectura equivocada.
    - **Figura 4** = SIN dientes: el **retorno** engorda la nariz hacia dentro
      (`nariz = grosor + retorno`), **maciza**, sin hueco entre la tapa y el retorno — en volumen
      es un bloque entero (confirmado 2026-07-29, indicación directa; era la única zona del dibujo
      que quedaba en duda). Antes se le dibujaban dos dientes *y* el retorno, y luego un ⊏ hueco.
    - Todas llevan la **unión a 45°** entre tapa y frontal (y entre frontal y retorno en la 4).
      Es una junta interna de la pieza encolada: se ve en la testa (y por eso en las miniaturas),
      pero no cambia el sólido 3D.
  Así se dibujan en el visor 3D (`src/viewer/geometria.ts`, `DIENTES_POR_FIGURA`) y en las
  miniaturas de la galería. Los dientes y el retorno son SOLO representación: la receta
  (ocupación y tarifa) sigue siendo tapa + frontal (+ retorno). Esto reemplaza las notas
  anteriores sobre "escalera" / "L a ras" (2026-07-24), que se contradecían entre sí.
  **Sigue faltando el croquis ACOTADO**: los dibujos dan la forma, no las medidas.
- Peldaño romo: tapa única; en 3D lleva media caña de radio = medio grosor (o sea el grosor
  entero de diámetro, la semicircunferencia que se ve en el dibujo de la tarifa).
- Rodapiés: listón de pie con el canto superior en media caña, según «Rodapeu romat o bisellat»
  de la tarifa y la banda clara del dibujo.
- Grosor de baldosa en el visor: constante provisional 10 mm (no existe el dato; ¿vive en el ERP?).
- Giro de 90° de la baldosa: hoy se prueban ambas orientaciones y se elige la que quepa
  (regla exacta por figura pendiente del croquis, §4).
- **2026-07-28 (revisión del maestro):** figuras 1–4 marcadas como «revisar diseño», sin
  más detalle — se esperan las correcciones concretas o el croquis. Peldaño romo y
  rodapiés (7,2/8 y no estándar) dados por OK; «rodapié recto» sigue sin tarifa (§6.6).
  Nuevas figuras pedidas: **pasamanos 1, 2, 3 y 4** y **pasamanos romo**.
- **2026-07-29 (pasamanos creados):** los cinco pasamanos ya están activos en
  `figuras.json` con la MISMA receta que su peldaño equivalente más la manipulación en el
  lado opuesto (`frontal-trasero`, `retorno-trasero` en Pasamanos 4, doble media caña en
  Pasamanos romo), por indicación directa del encargo. Su tarifa (`pasamanos-*` en
  `tarifas.json`) repite PROVISIONALMENTE el precio del peldaño equivalente — confirmar
  tarifa real con taller (§6.6); el croquis acotado sigue pendiente para todos.
- **2026-07-29 (figuras pendientes retiradas de la galería, a petición de dirección):**
  Figura 5, vierteaguas y rodapié recto ya NO aparecen en `figuras.json` (el estado
  'pendiente' sigue soportado en código por si se reincorporan). Su seguimiento queda
  en esta lista (§1.5, §1.6): para reactivar una, rellenar su receta y tarifa y darla
  de alta como 'activa'.
- Miniaturas de la galería (2026-07-29): SVG axonométricos inline con un solo motor y una sola
  paleta, generados de la MISMA sección que el visor 3D y con la sección a la vista en la testa
  del extremo cercano, que es donde se distingue una figura de otra; sustituyen a los PNG
  extraídos de la tarifa PDF. Van en **gris claro, no en la terracota de la tarifa** (indicación
  directa): la pieza real puede ser de cualquier material, así que la miniatura no le presupone
  color. La sección va exagerada respecto al
  dibujo original a propósito: la tarifa dibuja una losa de ~19 grosores de fondo y a 96 × 64 px
  eso deja el grosor en ~2,5 px, con lo que los dientes dejan de verse. Siguen siendo
  PROVISIONALES hasta el croquis acotado.

- **2026-07-30 (suplementos en 3D):** los tres suplementos que se cobran POR CM ya se
  representan, porque recorren la pieza de punta a punta y son rasgos de la sección:
  **tres ranuras antideslizantes** en la cara de huella, **goterón** en el canto inferior del
  frontal (indicación directa; antes se había puesto bajo la tapa, que era incorrecto) y
  **material espesado** como una capa más bajo la tapa. Sus medidas son PROVISIONALES: la tarifa
  nombra los trabajos pero no los acota. **Preguntar a taller:** ancho, profundidad y separación
  de las ranuras antideslizantes; sección y posición exacta del goterón; y cuánto engorda de
  verdad el material espesado (hoy se dobla el grosor de la tapa).
- **«Angular» NO se representa en 3D.** Se cobra por pieza, es un remate del extremo y no cabe
  en la sección transversal. **Preguntar a taller qué es exactamente**: ¿un inglete a 45° en el
  extremo de la pieza para doblar la esquina de la escalera, o un remate del canto? Sin esa
  respuesta no se dibuja (§0).

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
4. **~~Material manual con origen "pedido"~~ — RESUELTO 2026-07-30 (indicación directa).** Al pasar a facturar por cajas completas también en stock, el alta manual se quedaba sin salida (ya no valía cambiar el origen a Stock). Decidido: el formulario pide **piezas por caja** como campo obligatorio. Los m²/caja NO se piden: se derivan del formato (`piezas × largo × ancho`), exacto y sin pérdida al cuantizar a mm². El origen de material se suprimió por completo.
5. **Validación sobre mm redondeados:** 7,15 cm → 72 mm cumple el mínimo de 7,2 cm del rodapié estándar. ¿Correcto o se rechaza antes de redondear?
6. **Transporte 40 €** (condiciones de la tarifa PDF): no tiene línea en el desglose de §1 y no se ha incluido. ¿Se cotiza aquí o fuera?
7. **Mensajes de "no cabe"/incompatibilidad acortados (2026-07-24), a petición directa de dirección:** ya no citan literalmente el estilo largo de §1.③ (p. ej. "La longitud pedida es X cm; este formato solo permite Y cm en la orientación necesaria." → "La pieza mide X cm; el formato solo llega a Y cm."). Si taller/spec exige el texto largo exacto, avisar antes de dar esto por definitivo.
8. **Lógica de cálculo ERP (2026-07-28, maestro):** «falta aplicar la lògica de càlcul». El maestro entregará un documento nuevo con esa lógica; al recibirlo se implementa en `src/domain/engine/` y se valida contra casos dorados (§3). No se implementa nada por suposición (§0).
9. **Empaquetado: varias piezas por baldosa (2026-07-28, dirección):** la regla «una pieza = una baldosa de origen» estaba mal para piezas pequeñas (3 piezas de 10×10 cm NO necesitan 3 baldosas de 110×110). Implementado como REJILLA PROVISIONAL en `src/domain/engine/ocupacion.ts` (`piezasPorBaldosa`): `baldosasNecesarias = ceil(cantidad / piezasPorBaldosa)` y la merma se aplica después sobre esas baldosas. Se mantiene la veta §4 por pieza (los componentes de UNA pieza salen de la misma baldosa); no se mezclan piezas en la misma fila ni se reutilizan sobrantes (§8). Si el documento de lógica del maestro (punto 8) define otro empaquetado, este se reemplaza.

### Datos y catálogo
7. **TARP se asume €/m²** (material manual: €/unidad). Confirmado como razonable por el contrato real del catálogo (2026-07-24: `docs`/API `studio.ferrolan.es/cataleg/`), pero el comercial sigue pudiendo editar en la misma unidad que la tarifa de origen.
8. ~~**API del ERP (§6.13)**~~ **RESUELTO (2026-07-24):** el contrato real es el «API del catàleg de ceràmica» (`https://studio.ferrolan.es/cataleg/`, réplica de solo lectura de la sección CE, ~55.000 artículos, se actualiza 2×/día). Implementado en `src/data/fuenteCataleg.ts` (`mapearArticuloCataleg`). Detalles y huecos que quedan abiertos:
    - Autenticación `X-API-Key`: la clave NUNCA debe llegar al navegador (el catálogo lleva tarifas de venta). Se resuelve con un proxy same-origin (`/api/cataleg/`): nginx en producción (`nginx.conf.template`, clave inyectada vía `CATALEG_API_KEY`) y el dev server de Vite en local (`vite.config.ts`). Ver `.env.example`.
    - **Sin endpoint de listado/búsqueda:** la API real solo permite consultar por código (uno o hasta 50). El índice de búsqueda por texto es local (`indice-cataleg.json`, generado del sitemap público de ferrolan.es con `npm run indice:cataleg`; las URLs de imagen se guardan SIN el sufijo de miniatura `-large_default`, apuntando a la imagen original); los candidatos de cada página se enriquecen en lote con los datos reales por código. En producción el índice se refresca a diario con una tarea programada de Plesk (ver README §Despliegue), lo que acota la desincronización a 24 h. **Pedir al responsable del ERP un endpoint de listado/búsqueda** (aunque sea solo código+descripción+marca) sigue siendo la solución de fondo — sin él, el índice de búsqueda seguirá desincronizado del catálogo real (códigos que no coinciden, artículos nuevos que no aparecen).
    - **Consulta directa por referencia exacta (2026-07-27):** si el texto de búsqueda es solo dígitos (≥4) y no hay coincidencia en el índice local, `fuenteIndiceCataleg.buscar()` hace UNA llamada `?accio=article&codi=…`. Así se encuentran artículos que están en el API pero no en el sitemap (sin página pública o sin imagen en ferrolan.es). Esos resultados no tienen imagen de índice (se usa el patrón PrestaShop si está configurado) y, si llegan sin mides en el API, se aplica la extracción desde la descripción (ver el punto de los artículos sin fitxa web).
    - **`idmarca` es un id numérico**, no hay nombre de marca en el contrato: `Material.marca` queda `null` para los artículos reales. Si se necesita el filtro por marca con datos reales, pedir al proveedor el nombre asociado a `idmarca` (o una tabla de marcas).
    - **~21.000 artículos CE sin fitxa web:** `llarg`/`ample` (y el resto de mides) llegan `null`. **Decidido (2026-07-27, dirección):** en ese caso `mapearArticuloCataleg` extrae el formato de la descripción (`extraerFormatoDeDescripcion`, patrón «LARGOxANCHO» en cm, p. ej. «45X45»; primer número = largo, segundo = ancho, tal como viene escrito — confirmar con taller si alguna descripción lo escribe al revés). Solo si la descripción tampoco trae formato se devuelve 'sin_medidas' y la UI ofrece «Entrada manual» conservando el precio real.
    - **`tarc`/`tara`/`taradc`:** el contrato expone tres tarifas hermanas de `tarp` sin explicar su uso en esta herramienta. De momento solo se usa `tarp`. Preguntar si alguna de las otras aplica a Atelier Studio. **Posible pista (2026-07-30):** el encargo anuncia varios márgenes por tipo de cliente («PVP», «PP»…) que vendrán del API; podrían ser justo estas tarifas hermanas. Confirmarlo antes de inventar un campo nuevo — ver §6.
    - **Piezas por caja calculadas (2026-07-27, regla de taller):** cuando `peces_caixa` llega null, `piezasPorCaja = round(encaixat ÷ m²/pieza)` (`piezasPorCajaDesdeEncaixat`; «30x60 → 0,18 m²; 1,08/0,18 = 6»). Verificado contra datos reales: reproduce `peces_caixa` en artículos con fitxa web (7,01→7, 2,01→2). Nota: en el taller hablan de «UNIVENTA/UNICOMPRA» para los m²/caja, pero en el API ese dato es `encaixat` — `unicompra` vale siempre 1 y `univenta` no existe en el contrato de 31 campos.
    - Si el `actualitzat` de `?accio=salut` se queda antiguo (>~14 h), es un fallo de sincronización del lado del ERP: avisar al responsable (no es un bug de la app).
9. **Imágenes PrestaShop:** patrón `<base>/<referencia>.jpg` **PROVISIONAL**. Confirmar el patrón real del web service (independiente del catálogo de cerámica; `catalogo.codigo = PrestaShop.reference`).
10. ~~¿El catálogo cabe en cliente (búsqueda local) o hará falta búsqueda/paginación en servidor?~~ **Resuelto de facto** por el contrato real: no hay paginación/búsqueda en servidor (solo consulta por código), así que la búsqueda sigue siendo en cliente sobre el catálogo de muestra hasta que exista un endpoint de listado (ver punto 8).
11. **Referencias ocultas — zócalos y piezas especiales (2026-07-28, maestro):** no mostrar los artículos de las features PrestaShop 168, 401, 711, 726, 739, 745, 749, 762, 778, 782, 797, 799, 1300 y 53. El API del catàleg no expone features, así que se ha implementado como lista manual `referenciasOcultas` en `public/config/catalogo.json`, filtrada en `src/data/fuenteIndiceCataleg.ts` (tanto en la búsqueda por texto como en la consulta directa por referencia). **Acción:** mapear esas features a referencias desde el backoffice de PrestaShop y rellenar la lista (o pedir al responsable del ERP que exponga `id_feature` y filtrar entonces de verdad).
12. **Mosaicos y rodapiés ocultos del catálogo (2026-07-28, dirección):** son producto acabado, no material base de corte. Implementado como `palabrasTituloOcultas: ["MOSAICO", "RODAPIE"]` en `public/config/catalogo.json` (palabra contenida en el título, comparando normalizado: minúsculas y sin tildes — «RODAPIE» cubre «RODAPIÉ …» y erratas tipo «RODAPIÉTREVERK…»): filtra `fuenteIndiceCataleg.ts` en la búsqueda por texto y en la consulta directa por referencia, y `scripts/generar-indice-cataleg.mjs` los excluye al regenerar el índice (~4.027 artículos con el índice de 2026-07-28). Si taller vende algún mosaico/rodapié como material base, afinar la lista.

### UI y documento
11. **Unidad de los suplementos por pieza:** se muestra «€/peldaño» (ejemplo literal de §2). ¿Hay figuras futuras con otra unidad?
12. **PDF deshabilitado con errores de validación:** no se genera orden sin cotización válida. ¿Se quiere un PDF "borrador"?
13. El PDF incluye línea de producción «ocupación X de Y · N cortes · baldosa girada 90°» por relevancia para corte (no estaba en §1): ¿se queda?
14. Glifos `≤/≥` se sustituyen por `<=/>=` en el PDF (fuentes estándar jsPDF). Incrustar fuente Unicode si se quieren literales.
15. ¿El comercial necesita ver el €/m² equivalente en materiales manuales (€/unidad)?

## 5. Fuera de alcance de la v1 (§8) — no construido, se retoma tras validación en uso real

Login y roles · backoffice · offline/PWA · base de datos propia · sincronización nocturna ·
reutilización de sobrantes · flujo de estados de órdenes · auditoría de cambios.

## 6. Margen comercial (anunciado 2026-07-30, sin especificar)

El encargo avisa de que material, manipulación y arranque de máquina llevarán un
**margen** que hoy no existe: automático y no visible para el cliente, obtenido
del API, con **varios márgenes según el tipo de cliente** («PVP», «PP»…),
**dependiente del fabricante** y conmutable sin que el cliente lo note. Los
detalles llegarán más adelante; **no se ha implementado nada** (§0).

Lo que conviene decidir ANTES de escribir código, porque cambia el diseño:

1. **Dónde se aplica y en qué orden.** El motor trabaja en enteros con un único
   redondeo por línea (`docs/05-motor-de-calculo.md`). No da el mismo céntimo
   aplicar el margen línea a línea y sumar, que sumar y aplicarlo al total; ni
   aplicarlo antes o después del redondeo a cajas/merma. Hace falta la regla
   exacta, no una aproximación. Enlaza con §4.1 (orden de redondeo de la
   manipulación), que sigue abierto.
2. **Interacción con el precio editado a mano.** El comercial ya puede sobrescribir
   el precio del material (§1.①). ¿El margen se aplica también encima de ese
   precio, o el precio editado se entiende ya con margen? Hoy no hay respuesta y
   son importes distintos.
3. **Qué documento ve cada uno.** La orden de trabajo actual imprime el desglose
   completo (material, manipulación, arranque, total sin IVA, IVA). Si el margen va
   escondido dentro de esas cifras, hay que decidir si esa hoja pasa a llevar
   precios de venta —y entonces taller ve PVP, no coste— o si hacen falta **dos
   documentos**: uno interno con coste y otro para el cliente con margen. Afecta
   directamente a `src/pdf/ordenTrabajo.ts`.
4. **De dónde sale el margen.** Si depende del fabricante, hace falta poder
   agrupar el artículo, y con los datos del catálogo **hoy no se puede**:
   `idmarca` es un id numérico y el contrato no da el nombre (§4.8).
   **Avance del 2026-07-30:** el alta manual ya recoge una **subfamilia**
   (id numérico opcional, `Material.subfamilia`), a propósito para engancharla
   aquí. No entra en ningún cálculo todavía. Queda por resolver lo importante:
   los artículos del **catálogo** la traen a `null` porque el API no la expone,
   así que hay que pedir al ERP la subfamilia por artículo (o un margen ya
   resuelto). Con solo el alta manual cubierta, el margen no se puede aplicar al
   caso normal.
5. **Casos dorados.** Cada caso de §3 tendrá que registrar con qué margen se
   calculó, o los importes esperados quedan ambiguos. Los casos que se capturen
   antes de que exista el margen valen igual, pero hay que entenderlos como
   **casos a coste** y anotarlo en el JSON.

**Una recomendación, no una decisión:** «oculto para el cliente» y «oculto para el
comercial» no son lo mismo. Que el margen no se detalle en el documento que ve el
cliente es normal; que el comercial no sepa cuál está activo es arriesgado —
podría presupuestar con el margen equivocado sin enterarse. Lo prudente es que la
herramienta muestre siempre qué margen se está aplicando (visible solo en pantalla,
nunca en el PDF del cliente).

---

## 7. Merma por formato (indicación 2026-07-30, incompleta)

**Lo indicado.** La merma por defecto dejará de ser un valor único (hoy 10 % en
`parametros.json`) y pasará a depender del formato de la baldosa, «parecido al precio
del material»: se propone un valor y el comercial puede sobrescribirlo. Además, las
figuras **numeradas** llevan **+5 %** de merma.

**Lo que sí está claro:**
- Formatos de 30×60 o menores → **10 %**.
- Al llegar a 120×60 → **20 %**, y ese 20 % se aplica de ahí en adelante.
- Sigue siendo editable a mano (el campo y el override ya existen).

**BLOQUEANTE — falta la tabla intermedia.** «Vamos subiendo hasta llegar a 120×60»
no dice ni los escalones ni el criterio de ordenación. No se implementa por
suposición (§0). Hace falta concretar:

1. **Qué mide el tramo.** Los dos extremos citados (30×60 y 120×60) comparten el
   lado de 60, así que lo que varía es el **lado mayor** (60 → 120). ¿Es eso, o es
   la superficie de la baldosa? Con formatos no cuadrados (30×120, 75×75, 100×100)
   las dos lecturas dan mermas distintas.
2. **Los escalones exactos.** ¿Qué merma le toca a 60×60, 75×75, 80×80, 90×90,
   100×100, 120×120? ¿Es una tabla de formatos concretos o tramos por lado mayor?
   Interpolar linealmente (15 % a 90 cm) sería inventarse una regla de negocio.
3. **Qué cuenta como «figura numerada».** Literalmente hay **ocho** figuras con un
   número en el nombre: `figura-1..4` **y** `pasamanos-1..4`. Los pasamanos son las
   mismas geometrías reflejadas, así que lo razonable es que también lleven el +5 %,
   pero hay que confirmarlo. Los que **no** lo llevarían: peldaño romo, pasamanos
   romo, los dos rodapiés y el corte.
4. **Cómo se combina el +5 %.** ¿Es aditivo sobre el tramo (formato 10 % → 15 %) o
   multiplicativo (10 % × 1,05 = 10,5 %)? Con el tramo al 20 % la diferencia es
   25 % frente a 21 %.
5. **Tope.** Si el tramo ya está en 20 % y la figura suma 5 %, ¿se queda en 25 % o
   hay máximo?

**Nota de implementación.** Cuando estén los valores, esto va en `parametros.json`
como tabla de tramos (dato, no código), con la lista de figuras con recargo
también en configuración. El motor ya cuantiza la merma a centésimas de punto, así
que un 12,5 % entra sin tocar la aritmética entera.

---

## 8. Figura nueva: tabica (indicación 2026-07-30, incompleta)

**Lo indicado.** Una **tabica** es una figura 1 con un **corte** debajo a modo de
zócalo. El precio es la **suma de las dos** partes. Los parámetros son
independientes **salvo el largo**, que es común a las dos.

**Por qué no es una figura más.** Hoy el motor asume, de arriba abajo, que una
cotización = **una** figura → una receta → **una** tarifa de manipulación
(`resolverTarifa` + `longitudTarifaMm` en `src/domain/engine/cotizacion.ts`). La
tabica es la primera figura **compuesta**, así que no se resuelve añadiendo una
entrada a `figuras.json`: hay que decidir cómo se representa una figura con dos
sub-piezas y dos tarifas. Toca motor, configuración, visor 3D, miniatura, PDF y
casos dorados.

**Preguntas antes de escribir código:**
1. **Medidas del zócalo.** El corte tiene hoy `largo` y `ancho`. Si el largo es
   común, ¿la única medida propia del zócalo es su altura? ¿Y qué medidas conserva
   la figura 1 (ancho y caída, entiendo)?
2. **Veta y ocupación.** §4 dice que los componentes de una pieza salen de la misma
   baldosa. ¿La figura 1 y su zócalo tienen que salir de la **misma** baldosa —lo
   que cambia la ocupación y puede no caber— o son piezas independientes que se
   cotizan juntas? Es la pregunta que más mueve el importe del material.
3. **Arranque de máquina.** Es uno por orden (§2) y eso no cambia; pero conviene
   confirmar que una tabica es **una** orden y no dos.
4. **Merma.** Con §7 en marcha: ¿la tabica cuenta como figura numerada (+5 %)? El
   nombre no lleva número, pero «es una figura 1».
5. **Suplementos.** ¿Los de la figura 1 (angular, ranuras, goterón, espesado)
   aplican a la tabica? ¿Alguno aplica al zócalo?
6. **Croquis.** Habrá que dibujar la sección compuesta (escuadra + zócalo) en
   `src/piezas/seccionPieza.ts` para el visor, la miniatura y el croquis del PDF.
