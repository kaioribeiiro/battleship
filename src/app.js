const path = require('path');
const fs = require('fs');
const express = require('express');

const routes = require('./routes');
const { securityHeaders, createRateLimiter } = require('./middlewares/security');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const SWAGGER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Battleship API — OpenAPI 3.0 Docs</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #1e1e1e; color: #e4e4e4; font-family: ui-monospace, monospace; }
      .topbar-custom { display: flex; align-items: center; justify-content: space-between; padding: 10px 24px; background: #181818; border-bottom: 1px solid #3c3c3c; }
      .topbar-custom a { color: #3794ff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
      #swagger-ui { max-width: 1180px; margin: 0 auto; background: #ffffff; border-radius: 4px; margin-top: 16px; padding-bottom: 32px; }
    </style>
  </head>
  <body>
    <header class="topbar-custom">
      <span><strong>BATTLESHIP</strong> // OPENAPI 3.0 SPECIFICATION</span>
      <a href="/">← Back to Battleship</a>
    </header>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: '/api/openapi.yaml',
          dom_id: '#swagger-ui',
          deepLinking: true,
          persistAuthorization: true,
        });
      };
    </script>
  </body>
</html>`;

function createApp() {
  const app = express();

  app.use(securityHeaders);
  app.use(express.json());

  app.use('/api/auth', createRateLimiter({ windowMs: 60_000, max: 30 }));

  const openApiPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
  app.get('/api/openapi.yaml', (req, res, next) => {
    if (!fs.existsSync(openApiPath)) return next();
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    return res.sendFile(openApiPath);
  });

  app.get('/api/docs', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(SWAGGER_HTML);
  });

  app.use('/api', routes);

  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(
      express.static(frontendDist, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.mpeg') || filePath.endsWith('.mp3')) {
            res.setHeader('Content-Type', 'audio/mpeg');
          }
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(frontendDist, 'index.html'));
      }
      return next();
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

const app = createApp();

module.exports = { app, createApp };
