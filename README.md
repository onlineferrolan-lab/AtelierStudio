# Atelier Studio — Ferrolan

Herramienta interna para configurar y cotizar piezas cerámicas manipuladas en taller
(peldaños, rodapiés, cortes…). Tercera herramienta de la familia iniciada por Top Studio.

- **Una sola página, sin login** (uso interno), escritorio primero, idioma español.
- Columna izquierda con pasos ① Material · ② Figura · ③ Medidas y cantidad · ④ Suplementos
  y bloque de **Cotización** siempre visible; panel derecho con pestañas **Catálogo / Visor 3D**.
- Debajo de la cotización, el bloque **Pedido**: varias piezas en una sola orden. Las que
  se cortan del mismo artículo **comparten caja** — se compra el material una vez en lugar
  de una tanda de cajas por cada corte — y salen juntas en un PDF con hoja de resumen y
  una hoja por pieza (ver PENDIENTES.md §9).
- Especificación: `ATELIER_STUDIO_MVP.md` (entregada con el encargo). Las dudas abiertas
  viven en **[PENDIENTES.md](./PENDIENTES.md)** — léelo antes de tocar reglas de negocio.

## Stack

Vite + React 18 + TypeScript estricto · Tailwind CSS · three.js (visor 3D) · jsPDF (orden de trabajo) · Vitest + Testing Library.

## Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:5173
```

Sin configuración adicional la app arranca con el **catálogo de muestra**
(`public/data/catalogo-muestra.json`, marcado en UI como DATOS FALSOS, §7.3).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run test` | Suite Vitest (motor, datos, pdf, UI, casos dorados) |
| `npm run typecheck` | `tsc --noEmit` estricto |
| `npm run lint` | ESLint (`--max-warnings 0`) |
| `npm run build` | Typecheck + build de producción en `dist/` |
| `npm run preview` | Sirve el build de producción |
| `npm run manual` | Regenera `public/manual-usuario.pdf` (manual de usuario) |

## Configuración de negocio (sin redeploy de código)

Todo lo editable por taller/dirección vive en `public/config/`, servido con `Cache-Control: no-store`:

- `tarifas.json` — tarifas de manipulación y suplementos (origen: *Tarifa Torelos Castellbisbal Juny 2023*; **confirmar vigencia con taller**, §2).
- `figuras.json` — catálogo de figuras: medidas, receta de componentes, regla de tarifa, suplementos. Figuras sin tarifa confirmada quedan `estado: "pendiente"` (visibles pero bloqueadas).
- `parametros.json` — disco de corte, tolerancia, saneado, % merma por defecto, arranque de máquina, IVA. Varios valores son **PROVISIONALES** (ver PENDIENTES.md).

## Conexión a datos reales (§1.①)

Copia `.env.example` a `.env` y rellena:

- `CATALEG_API_KEY` — clave del «API del catàleg de ceràmica» (`studio.ferrolan.es/cataleg/`,
  réplica de solo lectura de la sección CE del ERP, §6.13). **Sin prefijo `VITE_` a propósito:**
  el catálogo lleva tarifas de venta y la clave no debe llegar nunca al navegador. La app
  siempre habla con `/api/cataleg/` (mismo origen); esa cabecera la añade nginx en producción
  (`nginx.conf.template`, vía `envsubst`) o el proxy de desarrollo de `vite.config.ts` — ninguno
  de los dos expone la clave al bundle de React. El adaptador es `src/data/fuenteCataleg.ts`
  (`mapearArticuloCataleg`); el catálogo de muestra sigue siendo el índice de búsqueda por texto
  hasta que el proveedor ofrezca un endpoint de listado (ver PENDIENTES.md §4.8).
- `VITE_PRESTASHOP_IMG_BASE` — imágenes/texturas: `<base>/<referencia>.jpg`
  (relación `catálogo.codigo = PrestaShop.reference`). Si una pieza no tiene imagen,
  el visor muestra material neutro + aviso «textura no disponible» (no bloquea).

## Despliegue

La app se construye con `base: '/atelier-studio/'` (`vite.config.ts`): vive bajo
`https://studio.ferrolan.es/atelier-studio/` (Plesk). Subir el CONTENIDO de
`dist/` a la subcarpeta `atelier-studio/` del docroot — Plesk la sirve
automáticamente, sin directivas para la ruta. Lo único que hay que configurar
en el nginx del servidor (directivas adicionales de Plesk) es la
`location /api/cataleg/` de `nginx.conf.template`, con la clave `X-API-Key`
en el propio servidor, fuera del docroot — p. ej. un `include` de un `.conf`
en la carpeta hermana `atelier-studio_privat/` (que NO debe ser accesible por
web: verificar que `https://<dominio>/atelier-studio_privat/...` da 403/404).
El fallback SPA
(`location /atelier-studio/ { try_files $uri $uri/ /atelier-studio/index.html; }`)
es opcional: la app es una sola página sin rutas de cliente.
Todas las rutas de estáticos del código cuelgan de `import.meta.env.BASE_URL`;
el proxy del catálogo es raíz absoluta a propósito (location de nivel servidor).

