const express = require('express');
const router = express.Router();
const { puestaMarcha } = require('../controllers/procesoPuestaMarchaControllers');

router.get('/puesta-marcha', puestaMarcha);

module.exports = router;
