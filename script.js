// --- Supabase ---
const SUPABASE_URL = 'https://wbvhtwzfazjmfsdjbxkf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indidmh0d3pmYXpqbWZzZGpieGtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODkxNDIsImV4cCI6MjA5NjE2NTE0Mn0.cmaMMeB8tDEdGan98v5qWVb6SJLqcySUTDvqR1I-G5c';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

// --- Core State & Viewport Mapping ---
let zoomLevel = 1;
let panX = 0, panY = 0;
let isDirty = false;
let snapToGrid = false;
let roverGender = 'male';
let layoutMode = 'rows';
let rowDirection = 'vertical';
let rowAlign = 'center';
let imageCache = {};
let searchSpawnCounter = 0;

const ELEMENTS = {
    aero: { name: 'Aero', color: '#49F4B2' },
    electro: { name: 'Electro', color: '#A665DD' },
    fusion: { name: 'Fusion', color: '#E58B66' },
    glacio: { name: 'Glacio', color: '#5FBFF5' },
    havoc: { name: 'Havoc', color: '#BE4B91' },
    spectro: { name: 'Spectro', color: '#D9D383' }
};
const elementSelector = document.createElement('div');
elementSelector.id = 'element-selector-popup';
elementSelector.style.cssText = 'position:fixed;z-index:10001;background:#20202b;border:1px solid #4a4a5a;border-radius:8px;padding:5px;display:none;flex-wrap:wrap;gap:3px;width:124px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
elementSelector.addEventListener('click', (e) => e.stopPropagation());
document.body.appendChild(elementSelector);



const workspaceWrapper = document.getElementById('workspace-wrapper');
const workspacePlane = document.getElementById('workspace-plane');
const zoomSlider = document.getElementById('zoom-slider');

function markDirty() { isDirty = true; }
window.addEventListener('beforeunload', (e) => {
    if (isDirty) { e.preventDefault(); e.returnValue = 'Unsaved changes.'; }
});

// --- Settings ---
document.getElementById('sidebar-settings').addEventListener('click', () => {
    document.getElementById('settings-overlay').style.display = 'flex';
    closeSidebar();
});
document.getElementById('settings-overlay').addEventListener('mousedown', (e) => {
    if(e.target === document.getElementById('settings-overlay')) e.target.style.display = 'none';
});
document.getElementById('snap-grid-toggle').addEventListener('change', (e) => { snapToGrid = e.target.checked; });
document.getElementById('show-names-toggle').addEventListener('change', (e) => {
    if (e.target.checked) document.body.classList.remove('hide-names');
    else document.body.classList.add('hide-names');
});
document.getElementById('rover-gender-select').addEventListener('change', (e) => {
    roverGender = e.target.value;
    applyRoverGender();
    markDirty();
});
function applyRosterMode(mode) {
    document.body.classList.toggle('roster-basic', mode === 'basic');
    document.body.classList.toggle('roster-advanced', mode === 'advanced');
    document.getElementById('unsorted-title').textContent = mode === 'basic' ? 'ROSTER' : 'UNSORTED';
}

document.getElementById('roster-mode-select').addEventListener('change', (e) => {
    applyRosterMode(e.target.value);
});

document.getElementById('reset-btn').addEventListener('click', async () => {
    const target = document.getElementById('reset-target').value;
    const unsortedZone = document.getElementById('zone-unsorted');

    document.querySelectorAll('.team').forEach(t => t.remove());
    document.querySelectorAll('.drop-zone .unit').forEach(u => u.remove());

    if (target === 'cloud' && currentUser) {
        try {
            const { data: existing } = await supabaseClient.from('saves').select('id').eq('user_id', currentUser.id).maybeSingle();
            if (existing) {
                await supabaseClient.from('saves').delete().eq('id', existing.id);
            }
        } catch (err) { console.error('Cloud reset failed:', err); }
    }

    imageCache = {};
    fetch('characters.json').then(r => r.json()).then(list => {
        list.forEach(c => {
            imageCache[c.key] = { url: c.file, displayName: c.displayName };
        });
        applyRoverGender();
        loadImagesToUnsorted(unsortedZone);
    });
    document.getElementById('settings-overlay').style.display = 'none';
});

function applyRoverGender() {
    const genderKey = roverGender === 'female' ? 'rover(female)' : 'rover(male)';
    const ref = imageCache[genderKey];
    if (!ref) return;
    document.querySelectorAll('.unit[data-name*="rover"]').forEach(u => {
        u.dataset.name = genderKey;
        u.querySelector('.unit-icon').style.backgroundImage = `url('${ref.url}')`;
    });
}

// --- Mode Toggle ---
const matrixGrid = document.getElementById('matrix-grid');

function moveTeamsToMatrix() {
    const grid = document.getElementById('matrix-grid');
    grid.innerHTML = '';
    document.querySelectorAll('.team').forEach(team => {
        const clone = team.cloneNode(true);
        clone.querySelectorAll('.unit').forEach(u => {
            const cb = u.querySelector('.charge-badge');
            if (cb) cb.style.display = u.dataset.charges === "2" ? 'block' : 'none';
        });
        grid.appendChild(clone);
    });
}

function moveTeamsFromMatrix() {
    const grid = document.getElementById('matrix-grid');
    document.querySelectorAll('.team').forEach(t => t.remove());
    grid.querySelectorAll('.team').forEach(team => {
        const units = team.querySelectorAll('.unit');
        const targetRow = layoutMode === 'rows'
            ? (team.dataset.element
                ? ROWS_CONTAINER.querySelector(`.row[data-element="${team.dataset.element}"]`) || ROWS_CONTAINER.firstElementChild
                : ROWS_CONTAINER.querySelector('.row:not([data-element])') || ROWS_CONTAINER.firstElementChild)
            : null;
        if (layoutMode === 'rows' && targetRow) {
            targetRow.querySelector('.row-body').appendChild(team);
        } else {
            workspacePlane.appendChild(team);
            const rect = team.getBoundingClientRect();
            const coords = getPlaneCoords(rect.left + rect.width/2, rect.top + rect.height/2);
            team.style.left = (coords.x - 135) + 'px';
            team.style.top = (coords.y - 45) + 'px';
        }
        updateTeamLayout(team);
    });
}

document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.dataset.mode;
        const isMatrix = mode === 'matrix';

        if (isMatrix) {
            moveTeamsToMatrix();
        } else {
            moveTeamsFromMatrix();
        }

        document.body.classList.toggle('mode-matrix', isMatrix);
    });
});

// --- Sidebar ---
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
}
document.getElementById('menu-btn').addEventListener('click', openSidebar);
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

// --- Auth ---
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    updateUserUI();
}

function updateUserUI() {
    const label = document.getElementById('sidebar-user-label');
    const syncItem = document.getElementById('sidebar-sync');
    if (currentUser) {
        label.textContent = currentUser.email || currentUser.user_metadata?.username || 'Account';
        syncItem.style.borderLeft = '3px solid #2ecc71';
    } else {
        label.textContent = 'Login / Register';
        syncItem.style.borderLeft = 'none';
    }
}

