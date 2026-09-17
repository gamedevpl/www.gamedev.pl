export const WORKBENCH_NAVIGATION_SCRIPT = String.raw`
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{document.body.style.setProperty('--notice-space',el('notice').textContent.trim()?(el('notice').getBoundingClientRect().height+28)+'px':'0px');}).observe(el('notice'));
let historyIndex=-1, historyDraft='', lastHistory='', firstWorkspace=true, lastQuestion='';
function openChat(){document.exitPointerLock?.();panel.hidden=false;el('edit').setAttribute('aria-expanded','true');draft.focus();}
function closeChat(){panel.hidden=true;leaveOnboarding();el('edit').setAttribute('aria-expanded','false');frame.focus();}
function drawer(section,title){document.exitPointerLock?.();el('workbench-tools').hidden=false;el('drawer-title').textContent=title;for(const key of ['commands','media','devices','history','details'])el(key+'-section').hidden=key!==section;el(section==='commands'?'command-search':'drawer-close').focus();}
el('dock').onclick=()=>{const left=document.body.dataset.dock!=='left';document.body.dataset.dock=left?'left':'right';el('dock').setAttribute('aria-label',left?'Move conversation right':'Move conversation left');};
el('drawer-close').onclick=()=>{el('workbench-tools').hidden=true;el('edit').focus();};
el('commands-open').onclick=()=>drawer('commands','Commands');
el('attachments-open').onclick=()=>drawer('media','Attachments');
el('devices-open').onclick=()=>drawer('devices','Test on phone');
el('details-open').onclick=()=>drawer('details','Session details');
el('history-open').onclick=()=>drawer('history','Prompt history');
el('agent-settings').onclick=()=>{el('command-search').value='builder';renderCommands();drawer('commands','Execution');};
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(!el('workbench-tools').hidden){el('workbench-tools').hidden=true;el('edit').focus();}else if(!panel.hidden){closeChat();}else return;event.preventDefault();});
function setDraft(text){draft.value=text;sessionStorage.setItem('play-draft',text);historyIndex=-1;renderSuggestions();}
function commandMatches(query){return Object.entries(state?.actionCommands??{}).filter(([action,line])=>(line+' '+labels[action]).toLowerCase().includes(query.toLowerCase().replace(/^\//,'')));}
function chooseCommand(action){el('operation').value=action;el('command-search').value='';renderCommands();drawer('commands',labels[action]);el(['checkout','connect','share','handle'].includes(action)?'operation-argument':'run-operation').focus();}
function renderCommands(){const box=el('command-list');box.replaceChildren();for(const [action,line] of commandMatches(el('command-search').value)){const button=document.createElement('button');button.type='button';button.textContent=line+' · '+labels[action];button.onclick=()=>chooseCommand(action);box.append(button);}if(!box.children.length)box.textContent=online?'No matching command.':'Connect to the session to see available commands.';}
el('command-search').oninput=renderCommands;
function renderSuggestions(){const box=el('command-suggestions');box.replaceChildren();const text=draft.value.trimStart();box.hidden=!text.startsWith('/')||!!state?.question||!!state?.choices.length;if(box.hidden)return;if(Object.entries(state?.actionCommands??{}).some(([action,line])=>text.startsWith(line+' ')||text===line&&!['checkout','connect','share','handle'].includes(action))){box.hidden=true;return;}for(const [action,line] of commandMatches(text).slice(0,6)){const button=document.createElement('button');button.type='button';button.textContent=line+' · '+labels[action];button.onclick=()=>{setDraft(line+(['checkout','connect','share','handle'].includes(action)?' ':''));draft.focus();};box.append(button);}if(!box.children.length)box.textContent='No matching command. Use Commands to browse supported actions.';}
function submitSlash(){
  const text=draft.value.trim();
  const found=Object.entries(state.actionCommands??{}).sort((a,b)=>b[1].length-a[1].length).find(([,line])=>text===line||text.startsWith(line+' '));
  if(!found){el('feedback').textContent=text.startsWith('/delegate')?'Describe the change without /delegate. The session assistant will ask you to choose a builder before execution. Attachments stay with your request.':'Unknown command. Type / to see supported commands.';renderSuggestions();return;}
  if(state.mode!=='prompt'||pending){el('feedback').textContent='Commands are available after the current task. You can queue an ordinary message now.';return;}
  const [action,line]=found;const argument=text.slice(line.length).trim();
  if(!['checkout','connect','share','handle'].includes(action)&&argument){el('feedback').textContent='This command does not take an argument.';return;}
  el('operation').value=action;el('operation-argument').value=argument;
  runAction(action,argument,true);
}
draft.addEventListener('input',()=>{historyIndex=-1;renderSuggestions();});
draft.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  if(event.key==='Tab'&&!el('command-suggestions').hidden){const first=el('command-suggestions').querySelector('button');if(first){event.preventDefault();first.click();}return;}
  const entries=state?.history??[];
  if(event.key==='ArrowUp'&&draft.selectionStart===0&&draft.selectionEnd===0&&entries.length){event.preventDefault();if(historyIndex<0){historyDraft=draft.value;historyIndex=entries.length;}historyIndex=Math.max(0,historyIndex-1);draft.value=entries[historyIndex];draft.setSelectionRange(0,0);}
  else if(event.key==='ArrowDown'&&historyIndex>=0&&draft.selectionEnd===draft.value.length){event.preventDefault();historyIndex++;draft.value=historyIndex>=entries.length?historyDraft:entries[historyIndex];if(historyIndex>=entries.length)historyIndex=-1;draft.setSelectionRange(draft.value.length,draft.value.length);}
  else return;
  sessionStorage.setItem('play-draft',draft.value);renderSuggestions();
});
function updateWorkspace(next){
  el('empty-title').textContent=next.hasPreview?'Preparing your game…':next.mode==='busy'?'Preparing your workspace…':'Your workspace is ready';
  el('empty-description').textContent=next.hasPreview?'Loading the first playable build.':next.mode==='busy'?next.activity:'Open a game from Commands, or describe an idea in Chat.';
  if(firstWorkspace){firstWorkspace=false;renderCommands();}
  const questionKey=JSON.stringify([next.promptId,next.question,next.choices]);if(questionKey!==lastQuestion&&(next.question||next.choices.length)){el('workbench-tools').hidden=true;if(panel.hidden)openChat();}lastQuestion=questionKey;
  const encoded=JSON.stringify(next.history??[]);if(encoded!==lastHistory){lastHistory=encoded;const box=el('prompt-history');box.replaceChildren();for(const text of [...(next.history??[])].reverse()){const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=()=>{if(draft.value.trim()&&!confirm('Replace the current draft with this prompt?'))return;setDraft(text);el('workbench-tools').hidden=true;openChat();};box.append(button);}if(!box.children.length)box.textContent='Your sent prompts will appear here.';}
}
function showConnectionError(error){
  el('workspace-home').hidden=true;document.body.dataset.intake='false';
  const access=/\(401\)|\(403\)/.test(error.message);
  el('connection').textContent=access?'Session access required':'Connection lost';
  const detail=access?'This tab has no valid session access. Reopen Play from the CLI using the complete launch link.':'The local session is unavailable. Reopen /play in your terminal, or run gamedevpl play --edit from the game checkout.';
  if(!revision){el('empty').hidden=false;el('empty-title').textContent=access?'Reopen your Play session':'Your session is offline';el('empty-description').textContent=detail;}
  el('notice').textContent=detail+' Your draft is preserved.';
}
`;
