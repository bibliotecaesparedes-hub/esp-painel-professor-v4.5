/* ESP.EE v4.5 — onboarding + self-healing + chamada por aluno */

const SITE_ID = 'esparedes-my.sharepoint.com,540a0485-2578-481e-b4d8-220b41fb5c43,7335dc42-69c8-42d6-8282-151e3783162d';
const CFG_PATH = '/Documents/GestaoAlunos-OneDrive/config_especial.json';
const REG_PATH = '/Documents/GestaoAlunos-OneDrive/2registos_alunos.json';
const BACKUP_FOLDER = '/Documents/GestaoAlunos-OneDrive/backup';

const MSAL_CONFIG = {
  auth: {
    clientId: 'c5573063-8a04-40d3-92bf-eb229ad4701c',
    authority: 'https://login.microsoftonline.com/d650692c-6e73-48b3-af84-e3497ff3e1f1',
    redirectUri: 'https://bibliotecaesparedes-hub.github.io/esp-painel-professor-v4.5/'
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
};
const MSAL_SCOPES = { scopes: ['Files.ReadWrite.All','User.Read','openid','profile','offline_access'] };

let msalApp, account, accessToken;
const state = { config:null, reg:{versao:'v1', registos:[]} };
const $ = s => document.querySelector(s);

function updateSync(t){ const el=$('#syncIndicator'); if(el) el.textContent=t; }
function toast(t){ try{ Swal.fire({toast:true,position:'top-end',timer:1500,showConfirmButton:false,title:t}); }catch{} }
function setSessionName(){ const el=$('#sessNome'); if(!el) return; el.textContent = account? `Sessão: ${account.name||account.username}` : 'Sessão: não iniciada'; }

async function initMsal(){ if(typeof msal==='undefined'){ console.error('MSAL missing'); return; } msalApp = new msal.PublicClientApplication(MSAL_CONFIG);
  try{ const resp=await msalApp.handleRedirectPromise(); if(resp&&resp.account){ account=resp.account; msalApp.setActiveAccount(account); await acquireToken(); onLogin(); return; }
    const accs=msalApp.getAllAccounts(); if(accs.length){ account=accs[0]; msalApp.setActiveAccount(account); await acquireToken(); onLogin(); return; } setSessionName(); }catch(e){ console.warn('msal init',e); setSessionName(); } }
async function acquireToken(){ if(!msalApp) return; try{ const r=await msalApp.acquireTokenSilent(MSAL_SCOPES); accessToken=r.accessToken; return accessToken; }catch(e){ try{ await msalApp.acquireTokenRedirect(MSAL_SCOPES);}catch(err){ console.error(err);} } }
function ensureLogin(){ if(typeof msal==='undefined'){ alert('MSAL não carregou.'); return; } if(msalApp) msalApp.loginRedirect(MSAL_SCOPES); }
function ensureLogout(){ if(msalApp) msalApp.logoutRedirect(); else { account=null; setSessionName(); } }

async function graphLoad(path){ if(!accessToken) await acquireToken(); try{ const url=`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${path}:/content`; const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}}); if(r.ok){ const txt=await r.text(); return txt? JSON.parse(txt): null; } if(r.status===404) return null; throw new Error('Graph '+r.status); }catch(e){ console.warn('graphLoad',e); return null; } }
async function graphSave(path,obj){ if(!accessToken) await acquireToken(); try{ const url=`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${path}:/content`; const r=await fetch(url,{method:'PUT',headers:{Authorization:`Bearer ${accessToken}`},body:JSON.stringify(obj,null,2)}); if(!r.ok) throw new Error('save '+r.status); return await r.json(); }catch(e){ console.warn('graphSave',e); throw e; } }
async function graphList(folderPath){ if(!accessToken) await acquireToken(); const url=`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${folderPath}:/children`; try{ const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}}); if(!r.ok) throw new Error('list '+r.status); const data=await r.json(); return Array.isArray(data.value)? data.value: []; }catch(e){ console.warn('graphList',e); return []; } }

