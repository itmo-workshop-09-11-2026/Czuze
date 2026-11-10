"use strict";

const $ = selector => document.querySelector(selector);
const catalog = $("#catalog");
const cart = $("#cart");
const checkout = $("#checkout");
const search = $("#search");
const category = $("#category");
const sort = $("#sort");
const favoritesButton = $("#favorites");
const promoInput = $("#promo");
const storageKey = "czuze:shop:v1";
const rubles = new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: "RUB", minimumFractionDigits: 0,
});
const money = kopecks => rubles.format(kopecks / 100);
let products = new Map();
let cartItems = new Map();
let favorites = new Set();
let promo = false;
let onlyFavorites = false;
let pending = false;
let searchRequest;
let requestId;
let ready = false;

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ cart: [...cartItems], favorites: [...favorites], promo, requestId }));
  } catch {
    // The store still works when browser storage is unavailable.
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    for (const entry of saved?.cart ?? []) {
      if (!Array.isArray(entry)) continue;
      const [id, quantity] = entry;
      if (products.has(id) && Number.isInteger(quantity) && quantity > 0 && quantity <= cartLimit) {
        cartItems.set(id, quantity);
      }
    }
    favorites = new Set((saved?.favorites ?? []).filter(id => products.has(id)));
    promo = saved?.promo === true;
    if (typeof saved?.requestId === "string") requestId = saved.requestId;
    if (promo) {
      promoInput.value = promoCode;
      $("#promo-status").textContent = "Скидка 10% активна.";
    }
  } catch {
    // Ignore unreadable storage and start with an empty cart.
  }
}

