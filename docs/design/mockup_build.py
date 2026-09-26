# Gera as telas do Studio no estilo ElevenLabs (branco, Inter, botões pretos, cinza neutro).
import os, json

OUT = os.path.join(os.path.dirname(__file__), 'project')

P = {
 'home': '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 'ticket': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/>',
 'inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
 'branch': '<circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="8" r="2.2"/><path d="M6 8.2v7.6M18 10.2c0 4-6 3-10.5 6.3"/>',
 'file': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
 'server': '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
 'bot': '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
 'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 'flask': '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
 'gear': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
 'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
 'plus': '<path d="M12 5v14M5 12h14"/>',
 'chevr': '<path d="m9 6 6 6-6 6"/>',
 'chevd': '<path d="m6 9 6 6 6-6"/>',
 'chevl': '<path d="m15 6-6 6 6 6"/>',
 'panel': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
 'check': '<path d="M20 6 9 17l-5-5"/>',
 'x': '<path d="M18 6 6 18M6 6l12 12"/>',
 'pause': '<path d="M9 5v14M15 5v14"/>',
 'stop': '<rect x="6" y="6" width="12" height="12" rx="2"/>',
 'terminal': '<path d="m5 8 4 4-4 4M12 16h7"/>',
 'db': '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
 'key': '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2"/>',
 'folder': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
 'sparkle': '<path d="M12 3c.5 4.5 4.5 8.5 9 9-4.5.5-8.5 4.5-9 9-.5-4.5-4.5-8.5-9-9 4.5-.5 8.5-4.5 9-9z"/>',
 'clip': '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
 'arrowup': '<path d="M12 19V5M5 12l7-7 7 7"/>',
 'filter': '<path d="M4 6h16M7 12h10M10 18h4"/>',
 'sliders': '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
 'more': '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 'flag': '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
 'code': '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
 'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 'undo': '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
 'redo': '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
 'zin': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
 'zout': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
 'expand': '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
 'lock': '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
 'upload': '<path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
 'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
 'bug': '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M12 7V4M4 13h3M17 13h3M5 8l2.5 2M19 8l-2.5 2M5 19l2.5-2M19 19l-2.5-2"/>',
 'wrench': '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8M14.7 6.3 13 5l-3 3"/><path d="M3 21l6-6"/>',
 'layers': '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
 'eye': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
 'dash': '<circle cx="12" cy="12" r="8.5" stroke-dasharray="2.6 2.6"/>',
 'dot': '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
 'globe': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
 'trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
 'copy': '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
}

