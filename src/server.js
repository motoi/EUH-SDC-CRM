import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { connect, q } from './db.js';
import { reclassifyAll } from './job-level.js';
import { createApp } from './app.js';
import { start as startSender } from './sender.js';

export { createApp };

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await connect();
  await reclassifyAll(q);   // 役職区分の表を変えていたら、登録済みの人にも反映する
  serve({ fetch: createApp().fetch, port: config.port });
  if (config.sendMode !== 'export') startSender();   // 直接送る形のときだけ、予約した配信を少しずつ送る
  console.log(`SDC配信: ${config.baseUrl}  （送り方: ${config.sendMode}）`);
}
