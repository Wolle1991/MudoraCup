const TOURNAMENT_NAME = "Mudora Cup";
let ADMIN_SESSION_KEY = "";

function $(id){ return document.getElementById(id); }

function getApiUrl(){
  return String(window.MUDORA_CONFIG?.API_URL || "").trim();
}

function getAdminKey(){
  return ADMIN_SESSION_KEY;
}

function setStatus(msg, bad=false){
  const el = $("status");
  if(!el) return;
  el.textContent = msg;
  el.style.color = bad ? "var(--red)" : "var(--green)";
}

function requireApiUrl(){
  const url = getApiUrl();
  if(!url || url.includes("DEINE_SCRIPT_ID")) {
    throw new Error("Bitte zuerst deine Apps-Script-/exec-URL in config.js eintragen.");
  }
  return url;
}

async function api(action, payload={}){
  const url = requireApiUrl();
  const body = { action, ...payload };
  if(!["getData", "submitRegistration"].includes(action)) body.adminKey = getAdminKey();

  const res = await fetch(url, {
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch(e){ throw new Error("Keine gültige JSON-Antwort: " + text.slice(0,120)); }
  if(!data.ok) throw new Error(data.error || "Unbekannter Fehler");
  return data;
}

async function testConnection(){
  try{
    await api("getData", {});
    setStatus("Verbindung funktioniert.");
  }catch(err){
    setStatus(err.message, true);
  }
}

async function adminLogin(){
  try{
    const key = $("adminKey").value.trim();
    if(!key) throw new Error("Bitte Admin-Key eingeben.");
    ADMIN_SESSION_KEY = key;

    // Testet den Key direkt mit einer geschützten Aktion.
    await api("adminCheck", {});

    $("loginSection")?.classList.add("hidden");
    $("adminContent")?.classList.remove("hidden");
    if($("apiInfo")) $("apiInfo").textContent = "Verbunden mit: " + getApiUrl();
    setStatus("");
    await loadData();
  }catch(err){
    ADMIN_SESSION_KEY = "";
    setStatus(err.message, true);
  }
}

function adminLogout(){
  ADMIN_SESSION_KEY = "";
  if($("adminKey")) $("adminKey").value = "";
  $("adminContent")?.classList.add("hidden");
  $("loginSection")?.classList.remove("hidden");
  setStatus("Ausgeloggt.");
}

async function loadData(){
  try{
    const data = await api("getData", {});
    renderAll(data);
    setStatus("Daten geladen.");
  }catch(err){
    renderEmpty(err.message);
    setStatus(err.message, true);
  }
}

function renderEmpty(msg="Noch keine Verbindung eingerichtet."){
  if($("players")) $("players").textContent = msg;
  if($("groups")) $("groups").textContent = msg;
  if($("matchList")) $("matchList").textContent = msg;
  if($("bracketBox")) $("bracketBox").textContent = msg;
  if($("adminData")) $("adminData").textContent = msg;
}

function renderAll(data){
  const players = data.players || [];
  const matches = data.matches || [];
  const registrations = data.registrations || [];
  renderRegistrationStatus(registrations);
  renderPlayers(players);
  renderGroups(players, matches);
  renderMatches(matches);
  renderBracket(matches);
  renderAdmin(players, matches, registrations);
  renderDraw(data);
}

function renderPlayers(players){
  const el = $("players"); if(!el) return;
  if(!players.length){ el.innerHTML = '<span class="empty">Noch keine Teilnehmer eingetragen.</span>'; return; }
  el.innerHTML = players.map(p => `<span class="player">${escapeHtml(p.name)} <small>Gruppe ${escapeHtml(p.group||"-")}</small></span>`).join("");
}

function renderGroups(players, matches){
  const el = $("groups"); if(!el) return;
  const groups = {};
  players.forEach(p => { const g = p.group || "-"; (groups[g] ||= []).push(p); });
  if(!Object.keys(groups).length){ el.innerHTML = '<span class="empty">Noch keine Gruppen vorhanden.</span>'; return; }
  el.innerHTML = Object.keys(groups).sort().map(g => {
    const rows = groups[g].map(p => {
      const stats = calcStats(p.name, matches.filter(m => (m.phase||"").toLowerCase().includes("gruppe")));
      return `<tr><td>${escapeHtml(p.name)}</td><td>${stats.w}</td><td>${stats.l}</td></tr>`;
    }).join("");
    return `<div class="groupCard"><h3>Gruppe ${escapeHtml(g)}</h3><table class="table"><thead><tr><th>Spieler</th><th>W</th><th>L</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");
}

function calcStats(name, matches){
  let w=0,l=0;
  matches.forEach(m => {
    if(m.p1===name || m.p2===name){
      if(m.winner===name) w++;
      else if(m.winner) l++;
    }
  });
  return {w,l};
}

function renderMatches(matches){
  const el = $("matchList"); if(!el) return;
  if(!matches.length){ el.innerHTML = '<span class="empty">Noch keine Matches eingetragen.</span>'; return; }
  el.innerHTML = matches.map(m => `<div class="match"><div>${escapeHtml(m.p1)}</div><strong>vs</strong><div>${escapeHtml(m.p2)}</div><div><span class="winner">${escapeHtml(m.winner || "offen")}</span><br><small>${escapeHtml(m.phase||"")} ${escapeHtml(m.group||"")} · ${escapeHtml(m.result||"")}</small></div></div>`).join("");
}

function renderBracket(matches){
  const el = $("bracketBox"); if(!el) return;
  const ko = matches.filter(m => !(m.phase||"").toLowerCase().includes("gruppe"));
  if(!ko.length){ el.innerHTML = '<span class="empty">KO-Runde ist noch nicht eingetragen.</span>'; return; }
  const byPhase = {};
  ko.forEach(m => (byPhase[m.phase||"KO"] ||= []).push(m));
  el.innerHTML = Object.keys(byPhase).map(phase => `<div class="round"><h3>${escapeHtml(phase)}</h3>${byPhase[phase].map(m => `<p>${escapeHtml(m.p1)} vs ${escapeHtml(m.p2)}<br><strong>${escapeHtml(m.winner||"offen")}</strong></p>`).join("")}</div>`).join("");
}

function renderAdmin(players, matches, registrations=[]){
  const el = $("adminData"); if(!el) return;
  const pending = registrations.filter(r => String(r.status||"pending").toLowerCase() === "pending");
  const approved = registrations.filter(r => String(r.status||"").toLowerCase() === "approved");
  const declined = registrations.filter(r => String(r.status||"").toLowerCase() === "declined");
  const regHtml = pending.length ? pending.map(r => `
    <div class="adminItem">
      <div><strong>${escapeHtml(r.name)}</strong><br><small>Discord: ${escapeHtml(r.discord || "-")} · ${escapeHtml(r.note || "")}</small></div>
      <div class="row compactRow">
        <button class="smallButton" onclick="approveRegistration(${Number(r.row)})">Annehmen</button>
        <button class="smallButton danger" onclick="declineRegistration(${Number(r.row)})">Ablehnen</button>
      </div>
    </div>`).join("") : '<p class="empty">Keine offenen Anmeldungen.</p>';
  el.innerHTML = `
    <h3>Offene Anmeldungen</h3>${regHtml}
    <p class="hint">Angenommen: ${approved.length} · Abgelehnt: ${declined.length}</p>
    <h3>Teilnehmer</h3>${players.map(p=>`<p>${escapeHtml(p.name)} · Gruppe ${escapeHtml(p.group||"-")}</p>`).join("") || '<p class="empty">Keine Teilnehmer</p>'}
    <h3>Matches</h3>${matches.map(m=>`<p>${escapeHtml(m.phase)} · ${escapeHtml(m.p1)} vs ${escapeHtml(m.p2)} · Sieger: ${escapeHtml(m.winner||"offen")}</p>`).join("") || '<p class="empty">Keine Matches</p>'}`;
}

async function addPlayer(){
  try{
    if(!getAdminKey()) throw new Error("Bitte zuerst einloggen.");
    const name = $("playerName").value.trim();
    const group = $("playerGroup").value;
    if(!name) throw new Error("Bitte Namen eintragen.");
    await api("addPlayer", { name, group });
    $("playerName").value = "";
    setStatus("Teilnehmer gespeichert.");
    loadData();
  }catch(err){ setStatus(err.message, true); }
}


async function submitRegistration(){
  try{
    const name = $("regName").value.trim();
    const discord = $("regDiscord").value.trim();
    const note = $("regNote").value.trim();
    if(!name) throw new Error("Bitte deinen Racer-Namen eintragen.");
    await api("submitRegistration", { name, discord, note });
    $("regName").value = "";
    if($("regDiscord")) $("regDiscord").value = "";
    if($("regNote")) $("regNote").value = "";
    setRegistrationMessage("Anmeldung wurde abgeschickt. Sie muss noch vom Admin bestätigt werden.");
    loadData();
  }catch(err){ setRegistrationMessage(err.message, true); }
}

function setRegistrationMessage(msg, bad=false){
  const el = $("registrationStatus");
  if(!el) return;
  el.textContent = msg;
  el.style.color = bad ? "var(--red)" : "var(--green)";
}

function renderRegistrationStatus(registrations=[]){
  const el = $("registrationList");
  if(!el) return;
  const pending = registrations.filter(r => String(r.status||"pending").toLowerCase() === "pending");
  if(!pending.length){ el.innerHTML = '<span class="empty">Aktuell keine offenen Anmeldungen.</span>'; return; }
  el.innerHTML = pending.map(r => `<span class="player">${escapeHtml(r.name)} <small>wartet auf Bestätigung</small></span>`).join("");
}

async function approveRegistration(row){
  try{
    if(!getAdminKey()) throw new Error("Bitte zuerst einloggen.");
    await api("approveRegistration", { row });
    setStatus("Anmeldung angenommen und als Teilnehmer gespeichert.");
    loadData();
  }catch(err){ setStatus(err.message, true); }
}

async function declineRegistration(row){
  try{
    if(!getAdminKey()) throw new Error("Bitte zuerst einloggen.");
    await api("declineRegistration", { row });
    setStatus("Anmeldung abgelehnt.");
    loadData();
  }catch(err){ setStatus(err.message, true); }
}

async function addMatch(){
  try{
    if(!getAdminKey()) throw new Error("Bitte zuerst einloggen.");
    const payload = {
      phase: $("matchPhase").value,
      group: $("matchGroup").value.trim(),
      p1: $("p1").value.trim(),
      p2: $("p2").value.trim(),
      winner: $("winner").value.trim(),
      result: $("result").value.trim()
    };
    if(!payload.p1 || !payload.p2) throw new Error("Bitte beide Spieler eintragen.");
    await api("addMatch", payload);
    ["matchGroup","p1","p2","winner","result"].forEach(id=>$(id).value="");
    setStatus("Match gespeichert.");
    loadData();
  }catch(err){ setStatus(err.message, true); }
}

function escapeHtml(str){ return String(str ?? "").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function groupListForCount(count){
  if(count <= 8) return ["A", "B"];
  return ["A", "B", "C"];
}

function buildDrawState(data){
  const players = data.players || [];
  const draw = data.draw || [];
  const drawnNames = new Set(draw.map(d => d.name));
  const pool = players.filter(p => !drawnNames.has(p.name));
  return { players, draw, pool, groups: groupListForCount(players.length) };
}

function renderDraw(data){
  const groupsEl = $("drawGroups");
  const poolEl = $("drawPool");
  if(!groupsEl && !poolEl) return;

  const { players, draw, pool, groups } = buildDrawState(data);
  if(groupsEl){
    const byGroup = {};
    groups.forEach(g => byGroup[g] = []);
    draw.forEach(d => (byGroup[d.group] ||= []).push(d));
    groupsEl.innerHTML = groups.map(g => {
      const items = byGroup[g] || [];
      return `<div class="groupCard drawGroup"><h3>Gruppe ${escapeHtml(g)}</h3>${items.length ? items.map((d,i)=>`<p><strong>${i+1}.</strong> ${escapeHtml(d.name)}</p>`).join("") : '<p class="empty">Noch leer</p>'}</div>`;
    }).join("");
  }
  if(poolEl){
    if(!players.length){ poolEl.innerHTML = '<span class="empty">Noch keine Teilnehmer eingetragen.</span>'; }
    else if(!pool.length){ poolEl.innerHTML = '<span class="empty">Alle Teilnehmer wurden gezogen.</span>'; }
    else { poolEl.innerHTML = pool.map(p => `<span class="player">${escapeHtml(p.name)}</span>`).join(""); }
  }
  const sub = $("drawSubline");
  if(sub) sub.textContent = `${draw.length} von ${players.length} Teilnehmern gezogen.`;
}

async function drawLogin(){
  try{
    const key = $("adminKey").value.trim();
    if(!key) throw new Error("Bitte Admin-Key eingeben.");
    ADMIN_SESSION_KEY = key;
    await api("adminCheck", {});
    $("drawLogin")?.classList.add("hidden");
    $("drawControls")?.classList.remove("hidden");
    setStatus("Eingeloggt. Du kannst jetzt ziehen.");
    await loadData();
  }catch(err){
    ADMIN_SESSION_KEY = "";
    setStatus(err.message, true);
  }
}

async function drawNextPlayer(){
  try{
    if(!getAdminKey()) throw new Error("Bitte zuerst einloggen.");
    const data = await api("drawNext", {});
    const picked = data.picked;
    if(!picked){
      $("drawReveal").textContent = "Alle Spieler sind gezogen";
      $("drawSubline").textContent = "Die Auslosung ist abgeschlossen.";
      renderDraw(data);
      setStatus("Auslosung ist fertig.");
      return;
    }
    const reveal = $("drawReveal");
    if(reveal){
      reveal.classList.remove("pop");
      reveal.textContent = "🎲 Ziehung läuft...";
      setTimeout(() => {
        reveal.textContent = `${picked.name} → Gruppe ${picked.group}`;
        reveal.classList.add("pop");
      }, 650);
    }
    setTimeout(() => renderDraw(data), 700);
    setStatus("Spieler gezogen.");
  }catch(err){ setStatus(err.message, true); }
}

async function resetDrawConfirm(){
  try{
    if(!getAdminKey()) throw new Error("Bitte zuerst einloggen.");
    if(!confirm("Auslosung wirklich zurücksetzen? Die Teilnehmer bleiben erhalten.")) return;
    const data = await api("resetDraw", {});
    if($("drawReveal")) $("drawReveal").textContent = "Noch nicht gezogen";
    renderDraw(data);
    loadData();
    setStatus("Auslosung wurde zurückgesetzt.");
  }catch(err){ setStatus(err.message, true); }
}

window.addEventListener("DOMContentLoaded", () => {
  document.title = document.title.replace("Go Mode Sheep Cup", TOURNAMENT_NAME);
  if($("adminContent")) $("adminContent").classList.add("hidden");
  if($("apiInfo") && getApiUrl()) $("apiInfo").textContent = "Verbunden mit: " + getApiUrl();
  if(!$("loginSection")) loadData();
});
