/* ESP.EE v4.5.3-UX — layout sem sidebar, UI uniforme, mobile-first */

/* ====== Constantes ====== */
const SITE_ID = 'esparedes-my.sharepoint.com,540a0485-2578-481e-b4d8-220b41fb5c43,7335dc42-69c8-42d6-8282-151e3783162d';
const CFG_PATH = '/Documents/GestaoAlunos-OneDrive/config_especial.json';
const REG_PATH = '/Documents/GestaoAlunos-OneDrive/2registos_alunos.json';
const BACKUP_FOLDER = '/Documents/GestaoAlunos-OneDrive/backup';
const ADMINS = ['biblioteca@esparedes.pt']; // role gate

const MSAL_CONFIG = { auth: { clientId:'c5573063-8a04-40d3-92bf-eb229ad4701c', authority:'https://login.microsoftonline.com/d650692c-6e73-48b3-af84-e3497ff3e1f1', redirectUri:'https://bibliotecaesparedes-hub.github.io/esp-painel-professor-v4.5/' }, cache:{ cacheLocation:'localStorage', storeAuthStateInCookie:false } };
const MSAL_SCOPES = { scopes:['Files.ReadWrite.All','User.Read','openid','profile','offline_access'] };

/* ====== Estado ====== */
let msalApp, account, accessToken;
const state = { config:null, reg:{versao:'v2', registos:[]} };
const $ = s=>document.querySelector(s);

/* ====== Util ====== */
function updateSync(t){ const el=$('#syncIndicator'); if(el) el.textContent=t; }
function toast(t){ try{ Swal.fire({toast:true,position:'top-end',timer:1500,showConfirmButton:false,title:t}); }catch{} }
function isAdmin(){ const email=(account?.username||'').trim().toLowerCase(); return ADMINS.includes(email); }
function setSessionName(){ const el=$('#sessNome'); if(!el) return; el.textContent = account? `Sessão: ${account.name||account.username}` : 'Sessão: não iniciada'; }
function applyRoleVisibilityHard(){ const adminSec=$('#admin'); if(adminSec) adminSec.classList.toggle('hidden', !isAdmin()); }
function updateAuthButtons(){ const logged=!!account; $('#btnMsLogin')?.classList.toggle('hidden', logged); $('#btnMsLogout')?.classList.toggle('hidden', !logged); setSessionName(); }

/* ====== MSAL ====== */
async function initMsal(){ if(typeof msal==='undefined'){ console.error('MSAL missing'); return; } msalApp=new msal.PublicClientApplication(MSAL_CONFIG); try{ const resp=await msalApp.handleRedirectPromise(); if(resp&&resp.account){ account=resp.account; msalApp.setActiveAccount(account); await acquireToken(); } const accs=msalApp.getAllAccounts(); if(accs.length && !account){ account=accs[0]; msalApp.setActiveAccount(account); await acquireToken(); } }catch(e){ console.warn('msal init',e);} setSessionName(); updateAuthButtons(); applyRoleVisibilityHard(); }
async function acquireToken(){ if(!msalApp) return; try{ const r=await msalApp.acquireTokenSilent(MSAL_SCOPES); accessToken=r.accessToken; return accessToken; }catch(e){ try{ await msalApp.acquireTokenRedirect(MSAL_SCOPES);}catch(err){ console.error(err);} } }
function ensureLogin(){ if(msalApp) msalApp.loginRedirect(MSAL_SCOPES); }
function ensureLogout(){ if(msalApp) msalApp.logoutRedirect(); }

/* ====== Graph ====== */
async function graphLoad(path){ if(!accessToken) await acquireToken(); try{ const url=`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${path}:/content`; const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}}); if(r.ok){ const txt=await r.text(); return txt? JSON.parse(txt): null; } if(r.status===404) return null; throw new Error('Graph '+r.status); }catch(e){ console.warn('graphLoad',e); return null; } }
async function graphSave(path,obj){ if(!accessToken) await acquireToken(); try{ const url=`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${path}:/content`; const r=await fetch(url,{method:'PUT',headers:{Authorization:`Bearer ${accessToken}`},body:JSON.stringify(obj,null,2)}); if(!r.ok) throw new Error('save '+r.status); return await r.json(); }catch(e){ console.warn('graphSave',e); throw e; } }
async function graphList(folderPath){ if(!accessToken) await acquireToken(); const url=`https://graph.microsoft.com/v1.0/sites/${SITE_ID}/drive/root:${folderPath}:/children`; try{ const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}}); if(!r.ok) throw new Error('list '+r.status); const data=await r.json(); return Array.isArray(data.value)? data.value: []; }catch(e){ console.warn('graphList',e); return []; } }

