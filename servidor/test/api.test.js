/**
 * Pruebas de la API.
 *
 * Se ejecutan con:  npm test   (dentro de servidor/)
 *
 * Cada ejecución usa una base SQLite y una carpeta de archivos temporales,
 * así que no toca los datos reales del proyecto.
 *
 * Se comprueban permisos, aislamiento entre estudiantes, plazos, calificación,
 * validación de archivos y notificaciones.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iniciarAplicacion } from '../src/app.js';
import { CONFIG } from '../src/config.js';

const PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n' +
  'trailer<</Root 1 0 R>>\n%%EOF\n',
);

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('contenido-de-prueba', 'utf8'),
]);

let app;
let base;
let carpeta;

// Estado compartido entre pruebas, en orden.
const ctx = {
  docente: null,
  estudiante: null,
  ana: null,
  luis: null,
  libro: null,
  libroBorrador: null,
  tarea: null,
  entregaAna: null,
};

before(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'bv-test-'));

  app = await iniciarAplicacion({
    config: {
      ...CONFIG,
      rutaDatos: carpeta,
      rutaBd: join(carpeta, 'prueba.sqlite'),
      rutaArchivos: join(carpeta, 'archivos'),
      origenes: ['*'],
      tamanoMaximoMb: 2,
      tamanoJsonKb: 512,
      limiteIntentos: 5,
      bloqueoSegundos: 60,
      duracionSesionHoras: 1,
      docenteInicial: { usuario: 'docente', contrasena: 'docente123', nombre: 'Docente' },
      estudianteInicial: { usuario: 'estudiante', contrasena: 'estudiante123', nombre: 'Estudiante' },
      nombreAplicacion: 'BIBLIOTECA VIRTUAL (pruebas)',
    },
  });

  await new Promise((resolve) => app.servidor.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${app.servidor.address().port}`;
});

after(async () => {
  if (app) await app.cerrar();
  if (carpeta) await rm(carpeta, { recursive: true, force: true });
});

/* --------------------------------------------------------------------------
   Utilidades de prueba
   -------------------------------------------------------------------------- */

async function pedir(metodo, ruta, { token, cuerpo, formulario } = {}) {
  const cabeceras = {};
  if (token) cabeceras.Authorization = `Bearer ${token}`;

  let body;
  if (cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
    body = JSON.stringify(cuerpo);
  } else if (formulario) {
    body = formulario;
  }

  const respuesta = await fetch(base + ruta, { method: metodo, headers: cabeceras, body });
  const tipo = respuesta.headers.get('content-type') || '';

  let datos = null;
  if (tipo.includes('application/json')) {
    datos = await respuesta.json();
  } else if (tipo.startsWith('application/pdf') || tipo.startsWith('image/') || tipo.includes('word')) {
    datos = Buffer.from(await respuesta.arrayBuffer());
  }

  return { estado: respuesta.status, datos, cabeceras: respuesta.headers };
}

async function entrar(usuario, contrasena) {
  const r = await pedir('POST', '/api/auth/login', { cuerpo: { usuario, contrasena } });
  assert.equal(r.estado, 200, `login de ${usuario} debería funcionar: ${JSON.stringify(r.datos)}`);
  return r.datos;
}

function formularioLibro(campos, bytes = PDF, nombre = 'libro.pdf', tipo = 'application/pdf') {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) f.append(clave, String(valor));
  f.append('archivo', new Blob([bytes], { type: tipo }), nombre);
  return f;
}

function formularioArchivo(campos, bytes, nombre, tipo = 'application/pdf') {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) f.append(clave, String(valor));
  f.append('archivo', new Blob([bytes], { type: tipo }), nombre);
  return f;
}

/* --------------------------------------------------------------------------
   1. Salud pública
   -------------------------------------------------------------------------- */

test('GET /api/salud responde sin sesión y lista las 11 áreas', async () => {
  const r = await pedir('GET', '/api/salud');
  assert.equal(r.estado, 200);
  assert.equal(r.datos.ok, true);
  assert.equal(r.datos.modo, 'servidor');
  assert.equal(r.datos.areas.length, 11);

  const nombres = r.datos.areas.map((a) => a.nombre);
  assert.ok(nombres.includes('Área de Matemática'));
  assert.ok(nombres.includes('Área de Castellano como Segunda Lengua'));

  const colores = r.datos.areas.map((a) => a.color);
  assert.ok(colores.includes('#1E88E5'));
  assert.ok(colores.includes('#D81B60'));
});

