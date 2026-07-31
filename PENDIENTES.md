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
| 6 | Tarifas de pasamanos y vierteaguas; ¿rodapié recto = tarifa de corte? (Taller) | **Pasamanos creados (2026-07-29)** con receta espejo del peldaño equivalente y tarifa PROVISIONAL = mismo precio que el peldaño (`pasamanos-*` en `tarifas.json`), a falta de tarifa confirmada. El pasamanos admite "dos manipulaciones y un solo arranque" (§2): **sin implementar** (hoy una sola línea de tarifa por figura). Vierteaguas, **retirado de la galería** (2026-07-29, dirección): sin entrada en `figuras.json`. **Rodapié recto RESUELTO (2026-07-31, indicación directa): «no tiene incremento»**, o sea que el canto recto se cobra a la misma tarifa que el romo/microbiselado de su altura; vuelve a la galería como tres de las nueve figuras de rodapié. |
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
- Peldaño romo: tapa única con el canto delantero **romado**. **2026-07-31 (indicación
  directa):** NO es una media caña. Se dibujó como semicircunferencia de radio medio grosor
  (leyendo así el dibujo de la tarifa) y el taller lo corrigió: en sección salía una «U»
  tumbada y el canto real es una «D» de lomo plano — la curva recorre el espesor entero pero
  vuela solo **un cuarto** de él (`VUELO_ROMADO` en `src/piezas/seccionPieza.ts`), así que la
  cara frontal queda casi recta con las dos esquinas matadas. El vuelo exacto sigue siendo
  PROVISIONAL: es un cuarto por indicación, no por croquis acotado.
- Rodapiés: listón de pie con el canto superior rematado de tres maneras (2026-07-31):
  **romado** («Rodapeu romat o bisellat» de la tarifa y la banda clara del dibujo),
  microbiselado y recto. El romado es el mismo canto del peldaño tumbado (cruza el grueso
  entero, sube un cuarto de él — la «D» de lomo plano, no una media caña), por coherencia: la
  tarifa los llama «romat» igual. **El chaflán del microbiselado es PROVISIONAL**: se dibuja a
  0,15 grosores porque ninguna medida de taller lo fija todavía (`CHAFLAN_MICROBISEL` en
  `seccionPieza.ts`). Solo afecta a la representación — ni a la tarifa ni a la ocupación.
- Grosor de baldosa en el visor: constante provisional 10 mm (no existe el dato; ¿vive en el ERP?).
- Giro de 90° de la baldosa: hoy se prueban ambas orientaciones y se elige la que quepa
  (regla exacta por figura pendiente del croquis, §4).
- **2026-07-28 (revisión del maestro):** figuras 1–4 marcadas como «revisar diseño», sin
  más detalle — se esperan las correcciones concretas o el croquis. Peldaño romo y
  rodapiés (7,2/8 y no estándar) dados por OK; «rodapié recto» sigue sin tarifa (§6.6).
  Nuevas figuras pedidas: **pasamanos 1, 2, 3 y 4** y **pasamanos romo**.
- **2026-07-29 (pasamanos creados):** los cinco pasamanos ya están activos en
  `figuras.json` con la MISMA receta que su peldaño equivalente más la manipulación en el
  lado opuesto (`frontal-trasero`, `retorno-trasero` en Pasamanos 4, doble canto romado en
  Pasamanos romo), por indicación directa del encargo. Su tarifa (`pasamanos-*` en
  `tarifas.json`) repite PROVISIONALMENTE el precio del peldaño equivalente — confirmar
  tarifa real con taller (§6.6); el croquis acotado sigue pendiente para todos.
- **2026-07-29 (figuras pendientes retiradas de la galería, a petición de dirección):**
  Figura 5, vierteaguas y rodapié recto ya NO aparecen en `figuras.json` (el estado
  'pendiente' sigue soportado en código por si se reincorporan). Su seguimiento queda
  en esta lista (§1.5, §1.6): para reactivar una, rellenar su receta y tarifa y darla
  de alta como 'activa'.
