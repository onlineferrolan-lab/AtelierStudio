/**
 * Apertura/cierre de las tarjetas de paso (①-④) del panel izquierdo.
 *
 * Empieza con solo el paso 1 abierto; al completarse un paso (transición de
 * incompleto → completo) se abre el siguiente para guiar el flujo, sin tocar el
 * motor ni el estado de la cotización.
 *
 * REGLA (2026-07-29, indicación directa): el automatismo solo ABRE pasos, nunca
 * cierra ninguno. Cerrar es siempre del comercial, con clic en la cabecera de la
 * tarjeta (`alternar`). Antes el avance cerraba el paso que se completaba y
 * Suplementos cerraba el ③ al activar un suplemento o al pasar el ratón por
 * encima; las tres cosas se han quitado, porque cerraban tarjetas que el
 * comercial estaba usando (y la del ratón, sin que hubiera tocado nada).
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ContextoPasos {
  readonly estado: Readonly<Record<number, boolean>>;
  /** Abre o cierra un paso. Único camino para CERRAR: siempre acción del comercial. */
  readonly alternar: (numero: number) => void;
  readonly abrir: (numero: number) => void;
}

const Contexto = createContext<ContextoPasos | null>(null);

export function ProveedorPasos({
  children,
  inicial = { 1: true },
}: {
  children: ReactNode;
  /** Estado de apertura inicial; solo para tests que montan un paso aislado. */
  inicial?: Readonly<Record<number, boolean>>;
}): JSX.Element {
  const [estado, setEstado] = useState<Record<number, boolean>>(inicial);

  const alternar = useCallback((numero: number) => {
    setEstado((previo) => ({ ...previo, [numero]: !(previo[numero] ?? false) }));
  }, []);

  const abrir = useCallback((numero: number) => {
    setEstado((previo) => ({ ...previo, [numero]: true }));
  }, []);

  return <Contexto.Provider value={{ estado, alternar, abrir }}>{children}</Contexto.Provider>;
}

export function usePasos(): ContextoPasos {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('usePasos debe usarse dentro de <ProveedorPasos>');
  return ctx;
}

/**
 * Al pasar `numero` de incompleto a completo, ABRE el paso siguiente. No cierra
 * nada, ni el propio paso ni ningún otro: el comercial puede seguir ajustando
 * lo que ya tenía abierto mientras el siguiente aparece debajo. Cada `PasoX`
 * llama esto con su propia condición de "completo" (§ ver cada paso: material
 * seleccionado, figura elegida, medidas válidas...).
 *
 * `retrasoMs` (por defecto 0, instantáneo): en pasos de texto libre (medidas)
 * un solo dígito ya puede ser un valor válido (p. ej. mínimo 1 cm) sin que el
 * comercial haya terminado de teclear — con retraso, si vuelve a quedar
 * incompleto antes de que pase el tiempo (sigue escribiendo, borra...), la
 * apertura se cancela y no se nota. En pasos de una sola acción (seleccionar
 * material/figura) no hace falta: 0 está bien.
 */
export function usePasoCompletado(numero: number, completo: boolean, retrasoMs = 0): void {
  const { abrir } = usePasos();
  const eraCompleto = useRef(completo);
  useEffect(() => {
    const transicionoACompleto = completo && !eraCompleto.current;
    eraCompleto.current = completo;
    if (!transicionoACompleto) return;

    if (retrasoMs === 0) {
      abrir(numero + 1);
      return;
    }
    const temporizador = setTimeout(() => abrir(numero + 1), retrasoMs);
    return () => clearTimeout(temporizador);
  }, [completo, numero, abrir, retrasoMs]);
}
