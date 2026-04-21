// ---------------------------------------------------------------------------
// supabase-client.js
// Shared Supabase client + auth helpers used by every page.
// Load AFTER config.js and AFTER the supabase-js CDN script.
// ---------------------------------------------------------------------------

(function () {
  const cfg = window.MUSEUM_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    console.warn(
      "[museum] config.js is not filled in — login/upload will fail. " +
        "Open config.js and paste your Supabase URL + anon key."
    );
  }

  // `supabase` here is the global exposed by the CDN bundle.
  const client = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "museum-auth",
      },
    }
  );

  // ---------- Auth helpers -------------------------------------------------
  async function signUp(email, password) {
    return client.auth.signUp({ email, password });
  }

  async function signIn(email, password) {
    return client.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    await client.auth.signOut();
    window.location.href = "homepage-2.html";
  }

  async function getUser() {
    const { data } = await client.auth.getUser();
    return data.user || null;
  }

  // Redirects to login if the user isn't signed in. Use on protected pages.
  async function requireAuth() {
    const user = await getUser();
    if (!user) {
      window.location.href = "login-page.html";
      return null;
    }
    return user;
  }

  // ---------- Storage helpers ---------------------------------------------
  // Create a signed URL to display a private image in an <img> tag.
  async function signedImageUrl(path, expiresInSec = 3600) {
    const { data, error } = await client.storage
      .from("artworks")
      .createSignedUrl(path, expiresInSec);
    if (error) throw error;
    return data.signedUrl;
  }

  // Upload a file into the user's own folder, return the storage path.
  async function uploadArtworkFile(file, userId) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage
      .from("artworks")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }

  // ---------- Edge function helper ----------------------------------------
  async function recognizeArtwork(artworkId) {
    const { data, error } = await client.functions.invoke("recognize-artwork", {
      body: { artwork_id: artworkId },
    });
    if (error) throw error;
    return data;
  }

  // Expose a tiny, opinionated API on window.museum
  window.museum = {
    client,
    signUp,
    signIn,
    signOut,
    getUser,
    requireAuth,
    signedImageUrl,
    uploadArtworkFile,
    recognizeArtwork,
  };
})();
