import type { Hono } from 'hono';
import { readNight } from './reader.js';

export function registerDigestJson(app: Hono, runsDir: string): void {
  app.get('/api/digest/:night', (c) => {
    const digest = readNight(runsDir, c.req.param('night'));
    if (!digest) return c.notFound();

    return c.json(digest.rows);
  });
}
