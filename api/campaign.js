// ============================================================
// AEGIS LOCATOR — Serverless API (Vercel)
// Compatibilidade: Node.js 18+, ES Modules ("type":"module")
// Arquitetura DUAL-BLOB: campanha + targets separados no JSONBlob
// ============================================================

// Usa o módulo nativo do Node.js — compatível com todas versões do Vercel
import { randomBytes } from 'crypto';

const JSONBLOB_API = 'https://jsonblob.com/api/jsonBlob';

async function blobCreate(data) {
  const res = await fetch(JSONBLOB_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`JSONBlob create failed: ${res.status}`);
  const location = res.headers.get('Location') || '';
  const blobId = location.split('/').pop();
  if (!blobId) throw new Error('JSONBlob nao retornou ID de localizacao');
  return blobId;
}

async function blobGet(blobId) {
  const res = await fetch(`${JSONBLOB_API}/${blobId}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`JSONBlob get failed: ${res.status}`);
  return res.json();
}

async function blobPut(blobId, data) {
  const res = await fetch(`${JSONBLOB_API}/${blobId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`JSONBlob put failed: ${res.status}`);
}

// Usa randomBytes do Node.js — sem dependência de Web Crypto API
function generateSecretKey() {
  return randomBytes(16).toString('hex');
}

// Retry com backoff exponencial — elimina race conditions
async function addTargetWithRetry(targetsId, target, maxRetries = 4) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const fresh = await blobGet(targetsId);
      const targets = Array.isArray(fresh.targets) ? fresh.targets : [];

      const isDuplicate = targets.some(t =>
        (target.deviceId && t.deviceId && t.deviceId === target.deviceId) ||
        (t.ip === target.ip && t.method === target.method)
      );

      if (!isDuplicate) {
        targets.unshift(target);
        await blobPut(targetsId, { targets });
      }
      return;
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt)));
      } else {
        throw err;
      }
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, key } = req.query;

  try {
    // ─── GET ─────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (!id) return res.status(400).json({ error: 'id obrigatorio' });

      const campaign = await blobGet(id);

      if (campaign.expiresAt && new Date() > new Date(campaign.expiresAt)) {
        return res.status(410).json({ error: 'Campanha expirada' });
      }

      if (key && key === campaign.secretKey) {
        let targets = [];
        if (campaign.targetsId) {
          try {
            const targetsData = await blobGet(campaign.targetsId);
            targets = targetsData.targets || [];
          } catch { /* targets blob indisponivel temporariamente */ }
        }
        const { secretKey: _sk, targetsId: _tid, ...rest } = campaign;
        return res.status(200).json({ ...rest, targets });
      }

      const { secretKey: _sk, targetsId: _tid, ...publicData } = campaign;
      return res.status(200).json(publicData);
    }

    // ─── POST ────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      let body = {};
      if (typeof req.body === 'string') {
        try { body = JSON.parse(req.body); } catch { body = {}; }
      } else if (req.body && typeof req.body === 'object') {
        body = req.body;
      }

      if (!id) {
        const secretKey = generateSecretKey();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const targetsId = await blobCreate({ targets: [] });

        const campaignData = {
          title: body.title || 'Sem titulo',
          description: body.description || '',
          image: body.image || null,
          secretKey,
          targetsId,
          createdAt: new Date().toISOString(),
          expiresAt,
        };
        const campaignId = await blobCreate(campaignData);

        return res.status(201).json({ id: campaignId, secretKey, expiresAt });
      }

      const { target } = body;
      if (!target) return res.status(400).json({ error: 'target obrigatorio no body' });

      const campaign = await blobGet(id);

      if (!campaign.targetsId) {
        return res.status(500).json({ error: 'Campanha invalida: sem blob de alvos' });
      }

      await addTargetWithRetry(campaign.targetsId, target);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[Aegis API Error]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
