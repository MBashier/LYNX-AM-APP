const API = "";
let curDate = new Date().toISOString().slice(0,10);
let CAT = { materials: [], colors: [] };
let OPS = [];
let SHIFTS = [];
let SETUP = {};

function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove("show"), 1800);
}
function esc(s){ return (s===null||s===undefined)?"" : String(s); }
function $(id){ return document.getElementById(id); }

async function getJSON(u){ const r = await fetch(u); return r.json(); }
async function postJSON(u, body){
  const r = await fetch(u, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  return r.json();
}

// ---- date handling ----
const dp = $("datePicker");
dp.value = curDate;
dp.addEventListener("change", ()=>{ curDate = dp.value || curDate; loadAll(); });
$("loadBtn").onclick = ()=>{ curDate = dp.value || curDate; loadAll(); };

// ---- tabs ----
document.querySelectorAll("#tabs button").forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll("#tabs button").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    $("tab-"+b.dataset.tab).classList.add("active");
    if (b.dataset.tab === "catalog") renderCatalog();
    if (b.dataset.tab === "plan") loadPlans();
    if (b.dataset.tab === "weekly") loadWeekly();
  };
});

// ---- helpers: auto time + auto batch id ----
function nowTime(){
  const d = new Date();
  return d.toTimeString().slice(0,5);
}
function nowHour(){ return new Date().getHours(); }

// 3-shift model: S1 08:30-16:30, S2 16:30-00:30, S3 00:30-08:30
function toMin(t){ let [h,m]=t.split(":").map(Number); return h*60+m; }
function currentShift(start, end){
  const now = toMin(nowTime());
  const s = toMin(start), e = toMin(end);
  if (start === end) return false;
  if (e > s) return now >= s && now < e;            // normal day window
  return now >= s || now < e;                       // overnight window
}
function guessShift(){
  for (const sh of SHIFTS) if (currentShift(sh.start, sh.end)) return sh.name;
  return SHIFTS.length ? SHIFTS[0].name : "S1";
}
// 4h block within the current shift, snapped to shift start
function currentBlock(){
  const now = nowTime();
  const sh = SHIFTS.find(x=>x.name===guessShift());
  let start = sh ? sh.start : "08:30";
  // find nearest past 4h boundary from shift start
  const base = toMin(start);
  const off = (toMin(now) - base + 1440) % 1440;
  const b = Math.floor(off / 240) * 240;
  const bh = (base + b) % 1440, bm = (base + b + 240) % 1440;
  const fmt = m => String(Math.floor(m/60)%24).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
  return fmt(bh) + "–" + fmt(bm);
}
function blockTarget(){
  // spools_per_hr * 4h * target spool weight
  const sph = parseFloat($("s_sph").value) || 10;
  const tw = parseFloat($("s_tw").value) || 1;
  return Math.round(sph * 4 * tw * 10) / 10;
}

function setNow(field){
  const el = $(field); if (!el) return;
  if (field === "p_block"){
    $("p_shift").value = guessShift();
    el.value = currentBlock();
    $("p_tgt").value = blockTarget();
    toast($("p_shift").value + " · " + el.value + " · target " + $("p_tgt").value + " kg");
  } else {
    el.value = nowTime();
  }
}