/* --------------------------------------------------------------------------
   2. Autenticación
   -------------------------------------------------------------------------- */

test('login correcto, contraseña incorrecta y acceso sin token', async () => {
  const docente = await entrar('docente', 'docente123');
  ctx.docente = docente.token;
  assert.equal(docente.usuario.rol, 'docente');
  assert.equal(docente.usuario.hash, undefined, 'la respuesta no debe incluir el hash');

  const estudiante = await entrar('estudiante', 'estudiante123');
  ctx.estudiante = estudiante.token;
  assert.equal(estudiante.usuario.rol, 'estudiante');

  const malo = await pedir('POST', '/api/auth/login', {
    cuerpo: { usuario: 'docente', contrasena: 'incorrecta' },
  });
  assert.equal(malo.estado, 401);
  assert.match(malo.datos.error, /incorrectos/);

  const sinToken = await pedir('GET', '/api/libros');
  assert.equal(sinToken.estado, 401);

  const datosSesion = await pedir('GET', '/api/auth/sesion', { token: ctx.docente });
  assert.equal(datosSesion.estado, 200);
  assert.equal(datosSesion.datos.usuario.rol, 'docente');
});

test('el docente crea estudiantes y el estudiante no puede crear usuarios', async () => {
  for (const [usuario, nombre] of [['ana', 'Ana Quispe'], ['luis', 'Luis Mamani']]) {
    const r = await pedir('POST', '/api/usuarios', {
      token: ctx.docente,
      cuerpo: { usuario, nombre, rol: 'estudiante', contrasena: 'clave123' },
    });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
  }

  const lista = await pedir('GET', '/api/usuarios?rol=estudiante', { token: ctx.docente });
  assert.equal(lista.estado, 200);
  assert.ok(lista.datos.usuarios.some((u) => u.usuario === 'ana'));

  const prohibido = await pedir('POST', '/api/usuarios', {
    token: ctx.estudiante,
    cuerpo: { usuario: 'intruso', nombre: 'Intruso', rol: 'docente', contrasena: 'clave123' },
  });
  assert.equal(prohibido.estado, 403);

  ctx.ana = (await entrar('ana', 'clave123')).token;
  ctx.luis = (await entrar('luis', 'clave123')).token;
  assert.ok(ctx.ana && ctx.luis);
});

/* --------------------------------------------------------------------------
   3. Libros y clasificación
   -------------------------------------------------------------------------- */

test('subida de libro con área, filtros y búsqueda', async () => {
  const r = await pedir('POST', '/api/libros', {
    token: ctx.docente,
    formulario: formularioLibro({
      titulo: 'Álgebra para secundaria',
      autor: 'Ministerio de Educación',
      descripcion: 'Ecuaciones y funciones',
      area: 'matematica',
      clasificacion: 'auto',
      confianza: 92,
    }),
  });

  assert.equal(r.estado, 201, JSON.stringify(r.datos));
  ctx.libro = r.datos.libro;
  assert.equal(ctx.libro.area, 'matematica');
  assert.equal(ctx.libro.clasificacion, 'auto');
  assert.equal(ctx.libro.confianza, 92);
  assert.equal(ctx.libro.archivo.mime, 'application/pdf');
  assert.ok(ctx.libro.archivo.id);

  const porArea = await pedir('GET', '/api/libros?area=matematica', { token: ctx.estudiante });
  assert.equal(porArea.estado, 200);
  assert.equal(porArea.datos.libros.length, 1);

  const otraArea = await pedir('GET', '/api/libros?area=arte', { token: ctx.estudiante });
  assert.equal(otraArea.datos.libros.length, 0);

  const busqueda = await pedir('GET', '/api/libros?q=%C3%81lgebra', { token: ctx.estudiante });
  assert.equal(busqueda.datos.libros.length, 1);

  const autor = await pedir('GET', '/api/libros?autor=Ministerio', { token: ctx.estudiante });
  assert.equal(autor.datos.libros.length, 1);
});

