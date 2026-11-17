# 📚 BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO

Biblioteca y aula digital para docentes y estudiantes: libros por área
curricular, tareas con entregas y calificaciones, anuncios generales y por área,
fotos y recorridos de museos virtuales.

La aplicación tiene **dos partes**:

| Parte | Qué es | Dónde vive |
|---|---|---|
| **Frontend** | Sitio estático (HTML + CSS + JavaScript puro, sin frameworks) | Raíz del repositorio |
| **Servidor** | API con Node.js **sin dependencias externas** y base SQLite | `servidor/` |

Los datos de **libros, tareas, entregas, calificaciones, usuarios y
notificaciones** viven **en el servidor**, no en el navegador: el docente
publica y todos los equipos del centro ven lo mismo.

> ⚠️ **Lo que aún es local.** Los **anuncios** (generales y por área), las
> **fotos** y los **museos virtuales** siguen guardándose en el navegador del
> docente (`localStorage` + `IndexedDB`), igual que en la versión anterior de
> esta aplicación: el servidor todavía no tiene API para ellos. Para
> compartirlos con el centro hay que usar **Ajustes → Exportar copia completa**
> en el equipo del docente e **Importar copia de seguridad** en el de cada
> aula.

---

## ✨ Funcionalidades

### 👨‍🏫 Rol DOCENTE

- **Libros**: subir **PDF, Word, JPG o PNG**, editarlos (incluido corregir el
  área), publicarlos o dejarlos en borrador y eliminarlos.
- **Tareas**: crear actividades por área, con fecha límite, fecha de
  publicación programada, adjuntos, reopenura del plazo y puntaje máximo.
- **Entregas**: ver, descargar y **calificar** lo que entrega cada estudiante.
- **Anuncios**: comunicados para todo el grupo y **anuncios independientes
  dentro de cada área curricular** *(locales a cada navegador: ver la nota de
  arriba)*.
- **Áreas curriculares**: las 11 áreas oficiales, cada una con su color y su
  propio espacio de anuncios.
- **Usuarios**: crear cuentas de estudiante y activar o desactivar cuentas.
- **Fotos** y **Museos virtuales**: subir imágenes y agregar recorridos
  *(locales a cada navegador: ver la nota de arriba)*.

### 🎓 Rol ESTUDIANTE

- **Ver la biblioteca** completa y leer los libros en el visor integrado.
- **Entregar las tareas** en PDF, Word o imagen antes de la fecha límite.
- **Ver sus calificaciones** y las observaciones del docente.
- **Ver los anuncios** generales, los de cada área, las fotos y los museos.
- ❌ **No puede** crear, editar ni borrar nada. Los permisos se comprueban
  **en el servidor**, no solo ocultando botones.

### 🗂️ Las 11 áreas curriculares

| Área | Color | Área | Color |
|---|---|---|---|
| Desarrollo Personal, Ciudadanía y Cívica | `#1E88E5` | Castellano como Segunda Lengua | `#00ACC1` |
| Ciencias Sociales | `#43A047` | Inglés como Lengua Extranjera | `#3949AB` |
| Educación Física | `#F4511E` | Matemática | `#FB8C00` |
| Arte y Cultura | `#8E24AA` | Ciencia y Tecnología | `#00897B` |
| Comunicación | `#E53935` | Educación para el Trabajo | `#6D4C41` |
| | | Educación Religiosa | `#D81B60` |

---

## 🚀 Puesta en marcha

### Requisitos

- **Node.js 24 o superior** (usa el módulo nativo `node:sqlite`; con Node 22 o
  23 hay que arrancar con `node --experimental-sqlite src/index.js`).
- Un navegador actual. Para servir el frontend, cualquier servidor local
  (Live Server de VS Code, `python -m http.server`, `npx serve`…).

### 1. Configurar el servidor

```bash
cd servidor
cp .env.example .env
```

Edita `servidor/.env` y define las credenciales iniciales:

```env
PUERTO=3210
HOST=127.0.0.1
DOCENTE_USUARIO=docente
DOCENTE_PASSWORD=docente123
DOCENTE_NOMBRE=Docente
ESTUDIANTE_USUARIO=estudiante
ESTUDIANTE_PASSWORD=estudiante123
ESTUDIANTE_NOMBRE=Estudiante
```

Estas cuentas se crean **la primera vez** que arranca el servidor. Después se
pueden crear más estudiantes desde la propia aplicación.

### 2. Arrancar el servidor

```bash
cd servidor
npm start
```

Salida esperada:

```
Servidor:     http://127.0.0.1:3210
Salud:        http://127.0.0.1:3210/api/salud
Base de datos: .../servidor/datos/biblioteca.sqlite
```

### 3. Generar la configuración del frontend

Desde la raíz del repositorio:

```bash
node scripts/generar-config.mjs
```

