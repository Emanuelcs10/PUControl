/* PU Control — integração real com Supabase. Não coloque secret/service_role neste arquivo. */
(()=>{
'use strict';
const cfg=window.PU_SUPABASE;
const $=id=>document.getElementById(id);
const supabase=window.supabase?.createClient?.(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
if(!supabase){alert('Não foi possível carregar Supabase. Verifique a conexão e a configuração.');return;}
let authUser=null, machines=[], sizes=[], modelSizes=[];
window.puSizes=[];
const message=e=>{console.error(e);toast('Erro: '+(e?.message||String(e)));};
async function query(table){const {data,error}=await supabase.from(table).select('*').order('created_at',{ascending:false,nullsFirst:false});if(error && /created_at/.test(error.message)){const retry=await supabase.from(table).select('*');if(retry.error)throw retry.error;return retry.data||[];}if(error)throw error;return data||[];}
async function refresh(){
 const [ms,ma,mo,lo,sz,links]=await Promise.all([query('machines'),query('materials'),query('models'),query('losses'),query('piece_sizes'),query('model_sizes')]);
 sizes=sz;modelSizes=links;window.puSizes=sizes;
 machines=ms;
 const machineById=id=>machines.find(x=>x.id===id);
 db.materials=ma.map(x=>({id:x.id,code:x.code,name:x.name,unit:x.unit,price:Number(x.price_per_piece||0),active:x.active}));
 db.models=mo.map(x=>({id:x.id,code:x.code,number:x.number||'',sizeIds:modelSizes.filter(link=>link.model_id===x.id).map(link=>link.size_id),name:x.name||'',machine:machineById(x.machine_id)?.code||'',materialId:x.default_material_id||'',limit:Number(x.loss_limit||1),active:x.active}));
 db.losses=lo.map(x=>({id:x.id,date:x.occurred_at,modelId:x.model_id,modelCode:x.model_code_snapshot||'',materialId:x.material_id,materialCode:x.material_code_snapshot||'',reason:x.reason||'',sizeId:x.size_id||null,sizeLabel:x.size_label_snapshot||sizes.find(sz=>sz.id===x.size_id)?.label||'',qty:Number(x.quantity||0),unit:'peça(s)',normalizedQty:Number(x.quantity||0),costUnit:Number(x.unit_cost||0),cost:Number(x.total_cost??(Number(x.quantity||0)*Number(x.unit_cost||0))),machine:x.machine_code_snapshot||machineById(x.machine_id)?.code||'',notes:x.notes||'',photo:'',createdBy:x.created_by,photoPath:x.photo_path,shift:x.shift??null}));
 db.users=[];
 if(currentUser?.role==='admin'){
  const {data,error}=await supabase.from('profiles').select('id,username,email,full_name,role,active,shift');
  if(error)throw error;
  db.users=(data||[]).map(p=>({id:p.id,username:p.username,email:p.email||'',name:p.full_name||p.username,role:p.role,active:p.active,shift:p.shift??null}));
 }
 renderAll();refreshLossForm();renderLossSizes();renderSizeAdmin();renderModelSizes();
}
async function startSession(user){
 const {data:profile,error}=await supabase.from('profiles').select('id,username,full_name,role,active,shift').eq('id',user.id).single();
 if(error)throw error;
 if(!profile?.active)throw new Error('Perfil desativado. Solicite acesso ao administrador.');
 authUser=user;
 currentUser={id:user.id,username:profile.username,name:profile.full_name||profile.username,role:profile.role,shift:profile.shift??null};
 await refresh();if(profile.shift)$('lossShift').value=String(profile.shift);
 $('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');applyRole();init();
}
function intercept(id,event,handler){$(id).addEventListener(event,async e=>{e.preventDefault();e.stopImmediatePropagation();try{await handler(e);}catch(err){message(err);}},true);}
intercept('loginForm','submit',async()=>{
 const email=$('loginUser').value.trim(),password=$('loginPass').value;
 const {data,error}=await supabase.auth.signInWithPassword({email,password});
 if(error)throw error;
 try{await startSession(data.user);}catch(e){await supabase.auth.signOut();throw e;}
});
$('logoutBtn').addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();await supabase.auth.signOut();authUser=null;currentUser=null;db={models:[],materials:[],losses:[],users:[]};$('app').classList.add('hidden');$('loginScreen').classList.remove('hidden');$('loginPass').value='';},true);
intercept('materialForm','submit',async()=>{
 if(!isAdmin())throw new Error('Sem permissão.');
 const id=$('materialId').value, payload={code:$('materialCode').value.trim(),name:$('materialName').value.trim(),unit:'peça',price_per_piece:Number($('materialPrice').value),active:$('materialActive').value==='true'};
 const r=id?await supabase.from('materials').update(payload).eq('id',id):await supabase.from('materials').insert(payload);
 if(r.error)throw r.error;await refresh();resetMaterialForm();toast('Material salvo no Supabase.');
});
intercept('modelForm','submit',async()=>{
 if(!isAdmin())throw new Error('Sem permissão.');
 const id=$('modelId').value,code=$('modelMachine').value.trim();let machine=machines.find(m=>m.code===code);
 if(!machine&&code){const r=await supabase.from('machines').insert({code,name:code,active:true}).select('id,code').single();if(r.error)throw r.error;machine=r.data;machines.push(machine);}
 const selectedSizes=[...document.querySelectorAll('#modelSizes input:checked')].map(el=>el.value);
 if(!selectedSizes.length)throw new Error('Marque ao menos uma numeração para o modelo.');
 const payload={code:$('modelCode').value.trim(),number:selectedSizes.map(id=>sizes.find(x=>x.id===id)?.label).filter(Boolean).join(', '),name:$('modelName').value.trim(),machine_id:machine?.id||null,default_material_id:$('modelMaterial').value||null,loss_limit:Math.max(1,Number($('modelLimit').value)),active:$('modelActive').value==='true'};
 const r=id?await supabase.from('models').update(payload).eq('id',id).select('id').single():await supabase.from('models').insert(payload).select('id').single();
 if(r.error)throw r.error;
 const modelId=r.data.id;
 // Sincroniza numerações do modelo, preservando as demais tabelas.
 const del=await supabase.from('model_sizes').delete().eq('model_id',modelId);if(del.error)throw del.error;
 const add=await supabase.from('model_sizes').insert(selectedSizes.map(size_id=>({model_id:modelId,size_id})));if(add.error)throw add.error;
 await refresh();resetModelForm();toast('Modelo e numerações salvos no Supabase.');
});
intercept('lossForm','submit',async()=>{
 if(!canRecord())throw new Error('Sem permissão.');
 const model=modelById($('lossModel').value),mat=materialById($('lossMaterial').value),qty=Number($('lossQty').value),size=sizes.find(x=>x.id===$('lossSize').value&&x.active);
 if(!model||!mat||!size||!model.sizeIds.includes(size.id)||!Number.isInteger(qty)||qty<1)throw new Error('Selecione modelo, material e quantidade inteira válida.');
 const file=$('lossPhoto').files?.[0];
 if(file)throw new Error('Fotos ainda não estão habilitadas. Remova a foto para salvar a perda.');
 const machine=machines.find(m=>m.code===model.machine);
 const shift=Number($('lossShift').value);if(![1,2,3].includes(shift))throw new Error('Selecione o turno da ocorrência.');
 const payload={occurred_at:new Date($('lossDate').value).toISOString(),model_id:model.id,model_code_snapshot:model.code,size_id:size.id,size_label_snapshot:size.label,material_id:mat.id,material_code_snapshot:mat.code,machine_id:machine?.id||null,machine_code_snapshot:model.machine||null,reason:$('lossReason').value,quantity:qty,unit_cost:Number(mat.price),notes:$('lossNotes').value.trim(),created_by:authUser.id,shift};
 const r=await supabase.from('losses').insert(payload);if(r.error)throw r.error;
 await refresh();$('lossForm').reset();if(currentUser.shift)$('lossShift').value=String(currentUser.shift);$('lossPhoto').value='';$('photoPreview').classList.add('hidden');$('lossDate').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);toast('Perda registrada no Supabase.');navigate(currentUser.role==='operator'?'registro':'dashboard');
});
window.deleteLoss=async id=>{if(!isAdmin()||!confirm('Excluir esta ocorrência?'))return;try{const r=await supabase.from('losses').delete().eq('id',id);if(r.error)throw r.error;await refresh();toast('Ocorrência excluída.');}catch(e){message(e);}};
window.deleteModel=async id=>{if(!isAdmin()||!confirm('Excluir este modelo?'))return;try{const r=await supabase.from('models').delete().eq('id',id);if(r.error)throw r.error;await refresh();toast('Modelo excluído.');}catch(e){message(e);}};
window.deleteMaterial=async id=>{if(!isAdmin()||!confirm('Excluir este material?'))return;try{const r=await supabase.from('materials').delete().eq('id',id);if(r.error)throw r.error;await refresh();toast('Material excluído.');}catch(e){message(e);}};
// Cadastro de contas reais: criação passa por Edge Function com checagem de administrador no servidor.
window.renderUsers=function(){
 if(!$('usersBody'))return;
 const q=($('userSearch')?.value||'').toLowerCase();
 $('usersBody').innerHTML=(db.users||[]).filter(u=>[u.username,u.email,u.name,roleNames[u.role]||u.role].join(' ').toLowerCase().includes(q)).map(u=>
 `<tr><td><strong>${esc(u.username)}</strong></td><td>${esc(u.email||'—')}</td><td>${esc(u.name)}</td><td>${esc(roleNames[u.role]||u.role)}</td><td>${u.shift?u.shift+'º Turno':'—'}</td><td><span class="pill ${u.active?'ok':'warn'}">${u.active?'Ativo':'Inativo'}</span></td><td class="no-print"><button class="btn secondary" onclick="editUser('${u.id}')">Editar</button></td></tr>`).join('');
};
window.resetUserForm=function(){
 $('userForm').reset();$('userId').value='';$('newUsername').disabled=false;$('newUserEmail').disabled=false;
 $('newUserPassword').disabled=false;$('newUserPassword').required=true;$('newUserPassword').minLength=8;
 $('passwordRequiredLabel').textContent='*';$('newUserPassword').placeholder='Mínimo de 8 caracteres';
 $('newUserRole').value='operator';$('newUserShift').value='';$('newUserActive').value='true';$('userFormTitle').textContent='Cadastrar usuário';
};
window.editUser=function(id){
 const u=(db.users||[]).find(x=>x.id===id);if(!u)return;
 $('userId').value=u.id;$('newUsername').value=u.username;$('newUsername').disabled=true;
 $('newUserEmail').value=u.email||'';$('newUserEmail').disabled=true;
 $('newUserName').value=u.name;$('newUserPassword').value='';$('newUserPassword').required=false;
 $('newUserPassword').disabled=true;$('passwordRequiredLabel').textContent='(gerenciada pelo Supabase Auth)';
 $('newUserPassword').placeholder='Senha não editável aqui';
 $('newUserRole').value=u.role;$('newUserShift').value=u.shift?String(u.shift):'';$('newUserActive').value=String(u.active);
 $('userFormTitle').textContent='Editar usuário';window.scrollTo({top:0,behavior:'smooth'});
};
async function createAccount(payload){
 const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
 if(sessionError||!sessionData?.session?.access_token)throw new Error('Sessão expirada. Entre novamente.');
 const response=await fetch(`${cfg.url}/functions/v1/admin-users`,{
   method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.key,'Authorization':`Bearer ${sessionData.session.access_token}`},
   body:JSON.stringify(payload)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||`Não foi possível criar a conta (HTTP ${response.status}). Verifique se a Edge Function admin-users foi publicada.`);
 return result;
}
intercept('userForm','submit',async()=>{
 if(!isAdmin())throw new Error('Sem permissão.');
 const id=$('userId').value;
 const username=$('newUsername').value.trim().toLowerCase(),email=$('newUserEmail').value.trim().toLowerCase();
 const name=$('newUserName').value.trim(),password=$('newUserPassword').value;
 const role=$('newUserRole').value,active=$('newUserActive').value==='true',shift=$('newUserShift').value?Number($('newUserShift').value):null;
 if(!/^[a-z0-9._-]{3,}$/.test(username))throw new Error('Usuário deve ter pelo menos 3 caracteres: letras, números, ponto, hífen ou sublinhado.');
 if(!name)throw new Error('Informe o nome completo.');
 if(!['admin','operator','viewer'].includes(role))throw new Error('Perfil inválido.');
 if(!id){
   if(!email||!$('newUserEmail').checkValidity())throw new Error('Informe um e-mail válido.');
   if(password.length<8)throw new Error('A senha inicial deve ter no mínimo 8 caracteres.');
   await createAccount({username,email,full_name:name,password,role,active,shift});
 }else{
   if(id===authUser.id&&(!active||role!=='admin'))throw new Error('Não é possível retirar seu próprio acesso administrativo.');
   const r=await supabase.from('profiles').update({full_name:name,role,active,shift}).eq('id',id);
   if(r.error)throw r.error;
 }
 await refresh();resetUserForm();toast(id?'Perfil atualizado.':'Usuário criado. Já pode entrar com o e-mail e a senha inicial.');
});
window.deleteUser=()=>toast('Para bloquear acesso, edite o usuário e marque Inativo.');
window.importExcelDatabase=()=>toast('Importação direta desabilitada para proteger o banco compartilhado.');
$('loginUser').value='';$('loginUser').type='email';$('loginUser').placeholder='seu@email.com';$('loginUser').previousElementSibling.textContent='E-mail';
$('lossPhoto').disabled=true;$('lossPhoto').parentElement.querySelector('.small').textContent='Upload de fotos será habilitado após configurar Supabase Storage.';
const note=document.querySelector('.notice.no-print');if(note)note.textContent='Sistema conectado ao Supabase. Os registros são compartilhados conforme as permissões de cada perfil. Fotos e importação de Excel estão temporariamente desabilitadas.';
if($('excelImportFile'))$('excelImportFile').disabled=true;

