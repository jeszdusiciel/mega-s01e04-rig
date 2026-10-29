export type RunStatus = 'ok' | 'retry' | 'fail';

export interface DigestRow {
  job: string;
  owner: string | null;
  /** Total valid log records for this job, including retries and failures. */
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Most recent reported error, retained when a later run succeeds. */
  lastError: string | null;
  firstAt: string;
  lastAt: string;
}

export interface NightDigest {
  night: string;
  rows: DigestRow[];
  badLines: number;
}

/** Synchronous reader; missing files or invalid night names return null. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
