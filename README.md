# Atelier Studio — Ferrolan

Herramienta interna para configurar y cotizar piezas cerámicas manipuladas en taller
(peldaños, rodapiés, cortes…). Tercera herramienta de la familia iniciada por Top Studio.

- **Una sola página, sin login** (uso interno), escritorio primero, idioma español.
- Columna izquierda con pasos ① Material · ② Figura · ③ Medidas y cantidad · ④ Suplementos
  y bloque de **Cotización** siempre visible; panel derecho con pestañas **Catálogo / Visor 3D**.
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
`https://studio.ferrolan.es/atelier-studio/` (Plesk). Subir el CONTENIDO de `dist/`
al docroot de ese subpath y configurar en el nginx del servidor (directivas
adicionales de Plesk) la `location /api/cataleg/` de `nginx.conf.template`
(con la clave `X-API-Key` en el propio servidor) más el fallback SPA
(`location /atelier-studio/ { try_files $uri $uri/ /atelier-studio/index.html; }`).
Todas las rutas de estáticos del código cuelgan de `import.meta.env.BASE_URL`;
el proxy del catálogo es raíz absoluta a propósito (location de nivel servidor).

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
                     #   ocupación §4, merma, stock/pedido, desglose
  data/              # catálogo: FuenteCatalogo (muestra, índice) + cataleg real (por código) + entrada manual
  viewer/            # visor 3D paramétrico (three.js): geometría, cotas, escena
  pdf/               # orden de trabajo en PDF (jsPDF)
  ui/
    components/      # primitivas (patrón visual Top Studio)
    state/           # config-context + quote-state (reducer global)
    steps/           # pasos ①-④ + CatalogoPanel
    shell/           # layout, cabecera, panel derecho, bloque cotización
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
