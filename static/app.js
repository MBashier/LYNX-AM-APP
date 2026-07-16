const API = "";
let curDate = new Date().toISOString().slice(0,10);

function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(()=>t.classList.remove("show"), 1800);
}
function esc(s){ return (s===null||s===undefined)?"":String(s); }

async function getJSON(u){ const r = await fetch(u); return r.json(); }
async function postJSON(u, body){
  const r = await fetch(u, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
  return r.json();
}

// ---- date handling ----
const dp = document.getElementById("datePicker");
dp.value = curDate;
dp.addEventListener("change", ()=>{ curDate = dp.value || curDate; loadAll(); });
document.getElementById("loadBtn").onclick = ()=>{ curDate = dp.value || curDate; loadAll(); };

// ---- tabs ----
document.querySelectorAll("#tabs button").forEach(b=>{
  b.onclick = ()=>{
    document.querySelectorAll("#tabs button").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    document.getElementById("tab-"+b.dataset.tab).classList.add("active");
  };
});

async function loadAll(){
  const d = await getJSON(`/api/day/${curDate}`);
  document.getElementById("s_line").value = d.line || "GS Mach Line 1";
  document.getElementById("s_mat").value = d.material_default || "PLA+";
  document.getElementById("s_tw").value = d.target_weight ?? 1;
  document.getElementById("s_wt").value = d.weight_tol ?? 0.02;
  document.getElementById("s_td").value = d.target_dia ?? 1.75;
  document.getElementById("s_dt").value = d.dia_tol ?? 0.05;
  document.getElementById("s_bid").value = d.batch_ids || "";
  if (d.blocks) renderBlocks(d.blocks);
  else renderBlocks([]);
  if (d.weights) renderWeights(d.weights); else renderWeights([]);
  if (d.diameters) renderDiameters(d.diameters); else renderDiameters([]);
  if (d.transitions) renderTrans(d.transitions); else renderTrans([]);
  refreshSummary();
}

// ---- setup ----
document.getElementById("saveSetup").onclick = async ()=>{
  await postJSON("/api/day", {
    date: curDate,
    line: document.getElementById("s_line").value,
    material_default: document.getElementById("s_mat").value,
    target_weight: document.getElementById("s_tw").value,
    weight_tol: document.getElementById("s_wt").value,
    target_dia: document.getElementById("s_td").value,
    dia_tol: document.getElementById("s_dt").value,
    batch_ids: document.getElementById("s_bid").value,
  });
  toast("Setup saved");
  refreshSummary();
};

// ---- production ----
let editBlock = null;
async function renderBlocks(rows){
  const el = document.getElementById("prodList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info"><b>${esc(r.color)}</b> · ${esc(r.batch_id)}<br>
      ${esc(r.shift)} ${esc(r.block_time)} · Tgt ${esc(r.target_kg)} / Act ${esc(r.actual_kg)} kg<br>
      <small>${esc(r.operator)} ${esc(r.notes)?"· "+esc(r.notes):""}</small></div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editBlock = r.id;
      document.getElementById("p_shift").value = r.shift||"";
      document.getElementById("p_block").value = r.block_time||"";
      document.getElementById("p_color").value = r.color||"";
      document.getElementById("p_bid").value = r.batch_id||"";
      document.getElementById("p_tgt").value = r.target_kg??"";
      document.getElementById("p_act").value = r.actual_kg??"";
      document.getElementById("p_op").value = r.operator||"";
      document.getElementById("p_notes").value = r.notes||"";
      toast("Editing — tap Add to save");
    };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/delete/blocks/${r.id}`,{}); loadAll(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
}
async function addBlock(){
  const body = {
    date: curDate,
    shift: document.getElementById("p_shift").value,
    block_time: document.getElementById("p_block").value,
    color: document.getElementById("p_color").value,
    batch_id: document.getElementById("p_bid").value,
    target_kg: document.getElementById("p_tgt").value,
    actual_kg: document.getElementById("p_act").value,
    operator: document.getElementById("p_op").value,
    notes: document.getElementById("p_notes").value,
  };
  if (editBlock) body.id = editBlock;
  await postJSON("/api/blocks", body);
  editBlock = null;
  ["p_shift","p_block","p_color","p_bid","p_tgt","p_act","p_op","p_notes"].forEach(id=>document.getElementById(id).value="");
  toast(editBlock!==null?"Block updated":"Block added"); loadAll();
}

// ---- weight ----
let editWeight = null;
async function renderWeights(rows){
  const el = document.getElementById("weightList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info">H${esc(r.hour)} · ${esc(r.time)} · <b>${esc(r.color)}</b><br>
      ${esc(r.batch_id)} · ${esc(r.reading_kg)} kg</div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editWeight = r.id;
      document.getElementById("w_hour").value = r.hour??"";
      document.getElementById("w_time").value = r.time||"";
      document.getElementById("w_color").value = r.color||"";
      document.getElementById("w_bid").value = r.batch_id||"";
      document.getElementById("w_read").value = r.reading_kg??"";
      toast("Editing — tap Add to save");
    };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/delete/weight/${r.id}`,{}); loadAll(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
}
async function addWeight(){
  const body = {
    date: curDate,
    hour: document.getElementById("w_hour").value,
    time: document.getElementById("w_time").value,
    color: document.getElementById("w_color").value,
    batch_id: document.getElementById("w_bid").value,
    reading_kg: document.getElementById("w_read").value,
  };
  if (editWeight) body.id = editWeight;
  await postJSON("/api/weight", body);
  editWeight = null;
  ["w_hour","w_time","w_color","w_bid","w_read"].forEach(id=>document.getElementById(id).value="");
  toast("Weight reading added"); loadAll();
}

// ---- diameter ----
let editDia = null;
async function renderDiameters(rows){
  const el = document.getElementById("diaList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info">H${esc(r.hour)} · ${esc(r.time)} · <b>${esc(r.color)}</b><br>
      ${esc(r.batch_id)} · ${esc(r.reading_mm)} mm</div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editDia = r.id;
      document.getElementById("d_hour").value = r.hour??"";
      document.getElementById("d_time").value = r.time||"";
      document.getElementById("d_color").value = r.color||"";
      document.getElementById("d_bid").value = r.batch_id||"";
      document.getElementById("d_read").value = r.reading_mm??"";
      toast("Editing — tap Add to save");
    };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/delete/diameter/${r.id}`,{}); loadAll(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
}
async function addDiameter(){
  const body = {
    date: curDate,
    hour: document.getElementById("d_hour").value,
    time: document.getElementById("d_time").value,
    color: document.getElementById("d_color").value,
    batch_id: document.getElementById("d_bid").value,
    reading_mm: document.getElementById("d_read").value,
  };
  if (editDia) body.id = editDia;
  await postJSON("/api/diameter", body);
  editDia = null;
  ["d_hour","d_time","d_color","d_bid","d_read"].forEach(id=>document.getElementById(id).value="");
  toast("Diameter reading added"); loadAll();
}

// ---- transitions ----
let editTrans = null;
async function renderTrans(rows){
  const el = document.getElementById("transList"); el.innerHTML="";
  (rows||[]).forEach(r=>{
    const div = document.createElement("div"); div.className="row";
    div.innerHTML = `<div class="info">${esc(r.time)} · ${esc(r.from_color)} → <b>${esc(r.to_color)}</b><br>
      ${esc(r.batch_id)} · ${esc(r.spools)} spools / ${esc(r.weight_kg)} kg<br>
      <small>${esc(r.operator)} ${esc(r.notes)?"· "+esc(r.notes):""}</small></div>`;
    const wrap = document.createElement("div"); wrap.style.display="flex"; wrap.style.gap="6px";
    const ed = document.createElement("button"); ed.className="del"; ed.textContent="✎"; ed.style.color="var(--accent2)";
    ed.onclick = ()=>{
      editTrans = r.id;
      document.getElementById("t_time").value = r.time||"";
      document.getElementById("t_line").value = r.line||"";
      document.getElementById("t_from").value = r.from_color||"";
      document.getElementById("t_to").value = r.to_color||"";
      document.getElementById("t_bid").value = r.batch_id||"";
      document.getElementById("t_sp").value = r.spools??"";
      document.getElementById("t_wt").value = r.weight_kg??"";
      document.getElementById("t_op").value = r.operator||"";
      document.getElementById("t_notes").value = r.notes||"";
      toast("Editing — tap Add to save");
    };
    const del = document.createElement("button"); del.className="del"; del.textContent="✕";
    del.onclick = async ()=>{ await postJSON(`/api/delete/transition/${r.id}`,{}); loadAll(); };
    wrap.appendChild(ed); wrap.appendChild(del); div.appendChild(wrap); el.appendChild(div);
  });
}
async function addTransition(){
  const body = {
    date: curDate,
    time: document.getElementById("t_time").value,
    line: document.getElementById("t_line").value,
    from_color: document.getElementById("t_from").value,
    to_color: document.getElementById("t_to").value,
    batch_id: document.getElementById("t_bid").value,
    spools: document.getElementById("t_sp").value,
    weight_kg: document.getElementById("t_wt").value,
    operator: document.getElementById("t_op").value,
    notes: document.getElementById("t_notes").value,
  };
  if (editTrans) body.id = editTrans;
  await postJSON("/api/transition", body);
  editTrans = null;
  ["t_time","t_from","t_to","t_bid","t_sp","t_wt","t_op","t_notes"].forEach(id=>document.getElementById(id).value="");
  toast("Transition added"); loadAll();
}

// ---- summary ----
async function refreshSummary(){
  const s = await getJSON(`/api/summary/${curDate}`);
  const pass = s.qc_status.startsWith("PASS");
  document.getElementById("summaryBox").innerHTML = `
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
  document.getElementById("csvLink").href = `/api/export/${curDate}`;
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

loadAll();
