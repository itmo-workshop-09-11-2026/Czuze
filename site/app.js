"use strict";

const products = [
  {
    name: "Резиновая утка", price: 100, image: "duck.svg", code: "01 / DUCK",
    description: "Выслушает весь стек вызовов.",
  },
  {
    name: "Запасная Esc", price: 200, image: "escape.svg", code: "02 / ESC",
    description: "Когда план А уже выполняется.",
  },
  {
    name: "Кофе «До первого билда»", price: 150, image: "coffee.svg", code: "03 / BREW",
    description: "Зависимость для утреннего запуска.",
  },
];

const catalog = document.querySelector("#catalog");
const template = document.querySelector("#product-template");
const cart = document.querySelector("#cart");
const empty = document.querySelector("#empty");
const total = document.querySelector("#total");
const count = document.querySelector("#count");
const cartEvent = document.querySelector("#cart-event");
const cartPrices = new Map();

function updateCart(event) {
  empty.hidden = cartPrices.size > 0;
  cart.hidden = cartPrices.size === 0;
  count.textContent = cartPrices.size;
  const sum = [...cartPrices.values()].reduce((sum, price) => sum + price, 0);
  total.textContent = `${sum} ₽`;
  cartEvent.textContent = `${event} · Итого ${sum} ₽`;
}

for (const { name, price, image, code, description } of products) {
  const product = template.content.cloneNode(true);
  product.querySelector("img").src = `./assets/${image}`;
  product.querySelector(".product-id").textContent = code;
  product.querySelector("h3").textContent = name;
  product.querySelector("p").textContent = description;
  product.querySelector(".price").textContent = `${price} ₽`;
  const add = product.querySelector("button");
  add.setAttribute("aria-label", `Добавить: ${name}`);
  catalog.append(product);

  add.addEventListener("click", () => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${name} · ${price} ₽`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Удалить: ${name}`);
    item.append(label, remove);
    cart.append(item);
    cartPrices.set(item, price);
    updateCart(`+ Добавлено: ${name}`);

    remove.addEventListener("click", () => {
      const next = item.nextElementSibling ?? item.previousElementSibling;
      item.remove();
      cartPrices.delete(item);
      updateCart(`− Удалено: ${name}`);
      (next?.querySelector("button") ?? add).focus();
    });
  });
}
