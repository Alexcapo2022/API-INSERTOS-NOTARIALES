const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const { consolidar } = require('../controllers/consolidar.controller');

const uploadMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.docx') {
      return cb(new Error('Solo .docx'));
    }
    cb(null, true);
  }
});

const router = Router();

// POST /api/v1/consolidar
// Espera multipart:
//  - file: DOCX base
//  - minuta: DOCX minuta adjunta
//  - insertIds: Array o string ("[1]" o "1,2")
router.post('/', uploadMem.fields([{ name: 'file', maxCount: 1 }, { name: 'minuta', maxCount: 1 }]), consolidar);

module.exports = router;
