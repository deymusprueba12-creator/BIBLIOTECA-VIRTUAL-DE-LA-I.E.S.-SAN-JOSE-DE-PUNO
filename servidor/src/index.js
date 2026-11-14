/**
 * index.js
 * --------
 * Punto de entrada del servidor. Escucha en PUERTO/HOST y cierra de forma
 * ordenada ante Ctrl+C o una señal de terminación del hosting.
 */

import { iniciarAplicacion } from './app.js';
import { CONFIG } from './config.js';

const app = await iniciarAplicacion();

app.servidor.listen(CONFIG.puerto, CONFIG.host, () => {
  console.log('');
  console.log('  BIBLIOTECA VIRTUAL DE LA I.E.S. SAN JOSÉ DE PUNO');
  console.log('  ------------------------------------------------');
  console.log(`  Servidor:     http://${CONFIG.host}:${CONFIG.puerto}`);
  console.log(`  Salud:        http://${CONFIG.host}:${CONFIG.puerto}/api/salud`);
  console.log(`  Base de datos: ${CONFIG.rutaBd}`);
  console.log(`  Archivos:      ${CONFIG.rutaArchivos}`);
  console.log(`  Límite por archivo: ${CONFIG.tamanoMaximoMb} MB`);
  console.log('');
  console.log('  Recuerda: las credenciales viven en servidor/.env (ignorado por Git).');
  console.log('');
});

let cerrando = false;

async function cerrar(senal) {
  if (cerrando) return;
  cerrando = true;
  console.log(`\n[servidor] ${senal}: cerrando…`);
  try {
    await app.cerrar();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => cerrar('SIGINT'));
process.on('SIGTERM', () => cerrar('SIGTERM'));
