'use strict';
// top-level try/catch and robust debug reporting
(function(){
  // small helper to write to debug overlay
  function debug(msg){
    try{
      const o = document.getElementById('debugOverlay');
      if(o) o.innerText += '\\n' + msg;
      else console.log('DBG:', msg);
    }catch(e){ console.log('DBGERR', e); }
  }

  // global error handlers
  window.addEventListener('error', function(e){
    debug('UNCAUGHT ERROR: ' + (e && e.message ? e.message : String(e)));
  });
  window.addEventListener('unhandledrejection', function(ev){
    debug('UNHANDLED REJECTION: ' + (ev && ev.reason ? ev.reason : String(ev)));
  });

  try {
    // ===== FIREBASE CONFIG (corrected) =====
    const firebaseConfig = {
      apiKey: "AIzaSyDdANy-270UsL5cD3t_JrN6bspGISAnvl4",
      authDomain: "emotional-companion-f6701.firebaseapp.com",
      databaseURL: "https://emotional-companion-f6701-default-rtdb.firebaseio.com",
      projectId: "emotional-companion-f6701",
      storageBucket: "emotional-companion-f6701.appspot.com",
      messagingSenderId: "1087590753254",
      appId: "1:1087590753254:web:b251fa293680cb23656c27",
      measurementId: "G-F020JCPS3T"
    };
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.database();

    // ===== CLOUDINARY =====
    const CLOUD_NAME = "darmz4wsz";        // change if needed
    const UPLOAD_PRESET = "emotional_preset"; // change if needed
    const CLOUD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    // ===== GLOBALS =====
    let uid = null;
    let SELECTED_MOOD = null;
    let SELECTED_SHAYARI = null;

    // ===== HELPERS =====
    function showToast(msg){
      const t = document.getElementById('toast');
      if(!t) return;
      t.innerText = msg;
      t.classList.add('show');
      setTimeout(()=> t.classList.remove('show'), 1800);
    }
    function el(id){ return document.getElementById(id); }

    // ===== SHA256 for PIN =====
    async function sha256Hex(text){
      const enc = new TextEncoder();
      const data = enc.encode(text);
      const hash = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
    }

    // ===== PIN LOGIC =====
    const PIN_KEY = 'ec_pin_hash';
    function show(id){ const e=el(id); e && e.classList.remove('hidden'); }
    function hide(id){ const e=el(id); e && e.classList.add('hidden'); }
    function setMessage(msg){ const e = el('pin-message'); if(e){ e.innerText = msg; if(msg) setTimeout(()=> e.innerText = '',3800); } }

    document.addEventListener('DOMContentLoaded', function(){
      try {
        const stored = localStorage.getItem(PIN_KEY);
        if(stored){ hide('pin-setup'); show('pin-enter'); } else { show('pin-setup'); hide('pin-enter'); }

        // Create PIN
        el('btnCreatePin').addEventListener('click', async function(){
          try {
            const p = el('pinSetup').value.trim();
            const c = el('pinConfirm').value.trim();
            if(!/^[0-9]{4}$/.test(p) || !/^[0-9]{4}$/.test(c)){ setMessage('PIN must be exactly 4 digits'); return; }
            if(p !== c){ setMessage('PINs do not match'); return; }
            const h = await sha256Hex(p);
            localStorage.setItem(PIN_KEY, h);
            setMessage('PIN saved. Please unlock.');
            hide('pin-setup'); show('pin-enter');
            el('pinSetup').value=''; el('pinConfirm').value='';
          } catch(err){ debug('Create PIN err: ' + err.message); setMessage('Failed to save PIN'); }
        });

        // Unlock PIN
        el('btnUnlockPin').addEventListener('click', async function(){
          try {
            const pin = el('pinEnter').value.trim();
            if(!/^[0-9]{4}$/.test(pin)){ setMessage('Enter 4-digit PIN'); return; }
            const stored = localStorage.getItem(PIN_KEY);
            if(!stored){ setMessage('No PIN set'); hide('pin-enter'); show('pin-setup'); return; }
            const h = await sha256Hex(pin);
            if(h === stored){
              // hide lock, show login
              el('screen-lock').classList.remove('active'); el('screen-lock').classList.add('hidden');
              el('screen-login').classList.remove('hidden');
              el('pinEnter').value='';
            } else {
              setMessage('Incorrect PIN');
              el('pinEnter').value='';
            }
          } catch(err){ debug('Unlock PIN err: ' + err.message); setMessage('Unlock failed'); }
        });

        el('btnForgotPin').addEventListener('click', function(){
          localStorage.removeItem(PIN_KEY);
          setMessage('PIN cleared. Create a new one.');
          hide('pin-enter'); show('pin-setup');
        });

        // Enter key support
        ['pinEnter','pinSetup','pinConfirm'].forEach(id=>{
          const input = el(id);
          if(!input) return;
          input.addEventListener('keydown', (ev)=>{
            if(ev.key === 'Enter'){ ev.preventDefault(); if(id === 'pinEnter') el('btnUnlockPin').click(); else el('btnCreatePin').click(); }
          });
        });

      } catch(e){ debug('PIN init error: ' + (e.message||e)); }
    });

    // ===== AUTH =====
    el('btnLogin').addEventListener('click', ()=>{
      const eVal = (el('email').value||'').trim();
      const pVal = (el('password').value||'').trim();
      if(!eVal || !pVal){ showToast('Enter email & password'); return; }
      auth.signInWithEmailAndPassword(eVal, pVal)
        .catch(()=> auth.createUserWithEmailAndPassword(eVal, pVal).catch(err => showToast(err.message)));
    });

    auth.onAuthStateChanged(function(user){
      try {
        if(user){
          uid = user.uid;
          // show app
          hide('screen-login'); show('screen-app');
          // initial loads
          loadEntries(); loadGallery(); loadGoals(); loadSettings();
        } else {
          // show login (if lock already removed)
        }
      } catch(e){ debug('Auth state change err: ' + e.message); }
    });

    // ===== NAVIGATION =====
    document.querySelectorAll('.nav-btn').forEach(btn=>{
      btn.addEventListener('click', function(){
        document.querySelectorAll('.nav-btn').forEach(n=>n.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
        const t = btn.dataset.target;
        if(t && document.getElementById(t)) document.getElementById(t).classList.remove('hidden');
      });
    });

    // ===== SHAYARI POOL =====
    const templates = {
      happy:{ start:["Muskurahat se","Dil khush hoke","Aaj ka din","Khushi ke saath","Sundar pal me"], middle:["har lamha roshan hota hai","umeed jagti hai","zindagi mehka karti hai","dil halka lagta hai"], end:["— yunhi muskurate raho.","aur chamakte raho.","yehi asli jeet hai."]},
      sad:{ start:["Har dard ke baad","Aansu ke baad","Andhera chhatega","Gham me bhi"], middle:["subah zaroor aati hai","nayi umeed jagti hai","dil ko himmat milti hai"], end:["— sab theek hoga.","himmat rakho.","ye waqt guzar jayega."]},
      angry:{ start:["Gussa chhodo","Shaanti se socho","Thoda ruk kar"], middle:["baat sulajh jati hai","dil halka hota hai","pyaar badhta hai"], end:["— calm raho.","sab theek hoga.","shaanti zaroori hai."]},
      calm:{ start:["Shaanti me","Sukoon ke pal me","Gehri saans lekar"], middle:["zindagi khubsurat lagti hai","dil halka hota hai","pal mehka lagta hai"], end:["— sukoon hi daulat hai.","ye pal sambhal kar rakho."]},
      anxious:{ start:["Chinta mat karo","Aahista chalo","Vishwas rakho"], middle:["sab theek hoga","ye waqt guzar jayega","himat banegi"], end:["— sab accha hoga.","dar mat rakho."]}
    };
    function makePool(mood,count){ const p=templates[mood]; const s=new Set(); while(s.size<count){ const a=p.start[Math.floor(Math.random()*p.start.length)]; const b=p.middle[Math.floor(Math.random()*p.middle.length)]; const c=p.end[Math.floor(Math.random()*p.end.length)]; s.add(`${a} ${b} ${c}`); } return Array.from(s); }
    const POOL = {}; ["happy","sad","angry","calm","anxious"].forEach(m=> POOL[m]=makePool(m,200));

    async function pickShayari(mood){
      try {
        if(!uid) return POOL[mood][Math.floor(Math.random()*POOL[mood].length)];
        const snap = await db.ref(`users/${uid}/seen_shayari`).once('value');
        const seen = snap.val() ? Object.values(snap.val()).map(x=>x.text) : [];
        let chosen = null;
        for(const s of POOL[mood]){ if(!seen.includes(s)){ chosen = s; break; } }
        if(!chosen) chosen = POOL[mood][Math.floor(Math.random()*POOL[mood].length)];
        await db.ref(`users/${uid}/seen_shayari`).push({ text: chosen, ts: Date.now() });
        return chosen;
      } catch(e){ debug('pickShayari err: ' + e.message); return POOL[mood][Math.floor(Math.random()*POOL[mood].length)]; }
    }

    document.querySelectorAll('.mood').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        try {
          SELECTED_MOOD = btn.dataset.mood;
          el('selectedMood').innerText = SELECTED_MOOD;
          if(uid){
            SELECTED_SHAYARI = await pickShayari(SELECTED_MOOD);
          } else {
            SELECTED_SHAYARI = POOL[SELECTED_MOOD][Math.floor(Math.random()*POOL[SELECTED_MOOD].length)];
          }
          el('popupText').innerText = SELECTED_SHAYARI;
          el('popup').classList.remove('hidden');
        } catch(err){ debug('mood click err: ' + err.message); }
      });
    });

    window.closePopup = function(){ try{ el('popup').classList.add('hidden'); }catch(e){} };

    // ===== PHOTO PREVIEW & UPLOAD =====
    const photoInput = el('photoInput');
    const photoPreview = el('photoPreview');
    if(photoInput){
      photoInput.addEventListener('change', ()=> {
        const f = photoInput.files[0];
        if(f){ photoPreview.src = URL.createObjectURL(f); photoPreview.classList.remove('hidden'); }
      });
    }

    async function uploadToCloudinary(file){
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', UPLOAD_PRESET);
        const r = await fetch(CLOUD_URL, { method: 'POST', body: fd });
        const j = await r.json();
        if(j.error) throw new Error(j.error.message || 'Upload error');
        return j.secure_url;
      } catch(e){ debug('Cloud upload err: ' + (e.message || e)); throw e; }
    }

    // ===== SAVE ENTRY =====
    el('saveEntry').addEventListener('click', async ()=>{
      try {
        if(!SELECTED_MOOD){ showToast('Select mood first'); return; }
        const text = (el('journalText').value||'').trim();
        let photoURL = '';
        if(photoInput && photoInput.files[0]) photoURL = await uploadToCloudinary(photoInput.files[0]);
        const today = new Date().toISOString().split('T')[0];
        if(!uid){ showToast('Please login to save'); return; }
        await db.ref(`users/${uid}/journal/${today}`).set({
          date: today, mood: SELECTED_MOOD, shayari: SELECTED_SHAYARI || '', journal: text, photo: photoURL, ts: Date.now()
        });
        showToast('Saved');
        el('journalText').value = '';
        photoPreview.classList.add('hidden');
        loadEntries(); loadGallery();
      } catch(e){ debug('saveEntry err: ' + (e.message||e)); showToast('Save failed'); }
    });

    // ===== LOAD ENTRIES =====
    async function loadEntries(){
      try{
        if(!uid) return;
        const snap = await db.ref(`users/${uid}/journal`).once('value');
        const box = el('entriesList');
        box.innerHTML = '';
        if(!snap.val()){ box.innerText = 'No entries'; return; }
        const arr = Object.values(snap.val()).sort((a,b)=>b.ts - a.ts);
        arr.forEach(e=>{
          const div = document.createElement('div'); div.classList.add('card');
          div.innerHTML = `<b>${e.date}</b><br>Mood: ${e.mood}<br>Shayari: ${e.shayari}<br>Note: ${e.journal}${e.photo?`<img src="${e.photo}" style="width:100%;border-radius:10px;margin-top:8px;">`:''}`;
          box.appendChild(div);
        });
      } catch(e){ debug('loadEntries err: ' + (e.message||e)); }
    }

    // ===== LOAD GALLERY =====
    async function loadGallery(){
      try{
        if(!uid) return;
        const snap = await db.ref(`users/${uid}/journal`).once('value');
        const grid = el('galleryGrid');
        grid.innerHTML = '';
        if(!snap.val()){ grid.innerText = 'No photos'; return; }
        const items = Object.values(snap.val());
        items.forEach(i => { if(i.photo){ const img = document.createElement('img'); img.src = i.photo; grid.appendChild(img); }});
      } catch(e){ debug('loadGallery err: ' + (e.message||e)); }
    }

    // ===== GOALS =====
    el('addGoal').addEventListener('click', async ()=>{
      try{
        const title = (el('goalTitle').value||'').trim();
        const date = el('goalDate').value;
        if(!title||!date){ showToast('Enter goal & date'); return; }
        if(!uid){ showToast('Login to save'); return; }
        await db.ref(`users/${uid}/goals`).push({ title, date, ts: Date.now() });
        el('goalTitle').value = ''; loadGoals();
      } catch(e){ debug('addGoal err: ' + (e.message||e)); showToast('Failed'); }
    });

    async function loadGoals(){
      try{
        if(!uid) return;
        const snap = await db.ref(`users/${uid}/goals`).once('value');
        const list = el('goalsList'); list.innerHTML = '';
        if(!snap.val()){ list.innerText = 'No goals'; return; }
        Object.values(snap.val()).forEach(g=>{ const d = document.createElement('div'); d.classList.add('card'); d.innerHTML = `<b>${g.title}</b><br>Target: ${g.date}`; list.appendChild(d); });
      } catch(e){ debug('loadGoals err: ' + (e.message||e)); }
    }

    // ===== SETTINGS / LOGOUT =====
    el('btnLogout').addEventListener('click', ()=> { auth.signOut(); location.reload(); });

    el('reminder').addEventListener('change', ()=>{
      try{
        if(!uid){ showToast('Login to save settings'); return; }
        const v = el('reminder').value;
        db.ref(`users/${uid}/settings`).set({ reminder: v });
        showToast('Reminder saved');
      } catch(e){ debug('reminder err: ' + e.message); }
    });

    async function loadSettings(){
      try{ if(!uid) return; const snap = await db.ref(`users/${uid}/settings`).once('value'); if(snap.val()) el('reminder').value = snap.val().reminder || '21'; } catch(e){ debug('loadSettings err: ' + e.message); }
    }

    // final debug
    debug('app.js initialized OK');
  } catch(mainErr){
    debug('MAIN APP ERR: ' + (mainErr && mainErr.message ? mainErr.message : String(mainErr)));
  }
})();
