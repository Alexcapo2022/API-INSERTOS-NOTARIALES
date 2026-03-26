const { composeInMemory, countInsertosPlaceholders } = require('../services/composeOnce.service');
const { mergeMinutaInMemory, countPlaceholder } = require('../services/minuta.service');

function parseIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap(parseIds);
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    if (s.startsWith('[')) { try { return JSON.parse(s); } catch {} }
    return s.split(/[,\s]+/).map(Number).filter(n => !Number.isNaN(n));
  }
  return [];
}

/**
 * POST /api/v1/consolidar
 * form-data:
 *  - file: DOCX base (File)
 *  - minuta: DOCX adjunto (File)
 *  - inserto_id: (Opcional) String de ids ("1,2" o "[1,2]")
 *  - placeholder: (Opcional) String default "[MINUTA]"
 *  - pageBreakBefore: (Opcional) "true"
 *  - pageBreakAfter: (Opcional) "true"
 *  - pageBreakBetween: (Opcional) "true"
 */
async function consolidar(req, res) {
  try {
    const files = req.files || {};
    const file = files.file?.[0];
    const minuta = files.minuta?.[0];
    const body = req.body || {};
    // Prioridad a 'inserto_id' como pidió el usuario
    const ids = parseIds(body.inserto_id ?? body.insertIds ?? body.ids ?? body.insertosIds);

    console.log('[consolidar] → entrada', {
      file: file ? { name: file.originalname, size: file.size } : null,
      minuta: minuta ? { name: minuta.originalname, size: minuta.size } : null,
      inserto_id: ids
    });

    if (!file || !minuta) {
      console.warn('[consolidar] faltan archivos file o minuta');
      return res.status(400).json({ error: 'Envía ambos archivos en form-data: "file" (base) y "minuta" (.docx).' });
    }

    const placeholder = (body.placeholder || '[MINUTA]').trim();
    const before = ['1','true','on','yes'].includes(String(body.pageBreakBefore || '').toLowerCase());
    const after  = ['1','true','on','yes'].includes(String(body.pageBreakAfter  || '').toLowerCase());
    const between = ['1','true','on','yes'].includes(String(body.pageBreakBetween  || '').toLowerCase());

    let currentBuffer = file.buffer;

    // 1. Validar e inyectar [INSERTOS] (Si hay IDs)
    if (ids.length > 0) {
      const { exact: exactI, mixed: mixedI } = await countInsertosPlaceholders(currentBuffer);
      if (exactI === 0 && mixedI === 0) {
        return res.status(400).json({
          error: 'El documento base no contiene el marcador requerido para insertos.',
          marker: '[INSERTOS]',
          found: false
        });
      }
      if (mixedI > 0) {
        return res.status(400).json({
          error: 'El marcador [INSERTOS] debe estar solo en su propio párrafo (sin texto antes/después).',
          marker: '[INSERTOS]',
          mixed: mixedI
        });
      }

      currentBuffer = await composeInMemory(currentBuffer, ids, { pageBreakBetween: between });

      // Post-check insertos
      const postIns = await countInsertosPlaceholders(currentBuffer);
      if (postIns.exact > 0) {
        console.error('[consolidar] aún hay placeholders [INSERTOS] tras componer');
        return res.status(500).json({ error: 'No se pudo insertar en los marcadores [INSERTOS].' });
      }
    } else {
      console.log('[consolidar] No se enviaron inserto_id; se omite paso de composición de insertos.');
    }

    // 2. Validar e inyectar [MINUTA]
    const { exact: exactM, mixed: mixedM } = countPlaceholder(currentBuffer, placeholder);
    if (exactM === 0 && mixedM === 0) {
      return res.status(400).json({
        error: `El documento base no contiene el marcador requerido para la minuta.`,
        marker: placeholder,
        found: false
      });
    }
    if (mixedM > 0) {
      return res.status(400).json({
        error: `El marcador ${placeholder} debe estar solo en su propio párrafo (sin texto antes/después).`,
        marker: placeholder,
        mixed: mixedM
      });
    }

    // Fusionar Minuta
    currentBuffer = mergeMinutaInMemory(currentBuffer, minuta.buffer, {
      placeholder,
      pageBreakBefore: before,
      pageBreakAfter: after
    });

    // Post-check minuta
    const postMin = countPlaceholder(currentBuffer, placeholder);
    if (postMin.exact > 0) {
      console.error('[consolidar] aún hay placeholders [MINUTA] tras componer');
      return res.status(500).json({ error: `No se pudo insertar en el marcador ${placeholder}.` });
    }

    res.setHeader('X-Consolidar-Processed-Ids', ids.length.toString());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="consolidado_${Date.now()}.docx"`);
    return res.send(currentBuffer);

  } catch (err) {
    console.error('[consolidar] ERROR ', err);
    return res.status(500).json({ error: 'No se pudo consolidar el documento' });
  }
}

module.exports = { consolidar };
