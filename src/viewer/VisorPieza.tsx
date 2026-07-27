/**
 * Visor 3D paramétrico de la pieza (§1 "Visor 3D").
 *
 *  - Pieza aislada sobre fondo neutro claro, proporciones reales (1 ud = 1 cm).
 *  - Textura del material si hay `imagenUrl`; si no hay o falla la carga,
 *    material neutro gris + aviso «Textura no disponible» (NO bloquea).
 *  - Cotas visibles de cada medida, OrbitControls y botón «Restablecer cámara».
 *  - `cantidad` > 1: se muestra la pieza única (varias instaladas: fuera de
 *    alcance de la v1, §8).
 *
 * Ciclo de vida: la escena se crea una vez y se libera entera al desmontar;
 * al cambiar figura/medidas/textura solo se reconstruye el grupo de la pieza.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Figura } from '../domain/config';
import type { Mm } from '../domain/types';
import { Boton, Insignia } from '../ui/components/primitivas';
import { crearGrupoCotas } from './cotas';
import { EscenaVisor } from './escena';
import { construirPieza, faltanMedidasParaPieza } from './geometria';
import { aplicarTextura, cargarTextura } from './materiales';

export interface VisorPiezaProps {
  readonly figura: Figura | null;
  readonly medidasMm: Readonly<Record<string, Mm>> | null;
  readonly imagenUrl: string | null;
  readonly cantidad?: number;
}

type EstadoTextura = 'sin' | 'cargando' | 'lista' | 'error';

export function VisorPieza({
  figura,
  medidasMm,
  imagenUrl,
  cantidad = 1,
}: VisorPiezaProps): JSX.Element {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const escenaRef = useRef<EscenaVisor | null>(null);
  const [estadoTextura, setEstadoTextura] = useState<EstadoTextura>('sin');
  const [visorRoto, setVisorRoto] = useState(false);

  // La escena nace y muere con el componente (cleanup completo al desmontar).
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    let escena: EscenaVisor;
    try {
      escena = new EscenaVisor(contenedor);
    } catch {
      // WebGL no disponible en este navegador: el visor no bloquea el resto (§1).
      setVisorRoto(true);
      return;
    }
    escenaRef.current = escena;
    return () => {
      escena.dispose();
      escenaRef.current = null;
    };
  }, []);

  // Al cambiar figura/medidas/textura solo se reconstruye el grupo de la pieza.
  useEffect(() => {
    const escena = escenaRef.current;
    if (!escena) return;
    if (!figura || !medidasMm) {
      escena.establecerPieza(null);
      setEstadoTextura('sin');
      return;
    }
    const pieza = construirPieza(figura, medidasMm);
    if (!pieza) {
      escena.establecerPieza(null);
      return;
    }
    const raiz = new THREE.Group();
    raiz.add(pieza.malla, crearGrupoCotas(pieza.cotas, pieza.cajaLocal, pieza.dimensionMaxima));
    escena.establecerPieza(raiz);

    if (!imagenUrl) {
      setEstadoTextura('sin');
      return;
    }
    let cancelado = false;
    setEstadoTextura('cargando');
    cargarTextura(imagenUrl)
      .then((textura) => {
        if (cancelado) {
          textura.dispose();
          return;
        }
        aplicarTextura(pieza.malla, textura);
        setEstadoTextura('lista');
      })
      .catch(() => {
        // Textura rota o sin CORS: material neutro + insignia, nunca bloquea (§1).
        if (!cancelado) setEstadoTextura('error');
      });
    return () => {
      cancelado = true;
    };
  }, [figura, medidasMm, imagenUrl]);

  const mensajeVacio = visorRoto
    ? 'No se pudo iniciar el visor 3D (WebGL no disponible en este navegador).'
    : figura === null
      ? 'Selecciona material y figura para ver la pieza'
      : figura.componentes.length === 0
        ? 'Esta figura aún no tiene representación 3D (croquis pendiente de taller, §3).'
        : medidasMm === null || faltanMedidasParaPieza(figura, medidasMm)
          ? 'Introduce las medidas para generar la pieza'
          : null;

  return (
    <div
      data-testid="visor-pieza"
      className="relative h-full min-h-[360px] w-full overflow-hidden bg-slate-100"
    >
      <div ref={contenedorRef} className="absolute inset-0" />
      {mensajeVacio !== null ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-xs text-center text-sm text-slate-500">{mensajeVacio}</p>
        </div>
      ) : (
        <>
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {estadoTextura === 'sin' || estadoTextura === 'error' ? (
              <Insignia tono="pendiente">Textura no disponible</Insignia>
            ) : null}
          </div>
          <div className="absolute right-3 top-3">
            <Boton variante="secundario" onClick={() => escenaRef.current?.restablecerCamara()}>
              Restablecer cámara
            </Boton>
          </div>
          {cantidad > 1 ? (
            <p className="absolute bottom-3 left-3 rounded bg-white/80 px-2 py-1 text-xs text-slate-500">
              Se muestra 1 pieza de {cantidad}; la vista de varias piezas está fuera de alcance.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
