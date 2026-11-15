# 📚 BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO

Proyecto educativo **sin backend**: una biblioteca y aula digital completa
(HTML + CSS + JavaScript puro) que funciona abriéndola en VS Code y publicándola
gratis en **GitHub Pages**.

Sin frameworks, sin servidor y sin base de datos externa. La configuración de
acceso se genera con un pequeño script de Node a partir de variables de entorno.

---

## ✨ Funcionalidades

### 🔐 Acceso por roles (demostración)

Hay **dos accesos separados** en la misma pantalla: una pestaña para **docentes**
y otra para **estudiantes**. Cada rol tiene su propio usuario y contraseña.

Las credenciales **no se escriben en el código ni se suben al repositorio**:

1. Copia `.env.example` a `.env`.
2. Reemplaza los placeholders por credenciales de **demostración**.
3. Genera `config.js` con:

   ```bash
   node scripts/generar-config.mjs
   ```

`config.js` contiene únicamente hashes SHA-256, está en `.gitignore` y se carga
antes de `script.js`. Si falta, el login muestra un aviso de configuración.

> **Limitación importante:** al ser un sitio 100 % estático, este login es una
> **maqueta funcional**, no seguridad real. Cualquier persona con acceso al
> navegador puede leer o modificar el JavaScript, `config.js` y el almacenamiento
> local. Para autenticación real hace falta un backend con sesiones seguras.

### 🔒 Medidas de disuasión del login

- Contraseñas comparadas mediante **hash SHA-256** (`crypto.subtle`), sin texto plano en el JavaScript.
- **Bloqueo de 60 segundos** tras **5 intentos fallidos** (persiste al recargar).
- **Token de sesión con rol y caducidad** en `sessionStorage`; sin token válido no se abren las páginas internas.
- La sesión guardada en `localStorage` solo se acepta si su rol coincide con el token.
- Sanitización de las entradas y protección básica contra clic derecho / F12 / Ctrl+Shift+I / Ctrl+U.
- Estas medidas son **disuasorias**: en frontend puro la seguridad real no existe.

### 🗂️ Áreas curriculares y anuncios

- Se muestran las **11 áreas curriculares** con su nombre oficial, sin numeración
  ni números de página.
- Cada área tiene un **color propio** y su **propia lista de anuncios**.
- Los anuncios de un área **no se mezclan** con los de otra ni con el bloque
  general de anuncios existente.
- Solo el docente puede publicar o eliminar anuncios de área (la configuración de
  permisos de estudiantes se mantiene igual que en los anuncios generales).

### 👨‍🏫 Rol DOCENTE

- **Libros**: subir archivos **Word (.doc / .docx)** y **PDF** de hasta **1 GB** cada uno,
  **editar** los datos (y reemplazar el archivo) y **eliminar**.
- **Tareas**: publicar actividades para el curso o subir entregas.
- **Anuncios**: crear comunicados para todo el grupo.
- **Áreas curriculares**: publicar anuncios en el espacio independiente de cada área.
- **Fotos**: subir una o varias imágenes a la vez y eliminarlas.
- **Museos Virtuales**: agregar enlaces (URL) a museos y recorridos virtuales.
- **Ajustes**: nombre de la institución, curso, límite de tamaño, permisos y respaldo.

### 🎓 Rol ESTUDIANTE

- **Ver y leer** todos los libros (con visor integrado).
- **Subir sus tareas** en formato **foto, Word o PDF**.
- **Ver y usar** los museos virtuales.
- **Ver** los anuncios del docente.
- **Ver** los anuncios de cada área curricular en su espacio correspondiente.
- ❌ **No puede** editar ni eliminar nada.

> Por defecto el estudiante **no** puede borrar nada. Si lo prefieres, el docente
> puede activarlo en **Ajustes → Permisos de estudiantes**.

### 🖥️ Visor de documentos integrado

- **PDF** → se muestra en pantalla completa con el visor nativo del navegador.
- **Word (.docx)** → se convierte a HTML **dentro del navegador** (títulos, negritas,
  cursivas, listas numeradas y con viñetas, tablas, hipervínculos, alineación,
  imágenes y cambios de tamaño). Conversor propio, **sin librerías externas**.
- **Imágenes** → visor con zoom (+, −, restablecer y doble clic).
- **Word antiguo (.doc)** y otros formatos → se ofrece la descarga (el navegador no
  puede interpretar ese formato binario).

---

## 📁 Estructura del proyecto

