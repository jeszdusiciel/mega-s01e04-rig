import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const config = (runsDir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

describe('digest routes', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('returns matching, sorted digest rows in JSON and the rendered page', async () => {
    const records = [
      { at: `${night}T05:00:00+01:00`, job: 'zeta', status: 'ok', owner: null },
      { at: `${night}T03:55:00+01:00`, job: 'Alpha', status: 'ok', owner: 'Lin' },
      { at: `${night}T04:00:00+01:00`, job: 'alpha', status: 'retry', owner: 'Ada', error: 'first error' },
      { at: `${night}T04:01:00+01:00`, job: 'alpha', status: 'retry', owner: 'Ada' },
      { at: `${night}T04:02:00+01:00`, job: 'alpha', status: 'retry', owner: 'Ada' },
      { at: `${night}T04:03:00+01:00`, job: 'alpha', status: 'fail', owner: 'Ada <Admin>', error: '<script>alert(1)</script>' },
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), `${records.map((record) => JSON.stringify(record)).join('\n')}\nnot json\n`);

    const app = createApp(config(runsDir));
    const [jsonResponse, pageResponse] = await Promise.all([
      app.request(`/api/digest/${night}`),
      app.request(`/digest/${night}`),
    ]);
    const rows = await jsonResponse.json();
    const html = await pageResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(pageResponse.status).toBe(200);
    expect(rows).toEqual([
      {
        job: 'Alpha', owner: 'Lin', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: `${night}T03:55:00+01:00`, lastAt: `${night}T03:55:00+01:00`,
      },
      {
        job: 'alpha', owner: 'Ada <Admin>', runs: 4, retries: 3, lastStatus: 'fail',
        lastError: '<script>alert(1)</script>',
        firstAt: `${night}T04:00:00+01:00`, lastAt: `${night}T04:03:00+01:00`,
      },
      {
        job: 'zeta', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: `${night}T05:00:00+01:00`, lastAt: `${night}T05:00:00+01:00`,
      },
    ]);
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('alpha'));
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('malformed lines: 1');
    expect(html).toContain('—');
    expect(html).toContain('Ada &lt;Admin&gt;');
    expect(html).toContain(`${night}T04:00:00+01:00`);
    expect(html).toContain(`${night}T04:03:00+01:00`);
    expect(html).toContain('4');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('<strong class="warn">3</strong>');
    expect(html).toContain('<strong class="warn">fail</strong>');
  });

  it('returns 404 from both routes when a night file is missing', async () => {
    const app = createApp(config(runsDir));

    const [jsonResponse, pageResponse] = await Promise.all([
      app.request(`/api/digest/${night}`),
      app.request(`/digest/${night}`),
    ]);

    expect(jsonResponse.status).toBe(404);
    expect(pageResponse.status).toBe(404);
  });

  it('renders an empty night and returns an empty JSON array', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    const app = createApp(config(runsDir));

    const [jsonResponse, pageResponse] = await Promise.all([
      app.request(`/api/digest/${night}`),
      app.request(`/digest/${night}`),
    ]);

    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual([]);
    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('nothing ran');
  });
});
