# Catálogo de materiales: fuentes de datos

Este documento explica cómo obtiene Atelier Studio los materiales cerámicos que se cotizan:
la interfaz `FuenteCatalogo`, el catálogo real (índice de búsqueda local + API del catàleg de
ceràmica), el catálogo de muestra, la entrada manual y la resolución de imágenes PrestaShop con
su fallback de textura. Va dirigido a quien mantenga la capa `src/data/`, configure la conexión
con el API o depure problemas de búsqueda de materiales. No cubre las reglas de cotización (el
motor de `src/domain/engine/`) ni las tarifas de manipulación de `public/config/`.

## Formato del índice: tuplas y el campo «imagen» (2026-07-30)

`public/data/indice-cataleg.json` guarda cada artículo como **tupla compacta**
`[referencia, titulo, imagen]`, sin nombres de campo: repetidos ~33.000 veces
costaban más de 1 MB. Lo escribe así `scripts/generar-indice-cataleg.mjs` y lo lee
`fuenteIndiceCataleg.ts`.

El tercer elemento es **número o cadena**:

- **Número** → id de imagen de PrestaShop. La URL se reconstruye como
  `https://ferrolan.es/<id>/<slug(titulo)>-<referencia>.jpg`. Es el 94,6 % de los
  artículos.
- **Cadena** → la URL completa, para lo que no encaja en ese patrón (títulos cuyo
  formato no coincide con el de la URL, imágenes de categoría `/c/<id>-…`).

Las URL enteras eran el **62 % del índice** (2,23 MB de 3,89 MB), con 0,55 MB solo
de prefijo repetido. Compactarlas dejó el índice en **1,84 MB** (0,29 MB en gzip,
frente a 0,51 MB antes). La regla vive en `src/data/imagenIndice.mjs`.

**Por qué ese módulo es `.mjs` y no `.ts`:** lo importan la app (por Vite) **y** el
indexador, que es Node puro y se ejecuta en el cron de Plesk sin devDependencies.
Así la regla existe una sola vez. Si estuviera duplicada, el indexador podría
compactar con una regla y la app reconstruir con otra, y el síntoma serían
imágenes rotas en todo el catálogo. Los tipos los da `imagenIndice.d.mts`.

**La garantía que hace esto seguro:** el indexador solo guarda un id si la URL
reconstruida sale **idéntica** a la real (`compactarImagen`). Si PrestaShop cambia
su regla de slug, el índice tendrá más excepciones y pesará más; nunca imágenes
rotas.

**Si cambias el formato, regenera el índice en el mismo commit.** El lector
desestructura la tupla, así que un índice en el formato antiguo (objetos) lanza
`object is not iterable` y el catálogo deja de funcionar por completo — no
degrada, se cae. Los tests usan sus propias fixtures, así que **no** detectan el
desajuste con el archivo real: compruébalo abriendo el catálogo en el navegador.

### Títulos: entidades HTML doblemente escapadas

El sitemap entrega los títulos con entidades **dos veces escapadas**
(`B&amp;amp;W`). Sin decodificarlas, el comercial veía literalmente
«EQUIPE CAPRICE BALANCE B&amp;amp;W MATE 20X20» en pantalla (55 artículos). El
indexador las decodifica al construir el índice (`desescaparTitulo`, decodifica
hasta que el texto deja de cambiar), así que el título guardado ya es el bueno —
y es además el que se usa para reconstruir la URL, así que **no se puede
transformar al cargar** sin romper las imágenes.

## Visión general: una interfaz, tres orígenes

La UI de búsqueda (`src/ui/steps/CatalogoPanel.tsx`) solo conoce la interfaz `FuenteCatalogo`
(`src/data/catalogo.ts`). Detrás hay dos implementaciones, más el alta manual:

| Origen | Módulo | `origen` | Qué aporta |
|---|---|---|---|
| Catálogo real | `src/data/fuenteIndiceCataleg.ts` + `src/data/fuenteCataleg.ts` | `'cataleg'` | Búsqueda por texto sobre un índice local; tarifa y mides autoritativos en vivo desde el API |
| Muestra | `src/data/fuenteMuestra.ts` | `'muestra'` | JSON local de desarrollo, marcado como DATOS FALSOS (§7.3) |
| Entrada manual | `src/ui/steps/EntradaManual.tsx` + `crearMaterialManual` | — (`esManual: true`) | Alta a mano de cerámica que no está ni en ERP ni en PrestaShop |

