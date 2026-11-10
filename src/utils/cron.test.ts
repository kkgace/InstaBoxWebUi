/** crontab 解析/序列化往返测试 */
import { describe, it, expect } from 'vitest';
import { parseCrontab, rowsToCrontab } from '@/utils/cron';

describe('parseCrontab', () => {
  it('parses a standard 5-field entry', () => {
    const rows = parseCrontab('*/5 * * * * echo hi\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBe('*/5 * * * *');
    expect(rows[0].command).toBe('echo hi');
    expect(rows[0].valid).toBe(true);
    expect(rows[0].disabled).toBe(false);
  });

  it('parses special expressions', () => {
    const rows = parseCrontab('@reboot /usr/bin/start-agent\n');
    expect(rows[0].special).toBe('@reboot');
    expect(rows[0].command).toBe('/usr/bin/start-agent');
    expect(rows[0].valid).toBe(true);
  });

  it('marks disabled (commented) entries', () => {
    const rows = parseCrontab('# 0 3 * * * backup.sh\n');
    expect(rows[0].disabled).toBe(true);
    expect(rows[0].schedule).toBe('0 3 * * *');
    expect(rows[0].command).toBe('backup.sh');
  });

  it('extracts inline comments', () => {
    const rows = parseCrontab('*/10 * * * * sync.sh # every ten\n');
    expect(rows[0].comment).toBe('every ten');
    expect(rows[0].command).toBe('sync.sh');
  });

  it('flags invalid entries', () => {
    const rows = parseCrontab('not-a-cron-line\n');
    expect(rows[0].valid).toBe(false);
  });

  it('keeps empty lines out of rows', () => {
    expect(parseCrontab('\n\n')).toHaveLength(0);
  });
});

describe('rowsToCrontab round-trip', () => {
  it('round-trips a mixed crontab', () => {
    const src = [
      '# comentário em nível de arquivo',
      '*/5 * * * * echo hi # note',
      '# 0 3 * * * disabled.sh',
      '@reboot boot.sh',
      '',
    ].join('\n');
    const rows = parseCrontab(src);
    const out = rowsToCrontab(rows);
    const re = parseCrontab(out);
    expect(re.map((r) => [r.schedule || r.special, r.command, r.comment, r.disabled]))
      .toEqual(rows.map((r) => [r.schedule || r.special, r.command, r.comment, r.disabled]));
  });

  it('serializes a disabled row with a leading #', () => {
    const out = rowsToCrontab([{ raw: '', disabled: true, comment: '', schedule: '0 0 * * *', command: 'x', valid: true }]);
    expect(out).toBe('# 0 0 * * * x');
  });
});
