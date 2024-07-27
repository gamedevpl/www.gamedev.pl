import{r as d,j as a,R as Z,d as y,u as W,f as K,a as J,b as Q}from"./index-QhO8rETQ.js";function tt(t){return[...et].sort(()=>Math.random()-Math.random()).slice(0,t)}const et=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function _(t){return[...nt].sort(()=>Math.random()-Math.random()).slice(0,t)}const nt=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];var f=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(f||{}),C=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(C||{}),E=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(E||{});function it({playerStateName:t,numberOfStates:n=3}){const s=_(n+1).filter(m=>m!==t),r=tt(n*2),u=[{id:"state-1",name:t,isPlayerControlled:!0,strategies:{"state-2":f.NEUTRAL,"state-3":f.NEUTRAL}},{id:"state-2",name:s.pop(),isPlayerControlled:!1,strategies:{"state-1":f.NEUTRAL,"state-3":f.NEUTRAL}},{id:"state-3",name:s.pop(),isPlayerControlled:!1,strategies:{"state-1":f.NEUTRAL,"state-2":f.NEUTRAL}}],c=[{id:"city-1",stateId:"state-1",name:r.pop(),position:{x:10*16,y:10*16},populationHistogram:[{timestamp:0,population:1e3}]},{id:"city-2",stateId:"state-1",name:r.pop(),position:{x:13*16,y:13*16},populationHistogram:[{timestamp:0,population:1500}]},{id:"city-3",stateId:"state-2",name:r.pop(),position:{x:30*16,y:10*16},populationHistogram:[{timestamp:0,population:2e3}]},{id:"city-4",stateId:"state-2",name:r.pop(),position:{x:33*16,y:13*16},populationHistogram:[{timestamp:0,population:2500}]},{id:"city-5",stateId:"state-3",name:r.pop(),position:{x:10*16,y:30*16},populationHistogram:[{timestamp:0,population:3e3}]},{id:"city-6",stateId:"state-3",name:r.pop(),position:{x:13*16,y:33*16},populationHistogram:[{timestamp:0,population:3500}]}],p=[{type:C.LAUNCH_SITE,id:"launch-site-1",stateId:"state-1",position:{x:8*16,y:15*16}},{type:C.LAUNCH_SITE,id:"launch-site-2",stateId:"state-1",position:{x:15*16,y:8*16}},{type:C.LAUNCH_SITE,id:"launch-site-3",stateId:"state-2",position:{x:28*16,y:15*16}},{type:C.LAUNCH_SITE,id:"launch-site-4",stateId:"state-2",position:{x:35*16,y:8*16}},{type:C.LAUNCH_SITE,id:"launch-site-5",stateId:"state-3",position:{x:8*16,y:35*16}},{type:C.LAUNCH_SITE,id:"launch-site-6",stateId:"state-3",position:{x:15*16,y:28*16}}],l=[];let h=1;for(let m=0;m<50;m++)for(let b=0;b<50;b++){const q=m>=8&&m<=17&&b>=7&&b<=18||m>=7&&m<=18&&b>=27&&b<=38||m>=27&&m<=38&&b>=7&&b<=18;l.push({id:`sector-${h++}`,position:{x:b*16,y:m*16},rect:{left:b*16,top:m*16,right:(b+1)*16,bottom:(m+1)*16},type:q?E.GROUND:E.WATER})}return{timestamp:0,states:u,cities:c,launchSites:p,sectors:l,missiles:[],explosions:[]}}function x(t,n,e,i){return Math.sqrt(Math.pow(e-t,2)+Math.pow(i-n,2))}const L=10,T=20,ot=5,st=T/ot,at=.5,rt=500,j=.05,F=5,z=60;function ct(t){var n,e;for(const i of t.states){const o=t.cities.filter(l=>l.stateId===i.id),s=t.launchSites.filter(l=>l.stateId===i.id),r=t.cities.filter(l=>i.strategies[l.stateId]===f.HOSTILE&&l.stateId!==i.id&&l.populationHistogram.slice(-1)[0].population>0),u=t.missiles.filter(l=>i.strategies[l.stateId]!==f.FRIENDLY&&l.stateId!==i.id),c=t.launchSites.filter(l=>i.strategies[l.stateId]===f.HOSTILE&&l.stateId!==i.id),p=u.filter(l=>o.some(h=>k(l.target,h.position))||s.some(h=>k(l.target,h.position))).filter(l=>(t.timestamp-l.launchTimestamp)/(l.targetTimestamp-l.launchTimestamp)>.5);for(const l of t.launchSites.filter(h=>h.stateId===i.id)){if(l.nextLaunchTarget)continue;if(r.length===0&&c.length===0&&u.length===0)break;const h=w(p.map(m=>({...m,position:B(m,t.timestamp),interceptionPoint:lt(m,l.position,t.timestamp)})),l.position),g=t.missiles.filter(m=>m.stateId===i.id),v=U(h,g).filter(([,m])=>m<s.length);if(v.length>0)l.nextLaunchTarget=v[0][0].interceptionPoint??void 0;else{const m=U(w([...c,...r],l.position),g);l.nextLaunchTarget=((e=(n=m==null?void 0:m[0])==null?void 0:n[0])==null?void 0:e.position)??void 0}}}return t}function B(t,n){const e=(n-t.launchTimestamp)/(t.targetTimestamp-t.launchTimestamp);return{x:t.launch.x+(t.target.x-t.launch.x)*e,y:t.launch.y+(t.target.y-t.launch.y)*e}}function lt(t,n,e){const i=B(t,e),o=x(i.x,i.y,n.x,n.y);if(o<T)return null;const s=x(t.target.x,t.target.y,t.launch.x,t.launch.y),r=(t.target.x-t.launch.x)/s,u=(t.target.y-t.launch.y)/s,c={x:t.target.x-r*T*2,y:t.target.y-u*T*2},p=o/L,l=x(n.x,n.y,c.x,c.y)/L;return p<l||p>l+10?null:c}function k(t,n){const e=T;return x(t.x,t.y,n.x,n.y)<=e}function w(t,n){return t.sort((e,i)=>x(e.position.x,e.position.y,n.x,n.y)-x(i.position.x,i.position.y,n.x,n.y))}function U(t,n){const e=new Map;for(const i of t)e.set(i,n.filter(o=>k(o.target,i.position)).length);return Array.from(e).sort((i,o)=>i[1]-o[1])}function ut(t){var n,e;for(const i of t.missiles.filter(o=>o.launchTimestamp===t.timestamp)){const o=t.states.find(r=>r.id===i.stateId),s=((n=t.cities.find(r=>x(r.position.x,r.position.y,i.target.x,i.target.y)<=T))==null?void 0:n.stateId)||((e=t.launchSites.find(r=>x(r.position.x,r.position.y,i.target.x,i.target.y)<=T))==null?void 0:e.stateId);if(o&&s&&o.id!==s){o.strategies[s]!==f.HOSTILE&&(o.strategies[s]=f.HOSTILE);const r=t.states.find(u=>u.id===s);r&&r.strategies[o.id]!==f.HOSTILE&&(r.strategies[o.id]=f.HOSTILE)}}for(const i of t.states)if(!Object.entries(i.strategies).some(([s,r])=>r===f.HOSTILE&&t.launchSites.some(u=>u.stateId===s))){const s=t.launchSites.filter(u=>u.stateId===i.id).length,r=t.states.filter(u=>u.id!==i.id&&i.strategies[u.id]===f.NEUTRAL&&t.launchSites.filter(c=>c.stateId===u.id).length<s&&t.cities.filter(c=>c.stateId===u.id).some(c=>c.populationHistogram.slice(-1)[0].population>0));if(r.length>0){const u=r[0];i.strategies[u.id]=f.HOSTILE}}return t}function pt(t,n){for(;n>0;){const e=dt(t,n>j?j:n);n=n>j?n-j:0,t=e}return t}function dt(t,n){const e=t.timestamp+n;let i={timestamp:e,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,explosions:t.explosions,sectors:t.sectors};for(const o of t.missiles.filter(s=>s.targetTimestamp<=e)){const s={id:`explosion-${Math.random()}`,missileId:o.id,startTimestamp:o.targetTimestamp,endTimestamp:o.targetTimestamp+st,position:o.target,radius:T};i.explosions.push(s);for(const c of t.cities.filter(p=>x(p.position.x,p.position.y,s.position.x,s.position.y)<=s.radius)){const p=c.populationHistogram[c.populationHistogram.length-1].population,l=Math.max(rt,p*at);c.populationHistogram.push({timestamp:s.startTimestamp,population:Math.max(0,p-l)})}const r=t.missiles.filter(c=>c.id!==s.missileId&&c.launchTimestamp<=s.startTimestamp&&c.targetTimestamp>=s.startTimestamp).filter(c=>{const p=s.startTimestamp,{x:l,y:h}={x:c.launch.x+(c.target.x-c.launch.x)/(c.targetTimestamp-c.launchTimestamp)*(p-c.launchTimestamp),y:c.launch.y+(c.target.y-c.launch.y)/(c.targetTimestamp-c.launchTimestamp)*(p-c.launchTimestamp)};return x(l,h,s.position.x,s.position.y)<=s.radius});for(const c of r)c.targetTimestamp=s.startTimestamp;const u=t.launchSites.filter(c=>x(c.position.x,c.position.y,s.position.x,s.position.y)<=s.radius);for(const c of u)i.launchSites=t.launchSites.filter(p=>p.id!==c.id)}i.explosions=i.explosions.filter(o=>o.endTimestamp>=e),i.missiles=i.missiles.filter(o=>o.targetTimestamp>e);for(const o of t.launchSites){if(o.nextLaunchTarget){if(o.lastLaunchTimestamp&&e-o.lastLaunchTimestamp<F)continue}else continue;const s=x(o.position.x,o.position.y,o.nextLaunchTarget.x,o.nextLaunchTarget.y),r={id:Math.random()+"",stateId:o.stateId,launchSiteId:o.id,launch:o.position,launchTimestamp:e,target:o.nextLaunchTarget,targetTimestamp:e+s/L};i.missiles.push(r),o.lastLaunchTimestamp=e,o.nextLaunchTarget=void 0}return i=ct(i),i=ut(i),i}function mt(t){const[n,e]=d.useState(()=>it({playerStateName:t,numberOfStates:3})),i=d.useCallback((o,s)=>e(pt(o,s)),[]);return{worldState:n,updateWorldState:i,setWorldState:e}}function ht(t,n){const e=new CustomEvent(t,{bubbles:!0,detail:n});document.dispatchEvent(e)}function ft(t,n){d.useEffect(()=>{const e=i=>{n(i.detail)};return document.addEventListener(t,e,!1),()=>{document.removeEventListener(t,e,!1)}},[t,n])}const X={x:0,y:0,pointingObjects:[]},gt=(t,n)=>n.type==="move"?{x:n.x,y:n.y,pointingObjects:t.pointingObjects}:n.type==="point"&&!t.pointingObjects.some(e=>e.id===n.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,n.object]}:n.type==="unpoint"&&t.pointingObjects.some(e=>e.id===n.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(e=>e.id!==n.object.id)}:t,Y=d.createContext(X),R=d.createContext(()=>{});function xt({children:t}){const[n,e]=d.useReducer(gt,X);return a.jsx(Y.Provider,{value:n,children:a.jsx(R.Provider,{value:e,children:t})})}function M(){return d.useContext(Y)}function yt(){const t=d.useContext(R);return(n,e)=>t({type:"move",x:n,y:e})}function P(){const t=d.useContext(R);return[n=>t({type:"point",object:n}),n=>t({type:"unpoint",object:n})]}const N={},bt=(t,n)=>n.type==="clear"?N:n.type==="set"?{...t,selectedObject:n.object}:t,H=d.createContext(N),$=d.createContext(()=>{});function Tt({children:t}){const[n,e]=d.useReducer(bt,N);return a.jsx(H.Provider,{value:n,children:a.jsx($.Provider,{value:e,children:t})})}function Ct(t){var i;const n=d.useContext($);return[((i=d.useContext(H).selectedObject)==null?void 0:i.id)===t.id,()=>n({type:"set",object:t})]}function V(){return d.useContext(H).selectedObject}function vt({worldState:t,setWorldState:n}){const e=V(),i=M();return ft("world-click",()=>{if((e==null?void 0:e.type)!==C.LAUNCH_SITE||i.pointingObjects.length===0)return;const o=i.pointingObjects[0].position;t.cities.some(r=>r.stateId===e.stateId&&x(r.position.x,r.position.y,o.x,o.y)<T)||t.launchSites.some(r=>r.stateId===e.stateId&&x(r.position.x,r.position.y,o.x,o.y)<T)||(e.nextLaunchTarget=o),n({...t})}),null}const jt=Z.memo(({sectors:t})=>{const n=d.useRef(null),[e,i]=P();return d.useEffect(()=>{const o=n.current,s=o==null?void 0:o.getContext("2d");if(!o||!s)return;const r=Math.min(...t.map(g=>g.rect.left)),u=Math.min(...t.map(g=>g.rect.top)),c=Math.max(...t.map(g=>g.rect.right)),p=Math.max(...t.map(g=>g.rect.bottom)),l=c-r,h=p-u;o.width=l,o.height=h,o.style.width=`${l}px`,o.style.height=`${h}px`,s.clearRect(0,0,l,h),t.forEach(g=>{const{fillStyle:v,drawSector:m}=It(g);s.fillStyle=v,m(s,g.rect,r,u)})},[t]),d.useEffect(()=>{const o=n.current;let s;const r=u=>{const c=o==null?void 0:o.getBoundingClientRect(),p=u.clientX-((c==null?void 0:c.left)||0),l=u.clientY-((c==null?void 0:c.top)||0),h=t.find(g=>p>=g.rect.left&&p<=g.rect.right&&l>=g.rect.top&&l<=g.rect.bottom);h&&(s&&i(s),e(h),s=h)};return o==null||o.addEventListener("mousemove",r),()=>{o==null||o.removeEventListener("mousemove",r)}},[t,e,i]),a.jsx("canvas",{ref:n})});function It(t){switch(t.type){case"GROUND":return{fillStyle:"rgb(93, 42, 0)",drawSector:(n,e,i,o)=>{n.fillStyle="rgb(93, 42, 0)",n.fillRect(e.left-i,e.top-o,e.right-e.left,e.bottom-e.top)}};case"WATER":return{fillStyle:"rgb(0, 34, 93)",drawSector:(n,e,i,o)=>{const s=n.createLinearGradient(e.left-i,e.top-o,e.right-i,e.bottom-o);s.addColorStop(0,"rgb(0, 34, 93)"),s.addColorStop(1,"rgb(0, 137, 178)"),n.fillStyle=s,n.fillRect(e.left-i,e.top-o,e.right-e.left,e.bottom-e.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(n,e,i,o)=>{n.fillStyle="rgb(0, 34, 93)",n.fillRect(e.left-i,e.top-o,e.right-e.left,e.bottom-e.top)}}}}function St(){return a.jsx(Et,{})}const Et=y.div``;function Lt({city:t}){const[n,e]=P();return a.jsx(kt,{onMouseEnter:()=>n(t),onMouseLeave:()=>e(t),style:{"--x":t.position.x,"--y":t.position.y}})}const kt=y.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 10px;
  height: 10px;
  background: rgb(0, 0, 255);
`;function Ot({launchSite:t,worldTimestamp:n,isPlayerControlled:e}){const[i,o]=Ct(t),[s,r]=P(),u=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+F>n;return a.jsx(At,{onMouseEnter:()=>s(t),onMouseLeave:()=>r(t),onClick:()=>e&&o(),style:{"--x":t.position.x,"--y":t.position.y},"data-selected":i,"data-cooldown":u})}const At=y.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 5px;
  height: 5px;
  background: rgb(255, 0, 0);

  cursor: pointer;

  &[data-selected='true'] {
    box-shadow: 0 0 10px 5px rgb(255, 0, 0);
  }

  &[data-cooldown='true'] {
    opacity: 0.5;
    background: rgb(255, 165, 0); /* Change color to indicate cooldown */
  }
`;function Rt({missile:t,worldTimestamp:n}){if(t.launchTimestamp>n||t.targetTimestamp<n)return null;const e=Math.min(Math.max(0,(n-t.launchTimestamp)/(t.targetTimestamp-t.launchTimestamp)),1),i=t.launch.x+(t.target.x-t.launch.x)*e,o=t.launch.y+(t.target.y-t.launch.y)*e;return a.jsx(Mt,{style:{"--x":i,"--y":o}})}const Mt=y.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
  position: absolute;
  width: 1px;
  height: 1px;
  background: rgb(0, 255, 0);
`;function Pt({explosion:t,worldTimestamp:n}){if(t.startTimestamp>n||t.endTimestamp<n)return null;const e=Math.pow(Math.min(Math.max(0,(n-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);return a.jsx(Nt,{style:{"--x":t.position.x,"--y":t.position.y,"--radius":t.radius*e,"--color":`rgb(${255*e}, ${255*(1-e)}, 0)`}})}const Nt=y.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: calc(var(--radius) * 2px);
  height: calc(var(--radius) * 2px);
  border-radius: 50%;
  background: var(--color);

  pointer-events: none;
`;function Ht({state:t}){const n=yt();return a.jsxs(zt,{onMouseMove:e=>n(e.clientX,e.clientY),onClick:()=>ht("world-click"),children:[a.jsx(jt,{sectors:t.sectors}),t.states.map(e=>a.jsx(St,{},e.id)),t.cities.map(e=>a.jsx(Lt,{city:e},e.id)),t.launchSites.map(e=>{var i;return a.jsx(Ot,{launchSite:e,worldTimestamp:t.timestamp,isPlayerControlled:e.stateId===((i=t.states.find(o=>o.isPlayerControlled))==null?void 0:i.id)},e.id)}),t.missiles.filter(e=>e.launchTimestamp<t.timestamp&&e.targetTimestamp>t.timestamp).map(e=>a.jsx(Rt,{missile:e,worldTimestamp:t.timestamp},e.id)),t.explosions.filter(e=>e.startTimestamp<t.timestamp&&e.endTimestamp>t.timestamp).map(e=>a.jsx(Pt,{explosion:e,worldTimestamp:t.timestamp},e.id))]})}const zt=y.div`
  display: flex;
  flex-grow: 1;

  background: black;
`;function wt(){const t=V(),n=M();return(t==null?void 0:t.type)!==C.LAUNCH_SITE?null:a.jsx(Ut,{style:{"--x":n.x,"--y":n.y},children:n.pointingObjects.length>0?"Launch":""})}const Ut=y.div`
  position: absolute;
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
  pointer-events: none;
  color: red;
`;function Dt(t,n){var e=d.useRef(null),i=d.useRef(!1),o=d.useRef(t);o.current=t;var s=d.useCallback(function(u){i.current&&(o.current(u),e.current=requestAnimationFrame(s))},[]),r=d.useMemo(function(){return[function(){i.current&&(i.current=!1,e.current&&cancelAnimationFrame(e.current))},function(){i.current||(i.current=!0,e.current=requestAnimationFrame(s))},function(){return i.current}]},[]);return d.useEffect(function(){return r[1](),r[0]},[]),r}function Gt({updateWorldTime:t}){const[n,e]=d.useState(!0),i=d.useRef(null);return Dt(o=>{if(!i.current){i.current=o;return}const s=o-i.current;i.current=o,!(s<=0)&&n&&t(s/1e3)}),a.jsxs(Wt,{children:[a.jsx("button",{onClick:()=>t(1),children:"+1 Second"}),a.jsx("button",{onClick:()=>t(10),children:"+10 Seconds"}),a.jsx("button",{onClick:()=>t(60),children:"+60 seconds"}),a.jsx("button",{onClick:()=>e(!n),children:n?"Stop autoplay":"Start autoplay"})]})}const Wt=y.div`
  position: absolute;
  right: 0;
  bottom: 0;
  flex-grow: 0;

  border: 1px solid rgb(0, 255, 0);
  padding: 5px 10px;

  text-align: left;
  color: white;
  z-index: 1;
`;function D(t,n){let e=t[0];for(const i of t)i.timestamp<n&&i.timestamp>e.timestamp&&(e=i);return e}function _t({worldState:t}){const n=M(),e=Object.fromEntries(t.states.map(s=>[s.id,t.cities.filter(r=>r.stateId===s.id).map(r=>[r,D(r.populationHistogram,t.timestamp).population])])),i=t.states.map(s=>[s,e[s.id].reduce((r,[,u])=>r+u,0)]),o=t.cities.reduce((s,r)=>s+D(r.populationHistogram,t.timestamp).population,0);return a.jsx(Ft,{children:a.jsxs("ul",{children:[a.jsxs("li",{children:["Time: ",t.timestamp.toFixed(2)]}),a.jsxs("li",{children:["Pointing object: ",n.pointingObjects.length]}),a.jsxs("li",{children:["World population: ",o]}),a.jsx("li",{children:"Population: "}),a.jsx("ul",{children:i.map(([s,r])=>a.jsxs("li",{children:[s.name,": ",r,a.jsx("ul",{children:e[s.id].map(([u,c])=>a.jsxs("li",{children:[u.name,": ",c]},u.id))})]},s.id))})]})})}const Ft=y.div`
  position: fixed;
  right: 0;
  top: 0;
  z-index: 1;

  width: 250px;
  min-width: 200px;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgb(0, 255, 0);

  li {
    text-align: left;
  }
`;function Bt({playerState:t,worldState:n,setWorldState:e}){const[i,o]=d.useState([]);return a.jsxs(Xt,{children:[a.jsx("input",{type:"text",placeholder:"Chat with commander",onKeyDown:s=>{if(s.key==="Enter"){const r=s.target,u=r.value;if(!u)return;r.value="";const c=Yt(u,t,n);if(c){const p=$t(c,t,n,e);o([...i,{timestamp:n.timestamp,role:"user",message:u,command:c},...p?[p]:[]])}else o([...i,{timestamp:n.timestamp,role:"user",message:u},{timestamp:n.timestamp,role:"commander",message:"I don't understand"}])}}}),a.jsx("div",{children:i.map(s=>a.jsx("p",{children:s.message}))})]})}const Xt=y.div`
  display: flex;
  flex-direction: column-reverse;
  max-height: 200px;
  width: 350px;
  overflow: auto;
  border-top: 2px solid rgb(0, 255, 0);
  padding-top: 10px;
  margin-top: 10px;
  padding-right: 10px;

  > div {
    display: flex;
    flex-direction: column;
    flex-grow: 1;

    > p {
      display: block;
      text-align: left;
      margin: 0;
      padding: 0;
      padding-bottom: 5px;
    }
  }

  > input {
    display: flex;

    flex-grow: 0;
    flex-shrink: 0;

    background: none;
    border: none;
    color: white;
    outline: none;
    font-size: inherit;
    padding: 0;
  }
`;function Yt(t,n,e){return Vt(n,e)[t]}function $t(t,n,e,i){switch(t.type){case 0:{const o=e.states.find(s=>s.id===t.stateId);return o?n.strategies[t.stateId]===f.HOSTILE?{timestamp:e.timestamp,role:"commander",message:"We are already attacking "+o.name}:(n.strategies[t.stateId]=f.HOSTILE,i({...e,states:e.states}),{timestamp:e.timestamp,role:"commander",message:"Affirmative, attacking "+o.name}):{timestamp:e.timestamp,role:"commander",message:"I don't understand who should be attacked"}}case 1:console.log("attack city",t.cityId);break;case 2:console.log("attack launch site",t.stateId);break;case 3:console.log("attack missile",t.stateId);break}}function Vt(t,n){const e={};for(const i of n.states.filter(o=>o.id!==t.id))e["attack "+i.name]={type:0,stateId:i.id};for(const i of n.cities.filter(o=>o.stateId!==t.id))e["attack "+i.name]={type:0,stateId:i.id};return e}function qt({worldState:t,setWorldState:n}){const e=t.states.find(o=>o.isPlayerControlled);if(!e)return null;const i=(o,s)=>{const r=t.states.map(u=>u.id===e.id?{...u,strategies:{...u.strategies,[o]:s}}:u);n({...t,states:r})};return a.jsxs(Zt,{children:[t.states.map(o=>o.id!==e.id?a.jsxs("div",{children:[a.jsx("span",{children:o.name}),a.jsx("select",{value:e.strategies[o.id],onChange:s=>i(o.id,s.target.value),children:Object.values(f).map(s=>a.jsx("option",{value:s,children:s},s))})]},o.id):null),a.jsx(Bt,{playerState:e,worldState:t,setWorldState:n})]})}const Zt=y.div`
  position: fixed;
  right: 280px;
  top: 0;
  z-index: 1;

  max-width: 25%;
  min-width: 200px;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgb(0, 255, 0);
`;function Kt({worldState:t,setWorldState:n,updateWorldState:e}){return a.jsx(Tt,{children:a.jsx(xt,{children:a.jsxs(Jt,{children:[a.jsx(vt,{worldState:t,setWorldState:n}),a.jsx(Gt,{updateWorldTime:i=>e(t,i)}),a.jsx(qt,{worldState:t,setWorldState:n}),a.jsx(Ht,{state:t}),a.jsx(wt,{}),a.jsx(_t,{worldState:t})]})})})}const Jt=y.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  display: flex;
  flex-direction: column;

  background: black;
`;function Qt({worldState:t,onGameOver:n}){return d.useEffect(()=>{var c;const e=Object.fromEntries(t.states.map(p=>[p.id,t.cities.filter(l=>l.stateId===p.id).reduce((l,h)=>l+h.populationHistogram[h.populationHistogram.length-1].population,0)])),i=Object.values(e).filter(p=>p>0).length,o=t.launchSites.length===0,s=t.timestamp,r=t.states.filter(p=>e[p.id]>0&&Object.entries(p.strategies).filter(([l,h])=>e[l]>0&&h===f.HOSTILE).length>0),u=t.launchSites.some(p=>p.lastLaunchTimestamp&&s-p.lastLaunchTimestamp<z);if(i<=1||o||!r.length&&!u&&s>z){const p=i===1?(c=t.states.find(l=>e[l.id]>0))==null?void 0:c.id:void 0;n({populations:Object.fromEntries(t.states.map(l=>[l.id,e[l.id]])),winner:p,stateNames:Object.fromEntries(t.states.map(l=>[l.id,l.name])),playerStateId:t.states.find(l=>l.isPlayerControlled).id})}},[t,n]),null}const te=({setGameState:t})=>{const{state:{result:n}}=W(),e=()=>{t(S,{stateName:n.stateNames[n.playerStateId]})};return a.jsxs("div",{children:[a.jsx("h2",{children:"Game Over"}),n.winner?a.jsxs("p",{children:["The winner is ",n.stateNames[n.winner]," with ",n.populations[n.winner]," population alive."]}):a.jsx("p",{children:"It's a draw!"}),a.jsx("button",{onClick:e,children:"Play Again"}),a.jsx("br",{}),a.jsx("br",{}),a.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})},O={Component:te,path:"played"},ee=({setGameState:t})=>{const{state:{stateName:n}}=W(),{worldState:e,setWorldState:i,updateWorldState:o}=mt(n);return a.jsxs(a.Fragment,{children:[a.jsx(Kt,{worldState:e,updateWorldState:o,setWorldState:i}),a.jsx(Qt,{worldState:e,onGameOver:s=>t(O,{result:s})})]})},S={Component:ee,path:"playing"},ne=({setGameState:t})=>{const[n,e]=d.useState(_(1)[0]),i=()=>{t(S,{stateName:n})};return a.jsxs(a.Fragment,{children:[a.jsx("div",{children:a.jsx("input",{type:"text",placeholder:"Name your state",value:n,onChange:o=>e(o.currentTarget.value)})}),a.jsx("button",{onClick:i,disabled:!n,children:"Play"})]})},A={Component:ne,path:"play"},ie=y.div`
  height: 100vh;
  width: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;

  h3 {
    font-size: 3rem;
  }
`,oe=({setGameState:t})=>a.jsxs(ie,{children:[a.jsx("h3",{children:"Nukes game"}),a.jsx("br",{}),a.jsx("button",{onClick:()=>t(A),children:"Play"})]}),G={Component:oe,path:""},se=K`
:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}
a:hover {
  color: #535bf2;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #101010;
  color: #eee;
}

#root {
  width: 100%;
  margin: 0;
  padding: 0;
  text-align: center;
}


h1 {
  font-size: 3.2em;
  line-height: 1.1;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #202020;
  color: #eee;
  cursor: pointer;
  transition: border-color 0.25s;
}
button:hover {
  border-color: #646cff;
}
button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}
`,ae=[{path:G.path,element:a.jsx(I,{state:G})},{path:A.path,element:a.jsx(I,{state:A})},{path:S.path,element:a.jsx(I,{state:S})},{path:O.path,element:a.jsx(I,{state:O})}];function ce(){var e;const[t]=J(),n=t.get("path")??"";return a.jsx(a.Fragment,{children:(e=ae.find(i=>i.path===n))==null?void 0:e.element})}function I({state:t}){const n=Q();return a.jsxs(a.Fragment,{children:[a.jsx(se,{}),a.jsx(t.Component,{setGameState:(e,i)=>n({search:"path="+e.path},{state:i})})]})}export{ce as NukesApp,ae as routes};
