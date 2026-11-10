/** crontab 文本解析/序列化（供 CronTab 使用与单元测试） */

export interface CronRow {
  raw: string;          // 原始行（含注释）
  disabled: boolean;    // # 前缀
  comment: string;      // 行内注释（# 之后）
  schedule: string;     // 5 段
  command: string;
  special?: string;     // @reboot 等特殊表达式
  valid: boolean;
}

export function parseCrontab(text: string): CronRow[] {
  return text.split('\n').filter((l) => l.trim() !== '').map((raw) => {
    const line = raw.trimEnd();
    const disabled = line.trim().startsWith('#');
    const content = disabled ? line.trim().replace(/^#+\s*/, '') : line.trim();
    const hashIdx = content.indexOf(' #');
    const body = hashIdx > 0 ? content.slice(0, hashIdx) : content;
    const comment = hashIdx > 0 ? content.slice(hashIdx + 2).trim() : '';
    let schedule = '';
    let command = '';
    let special: string | undefined;
    let valid = false;
    if (body.startsWith('@')) {
      const sp = body.split(/\s+/);
      special = sp[0];
      command = sp.slice(1).join(' ');
      valid = sp.length >= 2;
    } else {
      const sp = body.split(/\s+/);
      if (sp.length >= 6 && sp.slice(0, 5).every((f) => f.length > 0)) {
        schedule = sp.slice(0, 5).join(' ');
        command = sp.slice(5).join(' ');
        valid = true;
      } else {
        // 不匹配（如整行注释、坏行）：整体放进 command 原样保留，序列化时带 # 前缀还原
        command = body;
        valid = false;
      }
    }
    return { raw: line, disabled, comment, schedule, command, special, valid };
  });
}

export function rowsToCrontab(rows: CronRow[]): string {
  return rows.map((r) => {
    const prefix = r.disabled ? '# ' : '';
    const body = r.special ? `${r.special} ${r.command}` : (r.schedule ? `${r.schedule} ${r.command}` : r.command);
    return (r.comment ? `${prefix}${body} # ${r.comment}` : `${prefix}${body}`).trimEnd();
  }).join('\n');
}
