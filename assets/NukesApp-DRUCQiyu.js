import{r as f,j as l,R as W,d as S,m as Et,u as Tt,f as Xt,a as $t,b as Ft}from"./index-CGLz25W8.js";function qt(s){return[...Zt].sort(()=>Math.random()-Math.random()).slice(0,s)}const Zt=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function It(s){return[...Jt].sort(()=>Math.random()-Math.random()).slice(0,s)}const Jt=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];var x=(s=>(s.NEUTRAL="NEUTRAL",s.FRIENDLY="FRIENDLY",s.HOSTILE="HOSTILE",s))(x||{}),P=(s=>(s.LAUNCH_SITE="LAUNCH_SITE",s))(P||{}),F=(s=>(s.WATER="WATER",s.GROUND="GROUND",s))(F||{});function Qt({playerStateName:s,numberOfStates:t=3}){const o=It(t+1).filter(d=>d!==s),r=qt(t*2),c=[{id:"state-1",name:s,isPlayerControlled:!0,strategies:{"state-2":x.NEUTRAL,"state-3":x.NEUTRAL}},{id:"state-2",name:o.pop(),isPlayerControlled:!1,strategies:{"state-1":x.NEUTRAL,"state-3":x.NEUTRAL}},{id:"state-3",name:o.pop(),isPlayerControlled:!1,strategies:{"state-1":x.NEUTRAL,"state-2":x.NEUTRAL}}],u=[{id:"city-1",stateId:"state-1",name:r.pop(),position:{x:10*16,y:10*16},populationHistogram:[{timestamp:0,population:1e3}]},{id:"city-2",stateId:"state-1",name:r.pop(),position:{x:13*16,y:13*16},populationHistogram:[{timestamp:0,population:1500}]},{id:"city-3",stateId:"state-2",name:r.pop(),position:{x:30*16,y:10*16},populationHistogram:[{timestamp:0,population:2e3}]},{id:"city-4",stateId:"state-2",name:r.pop(),position:{x:33*16,y:13*16},populationHistogram:[{timestamp:0,population:2500}]},{id:"city-5",stateId:"state-3",name:r.pop(),position:{x:10*16,y:30*16},populationHistogram:[{timestamp:0,population:3e3}]},{id:"city-6",stateId:"state-3",name:r.pop(),position:{x:13*16,y:33*16},populationHistogram:[{timestamp:0,population:3500}]}],h=[{type:P.LAUNCH_SITE,id:"launch-site-1",stateId:"state-1",position:{x:8*16,y:15*16}},{type:P.LAUNCH_SITE,id:"launch-site-2",stateId:"state-1",position:{x:15*16,y:8*16}},{type:P.LAUNCH_SITE,id:"launch-site-3",stateId:"state-2",position:{x:28*16,y:15*16}},{type:P.LAUNCH_SITE,id:"launch-site-4",stateId:"state-2",position:{x:35*16,y:8*16}},{type:P.LAUNCH_SITE,id:"launch-site-5",stateId:"state-3",position:{x:8*16,y:35*16}},{type:P.LAUNCH_SITE,id:"launch-site-6",stateId:"state-3",position:{x:15*16,y:28*16}}],a=[];let m=1;for(let d=0;d<50;d++)for(let p=0;p<50;p++){const y=d>=8&&d<=17&&p>=7&&p<=18||d>=7&&d<=18&&p>=27&&p<=38||d>=27&&d<=38&&p>=7&&p<=18;a.push({id:`sector-${m++}`,position:{x:p*16,y:d*16},rect:{left:p*16,top:d*16,right:(p+1)*16,bottom:(d+1)*16},type:y?F.GROUND:F.WATER})}return{timestamp:0,states:c,cities:u,launchSites:h,sectors:a,missiles:[],explosions:[]}}function C(s,t,e,i){return Math.sqrt(Math.pow(e-s,2)+Math.pow(i-t,2))}const q=10,M=20,te=5,ee=M/te,se=.5,ie=500,U=.05,Z=5,X=60;function ne(s){var t,e;for(const i of s.states){const n=s.cities.filter(a=>a.stateId===i.id),o=s.launchSites.filter(a=>a.stateId===i.id),r=s.cities.filter(a=>i.strategies[a.stateId]===x.HOSTILE&&a.stateId!==i.id&&a.populationHistogram.slice(-1)[0].population>0),c=s.missiles.filter(a=>i.strategies[a.stateId]!==x.FRIENDLY&&a.stateId!==i.id),u=s.launchSites.filter(a=>i.strategies[a.stateId]===x.HOSTILE&&a.stateId!==i.id),h=c.filter(a=>n.some(m=>J(a.target,m.position))||o.some(m=>J(a.target,m.position))).filter(a=>(s.timestamp-a.launchTimestamp)/(a.targetTimestamp-a.launchTimestamp)>.5);for(const a of s.launchSites.filter(m=>m.stateId===i.id)){if(a.nextLaunchTarget)continue;if(r.length===0&&u.length===0&&c.length===0)break;const m=at(h.map(d=>({...d,interceptionPoint:oe(d,a.position)})),a.position),g=s.missiles.filter(d=>d.stateId===i.id),E=ct(m,g).filter(([,d])=>d<o.length);if(E.length>0)a.nextLaunchTarget=E[0][0].interceptionPoint??void 0;else{const d=ct(at([...u,...r],a.position),g);a.nextLaunchTarget=((e=(t=d==null?void 0:d[0])==null?void 0:t[0])==null?void 0:e.position)??void 0}}}return s}function oe(s,t){const e=C(s.position.x,s.position.y,t.x,t.y);if(e<M)return null;const i=C(s.target.x,s.target.y,s.launch.x,s.launch.y),n=(s.target.x-s.launch.x)/i,o=(s.target.y-s.launch.y)/i,r={x:s.target.x-n*M*2,y:s.target.y-o*M*2},c=e/q,u=C(t.x,t.y,r.x,r.y)/q;return c<u||c>u+10?null:r}function J(s,t){const e=M;return C(s.x,s.y,t.x,t.y)<=e}function at(s,t){return s.sort((e,i)=>C(e.position.x,e.position.y,t.x,t.y)-C(i.position.x,i.position.y,t.x,t.y))}function ct(s,t){const e=new Map;for(const i of s)e.set(i,t.filter(n=>J(n.target,i.position)).length);return Array.from(e).sort((i,n)=>i[1]-n[1])}function re(s){var t,e;for(const i of s.missiles.filter(n=>n.launchTimestamp===s.timestamp)){const n=s.states.find(r=>r.id===i.stateId),o=((t=s.cities.find(r=>C(r.position.x,r.position.y,i.target.x,i.target.y)<=M))==null?void 0:t.stateId)||((e=s.launchSites.find(r=>C(r.position.x,r.position.y,i.target.x,i.target.y)<=M))==null?void 0:e.stateId);if(n&&o&&n.id!==o){n.strategies[o]!==x.HOSTILE&&(n.strategies[o]=x.HOSTILE);const r=s.states.find(c=>c.id===o);r&&r.strategies[n.id]!==x.HOSTILE&&(r.strategies[n.id]=x.HOSTILE)}}for(const i of s.states)if(!Object.entries(i.strategies).some(([o,r])=>r===x.HOSTILE&&s.launchSites.some(c=>c.stateId===o))){const o=s.launchSites.filter(c=>c.stateId===i.id).length,r=s.states.filter(c=>c.id!==i.id&&i.strategies[c.id]===x.NEUTRAL&&s.launchSites.filter(u=>u.stateId===c.id).length<o&&s.cities.filter(u=>u.stateId===c.id).some(u=>u.populationHistogram.slice(-1)[0].population>0));if(r.length>0){const c=r[0];i.strategies[c.id]=x.HOSTILE}}return s}function ae(s,t){for(;t>0;){const e=ce(s,t>U?U:t);t=t>U?t-U:0,s=e}return s}function ce(s,t){const e=s.timestamp+t;let i={timestamp:e,states:s.states,cities:s.cities,launchSites:s.launchSites,missiles:s.missiles,explosions:s.explosions,sectors:s.sectors};for(const n of i.missiles){const o=(e-n.launchTimestamp)/(n.targetTimestamp-n.launchTimestamp);n.position={x:n.launch.x+(n.target.x-n.launch.x)*o,y:n.launch.y+(n.target.y-n.launch.y)*o}}for(const n of s.missiles.filter(o=>o.targetTimestamp<=e)){const o={id:`explosion-${Math.random()}`,missileId:n.id,startTimestamp:n.targetTimestamp,endTimestamp:n.targetTimestamp+ee,position:n.target,radius:M};i.explosions.push(o);for(const u of s.cities.filter(h=>C(h.position.x,h.position.y,o.position.x,o.position.y)<=o.radius)){const h=u.populationHistogram[u.populationHistogram.length-1].population,a=Math.max(ie,h*se);u.populationHistogram.push({timestamp:o.startTimestamp,population:Math.max(0,h-a)})}const r=s.missiles.filter(u=>u.id!==o.missileId&&u.launchTimestamp<=o.startTimestamp&&u.targetTimestamp>=o.startTimestamp).filter(u=>C(u.position.x,u.position.y,o.position.x,o.position.y)<=o.radius);for(const u of r)u.targetTimestamp=o.startTimestamp;const c=s.launchSites.filter(u=>C(u.position.x,u.position.y,o.position.x,o.position.y)<=o.radius);for(const u of c)i.launchSites=s.launchSites.filter(h=>h.id!==u.id)}i.explosions=i.explosions.filter(n=>n.endTimestamp>=e),i.missiles=i.missiles.filter(n=>n.targetTimestamp>e);for(const n of s.launchSites){if(n.nextLaunchTarget){if(n.lastLaunchTimestamp&&e-n.lastLaunchTimestamp<Z)continue}else continue;const o=C(n.position.x,n.position.y,n.nextLaunchTarget.x,n.nextLaunchTarget.y),r={id:Math.random()+"",stateId:n.stateId,launchSiteId:n.id,launch:n.position,launchTimestamp:e,position:n.position,target:n.nextLaunchTarget,targetTimestamp:e+o/q};i.missiles.push(r),n.lastLaunchTimestamp=e,n.nextLaunchTarget=void 0}return i=ne(i),i=re(i),i}function le(s){const[t,e]=f.useState(()=>Qt({playerStateName:s,numberOfStates:3})),i=f.useCallback((n,o)=>e(ae(n,o)),[]);return{worldState:t,updateWorldState:i,setWorldState:e}}const wt={x:0,y:0,pointingObjects:[]},ue=(s,t)=>t.type==="move"?{x:t.x,y:t.y,pointingObjects:s.pointingObjects}:t.type==="point"&&!s.pointingObjects.some(e=>e.id===t.object.id)?{x:s.x,y:s.y,pointingObjects:[...s.pointingObjects,t.object]}:t.type==="unpoint"&&s.pointingObjects.some(e=>e.id===t.object.id)?{x:s.x,y:s.y,pointingObjects:s.pointingObjects.filter(e=>e.id!==t.object.id)}:s,Ct=f.createContext(wt),it=f.createContext(()=>{});function he({children:s}){const[t,e]=f.useReducer(ue,wt);return l.jsx(Ct.Provider,{value:t,children:l.jsx(it.Provider,{value:e,children:s})})}function de(){return f.useContext(Ct)}function pe(){const s=f.useContext(it);return(t,e)=>s({type:"move",x:t,y:e})}function nt(){const s=f.useContext(it);return[t=>s({type:"point",object:t}),t=>s({type:"unpoint",object:t})]}const ot={},fe=(s,t)=>t.type==="clear"?ot:t.type==="set"?{...s,selectedObject:t.object}:s,Ot=f.createContext(ot),At=f.createContext(()=>{});function me({children:s}){const[t,e]=f.useReducer(fe,ot);return l.jsx(Ot.Provider,{value:t,children:l.jsx(At.Provider,{value:e,children:s})})}function ge(s){var i;const t=f.useContext(At);return[((i=f.useContext(Ot).selectedObject)==null?void 0:i.id)===s.id,()=>t({type:"set",object:s})]}function Mt(s,t){const e=new CustomEvent(s,{bubbles:!0,detail:t});document.dispatchEvent(e)}function ye(s,t){f.useEffect(()=>{const e=i=>{t(i.detail)};return document.addEventListener(s,e,!1),()=>{document.removeEventListener(s,e,!1)}},[s,t])}const ve=W.memo(({sectors:s})=>{const t=f.useRef(null),[e,i]=nt();return f.useEffect(()=>{const n=t.current,o=n==null?void 0:n.getContext("2d");if(!n||!o)return;const r=Math.min(...s.map(g=>g.rect.left)),c=Math.min(...s.map(g=>g.rect.top)),u=Math.max(...s.map(g=>g.rect.right)),h=Math.max(...s.map(g=>g.rect.bottom)),a=u-r,m=h-c;n.width=a,n.height=m,n.style.width=`${a}px`,n.style.height=`${m}px`,o.clearRect(0,0,a,m),s.forEach(g=>{const{fillStyle:E,drawSector:d}=xe(g);o.fillStyle=E,d(o,g.rect,r,c)})},[s]),f.useEffect(()=>{const n=t.current;let o;const r=c=>{const u=n==null?void 0:n.getBoundingClientRect(),h=c.clientX-((u==null?void 0:u.left)||0),a=c.clientY-((u==null?void 0:u.top)||0),m=s.find(g=>h>=g.rect.left&&h<=g.rect.right&&a>=g.rect.top&&a<=g.rect.bottom);m&&(o&&i(o),e(m),o=m)};return n==null||n.addEventListener("mousemove",r),()=>{n==null||n.removeEventListener("mousemove",r)}},[s,e,i]),l.jsx("canvas",{ref:t})});function xe(s){switch(s.type){case"GROUND":return{fillStyle:"rgb(93, 42, 0)",drawSector:(t,e,i,n)=>{t.fillStyle="rgb(93, 42, 0)",t.fillRect(e.left-i,e.top-n,e.right-e.left,e.bottom-e.top)}};case"WATER":return{fillStyle:"rgb(0, 34, 93)",drawSector:(t,e,i,n)=>{const o=t.createLinearGradient(e.left-i,e.top-n,e.right-i,e.bottom-n);o.addColorStop(0,"rgb(0, 34, 93)"),o.addColorStop(1,"rgb(0, 137, 178)"),t.fillStyle=o,t.fillRect(e.left-i,e.top-n,e.right-e.left,e.bottom-e.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(t,e,i,n)=>{t.fillStyle="rgb(0, 34, 93)",t.fillRect(e.left-i,e.top-n,e.right-e.left,e.bottom-e.top)}}}}function be(){return l.jsx(_e,{})}const _e=S.div``;function Se({city:s}){const[t,e]=nt(),i=s.populationHistogram[s.populationHistogram.length-1].population,n=Math.max(...s.populationHistogram.map(r=>r.population)),o=Math.max(5,10*(i/n));return l.jsx(Ee,{onMouseEnter:()=>t(s),onMouseLeave:()=>e(s),style:{"--x":s.position.x,"--y":s.position.y,"--size":o,"--opacity":i>0?1:.3},children:l.jsxs(Te,{children:[s.name,": ",i.toLocaleString()," population"]})})}const Ee=S.div`
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
`,Te=S.div`
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
`;function Ie({launchSite:s,worldTimestamp:t,isPlayerControlled:e}){const[i,n]=ge(s),[o,r]=nt(),c=s.lastLaunchTimestamp&&s.lastLaunchTimestamp+Z>t,u=c?(t-s.lastLaunchTimestamp)/Z:0;return l.jsx(we,{onMouseEnter:()=>o(s),onMouseLeave:()=>r(s),onClick:()=>e&&n(),style:{"--x":s.position.x,"--y":s.position.y,"--cooldown-progress":u},"data-selected":i,"data-cooldown":c})}const we=S.div`
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
`;function Lt(s,t){t===void 0&&(t=!0);var e=f.useRef(null),i=f.useRef(!1),n=f.useRef(s);n.current=s;var o=f.useCallback(function(c){i.current&&(n.current(c),e.current=requestAnimationFrame(o))},[]),r=f.useMemo(function(){return[function(){i.current&&(i.current=!1,e.current&&cancelAnimationFrame(e.current))},function(){i.current||(i.current=!0,e.current=requestAnimationFrame(o))},function(){return i.current}]},[]);return f.useEffect(function(){return t&&r[1](),r[0]},[]),r}function Ce(s,t,e){if(t.startTimestamp>e||t.endTimestamp<e)return;const i=Math.pow(Math.min(Math.max(0,(e-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);s.fillStyle=`rgb(${255*i}, ${255*(1-i)}, 0)`,s.beginPath(),s.arc(t.position.x,t.position.y,t.radius*i,0,2*Math.PI),s.fill()}function Oe(s,t,e){t.launchTimestamp>e||t.targetTimestamp<e||(s.fillStyle="rgb(0, 255, 0)",s.beginPath(),s.arc(t.position.x,t.position.y,1,0,2*Math.PI),s.fill())}function Ae(s,t,e){if(t.launchTimestamp>e||t.targetTimestamp<e)return;const i=Math.min(Math.max(e-5,t.launchTimestamp)-t.launchTimestamp,t.targetTimestamp-t.launchTimestamp),n=t.targetTimestamp-t.launchTimestamp,o=i/n,r=t.launch.x+(t.target.x-t.launch.x)*o,c=t.launch.y+(t.target.y-t.launch.y)*o,u={x:r,y:c},h=t.position,a=s.createLinearGradient(u.x,u.y,h.x,h.y);a.addColorStop(0,"rgba(255, 255, 255, 0)"),a.addColorStop(1,"rgba(255, 255, 255, 0.5)"),s.strokeStyle=a,s.lineWidth=1,s.beginPath(),s.moveTo(u.x,u.y),s.lineTo(h.x,h.y),s.stroke()}function Me({state:s}){const t=f.useRef(null);return f.useLayoutEffect(()=>{const i=t.current;if(!i)return;const n=Math.min(...s.sectors.map(a=>a.rect.left)),o=Math.min(...s.sectors.map(a=>a.rect.top)),r=Math.max(...s.sectors.map(a=>a.rect.right)),c=Math.max(...s.sectors.map(a=>a.rect.bottom)),u=r-n,h=c-o;i.width=u,i.height=h,i.style.width=`${u}px`,i.style.height=`${h}px`},[s.sectors]),Lt(()=>{const i=t.current;if(!i)return;const n=i.getContext("2d");n&&(n.clearRect(0,0,i.width,i.height),s.missiles.forEach(o=>{Ae(n,o,s.timestamp)}),s.missiles.filter(o=>o.launchTimestamp<s.timestamp&&o.targetTimestamp>s.timestamp).forEach(o=>{Oe(n,o,s.timestamp)}),s.explosions.filter(o=>o.startTimestamp<s.timestamp&&o.endTimestamp>s.timestamp).forEach(o=>{Ce(n,o,s.timestamp)}))}),l.jsx(Le,{ref:t})}const Le=S.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function Pe({state:s}){const t=pe();return l.jsxs(je,{onMouseMove:e=>t(e.clientX,e.clientY),onClick:()=>Mt("world-click"),children:[l.jsx(ve,{sectors:s.sectors}),s.states.map(e=>l.jsx(be,{},e.id)),s.cities.map(e=>l.jsx(Se,{city:e},e.id)),s.launchSites.map(e=>{var i;return l.jsx(Ie,{launchSite:e,worldTimestamp:s.timestamp,isPlayerControlled:e.stateId===((i=s.states.find(n=>n.isPlayerControlled))==null?void 0:i.id)},e.id)}),l.jsx(Me,{state:s})]})}const je=S.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function lt(s,t){let e=s[0];for(const i of s)i.timestamp<t&&i.timestamp>e.timestamp&&(e=i);return e}function ke({worldState:s}){const t=de(),e=Object.fromEntries(s.states.map(o=>[o.id,s.cities.filter(r=>r.stateId===o.id).map(r=>[r,lt(r.populationHistogram,s.timestamp).population])])),i=s.states.map(o=>[o,e[o.id].reduce((r,[,c])=>r+c,0)]),n=s.cities.reduce((o,r)=>o+lt(r.populationHistogram,s.timestamp).population,0);return l.jsx(De,{children:l.jsxs("ul",{children:[l.jsxs("li",{children:["Time: ",s.timestamp.toFixed(2)]}),l.jsxs("li",{children:["Pointing object: ",t.pointingObjects.length]}),l.jsxs("li",{children:["World population: ",n]}),l.jsx("li",{children:"Population: "}),l.jsx("ul",{children:i.map(([o,r])=>l.jsxs("li",{children:[o.name,": ",r,l.jsx("ul",{children:e[o.id].map(([c,u])=>l.jsxs("li",{children:[c.name,": ",u]},c.id))})]},o.id))})]})})}const De=S.div`
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
`;function Re({worldState:s,setWorldState:t}){const e=s.states.find(n=>n.isPlayerControlled);if(!e)return null;const i=(n,o)=>{const r=s.states.map(c=>c.id===e.id?{...c,strategies:{...c.strategies,[n]:o}}:c);t({...s,states:r})};return l.jsx(He,{children:s.states.map(n=>n.id!==e.id?l.jsxs("div",{children:[l.jsx("span",{children:n.name}),l.jsx("select",{value:e.strategies[n.id],onChange:o=>i(n.id,o.target.value),children:Object.values(x).map(o=>l.jsx("option",{value:o,children:o},o))})]},n.id):null)})}const He=S.div`
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
`;function Ne({updateWorldTime:s}){const[t,e]=f.useState(!1),i=f.useRef(null);return Lt(n=>{if(!i.current){i.current=n;return}const o=n-i.current;i.current=n,!(o<=0)&&t&&s(o/1e3)},!0),l.jsxs(ze,{children:[l.jsx("button",{onClick:()=>s(1),children:"+1 Second"}),l.jsx("button",{onClick:()=>s(10),children:"+10 Seconds"}),l.jsx("button",{onClick:()=>s(60),children:"+60 seconds"}),l.jsx("button",{onClick:()=>e(!t),children:t?"Stop autoplay":"Start autoplay"})]})}const ze=S.div`
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
`;function Ue(s,t,e){return Math.max(t,Math.min(s,e))}const v={toVector(s,t){return s===void 0&&(s=t),Array.isArray(s)?s:[s,s]},add(s,t){return[s[0]+t[0],s[1]+t[1]]},sub(s,t){return[s[0]-t[0],s[1]-t[1]]},addTo(s,t){s[0]+=t[0],s[1]+=t[1]},subTo(s,t){s[0]-=t[0],s[1]-=t[1]}};function ut(s,t,e){return t===0||Math.abs(t)===1/0?Math.pow(s,e*5):s*t*e/(t+e*s)}function ht(s,t,e,i=.15){return i===0?Ue(s,t,e):s<t?-ut(t-s,e-t,i)+t:s>e?+ut(s-e,e-t,i)+e:s}function Ge(s,[t,e],[i,n]){const[[o,r],[c,u]]=s;return[ht(t,o,r,i),ht(e,c,u,n)]}function We(s,t){if(typeof s!="object"||s===null)return s;var e=s[Symbol.toPrimitive];if(e!==void 0){var i=e.call(s,t||"default");if(typeof i!="object")return i;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(s)}function Be(s){var t=We(s,"string");return typeof t=="symbol"?t:String(t)}function _(s,t,e){return t=Be(t),t in s?Object.defineProperty(s,t,{value:e,enumerable:!0,configurable:!0,writable:!0}):s[t]=e,s}function dt(s,t){var e=Object.keys(s);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(s);t&&(i=i.filter(function(n){return Object.getOwnPropertyDescriptor(s,n).enumerable})),e.push.apply(e,i)}return e}function b(s){for(var t=1;t<arguments.length;t++){var e=arguments[t]!=null?arguments[t]:{};t%2?dt(Object(e),!0).forEach(function(i){_(s,i,e[i])}):Object.getOwnPropertyDescriptors?Object.defineProperties(s,Object.getOwnPropertyDescriptors(e)):dt(Object(e)).forEach(function(i){Object.defineProperty(s,i,Object.getOwnPropertyDescriptor(e,i))})}return s}const Pt={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function pt(s){return s?s[0].toUpperCase()+s.slice(1):""}const Ve=["enter","leave"];function Ke(s=!1,t){return s&&!Ve.includes(t)}function Ye(s,t="",e=!1){const i=Pt[s],n=i&&i[t]||t;return"on"+pt(s)+pt(n)+(Ke(e,n)?"Capture":"")}const Xe=["gotpointercapture","lostpointercapture"];function $e(s){let t=s.substring(2).toLowerCase();const e=!!~t.indexOf("passive");e&&(t=t.replace("passive",""));const i=Xe.includes(t)?"capturecapture":"capture",n=!!~t.indexOf(i);return n&&(t=t.replace("capture","")),{device:t,capture:n,passive:e}}function Fe(s,t=""){const e=Pt[s],i=e&&e[t]||t;return s+i}function Y(s){return"touches"in s}function jt(s){return Y(s)?"touch":"pointerType"in s?s.pointerType:"mouse"}function qe(s){return Array.from(s.touches).filter(t=>{var e,i;return t.target===s.currentTarget||((e=s.currentTarget)===null||e===void 0||(i=e.contains)===null||i===void 0?void 0:i.call(e,t.target))})}function Ze(s){return s.type==="touchend"||s.type==="touchcancel"?s.changedTouches:s.targetTouches}function kt(s){return Y(s)?Ze(s)[0]:s}function Q(s,t){try{const e=t.clientX-s.clientX,i=t.clientY-s.clientY,n=(t.clientX+s.clientX)/2,o=(t.clientY+s.clientY)/2,r=Math.hypot(e,i);return{angle:-(Math.atan2(e,i)*180)/Math.PI,distance:r,origin:[n,o]}}catch{}return null}function Je(s){return qe(s).map(t=>t.identifier)}function ft(s,t){const[e,i]=Array.from(s.touches).filter(n=>t.includes(n.identifier));return Q(e,i)}function $(s){const t=kt(s);return Y(s)?t.identifier:t.pointerId}function R(s){const t=kt(s);return[t.clientX,t.clientY]}const mt=40,gt=800;function Dt(s){let{deltaX:t,deltaY:e,deltaMode:i}=s;return i===1?(t*=mt,e*=mt):i===2&&(t*=gt,e*=gt),[t,e]}function Qe(s){var t,e;const{scrollX:i,scrollY:n,scrollLeft:o,scrollTop:r}=s.currentTarget;return[(t=i??o)!==null&&t!==void 0?t:0,(e=n??r)!==null&&e!==void 0?e:0]}function ts(s){const t={};if("buttons"in s&&(t.buttons=s.buttons),"shiftKey"in s){const{shiftKey:e,altKey:i,metaKey:n,ctrlKey:o}=s;Object.assign(t,{shiftKey:e,altKey:i,metaKey:n,ctrlKey:o})}return t}function V(s,...t){return typeof s=="function"?s(...t):s}function es(){}function ss(...s){return s.length===0?es:s.length===1?s[0]:function(){let t;for(const e of s)t=e.apply(this,arguments)||t;return t}}function yt(s,t){return Object.assign({},t,s||{})}const is=32;class Rt{constructor(t,e,i){this.ctrl=t,this.args=e,this.key=i,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(t){this.ctrl.state[this.key]=t}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:t,shared:e,ingKey:i,args:n}=this;e[i]=t._active=t.active=t._blocked=t._force=!1,t._step=[!1,!1],t.intentional=!1,t._movement=[0,0],t._distance=[0,0],t._direction=[0,0],t._delta=[0,0],t._bounds=[[-1/0,1/0],[-1/0,1/0]],t.args=n,t.axis=void 0,t.memo=void 0,t.elapsedTime=t.timeDelta=0,t.direction=[0,0],t.distance=[0,0],t.overflow=[0,0],t._movementBound=[!1,!1],t.velocity=[0,0],t.movement=[0,0],t.delta=[0,0],t.timeStamp=0}start(t){const e=this.state,i=this.config;e._active||(this.reset(),this.computeInitial(),e._active=!0,e.target=t.target,e.currentTarget=t.currentTarget,e.lastOffset=i.from?V(i.from,e):e.offset,e.offset=e.lastOffset,e.startTime=e.timeStamp=t.timeStamp)}computeValues(t){const e=this.state;e._values=t,e.values=this.config.transform(t)}computeInitial(){const t=this.state;t._initial=t._values,t.initial=t.values}compute(t){const{state:e,config:i,shared:n}=this;e.args=this.args;let o=0;if(t&&(e.event=t,i.preventDefault&&t.cancelable&&e.event.preventDefault(),e.type=t.type,n.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,n.locked=!!document.pointerLockElement,Object.assign(n,ts(t)),n.down=n.pressed=n.buttons%2===1||n.touches>0,o=t.timeStamp-e.timeStamp,e.timeStamp=t.timeStamp,e.elapsedTime=e.timeStamp-e.startTime),e._active){const L=e._delta.map(Math.abs);v.addTo(e._distance,L)}this.axisIntent&&this.axisIntent(t);const[r,c]=e._movement,[u,h]=i.threshold,{_step:a,values:m}=e;if(i.hasCustomTransform?(a[0]===!1&&(a[0]=Math.abs(r)>=u&&m[0]),a[1]===!1&&(a[1]=Math.abs(c)>=h&&m[1])):(a[0]===!1&&(a[0]=Math.abs(r)>=u&&Math.sign(r)*u),a[1]===!1&&(a[1]=Math.abs(c)>=h&&Math.sign(c)*h)),e.intentional=a[0]!==!1||a[1]!==!1,!e.intentional)return;const g=[0,0];if(i.hasCustomTransform){const[L,Yt]=m;g[0]=a[0]!==!1?L-a[0]:0,g[1]=a[1]!==!1?Yt-a[1]:0}else g[0]=a[0]!==!1?r-a[0]:0,g[1]=a[1]!==!1?c-a[1]:0;this.restrictToAxis&&!e._blocked&&this.restrictToAxis(g);const E=e.offset,d=e._active&&!e._blocked||e.active;d&&(e.first=e._active&&!e.active,e.last=!e._active&&e.active,e.active=n[this.ingKey]=e._active,t&&(e.first&&("bounds"in i&&(e._bounds=V(i.bounds,e)),this.setup&&this.setup()),e.movement=g,this.computeOffset()));const[p,y]=e.offset,[[I,T],[O,H]]=e._bounds;e.overflow=[p<I?-1:p>T?1:0,y<O?-1:y>H?1:0],e._movementBound[0]=e.overflow[0]?e._movementBound[0]===!1?e._movement[0]:e._movementBound[0]:!1,e._movementBound[1]=e.overflow[1]?e._movementBound[1]===!1?e._movement[1]:e._movementBound[1]:!1;const Kt=e._active?i.rubberband||[0,0]:[0,0];if(e.offset=Ge(e._bounds,e.offset,Kt),e.delta=v.sub(e.offset,E),this.computeMovement(),d&&(!e.last||o>is)){e.delta=v.sub(e.offset,E);const L=e.delta.map(Math.abs);v.addTo(e.distance,L),e.direction=e.delta.map(Math.sign),e._direction=e._delta.map(Math.sign),!e.first&&o>0&&(e.velocity=[L[0]/o,L[1]/o],e.timeDelta=o)}}emit(){const t=this.state,e=this.shared,i=this.config;if(t._active||this.clean(),(t._blocked||!t.intentional)&&!t._force&&!i.triggerAllEvents)return;const n=this.handler(b(b(b({},e),t),{},{[this.aliasKey]:t.values}));n!==void 0&&(t.memo=n)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function ns([s,t],e){const i=Math.abs(s),n=Math.abs(t);if(i>n&&i>e)return"x";if(n>i&&n>e)return"y"}class N extends Rt{constructor(...t){super(...t),_(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=v.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=v.sub(this.state.offset,this.state.lastOffset)}axisIntent(t){const e=this.state,i=this.config;if(!e.axis&&t){const n=typeof i.axisThreshold=="object"?i.axisThreshold[jt(t)]:i.axisThreshold;e.axis=ns(e._movement,n)}e._blocked=(i.lockDirection||!!i.axis)&&!e.axis||!!i.axis&&i.axis!==e.axis}restrictToAxis(t){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":t[1]=0;break;case"y":t[0]=0;break}}}const os=s=>s,vt=.15,Ht={enabled(s=!0){return s},eventOptions(s,t,e){return b(b({},e.shared.eventOptions),s)},preventDefault(s=!1){return s},triggerAllEvents(s=!1){return s},rubberband(s=0){switch(s){case!0:return[vt,vt];case!1:return[0,0];default:return v.toVector(s)}},from(s){if(typeof s=="function")return s;if(s!=null)return v.toVector(s)},transform(s,t,e){const i=s||e.shared.transform;return this.hasCustomTransform=!!i,i||os},threshold(s){return v.toVector(s,0)}},rs=0,j=b(b({},Ht),{},{axis(s,t,{axis:e}){if(this.lockDirection=e==="lock",!this.lockDirection)return e},axisThreshold(s=rs){return s},bounds(s={}){if(typeof s=="function")return o=>j.bounds(s(o));if("current"in s)return()=>s.current;if(typeof HTMLElement=="function"&&s instanceof HTMLElement)return s;const{left:t=-1/0,right:e=1/0,top:i=-1/0,bottom:n=1/0}=s;return[[t,e],[i,n]]}}),xt={ArrowRight:(s,t=1)=>[s*t,0],ArrowLeft:(s,t=1)=>[-1*s*t,0],ArrowUp:(s,t=1)=>[0,-1*s*t],ArrowDown:(s,t=1)=>[0,s*t]};class as extends N{constructor(...t){super(...t),_(this,"ingKey","dragging")}reset(){super.reset();const t=this.state;t._pointerId=void 0,t._pointerActive=!1,t._keyboardActive=!1,t._preventScroll=!1,t._delayed=!1,t.swipe=[0,0],t.tap=!1,t.canceled=!1,t.cancel=this.cancel.bind(this)}setup(){const t=this.state;if(t._bounds instanceof HTMLElement){const e=t._bounds.getBoundingClientRect(),i=t.currentTarget.getBoundingClientRect(),n={left:e.left-i.left+t.offset[0],right:e.right-i.right+t.offset[0],top:e.top-i.top+t.offset[1],bottom:e.bottom-i.bottom+t.offset[1]};t._bounds=j.bounds(n)}}cancel(){const t=this.state;t.canceled||(t.canceled=!0,t._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(t){const e=this.config,i=this.state;if(t.buttons!=null&&(Array.isArray(e.pointerButtons)?!e.pointerButtons.includes(t.buttons):e.pointerButtons!==-1&&e.pointerButtons!==t.buttons))return;const n=this.ctrl.setEventIds(t);e.pointerCapture&&t.target.setPointerCapture(t.pointerId),!(n&&n.size>1&&i._pointerActive)&&(this.start(t),this.setupPointer(t),i._pointerId=$(t),i._pointerActive=!0,this.computeValues(R(t)),this.computeInitial(),e.preventScrollAxis&&jt(t)!=="mouse"?(i._active=!1,this.setupScrollPrevention(t)):e.delay>0?(this.setupDelayTrigger(t),e.triggerAllEvents&&(this.compute(t),this.emit())):this.startPointerDrag(t))}startPointerDrag(t){const e=this.state;e._active=!0,e._preventScroll=!0,e._delayed=!1,this.compute(t),this.emit()}pointerMove(t){const e=this.state,i=this.config;if(!e._pointerActive)return;const n=$(t);if(e._pointerId!==void 0&&n!==e._pointerId)return;const o=R(t);if(document.pointerLockElement===t.target?e._delta=[t.movementX,t.movementY]:(e._delta=v.sub(o,e._values),this.computeValues(o)),v.addTo(e._movement,e._delta),this.compute(t),e._delayed&&e.intentional){this.timeoutStore.remove("dragDelay"),e.active=!1,this.startPointerDrag(t);return}if(i.preventScrollAxis&&!e._preventScroll)if(e.axis)if(e.axis===i.preventScrollAxis||i.preventScrollAxis==="xy"){e._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(t);return}else return;this.emit()}pointerUp(t){this.ctrl.setEventIds(t);try{this.config.pointerCapture&&t.target.hasPointerCapture(t.pointerId)&&t.target.releasePointerCapture(t.pointerId)}catch{}const e=this.state,i=this.config;if(!e._active||!e._pointerActive)return;const n=$(t);if(e._pointerId!==void 0&&n!==e._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(t);const[o,r]=e._distance;if(e.tap=o<=i.tapsThreshold&&r<=i.tapsThreshold,e.tap&&i.filterTaps)e._force=!0;else{const[c,u]=e._delta,[h,a]=e._movement,[m,g]=i.swipe.velocity,[E,d]=i.swipe.distance,p=i.swipe.duration;if(e.elapsedTime<p){const y=Math.abs(c/e.timeDelta),I=Math.abs(u/e.timeDelta);y>m&&Math.abs(h)>E&&(e.swipe[0]=Math.sign(c)),I>g&&Math.abs(a)>d&&(e.swipe[1]=Math.sign(u))}}this.emit()}pointerClick(t){!this.state.tap&&t.detail>0&&(t.preventDefault(),t.stopPropagation())}setupPointer(t){const e=this.config,i=e.device;e.pointerLock&&t.currentTarget.requestPointerLock(),e.pointerCapture||(this.eventStore.add(this.sharedConfig.window,i,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,i,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,i,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(t){this.state._preventScroll&&t.cancelable&&t.preventDefault()}setupScrollPrevention(t){this.state._preventScroll=!1,cs(t);const e=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",e),this.eventStore.add(this.sharedConfig.window,"touch","cancel",e),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,t)}setupDelayTrigger(t){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(t)},this.config.delay)}keyDown(t){const e=xt[t.key];if(e){const i=this.state,n=t.shiftKey?10:t.altKey?.1:1;this.start(t),i._delta=e(this.config.keyboardDisplacement,n),i._keyboardActive=!0,v.addTo(i._movement,i._delta),this.compute(t),this.emit()}}keyUp(t){t.key in xt&&(this.state._keyboardActive=!1,this.setActive(),this.compute(t),this.emit())}bind(t){const e=this.config.device;t(e,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(t(e,"change",this.pointerMove.bind(this)),t(e,"end",this.pointerUp.bind(this)),t(e,"cancel",this.pointerUp.bind(this)),t("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(t("key","down",this.keyDown.bind(this)),t("key","up",this.keyUp.bind(this))),this.config.filterTaps&&t("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function cs(s){"persist"in s&&typeof s.persist=="function"&&s.persist()}const z=typeof window<"u"&&window.document&&window.document.createElement;function Nt(){return z&&"ontouchstart"in window}function ls(){return Nt()||z&&window.navigator.maxTouchPoints>1}function us(){return z&&"onpointerdown"in window}function hs(){return z&&"exitPointerLock"in window.document}function ds(){try{return"constructor"in GestureEvent}catch{return!1}}const w={isBrowser:z,gesture:ds(),touch:Nt(),touchscreen:ls(),pointer:us(),pointerLock:hs()},ps=250,fs=180,ms=.5,gs=50,ys=250,vs=10,bt={mouse:0,touch:0,pen:8},xs=b(b({},j),{},{device(s,t,{pointer:{touch:e=!1,lock:i=!1,mouse:n=!1}={}}){return this.pointerLock=i&&w.pointerLock,w.touch&&e?"touch":this.pointerLock?"mouse":w.pointer&&!n?"pointer":w.touch?"touch":"mouse"},preventScrollAxis(s,t,{preventScroll:e}){if(this.preventScrollDelay=typeof e=="number"?e:e||e===void 0&&s?ps:void 0,!(!w.touchscreen||e===!1))return s||(e!==void 0?"y":void 0)},pointerCapture(s,t,{pointer:{capture:e=!0,buttons:i=1,keys:n=!0}={}}){return this.pointerButtons=i,this.keys=n,!this.pointerLock&&this.device==="pointer"&&e},threshold(s,t,{filterTaps:e=!1,tapsThreshold:i=3,axis:n=void 0}){const o=v.toVector(s,e?i:n?1:0);return this.filterTaps=e,this.tapsThreshold=i,o},swipe({velocity:s=ms,distance:t=gs,duration:e=ys}={}){return{velocity:this.transform(v.toVector(s)),distance:this.transform(v.toVector(t)),duration:e}},delay(s=0){switch(s){case!0:return fs;case!1:return 0;default:return s}},axisThreshold(s){return s?b(b({},bt),s):bt},keyboardDisplacement(s=vs){return s}});function zt(s){const[t,e]=s.overflow,[i,n]=s._delta,[o,r]=s._direction;(t<0&&i>0&&o<0||t>0&&i<0&&o>0)&&(s._movement[0]=s._movementBound[0]),(e<0&&n>0&&r<0||e>0&&n<0&&r>0)&&(s._movement[1]=s._movementBound[1])}const bs=30,_s=100;class Ss extends Rt{constructor(...t){super(...t),_(this,"ingKey","pinching"),_(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const t=this.state;t._touchIds=[],t.canceled=!1,t.cancel=this.cancel.bind(this),t.turns=0}computeOffset(){const{type:t,movement:e,lastOffset:i}=this.state;t==="wheel"?this.state.offset=v.add(e,i):this.state.offset=[(1+e[0])*i[0],e[1]+i[1]]}computeMovement(){const{offset:t,lastOffset:e}=this.state;this.state.movement=[t[0]/e[0],t[1]-e[1]]}axisIntent(){const t=this.state,[e,i]=t._movement;if(!t.axis){const n=Math.abs(e)*bs-Math.abs(i);n<0?t.axis="angle":n>0&&(t.axis="scale")}}restrictToAxis(t){this.config.lockDirection&&(this.state.axis==="scale"?t[1]=0:this.state.axis==="angle"&&(t[0]=0))}cancel(){const t=this.state;t.canceled||setTimeout(()=>{t.canceled=!0,t._active=!1,this.compute(),this.emit()},0)}touchStart(t){this.ctrl.setEventIds(t);const e=this.state,i=this.ctrl.touchIds;if(e._active&&e._touchIds.every(o=>i.has(o))||i.size<2)return;this.start(t),e._touchIds=Array.from(i).slice(0,2);const n=ft(t,e._touchIds);n&&this.pinchStart(t,n)}pointerStart(t){if(t.buttons!=null&&t.buttons%2!==1)return;this.ctrl.setEventIds(t),t.target.setPointerCapture(t.pointerId);const e=this.state,i=e._pointerEvents,n=this.ctrl.pointerIds;if(e._active&&Array.from(i.keys()).every(r=>n.has(r))||(i.size<2&&i.set(t.pointerId,t),e._pointerEvents.size<2))return;this.start(t);const o=Q(...Array.from(i.values()));o&&this.pinchStart(t,o)}pinchStart(t,e){const i=this.state;i.origin=e.origin,this.computeValues([e.distance,e.angle]),this.computeInitial(),this.compute(t),this.emit()}touchMove(t){if(!this.state._active)return;const e=ft(t,this.state._touchIds);e&&this.pinchMove(t,e)}pointerMove(t){const e=this.state._pointerEvents;if(e.has(t.pointerId)&&e.set(t.pointerId,t),!this.state._active)return;const i=Q(...Array.from(e.values()));i&&this.pinchMove(t,i)}pinchMove(t,e){const i=this.state,n=i._values[1],o=e.angle-n;let r=0;Math.abs(o)>270&&(r+=Math.sign(o)),this.computeValues([e.distance,e.angle-360*r]),i.origin=e.origin,i.turns=r,i._movement=[i._values[0]/i._initial[0]-1,i._values[1]-i._initial[1]],this.compute(t),this.emit()}touchEnd(t){this.ctrl.setEventIds(t),this.state._active&&this.state._touchIds.some(e=>!this.ctrl.touchIds.has(e))&&(this.state._active=!1,this.compute(t),this.emit())}pointerEnd(t){const e=this.state;this.ctrl.setEventIds(t);try{t.target.releasePointerCapture(t.pointerId)}catch{}e._pointerEvents.has(t.pointerId)&&e._pointerEvents.delete(t.pointerId),e._active&&e._pointerEvents.size<2&&(e._active=!1,this.compute(t),this.emit())}gestureStart(t){t.cancelable&&t.preventDefault();const e=this.state;e._active||(this.start(t),this.computeValues([t.scale,t.rotation]),e.origin=[t.clientX,t.clientY],this.compute(t),this.emit())}gestureMove(t){if(t.cancelable&&t.preventDefault(),!this.state._active)return;const e=this.state;this.computeValues([t.scale,t.rotation]),e.origin=[t.clientX,t.clientY];const i=e._movement;e._movement=[t.scale-1,t.rotation],e._delta=v.sub(e._movement,i),this.compute(t),this.emit()}gestureEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}wheel(t){const e=this.config.modifierKey;e&&(Array.isArray(e)?!e.find(i=>t[i]):!t[e])||(this.state._active?this.wheelChange(t):this.wheelStart(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(t){this.start(t),this.wheelChange(t)}wheelChange(t){"uv"in t||t.cancelable&&t.preventDefault();const i=this.state;i._delta=[-Dt(t)[1]/_s*i.offset[0],0],v.addTo(i._movement,i._delta),zt(i),this.state.origin=[t.clientX,t.clientY],this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){const e=this.config.device;e&&(t(e,"start",this[e+"Start"].bind(this)),t(e,"change",this[e+"Move"].bind(this)),t(e,"end",this[e+"End"].bind(this)),t(e,"cancel",this[e+"End"].bind(this)),t("lostPointerCapture","",this[e+"End"].bind(this))),this.config.pinchOnWheel&&t("wheel","",this.wheel.bind(this),{passive:!1})}}const Es=b(b({},Ht),{},{device(s,t,{shared:e,pointer:{touch:i=!1}={}}){if(e.target&&!w.touch&&w.gesture)return"gesture";if(w.touch&&i)return"touch";if(w.touchscreen){if(w.pointer)return"pointer";if(w.touch)return"touch"}},bounds(s,t,{scaleBounds:e={},angleBounds:i={}}){const n=r=>{const c=yt(V(e,r),{min:-1/0,max:1/0});return[c.min,c.max]},o=r=>{const c=yt(V(i,r),{min:-1/0,max:1/0});return[c.min,c.max]};return typeof e!="function"&&typeof i!="function"?[n(),o()]:r=>[n(r),o(r)]},threshold(s,t,e){return this.lockDirection=e.axis==="lock",v.toVector(s,this.lockDirection?[.1,3]:0)},modifierKey(s){return s===void 0?"ctrlKey":s},pinchOnWheel(s=!0){return s}});class Ts extends N{constructor(...t){super(...t),_(this,"ingKey","moving")}move(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.state._active?this.moveChange(t):this.moveStart(t),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(t){this.start(t),this.computeValues(R(t)),this.compute(t),this.computeInitial(),this.emit()}moveChange(t){if(!this.state._active)return;const e=R(t),i=this.state;i._delta=v.sub(e,i._values),v.addTo(i._movement,i._delta),this.computeValues(e),this.compute(t),this.emit()}moveEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}bind(t){t("pointer","change",this.move.bind(this)),t("pointer","leave",this.moveEnd.bind(this))}}const Is=b(b({},j),{},{mouseOnly:(s=!0)=>s});class ws extends N{constructor(...t){super(...t),_(this,"ingKey","scrolling")}scroll(t){this.state._active||this.start(t),this.scrollChange(t),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(t){t.cancelable&&t.preventDefault();const e=this.state,i=Qe(t);e._delta=v.sub(i,e._values),v.addTo(e._movement,e._delta),this.computeValues(i),this.compute(t),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("scroll","",this.scroll.bind(this))}}const Cs=j;class Os extends N{constructor(...t){super(...t),_(this,"ingKey","wheeling")}wheel(t){this.state._active||this.start(t),this.wheelChange(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(t){const e=this.state;e._delta=Dt(t),v.addTo(e._movement,e._delta),zt(e),this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("wheel","",this.wheel.bind(this))}}const As=j;class Ms extends N{constructor(...t){super(...t),_(this,"ingKey","hovering")}enter(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.start(t),this.computeValues(R(t)),this.compute(t),this.emit())}leave(t){if(this.config.mouseOnly&&t.pointerType!=="mouse")return;const e=this.state;if(!e._active)return;e._active=!1;const i=R(t);e._movement=e._delta=v.sub(i,e._values),this.computeValues(i),this.compute(t),e.delta=e.movement,this.emit()}bind(t){t("pointer","enter",this.enter.bind(this)),t("pointer","leave",this.leave.bind(this))}}const Ls=b(b({},j),{},{mouseOnly:(s=!0)=>s}),rt=new Map,tt=new Map;function Ps(s){rt.set(s.key,s.engine),tt.set(s.key,s.resolver)}const js={key:"drag",engine:as,resolver:xs},ks={key:"hover",engine:Ms,resolver:Ls},Ds={key:"move",engine:Ts,resolver:Is},Rs={key:"pinch",engine:Ss,resolver:Es},Hs={key:"scroll",engine:ws,resolver:Cs},Ns={key:"wheel",engine:Os,resolver:As};function zs(s,t){if(s==null)return{};var e={},i=Object.keys(s),n,o;for(o=0;o<i.length;o++)n=i[o],!(t.indexOf(n)>=0)&&(e[n]=s[n]);return e}function Us(s,t){if(s==null)return{};var e=zs(s,t),i,n;if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(s);for(n=0;n<o.length;n++)i=o[n],!(t.indexOf(i)>=0)&&Object.prototype.propertyIsEnumerable.call(s,i)&&(e[i]=s[i])}return e}const Gs={target(s){if(s)return()=>"current"in s?s.current:s},enabled(s=!0){return s},window(s=w.isBrowser?window:void 0){return s},eventOptions({passive:s=!0,capture:t=!1}={}){return{passive:s,capture:t}},transform(s){return s}},Ws=["target","eventOptions","window","enabled","transform"];function B(s={},t){const e={};for(const[i,n]of Object.entries(t))switch(typeof n){case"function":e[i]=n.call(e,s[i],i,s);break;case"object":e[i]=B(s[i],n);break;case"boolean":n&&(e[i]=s[i]);break}return e}function Bs(s,t,e={}){const i=s,{target:n,eventOptions:o,window:r,enabled:c,transform:u}=i,h=Us(i,Ws);if(e.shared=B({target:n,eventOptions:o,window:r,enabled:c,transform:u},Gs),t){const a=tt.get(t);e[t]=B(b({shared:e.shared},h),a)}else for(const a in h){const m=tt.get(a);m&&(e[a]=B(b({shared:e.shared},h[a]),m))}return e}class Ut{constructor(t,e){_(this,"_listeners",new Set),this._ctrl=t,this._gestureKey=e}add(t,e,i,n,o){const r=this._listeners,c=Fe(e,i),u=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},h=b(b({},u),o);t.addEventListener(c,n,h);const a=()=>{t.removeEventListener(c,n,h),r.delete(a)};return r.add(a),a}clean(){this._listeners.forEach(t=>t()),this._listeners.clear()}}class Vs{constructor(){_(this,"_timeouts",new Map)}add(t,e,i=140,...n){this.remove(t),this._timeouts.set(t,window.setTimeout(e,i,...n))}remove(t){const e=this._timeouts.get(t);e&&window.clearTimeout(e)}clean(){this._timeouts.forEach(t=>void window.clearTimeout(t)),this._timeouts.clear()}}class Ks{constructor(t){_(this,"gestures",new Set),_(this,"_targetEventStore",new Ut(this)),_(this,"gestureEventStores",{}),_(this,"gestureTimeoutStores",{}),_(this,"handlers",{}),_(this,"config",{}),_(this,"pointerIds",new Set),_(this,"touchIds",new Set),_(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),Ys(this,t)}setEventIds(t){if(Y(t))return this.touchIds=new Set(Je(t)),this.touchIds;if("pointerId"in t)return t.type==="pointerup"||t.type==="pointercancel"?this.pointerIds.delete(t.pointerId):t.type==="pointerdown"&&this.pointerIds.add(t.pointerId),this.pointerIds}applyHandlers(t,e){this.handlers=t,this.nativeHandlers=e}applyConfig(t,e){this.config=Bs(t,e,this.config)}clean(){this._targetEventStore.clean();for(const t of this.gestures)this.gestureEventStores[t].clean(),this.gestureTimeoutStores[t].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...t){const e=this.config.shared,i={};let n;if(!(e.target&&(n=e.target(),!n))){if(e.enabled){for(const r of this.gestures){const c=this.config[r],u=_t(i,c.eventOptions,!!n);if(c.enabled){const h=rt.get(r);new h(this,t,r).bind(u)}}const o=_t(i,e.eventOptions,!!n);for(const r in this.nativeHandlers)o(r,"",c=>this.nativeHandlers[r](b(b({},this.state.shared),{},{event:c,args:t})),void 0,!0)}for(const o in i)i[o]=ss(...i[o]);if(!n)return i;for(const o in i){const{device:r,capture:c,passive:u}=$e(o);this._targetEventStore.add(n,r,"",i[o],{capture:c,passive:u})}}}}function k(s,t){s.gestures.add(t),s.gestureEventStores[t]=new Ut(s,t),s.gestureTimeoutStores[t]=new Vs}function Ys(s,t){t.drag&&k(s,"drag"),t.wheel&&k(s,"wheel"),t.scroll&&k(s,"scroll"),t.move&&k(s,"move"),t.pinch&&k(s,"pinch"),t.hover&&k(s,"hover")}const _t=(s,t,e)=>(i,n,o,r={},c=!1)=>{var u,h;const a=(u=r.capture)!==null&&u!==void 0?u:t.capture,m=(h=r.passive)!==null&&h!==void 0?h:t.passive;let g=c?i:Ye(i,n,a);e&&m&&(g+="Passive"),s[g]=s[g]||[],s[g].push(o)},Xs=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function $s(s){const t={},e={},i=new Set;for(let n in s)Xs.test(n)?(i.add(RegExp.lastMatch),e[n]=s[n]):t[n]=s[n];return[e,t,i]}function D(s,t,e,i,n,o){if(!s.has(e)||!rt.has(i))return;const r=e+"Start",c=e+"End",u=h=>{let a;return h.first&&r in t&&t[r](h),e in t&&(a=t[e](h)),h.last&&c in t&&t[c](h),a};n[i]=u,o[i]=o[i]||{}}function Fs(s,t){const[e,i,n]=$s(s),o={};return D(n,e,"onDrag","drag",o,t),D(n,e,"onWheel","wheel",o,t),D(n,e,"onScroll","scroll",o,t),D(n,e,"onPinch","pinch",o,t),D(n,e,"onMove","move",o,t),D(n,e,"onHover","hover",o,t),{handlers:o,config:t,nativeHandlers:i}}function qs(s,t={},e,i){const n=W.useMemo(()=>new Ks(s),[]);if(n.applyHandlers(s,i),n.applyConfig(t,e),W.useEffect(n.effect.bind(n)),W.useEffect(()=>n.clean.bind(n),[]),t.target===void 0)return n.bind.bind(n)}function Zs(s){return s.forEach(Ps),function(e,i){const{handlers:n,nativeHandlers:o,config:r}=Fs(e,i||{});return qs(n,r,void 0,o)}}function Js(s,t){return Zs([js,Rs,Hs,Ns,Ds,ks])(s,t||{})}function Qs({children:s}){const t=f.useRef(null),[e,i]=f.useState(1),[n,o]=f.useState({x:0,y:0}),[r,c]=f.useState(!1);return Js({onPinch({delta:u,pinching:h}){c(h),i(Math.max(e+u[0],.1))},onWheel({event:u,delta:[h,a],wheeling:m}){u.preventDefault(),c(m),o({x:n.x-h/e,y:n.y-a/e})}},{target:t,eventOptions:{passive:!1}}),l.jsx(ti,{children:l.jsx(ei,{ref:t,children:l.jsx(si,{style:{"--zoom":e,"--translate-x":n.x,"--translate-y":n.y},"data-is-interacting":r,children:s})})})}const ti=S.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,ei=S.div`
  /* flex-grow: 1;
          display: flex;
          flexDirection: column;
          alignItems: "center", */
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  /* WebkitUserSelect: "none", */
`,si=S.div`
  transform-origin: top center;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);

  &[data-is-interacting='true'] {
    pointer-events: none;
  }
`;function ii({worldState:s,setWorldState:t,updateWorldState:e}){return l.jsx(me,{children:l.jsxs(he,{children:[l.jsx(Qs,{children:l.jsx(Pe,{state:s})}),l.jsx(Ne,{updateWorldTime:i=>e(s,i)}),l.jsx(Re,{worldState:s,setWorldState:t}),l.jsx(ke,{worldState:s})]})})}const Gt="fullScreenMessage";function A(s,t,e,i=""){Mt(Gt,{message:s,startTimestamp:t,endTimestamp:e,messageId:i})}function Wt(s){ye(Gt,t=>{s(t)})}function ni({worldState:s}){const[t,e]=f.useState([]),[i,n]=f.useState(null);Wt(h=>{e(a=>(h.messageId&&a.find(m=>m.messageId===h.messageId)?[...a.map(m=>m.messageId===h.messageId?h:m)]:[h,...a]).filter(m=>m.endTimestamp>s.timestamp))});const o=(h,a)=>a<h.startTimestamp?"pre":a<h.startTimestamp+.5?"pre-in":a>h.endTimestamp-.5?"post-in":a>h.endTimestamp?"post":"active";if(f.useEffect(()=>{const h=t.find(a=>a.startTimestamp<=s.timestamp&&a.endTimestamp>s.timestamp);n(h||null)},[t,s.timestamp]),!i)return null;const r=t.find(h=>h.startTimestamp<=s.timestamp&&h.endTimestamp>s.timestamp),c=r?o(r,s.timestamp):"none",u=h=>Array.isArray(h)?h.map((a,m)=>l.jsx("div",{children:a},m)):h;return l.jsx(oi,{"data-message-state":c,children:l.jsx(ri,{children:u(i.message)})})}const Bt=Et`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`,Vt=Et`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: scale(0.9);
  }
`,oi=S.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  text-shadow: 0px 0px 10px black;
  pointer-events: none;

  &[data-message-state='pre'] {
    display: none;
  }

  &[data-message-state='pre-in'] {
    display: flex;
    animation: ${Bt} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${Vt} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,ri=S.div`
  font-size: 4rem;
  color: white;
  text-align: center;
  max-width: 80%;
  /* animation:
    ${Bt} 0.5s ease-in-out forwards,
    ${Vt} 0.5s ease-in-out forwards 2.5s; */
  white-space: pre-line;
`;function ai({worldState:s,onGameOver:t}){const[e,i]=f.useState(null),[n,o]=f.useState(!1);return f.useEffect(()=>{var E;if(n)return;const r=Object.fromEntries(s.states.map(d=>[d.id,s.cities.filter(p=>p.stateId===d.id).reduce((p,y)=>p+y.populationHistogram[y.populationHistogram.length-1].population,0)])),c=Object.values(r).filter(d=>d>0).length,u=s.launchSites.length===0,h=s.timestamp,a=s.states.filter(d=>r[d.id]>0&&Object.entries(d.strategies).filter(([p,y])=>r[p]>0&&y===x.HOSTILE).length>0),m=s.launchSites.some(d=>d.lastLaunchTimestamp&&h-d.lastLaunchTimestamp<X),g=X-h;if(!a.length&&!m&&g>0&&g<=10&&(e?A(`Game will end in ${Math.ceil(g)} seconds if no action is taken!`,e,e+10,"gameOverCountdown"):i(h)),c<=1||u||!a.length&&!m&&h>X){const d=c===1?(E=s.states.find(p=>r[p.id]>0))==null?void 0:E.id:void 0;o(!0),A(["Game Over!","Results will be shown shortly..."],h,h+5,"gameOverCountdown"),setTimeout(()=>{t({populations:Object.fromEntries(s.states.map(p=>[p.id,r[p.id]])),winner:d,stateNames:Object.fromEntries(s.states.map(p=>[p.id,p.name])),playerStateId:s.states.find(p=>p.isPlayerControlled).id})},5e3)}},[s,t,e,n]),null}const ci=({setGameState:s})=>{const{state:{result:t}}=Tt(),e=()=>{s(K,{stateName:t.stateNames[t.playerStateId]})};return l.jsxs("div",{children:[l.jsx("h2",{children:"Game Over"}),t.winner?l.jsxs("p",{children:["The winner is ",t.stateNames[t.winner]," with ",t.populations[t.winner]," population alive."]}):l.jsx("p",{children:"It's a draw!"}),l.jsx("button",{onClick:e,children:"Play Again"}),l.jsx("br",{}),l.jsx("br",{}),l.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})},et={Component:ci,path:"played"};function li({worldState:s}){const t=s.states.find(p=>p.isPlayerControlled),[e,i]=f.useState(!1),[n,o]=f.useState({}),[r,c]=f.useState([]),[u,h]=f.useState([]),[a,m]=f.useState(new Set),[g,E]=f.useState(!1),d=Math.round(s.timestamp*10)/10;return f.useEffect(()=>{!e&&s.timestamp>0&&(i(!0),A("The game has started!",s.timestamp,s.timestamp+3))},[d]),f.useEffect(()=>{if(t){const p=Object.fromEntries(s.states.map(y=>[y.id,y.strategies]));Object.entries(p[t.id]).forEach(([y,I])=>{if(I===x.HOSTILE&&n[t.id][y]!==x.HOSTILE){const O=s.states.find(H=>H.id===y);O&&A(`You have declared war on ${O.name}!`,d,d+3)}const T=s.states.find(O=>O.id===y);T&&T.strategies[t.id]===x.HOSTILE&&n[y][t.id]!==x.HOSTILE&&A(`${T.name} has declared war on you!`,d,d+3)}),o(p)}},[d]),f.useEffect(()=>{s.states.forEach(p=>{s.states.forEach(y=>{if(p.id!==y.id&&p.id!==(t==null?void 0:t.id)&&y.id!==(t==null?void 0:t.id)){const I=`${p.id}-${y.id}`;p.strategies[y.id]===x.HOSTILE&&!a.has(I)&&(A(`${p.name} has declared war on ${y.name}!`,d,d+3),m(new Set(a).add(I)))}})})},[d]),f.useEffect(()=>{t&&s.cities.filter(p=>p.stateId===t.id).forEach(p=>{const y=r.find(H=>H.id===p.id);if(!y)return;const I=p.populationHistogram[p.populationHistogram.length-1].population,O=(y?y.populationHistogram[y.populationHistogram.length-1].population:I)-I;O>0&&A([`Your city ${p.name} has been hit!`,`${O} casualties reported.`],d,d+3)}),c(s.cities.map(p=>({...p,populationHistogram:[...p.populationHistogram]})))},[d]),f.useEffect(()=>{if(t){const p=s.launchSites.filter(y=>y.stateId===t.id);u.length>0&&u.filter(I=>!p.some(T=>T.id===I.id)).forEach(()=>{A("One of your launch sites has been destroyed!",d,d+3)}),h(p)}},[d]),f.useEffect(()=>{if(t&&!g){const p=s.cities.filter(T=>T.stateId===t.id),y=s.launchSites.filter(T=>T.stateId===t.id);!p.some(T=>T.populationHistogram[T.populationHistogram.length-1].population>0)&&y.length===0&&(A(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],d,d+5),E(!0))}},[d]),null}const ui=S.div`
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
`,hi=S.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
`;function di(){const[s,t]=f.useState([]),e=f.useRef(null);Wt(n=>{t(o=>n.messageId&&o.find(r=>r.messageId===n.messageId)?[...o.map(r=>r.messageId===n.messageId?n:r)]:[n,...o])}),f.useEffect(()=>{var n;(n=e.current)==null||n.scrollIntoView({behavior:"smooth"})},[s]);const i=n=>Array.isArray(n)?n.map(o=>l.jsx("div",{children:o})):n;return l.jsxs(ui,{children:[s.map((n,o)=>l.jsx(hi,{children:l.jsx("div",{children:i(n.message)})},o)),l.jsx("div",{ref:e})]})}const pi=({setGameState:s})=>{const{state:{stateName:t}}=Tt(),{worldState:e,setWorldState:i,updateWorldState:n}=le(t);return l.jsxs(l.Fragment,{children:[l.jsx(ii,{worldState:e,updateWorldState:n,setWorldState:i}),l.jsx(ni,{worldState:e}),l.jsx(di,{}),l.jsx(ai,{worldState:e,onGameOver:o=>s(et,{result:o})}),l.jsx(li,{worldState:e})]})},K={Component:pi,path:"playing"},fi=({setGameState:s})=>{const[t,e]=f.useState(It(1)[0]),i=()=>{s(K,{stateName:t})};return l.jsxs(l.Fragment,{children:[l.jsx("div",{children:l.jsx("input",{type:"text",placeholder:"Name your state",value:t,onChange:n=>e(n.currentTarget.value)})}),l.jsx("button",{onClick:i,disabled:!t,children:"Play"})]})},st={Component:fi,path:"play"},mi=S.div`
  height: 100vh;
  width: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;

  h3 {
    font-size: 3rem;
  }
`,gi=({setGameState:s})=>l.jsxs(mi,{children:[l.jsx("h3",{children:"Nukes game"}),l.jsx("br",{}),l.jsx("button",{onClick:()=>s(st),children:"Play"})]}),St={Component:gi,path:""},yi=Xt`
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
`,vi=[{path:St.path,element:l.jsx(G,{state:St})},{path:st.path,element:l.jsx(G,{state:st})},{path:K.path,element:l.jsx(G,{state:K})},{path:et.path,element:l.jsx(G,{state:et})}];function bi(){var e;const[s]=$t(),t=s.get("path")??"";return l.jsx(l.Fragment,{children:(e=vi.find(i=>i.path===t))==null?void 0:e.element})}function G({state:s}){const t=Ft();return l.jsxs(l.Fragment,{children:[l.jsx(yi,{}),l.jsx(s.Component,{setGameState:(e,i)=>t({search:"path="+e.path},{state:i})})]})}export{bi as NukesApp,vi as routes};
