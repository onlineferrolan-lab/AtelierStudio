# Documentación de Atelier Studio

Esta carpeta reúne la documentación técnica y funcional de Atelier Studio, la herramienta
interna de Ferrolan para configurar y cotizar piezas cerámicas manipuladas en taller
(peldaños, rodapiés, cortes). Sirve a tres públicos: el equipo de desarrollo que mantiene
el código, taller/dirección que ajusta tarifas y parámetros, y quien despliega la app.

Cada documento cubre un área concreta y enlaza con los demás en lugar de repetir
contenido. Empieza por el índice de abajo o por una de las rutas de lectura sugeridas.

## Índice de documentos

| Documento | Qué cubre | Para quién |
|---|---|---|
| [Guia del mantenidor](./GUIA.md) | **En català.** Cómo está estructurada la app y cómo hacerla funcionar, mantenerla (tarifas, catálogo, config) y desplegarla | Mantenedor del proyecto; primera lectura |
| [Visión general](./01-vision-general.md) | Qué es la app, qué hace y cómo es el flujo de cotización (pasos ①–④) | Todo el mundo; primera lectura |
| [Primeros pasos](./02-primeros-pasos.md) | Instalación, arranque en local y comandos `npm` | Desarrollo |
| [Arquitectura](./03-arquitectura.md) | Mapa del código (`src/domain`, `src/data`, `src/viewer`, `src/pdf`, `src/ui`) y reglas de oro | Desarrollo |
| [Configuración](./04-configuracion.md) | JSON de `public/config/` (tarifas, figuras, parámetros) y variables de `.env` | Taller/dirección y desarrollo |
| [Motor de cálculo](./05-motor-de-calculo.md) | Motor puro de `src/domain/engine/`: validación, ocupación, merma, stock/pedido y desglose | Desarrollo |
| [Catálogo](./06-catalogo.md) | Fuentes de materiales: cataleg real vía `/api/cataleg/`, índice local, PrestaShop, muestra y entrada manual | Desarrollo |
| [Visor 3D](./07-visor-3d.md) | Visor paramétrico con three.js: geometría por figura, cotas y texturas | Desarrollo |
| [PDF de orden de trabajo](./08-pdf-orden-trabajo.md) | Generación de la orden de trabajo con jsPDF: contenido y condiciones | Desarrollo |
| [Interfaz y estado](./09-interfaz-y-estado.md) | UI en React: pasos ①–④, patrón visual Top Studio y estado global (reducer) | Desarrollo |
| [Pruebas](./10-pruebas.md) | Suite Vitest: tests unitarios, casos dorados de taller y verificaciones previas a entregar | Desarrollo |
| [Despliegue](./11-despliegue.md) | Build, publicación en Plesk bajo `/atelier-studio/`, nginx de `/api/cataleg/`, Docker y CI | DevOps / desarrollo |
| [Contribución](./12-contribucion.md) | Convenciones del repo: reglas irrompibles, tests obligatorios y cómo tratar lo pendiente | Desarrollo |
| [Manual de usuario](../public/manual-usuario.pdf) | **PDF para comerciales.** Cómo se usa la herramienta paso a paso y cómo calcula cada cifra. Se regenera con `npm run manual`; el texto está en `scripts/generar-manual.mjs` y las capturas en `manual-usuario/img/` | Comerciales; formación |
| [Solución de problemas](./13-solucion-de-problemas.md) | Fallos habituales (arranque, catálogo, config, build) y cómo diagnosticarlos | Todo el mundo |

## Por dónde empezar

- **Eres el mantenedor del proyecto:** empieza por la [Guia del mantenidor](./GUIA.md)
  (en català) y continúa por [Configuración](./04-configuracion.md) y
  [Despliegue](./11-despliegue.md).
- **Eres nuevo en el proyecto:** lee [Visión general](./01-vision-general.md), luego
  [Primeros pasos](./02-primeros-pasos.md) para arrancar la app y [Arquitectura](./03-arquitectura.md)
  para situarte en el código.
- **Vas a tocar reglas de negocio:** lee primero [PENDIENTES.md](../PENDIENTES.md) y después
  [Motor de cálculo](./05-motor-de-calculo.md). Lo pendiente no se inventa: se deja configurable
  con marca `PROVISIONAL` y se anota en PENDIENTES.md.
- **Vas a cambiar una tarifa o un parámetro:** basta [Configuración](./04-configuracion.md);
  los cambios de tarifa se hacen editando JSON, no código.
- **Vas a desplegar:** [Despliegue](./11-despliegue.md).

## Documentos de referencia en la raíz

- [README.md](../README.md) — presentación del proyecto, stack, puesta en marcha, config y despliegue en resumen.
- [AGENTS.md](../AGENTS.md) — guía de trabajo en el repo: comandos, reglas irrompibles y dónde vive cada cosa.
- [PENDIENTES.md](../PENDIENTES.md) — lista viva de decisiones de negocio abiertas; léelo antes de tocar reglas de negocio.

La especificación de negocio original es `ATELIER_STUDIO_MVP.md` (entregada con el encargo).

## Convenciones de esta documentación

- Toda la documentación se escribe en **español**; identificadores de código, rutas y
  comandos se citan tal cual (`src/domain/engine/`, `npm run test`).
- Los valores o reglas marcados como **PROVISIONALES** en el código se señalan igual aquí
  y enlazan a [PENDIENTES.md](../PENDIENTES.md), nunca se dan por definitivos.
- Si un documento contradice al código o a PENDIENTES.md, el error está en el documento:
  corrígelo (ver [Contribución](./12-contribucion.md)).

## Consulta también

- [README.md](../README.md) — resumen operativo del proyecto en la raíz.
- [PENDIENTES.md](../PENDIENTES.md) — qué falta por decidir y por qué.
- [AGENTS.md](../AGENTS.md) — reglas irrompibles del repo.
- [Visión general](./01-vision-general.md) — siguiente lectura recomendada.