- **2026-07-31 (los rodapiés pasan de dos figuras a nueve, indicación directa):** tres alturas
  (7,2 · 8 · a medida) por tres cantos (recto · microbiselado · romado). En las de 7,2 y 8 la
  altura ya NO se teclea: va en el nombre y se declara con `valorFijoCm`, así que `opcionesCm`
  se queda sin ninguna figura que lo use (la regla sigue en el motor y con test propio). Las
  nueve comparten las dos tarifas de siempre porque el canto no cambia el precio, y las
  nueve llevan `medidaPorMetros` (segundo modo de cálculo: metros + unidades → largo por
  pieza). Pendiente de taller: confirmar el chaflán del microbiselado y si «a medida» debería
  tener algún tope de altura (hoy solo el mínimo de 1 cm).
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
3 bis. **Acabados de canto del corte de piezas (2026-07-31, indicación directa):** dados de alta como suplementos `porCm` — inglete 0,034 €/cm, microbisel 0,034 €/cm, sin microbisel 0 €. Dos cosas quedan por confirmar, y las dos mueven el precio:
    - **¿Son excluyentes?** Se han montado como casillas independientes, que es el mecanismo que ya existía, así que hoy se pueden marcar inglete y microbisel a la vez y se cobran los dos. Si un canto solo puede tener un acabado, hay que convertirlos en una elección única (grupo excluyente en `tarifas.json` + UI de radio).
    - **¿Sobre qué longitud?** Se cobran sobre la longitud de tarifa de la figura, o sea el **perímetro** entero (ligado al punto 3). Si el inglete va solo en uno o dos cantos, la longitud a cobrar es otra y hace falta decir cuáles.
4. **~~Material manual con origen "pedido"~~ — RESUELTO 2026-07-30 (indicación directa).** Al pasar a facturar por cajas completas también en stock, el alta manual se quedaba sin salida (ya no valía cambiar el origen a Stock). Decidido: el formulario pide **piezas por caja** como campo obligatorio. Los m²/caja NO se piden: se derivan del formato (`piezas × largo × ancho`), exacto y sin pérdida al cuantizar a mm². El origen de material se suprimió por completo.
5. **Validación sobre mm redondeados:** 7,15 cm → 72 mm cumple un mínimo de 7,2 cm. ¿Correcto o se rechaza antes de redondear?
10. **Modo «por metros» de los rodapiés (2026-07-31, indicación directa):** el largo de cada pieza sale de `metros × 100 ÷ unidades` y se redondea a mm como cualquier medida tecleada, así que el total facturado puede quedar unos milímetros por encima o por debajo de los metros pedidos (10 m en 3 piezas → 333,3 cm cada una = 9,999 m). La UI enseña los dos números para que el comercial lo vea. **Pendiente de confirmar con taller:** si en vez de repartir exacto habría que redondear el largo a la baja (y quedarse corto) o al alza (y pasarse), y si «unidades» debería poder deducirse de un largo estándar de barra en vez de teclearse.
6. **Transporte 40 €** (condiciones de la tarifa PDF): no tiene línea en el desglose de §1 y no se ha incluido. ¿Se cotiza aquí o fuera?
7. **Mensajes de "no cabe"/incompatibilidad acortados (2026-07-24), a petición directa de dirección:** ya no citan literalmente el estilo largo de §1.③ (p. ej. "La longitud pedida es X cm; este formato solo permite Y cm en la orientación necesaria." → "La pieza mide X cm; el formato solo llega a Y cm."). Si taller/spec exige el texto largo exacto, avisar antes de dar esto por definitivo.
8. **Lógica de cálculo ERP (2026-07-28, maestro):** «falta aplicar la lògica de càlcul». El maestro entregará un documento nuevo con esa lógica; al recibirlo se implementa en `src/domain/engine/` y se valida contra casos dorados (§3). No se implementa nada por suposición (§0).
9. **Empaquetado: varias piezas por baldosa (2026-07-28, dirección):** la regla «una pieza = una baldosa de origen» estaba mal para piezas pequeñas (3 piezas de 10×10 cm NO necesitan 3 baldosas de 110×110). Implementado como REJILLA PROVISIONAL en `src/domain/engine/ocupacion.ts` (`piezasPorBaldosa`): `baldosasNecesarias = ceil(cantidad / piezasPorBaldosa)` y la merma se aplica después sobre esas baldosas. Se mantiene la veta §4 por pieza (los componentes de UNA pieza salen de la misma baldosa); no se mezclan piezas en la misma fila ni se reutilizan sobrantes (§8). Si el documento de lógica del maestro (punto 8) define otro empaquetado, este se reemplaza.

