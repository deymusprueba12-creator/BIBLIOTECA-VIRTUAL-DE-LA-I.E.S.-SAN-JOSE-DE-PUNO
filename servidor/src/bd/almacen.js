/**
 * bd/almacen.js
 * -------------
 * Capa de acceso a datos sobre el módulo nativo `node:sqlite`.
 *
 * No hay singleton global: cada instancia (servidor o prueba) recibe sus
 * propias rutas. Así las pruebas usan una base temporal y no tocan datos reales.
 *
 * Todas las consultas usan parámetros vinculados (?); nunca concatenación.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESQUEMA = readFileSync(join(AQUI, 'esquema.sql'), 'utf8');

/**
 * Abre la base de datos y aplica el esquema (idempotente).
 * @param {{rutaBd: string, rutaArchivos: string}} opciones
 */
export function crearAlmacen({ rutaBd, rutaArchivos }) {
  mkdirSync(dirname(rutaBd), { recursive: true });
  mkdirSync(rutaArchivos, { recursive: true });

  const bd = new DatabaseSync(rutaBd);
  bd.exec('PRAGMA journal_mode = WAL');
  bd.exec('PRAGMA foreign_keys = ON');
  bd.exec('PRAGMA busy_timeout = 5000');
  bd.exec('PRAGMA synchronous = NORMAL');
  bd.exec(ESQUEMA);

  const almacen = {
    bd,
    rutaArchivos,

    todos(sql, ...params) {
      return bd.prepare(sql).all(...normalizar(params));
    },

    uno(sql, ...params) {
      return bd.prepare(sql).get(...normalizar(params)) ?? undefined;
    },

    ejecutar(sql, ...params) {
      return bd.prepare(sql).run(...normalizar(params));
    },

    transaccion(fn) {
      bd.exec('BEGIN');
      try {
        const resultado = fn();
        bd.exec('COMMIT');
        return resultado;
      } catch (err) {
        try {
          bd.exec('ROLLBACK');
        } catch {
          // Ya se deshizo la transacción.
        }
        throw err;
      }
    },

    cerrar() {
      try {
        bd.close();
      } catch {
        // Ya estaba cerrada.
      }
    },
  };

  return almacen;
}

/** node:sqlite solo admite null, number, bigint, string y Uint8Array. */
function normalizar(params) {
  return params.map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p === undefined) return null;
    if (p instanceof Date) return p.toISOString();
    if (p !== null && typeof p === 'object' && !(p instanceof Uint8Array)) {
      return JSON.stringify(p);
    }
    return p;
  });
}

/** Fecha actual en ISO 8601 UTC. */
export function ahora() {
  return new Date().toISOString();
}
