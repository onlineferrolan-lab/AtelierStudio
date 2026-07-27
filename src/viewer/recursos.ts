/**
 * Liberación de recursos three.js (geometrías, materiales, texturas).
 *
 * Regla del visor (§1 "Visor 3D" + calidad): todo lo que se crea para la pieza
 * se destruye al sustituirla o al desmontar el componente, para no dejar
 * memoria GPU ni listeners colgados con cambios rápidos de props.
 */

import * as THREE from 'three';

function liberarMaterial(material: THREE.Material): void {
  const conMapa = material as THREE.MeshStandardMaterial | THREE.SpriteMaterial;
  if (conMapa.map) conMapa.map.dispose();
  material.dispose();
}

/** Recorre el subárbol liberando geometría, materiales y texturas de cada nodo. */
export function liberarObjeto(raiz: THREE.Object3D): void {
  raiz.traverse((objeto) => {
    const malla = objeto as THREE.Mesh;
    if (malla.geometry) malla.geometry.dispose();
    const material = malla.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      for (const m of material) liberarMaterial(m);
    } else if (material) {
      liberarMaterial(material);
    }
  });
}
