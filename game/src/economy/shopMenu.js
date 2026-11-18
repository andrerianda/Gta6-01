// The shop menu on screen: a dark ink panel at the left of the picture with the shop's name, the
// cash in hand, one row per item (name, what it gives, the price or why it cannot be had), a row
// of paint swatches for a respray, and the keys at the foot. It lives in its own element under
// <body>, is styled in the HUD's language (hud.css units --u, cream and gold type) by a style
// element it adds once, and shows only while the game is in play.

const STYLE_ID = 'economy-shop-menu-style';

const STYLE = `
.economy-shop { position: fixed; z-index: 11; left: calc(36 * var(--u, 1px)); top: 50%; transform: translateY(-50%);
  width: calc(360 * var(--u, 1px)); box-sizing: border-box; padding: calc(16 * var(--u, 1px)) calc(18 * var(--u, 1px));
  border-radius: calc(10 * var(--u, 1px)); background: rgba(14, 12, 22, 0.82); color: #fff6e6;
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: calc(15 * var(--u, 1px));
  box-shadow: 0 calc(6 * var(--u, 1px)) calc(28 * var(--u, 1px)) rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 211, 107, 0.25);
  animation: economy-shop-in 0.25s cubic-bezier(0.2, 0.9, 0.3, 1); }
@keyframes economy-shop-in { from { opacity: 0; transform: translate(calc(-24 * var(--u, 1px)), -50%); } }
body:not([data-game-state="playing"]) .economy-shop { display: none; }
.economy-shop[hidden] { display: none; }
.economy-shop-head { display: flex; justify-content: space-between; align-items: baseline; gap: calc(10 * var(--u, 1px)); }
.economy-shop-title { margin: 0; font-size: calc(24 * var(--u, 1px)); font-weight: 800; letter-spacing: 0.04em; color: #ffd36b; }
.economy-shop-cash { font-weight: 700; color: #7be3a0; font-variant-numeric: tabular-nums; }
.economy-shop-kind { margin: calc(2 * var(--u, 1px)) 0 calc(12 * var(--u, 1px)); font-size: calc(12 * var(--u, 1px));
  letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.7; }
.economy-shop-message { margin: calc(6 * var(--u, 1px)) 0; opacity: 0.9; }
.economy-shop-list { display: flex; flex-direction: column; gap: calc(3 * var(--u, 1px)); max-height: calc(330 * var(--u, 1px)); overflow: hidden; }
.economy-shop-row { display: grid; grid-template-columns: 1fr auto; column-gap: calc(10 * var(--u, 1px));
  padding: calc(7 * var(--u, 1px)) calc(10 * var(--u, 1px)); border-radius: calc(6 * var(--u, 1px)); border-left: calc(3 * var(--u, 1px)) solid transparent; }
.economy-shop-row[data-selected] { background: rgba(255, 211, 107, 0.16); border-left-color: #ffd36b; }
.economy-shop-row[data-unavailable] { opacity: 0.45; }
.economy-shop-label { font-weight: 700; }
.economy-shop-price { font-weight: 700; text-align: right; color: #ffd36b; font-variant-numeric: tabular-nums; }
.economy-shop-detail { grid-column: 1 / -1; font-size: calc(12.5 * var(--u, 1px)); opacity: 0.75; }
.economy-shop-swatches { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: calc(5 * var(--u, 1px)); margin-top: calc(6 * var(--u, 1px)); }
.economy-shop-swatch { width: calc(20 * var(--u, 1px)); height: calc(20 * var(--u, 1px)); border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); }
.economy-shop-swatch[data-selected] { box-shadow: 0 0 0 calc(2 * var(--u, 1px)) #fff6e6, 0 0 calc(8 * var(--u, 1px)) rgba(255, 211, 107, 0.8); }
.economy-shop-keys { margin-top: calc(12 * var(--u, 1px)); font-size: calc(12 * var(--u, 1px)); opacity: 0.7; letter-spacing: 0.04em; }
`;

