/**
 * Materiales de la pieza: textura del material (imagen PrestaShop) o gris
 * neutro cuando no hay imagen o falla la carga (§1 "Visor 3D": el fallo de
 * textura NO bloquea; se avisa con la insignia «Textura no disponible»).
 */

import * as THREE from 'three';

/** Material neutro gris (sin textura o textura fallida). */
export function crearMaterialNeutro(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#9aa4b2', roughness: 0.85, metalness: 0.02 });
}

/**
 * Carga la textura con CORS anónimo (las imágenes vienen del web service de
 * PrestaShop, §1.①). Rechaza la promesa si la carga falla: el llamador cae
 * entonces al material neutro + aviso.
 */
export async function cargarTextura(url: string): Promise<THREE.Texture> {
  const cargador = new THREE.TextureLoader();
  cargador.setCrossOrigin('anonymous');
  const textura = await cargador.loadAsync(url);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.wrapS = THREE.RepeatWrapping;
  textura.wrapT = THREE.RepeatWrapping;
  textura.anisotropy = 8;
  return textura;
}

function sustituirMaterial(mesh: THREE.Mesh, material: THREE.Material): void {
  const anterior = mesh.material as THREE.Material | THREE.Material[];
  if (Array.isArray(anterior)) {
    for (const m of anterior) m.dispose();
  } else {
    anterior.dispose();
  }
  mesh.material = material;
}

/**
 * Aplica la textura a todas las mallas de la pieza, liberando los materiales
 * neutros anteriores. Las mallas extruidas (peldaño romo) traen
 * `userData.repetirTexturaPorUnidad` porque sus UV están en unidades de escena
 * (cm), no normalizadas: reciben un clon de la textura con esa repetición para
 * que el patrón no se estire. Heurística solo visual, sin efecto en cálculo.
 */
export function aplicarTextura(malla: THREE.Group, textura: THREE.Texture): void {
  const materialBase = new THREE.MeshStandardMaterial({
    map: textura,
    roughness: 0.85,
    metalness: 0.02,
  });
  malla.traverse((objeto) => {
    const mesh = objeto as THREE.Mesh;
    if (!mesh.isMesh) return;
    const repeticion = mesh.userData.repetirTexturaPorUnidad as number | undefined;
    if (repeticion !== undefined) {
      const mapa = textura.clone();
      mapa.repeat.set(repeticion, repeticion);
      mapa.needsUpdate = true;
      sustituirMaterial(
        mesh,
        new THREE.MeshStandardMaterial({ map: mapa, roughness: 0.85, metalness: 0.02 }),
      );
    } else {
      sustituirMaterial(mesh, materialBase);
    }
  });
}
