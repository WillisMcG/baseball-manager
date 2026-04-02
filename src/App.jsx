import { useState, useRef, useEffect } from "react";

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
const POSITION_LABELS = {
  P: "Pitcher", C: "Catcher", "1B": "First Base", "2B": "Second Base",
  "3B": "Third Base", SS: "Shortstop", LF: "Left Field", CF: "Center Field",
  RF: "Right Field", DH: "Designated Hitter"
};
const FIELD_POSITIONS = {
  P:  { top: "54%", left: "50%" }, C:  { top: "80%", left: "50%" },
  "1B": { top: "52%", left: "72%" }, "2B": { top: "38%", left: "62%" },
  "3B": { top: "52%", left: "28%" }, SS: { top: "38%", left: "38%" },
  LF:  { top: "18%", left: "22%" }, CF: { top: "10%", left: "50%" },
  RF:  { top: "18%", left: "78%" }, DH: { top: "88%", left: "78%" },
};

// Auto-fill priority: SS before 3B, 3B before 2B (premium defensive positions first)
const AUTOFILL_ORDER = ["P", "C", "SS", "3B", "2B", "1B", "LF", "CF", "RF", "DH"];

let nextId = 1;
function genId() { return nextId++; }

function buildDefaultDepth(players) {
  const depth = {};
  POSITIONS.forEach(pos => {
    depth[pos] = players.filter(p => p.positions.includes(pos)).map(p => p.id);
  });
  return depth;
}

const STORAGE_KEY = 'baseball-team-v2';

async function loadSaved() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    if (r?.value) return JSON.parse(r.value);
  } catch (_) {}
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) return JSON.parse(v);
  } catch (_) {}
  return null;
}