/**
 * Creates the menu (hidden).
 * @param {Document} document
 * @returns {ReturnType<typeof buildShopMenu>}
 */
export function createShopMenu(document) {
  return buildShopMenu(document);
}

function buildShopMenu(document) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.append(style);
  }
  const root = element(document, 'section', 'economy-shop');
  root.id = 'economy-shop-menu';
  root.hidden = true;
  const head = element(document, 'div', 'economy-shop-head');
  const title = element(document, 'h2', 'economy-shop-title');
  const cash = element(document, 'span', 'economy-shop-cash');
  head.append(title, cash);
  const kind = element(document, 'p', 'economy-shop-kind');
  const message = element(document, 'p', 'economy-shop-message');
  const list = element(document, 'div', 'economy-shop-list');
  const keys = element(document, 'p', 'economy-shop-keys');
  root.append(head, kind, message, list, keys);
  document.body.append(root);

  const view = { items: [], index: 0, choice: 0 };

  const menu = {
    get isOpen() { return !root.hidden; },
    get index() { return view.index; },
    get choice() { return view.choice; },
    /** The selected item, or null. */
    get selected() { return view.items[view.index] ?? null; },
    /** The selected colour of a respray, or null. */
    get selectedChoice() { return menu.selected?.choices?.[view.choice] ?? null; },

    /**
     * Shows a shop.
     * @param {{title: string, kind: string, cash: string, keys: string}} labels
     * @param {{message: string, items: object[]}} offer From shopCounter.shopOffer().
     */
    open(labels, offer) {
      view.index = 0;
      view.choice = 0;
      root.hidden = false;
      menu.show(labels, offer);
    },

    /** Redraws with a new offer (after a purchase), keeping the selection where it can. */
    show(labels, offer) {
      title.textContent = labels.title;
      kind.textContent = labels.kind;
      cash.textContent = labels.cash;
      keys.textContent = labels.keys;
      message.textContent = offer.message ?? '';
      message.hidden = !offer.message;
      view.items = offer.items ?? [];
      view.index = Math.min(view.index, Math.max(0, view.items.length - 1));
      render();
    },

    /** Moves the selection up (-1) or down (+1). */
    move(step) {
      if (!view.items.length) return;
      view.index = (view.index + step + view.items.length) % view.items.length;
      view.choice = 0;
      render();
    },

    /** Moves along the swatches of the selected item. */
    cycleChoice(step) {
      const count = menu.selected?.choices?.length ?? 0;
      if (!count) return;
      view.choice = (view.choice + step + count) % count;
      render();
    },

    close() {
      root.hidden = true;
    },

    dispose() {
      root.remove();
    },
  };

  function render() {
    const rows = [];
    view.items.forEach((item, index) => {
      const row = element(document, 'div', 'economy-shop-row');
      if (index === view.index) row.dataset.selected = '';
      if (!item.available) row.dataset.unavailable = '';
      const label = element(document, 'span', 'economy-shop-label');
      label.textContent = item.label;
      const price = element(document, 'span', 'economy-shop-price');
      price.textContent = item.note || (item.price > 0 ? `$${item.price.toLocaleString('en-US')}` : 'Free');
      const detail = element(document, 'span', 'economy-shop-detail');
      detail.textContent = item.detail ?? '';
      row.append(label, price, detail);
      if (item.choices?.length) {
        const swatches = element(document, 'div', 'economy-shop-swatches');
        item.choices.forEach((colour, choice) => {
          const swatch = element(document, 'span', 'economy-shop-swatch');
          swatch.style.background = colour;
          if (index === view.index && choice === view.choice) swatch.dataset.selected = '';
          swatches.append(swatch);
        });
        row.append(swatches);
      }
      rows.push(row);
    });
    list.replaceChildren(...rows);
    rows[view.index]?.scrollIntoView?.({ block: 'nearest' });
  }

  return menu;
}

function element(document, tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
