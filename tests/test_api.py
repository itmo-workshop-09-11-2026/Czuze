"""HTTP integration tests with a fresh temporary SQLite database."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from shop_api import ShopHandler, prepare_database


@contextmanager
def serve(database):
    site = ROOT / 'site'
    prepare_database(database, site / 'catalog.js')
    handler = partial(ShopHandler, directory=str(site), database=database, admin_token='test-only')
    with ThreadingHTTPServer(('127.0.0.1', 0), handler) as server:
        thread = Thread(target=server.serve_forever)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}'
        finally:
            server.shutdown()
            thread.join()


def request(base, path, *, method='GET', body=None, token=''):
    headers = {'X-Admin-Token': token}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(base + path, data=None if body is None else json.dumps(body).encode(),
                  method=method, headers=headers)
    try:
        with urlopen(req, timeout=12) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        with error:
            return error.code, json.load(error)


def order(product_id, quantity=1):
    return {'items': [{'productId': product_id, 'quantity': quantity, 'price': 1}]}


class ShopApiTests(unittest.TestCase):
    def test_catalog_orders_admin_and_persistence(self):
        with TemporaryDirectory() as tmp:
            database = Path(tmp) / 'shop.sqlite3'
            with serve(database) as base:
                query = urlencode({'q': 'УТКА', 'category': 'Отладка'})
                status, matches = request(base, '/api/products?' + query)
                self.assertEqual((status, [p['id'] for p in matches]), (200, ['duck']))
                custom = {'name': 'Последний товар', 'category': 'Тест', 'description': 'Описание',
                          'price': 301, 'stock': 1, 'image': 'duck.svg'}
                self.assertEqual(request(base, '/api/products/last', method='PUT', body=custom)[0], 403)
                self.assertEqual(request(base, '/api/products/last', method='PUT', body=custom, token='test-only')[0], 200)
                self.assertEqual(request(base, '/api/orders', method='POST', body=order('missing'))[0], 400)
                self.assertEqual(request(base, '/api/orders', method='POST', body=order('duck', 1.5))[0], 400)
                self.assertEqual(request(base, '/api/orders', method='POST', body={'items': []})[0], 400)
                failed = order('duck')
                failed['items'].extend(order('last', 2)['items'])
                self.assertEqual(request(base, '/api/orders', method='POST', body=failed)[0], 409)
                self.assertEqual(request(base, '/api/products?' + query)[1][0]['stock'], 12)
                with ThreadPoolExecutor(max_workers=2) as pool:
                    results = list(pool.map(lambda _: request(base, '/api/orders', method='POST', body=order('last')), range(2)))
                self.assertEqual(sorted(status for status, _ in results), [201, 409])
                discounted = order('duck', 3)
                discounted.update(promo='DEBUG10', requestId='unique-test-id')
                status, result = request(base, '/api/orders', method='POST', body=discounted)
                self.assertEqual((status, result['totalKopecks']), (201, 27000))
                self.assertEqual(request(base, '/api/orders', method='POST', body=discounted), (200, result))
            with serve(database) as base:
                self.assertEqual(request(base, '/api/products?' + query)[1][0]['stock'], 9)
                self.assertEqual(request(base, '/api/products?' + urlencode({'category': 'Тест'}))[1][0]['stock'], 0)
                self.assertEqual(request(base, '/api/orders', method='POST', body=discounted), (200, result))


if __name__ == '__main__':
    unittest.main()
