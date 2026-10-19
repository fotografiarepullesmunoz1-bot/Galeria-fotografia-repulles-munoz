(() => {
  const cfg = window.GALLERY_CONFIG || {};
  const loginPanel = document.getElementById("loginPanel");
  const dashboard = document.getElementById("dashboard");
  const loginForm = document.getElementById("loginForm");
  const loginMessage = document.getElementById("loginMessage");
  const uploadForm = document.getElementById("uploadForm");
  const uploadProgress = document.getElementById("uploadProgress");
  const adminStatus = document.getElementById("adminStatus");
  const list = document.getElementById("adminPhotoList");
  const count = document.getElementById("adminPhotoCount");
  const isPrivateEl = document.getElementById("isPrivate");
  const passwordField = document.getElementById("passwordField");
  const albumPasswordEl = document.getElementById("albumPassword");
  const protectForm = document.getElementById("protectForm");
  const protectMessage = document.getElementById("protectMessage");
  const eventOptions = document.getElementById("eventOptions");
  const pendingBox = document.getElementById("pendingBox");
  const pendingText = document.getElementById("pendingText");
  const pendingBtn = document.getElementById("pendingBtn");
  const pendingProgress = document.getElementById("pendingProgress");
  let client = null, currentUser = null, pendingPhotos = [];
  const BUCKET = "photos";
  const PRIVATE_BUCKET = "private-photos";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const MISSING_SQL = "Falta ejecutar private_albums.sql en Supabase.";

  function ready() {
    return cfg.SUPABASE_URL && cfg.SUPABASE_KEY &&
      !cfg.SUPABASE_URL.includes("TU-PROYECTO") &&
      !cfg.SUPABASE_KEY.includes("PEGA_AQUI");
  }
  function message(el, text, bad=false) { el.textContent=text; el.classList.toggle("error-text",bad); }
  function clean(s) { return String(s || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim().slice(0,140); }
  function slug(s) {
    return String(s || "foto").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70) || "foto";
  }
  function ext(file) {
    const m = (file.name.match(/\.([a-z0-9]+)$/i) || [,"jpg"])[1].toLowerCase();
    return ["jpg","jpeg","png","webp","avif"].includes(m) ? m : "jpg";
  }
  const bucketOf = p => p.bucket || BUCKET;
  function rpcMissing(error) {
    return error && (error.code === "PGRST202" || /could not find the function/i.test(error.message || ""));
  }

  async function isAdmin(user) {
    const { data, error } = await client.from("gallery_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return !!data;
  }
  async function fetchPrivateSet() {
    const { data, error } = await client.rpc("list_private_albums");
    if (error) return { ok: false, set: new Set(), error };
    return { ok: true, set: new Set((data || []).map(a => a.event_name)) };
  }
  async function showSession(user) {
    if (!user) { currentUser=null; dashboard.classList.add("hidden"); loginPanel.classList.remove("hidden"); return; }
    try {
      if (!await isAdmin(user)) {
        await client.auth.signOut();
        message(loginMessage, "Esta cuenta no tiene permisos de fotógrafo. Pide que se autorice su usuario en Supabase.", true);
        return;
      }
      currentUser=user; loginPanel.classList.add("hidden"); dashboard.classList.remove("hidden");
      await loadPhotos();
    } catch (e) {
      message(loginMessage, "No se pudo comprobar el acceso: " + (e.message || "error"), true);
    }
  }

  async function loadPhotos() {
    list.innerHTML = "";
    message(adminStatus, "Cargando fotografías…");
    let res = await client.from("photos").select("id,title,event_name,dorsal,storage_path,bucket,created_at").order("created_at",{ascending:false});
    if (res.error && /bucket/i.test(res.error.message || "")) {
      res = await client.from("photos").select("id,title,event_name,dorsal,storage_path,created_at").order("created_at",{ascending:false});
    }
    const {data,error}=res;
    if(error){message(adminStatus,"Error al cargar: "+error.message,true);return;}
    const priv = await fetchPrivateSet();

    // Enlaces temporales para las miniaturas privadas.
    const signedMap = new Map();
    const privPaths = data.filter(p => bucketOf(p) === PRIVATE_BUCKET).map(p => p.storage_path);
    for (let i = 0; i < privPaths.length; i += 100) {
      const { data: s } = await client.storage.from(PRIVATE_BUCKET).createSignedUrls(privPaths.slice(i, i + 100), 3600);
      (s || []).forEach(x => { if (x.signedUrl) signedMap.set(x.path, x.signedUrl); });
    }

    // Eventos públicos (para sugerirlos al proteger) y fotos pendientes de mover.
    const publicEvents = [...new Set(data.filter(p => bucketOf(p) === BUCKET && !priv.set.has(p.event_name)).map(p => p.event_name))];
    eventOptions.innerHTML = "";
    publicEvents.forEach(n => { const o = document.createElement("option"); o.value = n; eventOptions.append(o); });
    pendingPhotos = data.filter(p => bucketOf(p) === BUCKET && priv.set.has(p.event_name));
    pendingBox.classList.toggle("hidden", pendingPhotos.length === 0);
    if (pendingPhotos.length) {
      const names = [...new Set(pendingPhotos.map(p => p.event_name))].join(", ");
      pendingText.textContent = `${pendingPhotos.length} foto(s) de «${names}» siguen en la zona pública. Ya no aparecen en la galería, pero sus archivos aún se pueden abrir con el enlace directo. Muévelas a la zona privada para protegerlas del todo.`;
    }

    count.textContent = `${data.length} publicadas`;
    if (!data.length) { message(adminStatus,"Todavía no has publicado fotografías."); return; }
    message(adminStatus,"");
    data.forEach(p => {
      const row=document.createElement("div"); row.className="admin-photo-row";
      const isPriv = bucketOf(p) === PRIVATE_BUCKET;
      const img=document.createElement("img");
      img.src = isPriv ? (signedMap.get(p.storage_path) || "") : client.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl;
      img.alt="";
      const details=document.createElement("div"); details.className="admin-photo-details";
      const title=document.createElement("strong"); title.textContent=p.title || "Sin título";
      const meta=document.createElement("span");
      meta.textContent=[isPriv ? "🔒 Privada" : (priv.set.has(p.event_name) ? "⚠ Por mover a privada" : ""),p.event_name,p.dorsal].filter(Boolean).join(" · ");
      details.append(title,meta);
      const del=document.createElement("button"); del.className="button button-danger"; del.textContent="Eliminar"; del.type="button";
      del.addEventListener("click",async()=>{
        if(!confirm(`¿Eliminar "${p.title || "esta fotografía"}" de la galería? Esta acción no se puede deshacer.`)) return;
        del.disabled=true; del.textContent="Eliminando…";
        const {error:storageError}=await client.storage.from(bucketOf(p)).remove([p.storage_path]);
        if(storageError){message(adminStatus,"No se pudo eliminar el archivo: "+storageError.message,true);del.disabled=false;del.textContent="Eliminar";return;}
        const {error:dbError}=await client.from("photos").delete().eq("id",p.id);
        if(dbError){message(adminStatus,"Se borró el archivo, pero no el registro. Contacta con soporte técnico: "+dbError.message,true);return;}
        await loadPhotos();
      });
      row.append(img,details,del); list.append(row);
    });
  }

  isPrivateEl.addEventListener("change", () => {
    passwordField.classList.toggle("hidden", !isPrivateEl.checked);
    if (!isPrivateEl.checked) albumPasswordEl.value = "";
  });

  loginForm.addEventListener("submit",async e=>{
    e.preventDefault(); message(loginMessage,"Comprobando acceso…");
    const {data,error}=await client.auth.signInWithPassword({email:document.getElementById("email").value.trim(),password:document.getElementById("password").value});
    if(error){message(loginMessage,"No se pudo iniciar sesión. Revisa el correo y la contraseña.",true);return;}
    await showSession(data.user);
  });

  uploadForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const files=Array.from(document.getElementById("photoFiles").files || []);
    const eventName=clean(document.getElementById("eventName").value);
    const dorsal=clean(document.getElementById("dorsal").value);
    const sharedTitle=clean(document.getElementById("photoTitle").value);
    const wantPrivate=isPrivateEl.checked;
    const password=albumPasswordEl.value;
    if(!files.length){message(uploadProgress,"Selecciona al menos una fotografía.",true);return;}
    if(!eventName){message(uploadProgress,"Escribe el nombre del evento.",true);return;}
    if(files.some(f=>!f.type.startsWith("image/") || !["image/jpeg","image/png","image/webp","image/avif"].includes(f.type))){message(uploadProgress,"Solo se admiten imágenes JPEG, PNG, WebP o AVIF.",true);return;}
    if(files.some(f=>f.size>MAX_FILE_SIZE)){message(uploadProgress,"Algún archivo supera 50 MB. Reduce su tamaño o cambia el límite del bucket.",true);return;}

    const submit=uploadForm.querySelector('button[type="submit"]'); submit.disabled=true;
    try {
      // Álbumes privados: comprobar y, si hace falta, crear/cambiar la contraseña.
      const priv = await fetchPrivateSet();
      if (!priv.ok && wantPrivate) { message(uploadProgress, rpcMissing(priv.error) ? MISSING_SQL : "No se pudo comprobar los álbumes privados: " + priv.error.message, true); return; }
      const alreadyPrivate = priv.set.has(eventName);
      if (!wantPrivate && alreadyPrivate) { message(uploadProgress,"Ese evento es un álbum privado. Marca «Álbum privado» para subir ahí las fotos.",true); return; }
      if (wantPrivate && !alreadyPrivate && password.length < 6) { message(uploadProgress,"Pon una contraseña de al menos 6 caracteres para el álbum privado.",true); return; }
      if (wantPrivate && password) {
        const { error: pwErr } = await client.rpc("set_album_password", { p_event: eventName, p_password: password });
        if (pwErr) { message(uploadProgress,"No se pudo guardar la contraseña: " + pwErr.message,true); return; }
      }
      const bucket = wantPrivate ? PRIVATE_BUCKET : BUCKET;

      let done=0, errors=[];
      for(const file of files){
        message(uploadProgress,`Subiendo ${done+1} de ${files.length}: ${file.name}`);
        const path=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${slug(file.name.replace(/\.[^.]+$/,""))}.${ext(file)}`;
        const {error:upErr}=await client.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false,cacheControl:"3600"});
        if(upErr){errors.push(`${file.name}: ${upErr.message}`);continue;}
        const title=sharedTitle || file.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ");
        const row={title,event_name:eventName,dorsal:dorsal || null,storage_path:path,uploaded_by:currentUser.id};
        if (wantPrivate) row.bucket = PRIVATE_BUCKET;
        const {error:dbErr}=await client.from("photos").insert(row);
        if(dbErr){await client.storage.from(bucket).remove([path]);errors.push(`${file.name}: ${dbErr.message}`);continue;}
        done++;
      }
      message(uploadProgress,`Listo: ${done} de ${files.length} fotografía(s) publicada(s)${wantPrivate ? " en el álbum privado" : ""}.${errors.length ? " Errores: "+errors.join(" | ") : ""}`,errors.length>0);
      uploadForm.reset(); passwordField.classList.add("hidden");
      await loadPhotos();
    } finally {
      submit.disabled=false;
    }
  });

  // Poner contraseña a un álbum que ya existe.
  protectForm.addEventListener("submit", async e => {
    e.preventDefault();
    const name = clean(document.getElementById("protectEvent").value);
    const pass = document.getElementById("protectPassword").value;
    if (!name) { message(protectMessage, "Escribe el nombre del evento.", true); return; }
    if (pass.length < 6) { message(protectMessage, "La contraseña debe tener al menos 6 caracteres.", true); return; }
    const btn = protectForm.querySelector('button[type="submit"]'); btn.disabled = true;
    try {
      const { error } = await client.rpc("set_album_password", { p_event: name, p_password: pass });
      if (error) { message(protectMessage, rpcMissing(error) ? MISSING_SQL : "No se pudo proteger el álbum: " + error.message, true); return; }
      protectForm.reset();
      message(protectMessage, `«${name}» ya es un álbum privado. Si tenía fotos públicas, muévelas a la zona privada con el botón de «Fotos por proteger».`);
      await loadPhotos();
    } finally { btn.disabled = false; }
  });

  // Mover los archivos públicos de un álbum ahora privado al bucket privado.
  pendingBtn.addEventListener("click", async () => {
    if (!pendingPhotos.length) return;
    pendingBtn.disabled = true;
    let done = 0; const errors = [];
    for (const p of pendingPhotos) {
      message(pendingProgress, `Moviendo ${done + errors.length + 1} de ${pendingPhotos.length}…`);
      const { error: mvErr } = await client.storage.from(BUCKET).move(p.storage_path, p.storage_path, { destinationBucket: PRIVATE_BUCKET });
      if (mvErr) { errors.push(`${p.title || p.storage_path}: ${mvErr.message}`); continue; }
      const { error: upErr } = await client.from("photos").update({ bucket: PRIVATE_BUCKET }).eq("id", p.id);
      if (upErr) {
        // Deshacer el movimiento para no dejar el archivo y su registro desincronizados.
        await client.storage.from(PRIVATE_BUCKET).move(p.storage_path, p.storage_path, { destinationBucket: BUCKET });
        errors.push(`${p.title || p.storage_path}: ${upErr.message}`);
        continue;
      }
      done++;
    }
    pendingBtn.disabled = false;
    message(pendingProgress, `Movidas ${done} de ${pendingPhotos.length}.${errors.length ? " Errores: " + errors.join(" | ") : ""}`, errors.length > 0);
    await loadPhotos();
  });

  document.getElementById("logoutBtn").addEventListener("click",async()=>{await client.auth.signOut();await showSession(null);});
  async function init(){
    if(!window.supabase || !ready()){message(loginMessage,"Configura primero config.js con la URL y la clave pública de Supabase.",true);loginForm.querySelector("button").disabled=true;return;}
    client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
    const {data}=await client.auth.getSession();
    // Una sesión anónima es la de un visitante que desbloqueó un álbum: no es del fotógrafo.
    if(data.session && !data.session.user.is_anonymous) await showSession(data.session.user);
  }
  init();
})();