```
hemeroteca-oficial/
├── index.html              ← Estructura de la página
├── styles.css              ← Estilos, temas claro/oscuro y diseño responsive
├── script.js               ← Toda la lógica de la aplicación
├── config.js               ← Generado desde .env (hashes; no se sube)
├── .env.example            ← Plantilla de variables de entorno
├── scripts/
│   └── generar-config.mjs  ← Genera config.js sin exponer contraseñas
├── .github/workflows/
│   └── deploy-pages.yml    ← Publicación opcional en GitHub Pages
├── _admin/                 ← Solo desarrollador (no se sube)
└── README.md               ← Este archivo
```

---

## 🚀 Abrir en VS Code y ejecutar

### 1. Generar la configuración de acceso

1. Copia `.env.example` y renómbralo a `.env`.
2. Escribe un usuario y una contraseña de **demostración** para docente y otro par para estudiante.
3. Desde la terminal del proyecto ejecuta:

   ```bash
   node scripts/generar-config.mjs
   ```

   Se creará `config.js` con los hashes. No contiene contraseñas en texto plano.

### 2. Abrir el proyecto

1. Abre **Visual Studio Code**.
2. Menú **Archivo → Abrir carpeta…**
3. Selecciona la carpeta `hemeroteca oficial`.
4. Verás los archivos del proyecto en el explorador lateral.

### 3. Instalar la extensión *Live Server*

1. En la barra lateral izquierda haz clic en **Extensiones** (icono de cuadros).
2. Busca **Live Server** (autor *Ritwick Dey*).
3. Haz clic en **Instalar**.

### 4. Ejecutar

1. Abre `index.html`.
2. Clic derecho sobre `index.html` → **Open with Live Server**.
3. Se abrirá en el navegador en `http://127.0.0.1:5500/index.html`.
4. ¡Listo! La aplicación funciona completa.

> **Importante:** usa siempre *Live Server* (o cualquier servidor local).
> Si abres `index.html` con doble clic (`file:///`), algunos navegadores
> bloquean el almacenamiento local y los datos **no se guardarán**.

### 5. Detener el servidor

Cierra la pestaña del navegador o pulsa **Ctrl + Shift + P → Live Server: Stop Server**
en VS Code.

---

## 🔑 Iniciar sesión

1. Elige la pestaña **Docente** o **Estudiante**.
2. Escribe el usuario y la contraseña de demostración que definiste en `.env`.
3. Pulsa **Ingresar**.

- El **docente** puede publicar libros, tareas, anuncios, fotos, museos y anuncios por área.
- El **estudiante** solo puede consultar el material y subir sus tareas.
- El botón **Cerrar sesión** borra el token y vuelve a la pantalla de acceso.

> Tras **5 intentos fallidos**, el acceso se bloquea durante **60 segundos**.
> El bloqueo se guarda en el navegador y se mantiene aunque recargues la página.
> Este login es una **demostración**: no sustituye una autenticación real.

---

## 🌐 Publicar en GitHub Pages (gratis)

### Paso 1 — Crear el repositorio

