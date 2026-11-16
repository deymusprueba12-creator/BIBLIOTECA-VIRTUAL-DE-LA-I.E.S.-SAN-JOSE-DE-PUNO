/*
 * api.js adaptado para SUPABASE (Versión Final)
 */
(function () {
  'use strict';

  window.HEMEROTECA_API = {
    base: 'supabase',
    haySesion: function() { return true; },
    token: function() { return 'supabase-token'; },
    usuarioGuardado: function() { return null; },
    guardarSesion: function() {},
    limpiarSesion: function() {},

    libros: function (filtros) {
      var supabase = window.supabaseClient;
      var consulta = supabase.from('libros').select('*').order('fecha', { ascending: false });
      
      if (filtros && filtros.q) {
        consulta = consulta.or(`titulo.ilike.%${filtros.q}%,autor.ilike.%${filtros.q}%,descripcion.ilike.%${filtros.q}%`);
      }
      if (filtros && filtros.area) {
        consulta = consulta.eq('area', filtros.area);
      }

      return consulta.then(function (respuesta) {
        if (respuesta.error) throw respuesta.error;
        return respuesta.data;
      });
    },

    crearLibro: function (formData) {
      var supabase = window.supabaseClient;
      var archivo = formData.get('archivo');
      
      if (!archivo) return Promise.reject(new Error("No se seleccionó ningún archivo."));

      var nombreArchivo = Date.now() + '_' + archivo.name.replace(/\s+/g, '_');

      return supabase.storage.from('sanjome').upload(nombreArchivo, archivo)
        .then(function (respuestaSubida) {
          if (respuestaSubida.error) throw respuestaSubida.error;

          var urlPublica = supabase.storage.from('sanjome').getPublicUrl(nombreArchivo).data.publicUrl;
          var esPublico = formData.get('publicado') === 'true';

          var datosLibro = {
            titulo: formData.get('titulo') || 'Sin título',
            autor: formData.get('autor') || 'Anónimo',
            descripcion: formData.get('descripcion') || '',
            area: formData.get('area') || '',
            archivo_url: urlPublica,
            nombre_archivo: archivo.name,
            tamano: archivo.size,
            publicado: esPublico
          };

          return supabase.from('libros').insert([datosLibro]).select();
        })
        .then(function (respuestaDB) {
          if (respuestaDB.error) throw respuestaDB.error;
          return respuestaDB.data[0];
        });
    },

    actualizarLibro: function (id, cambios) {
      var supabase = window.supabaseClient;
      if (cambios.publicado !== undefined) {
        cambios.publicado = cambios.publicado === true || cambios.publicado === 'true';
      }
      return supabase.from('libros').update(cambios).eq('id', id).select()
        .then(function (resp) {
          if (resp.error) throw resp.error;
          return resp.data[0];
        });
    },

    eliminarLibro: function (id) {
      var supabase = window.supabaseClient;
      return supabase.from('libros').delete().eq('id', id).then(function (resp) {
        if (resp.error) throw resp.error;
        return true;
      });
    },

    descargarLibro: function (libro) {
      if (libro.archivo_url) {
        window.open(libro.archivo_url, '_blank');
      } else {
        alert('Este libro no tiene un archivo asociado.');
      }
    },
    
    tareas: function() { return Promise.resolve([]); },
    crearTarea: function() { return Promise.reject("Próximamente"); },
    actualizarTarea: function() { return Promise.reject("Próximamente"); },
    eliminarTarea: function() { return Promise.reject("Próximamente"); },
    entregas: function() { return Promise.resolve([]); },
    calificaciones: function() { return Promise.resolve([]); },
    notificaciones: function() { return Promise.resolve([]); }
  };
})();
