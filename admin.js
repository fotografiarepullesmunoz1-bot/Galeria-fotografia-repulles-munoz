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
  let client = null, currentUser = null;
  const BUCKET = "photos";
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  function ready() {
    return cfg.SUPABASE_URL && cfg.SUPABASE_KEY &&
      !cfg.SUPABASE_URL.includes("TU-PROYECTO") &&
      !cfg.SUPABASE_KEY.includes("PEGA_AQUI");
  }
  function message(el, text, bad=false) { el.textContent=text; el.classList.toggle("error-text",bad); }
  function clean(s) { return String(s || "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim().slice(0,140); }
  function slug(s) {
    return String(s || "foto").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70) || "foto";
  }
  function ext(file) {
    const m = (file.name.match(/\.([a-z0-9]+)$/i) || [,"jpg"])[1].toLowerCase();
    return ["jpg","jpeg","png","webp","avif"].includes(m) ? m : "jpg";
  }
  async function isAdmin(user) {
    const { data, error } = await client.from("gallery_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return !!data;
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
    const {data,error}=await client.from("photos").select("id,title,event_name,dorsal,storage_path,created_at").order("created_at",{ascending:false});
    if(error){message(adminStatus,"Error al cargar: "+error.message,true);return;}
    count.textContent = `${data.length} publicadas`;
    if (!data.length) { message(adminStatus,"Todavía no has publicado fotografías."); return; }
    message(adminStatus,"");
    data.forEach(p => {
      const row=document.createElement("div"); row.className="admin-photo-row";
      const {data:publicData}=client.storage.from(BUCKET).getPublicUrl(p.storage_path);
      const img=document.createElement("img"); img.src=publicData.publicUrl; img.alt="";
      const details=document.createElement("div"); details.className="admin-photo-details";
      const title=document.createElement("strong"); title.textContent=p.title || "Sin título";
      const meta=document.createElement("span"); meta.textContent=[p.event_name,p.dorsal].filter(Boolean).join(" · ");
      details.append(title,meta);
      const del=document.createElement("button"); del.className="button button-danger"; del.textContent="Eliminar"; del.type="button";
      del.addEventListener("click",async()=>{
        if(!confirm(`¿Eliminar "${p.title || "esta fotografía"}" de la galería? Esta acción no se puede deshacer.`)) return;
        del.disabled=true; del.textContent="Eliminando…";
        const {error:storageError}=await client.storage.from(BUCKET).remove([p.storage_path]);
        if(storageError){message(adminStatus,"No se pudo eliminar el archivo: "+storageError.message,true);del.disabled=false;del.textContent="Eliminar";return;}
        const {error:dbError}=await client.from("photos").delete().eq("id",p.id);
        if(dbError){message(adminStatus,"Se borró el archivo, pero no el registro. Contacta con soporte técnico: "+dbError.message,true);return;}
        await loadPhotos();
      });
      row.append(img,details,del); list.append(row);
    });
  }

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
    if(!files.length){message(uploadProgress,"Selecciona al menos una fotografía.",true);return;}
    if(!eventName){message(uploadProgress,"Escribe el nombre del evento.",true);return;}
    if(files.some(f=>!f.type.startsWith("image/") || !["image/jpeg","image/png","image/webp","image/avif"].includes(f.type))){message(uploadProgress,"Solo se admiten imágenes JPEG, PNG, WebP o AVIF.",true);return;}
    if(files.some(f=>f.size>MAX_FILE_SIZE)){message(uploadProgress,"Algún archivo supera 50 MB. Reduce su tamaño o cambia el límite del bucket.",true);return;}
    const submit=uploadForm.querySelector('button[type="submit"]'); submit.disabled=true;
    let done=0, errors=[];
    for(const file of files){
      message(uploadProgress,`Subiendo ${done+1} de ${files.length}: ${file.name}`);
      const path=`${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${slug(file.name.replace(/\.[^.]+$/,""))}.${ext(file)}`;
      const {error:upErr}=await client.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false,cacheControl:"3600"});
      if(upErr){errors.push(`${file.name}: ${upErr.message}`);continue;}
      const title=sharedTitle || file.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ");
      const {error:dbErr}=await client.from("photos").insert({title,event_name:eventName,dorsal:dorsal || null,storage_path:path,uploaded_by:currentUser.id});
      if(dbErr){await client.storage.from(BUCKET).remove([path]);errors.push(`${file.name}: ${dbErr.message}`);continue;}
      done++;
    }
    submit.disabled=false;
    message(uploadProgress,`Listo: ${done} de ${files.length} fotografía(s) publicada(s).${errors.length ? " Errores: "+errors.join(" | ") : ""}`,errors.length>0);
    uploadForm.reset(); await loadPhotos();
  });

  document.getElementById("logoutBtn").addEventListener("click",async()=>{await client.auth.signOut();await showSession(null);});
  async function init(){
    if(!window.supabase || !ready()){message(loginMessage,"Configura primero config.js con la URL y la clave pública de Supabase.",true);loginForm.querySelector("button").disabled=true;return;}
    client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_KEY);
    const {data}=await client.auth.getSession();
    if(data.session) await showSession(data.session.user);
  }
  init();
})();