let authMode = 'login';
document.getElementById('sidebar-user').addEventListener('click', () => {
    if (currentUser) {
        supabaseClient.auth.signOut();
    } else {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
    closeSidebar();
});

document.getElementById('auth-overlay').addEventListener('mousedown', (e) => {
    if (e.target === document.getElementById('auth-overlay')) {
        e.target.style.display = 'none';
        document.getElementById('auth-error').style.display = 'none';
        document.getElementById('auth-success').style.display = 'none';
    }
});

// Auth tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.tab;
        document.getElementById('auth-login-form').style.display = authMode === 'login' ? '' : 'none';
        document.getElementById('auth-register-form').style.display = authMode === 'register' ? '' : 'none';
        document.getElementById('auth-submit').textContent = authMode === 'login' ? 'Login' : 'Register';
        document.getElementById('auth-error').style.display = 'none';
        document.getElementById('auth-success').style.display = 'none';
    });
});

document.getElementById('auth-submit').addEventListener('click', async () => {
    const errorEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    try {
        if (authMode === 'login') {
            const input = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            if (!input || !password) {
                errorEl.textContent = 'Please enter email/username and password.';
                errorEl.style.display = 'block';
                return;
            }
            let email = input;
            if (!input.includes('@')) {
                const { data: resolved, error: resolveErr } = await supabaseClient.rpc('get_email_by_username', { username_param: input });
                if (resolveErr || !resolved) throw new Error('Username not found');
                email = resolved;
            }
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            document.getElementById('auth-overlay').style.display = 'none';
        } else {
            const username = document.getElementById('auth-username').value.trim();
            const email = document.getElementById('auth-email-reg').value.trim();
            const password = document.getElementById('auth-password-reg').value;
            if (!username) {
                errorEl.textContent = 'Please choose a username.';
                errorEl.style.display = 'block';
                return;
            }
            if (!email || !email.includes('@')) {
                errorEl.textContent = 'Please enter a valid email address.';
                errorEl.style.display = 'block';
                return;
            }
            if (password.length < 6) {
                errorEl.textContent = 'Password must be at least 6 characters.';
                errorEl.style.display = 'block';
                return;
            }
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });
            if (error) throw error;
            successEl.textContent = 'Registered! Check your email to confirm, or try logging in.';
            successEl.style.display = 'block';
        }
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
});

// Allow Enter key to submit
document.getElementById('auth-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('auth-submit').click();
});
document.getElementById('auth-password-reg').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('auth-submit').click();
});

let initialLoadDone = false;
supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    updateUserUI();
    if (currentUser && !initialLoadDone) {
        initialLoadDone = true;
        cloudLoad();
    }
});

// --- Cloud Save ---
async function cloudSave(saveData) {
    if (!currentUser) return;
    try {
        const { data: existing } = await supabaseClient.from('saves').select('id').eq('user_id', currentUser.id).maybeSingle();
        if (existing) {
            await supabaseClient.from('saves').update({ data: saveData, updated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
            await supabaseClient.from('saves').insert({ user_id: currentUser.id, data: saveData });
        }
    } catch (err) {
        console.error('Cloud save failed:', err);
    }
}

async function cloudLoad() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.from('saves').select('data').eq('user_id', currentUser.id).maybeSingle();
        if (error) throw error;
        if (data?.data) {
            applySaveData(data.data);
        }
    } catch (err) {
        console.error('Cloud load failed:', err);
    }
}

function applySaveData(data) {
    document.querySelectorAll('.team').forEach(t => t.remove());
    document.querySelectorAll('.unit').forEach(u => u.remove());

    if (data.customIcons) {
        for (const [key, iconData] of Object.entries(data.customIcons)) {
            if (!imageCache[key]) {
                imageCache[key] = { url: iconData.url, displayName: iconData.displayName, custom: true };
            }
        }
    }

    for (const [zoneId, units] of Object.entries(data.roster)) {
        const zone = document.getElementById(zoneId);
        if (zone) {
            units.forEach(uData => {
                if (imageCache[uData.name]) {
                    let uEl = createUnitElement(uData.name, imageCache[uData.name].displayName, imageCache[uData.name].url, zone);
                    uEl.dataset.charges = uData.charges || "1";
                    uEl.querySelector('.charge-badge').style.display = uEl.dataset.charges === "2" ? 'block' : 'none';
                    if (uData.unowned) { uEl.dataset.unowned = "true"; uEl.classList.add('unowned'); }
                }
            });
        }
    }

    if (data.layoutMode) { layoutMode = data.layoutMode; document.getElementById('layout-mode-select').value = layoutMode; }
    if (data.rowDirection) { applyRowDirection(data.rowDirection); document.getElementById('row-direction-select').value = data.rowDirection; }
    if (data.rowAlign) { applyRowAlign(data.rowAlign); document.getElementById('row-align-select').value = data.rowAlign; }
    updateRowSettingsVisibility();
    if (layoutMode === 'rows') {
        switchLayoutMode('rows');
        if (data.rows) {
            document.querySelectorAll('.row').forEach((row, i) => {
                if (data.rows[i] && data.rows[i].element) {
                    applyRowElement(row, data.rows[i].element);
                }
            });
        }
    }
    data.teams.forEach(tData => {
        let team = createNewTeam(null, 0, 0, true);
        if (layoutMode !== 'rows') {
            team.style.left = tData.x;
            team.style.top = tData.y;
        }

        if (tData.name) {
            let label = team.querySelector('.team-name-label');
            if (label) label.textContent = tData.name;
        }
        if (tData.locked) toggleTeamLock(team, true);
        if (tData.element) {
            applyElement(team, tData.element, tData.element2 || null);
            if (layoutMode === 'rows') {
                let r = ROWS_CONTAINER.querySelector(`.row[data-element="${tData.element}"]`) || ROWS_CONTAINER.firstElementChild;
                if (r) r.querySelector('.row-body').appendChild(team);
            }
        }

        tData.units.forEach(uData => {
            let uName = typeof uData === 'string' ? uData : uData.name;
            if (imageCache[uName]) {
                let uEl = createUnitElement(uName, imageCache[uName].displayName, imageCache[uName].url, team);
                let charges = typeof uData === 'string' ? "1" : (uData.charges || "1");
                uEl.dataset.charges = charges;
                uEl.querySelector('.charge-badge').style.display = charges === "2" ? 'block' : 'none';
                if (typeof uData !== 'string' && uData.unowned) { uEl.dataset.unowned = "true"; uEl.classList.add('unowned'); }
            }
        });
        if (layoutMode === 'rows') {
            let r = null;
            if (tData.rowIdx !== undefined && tData.rowIdx >= 0 && tData.rowIdx < ROWS_CONTAINER.children.length) {
                r = ROWS_CONTAINER.children[tData.rowIdx];
            } else {
                r = ROWS_CONTAINER.querySelector(`.row[data-element="${tData.element}"]`) || ROWS_CONTAINER.firstElementChild;
            }
            if (r) r.querySelector('.row-body').appendChild(team);
        }
        updateTeamLayout(team);
    });
    if (data.hideNames) document.body.classList.add('hide-names');
    else document.body.classList.remove('hide-names');
    document.getElementById('show-names-toggle').checked = !data.hideNames;
    if (data.snapToGrid !== undefined) snapToGrid = data.snapToGrid;
    document.getElementById('snap-grid-toggle').checked = snapToGrid;
    if (data.roverGender) { roverGender = data.roverGender; document.getElementById('rover-gender-select').value = roverGender; }
    if (data.rosterMode) {
        document.getElementById('roster-mode-select').value = data.rosterMode;
        applyRosterMode(data.rosterMode);
    }
    document.getElementById('row-direction-row').style.display = layoutMode === 'rows' ? '' : 'none';
    validateRosterAfterLoad();
    loadImagesToUnsorted(document.getElementById('zone-unsorted'));
    applyRoverGender();
    isDirty = false;
}

