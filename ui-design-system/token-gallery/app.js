const galleryData = window.UI_TOKEN_GALLERY;

const state = {
  layer: "Primitive",
  query: "",
  category: "All",
  collection: "All",
};

const layerMeta = {
  Primitive: { index: "01", title: "Colors & Primitive Tokens", noun: "tokens" },
  Semantic: { index: "02", title: "Semantic Tokens & Typography", noun: "tokens" },
  Component: { index: "03", title: "Components", noun: "components" },
};

const els = {
  layerTabs: document.querySelector("#layerTabs"),
  surfaceIndex: document.querySelector("#surfaceIndex"),
  surfaceTitle: document.querySelector("#surfaceTitle"),
  categoryList: document.querySelector("#categoryList"),
  collectionDropdown: document.querySelector("#collectionDropdown"),
  collectionTrigger: document.querySelector("#collectionTrigger"),
  collectionValue: document.querySelector("#collectionValue"),
  collectionMenu: document.querySelector("#collectionMenu"),
  searchInput: document.querySelector("#searchInput"),
  resultCount: document.querySelector("#resultCount"),
  tokenGrid: document.querySelector("#tokenGrid"),
  traceDialog: document.querySelector("#traceDialog"),
  traceDialogContent: document.querySelector("#traceDialogContent"),
};

const icons = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 6-11 11-5-5"></path></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
};

const semanticTokenOrder = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "background-color",
  "semantic-background",
  "semantic-border",
  "semantic-foreground",
  "radius-none",
  "radius-xs",
  "radius-sm",
  "radius-md",
  "radius-lg",
  "radius-xl",
  "radius-2xl",
  "radius-3xl",
  "radius-4xl",
  "radius-full",
  "stroke-width",
  "border-width",
];

const semanticOrderMap = new Map(semanticTokenOrder.map((name, index) => [name, index]));

// data/ 的資料包是封存範例，不手改（見 06-token-gallery.md）。
// 畫面上的色值與陰影以實際載入的 data/tokens.css 為準；tokens.css 有、資料包沒有的 token 列在這裡。
const PROJECT_TOKENS = {
  Color: [
    "color-bg", "color-surface", "color-primary", "color-accent", "color-text", "color-muted", "color-on-primary",
    "color-violet", "color-orange", "color-amber", "color-green", "color-red", "color-slate",
    "status-positive-bg", "status-positive-fg", "status-pending-bg", "status-pending-fg", "status-warning", "status-hot", "destructive-text",
    "module", "module-leads", "module-leads-text", "module-products", "module-insights",
    "chart-cat-1", "chart-cat-2", "chart-cat-3", "chart-cat-4", "chart-cat-5", "chart-cat-6",
    // --nav-icon 與 --nav-active-bg 預設未設定，沒有值可以顯示，所以不列
    "nav-active-fg", "sidebar-avatar-bg", "sidebar-avatar-fg", "sidebar-avatar-open-bg", "sidebar-avatar-open-fg",
    "stat-icon-pos", "stat-icon-leads", "lead-new-border", "timeline-share", "home-fact", "home-rail-logo-border",
  ],
  Gradient: ["glow-primary", "glow-accent", "glow-empty", "theme-swatch-vivid", "theme-swatch-harbor-sun", "theme-swatch-dark"],
  Stroke: ["nav-icon-stroke"],
  Shadow: ["edge-highlight", "shadow-glow"],
};
const LIVE_VALUE_CATEGORIES = new Set(Object.keys(PROJECT_TOKENS));

init();

function init() {
  if (!galleryData) {
    els.tokenGrid.innerHTML = '<div class="empty-state">Token data missing.</div>';
    return;
  }

  applyLiveTokens();
  mountIcons();
  renderStatic();
  bindEvents();
  render();
}

function applyLiveTokens() {
  for (const [category, names] of Object.entries(PROJECT_TOKENS)) {
    names.forEach((name, index) => galleryData.tokens.push(projectToken(name, category, index)));
  }

  const rootStyle = getComputedStyle(document.documentElement);
  const probe = document.createElement("span");
  probe.hidden = true;
  document.body.append(probe);

  const references = (galleryData.components || []).flatMap((component) => component.referencedTokens || []);
  for (const token of [...galleryData.tokens, ...references]) {
    if (!LIVE_VALUE_CATEGORIES.has(token.category)) continue;
    const declared = rootStyle.getPropertyValue(token.cssVar).trim();
    if (!declared) continue;
    let value = declared;
    if (token.category === "Color") {
      probe.style.color = `var(${token.cssVar})`;
      value = displayColor(getComputedStyle(probe).color);
    }
    token.value = value;
    token.cssLiteral = value;
  }
  probe.remove();
}

function projectToken(name, category, order) {
  return {
    id: `project/${name}`,
    name,
    label: name,
    cssVar: `--${name}`,
    layers: ["Semantic"],
    category,
    type: category === "Color" ? "color" : "effect-style",
    collection: "Seat Arrangement tokens.css",
    collectionFile: "token-gallery/data/tokens.css",
    source: { file: "token-gallery/data/tokens.css", path: [name], order, alias: null },
    provenance: { figma: null, docs: [], visuals: [] },
    sync: { figma: false, spec: false, code: true, visual: false },
  };
}

// 瀏覽器算出來的顏色可能是 rgb() 或 color(srgb …)，統一成 #RRGGBB；有透明度時用 rgba()。
function displayColor(computed) {
  const srgb = computed.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);
  const rgb = computed.match(/^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/);
  const match = srgb || rgb;
  if (!match) return computed;
  const channels = match.slice(1, 4).map((channel) => Math.round(Number(channel) * (srgb ? 255 : 1)));
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (alpha >= 1) return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  return `rgba(${channels.join(", ")}, ${Number(alpha.toFixed(2))})`;
}

function renderStatic() {
  els.layerTabs.innerHTML = galleryData.meta.layers
    .map(
      (layer) => `
        <button class="layer-tab" type="button" role="tab" data-layer="${escapeAttr(layer.name)}" aria-selected="${layer.name === state.layer}">
          <span>${escapeHtml(layer.name)}</span>
          <b>${formatNumber(itemsForLayerName(layer.name).length)}</b>
        </button>
      `,
    )
    .join("");
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    render();
  });

  els.collectionTrigger.addEventListener("click", () => {
    const isOpen = !els.collectionDropdown.classList.contains("is-open");
    setCollectionMenuOpen(isOpen);
  });

  els.collectionMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-collection]");
    if (!option) return;
    state.collection = option.dataset.collection;
    setCollectionMenuOpen(false);
    render();
  });

  els.layerTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-layer]");
    if (!button) return;
    state.layer = button.dataset.layer;
    state.category = "All";
    state.collection = "All";
    closeDialog();
    render();
  });

  els.categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    render();
  });

  els.tokenGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-item-id]");
    if (!card) return;
    openDialog(card.dataset.itemId);
  });

  els.tokenGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-item-id]");
    if (!card) return;
    event.preventDefault();
    openDialog(card.dataset.itemId);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#collectionDropdown")) {
      setCollectionMenuOpen(false);
    }

    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
      copyToClipboard(copyButton.dataset.copy, copyButton);
      return;
    }
  });

  els.traceDialog.addEventListener("click", (event) => {
    if (event.target === els.traceDialog || event.target.closest("[data-close-dialog]")) {
      closeDialog();
      return;
    }
    const linkedToken = event.target.closest(".dialog-token-grid [data-item-id]");
    if (linkedToken) {
      openDialog(linkedToken.dataset.itemId);
      return;
    }
    handlePreviewInteraction(event);
  });

}

function setCollectionMenuOpen(isOpen) {
  els.collectionDropdown.classList.toggle("is-open", isOpen);
  els.collectionTrigger.setAttribute("aria-expanded", String(isOpen));
}

function render() {
  const layerItems = itemsForLayer();
  normalizeFilters(layerItems);
  renderCategoryList(layerItems);
  renderCollectionOptions(layerItems);
  const filtered = filteredItems(layerItems);
  updateLayerTabs();
  renderSections(filtered, layerItems.length);
}

function itemsForLayer() {
  return itemsForLayerName(state.layer);
}

function itemsForLayerName(layerName) {
  if (layerName === "Component") return galleryData.components || [];
  if (layerName === "Primitive") {
    return galleryData.tokens.filter((token) => token.layers.includes("Primitive") && token.type !== "text-style");
  }
  if (layerName === "Semantic") {
    return galleryData.tokens.filter((token) => token.layers.includes("Semantic") || token.type === "text-style");
  }
  return galleryData.tokens.filter((token) => token.layers.includes(layerName));
}

function normalizeFilters(layerItems) {
  const categories = new Set(layerItems.map((item) => item.category));
  const collections = new Set(layerItems.map((item) => item.collection));
  if (state.category !== "All" && !categories.has(state.category)) state.category = "All";
  if (state.collection !== "All" && !collections.has(state.collection)) state.collection = "All";
}

function renderCategoryList(layerItems) {
  const categoryCounts = new Map();
  for (const item of layerItems) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
  }

  const categories = [
    { name: "All", count: layerItems.length },
    ...galleryData.meta.categories
      .map((category) => ({
        name: category.name,
        count: categoryCounts.get(category.name) || 0,
      }))
      .filter((category) => category.count > 0),
    ...[...categoryCounts.entries()]
      .filter(([name]) => !galleryData.meta.categories.some((category) => category.name === name))
      .map(([name, count]) => ({ name, count })),
  ];

  els.categoryList.innerHTML = categories
    .map(
      (category) => `
        <button class="segmented-button" type="button" data-category="${escapeAttr(category.name)}" aria-pressed="${category.name === state.category}">
          <span>${escapeHtml(category.name)}</span>
          <b class="segmented-count">${formatNumber(category.count)}</b>
        </button>
      `,
    )
    .join("");
}

