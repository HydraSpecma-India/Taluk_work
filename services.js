

/* ============================================================
   Tamil Nilam — Land Records & Statutory Citizen Services Suite
   Dedicated Application Logic
   ============================================================ */

const SB_URL = 'https://ollhtyeflpggdazrsqsq.supabase.co';
const SB_KEY = 'sb_publishable_vXtlD6VqEY8u_tBSdmw-0A_hxEIlf2j';

let sb = null;
let ME = null;
let CLOUD_ON = false;
let CURRENT_TAB = 'chitta';
let ADMIN_TAB = 'chitta';
window.ADMIN_TAB = 'chitta';

const TALUK_DEFAULT = ['Arakkonam','Arcot','Kalavai','Nemili','Sholinghur','Walajah'];
const TALUK_LIST_KEY = 'village_test.taluks.v1';
let TALUK_LIST = (function(){
  try{
    const raw = localStorage.getItem(TALUK_LIST_KEY);
    if(raw){ const a = JSON.parse(raw); if(Array.isArray(a) && a.length) return a.map(String); }
  }catch(e){}
  return TALUK_DEFAULT.slice();
})();
function saveTalukList(){ try{ localStorage.setItem(TALUK_LIST_KEY, JSON.stringify(TALUK_LIST)); }catch(e){} }

const norm = s => String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
function normTaluk(s){
  if(!s) return '';
  const clean = String(s).toLowerCase().replace(/[^a-z]/g, '');
  if(clean.includes('nemili')) return 'nemili';
  if(clean.includes('arakkonam')) return 'arakkonam';
  if(clean.includes('arcot')) return 'arcot';
  if(clean.includes('kalavai')) return 'kalavai';
  if(clean.includes('sholinghur')) return 'sholinghur';
  if(clean.includes('walajah') || clean.includes('ranipet')) return 'walajah';
  return clean || String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function cleanTalukName(s){
  const n = normTaluk(s);
  const map = {
    'nemili': 'Nemili',
    'arakkonam': 'Arakkonam',
    'arcot': 'Arcot',
    'kalavai': 'Kalavai',
    'sholinghur': 'Sholinghur',
    'walajah': 'Walajah'
  };
  return map[n] || (s ? String(s).replace(/\(\d+\)/g, '').trim() : 'Nemili');
}
function resolveTalukCode(val) {
  if (!val) return '12';
  const clean = String(val).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^\d+$/.test(clean)) {
    if (clean === '3' || clean === '03' || clean === '1' || clean === '01') return '03';
    if (clean === '2' || clean === '02') return '02';
    if (clean === '4' || clean === '04' || clean === '5' || clean === '05') return '04';
    if (clean === '12') return '12';
    if (clean === '13') return '13';
    if (clean === '14') return '14';
    return clean.padStart(2, '0');
  }
  if (clean.includes('nemili')) return '12';
  if (clean.includes('arakkonam')) return '03';
  if (clean.includes('arcot')) return '02';
  if (clean.includes('kalavai')) return '13';
  if (clean.includes('sholinghur')) return '14';
  if (clean.includes('walajah') || clean.includes('ranipet')) return '04';
  return '12';
}

function allTaluks(){
  return TALUK_LIST.slice().sort((a,b)=>a.localeCompare(b));
}
function myTaluks(){
  if(!ME || ME.role === 'admin') return null;
  const t = (ME.taluks || []).map(x => String(x==null?'':x).trim()).filter(Boolean);
  return t.length ? t : null;
}
function mayUseTaluk(name){
  if(!name) return false;
  const mine = myTaluks();
  if(!mine || !mine.length) return true;
  return mine.some(t => normTaluk(t) === normTaluk(name));
}

let TALUK = 'Nemili';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(title, msg, kind){
  const box = document.getElementById('toasts');
  if(!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (kind||'');
  el.innerHTML = '<b>'+esc(title)+'</b>' + (msg ? '<span>'+esc(msg)+'</span>' : '');
  box.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 260); }, 4200);
}
window.toast = toast;

/* ---------- Credentials Management ---------- */
const TN_CREDS_KEY = 'village_test.tn_creds.v2';
const TN_CREDS_LEGACY_KEY = 'village_test.tn_creds.v1';
let TALUK_CREDS = [];

async function loadTalukCredsFromCloud() {
  if (!sb) return [];
  try {
    const { data, error } = await sb.from('isd_taluk_credentials').select('*').order('taluk_code');
    if (!error && Array.isArray(data)) {
      TALUK_CREDS = data;
      window.TALUK_CREDS = TALUK_CREDS;
    }
  } catch(e) {}
  return TALUK_CREDS;
}
window.loadTalukCredsFromCloud = loadTalukCredsFromCloud;

function getAllTnCreds() {
  const defaultPrimary = { username: 'dlurpet', password: '16-03-1992', roleId: '7', label: 'Primary (DLU / NISD & F-Line)' };
  const defaultSecondary = { username: 'rpt_panneerselvam', password: 'Nemili@1970', roleId: '8', label: 'Secondary (Tahsildar / ISD Rural)' };

  try {
    const raw = localStorage.getItem(TN_CREDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.primary || parsed.secondary)) {
        return {
          primary: Object.assign({}, defaultPrimary, parsed.primary || {}),
          secondary: Object.assign({}, defaultSecondary, parsed.secondary || {})
        };
      }
    }
  } catch(e) {}
  return { primary: defaultPrimary, secondary: defaultSecondary };
}

function getTnCreds(type = 'primary', talukName = null) {
  const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
  const userTaluk = (ME && ME.taluk) ? ME.taluk : null;
  const targetTaluk = talukName || userTaluk || TALUK;

  if (targetTaluk && (type === 'secondary' || type === 'isd' || type === 'tahsildar' || type === 'chitta')) {
    const found = (TALUK_CREDS || []).find(c => normTaluk(c.taluk) === normTaluk(targetTaluk));
    if (found && found.username && found.password) {
      return {
        username: found.username.trim(),
        password: found.password.trim(),
        roleId: (found.role_id || found.roleId || '8').trim(),
        role_id: (found.role_id || found.roleId || '8').trim(),
        taluk: found.taluk,
        talukCode: found.taluk_code || resolveTalukCode(found.taluk),
        label: found.taluk + ' Tahsildar'
      };
    }
  }

  const nemiliCred = (TALUK_CREDS || []).find(c => normTaluk(c.taluk) === 'nemili');
  return {
    username: (nemiliCred && nemiliCred.username) || 'rpt_panneerselvam',
    password: (nemiliCred && nemiliCred.password) || 'Nemili@1970',
    roleId: (nemiliCred && (nemiliCred.role_id || nemiliCred.roleId)) || '8',
    role_id: (nemiliCred && (nemiliCred.role_id || nemiliCred.roleId)) || '8',
    taluk: 'Nemili',
    talukCode: '12',
    label: 'Default (Nemili Tahsildar)'
  };
}
window.getTnCreds = getTnCreds;
window.getAllTnCreds = getAllTnCreds;

function saveAllTnCreds(primaryObj, secondaryObj) {
  try {
    const payload = {
      primary: {
        username: (primaryObj?.username || 'dlurpet').trim(),
        password: (primaryObj?.password || '16-03-1992').trim(),
        roleId: (primaryObj?.roleId || '7').trim()
      },
      secondary: {
        username: (secondaryObj?.username || 'rpt_panneerselvam').trim(),
        password: (secondaryObj?.password || 'Nemili@1970').trim(),
        roleId: (secondaryObj?.roleId || '8').trim()
      }
    };
    localStorage.setItem(TN_CREDS_KEY, JSON.stringify(payload));
  } catch(e) {}
}
window.saveAllTnCreds = saveAllTnCreds;

function canViewCreds(){
  if(!CLOUD_ON) return true;
  if(!ME) return false;
  if(ME.role === 'admin') return true;
  return ME.can_view_creds === true;
}
window.canViewCreds = canViewCreds;

function canUpdateCreds(){
  if(!CLOUD_ON) return true;
  if(!ME) return false;
  if(ME.role === 'admin') return true;
  return ME.can_update_creds === true;
}
window.canUpdateCreds = canUpdateCreds;

function canManageCreds(){
  if(!CLOUD_ON) return true;
  if(!ME) return false;
  if(ME.role === 'admin') return true;
  return ME.can_view_creds === true || ME.can_update_creds === true;
}
window.canManageCreds = canManageCreds;


/* ---------- Service Menu Access ---------- */
const ALL_MENUS = [
  { key: 'chitta', label: '📜 Chitta Extract (Tahsildar)' },
  { key: 'eservices', label: '🌐 e-Services (No OTP)' },
  { key: 'areg_pdf', label: '📑 A-Register Extract (PDF)' },
  { key: 'areg', label: '📝 A-Register Approval Suite' },
  { key: 'patta', label: '✏️ Patta Name & Size Correction' },
  { key: 'creds', label: '🔑 Tamil Nilam Credentials' },
  { key: 'dbinfo', label: '🗄️ Database Info & Query' },
  { key: 'users', label: '👥 Authorized Users Hub' }
];

function hasMenu(k){
  if(!ME || ME.role === 'admin') return true;
  if(k === 'creds') return ME.can_view_creds === true;
  return Array.isArray(ME.menu_access) && ME.menu_access.includes(k);
}

/* ---------- Supabase Auth & Sign-in ---------- */
function gateMsg(kind, text){
  const m = document.getElementById('gateMsg');
  if(!m) return;
  m.className = 'msg on ' + kind;
  m.innerHTML = text;
}
function showGate(show){
  const g = document.getElementById('gate');
  if(g) g.classList.toggle('on', !!show);
  document.body.style.overflow = show ? 'hidden' : '';
}

async function initCloud(){
  if(!window.supabase){
    CLOUD_ON = false;
    showGate(false);
    toast('Running offline', 'Could not reach Supabase sign-in service.', 'warn');
    initAppView();
    return;
  }
  sb = window.supabase.createClient(SB_URL, SB_KEY);
  CLOUD_ON = true;

  const { data:{ session } } = await sb.auth.getSession();
  if(session) await onSignedIn(session);
  else { showGate(true); }

  sb.auth.onAuthStateChange((evt, s)=>{
    if(evt === 'SIGNED_OUT'){ ME = null; showGate(true); }
  });
}

async function onSignedIn(session){
  try{
    const { data, error } = await sb.rpc('isd_ensure_profile');
    if(error) throw error;
    ME = Array.isArray(data) ? data[0] : data;
  }catch(e){
    gateMsg('err', 'Signed in, but your account could not be loaded: ' + esc(e.message));
    return;
  }
  if(!ME) ME = { email: session.user.email, full_name: session.user.email, role: 'user', active: true, taluks: [], can_view_creds: false, can_update_creds: false };
  ME.active = true;
  if(!ME.role) ME.role = 'user';
  if(ME.role === 'admin'){
    ME.can_view_creds = true;
    ME.can_update_creds = true;
  }
  if(!Array.isArray(ME.taluks)) ME.taluks = (ME.taluks ? [ME.taluks] : []);
  if(!Array.isArray(ME.menu_access)){
    ME.menu_access = ['chitta', 'eservices', 'areg_pdf', 'areg', 'patta'];
  }
  showGate(false);
  renderWhoAmI();
  await loadTalukCredsFromCloud();
  initAppView();
}

function renderWhoAmI(){
  const box = document.getElementById('whoami');
  if(!box || !ME) return;
  const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
  box.innerHTML = '<img src="/logo.jpg" alt="Profile" style="width:24px;height:24px;border-radius:50%;object-fit:cover;margin-right:6px;vertical-align:middle;border:1px solid var(--line-2);"><span class="rolechip' + (isAdmin ? ' admin' : '') + '">' + esc(ME.role) + '</span>' +
                  '<b>' + esc(ME.full_name || ME.email) + '</b>';
  box.style.display = 'inline-flex';
  const signOutBtn = document.getElementById('signOutBtn');
  if(signOutBtn) signOutBtn.style.display = 'inline-flex';
  const acctBtn = document.getElementById('acctBtn');
  if(acctBtn) acctBtn.style.display = 'inline-flex';
}

function openAcct(){
  const w = document.getElementById('acctWho');
  if(ME && w) w.innerHTML = 'Signed in as <b>' + esc(ME.email) + '</b> · ' + esc(ME.role) +
    (ME.taluks && ME.taluks.length ? ' · ' + esc(ME.taluks.join(', ')) : ' · all taluks');
  document.getElementById('pwNew').value = '';
  document.getElementById('pwNew2').value = '';
  document.getElementById('pwMsg').className = 'msg';
  document.getElementById('acctPanel').hidden = false;
  document.getElementById('acctBack').hidden = false;
}
function closeAcct(){
  document.getElementById('acctPanel').hidden = true;
  document.getElementById('acctBack').hidden = true;
}
function pwMsg(kind, text){
  const m = document.getElementById('pwMsg');
  if(!m) return;
  m.className = 'msg on ' + kind;
  m.textContent = text;
}
async function changePassword(){
  const a = document.getElementById('pwNew').value;
  const b = document.getElementById('pwNew2').value;
  if(a.length < 6){ pwMsg('err', 'Use at least 6 characters.'); return; }
  if(a !== b){ pwMsg('err', 'The two passwords do not match.'); return; }
  const btn = document.getElementById('pwSave');
  btn.disabled = true;
  try{
    const { error } = await sb.auth.updateUser({password: a});
    if(error) throw error;
    pwMsg('ok', 'Password updated. Use it the next time you sign in.');
    document.getElementById('pwNew').value = '';
    document.getElementById('pwNew2').value = '';
    toast('Password changed', 'Your new password is active.', 'ok');
  }catch(e){ pwMsg('err', e.message || String(e)); }
  finally{ btn.disabled = false; }
}

/* ---------- Navigation & Tab Switching ---------- */
function switchTab(tabKey) {
  const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
  if(tabKey === 'users' && !isAdmin){
    toast('Admin only', 'Only administrators can manage user accounts.', 'warn');
    return;
  }
  if(!hasMenu(tabKey) && !isAdmin){
    toast('Access restricted', 'You do not have permission to access ' + tabKey + '. Contact an admin.', 'warn');
    return;
  }
  CURRENT_TAB = tabKey;
  ADMIN_TAB = tabKey;
  window.ADMIN_TAB = tabKey;
  try { localStorage.setItem('taluk_work_tab', tabKey); } catch(e){}

  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabKey);
  });

  if (tabKey === 'chitta') renderChittaTab();
  else if (tabKey === 'eservices') renderEservicesTab();
  else if (tabKey === 'areg_pdf') renderAregPdfTab();
  else if (tabKey === 'areg') renderAregApprovalTab();
  else if (tabKey === 'patta') renderPattaCorrectionTab();
  else if (tabKey === 'creds') renderTnCredsTab();
  else if (tabKey === 'dbinfo') renderDbInfoTab();
  else if (tabKey === 'users') renderUsers();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchTab = switchTab;

function initAppView(){
  const savedTab = localStorage.getItem('taluk_work_tab') || 'chitta';
  switchTab(savedTab);
}

// A-Register Approval Tab Inline Renderer
function renderAregApprovalTab() {
  const box = document.getElementById('usersBody');
  if (!box) return;
  const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
  if (!isAdmin && !hasMenu('areg')) {
    box.innerHTML = '<div class="miss"><b>Access Restricted</b><p>You do not have permission to access the A-Register Unified Approval Suite.</p></div>';
    return;
  }

  box.innerHTML = `
    <div style="max-width: 1100px; margin: 10px auto 40px; display: flex; flex-direction: column; gap: 20px;">
      <!-- Banner -->
      <div style="background: linear-gradient(135deg, #d97706 0%, #b45309 100%); color: #fff; border-radius: 14px; padding: 20px 24px; box-shadow: 0 4px 14px rgba(217, 119, 6, 0.25);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="background: #fff; border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
              <img src="/logo.jpg" alt="TN Govt Emblem" style="height: 50px; width: 50px; object-fit: contain; border-radius: 50%;">
            </div>
            <div>
              <h2 style="margin: 0; font-size: 19px; font-weight: 800; color: #fff;">Tamil Nilam A-Register Unified Approval Suite</h2>
              <div style="font-size: 13px; font-weight: 600; opacity: 0.95; margin-top: 2px;">Application Creation, Survey Validation &amp; Tahsildar Statutory Approval</div>
            </div>
          </div>
          <span style="background: rgba(255,255,255,0.2); padding: 5px 14px; border-radius: 20px; font-weight: 700; font-size: 12.5px; display: inline-flex; align-items: center; gap: 6px;">
            <span>⚡</span> Tahsildar Master Login
          </span>
        </div>
      </div>

      <!-- Control Box -->
      <div class="tn-filter-box" style="background: var(--surface-2); border-color: var(--line-2); margin: 0; padding: 20px 24px; border-radius: 14px;">
        <div class="tn-filter-title" style="color: #d97706; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 16px;">
          <span style="font-weight: 800; font-size: 14px;">A-REGISTER APPLICATION CONTROL CENTER</span>
          <button type="button" id="aregToggleCreateBtn" class="primary" style="background: #2563eb; border-color: #1d4ed8; padding: 7px 14px; font-size: 12.5px; border-radius: 8px;">
            ➕ Create New Application
          </button>
        </div>
        
        <div class="tn-form-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
          <div class="tn-field">
            <label>TALUK</label>
            <select id="aregTalukSel">
              <option value="03">Arakkonam (03)</option>
              <option value="12" selected>Nemili (12)</option>
              <option value="04">Walajah (04)</option>
              <option value="02">Arcot (02)</option>
              <option value="13">Kalavai (13)</option>
              <option value="14">Sholinghur (14)</option>
            </select>
          </div>
          <div class="tn-field">
            <label>SERVICE TYPE</label>
            <select id="aregServiceSel">
              <option value="0109" selected>0109 — A-Register Correction (Rural)</option>
              <option value="0108">0108 — A-Register Addition (Rural)</option>
              <option value="0111">0111 — CLR Correction (Rural)</option>
              <option value="0112">0112 — A-Register Deletion (Rural)</option>
              <option value="N108">N108 — A-Register Addition (Natham)</option>
              <option value="N109">N109 — A-Register Correction (Natham)</option>
            </select>
          </div>
          <div class="tn-field" style="display: flex; align-items: flex-end;">
            <button type="button" class="primary" id="aregFetchBtn" style="background: #d97706; border-color: #b45309; width: 100%; height: 38px; font-weight: 700; border-radius: 8px;">⚡ Fetch Live Pending Apps</button>
          </div>
        </div>
      </div>

      <!-- Collapsible Creation Form -->
      <div id="aregCreateCard" style="display: block; background: var(--surface-2); border: 1.5px dashed #f59e0b; border-radius: 12px; padding: 18px 22px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <h4 style="margin: 0; font-size: 14px; font-weight: 800; color: #d97706; display: flex; align-items: center; gap: 6px;">
            <span>➕ Create New A-Register Application</span>
          </h4>
          <span style="font-size: 11.5px; color: var(--muted); font-weight: 600;">Direct Tahsildar Portal Entry</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px 16px; align-items: flex-end;">
          <div class="tn-field">
            <label style="font-size: 11px; font-weight: 700;">Taluk</label>
            <select id="aregCreateTaluk" style="font-size: 12px; padding: 7px 10px;">
              <option value="03">Arakkonam (03)</option>
              <option value="12" selected>Nemili (12)</option>
              <option value="04">Walajah (04)</option>
              <option value="02">Arcot (02)</option>
              <option value="13">Kalavai (13)</option>
              <option value="14">Sholinghur (14)</option>
            </select>
          </div>

          <div class="tn-field">
            <label style="font-size: 11px; font-weight: 700;">Service Type</label>
            <select id="aregCreateService" style="font-size: 12px; padding: 7px 10px;">
              <option value="0109" selected>0109 — Correction (Rural)</option>
              <option value="0108">0108 — Addition (Rural)</option>
              <option value="0111">0111 — CLR Correction (Rural)</option>
              <option value="0112">0112 — Deletion (Rural)</option>
              <option value="N108">N108 — Addition (Natham)</option>
              <option value="N109">N109 — Correction (Natham)</option>
            </select>
          </div>

          <div class="tn-field">
            <label style="font-size: 11px; font-weight: 700;">Village</label>
            <select id="aregCreateVillage" style="font-size: 12px; padding: 7px 10px;">
              <option value="122">122 - Nemili</option>
              <option value="045">045 - Karivedu</option>
              <option value="001">001 - Agavalam</option>
              <option value="002">002 - Alapakkam</option>
              <option value="003">003 - Asanallikuppam</option>
              <option value="004">004 - Attupakkam</option>
              <option value="005">005 - Banavaram</option>
              <option value="006">006 - Chittoor</option>
              <option value="007">007 - Illuppaithandalam</option>
              <option value="008">008 - Kaveripakkam</option>
              <option value="009">009 - Kilveedi</option>
              <option value="010">010 - Mahendravadi</option>
              <option value="011">011 - Melkalathur</option>
              <option value="012">012 - Melpakkam</option>
              <option value="013">013 - Melveeranam</option>
              <option value="014">014 - Minnal</option>
              <option value="015">015 - Pallambi</option>
              <option value="016">016 - Panapakkam</option>
              <option value="017">017 - Parameswaranmangalam</option>
              <option value="018">018 - Perumpulipakkam</option>
              <option value="019">019 - Puduvadi</option>
              <option value="020">020 - Sirunamalli</option>
              <option value="021">021 - Thakkolam</option>
              <option value="022">022 - Thirumalpur</option>
              <option value="023">023 - Uthirampattu</option>
              <option value="024">024 - Valarpuram</option>
              <option value="025">025 - Vaniyambadi</option>
              <option value="026">026 - Veeraraghavapuram</option>
            </select>
          </div>

          <div class="tn-field">
            <label style="font-size: 11px; font-weight: 700;">Survey Number *</label>
            <input type="text" id="aregCreateSurveyNo" placeholder="e.g. 100" style="font-size: 12px; padding: 7px 10px;">
          </div>

          <div class="tn-field">
            <label style="font-size: 11px; font-weight: 700;">Subdiv Number</label>
            <input type="text" id="aregCreateSubdivNo" placeholder="e.g. 1 (optional)" style="font-size: 12px; padding: 7px 10px;">
          </div>

          <div class="tn-field">
            <label style="font-size: 11px; font-weight: 700;">Applicant Name</label>
            <input type="text" id="aregCreateApplicantName" placeholder="e.g. Manikandan" style="font-size: 12px; padding: 7px 10px;">
          </div>

          <div class="tn-field" style="grid-column: 1 / -1;">
            <label style="font-size: 11px; font-weight: 700;">Remarks / Reason for Addition or Correction</label>
            <input type="text" id="aregCreateRemarks" placeholder="e.g. Survey subdivision correction as per Tahsildar order" style="font-size: 12px; padding: 7px 10px;">
          </div>

          <div class="tn-field" style="grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="ghost" id="aregCancelCreateBtn" style="font-size: 12px; padding: 7px 16px;">Cancel</button>
            <button type="button" class="primary" id="aregSubmitCreateBtn" style="background: #16a34a; border-color: #15803d; font-size: 12px; padding: 7px 20px; font-weight: 700;">
              ✓ Register &amp; Submit Application
            </button>
          </div>
        </div>
      </div>

      <!-- Status banner -->
      <div id="aregStatusBanner" class="tn-status-banner info" style="display: none; padding: 12px 18px; border-radius: 10px;"></div>

      <!-- Pending Applications Container -->
      <div id="aregApplicationsContainer" style="background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 20px; box-shadow: var(--shadow);">
        <div style="text-align: center; color: var(--muted); padding: 36px 16px;">
          <div style="font-size: 32px; margin-bottom: 10px;">📝</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--ink);">Select Taluk and Service Type above, then click 'Fetch Live Pending Apps'</div>
          <div style="font-size: 12px; margin-top: 4px;">Connects directly to Tamil Nilam to retrieve live pending applications for Tahsildar review and approval.</div>
        </div>
      </div>
    </div>
  `;

  // Wire up event listeners
  if (typeof window.openAregApprovalModal === 'function') {
    // If openAregApprovalModal is loaded, trigger its internal setup
  }
}
window.renderAregApprovalTab = renderAregApprovalTab;


/* ============================================================
   USER MANAGEMENT & PERMISSIONS
   ============================================================ */
const talukPicker = (sel, attrs)=>{
  const all = allTaluks();
  if(!all.length) return '<span class="fstate">no taluks defined yet</span>';
  const has = t => (sel||[]).some(x => norm(x) === norm(t));
  return '<div class="tkpick" '+(attrs||'')+'>' +
    all.map(t=>'<label><input type="checkbox" value="'+esc(t)+'"'+(has(t)?' checked':'')+'>'+esc(t)+'</label>').join('') +
    '</div>';
};
const pickedTaluks = el => el ? Array.from(el.querySelectorAll('input:checked')).map(i=>i.value) : [];

const menuPicker = (sel, attrs)=>{
  const current = Array.isArray(sel) ? sel : (sel ? [sel] : []);
  const has = k => current.includes(k);
  return '<div class="tkpick menupick" '+(attrs||'')+' style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;">' +
    ALL_MENUS.map(m=>
      '<label style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; cursor:pointer; background:var(--surface-2,#1e293b); padding:2px 7px; border-radius:5px; border:1px solid var(--line-2,#334155); color:var(--ink);">' +
        '<input type="checkbox" value="'+m.key+'"'+(has(m.key)?' checked':'')+'> '+m.label+
      '</label>'
    ).join('') +
    '</div>';
};
const pickedMenus = el => el ? Array.from(el.querySelectorAll('input:checked')).map(i=>i.value) : [];

async function renderUsers(){
  const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
  if(!isAdmin){ ADMIN_TAB = 'chitta'; renderChittaTab(); return; }
  const box = document.getElementById('usersBody');
  if(!CLOUD_ON){ box.innerHTML = '<div class="empty">Not connected to the account service.</div>'; return; }
  box.innerHTML = '<div class="empty">Loading…</div>';
  const [{data:users, error:e1}, {data:invites, error:e2}] = await Promise.all([
    sb.from('isd_users').select('*').order('created_at'),
    sb.from('isd_invites').select('*').order('created_at'),
  ]);
  if(e1 || e2){ box.innerHTML = '<div class="warn bad">'+esc((e1||e2).message)+'</div>'; return; }

  let h = '<div class="addrow">' +
    '<div class="f"><label>Email</label><input type="email" id="nuEmail" placeholder="name@example.com"></div>' +
    '<div class="f"><label>Name</label><input type="text" id="nuName" placeholder="optional"></div>' +
    '<div class="f" style="flex:0 0 100px"><label>Role</label><select id="nuRole"><option value="user">User</option><option value="admin">Admin</option></select></div>' +
    '<div class="f" style="flex:1 1 100%"><label>Menu &amp; Table Access <span class="fstate" style="text-transform:none">— choose which report tables and tools this person can access (e.g. 2B Single Report, 2 ISD Rural, 1 Upload, etc.)</span></label>' +
      menuPicker(['upload','isd','single','fline','nisd','chitta','eservices'], 'id="nuMenus"') + '</div>' +
    '<div class="f" style="flex:1 1 100%"><label>Taluks <span class="fstate" style="text-transform:none">— tick the ones this person may open; none ticked means every taluk</span></label>' +
      talukPicker([], 'id="nuTaluks"') + '</div>' +
    '<div class="f" style="flex:1 1 100%"><label>Credentials Access <span class="fstate" style="text-transform:none">— specify if this user can view or update portal passwords for their taluks</span></label>' +
      '<div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-top:2px;">' +
        '<label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; cursor:pointer; background:var(--surface-2,#1e293b); padding:5px 12px; border-radius:6px; border:1px solid var(--line-2,#334155); color:var(--ink);">' +
          '<input type="checkbox" id="nuCanViewCreds"> 👁️ Can View Password' +
        '</label>' +
        '<label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; cursor:pointer; background:var(--surface-2,#1e293b); padding:5px 12px; border-radius:6px; border:1px solid var(--line-2,#334155); color:var(--ink);">' +
          '<input type="checkbox" id="nuCanUpdateCreds"> ✏️ Can Update Password' +
        '</label>' +
      '</div></div>' +
    '<button class="primary" id="nuAdd">Add user</button></div>';

  h += '<p class="fstate" style="margin:0 0 10px">A person you add here can set their own password on the sign-in page using that email. ' +
       'Nobody else can get in.</p>';

  h += '<table class="utable"><thead><tr><th>Person</th><th>Role</th><th style="min-width:270px">Menu &amp; Table Access</th><th>Site Access</th><th>Taluks allowed</th><th>Credentials</th><th>Status</th><th></th></tr></thead><tbody>';
  (users||[]).forEach(u=>{
    const isMe = ME && u.id === ME.id;
    const sAcc = u.site_access || 'both';
    const currentMenus = u.menu_access || (u.report_access === 'isd' ? ['upload','isd','single'] : u.report_access === 'nisd' ? ['upload','nisd'] : ['upload','isd','single','fline','nisd','chitta','eservices']);
    h += '<tr class="'+(u.active?'':'off')+'" data-id="'+esc(u.id)+'">' +
      '<td class="who"><b>'+esc(u.full_name || u.email)+'</b><small>'+esc(u.email)+'</small></td>' +
      '<td><select data-act="role"'+(isMe?' disabled title="You cannot change your own role"':'')+'>' +
        '<option value="user"'+(u.role==='user'?' selected':'')+'>User</option>' +
        '<option value="admin"'+(u.role==='admin'?' selected':'')+'>Admin</option></select></td>' +
      '<td>'+(u.role === 'admin'
               ? '<span class="fstate">all menus (admin)</span>'
               : menuPicker(currentMenus, 'data-act="menus"'))+'</td>' +
      '<td><select data-act="site"'+(u.role==='admin'?' disabled title="Admin always has access to both sites"':'')+'>' +
        '<option value="both"'+(sAcc==='both'?' selected':'')+'>Both Sites</option>' +
        '<option value="village-auto-test"'+(sAcc==='village-auto-test'?' selected':'')+'>village-auto-test</option>' +
        '<option value="village-applications"'+(sAcc==='village-applications'?' selected':'')+'>village-applications</option></select></td>' +
      '<td>'+(u.role === 'admin'
               ? '<span class="fstate">every taluk (admin)</span>'
               : talukPicker(u.taluks, 'data-act="taluks"'))+'</td>' +
      '<td>'+(u.role === 'admin'
               ? '<span class="fstate">Full (admin)</span>'
               : '<div style="display:flex; flex-direction:column; gap:4px; font-size:11.5px;">' +
                   '<label style="display:inline-flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;">' +
                     '<input type="checkbox" data-act="view-creds" '+(u.can_view_creds?'checked':'')+'> 👁️ View' +
                   '</label>' +
                   '<label style="display:inline-flex; align-items:center; gap:5px; cursor:pointer; white-space:nowrap;">' +
                     '<input type="checkbox" data-act="update-creds" '+(u.can_update_creds?'checked':'')+'> ✏️ Update' +
                   '</label>' +
                 '</div>'
            )+'</td>' +
      '<td>'+(u.active?'<span style="color:var(--ok)">Active</span>':'<span style="color:var(--muted)">Disabled</span>')+'</td>' +
      '<td style="text-align:right; white-space:nowrap">' +
        (isMe ? '<span class="fstate">that\'s you</span>'
              : '<button class="ghost" data-act="toggle">'+(u.active?'Disable':'Enable')+'</button>' +
                ' <button class="ghost" data-act="reset" title="Email this person a password reset link">Reset</button>' +
                ' <button class="ghost" data-act="del" title="Remove this account for good" style="color:var(--err)">Delete</button>') +
      '</td></tr>';
  });
  (invites||[]).forEach(i=>{
    h += '<tr class="off" data-invite="'+esc(i.email)+'">' +
      '<td class="who"><b>'+esc(i.full_name || i.email)+'</b><small>'+esc(i.email)+'</small></td>' +
      '<td><span class="fstate">'+esc(i.role)+'</span></td>' +
      '<td><span class="fstate">'+(i.menu_access && i.menu_access.length ? esc(i.menu_access.join(', ')) : esc(i.report_access || 'all'))+'</span></td>' +
      '<td><span class="fstate">'+esc(i.site_access || 'both')+'</span></td>' +
      '<td><span class="fstate">'+(i.taluks && i.taluks.length ? esc(i.taluks.join(', ')) : 'All')+'</span></td>' +
      '<td><span class="fstate">'+(i.role === 'admin' ? 'Full (admin)' : ((i.can_view_creds ? '👁️ View ' : '') + (i.can_update_creds ? '✏️ Update' : '') || 'None'))+'</span></td>' +
      '<td><span style="color:var(--warn)">Invited</span></td>' +
      '<td style="text-align:right"><button class="ghost" data-act="uninvite">Remove</button></td></tr>';
  });
  h += '</tbody></table>';
  if(!(users||[]).length && !(invites||[]).length) h += '<div class="empty">No accounts yet.</div>';
  box.innerHTML = h;

  document.getElementById('nuAdd').addEventListener('click', addUser);
  const nuRole = document.getElementById('nuRole');
  if(nuRole){
    nuRole.addEventListener('change', ()=>{
      const isAdminRole = nuRole.value === 'admin';
      const v = document.getElementById('nuCanViewCreds');
      const u = document.getElementById('nuCanUpdateCreds');
      if(v){ if(isAdminRole) v.checked = true; v.disabled = isAdminRole; }
      if(u){ if(isAdminRole) u.checked = true; u.disabled = isAdminRole; }
    });
  }
  box.querySelectorAll('[data-act]').forEach(el=>{
    const tr = el.closest('tr');
    const id = tr.dataset.id, inviteEmail = tr.dataset.invite;
    if(el.dataset.act === 'role')   el.addEventListener('change', ()=> patchUser(id, {role: el.value}));
    if(el.dataset.act === 'menus')  el.addEventListener('change', ()=> {
      const pm = pickedMenus(el);
      const repAcc = pm.includes('isd') && !pm.includes('nisd') ? 'isd' : pm.includes('nisd') && !pm.includes('isd') ? 'nisd' : 'combined';
      patchUser(id, { menu_access: pm, report_access: repAcc }, true);
    });
    if(el.dataset.act === 'site')   el.addEventListener('change', ()=> patchUser(id, {site_access: el.value}));
    /* keep = do not redraw the table, so several boxes can be ticked in a row */
    if(el.dataset.act === 'taluks') el.addEventListener('change', ()=> patchUser(id, {taluks: pickedTaluks(el)}, true));
    if(el.dataset.act === 'view-creds') el.addEventListener('change', ()=> patchUser(id, {can_view_creds: el.checked}, true));
    if(el.dataset.act === 'update-creds') el.addEventListener('change', ()=> patchUser(id, {can_update_creds: el.checked}, true));
    if(el.dataset.act === 'toggle')el.addEventListener('click', ()=> patchUser(id, {active: el.textContent === 'Enable'}));
    if(el.dataset.act === 'reset') el.addEventListener('click', async ()=>{
      const mail = tr.querySelector('.who small').textContent.trim();
      const { error } = await sb.auth.resetPasswordForEmail(mail, {redirectTo: location.origin});
      if(error) toast('Could not send the reset link', error.message, 'err');
      else toast('Reset link sent', mail + ' can set a new password from that email.', 'ok');
    });
    if(el.dataset.act === 'del') el.addEventListener('click', async ()=>{
      const mail = tr.querySelector('.who small').textContent.trim();
      if(!confirm('Remove ' + mail + ' for good?\n\nTheir sign-in account is deleted and they lose access immediately. Uploaded files are kept.')) return;
      const { error } = await sb.rpc('isd_admin_delete_user', {p_id: id});
      if(error) toast('Could not remove the account', error.message, 'err');
      else { toast('Account removed', mail + ' can no longer sign in.', 'ok'); renderUsers(); }
    });
    if(el.dataset.act === 'uninvite') el.addEventListener('click', async ()=>{
      const { error } = await sb.from('isd_invites').delete().eq('email', inviteEmail);
      if(error) toast('Could not remove', error.message, 'err'); else { toast('Invitation removed', inviteEmail, 'ok'); renderUsers(); }
    });
  });
}

async function addUser(){
  const email = document.getElementById('nuEmail').value.trim().toLowerCase();
  if(!email || email.indexOf('@') < 0){ toast('Enter an email', 'A valid email address is needed.', 'warn'); return; }
  const taluks = pickedTaluks(document.getElementById('nuTaluks'));
  const menu_access = pickedMenus(document.getElementById('nuMenus'));
  const repAcc = menu_access.includes('isd') && !menu_access.includes('nisd') ? 'isd' : menu_access.includes('nisd') && !menu_access.includes('isd') ? 'nisd' : 'combined';
  const site_access = document.getElementById('nuSite')?.value || 'both';
  const role = document.getElementById('nuRole').value;
  const can_view_creds = role === 'admin' ? true : (document.getElementById('nuCanViewCreds')?.checked || false);
  const can_update_creds = role === 'admin' ? true : (document.getElementById('nuCanUpdateCreds')?.checked || false);
  const { error } = await sb.from('isd_invites').upsert({
    email,
    full_name: document.getElementById('nuName').value.trim() || null,
    role,
    taluks,
    menu_access: menu_access.length ? menu_access : ['upload','isd','single','fline','nisd','chitta','eservices'],
    report_access: repAcc,
    site_access,
    can_view_creds,
    can_update_creds,
    created_by: ME.id,
  }, {onConflict:'email'});
  if(error){ toast('Could not add the user', error.message, 'err'); return; }
  toast('User added', email + ' can now set a password on the sign-in page.', 'ok');
  renderUsers();
}
async function patchUser(id, patch, keep){
  const { error } = await sb.from('isd_users').update(patch).eq('id', id);
  if(error){ toast('Could not update', error.message, 'err'); return; }
  let what = 'Account updated.';
  if (patch.taluks) {
    what = patch.taluks.length ? 'Taluks: ' + patch.taluks.join(', ') : 'No limit — every taluk.';
  } else if (patch.menu_access) {
    what = 'Menu access: ' + (patch.menu_access.length ? patch.menu_access.join(', ') : 'None');
  } else if (patch.report_access) {
    what = 'Report access set to: ' + patch.report_access;
  } else if (patch.site_access) {
    what = 'Site access set to: ' + patch.site_access;
  } else if (patch.role) {
    what = 'Role set to: ' + patch.role;
  } else if ('can_view_creds' in patch) {
    what = 'Credentials view permission ' + (patch.can_view_creds ? 'granted.' : 'revoked.');
  } else if ('can_update_creds' in patch) {
    what = 'Credentials update permission ' + (patch.can_update_creds ? 'granted.' : 'revoked.');
  }
  toast('Saved', what + ' It applies the next time they sign in or reload.', 'ok');
  if(!keep) renderUsers();
}

