// Configure with window.INVENTORY_API_URL before this file loads, or set
// localStorage.inventoryApiUrl in the browser console. Defaults to the Nest API.
const API_BASE = (window.INVENTORY_API_URL || localStorage.getItem('inventoryApiUrl') || 'http://localhost:3000').replace(/\/+$/, '');
const PAGE_SIZE = 10;
const INVENTORY_CACHE_KEY = 'inventoryManagement.items.v1';
const PENDING_CACHE_KEY = 'inventoryManagement.pending.v1';
const COLOUR_ALIASES = new Map([
    ['sage green', '#879b83'], ['forest green', '#228b22'], ['mint green', '#98ff98'], ['mint', '#98ff98'],
    ['navy blue', '#000080'], ['dark blue', '#00008b'], ['light blue', '#add8e6'], ['sky blue', '#87ceeb'],
    ['charcoal', '#36454f'], ['off white', '#f8f8f0'], ['off-white', '#f8f8f0'], ['cream', '#fffdd0'],
    ['burgundy', '#800020'], ['beige', '#f5f5dc'], ['grey', '#808080'],
]);

const elements = {
    body: document.querySelector('#inventory-body'),
    loading: document.querySelector('#loading-state'),
    empty: document.querySelector('#empty-state'),
    emptyTitle: document.querySelector('#empty-title'),
    emptyCopy: document.querySelector('#empty-copy'),
    addButton: document.querySelector('#add-item-button'),
    emptyAddButton: document.querySelector('#empty-add-button'),
    search: document.querySelector('#search-input'),
    dialog: document.querySelector('#item-dialog'),
    detailDialog: document.querySelector('#detail-dialog'),
    detailTitle: document.querySelector('#detail-title'),
    detailName: document.querySelector('#detail-name'),
    detailSize: document.querySelector('#detail-size'),
    detailColour: document.querySelector('#detail-colour'),
    detailColourDot: document.querySelector('#detail-colour-dot'),
    detailDescription: document.querySelector('#detail-description'),
    form: document.querySelector('#item-form'),
    dialogTitle: document.querySelector('#dialog-title'),
    saveButton: document.querySelector('#save-item-button'),
    itemId: document.querySelector('#item-id'),
    name: document.querySelector('#item-name'),
    size: document.querySelector('#item-size'),
    colour: document.querySelector('#item-colour'),
    colourPicker: document.querySelector('#colour-picker'),
    description: document.querySelector('#item-description'),
    descriptionCount: document.querySelector('#description-count'),
    deleteDialog: document.querySelector('#delete-dialog'),
    deleteMessage: document.querySelector('#delete-message'),
    confirmDelete: document.querySelector('#confirm-delete-button'),
    toastRegion: document.querySelector('#toast-region'),
    syncStatus: document.querySelector('#sync-status'),
    syncLabel: document.querySelector('#sync-label'),
    startupScreen: document.querySelector('#startup-screen'),
    startupTitle: document.querySelector('#startup-title'),
    startupCopy: document.querySelector('#startup-copy'),
    startupRetry: document.querySelector('#startup-retry'),
    startupContinue: document.querySelector('#startup-continue'),
};

let inventory = readInventoryCache() ?? [];
let pendingOperations = readPendingOperations();
let pendingDeleteId = null;
let selectedDetailItem = null;
let lastSyncedAt = null;
let currentPage = 1;
let toastTimer;
let syncInProgress = false;
let loadInProgress = false;
let syncProblem = false;
let hasLoadedServer = false;
let startupRun = 0;

function setStartupCheck(id, state, detail) {
    const row = document.querySelector(`#check-${id}`);
    row.className = `startup-check is-${state}`;
    row.querySelector('.startup-icon').textContent = state === 'ready' ? '✓' : state === 'warning' ? '!' : '·';
    row.querySelector('small').textContent = detail;
}