async function persist(data) {
  const json = JSON.stringify(data);
  try { await window.storage.set(STORAGE_KEY, json); return; } catch (_) {}
  try { localStorage.setItem(STORAGE_KEY, json); } catch (_) {}
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [players, setPlayers] = useState([]);
  const [battingOrder, setBattingOrder] = useState([]);
  const [lineup, setLineup] = useState({});
  const [savedLineups, setSavedLineups] = useState([]);
  const [depth, setDepth] = useState({});
  const [activeTab, setActiveTab] = useState("roster");
  const [newName, setNewName] = useState("");
  const [newPos, setNewPos] = useState([]);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [batDrag, setBatDrag] = useState(null);
  const batRowRefs = useRef([]);

  // Field tab: tap-to-pick state
  const [fieldPickPos, setFieldPickPos] = useState(null);

  // Depth chart: drag state
  const [depthDrag, setDepthDrag] = useState(null);
  const depthRowRefs = useRef({});
  const depthTd = useRef(null);

  useEffect(() => {
    loadSaved().then(saved => {
      if (saved) {
        const ps = saved.players || [];
        setPlayers(ps); setBattingOrder(saved.battingOrder || []);
        setLineup(saved.lineup || {}); setSavedLineups(saved.savedLineups || []);
        setDepth(saved.depth || buildDefaultDepth(ps));
        const maxId = ps.reduce((m, p) => Math.max(m, p.id), 0); nextId = maxId + 1;
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    persist({ players, battingOrder, lineup, savedLineups, depth });
  }, [ready, players, battingOrder, lineup, savedLineups, depth]);

  function playerById(id) { return players.find(p => p.id === id); }

  function syncDepth(newPlayers, currentDepth) {
    const next = {};
    POSITIONS.forEach(pos => {
      const eligible = newPlayers.filter(p => p.positions.includes(pos)).map(p => p.id);
      const existing = (currentDepth[pos] || []).filter(id => eligible.includes(id));
      const added = eligible.filter(id => !existing.includes(id));
      next[pos] = [...existing, ...added];
    });
    return next;
  }

  function addPlayer() {
    if (!newName.trim() || newPos.length === 0) return;
    const p = { id: genId(), name: newName.trim(), positions: newPos };
    const next = [...players, p];
    setPlayers(next); setBattingOrder(b => [...b, p.id]);
    setDepth(d => syncDepth(next, d)); setNewName(""); setNewPos([]);
  }

  function removePlayer(id) {
    const next = players.filter(p => p.id !== id);
    setPlayers(next); setBattingOrder(b => b.filter(x => x !== id));
    setLineup(l => { const n={...l}; Object.keys(n).forEach(k => { if(n[k]===id) delete n[k]; }); return n; });
    setSavedLineups(sl => sl.map(s => ({...s, lineup: Object.fromEntries(Object.entries(s.lineup).filter(([,v]) => v !== id)), battingOrder: s.battingOrder.filter(x => x !== id)})));
    setDepth(d => { const n={...d}; POSITIONS.forEach(pos => { n[pos] = (n[pos]||[]).filter(x => x !== id); }); return n; });
  }

  function saveEdit() {
    const next = players.map(p => p.id === editingPlayer.id ? {...editingPlayer} : p);
    setPlayers(next); setDepth(d => syncDepth(next, d)); setEditingPlayer(null);
  }

  // Batting order drag (mouse)
  function onBatDragStart(e, idx) { setBatDrag({from:idx}); e.dataTransfer.effectAllowed="move"; }
  function onBatDragOver(e, idx) { e.preventDefault(); if(batDrag && batDrag.from!==idx) setBatDrag(d=>({...d,over:idx})); }
  function onBatDrop(e, idx) { e.preventDefault(); if(!batDrag) return; const {from}=batDrag; if(from!==idx) setBattingOrder(b=>{const n=[...b],[m]=n.splice(from,1);n.splice(idx,0,m);return n;}); setBatDrag(null); }

  // Batting order touch drag
  const batTouch = useRef(null);
  function onBatTouchStart(e, idx) {
    const touch=e.touches[0], el=batRowRefs.current[idx]; if(!el) return;
    const rect=el.getBoundingClientRect(); const ghost=el.cloneNode(true);
    ghost.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;opacity:.85;pointer-events:none;z-index:9999;border:1.5px solid #c8973a;background:#1a2e50;border-radius:8px;box-shadow:0 8px 24px #000a;transition:none;display:flex;align-items:center;gap:12px;padding:10px 14px;`;
    document.body.appendChild(ghost);
    batTouch.current={fromIdx:idx,ghost,offsetY:touch.clientY-rect.top,lastOver:idx}; setBatDrag({from:idx,over:idx});
  }
  function onBatTouchMove(e) {
    if(!batTouch.current) return; e.preventDefault(); const touch=e.touches[0];
    batTouch.current.ghost.style.top=`${touch.clientY-batTouch.current.offsetY}px`;
    for(let i=0;i<batRowRefs.current.length;i++){ const el=batRowRefs.current[i]; if(!el) continue; const r=el.getBoundingClientRect(); if(touch.clientY>=r.top&&touch.clientY<=r.bottom&&i!==batTouch.current.lastOver){ batTouch.current.lastOver=i; setBatDrag(d=>({...d,over:i})); break; } }
  }
  function onBatTouchEnd() {
    if(!batTouch.current) return; const {fromIdx,lastOver,ghost}=batTouch.current; ghost.remove(); batTouch.current=null;
    if(fromIdx!==lastOver) setBattingOrder(b=>{const n=[...b],[m]=n.splice(fromIdx,1);n.splice(lastOver,0,m);return n;}); setBatDrag(null);
  }

  // Field lineup: tap position to pick player
  function clearPos(pos) { setLineup(l=>{const n={...l};delete n[pos];return n;}); }

  function assignPlayerToPos(pos, playerId) {
    setLineup(l => {
      const n = {...l};
      Object.keys(n).forEach(k => { if (n[k] === playerId) delete n[k]; });
      n[pos] = playerId;
      return n;
    });
    setFieldPickPos(null);
  }

  function handleFieldPosClick(pos) {
    if (lineup[pos]) { clearPos(pos); setFieldPickPos(null); }
    else { setFieldPickPos(fieldPickPos === pos ? null : pos); }
  }

  // Auto-fill: requires pitcher first, fills in priority order (SS > 3B > 2B)
  function autoFillLineup() {
    if (!lineup["P"]) return;
    const used = new Set();
    const next = {...lineup};
    Object.values(next).forEach(id => used.add(id));
    // Fill in priority order: SS before 3B, 3B before 2B
    AUTOFILL_ORDER.forEach(pos => {
      if (next[pos]) return;
      const col = depth[pos] || [];
      const pick = col.find(id => !used.has(id));
      if (pick) { next[pos] = pick; used.add(pick); }
    });
    setLineup(next);
  }

  // Saved lineups
  function saveCurrentLineup() { const name = saveNameInput.trim() || `Lineup ${savedLineups.length+1}`; const entry = { id: genId(), name, lineup: {...lineup}, battingOrder: [...battingOrder] }; setSavedLineups(sl => [...sl, entry]); setSaveNameInput(""); setShowSaveForm(false); }
  function loadLineup(entry) { setLineup({...entry.lineup}); setBattingOrder([...entry.battingOrder]); setActiveTab("field"); }
  function deleteLineup(id) { setSavedLineups(sl => sl.filter(s => s.id !== id)); }
  function overwriteLineup(id) { setSavedLineups(sl => sl.map(s => s.id===id ? {...s,lineup:{...lineup},battingOrder:[...battingOrder]} : s)); }

  // Depth chart drag — mouse
  function onDepthDragStart(e, pos, idx) { setDepthDrag({pos,from:idx,over:idx}); e.dataTransfer.effectAllowed="move"; }
  function onDepthDragOver(e, pos, idx) { e.preventDefault(); if(depthDrag&&depthDrag.pos===pos&&depthDrag.from!==idx) setDepthDrag(d=>({...d,over:idx})); }
  function onDepthDrop(e, pos, idx) { e.preventDefault(); if(!depthDrag||depthDrag.pos!==pos) return; const {from}=depthDrag; if(from!==idx) setDepth(d=>{const n={...d,[pos]:[...d[pos]]};const [m]=n[pos].splice(from,1);n[pos].splice(idx,0,m);return n;}); setDepthDrag(null); }

  // Depth chart drag — touch
  function onDepthTouchStart(e, pos, idx) {
    const touch=e.touches[0]; const refs=depthRowRefs.current[pos]||[]; const el=refs[idx]; if(!el) return;
    const rect=el.getBoundingClientRect(); const ghost=el.cloneNode(true);
    ghost.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;opacity:.85;pointer-events:none;z-index:9999;border:1.5px solid #c8973a;background:#1a2e50;border-radius:6px;box-shadow:0 6px 20px #000a;transition:none;padding:7px 10px;font-family:'Oswald',sans-serif;color:#e8dcc8;font-size:13px;`;
    document.body.appendChild(ghost); depthTd.current={pos,fromIdx:idx,ghost,offsetY:touch.clientY-rect.top,lastOver:idx}; setDepthDrag({pos,from:idx,over:idx});
  }
  function onDepthTouchMove(e) {
    if(!depthTd.current) return; e.preventDefault(); const touch=e.touches[0]; depthTd.current.ghost.style.top=`${touch.clientY-depthTd.current.offsetY}px`;
    const {pos}=depthTd.current; const refs=depthRowRefs.current[pos]||[];
    for(let i=0;i<refs.length;i++){ const el=refs[i]; if(!el) continue; const r=el.getBoundingClientRect(); if(touch.clientY>=r.top&&touch.clientY<=r.bottom&&i!==depthTd.current.lastOver){ depthTd.current.lastOver=i; setDepthDrag(d=>({...d,over:i})); break; } }
  }
  function onDepthTouchEnd() {
    if(!depthTd.current) return; const {pos,fromIdx,lastOver,ghost}=depthTd.current; ghost.remove(); depthTd.current=null;
    if(fromIdx!==lastOver) setDepth(d=>{const n={...d,[pos]:[...d[pos]]};const [m]=n[pos].splice(fromIdx,1);n[pos].splice(lastOver,0,m);return n;}); setDepthDrag(null);
  }

  const assignedIds = new Set(Object.values(lineup));
  const hasPitcher = !!lineup["P"];

  if (!ready) return (<div style={{minHeight:"100vh",background:"#0a1628",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontFamily:"'Oswald',sans-serif",color:"#c8973a",letterSpacing:".2em",fontSize:13}}>LOADING…</div></div>);

  return (
    <div style={{minHeight:"100vh",background:"#0a1628",fontFamily:"'Georgia','Times New Roman',serif",color:"#e8dcc8"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#0a1628} ::-webkit-scrollbar-thumb{background:#c8973a;border-radius:3px}
        .tab-btn{font-family:'Oswald',sans-serif;letter-spacing:.1em;font-size:12px;text-transform:uppercase;padding:9px 16px;border:none;cursor:pointer;transition:all .2s;white-space:nowrap;border-radius:4px;}
        .tab-active{background:#c8973a;color:#0a1628;} .tab-inactive{background:transparent;color:#7a8fa6;border:1px solid #1e3350;} .tab-inactive:hover{color:#c8973a;border-color:#c8973a;}
        .pos-chip{display:inline-flex;align-items:center;justify-content:center;width:36px;height:28px;font-family:'Oswald',sans-serif;font-size:11px;font-weight:600;letter-spacing:.05em;border-radius:4px;cursor:pointer;border:1.5px solid;transition:all .15s;user-select:none;}
        .pos-on{background:#c8973a22;border-color:#c8973a;color:#c8973a;} .pos-off{background:transparent;border-color:#2a4060;color:#4a6080;} .pos-off:hover{border-color:#5a7090;color:#8aa0b8;}
        .bat-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;background:#0f2040;border:1.5px solid #1e3350;transition:border-color .15s,background .15s;cursor:grab;user-select:none;} .bat-row:active{cursor:grabbing;} .bat-row.dragging{opacity:.4;} .bat-row.drag-over{border-color:#c8973a;background:#1a2e50;} .bat-row:hover{border-color:#2e4a70;}
        .field-slot{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;-webkit-tap-highlight-color:transparent;}
        .field-circle{width:52px;height:52px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-family:'Oswald',sans-serif;font-size:11px;font-weight:700;letter-spacing:.06em;transition:all .2s;}
        .field-circle.empty{border-color:#2a4a6a;background:#0a1628aa;color:#2a4a6a;} .field-circle.filled{border-color:#c8973a;background:#c8973a22;color:#c8973a;} .field-circle.picking{border-color:#4aaa6a;background:#0a2a1a88;color:#4aaa6a;animation:pulse .8s infinite alternate;}
        @keyframes pulse{from{box-shadow:0 0 0 0 #4aaa6a44}to{box-shadow:0 0 0 8px #4aaa6a00}}
        input[type=text]{background:#0f2040;border:1.5px solid #1e3350;border-radius:6px;color:#e8dcc8;padding:10px 14px;font-family:'Crimson Text',serif;font-size:16px;outline:none;transition:border-color .2s;width:100%;} input[type=text]:focus{border-color:#c8973a;}
        .btn-primary{background:#c8973a;color:#0a1628;border:none;border-radius:6px;padding:10px 22px;font-family:'Oswald',sans-serif;font-weight:700;font-size:13px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .15s;white-space:nowrap;} .btn-primary:hover{background:#daa84a;} .btn-primary:disabled{opacity:.4;cursor:default;}
        .btn-ghost{background:transparent;color:#7a8fa6;border:1.5px solid #1e3350;border-radius:6px;padding:6px 14px;font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:all .15s;white-space:nowrap;} .btn-ghost:hover{border-color:#e05050;color:#e05050;}
        .btn-subtle{background:transparent;color:#4a7a9a;border:1.5px solid #1e3350;border-radius:6px;padding:5px 12px;font-family:'Oswald',sans-serif;font-size:10px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:all .15s;white-space:nowrap;} .btn-subtle:hover{border-color:#c8973a;color:#c8973a;}
        .section-label{font-family:'Oswald',sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#4a6a8a;margin-bottom:8px;}
        .card{background:#0f2040;border:1.5px solid #1e3350;border-radius:10px;padding:18px;}
        .player-row{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:#0f2040;border:1.5px solid #1e3350;} .player-row:hover{border-color:#2e4a70;}
        .pos-badge{font-family:'Oswald',sans-serif;font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;background:#c8973a22;color:#c8973a;border:1px solid #c8973a55;}
        .saved-card{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:8px;background:#0f2040;border:1.5px solid #1e3350;} .saved-card:hover{border-color:#2e4a70;}
        .pick-player{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:8px;background:#0f2040;border:1.5px solid #1e3350;cursor:pointer;transition:all .15s;-webkit-tap-highlight-color:transparent;} .pick-player:hover{border-color:#4aaa6a;background:#0a2a1a44;} .pick-player.already-assigned{opacity:.35;cursor:default;}
        .depth-col{flex:1;min-width:90px;max-width:130px;}
        .depth-col-header{font-family:'Oswald',sans-serif;font-size:11px;font-weight:700;letter-spacing:.1em;color:#c8973a;text-align:center;padding:6px 0;border-bottom:1px solid #1e3350;margin-bottom:6px;}
        .depth-slot{display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:6px;background:#0f2040;border:1.5px solid #1e3350;cursor:grab;user-select:none;transition:border-color .15s,background .15s;margin-bottom:5px;font-family:'Oswald',sans-serif;font-size:13px;} .depth-slot:hover{border-color:#2e4a70;} .depth-slot.dragging{opacity:.35;} .depth-slot.drag-over{border-color:#c8973a;background:#1a2e50;}
        .depth-rank{font-size:10px;color:#c8973a;font-weight:700;width:14px;text-align:right;flex-shrink:0;}
      `}</style>

      <div style={{borderBottom:"1px solid #1e3350",padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}>
        <div style={{fontSize:26}}>⚾</div>
        <div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:700,letterSpacing:".1em",color:"#c8973a"}}>LINEUP CARD</div><div style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontSize:12,color:"#4a6a8a"}}>Team Management System</div></div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}><span style={{fontFamily:"'Oswald',sans-serif",fontSize:12,color:"#4a6a8a"}}>{players.length} PLAYERS</span><span style={{width:6,height:6,borderRadius:"50%",background:"#4aaa6a",display:"inline-block"}} title="Auto-saved"/></div>
      </div>

      <div style={{display:"flex",gap:3,padding:"14px 20px 0",flexWrap:"wrap"}}>
        {[["roster","📋 Roster"],["batting","🏏 Batting"],["field","🏟 Field"],["lineups","💾 Lineups"],["depth","📊 Depth Chart"]].map(([t,label])=>(<button key={t} className={`tab-btn ${activeTab===t?"tab-active":"tab-inactive"}`} onClick={()=>{setActiveTab(t);setFieldPickPos(null);}}>{label}</button>))}
      </div>

      <div style={{padding:"20px",maxWidth:960,margin:"0 auto"}}>
        {/* ════════ ROSTER ════════ */}
        {activeTab==="roster" && (<div style={{display:"flex",flexDirection:"column",gap:20}}><div className="card"><div className="section-label">Add Player</div><div style={{display:"flex",gap:10,marginBottom:12}}><input type="text" placeholder="Player name…" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPlayer()}/><button className="btn-primary" onClick={addPlayer} disabled={!newName.trim()||newPos.length===0}>Add</button></div><div className="section-label">Positions</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{POSITIONS.map(pos=>(<div key={pos} className={`pos-chip ${newPos.includes(pos)?"pos-on":"pos-off"}`} onClick={()=>setNewPos(p=>p.includes(pos)?p.filter(x=>x!==pos):[...p,pos])} title={POSITION_LABELS[pos]}>{pos}</div>))}</div></div>{players.length===0?<div style={{textAlign:"center",color:"#3a5a7a",fontFamily:"'Crimson Text',serif",fontStyle:"italic",padding:40}}>No players yet.</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}><div className="section-label">{players.length} Players</div>{players.map(pl=>(editingPlayer?.id===pl.id?(<div key={pl.id} className="card" style={{borderColor:"#c8973a"}}><input type="text" value={editingPlayer.name} onChange={e=>setEditingPlayer(ep=>({...ep,name:e.target.value}))} style={{marginBottom:10}}/><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>{POSITIONS.map(pos=>(<div key={pos} className={`pos-chip ${editingPlayer.positions.includes(pos)?"pos-on":"pos-off"}`} onClick={()=>setEditingPlayer(ep=>({...ep,positions:ep.positions.includes(pos)?ep.positions.filter(x=>x!==pos):[...ep.positions,pos]}))} title={POSITION_LABELS[pos]}>{pos}</div>))}</div><div style={{display:"flex",gap:8}}><button className="btn-primary" onClick={saveEdit} disabled={!editingPlayer.name.trim()||editingPlayer.positions.length===0}>Save</button><button className="btn-ghost" style={{borderColor:"#2e4a70",color:"#7a8fa6"}} onClick={()=>setEditingPlayer(null)}>Cancel</button></div></div>):(<div key={pl.id} className="player-row"><div style={{fontFamily:"'Oswald',sans-serif",fontSize:15,flex:1}}>{pl.name}</div><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{pl.positions.map(p=><span key={p} className="pos-badge">{p}</span>)}</div><button className="btn-subtle" onClick={()=>setEditingPlayer({...pl})}>Edit</button><button className="btn-ghost" onClick={()=>removePlayer(pl.id)}>✕</button></div>)))}</div>}</div>)}

        {/* ════════ BATTING ORDER ════════ */}
        {activeTab==="batting" && (<div>{battingOrder.length===0?<div style={{textAlign:"center",color:"#3a5a7a",fontFamily:"'Crimson Text',serif",fontStyle:"italic",padding:60}}>Add players to the roster first.</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}><div className="section-label" style={{marginBottom:10}}>Drag to reorder</div>{battingOrder.map((pid,idx)=>{const pl=playerById(pid);if(!pl) return null;const isDragging=batDrag?.from===idx;const isOver=batDrag?.over===idx&&batDrag?.from!==idx;return(<div key={pid} ref={el=>batRowRefs.current[idx]=el} className={`bat-row${isDragging?" dragging":""}${isOver?" drag-over":""}`} draggable onDragStart={e=>onBatDragStart(e,idx)} onDragOver={e=>onBatDragOver(e,idx)} onDrop={e=>onBatDrop(e,idx)} onDragEnd={()=>setBatDrag(null)} onTouchStart={e=>onBatTouchStart(e,idx)} onTouchMove={onBatTouchMove} onTouchEnd={onBatTouchEnd} style={{touchAction:"none"}}><div style={{fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:700,color:"#c8973a",width:28,textAlign:"right"}}>{idx+1}</div><div style={{width:1,height:26,background:"#1e3350"}}/><div style={{fontSize:13,color:"#4a6a8a"}}>☰</div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:16,flex:1}}>{pl.name}</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{pl.positions.map(p=><span key={p} className="pos-badge">{p}</span>)}</div></div>);})}</div>}</div>)}

        {/* ════════ FIELD — tap to assign ════════ */}
        {activeTab==="field" && (<div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <div className="section-label" style={{marginBottom:0}}>Field Lineup</div>
            <button className="btn-primary" style={{padding:"6px 14px",fontSize:11}} onClick={autoFillLineup} disabled={!hasPitcher}>⚡ Auto-fill</button>
            {!hasPitcher && <span style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontSize:12,color:"#d4724a"}}>Select pitcher first</span>}
            {Object.keys(lineup).length>0&&<button className="btn-ghost" style={{padding:"5px 10px",fontSize:10}} onClick={()=>{setLineup({});setFieldPickPos(null);}}>Clear All</button>}
          </div>
          <div style={{position:"relative",width:340,height:340,borderRadius:12,overflow:"hidden",background:"radial-gradient(ellipse at 50% 90%,#1a4a1a 0%,#0d3010 40%,#08200a 100%)",border:"2px solid #1e3350",margin:"0 auto"}}>
            <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.35}} viewBox="0 0 340 340"><polygon points="170,260 232,198 170,136 108,198" fill="none" stroke="#7a9a7a" strokeWidth="1.5"/><path d="M108,198 Q170,52 232,198" fill="none" stroke="#7a9a7a" strokeWidth="1" strokeDasharray="4,4"/><line x1="0" y1="260" x2="340" y2="260" stroke="#7a9a7a" strokeWidth="1" opacity=".5"/><circle cx="170" cy="274" r="16" fill="none" stroke="#7a9a7a" strokeWidth="1.5"/></svg>
            {POSITIONS.filter(p=>p!=="DH").map(pos=>{const coords=FIELD_POSITIONS[pos];const assignedId=lineup[pos];const assignedPlayer=assignedId?playerById(assignedId):null;const isPicking=fieldPickPos===pos;const cc=isPicking?"picking":(assignedPlayer?"filled":"empty");return(<div key={pos} className="field-slot" style={{top:coords.top,left:coords.left}} onClick={()=>handleFieldPosClick(pos)}><div className={`field-circle ${cc}`}>{assignedPlayer?<span style={{fontSize:8,textAlign:"center",padding:"0 2px",lineHeight:1.2}}>{assignedPlayer.name.split(" ").map(w=>w[0]).join("").slice(0,3)}</span>:pos}</div>{assignedPlayer&&<div style={{fontFamily:"'Oswald',sans-serif",fontSize:8,color:"#c8973a",background:"#0a1628cc",padding:"1px 4px",borderRadius:3,whiteSpace:"nowrap",maxWidth:60,overflow:"hidden",textOverflow:"ellipsis"}}>{assignedPlayer.name.split(" ")[0]}</div>}</div>);})}
          </div>
          <div style={{marginTop:8,display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:8,border:fieldPickPos==="DH"?"1.5px solid #4aaa6a":"1.5px dashed #2a4a6a",background:fieldPickPos==="DH"?"#0a2a1a44":"#0a1628",cursor:"pointer",maxWidth:340,margin:"8px auto 0"}} onClick={()=>handleFieldPosClick("DH")}>
            <span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,color:fieldPickPos==="DH"?"#4aaa6a":"#4a6a8a",letterSpacing:".1em",fontWeight:700}}>DH</span>
            {lineup["DH"]?(()=>{const dhPl=playerById(lineup["DH"]);return <span style={{fontFamily:"'Oswald',sans-serif",fontSize:14,color:"#c8973a"}}>{dhPl?.name}</span>;})():<span style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontSize:13,color:"#2a4a6a"}}>Tap to assign</span>}
          </div>
          {fieldPickPos && (()=>{const pos=fieldPickPos;const eligible=players.filter(p=>p.positions.includes(pos));return(<div className="card" style={{borderColor:"#4aaa6a",marginTop:14,maxWidth:340,marginLeft:"auto",marginRight:"auto"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}><span style={{fontFamily:"'Oswald',sans-serif",fontSize:16,fontWeight:700,color:"#4aaa6a"}}>Select {POSITION_LABELS[pos]}</span><button className="btn-ghost" style={{borderColor:"#2e4a70",color:"#7a8fa6",padding:"4px 10px",fontSize:10}} onClick={()=>setFieldPickPos(null)}>Cancel</button></div>{eligible.length===0?<div style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontSize:13,color:"#3a5a7a",textAlign:"center",padding:16}}>No players can play {pos}.</div>:<div style={{display:"flex",flexDirection:"column",gap:6}}>{eligible.map(pl=>{const isUsed=assignedIds.has(pl.id)&&lineup[pos]!==pl.id;return(<div key={pl.id} className={`pick-player${isUsed?" already-assigned":""}`} onClick={()=>!isUsed&&assignPlayerToPos(pos,pl.id)}><div style={{fontFamily:"'Oswald',sans-serif",fontSize:15,flex:1}}>{pl.name}</div>{isUsed&&<span style={{fontFamily:"'Oswald',sans-serif",fontSize:9,color:"#4a6a8a"}}>IN LINEUP</span>}{!isUsed&&<span style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:"#4aaa6a"}}>SELECT</span>}</div>);})}</div>}</div>);})()}
          {Object.keys(lineup).length>0&&(<div style={{marginTop:16,maxWidth:340,marginLeft:"auto",marginRight:"auto"}}><div className="section-label">Current Lineup</div>{POSITIONS.filter(p=>lineup[p]).map(pos=>(<div key={pos} style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}><span style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:"#c8973a",width:28}}>{pos}</span><span style={{fontFamily:"'Crimson Text',serif",fontSize:14,flex:1}}>{playerById(lineup[pos])?.name}</span><button className="btn-ghost" style={{padding:"2px 6px",fontSize:10}} onClick={()=>clearPos(pos)}>✕</button></div>))}</div>)}
        </div>)}

        {/* ════════ SAVED LINEUPS ════════ */}
        {activeTab==="lineups" && (<div style={{display:"flex",flexDirection:"column",gap:20}}><div className="card"><div className="section-label">Save Current Lineup</div><div style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontSize:13,color:"#5a7a9a",marginBottom:12}}>Saves the current field lineup + batting order as a named snapshot.</div>{showSaveForm?(<div style={{display:"flex",gap:10}}><input type="text" placeholder="Lineup name…" value={saveNameInput} onChange={e=>setSaveNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveCurrentLineup()}/><button className="btn-primary" onClick={saveCurrentLineup}>Save</button><button className="btn-ghost" style={{borderColor:"#2e4a70",color:"#7a8fa6"}} onClick={()=>setShowSaveForm(false)}>Cancel</button></div>):(<button className="btn-primary" onClick={()=>setShowSaveForm(true)}>💾 Save Snapshot</button>)}</div>{savedLineups.length===0?<div style={{textAlign:"center",color:"#3a5a7a",fontFamily:"'Crimson Text',serif",fontStyle:"italic",padding:40}}>No saved lineups yet.</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}><div className="section-label">{savedLineups.length} Saved Lineup{savedLineups.length!==1?"s":""}</div>{savedLineups.map(s=>{const starters=POSITIONS.filter(p=>s.lineup[p]);return(<div key={s.id} className="saved-card"><div style={{flex:1}}><div style={{fontFamily:"'Oswald',sans-serif",fontSize:16,marginBottom:4}}>{s.name}</div><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{starters.map(pos=>(<span key={pos} style={{fontFamily:"'Oswald',sans-serif",fontSize:9,padding:"2px 6px",borderRadius:3,background:"#0a1628",border:"1px solid #1e3350",color:"#7a8fa6"}}>{pos}: {playerById(s.lineup[pos])?.name?.split(" ")[0]||"?"}</span>))}</div><div style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontSize:12,color:"#4a6a8a",marginTop:4}}>{s.battingOrder.length} batters</div></div><div style={{display:"flex",flexDirection:"column",gap:5}}><button className="btn-subtle" onClick={()=>loadLineup(s)}>Load →</button><button className="btn-subtle" onClick={()=>overwriteLineup(s.id)}>Overwrite</button><button className="btn-ghost" style={{padding:"4px 10px",fontSize:10}} onClick={()=>deleteLineup(s.id)}>Delete</button></div></div>);})}</div>}</div>)}

        {/* ════════ DEPTH CHART — columns with drag-and-drop ════════ */}
        {activeTab==="depth" && (<div>
          {players.length===0
            ?<div style={{textAlign:"center",color:"#3a5a7a",fontFamily:"'Crimson Text',serif",fontStyle:"italic",padding:60}}>Add players to the roster first.</div>
            :<>
              <div style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontSize:13,color:"#5a7a9a",marginBottom:16}}>
                Drag players within a column to set depth order. #1 is the starter.
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-start",overflowX:"auto",paddingBottom:8}}>
                {POSITIONS.map(pos=>{
                  const col=depth[pos]||[];
                  if(col.length===0) return(
                    <div key={pos} className="depth-col" style={{opacity:.4}}>
                      <div className="depth-col-header">{pos}</div>
                      <div style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontSize:12,color:"#3a5a7a",textAlign:"center",padding:"8px 0"}}>—</div>
                    </div>
                  );
                  if(!depthRowRefs.current[pos]) depthRowRefs.current[pos]=[];
                  return(
                    <div key={pos} className="depth-col">
                      <div className="depth-col-header">{pos}<span style={{fontFamily:"'Crimson Text',serif",fontStyle:"italic",fontWeight:400,fontSize:10,color:"#4a6a8a",marginLeft:4}}>{POSITION_LABELS[pos]}</span></div>
                      {col.map((pid,idx)=>{
                        const pl=playerById(pid); if(!pl) return null;
                        const isDragging=depthDrag?.pos===pos&&depthDrag.from===idx;
                        const isOver=depthDrag?.pos===pos&&depthDrag.over===idx&&depthDrag.from!==idx;
                        return(
                          <div key={pid}
                            ref={el=>{if(!depthRowRefs.current[pos])depthRowRefs.current[pos]=[];depthRowRefs.current[pos][idx]=el;}}
                            className={`depth-slot${isDragging?" dragging":""}${isOver?" drag-over":""}`}
                            draggable
                            onDragStart={e=>onDepthDragStart(e,pos,idx)}
                            onDragOver={e=>onDepthDragOver(e,pos,idx)}
                            onDrop={e=>onDepthDrop(e,pos,idx)}
                            onDragEnd={()=>setDepthDrag(null)}
                            onTouchStart={e=>onDepthTouchStart(e,pos,idx)}
                            onTouchMove={onDepthTouchMove}
                            onTouchEnd={onDepthTouchEnd}
                            style={{touchAction:"none"}}>
                            <span className="depth-rank">{idx+1}</span>
                            <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13}}>{pl.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          }
        </div>)}
      </div>
    </div>
  );
}