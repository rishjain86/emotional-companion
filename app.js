/* -------------------------
   FIREBASE CONFIG
-------------------------- */
const firebaseConfig = {
  apiKey: "",
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

/* -------------------------
   CLOUDINARY SETTINGS
-------------------------- */
const CLOUD_NAME = "darmz4wsz";
const UPLOAD_PRESET = "emotional_preset";

const CLOUD_URL =
  "https://api.cloudinary.com/v1_1/" + CLOUD_NAME + "/image/upload";

/* Helpers */
function showToast(msg) {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

/* Heart Unlock */
document.getElementById("heart").onclick = () => {
  document.getElementById("screen-lock").classList.add("hidden");
  document.getElementById("screen-login").classList.remove("hidden");
};

/* Login */
document.getElementById("btnLogin").onclick = () => {
  let e = email.value.trim();
  let p = password.value.trim();

  if (!e || !p) return showToast("Enter email & password");

  auth
    .signInWithEmailAndPassword(e, p)
    .catch(() => auth.createUserWithEmailAndPassword(e, p));
};

auth.onAuthStateChanged((u) => {
  if (!u) return;

  uid = u.uid;

  screen-login.classList.add("hidden");
  screen-app.classList.remove("hidden");

  loadEntries();
  loadGallery();
  loadGoals();
});

/* NAVIGATION */
document.querySelectorAll(".nav-btn").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".nav-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");

    document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
    document.getElementById(b.dataset.target).classList.remove("hidden");
  };
});

/* Shayari pool */
const shayariBank = {
  happy: ["Khushiyan roshan kar deti hain…", "Dil halka halka lagta hai…"],
  sad: ["Andhera hamesha nahi rehta…", "Roshni zarur wapas aati hai…"],
  angry: ["Shaanti se socho sab theek hoga…"],
  calm: ["Sukoon me zindagi khoobsurat lagti hai…"],
  anxious: ["Chinta chhod do, waqt badal raha hai…"]
};

/* Mood selection */
document.querySelectorAll(".mood").forEach((m) => {
  m.onclick = async () => {
    let mood = m.dataset.mood;
    selectedMood.innerText = mood;

    let list = shayariBank[mood];
    popupText.innerText = list[Math.floor(Math.random() * list.length)];

    popup.classList.remove("hidden");
  };
});

function closePopup() {
  popup.classList.add("hidden");
}

/* Upload to Cloudinary */
async function uploadPhoto(file) {
  let fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);

  let r = await fetch(CLOUD_URL, { method: "POST", body: fd });
  let j = await r.json();
  return j.secure_url;
}

/* Save entry */
document.getElementById("saveEntry").onclick = async () => {
  const today = new Date().toISOString().split("T")[0];
  const text = journalText.value;

  let photoURL = "";
  if (photoInput.files[0]) {
    photoURL = await uploadPhoto(photoInput.files[0]);
  }

  db.ref("users/" + uid + "/entries/" + today).set({
    mood: selectedMood.innerText,
    text,
    photo: photoURL,
    ts: Date.now(),
  });

  showToast("Saved!");
  journalText.value = "";
  photoPreview.classList.add("hidden");

  loadEntries();
  loadGallery();
};

/* Load entries */
async function loadEntries() {
  let snap = await db.ref("users/" + uid + "/entries").once("value");
  let data = snap.val();

  if (!data) return;

  let html = "";
  Object.keys(data)
    .sort((a, b) => data[b].ts - data[a].ts)
    .forEach((d) => {
      let e = data[d];
      html += `<div class="card">
        <b>${d}</b><br>
        Mood: ${e.mood}<br>
        Note: ${e.text}<br>
        ${e.photo ? `<img src="${e.photo}" class="preview-img">` : ""}
      </div>`;
    });

  entries.innerHTML = html;
}

/* Load gallery */
async function loadGallery() {
  let snap = await db.ref("users/" + uid + "/entries").once("value");
  let data = snap.val();

  if (!data) return;

  galleryGrid.innerHTML = "";

  Object.values(data).forEach((e) => {
    if (e.photo) {
      let img = document.createElement("img");
      img.src = e.photo;
      galleryGrid.appendChild(img);
    }
  });
}

/* Goals */
addGoal.onclick = () => {
  let t = goalTitle.value.trim();
  let d = goalDate.value;

  if (!t || !d) return showToast("Enter goal & date");

  db.ref("users/" + uid + "/goals").push({
    title: t,
    date: d,
  });

  loadGoals();
};

async function loadGoals() {
  let snap = await db.ref("users/" + uid + "/goals").once("value");
  let data = snap.val();

  if (!data) {
    goalsList.innerHTML = "No goals";
    return;
  }

  let html = "";
  Object.values(data).forEach((g) => {
    html += `<div class="card">${g.title} → ${g.date}</div>`;
  });

  goalsList.innerHTML = html;
}

/* Logout */
btnLogout.onclick = () => auth.signOut();
