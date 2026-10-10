export const WORKBENCH_BUILD_ERROR_SCRIPT = String.raw`
let failedBuild, fixingBuild=false, retryingBuild=false, buildAttachment;
function buildErrorControls(){
  el('build-error-fix').disabled=!failedBuild||!online||!state||pending||sending||fixingBuild||state.mode==='pick'||!!state.question||!!state.choices.length;
  el('build-error-fix').textContent=fixingBuild?'Attaching error…':'Fix with agent';
  el('build-error-retry').disabled=!failedBuild||!online||retryingBuild;
  el('build-error-retry').hidden=!failedBuild?.canRetry;
  el('build-error-question').hidden=!state?.question&&!state?.choices.length;
}
function updateBuildError(){
  el('build-error').hidden=!failedBuild;
  if(failedBuild){
    el('build-error-title').textContent=revision?'Update could not build':'Build failed';
    el('build-error-description').textContent=revision?'The last working game is still playable. Fix the source error to load an update.':'The game cannot start until this source error is fixed. Saving a fix rebuilds automatically.';
    if(el('build-error-text').textContent!==failedBuild.error)el('build-error-text').textContent=failedBuild.error;
    if(!revision){el('empty-title').textContent='Build failed';el('empty-description').textContent='Open error details below, retry the build, or prepare a repair request in Chat.';}
  }
  buildErrorControls();
}
function observeBuild(build){
  const next=build.error&&!build.busy?{sourceId:build.sourceId,error:build.error,revision:build.revision,canRetry:build.canRetry===true}:undefined;
  if(next?.error!==failedBuild?.error||next?.sourceId!==failedBuild?.sourceId)el('build-error-feedback').textContent='';
  failedBuild=next;updateBuildError();
}
el('build-error-copy').onclick=async()=>{
  if(!failedBuild)return;
  try{await navigator.clipboard.writeText(failedBuild.error);el('build-error-feedback').textContent='Error copied.';}
  catch{el('build-error-details').open=true;const range=document.createRange();range.selectNodeContents(el('build-error-text'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);el('build-error-feedback').textContent='Error selected. Use your browser’s Copy command.';}
};
el('build-error-fix').onclick=async()=>{
  if(el('build-error-fix').disabled||!failedBuild)return;
  const failed=failedBuild,session=state.sessionId;
  fixingBuild=true;buildErrorControls();
  try{
    let item=buildAttachment?.sourceId===failed.sourceId&&buildAttachment.error===failed.error?staged().find(a=>a.id===buildAttachment.id):undefined;
    if(!item){
      const text='Local preview build failed\nGame: '+state.identity+'\nLast successful build: '+(failed.revision||'none')+'\n\n'+failed.error;
      item=await attach('build-error.txt','text/plain',base64(new TextEncoder().encode(text)),'diagnostic',failed.revision);
    }
    if(sourceId!==failed.sourceId||state.sessionId!==session||failedBuild?.error!==failed.error||state.question||state.choices.length||state.mode==='pick'){
      attachments=attachments.filter(a=>a.id!==item.id);tray();el('build-error-feedback').textContent='The build or question changed. Review the current state before preparing a repair.';return;
    }
    buildAttachment={id:item.id,sourceId:failed.sourceId,error:failed.error};
    if(!draft.value.trim())setDraft('Fix the local game build error in the attached diagnostics and verify that the game builds successfully.');
    el('workbench-tools').hidden=true;openChat();
    el('feedback').textContent='Build error attached. Review your request and Send to choose a builder.';
    el('build-error-feedback').textContent='Error attached in Chat. Review your request and Send.';
  }catch(error){el('build-error-feedback').textContent='Could not attach the error: '+error.message;}
  finally{fixingBuild=false;buildErrorControls();}
};
el('build-error-retry').onclick=async()=>{
  if(el('build-error-retry').disabled||!failedBuild)return;
  const expected=sourceId;retryingBuild=true;buildErrorControls();
  try{const result=await api('/preview/retry',{sourceId:expected});if(sourceId!==expected||result.sourceId!==expected)return;el('build-error-feedback').textContent='Build retry requested. Waiting for the compiler…';}
  catch(error){if(sourceId===expected)el('build-error-feedback').textContent='Could not retry: '+error.message+' Reopen Play if the preview is unavailable.';}
  finally{retryingBuild=false;buildErrorControls();}
};
`;