`obtenerFuenteCatalogo()` (`src/data/catalogo.ts:103`) devuelve la fuente activa: hoy, el índice
real. La muestra sigue disponible como alternativa sin red, pero ya no es el valor por defecto.

## La interfaz `FuenteCatalogo`

Definida en `src/data/catalogo.ts`:

```ts
export interface FuenteCatalogo {
  readonly origen: 'cataleg' | 'muestra';
  buscar(consulta: ConsultaCatalogo): Promise<ResultadoBusquedaCatalogo>;
  marcas(): Promise<readonly string[]>;
}
```

- `ConsultaCatalogo`: `texto` (texto libre), `marca` (`null` = todas), `pagina` (1-indexada) y
  `tamanoPagina`, acotado a `TAMANO_PAGINA_MAXIMO = 50` porque el lote del API real admite como
  máximo 50 códigos por llamada (`src/data/catalogo.ts:30`).
- `ResultadoBusquedaCatalogo`: los `materiales` de la página y `totalCoincidencias`, para que la
  UI pinte «página X de Y».
- `origen` existe para que la UI pueda marcar la muestra como falsa (§7.3).

Todas las fuentes devuelven `Material` (`src/domain/types.ts`), con las reglas de oro del
proyecto ya aplicadas: precios en céntimos enteros y formato en milímetros enteros (la conversión
se hace en el punto de entrada con `eurosACentimos` y `cmAMm`; prohibido float).

| Campo de `Material` | Contenido |
|---|---|
| `referencia` | `codigo` del catálogo, o `MANUAL-<timestamp>` en entrada manual |
| `descripcion` / `marca` | Texto libre; la marca es `null` con datos reales (ver más abajo) |
| `formato` | `{ largoMm, anchoMm }`, enteros |
| `precioM2Centimos` | Tarifa TARP (€/m²); `null` en material manual |
| `precioUnidadCentimos` | Precio por baldosa; solo en material manual |
| `piezasPorCaja` / `m2PorCaja` | Logística de facturación: **obligatorios**, todo se factura por cajas completas |
| `imagenUrl` | Textura/imagen; `null` si no hay |
| `esManual` | `true` si se dio de alta a mano |

## Catálogo real: índice local + API del catàleg

### Por qué hacen falta dos piezas

El «API del catàleg de ceràmica» (`studio.ferrolan.es/cataleg/`, §6.13) es una réplica de solo
lectura de la sección CE del ERP (~55.000 artículos, actualizada 2 veces al día), pero **no tiene
endpoint de listado ni de búsqueda por texto**: solo consulta por código. El sitemap público de
ferrolan.es sí lista cada artículo publicado, con una URL que termina en el mismo código y su
imagen. De ahí la arquitectura (PENDIENTES.md §4.8):

1. Un **índice local** (`public/data/indice-cataleg.json`) sirve la búsqueda por texto.
2. El **API real** aporta tarifa y mides autoritativos en el momento de buscar.

Pedir al responsable del ERP un endpoint de listado/búsqueda sigue siendo la solución de fondo,
pendiente: sin él, el índice se desincroniza del catálogo real (artículos nuevos que no aparecen,
códigos que dejan de coincidir).

### Generar el índice: `npm run indice:cataleg`

El script `scripts/generar-indice-cataleg.mjs` regenera `public/data/indice-cataleg.json`:

```bash
npm run indice:cataleg
```

- Descarga el índice de sitemaps (`https://ferrolan.es/1_index_sitemap.xml`) y cada sub-sitemap.
- De cada `<url>` con `<image:image>` extrae la **referencia** (el código va al final del último
  tramo de la URL, con un mínimo de 4 dígitos), el **título** (`image:title`) y la **imagen**
  (`image:loc`). Ignora páginas sin código y artículos sin imagen publicada; deduplica por
  referencia.
- Tarda ~15-30 s: hace una pausa de 2 s entre peticiones por respeto al servidor.
- Conviene reejecutarlo periódicamente (el catálogo cambia); no hay automatismo todavía
  (PENDIENTES.md).

La salida tiene esta forma (el `_aviso` recuerda que no se edita a mano):

```json
{
  "_aviso": "GENERADO por scripts/generar-indice-cataleg.mjs a partir del sitemap público de ferrolan.es (no editar a mano). …",
  "generadoEn": "2026-07-27T…",
  "articulos": [{ "referencia": "…", "titulo": "…", "imagenUrl": "…" }]
}
```

El índice **no** es la fuente de verdad de precio ni mides: eso se consulta en vivo por código al
API. Se sirve colgando de `import.meta.env.BASE_URL` porque la app vive bajo `/atelier-studio/`.

