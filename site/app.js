"use strict";

const $ = selector => document.querySelector(selector);
const catalog = $("#catalog");
const cart = $("#cart");
const checkout = $("#checkout");
const search = $("#search");
const category = $("#category");
const sort = $("#sort");
const params = new URLSearchParams(location.search);
const pageNames = {
  favorites: ["Избранное", "// SAVED ITEMS"],
  cart: ["Корзина", "// CART.LOG"],
  checkout: ["Оформление", "// REVIEW ORDER"],
  orders: ["Заказы", "// ORDER HISTORY"],
  product: ["Товар", "// PRODUCT DETAILS"],
};
const view = Object.hasOwn(pageNames, params.get("view")) ? params.get("view") : "catalog";
const orderMode = apiEnabled ? "server" : "demo";
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
let demoStock = {};
let orders = [];
let pending = false;
let searchRequest;
let requestId;
let ready = false;

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ cart: [...cartItems], favorites: [...favorites], promo, requestId, demoStock, orders }));
  } catch {
    // The store still works when browser storage is unavailable.
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    demoStock = Object.fromEntries(Object.entries(saved?.demoStock ?? {}).filter(([id, stock]) =>
      products.has(id) && Number.isInteger(stock) && stock >= 0 && stock <= 999));
    orders = Array.isArray(saved?.orders) ? saved.orders.filter(order =>
      order && Array.isArray(order.items) && Number.isSafeInteger(order.totalKopecks)) : [];
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
  const event = `${product.name} · количество: ${quantity}`;
  $("#app-status").textContent = event;
  renderCart(event, focusAction ? { id, action: focusAction } : null);
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
    if (view === "checkout") item.append(label, value, lineTotal);
    else item.append(label, controls, lineTotal, remove);
    cart.append(item);
    if (focus?.id === id) focusTarget = focus.action === "plus" && !plus.disabled ? plus : minus;
  }
  const discountLine = $("#discount");
  discountLine.hidden = !discount;
  discountLine.querySelector("strong").textContent = `−${money(discount)}`;
  $("#total").textContent = money(total);
  if (event) $("#cart-event").textContent = `${event} · Итого ${money(total)}`;
  checkout.disabled = pending || count === 0;
  $("#go-checkout").hidden = view !== "cart" || count === 0;
  $("#promo-form").querySelectorAll("input, button").forEach(control => { control.disabled = pending; });
  document.querySelectorAll(".buy-controls[data-product]").forEach(renderBuyControls);
  if (focus) (focusTarget ?? cart.querySelector("button") ?? $("#cart-title")).focus();
}

function renderBuyControls(group) {
  const id = group.dataset.product;
  const product = products.get(id);
  const quantity = cartItems.get(id) ?? 0;
  const active = document.activeElement;
  const focused = group.contains(active);
  group.replaceChildren();
  if (quantity) {
    const minus = actionButton("−", `Уменьшить: ${product.name}`, () => setQuantity(id, quantity - 1), pending);
    const plus = actionButton("+", `Увеличить: ${product.name}`, () => setQuantity(id, quantity + 1), pending || quantity >= limitFor(product));
    const value = document.createElement("span");
    value.textContent = quantity;
    group.append(minus, value, plus);
    if (focused) (active.textContent === "+" && !plus.disabled ? plus : minus).focus();
  } else {
    const add = actionButton(product.stock ? "Добавить +" : "Нет в наличии", `Добавить: ${product.name}`, () => setQuantity(id, 1), pending || !product.stock);
    add.className = "add";
    group.append(add);
    if (focused && !add.disabled) add.focus();
  }
}

function updateFavorites() {
  $("#favorite-count").textContent = favorites.size;
}

function bindFavorite(button, product, labeled = false) {
  const { id, name } = product;
  function update() {
    const saved = favorites.has(id);
    button.textContent = labeled ? (saved ? "♥ В избранном" : "♡ В избранное") : (saved ? "♥" : "♡");
    button.setAttribute("aria-pressed", saved);
  }
  button.setAttribute("aria-label", `Избранное: ${name}`);
  update();
  button.addEventListener("click", () => {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    save();
    update();
    updateFavorites();
    if (view === "favorites") {
      $("#catalog-title").focus();
      refreshCatalog();
    }
  });
}

function loadPhoto(img, filename, placeholder) {
  img.onerror = () => {
    img.hidden = true;
    if (placeholder) placeholder.hidden = false;
  };
  img.hidden = false;
  if (placeholder) placeholder.hidden = true;
  img.src = `./assets/${filename}`;
}

