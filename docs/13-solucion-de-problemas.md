# Solución de problemas

Guía de diagnóstico para quien desarrolla o mantiene Atelier Studio. Cubre los fallos
habituales del catálogo de cerámica, las texturas del visor 3D, la configuración de
`public/config/`, las figuras bloqueadas, el entorno de desarrollo en Windows + Git Bash
y el contenedor Docker. Cada problema sigue el formato **síntoma → causa → solución**.

## El catálogo no carga o está vacío

Cómo funciona la búsqueda (contexto mínimo): el texto se filtra sobre un índice local
(`public/data/indice-cataleg.json`, generado del sitemap público de ferrolan.es) y los
datos autoritativos (tarifa, medidas) se piden por código al API real a través del proxy
same-origin `/api/cataleg/` (`src/data/fuenteIndiceCataleg.ts`, `src/data/fuenteCataleg.ts`).
La clave `X-API-Key` nunca llega al navegador: la añade el proxy de desarrollo
(`vite.config.ts`) o nginx en producción.

### Error «No se pudo cargar el índice del catálogo»

- **Síntoma:** la pestaña Catálogo muestra el error
  `No se pudo cargar el índice del catálogo: ... ¿Se ha ejecutado "npm run indice:cataleg"?`
- **Causa:** falta `public/data/indice-cataleg.json` o el servidor no lo sirve. El índice
  lo genera `scripts/generar-indice-cataleg.mjs` a partir del sitemap público de ferrolan.es.
- **Solución:** ejecuta el generador (tarda ~15–30 s) y recarga la app:

  ```bash
  npm run indice:cataleg
  ```

  Conviene regenerarlo periódicamente (el catálogo cambia y no hay automatismo todavía,
  ver `PENDIENTES.md` §4.8).

### Error 401: «El catálogo ha rechazado la clave de acceso»

- **Síntoma:** al buscar aparece `El catálogo ha rechazado la clave de acceso (401): avisa
  al responsable del ERP.` (`src/data/fuenteCataleg.ts`).
- **Causa:** falta `CATALEG_API_KEY` o no es válida. El proxy de desarrollo solo añade la
  cabecera `X-API-Key` si la variable existe (`vite.config.ts`); sin ella, el API rechaza
  la petición.
- **Solución:** copia `.env.example` a `.env`, rellena `CATALEG_API_KEY` (la facilita el
  responsable del ERP por canal seguro) y reinicia el dev server:

  ```bash
  cp .env.example .env   # edita CATALEG_API_KEY
  npm run dev
  ```

  No renombres la variable con prefijo `VITE_`: Vite la incrustaría en el bundle público
  y el tarifario quedaría expuesto (ver `.env.example`).

### En local funciona y en producción no

- **Síntoma:** en `https://studio.ferrolan.es/atelier-studio/` la búsqueda falla o
  `/api/cataleg/` devuelve 404, 502 o HTML en vez de JSON.
- **Causa:** falta la `location /api/cataleg/` en el nginx del servidor, o se configuró
  copiando el `proxy_pass` de `nginx.conf.template`. En el Plesk de producción ese
  `proxy_pass` **no funciona** (el nginx de ese servidor no puede hacer conexiones
  salientes): allí la `location` ejecuta la app del catálogo directamente vía FastCGI,
  con `rewrite` de `/api/cataleg/` → `/cataleg/` y la clave inyectada con
  `fastcgi_param HTTP_X_API_KEY` (ver la nota de despliegue del `README.md`).
- **Solución:** revisa el `.conf` incluido desde `atelier-studio_privat/` en el servidor
  y comprueba el endpoint de salud (no requiere clave):

  ```bash
  curl -i "https://studio.ferrolan.es/api/cataleg/?accio=salut"
  ```

  Debe responder JSON con `articles` y `actualitzat`. Verifica también que
  `https://<dominio>/atelier-studio_privat/...` da 403/404 (esa carpeta no debe ser
  accesible por web).

### «Límite de peticiones al catálogo alcanzado» (429)