test('el docente corrige el área y la clasificación pasa a manual', async () => {
  const r = await pedir('PATCH', `/api/libros/${ctx.libro.id}`, {
    token: ctx.docente,
    cuerpo: { area: 'cyt' },
  });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.libro.area, 'cyt');
  assert.equal(r.datos.libro.clasificacion, 'manual');
  assert.equal(r.datos.libro.confianza, 0);

  // Se devuelve a matemática para el resto de pruebas.
  await pedir('PATCH', `/api/libros/${ctx.libro.id}`, {
    token: ctx.docente,
    cuerpo: { area: 'matematica' },
  });
});

test('permisos de libros: estudiante no crea, no edita y no ve borradores', async () => {
  const crear = await pedir('POST', '/api/libros', {
    token: ctx.estudiante,
    formulario: formularioLibro({ titulo: 'Intento', area: 'arte' }),
  });
  assert.equal(crear.estado, 403);

  const editar = await pedir('PATCH', `/api/libros/${ctx.libro.id}`, {
    token: ctx.estudiante,
    cuerpo: { titulo: 'Cambiado' },
  });
  assert.equal(editar.estado, 403);

  const borrador = await pedir('POST', '/api/libros', {
    token: ctx.docente,
    formulario: formularioLibro(
      { titulo: 'Libro sin publicar', area: 'arte', publicado: 'false' },
      Buffer.concat([PDF, Buffer.from('\nborrador')]),
    ),
  });
  assert.equal(borrador.estado, 201, JSON.stringify(borrador.datos));
  ctx.libroBorrador = borrador.datos.libro;
  assert.equal(ctx.libroBorrador.publicado, false);

  const listaEstudiante = await pedir('GET', '/api/libros', { token: ctx.estudiante });
  assert.ok(!listaEstudiante.datos.libros.some((l) => l.id === ctx.libroBorrador.id));

  const detalle = await pedir('GET', `/api/libros/${ctx.libroBorrador.id}`, { token: ctx.estudiante });
  assert.equal(detalle.estado, 403);

  const descarga = await pedir('GET', `/api/libros/${ctx.libroBorrador.id}/archivo`, { token: ctx.estudiante });
  assert.equal(descarga.estado, 403);
});

test('validación de archivos y duplicados', async () => {
  const areaInvalida = await pedir('POST', '/api/libros', {
    token: ctx.docente,
    formulario: formularioLibro({ titulo: 'Sin área', area: 'inventada' }),
  });
  assert.equal(areaInvalida.estado, 400);

  const falso = await pedir('POST', '/api/libros', {
    token: ctx.docente,
    formulario: formularioLibro(
      { titulo: 'Archivo falso', area: 'arte' },
      Buffer.from('%PDX-1.4 esto no es un PDF'),
      'falso.pdf',
    ),
  });
  assert.equal(falso.estado, 415);

  const duplicado = await pedir('POST', '/api/libros', {
    token: ctx.docente,
    formulario: formularioLibro({ titulo: 'Otra copia', area: 'matematica' }),
  });
  assert.equal(duplicado.estado, 409);
  assert.match(duplicado.datos.error, /ya está en la biblioteca/);
});

test('el estudiante descarga el libro publicado', async () => {
  const r = await pedir('GET', `/api/libros/${ctx.libro.id}/archivo`, { token: ctx.estudiante });
  assert.equal(r.estado, 200);
  assert.ok(Buffer.isBuffer(r.datos));
  assert.match(r.cabeceras.get('content-disposition'), /inline/);
  assert.equal(r.cabeceras.get('x-content-type-options'), 'nosniff');
});

/* --------------------------------------------------------------------------
   4. Tareas, adjuntos y publicación
   -------------------------------------------------------------------------- */

