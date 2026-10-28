import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyJobTitle } from '../src/job-level.js';

test('役職（自由記述）から役職区分を付ける', () => {
  const cases = {
    '代表取締役': '経営層', '取締役部長': '経営層', '執行役員': '経営層', '代表': '経営層',
    '部長': '部長級', '支店長': '部長級', '次長': '部長級', '部長代理': '部長級',
    '課長': '課長級', 'マネージャー': '課長級', 'シニアマネージャー': '課長級', '主幹': '課長級',
    'アシスタントマネージャー': '一般・担当', '主任': '一般・担当', '主査': '一般・担当', '社員': '一般・担当', '記者': '一般・担当',
    '特命助教': '教員・研究者', '特任学術研究員': '教員・研究者', '教授': '教員・研究者',
    '学生': '学生', '科目履修生': '学生',
    'なし': '未記入', '': '未記入', '顧問': 'その他',
  };
  for (const [title, level] of Object.entries(cases)) assert.equal(classifyJobTitle(title), level, title);
});