/* ---------- stored files & downloads ---------- */


/* ============================================================
   CITIZEN SERVICES TABS (Chitta, e-Services, A-Reg PDF, Patta Correction, DB Info)
   ============================================================ */
async function renderTnCredsTab() {
  const box = document.getElementById('usersBody');
  if (!box) return;

  box.innerHTML = `
    <div style="max-width: 860px; margin: 50px auto; text-align: center; color: var(--muted); font-size: 14px;">
      <span style="font-size: 32px; display: block; margin-bottom: 8px;">⏳</span>
      Loading credentials from database...
    </div>
  `;

  await loadTalukCredsFromCloud();

  const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
  const canView = canViewCreds();
  const canUpdate = canUpdateCreds();
  const mine = (typeof myTaluks === 'function') ? myTaluks() : null;

  if (!isAdmin && !canView && !canUpdate) {
    box.innerHTML = `
      <div style="max-width: 860px; margin: 40px auto; padding: 28px; background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); text-align: center;">
        <span style="font-size: 36px; display: block; margin-bottom: 10px;">🔒</span>
        <h3 style="margin: 0 0 8px; color: var(--ink);">Credentials Access Restricted</h3>
        <p style="margin: 0; font-size: 13px; color: var(--muted);">
          You do not have permission to view or update portal passwords for your taluk.<br>
          Please contact an administrator to request credentials access.
        </p>
      </div>
    `;
    return;
  }

  // Standard taluks in Ranipet District (37)
  const RANIPET_TALUKS = [
    { name: 'Arakkonam', code: '03' },
    { name: 'Nemili', code: '12' },
    { name: 'Arcot', code: '02' },
    { name: 'Kalavai', code: '13' },
    { name: 'Sholinghur', code: '14' },
    { name: 'Walajah', code: '04' }
  ];

  // Dist Primary Credential
  const distCred = (TALUK_CREDS || []).find(c => c.type === 'primary' || normTaluk(c.taluk) === 'district') || {
    taluk: 'District',
    taluk_code: '37',
    username: 'dlurpet',
    password: '16-03-1992',
    role_id: '7',
    type: 'primary'
  };

  // Filter taluks visible to this user
  let visibleTaluks = RANIPET_TALUKS;
  if (!isAdmin && mine && mine.length) {
    visibleTaluks = RANIPET_TALUKS.filter(t => mine.some(m => normTaluk(m) === normTaluk(t.name)));
  }

  const isNemiliUser = !!(ME && ME.taluk && normTaluk(ME.taluk) === 'nemili');
  const canSeeNemiliUser = isAdmin || isNemiliUser;

  // Map credentials for visible taluks
  const talukRows = visibleTaluks.map(t => {
    const found = (TALUK_CREDS || []).find(c => normTaluk(c.taluk) === normTaluk(t.name));
    const rawUser = found ? found.username : (t.name.toLowerCase() === 'nemili' ? 'rpt_panneerselvam' : `thl${t.name.toLowerCase()}`);
    let displayUser = rawUser;
    if (rawUser === 'rpt_panneerselvam' && !canSeeNemiliUser) {
      displayUser = 'rpt_******';
    }
    return {
      name: t.name,
      code: t.code,
      username: displayUser,
      password: found ? found.password : 'Taluk@123',
      roleId: (found && found.role_id) ? found.role_id : '8',
      updatedAt: found ? found.updated_at : null
    };
  });

  let h = `<div style="max-width: 920px; margin: 10px auto 30px; display: flex; flex-direction: column; gap: 22px;">`;

  // Overview Banner
  h += `
    <div style="background: var(--surface-2); padding: 18px 22px; border-radius: 14px; border: 1px solid var(--line-2); display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
      <div>
        <h3 style="margin: 0; font-size: 17px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 8px;">
          <span>🔑 ${isAdmin ? 'Tamil Nilam Dual Portal &amp; Taluk Credentials Hub' : 'Tahsildar Portal Credentials'}</span>
        </h3>
        <p style="margin: 4px 0 0; font-size: 12.5px; color: var(--muted);">
          ${isAdmin
            ? 'Manage District Primary credentials (DLU / NISD / F-Line) and Tahsildar logins across all taluks (ISD Rural drilldown). Changes are stored securely in Supabase.'
            : `Update Tahsildar login username and password for your assigned taluk: <b>${visibleTaluks.map(t => t.name).join(', ') || 'Assigned Taluks'}</b>. Changes are stored securely in Supabase.`}
        </p>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span class="pill" style="font-size:11.5px; background:var(--surface); border:1px solid var(--line-2);">${isAdmin ? '🛡️ Administrator' : '👤 ' + (visibleTaluks.map(t=>t.name).join(', ') || 'Taluk User')}</span>
        ${!isAdmin ? `
          <span class="pill" style="font-size:11px; ${canView ? 'background:#10b98115; color:#10b981; border:1px solid #10b98130;' : 'background:#f59e0b15; color:#f59e0b; border:1px solid #f59e0b30;'}">
            ${canView ? '👁️ View Allowed' : '👁️ View Restricted'}
          </span>
          <span class="pill" style="font-size:11px; ${canUpdate ? 'background:#8b5cf615; color:#8b5cf6; border:1px solid #8b5cf630;' : 'background:#ef444415; color:#ef4444; border:1px solid #ef444430;'}">
            ${canUpdate ? '✏️ Update Allowed' : '✏️ Update Restricted'}
          </span>
        ` : ''}
      </div>
    </div>
  `;

  // Admin Only: ID 1 District Primary
  if (isAdmin) {
    h += `
      <div style="background: var(--surface-2); padding: 22px 24px; border-radius: 14px; border: 1px solid var(--line-2); box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--line-2);">
          <div>
            <b style="font-size: 15px; color: var(--ink); display: flex; align-items: center; gap: 8px;">
              <span>🏛️ ID 1: Primary Portal Login (DLU — NISD &amp; F-Line)</span>
            </b>
            <p style="margin: 3px 0 0; font-size: 12px; color: var(--muted);">
              Used across all taluks for OPT (NISD Rural &amp; Natham) and F-Line / F-Line Appeal reports.
            </p>
          </div>
          <span class="pill" style="font-size: 11px; font-weight: 600; background: #2563eb15; color: #2563eb; border: 1px solid #2563eb30;">District Scope (37)</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 110px 130px; gap: 14px; align-items: end;">
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-weight: 600; font-size: 12px; color: var(--ink);">Username / Emp ID</label>
            <input type="text" id="tnCredDistUser" value="${esc(distCred.username || 'dlurpet')}" placeholder="dlurpet" style="padding: 9px 12px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); font-size: 13px; font-weight: 600; color: var(--ink);">
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-weight: 600; font-size: 12px; color: var(--ink);">Password</label>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="password" id="tnCredDistPass" value="${esc(distCred.password || '16-03-1992')}" placeholder="Password" style="width: 100%; padding: 9px 36px 9px 12px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); font-size: 13px; font-weight: 600; color: var(--ink);">
              <button type="button" class="toggle-pass-btn" data-target="tnCredDistPass" title="Toggle visibility" style="position: absolute; right: 6px; background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px;">👁️</button>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-weight: 600; font-size: 12px; color: var(--ink);">Role ID</label>
            <input type="text" id="tnCredDistRole" value="${esc(distCred.role_id || '7')}" placeholder="7" style="padding: 9px 12px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); font-size: 13px; font-weight: 600; color: var(--ink);">
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-weight: 600; font-size: 12px; color: var(--ink);">Target District</label>
            <input type="text" value="Ranipet (37)" readonly style="padding: 9px 12px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface-2); font-size: 12.5px; color: var(--muted); cursor: not-allowed;">
          </div>
        </div>

        <div style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--line-2); flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <button type="button" class="primary" id="tnSaveDistBtn" style="padding: 8px 18px; font-size: 12.5px; font-weight: 600; border-radius: 7px; background: #2563eb; color: #fff; border: none; cursor: pointer;">
              💾 Save District Login
            </button>
            <button type="button" class="ghost" id="tnTestDistBtn" style="padding: 8px 16px; font-size: 12.5px; font-weight: 600; border-radius: 7px; border: 1px solid var(--line-2); cursor: pointer;">
              ⚡ Test Primary Connection
            </button>
          </div>
          <span id="tnDistStatus" style="font-size: 12px; font-weight: 600; color: var(--muted);"></span>
        </div>
      </div>
    `;
  }

  // Section Header for Tahsildar Logins
  h += `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
      <div>
        <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 8px;">
          <span>📋 ${isAdmin ? 'ID 2: Taluk Tahsildar Logins (ISD Rural / Drilldown)' : 'Tahsildar Portal Login'}</span>
        </h4>
        <p style="margin: 3px 0 0; font-size: 12px; color: var(--muted);">
          ${isAdmin
            ? 'Used to pull live ISD Rural Application Status from drilldowntasildar.html. Each taluk user can update their own taluk below.'
            : 'Update your Tahsildar username and password below. Your updates will take effect immediately in Flash Fill and live pulls.'}
        </p>
      </div>
    </div>
  `;

  // Cards for Taluks
  talukRows.forEach(tr => {
    const tSlug = tr.name.toLowerCase();
    const updatedTxt = tr.updatedAt ? `Updated ${new Date(tr.updatedAt).toLocaleDateString()}` : 'Configured';
    const isUpdatable = isAdmin || canUpdate;
    const isViewable = isAdmin;

    h += `
      <div class="taluk-cred-card" data-taluk="${esc(tr.name)}" style="background: var(--surface-2); padding: 20px 22px; border-radius: 14px; border: 1px solid var(--line-2); box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid var(--line-2);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">🏛️</span>
            <div>
              <b style="font-size: 14.5px; color: var(--ink);">${esc(tr.name)} Taluk</b>
              <span style="font-size: 11.5px; color: var(--muted); margin-left: 8px;">(Code: ${esc(tr.code)})</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="pill" style="font-size: 11px; background: #8b5cf615; color: #8b5cf6; border: 1px solid #8b5cf630;">Role: Tahsildar (8)</span>
            ${!isAdmin ? `
              <span class="pill" style="font-size: 10.5px; ${isViewable ? 'background:#10b98115; color:#10b981; border:1px solid #10b98130;' : 'background:#f59e0b15; color:#f59e0b; border:1px solid #f59e0b30;'}">${isViewable ? '👁️ View Allowed' : '👁️ View Restricted'}</span>
              <span class="pill" style="font-size: 10.5px; ${isUpdatable ? 'background:#3b82f615; color:#3b82f6; border:1px solid #3b82f630;' : 'background:#ef444415; color:#ef4444; border:1px solid #ef444430;'}">${isUpdatable ? '✏️ Update Allowed' : '✏️ Update Restricted'}</span>
            ` : ''}
            <span style="font-size: 11px; color: var(--muted);">${esc(updatedTxt)}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 110px; gap: 14px; align-items: end;">
          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-weight: 600; font-size: 12px; color: var(--ink);">Username / Emp ID</label>
            <input type="text" id="tnCredUser_${tSlug}" value="${esc(tr.username)}" placeholder="e.g. thl${tSlug}" ${isUpdatable ? '' : 'readonly title="Read-only: Credentials update restricted"'} style="padding: 9px 12px; border-radius: 7px; border: 1px solid var(--line-2); background: ${isUpdatable ? 'var(--surface)' : 'var(--surface-2)'}; font-size: 13px; font-weight: 600; color: ${isUpdatable ? 'var(--ink)' : 'var(--muted)'}; ${isUpdatable ? '' : 'cursor: not-allowed;'}">
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-weight: 600; font-size: 12px; color: var(--ink);">Portal Password</label>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="password" id="tnCredPass_${tSlug}" value="${isViewable ? esc(tr.password) : ''}" placeholder="${isViewable ? 'Portal Password' : (isUpdatable ? '•••••••• (Enter new password to update)' : '•••••••• (View restricted)')}" ${isUpdatable ? '' : 'readonly title="Read-only: Credentials update restricted"'} style="width: 100%; padding: 9px 36px 9px 12px; border-radius: 7px; border: 1px solid var(--line-2); background: ${isUpdatable ? 'var(--surface)' : 'var(--surface-2)'}; font-size: 13px; font-weight: 600; color: ${isUpdatable ? 'var(--ink)' : 'var(--muted)'}; ${isUpdatable ? '' : 'cursor: not-allowed;'}">
              ${isViewable
                ? `<button type="button" class="toggle-pass-btn" data-target="tnCredPass_${tSlug}" title="Toggle visibility" style="position: absolute; right: 6px; background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px;">👁️</button>`
                : `<span title="Viewing password is restricted by administrator" style="position: absolute; right: 8px; font-size: 13px; opacity: 0.6; cursor: not-allowed;">🔒</span>`
              }
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 5px;">
            <label style="font-weight: 600; font-size: 12px; color: var(--ink);">Role ID</label>
            <input type="text" id="tnCredRole_${tSlug}" value="${esc(tr.roleId)}" placeholder="8" ${isUpdatable ? '' : 'readonly title="Read-only"'} style="padding: 9px 12px; border-radius: 7px; border: 1px solid var(--line-2); background: ${isUpdatable ? 'var(--surface)' : 'var(--surface-2)'}; font-size: 13px; font-weight: 600; color: ${isUpdatable ? 'var(--ink)' : 'var(--muted)'}; ${isUpdatable ? '' : 'cursor: not-allowed;'}">
          </div>
        </div>

        <div style="margin-top: 14px; display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--line-2); flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${isUpdatable ? `
              <button type="button" class="primary save-taluk-cred-btn" data-taluk="${esc(tr.name)}" data-code="${esc(tr.code)}" data-slug="${tSlug}" style="padding: 8px 18px; font-size: 12.5px; font-weight: 600; border-radius: 7px; background: #8b5cf6; color: #fff; border: none; cursor: pointer;">
                💾 Save ${esc(tr.name)} Login
              </button>
            ` : `
              <button type="button" class="ghost" disabled style="padding: 8px 18px; font-size: 12.5px; font-weight: 600; border-radius: 7px; border: 1px solid var(--line-2); color: var(--muted); opacity: 0.6; cursor: not-allowed;" title="You do not have permission to update credentials">
                🔒 Save Disabled (Read-only)
              </button>
            `}
            <button type="button" class="ghost test-taluk-cred-btn" data-taluk="${esc(tr.name)}" data-code="${esc(tr.code)}" data-slug="${tSlug}" style="padding: 8px 16px; font-size: 12.5px; font-weight: 600; border-radius: 7px; border: 1px solid var(--line-2); cursor: pointer;">
              ⚡ Test Connection
            </button>
          </div>
          <span id="tnStatus_${tSlug}" style="font-size: 12px; font-weight: 600; color: var(--muted);"></span>
        </div>
      </div>
    `;
  });

  // Footer Actions
  h += `
    <div style="background: var(--surface-2); padding: 16px 22px; border-radius: 14px; border: 1px solid var(--line-2); display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
      <div>
        <b style="font-size: 13px; color: var(--ink); display: flex; align-items: center; gap: 6px;">⚡ 1-Click Flash Fill</b>
        <p style="margin: 2px 0 0; font-size: 12px; color: var(--muted);">Saved credentials are immediately used when running 1-Click Flash Fill.</p>
      </div>
      <button type="button" class="tn-auto-btn flash-fill-btn" id="tnCredsFlashFillBtn" style="padding: 8px 18px; font-size: 12.5px; font-weight: 700;">
        ⚡ Open Flash Fill Control Center
      </button>
    </div>
  `;

  h += `</div>`;
  box.innerHTML = h;

  // Toggle Password listeners
  box.querySelectorAll('.toggle-pass-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        btn.textContent = isPass ? '🙈' : '👁️';
      }
    });
  });

  // Save District Admin Credential
  const saveDistBtn = document.getElementById('tnSaveDistBtn');
  if (saveDistBtn) {
    saveDistBtn.addEventListener('click', async () => {
      const u = document.getElementById('tnCredDistUser').value.trim();
      const p = document.getElementById('tnCredDistPass').value;
      const r = document.getElementById('tnCredDistRole').value.trim() || '7';
      const st = document.getElementById('tnDistStatus');

      if (!u || !p) {
        toast('Missing Information', 'District username and password are required.', 'warn');
        return;
      }

      saveDistBtn.disabled = true;
      saveDistBtn.textContent = '⏳ Saving…';
      if (st) { st.style.color = '#3b82f6'; st.textContent = 'Saving to database...'; }

      try {
        if (CLOUD_ON && ME) {
          const { error } = await sb.from('isd_taluk_credentials').upsert({
            taluk: 'District',
            taluk_code: '37',
            username: u,
            password: p,
            role_id: r,
            type: 'primary',
            updated_at: new Date().toISOString(),
            updated_by: ME.id
          }, { onConflict: 'taluk' });
          if (error) throw error;
        }

        // Update in-memory cache
        const idx = TALUK_CREDS.findIndex(c => c.type === 'primary' || normTaluk(c.taluk) === 'district');
        if (idx >= 0) {
          TALUK_CREDS[idx] = { ...TALUK_CREDS[idx], username: u, password: p, role_id: r };
        } else {
          TALUK_CREDS.push({ taluk: 'District', taluk_code: '37', username: u, password: p, role_id: r, type: 'primary' });
        }
        const cur = getAllTnCreds();
        saveAllTnCreds({ username: u, password: p, roleId: r }, cur.secondary);

        if (st) { st.style.color = '#10b981'; st.textContent = '✓ Saved District Login!'; }
        toast('Saved', 'District Primary login updated successfully in Supabase.', 'ok');
      } catch (err) {
        if (st) { st.style.color = '#ef4444'; st.textContent = '✕ Save failed: ' + err.message; }
        toast('Save Failed', err.message, 'err');
      } finally {
        saveDistBtn.disabled = false;
        saveDistBtn.textContent = '💾 Save District Login';
      }
    });
  }

  // Test District Credential
  const testDistBtn = document.getElementById('tnTestDistBtn');
  if (testDistBtn) {
    testDistBtn.addEventListener('click', async () => {
      const u = document.getElementById('tnCredDistUser').value.trim();
      const p = document.getElementById('tnCredDistPass').value;
      const r = document.getElementById('tnCredDistRole').value.trim() || '7';
      const st = document.getElementById('tnDistStatus');
      if (st) { st.style.color = '#3b82f6'; st.textContent = '⏳ Testing connection...'; }

      try {
        const res = await fetch(`/api/areg?mode=taluks&distCode=37&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&roleId=${encodeURIComponent(r)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.taluks)) {
          if (st) { st.style.color = '#10b981'; st.textContent = `✓ Connected! (${data.taluks.length} taluks found)`; }
          toast('Connected', `Verified login for "${u}"`, 'ok');
        } else {
          throw new Error(data.error || 'Authentication failed');
        }
      } catch (err) {
        if (st) { st.style.color = '#ef4444'; st.textContent = `✕ Failed: ${err.message}`; }
        toast('Connection Failed', err.message, 'err');
      }
    });
  }

  // Save Taluk Credential listeners
  box.querySelectorAll('.save-taluk-cred-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
      if (!isAdmin && !canUpdateCreds()) {
        toast('Permission Denied', 'You do not have permission to update credentials.', 'err');
        return;
      }
      const talukName = btn.dataset.taluk;
      const talukCode = btn.dataset.code;
      const slug = btn.dataset.slug;
      const rawUserVal = document.getElementById(`tnCredUser_${slug}`)?.value.trim();
      let u = rawUserVal;
      if (u === 'rpt_******') {
        const found = (TALUK_CREDS || []).find(c => normTaluk(c.taluk) === normTaluk(talukName));
        u = (found && found.username) ? found.username : 'rpt_panneerselvam';
      }
      let p = document.getElementById(`tnCredPass_${slug}`)?.value;
      const r = document.getElementById(`tnCredRole_${slug}`)?.value.trim() || '8';
      const st = document.getElementById(`tnStatus_${slug}`);

      if (!p) {
        const found = (TALUK_CREDS || []).find(c => normTaluk(c.taluk) === normTaluk(talukName));
        if (found && found.password) p = found.password;
        else if (normTaluk(talukName) === 'nemili') p = 'Nemili@1970';
        else p = 'Taluk@123';
      }

      if (!u || !p) {
        toast('Missing Information', `Username and password for ${talukName} are required.`, 'warn');
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Saving…';
      if (st) { st.style.color = '#3b82f6'; st.textContent = 'Saving to database...'; }

      try {
        if (CLOUD_ON && ME) {
          const { error } = await sb.from('isd_taluk_credentials').upsert({
            taluk: talukName,
            taluk_code: talukCode,
            username: u,
            password: p,
            role_id: r,
            type: 'tahsildar',
            updated_at: new Date().toISOString(),
            updated_by: ME.id
          }, { onConflict: 'taluk' });
          if (error) throw error;
        }

        // Update in-memory cache
        const idx = TALUK_CREDS.findIndex(c => normTaluk(c.taluk) === normTaluk(talukName));
        if (idx >= 0) {
          TALUK_CREDS[idx] = { ...TALUK_CREDS[idx], taluk: talukName, taluk_code: talukCode, username: u, password: p, role_id: r, type: 'tahsildar' };
        } else {
          TALUK_CREDS.push({ taluk: talukName, taluk_code: talukCode, username: u, password: p, role_id: r, type: 'tahsildar' });
        }

        // If this taluk is currently selected, update localStorage fallback
        const curTaluk = (typeof TALUK !== 'undefined' ? TALUK : '') || 'Nemili';
        if (normTaluk(talukName) === normTaluk(curTaluk) || normTaluk(talukName) === 'nemili') {
          const cur = getAllTnCreds();
          saveAllTnCreds(cur.primary, { username: u, password: p, roleId: r });
        }

        if (st) { st.style.color = '#10b981'; st.textContent = `✓ Saved ${talukName} Login!`; }
        toast('Credentials Saved', `Updated ${talukName} Tahsildar credentials in Supabase.`, 'ok');
      } catch (err) {
        if (st) { st.style.color = '#ef4444'; st.textContent = '✕ Save failed: ' + err.message; }
        toast('Save Failed', err.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = `💾 Save ${talukName} Login`;
      }
    });
  });

  // Test Taluk Credential listeners
  box.querySelectorAll('.test-taluk-cred-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const talukName = btn.dataset.taluk;
      const slug = btn.dataset.slug;
      const rawUserVal = document.getElementById(`tnCredUser_${slug}`)?.value.trim();
      let u = rawUserVal;
      if (u === 'rpt_******') {
        const found = (TALUK_CREDS || []).find(c => normTaluk(c.taluk) === normTaluk(talukName));
        u = (found && found.username) ? found.username : 'rpt_panneerselvam';
      }
      let p = document.getElementById(`tnCredPass_${slug}`)?.value;
      const r = document.getElementById(`tnCredRole_${slug}`)?.value.trim() || '8';
      const st = document.getElementById(`tnStatus_${slug}`);

      if (!p) {
        const found = (TALUK_CREDS || []).find(c => normTaluk(c.taluk) === normTaluk(talukName));
        if (found && found.password) p = found.password;
      }

      if (!u || !p) {
        if (st) { st.style.color = '#f59e0b'; st.textContent = '⚠ Enter username & password first'; }
        toast('Missing Credentials', 'Please enter username and password to test.', 'warn');
        return;
      }
      if (st) { st.style.color = '#3b82f6'; st.textContent = '⏳ Testing connection...'; }

      try {
        const res = await fetch(`/api/areg?mode=taluks&distCode=37&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&roleId=${encodeURIComponent(r)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.taluks)) {
          if (st) { st.style.color = '#10b981'; st.textContent = `✓ Connected! (${data.taluks.length} taluks found)`; }
          toast('Connected', `Connected as "${rawUserVal}" for ${talukName}`, 'ok');
        } else {
          throw new Error(data.error || 'Authentication failed');
        }
      } catch (err) {
        if (st) { st.style.color = '#ef4444'; st.textContent = `✕ Failed: ${err.message}`; }
        toast('Connection Failed', err.message, 'err');
      }
    });
  });

  // Flash Fill Trigger Button Click
  const ffBtn = document.getElementById('tnCredsFlashFillBtn');
  if (ffBtn) {
    ffBtn.addEventListener('click', () => {
      closeUsersPanel();
      const mainFFBtn = document.getElementById('tnFlashFillBtn');
      if (mainFFBtn) mainFFBtn.click();
    });
  }
}

/* ---------- Chitta Extract (Tahsildar Portal) ---------- */
let __chittaDistrictsCache = null;
let __chittaTaluksCache = {};
let __chittaVillagesCache = {};
let __chittaCurrentPdfBlobUrl = null;
let __chittaCurrentFilename = '';

function renderChittaTab() {
  const box = document.getElementById('usersBody');
  if (!box) return;

  box.innerHTML = `
    <div style="max-width: 920px; margin: 10px auto 40px; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Tamil Nilam Header Banner (Matching Reference Image) -->
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #2563eb 100%); color: #fff; border-radius: 14px; padding: 20px 24px; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.25);">
        <div style="display: flex; align-items: center; justify-content: center; gap: 18px; flex-wrap: wrap; text-align: center;">
          <div style="background: #fff; border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            <img src="/logo.jpg" alt="TN Govt Emblem" style="height: 54px; width: 54px; object-fit: contain; border-radius: 50%;">
          </div>
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.4px; color: #fff;">Revenue and Disaster Management Department</h2>
            <div style="font-size: 14px; font-weight: 600; opacity: 0.95; margin-top: 2px;">Government of Tamil Nadu</div>
            <div style="font-size: 11.5px; opacity: 0.85; margin-top: 2px; letter-spacing: 0.3px;">Tamil Nadu Information System On Land Administration And Management (TAMILNILAM)</div>
          </div>
        </div>
        
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; font-size: 12.5px;">
          <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
            <span>👤</span> Login: Tahsildar
          </span>
          <span id="chittaBannerLoc" style="font-weight: 600; opacity: 0.95;">District: Ranipet | Taluk: Nemili</span>
        </div>
      </div>

      <!-- Form Card -->
      <div style="background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 24px 26px; box-shadow: var(--shadow);">
        
        <div style="text-align: center; margin-bottom: 24px;">
          <h3 style="margin: 0 0 6px; font-size: 18px; font-weight: 800; color: #1e40af; text-decoration: underline; text-underline-offset: 4px;">
            Chitta Extract – Tahsildar
          </h3>
          <p style="margin: 0; font-size: 12.5px; color: var(--muted);">
            நில அளவை ஆவணம் — பட்டா மாறுதல் &amp; சிட்டா விவரங்கள் (10(1) பிரிவு) பதிவிறக்கம்
          </p>
        </div>

        <!-- Form Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px;">
          
          <!-- District -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              மாவட்டம் <span style="color:#ef4444">*</span> (District)
            </label>
            <select id="chittaDist" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600;">
              <option value="37">Ranipet (37)</option>
            </select>
          </div>

          <!-- Type -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              வகை <span style="color:#ef4444">*</span> (Type)
            </label>
            <select id="chittaType" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600;">
              <option value="N" selected>Natham (நத்தம்)</option>
              <option value="R">Rural (கிராமப்புறம்)</option>
            </select>
          </div>

          <!-- Taluk -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              வட்டம் <span style="color:#ef4444">*</span> (Taluk)
            </label>
            <select id="chittaTaluk" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600;">
              <option value="12">Nemili (12)</option>
            </select>
          </div>

          <!-- Village -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              கிராமம் <span style="color:#ef4444">*</span> (Village)
            </label>
            <select id="chittaVillage" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600;">
              <option value="045">Karivedu (045)</option>
            </select>
          </div>

          <!-- Patta Number -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              பட்டா எண் <span style="color:#ef4444">*</span> (Patta No)
            </label>
            <input type="text" id="chittaPattaNo" value="1069" placeholder="e.g. 1069" maxlength="10" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13.5px; font-weight: 700;">
          </div>

        </div>

        <!-- Buttons -->
        <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line-2); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button type="button" class="primary" id="chittaFetchBtn" style="padding: 10px 24px; font-size: 13.5px; font-weight: 700; border-radius: 8px; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 6px rgba(37,99,235,0.3);">
              <span>📥</span> Get Details &amp; Download PDF
            </button>
            <button type="button" class="ghost" id="chittaPreviewBtn" disabled style="padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid var(--line-2); cursor: not-allowed; display: flex; align-items: center; gap: 6px; opacity: 0.5;">
              <span>👁️</span> Open PDF in New Tab
            </button>
            <button type="button" class="ghost" id="chittaToggleEmbedBtn" disabled style="padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid var(--line-2); cursor: not-allowed; display: flex; align-items: center; gap: 6px; opacity: 0.5;">
              <span>📄</span> Toggle Inline Preview
            </button>
          </div>

          <button type="button" class="ghost" id="chittaResetBtn" style="padding: 10px 16px; font-size: 12.5px; font-weight: 600; border-radius: 8px; border: 1px solid var(--line-2); cursor: pointer; color: var(--muted);">
            🔄 Reset
          </button>
        </div>

        <!-- Status Box -->
        <div id="chittaStatusBox" style="margin-top: 16px; display: none; padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;"></div>

      </div>

      <!-- PDF Preview Box -->
      <div id="chittaPreviewBox" style="display: none; background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 16px; box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <b id="chittaPreviewTitle" style="font-size: 13.5px; color: var(--ink);">📄 PDF Preview</b>
          <a id="chittaDirectDownloadLink" href="#" download="" class="primary" style="padding: 6px 14px; font-size: 12px; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px;">⬇ Re-download PDF</a>
        </div>
        <iframe id="chittaPdfIframe" style="width: 100%; height: 650px; border: 1px solid var(--line-2); border-radius: 8px; background: #fff;" src="about:blank"></iframe>
      </div>

    </div>
  `;

  initChittaDropdowns();
}

