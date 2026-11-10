"use strict";

const cartLimit = 999;
const promoCode = "DEBUG10";

function selectProducts(products, { query, category, sort, favorites }) {
  const needle = query.trim().toLowerCase();
  const matches = products.filter(product =>
    product.name.toLowerCase().includes(needle) &&
    (!category || product.category === category) &&
    (!favorites || favorites.has(product.id)));
  if (sort) matches.sort((a, b) => sort === "asc" ? a.price - b.price : b.price - a.price);
  return matches;
}

function cartAmounts(items, products, promo) {
  let subtotal = 0;
  let count = 0;
  for (const [id, quantity] of items) {
    subtotal += products.get(id).price * 100 * quantity;
    count += quantity;
  }
  const discount = promo ? subtotal / 10 : 0;
  return { count, discount, total: subtotal - discount };
}

function limitFor(product) {
  return Math.min(cartLimit, product.stock);
}

function addOrderItems(cart, products, items) {
  let added = 0;
  const missing = [];
  for (const item of items) {
    if (!item || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
    let product = products.get(item.productId);
    if (!item.productId) {
      const matches = [...products.values()].filter(candidate => candidate.name === item.name);
      if (matches.length === 1) product = matches[0];
    }
    const current = product ? (cart.get(product.id) ?? 0) : 0;
    const available = product ? Math.max(0, limitFor(product) - current) : 0;
    const quantity = Math.min(item.quantity, available);
    if (quantity) cart.set(product.id, current + quantity);
    added += quantity;
    if (quantity < item.quantity) missing.push(`${item.name} × ${item.quantity - quantity}`);
  }
  return { added, missing };
}

function readSavedShop(raw, products) {
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    state = null;
  }
  const list = value => Array.isArray(value) ? value : [];
  const cart = new Map(list(state?.cart).filter(entry => Array.isArray(entry) &&
    products.has(entry[0]) && Number.isInteger(entry[1]) && entry[1] > 0 && entry[1] <= cartLimit));
  const favorites = new Set(list(state?.favorites).filter(id => products.has(id)));
  const demoStock = Object.fromEntries(Object.entries(state?.demoStock ?? {}).filter(([id, stock]) =>
    products.has(id) && Number.isInteger(stock) && stock >= 0 && stock <= cartLimit));
  const orders = list(state?.orders).filter(order =>
    order && ["demo", "server"].includes(order.mode) && Number.isSafeInteger(order.id) &&
    Number.isSafeInteger(order.totalKopecks) && Array.isArray(order.items) &&
    order.items.every(item => item && typeof item.name === "string" &&
      Number.isInteger(item.quantity) && item.quantity > 0));
  const requestId = typeof state?.requestId === "string" &&
    /^[a-zA-Z0-9-]{1,80}$/.test(state.requestId) ? state.requestId : undefined;
  return { cart, favorites, demoStock, orders, requestId, promo: state?.promo === true };
}