function renderModelSizes(){
 const container=$('modelSizes');if(!container)return;
 const id=$('modelId').value;const model=db.models.find(m=>m.id===id);
 const chosen=model?.sizeIds||[];
 container.innerHTML=sizes.filter(x=>x.active||chosen.includes(x.id)).map(x=>`<label style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border:1px solid #d4dceb;border-radius:8px;cursor:pointer"><input type="checkbox" value="${x.id}" ${chosen.includes(x.id)?'checked':''}> ${esc(x.label)}</label>`).join('')||'<span class="muted">Cadastre numerações no menu Numerações.</span>';
}
function renderLossSizes(){
 const model=modelById($('lossModel').value),select=$('lossSize');if(!select)return;
 const previous=select.value;
 const allowed=sizes.filter(x=>x.active&&model?.sizeIds?.includes(x.id));
 select.innerHTML='<option value="">Selecione a numeração</option>'+allowed.map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join('');
 if(allowed.some(x=>x.id===previous))select.value=previous;
}
function renderSizeAdmin(){
 if(!$('sizesBody'))return;
 $('sizesBody').innerHTML=sizes.map(x=>`<tr><td><strong>${esc(x.label)}</strong></td><td>${x.active?'Ativa':'Inativa'}</td><td><button class="btn secondary" onclick="editPieceSize('${x.id}')">Editar</button></td></tr>`).join('');
}
window.editPieceSize=id=>{const x=sizes.find(s=>s.id===id);if(!x)return;navigate('numeracoes');$('sizeId').value=x.id;$('sizeLabel').value=x.label;$('sizeActive').value=String(x.active);};
$('clearSize').onclick=()=>{$('sizeForm').reset();$('sizeId').value='';};
intercept('sizeForm','submit',async()=>{
 if(!isAdmin())throw new Error('Sem permissão para cadastrar numerações.');
 const id=$('sizeId').value,label=$('sizeLabel').value.trim(),active=$('sizeActive').value==='true';
 if(!label)throw new Error('Informe a numeração.');
 const existing=sizes.find(x=>x.label.toLowerCase()===label.toLowerCase()&&x.id!==id);
 if(existing)throw new Error('Essa numeração já está cadastrada.');
 const r=id?await supabase.from('piece_sizes').update({label,active}).eq('id',id):await supabase.from('piece_sizes').insert({label,active});
 if(r.error)throw r.error;await refresh();$('clearSize').click();toast('Numeração salva no Supabase.');
});
$('lossModel').addEventListener('change',renderLossSizes);
const originalRefreshLoss=window.refreshLossForm;
// O listener original é mantido: esta função complementa a lista de tamanhos após atualizar o modelo.
const originalUpdateModelSelection=window.updateModelSelection;
window.updateModelSelection=function(){originalUpdateModelSelection();renderLossSizes();};
const originalNavigate=window.navigate;
window.navigate=function(page){originalNavigate(page);if(page==='modelos')renderModelSizes();if(page==='numeracoes')renderSizeAdmin();if(page==='registro')renderLossSizes();};
const originalEditModel=window.editModel;
window.editModel=function(id){originalEditModel(id);renderModelSizes();};
const originalResetModel=window.resetModelForm;
window.resetModelForm=function(){originalResetModel();renderModelSizes();};
const {data:initial}=awaitableSession();
async function awaitableSession(){try{const {data}=await supabase.auth.getSession();if(data?.session?.user)await startSession(data.session.user);}catch(e){console.warn('Sessão não restaurada:',e);await supabase.auth.signOut();}return {data:null};}
})();
