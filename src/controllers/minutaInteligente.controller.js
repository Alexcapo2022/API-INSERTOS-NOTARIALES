const db = require('../config/db');
const aiService = require('../services/ai.service');
const minutaService = require('../services/minutaInteligente.service');
const { validateFormatOptions } = require('../utils/formatEnums');

async function procesarMinutaInteligente(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, msg: 'Falta el archivo de minuta (DOCX)' });
    }

    // Validar extensión del archivo (solo .docx)
    if (!req.file.originalname.toLowerCase().endsWith('.docx')) {
      return res.status(400).json({ 
        ok: false, 
        msg: 'Formato de archivo inválido. El sistema solo soporta documentos en formato .docx. Si tienes un .doc antiguo, ábrelo en Word y guárdalo como .docx antes de procesarlo.' 
      });
    }

    const fileBuffer = req.file.buffer;
    const { co_cnl, fuente, interlineado, margenes, usar_prompt } = req.body;
    const tamaño = req.body.tamaño || req.body.tamano; // Soportar ambo nombres

    if (!co_cnl) {
      return res.status(400).json({ ok: false, msg: 'Falta el parámetro co_cnl' });
    }

    // Validar parámetros de formato
    const formatErrors = validateFormatOptions({ fuente, tamaño, interlineado, margenes });
    if (formatErrors.length > 0) {
      return res.status(400).json({ ok: false, msg: 'Parámetros de formato inválidos', errors: formatErrors });
    }

    const formatOptions = { fuente, tamaño, interlineado, margenes };
    let aiLimits = null;

    if (String(usar_prompt) === '1' || String(usar_prompt) === 'true') {
      // 1. Obtener reglas de DB según el co_cnl
      let [rows] = await db.execute(`
        SELECT p.de_prompt 
        FROM p_servicio_cnl s
        JOIN r_servicio_cnl_minuta_prompt r ON s.co_servicio_cnl = r.co_servicio_cnl
        JOIN p_prompt_minuta p ON r.co_prompt = p.co_prompt
        WHERE s.co_cnl = ? 
          AND p.in_estado = 1 
          AND r.in_estado = 1
        ORDER BY p.fe_creacion DESC LIMIT 1
      `, [co_cnl]);

      // Fallback Automático si no hay reglas
      if (!rows || rows.length === 0) {
        console.warn(`[Controller] No hay prompt para co_cnl=${co_cnl}. Ejecutando Fallback al Prompt 1.`);
        const [servRows] = await db.execute('SELECT co_servicio_cnl FROM p_servicio_cnl WHERE co_cnl = ? LIMIT 1', [co_cnl]);
        
        if (servRows && servRows.length > 0) {
          const co_servicio_cnl = servRows[0].co_servicio_cnl;
          // Crear la relación con el prompt maestro (1) con manejo de errores
          try {
            await db.execute(
              'INSERT INTO r_servicio_cnl_minuta_prompt (co_servicio_cnl, co_prompt, in_estado, fe_creacion) VALUES (?, 1, 1, NOW())',
              [co_servicio_cnl]
            );
            console.log(`[Controller] Configuración fallback creada para co_servicio_cnl=${co_servicio_cnl}`);
          } catch (insertError) {
            console.warn(`[Controller] No se pudo insertar fallback (quizás ya existía):`, insertError.message);
          }
          // Volver a consultar
          const [fallbackRows] = await db.execute('SELECT de_prompt FROM p_prompt_minuta WHERE co_prompt = 1 LIMIT 1');
          if (fallbackRows && fallbackRows.length > 0) {
            rows = fallbackRows;
          }
        } else {
          console.error(`[Controller] Fallback falló: No existe co_servicio_cnl para co_cnl=${co_cnl} en p_servicio_cnl`);
        }
      }

      if (rows && rows.length > 0) {
        const reglasPrompt = rows[0].de_prompt;

        // 2. Extraer texto para la IA
        const textoDoc = minutaService.extractTextForAI(fileBuffer);
        if (!textoDoc) {
          return res.status(400).json({ ok: false, msg: 'El documento está vacío o no se pudo extraer el texto.' });
        }

        // 3. IA: Detectar límites
        aiLimits = await aiService.detectarLimitesMinuta(textoDoc, reglasPrompt);
        console.log('[Minuta Inteligente] Límites detectados por IA:', aiLimits);

        if (!aiLimits.texto_inicio || !aiLimits.texto_fin) {
          return res.status(500).json({ ok: false, msg: 'La IA no pudo detectar el inicio y fin correctamente.' });
        }
      } else {
         console.error(`[Controller] Falló incluso el fallback para co_cnl=${co_cnl}`);
         return res.status(500).json({ ok: false, msg: 'No se pudo aplicar la limpieza por IA, reglas maestras no encontradas.' });
      }
    } else {
      console.log(`[Controller] usar_prompt es 0 (o false) para co_cnl=${co_cnl}. Saltando limpieza de IA, solo se aplicará formato.`);
    }

    // 4. Modificar DOCX: cortar sobrantes (si hay aiLimits) y aplicar formato
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
