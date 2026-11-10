"use strict";

const products = [
  { name: "Лунный батончик", price: 100 },
  { name: "Марсианский суп", price: 200 },
  { name: "Орбитальный чай", price: 50 },
];

const catalog = document.querySelector("#catalog");
const cart = document.querySelector("#cart");
const empty = document.querySelector("#empty");
const total = document.querySelector("#total");
const cartPrices = new Map();

function updateCart() {
  empty.hidden = cartPrices.size > 0;
  cart.hidden = cartPrices.size === 0;
  const sum = [...cartPrices.values()].reduce((sum, price) => sum + price, 0);
  total.textContent = `${sum} ₽`;
}

for (const { name, price } of products) {
  const product = document.createElement("li");
  const add = document.createElement("button");
  add.textContent = "Добавить";
  add.setAttribute("aria-label", `Добавить: ${name}`);
  product.append(`${name} — ${price} ₽`, add);
  catalog.append(product);

  add.addEventListener("click", () => {
    const item = document.createElement("li");
    const remove = document.createElement("button");
    remove.textContent = "Удалить";
    remove.setAttribute("aria-label", `Удалить: ${name}`);
    item.append(`${name} — ${price} ₽`, remove);
    cart.append(item);
    cartPrices.set(item, price);
    updateCart();

    remove.addEventListener("click", () => {
      item.remove();
      cartPrices.delete(item);
      updateCart();
      add.focus();
    });
  });
}