### Datos y catálogo
7. **TARP se asume €/m²** (material manual: €/unidad). Confirmado como razonable por el contrato real del catálogo (2026-07-24: `docs`/API `studio.ferrolan.es/cataleg/`). Desde el 2026-07-31 el comercial ya NO puede editar ese precio a mano: la única salida es «Azulejos no incluidos» cuando el material lo aporta el cliente.
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
16. **Adjuntos de la orden (clip en «Comentarios para taller», 2026-07-31):** el comercial
    puede enganchar documentos (plano del cliente, foto de obra…). Sin servidor (§8) viven solo
    en la sesión del navegador: los que son **imagen** (PNG/JPEG/WebP) se incrustan como páginas
    al final de la orden de trabajo, y los demás (PDF, DWG, hoja de cálculo) **solo se citan por
    nombre** en la hoja, marcados «(aparte)» — jsPDF no fusiona documentos. Topes provisionales:
    6 documentos × 5 MB (`src/orden/adjuntos.ts`). **Pendiente de dirección:** ¿hace falta
    archivarlos o enviarlos de verdad (correo/ERP)? Eso requiere servidor. ¿Y aceptar HEIC del
    móvil, que hoy no se incrusta? **Desde 2026-07-31 van también en la orden del PEDIDO**, al
    final y detrás de las hojas de pieza (son del pedido entero, no de una pieza).
17. **Capturas del manual de usuario desatrasadas (2026-07-31):** el texto de
    `scripts/generar-manual.mjs` ya cubre el pedido, los adjuntos y «azulejos no incluidos», pero
    las nueve imágenes de `docs/manual-usuario/img/` son de ANTES de esos cambios: se hacen a mano
    y no hay forma de generarlas desde el repo. Las que más cantan son `01-vista-general.png` y
    `06-cotizacion.png` (la botonera cambió y falta la casilla de azulejos), y no hay ninguna del
    pedido ni del clip de adjuntos. **Pendiente:** rehacerlas con la app en marcha.

## 5. Fuera de alcance de la v1 (§8) — no construido, se retoma tras validación en uso real

Login y roles · backoffice · offline/PWA · base de datos propia · sincronización nocturna ·
reutilización de sobrantes · flujo de estados de órdenes · auditoría de cambios.

## 6. Margen comercial — IMPLEMENTADO (indicación 2026-07-31)

**La regla.** Cada artículo pertenece a una **subfamilia**, que son los **4 primeros
dígitos de su referencia** (la referencia `94111301` es de la subfamilia `9411`,
CASA INFINITA). La tabla del ERP da para cada subfamilia dos márgenes:

- **MTP** → margen PVP. Es el que sale por defecto.
- **MTC** → margen contratista. En las 726 filas MTC ≤ MTP.

Se aplica a **material, manipulación (suplementos incluidos) y arranque de
máquina**: a todo lo que se factura.

**Es un margen SOBRE COSTE (markup):** `precio = coste × (1 + m/100)`. No es una
suposición: 77 subfamilias tienen MTP ≥ 100 y llegan a 200, y un margen sobre
precio de venta del 100 % sería una división por cero.

**Dónde vive.** `scripts/generar-margenes.mjs` (`npm run margenes`) convierte el
CSV del ERP —que viene en **cp1252**, no UTF-8— a `public/config/margenes.json`,
con los márgenes en centésimas de punto enteras. La lógica está en
`src/domain/engine/margen.ts`; el selector, en «Parámetros avanzados».

### Decisiones tomadas (indicación directa, 2026-07-31)