/* ====== Onboarding/Migração mínima ====== */
function isRegData(o){ return o && typeof o==='object' && (o.versao||o.version) && Array.isArray(o.registos); }
function isCfg(o){ return o && typeof o==='object' && Array.isArray(o.professores); }
async function onboardingIfNeeded(){ return true; }

/* ====== Carregamento ====== */
async function loadConfigAndReg(){ updateSync('🔁 sincronizando...'); let cfg=await graphLoad(CFG_PATH); let reg=await graphLoad(REG_PATH); if(isRegData(cfg) && (!reg || !Array.isArray(reg.registos) || reg.registos.length===0)){ try{ await graphSave(REG_PATH,cfg); reg=cfg; cfg={professores:[],alunos:[],disciplinas:[],oficinas:[],calendario:{}}; await graphSave(CFG_PATH,cfg); toast('Config/Registos migrados automaticamente'); }catch(e){ console.warn('auto-migração',e); } }
  state.config = isCfg(cfg)? cfg : (JSON.parse(localStorage.getItem('esp_config')||'{}')||{});
  state.reg    = isRegData(reg)? reg : (JSON.parse(localStorage.getItem('esp_reg')||'{}')||{versao:'v2',registos:[]});
  state.config.professores ||= []; state.config.alunos ||= []; state.config.disciplinas ||= []; state.config.oficinas ||= []; state.config.calendario ||= {};
  localStorage.setItem('esp_config', JSON.stringify(state.config)); localStorage.setItem('esp_reg', JSON.stringify(state.reg));
  await onboardingIfNeeded(); updateSync('💾 guardado'); applyRoleVisibilityHard(); updateAuthButtons(); renderHoje(); renderRegList(); }

