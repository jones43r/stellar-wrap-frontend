import { NextRequest } from 'next/server';
import { GET as getData } from '../data/[wallet]/route';
import { GET as getPreferences, PUT as putPreferences } from '../preferences/[wallet]/route';

const VALID_WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5';

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

describe('notification record authentication', () => {
  describe('GET /api/notifications/data/[wallet]', () => {
    it('rejects an unauthenticated request', async () => {
      const req = makeRequest(
        `http://localhost/api/notifications/data/${VALID_WALLET}`,
      );
      const res = await getData(req, { params: { wallet: VALID_WALLET } });
      expect(res.status).toBe(401);
    });

    it('rejects a request with an invalid signature', async () => {
      const req = makeRequest(
        `http://localhost/api/notifications/data/${VALID_WALLET}`,
        {
          headers: {
            'x-stellar-address': VALID_WALLET,
            'x-stellar-signature': 'not-a-valid-signature',
            'x-stellar-message': 'challenge',
          },
        },
      );
      const res = await getData(req, { params: { wallet: VALID_WALLET } });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/notifications/preferences/[wallet]', () => {
    it('rejects an unauthenticated request', async () => {
      const req = makeRequest(
        `http://localhost/api/notifications/preferences/${VALID_WALLET}`,
      );
      const res = await getPreferences(req, { params: { wallet: VALID_WALLET } });
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/notifications/preferences/[wallet]', () => {
    it('rejects an unauthenticated request', async () => {
      const req = makeRequest(
        `http://localhost/api/notifications/preferences/${VALID_WALLET}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'attacker@example.com' }),
        },
      );
      const res = await putPreferences(req, { params: { wallet: VALID_WALLET } });
      expect(res.status).toBe(401);
    });

    it('rejects a request with an invalid signature', async () => {
      const req = makeRequest(
        `http://localhost/api/notifications/preferences/${VALID_WALLET}`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            'x-stellar-address': VALID_WALLET,
            'x-stellar-signature': 'not-a-valid-signature',
            'x-stellar-message': 'challenge',
          },
          body: JSON.stringify({ email: 'attacker@example.com' }),
        },
      );
      const res = await putPreferences(req, { params: { wallet: VALID_WALLET } });
      expect(res.status).toBe(401);
    });
  });
});
