import{r as m,j as u,R as $,d as I,m as Ot,u as jt,f as ie,a as ne,b as oe}from"./index-BLdweLA-.js";function re(e){return[...ae].sort(()=>Math.random()-Math.random()).slice(0,e)}const ae=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function Dt(e){return[...ce].sort(()=>Math.random()-Math.random()).slice(0,e)}const ce=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];var y=(e=>(e.NEUTRAL="NEUTRAL",e.FRIENDLY="FRIENDLY",e.HOSTILE="HOSTILE",e))(y||{}),Rt=(e=>(e.LAUNCH_SITE="LAUNCH_SITE",e))(Rt||{}),st=(e=>(e.WATER="WATER",e.GROUND="GROUND",e))(st||{});const it=10,k=20,le=5,ue=k/le,he=.5,de=500,B=.05,nt=5,tt=60;function fe({playerStateName:e,numberOfStates:t=3}){const i=Math.max(200,Math.ceil(Math.sqrt(t)*10)),n=i,o=Dt(t*2).filter(_=>_!==e),r=5,c=re(t*r*2),l=[],h=[],a=[],p=[],d=k*3;for(let _=0;_<n;_++)for(let T=0;T<i;T++)p.push({id:`sector-${p.length+1}`,position:{x:T*16,y:_*16},rect:{left:T*16,top:_*16,right:(T+1)*16,bottom:(_+1)*16},type:st.WATER});const x=()=>({x:Math.floor(Math.random()*(i-10)+5)*16,y:Math.floor(Math.random()*(n-10)+5)*16}),f=(_,T)=>{const C=Math.floor(i/(Math.sqrt(t)*2))*16;return T.every(j=>Math.abs(_.x-j.x)>C||Math.abs(_.y-j.y)>C)},g=(_,T)=>{const C=Math.floor(_.x/16),j=Math.floor(_.y/16);for(let M=j-T;M<=j+T;M++)for(let R=C-T;R<=C+T;R++)if(R>=0&&R<i&&M>=0&&M<n){const H=M*i+R;p[H].type=st.GROUND}},b=(_,T)=>T.every(C=>Math.sqrt(Math.pow(_.x-C.position.x,2)+Math.pow(_.y-C.position.y,2))>=d),O=[];for(let _=0;_<t;_++){const T=`state-${_+1}`,C=_===0?e:o.pop(),j={id:T,name:C,isPlayerControlled:_===0,strategies:{}};l.forEach(D=>{j.strategies[D.id]=y.NEUTRAL,D.strategies[T]=y.NEUTRAL}),l.push(j);let M,R=10;do if(M=x(),R--<=0)break;while(!f(M,O));O.push(M),g(M,8);const H=[];for(let D=0;D<r;D++){const J=`city-${h.length+1}`;let A,Q=10;do if(A={x:M.x+(Math.random()-.5)*10*16,y:M.y+(Math.random()-.5)*10*16},Q--<=0)break;while(!b(A,H));H.push({position:A}),h.push({id:J,stateId:T,name:c.pop(),position:A,populationHistogram:[{timestamp:0,population:Math.floor(Math.random()*3e3)+1e3}]}),g(A,2)}for(let D=0;D<4;D++){const J=`launch-site-${a.length+1}`;let A,Q=10;do if(A={x:M.x+(Math.random()-.5)*8*16,y:M.y+(Math.random()-.5)*8*16},Q--<=0)break;while(!b(A,H));H.push({position:A}),a.push({type:Rt.LAUNCH_SITE,id:J,stateId:T,position:A}),g(A,1)}}return{timestamp:0,states:l,cities:h,launchSites:a,sectors:p,missiles:[],explosions:[]}}function w(e,t,s,i){return Math.sqrt(Math.pow(s-e,2)+Math.pow(i-t,2))}function pe(e){var t,s;for(const i of e.states){const n=e.cities.filter(a=>a.stateId===i.id),o=e.launchSites.filter(a=>a.stateId===i.id),r=e.cities.filter(a=>i.strategies[a.stateId]===y.HOSTILE&&a.stateId!==i.id&&a.populationHistogram.slice(-1)[0].population>0),c=e.missiles.filter(a=>i.strategies[a.stateId]!==y.FRIENDLY&&a.stateId!==i.id),l=e.launchSites.filter(a=>i.strategies[a.stateId]===y.HOSTILE&&a.stateId!==i.id),h=c.filter(a=>n.some(p=>ot(a.target,p.position))||o.some(p=>ot(a.target,p.position))).filter(a=>(e.timestamp-a.launchTimestamp)/(a.targetTimestamp-a.launchTimestamp)>.5);for(const a of e.launchSites.filter(p=>p.stateId===i.id)){if(a.nextLaunchTarget)continue;if(r.length===0&&l.length===0&&c.length===0)break;const p=yt(h.map(f=>({...f,interceptionPoint:me(f,a.position)})),a.position),d=e.missiles.filter(f=>f.stateId===i.id),x=xt(p,d).filter(([,f])=>f<o.length);if(x.length>0)a.nextLaunchTarget=x[0][0].interceptionPoint??void 0;else{const f=xt(yt([...l,...r],a.position),d);a.nextLaunchTarget=((s=(t=f==null?void 0:f[0])==null?void 0:t[0])==null?void 0:s.position)??void 0}}}return e}function me(e,t){const s=w(e.position.x,e.position.y,t.x,t.y);if(s<k)return null;const i=w(e.target.x,e.target.y,e.launch.x,e.launch.y),n=(e.target.x-e.launch.x)/i,o=(e.target.y-e.launch.y)/i,r={x:e.target.x-n*k*2,y:e.target.y-o*k*2},c=s/it,l=w(t.x,t.y,r.x,r.y)/it;return c<l||c>l+10?null:r}function ot(e,t){const s=k;return w(e.x,e.y,t.x,t.y)<=s}function yt(e,t){return e.sort((s,i)=>w(s.position.x,s.position.y,t.x,t.y)-w(i.position.x,i.position.y,t.x,t.y))}function xt(e,t){const s=new Map;for(const i of e)s.set(i,t.filter(n=>ot(n.target,i.position)).length);return Array.from(s).sort((i,n)=>i[1]-n[1])}function ge(e){var t,s;for(const i of e.missiles.filter(n=>n.launchTimestamp===e.timestamp)){const n=e.states.find(r=>r.id===i.stateId),o=((t=e.cities.find(r=>w(r.position.x,r.position.y,i.target.x,i.target.y)<=k))==null?void 0:t.stateId)||((s=e.launchSites.find(r=>w(r.position.x,r.position.y,i.target.x,i.target.y)<=k))==null?void 0:s.stateId);if(n&&o&&n.id!==o){n.strategies[o]!==y.HOSTILE&&(n.strategies[o]=y.HOSTILE);const r=e.states.find(c=>c.id===o);r&&r.strategies[n.id]!==y.HOSTILE&&(r.strategies[n.id]=y.HOSTILE,e.states.forEach(c=>{c.id!==r.id&&c.strategies[r.id]===y.FRIENDLY&&r.strategies[c.id]===y.FRIENDLY&&(c.strategies[n.id]=y.HOSTILE,n.strategies[c.id]=y.HOSTILE)}))}}for(const i of e.states.filter(n=>!n.isPlayerControlled))ye(i,e);return e}function ye(e,t){const s=t.states.filter(r=>r.id!==e.id);e.strategies={...e.strategies},s.forEach(r=>{r.strategies[e.id]===y.FRIENDLY&&e.strategies[r.id]===y.NEUTRAL&&(e.strategies[r.id]=y.FRIENDLY)});const i=s.filter(r=>e.strategies[r.id]===y.NEUTRAL);if(i.length>0){const r=i[Math.floor(Math.random()*i.length)];e.strategies[r.id]=y.FRIENDLY}const n=s.filter(r=>e.strategies[r.id]===y.FRIENDLY&&r.strategies[e.id]===y.FRIENDLY);n.forEach(r=>{s.forEach(c=>{c.strategies[r.id]===y.HOSTILE&&e.strategies[c.id]!==y.HOSTILE&&(e.strategies[c.id]=y.HOSTILE)})}),s.filter(r=>e.strategies[r.id]===y.HOSTILE).forEach(r=>{if(xe(r,e,n,t)){const c=t.launchSites.filter(l=>l.stateId===e.id&&!l.lastLaunchTimestamp);if(c.length>0){const l=c[Math.floor(Math.random()*c.length)],h=[...t.cities.filter(a=>a.stateId===r.id),...t.launchSites.filter(a=>a.stateId===r.id)];if(h.length>0){const a=h[Math.floor(Math.random()*h.length)];l.nextLaunchTarget=a.position}}}})}function xe(e,t,s,i){const n=i.launchSites.filter(c=>c.stateId===e.id),o=i.launchSites.filter(c=>c.stateId===t.id||s.some(l=>l.id===c.stateId));return n.length<o.length?!0:i.missiles.some(c=>i.cities.some(l=>l.stateId===e.id&&w(l.position.x,l.position.y,c.target.x,c.target.y)<=k)||i.launchSites.some(l=>l.stateId===e.id&&w(l.position.x,l.position.y,c.target.x,c.target.y)<=k))}function ve(e,t){for(;t>0;){const s=be(e,t>B?B:t);t=t>B?t-B:0,e=s}return e}function be(e,t){const s=e.timestamp+t;let i={timestamp:s,states:e.states,cities:e.cities,launchSites:e.launchSites,missiles:e.missiles,explosions:e.explosions,sectors:e.sectors};for(const n of i.missiles){const o=(s-n.launchTimestamp)/(n.targetTimestamp-n.launchTimestamp);n.position={x:n.launch.x+(n.target.x-n.launch.x)*o,y:n.launch.y+(n.target.y-n.launch.y)*o}}for(const n of e.missiles.filter(o=>o.targetTimestamp<=s)){const o={id:`explosion-${Math.random()}`,missileId:n.id,startTimestamp:n.targetTimestamp,endTimestamp:n.targetTimestamp+ue,position:n.target,radius:k};i.explosions.push(o);for(const l of e.cities.filter(h=>w(h.position.x,h.position.y,o.position.x,o.position.y)<=o.radius)){const h=l.populationHistogram[l.populationHistogram.length-1].population,a=Math.max(de,h*he);l.populationHistogram.push({timestamp:o.startTimestamp,population:Math.max(0,h-a)})}const r=e.missiles.filter(l=>l.id!==o.missileId&&l.launchTimestamp<=o.startTimestamp&&l.targetTimestamp>=o.startTimestamp).filter(l=>w(l.position.x,l.position.y,o.position.x,o.position.y)<=o.radius);for(const l of r)l.targetTimestamp=o.startTimestamp;const c=e.launchSites.filter(l=>w(l.position.x,l.position.y,o.position.x,o.position.y)<=o.radius);for(const l of c)i.launchSites=e.launchSites.filter(h=>h.id!==l.id)}i.explosions=i.explosions.filter(n=>n.endTimestamp>=s),i.missiles=i.missiles.filter(n=>n.targetTimestamp>s);for(const n of e.launchSites){if(n.nextLaunchTarget){if(n.lastLaunchTimestamp&&s-n.lastLaunchTimestamp<nt)continue}else continue;const o=w(n.position.x,n.position.y,n.nextLaunchTarget.x,n.nextLaunchTarget.y),r={id:Math.random()+"",stateId:n.stateId,launchSiteId:n.id,launch:n.position,launchTimestamp:s,position:n.position,target:n.nextLaunchTarget,targetTimestamp:s+o/it};i.missiles.push(r),n.lastLaunchTimestamp=s,n.nextLaunchTarget=void 0}return i=pe(i),i=ge(i),i}function _e(e){const[t,s]=m.useState(()=>fe({playerStateName:e,numberOfStates:6})),i=m.useCallback((n,o)=>s(ve(n,o)),[]);return{worldState:t,updateWorldState:i,setWorldState:s}}const Nt={x:0,y:0,pointingObjects:[]},Ee=(e,t)=>t.type==="move"?{x:t.x,y:t.y,pointingObjects:e.pointingObjects}:t.type==="point"&&!e.pointingObjects.some(s=>s.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:[...e.pointingObjects,t.object]}:t.type==="unpoint"&&e.pointingObjects.some(s=>s.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:e.pointingObjects.filter(s=>s.id!==t.object.id)}:e,Ht=m.createContext(Nt),ut=m.createContext(()=>{});function Te({children:e}){const[t,s]=m.useReducer(Ee,Nt);return u.jsx(Ht.Provider,{value:t,children:u.jsx(ut.Provider,{value:s,children:e})})}function Ie(){return m.useContext(Ht)}function Se(){const e=m.useContext(ut);return(t,s)=>e({type:"move",x:t,y:s})}function ht(){const e=m.useContext(ut);return[t=>e({type:"point",object:t}),t=>e({type:"unpoint",object:t})]}const dt={},Ce=(e,t)=>t.type==="clear"?dt:t.type==="set"?{...e,selectedObject:t.object}:e,Gt=m.createContext(dt),Yt=m.createContext(()=>{});function Me({children:e}){const[t,s]=m.useReducer(Ce,dt);return u.jsx(Gt.Provider,{value:t,children:u.jsx(Yt.Provider,{value:s,children:e})})}function we(e){var i;const t=m.useContext(Yt);return[((i=m.useContext(Gt).selectedObject)==null?void 0:i.id)===e.id,()=>t({type:"set",object:e})]}function ft(e,t){const s=new CustomEvent(e,{bubbles:!0,detail:t});document.dispatchEvent(s)}function Ut(e,t){m.useEffect(()=>{const s=i=>{t(i.detail)};return document.addEventListener(e,s,!1),()=>{document.removeEventListener(e,s,!1)}},[e,t])}const Le=$.memo(({sectors:e})=>{const t=m.useRef(null),[s,i]=ht();return m.useEffect(()=>{const n=t.current,o=n==null?void 0:n.getContext("2d");if(!n||!o)return;const r=Math.min(...e.map(d=>d.rect.left)),c=Math.min(...e.map(d=>d.rect.top)),l=Math.max(...e.map(d=>d.rect.right)),h=Math.max(...e.map(d=>d.rect.bottom)),a=l-r,p=h-c;n.width=a,n.height=p,n.style.width=`${a}px`,n.style.height=`${p}px`,o.clearRect(0,0,a,p),e.forEach(d=>{const{fillStyle:x,drawSector:f}=Ae(d);o.fillStyle=x,f(o,d.rect,r,c)})},[e]),m.useEffect(()=>{const n=t.current;let o;const r=c=>{const l=n==null?void 0:n.getBoundingClientRect(),h=c.clientX-((l==null?void 0:l.left)||0),a=c.clientY-((l==null?void 0:l.top)||0),p=e.find(d=>h>=d.rect.left&&h<=d.rect.right&&a>=d.rect.top&&a<=d.rect.bottom);p&&(o&&i(o),s(p),o=p)};return n==null||n.addEventListener("mousemove",r),()=>{n==null||n.removeEventListener("mousemove",r)}},[e,s,i]),u.jsx("canvas",{ref:t})});function Ae(e){switch(e.type){case"GROUND":return{fillStyle:"rgb(93, 42, 0)",drawSector:(t,s,i,n)=>{t.fillStyle="rgb(93, 42, 0)",t.fillRect(s.left-i,s.top-n,s.right-s.left,s.bottom-s.top)}};case"WATER":return{fillStyle:"rgb(0, 34, 93)",drawSector:(t,s,i,n)=>{const o=t.createLinearGradient(s.left-i,s.top-n,s.right-i,s.bottom-n);o.addColorStop(0,"rgb(0, 34, 93)"),o.addColorStop(1,"rgb(0, 137, 178)"),t.fillStyle=o,t.fillRect(s.left-i,s.top-n,s.right-s.left,s.bottom-s.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(t,s,i,n)=>{t.fillStyle="rgb(0, 34, 93)",t.fillRect(s.left-i,s.top-n,s.right-s.left,s.bottom-s.top)}}}}function Pe(){return u.jsx(ke,{})}const ke=I.div``;function Oe({city:e}){const[t,s]=ht(),i=e.populationHistogram[e.populationHistogram.length-1].population,n=Math.max(...e.populationHistogram.map(r=>r.population)),o=Math.max(5,10*(i/n));return u.jsx(je,{onMouseEnter:()=>t(e),onMouseLeave:()=>s(e),style:{"--x":e.position.x,"--y":e.position.y,"--size":o,"--opacity":i>0?1:.3},children:u.jsxs(De,{children:[e.name,": ",i.toLocaleString()," population"]})})}const je=I.div`
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
`,De=I.div`
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
`;function Re({launchSite:e,worldTimestamp:t,isPlayerControlled:s}){const[i,n]=we(e),[o,r]=ht(),c=e.lastLaunchTimestamp&&e.lastLaunchTimestamp+nt>t,l=c?(t-e.lastLaunchTimestamp)/nt:0;return u.jsx(Ne,{onMouseEnter:()=>o(e),onMouseLeave:()=>r(e),onClick:()=>s&&n(),style:{"--x":e.position.x,"--y":e.position.y,"--cooldown-progress":l},"data-selected":i,"data-cooldown":c})}const Ne=I.div`
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
`;function zt(e,t){t===void 0&&(t=!0);var s=m.useRef(null),i=m.useRef(!1),n=m.useRef(e);n.current=e;var o=m.useCallback(function(c){i.current&&(n.current(c),s.current=requestAnimationFrame(o))},[]),r=m.useMemo(function(){return[function(){i.current&&(i.current=!1,s.current&&cancelAnimationFrame(s.current))},function(){i.current||(i.current=!0,s.current=requestAnimationFrame(o))},function(){return i.current}]},[]);return m.useEffect(function(){return t&&r[1](),r[0]},[]),r}function He(e,t,s){if(t.startTimestamp>s||t.endTimestamp<s)return;const i=Math.pow(Math.min(Math.max(0,(s-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);e.fillStyle=`rgb(${255*i}, ${255*(1-i)}, 0)`,e.beginPath(),e.arc(t.position.x,t.position.y,t.radius*i,0,2*Math.PI),e.fill()}function Ge(e,t,s){t.launchTimestamp>s||t.targetTimestamp<s||(e.fillStyle="rgb(0, 255, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,1,0,2*Math.PI),e.fill())}function Ye(e,t,s){if(t.launchTimestamp>s||t.targetTimestamp<s)return;const i=Math.min(Math.max(s-5,t.launchTimestamp)-t.launchTimestamp,t.targetTimestamp-t.launchTimestamp),n=t.targetTimestamp-t.launchTimestamp,o=i/n,r=t.launch.x+(t.target.x-t.launch.x)*o,c=t.launch.y+(t.target.y-t.launch.y)*o,l={x:r,y:c},h=t.position,a=e.createLinearGradient(l.x,l.y,h.x,h.y);a.addColorStop(0,"rgba(255, 255, 255, 0)"),a.addColorStop(1,"rgba(255, 255, 255, 0.5)"),e.strokeStyle=a,e.lineWidth=1,e.beginPath(),e.moveTo(l.x,l.y),e.lineTo(h.x,h.y),e.stroke()}function Ue({state:e}){const t=m.useRef(null);return m.useLayoutEffect(()=>{const i=t.current;if(!i)return;const n=Math.min(...e.sectors.map(a=>a.rect.left)),o=Math.min(...e.sectors.map(a=>a.rect.top)),r=Math.max(...e.sectors.map(a=>a.rect.right)),c=Math.max(...e.sectors.map(a=>a.rect.bottom)),l=r-n,h=c-o;i.width=l,i.height=h,i.style.width=`${l}px`,i.style.height=`${h}px`},[e.sectors]),zt(()=>{const i=t.current;if(!i)return;const n=i.getContext("2d");n&&(n.clearRect(0,0,i.width,i.height),e.missiles.forEach(o=>{Ye(n,o,e.timestamp)}),e.missiles.filter(o=>o.launchTimestamp<e.timestamp&&o.targetTimestamp>e.timestamp).forEach(o=>{Ge(n,o,e.timestamp)}),e.explosions.filter(o=>o.startTimestamp<e.timestamp&&o.endTimestamp>e.timestamp).forEach(o=>{He(n,o,e.timestamp)}))}),u.jsx(ze,{ref:t})}const ze=I.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function Fe({state:e}){const t=Se();return u.jsxs(We,{onMouseMove:s=>t(s.clientX,s.clientY),onClick:()=>ft("world-click"),children:[u.jsx(Le,{sectors:e.sectors}),e.states.map(s=>u.jsx(Pe,{},s.id)),e.cities.map(s=>u.jsx(Oe,{city:s},s.id)),e.launchSites.map(s=>{var i;return u.jsx(Re,{launchSite:s,worldTimestamp:e.timestamp,isPlayerControlled:s.stateId===((i=e.states.find(n=>n.isPlayerControlled))==null?void 0:i.id)},s.id)}),u.jsx(Ue,{state:e})]})}const We=I.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function vt(e,t){let s=e[0];for(const i of e)i.timestamp<t&&i.timestamp>s.timestamp&&(s=i);return s}function Be({worldState:e}){const t=Ie(),s=Object.fromEntries(e.states.map(o=>[o.id,e.cities.filter(r=>r.stateId===o.id).map(r=>[r,vt(r.populationHistogram,e.timestamp).population])])),i=e.states.map(o=>[o,s[o.id].reduce((r,[,c])=>r+c,0)]),n=e.cities.reduce((o,r)=>o+vt(r.populationHistogram,e.timestamp).population,0);return u.jsx(Ve,{children:u.jsxs("ul",{children:[u.jsxs("li",{children:["Time: ",e.timestamp.toFixed(2)]}),u.jsxs("li",{children:["Pointing object: ",t.pointingObjects.length]}),u.jsxs("li",{children:["World population: ",n]}),u.jsx("li",{children:"Population: "}),u.jsx("ul",{children:i.map(([o,r])=>u.jsxs("li",{children:[o.name,": ",r]},o.id))})]})})}const Ve=I.div`
  position: fixed;
  left: 0;
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
`;function $e({worldState:e,setWorldState:t}){const s=e.states.find(n=>n.isPlayerControlled);if(!s)return null;const i=(n,o)=>{const r=e.states.map(c=>c.id===s.id?{...c,strategies:{...c.strategies,[n]:o}}:c);t({...e,states:r})};return u.jsx(Ke,{children:e.states.map(n=>n.id!==s.id?u.jsxs("div",{children:[u.jsx("span",{children:n.name}),u.jsx("select",{value:s.strategies[n.id],onChange:o=>i(n.id,o.target.value),children:Object.values(y).map(o=>u.jsx("option",{value:o,children:o},o))})]},n.id):null)})}const Ke=I.div`
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 1;

  max-width: 25%;
  min-width: 200px;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgb(0, 255, 0);
`;function Xe({updateWorldTime:e}){const[t,s]=m.useState(!1),i=m.useRef(null);return zt(n=>{if(!i.current){i.current=n;return}const o=n-i.current;i.current=n,!(o<=0)&&t&&e(o/1e3)},!0),u.jsxs(qe,{children:[u.jsx("button",{onClick:()=>e(1),children:"+1 Second"}),u.jsx("button",{onClick:()=>e(10),children:"+10 Seconds"}),u.jsx("button",{onClick:()=>e(60),children:"+60 seconds"}),u.jsx("button",{onClick:()=>s(!t),children:t?"Stop autoplay":"Start autoplay"})]})}const qe=I.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  flex-grow: 0;

  border: 1px solid rgb(0, 255, 0);
  padding: 5px 10px;

  text-align: left;
  color: white;
  z-index: 1;
`;function Ze(e,t,s){return Math.max(t,Math.min(e,s))}const v={toVector(e,t){return e===void 0&&(e=t),Array.isArray(e)?e:[e,e]},add(e,t){return[e[0]+t[0],e[1]+t[1]]},sub(e,t){return[e[0]-t[0],e[1]-t[1]]},addTo(e,t){e[0]+=t[0],e[1]+=t[1]},subTo(e,t){e[0]-=t[0],e[1]-=t[1]}};function bt(e,t,s){return t===0||Math.abs(t)===1/0?Math.pow(e,s*5):e*t*s/(t+s*e)}function _t(e,t,s,i=.15){return i===0?Ze(e,t,s):e<t?-bt(t-e,s-t,i)+t:e>s?+bt(e-s,s-t,i)+s:e}function Je(e,[t,s],[i,n]){const[[o,r],[c,l]]=e;return[_t(t,o,r,i),_t(s,c,l,n)]}function Qe(e,t){if(typeof e!="object"||e===null)return e;var s=e[Symbol.toPrimitive];if(s!==void 0){var i=s.call(e,t||"default");if(typeof i!="object")return i;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}function ts(e){var t=Qe(e,"string");return typeof t=="symbol"?t:String(t)}function S(e,t,s){return t=ts(t),t in e?Object.defineProperty(e,t,{value:s,enumerable:!0,configurable:!0,writable:!0}):e[t]=s,e}function Et(e,t){var s=Object.keys(e);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);t&&(i=i.filter(function(n){return Object.getOwnPropertyDescriptor(e,n).enumerable})),s.push.apply(s,i)}return s}function E(e){for(var t=1;t<arguments.length;t++){var s=arguments[t]!=null?arguments[t]:{};t%2?Et(Object(s),!0).forEach(function(i){S(e,i,s[i])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(s)):Et(Object(s)).forEach(function(i){Object.defineProperty(e,i,Object.getOwnPropertyDescriptor(s,i))})}return e}const Ft={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function Tt(e){return e?e[0].toUpperCase()+e.slice(1):""}const es=["enter","leave"];function ss(e=!1,t){return e&&!es.includes(t)}function is(e,t="",s=!1){const i=Ft[e],n=i&&i[t]||t;return"on"+Tt(e)+Tt(n)+(ss(s,n)?"Capture":"")}const ns=["gotpointercapture","lostpointercapture"];function os(e){let t=e.substring(2).toLowerCase();const s=!!~t.indexOf("passive");s&&(t=t.replace("passive",""));const i=ns.includes(t)?"capturecapture":"capture",n=!!~t.indexOf(i);return n&&(t=t.replace("capture","")),{device:t,capture:n,passive:s}}function rs(e,t=""){const s=Ft[e],i=s&&s[t]||t;return e+i}function Z(e){return"touches"in e}function Wt(e){return Z(e)?"touch":"pointerType"in e?e.pointerType:"mouse"}function as(e){return Array.from(e.touches).filter(t=>{var s,i;return t.target===e.currentTarget||((s=e.currentTarget)===null||s===void 0||(i=s.contains)===null||i===void 0?void 0:i.call(s,t.target))})}function cs(e){return e.type==="touchend"||e.type==="touchcancel"?e.changedTouches:e.targetTouches}function Bt(e){return Z(e)?cs(e)[0]:e}function rt(e,t){try{const s=t.clientX-e.clientX,i=t.clientY-e.clientY,n=(t.clientX+e.clientX)/2,o=(t.clientY+e.clientY)/2,r=Math.hypot(s,i);return{angle:-(Math.atan2(s,i)*180)/Math.PI,distance:r,origin:[n,o]}}catch{}return null}function ls(e){return as(e).map(t=>t.identifier)}function It(e,t){const[s,i]=Array.from(e.touches).filter(n=>t.includes(n.identifier));return rt(s,i)}function et(e){const t=Bt(e);return Z(e)?t.identifier:t.pointerId}function U(e){const t=Bt(e);return[t.clientX,t.clientY]}const St=40,Ct=800;function Vt(e){let{deltaX:t,deltaY:s,deltaMode:i}=e;return i===1?(t*=St,s*=St):i===2&&(t*=Ct,s*=Ct),[t,s]}function us(e){var t,s;const{scrollX:i,scrollY:n,scrollLeft:o,scrollTop:r}=e.currentTarget;return[(t=i??o)!==null&&t!==void 0?t:0,(s=n??r)!==null&&s!==void 0?s:0]}function hs(e){const t={};if("buttons"in e&&(t.buttons=e.buttons),"shiftKey"in e){const{shiftKey:s,altKey:i,metaKey:n,ctrlKey:o}=e;Object.assign(t,{shiftKey:s,altKey:i,metaKey:n,ctrlKey:o})}return t}function X(e,...t){return typeof e=="function"?e(...t):e}function ds(){}function fs(...e){return e.length===0?ds:e.length===1?e[0]:function(){let t;for(const s of e)t=s.apply(this,arguments)||t;return t}}function Mt(e,t){return Object.assign({},t,e||{})}const ps=32;class $t{constructor(t,s,i){this.ctrl=t,this.args=s,this.key=i,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(t){this.ctrl.state[this.key]=t}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:t,shared:s,ingKey:i,args:n}=this;s[i]=t._active=t.active=t._blocked=t._force=!1,t._step=[!1,!1],t.intentional=!1,t._movement=[0,0],t._distance=[0,0],t._direction=[0,0],t._delta=[0,0],t._bounds=[[-1/0,1/0],[-1/0,1/0]],t.args=n,t.axis=void 0,t.memo=void 0,t.elapsedTime=t.timeDelta=0,t.direction=[0,0],t.distance=[0,0],t.overflow=[0,0],t._movementBound=[!1,!1],t.velocity=[0,0],t.movement=[0,0],t.delta=[0,0],t.timeStamp=0}start(t){const s=this.state,i=this.config;s._active||(this.reset(),this.computeInitial(),s._active=!0,s.target=t.target,s.currentTarget=t.currentTarget,s.lastOffset=i.from?X(i.from,s):s.offset,s.offset=s.lastOffset,s.startTime=s.timeStamp=t.timeStamp)}computeValues(t){const s=this.state;s._values=t,s.values=this.config.transform(t)}computeInitial(){const t=this.state;t._initial=t._values,t.initial=t.values}compute(t){const{state:s,config:i,shared:n}=this;s.args=this.args;let o=0;if(t&&(s.event=t,i.preventDefault&&t.cancelable&&s.event.preventDefault(),s.type=t.type,n.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,n.locked=!!document.pointerLockElement,Object.assign(n,hs(t)),n.down=n.pressed=n.buttons%2===1||n.touches>0,o=t.timeStamp-s.timeStamp,s.timeStamp=t.timeStamp,s.elapsedTime=s.timeStamp-s.startTime),s._active){const C=s._delta.map(Math.abs);v.addTo(s._distance,C)}this.axisIntent&&this.axisIntent(t);const[r,c]=s._movement,[l,h]=i.threshold,{_step:a,values:p}=s;if(i.hasCustomTransform?(a[0]===!1&&(a[0]=Math.abs(r)>=l&&p[0]),a[1]===!1&&(a[1]=Math.abs(c)>=h&&p[1])):(a[0]===!1&&(a[0]=Math.abs(r)>=l&&Math.sign(r)*l),a[1]===!1&&(a[1]=Math.abs(c)>=h&&Math.sign(c)*h)),s.intentional=a[0]!==!1||a[1]!==!1,!s.intentional)return;const d=[0,0];if(i.hasCustomTransform){const[C,j]=p;d[0]=a[0]!==!1?C-a[0]:0,d[1]=a[1]!==!1?j-a[1]:0}else d[0]=a[0]!==!1?r-a[0]:0,d[1]=a[1]!==!1?c-a[1]:0;this.restrictToAxis&&!s._blocked&&this.restrictToAxis(d);const x=s.offset,f=s._active&&!s._blocked||s.active;f&&(s.first=s._active&&!s.active,s.last=!s._active&&s.active,s.active=n[this.ingKey]=s._active,t&&(s.first&&("bounds"in i&&(s._bounds=X(i.bounds,s)),this.setup&&this.setup()),s.movement=d,this.computeOffset()));const[g,b]=s.offset,[[O,W],[gt,_]]=s._bounds;s.overflow=[g<O?-1:g>W?1:0,b<gt?-1:b>_?1:0],s._movementBound[0]=s.overflow[0]?s._movementBound[0]===!1?s._movement[0]:s._movementBound[0]:!1,s._movementBound[1]=s.overflow[1]?s._movementBound[1]===!1?s._movement[1]:s._movementBound[1]:!1;const T=s._active?i.rubberband||[0,0]:[0,0];if(s.offset=Je(s._bounds,s.offset,T),s.delta=v.sub(s.offset,x),this.computeMovement(),f&&(!s.last||o>ps)){s.delta=v.sub(s.offset,x);const C=s.delta.map(Math.abs);v.addTo(s.distance,C),s.direction=s.delta.map(Math.sign),s._direction=s._delta.map(Math.sign),!s.first&&o>0&&(s.velocity=[C[0]/o,C[1]/o],s.timeDelta=o)}}emit(){const t=this.state,s=this.shared,i=this.config;if(t._active||this.clean(),(t._blocked||!t.intentional)&&!t._force&&!i.triggerAllEvents)return;const n=this.handler(E(E(E({},s),t),{},{[this.aliasKey]:t.values}));n!==void 0&&(t.memo=n)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function ms([e,t],s){const i=Math.abs(e),n=Math.abs(t);if(i>n&&i>s)return"x";if(n>i&&n>s)return"y"}class z extends $t{constructor(...t){super(...t),S(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=v.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=v.sub(this.state.offset,this.state.lastOffset)}axisIntent(t){const s=this.state,i=this.config;if(!s.axis&&t){const n=typeof i.axisThreshold=="object"?i.axisThreshold[Wt(t)]:i.axisThreshold;s.axis=ms(s._movement,n)}s._blocked=(i.lockDirection||!!i.axis)&&!s.axis||!!i.axis&&i.axis!==s.axis}restrictToAxis(t){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":t[1]=0;break;case"y":t[0]=0;break}}}const gs=e=>e,wt=.15,Kt={enabled(e=!0){return e},eventOptions(e,t,s){return E(E({},s.shared.eventOptions),e)},preventDefault(e=!1){return e},triggerAllEvents(e=!1){return e},rubberband(e=0){switch(e){case!0:return[wt,wt];case!1:return[0,0];default:return v.toVector(e)}},from(e){if(typeof e=="function")return e;if(e!=null)return v.toVector(e)},transform(e,t,s){const i=e||s.shared.transform;return this.hasCustomTransform=!!i,i||gs},threshold(e){return v.toVector(e,0)}},ys=0,N=E(E({},Kt),{},{axis(e,t,{axis:s}){if(this.lockDirection=s==="lock",!this.lockDirection)return s},axisThreshold(e=ys){return e},bounds(e={}){if(typeof e=="function")return o=>N.bounds(e(o));if("current"in e)return()=>e.current;if(typeof HTMLElement=="function"&&e instanceof HTMLElement)return e;const{left:t=-1/0,right:s=1/0,top:i=-1/0,bottom:n=1/0}=e;return[[t,s],[i,n]]}}),Lt={ArrowRight:(e,t=1)=>[e*t,0],ArrowLeft:(e,t=1)=>[-1*e*t,0],ArrowUp:(e,t=1)=>[0,-1*e*t],ArrowDown:(e,t=1)=>[0,e*t]};class xs extends z{constructor(...t){super(...t),S(this,"ingKey","dragging")}reset(){super.reset();const t=this.state;t._pointerId=void 0,t._pointerActive=!1,t._keyboardActive=!1,t._preventScroll=!1,t._delayed=!1,t.swipe=[0,0],t.tap=!1,t.canceled=!1,t.cancel=this.cancel.bind(this)}setup(){const t=this.state;if(t._bounds instanceof HTMLElement){const s=t._bounds.getBoundingClientRect(),i=t.currentTarget.getBoundingClientRect(),n={left:s.left-i.left+t.offset[0],right:s.right-i.right+t.offset[0],top:s.top-i.top+t.offset[1],bottom:s.bottom-i.bottom+t.offset[1]};t._bounds=N.bounds(n)}}cancel(){const t=this.state;t.canceled||(t.canceled=!0,t._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(t){const s=this.config,i=this.state;if(t.buttons!=null&&(Array.isArray(s.pointerButtons)?!s.pointerButtons.includes(t.buttons):s.pointerButtons!==-1&&s.pointerButtons!==t.buttons))return;const n=this.ctrl.setEventIds(t);s.pointerCapture&&t.target.setPointerCapture(t.pointerId),!(n&&n.size>1&&i._pointerActive)&&(this.start(t),this.setupPointer(t),i._pointerId=et(t),i._pointerActive=!0,this.computeValues(U(t)),this.computeInitial(),s.preventScrollAxis&&Wt(t)!=="mouse"?(i._active=!1,this.setupScrollPrevention(t)):s.delay>0?(this.setupDelayTrigger(t),s.triggerAllEvents&&(this.compute(t),this.emit())):this.startPointerDrag(t))}startPointerDrag(t){const s=this.state;s._active=!0,s._preventScroll=!0,s._delayed=!1,this.compute(t),this.emit()}pointerMove(t){const s=this.state,i=this.config;if(!s._pointerActive)return;const n=et(t);if(s._pointerId!==void 0&&n!==s._pointerId)return;const o=U(t);if(document.pointerLockElement===t.target?s._delta=[t.movementX,t.movementY]:(s._delta=v.sub(o,s._values),this.computeValues(o)),v.addTo(s._movement,s._delta),this.compute(t),s._delayed&&s.intentional){this.timeoutStore.remove("dragDelay"),s.active=!1,this.startPointerDrag(t);return}if(i.preventScrollAxis&&!s._preventScroll)if(s.axis)if(s.axis===i.preventScrollAxis||i.preventScrollAxis==="xy"){s._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(t);return}else return;this.emit()}pointerUp(t){this.ctrl.setEventIds(t);try{this.config.pointerCapture&&t.target.hasPointerCapture(t.pointerId)&&t.target.releasePointerCapture(t.pointerId)}catch{}const s=this.state,i=this.config;if(!s._active||!s._pointerActive)return;const n=et(t);if(s._pointerId!==void 0&&n!==s._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(t);const[o,r]=s._distance;if(s.tap=o<=i.tapsThreshold&&r<=i.tapsThreshold,s.tap&&i.filterTaps)s._force=!0;else{const[c,l]=s._delta,[h,a]=s._movement,[p,d]=i.swipe.velocity,[x,f]=i.swipe.distance,g=i.swipe.duration;if(s.elapsedTime<g){const b=Math.abs(c/s.timeDelta),O=Math.abs(l/s.timeDelta);b>p&&Math.abs(h)>x&&(s.swipe[0]=Math.sign(c)),O>d&&Math.abs(a)>f&&(s.swipe[1]=Math.sign(l))}}this.emit()}pointerClick(t){!this.state.tap&&t.detail>0&&(t.preventDefault(),t.stopPropagation())}setupPointer(t){const s=this.config,i=s.device;s.pointerLock&&t.currentTarget.requestPointerLock(),s.pointerCapture||(this.eventStore.add(this.sharedConfig.window,i,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,i,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,i,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(t){this.state._preventScroll&&t.cancelable&&t.preventDefault()}setupScrollPrevention(t){this.state._preventScroll=!1,vs(t);const s=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",s),this.eventStore.add(this.sharedConfig.window,"touch","cancel",s),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,t)}setupDelayTrigger(t){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(t)},this.config.delay)}keyDown(t){const s=Lt[t.key];if(s){const i=this.state,n=t.shiftKey?10:t.altKey?.1:1;this.start(t),i._delta=s(this.config.keyboardDisplacement,n),i._keyboardActive=!0,v.addTo(i._movement,i._delta),this.compute(t),this.emit()}}keyUp(t){t.key in Lt&&(this.state._keyboardActive=!1,this.setActive(),this.compute(t),this.emit())}bind(t){const s=this.config.device;t(s,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(t(s,"change",this.pointerMove.bind(this)),t(s,"end",this.pointerUp.bind(this)),t(s,"cancel",this.pointerUp.bind(this)),t("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(t("key","down",this.keyDown.bind(this)),t("key","up",this.keyUp.bind(this))),this.config.filterTaps&&t("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function vs(e){"persist"in e&&typeof e.persist=="function"&&e.persist()}const F=typeof window<"u"&&window.document&&window.document.createElement;function Xt(){return F&&"ontouchstart"in window}function bs(){return Xt()||F&&window.navigator.maxTouchPoints>1}function _s(){return F&&"onpointerdown"in window}function Es(){return F&&"exitPointerLock"in window.document}function Ts(){try{return"constructor"in GestureEvent}catch{return!1}}const L={isBrowser:F,gesture:Ts(),touch:Xt(),touchscreen:bs(),pointer:_s(),pointerLock:Es()},Is=250,Ss=180,Cs=.5,Ms=50,ws=250,Ls=10,At={mouse:0,touch:0,pen:8},As=E(E({},N),{},{device(e,t,{pointer:{touch:s=!1,lock:i=!1,mouse:n=!1}={}}){return this.pointerLock=i&&L.pointerLock,L.touch&&s?"touch":this.pointerLock?"mouse":L.pointer&&!n?"pointer":L.touch?"touch":"mouse"},preventScrollAxis(e,t,{preventScroll:s}){if(this.preventScrollDelay=typeof s=="number"?s:s||s===void 0&&e?Is:void 0,!(!L.touchscreen||s===!1))return e||(s!==void 0?"y":void 0)},pointerCapture(e,t,{pointer:{capture:s=!0,buttons:i=1,keys:n=!0}={}}){return this.pointerButtons=i,this.keys=n,!this.pointerLock&&this.device==="pointer"&&s},threshold(e,t,{filterTaps:s=!1,tapsThreshold:i=3,axis:n=void 0}){const o=v.toVector(e,s?i:n?1:0);return this.filterTaps=s,this.tapsThreshold=i,o},swipe({velocity:e=Cs,distance:t=Ms,duration:s=ws}={}){return{velocity:this.transform(v.toVector(e)),distance:this.transform(v.toVector(t)),duration:s}},delay(e=0){switch(e){case!0:return Ss;case!1:return 0;default:return e}},axisThreshold(e){return e?E(E({},At),e):At},keyboardDisplacement(e=Ls){return e}});function qt(e){const[t,s]=e.overflow,[i,n]=e._delta,[o,r]=e._direction;(t<0&&i>0&&o<0||t>0&&i<0&&o>0)&&(e._movement[0]=e._movementBound[0]),(s<0&&n>0&&r<0||s>0&&n<0&&r>0)&&(e._movement[1]=e._movementBound[1])}const Ps=30,ks=100;class Os extends $t{constructor(...t){super(...t),S(this,"ingKey","pinching"),S(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const t=this.state;t._touchIds=[],t.canceled=!1,t.cancel=this.cancel.bind(this),t.turns=0}computeOffset(){const{type:t,movement:s,lastOffset:i}=this.state;t==="wheel"?this.state.offset=v.add(s,i):this.state.offset=[(1+s[0])*i[0],s[1]+i[1]]}computeMovement(){const{offset:t,lastOffset:s}=this.state;this.state.movement=[t[0]/s[0],t[1]-s[1]]}axisIntent(){const t=this.state,[s,i]=t._movement;if(!t.axis){const n=Math.abs(s)*Ps-Math.abs(i);n<0?t.axis="angle":n>0&&(t.axis="scale")}}restrictToAxis(t){this.config.lockDirection&&(this.state.axis==="scale"?t[1]=0:this.state.axis==="angle"&&(t[0]=0))}cancel(){const t=this.state;t.canceled||setTimeout(()=>{t.canceled=!0,t._active=!1,this.compute(),this.emit()},0)}touchStart(t){this.ctrl.setEventIds(t);const s=this.state,i=this.ctrl.touchIds;if(s._active&&s._touchIds.every(o=>i.has(o))||i.size<2)return;this.start(t),s._touchIds=Array.from(i).slice(0,2);const n=It(t,s._touchIds);n&&this.pinchStart(t,n)}pointerStart(t){if(t.buttons!=null&&t.buttons%2!==1)return;this.ctrl.setEventIds(t),t.target.setPointerCapture(t.pointerId);const s=this.state,i=s._pointerEvents,n=this.ctrl.pointerIds;if(s._active&&Array.from(i.keys()).every(r=>n.has(r))||(i.size<2&&i.set(t.pointerId,t),s._pointerEvents.size<2))return;this.start(t);const o=rt(...Array.from(i.values()));o&&this.pinchStart(t,o)}pinchStart(t,s){const i=this.state;i.origin=s.origin,this.computeValues([s.distance,s.angle]),this.computeInitial(),this.compute(t),this.emit()}touchMove(t){if(!this.state._active)return;const s=It(t,this.state._touchIds);s&&this.pinchMove(t,s)}pointerMove(t){const s=this.state._pointerEvents;if(s.has(t.pointerId)&&s.set(t.pointerId,t),!this.state._active)return;const i=rt(...Array.from(s.values()));i&&this.pinchMove(t,i)}pinchMove(t,s){const i=this.state,n=i._values[1],o=s.angle-n;let r=0;Math.abs(o)>270&&(r+=Math.sign(o)),this.computeValues([s.distance,s.angle-360*r]),i.origin=s.origin,i.turns=r,i._movement=[i._values[0]/i._initial[0]-1,i._values[1]-i._initial[1]],this.compute(t),this.emit()}touchEnd(t){this.ctrl.setEventIds(t),this.state._active&&this.state._touchIds.some(s=>!this.ctrl.touchIds.has(s))&&(this.state._active=!1,this.compute(t),this.emit())}pointerEnd(t){const s=this.state;this.ctrl.setEventIds(t);try{t.target.releasePointerCapture(t.pointerId)}catch{}s._pointerEvents.has(t.pointerId)&&s._pointerEvents.delete(t.pointerId),s._active&&s._pointerEvents.size<2&&(s._active=!1,this.compute(t),this.emit())}gestureStart(t){t.cancelable&&t.preventDefault();const s=this.state;s._active||(this.start(t),this.computeValues([t.scale,t.rotation]),s.origin=[t.clientX,t.clientY],this.compute(t),this.emit())}gestureMove(t){if(t.cancelable&&t.preventDefault(),!this.state._active)return;const s=this.state;this.computeValues([t.scale,t.rotation]),s.origin=[t.clientX,t.clientY];const i=s._movement;s._movement=[t.scale-1,t.rotation],s._delta=v.sub(s._movement,i),this.compute(t),this.emit()}gestureEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}wheel(t){const s=this.config.modifierKey;s&&(Array.isArray(s)?!s.find(i=>t[i]):!t[s])||(this.state._active?this.wheelChange(t):this.wheelStart(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(t){this.start(t),this.wheelChange(t)}wheelChange(t){"uv"in t||t.cancelable&&t.preventDefault();const i=this.state;i._delta=[-Vt(t)[1]/ks*i.offset[0],0],v.addTo(i._movement,i._delta),qt(i),this.state.origin=[t.clientX,t.clientY],this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){const s=this.config.device;s&&(t(s,"start",this[s+"Start"].bind(this)),t(s,"change",this[s+"Move"].bind(this)),t(s,"end",this[s+"End"].bind(this)),t(s,"cancel",this[s+"End"].bind(this)),t("lostPointerCapture","",this[s+"End"].bind(this))),this.config.pinchOnWheel&&t("wheel","",this.wheel.bind(this),{passive:!1})}}const js=E(E({},Kt),{},{device(e,t,{shared:s,pointer:{touch:i=!1}={}}){if(s.target&&!L.touch&&L.gesture)return"gesture";if(L.touch&&i)return"touch";if(L.touchscreen){if(L.pointer)return"pointer";if(L.touch)return"touch"}},bounds(e,t,{scaleBounds:s={},angleBounds:i={}}){const n=r=>{const c=Mt(X(s,r),{min:-1/0,max:1/0});return[c.min,c.max]},o=r=>{const c=Mt(X(i,r),{min:-1/0,max:1/0});return[c.min,c.max]};return typeof s!="function"&&typeof i!="function"?[n(),o()]:r=>[n(r),o(r)]},threshold(e,t,s){return this.lockDirection=s.axis==="lock",v.toVector(e,this.lockDirection?[.1,3]:0)},modifierKey(e){return e===void 0?"ctrlKey":e},pinchOnWheel(e=!0){return e}});class Ds extends z{constructor(...t){super(...t),S(this,"ingKey","moving")}move(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.state._active?this.moveChange(t):this.moveStart(t),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(t){this.start(t),this.computeValues(U(t)),this.compute(t),this.computeInitial(),this.emit()}moveChange(t){if(!this.state._active)return;const s=U(t),i=this.state;i._delta=v.sub(s,i._values),v.addTo(i._movement,i._delta),this.computeValues(s),this.compute(t),this.emit()}moveEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}bind(t){t("pointer","change",this.move.bind(this)),t("pointer","leave",this.moveEnd.bind(this))}}const Rs=E(E({},N),{},{mouseOnly:(e=!0)=>e});class Ns extends z{constructor(...t){super(...t),S(this,"ingKey","scrolling")}scroll(t){this.state._active||this.start(t),this.scrollChange(t),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(t){t.cancelable&&t.preventDefault();const s=this.state,i=us(t);s._delta=v.sub(i,s._values),v.addTo(s._movement,s._delta),this.computeValues(i),this.compute(t),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("scroll","",this.scroll.bind(this))}}const Hs=N;class Gs extends z{constructor(...t){super(...t),S(this,"ingKey","wheeling")}wheel(t){this.state._active||this.start(t),this.wheelChange(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(t){const s=this.state;s._delta=Vt(t),v.addTo(s._movement,s._delta),qt(s),this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("wheel","",this.wheel.bind(this))}}const Ys=N;class Us extends z{constructor(...t){super(...t),S(this,"ingKey","hovering")}enter(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.start(t),this.computeValues(U(t)),this.compute(t),this.emit())}leave(t){if(this.config.mouseOnly&&t.pointerType!=="mouse")return;const s=this.state;if(!s._active)return;s._active=!1;const i=U(t);s._movement=s._delta=v.sub(i,s._values),this.computeValues(i),this.compute(t),s.delta=s.movement,this.emit()}bind(t){t("pointer","enter",this.enter.bind(this)),t("pointer","leave",this.leave.bind(this))}}const zs=E(E({},N),{},{mouseOnly:(e=!0)=>e}),pt=new Map,at=new Map;function Fs(e){pt.set(e.key,e.engine),at.set(e.key,e.resolver)}const Ws={key:"drag",engine:xs,resolver:As},Bs={key:"hover",engine:Us,resolver:zs},Vs={key:"move",engine:Ds,resolver:Rs},$s={key:"pinch",engine:Os,resolver:js},Ks={key:"scroll",engine:Ns,resolver:Hs},Xs={key:"wheel",engine:Gs,resolver:Ys};function qs(e,t){if(e==null)return{};var s={},i=Object.keys(e),n,o;for(o=0;o<i.length;o++)n=i[o],!(t.indexOf(n)>=0)&&(s[n]=e[n]);return s}function Zs(e,t){if(e==null)return{};var s=qs(e,t),i,n;if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);for(n=0;n<o.length;n++)i=o[n],!(t.indexOf(i)>=0)&&Object.prototype.propertyIsEnumerable.call(e,i)&&(s[i]=e[i])}return s}const Js={target(e){if(e)return()=>"current"in e?e.current:e},enabled(e=!0){return e},window(e=L.isBrowser?window:void 0){return e},eventOptions({passive:e=!0,capture:t=!1}={}){return{passive:e,capture:t}},transform(e){return e}},Qs=["target","eventOptions","window","enabled","transform"];function K(e={},t){const s={};for(const[i,n]of Object.entries(t))switch(typeof n){case"function":s[i]=n.call(s,e[i],i,e);break;case"object":s[i]=K(e[i],n);break;case"boolean":n&&(s[i]=e[i]);break}return s}function ti(e,t,s={}){const i=e,{target:n,eventOptions:o,window:r,enabled:c,transform:l}=i,h=Zs(i,Qs);if(s.shared=K({target:n,eventOptions:o,window:r,enabled:c,transform:l},Js),t){const a=at.get(t);s[t]=K(E({shared:s.shared},h),a)}else for(const a in h){const p=at.get(a);p&&(s[a]=K(E({shared:s.shared},h[a]),p))}return s}class Zt{constructor(t,s){S(this,"_listeners",new Set),this._ctrl=t,this._gestureKey=s}add(t,s,i,n,o){const r=this._listeners,c=rs(s,i),l=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},h=E(E({},l),o);t.addEventListener(c,n,h);const a=()=>{t.removeEventListener(c,n,h),r.delete(a)};return r.add(a),a}clean(){this._listeners.forEach(t=>t()),this._listeners.clear()}}class ei{constructor(){S(this,"_timeouts",new Map)}add(t,s,i=140,...n){this.remove(t),this._timeouts.set(t,window.setTimeout(s,i,...n))}remove(t){const s=this._timeouts.get(t);s&&window.clearTimeout(s)}clean(){this._timeouts.forEach(t=>void window.clearTimeout(t)),this._timeouts.clear()}}class si{constructor(t){S(this,"gestures",new Set),S(this,"_targetEventStore",new Zt(this)),S(this,"gestureEventStores",{}),S(this,"gestureTimeoutStores",{}),S(this,"handlers",{}),S(this,"config",{}),S(this,"pointerIds",new Set),S(this,"touchIds",new Set),S(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),ii(this,t)}setEventIds(t){if(Z(t))return this.touchIds=new Set(ls(t)),this.touchIds;if("pointerId"in t)return t.type==="pointerup"||t.type==="pointercancel"?this.pointerIds.delete(t.pointerId):t.type==="pointerdown"&&this.pointerIds.add(t.pointerId),this.pointerIds}applyHandlers(t,s){this.handlers=t,this.nativeHandlers=s}applyConfig(t,s){this.config=ti(t,s,this.config)}clean(){this._targetEventStore.clean();for(const t of this.gestures)this.gestureEventStores[t].clean(),this.gestureTimeoutStores[t].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...t){const s=this.config.shared,i={};let n;if(!(s.target&&(n=s.target(),!n))){if(s.enabled){for(const r of this.gestures){const c=this.config[r],l=Pt(i,c.eventOptions,!!n);if(c.enabled){const h=pt.get(r);new h(this,t,r).bind(l)}}const o=Pt(i,s.eventOptions,!!n);for(const r in this.nativeHandlers)o(r,"",c=>this.nativeHandlers[r](E(E({},this.state.shared),{},{event:c,args:t})),void 0,!0)}for(const o in i)i[o]=fs(...i[o]);if(!n)return i;for(const o in i){const{device:r,capture:c,passive:l}=os(o);this._targetEventStore.add(n,r,"",i[o],{capture:c,passive:l})}}}}function G(e,t){e.gestures.add(t),e.gestureEventStores[t]=new Zt(e,t),e.gestureTimeoutStores[t]=new ei}function ii(e,t){t.drag&&G(e,"drag"),t.wheel&&G(e,"wheel"),t.scroll&&G(e,"scroll"),t.move&&G(e,"move"),t.pinch&&G(e,"pinch"),t.hover&&G(e,"hover")}const Pt=(e,t,s)=>(i,n,o,r={},c=!1)=>{var l,h;const a=(l=r.capture)!==null&&l!==void 0?l:t.capture,p=(h=r.passive)!==null&&h!==void 0?h:t.passive;let d=c?i:is(i,n,a);s&&p&&(d+="Passive"),e[d]=e[d]||[],e[d].push(o)},ni=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function oi(e){const t={},s={},i=new Set;for(let n in e)ni.test(n)?(i.add(RegExp.lastMatch),s[n]=e[n]):t[n]=e[n];return[s,t,i]}function Y(e,t,s,i,n,o){if(!e.has(s)||!pt.has(i))return;const r=s+"Start",c=s+"End",l=h=>{let a;return h.first&&r in t&&t[r](h),s in t&&(a=t[s](h)),h.last&&c in t&&t[c](h),a};n[i]=l,o[i]=o[i]||{}}function ri(e,t){const[s,i,n]=oi(e),o={};return Y(n,s,"onDrag","drag",o,t),Y(n,s,"onWheel","wheel",o,t),Y(n,s,"onScroll","scroll",o,t),Y(n,s,"onPinch","pinch",o,t),Y(n,s,"onMove","move",o,t),Y(n,s,"onHover","hover",o,t),{handlers:o,config:t,nativeHandlers:i}}function ai(e,t={},s,i){const n=$.useMemo(()=>new si(e),[]);if(n.applyHandlers(e,i),n.applyConfig(t,s),$.useEffect(n.effect.bind(n)),$.useEffect(()=>n.clean.bind(n),[]),t.target===void 0)return n.bind.bind(n)}function ci(e){return e.forEach(Fs),function(s,i){const{handlers:n,nativeHandlers:o,config:r}=ri(s,i||{});return ai(n,r,void 0,o)}}function li(e,t){return ci([Ws,$s,Ks,Xs,Vs,Bs])(e,t||{})}function ui({children:e}){const t=m.useRef(null),[s,i]=m.useState(1),[n,o]=m.useState({x:0,y:0}),[r,c]=m.useState(!1);return li({onPinch({delta:l,pinching:h}){c(h),i(Math.max(s+l[0],.1))},onWheel({event:l,delta:[h,a],wheeling:p}){l.preventDefault(),c(p),o({x:n.x-h/s,y:n.y-a/s})}},{target:t,eventOptions:{passive:!1}}),u.jsx(hi,{children:u.jsx(di,{ref:t,children:u.jsx(fi,{style:{"--zoom":s,"--translate-x":n.x,"--translate-y":n.y},"data-is-interacting":r,children:e})})})}const hi=I.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,di=I.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,fi=I.div`
  transform-origin: top center;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
  }
`;function pi({worldState:e,setWorldState:t,updateWorldState:s}){return u.jsx(Me,{children:u.jsxs(Te,{children:[u.jsx(ui,{children:u.jsx(Fe,{state:e})}),u.jsx(Xe,{updateWorldTime:i=>s(e,i)}),u.jsx($e,{worldState:e,setWorldState:t}),u.jsx(Be,{worldState:e})]})})}const Jt="fullScreenMessage",Qt="fullScreenMessageAction";function P(e,t,s,i="",n,o){ft(Jt,{message:e,startTimestamp:t,endTimestamp:s,messageId:i,actions:n,prompt:o})}function te(e,t){ft(Qt,{messageId:e,actionId:t})}function ee(e){Ut(Jt,t=>{e(t)})}function mt(e){Ut(Qt,t=>{e(t)})}function mi({worldState:e}){var h;const[t,s]=m.useState([]),[i,n]=m.useState(null);ee(a=>{s(p=>a.messageId&&p.find(d=>d.messageId===a.messageId)?[...p.map(d=>d.messageId===a.messageId?a:d)]:[a,...p])});const o=t.sort((a,p)=>a.actions&&!p.actions?-1:!a.actions&&p.actions?1:a.startTimestamp-p.startTimestamp);if(mt(a=>{s(p=>p.filter(d=>d.messageId!==a.messageId))}),m.useEffect(()=>{const a=o.find(p=>p.startTimestamp<=e.timestamp&&p.endTimestamp>e.timestamp);n(a||null)},[o,e.timestamp]),!i)return null;const c=((a,p)=>p<a.startTimestamp?"pre":p<a.startTimestamp+.5?"pre-in":p>a.endTimestamp-.5?"post-in":p>a.endTimestamp?"post":"active")(i,e.timestamp),l=a=>Array.isArray(a)?a.map((p,d)=>u.jsx("div",{children:p},d)):a;return u.jsxs(xi,{"data-message-state":c,"data-action":(((h=i.actions)==null?void 0:h.length)??0)>0,children:[u.jsx(vi,{children:l(i.message)}),i.prompt&&i.actions&&u.jsx(bi,{children:i.actions.map((a,p)=>u.jsx(_i,{onClick:()=>te(i.messageId,a.id),children:a.text},p))})]})}const gi=Ot`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`,yi=Ot`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: scale(0.9);
  }
`,xi=I.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  text-shadow: 0px 0px 10px black;
  &:not([data-action='true']) {
    pointer-events: none;
  }
  z-index: 1;

  &[data-message-state='pre'] {
    display: none;
  }

  &[data-message-state='pre-in'] {
    display: flex;
    animation: ${gi} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${yi} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,vi=I.div`
  font-size: 4rem;
  color: white;
  text-align: center;
  max-width: 80%;
  white-space: pre-line;
`,bi=I.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,_i=I.button`
  font-size: 2rem;
  padding: 1rem 2rem;
  margin: 0 1rem;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid white;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: rgba(255, 255, 255, 0.3);
  }

  &:active {
    background-color: rgba(255, 255, 255, 0.4);
  }
`;function Ei({worldState:e,onGameOver:t}){const[s,i]=m.useState(null),[n,o]=m.useState(!1);return m.useEffect(()=>{var x;if(n)return;const r=Object.fromEntries(e.states.map(f=>[f.id,e.cities.filter(g=>g.stateId===f.id).reduce((g,b)=>g+b.populationHistogram[b.populationHistogram.length-1].population,0)])),c=Object.values(r).filter(f=>f>0).length,l=e.launchSites.length===0,h=e.timestamp,a=e.states.filter(f=>r[f.id]>0&&Object.entries(f.strategies).filter(([g,b])=>r[g]>0&&b===y.HOSTILE).length>0),p=e.launchSites.some(f=>f.lastLaunchTimestamp&&h-f.lastLaunchTimestamp<tt),d=tt-h;if(!a.length&&!p&&d>0&&d<=10&&(s?P(`Game will end in ${Math.ceil(d)} seconds if no action is taken!`,s,s+10,"gameOverCountdown"):i(h)),c<=1||l||!a.length&&!p&&h>tt){const f=c===1?(x=e.states.find(g=>r[g.id]>0))==null?void 0:x.id:void 0;o(!0),P(["Game Over!","Results will be shown shortly..."],h,h+5,"gameOverCountdown"),setTimeout(()=>{t({populations:Object.fromEntries(e.states.map(g=>[g.id,r[g.id]])),winner:f,stateNames:Object.fromEntries(e.states.map(g=>[g.id,g.name])),playerStateId:e.states.find(g=>g.isPlayerControlled).id})},5e3)}},[e,t,s,n]),null}const Ti=({setGameState:e})=>{const{state:{result:t}}=jt(),s=()=>{e(q,{stateName:t.stateNames[t.playerStateId]})};return u.jsxs("div",{children:[u.jsx("h2",{children:"Game Over"}),t.winner?u.jsxs("p",{children:["The winner is ",t.stateNames[t.winner]," with ",t.populations[t.winner]," population alive."]}):u.jsx("p",{children:"It's a draw!"}),u.jsx("button",{onClick:s,children:"Play Again"}),u.jsx("br",{}),u.jsx("br",{}),u.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})},ct={Component:Ti,path:"played"},se="ALLIANCEPROPOSAL";function Ii(e,t,s,i=!1){const n=`${se}_${e.id}_${t.id}`,o=i?`${e.name} has become friendly towards you. Do you want to form an alliance?`:`${e.name} proposes an alliance with ${t.name}. Do you accept?`,r=s.timestamp,c=r+10;P(o,r,c,n,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function Si({worldState:e,setWorldState:t}){return mt(s=>{if(s.messageId.startsWith(se)){const[,i,n]=s.messageId.split("_"),o=e.states.find(c=>c.id===i),r=e.states.find(c=>c.id===n);if(!o||!(r!=null&&r.isPlayerControlled))return;if(s.actionId==="accept"){const c=e.states.map(l=>l.id===i||l.id===n?{...l,strategies:{...l.strategies,[i]:y.FRIENDLY,[n]:y.FRIENDLY}}:l);t({...e,states:c}),P(`Alliance formed between ${o.name} and ${r.name}!`,e.timestamp,e.timestamp+5)}else s.actionId==="reject"&&P(`${r.name} has rejected the alliance proposal from ${o.name}.`,e.timestamp,e.timestamp+5)}}),null}function Ci({worldState:e}){const t=e.states.find(x=>x.isPlayerControlled),[s,i]=m.useState(!1),[n,o]=m.useState({}),[r,c]=m.useState([]),[l,h]=m.useState([]),[a,p]=m.useState(!1),d=Math.round(e.timestamp*10)/10;return m.useEffect(()=>{!s&&e.timestamp>0&&(i(!0),P("The game has started!",e.timestamp,e.timestamp+3))},[d]),m.useEffect(()=>{if(t){const x=Object.fromEntries(e.states.map(f=>[f.id,f.strategies]));for(const f of e.states)for(const g of e.states.filter(b=>b.id!==f.id))t&&g.id===t.id&&f.strategies[g.id]===y.FRIENDLY&&g.strategies[f.id]!==y.FRIENDLY&&n[f.id][g.id]!==y.FRIENDLY&&Ii(f,t,e,!0),g.strategies[f.id]===y.FRIENDLY&&f.strategies[g.id]===y.FRIENDLY&&(n[g.id][f.id]!==y.FRIENDLY||n[f.id][g.id]!==y.FRIENDLY)&&P(`${g.name} has formed alliance with ${f.isPlayerControlled?"you":f.name}!`,d,d+3),f.strategies[g.id]===y.HOSTILE&&n[f.id][g.id]!==y.HOSTILE&&P(`${f.isPlayerControlled?"You have":f.name} declared war on ${g.name}!`,d,d+3);o(x)}},[d]),m.useEffect(()=>{t&&e.cities.filter(x=>x.stateId===t.id).forEach(x=>{const f=r.find(W=>W.id===x.id);if(!f)return;const g=x.populationHistogram[x.populationHistogram.length-1].population,O=(f?f.populationHistogram[f.populationHistogram.length-1].population:g)-g;O>0&&P([`Your city ${x.name} has been hit!`,`${O} casualties reported.`],d,d+3)}),c(e.cities.map(x=>({...x,populationHistogram:[...x.populationHistogram]})))},[d]),m.useEffect(()=>{if(t){const x=e.launchSites.filter(f=>f.stateId===t.id);l.length>0&&l.filter(g=>!x.some(b=>b.id===g.id)).forEach(()=>{P("One of your launch sites has been destroyed!",d,d+3)}),h(x)}},[d]),m.useEffect(()=>{if(t&&!a){const x=e.cities.filter(b=>b.stateId===t.id),f=e.launchSites.filter(b=>b.stateId===t.id);!x.some(b=>b.populationHistogram[b.populationHistogram.length-1].population>0)&&f.length===0&&(P(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],d,d+5),p(!0))}},[d]),null}function Mi(){const[e,t]=m.useState([]);ee(i=>{t(n=>i.messageId&&n.find(o=>o.messageId===i.messageId)?[...n.map(o=>o.messageId===i.messageId?i:o)]:[i,...n])}),mt(i=>{t(n=>n.filter(o=>o.messageId!==i.messageId))});const s=i=>Array.isArray(i)?i.map(n=>u.jsx("div",{children:n})):i;return u.jsx(wi,{children:e.map((i,n)=>u.jsxs(Li,{children:[u.jsx("div",{children:s(i.message)}),i.prompt&&i.actions&&u.jsx(Ai,{children:i.actions.map((o,r)=>u.jsx(Pi,{onClick:()=>te(i.messageId,o.id),children:o.text},r))})]},n))})}const wi=I.div`
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 300px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  overflow-y: auto;
  padding: 10px;
  font-size: 14px;
  display: flex;
  flex-direction: column-reverse;
`,Li=I.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
`,Ai=I.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,Pi=I.button`
  font-size: 12px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`,ki=({setGameState:e})=>{const{state:{stateName:t}}=jt(),{worldState:s,setWorldState:i,updateWorldState:n}=_e(t);return u.jsxs(u.Fragment,{children:[u.jsx(pi,{worldState:s,updateWorldState:n,setWorldState:i}),u.jsx(mi,{worldState:s}),u.jsx(Mi,{}),u.jsx(Ei,{worldState:s,onGameOver:o=>e(ct,{result:o})}),u.jsx(Ci,{worldState:s}),u.jsx(Si,{worldState:s,setWorldState:i})]})},q={Component:ki,path:"playing"},Oi=({setGameState:e})=>{const[t,s]=m.useState(Dt(1)[0]),i=()=>{e(q,{stateName:t})};return u.jsxs(u.Fragment,{children:[u.jsx("div",{children:u.jsx("input",{type:"text",placeholder:"Name your state",value:t,onChange:n=>s(n.currentTarget.value)})}),u.jsx("button",{onClick:i,disabled:!t,children:"Play"})]})},lt={Component:Oi,path:"play"},ji=I.div`
  height: 100vh;
  width: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;

  h3 {
    font-size: 3rem;
  }
`,Di=({setGameState:e})=>u.jsxs(ji,{children:[u.jsx("h3",{children:"Nukes game"}),u.jsx("br",{}),u.jsx("button",{onClick:()=>e(lt),children:"Play"})]}),kt={Component:Di,path:""},Ri=ie`
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
`,Ni=[{path:kt.path,element:u.jsx(V,{state:kt})},{path:lt.path,element:u.jsx(V,{state:lt})},{path:q.path,element:u.jsx(V,{state:q})},{path:ct.path,element:u.jsx(V,{state:ct})}];function Gi(){var s;const[e]=ne(),t=e.get("path")??"";return u.jsx(u.Fragment,{children:(s=Ni.find(i=>i.path===t))==null?void 0:s.element})}function V({state:e}){const t=oe();return u.jsxs(u.Fragment,{children:[u.jsx(Ri,{}),u.jsx(e.Component,{setGameState:(s,i)=>t({search:"path="+s.path},{state:i})})]})}export{Gi as NukesApp,Ni as routes};
