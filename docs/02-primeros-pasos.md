# Primeros pasos con Atelier Studio

Esta guía explica cómo instalar y arrancar Atelier Studio en local, qué funciona sin
configuración adicional, qué comandos hay disponibles y cómo comprobar que el entorno
queda correctamente montado. Está pensada para cualquier persona (desarrollo o no) que
clone el repositorio por primera vez.

## Requisitos previos

- **Node.js con npm** (la imagen Docker del proyecto usa Node 22; `Dockerfile`).
- En **Windows**, ejecuta los comandos en **Git Bash** (ver `AGENTS.md`).
- Opcional, solo para el catálogo real: la clave `CATALEG_API_KEY` (ver
  [Variables de entorno](#variables-de-entorno)).

## Instalación y arranque

```bash
npm install
npm run dev
```

El servidor de desarrollo escucha en **http://localhost:5173** (puerto fijado en
`vite.config.ts`). Los cambios en el código se recargan en caliente.

## Qué funciona nada más arrancar

Sin ninguna configuración (sin `.env`):

- **Todo el flujo de cotización**: pasos ① Material · ② Figura · ③ Medidas y cantidad ·
  ④ Suplementos, con el bloque de Cotización siempre visible. Las tarifas, figuras y
  parámetros se cargan de `public/config/*.json`, que son locales.
- **El visor 3D** y la **generación del PDF** de orden de trabajo.
- **«Entrada manual»** de material (paso ①), que no depende de red.
- La **búsqueda en el catálogo real no funciona sin clave**: la fuente activa es
  `obtenerFuenteCatalogo()` (`src/data/catalogo.ts`), que busca sobre el índice local
  `public/data/indice-cataleg.json` (ya incluido en el repo) y pide tarifas y medidas en
  vivo a `/api/cataleg/`. Sin `CATALEG_API_KEY` el proxy de desarrollo no puede inyectar
  la cabecera y el panel de Catálogo muestra un error recuperable con reintento, sin
  romper el resto de la aplicación. Ver `PENDIENTES.md` §4.8.

> **Nota sobre el catálogo de muestra (DATOS FALSOS, §7.3):** el archivo
> `public/data/catalogo-muestra.json` sigue en el repo, marcado en su propio contenido
> como `CATÁLOGO DE MUESTRA — DATOS FALSOS (§7.3)`, y su fuente (`src/data/fuenteMuestra.ts`)
> expone `origen: 'muestra'` para que la UI lo señale como falso. Sin embargo, **ya no es
> la fuente por defecto**: `obtenerFuenteCatalogo()` usa el índice real desde que se
> resolvió §4.8. La sección «Puesta en marcha» del `README.md` aún describe el arranque
> con el catálogo de muestra; ese párrafo está desactualizado respecto al código.

## Comandos

Definidos en `package.json`:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm run test` | Suite Vitest completa (`vitest run`: motor, datos, pdf, UI, casos dorados) |
| `npm run test:watch` | Vitest en modo observación |
| `npm run typecheck` | `tsc --noEmit` con TypeScript estricto |
| `npm run lint` | ESLint sobre todo el repo (`--max-warnings 0`) |
| `npm run format` | Prettier: formatea todos los archivos (`--write`) |
| `npm run format:check` | Prettier: solo comprueba el formato, sin escribir |
| `npm run build` | Typecheck + build de producción en `dist/` |
| `npm run preview` | Sirve localmente el build de producción |
| `npm run indice:cataleg` | Regenera `public/data/indice-cataleg.json` (índice de búsqueda del catálogo real) |

`npm run indice:cataleg` (`scripts/generar-indice-cataleg.mjs`) descarga el sitemap
público de ferrolan.es y extrae referencia, título e imagen de cada artículo publicado.
Tarda unos 15–30 s (hace pausas entre peticiones). No hace falta para arrancar — el
índice ya está en el repo —, pero conviene reejecutarlo periódicamente porque el
catálogo cambia y no hay automatismo (ver `PENDIENTES.md` §4.8). No es la fuente de
verdad de precios ni medidas: esos se consultan en vivo por código a `/api/cataleg/`.

## Variables de entorno

Copia `.env.example` a `.env` y rellena los valores que necesites:

```bash
cp .env.example .env
```

### `CATALEG_API_KEY`

Clave del «API del catàleg de ceràmica» (`studio.ferrolan.es/cataleg/`, réplica de solo
lectura de la sección CE del ERP). La entrega el responsable del ERP por canal seguro.

**No lleva el prefijo `VITE_` a propósito.** Vite solo incrusta en el bundle del
navegador las variables prefijadas con `VITE_`; si esta la llevara, cualquiera podría
descargarse el tarifario completo de venta. Por eso:

- La app llama siempre a `/api/cataleg/` (mismo origen), sin clave.
- En desarrollo, el proxy de `vite.config.ts` la lee en Node (vía `loadEnv`) y añade la
  cabecera `X-API-Key` en el lado servidor.
- En producción lo hace nginx (`nginx.conf.template`, vía `envsubst`).

Sin esta clave la app arranca igualmente; solo falla la búsqueda del catálogo real
(ver [Qué funciona nada más arrancar](#qué-funciona-nada-más-arrancar)).

### `VITE_PRESTASHOP_IMG_BASE`

Base para imágenes de producto con el patrón `<base>/<referencia>.jpg`
(relación `catálogo.codigo = PrestaShop.reference`). Se usa como imagen de reserva para
artículos encontrados solo por referencia exacta, que no tienen imagen en el índice
(`src/data/catalogo.ts`). Si no se configura, el visor 3D muestra material neutro con el
aviso «Textura no disponible», sin bloquear. El patrón es **PROVISIONAL**:
confirmación pendiente en `PENDIENTES.md` §4.9.

## Lista de verificación del primer arranque

1. `npm install` termina sin errores.
2. `npm run typecheck`, `npm run lint` y `npm run test` pasan en verde (criterio del
   proyecto: ver `AGENTS.md`).
3. `npm run build` genera `dist/` sin errores.
4. `npm run dev` y abrir http://localhost:5173: se ven los pasos ①–④ a la izquierda y
   las pestañas **Catálogo / Visor 3D** a la derecha.
5. En el paso ②, la galería de figuras carga desde `public/config/figuras.json`; las
   figuras con `estado: "pendiente"` aparecen bloqueadas con insignia PENDIENTE.
6. Sin clave: la búsqueda del catálogo muestra el error recuperable, pero «Entrada
   manual» permite seleccionar material y completar una cotización con visor 3D y PDF.
7. Con `CATALEG_API_KEY` configurada (y `npm run dev` reiniciado): una búsqueda en la
   pestaña Catálogo devuelve artículos reales con tarifa y medidas.

## Consulta también

- [README.md](../README.md) — visión general, despliegue y Docker.
- [PENDIENTES.md](../PENDIENTES.md) — dudas de negocio abiertas y valores PROVISIONALES.
- [AGENTS.md](../AGENTS.md) — reglas irrompibles del repo y convenciones.
- [Arquitectura](./03-arquitectura.md) — cómo se organiza el código (`src/domain`, `src/data`, `src/ui`…).
