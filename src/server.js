import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { connect, q } from './db.js';
import { reclassifyAll } from './job-level.js';
import { createApp } from './app.js';

export { createApp };

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await connect();
  await reclassifyAll(q);   // 役職区分の表を変えていたら、登録済みの人にも反映する
  serve({ fetch: createApp().fetch, port: config.port });
  console.log(`SDC配信: ${config.baseUrl}`);
}