test('borrador invisible, publicación y adjuntos', async () => {
  const crear = await pedir('POST', '/api/tareas', {
    token: ctx.docente,
    cuerpo: {
      titulo: 'Práctica de ecuaciones',
      area: 'matematica',
      instrucciones: 'Resuelve los ejercicios 1 al 10.',
      limiteEn: new Date(Date.now() + 7 * 86400000).toISOString(),
      puntajeMaximo: 20,
      publicada: false,
    },
  });
  assert.equal(crear.estado, 201, JSON.stringify(crear.datos));
  ctx.tarea = crear.datos.tarea;
  assert.equal(ctx.tarea.publicada, false);

  const listaEstudiante = await pedir('GET', '/api/tareas', { token: ctx.estudiante });
  assert.equal(listaEstudiante.datos.tareas.length, 0);

  const detalle = await pedir('GET', `/api/tareas/${ctx.tarea.id}`, { token: ctx.estudiante });
  assert.equal(detalle.estado, 403);

  const publicar = await pedir('POST', `/api/tareas/${ctx.tarea.id}/publicacion`, {
    token: ctx.docente,
    cuerpo: { publicada: true },
  });
  assert.equal(publicar.estado, 200);
  assert.equal(publicar.datos.tarea.publicada, true);

  const visible = await pedir('GET', '/api/tareas', { token: ctx.estudiante });
  assert.equal(visible.datos.tareas.length, 1);
  assert.equal(visible.datos.tareas[0].estado, 'pendiente');

  const editarProhibido = await pedir('PATCH', `/api/tareas/${ctx.tarea.id}`, {
    token: ctx.estudiante,
    cuerpo: { titulo: 'Cambiada por el estudiante' },
  });
  assert.equal(editarProhibido.estado, 403);

  const adjunto = await pedir('POST', `/api/tareas/${ctx.tarea.id}/adjuntos`, {
    token: ctx.docente,
    formulario: formularioArchivo(
      { titulo: 'Guía de ejercicios', tipo: 'material' },
      Buffer.concat([PDF, Buffer.from('\nadjunto')]),
      'guia.pdf',
    ),
  });
  assert.equal(adjunto.estado, 201, JSON.stringify(adjunto.datos));
  assert.equal(adjunto.datos.tarea.adjuntos.length, 1);
  ctx.adjuntoId = adjunto.datos.tarea.adjuntos[0].id;

  const descarga = await pedir(
    'GET',
    `/api/tareas/${ctx.tarea.id}/adjuntos/${ctx.adjuntoId}/archivo`,
    { token: ctx.estudiante },
  );
  assert.equal(descarga.estado, 200);

  // Despublicar oculta también los adjuntos.
  await pedir('POST', `/api/tareas/${ctx.tarea.id}/publicacion`, {
    token: ctx.docente,
    cuerpo: { publicada: false },
  });

  const descargaOculta = await pedir(
    'GET',
    `/api/tareas/${ctx.tarea.id}/adjuntos/${ctx.adjuntoId}/archivo`,
    { token: ctx.estudiante },
  );
  assert.equal(descargaOculta.estado, 403);

  await pedir('POST', `/api/tareas/${ctx.tarea.id}/publicacion`, {
    token: ctx.docente,
    cuerpo: { publicada: true },
  });
});

/* --------------------------------------------------------------------------
   5. Entregas, aislamiento y calificación
   -------------------------------------------------------------------------- */

test('el estudiante entrega y solo ve su propia entrega', async () => {
  const entrega = await pedir('POST', `/api/tareas/${ctx.tarea.id}/entregas`, {
    token: ctx.ana,
    formulario: formularioArchivo(
      { comentario: 'Entrego los ejercicios resueltos.' },
      PDF,
      'tarea-ana.pdf',
    ),
  });
  assert.equal(entrega.estado, 201, JSON.stringify(entrega.datos));
  ctx.entregaAna = entrega.datos.entrega;
  assert.equal(ctx.entregaAna.estado, 'entregada');
  assert.equal(ctx.entregaAna.estudianteUsuario, 'ana');

  // Reenvío antes del plazo: reemplaza el archivo, no crea una segunda entrega.
  const reenvio = await pedir('POST', `/api/tareas/${ctx.tarea.id}/entregas`, {
    token: ctx.ana,
    formulario: formularioArchivo(
      { comentario: 'Versión corregida.' },
      Buffer.concat([PDF, Buffer.from('\ncorregida')]),
      'tarea-ana-v2.pdf',
    ),
  });
  assert.equal(reenvio.estado, 201);
  assert.equal(reenvio.datos.entrega.id, ctx.entregaAna.id);
  assert.equal(reenvio.datos.entrega.archivo.nombre, 'tarea-ana-v2.pdf');

  const listaAna = await pedir('GET', '/api/entregas', { token: ctx.ana });
  assert.equal(listaAna.datos.entregas.length, 1);

  // Luis no ve la entrega de Ana.
  const listaLuis = await pedir('GET', '/api/entregas', { token: ctx.luis });
  assert.equal(listaLuis.datos.entregas.length, 0);

  const detalleAjeno = await pedir('GET', `/api/entregas/${ctx.entregaAna.id}`, { token: ctx.luis });
  assert.equal(detalleAjeno.estado, 403);

  const archivoAjeno = await pedir('GET', `/api/entregas/${ctx.entregaAna.id}/archivo`, { token: ctx.luis });
  assert.equal(archivoAjeno.estado, 403);
});

