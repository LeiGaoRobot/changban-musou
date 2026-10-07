"""Bundle site/ into single-file builds.

  python build_dist.py

  dist/index.html     standalone page: import map with three + addons as data: URLs, all modules inlined. Works offline.
  dist/artifact.html  body-only variant for claude.ai Artifacts (three + addons from jsDelivr +esm bundles).
"""
import base64, os, re, json, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE, DIST, VENDOR = (os.path.join(ROOT, d) for d in ('site', 'dist', 'vendor'))
os.makedirs(DIST, exist_ok=True); os.makedirs(VENDOR, exist_ok=True)
THREE = 'https://cdn.jsdelivr.net/npm/three@0.184.0'
ORDER = ['quality', 'voxel', 'world', 'anim', 'horse', 'hero', 'crowd', 'cavalry', 'musou', 'vfx', 'audio']   # dependency order, main last

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

html = read(os.path.join(SITE, 'index.html'))
srcs = {n: read(os.path.join(SITE, n + '.js')) for n in ORDER + ['main']}

def strip_imports(src):
    return re.sub(r"^import [^;]*?;\s*$", '', src, flags=re.M | re.S)

def as_iife(src, label):
    names = re.findall(r"^export (?:const|let|function|class) (\w+)", src, flags=re.M)
    for grp in re.findall(r"^export \{([^}]*)\};?\s*$", src, flags=re.M):
        names += [x.strip() for x in grp.split(',') if x.strip()]
    body = re.sub(r"^export \{[^}]*\};?\s*$", '', src, flags=re.M)
    body = re.sub(r"^export (?=(?:const|let|function|class) )", '', strip_imports(body), flags=re.M)
    return f"// ---------------- {label}.js ----------------\nconst {{ {', '.join(names)} }} = (() => {{\n{body}\nreturn {{ {', '.join(names)} }};\n}})();\n"

ALL = '\n'.join(srcs.values())
ADDONS = list(dict.fromkeys(re.findall(r"^import (.+?) from 'three/addons/(.+?)';", ALL, flags=re.M)))

def bundle(esm):
    lines = [f"import * as THREE from '{THREE}/+esm';" if esm else "import * as THREE from 'three';"]
    for what, path in ADDONS:
        lines.append(f"import {what} from '{THREE}/examples/jsm/{path}/+esm';" if esm else f"import {what} from 'three/addons/{path}';")
    out = '\n'.join(lines) + '\n'
    for n in ORDER:
        out += as_iife(srcs[n], n)
    return out + "// ---------------- main.js ----------------\n" + strip_imports(srcs['main'])

def fetch(url, name):
    path = os.path.join(VENDOR, name)
    if not os.path.exists(path):
        print('fetching', url)
        with open(path, 'wb') as f:
            f.write(urllib.request.urlopen(url, timeout=60).read())
    return read(path)

def data_url(js):
    return 'data:text/javascript;base64,' + base64.b64encode(js.encode('utf-8')).decode('ascii')

# the +esm bundle is self-contained; build/three.module.js imports ./three.core.js which a data: URL cannot resolve
imports = {'three': data_url(fetch(THREE + '/+esm', 'three.esm.js'))}
for _, path in ADDONS:
    src = fetch(THREE + '/examples/jsm/' + path + '/+esm', path.replace('/', '__') + '.esm.js')
    src = src.replace('"/npm/three@0.184.0/+esm"', '"three"').replace("'/npm/three@0.184.0/+esm'", "'three'")
    ext = re.findall(r"from\s*[\"'](/npm/[^\"']+)[\"']", src)
    for e in dict.fromkeys(ext):   # addon -> addon imports (e.g. Pass.js): map to their own data URLs
        sub = e.split('/examples/jsm/')[1].rsplit('/+esm', 1)[0]
        subsrc = fetch(THREE + '/examples/jsm/' + sub + '/+esm', sub.replace('/', '__') + '.esm.js')
        subsrc = subsrc.replace('"/npm/three@0.184.0/+esm"', '"three"').replace("'/npm/three@0.184.0/+esm'", "'three'")
        key = 'three/addons/' + sub
        imports.setdefault(key, data_url(subsrc))
        src = src.replace(e, key)
    assert not re.search(r"from\s*[\"']/npm/", src), 'unexpected external import in ' + path
    imports['three/addons/' + path] = data_url(src)
inline_importmap = '<script type="importmap">\n' + json.dumps({'imports': imports}) + '\n</script>\n'

main_tag = re.search(r'<script type="module" src="\./main\.js[^"]*"></script>', html).group(0)
im_block = re.search(r'<script type="importmap">.*?</script>\s*', html, flags=re.S).group(0)
full = html.replace(im_block, inline_importmap).replace(main_tag, '<script type="module">\n' + bundle(False) + '\n</script>')
with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(full)

# artifact: body only, keep the <head> styles and font link at the top of the body
head_bits = re.search(r'<link rel="preconnect".*?</style>', html, flags=re.S).group(0)
title = re.search(r'<title>.*?</title>', html).group(0)
body = re.search(r'<body>(.*)</body>', html, flags=re.S).group(1).replace(main_tag, '<script type="module">\n' + bundle(True) + '\n</script>')
with open(os.path.join(DIST, 'artifact.html'), 'w', encoding='utf-8') as f:
    f.write(title + '\n' + head_bits + '\n' + body)
for n in ('index.html', 'artifact.html'):
    print(n, round(os.path.getsize(os.path.join(DIST, n)) / 1024), 'KB')