### Cómo busca `fuenteIndiceCataleg.ts`

Estrategia de `buscar()` (cabecera de `src/data/fuenteIndiceCataleg.ts`):

1. **Filtro local** sobre referencia + título, instantáneo y sin red, contando el total de
   coincidencias. La comparación (`coincideBusqueda` / `normalizarTexto`,
   `src/data/busqueda.ts`) pasa a minúsculas y elimina diacríticos; deben aparecer **todos** los
   términos en alguno de los campos, y el texto vacío coincide con todo.
2. **Enriquecido en lote** de solo la página pedida: UNA llamada `?accio=articles`
   (`obtenerArticulosCataleg`) con los códigos candidatos. El tamaño de página está acotado a 50
   (el límite del propio lote), así que nunca hace falta trocear. Junto con el debounce de 200 ms
   de `CatalogoPanel.tsx`, se respeta el límite de 120 peticiones/minuto del proveedor.
3. **La imagen se toma del índice** (real, de PrestaShop vía sitemap), no del API, que no tiene
   campo de imagen: machaca lo que devuelva el mapeo.
4. **Consulta directa por referencia exacta**: si el texto buscado son solo dígitos (≥4) y no hay
   coincidencia local en la página 1, se hace UNA llamada `?accio=article&codi=…`
   (`obtenerArticuloCataleg`). Así aparecen artículos que están en el API pero no en el sitemap
   (sin página pública); esos resultados usan el patrón de imagen PrestaShop si está configurado.

Detalles a tener en cuenta:

- **Marca**: el índice no conoce la marca (`idmarca` del API es un id numérico sin nombre
  resuelto, PENDIENTES.md §4.8). `marcas()` devuelve `[]` — el selector de marca se oculta en la
  UI — y buscar con filtro de marca devuelve cero resultados.
- **Artículos ocultos** (`public/config/catalogo.json`): `referenciasOcultas` excluye por
  referencia (zócalos y piezas especiales) y `palabrasTituloOcultas` por palabra contenida en
  el título, comparando normalizado (minúsculas, sin diacríticos: «RODAPIE» cubre «RODAPIÉ …»)
  — mosaicos y rodapiés, producto acabado (dirección 2026-07-28). El filtro aplica a la
  búsqueda por texto (ni se muestran ni cuentan en el total) y a la consulta directa por
  referencia; `generar-indice-cataleg.mjs` aplica la misma regla al regenerar el índice. Si el
  JSON no carga, se busca sin filtrar (nunca bloquea el catálogo).
- Los artículos `sin_medidas` o no encontrados en el lote se **omiten** del resultado: no se
  puede construir un `Material` válido sin inventar un formato; «Entrada manual» cubre ese alta.
- Si el índice no carga, el error sugiere ejecutar `npm run indice:cataleg`, y `CatalogoPanel`
  muestra un estado de error recuperable con reintento, sin romper el resto de la app.

### El API del catàleg (`fuenteCataleg.ts`)

Cliente HTTP de `studio.ferrolan.es/cataleg/`. Llama **siempre** a `/api/cataleg/` (mismo origen,
raíz absoluta a propósito: es una `location` de nivel servidor, no cuelga de `BASE_URL`) y no
conoce ninguna clave — la añade el proxy (ver la sección siguiente). El registro de artículo
documenta 31 campos, con claves en minúscula y `null` (no omisión) cuando un campo no tiene
valor; el código los lee con helpers tolerantes (`campoTexto`, `campoNumero`, que admite decimales
con coma) en lugar de confiar en los tipos del proveedor.

| Llamada | Función | Clave |
|---|---|---|
| `?accio=article&codi=…` | `obtenerArticuloCataleg` | Vía proxy |
| `?accio=articles&codis=…` (máx. 50 códigos) | `obtenerArticulosCataleg` | Vía proxy |
| `?accio=salut` | `consultarSaludCataleg` | Sin clave ni tarifas |

Gestión de errores: 404 se traduce a `'no_trobat'`; 401 pide avisar al responsable del ERP; 429
respeta la cabecera `Retry-After`. El `actualitzat` de `salut` sirve para monitorizar: si
envejece más de ~14 h, es un fallo de sincronización del lado del ERP, no un bug de la app
(PENDIENTES.md §4.8).

### Mapeo `mapearArticuloCataleg`