function waitForEvent(target, successEvent, failureEvent, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => finish(false, new Error('Check timed out')), timeoutMs);
        const cleanup = () => {
            window.clearTimeout(timer);
            target.removeEventListener(successEvent, onSuccess);
            target.removeEventListener(failureEvent, onFailure);
        };
        const finish = (success, error) => {
            cleanup();
            success ? resolve() : reject(error);
        };
        const onSuccess = () => finish(true);
        const onFailure = () => finish(false, new Error('Resource could not be loaded'));
        target.addEventListener(successEvent, onSuccess, { once: true });
        target.addEventListener(failureEvent, onFailure, { once: true });
    });
}

async function checkBackend() {
    setStartupCheck('backend', 'checking', 'Checking the inventory service…');
    if (!navigator.onLine) throw new Error('You appear to be offline');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    try {
        const response = await fetch(`${API_BASE}/`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Service responded with status ${response.status}`);
        const items = await response.json();
        if (!Array.isArray(items)) throw new Error('Inventory service returned an unexpected response');
        setStartupCheck('backend', 'ready', 'Database and inventory API are responding');
        return items;
    } finally {
        window.clearTimeout(timer);
    }
}

async function checkFontCdn() {
    setStartupCheck('font', 'checking', 'Checking Google Fonts; a local font is ready as backup');
    const fontLink = document.querySelector('#font-cdn');
    try {
        if (!fontLink.sheet) await waitForEvent(fontLink, 'load', 'error', 4500);
        fontLink.media = 'all';
        if (document.fonts?.load) {
            await Promise.race([
                document.fonts.load('16px Manrope'),
                new Promise((resolve) => window.setTimeout(resolve, 1800)),
            ]);
        }
        const fontReady = !document.fonts?.check || document.fonts.check('16px Manrope');
        if (!fontReady) throw new Error('Font service did not finish loading');
        setStartupCheck('font', 'ready', 'Font service is ready');
        return true;
    } catch {
        fontLink.media = 'all';
        setStartupCheck('font', 'warning', 'Font CDN is unavailable; the system font will be used');
        return false;
    }
}

async function checkAppAssets() {
    const stylesheet = document.querySelector('#app-stylesheet');
    const appScript = [...document.scripts].find((script) => script.src.endsWith('/app.js'));
    if (stylesheet?.sheet && appScript) {
        setStartupCheck('assets', 'ready', 'Styles and app code are ready');
        return true;
    }
    setStartupCheck('assets', 'warning', 'A local app file did not load correctly');
    return false;
}

function enterApplication(items = null) {
    window.clearTimeout(startupContinueTimer);
    document.documentElement.classList.remove('booting');
    elements.startupScreen.setAttribute('aria-hidden', 'true');
    updateSyncStatus();
    void loadInventory(items);
}

let startupContinueTimer;

async function runStartupChecks() {
    const run = ++startupRun;
    window.clearTimeout(startupContinueTimer);
    document.documentElement.classList.add('booting');
    elements.startupScreen.classList.remove('has-error');
    elements.startupTitle.textContent = 'Getting things ready';
    elements.startupCopy.textContent = 'Checking your connection and preparing your inventory…';
    elements.startupRetry.disabled = true;
    elements.startupContinue.disabled = true;
    for (const id of ['backend', 'font', 'assets']) {
        setStartupCheck(id, 'checking', id === 'backend' ? 'Checking the inventory service…' : 'Getting this ready…');
    }

    const results = await Promise.allSettled([checkBackend(), checkFontCdn(), checkAppAssets()]);
    if (run !== startupRun) return;

    const backendResult = results[0];
    const initialItems = backendResult.status === 'fulfilled' ? backendResult.value : null;
    if (backendResult.status === 'rejected') {
        const networkUnavailable = !navigator.onLine || /failed to fetch|networkerror/i.test(backendResult.reason?.message || '');
        setStartupCheck('backend', 'warning', networkUnavailable ? 'Database is unavailable; saved items can still be used' : backendResult.reason?.message || 'Database is not reachable');
        syncProblem = true;
    } else {
        hasLoadedServer = true;
        syncProblem = false;
    }

    const appReady = results[2].status === 'fulfilled' && results[2].value;
    const checksPassed = backendResult.status === 'fulfilled' && results[1].status === 'fulfilled' && results[1].value && appReady;
    if (checksPassed) {
        elements.startupTitle.textContent = 'Everything is ready';
        elements.startupCopy.textContent = 'Opening your inventory…';
        window.setTimeout(() => {
            if (run === startupRun) enterApplication(initialItems);
        }, 250);
    } else {
        elements.startupScreen.classList.add('has-error');
        elements.startupTitle.textContent = backendResult.status === 'fulfilled' ? 'Using your saved inventory' : 'Opening your saved inventory';
        elements.startupCopy.textContent = backendResult.status === 'fulfilled'
            ? 'The font service or a local app file needs attention. You can still use your inventory.'
            : 'The database could not be reached. Saved items are available, and offline changes will sync when it returns.';
        elements.startupRetry.disabled = false;
        elements.startupContinue.disabled = false;
        startupContinueTimer = window.setTimeout(() => {
            if (run === startupRun) enterApplication(initialItems);
        }, 1800);
    }
}

function updateCurrentDate() {
    const compact = window.matchMedia('(max-width: 760px)').matches;
    const dateOptions = {
        weekday: compact ? 'short' : 'long',
        month: compact ? 'short' : 'long',
        day: 'numeric',
    };
    if (!compact) dateOptions.year = 'numeric';
    document.querySelector('#today-label').textContent = new Intl.DateTimeFormat(undefined, {
        ...dateOptions,
    }).format(new Date());
}

updateCurrentDate();
window.setInterval(updateCurrentDate, 60_000);
window.addEventListener('resize', updateCurrentDate);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateCurrentDate();
});

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function resolveColour(value) {
    const colour = String(value || '').trim();
    const alias = COLOUR_ALIASES.get(colour.toLocaleLowerCase());
    if (alias) return alias;
    const looksLikeColour = /^#[\da-f]{3,4}(?:[\da-f]{2}){0,2}$/i.test(colour)
        || /^[a-z]+$/i.test(colour)
        || /^(?:rgb|rgba|hsl|hsla)\([\d\s,.%+-]+\)$/i.test(colour);
    return looksLikeColour && CSS.supports('color', colour) ? colour : '#52665a';
}

function readInventoryCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(INVENTORY_CACHE_KEY) || 'null');
        return Array.isArray(cached) ? cached : null;
    } catch {
        return null;
    }
}

function writeInventoryCache(items) {
    try {
        localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(items));
    } catch {
        showToast('Browser storage is unavailable; offline changes may not be kept.', true);
    }
}

function readPendingOperations() {
    try {
        const pending = JSON.parse(localStorage.getItem(PENDING_CACHE_KEY) || '[]');
        return Array.isArray(pending) ? pending : [];
    } catch {
        return [];
    }
}

function writePendingOperations() {
    try {
        localStorage.setItem(PENDING_CACHE_KEY, JSON.stringify(pendingOperations));
    } catch {
        showToast('Browser storage is unavailable; offline changes may not be kept.', true);
    }
    updateSyncStatus();
}

function updateSyncStatus() {
    let statusClass = '';
    let message = 'Connecting…';
    if (!navigator.onLine) {
        statusClass = 'is-offline';
        message = 'Offline · saved here';
    } else if (syncInProgress) {
        statusClass = 'is-pending';
        message = 'Syncing changes…';
    } else if (pendingOperations.length > 0) {
        statusClass = syncProblem ? 'is-error' : 'is-pending';
        message = syncProblem ? 'Waiting to sync' : 'Changes waiting';
    } else if (syncProblem) {
        statusClass = 'is-error';
        message = 'Can’t reach database';
    } else if (hasLoadedServer) {
        statusClass = 'is-synced';
        message = 'All changes saved';
    }
    elements.syncStatus.className = `sync-status ${statusClass}`;
    elements.syncLabel.textContent = message;
}

function applyPendingOperations(databaseItems) {
    const merged = [...databaseItems];
    for (const operation of pendingOperations) {
        if (operation.type === 'create') {
            if (!merged.some((item) => String(item.id) === String(operation.localId))) {
                merged.push({ ...operation.data, id: operation.localId });
            }
        } else if (operation.type === 'update') {
            const index = merged.findIndex((item) => String(item.id) === String(operation.id));
            if (index >= 0) merged[index] = { ...merged[index], ...operation.data, id: merged[index].id };
            else merged.push({ ...operation.data, id: operation.id });
        } else if (operation.type === 'delete') {
            const index = merged.findIndex((item) => String(item.id) === String(operation.id));
            if (index >= 0) merged.splice(index, 1);
        }
    }
    return merged;
}

function isNetworkError(error) {
    return navigator.onLine === false || error.message.startsWith('Could not reach the API');
}

function icon(name) {
    const paths = {
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
        delete: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

async function request(path = '', options = {}) {
    const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } catch {
        throw new Error(`Could not reach the API at ${API_BASE}. Check that the Nest server is running and CORS is enabled.`);
    }

    const raw = await response.text();
    let payload = null;
    if (raw) {
        try { payload = JSON.parse(raw); } catch { payload = raw; }
    }
    if (!response.ok) {
        const detail = payload && typeof payload === 'object'
            ? (Array.isArray(payload.message) ? payload.message.join(', ') : payload.message || payload.error)
            : payload;
        throw new Error(detail || `Request failed (${response.status}).`);
    }
    return payload;
}

async function syncPendingOperations() {
    if (!navigator.onLine) {
        updateSyncStatus();
        return false;
    }
    if (syncInProgress) return false;
    if (pendingOperations.length === 0) {
        updateSyncStatus();
        return true;
    }

    syncInProgress = true;
    syncProblem = false;
    updateSyncStatus();
    try {
        while (pendingOperations.length > 0) {
            const operation = pendingOperations[0];
            const sentData = operation.data ? JSON.stringify(operation.data) : null;
            let result;
            let followUpOperation = null;
            if (operation.type === 'create') {
                result = await request('', { method: 'POST', body: sentData });
                if (!result || result.id === undefined) throw new Error('The API did not return the new item ID. Sync paused.');
                const operationIndex = pendingOperations.indexOf(operation);
                const wasCancelled = operationIndex < 0;
                const existingIndex = inventory.findIndex((item) => String(item.id) === String(operation.localId));
                if (wasCancelled) {
                    inventory = inventory.filter((item) => String(item.id) !== String(operation.localId));
                    followUpOperation = { type: 'delete', id: result.id };
                } else {
                    const latestData = { ...operation.data };
                    const syncedItem = { ...result, ...latestData, id: result.id };
                    if (existingIndex >= 0) inventory[existingIndex] = syncedItem;
                    else inventory.push(syncedItem);
                    if (JSON.stringify(operation.data) !== sentData) {
                        followUpOperation = { type: 'update', id: result.id, data: latestData };
                    }
                }
            } else if (operation.type === 'update') {
                result = await request(`/${encodeURIComponent(operation.id)}`, {
                    method: 'PATCH',
                    body: sentData,
                });
                if (pendingOperations.includes(operation)) {
                    const latestData = { ...operation.data };
                    inventory = inventory.map((item) => String(item.id) === String(operation.id)
                        ? { ...item, ...(result && typeof result === 'object' ? result : {}), ...latestData, id: item.id }
                        : item);
                    if (JSON.stringify(latestData) !== sentData) {
                        followUpOperation = { type: 'update', id: operation.id, data: latestData };
                    }
                }
            } else if (operation.type === 'delete') {
                await request(`/${encodeURIComponent(operation.id)}`, { method: 'DELETE' });
                inventory = inventory.filter((item) => String(item.id) !== String(operation.id));
            }

            const operationIndex = pendingOperations.indexOf(operation);
            if (operationIndex >= 0) pendingOperations.splice(operationIndex, 1);
            if (followUpOperation) pendingOperations.splice(Math.max(operationIndex, 0), 0, followUpOperation);
            writeInventoryCache(inventory);
            writePendingOperations();
            render();
        }
        syncProblem = false;
        return true;
    } catch (error) {
        syncProblem = true;
        showToast(`Your changes are safe on this device. Sync will retry: ${error.message}`, true);
        return false;
    } finally {
        syncInProgress = false;
        updateSyncStatus();
    }
}

function saveOfflineItem(id, item) {
    if (id) {
        inventory = inventory.map((entry) => String(entry.id) === String(id) ? { ...entry, ...item } : entry);
        const pendingCreate = pendingOperations.find((operation) => operation.type === 'create' && String(operation.localId) === String(id));
        const pendingUpdate = pendingOperations.find((operation) => operation.type === 'update' && String(operation.id) === String(id));
        if (pendingCreate) pendingCreate.data = { ...pendingCreate.data, ...item };
        else if (pendingUpdate) pendingUpdate.data = { ...pendingUpdate.data, ...item };
        else pendingOperations.push({ type: 'update', id, data: item });
    } else {
        const localId = `local-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
        inventory.push({ ...item, id: localId });
        pendingOperations.push({ type: 'create', localId, data: item });
    }
    writeInventoryCache(inventory);
    writePendingOperations();
    render();
}

function deleteOfflineItem(id) {
    const pendingCreateIndex = pendingOperations.findIndex((operation) => operation.type === 'create' && String(operation.localId) === String(id));
    if (pendingCreateIndex >= 0) {
        pendingOperations.splice(pendingCreateIndex, 1);
    } else {
        pendingOperations = pendingOperations.filter((operation) => !(operation.type === 'update' && String(operation.id) === String(id)));
        if (!pendingOperations.some((operation) => operation.type === 'delete' && String(operation.id) === String(id))) {
            pendingOperations.push({ type: 'delete', id });
        }
    }
    inventory = inventory.filter((item) => String(item.id) !== String(id));
    writeInventoryCache(inventory);
    writePendingOperations();
    render();
}

function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${isError ? '!' : '✓'}</span><span class="toast-message">${escapeHtml(message)}</span>`;
    elements.toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), 4200);
}

function showLoading(show) {
    elements.loading.classList.toggle('hidden', !show);
}

function render() {
    const query = elements.search.value.trim().toLocaleLowerCase();
    const filtered = inventory.filter((item) => [item.name, item.colour, item.description, item.size]
        .some((value) => String(value ?? '').toLocaleLowerCase().includes(query)));

    document.querySelector('#total-items').textContent = inventory.length.toLocaleString();
    document.querySelector('#visible-count').textContent = filtered.length.toLocaleString();
    document.querySelector('#last-updated').textContent = lastSyncedAt
        ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(lastSyncedAt)
        : '—';

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, pageCount);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);
    const startItem = filtered.length ? startIndex + 1 : 0;
    const endItem = Math.min(startIndex + PAGE_SIZE, filtered.length);
    document.querySelector('#table-summary').textContent = filtered.length
        ? `Showing ${startItem}–${endItem} of ${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`
        : 'Showing 0 items';
    document.querySelector('#page-indicator').textContent = `Page ${currentPage} of ${pageCount}`;
    document.querySelector('#previous-page').disabled = currentPage <= 1;
    document.querySelector('#next-page').disabled = currentPage >= pageCount;
    document.querySelector('#pagination').classList.toggle('hidden', filtered.length <= PAGE_SIZE);

    elements.body.innerHTML = pageItems.map((item) => {
        const name = escapeHtml(item.name || 'Untitled item');
        const colour = escapeHtml(item.colour || '—');
        const initial = escapeHtml((item.name || '?').trim().charAt(0) || '?');
        const safeColor = escapeHtml(resolveColour(item.colour));
        return `<tr tabindex="0" data-item-id="${escapeHtml(item.id)}" aria-label="Open details for ${name}">
      <td class="mobile-product"><div class="product-cell"><span class="product-avatar">${initial}</span><span class="product-name" title="${name}">${name}</span></div></td>
      <td class="mobile-size" data-label="Size"><span class="size-pill">${escapeHtml(item.size)}</span></td>
      <td class="mobile-colour" data-label="Colour"><span class="colour-chip"><span class="colour-dot" style="--swatch:${safeColor}"></span>${colour}</span></td>
      <td class="mobile-description" data-label="Description"><span class="description-cell" title="${escapeHtml(item.description)}">${escapeHtml(item.description || '—')}</span></td>
      <td class="mobile-actions"><div class="row-actions"><button class="icon-button edit-action" type="button" data-action="edit" data-id="${escapeHtml(item.id)}" aria-label="Edit ${name}" title="Edit item">${icon('edit')}</button><button class="icon-button delete-action" type="button" data-action="delete" data-id="${escapeHtml(item.id)}" aria-label="Delete ${name}" title="Delete item">${icon('delete')}</button></div></td>
    </tr>`;
    }).join('');

    const isEmpty = filtered.length === 0;
    elements.empty.classList.toggle('hidden', !isEmpty);
    if (isEmpty) {
        const hasQuery = Boolean(query);
        elements.emptyTitle.textContent = hasQuery ? 'No matching items' : 'Nothing here yet';
        elements.emptyCopy.textContent = hasQuery ? 'Try another search term or clear your search.' : 'Add your first item to start building your inventory.';
        elements.emptyAddButton.classList.toggle('hidden', hasQuery);
    }
}

async function loadInventory(initialItems = null) {
    if (loadInProgress) return;
    loadInProgress = true;
    showLoading(true);
    elements.empty.classList.add('hidden');
    inventory = applyPendingOperations(readInventoryCache() ?? inventory);
    render();
    if (!navigator.onLine) {
        updateSyncStatus();
        showLoading(false);
        loadInProgress = false;
        return;
    }
    try {
        const hadQueuedOperations = pendingOperations.length > 0;
        const operationsSynced = await syncPendingOperations();
        if (!operationsSynced) return;
        const result = Array.isArray(initialItems) && !hadQueuedOperations ? initialItems : await request();
        if (!Array.isArray(result)) throw new Error('The API response was not a list. Check the inventory endpoint.');
        inventory = applyPendingOperations(result);
        writeInventoryCache(inventory);
        hasLoadedServer = true;
        syncProblem = false;
        lastSyncedAt = new Date();
        render();
    } catch (error) {
        syncProblem = true;
        inventory = applyPendingOperations(readInventoryCache() ?? inventory);
        render();
        if (inventory.length === 0) {
            elements.emptyTitle.textContent = 'Could not load inventory';
            elements.emptyCopy.textContent = error.message;
            elements.emptyAddButton.classList.add('hidden');
        }
        showToast(inventory.length ? `Showing locally saved items. ${error.message}` : error.message, true);
    } finally {
        loadInProgress = false;
        updateSyncStatus();
        showLoading(false);
    }
}

function resetErrors() {
    document.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
    document.querySelectorAll('.field.invalid').forEach((field) => field.classList.remove('invalid'));
}

function openForm(item = null) {
    resetErrors();
    elements.form.reset();
    elements.itemId.value = item?.id ?? '';
    elements.name.value = item?.name ?? '';
    elements.size.value = item?.size ?? '';
    elements.colour.value = item?.colour ?? '';
    elements.description.value = item?.description ?? '';
    elements.descriptionCount.textContent = String(elements.description.value.length);
    const itemColour = item?.colour || '#83a98a';
    elements.colourPicker.value = /^#[\da-f]{6}$/i.test(itemColour) ? itemColour : '#83a98a';
    elements.dialogTitle.textContent = item ? 'Edit item' : 'Add an item';
    elements.saveButton.querySelector('span').textContent = item ? 'Save changes' : 'Save item';
    elements.saveButton.querySelector('svg').innerHTML = item ? '<path d="m5 12 4 4L19 6"/>' : '<path d="M12 5v14M5 12h14"/>';
    elements.dialog.showModal();
    window.setTimeout(() => elements.name.focus(), 40);
}

function openDetails(item) {
    selectedDetailItem = item;
    elements.detailTitle.textContent = item.name || 'Untitled item';
    elements.detailName.textContent = item.name || 'Untitled item';
    elements.detailSize.textContent = item.size ?? '—';
    elements.detailColour.textContent = item.colour || '—';
    elements.detailColourDot.style.backgroundColor = resolveColour(item.colour);
    elements.detailDescription.textContent = item.description || '—';
    elements.detailDialog.showModal();
}

function validateForm() {
    resetErrors();
    const errors = {
        name: !elements.name.value.trim() ? 'Please enter an item name.' : '',
        size: elements.size.value === '' || !Number.isFinite(Number(elements.size.value)) || Number(elements.size.value) < 0 ? 'Enter a valid size or quantity (0 or more).' : '',
        colour: !elements.colour.value.trim() ? 'Please enter a colour.' : '',
        description: !elements.description.value.trim() ? 'Please add a short description.' : '',
    };
    let firstInvalid;
    Object.entries(errors).forEach(([fieldName, message]) => {
        if (!message) return;
        const field = document.querySelector(`#item-${fieldName}`);
        field.classList.add('invalid');
        document.querySelector(`#${fieldName}-error`).textContent = message;
        firstInvalid ||= field;
    });
    firstInvalid?.focus();
    return !firstInvalid;
}

