const express = require('express');
const cors = require('cors');
const healthRoute = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api', healthRoute);

app.listen(PORT, () => {
  console.log(`Spectrum 7 backend running on port ${PORT}`);
});

module.exports = app;