- **Síntoma:** `Límite de peticiones al catálogo alcanzado; reintenta en N s.`
- **Causa:** el proveedor limita a 120 peticiones/minuto. La app ya acota las páginas a
  50 artículos (el máximo del lote del API) y no pide una petición por tecla
  (`src/data/fuenteIndiceCataleg.ts`), así que es raro verlo en uso normal.
- **Solución:** espera los segundos indicados (cabecera `Retry-After`) y reintenta. Si se
  repite con varios usuarios a la vez, coméntalo con el responsable del ERP.

### Un artículo que existe no aparece al buscar por texto

- **Síntoma:** el artículo está en el ERP pero la búsqueda no lo encuentra.
- **Causa:** el API real **no tiene endpoint de listado/búsqueda**, solo consulta por
  código (`PENDIENTES.md` §4.8). La búsqueda por texto depende del índice local, que puede
  estar desincronizado: artículos nuevos, sin página pública en ferrolan.es o sin imagen
  no aparecen en el sitemap.
- **Solución:**
  1. Regenera el índice: `npm run indice:cataleg`.
  2. Busca por referencia exacta (solo dígitos, mínimo 4): sin coincidencia local, la app
     hace una consulta directa `?accio=article&codi=…` al API.
  3. Si el artículo llega sin medidas ni formato en la descripción, dalo de alta con
     «Entrada manual» conservando el precio real.

  La solución de fondo (pedir al ERP un endpoint de listado) sigue pendiente, ver
  `PENDIENTES.md` §4.8.

### El filtro por marca no da resultados

- **Síntoma:** al elegir una marca, la búsqueda devuelve cero resultados.
- **Causa:** con datos reales, `Material.marca` queda `null`: el API expone `idmarca` como
  id numérico sin nombre resuelto, y con filtro de marca la fuente real no devuelve nada
  (`src/data/fuenteIndiceCataleg.ts`). Es una limitación conocida, no un fallo.
- **Solución:** quita el filtro de marca. Si se necesita ese filtro con datos reales, hay
  que pedir al proveedor el nombre asociado a `idmarca` (`PENDIENTES.md` §4.8).

### Los datos del catálogo parecen antiguos

- **Síntoma:** precios o artículos no reflejan cambios recientes del ERP.
- **Causa:** el catálogo es una réplica de solo lectura que se actualiza 2 veces al día,
  no en tiempo real. Si el campo `actualitzat` de `?accio=salut` lleva más de ~14 h sin
  moverse, es un fallo de sincronización del lado del ERP, no un bug de la app
  (`PENDIENTES.md` §4.8).
- **Solución:** avisa al responsable del ERP.

### Los materiales salen marcados como datos falsos

- **Síntoma:** la UI marca el origen del catálogo como FALSO (§7.3).
- **Causa:** estás viendo el catálogo de muestra (`public/data/catalogo-muestra.json`),
  que queda como alternativa sin red; la fuente activa por defecto es el índice real
  (`src/data/catalogo.ts`, `src/data/fuenteMuestra.ts`).
- **Solución:** ninguna si es intencionado (desarrollo sin red). Si no lo es, revisa los
  apartados anteriores: el índice o la clave del API están fallando.

## Las texturas no aparecen en el visor 3D

### Pieza gris con la insignia «Textura no disponible»

- **Síntoma:** el visor dibuja la pieza en gris neutro y muestra la insignia
  «Textura no disponible» (`src/viewer/VisorPieza.tsx`).
- **Causa:** es el comportamiento previsto, no un bloqueo: cuando la pieza no tiene imagen
  o la carga falla, el visor cae al material neutro (`src/viewer/materiales.ts`). Las
  imágenes llegan del índice (reales, de PrestaShop vía sitemap); los artículos encontrados
  solo por referencia exacta no tienen imagen de índice y usan el patrón
  `<base>/<referencia>.jpg` de `VITE_PRESTASHOP_IMG_BASE` (`src/data/catalogo.ts`).
  Ese patrón es **PROVISIONAL** (`PENDIENTES.md` §4.9). La carga se hace con CORS anónimo:
  si el servidor de imágenes no responde o no lo permite, la textura falla.