1. **Orden de redondeo:** el margen se aplica **línea a línea**, cada una con un
   único redondeo half-up, no sobre el total. Es lo que hace que el desglose que
   se ve en pantalla y en la orden de trabajo **sume** el total: aplicándolo al
   total, la suma de las líneas no cuadraría con el subtotal. Efecto a tener
   presente: el importe de una línea pasa por **dos** redondeos (el del coste y
   el del margen), así que puede quedar a un céntimo de lo que daría una fórmula
   con el margen incorporado. Si taller quiere el céntimo exacto de la otra
   forma, hay que meter el margen dentro de `aplicarTarifaLineal` y del cálculo
   de material, y volver a capturar los casos dorados.
2. **Precio editado a mano:** es **coste**, el margen va encima. Igual que la
   tarifa.
3. **Orden de trabajo:** lleva **los mismos importes que la pantalla**, ya con
   margen. Un solo documento. Nota: eso significa que taller ve precios de venta.
   El PDF **no imprime** el porcentaje ni el tipo de margen, para que la hoja
   pueda enseñarse sin delatar el margen.
4. **Artículos sin subfamilia en la tabla** (486 de 28.732, el 1,7 %): **no se
   cotizan**. La herramienta lo dice con la referencia y el prefijo concretos, y
   el margen se puede indicar a mano en «Parámetros avanzados» —en un bloque
   aparte, no debajo del selector de tipo— hasta que la subfamilia se añada a la
   tabla. No se inventa un margen ni se cotiza a coste sin avisar.
5. **Subfamilia obligatoria en el alta manual.** Antes era un campo opcional «para
   el futuro»; ahora es la clave del margen, así que sin ella no hay precio.
6. **Casos dorados:** el JSON admite `margenCentesimas` y `tipoMargen`. Sin ellos
   el caso se entiende **a coste** (margen 0), que es lo que son los capturados
   antes de esta fecha; `ejemplo-001.json` lo dice explícitamente.
7. **Ningún precio en pantalla es de coste** (ampliación del mismo día, indicación
   directa: «en las cerámicas de la derecha no has aplicado los márgenes»). Además
   de la cotización y de los suplementos del paso ④, llevan margen las **tarjetas
   del catálogo** y la tarjeta-resumen del paso ①. Cada tarjeta del catálogo con el
   margen de **su propia** subfamilia, resuelto artículo a artículo con la misma
   regla del motor: no sirve el margen del resultado, porque en el catálogo hay
   hasta 48 artículos a la vez de subfamilias distintas. El artículo sin margen en
   la tabla pone **«Precio sin margen»** en vez de su tarifa: enseñar la tarifa ahí
   sería dar un coste con pinta de precio de venta.

### Lo que sigue abierto

- **Los 486 artículos sin subfamilia.** Conviene pasar la lista al ERP para que
  complete la tabla; mientras, cada uno exige teclear el margen a mano. Los
  prefijos que más aparecen: 2511, 2501, 2603, 2520, 2367, 1158, 1529.
- **Qué margen usar con material de alta manual** cuya subfamilia tecleada no
  esté en la tabla: hoy cae en el mismo camino del margen a mano.
- **§4.8 deja de ser bloqueante para esto.** El margen ya no depende de resolver
  `idmarca`: la subfamilia sale de la referencia, que sí tenemos para todos los
  artículos. La duda del nombre de marca sigue abierta, pero solo afecta al
  filtro por marca del catálogo.

**Se mantiene la recomendación, y está implementada:** «oculto para el cliente» y
«oculto para el comercial» no son lo mismo. «Parámetros avanzados» va plegado y al
final, pero cuando se abre dice siempre qué margen se está aplicando y de qué
subfamilia sale, para que nadie presupueste con el margen equivocado sin enterarse.

---

## 7. Merma por formato — IMPLEMENTADA (indicación 2026-07-31)

**La regla, tal como se indicó:** «de 30x60 y menores, 10 %; va subiendo hasta el
20 % en 60x120 (escalado lineal); y se queda en 20 para todo lo mayor». Las
figuras numeradas suman 5 puntos.

