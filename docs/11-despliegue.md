# Despliegue

Este documento explica cómo publicar Atelier Studio: el despliegue en producción bajo
`studio.ferrolan.es/atelier-studio/` (Plesk), la protección de la clave del catálogo de
cerámica, la imagen Docker y la pipeline de CI. Va dirigido a quien suba la aplicación al
servidor o mantenga la infraestructura.

Fuentes: `README.md`, `vite.config.ts`, `nginx.conf.template`, `Dockerfile`,
`docker-compose.yml`, `.github/workflows/ci.yml`.

## Publicar en producción (Plesk)

La app vive bajo `https://studio.ferrolan.es/atelier-studio/`. La ruta base se fija en
`vite.config.ts` (`base: env.BASE_PUBLICA ?? '/atelier-studio/'`), y todas las rutas de
estáticos del código cuelgan de `import.meta.env.BASE_URL`.

Pasos:

1. Genera el build de producción:

   ```bash
   npm run build
   ```

2. Sube el **contenido** de `dist/` a la subcarpeta `atelier-studio/` del docroot del
   dominio. Plesk la sirve automáticamente, sin directivas adicionales para esa ruta.

Lo único que hay que configurar a mano en el nginx del servidor (directivas adicionales
de Plesk) es la `location /api/cataleg/`, descrita en la sección siguiente.

### Fallback SPA (opcional)

La app es una sola página sin rutas de cliente, así que el fallback es opcional:

```nginx
location /atelier-studio/ {
  try_files $uri $uri/ /atelier-studio/index.html;
}
```

## Proteger la clave del catálogo (`/api/cataleg/`)

El catálogo de cerámica lleva tarifas de venta: la clave `X-API-Key` **no debe llegar
nunca al navegador**. La app siempre habla con `/api/cataleg/` (mismo origen) y es nginx
quien añade la cabecera. Por eso la variable `CATALEG_API_KEY` no lleva prefijo `VITE_`
(ver `.env.example` y PENDIENTES.md §4.8).

- Guarda la clave en el propio servidor, **fuera del docroot**: por ejemplo, un `.conf`
  en la carpeta hermana `atelier-studio_privat/`, incluido desde las directivas
  adicionales de nginx de Plesk.
- Protege esa carpeta con un bloque junto al include:

  ```nginx
  location ^~ /atelier-studio_privat/ { return 404; }
  ```

- **Verifica** que `https://<dominio>/atelier-studio_privat/...` devuelve 403 o 404
  desde la web antes de dar el despliegue por bueno.

### Nota de producción (2026-07-27): el `proxy_pass` NO funciona en ese Plesk

La `location /api/cataleg/` de `nginx.conf.template` usa `proxy_pass` hacia
`https://studio.ferrolan.es/cataleg/`. En el servidor real de producción esto **no
funciona**: el nginx de ese Plesk no puede hacer conexiones salientes (ni a la IP pública
ni a loopback), y el dominio se sirve con nginx + PHP-FPM, sin Apache.

En producción, la `location /api/cataleg/` ejecuta la app del catálogo directamente vía
FastCGI:

- `rewrite` de `/api/cataleg/` → `/cataleg/`, apuntando al `index.php` de
  `<docroot>/cataleg/`.
- La clave se inyecta con `fastcgi_param HTTP_X_API_KEY ...`.
- Todo ello vive en el `.conf` incluido desde `atelier-studio_privat/`, junto al bloque
  `return 404` que la protege.

`nginx.conf.template` sigue siendo la referencia del contrato (misma ruta, misma
cabecera, clave fuera del navegador) y la configuración vigente en Docker y como modelo
para cualquier nginx con salida a red.

## Construir la imagen Docker

La imagen es multi-etapa (`Dockerfile`):

1. **Build** (`node:22-alpine`): `npm ci --no-audit --no-fund` y
   `BASE_PUBLICA=/ npm run build` — el contenedor sirve en raíz, así que la base pública
   es `/` en lugar de `/atelier-studio/`.