- **Solución:**
  1. Configura `VITE_PRESTASHOP_IMG_BASE` en `.env` y reinicia `npm run dev` (las
     variables `VITE_` se incrustan en el build: en producción exige rebuild).
  2. Comprueba en el navegador que `<base>/<referencia>.jpg` responde 200.
  3. Si una pieza concreta sigue sin textura, se puede cotizar igualmente: el aviso no
     bloquea el cálculo ni el PDF.

## Los cambios en `public/config/` no se ven

### Tarifas, parámetros o figuras editados no aparecen en la app

- **Síntoma:** editas `public/config/tarifas.json` (o `parametros.json`, `figuras.json`)
  y la app sigue mostrando los valores anteriores.
- **Causa:** la configuración se carga una sola vez al arrancar la app
  (`crearFuenteConfiguracionJson` en `src/domain/config.ts`). En producción y Docker se
  sirve con `Cache-Control: no-store` (`nginx.conf.template`) para poder cambiarla sin
  redeploy, pero la pestaña abierta conserva lo que ya cargó, y en desarrollo el navegador
  puede tener una copia en caché.
- **Solución:**
  1. Recarga forzada con Ctrl+F5.
  2. Abre directamente `<base>/config/tarifas.json` en el navegador para ver qué JSON está
     sirviendo el servidor.
  3. En Docker, ten en cuenta que los JSON quedan copiados dentro de la imagen (forman
     parte de `dist/`): reconstruye con `docker compose up --build` para aplicar cambios.

### La app no arranca: «Configuración inválida» o «No se pudo cargar la configuración»

- **Síntoma:** pantalla de error al iniciar con uno de esos dos mensajes.
- **Causa:**
  - `No se pudo cargar la configuración: <url>` — uno de los tres JSON no se sirve (404 o
    error de red).
  - `Configuración inválida:` seguido de una lista — el JSON carga, pero rompe la
    validación cruzada de `validarConfiguracion` (`src/domain/config.ts`): figura activa
    sin regla de tarifa, tarifa o suplemento desconocido, o componente que usa medidas no
    declaradas. Un JSON con sintaxis rota (coma de más, comillas) falla aún antes: el
    navegador no puede parsearlo y la carga se interrumpe con un error de parseo.
- **Solución:** corrige el JSON indicado por el propio mensaje (lista cada error concreto).
  No hace falta tocar código: las tarifas y figuras viven solo en `public/config/`.

## Figuras bloqueadas con estado «pendiente»

- **Síntoma:** una figura (p. ej. Figura 5) aparece en la galería
  pero no se puede seleccionar; muestra un motivo (p. ej. «Sin tarifa confirmada (§6.6)»).
  (Hoy no hay ninguna: las que estaban pendientes se retiraron de la galería el
  2026-07-29 a petición de dirección; ver `PENDIENTES.md` §1.5–§1.6.)
- **Causa:** tienen `estado: "pendiente"` en `public/config/figuras.json` con su
  `motivoPendiente`, porque taller no ha confirmado tarifa o croquis (§6.5/§6.6, ver
  `PENDIENTES.md`). Es deliberado: visibles pero bloqueadas. La insignia «croquis
  provisional» de las figuras activas también es esperada mientras no llegue el croquis
  acotado oficial (`PENDIENTES.md` §2).
- **Solución:** ninguna en la app. Cuando taller confirme, completa medidas, receta y
  tarifa de la figura en `figuras.json` y cambia su estado a `"activa"`. No inventes
  tarifas ni geometrías: la regla §0 lo considera un error.

## Desarrollo en Windows + Git Bash