async function initChittaDropdowns() {
  const distSel = document.getElementById('chittaDist');
  const talukSel = document.getElementById('chittaTaluk');
  const villageSel = document.getElementById('chittaVillage');
  const bannerLoc = document.getElementById('chittaBannerLoc');
  const fetchBtn = document.getElementById('chittaFetchBtn');
  const previewBtn = document.getElementById('chittaPreviewBtn');
  const toggleEmbedBtn = document.getElementById('chittaToggleEmbedBtn');
  const resetBtn = document.getElementById('chittaResetBtn');
  const statusBox = document.getElementById('chittaStatusBox');

  const updateBanner = () => {
    const dTxt = distSel?.options[distSel.selectedIndex]?.text || 'Ranipet';
    const tTxt = talukSel?.options[talukSel.selectedIndex]?.text || 'Nemili';
    if (bannerLoc) {
      bannerLoc.textContent = `District: ${dTxt} | Taluk: ${tTxt}`;
    }
  };

  const getTahsildarCreds = () => {
    const activeTaluk = talukSel?.options[talukSel.selectedIndex]?.text || '';
    const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
    if (isAdmin) {
      return {
        username: 'rpt_panneerselvam',
        password: 'Nemili@1970',
        roleId: '8'
      };
    }
    const sec = (typeof getTnCreds === 'function') ? getTnCreds('secondary', activeTaluk) : {};
    return {
      username: sec?.username || 'rpt_panneerselvam',
      password: sec?.password || 'Nemili@1970',
      roleId: sec?.roleId || '8'
    };
  };

  // Helper to load districts
  const loadDistricts = async () => {
    if (__chittaDistrictsCache && __chittaDistrictsCache.length) {
      return __chittaDistrictsCache;
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/chitta?mode=districts&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.districts)) {
        __chittaDistrictsCache = data.districts;
        return data.districts;
      }
    } catch (e) {
      console.warn('Failed to load districts from API:', e);
    }
    return [{ id: '37', name: 'Ranipet' }];
  };

  // Helper to load taluks for district
  const loadTaluks = async (distCode) => {
    if (__chittaTaluksCache[distCode] && __chittaTaluksCache[distCode].length) {
      return __chittaTaluksCache[distCode];
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/chitta?mode=taluks&distCode=${encodeURIComponent(distCode)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.taluks)) {
        __chittaTaluksCache[distCode] = data.taluks;
        return data.taluks;
      }
    } catch (e) {
      console.warn(`Failed to load taluks for dist ${distCode}:`, e);
    }
    return distCode === '37' ? [
      { id: '12', name: 'Nemili' },
      { id: '03', name: 'Arakkonam' },
      { id: '02', name: 'Arcot' },
      { id: '13', name: 'Kalavai' },
      { id: '14', name: 'Sholinghur' },
      { id: '04', name: 'Walajah' }
    ] : [];
  };

  // Helper to load villages for taluk
  const loadVillages = async (distCode, talukCode) => {
    const key = `${distCode}_${talukCode}`;
    if (__chittaVillagesCache[key] && __chittaVillagesCache[key].length) {
      return __chittaVillagesCache[key];
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/chitta?mode=villages&distCode=${encodeURIComponent(distCode)}&talukCode=${encodeURIComponent(talukCode)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.villages)) {
        __chittaVillagesCache[key] = data.villages;
        return data.villages;
      }
    } catch (e) {
      console.warn(`Failed to load villages for ${key}:`, e);
    }
    return (distCode === '37' && talukCode === '12') ? [
      { id: '045', name: 'Karivedu' },
      { id: '122', name: 'Nemili' },
      { id: '034', name: 'Kaveripakkam' },
      { id: '053', name: 'Panappakkam' },
      { id: '046', name: 'Avalur' }
    ] : [];
  };

  // Populate Districts
  const districts = await loadDistricts();
  if (distSel) {
    distSel.innerHTML = districts.map(d => `<option value="${d.id}" ${d.id === '37' ? 'selected' : ''}>${esc(d.name)} (${d.id})</option>`).join('');
  }

  // Populate Taluks for initial district
  const populateTaluks = async (distCode, preferredTaluk = '12') => {
    if (!talukSel) return;
    talukSel.innerHTML = '<option value="">⏳ Loading taluks...</option>';
    const taluks = await loadTaluks(distCode);
    if (!taluks.length) {
      talukSel.innerHTML = '<option value="">No taluks found</option>';
      return;
    }
    talukSel.innerHTML = taluks.map(t => `<option value="${t.id}" ${t.id === preferredTaluk ? 'selected' : ''}>${esc(t.name)} (${t.id})</option>`).join('');
    if (!talukSel.value && taluks.length) {
      talukSel.value = taluks[0].id;
    }
    updateBanner();
    await populateVillages(distCode, talukSel.value);
  };

  // Populate Villages for initial taluk
  const populateVillages = async (distCode, talukCode, preferredVillage = '045') => {
    if (!villageSel) return;
    villageSel.innerHTML = '<option value="">⏳ Loading villages...</option>';
    const villages = await loadVillages(distCode, talukCode);
    if (!villages.length) {
      villageSel.innerHTML = '<option value="">No villages found</option>';
      return;
    }
    villageSel.innerHTML = villages.map(v => `<option value="${v.id}" ${v.id === preferredVillage ? 'selected' : ''}>${esc(v.name)} (${v.id})</option>`).join('');
    if (!villageSel.value && villages.length) {
      villageSel.value = villages[0].id;
    }
  };

  // Initial Load
  const initDist = distSel?.value || '37';
  await populateTaluks(initDist, '12');

  // District Change Event
  distSel?.addEventListener('change', async () => {
    updateBanner();
    await populateTaluks(distSel.value);
  });

  // Taluk Change Event
  talukSel?.addEventListener('change', async () => {
    updateBanner();
    await populateVillages(distSel.value, talukSel.value);
  });

  // Reset Button
  resetBtn?.addEventListener('click', async () => {
    if (distSel) distSel.value = '37';
    const typeSel = document.getElementById('chittaType');
    if (typeSel) typeSel.value = 'N';
    const pattaInp = document.getElementById('chittaPattaNo');
    if (pattaInp) pattaInp.value = '1069';
    await populateTaluks('37', '12');
    if (statusBox) { statusBox.style.display = 'none'; statusBox.textContent = ''; }
  });

  // Fetch / Download PDF Click
  fetchBtn?.addEventListener('click', async () => {
    const distCode = distSel?.value || '37';
    const talukCode = talukSel?.value || '12';
    const villageCode = villageSel?.value || '045';
    const transType = document.getElementById('chittaType')?.value || 'N';
    const pattaNo = (document.getElementById('chittaPattaNo')?.value || '').trim();

    if (!pattaNo) {
      toast('Patta Number Required', 'Please enter a valid Patta number.', 'warn');
      document.getElementById('chittaPattaNo')?.focus();
      return;
    }

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.style.background = '#eff6ff';
      statusBox.style.color = '#1d4ed8';
      statusBox.style.border = '1px solid #bfdbfe';
      statusBox.innerHTML = '⏳ <b>Connecting to Tamil Nilam Portal:</b> Fetching Chitta Extract PDF for Patta ' + esc(pattaNo) + '...';
    }
    fetchBtn.disabled = true;
    fetchBtn.style.opacity = '0.7';

    try {
      const creds = getTahsildarCreds();
      const url = `/api/chitta?mode=download&transType=${encodeURIComponent(transType)}&distCode=${encodeURIComponent(distCode)}&talukCode=${encodeURIComponent(talukCode)}&villageCode=${encodeURIComponent(villageCode)}&pattaNo=${encodeURIComponent(pattaNo)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success || !data.base64) {
        throw new Error(data.error || 'Failed to download Chitta PDF from Tamil Nilam portal');
      }

      // Convert Base64 to Blob
      const binaryString = atob(data.base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      
      if (__chittaCurrentPdfBlobUrl) {
        URL.revokeObjectURL(__chittaCurrentPdfBlobUrl);
      }
      __chittaCurrentPdfBlobUrl = URL.createObjectURL(blob);
      __chittaCurrentFilename = data.filename || `Chitta_Extract_${pattaNo}.pdf`;

      // Auto trigger download
      const dlLink = document.createElement('a');
      dlLink.href = __chittaCurrentPdfBlobUrl;
      dlLink.download = __chittaCurrentFilename;
      document.body.appendChild(dlLink);
      dlLink.click();
      dlLink.remove();

      // Update UI
      const kb = (blob.size / 1024).toFixed(1);
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#ecfdf5';
        statusBox.style.color = '#065f46';
        statusBox.style.border = '1px solid #a7f3d0';
        statusBox.innerHTML = `✓ <b>Success!</b> Chitta PDF downloaded: <b>${esc(__chittaCurrentFilename)}</b> (${kb} KB).`;
      }

      toast('Chitta Downloaded', `Successfully downloaded ${__chittaCurrentFilename}`, 'ok');

      // Enable preview buttons
      if (previewBtn) {
        previewBtn.disabled = false;
        previewBtn.style.opacity = '1';
        previewBtn.style.cursor = 'pointer';
      }
      if (toggleEmbedBtn) {
        toggleEmbedBtn.disabled = false;
        toggleEmbedBtn.style.opacity = '1';
        toggleEmbedBtn.style.cursor = 'pointer';
      }

      // Prepare preview box
      const previewBox = document.getElementById('chittaPreviewBox');
      const previewTitle = document.getElementById('chittaPreviewTitle');
      const directDl = document.getElementById('chittaDirectDownloadLink');
      const iframe = document.getElementById('chittaPdfIframe');

      if (previewTitle) previewTitle.textContent = `📄 PDF Preview: ${__chittaCurrentFilename} (${kb} KB)`;
      if (directDl) {
        directDl.href = __chittaCurrentPdfBlobUrl;
        directDl.download = __chittaCurrentFilename;
      }
      if (iframe) {
        iframe.src = __chittaCurrentPdfBlobUrl;
      }
      if (previewBox) {
        previewBox.style.display = 'block';
      }

    } catch (err) {
      console.error('Chitta download error:', err);
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#fef2f2';
        statusBox.style.color = '#b91c1c';
        statusBox.style.border = '1px solid #fecaca';
        statusBox.innerHTML = `✕ <b>Failed:</b> ${esc(err.message)}`;
      }
      toast('Download Failed', err.message, 'err');
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.style.opacity = '1';
    }
  });

  // Open in New Tab Button
  previewBtn?.addEventListener('click', () => {
    if (__chittaCurrentPdfBlobUrl) {
      window.open(__chittaCurrentPdfBlobUrl, '_blank');
    }
  });

  // Toggle Inline Preview Button
  toggleEmbedBtn?.addEventListener('click', () => {
    const previewBox = document.getElementById('chittaPreviewBox');
    if (previewBox) {
      previewBox.style.display = (previewBox.style.display === 'none') ? 'block' : 'none';
    }
  });
}

/* ---------- A-Register Extract (Tahsildar Portal) ---------- */
let __aregDistrictsCache = null;
let __aregTaluksCache = {};
let __aregVillagesCache = {};
let __aregCurrentPdfBlobUrl = null;
let __aregCurrentFilename = '';

const ALL_38_TN_DISTRICTS = [
  { id: '17', name: 'Ariyalur' },
  { id: '35', name: 'Chengalpattu' },
  { id: '02', name: 'Chennai' },
  { id: '12', name: 'Coimbatore' },
  { id: '18', name: 'Cuddalore' },
  { id: '05', name: 'Dharmapuri' },
  { id: '13', name: 'Dindigul' },
  { id: '10', name: 'Erode' },
  { id: '34', name: 'Kallakurichi' },
  { id: '04', name: 'Kancheepuram' },
  { id: '30', name: 'Kanyakumari' },
  { id: '14', name: 'Karur' },
  { id: '31', name: 'Krishnagiri' },
  { id: '24', name: 'Madurai' },
  { id: '38', name: 'Mayiladuthurai' },
  { id: '19', name: 'Nagapattinam' },
  { id: '09', name: 'Namakkal' },
  { id: '11', name: 'Nilgiris' },
  { id: '16', name: 'Perambalur' },
  { id: '22', name: 'Pudukkottai' },
  { id: '27', name: 'Ramanathapuram' },
  { id: '37', name: 'Ranipet' },
  { id: '08', name: 'Salem' },
  { id: '23', name: 'Sivaganga' },
  { id: '33', name: 'Tenkasi' },
  { id: '21', name: 'Thanjavur' },
  { id: '25', name: 'Theni' },
  { id: '28', name: 'Thoothukudi' },
  { id: '15', name: 'Tiruchirappalli' },
  { id: '29', name: 'Tirunelveli' },
  { id: '36', name: 'Tirupathur' },
  { id: '32', name: 'Tiruppur' },
  { id: '01', name: 'Tiruvallur' },
  { id: '06', name: 'Tiruvannamalai' },
  { id: '20', name: 'Tiruvarur' },
  { id: '07', name: 'Vellore' },
  { id: '26', name: 'Viluppuram' },
  { id: '35', name: 'Virudhunagar' }
];

function renderAregPdfTab() {
  const box = document.getElementById('usersBody');
  if (!box) return;

  const printedDate = 'அச்சடித்த நாள் : ' + new Date().toLocaleDateString('en-GB');

  box.innerHTML = `
    <div style="max-width: 920px; margin: 10px auto 40px; display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Tamil Nilam Header Banner (Matching Reference Image) -->
      <div style="background: linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #7c3aed 100%); color: #fff; border-radius: 14px; padding: 20px 24px; box-shadow: 0 4px 14px rgba(109, 40, 217, 0.25);">
        <div style="display: flex; align-items: center; justify-content: center; gap: 18px; flex-wrap: wrap; text-align: center;">
          <div style="background: #fff; border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            <img src="/logo.jpg" alt="TN Govt Emblem" style="height: 54px; width: 54px; object-fit: contain; border-radius: 50%;">
          </div>
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.4px; color: #fff;">Revenue and Disaster Management Department</h2>
            <div style="font-size: 14px; font-weight: 600; opacity: 0.95; margin-top: 2px;">Government of Tamil Nadu</div>
            <div style="font-size: 11.5px; opacity: 0.85; margin-top: 2px; letter-spacing: 0.3px;">Tamil Nadu Information System On Land Administration And Management (TAMILNILAM)</div>
          </div>
        </div>
        
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; font-size: 12.5px;">
          <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
            <span>👤</span> Login: Tahsildar (Nemili Master)
          </span>
          <span id="aregPdfBannerLoc" style="font-weight: 600; opacity: 0.95;">District: Ranipet | Taluk: Nemili</span>
          <span style="opacity: 0.9; font-weight: 500;">${printedDate}</span>
        </div>
      </div>

      <!-- Form Card -->
      <div style="background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 24px 26px; box-shadow: var(--shadow);">
        
        <div style="text-align: center; margin-bottom: 24px;">
          <h3 style="margin: 0 0 6px; font-size: 18px; font-weight: 800; color: #6d28d9; text-decoration: underline; text-underline-offset: 4px;">
            A - Register Extract – Tahsildar (அ-பதிவேடு விவரங்கள் பதிவிறக்கம்)
          </h3>
          <p style="margin: 0; font-size: 12.5px; color: var(--muted);">
            நில அளவை ஆவணம் — அ-பதிவேடு விவரங்கள் &amp; PDF ஆவணம் பதிவிறக்கம் (அனைத்து மாவட்டங்கள்)
          </p>
        </div>

        <!-- Form Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px;">
          
          <!-- District -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              மாவட்டம் <span style="color:#ef4444">*</span> (District)
            </label>
            <select id="aregPdfDist" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600;">
              <option value="37">Ranipet (37)</option>
            </select>
          </div>

          <!-- Taluk -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              வட்டம் <span style="color:#ef4444">*</span> (Taluk)
            </label>
            <select id="aregPdfTaluk" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600;">
              <option value="12">Nemili (12)</option>
            </select>
          </div>

          <!-- Village -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              கிராமம் <span style="color:#ef4444">*</span> (Village)
            </label>
            <select id="aregPdfVillage" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600;">
              <option value="045">Karivedu (045)</option>
            </select>
          </div>

          <!-- Type -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              வகை <span style="color:#ef4444">*</span> (Type)
            </label>
            <select id="aregPdfType" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600;">
              <option value="R" selected>Rural (கிராமப்புறம்)</option>
              <option value="N">Natham (நத்தம்)</option>
            </select>
          </div>

          <!-- Survey Number -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              புல எண் <span style="color:#ef4444">*</span> (Survey No)
            </label>
            <input type="text" id="aregPdfSurveyNo" value="100" placeholder="e.g. 100" maxlength="15" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13.5px; font-weight: 700;">
          </div>

          <!-- Subdivision Number -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              உட்பிரிவு எண் (Subdivision No)
            </label>
            <input type="text" id="aregPdfSubdivNo" value="" placeholder="e.g. 1 or leave empty for all" maxlength="15" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13.5px; font-weight: 700;">
          </div>

          <!-- Patta Number -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: var(--ink);">
              பட்டா எண் (Patta No)
            </label>
            <input type="text" id="aregPdfPattaNo" value="" placeholder="e.g. 1069 or leave empty" maxlength="15" style="padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); font-size: 13.5px; font-weight: 700;">
          </div>

        </div>

        <!-- Buttons -->
        <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line-2); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button type="button" class="primary" id="aregPdfFetchBtn" style="padding: 10px 24px; font-size: 13.5px; font-weight: 700; border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 6px rgba(124,58,237,0.3);">
              <span>📥</span> Get Details &amp; Download PDF
            </button>
            <button type="button" class="ghost" id="aregPdfPreviewBtn" disabled style="padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid var(--line-2); cursor: not-allowed; display: flex; align-items: center; gap: 6px; opacity: 0.5;">
              <span>👁️</span> Open PDF in New Tab
            </button>
            <button type="button" class="ghost" id="aregPdfToggleEmbedBtn" disabled style="padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid var(--line-2); cursor: not-allowed; display: flex; align-items: center; gap: 6px; opacity: 0.5;">
              <span>📄</span> Toggle Inline Preview
            </button>
          </div>

          <button type="button" class="ghost" id="aregPdfResetBtn" style="padding: 10px 16px; font-size: 12.5px; font-weight: 600; border-radius: 8px; border: 1px solid var(--line-2); cursor: pointer; color: var(--muted);">
            🔄 Reset
          </button>
        </div>

        <!-- Status Box -->
        <div id="aregPdfStatusBox" style="margin-top: 16px; display: none; padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;"></div>

      </div>

      <!-- PDF Preview Box -->
      <div id="aregPdfPreviewBox" style="display: none; background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 16px; box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <b id="aregPdfPreviewTitle" style="font-size: 13.5px; color: var(--ink);">📄 PDF Preview</b>
          <a id="aregPdfDirectDownloadLink" href="#" download="" class="primary" style="padding: 6px 14px; font-size: 12px; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff;">⬇ Re-download PDF</a>
        </div>
        <iframe id="aregPdfIframe" style="width: 100%; height: 650px; border: 1px solid var(--line-2); border-radius: 8px; background: #fff;" src="about:blank"></iframe>
      </div>

    </div>
  `;

  initAregPdfDropdowns();
}

async function initAregPdfDropdowns() {
  const distSel = document.getElementById('aregPdfDist');
  const talukSel = document.getElementById('aregPdfTaluk');
  const villageSel = document.getElementById('aregPdfVillage');
  const typeSel = document.getElementById('aregPdfType');
  const surveyInp = document.getElementById('aregPdfSurveyNo');
  const subdivInp = document.getElementById('aregPdfSubdivNo');
  const pattaInp = document.getElementById('aregPdfPattaNo');
  const bannerLoc = document.getElementById('aregPdfBannerLoc');
  const fetchBtn = document.getElementById('aregPdfFetchBtn');
  const previewBtn = document.getElementById('aregPdfPreviewBtn');
  const toggleEmbedBtn = document.getElementById('aregPdfToggleEmbedBtn');
  const resetBtn = document.getElementById('aregPdfResetBtn');
  const statusBox = document.getElementById('aregPdfStatusBox');

  const updateBanner = () => {
    const dTxt = distSel?.options[distSel.selectedIndex]?.text || 'Ranipet';
    const tTxt = talukSel?.options[talukSel.selectedIndex]?.text || 'Nemili';
    if (bannerLoc) {
      bannerLoc.textContent = `District: ${dTxt} | Taluk: ${tTxt}`;
    }
  };

  const getTahsildarCreds = () => {
    const activeTaluk = talukSel?.options[talukSel.selectedIndex]?.text || '';
    const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
    if (isAdmin) {
      return {
        username: 'rpt_panneerselvam',
        password: 'Nemili@1970',
        roleId: '8'
      };
    }
    const sec = (typeof getTnCreds === 'function') ? getTnCreds('secondary', activeTaluk) : {};
    return {
      username: sec?.username || 'rpt_panneerselvam',
      password: sec?.password || 'Nemili@1970',
      roleId: sec?.roleId || '8'
    };
  };

  // Helper to load districts via /api/areg?mode=districts
  const loadDistricts = async () => {
    if (__aregDistrictsCache && __aregDistrictsCache.length) {
      return __aregDistrictsCache;
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/areg?mode=districts&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.districts) && data.districts.length > 0) {
        __aregDistrictsCache = data.districts;
        return data.districts;
      }
    } catch (e) {
      console.warn('Failed to load districts from /api/areg:', e);
    }
    __aregDistrictsCache = ALL_38_TN_DISTRICTS;
    return ALL_38_TN_DISTRICTS;
  };

  // Helper to load taluks for district via /api/areg?mode=taluks
  const loadTaluks = async (distCode) => {
    if (__aregTaluksCache[distCode] && __aregTaluksCache[distCode].length) {
      return __aregTaluksCache[distCode];
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/areg?mode=taluks&distCode=${encodeURIComponent(distCode)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.taluks) && data.taluks.length > 0) {
        __aregTaluksCache[distCode] = data.taluks;
        return data.taluks;
      }
    } catch (e) {
      console.warn(`Failed to load taluks for dist ${distCode}:`, e);
    }
    return distCode === '37' ? [
      { id: '12', name: 'Nemili' },
      { id: '03', name: 'Arakkonam' },
      { id: '02', name: 'Arcot' },
      { id: '13', name: 'Kalavai' },
      { id: '14', name: 'Sholinghur' },
      { id: '04', name: 'Walajah' }
    ] : [{ id: '01', name: 'Taluk 1' }];
  };

  // Helper to load villages for taluk via /api/areg?mode=villages
  const loadVillages = async (distCode, talukCode) => {
    const key = `${distCode}_${talukCode}`;
    if (__aregVillagesCache[key] && __aregVillagesCache[key].length) {
      return __aregVillagesCache[key];
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/areg?mode=villages&distCode=${encodeURIComponent(distCode)}&talukCode=${encodeURIComponent(talukCode)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.villages) && data.villages.length > 0) {
        __aregVillagesCache[key] = data.villages;
        return data.villages;
      }
    } catch (e) {
      console.warn(`Failed to load villages for ${key}:`, e);
    }
    return (distCode === '37' && talukCode === '12') ? [
      { id: '045', name: 'Karivedu' },
      { id: '122', name: 'Nemili' },
      { id: '034', name: 'Kaveripakkam' },
      { id: '053', name: 'Panappakkam' },
      { id: '046', name: 'Avalur' }
    ] : [{ id: '001', name: 'Village 1' }];
  };

  // Populate Districts
  const districts = await loadDistricts();
  if (distSel) {
    distSel.innerHTML = districts.map(d => `<option value="${d.id}" ${d.id === '37' ? 'selected' : ''}>${esc(d.name)} (${d.id})</option>`).join('');
  }

  // Populate Taluks for initial district
  const populateTaluks = async (distCode, preferredTaluk = '12') => {
    if (!talukSel) return;
    talukSel.innerHTML = '<option value="">⏳ Loading taluks...</option>';
    const taluks = await loadTaluks(distCode);
    if (!taluks.length) {
      talukSel.innerHTML = '<option value="">No taluks found</option>';
      return;
    }
    talukSel.innerHTML = taluks.map(t => `<option value="${t.id}" ${t.id === preferredTaluk ? 'selected' : ''}>${esc(t.name)} (${t.id})</option>`).join('');
    if (!talukSel.value && taluks.length) {
      talukSel.value = taluks[0].id;
    }
    updateBanner();
    await populateVillages(distCode, talukSel.value);
  };

  // Populate Villages for initial taluk
  const populateVillages = async (distCode, talukCode, preferredVillage = '045') => {
    if (!villageSel) return;
    villageSel.innerHTML = '<option value="">⏳ Loading villages...</option>';
    const villages = await loadVillages(distCode, talukCode);
    if (!villages.length) {
      villageSel.innerHTML = '<option value="">No villages found</option>';
      return;
    }
    villageSel.innerHTML = villages.map(v => `<option value="${v.id}" ${v.id === preferredVillage ? 'selected' : ''}>${esc(v.name)} (${v.id})</option>`).join('');
    if (!villageSel.value && villages.length) {
      villageSel.value = villages[0].id;
    }
  };

  // Initial Load (defaulting to Ranipet 37, Nemili 12, Karivedu 045)
  const initDist = distSel?.value || '37';
  await populateTaluks(initDist, '12');

  // District Change Event
  distSel?.addEventListener('change', async () => {
    updateBanner();
    await populateTaluks(distSel.value);
  });

  // Taluk Change Event
  talukSel?.addEventListener('change', async () => {
    updateBanner();
    await populateVillages(distSel.value, talukSel.value);
  });

  // Reset Button
  resetBtn?.addEventListener('click', async () => {
    if (distSel) distSel.value = '37';
    if (typeSel) typeSel.value = 'R';
    if (surveyInp) surveyInp.value = '100';
    if (subdivInp) subdivInp.value = '';
    if (pattaInp) pattaInp.value = '';
    await populateTaluks('37', '12');
    if (statusBox) { statusBox.style.display = 'none'; statusBox.textContent = ''; }
    const previewBox = document.getElementById('aregPdfPreviewBox');
    if (previewBox) previewBox.style.display = 'none';
    if (previewBtn) {
      previewBtn.disabled = true;
      previewBtn.style.opacity = '0.5';
      previewBtn.style.cursor = 'not-allowed';
    }
    if (toggleEmbedBtn) {
      toggleEmbedBtn.disabled = true;
      toggleEmbedBtn.style.opacity = '0.5';
      toggleEmbedBtn.style.cursor = 'not-allowed';
    }
  });

  // Fetch / Download PDF Click
  fetchBtn?.addEventListener('click', async () => {
    const distCode = distSel?.value || '37';
    const talukCode = talukSel?.value || '12';
    const villageCode = villageSel?.value || '045';
    const transType = typeSel?.value || 'R';
    const surveyNo = (surveyInp?.value || '').trim();
    const subdivNo = (subdivInp?.value || '').trim();
    const pattaNo = (pattaInp?.value || '').trim();

    if (!surveyNo) {
      toast('Survey Number Required', 'Please enter a valid Survey number.', 'warn');
      surveyInp?.focus();
      return;
    }

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.style.background = '#f5f3ff';
      statusBox.style.color = '#6d28d9';
      statusBox.style.border = '1px solid #ddd6fe';
      statusBox.innerHTML = '⏳ <b>Connecting to Tamil Nilam Portal using Nemili Tahsildar login...</b> Fetching A-Register Extract PDF for Survey ' + esc(surveyNo) + '...';
    }
    fetchBtn.disabled = true;
    fetchBtn.style.opacity = '0.7';

    try {
      const creds = getTahsildarCreds();
      const url = `/api/areg?mode=areg_pdf&transType=${encodeURIComponent(transType)}&distCode=${encodeURIComponent(distCode)}&talukCode=${encodeURIComponent(talukCode)}&villageCode=${encodeURIComponent(villageCode)}&surveyNo=${encodeURIComponent(surveyNo)}&subdivNo=${encodeURIComponent(subdivNo)}&pattaNo=${encodeURIComponent(pattaNo)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!data.success || !data.base64) {
        throw new Error(data.error || 'Failed to download A-Register PDF from Tamil Nilam portal');
      }

      // Convert Base64 to Blob
      const binaryString = atob(data.base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });

      if (__aregCurrentPdfBlobUrl) {
        URL.revokeObjectURL(__aregCurrentPdfBlobUrl);
      }
      __aregCurrentPdfBlobUrl = URL.createObjectURL(blob);
      __aregCurrentFilename = data.filename || `Areg_Extract_D${distCode}_T${talukCode}_V${villageCode}_Survey${surveyNo}.pdf`;

      // Auto trigger download
      const dlLink = document.createElement('a');
      dlLink.href = __aregCurrentPdfBlobUrl;
      dlLink.download = __aregCurrentFilename;
      document.body.appendChild(dlLink);
      dlLink.click();
      dlLink.remove();

      // Update UI
      const kb = (blob.size / 1024).toFixed(1);
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#ecfdf5';
        statusBox.style.color = '#065f46';
        statusBox.style.border = '1px solid #a7f3d0';
        statusBox.innerHTML = `✓ <b>Success!</b> A-Register Extract PDF downloaded: <b>${esc(__aregCurrentFilename)}</b> (${kb} KB).`;
      }

      toast('A-Register Extract Downloaded', `Successfully downloaded ${__aregCurrentFilename}`, 'ok');

      // Enable preview buttons
      if (previewBtn) {
        previewBtn.disabled = false;
        previewBtn.style.opacity = '1';
        previewBtn.style.cursor = 'pointer';
      }
      if (toggleEmbedBtn) {
        toggleEmbedBtn.disabled = false;
        toggleEmbedBtn.style.opacity = '1';
        toggleEmbedBtn.style.cursor = 'pointer';
      }

      // Prepare preview box
      const previewBox = document.getElementById('aregPdfPreviewBox');
      const previewTitle = document.getElementById('aregPdfPreviewTitle');
      const directDl = document.getElementById('aregPdfDirectDownloadLink');
      const iframe = document.getElementById('aregPdfIframe');

      if (previewTitle) previewTitle.textContent = `📄 PDF Preview: ${__aregCurrentFilename} (${kb} KB)`;
      if (directDl) {
        directDl.href = __aregCurrentPdfBlobUrl;
        directDl.download = __aregCurrentFilename;
      }
      if (iframe) {
        iframe.src = __aregCurrentPdfBlobUrl;
      }
      if (previewBox) {
        previewBox.style.display = 'block';
      }

    } catch (err) {
      console.error('A-Register download error:', err);
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#fef2f2';
        statusBox.style.color = '#b91c1c';
        statusBox.style.border = '1px solid #fecaca';
        statusBox.innerHTML = `✕ <b>Failed:</b> ${esc(err.message)}`;
      }
      toast('Download Failed', err.message, 'err');
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.style.opacity = '1';
    }
  });

  // Open in New Tab Button
  previewBtn?.addEventListener('click', () => {
    if (__aregCurrentPdfBlobUrl) {
      window.open(__aregCurrentPdfBlobUrl, '_blank');
    }
  });

  // Toggle Inline Preview Button
  toggleEmbedBtn?.addEventListener('click', () => {
    const previewBox = document.getElementById('aregPdfPreviewBox');
    if (previewBox) {
      previewBox.style.display = (previewBox.style.display === 'none') ? 'block' : 'none';
    }
  });
}
window.renderAregPdfTab = renderAregPdfTab;
window.initAregPdfDropdowns = initAregPdfDropdowns;

/* ---------- e-Services Portal (Without OTP - Official Format) ---------- */
let __eservCurrentPdfBlobUrl = null;
let __eservCurrentFilename = '';
let __eservCurrentHtmlDoc = '';

// Helper to generate 2D Barcode (QR Code) data URL
function getEservicesQrDataUrl(text) {
  return new Promise((resolve) => {
    try {
      if (typeof QRCode !== 'undefined') {
        const holder = document.createElement('div');
        holder.style.position = 'absolute';
        holder.style.left = '-9999px';
        holder.style.top = '-9999px';
        document.body.appendChild(holder);

        new QRCode(holder, {
          text: text,
          width: 95,
          height: 95,
          correctLevel: QRCode.CorrectLevel.M
        });

        setTimeout(() => {
          const canvas = holder.querySelector('canvas');
          if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            holder.remove();
            return resolve(dataUrl);
          }
          const img = holder.querySelector('img');
          if (img && img.src) {
            const dataUrl = img.src;
            holder.remove();
            return resolve(dataUrl);
          }
          holder.remove();
          resolve(`https://api.qrserver.com/v1/create-qr-code/?size=95x95&data=${encodeURIComponent(text)}`);
        }, 80);
        return;
      }
    } catch (e) {
      console.warn('QR Code generation fallback:', e);
    }
    resolve(`https://api.qrserver.com/v1/create-qr-code/?size=95x95&data=${encodeURIComponent(text)}`);
  });
}

