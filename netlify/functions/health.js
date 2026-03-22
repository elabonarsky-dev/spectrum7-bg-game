/**
 * Netlify Function: health
 * Reachable at /api/health (via the redirect in netlify.toml)
 *
 * This replaces the Express GET /api/health route from the local backend
 * scaffold. The local backend/src/routes/health.js is kept for local
 * development; this file is what runs on Netlify.
 */
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ok',
      game: 'Spectrum 7',
      milestone: 1,
      timestamp: new Date().toISOString()
    })
  };
};