const ELEMENT_KEYS = ['aero', 'electro', 'spectro', 'fusion', 'glacio', 'havoc'];
const ROWS_CONTAINER = document.getElementById('rows-container');

function buildRows() {
    ROWS_CONTAINER.innerHTML = '';
    ELEMENT_KEYS.forEach(key => {
        let row = document.createElement('div');
        row.className = 'row';
        row.dataset.element = '';

        let topbar = document.createElement('div');
        topbar.className = 'row-topbar';

        let badge = document.createElement('div');
        badge.className = 'element-badge';
        badge.addEventListener('mousedown', (e) => e.stopPropagation());
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            showElementSelectorForRow(badge, row);
        });
        topbar.appendChild(badge);

        let label = document.createElement('span');
        label.className = 'row-element-label';
        label.textContent = '—';
        topbar.appendChild(label);

        row.appendChild(topbar);

        let body = document.createElement('div');
        body.className = 'row-body';
        row.appendChild(body);

        ROWS_CONTAINER.appendChild(row);
    });
}

function showElementSelectorForRow(badge, row) {
    const popup = document.getElementById('element-selector-popup');
    const rect = badge.getBoundingClientRect();
    let left = Math.max(4, Math.min(rect.left - 50, window.innerWidth - 128));
    popup.style.left = left + 'px';
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.innerHTML = '';

    for (const [key, elem] of Object.entries(ELEMENTS)) {
        const opt = document.createElement('div');
        opt.className = 'element-option';
        opt.dataset.element = key;
        opt.style.background = `url('Element_Icons/${elem.name}.png') no-repeat center / contain, ${elem.color}`;
        opt.title = elem.name;
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const current = row.dataset.element;
            if (key === current) {
                applyRowElement(row, null);
            } else {
                applyRowElement(row, key);
            }
            popup.style.display = 'none';
        });
        popup.appendChild(opt);
    }

    popup.querySelectorAll('.element-option').forEach(opt => {
        opt.style.borderColor = opt.dataset.element === row.dataset.element ? '#fff' : 'transparent';
    });
    popup.style.display = 'flex';
}

function applyRowElement(row, elementKey) {
    const badge = row.querySelector('.element-badge');
    const label = row.querySelector('.row-element-label');
    if (elementKey) {
        const c = ELEMENTS[elementKey].color;
        row.dataset.element = elementKey;
        row.classList.add('has-element');
        row.style.setProperty('--row-grad', `linear-gradient(to right, ${c} 50%, ${c} 50%)`);
        badge.style.backgroundColor = c;
        badge.style.backgroundImage = `url('Element_Icons/${ELEMENTS[elementKey].name}.png')`;
        badge.classList.add('has-element');
        label.textContent = ELEMENTS[elementKey].name.toUpperCase();
        row.querySelectorAll('.row-body > .team').forEach(team => {
            applyElement(team, elementKey, null);
        });
    } else {
        delete row.dataset.element;
        row.classList.remove('has-element');
        row.style.removeProperty('--row-grad');
        badge.style.backgroundColor = '';
        badge.style.backgroundImage = '';
        badge.classList.remove('has-element');
        label.textContent = '—';
    }
}

function switchLayoutMode(mode) {
    layoutMode = mode;
    if (mode === 'rows') {
        document.body.classList.add('layout-rows');
        document.getElementById('workspace-plane').querySelectorAll('.team').forEach(team => {
            const elem = team.dataset.element || '';
            let targetRow = null;
            if (elem) {
                targetRow = ROWS_CONTAINER.querySelector(`.row[data-element="${elem}"]`);
            }
            if (!targetRow) targetRow = ROWS_CONTAINER.querySelector('.row:not([data-element])') || ROWS_CONTAINER.firstElementChild;
            targetRow.querySelector('.row-body').appendChild(team);
            team.style.left = ''; team.style.top = '';
            if (targetRow.dataset.element) {
                applyElement(team, targetRow.dataset.element, null);
            }
        });
    } else {
        ROWS_CONTAINER.querySelectorAll('.team').forEach(team => {
            workspacePlane.appendChild(team);
            const rect = team.getBoundingClientRect();
            const coords = getPlaneCoords(rect.left + rect.width/2, rect.top + rect.height/2);
            team.style.left = (coords.x - 135) + 'px';
            team.style.top = (coords.y - 45) + 'px';
        });
        document.body.classList.remove('layout-rows');
    }
}

document.getElementById('layout-mode-select').addEventListener('change', (e) => {
    switchLayoutMode(e.target.value);
    markDirty();
});

function applyRowDirection(dir) {
    rowDirection = dir;
    document.body.classList.toggle('row-direction-vertical', dir === 'vertical');
}

document.getElementById('row-direction-select').addEventListener('change', (e) => {
    applyRowDirection(e.target.value);
    markDirty();
});

function applyRowAlign(align) {
    rowAlign = align;
    document.body.classList.remove('row-align-left', 'row-align-center', 'row-align-right');
    document.body.classList.add('row-align-' + align);
}

document.getElementById('row-align-select').addEventListener('change', (e) => {
    applyRowAlign(e.target.value);
    markDirty();
});

// Show/hide row settings based on layout mode
function updateRowSettingsVisibility() {
    const isRows = document.getElementById('layout-mode-select').value === 'rows';
    document.getElementById('row-direction-row').style.display = isRows ? '' : 'none';
    document.getElementById('row-align-row').style.display = isRows ? '' : 'none';
}
document.getElementById('layout-mode-select').addEventListener('change', updateRowSettingsVisibility);
updateRowSettingsVisibility();

function toggleBottomRosters() {
    const collapsed = document.getElementById('zone-unsorted-wrapper').classList.toggle('collapsed');
    document.getElementById('zone-unowned-wrapper').classList.toggle('collapsed', collapsed);
}
document.getElementById('unsorted-title').addEventListener('click', toggleBottomRosters);
document.getElementById('unowned-title').addEventListener('click', toggleBottomRosters);

buildRows();
// Apply default settings
if (layoutMode === 'rows') switchLayoutMode('rows');
applyRowDirection(rowDirection);
applyRowAlign(rowAlign);
document.body.classList.add('hide-names');
applyRosterMode('basic');
checkSession();

// --- Viewport Panning, Zooming & Anti-Void ---
function updateTransform(smooth = false) {
    workspacePlane.style.transition = smooth ? 'transform 0.3s ease-out' : 'none';
    workspacePlane.style.transform = `scale(${zoomLevel}) translate(${panX}px, ${panY}px)`;
}

zoomSlider.addEventListener('input', (e) => {
    zoomLevel = parseFloat(e.target.value);
    updateTransform();
});

workspaceWrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomLevel += e.deltaY * -0.001;
    zoomLevel = Math.min(Math.max(0.4, zoomLevel), 2.5);
    zoomSlider.value = zoomLevel;
    updateTransform();
});

let isPanning = false;
let startPanX = 0, startPanY = 0;

