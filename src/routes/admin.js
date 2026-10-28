// 管理者だけが使う画面：利用者の管理、配信停止の解除、操作の記録
import { Hono } from 'hono';
import { html } from 'hono/html';
import { q, one } from '../db.js';
import { page, setFlash, takeFlash, fmtDate } from '../layout.js';
import { audit } from '../auth.js';

const app = new Hono();

const ACTIONS = {
  'contact.create': '連絡先を追加', 'contact.update': '連絡先を編集', 'contact.suppress': '配信を停止',
  'segment.create': '配信先リストを作成', 'segment.update': '配信先リストを編集',
  'campaign.create': '配信を作成', 'campaign.update': '配信を編集', 'campaign.test': 'テスト送信',
  'campaign.confirm': '配信を予約', 'campaign.cancel': '配信を取り消し',
  'staff.create': '利用者を追加', 'staff.update': '利用者を変更', 'suppression.lift': '配信停止を解除', 'import.apply': 'Excel から取り込み',
};
const REASON = { unsubscribe: '本人が配信停止', hard_bounce: '宛先不明で届かない', complaint: '迷惑メール報告', manual: '担当者が停止' };

app.get('/', async (c) => {
  const [users, sups, logs] = await Promise.all([
    q(`select * from staff_users order by id`),
    q(`select s.*, c.id contact_id, c.full_name from suppressions s
       left join contacts c on c.email = s.email and c.merged_into_id is null order by s.created_at desc limit 100`),
    q(`select a.*, u.name from audit_log a left join staff_users u on u.id = a.actor_id order by a.at desc limit 100`),
  ]);
  const me = c.get('user');
  return page(c, {
    title: '管理', active: '/admin', flash: takeFlash(c),
    body: html`
<h1>管理</h1>
<p class="lead">管理者だけが使える画面です。</p>

<div class="card"><h2>利用者</h2>
  <p class="small muted" style="margin:0">このシステムにログインできる人です。本番では大学の M365 アカウントでログインします。</p>
  <div class="scroll"><table><thead><tr><th>名前</th><th>メール</th><th>権限</th><th>最終ログイン</th><th></th></tr></thead><tbody>
  ${users.map((u) => html`<tr><td>${u.name}${u.active ? '' : html` <span class="pill">停止中</span>`}</td><td class="small">${u.email}</td>
    <td>${u.role === 'admin' ? '管理者' : '担当者'}</td><td class="small">${fmtDate(u.last_login_at)}</td>
    <td>${u.id === me.id ? html`<span class="small muted">自分</span>` : html`
      <form method="post" action="/admin/users/${u.id}" class="row" style="gap:6px">
        <input type="hidden" name="role" value="${u.role === 'admin' ? 'operator' : 'admin'}">
        <button class="sub" name="op" value="role">${u.role === 'admin' ? '担当者にする' : '管理者にする'}</button>
      </form>
      <form method="post" action="/admin/users/${u.id}/active" class="inline"><button class="link">${u.active ? 'ログインを止める' : 'ログインを再開'}</button></form>`}</td></tr>`)}
  </tbody></table></div>
  <form method="post" action="/admin/users" class="grid2">
    <label>名前<input type="text" id="u_name" name="name" required></label>
    <label>メール（M365のアドレス）<input type="email" id="u_email" name="email" required></label>
    <label>権限<select id="u_role" name="role"><option value="operator">担当者</option><option value="admin">管理者</option></select></label>
    <div style="align-self:end"><button class="sub">利用者を追加</button></div>
  </form>
</div>

<div class="card"><h2>配信停止中のアドレス</h2>
  <p class="small muted" style="margin:0">本人から「また案内がほしい」と連絡があったときだけ解除します。宛先不明のアドレスは、正しいアドレスに直してから解除してください。</p>
  ${sups.length ? html`<div class="scroll"><table><thead><tr><th>アドレス</th><th>理由</th><th>日時</th><th></th></tr></thead><tbody>
  ${sups.map((s) => html`<tr><td class="small">${s.email}${s.contact_id ? html`<div><a href="/contacts/${s.contact_id}">${s.full_name}</a></div>` : ''}</td>
    <td class="small">${REASON[s.reason]}</td><td class="small">${fmtDate(s.created_at)}</td>
    <td><form method="post" action="/admin/suppressions/lift"><input type="hidden" name="email" value="${s.email}"><button class="link">解除する</button></form></td></tr>`)}
  </tbody></table></div>` : html`<p class="muted">ありません。</p>`}
</div>

<div class="card"><h2>操作の記録（最新100件）</h2>
  <p class="small muted" style="margin:0">誰がいつ何をしたかの記録です。誤送信などが起きたときの確認に使います。</p>
  ${logs.length ? html`<div class="scroll"><table><thead><tr><th>日時</th><th>誰が</th><th>操作</th><th>対象</th></tr></thead><tbody>
  ${logs.map((a) => html`<tr><td class="small">${fmtDate(a.at)}</td><td>${a.name ?? ''}</td><td>${ACTIONS[a.action] ?? a.action}</td>
    <td class="small">${a.target_type === 'campaign' ? html`<a href="/campaigns/${a.target_id}">配信 #${a.target_id}</a>`
      : a.target_type === 'contact' ? html`<a href="/contacts/${a.target_id}">連絡先 #${a.target_id}</a>`
      : a.target_type ? `${a.target_type} #${a.target_id ?? ''}` : ''}</td></tr>`)}
  </tbody></table></div>` : html`<p class="muted">まだ記録はありません。</p>`}
</div>`,
  });
});

app.post('/users', async (c) => {
  const b = await c.req.parseBody();
  const name = String(b.name ?? '').trim(), email = String(b.email ?? '').trim();
  if (!name || !email) { setFlash(c, '名前とメールは必須です。', 'bad'); return c.redirect('/admin'); }
  // M365 でログインするまでは仮のIDを入れておき、初回ログイン時にメールで照合して置き換える
  const r = await one(`insert into staff_users (entra_object_id, name, email, role) values ($1, $2, $3, $4) returning id`,
    [`pending:${email.toLowerCase()}`, name, email, b.role === 'admin' ? 'admin' : 'operator']);
  await audit(c, 'staff.create', 'staff', r.id);
  setFlash(c, `${name}さんを追加しました。`);
  return c.redirect('/admin');
});

app.post('/users/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.parseBody();
  if (id === c.get('user').id) return c.redirect('/admin');
  await q(`update staff_users set role = $2 where id = $1`, [id, b.role === 'admin' ? 'admin' : 'operator']);
  await audit(c, 'staff.update', 'staff', id, { role: b.role });
  setFlash(c, '権限を変更しました。');
  return c.redirect('/admin');
});

app.post('/users/:id{[0-9]+}/active', async (c) => {
  const id = Number(c.req.param('id'));
  if (id === c.get('user').id) return c.redirect('/admin');   // 自分自身を締め出さない
  await q(`update staff_users set active = not active where id = $1`, [id]);
  await audit(c, 'staff.update', 'staff', id, { toggled: 'active' });
  setFlash(c, '変更しました。');
  return c.redirect('/admin');
});

app.post('/suppressions/lift', async (c) => {
  const { email } = await c.req.parseBody();
  await q(`delete from suppressions where email = $1`, [email]);
  await audit(c, 'suppression.lift', 'suppression', null, { email });
  setFlash(c, `${email} の配信停止を解除しました。`);
  return c.redirect('/admin');
});

export default app;
