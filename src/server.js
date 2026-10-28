import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { connect } from './db.js';
import { start as startSender } from './sender.js';
import { createApp } from './app.js';

export { createApp };

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await connect();
  serve({ fetch: createApp().fetch, port: config.port });
  if (process.env.SENDER !== 'off') startSender();
  console.log(`SDC配信: ${config.baseUrl}  （送信方式: ${config.mailer}）`);
}
