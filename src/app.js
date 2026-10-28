// 画面のルーティング。Node のサーバー（server.js）と確認用サイト（demo/main.js）の両方から使う
import { Hono } from 'hono';
import { mount as mountAuth, requireUser } from './auth.js';
import contacts from './routes/contacts.js';
import segments from './routes/segments.js';
import campaigns from './routes/campaigns.js';
import masters from './routes/masters.js';
import outbox from './routes/outbox.js';
import pub from './routes/public.js';

export function createApp() {
  const app = new Hono();
  app.route('/', pub);
  mountAuth(app);
  for (const p of ['/contacts', '/segments', '/campaigns', '/masters', '/outbox']) {
    app.use(p, requireUser);
    app.use(`${p}/*`, requireUser);
  }
  app.get('/', (c) => c.redirect('/contacts'));
  app.route('/contacts', contacts);
  app.route('/segments', segments);
  app.route('/campaigns', campaigns);
  app.route('/masters', masters);
  app.route('/outbox', outbox);
  app.onError((e, c) => {
    console.error(e);
    return c.text(`エラーが起きました：${e.message}`, 500);
  });
  return app;
}
