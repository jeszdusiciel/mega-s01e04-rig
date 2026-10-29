import type { Hono } from 'hono';
import { lane } from '../lane.js';
import type { RigConfig } from '../config.js';
import { Layout } from '../views/layout.js';
import { readNight } from './reader.js';
import type { ReadNight } from './types.js';

/** Register the server-rendered night digest page. */
export function registerDigestPage(
  app: Hono,
  config: RigConfig,
  read: ReadNight = readNight,
) {
  app.get('/digest/:night', (c) => {
    const digest = read(config.runsDir, c.req.param('night'));
    if (digest === null) return c.notFound();

    const rows = digest.rows;
    return c.html(
      <Layout title={`digest · ${digest.night}`} lane={lane()}>
        <h1>digest · {digest.night}</h1>
        <p class="mute">malformed lines: {digest.badLines}</p>
        {rows.length === 0 ? (
          <p class="mute">nothing ran</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>job</th>
                <th>owner</th>
                <th>runs</th>
                <th>retries</th>
                <th>last status</th>
                <th>last error</th>
                <th>first time</th>
                <th>last time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const marked = row.retries >= 3 || row.lastStatus === 'fail';
                return (
                  <tr>
                    <td>{row.job}</td>
                    <td>{row.owner ?? '—'}</td>
                    <td>{row.runs}</td>
                    <td>{marked && row.retries >= 3 ? <strong class="warn">{row.retries}</strong> : row.retries}</td>
                    <td>{row.lastStatus === 'fail' ? <strong class="warn">{row.lastStatus}</strong> : row.lastStatus}</td>
                    <td>{row.lastError ?? '—'}</td>
                    <td>{row.firstAt}</td>
                    <td>{row.lastAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Layout>,
    );
  });
}
