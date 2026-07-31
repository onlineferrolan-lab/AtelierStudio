# Casos dorados de taller (§5)

Los `*.json` de esta carpeta son los **casos dorados**: cálculos reales de
taller que el motor debe reproducir exactamente. Son los tests automáticos del
motor (§5 de `ATELIER_STUDIO_MVP.md`):

> **Si un caso dorado falla, el motor está mal, no el caso.**

- **Solo taller rellena estos casos** (10–15 cálculos reales validados), a
  partir de la tabla de §5 de la especificación.
- Un caso con `"validadoPorTaller": true` **no se toca**: si el motor no lo
  reproduce, se corrige el motor.
- Cualquier caso añadido por desarrollo debe llevar `"validadoPorTaller": false`
  y la marca **«EJEMPLO NO VALIDADO POR TALLER»** en su campo `nota`, como
  `ejemplo-001.json`. Sirven de guía de formato, no de verdad de negocio.

Los casos se ejecutan con `npx vitest run tests/golden` (también entran en
`npm test`). Cada fichero se calcula contra la configuración REAL de
`public/config/` (tarifas del PDF de taller y parámetros de taller
PROVISIONALES: disco 3 mm, tolerancia 2 mm, saneado 5 mm/lado — §6.2/§6.3/§6.4).

## Formato de un caso

Un fichero por caso, `NNN-nombre-corto.json`:

```jsonc
{
  "caso": "ejemplo-001", // identificador único (nº de la tabla §5)
  "validadoPorTaller": false, // true SOLO cuando taller lo haya validado
  "nota": "texto libre", // origen del caso, quién y cuándo validó
  "material": {
    "referencia": "ERP o local",
    "descripcion": "texto",
    "marca": "texto o null",
    "formatoCm": { "largo": 60, "ancho": 60 }, // cm, admite decimales
    "precioM2Euros": 25, // tarifa TARP €/m² (null si no hay / manual)
    "precioUnidadEuros": null, // €/baldosa para material manual
    "piezasPorCaja": 4, // dato logístico ERP (null si no hay)
    "m2PorCaja": 1.44, // dato logístico ERP (null si no hay)
    "esManual": false,
  },
  "origen": "stock", // "stock" | "pedido"
  "figuraId": "figura-2", // id de public/config/figuras.json
  "medidasCm": { "longitud": "50", "fondo": "30", "alturaFrontal": "4" },
  // texto tal cual lo teclea el comercial, en cm
  "cantidad": 5,
  "suplementos": ["angular-f14"], // ids de public/config/tarifas.json
  "precioMaterialEditadoEuros": null, // número o null
  "mermaPorcentaje": 10,
  "esperado": {
    "ok": true,
    // Compara SOLO las claves presentes: se puede rellenar un subconjunto.
    "baldosasNecesarias": 5,
    "baldosasConMerma": 6,
    "unidadesFacturadas": 6, // piezas (stock) o piezas en cajas (pedido)
    "cajasFacturadas": 0, // 0 en stock
    "m2Facturados": 2.16,
    "ocupacionMm": 355,
    "dimensionUtilMm": 600,
    "baldosaGirada": false,
    "precioMaterialOriginal": 2500, // céntimos (€/m² o €/unidad)
    "materialCentimos": 5400,
    "manipulacionCentimos": 7250, // incluye suplementos
    "arranqueCentimos": 6000,
    "totalSinIvaCentimos": 18650,
    "ivaCentimos": 3917,
    "totalConIvaCentimos": 22567,
  },
}
```

Para casos que deben FALLAR (p. ej. la pieza no cabe en el formato):

```jsonc
"esperado": {
  "ok": false,
  "errores": ["La longitud pedida es 90 cm"]  // subcadenas que deben aparecer
}
```

Importes SIEMPRE en céntimos enteros (§1: 18,50 € → `1850`). Medidas del
resultado en milímetros enteros.
