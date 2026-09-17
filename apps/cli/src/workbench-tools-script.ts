export const WORKBENCH_TOOLS_SCRIPT = String.raw`
let attachments=[];try{const saved=sessionStorage.getItem('play-attachments');if(saved&&saved.length<16000)attachments=JSON.parse(saved).slice(0,8);}catch{}
const device=crypto.randomUUID();
function tray(){sessionStorage.setItem('play-attachments',JSON.stringify(attachments.map(({thumbnail,...meta})=>meta)));el('attachments').replaceChildren();for(const item of attachments){const row=document.createElement('div');if(item.thumbnail){const img=document.createElement('img');img.src=item.thumbnail;img.alt=item.name;img.style.cssText='width:80px;height:50px;object-fit:contain';row.append(img);}const label=document.createElement('span');label.textContent=item.name+' · '+item.purpose+' · '+Math.round(item.bytes/1024)+' KB ';row.append(label);const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.onclick=()=>{attachments=attachments.filter(a=>a.id!==item.id);tray();};row.append(remove);el('attachments').append(row);}}
async function attach(name,mime,data,purpose='diagnostic',shown=revision) {
  if(attachments.length>=8)throw Error('Up to 8 attachments per request');
  const item=await api('/artifacts',{name,mime,data,purpose,revision:shown,device,capturedAt:new Date().toISOString()},30000);
  if(mime.startsWith('image/'))item.thumbnail='data:'+mime+';base64,'+data;attachments.push(item);tray();
}
function base64(bytes){let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
async function upload(file){
  if(file.size>16000000)throw Error('File exceeds 16 MB');
  await attach(file.name,file.type||'text/plain',base64(new Uint8Array(await file.arrayBuffer())),el('purpose').value);
}
async function attempt(fn){try{await fn();}catch(e){el('feedback').textContent=e.message;el('notice').textContent=e.message;}}
el('upload').onchange=()=>attempt(async()=>{for(const file of el('upload').files)await upload(file);el('upload').value='';});
panel.addEventListener('paste',e=>{const files=[...e.clipboardData.files];if(files.length){e.preventDefault();void attempt(async()=>{for(const file of files)await upload(file);});}});
el('screenshot').onclick=()=>attempt(async()=>{const shown=revision;const png=await baseCapture();await attach('screenshot.png','image/png',png,'diagnostic',shown);});
el('trace').onclick=()=>attempt(async()=>{const shown=revision;const data=await gameRequest(frame,'trace');await attach('diagnostics.json','application/json',base64(new TextEncoder().encode(JSON.stringify(data))),'diagnostic',shown);});
el('record').onclick=()=>attempt(async()=>{await gameRequest(frame,recording?'record-stop':'record');recording=!recording;el('record').textContent=recording?'Stop recording':'Enable recording';el('feedback').textContent=recording?'Recording largest canvas, without audio. Each complete segment contains 8 seconds.':'';});
el('clip').onclick=()=>attempt(async()=>{const shown=revision;const clip=await gameRequest(frame,'clip');await attach('recent-gameplay.'+(clip.mime.includes('mp4')?'mp4':'webm'),clip.mime.split(';')[0],base64(new Uint8Array(clip.bytes)),'diagnostic',shown);});
function devices(next){
  const box=el('devices');box.replaceChildren();
  const title=document.createElement('h3');title.textContent='Test on phone';box.append(title);
  const note=document.createElement('p');note.className='hint';note.textContent='Same trusted Wi-Fi only. LAN uses unencrypted HTTP. Access expires after 30 minutes. Phone can play and report, never edit.';box.append(note);
  for(const address of next.addresses??[]){const b=document.createElement('button');b.textContent='Share on '+address;b.onclick=()=>attempt(async()=>{if(confirm('Share this game on your trusted local network for 30 minutes?'))await api('/phone',{address});});box.append(b);}
  if(next.phone){if(next.phone.qr){const qr=document.createElement('img');qr.src=next.phone.qr;qr.alt='Scan to test on phone';qr.width=200;qr.height=200;box.append(qr);}const link=document.createElement('a');link.href=next.phone.url;link.textContent='Open or copy phone link';link.style.color='#65edc7';box.append(link);const revoke=document.createElement('button');revoke.textContent='Revoke phone access';revoke.onclick=()=>attempt(()=>api('/phone',{stop:true}));box.append(revoke);}
  for(const report of next.reports??[]){const b=document.createElement('button');b.textContent='Phone report · '+report.revision.slice(0,8)+': '+report.text.slice(0,120);b.onclick=()=>{if((draft.value.trim()||attachments.length)&&!confirm('Replace the current draft and attachments with this phone report?'))return;draft.value=report.text+'\nPhone build: '+report.revision;sessionStorage.setItem('play-draft',draft.value);attachments=(report.attachments??[]).map(id=>({id,name:'Phone evidence',purpose:'diagnostic',bytes:0}));tray();};box.append(b);}
}
let deviceFingerprint='';
tray();
const labels={checkout:'Open checkout',connect:'Connect to game',share:'Game link',handle:'Set account handle',update:'Update CLI (next launch)',publish:'Verify and submit for publication',takeover:'Take over and deliver', 'cancel-round':'Cancel platform round','share-draft':'Share draft publicly','unshare-draft':'Disable public draft sharing',play:'Open local game',status:'Platform status',diff:'Inspect changes',pull:'Pull platform changes',submit:'Verify and deliver preview',push:'Push preview',logs:'Task logs',agents:'Available agents',model:'Agent settings',kit:'Creator Kit status','kit-update':'Update Creator Kit','builder-local':'Use local builder','builder-platform':'Use platform builder',retry:'Retry pending task',games:'My games',quota:'Account limits',notifications:'Notifications',profile:'Profile',recover:'Recover checkout',verify:'Verify local sources',checkpoint:'Save source checkpoint','restore-checkpoint':'Restore source checkpoint',login:'Sign in','end-session':'End session'};
for(const [value,label] of Object.entries(labels)){const option=document.createElement('option');option.value=value;option.textContent=label;el('operation').append(option);}
function runAction(action,argument,clearDraft=false){
  if(!state||state.mode!=='prompt'||state.question||pending)return;
  if(['pull','submit','push','builder-platform','recover','restore-checkpoint','end-session','publish','takeover','cancel-round','share-draft'].includes(action)&&!confirm('Run '+labels[action]+'? This may change the checkout or platform round.'))return;
  if(['checkout','connect','share','handle'].includes(action)&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(argument)){el('feedback').textContent='Provide a valid game slug or account handle.';drawer('commands',labels[action]);el('operation-argument').focus();return;}
  send({kind:'action',promptId:state.promptId,action,...(['checkout','connect','share','handle'].includes(action)?{argument}: {})},clearDraft);drawer('details','Session output');
};
el('run-operation').onclick=()=>runAction(el('operation').value,el('operation-argument').value.trim());
el('clean').onclick=()=>{closeChat();el('workbench-tools').hidden=true;el('tools').hidden=true;el('reveal').hidden=false;};
el('reveal').onclick=()=>{el('tools').hidden=false;el('reveal').hidden=true;};
el('restart').onclick=()=>{if(confirm('Restart the game with the new build? Current gameplay progress will be lost.'))void apply(true);};
`;