workspaceWrapper.addEventListener('mousedown', (e) => {
    if (e.target.closest('.team') || e.target.closest('.unit') || e.target.closest('.zoom-container') || e.target.closest('.row-topbar')) return;
    isPanning = true;
    startPanX = e.clientX - (panX * zoomLevel);
    startPanY = e.clientY - (panY * zoomLevel);
});

document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = (e.clientX - startPanX) / zoomLevel;
    panY = (e.clientY - startPanY) / zoomLevel;
    updateTransform();
});

document.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        enforceAntiVoid();
    }
});

// Anti-Void Guardrail: Snaps back if all teams are completely off-screen
function enforceAntiVoid() {
    const teams = document.querySelectorAll('.team');
    if (teams.length === 0) return;

    const wrapperRect = workspaceWrapper.getBoundingClientRect();
    let isAnyVisible = false;

    teams.forEach(team => {
        const rect = team.getBoundingClientRect();
        if (rect.right > wrapperRect.left && rect.left < wrapperRect.right &&
            rect.bottom > wrapperRect.top && rect.top < wrapperRect.bottom) {
            isAnyVisible = true;
        }
    });

    if (!isAnyVisible) {
        panX = 0; panY = 0;
        updateTransform(true);
        setTimeout(() => updateTransform(false), 300);
    }
}

// --- Resizer Logic ---
const resizer = document.getElementById('resizer');
const rosterPanel = document.getElementById('roster-panel');
let isResizing = false;
let isMatrixResizing = false;
resizer.addEventListener('mousedown', () => { isResizing = true; document.body.style.cursor = 'ns-resize'; });
document.getElementById('matrix-resizer').addEventListener('mousedown', () => { isMatrixResizing = true; document.body.style.cursor = 'ns-resize'; });
document.addEventListener('mousemove', (e) => {
    if (isResizing) {
        let newHeight = window.innerHeight - e.clientY;
        newHeight = Math.max(160, Math.min(newHeight, window.innerHeight - 100));
        rosterPanel.style.height = newHeight + 'px';
        workspaceWrapper.style.bottom = newHeight + 'px';
        document.getElementById('fab-add').style.bottom = (newHeight + 10) + 'px';
    }
    if (isMatrixResizing) {
        let newHeight = window.innerHeight - e.clientY;
        newHeight = Math.max(160, Math.min(newHeight, window.innerHeight - 100));
        document.getElementById('matrix-grid').style.height = newHeight + 'px';
    }
});
document.addEventListener('mouseup', () => {
    if (isResizing) { isResizing = false; document.body.style.cursor = 'default'; }
    if (isMatrixResizing) { isMatrixResizing = false; document.body.style.cursor = 'default'; }
});

// --- Load Bundled Characters from Manifest ---
fetch('characters.json').then(r => r.json()).then(list => {
    const unsortedZone = document.getElementById('zone-unsorted');
    list.forEach(c => {
        if (!imageCache[c.key]) {
            imageCache[c.key] = { url: c.file, displayName: c.displayName };
        }
    });
    loadImagesToUnsorted(unsortedZone);
    applyRoverGender();
    isDirty = false;
}).catch(() => {});

const MAX_CUSTOM_ICONS = 10;
const MAX_ICON_SIZE = 50 * 1024;

// Close sidebar on file select
document.getElementById('icons-input').addEventListener('change', () => closeSidebar());
document.getElementById('json-input').addEventListener('change', () => closeSidebar());

// --- Icon Loader ---
document.getElementById('icons-input').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    const unsortedZone = document.getElementById('zone-unsorted');
    let newImagesFound = false;
    let customCount = Object.values(imageCache).filter(v => v.custom).length;
    let errors = [];

    for (let file of files) {
        if (file.name.match(/\.(png|jpe?g|gif|webp)$/i)) {
            if (file.size > MAX_ICON_SIZE) {
                errors.push(`${file.name}: exceeds 50KB limit`);
                continue;
            }
            let rawName = file.name.replace(/\.[^/.]+$/, "");
            let keyName = rawName.toLowerCase();
            if (!imageCache[keyName]) {
                if (currentUser && customCount >= MAX_CUSTOM_ICONS) {
                    errors.push(`Max 10 custom icons reached. Skipped: ${file.name}`);
                    continue;
                }
                const dataUrl = await new Promise(resolve => {
                    const r = new FileReader();
                    r.onload = () => resolve(r.result);
                    r.readAsDataURL(file);
                });
                imageCache[keyName] = { url: dataUrl, displayName: rawName, custom: true };
                customCount++;
                newImagesFound = true;
            }
        }
    }

    if (newImagesFound) {
        loadImagesToUnsorted(unsortedZone);
    }
    if (errors.length) {
        alert(errors.join('\n'));
    }
    e.target.value = '';
});

