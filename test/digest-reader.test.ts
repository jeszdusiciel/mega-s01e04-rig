import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('night reader', () => {
  let runsDir: string;
  const night = '2026-10-28';
  const run = { at: '2026-10-28T23:00:00+01:00', job: 'alpha', owner: 'rook', status: 'ok' };
  beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
  afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });
  const write = (dir: string, records: unknown[]) => {
    writeFileSync(join(dir, `${night}.jsonl`), records.map(record => JSON.stringify(record)).join('\n'));
  };

  it('reads the real night without modifying its fixtures', () => {
    const digest = readNight('runs', night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toMatchObject({ owner: null, runs: 1 });
    expect(digest?.rows[1]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(digest?.rows[2]).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(digest?.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes missing nights from empty nights', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 0 });
  });

  it('counts malformed JSON, invalid records, and blank records while keeping valid rows', () => {
    const invalid = [null, [], 42, {}, { ...run, status: 'unknown' }, { ...run, owner: 3 },
      { ...run, job: '' }, { ...run, at: 'yesterday' }, { ...run, error: false },
      { ...run, at: '2026-10-28T23:00:00' }, { ...run, at: '2026-02-30T23:00:00Z' }];
    writeFileSync(join(runsDir, `${night}.jsonl`), [JSON.stringify(run), ...invalid.map(item => JSON.stringify(item)), '{', '', JSON.stringify({ ...run, job: 'beta', owner: null }), ''].join('\r\n'));
    expect(readNight(runsDir, night)).toMatchObject({ badLines: invalid.length + 2, rows: [{ job: 'alpha' }, { job: 'beta', owner: null }] });
  });

  it('uses chronological endpoints across offsets and preserves the latest error after recovery', () => {
    write(runsDir, [
      { ...run, at: '2026-10-29T03:00:00+02:00', owner: null },
      { ...run, at: '2026-10-29T00:30:00Z', status: 'retry', error: 'latest error' },
      { ...run, at: '2026-10-29T01:00:00+02:00', status: 'fail', error: 'older error' },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'alpha', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'latest error',
      firstAt: '2026-10-29T01:00:00+02:00', lastAt: '2026-10-29T03:00:00+02:00',
    }]);
  });

  it('uses the later record to break timestamp ties', () => {
    write(runsDir, [{ ...run, status: 'retry', error: 'first' }, { ...run, status: 'fail', owner: null, error: 'second' }]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({ owner: null, lastStatus: 'fail', lastError: 'second', runs: 2, retries: 1 });
  });

  it('rejects traversal and invalid calendar dates', () => {
    for (const name of ['../2026-10-28', '2026-02-30', '2026-13-01', '2026-10-28/extra', '']) {
      expect(readNight(runsDir, name)).toBeNull();
    }
  });

  it('does not hide filesystem errors other than missing files', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
  });
});
