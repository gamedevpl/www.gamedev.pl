import{r as d,j as r,R as Z,d as y,u as _,f as J,a as K,b as Q}from"./index-O07M1nWz.js";function tt(t){return[...et].sort(()=>Math.random()-Math.random()).slice(0,t)}const et=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function F(t){return[...nt].sort(()=>Math.random()-Math.random()).slice(0,t)}const nt=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];var g=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(g||{}),T=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(T||{}),E=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(E||{});function ot({playerStateName:t,numberOfStates:e=3}){const s=F(e+1).filter(m=>m!==t),a=tt(e*2),p=[{id:"state-1",name:t,isPlayerControlled:!0,strategies:{"state-2":g.NEUTRAL,"state-3":g.NEUTRAL}},{id:"state-2",name:s.pop(),isPlayerControlled:!1,strategies:{"state-1":g.NEUTRAL,"state-3":g.NEUTRAL}},{id:"state-3",name:s.pop(),isPlayerControlled:!1,strategies:{"state-1":g.NEUTRAL,"state-2":g.NEUTRAL}}],l=[{id:"city-1",stateId:"state-1",name:a.pop(),position:{x:10*16,y:10*16},populationHistogram:[{timestamp:0,population:1e3}]},{id:"city-2",stateId:"state-1",name:a.pop(),position:{x:13*16,y:13*16},populationHistogram:[{timestamp:0,population:1500}]},{id:"city-3",stateId:"state-2",name:a.pop(),position:{x:30*16,y:10*16},populationHistogram:[{timestamp:0,population:2e3}]},{id:"city-4",stateId:"state-2",name:a.pop(),position:{x:33*16,y:13*16},populationHistogram:[{timestamp:0,population:2500}]},{id:"city-5",stateId:"state-3",name:a.pop(),position:{x:10*16,y:30*16},populationHistogram:[{timestamp:0,population:3e3}]},{id:"city-6",stateId:"state-3",name:a.pop(),position:{x:13*16,y:33*16},populationHistogram:[{timestamp:0,population:3500}]}],u=[{type:T.LAUNCH_SITE,id:"launch-site-1",stateId:"state-1",position:{x:8*16,y:15*16}},{type:T.LAUNCH_SITE,id:"launch-site-2",stateId:"state-1",position:{x:15*16,y:8*16}},{type:T.LAUNCH_SITE,id:"launch-site-3",stateId:"state-2",position:{x:28*16,y:15*16}},{type:T.LAUNCH_SITE,id:"launch-site-4",stateId:"state-2",position:{x:35*16,y:8*16}},{type:T.LAUNCH_SITE,id:"launch-site-5",stateId:"state-3",position:{x:8*16,y:35*16}},{type:T.LAUNCH_SITE,id:"launch-site-6",stateId:"state-3",position:{x:15*16,y:28*16}}],c=[];let h=1;for(let m=0;m<50;m++)for(let b=0;b<50;b++){const q=m>=8&&m<=17&&b>=7&&b<=18||m>=7&&m<=18&&b>=27&&b<=38||m>=27&&m<=38&&b>=7&&b<=18;c.push({id:`sector-${h++}`,position:{x:b*16,y:m*16},rect:{left:b*16,top:m*16,right:(b+1)*16,bottom:(m+1)*16},type:q?E.GROUND:E.WATER})}return{timestamp:0,states:p,cities:l,launchSites:u,sectors:c,missiles:[],explosions:[]}}function x(t,e,n,o){return Math.sqrt(Math.pow(n-t,2)+Math.pow(o-e,2))}const L=10,S=20,it=5,st=S/it,rt=.5,at=500,v=.05,P=5,w=60;function ct(t){var e,n;for(const o of t.states){const i=t.cities.filter(c=>c.stateId===o.id),s=t.launchSites.filter(c=>c.stateId===o.id),a=t.cities.filter(c=>o.strategies[c.stateId]===g.HOSTILE&&c.stateId!==o.id&&c.populationHistogram.slice(-1)[0].population>0),p=t.missiles.filter(c=>o.strategies[c.stateId]!==g.FRIENDLY&&c.stateId!==o.id),l=t.launchSites.filter(c=>o.strategies[c.stateId]===g.HOSTILE&&c.stateId!==o.id),u=p.filter(c=>i.some(h=>O(c.target,h.position))||s.some(h=>O(c.target,h.position))).filter(c=>(t.timestamp-c.launchTimestamp)/(c.targetTimestamp-c.launchTimestamp)>.5);for(const c of t.launchSites.filter(h=>h.stateId===o.id)){if(c.nextLaunchTarget)continue;if(a.length===0&&l.length===0&&p.length===0)break;const h=U(u.map(m=>({...m,interceptionPoint:lt(m,c.position)})),c.position),f=t.missiles.filter(m=>m.stateId===o.id),C=G(h,f).filter(([,m])=>m<s.length);if(C.length>0)c.nextLaunchTarget=C[0][0].interceptionPoint??void 0;else{const m=G(U([...l,...a],c.position),f);c.nextLaunchTarget=((n=(e=m==null?void 0:m[0])==null?void 0:e[0])==null?void 0:n.position)??void 0}}}return t}function lt(t,e){const n=x(t.position.x,t.position.y,e.x,e.y);if(n<S)return null;const o=x(t.target.x,t.target.y,t.launch.x,t.launch.y),i=(t.target.x-t.launch.x)/o,s=(t.target.y-t.launch.y)/o,a={x:t.target.x-i*S*2,y:t.target.y-s*S*2},p=n/L,l=x(e.x,e.y,a.x,a.y)/L;return p<l||p>l+10?null:a}function O(t,e){const n=S;return x(t.x,t.y,e.x,e.y)<=n}function U(t,e){return t.sort((n,o)=>x(n.position.x,n.position.y,e.x,e.y)-x(o.position.x,o.position.y,e.x,e.y))}function G(t,e){const n=new Map;for(const o of t)n.set(o,e.filter(i=>O(i.target,o.position)).length);return Array.from(n).sort((o,i)=>o[1]-i[1])}function pt(t){var e,n;for(const o of t.missiles.filter(i=>i.launchTimestamp===t.timestamp)){const i=t.states.find(a=>a.id===o.stateId),s=((e=t.cities.find(a=>x(a.position.x,a.position.y,o.target.x,o.target.y)<=S))==null?void 0:e.stateId)||((n=t.launchSites.find(a=>x(a.position.x,a.position.y,o.target.x,o.target.y)<=S))==null?void 0:n.stateId);if(i&&s&&i.id!==s){i.strategies[s]!==g.HOSTILE&&(i.strategies[s]=g.HOSTILE);const a=t.states.find(p=>p.id===s);a&&a.strategies[i.id]!==g.HOSTILE&&(a.strategies[i.id]=g.HOSTILE)}}for(const o of t.states)if(!Object.entries(o.strategies).some(([s,a])=>a===g.HOSTILE&&t.launchSites.some(p=>p.stateId===s))){const s=t.launchSites.filter(p=>p.stateId===o.id).length,a=t.states.filter(p=>p.id!==o.id&&o.strategies[p.id]===g.NEUTRAL&&t.launchSites.filter(l=>l.stateId===p.id).length<s&&t.cities.filter(l=>l.stateId===p.id).some(l=>l.populationHistogram.slice(-1)[0].population>0));if(a.length>0){const p=a[0];o.strategies[p.id]=g.HOSTILE}}return t}function ut(t,e){for(;e>0;){const n=dt(t,e>v?v:e);e=e>v?e-v:0,t=n}return t}function dt(t,e){const n=t.timestamp+e;let o={timestamp:n,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,explosions:t.explosions,sectors:t.sectors};for(const i of o.missiles){const s=(n-i.launchTimestamp)/(i.targetTimestamp-i.launchTimestamp);i.position={x:i.launch.x+(i.target.x-i.launch.x)*s,y:i.launch.y+(i.target.y-i.launch.y)*s}}for(const i of t.missiles.filter(s=>s.targetTimestamp<=n)){const s={id:`explosion-${Math.random()}`,missileId:i.id,startTimestamp:i.targetTimestamp,endTimestamp:i.targetTimestamp+st,position:i.target,radius:S};o.explosions.push(s);for(const l of t.cities.filter(u=>x(u.position.x,u.position.y,s.position.x,s.position.y)<=s.radius)){const u=l.populationHistogram[l.populationHistogram.length-1].population,c=Math.max(at,u*rt);l.populationHistogram.push({timestamp:s.startTimestamp,population:Math.max(0,u-c)})}const a=t.missiles.filter(l=>l.id!==s.missileId&&l.launchTimestamp<=s.startTimestamp&&l.targetTimestamp>=s.startTimestamp).filter(l=>x(l.position.x,l.position.y,s.position.x,s.position.y)<=s.radius);for(const l of a)l.targetTimestamp=s.startTimestamp;const p=t.launchSites.filter(l=>x(l.position.x,l.position.y,s.position.x,s.position.y)<=s.radius);for(const l of p)o.launchSites=t.launchSites.filter(u=>u.id!==l.id)}o.explosions=o.explosions.filter(i=>i.endTimestamp>=n),o.missiles=o.missiles.filter(i=>i.targetTimestamp>n);for(const i of t.launchSites){if(i.nextLaunchTarget){if(i.lastLaunchTimestamp&&n-i.lastLaunchTimestamp<P)continue}else continue;const s=x(i.position.x,i.position.y,i.nextLaunchTarget.x,i.nextLaunchTarget.y),a={id:Math.random()+"",stateId:i.stateId,launchSiteId:i.id,launch:i.position,launchTimestamp:n,position:i.position,target:i.nextLaunchTarget,targetTimestamp:n+s/L};o.missiles.push(a),i.lastLaunchTimestamp=n,i.nextLaunchTarget=void 0}return o=ct(o),o=pt(o),o}function mt(t){const[e,n]=d.useState(()=>ot({playerStateName:t,numberOfStates:3})),o=d.useCallback((i,s)=>n(ut(i,s)),[]);return{worldState:e,updateWorldState:o,setWorldState:n}}function ht(t,e){const n=new CustomEvent(t,{bubbles:!0,detail:e});document.dispatchEvent(n)}function ft(t,e){d.useEffect(()=>{const n=o=>{e(o.detail)};return document.addEventListener(t,n,!1),()=>{document.removeEventListener(t,n,!1)}},[t,e])}const B={x:0,y:0,pointingObjects:[]},gt=(t,e)=>e.type==="move"?{x:e.x,y:e.y,pointingObjects:t.pointingObjects}:e.type==="point"&&!t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,e.object]}:e.type==="unpoint"&&t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(n=>n.id!==e.object.id)}:t,X=d.createContext(B),A=d.createContext(()=>{});function xt({children:t}){const[e,n]=d.useReducer(gt,B);return r.jsx(X.Provider,{value:e,children:r.jsx(A.Provider,{value:n,children:t})})}function k(){return d.useContext(X)}function yt(){const t=d.useContext(A);return(e,n)=>t({type:"move",x:e,y:n})}function N(){const t=d.useContext(A);return[e=>t({type:"point",object:e}),e=>t({type:"unpoint",object:e})]}const H={},bt=(t,e)=>e.type==="clear"?H:e.type==="set"?{...t,selectedObject:e.object}:t,z=d.createContext(H),Y=d.createContext(()=>{});function St({children:t}){const[e,n]=d.useReducer(bt,H);return r.jsx(z.Provider,{value:e,children:r.jsx(Y.Provider,{value:n,children:t})})}function Tt(t){var o;const e=d.useContext(Y);return[((o=d.useContext(z).selectedObject)==null?void 0:o.id)===t.id,()=>e({type:"set",object:t})]}function $(){return d.useContext(z).selectedObject}function Ct({worldState:t,setWorldState:e}){const n=$(),o=k();return ft("world-click",()=>{if((n==null?void 0:n.type)!==T.LAUNCH_SITE||o.pointingObjects.length===0)return;const i=o.pointingObjects[0].position;t.cities.some(a=>a.stateId===n.stateId&&x(a.position.x,a.position.y,i.x,i.y)<S)||t.launchSites.some(a=>a.stateId===n.stateId&&x(a.position.x,a.position.y,i.x,i.y)<S)||(n.nextLaunchTarget=i),e({...t})}),null}const vt=Z.memo(({sectors:t})=>{const e=d.useRef(null),[n,o]=N();return d.useEffect(()=>{const i=e.current,s=i==null?void 0:i.getContext("2d");if(!i||!s)return;const a=Math.min(...t.map(f=>f.rect.left)),p=Math.min(...t.map(f=>f.rect.top)),l=Math.max(...t.map(f=>f.rect.right)),u=Math.max(...t.map(f=>f.rect.bottom)),c=l-a,h=u-p;i.width=c,i.height=h,i.style.width=`${c}px`,i.style.height=`${h}px`,s.clearRect(0,0,c,h),t.forEach(f=>{const{fillStyle:C,drawSector:m}=jt(f);s.fillStyle=C,m(s,f.rect,a,p)})},[t]),d.useEffect(()=>{const i=e.current;let s;const a=p=>{const l=i==null?void 0:i.getBoundingClientRect(),u=p.clientX-((l==null?void 0:l.left)||0),c=p.clientY-((l==null?void 0:l.top)||0),h=t.find(f=>u>=f.rect.left&&u<=f.rect.right&&c>=f.rect.top&&c<=f.rect.bottom);h&&(s&&o(s),n(h),s=h)};return i==null||i.addEventListener("mousemove",a),()=>{i==null||i.removeEventListener("mousemove",a)}},[t,n,o]),r.jsx("canvas",{ref:e})});function jt(t){switch(t.type){case"GROUND":return{fillStyle:"rgb(93, 42, 0)",drawSector:(e,n,o,i)=>{e.fillStyle="rgb(93, 42, 0)",e.fillRect(n.left-o,n.top-i,n.right-n.left,n.bottom-n.top)}};case"WATER":return{fillStyle:"rgb(0, 34, 93)",drawSector:(e,n,o,i)=>{const s=e.createLinearGradient(n.left-o,n.top-i,n.right-o,n.bottom-i);s.addColorStop(0,"rgb(0, 34, 93)"),s.addColorStop(1,"rgb(0, 137, 178)"),e.fillStyle=s,e.fillRect(n.left-o,n.top-i,n.right-n.left,n.bottom-n.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(e,n,o,i)=>{e.fillStyle="rgb(0, 34, 93)",e.fillRect(n.left-o,n.top-i,n.right-n.left,n.bottom-n.top)}}}}function It(){return r.jsx(Et,{})}const Et=y.div``;function Lt({city:t}){const[e,n]=N(),o=t.populationHistogram[t.populationHistogram.length-1].population,i=Math.max(...t.populationHistogram.map(a=>a.population)),s=Math.max(5,10*(o/i));return r.jsx(Pt,{onMouseEnter:()=>e(t),onMouseLeave:()=>n(t),style:{"--x":t.position.x,"--y":t.position.y,"--size":s,"--opacity":o>0?1:.3},children:r.jsxs(Ot,{children:[t.name,": ",o.toLocaleString()," population"]})})}const Pt=y.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  opacity: var(--opacity);
  background: rgb(0, 0, 255);
  box-shadow: 0 0 10px 5px rgb(0, 0, 255);

  &:hover > div {
    display: block;
  }
`,Ot=y.div`
  display: none;
  position: absolute;
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 5px;
  border-radius: 3px;
  font-size: 12px;
  white-space: nowrap;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);
  pointer-events: none;
`;function Mt({launchSite:t,worldTimestamp:e,isPlayerControlled:n}){const[o,i]=Tt(t),[s,a]=N(),p=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+P>e,l=p?(e-t.lastLaunchTimestamp)/P:0;return r.jsx(Rt,{onMouseEnter:()=>s(t),onMouseLeave:()=>a(t),onClick:()=>n&&i(),style:{"--x":t.position.x,"--y":t.position.y,"--cooldown-progress":l},"data-selected":o,"data-cooldown":p})}const Rt=y.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 5px;
  height: 10px;
  background: rgb(255, 0, 0);
  overflow: hidden;

  cursor: pointer;

  &[data-selected='true'] {
    box-shadow: 0 0 10px 5px rgb(255, 0, 0);
  }

  &[data-cooldown='true'] {
    background: rgb(255, 165, 0);

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: calc(var(--cooldown-progress) * 100%);
      background: rgb(255, 0, 0);
    }
  }
`;function V(t,e){e===void 0&&(e=!0);var n=d.useRef(null),o=d.useRef(!1),i=d.useRef(t);i.current=t;var s=d.useCallback(function(p){o.current&&(i.current(p),n.current=requestAnimationFrame(s))},[]),a=d.useMemo(function(){return[function(){o.current&&(o.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){o.current||(o.current=!0,n.current=requestAnimationFrame(s))},function(){return o.current}]},[]);return d.useEffect(function(){return e&&a[1](),a[0]},[]),a}function At(t,e,n){if(e.startTimestamp>n||e.endTimestamp<n)return;const o=Math.pow(Math.min(Math.max(0,(n-e.startTimestamp)/(e.endTimestamp-e.startTimestamp)),1),.15);t.fillStyle=`rgb(${255*o}, ${255*(1-o)}, 0)`,t.beginPath(),t.arc(e.position.x,e.position.y,e.radius*o,0,2*Math.PI),t.fill()}function kt(t,e,n){e.launchTimestamp>n||e.targetTimestamp<n||(t.fillStyle="rgb(0, 255, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,1,0,2*Math.PI),t.fill())}function Nt(t,e,n){if(e.launchTimestamp>n||e.targetTimestamp<n)return;const o=Math.min(Math.max(n-5,e.launchTimestamp)-e.launchTimestamp,e.targetTimestamp-e.launchTimestamp),i=e.targetTimestamp-e.launchTimestamp,s=o/i,a=e.launch.x+(e.target.x-e.launch.x)*s,p=e.launch.y+(e.target.y-e.launch.y)*s,l={x:a,y:p},u=e.position,c=t.createLinearGradient(l.x,l.y,u.x,u.y);c.addColorStop(0,"rgba(255, 255, 255, 0)"),c.addColorStop(1,"rgba(255, 255, 255, 0.5)"),t.strokeStyle=c,t.lineWidth=1,t.beginPath(),t.moveTo(l.x,l.y),t.lineTo(u.x,u.y),t.stroke()}function Ht({state:t}){const e=d.useRef(null);return d.useLayoutEffect(()=>{const o=e.current;if(!o)return;const i=Math.min(...t.sectors.map(c=>c.rect.left)),s=Math.min(...t.sectors.map(c=>c.rect.top)),a=Math.max(...t.sectors.map(c=>c.rect.right)),p=Math.max(...t.sectors.map(c=>c.rect.bottom)),l=a-i,u=p-s;o.width=l,o.height=u,o.style.width=`${l}px`,o.style.height=`${u}px`},[t.sectors]),V(()=>{const o=e.current;if(!o)return;const i=o.getContext("2d");i&&(i.clearRect(0,0,o.width,o.height),t.missiles.forEach(s=>{Nt(i,s,t.timestamp)}),t.missiles.filter(s=>s.launchTimestamp<t.timestamp&&s.targetTimestamp>t.timestamp).forEach(s=>{kt(i,s,t.timestamp)}),t.explosions.filter(s=>s.startTimestamp<t.timestamp&&s.endTimestamp>t.timestamp).forEach(s=>{At(i,s,t.timestamp)}))}),r.jsx(zt,{ref:e})}const zt=y.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function wt({state:t}){const e=yt();return r.jsxs(Ut,{onMouseMove:n=>e(n.clientX,n.clientY),onClick:()=>ht("world-click"),children:[r.jsx(vt,{sectors:t.sectors}),t.states.map(n=>r.jsx(It,{},n.id)),t.cities.map(n=>r.jsx(Lt,{city:n},n.id)),t.launchSites.map(n=>{var o;return r.jsx(Mt,{launchSite:n,worldTimestamp:t.timestamp,isPlayerControlled:n.stateId===((o=t.states.find(i=>i.isPlayerControlled))==null?void 0:o.id)},n.id)}),r.jsx(Ht,{state:t})]})}const Ut=y.div`
  display: flex;
  flex-grow: 1;

  background: black;
`;function Gt(){const t=$(),e=k();return(t==null?void 0:t.type)!==T.LAUNCH_SITE?null:r.jsx(Dt,{style:{"--x":e.x,"--y":e.y},children:e.pointingObjects.length>0?"Launch":""})}const Dt=y.div`
  position: absolute;
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px));
  pointer-events: none;
  color: red;
`;function Wt({updateWorldTime:t}){const[e,n]=d.useState(!0),o=d.useRef(null);return V(i=>{if(!o.current){o.current=i;return}const s=i-o.current;o.current=i,!(s<=0)&&e&&t(s/1e3)},!0),r.jsxs(_t,{children:[r.jsx("button",{onClick:()=>t(1),children:"+1 Second"}),r.jsx("button",{onClick:()=>t(10),children:"+10 Seconds"}),r.jsx("button",{onClick:()=>t(60),children:"+60 seconds"}),r.jsx("button",{onClick:()=>n(!e),children:e?"Stop autoplay":"Start autoplay"})]})}const _t=y.div`
  position: absolute;
  right: 0;
  bottom: 0;
  flex-grow: 0;

  border: 1px solid rgb(0, 255, 0);
  padding: 5px 10px;

  text-align: left;
  color: white;
  z-index: 1;
`;function D(t,e){let n=t[0];for(const o of t)o.timestamp<e&&o.timestamp>n.timestamp&&(n=o);return n}function Ft({worldState:t}){const e=k(),n=Object.fromEntries(t.states.map(s=>[s.id,t.cities.filter(a=>a.stateId===s.id).map(a=>[a,D(a.populationHistogram,t.timestamp).population])])),o=t.states.map(s=>[s,n[s.id].reduce((a,[,p])=>a+p,0)]),i=t.cities.reduce((s,a)=>s+D(a.populationHistogram,t.timestamp).population,0);return r.jsx(Bt,{children:r.jsxs("ul",{children:[r.jsxs("li",{children:["Time: ",t.timestamp.toFixed(2)]}),r.jsxs("li",{children:["Pointing object: ",e.pointingObjects.length]}),r.jsxs("li",{children:["World population: ",i]}),r.jsx("li",{children:"Population: "}),r.jsx("ul",{children:o.map(([s,a])=>r.jsxs("li",{children:[s.name,": ",a,r.jsx("ul",{children:n[s.id].map(([p,l])=>r.jsxs("li",{children:[p.name,": ",l]},p.id))})]},s.id))})]})})}const Bt=y.div`
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
`;function Xt({worldState:t,setWorldState:e}){const n=t.states.find(i=>i.isPlayerControlled);if(!n)return null;const o=(i,s)=>{const a=t.states.map(p=>p.id===n.id?{...p,strategies:{...p.strategies,[i]:s}}:p);e({...t,states:a})};return r.jsx(Yt,{children:t.states.map(i=>i.id!==n.id?r.jsxs("div",{children:[r.jsx("span",{children:i.name}),r.jsx("select",{value:n.strategies[i.id],onChange:s=>o(i.id,s.target.value),children:Object.values(g).map(s=>r.jsx("option",{value:s,children:s},s))})]},i.id):null)})}const Yt=y.div`
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
`;function $t({worldState:t,setWorldState:e,updateWorldState:n}){return r.jsx(St,{children:r.jsx(xt,{children:r.jsxs(Vt,{children:[r.jsx(Ct,{worldState:t,setWorldState:e}),r.jsx(Wt,{updateWorldTime:o=>n(t,o)}),r.jsx(Xt,{worldState:t,setWorldState:e}),r.jsx(wt,{state:t}),r.jsx(Gt,{}),r.jsx(Ft,{worldState:t})]})})})}const Vt=y.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  display: flex;
  flex-direction: column;

  background: black;
`;function qt({worldState:t,onGameOver:e}){return d.useEffect(()=>{var l;const n=Object.fromEntries(t.states.map(u=>[u.id,t.cities.filter(c=>c.stateId===u.id).reduce((c,h)=>c+h.populationHistogram[h.populationHistogram.length-1].population,0)])),o=Object.values(n).filter(u=>u>0).length,i=t.launchSites.length===0,s=t.timestamp,a=t.states.filter(u=>n[u.id]>0&&Object.entries(u.strategies).filter(([c,h])=>n[c]>0&&h===g.HOSTILE).length>0),p=t.launchSites.some(u=>u.lastLaunchTimestamp&&s-u.lastLaunchTimestamp<w);if(o<=1||i||!a.length&&!p&&s>w){const u=o===1?(l=t.states.find(c=>n[c.id]>0))==null?void 0:l.id:void 0;e({populations:Object.fromEntries(t.states.map(c=>[c.id,n[c.id]])),winner:u,stateNames:Object.fromEntries(t.states.map(c=>[c.id,c.name])),playerStateId:t.states.find(c=>c.isPlayerControlled).id})}},[t,e]),null}const Zt=({setGameState:t})=>{const{state:{result:e}}=_(),n=()=>{t(I,{stateName:e.stateNames[e.playerStateId]})};return r.jsxs("div",{children:[r.jsx("h2",{children:"Game Over"}),e.winner?r.jsxs("p",{children:["The winner is ",e.stateNames[e.winner]," with ",e.populations[e.winner]," population alive."]}):r.jsx("p",{children:"It's a draw!"}),r.jsx("button",{onClick:n,children:"Play Again"}),r.jsx("br",{}),r.jsx("br",{}),r.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})},M={Component:Zt,path:"played"},Jt=({setGameState:t})=>{const{state:{stateName:e}}=_(),{worldState:n,setWorldState:o,updateWorldState:i}=mt(e);return r.jsxs(r.Fragment,{children:[r.jsx($t,{worldState:n,updateWorldState:i,setWorldState:o}),r.jsx(qt,{worldState:n,onGameOver:s=>t(M,{result:s})})]})},I={Component:Jt,path:"playing"},Kt=({setGameState:t})=>{const[e,n]=d.useState(F(1)[0]),o=()=>{t(I,{stateName:e})};return r.jsxs(r.Fragment,{children:[r.jsx("div",{children:r.jsx("input",{type:"text",placeholder:"Name your state",value:e,onChange:i=>n(i.currentTarget.value)})}),r.jsx("button",{onClick:o,disabled:!e,children:"Play"})]})},R={Component:Kt,path:"play"},Qt=y.div`
  height: 100vh;
  width: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;

  h3 {
    font-size: 3rem;
  }
`,te=({setGameState:t})=>r.jsxs(Qt,{children:[r.jsx("h3",{children:"Nukes game"}),r.jsx("br",{}),r.jsx("button",{onClick:()=>t(R),children:"Play"})]}),W={Component:te,path:""},ee=J`
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
`,ne=[{path:W.path,element:r.jsx(j,{state:W})},{path:R.path,element:r.jsx(j,{state:R})},{path:I.path,element:r.jsx(j,{state:I})},{path:M.path,element:r.jsx(j,{state:M})}];function ie(){var n;const[t]=K(),e=t.get("path")??"";return r.jsx(r.Fragment,{children:(n=ne.find(o=>o.path===e))==null?void 0:n.element})}function j({state:t}){const e=Q();return r.jsxs(r.Fragment,{children:[r.jsx(ee,{}),r.jsx(t.Component,{setGameState:(n,o)=>e({search:"path="+n.path},{state:o})})]})}export{ie as NukesApp,ne as routes};
