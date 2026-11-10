"""Локальный сервер магазина. python3 main.py [--pack]. Только стандартная библиотека."""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import tempfile
import zipfile

from shop_api import ShopHandler, prepare_database


def raise_walk_error(error):
    raise error


def pack(site):
    # Temporary archive is closed before replacement, including on Windows.
    fd, name = tempfile.mkstemp(prefix='shop-', suffix='.zip', dir='.')
    os.close(fd)
    temporary = Path(name)
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, strict_timestamps=False) as archive:
            for directory, directories, files in os.walk(site, followlinks=False, onerror=raise_walk_error):
                for entry in directories + files:
                    path = Path(directory) / entry
                    if path.is_symlink() or path.is_junction():
                        raise ValueError(f'Ссылка в site: {path}')
                for entry in files:
                    path = Path(directory) / entry
                    if not path.is_file():
                        raise ValueError(f'Необычный файл: {path}')
                    archive.write(path, path.relative_to(site).as_posix())
        os.replace(temporary, 'shop.zip')
    finally:
        temporary.unlink(missing_ok=True)
    print('Ready: shop.zip (index.html at archive root)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', action='store_true', help='Упаковать site/ в shop.zip')
    args = parser.parse_args()
    site = Path('site')
    if not (site / 'index.html').is_file():
        parser.error('Запустите из корня проекта: нет site/index.html')
    if args.pack:
        pack(site)
        return
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '8000'))
    database = Path(os.environ.get('SHOP_DB') or 'data/shop.sqlite3').resolve()
    if database.is_relative_to(site.resolve()):
        parser.error('SHOP_DB должен находиться вне публичной папки site/')
    prepare_database(database, site / 'catalog.js')
    handler = partial(
        ShopHandler, directory=str(site.resolve()), database=database,
        admin_token=os.environ.get('SHOP_ADMIN_TOKEN', ''),
    )
    with ThreadingHTTPServer((host, port), handler) as server:
        print(f'Open http://localhost:{port} - Ctrl+C to stop', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