function renderCollectionOptions(layerItems) {
  const collectionCounts = new Map();
  for (const item of layerItems) {
    collectionCounts.set(item.collection, (collectionCounts.get(item.collection) || 0) + 1);
  }

  const collections = [
    { label: "All", count: layerItems.length },
    ...galleryData.meta.collections
      .map((collection) => ({
        label: collection.label,
        count: collectionCounts.get(collection.label) || 0,
      }))
      .filter((collection) => collection.count > 0),
    ...[...collectionCounts.entries()]
      .filter(([label]) => !galleryData.meta.collections.some((collection) => collection.label === label))
      .map(([label, count]) => ({ label, count })),
  ];

  const activeCollection = collections.find((collection) => collection.label === state.collection) || collections[0];
  els.collectionValue.textContent =
    activeCollection.label === "All"
      ? `All (${formatNumber(activeCollection.count)})`
      : `${activeCollection.label} (${formatNumber(activeCollection.count)})`;

  els.collectionMenu.innerHTML = collections
    .map((collection) => {
      const value = collection.label;
      const text =
        value === "All" ? `All (${formatNumber(collection.count)})` : `${collection.label} (${formatNumber(collection.count)})`;
      return `<button class="ds-dropdown-item" type="button" role="option" data-collection="${escapeAttr(value)}" aria-selected="${value === state.collection}">${escapeHtml(text)}</button>`;
    })
    .join("");
}

function filteredItems(baseItems = itemsForLayer()) {
  const query = state.query.toLowerCase();
  return baseItems.filter((item) => {
    if (state.category !== "All" && item.category !== state.category) return false;
    if (state.collection !== "All" && item.collection !== state.collection) return false;
    if (!query) return true;
    return searchableText(item).includes(query);
  });
}

function searchableText(item) {
  return [
    item.name,
    item.label,
    item.cssVar,
    item.summary,
    ...(item.layers || []),
    item.category,
    item.collection,
    item.value,
    item.source?.file,
    item.source?.figmaVariableId,
    item.source?.alias?.targetVariableName,
    ...(item.referencedTokens || []).map((token) => `${token.cssVar} ${token.value}`),
    ...(item.provenance.docs || []).map((doc) => doc.excerpt),
    ...(item.provenance.visuals || []).map((visual) => visual.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function updateLayerTabs() {
  const meta = layerMeta[state.layer] || layerMeta.Primitive;
  els.layerTabs.querySelectorAll("[data-layer]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.layer === state.layer));
  });
  els.surfaceIndex.textContent = meta.index;
  els.surfaceTitle.textContent = meta.title;
}

function renderSections(items, layerTotal) {
  const meta = layerMeta[state.layer] || layerMeta.Primitive;
  els.resultCount.textContent = `${formatNumber(items.length)} ${meta.noun} shown of ${formatNumber(layerTotal)} in ${state.layer}`;

  if (!items.length) {
    els.tokenGrid.innerHTML = '<div class="empty-state">No items match.</div>';
    closeDialog();
    return;
  }

  if (state.layer === "Primitive") {
    els.tokenGrid.innerHTML = renderPrimitiveSections(items);
  } else if (state.layer === "Semantic") {
    els.tokenGrid.innerHTML = renderSemanticSections(items);
  } else {
    els.tokenGrid.innerHTML = renderComponentSections(items);
  }
}

function renderPrimitiveSections(items) {
  const colorTokens = sortByShade(items.filter((token) => token.category === "Color"));
  const sections = [];

  if (colorTokens.length) {
    sections.push(`
      <section class="gallery-section">
        <div class="section-heading">
          <span>01</span>
          <h3>Colors</h3>
        </div>
        <div class="palette-group">
          <h4>Neutral</h4>
          <div class="palette-row">
            ${colorTokens.map(renderPaletteSwatch).join("")}
          </div>
        </div>
      </section>
    `);
  }

  const categoryOrder = ["Typography", "Spacing", "Radius", "Border", "Stroke", "Opacity", "Shadow", "Primitive"];
  const remaining = items.filter((token) => token.category !== "Color");
  for (const category of categoryOrder) {
    const group = remaining.filter((token) => token.category === category);
    if (!group.length) continue;
    sections.push(renderTokenSection(category, group, { compact: category === "Spacing" || category === "Radius" }));
  }

  return sections.join("");
}

function renderSemanticSections(items) {
  const groups = semanticGroups(items);
  return groups
    .map((group, index) => {
      const groupContent =
        group.renderer === "typography"
          ? `<div class="typography-card-grid">${group.items.map(renderTypographyCard).join("")}</div>`
          : `<div class="semantic-grid">${group.items.map(renderSemanticCard).join("")}</div>`;
      return `
        <section class="gallery-section semantic-section">
          <div class="section-heading">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <h3>${escapeHtml(group.name)}</h3>
          </div>
          ${groupContent}
        </section>
      `;
    })
    .join("");
}

function renderComponentSections(items) {
  return `
    <section class="gallery-section component-section">
      <div class="section-heading">
        <span>03</span>
        <h3>Component Preview</h3>
      </div>
      <div class="component-gallery">
        ${items.map(renderComponentCard).join("")}
      </div>
    </section>
  `;
}

function renderTokenSection(title, tokens, options = {}) {
  const sorted = sortTokens(tokens);
  if (title === "Typography") {
    return renderTypographySection(title, sorted);
  }
  return `
    <section class="gallery-section">
      <div class="section-heading">
        <span>${escapeHtml(categoryIndex(title))}</span>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="token-card-grid${options.compact ? " is-compact" : ""}">
        ${sorted.map(renderTokenMiniCard).join("")}
      </div>
    </section>
  `;
}

function renderTypographySection(title, tokens) {
  const textStyles = tokens.filter((token) => token.type === "text-style");
  const otherTokens = tokens.filter((token) => token.type !== "text-style");
  return `
    <section class="gallery-section typography-section">
      <div class="section-heading">
        <span>${escapeHtml(categoryIndex(title))}</span>
        <h3>${escapeHtml(title)}</h3>
      </div>
      ${textStyles.length
      ? `<div class="typography-card-grid">${textStyles.map(renderTypographyCard).join("")}</div>`
      : ""
    }
      ${otherTokens.length
      ? `<div class="token-card-grid is-compact">${otherTokens.map(renderTokenMiniCard).join("")}</div>`
      : ""
    }
    </section>
  `;
}

function renderTypographyCard(token) {
  const style = token.rawValue || {};
  const size = parsePx(style.fontSize || token.value);
  const line = parsePx(style.lineHeight || token.value);
  const height = clamp(line + 32, 72, 184);
  return `
    <button class="typography-card gallery-card" type="button" data-item-id="${escapeAttr(token.id)}">
      <span class="typography-sample" style="--font-size:${escapeAttr(style.fontSize || "16px")};--line-height:${escapeAttr(style.lineHeight || "24px")};--font-weight:${escapeAttr(style.fontWeight || "400")};--sample-height:${height}px">
        Great Design Only
      </span>
      <span class="typography-card-main">
        <strong>${escapeHtml(token.name)}</strong>
        <span>${escapeHtml(style.fontSize || "")} / ${escapeHtml(style.lineHeight || "")} · ${escapeHtml(style.fontWeight || "")}</span>
      </span>
    </button>
  `;
}

function renderPaletteSwatch(token) {
  const shade = token.name.split("/").pop();
  const swatchValue = token.cssLiteral || token.value;
  return `
    <button class="palette-swatch gallery-card" type="button" data-item-id="${escapeAttr(token.id)}" style="--swatch:${escapeAttr(swatchValue)};--swatch-text:${swatchTextColor(swatchValue)}">
      <span>${escapeHtml(shade)}</span>
      <b>${escapeHtml(token.value)}</b>
    </button>
  `;
}

function swatchTextColor(value) {
  const rgb = colorToRgb(value);
  if (!rgb) return "var(--foreground)";
  const relativeLuminance = rgb
    .map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    })
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return relativeLuminance < 0.5 ? "var(--background)" : "var(--foreground)";
}

function colorToRgb(value) {
  const text = String(value || "").trim();
  const hexMatch = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1].length === 3
      ? hexMatch[1].split("").map((char) => `${char}${char}`).join("")
      : hexMatch[1];
    return [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16));
  }
  const rgbMatch = text.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  return rgbMatch ? rgbMatch.slice(1).map((channel) => Math.max(0, Math.min(255, Number(channel)))) : null;
}

function renderTokenMiniCard(token) {
  return `
    <button class="token-mini-card gallery-card" type="button" data-item-id="${escapeAttr(token.id)}">
      ${renderPreview(token)}
      <span class="token-card-main">
        <strong>${escapeHtml(shortTokenName(token))}</strong>
        <span>${escapeHtml(token.value)}</span>
      </span>
    </button>
  `;
}

function renderSemanticCard(token) {
  const preview = token.category === "Color"
    ? `<span class="semantic-swatch" style="--swatch:${escapeAttr(token.cssLiteral || token.value)}"></span>`
    : `<span class="semantic-token-preview">${renderPreview(token)}</span>`;
  return `
    <button class="semantic-card gallery-card" type="button" data-item-id="${escapeAttr(token.id)}">
      ${preview}
      <strong>${escapeHtml(token.name)}</strong>
      <span>${escapeHtml(token.value)}</span>
    </button>
  `;
}

