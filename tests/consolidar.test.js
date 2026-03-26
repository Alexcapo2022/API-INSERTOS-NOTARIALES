const request = require('supertest');
const app = require('../src/app');
const { createMockDocx } = require('./test-utils');

describe('POST /api/v1/consolidar', () => {

  const baseContent = `
    <w:p><w:r><w:t>[INSERTOS]</w:t></w:r></w:p>
    <w:p><w:r><w:t>[MINUTA]</w:t></w:r></w:p>
  `;
  const minutaContent = `<w:p><w:r><w:t>Contenido de la minuta</w:t></w:r></w:p>`;

  const baseDoc = createMockDocx(baseContent);
  const minutaDoc = createMockDocx(minutaContent);

  test('Debe consolidar correctamente con todos los parámetros válidos', async () => {
    const res = await request(app)
      .post('/api/v1/consolidar')
      .attach('file', baseDoc, 'base.docx')
      .attach('minuta', minutaDoc, 'minuta.docx')
      .field('inserto_id', '1,2');

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(res.header['x-consolidar-processed-ids']).toBe('2');
  });

  test('Debe funcionar sin inserto_id (opcional)', async () => {
    const res = await request(app)
      .post('/api/v1/consolidar')
      .attach('file', baseDoc, 'base.docx')
      .attach('minuta', minutaDoc, 'minuta.docx');

    expect(res.status).toBe(200);
    expect(res.header['x-consolidar-processed-ids']).toBe('0');
  });

  test('Debe fallar si falta el archivo base (file)', async () => {
    const res = await request(app)
      .post('/api/v1/consolidar')
      .attach('minuta', minutaDoc, 'minuta.docx')
      .field('inserto_id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('file');
  });

  test('Debe fallar si falta la minuta', async () => {
    const res = await request(app)
      .post('/api/v1/consolidar')
      .attach('file', baseDoc, 'base.docx')
      .field('inserto_id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('minuta');
  });

  test('Debe fallar si inserto_id contiene basura (validación estricta)', async () => {
    const res = await request(app)
      .post('/api/v1/consolidar')
      .attach('file', baseDoc, 'base.docx')
      .attach('minuta', minutaDoc, 'minuta.docx')
      .field('inserto_id', '1, ga, 3');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('inválido');
    expect(res.body.error).toContain('ga');
  });

  test('Debe fallar si se envían parámetros inesperados (whitelist)', async () => {
    const res = await request(app)
      .post('/api/v1/consolidar')
      .attach('file', baseDoc, 'base.docx')
      .attach('minuta', minutaDoc, 'minuta.docx')
      .field('parametro_hacker', 'valor');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('parámetros no permitidos');
    expect(res.body.invalidFields).toContain('parametro_hacker');
  });

  test('Debe fallar si el documento base no tiene el marcador [MINUTA]', async () => {
    const baseSinMinuta = createMockDocx('<w:p><w:r><w:t>Nada por aquí</w:t></w:r></w:p>');
    const res = await request(app)
      .post('/api/v1/consolidar')
      .attach('file', baseSinMinuta, 'base.docx')
      .attach('minuta', minutaDoc, 'minuta.docx');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('marcador requerido para la minuta');
  });
});