| Síntoma | Causa | Solución |
|---|---|---|
| `npm run build` con base raíz falla o genera rutas raras | Git Bash convierte el flag `--base=/` por la conversión de rutas de MSYS (documentado en `vite.config.ts`) | Usa la variable de entorno: `MSYS2_ENV_CONV_EXCL=BASE_PUBLICA BASE_PUBLICA=/ npm run build` |
| El dev server no arranca o el puerto 5173 está ocupado | `vite.config.ts` fija `server.port: 5173` y ya hay otro proceso usándolo | Cierra la otra instancia de `npm run dev` o el proceso que ocupa el puerto |
| Módulos que no resuelven tras cambiar de rama o actualizar | `node_modules` desincronizado con `package-lock.json` | Reinstala con `npm ci --no-audit --no-fund` (el mismo comando que usa CI) |
| Falla un caso dorado (`tests/golden/*.json`) | Por regla del proyecto, **el motor está mal, no el caso** (`AGENTS.md`) | No edites el caso dorado; corrige `src/domain/engine/` |
| `npm run lint` falla con avisos aparentemente menores | El script usa `--max-warnings 0`: cualquier warning es error | Corrige los warnings; CI (`.github/workflows/ci.yml`) exige lo mismo |

La verificación completa antes de dar una tarea por buena es:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

## Docker

Comprobaciones básicas del contenedor (`Dockerfile`, `docker-compose.yml`):

```bash
docker compose up --build        # app en http://localhost:8080 (mapea 8080:80)
docker ps                        # debe mostrar (healthy): el HEALTHCHECK pide / cada 30 s
docker compose logs              # arranque de nginx y envsubst de la plantilla
```

### El catálogo no funciona dentro del contenedor

- **Síntoma:** la app carga en `http://localhost:8080` pero la búsqueda falla con 401 o
  errores del catálogo.
- **Causa:** falta `CATALEG_API_KEY` en el entorno al arrancar. `docker-compose.yml` la
  pasa al contenedor (`CATALEG_API_KEY=${CATALEG_API_KEY}`) y nginx la inyecta en la
  cabecera `X-API-Key` vía `envsubst` sobre `nginx.conf.template` al arrancar; sin la
  variable, la cabecera sale vacía.
- **Solución:** define `CATALEG_API_KEY` en tu `.env` (compose lo lee para interpolar) o
  expórtala antes de levantar, y recrea el contenedor:

  ```bash
  docker compose up -d --force-recreate
  ```

  Verifica el proxy desde fuera:

  ```bash
  curl -i "http://localhost:8080/api/cataleg/?accio=salut"
  ```

### El build de Docker no sirve bajo `/atelier-studio/`

- **Síntoma:** assets 404 al servir la imagen bajo un subpath, o al revés: el `dist/`
  generado para Plesk no funciona en el contenedor.
- **Causa:** son dos builds distintos. El `Dockerfile` compila con `BASE_PUBLICA=/`
  porque el contenedor sirve en raíz; el despliegue de Plesk compila con la base por
  defecto `/atelier-studio/` (`vite.config.ts`). Todas las rutas de estáticos cuelgan de
  `import.meta.env.BASE_URL`, así que los `dist/` no son intercambiables.
- **Solución:** usa cada artefacto en su entorno; recompila si cambias de destino.

### La configuración dentro del contenedor no se actualiza

- **Síntoma:** editas `public/config/` y el contenedor sigue sirviendo los valores viejos.
- **Causa:** los JSON quedan copiados en la imagen con `dist/` durante el build
  multi-etapa; nginx los sirve con `no-store`, pero el fichero servido es el de la imagen.
- **Solución:** reconstruye la imagen (`docker compose up --build`).

## Consulta también

- [README.md](../README.md) — puesta en marcha, conexión a datos reales, despliegue y Docker.
- [PENDIENTES.md](../PENDIENTES.md) — §4.8 (API del catálogo e índice), §4.9 (imágenes
  PrestaShop), §6.5/§6.6 (figuras pendientes), §2 (croquis acotados).
- [AGENTS.md](../AGENTS.md) — reglas irrompibles del repo y comandos de verificación.
- [Arquitectura](./03-arquitectura.md) — dónde vive cada módulo (dominio, datos, visor, PDF, UI).
