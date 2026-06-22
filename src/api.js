// ============================================================
// AEGIS LOCATOR — API Client
// Comunicação com /api/campaign (Vercel Serverless ou dev local)
// Funcionalidades:
//   - secretKey para autenticação de operador
//   - Fila de retry com localStorage (alvos nunca perdidos por falha de rede)
//   - Flush automático da fila ao recuperar conexão
// ============================================================
const API = '/api/campaign';
const QUEUE_KEY = 'aegis_retry_queue';

// ─── Fila de retry: salva alvos localmente se a API falhar ──────────────────
function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

function setQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (err) { console.warn('Queue save failed', err); }
}

async function flushQueue() {
  const queue = getQueue();
  if (queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const res = await fetch(`${API}?id=${encodeURIComponent(item.campaignId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: item.target }),
      });
      if (!res.ok) remaining.push(item); // mantém na fila se ainda falhar
    } catch {
      remaining.push(item); // sem conexão — mantém para próxima tentativa
    }
  }
  setQueue(remaining);
}

// Escuta evento 'online' para reenviar automaticamente ao recuperar conexão
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushQueue().catch(() => {});
  });
}

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Cria uma nova campanha.
 * Retorna { id, secretKey, expiresAt }
 */
export async function apiCreate(data) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json(); // { id, secretKey, expiresAt }
}

/**
 * Lê dados de uma campanha.
 * - Sem secretKey → retorna apenas dados públicos (título, descrição, imagem)
 * - Com secretKey correta → retorna tudo incluindo lista de alvos
 */
export async function apiGet(id, secretKey = null) {
  const params = new URLSearchParams({ id });
  if (secretKey) params.set('key', secretKey);
  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Adiciona um alvo à campanha.
 * Se a requisição falhar, o alvo é salvo na fila local do localStorage
 * e enviado automaticamente quando a conexão for restaurada.
 */
export async function apiAddTarget(campaignId, target) {
  try {
    const res = await fetch(`${API}?id=${encodeURIComponent(campaignId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    // Salva na fila local — será reenviado ao recuperar conexão
    console.warn('[Aegis] apiAddTarget falhou, salvando na fila local:', e.message);
    const queue = getQueue();
    const alreadyQueued = queue.some(
      q => q.campaignId === campaignId && q.target.deviceId === target.deviceId
    );
    if (!alreadyQueued) {
      queue.push({ campaignId, target, queuedAt: new Date().toISOString() });
      setQueue(queue);
    }
  }
}

/**
 * Comprime imagem base64 para no máximo maxKB kilobytes via Canvas API.
 * Reduzido para 40KB (era 60KB) para folga no limite do JSONBlob.
 */
export function compressImage(base64, maxKB = 40) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 720; // reduzido de 800 para 720
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w >= h) { h = Math.round((h / w) * MAX_DIM); w = MAX_DIM; }
        else { w = Math.round((w / h) * MAX_DIM); h = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      let quality = 0.82;
      let out = canvas.toDataURL('image/jpeg', quality);
      while (out.length > maxKB * 1024 * 1.37 && quality > 0.1) {
        quality -= 0.08;
        out = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(out);
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

// Exporta flushQueue para uso manual (ex: botão "Tentar reenviar")
export { flushQueue };