// --- JSON Loader ---
document.getElementById('json-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const data = JSON.parse(event.target.result);

            document.querySelectorAll('.team').forEach(t => t.remove());
            document.querySelectorAll('.unit').forEach(u => u.remove());

            if (data.customIcons) {
                for (const [key, iconData] of Object.entries(data.customIcons)) {
                    if (!imageCache[key]) {
                        imageCache[key] = { url: iconData.url, displayName: iconData.displayName, custom: true };
                    }
                }
            }

            for (const [zoneId, units] of Object.entries(data.roster)) {
                const zone = document.getElementById(zoneId);
                if (zone) {
                    units.forEach(uData => {
                        if (imageCache[uData.name]) {
                            let uEl = createUnitElement(uData.name, imageCache[uData.name].displayName, imageCache[uData.name].url, zone);
                            uEl.dataset.charges = uData.charges || "1";
                            uEl.querySelector('.charge-badge').style.display = uEl.dataset.charges === "2" ? 'block' : 'none';
                            if (uData.unowned) { uEl.dataset.unowned = "true"; uEl.classList.add('unowned'); }
                        }
                    });
                }
            }

            if (data.layoutMode) { layoutMode = data.layoutMode; document.getElementById('layout-mode-select').value = layoutMode; }
            if (data.rowDirection) { applyRowDirection(data.rowDirection); document.getElementById('row-direction-select').value = data.rowDirection; }
            if (data.rowAlign) { applyRowAlign(data.rowAlign); document.getElementById('row-align-select').value = data.rowAlign; }
            updateRowSettingsVisibility();
            if (layoutMode === 'rows') {
                switchLayoutMode('rows');
                if (data.rows) {
                    document.querySelectorAll('.row').forEach((row, i) => {
                        if (data.rows[i] && data.rows[i].element) {
                            applyRowElement(row, data.rows[i].element);
                        }
                    });
                }
            }
            data.teams.forEach(tData => {
                let team = createNewTeam(null, 0, 0, true);
                if (layoutMode !== 'rows') {
                    team.style.left = tData.x;
                    team.style.top = tData.y;
                }

                if (tData.name) {
                    let label = team.querySelector('.team-name-label');
                    if (label) label.textContent = tData.name;
                }
                if (tData.locked) toggleTeamLock(team, true);
                if (tData.element) {
                    applyElement(team, tData.element, tData.element2 || null);
                    if (layoutMode === 'rows') {
                        let r = ROWS_CONTAINER.querySelector(`.row[data-element="${tData.element}"]`) || ROWS_CONTAINER.firstElementChild;
                        if (r) r.querySelector('.row-body').appendChild(team);
                    }
                }

                tData.units.forEach(uData => {
                    let uName = typeof uData === 'string' ? uData : uData.name;
                    if (imageCache[uName]) {
                        let uEl = createUnitElement(uName, imageCache[uName].displayName, imageCache[uName].url, team);
                        let charges = typeof uData === 'string' ? "1" : (uData.charges || "1");
                        uEl.dataset.charges = charges;
                        uEl.querySelector('.charge-badge').style.display = charges === "2" ? 'block' : 'none';
                        if (typeof uData !== 'string' && uData.unowned) { uEl.dataset.unowned = "true"; uEl.classList.add('unowned'); }
                    }
                });
                updateTeamLayout(team);
            });
            if (data.hideNames) document.body.classList.add('hide-names');
            else document.body.classList.remove('hide-names');
            document.getElementById('show-names-toggle').checked = !data.hideNames;
            if (data.snapToGrid !== undefined) snapToGrid = data.snapToGrid;
            document.getElementById('snap-grid-toggle').checked = snapToGrid;
            if (data.roverGender) { roverGender = data.roverGender; document.getElementById('rover-gender-select').value = roverGender; }
            if (data.rosterMode) {
                document.getElementById('roster-mode-select').value = data.rosterMode;
                applyRosterMode(data.rosterMode);
            }
            document.getElementById('row-direction-row').style.display = layoutMode === 'rows' ? '' : 'none';
            validateRosterAfterLoad();
            loadImagesToUnsorted(document.getElementById('zone-unsorted'));
            applyRoverGender();
            isDirty = false;
        } catch(err) {
            alert("Error parsing JSON layout file. Creating unsorted units instead.");
            loadImagesToUnsorted(document.getElementById('zone-unsorted'));
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

function loadImagesToUnsorted(zone) {
    for (let [keyName, data] of Object.entries(imageCache)) {
        if (keyName === 'rover(male)' && roverGender !== 'male') continue;
        if (keyName === 'rover(female)' && roverGender !== 'female') continue;
        if (!document.querySelector(`.unit[data-name="${keyName}"]`)) {
            createUnitElement(keyName, data.displayName, data.url, zone);
        }
    }
    sortAllZones();
    markDirty();
}

function createUnitElement(id, displayName, iconUrl, targetNode) {
    const unit = document.createElement('div');
    unit.className = 'unit';
    unit.dataset.name = id;
    unit.dataset.charges = "1";
    unit.dataset.unowned = "false";

    const icon = document.createElement('div');
    icon.className = 'unit-icon';
    icon.style.backgroundImage = `url('${iconUrl}')`;

    const nameLabel = document.createElement('div');
    nameLabel.className = 'unit-name';
    nameLabel.textContent = displayName;

    const badge = document.createElement('div');
    badge.className = 'charge-badge';
    badge.textContent = 'x2';

    unit.appendChild(badge);
    unit.appendChild(icon);
    unit.appendChild(nameLabel);

    if (iconUrl.includes('(x2)') || id.includes('(x2)')) {
        unit.dataset.charges = "2";
        badge.style.display = 'block';
    }

    if (imageCache[id]?.custom) {
        const delBtn = document.createElement('div');
        delBtn.className = 'unit-delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            unit.remove();
            delete imageCache[id];
            sortAllZones();
            markDirty();
        });
        unit.appendChild(delBtn);
    }

    const unownedBtn = document.createElement('div');
    unownedBtn.className = 'unit-unowned-btn';
    unownedBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    unownedBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    unownedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isUnowned = unit.dataset.unowned === "true";
        unit.dataset.unowned = isUnowned ? "false" : "true";
        unit.classList.toggle('unowned', !isUnowned);
        sortAllZones();
        markDirty();
    });
    unit.appendChild(unownedBtn);

    if (targetNode) targetNode.appendChild(unit);
    return unit;
}

function sortAllZones() {
    const unownedZone = document.getElementById('zone-unowned');
    const unsortedZone = document.getElementById('zone-unsorted');

    document.querySelectorAll('.drop-zone').forEach(zone => {
        Array.from(zone.querySelectorAll('div.unit')).forEach(u => {
            const isUnowned = u.dataset.unowned === "true";
            if (isUnowned && zone !== unownedZone) {
                unownedZone.appendChild(u);
            } else if (!isUnowned && zone === unownedZone) {
                unsortedZone.appendChild(u);
            }
        });
    });

    [unsortedZone, unownedZone, document.getElementById('zone-main'), document.getElementById('zone-sub'), document.getElementById('zone-support')].forEach(zone => {
        if (!zone) return;
        Array.from(zone.querySelectorAll('div.unit'))
            .sort((a, b) => a.dataset.name.localeCompare(b.dataset.name))
            .forEach(node => zone.appendChild(node));
    });
}

function validateRosterAfterLoad() {
    const teamCounts = {};
    document.querySelectorAll('.team .unit').forEach(unit => {
        const name = unit.dataset.name;
        teamCounts[name] = (teamCounts[name] || 0) + 1;
    });
    document.querySelectorAll('.drop-zone .unit').forEach(unit => {
        const name = unit.dataset.name;
        const inTeams = teamCounts[name] || 0;
        const charges = parseInt(unit.dataset.charges || "1");
        if (inTeams >= charges) {
            unit.remove();
        } else if (inTeams > 0) {
            unit.dataset.charges = String(charges - inTeams);
            if (unit.dataset.charges !== "2") {
                unit.querySelector('.charge-badge').style.display = 'none';
            }
        }
    });
    sortAllZones();
}

function resetInlinePositions(parent) {
    parent.querySelectorAll('.unit').forEach(el => {
        el.style.left = ''; el.style.top = ''; el.style.right = ''; el.style.bottom = '';
    });
}

// --- Map Client Coordinates to Workspace Plane Coordinates ---
function getPlaneCoords(clientX, clientY) {
    const wrapperRect = workspaceWrapper.getBoundingClientRect();
    const planeOriginX = wrapperRect.left + (wrapperRect.width / 2);
    const planeOriginY = wrapperRect.top + (wrapperRect.height / 2);

    let x = (clientX - planeOriginX) / zoomLevel - panX;
    let y = (clientY - planeOriginY) / zoomLevel - panY;
    return {x, y};
}

// --- Drag, Drop, & Click Logic ---
let draggingEl = null, originalParent = null, dragType = null;
let dragOffsetX = 0, dragOffsetY = 0;
let isDragMoved = false, originalRow = null, dragRowsViewX = 0, dragRowsViewY = 0;

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || isPanning) return;

    // Row drag (only in rows mode, grab by topbar)
    if (layoutMode === 'rows') {
        let tb = e.target.closest('.row-topbar');
        if (tb && !e.target.closest('.element-badge')) {
            draggingEl = tb.closest('.row');
            dragType = 'row';
            const rect = draggingEl.getBoundingClientRect();
            dragRowsViewX = e.clientX - rect.left;
            dragRowsViewY = e.clientY - rect.top;
            isDragMoved = false;
            return;
        }
    }

    let unitTarget = e.target.closest('div.unit');
    let teamTarget = e.target.closest('.team');

    if (unitTarget && unitTarget.closest('.team.locked')) {
        unitTarget = null;
    }

    if (unitTarget) teamTarget = null;
    isDragMoved = false;

    if (unitTarget) {
        draggingEl = unitTarget;
        originalParent = draggingEl.parentElement;
        dragType = 'unit';

        const rect = draggingEl.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        draggingEl.classList.add('dragging');
        document.body.appendChild(draggingEl);
        updateTeamLayout(originalParent);
        updateUnitDragPos(e.clientX, e.clientY);
    }
    else if (teamTarget) {
        draggingEl = teamTarget;
        dragType = 'team';
        originalRow = layoutMode === 'rows' ? draggingEl.closest('.row') : null;
        const rect = draggingEl.getBoundingClientRect();
        dragOffsetX = (e.clientX - rect.left) / zoomLevel;
        dragOffsetY = (e.clientY - rect.top) / zoomLevel;
        if (layoutMode === 'rows') {
            dragRowsViewX = e.clientX - rect.left;
            dragRowsViewY = e.clientY - rect.top;
        }
    }
});

