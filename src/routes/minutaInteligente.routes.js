const express = require('express');
const router = express.Router();
const multer = require('multer');

// Usar almacenamiento en memoria (RAM) efímero
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

const minutaInteligenteController = require('../controllers/minutaInteligente.controller');

router.post('/', upload.single('file'), minutaInteligenteController.procesarMinutaInteligente);

module.exports = router;
