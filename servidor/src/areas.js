/**
 * areas.js
 * --------
 * Fuente única de verdad de las 11 áreas curriculares en el servidor.
 * Los identificadores coinciden exactamente con los de `script.js` y
 * `js/clasificador.js` en el cliente.
 *
 * Los nombres son los oficiales, sin numeración ni números de página.
 */

export const AREAS = Object.freeze([
  { id: 'dpcc', nombre: 'Área de Desarrollo Personal, Ciudadanía y Cívica', color: '#1E88E5' },
  { id: 'ccss', nombre: 'Área de Ciencias Sociales', color: '#43A047' },
  { id: 'efisica', nombre: 'Área de Educación Física', color: '#F4511E' },
  { id: 'arte', nombre: 'Área de Arte y Cultura', color: '#8E24AA' },
  { id: 'comunicacion', nombre: 'Área de Comunicación', color: '#E53935' },
  { id: 'castellano', nombre: 'Área de Castellano como Segunda Lengua', color: '#00ACC1' },
  { id: 'ingles', nombre: 'Área de Inglés como Lengua Extranjera', color: '#3949AB' },
  { id: 'matematica', nombre: 'Área de Matemática', color: '#FB8C00' },
  { id: 'cyt', nombre: 'Área de Ciencia y Tecnología', color: '#00897B' },
  { id: 'ept', nombre: 'Área de Educación para el Trabajo', color: '#6D4C41' },
  { id: 'religiosa', nombre: 'Área de Educación Religiosa', color: '#D81B60' },
]);

const IDS = new Set(AREAS.map((a) => a.id));

/** Devuelve true si el identificador corresponde a una de las 11 áreas. */
export function esAreaValida(id) {
  return IDS.has(String(id));
}

/** Devuelve el área o null. */
export function areaPorId(id) {
  return AREAS.find((a) => a.id === id) || null;
}