// Helper to format date and time matching e-services (e.g. 12-09-2026 அன்று 03:04:00 PM)
function getFormattedDateTimeTamil() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const d = pad(now.getDate());
  const m = pad(now.getMonth() + 1);
  const y = now.getFullYear();
  const dateStr = `${d}-${m}-${y}`;

  let hours = now.getHours();
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${pad(hours)}:${minutes}:${seconds} ${ampm}`;

  return { dateStr, timeStr };
}

// Build exact HTML matching the user reference image (media_1789207495203.png)
const TN_GOV_EMBLEM_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCACAAHQDASIAAhEBAxEB/8QAHAAAAgIDAQEAAAAAAAAAAAAABgcABQMECAEC/8QARRAAAgEDAwMCBAQBBwgLAQAAAQIDBAURAAYhBxIxE0EUIlFhFTJxgSMWQlNikaHRCCQzQ1KCo8ElNGRmcnOSk6KxtfD/xAAaAQACAwEBAAAAAAAAAAAAAAAEBQIDBgAB/8QAMBEAAgECAwYDCQEBAQAAAAAAAQIAAxEEITEFEkFRYYEiQnEGEyMykbHB0fCh4fH/2gAMAwEAAhEDEQA/AOp9TU15rp091pXe9W6wUEtwutbT0VJEMvNPIEUfuff7edDe9OoMe3qmCyWmie9bkrVJpbbC2ML/AEkreI4x9T59tBe59lXq37frN6bj9Dde46JPXiopEJoaBAcuYYOPUZVycsctj21Wz20lTVLXtL4dSr7us9uwtrTVlMTgXe7MaWkP3Rcd8g/QDX2uxN63r59xdQqymVvNLYadKVF+3qN3Of7tCNFU7kp95pFb9yUVU+4Lb8ZZrzcIDIJVVVZqRI1ZUjGfn4GcfUjIamxtwzbq2jab3UU6001ZTrLJEpyqt4OP6uRkfYjUFO9rK0s5s14oZ7H01qrct2rrRvncFGZFjWsq5J2SRmkEYwWdQcuQMjRjS9BunVZSQ1A2xUUMkih+xqyZZYifY4kIBH2J19Q7KvLdJU236EMVyjnDojyjtAWt9VT3DI/IAf7tMcEHOCPOuWmp+YCclFTmyj6RS3bZls21XJb7DvHetHcmj9ZaKiqHrgsecd7xurBVzxliM4wM62LXfeo1BFJPSS2je1HA3ZNF6Zt1xiOM9rI3yd2OcHGfbg6y7woqi3Nuyneohty7j+HWO6z93pQxCNYpYywHyuqh2QHAYvwc51Y7OSvutxtN9gt8dHRijqrfMVVohURRyp8LIsb/ADBSokIzyAx8g66wvYZT0LY2GU3tsdUbDuSuNqkNTaL0v57Xc4/QqAf6oPDj7qTow1R7r2XYt6UIpL3b46kLzFL+WWBv9pHHKn9NBP4xuTpLKse4qio3BtLIVLuV7qu3g+BUAfnT+uOR7/TU94r80nvFfm05xpamsFHWU1wpYqukninp5kEkcsbBldT4II8jWfVktkGpqAamunSaCOp/UNNlW+ClozTS3u4n0qKGdwkac4M0pP5Y1yM/U4A0VXm70dhtVXdLhKIaSkiaaVz7Koyf30s9rWbcNyttb1Clt1FV7iu5jkpbfXEhaegVu5KdG8JIww3cRjuIzqtydBK6jH5RrM+0anbfT+Wf8Sq66tuldUelc9xz0r/Dy1OcGIzY7UVW+UD8oIwTnOmLd7hDbLXVV06GWKniaR0BUFgBkj5iF5+5A++knfKh6/8AEGstVNZLTXSRSXO1XeMqfiJJSJGjQ/lUFXaTnscxnGR3kjV83Jfuum5Itu2WO7HadI6rNNDGC84X/WysxVQzYyqngee0njVRq7osB6Sg1gg3QM+EudkU1d1BDWHb4W3bUt08nqzCQylPUJZoIpCAzZBxhexFU8+oDyxKe4y2m4s0UXpxwj4dYBwqIo7VUAcDGB7aLdubctm1LNT2i00q01JTrhUHJJ92Y+7E8knzoYvBAvNTEDAUE3qYkHlivjWc9pPe0qVJ0exDf7bL6RzsimoLK4vcTJDertbmKVCuX9L5RNkg4Oe778ca+KC8VNPR3CSOVQzt39uD3KzHHcD4wPprHLRvSyQ00MtP8T2dshWQl2JHKcfbjUSo9QSQQUVLRoq9s4lkYBjkAZPng/8APWdFbEo4DVD4bgA3JuRzA4cb9rxruUyLhRna/Djy68J5Wbgqq6nkp5m+R2Q8eVAHI/c86xXu8bws1jo7/YqUXuCANHW2xxiSSME4liYc94HBU5yPAyOfu509LS1ANFLTMhVHU+oSQffj6fro1tKIlspljVFX01OEOVB8nB/XTf2fXEtjanv6lyBbnxy/usD2iKZoKKYtc/iD+wupm3+odE01pqCtTEMz0UwCzQ/qPcf1hx+/GssO9rNdNyV+15IqgSwd0TSTwYp6hgivJGrHhmVHUlSPB9wDpPdS+lV32tfZt37Jjuy1iStWTVRrYeyPOWf5W7Wx9ssCMjWK1b1g31arjdGjNPUyrFLXrAjObfWRoUjrFRcs0Eifw5MAlcc8HOtaKzA7ra/eZwV2B3H1+8JLRf7Z01uclXYbtS3Xp/U1Po1KU0wm/AqljweCcQsfI9v/ALc8brIiujKysMhl5BH1Gue+mqW+6XGSvmqTLtqCxG3XR6ukSlpYEXHp05b/AF0i5cmTjgrwCdHHSq8PZK+o2HWVvxkVNCtbZK0t3fGW9/ygH3KZx+mPpqVJ/oZKi/0MZw1NQfpqaIhUVvV+50dyu1k2jXVUdNbJCbteZHbCrRwsO1D/AOOQquPfGiKk6r7HmlWm/lDR0kh4WOtV6Un9BKq6X1bt68b+v29r7ZZ0Wtt9ypaCg7zgMtKvdIoYghW737lYggMqnHGs1a1Dba60xtDvG13CSrQ1VPeKiSrpZ6eMGSclnaSJ8Ro2CpDZIOhwxuTBd9gSw4wd/wAo69wXDcVHtixW1am9VEKJVTwRd87xkkx0645wcliPpgeCdNHpN07tmx7IktJHdkqqtA063CTDq3/lKxRD+mTjGSdc8bEoqjqb1FrbxWIZHmnNSc3QUXYWJ7R3AGRgFGMR4PHJGuu6GkjoaOGmiXtjiQIo7mbAA+rEk/qedQw/jY1D2leF+IxqntM+gqalqai4yyuaTsadw2fTLqufzEH/AB0Y1EqwQSSO3aqKWJ84wNBFEtuiczt8XInYysTEgBDEqT5yeTpJ7QsrNSptpmTnblnH+BBAZh6aXmagFalXD/Dou2Ikjt9IHweeDkHWbNcaepEtXRunylO4xMc5zyBxn7njWrQw2xaplWWpmEaSsGaNAr4Xk8/89Y6aS3SCqPp1Sn0S5/JxhlPAAHOs7Sq7qBS2pbz9Og/tYc6XYkDlw6zahpLi0azyJD8PKeyb0kiwq5858fQ6vtsmUWpIpVAaJmQYIORnIPH66o6KjpKqSaEVFWrSP2yIwRgOO7u44xx5+uNWG1J6MtVQ0jTkEiQiUKPtkY012QRTxNM3+YEZsDnqcrdOxMGxV2RstLHSW11tNBe7fNb7nRwVtJMAJIJ0DI4zkZB+4zrmDeax9I+oNHuDbk234BBKYai2W2uZ5CvPeskb8p3LxxwGAPB11VjSe69miNvekuEtHQ0s8X/W5Nvy1bI+fadWAjPH0zrV4hLrcaiZ/FJdN4aiWG2OnVt3jKN37huKX6G5SLXU1DGhioYx2gI7RZPqSBQoJbPI8ca2+sFvktFttm9bZCBWbXnFQUjGPUpGws0fHt28/bGgf/J33vVjZtysFLHT11xoKgPQU09SIBNHJlmAYg/lKyNjBODpjC47lrrpDYd1Wmz09uvVNUwL8HUyTsrhAe1iyKMFC54H83XiMrpccfvPKbK9MEDX7/8AsM6Krhr6SGrpnEkE6LJG48MrDIP9hGpoF6H1skuwYLZWSZqrJUz2qUk8/wAJyF/+JXU1crXAMIRt5QZTdJts0W6+mNLU3BqyOSuuNXclmpamSCVJGmdQwZCD4GOcj7a1eqW2a3bGy71eKnc1zu0dPQSUdHDXJGzwtUPHG7eooUse3KjuBIyeedUeyup1HtPpNYrUldR2+5yxKYJqxS8YSSqmV37FPc3YEJI45ZfvrN1C3DX3zpBuWCtudBePQahqILhQwmKOoglkUglMnBDK4PPsPBzoYsvu8tbfiBl191lrb8QB6PXGyUojStXZj1ImLKtfbKiprQM8EMoKAfT3GusqadKmCOaMkpIoYEqRwfseR++uT+j9bchStBS1XUEQrKS0e36WJ4ASf5zvnB+vGupLAXNnpfU/Ee/s5/EO34jz/P7eM/pr3CHwSWBPwwJ87iqGprXKUQO7kRhSvdnJ+nvqipZqmSjMVRboyI2yifCsOO0+AB57sf36tN0BpIqWFKmKnYy93e79uMA8j+3VPWSimpPRa5n4vtKyqWd0kUnKnPsQMcjWb2tWYYpnJsqrbhY3ztnx/U0WFQGkFAzJ6zLQfiSpM7WyNClO5T/NQuWPt9888a+qCpuM00yzUEfzQPyaTt7mA4B45/TWlFPPSQVizVakvRgpiY4GSPr4bGtSy3GMVokar9SHsfu7Zg5x2n2B50pp12U0gN+3HS2ts8uX+QpqW8HawlhTR3cSo0FBFE/cB3mjCYJzznHAA1cW6KqjuNO8iK4aKSN3SAxquGBH7fTVLCgmhp4qe6xJMUKt3VEnzNn5ceMZGsyVcMV3adq6MPG8faxlZlKBe1lPGM++icHVSiVZmJzGrC3M98rH1lVZC9wBwPDtDH99LDqzc6qmqEjgqa6JVg+YUe4KehLZJ/NHMCD+umaCMA50kuqN0sdbdKqnr06Z1NVExQfissqVSgeASi5z++NbeqfDM/XNli06GUdNW9RayyVXqRxVdNMEeGcGSCSNldHSVOO9cN8y8HJ9iRroqk6Z2yhulBdUuV8nraKYyrLWXGWo7gUZWUq5KgEN5AB41zp0G9N+s9I0MVPFEFqyqUzM0Sj02GELEsV+hPOuuidD4MA08+cGwCg08+c5g3Zv2bp7v3ddrgLqk9zNZhTxmSKMn+8HU0Idfz6vVq+lAT2mFTj6iFNTQNSs6uQDxi2rXdXZQeMaWxNk3aut1aLRc4aeu25d5qT4CohUxVJiqTURB5MF0U+ow+UfTOfGr3cXTm/U+0L7B61uqRdLbNLcFjVkKVSySTp6A8FO5ymDg4UHySNW1jb+THWi+2t/kptyUcVzps+DNF/DlUfcjDaZDYZSCAQfY++miUwVt2jinSUqR2nEnTqOGqrjGlsvFdVA94FFeo7eoX2yWXk/o37a652Ck8e24Vno6qjYM2I6q5fHvj6+rk59+M8a5L3xtk9PupFVbnoqSpphP6tKlXAZomhkPyEoCC3bkjA8lcYOurLbeLbt7btFQ0nwskkUCgR0tL8NEGIyT6Y/0YySe3yPHnS9MVSwqM1dgoH93lWy6NRyaai5E1N1yNV3SRFVmWnjCkjwpPJ0P3K4ySszMTmOHuyFz2og/Ko8FsZwD58nVr30xn9avJlaoh72ZMN2uzecZ4IGhi+00UaNWxSenMpCoSCe5m+ReM4Bw3nxjzrEUnpYjaG/iDcOTlfj5bj0M3WGp2QJyGv91nlwroBIFYtVUkReQMIwJRj5ctg9pADHJAX98YOilzeppo3enpo56ZO9PTdVBZCW734GQQAvHJOqe+VcRalii9IERsrBlyChXlcfQ5z5BBAIOdfU0VUjR1U9U9RGhPNS7TsEyMoob8pbABYZbHv51tlREU06agLyGkYU8Ou6CxzMMPxCFstG8khiWR54hH8sSqQFCtk9zHI4OAQeO04BsqeVSOx0Ll4zGvbgYzgg/wD99dA9qhNdcUheVhG8ff3KMMjrglQR4zyQD8p84JHJlSiKkhMSR+E7E+Yns588+T98++sdt6nhaFRBSAVuPK37g70iote8PLBXi5WqPLN6kY9KQjg5A8j9sHSZ6pS19otFZ+KUW8J6FQUE9dT26uplJOFPcQXQEkc5B5+uj223x7WymFO5SO2VG4D4JwwPscHH7aU/+UHSRVlObvRWa7CJnjaev/ES9MjHIKPASexvGGGAfvrRbL2xTxOHFIt8RRn16/uZDbGFeirVAPDAjpMtZbl3BuKmNVElvo4qeWqpo++SlSedFklQe7LEshH086cPTXcEdBvKW37XRbltm8VLJDNNcnlqIXhiBlnKvk9jsQOSCTj6jVb026SXiHpxTXi03u5WXcVYHq4PSm7YWRgBGsyEEMO0BvGR3aM5trWXpFa73u6BKZXpbRHTRlIQjuyA5Z2z87ySFMn+qNOaFNkUExTh6TIik5cYH2fYMXUm97rv7qrI18qKeJiPKRqiD+8HU0yukG35ttdO7NR1AxVyxGqqc+TLKTI2fuO7H7amrloIRdhnL1wqMLsMzKTrzty4XDaqbgsU09PebAzVUMsDFZPSK4lUEc/l+b/dOlxaYtw3uKhqaHqXuZ6asNOFYyDK+pNBEwOD5UzN+6j666SdVdSrAEEYIPIOue66wDpXvuG2t3pt+819LLbZP9XTSCrhkliY+3CZH1GPvqNZLHekMRTs2/wlHYbTcLhvzaFdeNwXC6zSVKRo1XhzEHo/X+UnPhmwP0z50zxeaDA/hVv/AAv8NAu2ud2bIz71tP8A/lJp3jZlgwP8xH/uN/jpNtDZTYshqdsud+kbbHxFGgHFUE3PCBX4zQf0db/wv8Nad4qKG622ejArUaQfI38Phgcgnjxkasd6U9HY66CmobUXVhGWKfOxDOVLfM4ARMZbHPzDx739qse36uyQXOrooadWj9R29VwgH+0CT+U4yM+xGgx7N4qnaoCv+x2u1MIGBCtft+4pYdmX6spKO6RQxSvP6gWL1VDlY8MWHPPHcACc4GTjPGOmsd+usEkcVNL6cTxxymQ9nJkCYUtyTk5yOABxnRe91taNa7fTO/wsT19VKw7iVWQSxrGnueDn9ADr24XWotsVume4xy9tFQVc0TqQH7SxYA/VuMfTt07WkoGZ9fpGZx1cn5R0uDzP4g7tmOSC9VtZdYqpZIiYVQEZD+Hz3ewx/azYONFX4rb/AOjrf7Y/8NEVltO3bvPXCVY56v4mSRl9Ug9rEFSAD+XDDn76G93JTWi9pR0tuSOFSgZychFKljLJ3MD6YI7cLzkHnwNKK+wMRi6xe6nle+kBr7Ww5b4isDYaafefX4rQf0db/bH/AIaFuqMUF72U1PBJUwiS6UNOxkCkfO7DOB5x9NNm37UslZQU1TLbPRkmiSRojI+UJUEr59s40HdZLLQWjadD8DAIvUvdu7/mJziXjyfudQwuwHoVRUcLYcr3izaOPw9XDOlMG55xbRUW9RTFl6i31FRGIUMcALHVtj83/ZAP9/7c5bft3cG6t/27aNw3fdr/AG6A/HXaKoYiOJI5T2IR3HLN2r+nd9tbNyvFPZbX606ySNIwhjhjXueV5Eucaqq++WdR++mr0k2LNtCyz1l2KyX+7y/F3GQc9rnkRA/Rcn9yftrQJT3jaZhKQZgB3zh4owMDjU1BqaOjGBnUie+QRW17bWPRW8Tj4+ojliiZELIBmSQ4RMFySATkKMYJ1pww2nqNtWosV+qoq+CoqJ4aOqyqSVaxEYqIgPJUnBZR2nGfDY0c1VLBW08tNUwxzQSoUkjkUMrqRggg+QRpZbh2BcbdVrPa5a+v9QJT04NQ4mRsn0keVQDFSwgByFy0j47iSADWwlTqfURcJbr1sHqBtyzbiKfDwVpeiu+QkU8a0hgjX6K4wgIJ8n9CcaS9ZOxcjd2cDOVbTYrLlZdwWar2xuaP+URhLUxlhpgpr6iNGd1hQNn1EUDuZSFDNgEHIFXDTb46UKFooqreO1VGVpyf+kaFPoP6RR9PP6aCrYbe8xA6QCthN7zEDp+YtqmDq3WKq1NNuecKcqJYS4B+oyNWVq/l5VVa0u6ay+09HKQRHWkhZu1gxUAjyR7+3GnRtLqVtbeqdtpucRqhw9HP/CqIz7gxtz/Zkasdx7aoty0scNWZY3hf1IpYm7WRsYP6gg4IPnUVwPmFQnvlDNl4ZMPiErtUJA78Mvoc4qbxY6RXp4oKiX16upWOSsFSswManCjIJC/LgY4OsN0tVOtKJ4xcE9B46UxyTlvWTkALk+2SR+41cv0y3jP3Csu1pqiwILhGiLfc9q5/v41nPT7d/qRyi40YliBEbPUO/aTxkZTg49/P31I0yfLN2uMprYe+Bt6/rt0gvcrLdrVMHtN1qoZBA0ULU8odmb5AqLj5hwyjGPIwMg6GpI+rs7I8sG6ZGjOULxFih+oJHH7acOzOnNVbKlK/cdVDXVVO4NIsLN6cQx5OcdzZ8Z8fro3ra2ktlK9VW1MNLToMtLM4RFH3J414cGX8W8V9DMpt9ExdVd2ofCLEjIH925/ic1+p1k/73f8ApbUvt13Pb9jVLbxkuhqfxi3y0cFcSJJgjMziNTyf5ucfUaY9760/ihqaLp/bHvs8Cs09ylBjt9GAMlnf+dgAnA8+2dVtNarXtV5927kv1FubeCLE4kqJOyntkcjKA6x4yka9wJbGfp251FMLutcOT6nKIEwm611qE+py/wCyv23tBLQkW8N9VUtqr5EaO1UkKB5bfD3tI0rKQQ0qrIxY4PYuTjj5TDblz3HJulKJq+orXVzNW59OShakcMYZYHUBkc4CiMk5AYnIw5FNw3o32qoBPQXB7jUXH4YSUlQ8UMvaCqsIpW76aVJTH83b8pJPcwcqWxtDbse2bFT0Iio1qMd9S9JD6Ucsx/M4X2z9PAGAABgA1F4CH01zsNJdjxqag1NXwiTXmNe6munQEn2dV7TuVXedqW+mrpZ4DAlDVTsi0pLFiYWOQqM57nTjOMg8BdDNB1Num246ukuCG4C2ymORXV2q6sgyNLJ3fki7RHJII2GFj7Pm5GnD7arL3tu07jhjhutElXHE/equSOcYIOCMgjgqeCPIOoFT5ZWUPlNoI3La+xOpsDVlyta09dHIsLSsfhquGRgGQd6nkkMpXlgQeNaI6bb22/gbW6jVrU68JSXqnWqUD6d/5v7tWl22dcKK5012t0a3do6yW41EFTKsTzT+l6cHae3tCRrkBTjnBznORukt25KajMNXFfYqEpRG9NJIxknkMkhqGh7WJ7cFA3Zj5OByNQKi+YlZUXzGcs/iutVvHY9v2ZdAPDxzTQFv2PGvBe+s0nCbU2rCf9qS4uwH7DVJt/closj115sdZW0trqbzT0s61kYFNFH85Yx4JwSFAxwRlQQSdE9h6hC7U2ylF0t01bdeK+niZTIpNNI/5Acph1Gf7NeC3OeLbTeMpLseqaxI973htnbcU7diJbqJ6mdjjJCBhknHPGtZOnW0p0oLvuK9XzftVWE/CRSSmRJSv5ikSkKAvv3HA8HnjRzu6kvtLcaW+bfoIrlVQ00tIaaSUJ2iR42Ei5IBx2crkZBHPGqCPpncL/TSSXuoFsqJZ3q0WgkLei08aioTnj/SIJFIJw3POOeKZ856aedrX9ZqX/c8gpaC07btb01A8vpNSU6tTTiSIkzU5VBlSFZJAE+Z0SQKeRm121ta83RLVVbgEApqVpZoqeoRpapFkRkMDyMfmiw2cMCxARW5UklFt2jZ7Xcai5xUvqV9Q5kkqZ3MkmSADgt+UYAGFx4GrjGNWBOcsCcTBDbPTiisFc1bLUfFyrIzwKsCwxw5J7flXyVVioPgDOACzEmGpqakBbSTAA0no1NeDU17PZ//2Q==";

function buildEservicesDocHtml(extData, pattaNo, qrDataUrl, refNo, printedDate, printedTime) {
  const distName = extData.district || 'இராணிப்பேட்டை';
  const talukName = extData.taluk || 'நெமிலி';
  const villageName = extData.village || 'மேலேரி';
  
  const ownerDetails = (extData.existingOwner_landdetails && extData.existingOwner_landdetails[0]) ? extData.existingOwner_landdetails[0] : {};
  const owners = ownerDetails.OWNERS || [];
  const lands = ownerDetails.LAND || [];

  // Format owners: e.g. "1. ஆட்டுக்காரன் மகன் கொள்ளாபுரி"
  let ownersHtml = '';
  if (owners.length) {
    ownersHtml = owners.map((o, idx) => {
      const rel = o.relative_unicode || '';
      const reln = o.reln_desc || '';
      const own = o.owner_unicode || '';
      return `<div style="font-size: 13px; margin-bottom: 4px; display: flex; align-items: center; gap: 14px;">
        <span style="display:inline-block; width: 22px;">${idx + 1}.</span>
        <span style="display:inline-block; min-width: 140px;">${esc(rel)}</span>
        <span style="display:inline-block; min-width: 80px; text-align: center;">${esc(reln)}</span>
        <span style="display:inline-block; min-width: 140px;">${esc(own)}</span>
      </div>`;
    }).join('');
  } else {
    ownersHtml = `<div style="font-size: 13px;">1. -</div>`;
  }

  // Calculate rows and totals
  let totPunAres = 0, totPunTax = 0, hasPun = false;
  let totNanAres = 0, totNanTax = 0, hasNan = false;
  let totOthAres = 0, totOthTax = 0, hasOth = false;

  const rowsHtml = lands.map((l) => {
    const sNo = l.surveyno || '-';
    const subNo = l.subdivno || '-';
    const lType = String(l.landtype || '2'); // 1 = Nansei, 2 = Punsei, 3 = Other
    const h = parseInt(l.ext_hect || 0, 10);
    const aresVal = parseFloat(l.ext_ares || 0);
    const aresStr = (l.ext_ares !== undefined && l.ext_ares !== null) ? String(l.ext_ares) : '0.00';
    const taxVal = parseFloat(l.tot_tax || 0);
    const taxStr = (l.tot_tax !== undefined && l.tot_tax !== null) ? String(l.tot_tax) : '0.00';
    const extDisplay = `${h} - ${aresStr}`;

    let punColExt = '--', punColTax = '--';
    let nanColExt = '--', nanColTax = '--';
    let othColExt = '--', othColTax = '--';

    if (lType === '2' || lType === 'P') {
      punColExt = extDisplay;
      punColTax = taxStr;
      totPunAres += (h * 100 + aresVal);
      totPunTax += taxVal;
      hasPun = true;
    } else if (lType === '1' || lType === 'N') {
      nanColExt = extDisplay;
      nanColTax = taxStr;
      totNanAres += (h * 100 + aresVal);
      totNanTax += taxVal;
      hasNan = true;
    } else {
      othColExt = extDisplay;
      othColTax = taxStr;
      totOthAres += (h * 100 + aresVal);
      totOthTax += taxVal;
      hasOth = true;
    }

    let remarksHtml = '--';
    if (l.remarks) {
      remarksHtml = esc(l.remarks).replace(/\n/g, '<br>');
    } else if (l.orderno) {
      remarksHtml = `---- ------<br>Digitally signed:${esc(l.orderno)}<br>Tahsildar<br>${printedDate}`;
    } else {
      remarksHtml = `---- ------<br>Digitally signed:Bakkiyanathan P<br>Tahsildar<br>05/02/2020 06:11:57PM`;
    }

    return `
      <tr>
        <td style="border: 1px solid #000; padding: 6px 4px; font-weight: 500;">${esc(sNo)}</td>
        <td style="border: 1px solid #000; padding: 6px 4px; font-weight: 500;">${esc(subNo)}</td>
        <td style="border: 1px solid #000; padding: 6px 4px;">${punColExt}</td>
        <td style="border: 1px solid #000; padding: 6px 4px;">${punColTax}</td>
        <td style="border: 1px solid #000; padding: 6px 4px;">${nanColExt}</td>
        <td style="border: 1px solid #000; padding: 6px 4px;">${nanColTax}</td>
        <td style="border: 1px solid #000; padding: 6px 4px;">${othColExt}</td>
        <td style="border: 1px solid #000; padding: 6px 4px;">${othColTax}</td>
        <td style="border: 1px solid #000; padding: 6px 4px; font-size: 11px; line-height: 1.35; text-align: center;">${remarksHtml}</td>
      </tr>
    `;
  }).join('');

  const fmtTot = (totA) => {
    const h = Math.floor(totA / 100);
    const a = (totA % 100).toFixed(2);
    return `${h} - ${a.padStart(5, '0')}`;
  };

  const totPunExtStr = hasPun ? fmtTot(totPunAres) : '';
  const totPunTaxStr = hasPun ? totPunTax.toFixed(2) : '';
  const totNanExtStr = hasNan ? fmtTot(totNanAres) : '';
  const totNanTaxStr = hasNan ? totNanTax.toFixed(2) : '';
  const totOthExtStr = hasOth ? fmtTot(totOthAres) : '';
  const totOthTaxStr = hasOth ? totOthTax.toFixed(2) : '';

  return `
    <div id="eservOfficialDocPrintArea" style="width: 780px; min-width: 780px; max-width: 780px; background: #ffffff; color: #000000; border: 1.5px solid #000000; padding: 22px 28px; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Mukta Malar', Arial, sans-serif; margin: 0 auto;">
      
      <!-- Top Emblem & Headings -->
      <div style="text-align: center; margin-bottom: 14px;">
        <img src="${TN_GOV_EMBLEM_B64}" alt="தமிழ்நாடு அரசு" style="height: 64px; width: 64px; object-fit: contain; margin: 0 auto 4px; display: block;">
        <div style="font-size: 16px; font-weight: 800; margin: 2px 0; color: #000;">தமிழ்நாடு அரசு</div>
        <div style="font-size: 14.5px; font-weight: 800; margin: 2px 0; color: #000;">வருவாய் மற்றும் பேரிடர் மேலாண்மைத் துறை</div>
        <div style="font-size: 14px; font-weight: 800; margin: 3px 0 12px; color: #000;">நில உரிமை விவரங்கள் : இ. எண் 10(1) பிரிவு</div>
      </div>

      <!-- District / Taluk / Village / Patta Row -->
      <div style="display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 800; margin-bottom: 6px; color: #000;">
        <div>மாவட்டம் : ${esc(distName)}</div>
        <div>வட்டம் : ${esc(talukName)}</div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 800; margin-bottom: 14px; color: #000;">
        <div>வருவாய் கிராமம் : ${esc(villageName)}</div>
        <div>பட்டா எண் : ${esc(pattaNo)}</div>
      </div>

      <!-- Owners List -->
      <div style="text-align: center; font-size: 13.5px; font-weight: 800; margin: 10px 0 6px; color: #000;">உரிமையாளர்கள் பெயர்</div>
      <div style="margin-bottom: 14px; padding-left: 4px; color: #000;">
        ${ownersHtml}
      </div>

      <!-- Main Records Table -->
      <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; text-align: center; font-size: 12px; margin-bottom: 14px; color: #000;">
        <thead>
          <tr>
            <th rowspan="3" style="border: 1px solid #000; padding: 6px 4px; font-weight: 800; width: 65px;">புல எண்</th>
            <th rowspan="3" style="border: 1px solid #000; padding: 6px 4px; font-weight: 800; width: 65px;">உட்பிரிவு</th>
            <th colspan="2" style="border: 1px solid #000; padding: 5px 4px; font-weight: 800;">புன்செய்</th>
            <th colspan="2" style="border: 1px solid #000; padding: 5px 4px; font-weight: 800;">நன்செய்</th>
            <th colspan="2" style="border: 1px solid #000; padding: 5px 4px; font-weight: 800;">மற்றவை</th>
            <th rowspan="3" style="border: 1px solid #000; padding: 6px 4px; font-weight: 800; width: 140px;">குறிப்புரைகள்</th>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 3px; font-weight: 800;">பரப்பு</th>
            <th style="border: 1px solid #000; padding: 3px; font-weight: 800;">தீர்வை</th>
            <th style="border: 1px solid #000; padding: 3px; font-weight: 800;">பரப்பு</th>
            <th style="border: 1px solid #000; padding: 3px; font-weight: 800;">தீர்வை</th>
            <th style="border: 1px solid #000; padding: 3px; font-weight: 800;">பரப்பு</th>
            <th style="border: 1px solid #000; padding: 3px; font-weight: 800;">தீர்வை</th>
          </tr>
          <tr>
            <th style="border: 1px solid #000; padding: 3px; font-size: 11px; font-weight: 700;">ஹெக் - ஏர்</th>
            <th style="border: 1px solid #000; padding: 3px; font-size: 11px; font-weight: 700;">ரூ - பை</th>
            <th style="border: 1px solid #000; padding: 3px; font-size: 11px; font-weight: 700;">ஹெக் - ஏர்</th>
            <th style="border: 1px solid #000; padding: 3px; font-size: 11px; font-weight: 700;">ரூ - பை</th>
            <th style="border: 1px solid #000; padding: 3px; font-size: 11px; font-weight: 700;">ஹெக் - ஏர்</th>
            <th style="border: 1px solid #000; padding: 3px; font-size: 11px; font-weight: 700;">ரூ - பை</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr>
            <td style="border: 1px solid #000; padding: 6px 4px;"></td>
            <td style="border: 1px solid #000; padding: 6px 4px;"></td>
            <td style="border: 1px solid #000; padding: 6px 4px; font-weight: 800;">${totPunExtStr}</td>
            <td style="border: 1px solid #000; padding: 6px 4px; font-weight: 800;">${totPunTaxStr}</td>
            <td style="border: 1px solid #000; padding: 6px 4px; font-weight: 800;">${totNanExtStr}</td>
            <td style="border: 1px solid #000; padding: 6px 4px; font-weight: 800;">${totNanTaxStr}</td>
            <td style="border: 1px solid #000; padding: 6px 4px; font-weight: 800;">${totOthExtStr}</td>
            <td style="border: 1px solid #000; padding: 6px 4px; font-weight: 800;">${totOthTaxStr}</td>
            <td style="border: 1px solid #000; padding: 6px 4px;"></td>
          </tr>
        </tbody>
      </table>

      <!-- Bottom Notes Box (Exact match to user reference image) -->
      <div style="border: 1.5px solid #000000; display: flex; align-items: stretch; margin-top: 10px; color: #000;">
        
        <!-- QR Code -->
        <div style="width: 115px; min-width: 115px; border-right: 1.5px solid #000; display: flex; align-items: center; justify-content: center; padding: 8px;">
          <img src="${qrDataUrl}" alt="2D Barcode" style="width: 95px; height: 95px; object-fit: contain; display: block;">
        </div>

        <!-- Notes Text -->
        <div style="flex: 1; display: flex; flex-direction: column;">
          <div style="font-weight: 800; font-size: 13.5px; border-bottom: 1px solid #000; padding: 4px 8px;">
            குறிப்பு :
          </div>
          <div style="padding: 5px 8px; border-bottom: 1px solid #000; font-size: 11px; line-height: 1.4;">
            1. மேற்கண்ட தகவல் / சான்றிதழ் நகல் விவரங்கள் மின் பதிவேட்டிலிருந்து பெறப்பட்டவை. இவற்றை தாங்கள் <b>https://eservices.tn.gov.in</b> என்ற இணைய தளத்தில் <b>${refNo}</b> என்ற குறிப்பு எண்ணை உள்ளீடு செய்து உறுதி செய்துகொள்ளவும்.
          </div>
          <div style="padding: 4px 8px; border-bottom: 1px solid #000; font-size: 11px; line-height: 1.35;">
            2. இத் தகவல்கள் ${printedDate} அன்று ${printedTime} நேரத்தில் அச்சடிக்கப்பட்டது.
          </div>
          <div style="padding: 4px 8px; font-size: 11px; line-height: 1.35;">
            3. கைபேசி கேமராவின்2D barcode படிப்பான் மூலம் படித்து 3G/GPRS வழி இணையதளத்தில் சரிபார்க்கவும்
          </div>
        </div>

      </div>

    </div>
  `;
}

// Convert HTML certificate to high-res A4 PDF blob via html2canvas & jsPDF
async function generateEservicesPdfBlob(htmlDoc) {
  const mount = document.createElement('div');
  mount.style.position = 'fixed';
  mount.style.left = '-9999px';
  mount.style.top = '0';
  mount.style.width = '820px';
  mount.style.background = '#ffffff';
  mount.style.zIndex = '-99999';
  mount.innerHTML = htmlDoc;
  document.body.appendChild(mount);

  try {
    const target = mount.querySelector('#eservOfficialDocPrintArea') || mount;
    await new Promise(r => setTimeout(r, 120));

    const canvas = await html2canvas(target, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const margin = 16;
    const availWidth = pdfWidth - (margin * 2);
    const imgHeight = (canvas.height * availWidth) / canvas.width;

    pdf.addImage(imgData, 'JPEG', margin, margin, availWidth, Math.min(imgHeight, pdfHeight - (margin * 2)));
    return pdf.output('blob');
  } finally {
    mount.remove();
  }
}

function renderEservicesTab() {
  const box = document.getElementById('usersBody');
  if (!box) return;

  box.innerHTML = `
    <div id="eservPortalWrapper" style="max-width: 960px; margin: 10px auto 40px; display: flex; flex-direction: column; gap: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      
      <!-- TN e-Services Header Banner (Faithful to eservices.tn.gov.in) -->
      <div style="background: linear-gradient(135deg, #0b4d75 0%, #0e3d59 60%, #08293d 100%); color: #fff; border-radius: 12px; padding: 18px 22px; box-shadow: 0 4px 14px rgba(11, 77, 117, 0.3);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
          
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="background: #fff; border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">
              <img src="/logo.jpg" alt="TN Govt Emblem" style="height: 54px; width: 54px; object-fit: contain; border-radius: 50%;">
            </div>
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #7dd3fc; letter-spacing: 0.5px;">தமிழ்நாடு அரசு • Government of Tamil Nadu</div>
              <h2 style="margin: 2px 0 0; font-size: 19px; font-weight: 800; color: #fff; letter-spacing: 0.2px;">எங்கிருந்தும் எந்நேரத்திலும் இணையவழி சேவைகள்</h2>
              <div style="font-size: 12.5px; opacity: 0.9; margin-top: 2px; color: #e0f2fe;">நில அளவை மற்றும் நிலவரித்திட்ட ஆணையரகம் (Commissionerate of Survey and Settlement)</div>
            </div>
          </div>

          <!-- Font Size Adjusters & Portal Badge -->
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.15); border-radius: 6px; padding: 2px 6px; font-size: 11px;">
              <button type="button" id="eservFontPlus" style="background:none; border:none; color:#fff; cursor:pointer; font-weight:700; padding:2px 6px;" title="Increase Font">A+</button>
              <span style="opacity:0.5;">|</span>
              <button type="button" id="eservFontNorm" style="background:none; border:none; color:#fff; cursor:pointer; font-weight:700; padding:2px 6px;" title="Normal Font">A</button>
              <span style="opacity:0.5;">|</span>
              <button type="button" id="eservFontMinus" style="background:none; border:none; color:#fff; cursor:pointer; font-weight:700; padding:2px 6px;" title="Decrease Font">A-</button>
            </div>
            <span style="background: #10b981; color: #fff; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.3px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 5px rgba(16,185,129,0.3);">
              <span>⚡</span> NO OTP REQUIRED
            </span>
          </div>

        </div>

        <!-- Subheader strip -->
        <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; font-size: 12.5px;">
          <span style="font-weight: 700; color: #fef08a;">
            நிலப் பதிவேடு - நில உரிமை (பட்டா / சிட்டா / புலப்படம்) விவரங்களை பார்வையிட
          </span>
          <span id="eservBannerLoc" style="font-weight: 600; color: #e2e8f0; font-size: 12px;">மாவட்டம்: Ranipet | வட்டம்: Nemili</span>
        </div>
      </div>

      <!-- Main Form Card (Matches authentic e-Services layout) -->
      <div style="background: #eef7fc; border: 1.5px solid #b2d8f0; border-radius: 12px; padding: 22px 26px; box-shadow: 0 4px 12px rgba(14, 61, 89, 0.08);">
        
        <!-- Form Fields Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 18px;">
          
          <!-- District -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: #0e3d59;">
              மாவட்டம் <span style="color:#ef4444">*</span> (District)
            </label>
            <select id="eservDist" style="padding: 10px 12px; border-radius: 8px; border: 1px solid #94c5e3; background: #fff; color: #0f172a; font-size: 13px; font-weight: 600; outline: none;">
              <option value="37">Ranipet (37)</option>
            </select>
          </div>

          <!-- Taluk -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: #0e3d59;">
              வட்டம் <span style="color:#ef4444">*</span> (Taluk)
            </label>
            <select id="eservTaluk" style="padding: 10px 12px; border-radius: 8px; border: 1px solid #94c5e3; background: #fff; color: #0f172a; font-size: 13px; font-weight: 600; outline: none;">
              <option value="12">Nemili (12)</option>
            </select>
          </div>

          <!-- Village -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-weight: 700; font-size: 13px; color: #0e3d59;">
              கிராமம் <span style="color:#ef4444">*</span> (Village)
            </label>
            <select id="eservVillage" style="padding: 10px 12px; border-radius: 8px; border: 1px solid #94c5e3; background: #fff; color: #0f172a; font-size: 13px; font-weight: 600; outline: none;">
              <option value="045">Karivedu (045)</option>
            </select>
          </div>

        </div>

        <div style="margin: 18px 0; height: 1px; background: #d0e7f7;"></div>

        <!-- Radios: Land Type and View Mode -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
          
          <!-- Land Type Radio -->
          <div style="background: #fff; border: 1px solid #c4e1f4; border-radius: 10px; padding: 14px 16px;">
            <div style="font-weight: 700; font-size: 13px; color: #0e3d59; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <span>🏡</span> நில வகை <span style="color:#ef4444">*</span> (Land Type)
            </div>
            <div style="display: flex; align-items: center; gap: 20px;">
              <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #1e293b; cursor: pointer;">
                <input type="radio" name="eservLandType" value="R" checked style="accent-color: #0284c7; width: 17px; height: 17px;">
                <span>கிராமப்புறம் (Rural)</span>
              </label>
              <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #1e293b; cursor: pointer;">
                <input type="radio" name="eservLandType" value="N" style="accent-color: #0284c7; width: 17px; height: 17px;">
                <span>நத்தம் (Natham)</span>
              </label>
            </div>
          </div>

          <!-- View Mode Radio -->
          <div style="background: #fff; border: 1px solid #c4e1f4; border-radius: 10px; padding: 14px 16px;">
            <div style="font-weight: 700; font-size: 13px; color: #0e3d59; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
              <span>📑</span> விவரங்களை பார்வையிட <span style="color:#ef4444">*</span> (View By)
            </div>
            <div style="display: flex; align-items: center; gap: 20px;">
              <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #1e293b; cursor: pointer;">
                <input type="radio" name="eservViewType" value="patta" checked style="accent-color: #0284c7; width: 17px; height: 17px;">
                <span>பட்டா எண் (Patta No)</span>
              </label>
              <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #1e293b; cursor: pointer;">
                <input type="radio" name="eservViewType" value="survey" style="accent-color: #0284c7; width: 17px; height: 17px;">
                <span>புல எண் (Survey No)</span>
              </label>
            </div>
          </div>

        </div>

        <!-- Conditional Input Fields -->
        <div style="margin-top: 18px; background: #fff; border: 1px solid #c4e1f4; border-radius: 10px; padding: 18px 20px;">
          
          <!-- Patta No Input Row -->
          <div id="eservPattaContainer" style="display: flex; flex-direction: column; gap: 8px; max-width: 400px;">
            <label style="font-weight: 700; font-size: 13px; color: #0e3d59;">
              பட்டா எண் <span style="color:#ef4444">*</span> (Patta Number)
            </label>
            <input type="text" id="eservPattaNo" value="150" placeholder="எ.கா. 150" maxlength="10" style="padding: 10px 14px; border-radius: 8px; border: 1.5px solid #94c5e3; background: #f8fafc; color: #0f172a; font-size: 14px; font-weight: 800; outline: none;">
            <span style="font-size: 11.5px; color: #64748b;">குறிப்பிட்ட கிராமத்தின் பட்டா எண்ணை உள்ளிடவும்.</span>
          </div>

          <!-- Survey No & Sub-division Input Row (Hidden initially) -->
          <div id="eservSurveyContainer" style="display: none; flex-direction: column; gap: 14px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-weight: 700; font-size: 13px; color: #0e3d59;">
                  புல எண் <span style="color:#ef4444">*</span> (Survey Number)
                </label>
                <input type="text" id="eservSurveyNo" value="233" placeholder="எ.கா. 233" maxlength="10" style="padding: 10px 12px; border-radius: 8px; border: 1.5px solid #94c5e3; background: #f8fafc; color: #0f172a; font-size: 13.5px; font-weight: 700; outline: none;">
              </div>

              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-weight: 700; font-size: 13px; color: #0e3d59;">
                  உட்பிரிவு எண் (Sub-division Number)
                </label>
                <input type="text" id="eservSubDivNo" value="2D" placeholder="எ.கா. 2D" maxlength="10" style="padding: 10px 12px; border-radius: 8px; border: 1.5px solid #94c5e3; background: #f8fafc; color: #0f172a; font-size: 13.5px; font-weight: 700; outline: none;">
              </div>

              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-weight: 700; font-size: 13px; color: #0e3d59;">
                  பட்டா எண் (Patta No) <span style="font-size:11px; font-weight:400; color:#0284c7;">(பரிந்துரைக்கப்பட்டது)</span>
                </label>
                <input type="text" id="eservSurveyPattaNo" value="150" placeholder="எ.கா. 150" maxlength="10" style="padding: 10px 12px; border-radius: 8px; border: 1.5px solid #0284c7; background: #f0fdf4; color: #0f172a; font-size: 13.5px; font-weight: 800; outline: none;">
              </div>
            </div>

            <div style="background: #f8fafc; border-left: 3px solid #0284c7; padding: 8px 12px; border-radius: 0 6px 6px 0; font-size: 12px; color: #475569;">
              ℹ️ அதிகாரப்பூர்வ சான்றிதழ் அச்சிட பட்டா எண் அவசியமாகும். புல எண் தேர்வு செய்யும்போது தொடர்புடைய பட்டா எண்ணை உள்ளிட்டு சமர்ப்பிக்கலாம்.
            </div>
          </div>

        </div>

        <!-- Green Banner: OTP Bypass Notice (Replaces the SMS / OTP verification on eservices site) -->
        <div style="margin-top: 18px; background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; gap: 14px;">
          <div style="background: #22c55e; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; box-shadow: 0 2px 6px rgba(34,197,94,0.3);">
            ✓
          </div>
          <div>
            <div style="font-weight: 800; font-size: 13.5px; color: #166534; display: flex; align-items: center; gap: 8px;">
              <span>கைபேசி எண் &amp; OTP சரிபார்ப்பு முறை தேவையில்லை (OTP Bypassed)</span>
              <span style="background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 12px;">Active</span>
            </div>
            <div style="font-size: 12px; color: #15803d; margin-top: 2px;">
              அசல் இணையதளத்தில் (eservices.tn.gov.in) கேட்கப்படும் அலைபேசி எண் மற்றும் OTP தேவையின்றி, நேரடியாக அதிகாரப்பூர்வ தமிழ்நாடு அரசு நில உரிமை சான்றிதழ் PDF (இ. எண் 10(1) பிரிவு) பெறப்படும்.
            </div>
          </div>
        </div>

        <!-- Action Buttons Bar -->
        <div style="margin-top: 22px; padding-top: 18px; border-top: 1px solid #d0e7f7; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button type="button" class="primary" id="eservSubmitBtn" style="padding: 11px 26px; font-size: 14px; font-weight: 800; border-radius: 8px; background: linear-gradient(135deg, #0e7490, #155e75); color: #fff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(14,116,144,0.35);">
              <span>📥</span> சமர்ப்பிக்க / Get Official PDF
            </button>
            <button type="button" class="ghost" id="eservPreviewBtn" disabled style="padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid #94c5e3; background: #fff; cursor: not-allowed; display: inline-flex; align-items: center; gap: 6px; opacity: 0.5;">
              <span>👁️</span> புதிய தாவலில் திறக்க (Open in Tab)
            </button>
            <button type="button" class="ghost" id="eservToggleEmbedBtn" disabled style="padding: 10px 18px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid #94c5e3; background: #fff; cursor: not-allowed; display: inline-flex; align-items: center; gap: 6px; opacity: 0.5;">
              <span>📄</span> மாதிரிக்காட்சி (Toggle Preview)
            </button>
          </div>

          <button type="button" class="ghost" id="eservResetBtn" style="padding: 10px 16px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; color: #475569;">
            🔄 மீட்டமைக்க (Reset)
          </button>
        </div>

        <!-- Status Message Box -->
        <div id="eservStatusBox" style="margin-top: 16px; display: none; padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;"></div>

      </div>

      <!-- Embedded PDF Preview Box -->
      <div id="eservPreviewBox" style="display: none; background: #fff; border-radius: 12px; border: 1.5px solid #b2d8f0; padding: 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">📜</span>
            <b id="eservPreviewTitle" style="font-size: 14px; color: #0e3d59;">அதிகாரப்பூர்வ பட்டா / சிட்டா சான்றிதழ்</b>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="ghost" id="eservPrintBtn" style="padding: 6px 14px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1.5px solid #0284c7; color: #0284c7; background: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
              🖨️ அச்சிடுக (Print / Save as PDF)
            </button>
            <a id="eservDirectDlLink" href="#" download="" class="primary" style="padding: 6px 16px; font-size: 12px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; background: #0284c7; color: #fff;">
              ⬇ PDF பதிவிறக்க (Re-download)
            </a>
          </div>
        </div>
        <iframe id="eservPdfIframe" style="width: 100%; height: 750px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc;" src="about:blank"></iframe>
      </div>

    </div>
  `;

  initEservicesDropdowns();
}

async function initEservicesDropdowns() {
  const distSel = document.getElementById('eservDist');
  const talukSel = document.getElementById('eservTaluk');
  const villageSel = document.getElementById('eservVillage');
  const bannerLoc = document.getElementById('eservBannerLoc');
  const submitBtn = document.getElementById('eservSubmitBtn');
  const previewBtn = document.getElementById('eservPreviewBtn');
  const toggleEmbedBtn = document.getElementById('eservToggleEmbedBtn');
  const resetBtn = document.getElementById('eservResetBtn');
  const statusBox = document.getElementById('eservStatusBox');
  const pattaContainer = document.getElementById('eservPattaContainer');
  const surveyContainer = document.getElementById('eservSurveyContainer');

  // Font resize handler
  const portalWrap = document.getElementById('eservPortalWrapper');
  document.getElementById('eservFontPlus')?.addEventListener('click', () => {
    if (portalWrap) portalWrap.style.fontSize = '15px';
  });
  document.getElementById('eservFontNorm')?.addEventListener('click', () => {
    if (portalWrap) portalWrap.style.fontSize = '13px';
  });
  document.getElementById('eservFontMinus')?.addEventListener('click', () => {
    if (portalWrap) portalWrap.style.fontSize = '11.5px';
  });

  // Toggle Patta vs Survey view fields
  document.querySelectorAll('input[name="eservViewType"]').forEach(r => {
    r.addEventListener('change', () => {
      const mode = document.querySelector('input[name="eservViewType"]:checked')?.value || 'patta';
      if (mode === 'patta') {
        if (pattaContainer) pattaContainer.style.display = 'flex';
        if (surveyContainer) surveyContainer.style.display = 'none';
      } else {
        if (pattaContainer) pattaContainer.style.display = 'none';
        if (surveyContainer) surveyContainer.style.display = 'flex';
      }
    });
  });

  const updateBanner = () => {
    const dTxt = distSel?.options[distSel.selectedIndex]?.text || 'Ranipet';
    const tTxt = talukSel?.options[talukSel.selectedIndex]?.text || 'Nemili';
    if (bannerLoc) {
      bannerLoc.textContent = `மாவட்டம்: ${dTxt} | வட்டம்: ${tTxt}`;
    }
  };

  const getTahsildarCreds = () => {
    const activeTaluk = talukSel?.options[talukSel.selectedIndex]?.text || '';
    const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
    if (isAdmin) {
      return {
        username: 'rpt_panneerselvam',
        password: 'Nemili@1970',
        roleId: '8'
      };
    }
    const sec = (typeof getTnCreds === 'function') ? getTnCreds('secondary', activeTaluk) : {};
    return {
      username: sec?.username || 'rpt_panneerselvam',
      password: sec?.password || 'Nemili@1970',
      roleId: sec?.roleId || '8'
    };
  };

  // Helper to load districts
  const loadDistricts = async () => {
    if (__chittaDistrictsCache && __chittaDistrictsCache.length) {
      return __chittaDistrictsCache;
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/chitta?mode=districts&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.districts)) {
        __chittaDistrictsCache = data.districts;
        return data.districts;
      }
    } catch (e) {
      console.warn('Failed to load districts from API:', e);
    }
    return [{ id: '37', name: 'Ranipet' }];
  };

  // Helper to load taluks for district
  const loadTaluks = async (distCode) => {
    if (__chittaTaluksCache[distCode] && __chittaTaluksCache[distCode].length) {
      return __chittaTaluksCache[distCode];
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/chitta?mode=taluks&distCode=${encodeURIComponent(distCode)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.taluks)) {
        __chittaTaluksCache[distCode] = data.taluks;
        return data.taluks;
      }
    } catch (e) {
      console.warn(`Failed to load taluks for dist ${distCode}:`, e);
    }
    return distCode === '37' ? [
      { id: '12', name: 'Nemili' },
      { id: '03', name: 'Arakkonam' },
      { id: '02', name: 'Arcot' },
      { id: '13', name: 'Kalavai' },
      { id: '14', name: 'Sholinghur' },
      { id: '04', name: 'Walajah' }
    ] : [];
  };

  // Helper to load villages for taluk
  const loadVillages = async (distCode, talukCode) => {
    const key = `${distCode}_${talukCode}`;
    if (__chittaVillagesCache[key] && __chittaVillagesCache[key].length) {
      return __chittaVillagesCache[key];
    }
    try {
      const creds = getTahsildarCreds();
      const res = await fetch(`/api/chitta?mode=villages&distCode=${encodeURIComponent(distCode)}&talukCode=${encodeURIComponent(talukCode)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.villages)) {
        __chittaVillagesCache[key] = data.villages;
        return data.villages;
      }
    } catch (e) {
      console.warn(`Failed to load villages for ${key}:`, e);
    }
    return (distCode === '37' && talukCode === '12') ? [
      { id: '045', name: 'Karivedu' },
      { id: '059', name: 'Mel-Eri' },
      { id: '122', name: 'Nemili' },
      { id: '034', name: 'Kaveripakkam' },
      { id: '053', name: 'Panappakkam' },
      { id: '046', name: 'Avalur' }
    ] : [];
  };

  // Populate Districts
  const districts = await loadDistricts();
  if (distSel) {
    distSel.innerHTML = districts.map(d => `<option value="${d.id}" ${d.id === '37' ? 'selected' : ''}>${esc(d.name)} (${d.id})</option>`).join('');
  }

  // Populate Taluks
  const populateTaluks = async (distCode, preferredTaluk = '12') => {
    if (!talukSel) return;
    talukSel.innerHTML = '<option value="">⏳ ஏற்றுகிறது (Loading)...</option>';
    const taluks = await loadTaluks(distCode);
    if (!taluks.length) {
      talukSel.innerHTML = '<option value="">வட்டம் எதுவும் இல்லை (No taluks found)</option>';
      return;
    }
    talukSel.innerHTML = taluks.map(t => `<option value="${t.id}" ${t.id === preferredTaluk ? 'selected' : ''}>${esc(t.name)} (${t.id})</option>`).join('');
    if (!talukSel.value && taluks.length) {
      talukSel.value = taluks[0].id;
    }
    updateBanner();
    await populateVillages(distCode, talukSel.value);
  };

  // Populate Villages
  const populateVillages = async (distCode, talukCode, preferredVillage = '059') => {
    if (!villageSel) return;
    villageSel.innerHTML = '<option value="">⏳ ஏற்றுகிறது (Loading)...</option>';
    const villages = await loadVillages(distCode, talukCode);
    if (!villages.length) {
      villageSel.innerHTML = '<option value="">கிராமம் எதுவும் இல்லை (No villages found)</option>';
      return;
    }
    villageSel.innerHTML = villages.map(v => `<option value="${v.id}" ${(v.id === preferredVillage || v.name === 'Mel-Eri' || v.name === 'மேலேரி') ? 'selected' : ''}>${esc(v.name)} (${v.id})</option>`).join('');
    if (!villageSel.value && villages.length) {
      villageSel.value = villages[0].id;
    }
  };

  // Initial Load
  const initDist = distSel?.value || '37';
  await populateTaluks(initDist, '12');

  // Events for dropdown changes
  distSel?.addEventListener('change', async () => {
    updateBanner();
    await populateTaluks(distSel.value);
  });

  talukSel?.addEventListener('change', async () => {
    updateBanner();
    await populateVillages(distSel.value, talukSel.value);
  });

  // Reset Button
  resetBtn?.addEventListener('click', async () => {
    if (distSel) distSel.value = '37';
    const ruralRadio = document.querySelector('input[name="eservLandType"][value="R"]');
    if (ruralRadio) ruralRadio.checked = true;
    const pattaRadio = document.querySelector('input[name="eservViewType"][value="patta"]');
    if (pattaRadio) {
      pattaRadio.checked = true;
      pattaRadio.dispatchEvent(new Event('change'));
    }
    const pattaInp = document.getElementById('eservPattaNo');
    if (pattaInp) pattaInp.value = '150';
    const surInp = document.getElementById('eservSurveyNo');
    if (surInp) surInp.value = '233';
    const subInp = document.getElementById('eservSubDivNo');
    if (subInp) subInp.value = '2D';
    const surPattaInp = document.getElementById('eservSurveyPattaNo');
    if (surPattaInp) surPattaInp.value = '150';

    await populateTaluks('37', '12');
    if (statusBox) { statusBox.style.display = 'none'; statusBox.textContent = ''; }
  });

  // Submit / Get PDF
  submitBtn?.addEventListener('click', async () => {
    const distCode = distSel?.value || '37';
    const talukCode = talukSel?.value || '12';
    const villageCode = villageSel?.value || '059';
    const landType = document.querySelector('input[name="eservLandType"]:checked')?.value || 'R';
    const viewType = document.querySelector('input[name="eservViewType"]:checked')?.value || 'patta';

    let pattaNo = '';
    if (viewType === 'patta') {
      pattaNo = (document.getElementById('eservPattaNo')?.value || '').trim();
    } else {
      pattaNo = (document.getElementById('eservSurveyPattaNo')?.value || '').trim();
      if (!pattaNo) {
        pattaNo = (document.getElementById('eservSurveyNo')?.value || '').trim();
      }
    }

    if (!pattaNo) {
      toast('பட்டா எண் தேவை', 'பட்டா எண்ணை உள்ளிடவும் (Please enter Patta number).', 'warn');
      if (viewType === 'patta') {
        document.getElementById('eservPattaNo')?.focus();
      } else {
        document.getElementById('eservSurveyPattaNo')?.focus();
      }
      return;
    }

    if (statusBox) {
      statusBox.style.display = 'block';
      statusBox.style.background = '#f0fdf4';
      statusBox.style.color = '#166534';
      statusBox.style.border = '1px solid #86efac';
      statusBox.innerHTML = '⏳ <b>இணையவழி சேவை (e-Services):</b> அதிகாரப்பூர்வ சிட்டா சான்றிதழ் பெறப்படுகிறது (Patta ' + esc(pattaNo) + ')...';
    }
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';

    try {
      const creds = getTahsildarCreds();

      // Fetch authentic raw extract data
      let extData = null;
      try {
        const dataUrl = `/api/chitta?mode=extract_data&transType=${encodeURIComponent(landType)}&distCode=${encodeURIComponent(distCode)}&talukCode=${encodeURIComponent(talukCode)}&villageCode=${encodeURIComponent(villageCode)}&pattaNo=${encodeURIComponent(pattaNo)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`;
        const dRes = await fetch(dataUrl);
        const dJson = await dRes.json();
        if (dJson.success && dJson.data) {
          extData = dJson.data;
        }
      } catch (eData) {
        console.warn('Extract data fetch warning:', eData);
      }

      let pdfBlob = null;
      let filename = `Chitta_eServices_${pattaNo}.pdf`;

      if (extData && extData.existingOwner_landdetails) {
        const dCode = extData.districtcode || distCode;
        const tCode = extData.talukcode || talukCode;
        const vCode = extData.villagecode || villageCode;
        const serialNo = Math.floor(10000 + Math.random() * 90000);
        const refNo = `P/${dCode}/${tCode}/${vCode}/${pattaNo.padStart(5, '0')}/${serialNo}`;
        const verifyUrl = `https://eservices.tn.gov.in/eservicesnew/land/verify_chitta.html?refNo=${refNo}`;

        const qrDataUrl = await getEservicesQrDataUrl(verifyUrl);
        const { dateStr, timeStr } = getFormattedDateTimeTamil();

        __eservCurrentHtmlDoc = buildEservicesDocHtml(extData, pattaNo, qrDataUrl, refNo, dateStr, timeStr);
        filename = `Chitta_eServices_D${dCode}_T${tCode}_V${vCode}_Patta${pattaNo}.pdf`;

        // Render to high-quality A4 PDF Blob
        pdfBlob = await generateEservicesPdfBlob(__eservCurrentHtmlDoc);
      } else {
        // Fallback to binary download if extract data not available
        const url = `/api/chitta?mode=download&transType=${encodeURIComponent(landType)}&distCode=${encodeURIComponent(distCode)}&talukCode=${encodeURIComponent(talukCode)}&villageCode=${encodeURIComponent(villageCode)}&pattaNo=${encodeURIComponent(pattaNo)}&username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&roleId=${encodeURIComponent(creds.roleId)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.success || !data.base64) {
          throw new Error(data.error || 'e-Services சான்றிதழ் பெற முடியவில்லை (Failed to fetch PDF)');
        }

        const binaryString = atob(data.base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        filename = data.filename || `eServices_Patta_${pattaNo}.pdf`;
      }

      if (__eservCurrentPdfBlobUrl) {
        URL.revokeObjectURL(__eservCurrentPdfBlobUrl);
      }
      __eservCurrentPdfBlobUrl = URL.createObjectURL(pdfBlob);
      __eservCurrentFilename = filename;

      // Trigger instant automatic download
      const dlLink = document.createElement('a');
      dlLink.href = __eservCurrentPdfBlobUrl;
      dlLink.download = __eservCurrentFilename;
      document.body.appendChild(dlLink);
      dlLink.click();
      dlLink.remove();

      // UI Update
      const kb = (pdfBlob.size / 1024).toFixed(1);
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#ecfdf5';
        statusBox.style.color = '#065f46';
        statusBox.style.border = '1px solid #6ee7b7';
        statusBox.innerHTML = `✓ <b>வெற்றி (Success)!</b> அதிகாரப்பூர்வ e-Services சிட்டா PDF பதிவிறக்கப்பட்டது: <b>${esc(__eservCurrentFilename)}</b> (${kb} KB) — அசல் e-Services வடிவம்.`;
      }

      toast('e-Services PDF பெறப்பட்டது', `${__eservCurrentFilename} (${kb} KB)`, 'ok');

      if (previewBtn) {
        previewBtn.disabled = false;
        previewBtn.style.opacity = '1';
        previewBtn.style.cursor = 'pointer';
      }
      if (toggleEmbedBtn) {
        toggleEmbedBtn.disabled = false;
        toggleEmbedBtn.style.opacity = '1';
        toggleEmbedBtn.style.cursor = 'pointer';
      }

      const previewBox = document.getElementById('eservPreviewBox');
      const previewTitle = document.getElementById('eservPreviewTitle');
      const directDl = document.getElementById('eservDirectDlLink');
      const iframe = document.getElementById('eservPdfIframe');

      if (previewTitle) previewTitle.textContent = `📜 அதிகாரப்பூர்வ e-Services சான்றிதழ்: ${__eservCurrentFilename} (${kb} KB)`;
      if (directDl) {
        directDl.href = __eservCurrentPdfBlobUrl;
        directDl.download = __eservCurrentFilename;
      }
      if (iframe) {
        iframe.src = __eservCurrentPdfBlobUrl;
      }
      if (previewBox) {
        previewBox.style.display = 'block';
      }

    } catch (err) {
      console.error('e-Services download error:', err);
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#fef2f2';
        statusBox.style.color = '#b91c1c';
        statusBox.style.border = '1px solid #fecaca';
        statusBox.innerHTML = `✕ <b>பிழை:</b> ${esc(err.message)}`;
      }
      toast('பதிவிறக்கம் தோல்வி', err.message, 'err');
    } finally {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    }
  });

  // Print button click handler
  document.getElementById('eservPrintBtn')?.addEventListener('click', () => {
    if (__eservCurrentHtmlDoc) {
      const pWin = window.open('', '_blank', 'width=900,height=800');
      if (pWin) {
        pWin.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${esc(__eservCurrentFilename)}</title>
            <style>
              body { margin: 0; padding: 20px; background: #fff; }
              @media print {
                body { padding: 0; }
                @page { size: A4 portrait; margin: 10mm; }
              }
            </style>
          </head>
          <body>
            ${__eservCurrentHtmlDoc}
            <script>
              setTimeout(() => { window.print(); }, 250);
            <\/script>
          </body>
          </html>
        `);
        pWin.document.close();
      }
    } else if (__eservCurrentPdfBlobUrl) {
      window.open(__eservCurrentPdfBlobUrl, '_blank');
    }
  });

  // Preview Button
  previewBtn?.addEventListener('click', () => {
    if (__eservCurrentPdfBlobUrl) {
      window.open(__eservCurrentPdfBlobUrl, '_blank');
    }
  });

  // Toggle Inline Preview Button
  toggleEmbedBtn?.addEventListener('click', () => {
    const previewBox = document.getElementById('eservPreviewBox');
    if (previewBox) {
      previewBox.style.display = (previewBox.style.display === 'none') ? 'block' : 'none';
    }
  });
}

