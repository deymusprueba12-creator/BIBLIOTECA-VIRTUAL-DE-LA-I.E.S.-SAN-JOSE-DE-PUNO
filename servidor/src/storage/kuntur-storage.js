/**
 * Kuntur Storage Core — v0.1
 * Almacenamiento local persistente y aislado para la Biblioteca Virtual.
 *
 * Esta primera versión NO sustituye todavía el módulo de archivos actual:
 * se integra en paralelo para probar persistencia, cuota e integridad.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const CUOTA_PREDETERMINADA = 100_000_000_000; // 100 GB decimales
const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class KunturStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'KunturStorageError';
    this.code = code;
  }
}

function nombreSeguro(value) {
  const nombre = String(value || 'archivo').replaceAll('/', '_').replaceAll('\\', '_').replace(/[\x00-\x1f\x7f]/g, '_').trim();
  return (nombre || 'archivo').slice(0, 255);
}

function hash(datos) {
  return createHash('sha256').update(datos).digest('hex');
}

async function archivosJson(directorio) {
  let entradas;
  try {
    entradas = await readdir(directorio, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const encontrados = [];
  for (const entrada of entradas) {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...await archivosJson(ruta));
    else if (entrada.isFile() && entrada.name.endsWith('.json')) encontrados.push(ruta);
  }
  return encontrados;
}

export class KunturStorage {
  #root;
  #quotaBytes;
  #cola = Promise.resolve();

  constructor({ root, quotaBytes = CUOTA_PREDETERMINADA } = {}) {
    if (!root) throw new TypeError('Debes indicar la carpeta root de Kuntur Storage.');
    if (!Number.isSafeInteger(quotaBytes) || quotaBytes <= 0) {
      throw new TypeError('quotaBytes debe ser un entero positivo.');
    }
    this.#root = resolve(root);
    this.#quotaBytes = quotaBytes;
  }

  get quotaBytes() { return this.#quotaBytes; }
  get root() { return this.#root; }

  async initialize() {
    await Promise.all([
      mkdir(join(this.#root, 'objects'), { recursive: true }),
      mkdir(join(this.#root, 'metadata'), { recursive: true }),
      mkdir(join(this.#root, 'temporary'), { recursive: true }),
      mkdir(join(this.#root, 'trash'), { recursive: true }),
    ]);
    return this.status();
  }

  async #serializar(operacion) {
    const siguiente = this.#cola.then(operacion, operacion);
    this.#cola = siguiente.catch(() => {});
    return siguiente;
  }

  #rutas(id) {
    if (!ID_VALIDO.test(String(id))) throw new KunturStorageError('INVALID_ID', 'Identificador de archivo no válido.');
    const parte = id.slice(0, 2);
    return {
      objeto: join(this.#root, 'objects', parte, id + '.blob'),
      metadata: join(this.#root, 'metadata', parte, id + '.json'),
    };
  }

  async #usoReal() {
    let total = 0;
    const metas = await archivosJson(join(this.#root, 'metadata'));
    for (const ruta of metas) {
      try {
        const meta = JSON.parse(await readFile(ruta, 'utf8'));
        if (!meta?.id || !ID_VALIDO.test(meta.id)) continue;
        const { objeto } = this.#rutas(meta.id);
        const info = await stat(objeto);
        if (info.isFile()) total += info.size;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return total;
  }

  async put({ data, originalName, mimeType = 'application/octet-stream', ownerId = null } = {}) {
    return this.#serializar(async () => {
      if (!Buffer.isBuffer(data) && !(data instanceof Uint8Array)) {
        throw new KunturStorageError('INVALID_DATA', 'El contenido debe ser un Buffer o Uint8Array.');
      }
      const bytes = Buffer.from(data);
      if (bytes.length === 0) throw new KunturStorageError('EMPTY_FILE', 'No se permiten archivos vacíos.');
      const usado = await this.#usoReal();
      if (usado + bytes.length > this.#quotaBytes) {
        throw new KunturStorageError('QUOTA_EXCEEDED', 'La capacidad de Kuntur Storage es insuficiente.');
      }

      const id = randomUUID();
      const rutas = this.#rutas(id);
      const temporal = join(this.#root, 'temporary', id + '.blob.tmp');
      const metadataTemporal = join(this.#root, 'temporary', id + '.json.tmp');
      const metadata = {
        id,
        originalName: nombreSeguro(originalName),
        mimeType: String(mimeType).slice(0, 150),
        size: bytes.length,
        sha256: hash(bytes),
        ownerId: ownerId == null ? null : String(ownerId).slice(0, 128),
        createdAt: new Date().toISOString(),
        status: 'active',
        storageKey: relative(this.#root, rutas.objeto).replaceAll('\\', '/'),
      };

      await mkdir(dirname(rutas.objeto), { recursive: true });
      await mkdir(dirname(rutas.metadata), { recursive: true });
      try {
        await writeFile(temporal, bytes, { flag: 'wx' });
        await writeFile(metadataTemporal, JSON.stringify(metadata, null, 2), { flag: 'wx' });
        await rename(temporal, rutas.objeto);
        await rename(metadataTemporal, rutas.metadata);
      } catch (error) {
        await Promise.all([
          rm(temporal, { force: true }),
          rm(metadataTemporal, { force: true }),
          rm(rutas.objeto, { force: true }),
        ]);
        throw error;
      }
      return { ...metadata };
    });
  }

  async getMetadata(id) {
    const { metadata } = this.#rutas(id);
    try {
      return JSON.parse(await readFile(metadata, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') throw new KunturStorageError('NOT_FOUND', 'El archivo no existe.');
      if (error instanceof SyntaxError) throw new KunturStorageError('CORRUPT_METADATA', 'Los metadatos del archivo están dañados.');
      throw error;
    }
  }

  async get(id) {
    const metadata = await this.getMetadata(id);
    if (metadata.status !== 'active') throw new KunturStorageError('NOT_FOUND', 'El archivo no está disponible.');
    const { objeto } = this.#rutas(id);
    let data;
    try {
      data = await readFile(objeto);
    } catch (error) {
      if (error.code === 'ENOENT') throw new KunturStorageError('MISSING_OBJECT', 'No se encuentra el contenido del archivo.');
      throw error;
    }
    const calculado = Buffer.from(hash(data), 'hex');
    const esperado = Buffer.from(metadata.sha256, 'hex');
    if (data.length !== metadata.size || calculado.length !== esperado.length || !timingSafeEqual(calculado, esperado)) {
      throw new KunturStorageError('INTEGRITY_ERROR', 'La verificación SHA-256 del archivo ha fallado.');
    }
    return { metadata, data };
  }

  async list() {
    const metas = await archivosJson(join(this.#root, 'metadata'));
    const resultado = [];
    for (const ruta of metas) {
      try {
        const meta = JSON.parse(await readFile(ruta, 'utf8'));
        if (meta.status === 'active') resultado.push(meta);
      } catch (error) {
        throw error;
      }
    }
    return resultado.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async softDelete(id) {
    return this.#serializar(async () => {
      const meta = await this.getMetadata(id);
      if (meta.status === 'deleted') return meta;
      const actualizada = { ...meta, status: 'deleted', deletedAt: new Date().toISOString() };
      const { metadata } = this.#rutas(id);
      const temporal = join(this.#root, 'temporary', id + '.delete.tmp');
      await writeFile(temporal, JSON.stringify(actualizada, null, 2), { flag: 'w' });
      await rename(temporal, metadata);
      return actualizada;
    });
  }

  async status() {
    const usedBytes = await this.#usoReal();
    return {
      engine: 'Kuntur Storage',
      version: '0.1.0',
      quotaBytes: this.#quotaBytes,
      usedBytes,
      availableBytes: Math.max(0, this.#quotaBytes - usedBytes),
      usagePercent: Number(((usedBytes / this.#quotaBytes) * 100).toFixed(2)),
    };
  }
}

export { CUOTA_PREDETERMINADA };
