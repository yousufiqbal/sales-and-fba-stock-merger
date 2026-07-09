(() => {
  const businessReportInput = document.getElementById('businessReportInput');
  const inventoryInput = document.getElementById('inventoryInput');
  const businessReportStatus = document.getElementById('businessReportStatus');
  const inventoryStatus = document.getElementById('inventoryStatus');
  const mergeBtn = document.getElementById('mergeBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const errorMsg = document.getElementById('errorMsg');
  const summaryMsg = document.getElementById('summaryMsg');
  const resultBody = document.getElementById('resultBody');
  const resultHeadRow = document.getElementById('resultHeadRow');
  const columnPicker = document.getElementById('columnPicker');

  const COLUMN_LABELS = {
    asin: 'ASIN',
    fnsku: 'FNSKU',
    title: 'Title',
    ordered: 'Ordered',
    stock: 'Stock',
    restock: 'Restock'
  };

  let businessReportText = null;
  let inventoryText = null;
  let mergedRows = null;

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
        if (mergedRows) renderTable(mergedRows, getSelectedColumns());
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

  function mergeData(businessRows, inventoryMap) {
    const headerMap = toHeaderMap(businessRows[0]);
    const asinIdx = headerMap['(Child) ASIN'];
    const titleIdx = headerMap['Title'];
    const orderedIdx = headerMap['Units ordered'];

    const results = [];
    for (let i = 1; i < businessRows.length; i++) {
      const r = businessRows[i];
      if (!r || r.length <= asinIdx) continue;
      const asin = r[asinIdx];
      if (!asin) continue;
      const title = r[titleIdx] || '';
      const ordered = parseNumber(r[orderedIdx]);
      const inv = inventoryMap.get(asin);
      const fnsku = inv ? inv.fnsku : '';
      const stock = inv ? inv.stock : 0;
      const restock = ordered - stock;
      results.push({ asin, fnsku, title, ordered, stock, restock });
    }
    return results;
  }

  function renderTable(rows, columns) {
    resultHeadRow.innerHTML = '';
    columns.forEach(key => {
      const th = document.createElement('th');
      th.textContent = COLUMN_LABELS[key];
      resultHeadRow.appendChild(th);
    });

    resultBody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    rows.forEach(row => {
      const tr = document.createElement('tr');
      columns.forEach(key => {
        const td = document.createElement('td');
        td.textContent = row[key];
        if (key === 'restock') {
          td.classList.add(row.restock > 0 ? 'restock-negative' : 'restock-positive');
        }
        tr.appendChild(td);
      });
      fragment.appendChild(tr);
    });
    resultBody.appendChild(fragment);
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
    downloadBtn.disabled = true;
    mergedRows = null;

    try {
      const businessRows = parseCsv(businessReportText);
      const inventoryRows = parseTsv(inventoryText);

      if (businessRows.length < 2) throw new Error('Business report appears empty or unreadable.');
      if (inventoryRows.length < 2) throw new Error('Inventory file appears empty or unreadable.');

      const inventoryMap = buildInventoryMap(inventoryRows);
      mergedRows = mergeData(businessRows, inventoryMap);

      renderTable(mergedRows, getSelectedColumns());
      summaryMsg.textContent = `${mergedRows.length} rows merged.`;
      downloadBtn.disabled = mergedRows.length === 0;
    } catch (e) {
      errorMsg.textContent = e.message || 'Failed to merge files.';
    }
  });

  columnPicker.querySelectorAll('.col-toggle').forEach(cb => {
    cb.addEventListener('change', () => {
      if (mergedRows) renderTable(mergedRows, getSelectedColumns());
    });
  });

  setupColumnDragDrop();

  downloadBtn.addEventListener('click', () => {
    if (!mergedRows || mergedRows.length === 0) return;
    const columns = getSelectedColumns();
    if (columns.length === 0) {
      errorMsg.textContent = 'Select at least one column to export.';
      return;
    }
    const csv = rowsToCsv(mergedRows, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'restock.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();