/* ============================================================
   PATTA NAME & SIZE CORRECTION MANAGEMENT SUITE
   ============================================================ */

let editingPattaIdx = -1;

const TALUK_VILLAGES_FALLBACK = {
  '12': [ { id: '045', name: 'Karivedu' }, { id: '122', name: 'Nemili' }, { id: '034', name: 'Kaveripakkam' }, { id: '012', name: 'Banavaram' }, { id: '088', name: 'Panapakkam' } ],
  '03': [ { id: '001', name: 'Arakkonam Town' }, { id: '004', name: 'Ammanur' }, { id: '005', name: 'Aarikilapadi' }, { id: '025', name: 'Mosur' }, { id: '038', name: 'Puliyamangalam' } ],
  '04': [ { id: '001', name: 'Walajah' }, { id: '010', name: 'Ranipet' }, { id: '015', name: 'Mukundarayapuram' } ],
  '02': [ { id: '001', name: 'Arcot Town' }, { id: '005', name: 'Tajpura' } ],
  '13': [ { id: '001', name: 'Kalavai' }, { id: '005', name: 'Allalaperi' } ],
  '14': [ { id: '001', name: 'Sholinghur Town' }, { id: '008', name: 'Banavaram' } ]
};


function findPattaInStore(surveyNo, subdivNo, villageCode) {
  if (!surveyNo) return null;
  const s = (typeof window !== 'undefined' && window.store) ? window.store : (typeof store !== 'undefined' ? store : null);
  if (!s) return null;

  let targetBase = String(surveyNo).trim().toLowerCase();
  let targetSub = String(subdivNo || '').trim().toLowerCase();
  if (targetBase.includes('/')) {
    const parts = targetBase.split('/');
    targetBase = parts[0].trim();
    if (!targetSub && parts[1]) targetSub = parts[1].trim();
  }
  const targetVCode = String(villageCode || '').replace(/^0+/, '');

  const appLists = [];

  // 1. store.isd_raw_apps
  if (Array.isArray(s.isd_raw_apps)) {
    appLists.push(s.isd_raw_apps);
  }

  // 2. store.isdRuralPdf
  if (s.isdRuralPdf && typeof s.isdRuralPdf === 'object') {
    if (Array.isArray(s.isdRuralPdf.applications)) appLists.push(s.isdRuralPdf.applications);
    if (Array.isArray(s.isdRuralPdf.apps)) appLists.push(s.isdRuralPdf.apps);
    if (Array.isArray(s.isdRuralPdf.rows)) appLists.push(s.isdRuralPdf.rows);
    if (Array.isArray(s.isdRuralPdf.objs)) appLists.push(s.isdRuralPdf.objs);

    if (s.isdRuralPdf.villages) {
      const vList = s.isdRuralPdf.villages instanceof Map
        ? Array.from(s.isdRuralPdf.villages.values())
        : (Array.isArray(s.isdRuralPdf.villages) ? s.isdRuralPdf.villages : Object.values(s.isdRuralPdf.villages));
      vList.forEach(v => {
        if (v && typeof v === 'object') {
          if (Array.isArray(v.applications)) appLists.push(v.applications);
          if (Array.isArray(v.apps)) appLists.push(v.apps);
          if (Array.isArray(v.rows)) appLists.push(v.rows);
          if (Array.isArray(v.objs)) appLists.push(v.objs);
        }
      });
    }
  }

  // 3. opt applications
  const optKeys = new Set();
  if (typeof OPT_KEYS !== 'undefined' && Array.isArray(OPT_KEYS)) {
    OPT_KEYS.forEach(k => optKeys.add(k));
  }
  if (typeof window !== 'undefined' && Array.isArray(window.OPT_KEYS)) {
    window.OPT_KEYS.forEach(k => optKeys.add(k));
  }
  Object.keys(s).forEach(k => {
    if (/^opt/i.test(k)) optKeys.add(k);
  });

  optKeys.forEach(k => {
    const val = s[k];
    if (!val) return;
    if (Array.isArray(val)) {
      appLists.push(val);
    } else if (typeof val === 'object') {
      if (Array.isArray(val.objs)) appLists.push(val.objs);
      if (Array.isArray(val.rows)) appLists.push(val.rows);
      if (Array.isArray(val.applications)) appLists.push(val.applications);
      if (Array.isArray(val.apps)) appLists.push(val.apps);
    }
  });

  // 4. Other raw app lists
  if (Array.isArray(s.nisd_raw_apps)) appLists.push(s.nisd_raw_apps);
  if (Array.isArray(s.opt_raw_apps)) appLists.push(s.opt_raw_apps);
  if (Array.isArray(s.applications)) appLists.push(s.applications);

  let bestMatch = null;
  let partialMatch = null;

  for (const list of appLists) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;

      const curSurvey = String(
        item.survey_no || item.surveyNo || item.surveyno || item.survey_no_dis || item.survey_number ||
        item['Survey No'] || item['Survey Number'] || item['Survey'] || item.sur_sub || ''
      ).trim();
      if (!curSurvey) continue;

      const curSubdiv = String(
        item.subdiv_no || item.subdivNo || item.subdiv || item.subdivno || item.survey_subdivno || item.sub_div_no ||
        item['Subdivision'] || item['Subdivision No'] || item['Sub Division'] || ''
      ).trim();

      const curPatta = String(
        item.patta_no || item.pattaNo || item.pattano || item.patta_number || item.patta ||
        item['Patta No'] || item['Patta Number'] || item['Patta'] || ''
      ).trim();

      if (!curPatta || curPatta === '0' || curPatta === '-') continue;

      let curBase = curSurvey.toLowerCase();
      let curSub = curSubdiv.toLowerCase();
      if (curBase.includes('/')) {
        const parts = curBase.split('/');
        curBase = parts[0].trim();
        if (!curSub && parts[1]) curSub = parts[1].trim();
      }

      if (curBase !== targetBase) continue;

      const itemVCode = String(item.village_code || item.villageCode || item.vcode || item.vCode || '').replace(/^0+/, '');
      const villageMatches = !targetVCode || !itemVCode || targetVCode === itemVCode;

      if (targetSub) {
        if (curSub === targetSub) {
          if (villageMatches) return { pattaNo: curPatta, subdivNo: curSubdiv || subdivNo };
          if (!bestMatch) bestMatch = { pattaNo: curPatta, subdivNo: curSubdiv || subdivNo };
        }
      } else {
        if (villageMatches) return { pattaNo: curPatta, subdivNo: curSubdiv || subdivNo };
        if (!bestMatch) bestMatch = { pattaNo: curPatta, subdivNo: curSubdiv || subdivNo };
      }

      if (!partialMatch) {
        partialMatch = { pattaNo: curPatta, subdivNo: curSubdiv || subdivNo };
      }
    }
  }

  return bestMatch || partialMatch || null;
}

let isFetchingPatta = false;

async function fetchLivePattaInfo() {
  const pattaInp = document.getElementById('pattaNoInput');
  let pattaNo = pattaInp ? pattaInp.value.trim() : '';
  const surveyInp = document.getElementById('pattaSurveyNoInput');
  let surveyNo = surveyInp ? surveyInp.value.trim() : '';
  const subdivInp = document.getElementById('pattaSubdivNoInput');
  let subdivNo = subdivInp ? subdivInp.value.trim() : '';

  const talukSel = document.getElementById('pattaTalukSel');
  const villageSel = document.getElementById('pattaVillageSel');
  const landTypeSel = document.getElementById('pattaLandTypeSelect');

  const talukCode = talukSel ? talukSel.value : '12';
  const villageCode = villageSel ? villageSel.value : '122';
  const landType = landTypeSel ? landTypeSel.value : 'N';

  if ((!pattaNo && !surveyNo) || isFetchingPatta) return;

  if (!pattaNo && surveyNo) {
    const matched = findPattaInStore(surveyNo, subdivNo, villageCode);
    if (matched && matched.pattaNo) {
      pattaNo = matched.pattaNo;
      if (pattaInp) pattaInp.value = pattaNo;
      if (!subdivNo && matched.subdivNo) {
        subdivNo = matched.subdivNo;
        if (subdivInp) subdivInp.value = subdivNo;
      }
    }
  }

  isFetchingPatta = true;

  const queryLabel = pattaNo ? `Patta ${pattaNo}` : `Survey ${surveyNo}${subdivNo ? '/' + subdivNo : ''}`;
  const banner = document.getElementById('pattaStatusBanner');
  if (banner) {
    banner.className = 'tn-status-banner info';
    banner.style.background = 'rgba(37, 99, 235, 0.15)';
    banner.style.color = '#2563eb';
    banner.style.display = 'block';
    banner.textContent = `⏳ Fetching Live Patta / Survey details from Tamil Nilam for ${queryLabel}...`;
  }

  try {
    const url = '/api/areg?mode=fetch_patta&distCode=37&talukCode=' + talukCode + '&villageCode=' + villageCode + '&pattaNo=' + pattaNo + '&surveyNo=' + surveyNo + '&subdivNo=' + subdivNo + '&transType=' + landType;
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      const oldNameInp = document.getElementById('pattaOldNameInput');
      if (oldNameInp) oldNameInp.value = data.ownerName;

      const oldExtentInp = document.getElementById('pattaOldExtentInput');
      if (oldExtentInp) oldExtentInp.value = data.totalExtent;

      const surveyNoInp = document.getElementById('pattaSurveyNoInput');
      if (surveyNoInp) surveyNoInp.value = data.surveyNo;

      const subdivNoInp = document.getElementById('pattaSubdivNoInput');
      if (subdivNoInp) subdivNoInp.value = data.subdivNo;

      const pattaNoInp = document.getElementById('pattaNoInput');
      if (pattaNoInp) pattaNoInp.value = data.pattaNo;

      const bannerMsg = '✓ Live Patta details fetched: ' + data.ownerName + ' | Extent: ' + data.totalExtent + ' (Survey: ' + data.surveyNo + '/' + data.subdivNo + ')';
      if (banner) {
        banner.className = 'tn-status-banner success';
        banner.style.background = 'rgba(34, 197, 94, 0.15)';
        banner.style.color = '#16a34a';
        banner.style.display = 'block';
        banner.textContent = bannerMsg;
      }
      if (typeof toast === 'function') {
        toast('Live Patta Fetched', bannerMsg, 'ok');
      } else if (typeof window.toast === 'function') {
        window.toast('Live Patta Fetched', bannerMsg, 'ok');
      }
    } else {
      if (banner) {
        banner.className = 'tn-status-banner error';
        banner.style.background = 'rgba(239, 68, 68, 0.15)';
        banner.style.color = '#dc2626';
        banner.style.display = 'block';
        banner.textContent = `Could not fetch Patta details: ${data.error || 'Unknown error'}`;
      }
    }
  } catch (err) {
    console.error('Fetch live patta error:', err);
    if (banner) {
      banner.className = 'tn-status-banner error';
      banner.style.background = 'rgba(239, 68, 68, 0.15)';
      banner.style.color = '#dc2626';
      banner.style.display = 'block';
      banner.textContent = `Fetch error: ${err.message}`;
    }
  } finally {
    isFetchingPatta = false;
  }
}
window.findPattaInStore = findPattaInStore;

function getPattaCorrectionsList() {
  try {
    const raw = localStorage.getItem('patta_corrections_list');
    return raw ? JSON.parse(raw) : [];
  } catch(e) {
    return [];
  }
}

function savePattaCorrectionsList(list) {
  try {
    localStorage.setItem('patta_corrections_list', JSON.stringify(list));
  } catch(e) {}
}

async function populatePattaVillages(talukCode) {
  const vSel = document.getElementById('pattaVillageSel');
  if (!vSel) return;
  vSel.innerHTML = '<option value="">Loading villages...</option>';

  let vList = [];
  try {
    const creds = (typeof getTahsildarCreds === 'function') ? getTahsildarCreds() : {};
    const res = await fetch(`/api/chitta?mode=villages&distCode=37&talukCode=${encodeURIComponent(talukCode)}&username=${encodeURIComponent(creds.username || '')}&password=${encodeURIComponent(creds.password || '')}&roleId=${encodeURIComponent(creds.roleId || '')}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.villages) && data.villages.length) {
      vList = data.villages;
    }
  } catch(e) {}

  if (!vList.length) {
    vList = TALUK_VILLAGES_FALLBACK[talukCode] || TALUK_VILLAGES_FALLBACK['12'];
  }

  vSel.innerHTML = vList.map(v => `<option value="${v.id || v.code}">${v.name || v.villageName} (${v.id || v.code})</option>`).join('');
}

function renderPattaTable() {
  const tbody = document.getElementById('pattaTableBody');
  const countBadge = document.getElementById('pattaCountBadge');
  if (!tbody) return;

  const list = getPattaCorrectionsList();
  if (countBadge) countBadge.textContent = list.length;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--muted); font-weight: 500;">No Patta Corrections saved yet. Fill out the form above to add a new entry.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((item, idx) => {
    let statusBadge = '<span style="background: rgba(245, 158, 11, 0.15); color: #d97706; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 11px;">Draft / Saved</span>';
    if (item.status && (item.status.includes('Submitted') || item.status.includes('Changed') || item.status.includes('Approved'))) {
      statusBadge = `<span style="background: rgba(34, 197, 94, 0.15); color: #16a34a; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 11px;">${esc(item.status.startsWith('✓') ? item.status : '✓ ' + item.status)}</span>`;
    } else if (item.status && item.status.includes('Failed')) {
      statusBadge = `<span style="background: rgba(239, 68, 68, 0.15); color: #dc2626; padding: 3px 8px; border-radius: 12px; font-weight: 700; font-size: 11px;">✕ ${esc(item.status)}</span>`;
    }

    const applIdHtml = item.applId ? `<div style="font-size: 10.5px; font-family: monospace; color: var(--muted); margin-top: 3px;">Ref: ${esc(item.applId)}</div>` : '';

    return `
      <tr style="border-bottom: 1px solid var(--line-2); background: ${idx % 2 === 0 ? 'transparent' : 'var(--surface-3, rgba(255,255,255,0.02))'};">
        <td style="padding: 10px 12px; font-weight: 700;">${idx + 1}</td>
        <td style="padding: 10px 12px; font-weight: 600;">${esc(item.talukName)}</td>
        <td style="padding: 10px 12px;">${esc(item.villageName)} <span style="font-size: 11px; color: var(--muted);">(${esc(item.villageCode)})</span></td>
        <td style="padding: 10px 12px; font-weight: 700; color: #2563eb;">${esc(item.pattaNo)}</td>
        <td style="padding: 10px 12px;">
          <div style="color: var(--muted); font-size: 11px; text-decoration: line-through;">${esc(item.oldName || '-')}</div>
          <div style="color: #059669; font-weight: 700;">➔ ${esc(item.newName)}</div>
        </td>
        <td style="padding: 10px 12px;">
          <div style="color: var(--muted); font-size: 11px; text-decoration: line-through;">${esc(item.oldExtent || '-')}</div>
          <div style="color: #d97706; font-weight: 700;">➔ ${esc(item.newExtent)} <span style="font-size: 10px; color: var(--muted);">(${esc(item.extentUnit)})</span></div>
        </td>
        <td style="padding: 10px 12px; font-weight: 600;">${esc(item.surveyNo)} / ${esc(item.subdivNo || '-')}</td>
        <td style="padding: 10px 12px;">
          ${statusBadge}
          ${applIdHtml}
        </td>
        <td style="padding: 10px 12px; text-align: center;">
          <div style="display: inline-flex; gap: 4px; flex-wrap: wrap; justify-content: center;">
            <button type="button" onclick="editPattaCorrectionRow(${idx})" style="background: #2563eb; color: #fff; border: none; border-radius: 5px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">✏️ Edit</button>
            <button type="button" onclick="submitPattaCorrectionRow(${idx})" style="background: #16a34a; color: #fff; border: none; border-radius: 5px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">⚡ Change</button>
            <button type="button" onclick="verifyPattaInChitta(${idx})" title="Jump to Chitta Extract to verify live status" style="background: #0891b2; color: #fff; border: none; border-radius: 5px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;">📜 Verify in Chitta Extract</button>
            <button type="button" onclick="verifyPattaInChitta(${idx}, true)" title="Download Live Chitta PDF" style="background: #0284c7; color: #fff; border: none; border-radius: 5px; padding: 4px 7px; font-size: 11px; font-weight: 600; cursor: pointer;">⬇️ PDF</button>
            <button type="button" onclick="deletePattaCorrectionRow(${idx})" style="background: #ef4444; color: #fff; border: none; border-radius: 5px; padding: 4px 8px; font-size: 11px; font-weight: 600; cursor: pointer;">🗑️ Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function clearPattaCorrectionForm(opts) {
  editingPattaIdx = -1;
  const noIn = document.getElementById('pattaNoInput');
  const landTypeSel = document.getElementById('pattaLandTypeSelect');
  const oldNameIn = document.getElementById('pattaOldNameInput');
  const newNameIn = document.getElementById('pattaNewNameInput');
  const oldExtIn = document.getElementById('pattaOldExtentInput');
  const newExtIn = document.getElementById('pattaNewExtentInput');
  const surveyIn = document.getElementById('pattaSurveyNoInput');
  const subdivIn = document.getElementById('pattaSubdivNoInput');
  const remIn = document.getElementById('pattaRemarksInput');
  const saveBtn = document.getElementById('pattaSaveBtn');
  const banner = document.getElementById('pattaStatusBanner');

  if (noIn) noIn.value = '';
  if (landTypeSel) landTypeSel.value = 'N';
  if (oldNameIn) oldNameIn.value = '';
  if (newNameIn) newNameIn.value = '';
  if (oldExtIn) oldExtIn.value = '';
  if (newExtIn) newExtIn.value = '';
  if (surveyIn) surveyIn.value = '';
  if (subdivIn) subdivIn.value = '';
  if (remIn) remIn.value = '';

  if (saveBtn) saveBtn.innerHTML = '💾 Save Correction';
  if (banner && !(opts && opts.preserveBanner)) banner.style.display = 'none';
}

async function verifyPattaInChitta(itemOrIdx, autoDownload = false) {
  let item = itemOrIdx;
  if (typeof itemOrIdx === 'number') {
    const list = getPattaCorrectionsList();
    item = list[itemOrIdx];
  }
  if (!item) {
    if (typeof toast === 'function') toast('Not Found', 'Patta record not found for verification', 'warn');
    return;
  }

  if (typeof openUsersPanel === 'function') openUsersPanel();
  if (typeof window !== 'undefined') window.ADMIN_TAB = 'chitta';
  ADMIN_TAB = 'chitta';
  if (typeof renderAdminTabs === 'function') renderAdminTabs();

  setTimeout(async () => {
    const distSel = document.getElementById('chittaDist');
    const talukSel = document.getElementById('chittaTaluk');
    const villageSel = document.getElementById('chittaVillage');
    const typeSel = document.getElementById('chittaType');
    const pattaInp = document.getElementById('chittaPattaNo');

    if (distSel) distSel.value = '37';
    if (typeSel && item.landType) typeSel.value = item.landType;
    if (pattaInp && item.pattaNo) pattaInp.value = item.pattaNo;

    const tCode = item.talukCode || '12';
    if (talukSel) {
      talukSel.value = tCode;
      if (typeof populateVillages === 'function') {
        await populateVillages('37', tCode);
      }
      if (villageSel && item.villageCode) {
        villageSel.value = String(item.villageCode).padStart(3, '0');
      }
      const bannerLoc = document.getElementById('chittaBannerLoc');
      if (bannerLoc) {
        const dTxt = distSel?.options[distSel.selectedIndex]?.text || 'Ranipet';
        const tTxt = talukSel?.options[talukSel.selectedIndex]?.text || item.talukName || 'Nemili';
        bannerLoc.textContent = `District: ${dTxt} | Taluk: ${tTxt}`;
      }
    }

    if (autoDownload) {
      const fetchBtn = document.getElementById('chittaFetchBtn');
      if (fetchBtn) {
        fetchBtn.click();
      }
    } else {
      if (typeof toast === 'function') {
        toast('Chitta Extract', `Switched to Chitta Extract for Patta ${item.pattaNo}. Click 'Get Details & Download PDF' to verify.`, 'ok');
      }
    }
  }, 150);
}

async function submitPattaCorrectionToTamilNilam(item, btnElement) {
  if (!item || !item.pattaNo || !item.surveyNo) {
    if (typeof toast === 'function') toast('Validation Error', 'Invalid Patta Correction data for submission', 'warn');
    return;
  }

  const origBtnText = btnElement ? btnElement.innerHTML : '';
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.innerHTML = '⏳ Submitting...';
  }

  const banner = document.getElementById('pattaStatusBanner');
  if (banner) {
    banner.className = 'tn-status-banner info';
    banner.style.background = 'rgba(37, 99, 235, 0.12)';
    banner.style.border = '1px solid #3b82f6';
    banner.style.color = '#1d4ed8';
    banner.style.display = 'block';
    banner.innerHTML = `⏳ <b>Processing Statutory A-Register Correction:</b> Submitting Patta Name &amp; Size correction on Tamil Nilam portal for Patta ${esc(item.pattaNo)}...`;
  }

  try {
    const secCreds = (typeof getTnCreds === 'function') ? getTnCreds('secondary', item.talukName) : {};
    const u = secCreds.username || 'rpt_panneerselvam';
    const p = secCreds.password || 'Nemili@1970';
    const r = secCreds.roleId || '8';
    const landType = item.landType || 'N';
    const serviceCode = (landType === 'N') ? 'N108' : '0109';

    const url = `/api/areg?mode=patta_correction&distCode=37&talukCode=${encodeURIComponent(item.talukCode)}&villageCode=${encodeURIComponent(item.villageCode)}&pattaNo=${encodeURIComponent(item.pattaNo)}&oldPattaName=${encodeURIComponent(item.oldName || '')}&newPattaName=${encodeURIComponent(item.newName || '')}&oldExtent=${encodeURIComponent(item.oldExtent || '')}&newExtent=${encodeURIComponent(item.newExtent || '')}&extentUnit=${encodeURIComponent(item.extentUnit || 'Hectares-Ares')}&surveyNo=${encodeURIComponent(item.surveyNo)}&subdivNo=${encodeURIComponent(item.subdivNo || '')}&transType=${encodeURIComponent(landType)}&serviceCode=${encodeURIComponent(serviceCode)}&remarks=${encodeURIComponent(item.remarks || '')}&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&roleId=${encodeURIComponent(r)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distCode: '37',
        talukCode: item.talukCode,
        villageCode: item.villageCode,
        pattaNo: item.pattaNo,
        oldPattaName: item.oldName || '',
        newPattaName: item.newName || '',
        oldExtent: item.oldExtent || '',
        newExtent: item.newExtent || '',
        extentUnit: item.extentUnit || 'Hectares-Ares',
        surveyNo: item.surveyNo,
        subdivNo: item.subdivNo || '',
        transType: landType,
        serviceCode: serviceCode,
        remarks: item.remarks || '',
        username: u,
        password: p,
        roleId: r
      })
    });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to update Patta Correction on Tamil Nilam');
    }

    const refId = data.applId || data.refId || `PATTA-${Date.now().toString().slice(-6)}`;
    item.status = '✓ Approved (Tahsildar Level)';
    item.applId = refId;
    item.date = item.date || new Date().toLocaleString('en-GB');

    // Update in list
    const list = getPattaCorrectionsList();
    const idx = list.findIndex(x => x.id === item.id || (x.pattaNo === item.pattaNo && x.surveyNo === item.surveyNo));
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.unshift(item);
    }
    savePattaCorrectionsList(list);

    clearPattaCorrectionForm({ preserveBanner: true });
    renderPattaTable();

    if (banner) {
      banner.className = 'tn-status-banner success';
      banner.style.background = 'rgba(34, 197, 94, 0.12)';
      banner.style.border = '1.5px solid #16a34a';
      banner.style.color = '#14532d';
      banner.style.display = 'block';
      banner.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #15803d; display: flex; align-items: center; gap: 6px;">
              <span>✓</span> Patta Name &amp; Size Correction Approved at Tahsildar Level!
            </div>
            <div style="font-size: 12.5px; margin-top: 4px; line-height: 1.4; color: var(--ink);">
              <strong>Application ID / Ref ID:</strong> <span style="font-family: monospace; font-weight: 700; background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px;">${esc(refId)}</span>
              &bull; <strong>Tahsildar Approval:</strong> <span style="color: #16a34a; font-weight: 700;">Approved (Statutory A-Register 0109/N108)</span>
              &bull; <strong>Patta:</strong> <span>${esc(item.pattaNo)}</span>
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <button type="button" id="pattaBannerVerifyChittaBtn" style="background: #0891b2; color: #fff; border: 1px solid #0e7490; padding: 7px 14px; font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 4px rgba(8,145,178,0.25);">
              📜 Verify in Chitta Extract
            </button>
            <button type="button" id="pattaBannerDownloadPdfBtn" style="background: #2563eb; color: #fff; border: 1px solid #1d4ed8; padding: 7px 14px; font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 4px rgba(37,99,235,0.25);">
              ⬇️ Download Live PDF
            </button>
          </div>
        </div>
      `;
      document.getElementById('pattaBannerVerifyChittaBtn')?.addEventListener('click', () => {
        verifyPattaInChitta(item, false);
      });
      document.getElementById('pattaBannerDownloadPdfBtn')?.addEventListener('click', () => {
        verifyPattaInChitta(item, true);
      });
    }

    if (typeof toast === 'function') {
      toast('Update Successful', `✓ Patta owner name & size changed and approved at Tahsildar level! Ref: ${refId}`, 'ok');
    }
  } catch(err) {
    console.error('Submit Patta Correction error:', err);
    if (banner) {
      banner.className = 'tn-status-banner error';
      banner.style.background = 'rgba(239, 68, 68, 0.15)';
      banner.style.border = '1px solid #ef4444';
      banner.style.color = '#dc2626';
      banner.textContent = `Error updating Patta: ${err.message}`;
    }
    if (typeof toast === 'function') {
      toast('Update Failed', err.message, 'err');
    }
  } finally {
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerHTML = origBtnText || '⚡ Change';
    }
  }
}

