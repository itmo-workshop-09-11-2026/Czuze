const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

vm.runInNewContext(fs.readFileSync("site/shop-rules.js", "utf8") + `
  const duck = { id: "duck", name: "Резиновая утка", category: "Отладка", price: 100 };
  const esc = { id: "esc", name: "Запасная Esc", category: "Клавиши", price: 200 };
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
`, { assert });
console.log("PASS search, sorting, favorites, quantities, discounts");