function renderProduct() {
  const product = products.get(params.get("id"));
  if (!product) {
    $("#view-title").textContent = "Товар не найден";
    return;
  }
  $("#view-title").textContent = product.name;
  $("#product-view").hidden = false;
  $("#detail-category").textContent = product.category;
  $("#detail-description").textContent = product.description;
  $("#detail-stock").textContent = `Остаток: ${product.stock} шт.`;
  $("#detail-price").textContent = money(product.price * 100);
  $("#detail-actions").dataset.product = product.id;
  bindFavorite($("#detail-favorite"), product, true);
  const img = $("#gallery-image");
  const tabs = $("#gallery-tabs");
  const photos = [product.image, product.detailImage].filter(Boolean);
  const buttons = photos.map((filename, index) => {
    const button = actionButton("", index ? "Фото сбоку" : "Фото спереди", () => showPhoto(index));
    const thumb = document.createElement("img");
    thumb.alt = "";
    loadPhoto(thumb, filename);
    button.append(thumb);
    tabs.append(button);
    return button;
  });
  function showPhoto(index) {
    img.alt = `${product.name} · ${index ? "фото сбоку" : "фото спереди"}`;
    loadPhoto(img, photos[index], $("#gallery-placeholder"));
    buttons.forEach((button, current) => button.setAttribute("aria-pressed", current === index));
  }
  showPhoto(0);
}

function renderOrders() {
  const history = orders.filter(order => order.mode === orderMode);
  $("#orders-empty").hidden = history.length > 0;
  const list = $("#orders-list");
  const latest = params.get("placed");
  if (latest && history.some(order => String(order.id) === latest)) {
    $("#order-success").hidden = false;
    $("#order-success").textContent = `Заказ №${latest} оформлен.`;
  }
  for (const order of [...history].reverse()) {
    const row = document.createElement("li");
    const title = document.createElement("h2");
    title.textContent = `Заказ №${order.id}`;
    const summary = document.createElement("p");
    summary.textContent = order.items.map(item => `${item.name} × ${item.quantity}`).join(" · ");
    const total = document.createElement("strong");
    total.className = "price";
    total.textContent = money(order.totalKopecks);
    const actions = document.createElement("div");
    actions.className = "order-actions";
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    const cartLink = document.createElement("a");
    cartLink.href = "?view=cart";
    cartLink.textContent = "Открыть корзину →";
    cartLink.hidden = true;
    const repeat = actionButton("Повторить заказ", `Повторить заказ №${order.id}`, () => {
      const { added, missing } = addOrderItems(cartItems, products, order.items);
      if (added) {
        requestId = undefined;
        save();
        renderCart();
        cartLink.hidden = false;
      }
      status.textContent = added ? `Добавлено в корзину: ${added} шт.` : "Добавить товары не удалось.";
      if (missing.length) status.textContent += ` Не хватило: ${missing.join(", ")}.`;
    });
    repeat.className = "add";
    actions.append(repeat, cartLink, status);
    row.append(title, summary, total, actions);
    list.append(row);
  }
}

