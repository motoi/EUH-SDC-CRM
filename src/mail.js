// メール本文の組み立て（差し込みと、必ず付けるフッター）
import { config } from './config.js';

export const MERGE_FIELDS = {
  '{{氏名}}': (c) => [c.last_name, c.first_name].filter(Boolean).join(' '),
  '{{姓}}': (c) => c.last_name ?? '',
  '{{所属}}': (c) => c.org_name ?? '',
  '{{役職}}': (c) => c.job_title ?? '',
};

export function merge(text, contact) {
  let out = text;
  for (const [k, f] of Object.entries(MERGE_FIELDS)) out = out.split(k).join(f(contact));
  return out;
}

// 特定電子メール法の表示（送信者・住所・問い合わせ先・配信停止の方法）。本文から消せないよう常に末尾に付ける
export function footer(unsubscribeUrl) {
  const line = '************************************************';
  return [
    '',
    line,
    ...config.footer.signature,
    line,
    '',
    '今後このようなご案内が不要な場合は、下記から配信を停止できます。',
    unsubscribeUrl,
  ].join('\n');
}

export function compose(campaign, contact, token) {
  const url = `${config.baseUrl}/u/${token}`;
  return {
    subject: merge(campaign.subject, contact),
    text: `${merge(campaign.body_text, contact)}\n${footer(url)}`,
  };
}
