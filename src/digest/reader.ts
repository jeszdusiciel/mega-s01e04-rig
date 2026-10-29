import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

interface Run {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRun(value: unknown): value is Run {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Record<string, unknown>;
  return typeof run.at === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(run.at)
    && isDate(run.at.slice(0, 10))
    && Number.isFinite(Date.parse(run.at))
    && typeof run.job === 'string' && run.job.trim().length > 0
    && (run.status === 'ok' || run.status === 'retry' || run.status === 'fail')
    && (run.owner === null || typeof run.owner === 'string')
    && (run.error === undefined || typeof run.error === 'string');
}

/** Preserve logged timestamps, using their instants only to identify first/last runs. */
export const readNight: ReadNight = (runsDir, night) => {
  if (!isDate(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const jobs = new Map<string, {
    row: DigestRow;
    firstTime: number;
    lastTime: number;
    lastErrorTime: number;
  }>();
  let badLines = 0;
  const lines = contents === '' ? [] : contents.split(/\r?\n/);
  // A final newline terminates the previous record; it is not a blank record.
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    let run: unknown;
    try {
      run = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isRun(run)) {
      badLines++;
      continue;
    }

    const time = Date.parse(run.at);
    let job = jobs.get(run.job);
    if (!job) {
      job = {
        row: {
          job: run.job, owner: run.owner, runs: 0, retries: 0,
          lastStatus: run.status, lastError: null, firstAt: run.at, lastAt: run.at,
        },
        firstTime: time, lastTime: time, lastErrorTime: -Infinity,
      };
      jobs.set(run.job, job);
    }
    job.row.runs++;
    if (run.status === 'retry') job.row.retries++;
    if (time < job.firstTime) {
      job.firstTime = time;
      job.row.firstAt = run.at;
    }
    if (time >= job.lastTime) {
      job.lastTime = time;
      job.row.lastAt = run.at;
      job.row.lastStatus = run.status;
      job.row.owner = run.owner;
    }
    if (run.error !== undefined && time >= job.lastErrorTime) {
      job.lastErrorTime = time;
      job.row.lastError = run.error;
    }
  }

  const rows = [...jobs.values()].map(({ row }) => row);
  rows.sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { night, rows, badLines };
};
