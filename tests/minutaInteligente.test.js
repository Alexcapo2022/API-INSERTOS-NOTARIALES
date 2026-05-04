const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Apuntamos al servidor de producción
const REMOTE_URL = 'http://161.132.68.187:8011';
const MINUTAS_DIR = path.join(__dirname, 'minutas');

describe('Pruebas Unitarias: Minuta Inteligente (Producción)', () => {
  it('Debería procesar correctamente todos los documentos en tests/minutas', async () => {
    // Si el directorio no existe, no hacemos nada
    if (!fs.existsSync(MINUTAS_DIR)) {
      console.log(`[Tests] No existe la carpeta ${MINUTAS_DIR}. Saltando test.`);
      return;
    }

    const files = fs.readdirSync(MINUTAS_DIR).filter(f => f.toLowerCase().endsWith('.docx'));
    if (files.length === 0) {
      console.log(`[Tests] No hay archivos .docx en ${MINUTAS_DIR}. Saltando test.`);
      return;
    }

    // Aumentamos timeout por si los documentos son grandes y la IA demora
    jest.setTimeout(30000 * files.length);

    for (const file of files) {
      console.log(`\n========================================`);
      console.log(`[Test] Procesando archivo: ${file}`);
      const filePath = path.join(MINUTAS_DIR, file);

      // Usamos parámetros genéricos válidos
      const response = await request(REMOTE_URL)
        .post('/api/v1/minuta-inteligente')
        .field('co_cnl', '0101')
        .field('fuente', 'Arial')
        .field('tamaño', '14')
        .field('interlineado', '1.5')
        .field('margenes', '[3,3,3,3]')
        .attach('file', filePath);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      
      const contentDisposition = response.headers['content-disposition'];
      expect(contentDisposition).toBeDefined();
      
      const expectedDate = new Date().toISOString().split('T')[0];
      const baseName = file.replace(/\.[^/.]+$/, "");
      const expectedFileName = `${baseName}-${expectedDate}.docx`;
      
      expect(contentDisposition).toContain(expectedFileName);

      console.log(`[Test] ✔️ Éxito con ${file}. Archivo devuelto: ${expectedFileName} (${response.body.length} bytes).`);
    }
  });
});
