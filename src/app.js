// 画面のルーティング。Node のサーバー（server.js）と確認用サイト（demo/main.js）の両方から使う
import { Hono } from 'hono';
import { mount as mountAuth, requireUser, requireAdmin } from './auth.js';
import contacts from './routes/contacts.js';
import segments from './routes/segments.js';
import { config } from './config.js';
import campaignsExport from './routes/campaigns.js';
import campaignsDirect from './routes/campaigns-direct.js';
import outbox from './routes/outbox.js';
import masters from './routes/masters.js';
import admin from './routes/admin.js';
import importer from './routes/import.js';

export function createApp() {
  const app = new Hono();
  mountAuth(app);
  for (const p of ['/contacts', '/segments', '/campaigns', '/masters', '/outbox', '/admin']) {
    app.use(p, requireUser);
    app.use(`${p}/*`, requireUser);
  }
  app.use('/admin', requireAdmin);
  app.use('/admin/*', requireAdmin);
  app.get('/', (c) => c.redirect('/contacts'));
  app.route('/contacts/import', importer);
  app.route('/contacts', contacts);
  app.route('/segments', segments);
  // 送り方で配信の画面を切り替える（書き出して Power Automate で送る／CRM が直接送る）
  app.route('/campaigns', config.sendMode === 'export' ? campaignsExport : campaignsDirect);
  if (config.sendMode === 'outbox') app.route('/outbox', outbox);
  app.route('/masters', masters);
  app.route('/admin', admin);
  app.onError((e, c) => {
    console.error(e);
    return c.text(`エラーが起きました：${e.message}`, 500);
  });
  return app;
}
