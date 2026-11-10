"""Локальный JSON API и SQLite для магазина."""
from contextlib import closing
import hmac
from http.server import SimpleHTTPRequestHandler
import json
import re
import sqlite3
from urllib.parse import parse_qs, urlsplit

PRODUCT_FIELDS = ('id', 'name', 'price', 'category', 'description', 'image', 'stock')
PROMO = 'DEBUG10'


class ApiError(Exception):
    def __init__(self, status, message):
        self.status = status
        super().__init__(message)


def connect(database):
    conn = sqlite3.connect(database, timeout=8)
    conn.row_factory = sqlite3.Row
    return conn


def prepare_database(database, catalog):
    database.parent.mkdir(parents=True, exist_ok=True)
    prefix = 'const seedProducts = '
    source = catalog.read_text(encoding='utf-8').strip()
    if not source.startswith(prefix) or not source.endswith(';'):
        raise ValueError('Неверный формат catalog.js')
    products = json.loads(source[len(prefix):-1])
    with closing(connect(database)) as conn, conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0),
                category TEXT NOT NULL, description TEXT NOT NULL, image TEXT NOT NULL,
                stock INTEGER NOT NULL CHECK(stock >= 0)
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY, request_id TEXT UNIQUE, payload TEXT NOT NULL,
                total_kopecks INTEGER NOT NULL
            );
        """)
        conn.executemany(
            'INSERT OR IGNORE INTO products VALUES (?, ?, ?, ?, ?, ?, ?)',
            ([product[field] for field in PRODUCT_FIELDS] for product in products),
        )


class ShopHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory, database, admin_token):
        self.database = database
        self.admin_token = admin_token
        super().__init__(*args, directory=directory)

    def respond(self, status, payload, content_type='application/json; charset=utf-8'):
        if isinstance(payload, dict) or isinstance(payload, list):
            payload = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(payload)

    def api(self, handle):
        try:
            status, result = handle()
        except ApiError as error:
            status, result = error.status, {'error': str(error)}
        except sqlite3.Error:
            self.log_error('SQLite request failed')
            status, result = 503, {'error': 'База временно недоступна. Повторите запрос.'}
        self.respond(status, result)

    def read_json(self):
        if self.headers.get_content_type() != 'application/json':
            raise ApiError(415, 'Требуется Content-Type: application/json.')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 32768:
                raise ApiError(413, 'Недопустимый размер запроса.')
            data = json.loads(self.rfile.read(size))
        except (ValueError, RecursionError):
            raise ApiError(400, 'Некорректный JSON.') from None
        if not isinstance(data, dict):
            raise ApiError(400, 'Требуется объект JSON.')
        return data

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/shop-mode.js':
            self.respond(200, b'const apiEnabled = true;\n', 'text/javascript; charset=utf-8')
        elif url.path == '/api/products':
            self.api(lambda: self.get_products(url.query))
        elif url.path.startswith('/api/'):
            self.respond(404, {'error': 'Маршрут не найден.'})
        else:
            super().do_GET()

    def get_products(self, query):
        params = parse_qs(query)
        needle = params.get('q', [''])[0].strip().casefold()
        category = params.get('category', [''])[0]
        with closing(connect(self.database)) as conn:
            products = [
                dict(product) for product in conn.execute('SELECT * FROM products ORDER BY rowid')
                if needle in product['name'].casefold()
                and (not category or category == product['category'])
            ]
        return 200, products

    def do_POST(self):
        if urlsplit(self.path).path == '/api/orders':
            self.api(self.create_order)
        else:
            self.respond(404, {'error': 'Маршрут не найден.'})

    def create_order(self):
        body = self.read_json()
        items = body.get('items')
        if not isinstance(items, list) or not 1 <= len(items) <= 100:
            raise ApiError(400, 'Укажите от 1 до 100 строк заказа.')
        quantities = {}
        for item in items:
            if not isinstance(item, dict):
                raise ApiError(400, 'Некорректная строка заказа.')
            product_id, quantity = item.get('productId'), item.get('quantity')
            if not isinstance(product_id, str) or not re.fullmatch(r'[a-z0-9-]{1,40}', product_id):
                raise ApiError(400, 'Некорректный ID товара.')
            if type(quantity) is not int or not 1 <= quantity <= 999:
                raise ApiError(400, 'Количество должно быть целым числом от 1 до 999.')
            quantities[product_id] = quantities.get(product_id, 0) + quantity
            if quantities[product_id] > 999:
                raise ApiError(400, 'Суммарное количество товара превышает 999.')
        promo = body.get('promo', '')
        if promo not in ('', PROMO):
            raise ApiError(400, 'Неизвестный промокод.')
        request_id = body.get('requestId')
        if request_id is not None and (
            not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}', request_id)
        ):
            raise ApiError(400, 'Некорректный ID запроса.')
        payload = json.dumps([quantities, promo], sort_keys=True)
        with closing(connect(self.database)) as conn, conn:
            # The write lock covers stock checks, decrement and order creation.
            conn.execute('BEGIN IMMEDIATE')
            if request_id:
                previous = conn.execute(
                    'SELECT * FROM orders WHERE request_id = ?', (request_id,)
                ).fetchone()
                if previous:
                    if previous['payload'] != payload:
                        raise ApiError(409, 'Этот ID запроса уже использован.')
                    return 200, {'id': previous['id'], 'totalKopecks': previous['total_kopecks']}
            total = 0
            for product_id, quantity in quantities.items():
                product = conn.execute('SELECT * FROM products WHERE id = ?', (product_id,)).fetchone()
                if product is None:
                    raise ApiError(400, f'Товар {product_id} не найден.')
                updated = conn.execute(
                    'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
                    (quantity, product_id, quantity),
                )
                if not updated.rowcount:
                    raise ApiError(409, f'Недостаточно товара «{product["name"]}». Доступно: {product["stock"]}.')
                total += product['price'] * 100 * quantity
            if promo:
                total -= total // 10
            order_id = conn.execute(
                'INSERT INTO orders (request_id, payload, total_kopecks) VALUES (?, ?, ?)',
                (request_id, payload, total),
            ).lastrowid
        return 201, {'id': order_id, 'totalKopecks': total}

    def do_PUT(self):
        match = re.fullmatch(r'/api/products/([a-z0-9-]{1,40})', urlsplit(self.path).path)
        if match:
            self.api(lambda: self.put_product(match[1]))
        else:
            self.respond(404, {'error': 'Маршрут не найден.'})

    def put_product(self, product_id):
        if not self.admin_token:
            raise ApiError(403, 'Изменение каталога отключено.')
        token = self.headers.get('X-Admin-Token', '').encode('utf-8')
        if not hmac.compare_digest(token, self.admin_token.encode('utf-8')):
            raise ApiError(403, 'Требуется токен администратора.')
        product = {'id': product_id}
        data = self.read_json()
        for field, limit in (('name', 100), ('category', 60), ('description', 240)):
            value = data.get(field)
            if not isinstance(value, str) or not 1 <= len(value.strip()) <= limit:
                raise ApiError(400, f'Некорректное поле {field}.')
            product[field] = value.strip()
        for field, minimum, maximum in (('price', 1, 1_000_000), ('stock', 0, 999_999)):
            value = data.get(field)
            if type(value) is not int or not minimum <= value <= maximum:
                raise ApiError(400, f'Некорректное поле {field}.')
            product[field] = value
        image = data.get('image')
        if not isinstance(image, str) or not re.fullmatch(r'[a-z0-9-]{1,60}\.(svg|png|webp|jpe?g)', image):
            raise ApiError(400, 'Укажите имя файла изображения из assets.')
        product['image'] = image
        with closing(connect(self.database)) as conn, conn:
            conn.execute("""
                INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name, price=excluded.price,
                category=excluded.category, description=excluded.description,
                image=excluded.image, stock=excluded.stock
            """, [product[field] for field in PRODUCT_FIELDS])
        return 200, product
