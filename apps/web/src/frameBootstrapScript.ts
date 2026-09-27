// An adapted document with a placeholder where the per-load bootstrap goes.
export type AdaptedFrameDocument = { html: string; marker: string };

export function frameBootstrapScript(nonce: string): string {
  return `<script>(function(){
    var nonce=${JSON.stringify(nonce).replaceAll('<', '\\u003c')},host=parent,send=host.postMessage.bind(host),channel=new MessageChannel();
    var Event=MessageEvent,dispatch=window.dispatchEvent.bind(window),post=channel.port1.postMessage.bind(channel.port1);
    var close=channel.port1.close.bind(channel.port1);
    var getData=Function.prototype.call.bind(Object.getOwnPropertyDescriptor(MessageEvent.prototype,'data').get);
    Object.defineProperty(window,'__GDPL_DOCUMENT_SEND__',{value:function(payload){
      post({payload:payload,documentNonce:nonce});
    },writable:false,configurable:false});
    channel.port1.onmessage=function(event){dispatch(new Event('message',{data:getData(event),source:host}));};
    channel.port1.start();
    window.addEventListener('pagehide',function(){
      post({payload:{type:'gdpl-document-retired'},documentNonce:nonce});close();
    },true);
    document.currentScript.remove();
    send({type:'gdpl-document-ready',documentNonce:nonce},'*',[channel.port2]);
  })();</script>`;
}

// Cheap per-load step: the expensive parse already happened, possibly off-thread.
export function insertFrameBootstrap(adapted: AdaptedFrameDocument, nonce: string): string {
  const at = adapted.html.indexOf(adapted.marker);
  if (at < 0) return adapted.html;
  return adapted.html.slice(0, at) + frameBootstrapScript(nonce) + adapted.html.slice(at + adapted.marker.length);
}
