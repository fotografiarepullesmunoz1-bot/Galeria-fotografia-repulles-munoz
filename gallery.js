(() => {
  const cfg = window.GALLERY_CONFIG || {};
  const status = document.getElementById("status");
  const grid = document.getElementById("photoGrid");
  const empty = document.getElementById("emptyState");
  const search = document.getElementById("searchInput");
  const albumGrid = document.getElementById("albumGrid");
  const backBtn = document.getElementById("backBtn");
  const galleryTitle = document.getElementById("galleryTitle");
  const count = document.getElementById("photoCount");
  const lightbox = document.getElementById("lightbox");
  let client = null, allPhotos = [], visiblePhotos = [], currentIndex = 0, currentEvent = null;
  const NO_EVENT = "Sin evento";
  const evName = p => p.event_name || NO_EVENT;

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
  function downloadUrl(photo) {
    const { data } = client.storage.from("photos").getPublicUrl(photo.storage_path);
    const url = new URL(data.publicUrl);
    const extension = (photo.storage_path.match(/\.[^.\/]+$/) || [".jpg"])[0];
    url.searchParams.set("download", safeFilename(photo.title || "fotografia") + extension);
    return url.toString();
  }
  function safeFilename(s) {
    return String(s || "fotografia").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim().slice(0,100) || "fotografia";
  }
  function formatDate(value) {
    try { return new Date(value).toLocaleDateString("es-ES", {day:"2-digit", month:"short", year:"numeric"}); }
    catch { return ""; }
  }
  function matches(p, q) {
    const hay = [p.title, p.event_name, p.dorsal, p.description].filter(Boolean).join(" ").toLocaleLowerCase("es");
    return !q || hay.includes(q);
  }
  function pubUrl(p) { return client.storage.from("photos").getPublicUrl(p.storage_path).data.publicUrl; }
  function showAlbum(name) {
    currentEvent = name;
    search.value = "";
    render();
    document.getElementById("galerias").scrollIntoView({behavior:"smooth"});
  }
  function renderAlbums(q) {
    const groups = new Map();
    allPhotos.filter(p => matches(p, q)).forEach(p => {
      const k = evName(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    albumGrid.innerHTML = "";
    [...groups.entries()].forEach(([name, photos]) => {
      const cover = photos[0];
      const card = document.createElement("button");
      card.type = "button"; card.className = "album-card";
      card.setAttribute("aria-label", `Abrir galería ${name}`);
      const wrap = document.createElement("span"); wrap.className = "album-cover";
      const img = document.createElement("img"); img.src = pubUrl(cover); img.alt = `Portada de ${name}`; img.loading = "lazy";
      const cnt = document.createElement("span"); cnt.className = "album-count"; cnt.textContent = `${photos.length} ${photos.length === 1 ? "foto" : "fotos"}`;
      wrap.append(img, cnt);
      const info = document.createElement("span"); info.className = "album-info";
      const h = document.createElement("h3"); h.textContent = name;
      const sm = document.createElement("small"); sm.textContent = formatDate(cover.created_at);
      info.append(h, sm);
      card.append(wrap, info);
      card.addEventListener("click", () => showAlbum(name));
      albumGrid.append(card);
    });
    count.textContent = `${groups.size} ${groups.size === 1 ? "galería" : "galerías"}`;
    empty.classList.toggle("hidden", groups.size > 0);
  }
  function render() {
    const q = search.value.trim().toLocaleLowerCase("es");
    const inAlbum = currentEvent !== null;
    albumGrid.classList.toggle("hidden", inAlbum);
    grid.classList.toggle("hidden", !inAlbum);
    backBtn.classList.toggle("hidden", !inAlbum);
    galleryTitle.firstChild.textContent = inAlbum ? currentEvent : "Galerías";
    if (!inAlbum) { visiblePhotos = []; renderAlbums(q); return; }
    visiblePhotos = allPhotos.filter(p => evName(p) === currentEvent && matches(p, q));
    grid.innerHTML = "";
    count.textContent = `${visiblePhotos.length} ${visiblePhotos.length === 1 ? "fotografía" : "fotografías"}`;
    visiblePhotos.forEach((p, i) => {
      const { data } = client.storage.from("photos").getPublicUrl(p.storage_path);
      const card = document.createElement("article");
      card.className = "photo-card";
      const open = document.createElement("button");
      open.className = "photo-open";
      open.type = "button";
      open.setAttribute("aria-label", `Abrir ${p.title || "fotografía"}`);
      const img = document.createElement("img");
      img.src = data.publicUrl; img.alt = p.title || "Fotografía de Repullés Muñoz"; img.loading = "lazy";
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
      const dl = document.createElement("a"); dl.className = "download-link"; dl.href = downloadUrl(p); dl.textContent = "Descargar ↓"; dl.setAttribute("aria-label", "Descargar fotografía original"); dl.addEventListener("click", e => e.stopPropagation());
      bottom.append(dorsal, dl); info.append(meta, title, bottom); card.append(open, info); grid.append(card);
    });
    empty.classList.toggle("hidden", visiblePhotos.length > 0);
  }
  function openLightbox(i) {
    currentIndex = i;
    const p = visiblePhotos[currentIndex];
    const { data } = client.storage.from("photos").getPublicUrl(p.storage_path);
    document.getElementById("lightboxImage").src = data.publicUrl;
    document.getElementById("lightboxImage").alt = p.title || "Fotografía";
    document.getElementById("lightboxEvent").textContent = p.event_name || "GALERÍA";
    document.getElementById("lightboxTitle").textContent = p.title || "Fotografía sin título";
    document.getElementById("lightboxDorsal").textContent = p.dorsal ? `Dorsal / equipo: ${p.dorsal}` : "";
    const dl = document.getElementById("lightboxDownload");
    dl.href = downloadUrl(p);
    lightbox.classList.remove("hidden"); document.body.classList.add("modal-open");
  }
  function closeLightbox() { lightbox.classList.add("hidden"); document.body.classList.remove("modal-open"); }
  function step(n) { if (visiblePhotos.length) openLightbox((currentIndex + n + visiblePhotos.length) % visiblePhotos.length); }
  document.getElementById("closeLightbox").addEventListener("click", closeLightbox);
  document.getElementById("prevPhoto").addEventListener("click", () => step(-1));
  document.getElementById("nextPhoto").addEventListener("click", () => step(1));
  lightbox.addEventListener("click", e => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeLightbox(); if (!lightbox.classList.contains("hidden") && e.key === "ArrowLeft") step(-1); if (!lightbox.classList.contains("hidden") && e.key === "ArrowRight") step(1); });
  search.addEventListener("input", render);
  backBtn.addEventListener("click", () => { currentEvent = null; search.value = ""; render(); });

  async function init() {
    if (!window.supabase || !configReady()) {
      say("Falta configurar Supabase. Abre config.js y añade la URL y la clave pública de tu proyecto.", true);
      empty.classList.remove("hidden"); return;
    }
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
    try {
      const { data, error } = await client.from("photos").select("id,title,event_name,dorsal,description,storage_path,created_at").order("created_at", {ascending:false});
      if (error) throw error;
      allPhotos = data || [];
      status.classList.add("hidden");
      render();
    } catch (e) {
      say("No se pudo cargar la galería. Comprueba que has ejecutado el SQL y configurado las claves. Detalle: " + (e.message || "error desconocido"), true);
    }
  }
  init();
})();