test('el docente revisa, descarga y califica', async () => {
  const lista = await pedir('GET', `/api/tareas/${ctx.tarea.id}/entregas`, { token: ctx.docente });
  assert.equal(lista.estado, 200);
  assert.equal(lista.datos.entregas.length, 1);
  assert.equal(lista.datos.entregas[0].estudianteNombre, 'Ana Quispe');

  const descarga = await pedir('GET', `/api/entregas/${ctx.entregaAna.id}/archivo`, { token: ctx.docente });
  assert.equal(descarga.estado, 200);
  assert.ok(Buffer.isBuffer(descarga.datos));

  const notaAlta = await pedir('PATCH', `/api/entregas/${ctx.entregaAna.id}`, {
    token: ctx.docente,
    cuerpo: { estado: 'calificada', calificacion: 25, observaciones: 'Fuera de rango' },
  });
  assert.equal(notaAlta.estado, 400);

  const calificar = await pedir('PATCH', `/api/entregas/${ctx.entregaAna.id}`, {
    token: ctx.docente,
    cuerpo: { estado: 'calificada', calificacion: 18, observaciones: 'Buen trabajo, revisa el ejercicio 7.' },
  });
  assert.equal(calificar.estado, 200, JSON.stringify(calificar.datos));
  assert.equal(calificar.datos.entrega.estado, 'calificada');
  assert.equal(calificar.datos.entrega.calificacion, 18);
  assert.match(calificar.datos.entrega.observaciones, /ejercicio 7/);
  assert.ok(calificar.datos.entrega.evaluadaEn);

  // El estudiante ve su nota.
  const mias = await pedir('GET', '/api/calificaciones', { token: ctx.ana });
  assert.equal(mias.estado, 200);
  assert.equal(mias.datos.calificaciones.length, 1);
  assert.equal(mias.datos.calificaciones[0].calificacion, 18);
  assert.equal(mias.datos.calificaciones[0].puntajeMaximo, 20);

  // Luis no ve la calificación de Ana.
  const luis = await pedir('GET', '/api/calificaciones', { token: ctx.luis });
  assert.equal(luis.datos.calificaciones.length, 0);
});

test('el estudiante no puede calificarse ni reemplazar una entrega calificada', async () => {
  const intento = await pedir('PATCH', `/api/entregas/${ctx.entregaAna.id}`, {
    token: ctx.ana,
    cuerpo: { calificacion: 20, estado: 'calificada' },
  });
  assert.equal(intento.estado, 403);

  const reenvio = await pedir('POST', `/api/tareas/${ctx.tarea.id}/entregas`, {
    token: ctx.ana,
    formulario: formularioArchivo({ comentario: 'Otra vez' }, PDF, 'otra.pdf'),
  });
  assert.equal(reenvio.estado, 409);
  assert.match(reenvio.datos.error, /calificada/);
});

