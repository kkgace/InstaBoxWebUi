#!/usr/bin/env python
"""从 openapi.yaml 生成 src/api/openapi-paths.json（供 API 控制台页面使用）"""
import yaml, json, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = yaml.safe_load(open(os.path.join(root, 'openapi.yaml'), encoding='utf-8'))

# 端点分组标签（按路径第一段 + 语义）
def group_of(path, tags):
    t = tags[0] if tags else ''
    m = {'machines': '沙箱', 'snapshots': '快照', 'images': '快照(旧)', 'operations': '操作', 'ports': '端口',
         'secrets': 'Secrets', 'keys': 'API 密钥', 'usage': '用量', 'orgs': '组织', 'webhooks': 'Webhook',
         'exports': '导出', 'auth': '认证', 'me': '账户', 'vault': 'Vault(旧)', 'sessions': '会话', 'support': '支持'}
    for k, v in m.items():
        if f'/{k}' in path or t == k:
            return v
    return '其他'

ops = []
for p, methods in spec.get('paths', {}).items():
    for m, op in methods.items():
        if m not in ('get', 'post', 'put', 'patch', 'delete') or not isinstance(op, dict):
            continue
        # 跳过纯登录流程（WebUI 用 API Key，不做 OAuth 设备流页面）
        scope = ''
        for sec in op.get('security') or []:
            for k in sec:
                if 'apiKey' in k: scope = 'apikey'
        params = []
        for x in op.get('parameters', []):
            if isinstance(x, dict) and 'name' in x:
                params.append({'name': x['name'], 'in': x.get('in', 'query'), 'required': x.get('required', False)})
        body = None
        rb = op.get('requestBody', {})
        if rb:
            try:
                sch = rb['content']['application/json']['schema']
                ref = sch.get('$ref', '')
                body = {'ref': ref.split('/')[-1] if ref else None}
                # 内联 object：带出字段名
                if not ref and sch.get('type') == 'object':
                    body['props'] = sorted((sch.get('properties') or {}).keys())
            except Exception:
                body = {'ref': None}
        desc = (op.get('description') or '').strip().split('\n')[0]
        # 长描述取 summary + 首行
        ops.append({
            'm': m.upper(), 'p': p,
            's': (op.get('summary') or '').strip()[:120],
            'd': desc[:200],
            'g': group_of(p, op.get('tags', [])),
            'auth': scope or 'session',
            'params': params,
            'body': body,
        })

ops.sort(key=lambda o: (o['g'], o['p'], o['m']))

# 提取常用请求体的完整属性（供 Playground 提示）
schemas = spec.get('components', {}).get('schemas', {})
body_schemas = {}
for o in ops:
    if o['body'] and o['body'].get('ref') and o['body']['ref'] not in body_schemas:
        name = o['body']['ref']
        s = schemas.get(name, {})
        props = {}
        for pn, pd in (s.get('properties') or {}).items():
            t = pd.get('type') or pd.get('$ref', '?').split('/')[-1]
            if t == 'array':
                it = pd.get('items', {})
                t = 'array<' + (it.get('type') or it.get('$ref', '?').split('/')[-1]) + '>'
            if pd.get('enum'): t += ' ' + '|'.join(map(str, pd['enum']))
            props[pn] = t
        body_schemas[name] = props

out = {'ops': ops, 'bodySchemas': body_schemas}
dst = os.path.join(root, 'src', 'api', 'openapi-paths.json')
os.makedirs(os.path.dirname(dst), exist_ok=True)
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(f'生成 {len(ops)} 个操作 → {dst}')