Implementado en `src/domain/engine/merma.ts`, con los valores en
`parametros.json` (dato, no código). Es una **sugerencia**: el comercial la
sobrescribe, y la sugerida sigue visible al lado para que se vea que la edición
fue deliberada.

**Interpretaciones que se tomaron (confirmar si alguna no era la intención):**

1. **Interpola sobre el LADO MAYOR, no sobre la superficie.** Los dos extremos
   dados —30x60 y 60x120— se diferencian en que el lado mayor pasa de 60 a 120, y
   «escalado lineal» es escala de longitud. Consecuencia visible: **una baldosa de
   60x60 se queda en el 10 %**, igual que la de 30x60, aunque tenga el doble de
   superficie. Si la intención era que subiera, el criterio es la superficie y hay
   que cambiar `mermaPorFormatoCentesimas`.
2. **El +5 % es ADITIVO** (10 → 15, y 20 → 25), no un 5 % relativo.
3. **Sin tope por arriba:** una figura numerada sobre baldosa grande llega al
   25 %.
4. **Lo llevan las ocho figuras con número:** `figura-1..4` y `pasamanos-1..4`
   (misma geometría reflejada). NO lo llevan peldaño romo, pasamanos romo, los nueve
   rodapiés, el corte **ni la tabica** — su nombre no lleva número, aunque sea «una
   figura 1 con zócalo». Este último es el más dudoso de los cuatro.

Valores que salen de la regla, para revisarlos de un vistazo:

| Formato | Lado mayor | Merma | Con figura numerada |
|---|---|---|---|
| 20x20, 30x30, 30x60, 60x60 | ≤ 60 | 10 % | 15 % |
| 75x75 | 75 | 12,5 % | 17,5 % |
| 80x80 | 80 | 13,33 % | 18,33 % |
| 90x90 | 90 | 15 % | 20 % |
| 100x100 | 100 | 16,67 % | 21,67 % |
| 60x120, 120x120, 120x280 | ≥ 120 | 20 % | 25 % |

---

## 8. Tabica — IMPLEMENTADA (indicación 2026-07-31)

**Lo indicado:** «una figura 1 con un corte debajo a modo de zócalo; el precio es
el de las dos combinadas; los parámetros son todos individuales menos el largo».

Implementada como figura **compuesta**: una sola pieza con **tres** componentes
(tapa, frontal, zócalo) que comparten el largo, y una **segunda tarifa**
(`tarifaAdicional` en `figuras.json`) que produce su propia línea de
manipulación. Así el desglose enseña de qué se compone el precio y cada parte
redondea una sola vez, en vez de encadenar redondeos.

- Parte «figura 1»: tarifa por umbral de la caída (≤ 5 cm / > 5 cm) sobre el largo.
- Parte «zócalo»: tarifa de corte sobre su perímetro, 2×(largo + altura zócalo).
- Medidas: ancho, largo, altura frontal (mínimo 4 cm, heredado) y altura del zócalo.
  Las dos alturas se miden **desde la cara inferior de la tapa hacia abajo**, porque
  las dos piezas cuelgan de ahí; el zócalo suele bajar más que la caída.

**Interpretaciones que se tomaron (confirmar):**

1. **El zócalo sale de la MISMA baldosa** que la tapa y el frontal, como cualquier
   otro componente de una pieza (veta §4). Efecto práctico: suma a la ocupación,
   así que una tabica con zócalo alto puede no caber en la baldosa y el motor lo
   avisa. Si el zócalo se corta de otra baldosa, esto cambia y el material sale
   más caro.
2. **Suplementos:** hereda los cuatro de la figura 1 (angular, ranuras, goterón,
   espesado). Ninguno se aplica específicamente al zócalo.
3. **Merma:** NO lleva el +5 % de las figuras numeradas (ver §7.4).
4. **Croquis:** el zócalo cuelga **por detrás** del frontal, retranqueado un grosor,
   con su borde superior tocando la cara inferior de la tapa (corregido el
   2026-07-31: la primera versión lo puso a ras del frontal, prolongando la cara
   delantera, y no es eso). La nariz vuela y el zócalo queda metido hacia dentro.
   `croquisPendiente` sigue en `true`: las proporciones del dibujo son
   representativas, no un plano de taller.

