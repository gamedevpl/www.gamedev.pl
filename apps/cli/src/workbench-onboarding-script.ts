export const WORKBENCH_ONBOARDING_SCRIPT = String.raw`
let intakeSelected=sessionStorage.getItem('play-intake')==='true';
function beginCreation(){intakeSelected=true;sessionStorage.setItem('play-intake','true');updateOnboarding(state);openChat();}
el('home-create').onclick=beginCreation;
function openHomeGame(slug){if(!state||state.mode!=='prompt'||!online||pending||sending||state.question)return;el('home-status').textContent='Opening '+slug+'…';openChat();send({kind:'action',promptId:state.promptId,action:'checkout',argument:slug});}
el('home-open-form').onsubmit=event=>{event.preventDefault();openHomeGame(el('home-slug').value.trim());};
el('home-continue').onclick=()=>openHomeGame(state.workspace.suggestedSlug);
function updateOnboarding(next){
  if(!next?.workspace)return;
  const {mode,slug,suggestedSlug}=next.workspace;
  if(mode==='game'){intakeSelected=false;sessionStorage.removeItem('play-intake');}
  const intake=!next.hasPreview&&(mode==='create'||mode==='home'&&intakeSelected);
  document.body.dataset.intake=String(intake);
  document.body.dataset.preview=String(!!next.hasPreview);
  draft.placeholder=intake?'Describe the game you want to make…':'What would you like to change?';
  el('composer-hint').textContent=next.hasPreview?'Type / for commands · Click the game to play':'Type / for commands · Add an image for reference';
  el('panel-title').textContent=intake?'Create your game':'Conversation';
  el('workspace-home').hidden=mode!=='home'||intakeSelected||next.hasPreview||!!next.question||next.mode!=='prompt';
  if(!el('workspace-home').hidden)el('empty').hidden=true;
  el('home-continue').hidden=!suggestedSlug;
  el('home-continue-label').textContent='Continue '+(suggestedSlug??'this game');
  for(const id of ['home-open','home-continue','home-create'])el(id).disabled=!online||!!pending||sending||next.mode!=='prompt'||!!next.question;
  if(mode==='game'&&!next.hasPreview){el('empty-title').textContent='Opening '+(slug||'your game')+'…';el('empty-description').textContent=next.activity;}
  if(intake&&panel.hidden&&onboardingOpened){el('empty').hidden=false;el('empty-title').textContent='Create your game';el('empty-description').textContent='Open Chat to continue your idea. Your draft is saved.';}
  if(intake&&!onboardingOpened){onboardingOpened=true;openChat();}
}
function leaveOnboarding(){
  if(state?.workspace?.mode==='home'){intakeSelected=false;sessionStorage.removeItem('play-intake');onboardingOpened=false;updateOnboarding(state);}
  else if(state?.workspace?.mode==='create'){document.body.dataset.intake='false';el('empty').hidden=false;el('empty-title').textContent='Create your game';el('empty-description').textContent='Open Chat to continue your idea. Your draft is saved.';}
}
let onboardingOpened=false;
`;
