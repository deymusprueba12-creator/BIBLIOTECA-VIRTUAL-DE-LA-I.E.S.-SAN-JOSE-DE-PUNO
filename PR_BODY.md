# BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO — backend, roles y áreas curriculares

## Resumen

Este PR convierte la maqueta estática en una aplicación real con **backend
propio**: una API en Node.js **sin dependencias externas** y base de datos
SQLite, más un frontend estático que speak de ella.

- **Dos roles con permisos comprobados en el servidor**: `docente` y
  `estudiante`. Ocultar botones ya no es la única protección: cada ruta de la
  API decide el acceso y el estudiante solo ve y toca sus propias entregas.
- **Sesiones reales**: contraseñas con **scrypt** (`node:crypto`), sal aleatoria
  por usuario, comparación en tiempo constante y **tokens de sesión opacos** de
  256 bits con caducidad y revocación al cerrar sesión. Se sustituye el login
  de maqueta (hashes SHA-256 en el navegador) por autenticación en servidor.
- **11 áreas curriculares** con el nombre oficial exacto y su color, cada una
  con su **propio espacio de anuncios**, independiente del bloque general.
- **Ciclo académico completo**: libros por área (con visor de PDF/Word
  integrated), tareas con fecha límite, fecha de publicación programada,
  adjuntos y reopenura del plazo, entregas de los estudiantes, calificación con
  observaciones y notificaciones.
- **El frontend modularizado**: `js/api.js` (comunicación con el servidor),
  `js/biblioteca-ui.js`, `js/tareas-ui.js`, `js/clasificador.js` y
  `js/pdf-texto.js`, más `vendor/pdfjs/` local (Apache-2.0) para no depender de
  ninguna CDN.
- **Documentación y configuración al día**: `README.md` reescrito con la
  arquitectura real (antes describía una app «sin backend» que ya no existe),
  plantillas `.env` y `servidor/.env.example` con el límite de subida unificado
  en 100 MB.

## Arquitectura

```
Frontend estático (index.html + styles.css + script.js + js/)  ──HTTP──▶  API Node (servidor/)
                                                                              │
                                                                     SQLite (node:sqlite)
```

- `servidor/src/app.js` — servidor HTTP nativo, CORS y autenticación por token.
- `servidor/src/rutas.js` — todas las rutas de la API.
- `servidor/src/servicios/` — `usuarios`, `libros`, `tareas`, `entregas`,
  `notificaciones`.
- `servidor/src/lib/` — `http`, `validacion`, `seguridad` (scrypt y tokens),
  `archivos`.
- `servidor/src/bd/` — `almacen.js` y `esquema.sql`.
- `servidor/test/api.test.js` — 18 pruebas de la API.

## Corrección de errores

- **500 «Error interno del servidor» al crear una tarea.** `datosTarea()` hacía
  fallback a `fila.titulo` / `fila.area` / `fila.instrucciones` sobre una fila
  inexistente al crear (`fila === null`), y reventaba con `TypeError`. Ahora, en
  creación, título y área se validan siempre (400 con mensaje claro) e
  instrucciones es opcional con valor por defecto `''`, coherente con el
  esquema (`NOT NULL DEFAULT ''`); en edición se mantiene el comportamiento
  anterior. Test de regresión incluido.
- **Login inaccesible («No se pudo conectar con el servidor»).** Faltaba
  `servidor/.env`, sin el cual no se creaban las cuentas iniciales ni se abría
  el puerto. Se documenta el arranque completo en el README.

## Archivos incluidos