2. **Runtime** (`nginx:1.27-alpine`): copia `dist/` a `/usr/share/nginx/html` y
   `nginx.conf.template` a `/etc/nginx/templates/default.conf.template`. Los scripts de
   arranque de la imagen oficial de nginx procesan la plantilla con `envsubst`, lo que
   inyecta `CATALEG_API_KEY` sin hornearla en la imagen. Expone el puerto 80 y define un
   `HEALTHCHECK` contra `/`.

`.dockerignore` excluye `node_modules`, `dist`, `.git` y `.env`: la clave nunca entra en
el contexto de build ni en la imagen.

Comandos:

```bash
docker build -t atelier-studio .
docker run -p 8080:80 -e CATALEG_API_KEY=... atelier-studio
```

### Cabeceras de caché del contenedor

Definidas en `nginx.conf.template`:

| Ruta | Cabecera | Motivo |
|---|---|---|
| `/config/` | `Cache-Control: no-store` | Tarifas, parámetros y figuras cambian sin redeploy |
| `/assets/` | `Cache-Control: public, max-age=31536000, immutable` | Assets con hash de Vite |
| `/api/cataleg/` | proxy a `studio.ferrolan.es/cataleg/` con `Host` y `X-API-Key` | La clave solo la ve nginx |
| `/` | `try_files $uri $uri/ /index.html` | Fallback SPA |

### docker-compose

`docker-compose.yml` levanta el servicio `atelier-studio` con el build local, puerto
`8080:80`, `restart: unless-stopped` y la variable `CATALEG_API_KEY` tomada del entorno:

```bash
CATALEG_API_KEY=... docker compose up
```

## Cambiar la ruta base del build

`vite.config.ts` lee la base de la variable de entorno `BASE_PUBLICA`
(por defecto `/atelier-studio/`). Para un despliegue en raíz:

```bash
BASE_PUBLICA=/ npm run build
```

En Windows/Git Bash la conversión de rutas de MSYS rompe el flag `--base=/`; usa la
variable de entorno con la exclusión de MSYS2:

```bash
MSYS2_ENV_CONV_EXCL=BASE_PUBLICA BASE_PUBLICA=/ npm run build
```

## Verificar cambios en CI

El workflow `CI` (`.github/workflows/ci.yml`) se ejecuta en cada push a `main` y en cada
pull request, sobre `ubuntu-latest` con Node 22 (caché de npm):

```bash
npm ci --no-audit --no-fund
npm run typecheck   # tsc --noEmit estricto
npm run lint        # eslint . --max-warnings 0
npm run test        # vitest run
npm run build       # typecheck + build de producción en dist/
```

Los cuatro pasos deben quedar en verde antes de subir nada al servidor.

## Consulta también

- [README.md](../README.md) — puesta en marcha, comandos y conexión a datos reales.
- [PENDIENTES.md](../PENDIENTES.md) — §4.8 (contrato del catálogo y autenticación
  `X-API-Key`) y §4.9 (patrón de imágenes PrestaShop, PROVISIONAL).
- `AGENTS.md` — reglas del repo y comandos de verificación.

## Peso de la publicación (revisado 2026-07-30)

- **Sourcemaps: desactivados por defecto.** Ocupaban 4,9 MB en `dist` y publicaban el
  código fuente. Para depurar un despliegue concreto: `SOURCEMAPS=1 npm run build`.
- **JS de la primera pantalla: ~208 kB** (`index` + `react`). El visor 3D y el generador
  de PDF se descargan solo al usarlos.
- **Fuentes:** solo los subconjuntos `latin` y `latin-ext` de Montserrat (~272 kB en woff2).
  No importes el paquete completo: arrastra cirílico y vietnamita.
- **`data/indice-cataleg.json` pesa ~5,7 MB** y se descarga al abrir el catálogo. El nginx
  de `nginx.conf.template` ya lo comprime (`gzip_types … application/json`), y así baja a
  unas décimas. **Comprueba que el nginx de Plesk también comprime JSON**: sin gzip, cada
  carga del catálogo se lleva 5,7 MB. Es, con diferencia, la descarga más grande de la app.
