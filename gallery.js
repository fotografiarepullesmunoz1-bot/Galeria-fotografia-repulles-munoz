(() => {
  const cfg = window.GALLERY_CONFIG || {};
  const PRIVATE_BUCKET = "private-photos";
  const CREDIT = "Fotografía: David Repullés Muñoz · @David.fototrl";
  const COLS = "id,title,event_name,dorsal,description,storage_path,bucket,created_at";
  const COLS_LEGACY = "id,title,event_name,dorsal,description,storage_path,created_at";

  const status = document.getElementById("status");
  const grid = document.getElementById("photoGrid");
  const empty = document.getElementById("emptyState");
  const search = document.getElementById("searchInput");
  const albumGrid = document.getElementById("albumGrid");
  const backBtn = document.getElementById("backBtn");
  const galleryTitle = document.getElementById("galleryTitle");
  const count = document.getElementById("photoCount");
  const lightbox = document.getElementById("lightbox");

  const copyrightModal = document.getElementById("copyrightModal");
  const copyCreditBtn = document.getElementById("copyCredit");
  const copyMessage = document.getElementById("copyMessage");
  const cancelDownloadBtn = document.getElementById("cancelDownload");
  const confirmDownloadBtn = document.getElementById("confirmDownload");

  const downloadAllBtn = document.getElementById("downloadAllBtn");
  const zipProgress = document.getElementById("zipProgress");

  const unlockModal = document.getElementById("unlockModal");
  const unlockForm = document.getElementById("unlockForm");
  const unlockTitle = document.getElementById("unlockTitle");
  const unlockInput = document.getElementById("unlockPassword");
  const unlockMessage = document.getElementById("unlockMessage");
  const unlockCancel = document.getElementById("unlockCancel");
  const unlockSubmit = document.getElementById("unlockSubmit");

  let client = null, allPhotos = [], privateAlbums = [], visiblePhotos = [];
  let currentIndex = 0, currentEvent = null, pendingDownload = null, unlockTarget = null, renderToken = 0;
  const unlocked = new Set();
  const copyrightOff = new Set(); // galerías donde el fotógrafo ha desactivado el aviso
  const ZIP_PART_BYTES = 400 * 1024 * 1024; // el ZIP se divide en partes de ~400 MB
  let zipping = false;
  const signed = new Map(); // storage_path -> { url, exp }
  const NO_EVENT = "Sin evento";
  const evName = p => p.event_name || NO_EVENT;
  const isPriv = p => p.bucket === PRIVATE_BUCKET;

  document.getElementById("year").textContent = new Date().getFullYear();

  function configReady() {
    return cfg.SUPABASE_URL && cfg.SUPABASE_KEY &&
      !cfg.SUPABASE_URL.includes("TU-PROYECTO") &&
      !cfg.SUPABASE_KEY.includes("PEGA_AQUI");
  }
  function say(text, isError=false) {
    status.textContent = text;
    status.classList.toggle("error-text", isError);
    status.classList.remove("hidden");
  }
  function syncBodyLock() {
    const anyOpen = [lightbox, copyrightModal, unlockModal].some(el => !el.classList.contains("hidden"));
    document.body.classList.toggle("modal-open", anyOpen);
  }
  function safeFilename(s) {
    return String(s || "fotografia").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim().slice(0,100) || "fotografia";
  }
  function fileExt(photo) { return (photo.storage_path.match(/\.[^.\/]+$/) || [".jpg"])[0]; }
  function downloadName(photo) { return safeFilename(photo.title || "fotografia") + fileExt(photo); }
  function formatDate(value) {
    try { return new Date(value).toLocaleDateString("es-ES", {day:"2-digit", month:"short", year:"numeric"}); }
    catch { return ""; }
  }
  function matches(p, q) {
    const hay = [p.title, p.event_name, p.dorsal, p.description].filter(Boolean).join(" ").toLocaleLowerCase("es");
    return !q || hay.includes(q);
  }
  function pubUrl(p) { return client.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl; }

  // Fotos privadas: se sirven con enlaces temporales (1 hora).
  function imgUrl(p) {
    if (!isPriv(p)) return pubUrl(p);
    const s = signed.get(p.storage_path);
    return s && s.exp > Date.now() ? s.url : "";
  }
  async function signPhotos(list) {
    const now = Date.now();
    const paths = [...new Set(list
      .filter(p => isPriv(p) && !((signed.get(p.storage_path) || {}).exp > now + 60000))
      .map(p => p.storage_path))];
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { data, error } = await client.storage.from(PRIVATE_BUCKET).createSignedUrls(chunk, 3600);
      if (error) throw error;
      (data || []).forEach(d => { if (d.signedUrl) signed.set(d.path, { url: d.signedUrl, exp: now + 3600 * 1000 }); });
    }
  }

  // ---------- Descarga con aviso de copyright ----------
  function publicDownloadUrl(photo) {
    const url = new URL(pubUrl(photo));
    url.searchParams.set("download", downloadName(photo));
    return url.toString();
  }
  async function buildDownloadUrl(photo) {
    if (!isPriv(photo)) return publicDownloadUrl(photo);
    const { data, error } = await client.storage.from(PRIVATE_BUCKET)
      .createSignedUrl(photo.storage_path, 300, { download: downloadName(photo) });
    if (error) throw error;
    return data.signedUrl;
  }
  function startDownload(url) {
    const a = document.createElement("a");
    a.href = url; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
  }
  function setCopyMessage(text, bad=false) {
    copyMessage.textContent = text;
    copyMessage.classList.toggle("error-text", bad);
  }
  async function directDownload(photo) {
    try { startDownload(await buildDownloadUrl(photo)); }
    catch (e) { alert("No se pudo preparar la descarga: " + (e.message || "error desconocido")); }
  }
  function askDownload(photo) {
    if (copyrightOff.has(evName(photo))) { directDownload(photo); return; }
    pendingDownload = photo;
    setCopyMessage("");
    copyCreditBtn.textContent = "Copiar crédito";
    copyrightModal.classList.remove("hidden");
    syncBodyLock();
    confirmDownloadBtn.focus();
  }
  function closeCopyright() {
    pendingDownload = null;
    copyrightModal.classList.add("hidden");
    syncBodyLock();
  }
  async function copyCredit() {
    let ok = false;
    try { await navigator.clipboard.writeText(CREDIT); ok = true; }
    catch {
      const t = document.createElement("textarea");
      t.value = CREDIT; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.append(t); t.select();
      try { ok = document.execCommand("copy"); } catch {}
      t.remove();
    }
    if (ok) {
      copyCreditBtn.textContent = "Copiado ✓";
      setCopyMessage("Crédito copiado. Pégalo al publicar la fotografía.");
      setTimeout(() => { copyCreditBtn.textContent = "Copiar crédito"; }, 2500);
    } else {
      setCopyMessage("No se pudo copiar automáticamente. Selecciona el texto y cópialo a mano.", true);
    }
  }
  copyCreditBtn.addEventListener("click", copyCredit);
  cancelDownloadBtn.addEventListener("click", closeCopyright);
  copyrightModal.addEventListener("click", e => { if (e.target === copyrightModal) closeCopyright(); });
  confirmDownloadBtn.addEventListener("click", async () => {
    const p = pendingDownload;
    if (!p) return;
    if (p.all) { closeCopyright(); downloadAll(); return; }
    confirmDownloadBtn.disabled = true;
    try {
      startDownload(await buildDownloadUrl(p));
      closeCopyright();
    } catch (e) {
      setCopyMessage("No se pudo preparar la descarga: " + (e.message || "error desconocido"), true);
    } finally {
      confirmDownloadBtn.disabled = false;
    }
  });

  // ---------- Descargar todas (ZIP) ----------
  function zipMsg(text, bad=false) {
    zipProgress.textContent = text;
    zipProgress.classList.toggle("error-text", bad);
    zipProgress.classList.toggle("hidden", !text);
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function askDownloadAll() {
    if (!visiblePhotos.length || zipping) return;
    if (copyrightOff.has(currentEvent)) { downloadAll(); return; }
    pendingDownload = { all: true };
    setCopyMessage("");
    copyCreditBtn.textContent = "Copiar crédito";
    copyrightModal.classList.remove("hidden");
    syncBodyLock();
    confirmDownloadBtn.focus();
  }
  async function downloadAll() {
    if (zipping) return;
    const photos = visiblePhotos.slice();
    if (!photos.length) return;
    if (!window.JSZip) { zipMsg("No se pudo cargar el componente de descarga. Recarga la página e inténtalo de nuevo.", true); return; }
    zipping = true; downloadAllBtn.disabled = true;
    const album = safeFilename(currentEvent || "galeria");
    const withCredit = !copyrightOff.has(currentEvent);
    const used = new Set();
    const failed = [];
    const newZip = () => { const z = new JSZip(); if (withCredit) z.file("CREDITO.txt", CREDIT + "\n"); return z; };
    const uniqueName = p => {
      let name = downloadName(p), n = 2;
      while (used.has(name.toLowerCase())) name = downloadName(p).replace(/(\.[^.]+)$/, ` (${n++})$1`);
      used.add(name.toLowerCase());
      return name;
    };
    const saveZip = async (zip, name) => {
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" },
        m => zipMsg(`Creando ${name}… ${Math.round(m.percent)}%`));
      saveBlob(blob, name);
    };
    let zip = newZip(), bytes = 0, inPart = 0, part = 1, done = 0;
    try {
      await signPhotos(photos);
      for (let i = 0; i < photos.length; i += 3) {
        const chunk = photos.slice(i, i + 3);
        const blobs = await Promise.all(chunk.map(async p => {
          try {
            const r = await fetch(imgUrl(p));
            if (!r.ok) throw new Error("HTTP " + r.status);
            return await r.blob();
          } catch (e) { failed.push(p.title || p.storage_path); return null; }
        }));
        chunk.forEach((p, k) => {
          if (!blobs[k]) return;
          zip.file(uniqueName(p), blobs[k], { binary: true });
          bytes += blobs[k].size; inPart++; done++;
        });
        zipMsg(`Descargando fotografías… ${Math.min(i + 3, photos.length)} de ${photos.length}`);
        if (bytes >= ZIP_PART_BYTES && i + 3 < photos.length) {
          await saveZip(zip, `${album} (parte ${part}).zip`);
          part++; zip = newZip(); bytes = 0; inPart = 0;
        }
      }
      if (inPart) await saveZip(zip, part > 1 ? `${album} (parte ${part}).zip` : `${album}.zip`);
      zipMsg(done
        ? `Listo: ${done} fotografía(s) descargada(s)${part > 1 ? ` en ${part} archivos ZIP` : ""}.${failed.length ? ` No se pudieron descargar ${failed.length}: ${failed.join(", ")}.` : ""}`
        : "No se pudo descargar ninguna fotografía.", !done || failed.length > 0);
    } catch (e) {
      zipMsg("No se pudo crear el ZIP: " + (e.message || "error desconocido") + ". Si la galería es muy grande, prueba desde un ordenador.", true);
    } finally {
      zipping = false; downloadAllBtn.disabled = false;
    }
  }
  downloadAllBtn.addEventListener("click", askDownloadAll);

  // ---------- Álbumes privados ----------
  async function ensureSession() {
    const { data } = await client.auth.getSession();
    if (data.session) return data.session;
    const { data: d, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    return d.session;
  }
  function unlockErrorText(e) {
    const msg = (e && e.message) || "";
    if (/anonymous/i.test(msg)) return "El acceso con contraseña aún no está activado en Supabase (falta activar «Allow anonymous sign-ins»).";
    if (e && (e.code === "PGRST202" || /could not find the function/i.test(msg))) return "Falta ejecutar private_albums.sql en Supabase.";
    return msg || "No se pudo comprobar la contraseña.";
  }
  function openUnlock(name) {
    unlockTarget = name;
    unlockTitle.textContent = `Galería privada · ${name}`;
    unlockInput.value = "";
    unlockMessage.textContent = "";
    unlockMessage.classList.remove("error-text");
    unlockModal.classList.remove("hidden");
    syncBodyLock();
    unlockInput.focus();
  }
  function closeUnlock() {
    unlockTarget = null;
    unlockModal.classList.add("hidden");
    syncBodyLock();
  }
  unlockCancel.addEventListener("click", closeUnlock);
  unlockModal.addEventListener("click", e => { if (e.target === unlockModal) closeUnlock(); });
  unlockForm.addEventListener("submit", async e => {
    e.preventDefault();
    const name = unlockTarget;
    if (!name) return;
    unlockSubmit.disabled = true;
    unlockMessage.classList.remove("error-text");
    unlockMessage.textContent = "Comprobando…";
    try {
      await ensureSession();
      const { data, error } = await client.rpc("unlock_album", { p_event: name, p_password: unlockInput.value });
      if (error) throw error;
      if (!data) {
        unlockMessage.textContent = "Contraseña incorrecta.";
        unlockMessage.classList.add("error-text");
        unlockInput.select();
        return;
      }
      unlocked.add(name);
      await loadPhotos();
      closeUnlock();
      showAlbum(name);
    } catch (err) {
      unlockMessage.textContent = unlockErrorText(err);
      unlockMessage.classList.add("error-text");
    } finally {
      unlockSubmit.disabled = false;
    }
  });

  // ---------- Pintado ----------
  function showAlbum(name) {
    currentEvent = name;
    search.value = "";
    render();
    document.getElementById("galerias").scrollIntoView({behavior:"smooth"});
  }
  async function renderAlbums(q, token) {
    const groups = new Map();
    allPhotos.filter(p => matches(p, q)).forEach(p => {
      const k = evName(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    try { await signPhotos([...groups.values()].map(a => a[0]).filter(isPriv)); }
    catch (e) { console.error(e); }
    if (token !== renderToken) return;

    albumGrid.innerHTML = "";
    [...groups.entries()].forEach(([name, photos]) => {
      const cover = photos[0];
      const card = document.createElement("button");
      card.type = "button"; card.className = "album-card";
      card.setAttribute("aria-label", `Abrir galería ${name}`);
      const wrap = document.createElement("span"); wrap.className = "album-cover";
      const img = document.createElement("img"); img.src = imgUrl(cover); img.alt = `Portada de ${name}`; img.loading = "lazy";
      const cnt = document.createElement("span"); cnt.className = "album-count";
      cnt.textContent = `${photos.length} ${photos.length === 1 ? "foto" : "fotos"}${isPriv(cover) ? " · 🔓 privada" : ""}`;
      wrap.append(img, cnt);
      const info = document.createElement("span"); info.className = "album-info";
      const h = document.createElement("h3"); h.textContent = name;
      const sm = document.createElement("small"); sm.textContent = formatDate(cover.created_at);
      info.append(h, sm);
      card.append(wrap, info);
      card.addEventListener("click", () => showAlbum(name));
      albumGrid.append(card);
    });

    const locked = privateAlbums.filter(a =>
      !unlocked.has(a.event_name) && !groups.has(a.event_name) &&
      (!q || a.event_name.toLocaleLowerCase("es").includes(q)));
    locked.forEach(a => {
      const card = document.createElement("button");
      card.type = "button"; card.className = "album-card album-locked";
      card.setAttribute("aria-label", `Abrir galería privada ${a.event_name}`);
      const wrap = document.createElement("span"); wrap.className = "album-cover album-cover-locked";
      const lock = document.createElement("span"); lock.className = "album-lock"; lock.textContent = "🔒";
      const cnt = document.createElement("span"); cnt.className = "album-count";
      cnt.textContent = `${a.photo_count} ${Number(a.photo_count) === 1 ? "foto" : "fotos"}`;
      wrap.append(lock, cnt);
      const info = document.createElement("span"); info.className = "album-info";
      const h = document.createElement("h3"); h.textContent = a.event_name;
      const sm = document.createElement("small"); sm.textContent = "Galería privada · requiere contraseña";
      info.append(h, sm);
      card.append(wrap, info);
      card.addEventListener("click", () => openUnlock(a.event_name));
      albumGrid.append(card);
    });

    const total = groups.size + locked.length;
    count.textContent = `${total} ${total === 1 ? "galería" : "galerías"}`;
    empty.classList.toggle("hidden", total > 0);
  }
  async function render() {
    const token = ++renderToken;
    const q = search.value.trim().toLocaleLowerCase("es");
    const inAlbum = currentEvent !== null;
    albumGrid.classList.toggle("hidden", inAlbum);
    grid.classList.toggle("hidden", !inAlbum);
    backBtn.classList.toggle("hidden", !inAlbum);
    if (!inAlbum) { downloadAllBtn.classList.add("hidden"); zipMsg(""); }
    galleryTitle.firstChild.textContent = inAlbum ? currentEvent : "Galerías";
    if (!inAlbum) { visiblePhotos = []; await renderAlbums(q, token); return; }

    visiblePhotos = allPhotos.filter(p => evName(p) === currentEvent && matches(p, q));
    try { await signPhotos(visiblePhotos); }
    catch (e) { say("No se pudieron preparar las fotografías privadas: " + (e.message || "error"), true); }
    if (token !== renderToken) return;

    grid.innerHTML = "";
    count.textContent = `${visiblePhotos.length} ${visiblePhotos.length === 1 ? "fotografía" : "fotografías"}`;
    downloadAllBtn.textContent = `Descargar todas (${visiblePhotos.length}) ↓`;
    downloadAllBtn.classList.toggle("hidden", !visiblePhotos.length);
    visiblePhotos.forEach((p, i) => {
      const card = document.createElement("article");
      card.className = "photo-card";
      const open = document.createElement("button");
      open.className = "photo-open";
      open.type = "button";
      open.setAttribute("aria-label", `Abrir ${p.title || "fotografía"}`);
      const img = document.createElement("img");
      img.src = imgUrl(p); img.alt = p.title || "Fotografía de Repullés Muñoz"; img.loading = "lazy";
      img.onerror = () => { img.alt = "No se pudo cargar esta imagen"; };
      const overlay = document.createElement("span"); overlay.className = "photo-hover"; overlay.textContent = "Ver fotografía ↗";
      open.append(img, overlay);
      open.addEventListener("click", () => openLightbox(i));
      const info = document.createElement("div"); info.className = "photo-info";
      const meta = document.createElement("div"); meta.className = "photo-meta";
      const event = document.createElement("span"); event.className = "photo-event"; event.textContent = p.event_name || "Galería";
      const date = document.createElement("span"); date.className = "photo-date"; date.textContent = formatDate(p.created_at);
      meta.append(event, date);
      const title = document.createElement("h3"); title.textContent = p.title || "Fotografía sin título";
      const bottom = document.createElement("div"); bottom.className = "photo-bottom";
      const dorsal = document.createElement("span"); dorsal.className = "photo-dorsal"; dorsal.textContent = p.dorsal ? `# ${p.dorsal}` : "";
      const dl = document.createElement("button"); dl.type = "button"; dl.className = "download-link";
      dl.textContent = "Descargar ↓"; dl.setAttribute("aria-label", "Descargar fotografía original");
      dl.addEventListener("click", e => { e.stopPropagation(); askDownload(p); });
      bottom.append(dorsal, dl); info.append(meta, title, bottom); card.append(open, info); grid.append(card);
    });
    empty.classList.toggle("hidden", visiblePhotos.length > 0);
  }
  async function openLightbox(i) {
    currentIndex = i;
    const p = visiblePhotos[currentIndex];
    if (!p) return;
    try { await signPhotos([p]); } catch (e) { console.error(e); }
    document.getElementById("lightboxImage").src = imgUrl(p);
    document.getElementById("lightboxImage").alt = p.title || "Fotografía";
    document.getElementById("lightboxEvent").textContent = p.event_name || "GALERÍA";
    document.getElementById("lightboxTitle").textContent = p.title || "Fotografía sin título";
    document.getElementById("lightboxDorsal").textContent = p.dorsal ? `Dorsal / equipo: ${p.dorsal}` : "";
    lightbox.classList.remove("hidden");
    syncBodyLock();
  }
  function closeLightbox() { lightbox.classList.add("hidden"); syncBodyLock(); }
  function step(n) { if (visiblePhotos.length) openLightbox((currentIndex + n + visiblePhotos.length) % visiblePhotos.length); }
  const modalOpen = () => !copyrightModal.classList.contains("hidden") || !unlockModal.classList.contains("hidden");

  document.getElementById("lightboxDownload").addEventListener("click", e => {
    e.preventDefault();
    const p = visiblePhotos[currentIndex];
    if (p) askDownload(p);
  });
  document.getElementById("closeLightbox").addEventListener("click", closeLightbox);
  document.getElementById("prevPhoto").addEventListener("click", () => step(-1));
  document.getElementById("nextPhoto").addEventListener("click", () => step(1));
  lightbox.addEventListener("click", e => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!copyrightModal.classList.contains("hidden")) closeCopyright();
      else if (!unlockModal.classList.contains("hidden")) closeUnlock();
      else closeLightbox();
      return;
    }
    if (modalOpen() || lightbox.classList.contains("hidden")) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  search.addEventListener("input", render);
  backBtn.addEventListener("click", () => { currentEvent = null; search.value = ""; render(); });

  // ---------- Datos ----------
  async function loadPhotos() {
    let res = await client.from("photos").select(COLS).order("created_at", {ascending:false});
    if (res.error && /bucket/i.test(res.error.message || "")) {
      // La base de datos todavía no tiene los álbumes privados (falta ejecutar private_albums.sql).
      res = await client.from("photos").select(COLS_LEGACY).order("created_at", {ascending:false});
    }
    if (res.error) throw res.error;
    allPhotos = res.data || [];
    allPhotos.filter(isPriv).forEach(p => unlocked.add(evName(p)));
  }
  async function loadSettings() {
    try {
      const { data, error } = await client.from("album_settings").select("event_name,show_copyright");
      if (error) return; // si falta el SQL, se mantiene el aviso siempre activado
      copyrightOff.clear();
      (data || []).forEach(s => { if (s.show_copyright === false) copyrightOff.add(s.event_name); });
    } catch (e) { console.error(e); }
  }
  async function loadPrivateAlbums() {
    try {
      const { data, error } = await client.rpc("list_private_albums");
      if (!error) privateAlbums = data || [];
    } catch (e) { console.error(e); }
  }

  async function init() {
    if (!window.supabase || !configReady()) {
      say("Falta configurar Supabase. Abre config.js y añade la URL y la clave pública de tu proyecto.", true);
      empty.classList.remove("hidden"); return;
    }
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
    try {
      await loadPhotos();
      await loadPrivateAlbums();
      await loadSettings();
      status.classList.add("hidden");
      render();
    } catch (e) {
      say("No se pudo cargar la galería. Comprueba que has ejecutado el SQL y configurado las claves. Detalle: " + (e.message || "error desconocido"), true);
    }
  }
  init();
})();
