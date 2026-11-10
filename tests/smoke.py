"""Integration checks. Usage: python3 tests/smoke.py [--pack-only]."""
from pathlib import Path
import os, shutil, signal, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error, zipfile
ROOT=Path(__file__).resolve().parents[1]
CMD=[sys.executable, 'main.py']

def call(args, cwd):
    result=subprocess.run(args,cwd=cwd,capture_output=True,text=True,timeout=120)
    if result.returncode: raise AssertionError(result.stdout+result.stderr)
    return result

with tempfile.TemporaryDirectory(prefix='shop-test-') as tmp:
    work=Path(tmp)/'project'
    shutil.copytree(ROOT,work,ignore=shutil.ignore_patterns('.git','bin','obj','*.zip','__pycache__'))
    (work/'site/products.json').write_text('[]')
    (work/'site/old.txt').write_text('old')
    call(CMD+['--pack'],work)
    with zipfile.ZipFile(work/'shop.zip') as z:
        assert {'index.html','styles.css','app.js','assets/shop.svg','products.json','old.txt'}<=set(z.namelist())
        assert all(not n.startswith(('site/','../','/')) for n in z.namelist())
        assert all(not n.endswith(('.go','.java','.cs','.csproj','.py')) for n in z.namelist())
    (work/'site/old.txt').unlink()
    call(CMD+['--pack'],work)
    with zipfile.ZipFile(work/'shop.zip') as z: assert 'old.txt' not in z.namelist()
    previous=(work/'shop.zip').read_bytes()
    index=(work/'site/index.html').read_bytes()
    (work/'site/index.html').unlink()
    assert subprocess.run(CMD+['--pack'],cwd=work,capture_output=True).returncode!=0
    assert previous==(work/'shop.zip').read_bytes()
    (work/'site/index.html').write_bytes(index)
    if os.name!='nt':
        (work/'outside.txt').write_text('must not leak')
        (work/'site/link.txt').symlink_to(work/'outside.txt')
        assert subprocess.run(CMD+['--pack'],cwd=work,capture_output=True).returncode!=0
        assert previous==(work/'shop.zip').read_bytes()
        (work/'site/link.txt').unlink()
    print('PASS ZIP: resources, JSON, replacement, failed publication preservation, symlink rejection (Unix)',flush=True)
    if '--pack-only' in sys.argv: sys.exit(0)
    with socket.socket() as s:
        s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
    env=dict(os.environ,HOST='127.0.0.1',PORT=str(port))
    with open(Path(tmp)/'server.log','w+') as log:
        server=subprocess.Popen(CMD,cwd=work,env=env,stdout=log,stderr=log,start_new_session=(os.name!='nt'))
        base=f'http://127.0.0.1:{port}'
        try:
            for attempt in range(120):
                if server.poll() is not None:
                    log.seek(0); raise AssertionError(log.read())
                try:
                    with urllib.request.urlopen(base,timeout=1) as r:
                        assert r.status==200; break
                except (OSError,urllib.error.URLError): time.sleep(.25)
            else:
                log.seek(0); raise AssertionError('Server did not start: '+log.read())
            for path,mime in [('/', 'text/html'),('/styles.css','text/css'),('/app.js','javascript'),('/assets/shop.svg','image/svg+xml'),('/products.json','application/json')]:
                with urllib.request.urlopen(base+path) as r:
                    assert mime in r.headers['Content-Type'], (path,r.headers['Content-Type'])
                    assert r.read(), path
            for path in ['/absent.txt','/README.md','/Main.java','/Program.cs','/main.go','/NuGet.Config','/main.py']:
                try: urllib.request.urlopen(base+path)
                except urllib.error.HTTPError as e: assert e.code==404,(path,e.code)
                else: raise AssertionError('Exposed unexpected file: '+path)
            (work/'site/version.txt').write_text('version2')
            with urllib.request.urlopen(base+'/version.txt') as r: assert r.read()==b'version2'
            print('PASS HTTP: root, MIME, assets, JSON, 404, source isolation, changed file',flush=True)
        finally:
            if os.name=='nt': subprocess.run(['taskkill','/F','/T','/PID',str(server.pid)],capture_output=True)
            else:
                try: os.killpg(server.pid,signal.SIGTERM)
                except ProcessLookupError: pass
            server.wait(timeout=10)