Genera `config.js` con **la URL del API y el límite de subida**. No contiene
contraseñas ni secretos, pero está en `.gitignore` y hay que generarlo en cada
instalación.

### 4. Servir el frontend

En otra terminal, desde la raíz del repositorio:

```bash
python -m http.server 8099 --bind 127.0.0.1
```

### 5. Entrar

Abre `http://127.0.0.1:8099/index.html`, elige la pestaña **Docente** o
**Estudiante** e introduce las credenciales del punto 1.

> ⚠️ **El servidor tiene que estar encendido.** Si lo apagas, la pantalla de
> acceso avisa: *«No se pudo conectar con el servidor. Comprueba que esté
> encendido.»* Es el mensaje que aparece cuando `API_URL` no apunta a ningún
> proceso escuchando.

---

## 📁 Estructura del proyecto

```
hemeroteca oficial/
├── index.html                 ← Estructura de la página y formularios
├── styles.css                 ← Estilos, temas claro/oscuro y diseño responsive
├── script.js                  ← Lógica general de la aplicación
├── config.js                  ← Generado por scripts/generar-config.mjs (no se sube)
├── .env / .env.example        ← Variables del frontend (límite de subida)
├── js/
│   ├── api.js                 ← Comunicación con el servidor (fetch + token)
│   ├── biblioteca-ui.js       ← Biblioteca, visor de documentos y clasificación
│   ├── tareas-ui.js           ← Tareas, entregas y calificaciones
│   ├── clasificador.js        ← Propuesta de área a partir del PDF
│   └── pdf-texto.js           ← Extracción de texto del PDF
├── vendor/pdfjs/              ← pdf.js local (Apache-2.0), sin CDN
├── scripts/generar-config.mjs ← Generador de config.js
└── servidor/
    ├── package.json            ← Sin dependencias externas
    ├── .env / .env.example     ← Configuración y credenciales iniciales
    ├── datos/                  ← SQLite y archivos subidos (no se suben)
    ├── src/
    │   ├── index.js            ← Arranque y apagado
    │   ├── app.js              ← Servidor HTTP, CORS, autenticación por token
    │   ├── config.js           ← Lectura de .env y valores por defecto
    │   ├── areas.js            │  Las 11 áreas curriculares
    │   ├── rutas.js            │  Todas las rutas de la API
    │   ├── lib/                │  http, validacion, seguridad, archivos
    │   ├── bd/                 │  almacen.js + esquema.sql
    │   └── servicios/          │  usuarios, libros, tareas, entregas, notificaciones
    └── test/api.test.js        ← 18 pruebas de la API
```

---

## 🔌 API

Todas las rutas cuelgan de `/api`. Salvo las marcadas como públicas, exigen la
cabecera `Authorization: Bearer <token>`.

| Método y ruta | Acceso | Qué hace |
|---|---|---|
| `GET /api/salud` | público | Estado del servidor, versión y las 11 áreas |
| `GET /api/areas` | público | Catálogo de áreas curriculares |
| `POST /api/auth/login` | público | Inicia sesión y devuelve el token |
| `POST /api/auth/logout` | cualquiera | Invalida el token |
| `GET /api/auth/sesion` | cualquiera | Usuario de la sesión actual |
| `GET /api/usuarios` | docente | Lista de usuarios (filtro `?rol=`) |
| `POST /api/usuarios` | docente | Crea un usuario (estudiante o docente) |
| `PATCH /api/usuarios/:id` | docente | Activa, desactiva o renombra |
| `GET /api/libros` | cualquiera | Lista con filtros `?area=`, `?q=`, `?autor=` |
| `GET /api/libros/:id` | cualquiera | Detalle de un libro |
| `POST /api/libros` | docente | Sube un libro (multipart) |
| `PATCH /api/libros/:id` | docente | Edita metadatos o el área |
| `DELETE /api/libros/:id` | docente | Elimina el libro |
| `GET /api/libros/:id/archivo` | cualquiera | Descarga el archivo |
| `GET /api/tareas` | cualquiera | Lista con filtros `?area=`, `?estado=`, `?q=` |
| `GET /api/tareas/:id` | cualquiera | Detalle de una tarea |
| `POST /api/tareas` | docente | Crea una tarea |
| `PATCH /api/tareas/:id` | docente | Edita una tarea |
| `DELETE /api/tareas/:id` | docente | Elimina una tarea |
| `POST /api/tareas/:id/publicacion` | docente | Publica o despublica |
| `POST /api/tareas/:id/adjuntos` | docente | Añade material o adjuntos |
| `GET /api/tareas/:id/entregas` | docente | Entregas de una tarea |
| `POST /api/tareas/:id/entregas` | estudiante | Entrega la tarea (multipart) |
| `GET /api/entregas/:id` | cualquiera | Detalle de una entrega |
| `PATCH /api/entregas/:id` | docente | Califica y comenta una entrega |
| `GET /api/calificaciones` | cualquiera | Calificaciones (`?area=`, `?estudiante=`) |
| `GET /api/notificaciones` | cualquiera | Notificaciones del usuario |
| `GET /api/notificaciones/contador` | cualquiera | Número de no leídas |
| `POST /api/notificaciones/leidas` | cualquiera | Marca como leídas |

