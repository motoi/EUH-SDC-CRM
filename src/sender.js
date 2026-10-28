// 予約された配信を、流量を守りながら少しずつ送るワーカー。サーバーと同じプロセスで動く。
import { q, one } from './db.js';
import { config } from './config.js';
import { mailer, RetryLater } from './mailer.js';
import { compose } from './mail.js';

const MAX_ATTEMPTS = 3;
let running = false;
let pausedUntil = 0;

export async function tick() {
  if (running || Date.now() < pausedUntil) return { sent: 0 };
  running = true;
  try {
    await q(`update campaigns set status = 'sending' where status = 'scheduled' and scheduled_at <= now()`);

    const [{ n: last24h }] = await q(`select count(*)::int n from deliveries where status = 'sent' and sent_at > now() - interval '24 hours'`);
    const budget = Math.max(0, Math.min(config.sendPerMinute, config.sendPerDay - last24h));
    let sent = 0;

    if (budget > 0) {
      const batch = await q(`select d.id, d.email, d.unsubscribe_token, d.attempts, d.contact_id, cp.id campaign_id, cp.subject, cp.body_text,
          c.full_name, c.department, c.job_title, o.name org_name
        from deliveries d join campaigns cp on cp.id = d.campaign_id
        left join contacts c on c.id = d.contact_id left join organizations o on o.id = c.organization_id
        where d.status = 'queued' and cp.status = 'sending' order by d.id limit ${budget}`);

      for (const d of batch) {
        // 予約後に配信停止した人には送らない
        if (await one(`select 1 from suppressions where email = $1`, [d.email])) {
          await q(`update deliveries set status = 'skipped', last_error = '配信停止済み' where id = $1`, [d.id]);
          continue;
        }
        const msg = compose(d, d, d.unsubscribe_token);
        try {
          const r = await mailer.send({ to: d.email, ...msg, deliveryId: d.id });
          await q(`update deliveries set status = 'sent', sent_at = now(), attempts = attempts + 1, graph_message_id = $2 where id = $1`, [d.id, r.id]);
          sent++;
        } catch (e) {
          if (e instanceof RetryLater) {
            pausedUntil = Date.now() + e.waitMs;
            await q(`update deliveries set last_error = $2 where id = $1`, [d.id, e.message]);
            break;
          }
          const failed = d.attempts + 1 >= MAX_ATTEMPTS;
          await q(`update deliveries set attempts = attempts + 1, last_error = $2, status = $3 where id = $1`,
            [d.id, e.message, failed ? 'failed' : 'queued']);
        }
      }
    }

    await q(`update campaigns cp set status = 'sent', completed_at = now()
      where cp.status = 'sending' and not exists (select 1 from deliveries d where d.campaign_id = cp.id and d.status = 'queued')`);
    return { sent };
  } finally {
    running = false;
  }
}

export function start() {
  const every = config.sendTickSeconds * 1000;
  const loop = () => tick().catch((e) => console.error('[sender]', e)).finally(() => setTimeout(loop, every));
  setTimeout(loop, 2000);
}