test('fuera de plazo: se bloquea salvo reapertura del docente', async () => {
  const crear = await pedir('POST', '/api/tareas', {
    token: ctx.docente,
    cuerpo: {
      titulo: 'Actividad vencida',
      area: 'comunicacion',
      instrucciones: 'Entrega atrasada.',
      limiteEn: new Date(Date.now() - 86400000).toISOString(),
      puntajeMaximo: 20,
      publicada: true,
    },
  });
  assert.equal(crear.estado, 201, JSON.stringify(crear.datos));
  const vencida = crear.datos.tarea;

  const bloqueada = await pedir('POST', `/api/tareas/${vencida.id}/entregas`, {
    token: ctx.luis,
    formulario: formularioArchivo({}, PDF, 'luis.pdf'),
  });
  assert.equal(bloqueada.estado, 409);
  assert.match(bloqueada.datos.error, /fecha límite/);

  // El docente habilita una nueva oportunidad.
  const reabrir = await pedir('PATCH', `/api/tareas/${vencida.id}`, {
    token: ctx.docente,
    cuerpo: { permiteReapertura: true },
  });
  assert.equal(reabrir.estado, 200);
  assert.equal(reabrir.datos.tarea.permiteReapertura, true);

  const tardia = await pedir('POST', `/api/tareas/${vencida.id}/entregas`, {
    token: ctx.luis,
    formulario: formularioArchivo({ comentario: 'Entrega tardía' }, PDF, 'luis-tarde.pdf'),
  });
  assert.equal(tardia.estado, 201, JSON.stringify(tardia.datos));
  assert.equal(tardia.datos.entrega.estado, 'fuera_de_plazo');
});

/* --------------------------------------------------------------------------
   6. Notificaciones
   -------------------------------------------------------------------------- */

test('se generan notificaciones de tarea, entrega y calificación', async () => {
  const ana = await pedir('GET', '/api/notificaciones', { token: ctx.ana });
  assert.equal(ana.estado, 200);
  const tiposAna = ana.datos.notificaciones.map((n) => n.tipo);
  assert.ok(tiposAna.includes('tarea_nueva'));
  assert.ok(tiposAna.includes('tarea_calificada'));
  assert.ok(ana.datos.sinLeer > 0);

  const docente = await pedir('GET', '/api/notificaciones', { token: ctx.docente });
  const tiposDocente = docente.datos.notificaciones.map((n) => n.tipo);
  assert.ok(tiposDocente.includes('entrega_registrada'));

  const marcar = await pedir('POST', '/api/notificaciones/leidas', {
    token: ctx.ana,
    cuerpo: {},
  });
  assert.equal(marcar.estado, 200);
  assert.equal(marcar.datos.sinLeer, 0);
});

/* --------------------------------------------------------------------------
   7. Bloqueo por fuerza bruta
   -------------------------------------------------------------------------- */

test('cinco fallos bloquean el acceso en el servidor', async () => {
  const estados = [];
  for (let i = 0; i < 5; i++) {
    const r = await pedir('POST', '/api/auth/login', {
      cuerpo: { usuario: 'luis', contrasena: `mala${i}` },
    });
    estados.push(r.estado);
  }
  assert.deepEqual(estados.slice(0, 4), [401, 401, 401, 401]);
  assert.equal(estados[4], 429);

  const conClaveCorrecta = await pedir('POST', '/api/auth/login', {
    cuerpo: { usuario: 'luis', contrasena: 'clave123' },
  });
  assert.equal(conClaveCorrecta.estado, 429);
  assert.match(conClaveCorrecta.datos.error, /intentos/);
});

/* --------------------------------------------------------------------------
   8. Cierre de sesión
   -------------------------------------------------------------------------- */

test('logout invalida el token', async () => {
  const sesion = await entrar('estudiante', 'estudiante123');
  const salir = await pedir('POST', '/api/auth/logout', { token: sesion.token });
  assert.equal(salir.estado, 200);

  const despues = await pedir('GET', '/api/auth/sesion', { token: sesion.token });
  assert.equal(despues.estado, 401);
});

/* --------------------------------------------------------------------------
   9. Aislamiento de tareas por área
   -------------------------------------------------------------------------- */

test('los filtros por área no mezclan tareas', async () => {
  const matematicas = await pedir('GET', '/api/tareas?area=matematica', { token: ctx.docente });
  const comunicacion = await pedir('GET', '/api/tareas?area=comunicacion', { token: ctx.docente });
  const arte = await pedir('GET', '/api/tareas?area=arte', { token: ctx.docente });

  assert.equal(matematicas.datos.tareas.length, 1);
  assert.equal(comunicacion.datos.tareas.length, 1);
  assert.equal(arte.datos.tareas.length, 0);
  assert.equal(matematicas.datos.tareas[0].area, 'matematica');
  assert.equal(comunicacion.datos.tareas[0].area, 'comunicacion');
});