async function request(path, options) {
  const response = await fetch(`./api/${path}`, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Запрос не выполнен.");
  return result;
}

function limitFor(product) {
  return apiEnabled ? Math.min(cartLimit, product.stock) : cartLimit;
}

function actionButton(text, label, action, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.disabled = disabled;
  button.addEventListener("click", action);
  return button;
}

function setQuantity(id, quantity, focusAction) {
  const product = products.get(id);
  if (quantity > (cartItems.get(id) ?? 0) && quantity > limitFor(product)) return;
  if (quantity > 0) cartItems.set(id, quantity);
  else cartItems.delete(id);
  requestId = undefined;
  save();
  renderCart(`${product.name} · количество: ${quantity}`, focusAction ? { id, action: focusAction } : null);
}

function renderCart(event, focus) {
  const { count, discount, total } = cartAmounts(cartItems, products, promo);
  $("#count").textContent = count;
  $("#empty").hidden = count > 0;
  cart.hidden = count === 0;
  cart.replaceChildren();
  let focusTarget;
  for (const [id, quantity] of cartItems) {
    const product = products.get(id);
    const item = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = product.name;
    const controls = document.createElement("div");
    controls.className = "quantity";
    const minus = actionButton("−", `Уменьшить: ${product.name}`, () => setQuantity(id, quantity - 1, "minus"), pending);
    const plus = actionButton("+", `Увеличить: ${product.name}`, () => setQuantity(id, quantity + 1, "plus"), pending || quantity >= limitFor(product));
    const value = document.createElement("span");
    value.textContent = quantity;
    controls.append(minus, value, plus);
    const lineTotal = document.createElement("span");
    lineTotal.className = "line-total";
    lineTotal.textContent = money(product.price * 100 * quantity);
    const remove = actionButton("×", `Удалить: ${product.name}`, () => setQuantity(id, 0, "remove"), pending);
    item.append(label, controls, lineTotal, remove);
    cart.append(item);
    if (focus?.id === id) focusTarget = focus.action === "plus" && !plus.disabled ? plus : minus;
  }
  const discountLine = $("#discount");
  discountLine.hidden = !discount;
  discountLine.querySelector("strong").textContent = `−${money(discount)}`;
  $("#total").textContent = money(total);
  if (event) $("#cart-event").textContent = `${event} · Итого ${money(total)}`;
  checkout.disabled = pending || count === 0;
  $("#promo-form").querySelectorAll("input, button").forEach(control => { control.disabled = pending; });
  catalog.querySelectorAll(".add").forEach(button => {
    const id = button.dataset.product;
    button.disabled = pending || (cartItems.get(id) ?? 0) >= limitFor(products.get(id));
  });
  if (focus) (focusTarget ?? cart.querySelector("button") ?? $("#cart-title")).focus();
}

function renderCatalog(items) {
  const visible = selectProducts(items, {
    query: apiEnabled ? "" : search.value,
    category: apiEnabled ? "" : category.value,
    sort: sort.value,
    favorites: onlyFavorites ? favorites : null,
  });
  catalog.replaceChildren();
  const message = $("#catalog-message");
  message.hidden = visible.length > 0;
  message.textContent = onlyFavorites ? "Здесь пока нет подходящих избранных товаров." : "Ничего не найдено. Попробуйте другой запрос.";
  $("#result-count").textContent = `Найдено: ${visible.length}`;
  for (const product of visible) {
    const { id, name, price, image, description } = product;
    const card = $("#product-template").content.cloneNode(true);
    const img = card.querySelector("img");
    const placeholder = card.querySelector(".art-placeholder");
    img.addEventListener("error", () => {
      img.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = "▧";
    });
    img.src = `./assets/${image}`;
    card.querySelector(".product-id").textContent = id.toUpperCase();
    card.querySelector(".product-category").textContent = apiEnabled
      ? `${product.category} · Остаток: ${product.stock}`
      : product.category;
    card.querySelector("h3").textContent = name;
    card.querySelector("p").textContent = description;
    card.querySelector(".price").textContent = money(price * 100);
    const add = card.querySelector(".add");
    add.dataset.product = id;
    add.setAttribute("aria-label", `Добавить: ${name}`);
    add.disabled = pending || (cartItems.get(id) ?? 0) >= limitFor(product);
    if (apiEnabled && product.stock === 0) add.textContent = "Нет в наличии";
    add.addEventListener("click", () => {
      setQuantity(id, (cartItems.get(id) ?? 0) + 1);
      if (add.disabled) $("#cart-title").focus();
    });

    const favorite = card.querySelector(".favorite");
    const updateFavorite = () => {
      favorite.textContent = favorites.has(id) ? "♥" : "♡";
      favorite.setAttribute("aria-pressed", favorites.has(id));
    };
    favorite.setAttribute("aria-label", `Избранное: ${name}`);
    updateFavorite();
    favorite.addEventListener("click", () => {
      if (favorites.has(id)) favorites.delete(id);
      else favorites.add(id);
      save();
      updateFavorite();
      if (onlyFavorites) {
        favoritesButton.focus();
        refreshCatalog();
      }
    });
    catalog.append(card);
  }
}

async function refreshCatalog() {
  if (!ready) return;
  searchRequest?.abort();
  const controller = new AbortController();
  searchRequest = controller;
  try {
    const params = new URLSearchParams({ q: search.value, category: category.value });
    const items = apiEnabled ? await request(`products?${params}`, { signal: controller.signal }) : [...products.values()];
    if (controller.signal.aborted) return;
    for (const product of items) products.set(product.id, product);
    renderCatalog(items);
    if (apiEnabled && cartItems.size) renderCart();
  } catch (error) {
    if (controller.signal.aborted) return;
    catalog.replaceChildren();
    $("#result-count").textContent = "";
    const message = $("#catalog-message");
    message.hidden = false;
    message.textContent = `Каталог недоступен. ${error.message}`;
  }
}

function toggleFavorites(enabled) {
  onlyFavorites = enabled;
  favoritesButton.setAttribute("aria-pressed", enabled);
}

search.addEventListener("input", refreshCatalog);
category.addEventListener("change", refreshCatalog);
sort.addEventListener("change", refreshCatalog);
favoritesButton.addEventListener("click", () => {
  toggleFavorites(!onlyFavorites);
  refreshCatalog();
});
$("#reset").addEventListener("click", () => {
  search.value = category.value = sort.value = "";
  toggleFavorites(false);
  refreshCatalog();
});

$("#promo-form").addEventListener("submit", event => {
  event.preventDefault();
  const code = promoInput.value.trim().toUpperCase();
  const active = code === promoCode;
  if (promo !== active) requestId = undefined;
  promo = active;
  $("#promo-status").textContent = promo ? "Скидка 10% активна." : code ? "Промокод не найден." : "Промокод сброшен.";
  save();
  renderCart(promo ? "Промокод применён" : "Итог обновлён");
});

checkout.addEventListener("click", async () => {
  pending = true;
  renderCart("Отправляем заказ");
  let message;
  try {
    requestId ??= crypto.randomUUID();
    save();
    const order = await request("orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [...cartItems].map(([productId, quantity]) => ({ productId, quantity })), promo: promo ? promoCode : "", requestId }),
    });
    cartItems.clear();
    requestId = undefined;
    save();
    message = `Заказ №${order.id} принят · ${money(order.totalKopecks)}`;
    refreshCatalog();
  } catch (error) {
    message = error.message;
    refreshCatalog();
  } finally {
    pending = false;
    renderCart(message);
    $("#cart-title").focus();
  }
});

async function start() {
  try {
    const items = apiEnabled ? await request("products") : seedProducts;
    products = new Map(items.map(product => [product.id, product]));
    for (const name of [...new Set(items.map(product => product.category))].sort((a, b) => a.localeCompare(b, "ru"))) {
      category.add(new Option(name, name));
    }
    restore();
    ready = true;
    checkout.hidden = !apiEnabled;
    renderCart();
    refreshCatalog();
  } catch (error) {
    $("#catalog-message").hidden = false;
    $("#catalog-message").textContent = `Каталог недоступен. ${error.message} Обновите страницу.`;
  }
}

start();
