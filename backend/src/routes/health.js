const express = require('express');
const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    game: 'Spectrum 7',
    milestone: 1,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