1. Ve a [github.com](https://github.com) y haz clic en **+ → New repository**.
2. Nombre sugerido: `hemeroteca-oficial`.
3. Marca **Public** (obligatorio para Pages gratuito).
4. Clic en **Create repository**.

### Paso 2 — Subir los archivos

Desde la terminal, dentro de la carpeta del proyecto:

```bash
git init
git add .
git commit -m "BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/hemeroteca-oficial.git
git push -u origin main
```

> Si no tienes Git instalado, puedes subir los archivos arrastrándolos a la web de GitHub
> (botón **Add file → Upload files**).

### Paso 3 — Configurar los secretos y activar GitHub Pages

`config.js` no se sube al repositorio. El workflow incluido lo genera durante la
publicación usando **GitHub Secrets**:

1. En el repositorio ve a **Settings → Secrets and variables → Actions**.
2. Crea estos secretos (valores de demostración, nunca reales):
   - `DOCENTE_USUARIO`
   - `DOCENTE_PASSWORD`
   - `ESTUDIANTE_USUARIO`
   - `ESTUDIANTE_PASSWORD`
3. Ve a **Settings → Pages**.
4. En **Source**, elige **GitHub Actions**.
5. Haz push a `main` (o ejecuta el workflow manualmente desde **Actions**).

El workflow `.github/workflows/deploy-pages.yml` genera `config.js` y publica el
sitio sin exponer las contraseñas.

> Si usas otra plataforma (Netlify, Vercel, servidor propio), configura esas cuatro
> variables en el panel de la plataforma y ejecuta `node scripts/generar-config.mjs`
> como paso de build antes de publicar.

### Paso 4 — Obtener tu dirección

Espera 1–2 minutos. GitHub publicará la página en:

```
https://TU_USUARIO.github.io/hemeroteca-oficial/
```

¡Eso es todo! Anota esa dirección y compártela con tus estudiantes.

> **Cada dispositivo guarda sus propios datos.** Si el docente sube libros en su
> computadora, los estudiantes **no** los verán automáticamente (no hay servidor).
> Para compartir, usa **Ajustes → Exportar copia completa** en el equipo del
> docente e **Importar copia de seguridad** en el de cada estudiante.
> Consulta la sección siguiente para entender el almacenamiento.

---

## 💾 Cómo se guardan los datos

La aplicación usa **dos almacenes del navegador**, ambos 100 % locales y gratuitos:

| Dato | Dónde se guarda | Detalle |
|---|---|---|
| Libros, tareas, anuncios, anuncios por área, fotos, museos, sesión y ajustes | **`localStorage`** | Claves `hemeroteca_libros`, `hemeroteca_tareas`, `hemeroteca_avisos`, `hemeroteca_avisos_areas`, `hemeroteca_fotos`, `hemeroteca_museos`, `hemeroteca_sesion`, `hemeroteca_config`, `hemeroteca_bloqueo` |
| Token de sesión | **`sessionStorage`** | Clave `hemeroteca_token` (se borra al cerrar sesión o la pestaña) |
| Archivos binarios (Word, PDF, imágenes) | **`IndexedDB`** | Base `hemeroteca_archivos`, almacén `archivos` |

### ¿Por qué dos almacenes?

`localStorage` es rapidísimo pero está limitado a **~5 MB**, muy poco para libros.
`IndexedDB` permite guardar **hasta 1 GB por archivo**, que es lo que exige el proyecto.

Los **metadatos** (títulos, autores, fechas, autores de cada registro) se guardan en
`localStorage` con el prefijo `hemeroteca_`; cada registro apunta a su archivo real
mediante el campo `archivoId`.

### ⚠️ Cosas importantes que debes saber

1. **Los datos son locales.** Cada navegador y cada computadora tiene su propia
   hemeroteca. No hay nube ni sincronización automática.
2. **No borres los datos del navegador** (no uses «Borrar datos de navegación» ni
   herramientas de limpieza sin saber lo que haces).
3. **Activa el almacenamiento permanente** en *Ajustes → Solicitar almacenamiento
   permanente* para que el navegador no libere espacio por su cuenta.
4. **Haz respaldos** en *Ajustes → Exportar copia completa* de vez en cuando.

---

## 📦 Respaldo y restauración

En **Ajustes** (solo docente) tienes:

| Botón | Qué hace |
|---|---|
| **Solicitar almacenamiento permanente** | Pide al navegador no borrar los archivos automáticamente. |
| **Exportar metadatos (JSON)** | Descarga solo títulos, autores y fechas (archivo pequeño). |
| **Exportar copia completa (con archivos)** | Descarga **también los archivos** en base64. Si superan 300 MB avisa y sugiere la primera opción. |
| **Importar copia de seguridad** | Restaura un respaldo `.json` (reemplaza los datos actuales). |
| **Borrar todos los datos** | Elimina absolutamente todo. Pide confirmación. |

**Flujo recomendado para repartir material:** el docente exporta la copia completa
y la importa en el equipo de cada aula.

---

## ⚙️ Personalización rápida

### Cambiar usuarios y contraseñas

Las credenciales se definen en `.env` (archivo local, ignorado por Git):

```env
DOCENTE_USUARIO=tu_usuario_docente
DOCENTE_PASSWORD=tu_contrasena_docente
ESTUDIANTE_USUARIO=tu_usuario_estudiante
ESTUDIANTE_PASSWORD=tu_contrasena_estudiante
```

Después de cambiarlas, regenera la configuración:

```bash
node scripts/generar-config.mjs
```

`config.js` se reescribe con los nuevos hashes SHA-256. **No edites `config.js`
a mano ni lo subas al repositorio.** En GitHub Pages, actualiza los secretos del
repositorio y vuelve a ejecutar el workflow.

### Cambiar colores

Abre `styles.css` y modifica el bloque `:root`:

```css
:root {
  --c-primario: #4f46e5;   /* color principal */
  --c-acento:   #0ea5e9;   /* color de acento  */
}
```

También hay un tema oscuro completo ya incluido; el usuario puede alternarlo con
el botón 🌙 / ☀️ de la barra superior.

### Cambiar el límite de tamaño

Por defecto está en `styles.css`/`script.js` a **1 GB**, pero el docente puede elegir
100 MB, 500 MB, 1 GB o 2 GB desde **Ajustes → Límite máximo por archivo**.

> El límite real también depende de lo que permita tu navegador y del espacio
> disponible en el disco.

### Cambiar textos fijos de la interfaz

Casi todos están en `index.html`. Para buscarlos rápidamente en VS Code:
`Ctrl + Shift + F` (Buscar en archivos).

---

## 🧩 Estructura del código (`script.js`)

El archivo está organizado en secciones numeradas para que sea fácil de leer:

| Sección | Contenido |
|---|---|
| 1 | Configuración (roles y carga de `config.js`, extensiones permitidas) |
| 2–3 | Utilidades y notificaciones (toasts) |
| 4–5 | Almacenamiento: `localStorage` e `IndexedDB` |
| 6–7 | Estado de la aplicación y persistencia |
| 8 | Pantalla de inicio de sesión por rol |
| 9–10 | Navegación y temas |
| 11 | Zonas de arrastrar y soltar |
| 12 | Modales y barra de progreso |
| **13** | **Lector ZIP + conversor DOCX a HTML (sin dependencias)** |
| 14 | Visor de archivos (PDF, imágenes, Word) |
| 15–22 | Renderizado de cada sección (incluye áreas y sus anuncios) |
| 23 | Renderizado general |
| 24–29 | Acciones (libros, tareas, anuncios, áreas, fotos, museos, ajustes) |
| 30 | Atajos de teclado y eventos globales |
| 31 | Arranque |

---

## 🔐 Limitaciones de seguridad del sitio estático

Este proyecto **no tiene backend**, por lo que el login es una **maqueta funcional**:

- Las credenciales se comparan en el navegador; cualquiera puede leer `script.js`,
  `config.js` y el almacenamiento local, o modificar el JavaScript.
- Los hashes SHA-256 evitan guardar contraseñas en texto plano, pero **no impiden**
  que alguien con acceso al equipo o a las herramientas del navegador altere la sesión.
- El bloqueo de intentos y la ocultación de secciones son **disuasorios**, no controles
  de seguridad.
- Los datos (libros, tareas, anuncios) son locales a cada navegador y no se sincronizan.
- Para autenticación y permisos reales se necesita un backend con sesiones seguras,
  validación en servidor y una base de datos.

No uses contraseñas personales, institucionales o reales en este proyecto.

---

## ❓ Preguntas frecuentes

**¿Puedo subir un archivo de 1 GB?**
Sí, hasta el límite configurado (1 GB por defecto). El navegador graba el archivo
en IndexedDB; puede tardar unos segundos. Si el archivo supera el límite verás un
aviso rojo antes de subirlo.

**¿Los estudiantes ven lo que sube el docente?**
Sí, pero **solo en el mismo navegador**. Como no hay servidor, cada equipo tiene su
propia copia. Usa *Exportar / Importar* para repartir el material.

**¿Puedo cambiar las credenciales?**
Sí. Edita `.env`, ejecuta `node scripts/generar-config.mjs` y, si publicas en
GitHub Pages, actualiza los secretos del repositorio. No se borra ningún dato de
la biblioteca. Recuerda que el login es una demostración, no seguridad real.

**¿Por qué el login dice que falta `config.js`?**
Porque las credenciales se generan desde `.env`. Copia `.env.example` a `.env`,
completa los valores de demostración y ejecuta `node scripts/generar-config.mjs`.

**¿Por qué no se guardan mis datos al abrir el archivo con doble clic?**
Porque en `file:///` algunos navegadores bloquean el almacenamiento. Usa **Live Server**
o publica en GitHub Pages.

**El archivo Word `.doc` no se ve en pantalla.**
Es el formato antiguo de Word 97‑2003 (binario). Solo se puede ver el `.docx`
(Word 2007 en adelante). Para el `.doc` la app ofrece la descarga.

**¿Cómo limpio todo y empiezo de cero?**
Ajustes → **Borrar todos los datos**, o bien desde el navegador: F12 →
Application → *Clear site data*.

**¿Funciona en el celular y la tablet?**
Sí. El menú lateral se convierte en un menú deslizable y toda la interfaz es
responsive. En el celular la mejor opción es abrir la dirección de GitHub Pages.

**¿Necesito conexión a internet?**
Solo para cargar la página y los enlaces de los museos. Los archivos ya subidos se
leen localmente. El conversor de Word **no** usa ninguna librería externa, así que
funciona incluso sin internet.

---

## ✅ Compatibilidad

Probado y funcional en **Chrome / Edge 90+**, **Firefox 90+** y **Safari 15.4+**.

La conversión de `.docx` usa la API nativa `DecompressionStream`. En navegadores
antiguos la app lo detecta y ofrece la descarga en lugar de fallar.

---

## 📄 Licencia

Proyecto educativo de uso libre. Puedes modificarlo y adaptarlo a tu institución
sin restricciones.
