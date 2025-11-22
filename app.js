// ========= DEBUG FLAG =========
window.__ec_debug = true;

// ========= FIREBASE CONFIG - REPLACE WITH YOURS =========
const firebaseConfig = {
  apiKey: "",           // <- add your keys
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// ========= CLOUDINARY CONFIG - REPLACE WITH YOURS =========
const CLOUD_NAME = "darmz4wsz"; // change if needed
const UPLOAD_PRESET = "emotional_preset"; // change to your preset
const CLOUD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// ========= GLOBALS =========
let uid = null;
let SELECTED_MOOD = null;
let SELECTED_SHAYARI = null;

/* ====== TOAST ====== */
function showToast(msg){
  const t = document.getElementById('toast');
  t.innerText = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'),2000);
}

/* ====== SHA256 helper for PIN hashing ====== */
async function sha256Hex(text){
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const h = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ====== PIN LOCK (create/enter/forgot) ====== */
const PIN_KEY = 'ec_pin_hash';

function show(id){ document.getElementById(id).classList.remove('hidden'); }
function hide(id){ document.getElementById(id).classList.add('hidden'); }
function setMessage(msg){
  const el = document.getElementById('pin-message');
  if(!el) return;
  el.innerText = msg;
  if(msg) setTimeout(()=> el.innerText = '', 3800);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const stored = localStorage.getItem(PIN_KEY);
    if(stored){
      hide('pin-setup'); show('pin-enter');
    } else {
      show('pin-setup'); hide('pin-enter');
    }

    // Create PIN
    document.getElementById('btnCreatePin').addEventListener('click', async ()=>{
      const p = document.getElementById('pinSetup').value.trim();
      const c = document.getElementById('pinConfirm').value.trim();
      if(!/^\d{4}$/.test(p) || !/^\d{4}$/.test(c)){ setMessage('PIN must be 4 digits'); return; }
      if(p !== c){ setMessage('PINs do not match'); return; }
      const h = await sha256Hex(p);
      localStorage.setItem(PIN_KEY, h);
      setMessage('PIN saved. Please unlock.');
      hide('pin-setup'); show('pin-enter');
      document.getElementById('pinSetup').value = ''; document.getElementById('pinConfirm').value = '';
    });

    // Unlock
    document.getElementById('btnUnlockPin').addEventListener('click', async ()=>{
      const pin = document.getElementById('pinEnter').value.trim();
      if(!/^\d{4}$/.test(pin)){ setMessage('Enter 4-digit PIN'); return; }
      const stored = localStorage.getItem(PIN_KEY);
      if(!stored){ setMessage('No PIN set'); hide('pin-enter'); show('pin-setup'); return; }
      const h = await sha256Hex(pin);
      if(h === stored){
        // success -> move to login screen
        document.getElementById('screen-lock').classList.remove('active');
        document.getElementById('screen-lock').classList.add('hidden');
        document.getElementById('screen-login').classList.remove('hidden');
        document.getElementById('pinEnter').value = '';
        setMessage('');
      } else {
        setMessage('Incorrect PIN');
        document.getElementById('pinEnter').value = '';
      }
    });

    // Forgot PIN
    document.getElementById('btnForgotPin').addEventListener('click', ()=>{
      localStorage.removeItem(PIN_KEY);
      setMessage('PIN cleared. Create a new one.');
      hide('pin-enter'); show('pin-setup');
    });

    // allow Enter
    ['pinEnter','pinSetup','pinConfirm'].forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('keydown', (ev)=>{
        if(ev.key === 'Enter'){
          ev.preventDefault();
          if(id === 'pinEnter') document.getElementById('btnUnlockPin').click();
          else document.getElementById('btnCreatePin').click();
        }
      });
    });
  } catch(e){
    console.error('PIN init error', e);
  }
});

/* ====== AUTH (email) ====== */
document.getElementById('btnLogin').addEventListener('click', ()=>{
  const e = document.getElementById('email').value.trim();
  const p = document.getElementById('password').value.trim();
  if(!e || !p){ showToast('Enter email & password'); return; }
  auth.signInWithEmailAndPassword(e,p)
    .catch(()=> auth.createUserWithEmailAndPassword(e,p).catch(err=> showToast(err.message)));
});

auth.onAuthStateChanged(user => {
  if(user){
    uid = user.uid;
    // show app
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('screen-app').classList.remove('hidden');
    // load user data
    loadEntries(); loadGallery(); loadGoals(); loadSettings();
  }
});

