/*
 * pdf-texto.js
 * ------------
 * Extracción del texto de un PDF con pdf.js (copiado al proyecto, sin CDN).
 *
 * Se leen solo las primeras páginas y se limita la cantidad de caracteres
 * para no bloquear el navegador ni consumir memoria con documentos enormes.
 * Si el PDF es escaneado (sin capa de texto) se devuelve `vacio: true` y la
 * interfaz lo explica en lugar de inventar una clasificación.
 */
(function () {
  'use strict';

  var MAX_PAGINAS = 12;
  var MAX_CARACTERES = 40000;

  function disponible() {
    return !!(window.pdfjsLib && window.pdfjsLib.getDocument);
  }

  function configurarTrabajador() {
    if (!disponible()) return;
    var ruta = new URL('vendor/pdfjs/pdf.worker.min.js', document.baseURI).href;
    try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = ruta; } catch (e) { /* versión antigua */ }
  }

  /**
   * Extrae texto de las primeras páginas.
   * @param {File|Blob} archivo
   * @returns {Promise<{texto:string, paginas:number, totalPaginas:number,
   *                    vacio:boolean, truncado:boolean}>}
   */
  function extraer(archivo) {
    if (!disponible()) {
      return Promise.reject(new Error('El lector de PDF no está disponible en este navegador.'));
    }
    configurarTrabajador();

    return archivo.arrayBuffer()
      .then(function (buffer) {
        if (!buffer || buffer.byteLength < 5) throw new Error('El archivo PDF está vacío.');
        return window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      })
      .then(function (pdf) {
        var total = pdf.numPages;
        var limite = Math.min(total, MAX_PAGINAS);
        var acumulado = '';
        var paginas = 0;

        function leerPagina(numero) {
          if (numero > limite || acumulado.length >= MAX_CARACTERES) {
            return Promise.resolve();
          }
          return pdf.getPage(numero).then(function (pagina) {
            return pagina.getTextContent().then(function (contenido) {
              var trozo = contenido.items.map(function (item) {
                return item && item.str ? item.str : '';
              }).join(' ').replace(/\s+/g, ' ');
              if (trozo.trim()) {
                acumulado += trozo + '\n';
                paginas += 1;
              }
              return leerPagina(numero + 1);
            });
          });
        }

        return leerPagina(1).then(function () {
          var texto = acumulado.trim().slice(0, MAX_CARACTERES);
          return {
            texto: texto,
            paginas: paginas,
            totalPaginas: total,
            vacio: texto.length < 40,
            truncado: texto.length >= MAX_CARACTERES || total > limite
          };
        });
      });
  }

  window.PDFTexto = {
    disponible: disponible,
    extraer: extraer,
    MAX_PAGINAS: MAX_PAGINAS,
    MAX_CARACTERES: MAX_CARACTERES
  };
})();