Nota (Plesk de producción, 2026-07-27): en el servidor real el `proxy_pass`
de `nginx.conf.template` NO funciona — el nginx de ese Plesk no puede hacer
conexiones salientes (ni a la IP pública ni a loopback) y el dominio se sirve
con nginx + PHP-FPM, sin Apache. La `location /api/cataleg/` en producción
ejecuta la app del catálogo directamente vía FastCGI (el `index.php` de
`<docroot>/cataleg/`, con `rewrite` de `/api/cataleg/` → `/cataleg/` y la
clave inyectada con `fastcgi_param HTTP_X_API_KEY`), en un `.conf` incluido
desde `atelier-studio_privat/` junto a un bloque
`location ^~ /atelier-studio_privat/ { return 404; }` que la protege.

### Refresco diario del índice de catálogo (cron de Plesk)

### Manual de usuario

El manual para comerciales es un PDF servido por la app: `public/manual-usuario.pdf`.
Se regenera con `npm run manual` (`scripts/generar-manual.mjs`, jsPDF); el texto vive
en ese script y las capturas en `docs/manual-usuario/img/`, que hay que rehacer a mano
cuando cambia la interfaz. Desde la herramienta se descarga con **Ctrl + Alt + H**
(atajo sin botón visible, ver `src/ui/shell/atajoManual.ts`).

`public/data/indice-cataleg.json` se regenera con `npm run indice:cataleg`
(ver PENDIENTES.md §4.8). En producción lo refresca a diario una **tarea
programada de Plesk** (Websites & Domains → Scheduled Tasks → «Run a command»),
una vez al día, p. ej. a las 06:17:

```bash
INDICE_CATALEG_SALIDA=<docroot>/atelier-studio/data/indice-cataleg.json \
  node <docroot>/atelier-studio_privat/generar-indice-cataleg.mjs
```

- El script es autocontenido (sin dependencias, Node 18+): se sube UNA copia a
  `atelier-studio_privat/` (fuera del alcance web) y no hace falta el repo en el
  servidor. La variable `INDICE_CATALEG_SALIDA` hace que escriba directamente
  en el `data/` desplegado, sin rebuild ni redeploy.
- Si el sitemap falla, el script sale con error ANTES de escribir: el índice del
  día anterior queda intacto. Conviene que Plesk envíe la salida del cron por
  correo para enterarse de los fallos.
- **Ojo:** la nota anterior documenta que el nginx de ese Plesk no puede hacer
  conexiones salientes. Si esa restricción también aplica a los procesos de cron
  (el script descarga el sitemap de `ferrolan.es` por HTTPS), hay que mover el
  refresco a otra máquina y subir el JSON por FTP/SSH. Verificarlo la primera
  vez ejecutando el comando a mano por SSH.

## Docker

```bash
docker build -t atelier-studio .
docker run -p 8080:80 atelier-studio   # o: docker compose up
```

Imagen multi-etapa: build con Node 22 (`BASE_PUBLICA=/`, porque el contenedor
sirve en raíz) → nginx con caché larga para assets y `no-store` para `/config`.
CI en `.github/workflows/ci.yml` (typecheck, lint, tests, build).

## Arquitectura

```
src/
  domain/            # dominio puro, sin React ni red
    types.ts         #   Mm, Centimos, Milesimas (marcas), Material, SalidaMotor…
    money.ts         #   dinero en céntimos enteros; tarifas en milésimas de €
    units.ts         #   cm → mm enteros
    config.ts        #   carga/validación de /config (interfaz FuenteConfiguracion)
    engine/          #   MOTOR DE CÁLCULO PURO (§7.2): validación, tarifas,
                     #   ocupación §4, merma, desglose
                     #   cotizacion.ts = calcularLinea (la pieza) + facturarMaterial (el artículo)
                     #   pedido.ts     = varias piezas, cajas compartidas por artículo
  data/              # catálogo: FuenteCatalogo (muestra, índice) + cataleg real (por código) + entrada manual
  viewer/            # visor 3D paramétrico (three.js): geometría, cotas, escena
  pdf/               # maqueta.ts (bloques comunes) + ordenTrabajo.ts (una pieza)
                     # + ordenPedido.ts (pedido: resumen + una hoja por pieza)
  ui/
    components/      # primitivas (patrón visual Top Studio)
    state/           # config-context + quote-state (reducer global, incluye el carrito)
    steps/           # pasos ①-④ + CatalogoPanel
    shell/           # layout, cabecera, panel derecho, bloques cotización y pedido
tests/
  unit/              # Vitest por módulo
  golden/            # casos dorados de taller (§5): ver tests/golden/README.md
public/config/       # tarifas, parámetros, figuras (editables sin redeploy)
public/data/         # catálogo de muestra (FALSO, §7.3)
```

### Reglas de oro (de la especificación)

- **Dinero en céntimos enteros, geometría en mm enteros** (entrada en cm). Prohibido
  `float` para dinero o geometría. Determinista: mismo input → mismo resultado.
- **Tarifas y figuras se cargan de configuración**, nunca hardcodeadas en componentes.
- **Lo pendiente no se inventa** (§0): placeholder configurable + marca `PROVISIONAL`
  visible + entrada en PENDIENTES.md.
- **Casos dorados** (§5): cuando taller entregue cálculos validados, se depositan en
  `tests/golden/*.json` y pasan a ser los tests del motor. *Si un caso dorado falla,
  el motor está mal, no el caso.*
