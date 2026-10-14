# David.fototrl — Galería fotográfica

Galería web estática con:
- Galería pública sin registro.
- Descarga individual del archivo original.
- Búsqueda por título, evento y dorsal/equipo.
- Panel privado para subir y eliminar fotografías.
- Supabase Auth, base de datos PostgreSQL y Storage.
- Publicación estática gratuita mediante GitHub Pages.

## Archivos
- `index.html`: web pública.
- `admin.html`: panel privado.
- `gallery.js`, `admin.js`: funcionalidad.
- `styles.css`: diseño adaptable.
- `config.js`: URL y clave pública de Supabase.
- `schema.sql`: base de datos, permisos y bucket.
- `authorize_admin.sql`: autorizar la cuenta de fotógrafo.

## 1. Crear Supabase
1. Entra en https://supabase.com/ y crea un proyecto.
2. Abre **SQL Editor**.
3. Copia todo `schema.sql`, pégalo y pulsa **Run**.
4. Ve a **Project Settings → API** (la interfaz puede mostrarlo como API Keys).
5. Copia la **Project URL** y la **publishable key**. Si el panel muestra la clave `anon` legacy, también sirve para este cliente público.
6. Abre `config.js` y sustituye:
   - `https://TU-PROYECTO.supabase.co` por la URL real.
   - `PEGA_AQUI_TU_PUBLISHABLE_KEY` por la clave pública.
   Guarda el archivo.

**Nunca uses una `service_role` key ni una secret key en `config.js` ni en el navegador.** La publishable/anon key está pensada para clientes públicos; la seguridad depende de las políticas RLS de `schema.sql`.

## 2. Crear tu cuenta de fotógrafo
1. En Supabase, abre **Authentication → Users**.
2. Pulsa **Add user / Create new user**.
3. Escribe tu correo y establece una contraseña segura. No habilites registro público.
4. Copia el UUID/ID de ese usuario.
5. Abre `authorize_admin.sql`; sustituye `PEGA-AQUI-EL-UUID` por el UUID real (mantén las comillas simples).
6. Ejecuta esa consulta en **SQL Editor**.

Si no autorizas la cuenta, no podrás entrar al panel aunque el usuario exista.

## 3. Probar la web antes de publicarla
Abre `index.html` en el navegador después de configurar `config.js`. Algunos navegadores pueden limitar funciones cuando abres archivos directamente; si sucede, utiliza la vista previa de un editor local o publica el proyecto siguiendo el paso 4.

Abre `admin.html`, inicia sesión y sube una imagen de prueba. Luego vuelve a la galería pública y comprueba que aparece y que el botón descarga el archivo.

## 4. Publicar gratis con GitHub Pages
1. Entra en https://github.com/ y crea una cuenta si todavía no tienes una.
2. Crea un repositorio nuevo llamado `davidfototrl-galeria`.
3. Para que la web sea pública, selecciona **Public**.
4. Sube los archivos del proyecto a la raíz del repositorio: `index.html`, `admin.html`, `styles.css`, `gallery.js`, `admin.js` y `config.js`. No subas contraseñas ni claves secretas.
5. En el repositorio abre **Settings → Pages**.
6. En **Build and deployment**, selecciona **Deploy from a branch**, elige `main` y la carpeta `/ (root)`, y pulsa **Save**.
7. Espera a que GitHub Pages termine la publicación. La dirección aparecerá en esa misma sección, normalmente con formato `https://TUUSUARIO.github.io/davidfototrl-galeria/`.

La galería y el panel se publican en la misma web:
- Público: `https://TUUSUARIO.github.io/davidfototrl-galeria/`
- Panel: `https://TUUSUARIO.github.io/davidfototrl-galeria/admin.html`

## 5. Uso normal
1. Abre `admin.html`.
2. Inicia sesión.
3. Elige una o varias fotografías.
4. Escribe el nombre del evento y, si quieres, dorsal/equipo y título.
5. Pulsa **Subir fotografías**.
6. Comparte el enlace público.

Para borrar una foto, usa el botón **Eliminar** del panel. La operación elimina el archivo de Storage y su registro.

## Límites y privacidad
- El proyecto está configurado para imágenes JPEG, PNG, WebP y AVIF de hasta 50 MB cada una. Puedes ajustar el límite en `schema.sql` y en el bucket de Supabase.
- Las imágenes del bucket son públicas: cualquiera que tenga el enlace directo puede verlas y descargarlas. No subas fotos que deban ser privadas.
- La cuota gratuita de almacenamiento, transferencia y base de datos depende del plan vigente de Supabase; revisa el panel de uso para evitar sorpresas. Una galería de fotos de cámara puede consumir mucho almacenamiento.
- Las fotografías se guardan sin recomprimir. La web las muestra en miniaturas mediante CSS, pero la descarga enlaza al archivo original.
- El archivo `config.js` contiene solo la URL y clave pública. Nunca pegues una contraseña, `service_role` key o secret key en ningún archivo público.
- La fotografía de portada es una imagen de referencia remota de Unsplash. Puedes cambiarla en `styles.css` por una foto tuya; para máxima independencia, usa una foto propia subida a tu galería o a un alojamiento con licencia adecuada.
- Antes de publicar fotos de personas identificables, asegúrate de tener permiso para publicarlas cuando sea necesario.

## Solución de problemas
- **“Falta configurar Supabase”**: revisa `config.js`, guarda y vuelve a subir el archivo a GitHub.
- **La galería no carga**: confirma que `schema.sql` se ejecutó sin errores y que la tabla `photos` está disponible.
- **No puedo iniciar sesión**: revisa usuario/contraseña y confirma que su UUID está en `gallery_admins`.
- **No puedo subir fotos**: comprueba que el usuario está autorizado y que el archivo cumple tipo y tamaño admitidos.
- **No aparece una foto**: revisa los mensajes del panel y recarga la galería.

## Tecnologías
HTML, CSS, JavaScript, Supabase JS v2, Supabase Auth, PostgreSQL RLS, Supabase Storage y GitHub Pages.
