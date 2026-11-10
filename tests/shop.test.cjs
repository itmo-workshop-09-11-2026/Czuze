const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

vm.runInNewContext(fs.readFileSync("site/shop-rules.js", "utf8") + `
  const duck = { id: "duck", name: "Резиновая утка", category: "Отладка", price: 100, stock: 4 };
  const esc = { id: "esc", name: "Запасная Esc", category: "Клавиши", price: 200, stock: 1 };
  const catalog = [duck, esc];
  assert.equal(selectProducts(catalog, { query: " УТКА ", category: "Отладка" })[0], duck);
  assert.equal(selectProducts(catalog, { query: "", sort: "desc" })[0], esc);
  assert.equal(selectProducts(catalog, { query: "", sort: "asc" })[0], duck);
  assert.equal(selectProducts(catalog, { query: "", favorites: new Set(["esc"]) })[0], esc);
  const products = new Map(catalog.map(product => [product.id, product]));
  const cart = new Map([["duck", 2], ["esc", 1]]);
  assert.equal(cartAmounts(cart, products, false).total, 40000);
  assert.equal(cartAmounts(cart, products, true).total, 36000);
  assert.equal(cartAmounts(cart, products, true).count, 3);
  cart.delete("duck");
  assert.equal(cartAmounts(cart, products, true).total, 18000);
  assert.equal(cartAmounts(new Map(), products, true).total, 0);
  const nextCart = new Map([["duck", 2]]);
  const result = addOrderItems(nextCart, products, [
    { name: duck.name, quantity: 3 },
    { productId: "esc", name: "Старое название Esc", quantity: 1 },
    { productId: "gone", name: "Снятый товар", quantity: 1 },
  ]);
  assert.equal(result.added, 3);
  assert.deepEqual([...nextCart], [["duck", 4], ["esc", 1]]);
  assert.deepEqual(result.missing, [duck.name + " × 1", "Снятый товар × 1"]);
  const restored = readSavedShop(JSON.stringify({
    cart: [["duck", 2], ["esc", -1]], favorites: {}, promo: true,
    orders: [
      { id: 1, mode: "demo", totalKopecks: 10000, items: [{ name: duck.name, quantity: 1 }] },
      { id: 2, mode: "demo", totalKopecks: 10000, items: [null] },
    ],
    requestId: "bad id",
  }), products);
  assert.deepEqual([...restored.cart], [["duck", 2]]);
  assert.equal(restored.orders.length, 1);
  assert.equal(restored.promo, true);
  assert.equal(restored.requestId, undefined);
  assert.equal(readSavedShop("{broken", products).cart.size, 0);
`, { assert });
console.log("PASS search, sorting, favorites, quantities, discounts, repeat orders");
