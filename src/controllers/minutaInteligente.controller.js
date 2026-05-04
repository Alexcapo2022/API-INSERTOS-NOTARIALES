const db = require('../config/db');
const aiService = require('../services/ai.service');
const minutaService = require('../services/minutaInteligente.service');
const { validateFormatOptions } = require('../utils/formatEnums');

async function procesarMinutaInteligente(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, msg: 'Falta el archivo de minuta (DOCX)' });
    }

    const fileBuffer = req.file.buffer;
    const { co_cnl, fuente, interlineado, margenes } = req.body;
    const tamaño = req.body.tamaño || req.body.tamano; // Soportar ambo nombres

    if (!co_cnl) {
      return res.status(400).json({ ok: false, msg: 'Falta el parámetro co_cnl' });
    }

    // Validar parámetros de formato
    const formatErrors = validateFormatOptions({ fuente, tamaño, interlineado, margenes });
    if (formatErrors.length > 0) {
      return res.status(400).json({ ok: false, msg: 'Parámetros de formato inválidos', errors: formatErrors });
    }

    // 1. Obtener reglas de DB según el co_cnl (Ej: '0101')
    const [rows] = await db.execute(`
      SELECT p.de_prompt 
      FROM p_servicio_cnl s
      JOIN r_servicio_cnl_minuta_prompt r ON s.co_servicio_cnl = r.co_servicio_cnl
      JOIN p_prompt_minuta p ON r.co_prompt = p.co_prompt
      WHERE s.co_cnl = ? 
        AND p.in_estado = 1 
        AND r.in_estado = 1
      ORDER BY p.fe_creacion DESC LIMIT 1
    `, [co_cnl]);

    if (!rows || rows.length === 0) {
      console.error(`[Controller] No se encontraron reglas (prompt) para co_cnl=${co_cnl}`);
      return res.status(404).json({ 
        ok: false, 
        msg: `El código de servicio co_cnl '${co_cnl}' no tiene un prompt configurado o activo en la base de datos.` 
      });
    }
    
    const reglasPrompt = rows[0].de_prompt;

    // 2. Extraer texto para la IA
    const textoDoc = minutaService.extractTextForAI(fileBuffer);
    if (!textoDoc) {
      return res.status(400).json({ ok: false, msg: 'El documento está vacío o no se pudo extraer el texto.' });
    }

    // 3. IA: Detectar límites
    const aiLimits = await aiService.detectarLimitesMinuta(textoDoc, reglasPrompt);
    console.log('[Minuta Inteligente] Límites detectados por IA:', aiLimits);

    if (!aiLimits.texto_inicio || !aiLimits.texto_fin) {
      return res.status(500).json({ ok: false, msg: 'La IA no pudo detectar el inicio y fin correctamente.' });
    }

    // 4. Modificar DOCX: cortar sobrantes y aplicar formato
    const formatOptions = { fuente, tamaño, interlineado, margenes };
    const nuevoDocxBuffer = minutaService.processMinutaInteligente(fileBuffer, aiLimits, formatOptions);

    // 5. Retornar archivo
    const originalName = req.file.originalname || 'documento.docx';
    const baseName = originalName.replace(/\.[^/.]+$/, "");
    const dateStr = new Date().toISOString().split('T')[0];
    const finalName = `${baseName}-${dateStr}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${finalName}"`);
    return res.status(200).send(nuevoDocxBuffer);

  } catch (error) {
    console.error('[Minuta Inteligente] Error:', error);
    res.status(500).json({ ok: false, msg: 'Error interno procesando minuta inteligente', details: error.message });
  }
}

module.exports = {
  procesarMinutaInteligente
};