async function saveItem(event) {
    event.preventDefault();
    if (!validateForm()) return;
    const id = elements.itemId.value;
    const item = {
        name: elements.name.value.trim(),
        size: Number(elements.size.value),
        colour: elements.colour.value.trim(),
        description: elements.description.value.trim(),
    };
    elements.saveButton.disabled = true;
    elements.saveButton.querySelector('span').textContent = id ? 'Saving...' : 'Adding...';
    try {
        if (!navigator.onLine || String(id).startsWith('local-')) {
            saveOfflineItem(id, item);
            elements.dialog.close();
            if (navigator.onLine) {
                showToast('Saved here. Syncing it now.');
                await loadInventory();
            } else {
                showToast('Saved on this device. It’ll sync when you’re back online.');
            }
            return;
        }

        const savedItem = await request(id ? `/${encodeURIComponent(id)}` : '', {
            method: id ? 'PATCH' : 'POST',
            body: JSON.stringify(item),
        });
        if (savedItem && typeof savedItem === 'object' && savedItem.id !== undefined) {
            const updatedInventory = id
                ? inventory.map((existing) => String(existing.id) === String(id) ? { ...existing, ...item, ...savedItem } : existing)
                : [...inventory, savedItem];
            writeInventoryCache(updatedInventory);
        }
        elements.dialog.close();
        showToast(id ? 'Item updated successfully.' : 'Item added successfully.');
        await loadInventory();
    } catch (error) {
        if (isNetworkError(error)) {
            saveOfflineItem(id, item);
            elements.dialog.close();
            showToast('Saved on this device. It’ll sync when you’re back online.');
        } else {
            showToast(error.message, true);
        }
    } finally {
        elements.saveButton.disabled = false;
        elements.saveButton.querySelector('span').textContent = id ? 'Save changes' : 'Save item';
    }
}

