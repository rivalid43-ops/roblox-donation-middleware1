/**
 * Vercel Function entry point.
 * GET  /                 -> informasi API
 * GET  /api/health       -> health check
 * POST /api/webhook/saweria -> menerima webhook donasi
 */

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify(body));
}

function getBody(req) {
  // Vercel biasanya sudah mem-parse JSON body. Fallback ini menangani
  // body string/buffer pada runtime Node.
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body || '{}');
  }

  return {};
}

function getHeader(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isAuthorized(req) {
  const expected = process.env.WEBHOOK_TOKEN;
  if (!expected) return true;

  const authorization = getHeader(req, 'authorization') || '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  const supplied = getHeader(req, 'x-webhook-token') || bearer;
  return supplied === expected;
}

function firstValue(object, keys, fallback = undefined) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null) {
      return object[key];
    }
  }
  return fallback;
}

function normalizeDonation(input) {
  // Mendukung nama field umum. Format resmi payload Saweria harus
  // disesuaikan dengan dokumentasi/dashboard Saweria yang kamu gunakan.
  const amountRaw = firstValue(input, [
    'amount', 'donation_amount', 'total', 'nominal'
  ], 0);

  const amount = Number(amountRaw);
  const donorName = String(firstValue(input, [
    'donator_name', 'donor_name', 'name', 'supporter_name'
  ], 'Anonymous'));
  const message = String(firstValue(input, [
    'message', 'note', 'comment'
  ], ''));
  const currency = String(firstValue(input, [
    'currency', 'unit'
  ], 'IDR'));
  const eventId = firstValue(input, [
    'id', 'donation_id', 'transaction_id', 'reference_id'
  ], null);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, errors: ['amount/nominal harus berupa angka positif'] };
  }

  if (donorName.length > 200 || message.length > 2000) {
    return { valid: false, errors: ['Panjang nama atau pesan terlalu besar'] };
  }

  return {
    valid: true,
    donation: {
      eventId: eventId ? String(eventId) : null,
      donorName,
      amount,
      currency,
      message,
      receivedAt: new Date().toISOString()
    }
  };
}

async function forwardToRoblox(donation) {
  const enabled = String(process.env.ENABLE_ROBLOX_FORWARDING).toLowerCase() === 'true';
  if (!enabled) return { forwarded: false, reason: 'disabled' };

  const universeId = process.env.ROBLOX_UNIVERSE_ID;
  const apiKey = process.env.ROBLOX_API_KEY;
  const topic = process.env.ROBLOX_TOPIC || 'donations';

  if (!universeId || !apiKey) {
    throw new Error('ROBLOX_UNIVERSE_ID dan ROBLOX_API_KEY wajib diisi jika forwarding aktif');
  }

  const minimum = Number(process.env.MIN_DONATION_AMOUNT || 0);
  if (donation.amount < minimum) {
    return { forwarded: false, reason: 'below_minimum' };
  }

  const url = `https://apis.roblox.com/messaging-service/v1/universes/${encodeURIComponent(universeId)}/topics/${encodeURIComponent(topic)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      message: JSON.stringify({
        type: 'donation',
        eventId: donation.eventId,
        donorName: donation.donorName,
        amount: donation.amount,
        currency: donation.currency,
        message: donation.message,
        receivedAt: donation.receivedAt
      })
    })
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Roblox Open Cloud gagal (${response.status}): ${responseText.slice(0, 300)}`);
  }

  return { forwarded: true };
}

export default async function handler(req, res) {
  const path = req.url?.split('?')[0] || '/';

  if (req.method === 'GET' && (path === '/' || path === '/api/health')) {
    return json(res, 200, {
      status: 'ok',
      service: 'roblox-donation-middleware',
      timestamp: new Date().toISOString()
    });
  }

  if (path !== '/api/webhook/saweria') {
    return json(res, 404, { status: 'error', message: 'Endpoint tidak ditemukan' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { status: 'error', message: 'Gunakan method POST' });
  }

  if (!isAuthorized(req)) {
    return json(res, 401, { status: 'error', message: 'Webhook token tidak valid' });
  }

  try {
    const body = getBody(req);
    const result = normalizeDonation(body);

    if (!result.valid) {
      return json(res, 400, {
        status: 'error',
        message: 'Payload donasi tidak valid',
        errors: result.errors
      });
    }

    const forwarding = await forwardToRoblox(result.donation);

    console.log('Donation received', {
      eventId: result.donation.eventId,
      amount: result.donation.amount,
      currency: result.donation.currency,
      forwarded: forwarding.forwarded
    });

    return json(res, 200, {
      status: 'success',
      message: 'Webhook diterima',
      donation: result.donation,
      forwarding
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return json(res, 500, {
      status: 'error',
      message: 'Gagal memproses webhook'
    });
  }
}
