(() => {
  const $ = (id) => document.getElementById(id);
  const POLL_MS = 1500, HIDDEN_POLL_MS = 6000;

  // Anonymous identity — stored only in this browser.
  let uid = localStorage.getItem("rc_uid");
  if (!uid) {
    uid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("rc_uid", uid);
  }
  $("nick").value = localStorage.getItem("rc_nick") || "";

  let code = null, lastId = 0, seen = new Set(), timer = null, polling = false, failures = 0;

  const api = async (path, opts = {}) => {
    const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json" } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status });
    return data;
  };
  const nick = () => $("nick").value.trim();
  const fmtCode = (c) => c.slice(0, 4) + "-" + c.slice(4);
  const norm = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const homeErr = (m) => ($("homeErr").textContent = m || "");

  function requireNick() {
    if (!nick()) { homeErr("Pick a nickname first."); $("nick").focus(); return false; }
    localStorage.setItem("rc_nick", nick());
    return true;
  }

  $("createBtn").onclick = async () => {
    if (!requireNick()) return;
    $("createBtn").disabled = true; homeErr();
    try {
      const r = await api("/api/room", { method: "POST", body: JSON.stringify({ name: $("roomName").value }) });
      enterRoom(r.code);
    } catch (e) { homeErr(e.message); } finally { $("createBtn").disabled = false; }
  };
  $("joinBtn").onclick = () => { if (requireNick()) enterRoom(norm($("joinCode").value)); };
  $("joinCode").onkeydown = (e) => e.key === "Enter" && $("joinBtn").click();
  $("roomName").onkeydown = (e) => e.key === "Enter" && $("createBtn").click();

  async function enterRoom(c) {
    homeErr();
    if (!/^[A-Z2-9]{8}$/.test(c)) return homeErr("Room codes are 8 characters (letters and digits).");
    try {
      const info = await api(`/api/room?code=${c}`);
      code = c; lastId = 0; seen = new Set(); failures = 0;
      $("messages").innerHTML = "";
      $("roomTitle").textContent = info.title;
      $("codeBtn").textContent = fmtCode(c);
      document.title = `${info.title} · RoomChat`;
      history.replaceState(null, "", `/r/${c}`);
      $("home").classList.add("hidden"); $("chat").classList.remove("hidden");
      system(`You joined as “${nick()}”. Share code ${fmtCode(c)} to invite others.`);
      $("text").focus();
      poll();
    } catch (e) { homeErr(e.status === 404 ? "That room doesn't exist or has expired." : e.message); }
  }

  function leave() {
    clearTimeout(timer); code = null;
    history.replaceState(null, "", "/");
    document.title = "RoomChat — no sign-up chat rooms";
    $("chat").classList.add("hidden"); $("home").classList.remove("hidden");
  }
  $("leaveBtn").onclick = leave;

  $("codeBtn").onclick = async () => {
    const link = `${location.origin}/r/${code}`;
    try { await navigator.clipboard.writeText(link); toast("Invite link copied!"); }
    catch { prompt("Copy this invite link:", link); }
  };

  async function poll() {
    if (!code || polling) return;
    polling = true;
    const c = code;
    try {
      // Re-request a small overlap window so out-of-order writes are never missed; dedupe by id.
      const after = Math.max(0, lastId - 20);
      const r = await api(`/api/messages?code=${c}&after=${after}&uid=${uid}&name=${encodeURIComponent(nick())}`);
      if (c !== code) return;
      failures = 0;
      r.messages.forEach(render);
      $("online").textContent = r.online.length ? `● ${r.online.length} online: ${r.online.join(", ")}` : "";
    } catch (e) {
      if (e.status === 404) { system("This room has expired."); clearTimeout(timer); code = null; return; }
      if (++failures === 3) system("Connection problems — retrying…");
    } finally {
      polling = false;
      if (code === c) timer = setTimeout(poll, document.hidden ? HIDDEN_POLL_MS : POLL_MS * Math.min(1 + failures, 5));
    }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && code) { clearTimeout(timer); poll(); } });

  function render(m) {
    if (seen.has(m.id)) return;
    seen.add(m.id); lastId = Math.max(lastId, m.id);
    const box = $("messages");
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const el = document.createElement("div");
    el.className = "msg" + (m.uid === uid ? " mine" : "");
    el.dataset.id = m.id;
    const meta = document.createElement("div"); meta.className = "meta";
    const who = document.createElement("b"); who.textContent = m.uid === uid ? "You" : m.name;
    meta.append(who, new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    const body = document.createElement("div"); body.textContent = m.text; // textContent = XSS-safe
    el.append(meta, body);
    // Keep id order even if messages arrive out of order.
    const next = [...box.querySelectorAll(".msg")].find((n) => +n.dataset.id > m.id);
    next ? box.insertBefore(el, next) : box.append(el);
    if (nearBottom || m.uid === uid) box.scrollTop = box.scrollHeight;
  }
  function system(t) {
    const el = document.createElement("div"); el.className = "system"; el.textContent = t;
    $("messages").append(el); $("messages").scrollTop = $("messages").scrollHeight;
  }
  function toast(t) {
    const el = $("toast"); el.textContent = t; el.classList.remove("hidden");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add("hidden"), 1800);
  }

  const ta = $("text");
  ta.oninput = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("sendForm").requestSubmit(); } };
  $("sendForm").onsubmit = async (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text || !code) return;
    ta.value = ""; ta.oninput();
    try {
      const r = await api("/api/messages", { method: "POST", body: JSON.stringify({ code, uid, name: nick(), text }) });
      render(r.message);
    } catch (err) { ta.value = text; toast(err.message); }
  };

  // Deep link: /r/CODE or ?room=CODE
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9-]+)/) || location.search.match(/[?&]room=([A-Za-z0-9-]+)/);
  if (m) {
    const c = norm(m[1]);
    $("joinCode").value = fmtCode(c);
    if (nick()) enterRoom(c); else { homeErr("Pick a nickname, then press Join."); $("nick").focus(); }
  }
})();