function renderCatalog(items) {
  const visible = selectProducts(items, {
    query: apiEnabled ? "" : search.value,
    category: apiEnabled ? "" : category.value,
    sort: sort.value,
    favorites: view === "favorites" ? favorites : null,
  });
  catalog.replaceChildren();
  const message = $("#catalog-message");
  message.hidden = visible.length > 0;
  message.textContent = view === "favorites" ? "Здесь пока нет подходящих избранных товаров." : "Ничего не найдено. Попробуйте другой запрос.";
  $("#result-count").textContent = `Найдено: ${visible.length}`;
  for (const product of visible) {
    const { id, name, price, image, description } = product;
    const card = $("#product-template").content.cloneNode(true);
    const img = card.querySelector("img");
    const placeholder = card.querySelector(".art-placeholder");
    const url = `?view=product&id=${encodeURIComponent(id)}`;
    const photo = card.querySelector(".product-photo");
    photo.href = url;
    photo.setAttribute("aria-label", `Открыть: ${name}`);
    loadPhoto(img, image, placeholder);
    card.querySelector(".product-id").textContent = id.toUpperCase();
    card.querySelector(".product-category").textContent = `${product.category} · Остаток: ${product.stock}`;
    const title = card.querySelector("h3 a");
    title.textContent = name;
    title.href = url;
    card.querySelector("p").textContent = description;
    card.querySelector(".price").textContent = money(price * 100);
    const group = card.querySelector(".buy-controls");
    group.dataset.product = id;
    renderBuyControls(group);
    bindFavorite(card.querySelector(".favorite"), product);
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
    for (const product of items) products.set(product.id, { ...products.get(product.id), ...product });
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

search.addEventListener("input", refreshCatalog);
category.addEventListener("change", refreshCatalog);
sort.addEventListener("change", refreshCatalog);
$("#reset").addEventListener("click", () => {
  search.value = category.value = sort.value = "";
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
  if (pending || !cartItems.size) return;
  pending = true;
  renderCart("Отправляем заказ");
  try {
    const items = [...cartItems].map(([productId, quantity]) => ({ productId, quantity }));
    const summary = items.map(({ productId, quantity }) => ({ productId, name: products.get(productId).name, quantity }));
    let order;
    if (apiEnabled) {
      requestId ??= crypto.randomUUID();
      save();
      order = await request("orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, promo: promo ? promoCode : "", requestId }),
      });
    } else {
      if (items.some(({ productId, quantity }) => quantity > products.get(productId).stock)) {
        throw new Error("Остаток изменился. Вернитесь в корзину и проверьте количество.");
      }
      order = {
        id: orders.filter(entry => entry.mode === "demo").length + 1,
        totalKopecks: cartAmounts(cartItems, products, promo).total,
      };
      for (const { productId, quantity } of items) {
        demoStock[productId] -= quantity;
      }
    }
    orders.push({ ...order, mode: orderMode, items: summary });
    cartItems.clear();
    requestId = undefined;
    promo = false;
    save();
    location.assign(`?view=orders&placed=${encodeURIComponent(order.id)}`);
  } catch (error) {
    pending = false;
    renderCart(error.message);
    $("#cart-title").focus();
  }
});

async function start() {
  const section = view === "favorites" ? "catalog" : view === "checkout" ? "cart" : view;
  if (view !== "catalog") {
    $("#view-heading").hidden = false;
    $("#view-title").textContent = pageNames[view][0];
    $("#view-kicker").textContent = pageNames[view][1];
    document.title = `${pageNames[view][0]} · CZUZE`;
  }
  const nav = document.querySelector(`[data-nav="${view === "checkout" ? "cart" : view}"]`);
  nav?.setAttribute("aria-current", view === "checkout" ? "location" : "page");
  $("#hero").hidden = view !== "catalog";
  if (section !== "product") $(`#${section}-view`).hidden = false;
  checkout.hidden = view !== "checkout";
  $("#back-to-cart").hidden = view !== "checkout";
  $("#promo-form").hidden = view !== "cart";
  $("#checkout-note").hidden = view !== "checkout";
  $("#checkout-note").textContent = apiEnabled
    ? "Проверьте состав заказа и подтвердите оформление."
    : "Учебный заказ. Оплата не требуется, история сохраняется в этом браузере.";
  try {
    const items = apiEnabled ? await request("products") : seedProducts.map(product => ({ ...product }));
    const photos = new Map(seedProducts.map(product => [product.id, product]));
    products = new Map(items.map(product => [product.id, {
      ...product, detailImage: product.image === photos.get(product.id)?.image ? photos.get(product.id).detailImage : undefined,
    }]));
    for (const name of [...new Set(items.map(product => product.category))].sort((a, b) => a.localeCompare(b, "ru"))) {
      category.add(new Option(name, name));
    }
    restore();
    if (!apiEnabled) {
      for (const product of products.values()) {
        demoStock[product.id] ??= Math.max(cartItems.get(product.id) ?? 0, 5 + Math.floor(Math.random() * 16));
        product.stock = demoStock[product.id];
      }
      save();
    }
    ready = true;
    updateFavorites();
    if (view === "product") renderProduct();
    if (view === "orders") renderOrders();
    renderCart();
    if (section === "catalog") refreshCatalog();
  } catch (error) {
    const message = `Магазин недоступен. ${error.message} Обновите страницу.`;
    if (section === "catalog") {
      $("#catalog-message").hidden = false;
      $("#catalog-message").textContent = message;
    } else {
      $("#cart-event").textContent = message;
      $("#view-title").textContent = message;
    }
  }
}

window.addEventListener("pageshow", event => {
  if (event.persisted) location.reload();
});

start();

const duckQuestions = [
  ["Сбой", "Что должно было произойти и что вышло на самом деле?"],
  ["Воспроизведение", "Каким самым коротким способом можно повторить сбой?"],
  ["Проверка", "Какую одну гипотезу ты проверишь первой?"],
];
const duckAnswers = [];
const duckDialog = $("#duck-dialog");
const duckForm = $("#duck-form");
const duckAnswer = $("#duck-answer");

function renderDuckStep() {
  const step = duckAnswers.length;
  const complete = step === duckQuestions.length;
  duckForm.hidden = complete;
  $("#duck-result").hidden = !complete;
  if (complete) {
    const summary = $("#duck-summary");
    summary.replaceChildren();
    duckQuestions.forEach(([label], index) => {
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = label;
      description.textContent = duckAnswers[index];
      summary.append(term, description);
    });
    $("#duck-result-title").focus();
  } else {
    $("#duck-step").textContent = `Шаг ${step + 1} из ${duckQuestions.length}`;
    $("#duck-question").textContent = duckQuestions[step][1];
    $("#duck-next").textContent = step + 1 === duckQuestions.length ? "Собрать план →" : "Дальше →";
    duckAnswer.focus();
  }
}

$("#duck-launch").addEventListener("click", () => {
  duckDialog.showModal();
  renderDuckStep();
});

duckForm.addEventListener("submit", event => {
  event.preventDefault();
  const answer = duckAnswer.value.trim();
  if (!answer) {
    duckAnswer.value = "";
    duckAnswer.reportValidity();
    return;
  }
  duckAnswers.push(answer);
  duckForm.reset();
  renderDuckStep();
});

$("#duck-restart").addEventListener("click", () => {
  duckAnswers.length = 0;
  renderDuckStep();
});