Adaptador del registro del API a `Material` (`src/data/fuenteCataleg.ts:142`); es el punto único
de ajuste si el proveedor añade campos. Lanza si falta `codigo` o `descrip` (mejor fallar rápido
que cotizar un artículo sin identificar).

| Campo del API | Campo de `Material` | Notas |
|---|---|---|
| `codigo` | `referencia` | Obligatorio |
| `descrip` | `descripcion` | Obligatorio |
| `tarp` | `precioM2Centimos` | **PROVISIONAL**: se asume TARP = €/m². Las hermanas `tarc`/`tara`/`taradc` existen pero su uso no está decidido (PENDIENTES.md §4) |
| `llarg` / `ample` (cm) | `formato` (mm) | Pueden ser `null` (~21.000 artículos sin fitxa web): entonces se extrae el formato de la descripción |
| `peces_caixa` | `piezasPorCaja` | Si llega `null`, se calcula desde `encaixat` (regla de taller 2026-07-27) |
| `encaixat` (m²/caja) | `m2PorCaja` | |
| `idmarca` | — | Es un id numérico sin nombre: `marca` queda `null` (PENDIENTES.md §4.8) |
| — | `imagenUrl` | Patrón PrestaShop (ver «Imágenes y textura») |

Reglas de rescate cuando faltan datos:

- **Formato desde la descripción** (`extraerFormatoDeDescripcion`): patrón «LARGOxANCHO» en cm
  («45X45», «60 x 120», «7,2×45»); el primer número es el largo y el segundo el ancho, tal como
  viene escrito (decisión 2026-07-27, PENDIENTES.md §4.8). Solo se usa cuando el API no manda
  mides. Si tampoco hay formato en el texto, el resultado es `{ tipo: 'sin_medidas' }` con
  referencia, descripción y precio: **nunca se inventa un formato** y la UI ofrece «Entrada
  manual» para completarlo.
- **Piezas por caja calculadas** (`piezasPorCajaDesdeEncaixat`): `round(encaixat ÷ m²/pieza)`,
  verificado contra datos reales («30x60 → 0,18 m²; 1,08 / 0,18 = 6 piezas»). Se aplica solo
  cuando `peces_caixa` llega `null`.

## El proxy `/api/cataleg/` y la clave `CATALEG_API_KEY`

Regla innegociable del proveedor: la clave `X-API-Key` **nunca** debe llegar al navegador (el
catálogo lleva tarifas de venta confidenciales). Por eso el navegador solo habla con
`/api/cataleg/`, mismo origen y sin clave, y la cabecera la añade el servidor:

- **Desarrollo**: el proxy de `vite.config.ts` reenvía `/api/cataleg` a
  `https://studio.ferrolan.es` (reescribe a `/cataleg`) e inyecta `X-API-Key` leyendo
  `CATALEG_API_KEY` del entorno con `loadEnv(mode, '.', '')` — el prefijo `''` permite leer
  variables sin `VITE_`.
- **Producción**: `nginx.conf.template` hace lo mismo con
  `proxy_set_header X-API-Key "${CATALEG_API_KEY}"` (volcada por `envsubst` al arrancar el
  contenedor). En el Plesk real `proxy_pass` no funciona y la `location` ejecuta la app del
  catálogo vía FastCGI con `fastcgi_param HTTP_X_API_KEY`; los detalles están en la sección
  «Despliegue» de `README.md`.

¿Por qué `CATALEG_API_KEY` no lleva prefijo `VITE_`? Porque Vite incrustaría cualquier variable
`VITE_*` en el bundle público de React y cualquiera podría descargarse el tarifario completo. Al
no llevarlo, solo la leen procesos de servidor (Node en desarrollo, nginx en producción). Está
explicado en `.env.example`. En cambio `VITE_PRESTASHOP_IMG_BASE` sí lleva el prefijo: es una
base de imágenes pública que el navegador necesita conocer.

## Catálogo de muestra (DATOS FALSOS, §7.3)

`public/data/catalogo-muestra.json` es un catálogo de desarrollo con referencias `MUE-*` cuyo
primer campo lo deja claro:

```json
{ "_aviso": "CATÁLOGO DE MUESTRA — DATOS FALSOS (§7.3)", "articulos": [ … ] }
```

`crearFuenteMuestra` (`src/data/fuenteMuestra.ts`) lo descarga una sola vez y lo cachea; la
búsqueda filtra por texto sobre descripción, referencia y marca, y `marcas()` devuelve las marcas
presentes ordenadas alfabéticamente. La URL es inyectable para tests. Pensado para trabajar sin
conexión con el ERP (§6.13/§6.14), ya no es la fuente por defecto, y el contrato
`FuenteCatalogo.origen = 'muestra'` existe para que la UI lo marque como falso (§7.3).

