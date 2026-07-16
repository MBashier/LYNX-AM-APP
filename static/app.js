const API = "";
let curDate = new Date().toISOString().slice(0,10);
let CAT = { materials: [], colors: [] };

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
  };
});

// ---- helpers: auto time + auto batch id ----
function nowTime(){
  const d = new Date();
  return d.toTimeString().slice(0,5);
}
function nowHour(){
  return new Date().getHours();
}
function setNow(field){
  const el = $(field); if (!el) return;
  if (field === "p_block"){ el.value = nowHour() + ":00-" + ((nowHour()+4)%24) + ":00"; }
  else { el.value = nowTime(); }
}
function refreshTargets(){
  const tw = ($("s_tw").value || "1"), wt = ($("s_wt").value || "0.02");
  const td = ($("s_td").value || "1.75"), dt = ($("s_dt").value || "0.05");
  const wh = $("w_target_hint"); if (wh) wh.textContent = `Target: ${tw} kg ± ${wt}  ·  spec ${td} mm ± ${dt}`;
  const dh = $("d_target_hint"); if (dh) dh.textContent = `Target: ${td} mm ± ${dt}  ·  spec ${tw} kg ± ${wt}`;
  // prefill Production target from setup if empty
  if ($("p_tgt") && !$("p_tgt").value) $("p_tgt").value = tw;
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
function fillSelect(id, items, selected){
  const el = $(id); if(!el) return;
  el.innerHTML = "";
  items.forEach(it=>{
    const o = document.createElement("option");
    o.value = it.name; o.textContent = it.name + (it.code ? ` (${it.code})` : "");
    if (it.name === selected) o.selected = true;
    el.appendChild(o);
  });
}

async function loadAll(){
  const d = await getJSON(`/api/day/${curDate}`);
  $("s_line").value = d.line || "GS Mach Line 1";
  fillSelect("s_mat", CAT.materials, d.material_default || "PLA+");
  $("s_mat").value = d.material_default || "PLA+";
  $("s_tw").value = d.target_weight ?? 1;
  $("s_wt").value = d.weight_tol ?? 0.02;
  $("s_td").value = d.target_dia ?? 1.75;
  $("s_dt").value = d.dia_tol ?? 0.05;
  $("s_bid").value = d.batch_ids || "";
  $("bidPreview").textContent = d.batch_preview || "—";
  fillSelect("p_mat", CAT.materials, d.material_default || "PLA+");
  fillSelect("p_color", CAT.colors, "");
  fillSelect("w_color", CAT.colors, "");
  fillSelect("d_color", CAT.colors, "");
  fillSelect("t_from", CAT.colors, "");
  fillSelect("t_to", CAT.colors, "");
  refreshTargets();
  if (d.blocks) renderBlocks(d.blocks); else renderBlocks([]);
  if (d.weights) renderWeights(d.weights); else renderWeights([]);
  if (d.diameters) renderDiameters(d.diameters); else renderDiameters([]);
  if (d.transitions) renderTrans(d.transitions); else renderTrans([]);
  refreshBids();
  refreshSummary();
}

// ---- setup ----
$("saveSetup").onclick = async ()=>{
  await postJSON("/api/day", {
    date: curDate,
    line: $("s_line").value,
    material_default: $("s_mat").value,
    target_weight: $("s_tw").value,
    weight_tol: $("s_wt").value,
    target_dia: $("s_td").value,
    dia_tol: $("s_dt").value,
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
      <small>${esc(r.operator)} ${esc(r.notes)?"· "+esc(r.notes):""}</small></div>`;
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
  ["p_shift","p_block","p_tgt","p_act","p_op","p_notes"].forEach(id=>$(id).value="");
  toast("Block added · "+bid); loadAll();
}

// ---- weight ----
let editWeight = null;
function renderWeights(rows){
  const el = $("weightList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info">H${esc(r.hour)} · ${esc(r.time)} · <b>${esc(r.color)}</b><br>
      ${esc(r.batch_id)} · ${esc(r.reading_kg)} kg</div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editWeight = r.id;
      $("w_hour").value = r.hour??"";
      $("w_time").value = r.time||"";
      $("w_color").value = r.color||"";
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
  };
  if (editWeight) body.id = editWeight;
  await postJSON("/api/weight", body);
  editWeight = null;
  ["w_time","w_color","w_read"].forEach(id=>$(id).value="");
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
      ${esc(r.batch_id)} · ${esc(r.reading_mm)} mm</div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editDia = r.id;
      $("d_hour").value = r.hour??"";
      $("d_time").value = r.time||"";
      $("d_color").value = r.color||"";
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
  };
  if (editDia) body.id = editDia;
  await postJSON("/api/diameter", body);
  editDia = null;
  ["d_time","d_color","d_read"].forEach(id=>$(id).value="");
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
      <small>${esc(r.operator)} ${esc(r.notes)?"· "+esc(r.notes):""}</small></div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editTrans = r.id;
      $("t_time").value = r.time||"";
      $("t_line").value = r.line||"";
      $("t_from").value = r.from_color||"";
      $("t_to").value = r.to_color||"";
      $("t_sp").value = r.spools??"";
      $("t_wt").value = r.weight_kg??"";
      $("t_op").value = r.operator||"";
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

// ---- summary ----
async function refreshSummary(){
  const s = await getJSON(`/api/summary/${curDate}`);
  const pass = s.qc_status.startsWith("PASS");
  $("summaryBox").innerHTML = `
    <div class="status ${pass?"pass":"review"}">${esc(s.qc_status)}</div>
    <div class="row2"><span>Date</span><span>${esc(s.date)}</span></div>
    <div class="row2"><span>Line</span><span>${esc(s.line)}</span></div>
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
Batch IDs: ${s.batch_ids||"—"}
Total actual: ${s.total_actual} kg | Est. spools: ${s.est_spools}
Weight checks: ${s.weight_checks} (${s.weight_oos} out of spec)
Diameter checks: ${s.diameter_checks} (${s.diameter_oos} out of spec)
Transition loss: ${s.transition_spools} spools / ${s.transition_weight} kg
QC: ${s.qc_status}`;
  navigator.clipboard.writeText(txt).then(()=>toast("Copied for weekly report"));
}

// ---- prefill clock on tab open ----
["weight","dia","trans"].forEach(tab=>{
  // handled by setNow buttons + auto hour; nothing extra needed
});

// ---- bootstrap ----
(async ()=>{
  await loadCatalog();
  // prefill hour fields with current hour
  if ($("w_hour")) $("w_hour").value = nowHour();
  if ($("d_hour")) $("d_hour").value = nowHour();
  loadAll();
})();