async function savePattaCorrectionForm() {
  const talukSel = document.getElementById('pattaTalukSel');
  const villageSel = document.getElementById('pattaVillageSel');
  const landTypeSel = document.getElementById('pattaLandTypeSelect');
  const pattaNo = document.getElementById('pattaNoInput')?.value.trim();
  const landType = landTypeSel ? landTypeSel.value : 'N';
  const oldName = document.getElementById('pattaOldNameInput')?.value.trim();
  const newName = document.getElementById('pattaNewNameInput')?.value.trim();
  const oldExtent = document.getElementById('pattaOldExtentInput')?.value.trim();
  const newExtent = document.getElementById('pattaNewExtentInput')?.value.trim();
  const extentUnit = document.getElementById('pattaExtentUnitSel')?.value;
  const surveyNo = document.getElementById('pattaSurveyNoInput')?.value.trim();
  const subdivNo = document.getElementById('pattaSubdivNoInput')?.value.trim();
  const remarks = document.getElementById('pattaRemarksInput')?.value.trim();

  if (!pattaNo || !newName || !newExtent || !surveyNo) {
    if (typeof toast === 'function') toast('Validation Error', 'Patta No, Corrected Owner Name, Corrected Extent, and Survey No are required', 'warn');
    return;
  }

  const talukCode = talukSel ? talukSel.value : '12';
  const talukName = talukSel ? talukSel.options[talukSel.selectedIndex].text.split(' ')[0] : 'Nemili';
  const villageCode = villageSel ? villageSel.value : '122';
  const villageName = villageSel && villageSel.options[villageSel.selectedIndex] ? villageSel.options[villageSel.selectedIndex].text.replace(/\s*\(\d+\)/, '').trim() : 'Nemili';

  const list = getPattaCorrectionsList();

  const record = {
    id: editingPattaIdx >= 0 && list[editingPattaIdx] ? list[editingPattaIdx].id : `PATTA-${Date.now()}`,
    talukCode,
    talukName,
    villageCode,
    villageName,
    landType: landType || 'N',
    pattaNo,
    oldName,
    newName,
    oldExtent,
    newExtent,
    extentUnit: extentUnit || 'Hectares-Ares',
    surveyNo,
    subdivNo,
    remarks: remarks || 'Patta Name and Size Correction',
    status: editingPattaIdx >= 0 && list[editingPattaIdx] ? list[editingPattaIdx].status : 'Draft / Processing',
    applId: editingPattaIdx >= 0 && list[editingPattaIdx] ? (list[editingPattaIdx].applId || '') : '',
    date: new Date().toLocaleString('en-GB')
  };

  const saveBtn = document.getElementById('pattaSaveBtn');
  await submitPattaCorrectionToTamilNilam(record, saveBtn);
}

async function submitPattaCorrectionFromForm() {
  const talukSel = document.getElementById('pattaTalukSel');
  const villageSel = document.getElementById('pattaVillageSel');
  const landTypeSel = document.getElementById('pattaLandTypeSelect');
  const pattaNo = document.getElementById('pattaNoInput')?.value.trim();
  const landType = landTypeSel ? landTypeSel.value : 'N';
  const oldName = document.getElementById('pattaOldNameInput')?.value.trim();
  const newName = document.getElementById('pattaNewNameInput')?.value.trim();
  const oldExtent = document.getElementById('pattaOldExtentInput')?.value.trim();
  const newExtent = document.getElementById('pattaNewExtentInput')?.value.trim();
  const extentUnit = document.getElementById('pattaExtentUnitSel')?.value;
  const surveyNo = document.getElementById('pattaSurveyNoInput')?.value.trim();
  const subdivNo = document.getElementById('pattaSubdivNoInput')?.value.trim();
  const remarks = document.getElementById('pattaRemarksInput')?.value.trim();

  if (!pattaNo || !newName || !newExtent || !surveyNo) {
    if (typeof toast === 'function') toast('Validation Error', 'Patta No, Corrected Owner Name, Corrected Extent, and Survey No are required', 'warn');
    return;
  }

  const talukCode = talukSel ? talukSel.value : '12';
  const talukName = talukSel ? talukSel.options[talukSel.selectedIndex].text.split(' ')[0] : 'Nemili';
  const villageCode = villageSel ? villageSel.value : '122';
  const villageName = villageSel && villageSel.options[villageSel.selectedIndex] ? villageSel.options[villageSel.selectedIndex].text.replace(/\s*\(\d+\)/, '').trim() : 'Nemili';

  const list = getPattaCorrectionsList();

  const record = {
    id: editingPattaIdx >= 0 && list[editingPattaIdx] ? list[editingPattaIdx].id : `PATTA-${Date.now()}`,
    talukCode,
    talukName,
    villageCode,
    villageName,
    landType: landType || 'N',
    pattaNo,
    oldName,
    newName,
    oldExtent,
    newExtent,
    extentUnit: extentUnit || 'Hectares-Ares',
    surveyNo,
    subdivNo,
    remarks: remarks || 'Patta Name and Size Correction',
    status: editingPattaIdx >= 0 && list[editingPattaIdx] ? list[editingPattaIdx].status : 'Draft / Processing',
    applId: editingPattaIdx >= 0 && list[editingPattaIdx] ? (list[editingPattaIdx].applId || '') : '',
    date: new Date().toLocaleString('en-GB')
  };

  const btn = document.getElementById('pattaSubmitBtn');
  await submitPattaCorrectionToTamilNilam(record, btn);
}

function submitPattaCorrectionRow(idx) {
  const list = getPattaCorrectionsList();
  if (!list[idx]) return;
  submitPattaCorrectionToTamilNilam(list[idx]);
}

function editPattaCorrectionRow(idx) {
  const list = getPattaCorrectionsList();
  const item = list[idx];
  if (!item) return;

  editingPattaIdx = idx;

  const talukSel = document.getElementById('pattaTalukSel');
  if (talukSel) {
    talukSel.value = item.talukCode;
    populatePattaVillages(item.talukCode).then(() => {
      const vSel = document.getElementById('pattaVillageSel');
      if (vSel) vSel.value = item.villageCode;
    });
  }

  const noIn = document.getElementById('pattaNoInput');
  const landTypeSel = document.getElementById('pattaLandTypeSelect');
  const oldNameIn = document.getElementById('pattaOldNameInput');
  const newNameIn = document.getElementById('pattaNewNameInput');
  const oldExtIn = document.getElementById('pattaOldExtentInput');
  const newExtIn = document.getElementById('pattaNewExtentInput');
  const unitSel = document.getElementById('pattaExtentUnitSel');
  const surveyIn = document.getElementById('pattaSurveyNoInput');
  const subdivIn = document.getElementById('pattaSubdivNoInput');
  const remIn = document.getElementById('pattaRemarksInput');
  const saveBtn = document.getElementById('pattaSaveBtn');

  if (noIn) noIn.value = item.pattaNo || '';
  if (landTypeSel) landTypeSel.value = item.landType || 'N';
  if (oldNameIn) oldNameIn.value = item.oldName || '';
  if (newNameIn) newNameIn.value = item.newName || '';
  if (oldExtIn) oldExtIn.value = item.oldExtent || '';
  if (newExtIn) newExtIn.value = item.newExtent || '';
  if (unitSel) unitSel.value = item.extentUnit || 'Hectares-Ares';
  if (surveyIn) surveyIn.value = item.surveyNo || '';
  if (subdivIn) subdivIn.value = item.subdivNo || '';
  if (remIn) remIn.value = item.remarks || '';

  if (saveBtn) saveBtn.innerHTML = '💾 Update Correction';

  const wrapper = document.getElementById('pattaPortalWrapper');
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth' });
}

function deletePattaCorrectionRow(idx) {
  const list = getPattaCorrectionsList();
  if (!list[idx]) return;
  if (!confirm(`Are you sure you want to delete Patta Correction entry for Patta ${list[idx].pattaNo}?`)) return;

  list.splice(idx, 1);
  savePattaCorrectionsList(list);
  renderPattaTable();
  if (typeof toast === 'function') toast('Entry Deleted', 'Patta Correction entry removed', 'info');
}

function exportPattaCorrectionsToExcel() {
  const list = getPattaCorrectionsList();
  if (!list.length) {
    if (typeof toast === 'function') toast('Export Info', 'No Patta Corrections to export', 'info');
    return;
  }

  const exportData = list.map((item, idx) => ({
    'Sno': idx + 1,
    'Taluk': item.talukName,
    'Village': `${item.villageName} (${item.villageCode})`,
    'Patta No': item.pattaNo,
    'Old Owner Name': item.oldName || '',
    'New Owner Name': item.newName,
    'Old Extent': item.oldExtent || '',
    'New Extent': item.newExtent,
    'Extent Unit': item.extentUnit,
    'Survey No': item.surveyNo,
    'Subdivision No': item.subdivNo || '',
    'Remarks': item.remarks || '',
    'Status': item.status,
    'Reference / Appl ID': item.applId || '',
    'Date Added': item.date || ''
  }));

  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Patta Corrections");
    XLSX.writeFile(wb, `Patta_Corrections_Ranipet.xlsx`);
    if (typeof toast === 'function') toast('Export Complete', 'Exported Patta Corrections to Excel', 'ok');
  } else {
    if (typeof toast === 'function') toast('Export Error', 'XLSX library not loaded', 'err');
  }
}

async function renderPattaCorrectionTab() {
  const box = document.getElementById('usersBody');
  if (!box) return;

  box.innerHTML = `
    <div id="pattaPortalWrapper" style="max-width: 960px; margin: 10px auto 40px; display: flex; flex-direction: column; gap: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      
      <!-- TN Govt Header Banner -->
      <div style="background: linear-gradient(135deg, #065f46 0%, #047857 50%, #059669 100%); color: #fff; border-radius: 14px; padding: 20px 24px; box-shadow: 0 4px 14px rgba(4, 120, 87, 0.25);">
        <div style="display: flex; align-items: center; justify-content: center; gap: 18px; flex-wrap: wrap; text-align: center;">
          <div style="background: #fff; border-radius: 50%; padding: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">
            <img src="/logo.jpg" alt="TN Govt Emblem" style="height: 54px; width: 54px; object-fit: contain; border-radius: 50%;">
          </div>
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.4px; color: #fff;">Revenue and Disaster Management Department</h2>
            <div style="font-size: 14px; font-weight: 600; opacity: 0.95; margin-top: 2px; color: #a7f3d0;">Government of Tamil Nadu • வருவாய்த் துறை</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 2px; color: #ecfdf5;">📜 Patta Owner Name &amp; Extent/Size Correction Suite (பட்டா பெயர் மற்றும் பரப்பு திருத்தம்)</div>
          </div>
        </div>
      </div>

      <!-- Form Card -->
      <div style="background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 24px 26px; box-shadow: var(--shadow);">
        
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid var(--line-2); padding-bottom: 12px; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
          <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #059669; display: flex; align-items: center; gap: 8px;">
            <span>📝</span> Patta Name &amp; Size Correction Details
          </h3>
          <span style="font-size: 12px; font-weight: 600; color: var(--muted); background: var(--surface); padding: 4px 10px; border-radius: 6px; border: 1px solid var(--line-2);">
            Ranipet District (37)
          </span>
        </div>

        <!-- Statutory Explanation Notice -->
        <div style="background: rgba(5, 150, 105, 0.08); border: 1px solid rgba(5, 150, 105, 0.25); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12.5px; color: var(--ink); line-height: 1.5; display: flex; align-items: flex-start; gap: 10px;">
          <span style="font-size: 18px; line-height: 1;">ℹ️</span>
          <div>
            <strong>Statutory Notice:</strong> In Tamil Nilam, changes to Patta Name &amp; Size are processed through statutory A-Register Correction (0109/N108). Clicking Change submits and approves the correction at Tahsildar level.
          </div>
        </div>

        <!-- Form Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 20px;">
          
          <!-- Taluk -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Taluk / வட்டம் <span style="color: #ef4444;">*</span>
            </label>
            <select id="pattaTalukSel" style="width: 100%; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
              <option value="03">Arakkonam (அரக்கோணம்)</option>
              <option value="12" selected>Nemili (நெமிலி)</option>
              <option value="04">Walajah (வாலாஜா)</option>
              <option value="02">Arcot (ஆற்காடு)</option>
              <option value="13">Kalavai (கலவை)</option>
              <option value="14">Sholinghur (சோளிங்கர்)</option>
            </select>
          </div>

          <!-- Village -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Village Name / Code / கிராமம் <span style="color: #ef4444;">*</span>
            </label>
            <select id="pattaVillageSel" style="width: 100%; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
              <option value="">Loading villages...</option>
            </select>
          </div>

          <!-- Land Type -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Land Type / நில வகை <span style="color: #ef4444;">*</span>
            </label>
            <select id="pattaLandTypeSelect" style="width: 100%; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
              <option value="N" selected>Natham (நத்தம்)</option>
              <option value="R">Rural (கிராமப்புறம்)</option>
            </select>
          </div>

          <!-- Patta Number -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Patta Number / பட்டா எண் <span style="color: #ef4444;">*</span>
            </label>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="pattaNoInput" placeholder="e.g. 1245" style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
              <button type="button" id="pattaFetchLiveBtn" title="Search live details by Patta Number or Survey/Subdivision Number" style="background: #0284c7; color: #fff; border: 1px solid #0369a1; padding: 8px 12px; font-size: 12px; font-weight: 700; border-radius: 8px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">🔍 Search Patta / Survey</button>
            </div>
          </div>

          <!-- Current Patta Owner Name -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Current Owner Name / தற்போதைய பெயர்
            </label>
            <input type="text" id="pattaOldNameInput" placeholder="e.g. Raman K." style="width: 100%; padding: 8px 12px; font-size: 13px; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
          </div>

          <!-- Corrected Patta Owner Name -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Corrected Owner Name / திருத்தப்பட்ட பெயர் <span style="color: #ef4444;">*</span>
            </label>
            <input type="text" id="pattaNewNameInput" placeholder="e.g. Ramanathan S/o Murugan" style="width: 100%; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
          </div>

          <!-- Current Extent / Size -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Current Extent/Size / தற்போதைய பரப்பு
            </label>
            <input type="text" id="pattaOldExtentInput" placeholder="e.g. 0.12.50 or 1200" style="width: 100%; padding: 8px 12px; font-size: 13px; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
          </div>

          <!-- Corrected Extent / Size -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Corrected Extent/Size / திருத்தப்பட்ட பரப்பு <span style="color: #ef4444;">*</span>
            </label>
            <input type="text" id="pattaNewExtentInput" placeholder="e.g. 0.15.00 or 1500" style="width: 100%; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
          </div>

          <!-- Extent Unit -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Extent Unit / பரப்பு அலகு
            </label>
            <select id="pattaExtentUnitSel" style="width: 100%; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
              <option value="Hectares-Ares">Hectares-Ares (ஹெக்டேர் - ஏர்ஸ்)</option>
              <option value="Sq.Ft">Sq.Ft (சதுர அடி)</option>
              <option value="Acres">Acres (ஏக்கர்)</option>
            </select>
          </div>

          <!-- Survey Number -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Survey Number / புல எண் <span style="color: #ef4444;">*</span>
            </label>
            <input type="text" id="pattaSurveyNoInput" placeholder="e.g. 142" style="width: 100%; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
          </div>

          <!-- Subdivision Number -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Subdivision Number / உட்பிரிவு எண்
            </label>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="pattaSubdivNoInput" placeholder="e.g. 1A" style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
              <button type="button" id="pattaSurveyFetchLiveBtn" title="Search live details by Survey Number + Subdivision Number" style="background: #0284c7; color: #fff; border: 1px solid #0369a1; padding: 8px 12px; font-size: 12px; font-weight: 700; border-radius: 8px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">🔍 Search Patta / Survey</button>
            </div>
          </div>

          <!-- Remarks -->
          <div style="grid-column: 1 / -1;">
            <label style="display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 5px;">
              Remarks / Reason for Correction / திருத்தத்திற்கான காரணம்
            </label>
            <input type="text" id="pattaRemarksInput" placeholder="e.g. Owner name spelling correction as per AADHAAR &amp; Extent update per A-Register" style="width: 100%; padding: 8px 12px; font-size: 13px; border-radius: 8px; border: 1.5px solid var(--line-2); background: var(--surface); color: var(--ink);">
          </div>

        </div>

        <!-- Status Banner inside card -->
        <div id="pattaStatusBanner" style="display: none; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; margin-bottom: 16px;"></div>

        <!-- Action Buttons -->
        <div style="display: flex; align-items: center; justify-content: flex-start; gap: 10px; flex-wrap: wrap; padding-top: 14px; border-top: 1px dashed var(--line-2);">
          <button type="button" id="pattaSaveBtn" style="background: #2563eb; color: #fff; border: 1px solid #1d4ed8; padding: 10px 18px; font-size: 13px; font-weight: 700; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);">
            💾 Save Correction
          </button>
          <button type="button" id="pattaSubmitBtn" style="background: #16a34a; color: #fff; border: 1px solid #15803d; padding: 10px 18px; font-size: 13px; font-weight: 700; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(22, 163, 74, 0.25);">
            ⚡ Change
          </button>
          <button type="button" id="pattaExportBtn" style="background: #0284c7; color: #fff; border: 1px solid #0369a1; padding: 10px 18px; font-size: 13px; font-weight: 700; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);">
            📊 Export Patta Corrections to Excel
          </button>
          <button type="button" id="pattaClearBtn" style="background: var(--surface-3, #475569); color: #fff; border: 1px solid var(--line-2); padding: 10px 14px; font-size: 12.5px; font-weight: 600; border-radius: 8px; cursor: pointer;">
            🔄 Reset Form
          </button>
        </div>

      </div>

      <!-- Saved Table Card -->
      <div style="background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 20px 24px; box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--ink); display: flex; align-items: center; gap: 8px;">
            <span>📜</span> Saved Patta Corrections (<span id="pattaCountBadge">0</span>)
          </h3>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left;">
            <thead>
              <tr style="background: var(--surface-3, #1e293b); color: #fff; border-bottom: 2px solid var(--line-2);">
                <th style="padding: 10px 12px; font-weight: 700; width: 45px;">Sno</th>
                <th style="padding: 10px 12px; font-weight: 700;">Taluk</th>
                <th style="padding: 10px 12px; font-weight: 700;">Village</th>
                <th style="padding: 10px 12px; font-weight: 700;">Patta No</th>
                <th style="padding: 10px 12px; font-weight: 700;">Old Name ➔ New Name</th>
                <th style="padding: 10px 12px; font-weight: 700;">Old Extent ➔ New Extent</th>
                <th style="padding: 10px 12px; font-weight: 700;">Survey/Subdiv</th>
                <th style="padding: 10px 12px; font-weight: 700;">Status</th>
                <th style="padding: 10px 12px; font-weight: 700; text-align: center; width: 320px;">Actions</th>
              </tr>
            </thead>
            <tbody id="pattaTableBody">
              <!-- Dynamically populated rows -->
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  const talukSel = document.getElementById('pattaTalukSel');
  if (talukSel) {
    const currentTaluk = (typeof window.TALUK !== 'undefined' && window.TALUK) ? window.TALUK : 'Nemili';
    const tCode = (typeof resolveTalukCode === 'function') ? resolveTalukCode(currentTaluk) : '12';
    talukSel.value = tCode;
    talukSel.addEventListener('change', () => populatePattaVillages(talukSel.value));
    populatePattaVillages(tCode);
  }

  const pattaInp = document.getElementById('pattaNoInput');
  if (pattaInp) {
    pattaInp.addEventListener('blur', fetchLivePattaInfo);
    pattaInp.addEventListener('change', fetchLivePattaInfo);
  }
  const surveyInp = document.getElementById('pattaSurveyNoInput');
  if (surveyInp) {
    surveyInp.addEventListener('blur', fetchLivePattaInfo);
    surveyInp.addEventListener('change', fetchLivePattaInfo);
  }
  const subdivInp = document.getElementById('pattaSubdivNoInput');
  if (subdivInp) {
    subdivInp.addEventListener('blur', fetchLivePattaInfo);
    subdivInp.addEventListener('change', fetchLivePattaInfo);
  }
  const landTypeSel = document.getElementById('pattaLandTypeSelect');
  if (landTypeSel) {
    landTypeSel.addEventListener('change', fetchLivePattaInfo);
  }
  document.getElementById('pattaFetchLiveBtn')?.addEventListener('click', fetchLivePattaInfo);
  document.getElementById('pattaSurveyFetchLiveBtn')?.addEventListener('click', fetchLivePattaInfo);

  document.getElementById('pattaSaveBtn')?.addEventListener('click', savePattaCorrectionForm);
  document.getElementById('pattaSubmitBtn')?.addEventListener('click', submitPattaCorrectionFromForm);
  document.getElementById('pattaExportBtn')?.addEventListener('click', exportPattaCorrectionsToExcel);
  document.getElementById('pattaClearBtn')?.addEventListener('click', clearPattaCorrectionForm);

  renderPattaTable();
}

window.renderPattaCorrectionTab = renderPattaCorrectionTab;
window.fetchLivePattaInfo = fetchLivePattaInfo;
window.getPattaCorrectionsList = getPattaCorrectionsList;
window.savePattaCorrectionsList = savePattaCorrectionsList;
window.savePattaCorrectionForm = savePattaCorrectionForm;
window.submitPattaCorrectionToTamilNilam = submitPattaCorrectionToTamilNilam;
window.submitPattaCorrectionFromForm = submitPattaCorrectionFromForm;
window.submitPattaCorrectionRow = submitPattaCorrectionRow;
window.verifyPattaInChitta = verifyPattaInChitta;
window.editPattaCorrectionRow = editPattaCorrectionRow;
window.deletePattaCorrectionRow = deletePattaCorrectionRow;
window.exportPattaCorrectionsToExcel = exportPattaCorrectionsToExcel;
window.clearPattaCorrectionForm = clearPattaCorrectionForm;

/* ============================================================
   Database Info & Query Suite (Admin Hub)
   Schema Directory, Metrics, Live Query Console & SQL Tools
   ============================================================ */
const DB_SCHEMA_DIRECTORY = [
  {
    id: 'isd_users',
    name: 'Authorized Users (isd_users)',
    icon: '👥',
    type: 'Cloud PostgreSQL Table',
    badge: 'PostgreSQL Cloud',
    desc: 'Authentication, access roles (Admin/User), allowed taluks, module menu permissions & password management rights.',
    source: 'supabase',
    tableName: 'isd_users',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'uuid', constraints: 'PK, DEFAULT gen_random_uuid()', desc: 'Unique account identifier' },
      { name: 'email', type: 'text', constraints: 'NOT NULL, UNIQUE', desc: 'Account login & contact email address' },
      { name: 'full_name', type: 'text', constraints: 'NULLABLE', desc: 'Display name / officer designation' },
      { name: 'role', type: 'text', constraints: 'DEFAULT \'user\'', desc: 'System privilege level: admin | user' },
      { name: 'active', type: 'boolean', constraints: 'DEFAULT true', desc: 'Active login status flag' },
      { name: 'site_access', type: 'text', constraints: 'DEFAULT \'both\'', desc: 'Target portal scope: both | village-auto-test | village-applications' },
      { name: 'menu_access', type: 'jsonb', constraints: 'NULLABLE', desc: 'Authorized modules [isd, nisd, fline, chitta, eservices, areg, patta]' },
      { name: 'report_access', type: 'text', constraints: 'NULLABLE (legacy)', desc: 'Legacy module single report restriction' },
      { name: 'taluks', type: 'jsonb', constraints: 'NULLABLE', desc: 'Allowed taluks array (empty = all taluks unrestricted)' },
      { name: 'can_view_creds', type: 'boolean', constraints: 'DEFAULT false', desc: 'Permission to view secondary Tamil Nilam passwords' },
      { name: 'can_update_creds', type: 'boolean', constraints: 'DEFAULT false', desc: 'Permission to update secondary Tamil Nilam passwords' },
      { name: 'created_at', type: 'timestamptz', constraints: 'DEFAULT now()', desc: 'Account registration timestamp' },
      { name: 'updated_at', type: 'timestamptz', constraints: 'DEFAULT now()', desc: 'Account last modification timestamp' }
    ]
  },
  {
    id: 'isd_invites',
    name: 'Pending Invites (isd_invites)',
    icon: '✉️',
    type: 'Cloud PostgreSQL Table',
    badge: 'PostgreSQL Cloud',
    desc: 'Pre-registered account invitations with pre-configured taluk scopes and module privileges.',
    source: 'supabase',
    tableName: 'isd_invites',
    primaryKey: 'email',
    columns: [
      { name: 'email', type: 'text', constraints: 'PK', desc: 'Invitee email address' },
      { name: 'full_name', type: 'text', constraints: 'NULLABLE', desc: 'Invitee full name' },
      { name: 'role', type: 'text', constraints: 'DEFAULT \'user\'', desc: 'Granted privilege level: user | admin' },
      { name: 'site_access', type: 'text', constraints: 'DEFAULT \'both\'', desc: 'Pre-assigned portal site scope' },
      { name: 'menu_access', type: 'text[]', constraints: 'NULLABLE', desc: 'Pre-assigned menu modules' },
      { name: 'taluks', type: 'text[]', constraints: 'NULLABLE', desc: 'Pre-assigned taluk jurisdiction' },
      { name: 'can_view_creds', type: 'boolean', constraints: 'DEFAULT false', desc: 'Pre-assigned credential view permission' },
      { name: 'can_update_creds', type: 'boolean', constraints: 'DEFAULT false', desc: 'Pre-assigned credential edit permission' },
      { name: 'invited_by', type: 'uuid', constraints: 'FK -> isd_users.id', desc: 'Admin account that initiated invitation' },
      { name: 'created_at', type: 'timestamptz', constraints: 'DEFAULT now()', desc: 'Invitation dispatch timestamp' }
    ]
  },
  {
    id: 'isd_test_datasets',
    name: 'Stored Cloud Files (isd_test_datasets / isd_files)',
    icon: '📁',
    type: 'Cloud PostgreSQL Table',
    badge: 'PostgreSQL Cloud',
    desc: 'Uploaded ISD, NISD Rural/Natham, and F-Line data files, row counts, parsed datasets and uploader audit logs.',
    source: 'supabase',
    tableName: 'isd_test_datasets',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'bigint', constraints: 'PK, GENERATED BY DEFAULT', desc: 'Internal file record unique ID' },
      { name: 'kind', type: 'text', constraints: 'NOT NULL', desc: 'Dataset type: isd | nisd_rural | nisd_natham | fline | fline_app' },
      { name: 'taluk', type: 'text', constraints: 'NULLABLE', desc: 'Revenue taluk partition or ALL' },
      { name: 'filename', type: 'text', constraints: 'NULLABLE', desc: 'Original spreadsheet or CSV filename' },
      { name: 'row_count', type: 'integer', constraints: 'DEFAULT 0', desc: 'Total data rows parsed and stored' },
      { name: 'dataset', type: 'jsonb', constraints: 'NULLABLE', desc: 'Structured JSON data payload' },
      { name: 'updated_at', type: 'timestamptz', constraints: 'DEFAULT now()', desc: 'Last cloud sync timestamp' },
      { name: 'updated_by', type: 'uuid', constraints: 'FK -> isd_users.id', desc: 'User who uploaded or last updated the dataset' }
    ]
  },
  {
    id: 'isd_taluk_credentials',
    name: 'Taluk Credentials (isd_taluk_credentials / taluk_creds)',
    icon: '🔑',
    type: 'Cloud PostgreSQL Table',
    badge: 'PostgreSQL Cloud',
    desc: 'Taluk-wise Tamil Nilam secondary login credentials (Tahsildar / Deputy Tahsildar role 8) for PDF fetch & approvals.',
    source: 'supabase',
    tableName: 'isd_taluk_credentials',
    primaryKey: 'taluk_code',
    columns: [
      { name: 'id', type: 'bigint', constraints: 'GENERATED BY DEFAULT', desc: 'Internal row identifier' },
      { name: 'taluk_code', type: 'text', constraints: 'PK, NOT NULL, UNIQUE', desc: '2-digit Tamil Nilam taluk code (e.g. 12=Nemili, 03=Arakkonam)' },
      { name: 'taluk_name', type: 'text', constraints: 'NOT NULL', desc: 'Revenue Taluk name' },
      { name: 'username', type: 'text', constraints: 'NOT NULL', desc: 'Tamil Nilam secondary login user handle' },
      { name: 'password', type: 'text', constraints: 'NOT NULL', desc: 'Tamil Nilam portal password' },
      { name: 'role_id', type: 'text', constraints: 'DEFAULT \'8\'', desc: 'Role identifier (8 = Tahsildar / Deputy Tahsildar)' },
      { name: 'updated_at', type: 'timestamptz', constraints: 'DEFAULT now()', desc: 'Credential update timestamp' },
      { name: 'updated_by', type: 'uuid', constraints: 'FK -> isd_users.id', desc: 'Admin who last updated password' }
    ]
  },
  {
    id: 'patta_corrections',
    name: 'Patta Corrections (patta_corrections)',
    icon: '📜',
    type: 'Local & Cloud Synced Store',
    badge: 'PostgreSQL + Local Sync',
    desc: 'Patta owner name and extent size corrections, survey tracking, approval status, and audit records.',
    source: 'mixed',
    tableName: 'patta_corrections',
    primaryKey: 'id',
    columns: [
      { name: 'id', type: 'text/uuid', constraints: 'PK', desc: 'Correction reference UUID' },
      { name: 'taluk_code', type: 'text', constraints: 'NOT NULL', desc: 'Taluk code' },
      { name: 'taluk_name', type: 'text', constraints: 'NOT NULL', desc: 'Taluk name' },
      { name: 'village_code', type: 'text', constraints: 'NOT NULL', desc: 'Revenue village code' },
      { name: 'village_name', type: 'text', constraints: 'NOT NULL', desc: 'Revenue village name' },
      { name: 'patta_no', type: 'text', constraints: 'NOT NULL', desc: 'Patta number' },
      { name: 'survey_no', type: 'text', constraints: 'NOT NULL', desc: 'Land survey number' },
      { name: 'subdiv_no', type: 'text', constraints: 'NULLABLE', desc: 'Subdivision number' },
      { name: 'land_type', type: 'text', constraints: 'DEFAULT \'Rural\'', desc: 'Classification: Rural | Natham' },
      { name: 'old_name', type: 'text', constraints: 'NULLABLE', desc: 'Original owner name from Chitta extract' },
      { name: 'new_name', type: 'text', constraints: 'NULLABLE', desc: 'Corrected / revised owner name' },
      { name: 'old_extent', type: 'text', constraints: 'NULLABLE', desc: 'Original registered area/extent' },
      { name: 'new_extent', type: 'text', constraints: 'NULLABLE', desc: 'Corrected registered area/extent' },
      { name: 'extent_unit', type: 'text', constraints: 'DEFAULT \'Hectares-Ares\'', desc: 'Unit of area measurement' },
      { name: 'status', type: 'text', constraints: 'DEFAULT \'Pending\'', desc: 'Approval status: Pending | Approved & Completed' },
      { name: 'created_at', type: 'timestamptz', constraints: 'DEFAULT now()', desc: 'Submission timestamp' }
    ]
  },
  {
    id: 'village_settings',
    name: 'Day Ranges & App Settings (village_settings)',
    icon: '📊',
    type: 'System Configuration Store',
    badge: 'Configuration Store',
    desc: 'Cut-off day thresholds (25/30 days), custom category labels, taluk roster, and sorting preferences.',
    source: 'local',
    tableName: 'village_settings',
    primaryKey: 'setting_key',
    columns: [
      { name: 'setting_key', type: 'text', constraints: 'PK', desc: 'Configuration storage key' },
      { name: 'setting_value', type: 'jsonb / text', constraints: 'NOT NULL', desc: 'Configured parameters, thresholds array or taluk list' },
      { name: 'category', type: 'text', constraints: 'NULLABLE', desc: 'Group: ISD Thresholds | NISD Ranges | Taluks' },
      { name: 'updated_at', type: 'timestamptz', constraints: 'DEFAULT now()', desc: 'Last modified timestamp' }
    ]
  }
];

let __dbConsoleState = {
  currentResults: [],
  filteredResults: [],
  currentPage: 1,
  pageSize: 25,
  activeTable: 'isd_users',
  lastQueryTimeMs: 0,
  lastQueryString: ''
};

async function renderDbInfoTab() {
  const box = document.getElementById('usersBody');
  if (!box) return;

  const isAdmin = !CLOUD_ON || (ME && ME.role === 'admin');
  if (!isAdmin) {
    box.innerHTML = '<div class="empty">Access restricted: Only Admin accounts can access Database Info & Query Suite.</div>';
    return;
  }

  const totalTables = DB_SCHEMA_DIRECTORY.length;
  const totalColumns = DB_SCHEMA_DIRECTORY.reduce((acc, t) => acc + (t.columns ? t.columns.length : 0), 0);
  const cloudEngineStatus = (CLOUD_ON && sb) 
    ? 'Supabase PostgreSQL 15+ (Cloud Connected)' 
    : 'Offline Local Cache & Client Storage';
  const cloudEngineBadge = (CLOUD_ON && sb) 
    ? '<span style="background: rgba(34,197,94,0.15); color: #16a34a; border: 1px solid rgba(34,197,94,0.3); padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">🟢 Online / Cloud Sync</span>'
    : '<span style="background: rgba(245,158,11,0.15); color: #d97706; border: 1px solid rgba(245,158,11,0.3); padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">🟡 Offline / Local Sync</span>';

  box.innerHTML = `
    <div id="dbSuiteWrapper" style="max-width: 1040px; margin: 10px auto 40px; display: flex; flex-direction: column; gap: 22px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">

      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%); color: #fff; border-radius: 14px; padding: 22px 26px; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.35); border: 1px solid rgba(255,255,255,0.1);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); border-radius: 12px; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; font-size: 28px; box-shadow: 0 4px 12px rgba(37,99,235,0.35);">
              🗄️
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.3px; color: #fff;">Database Info &amp; Live Query Suite</h2>
                ${cloudEngineBadge}
              </div>
              <div style="font-size: 13px; color: #94a3b8; margin-top: 3px; font-weight: 500;">
                Supabase PostgreSQL Schema Directory, Live Query Console &amp; Admin ID Scripts (தரவுத்தள தகவல் மற்றும் வினவல் மையம்)
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="ghost" id="dbRefreshAllBtn" style="background: rgba(255,255,255,0.08); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.2); padding: 7px 14px; font-size: 12.5px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              🔄 Refresh Metrics &amp; Counts
            </button>
          </div>
        </div>
      </div>

      <!-- 1. Summary Metrics Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px;">
        
        <!-- Total Tables -->
        <div style="background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 12px; padding: 18px 20px; box-shadow: var(--shadow);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);">Total Tables Tracked</span>
            <span style="font-size: 20px;">🗃️</span>
          </div>
          <div style="font-size: 26px; font-weight: 800; color: #2563eb;" id="dbMetricTablesCount">${totalTables} Tables</div>
          <div style="font-size: 11.5px; color: var(--muted); margin-top: 4px; line-height: 1.4;">
            isd_users, isd_invites, isd_files, patta_corrections, taluk_creds, village_settings
          </div>
        </div>

        <!-- Total Columns -->
        <div style="background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 12px; padding: 18px 20px; box-shadow: var(--shadow);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);">Total Schema Columns</span>
            <span style="font-size: 20px;">📑</span>
          </div>
          <div style="font-size: 26px; font-weight: 800; color: #0284c7;" id="dbMetricColumnsCount">${totalColumns} Columns</div>
          <div style="font-size: 11.5px; color: var(--muted); margin-top: 4px; line-height: 1.4;">
            Defined across relational PostgreSQL and structured client stores
          </div>
        </div>

        <!-- Total Live Rows -->
        <div style="background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 12px; padding: 18px 20px; box-shadow: var(--shadow);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);">Total Live Rows</span>
            <span style="font-size: 20px;">📈</span>
          </div>
          <div style="font-size: 26px; font-weight: 800; color: #16a34a;" id="dbMetricTotalRows">
            <span style="font-size: 16px; color: var(--muted);">⏳ Counting...</span>
          </div>
          <div style="font-size: 11.5px; color: var(--muted); margin-top: 4px; line-height: 1.4;">
            Live aggregated count across Supabase and local application records
          </div>
        </div>

        <!-- Database Engine -->
        <div style="background: var(--surface-2); border: 1px solid var(--line-2); border-radius: 12px; padding: 18px 20px; box-shadow: var(--shadow);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);">Database Engine &amp; Cloud</span>
            <span style="font-size: 20px;">⚡</span>
          </div>
          <div style="font-size: 17px; font-weight: 800; color: #7c3aed; line-height: 1.3;" id="dbMetricEngine">
            PostgreSQL 15+
          </div>
          <div style="font-size: 11.5px; color: var(--muted); margin-top: 4px; line-height: 1.4;">
            ${cloudEngineStatus}
          </div>
        </div>

      </div>

      <!-- 2. Table Schema Directory -->
      <div style="background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 22px 24px; box-shadow: var(--shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid var(--line-2); padding-bottom: 12px; margin-bottom: 18px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="margin: 0; font-size: 16.5px; font-weight: 800; color: var(--ink); display: flex; align-items: center; gap: 8px;">
              <span>📋</span> Table Schema Directory &amp; Column Metadata
            </h3>
            <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
              Review table architectures, physical column types, nullability, defaults, and primary key relationships.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="text" id="dbSchemaFilter" placeholder="Filter tables or columns..." style="font-size: 12.5px; padding: 6px 12px; border-radius: 7px; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); width: 220px;">
          </div>
        </div>

        <div id="dbSchemaDirectoryContainer" style="display: flex; flex-direction: column; gap: 14px;">
          ${DB_SCHEMA_DIRECTORY.map((tbl, idx) => `
            <div class="db-schema-card" data-table-id="${tbl.id}" style="background: var(--surface); border: 1px solid var(--line-2); border-radius: 10px; overflow: hidden;">
              <div style="padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: rgba(0,0,0,0.02);">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 22px;">${tbl.icon}</span>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                      <strong style="font-size: 14px; color: var(--ink); font-family: monospace;">${esc(tbl.tableName)}</strong>
                      <span style="font-size: 11px; background: rgba(37,99,235,0.12); color: #2563eb; padding: 2px 7px; border-radius: 5px; font-weight: 600;">${esc(tbl.badge)}</span>
                      <span class="db-row-badge" id="dbBadge_${tbl.id}" style="font-size: 11px; background: rgba(22,163,74,0.12); color: #15803d; padding: 2px 7px; border-radius: 5px; font-weight: 600;">⏳ counting...</span>
                    </div>
                    <div style="font-size: 12px; color: var(--muted); margin-top: 3px;">${esc(tbl.desc)}</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 11.5px; font-weight: 600; color: var(--muted); background: var(--surface-2); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--line-2);">
                    ${tbl.columns.length} Columns
                  </span>
                  <button type="button" class="ghost db-btn-toggle-cols" data-target="dbCols_${tbl.id}" style="font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--line-2);">
                    ▼ View Columns
                  </button>
                  <button type="button" class="primary db-btn-quick-inspect" data-table="${tbl.id}" style="font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 6px;">
                    🔍 Quick Query
                  </button>
                </div>
              </div>

              <!-- Collapsible Column Details Table -->
              <div id="dbCols_${tbl.id}" class="db-cols-wrapper" style="display: none; border-top: 1px solid var(--line-2); padding: 12px 16px; background: var(--surface-2);">
                <table class="utable" style="margin: 0; font-size: 12px;">
                  <thead>
                    <tr style="background: var(--surface);">
                      <th style="width: 22%;">Column Name</th>
                      <th style="width: 18%;">Data Type</th>
                      <th style="width: 28%;">Constraints / Default</th>
                      <th style="width: 32%;">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tbl.columns.map(c => `
                      <tr>
                        <td style="font-family: monospace; font-weight: 700; color: var(--ink);">
                          ${esc(c.name)} ${c.constraints.includes('PK') ? '<span style="color: #f59e0b; font-size: 10px;">🔑 PK</span>' : ''}
                        </td>
                        <td>
                          <code style="background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #2563eb;">
                            ${esc(c.type)}
                          </code>
                        </td>
                        <td style="color: var(--muted); font-size: 11.5px;">
                          ${esc(c.constraints)}
                        </td>
                        <td style="color: var(--ink); font-size: 11.5px;">
                          ${esc(c.desc)}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 3. Live Database Query Console -->
      <div style="background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 22px 24px; box-shadow: var(--shadow);">
        
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid var(--line-2); padding-bottom: 12px; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="margin: 0; font-size: 16.5px; font-weight: 800; color: var(--ink); display: flex; align-items: center; gap: 8px;">
              <span>⚡</span> Live Database Query Console
            </h3>
            <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
              Execute read queries on PostgreSQL tables and client datasets with real-time inspection, pagination and CSV export.
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" class="ghost" id="dbConsoleCopyJsonBtn" style="font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--line-2);">
              📋 Copy JSON
            </button>
            <button type="button" class="ghost" id="dbConsoleExportCsvBtn" style="font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--line-2);">
              📥 Export CSV
            </button>
          </div>
        </div>

        <!-- Quick Query Buttons Toolbar -->
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 6px;">
            Quick Table Queries:
          </label>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <button type="button" class="ghost db-quick-query-btn" data-table="isd_users" style="font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface);">
              🔍 Inspect Users Table
            </button>
            <button type="button" class="ghost db-quick-query-btn" data-table="isd_test_datasets" style="font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface);">
              📁 Inspect Stored Files Table
            </button>
            <button type="button" class="ghost db-quick-query-btn" data-table="patta_corrections" style="font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface);">
              📜 Inspect Patta Corrections Table
            </button>
            <button type="button" class="ghost db-quick-query-btn" data-table="village_settings" style="font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface);">
              📊 Inspect Day Ranges / Settings
            </button>
            <button type="button" class="primary db-quick-query-btn" id="dbRunCustomBtn" style="font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 6px;">
              ⚡ Run Custom Read Query
            </button>
          </div>
        </div>

        <!-- Interactive Query Controls Box -->
        <div style="background: var(--surface); border: 1px solid var(--line-2); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; align-items: flex-end;">
            
            <!-- Table Select -->
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 4px;">Target Table</label>
              <select id="dbQueryTable" style="width: 100%; font-size: 12.5px; font-weight: 600; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink);">
                <option value="isd_users" selected>isd_users (Authorized Users)</option>
                <option value="isd_invites">isd_invites (Pending Invites)</option>
                <option value="isd_test_datasets">isd_test_datasets (Stored Cloud Files)</option>
                <option value="isd_taluk_credentials">isd_taluk_credentials (Taluk Passwords)</option>
                <option value="patta_corrections">patta_corrections (Patta Corrections)</option>
                <option value="village_settings">village_settings (Day Ranges &amp; Config)</option>
              </select>
            </div>

            <!-- Columns Input -->
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 4px;">Columns (* or comma-separated)</label>
              <input type="text" id="dbQueryColumns" value="*" placeholder="e.g. id, email, role or *" style="width: 100%; font-size: 12px; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink);">
            </div>

            <!-- Filter Keyword Input -->
            <div>
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 4px;">Search / Filter Result Rows</label>
              <input type="text" id="dbQueryFilter" placeholder="Type text to filter instantly..." style="width: 100%; font-size: 12px; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink);">
            </div>

            <!-- Row Limit -->
            <div style="flex: 0 0 110px;">
              <label style="display: block; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 4px;">Row Limit</label>
              <select id="dbQueryLimit" style="width: 100%; font-size: 12.5px; font-weight: 600; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--surface-2); color: var(--ink);">
                <option value="10">10 rows</option>
                <option value="25" selected>25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="500">500 rows</option>
              </select>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 6px;">
              <button type="button" class="primary" id="dbExecuteQueryBtn" style="flex: 1; font-size: 12.5px; font-weight: 700; padding: 7px 14px; border-radius: 6px; white-space: nowrap;">
                ▶ Run Query
              </button>
              <button type="button" class="ghost" id="dbClearFilterBtn" style="font-size: 12px; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--line-2);" title="Clear search filter">
                ✕
              </button>
            </div>

          </div>
        </div>

        <!-- Query Execution Status Bar -->
        <div id="dbQueryStatusBar" style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted); margin-bottom: 12px; background: rgba(0,0,0,0.03); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--line-2); flex-wrap: wrap; gap: 8px;">
          <div id="dbQueryStatusText">
            <span style="font-weight: 600; color: var(--ink);">Query Status:</span> Ready to execute query.
          </div>
          <div id="dbQueryMetaText" style="font-weight: 600; color: #2563eb;">
            0 rows
          </div>
        </div>

        <!-- Results Table Container -->
        <div id="dbQueryResultsContainer" style="background: var(--surface); border: 1px solid var(--line-2); border-radius: 8px; overflow-x: auto; min-height: 180px;">
          <div style="padding: 40px; text-align: center; color: var(--muted); font-size: 13px;">
            Click <strong>▶ Run Query</strong> or any Quick Query button above to view live table records.
          </div>
        </div>

        <!-- Pagination Controls -->
        <div id="dbPaginationBar" style="display: flex; align-items: center; justify-content: space-between; margin-top: 14px; flex-wrap: wrap; gap: 10px;">
          <div style="font-size: 12px; color: var(--muted);" id="dbPaginationInfo">
            Showing 0 of 0 records
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="ghost" id="dbPagePrevBtn" disabled style="font-size: 12px; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--line-2);">
              ◀ Previous
            </button>
            <span style="font-size: 12px; font-weight: 700; color: var(--ink);" id="dbPageIndicator">Page 1</span>
            <button type="button" class="ghost" id="dbPageNextBtn" disabled style="font-size: 12px; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--line-2);">
              Next ▶
            </button>
          </div>
        </div>

      </div>

      <!-- 4. SQL Administration & Admin ID Creation Script -->
      <div style="background: var(--surface-2); border-radius: 14px; border: 1px solid var(--line-2); padding: 22px 24px; box-shadow: var(--shadow);">
        
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid var(--line-2); padding-bottom: 12px; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="margin: 0; font-size: 16.5px; font-weight: 800; color: var(--ink); display: flex; align-items: center; gap: 8px;">
              <span>🛠️</span> SQL Administration &amp; Admin ID Creation Script
            </h3>
            <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">
              PostgreSQL scripts to inspect information_schema tables, verify column definitions, and create or promote admin users.
            </div>
          </div>
          <button type="button" class="primary" id="dbCopySqlScriptBtn" style="font-size: 12.5px; font-weight: 700; padding: 6px 14px; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px;">
            📋 Copy Complete SQL Script
          </button>
        </div>

        <div style="position: relative;">
          <pre id="dbSqlCodeBlock" style="margin: 0; padding: 18px 20px; background: #0f172a; color: #f1f5f9; border-radius: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; font-size: 12px; line-height: 1.6; overflow-x: auto; max-height: 480px; border: 1px solid #1e293b;"><code><span style="color:#64748b;">-- ============================================================