function isRegData(o){ return o && typeof o==='object' && o.versao && Array.isArray(o.registos); }
function isCfg(o){ return o && typeof o==='object' && Array.isArray(o.professores); }

async function onboardingIfNeeded(){
  const email = (account?.username||'').trim().toLowerCase();
  const existing = (state.config?.professores||[]).find(p=> (p.email||'').trim().toLowerCase()===email);
  if(existing) return true;

  const { value: form } = await Swal.fire({
    title: 'Configuração inicial',
    html: `
      <div style="text-align:left">
        <label>Professor (nome)</label>
        <input id="p_nome" class="swal2-input" value="${account?.name||''}" placeholder="Nome"/>
        <label>E-mail</label>
        <input id="p_email" class="swal2-input" value="${account?.username||''}" placeholder="email@dominio"/>
        <label>ID (ex.: p001)</label>
        <input id="p_id" class="swal2-input" value="p001"/>
      </div>`,
    focusConfirm: false,
    confirmButtonText: 'Guardar',
    showCancelButton: false,
    preConfirm: ()=> ({
      id: document.getElementById('p_id').value.trim()||'p001',
      nome: document.getElementById('p_nome').value.trim()||'Professor',
      email: document.getElementById('p_email').value.trim()||email
    })
  });
  if(!form) return false;

  const cfg = state.config && isCfg(state.config) ? state.config : { professores:[], alunos:[], disciplinas:[], grupos:[], calendario:{} };
  if(!Array.isArray(cfg.professores)) cfg.professores = [];
  cfg.professores.push(form);
  // cria disciplina e grupo base para arrancar
  cfg.disciplinas ||= []; if(!cfg.disciplinas.length) cfg.disciplinas.push({ id:'geral', nome:'Geral' });
  cfg.grupos ||= []; cfg.grupos.push({ id:'g1', professorId:form.id, disciplinaId:(cfg.disciplinas[0]?.id||'geral'), turma:'TURMA', sala:'-', horaInicio:'08:15', horaFim:'09:05' });

  await graphSave(CFG_PATH, cfg);
  state.config = cfg; localStorage.setItem('esp_config', JSON.stringify(cfg));
  toast('Config inicial criada');
  return true;
}

async function loadConfigAndReg(){
  updateSync('🔁 sincronizando...');
  let cfg = await graphLoad(CFG_PATH);
  let reg = await graphLoad(REG_PATH);

  // auto-migração: se CFG tiver registos por engano
  if(isRegData(cfg) && (!reg || !Array.isArray(reg.registos) || reg.registos.length===0)){
    try{ await graphSave(REG_PATH,cfg); reg=cfg; cfg={professores:[], alunos:[], disciplinas:[], grupos:[], calendario:{}}; await graphSave(CFG_PATH,cfg); toast('Config/Registos migrados automaticamente'); }catch(e){ console.warn('auto-migração falhou',e); }
  }

  state.config = isCfg(cfg) ? cfg : (JSON.parse(localStorage.getItem('esp_config')||'{}')||{});
  state.reg    = isRegData(reg) ? reg : (JSON.parse(localStorage.getItem('esp_reg')||'{}')||{versao:'v1', registos:[]});

  // normalizar
  state.config.professores ||= []; state.config.alunos ||= []; state.config.disciplinas ||= []; state.config.grupos ||= (state.config.horarios||[]); state.config.calendario ||= {};
  localStorage.setItem('esp_config', JSON.stringify(state.config));
  localStorage.setItem('esp_reg', JSON.stringify(state.reg));

  // Se não reconhecer o professor, abrir onboarding
  await onboardingIfNeeded();

  updateSync('💾 guardado');
  renderDay(); renderRegList(); setSessionName();
}

function profAtual(){ const email=(account?.username||'').trim().toLowerCase(); return (state.config.professores||[]).find(p=> (p.email||'').trim().toLowerCase()===email); }