document.addEventListener('mousemove', (e) => {
    if (!draggingEl) return;
    isDragMoved = true;

    if (dragType === 'unit') {
        updateUnitDragPos(e.clientX, e.clientY);
    } else if (dragType === 'team') {
        draggingEl.classList.add('dragging-team');
        if (layoutMode === 'rows') {
            draggingEl.style.position = 'fixed';
            draggingEl.style.left = (e.clientX - dragRowsViewX) + 'px';
            draggingEl.style.top = (e.clientY - dragRowsViewY) + 'px';
            draggingEl.style.zIndex = '9999';
            return;
        }
        let coords = getPlaneCoords(e.clientX, e.clientY);

        let newX = coords.x - dragOffsetX;
        let newY = coords.y - dragOffsetY;

        if (snapToGrid) {
            newX = Math.round(newX / 40) * 40;
            newY = Math.round(newY / 40) * 40;
        }
        draggingEl.style.left = newX + 'px';
        draggingEl.style.top = newY + 'px';
    } else if (dragType === 'row') {
        draggingEl.classList.add('dragging-team');
        draggingEl.style.position = 'fixed';
        draggingEl.style.left = (e.clientX - dragRowsViewX) + 'px';
        draggingEl.style.top = (e.clientY - dragRowsViewY) + 'px';
        draggingEl.style.zIndex = '9999';
    }
});

function updateUnitDragPos(x, y) {
    draggingEl.style.left = (x - dragOffsetX) + 'px';
    draggingEl.style.top = (y - dragOffsetY) + 'px';
}

document.addEventListener('mouseup', (e) => {
    if (!draggingEl) return;

    if (!isDragMoved) {
        draggingEl.classList.remove('dragging', 'dragging-team');

        if (dragType === 'unit' && originalParent.classList.contains('drop-zone')) {
            let isDouble = draggingEl.dataset.charges === "2";
            draggingEl.dataset.charges = isDouble ? "1" : "2";
            draggingEl.querySelector('.charge-badge').style.display = isDouble ? 'none' : 'block';
            originalParent.appendChild(draggingEl);
            resetInlinePositions(originalParent);
            sortAllZones();
            markDirty();
        }
        else if (dragType === 'team') {
            if (layoutMode !== 'rows') {
                let edgeDist = 20;
                let teamW = draggingEl.offsetWidth;
                let teamH = draggingEl.offsetHeight;
                if (dragOffsetX > (teamW - edgeDist) || dragOffsetY > (teamH - edgeDist)) {
                    toggleTeamLock(draggingEl);
                }
            }
        }
        else if (dragType === 'unit') {
            originalParent.appendChild(draggingEl);
            resetInlinePositions(originalParent);
            updateTeamLayout(originalParent);
        }
        draggingEl = null; dragType = null; return;
    }

    draggingEl.classList.remove('dragging', 'dragging-team');

    if (dragType === 'unit') {
        draggingEl.style.display = 'none';
        let elemBelow = document.elementFromPoint(e.clientX, e.clientY);
        draggingEl.style.display = '';

        let targetTeam = elemBelow ? elemBelow.closest('.team') : null;
        let targetZone = elemBelow ? elemBelow.closest('.drop-zone') : null;
        let isOverWorkspace = elemBelow ? elemBelow.closest('#workspace-wrapper') : false;

        if (targetTeam && targetTeam.classList.contains('locked')) targetTeam = null;

        let unitToPlace = draggingEl;

        if (draggingEl.dataset.charges === "2" && originalParent.classList.contains('drop-zone') && (targetTeam || isOverWorkspace)) {
            unitToPlace = draggingEl.cloneNode(true);
            unitToPlace.dataset.charges = "1";
            unitToPlace.querySelector('.charge-badge').style.display = 'none';

            draggingEl.dataset.charges = "1";
            draggingEl.querySelector('.charge-badge').style.display = 'none';
            originalParent.appendChild(draggingEl);
            resetInlinePositions(originalParent);
            sortAllZones();
        }

        if (targetZone) {
            let existingInRoster = targetZone.querySelector(`.unit[data-name="${unitToPlace.dataset.name}"]`);
            if (existingInRoster && existingInRoster !== unitToPlace) {
                unitToPlace.remove();
            } else {
                targetZone.appendChild(unitToPlace);
                resetInlinePositions(targetZone);
                sortAllZones();
            }
            markDirty();
        }
        else if (targetTeam && targetTeam.querySelectorAll('div.unit').length < 3) {
            let targetUnits = targetTeam.querySelectorAll('div.unit');
            let insertBefore = null;
            for (let u of targetUnits) {
                let r = u.getBoundingClientRect();
                if (e.clientX < r.left + r.width / 2) {
                    insertBefore = u;
                    break;
                }
            }
            if (insertBefore) {
                targetTeam.insertBefore(unitToPlace, insertBefore);
            } else {
                targetTeam.appendChild(unitToPlace);
            }
            resetInlinePositions(targetTeam);
            updateTeamLayout(targetTeam);
            markDirty();
        }
        else if (isOverWorkspace && !targetTeam) {
            let targetRow = (layoutMode === 'rows' && elemBelow) ? elemBelow.closest('.row') : null;
            createNewTeam(unitToPlace, e.clientX, e.clientY, false, targetRow);
            markDirty();
        }
        else {
            if (unitToPlace !== draggingEl) unitToPlace.remove();
            originalParent.appendChild(draggingEl);
            resetInlinePositions(originalParent);
            updateTeamLayout(originalParent);
        }

        if (originalParent && originalParent.classList.contains('team') && originalParent.querySelectorAll('div.unit').length === 0) {
            originalParent.remove();
        }
    } else if (dragType === 'team' && layoutMode === 'rows') {
        draggingEl.style.position = '';
        draggingEl.style.left = '';
        draggingEl.style.top = '';
        draggingEl.style.zIndex = '';
        draggingEl.style.display = 'none';
        let below = document.elementFromPoint(e.clientX, e.clientY);
        draggingEl.style.display = '';
        let targetRow = below ? below.closest('.row') : null;
        if (targetRow && targetRow !== originalRow) {
            targetRow.querySelector('.row-body').appendChild(draggingEl);
            resetInlinePositions(draggingEl);
            if (targetRow.dataset.element) {
                applyElement(draggingEl, targetRow.dataset.element, null);
            }
        }
        markDirty();
    } else if (dragType === 'row') {
        draggingEl.style.position = '';
        draggingEl.style.left = '';
        draggingEl.style.top = '';
        draggingEl.style.zIndex = '';
        draggingEl.style.display = 'none';
        let below = document.elementFromPoint(e.clientX, e.clientY);
        draggingEl.style.display = '';
        let targetRow = below ? below.closest('.row') : null;
        if (targetRow && targetRow !== draggingEl) {
            let rect = targetRow.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
                ROWS_CONTAINER.insertBefore(draggingEl, targetRow);
            } else {
                ROWS_CONTAINER.insertBefore(draggingEl, targetRow.nextSibling);
            }
        }
        markDirty();
    } else {
        markDirty();
        enforceAntiVoid();
    }
    draggingEl = null; dragType = null;
});