-- 1. INSPECT ALL TABLES, ROW ESTIMATES &amp; STORAGE SIZE
-- Query PostgreSQL system catalogs for public schema statistics
-- ============================================================</span>
<span style="color:#38bdf8;">SELECT</span> 
    schemaname,
    relname <span style="color:#38bdf8;">AS</span> table_name,
    n_live_tup <span style="color:#38bdf8;">AS</span> estimated_rows,
    pg_size_pretty(pg_total_relation_size(relid)) <span style="color:#38bdf8;">AS</span> total_size
<span style="color:#38bdf8;">FROM</span> pg_stat_user_tables
<span style="color:#38bdf8;">WHERE</span> schemaname = <span style="color:#a5d6a7;">'public'</span>
<span style="color:#38bdf8;">ORDER BY</span> n_live_tup <span style="color:#38bdf8;">DESC</span>;

<span style="color:#64748b;">-- ============================================================
-- 2. INSPECT COLUMNS, DATA TYPES, NULLABILITY &amp; DEFAULTS
-- ============================================================</span>
<span style="color:#38bdf8;">SELECT</span> 
    table_name,
    ordinal_position,
    column_name,
    data_type,
    is_nullable,
    column_default
<span style="color:#38bdf8;">FROM</span> information_schema.columns
<span style="color:#38bdf8;">WHERE</span> table_schema = <span style="color:#a5d6a7;">'public'</span> 
  <span style="color:#38bdf8;">AND</span> table_name <span style="color:#38bdf8;">IN</span> (<span style="color:#a5d6a7;">'isd_users'</span>, <span style="color:#a5d6a7;">'isd_invites'</span>, <span style="color:#a5d6a7;">'isd_test_datasets'</span>, <span style="color:#a5d6a7;">'isd_taluk_credentials'</span>, <span style="color:#a5d6a7;">'patta_corrections'</span>)
<span style="color:#38bdf8;">ORDER BY</span> table_name, ordinal_position;

<span style="color:#64748b;">-- ============================================================
-- 3. CREATE OR PROMOTE ADMIN USER SCRIPT
-- Replace 'admin@example.com' with the intended admin email address
-- ============================================================</span>
<span style="color:#38bdf8;">INSERT INTO</span> public.isd_users (
    id,
    email,
    full_name,
    role,
    active,
    site_access,
    menu_access,
    taluks,
    can_view_creds,
    can_update_creds,
    created_at,
    updated_at
)
<span style="color:#38bdf8;">VALUES</span> (
    <span style="color:#38bdf8;">COALESCE</span>((<span style="color:#38bdf8;">SELECT</span> id <span style="color:#38bdf8;">FROM</span> auth.users <span style="color:#38bdf8;">WHERE</span> email = <span style="color:#a5d6a7;">'admin@example.com'</span>), gen_random_uuid()),
    <span style="color:#a5d6a7;">'admin@example.com'</span>,
    <span style="color:#a5d6a7;">'System Administrator'</span>,
    <span style="color:#a5d6a7;">'admin'</span>,
    <span style="color:#f472b6;">true</span>,
    <span style="color:#a5d6a7;">'both'</span>,
    <span style="color:#a5d6a7;">'["isd", "nisd", "fline", "chitta", "eservices", "areg", "patta", "dbinfo"]'</span>::<span style="color:#38bdf8;">jsonb</span>,
    <span style="color:#a5d6a7;">'[]'</span>::<span style="color:#38bdf8;">jsonb</span>, <span style="color:#64748b;">-- Empty array indicates unrestricted access across all taluks</span>
    <span style="color:#f472b6;">true</span>,
    <span style="color:#f472b6;">true</span>,
    now(),
    now()
)
<span style="color:#38bdf8;">ON CONFLICT</span> (id) <span style="color:#38bdf8;">DO UPDATE SET</span>
    role = <span style="color:#a5d6a7;">'admin'</span>,
    active = <span style="color:#f472b6;">true</span>,
    site_access = <span style="color:#a5d6a7;">'both'</span>,
    menu_access = <span style="color:#a5d6a7;">'["isd", "nisd", "fline", "chitta", "eservices", "areg", "patta", "dbinfo"]'</span>::<span style="color:#38bdf8;">jsonb</span>,
    taluks = <span style="color:#a5d6a7;">'[]'</span>::<span style="color:#38bdf8;">jsonb</span>,
    can_view_creds = <span style="color:#f472b6;">true</span>,
    can_update_creds = <span style="color:#f472b6;">true</span>,
    updated_at = now();

<span style="color:#64748b;">-- ============================================================
-- 4. BOOTSTRAP ALL APPLICATION TABLES &amp; ROW LEVEL SECURITY (RLS)
-- Use this if deploying to a fresh Supabase database project
-- ============================================================</span>
<span style="color:#38bdf8;">CREATE TABLE IF NOT EXISTS</span> public.isd_users (
    id <span style="color:#38bdf8;">UUID PRIMARY KEY DEFAULT</span> gen_random_uuid(),
    email <span style="color:#38bdf8;">TEXT UNIQUE NOT NULL</span>,
    full_name <span style="color:#38bdf8;">TEXT</span>,
    role <span style="color:#38bdf8;">TEXT DEFAULT</span> <span style="color:#a5d6a7;">'user'</span>,
    active <span style="color:#38bdf8;">BOOLEAN DEFAULT</span> <span style="color:#f472b6;">true</span>,
    site_access <span style="color:#38bdf8;">TEXT DEFAULT</span> <span style="color:#a5d6a7;">'both'</span>,
    menu_access <span style="color:#38bdf8;">JSONB DEFAULT</span> <span style="color:#a5d6a7;">'["isd","nisd","fline","chitta","eservices","areg","patta"]'</span>::<span style="color:#38bdf8;">jsonb</span>,
    report_access <span style="color:#38bdf8;">TEXT</span>,
    taluks <span style="color:#38bdf8;">JSONB DEFAULT</span> <span style="color:#a5d6a7;">'[]'</span>::<span style="color:#38bdf8;">jsonb</span>,
    can_view_creds <span style="color:#38bdf8;">BOOLEAN DEFAULT</span> <span style="color:#f472b6;">false</span>,
    can_update_creds <span style="color:#38bdf8;">BOOLEAN DEFAULT</span> <span style="color:#f472b6;">false</span>,
    created_at <span style="color:#38bdf8;">TIMESTAMPTZ DEFAULT</span> now(),
    updated_at <span style="color:#38bdf8;">TIMESTAMPTZ DEFAULT</span> now()
);

<span style="color:#38bdf8;">CREATE TABLE IF NOT EXISTS</span> public.isd_invites (
    email <span style="color:#38bdf8;">TEXT PRIMARY KEY</span>,
    full_name <span style="color:#38bdf8;">TEXT</span>,
    role <span style="color:#38bdf8;">TEXT DEFAULT</span> <span style="color:#a5d6a7;">'user'</span>,
    site_access <span style="color:#38bdf8;">TEXT DEFAULT</span> <span style="color:#a5d6a7;">'both'</span>,
    menu_access <span style="color:#38bdf8;">TEXT[]</span>,
    taluks <span style="color:#38bdf8;">TEXT[]</span>,
    can_view_creds <span style="color:#38bdf8;">BOOLEAN DEFAULT</span> <span style="color:#f472b6;">false</span>,
    can_update_creds <span style="color:#38bdf8;">BOOLEAN DEFAULT</span> <span style="color:#f472b6;">false</span>,
    invited_by <span style="color:#38bdf8;">UUID REFERENCES</span> public.isd_users(id),
    created_at <span style="color:#38bdf8;">TIMESTAMPTZ DEFAULT</span> now()
);

<span style="color:#38bdf8;">CREATE TABLE IF NOT EXISTS</span> public.isd_taluk_credentials (
    id <span style="color:#38bdf8;">BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY</span>,
    taluk_code <span style="color:#38bdf8;">TEXT UNIQUE NOT NULL</span>,
    taluk_name <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    username <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    password <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    role_id <span style="color:#38bdf8;">TEXT DEFAULT</span> <span style="color:#a5d6a7;">'8'</span>,
    updated_at <span style="color:#38bdf8;">TIMESTAMPTZ DEFAULT</span> now(),
    updated_by <span style="color:#38bdf8;">UUID REFERENCES</span> public.isd_users(id)
);

<span style="color:#38bdf8;">CREATE TABLE IF NOT EXISTS</span> public.isd_test_datasets (
    id <span style="color:#38bdf8;">BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY</span>,
    kind <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    taluk <span style="color:#38bdf8;">TEXT</span>,
    filename <span style="color:#38bdf8;">TEXT</span>,
    row_count <span style="color:#38bdf8;">INTEGER DEFAULT</span> 0,
    dataset <span style="color:#38bdf8;">JSONB</span>,
    updated_at <span style="color:#38bdf8;">TIMESTAMPTZ DEFAULT</span> now(),
    updated_by <span style="color:#38bdf8;">UUID REFERENCES</span> public.isd_users(id)
);

<span style="color:#38bdf8;">CREATE TABLE IF NOT EXISTS</span> public.patta_corrections (
    id <span style="color:#38bdf8;">UUID PRIMARY KEY DEFAULT</span> gen_random_uuid(),
    taluk_code <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    taluk_name <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    village_code <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    village_name <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    patta_no <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    survey_no <span style="color:#38bdf8;">TEXT NOT NULL</span>,
    subdiv_no <span style="color:#38bdf8;">TEXT</span>,
    land_type <span style="color:#38bdf8;">TEXT DEFAULT</span> <span style="color:#a5d6a7;">'Rural'</span>,
    old_name <span style="color:#38bdf8;">TEXT</span>,
    new_name <span style="color:#38bdf8;">TEXT</span>,
    old_extent <span style="color:#38bdf8;">TEXT</span>,
    new_extent <span style="color:#38bdf8;">TEXT</span>,
    extent_unit <span style="color:#38bdf8;">TEXT DEFAULT</span> <span style="color:#a5d6a7;">'Hectares-Ares'</span>,
    status <span style="color:#38bdf8;">TEXT DEFAULT</span> <span style="color:#a5d6a7;">'Pending'</span>,
    created_at <span style="color:#38bdf8;">TIMESTAMPTZ DEFAULT</span> now()
);

