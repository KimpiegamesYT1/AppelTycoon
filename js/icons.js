// Eenvoudige SVG-iconen in plaats van emoji's.

const LINE = {
  factory: '<path d="M3 21V9l6 4V9l6 4V5h4v16z"/><path d="M7 17h2M13 17h2"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
  expand: '<path d="M3 21V10l9-6 9 6v11"/><path d="M12 11v6M9 14h6"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/>',
  star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8C10 4 6 4 6 6.5S10 8 12 8zm0 0c2-4 6-4 6-1.5S14 8 12 8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sparkle: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" fill="currentColor"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="M8.5 10 6 3h4l2 5 2-5h4l-2.5 7"/>',
};

const APPLE = (c) => `<path d="M12 7c-2-1.5-7-1.5-7.5 4S8 21 10 21c1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 6-5 5.5-10S14 5.5 12 7z" fill="${c}"/><path d="M12 7c0-2 .5-3.5 2-4.5" stroke="#7a4b2a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13 4.5c1.5-1.5 4-1.5 5-.5-1.2 1.5-3.6 1.8-5 .5z" fill="#5dbb4c"/>`;

const GLYPH = {
  orchard: '<rect x="10.5" y="13" width="3" height="8" rx="1" fill="#8a5a33"/><circle cx="12" cy="9" r="7" fill="#5dbb4c"/><circle cx="9" cy="8" r="1.4" fill="#e53935"/><circle cx="14.5" cy="11" r="1.4" fill="#e53935"/><circle cx="13" cy="5.8" r="1.4" fill="#e53935"/>',
  sales: '<rect x="2" y="6" width="12" height="10" rx="1.5" fill="#f4f1ea" stroke="#c9c2b5"/><path d="M14 9h4l3 3.5V16h-7z" fill="#d9473b"/><circle cx="6" cy="17.5" r="2" fill="#2b2f3a"/><circle cx="17" cy="17.5" r="2" fill="#2b2f3a"/><circle cx="8" cy="11" r="2.2" fill="#e53935"/>',
  fresh: APPLE('#e53935'),
  // gouden appel met donkere rand en glans, zodat hij ook op een lichte of gele ondergrond opvalt
  gold: '<path d="M12 7c-2-1.5-7-1.5-7.5 4S8 21 10 21c1 0 1.3-.5 2-.5s1 .5 2 .5c2 0 6-5 5.5-10S14 5.5 12 7z" fill="#ffc928" stroke="#b77900" stroke-width="1.3" stroke-linejoin="round"/>'
    + '<path d="M7.3 10.5c.3-1.6 1.3-2.4 2.4-2.6" stroke="#fff6cf" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
    + '<path d="M12 7c0-2 .5-3.5 2-4.5" stroke="#7a4b2a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M13 4.5c1.5-1.5 4-1.5 5-.5-1.2 1.5-3.6 1.8-5 .5z" fill="#5dbb4c"/>',
  juice: '<path d="M7 7h10v14H7z" fill="#f7d046"/><path d="M7 7l2-3h6l2 3z" fill="#e5b92e"/><rect x="7" y="12" width="10" height="4" fill="#5dbb4c"/><path d="M14 4V1.5h2.5" stroke="#d9473b" stroke-width="1.5" fill="none"/>',
  sauce: '<rect x="6" y="8" width="12" height="13" rx="2.5" fill="#f6e7b0" stroke="#e2cf8f"/><rect x="5.5" y="4.5" width="13" height="4" rx="1" fill="#d9473b"/><circle cx="12" cy="14.5" r="2.5" fill="#e53935"/>',
  chips: '<path d="M6 5h12l-1 16H7z" fill="#e8a33d"/><path d="M5.5 3h13v3h-13z" fill="#d9473b"/><ellipse cx="12" cy="13" rx="3" ry="2.2" fill="#fbe3b0"/>',
  pie: '<ellipse cx="12" cy="15" rx="9" ry="4.5" fill="#a8672e"/><ellipse cx="12" cy="13" rx="9" ry="4.5" fill="#d9a35b"/><path d="M7 12.5l3 1M11 11.5l3 1.2M15 12l2.5 1" stroke="#a8672e" stroke-width="1.2" stroke-linecap="round"/>',
  cider: '<path d="M10 2h4v5l2 3v11H8V10l2-3z" fill="#6b9e2f"/><rect x="8" y="12" width="8" height="5" fill="#f4e3b5"/><rect x="10" y="1.5" width="4" height="2" fill="#ffc43d"/>',
  syrup: '<rect x="6" y="8" width="12" height="13" rx="2.5" fill="#7a3b1d"/><rect x="5.5" y="4.5" width="13" height="4" rx="1" fill="#ffc43d"/><rect x="8.5" y="12" width="7" height="5" rx="1" fill="#f4e3b5"/>',
  candy: '<path d="M12 12v10" stroke="#c68e57" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="9" r="6.5" fill="#c0392b"/><path d="M8.5 7a4 4 0 0 1 3-2.5" stroke="#ff8a80" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
};

// Lijn-icoon in de huidige tekstkleur.
export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE[name] || ''}</svg>`;
}

// Gekleurd plaatje voor een station of product.
export function glyph(id, cls = '') {
  return `<svg class="gl ${cls}" viewBox="0 0 24 24" aria-hidden="true">${GLYPH[id] || ''}</svg>`;
}

// Icoon bij een station: { kind, i } of een product-id.
export function stationGlyph(st, lines) {
  if (st.kind === 'orchard') return glyph('orchard');
  if (st.kind === 'sales') return glyph('sales');
  return glyph(lines[st.i].id);
}