function requestDelete(id) {
    const item = inventory.find((entry) => String(entry.id) === String(id));
    if (!item) return;
    pendingDeleteId = item.id;
    elements.deleteMessage.textContent = `“${item.name}” will be permanently removed from your inventory. This action can’t be undone.`;
    elements.deleteDialog.showModal();
}

async function deleteItem() {
    if (pendingDeleteId === null) return;
    elements.confirmDelete.disabled = true;
    elements.confirmDelete.textContent = 'Deleting...';
    try {
        if (!navigator.onLine || String(pendingDeleteId).startsWith('local-')) {
            deleteOfflineItem(pendingDeleteId);
            elements.deleteDialog.close();
            pendingDeleteId = null;
            if (navigator.onLine) {
                showToast('Removed here. Syncing your changes.');
                await loadInventory();
            } else {
                showToast('Removed from this device. The change will sync when you’re back online.');
            }
            return;
        }

        await request(`/${encodeURIComponent(pendingDeleteId)}`, { method: 'DELETE' });
        writeInventoryCache(inventory.filter((item) => String(item.id) !== String(pendingDeleteId)));
        elements.deleteDialog.close();
        showToast('Item deleted successfully.');
        pendingDeleteId = null;
        await loadInventory();
    } catch (error) {
        if (isNetworkError(error)) {
            deleteOfflineItem(pendingDeleteId);
            elements.deleteDialog.close();
            pendingDeleteId = null;
            showToast('Removed from this device. The change will sync when you’re back online.');
        } else {
            showToast(error.message, true);
        }
    } finally {
        elements.confirmDelete.disabled = false;
        elements.confirmDelete.innerHTML = `${icon('delete')} Delete item`;
    }
}