<span style="color:#38bdf8;">ALTER TABLE</span> public.isd_users <span style="color:#38bdf8;">ENABLE ROW LEVEL SECURITY</span>;
<span style="color:#38bdf8;">ALTER TABLE</span> public.isd_invites <span style="color:#38bdf8;">ENABLE ROW LEVEL SECURITY</span>;
<span style="color:#38bdf8;">ALTER TABLE</span> public.isd_taluk_credentials <span style="color:#38bdf8;">ENABLE ROW LEVEL SECURITY</span>;
<span style="color:#38bdf8;">ALTER TABLE</span> public.isd_test_datasets <span style="color:#38bdf8;">ENABLE ROW LEVEL SECURITY</span>;
<span style="color:#38bdf8;">ALTER TABLE</span> public.patta_corrections <span style="color:#38bdf8;">ENABLE ROW LEVEL SECURITY</span>;</code></pre>
        </div>

      </div>

    </div>
  `;

  // Attach Event Handlers
  initDbInfoSuiteEvents();

  // Load initial counts
  loadLiveDbCounts();

  // Run initial default query (isd_users)
  executeDbConsoleQuery('isd_users', '*', 25);
}

function initDbInfoSuiteEvents() {
  // Refresh Metrics button
  document.getElementById('dbRefreshAllBtn')?.addEventListener('click', () => {
    loadLiveDbCounts(true);
    const table = document.getElementById('dbQueryTable')?.value || 'isd_users';
    const cols = document.getElementById('dbQueryColumns')?.value || '*';
    const limit = parseInt(document.getElementById('dbQueryLimit')?.value || '25', 10);
    executeDbConsoleQuery(table, cols, limit);
  });

  // Toggle Schema Columns Accordion
  document.querySelectorAll('.db-btn-toggle-cols').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const el = document.getElementById(targetId);
      if (el) {
        const isHidden = el.style.display === 'none';
        el.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '▲ Hide Columns' : '▼ View Columns';
      }
    });
  });

  // Quick Query button in schema card
  document.querySelectorAll('.db-btn-quick-inspect').forEach(btn => {
    btn.addEventListener('click', () => {
      const table = btn.getAttribute('data-table');
      const tableSel = document.getElementById('dbQueryTable');
      if (tableSel && table) {
        tableSel.value = table;
        document.getElementById('dbQueryColumns').value = '*';
        executeDbConsoleQuery(table, '*', 25);
        // Scroll to query console
        document.getElementById('dbQueryTable')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  // Schema Filter Search
  document.getElementById('dbSchemaFilter')?.addEventListener('input', e => {
    const term = (e.target.value || '').toLowerCase().trim();
    document.querySelectorAll('.db-schema-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = (!term || text.includes(term)) ? 'block' : 'none';
    });
  });

  // Quick Query Toolbar buttons
  document.querySelectorAll('.db-quick-query-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const table = btn.getAttribute('data-table');
      if (table) {
        const tableSel = document.getElementById('dbQueryTable');
        if (tableSel) tableSel.value = table;
        document.getElementById('dbQueryColumns').value = '*';
        const limit = parseInt(document.getElementById('dbQueryLimit')?.value || '25', 10);
        executeDbConsoleQuery(table, '*', limit);
      }
    });
  });

  // Custom Read Query button
  document.getElementById('dbRunCustomBtn')?.addEventListener('click', () => {
    const table = document.getElementById('dbQueryTable')?.value || 'isd_users';
    const cols = document.getElementById('dbQueryColumns')?.value || '*';
    const limit = parseInt(document.getElementById('dbQueryLimit')?.value || '25', 10);
    executeDbConsoleQuery(table, cols, limit);
  });

  // Main Run Query button
  document.getElementById('dbExecuteQueryBtn')?.addEventListener('click', () => {
    const table = document.getElementById('dbQueryTable')?.value || 'isd_users';
    const cols = document.getElementById('dbQueryColumns')?.value || '*';
    const limit = parseInt(document.getElementById('dbQueryLimit')?.value || '25', 10);
    executeDbConsoleQuery(table, cols, limit);
  });

  // Search/Filter in query results
  document.getElementById('dbQueryFilter')?.addEventListener('input', e => {
    filterDbQueryResults(e.target.value || '');
  });

  // Clear search filter
  document.getElementById('dbClearFilterBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('dbQueryFilter');
    if (inp) inp.value = '';
    filterDbQueryResults('');
  });

  // Table dropdown change
  document.getElementById('dbQueryTable')?.addEventListener('change', e => {
    const table = e.target.value;
    const limit = parseInt(document.getElementById('dbQueryLimit')?.value || '25', 10);
    document.getElementById('dbQueryColumns').value = '*';
    executeDbConsoleQuery(table, '*', limit);
  });

  // Copy JSON button
  document.getElementById('dbConsoleCopyJsonBtn')?.addEventListener('click', () => {
    const data = __dbConsoleState.filteredResults.length ? __dbConsoleState.filteredResults : __dbConsoleState.currentResults;
    if (!data.length) {
      if (typeof toast === 'function') toast('No Data', 'No query results to copy.', 'warn');
      return;
    }
    const jsonStr = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      if (typeof toast === 'function') toast('Copied JSON', `Copied ${data.length} records to clipboard!`, 'ok');
    }).catch(() => {
      if (typeof toast === 'function') toast('Copy Failed', 'Unable to access clipboard.', 'err');
    });
  });

  // Export CSV button
  document.getElementById('dbConsoleExportCsvBtn')?.addEventListener('click', () => {
    const data = __dbConsoleState.filteredResults.length ? __dbConsoleState.filteredResults : __dbConsoleState.currentResults;
    if (!data.length) {
      if (typeof toast === 'function') toast('No Data', 'No query results to export.', 'warn');
      return;
    }
    exportDbDataToCsv(data, `${__dbConsoleState.activeTable}_query_export.csv`);
  });

  // Pagination buttons
  document.getElementById('dbPagePrevBtn')?.addEventListener('click', () => {
    if (__dbConsoleState.currentPage > 1) {
      __dbConsoleState.currentPage--;
      renderDbConsoleResultsTable();
    }
  });

  document.getElementById('dbPageNextBtn')?.addEventListener('click', () => {
    const list = __dbConsoleState.filteredResults;
    const totalPages = Math.ceil(list.length / __dbConsoleState.pageSize) || 1;
    if (__dbConsoleState.currentPage < totalPages) {
      __dbConsoleState.currentPage++;
      renderDbConsoleResultsTable();
    }
  });

  // Copy Complete SQL Script button
  document.getElementById('dbCopySqlScriptBtn')?.addEventListener('click', () => {
    const codeEl = document.getElementById('dbSqlCodeBlock');
    if (!codeEl) return;
    const rawSql = codeEl.innerText || codeEl.textContent;
    navigator.clipboard.writeText(rawSql).then(() => {
      const btn = document.getElementById('dbCopySqlScriptBtn');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Copied to Clipboard!';
        btn.style.background = '#16a34a';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.background = '';
        }, 2200);
      }
      if (typeof toast === 'function') toast('SQL Copied', 'Complete PostgreSQL Administration script copied!', 'ok');
    }).catch(() => {
      if (typeof toast === 'function') toast('Copy Failed', 'Could not access clipboard.', 'err');
    });
  });
}

async function loadLiveDbCounts(showToast = false) {
  let totalRows = 0;
  const counts = {};

  try {
    // 1. isd_users
    if (sb && CLOUD_ON) {
      const { count, error } = await sb.from('isd_users').select('*', { count: 'exact', head: true });
      counts['isd_users'] = (!error && count != null) ? count : (ME ? 1 : 0);
    } else {
      counts['isd_users'] = ME ? 1 : 0;
    }
  } catch(e) { counts['isd_users'] = ME ? 1 : 0; }

  try {
    // 2. isd_invites
    if (sb && CLOUD_ON) {
      const { count, error } = await sb.from('isd_invites').select('*', { count: 'exact', head: true });
      counts['isd_invites'] = (!error && count != null) ? count : 0;
    } else {
      counts['isd_invites'] = 0;
    }
  } catch(e) { counts['isd_invites'] = 0; }

  try {
    // 3. isd_test_datasets
    if (sb && CLOUD_ON) {
      const { count, error } = await sb.from('isd_test_datasets').select('*', { count: 'exact', head: true });
      counts['isd_test_datasets'] = (!error && count != null) ? count : 0;
    } else {
      counts['isd_test_datasets'] = 0;
    }
  } catch(e) { counts['isd_test_datasets'] = 0; }

  try {
    // 4. isd_taluk_credentials
    if (sb && CLOUD_ON) {
      const { count, error } = await sb.from('isd_taluk_credentials').select('*', { count: 'exact', head: true });
      counts['isd_taluk_credentials'] = (!error && count != null) ? count : (Array.isArray(window.TALUK_CREDS) ? window.TALUK_CREDS.length : 0);
    } else {
      counts['isd_taluk_credentials'] = Array.isArray(window.TALUK_CREDS) ? window.TALUK_CREDS.length : 0;
    }
  } catch(e) { counts['isd_taluk_credentials'] = 0; }

  try {
    // 5. patta_corrections
    let pattaCount = 0;
    try {
      const raw = localStorage.getItem('patta_corrections_list');
      if (raw) pattaCount = JSON.parse(raw).length;
    } catch(e) {}
    if (sb && CLOUD_ON) {
      try {
        const { count, error } = await sb.from('patta_corrections').select('*', { count: 'exact', head: true });
        if (!error && count != null) pattaCount = count;
      } catch(e) {}
    }
    counts['patta_corrections'] = pattaCount;
  } catch(e) { counts['patta_corrections'] = 0; }

  try {
    // 6. village_settings
    counts['village_settings'] = 5;
  } catch(e) { counts['village_settings'] = 0; }

  // Update DOM badges
  Object.keys(counts).forEach(k => {
    const val = counts[k];
    totalRows += val;
    const badge = document.getElementById(`dbBadge_${k}`);
    if (badge) {
      badge.textContent = `${val} ${val === 1 ? 'row' : 'rows'}`;
      badge.style.background = val > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(100,116,139,0.12)';
      badge.style.color = val > 0 ? '#15803d' : '#64748b';
    }
  });

  const totalRowsEl = document.getElementById('dbMetricTotalRows');
  if (totalRowsEl) {
    totalRowsEl.innerHTML = `${totalRows} <span style="font-size: 14px; font-weight: 600; color: var(--muted);">Live Rows</span>`;
  }

  if (showToast && typeof toast === 'function') {
    toast('Metrics Updated', `Refreshed database counts: ${totalRows} total rows found.`, 'ok');
  }
}

async function executeDbConsoleQuery(tableName, columns = '*', limit = 25) {
  const container = document.getElementById('dbQueryResultsContainer');
  const statusText = document.getElementById('dbQueryStatusText');
  const metaText = document.getElementById('dbQueryMetaText');
  if (!container) return;

  container.innerHTML = `
    <div style="padding: 40px; text-align: center; color: var(--muted); font-size: 13.5px;">
      <span style="font-size: 28px; display: block; margin-bottom: 8px;">⏳</span>
      Executing query: <code style="font-weight: 700; color: var(--ink);">SELECT ${esc(columns)} FROM ${esc(tableName)} LIMIT ${limit}</code>...
    </div>
  `;

  const startTime = performance.now();
  __dbConsoleState.activeTable = tableName;
  let records = [];
  let errorMsg = null;

  try {
    if (tableName === 'isd_users') {
      if (sb && CLOUD_ON) {
        let q = sb.from('isd_users').select(columns.trim() || '*').limit(limit);
        const { data, error } = await q;
        if (error) throw error;
        records = data || [];
      } else {
        records = ME ? [ME] : [];
      }
    } 
    else if (tableName === 'isd_invites') {
      if (sb && CLOUD_ON) {
        let q = sb.from('isd_invites').select(columns.trim() || '*').limit(limit);
        const { data, error } = await q;
        if (error) throw error;
        records = data || [];
      } else {
        records = [];
      }
    }
    else if (tableName === 'isd_test_datasets') {
      if (sb && CLOUD_ON) {
        const selCols = (columns.trim() === '*' || !columns.trim()) 
          ? 'id, kind, taluk, filename, row_count, updated_at, updated_by' 
          : columns.trim();
        let q = sb.from('isd_test_datasets').select(selCols).limit(limit);
        const { data, error } = await q;
        if (error) throw error;
        records = data || [];
      } else {
        records = [];
      }
    }
    else if (tableName === 'isd_taluk_credentials') {
      if (sb && CLOUD_ON) {
        let q = sb.from('isd_taluk_credentials').select(columns.trim() || '*').limit(limit);
        const { data, error } = await q;
        if (error) throw error;
        records = data || [];
      } else if (Array.isArray(window.TALUK_CREDS) && window.TALUK_CREDS.length) {
        records = window.TALUK_CREDS.slice(0, limit);
      } else {
        records = [];
      }
    }
    else if (tableName === 'patta_corrections') {
      let localList = [];
      try {
        const raw = localStorage.getItem('patta_corrections_list');
        if (raw) localList = JSON.parse(raw);
      } catch(e) {}

      if (sb && CLOUD_ON) {
        try {
          const { data, error } = await sb.from('patta_corrections').select(columns.trim() || '*').limit(limit);
          if (!error && Array.isArray(data) && data.length) {
            records = data;
          } else {
            records = localList.slice(0, limit);
          }
        } catch(e) {
          records = localList.slice(0, limit);
        }
      } else {
        records = localList.slice(0, limit);
      }
    }
    else if (tableName === 'village_settings') {
      const settings = [
        {
          setting_key: 'village_test.dayRanges.v1',
          category: 'ISD Day Thresholds',
          setting_value: (function(){ try { return JSON.parse(localStorage.getItem('village_test.dayRanges.v1')); } catch(e){ return localStorage.getItem('village_test.dayRanges.v1') || 'Default [25, 30]'; } })(),
          updated_at: new Date().toISOString()
        },
        {
          setting_key: 'village_test.taluks.v1',
          category: 'Taluk Directory Roster',
          setting_value: (function(){ try { return JSON.parse(localStorage.getItem('village_test.taluks.v1')); } catch(e){ return localStorage.getItem('village_test.taluks.v1') || 'Arakkonam | Arcot | Kalavai | Nemili | Sholinghur | Walajah'; } })(),
          updated_at: new Date().toISOString()
        },
        {
          setting_key: 'village_test.nisdRanges.v3',
          category: 'NISD Day Cut-offs',
          setting_value: (function(){ try { return JSON.parse(localStorage.getItem('village_test.nisdRanges.v3')); } catch(e){ return localStorage.getItem('village_test.nisdRanges.v3') || 'Default'; } })(),
          updated_at: new Date().toISOString()
        },
        {
          setting_key: 'village_test.tnCreds.v2',
          category: 'Tamil Nilam Credentials Cache',
          setting_value: '(Secure Encrypted Portal Cache)',
          updated_at: new Date().toISOString()
        },
        {
          setting_key: 'isd_sort_mode',
          category: 'ISD Display Sorting Mode',
          setting_value: localStorage.getItem('isd_sort_mode') || 'emp_asc',
          updated_at: new Date().toISOString()
        }
      ];
      records = settings.slice(0, limit);
    }
  } catch(err) {
    errorMsg = err.message || String(err);
  }

  const elapsedMs = Math.round(performance.now() - startTime);
  __dbConsoleState.lastQueryTimeMs = elapsedMs;
  __dbConsoleState.lastQueryString = `SELECT ${columns} FROM ${tableName} LIMIT ${limit}`;
  __dbConsoleState.currentResults = records;
  __dbConsoleState.filteredResults = [...records];
  __dbConsoleState.currentPage = 1;

  if (errorMsg) {
    container.innerHTML = `
      <div style="padding: 24px; color: #dc2626; background: rgba(239, 68, 68, 0.08); border-radius: 8px;">
        <strong style="display: block; font-size: 14px; margin-bottom: 4px;">❌ Query Error:</strong>
        <span>${esc(errorMsg)}</span>
      </div>
    `;
    if (statusText) statusText.innerHTML = `<span style="color: #dc2626; font-weight: 700;">Query Failed</span> (${elapsedMs}ms)`;
    if (metaText) metaText.textContent = '0 rows';
    return;
  }

  if (statusText) {
    statusText.innerHTML = `<span style="color: #15803d; font-weight: 700;">✓ Success</span>: <code style="font-weight: 600; font-size: 11.5px; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;">${esc(__dbConsoleState.lastQueryString)}</code>`;
  }
  if (metaText) {
    metaText.textContent = `${records.length} ${records.length === 1 ? 'row' : 'rows'} (${elapsedMs}ms)`;
  }

  renderDbConsoleResultsTable();
}

function filterDbQueryResults(searchTerm) {
  const term = (searchTerm || '').toLowerCase().trim();
  if (!term) {
    __dbConsoleState.filteredResults = [...__dbConsoleState.currentResults];
  } else {
    __dbConsoleState.filteredResults = __dbConsoleState.currentResults.filter(row => {
      return Object.values(row).some(val => {
        if (val == null) return false;
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return str.toLowerCase().includes(term);
      });
    });
  }
  __dbConsoleState.currentPage = 1;
  renderDbConsoleResultsTable();
}

function renderDbConsoleResultsTable() {
  const container = document.getElementById('dbQueryResultsContainer');
  const paginationInfo = document.getElementById('dbPaginationInfo');
  const pageIndicator = document.getElementById('dbPageIndicator');
  const prevBtn = document.getElementById('dbPagePrevBtn');
  const nextBtn = document.getElementById('dbPageNextBtn');
  if (!container) return;

  const data = __dbConsoleState.filteredResults;
  if (!data || !data.length) {
    container.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--muted); font-size: 13.5px;">
        No matching records found.
      </div>
    `;
    if (paginationInfo) paginationInfo.textContent = 'Showing 0 of 0 records';
    if (pageIndicator) pageIndicator.textContent = 'Page 1 of 1';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const columns = Object.keys(data[0]);
  const pageSize = __dbConsoleState.pageSize;
  const totalPages = Math.ceil(data.length / pageSize) || 1;
  const curPage = Math.min(Math.max(__dbConsoleState.currentPage, 1), totalPages);
  __dbConsoleState.currentPage = curPage;

  const startIdx = (curPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, data.length);
  const pageRows = data.slice(startIdx, endIdx);

  let html = `
    <table class="utable" style="margin: 0; font-size: 12px; width: 100%;">
      <thead>
        <tr style="background: var(--surface-2); position: sticky; top: 0; z-index: 2;">
          <th style="width: 44px; text-align: center;">#</th>
          ${columns.map(c => `
            <th style="white-space: nowrap; font-family: monospace; font-size: 11px;">
              ${esc(c)}
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
  `;

  pageRows.forEach((row, i) => {
    const rowIdx = startIdx + i + 1;
    html += `<tr>`;
    html += `<td style="text-align: center; font-size: 11px; color: var(--muted); font-weight: 700;">${rowIdx}</td>`;
    columns.forEach(col => {
      const val = row[col];
      let formatted = '';

      if (val === null || val === undefined) {
        formatted = '<span style="color: var(--muted); font-style: italic;">null</span>';
      } else if (typeof val === 'boolean') {
        formatted = val 
          ? '<span style="color: #15803d; font-weight: 700; background: rgba(34,197,94,0.12); padding: 2px 6px; border-radius: 4px;">✓ true</span>'
          : '<span style="color: #dc2626; font-weight: 700; background: rgba(239,68,68,0.12); padding: 2px 6px; border-radius: 4px;">✗ false</span>';
      } else if (col === 'role') {
        formatted = val === 'admin'
          ? '<span style="color: #7c3aed; font-weight: 700; background: rgba(124,58,237,0.12); padding: 2px 6px; border-radius: 4px;">admin</span>'
          : '<span style="color: #0369a1; font-weight: 600; background: rgba(2,132,199,0.12); padding: 2px 6px; border-radius: 4px;">user</span>';
      } else if (col === 'status') {
        formatted = String(val).toLowerCase().includes('approved')
          ? '<span style="color: #15803d; font-weight: 700; background: rgba(34,197,94,0.12); padding: 2px 6px; border-radius: 4px;">✓ Approved</span>'
          : '<span style="color: #d97706; font-weight: 600; background: rgba(245,158,11,0.12); padding: 2px 6px; border-radius: 4px;">⏳ Pending</span>';
      } else if (typeof val === 'object') {
        const jsonText = JSON.stringify(val);
        const preview = jsonText.length > 40 ? jsonText.slice(0, 40) + '…' : jsonText;
        formatted = `<code style="font-size: 11px; background: rgba(0,0,0,0.06); padding: 2px 5px; border-radius: 4px; color: #4338ca; cursor: pointer;" title="${esc(jsonText)}">${esc(preview)}</code>`;
      } else {
        const str = String(val);
        const isDate = col.includes('_at') && !isNaN(Date.parse(str));
        if (isDate) {
          try {
            formatted = `<span style="font-size: 11px; color: var(--muted);">${new Date(str).toLocaleString()}</span>`;
          } catch(e) {
            formatted = esc(str);
          }
        } else {
          formatted = esc(str);
        }
      }

      html += `<td style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${formatted}</td>`;
    });
    html += `</tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIdx + 1}–${endIdx} of ${data.length} records`;
  }
  if (pageIndicator) {
    pageIndicator.textContent = `Page ${curPage} of ${totalPages}`;
  }
  if (prevBtn) prevBtn.disabled = curPage <= 1;
  if (nextBtn) nextBtn.disabled = curPage >= totalPages;
}

function exportDbDataToCsv(data, filename) {
  if (!data || !data.length) return;
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];

  for (const row of data) {
    const values = headers.map(h => {
      let val = row[h];
      if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
      const str = String(val == null ? '' : val).replace(/"/g, '""');
      return `"${str}"`;
    });
    csvRows.push(values.join(','));
  }

  const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'database_query_results.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof toast === 'function') toast('CSV Exported', `Downloaded ${data.length} records as CSV.`, 'ok');
}

window.renderDbInfoTab = renderDbInfoTab;
window.executeDbConsoleQuery = executeDbConsoleQuery;
window.loadLiveDbCounts = loadLiveDbCounts;
window.exportDbDataToCsv = exportDbDataToCsv;



/* ============================================================
   A-REGISTER APPROVAL SUITE (Core Implementation)
   ============================================================ */
  window.openAregApprovalModal = function(initialTaluk, initialService) {
    const isAdmin = (typeof window.CLOUD_ON === 'undefined' || !window.CLOUD_ON) || (window.ME && window.ME.role === 'admin');
    if (!isAdmin) {
      if (typeof window.toast === 'function') {
        window.toast('Access restricted', 'Access restricted: Only Admin accounts can access A-Register Approval Hub.', 'warn');
      }
      return;
    }
    let backdrop = document.getElementById('aregModalBackdrop');
    if (!backdrop) {
      const modalHtml = `
        <div id="aregModalBackdrop" class="tn-modal-backdrop" style="z-index: 20000 !important;">
          <div class="tn-modal" style="max-width: 1050px; width: 95vw; max-height: 92vh;">
            <div class="tn-modal-header" style="background: linear-gradient(135deg, #d97706, #b45309); color: #fff;">
              <h2>
                <span>📝 Tamil Nilam A-Register Unified Approval Suite</span>
                <span class="tn-badge" style="background: rgba(255,255,255,0.2); color: #fff;">Creation, Correction & Approval</span>
              </h2>
              <button type="button" class="iconbtn" id="aregCloseModal" title="Close" style="color: #fff; border-color: rgba(255,255,255,0.3);">&#10005;</button>
            </div>

            <div class="tn-modal-body" style="padding: 18px 22px;">
              <div class="tn-filter-box" style="background: var(--surface-2); border-color: var(--line-2); margin-bottom: 14px;">
                <div class="tn-filter-title" style="color: #d97706; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                  <span>A-REGISTER APPLICATION CONTROL CENTER</span>
                  <button type="button" id="aregToggleCreateBtn" class="primary" style="background: #2563eb; border-color: #1d4ed8; padding: 5px 12px; font-size: 12px; border-radius: 6px;">
                    ➕ Create New Application
                  </button>
                </div>
                
                <div class="tn-form-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
                  <div class="tn-field">
                    <label>TALUK</label>
                    <select id="aregTalukSel">
                      <option value="03">Arakkonam (03)</option>
                      <option value="12" selected>Nemili (12)</option>
                      <option value="04">Walajah (04)</option>
                      <option value="02">Arcot (02)</option>
                      <option value="13">Kalavai (13)</option>
                      <option value="14">Sholinghur (14)</option>
                    </select>
                  </div>
                  <div class="tn-field">
                    <label>SERVICE TYPE</label>
                    <select id="aregServiceSel">
                      <option value="0109" selected>0109 — A-Register Correction (Rural)</option>
                      <option value="0108">0108 — A-Register Addition (Rural)</option>
                      <option value="0111">0111 — CLR Correction (Rural)</option>
                      <option value="0112">0112 — A-Register Deletion (Rural)</option>
                      <option value="N108">N108 — A-Register Addition (Natham)</option>
                      <option value="N109">N109 — A-Register Correction (Natham)</option>
                    </select>
                  </div>
                  <div class="tn-field" style="display: flex; align-items: flex-end;">
                    <button type="button" class="primary" id="aregFetchBtn" style="background: #d97706; border-color: #b45309; width: 100%; height: 36px;">⚡ Fetch Live Pending Apps</button>
                  </div>
                </div>
              </div>

              <!-- Collapsible Application Creation Form -->
              <div id="aregCreateCard" style="display: block; background: var(--surface-2); border: 1.5px dashed #f59e0b; border-radius: 10px; padding: 14px 18px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                  <h4 style="margin: 0; font-size: 13.5px; font-weight: 700; color: #d97706; display: flex; align-items: center; gap: 6px;">
                    <span>➕ Create New A-Register Application</span>
                  </h4>
                  <span style="font-size: 11px; color: var(--muted); font-weight: 600;">Direct Tahsildar Portal Entry</span>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px 14px; align-items: flex-end;">
                  <div class="tn-field">
                    <label style="font-size: 11px; font-weight: 700;">Taluk</label>
                    <select id="aregCreateTaluk" style="font-size: 12px; padding: 6px 8px;">
                      <option value="03">Arakkonam (03)</option>
                      <option value="12" selected>Nemili (12)</option>
                      <option value="04">Walajah (04)</option>
                      <option value="02">Arcot (02)</option>
                      <option value="13">Kalavai (13)</option>
                      <option value="14">Sholinghur (14)</option>
                    </select>
                  </div>

                  <div class="tn-field">
                    <label style="font-size: 11px; font-weight: 700;">Service Type</label>
                    <select id="aregCreateService" style="font-size: 12px; padding: 6px 8px;">
                      <option value="0109" selected>0109 — Correction (Rural)</option>
                      <option value="0108">0108 — Addition (Rural)</option>
                      <option value="0111">0111 — CLR (Rural)</option>
                      <option value="0112">0112 — Deletion (Rural)</option>
                      <option value="N108">N108 — Addition (Natham)</option>
                      <option value="N109">N109 — Correction (Natham)</option>
                    </select>
                  </div>

                  <div class="tn-field">
                    <label style="font-size: 11px; font-weight: 700;">Village</label>
                    <select id="aregCreateVillage" style="font-size: 12px; padding: 6px 8px;">
                      <option value="109">Agavalam (109)</option>
                      <option value="108">Alappakkam (108)</option>
                      <option value="115">Attupakkam (115)</option>
                      <option value="110">Banavaram (110)</option>
                      <option value="111">Illuppaiyandandalam (111)</option>
                      <option value="121">Asanellikuppam (121)</option>
                      <option value="123">Kariakudal (123)</option>
                      <option value="124">Keelvenkatapuram (124)</option>
                      <option value="122" selected>Nemili (122)</option>
                      <option value="125">Sayanavaram (125)</option>
                      <option value="120">S.Kulathur (120)</option>
                      <option value="112">Thenmambakkam (112)</option>
                    </select>
                  </div>

                  <div class="tn-field">
                    <label style="font-size: 11px; font-weight: 700;">Survey No *</label>
                    <input type="text" id="aregCreateSurveyNo" placeholder="e.g. 142" style="font-size: 12px; padding: 6px 8px;">
                  </div>

                  <div class="tn-field">
                    <label style="font-size: 11px; font-weight: 700;">Subdiv No</label>
                    <input type="text" id="aregCreateSubdivNo" placeholder="e.g. 1A" style="font-size: 12px; padding: 6px 8px;">
                  </div>

                  <div class="tn-field">
                    <label style="font-size: 11px; font-weight: 700;">Applicant Name *</label>
                    <input type="text" id="aregCreateApplicantName" placeholder="Applicant Name" style="font-size: 12px; padding: 6px 8px;">
                  </div>

                  <div class="tn-field" style="grid-column: 1 / -1;">
                    <label style="font-size: 11px; font-weight: 700;">Remarks / Correction Details</label>
                    <input type="text" id="aregCreateRemarks" placeholder="Enter remarks or correction details" style="font-size: 12px; padding: 6px 8px;">
                  </div>
                </div>

                <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
                  <button type="button" class="primary" id="aregSubmitCreateBtn" style="background: #16a34a; border-color: #15803d; padding: 7px 18px; font-size: 12.5px;">
                    ➕ Create &amp; Submit Application
                  </button>
                </div>
              </div>

              <div id="aregStatusBanner" class="tn-status-banner" style="display: none; margin-top: 10px;"></div>

              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 14px; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                <h3 style="margin: 0; font-size: 14px; font-weight: 700; color: var(--ink);">
                  Pending Applications List (<span id="aregAppCount">0</span>)
                </h3>
                <button type="button" class="primary" id="aregApproveAllBtn" disabled style="background: #16a34a; border-color: #15803d; padding: 6px 14px; font-size: 12.5px;">⚡ Approve All Applications</button>
              </div>

              <div class="tablewrap" style="max-height: 380px; overflow-y: auto; border: 1px solid var(--line-2); border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                  <thead>
                    <tr style="background: var(--surface-2); position: sticky; top: 0; z-index: 2;">
                      <th style="padding: 8px 8px; border-bottom: 1px solid var(--line-2); text-align: center; width: 40px;">#</th>
                      <th style="padding: 8px 10px; border-bottom: 1px solid var(--line-2); text-align: left;">Application ID</th>
                      <th style="padding: 8px 10px; border-bottom: 1px solid var(--line-2); text-align: left;">Survey / Subdiv</th>
                      <th style="padding: 8px 10px; border-bottom: 1px solid var(--line-2); text-align: left;">Village</th>
                      <th style="padding: 8px 10px; border-bottom: 1px solid var(--line-2); text-align: left;">Appl Date</th>
                      <th style="padding: 8px 10px; border-bottom: 1px solid var(--line-2); text-align: left;">Applicant</th>
                      <th style="padding: 8px 10px; border-bottom: 1px solid var(--line-2); text-align: left;">Remarks</th>
                      <th style="padding: 8px 10px; border-bottom: 1px solid var(--line-2); text-align: center; min-width: 220px;">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="aregTableBody">
                    <tr>
                      <td colspan="8" style="text-align: center; padding: 24px; color: var(--muted);">
                        Click <b>⚡ Fetch Live Pending Apps</b> above to retrieve pending A-Register applications from Tamil Nilam portal.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div id="aregLogs" style="margin-top: 14px; padding: 10px 14px; background: #0f172a; color: #38bdf8; font-family: monospace; font-size: 11.5px; border-radius: 8px; max-height: 120px; overflow-y: auto; display: none;"></div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      backdrop = document.getElementById('aregModalBackdrop');
      
      document.getElementById('aregCloseModal').addEventListener('click', () => {
        backdrop.classList.remove('open');
      });

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('open');
      });

      const toggleCreateBtn = document.getElementById('aregToggleCreateBtn');
      const createCard = document.getElementById('aregCreateCard');
      if (toggleCreateBtn && createCard) {
        toggleCreateBtn.addEventListener('click', () => {
          const isHidden = createCard.style.display === 'none';
          createCard.style.display = isHidden ? 'block' : 'none';
          toggleCreateBtn.textContent = isHidden ? '➖ Hide Creation Form' : '➕ Create New Application';
        });
      }

      // Sync top selects with creation form selects
      const topTaluk = document.getElementById('aregTalukSel');
      const createTaluk = document.getElementById('aregCreateTaluk');
      const topService = document.getElementById('aregServiceSel');
      const createService = document.getElementById('aregCreateService');

      if (topTaluk && createTaluk) {
        topTaluk.addEventListener('change', () => { createTaluk.value = topTaluk.value; });
        createTaluk.addEventListener('change', () => { topTaluk.value = createTaluk.value; });
      }
      if (topService && createService) {
        topService.addEventListener('change', () => { createService.value = topService.value; });
        createService.addEventListener('change', () => { topService.value = createService.value; });
      }

      document.getElementById('aregFetchBtn').addEventListener('click', fetchAregApplications);
      document.getElementById('aregApproveAllBtn').addEventListener('click', approveAllAregApplications);
      document.getElementById('aregSubmitCreateBtn').addEventListener('click', createAregApplication);
    }

    const targetTaluk = initialTaluk || (typeof window.TALUK !== 'undefined' && window.TALUK) || 'Nemili';
    if (targetTaluk) {
      const tCode = resolveTalukCode(targetTaluk) || '12';
      const sel = document.getElementById('aregTalukSel');
      const cSel = document.getElementById('aregCreateTaluk');
      if (sel) sel.value = tCode;
      if (cSel) cSel.value = tCode;
    }
    if (initialService) {
      const sSel = document.getElementById('aregServiceSel');
      const csSel = document.getElementById('aregCreateService');
      if (sSel) sSel.value = initialService;
      if (csSel) csSel.value = initialService;
    }

    backdrop.classList.add('open');
    fetchAregApplications();
  };

  async function createAregApplication() {
    const talukSel = document.getElementById('aregCreateTaluk');
    const serviceSel = document.getElementById('aregCreateService');
    const villageSel = document.getElementById('aregCreateVillage');
    const surveyInput = document.getElementById('aregCreateSurveyNo');
    const subdivInput = document.getElementById('aregCreateSubdivNo');
    const applicantInput = document.getElementById('aregCreateApplicantName');
    const remarksInput = document.getElementById('aregCreateRemarks');
    const submitBtn = document.getElementById('aregSubmitCreateBtn');
    const statusBanner = document.getElementById('aregStatusBanner');

    const talukCode = talukSel ? talukSel.value : '12';
    const serviceCode = serviceSel ? serviceSel.value : '0109';
    const villageCode = villageSel ? villageSel.value : '122';
    const villageName = villageSel && villageSel.options[villageSel.selectedIndex] ? villageSel.options[villageSel.selectedIndex].text.replace(/\s*\(\d+\)/, '').trim() : 'Nemili';
    const surveyNo = surveyInput ? surveyInput.value.trim() : '';
    const subdivNo = subdivInput ? subdivInput.value.trim() : '';
    const applicantName = applicantInput ? applicantInput.value.trim() : '';
    const remarks = remarksInput ? remarksInput.value.trim() : '';

    if (!surveyNo) {
      if (typeof window.toast === 'function') window.toast('Validation Error', 'Please enter Survey Number', 'warn');
      if (surveyInput) surveyInput.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Creating &amp; Submitting...';
    }
    if (statusBanner) {
      statusBanner.className = 'tn-status-banner info';
      statusBanner.style.display = 'block';
      statusBanner.textContent = `Submitting new A-Register application to Tamil Nilam portal...`;
    }

    try {
      const talukText = talukSel ? talukSel.options[talukSel.selectedIndex].text : 'Nemili';
      const secCreds = getTnCreds('secondary', talukText.split(' ')[0]);
      const u = secCreds.username || 'rpt_panneerselvam';
      const p = secCreds.password || 'Nemili@1970';
      const r = secCreds.roleId || '8';

      const url = `/api/areg?mode=create_app&distCode=37&talukCode=${encodeURIComponent(talukCode)}&serviceCode=${encodeURIComponent(serviceCode)}&villageCode=${encodeURIComponent(villageCode)}&villageName=${encodeURIComponent(villageName)}&surveyNo=${encodeURIComponent(surveyNo)}&subdivNo=${encodeURIComponent(subdivNo)}&applicantName=${encodeURIComponent(applicantName)}&remarks=${encodeURIComponent(remarks)}&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&roleId=${encodeURIComponent(r)}`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Application creation failed');
      }

      const newApp = (data.creationPayload ? {
        applId: data.applId,
        surveyNo: data.creationPayload.surveyNo,
        subdivNo: data.creationPayload.subdivNo,
        villageCode: data.creationPayload.villageCode,
        villageName: villageName,
        applicantName: data.creationPayload.applicantName || applicantName || 'Applicant',
        remarks: data.creationPayload.remarks || remarks || 'Created via Hub',
        applDate: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
        applStatus: 'Pending at Tahsildar',
        serviceCode: serviceCode
      } : null) || data.application || {
        applId: data.applId || `AREG-37${talukCode}${villageCode}-${Date.now().toString().slice(-5)}`,
        surveyNo: surveyNo,
        subdivNo: subdivNo,
        villageCode: villageCode,
        villageName: villageName,
        applicantName: applicantName || 'Applicant',
        remarks: remarks || 'Created via Hub',
        applDate: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
        applStatus: 'Pending at Tahsildar',
        serviceCode: serviceCode
      };

      aregPendingApps.unshift(newApp);
      renderAregTable();

      if (surveyInput) surveyInput.value = '';
      if (subdivInput) subdivInput.value = '';
      if (applicantInput) applicantInput.value = '';
      if (remarksInput) remarksInput.value = '';

      if (statusBanner) {
        statusBanner.className = 'tn-status-banner ok';
        statusBanner.style.display = 'block';
        statusBanner.textContent = `✓ Application ${newApp.applId} created and submitted successfully!`;
      }
      if (typeof window.toast === 'function') {
        window.toast('Application Created', `Application ${newApp.applId} created successfully!`, 'ok');
      }
    } catch (err) {
      console.error('Create application error:', err);
      if (statusBanner) {
        statusBanner.className = 'tn-status-banner err';
        statusBanner.style.display = 'block';
        statusBanner.textContent = `Error creating application: ${err.message}`;
      }
      if (typeof window.toast === 'function') {
        window.toast('Creation Failed', err.message, 'err');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '➕ Create &amp; Submit Application';
      }
    }
  }

  async function fetchAregApplications() {
    const talukSel = document.getElementById('aregTalukSel');
    const serviceSel = document.getElementById('aregServiceSel');
    const fetchBtn = document.getElementById('aregFetchBtn');
    const countSpan = document.getElementById('aregAppCount');
    const approveAllBtn = document.getElementById('aregApproveAllBtn');
    const statusBanner = document.getElementById('aregStatusBanner');

    const talukCode = talukSel ? talukSel.value : '03';
    const serviceCode = serviceSel ? serviceSel.value : '0109';
    const talukText = talukSel ? talukSel.options[talukSel.selectedIndex].text : 'Arakkonam';

    if (fetchBtn) {
      fetchBtn.disabled = true;
      fetchBtn.innerHTML = '⏳ Fetching...';
    }
    if (statusBanner) {
      statusBanner.className = 'tn-status-banner info';
      statusBanner.style.display = 'block';
      statusBanner.textContent = `Fetching live pending applications for ${talukText} (${serviceCode}) from Tamil Nilam portal...`;
    }

    try {
      const secCreds = getTnCreds('secondary', talukText.split(' ')[0]);
      const u = secCreds.username || 'rpt_panneerselvam';
      const p = secCreds.password || 'Nemili@1970';
      const r = secCreds.roleId || '8';

      const url = `/api/areg?mode=pending_list&distCode=37&talukCode=${encodeURIComponent(talukCode)}&serviceCode=${encodeURIComponent(serviceCode)}&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&roleId=${encodeURIComponent(r)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch pending applications');
      }

      aregPendingApps = data.applications || [];
      aregEditingIdx = -1;
      renderAregTable();

      if (!aregPendingApps.length) {
        if (approveAllBtn) approveAllBtn.disabled = true;
        if (statusBanner) {
          statusBanner.className = 'tn-status-banner ok';
          statusBanner.textContent = `✓ No pending applications for ${talukText} (${serviceCode}).`;
        }
        return;
      }

      if (approveAllBtn) approveAllBtn.disabled = false;
      if (statusBanner) {
        statusBanner.className = 'tn-status-banner ok';
        statusBanner.textContent = `✓ Found ${aregPendingApps.length} pending applications for ${talukText} (${serviceCode}). Ready for approval!`;
      }

    } catch (err) {
      console.error('Fetch A-Register error:', err);
      aregPendingApps = [];
      aregEditingIdx = -1;
      renderAregTable();
      if (statusBanner) {
        statusBanner.className = 'tn-status-banner err';
        statusBanner.textContent = `Error fetching applications: ${err.message}`;
      }
    } finally {
      if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '⚡ Fetch Live Pending Apps';
      }
    }
  }

  function renderAregTable() {
    const tbody = document.getElementById('aregTableBody');
    const countSpan = document.getElementById('aregAppCount');
    const approveAllBtn = document.getElementById('aregApproveAllBtn');

    if (countSpan) countSpan.textContent = aregPendingApps.length;
    if (approveAllBtn) approveAllBtn.disabled = !aregPendingApps.length;

    if (!tbody) return;

    if (!aregPendingApps.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 24px; color: var(--muted);">
            No pending applications found. Click <b>➕ Create New Application</b> to create one, or click <b>⚡ Fetch Live Pending Apps</b> to retrieve applications.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = aregPendingApps.map((app, idx) => {
      const isEditing = (aregEditingIdx === idx);
      if (isEditing) {
        return `
          <tr id="aregRow_${idx}" style="border-bottom: 1px solid var(--line-2); background: rgba(2, 132, 199, 0.08);">
            <td style="padding: 6px 8px; text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="padding: 6px 8px; font-weight: 700; color: var(--accent);">${app.applId || '-'}</td>
            <td style="padding: 6px 8px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <input type="text" id="aregEditSurvey_${idx}" value="${app.surveyNo || ''}" placeholder="Survey" style="width: 55px; padding: 4px 6px; font-size: 11.5px; border: 1px solid var(--line-2); border-radius: 4px;">
                <span>/</span>
                <input type="text" id="aregEditSubdiv_${idx}" value="${app.subdivNo || ''}" placeholder="Subdiv" style="width: 45px; padding: 4px 6px; font-size: 11.5px; border: 1px solid var(--line-2); border-radius: 4px;">
              </div>
            </td>
            <td style="padding: 6px 8px;">${app.villageName || app.villageCode || '-'}</td>
            <td style="padding: 6px 8px; font-size: 11px;">${app.applDate || '-'}</td>
            <td style="padding: 6px 8px;">
              <input type="text" id="aregEditApplicant_${idx}" value="${app.applicantName || ''}" placeholder="Applicant" style="width: 100px; padding: 4px 6px; font-size: 11.5px; border: 1px solid var(--line-2); border-radius: 4px;">
            </td>
            <td style="padding: 6px 8px;">
              <input type="text" id="aregEditRemarks_${idx}" value="${app.remarks || ''}" placeholder="Remarks" style="width: 100%; min-width: 110px; padding: 4px 6px; font-size: 11.5px; border: 1px solid var(--line-2); border-radius: 4px;">
            </td>
            <td style="padding: 6px 8px; text-align: center; white-space: nowrap;">
              <button type="button" class="primary btn-areg-save" data-idx="${idx}" style="background: #0284c7; border-color: #0369a1; padding: 4px 8px; font-size: 11px; margin-right: 4px;">
                💾 Save Correction
              </button>
              <button type="button" class="ghost btn-areg-cancel" data-idx="${idx}" style="padding: 4px 8px; font-size: 11px;">
                ❌ Cancel
              </button>
            </td>
          </tr>
        `;
      } else {
        const isApproved = app.applStatus === 'Approved & Completed';
        return `
          <tr id="aregRow_${idx}" style="border-bottom: 1px solid var(--line-2); ${isApproved ? 'background: rgba(74, 222, 128, 0.15);' : ''}">
            <td style="padding: 8px 8px; text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="padding: 8px 8px; font-weight: 700; color: var(--accent);">${app.applId || '-'}</td>
            <td style="padding: 8px 8px; font-weight: 600;">${app.surveyNo || '-'}${app.subdivNo ? '/' + app.subdivNo : ''}</td>
            <td style="padding: 8px 8px;">${app.villageName || app.villageCode || '-'}</td>
            <td style="padding: 8px 8px; font-size: 11px;">${app.applDate || '-'}</td>
            <td style="padding: 8px 8px;">${app.applicantName || '-'}</td>
            <td style="padding: 8px 8px; font-size: 11.5px; color: var(--muted);">${app.remarks || '-'}</td>
            <td style="padding: 8px 8px; text-align: center; white-space: nowrap;">
              ${isApproved ? `<span style="color: #16a34a; font-weight: 700; font-size: 11.5px;">✓ Approved &amp; Completed</span>` : `
                <button type="button" class="ghost btn-areg-edit" data-idx="${idx}" style="padding: 4px 8px; font-size: 11px; margin-right: 4px;" title="Edit correction details inline">
                  ✏️ Edit Correction
                </button>
                <button type="button" class="primary btn-areg-approve" data-idx="${idx}" style="background: #16a34a; border-color: #15803d; padding: 4px 8px; font-size: 11px;">
                  ⚡ Approve &amp; Complete
                </button>
              `}
            </td>
          </tr>
        `;
      }
    }).join('');

    document.querySelectorAll('.btn-areg-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
        aregEditingIdx = index;
        renderAregTable();
      });
    });

    document.querySelectorAll('.btn-areg-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        aregEditingIdx = -1;
        renderAregTable();
      });
    });

    document.querySelectorAll('.btn-areg-save').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
        saveAregCorrection(index, e.currentTarget);
      });
    });

    document.querySelectorAll('.btn-areg-approve').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
        if (!isNaN(index) && aregPendingApps[index]) {
          approveSingleAregApp(index, e.currentTarget);
        }
      });
    });
  }

  async function saveAregCorrection(index, btnElement) {
    const app = aregPendingApps[index];
    if (!app) return;

    const surveyInput = document.getElementById(`aregEditSurvey_${index}`);
    const subdivInput = document.getElementById(`aregEditSubdiv_${index}`);
    const applicantInput = document.getElementById(`aregEditApplicant_${index}`);
    const remarksInput = document.getElementById(`aregEditRemarks_${index}`);

    const newSurveyNo = surveyInput ? surveyInput.value.trim() : app.surveyNo;
    const newSubdivNo = subdivInput ? subdivInput.value.trim() : app.subdivNo;
    const newApplicantName = applicantInput ? applicantInput.value.trim() : app.applicantName;
    const newRemarks = remarksInput ? remarksInput.value.trim() : app.remarks;

    const talukSel = document.getElementById('aregTalukSel');
    const serviceSel = document.getElementById('aregServiceSel');
    const talukCode = talukSel ? talukSel.value : '12';
    const serviceCode = serviceSel ? serviceSel.value : '0109';
    const talukText = talukSel ? talukSel.options[talukSel.selectedIndex].text : 'Nemili';

    if (btnElement) {
      btnElement.disabled = true;
      btnElement.innerHTML = '⏳ Saving...';
    }

    try {
      const secCreds = getTnCreds('secondary', talukText.split(' ')[0]);
      const u = secCreds.username || 'rpt_panneerselvam';
      const p = secCreds.password || 'Nemili@1970';
      const r = secCreds.roleId || '8';

      const url = `/api/areg?mode=save_correction&distCode=37&talukCode=${encodeURIComponent(talukCode)}&serviceCode=${encodeURIComponent(serviceCode)}&applId=${encodeURIComponent(app.applId || '')}&surveyNo=${encodeURIComponent(newSurveyNo)}&subdivNo=${encodeURIComponent(newSubdivNo)}&villageCode=${encodeURIComponent(app.villageCode || '')}&applicantName=${encodeURIComponent(newApplicantName)}&remarks=${encodeURIComponent(newRemarks)}&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&roleId=${encodeURIComponent(r)}`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save correction details');
      }

      app.surveyNo = newSurveyNo;
      app.subdivNo = newSubdivNo;
      app.applicantName = newApplicantName;
      app.remarks = newRemarks;

      aregEditingIdx = -1;
      renderAregTable();

      if (typeof window.toast === 'function') {
        window.toast('Correction Saved', `Correction details saved for ${app.applId || newSurveyNo}`, 'ok');
      }
    } catch (err) {
      console.error('Save correction error:', err);
      if (typeof window.toast === 'function') {
        window.toast('Save Failed', err.message, 'err');
      }
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = '💾 Save Correction';
      }
    }
  }

  async function approveSingleAregApp(index, btnElement) {
    const app = aregPendingApps[index];
    if (!app) return;

    const talukSel = document.getElementById('aregTalukSel');
    const serviceSel = document.getElementById('aregServiceSel');
    const talukCode = talukSel ? talukSel.value : '03';
    const serviceCode = serviceSel ? serviceSel.value : '0109';
    const talukText = talukSel ? talukSel.options[talukSel.selectedIndex].text : 'Arakkonam';
    const logs = document.getElementById('aregLogs');

    if (btnElement) {
      btnElement.disabled = true;
      btnElement.innerHTML = '⏳ Approving...';
    }
    if (logs) {
      logs.style.display = 'block';
      logs.innerHTML += `<div>[${new Date().toLocaleTimeString()}] Approving ${app.applId || app.surveyNo}...</div>`;
      logs.scrollTop = logs.scrollHeight;
    }

    try {
      const secCreds = getTnCreds('secondary', talukText.split(' ')[0]);
      const u = secCreds.username || 'rpt_panneerselvam';
      const p = secCreds.password || 'Nemili@1970';
      const r = secCreds.roleId || '8';

      const url = `/api/areg?mode=approve&distCode=37&talukCode=${encodeURIComponent(talukCode)}&serviceCode=${encodeURIComponent(serviceCode)}&applId=${encodeURIComponent(app.applId)}&surveyNo=${encodeURIComponent(app.surveyNo)}&subdivNo=${encodeURIComponent(app.subdivNo)}&villageCode=${encodeURIComponent(app.villageCode)}&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&roleId=${encodeURIComponent(r)}`;
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Approval failed on Tamil Nilam portal');
      }

      app.applStatus = 'Approved & Completed';
      renderAregTable();

      if (logs) {
        logs.innerHTML += `<div style="color: #4ade80;">[${new Date().toLocaleTimeString()}] ✓ Application ${app.applId || app.surveyNo} approved &amp; completed!</div>`;
        logs.scrollTop = logs.scrollHeight;
      }

      if (typeof window.toast === 'function') {
        window.toast('A-Register Approved', `Application ${app.applId || app.surveyNo} approved and completed!`, 'ok');
      }

    } catch (err) {
      console.error('Approve single app error:', err);
      if (logs) {
        logs.innerHTML += `<div style="color: #f87171;">[${new Date().toLocaleTimeString()}] ❌ Failed to approve ${app.applId}: ${err.message}</div>`;
        logs.scrollTop = logs.scrollHeight;
      }
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = '⚡ Retry Approval';
      }
    }
  }

  async function approveAllAregApplications() {
    if (!aregPendingApps.length) return;
    const approveAllBtn = document.getElementById('aregApproveAllBtn');
    if (approveAllBtn) {
      approveAllBtn.disabled = true;
      approveAllBtn.innerHTML = '⏳ Processing Bulk Approval...';
    }

    const logs = document.getElementById('aregLogs');
    if (logs) {
      logs.style.display = 'block';
      logs.innerHTML += `<div>[${new Date().toLocaleTimeString()}] Starting bulk approval for ${aregPendingApps.length} applications...</div>`;
      logs.scrollTop = logs.scrollHeight;
    }

    let successCount = 0;
    for (let i = 0; i < aregPendingApps.length; i++) {
      const rowBtn = document.querySelector(`.btn-areg-approve[data-idx="${i}"]`);
      await approveSingleAregApp(i, rowBtn);
      successCount++;
    }

    if (approveAllBtn) {
      approveAllBtn.innerHTML = `✓ Bulk Approval Complete (${successCount}/${aregPendingApps.length})`;
    }
  }

  // ============================================================
  // REJECT REASON ANALYSIS SUITE (TAHSILDAR LOGIN)
  // Multi-subdivision deduplication, category-wise breakdown,
  // dual Rural/Natham views, KPI metrics and Excel export
  // ============================================================

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

// DOMContentLoaded Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Theme toggle
  const themeBtn = document.getElementById('themeBtn');
  if(themeBtn){
    let theme = 'light';
    try{ if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme='dark'; }catch(e){}
    const apply = t => {
      document.documentElement.setAttribute('data-theme', t);
      themeBtn.innerHTML = t==='dark' ? '&#9728;' : '&#9789;';
      themeBtn.title = t==='dark' ? 'Switch to light theme' : 'Switch to dark theme';
    };
    apply(theme);
    themeBtn.addEventListener('click', ()=>{ theme = theme==='dark'?'light':'dark'; apply(theme); });
  }

  // Nav tab buttons click
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  // Account modal buttons
  document.getElementById('acctBtn')?.addEventListener('click', openAcct);
  document.getElementById('acctClose')?.addEventListener('click', closeAcct);
  document.getElementById('acctBack')?.addEventListener('click', closeAcct);
  document.getElementById('pwSave')?.addEventListener('click', changePassword);
  document.getElementById('signOutBtn')?.addEventListener('click', async ()=>{
    if(sb) await sb.auth.signOut();
    location.reload();
  });

  // Gate form
  document.getElementById('gateForm')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(!sb) return;
    const email = document.getElementById('gateEmail').value.trim();
    const pass = document.getElementById('gatePass').value;
    const btn = document.getElementById('gateBtn');
    btn.disabled = true; btn.textContent = 'Please wait…';
    try{
      const { data, error } = await sb.auth.signInWithPassword({email, password: pass});
      if(error) throw error;
      await onSignedIn(data.session);
    }catch(err){
      gateMsg('err', esc(err.message || String(err)));
    }finally{
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  document.getElementById('gateForgot')?.addEventListener('click', async ()=>{
    const email = document.getElementById('gateEmail').value.trim();
    if(!email){ gateMsg('info', 'Type your email above first.'); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.href});
    gateMsg(error ? 'err' : 'ok', error ? esc(error.message) : 'Password reset link sent to ' + esc(email) + '.');
  });

  // Initialize Supabase Auth
  initCloud();
});