def ic(n, s=16, sw=1.7, extra=''):
    return (f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"{extra}>{P[n]}</svg>')

CSS = """
:root{--fg:#0a0a0a;--mut:#737373;--sub:#a3a3a3;--bd:#e5e5e5;--bd2:#efefef;--bg2:#fafafa;--bg3:#f4f4f5}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,sans-serif;color:var(--fg);background:#fff;-webkit-font-smoothing:antialiased;font-size:14px;letter-spacing:-.005em}
a{color:inherit;text-decoration:none}
.mono{font-family:'Geist Mono',ui-monospace,monospace;letter-spacing:0}
.app{width:1440px;height:900px;display:flex;background:#fff;overflow:hidden}
.side{width:244px;flex-shrink:0;background:var(--bg2);border-right:1px solid var(--bd2);display:flex;flex-direction:column;padding:10px 8px}
.logo{font-weight:700;font-size:19px;letter-spacing:-.03em;padding:2px 8px 12px;display:flex;align-items:center;gap:7px}
.logo i{width:9px;height:18px;display:inline-flex;gap:2px}.logo i::before,.logo i::after{content:'';width:3px;background:#0a0a0a;border-radius:1px}
.wscard{border:1px solid var(--bd);border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04);margin-bottom:6px;overflow:hidden}
.wscard .back{font-size:12px;color:var(--mut);padding:6px 10px;background:var(--bg2);display:flex;gap:6px;align-items:center;border-bottom:1px solid var(--bd2)}
.wscard .row{display:flex;align-items:center;gap:8px;padding:7px 10px;font-size:14px}
.wscard .row+.row{border-top:1px solid var(--bd2)}
.orb{width:18px;height:18px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 30% 28%,#e0e7ff 0,#7c93d8 40%,#1f3b63 100%)}
.orb.g{background:radial-gradient(circle at 30% 28%,#d1fae5 0,#34a07a 45%,#0f3d33 100%)}
.orb.o{background:radial-gradient(circle at 30% 28%,#ffedd5 0,#f08a5d 45%,#7a2e12 100%)}
.orb.p{background:radial-gradient(circle at 30% 28%,#fce7f3 0,#d479b0 45%,#5b1a45 100%)}
.sec{font-size:13px;color:var(--mut);padding:14px 8px 5px}
.nav{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;font-size:14px;color:#3f3f3f}
.nav svg{color:#525252;flex-shrink:0}
.nav.on{background:#ececec;color:var(--fg);font-weight:500}
.nav .tag{margin-left:auto;font-size:11px;background:#fff;border:1px solid var(--bd);padding:0 7px;border-radius:999px;color:#404040;font-weight:500;line-height:18px}
.nav .cnt{margin-left:auto;font-size:11px;background:#0a0a0a;color:#fff;padding:0 6px;border-radius:999px;line-height:18px;font-weight:600}
.main{flex:1;display:flex;flex-direction:column;min-width:0;background:#fff}
.top{height:48px;flex-shrink:0;display:grid;grid-template-columns:1fr 260px 1fr;align-items:center;gap:12px;padding:0 12px 0 14px;border-bottom:1px solid var(--bd2)}
.crumb{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--mut);white-space:nowrap}
.crumb b{color:var(--fg);font-weight:500}
.crumb svg{color:var(--sub)}
.search{height:32px;border:1px solid var(--bd);border-radius:9px;display:flex;align-items:center;gap:8px;padding:0 6px 0 10px;color:var(--sub);font-size:14px}
.search .k{margin-left:auto;display:flex;gap:3px}
.kbd{font-size:10.5px;border:1px solid var(--bd);border-radius:5px;padding:0 5px;color:var(--mut);background:#fff;line-height:17px;font-family:Inter,sans-serif}
.acts{display:flex;justify-content:flex-end;align-items:center;gap:8px}
.btn{height:32px;padding:0 12px;border:1px solid var(--bd);background:#fff;border-radius:9px;font:inherit;font-size:14px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;color:var(--fg);box-shadow:0 1px 1px rgba(0,0,0,.03);white-space:nowrap;cursor:pointer}
.btn.pri{background:#0a0a0a;color:#fff;border-color:#0a0a0a}
.btn.ghost{border-color:transparent;box-shadow:none;background:transparent}
.btn.sq{width:32px;padding:0}
.btn.lg{height:40px;padding:0 16px;border-radius:10px}
.btn.dis{background:#a3a3a3;border-color:#a3a3a3;color:#fff}
.av{width:30px;height:30px;border-radius:50%;background:#0f766e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;box-shadow:0 0 0 2px #fff,0 0 0 3.5px #5eead4;flex-shrink:0}
.h1{font-size:28px;font-weight:500;letter-spacing:-.025em;margin:0}
.h2{font-size:15px;font-weight:500;margin:0}
.mut{color:var(--mut)}.sub{color:var(--sub)}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:500;padding:0 9px;line-height:22px;border-radius:999px;background:var(--bg3);color:#404040;border:1px solid transparent;white-space:nowrap}
.b-ok{background:#dcfce7;color:#15803d}.b-run{background:#dbeafe;color:#1d4ed8}.b-warn{background:#fef3c7;color:#a16207}.b-err{background:#fee2e2;color:#b91c1c}
.b-line{background:#fff;border-color:var(--bd)}.b-dark{background:#0a0a0a;color:#fff}
.seg{display:inline-flex;background:var(--bg3);border-radius:11px;padding:3px;gap:2px}
.seg a{padding:5px 13px;border-radius:8px;font-size:14px;color:var(--mut)}
.seg a.on{background:#fff;color:var(--fg);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.03)}
.tabs{display:flex;gap:20px;border-bottom:1px solid var(--bd2)}
.tabs a{padding:9px 0;font-size:14px;color:var(--mut);border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;gap:6px;align-items:center}
.tabs a.on{color:var(--fg);border-color:var(--fg);font-weight:500}
.card{border:1px solid var(--bd);border-radius:14px;background:#fff}
.tile{width:40px;height:40px;border:1px solid var(--bd);border-radius:10px;display:flex;align-items:center;justify-content:center;background:#fff;flex-shrink:0;box-shadow:0 1px 2px rgba(0,0,0,.04);color:#262626}
.lrow{display:flex;align-items:center;gap:14px;padding:11px 10px;border-radius:12px}
.lrow .t{font-size:15px;font-weight:500;display:flex;align-items:center;gap:8px}
.lrow .d{font-size:14px;color:var(--mut);margin-top:2px}
.lrow>.chev{margin-left:auto;color:var(--sub)}
.field{height:40px;border:1px solid var(--bd);border-radius:10px;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:14px;background:#fff}
.field .chev{margin-left:auto;color:var(--mut)}
.lbl{font-size:14px;font-weight:500;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
.lbl span{font-size:12px;color:var(--mut);font-weight:400}
.dotu{text-decoration:underline dotted #a3a3a3;text-underline-offset:4px}
table.t{width:100%;border-collapse:collapse;font-size:14px}
.t th{font-weight:400;color:var(--mut);text-align:left;padding:10px;border-bottom:1px solid var(--bd2);white-space:nowrap}
.t td{padding:0 10px;height:48px;white-space:nowrap}
.chk{width:18px;height:18px;border-radius:5px;border:1px solid #d4d4d4;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background:#fff}
.chk.on{background:#0a0a0a;border-color:#0a0a0a;color:#fff}
.rad{width:16px;height:16px;border-radius:50%;border:1px solid #d4d4d4;flex-shrink:0;background:#fff}
.rad.on{border:5px solid #0a0a0a}
.tog{width:32px;height:18px;border-radius:999px;background:#e5e5e5;position:relative;flex-shrink:0}
.tog::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.tog.on{background:#0a0a0a}.tog.on::after{left:16px}
.panel{width:420px;flex-shrink:0;border-left:1px solid var(--bd2);padding:18px 20px;display:flex;flex-direction:column;gap:22px;overflow:hidden;background:#fff}
.chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border:1px solid var(--bd);border-radius:9px;font-size:14px;background:#fff;white-space:nowrap}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;padding:0 9px;line-height:24px;border-radius:8px;background:var(--bg3);color:#262626;white-space:nowrap}
.pill.br{background:#dcfce7;color:#166534}
.note{font-size:13px;color:var(--mut);line-height:1.5}
.warn{display:flex;gap:10px;padding:11px 13px;border-radius:12px;background:var(--bg2);border:1px solid var(--bd2);font-size:13px;line-height:1.5;color:#404040}
.bar{height:6px;border-radius:999px;background:#eeeeee;overflow:hidden}.bar i{display:block;height:100%;background:#22c55e;border-radius:999px}
"""

HEAD = """<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Geist+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<style>{css}</style>
</helmet>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":1440,"height":900}}}}'>
class Component extends DCLogic {{
renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""

def write(name, title, body):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(HEAD.format(title=title, css=CSS, body=body))

LOGO = '<div class="logo"><i></i>studio</div>'

def nav(icon, label, href, on=False, tail=''):
    return f'<a href="{href}" class="nav{" on" if on else ""}">{ic(icon)}{label}{tail}</a>'

def side_ws(active):
    items = [
      ('sec', 'Visão geral'),
      ('home', 'Canvas', 'Main.dc.html', ''),
      ('inbox', 'Caixa de entrada', 'Main.dc.html', '<span class="cnt">2</span>'),
      ('ticket', 'Tickets', 'Historico.dc.html', ''),
      ('sec', 'Configurar'),
      ('branch', 'Repositórios', 'Repos.dc.html', ''),
      ('file', 'Contexto', 'Repos.dc.html', ''),
      ('server', 'Conexões', 'Conexoes.dc.html', '<span class="tag">Novo</span>'),
      ('bot', 'Agentes', 'Settings.dc.html', ''),
      ('sec', 'Monitorar'),
      ('flask', 'Rotinas de teste', 'Historico.dc.html', ''),
      ('clock', 'Atividade', 'Historico.dc.html', ''),
    ]
    h = [LOGO, f'''<div class="wscard">
<a href="Workspaces.dc.html" class="back">{ic('chevl',12)}Todos os workspaces</a>
<div class="row"><span class="orb"></span><span style="font-weight:500">agentia</span></div>
<div class="row"><span style="width:18px;display:flex;justify-content:center;color:#16a34a">{ic('dot',14)}</span>Local · macOS<span style="margin-left:auto;color:var(--mut)">{ic('chevd',14)}</span></div>
</div>''']
    for it in items:
        if it[0] == 'sec':
            h.append(f'<div class="sec">{it[1]}</div>')
        else:
            h.append(nav(it[0], it[1], it[2], it[1] == active, it[3]))
    h.append(f'<div style="margin-top:auto"></div>{nav("gear","Configurações","Settings.dc.html")}')
    return '<nav class="side" aria-label="Workspace">' + '\n'.join(h) + '</nav>'

def side_global(active):
    h = [LOGO,
         nav('layers', 'Workspaces', 'Workspaces.dc.html', active == 'Workspaces'),
         nav('ticket', 'Todos os tickets', 'Historico.dc.html', active == 'Tickets'),
         nav('inbox', 'Caixa de entrada', 'Main.dc.html', False, '<span class="cnt">2</span>'),
         '<div class="sec">Conta</div>',
         nav('gear', 'Configurações', 'Settings.dc.html', active == 'Configurações'),
         nav('user', 'Usuários', 'Settings.dc.html'),
         f'<div style="margin-top:auto;display:flex;align-items:center;gap:10px;padding:8px"><div class="av" style="width:26px;height:26px;font-size:12px">A</div><div style="display:flex;flex-direction:column"><span style="font-size:13px;font-weight:500">almeida</span><span style="font-size:12px" class="mut">admin · local</span></div></div>']
    return '<nav class="side" aria-label="Principal">' + '\n'.join(h) + '</nav>'

def top(crumbs, right=None, search='Buscar tickets, arquivos…'):
    parts = []
    for i, c in enumerate(crumbs):
        if i:
            parts.append(ic('chevr', 13))
        parts.append(f'<b>{c}</b>' if i == len(crumbs) - 1 else f'<span>{c}</span>')
    if right is None:
        right = (f'<a href="Historico.dc.html" class="btn ghost">{ic("flask",15)}Rodar testes</a>'
                 f'<a href="NovoTicket.dc.html" class="btn pri">{ic("plus",15)}Novo ticket</a>'
                 f'<span class="btn sq">{ic("bell",16)}</span><div class="av">A</div>')
    return f'''<header class="top">
<div class="crumb"><span style="color:var(--mut);display:flex">{ic('panel',17)}</span>{''.join(parts)}</div>
<div class="search">{ic('search',15)}<span>{search}</span><span class="k"><span class="kbd">⌘</span><span class="kbd">K</span></span></div>
<div class="acts">{right}</div>
</header>'''

def app(side, main):
    return f'<div class="app">\n{side}\n<main class="main">\n{main}\n</main>\n</div>'

# ---------------------------------------------------------------- Main (canvas)
def node(x, y, tid, title, desc, repos, agent, sel=False, dim=False):
    ring = 'border:1.5px solid #0a0a0a;box-shadow:0 0 0 4px #e5e5e5;' if sel else 'border:1px solid var(--bd);box-shadow:0 1px 3px rgba(0,0,0,.05);'
    op = 'opacity:.72;' if dim else ''
    chips = ''.join(f'<span class="pill" style="line-height:20px;font-size:12px;padding:0 7px">{r}</span>' for r in repos)
    return f'''<a href="Ticket.dc.html" style="position:absolute;left:{x}px;top:{y}px;width:240px;background:#fff;border-radius:12px;{ring}{op}overflow:hidden">
<div style="padding:12px 14px 10px;display:flex;flex-direction:column;gap:5px">
<div style="display:flex;align-items:center;gap:8px"><span class="mono sub" style="font-size:12px">{tid}</span><span style="margin-left:auto;font-size:12px" class="mut">{agent}</span></div>
<div style="font-size:14.5px;font-weight:500;line-height:1.3">{title}</div>
<div style="font-size:13px;line-height:1.4" class="mut">{desc}</div>
</div>
<div style="border-top:1px solid var(--bd2);background:var(--bg2);padding:7px 10px;display:flex;gap:5px;flex-wrap:wrap">{chips}</div>
</a>'''

def epill(cx, y, text, icon='dot', color='#fff'):
    return (f'<span style="position:absolute;left:{cx}px;top:{y}px;transform:translateX(-50%);background:#0a0a0a;color:#fff;'
            f'font-size:12px;font-weight:500;border-radius:999px;padding:0 10px 0 8px;line-height:22px;display:flex;gap:5px;align-items:center;white-space:nowrap">'
            f'<span style="color:{color};display:flex">{ic(icon,11)}</span>{text}</span>')

def build_main():
    W = 1440 - 244 - 400
    cx = W // 2
    r1 = [24, 288, 552]
    r2c = [276, 540]
    edges = [f'M{cx} 232 V286']
    edges.append(f'M{r1[0]+120} 286 H{r1[2]+120}')
    for x in r1:
        edges.append(f'M{x+120} 286 V346')
    edges.append(f'M{r2c[0]} 286 V586')
    edges.append(f'M{r2c[1]} 286 V586')
    svg = ('<svg width="%d" height="852" style="position:absolute;left:0;top:0" fill="none" stroke="#c4c4c4" stroke-width="1.2">' % W
           + ''.join(f'<path d="{d}"/>' for d in edges)
           + ''.join(f'<path d="M{x-4} {y-6} l4 6 4-6" stroke="#a3a3a3"/>' for x, y in
                     [(r1[0]+120, 346), (r1[1]+120, 346), (r1[2]+120, 346), (r2c[0], 586), (r2c[1], 586)])
           + '</svg>')
    tb = ''.join(f'<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:#525252">{ic(n,17)}</span>'
                 for n in ['undo', 'redo', 'zin', 'zout', 'expand'])
    toolbar = f'''<div style="position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:2px;padding:4px 6px;background:#fff;border:1px solid var(--bd);border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.05)">{tb}
<span style="width:1px;height:18px;background:var(--bd);margin:0 6px"></span>
<span style="display:flex;gap:6px;align-items:center;padding:0 8px;font-size:14px">{ic('filter',16)}Mostrar concluídos</span>
<span style="display:flex;gap:6px;align-items:center;padding:0 8px;font-size:14px;position:relative">{ic('flask',16)}Rodar testes<span style="position:absolute;top:-4px;right:2px;width:6px;height:6px;border-radius:50%;background:#22c55e"></span></span></div>'''
    ws = f'''<div style="position:absolute;left:{cx-160}px;top:74px;width:320px;background:#fff;border:1px solid var(--bd);border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.05)">
<div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
<div style="display:flex;align-items:center;gap:9px"><span class="orb" style="width:22px;height:22px"></span><span style="font-size:16px;font-weight:500">agentia</span><span class="mono sub" style="font-size:12px;margin-left:auto">/lp/agentia</span></div>
<div style="display:flex;gap:5px;flex-wrap:wrap">{''.join(f'<span class="pill" style="line-height:22px">{ic("branch",12)}{r}</span>' for r in ['loopieeKora','loopieeMemory','koraTextEngine','loopieeTools'])}<span class="pill" style="line-height:22px">+10</span></div>
</div>
<div style="border-top:1px solid var(--bd2);padding:8px 16px;display:flex;gap:14px;font-size:12.5px;background:var(--bg2);border-radius:0 0 14px 14px" class="mut"><span>CLAUDE.md</span><span>38 memórias</span><span>6 skills</span><span style="margin-left:auto">3 conexões</span></div>
</div>'''
    nodes = (node(r1[0], 356, 'STU-24', 'Fallback de LLM: Groq → OpenAI', 'Trocar de provedor no mesmo turno em 429/5xx, voz e texto.', ['loopieeKora', 'koraTextEngine'], 'Claude Code', sel=True)
             + node(r1[1], 356, 'STU-23', 'Turno fantasma no STT', 'Gate half-duplex congela o segmento do Google.', ['loopieeKora'], 'Claude Code')
             + node(r1[2], 356, 'STU-21', 'Integrar loopieeTools ao AgentLiveV3', '2 PRs prontos para revisão.', ['loopieeKora', 'loopieeTools'], 'Codex')
             + node(r2c[0]-120, 596, 'STU-25', 'Investigar canais presos no .54', 'Ler logs do Asterisk e do WSEngine das últimas 6 h.', ['servidor .54', 'MariaDB'], 'Claude Code')
             + node(r2c[1]-120, 596, 'STU-18', 'Migração para Node 24', 'Aguardando janela de manutenção.', ['todos'], 'Claude Code', dim=True))
    pills = (epill(r1[0]+120, 316, 'Implementando', 'dot', '#60a5fa')
             + epill(r1[1]+120, 316, 'Plano · aguarda você', 'dot', '#fbbf24')
             + epill(r1[2]+120, 316, 'Revisão', 'check', '#4ade80')
             + epill(r2c[0], 556, 'Investigando', 'search', '#fff')
             + epill(r2c[1], 556, 'Bloqueado', 'stop', '#f87171'))
    canvas = f'''<div style="position:relative;flex:1;min-width:0;background-color:#fff;background-image:radial-gradient(#d9d9d9 1px,transparent 1px);background-size:18px 18px;overflow:hidden">
{svg}{toolbar}{ws}{pills}{nodes}
<div style="position:absolute;left:14px;bottom:14px;display:flex;gap:6px"><span class="chip" style="height:30px">{ic('zout',14)}100%{ic('zin',14)}</span></div>
</div>'''

    def inbox(tid, who, text, primary, secondary):
        return f'''<div style="border:1px solid var(--bd);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:center;gap:8px;font-size:12.5px" class="mut"><span class="orb o" style="width:16px;height:16px"></span><span class="mono">{tid}</span>·<span>{who}</span><span style="margin-left:auto">agora</span></div>
<div style="font-size:14px;line-height:1.5">{text}</div>
<div style="display:flex;gap:8px"><span class="btn pri">{primary}</span><span class="btn">{secondary}</span></div>
</div>'''
    def running(tid, what, t, pct):
        return f'''<div style="display:flex;flex-direction:column;gap:7px;padding:10px 0;border-bottom:1px solid var(--bd2)">
<div style="display:flex;gap:8px;align-items:center;font-size:14px"><span style="color:#3b82f6;display:flex">{ic('dot',12)}</span><span class="mono mut" style="font-size:12.5px">{tid}</span><span>{what}</span><span class="mut" style="margin-left:auto;font-size:13px">{t}</span></div>
<div class="bar" style="height:4px"><i style="width:{pct}%;background:#0a0a0a"></i></div></div>'''
    panel = f'''<aside class="panel" style="width:400px">
<div style="display:flex;align-items:center;gap:10px">{ic('inbox',18)}<span style="font-size:17px;font-weight:500">Caixa de entrada</span><span class="badge b-dark" style="margin-left:2px">2</span><span class="mut" style="margin-left:auto;display:flex">{ic('panel',17)}</span></div>
<div class="tabs"><a class="on">Para você</a><a>Agentes</a><a>Tudo</a></div>
{inbox('STU-24', 'Claude Code pergunta', 'O <span class="mono" style="font-size:13px">toolInterpreter</span> do koraTextEngine é gêmeo do Kora. Espelho a mudança lá também?', 'Responder', 'Abrir chat')}
{inbox('STU-23', 'plano pronto', 'Plano com 4 etapas, só no <b style="font-weight:500">loopieeKora</b>. Nada começa sem sua aprovação.', 'Aprovar plano', 'Ver plano')}
<div><div class="lbl" style="margin-bottom:2px">Agentes rodando<span>3 de 4 vagas</span></div>
{running('STU-24', 'Editando llmClient.js', '12 min', 62)}{running('STU-21', 'Rodando testes', '3 min', 85)}{running('STU-25', 'ssh .54 · lendo logs', '1 min', 20)}</div>
</aside>'''
    write('Main.dc.html', 'Canvas do workspace',
          app(side_ws('Canvas'), top(['agentia', 'Canvas']) + f'<div style="flex:1;display:flex;min-height:0">{canvas}{panel}</div>'))

# ---------------------------------------------------------------- Novo ticket
def build_novo():
    tiles = ''.join(f'''<div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:92px"><span class="tile" style="width:44px;height:44px;border-radius:12px;color:#404040">{ic(i,18)}</span><span style="font-size:13px;text-align:center;line-height:1.3" class="mut">{t}</span></div>'''
                    for i, t in [('bug', 'Corrigir bug'), ('sparkle', 'Nova feature'), ('search', 'Investigar logs'), ('db', 'Consultar banco'), ('wrench', 'Refatorar'), ('flask', 'Escrever testes')])
    ctx = ''.join(f'<div style="display:flex;gap:10px;align-items:center;font-size:14px;padding:6px 0"><span style="color:{c};display:flex">{ic(i,16)}</span>{t}</div>'
                  for i, c, t in [('check', '#16a34a', 'CLAUDE.md do workspace e de cada repositório'),
                                  ('check', '#16a34a', '38 memórias do workspace + as suas pessoais'),
                                  ('check', '#16a34a', '6 skills em <span class="mono" style="font-size:13px">.claude/skills</span>'),
                                  ('dash', '#a3a3a3', 'Conexões: nenhuma (este ticket não lê servidor nem banco)')])
    center = f'''<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;padding:28px 40px;gap:28px;overflow:hidden">
<div class="seg"><a class="on">Implementar</a><a>Investigar</a><a>Rotina de teste</a></div>
<h1 style="margin:6px 0 0;font-size:30px;font-weight:500;letter-spacing:-.025em">O que vamos fazer em agentia, Almeida?</h1>
<div style="width:100%;max-width:760px;display:flex;flex-direction:column;align-items:center">
<div style="width:100%;border:1px solid var(--bd);border-radius:22px;box-shadow:0 4px 16px rgba(0,0,0,.06);background:#fff;padding:16px 16px 12px;display:flex;flex-direction:column;gap:14px;position:relative;z-index:1">
<div style="font-size:16px;font-weight:500">Fallback de LLM: Groq → OpenAI</div>
<div style="font-size:15px;line-height:1.55;color:#262626;min-height:70px">Quando o Groq cair ou responder 429/5xx, a ligação não pode ficar muda. Trocar para OpenAI no mesmo turno, nos dois motores (voz e texto).</div>
<div style="display:flex;align-items:center;gap:8px">
<span class="orb" style="width:26px;height:26px"></span>
<span class="btn sq" style="border-radius:50%">{ic('plus',15)}</span>
<span style="color:#525252;display:flex;padding:0 4px">{ic('clip',16)}</span>
<span class="pill" style="border-radius:999px">{ic('branch',12)}loopieeKora<span class="sub" style="display:flex">{ic('x',11)}</span></span>
<span class="pill" style="border-radius:999px">{ic('branch',12)}koraTextEngine<span class="sub" style="display:flex">{ic('x',11)}</span></span>
<span class="mut" style="font-size:13px">@ para citar arquivo, / para comandos</span>
<span style="margin-left:auto;width:34px;height:34px;border-radius:50%;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center">{ic('arrowup',16,2)}</span>
</div></div>
<div style="width:86%;background:var(--bg2);border:1px solid var(--bd);border-top:none;border-radius:0 0 16px 16px;padding:18px 16px 9px;margin-top:-10px;font-size:14px;text-align:center" class="mut">O texto vira rascunho da spec. O agente pergunta o que faltar antes de planejar.</div>
</div>
<div style="display:flex;gap:8px;justify-content:center">{tiles}</div>
<div style="width:100%;max-width:760px"><div class="lbl">O agente vai ler<span>herdado do workspace</span></div><div class="card" style="padding:6px 16px">{ctx}</div></div>
</div>'''

    def setting(label, hint, inner):
        return f'<div><div class="lbl"><b class="dotu" style="font-weight:500">{label}</b><span>{hint}</span></div>{inner}</div>'
    def togrow(t, on):
        return f'<div style="display:flex;align-items:center;justify-content:space-between;font-size:14px;padding:5px 0">{t}<span class="tog{" on" if on else ""}"></span></div>'
    panel = f'''<aside class="panel">
<div class="tabs"><a class="on">Configuração</a><a>Modelos de ticket</a></div>
{setting('Agente', 'padrão do workspace', f'<div class="field"><span class="orb o"></span>Claude Code · Implementador<span class="chev">{ic("chevr",15)}</span></div>')}
{setting('Modelo', 'padrão', f'<div class="field">Opus 5.5<span class="chev">{ic("chevd",15)}</span></div>')}
{setting('Onde roda', '', '<div class="seg" style="width:100%"><a class="on" style="flex:1;text-align:center">Worktree local</a><a style="flex:1;text-align:center">Container</a></div>')}
<div><div class="lbl">Parar para eu aprovar<span>SDD</span></div><div style="display:flex;gap:18px;font-size:14px">
{''.join(f'<span style="display:flex;gap:8px;align-items:center"><span class="chk on">{ic("check",12,2.4)}</span>{t}</span>' for t in ['Spec', 'Plano', 'Merge'])}</div></div>
<div><div class="lbl" style="margin-bottom:2px">Git</div>{togrow('Branch por ticket', True)}{togrow('Push automático', True)}{togrow('Abrir PR ao aprovar', True)}{togrow('Só criar, iniciar depois', False)}</div>
<div style="margin-top:auto;display:flex;gap:8px"><a href="Main.dc.html" class="btn lg" style="flex:1">Cancelar</a><a href="Ticket.dc.html" class="btn pri lg" style="flex:2">Criar e iniciar</a></div>
</aside>'''
    write('NovoTicket.dc.html', 'Novo ticket',
          app(side_ws('Tickets'), top(['agentia', 'Tickets', 'Novo']) + f'<div style="flex:1;display:flex;min-height:0">{center}{panel}</div>'))

# ---------------------------------------------------------------- Ticket header (compartilhado)
def ticket_head(tab, status='<span class="badge b-run">' + ic('dot', 10) + 'Implementando</span>', buttons=None):
    if buttons is None:
        buttons = f'<span class="btn">{ic("pause",14)}Pausar</span><span class="btn">{ic("stop",13)}Parar agente</span>'
    tabs = [('Visão geral', 'Ticket.dc.html', ''), ('Log e chat', 'Chat.dc.html', ''), ('Diff', 'Diff.dc.html', '<span class="badge" style="line-height:18px;padding:0 6px">4</span>'),
            ('Testes', 'Diff.dc.html', ''), ('Atividade', 'Historico.dc.html', '')]
    t = ''.join(f'<a href="{h}" class="{"on" if n == tab else ""}">{n}{x}</a>' for n, h, x in tabs)
    return f'''<div style="padding:22px 32px 0;display:flex;flex-direction:column;gap:12px">
<div style="display:flex;align-items:center;gap:12px"><span class="mono sub" style="font-size:14px">STU-24</span><h1 class="h1" style="font-size:24px">Fallback de LLM: Groq → OpenAI</h1>{status}<span style="margin-left:auto;display:flex;gap:8px">{buttons}</span></div>
<div style="display:flex;gap:10px;align-items:center;font-size:13px" class="mut"><span class="pill br">{ic('branch',12)}studio/stu-24-fallback-llm</span><span class="pill"><span class="orb o" style="width:12px;height:12px"></span>Claude Code · Opus 5.5</span><span>iniciado há 42 min por almeida</span></div>
<div class="tabs">{t}</div></div>'''

# ---------------------------------------------------------------- Ticket
def build_ticket():
    steps = [('Requisitos', 'done'), ('Plano', 'done'), ('Implementação', 'now'), ('Revisão', ''), ('Merge', '')]
    sh = []
    for i, (n, s) in enumerate(steps):
        if s == 'done':
            c = f'<span style="width:24px;height:24px;border-radius:50%;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center">{ic("check",13,2.4)}</span>'
        elif s == 'now':
            c = f'<span style="width:24px;height:24px;border-radius:50%;border:1.5px solid #0a0a0a;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;box-shadow:0 0 0 4px #e5e5e5">{i+1}</span>'
        else:
            c = f'<span style="width:24px;height:24px;border-radius:50%;border:1px dashed #c4c4c4;display:flex;align-items:center;justify-content:center;font-size:12px" class="sub">{i+1}</span>'
        sh.append(f'<div style="display:flex;align-items:center;gap:8px;font-size:14px;{"font-weight:500" if s == "now" else ""}{"color:var(--mut)" if not s else ""}">{c}{n}</div>')
        if i < len(steps) - 1:
            sh.append(f'<span style="flex:1;height:1px;background:{"#0a0a0a" if s == "done" else "var(--bd)"}"></span>')
    doc = lambda n, st, txt, who: f'''<div class="card" style="flex:1;padding:14px 16px;display:flex;flex-direction:column;gap:8px">
<div style="display:flex;align-items:center;gap:8px"><span style="display:flex;color:#525252">{ic('file',16)}</span><span class="mono" style="font-size:13.5px">{n}</span><span class="badge b-ok" style="margin-left:auto">{st}</span></div>
<div style="font-size:14px;line-height:1.5;color:#262626">{txt}</div><div style="font-size:12.5px" class="mut">{who}</div></div>'''
    plan = [('check', '#16a34a', 'Extrair a chamada ao LLM para <span class="mono" style="font-size:13px">llmClient</span> com lista ordenada de provedores', ''),
            ('check', '#16a34a', 'Timeout até o primeiro token e troca em erro 429/5xx', ''),
            ('dot', '#3b82f6', 'Espelhar no koraTextEngine', '<span class="badge b-warn" style="margin-left:auto">pergunta pendente</span>'),
            ('dash', '#a3a3a3', 'Evento <span class="mono" style="font-size:13px">llm.fallback</span> na observabilidade', ''),
            ('dash', '#a3a3a3', 'Testes simulando queda do Groq', '')]
    pl = ''.join(f'<div style="display:flex;gap:11px;align-items:center;font-size:14px;padding:7px 0"><span style="color:{c};display:flex">{ic(i,16)}</span><span>{t}</span>{x}</div>' for i, c, t, x in plan)
    left = f'''<div style="flex:1;min-width:0;padding:22px 32px;display:flex;flex-direction:column;gap:24px;overflow:hidden">
<div style="display:flex;align-items:center;gap:12px">{''.join(sh)}</div>
<div><div class="h2" style="margin-bottom:6px">Descrição</div><div style="font-size:14.5px;line-height:1.6;color:#262626;max-width:720px">Quando o Groq cair ou responder 429/5xx, a ligação não pode ficar muda. Trocar para OpenAI no mesmo turno, sem o caller perceber, nos dois motores: voz (loopieeKora) e texto (koraTextEngine).</div></div>
<div style="display:flex;gap:14px">{doc('spec.md', 'aprovada', 'Critério de aceite: nenhum turno sem resposta por falha de provedor; troca em menos de 1,5 s até o primeiro token.', 'almeida · ontem 18:40')}{doc('plan.md', 'aprovado', '5 etapas em 2 repositórios. Contexto do workspace atualizado no fim (memória de redundância).', 'almeida · hoje 18:21')}</div>
<div><div style="display:flex;align-items:baseline;justify-content:space-between"><div class="h2">Plano de execução</div><span class="mut" style="font-size:13px">2 de 5</span></div>
<div class="card" style="padding:14px 18px;margin-top:8px"><div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><div class="bar" style="flex:1"><i style="width:40%"></i></div><span class="mut" style="font-size:12.5px">40%</span></div>{pl}</div></div>
</div>'''
    def row(k, v, hint=''):
        return f'<div><div class="lbl" style="margin-bottom:6px"><b class="dotu" style="font-weight:500">{k}</b><span>{hint}</span></div><div class="field">{v}<span class="chev">{ic("chevd",15)}</span></div></div>'
    appr = ''.join(f'<div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;padding:5px 0">{k}{v}</div>' for k, v in
                   [('Spec', '<span class="badge b-ok">aprovada</span>'), ('Plano', '<span class="badge b-ok">aprovado</span>'), ('Merge', '<span class="mut" style="font-size:13px">quando chegar em revisão</span>')])
    panel = f'''<aside class="panel" style="width:380px">
<div style="display:flex;align-items:center;gap:10px">{ic('ticket',18)}<span style="font-size:16px;font-weight:500">Detalhes</span></div>
{row('Repositórios', '<span class="pill">loopieeKora</span><span class="pill">koraTextEngine</span>')}
{row('Agente', '<span class="orb o"></span>Claude Code · Opus 5.5', 'usando padrão')}
{row('Execução', 'Worktree local', 'usando padrão')}
<div><div class="lbl" style="margin-bottom:2px">Aprovações</div>{appr}</div>
<div><div class="lbl" style="margin-bottom:2px">Git</div><div class="note">Commit ao aprovar o diff · push automático · 1 PR por repositório</div></div>
<a href="Diff.dc.html" class="btn pri lg" style="margin-top:auto">Revisar diff</a>
</aside>'''
    write('Ticket.dc.html', 'Ticket — visão geral',
          app(side_ws('Tickets'), top(['agentia', 'Tickets', 'STU-24']) + f'<div style="flex:1;display:flex;min-height:0"><div style="flex:1;min-width:0;display:flex;flex-direction:column">{ticket_head("Visão geral")}{left}</div>{panel}</div>'))

# ---------------------------------------------------------------- Chat
def build_chat():
    log = [('19:02:11', 'Read', 'loopieeKora/src/class/agentLiveV3.js', ''),
           ('19:02:13', 'Read', 'loopieeKora/CLAUDE.md, memory/project_redundancia_llm.md', ''),
           ('19:02:14', 'Grep', '"LLM_API_URL" em 2 repositórios · 7 resultados', ''),
           ('19:02:20', 'Edit', 'loopieeKora/src/services/llmClient.js', '<span style="color:#16a34a">+64</span> <span style="color:#dc2626">−12</span>'),
           ('19:02:41', 'Edit', 'loopieeKora/src/class/agentLiveV3.js', '<span style="color:#16a34a">+8</span> <span style="color:#dc2626">−21</span>'),
           ('19:03:02', 'Bash', 'npm test -- llmClient', ''),
           ('', '', '<span style="color:#16a34a">✓ 12 testes passaram (1,8 s)</span>', ''),
           ('19:03:38', 'Read', 'koraTextEngine/src/services/toolInterpreter.js', ''),
           ('19:03:41', 'Ask', 'pergunta enviada à caixa de entrada', ''),
           ('19:05:10', 'Edit', 'koraTextEngine/src/services/llmClient.js', '<span style="color:#16a34a">+58</span>'),
           ('19:05:12', 'Edit', 'CLAUDE.md (contexto do workspace)', '<span style="color:#16a34a">+4</span>')]
    lines = ''.join(f'<div style="display:flex;gap:12px;align-items:baseline;padding:4px 0"><span class="sub" style="width:62px;flex-shrink:0">{t}</span>'
                    + (f'<span style="width:44px;flex-shrink:0;font-weight:500">{k}</span>' if k else '<span style="width:44px;flex-shrink:0"></span>')
                    + f'<span style="color:#262626;flex:1">{p}</span><span>{d}</span></div>' for t, k, p, d in log)
    logp = f'''<div style="flex:1;min-width:0;padding:18px 20px 18px 32px;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:center;gap:10px"><span style="display:flex">{ic('terminal',16)}</span><span class="h2">Log ao vivo</span><span class="badge b-run">{ic('dot',10)}ao vivo</span><span class="mono mut" style="margin-left:auto;font-size:12.5px">worktrees/stu-24/</span></div>
<div class="mono" style="flex:1;background:var(--bg2);border:1px solid var(--bd2);border-radius:14px;padding:14px 16px;font-size:12.5px;overflow:hidden">{lines}<div style="padding-top:6px">▍</div></div></div>'''
    agent = lambda t: f'<div style="display:flex;gap:10px"><span class="orb o" style="width:22px;height:22px;margin-top:1px"></span><div style="font-size:14.5px;line-height:1.55;color:#262626">{t}</div></div>'
    me = lambda t: f'<div style="align-self:flex-end;max-width:82%;background:var(--bg3);border-radius:16px 16px 4px 16px;padding:10px 14px;font-size:14.5px;line-height:1.55">{t}</div>'
    chat = f'''<aside class="panel" style="width:460px;padding:18px 20px">
<div style="display:flex;align-items:center;gap:10px"><span class="orb o" style="width:20px;height:20px"></span><span style="font-size:16px;font-weight:500">Chat</span><span class="mut" style="font-size:13px">Claude Code · Opus 5.5</span><span class="mut" style="margin-left:auto;display:flex">{ic('clock',16)}</span></div>
<div style="flex:1;display:flex;flex-direction:column;gap:18px;overflow:hidden">
{agent('Terminei o llmClient no loopieeKora e os 12 testes passaram. O toolInterpreter do koraTextEngine é gêmeo do Kora, e o CLAUDE.md avisa que já divergiram uma vez. Espelho a mudança lá também?')}
{me('Sim, espelha. E registra no CLAUDE.md que o llmClient também é gêmeo.')}
{agent('Feito nos dois. Adicionei uma linha no CLAUDE.md, na seção de placeholders. Agora vou para o evento <span class="mono" style="font-size:13px">llm.fallback</span> na observabilidade.')}
<div style="display:flex;gap:8px;align-items:center;font-size:13.5px" class="mut"><span style="display:flex;color:#3b82f6">{ic('dot',12)}</span>trabalhando…</div>
</div>
<div style="border:1px solid var(--bd);border-radius:18px;box-shadow:0 4px 14px rgba(0,0,0,.05);padding:12px 12px 10px;display:flex;flex-direction:column;gap:12px">
<span class="sub" style="font-size:14.5px;padding:0 2px">Mensagem para o agente…</span>
<div style="display:flex;gap:6px;align-items:center"><span class="btn sq" style="border-radius:50%">{ic('plus',15)}</span><span style="display:flex;color:#525252;padding:0 4px">{ic('clip',16)}</span><span class="btn ghost" style="height:28px;padding:0 8px;font-size:13px">{ic('stop',12)}Interromper</span>
<span style="margin-left:auto;width:32px;height:32px;border-radius:50%;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center">{ic('arrowup',15,2)}</span></div></div>
</aside>'''
    write('Chat.dc.html', 'Ticket — log e chat',
          app(side_ws('Tickets'), top(['agentia', 'Tickets', 'STU-24']) + f'<div style="flex:1;display:flex;min-height:0"><div style="flex:1;min-width:0;display:flex;flex-direction:column">{ticket_head("Log e chat")}{logp}</div>{chat}</div>'))

# ---------------------------------------------------------------- Diff
def build_diff():
    def f(name, d, on=False):
        return f'<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;font-size:13.5px;{"background:#ececec;font-weight:500" if on else ""}"><span style="display:flex;color:#737373">{ic("file",14)}</span><span class="mono" style="font-size:12.5px">{name}</span><span class="mono" style="margin-left:auto;font-size:12px">{d}</span></div>'
    add = lambda a, r='': f'<span style="color:#16a34a">{a}</span>' + (f' <span style="color:#dc2626">{r}</span>' if r else '')
    tree = f'''<div style="width:260px;flex-shrink:0;border-right:1px solid var(--bd2);padding:16px 10px;display:flex;flex-direction:column;gap:2px;background:var(--bg2)">
<div class="sec" style="padding-top:0">loopieeKora</div>{f('services/llmClient.js', add('+64', '−12'), True)}{f('class/agentLiveV3.js', add('+8', '−21'))}
<div class="sec">koraTextEngine</div>{f('services/llmClient.js', add('+58'))}
<div class="sec">Contexto do workspace</div>{f('CLAUDE.md', add('+4'))}</div>'''
    code = [(' ', '1', "const axios = require('axios');"),
            ('-', '2', "const URL = process.env.LLM_API_URL;"),
            ('+', '2', "const PROVIDERS = ["),
            ('+', '3', "  { name: 'groq', url: process.env.LLM_API_URL, model: process.env.LLM_MODEL },"),
            ('+', '4', "  { name: 'openai', url: process.env.LLM_FALLBACK_URL, model: process.env.LLM_FALLBACK_MODEL },"),
            ('+', '5', "].filter(p =&gt; p.url);"),
            (' ', '6', ""),
            ('+', '7', "// 429/5xx ou sem primeiro token a tempo: o turno tem que responder mesmo assim"),
            ('+', '8', "async function streamChat(messages, { onToken, firstTokenMs = 1500 }) {"),
            ('+', '9', "  for (const provider of PROVIDERS) {"),
            ('+', '10', "    try {"),
            ('+', '11', "      return await tryProvider(provider, messages, onToken, firstTokenMs);"),
            ('+', '12', "    } catch (err) {"),
            ('+', '13', "      if (!isRetryable(err)) throw err;"),
            ('+', '14', "      obs.emit('llm.fallback', { from: provider.name, reason: err.code });"),
            ('+', '15', "    }"),
            ('+', '16', "  }"),
            ('+', '17', "  throw new Error('Nenhum provedor de LLM respondeu');"),
            ('+', '18', "}")]
    bg = {'+': '#f0fdf4', '-': '#fef2f2', ' ': '#fff'}
    col = {'+': '#16a34a', '-': '#dc2626', ' ': '#a3a3a3'}
    cl = ''.join(f'<div style="display:flex;background:{bg[s]};line-height:22px"><span style="width:44px;text-align:right;padding-right:10px;color:#a3a3a3;flex-shrink:0">{n}</span><span style="width:18px;color:{col[s]};flex-shrink:0">{s.strip()}</span><span style="white-space:pre;color:#262626">{c}</span></div>' for s, n, c in code)
    diff = f'''<div style="flex:1;min-width:0;padding:16px 20px;display:flex;flex-direction:column">
<div class="card" style="overflow:hidden;flex:1">
<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--bd2)"><span class="mono" style="font-size:13px">loopieeKora/src/services/llmClient.js</span><span class="btn" style="margin-left:auto;height:28px;font-size:13px">Comentar</span></div>
<div class="mono" style="font-size:12.5px;padding:6px 0"><div style="padding:2px 14px;color:#737373;background:var(--bg2)">@@ -1,9 +1,24 @@</div>{cl}</div></div></div>'''
    tog = lambda t, on: f'<div style="display:flex;align-items:center;justify-content:space-between;font-size:14px;padding:5px 0">{t}<span class="tog{" on" if on else ""}"></span></div>'
    repo = lambda n, d: f'<div style="display:flex;flex-direction:column;gap:4px;padding:8px 0;border-bottom:1px solid var(--bd2)"><span style="font-size:14px;font-weight:500">{n}</span><span class="mono mut" style="font-size:12px">{d}</span></div>'
    panel = f'''<aside class="panel" style="width:360px">
<div class="warn" style="background:#f0fdf4;border-color:#dcfce7;color:#166534"><span style="display:flex">{ic('check',16,2.2)}</span>Testes: 18 de 18 passaram</div>
<div><div class="lbl">Mensagem de commit</div><div class="mono" style="border:1px solid var(--bd);border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.6">feat(llm): fallback Groq → OpenAI por turno<br><br><span class="mut">Troca de provedor em 429/5xx ou timeout de primeiro token.</span></div></div>
<div><div class="lbl" style="margin-bottom:0">Por repositório</div>{repo('loopieeKora', 'studio/stu-24-fallback-llm → main')}{repo('koraTextEngine', 'studio/stu-24-fallback-llm → main')}{repo('Contexto do workspace', 'CLAUDE.md entra junto com o código')}</div>
<div>{tog('Fazer push', True)}{tog('Abrir pull request', True)}{tog('Agente como co-autor', True)}</div>
<div style="margin-top:auto;display:flex;flex-direction:column;gap:8px"><span class="btn pri lg">Commitar e abrir 2 PRs</span><a href="Chat.dc.html" class="btn lg">Pedir ajustes ao agente</a></div>
</aside>'''
    head = ticket_head('Diff', '<span class="badge b-ok">' + ic('check', 11, 2.2) + 'Revisão</span>', '')
    write('Diff.dc.html', 'Ticket — diff e commit',
          app(side_ws('Tickets'), top(['agentia', 'Tickets', 'STU-24']) + f'<div style="flex:1;display:flex;min-height:0"><div style="flex:1;min-width:0;display:flex;flex-direction:column">{head}<div style="flex:1;display:flex;min-height:0">{tree}{diff}</div></div>{panel}</div>'))

# ---------------------------------------------------------------- Login
def build_login():
    art = '''<div style="flex:1;padding:16px;display:flex"><div style="flex:1;border-radius:24px;position:relative;overflow:hidden;background:#f5f3f7">
<div style="position:absolute;width:520px;height:520px;border-radius:50%;left:-80px;top:-60px;background:radial-gradient(circle at 35% 35%,#fbcfe8,#f472b6 45%,transparent 70%);filter:blur(10px);opacity:.75"></div>
<div style="position:absolute;width:560px;height:560px;border-radius:50%;right:-140px;bottom:-120px;background:radial-gradient(circle at 40% 40%,#c7d2fe,#6d8bd6 45%,transparent 70%);filter:blur(10px);opacity:.8"></div>
<div style="position:absolute;width:300px;height:300px;border-radius:50%;left:260px;top:300px;background:radial-gradient(circle at 40% 40%,#fed7aa,#fb923c 50%,transparent 72%);filter:blur(14px);opacity:.6"></div>
<div style="position:absolute;left:48px;bottom:48px;right:48px;color:#0a0a0a">
<div style="font-size:40px;font-weight:500;letter-spacing:-.03em;line-height:1.1">Seus workspaces, seus agentes,<br>um lugar só.</div>
<div style="font-size:16px;line-height:1.55;margin-top:14px;color:#404040;max-width:520px">Cada workspace é uma pasta com vários repositórios e o contexto que os agentes já conhecem. Abra tickets, acompanhe o trabalho e faça commit sem sair da tela.</div></div></div></div>'''
    inp = lambda l, v, t='text': f'<div><div class="lbl">{l}</div><div class="field" style="height:44px">{v}</div></div>'
    form = f'''<div style="width:600px;flex-shrink:0;display:flex;flex-direction:column;padding:28px 40px">
<div class="logo" style="padding:0;font-size:22px"><i></i>studio</div>
<div style="margin:auto 0;width:380px;align-self:center;display:flex;flex-direction:column;gap:18px">
<div><h1 class="h1">Entrar</h1><div class="mut" style="margin-top:6px">Instância local · v0.1</div></div>
{inp('Usuário', 'almeida')}{inp('Senha', '••••••••')}
<a href="Workspaces.dc.html" class="btn pri lg" style="height:44px">Entrar</a>
<div class="note">Contas são criadas pelo administrador da instância. Cada usuário conecta as próprias chaves de IA e o próprio acesso ao git.</div></div>
<div class="note" style="text-align:center">studio · self-hosted</div></div>'''
    write('Login.dc.html', 'Login', f'<div class="app">{form}{art}</div>')

# ---------------------------------------------------------------- Workspaces
def build_workspaces():
    def ws(orb, name, path, meta, badge, href='Main.dc.html'):
        return f'''<a href="{href}" class="lrow"><span class="tile" style="width:44px;height:44px"><span class="orb {orb}" style="width:24px;height:24px"></span></span>
<div style="flex:1;min-width:0"><div class="t">{name}{badge}</div><div class="d">{meta}</div></div>
<span class="mono sub" style="font-size:12.5px">{path}</span><span class="chev" style="color:var(--sub);display:flex">{ic('chevr',16)}</span></a>'''
    found = ''.join(f'<span class="badge {c}">{ic(i,11,2.2)}{t}</span>' for c, i, t in
                    [('b-ok', 'check', '2 repositórios git'), ('b-ok', 'check', 'CLAUDE.md'), ('b-ok', 'check', '9 memórias em ~/.claude'), ('b-warn', 'lock', 'sshpemsp.pem vai para Conexões, fora do git')])
    body = f'''<div style="flex:1;overflow:hidden;padding:48px 0"><div style="width:900px;margin:0 auto;display:flex;flex-direction:column;gap:24px">
<div style="display:flex;align-items:center;gap:12px"><h1 class="h1">Workspaces</h1><span style="display:flex;align-items:center;gap:8px;border:1px solid var(--bd);border-radius:999px;padding:3px 10px 3px 4px;font-size:14px"><span class="badge b-dark">3</span>nesta máquina</span>
<span style="margin-left:auto;display:flex;gap:8px"><span class="btn">{ic('code',15)}Importar de URL git</span><span class="btn pri">{ic('plus',15)}Novo workspace</span></span></div>
<div style="display:flex;flex-direction:column;margin:0 -10px">
{ws('', 'agentia', '/lp/agentia', '14 repositórios · 5 tickets abertos · 38 memórias · Claude Code', '<span class="badge b-run">' + ic('dot',9) + '2 agentes rodando</span>')}
{ws('g', 'monit', '/lp/monit', '3 repositórios · 1 ticket aberto · 12 memórias · Codex', '')}
{ws('p', 'loopiee-strategy', '/lp/loopiee-strategy', '5 repositórios · nenhum ticket aberto · 21 memórias · Claude Code', '')}</div>
<div style="height:1px;background:var(--bd2)"></div>
<div class="card" style="padding:20px;display:flex;flex-direction:column;gap:14px">
<div><div class="h2">Importar pasta existente</div><div class="note" style="margin-top:4px">O Studio lê a pasta, encontra cada repositório e o remoto dele, e traz CLAUDE.md, skills e memórias para dentro do workspace.</div></div>
<div style="display:flex;gap:8px"><div class="field mono" style="flex:1;font-size:13px">{ic('folder',15)}/Users/almeida/lp/monit</div><span class="btn pri lg">Analisar</span></div>
<div style="display:flex;gap:8px;flex-wrap:wrap">{found}</div></div>
<div class="note">Máquina: local (macOS) · dados em <span class="mono">~/.studio</span> · os mesmos workspaces sobem numa EC2 importando pela URL git do contexto.</div>
</div></div>'''
    write('Workspaces.dc.html', 'Workspaces', app(side_global('Workspaces'), top(['Workspaces'], f'<span class="btn">Docs</span><span class="btn sq">{ic("bell",16)}</span><div class="av">A</div>', 'Buscar workspaces…') + body))

# ---------------------------------------------------------------- Repos
def build_repos():
    rows = [('loopieeKora', 'main', '<span class="badge b-warn">3 alterações</span>', 'ok', '3'),
            ('loopieeMemory', 'main', '<span class="mut">limpo</span>', 'ok', '1'),
            ('koraTextEngine', 'main', '<span class="mut">limpo</span>', 'ok', '1'),
            ('loopieeTools', 'main', '<span class="badge b-run">1 commit à frente</span>', 'falta', '1'),
            ('loopieeKoraApi', 'main', '<span class="mut">limpo</span>', 'ok', '0'),
            ('loopieeWSEngine', 'main', '<span class="mut">limpo</span>', 'nao', '0'),
            ('loopieeBuilder', 'poc', '<span class="mut">limpo</span>', 'ok', '0'),
            ('loopieeApiAgent', 'main', '<span class="mut">limpo</span>', 'ok', '0')]
    env = {'ok': '<span class="badge b-ok">configurado</span>', 'falta': '<span class="badge b-err">faltando</span>', 'nao': '<span class="sub">não usa</span>'}
    tr = ''.join(f'''<tr style="border-bottom:1px solid var(--bd2)"><td><div style="font-weight:500">{n}</div><div class="mut mono" style="font-size:12px">github.com/loopiee/{n}</div></td>
<td><span class="pill{" br" if b == "main" else ""}">{ic("branch",12)}{b}</span></td><td>{s}</td><td>{env[e]}</td><td style="text-align:right">{t}</td><td style="text-align:right;color:var(--mut)">{ic("more",16)}</td></tr>''' for n, b, s, e, t in rows)
    ctx = ''.join(f'<div style="flex:1;display:flex;gap:10px;align-items:center;border:1px solid var(--bd);border-radius:12px;padding:10px 12px"><span style="display:flex;color:#525252">{ic(i,16)}</span><div><div class="mono" style="font-size:13px">{n}</div><div class="mut" style="font-size:12.5px">{d}</div></div></div>'
                  for i, n, d in [('file', 'CLAUDE.md', 'editado há 2 h'), ('file', 'AGENTS.md', 'importado pelo CLAUDE.md'), ('folder', 'memory/', '38 memórias'), ('sparkle', '.claude/skills', '6 skills')])
    main = f'''<div style="flex:1;min-width:0;padding:36px 36px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden">
<div style="display:flex;align-items:center;gap:12px"><h1 class="h1">Repositórios</h1><span class="badge">14</span></div>
<div class="field" style="height:40px;color:var(--sub)">{ic('search',16)}Buscar repositórios…</div>
<div style="display:flex;gap:6px;align-items:center"><span class="badge b-dark" style="border-radius:7px;line-height:24px">{ic('x',11)}Estado<span style="opacity:.6">todos</span></span>
<span style="margin-left:auto;display:flex;gap:6px"><span class="btn" style="height:28px;font-size:13px">{ic('filter',13)}Filtros</span><span class="btn" style="height:28px;font-size:13px">{ic('sliders',13)}Colunas</span></span></div>
<table class="t"><thead><tr><th>Repositório</th><th>Branch</th><th>Estado</th><th>.env</th><th style="text-align:right">Tickets</th><th></th></tr></thead><tbody>{tr}</tbody></table>
<div class="h2" style="margin-top:6px">Contexto do workspace</div><div style="display:flex;gap:10px">{ctx}</div>
</div>'''
    panel = f'''<aside class="panel" style="width:400px">
<div style="display:flex;align-items:center"><span style="font-size:16px;font-weight:500">Adicionar repositório</span><span class="mut" style="margin-left:auto;display:flex">{ic('x',17)}</span></div>
<div class="seg" style="width:100%"><a class="on" style="flex:1;text-align:center">Clonar de URL git</a><a style="flex:1;text-align:center">Pasta na máquina</a></div>
<div><div class="lbl">URL do repositório</div><div class="field mono" style="font-size:13px">git@github.com:loopiee/loopieeFlow.git</div></div>
<div style="display:flex;gap:10px"><div style="flex:1"><div class="lbl">Pasta</div><div class="field mono" style="font-size:13px">loopieeFlow</div></div><div style="flex:1"><div class="lbl">Branch padrão</div><div class="field">main<span class="chev">{ic('chevd',15)}</span></div></div></div>
<div><div class="lbl">Credencial</div><div class="field">{ic('code',15)}GitHub · almeida<span class="chev">{ic('chevd',15)}</span></div></div>
<div><div class="lbl">.env<span>opcional</span></div><div class="mono" style="border:1px solid var(--bd);border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.7;color:#404040;height:86px">PORT=3070<br>REDIS_URL=••••••••</div>
<div class="note" style="display:flex;gap:6px;align-items:center;margin-top:8px">{ic('lock',13)}Fica só na máquina, criptografado. Nunca entra no git.</div></div>
<span class="btn pri lg">Clonar e adicionar</span>
<div class="warn">{ic('trash',16)}<span>Para remover, o Studio confere mudanças não commitadas, branches sem push e tickets abertos antes de tirar o repositório.</span></div>
</aside>'''
    write('Repos.dc.html', 'Repositórios', app(side_ws('Repositórios'), top(['agentia', 'Repositórios']) + f'<div style="flex:1;display:flex;min-height:0">{main}{panel}</div>'))

# ---------------------------------------------------------------- Histórico
def build_historico():
    st = {'imp': '<span class="badge b-run">Implementando</span>', 'pla': '<span class="badge b-warn">Plano · aguarda você</span>',
          'rev': '<span class="badge">Revisão</span>', 'req': '<span class="badge">Requisitos</span>', 'inv': '<span class="badge">Investigando</span>',
          'blo': '<span class="badge b-err">Bloqueado</span>', 'ok': '<span class="badge b-ok">Concluído</span>'}
    rows = [('STU-25', 'Investigar canais presos no .54', ['servidor .54', 'MariaDB'], 'Claude Code', 'inv', '1 min', 'agora', '—'),
            ('STU-24', 'Fallback de LLM: Groq → OpenAI', ['loopieeKora', 'koraTextEngine'], 'Claude Code', 'imp', '42 min', 'hoje, 19:05', '—'),
            ('STU-23', 'Turno fantasma no STT', ['loopieeKora'], 'Claude Code', 'pla', '18 min', 'hoje, 18:50', '—'),
            ('STU-21', 'Integrar loopieeTools ao AgentLiveV3', ['loopieeKora', 'loopieeTools'], 'Codex', 'rev', '1 h 12 min', 'hoje, 17:31', '2'),
            ('STU-20', 'Índice RAG dessincronizado após DELETE', ['loopieeMemory'], 'Claude Code', 'req', '—', 'hoje, 16:02', '—'),
            ('STU-18', 'Migração para Node 24', ['todos'], 'Claude Code', 'blo', '2 h 40 min', 'ontem', '—'),
            ('STU-17', 'Finalizações no encerramento', ['loopieeKora', 'loopieeApiAgent'], 'Claude Code', 'ok', '1 h 05 min', 'ontem', '2'),
            ('STU-16', 'Guardrails como tela', ['loopieeApiAgent'], 'Claude Code', 'ok', '38 min', '22 set', '1'),
            ('STU-15', 'Versionamento de agentes', ['loopieeApiAgent', 'loopieeBuilder'], 'Codex', 'ok', '2 h 18 min', '20 set', '3'),
            ('STU-14', 'KB no S3', ['loopieeMemory'], 'Claude Code', 'ok', '54 min', '18 set', '1'),
            ('STU-13', 'Mocks do fluxo Claro D8', ['apiRandom'], 'Claude Code', 'ok', '21 min', '17 set', '1'),
            ('STU-12', 'Clonar agente kORA', ['loopieeKoraApi'], 'Claude Code', 'ok', '47 min', '15 set', '1')]
    def reps(rs):
        s = ''.join(f'<span class="pill" style="line-height:22px">{r}</span>' for r in rs[:2])
        return f'<div style="display:flex;gap:4px">{s}</div>'
    tr = ''.join(f'''<tr style="border-bottom:1px solid var(--bd2)"><td class="mono sub" style="font-size:12.5px">{i}</td><td style="font-weight:{500 if s != "ok" else 400}">{t}</td><td>{reps(r)}</td>
<td><span style="display:flex;gap:6px;align-items:center"><span class="orb {"o" if a == "Claude Code" else "g"}" style="width:14px;height:14px"></span>{a}</span></td><td style="text-align:right">{d}</td><td style="text-align:right">{w}</td><td style="text-align:right">{p}</td><td>{st[s]}</td></tr>''' for i, t, r, a, s, d, w, p in rows)
    body = f'''<div style="flex:1;overflow:hidden;padding:36px 40px 0;display:flex;flex-direction:column;gap:14px">
<div style="display:flex;align-items:center;gap:12px"><h1 class="h1">Tickets</h1><span class="badge">40</span><span style="margin-left:auto" class="seg"><a class="on">Lista</a><a>Quadro</a></span></div>
<div class="field" style="color:var(--sub)">{ic('search',16)}Buscar tickets…<span class="kbd" style="margin-left:auto">/</span></div>
<div style="display:flex;gap:6px;align-items:center"><span class="badge b-dark" style="border-radius:7px;line-height:24px">{ic('x',11)}Workspace<span style="opacity:.6">agentia</span></span>
<span class="chip" style="height:26px;font-size:13px;border-style:dashed" >{ic('plus',12)}Agente</span><span class="chip" style="height:26px;font-size:13px;border-style:dashed">{ic('plus',12)}Repositório</span><span class="chip" style="height:26px;font-size:13px;border-style:dashed">{ic('plus',12)}Etapa</span>
<span style="margin-left:auto;display:flex;gap:6px"><span class="btn" style="height:28px;font-size:13px">{ic('sliders',13)}Personalizar tabela</span><span class="btn" style="height:28px;font-size:13px">{ic('check',13)}Selecionar</span></span></div>
<table class="t"><thead><tr><th>ID</th><th>Título</th><th>Repositórios</th><th>Agente</th><th style="text-align:right">Duração</th><th style="text-align:right">Atualizado</th><th style="text-align:right">PRs</th><th>Etapa</th></tr></thead><tbody>{tr}</tbody></table>
</div>'''
    write('Historico.dc.html', 'Histórico de tickets', app(side_ws('Tickets'), top(['agentia', 'Tickets']) + body))

# ---------------------------------------------------------------- Settings
def build_settings():
    def r(tile, name, desc, right, badge=''):
        return f'''<div class="lrow">{tile}<div style="flex:1;min-width:0"><div class="t">{name}{badge}</div><div class="d">{desc}</div></div>{right}<span class="chev" style="color:var(--sub);display:flex">{ic('chevr',16)}</span></div>'''
    t = lambda o: f'<span class="tile"><span class="orb {o}" style="width:20px;height:20px"></span></span>'
    ok = '<span class="badge b-ok">Conectado</span>'
    con = '<span class="btn">Conectar</span>'
    body = f'''<div style="flex:1;overflow:hidden;padding:44px 0"><div style="width:860px;margin:0 auto;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><h1 class="h1">Configurações</h1></div>
<div class="tabs" style="margin-bottom:10px"><a class="on">Geral</a><a>Usuários</a><a>Máquina</a><a>Faturamento de uso</a></div>
<div class="h2 mut" style="font-weight:400;font-size:14px">Provedores de IA · suas chaves, só suas</div>
<div style="margin:0 -10px">{r(t('o'), 'Anthropic · Claude Code', '<span class="mono" style="font-size:12.5px">chave de API · sk-ant-••••4f2a</span>', ok)}
{r(t('g'), 'OpenAI · Codex', 'Chave de API ou login da assinatura', con)}
{r(t(''), 'Google · Gemini CLI', 'Chave de API', con, '<span class="badge b-line" style="line-height:18px">Alpha</span>')}</div>
<div class="warn">{ic('key',16)}<span>Login por assinatura (em vez de chave de API) é opção por usuário. Confira os termos do provedor antes de usar numa instância compartilhada.</span></div>
<div class="h2 mut" style="font-weight:400;font-size:14px;margin-top:14px">Git</div>
<div style="margin:0 -10px">{r(f'<span class="tile">{ic("code",18)}</span>', 'GitHub', 'Token pessoal · clone, push e pull requests · commits como [SEU NOME]', ok)}</div>
<div class="h2 mut" style="font-weight:400;font-size:14px;margin-top:14px;display:flex">Perfis de agente<span class="btn" style="margin-left:auto;height:28px;font-size:13px">{ic('plus',13)}Novo perfil</span></div>
<div style="margin:0 -10px">{r(f'<span class="tile">{ic("wrench",18)}</span>', 'Implementador', 'Claude Code · Opus 5.5 · edita e roda testes', '', '<span class="badge b-line" style="line-height:18px">padrão</span>')}
{r(f'<span class="tile">{ic("eye",18)}</span>', 'Revisor', 'Claude Code · somente leitura · comenta o diff', '')}
{r(f'<span class="tile">{ic("search",18)}</span>', 'Investigador', 'Claude Code · somente leitura · pode usar Conexões', '')}</div>
</div></div>'''
    write('Settings.dc.html', 'Configurações', app(side_global('Configurações'), top(['Configurações'], f'<span class="btn">Docs</span><span class="btn sq">{ic("bell",16)}</span><div class="av">A</div>', 'Buscar…') + body))

# ---------------------------------------------------------------- Conexões
def build_conexoes():
    def r(icon, name, desc, badges):
        b = ''.join(badges)
        return f'''<div class="lrow"><span class="tile">{ic(icon,18)}</span><div style="flex:1;min-width:0"><div class="t">{name}</div><div class="d">{desc}</div></div>
<div style="display:flex;gap:6px">{b}</div><span class="chev" style="color:var(--sub);display:flex;margin-left:6px">{ic('chevr',16)}</span></div>'''
    ro = '<span class="badge b-line">somente leitura</span>'
    main = f'''<div style="flex:1;min-width:0;padding:44px 40px 0;overflow:hidden"><div style="max-width:780px;margin:0 auto;display:flex;flex-direction:column;gap:10px">
<div style="display:flex;align-items:center;gap:12px"><h1 class="h1">Conexões</h1><span style="display:flex;align-items:center;gap:8px;border:1px solid var(--bd);border-radius:999px;padding:3px 10px 3px 4px;font-size:14px"><span class="badge b-dark">Novo</span>Investigar com o agente{ic('chevr',14)}</span>
<span class="btn" style="margin-left:auto">{ic('plus',15)}Nova conexão</span></div>
<div class="note" style="margin-bottom:14px">Servidores e bancos que os agentes deste workspace podem ler em tickets de investigação. Credenciais ficam criptografadas no Studio, nunca no git nem no contexto.</div>
<div class="h2 mut" style="font-weight:400;font-size:14px">Servidores · SSH</div>
<div style="margin:0 -10px">{r('server', 'kora-prod-54', '<span class="mono" style="font-size:12.5px">ubuntu@10.0.0.54</span> · chave sshpemsp.pem', [ro, '<span class="badge">via VPN</span>'])}
{r('server', 'asterisk-236', '<span class="mono" style="font-size:12.5px">root@10.0.0.236</span> · chave sshpemsp.pem', [ro, '<span class="badge">via VPN</span>'])}</div>
<div class="h2 mut" style="font-weight:400;font-size:14px;margin-top:14px">Bancos</div>
<div style="margin:0 -10px">{r('db', 'MariaDB · agents', 'usuário studio_ro · só SELECT', [ro])}
{r('db', 'MySQL · loopieeKoraApi', 'logs de chamadas · usuário studio_ro', [ro])}
{r('db', 'Redis · fluxos', 'camara_ai:* e camara_bot:* · GET e SCAN', [ro])}
{r('db', 'Turso · memória por agente', 'libSQL · leitura', [ro, '<span class="badge b-warn">token expira em 6 dias</span>'])}</div>
</div></div>'''
    rad = lambda on, t, d: f'<div style="display:flex;gap:10px;padding:6px 0"><span class="rad{" on" if on else ""}" style="margin-top:2px"></span><div><div style="font-size:14px;font-weight:500">{t}</div><div class="note">{d}</div></div></div>'
    panel = f'''<aside class="panel" style="width:420px">
<div style="display:flex;align-items:center"><span style="font-size:16px;font-weight:500">Nova conexão SSH</span><span class="mut" style="margin-left:auto;display:flex">{ic('x',17)}</span></div>
<div class="seg" style="width:100%"><a class="on" style="flex:1;text-align:center">SSH</a><a style="flex:1;text-align:center">Banco</a></div>
<div><div class="lbl">Nome</div><div class="field">kora-prod-54</div></div>
<div style="display:flex;gap:10px"><div style="flex:2"><div class="lbl">Host</div><div class="field mono" style="font-size:13px">10.0.0.54</div></div><div style="flex:1"><div class="lbl">Usuário</div><div class="field mono" style="font-size:13px">ubuntu</div></div></div>
<div><div class="lbl">Chave privada</div><div style="border:1px dashed #d4d4d4;border-radius:12px;padding:14px;display:flex;align-items:center;gap:10px;background:var(--bg2)"><span class="tile" style="width:34px;height:34px">{ic('key',16)}</span><div><div class="mono" style="font-size:13px">sshpemsp.pem</div><div class="note" style="font-size:12px">criptografada · o agente não lê o arquivo</div></div><span class="mut" style="margin-left:auto;display:flex">{ic('trash',15)}</span></div></div>
<div><div class="lbl" style="margin-bottom:2px">O que o agente pode fazer</div>
{rad(True, 'Só ler', '<span class="mono" style="font-size:12px">tail, grep, journalctl, docker logs, cat</span> rodam sem perguntar')}
{rad(False, 'Ler e agir com aprovação', 'Qualquer outro comando vai para a sua caixa de entrada antes de rodar')}</div>
<div style="margin-top:auto;display:flex;gap:8px"><span class="btn lg" style="flex:1">{ic('terminal',15)}Testar conexão</span><span class="btn pri lg" style="flex:1">Salvar</span></div>
</aside>'''
    write('Conexoes.dc.html', 'Conexões', app(side_ws('Conexões'), top(['agentia', 'Conexões']) + f'<div style="flex:1;display:flex;min-height:0">{main}{panel}</div>'))

for fn in [build_main, build_novo, build_ticket, build_chat, build_diff, build_login, build_workspaces, build_repos, build_historico, build_settings, build_conexoes]:
    fn()

cj = os.path.join(OUT, 'canvas.json')
c = json.load(open(cj))
c['boards']['Conexoes.dc.html'] = {'x': 7600, 'y': 1320, 'w': 1440, 'h': 900, 'title': 'Conexões — SSH e bancos', 'is_interactive': True}
if 'Conexoes.dc.html' not in c['order']:
    c['order'].append('Conexoes.dc.html')
c['notes']['row1']['maxW'] = 9040
c['notes']['row2']['maxW'] = 9040
c['notes']['row2']['text'] = 'Conta, workspaces, histórico e conexões'
json.dump(c, open(cj, 'w'), ensure_ascii=False, indent=2)
print('ok')