elements.addButton.addEventListener('click', () => openForm());
elements.emptyAddButton.addEventListener('click', () => openForm());
document.querySelector('#close-dialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#close-details').addEventListener('click', () => elements.detailDialog.close());
document.querySelector('#close-details-button').addEventListener('click', () => elements.detailDialog.close());
document.querySelector('#edit-detail-button').addEventListener('click', () => {
    if (!selectedDetailItem) return;
    const item = selectedDetailItem;
    elements.detailDialog.close();
    openForm(item);
});
document.querySelector('#keep-item-button').addEventListener('click', () => elements.deleteDialog.close());
elements.form.addEventListener('submit', saveItem);
elements.confirmDelete.addEventListener('click', deleteItem);
elements.search.addEventListener('input', () => {
    currentPage = 1;
    render();
});
document.querySelector('#previous-page').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage -= 1;
        render();
    }
});
document.querySelector('#next-page').addEventListener('click', () => {
    currentPage += 1;
    render();
});
document.querySelector('#refresh-button').addEventListener('click', loadInventory);
elements.description.addEventListener('input', () => { elements.descriptionCount.textContent = String(elements.description.value.length); });
elements.colourPicker.addEventListener('input', () => { elements.colour.value = elements.colourPicker.value; });
elements.colour.addEventListener('input', () => {
    if (/^#[\da-f]{6}$/i.test(elements.colour.value.trim())) elements.colourPicker.value = elements.colour.value.trim();
});
elements.body.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (button) {
        const item = inventory.find((entry) => String(entry.id) === button.dataset.id);
        if (button.dataset.action === 'edit' && item) openForm(item);
        if (button.dataset.action === 'delete') requestDelete(button.dataset.id);
        return;
    }
    const row = event.target.closest('tr[data-item-id]');
    const item = row && inventory.find((entry) => String(entry.id) === row.dataset.itemId);
    if (item) openDetails(item);
});
elements.body.addEventListener('keydown', (event) => {
    const row = event.target.closest('tr[data-item-id]');
    if (!row || event.target !== row || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    const item = inventory.find((entry) => String(entry.id) === row.dataset.itemId);
    if (item) openDetails(item);
});

document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !elements.dialog.open && !elements.deleteDialog.open) {
        event.preventDefault();
        elements.search.focus();
    }
    if (event.key === 'Escape') {
        if (elements.dialog.open) elements.dialog.close();
        if (elements.detailDialog.open) elements.detailDialog.close();
        if (elements.deleteDialog.open) elements.deleteDialog.close();
    }
});

elements.startupRetry.addEventListener('click', () => void runStartupChecks());
elements.startupContinue.addEventListener('click', () => enterApplication(readInventoryCache()));

window.addEventListener('offline', () => {
    syncProblem = false;
    updateSyncStatus();
    showToast('You’re offline. Any changes you make will be saved on this device.');
});
window.addEventListener('online', () => {
    syncProblem = false;
    updateSyncStatus();
    showToast(pendingOperations.length ? 'You’re back online. Syncing your changes…' : 'You’re back online. Refreshing your inventory…');
    void loadInventory();
});
window.addEventListener('focus', () => {
    if (navigator.onLine && (pendingOperations.length > 0 || syncProblem)) void loadInventory();
});
window.setInterval(() => {
    if (navigator.onLine && (pendingOperations.length > 0 || syncProblem) && !syncInProgress) void loadInventory();
}, 30_000);

updateSyncStatus();
void runStartupChecks();