function refreshTargets(){
  const tw = ($("s_tw").value || "1"), wt = ($("s_wt").value || "0.02");
  const td = ($("s_td").value || "1.75"), dt = ($("s_dt").value || "0.05");
  const wh = $("w_target_hint"); if (wh) wh.textContent = `Target: ${tw} kg ± ${wt}  ·  spec ${td} mm ± ${dt}`;
  const dh = $("d_target_hint"); if (dh) dh.textContent = `Target: ${td} mm ± ${dt}  ·  spec ${tw} kg ± ${wt}`;
  if ($("p_tgt") && !$("p_tgt").value) $("p_tgt").value = blockTarget();
}
function codeFor(arr, name){ const m = arr.find(x=>x.name===name); return m ? m.code : (name||"").toLowerCase().slice(0,3); }
function buildBid(material, color){
  const ymd = curDate.split("-");
  const ddmmyy = ymd.length===3 ? (ymd[2]+ymd[1]+ymd[0].slice(2)) : curDate;
  const mat = (material||"").toUpperCase().replace(/[^A-Z0-9]/g,"").split("-")[0] || "MAT";
  const col = codeFor(CAT.colors, color) || (color||"col").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,3);
  return `${mat}-${col}-${ddmmyy}`;
}
function refreshBids(){
  const mat = $("p_mat").value;
  const col = $("p_color").value;
  if ($("p_bid")) $("p_bid").textContent = col ? buildBid(mat, col) : "—";
  if ($("w_bid")) $("w_bid").textContent = $("w_color").value ? buildBid($("s_mat").value, $("w_color").value) : "—";
  if ($("d_bid")) $("d_bid").textContent = $("d_color").value ? buildBid($("s_mat").value, $("d_color").value) : "—";
  if ($("t_bid")) $("t_bid").textContent = $("t_to").value ? buildBid($("s_mat").value, $("t_to").value) : "—";
}

// ---- dropdowns ----
function fillSelect(id, items, selected, withBlank){
  const el = $(id); if(!el) return;
  el.innerHTML = "";
  if (withBlank){ const o=document.createElement("option"); o.value=""; o.textContent="—"; el.appendChild(o); }
  items.forEach(it=>{
    const o = document.createElement("option");
    o.value = it.name; o.textContent = it.name;
    if (it.name === selected) o.selected = true;
    el.appendChild(o);
  });
}
function fillOperators(id, selected){
  const el = $(id); if(!el) return;
  el.innerHTML = "";
  OPS.forEach(o=>{
    const opt = document.createElement("option"); opt.value=o.name; opt.textContent=o.name;
    if (o.name===selected) opt.selected=true;
    el.appendChild(opt);
  });
}

async function loadAll(){
  const d = await getJSON(`/api/day/${curDate}`);
  SETUP = d; PLAN = (d.planned_colors||"").split(",").map(s=>s.trim()).filter(Boolean);
  $("s_line").value = d.line || "GS Mach Line 1";
  fillSelect("s_mat", CAT.materials, d.material_default || "PLA+");
  $("s_mat").value = d.material_default || "PLA+";
  $("s_tw").value = d.target_weight ?? 1;
  $("s_wt").value = d.weight_tol ?? 0.02;
  $("s_td").value = d.target_dia ?? 1.75;
  $("s_dt").value = d.dia_tol ?? 0.05;
  $("s_sph").value = d.spools_per_hr ?? 10;
  $("s_rate").value = d.kg_per_hr ?? 10;
  $("s_bid").value = d.batch_ids || "";
  $("bidPreview").textContent = d.batch_preview || "—";
  fillSelect("p_mat", CAT.materials, d.material_default || "PLA+");
  fillSelect("p_color", CAT.colors, "");
  fillSelect("w_color", CAT.colors, "");
  fillSelect("d_color", CAT.colors, "");
  fillSelect("t_from", CAT.colors, "");
  fillSelect("t_to", CAT.colors, "");
  fillSelect("pl_mat", CAT.materials, "");
  fillSelect("pl_color", CAT.colors, "");
  fillOperators("p_op", "");
  fillOperators("w_op", "");
  fillOperators("d_op", "");
  fillOperators("t_op", "");
  refreshTargets();
  if (d.blocks) renderBlocks(d.blocks); else renderBlocks([]);
  if (d.weights) renderWeights(d.weights); else renderWeights([]);
  if (d.diameters) renderDiameters(d.diameters); else renderDiameters([]);
  if (d.transitions) renderTrans(d.transitions); else renderTrans([]);
  refreshBids();
  refreshSummary();
}

