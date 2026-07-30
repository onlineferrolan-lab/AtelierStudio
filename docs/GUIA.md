# Guia del mantenidor — Atelier Studio

Aquesta guia és per a la persona que **manté el projecte Atelier Studio**: la que
l'instal·la, l'actualitza, hi toca tarifes i paràmetres, regenera el catàleg i la
desplega al servidor. No explica com cotitzar peces (això és feina del taller) ni
com està programada per dins (això són els documents tècnics de `docs/`, en
castellà): explica **com està organitzada l'aplicació i com fer-la funcionar dia a
dia**.

Els noms de fitxers, comandes i botons de la interfície es citen tal qual; la
interfície de l'aplicació és en castellà.

## Què és Atelier Studio

Atelier Studio és l'eina interna de Ferrolan per configurar i cotitzar peces
ceràmiques manipulades al taller (peldaños, rodapiés, cortes). És una sola pàgina
web, sense usuari ni contrasenya, pensada primer per a escriptori. Es construeix
amb Vite + React + TypeScript, el visor 3D amb three.js i l'ordre de treball en
PDF amb jsPDF.

## Com està estructurada l'aplicació

El codi viu a `src/`, separat en blocs amb responsabilitats ben clares:

| On | Què hi ha | Què n'has de saber |
|---|---|---|
| `src/domain/` | Regles de negoci i motor de càlcul (`engine/`) | És **pur**: sense React ni xarxa. Diners en cèntims enters, mides en mm enters. No s'hi toca res sense llegir PENDIENTES.md. |
| `src/data/` | Fonts del catàleg de materials | La font activa és l'índex del catàleg real + l'API `/api/cataleg/`. |
| `src/viewer/` | Visor 3D paramètric | Dibuixa la peça segons la figura i les mides. |
| `src/pdf/` | Ordre de treball en PDF | Es genera des del bloc «Cotización». |
| `src/ui/` | Pantalla (passos ①–④, catàleg, cotització) | Textos en castellà; mai hi ha tarifes escrites a mà. |
| `public/config/` | `tarifas.json`, `figuras.json`, `parametros.json` | **Aquí és on treballaràs més sovint.** S'editen sense tocar codi. |
| `public/data/` | Catàleg de mostra i índex de cerca | L'índex es regenera amb una comanda (vegeu més avall). |
| `tests/` | Proves automàtiques | Inclou els «casos daurats» del taller: intocables. |

El detall complet és a [Arquitectura](./03-arquitectura.md).

## Com fer-la funcionar

### Posada en marxa en local

Cal Node.js (la CI i la imatge Docker fan servir Node 22). Des de l'arrel del
projecte:

```bash
npm install
npm run dev        # http://localhost:5173
```

Sense cap configuració addicional l'aplicació arrenca, però la cerca del catàleg
real necessita la clau de l'API (apartat següent). El pas a pas complet és a
[Primeros pasos](./02-primeros-pasos.md).

### Variables d'entorn

Copia `.env.example` a `.env` i emplena:

- `CATALEG_API_KEY` — clau de l'«API del catàleg de ceràmica». **Sense prefix
  `VITE_` a propòsit**: el catàleg porta preus de venda i la clau no ha
  d'arribar mai al navegador. L'app sempre parla amb `/api/cataleg/` (mateix
  origen) i la capçalera l'hi afegeix el proxy de desenvolupament
  (`vite.config.ts`) o el nginx del servidor.
- `VITE_PRESTASHOP_IMG_BASE` — base de les imatges dels materials
  (`<base>/<referència>.jpg`). Conveni PROVISIONAL (PENDIENTES.md §4.9): si una
  peça no té imatge, el visor mostra un material neutre i l'avís «textura no
  disponible»; no bloqueja res.

### Comandes de cada dia

| Comanda | Què fa |
|---|---|
| `npm run dev` | Servidor de desenvolupament |
| `npm run test` | Proves automàtiques (motor, dades, PDF, UI, casos daurats) |
| `npm run typecheck` | Comprovació de tipus estricta |
| `npm run lint` | Anàlisi estàtica (cap avís permès) |
| `npm run build` | Comprovació de tipus + build de producció a `dist/` |
| `npm run indice:cataleg` | Regenera l'índex de cerca del catàleg |

