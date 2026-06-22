// dev-server.mjs — Servidor de API local (espelha EXATAMENTE o Vercel Serverless)
// Arquitetura dual-blob: db.campaigns[id] + db.targets[targetsId]
// Retry com backoff, expiração, secretKey — idêntico à produção
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, '.aegis-db.json');
const PORT = 3000;

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { campaigns: {}, targets: {} };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateSecretKey() {
  return randomBytes(16).toString('hex');
}

// Retry com backoff exponencial — simula comportamento do Vercel
async function addTargetWithRetry(targetsId, target, maxRetries = 4) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const db = readDB(); // re-lê o arquivo para capturar estado mais recente
      if (!db.targets[targetsId]) db.targets[targetsId] = { targets: [] };

      const targets = Array.isArray(db.targets[targetsId].targets)
        ? db.targets[targetsId].targets
        : [];

      const isDuplicate = targets.some(t =>
        (target.deviceId && t.deviceId && t.deviceId === target.deviceId) ||
        (t.ip === target.ip && t.method === target.method)
      );

      if (!isDuplicate) {
        targets.unshift(target);
        db.targets[targetsId] = { targets };
        writeDB(db);
      }
      return; // sucesso
    } catch {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt)));
      }
    }
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (!url.pathname.startsWith('/api/campaign')) {
    res.writeHead(404); return res.end('Not Found');
  }

  const id  = url.searchParams.get('id');
  const key = url.searchParams.get('key');

  // ─── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const db = readDB();
    if (!id || !db.campaigns[id]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Não encontrado' }));
    }

    const campaign = db.campaigns[id];

    // Valida expiração
    if (campaign.expiresAt && new Date() > new Date(campaign.expiresAt)) {
      res.writeHead(410, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Campanha expirada' }));
    }

    // Acesso de operador com chave
    if (key && key === campaign.secretKey) {
      let targets = [];
      const targetsData = campaign.targetsId ? db.targets[campaign.targetsId] : null;
      if (targetsData) targets = targetsData.targets || [];
      const { secretKey: _sk, targetsId: _tid, ...rest } = campaign;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...rest, targets }));
    }

    // Acesso público — sem secretKey, sem targetsId, sem alvos
    const { secretKey: _sk, targetsId: _tid, ...publicData } = campaign;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(publicData));
  }

  // ─── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const db = readDB();

        if (!id) {
          // Criar nova campanha
          const campaignId  = generateId();
          const targetsId   = generateId();
          const secretKey   = generateSecretKey();
          const expiresAt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

          // Blob de alvos separado (sem imagem)
          db.targets[targetsId] = { targets: [] };

          // Blob de campanha com referência ao blob de alvos
          db.campaigns[campaignId] = {
            title:       data.title || 'Sem título',
            description: data.description || '',
            image:       data.image || null,
            secretKey,
            targetsId,
            createdAt: new Date().toISOString(),
            expiresAt,
          };

          writeDB(db);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ id: campaignId, secretKey, expiresAt }));
        }

        // Adicionar alvo
        const { target } = data;
        if (!target) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'target obrigatório' }));
        }
        if (!db.campaigns[id]) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Campanha não encontrada' }));
        }

        const { targetsId } = db.campaigns[id];
        await addTargetWithRetry(targetsId, target);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(405); res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`\x1b[32m✓\x1b[0m Aegis API Server (local) em \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[33m⚡\x1b[0m DB local: \x1b[33m${DB_FILE}\x1b[0m`);
  console.log(`\x1b[32m🔒\x1b[0m Dual-blob + retry backoff + secretKey + expiração (7 dias)`);
});