// ---- plan tab ----
function prodRateKgPerHr(){
  return parseFloat($("s_rate").value) || 10;
}
function applyThisSunday(){
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const diff = (7 - day) % 7;
  const d = new Date(today); d.setDate(today.getDate() + diff);
  if (diff === 0) {} // already Sunday -> this Sunday
  const iso = d.toISOString().slice(0,10);
  $("pl_week").value = iso;
  toast("Week start set: " + iso);
}
async function loadPlans(){
  const r = await getJSON("/api/plans");
  renderPlanList(r.plans || []);
  const sc = await getJSON("/api/plan/schedule");
  renderPlanBoard(sc.schedule || []);
}
function renderPlanList(rows){
  const el = $("planList"); el.innerHTML="";
  (rows||[]).forEach(p=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info"><b>${esc(p.material)} · ${esc(p.color)}</b><br>${esc(p.qty_kg)} kg · at 10 kg/hr ≈ ${(p.qty_kg/10).toFixed(1)} h</div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{ $("pl_mat").value=p.material; $("pl_color").value=p.color; $("pl_qty").value=p.qty_kg; editPlan=p.id; toast("Editing — tap Add Line to save"); };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/plan/${p.id}`,{}); loadPlans(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
  if(!rows.length) el.innerHTML = `<div class="hint">No plan lines yet.</div>`;
}
function renderPlanBoard(rows){
  const el = $("planBoard"); el.innerHTML="";
  if(!rows.length){ el.innerHTML = `<div class="hint">Add plan lines, pick a week start, then tap <b>Generate Schedule & Batch IDs</b>.</div>`; return; }
  // group by day
  const byDay = {};
  rows.forEach(r=>{ (byDay[r.day] = byDay[r.day] || []).push(r); });
  const total = rows.reduce((a,r)=>a + (r.chunk_kg||0), 0);
  const rate = prodRateKgPerHr();
  const totalH = total/rate;
  const capWeek = rate * 24 * 5;
  const over = total > capWeek;
  const head = document.createElement("div");
  head.className = "pl-total" + (over ? " over":"");
  head.innerHTML = `Total scheduled: <b>${total.toFixed(1)} kg</b> · ${totalH.toFixed(1)} h @ ${rate} kg/hr` + (over ? ` · ⚠ exceeds 5-day cap (${capWeek} kg)` : "");
  el.appendChild(head);
  Object.keys(byDay).sort().forEach(day=>{
    const block = document.createElement("div"); block.className="planline";
    block.innerHTML = `<div class="pl-head">${esc(day)}</div>`;
    const grid = document.createElement("div"); grid.className="pl-grid";
    byDay[day].forEach(r=>{
      const cell = document.createElement("div"); cell.className="pl-cell";
      cell.innerHTML = `<div class="pl-day">${esc(r.start_ts)}</div><div class="pl-kg">${esc(r.chunk_kg)} kg</div><div class="pl-sub">→ ${esc(r.end_ts)}<br>${esc(r.material)} · ${esc(r.color)}<br><b>${esc(r.batch_id)}</b></div>`;
      const btn = document.createElement("button"); btn.className="pl-go"; btn.textContent="→ Production";
      btn.onclick = (e)=>{ e.stopPropagation(); jumpToBlock(r); };
      cell.appendChild(btn);
      cell.onclick = ()=>{ jumpToBlock(r); };
      grid.appendChild(cell);
    });
    block.appendChild(grid);
    el.appendChild(block);
  });
}
function jumpToBlock(r){
  // open Production tab pre-filled for that day's actuals
  curDate = r.day;
  $("datePicker").value = r.day;
  loadAll();
  document.querySelectorAll("#tabs button").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  const b = Array.from(document.querySelectorAll("#tabs button")).find(x=>x.dataset.tab==="prod");
  if(b) b.classList.add("active");
  $("tab-prod").classList.add("active");
  // set material/color by name (best-effort; fall back to first option)
  $("p_mat").value = r.material;
  $("p_color").value = r.color;
  $("p_bid").textContent = r.batch_id;
  $("p_shift").value = "";
  $("p_block").value = r.start_ts.split(" ")[1] + " → " + r.end_ts.split(" ")[1];
  $("p_tgt").value = r.chunk_kg;
  refreshBids();
  toast("Loaded block into Production — fill actuals");
}
let editPlan = null;
async function addPlan(){
  const mat = $("pl_mat").value, col = $("pl_color").value, qty = $("pl_qty").value;
  if(!mat || !col || !qty){ toast("Material, color and qty required"); return; }
  const body = { material: mat, color: col, qty_kg: qty };
  if (editPlan) body.id = editPlan;
  await postJSON("/api/plan", body);
  editPlan = null;
  $("pl_qty").value="";
  loadPlans();
  toast("Plan line saved");
}
async function generateSchedule(){
  const ws = $("pl_week").value;
  if(!ws){ toast("Pick a week start (Sunday) first"); return; }
  const rate = prodRateKgPerHr();
  const r = await postJSON("/api/plan/generate", { week_start: ws, rate });
  if(!r.ok){ toast(r.error || "Generate failed"); return; }
  loadPlans();
  toast("Schedule generated with batch IDs");
}

// ---- setup ----
async function addOperator(){
  const name = ($("op_name").value||"").trim();
  if(!name){ toast("Enter a name"); return; }
  const r = await postJSON("/api/operator", { name });
  if (!r.ok){ toast(r.error || "Could not add"); return; }
  $("op_name").value = "";
  await loadOperators();
  toast("Operator added");
}
async function loadOperators(){
  const r = await getJSON("/api/operators");
  OPS = r.operators || [];
  renderOperators();
  ["p_op","w_op","d_op","t_op"].forEach(id=>fillOperators(id, $(id) && $(id).value));
}
function renderOperators(){
  const el = $("opList"); el.innerHTML = "";
  OPS.forEach(o=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info"><b>${esc(o.name)}</b></div>`;
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/operator/${o.id}`,{}); await loadOperators(); };
    div.appendChild(del); el.appendChild(div);
  });
}
$("saveSetup").onclick = async ()=>{
  await postJSON("/api/day", {
    date: curDate,
    line: $("s_line").value,
    material_default: $("s_mat").value,
    target_weight: $("s_tw").value,
    weight_tol: $("s_wt").value,
    target_dia: $("s_td").value,
    dia_tol: $("s_dt").value,
    spools_per_hr: $("s_sph").value,
    kg_per_hr: $("s_rate").value,
    batch_ids: $("s_bid").value,
  });
  toast("Setup saved"); loadAll();
};

// ---- production ----
let editBlock = null;
function renderBlocks(rows){
  const el = $("prodList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info"><b>${esc(r.color)}</b> · ${esc(r.batch_id)}<br>
      ${esc(r.shift)} ${esc(r.block_time)} · Tgt ${esc(r.target_kg)} / Act ${esc(r.actual_kg)} kg<br>
      <small>${esc(r.operator)?esc(r.operator)+" · ":""}${esc(r.notes)?esc(r.notes):""}</small></div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editBlock = r.id;
      $("p_shift").value = r.shift||"";
      $("p_block").value = r.block_time||"";
      $("p_mat").value = (CAT.materials.find(m=>m.code && r.batch_id && r.batch_id.toUpperCase().startsWith(m.code))||{}).name || "";
      $("p_color").value = r.color||"";
      $("p_tgt").value = r.target_kg??"";
      $("p_act").value = r.actual_kg??"";
      $("p_op").value = r.operator||"";
      $("p_notes").value = r.notes||"";
      refreshBids();
      toast("Editing — tap Add to save");
    };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/delete/blocks/${r.id}`,{}); loadAll(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
}
async function addBlock(){
  const bid = buildBid($("p_mat").value, $("p_color").value);
  const body = {
    date: curDate,
    shift: $("p_shift").value,
    block_time: $("p_block").value,
    color: $("p_color").value,
    batch_id: bid,
    target_kg: $("p_tgt").value,
    actual_kg: $("p_act").value,
    operator: $("p_op").value,
    notes: $("p_notes").value,
  };
  if (editBlock) body.id = editBlock;
  await postJSON("/api/blocks", body);
  editBlock = null;
  ["p_shift","p_block","p_color","p_tgt","p_act","p_op","p_notes"].forEach(id=>$(id).value="");
  toast("Block added · "+bid); loadAll();
}

// ---- weight ----
let editWeight = null;
function renderWeights(rows){
  const el = $("weightList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info">H${esc(r.hour)} · ${esc(r.time)} · <b>${esc(r.color)}</b><br>
      ${esc(r.batch_id)} · ${esc(r.reading_kg)} kg${esc(r.operator)? " · "+esc(r.operator):""}</div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editWeight = r.id;
      $("w_hour").value = r.hour??"";
      $("w_time").value = r.time||"";
      $("w_color").value = r.color||"";
      $("w_op").value = r.operator||"";
      $("w_read").value = r.reading_kg??"";
      refreshBids();
      toast("Editing — tap Add to save");
    };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/delete/weight/${r.id}`,{}); loadAll(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
}
async function addWeight(){
  const bid = buildBid($("s_mat").value, $("w_color").value);
  const body = {
    date: curDate,
    hour: nowHour(),
    time: $("w_time").value || nowTime(),
    color: $("w_color").value,
    batch_id: bid,
    reading_kg: $("w_read").value,
    operator: $("w_op").value,
  };
  if (editWeight) body.id = editWeight;
  await postJSON("/api/weight", body);
  editWeight = null;
  ["w_time","w_color","w_read","w_op"].forEach(id=>$(id).value="");
  $("w_hour").value = nowHour();
  toast("Weight reading added · "+bid); loadAll();
}

// ---- diameter ----
let editDia = null;
function renderDiameters(rows){
  const el = $("diaList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info">H${esc(r.hour)} · ${esc(r.time)} · <b>${esc(r.color)}</b><br>
      ${esc(r.batch_id)} · ${esc(r.reading_mm)} mm${esc(r.operator)? " · "+esc(r.operator):""}</div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editDia = r.id;
      $("d_hour").value = r.hour??"";
      $("d_time").value = r.time||"";
      $("d_color").value = r.color||"";
      $("d_op").value = r.operator||"";
      $("d_read").value = r.reading_mm??"";
      refreshBids();
      toast("Editing — tap Add to save");
    };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/delete/diameter/${r.id}`,{}); loadAll(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
}
async function addDiameter(){
  const bid = buildBid($("s_mat").value, $("d_color").value);
  const body = {
    date: curDate,
    hour: nowHour(),
    time: $("d_time").value || nowTime(),
    color: $("d_color").value,
    batch_id: bid,
    reading_mm: $("d_read").value,
    operator: $("d_op").value,
  };
  if (editDia) body.id = editDia;
  await postJSON("/api/diameter", body);
  editDia = null;
  ["d_time","d_color","d_read","d_op"].forEach(id=>$(id).value="");
  $("d_hour").value = nowHour();
  toast("Diameter reading added · "+bid); loadAll();
}

// ---- transitions ----
let editTrans = null;
function renderTrans(rows){
  const el = $("transList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info">${esc(r.time)} · ${esc(r.from_color)} → <b>${esc(r.to_color)}</b><br>
      ${esc(r.batch_id)} · ${esc(r.spools)} spools / ${esc(r.weight_kg)} kg<br>
      <small>${esc(r.operator)?esc(r.operator)+" · ":""}${esc(r.notes)?esc(r.notes):""}</small></div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editTrans = r.id;
      $("t_time").value = r.time||"";
      $("t_line").value = r.line||"";
      $("t_from").value = r.from_color||"";
      $("t_to").value = r.to_color||"";
      $("t_op").value = r.operator||"";
      $("t_sp").value = r.spools??"";
      $("t_wt").value = r.weight_kg??"";
      $("t_notes").value = r.notes||"";
      refreshBids();
      toast("Editing — tap Add to save");
    };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/delete/transition/${r.id}`,{}); loadAll(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
}
async function addTransition(){
  const bid = buildBid($("s_mat").value, $("t_to").value);
  const body = {
    date: curDate,
    time: $("t_time").value || nowTime(),
    line: $("t_line").value,
    from_color: $("t_from").value,
    to_color: $("t_to").value,
    batch_id: bid,
    spools: $("t_sp").value,
    weight_kg: $("t_wt").value,
    operator: $("t_op").value,
    notes: $("t_notes").value,
  };
  if (editTrans) body.id = editTrans;
  await postJSON("/api/transition", body);
  editTrans = null;
  ["t_time","t_from","t_to","t_sp","t_wt","t_op","t_notes"].forEach(id=>$(id).value="");
  toast("Transition added · "+bid); loadAll();
}

// ---- catalog ----
async function loadCatalog(){
  CAT = await getJSON("/api/catalog");
}
async function renderCatalog(){
  const ml = $("matList"); ml.innerHTML="";
  CAT.materials.forEach(m=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info"><b>${esc(m.name)}</b> · code ${esc(m.code)}<br>
      target ${esc(m.target_weight)}kg / ${esc(m.target_dia)}mm</div>`;
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/catalog-delete/material/${m.id}`,{}); await loadCatalog(); renderCatalog(); fillSelect("p_mat", CAT.materials, $("s_mat").value); };
    div.appendChild(del); ml.appendChild(div);
  });
  const cl = $("colList"); cl.innerHTML="";
  CAT.colors.forEach(c=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info"><b>${esc(c.name)}</b> · code ${esc(c.code)}</div>`;
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/catalog-delete/color/${c.id}`,{}); await loadCatalog(); renderCatalog(); };
    div.appendChild(del); cl.appendChild(div);
  });
}
async function saveMaterial(){
  await postJSON("/api/material", {
    name: $("m_name").value, code: $("m_code").value,
    target_weight: $("m_tw").value, target_dia: $("m_td").value,
  });
  $("m_name").value=""; $("m_code").value="";
  await loadCatalog();
  fillSelect("p_mat", CAT.materials, $("s_mat").value);
  renderCatalog(); toast("Material saved");
}
async function saveColor(){
  await postJSON("/api/color", { name: $("c_name").value, code: $("c_code").value });
  $("c_name").value=""; $("c_code").value="";
  await loadCatalog();
  renderCatalog(); toast("Color saved");
}

// ---- weekly rollup ----
function applyWeeklySunday(){
  const today = new Date();
  const day = today.getDay();
  const diff = (7 - day) % 7;
  const d = new Date(today); d.setDate(today.getDate() + diff);
  $("wk_week").value = d.toISOString().slice(0,10);
  toast("Week start set: " + $("wk_week").value);
}
async function loadWeekly(){
  const ws = $("wk_week").value;
  if(!ws){ toast("Pick a week start (Sunday) first"); return; }
  const r = await getJSON(`/api/weekly/${ws}`);
  window._lastWeekly = r;
  const t = r.totals || {};
  const rows = (r.days||[]).map(s=>`
    <div class="row2"><span>${esc(s.date)}</span><span>${s.total_actual} kg · ${s.est_spools} sp · ${esc(s.qc_status.split(' ')[0])}</span></div>`).join("");
  const pass = (r.qc_status||"").startsWith("PASS");
  $("weeklyBox").innerHTML = `
    <div class="status ${pass?'pass':'review'}">${esc(r.qc_status)}</div>
    <div class="row2"><span>Week</span><span>${esc(r.week_start)} (Sun→Thu)</span></div>
    <div class="row2"><span>Planned</span><span>${r.planned_kg} kg</span></div>
    <div class="row2"><span>Actual total</span><span>${t.total_actual} kg</span></div>
    <div class="row2"><span>Variance vs target</span><span>${t.variance} kg</span></div>
    <div class="row2"><span>Planned vs actual</span><span>${r.planned_vs_actual} kg</span></div>
    <div class="row2"><span>Est. spools</span><span>${t.est_spools}</span></div>
    <div class="row2"><span>Weight checks</span><span>${t.weight_checks} (${t.weight_oos} OUT)</span></div>
    <div class="row2"><span>Diameter checks</span><span>${t.diameter_checks} (${t.diameter_oos} OUT)</span></div>
    <div class="row2"><span>Transition loss</span><span>${t.transition_spools} sp / ${t.transition_weight} kg</span></div>
    <h3>Per day</h3>
    ${rows}`;
  toast("Weekly rollup loaded");
}
function copyWeeklyRollup(){
  const r = window._lastWeekly; if(!r) return;
  const t = r.totals || {};
  const lines = (r.days||[]).map(s=>`${s.date}: ${s.total_actual} kg, ${s.est_spools} sp, ${s.qc_status}`).join("\n");
  const txt =
`LYNX AM — Weekly Production Rollup ${r.week_start} (Sun→Thu)
QC: ${r.qc_status}
Planned: ${r.planned_kg} kg | Actual: ${t.total_actual} kg | Variance: ${t.variance} kg
Planned vs Actual: ${r.planned_vs_actual} kg | Est. spools: ${t.est_spools}
Weight checks: ${t.weight_checks} (${t.weight_oos} out) | Diameter: ${t.diameter_checks} (${t.diameter_oos} out)
Transition loss: ${t.transition_spools} sp / ${t.transition_weight} kg
--- Per day ---
${lines}`;
  navigator.clipboard.writeText(txt).then(()=>toast("Copied weekly report"));
}

// ---- summary ----
async function refreshSummary(){
  const s = await getJSON(`/api/summary/${curDate}`);
  const pass = s.qc_status.startsWith("PASS");
  $("summaryBox").innerHTML = `
    <div class="status ${pass?"pass":"review"}">${esc(s.qc_status)}</div>
    <div class="row2"><span>Date</span><span>${esc(s.date)}</span></div>
    <div class="row2"><span>Line</span><span>${esc(s.line)}</span></div>
    <div class="row2"><span>Planned Colors</span><span>${esc(s.planned_colors)||"—"}</span></div>
    <div class="row2"><span>Batch IDs</span><span>${esc(s.batch_ids)||"—"}</span></div>
    <div class="row2"><span>Total Target (kg)</span><span>${s.total_target}</span></div>
    <div class="row2"><span>Total Actual (kg)</span><span>${s.total_actual}</span></div>
    <div class="row2"><span>Variance (kg)</span><span>${s.variance}</span></div>
    <div class="row2"><span>Est. Spools Finished</span><span>${s.est_spools}</span></div>
    <div class="row2"><span>Weight checks</span><span>${s.weight_checks} (${s.weight_oos} OUT)</span></div>
    <div class="row2"><span>Diameter checks</span><span>${s.diameter_checks} (${s.diameter_oos} OUT)</span></div>
    <div class="row2"><span>Transition spools</span><span>${s.transition_spools}</span></div>
    <div class="row2"><span>Transition weight (kg)</span><span>${s.transition_weight}</span></div>`;
  $("csvLink").href = `/api/export/${curDate}`;
  window._lastSummary = s;
}
function copyWeekly(){
  const s = window._lastSummary; if(!s) return;
  const txt =
`LYNX AM — Daily Production Log ${s.date}
Line: ${s.line}
Planned Colors: ${s.planned_colors||"—"}
Batch IDs: ${s.batch_ids||"—"}
Total actual: ${s.total_actual} kg | Est. spools: ${s.est_spools}
Weight checks: ${s.weight_checks} (${s.weight_oos} out of spec)
Diameter checks: ${s.diameter_checks} (${s.diameter_oos} out of spec)
Transition loss: ${s.transition_spools} spools / ${s.transition_weight} kg
QC: ${s.qc_status}`;
  navigator.clipboard.writeText(txt).then(()=>toast("Copied for weekly report"));
}

// recompute plan board when production rate changes in Setup
["s_rate","s_tw"].forEach(id=>{ const el=$(id); if(el) el.addEventListener("input", ()=>{ if($("tab-plan").classList.contains("active")) loadPlans(); }); });

// ---- bootstrap ----
(async ()=>{
  await loadCatalog();
  const sh = await getJSON("/api/shifts"); SHIFTS = sh.shifts || [];
  await loadOperators();
  if ($("w_hour")) $("w_hour").value = nowHour();
  if ($("d_hour")) $("d_hour").value = nowHour();
  loadAll();
})();
