var Pe=Object.defineProperty;var je=(e,o,t)=>o in e?Pe(e,o,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[o]=t;var se=(e,o,t)=>je(e,typeof o!="symbol"?o+"":o,t);import{r as D,j as u}from"./index-BY2QjmDx.js";var d=(e=>(e[e.CapOfInvisibility=0]="CapOfInvisibility",e[e.ConfusedMonsters=1]="ConfusedMonsters",e[e.LandMine=2]="LandMine",e[e.TimeBomb=3]="TimeBomb",e[e.Crusher=4]="Crusher",e[e.Builder=5]="Builder",e[e.Climber=6]="Climber",e))(d||{}),j=(e=>(e[e.Up=0]="Up",e[e.Down=1]="Down",e[e.Left=2]="Left",e[e.Right=3]="Right",e))(j||{});function le(e){switch(e){case 0:return"Now you see me, now you don't!";case 1:return"Monsters are dizzy!";case 2:return"Boom goes the floor!";case 3:return"Tick tock, boom o'clock!";case 4:return"Hulk smash!";case 5:return"Bob the Builder mode: ON";case 6:return"Walk on walls like a pro!";default:return"Mystery power activated!"}}const T=60,w=30;function M(e,o){return{x:(e-o)*T/2,y:(e+o)*w/2}}function ce(e){switch(e){case"obstacle":return 1;case"bonus":case"landMine":case"timeBomb":return 2;case"goal":return 3;case"monster":return 4;case"player":return 5;case"explosion":return 6;default:return 0}}function ke(e){return e.sort((o,t)=>{const s=o.position.x+o.position.y,n=t.position.x+t.position.y;if(s!==n)return s-n;const i=ce(o.type),l=ce(t.type);return i!==l?i-l:0})}const ie=250,Ie=()=>Math.cos(Date.now()/1e3*Math.PI),Se=e=>.5+(e/2+1)/2,pe=(e,o,t)=>{const s=Math.min(Date.now()-t,ie)/ie;return{x:o.x+(e.x-o.x)*s,y:o.y+(e.y-o.y)*s}},Ee=e=>{const o=Date.now()/1e3;return Math.sin(o*2+e)*3},de=e=>{const o=Date.now()/50;return{x:Math.sin(o)*e,y:Math.cos(o*1.5)*e}},Ae=(e,o,t,s)=>{const n=[],i=s-t,l=1e3;if(i>l)return n;const a=o/13,c=i/l,h=Math.sqrt(a*(1-c)),r=Math.floor(h*10);for(let p=0;p<r;p++)n.push({position:{x:Math.random()*e,y:Math.random()*e},intensity:10*h,duration:10*h});return n},me=500,De=(e,o,t)=>{const s=Math.min((Date.now()-e)/me,1);return t?1-s:o?s:1},Be=()=>de(2),Le=e=>{const t=e%1e3/1e3;return Math.sin(t*Math.PI)*20},Oe=e=>Math.max(0,1-e/2e3),Fe=(e,o,t)=>{const{x:s,y:n}=M(o.x,o.y);e.fillStyle="rgba(0, 0, 0, 0.3)",e.beginPath(),e.ellipse(s,n+w/2,T/2,w/4,0,0,Math.PI*2),e.fill(),e.fillStyle="#FFD700",e.beginPath(),e.moveTo(s,n),e.lineTo(s+T/2,n+w/2),e.lineTo(s,n+w),e.lineTo(s-T/2,n+w/2),e.closePath(),e.fill(),e.fillStyle="#000000",e.font=`${t/2}px Arial`,e.textAlign="center",e.textBaseline="middle",e.fillText("★",s,n+w/2)},Re=(e,o,t)=>{o.forEach(s=>{const{position:n,creationTime:i,isRaising:l,isDestroying:a}=s,{x:c,y:h}=M(n.x,n.y),r=De(i,l,a)*t*.8;if(r===0)return;const p=r/t*.2,{x:b,y:g}=M(n.x,n.y+1),{x:C,y}=M(n.x+1,n.y+1),{x:v,y:S}=M(n.x+1,n.y+1+p),{x:I,y:k}=M(n.x,n.y+1+p);e.fillStyle="rgba(0, 0, 0, 0.3)",e.beginPath(),e.moveTo(b,g),e.lineTo(C,y),e.lineTo(v,S),e.lineTo(I,k),e.closePath(),e.fill();const A=a?r/(t*.8):1;e.fillStyle=`rgba(142, 36, 170, ${A})`,e.beginPath(),e.moveTo(c,h-r),e.lineTo(c+T/2,h+w/2-r),e.lineTo(c,h+w-r),e.lineTo(c-T/2,h+w/2-r),e.closePath(),e.fill(),e.fillStyle=`rgba(106, 27, 154, ${A})`,e.beginPath(),e.moveTo(c+T/2,h+w/2-r),e.lineTo(c+T/2,h+w/2),e.lineTo(c,h+w),e.lineTo(c,h+w-r),e.closePath(),e.fill(),e.fillStyle=`rgba(74, 20, 140, ${A})`,e.beginPath(),e.moveTo(c-T/2,h+w/2-r),e.lineTo(c-T/2,h+w/2),e.lineTo(c,h+w),e.lineTo(c,h+w-r),e.closePath(),e.fill()})},Ge=(e,o)=>{const t=M(0,0),s=M(o,0),n=M(0,o),i=M(o,o);e.fillStyle="#c2b280",e.beginPath(),e.moveTo(t.x,t.y),e.lineTo(s.x,s.y),e.lineTo(i.x,i.y),e.lineTo(n.x,n.y),e.closePath(),e.fill(),e.fillStyle="#5d4037",e.beginPath(),e.moveTo(i.x,i.y),e.lineTo(i.x,i.y+J),e.lineTo(n.x,n.y+J),e.lineTo(n.x,n.y),e.closePath(),e.fill(),e.fillStyle="#8d6e63",e.beginPath(),e.moveTo(i.x,i.y),e.lineTo(i.x,i.y+J),e.lineTo(s.x,s.y+J),e.lineTo(s.x,s.y),e.closePath(),e.fill()},ye=(e,o)=>{e.strokeStyle="#4a4a4a",e.lineWidth=1;for(let t=0;t<=o;t++)for(let s=0;s<=o;s++){const{x:n,y:i}=M(s,t);s<o&&(e.beginPath(),e.moveTo(n,i),e.lineTo(n+T/2,i+w/2),e.stroke()),t<o&&(e.beginPath(),e.moveTo(n,i),e.lineTo(n-T/2,i+w/2),e.stroke())}},ae=(e,o,t,s,n)=>{e.fillStyle="rgba(0, 0, 0, 0.3)",e.beginPath(),e.ellipse(o+s/2,t+n/2+5,s/2,n/4,0,0,Math.PI*2),e.fill()},Ne=e=>{const{isoX:o,isoY:t,cellSize:s,baseHeight:n,widthFactor:i,heightAnimationFactor:l}=e,a=Ie(),c=n*s+s*l*a,h=T*i,r=Se(a),p=T*i*r,b=w*.4*r;return{entityHeight:c,entityWidth:h,shadowWidth:p,shadowHeight:b,animFactor:a,shadowX:o-p/2,shadowY:t+w/2}},xe=(e,o,t,s,n,i,l)=>{e.fillStyle=i,e.beginPath(),e.moveTo(o,t-s-l),e.lineTo(o+n/2,t-s+w/4-l),e.lineTo(o,t+w/2-l),e.lineTo(o-n/2,t-s+w/4-l),e.closePath(),e.fill()},Ve=(e,o,t,s,n,i,l)=>{e.fillStyle=i,e.beginPath(),e.arc(o,t-s-n/2-l,n,0,Math.PI*2),e.fill()},$e=(e,o,t,s,n,i,l,a)=>{const c=n*.3;e.fillStyle=i,e.beginPath(),e.arc(o-n/3,t-s-n/2-a,c,0,Math.PI*2),e.arc(o+n/3,t-s-n/2-a,c,0,Math.PI*2),e.fill(),e.fillStyle=l,e.beginPath(),e.arc(o-n/3,t-s-n/2-a,c/2,0,Math.PI*2),e.arc(o+n/3,t-s-n/2-a,c/2,0,Math.PI*2),e.fill()},We=(e,o,t,s,n,i)=>{e.strokeStyle="black",e.lineWidth=2,e.beginPath(),e.arc(o,t-s+n/4-i,n/2,.1*Math.PI,.9*Math.PI),e.stroke()},He=(e,o,t,s,n,i,l,a,c,h,r,p,b,g)=>{e.strokeStyle=h,e.lineWidth=c;const C=Math.sin(p*1e3)*Math.PI;for(let y=0;y<l;y++){const v=y/l*Math.PI*2,S=o+Math.cos(v)*(n/3),I=t-s/2+Math.sin(v)*(s/4)-g,k=2+Math.sin(p*100+y)*2,A=.1+Math.cos(p*200+y)*.05,K=S+Math.cos(v)*(a/2),G=I+Math.sin(v)*(a/2)+Math.sin(r*k+C+y)*i*A,Y=S+Math.cos(v)*a,q=I+Math.sin(v)*a+Math.sin(r*k+Math.PI+C+y)*i*(A*1.5),Q=S+Math.cos(v)*a,Z=I+Math.sin(v)*a+Math.sin(r*k+C+y)*i*(A*2);b&&(e.save(),e.strokeStyle="rgba(0, 0, 0, 0.3)",e.lineWidth=c*1.5,e.beginPath(),e.moveTo(S,I+w/2),e.bezierCurveTo(K,G+w/2,Y,q+w/2,Q,Z+w/2),e.stroke(),e.restore()),e.beginPath(),e.moveTo(S,I),e.bezierCurveTo(K,G,Y,q,Q,Z),e.stroke()}},fe=e=>{const{ctx:o,isoX:t,isoY:s,cellSize:n,baseHeight:i,widthFactor:l,heightAnimationFactor:a,bodyColor:c,headColor:h,eyeColor:r,pupilColor:p,hasTentacles:b=!1,tentacleColor:g="",tentacleCount:C=0,tentacleLength:y=0,tentacleWidth:v=0,isInvisible:S=!1,seed:I=0,castShadow:k=!0,isConfused:A=!1}=e,K=Ne({isoX:t,isoY:s,cellSize:n,baseHeight:i,widthFactor:l,heightAnimationFactor:a}),{entityHeight:G,entityWidth:Y,shadowWidth:q,shadowHeight:Q,animFactor:Z,shadowX:Ce,shadowY:Me}=K,U=Ee(I),re=A?Be():{x:0,y:0};let V=t,$=s;V+=re.x,$+=re.y,k&&(o.fillStyle="rgba(0, 0, 0, 0.3)",o.beginPath(),o.ellipse(Ce+q/2,Me,q/2,Q/2,0,0,Math.PI*2),o.fill()),o.save(),S&&(o.globalAlpha=.5),b&&g&&C>0&&He(o,V,$,G,Y,n,C,y,v,g,Z,I,k,U),xe(o,V,$,G,Y,c,U);const te=n*.25;Ve(o,V,$,G,te,h,U),$e(o,V,$,G,te,r,p,U),We(o,V,$,G,te,U),o.restore()},Xe=(e,o,t,s=!1,n=[])=>{const{position:i,previousPosition:l,moveTimestamp:a,isVanishing:c,isVictorious:h,isClimbing:r}=o,p=pe(i,l,a);let{x:b,y:g}=M(p.x,p.y);if(h){const y=Le(Date.now()-a);g-=y}r&&n.some(v=>v.position.x===Math.round(p.x)&&v.position.y===Math.round(p.y))&&(g-=t*.5);const C={ctx:e,isoX:b,isoY:g,cellSize:t,baseHeight:.8,widthFactor:.6,heightAnimationFactor:.2,bodyColor:r?"#FFA500":"#00FF00",headColor:r?"#FFD700":"#32CD32",eyeColor:"white",pupilColor:"black",isInvisible:s};if(c){const y=Oe(Date.now()-a);e.globalAlpha=y}fe(C),e.globalAlpha=1,h&&Ye(e,b,g,t),r&&qe(e,b,g,t)},Ye=(e,o,t,s)=>{e.save(),e.translate(o,t);for(let n=0;n<10;n++){const i=Math.PI*2*n/10,l=s*(.5+Math.sin(Date.now()/200+n)*.2),a=Math.cos(i)*l,c=Math.sin(i)*l;e.beginPath(),e.arc(a,c,s*.1,0,Math.PI*2),e.fillStyle=`hsl(${(Date.now()/20+n*36)%360}, 100%, 50%)`,e.fill()}e.restore()},qe=(e,o,t,s)=>{e.save(),e.translate(o,t-s*.6);const n=s*.3;e.strokeStyle="#FFD700",e.lineWidth=2,e.beginPath(),e.moveTo(-n/2,-n/2),e.lineTo(-n/2,n/2),e.moveTo(n/2,-n/2),e.lineTo(n/2,n/2);for(let l=0;l<3;l++){const a=-n/2+(l+1)*(n/3);e.moveTo(-n/2,a),e.lineTo(n/2,a)}e.stroke(),e.shadowColor="#FFD700",e.shadowBlur=5,e.stroke();const i=Math.sin(Date.now()/200)*s*.05;e.translate(0,i),e.stroke(),e.restore()},Ue=(e,o,t)=>{o.forEach(s=>{const n=pe(s.position,s.previousPosition,s.moveTimestamp),{x:i,y:l}=M(n.x,n.y),a={ctx:e,isoX:i,isoY:l,cellSize:t,baseHeight:.4,widthFactor:.6,heightAnimationFactor:.1,bodyColor:"#800080",headColor:"#9932CC",eyeColor:"white",pupilColor:"red",hasTentacles:!0,tentacleColor:"#600060",tentacleCount:6,tentacleLength:t*.5,tentacleWidth:4,seed:s.seed,castShadow:!0};fe(a)})},B=w*.4,_e=(e,o,t)=>{o.forEach(s=>{const{x:n,y:i}=M(s.position.x,s.position.y);ae(e,n-T/4,i-w/4,T/2,w),e.fillStyle=Ze(s.type),e.beginPath(),e.moveTo(n,i-B),e.lineTo(n+T/4,i-B/2),e.lineTo(n,i),e.lineTo(n-T/4,i-B/2),e.closePath(),e.fill(),e.beginPath(),e.arc(n,i-B,T/6,0,Math.PI*2),e.fill(),e.fillStyle="white",e.font=`bold ${t/3}px Arial`,e.textAlign="center",e.textBaseline="middle",e.fillText(Je(s.type),n,i-B)})},Ke=(e,o,t)=>{o.forEach(s=>{const{x:n,y:i}=M(s.x,s.y);ae(e,n-T/2,i,T,w),e.fillStyle="brown",e.beginPath(),e.moveTo(n,i-B/2),e.lineTo(n+T/4,i-B/4),e.lineTo(n,i),e.lineTo(n-T/4,i-B/4),e.closePath(),e.fill(),e.beginPath(),e.arc(n,i-B/2,T/5,0,Math.PI*2),e.fill(),e.fillStyle="white",e.font=`bold ${t/3}px Arial`,e.textAlign="center",e.textBaseline="middle",e.fillText("M",n,i-B/2)})},Qe=(e,o,t)=>{o.forEach(s=>{const{x:n,y:i}=M(s.position.x,s.position.y);ae(e,n-T/2,i,T,w),e.fillStyle="black",e.beginPath(),e.moveTo(n,i-B),e.lineTo(n+T/4,i-B/2),e.lineTo(n,i),e.lineTo(n-T/4,i-B/2),e.closePath(),e.fill(),e.strokeStyle="orange",e.lineWidth=2,e.beginPath(),e.moveTo(n,i-B),e.quadraticCurveTo(n+T/8,i-B*1.5,n+T/4,i-B*1.25),e.stroke(),e.fillStyle="white",e.font=`bold ${t/3}px Arial`,e.textAlign="center",e.textBaseline="middle",e.fillText(s.timer.toString(),n,i-B/2)})},Ze=e=>{switch(e){case d.CapOfInvisibility:return"#8A2BE2";case d.ConfusedMonsters:return"#FFA500";case d.LandMine:return"#8B4513";case d.TimeBomb:return"#000000";case d.Crusher:return"#FF69B4";case d.Builder:return"#00FFFF";default:return"#FFFF00"}},Je=e=>{switch(e){case d.CapOfInvisibility:return"I";case d.ConfusedMonsters:return"C";case d.LandMine:return"L";case d.TimeBomb:return"T";case d.Crusher:return"X";case d.Builder:return"B";default:return"?"}},ze=(e,o)=>{e.save(),e.globalAlpha=.7;for(const{position:t,startTime:s,duration:n}of o){if(Date.now()-s>n)continue;const i=M(t.x+.5,t.y+.5),l=M(t.x-1,t.y-1),a=M(t.x+1*2,t.y-1),c=M(t.x+1*2,t.y+1*2),h=M(t.x-1,t.y+1*2);e.fillStyle="#FF6600",e.beginPath(),e.moveTo(l.x,l.y),e.lineTo(a.x,a.y),e.lineTo(c.x,c.y),e.lineTo(h.x,h.y),e.closePath(),e.fill();const r=32,p=T;for(let g=0;g<r;g++){const C=Math.PI*2/r*g,y=p*Math.random(),v=i.x+Math.cos(C)*y,S=i.y+Math.sin(C)*y/2;e.fillStyle=g%2===0?"#FF9933":"#FF3300",e.beginPath(),e.arc(v,S-Math.random()*w*Math.pow(g/r,.5),T/16,0,Math.PI*2),e.fill()}const b=e.createRadialGradient(i.x,i.y,0,i.x,i.y,T*2);b.addColorStop(0,"rgba(255, 255, 0, 0.8)"),b.addColorStop(1,"rgba(255, 165, 0, 0)"),e.fillStyle=b,e.beginPath(),e.ellipse(i.x,i.y,T,w,0,0,Math.PI*2),e.fill()}e.restore()},eo=(e,o,t,s)=>{e.save(),e.globalAlpha=t.duration===12?1:.5,e.font="bold 16px Arial";const{x:n,y:i}=M(o.x,o.y),l=e.measureText(le(t.type)).width+20,a=70,c=15,h=10,r=n-l/2,p=i-s-a-c;if(e.fillStyle="rgba(0, 0, 0, 0.9)",e.beginPath(),e.moveTo(r+h,p),e.lineTo(r+l-h,p),e.quadraticCurveTo(r+l,p,r+l,p+h),e.lineTo(r+l,p+a-h),e.quadraticCurveTo(r+l,p+a,r+l-h,p+a),e.lineTo(r+l/2+c,p+a),e.lineTo(r+l/2,p+a+c),e.lineTo(r+l/2-c,p+a),e.lineTo(r+h,p+a),e.quadraticCurveTo(r,p+a,r,p+a-h),e.lineTo(r,p+h),e.quadraticCurveTo(r,p,r+h,p),e.closePath(),e.fill(),e.strokeStyle="rgba(255, 255, 255, 0.5)",e.lineWidth=2,e.stroke(),e.fillStyle="white",e.textAlign="center",e.fillText(le(t.type),r+l/2,p+30),e.font="14px Arial",e.fillText(`${t.duration} steps left`,r+l/2,p+55),t.type===d.Climber){const g=r+l-30,C=p+25;e.strokeStyle="#FFD700",e.lineWidth=2,e.beginPath(),e.moveTo(g,C),e.lineTo(g,C+20),e.moveTo(g+20,C),e.lineTo(g+20,C+20);for(let y=0;y<3;y++){const v=C+(y+1)*6.666666666666667;e.moveTo(g,v),e.lineTo(g+20,v)}e.stroke()}e.restore()},oo=(e,o,t,s,n)=>{const i=Ae(Math.max(o,o),t,s,Date.now());e.strokeStyle="rgba(255, 255, 255, 0.7)",e.lineWidth=2;for(const l of i){const a=M(l.position.x,l.position.y),c={x:a.x+(Math.random()-.5)*n,y:a.y+(Math.random()-.5)*n};e.beginPath(),e.moveTo(a.x,a.y),e.lineTo(c.x,c.y),e.stroke()}},J=20,be=(e,o,{gridSize:t,cellSize:s})=>{if(e.save(),o.explosions.length>0){const a=Math.min(o.explosions.filter(h=>Date.now()-h.startTime<h.duration).length*2,10),c=de(a);e.translate(c.x,c.y)}e.translate(e.canvas.width/2,100),e.clearRect(-e.canvas.width/2,-100,e.canvas.width,e.canvas.height),Ge(e,t),ye(e,t),oo(e,t,o.monsterSpawnSteps,o.player.moveTimestamp,s);const n=[...o.obstacles.map(a=>({position:a.position,type:"obstacle",obj:a})),...o.bonuses.map(a=>({position:a.position,type:"bonus",obj:a})),...o.landMines.map(a=>({position:a,type:"landMine"})),...o.timeBombs.map(a=>({position:a.position,type:"timeBomb",obj:a})),...o.monsters.map(a=>({position:a.position,type:"monster",obj:a})),{position:o.player.position,type:"player",obj:o.player},{position:o.goal,type:"goal"},...o.explosions.map(a=>({position:a.position,type:"explosion",obj:a}))],i=ke(n);for(const a of i){const{type:c,position:h}=a;switch(c){case"obstacle":Re(e,[a.obj],s);break;case"bonus":_e(e,[a.obj],s);break;case"landMine":Ke(e,[h],s);break;case"timeBomb":Qe(e,[a.obj],s);break;case"monster":Ue(e,[a.obj],s);break;case"player":Xe(e,a.obj,s,o.activeBonuses.some(r=>r.type===d.CapOfInvisibility),o.obstacles);break;case"goal":Fe(e,h,s);break;case"explosion":ze(e,[a.obj]);break}}const l=o.activeBonuses.find(a=>a.duration===13||[d.Builder,d.CapOfInvisibility,d.Crusher].includes(a.type));l&&eo(e,o.player.position,l,s),e.restore()},z=300,ee=200,W=5,to=Math.min(z/W,ee/W)/2,so=()=>({player:{position:{x:2,y:2},previousPosition:{x:2,y:2},moveTimestamp:Date.now(),isInvisible:!1,isVictorious:!1,isVanishing:!1,isClimbing:!1},goal:{x:4,y:4},obstacles:[{position:{x:1,y:1},creationTime:Date.now(),isRaising:!1,isDestroying:!1},{position:{x:3,y:3},creationTime:Date.now(),isRaising:!1,isDestroying:!1}],monsters:[{position:{x:0,y:4},previousPosition:{x:0,y:4},moveTimestamp:Date.now(),path:[],seed:Math.random(),isConfused:!1},{position:{x:4,y:0},previousPosition:{x:4,y:0},moveTimestamp:Date.now(),path:[],seed:Math.random(),isConfused:!1}],steps:0,monsterSpawnSteps:0,bonuses:[{type:d.CapOfInvisibility,position:{x:1,y:3}},{type:d.ConfusedMonsters,position:{x:3,y:1}}],activeBonuses:[],explosions:[],timeBombs:[],landMines:[],crusherActive:!1,builderActive:!1,score:0,gameEndingState:"none"}),no=()=>{const e=D.useRef(null),o=D.useRef(so());return D.useEffect(()=>{const t=e.current;if(!t)return;const s=t.getContext("2d");if(!s)return;const n=()=>{s.clearRect(0,0,z,ee),s.save(),s.scale(.8,.8),s.translate(z*.1,ee*.1),ye(s,W),be(s,o.current,{gridSize:W,cellSize:to,initialMonsterCount:0,obstacleCount:0,initialBonusCount:0,levelName:"Preview",levelStory:"Preview"}),s.restore(),o.current.monsters.forEach(i=>{const l=i.position.x+(Math.random()-.5)*.1,a=i.position.y+(Math.random()-.5)*.1;i.previousPosition={...i.position},i.position={x:Math.max(0,Math.min(W-1,l)),y:Math.max(0,Math.min(W-1,a))},i.moveTimestamp=Date.now()}),requestAnimationFrame(n)};n()},[]),u.jsx("canvas",{ref:e,width:z,height:ee})},io=({onStart:e,onInstructions:o})=>(D.useEffect(()=>{const t=s=>{s.key==="ArrowRight"&&e()};return window.addEventListener("keydown",t),()=>{window.removeEventListener("keydown",t)}},[e]),u.jsxs("div",{className:"intro",children:[u.jsx("h1",{className:"game-title",children:"Monster Steps"}),u.jsxs("div",{className:"game-intro-responsive",children:[u.jsx("div",{className:"game-preview-container",children:u.jsx(no,{})}),u.jsxs("div",{className:"game-intro-column",children:[u.jsxs("div",{className:"intro-buttons",children:[u.jsx("button",{onClick:e,children:"Start Game"}),u.jsx("button",{onClick:o,children:"Instructions"})]}),u.jsx("p",{className:"intro-tip",children:"Press right arrow to start"})]})]}),u.jsxs("p",{className:"author-name",children:["Created by ",u.jsx("a",{href:"https://x.com/gtanczyk",children:"Grzegorz Tańczyk"})," | ",u.jsx("a",{href:"https://github.com/gamedevpl/www.gamedev.pl/tree/master/js13k2024",children:"Source code (GitHub)"})]})]})),ao=({onBack:e})=>(D.useEffect(()=>{const o=t=>{t.key==="Escape"&&e()};return window.addEventListener("keydown",o),()=>{window.removeEventListener("keydown",o)}},[e]),u.jsxs("div",{className:"instructions",children:[u.jsx("h1",{children:"How to Play Monster Steps"}),u.jsxs("ul",{children:[u.jsx("li",{children:"Use arrow keys, touch controls, or mouse clicks to move your character"}),u.jsx("li",{children:"Avoid obstacles and monsters"}),u.jsx("li",{children:"Reach the goal (green square) to complete the level"}),u.jsx("li",{children:"New monsters appear every 13 steps"}),u.jsxs("li",{children:["Collect bonuses for special abilities:",u.jsxs("ul",{children:[u.jsx("li",{children:"Cap of Invisibility: Temporary invisibility"}),u.jsx("li",{children:"Confused Monsters: Monsters move randomly"}),u.jsx("li",{children:"Land Mine: Place a trap for monsters"}),u.jsx("li",{children:"Time Bomb: Delayed explosion"}),u.jsx("li",{children:"Crusher: Destroy nearby obstacles"}),u.jsx("li",{children:"Builder: Create new platforms"}),u.jsx("li",{children:"Climber: Climb on walls"})]})]}),u.jsx("li",{children:"Complete all 13 levels to win"})]}),u.jsx("h2",{children:"Tips"}),u.jsxs("ul",{children:[u.jsx("li",{children:"Plan your route to avoid getting trapped"}),u.jsx("li",{children:"Use obstacles to block monsters"}),u.jsx("li",{children:"Strategically use bonuses to overcome challenges"}),u.jsx("li",{children:"Keep moving to stay ahead of monsters"})]}),u.jsx("button",{onClick:e,children:"Back to Menu"}),u.jsx("p",{className:"instructions-tip",children:"Press Escape to return to the main menu"})]})),N=(e,o)=>e.x===o.x&&e.y===o.y,oe=(e,o)=>o.some(t=>N(t,e)),ro=e=>{switch(e){case"ArrowUp":case"w":return j.Up;case"ArrowDown":case"s":return j.Down;case"ArrowLeft":case"a":return j.Left;case"ArrowRight":case"d":return j.Right;default:return null}},H=(e,o,t=1)=>{switch(o){case j.Up:return{...e,y:e.y-t};case j.Down:return{...e,y:e.y+t};case j.Left:return{...e,x:e.x-t};case j.Right:return{...e,x:e.x+t}}};function he(e,o){switch(e){case j.Up:return o===-1?j.Left:j.Right;case j.Down:return o===-1?j.Left:j.Right;case j.Left:return o===-1?j.Down:j.Up;case j.Right:return o===-1?j.Up:j.Down}}const ge=(e,o,{gridSize:t})=>!(!(e.x>=0&&e.x<t&&e.y>=0&&e.y<t)||oe(e,o.obstacles.filter(i=>!i.isDestroying).map(({position:i})=>i))&&!o.player.isClimbing&&!o.crusherActive),ve=(e,o)=>{const{player:t}=e;return[j.Up,j.Down,j.Left,j.Right].map(n=>({position:H(t.position,n),direction:n})).filter(({position:n})=>ge(n,e,o))};function lo(e,o,t,s){return ve(t,s).find(n=>co(e,o,we(s.gridSize,s.cellSize,n.direction)))}function co(e,o,t){let s=!1;for(let n=0,i=t.length-1;n<t.length;i=n++){const l=t[n].x,a=t[n].y,c=t[i].x,h=t[i].y;a>o!=h>o&&e<(c-l)*(o-a)/(h-a)+l&&(s=!s)}return s}const ho=(e,o,t,s)=>{e.save(),e.translate(e.canvas.width/2,100),o.forEach(({direction:n})=>{const i=we(t,s,n);e.beginPath(),e.moveTo(i[0].x,i[0].y),e.lineTo(i[1].x,i[1].y),e.lineTo(i[2].x,i[2].y),e.fillStyle="rgba(255, 255, 0, 0.5)",e.fill()}),e.restore()};function we(e,o,t){const s=e/3,n=H({x:e/2,y:e/2},t,e/1.5),i=H(n,he(t,-1),s),l=H(n,he(t,1),s),a=M(n.x,n.y),c=M(i.x,i.y),h=M(l.x,l.y),r=H(n,t,s),p=M(r.x,r.y),b=Math.atan2(p.y-a.y,p.x-a.x),g=Math.cos(b)*o,C=Math.sin(b)*o;return[{x:p.x+g,y:p.y+C},{x:c.x+g,y:c.y+C},{x:h.x+g,y:h.y+C}]}const uo=(e,o,t,s,n,i)=>{const l=[];return e.map(a=>{let c;n?c=mo(a.position,t,s,e):c=yo(a.position,o,t,s,e);let h;return i?h=po(a.position,c[1]||a.position,t,s,e):h=c.length>1?c[1]:a.position,x(h,l)?h=a.position:l.push(h),{...a,previousPosition:a.position,position:h,moveTimestamp:Date.now(),path:c}})},po=(e,o,t,s,n)=>{const i=o.x-e.x,l=o.y-e.y,a={x:Math.max(0,Math.min(t-1,e.x-i)),y:Math.max(0,Math.min(t-1,e.y-l))};return!x(a,s.map(({position:c})=>c))&&!x(a,n.map(c=>c.position))?a:e},mo=(e,o,t,s)=>{const n=[{x:e.x-1,y:e.y},{x:e.x+1,y:e.y},{x:e.x,y:e.y-1},{x:e.x,y:e.y+1}].filter(i=>i.x>=0&&i.x<o&&i.y>=0&&i.y<o&&!x(i,t.map(({position:l})=>l))&&!x(i,s.map(l=>l.position)));if(n.length>0){const i=Math.floor(Math.random()*n.length);return[e,n[i]]}return[e]},yo=(e,o,t,s,n)=>{const i=[],l=[],a={position:e,g:0,h:0,f:0,parent:null};for(i.push(a);i.length>0;){let c=i[0],h=0;if(i.forEach((p,b)=>{p.f<c.f&&(c=p,h=b)}),i.splice(h,1),l.push(c),X(c.position,o))return fo(c);const r=bo(c.position,t);for(const p of r){if(x(p,s.map(({position:v})=>v))||x(p,n.map(v=>v.position))||l.some(v=>X(v.position,p)))continue;const b=c.g+1,g=go(p,o),C=b+g,y=i.find(v=>X(v.position,p));y?b<y.g&&(y.g=b,y.f=C,y.parent=c):i.push({position:p,g:b,h:g,f:C,parent:c})}}return[e]},fo=e=>{const o=[];let t=e;for(;t!==null;)o.unshift(t.position),t=t.parent;return o},bo=(e,o)=>[{x:e.x-1,y:e.y},{x:e.x+1,y:e.y},{x:e.x,y:e.y-1},{x:e.x,y:e.y+1}].filter(s=>s.x>=0&&s.x<o&&s.y>=0&&s.y<o),go=(e,o)=>Math.abs(e.x-o.x)+Math.abs(e.y-o.y),X=(e,o)=>e.x===o.x&&e.y===o.y,x=(e,o)=>o.some(t=>X(t,e)),vo=(e,o)=>o.some(t=>X(t.position,e)),wo=(e,o)=>{const t=[];return[e.filter(n=>{const i=o.find(l=>X(l,n.position));return i?(t.push({position:i,startTime:Date.now(),duration:1e3}),To(o,i),!1):!0}),t]},To=(e,o)=>{e.splice(e.indexOf(o),1)},Co=(e,o)=>Math.abs(e.position.x-o.position.x)<=1&&Math.abs(e.position.y-o.position.y)<=1,ne=(e,o)=>o.some(t=>Math.abs(e.x-t.position.x)<=1&&Math.abs(e.y-t.position.y)<=1),Mo=()=>{const e=O(),o=F(7,"The First Step","Avoid the lone monster and reach the goal in 13 steps!");return e.player=L(0,3),e.goal=E(6,3),e.monsters=[f(3,0)],e.obstacles=[m(5,2),m(5,3)],[e,o,o.levelStory]},Po=()=>{const e=O(),o=F(8,"Now You See Me","Use the invisibility cap to sneak past the monsters!");return e.player=L(0,4),e.goal=E(7,4),e.monsters=[f(3,2),f(5,4)],e.bonuses=[P(2,4,d.CapOfInvisibility)],e.obstacles=[m(1,3),m(1,5),m(6,3),m(6,5)],[e,o,o.levelStory]},jo=()=>{const e=O(),o=F(9,"Bridge the Gap","Build your way to victory!");return e.player=L(0,4),e.goal=E(8,4),e.monsters=[f(4,4)],e.bonuses=[P(2,4,d.Builder)],e.obstacles=[m(3,3),m(3,4),m(3,5),m(5,3),m(5,4),m(5,5)],[e,o,o.levelStory]},ko=()=>{const e=O(),o=F(9,"Crush and Rush","Clear the path with your crushing power!");e.player=L(0,4),e.goal=E(8,4),e.monsters=[f(4,4)],e.bonuses=[P(2,4,d.Crusher)],e.obstacles=[m(8,2),m(7,2),m(7,3),m(7,4),m(7,5),m(8,5)];for(let t=2;t<7;t++)e.obstacles.push(m(t,3)),e.obstacles.push(m(t-1,5));return[e,o,o.levelStory]},Io=()=>{const e=O(),o=F(10,"Tick Tock Boom","Time your bomb perfectly to clear the way!");e.player=L(0,5),e.goal=E(9,5),e.monsters=[f(3,5)],e.bonuses=[P(9,3,d.TimeBomb)],e.obstacles=[m(9,4),m(8,4),m(8,5),m(8,6),m(9,6),m(4,1),m(5,1),m(6,1),m(7,1),m(8,1)];for(let t=2;t<8;t++)e.obstacles.push(m(t,4)),e.obstacles.push(m(t,6)),e.obstacles.push(m(t-2,8));return[e,o,o.levelStory]},So=()=>{const e=O(),o=F(10,"Minesweeper's Revenge","Plant a surprise for your pursuers!");e.player=L(0,5),e.goal=E(9,5),e.monsters=[f(6,5),f(4,8),f(8,8)],e.bonuses=[P(2,5,d.LandMine)];for(let t=4;t<9;t++)t!==6&&(e.obstacles.push(m(t,4)),e.obstacles.push(m(t,6)));return[e,o,o.levelStory]},Eo=()=>{const e=O(),o=F(11,"Monsters' Mayhem","Confuse them all and make your escape!");e.player=L(0,5),e.goal=E(10,5),e.monsters=[f(3,4),f(3,6),f(6,4),f(6,6),f(9,5)],e.bonuses=[P(2,5,d.ConfusedMonsters)];for(let t=4;t<8;t++)e.obstacles.push(m(t,3)),e.obstacles.push(m(t,7));return[e,o,o.levelStory]},Ao=()=>{const e=O(),o=F(12,"Tunnel Vision","Build a path and set a trap!");e.player=L(0,6),e.goal=E(11,6),e.monsters=[f(3,10),f(8,8)],e.bonuses=[P(2,6,d.Builder),P(2,2,d.LandMine)];for(let t=3;t<10;t++)t!==6&&(e.obstacles.push(m(t,5)),e.obstacles.push(m(t,7)));return[e,o,o.levelStory]},Do=()=>{const e=O(),o=F(12,"Ghost Bomber","Vanish, plant, and detonate!");e.player=L(0,6),e.goal=E(11,6),e.monsters=[f(3,6),f(7,6),f(10,6)],e.bonuses=[P(2,6,d.CapOfInvisibility),P(5,6,d.TimeBomb)];for(let t=4;t<11;t++)t!==5&&t!==8&&(e.obstacles.push(m(t,5)),e.obstacles.push(m(t,7)));return[e,o,o.levelStory]},Bo=()=>{const e=O(),o=F(13,"Crush, Confuse, Conquer","A symphony of chaos!");e.player=L(0,6),e.goal=E(12,6),e.monsters=[f(4,6),f(8,6),f(11,6)],e.bonuses=[P(2,6,d.Crusher),P(6,6,d.ConfusedMonsters)];for(let t=3;t<12;t++)t!==6&&t!==9&&(e.obstacles.push(m(t,5)),e.obstacles.push(m(t,7)));return[e,o,o.levelStory]},Lo=()=>{const e=O(),o=F(14,"The Triple Threat","Build, Bomb, and Vanish!");e.player=L(0,7),e.goal=E(13,7),e.monsters=[f(3,7),f(6,7),f(9,7),f(12,7)],e.bonuses=[P(2,7,d.Builder),P(5,7,d.TimeBomb),P(8,7,d.CapOfInvisibility)];for(let t=4;t<13;t++)t!==5&&t!==8&&t!==11&&(e.obstacles.push(m(t,6)),e.obstacles.push(m(t,8)));return[e,o,o.levelStory]},Oo=()=>{const e=O(),o=F(15,"The Gauntlet","Use everything you've learned!");e.player=L(0,7),e.goal=E(14,7),e.monsters=[f(3,7),f(6,7),f(9,7),f(12,7),f(7,3),f(7,11)],e.bonuses=[P(2,7,d.LandMine),P(2,8,d.CapOfInvisibility),P(5,7,d.Crusher),P(8,7,d.ConfusedMonsters),P(1,6,d.Builder),P(2,6,d.TimeBomb)];for(let t=4;t<14;t++)t!==5&&t!==8&&t!==11&&(e.obstacles.push(m(t,6)),e.obstacles.push(m(t,8)));for(let t=4;t<11;t++)t!==7&&(e.obstacles.push(m(6,t)),e.obstacles.push(m(8,t)));return[e,o,o.levelStory]},Fo=()=>{const e=O(),o=F(16,"The Final Countdown","Can you outsmart them all?");e.player=L(0,8),e.goal=E(15,8),e.monsters=[f(5,8),f(6,8),f(9,8),f(12,8),f(8,3),f(8,13),f(15,3),f(15,13)],e.bonuses=[P(2,8,d.CapOfInvisibility),P(5,8,d.TimeBomb),P(8,8,d.LandMine),P(11,1,d.Crusher),P(14,14,d.ConfusedMonsters)];for(let t=4;t<15;t++)t!==5&&t!==8&&t!==11&&t!==14&&(e.obstacles.push(m(t,7)),e.obstacles.push(m(t,9)));for(let t=4;t<13;t++)t!==8&&(e.obstacles.push(m(7,t)),e.obstacles.push(m(9,t)));return e.obstacles.push(m(14,8)),[e,o,o.levelStory]},E=(e,o)=>({x:e,y:o}),P=(e,o,t)=>({position:E(e,o),type:t}),f=(e,o)=>({position:E(e,o),previousPosition:E(e,o),moveTimestamp:Date.now(),path:[],seed:Math.random(),isConfused:!1}),L=(e,o)=>({position:E(e,o),previousPosition:E(e,o),moveTimestamp:Date.now(),isInvisible:!1,isVictorious:!1,isVanishing:!1,isClimbing:!1}),m=(e,o)=>({position:E(e,o),creationTime:Date.now(),isRaising:!1,isDestroying:!1}),O=()=>({player:L(0,0),goal:E(0,0),obstacles:[],monsters:[],steps:0,monsterSpawnSteps:0,bonuses:[],activeBonuses:[],explosions:[],timeBombs:[],landMines:[],crusherActive:!1,builderActive:!1,score:0,gameEndingState:"none"}),Ro=40,F=(e,o,t)=>({gridSize:e,cellSize:Ro,initialMonsterCount:0,obstacleCount:0,initialBonusCount:0,levelName:o,levelStory:t}),Go={1:Mo,2:Po,3:jo,4:ko,5:Io,6:So,7:Eo,8:Ao,9:Do,10:Bo,11:Lo,12:Oo,13:Fo},No=e=>{if(e<1||e>13)throw new Error(`Invalid level number: ${e}`);return Go[e]()};class xo{constructor(){se(this,"audioContext");se(this,"masterVolume",.025);this.audioContext=new(window.AudioContext||window.webkitAudioContext)}createOscillator(o,t,s){const n=this.audioContext.createOscillator();return n.type=t,n.frequency.setValueAtTime(o,this.audioContext.currentTime),n.start(),n.stop(this.audioContext.currentTime+s),n}createGain(o,t,s=1){const n=this.audioContext.createGain(),i=s*this.masterVolume;return n.gain.setValueAtTime(0,this.audioContext.currentTime),n.gain.linearRampToValueAtTime(i,this.audioContext.currentTime+o),n.gain.linearRampToValueAtTime(0,this.audioContext.currentTime+o+t),n}playStep(){const o=this.createOscillator(200,"square",.1),t=this.createGain(.01,.09);o.connect(t).connect(this.audioContext.destination)}playElectricalDischarge(){const o=this.createOscillator(800,"sawtooth",.2),t=this.createGain(.01,.19);o.frequency.linearRampToValueAtTime(200,this.audioContext.currentTime+.2),o.connect(t).connect(this.audioContext.destination)}playBonusCollected(){const o=this.createOscillator(600,"sine",.15),t=this.createGain(.01,.14);o.frequency.linearRampToValueAtTime(800,this.audioContext.currentTime+.15),o.connect(t).connect(this.audioContext.destination)}playExplosion(){const o=this.audioContext.createBufferSource(),t=this.audioContext.sampleRate*.5,s=this.audioContext.createBuffer(1,t,this.audioContext.sampleRate),n=s.getChannelData(0);for(let l=0;l<t;l++)n[l]=Math.random()*2-1;o.buffer=s;const i=this.createGain(.01,.49,.5);o.connect(i).connect(this.audioContext.destination),o.start()}playStateTransition(){const o=this.createOscillator(300,"triangle",.3),t=this.createGain(.05,.25);o.frequency.linearRampToValueAtTime(600,this.audioContext.currentTime+.3),o.connect(t).connect(this.audioContext.destination)}playGameOver(){const o=this.createOscillator(440,"sine",1),t=this.createGain(.01,.99);o.frequency.linearRampToValueAtTime(220,this.audioContext.currentTime+1),o.connect(t).connect(this.audioContext.destination)}playLevelComplete(){const o=this.createOscillator(440,"sine",.5),t=this.createOscillator(550,"sine",.5),s=this.createGain(.01,.49),n=this.createGain(.01,.49);o.connect(s).connect(this.audioContext.destination),t.connect(n).connect(this.audioContext.destination),setTimeout(()=>{const i=this.createOscillator(660,"sine",.5),l=this.createGain(.01,.49);i.connect(l).connect(this.audioContext.destination)},250)}playMonsterSpawn(){const o=this.createOscillator(100,"sawtooth",.3),t=this.createGain(.01,.29);o.frequency.exponentialRampToValueAtTime(300,this.audioContext.currentTime+.3),o.connect(t).connect(this.audioContext.destination)}}const R=new xo,Vo=(e,o,t)=>{if(_(o))return o;const s=ro(e.key);return s!==null?Te(s,o,t):{...o}},Te=(e,o,t)=>{if(_(o))return o;const s={...o},n=s.player.position,i=H(s.player.position,e);if(s.obstacles=o.obstacles.filter(l=>!l.isDestroying||Date.now()-l.creationTime<me),o.crusherActive&&o.obstacles.find(l=>N(i,l.position))&&(s.obstacles=o.obstacles.map(l=>N(i,l.position)?{...l,isDestroying:!0,creationTime:Date.now()}:l),R.playElectricalDischarge()),ge(i,s,t)){if(R.playStep(),s.player.position=i,Date.now()-s.player.moveTimestamp>ie&&(s.player.previousPosition=n,s.player.moveTimestamp=Date.now()),s.steps++,s.monsterSpawnSteps++,N(i,s.goal))return s.gameEndingState="levelComplete",Yo(s),s.score+=Wo(s),s;const l=s.bonuses.find(r=>N(r.position,i));if(l&&(R.playBonusCollected(),s.bonuses=s.bonuses.filter(r=>!N(r.position,i)),$o(s,l.type)),s.monsterSpawnSteps>=13&&(Ho(s,t),s.monsterSpawnSteps=0,R.playMonsterSpawn()),s.monsters=uo(s.monsters,s.player.position,t.gridSize,s.obstacles,s.activeBonuses.some(r=>r.type===d.CapOfInvisibility),s.activeBonuses.some(r=>r.type===d.ConfusedMonsters)),vo(s.player.position,s.monsters))return s.gameEndingState="gameOver",ue(s),s;const[a,c]=wo(s.monsters,s.landMines);s.monsters=a,s.explosions=c,s.timeBombs=s.timeBombs.map(r=>({...r,timer:r.timer-1}));const h=s.timeBombs.filter(r=>r.timer===0);if((h.length>0||c.length>0)&&R.playExplosion(),s.explosions=[...s.explosions,...h.map(r=>({position:r.position,startTime:Date.now(),duration:1e3}))],s.timeBombs=s.timeBombs.filter(r=>r.timer>0),s.monsters=s.monsters.filter(r=>!s.explosions.some(p=>Co(r,p))),s.obstacles=s.obstacles.map(r=>ne(r.position,s.explosions)?{...r,isDestroying:!0,creationTime:Date.now()}:r),s.bonuses=s.bonuses.filter(r=>!ne(r.position,s.explosions)),ne(s.player.position,s.explosions))return s.gameEndingState="gameOver",ue(s),s;if(s.activeBonuses=s.activeBonuses.map(r=>({...r,duration:r.duration-1})).filter(r=>r.duration>0),s.builderActive=s.activeBonuses.some(r=>r.type===d.Builder),s.crusherActive=s.activeBonuses.some(r=>r.type===d.Crusher),s.player.isClimbing=s.activeBonuses.some(r=>r.type===d.Climber),o.builderActive){const r={position:n,creationTime:Date.now(),isRaising:!0,isDestroying:!1};oe(r.position,s.obstacles.map(({position:p})=>p))||(s.obstacles.push(r),R.playElectricalDischarge())}}return s},$o=(e,o)=>{const t={type:o,duration:13};switch(e.activeBonuses.push(t),o){case d.CapOfInvisibility:break;case d.ConfusedMonsters:break;case d.LandMine:e.landMines.push({...e.player.position});break;case d.TimeBomb:e.timeBombs.push({position:e.player.position,timer:13,shakeIntensity:0});break;case d.Crusher:e.crusherActive=!0;break;case d.Builder:e.builderActive=!0;break;case d.Climber:e.player.isClimbing=!0;break}},Wo=e=>100-e.steps+e.monsters.length*10,Ho=(e,{gridSize:o})=>{let t;do t=Xo(o,o);while(N(t,e.player.position)||N(t,e.goal)||oe(t,e.obstacles.filter(s=>!s.isDestroying).map(({position:s})=>s))||oe(t,e.monsters.map(s=>s.position)));e.monsters.push({position:t,previousPosition:t,moveTimestamp:Date.now(),path:[],seed:Math.random(),isConfused:!1})},Xo=(e,o)=>({x:Math.floor(Math.random()*e),y:Math.floor(Math.random()*o)}),_=e=>e.gameEndingState!=="none",ue=e=>{e.player.isVanishing=!0,R.playGameOver()},Yo=e=>{e.player.isVictorious=!0,R.playLevelComplete()},qo=({level:e,score:o,steps:t})=>u.jsxs("div",{className:"hud",children:[u.jsxs("div",{children:["Level: ",e]}),u.jsxs("div",{children:["Score: ",o]}),u.jsxs("div",{children:["Steps: ",t]})]}),Uo=13,_o=2e3,Ko=({level:e,score:o,onGameOver:t,onLevelComplete:s,onGameComplete:n,updateScore:i,updateSteps:l})=>{const a=D.useRef(null),[[c,h,r],p]=D.useState(()=>No(e)),[b,g]=D.useState(!0),C=y=>{p([y,h,r]),i(y.score),l(y.steps)};return D.useEffect(()=>{c.gameEndingState!=="none"&&setTimeout(()=>{c.gameEndingState==="levelComplete"&&(e===Uo?n():s()),c.gameEndingState==="gameOver"&&t()},_o)},[c.gameEndingState]),D.useEffect(()=>{if(!c||!h)return;const y=a.current;let v;if(y){const S=(h.gridSize+h.gridSize)*h.cellSize,I=(h.gridSize+h.gridSize)*h.cellSize/2;y.width=S,y.height=I+100;const k=y.getContext("2d");if(k){const A=()=>{be(k,c,h),_(c)||ho(k,ve(c,h),h.gridSize,h.cellSize),v=requestAnimationFrame(A)};A()}}return()=>{v!==null&&cancelAnimationFrame(v)}},[c,h,b]),D.useEffect(()=>{if(!c||!h)return;const y=S=>{if(b){g(!1);return}if(!_(c)){const I=Vo(S,c,h);C(I)}},v=S=>{if(b){g(!1);return}if(_(c))return;const I=a.current;if(!I)return;const k=I.getBoundingClientRect(),A=lo((S.clientX-k.left)*(I.width/k.width)-I.width/2,(S.clientY-k.top)*(I.height/k.height)-100,c,h);A&&C(Te(A.direction,c,h))};return window.addEventListener("click",v),window.addEventListener("keydown",y),()=>{window.removeEventListener("click",v),window.removeEventListener("keydown",y)}},[c,h,b,t,s,i,l]),b?u.jsxs("div",{className:"level-story",children:[u.jsxs("h2",{children:["Level ",e]}),u.jsx("p",{children:r}),u.jsx("p",{children:"Press any key to start..."})]}):u.jsxs("div",{className:"gameplay",children:[u.jsx(qo,{level:e,score:o,steps:(c==null?void 0:c.monsterSpawnSteps)||0}),u.jsx("div",{className:"canvas-container",children:u.jsx("canvas",{ref:a})})]})},Qo=({score:e,steps:o,onTryAgain:t,onQuit:s})=>u.jsxs("div",{className:"game-over",children:[u.jsx("h1",{children:"Game Over"}),u.jsxs("p",{children:["Your score: ",e]}),u.jsxs("p",{children:["Steps taken: ",o]}),u.jsx("button",{onClick:t,children:"Try Again"}),u.jsx("button",{onClick:s,children:"Quit"})]}),Zo=({level:e,onNextLevel:o,onQuit:t})=>u.jsxs("div",{className:"level-complete",children:[u.jsxs("h1",{children:["Level ",e," Complete!"]}),u.jsx("p",{children:"Congratulations! You've completed the level."}),u.jsx("button",{onClick:o,children:"Next Level"}),u.jsx("button",{onClick:t,children:"Quit"})]});function ot(){const[e,o]=D.useState(0),[t,s]=D.useState(parseInt(document.location.hash.split("level")[1]??"1")),[n,i]=D.useState(0),[l,a]=D.useState(0),c=D.useCallback(()=>{o(2)},[]),h=()=>{o(1)},r=()=>{s(1),i(0),a(0),o(2)},p=()=>{o(2)},b=()=>{o(0)},g=()=>{o(3)},C=()=>{s(t+1),o(4)},y=D.useCallback(()=>{o(2)},[]),v=()=>{R.playLevelComplete(),o(5)},S=k=>i(k),I=k=>a(k);return D.useEffect(()=>{const k=A=>{A.key==="ArrowRight"?e===0?c():e===4?y():e===3?p():e===5&&r():A.key==="Escape"&&(e===1||e===3||e===5)&&b()};return window.addEventListener("keydown",k),()=>{window.removeEventListener("keydown",k)}},[e,c,y]),u.jsxs("div",{className:"game-container",children:[e===0&&u.jsx(io,{onStart:c,onInstructions:h}),e===1&&u.jsx(ao,{onBack:b}),e===2&&u.jsx(Ko,{level:t,score:n,onGameOver:g,onLevelComplete:C,onGameComplete:v,updateScore:S,updateSteps:I}),e===3&&u.jsx(Qo,{score:n,steps:l,onTryAgain:p,onQuit:b}),e===4&&u.jsx(Zo,{level:t,onNextLevel:y,onQuit:b}),e===5&&u.jsx(Jo,{score:n,steps:l,onPlayAgain:r,onQuit:b})]})}function Jo({score:e,steps:o,onPlayAgain:t,onQuit:s}){return u.jsxs("div",{className:"game-complete intro",children:[u.jsx("h1",{className:"game-title",children:"Monster Steps"}),u.jsx("h2",{className:"game-complete-subtitle",children:"Congratulations!"}),u.jsxs("div",{className:"game-complete-stats",children:[u.jsxs("p",{children:["Final Score: ",e]}),u.jsxs("p",{children:["Total Steps: ",o]})]}),u.jsxs("div",{className:"intro-buttons",children:[u.jsx("button",{onClick:t,children:"Play Again"}),u.jsx("button",{onClick:s,children:"Quit"})]}),u.jsx("p",{className:"intro-tip",children:"Press right arrow to play again"})]})}export{ot as MonsterStepsApp};
