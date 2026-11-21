# Kuntur Storage — diseño e implementación v0.1

## Configuración acordada

- Capacidad lógica inicial: **100 GB decimales** (100 000 000 000 bytes).
- Servidor principal: VPS con disco persistente.
- Respaldo secundario: agente automático en Windows 11.
- Alcance final: libros, fotos, museos, tareas, entregas, usuarios, notas y registros.
- Integración: incremental, conservando la Biblioteca Virtual actual.

## Alcance de v0.1

Esta versión incorpora un motor aislado de almacenamiento local persistente:
- estructura de objetos y metadatos particionada por UUID;
- cuota configurable (100 GB decimales por defecto);
- escritura temporal y publicación mediante renombrado atómico;
- SHA-256 calculado al guardar y verificado al recuperar;
- listado, metadatos y eliminación lógica;
- pruebas automatizadas con el módulo nativo node:test.

No modifica todavía las rutas existentes ni migra archivos reales. Esta separación permite probar el motor antes de conectarlo a la biblioteca.

## Estructura del directorio de datos

La carpeta raíz se configurará fuera del repositorio y fuera del directorio público:

```text
/var/lib/kuntur-storage/
  objects/       # binarios originales, por UUID
  metadata/      # metadatos JSON por UUID
  temporary/     # escrituras temporales
  trash/         # reservado para retención y recuperación
```

En producción, el directorio debe residir en un volumen persistente del VPS. No se debe almacenar en el filesystem efímero del contenedor ni dentro del repositorio Git.

## Contrato inicial del motor

`KunturStorage` expone:
- `initialize()`
- `put({ data, originalName, mimeType, ownerId })`
- `get(id)` — devuelve bytes únicamente si la integridad SHA-256 coincide.
- `getMetadata(id)`
- `list()`
- `softDelete(id)`
- `status()`

La validación de formato, autorización de usuarios y límites HTTP continúa siendo responsabilidad del backend existente. El motor no se debe exponer directamente a Internet.

## Integración posterior

1. Adaptar el servicio actual de archivos para escribir en Kuntur Storage detrás de una interfaz.
2. Mantener las APIs y los identificadores que consume el frontend.
3. Añadir migración verificable desde el almacenamiento actual (R2/disco).
4. Incorporar el agente Windows con sincronización saliente, cifrado y manifiestos verificables.
5. Replicar respaldos de base de datos y metadatos, no solo los binarios.
6. Activar tiempo real mediante los eventos existentes o SSE; Socket.IO no es requisito para persistencia.

## Seguridad y operación

- El VPS requiere HTTPS, firewall, actualizaciones y un usuario de sistema sin privilegios.
- El agente Windows inicia conexiones salientes; no se abren puertos entrantes en el hogar.
- No se guardan secretos ni credenciales en Git.
- El respaldo no debe propagar eliminaciones como borrados físicos.
- La copia secundaria debe tener versiones y protección frente a ransomware.
- Una réplica en una sola PC no reemplaza una tercera copia independiente.
- 100 GB es una cuota lógica inicial: el volumen físico del VPS debe tener espacio adicional para sistema, temporales, versiones y margen operativo.

## Pruebas

Ejecutar desde `servidor/`:

```bash
npm test
```

Las pruebas de esta versión cubren inicialización, escritura/lectura, integridad, cuota, eliminación lógica y rechazo de identificadores manipulados.
