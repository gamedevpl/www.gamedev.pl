import{r as d,j as a,R as Z,d as b,u as W,f as J,a as K,b as Q}from"./index-DPbCPJZm.js";function tt(t){return[...et].sort(()=>Math.random()-Math.random()).slice(0,t)}const et=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function _(t){return[...nt].sort(()=>Math.random()-Math.random()).slice(0,t)}const nt=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];var x=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(x||{}),T=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(T||{}),E=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(E||{});function it({playerStateName:t,numberOfStates:n=3}){const s=_(n+1).filter(m=>m!==t),r=tt(n*2),u=[{id:"state-1",name:t,isPlayerControlled:!0,strategies:{"state-2":x.NEUTRAL,"state-3":x.NEUTRAL}},{id:"state-2",name:s.pop(),isPlayerControlled:!1,strategies:{"state-1":x.NEUTRAL,"state-3":x.NEUTRAL}},{id:"state-3",name:s.pop(),isPlayerControlled:!1,strategies:{"state-1":x.NEUTRAL,"state-2":x.NEUTRAL}}],l=[{id:"city-1",stateId:"state-1",name:r.pop(),position:{x:10*16,y:10*16},populationHistogram:[{timestamp:0,population:1e3}]},{id:"city-2",stateId:"state-1",name:r.pop(),position:{x:13*16,y:13*16},populationHistogram:[{timestamp:0,population:1500}]},{id:"city-3",stateId:"state-2",name:r.pop(),position:{x:30*16,y:10*16},populationHistogram:[{timestamp:0,population:2e3}]},{id:"city-4",stateId:"state-2",name:r.pop(),position:{x:33*16,y:13*16},populationHistogram:[{timestamp:0,population:2500}]},{id:"city-5",stateId:"state-3",name:r.pop(),position:{x:10*16,y:30*16},populationHistogram:[{timestamp:0,population:3e3}]},{id:"city-6",stateId:"state-3",name:r.pop(),position:{x:13*16,y:33*16},populationHistogram:[{timestamp:0,population:3500}]}],p=[{type:T.LAUNCH_SITE,id:"launch-site-1",stateId:"state-1",position:{x:8*16,y:15*16}},{type:T.LAUNCH_SITE,id:"launch-site-2",stateId:"state-1",position:{x:15*16,y:8*16}},{type:T.LAUNCH_SITE,id:"launch-site-3",stateId:"state-2",position:{x:28*16,y:15*16}},{type:T.LAUNCH_SITE,id:"launch-site-4",stateId:"state-2",position:{x:35*16,y:8*16}},{type:T.LAUNCH_SITE,id:"launch-site-5",stateId:"state-3",position:{x:8*16,y:35*16}},{type:T.LAUNCH_SITE,id:"launch-site-6",stateId:"state-3",position:{x:15*16,y:28*16}}],c=[];let h=1;for(let m=0;m<50;m++)for(let y=0;y<50;y++){const q=m>=8&&m<=17&&y>=7&&y<=18||m>=7&&m<=18&&y>=27&&y<=38||m>=27&&m<=38&&y>=7&&y<=18;c.push({id:`sector-${h++}`,position:{x:y*16,y:m*16},rect:{left:y*16,top:m*16,right:(y+1)*16,bottom:(m+1)*16},type:q?E.GROUND:E.WATER})}return{timestamp:0,states:u,cities:l,launchSites:p,sectors:c,missiles:[],explosions:[]}}function g(t,n,e,i){return Math.sqrt(Math.pow(e-t,2)+Math.pow(i-n,2))}const L=10,S=20,ot=5,st=S/ot,at=.5,rt=500,C=.05,F=5,z=60;function ct(t){var n,e;for(const i of t.states){const o=t.cities.filter(c=>c.stateId===i.id),s=t.launchSites.filter(c=>c.stateId===i.id),r=t.cities.filter(c=>i.strategies[c.stateId]===x.HOSTILE&&c.stateId!==i.id&&c.populationHistogram.slice(-1)[0].population>0),u=t.missiles.filter(c=>i.strategies[c.stateId]!==x.FRIENDLY&&c.stateId!==i.id),l=t.launchSites.filter(c=>i.strategies[c.stateId]===x.HOSTILE&&c.stateId!==i.id),p=u.filter(c=>o.some(h=>O(c.target,h.position))||s.some(h=>O(c.target,h.position))).filter(c=>(t.timestamp-c.launchTimestamp)/(c.targetTimestamp-c.launchTimestamp)>.5);for(const c of t.launchSites.filter(h=>h.stateId===i.id)){if(c.nextLaunchTarget)continue;if(r.length===0&&l.length===0&&u.length===0)break;const h=w(p.map(m=>({...m,position:B(m,t.timestamp),interceptionPoint:lt(m,c.position,t.timestamp)})),c.position),f=t.missiles.filter(m=>m.stateId===i.id),j=U(h,f).filter(([,m])=>m<s.length);if(j.length>0)c.nextLaunchTarget=j[0][0].interceptionPoint??void 0;else{const m=U(w([...l,...r],c.position),f);c.nextLaunchTarget=((e=(n=m==null?void 0:m[0])==null?void 0:n[0])==null?void 0:e.position)??void 0}}}return t}function B(t,n){const e=(n-t.launchTimestamp)/(t.targetTimestamp-t.launchTimestamp);return{x:t.launch.x+(t.target.x-t.launch.x)*e,y:t.launch.y+(t.target.y-t.launch.y)*e}}function lt(t,n,e){const i=B(t,e),o=g(i.x,i.y,n.x,n.y);if(o<S)return null;const s=g(t.target.x,t.target.y,t.launch.x,t.launch.y),r=(t.target.x-t.launch.x)/s,u=(t.target.y-t.launch.y)/s,l={x:t.target.x-r*S*2,y:t.target.y-u*S*2},p=o/L,c=g(n.x,n.y,l.x,l.y)/L;return p<c||p>c+10?null:l}function O(t,n){const e=S;return g(t.x,t.y,n.x,n.y)<=e}function w(t,n){return t.sort((e,i)=>g(e.position.x,e.position.y,n.x,n.y)-g(i.position.x,i.position.y,n.x,n.y))}function U(t,n){const e=new Map;for(const i of t)e.set(i,n.filter(o=>O(o.target,i.position)).length);return Array.from(e).sort((i,o)=>i[1]-o[1])}function ut(t){var n,e;for(const i of t.missiles.filter(o=>o.launchTimestamp===t.timestamp)){const o=t.states.find(r=>r.id===i.stateId),s=((n=t.cities.find(r=>g(r.position.x,r.position.y,i.target.x,i.target.y)<=S))==null?void 0:n.stateId)||((e=t.launchSites.find(r=>g(r.position.x,r.position.y,i.target.x,i.target.y)<=S))==null?void 0:e.stateId);if(o&&s&&o.id!==s){o.strategies[s]!==x.HOSTILE&&(o.strategies[s]=x.HOSTILE);const r=t.states.find(u=>u.id===s);r&&r.strategies[o.id]!==x.HOSTILE&&(r.strategies[o.id]=x.HOSTILE)}}for(const i of t.states)if(!Object.entries(i.strategies).some(([s,r])=>r===x.HOSTILE&&t.launchSites.some(u=>u.stateId===s))){const s=t.launchSites.filter(u=>u.stateId===i.id).length,r=t.states.filter(u=>u.id!==i.id&&i.strategies[u.id]===x.NEUTRAL&&t.launchSites.filter(l=>l.stateId===u.id).length<s&&t.cities.filter(l=>l.stateId===u.id).some(l=>l.populationHistogram.slice(-1)[0].population>0));if(r.length>0){const u=r[0];i.strategies[u.id]=x.HOSTILE}}return t}function pt(t,n){for(;n>0;){const e=dt(t,n>C?C:n);n=n>C?n-C:0,t=e}return t}function dt(t,n){const e=t.timestamp+n;let i={timestamp:e,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,explosions:t.explosions,sectors:t.sectors};for(const o of t.missiles.filter(s=>s.targetTimestamp<=e)){const s={id:`explosion-${Math.random()}`,missileId:o.id,startTimestamp:o.targetTimestamp,endTimestamp:o.targetTimestamp+st,position:o.target,radius:S};i.explosions.push(s);for(const l of t.cities.filter(p=>g(p.position.x,p.position.y,s.position.x,s.position.y)<=s.radius)){const p=l.populationHistogram[l.populationHistogram.length-1].population,c=Math.max(rt,p*at);l.populationHistogram.push({timestamp:s.startTimestamp,population:Math.max(0,p-c)})}const r=t.missiles.filter(l=>l.id!==s.missileId&&l.launchTimestamp<=s.startTimestamp&&l.targetTimestamp>=s.startTimestamp).filter(l=>{const p=s.startTimestamp,{x:c,y:h}={x:l.launch.x+(l.target.x-l.launch.x)/(l.targetTimestamp-l.launchTimestamp)*(p-l.launchTimestamp),y:l.launch.y+(l.target.y-l.launch.y)/(l.targetTimestamp-l.launchTimestamp)*(p-l.launchTimestamp)};return g(c,h,s.position.x,s.position.y)<=s.radius});for(const l of r)l.targetTimestamp=s.startTimestamp;const u=t.launchSites.filter(l=>g(l.position.x,l.position.y,s.position.x,s.position.y)<=s.radius);for(const l of u)i.launchSites=t.launchSites.filter(p=>p.id!==l.id)}i.explosions=i.explosions.filter(o=>o.endTimestamp>=e),i.missiles=i.missiles.filter(o=>o.targetTimestamp>e);for(const o of t.launchSites){if(o.nextLaunchTarget){if(o.lastLaunchTimestamp&&e-o.lastLaunchTimestamp<F)continue}else continue;const s=g(o.position.x,o.position.y,o.nextLaunchTarget.x,o.nextLaunchTarget.y),r={id:Math.random()+"",stateId:o.stateId,launchSiteId:o.id,launch:o.position,launchTimestamp:e,target:o.nextLaunchTarget,targetTimestamp:e+s/L};i.missiles.push(r),o.lastLaunchTimestamp=e,o.nextLaunchTarget=void 0}return i=ct(i),i=ut(i),i}function mt(t){const[n,e]=d.useState(()=>it({playerStateName:t,numberOfStates:3})),i=d.useCallback((o,s)=>e(pt(o,s)),[]);return{worldState:n,updateWorldState:i,setWorldState:e}}function ht(t,n){const e=new CustomEvent(t,{bubbles:!0,detail:n});document.dispatchEvent(e)}function ft(t,n){d.useEffect(()=>{const e=i=>{n(i.detail)};return document.addEventListener(t,e,!1),()=>{document.removeEventListener(t,e,!1)}},[t,n])}const X={x:0,y:0,pointingObjects:[]},xt=(t,n)=>n.type==="move"?{x:n.x,y:n.y,pointingObjects:t.pointingObjects}:n.type==="point"&&!t.pointingObjects.some(e=>e.id===n.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,n.object]}:n.type==="unpoint"&&t.pointingObjects.some(e=>e.id===n.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(e=>e.id!==n.object.id)}:t,Y=d.createContext(X),P=d.createContext(()=>{});function gt({children:t}){const[n,e]=d.useReducer(xt,X);return a.jsx(Y.Provider,{value:n,children:a.jsx(P.Provider,{value:e,children:t})})}function M(){return d.useContext(Y)}function yt(){const t=d.useContext(P);return(n,e)=>t({type:"move",x:n,y:e})}function N(){const t=d.useContext(P);return[n=>t({type:"point",object:n}),n=>t({type:"unpoint",object:n})]}const k={},bt=(t,n)=>n.type==="clear"?k:n.type==="set"?{...t,selectedObject:n.object}:t,H=d.createContext(k),$=d.createContext(()=>{});function St({children:t}){const[n,e]=d.useReducer(bt,k);return a.jsx(H.Provider,{value:n,children:a.jsx($.Provider,{value:e,children:t})})}function Tt(t){var i;const n=d.useContext($);return[((i=d.useContext(H).selectedObject)==null?void 0:i.id)===t.id,()=>n({type:"set",object:t})]}function V(){return d.useContext(H).selectedObject}function jt({worldState:t,setWorldState:n}){const e=V(),i=M();return ft("world-click",()=>{if((e==null?void 0:e.type)!==T.LAUNCH_SITE||i.pointingObjects.length===0)return;const o=i.pointingObjects[0].position;t.cities.some(r=>r.stateId===e.stateId&&g(r.position.x,r.position.y,o.x,o.y)<S)||t.launchSites.some(r=>r.stateId===e.stateId&&g(r.position.x,r.position.y,o.x,o.y)<S)||(e.nextLaunchTarget=o),n({...t})}),null}const Ct=Z.memo(({sectors:t})=>{const n=d.useRef(null),[e,i]=N();return d.useEffect(()=>{const o=n.current,s=o==null?void 0:o.getContext("2d");if(!o||!s)return;const r=Math.min(...t.map(f=>f.rect.left)),u=Math.min(...t.map(f=>f.rect.top)),l=Math.max(...t.map(f=>f.rect.right)),p=Math.max(...t.map(f=>f.rect.bottom)),c=l-r,h=p-u;o.width=c,o.height=h,o.style.width=`${c}px`,o.style.height=`${h}px`,s.clearRect(0,0,c,h),t.forEach(f=>{const{fillStyle:j,drawSector:m}=vt(f);s.fillStyle=j,m(s,f.rect,r,u)})},[t]),d.useEffect(()=>{const o=n.current;let s;const r=u=>{const l=o==null?void 0:o.getBoundingClientRect(),p=u.clientX-((l==null?void 0:l.left)||0),c=u.clientY-((l==null?void 0:l.top)||0),h=t.find(f=>p>=f.rect.left&&p<=f.rect.right&&c>=f.rect.top&&c<=f.rect.bottom);h&&(s&&i(s),e(h),s=h)};return o==null||o.addEventListener("mousemove",r),()=>{o==null||o.removeEventListener("mousemove",r)}},[t,e,i]),a.jsx("canvas",{ref:n})});function vt(t){switch(t.type){case"GROUND":return{fillStyle:"rgb(93, 42, 0)",drawSector:(n,e,i,o)=>{n.fillStyle="rgb(93, 42, 0)",n.fillRect(e.left-i,e.top-o,e.right-e.left,e.bottom-e.top)}};case"WATER":return{fillStyle:"rgb(0, 34, 93)",drawSector:(n,e,i,o)=>{const s=n.createLinearGradient(e.left-i,e.top-o,e.right-i,e.bottom-o);s.addColorStop(0,"rgb(0, 34, 93)"),s.addColorStop(1,"rgb(0, 137, 178)"),n.fillStyle=s,n.fillRect(e.left-i,e.top-o,e.right-e.left,e.bottom-e.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(n,e,i,o)=>{n.fillStyle="rgb(0, 34, 93)",n.fillRect(e.left-i,e.top-o,e.right-e.left,e.bottom-e.top)}}}}function It(){return a.jsx(Et,{})}const Et=b.div``;function Lt({city:t}){const[n,e]=N();return a.jsx(Ot,{onMouseEnter:()=>n(t),onMouseLeave:()=>e(t),style:{"--x":t.position.x,"--y":t.position.y}})}const Ot=b.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 10px;
  height: 10px;
  background: rgb(0, 0, 255);
`;function At({launchSite:t,worldTimestamp:n,isPlayerControlled:e}){const[i,o]=Tt(t),[s,r]=N(),u=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+F>n;return a.jsx(Rt,{onMouseEnter:()=>s(t),onMouseLeave:()=>r(t),onClick:()=>e&&o(),style:{"--x":t.position.x,"--y":t.position.y},"data-selected":i,"data-cooldown":u})}const Rt=b.div`
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
`;function Pt({missile:t,worldTimestamp:n}){if(t.launchTimestamp>n||t.targetTimestamp<n)return null;const e=Math.min(Math.max(0,(n-t.launchTimestamp)/(t.targetTimestamp-t.launchTimestamp)),1),i=t.launch.x+(t.target.x-t.launch.x)*e,o=t.launch.y+(t.target.y-t.launch.y)*e;return a.jsx(Mt,{style:{"--x":i,"--y":o}})}const Mt=b.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
  position: absolute;
  width: 1px;
  height: 1px;
  background: rgb(0, 255, 0);
`;function Nt({explosion:t,worldTimestamp:n}){if(t.startTimestamp>n||t.endTimestamp<n)return null;const e=Math.pow(Math.min(Math.max(0,(n-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);return a.jsx(kt,{style:{"--x":t.position.x,"--y":t.position.y,"--radius":t.radius*e,"--color":`rgb(${255*e}, ${255*(1-e)}, 0)`}})}const kt=b.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: calc(var(--radius) * 2px);
  height: calc(var(--radius) * 2px);
  border-radius: 50%;
  background: var(--color);

  pointer-events: none;
`;function Ht({state:t}){const n=yt();return a.jsxs(zt,{onMouseMove:e=>n(e.clientX,e.clientY),onClick:()=>ht("world-click"),children:[a.jsx(Ct,{sectors:t.sectors}),t.states.map(e=>a.jsx(It,{},e.id)),t.cities.map(e=>a.jsx(Lt,{city:e},e.id)),t.launchSites.map(e=>{var i;return a.jsx(At,{launchSite:e,worldTimestamp:t.timestamp,isPlayerControlled:e.stateId===((i=t.states.find(o=>o.isPlayerControlled))==null?void 0:i.id)},e.id)}),t.missiles.filter(e=>e.launchTimestamp<t.timestamp&&e.targetTimestamp>t.timestamp).map(e=>a.jsx(Pt,{missile:e,worldTimestamp:t.timestamp},e.id)),t.explosions.filter(e=>e.startTimestamp<t.timestamp&&e.endTimestamp>t.timestamp).map(e=>a.jsx(Nt,{explosion:e,worldTimestamp:t.timestamp},e.id))]})}const zt=b.div`
  display: flex;
  flex-grow: 1;

  background: black;
`;function wt(){const t=V(),n=M();return(t==null?void 0:t.type)!==T.LAUNCH_SITE?null:a.jsx(Ut,{style:{"--x":n.x,"--y":n.y},children:n.pointingObjects.length>0?"Launch":""})}const Ut=b.div`
  position: absolute;
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
  pointer-events: none;
  color: red;
`;function Dt(t,n){var e=d.useRef(null),i=d.useRef(!1),o=d.useRef(t);o.current=t;var s=d.useCallback(function(u){i.current&&(o.current(u),e.current=requestAnimationFrame(s))},[]),r=d.useMemo(function(){return[function(){i.current&&(i.current=!1,e.current&&cancelAnimationFrame(e.current))},function(){i.current||(i.current=!0,e.current=requestAnimationFrame(s))},function(){return i.current}]},[]);return d.useEffect(function(){return r[1](),r[0]},[]),r}function Gt({updateWorldTime:t}){const[n,e]=d.useState(!0),i=d.useRef(null);return Dt(o=>{if(!i.current){i.current=o;return}const s=o-i.current;i.current=o,!(s<=0)&&n&&t(s/1e3)}),a.jsx("div",{className:"meta-controls",children:a.jsxs("div",{children:[a.jsx("button",{onClick:()=>t(1),children:"+1 Second"}),a.jsx("button",{onClick:()=>t(10),children:"+10 Seconds"}),a.jsx("button",{onClick:()=>t(60),children:"+60 seconds"}),a.jsx("button",{onClick:()=>e(!n),children:n?"Stop autoplay":"Start autoplay"})]})})}function D(t,n){let e=t[0];for(const i of t)i.timestamp<n&&i.timestamp>e.timestamp&&(e=i);return e}function Wt({worldState:t}){const n=M(),e=Object.fromEntries(t.states.map(s=>[s.id,t.cities.filter(r=>r.stateId===s.id).map(r=>[r,D(r.populationHistogram,t.timestamp).population])])),i=t.states.map(s=>[s,e[s.id].reduce((r,[,u])=>r+u,0)]),o=t.cities.reduce((s,r)=>s+D(r.populationHistogram,t.timestamp).population,0);return a.jsx(_t,{children:a.jsxs("ul",{children:[a.jsxs("li",{children:["Time: ",t.timestamp.toFixed(2)]}),a.jsxs("li",{children:["Pointing object: ",n.pointingObjects.length]}),a.jsxs("li",{children:["World population: ",o]}),a.jsx("li",{children:"Population: "}),a.jsx("ul",{children:i.map(([s,r])=>a.jsxs("li",{children:[s.name,": ",r,a.jsx("ul",{children:e[s.id].map(([u,l])=>a.jsxs("li",{children:[u.name,": ",l]},u.id))})]},s.id))})]})})}const _t=b.div`
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
  border: 1px solid green;

  li {
    text-align: left;
  }
`;function Ft({worldState:t,setWorldState:n}){const e=t.states.find(o=>o.isPlayerControlled);if(!e)return null;const i=(o,s)=>{const r=t.states.map(u=>u.id===e.id?{...u,strategies:{...u.strategies,[o]:s}}:u);n({...t,states:r})};return a.jsx(Bt,{children:t.states.map(o=>o.id!==e.id?a.jsxs("div",{children:[a.jsx("span",{children:o.name}),a.jsx("select",{value:e.strategies[o.id],onChange:s=>i(o.id,s.target.value),children:Object.values(x).map(s=>a.jsx("option",{value:s,children:s},s))})]},o.id):null)})}const Bt=b.div`
  position: fixed;
  right: 250px;
  top: 0;
  z-index: 1;

  max-width: 25%;
  min-width: 200px;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid green;
`;function Xt({worldState:t,setWorldState:n,updateWorldState:e}){return a.jsx(St,{children:a.jsx(gt,{children:a.jsxs(Yt,{children:[a.jsx(jt,{worldState:t,setWorldState:n}),a.jsx(Gt,{updateWorldTime:i=>e(t,i)}),a.jsx(Ft,{worldState:t,setWorldState:n}),a.jsx(Ht,{state:t}),a.jsx(wt,{}),a.jsx(Wt,{worldState:t})]})})})}const Yt=b.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  display: flex;
  flex-direction: column;

  background: black;

  .meta-controls {
    display: flex;
    flex-grow: 0;

    border: 1px solid rgb(0, 255, 0);
    padding: 5px 10px;

    text-align: left;
    color: white;
    z-index: 1;
  }
`;function $t({worldState:t,onGameOver:n}){return d.useEffect(()=>{var l;const e=Object.fromEntries(t.states.map(p=>[p.id,t.cities.filter(c=>c.stateId===p.id).reduce((c,h)=>c+h.populationHistogram[h.populationHistogram.length-1].population,0)])),i=Object.values(e).filter(p=>p>0).length,o=t.launchSites.length===0,s=t.timestamp,r=t.states.filter(p=>e[p.id]>0&&Object.entries(p.strategies).filter(([c,h])=>e[c]>0&&h===x.HOSTILE).length>0),u=t.launchSites.some(p=>p.lastLaunchTimestamp&&s-p.lastLaunchTimestamp<z);if(i<=1||o||!r.length&&!u&&s>z){const p=i===1?(l=t.states.find(c=>e[c.id]>0))==null?void 0:l.id:void 0;n({populations:Object.fromEntries(t.states.map(c=>[c.id,e[c.id]])),winner:p,stateNames:Object.fromEntries(t.states.map(c=>[c.id,c.name])),playerStateId:t.states.find(c=>c.isPlayerControlled).id})}},[t,n]),null}const Vt=({setGameState:t})=>{const{state:{result:n}}=W(),e=()=>{t(I,{stateName:n.stateNames[n.playerStateId]})};return a.jsxs("div",{children:[a.jsx("h2",{children:"Game Over"}),n.winner?a.jsxs("p",{children:["The winner is ",n.stateNames[n.winner]," with ",n.populations[n.winner]," population alive."]}):a.jsx("p",{children:"It's a draw!"}),a.jsx("button",{onClick:e,children:"Play Again"}),a.jsx("br",{}),a.jsx("br",{}),a.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})},A={Component:Vt,path:"played"},qt=({setGameState:t})=>{const{state:{stateName:n}}=W(),{worldState:e,setWorldState:i,updateWorldState:o}=mt(n);return a.jsxs(a.Fragment,{children:[a.jsx(Xt,{worldState:e,updateWorldState:o,setWorldState:i}),a.jsx($t,{worldState:e,onGameOver:s=>t(A,{result:s})})]})},I={Component:qt,path:"playing"},Zt=({setGameState:t})=>{const[n,e]=d.useState(_(1)[0]),i=()=>{t(I,{stateName:n})};return a.jsxs(a.Fragment,{children:[a.jsx("div",{children:a.jsx("input",{type:"text",placeholder:"Name your state",value:n,onChange:o=>e(o.currentTarget.value)})}),a.jsx("button",{onClick:i,disabled:!n,children:"Play"})]})},R={Component:Zt,path:"play"},Jt=b.div`
  height: 100vh;
  width: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;

  h3 {
    font-size: 3rem;
  }
`,Kt=({setGameState:t})=>a.jsxs(Jt,{children:[a.jsx("h3",{children:"Nukes game"}),a.jsx("br",{}),a.jsx("button",{onClick:()=>t(R),children:"Play"})]}),G={Component:Kt,path:""},Qt=J`
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
`,te=[{path:G.path,element:a.jsx(v,{state:G})},{path:R.path,element:a.jsx(v,{state:R})},{path:I.path,element:a.jsx(v,{state:I})},{path:A.path,element:a.jsx(v,{state:A})}];function ne(){var e;const[t]=K(),n=t.get("path")??"";return a.jsx(a.Fragment,{children:(e=te.find(i=>i.path===n))==null?void 0:e.element})}function v({state:t}){const n=Q();return a.jsxs(a.Fragment,{children:[a.jsx(Qt,{}),a.jsx(t.Component,{setGameState:(e,i)=>n({search:"path="+e.path},{state:i})})]})}export{ne as NukesApp,te as routes};