function getAlunosParaGrupo(g){
  if (g.alunosIds && Array.isArray(g.alunosIds)) { const set = new Set(g.alunosIds.map(String)); return (state.config.alunos||[]).filter(a=> set.has(String(a.id))); }
  if (g.turma) return (state.config.alunos||[]).filter(a=> (a.turma||'').toString().toLowerCase() === String(g.turma).toLowerCase());
  return state.config.alunos||[];
}

function nextNumeroLicao(g){ const last=(state.reg.registos||[]).filter(r=> r.professorId===g.professorId && r.disciplinaId===g.disciplinaId && r.grupoId===g.id).slice(-1)[0]; const n= parseInt(last?.numeroLicao||'0',10); return isNaN(n)? '1' : String(n+1); }

function renderDay(){ const date=$('#dataHoje').value || new Date().toISOString().slice(0,10); $('#dataHoje').value=date; const out=$('#sessoesHoje'); out.innerHTML='';
  if(!state.config || !state.config.professores){ out.innerHTML='<div class="small">⚠️ Config não carregada.</div>'; return; }
  const prof = profAtual(); if(!prof){ out.innerHTML='<div class="small">Professor não reconhecido. <a href="#" id="fixProf">Corrigir</a></div>'; const link=out.querySelector('#fixProf'); if(link) link.addEventListener('click', async (e)=>{ e.preventDefault(); await onboardingIfNeeded(); renderDay(); }); return; }
  const grupos=(state.config.grupos||[]).filter(g=> g.professorId===prof.id);
  if(!grupos.length){ out.innerHTML='<div class="small">Sem sessões definidas. Use o botão "Novo grupo" acima.</div>'; return; }
  grupos.forEach(g=>{ const disc=(state.config.disciplinas||[]).find(d=> d.id===g.disciplinaId)||{nome:g.disciplinaId};
    const card=document.createElement('div'); card.className='card';
    card.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div><strong>${disc.nome}</strong> <span class="small">• Sala ${g.sala||'-'}</span> <span class="badge">${g.turma||''}</span></div>
        <div class="small">${g.horaInicio||g.inicio||'08:15'} – ${g.horaFim||g.fim||'09:05'}</div>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input class="input lessonNumber" placeholder="Nº Lição" style="width:100px" value="${nextNumeroLicao(g)}">
        <input class="input sumario" placeholder="Sumário" style="flex:1;min-width:220px">
        <button class="btn presencaP">Presente</button>
        <button class="btn ghost presencaF" style="background:#d33a2c">Falta</button>
        <button class="btn ghost duplicate">Duplicar</button>
        <button class="btn" data-chamada>Abrir chamada</button>
      </div>
      <div class="chamadaArea" style="margin-top:10px;display:none"></div>
    `;
    out.appendChild(card);
    card.querySelector('.presencaP').addEventListener('click', ()=> quickSaveAttendance(g,card,true));
    card.querySelector('.presencaF').addEventListener('click', ()=> quickSaveAttendance(g,card,false));
    card.querySelector('.duplicate').addEventListener('click', ()=> duplicatePrevious(g,card));
    card.querySelector('[data-chamada]').addEventListener('click', ()=> toggleChamada(card,g));
  });
}

function toggleChamada(card,g){ const area=card.querySelector('.chamadaArea'); if(area.style.display==='none' || area.innerHTML===''){ renderChamada(area,g,card); area.style.display='block'; } else { area.style.display='none'; } }

function renderChamada(area,g,card){ const alunos = getAlunosParaGrupo(g); if(!alunos.length){ area.innerHTML='<div class="small">Sem alunos associados ao grupo/turma.</div>'; return; }
  const rows = alunos.map(a=> `
    <tr data-id="${a.id}">
      <td>${a.numero||''}</td>
      <td>${a.nome||''}</td>
      <td>
        <label><input type="radio" name="pres_${a.id}" value="P" checked> P</label>
        <label style="margin-left:8px"><input type="radio" name="pres_${a.id}" value="F"> F</label>
        <label style="margin-left:8px"><input type="radio" name="pres_${a.id}" value="J"> J</label>
      </td>
    </tr>`).join('');
  area.innerHTML = `
    <div class="card" style="background:#fafcff">
      <h4>Chamada — ${alunos.length} alunos</h4>
      <table class="table">
        <thead><tr><th>Nº</th><th>Nome</th><th>Estado</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="controls">
        <button class="btn" data-save>Guardar chamada</button>
        <button class="btn ghost" data-close>Fechar</button>
      </div>
    </div>`;
  area.querySelector('[data-close]').addEventListener('click', ()=> area.style.display='none');
  area.querySelector('[data-save]').addEventListener('click', ()=> saveChamada(g,card,area));
}

function makeId(){ return 'R'+Date.now(); }
function duplicatePrevious(g,card){ const prev=(state.reg.registos||[]).filter(r=> r.professorId===g.professorId).slice(-1)[0]; if(!prev){ Swal.fire('Duplicar','Nenhum registo anterior.','info'); return; } card.querySelector('.lessonNumber').value = prev.numeroLicao||''; card.querySelector('.sumario').value = prev.sumario||''; toast('Campos preenchidos.'); }

async function quickSaveAttendance(group,card,present=true){ const lesson=card.querySelector('.lessonNumber')?.value.trim()||''; const sumario=card.querySelector('.sumario')?.value.trim()||''; if(!lesson){ const res=await Swal.fire({title:'Nº Lição vazio', text:'Gravar sem nº?', showCancelButton:true}); if(!res.isConfirmed) return; }
  const date=$('#dataHoje').value || new Date().toISOString().slice(0,10);
  const reg = { id:makeId(), tipo:'rapido', data:date, professorId:group.professorId, disciplinaId:group.disciplinaId, grupoId:group.id, numeroLicao:lesson, sumario:sumario, presenca:present, criadoEm:new Date().toISOString() };
  state.reg.registos.push(reg); await persistReg(); renderRegList(); }

async function saveChamada(group,card,area){ const date=$('#dataHoje').value || new Date().toISOString().slice(0,10); const lesson=card.querySelector('.lessonNumber')?.value.trim()||nextNumeroLicao(group); const sumario=card.querySelector('.sumario')?.value.trim()||'';
  const rows=[...area.querySelectorAll('tbody tr')]; const presencas=rows.map(tr=>{ const id=tr.getAttribute('data-id'); const sel=area.querySelector(`input[name=pres_${id}]:checked`); return { alunoId:id, estado: sel? sel.value : 'P' }; });
  const reg = { id:makeId(), tipo:'chamada', data:date, professorId:group.professorId, disciplinaId:group.disciplinaId, grupoId:group.id, numeroLicao:lesson, sumario:sumario, presencas, criadoEm:new Date().toISOString() };
  state.reg.registos.push(reg); await persistReg(); toast('Chamada guardada'); area.style.display='none'; renderRegList(); }

async function persistReg(){ try{ updateSync('🔁 sincronizando...'); await graphSave(REG_PATH, state.reg); localStorage.setItem('esp_reg', JSON.stringify(state.reg)); updateSync('💾 guardado'); }catch(e){ console.warn('save failed', e); localStorage.setItem('esp_reg', JSON.stringify(state.reg)); updateSync('⚠ offline'); Swal.fire('Aviso','Guardado localmente. Será sincronizado quando online.','warning'); } }

function renderRegList(){ const el=$('#regList'); if(!el) return; el.innerHTML=''; (state.reg.registos||[]).slice().reverse().forEach(r=>{
  let meta = r.tipo==='chamada' && Array.isArray(r.presencas)? ` | P:${r.presencas.filter(x=>x.estado==='P').length} F:${r.presencas.filter(x=>x.estado==='F').length} J:${r.presencas.filter(x=>x.estado==='J').length}` : '';
  el.innerHTML += `<div style="padding:6px;border-bottom:1px solid #eee">${r.data} • ${r.disciplinaId||''} • ${r.numeroLicao||'-'} • ${r.sumario||'-'}${meta}</div>`;
  }); }

function showAdminTab(tab){ const c=$('#adminContent'); if(!c) return; if(tab==='professores'){ const rows=(state.config.professores||[]).map(p=>`<div style=\"padding:8px;border-bottom:1px solid #eee\"><strong>${p.id} — ${p.nome}</strong><div class=small>${p.email||''}</div></div>`).join(''); c.innerHTML=rows||'<div class=small>Sem professores</div>'; }
  if(tab==='alunos'){ const rows=(state.config.alunos||[]).map(a=>`<div style=\"padding:8px;border-bottom:1px solid #eee\">${a.id} — ${a.nome} <span class=small>${a.turma||''}</span></div>`).join(''); c.innerHTML=rows||'<div class=small>Sem alunos</div>'; }
  if(tab==='disciplinas'){ const rows=(state.config.disciplinas||[]).map(d=>`<div style=\"padding:8px;border-bottom:1px solid #eee\">${d.id} — ${d.nome}</div>`).join(''); c.innerHTML=rows||'<div class=small>Sem disciplinas</div>'; }
  if(tab==='grupos'){ const rows=(state.config.grupos||[]).map(g=>`<div style=\"padding:8px;border-bottom:1px solid #eee\">${g.id} • ${g.professorId} • ${g.disciplinaId} • ${g.turma||''} • ${g.horaInicio||g.inicio}-${g.horaFim||g.fim}</div>`).join(''); c.innerHTML=rows||'<div class=small>Sem grupos</div>'; }
  if(tab==='calendario'){ c.innerHTML='<pre style=white-space:pre-wrap>'+JSON.stringify(state.config.calendario||{},null,2)+'</pre>'; } }

async function novoGrupo(){ const prof = profAtual(); if(!prof){ await onboardingIfNeeded(); return; }
  const { value: form } = await Swal.fire({
    title: 'Novo grupo (turma/horário)',
    html: `
      <div style="text-align:left">
        <label>ID do grupo</label>
        <input id="g_id" class="swal2-input" value="g${Date.now().toString().slice(-4)}"/>
        <label>Disciplina</label>
        <input id="g_disc" class="swal2-input" value="${(state.config.disciplinas?.[0]?.id||'geral')}"/>
        <label>Turma (ex.: 10A)</label>
        <input id="g_turma" class="swal2-input" placeholder="10A"/>
        <label>Sala</label>
        <input id="g_sala" class="swal2-input" value="-"/>
        <div style="display:flex;gap:8px">
          <div style="flex:1"><label>Início</label><input id="g_ini" class="swal2-input" value="08:15"/></div>
          <div style="flex:1"><label>Fim</label><input id="g_fim" class="swal2-input" value="09:05"/></div>
        </div>
      </div>`,
    confirmButtonText: 'Guardar',
    preConfirm: ()=>({ id:$('#g_id').value.trim(), disciplinaId:$('#g_disc').value.trim()||'geral', turma:$('#g_turma').value.trim(), sala:$('#g_sala').value.trim()||'-', horaInicio:$('#g_ini').value.trim()||'08:15', horaFim:$('#g_fim').value.trim()||'09:05' })
  });
  if(!form || !form.id) return;
  state.config.grupos.push({ ...form, professorId: prof.id });
  await graphSave(CFG_PATH, state.config);
  localStorage.setItem('esp_config', JSON.stringify(state.config));
  toast('Grupo criado');
  renderDay();
}

document.addEventListener('DOMContentLoaded', async ()=>{
  $('#btnMsLogin')?.addEventListener('click', ()=> ensureLogin());
  $('#btnMsLogout')?.addEventListener('click', ()=> ensureLogout());
  $('#btnRefreshDay')?.addEventListener('click', ()=> renderDay());
  $('#btnCriarGrupo')?.addEventListener('click', ()=> novoGrupo());
  $('#btnBackupNow')?.addEventListener('click', async ()=>{ const b=await createBackupIfExists(); if(b) Swal.fire('Backup criado', b, 'success'); });
  $('#btnExportCfgJson')?.addEventListener('click', ()=> download('config_especial.json', state.config||{}));
  $('#btnExportRegJson')?.addEventListener('click', ()=> download('2registos_alunos.json', state.reg||{versao:'v1', registos:[]}));
  $('#btnExportCfgXlsx')?.addEventListener('click', ()=> exportConfigXlsx());
  $('#btnExportRegXlsx')?.addEventListener('click', ()=> exportRegXlsx());
  $('#btnRestoreBackup')?.addEventListener('click', ()=> restoreBackup());

  document.querySelectorAll('.navbtn').forEach(b=> b.addEventListener('click', ()=>{ document.querySelectorAll('.navbtn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); const s=b.getAttribute('data-section'); document.querySelectorAll('.section').forEach(sec=>sec.classList.remove('active')); document.getElementById(s).classList.add('active'); if(s==='admin') showAdminTab('professores'); }));
  document.querySelectorAll('.tab').forEach(t=> t.addEventListener('click', ()=>{ document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); showAdminTab(t.getAttribute('data-tab')); }));

  const theme = localStorage.getItem('esp_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if(theme==='dark') document.documentElement.setAttribute('data-theme','dark');

  await initMsal();
  const c=localStorage.getItem('esp_config'); if(c) state.config=JSON.parse(c);
  const r=localStorage.getItem('esp_reg'); if(r) state.reg=JSON.parse(r);
  if(!state.config) state.config={professores:[],alunos:[],disciplinas:[],grupos:[],calendario:{}};
  if(!state.reg) state.reg={versao:'v1',registos:[]};
  await loadConfigAndReg();
  setSessionName();

  // Logs úteis para troubleshooting
  console.log('[ESP.EE] account.username =', account?.username);
  console.log('[ESP.EE] professores:', (state.config.professores||[]).map(p=>p.email));
});

function downloadBlob(filename, blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1200); }
function download(filename, data){ const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); downloadBlob(filename, blob); }

function exportConfigXlsx(){ if(typeof XLSX==='undefined'){ alert('XLSX não carregou'); return; } const cfg=state.config||{professores:[],alunos:[],disciplinas:[],grupos:[],calendario:{}}; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.professores||[]), 'Professores'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.alunos||[]), 'Alunos'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.disciplinas||[]), 'Disciplinas'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.grupos||cfg.horarios||[]), 'Grupos'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([cfg.calendario||{}]), 'Calendario'); const bin=XLSX.write(wb,{bookType:'xlsx',type:'array'}); downloadBlob(`config_${new Date().toISOString().slice(0,10)}.xlsx`, new Blob([bin],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); }
function exportRegXlsx(){ if(typeof XLSX==='undefined'){ alert('XLSX não carregou'); return; } const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((state.reg?.registos)||[]), 'Registos'); const bin=XLSX.write(wb,{bookType:'xlsx',type:'array'}); downloadBlob(`registos_${new Date().toISOString().slice(0,10)}.xlsx`, new Blob([bin],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); }

let autosaveTimer=null; function autoSaveConfig(){ if(autosaveTimer) clearTimeout(autosaveTimer); autosaveTimer=setTimeout(async()=>{ try{ await graphSave(CFG_PATH,state.config); localStorage.setItem('esp_config', JSON.stringify(state.config)); updateSync('💾 guardado'); }catch(e){ console.warn('auto-save failed',e); updateSync('⚠ offline'); localStorage.setItem('esp_config', JSON.stringify(state.config)); } },800); }
async function createBackupIfExists(){ try{ const current=state.config || JSON.parse(localStorage.getItem('esp_config')||'{}'); if(!current) return null; const now=new Date(); const ts= now.getFullYear().toString().padStart(4,'0')+ (now.getMonth()+1).toString().padStart(2,'0')+ now.getDate().toString().padStart(2,'0')+'_'+ now.getHours().toString().padStart(2,'0')+ now.getMinutes().toString().padStart(2,'0'); const backupPath= BACKUP_FOLDER+`/config_especial_${ts}.json`; await graphSave(backupPath,current); toast('Backup criado'); return backupPath; }catch(e){ console.warn(e); return null; } }