| Archivo | Cambio |
|---|---|
| `servidor/` (API completa) | Node sin dependencias: sesión, usuarios, libros, tareas, entregas, calificaciones, notificaciones, archivos y esquema SQLite |
| `servidor/test/api.test.js` | 18 pruebas de la API, incluida la regresión del 500 |
| `servidor/.env.example` | Plantilla de configuración del servidor |
| `js/` | Módulos del frontend: API, biblioteca, tareas, clasificación y texto de PDF |
| `vendor/pdfjs/` | pdf.js local con su licencia, sin CDN |
| `index.html` | Pestañas de rol, áreas curriculares, sección de tareas y carga de `js/` |
| `script.js` | Sesión contra el servidor, áreas, anuncios por área y arranque |
| `styles.css` | Pestañas de rol, tarjetas de área, tema claro/oscuro y responsive |
| `styles.css`, `script.js`, `scripts/generar-config.mjs` | `config.js` pasa a contener solo la URL del API y el límite de subida (sin secretos) |
| `.env.example` | Plantilla con el límite de 100 MB documentado |
| `README.md` | Reescrito con la arquitectura real, la API, las pruebas y el despliegue |
| `PR_BODY.md` | Este documento |

## Cómo probarlo

```bash
# 1. Configurar y arrancar el servidor
cd servidor
cp .env.example .env        # define DOCENTE_* y ESTUDIANTE_*
npm start                   # http://127.0.0.1:3210

# 2. En otra terminal, desde la raíz
node scripts/generar-config.mjs
python -m http.server 8099 --bind 127.0.0.1

# 3. Abrir http://127.0.0.1:8099/index.html
```

**Pruebas automáticas**

```bash
npm test --prefix servidor
```

18 pruebas, 18 correctas: sesión, permisos por rol, aislamiento entre
estudiantes, filtros por área, borradores y publicación, adjuntos, entregas,
calificación, bloqueo tras 5 intentos, cierre de sesión y creación de tareas
con campos ausentes.

**Pruebas manuales realizadas**

- Login de docente y de estudiante; el rol se refleja en el menú y en los
  permisos reales del servidor (`POST /api/tareas` con token de estudiante →
  **403**).
- El estudiante no ve los botones de guardar ni los formularios de las 11 áreas
  (comprobado con `getComputedStyle`, no solo mirando el código).
- Flujo completo en el navegador: el docente crea una tarea desde el formulario
  → el estudiante la ve publicada → entrega el archivo → el docente la califica
  → el estudiante ve la nota y recibe la notificación.
- Creación de tarea **sin** `instrucciones` → **201** (antes 500); **sin**
  título → 400 *«El campo «título» es obligatorio.»*; **sin** área → 400.
- Sesión persistente tras recargar, cierre de sesión que invalida el token,
  cero errores en la consola del navegador.

## Seguridad

- Contraseñas con **scrypt**, sal de 16 bytes por usuario y comparación en
  tiempo constante.
- Tokens opacos de 256 bits (`randomBytes(32)`) con caducidad y revocación.
- Permisos, ownership y validación **en el servidor** en cada ruta.
- Aislamiento entre estudiantes, bloqueo tras 5 intentos y validación de
  archivos (tamaño, tipo, duplicados por SHA-256).
- CORS con lista de orígenes permitidos.

Limitaciones conocidas: el servidor es HTTP sin cifrar (en producción, proxy
inverso con HTTPS), la base de datos no se cifra en reposo ni tiene copia
automática, y `servidor/datos/` hay que respaldarlo a mano.

**Alcance de esta integración:** los **anuncios** (generales y por área), las
**fotos** y los **museos virtuales** siguen siendo **locales a cada navegador**
(`localStorage` + `IndexedDB`): el servidor todavía no expone API para ellos y
se comparten con **Exportar / Importar copia de seguridad**. Es lo que queda
pendiente para la siguiente iteración.

## Notas para quien revise

- **Ningún secreto en el repositorio**: `.env`, `servidor/.env`, `config.js`,
  `servidor/datos/` y `*.sqlite` están en `.gitignore`. Las credenciales de
  demo que aparecen en los ejemplos son de invención.
- `enlace/` (aplicación Node ajena a este sitio) queda fuera del commit.
- `_admin/` sigue fuera del repositorio.
- El renombrado a *BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO* se mantiene
  intacto, incluida la ortografía oficial de las 11 áreas.
