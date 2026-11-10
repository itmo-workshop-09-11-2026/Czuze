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
