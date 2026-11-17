/**
 * lib/validacion.js
 * -----------------
 * Validación de entradas. Se aplica SIEMPRE en el servidor: ocultar botones
 * en el navegador no protege nada.
 */

import { ErrorHttp } from './http.js';
import { esAreaValida } from '../areas.js';

/** Texto obligatorio, recortado y con longitud máxima. */
export function textoObligatorio(valor, campo, maximo = 300) {
  const texto = String(valor ?? '').trim();
  if (!texto) throw new ErrorHttp(400, `El campo «${campo}» es obligatorio.`);
  if (texto.length > maximo) {
    throw new ErrorHttp(400, `El campo «${campo}» supera los ${maximo} caracteres.`);
  }
  return texto;
}

/** Texto opcional, recortado y con longitud máxima. */
export function textoOpcional(valor, maximo = 4000) {
  const texto = String(valor ?? '').trim();
  return texto.length > maximo ? texto.slice(0, maximo) : texto;
}

/** Área curricular existente. */
export function areaObligatoria(valor) {
  const id = String(valor ?? '').trim();
  if (!esAreaValida(id)) throw new ErrorHttp(400, 'El área curricular no es válida.');
  return id;
}

/** Número real dentro de un rango. */
export function numeroEntre(valor, campo, minimo, maximo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new ErrorHttp(400, `El campo «${campo}» debe ser numérico.`);
  if (numero < minimo || numero > maximo) {
    throw new ErrorHttp(400, `El campo «${campo}» debe estar entre ${minimo} y ${maximo}.`);
  }
  return numero;
}

/** Número real opcional (null si viene vacío). */
export function numeroOpcionalEntre(valor, campo, minimo, maximo) {
  if (valor === undefined || valor === null || valor === '') return null;
  return numeroEntre(valor, campo, minimo, maximo);
}

/** Booleano tolerante: acepta true/false, 1/0, "1"/"0", "true"/"false". */
export function booleano(valor, porDefecto = false) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  if (typeof valor === 'boolean') return valor;
  const texto = String(valor).trim().toLowerCase();
  if (['1', 'true', 'si', 'sí', 'on'].includes(texto)) return true;
  if (['0', 'false', 'no', 'off'].includes(texto)) return false;
  return porDefecto;
}

/** Fecha ISO válida o null. */
export function fechaOpcional(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorHttp(400, `El campo «${campo}» no es una fecha válida.`);
  }
  return fecha.toISOString();
}

/** Fecha ISO obligatoria. */
export function fechaObligatoria(valor, campo) {
  const fecha = fechaOpcional(valor, campo);
  if (!fecha) throw new ErrorHttp(400, `El campo «${campo}» es obligatorio.`);
  return fecha;
}

/** Identificador con formato razonable (UUID o similar). */
export function identificador(valor, campo = 'id') {
  const id = String(valor ?? '').trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
    throw new ErrorHttp(400, `El identificador de «${campo}» no es válido.`);
  }
  return id;
}

/** Nombre de usuario permitido: letras, números, punto, guion y guion bajo. */
export function usuarioValido(valor) {
  const usuario = String(valor ?? '').trim();
  if (usuario.length < 3 || usuario.length > 40) {
    throw new ErrorHttp(400, 'El usuario debe tener entre 3 y 40 caracteres.');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(usuario)) {
    throw new ErrorHttp(400, 'El usuario solo admite letras, números, punto, guion y guion bajo.');
  }
  return usuario;
}

/** Contraseña con longitud mínima. */
export function contrasenaValida(valor) {
  const contrasena = String(valor ?? '');
  if (contrasena.length < 6) {
    throw new ErrorHttp(400, 'La contraseña debe tener al menos 6 caracteres.');
  }
  if (contrasena.length > 200) {
    throw new ErrorHttp(400, 'La contraseña es demasiado larga.');
  }
  return contrasena;
}
