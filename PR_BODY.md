# BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO — roles y áreas curriculares

## Resumen

- **Renombrado exacto** del sitio: `Hemeroteca de la I.E. SAN JOSÉ DE PUNO` → `BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO` (título, meta description, cabecera del login, marca lateral, pie y configuración por defecto). No se modificó ningún otro texto del sitio.
- **Dos accesos separados** en la misma pantalla de login, mediante pestañas **Docente** y **Estudiante**. Cada rol tiene su propio usuario y contraseña, valida contra hashes SHA-256, rechaza credenciales del otro rol, permite cerrar sesión y protege las secciones internas con un token de sesión con rol y caducidad.
- **11 áreas curriculares** con el nombre oficial exacto, sin numeración (`6.1`, `6.2`…) y sin números de página:
  | Área | Color |
  |---|---|
  | Desarrollo Personal, Ciudadanía y Cívica | `#1E88E5` |
  | Ciencias Sociales | `#43A047` |
  | Educación Física | `#F4511E` |
  | Arte y Cultura | `#8E24AA` |
  | Comunicación | `#E53935` |
  | Castellano como Segunda Lengua | `#00ACC1` |
  | Inglés como Lengua Extranjera | `#3949AB` |
  | Matemática | `#FB8C00` |
  | Ciencia y Tecnología | `#00897B` |
  | Educación para el Trabajo | `#6D4C41` |
  | Educación Religiosa | `#D81B60` |
- **Un espacio de anuncios por área**: cada tarjeta de área tiene su propia lista y su propio formulario (solo docente). Los anuncios se guardan en `hemeroteca_avisos_areas` como `{ [areaId]: [...] }`, totalmente independientes del bloque global `hemeroteca_avisos`, que sigue funcionando igual y no se mezcla con las áreas.
- **Credenciales fuera del repositorio**: `config.js` se genera desde variables de entorno con `scripts/generar-config.mjs` y solo contiene hashes. `.env`, `config.js` y `_admin/` están en `.gitignore`.

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `index.html` | Pestañas de rol en el login, marca y textos renombrados, sección y entrada de navegación "Áreas curriculares", carga de `config.js` antes de `script.js`, corrección del cierre malformado del documento |
| `script.js` | Autenticación por rol con hashes y token con caducidad, bloqueo de intentos, constante `AREAS`, renderizado y acciones de anuncios por área, guarda de Socket.IO |
| `styles.css` | Estilos de las pestañas de rol y de las tarjetas de área (tema claro y oscuro, responsive) |
| `scripts/generar-config.mjs` | Generador de `config.js` desde `.env` o variables del entorno |
| `.env.example` | Plantilla de variables de entorno con placeholders |
| `.github/workflows/deploy-pages.yml` | Publicación opcional en GitHub Pages generando `config.js` desde Secrets |
| `.gitignore` | Ignora `.env`, `config.js`, `_admin/`, `node_modules/` |
| `README.md` | Documentación de roles, configuración, áreas, claves de almacenamiento y limitaciones de seguridad |

## Cómo probar los dos accesos

1. Copia `.env.example` a `.env` y define credenciales de **demostración** (por ejemplo `docente` / `docente123` y `estudiante` / `estudiante123`; no subas ese archivo).
2. Genera la configuración y levanta un servidor local:
   ```bash
   node scripts/generar-config.mjs
   python -m http.server 8099 --bind 127.0.0.1
   ```
3. Abre `http://127.0.0.1:8099/index.html`.

**Acceso docente**
1. Pestaña **Docente** → usuario y contraseña de docente → **Ingresar**.
2. Menú **Áreas curriculares**: se ven las 11 áreas con su color y un formulario por área.
3. Publica un anuncio en *Ciencias Sociales*: aparece solo en esa tarjeta y en ninguna otra.
4. Elimina ese anuncio con el botón **Eliminar** de la tarjeta (pide confirmación).

**Acceso estudiante**
1. **Cerrar sesión** → pestaña **Estudiante** → usuario y contraseña de estudiante → **Ingresar**.
2. Las 11 áreas y sus anuncios se ven en modo lectura; los formularios y los botones de borrado no aparecen.
3. Intenta publicar desde la consola con el formulario del área: el mensaje es "Solo el docente puede publicar anuncios de área" y nada se guarda.

**Comprobaciones adicionales**
- Estando en la pestaña *Docente*, las credenciales de estudiante se rechazan (y viceversa).
- Recargar la página mantiene la sesión; **Cerrar sesión** la elimina.
- 5 intentos fallidos bloquean el acceso 60 segundos, incluso tras recargar.
- Los anuncios generales siguen en su bloque de siempre y no se mezclan con los de área.

## Variables de entorno necesarias

Nombres exactos (valores nunca en el repositorio; mismos nombres como GitHub Secrets para el workflow de Pages):

```
DOCENTE_USUARIO
DOCENTE_PASSWORD
ESTUDIANTE_USUARIO
ESTUDIANTE_PASSWORD
```

## Limitaciones de seguridad (sitio estático)

- No hay backend: la validación ocurre en el navegador, así que cualquiera puede leer `script.js`, `config.js` y el almacenamiento local, o modificar el JavaScript.
- Los hashes SHA-256 evitan contraseñas en texto plano en el código, pero **no son seguridad real**; el bloqueo de intentos y la ocultación de secciones son disuasorios.
- Los datos son locales a cada navegador y no se sincronizan entre equipos.
- Para autenticación y permisos reales hace falta un backend con sesiones y validación en servidor.
- No deben usarse contraseñas personales ni institucionales en este proyecto.

## Notas para quien revise

- No se eliminó ninguna funcionalidad existente ni se tocó la navegación, los estilos globales, los enlaces o las secciones ajenas al cambio.
- `enlace/` (aplicación Node ajena a este sitio) queda fuera del commit.
- `config.js`, `.env` y `_admin/` no están versionados.

## Pruebas realizadas

- `node --check` sobre `script.js`, `config.js` y `scripts/generar-config.mjs`: sin errores.
- `git diff --check`: sin problemas de espacios.
- Búsqueda de secretos en el commit: sin contraseñas en texto plano.
- Pruebas manuales en navegador: ambos logins, rechazo cruzado de rol, cierre de sesión, persistencia de sesión, bloqueo tras 5 intentos, 11 áreas con sus 11 colores exactos, aislamiento y persistencia de anuncios por área, anuncios globales intactos, formularios ocultos y publicación bloqueada para estudiantes, borrado con confirmación, visibilidad en tema claro y oscuro, sin errores ni avisos en consola.