function createNewTeam(unitNode, clientX, clientY, bypassPositioning = false, targetRow = null) {
    let newTeam = document.createElement('div');
    newTeam.className = 'team';

    let topBar = document.createElement('div');
    topBar.className = 'team-topbar';

    let elemBadge = document.createElement('div');
    elemBadge.className = 'element-badge';
    elemBadge.addEventListener('mousedown', (e) => {
        if (e.button === 0) e.stopPropagation();
    });
    elemBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        showElementSelector(elemBadge, newTeam);
    });
    topBar.appendChild(elemBadge);

    function startRename(targetLabel) {
        if (newTeam.classList.contains('locked')) return;
        let input = document.createElement('input');
        input.type = 'text';
        input.value = targetLabel.textContent || "";
        input.style.cssText = 'width:100%;background:transparent;border:none;outline:none;color:#e0e0e0;font:inherit;text-align:center;padding:0;';
        targetLabel.style.display = 'none';
        targetLabel.parentNode.insertBefore(input, targetLabel);
        input.focus();
        input.select();
        let finish = () => {
            let val = input.value.trim();
            targetLabel.textContent = val || "";
            targetLabel.style.display = '';
            input.remove();
            markDirty();
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
            if (ev.key === 'Escape') { ev.preventDefault(); targetLabel.textContent = targetLabel.textContent || ""; targetLabel.style.display = ''; input.remove(); }
        });
    }
    let nameLabel = document.createElement('span');
    nameLabel.className = 'team-name-label';
    nameLabel.addEventListener('mousedown', (e) => {
        if (e.button === 0) e.stopPropagation();
    });
    nameLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        startRename(nameLabel);
    });
    topBar.appendChild(nameLabel);

    let rightGroup = document.createElement('div');
    rightGroup.style.cssText = 'margin-left:auto;display:flex;gap:2px;align-items:center;';

    let lockIcon = document.createElement('div');
    lockIcon.className = 'lock-indicator';
    lockIcon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0"/></svg>';
    lockIcon.addEventListener('mousedown', (e) => {
        if (e.button === 0) e.stopPropagation();
    });
    lockIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTeamLock(newTeam);
    });
    rightGroup.appendChild(lockIcon);

    let delBtn = document.createElement('div');
    delBtn.className = 'delete-btn';
    delBtn.innerHTML = '&#10005;';
    delBtn.addEventListener('mousedown', (e) => {
        if (e.button === 0) e.stopPropagation();
    });
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTeam(newTeam);
    });
    rightGroup.appendChild(delBtn);
    topBar.appendChild(rightGroup);

    newTeam.appendChild(topBar);

    if (unitNode) {
        newTeam.appendChild(unitNode);
        resetInlinePositions(newTeam);
    }

    if (layoutMode === 'rows') {
        let row = targetRow || ROWS_CONTAINER.querySelector('.row:not([data-element])') || ROWS_CONTAINER.firstElementChild;
        row.querySelector('.row-body').appendChild(newTeam);
        if (row.dataset.element && !bypassPositioning) {
            applyElement(newTeam, row.dataset.element, null);
        }
    } else {
        if (!bypassPositioning) {
            let coords = getPlaneCoords(clientX, clientY);
            let x = coords.x - 135;
            let y = coords.y - 45;
            if (snapToGrid) {
                x = Math.round(x / 40) * 40;
                y = Math.round(y / 40) * 40;
            }
            newTeam.style.left = x + 'px';
            newTeam.style.top = y + 'px';
        }
        workspacePlane.appendChild(newTeam);
    }
    updateTeamLayout(newTeam);
    return newTeam;
}

function updateTeamLayout(container) {
    if (container && container.classList.contains('team')) {
        container.dataset.count = container.querySelectorAll('div.unit').length;
    }
}

function toggleTeamLock(team, forceState = null) {
    let isLocked = forceState !== null ? forceState : !team.classList.contains('locked');
    if (isLocked) {
        team.classList.add('locked');
    } else {
        team.classList.remove('locked');
    }
    const lockIcon = team.querySelector('.lock-indicator');
    if (lockIcon) {
        lockIcon.innerHTML = isLocked
            ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
            : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0"/></svg>';
    }
    markDirty();
}

function deleteTeam(team) {
    const unsorted = document.getElementById('zone-unsorted');
    team.querySelectorAll('.unit').forEach(u => {
        unsorted.appendChild(u);
        resetInlinePositions(unsorted);
    });
    team.remove();
    sortAllZones();
    markDirty();
}

// --- Element Selection ---
function showElementSelector(badge, team) {
    const popup = document.getElementById('element-selector-popup');
    const rect = badge.getBoundingClientRect();
    let left = Math.max(4, Math.min(rect.left - 50, window.innerWidth - 128));
    popup.style.left = left + 'px';
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.innerHTML = '';

    for (const [key, elem] of Object.entries(ELEMENTS)) {
        const opt = document.createElement('div');
        opt.className = 'element-option';
        opt.dataset.element = key;
        opt.style.background = `url('Element_Icons/${elem.name}.png') no-repeat center / contain, ${elem.color}`;
        opt.title = elem.name;
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const primary = team.dataset.element;
            const secondary = team.dataset.element2;
            if (key === primary) {
                if (secondary) { applyElement(team, secondary, null); }
                else { applyElement(team, null, null); }
            } else if (key === secondary) {
                applyElement(team, primary, null);
            } else if (!primary) {
                applyElement(team, key, null);
            } else {
                applyElement(team, primary, key);
            }
            popup.style.display = 'none';
        });
        popup.appendChild(opt);
    }

    popup.querySelectorAll('.element-option').forEach(opt => {
        const k = opt.dataset.element;
        if (k === team.dataset.element) opt.style.borderColor = '#fff';
        else if (k === team.dataset.element2) opt.style.borderColor = '#888';
        else opt.style.borderColor = 'transparent';
    });
    popup.style.display = 'flex';
}