Los errores devuelven `{"error": "mensaje legible"}` con el código HTTP
correspondiente (`400` validación, `401` sin sesión, `403` sin permisos, `404`
no encontrado, `409` duplicado, `413` archivo demasiado grande).

---

## 🧪 Pruebas

El servidor incluye una batería de pruebas que no toca los datos reales (cada
ejecución usa una base SQLite y una carpeta de archivos temporales):

```bash
npm test --prefix servidor
```

Resultado actual: **18 pruebas, 18 correctas**. Cubren el inicio de sesión, los
permisos por rol, el aislamiento entre estudiantes, los filtros por área, la
publicación y los borradores, los adjuntos, las entregas, la calificación, el
bloqueo tras 5 intentos fallidos, la invalidación del token al cerrar sesión y
la creación de tareas con campos ausentes.

---

## 🔐 Seguridad

Lo que **sí** hace el servidor:

- Contraseñas con **scrypt** (`node:crypto`), sal aleatoria de 16 bytes por
  usuario y comparación en tiempo constante.
- **Tokens de sesión opacos** de 256 bits, con caducidad configurable
  (`DURACION_SESION_HORAS`) y revocación al cerrar sesión.
- **Comprobación de permisos en servidor** para cada ruta: el cliente puede
  pedir lo que quiera, el servidor es quien decide.
- **Aislamiento entre estudiantes**: cada uno solo ve y toca sus propias
  entregas.
- Bloqueo temporal de la cuenta tras `LIMITE_INTENTOS` fallos.
- Validación de tamaño, tipo de archivo, duplicados (por SHA-256) y rutas de
  archivo.
- CORS con lista de orígenes permitidos en `ORIGENES_PERMITIDOS`.

Lo que **no** hace:

- No hay cifrado en reposo de la base de datos ni copias de seguridad
  automáticas: `servidor/datos/` está en `.gitignore` y hay que respaldarlo a
  mano.
- El servidor es HTTP sin cifrar si lo sirves por red: en producción usa un
  proxy inverso con **HTTPS** (por ejemplo Caddy o Nginx).
- No uses contraseñas personales ni institucionales reales en un entorno de
  pruebas.

---

## 🌐 Publicación

1. Sube el repositorio a GitHub.
2. En el servidor donde se vaya a instalar: `cp servidor/.env.example
   servidor/.env`, define las credenciales y `node scripts/generar-config.mjs`
   con `API_URL=https://tu-dominio/api`.
3. Levanta el servidor con un gestor de procesos (`systemd`, `pm2`, Docker…) y
   pon un proxy inverso con HTTPS delante.
4. Sirve el frontend como estáticos (GitHub Pages, Netlify, Nginx…).

`config.js` está en `.gitignore` a propósito: se genera en cada instalación con
los valores de ese entorno.

---

## ❓ Problemas frecuentes

**«No se pudo conectar con el servidor. Comprueba que esté encendido.»**
El frontend no llega al API. Comprueba, en este orden: (1) que `node src/index.js`
esté corriendo en `servidor/`; (2) que el puerto de `servidor/.env` sea el mismo
que el `apiUrl` de `config.js`; (3) que `config.js` se haya generado después de
cambiar `API_URL`.

**«El login no acepta mis credenciales.»**
Las cuentas iniciales solo se crean la **primera vez** que arranca el servidor
con un `servidor/.env` válido. Si ya existe la base de datos, cambia la
contraseña desde el servidor o borra `servidor/datos/biblioteca.sqlite` para
empezar de cero.

**«¿Los estudiantes ven lo que sube el docente?»**
Sí. Los datos están en el servidor, no en el navegador. Solo tienen que entrar
con su cuenta.

**«¿Cómo cambio la contraseña inicial?»**
Edita `servidor/.env`, borra `servidor/datos/biblioteca.sqlite` y arranca otra
vez el servidor; o usa la gestión de usuarios de la aplicación.

**«¿Hasta cuánto puedo subir?»**
El límite lo marca `TAMANO_MAXIMO_MB` (1024 MB, 1 GB, por defecto) y el frontend avisa antes de subir. En `servidor/.env` puedes reducirlo o dejarlo en 1024 MB si el servidor tiene disco y memoria.

---

## 📄 Licencia

Proyecto educativo de uso libre. Puedes modificarlo y adaptarlo a tu institución
sin restricciones.
