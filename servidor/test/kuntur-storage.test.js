import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KunturStorage, KunturStorageError } from '../src/storage/kuntur-storage.js';

async function conAlmacen(fn, quotaBytes = 1024) {
  const root = await mkdtemp(join(tmpdir(), 'kuntur-storage-'));
  try {
    const storage = new KunturStorage({ root, quotaBytes });
    await storage.initialize();
    await fn(storage);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('inicializa estructura y reporta cuota configurada', async () => {
  await conAlmacen(async (storage) => {
    const status = await storage.status();
    assert.equal(status.engine, 'Kuntur Storage');
    assert.equal(status.version, '0.1.0');
    assert.equal(status.quotaBytes, 1024);
    assert.equal(status.usedBytes, 0);
  });
});

test('guarda, lista, recupera y verifica un archivo', async () => {
  await conAlmacen(async (storage) => {
    const data = Buffer.from('%PDF-1.7 contenido de prueba');
    const guardado = await storage.put({
      data,
      originalName: 'unidad-didactica.pdf',
      mimeType: 'application/pdf',
      ownerId: 'docente-1',
    });
    assert.equal(guardado.originalName, 'unidad-didactica.pdf');
    assert.equal(guardado.size, data.length);
    assert.equal((await storage.list()).length, 1);
    const recuperado = await storage.get(guardado.id);
    assert.deepEqual(recuperado.data, data);
    assert.equal(recuperado.metadata.sha256, guardado.sha256);
    assert.equal((await storage.status()).usedBytes, data.length);
  });
});

test('rechaza archivos vacíos y contenido que no sea binario', async () => {
  await conAlmacen(async (storage) => {
    await assert.rejects(storage.put({ data: Buffer.alloc(0) }), { code: 'EMPTY_FILE' });
    await assert.rejects(storage.put({ data: 'texto' }), { code: 'INVALID_DATA' });
  });
});

test('impide superar la cuota configurada', async () => {
  await conAlmacen(async (storage) => {
    await storage.put({ data: Buffer.from('12345678'), originalName: 'a.bin' });
    await assert.rejects(
      storage.put({ data: Buffer.from('12345'), originalName: 'b.bin' }),
      (error) => error instanceof KunturStorageError && error.code === 'QUOTA_EXCEEDED',
    );
  }, 10);
});

test('la eliminación lógica oculta el archivo pero conserva el objeto', async () => {
  await conAlmacen(async (storage) => {
    const guardado = await storage.put({ data: Buffer.from('documento'), originalName: 'documento.pdf' });
    await storage.softDelete(guardado.id);
    assert.equal((await storage.list()).length, 0);
    await assert.rejects(storage.get(guardado.id), { code: 'NOT_FOUND' });
    assert.equal((await storage.status()).usedBytes, Buffer.byteLength('documento'));
  });
});

test('rechaza identificadores manipulados', async () => {
  await conAlmacen(async (storage) => {
    await assert.rejects(storage.get('../../secreto'), { code: 'INVALID_ID' });
  });
});
