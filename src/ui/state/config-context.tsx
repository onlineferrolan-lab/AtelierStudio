/**
 * Carga y contexto de la configuración (tarifas, parámetros, figuras).
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { crearFuenteConfiguracionJson, type Configuracion } from '../../domain/config';

type EstadoConfig =
  | { readonly situacion: 'cargando' }
  | { readonly situacion: 'error'; readonly mensaje: string }
  | { readonly situacion: 'lista'; readonly config: Configuracion };

const ContextoConfig = createContext<EstadoConfig>({ situacion: 'cargando' });

export function ProveedorConfig({ children }: { children: ReactNode }): JSX.Element {
  const [estado, setEstado] = useState<EstadoConfig>({ situacion: 'cargando' });

  useEffect(() => {
    let cancelado = false;
    crearFuenteConfiguracionJson()
      .cargar()
      .then((config) => {
        if (!cancelado) setEstado({ situacion: 'lista', config });
      })
      .catch((error: unknown) => {
        if (!cancelado) {
          setEstado({
            situacion: 'error',
            mensaje: error instanceof Error ? error.message : 'Error desconocido al cargar la configuración',
          });
        }
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return <ContextoConfig.Provider value={estado}>{children}</ContextoConfig.Provider>;
}

export function useEstadoConfig(): EstadoConfig {
  return useContext(ContextoConfig);
}

/** Configuración ya cargada; lanza si se usa antes de tiempo. */
export function useConfig(): Configuracion {
  const estado = useContext(ContextoConfig);
  if (estado.situacion !== 'lista') {
    throw new Error('La configuración aún no está lista');
  }
  return estado.config;
}