Abans de donar per bo qualsevol canvi de codi, tot això ha de quedar en verd:
`typecheck`, `lint`, `test` i `build`.

## Manteniment habitual

### Canviar una tarifa, un paràmetre o una figura

Tot el que taller/direcció pot voler ajustar viu a `public/config/`:

- `tarifas.json` — tarifes de manipulació i suplements.
- `figuras.json` — catàleg de figures: mides, recepta de components, regla de
  tarifa i suplements. Les figures amb `estado: "pendiente"` es veuen a l'app
  però estan **bloquejades**: falta que direcció confirmi la tarifa. Per
  activar-les, confirma la tarifa, emplena el JSON i actualitza l'estat.
- `parametros.json` — disc de tall, tolerància, sanejat, % de merma per defecte,
  arrencada de màquina, IVA. Alguns valors són **PROVISIONALS** (mirau
  PENDIENTES.md abans de tocar-los).

El canvi és editar el JSON, no el codi. En producció aquests fitxers es serveixen
amb `Cache-Control: no-store`, així que la propera càrrega de la pàgina ja els
agafa. La referència camp per camp és a [Configuració](./04-configuracion.md).

### El catàleg de materials

La font activa del catàleg (`src/data/catalogo.ts`) és l'índex de cerca local
més l'API real del catàleg, consultada a través del proxy `/api/cataleg/`. La
clau mai no viatja al navegador. Si el proveïdor afegeix peces noves, regenera
l'índex amb `npm run indice:cataleg` (llegeix el sitemap de ferrolan.es). El
catàleg de mostra de `public/data/` (marcat a la UI com «DATOS FALSOS») queda
només com a material de desenvolupament. Tot el detall és a
[Catàleg](./06-catalogo.md).

### Allò que està pendent no s'inventa

Qualsevol valor o regla sense confirmar porta la marca `PROVISIONAL` al codi o
al JSON i una entrada a [PENDIENTES.md](../PENDIENTES.md). Si et trobes una
dada que no quadra, no l'assumeixis: consulta PENDIENTES.md i pregunta a
taller/direcció.

### Casos daurats

A `tests/golden/` hi ha els càlculs validats pel taller en format JSON. Són la
font de la veritat: **si un cas daurat falla, el motor està malament, no el
cas**. Mai no s'«arregla» un cas daurat per fer passar una prova; els omple
taller amb direcció. Vegeu [Proves](./10-pruebas.md).

## Desplegament

Resum (el pas a pas complet és a [Desplegament](./11-despliegue.md)):

1. `npm run build` i puja el **contingut** de `dist/` a la subcarpeta
   `atelier-studio/` del docroot de Plesk (l'app viu a
   `https://studio.ferrolan.es/atelier-studio/`).
2. L'única peça de servidor és la `location /api/cataleg/` de nginx, amb la
   clau `X-API-Key` guardada **fora del docroot** (include des d'
   `atelier-studio_privat/`, que ha de respondre 403/404 per web). Nota de
   producció (2026-07-27): en aquell Plesk `proxy_pass` no funciona i la
   location s'executa via FastCGI; els detalls són a la guia de desplegament.
3. Alternativa amb Docker: `docker build -t atelier-studio .` i
   `docker run -p 8080:80 atelier-studio` (o `docker compose up`).
4. La CI (`.github/workflows/ci.yml`) executa typecheck, lint, proves i build a
   cada push.

## Si alguna cosa falla

La guia [Solució de problemes](./13-solucion-de-problemas.md) cobreix, en format
símptoma → causa → solució: el catàleg que no carrega o respon 401 (clau,
proxy), textures que falten, canvis de configuració que no es veuen, figures
bloquejades, fallades de build/proves a Windows + Git Bash i comprovacions del
contenidor Docker.

## Documentació relacionada

- [Índex de la documentació tècnica](./README.md) — els 13 documents de `docs/`.
- [README.md](../README.md) — resumen operatiu del projecte (en castellà).
- [PENDIENTES.md](../PENDIENTES.md) — decisions de negoci obertes; llegeix-lo
  abans de tocar tarifes, figures o paràmetres.
- [AGENTS.md](../AGENTS.md) — regles irrompibles del repositori.