function applyElement(team, elementKey, elementKey2) {
    team.classList.remove('has-element');
    team.style.removeProperty('--elem-grad');
    delete team.dataset.element;
    delete team.dataset.element2;
    const badge = team.querySelector('.element-badge');
    if (elementKey) {
        const c1 = ELEMENTS[elementKey].color;
        const c2 = elementKey2 ? ELEMENTS[elementKey2].color : c1;
        team.dataset.element = elementKey;
        if (elementKey2) team.dataset.element2 = elementKey2;
        team.style.setProperty('--elem-grad', `linear-gradient(to right, ${c1} 50%, ${c2} 50%)`);
        team.classList.add('has-element');
        badge.style.backgroundColor = c1;
        badge.style.backgroundImage = `url('Element_Icons/${ELEMENTS[elementKey].name}.png')`;
        badge.classList.add('has-element');
    } else {
        badge.style.backgroundColor = '';
        badge.style.backgroundImage = '';
        badge.classList.remove('has-element');
    }
    if (layoutMode === 'rows' && !elementKey2) {
        if (elementKey) {
            let targetRow = ROWS_CONTAINER.querySelector(`.row[data-element="${elementKey}"]`);
            if (targetRow && targetRow !== team.closest('.row')) {
                targetRow.querySelector('.row-body').appendChild(team);
            }
        } else {
            let unassignedRow = ROWS_CONTAINER.querySelector('.row:not([data-element])');
            if (unassignedRow && unassignedRow !== team.closest('.row')) {
                unassignedRow.querySelector('.row-body').appendChild(team);
            }
        }
    }
    markDirty();
}

document.addEventListener('click', (e) => {
    const popup = document.getElementById('element-selector-popup');
    if (popup.style.display === 'flex' && !e.target.closest('#element-selector-popup') && !e.target.closest('.element-badge')) {
        popup.style.display = 'none';
    }
});

// --- Spacebar Search ---
const searchOverlay = document.getElementById('search-overlay');
const searchInput = document.getElementById('search-input');

document.getElementById('fab-add').addEventListener('click', () => {
    searchOverlay.style.display = 'flex';
    searchInput.focus();
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        searchOverlay.style.display = 'flex';
        searchInput.focus();
    }
    if (e.code === 'Escape') {
        if (searchOverlay.style.display === 'flex') {
            searchOverlay.style.display = 'none'; searchInput.value = '';
        }
        if (document.getElementById('auth-overlay').style.display === 'flex') {
            document.getElementById('auth-overlay').style.display = 'none';
            document.getElementById('auth-error').style.display = 'none';
            document.getElementById('auth-success').style.display = 'none';
        }
    }
});

searchInput.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
        buildTeamFromSearch(searchInput.value);
        searchOverlay.style.display = 'none'; searchInput.value = '';
    }
});

function buildTeamFromSearch(query) {
    if (!query.trim()) return;
    let words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3);
    let unitsFound = [];

    words.forEach(word => {
        let allUnits = Array.from(document.querySelectorAll('.unit'));
        let match = allUnits.find(u => u.dataset.name.startsWith(word) && u.parentElement.classList.contains('drop-zone'));

        if (match) {
            let oldParent = match.parentElement;
            let unitToUse = match;

            if (match.dataset.charges === "2") {
                unitToUse = match.cloneNode(true);
                unitToUse.dataset.charges = "1";
                unitToUse.querySelector('.charge-badge').style.display = 'none';
                match.dataset.charges = "1";
                match.querySelector('.charge-badge').style.display = 'none';
            }

            unitsFound.push(unitToUse);
        }
    });

    if (unitsFound.length > 0) {
        let cascadeOffset = (searchSpawnCounter % 6) * 40;

        const wrapperRect = workspaceWrapper.getBoundingClientRect();
        let mockEventX = wrapperRect.left + (wrapperRect.width / 2) + cascadeOffset;
        let mockEventY = wrapperRect.top + (wrapperRect.height / 2) + cascadeOffset;

        let team = createNewTeam(unitsFound[0], mockEventX, mockEventY);
        for (let i = 1; i < unitsFound.length; i++) {
            team.appendChild(unitsFound[i]);
            resetInlinePositions(team);
        }
        updateTeamLayout(team);
        searchSpawnCounter++;
        markDirty();
    }
}

// --- JSON Save ---
function gatherSaveData() {
    let data = { teams: [], roster: {}, rows: [], hideNames: document.body.classList.contains('hide-names'), snapToGrid, roverGender, layoutMode, rowDirection, rowAlign, rosterMode: document.getElementById('roster-mode-select').value };

    document.querySelectorAll('.team').forEach(team => {
        let label = team.querySelector('.team-name-label');
        let rowIdx = -1;
        if (layoutMode === 'rows') {
            let parentRow = team.closest('.row');
            if (parentRow) rowIdx = Array.from(ROWS_CONTAINER.children).indexOf(parentRow);
        }
        data.teams.push({
            name: label ? label.textContent : "",
            x: team.style.left, y: team.style.top,
            locked: team.classList.contains('locked'),
            element: team.dataset.element || "",
            element2: team.dataset.element2 || "",
            rowIdx: rowIdx,
            units: Array.from(team.querySelectorAll('.unit')).map(u => ({ name: u.dataset.name, charges: u.dataset.charges || "1", unowned: u.dataset.unowned === "true" }))
        });
    });

    document.querySelectorAll('.drop-zone').forEach(zone => {
        data.roster[zone.id] = Array.from(zone.querySelectorAll('.unit')).map(u => ({
            name: u.dataset.name,
            charges: u.dataset.charges,
            unowned: u.dataset.unowned === "true"
        }));
    });

    document.querySelectorAll('.row').forEach(row => {
        data.rows.push({ element: row.dataset.element || "" });
    });

    data.customIcons = {};
    for (const [key, entry] of Object.entries(imageCache)) {
        if (entry.custom) {
            data.customIcons[key] = { url: entry.url, displayName: entry.displayName };
        }
    }

    return data;
}

document.getElementById('sidebar-save').addEventListener('click', () => {
    let data = gatherSaveData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wuwa-team-manager.json';
    a.click();
    URL.revokeObjectURL(url);
    isDirty = false;
    closeSidebar();

    cloudSave(data);
});

let lastSyncTime = 0;
const SYNC_COOLDOWN = 30000;

async function performSync(anchor) {
    const now = Date.now();
    if (now - lastSyncTime < SYNC_COOLDOWN) {
        const remaining = Math.ceil((SYNC_COOLDOWN - (now - lastSyncTime)) / 1000);
        showSyncNotification(anchor, `Wait ${remaining}s`, '#e67e22');
        return;
    }
    if (!currentUser) {
        showSyncNotification(anchor, 'Login first', '#e74c3c');
        return;
    }

    lastSyncTime = now;
    await cloudSave(gatherSaveData());
    showSyncNotification(anchor, 'Synced!');
}

document.getElementById('sidebar-sync').addEventListener('click', async () => {
    await performSync(document.getElementById('sidebar-sync'));
    closeSidebar();
});

function showSyncNotification(anchor, text, color = '#2ecc71') {
    const existing = document.querySelector('.sync-notification');
    if (existing) existing.remove();

    const note = document.createElement('div');
    note.className = 'sync-notification';
    note.textContent = text;
    note.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${color};color:#fff;font-size:14px;padding:8px 20px;border-radius:8px;z-index:9999;opacity:0;transition:opacity 0.3s;pointer-events:none;white-space:nowrap;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.4);`;
    document.body.appendChild(note);
    requestAnimationFrame(() => note.style.opacity = '1');
    setTimeout(() => {
        note.style.opacity = '0';
        setTimeout(() => note.remove(), 300);
    }, 2000);
}

// Auto-sync interval (every 60s when logged in with changes)
setInterval(() => {
    if (isDirty && currentUser) {
        lastSyncTime = Date.now();
        cloudSave(gatherSaveData());
        isDirty = false;
    }
}, 60000);