## Entrada manual

Para cerámica que no está ni en ERP ni en PrestaShop (§1.①), el paso ① incluye la subsección
plegable «Entrada manual» (`src/ui/steps/EntradaManual.tsx`), que crea el material con
`crearMaterialManual` (`src/data/catalogo.ts:69`) y lo selecciona en la cotización.

| Campo | Validación |
|---|---|
| Descripción | Obligatoria |
| Largo / ancho (cm) | Mayores que 0; admite coma decimal |
| Precio (€/unidad) | 0 o mayor |
| Imagen (URL) | Opcional |

El resultado es un `Material` con `referencia: MANUAL-<timestamp>` (identificador local: no forma
parte del cálculo ni afecta al determinismo), `esManual: true` y `precioM2Centimos: null`: el
material manual **se tarifa por unidad, sin tarifa TARP por m²**. La UI valida los campos antes
de llamar a la capa de datos, y si esta aún así lanza, muestra el mensaje sin romperse.

El alta manual pide además una **subfamilia** opcional (id numérico, 2026-07-30). Hoy **no entra en
ningún cálculo**: se recoge para poder aplicar el margen comercial en el futuro, que dependerá del
fabricante/familia (`PENDIENTES.md` §6). Los artículos del catálogo la traen a `null` porque el
contrato del API no la expone; si el margen va a depender de ella, habrá que pedirla al ERP.

El alta manual **sí** pide «piezas por caja» (2026-07-30): al facturarse todo por cajas completas,
sin ese dato el material no se podría cotizar. Los m²/caja no se piden, se **derivan** del formato
(`piezas × largo × ancho`): es exacto, sobrevive a la cuantización a mm² del motor y evita que el
comercial teclee un par de datos incoherente.

## Imágenes PrestaShop y fallback de textura

La relación entre sistemas es `catálogo.codigo = PrestaShop.reference`. La URL de imagen por
patrón la construye `urlImagenPrestashop` (`src/data/fuenteCataleg.ts:64`):

```
<VITE_PRESTASHOP_IMG_BASE>/<referencia>.jpg
```

El patrón es **PROVISIONAL**: falta confirmar el patrón real del web service (PENDIENTES.md §4,
«Imágenes PrestaShop»). Si no hay base configurada, devuelve `null`.

Prioridad de la imagen en los resultados reales:

1. **Imagen del índice** (real, de PrestaShop vía sitemap): manda siempre que hay coincidencia
   local; el API de catálogo no tiene campo de imagen.
2. **Patrón PrestaShop**: solo para hallazgos por referencia exacta que no están en el índice.
3. `null` si no hay nada.

Una pieza sin imagen nunca bloquea:

- Las tarjetas del catálogo (`src/ui/steps/ImagenMaterial.tsx`) muestran un placeholder
  «Sin imagen» si no hay URL o la carga falla.
- El visor 3D (`src/viewer/VisorPieza.tsx`, `src/viewer/materiales.ts`) carga la textura con CORS
  anónimo y, si no hay imagen o falla, muestra la pieza con **material neutro gris** más la
  insignia «Textura no disponible». La cotización sigue funcionando con normalidad.

## Tests

La capa de datos tiene un archivo de test por módulo en `tests/unit/data/` (`catalogo.test.ts`,
`catalogo-muestra.test.ts`, `fuenteMuestra.test.ts`, `fuenteCataleg.test.ts`,
`fuenteIndiceCataleg.test.ts`). Las factorías aceptan la URL del JSON como parámetro
(`crearFuenteMuestra(url)`, `crearFuenteIndiceCataleg(url, prestashopImgBase)`), lo que permite
probar la búsqueda y el mapeo sin red.

## Consulta también

- [Arquitectura general](./03-arquitectura.md) — mapa de `src/` y reglas de oro.
- [Configuración de negocio](./04-configuracion.md) — tarifas, figuras y parámetros de `public/config/`.
- [Despliegue](./11-despliegue.md) — nginx, Docker y la `location /api/cataleg/` en producción.
- [README.md](../README.md) — puesta en marcha y variables de entorno (`.env.example`).
- [PENDIENTES.md](../PENDIENTES.md) §4 («Datos y catálogo») — decisiones abiertas: endpoint de
  listado/búsqueda, nombre de marca, tarifas `tarc`/`tara`/`taradc` y patrón de imágenes.
