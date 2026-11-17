-- =============================================================================
-- BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO
-- Esquema de la base de datos (SQLite, módulo nativo `node:sqlite`)
--
-- El archivo es idempotente: se ejecuta en cada arranque del servidor.
-- Todas las relaciones usan claves foráneas con ON DELETE CASCADE o RESTRICT
-- según corresponda, para no dejar registros huérfanos.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Usuarios: docentes y estudiantes con contraseña derivada con scrypt.
-- El hash y la sal nunca salen del servidor.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id           TEXT PRIMARY KEY,
  usuario      TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  rol          TEXT NOT NULL CHECK (rol IN ('docente', 'estudiante')),
  hash         TEXT NOT NULL,
  salt         TEXT NOT NULL,
  activo       INTEGER NOT NULL DEFAULT 1,
  creado_en    TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario
  ON usuarios (usuario COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios (rol, activo);

-- ---------------------------------------------------------------------------
-- Sesiones: se guarda solo el SHA-256 del token, nunca el token en claro.
-- Si la base se filtra, las sesiones activas no se pueden reutilizar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  creada_en  TEXT NOT NULL,
  expira_en  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (usuario_id);

-- ---------------------------------------------------------------------------
-- Archivos: metadatos de cada archivo. El binario vive en disco con un
-- nombre aleatorio; el nombre original solo se usa al descargar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS archivos (
  id              TEXT PRIMARY KEY,
  nombre_original TEXT NOT NULL,
  mime            TEXT NOT NULL,
  extension       TEXT NOT NULL,
  tamano          INTEGER NOT NULL,
  sha256          TEXT NOT NULL,
  ruta            TEXT NOT NULL UNIQUE,
  subido_por      TEXT REFERENCES usuarios (id) ON DELETE SET NULL,
  creado_en       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archivos_sha ON archivos (sha256);

-- ---------------------------------------------------------------------------
-- Libros de la biblioteca, clasificados por área curricular.
-- clasificacion: 'auto' si la propuso el analizador, 'manual' si la eligió
-- el docente. La confianza solo tiene sentido en las automáticas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS libros (
  id             TEXT PRIMARY KEY,
  titulo         TEXT NOT NULL,
  autor          TEXT NOT NULL DEFAULT '',
  descripcion    TEXT NOT NULL DEFAULT '',
  area           TEXT NOT NULL,
  archivo_id     TEXT REFERENCES archivos (id) ON DELETE SET NULL,
  clasificacion  TEXT NOT NULL DEFAULT 'manual' CHECK (clasificacion IN ('auto', 'manual')),
  confianza      REAL NOT NULL DEFAULT 0,
  publicado      INTEGER NOT NULL DEFAULT 1,
  docente_id     TEXT NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_libros_area ON libros (area, creado_en);
CREATE INDEX IF NOT EXISTS idx_libros_publicado ON libros (publicado);

-- ---------------------------------------------------------------------------
-- Tareas y actividades académicas.
-- Estados: publicada (visible al estudiante) o borrador.
-- `permite_reapertura` habilita entregar o corregir después del límite.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tareas (
  id                 TEXT PRIMARY KEY,
  titulo             TEXT NOT NULL,
  area               TEXT NOT NULL,
  instrucciones      TEXT NOT NULL DEFAULT '',
  indicaciones       TEXT NOT NULL DEFAULT '',
  publicada          INTEGER NOT NULL DEFAULT 0,
  publicada_en       TEXT,
  fecha_publicacion  TEXT,
  limite_en          TEXT,
  puntaje_maximo     REAL NOT NULL DEFAULT 20 CHECK (puntaje_maximo > 0),
  permite_reapertura INTEGER NOT NULL DEFAULT 0,
  docente_id         TEXT NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  creado_en          TEXT NOT NULL,
  actualizado_en     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tareas_area ON tareas (area, publicada);
CREATE INDEX IF NOT EXISTS idx_tareas_docente ON tareas (docente_id);

-- ---------------------------------------------------------------------------
-- Adjuntos de una tarea: material de consulta o documentos de la actividad.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarea_adjuntos (
  id         TEXT PRIMARY KEY,
  tarea_id   TEXT NOT NULL REFERENCES tareas (id) ON DELETE CASCADE,
  archivo_id TEXT NOT NULL REFERENCES archivos (id) ON DELETE CASCADE,
  titulo     TEXT NOT NULL DEFAULT '',
  tipo       TEXT NOT NULL DEFAULT 'material' CHECK (tipo IN ('material', 'adjunto')),
  creado_en  TEXT NOT NULL,
  UNIQUE (tarea_id, archivo_id)
);

CREATE INDEX IF NOT EXISTS idx_adjuntos_tarea ON tarea_adjuntos (tarea_id);

-- ---------------------------------------------------------------------------
-- Entregas: una por tarea y estudiante.
--
-- estado:
--   entregada      -> subida dentro del plazo
--   en_revision    -> el docente pidió correcciones
--   calificada     -> tiene nota y observaciones
--   fuera_de_plazo -> subida después del límite (solo si hay reapertura)
-- La ausencia de fila equivale al estado "pendiente" en el cliente.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entregas (
  id            TEXT PRIMARY KEY,
  tarea_id      TEXT NOT NULL REFERENCES tareas (id) ON DELETE CASCADE,
  estudiante_id TEXT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  archivo_id    TEXT NOT NULL REFERENCES archivos (id) ON DELETE CASCADE,
  comentario    TEXT NOT NULL DEFAULT '',
  estado        TEXT NOT NULL DEFAULT 'entregada'
                CHECK (estado IN ('entregada', 'en_revision', 'calificada', 'fuera_de_plazo')),
  calificacion  REAL,
  observaciones TEXT NOT NULL DEFAULT '',
  entregada_en  TEXT NOT NULL,
  evaluada_en   TEXT,
  actualizada_en TEXT NOT NULL,
  UNIQUE (tarea_id, estudiante_id)
);

CREATE INDEX IF NOT EXISTS idx_entregas_tarea ON entregas (tarea_id, estado);
CREATE INDEX IF NOT EXISTS idx_entregas_estudiante ON entregas (estudiante_id, entregada_en);

-- ---------------------------------------------------------------------------
-- Notificaciones internas (no se envía ningún correo).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
  id         TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,
  titulo     TEXT NOT NULL,
  detalle    TEXT NOT NULL DEFAULT '',
  tarea_id   TEXT REFERENCES tareas (id) ON DELETE CASCADE,
  entrega_id TEXT REFERENCES entregas (id) ON DELETE CASCADE,
  leida      INTEGER NOT NULL DEFAULT 0,
  creada_en  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario
  ON notificaciones (usuario_id, leida, creada_en);

-- ---------------------------------------------------------------------------
-- Registro de intentos de acceso, para bloquear la fuerza bruta del lado
-- del servidor (el bloqueo del navegador es solo una ayuda visual).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intentos_acceso (
  clave       TEXT PRIMARY KEY,
  fallos      INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT,
  actualizado_en  TEXT NOT NULL
);