function renderComponentCard(component) {
  const references = component.referencedTokens.slice(0, 5);
  return `
    <article class="component-card gallery-card" data-item-id="${escapeAttr(component.id)}" tabindex="0" aria-label="${escapeAttr(component.name)} component trace">
      ${renderComponentCardPreview(component)}
      <div class="component-card-body">
        <div>
          <strong>${escapeHtml(component.name)}</strong>
          <span>${escapeHtml(component.value)}</span>
        </div>
        <p>${escapeHtml(component.summary)}</p>
        <div class="linked-token-strip">
          ${references.map(renderReferencedTokenChip).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderComponentCardPreview(component) {
  return `
    <div class="component-static-preview is-${escapeAttr(toClassName(component.name))}">
      ${componentCardPreviewMarkup(component.name)}
    </div>
  `;
}

function renderReferencedTokenChip(token) {
  const style = token.category === "Color" ? ` style="--chip:${escapeAttr(token.cssLiteral || token.value)}"` : "";
  return `<span class="token-chip"${style}>${escapeHtml(shortCssName(token.cssVar))}</span>`;
}

function renderComponentPreview(component) {
  return `<div class="component-stage" data-component="${escapeAttr(component.name)}">${componentPreviewMarkup(component.name)}</div>`;
}

function openDialog(itemId) {
  const item = findItem(itemId);
  if (!item) return;
  const wasOpen = els.traceDialog.open;
  els.traceDialogContent.innerHTML = renderDialogContent(item);
  mountIcons(els.traceDialogContent);
  if (wasOpen) return;
  if (typeof els.traceDialog.showModal === "function") {
    els.traceDialog.showModal();
  } else {
    els.traceDialog.setAttribute("open", "");
  }
}

function closeDialog() {
  if (!els.traceDialog.open) return;
  els.traceDialog.close();
}

function renderDialogContent(item) {
  return item.type === "component" ? renderComponentDialog(item) : renderTokenDialog(item);
}

function renderTokenDialog(token) {
  const alias = token.source?.alias;
  const figma = token.provenance?.figma;
  const chain = [
    token.value,
    alias ? alias.targetVariableName : token.collection,
    token.cssVar,
    token.category,
  ].filter(Boolean);

  return `
    <header class="trace-dialog-header">
      <div>
        <p>Token Trace</p>
        <h2 id="traceDialogTitle">${escapeHtml(shortTokenName(token))}</h2>
        <span>${escapeHtml(token.cssVar)} · ${escapeHtml(token.category)} · ${escapeHtml(token.collection)}</span>
      </div>
      <button class="icon-button" type="button" data-close-dialog aria-label="Close dialog" title="Close dialog"><span data-icon="x"></span></button>
    </header>

    <div class="trace-dialog-grid">
      <section class="dialog-preview-panel">
        <h3>Preview</h3>
        <div class="dialog-token-preview">${renderPreview(token)}</div>
      </section>

      <section class="dialog-trace-panel">
        <h3>Inheritance</h3>
        <div class="trace-chain">
          ${chain.map((step) => `<span>${escapeHtml(step)}</span>`).join("<i></i>")}
        </div>
      </section>
    </div>

    <section class="dialog-section">
      <h3>Source Map</h3>
      <div class="trace-meta">
        ${traceMeta("Figma", figma?.area ?? token.source?.file)}
        ${traceMeta("Spec", token.provenance.docs.length ? `${token.provenance.docs.length} refs` : "Unlinked")}
        ${traceMeta("CSS", token.cssLiteral)}
        ${traceMeta("Visual", token.provenance.visuals.length ? `${token.provenance.visuals.length} refs` : "Unlinked")}
      </div>
    </section>

    <section class="dialog-section">
      <h3>Code</h3>
      <div class="dialog-code-row">
        <pre><code>${escapeHtml(`${token.cssVar}: ${token.cssLiteral};`)}</code></pre>
        <button class="icon-button" type="button" data-copy="${escapeAttr(`${token.cssVar}: ${token.cssLiteral};`)}" aria-label="Copy CSS declaration" title="Copy CSS declaration">
          <span data-icon="copy"></span>
        </button>
      </div>
    </section>

    ${renderDialogDocs(token.provenance.docs)}
    ${renderDialogVisuals(token.provenance.visuals)}
  `;
}

function renderComponentDialog(component) {
  const figma = component.provenance?.figma;
  return `
    <header class="trace-dialog-header">
      <div>
        <p>Component Trace</p>
        <h2 id="traceDialogTitle">${escapeHtml(component.name)}</h2>
        <span>${escapeHtml(component.collection)} · ${escapeHtml(component.value)}</span>
      </div>
      <button class="icon-button" type="button" data-close-dialog aria-label="Close dialog" title="Close dialog"><span data-icon="x"></span></button>
    </header>

    <section class="dialog-section">
      <h3>Interactive States</h3>
      <div class="component-dialog-stage" data-component="${escapeAttr(component.name)}">
        ${componentDialogMarkupV2(component.name)}
      </div>
    </section>

    <section class="dialog-section">
      <h3>Trace</h3>
      <div class="trace-chain">
        <span>${escapeHtml(component.source.file)}</span>
        <i></i>
        <span>${formatNumber(component.referencedTokens.length)} referenced tokens</span>
        <i></i>
        <span>${component.provenance.visuals.length ? "visual linked" : "visual unlinked"}</span>
      </div>
      <div class="trace-meta">
        ${traceMeta("Figma", figma?.area ?? "Unlinked")}
        ${traceMeta("Spec", `${component.source.file}:${component.source.line}`)}
        ${traceMeta("Tokens", `${component.referencedTokens.length} refs`)}
        ${traceMeta("Visual", component.provenance.visuals.length ? `${component.provenance.visuals.length} refs` : "Unlinked")}
      </div>
    </section>

    <section class="dialog-section">
      <h3>Referenced Tokens</h3>
      <div class="dialog-token-grid">
        ${component.referencedTokens.length
      ? component.referencedTokens.map(renderReferencedTokenCard).join("")
      : '<div class="empty-state">No direct token references.</div>'
    }
      </div>
    </section>

    ${renderDialogDocs(component.provenance.docs)}
    ${renderDialogVisuals(component.provenance.visuals)}
  `;
}

function traceMeta(label, value) {
  return `<span><b>${escapeHtml(label)}</b>${escapeHtml(value || "Unlinked")}</span>`;
}

function renderReferencedTokenCard(token) {
  return `
    <button class="token-mini-card gallery-card" type="button" data-item-id="${escapeAttr(token.id)}">
      ${renderPreview(token)}
      <span class="token-card-main">
        <strong>${escapeHtml(shortCssName(token.cssVar))}</strong>
        <span>${escapeHtml(token.value)} · ${escapeHtml(token.category)}</span>
      </span>
    </button>
  `;
}

function renderDialogDocs(docs) {
  return `
    <section class="dialog-section">
      <h3>Spec Links</h3>
      <div class="dialog-list">
        ${docs.length
      ? docs.map((doc) => `
                <div class="dialog-list-row">
                  <strong>${escapeHtml(doc.heading || doc.file)}</strong>
                  <span>${escapeHtml(doc.file)}:${doc.line}</span>
                  <p>${escapeHtml(doc.excerpt)}</p>
                </div>
              `).join("")
      : '<div class="dialog-list-row"><strong>Unlinked</strong><span>No direct markdown line.</span></div>'
    }
      </div>
    </section>
  `;
}

function renderDialogVisuals(visuals) {
  return `
    <section class="dialog-section">
      <h3>Visual Sources</h3>
      <div class="dialog-visual-grid">
        ${visuals.length
      ? visuals.map((visual) => `
                <a class="dialog-visual-card" href="${escapeAttr(visual.figmaUrl || visual.path || "#")}" target="_blank" rel="noreferrer">
                  ${visual.path ? `<img src="${escapeAttr(visual.path)}" alt="${escapeAttr(visual.label)}" loading="lazy" />` : ""}
                  <span>${escapeHtml(visual.label)}${visual.nodeId ? ` · ${escapeHtml(visual.nodeId)}` : ""}</span>
                </a>
              `).join("")
      : '<div class="dialog-list-row"><strong>Unlinked</strong><span>No screenshot mapping.</span></div>'
    }
      </div>
    </section>
  `;
}

function handlePreviewInteraction(event) {
  const dropdownTrigger = event.target.closest(".ds-dropdown-trigger");
  if (dropdownTrigger) {
    const sample = dropdownTrigger.closest(".ds-dropdown-sample");
    const isOpen = !sample.classList.contains("is-open");
    sample.classList.toggle("is-open", isOpen);
    dropdownTrigger.setAttribute("aria-expanded", String(isOpen));
    return;
  }

  const dropdownItem = event.target.closest(".ds-dropdown-item");
  if (dropdownItem) {
    if (dropdownItem.closest('[role="menu"]')) {
      return;
    }
    const sample = dropdownItem.closest(".ds-dropdown-sample");
    sample?.querySelectorAll(".ds-dropdown-item").forEach((item) => {
      item.removeAttribute("aria-selected");
      item.classList.remove("has-check");
      item.querySelector(".ds-select-check")?.remove();
    });
    dropdownItem.setAttribute("aria-selected", "true");
    dropdownItem.classList.add("has-check");
    dropdownItem.insertAdjacentHTML("beforeend", `<span class="ds-select-check">${componentSvgIcon("check")}</span>`);
    const value = sample?.querySelector(".ds-dropdown-value");
    const label = dropdownItem.querySelector("span:not(.ds-select-check)")?.textContent.trim() || dropdownItem.textContent.trim();
    if (value) value.textContent = label;
    return;
  }

  const sidebarItem = event.target.closest(".ds-sidebar-preview nav button");
  if (sidebarItem) {
    const nav = sidebarItem.closest("nav");
    nav.querySelectorAll("button").forEach((button) => button.classList.remove("is-active"));
    sidebarItem.classList.add("is-active");
    return;
  }

  const tabButton = event.target.closest(".ds-tabs button, .ds-line-tabs button, .ds-pagination button");
  if (!tabButton) return;
  const group = tabButton.closest(".ds-tabs, .ds-line-tabs, .ds-pagination");
  group.querySelectorAll("button").forEach((button) => {
    button.removeAttribute("aria-selected");
    button.removeAttribute("aria-current");
  });
  if (group.classList.contains("ds-pagination")) {
    tabButton.setAttribute("aria-current", "page");
  } else {
    tabButton.setAttribute("aria-selected", "true");
  }
}

function semanticGroups(items) {
  const buckets = [
    { name: "Project Palette", test: (token) => /^color-/.test(token.name), items: [] },
    { name: "Base Surface & Text", test: (token) => /^(background|foreground|card|card-foreground|popover|popover-foreground|muted|muted-foreground)$/.test(token.name), items: [] },
    { name: "Brand & Action", test: (token) => /^(primary|primary-foreground|secondary|secondary-foreground|accent|accent-foreground|destructive)$/.test(token.name), items: [] },
    { name: "Status", test: (token) => /^(status-.+|destructive-text)$/.test(token.name), items: [] },
    { name: "Work Areas", test: (token) => /^module(-.+)?$/.test(token.name), items: [] },
    { name: "Form & Data", test: (token) => /^(border|input|ring|chart-[1-5])$/.test(token.name), items: [] },
    { name: "Chart Categories", test: (token) => /^chart-cat-/.test(token.name), items: [] },
    { name: "Sidebar", test: (token) => /^sidebar/.test(token.name), items: [] },
    { name: "Palette Details", test: (token) => /^(nav-.+|stat-icon-.+|lead-new-border|timeline-share|home-fact|home-rail-logo-border|theme-swatch-.+)$/.test(token.name), items: [] },
    { name: "Semantic Overlay", test: (token) => /^(background-color|semantic-background|semantic-border|semantic-foreground)$/.test(token.name), items: [] },
    { name: "Glow & Highlight", test: (token) => /^(glow-.+|edge-highlight|shadow-glow)$/.test(token.name), items: [] },
    { name: "Typography Recipes", renderer: "typography", test: (token) => token.type === "text-style", items: [] },
    { name: "Radius", test: (token) => /^radius-/.test(token.name), items: [] },
    { name: "Stroke & Border Width", test: (token) => /^(stroke-width|border-width)$/.test(token.name), items: [] },
    { name: "Other", test: () => true, items: [] },
  ];

  for (const token of sortSemanticTokens(items)) {
    const bucket = buckets.find((group) => group.test(token));
    bucket.items.push(token);
  }

  return buckets.filter((group) => group.items.length);
}

function findItem(id) {
  return (
    galleryData.tokens.find((token) => token.id === id) ||
    (galleryData.components || []).find((component) => component.id === id)
  );
}

function sortTokens(tokens) {
  return [...tokens].sort((a, b) => {
    if (a.type === "text-style" && b.type === "text-style") {
      return sourceOrder(a) - sourceOrder(b);
    }
    const aShade = shadeNumber(a.name);
    const bShade = shadeNumber(b.name);
    if (aShade !== bShade) return aShade - bShade;
    const orderDelta = sourceOrder(a) - sourceOrder(b);
    if (orderDelta !== 0 && a.collectionFile === b.collectionFile) return orderDelta;
    return (a.cssVar || a.name).localeCompare(b.cssVar || b.name);
  });
}

function sortSemanticTokens(tokens) {
  return [...tokens].sort((a, b) => semanticIndex(a) - semanticIndex(b));
}

function semanticIndex(token) {
  if (token.type === "text-style") return semanticTokenOrder.length + sourceOrder(token);
  return semanticOrderMap.get(token.name) ?? sourceOrder(token);
}

function sourceOrder(token) {
  return Number.isFinite(token.source?.order) ? token.source.order : Number.MAX_SAFE_INTEGER;
}

function sortByShade(tokens) {
  return [...tokens].sort((a, b) => shadeNumber(a.name) - shadeNumber(b.name));
}

function shadeNumber(name) {
  const match = String(name).match(/(?:^|\/|-)(\d{1,4})$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function categoryIndex(category) {
  const order = ["Color", "Typography", "Spacing", "Radius", "Border", "Stroke", "Opacity", "Shadow", "Primitive"];
  const index = order.indexOf(category);
  return String(index === -1 ? order.length + 1 : index + 1).padStart(2, "0");
}

function shortTokenName(token) {
  return token.name?.replaceAll("/", "-") || shortCssName(token.cssVar);
}

function shortCssName(cssVar) {
  return String(cssVar || "").replace(/^--/, "");
}

function componentCardPreviewMarkup(name) {
  const icon = componentIcon;
  switch (name) {
    case "Button":
      return `<div class="ds-card-preview-row"><button class="ds-button ds-button-primary" type="button">${icon("+")}Button</button><button class="ds-button ds-button-outline" type="button">Button</button></div>`;
    case "Icon Button":
      return `<div class="ds-card-preview-row ds-center">${["primary", "secondary", "outline", "ghost"].map((variant) => `<button class="ds-icon-button ds-icon-button-md ds-button-${variant}" type="button" aria-label="${variant}">${icon("×")}</button>`).join("")}</div>`;
    case "Input":
      return `<label class="ds-field"><span>Label</span><span class="ds-input-with-button"><input value="Email" aria-label="Email preview" /><button class="ds-button ds-button-primary ds-button-sm" type="button">Submit</button></span></label>`;
    case "Checkbox":
      return `<div class="ds-checkbox-strip">${checkboxBox("unchecked")} ${checkboxBox("mixed")} ${checkboxBox("checked")}</div>`;
    case "Badge":
      return badgeStrip();
    case "Dropdown Menu":
      return actionMenuSample();
    case "Tabs":
      return `<div class="ds-tabs" role="tablist"><button type="button" aria-selected="true">Label</button><button type="button">Label</button><button type="button">Label</button></div><div class="ds-line-tabs" role="tablist"><button type="button" aria-selected="true">Label</button><button type="button">Label</button></div>`;
    case "Pagination":
      return `<div class="ds-pagination-wrap"><span>第 1-10 列，共 99 列</span><nav class="ds-pagination"><button type="button">‹</button><button type="button" aria-current="page">1</button><button type="button">2</button><b>...</b><button type="button">›</button></nav></div>`;
    case "Scrollbar":
      return `<div class="ds-scrollbar-area ds-scrollbar-area--default" tabindex="0"><div class="ds-scrollbar-filler">Scrollable card<br/><br/>Item 001<br/>Item 002<br/>Item 003<br/>Item 004<br/>Item 005</div></div>`;
    case "Sidebar":
      return sidebarPreview("expanded", { preview: "card" });
    case "Header / App Shell Block":
      return headerPreview();
    case "Dialog":
      return `<div class="ds-dialog-preview is-card-preview"><button class="ds-icon-button ds-button-ghost" type="button" aria-label="Close">${icon("×")}</button><strong>變更密碼</strong><input value="••••••••" aria-label="Password preview" /><div class="ds-row ds-actions-right"><button class="ds-button ds-button-primary" type="button">確認</button></div></div>`;
    case "Alert Dialog":
      return `<div class="ds-alert-dialog-preview"><strong>警告對話框標題</strong><p>這是一段內文。</p><div class="ds-row ds-actions-right"><button class="ds-button ds-button-outline" type="button">取消</button><button class="ds-button ds-button-primary" type="button">繼續</button></div></div>`;
    case "Alert":
      return alertCardSimple();
    case "Sonner / Toast":
      return toastSample("action");
    case "Tooltip":
      return `<div class="ds-tooltip-demo is-preview is-top"><button class="ds-icon-button ds-icon-button-md ds-button-outline" type="button" aria-label="Info">${icon("?")}</button><span role="tooltip">Tooltip</span></div>`;
    case "Skeleton":
      return skeletonPreview();
    case "Separator":
      return separatorPreview();
    case "Stat Card":
      return statCard("Completed", "14");
    default:
      return componentPreviewMarkup(name);
  }
}

function componentDialogMarkupV2(name) {
  switch (name) {
    case "Button":
      return buttonMatrix();
    case "Icon Button":
      return iconButtonMatrix();
    case "Input":
      return inputMatrix();
    case "Checkbox":
      return checkboxMatrix();
    case "Badge":
      return badgeShowcase();
    case "Dropdown Menu":
      return dropdownShowcase();
    case "Tabs":
      return tabsShowcase();
    case "Pagination":
      return paginationShowcase();
    case "Scrollbar":
      return scrollbarShowcase();
    case "Sidebar":
      return `<div class="component-state-grid is-sidebar-grid"><section class="component-state-panel"><h4>Collapsed Desktop</h4>${sidebarPreview("collapsed")}</section><section class="component-state-panel"><h4>Expanded Desktop</h4>${sidebarPreview("expanded", { hoverTarget: "menu" })}</section><section class="component-state-panel"><h4>Mobile Drawer</h4>${sidebarPreview("mobile", { hoverTarget: "footer" })}</section></div>`;
    case "Header / App Shell Block":
      return `<div class="component-state-grid is-header-grid"><section class="component-state-panel is-full"><h4>Header</h4>${headerPreview()}</section></div>`;
    case "Dialog":
      return `<div class="component-state-grid is-dialog-grid"><section class="component-state-panel is-full"><h4>Desktop Form Dialog</h4>${dialogPreview()}</section></div>`;
    case "Alert Dialog":
      return alertDialogShowcase();
    case "Alert":
      return alertShowcase();
    case "Sonner / Toast":
      return toastShowcase();
    case "Tooltip":
      return tooltipShowcase();
    case "Skeleton":
      return `<div class="component-state-grid is-skeleton-grid"><section class="component-state-panel"><h4>Line</h4>${skeletonPreview()}</section><section class="component-state-panel"><h4>Card</h4><div class="ds-card-skeleton is-animated"><span></span><span></span><span></span></div></section></div>`;
    case "Separator":
      return separatorShowcase();
    case "Stat Card":
      return `<div class="component-state-grid is-stat-grid"><section class="component-state-panel"><h4>Metric</h4>${statCard("Completed", "14")}</section><section class="component-state-panel"><h4>Trend</h4>${statCard("Completed", "14", "+20% from last period", "On track")}</section></div>`;
    default:
      return componentDialogMarkup(name);
  }
}

function componentIcon(label = "") {
  return `<span class="ds-icon" aria-hidden="true">${escapeHtml(label)}</span>`;
}

function componentSvgIcon(name) {
  const icons = {
    check: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
    minus: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg>',
    listCheck: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 2 2 4-4"></path><path d="M12 7h9"></path><path d="m3 17 2 2 4-4"></path><path d="M12 17h9"></path></svg>',
    info: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7h.01"></path></svg>',
    warning: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path></svg>',
    x: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>',
    loading: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.6-8.68"></path></svg>',
    sparkle: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 14.2 9l5.8 2.2-5.8 2.2L12 19l-2.2-5.6L4 11.2 9.8 9Z"></path><path d="M19 3v4"></path><path d="M17 5h4"></path></svg>',
    chevronLeft: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>',
    chevronRight: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>',
    chevronsLeft: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m11 17-5-5 5-5"></path><path d="m18 17-5-5 5-5"></path></svg>',
    chevronsRight: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 17 5-5-5-5"></path><path d="m13 17 5-5-5-5"></path></svg>',
    trend: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 10 10l4 4 7-7"></path><path d="M14 7h7v7"></path></svg>',
    panel: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M10 3v18"></path></svg>',
    device: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="12" height="9" rx="1.5"></rect><rect x="14" y="10" width="7" height="8" rx="1.5"></rect><path d="M7 19h5"></path></svg>',
    coin: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v8"></path><path d="M9.5 10.5c0-1.2 1-2 2.5-2 1.3 0 2.3.6 2.3 1.7 0 2.6-4.8 1-4.8 3.6 0 1.1 1 1.8 2.5 1.8 1.4 0 2.5-.7 2.5-1.9"></path></svg>',
    calculator: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="12" height="16" rx="1.5"></rect><path d="M9 8h6"></path><path d="M9 12h.01"></path><path d="M12 12h.01"></path><path d="M15 12h.01"></path><path d="M9 16h.01"></path><path d="M12 16h.01"></path><path d="M15 16h.01"></path></svg>',
    clipboard: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 2h2v14H6V6h2Z"></path><path d="M9 10h6"></path><path d="M9 14h6"></path></svg>',
    user: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"></circle><path d="M5 20c1.2-3 3.5-4.5 7-4.5S17.8 17 19 20"></path></svg>',
    chevronUpDown: '<svg class="ds-svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 9 4-4 4 4"></path><path d="m16 15-4 4-4-4"></path></svg>',
  };
  return icons[name] || "";
}

function checkboxBox(state) {
  const mark = state === "checked" ? componentSvgIcon("check") : state === "mixed" ? componentSvgIcon("minus") : "";
  return `<span class="ds-checkbox-box is-${state}" aria-hidden="true">${mark}</span>`;
}

function buttonMatrix() {
  const variants = ["primary", "secondary", "outline", "ghost", "link", "link-secondary"];
  const rows = ["default", "hover", "focus", "disabled", "loading"];
  return `<div class="ds-matrix is-button-matrix"><div></div>${variants.map((variant) => `<b>${escapeHtml(variant)}</b>`).join("")}${rows.map((row) => `<span>${escapeHtml(row)}</span>${variants.map((variant) => buttonSample(variant, row)).join("")}`).join("")}</div>`;
}

function buttonSample(variant, state) {
  const isLink = variant.startsWith("link");
  const classes = ["ds-button", `ds-button-${variant}`, state === "hover" ? "is-hover" : "", state === "focus" ? "is-focus" : "", state === "loading" ? "is-loading" : ""].filter(Boolean).join(" ");
  return `<button class="${classes}" type="button"${state === "disabled" || state === "loading" ? " disabled" : ""}>${state === "loading" ? componentIcon("◜") : componentIcon("+")}${isLink ? "Button" : "Button"}${state === "loading" ? "" : componentIcon("+")}</button>`;
}

function iconButtonMatrix() {
  const variants = ["primary", "secondary", "outline", "ghost", "link"];
  const rows = ["default", "focus", "disabled", "destructive"];
  const sizes = [["md", "36px"], ["sm", "32px"], ["xs", "28px"], ["2xs", "20px"]];
  return `<div class="component-state-grid is-icon-button-grid"><section class="component-state-panel is-full"><h4>Variants</h4><div class="ds-matrix is-icon-matrix"><div></div>${variants.map((variant) => `<b>${escapeHtml(variant)}</b>`).join("")}${rows.map((row) => `<span>${escapeHtml(row)}</span>${variants.map((variant) => `<button class="ds-icon-button ds-icon-button-md ds-button-${row === "destructive" ? `destructive-${variant}` : variant}${row === "focus" ? " is-focus" : ""}" type="button" aria-label="${escapeAttr(`${variant} ${row}`)}"${row === "disabled" ? " disabled" : ""}>${componentIcon("×")}</button>`).join("")}`).join("")}</div></section><section class="component-state-panel is-full"><h4>Sizes</h4><div class="ds-icon-button-size-row">${sizes.map(([size, label]) => `<span><button class="ds-icon-button ds-icon-button-${size} ds-button-outline" type="button" aria-label="${escapeAttr(size)} icon button">${componentIcon("×")}</button><b>${label}</b></span>`).join("")}</div></section></div>`;
}

function inputMatrix() {
  return `<div class="component-state-grid is-input-grid">
    <section class="component-state-panel"><h4>Text / Default</h4>${inputSample({ state: "default" })}${inputSample({ state: "focus-filled" })}</section>
    <section class="component-state-panel"><h4>Text / Destructive</h4>${inputSample({ error: true, state: "default" })}${inputSample({ error: true, state: "focus-filled" })}</section>
    <section class="component-state-panel"><h4>File / Default</h4>${inputSample({ file: true })}${inputSample({ file: true, state: "filled" })}</section>
    <section class="component-state-panel"><h4>File / Destructive</h4>${inputSample({ file: true, error: true })}${inputSample({ file: true, error: true, state: "filled" })}</section>
  </div>`;
}

function inputSample(options = {}) {
  const { error = false, file = false, state = "default", small = false } = options;
  const isFilled = state === "filled" || state === "focus-filled";
  const fieldClass = ["ds-field", error ? "is-error" : "", small ? "is-sm" : "", state.startsWith("focus") ? "is-focus" : "", state === "disabled" ? "is-disabled" : ""].filter(Boolean).join(" ");
  const helper = error ? "Your one-time password must be 6 characters." : "Enter your email address";
  const control = file
    ? `<span class="ds-file-control${isFilled ? " is-filled" : ""}" role="button" tabindex="0"><b>Choose file</b><span>${isFilled ? "file.txt" : "No file chosen"}</span></span>`
    : `<input value="${isFilled ? "Email" : ""}" placeholder="Email" aria-label="Input sample"${state === "disabled" ? " disabled" : ""} />`;
  return `<label class="${fieldClass}"><span>Label</span><span class="ds-input-with-button">${control}<button class="ds-button ds-button-primary ds-button-sm" type="button">${file ? "Submit" : "Subscribe"}</button></span><small>${helper}</small></label>`;
}

function checkboxMatrix() {
  return `<div class="ds-checkbox-matrix"><div></div><b>Unselected</b><b>Intermediate</b><b>Selected</b>${["default", "focus", "disabled"].map((row) => `<span>${row}</span>${["unchecked", "mixed", "checked"].map((state) => `<label class="ds-check-visual is-${row}">${checkboxBox(state)}</label>`).join("")}`).join("")}</div>`;
}

const badgeVariants = ["default", "secondary", "third", "destructive", "outline"];

function badgeMarkup(variant = "default", rounded = true, focus = false) {
  const classes = ["ds-badge", `ds-badge-${variant}`, focus ? "is-focus" : ""].filter(Boolean).join(" ");
  return `<span class="${classes}" data-rounded="${rounded ? "true" : "false"}">Badge</span>`;
}

function badgeStrip() {
  return `<div class="ds-badge-strip">${badgeVariants.map((variant) => badgeMarkup(variant, true, variant === "outline")).join("")}</div>`;
}

function badgeShowcase() {
  const rows = [
    ["Rounded: True / default", true, false],
    ["Rounded: True / focus", true, true],
    ["Rounded: False / default", false, false],
    ["Rounded: False / focus", false, true],
  ];
  return `<div class="component-state-grid is-badge-grid"><div class="ds-badge-matrix"><div></div>${badgeVariants.map((variant) => `<b class="ds-badge-col-label">${escapeHtml(variant)}</b>`).join("")}${rows.map(([label, rounded, focus]) => `<span class="ds-badge-row-label">${escapeHtml(label)}</span>${badgeVariants.map((variant) => badgeMarkup(variant, rounded, focus)).join("")}`).join("")}</div></div>`;
}

function dropdownShowcase() {
  const states = [
    ["3-dot Menu", "is-dropdown-action", actionMenuSample()],
    ["Select", "is-dropdown-select", selectMenuSample()],
    ["Date Picker", "is-dropdown-date", datePickerSample()],
    ["Month Picker", "is-dropdown-month", monthPickerSample()],
  ];
  return `<div class="component-state-grid is-dropdown-grid">${states.map(([title, className, markup]) => `<section class="component-state-panel ${className}"><h4>${title}</h4>${markup}</section>`).join("")}</div>`;
}

function actionMenuSample() {
  return `<div class="ds-dropdown-sample is-open is-action-menu"><button class="ds-icon-button ds-icon-button-md ds-button-primary" type="button" aria-expanded="true" aria-label="Open action menu">${componentIcon("⋯")}</button><div class="ds-dropdown-menu" role="menu"><button class="ds-dropdown-item" type="button" role="menuitem">${componentIcon("◎")}View record</button><button class="ds-dropdown-item" type="button" role="menuitem">${componentIcon("◎")}Update status</button><button class="ds-dropdown-item is-danger" type="button" role="menuitem">${componentIcon("◎")}Delete</button></div></div>`;
}

function selectMenuSample() {
  return `<div class="ds-dropdown-sample is-open"><label>複檢結果</label><button class="ds-dropdown-trigger" type="button" aria-expanded="true"><span class="ds-dropdown-value">全部</span><span class="ds-caret">⌄</span></button><div class="ds-dropdown-menu" role="listbox"><button class="ds-dropdown-item has-check" type="button" aria-selected="true"><span>全部</span><span class="ds-select-check">${componentSvgIcon("check")}</span></button><button class="ds-dropdown-item" type="button"><span>成功</span></button><button class="ds-dropdown-item" type="button"><span>失敗</span></button></div></div>`;
}

function datePickerSample() {
  const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "1", "2", "3", "4", "5"];
  return `<div class="ds-dropdown-sample is-open is-date-picker"><label>完成日期（起）</label><button class="ds-dropdown-trigger" type="button" aria-expanded="true">請選擇日期 <span class="ds-caret">⌄</span></button><div class="ds-dropdown-menu ds-calendar-menu"><div class="ds-calendar-header"><button type="button">‹</button><strong><span>Jun</span><span>2025</span></strong><button type="button">›</button></div><div class="ds-calendar-grid">${days.map((day, index) => `<button type="button" class="${day === "25" ? "is-selected" : ""}${index > 37 ? " is-outside" : ""}">${day}</button>`).join("")}</div></div></div>`;
}

function monthPickerSample() {
  return `<div class="ds-dropdown-sample is-open is-month-picker"><button class="ds-dropdown-trigger is-pill" type="button" aria-expanded="true"><strong>進行中</strong><span>2026 年 04 月</span><span class="ds-caret">⌄</span></button><div class="ds-dropdown-menu ds-month-menu"><div class="ds-calendar-header"><button type="button">‹</button><strong>2026</strong><button type="button">›</button></div>${["1 月", "2 月", "3 月", "4 月", "5 月", "6 月", "7 月", "8 月", "9 月", "10 月", "11 月", "12 月"].map((month) => `<button type="button" class="${month === "4 月" ? "is-selected" : ""}">${month}</button>`).join("")}</div></div>`;
}

function tabsShowcase() {
  return `<div class="component-state-grid is-tabs-grid"><section class="component-state-panel is-full"><h4>Default / Pill</h4><div class="ds-tabs is-hug" role="tablist"><button type="button" aria-selected="true">Label</button><button type="button">Label</button><button type="button">Label</button><button type="button">Label</button></div><div class="ds-tabs is-stretch" role="tablist"><button type="button" aria-selected="true">Label</button><button type="button">Label</button><button type="button">Label</button><button type="button">Label</button></div></section><section class="component-state-panel is-full"><h4>Line</h4><div class="ds-line-tabs is-wide" role="tablist"><button type="button" aria-selected="true">Label</button><button type="button">Label</button><button type="button">Label</button><button type="button">Label</button></div></section></div>`;
}

function paginationShowcase() {
  return `<div class="component-state-grid is-pagination-grid">
    <section class="component-state-panel is-full"><h4>Desktop</h4>${paginationBar("start")}</section>
    <section class="component-state-panel"><h4>Mobile</h4><div class="ds-pagination-wrap is-mobile"><span>第 1-10 列，共 99 列</span><nav class="ds-pagination"><button type="button">${componentSvgIcon("chevronsLeft")}</button><button type="button">${componentSvgIcon("chevronLeft")}</button><button type="button">${componentSvgIcon("chevronRight")}</button><button type="button">${componentSvgIcon("chevronsRight")}</button></nav></div></section>
    <section class="component-state-panel is-full"><h4>Start / Middle / End</h4><div class="ds-pagination-states">${["start", "middle", "end"].map((state) => paginationBar(state)).join("")}</div></section>
  </div>`;
}

function paginationBar(position) {
  const configs = {
    start: ["1", ["1", "2", "3", "4", "5", "6", "..."]],
    middle: ["4", ["1", "2", "3", "4", "5", "6", "..."]],
    end: ["8", ["...", "3", "4", "5", "6", "7", "8"]],
  };
  const [current, pages] = configs[position];
  return `<div class="ds-pagination-wrap is-desktop"><span>第 1-10 列，共 99 列</span><nav class="ds-pagination" aria-label="${escapeAttr(position)} pagination"><button class="ds-page-text" type="button">${componentSvgIcon("chevronLeft")}<span>上一頁</span></button>${pages.map((page) => page === "..." ? "<b>...</b>" : `<button type="button"${page === current ? ' aria-current="page"' : ""}>${page}</button>`).join("")}<button class="ds-page-text" type="button"><span>下一頁</span>${componentSvgIcon("chevronRight")}</button></nav></div>`;
}

function scrollbarShowcase() {
  return `<div class="component-state-grid is-scrollbar-grid"><section class="component-state-panel"><h4>Vertical</h4><div class="ds-scrollbar-area ds-scrollbar-area--default" tabindex="0"><div class="ds-scrollbar-filler">Visible 6px scrollbar<br/>Transparent track<br/>12px inset<br/><br/>Item 001<br/>Item 002<br/>Item 003<br/>Item 004<br/>Item 005</div></div></section><section class="component-state-panel"><h4>Sidebar</h4><div class="ds-scrollbar-area ds-scrollbar-area--sidebar" tabindex="0"><div class="ds-scrollbar-filler">Sidebar thumb<br/>25% default<br/>45% hover<br/><br/>Overview<br/>Metrics<br/>Records<br/>Reports<br/>Team</div></div></section><section class="component-state-panel is-full"><h4>Horizontal</h4><div class="ds-scrollbar-area ds-scrollbar-area--horizontal" tabindex="0"><div class="ds-scrollbar-table">${["ID", "Name", "Item", "Status", "Amount", "Created"].map((item) => `<span>${item}</span>`).join("")}</div></div></section></div>`;
}

function sidebarPreview(mode, options = {}) {
  const isCollapsed = mode === "collapsed";
  const navItems = [
    ["Overview", "device"],
    ["Metrics", "coin"],
    ["Records", "calculator"],
    ["Reports", "clipboard"],
    ["Team", "user"],
  ];
  const nested = `<span class="nested">All records</span><span class="nested">Archive</span>`;
  const nav = isCollapsed
    ? navItems.map(([item, iconName]) => `<button type="button" aria-label="${escapeAttr(item)}">${componentSvgIcon(iconName)}</button>`).join("")
    : navItems.map(([item, iconName]) => {
      const hoverClass = options.hoverTarget === "menu" && item === "Overview" ? ' class="is-hover"' : "";
      return `<button${hoverClass} type="button">${componentSvgIcon(iconName)}<span>${item}</span></button>${item === "Reports" ? nested : ""}`;
    }).join("");
  const footerClass = options.hoverTarget === "footer" ? ' class="is-hover"' : "";
  const previewClass = options.preview ? ` is-${options.preview}-preview` : "";
  return `<div class="ds-sidebar-preview is-${mode}${previewClass}"><span class="ds-logo-slot" aria-hidden="true"></span><nav>${nav}</nav><footer${footerClass}><span class="ds-sidebar-avatar">A</span>${isCollapsed ? "" : `<b>Alex</b><span>Workspace</span><i>${componentSvgIcon("chevronUpDown")}</i>`}</footer></div>`;
}

function headerPreview() {
  return `<div class="ds-header-preview is-standalone"><button class="ds-header-toggle" type="button" aria-label="Toggle sidebar">${componentSvgIcon("panel")}</button><span class="ds-header-divider"></span><strong>App</strong></div>`;
}

function appShellPreview() {
  return `<div class="ds-app-shell-preview is-header-shell">${sidebarPreview("shell")}<div class="ds-main-shell-preview"><div class="ds-header-preview"><button class="ds-icon-button ds-button-ghost" type="button" aria-label="Menu">${componentIcon("☰")}</button><strong>App</strong></div><div class="ds-shell-content-preview"><span></span><span></span><button class="ds-button ds-button-primary ds-button-sm" type="button">Submit</button></div></div></div>`;
}

function dialogPreview() {
  return `<div class="ds-dialog-preview is-large-dialog"><button class="ds-icon-button ds-button-ghost" type="button" aria-label="Close">${componentIcon("×")}</button><strong>變更密碼</strong><p>請輸入您的舊密碼和新密碼。新密碼至少需要 8 個字元。</p>${["舊密碼", "新密碼", "確認新密碼"].map((label, index) => `<label class="ds-field"><span>${label}</span><input value="${index === 0 ? "••••••••" : ""}" placeholder="${index === 0 ? "" : "請輸入新密碼"}" /></label>`).join("")}<div class="ds-row ds-actions-right"><button class="ds-button ds-button-outline" type="button">取消</button><button class="ds-button ds-button-primary" type="button">確認變更</button></div></div>`;
}

function alertDialogShowcase() {
  return `<div class="component-state-grid is-alert-dialog-grid"><section class="component-state-panel is-full"><h4>Desktop</h4><div class="ds-alert-dialog-preview is-desktop"><strong>電腦版 警告對話框標題</strong><p>這是一段內文這是一段內文這是一段內文這是一段內文。</p><div class="ds-row ds-actions-right"><button class="ds-button ds-button-outline" type="button">取消</button><button class="ds-button ds-button-primary" type="button">繼續</button></div></div></section><section class="component-state-panel is-full"><h4>Mobile</h4><div class="ds-alert-dialog-preview is-mobile"><strong>手機版 警告對話框標題</strong><p>這是一段內文這是一段內文這是一段內文。</p><button class="ds-button ds-button-primary" type="button">繼續</button><button class="ds-button ds-button-outline" type="button">取消</button></div></section></div>`;
}

function alertShowcase() {
  return `<div class="component-state-grid is-alert-grid"><section class="component-state-panel"><h4>List</h4>${alertCardSimple()}</section><section class="component-state-panel"><h4>Grouped List</h4>${alertCardGrouped()}</section></div>`;
}

function alertCardSimple() {
  return `<div class="ds-alert-preview is-large"><span class="ds-alert-icon">${componentSvgIcon("sparkle")}</span><div class="ds-alert-content"><strong>資訊提示框標題</strong><div class="ds-alert-section"><p>子標題</p><ul><li>內文</li><li>內文</li></ul></div></div></div>`;
}

function alertCardGrouped() {
  return `<div class="ds-alert-preview is-large"><span class="ds-alert-icon">${componentSvgIcon("sparkle")}</span><div class="ds-alert-content"><strong>資訊提示框標題</strong><div class="ds-alert-section"><p>子標題</p><ul><li>內文</li><li>內文</li></ul></div><div class="ds-alert-section"><p>子標題</p><ul><li>內文</li><li>內文</li></ul></div></div></div>`;
}

function toastShowcase() {
  return `<div class="component-state-grid is-toast-grid">${[
    ["Action", toastSample("action")],
    ["Success", toastSample("success")],
    ["Info", toastSample("info")],
    ["Warning", toastSample("warning")],
    ["Destructive", toastSample("destructive")],
    ["Loading", toastSample("loading")],
  ].map(([title, markup]) => `<section class="component-state-panel"><h4>${title}</h4>${markup}</section>`).join("")}</div>`;
}

function toastSample(type) {
  const variants = {
    action: { icon: "", title: "已建立活動", meta: "2026/05/27 13:58", action: "復原" },
    success: { icon: "check", title: "已建立活動", meta: "" },
    info: { icon: "info", title: "活動將於 5 天後開始", meta: "" },
    warning: { icon: "warning", title: "活動開始時間需在 08:30 後", meta: "" },
    destructive: { icon: "x", title: "尚未建立活動", meta: "" },
    loading: { icon: "loading", title: "載入中......", meta: "" },
  };
  const variant = variants[type];
  return `<div class="ds-toast-preview is-${type}">${variant.icon ? `<span class="ds-toast-icon">${componentSvgIcon(variant.icon)}</span>` : ""}<div><strong>${escapeHtml(variant.title)}</strong>${variant.meta ? `<span>${escapeHtml(variant.meta)}</span>` : ""}</div>${variant.action ? `<button class="ds-button ds-button-primary ds-button-sm" type="button">${escapeHtml(variant.action)}</button>` : ""}</div>`;
}

function statCard(title, value, trend = "", helper = "") {
  const meta = trend || helper
    ? `<div class="ds-stat-meta">${trend ? `<b>${escapeHtml(trend)} ${componentSvgIcon("trend")}</b>` : ""}${helper ? `<small>${escapeHtml(helper)}</small>` : ""}</div>`
    : "";
  return `<div class="ds-stat-preview${trend ? " has-trend" : ""}"><div class="ds-stat-heading"><span class="ds-stat-title">${escapeHtml(title)}</span><i>${componentSvgIcon("listCheck")}</i></div><strong class="ds-stat-value">${escapeHtml(value)}</strong>${meta}</div>`;
}

function tooltipShowcase() {
  const sides = [
    ["Top", "is-top"],
    ["Bottom", "is-bottom"],
    ["Left", "is-left"],
    ["Right", "is-right"],
  ];
  return `<div class="component-state-grid is-tooltip-grid">${sides.map(([title, side]) => `<section class="component-state-panel"><h4>${title}</h4><div class="ds-tooltip-demo ${side}"><button class="ds-icon-button ds-icon-button-md ds-button-outline" type="button" aria-label="${escapeAttr(title)} tooltip target">${componentIcon("?")}</button><span role="tooltip">Tooltip content</span></div></section>`).join("")}</div>`;
}

function separatorShowcase() {
  return `<div class="component-state-grid is-separator-grid"><section class="component-state-panel"><h4>Horizontal</h4><div class="ds-separator-horizontal"><span></span><b>Horizontal</b><span></span></div></section><section class="component-state-panel"><h4>Vertical</h4><div class="ds-separator-vertical"><i></i><b>Vertical</b></div></section></div>`;
}

function separatorPreview() {
  return `<div class="ds-separator-horizontal"><span></span><b>Horizontal</b><span></span></div>`;
}

function skeletonPreview() {
  return `<div class="ds-skeleton-preview is-animated"><span class="avatar"></span><div><span></span><span></span></div></div>`;
}

function componentDialogMarkup(name) {
  const icon = (label = "") => `<span class="ds-icon" aria-hidden="true">${escapeHtml(label)}</span>`;

  switch (name) {
    case "Button":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel">
            <h4>Variants</h4>
            <div class="ds-row">
              <button class="ds-button ds-button-primary" type="button">${icon("↗")}Primary</button>
              <button class="ds-button ds-button-secondary" type="button">Secondary</button>
              <button class="ds-button ds-button-outline" type="button">Outline</button>
              <button class="ds-button ds-button-ghost" type="button">Ghost</button>
            </div>
          </section>
          <section class="component-state-panel">
            <h4>Sizes & Disabled</h4>
            <div class="ds-row">
              <button class="ds-button ds-button-primary ds-button-sm" type="button">Small</button>
              <button class="ds-button ds-button-primary" type="button">Default</button>
              <button class="ds-button ds-button-outline" type="button" disabled>Disabled</button>
            </div>
          </section>
        </div>
      `;
    case "Icon Button":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel">
            <h4>Default</h4>
            <div class="ds-row">
              <button class="ds-icon-button ds-icon-button-md ds-button-primary" type="button" aria-label="Add">${icon("+")}</button>
              <button class="ds-icon-button ds-icon-button-md ds-button-outline" type="button" aria-label="Search">${icon("⌕")}</button>
              <button class="ds-icon-button ds-icon-button-md ds-button-ghost" type="button" aria-label="More">${icon("⋯")}</button>
            </div>
          </section>
          <section class="component-state-panel">
            <h4>Dense Toolbar</h4>
            <div class="ds-row">
              <button class="ds-icon-button ds-button-outline" type="button" aria-label="Filter">${icon("≡")}</button>
              <button class="ds-icon-button ds-button-outline" type="button" aria-label="Sort">${icon("↕")}</button>
              <button class="ds-icon-button ds-button-outline" type="button" aria-label="Export">${icon("↓")}</button>
            </div>
          </section>
        </div>
      `;
    case "Input":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel">
            <h4>Field States</h4>
            <label class="ds-field">
              <span>聯絡信箱</span>
              <input value="name@example.com" aria-label="Email sample" />
            </label>
            <label class="ds-field is-error">
              <span>必填欄位</span>
              <input placeholder="請輸入信箱" aria-label="Required email sample" />
            </label>
          </section>
          <section class="component-state-panel">
            <h4>Disabled</h4>
            <label class="ds-field">
              <span>Site</span>
              <input value="North" disabled aria-label="Disabled branch sample" />
            </label>
          </section>
        </div>
      `;
    case "Checkbox":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel">
            <h4>Selection</h4>
            <label class="ds-check"><input type="checkbox" checked /> <span>已選取</span></label>
            <label class="ds-check"><input type="checkbox" /> <span>未選取</span></label>
            <label class="ds-check"><input type="checkbox" disabled /> <span>停用</span></label>
          </section>
          <section class="component-state-panel">
            <h4>Form Group</h4>
            <label class="ds-check"><input type="checkbox" checked /> <span>Remember me</span></label>
            <label class="ds-check"><input type="checkbox" /> <span>訂閱處理進度通知</span></label>
          </section>
        </div>
      `;
    case "Dropdown Menu":
      return `
        <div class="component-state-grid is-dropdown-grid">
          <section class="component-state-panel">
            <h4>Action Menu</h4>
            <div class="ds-dropdown-sample is-open">
              <button class="ds-dropdown-trigger" type="button" aria-expanded="true">
                批次操作 <span class="ds-caret">⌄</span>
              </button>
              <div class="ds-dropdown-menu" role="menu">
                <button class="ds-dropdown-item" type="button" role="menuitem">Create record</button>
                <button class="ds-dropdown-item" type="button" role="menuitem">匯出資料</button>
                <button class="ds-dropdown-item is-danger" type="button" role="menuitem">刪除選取項目</button>
              </div>
            </div>
          </section>
          <section class="component-state-panel">
            <h4>Select Menu</h4>
            <div class="ds-dropdown-sample is-open">
              <button class="ds-dropdown-trigger" type="button" aria-expanded="true">
                <span class="ds-dropdown-value">North</span> <span class="ds-caret">⌄</span>
              </button>
              <div class="ds-dropdown-menu" role="listbox">
                <button class="ds-dropdown-item" type="button" role="option" aria-selected="true">North</button>
                <button class="ds-dropdown-item" type="button" role="option">Central</button>
                <button class="ds-dropdown-item" type="button" role="option">South</button>
              </div>
            </div>
          </section>
          <section class="component-state-panel">
            <h4>Date Picker</h4>
            <div class="ds-dropdown-sample is-open">
              <button class="ds-dropdown-trigger" type="button" aria-expanded="true">2026 / 06 / 02 <span class="ds-caret">⌄</span></button>
              <div class="ds-dropdown-menu ds-calendar-menu">
                <div class="ds-calendar-header"><button type="button">‹</button><strong>2026 June</strong><button type="button">›</button></div>
                <div class="ds-calendar-grid">
                  ${["日", "一", "二", "三", "四", "五", "六", "31", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((day, index) => `<button type="button" class="${index === 9 ? "is-selected" : ""}">${day}</button>`).join("")}
                </div>
              </div>
            </div>
          </section>
          <section class="component-state-panel">
            <h4>Month Picker</h4>
            <div class="ds-dropdown-sample is-open is-month-picker">
              <button class="ds-dropdown-trigger is-pill" type="button" aria-expanded="true"><strong>進行中</strong><span>2026 年 6 月</span><span class="ds-caret">⌄</span></button>
              <div class="ds-dropdown-menu ds-month-menu">
                ${["1 月", "2 月", "3 月", "4 月", "5 月", "6 月", "7 月", "8 月"].map((month, index) => `<button type="button" class="${index === 5 ? "is-selected" : ""}">${month}</button>`).join("")}
              </div>
            </div>
          </section>
        </div>
      `;
    case "Tabs":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel">
            <h4>Pill Tabs</h4>
            <div class="ds-tabs" role="tablist">
              <button type="button" aria-selected="true">Overview</button>
              <button type="button">Orders</button>
              <button type="button">Team</button>
            </div>
          </section>
          <section class="component-state-panel">
            <h4>Line Tabs</h4>
            <div class="ds-line-tabs" role="tablist">
              <button type="button" aria-selected="true">Active</button>
              <button type="button">History</button>
              <button type="button">Archived</button>
            </div>
          </section>
        </div>
      `;
    case "Pagination":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel is-full">
            <h4>Desktop</h4>
            <div class="ds-pagination-wrap">
              <span>第 1-10 列，共 99 列</span>
              <nav class="ds-pagination" aria-label="Preview pagination">
                <button class="ds-page-text" type="button">‹ 上一頁</button>
                <button type="button">1</button>
                <button type="button" aria-current="page">2</button>
                <button type="button">3</button>
                <b>...</b>
                <button type="button">10</button>
                <button class="ds-page-text" type="button">下一頁 ›</button>
              </nav>
            </div>
          </section>
          <section class="component-state-panel is-full">
            <h4>Compact</h4>
            <div class="ds-pagination-wrap is-compact">
              <span>共 99 列</span>
              <nav class="ds-pagination" aria-label="Compact pagination">
                <button type="button">‹</button>
                <button type="button" aria-current="page">2</button>
                <button type="button">›</button>
              </nav>
            </div>
          </section>
        </div>
      `;
    case "Scrollbar":
      return `
        <div class="component-state-grid is-scrollbar-grid">
          <section class="component-state-panel">
            <h4>Vertical</h4>
            <div class="ds-scrollbar-area ds-scrollbar-area--default" tabindex="0">
              <span class="ds-scrollbar-area-label">Card area</span>
              <div class="ds-scrollbar-filler">Visible 6px scrollbar<br/>Transparent track<br/>8px end inset<br/><br/>請捲動以查看 thumb 狀態<br/><br/>Item 001<br/>Item 002<br/>Item 003<br/>Item 004<br/>Item 005</div>
            </div>
          </section>
          <section class="component-state-panel">
            <h4>Sidebar</h4>
            <div class="ds-scrollbar-area ds-scrollbar-area--sidebar" tabindex="0">
              <span class="ds-scrollbar-area-label">Sidebar</span>
              <div class="ds-scrollbar-filler">Sidebar thumb<br/>25% default<br/>45% hover<br/><br/>Overview<br/>Reports<br/>Members<br/>Team<br/>Records<br/>Settings</div>
            </div>
          </section>
          <section class="component-state-panel is-full">
            <h4>Horizontal</h4>
            <div class="ds-scrollbar-area ds-scrollbar-area--horizontal" tabindex="0">
              <div class="ds-scrollbar-table">
                ${["ID", "Name", "Item", "Status", "Amount", "Created"].map((item) => `<span>${item}</span>`).join("")}
              </div>
            </div>
          </section>
        </div>
      `;
    case "Sidebar":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel is-full">
            <h4>Expanded</h4>
            ${componentPreviewMarkup("Sidebar")}
          </section>
          <section class="component-state-panel">
            <h4>Collapsed</h4>
            <div class="ds-sidebar-preview is-collapsed">
              <span class="ds-logo-slot" aria-hidden="true"></span>
              <nav aria-label="Collapsed sidebar preview">
                <button class="is-active" type="button">${icon("▣")}</button>
                <button type="button">${icon("▣")}</button>
                <button type="button">${icon("▣")}</button>
              </nav>
            </div>
          </section>
        </div>
      `;
    case "Dialog":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel is-full">
            <h4>Form Dialog</h4>
            ${componentPreviewMarkup("Dialog")}
          </section>
        </div>
      `;
    case "Alert Dialog":
      return `
        <div class="component-state-grid">
          <section class="component-state-panel is-full">
            <h4>Confirmation</h4>
            ${componentPreviewMarkup("Alert Dialog")}
          </section>
        </div>
      `;
    default:
      return `<div class="component-state-grid"><section class="component-state-panel is-full">${componentPreviewMarkup(name)}</section></div>`;
  }
}

function componentPreviewMarkup(name) {
  const icon = (label = "") => `<span class="ds-icon" aria-hidden="true">${escapeHtml(label)}</span>`;

  switch (name) {
    case "Button":
      return `
        <div class="ds-row">
          <button class="ds-button ds-button-primary" type="button">${icon("↗")}Primary</button>
          <button class="ds-button ds-button-outline" type="button">Outline</button>
        </div>
        <div class="ds-row">
          <button class="ds-button ds-button-secondary ds-button-sm" type="button">Secondary</button>
          <button class="ds-button ds-button-ghost ds-button-sm" type="button">Ghost</button>
        </div>
      `;
    case "Icon Button":
      return `
        <div class="ds-row ds-center">
          <button class="ds-icon-button ds-icon-button-md ds-button-primary" type="button" aria-label="Add">${icon("+")}</button>
          <button class="ds-icon-button ds-icon-button-md ds-button-outline" type="button" aria-label="Search">${icon("⌕")}</button>
          <button class="ds-icon-button ds-icon-button-md ds-button-ghost" type="button" aria-label="More">${icon("⋯")}</button>
        </div>
      `;
    case "Input":
      return `
        <label class="ds-field">
          <span>Label</span>
          <input value="name@example.com" aria-label="Email sample" />
        </label>
        <label class="ds-field is-error">
          <span>Required</span>
          <input placeholder="Email" aria-label="Required email sample" />
        </label>
      `;
    case "Checkbox":
      return `
        <label class="ds-check"><input type="checkbox" checked /> <span>Selected</span></label>
        <label class="ds-check"><input type="checkbox" /> <span>Unselected</span></label>
        <label class="ds-check"><input type="checkbox" disabled /> <span>Disabled</span></label>
      `;
    case "Badge":
      return badgeStrip();
    case "Dropdown Menu":
      return `
        <div class="ds-dropdown-sample is-open">
          <button class="ds-dropdown-trigger" type="button" aria-expanded="true">批次操作 <span class="ds-caret">⌄</span></button>
          <div class="ds-dropdown-menu" role="menu">
            <button class="ds-dropdown-item" type="button" role="menuitem">Create record</button>
            <button class="ds-dropdown-item" type="button" role="menuitem">匯出資料</button>
            <button class="ds-dropdown-item is-danger" type="button" role="menuitem">刪除</button>
          </div>
        </div>
      `;
    case "Tabs":
      return `
        <div class="ds-tabs" role="tablist">
          <button type="button" aria-selected="true">Overview</button>
          <button type="button">Orders</button>
          <button type="button">Team</button>
        </div>
        <div class="ds-line-tabs" role="tablist">
          <button type="button" aria-selected="true">Active</button>
          <button type="button">History</button>
        </div>
      `;
    case "Pagination":
      return `
        <div class="ds-pagination-wrap">
          <span>第 1-10 列，共 99 列</span>
          <nav class="ds-pagination" aria-label="Preview pagination">
            <button class="ds-page-text" type="button">‹ 上一頁</button>
            <button type="button">1</button>
            <button type="button" aria-current="page">2</button>
            <button type="button">3</button>
            <b>...</b>
            <button class="ds-page-text" type="button">下一頁 ›</button>
          </nav>
        </div>
      `;
    case "Sidebar":
      return sidebarPreview("expanded", { preview: "card" });
    case "Header / App Shell Block":
      return headerPreview();
    case "Dialog":
      return `
        <div class="ds-dialog-preview">
          <button class="ds-icon-button ds-button-ghost" type="button" aria-label="Close">${icon("×")}</button>
          <strong>新增資料</strong>
          <p>填寫表單內容</p>
          <input value="Sample" aria-label="Dialog input sample" />
          <div class="ds-row ds-actions-right"><button class="ds-button ds-button-outline" type="button">取消</button><button class="ds-button ds-button-primary" type="button">儲存</button></div>
        </div>
      `;
    case "Alert Dialog":
      return `
        <div class="ds-alert-dialog-preview">
          <strong>確認送出？</strong>
          <p>此操作將更新目前資料。</p>
          <div class="ds-row ds-actions-right"><button class="ds-button ds-button-outline" type="button">取消</button><button class="ds-button ds-button-primary" type="button">繼續</button></div>
        </div>
      `;
    case "Alert":
      return alertCardSimple();
    case "Sonner / Toast":
      return toastSample("action");
    case "Tooltip":
      return `
        <div class="ds-tooltip-demo is-preview is-top">
          <button class="ds-icon-button ds-icon-button-md ds-button-outline" type="button" aria-label="Info">${icon("?")}</button>
          <span role="tooltip">Tooltip</span>
        </div>
      `;
    case "Skeleton":
      return `
        <div class="ds-skeleton-preview">
          <span class="avatar"></span>
          <div><span></span><span></span></div>
        </div>
        <div class="ds-card-skeleton"><span></span><span></span></div>
      `;
    case "Separator":
      return separatorPreview();
    case "Stat Card":
      return `
        ${statCard("This month", "128", "+12% from last month", "On track")}
      `;
    case "Scrollbar":
      return `
        <div class="ds-scrollbar-preview">
          <div class="ds-scrollbar-area ds-scrollbar-area--default" tabindex="0">
            <span class="ds-scrollbar-area-label">Default</span>
            <div class="ds-scrollbar-filler">6px thumb<br/>transparent track<br/><br/>向下捲動以預覽<br/><br/>·<br/>·<br/>·<br/>·</div>
          </div>
          <div class="ds-scrollbar-area ds-scrollbar-area--sidebar" tabindex="0">
            <span class="ds-scrollbar-area-label">Sidebar</span>
            <div class="ds-scrollbar-filler">Sidebar thumb<br/>25% → hover 45%<br/><br/>向下捲動以預覽<br/><br/>·<br/>·<br/>·<br/>·</div>
          </div>
        </div>
      `;
    default:
      return `<span class="preview-type">${escapeHtml(name.slice(0, 2))}</span>`;
  }
}

function renderPreview(token) {
  const value = token.cssLiteral || token.value;
  if (token.category === "Color" || token.category === "Gradient") {
    return `<span class="preview-box"><span class="preview-color" style="background:${escapeAttr(value)}"></span></span>`;
  }

  if (token.category === "Radius") {
    const radius = clamp(parsePx(value), 0, 26);
    return `<span class="preview-box"><span class="preview-radius" style="border-radius:${radius}px"></span></span>`;
  }

  if (token.category === "Spacing") {
    const height = clamp(parsePx(value), 4, 34);
    return `<span class="preview-box"><span class="preview-spacing"><span style="height:${height}px"></span><span style="height:${Math.max(8, height * 0.72)}px"></span><span style="height:${Math.max(6, height * 0.48)}px"></span></span></span>`;
  }

  if (token.category === "Typography") {
    const style = token.rawValue || {};
    const size = style.fontSize || `${clamp(parsePx(value) || 18, 12, 48)}px`;
    const lineHeight = style.lineHeight || size;
    const weight = style.fontWeight || value.match(/\b(100|200|300|400|500|600|700|800|900)\b/)?.[1] || "700";
    return `<span class="preview-box preview-box--type"><span class="preview-type" style="font-size:${escapeAttr(size)};line-height:${escapeAttr(lineHeight)};font-weight:${escapeAttr(weight)}">Ag</span></span>`;
  }

  if (token.category === "Shadow") {
    return `<span class="preview-box"><span class="preview-shadow" style="box-shadow:${escapeAttr(token.cssLiteral)}"></span></span>`;
  }

  if (token.category === "Opacity") {
    const opacity = clamp(Number(token.cssLiteral), 0, 1);
    return `<span class="preview-box"><span class="preview-opacity" style="opacity:${opacity}"></span></span>`;
  }

  if (token.category === "Border" || token.category === "Stroke") {
    const width = clamp(parsePx(value), 1, 8);
    return `<span class="preview-box"><span class="preview-line" style="border-top-width:${width}px"></span></span>`;
  }

  return `<span class="preview-box"><span class="preview-type">${escapeHtml(String(token.value).replace(/px$/, ""))}</span></span>`;
}

async function copyToClipboard(text, button) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    flashButton(button);
  } catch (error) {
    console.warn("Copy failed", error);
  }
}

function flashButton(button) {
  const original = button.innerHTML;
  button.innerHTML = `<span data-icon="check"></span><span>Copied</span>`;
  mountIcons(button);
  window.setTimeout(() => {
    button.innerHTML = original;
    mountIcons(button);
  }, 1200);
}

function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((slot) => {
    slot.innerHTML = icons[slot.dataset.icon] || "";
  });
}

function parsePx(value) {
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function toClassName(value) {
  return String(value)
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
