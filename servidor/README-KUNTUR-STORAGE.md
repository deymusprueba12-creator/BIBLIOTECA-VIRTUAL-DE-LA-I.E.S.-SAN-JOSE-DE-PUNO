# Kuntur Storage v0.1

Motor de almacenamiento persistente en desarrollo para la Biblioteca Virtual.

## Desarrollo local

Requiere Node.js 22.5 o superior. El motor utiliza únicamente módulos nativos de Node.js.

Las pruebas se ejecutan desde esta carpeta:

```bash
npm test
```

## Uso aislado de prueba

```js
import { KunturStorage, CUOTA_PREDETERMINADA } from './src/storage/kuntur-storage.js';

const storage = new KunturStorage({
  root: '/var/lib/kuntur-storage',
  quotaBytes: CUOTA_PREDETERMINADA,
});

await storage.initialize();
const archivo = await storage.put({
  data: Buffer.from('contenido de ejemplo'),
  originalName: 'ejemplo.txt',
  mimeType: 'text/plain',
  ownerId: 'usuario-id',
});
const recuperado = await storage.get(archivo.id);
console.log(archivo.id, recuperado.data.length);
```

El ejemplo demuestra la API del motor, no una ruta HTTP pública. No conectar directamente desde el navegador ni saltarse las comprobaciones de permisos del backend.