## 9. Pedido con varias piezas — IMPLEMENTADO (petición 2026-07-31)

**Lo pedido:** «poder hacer varias piezas y meterlas en un carrito, generar un PDF
grande con todas, y así optimizar el uso de cajas: no usar una caja por cada corte
distinto sino una caja para todos los cortes mientras queden piezas en ella».

**El problema que resuelve.** La caja es del ARTÍCULO, pero se estaba facturando
por CORTE: dos piezas del mismo material que necesitan 1 baldosa cada una se
cobraban como 2 cajas de 4 — 8 baldosas compradas para usar 2. Cotizando el
pedido entero, las cajas se cuentan una sola vez sobre la suma de baldosas de
todas las piezas de ese artículo.

**Cómo está montado:**

- `src/domain/engine/pedido.ts` (`calcularPedido`) — motor puro. Agrupa las líneas
  por artículo (`claveGrupoMaterial`) y factura las cajas por grupo.
- `src/domain/engine/cotizacion.ts` se partió en `calcularLinea` (lo que es de la
  pieza) y `facturarMaterial` (lo que es del artículo). `calcularCotizacion` es
  ahora la composición de las dos, y devuelve **exactamente lo mismo que antes**:
  una pieza suelta es un grupo con una sola línea.
- `src/ui/state/quote-state.tsx` — el carrito (`carrito: LineaCarrito[]`), que
  persiste en `localStorage` (`carrito-persistencia.ts`, versionado; cualquier
  problema al leer = pedido vacío, nunca un error en pantalla).
- `src/pdf/ordenPedido.ts` — PDF multipágina: hoja de resumen (piezas, material y
  cajas, importes) + una hoja por pieza. Los bloques son los mismos de
  `ordenTrabajo.ts`, extraídos a `src/pdf/maqueta.ts`.

**Decisiones tomadas que hay que CONFIRMAR con taller/dirección:**

1. **Arranque de máquina: uno por MATERIAL, no uno por pedido ni uno por pieza.**
   §2 dice «una sola vez por orden»; con un solo material el resultado es idéntico
   al de siempre, y con varios se cobra uno por cada uno porque cambiar de baldosa
   obliga a volver a preparar la máquina. **Es la interpretación más conservadora
   que no cambia el comportamiento existente, pero no está confirmada:** puede que
   taller quiera uno por corte (más caro) o uno por pedido (más barato). Es el
   punto con más impacto en el precio de esta entrega.
2. **Las baldosas se siguen contando POR PIEZA** y luego se suman. No se mezclan
   cortes distintos dentro de una misma baldosa: la veta §4 y la receta de
   ocupación siguen siendo por pieza. Lo que se comparte es la CAJA, no la
   baldosa. Aprovechar el sobrante de una baldosa para otro corte sigue fuera de
   alcance (§5, «reutilización de sobrantes»).
3. **Un artículo, un precio.** Si dos piezas del mismo artículo llevan distinto
   precio de material editado a mano o distinto margen, el pedido NO se cotiza y
   lo dice: no hay forma no arbitraria de decidir con cuál de los dos se compran
   las cajas.
4. **El pedido no se numera en servidor** (§8, sin base de datos): el código es
   `PED-<AAAAMMDD-HHMM>`, con el prefijo distinto del `OT-` de una pieza suelta.
   Si dos comerciales sacan un pedido en el mismo minuto, el código se repite.
5. **El PDF no lleva importes en las hojas de pieza**: van todos en el resumen.
   Se hizo así porque las cajas son del artículo y ponerlas junto a una pieza haría
   creer que son solo suyas. Confirmar que taller no echa de menos el precio en la
   hoja que se lleva a la máquina.
6. **Sigue existiendo el PDF de UNA pieza** («Generar PDF de esta pieza»), sin
   tocar. Si el pedido lo sustituye del todo, se puede retirar.
