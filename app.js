(() => {
  const businessReportInput = document.getElementById('businessReportInput');
  const inventoryInput = document.getElementById('inventoryInput');
  const businessReportStatus = document.getElementById('businessReportStatus');
  const inventoryStatus = document.getElementById('inventoryStatus');
  const mergeBtn = document.getElementById('mergeBtn');
  const errorMsg = document.getElementById('errorMsg');
  const summaryMsg = document.getElementById('summaryMsg');
  const resultsContainer = document.getElementById('resultsContainer');
  const groupNav = document.getElementById('groupNav');
  const jumpNavToggle = document.getElementById('jumpNavToggle');
  const jumpNavOverlay = document.getElementById('jumpNavOverlay');
  const columnPicker = document.getElementById('columnPicker');
  const supplierDaysInput = document.getElementById('supplierDays');
  const transitDaysInput = document.getElementById('transitDays');
  const receiveDaysInput = document.getElementById('receiveDays');
  const restockPeriodDaysInput = document.getElementById('restockPeriodDays');
  const reportStartDateInput = document.getElementById('reportStartDate');
  const reportEndDateInput = document.getElementById('reportEndDate');
  const reportPeriodComputed = document.getElementById('reportPeriodComputed');
  const timingHint = document.getElementById('timingHint');
  const hideZeroSales = document.getElementById('hideZeroSales');
  const hideBelowMinRecommended = document.getElementById('hideBelowMinRecommended');
  const minRecommendedValue = document.getElementById('minRecommendedValue');

  const COLUMN_LABELS = {
    asin: 'ASIN',
    fnsku: 'FNSKU',
    title: 'Name',
    description: 'Description',
    ordered: 'Sales',
    stock: 'FBA Stock',
    restock: 'Restock',
    recommendedRestock: 'Recommended Restock'
  };

  let businessReportText = null;
  let inventoryText = null;
  let mergedGroups = null;

  const STORAGE_KEY = 'fbaRestockistSettings';

  function saveSettings() {
    const state = {
      supplierDays: supplierDaysInput.value,
      transitDays: transitDaysInput.value,
      receiveDays: receiveDaysInput.value,
      restockPeriodDays: restockPeriodDaysInput.value,
      reportStartDate: reportStartDateInput.value,
      reportEndDate: reportEndDateInput.value,
      hideZeroSales: hideZeroSales.checked,
      hideBelowMinRecommended: hideBelowMinRecommended.checked,
      minRecommendedValue: minRecommendedValue.value,
      columns: Array.from(columnPicker.querySelectorAll('.col-chip')).map(chip => ({
        key: chip.dataset.key,
        checked: chip.querySelector('.col-toggle').checked
      }))
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore storage errors */ }
  }

  function loadSettings() {
    let state;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      state = JSON.parse(raw);
    } catch (e) { return; }

    if (state.supplierDays !== undefined) supplierDaysInput.value = state.supplierDays;
    if (state.transitDays !== undefined) transitDaysInput.value = state.transitDays;
    if (state.receiveDays !== undefined) receiveDaysInput.value = state.receiveDays;
    if (state.restockPeriodDays !== undefined) restockPeriodDaysInput.value = state.restockPeriodDays;
    if (state.reportStartDate !== undefined) reportStartDateInput.value = state.reportStartDate;
    if (state.reportEndDate !== undefined) reportEndDateInput.value = state.reportEndDate;
    if (state.hideZeroSales !== undefined) hideZeroSales.checked = state.hideZeroSales;
    if (state.hideBelowMinRecommended !== undefined) hideBelowMinRecommended.checked = state.hideBelowMinRecommended;
    if (state.minRecommendedValue !== undefined) minRecommendedValue.value = state.minRecommendedValue;

    if (Array.isArray(state.columns)) {
      state.columns.forEach(colState => {
        const chip = columnPicker.querySelector(`.col-chip[data-key="${colState.key}"]`);
        if (!chip) return;
        chip.querySelector('.col-toggle').checked = colState.checked;
        columnPicker.appendChild(chip);
      });
    }
  }

  function getTimingDays() {
    return {
      supplier: parseNumber(supplierDaysInput.value),
      transit: parseNumber(transitDaysInput.value),
      receive: parseNumber(receiveDaysInput.value),
      restockPeriod: parseNumber(restockPeriodDaysInput.value)
    };
  }

  function getCoverageDays() {
    const t = getTimingDays();
    return t.supplier + t.transit + t.receive + t.restockPeriod;
  }

  function updateTimingHint() {
    const coverage = getCoverageDays();
    if (coverage <= 0) {
      timingHint.textContent = 'Fill in the fields above to see how many days of sales history to use.';
      return;
    }
    const months = Math.ceil(coverage / 30);
    timingHint.textContent = `Total coverage needed: ${coverage} days. Pull a Business Report covering at least ${coverage} days (~${months} month${months > 1 ? 's' : ''}) and enter its exact period below.`;
  }

  [supplierDaysInput, transitDaysInput, receiveDaysInput, restockPeriodDaysInput].forEach(input => {
    input.addEventListener('input', () => {
      updateTimingHint();
      saveSettings();
    });
  });

  function getReportPeriodDays() {
    if (!reportStartDateInput.value || !reportEndDateInput.value) return 0;
    const start = new Date(reportStartDateInput.value + 'T00:00:00');
    const end = new Date(reportEndDateInput.value + 'T00:00:00');
    const days = Math.round((end - start) / 86400000) + 1;
    return days > 0 ? days : 0;
  }

  function updateReportPeriodComputed() {
    const days = getReportPeriodDays();
    reportPeriodComputed.textContent = days > 0
      ? `Report period: ${days} day${days > 1 ? 's' : ''}`
      : 'Report period: — (pick a valid start/end date)';
  }

  [reportStartDateInput, reportEndDateInput].forEach(input => {
    input.addEventListener('input', () => {
      updateReportPeriodComputed();
      saveSettings();
    });
  });

  function getSelectedColumns() {
    const chips = Array.from(columnPicker.querySelectorAll('.col-chip'));
    return chips
      .filter(chip => chip.querySelector('.col-toggle').checked)
      .map(chip => chip.dataset.key);
  }

  function setupColumnDragDrop() {
    let draggedChip = null;
    let currentTarget = null;
    let currentSide = null;

    function clearIndicator() {
      if (currentTarget) {
        currentTarget.classList.remove('drag-over-left', 'drag-over-right');
        currentTarget = null;
        currentSide = null;
      }
    }

    columnPicker.querySelectorAll('.col-chip').forEach(chip => {
      chip.addEventListener('dragstart', () => {
        draggedChip = chip;
        chip.classList.add('dragging');
      });

      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        clearIndicator();
        draggedChip = null;
        if (mergedGroups) renderGroups(getDisplayGroups(), getSelectedColumns());
        saveSettings();
      });
    });

    columnPicker.addEventListener('dragover', (e) => {
      e.preventDefault();
      const chip = e.target.closest('.col-chip');
      if (!chip || chip === draggedChip) {
        clearIndicator();
        return;
      }
      const rect = chip.getBoundingClientRect();
      const side = (e.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
      if (chip === currentTarget && side === currentSide) return;
      clearIndicator();
      chip.classList.add(side === 'left' ? 'drag-over-left' : 'drag-over-right');
      currentTarget = chip;
      currentSide = side;
    });

    columnPicker.addEventListener('drop', (e) => {
      e.preventDefault();
      const chip = currentTarget;
      const side = currentSide;
      clearIndicator();
      if (!draggedChip || !chip || chip === draggedChip) return;
      if (side === 'left') {
        chip.before(draggedChip);
      } else {
        chip.after(draggedChip);
      }
    });
  }

  function stripBom(text) {
    if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
    if (text.startsWith('ï»¿')) return text.slice(3);
    return text;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const s = stripBom(text);
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          row.push(field);
          field = '';
        } else if (c === '\r') {
          // skip, handled by \n
        } else if (c === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else {
          field += c;
        }
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(r => !(r.length === 1 && r[0] === ''));
  }

  function parseTsv(text) {
    const s = stripBom(text);
    return s.split(/\r?\n/)
      .filter(line => line.length > 0)
      .map(line => line.split('\t'));
  }

  function toHeaderMap(headerRow) {
    const map = {};
    headerRow.forEach((h, idx) => { map[h.trim()] = idx; });
    return map;
  }

  function parseNumber(raw) {
    if (raw === undefined || raw === null) return 0;
    const cleaned = String(raw).replace(/[£$,]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function buildInventoryMap(rows) {
    const headerMap = toHeaderMap(rows[0]);
    const asinIdx = headerMap['asin'];
    const fnskuIdx = headerMap['fulfillment-channel-sku'];
    const conditionTypeIdx = headerMap['condition-type'];
    const warehouseConditionIdx = headerMap['Warehouse-Condition-code'];
    const qtyIdx = headerMap['Quantity Available'];

    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.length <= asinIdx) continue;
      if (r[conditionTypeIdx] !== 'NewItem') continue;
      const asin = r[asinIdx];
      if (!asin) continue;
      const entry = map.get(asin) || { fnsku: r[fnskuIdx], stock: 0 };
      if (r[warehouseConditionIdx] === 'SELLABLE') {
        entry.stock += parseNumber(r[qtyIdx]);
      }
      if (!entry.fnsku) entry.fnsku = r[fnskuIdx];
      map.set(asin, entry);
    }
    return map;
  }

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

  function mergeData(businessRows, inventoryMap, coverageDays, reportPeriodDays) {
    const headerMap = toHeaderMap(businessRows[0]);
    const parentAsinIdx = headerMap['(Parent) ASIN'];
    const asinIdx = headerMap['(Child) ASIN'];
    const titleIdx = headerMap['Title'];
    const orderedIdx = headerMap['Units ordered'];

    const results = [];
    for (let i = 1; i < businessRows.length; i++) {
      const r = businessRows[i];
      if (!r || r.length <= asinIdx) continue;
      const asin = r[asinIdx];
      if (!asin) continue;
      const parentAsin = parentAsinIdx !== undefined ? (r[parentAsinIdx] || asin) : asin;
      const { name: title, description } = splitTitle(r[titleIdx]);
      const ordered = parseNumber(r[orderedIdx]);
      const inv = inventoryMap.get(asin);
      const fnsku = (inv && inv.fnsku) ? inv.fnsku : '(Not FBA Listed)';
      const stock = inv ? inv.stock : 0;
      const restock = ordered - stock;
      const dailyVelocity = ordered / reportPeriodDays;
      const recommendedRestock = Math.ceil(dailyVelocity * coverageDays) - stock;
      results.push({ parentAsin, asin, fnsku, title, description, ordered, stock, restock, recommendedRestock });
    }
    return results;
  }

  function groupByParent(rows) {
    const order = [];
    const map = new Map();
    rows.forEach(row => {
      if (!map.has(row.parentAsin)) {
        map.set(row.parentAsin, []);
        order.push(row.parentAsin);
      }
      map.get(row.parentAsin).push(row);
    });
    return order.map(parentAsin => ({ parentAsin, rows: map.get(parentAsin) }));
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function makeFilename(group) {
    const sampleName = (group.rows[0] && group.rows[0].title) || group.parentAsin;
    const words = sampleName.trim().split(/\s+/).slice(0, 7).join(' ');
    const slug = slugify(words) || slugify(group.parentAsin) || 'product';
    return `${slug}-restock-report.csv`;
  }

  const WRAP_COLUMNS = new Set(['title', 'description']);

  function buildTable(rows, columns) {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach(key => {
      const th = document.createElement('th');
      th.textContent = COLUMN_LABELS[key];
      if (WRAP_COLUMNS.has(key)) th.classList.add('col-wrap');
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      columns.forEach(key => {
        const td = document.createElement('td');
        td.textContent = row[key];
        if (WRAP_COLUMNS.has(key)) td.classList.add('col-wrap');
        if (key === 'restock') {
          td.classList.add(row.restock > 0 ? 'restock-negative' : 'restock-positive');
        }
        if (key === 'recommendedRestock') {
          td.classList.add(row.recommendedRestock > 0 ? 'restock-negative' : 'restock-positive');
        }
        if (key === 'fnsku' && row.fnsku === '(Not FBA Listed)') {
          td.classList.add('restock-negative');
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function findDuplicateAsins(rows) {
    const counts = new Map();
    rows.forEach(r => counts.set(r.asin, (counts.get(r.asin) || 0) + 1));
    return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([asin]) => asin);
  }

  function renderGroups(groups, columns) {
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
    groups.forEach((group, idx) => {
      if (group.rows.length === 0) return;

      const anchorId = `group-${slugify(group.parentAsin)}`;
      const sampleName = group.rows[0].title || '';

      const card = document.createElement('div');
      card.className = 'parent-group';
      card.id = anchorId;

      const header = document.createElement('div');
      header.className = 'parent-group-header';

      const title = document.createElement('div');
      title.className = 'parent-group-title';
      title.textContent = sampleName;
      const asinSpan = document.createElement('span');
      asinSpan.className = 'parent-asin';
      asinSpan.textContent = `Parent ASIN: ${group.parentAsin}`;
      title.appendChild(asinSpan);
      header.appendChild(title);

      const downloadGroupBtn = document.createElement('button');
      downloadGroupBtn.className = 'parent-group-download';
      downloadGroupBtn.textContent = 'Download CSV';
      downloadGroupBtn.addEventListener('click', () => downloadGroupCsv(group, columns));
      header.appendChild(downloadGroupBtn);

      card.appendChild(header);

      const duplicateAsins = findDuplicateAsins(group.rows);
      if (duplicateAsins.length > 0) {
        const warning = document.createElement('div');
        warning.className = 'duplicate-warning';
        warning.textContent = `Warning: duplicate variant ASIN${duplicateAsins.length > 1 ? 's' : ''} in this table — ${duplicateAsins.join(', ')}`;
        card.appendChild(warning);
      }

      const tableWrap = document.createElement('div');
      tableWrap.className = 'table-wrap';
      tableWrap.appendChild(buildTable(group.rows, columns));
      card.appendChild(tableWrap);

      fragment.appendChild(card);

      const navLink = document.createElement('a');
      navLink.href = `#${anchorId}`;
      navIndex += 1;
      navLink.textContent = `${navIndex}. ${sampleName || group.parentAsin}`;
      navLink.title = sampleName || group.parentAsin;
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
    if (groupNav.classList.contains('open')) {
      closeJumpNav();
    } else {
      openJumpNav();
    }
  });

  jumpNavOverlay.addEventListener('click', closeJumpNav);

  groupNav.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeJumpNav();
  });

  function downloadGroupCsv(group, columns) {
    if (columns.length === 0) {
      errorMsg.textContent = 'Select at least one column to export.';
      return;
    }
    const csv = rowsToCsv(group.rows, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = makeFilename(group);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) {
    const s = String(value);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function rowsToCsv(rows, columns) {
    const header = columns.map(key => COLUMN_LABELS[key]);
    const lines = [header.join(',')];
    rows.forEach(row => {
      lines.push(columns.map(key => csvEscape(row[key])).join(','));
    });
    return lines.join('\r\n');
  }

  function updateMergeButtonState() {
    mergeBtn.disabled = !(businessReportText && inventoryText);
  }

  function getDisplayGroups() {
    if (!mergedGroups) return [];
    const minRecommended = parseNumber(minRecommendedValue.value);
    if (!hideZeroSales.checked && !hideBelowMinRecommended.checked) return mergedGroups;
    return mergedGroups
      .map(group => ({
        parentAsin: group.parentAsin,
        rows: group.rows.filter(r =>
          (!hideZeroSales.checked || r.ordered > 0) &&
          (!hideBelowMinRecommended.checked || r.recommendedRestock >= minRecommended)
        )
      }))
      .filter(group => group.rows.length > 0);
  }

  function countRows(groups) {
    return groups.reduce((sum, g) => sum + g.rows.length, 0);
  }

  businessReportInput.addEventListener('change', () => {
    const file = businessReportInput.files[0];
    if (!file) return;
    businessReportStatus.textContent = file.name;
    file.text().then(text => {
      businessReportText = text;
      updateMergeButtonState();
    });
  });

  inventoryInput.addEventListener('change', () => {
    const file = inventoryInput.files[0];
    if (!file) return;
    inventoryStatus.textContent = file.name;
    file.text().then(text => {
      inventoryText = text;
      updateMergeButtonState();
    });
  });

  mergeBtn.addEventListener('click', () => {
    errorMsg.textContent = '';
    summaryMsg.textContent = '';
    mergedGroups = null;
    resultsContainer.innerHTML = '';

    try {
      const reportPeriodDays = getReportPeriodDays();
      if (reportPeriodDays <= 0) {
        throw new Error('Pick a valid Business Report start and end date.');
      }

      const businessRows = parseCsv(businessReportText);
      const inventoryRows = parseTsv(inventoryText);

      if (businessRows.length < 2) throw new Error('Business report appears empty or unreadable.');
      if (inventoryRows.length < 2) throw new Error('Inventory file appears empty or unreadable.');

      const coverageDays = getCoverageDays();
      const inventoryMap = buildInventoryMap(inventoryRows);
      const rows = mergeData(businessRows, inventoryMap, coverageDays, reportPeriodDays);
      mergedGroups = groupByParent(rows);

      const displayGroups = getDisplayGroups();
      renderGroups(displayGroups, getSelectedColumns());
      summaryMsg.textContent = `${displayGroups.length} of ${mergedGroups.length} products shown (${countRows(displayGroups)} of ${rows.length} rows). Coverage: ${coverageDays} days, report period: ${reportPeriodDays} days.`;
    } catch (e) {
      errorMsg.textContent = e.message || 'Failed to merge files.';
    }
  });

  columnPicker.querySelectorAll('.col-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      if (mergedGroups) renderGroups(getDisplayGroups(), getSelectedColumns());
      saveSettings();
    });
  });

  function applyFilters() {
    saveSettings();
    if (!mergedGroups) return;
    const displayGroups = getDisplayGroups();
    renderGroups(displayGroups, getSelectedColumns());
    summaryMsg.textContent = `${displayGroups.length} of ${mergedGroups.length} products shown (${countRows(displayGroups)} of ${countRows(mergedGroups)} rows).`;
  }

  [hideZeroSales, hideBelowMinRecommended].forEach(cb => cb.addEventListener('change', applyFilters));
  minRecommendedValue.addEventListener('input', applyFilters);

  loadSettings();
  updateTimingHint();
  updateReportPeriodComputed();
  setupColumnDragDrop();
})();
