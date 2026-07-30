/**
 * Subsección plegable «Entrada manual» del paso ① (§1.①): da de alta cerámica
 * que no está ni en ERP ni en PrestaShop, con los campos mínimos decididos
 * (descripción, largo × ancho en cm, precio €/unidad, piezas por caja, subfamilia
 * opcional e imagen opcional) y la
 * selecciona como material de la cotización. El material queda marcado como
 * manual (lo crea `crearMaterialManual`, capa de datos).
 */

import { useState } from 'react';
import type { Material } from '../../domain/types';
import { crearMaterialManual } from '../../data/catalogo';
import { Boton, Campo, EntradaNumero } from '../components/primitivas';

type CamposManual = {
  descripcion: string;
  largo: string;
  ancho: string;
  precio: string;
  piezasPorCaja: string;
  subfamilia: string;
  imagen: string;
};

const CAMPOS_VACIOS: CamposManual = {
  descripcion: '',
  largo: '',
  ancho: '',
  precio: '',
  piezasPorCaja: '',
  subfamilia: '',
  imagen: '',
};

/** Número tecleado por el comercial (admite coma decimal). Null si no es válido. */
function parsearNumero(texto: string): number | null {
  const normalizado = texto.trim().replace(',', '.');
  if (normalizado === '') return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

export function EntradaManual({ alCrear }: { alCrear: (material: Material) => void }): JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const [campos, setCampos] = useState<CamposManual>(CAMPOS_VACIOS);
  const [errores, setErrores] = useState<Partial<Record<keyof CamposManual, string>>>({});
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const actualiza = (campo: keyof CamposManual) => (valor: string) =>
    setCampos((prev) => ({ ...prev, [campo]: valor }));

  const aceptar = (): void => {
    // Validación básica de campos antes de llamar a la capa de datos.
    const descripcion = campos.descripcion.trim();
    const largoCm = parsearNumero(campos.largo);
    const anchoCm = parsearNumero(campos.ancho);
    const precioUnidadEuros = parsearNumero(campos.precio);
    const piezasPorCaja = parsearNumero(campos.piezasPorCaja);

    const nuevosErrores: Partial<Record<keyof CamposManual, string>> = {};
    if (descripcion === '') nuevosErrores.descripcion = 'La descripción es obligatoria.';
    if (largoCm == null || largoCm <= 0) {
      nuevosErrores.largo = 'Introduce un largo en cm mayor que 0.';
    }
    if (anchoCm == null || anchoCm <= 0) {
      nuevosErrores.ancho = 'Introduce un ancho en cm mayor que 0.';
    }
    if (precioUnidadEuros == null || precioUnidadEuros < 0) {
      nuevosErrores.precio = 'Introduce un precio en €/unidad (0 o mayor).';
    }
    // Obligatorio: se factura por cajas completas, así que sin este dato no se cotiza.
    if (piezasPorCaja == null || !Number.isInteger(piezasPorCaja) || piezasPorCaja < 1) {
      nuevosErrores.piezasPorCaja = 'Introduce cuántas piezas trae la caja (entero, 1 o más).';
    }
    // Subfamilia: opcional y sin efecto en el cálculo, pero si se rellena tiene
    // que ser un número entero (es un id del ERP, no texto libre).
    const subfamiliaTxt = campos.subfamilia.trim();
    const subfamilia = subfamiliaTxt === '' ? null : parsearNumero(subfamiliaTxt);
    if (subfamiliaTxt !== '' && (subfamilia == null || !Number.isInteger(subfamilia) || subfamilia < 0)) {
      nuevosErrores.subfamilia = 'La subfamilia es un número entero; déjala vacía si no la sabes.';
    }
    setErrores(nuevosErrores);
    // Condición explícita (no `Object.keys(...)`) para que TypeScript estreche los nulos.
    if (
      descripcion === '' ||
      largoCm == null ||
      largoCm <= 0 ||
      anchoCm == null ||
      anchoCm <= 0 ||
      precioUnidadEuros == null ||
      precioUnidadEuros < 0 ||
      piezasPorCaja == null ||
      !Number.isInteger(piezasPorCaja) ||
      piezasPorCaja < 1 ||
      nuevosErrores.subfamilia != null
    ) {
      return;
    }

    try {
      const material = crearMaterialManual({
        descripcion,
        largoCm,
        anchoCm,
        precioUnidadEuros,
        piezasPorCaja,
        subfamilia,
        imagenUrl: campos.imagen.trim() === '' ? null : campos.imagen.trim(),
      });
      alCrear(material);
      setCampos(CAMPOS_VACIOS);
      setErrores({});
      setErrorAlta(null);
      setAbierto(false);
    } catch (error: unknown) {
      // La capa de datos puede seguir en construcción: se muestra el motivo sin romper la UI.
      setErrorAlta(error instanceof Error ? error.message : 'No se pudo crear el material manual.');
    }
  };

  return (
    <div className="mt-4 rounded-md border border-slate-200">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold text-slate-700">Entrada manual</span>
        <span className="text-slate-400" aria-hidden>
          {abierto ? '▾' : '▸'}
        </span>
      </button>
      {abierto ? (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          <p className="text-xs text-slate-500">
            Para cerámica que no está ni en ERP ni en PrestaShop (§1.①). El material se marca como
            MANUAL y se tarifa por unidad. Las piezas por caja hacen falta porque se factura por
            cajas completas; los m² por caja se calculan solos a partir del formato. La subfamilia
            es opcional y hoy no afecta al precio: se guarda para el margen comercial futuro.
          </p>
          <Campo etiqueta="Descripción" error={errores.descripcion}>
            <input
              type="text"
              value={campos.descripcion}
              onChange={(e) => actualiza('descripcion')(e.target.value)}
              placeholder="p. ej. Gres rústico almacén"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
            />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Largo (cm)" error={errores.largo}>
              <EntradaNumero
                valor={campos.largo}
                alCambiar={actualiza('largo')}
                invalido={errores.largo != null}
                placeholder="60"
              />
            </Campo>
            <Campo etiqueta="Ancho (cm)" error={errores.ancho}>
              <EntradaNumero
                valor={campos.ancho}
                alCambiar={actualiza('ancho')}
                invalido={errores.ancho != null}
                placeholder="60"
              />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Precio (€/unidad)" error={errores.precio}>
              <EntradaNumero
                valor={campos.precio}
                alCambiar={actualiza('precio')}
                invalido={errores.precio != null}
                placeholder="0,00"
              />
            </Campo>
            <Campo etiqueta="Piezas por caja" error={errores.piezasPorCaja}>
              <EntradaNumero
                valor={campos.piezasPorCaja}
                alCambiar={actualiza('piezasPorCaja')}
                invalido={errores.piezasPorCaja != null}
                placeholder="6"
              />
            </Campo>
          </div>
          <Campo etiqueta="Subfamilia (opcional)" error={errores.subfamilia}>
            <EntradaNumero
              valor={campos.subfamilia}
              alCambiar={actualiza('subfamilia')}
              invalido={errores.subfamilia != null}
              placeholder="p. ej. 1420"
            />
          </Campo>
          <Campo etiqueta="Imagen (URL, opcional)">
            <input
              type="url"
              value={campos.imagen}
              onChange={(e) => actualiza('imagen')(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
            />
          </Campo>
          {errorAlta ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {errorAlta}
            </p>
          ) : null}
          <Boton onClick={aceptar}>Añadir y seleccionar</Boton>
        </div>
      ) : null}
    </div>
  );
}