/* ====== NAVIGATION ====== */
document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-btn').forEach(n=>n.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
    const t = btn.dataset.target;
    document.getElementById(t).classList.remove('hidden');
  });
});

/* ====== SHAYARI POOL ====== */
const templates = {
  happy:{ start:["Muskurahat se","Dil khush hoke","Aaj ka din","Khushi ke saath","Sundar pal me"],
    middle:["har lamha roshan hota hai","umeed jagti hai","zindagi mehka karti hai","dil halka lagta hai"],
    end:["— yunhi muskurate raho.","aur chamakte raho.","yehi asli jeet hai."]},
  sad:{ start:["Har dard ke baad","Aansu ke baad","Andhera chhatega","Gham me bhi"],
    middle:["subah zaroor aati hai","nayi umeed jagti hai","dil ko himmat milti hai"],
    end:["— sab theek hoga.","himmat rakho.","ye waqt guzar jayega."]},
  angry:{ start:["Gussa chhodo","Shaanti se socho","Thoda ruk kar"],
    middle:["baat sulajh jati hai","dil halka hota hai","pyaar badhta hai"],
    end:["— calm raho.","sab theek hoga.","shaanti zaroori hai."]},
  calm:{ start:["Shaanti me","Sukoon ke pal me","Gehri saans lekar"],
    middle:["zindagi khubsurat lagti hai","dil halka hota hai","pal mehka lagta hai"],
    end:["— sukoon hi daulat hai.","ye pal sambhal kar rakho."]},
  anxious:{ start:["Chinta mat karo","Aahista chalo","Vishwas rakho"],
    middle:["sab theek hoga","ye waqt guzar jayega","himat banegi"],
    end:["— sab accha hoga.","dar mat rakho."]}
};

function makePool(mood,count){ const p=templates[mood]; const out=new Set(); while(out.size<count){ const a=p.start[Math.floor(Math.random()*p.start.length)]; const b=p.middle[Math.floor(Math.random()*p.middle.length)]; const c=p.end[Math.floor(Math.random()*p.end.length)]; out.add(`${a} ${b} ${c}`); } return Array.from(out); }
const POOL = {}; ["happy","sad","angry","calm","anxious"].forEach(m=> POOL[m]=makePool(m,200));

/* choose non-repeated shayari */
async function pickShayari(mood){
  try {
    const snap = await db.ref(`users/${uid}/seen_shayari`).once('value');
    const seen = snap.val() ? Object.values(snap.val()).map(x=>x.text) : [];
    let chosen = null;
    for(const s of POOL[mood]){ if(!seen.includes(s)){ chosen = s; break; } }
    if(!chosen) chosen = POOL[mood][Math.floor(Math.random()*POOL[mood].length)];
    await db.ref(`users/${uid}/seen_shayari`).push({ text: chosen, ts: Date.now() });
    return chosen;
  } catch(e){ console.error(e); return POOL[mood][Math.floor(Math.random()*POOL[mood].length)]; }
}

/* mood click */
document.querySelectorAll('.mood').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    SELECTED_MOOD = btn.dataset.mood;
    document.getElementById('selectedMood').innerText = SELECTED_MOOD;
    if(uid){
      SELECTED_SHAYARI = await pickShayari(SELECTED_MOOD);
    } else {
      // if not logged in, just pick from pool (no saving)
      SELECTED_SHAYARI = POOL[SELECTED_MOOD][Math.floor(Math.random()*POOL[SELECTED_MOOD].length)];
    }
    document.getElementById('popupText').innerText = SELECTED_SHAYARI;
    document.getElementById('popup').classList.remove('hidden');
  });
});

function closePopup(){ document.getElementById('popup').classList.add('hidden'); }

/* ====== PHOTO UPLOAD (Cloudinary) ====== */
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
if(photoInput){
  photoInput.addEventListener('change', ()=> {
    const f = photoInput.files[0];
    if(f){ photoPreview.src = URL.createObjectURL(f); photoPreview.classList.remove('hidden'); }
  });
}

async function uploadToCloudinary(file){
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(CLOUD_URL, { method:'POST', body: fd });
  const j = await res.json();
  if(j.error) throw new Error(j.error.message || 'Upload failed');
  return j.secure_url;
}

