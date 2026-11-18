/**
 * bd/almacen.js
 * -------------
 * Acceso centralizado a los datos.
 *
 * - Desarrollo local: usa `node:sqlite` y una base en archivo.
 * - Producción: si TURSO_DATABASE_URL y TURSO_AUTH_TOKEN existen, usa
 *   `@libsql/client` contra Turso.
 *
 * No hay singleton global: cada instancia recibe sus rutas/credenciales.
 * Así las pruebas pueden usar bases temporales sin tocar datos reales.
 */

import { createClient } from '@libsql/client';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESQUEMA = readFileSync(join(AQUI, 'esquema.sql'), 'utf8');

function configuracionRemota() {
  const url = String(process.env.TURSO_DATABASE_URL || '').trim();
  const authToken = String(process.env.TURSO_AUTH_TOKEN || '').trim();

  if (!url && !authToken) return null;
  if (!url || !authToken) {
    throw new Error('[Turso] Debes definir TURSO_DATABASE_URL y TURSO_AUTH_TOKEN juntos.');
  }
  if (!/^(libsql|https?|wss?):\/\//i.test(url)) {
    throw new Error('[Turso] TURSO_DATABASE_URL no es una URL remota válida.');
  }
  return { url, authToken };
}

function normalizar(params) {
  return params.flat().map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p === undefined) return null;
    if (p instanceof Date) return p.toISOString();
    if (p instanceof Uint8Array) return p;
    if (p !== null && typeof p === 'object' && !Buffer.isBuffer(p)) return JSON.stringify(p);
    return p;
  });
}

function crearBDLocal(rutaBd, rutaArchivos) {
  const bd = new DatabaseSync(rutaBd);
  bd.exec('PRAGMA journal_mode = WAL');
  bd.exec('PRAGMA foreign_keys = ON');
  bd.exec('PRAGMA busy_timeout = 5000');
  bd.exec('PRAGMA synchronous = NORMAL');
  bd.exec(ESQUEMA);

  const envoltorio = (sql, params, modo) => {
    const stmt = bd.prepare(sql);
    if (modo === 'all') return stmt.all(...normalizar(params));
    if (modo === 'get') return stmt.get(...normalizar(params)) ?? undefined;
    return stmt.run(...normalizar(params));
  };

  return {
    bd,
    rutaArchivos,
    async todos(sql, ...params) { return envoltorio(sql, params, 'all'); },
    async uno(sql, ...params) { return envoltorio(sql, params, 'get'); },
    async ejecutar(sql, ...params) { return envoltorio(sql, params, 'run'); },
    async transaccion(fn) {
      bd.exec('BEGIN');
      try {
        const tx = {
          bd,
          rutaArchivos,
          todos: async (sql, ...params) => envoltorio(sql, params, 'all'),
          uno: async (sql, ...params) => envoltorio(sql, params, 'get'),
          ejecutar: async (sql, ...params) => envoltorio(sql, params, 'run'),
        };
        const resultado = await fn(tx);
        bd.exec('COMMIT');
        return resultado;
      } catch (error) {
        try { bd.exec('ROLLBACK'); } catch { /* Ya terminó. */ }
        throw error;
      }
    },
    cerrar() {
      try { bd.close(); } catch { /* Ya estaba cerrada. */ }
    },
  };
}

async function crearBDRemota(config, rutaArchivos) {
  const cliente = createClient(config);
  try {
    await cliente.execute('SELECT 1');
    await cliente.executeMultiple(ESQUEMA);
    return {
      bd: cliente,
      rutaArchivos,
      todos: async (sql, ...params) => (await cliente.execute({ sql, args: normalizar(params) })).rows,
      uno: async (sql, ...params) => (await cliente.execute({ sql, args: normalizar(params) })).rows[0],
      ejecutar: async (sql, ...params) => cliente.execute({ sql, args: normalizar(params) }),
    async transaccion(fn) {
      const tx = await cliente.transaction('write');
      try {
        const txAlmacen = {
          bd: tx,
          rutaArchivos,
          todos: async (sql, ...params) => (await tx.execute({ sql, args: normalizar(params) })).rows,
          uno: async (sql, ...params) => (await tx.execute({ sql, args: normalizar(params) })).rows[0],
          ejecutar: async (sql, ...params) => tx.execute({ sql, args: normalizar(params) }),
        };
        const resultado = await fn(txAlmacen);
        await tx.commit();
        return resultado;
      } catch (error) {
        try { await tx.rollback(); } catch { /* Ya terminó. */ }
        throw error;
      } finally {
        if (!tx.closed) tx.close();
      }
    },
    cerrar() {
      try { cliente.close(); } catch { /* Ya estaba cerrada. */ }
    },
    };
  } catch (error) {
    try { cliente.close(); } catch { /* Ya estaba cerrada. */ }
    const detalle = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo conectar/inicializar Turso: ${detalle}`, { cause: error });
  }
}

/**
 * Abre la base de datos y aplica el esquema (idempotente).
 * @param {{rutaBd: string, rutaArchivos: string}} opciones
 */
export async function crearAlmacen({ rutaBd, rutaArchivos }) {
  mkdirSync(dirname(rutaBd), { recursive: true });
  mkdirSync(rutaArchivos, { recursive: true });

  const remota = configuracionRemota();
  return remota
    ? await crearBDRemota(remota, rutaArchivos)
    : crearBDLocal(rutaBd, rutaArchivos);
}

/** Fecha actual en ISO 8601 UTC. */
export function ahora() {
  return new Date().toISOString();
}