/* ====== Hoje (Oficinas por dia; registo por aluno) ====== */
function diaSemana(dateStr){ const d=new Date(dateStr); const g=d.getDay(); return g===0?7:g; }
function getOficinasHoje(profId,dateStr){ const dw=diaSemana(dateStr); return (state.config.oficinas||[]).filter(s=> s.professorId===profId && Number(s.diaSemana)===Number(dw)); }
function renderHoje(){ const date=$('#dataHoje')?.value || new Date().toISOString().slice(0,10); if($('#dataHoje')) $('#dataHoje').value=date; const out=$('#sessoesHoje'); if(!out) return; out.innerHTML=''; if(isAdmin()){ out.innerHTML='<div class="muted">Perfil admin — use Administração.</div>'; return; } const email=(account?.username||'').toLowerCase(); const prof=(state.config.professores||[]).find(p=> (p.email||'').toLowerCase()===email); if(!prof){ out.innerHTML='<div class="muted">Professor não reconhecido.</div>'; return; } const oficinas=getOficinasHoje(prof.id,date); if(!oficinas.length){ out.innerHTML='<div class="muted">Sem oficinas para hoje.</div>'; return; }
  const alunosById=Object.fromEntries((state.config.alunos||[]).map(a=>[String(a.id),a])); const discById=Object.fromEntries((state.config.disciplinas||[]).map(d=>[String(d.id),d]));
  oficinas.forEach(sess=>{ const disc=discById[sess.disciplinaId]||{nome:sess.disciplinaId}; const alunos=(sess.alunoIds||[]).map(id=>alunosById[id]).filter(Boolean); const card=document.createElement('div'); card.className='card'; card.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div><strong>${disc.nome}</strong> <span class="muted">• Sala ${sess.sala||'-'}</span></div>
      <div class="muted">${sess.horaInicio||''} – ${sess.horaFim||''}</div>
    </div>
    <div style="margin-top:10px">
      ${alunos.map(a=>`
        <div style="display:grid;grid-template-columns:120px 1fr 120px 200px;gap:6px;align-items:center;margin:6px 0">
          <div><strong>${a.numero||''}</strong> ${a.nome}</div>
          <input class="input sumario" data-aluno="${a.id}" placeholder="Sumário (por aluno)">
          <input class="input nlec" data-aluno="${a.id}" placeholder="Nº lição">
          <select class="input status" data-aluno="${a.id}">
            <option value="P">Presente</option>
            <option value="A">Ausente (injust.)</option>
            <option value="J">J (just.)</option>
          </select>
        </div>`).join('')}
    </div>
    <div class="controls-row"><button class="btn" data-saveSess>Guardar registos desta oficina</button></div>`; out.appendChild(card);
    card.querySelector('[data-saveSess]')?.addEventListener('click', async ()=>{
      const inputsSum=[...card.querySelectorAll('.sumario')]; const inputsNum=[...card.querySelectorAll('.nlec')]; const inputsSts=[...card.querySelectorAll('.status')];
      const mapSum=Object.fromEntries(inputsSum.map(i=>[i.dataset.aluno,i.value.trim()])); const mapNum=Object.fromEntries(inputsNum.map(i=>[i.dataset.aluno,i.value.trim()])); const mapSts=Object.fromEntries(inputsSts.map(i=>[i.dataset.aluno,i.value]));
      const batch=(sess.alunoIds||[]).map(aid=>({ id:'R'+Date.now()+aid, data:date, professorId:prof.id, disciplinaId:sess.disciplinaId, alunoId:aid, sessaoId:sess.id, numeroLicao:mapNum[aid]||'', sumario:mapSum[aid]||'', status:mapSts[aid]||'P', justificacao:'', criadoEm:new Date().toISOString() }));
      state.reg.registos.push(...batch); await persistReg(); toast(`Guardado: ${batch.length} registos`); renderRegList();
    });
  });
}

/* ====== Registos + atrasos ====== */
function expectedSessDates(sess, startISO, endISO){ const res=[]; const start=new Date(startISO), end=new Date(endISO); for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){ const ds=d.toISOString().slice(0,10); const dw=diaSemana(ds); if(Number(dw)===Number(sess.diaSemana)) res.push(ds);} return res; }
function getAtrasos(profId){ const today=new Date().toISOString().slice(0,10); const weekAgo=new Date(Date.now()-6*86400000).toISOString().slice(0,10); const regKey=new Map(); (state.reg.registos||[]).forEach(r=>{ const k=`${r.data}|${r.professorId}|${r.disciplinaId}|${r.alunoId}|${r.sessaoId||''}`; regKey.set(k,r); }); const atrasos=[]; (state.config.oficinas||[]).filter(s=>s.professorId===profId).forEach(sess=>{ const days=expectedSessDates(sess,weekAgo,today); (sess.alunoIds||[]).forEach(aid=>{ days.forEach(ds=>{ const key=`${ds}|${sess.professorId}|${sess.disciplinaId}|${aid}|${sess.id||''}`; const r=regKey.get(key); if(!r || !r.numeroLicao || !r.sumario || !r.status){ atrasos.push({data:ds,sessaoId:sess.id,alunoId:aid,disciplinaId:sess.disciplinaId}); } }); }); }); return atrasos.sort((a,b)=> a.data<b.data?-1:1); }
function renderRegList(){ const el=$('#regList'); if(!el) return; el.innerHTML=''; if(!isAdmin()){ const email=(account?.username||'').toLowerCase(); const prof=(state.config.professores||[]).find(p=> (p.email||'').toLowerCase()===email); if(prof){ const atrasos=getAtrasos(prof.id); if(atrasos.length){ const wrap=document.createElement('div'); wrap.className='card'; wrap.innerHTML=`<h4>Registos em atraso (${atrasos.length})</h4>` + atrasos.map(a=>`<div style="padding:6px;border-bottom:1px solid var(--primary-border)">${a.data} | ${a.disciplinaId} | aluno ${a.alunoId} <button class="btn" data-completar="${a.data}|${a.disciplinaId}|${a.alunoId}|${a.sessaoId||''}">Completar</button></div>`).join(''); el.appendChild(wrap); wrap.querySelectorAll('[data-completar]').forEach(b=> b.addEventListener('click',()=> openCompletarModal(b.dataset.completar))); } } }
  const ini=$('#fltIni')?.value, fim=$('#fltFim')?.value; (state.reg.registos||[]).filter(r=>{ if(!ini&&!fim) return true; const d=r.data; if(ini && d<ini) return false; if(fim && d>fim) return false; return true; }).slice().reverse().forEach(r=>{ const div=document.createElement('div'); div.className='card'; const status=r.status==='P'?'Presente':(r.status==='A'?'Ausente (injust.)':(r.status==='J'?'J (just.)':(r.presenca===true?'Presente':r.presenca===false?'Ausente':'-'))); div.textContent=`${r.data} • ${r.disciplinaId} • aluno ${r.alunoId||'-'} • Nº ${r.numeroLicao||'-'} • ${r.sumario||'-'} • ${status}`; el.appendChild(div); }); }
async function openCompletarModal(key){ const [data,disc,alunoId,sessId]=key.split('|'); const { value: form } = await Swal.fire({ title:`Completar registo ${data}`, html:`<input id="nlec" class="swal2-input" placeholder="Nº lição"><input id="sum" class="swal2-input" placeholder="Sumário"><select id="sts" class="swal2-input"><option value="P">Presente</option><option value="A">Ausente (injust.)</option><option value="J">J (just.)</option></select><input id="just" class="swal2-input" placeholder="Justificação (se J)">`, confirmButtonText:'Guardar', showCancelButton:true, preConfirm:()=>({ n:$('#nlec').value.trim(), s:$('#sum').value.trim(), st:$('#sts').value, j:$('#just').value.trim() }) }); if(!form) return; const email=(account?.username||'').toLowerCase(); const prof=(state.config.professores||[]).find(p=> (p.email||'').toLowerCase()===email); state.reg.registos.push({ id:'R'+Date.now()+alunoId, data, professorId:prof?.id, disciplinaId:disc, alunoId, sessaoId:sessId||'', numeroLicao:form.n, sumario:form.s, status:form.st, justificacao:form.j, criadoEm:new Date().toISOString() }); await persistReg(); renderRegList(); }

/* ====== Persistência ====== */
async function persistReg(){ try{ updateSync('🔁 sincronizando...'); await graphSave(REG_PATH,state.reg); localStorage.setItem('esp_reg',JSON.stringify(state.reg)); updateSync('💾 guardado'); }catch(e){ console.warn('save failed',e); localStorage.setItem('esp_reg',JSON.stringify(state.reg)); updateSync('⚠ offline'); Swal.fire('Aviso','Guardado localmente. Será sincronizado quando online.','warning'); } }

/* ====== Exportações PDF/XLSX ====== */
function semanaRange(){ const hoje=new Date(); const ini=new Date(hoje); ini.setDate(hoje.getDate()-hoje.getDay()+1); const fim=new Date(ini); fim.setDate(ini.getDate()+6); return [ini.toISOString().slice(0,10), fim.toISOString().slice(0,10)]; }
async function exportSemanalPDF(){ if(!window.jspdf||!window.jspdf.jsPDF){ Swal.fire('Erro','jsPDF não disponível','error'); return; } const email=(account?.username||'').toLowerCase(); const prof=(state.config.professores||[]).find(p=> (p.email||'').toLowerCase()===email); if(!prof) return; const [sISO,eISO]=semanaRange(); const rows=(state.reg.registos||[]).filter(r=> r.professorId===prof.id && r.data>=sISO && r.data<=eISO).map(r=>[r.data,r.alunoId,r.disciplinaId,r.numeroLicao||'',r.sumario||'', r.status==='P'?'Presente':(r.status==='A'?'Ausente (injust.)':(r.status==='J'?'J (just.)':''))]); const doc=new window.jspdf.jsPDF({unit:'pt',format:'a4'}); doc.text(`Registos semanais • ${sISO} a ${eISO}`,40,40); doc.autoTable({startY:60, head:[['Data','Aluno','Oficina','Nº','Sumário','Presença']], body:rows, styles:{fontSize:9}}); doc.save(`registos_${sISO}_${eISO}.pdf`); }
async function exportSemanalXLSX(){ const email=(account?.username||'').toLowerCase(); const prof=(state.config.professores||[]).find(p=> (p.email||'').toLowerCase()===email); if(!prof){ Swal.fire('Erro','Sem professor','error'); return; } const [sISO,eISO]=semanaRange(); const rows=(state.reg.registos||[]).filter(r=> r.professorId===prof.id && r.data>=sISO && r.data<=eISO).map(r=>({ Data:r.data, Aluno:r.alunoId, Oficina:r.disciplinaId, Numero:r.numeroLicao||'', Sumario:r.sumario||'', Presenca:(r.status==='P'?'Presente':(r.status==='A'?'Ausente (injust.)':(r.status==='J'?'J (just.)':''))) })); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Semana'); const bin=XLSX.write(wb,{bookType:'xlsx',type:'array'}); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bin],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=`registos_${sISO}_${eISO}.xlsx`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200); }
async function exportAlunoPDF(){ if(!window.jspdf||!window.jspdf.jsPDF){ Swal.fire('Erro','jsPDF não disponível','error'); return; } const { value: form } = await Swal.fire({ title:'Exportar por aluno (PDF)', html:`<input id="al" class="swal2-input" placeholder="ID do aluno"><input id="di" class="swal2-input" type="date"><input id="df" class="swal2-input" type="date">`, confirmButtonText:'Exportar', showCancelButton:true, preConfirm:()=>({ a:$('#al').value.trim(), i:$('#di').value, f:$('#df').value }) }); if(!form||!form.a) return; const rows=(state.reg.registos||[]).filter(r=> r.alunoId===form.a && (!form.i||r.data>=form.i) && (!form.f||r.data<=form.f)).map(r=>[r.data,r.disciplinaId,r.numeroLicao||'',r.sumario||'', r.status==='P'?'Presente':(r.status==='A'?'Ausente (injust.)':(r.status==='J'?'J (just.)':''))]); const doc=new window.jspdf.jsPDF({unit:'pt',format:'a4'}); doc.text(`Aluno ${form.a} • ${form.i||'…'} a ${form.f||'…'}`,40,40); doc.autoTable({startY:60, head:[['Data','Oficina','Nº','Sumário','Presença']], body:rows, styles:{fontSize:9}}); doc.save(`aluno_${form.a}_${form.i||'ini'}_${form.f||'fim'}.pdf`); }
async function exportAlunoXLSX(){ const { value: form } = await Swal.fire({ title:'Exportar por aluno (XLSX)', html:`<input id="alx" class="swal2-input" placeholder="ID do aluno"><input id="dix" class="swal2-input" type="date"><input id="dfx" class="swal2-input" type="date">`, confirmButtonText:'Exportar', showCancelButton:true, preConfirm:()=>({ a:$('#alx').value.trim(), i:$('#dix').value, f:$('#dfx').value }) }); if(!form||!form.a) return; const rows=(state.reg.registos||[]).filter(r=> r.alunoId===form.a && (!form.i||r.data>=form.i) && (!form.f||r.data<=form.f)).map(r=>({ Data:r.data, Oficina:r.disciplinaId, Numero:r.numeroLicao||'', Sumario:r.sumario||'', Presenca:(r.status==='P'?'Presente':(r.status==='A'?'Ausente (injust.)':(r.status==='J'?'J (just.)':''))) })); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Aluno'); const bin=XLSX.write(wb,{bookType:'xlsx',type:'array'}); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([bin],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=`aluno_${form.a}_${form.i||'ini'}_${form.f||'fim'}.xlsx`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1200); }

/* ====== Administração (import/export) ====== */
document.addEventListener('change', async (ev)=>{ if(ev.target && ev.target.id==='fileImport'){ const files=ev.target.files; if(!files||!files.length) return; for(const f of files){ const name=f.name.toLowerCase(); if(name.endsWith('.xlsx')){ const data=await f.arrayBuffer(); const wb=XLSX.read(data); const rows = wb.SheetNames.includes('Oficinas') ? XLSX.utils.sheet_to_json(wb.Sheets['Oficinas']) : []; if(rows.length){ const novas=rows.map(r=>({ id:String(r.id||'').trim(), professorId:String(r.professorId||'').trim(), disciplinaId:String(r.disciplinaId||'').trim(), alunoIds:String(r.alunoIds||'').split(',').map(s=>s.trim()).filter(Boolean), diaSemana:Number(r.diaSemana||0), horaInicio:String(r.horaInicio||'').trim(), horaFim:String(r.horaFim||'').trim(), sala:String(r.sala||'').trim() })).filter(x=> x.id && x.professorId && x.disciplinaId && x.alunoIds.length && x.diaSemana>=1 && x.diaSemana<=7 && x.horaInicio && x.horaFim); state.config.oficinas ||= []; const byId=new Map(state.config.oficinas.map(o=>[String(o.id),o])); novas.forEach(n=> byId.set(String(n.id), n)); state.config.oficinas = Array.from(byId.values()); }
          // fallback: primeira folha como professores caso esteja vazia
          const first = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]] || {});
          if(first.length && !(state.config.professores||[]).length){ const map=first.map(r=>({ id:r.id||r.ID||r.Codigo||r.codigo, nome:r.nome||r.Nome||r.NOME, email:r.email||r.Email||r.EMAIL })).filter(x=>x.id&&x.nome); if(map.length) state.config.professores=map; }
          await graphSave(CFG_PATH,state.config); localStorage.setItem('esp_config',JSON.stringify(state.config)); Swal.fire('Importado','XLSX importado.','success');
        } else if(name.endsWith('.json')){ const txt=await f.text(); try{ state.config=JSON.parse(txt); await graphSave(CFG_PATH,state.config); localStorage.setItem('esp_config',JSON.stringify(state.config)); Swal.fire('Importado','JSON importado e guardado.','success'); }catch{ Swal.fire('Erro','JSON inválido','error'); } }
      } } });

/* ====== Auto-save & Backup ====== */
let autosaveTimer=null; function autoSaveConfig(){ if(autosaveTimer) clearTimeout(autosaveTimer); autosaveTimer=setTimeout(async()=>{ try{ await graphSave(CFG_PATH,state.config); localStorage.setItem('esp_config',JSON.stringify(state.config)); updateSync('💾 guardado'); }catch(e){ console.warn('auto-save',e); updateSync('⚠ offline'); } },800); }
async function createBackupIfExists(){ try{ const current=state.config || JSON.parse(localStorage.getItem('esp_config')||'{}'); if(!current) return null; const now=new Date(); const ts= now.getFullYear().toString().padStart(4,'0')+(now.getMonth()+1).toString().padStart(2,'0')+now.getDate().toString().padStart(2,'0')+'_'+now.getHours().toString().padStart(2,'0')+now.getMinutes().toString().padStart(2,'0'); const backupPath=BACKUP_FOLDER+`/config_especial_${ts}.json`; await graphSave(backupPath,current); toast('Backup criado'); return backupPath; }catch(e){ console.warn(e); return null; } }
async function restoreBackup(){ try{ updateSync('🔁 a ler backups...'); const items=await graphList(BACKUP_FOLDER); const onlyCfg=items.filter(it=> it?.name?.startsWith('config_especial_') && it?.name?.endsWith('.json')).sort((a,b)=> a.name<b.name?1:-1); if(!onlyCfg.length){ Swal.fire('Restauração','Sem backups.','info'); updateSync('—'); return; } const options={}; onlyCfg.forEach(f=> options[f.name]=f.name); const { value: pick }=await Swal.fire({title:'Restaurar backup',input:'select',inputOptions:options,inputPlaceholder:'Escolhe o ficheiro',showCancelButton:true}); if(!pick){ updateSync('—'); return; } updateSync('🔁 a restaurar...'); const content=await graphLoad(`${BACKUP_FOLDER}/${pick}`); if(!content){ Swal.fire('Erro','Falha a ler o backup.','error'); updateSync('⚠ offline'); return; } await graphSave(CFG_PATH,content); state.config=content; localStorage.setItem('esp_config',JSON.stringify(state.config)); toast('Configuração restaurada'); renderHoje(); renderRegList(); updateSync('💾 guardado'); }catch(e){ console.warn(e); Swal.fire('Aviso','Não foi possível restaurar.','warning'); updateSync('⚠ offline'); } }

/* ====== UI bindings ====== */
document.addEventListener('DOMContentLoaded', async ()=>{
  $('#btnMsLogin')?.addEventListener('click', ()=>ensureLogin());
  $('#btnMsLogout')?.addEventListener('click', ()=>ensureLogout());
  $('#btnRefreshDay')?.addEventListener('click', ()=>renderHoje());
  $('#btnCriarOficina')?.addEventListener('click', ()=>novaOficinaRapida());
  $('#btnBackupNow')?.addEventListener('click', async ()=>{ const b=await createBackupIfExists(); if(b) Swal.fire('Backup criado', b, 'success'); });
  $('#btnExportCfgJson')?.addEventListener('click', ()=>download('config_especial.json', state.config||{}));
  $('#btnExportRegJson')?.addEventListener('click', ()=>download('2registos_alunos.json', state.reg||{versao:'v2', registos:[]}));
  $('#btnExportCfgXlsx')?.addEventListener('click', ()=>exportConfigXlsx());
  $('#btnExportRegXlsx')?.addEventListener('click', ()=>exportRegXlsx());
  $('#btnRestoreBackup')?.addEventListener('click', ()=>restoreBackup());
  $('#btnFiltrar')?.addEventListener('click', ()=>renderRegList());
  $('#btnPdfSemana')?.addEventListener('click', ()=>exportSemanalPDF());
  $('#btnXlsxSemana')?.addEventListener('click', ()=>exportSemanalXLSX());
  $('#btnPdfAluno')?.addEventListener('click', ()=>exportAlunoPDF());
  $('#btnXlsxAluno')?.addEventListener('click', ()=>exportAlunoXLSX());

  const theme = localStorage.getItem('esp_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if(theme==='dark') document.documentElement.setAttribute('data-theme','dark');

  await initMsal();
  const c=localStorage.getItem('esp_config'); if(c) state.config=JSON.parse(c);
  const r=localStorage.getItem('esp_reg'); if(r) state.reg=JSON.parse(r);
  if(!state.config) state.config={professores:[],alunos:[],disciplinas:[],oficinas:[],calendario:{}};
  if(!state.reg) state.reg={versao:'v2',registos:[]};
  await loadConfigAndReg();
});

/* ====== Helpers export ====== */
function downloadBlob(filename, blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1200); }
function download(filename, data){ const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); downloadBlob(filename, blob); }
function exportConfigXlsx(){ if(typeof XLSX==='undefined'){ alert('XLSX não carregou'); return; } const cfg=state.config||{professores:[],alunos:[],disciplinas:[],oficinas:[],calendario:{}}; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.professores||[]), 'Professores'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.alunos||[]), 'Alunos'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.disciplinas||[]), 'Disciplinas'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfg.oficinas||[]), 'Oficinas'); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([cfg.calendario||{}]), 'Calendario'); const bin=XLSX.write(wb,{bookType:'xlsx',type:'array'}); downloadBlob(`config_${new Date().toISOString().slice(0,10)}.xlsx`, new Blob([bin],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); }
function exportRegXlsx(){ if(typeof XLSX==='undefined'){ alert('XLSX não carregou'); return; } const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((state.reg?.registos)||[]), 'Registos'); const bin=XLSX.write(wb,{bookType:'xlsx',type:'array'}); downloadBlob(`registos_${new Date().toISOString().slice(0,10)}.xlsx`, new Blob([bin],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); }

/* ====== Nova oficina rápida (para professor) ====== */
async function novaOficinaRapida(){ if(isAdmin()){ Swal.fire('Nota','Crie oficinas em massa via XLSX na Administração.','info'); return; } const email=(account?.username||'').toLowerCase(); const prof=(state.config.professores||[]).find(p=> (p.email||'').toLowerCase()===email); if(!prof){ Swal.fire('Aviso','Professor não reconhecido na configuração.','warning'); return; } const { value: form } = await Swal.fire({ title:'Nova oficina', html:`<div style="text-align:left">
  <label>ID</label><input id="o_id" class="swal2-input" value="sess${Date.now().toString().slice(-4)}">
  <label>Disciplina/Oficina (id)</label><input id="o_disc" class="swal2-input" value="${(state.config.disciplinas?.[0]?.id||'of_port')}">
  <label>Alunos (IDs separados por vírgulas)</label><input id="o_al" class="swal2-input" placeholder="a001,a002">
  <label>Dia da semana (1=Seg,..7=Dom)</label><input id="o_dw" class="swal2-input" value="${diaSemana(new Date().toISOString().slice(0,10))}">
  <label>Hora início</label><input id="o_ini" class="swal2-input" value="10:00">
  <label>Hora fim</label><input id="o_fim" class="swal2-input" value="10:50">
  <label>Sala</label><input id="o_sala" class="swal2-input" value="CAA"></div>`, confirmButtonText:'Guardar', showCancelButton:true, preConfirm:()=>({ id:document.getElementById('o_id').value.trim(), disciplinaId:document.getElementById('o_disc').value.trim(), alunoIds:(document.getElementById('o_al').value||'').split(',').map(s=>s.trim()).filter(Boolean), diaSemana:Number(document.getElementById('o_dw').value||1), horaInicio:document.getElementById('o_ini').value.trim(), horaFim:document.getElementById('o_fim').value.trim(), sala:document.getElementById('o_sala').value.trim() }) }); if(!form||!form.id) return; form.professorId=prof.id; state.config.oficinas ||= []; state.config.oficinas.push(form); await graphSave(CFG_PATH,state.config); localStorage.setItem('esp_config',JSON.stringify(state.config)); toast('Oficina criada'); renderHoje(); }