/* ====== SAVE ENTRY ====== */
document.getElementById('saveEntry').addEventListener('click', async ()=>{
  if(!SELECTED_MOOD){ showToast('Select mood first'); return; }
  const text = document.getElementById('journalText').value.trim();
  let photoURL = '';
  try{
    if(photoInput.files[0]) photoURL = await uploadToCloudinary(photoInput.files[0]);
  } catch(err){ showToast('Photo upload failed'); console.error(err); return; }

  const today = new Date().toISOString().split('T')[0];
  if(!uid){ showToast('Please login to save'); return; }

  await db.ref(`users/${uid}/journal/${today}`).set({
    date: today, mood: SELECTED_MOOD, shayari: SELECTED_SHAYARI || '', journal: text, photo: photoURL, ts: Date.now()
  });

  showToast('Saved');
  document.getElementById('journalText').value = '';
  photoPreview.classList.add('hidden');
  loadEntries(); loadGallery();
});

/* ====== LOAD ENTRIES ====== */
async function loadEntries(){
  try{
    if(!uid) return;
    const snap = await db.ref(`users/${uid}/journal`).once('value');
    const box = document.getElementById('entriesList');
    box.innerHTML = '';
    if(!snap.val()){ box.innerText = 'No entries'; return; }
    const arr = Object.values(snap.val()).sort((a,b)=>b.ts - a.ts);
    arr.forEach(e=>{
      const div = document.createElement('div'); div.classList.add('card');
      div.innerHTML = `<b>${e.date}</b><br>Mood: ${e.mood}<br>Shayari: ${e.shayari}<br>Note: ${e.journal}${e.photo?`<img src="${e.photo}" style="width:100%;border-radius:10px;margin-top:8px;">`:''}`;
      box.appendChild(div);
    });
  } catch(e){ console.error('loadEntries', e); }
}

/* ====== LOAD GALLERY ====== */
async function loadGallery(){
  try{
    if(!uid) return;
    const snap = await db.ref(`users/${uid}/journal`).once('value');
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';
    if(!snap.val()){ grid.innerText = 'No photos'; return; }
    const items = Object.values(snap.val());
    items.forEach(i => { if(i.photo){ const img = document.createElement('img'); img.src = i.photo; grid.appendChild(img); }});
  } catch(e){ console.error('loadGallery', e); }
}

/* ====== GOALS ====== */
document.getElementById('addGoal').addEventListener('click', async ()=>{
  const title = document.getElementById('goalTitle').value.trim();
  const date = document.getElementById('goalDate').value;
  if(!title || !date){ showToast('Enter goal & date'); return; }
  if(!uid){ showToast('Login to save'); return; }
  await db.ref(`users/${uid}/goals`).push({ title, date, ts: Date.now() });
  document.getElementById('goalTitle').value = '';
  loadGoals();
});

async function loadGoals(){
  try{
    if(!uid) return;
    const snap = await db.ref(`users/${uid}/goals`).once('value');
    const list = document.getElementById('goalsList');
    list.innerHTML = '';
    if(!snap.val()){ list.innerText = 'No goals'; return; }
    Object.values(snap.val()).forEach(g=>{ const d = document.createElement('div'); d.classList.add('card'); d.innerHTML = `<b>${g.title}</b><br>Target: ${g.date}`; list.appendChild(d); });
  } catch(e){ console.error('loadGoals', e); }
}

/* ====== SETTINGS ====== */
document.getElementById('btnLogout').addEventListener('click', ()=> { auth.signOut(); location.reload(); });

document.getElementById('reminder').addEventListener('change', ()=>{
  if(!uid) { showToast('Login to save settings'); return; }
  const v = document.getElementById('reminder').value;
  db.ref(`users/${uid}/settings`).set({ reminder: v });
  showToast('Reminder saved');
});

async function loadSettings(){
  try{ if(!uid) return; const snap = await db.ref(`users/${uid}/settings`).once('value'); if(snap.val()) document.getElementById('reminder').value = snap.val().reminder || '21'; } catch(e){ console.error(e); }
}

/* ====== Global error handlers to show overlay ====== */
window.addEventListener('error', function(e){
  try{ const dbg = document.getElementById('debugOverlay'); dbg && (dbg.innerText += '\nUNCAUGHT ERROR: ' + (e.message || e)); } catch(err){}
});
window.addEventListener('unhandledrejection', function(ev){
  try{ const dbg = document.getElementById('debugOverlay'); dbg && (dbg.innerText += '\nUNHANDLED REJECT: ' + (ev.reason || ev)); } catch(err){}
});
