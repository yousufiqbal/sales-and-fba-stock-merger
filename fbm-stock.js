(() => {
  const fbmInventoryInput = document.getElementById('fbmInventoryInput');
  const fbmInventoryStatus = document.getElementById('fbmInventoryStatus');
  const mergeBtn = document.getElementById('mergeBtn');
  const errorMsg = document.getElementById('errorMsg');
  const summaryMsg = document.getElementById('summaryMsg');
  const resultsContainer = document.getElementById('resultsContainer');
  const groupNav = document.getElementById('groupNav');
  const jumpNavToggle = document.getElementById('jumpNavToggle');
  const jumpNavOverlay = document.getElementById('jumpNavOverlay');
  const showOosOnly = document.getElementById('showOosOnly');

  let fbmInventoryText = null;
  let allGroups = null; // [{ key, name, rows: [...] }]

  // ---------- parsing helpers ----------

  function stripBom(text) {
    if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
    if (text.startsWith('ï»¿')) return text.slice(3);
    return text;
  }

  function parseTsv(text) {
    const s = stripBom(text);
    return s.split(/\r?\n/)
      .filter(line => line.length > 0)
      .map(line => line.split('\t'));
  }

  function toHeaderMap(headerRow) {
    const map = {};
    headerRow.forEach((h, idx) => { map[h.trim().toLowerCase()] = idx; });
    return map;
  }

  function parseNumber(raw) {
    if (raw === undefined || raw === null) return 0;
    const cleaned = String(raw).replace(/[£$,]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function findHeaderIdx(headerMap, candidates) {
    for (const c of candidates) {
      if (headerMap[c] !== undefined) return headerMap[c];
    }
    return undefined;
  }

  // ---------- title / colour parsing ----------

  function splitTitle(rawTitle) {
    const trimmed = (rawTitle || '').trim();
    if (trimmed.endsWith(')')) {
      const openIdx = trimmed.lastIndexOf('(');
      if (openIdx > -1) {
        return {
          name: trimmed.slice(0, openIdx).trim(),
          description: trimmed.slice(openIdx + 1, -1).trim()
        };
      }
    }
    return { name: trimmed, description: '' };
  }

  const COLOR_WORDS = [
    'sky blue', 'royal blue', 'bottle green', 'jade green', 'sage green', 'silver grey',
    'light grey', 'dark grey', 'baby pink', 'dusty pink', 'neon pink', 'neon green',
    'neon yellow', 'neon orange', 'army green', 'army grey', 'tartan green', 'tartan blue',
    'tartan red', 'tartan white', 'red leopard', 'brown leopard', 'multi leopard',
    'wet look', 'big aztec', 'small aztec', 'love letters', 'love paris', 'dog tooth',
    'skull rose', 'vertical strips', 'multi-colour', 'multi colour', 'black/white',
    'blue/grey', 'red/black', 'pink/grey', 'brown copper', 'light green', 'light royal',
    'dark navy', 'cerise pink', 'apple green', 'beige/stone', 'rose pink',
    'black', 'white', 'red', 'blue', 'navy', 'green', 'yellow', 'pink', 'purple',
    'orange', 'grey', 'gray', 'brown', 'beige', 'cream', 'khaki', 'teal', 'turquoise',
    'maroon', 'burgundy', 'wine', 'stone', 'charcoal', 'silver', 'gold', 'golden', 'lilac',
    'fuchsia', 'coral', 'mustard', 'olive', 'camel', 'rust', 'denim', 'indigo', 'magenta',
    'mocha', 'peach', 'aqua'
  ].sort((a, b) => b.length - a.length);

  function extractColor(description) {
    if (!description) return '';
    const lower = description.toLowerCase();
    for (const word of COLOR_WORDS) {
      const idx = lower.indexOf(word);
      if (idx > -1) {
        return description.slice(idx, idx + word.length);
      }
    }
    // fallback: last comma-separated token
    const parts = description.split(',').map(p => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : '';
  }

  // ---------- build listing records ----------

  function buildRecords(rows) {
    if (rows.length < 2) throw new Error('Inventory file appears empty or unreadable.');
    const headerMap = toHeaderMap(rows[0]);

    const skuIdx = findHeaderIdx(headerMap, ['seller-sku', 'sku']);
    const asinIdx = findHeaderIdx(headerMap, ['asin1', 'asin']);
    const nameIdx = findHeaderIdx(headerMap, ['item-name', 'title']);
    const qtyIdx = findHeaderIdx(headerMap, ['quantity', 'quantity available']);
    const statusIdx = findHeaderIdx(headerMap, ['status']);
    const channelIdx = findHeaderIdx(headerMap, ['fulfillment-channel', 'fulfillment-channel-sku']);
    const priceIdx = findHeaderIdx(headerMap, ['price', 'your-price', 'standard-price', 'sale-price']);
    const conditionIdx = findHeaderIdx(headerMap, ['item-condition']);

    if (skuIdx === undefined || nameIdx === undefined) {
      throw new Error('Could not find "seller-sku" / "item-name" columns in the inventory file.');
    }

    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length <= nameIdx) continue;

      const channel = channelIdx !== undefined ? (r[channelIdx] || '').trim() : 'DEFAULT';
      // Only merchant-fulfilled (FBM) rows. Amazon-fulfilled rows use AMAZON_EU / AMAZON.
      if (channel && channel !== 'DEFAULT') continue;

      const sku = r[skuIdx] || '';
      const asin = asinIdx !== undefined ? (r[asinIdx] || '') : '';
      const rawTitle = r[nameIdx] || '';
      const { name, description } = splitTitle(rawTitle);
      const color = extractColor(description);
      const stock = qtyIdx !== undefined ? parseNumber(r[qtyIdx]) : 0;
      const status = statusIdx !== undefined ? (r[statusIdx] || '') : '';
      const price = priceIdx !== undefined ? r[priceIdx] : null;
      const condition = conditionIdx !== undefined ? (r[conditionIdx] || '') : '';
      const isOos = stock <= 0;

      records.push({ sku, asin, name, description, color, stock, status, price, condition, isOos });
    }
    return records;
  }

  function groupByName(records) {
    const order = [];
    const map = new Map();
    records.forEach(rec => {
      const key = rec.name || rec.sku;
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key).push(rec);
    });
    return order.map(key => {
      const groupRows = map.get(key)
        .slice()
        .sort((a, b) => {
          const c = a.color.localeCompare(b.color);
          if (c !== 0) return c;
          return a.description.localeCompare(b.description);
        });
      return { key, name: key, rows: groupRows };
    });
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ---------- rendering ----------

  function formatPrice(price) {
    if (price === null || price === undefined || price === '') return '—';
    const n = parseNumber(price);
    return isNaN(n) ? String(price) : `£${n.toFixed(2)}`;
  }

  function buildTable(rows) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Colour', 'Variant', 'ASIN', 'Status', 'Price', 'FBM Stock'].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    let prevColor = null;
    let altGroup = false;
    rows.forEach(row => {
      const tr = document.createElement('tr');
      if (row.color !== prevColor) altGroup = !altGroup;
      prevColor = row.color;
      if (altGroup) tr.classList.add('color-alt');
      if (row.isOos) tr.classList.add('row-oos');

      const colorTd = document.createElement('td');
      colorTd.textContent = row.color || '—';
      tr.appendChild(colorTd);

      const variantTd = document.createElement('td');
      variantTd.textContent = row.description || '—';
      tr.appendChild(variantTd);

      const asinTd = document.createElement('td');
      asinTd.textContent = row.asin;
      tr.appendChild(asinTd);

      const statusTd = document.createElement('td');
      statusTd.textContent = row.status;
      tr.appendChild(statusTd);

      const priceTd = document.createElement('td');
      priceTd.textContent = formatPrice(row.price);
      tr.appendChild(priceTd);

      const stockTd = document.createElement('td');
      stockTd.textContent = row.isOos ? `${row.stock} (OUT OF STOCK)` : row.stock;
      if (row.isOos) stockTd.classList.add('oos-label');
      tr.appendChild(stockTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function countOos(rows) {
    return rows.filter(r => r.isOos).length;
  }

  function getDisplayGroups() {
    if (!allGroups) return [];
    if (!showOosOnly.checked) return allGroups;
    return allGroups
      .map(g => ({ key: g.key, name: g.name, rows: g.rows.filter(r => r.isOos) }))
      .filter(g => g.rows.length > 0);
  }

  function renderGroups(groups) {
    resultsContainer.innerHTML = '';
    groupNav.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const navFragment = document.createDocumentFragment();

    if (groups.some(g => g.rows.length > 0)) {
      const navTitle = document.createElement('div');
      navTitle.className = 'group-nav-title';
      navTitle.textContent = 'Jump to product';
      navFragment.appendChild(navTitle);
    }

    let navIndex = 0;
    groups.forEach(group => {
      if (group.rows.length === 0) return;

      const anchorId = `group-${slugify(group.key)}`;
      const oosCount = countOos(group.rows);

      const card = document.createElement('div');
      card.className = 'parent-group';
      card.id = anchorId;

      const header = document.createElement('div');
      header.className = 'parent-group-header';

      const title = document.createElement('div');
      title.className = 'parent-group-title';
      title.textContent = group.name;
      const countSpan = document.createElement('span');
      countSpan.className = 'parent-asin';
      countSpan.textContent = `${group.rows.length} listing${group.rows.length > 1 ? 's' : ''}${oosCount > 0 ? ` — ${oosCount} out of stock` : ''}`;
      title.appendChild(countSpan);
      header.appendChild(title);

      card.appendChild(header);

      if (oosCount > 0) {
        const warning = document.createElement('div');
        warning.className = 'oos-warning';
        warning.textContent = `${oosCount} variant${oosCount > 1 ? 's' : ''} out of stock in this table`;
        card.appendChild(warning);
      }

      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      tableWrap.appendChild(buildTable(group.rows));
      card.appendChild(tableWrap);

      fragment.appendChild(card);

      const navLink = document.createElement('a');
      navLink.href = `#${anchorId}`;
      navIndex += 1;
      navLink.textContent = `${navIndex}. ${group.name}`;
      navLink.title = group.name;
      navFragment.appendChild(navLink);
    });

    resultsContainer.appendChild(fragment);
    groupNav.appendChild(navFragment);

    jumpNavToggle.classList.toggle('visible', navIndex > 0);
    if (navIndex === 0) closeJumpNav();
  }

  function openJumpNav() {
    groupNav.classList.add('open');
    jumpNavOverlay.classList.add('open');
    jumpNavToggle.classList.add('open');
  }

  function closeJumpNav() {
    groupNav.classList.remove('open');
    jumpNavOverlay.classList.remove('open');
    jumpNavToggle.classList.remove('open');
  }

  jumpNavToggle.addEventListener('click', () => {
    if (groupNav.classList.contains('open')) closeJumpNav();
    else openJumpNav();
  });

  jumpNavOverlay.addEventListener('click', closeJumpNav);

  groupNav.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeJumpNav();
  });

  function countRows(groups) {
    return groups.reduce((sum, g) => sum + g.rows.length, 0);
  }

  function updateSummary(displayGroups) {
    const totalRows = countRows(allGroups);
    const totalOos = allGroups.reduce((sum, g) => sum + countOos(g.rows), 0);
    summaryMsg.textContent = `${countRows(displayGroups)} of ${totalRows} listings shown across ${displayGroups.length} of ${allGroups.length} products. ${totalOos} out of stock total.`;
  }

  // ---------- wiring ----------

  fbmInventoryInput.addEventListener('change', () => {
    const file = fbmInventoryInput.files[0];
    if (!file) return;
    fbmInventoryStatus.textContent = file.name;
    file.text().then(text => {
      fbmInventoryText = text;
      mergeBtn.disabled = !fbmInventoryText;
    });
  });

  mergeBtn.addEventListener('click', () => {
    errorMsg.textContent = '';
    summaryMsg.textContent = '';
    allGroups = null;
    resultsContainer.innerHTML = '';
    groupNav.innerHTML = '';

    try {
      const rows = parseTsv(fbmInventoryText);
      const records = buildRecords(rows);
      if (records.length === 0) throw new Error('No merchant-fulfilled (FBM) listings found in this file.');
      allGroups = groupByName(records);

      const displayGroups = getDisplayGroups();
      renderGroups(displayGroups);
      updateSummary(displayGroups);
    } catch (e) {
      errorMsg.textContent = e.message || 'Failed to process file.';
    }
  });

  showOosOnly.addEventListener('change', () => {
    if (!allGroups) return;
    const displayGroups = getDisplayGroups();
    renderGroups(displayGroups);
    updateSummary(displayGroups);
  });
})();
