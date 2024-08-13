import{c as w,g as On,r as b,j as f,R as $,u as It,a as Pn,b as $n}from"./index-BiismDRO.js";import{d as F,m as ae,f as Nn}from"./styled-components.browser.esm-BquFx6yB.js";const Me=20,ee=Me*1.5,pe=5,L=20,Un=1,Yn=5,zn=L/Yn,Tt=.5,Dt=500,K=.05,ge=5,Gn=4,le=60,A=16,j=A*5,_t=1e3,ke=j*4,Hn=10,qn=Me/10,Xn=0,Vn=.1,Wn=.1,_=10;var v=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(v||{}),St=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(St||{}),M=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(M||{}),S=(t=>(t.ATTACK="ATTACK",t.DEFENCE="DEFENCE",t))(S||{});function Kn(t,e){const n=[];for(let s=0;s<e;s++)for(let i=0;i<t;i++)n.push({id:`${i*A},${s*A}`,position:{x:i*A,y:s*A},rect:{left:i*A,top:s*A,right:(i+1)*A,bottom:(s+1)*A},type:M.WATER,depth:0,height:0,population:0});return n}function Zn(t,e,n){const s=[],i=Array(n).fill(null).map(()=>Array(e).fill(!1));for(let a=0;a<n;a++)for(let o=0;o<e;o++){const r=a*e+o;t[r].type===M.WATER&&Jn(o,a,e,n,t)&&(s.push([o,a,0]),i[a][o]=!0)}for(;s.length>0;){const[a,o,r]=s.shift(),l=o*e+a;t[l].type===M.WATER?t[l].depth=r+(Math.random()-Math.random())/5:t[l].type===M.GROUND&&(t[l].height=Math.sqrt(r)+(Math.random()-Math.random())/10);const u=[[-1,0],[1,0],[0,-1],[0,1]];for(const[c,d]of u){const m=a+c,h=o+d;Mt(m,h,e,n)&&!i[h][m]&&(s.push([m,h,r+1]),i[h][m]=!0)}}}function Jn(t,e,n,s,i){return[[-1,0],[1,0],[0,-1],[0,1]].some(([o,r])=>{const l=t+o,u=e+r;if(Mt(l,u,n,s)){const c=u*n+l;return i[c].type===M.GROUND}return!1})}function Mt(t,e,n,s){return t>=0&&t<n&&e>=0&&e<s}var kt={exports:{}},Qn=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(t){var e=Qn,n=e.filter(function(i){return!!i.css}),s=e.filter(function(i){return!!i.vga});t.exports=function(i){var a=t.exports.get(i);return a&&a.value},t.exports.get=function(i){return i=i||"",i=i.trim().toLowerCase(),e.filter(function(a){return a.name.toLowerCase()===i}).pop()},t.exports.all=t.exports.get.all=function(){return e},t.exports.get.css=function(i){return i?(i=i||"",i=i.trim().toLowerCase(),n.filter(function(a){return a.name.toLowerCase()===i}).pop()):n},t.exports.get.vga=function(i){return i?(i=i||"",i=i.trim().toLowerCase(),s.filter(function(a){return a.name.toLowerCase()===i}).pop()):s}})(kt);var es=kt.exports,ts=1/0,ns="[object Symbol]",ss=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,wt="\\ud800-\\udfff",is="\\u0300-\\u036f\\ufe20-\\ufe23",as="\\u20d0-\\u20f0",Bt="\\u2700-\\u27bf",Lt="a-z\\xdf-\\xf6\\xf8-\\xff",os="\\xac\\xb1\\xd7\\xf7",rs="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",ls="\\u2000-\\u206f",cs=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",Rt="A-Z\\xc0-\\xd6\\xd8-\\xde",us="\\ufe0e\\ufe0f",jt=os+rs+ls+cs,Ot="['’]",Ue="["+jt+"]",ds="["+is+as+"]",Pt="\\d+",ms="["+Bt+"]",$t="["+Lt+"]",Nt="[^"+wt+jt+Pt+Bt+Lt+Rt+"]",hs="\\ud83c[\\udffb-\\udfff]",fs="(?:"+ds+"|"+hs+")",ps="[^"+wt+"]",Ut="(?:\\ud83c[\\udde6-\\uddff]){2}",Yt="[\\ud800-\\udbff][\\udc00-\\udfff]",G="["+Rt+"]",gs="\\u200d",Ye="(?:"+$t+"|"+Nt+")",vs="(?:"+G+"|"+Nt+")",ze="(?:"+Ot+"(?:d|ll|m|re|s|t|ve))?",Ge="(?:"+Ot+"(?:D|LL|M|RE|S|T|VE))?",zt=fs+"?",Gt="["+us+"]?",ys="(?:"+gs+"(?:"+[ps,Ut,Yt].join("|")+")"+Gt+zt+")*",Es=Gt+zt+ys,bs="(?:"+[ms,Ut,Yt].join("|")+")"+Es,xs=RegExp([G+"?"+$t+"+"+ze+"(?="+[Ue,G,"$"].join("|")+")",vs+"+"+Ge+"(?="+[Ue,G+Ye,"$"].join("|")+")",G+"?"+Ye+"+"+ze,G+"+"+Ge,Pt,bs].join("|"),"g"),Fs=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,Cs=typeof w=="object"&&w&&w.Object===Object&&w,As=typeof self=="object"&&self&&self.Object===Object&&self,Is=Cs||As||Function("return this")();function Ts(t){return t.match(ss)||[]}function Ds(t){return Fs.test(t)}function _s(t){return t.match(xs)||[]}var Ss=Object.prototype,Ms=Ss.toString,He=Is.Symbol,qe=He?He.prototype:void 0,Xe=qe?qe.toString:void 0;function ks(t){if(typeof t=="string")return t;if(Bs(t))return Xe?Xe.call(t):"";var e=t+"";return e=="0"&&1/t==-ts?"-0":e}function ws(t){return!!t&&typeof t=="object"}function Bs(t){return typeof t=="symbol"||ws(t)&&Ms.call(t)==ns}function Ls(t){return t==null?"":ks(t)}function Rs(t,e,n){return t=Ls(t),e=n?void 0:e,e===void 0?Ds(t)?_s(t):Ts(t):t.match(e)||[]}var js=Rs,Os=1/0,Ps="[object Symbol]",$s=/^\s+/,we="\\ud800-\\udfff",Ht="\\u0300-\\u036f\\ufe20-\\ufe23",qt="\\u20d0-\\u20f0",Xt="\\ufe0e\\ufe0f",Ns="["+we+"]",ve="["+Ht+qt+"]",ye="\\ud83c[\\udffb-\\udfff]",Us="(?:"+ve+"|"+ye+")",Vt="[^"+we+"]",Wt="(?:\\ud83c[\\udde6-\\uddff]){2}",Kt="[\\ud800-\\udbff][\\udc00-\\udfff]",Zt="\\u200d",Jt=Us+"?",Qt="["+Xt+"]?",Ys="(?:"+Zt+"(?:"+[Vt,Wt,Kt].join("|")+")"+Qt+Jt+")*",zs=Qt+Jt+Ys,Gs="(?:"+[Vt+ve+"?",ve,Wt,Kt,Ns].join("|")+")",Hs=RegExp(ye+"(?="+ye+")|"+Gs+zs,"g"),qs=RegExp("["+Zt+we+Ht+qt+Xt+"]"),Xs=typeof w=="object"&&w&&w.Object===Object&&w,Vs=typeof self=="object"&&self&&self.Object===Object&&self,Ws=Xs||Vs||Function("return this")();function Ks(t){return t.split("")}function Zs(t,e,n,s){for(var i=t.length,a=n+-1;++a<i;)if(e(t[a],a,t))return a;return-1}function Js(t,e,n){if(e!==e)return Zs(t,Qs,n);for(var s=n-1,i=t.length;++s<i;)if(t[s]===e)return s;return-1}function Qs(t){return t!==t}function ei(t,e){for(var n=-1,s=t.length;++n<s&&Js(e,t[n],0)>-1;);return n}function ti(t){return qs.test(t)}function Ve(t){return ti(t)?ni(t):Ks(t)}function ni(t){return t.match(Hs)||[]}var si=Object.prototype,ii=si.toString,We=Ws.Symbol,Ke=We?We.prototype:void 0,Ze=Ke?Ke.toString:void 0;function ai(t,e,n){var s=-1,i=t.length;e<0&&(e=-e>i?0:i+e),n=n>i?i:n,n<0&&(n+=i),i=e>n?0:n-e>>>0,e>>>=0;for(var a=Array(i);++s<i;)a[s]=t[s+e];return a}function en(t){if(typeof t=="string")return t;if(li(t))return Ze?Ze.call(t):"";var e=t+"";return e=="0"&&1/t==-Os?"-0":e}function oi(t,e,n){var s=t.length;return n=n===void 0?s:n,!e&&n>=s?t:ai(t,e,n)}function ri(t){return!!t&&typeof t=="object"}function li(t){return typeof t=="symbol"||ri(t)&&ii.call(t)==Ps}function ci(t){return t==null?"":en(t)}function ui(t,e,n){if(t=ci(t),t&&(n||e===void 0))return t.replace($s,"");if(!t||!(e=en(e)))return t;var s=Ve(t),i=ei(s,Ve(e));return oi(s,i).join("")}var di=ui,Ee=1/0,mi=9007199254740991,hi=17976931348623157e292,Je=NaN,fi="[object Symbol]",pi=/^\s+|\s+$/g,gi=/^[-+]0x[0-9a-f]+$/i,vi=/^0b[01]+$/i,yi=/^0o[0-7]+$/i,Be="\\ud800-\\udfff",tn="\\u0300-\\u036f\\ufe20-\\ufe23",nn="\\u20d0-\\u20f0",sn="\\ufe0e\\ufe0f",Ei="["+Be+"]",be="["+tn+nn+"]",xe="\\ud83c[\\udffb-\\udfff]",bi="(?:"+be+"|"+xe+")",an="[^"+Be+"]",on="(?:\\ud83c[\\udde6-\\uddff]){2}",rn="[\\ud800-\\udbff][\\udc00-\\udfff]",ln="\\u200d",cn=bi+"?",un="["+sn+"]?",xi="(?:"+ln+"(?:"+[an,on,rn].join("|")+")"+un+cn+")*",Fi=un+cn+xi,Ci="(?:"+[an+be+"?",be,on,rn,Ei].join("|")+")",Fe=RegExp(xe+"(?="+xe+")|"+Ci+Fi,"g"),Ai=RegExp("["+ln+Be+tn+nn+sn+"]"),Ii=parseInt,Ti=typeof w=="object"&&w&&w.Object===Object&&w,Di=typeof self=="object"&&self&&self.Object===Object&&self,_i=Ti||Di||Function("return this")(),Si=ki("length");function Mi(t){return t.split("")}function ki(t){return function(e){return e==null?void 0:e[t]}}function Le(t){return Ai.test(t)}function dn(t){return Le(t)?Bi(t):Si(t)}function wi(t){return Le(t)?Li(t):Mi(t)}function Bi(t){for(var e=Fe.lastIndex=0;Fe.test(t);)e++;return e}function Li(t){return t.match(Fe)||[]}var Ri=Object.prototype,ji=Ri.toString,Qe=_i.Symbol,Oi=Math.ceil,Pi=Math.floor,et=Qe?Qe.prototype:void 0,tt=et?et.toString:void 0;function nt(t,e){var n="";if(!t||e<1||e>mi)return n;do e%2&&(n+=t),e=Pi(e/2),e&&(t+=t);while(e);return n}function $i(t,e,n){var s=-1,i=t.length;e<0&&(e=-e>i?0:i+e),n=n>i?i:n,n<0&&(n+=i),i=e>n?0:n-e>>>0,e>>>=0;for(var a=Array(i);++s<i;)a[s]=t[s+e];return a}function mn(t){if(typeof t=="string")return t;if(hn(t))return tt?tt.call(t):"";var e=t+"";return e=="0"&&1/t==-Ee?"-0":e}function Ni(t,e,n){var s=t.length;return n=n===void 0?s:n,!e&&n>=s?t:$i(t,e,n)}function Ui(t,e){e=e===void 0?" ":mn(e);var n=e.length;if(n<2)return n?nt(e,t):e;var s=nt(e,Oi(t/dn(e)));return Le(e)?Ni(wi(s),0,t).join(""):s.slice(0,t)}function st(t){var e=typeof t;return!!t&&(e=="object"||e=="function")}function Yi(t){return!!t&&typeof t=="object"}function hn(t){return typeof t=="symbol"||Yi(t)&&ji.call(t)==fi}function zi(t){if(!t)return t===0?t:0;if(t=Hi(t),t===Ee||t===-Ee){var e=t<0?-1:1;return e*hi}return t===t?t:0}function Gi(t){var e=zi(t),n=e%1;return e===e?n?e-n:e:0}function Hi(t){if(typeof t=="number")return t;if(hn(t))return Je;if(st(t)){var e=typeof t.valueOf=="function"?t.valueOf():t;t=st(e)?e+"":e}if(typeof t!="string")return t===0?t:+t;t=t.replace(pi,"");var n=vi.test(t);return n||yi.test(t)?Ii(t.slice(2),n?2:8):gi.test(t)?Je:+t}function qi(t){return t==null?"":mn(t)}function Xi(t,e,n){t=qi(t),e=Gi(e);var s=e?dn(t):0;return e&&s<e?t+Ui(e-s,n):t}var Vi=Xi,Wi=(t,e,n,s)=>{const i=(t+(s||"")).toString().includes("%");if(typeof t=="string"?[t,e,n,s]=t.match(/(0?\.?\d{1,3})%?\b/g).map(Number):s!==void 0&&(s=parseFloat(s)),typeof t!="number"||typeof e!="number"||typeof n!="number"||t>255||e>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof s=="number"){if(!i&&s>=0&&s<=1)s=Math.round(255*s);else if(i&&s>=0&&s<=100)s=Math.round(255*s/100);else throw new TypeError(`Expected alpha value (${s}) as a fraction or percentage`);s=(s|256).toString(16).slice(1)}else s="";return(n|e<<8|t<<16|1<<24).toString(16).slice(1)+s};const q="a-f\\d",Ki=`#?[${q}]{3}[${q}]?`,Zi=`#?[${q}]{6}([${q}]{2})?`,Ji=new RegExp(`[^#${q}]`,"gi"),Qi=new RegExp(`^${Ki}$|^${Zi}$`,"i");var ea=(t,e={})=>{if(typeof t!="string"||Ji.test(t)||!Qi.test(t))throw new TypeError("Expected a valid hex string");t=t.replace(/^#/,"");let n=1;t.length===8&&(n=Number.parseInt(t.slice(6,8),16)/255,t=t.slice(0,6)),t.length===4&&(n=Number.parseInt(t.slice(3,4).repeat(2),16)/255,t=t.slice(0,3)),t.length===3&&(t=t[0]+t[0]+t[1]+t[1]+t[2]+t[2]);const s=Number.parseInt(t,16),i=s>>16,a=s>>8&255,o=s&255,r=typeof e.alpha=="number"?e.alpha:n;if(e.format==="array")return[i,a,o,r];if(e.format==="css"){const l=r===1?"":` / ${Number((r*100).toFixed(2))}%`;return`rgb(${i} ${a} ${o}${l})`}return{red:i,green:a,blue:o,alpha:r}},ta=es,na=js,sa=di,ia=Vi,aa=Wi,fn=ea;const ce=.75,ue=.25,de=16777215,oa=49979693;var ra=function(t){return"#"+ua(String(JSON.stringify(t)))};function la(t){var e=na(t),n=[];return e.forEach(function(s){var i=ta(s);i&&n.push(fn(sa(i,"#"),{format:"array"}))}),n}function ca(t){var e=[0,0,0];return t.forEach(function(n){for(var s=0;s<3;s++)e[s]+=n[s]}),[e[0]/t.length,e[1]/t.length,e[2]/t.length]}function ua(t){var e,n=la(t);n.length>0&&(e=ca(n));var s=1,i=0,a=1;if(t.length>0)for(var o=0;o<t.length;o++)t[o].charCodeAt(0)>i&&(i=t[o].charCodeAt(0)),a=parseInt(de/i),s=(s+t[o].charCodeAt(0)*a*oa)%de;var r=(s*t.length%de).toString(16);r=ia(r,6,r);var l=fn(r,{format:"array"});return e?aa(ue*l[0]+ce*e[0],ue*l[1]+ce*e[1],ue*l[2]+ce*e[2]):r}const da=On(ra);function ma(t){return[...ha].sort(()=>Math.random()-Math.random()).slice(0,t)}const ha=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function pn(t){return[...fa].sort(()=>Math.random()-Math.random()).slice(0,t)}const fa=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];function pa(){const t=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],e=Array.from({length:256},(i,a)=>a).sort(()=>Math.random()-.5),n=[...e,...e];function s(i,a,o){return i[0]*a+i[1]*o}return function(a,o){const r=Math.floor(a)&255,l=Math.floor(o)&255;a-=Math.floor(a),o-=Math.floor(o);const u=a*a*a*(a*(a*6-15)+10),c=o*o*o*(o*(o*6-15)+10),d=n[r]+l,m=n[r+1]+l;return(1+(s(t[n[d]&7],a,o)*(1-u)+s(t[n[m]&7],a-1,o)*u)*(1-c)+(s(t[n[d+1]&7],a,o-1)*(1-u)+s(t[n[m+1]&7],a-1,o-1)*u)*c)/2}}function Ce(t,e,n,s,i){const a=pa(),o=Math.floor(t.x/A),r=Math.floor(t.y/A),l=Math.floor(s/4),u=.5,c=.005,d=.7;for(let h=r-l;h<=r+l;h++)for(let p=o-l;p<=o+l;p++)if(p>=0&&p<s&&h>=0&&h<i){let g=p,y=h;for(let C=0;C<e;C++)Math.random()<d&&(g+=Math.random()>.5?1:-1,y+=Math.random()>.5?1:-1);g=Math.max(0,Math.min(s-1,g)),y=Math.max(0,Math.min(i-1,y));const x=Math.sqrt((g-o)*(g-o)+(y-r)*(y-r))/l,E=a(p*c,h*c);if(x<1&&E>u+x*.01){const C=h*s+p;n[C].type=M.GROUND,n[C].depth=void 0,n[C].height=(1-x)*2*(E-u)}}const m=Math.min(Math.max(r*s+o,0),s);n[m].type=M.GROUND,n[m].depth=void 0,n[m].height=1}function ga(t,e){return{x:Math.floor(Math.random()*(t*.8)+t*.1)*A,y:Math.floor(Math.random()*(e*.8)+e*.1)*A}}function va(t,e,n,s){if(t.x<0||t.y<0||t.x>=n||t.y>=s)return!1;const i=Math.floor(n/(Math.sqrt(e.length+1)*2));return e.every(a=>Math.abs(t.x-a.x)>i||Math.abs(t.y-a.y)>i)}function ya(t,e,n){return e.every(s=>Math.sqrt(Math.pow(t.x-s.position.x,2)+Math.pow(t.y-s.position.y,2))>=n)}function Ea(t,e,n,s,i){const a=[],o=[],r=[],l=L*3,u=pn(t*2).filter(h=>h!==e),c=5,d=ma(t*c*2),m=[];for(let h=0;h<t;h++){const p=`state-${h+1}`,g=h===0?e:u.pop(),y=ba(p,g,h===0);a.push(y),a.forEach(E=>{y.strategies[E.id]=v.NEUTRAL,E.strategies[p]=v.NEUTRAL});const x=xa(m,n,s);m.push(x),Ce(x,n/2,i,n,s),Fa(p,x,c,d,o,r,l,i,n,s),y.population=o.filter(E=>E.stateId===p).reduce((E,C)=>E+C.population,0)}return Ca(i,o),{states:a,cities:o,launchSites:r}}function ba(t,e,n){return{id:t,name:e,color:da(e),isPlayerControlled:n,strategies:{},lastStrategyUpdate:0,generalStrategy:n?void 0:[v.NEUTRAL,v.HOSTILE,v.FRIENDLY].sort(()=>Math.random()-.5)[0],population:0}}function xa(t,e,n){let s,i=10;do if(s=ga(e,n),i--<=0)break;while(!va(s,t,e,n));return s}function Fa(t,e,n,s,i,a,o,r,l,u){const c=[];for(let d=0;d<n;d++){const m=it(e,c,o,30*A);c.push({position:m}),i.push({id:`city-${i.length+1}`,stateId:t,name:s.pop(),position:m,population:Math.floor(Math.random()*3e3)+1e3}),Ce(m,2,r,l,u)}for(const d of i){const m=r.filter(h=>{const p=h.position.x-d.position.x,g=h.position.y-d.position.y;return Math.sqrt(p*p+g*g)<j});for(const h of m){h.cityId=d.id;const p=h.position.x-d.position.x,g=h.position.y-d.position.y,y=Math.sqrt(p*p+g*g);h.population=Math.max(0,j-y)/j*_t}d.population=m.reduce((h,p)=>h+p.population,0)}for(let d=0;d<4;d++){const m=it(e,c,o,15*A);c.push({position:m}),a.push({type:St.LAUNCH_SITE,id:`launch-site-${a.length+1}`,stateId:t,position:m,mode:Math.random()>.5?S.DEFENCE:S.ATTACK}),Ce(m,1,r,l,u)}return c}function it(t,e,n,s){let i,a=10;do if(i={x:t.x+(Math.random()-.5)*s,y:t.y+(Math.random()-.5)*s},a--<=0)break;while(!ya(i,e,n));return i}function Ca(t,e){const n=new Map(t.map(i=>[i.id,i])),s=[];for(e.forEach(i=>{t.filter(o=>o.cityId===i.id).forEach(o=>{o.stateId=i.stateId,s.push(o)})});s.length>0;){const i=s.splice(0,1)[0];Aa(i,n).forEach(o=>{!o.stateId&&o.type===M.GROUND&&(o.stateId=i.stateId,s.push(o))})}}function Aa(t,e){const n=[];return[{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:-1},{dx:0,dy:1}].forEach(({dx:i,dy:a})=>{const o=`${t.position.x+i*A},${t.position.y+a*A}`,r=e.get(o);r&&n.push(r)}),n}function gn(t){return Object.fromEntries(t.states.map(e=>[e.id,e.population]))}function ne(t){return t>=1e3?`${(t/1e3).toFixed(1)}M`:`${t.toFixed(0)}K`}function Ia(t,e){const n=[],s=new Map;t.forEach(a=>{s.set(`${a.position.x},${a.position.y}`,a)});const i=(a,o)=>{const r=s.get(`${o.x},${o.y}`);if(r&&r.stateId&&r.stateId!==e.id){const l=n.find(()=>a.id===r.id)??{...a,adjacentStateIds:new Set};n.includes(l)||n.push(l),l.adjacentStateIds.add(r.stateId)}};return t.forEach(a=>{a.stateId===e.id&&[{x:a.position.x,y:a.position.y-A},{x:a.position.x,y:a.position.y+A},{x:a.position.x-A,y:a.position.y},{x:a.position.x+A,y:a.position.y}].forEach(r=>i(a,r))}),Array.from(n)}let Ta=0;function Da(t,e,n){const s=[],i=Ia(t,e),a={};i.forEach(r=>{for(const l of r.adjacentStateIds)a[l]=(a[l]||0)+1});const o=Object.values(a).reduce((r,l)=>r+l,0);return i.forEach(r=>{if(r.stateId&&r.stateId===e.id){const l=Array.from(r.adjacentStateIds).reduce((d,m)=>d+a[m],0),u=l/o,c=Math.round(n*u)/l*(Math.random()*.1+.9);c>0&&s.push({id:String(Ta++),quantity:c,position:{x:r.position.x+A/2,y:r.position.y+A/2},stateId:e.id,order:{type:"stay"}})}}),s}function _a({playerStateName:t,numberOfStates:e=3}){const n=Math.max(200,Math.ceil(Math.sqrt(e)*10)),s=n,i=Kn(n,s),{states:a,cities:o,launchSites:r}=Ea(e,t,n,s,i);Zn(i,n,s);const l=[],u=[],c=[],d=[];for(const m of a)d.push(...Da(i,m,Xn));return{timestamp:0,states:a,cities:o,launchSites:r,sectors:i,units:d,missiles:l,explosions:u,interceptors:c}}function R(t,e,n,s){return Math.sqrt(Math.pow(n-t,2)+Math.pow(s-e,2))}function Sa(t){var n;if(t.lastLaunchGenerationTimestamp&&t.timestamp-t.lastLaunchGenerationTimestamp>Vn)return;t.lastLaunchGenerationTimestamp=t.timestamp;const e=t.sectors.filter(s=>s.cityId&&s.population>0);for(const s of t.states){const i=t.cities.filter(c=>c.stateId===s.id),a=t.launchSites.filter(c=>c.stateId===s.id),o=t.cities.filter(c=>s.strategies[c.stateId]===v.HOSTILE&&c.stateId!==s.id&&c.population>0).map(c=>({...c,isCity:!0})),r=t.missiles.filter(c=>s.strategies[c.stateId]!==v.FRIENDLY&&c.stateId!==s.id),l=t.launchSites.filter(c=>s.strategies[c.stateId]===v.HOSTILE&&c.stateId!==s.id).map(c=>({...c,isCity:!1})),u=r.filter(c=>i.some(d=>Ae(c.target,d.position,L+j))||a.some(d=>Ae(c.target,d.position,L))).filter(c=>(t.timestamp-c.launchTimestamp)/(c.targetTimestamp-c.launchTimestamp)>.5);for(const c of t.launchSites.filter(d=>d.stateId===s.id)){if(c.nextLaunchTarget)continue;if(o.length===0&&l.length===0&&r.length===0)break;if(u.length===0&&c.mode===S.DEFENCE||u.length>0&&c.mode===S.ATTACK){c.modeChangeTimestamp||(c.modeChangeTimestamp=t.timestamp);continue}const d=at(u.map(y=>({...y,isCity:!1})),c.position),m=t.missiles.filter(y=>y.stateId===s.id),h=t.interceptors.filter(y=>y.stateId===s.id),p=h.filter(y=>!y.targetMissileId&&c.id===y.launchSiteId),g=ka(h,d).filter(([,y])=>y<a.length);if(c.mode===S.DEFENCE&&g.length>0){const y=g[0][0];p.length>0?p[0].targetMissileId=y:c.nextLaunchTarget={type:"missile",missileId:y}}else if(c.mode===S.ATTACK){const y=Ma(at([...l,...o],c.position),m),x=(n=y==null?void 0:y[0])==null?void 0:n[0];if(x!=null&&x.position&&(x!=null&&x.isCity)){const E=wa(x,e);c.nextLaunchTarget={type:"position",position:E||{x:x.position.x+(Math.random()-Math.random())*j,y:x.position.y+(Math.random()-Math.random())*j}}}else c.nextLaunchTarget=x!=null&&x.position?{type:"position",position:x==null?void 0:x.position}:void 0}}}}function Ae(t,e,n){return R(t.x,t.y,e.x,e.y)<=n}function at(t,e){return t.sort((n,s)=>R(n.position.x,n.position.y,e.x,e.y)-R(s.position.x,s.position.y,e.x,e.y))}function Ma(t,e){const n=new Map;for(const s of t)n.set(s,e.filter(i=>Ae(i.target,s.position,L)).length);return Array.from(n).sort((s,i)=>s[1]-i[1])}function ka(t,e){const n=new Map;for(const s of e)n.set(s.id,0);for(const s of t)s.targetMissileId&&n.set(s.targetMissileId,(n.get(s.targetMissileId)??0)+1);return Array.from(n).sort((s,i)=>s[1]-i[1])}function wa(t,e){const n=e.filter(i=>i.cityId===t.id);return!n||n.length===0?null:n[Math.floor(Math.random()*n.length)].position}function Ba(t){var e,n;if(!(t.lastStrategyUpdateTimestamp&&t.timestamp-t.lastStrategyUpdateTimestamp>Wn)){t.lastStrategyUpdateTimestamp=t.timestamp;for(const s of t.missiles.filter(i=>i.launchTimestamp===t.timestamp)){const i=t.states.find(o=>o.id===s.stateId),a=((e=t.cities.find(o=>R(o.position.x,o.position.y,s.target.x,s.target.y)<=L+j))==null?void 0:e.stateId)||((n=t.launchSites.find(o=>R(o.position.x,o.position.y,s.target.x,s.target.y)<=L))==null?void 0:n.stateId);if(i&&a&&i.id!==a){i.strategies[a]!==v.HOSTILE&&(i.strategies[a]=v.HOSTILE);const o=t.states.find(r=>r.id===a);o&&o.strategies[i.id]!==v.HOSTILE&&(o.strategies[i.id]=v.HOSTILE,t.states.forEach(r=>{r.id!==o.id&&r.strategies[o.id]===v.FRIENDLY&&o.strategies[r.id]===v.FRIENDLY&&(r.strategies[i.id]=v.HOSTILE,i.strategies[r.id]=v.HOSTILE)}))}}for(const s of t.states.filter(i=>!i.isPlayerControlled))La(s,t)}}function La(t,e){if(t.lastStrategyUpdate&&e.timestamp-t.lastStrategyUpdate<Hn)return;t.lastStrategyUpdate=e.timestamp;const n=e.states.filter(o=>o.id!==t.id),s=n.filter(o=>t.strategies[o.id]===v.FRIENDLY&&o.strategies[t.id]===v.FRIENDLY);t.strategies={...t.strategies},n.forEach(o=>{o.strategies[t.id]===v.FRIENDLY&&t.strategies[o.id]===v.NEUTRAL&&(t.generalStrategy!==v.HOSTILE?t.strategies[o.id]=v.FRIENDLY:o.strategies[t.id]=v.NEUTRAL)}),n.forEach(o=>{o.strategies[t.id]===v.NEUTRAL&&t.strategies[o.id]===v.HOSTILE&&(ot(t,o,s,e)?t.strategies[o.id]=v.NEUTRAL:o.strategies[t.id]=v.HOSTILE)});const i=n.filter(o=>Object.values(o.strategies).every(r=>r!==v.HOSTILE)&&o.generalStrategy!==v.HOSTILE);if(i.length>0&&t.generalStrategy===v.FRIENDLY){const o=i[Math.floor(Math.random()*i.length)];t.strategies[o.id]=v.FRIENDLY}s.forEach(o=>{n.forEach(r=>{r.strategies[o.id]===v.HOSTILE&&t.strategies[r.id]!==v.HOSTILE&&(t.strategies[r.id]=v.HOSTILE)})}),n.filter(o=>o.strategies[t.id]!==v.FRIENDLY&&t.strategies[o.id]!==v.FRIENDLY).forEach(o=>{if(ot(o,t,s,e)){const r=e.launchSites.filter(l=>l.stateId===t.id&&!l.lastLaunchTimestamp);if(r.length>0){const l=r[Math.floor(Math.random()*r.length)],u=[...e.cities.filter(c=>c.stateId===o.id),...e.launchSites.filter(c=>c.stateId===o.id)];if(u.length>0){const c=u[Math.floor(Math.random()*u.length)];l.nextLaunchTarget={type:"position",position:c.position}}}}})}function ot(t,e,n,s){const i=s.states.filter(l=>t.strategies[l.id]===v.FRIENDLY&&l.strategies[t.id]===v.FRIENDLY&&l.id!==t.id),a=s.launchSites.filter(l=>l.stateId===t.id||i.some(u=>u.id===l.stateId)),o=s.launchSites.filter(l=>l.stateId===e.id||n.some(u=>u.id===l.stateId));return a.length<o.length?!0:s.missiles.some(l=>s.cities.some(u=>u.stateId===t.id&&R(u.position.x,u.position.y,l.target.x,l.target.y)<=L)||s.launchSites.some(u=>u.stateId===t.id&&R(u.position.x,u.position.y,l.target.x,l.target.y)<=L))}function Ra(t){for(const e of t.missiles){const n=(t.timestamp-e.launchTimestamp)/(e.targetTimestamp-e.launchTimestamp);e.position={x:e.launch.x+(e.target.x-e.launch.x)*n,y:e.launch.y+(e.target.y-e.launch.y)*n}}}function ja(t,e){t.interceptors=t.interceptors.filter(n=>{const s=t.missiles.find(l=>l.id===n.targetMissileId);s||(n.targetMissileId=void 0);const i=s?s.position.x-n.position.x:Math.cos(n.direction),a=s?s.position.y-n.position.y:Math.sin(n.direction),o=Math.sqrt(i*i+a*a);if(n.direction=Math.atan2(a,i),s&&o<=ee*e)n.position={...s.position};else{const l=ee*e/o;n.position={x:n.position.x+i*l,y:n.position.y+a*l}}return n.tail=[...n.tail.slice(-100),{timestamp:t.timestamp,position:n.position}],ee*(t.timestamp-n.launchTimestamp)<=n.maxRange})}function Oa(t){for(const e of t.interceptors){const n=t.missiles.find(s=>s.id===e.targetMissileId);n&&R(e.position.x,e.position.y,n.position.x,n.position.y)<Un&&(t.missiles=t.missiles.filter(i=>i.id!==n.id),t.interceptors=t.interceptors.filter(i=>i.id!==e.id))}}function Pa(t){for(const e of t.missiles.filter(n=>n.targetTimestamp<=t.timestamp)){const n=$a(e);t.explosions.push(n),Na(t,n),Ua(t,n),Ya(t,n),za(t,n)}t.explosions=t.explosions.filter(e=>e.endTimestamp>=t.timestamp),t.missiles=t.missiles.filter(e=>e.targetTimestamp>t.timestamp)}function $a(t){return{id:`explosion-${Math.random()}`,missileId:t.id,startTimestamp:t.targetTimestamp,endTimestamp:t.targetTimestamp+zn,position:t.target,radius:L}}function Na(t,e){for(const n of t.searchSector.byRadius(e.position,e.radius))if(n.population){const s=Math.max(Dt,n.population*Tt);n.population=Math.max(0,n.population-s)}return t}function Ua(t,e){const n=t.searchMissile.byRadius(e.position,e.radius).filter(s=>s.id!==e.missileId&&s.launchTimestamp<=e.startTimestamp&&s.targetTimestamp>=e.startTimestamp);for(const s of n)s.targetTimestamp=e.startTimestamp;t.interceptors=t.interceptors.filter(s=>!(s.launchTimestamp<=e.startTimestamp&&R(s.position.x,s.position.y,e.position.x,e.position.y)<=e.radius))}function Ya(t,e){const n=t.searchLaunchSite.byRadius(e.position,e.radius);t.launchSites=t.launchSites.filter(s=>!n.some(i=>i.id===s.id))}function za(t,e){const n=t.searchUnit.byRadius(e.position,e.radius);t.units=t.units.map(s=>{if(n.find(a=>a.id===s.id)){const a=Math.max(Dt,s.quantity*Tt),o=Math.max(0,s.quantity-a);return{...s,quantity:o}}return s}),t.units=t.units.filter(s=>s.quantity>0)}function Ga(t){for(const e of t.launchSites)e.modeChangeTimestamp&&t.timestamp>=e.modeChangeTimestamp+pe&&(e.mode=e.mode===S.ATTACK?S.DEFENCE:S.ATTACK,e.modeChangeTimestamp=void 0)}function Ha(t){var e,n;for(const s of t.launchSites)if(s.nextLaunchTarget&&!(s.lastLaunchTimestamp&&t.timestamp-s.lastLaunchTimestamp<(s.mode===S.ATTACK?ge:Gn))){if(s.mode===S.ATTACK&&((e=s.nextLaunchTarget)==null?void 0:e.type)==="position")t.missiles.push(qa(s,s.nextLaunchTarget.position,t.timestamp));else if(s.mode===S.DEFENCE&&((n=s.nextLaunchTarget)==null?void 0:n.type)==="missile"){const i=s.nextLaunchTarget.missileId,a=t.searchMissile.byProperty("id",i)[0];a&&t.interceptors.push(Xa(s,t.timestamp,a))}s.lastLaunchTimestamp=t.timestamp,s.nextLaunchTarget=void 0}}function qa(t,e,n){return{id:Math.random()+"",stateId:t.stateId,launchSiteId:t.id,launch:t.position,launchTimestamp:n,position:t.position,target:e,targetTimestamp:n+R(t.position.x,t.position.y,e.x,e.y)/Me}}function Xa(t,e,n){return{id:Math.random()+"",stateId:t.stateId,launchSiteId:t.id,launch:t.position,launchTimestamp:e,position:t.position,direction:Math.atan2(t.position.y-n.position.y,t.position.x-n.position.x),tail:[],targetMissileId:n.id,maxRange:ke}}function Va(t){const e=t.sectors.reduce((n,s)=>(s.cityId&&(n[s.cityId]=n[s.cityId]?n[s.cityId]+(s.population??0):s.population??0),n),{});for(const n of t.cities)n.population=e[n.id];t.states=t.states.map(n=>{const s=t.cities.filter(i=>i.stateId===n.id).reduce((i,a)=>i+a.population,0);return{...n,population:s}})}function Wa(t,e){const n=Ka(t);Za(t.units,n,e),Ja(t.units,e,n),eo(t),to(t),t.units=t.units.filter(s=>s.quantity>0)}function Ka(t){const e={};for(const n of t.states.map(s=>t.searchSector.byProperty("stateId",s.id)).flat()){const s=t.searchUnit.byRect(n.rect),i=s.filter(o=>{var r;return((r=t.states.find(l=>l.id===o.stateId))==null?void 0:r.strategies[n.stateId])===v.HOSTILE}),a=s.filter(o=>o.stateId===n.stateId);i.length>0&&a.length>0&&(e[n.id]=[...i,...a])}return e}function Za(t,e,n){for(const[,s]of Object.entries(e)){const i=s.reduce((o,r)=>(o[r.stateId]=(o[r.stateId]??0)+r.quantity,o),{}),a=Object.values(i).reduce((o,r)=>o=o+r,0);a&&s.forEach(o=>{o.quantity-=i[o.stateId]/a*n})}return t}function Ja(t,e,n){return t.map(s=>{if(s.order.type==="move"&&!Qa(s,n)){const i={x:s.order.targetPosition.x-s.position.x,y:s.order.targetPosition.y-s.position.y},a=Math.sqrt(i.x**2+i.y**2),o=qn*e;if(a<=o)s.position=s.order.targetPosition,s.order={type:"stay"};else{const r={x:i.x/a,y:i.y/a};s.position={x:s.position.x+r.x*o,y:s.position.y+r.y*o}}}return s})}function Qa(t,e){for(const[,n]of Object.entries(e))if(n.find(s=>s.id===t.id))return!0;return!1}function eo(t){t.units.forEach(e=>{const n=t.searchSector.byRadius(e.position,1)[0];if(!n||n.stateId===e.stateId)return;const s=t.searchUnit.byRect(n.rect);Object.values(s.reduce((a,o)=>(a[o.stateId]=!0,a),{[e.stateId]:!0})).length===1&&(n.stateId=e.stateId)})}function to(t){t.units.forEach(e=>{if(e.lastOrderTimestamp&&t.timestamp-e.lastOrderTimestamp<5)return e;const n=t.searchSector.byRadius(e.position,1)[0];if(!n)return e;const i=t.searchSector.byRect({left:n.rect.left-A,top:n.rect.top-A,right:n.rect.right+A,bottom:n.rect.bottom+A}).filter(a=>a.stateId!==e.stateId);if(i.length>0){const a=i[Math.floor(Math.random()*i.length)];e.order={type:"move",targetPosition:{x:(a.rect.left+a.rect.right)/2,y:(a.rect.top+a.rect.bottom)/2}}}else{const a=no(e,t.sectors);a?e.order={type:"move",targetPosition:{x:(a.rect.left+a.rect.right)/2,y:(a.rect.top+a.rect.bottom)/2}}:e.order={type:"stay"}}return e.lastOrderTimestamp=t.timestamp,e})}function no(t,e){var n;return(n=e.filter(s=>s.stateId!==t.stateId&&s.population>0).reduce((s,i)=>{const a=Math.sqrt((t.position.x-i.position.x)**2+(t.position.y-i.position.y)**2);return s&&s.distance<a?s:{sector:i,distance:a}},void 0))==null?void 0:n.sector}class so{constructor(){this.ids=[],this.values=[],this.length=0}clear(){this.length=0}push(e,n){let s=this.length++;for(;s>0;){const i=s-1>>1,a=this.values[i];if(n>=a)break;this.ids[s]=this.ids[i],this.values[s]=a,s=i}this.ids[s]=e,this.values[s]=n}pop(){if(this.length===0)return;const e=this.ids[0];if(this.length--,this.length>0){const n=this.ids[0]=this.ids[this.length],s=this.values[0]=this.values[this.length],i=this.length>>1;let a=0;for(;a<i;){let o=(a<<1)+1;const r=o+1;let l=this.ids[o],u=this.values[o];const c=this.values[r];if(r<this.length&&c<u&&(o=r,l=this.ids[r],u=c),u>=s)break;this.ids[a]=l,this.values[a]=u,a=o}this.ids[a]=n,this.values[a]=s}return e}peek(){if(this.length!==0)return this.ids[0]}peekValue(){if(this.length!==0)return this.values[0]}shrink(){this.ids.length=this.values.length=this.length}}const rt=[Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array],me=3;class Re{static from(e,n=0){if(n%8!==0)throw new Error("byteOffset must be 8-byte aligned.");if(!e||e.byteLength===void 0||e.buffer)throw new Error("Data must be an instance of ArrayBuffer or SharedArrayBuffer.");const[s,i]=new Uint8Array(e,n+0,2);if(s!==251)throw new Error("Data does not appear to be in a Flatbush format.");const a=i>>4;if(a!==me)throw new Error(`Got v${a} data when expected v${me}.`);const o=rt[i&15];if(!o)throw new Error("Unrecognized array type.");const[r]=new Uint16Array(e,n+2,1),[l]=new Uint32Array(e,n+4,1);return new Re(l,r,o,void 0,e,n)}constructor(e,n=16,s=Float64Array,i=ArrayBuffer,a,o=0){if(e===void 0)throw new Error("Missing required argument: numItems.");if(isNaN(e)||e<=0)throw new Error(`Unexpected numItems value: ${e}.`);this.numItems=+e,this.nodeSize=Math.min(Math.max(+n,2),65535),this.byteOffset=o;let r=e,l=r;this._levelBounds=[r*4];do r=Math.ceil(r/this.nodeSize),l+=r,this._levelBounds.push(l*4);while(r!==1);this.ArrayType=s,this.IndexArrayType=l<16384?Uint16Array:Uint32Array;const u=rt.indexOf(this.ArrayType),c=l*4*this.ArrayType.BYTES_PER_ELEMENT;if(u<0)throw new Error(`Unexpected typed array class: ${s}.`);a&&a.byteLength!==void 0&&!a.buffer?(this.data=a,this._boxes=new this.ArrayType(this.data,o+8,l*4),this._indices=new this.IndexArrayType(this.data,o+8+c,l),this._pos=l*4,this.minX=this._boxes[this._pos-4],this.minY=this._boxes[this._pos-3],this.maxX=this._boxes[this._pos-2],this.maxY=this._boxes[this._pos-1]):(this.data=new i(8+c+l*this.IndexArrayType.BYTES_PER_ELEMENT),this._boxes=new this.ArrayType(this.data,8,l*4),this._indices=new this.IndexArrayType(this.data,8+c,l),this._pos=0,this.minX=1/0,this.minY=1/0,this.maxX=-1/0,this.maxY=-1/0,new Uint8Array(this.data,0,2).set([251,(me<<4)+u]),new Uint16Array(this.data,2,1)[0]=n,new Uint32Array(this.data,4,1)[0]=e),this._queue=new so}add(e,n,s=e,i=n){const a=this._pos>>2,o=this._boxes;return this._indices[a]=a,o[this._pos++]=e,o[this._pos++]=n,o[this._pos++]=s,o[this._pos++]=i,e<this.minX&&(this.minX=e),n<this.minY&&(this.minY=n),s>this.maxX&&(this.maxX=s),i>this.maxY&&(this.maxY=i),a}finish(){if(this._pos>>2!==this.numItems)throw new Error(`Added ${this._pos>>2} items when expected ${this.numItems}.`);const e=this._boxes;if(this.numItems<=this.nodeSize){e[this._pos++]=this.minX,e[this._pos++]=this.minY,e[this._pos++]=this.maxX,e[this._pos++]=this.maxY;return}const n=this.maxX-this.minX||1,s=this.maxY-this.minY||1,i=new Uint32Array(this.numItems),a=65535;for(let o=0,r=0;o<this.numItems;o++){const l=e[r++],u=e[r++],c=e[r++],d=e[r++],m=Math.floor(a*((l+c)/2-this.minX)/n),h=Math.floor(a*((u+d)/2-this.minY)/s);i[o]=ao(m,h)}Ie(i,e,this._indices,0,this.numItems-1,this.nodeSize);for(let o=0,r=0;o<this._levelBounds.length-1;o++){const l=this._levelBounds[o];for(;r<l;){const u=r;let c=e[r++],d=e[r++],m=e[r++],h=e[r++];for(let p=1;p<this.nodeSize&&r<l;p++)c=Math.min(c,e[r++]),d=Math.min(d,e[r++]),m=Math.max(m,e[r++]),h=Math.max(h,e[r++]);this._indices[this._pos>>2]=u,e[this._pos++]=c,e[this._pos++]=d,e[this._pos++]=m,e[this._pos++]=h}}}search(e,n,s,i,a){if(this._pos!==this._boxes.length)throw new Error("Data not yet indexed - call index.finish().");let o=this._boxes.length-4;const r=[],l=[];for(;o!==void 0;){const u=Math.min(o+this.nodeSize*4,ct(o,this._levelBounds));for(let c=o;c<u;c+=4){if(s<this._boxes[c]||i<this._boxes[c+1]||e>this._boxes[c+2]||n>this._boxes[c+3])continue;const d=this._indices[c>>2]|0;o>=this.numItems*4?r.push(d):(a===void 0||a(d))&&l.push(d)}o=r.pop()}return l}neighbors(e,n,s=1/0,i=1/0,a){if(this._pos!==this._boxes.length)throw new Error("Data not yet indexed - call index.finish().");let o=this._boxes.length-4;const r=this._queue,l=[],u=i*i;e:for(;o!==void 0;){const c=Math.min(o+this.nodeSize*4,ct(o,this._levelBounds));for(let d=o;d<c;d+=4){const m=this._indices[d>>2]|0,h=lt(e,this._boxes[d],this._boxes[d+2]),p=lt(n,this._boxes[d+1],this._boxes[d+3]),g=h*h+p*p;g>u||(o>=this.numItems*4?r.push(m<<1,g):(a===void 0||a(m))&&r.push((m<<1)+1,g))}for(;r.length&&r.peek()&1;)if(r.peekValue()>u||(l.push(r.pop()>>1),l.length===s))break e;o=r.length?r.pop()>>1:void 0}return r.clear(),l}}function lt(t,e,n){return t<e?e-t:t<=n?0:t-n}function ct(t,e){let n=0,s=e.length-1;for(;n<s;){const i=n+s>>1;e[i]>t?s=i:n=i+1}return e[n]}function Ie(t,e,n,s,i,a){if(Math.floor(s/a)>=Math.floor(i/a))return;const o=t[s+i>>1];let r=s-1,l=i+1;for(;;){do r++;while(t[r]<o);do l--;while(t[l]>o);if(r>=l)break;io(t,e,n,r,l)}Ie(t,e,n,s,l,a),Ie(t,e,n,l+1,i,a)}function io(t,e,n,s,i){const a=t[s];t[s]=t[i],t[i]=a;const o=4*s,r=4*i,l=e[o],u=e[o+1],c=e[o+2],d=e[o+3];e[o]=e[r],e[o+1]=e[r+1],e[o+2]=e[r+2],e[o+3]=e[r+3],e[r]=l,e[r+1]=u,e[r+2]=c,e[r+3]=d;const m=n[s];n[s]=n[i],n[i]=m}function ao(t,e){let n=t^e,s=65535^n,i=65535^(t|e),a=t&(e^65535),o=n|s>>1,r=n>>1^n,l=i>>1^s&a>>1^i,u=n&i>>1^a>>1^a;n=o,s=r,i=l,a=u,o=n&n>>2^s&s>>2,r=n&s>>2^s&(n^s)>>2,l^=n&i>>2^s&a>>2,u^=s&i>>2^(n^s)&a>>2,n=o,s=r,i=l,a=u,o=n&n>>4^s&s>>4,r=n&s>>4^s&(n^s)>>4,l^=n&i>>4^s&a>>4,u^=s&i>>4^(n^s)&a>>4,n=o,s=r,i=l,a=u,l^=n&i>>8^s&a>>8,u^=s&i>>8^(n^s)&a>>8,n=l^l>>1,s=u^u>>1;let c=t^e,d=s|65535^(c|n);return c=(c|c<<8)&16711935,c=(c|c<<4)&252645135,c=(c|c<<2)&858993459,c=(c|c<<1)&1431655765,d=(d|d<<8)&16711935,d=(d|d<<4)&252645135,d=(d|d<<2)&858993459,d=(d|d<<1)&1431655765,(d<<1|c)>>>0}function oo(t){return{...t,searchUnit:U(t.units),searchSector:U(t.sectors,"sectors"),searchCity:U(t.cities),searchLaunchSite:U(t.launchSites),searchMissile:U(t.missiles),searchInterceptor:U(t.interceptors)}}const he={};function U(t,e){if(e&&he[e])return he[e];t=[...t];const n=t.length===0?void 0:new Re(t.length);for(const a of t)"rect"in a?n==null||n.add(a.rect.left,a.rect.top,a.rect.right,a.rect.bottom):"position"in a&&(n==null||n.add(a.position.x,a.position.y,a.position.x,a.position.y));n==null||n.finish();const s=new Map,i={byRect:a=>(n==null?void 0:n.search(a.left,a.top,a.right,a.bottom).map(o=>t[o]))??[],byRadius:(a,o)=>(n==null?void 0:n.neighbors(a.x,a.y,void 0,o).map(r=>t[r]))??[],byProperty:(a,o)=>{if(!s.has(a)){const r=s.set(a,new Map).get(a);t.forEach(l=>{if(a in l){const u=l[a];r.has(u)||r.set(u,[]),r.get(u).push(l)}})}return s.get(a).get(o)??[]},resetPropertyCache:()=>{s.clear()}};return e&&(he[e]=i),i}function ro(t,e){for(;e>0;){const n=lo(t,e>K?K:e);e=e>K?e-K:0,t=n}return t}function lo(t,e){const n=t.timestamp+e,s=oo({timestamp:n,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,interceptors:t.interceptors,units:t.units,explosions:t.explosions,sectors:t.sectors});return Wa(s,e),Ra(s),ja(s,e),Oa(s),Pa(s),Ga(s),Ha(s),Va(s),Sa(s),Ba(s),s}function co(t){const[e,n]=b.useState(()=>_a({playerStateName:t,numberOfStates:6})),s=b.useCallback((i,a)=>n(ro(i,a)),[]);return{worldState:e,updateWorldState:s,setWorldState:n}}const vn={x:0,y:0,pointingObjects:[]},uo=(t,e)=>e.type==="move"?{x:e.x,y:e.y,pointingObjects:t.pointingObjects}:e.type==="point"&&!t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,e.object]}:e.type==="unpoint"&&t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(n=>n.id!==e.object.id)}:t,mo=b.createContext(vn),je=b.createContext(()=>{});function ho({children:t}){const[e,n]=b.useReducer(uo,vn);return f.jsx(mo.Provider,{value:e,children:f.jsx(je.Provider,{value:n,children:t})})}function fo(){const t=b.useContext(je);return(e,n)=>t({type:"move",x:e,y:n})}function Oe(){const t=b.useContext(je);return[e=>t({type:"point",object:e}),e=>t({type:"unpoint",object:e})]}const Pe={},po=(t,e)=>e.type==="clear"?Pe:e.type==="set"?{...t,selectedObject:e.object}:t,yn=b.createContext(Pe),En=b.createContext(()=>{});function go({children:t}){const[e,n]=b.useReducer(po,Pe);return f.jsx(yn.Provider,{value:e,children:f.jsx(En.Provider,{value:n,children:t})})}function vo(t){var s;const e=b.useContext(En);return[((s=b.useContext(yn).selectedObject)==null?void 0:s.id)===t.id,()=>e({type:"set",object:t})]}function X(t,e){const n=new CustomEvent(t,{bubbles:!0,detail:e});document.dispatchEvent(n)}function oe(t,e){b.useEffect(()=>{const n=s=>{e(s.detail)};return document.addEventListener(t,n,!1),()=>{document.removeEventListener(t,n,!1)}},[t,e])}const yo=$.memo(({sectors:t,states:e})=>{const n=b.useRef(null),[s,i]=Oe(),[a,o]=b.useState(0);return oe("cityDamage",()=>{o(a+1)}),b.useEffect(()=>{const r=n.current,l=r==null?void 0:r.getContext("2d");if(!r||!l)return;const u=Math.min(...t.map(E=>E.rect.left)),c=Math.min(...t.map(E=>E.rect.top)),d=Math.max(...t.map(E=>E.rect.right)),m=Math.max(...t.map(E=>E.rect.bottom)),h=d-u,p=m-c;r.width=h,r.height=p,r.style.width=`${h}px`,r.style.height=`${p}px`;const g=Math.max(...t.filter(E=>E.type===M.WATER).map(E=>E.depth||0)),y=Math.max(...t.filter(E=>E.type===M.GROUND).map(E=>E.height||0)),x=new Map(e.map(E=>[E.id,E.color]));l.clearRect(0,0,h,p),t.forEach(E=>{const{fillStyle:C,drawSector:O}=Eo(E,g,y,x);l.fillStyle=C,O(l,E.rect,u,c)})},[a]),b.useEffect(()=>{const r=n.current;let l;const u=c=>{const d=r==null?void 0:r.getBoundingClientRect(),m=c.clientX-((d==null?void 0:d.left)||0),h=c.clientY-((d==null?void 0:d.top)||0),p=t.find(g=>m>=g.rect.left&&m<=g.rect.right&&h>=g.rect.top&&h<=g.rect.bottom);p&&(l&&i(l),s(p),l=p)};return r==null||r.addEventListener("mousemove",u),()=>{r==null||r.removeEventListener("mousemove",u)}},[t,s,i]),f.jsx("canvas",{ref:n,style:{opacity:.5}})});function Eo(t,e,n,s){const i=bo(t,e,n),a=t.stateId?s.get(t.stateId):void 0;return{fillStyle:i,drawSector:(o,r,l,u)=>{o.fillStyle=i,o.fillRect(r.left-l,r.top-u,r.right-r.left,r.bottom-r.top),a&&(o.fillStyle=`${a}80`,o.fillRect(r.left-l,r.top-u,r.right-r.left,r.bottom-r.top)),t.cityId&&t.population>0&&Fo(o,r,l,u)}}}function bo(t,e,n){switch(t.type){case M.GROUND:return t.cityId?xo(t):Co(t.height||0,n);case M.WATER:return Ao(t.depth||0,e);default:return"rgb(0, 34, 93)"}}function xo(t){if(t.population===0)return"rgba(0,0,0,0.7)";const e=t.population?Math.min(t.population/_t,1):0,n=t.height?t.height/100:0,i=[200,200,200].map(a=>a-50*e+20*n);return`rgb(${i[0]}, ${i[1]}, ${i[2]})`}function Fo(t,e,n,s){t.fillStyle="rgba(0, 0, 0, 0.2)",t.fillRect(e.left-n+2,e.top-s+2,e.right-e.left-4,e.bottom-e.top-4),t.fillStyle="rgba(255, 255, 255, 0.6)",t.fillRect(e.left-n+4,e.top-s+4,e.right-e.left-8,e.bottom-e.top-8)}function Co(t,e){const n=t/e;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const s=Math.round(34+67*((n-.5)/.3)),i=Math.round(100+-33*((n-.5)/.3)),a=Math.round(34+-1*((n-.5)/.3));return`rgb(${s}, ${i}, ${a})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}function Ao(t,e){const n=t/e,s=Math.round(0+34*(1-n)),i=Math.round(137+-103*n),a=Math.round(178+-85*n);return`rgb(${s}, ${i}, ${a})`}function Io({state:t,sectors:e}){const n=$.useMemo(()=>{const s=e.filter(i=>i.stateId===t.id);return Do(s)},[]);return f.jsx(f.Fragment,{children:f.jsx(To,{style:{transform:`translate(${n.x}px, ${n.y}px) translate(-50%, -50%)`,color:t.color},children:t.name})})}const To=F.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;function Do(t){if(t.length===0)return{x:0,y:0};const e=t.reduce((n,s)=>({x:n.x+(s.rect.left+s.rect.right)/2,y:n.y+(s.rect.top+s.rect.bottom)/2}),{x:0,y:0});return{x:e.x/t.length,y:e.y/t.length}}function _o({city:t}){const[e,n]=Oe(),s=t.population;if(!s)return null;const i=ne(s);return f.jsxs(So,{onMouseEnter:()=>e(t),onMouseLeave:()=>n(t),style:{"--x":t.position.x,"--y":t.position.y},children:[f.jsx("span",{children:t.name}),f.jsxs(Mo,{children:[i," population"]})]})}const So=F.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`,Mo=F.div`
  display: none;
  position: absolute;
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 5px;
  border-radius: 3px;
  font-size: 12px;
  white-space: nowrap;
  left: 50%;
  transform: translateX(-50%) translateY(0%);
  pointer-events: none;
`;function ko({launchSite:t,worldTimestamp:e,isPlayerControlled:n}){const[s,i]=vo(t),[a,o]=Oe(),r=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+ge>e,l=r?(e-t.lastLaunchTimestamp)/ge:0,u=t.modeChangeTimestamp&&e<t.modeChangeTimestamp+pe,c=u?(e-t.modeChangeTimestamp)/pe:0;return f.jsx(wo,{onMouseEnter:()=>a(t),onMouseLeave:()=>o(t),onClick:()=>n&&i(),style:{"--x":t.position.x,"--y":t.position.y,"--cooldown-progress":l,"--mode-change-progress":c},"data-selected":s,"data-cooldown":r,"data-mode":t.mode,"data-changing-mode":u,children:f.jsx(Bo,{children:t.mode===S.ATTACK?"A":"D"})})}const wo=F.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -50%);
  position: absolute;
  width: 10px;
  height: 20px;
  background: rgb(255, 0, 0);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
  font-size: 12px;
  color: white;
  transition: background-color 0.3s;

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

  &[data-mode='ATTACK'] {
    background: rgb(255, 0, 0);
  }

  &[data-mode='DEFENCE'] {
    background: rgb(0, 0, 255);
  }

  &[data-changing-mode='true'] {
    background: linear-gradient(
      to right,
      rgb(255, 0, 0) 0%,
      rgb(255, 0, 0) calc(var(--mode-change-progress) * 100%),
      rgb(0, 0, 255) calc(var(--mode-change-progress) * 100%),
      rgb(0, 0, 255) 100%
    );
  }
`,Bo=F.span`
  z-index: 1;
`;function bn(t,e){e===void 0&&(e=!0);var n=b.useRef(null),s=b.useRef(!1),i=b.useRef(t);i.current=t;var a=b.useCallback(function(r){s.current&&(i.current(r),n.current=requestAnimationFrame(a))},[]),o=b.useMemo(function(){return[function(){s.current&&(s.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){s.current||(s.current=!0,n.current=requestAnimationFrame(a))},function(){return s.current}]},[]);return b.useEffect(function(){return e&&o[1](),o[0]},[]),o}function Lo(t,e,n){if(e.startTimestamp>n||e.endTimestamp<n)return;const s=Math.pow(Math.min(Math.max(0,(n-e.startTimestamp)/(e.endTimestamp-e.startTimestamp)),1),.15);t.fillStyle=`rgb(${255*s}, ${255*(1-s)}, 0)`,t.beginPath(),t.arc(e.position.x,e.position.y,e.radius*s,0,2*Math.PI),t.fill()}function Ro(t,e,n){e.launchTimestamp>n||e.targetTimestamp<n||(t.fillStyle="rgb(255, 0, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,2,0,2*Math.PI),t.fill())}function jo(t,e){t.fillStyle="rgb(0, 255, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,1,0,2*Math.PI),t.fill()}function ut(t,e,n){if(!(e.launchTimestamp>n))if("targetTimestamp"in e){if(e.targetTimestamp<n)return;Oo(t,e,n)}else Po(t,e,n)}function Oo(t,e,n){const s=Math.min(Math.max(n-5,e.launchTimestamp)-e.launchTimestamp,e.targetTimestamp-e.launchTimestamp),i=e.targetTimestamp-e.launchTimestamp,a=i>0?s/i:0,o=e.launch.x+(e.position.x-e.launch.x)*a,r=e.launch.y+(e.position.y-e.launch.y)*a,l={x:o,y:r},u=t.createLinearGradient(l.x,l.y,e.position.x,e.position.y);u.addColorStop(0,"rgba(255, 255, 255, 0)"),u.addColorStop(1,"rgba(255, 255, 255, 0.5)"),t.strokeStyle=u,t.lineWidth=1,t.beginPath(),t.moveTo(l.x,l.y),t.lineTo(e.position.x,e.position.y),t.stroke()}function Po(t,e,n){const i=Math.max(n-5,e.launchTimestamp),a=e.tail.filter(r=>r.timestamp>=i);if(a.length<2)return;t.beginPath(),t.moveTo(a[0].position.x,a[0].position.y);for(let r=1;r<a.length;r++)t.lineTo(a[r].position.x,a[r].position.y);t.lineTo(e.position.x,e.position.y);const o=t.createLinearGradient(a[0].position.x,a[0].position.y,e.position.x,e.position.y);o.addColorStop(0,"rgba(0, 255, 0, 0)"),o.addColorStop(1,"rgba(0, 255, 0, 0.5)"),t.strokeStyle=o,t.lineWidth=1,t.stroke()}function $o(t,e){if(Math.sqrt(Math.pow(e.position.x-e.launch.x,2)+Math.pow(e.position.y-e.launch.y,2))>ke)for(let o=0;o<5;o++){const r=Math.PI*2/5*o,l=e.position.x+Math.cos(r)*3,u=e.position.y+Math.sin(r)*3;t.fillStyle="rgba(0, 255, 0, 0.5)",t.beginPath(),t.arc(l,u,1,0,2*Math.PI),t.fill()}}function No({state:t}){const e=b.useRef(null);return b.useLayoutEffect(()=>{const s=e.current;if(!s)return;const i=Math.min(...t.sectors.map(c=>c.rect.left)),a=Math.min(...t.sectors.map(c=>c.rect.top)),o=Math.max(...t.sectors.map(c=>c.rect.right)),r=Math.max(...t.sectors.map(c=>c.rect.bottom)),l=o-i,u=r-a;s.width=l,s.height=u,s.style.width=`${l}px`,s.style.height=`${u}px`},[t.sectors]),bn(()=>{const s=e.current;if(!s)return;const i=s.getContext("2d");i&&(i.clearRect(0,0,s.width,s.height),t.missiles.forEach(a=>{ut(i,a,t.timestamp)}),t.interceptors.forEach(a=>{ut(i,a,t.timestamp)}),t.missiles.filter(a=>a.launchTimestamp<t.timestamp&&a.targetTimestamp>t.timestamp).forEach(a=>{Ro(i,a,t.timestamp)}),t.interceptors.filter(a=>a.launchTimestamp<t.timestamp).forEach(a=>{jo(i,a),ee*(t.timestamp-a.launchTimestamp+1)>ke&&$o(i,a)}),t.explosions.filter(a=>a.startTimestamp<t.timestamp&&a.endTimestamp>t.timestamp).forEach(a=>{Lo(i,a,t.timestamp)}))}),f.jsx(Uo,{ref:e})}const Uo=F.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`,Yo=({worldStateRef:t})=>{const e=b.useRef(null);b.useEffect(()=>{const s=e.current;if(!s)return;const i=s.getContext("2d");if(!i)return;let a;const o=t.current;if(!o)return;const r=o.sectors,l=Math.min(...r.map(g=>g.rect.left)),u=Math.min(...r.map(g=>g.rect.top)),c=Math.max(...r.map(g=>g.rect.right)),d=Math.max(...r.map(g=>g.rect.bottom)),m=c-l,h=d-u;(s.width!==m||s.height!==h)&&(s.width=m,s.height=h,s.style.width=`${m}px`,s.style.height=`${h}px`);const p=()=>{const g=t.current;g&&(i.clearRect(0,0,s.width,s.height),i.save(),n(i,g),i.restore(),a=requestAnimationFrame(p))};return p(),()=>{cancelAnimationFrame(a)}},[t]);const n=(s,i)=>{const a={};i.units.forEach(o=>{const r=o.stateId;a[r]||(a[r]=[]),a[r].push(o)}),Object.entries(a).forEach(([o,r])=>{const l=i.states.find(c=>c.id===o),u=l?l.color:"#000000";s.fillStyle=u,s.strokeStyle="#000000",s.lineWidth=1,r.forEach(c=>{s.fillRect(c.position.x-_/2,c.position.y-_/2,_,_),s.strokeRect(c.position.x-_/2,c.position.y-_/2,_,_),s.beginPath(),s.moveTo(c.position.x-_/2,c.position.y-_/2),s.lineTo(c.position.x+_/2,c.position.y+_/2),s.moveTo(c.position.x+_/2,c.position.y-_/2),s.lineTo(c.position.x-_/2,c.position.y+_/2),s.stroke()})})};return f.jsx("canvas",{ref:e,style:{position:"absolute",top:0,left:0}})};function zo({state:t}){const e=fo(),n=b.useRef(t);return $.useEffect(()=>{n.current=t},[t]),f.jsxs(Go,{onMouseMove:s=>e(s.clientX,s.clientY),onClick:()=>X("world-click"),children:[f.jsx(yo,{sectors:t.sectors,states:t.states}),t.states.map(s=>f.jsx(Io,{state:s,cities:t.cities,launchSites:t.launchSites,sectors:t.sectors},s.id)),t.cities.map(s=>f.jsx(_o,{city:s},s.id)),t.launchSites.map(s=>{var i;return f.jsx(ko,{launchSite:s,worldTimestamp:t.timestamp,isPlayerControlled:s.stateId===((i=t.states.find(a=>a.isPlayerControlled))==null?void 0:i.id)},s.id)}),f.jsx(Yo,{worldStateRef:n}),f.jsx(No,{state:t})]})}const Go=F.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function Ho(t,e,n){return Math.max(e,Math.min(t,n))}const I={toVector(t,e){return t===void 0&&(t=e),Array.isArray(t)?t:[t,t]},add(t,e){return[t[0]+e[0],t[1]+e[1]]},sub(t,e){return[t[0]-e[0],t[1]-e[1]]},addTo(t,e){t[0]+=e[0],t[1]+=e[1]},subTo(t,e){t[0]-=e[0],t[1]-=e[1]}};function dt(t,e,n){return e===0||Math.abs(e)===1/0?Math.pow(t,n*5):t*e*n/(e+n*t)}function mt(t,e,n,s=.15){return s===0?Ho(t,e,n):t<e?-dt(e-t,n-e,s)+e:t>n?+dt(t-n,n-e,s)+n:t}function qo(t,[e,n],[s,i]){const[[a,o],[r,l]]=t;return[mt(e,a,o,s),mt(n,r,l,i)]}function Xo(t,e){if(typeof t!="object"||t===null)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var s=n.call(t,e||"default");if(typeof s!="object")return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function Vo(t){var e=Xo(t,"string");return typeof e=="symbol"?e:String(e)}function D(t,e,n){return e=Vo(e),e in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function ht(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(t);e&&(s=s.filter(function(i){return Object.getOwnPropertyDescriptor(t,i).enumerable})),n.push.apply(n,s)}return n}function T(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?ht(Object(n),!0).forEach(function(s){D(t,s,n[s])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):ht(Object(n)).forEach(function(s){Object.defineProperty(t,s,Object.getOwnPropertyDescriptor(n,s))})}return t}const xn={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function ft(t){return t?t[0].toUpperCase()+t.slice(1):""}const Wo=["enter","leave"];function Ko(t=!1,e){return t&&!Wo.includes(e)}function Zo(t,e="",n=!1){const s=xn[t],i=s&&s[e]||e;return"on"+ft(t)+ft(i)+(Ko(n,i)?"Capture":"")}const Jo=["gotpointercapture","lostpointercapture"];function Qo(t){let e=t.substring(2).toLowerCase();const n=!!~e.indexOf("passive");n&&(e=e.replace("passive",""));const s=Jo.includes(e)?"capturecapture":"capture",i=!!~e.indexOf(s);return i&&(e=e.replace("capture","")),{device:e,capture:i,passive:n}}function er(t,e=""){const n=xn[t],s=n&&n[e]||e;return t+s}function re(t){return"touches"in t}function Fn(t){return re(t)?"touch":"pointerType"in t?t.pointerType:"mouse"}function tr(t){return Array.from(t.touches).filter(e=>{var n,s;return e.target===t.currentTarget||((n=t.currentTarget)===null||n===void 0||(s=n.contains)===null||s===void 0?void 0:s.call(n,e.target))})}function nr(t){return t.type==="touchend"||t.type==="touchcancel"?t.changedTouches:t.targetTouches}function Cn(t){return re(t)?nr(t)[0]:t}function Te(t,e){try{const n=e.clientX-t.clientX,s=e.clientY-t.clientY,i=(e.clientX+t.clientX)/2,a=(e.clientY+t.clientY)/2,o=Math.hypot(n,s);return{angle:-(Math.atan2(n,s)*180)/Math.PI,distance:o,origin:[i,a]}}catch{}return null}function sr(t){return tr(t).map(e=>e.identifier)}function pt(t,e){const[n,s]=Array.from(t.touches).filter(i=>e.includes(i.identifier));return Te(n,s)}function fe(t){const e=Cn(t);return re(t)?e.identifier:e.pointerId}function H(t){const e=Cn(t);return[e.clientX,e.clientY]}const gt=40,vt=800;function An(t){let{deltaX:e,deltaY:n,deltaMode:s}=t;return s===1?(e*=gt,n*=gt):s===2&&(e*=vt,n*=vt),[e,n]}function ir(t){var e,n;const{scrollX:s,scrollY:i,scrollLeft:a,scrollTop:o}=t.currentTarget;return[(e=s??a)!==null&&e!==void 0?e:0,(n=i??o)!==null&&n!==void 0?n:0]}function ar(t){const e={};if("buttons"in t&&(e.buttons=t.buttons),"shiftKey"in t){const{shiftKey:n,altKey:s,metaKey:i,ctrlKey:a}=t;Object.assign(e,{shiftKey:n,altKey:s,metaKey:i,ctrlKey:a})}return e}function se(t,...e){return typeof t=="function"?t(...e):t}function or(){}function rr(...t){return t.length===0?or:t.length===1?t[0]:function(){let e;for(const n of t)e=n.apply(this,arguments)||e;return e}}function yt(t,e){return Object.assign({},e,t||{})}const lr=32;class In{constructor(e,n,s){this.ctrl=e,this.args=n,this.key=s,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(e){this.ctrl.state[this.key]=e}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:e,shared:n,ingKey:s,args:i}=this;n[s]=e._active=e.active=e._blocked=e._force=!1,e._step=[!1,!1],e.intentional=!1,e._movement=[0,0],e._distance=[0,0],e._direction=[0,0],e._delta=[0,0],e._bounds=[[-1/0,1/0],[-1/0,1/0]],e.args=i,e.axis=void 0,e.memo=void 0,e.elapsedTime=e.timeDelta=0,e.direction=[0,0],e.distance=[0,0],e.overflow=[0,0],e._movementBound=[!1,!1],e.velocity=[0,0],e.movement=[0,0],e.delta=[0,0],e.timeStamp=0}start(e){const n=this.state,s=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=e.target,n.currentTarget=e.currentTarget,n.lastOffset=s.from?se(s.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=e.timeStamp)}computeValues(e){const n=this.state;n._values=e,n.values=this.config.transform(e)}computeInitial(){const e=this.state;e._initial=e._values,e.initial=e.values}compute(e){const{state:n,config:s,shared:i}=this;n.args=this.args;let a=0;if(e&&(n.event=e,s.preventDefault&&e.cancelable&&n.event.preventDefault(),n.type=e.type,i.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,i.locked=!!document.pointerLockElement,Object.assign(i,ar(e)),i.down=i.pressed=i.buttons%2===1||i.touches>0,a=e.timeStamp-n.timeStamp,n.timeStamp=e.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const P=n._delta.map(Math.abs);I.addTo(n._distance,P)}this.axisIntent&&this.axisIntent(e);const[o,r]=n._movement,[l,u]=s.threshold,{_step:c,values:d}=n;if(s.hasCustomTransform?(c[0]===!1&&(c[0]=Math.abs(o)>=l&&d[0]),c[1]===!1&&(c[1]=Math.abs(r)>=u&&d[1])):(c[0]===!1&&(c[0]=Math.abs(o)>=l&&Math.sign(o)*l),c[1]===!1&&(c[1]=Math.abs(r)>=u&&Math.sign(r)*u)),n.intentional=c[0]!==!1||c[1]!==!1,!n.intentional)return;const m=[0,0];if(s.hasCustomTransform){const[P,jn]=d;m[0]=c[0]!==!1?P-c[0]:0,m[1]=c[1]!==!1?jn-c[1]:0}else m[0]=c[0]!==!1?o-c[0]:0,m[1]=c[1]!==!1?r-c[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(m);const h=n.offset,p=n._active&&!n._blocked||n.active;p&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=i[this.ingKey]=n._active,e&&(n.first&&("bounds"in s&&(n._bounds=se(s.bounds,n)),this.setup&&this.setup()),n.movement=m,this.computeOffset()));const[g,y]=n.offset,[[x,E],[C,O]]=n._bounds;n.overflow=[g<x?-1:g>E?1:0,y<C?-1:y>O?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const Rn=n._active?s.rubberband||[0,0]:[0,0];if(n.offset=qo(n._bounds,n.offset,Rn),n.delta=I.sub(n.offset,h),this.computeMovement(),p&&(!n.last||a>lr)){n.delta=I.sub(n.offset,h);const P=n.delta.map(Math.abs);I.addTo(n.distance,P),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&a>0&&(n.velocity=[P[0]/a,P[1]/a],n.timeDelta=a)}}emit(){const e=this.state,n=this.shared,s=this.config;if(e._active||this.clean(),(e._blocked||!e.intentional)&&!e._force&&!s.triggerAllEvents)return;const i=this.handler(T(T(T({},n),e),{},{[this.aliasKey]:e.values}));i!==void 0&&(e.memo=i)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function cr([t,e],n){const s=Math.abs(t),i=Math.abs(e);if(s>i&&s>n)return"x";if(i>s&&i>n)return"y"}class V extends In{constructor(...e){super(...e),D(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=I.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=I.sub(this.state.offset,this.state.lastOffset)}axisIntent(e){const n=this.state,s=this.config;if(!n.axis&&e){const i=typeof s.axisThreshold=="object"?s.axisThreshold[Fn(e)]:s.axisThreshold;n.axis=cr(n._movement,i)}n._blocked=(s.lockDirection||!!s.axis)&&!n.axis||!!s.axis&&s.axis!==n.axis}restrictToAxis(e){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":e[1]=0;break;case"y":e[0]=0;break}}}const ur=t=>t,Et=.15,Tn={enabled(t=!0){return t},eventOptions(t,e,n){return T(T({},n.shared.eventOptions),t)},preventDefault(t=!1){return t},triggerAllEvents(t=!1){return t},rubberband(t=0){switch(t){case!0:return[Et,Et];case!1:return[0,0];default:return I.toVector(t)}},from(t){if(typeof t=="function")return t;if(t!=null)return I.toVector(t)},transform(t,e,n){const s=t||n.shared.transform;return this.hasCustomTransform=!!s,s||ur},threshold(t){return I.toVector(t,0)}},dr=0,N=T(T({},Tn),{},{axis(t,e,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(t=dr){return t},bounds(t={}){if(typeof t=="function")return a=>N.bounds(t(a));if("current"in t)return()=>t.current;if(typeof HTMLElement=="function"&&t instanceof HTMLElement)return t;const{left:e=-1/0,right:n=1/0,top:s=-1/0,bottom:i=1/0}=t;return[[e,n],[s,i]]}}),bt={ArrowRight:(t,e=1)=>[t*e,0],ArrowLeft:(t,e=1)=>[-1*t*e,0],ArrowUp:(t,e=1)=>[0,-1*t*e],ArrowDown:(t,e=1)=>[0,t*e]};class mr extends V{constructor(...e){super(...e),D(this,"ingKey","dragging")}reset(){super.reset();const e=this.state;e._pointerId=void 0,e._pointerActive=!1,e._keyboardActive=!1,e._preventScroll=!1,e._delayed=!1,e.swipe=[0,0],e.tap=!1,e.canceled=!1,e.cancel=this.cancel.bind(this)}setup(){const e=this.state;if(e._bounds instanceof HTMLElement){const n=e._bounds.getBoundingClientRect(),s=e.currentTarget.getBoundingClientRect(),i={left:n.left-s.left+e.offset[0],right:n.right-s.right+e.offset[0],top:n.top-s.top+e.offset[1],bottom:n.bottom-s.bottom+e.offset[1]};e._bounds=N.bounds(i)}}cancel(){const e=this.state;e.canceled||(e.canceled=!0,e._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(e){const n=this.config,s=this.state;if(e.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(e.buttons):n.pointerButtons!==-1&&n.pointerButtons!==e.buttons))return;const i=this.ctrl.setEventIds(e);n.pointerCapture&&e.target.setPointerCapture(e.pointerId),!(i&&i.size>1&&s._pointerActive)&&(this.start(e),this.setupPointer(e),s._pointerId=fe(e),s._pointerActive=!0,this.computeValues(H(e)),this.computeInitial(),n.preventScrollAxis&&Fn(e)!=="mouse"?(s._active=!1,this.setupScrollPrevention(e)):n.delay>0?(this.setupDelayTrigger(e),n.triggerAllEvents&&(this.compute(e),this.emit())):this.startPointerDrag(e))}startPointerDrag(e){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(e),this.emit()}pointerMove(e){const n=this.state,s=this.config;if(!n._pointerActive)return;const i=fe(e);if(n._pointerId!==void 0&&i!==n._pointerId)return;const a=H(e);if(document.pointerLockElement===e.target?n._delta=[e.movementX,e.movementY]:(n._delta=I.sub(a,n._values),this.computeValues(a)),I.addTo(n._movement,n._delta),this.compute(e),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(e);return}if(s.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===s.preventScrollAxis||s.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(e);return}else return;this.emit()}pointerUp(e){this.ctrl.setEventIds(e);try{this.config.pointerCapture&&e.target.hasPointerCapture(e.pointerId)&&e.target.releasePointerCapture(e.pointerId)}catch{}const n=this.state,s=this.config;if(!n._active||!n._pointerActive)return;const i=fe(e);if(n._pointerId!==void 0&&i!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(e);const[a,o]=n._distance;if(n.tap=a<=s.tapsThreshold&&o<=s.tapsThreshold,n.tap&&s.filterTaps)n._force=!0;else{const[r,l]=n._delta,[u,c]=n._movement,[d,m]=s.swipe.velocity,[h,p]=s.swipe.distance,g=s.swipe.duration;if(n.elapsedTime<g){const y=Math.abs(r/n.timeDelta),x=Math.abs(l/n.timeDelta);y>d&&Math.abs(u)>h&&(n.swipe[0]=Math.sign(r)),x>m&&Math.abs(c)>p&&(n.swipe[1]=Math.sign(l))}}this.emit()}pointerClick(e){!this.state.tap&&e.detail>0&&(e.preventDefault(),e.stopPropagation())}setupPointer(e){const n=this.config,s=n.device;n.pointerLock&&e.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,s,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,s,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,s,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(e){this.state._preventScroll&&e.cancelable&&e.preventDefault()}setupScrollPrevention(e){this.state._preventScroll=!1,hr(e);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,e)}setupDelayTrigger(e){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(e)},this.config.delay)}keyDown(e){const n=bt[e.key];if(n){const s=this.state,i=e.shiftKey?10:e.altKey?.1:1;this.start(e),s._delta=n(this.config.keyboardDisplacement,i),s._keyboardActive=!0,I.addTo(s._movement,s._delta),this.compute(e),this.emit()}}keyUp(e){e.key in bt&&(this.state._keyboardActive=!1,this.setActive(),this.compute(e),this.emit())}bind(e){const n=this.config.device;e(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(e(n,"change",this.pointerMove.bind(this)),e(n,"end",this.pointerUp.bind(this)),e(n,"cancel",this.pointerUp.bind(this)),e("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(e("key","down",this.keyDown.bind(this)),e("key","up",this.keyUp.bind(this))),this.config.filterTaps&&e("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function hr(t){"persist"in t&&typeof t.persist=="function"&&t.persist()}const W=typeof window<"u"&&window.document&&window.document.createElement;function Dn(){return W&&"ontouchstart"in window}function fr(){return Dn()||W&&window.navigator.maxTouchPoints>1}function pr(){return W&&"onpointerdown"in window}function gr(){return W&&"exitPointerLock"in window.document}function vr(){try{return"constructor"in GestureEvent}catch{return!1}}const k={isBrowser:W,gesture:vr(),touch:Dn(),touchscreen:fr(),pointer:pr(),pointerLock:gr()},yr=250,Er=180,br=.5,xr=50,Fr=250,Cr=10,xt={mouse:0,touch:0,pen:8},Ar=T(T({},N),{},{device(t,e,{pointer:{touch:n=!1,lock:s=!1,mouse:i=!1}={}}){return this.pointerLock=s&&k.pointerLock,k.touch&&n?"touch":this.pointerLock?"mouse":k.pointer&&!i?"pointer":k.touch?"touch":"mouse"},preventScrollAxis(t,e,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&t?yr:void 0,!(!k.touchscreen||n===!1))return t||(n!==void 0?"y":void 0)},pointerCapture(t,e,{pointer:{capture:n=!0,buttons:s=1,keys:i=!0}={}}){return this.pointerButtons=s,this.keys=i,!this.pointerLock&&this.device==="pointer"&&n},threshold(t,e,{filterTaps:n=!1,tapsThreshold:s=3,axis:i=void 0}){const a=I.toVector(t,n?s:i?1:0);return this.filterTaps=n,this.tapsThreshold=s,a},swipe({velocity:t=br,distance:e=xr,duration:n=Fr}={}){return{velocity:this.transform(I.toVector(t)),distance:this.transform(I.toVector(e)),duration:n}},delay(t=0){switch(t){case!0:return Er;case!1:return 0;default:return t}},axisThreshold(t){return t?T(T({},xt),t):xt},keyboardDisplacement(t=Cr){return t}});function _n(t){const[e,n]=t.overflow,[s,i]=t._delta,[a,o]=t._direction;(e<0&&s>0&&a<0||e>0&&s<0&&a>0)&&(t._movement[0]=t._movementBound[0]),(n<0&&i>0&&o<0||n>0&&i<0&&o>0)&&(t._movement[1]=t._movementBound[1])}const Ir=30,Tr=100;class Dr extends In{constructor(...e){super(...e),D(this,"ingKey","pinching"),D(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const e=this.state;e._touchIds=[],e.canceled=!1,e.cancel=this.cancel.bind(this),e.turns=0}computeOffset(){const{type:e,movement:n,lastOffset:s}=this.state;e==="wheel"?this.state.offset=I.add(n,s):this.state.offset=[(1+n[0])*s[0],n[1]+s[1]]}computeMovement(){const{offset:e,lastOffset:n}=this.state;this.state.movement=[e[0]/n[0],e[1]-n[1]]}axisIntent(){const e=this.state,[n,s]=e._movement;if(!e.axis){const i=Math.abs(n)*Ir-Math.abs(s);i<0?e.axis="angle":i>0&&(e.axis="scale")}}restrictToAxis(e){this.config.lockDirection&&(this.state.axis==="scale"?e[1]=0:this.state.axis==="angle"&&(e[0]=0))}cancel(){const e=this.state;e.canceled||setTimeout(()=>{e.canceled=!0,e._active=!1,this.compute(),this.emit()},0)}touchStart(e){this.ctrl.setEventIds(e);const n=this.state,s=this.ctrl.touchIds;if(n._active&&n._touchIds.every(a=>s.has(a))||s.size<2)return;this.start(e),n._touchIds=Array.from(s).slice(0,2);const i=pt(e,n._touchIds);i&&this.pinchStart(e,i)}pointerStart(e){if(e.buttons!=null&&e.buttons%2!==1)return;this.ctrl.setEventIds(e),e.target.setPointerCapture(e.pointerId);const n=this.state,s=n._pointerEvents,i=this.ctrl.pointerIds;if(n._active&&Array.from(s.keys()).every(o=>i.has(o))||(s.size<2&&s.set(e.pointerId,e),n._pointerEvents.size<2))return;this.start(e);const a=Te(...Array.from(s.values()));a&&this.pinchStart(e,a)}pinchStart(e,n){const s=this.state;s.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(e),this.emit()}touchMove(e){if(!this.state._active)return;const n=pt(e,this.state._touchIds);n&&this.pinchMove(e,n)}pointerMove(e){const n=this.state._pointerEvents;if(n.has(e.pointerId)&&n.set(e.pointerId,e),!this.state._active)return;const s=Te(...Array.from(n.values()));s&&this.pinchMove(e,s)}pinchMove(e,n){const s=this.state,i=s._values[1],a=n.angle-i;let o=0;Math.abs(a)>270&&(o+=Math.sign(a)),this.computeValues([n.distance,n.angle-360*o]),s.origin=n.origin,s.turns=o,s._movement=[s._values[0]/s._initial[0]-1,s._values[1]-s._initial[1]],this.compute(e),this.emit()}touchEnd(e){this.ctrl.setEventIds(e),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(e),this.emit())}pointerEnd(e){const n=this.state;this.ctrl.setEventIds(e);try{e.target.releasePointerCapture(e.pointerId)}catch{}n._pointerEvents.has(e.pointerId)&&n._pointerEvents.delete(e.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(e),this.emit())}gestureStart(e){e.cancelable&&e.preventDefault();const n=this.state;n._active||(this.start(e),this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY],this.compute(e),this.emit())}gestureMove(e){if(e.cancelable&&e.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY];const s=n._movement;n._movement=[e.scale-1,e.rotation],n._delta=I.sub(n._movement,s),this.compute(e),this.emit()}gestureEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}wheel(e){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(s=>e[s]):!e[n])||(this.state._active?this.wheelChange(e):this.wheelStart(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(e){this.start(e),this.wheelChange(e)}wheelChange(e){"uv"in e||e.cancelable&&e.preventDefault();const s=this.state;s._delta=[-An(e)[1]/Tr*s.offset[0],0],I.addTo(s._movement,s._delta),_n(s),this.state.origin=[e.clientX,e.clientY],this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){const n=this.config.device;n&&(e(n,"start",this[n+"Start"].bind(this)),e(n,"change",this[n+"Move"].bind(this)),e(n,"end",this[n+"End"].bind(this)),e(n,"cancel",this[n+"End"].bind(this)),e("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&e("wheel","",this.wheel.bind(this),{passive:!1})}}const _r=T(T({},Tn),{},{device(t,e,{shared:n,pointer:{touch:s=!1}={}}){if(n.target&&!k.touch&&k.gesture)return"gesture";if(k.touch&&s)return"touch";if(k.touchscreen){if(k.pointer)return"pointer";if(k.touch)return"touch"}},bounds(t,e,{scaleBounds:n={},angleBounds:s={}}){const i=o=>{const r=yt(se(n,o),{min:-1/0,max:1/0});return[r.min,r.max]},a=o=>{const r=yt(se(s,o),{min:-1/0,max:1/0});return[r.min,r.max]};return typeof n!="function"&&typeof s!="function"?[i(),a()]:o=>[i(o),a(o)]},threshold(t,e,n){return this.lockDirection=n.axis==="lock",I.toVector(t,this.lockDirection?[.1,3]:0)},modifierKey(t){return t===void 0?"ctrlKey":t},pinchOnWheel(t=!0){return t}});class Sr extends V{constructor(...e){super(...e),D(this,"ingKey","moving")}move(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.state._active?this.moveChange(e):this.moveStart(e),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(e){this.start(e),this.computeValues(H(e)),this.compute(e),this.computeInitial(),this.emit()}moveChange(e){if(!this.state._active)return;const n=H(e),s=this.state;s._delta=I.sub(n,s._values),I.addTo(s._movement,s._delta),this.computeValues(n),this.compute(e),this.emit()}moveEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}bind(e){e("pointer","change",this.move.bind(this)),e("pointer","leave",this.moveEnd.bind(this))}}const Mr=T(T({},N),{},{mouseOnly:(t=!0)=>t});class kr extends V{constructor(...e){super(...e),D(this,"ingKey","scrolling")}scroll(e){this.state._active||this.start(e),this.scrollChange(e),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(e){e.cancelable&&e.preventDefault();const n=this.state,s=ir(e);n._delta=I.sub(s,n._values),I.addTo(n._movement,n._delta),this.computeValues(s),this.compute(e),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("scroll","",this.scroll.bind(this))}}const wr=N;class Br extends V{constructor(...e){super(...e),D(this,"ingKey","wheeling")}wheel(e){this.state._active||this.start(e),this.wheelChange(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(e){const n=this.state;n._delta=An(e),I.addTo(n._movement,n._delta),_n(n),this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("wheel","",this.wheel.bind(this))}}const Lr=N;class Rr extends V{constructor(...e){super(...e),D(this,"ingKey","hovering")}enter(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.start(e),this.computeValues(H(e)),this.compute(e),this.emit())}leave(e){if(this.config.mouseOnly&&e.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const s=H(e);n._movement=n._delta=I.sub(s,n._values),this.computeValues(s),this.compute(e),n.delta=n.movement,this.emit()}bind(e){e("pointer","enter",this.enter.bind(this)),e("pointer","leave",this.leave.bind(this))}}const jr=T(T({},N),{},{mouseOnly:(t=!0)=>t}),$e=new Map,De=new Map;function Or(t){$e.set(t.key,t.engine),De.set(t.key,t.resolver)}const Pr={key:"drag",engine:mr,resolver:Ar},$r={key:"hover",engine:Rr,resolver:jr},Nr={key:"move",engine:Sr,resolver:Mr},Ur={key:"pinch",engine:Dr,resolver:_r},Yr={key:"scroll",engine:kr,resolver:wr},zr={key:"wheel",engine:Br,resolver:Lr};function Gr(t,e){if(t==null)return{};var n={},s=Object.keys(t),i,a;for(a=0;a<s.length;a++)i=s[a],!(e.indexOf(i)>=0)&&(n[i]=t[i]);return n}function Hr(t,e){if(t==null)return{};var n=Gr(t,e),s,i;if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(t);for(i=0;i<a.length;i++)s=a[i],!(e.indexOf(s)>=0)&&Object.prototype.propertyIsEnumerable.call(t,s)&&(n[s]=t[s])}return n}const qr={target(t){if(t)return()=>"current"in t?t.current:t},enabled(t=!0){return t},window(t=k.isBrowser?window:void 0){return t},eventOptions({passive:t=!0,capture:e=!1}={}){return{passive:t,capture:e}},transform(t){return t}},Xr=["target","eventOptions","window","enabled","transform"];function te(t={},e){const n={};for(const[s,i]of Object.entries(e))switch(typeof i){case"function":n[s]=i.call(n,t[s],s,t);break;case"object":n[s]=te(t[s],i);break;case"boolean":i&&(n[s]=t[s]);break}return n}function Vr(t,e,n={}){const s=t,{target:i,eventOptions:a,window:o,enabled:r,transform:l}=s,u=Hr(s,Xr);if(n.shared=te({target:i,eventOptions:a,window:o,enabled:r,transform:l},qr),e){const c=De.get(e);n[e]=te(T({shared:n.shared},u),c)}else for(const c in u){const d=De.get(c);d&&(n[c]=te(T({shared:n.shared},u[c]),d))}return n}class Sn{constructor(e,n){D(this,"_listeners",new Set),this._ctrl=e,this._gestureKey=n}add(e,n,s,i,a){const o=this._listeners,r=er(n,s),l=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},u=T(T({},l),a);e.addEventListener(r,i,u);const c=()=>{e.removeEventListener(r,i,u),o.delete(c)};return o.add(c),c}clean(){this._listeners.forEach(e=>e()),this._listeners.clear()}}class Wr{constructor(){D(this,"_timeouts",new Map)}add(e,n,s=140,...i){this.remove(e),this._timeouts.set(e,window.setTimeout(n,s,...i))}remove(e){const n=this._timeouts.get(e);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(e=>void window.clearTimeout(e)),this._timeouts.clear()}}class Kr{constructor(e){D(this,"gestures",new Set),D(this,"_targetEventStore",new Sn(this)),D(this,"gestureEventStores",{}),D(this,"gestureTimeoutStores",{}),D(this,"handlers",{}),D(this,"config",{}),D(this,"pointerIds",new Set),D(this,"touchIds",new Set),D(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),Zr(this,e)}setEventIds(e){if(re(e))return this.touchIds=new Set(sr(e)),this.touchIds;if("pointerId"in e)return e.type==="pointerup"||e.type==="pointercancel"?this.pointerIds.delete(e.pointerId):e.type==="pointerdown"&&this.pointerIds.add(e.pointerId),this.pointerIds}applyHandlers(e,n){this.handlers=e,this.nativeHandlers=n}applyConfig(e,n){this.config=Vr(e,n,this.config)}clean(){this._targetEventStore.clean();for(const e of this.gestures)this.gestureEventStores[e].clean(),this.gestureTimeoutStores[e].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...e){const n=this.config.shared,s={};let i;if(!(n.target&&(i=n.target(),!i))){if(n.enabled){for(const o of this.gestures){const r=this.config[o],l=Ft(s,r.eventOptions,!!i);if(r.enabled){const u=$e.get(o);new u(this,e,o).bind(l)}}const a=Ft(s,n.eventOptions,!!i);for(const o in this.nativeHandlers)a(o,"",r=>this.nativeHandlers[o](T(T({},this.state.shared),{},{event:r,args:e})),void 0,!0)}for(const a in s)s[a]=rr(...s[a]);if(!i)return s;for(const a in s){const{device:o,capture:r,passive:l}=Qo(a);this._targetEventStore.add(i,o,"",s[a],{capture:r,passive:l})}}}}function Y(t,e){t.gestures.add(e),t.gestureEventStores[e]=new Sn(t,e),t.gestureTimeoutStores[e]=new Wr}function Zr(t,e){e.drag&&Y(t,"drag"),e.wheel&&Y(t,"wheel"),e.scroll&&Y(t,"scroll"),e.move&&Y(t,"move"),e.pinch&&Y(t,"pinch"),e.hover&&Y(t,"hover")}const Ft=(t,e,n)=>(s,i,a,o={},r=!1)=>{var l,u;const c=(l=o.capture)!==null&&l!==void 0?l:e.capture,d=(u=o.passive)!==null&&u!==void 0?u:e.passive;let m=r?s:Zo(s,i,c);n&&d&&(m+="Passive"),t[m]=t[m]||[],t[m].push(a)},Jr=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function Qr(t){const e={},n={},s=new Set;for(let i in t)Jr.test(i)?(s.add(RegExp.lastMatch),n[i]=t[i]):e[i]=t[i];return[n,e,s]}function z(t,e,n,s,i,a){if(!t.has(n)||!$e.has(s))return;const o=n+"Start",r=n+"End",l=u=>{let c;return u.first&&o in e&&e[o](u),n in e&&(c=e[n](u)),u.last&&r in e&&e[r](u),c};i[s]=l,a[s]=a[s]||{}}function el(t,e){const[n,s,i]=Qr(t),a={};return z(i,n,"onDrag","drag",a,e),z(i,n,"onWheel","wheel",a,e),z(i,n,"onScroll","scroll",a,e),z(i,n,"onPinch","pinch",a,e),z(i,n,"onMove","move",a,e),z(i,n,"onHover","hover",a,e),{handlers:a,config:e,nativeHandlers:s}}function tl(t,e={},n,s){const i=$.useMemo(()=>new Kr(t),[]);if(i.applyHandlers(t,s),i.applyConfig(e,n),$.useEffect(i.effect.bind(i)),$.useEffect(()=>i.clean.bind(i),[]),e.target===void 0)return i.bind.bind(i)}function nl(t){return t.forEach(Or),function(n,s){const{handlers:i,nativeHandlers:a,config:o}=el(n,s||{});return tl(i,o,void 0,a)}}function sl(t,e){return nl([Pr,Ur,Yr,zr,Nr,$r])(t,e||{})}function il(t){X("translateViewport",t)}function al(t){oe("translateViewport",t)}function ol({children:t,onGetViewportConfiguration:e}){const n=b.useRef(null),s=$.useMemo(e,[e]),[i,a]=b.useState(s.initialZoom),[o,r]=b.useState(s.initialTranslate),[l,u]=b.useState(!1),c=b.useCallback((d,m)=>{const{minX:h,minY:p,maxX:g,maxY:y}=s,x=window.innerWidth,E=window.innerHeight,C=Math.min(Math.max(m,Math.max(x/(g-h),E/(y-p))),4),O={x:Math.min(Math.max(d.x,-(g-x/C)),-h),y:Math.min(Math.max(d.y,-(y-E/C)),-p)};r(O),a(C)},[s]);return b.useEffect(()=>{c(s.initialTranslate,s.initialZoom)},[]),sl({onPinch({origin:d,delta:m,pinching:h}){var E;u(h);const p=i+m[0],g=(E=n.current)==null?void 0:E.getBoundingClientRect(),y=d[0]-((g==null?void 0:g.left)??0),x=d[1]-((g==null?void 0:g.top)??0);c({x:o.x-(y/i-y/p),y:o.y-(x/i-x/p)},p)},onWheel({event:d,delta:[m,h],wheeling:p}){d.preventDefault(),u(p),c({x:o.x-m/i,y:o.y-h/i},i)}},{target:n,eventOptions:{passive:!1}}),al(d=>{const m=window.innerWidth,h=window.innerHeight,p=m/2-d.x*i,g=h/2-d.y*i;c({x:p/i,y:g/i},i)}),f.jsx(rl,{children:f.jsx(ll,{ref:n,children:f.jsx(cl,{style:{"--zoom":i,"--translate-x":o.x,"--translate-y":o.y},"data-is-interacting":l,children:t})})})}const rl=F.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,ll=F.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,cl=F.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function ul({worldState:t}){const e=b.useRef(t);return f.jsx(go,{children:f.jsx(ho,{children:f.jsx(ol,{onGetViewportConfiguration:b.useCallback(()=>dl(e.current),[e]),children:f.jsx(zo,{state:t})})})})}function dl(t){const e=t.states.find(y=>y.isPlayerControlled),n=window.innerWidth,s=window.innerHeight,i=e?t.sectors.filter(y=>y.stateId===e.id):t.sectors;let a=1/0,o=1/0,r=-1/0,l=-1/0;i.forEach(y=>{a=Math.min(a,y.rect.left),o=Math.min(o,y.rect.top),r=Math.max(r,y.rect.right),l=Math.max(l,y.rect.bottom)});const u=r-a+1,c=l-o+1,d=n/u,m=s/c,h=Math.min(d,m)*1,p=(a+r)/2,g=(o+l)/2;return t.sectors.forEach(y=>{a=Math.min(a,y.rect.left),o=Math.min(o,y.rect.top),r=Math.max(r,y.rect.right),l=Math.max(l,y.rect.bottom)}),{initialTranslate:{x:n/2-p*h,y:s/2-g*h},initialZoom:h,minX:a,minY:o,maxX:r,maxY:l}}const Mn="fullScreenMessage",kn="fullScreenMessageAction";function B(t,e,n,s="",i,a,o){X(Mn,{message:t,startTimestamp:e,endTimestamp:n,messageId:s,actions:i,prompt:a,fullScreen:o??!!(i!=null&&i.length)})}function wn(t,e){X(kn,{messageId:t,actionId:e})}function Bn(t){oe(Mn,e=>{t(e)})}function Ne(t){oe(kn,e=>{t(e)})}function ml({worldState:t,onGameOver:e}){const[n,s]=b.useState(null),[i,a]=b.useState(!1);return b.useEffect(()=>{var h;if(i)return;const o=gn(t),r=Object.values(o).filter(p=>p>0).length,l=t.launchSites.length===0,u=t.timestamp,c=t.states.filter(p=>o[p.id]>0&&Object.entries(p.strategies).filter(([g,y])=>o[g]>0&&y===v.HOSTILE).length>0),d=t.launchSites.some(p=>p.lastLaunchTimestamp&&u-p.lastLaunchTimestamp<le),m=le-u;if(!c.length&&!d&&m>0&&m<=10&&(n?B(`Game will end in ${Math.ceil(m)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):s(u)),r<=1||l||!c.length&&!d&&u>le){const p=r===1?(h=t.states.find(g=>o[g.id]>0))==null?void 0:h.id:void 0;a(!0),B(["Game Over!","Results will be shown shortly..."],u,u+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{e({populations:o,winner:p,stateNames:Object.fromEntries(t.states.map(g=>[g.id,g.name])),playerStateId:t.states.find(g=>g.isPlayerControlled).id})},5e3)}},[t,e,n,i]),null}const hl="/assets/player-lost-background-D2A_VJ6-.png",fl="/assets/player-won-background-CkXgF24i.png",Ct="/assets/draw-background-EwLQ9g28.png",pl=F.div`
  height: 100vh;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: url(${t=>t.backgroundImage});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.7;
    pointer-events: none;
    z-index: 0;
  }

  > div {
    z-index: 1;
    background-color: rgba(0, 0, 0, 0.7);
    padding: 2rem;
    border-radius: 10px;
    text-align: center;
  }

  h2 {
    font-size: 3rem;
    color: #ffffff;
    margin-bottom: 1rem;
  }

  p {
    font-size: 1.5rem;
    color: #ffffff;
    margin-bottom: 2rem;
  }

  button {
    font-size: 1.5rem;
    padding: 10px 20px;
    background-color: #ff4500;
    color: #ffffff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s ease;

    &:hover {
      background-color: #ff6347;
    }
  }

  a {
    display: inline-block;
    margin-top: 1rem;
    font-size: 1.2rem;
    color: #ffffff;
    text-decoration: none;
    transition: color 0.3s ease;

    &:hover {
      color: #ff4500;
    }
  }
`,gl=({setGameState:t})=>{const{state:{result:e}}=It(),n=()=>{t(ie,{stateName:e.stateNames[e.playerStateId]})};let s,i;return e.winner?e.winner===e.playerStateId?(s=fl,i=`Congratulations! ${e.stateNames[e.playerStateId]} has won with ${ne(e.populations[e.playerStateId])} population alive.`):e.winner!==void 0?(s=hl,i=`${e.stateNames[e.winner]} has won with ${ne(e.populations[e.winner])} population alive. Your state has fallen.`):(s=Ct,i="The game has ended in an unexpected state."):(s=Ct,i="It's a draw! The world is partially destroyed, but there's still hope."),f.jsx(pl,{backgroundImage:s,children:f.jsxs("div",{children:[f.jsx("h2",{children:"Game Over"}),f.jsx("p",{children:i}),f.jsx("button",{onClick:n,children:"Play Again"}),f.jsx("br",{}),f.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},_e={Component:gl,path:"played"};function vl({worldState:t}){var u;const[e,n]=b.useState([]),[s,i]=b.useState(null);Bn(c=>{n(d=>c.messageId&&d.find(m=>m.messageId===c.messageId)?[...d.map(m=>m.messageId===c.messageId?c:m)]:[c,...d])});const a=e.sort((c,d)=>c.actions&&!d.actions?-1:!c.actions&&d.actions?1:c.startTimestamp-d.startTimestamp);if(Ne(c=>{n(d=>d.filter(m=>m.messageId!==c.messageId))}),b.useEffect(()=>{const c=a.find(d=>d.fullScreen&&d.startTimestamp<=t.timestamp&&d.endTimestamp>t.timestamp);i(c||null)},[a,t.timestamp]),!s)return null;const r=((c,d)=>d<c.startTimestamp?"pre":d<c.startTimestamp+.5?"pre-in":d>c.endTimestamp-.5?"post-in":d>c.endTimestamp?"post":"active")(s,t.timestamp),l=c=>Array.isArray(c)?c.map((d,m)=>f.jsx("div",{children:d},m)):c;return f.jsxs(bl,{"data-message-state":r,"data-action":(((u=s.actions)==null?void 0:u.length)??0)>0,children:[f.jsx(xl,{children:l(s.message)}),s.prompt&&s.actions&&f.jsx(Fl,{children:s.actions.map((c,d)=>f.jsx(Cl,{onClick:()=>wn(s.messageId,c.id),children:c.text},d))})]})}const yl=ae`
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
`,El=ae`
  from {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: translateX(-50%) scale(0.9);
  }
`,bl=F.div`
  position: fixed;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
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
    animation: ${yl} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${El} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,xl=F.div`
  font-size: 1.5rem;
  color: white;
  text-align: center;
  white-space: pre-line;
`,Fl=F.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,Cl=F.button`
  font-size: 1.5rem;
  padding: 1rem 2rem;
  margin: 0 1rem;
  background-color: black;
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
`,Ln="ALLIANCEPROPOSAL";function Al(t,e,n,s=!1){const i=`${Ln}_${t.id}_${e.id}`,a=s?`${t.name} has become friendly towards you. Do you want to form an alliance?`:`${t.name} proposes an alliance with ${e.name}. Do you accept?`,o=n.timestamp,r=o+10;B(a,o,r,i,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function Il({worldState:t,setWorldState:e}){return Ne(n=>{if(n.messageId.startsWith(Ln)){const[,s,i]=n.messageId.split("_"),a=t.states.find(r=>r.id===s),o=t.states.find(r=>r.id===i);if(!a||!(o!=null&&o.isPlayerControlled))return;if(n.actionId==="accept"){const r=t.states.map(l=>l.id===s||l.id===i?{...l,strategies:{...l.strategies,[s]:v.FRIENDLY,[i]:v.FRIENDLY}}:l);e({...t,states:r}),B(`Alliance formed between ${a.name} and ${o.name}!`,t.timestamp,t.timestamp+5)}else n.actionId==="reject"&&B(`${o.name} has rejected the alliance proposal from ${a.name}.`,t.timestamp,t.timestamp+5)}}),null}function Tl({worldState:t}){const e=t.states.find(h=>h.isPlayerControlled),[n,s]=b.useState(!1),[i,a]=b.useState({}),[o,r]=b.useState([]),[l,u]=b.useState([]),[c,d]=b.useState(!1),m=Math.round(t.timestamp*10)/10;return b.useEffect(()=>{!n&&t.timestamp>0&&(s(!0),B("The game has started!",t.timestamp,t.timestamp+3))},[m]),b.useEffect(()=>{var h,p,g,y;if(e){const x=Object.fromEntries(t.states.map(E=>[E.id,E.strategies]));for(const E of t.states)for(const C of t.states.filter(O=>O.id!==E.id))e&&C.id===e.id&&E.strategies[C.id]===v.FRIENDLY&&C.strategies[E.id]!==v.FRIENDLY&&((h=i[E.id])==null?void 0:h[C.id])!==v.FRIENDLY&&Al(E,e,t,!0),C.strategies[E.id]===v.FRIENDLY&&E.strategies[C.id]===v.FRIENDLY&&(((p=i[C.id])==null?void 0:p[E.id])!==v.FRIENDLY||((g=i[E.id])==null?void 0:g[C.id])!==v.FRIENDLY)&&B(`${C.name} has formed alliance with ${E.isPlayerControlled?"you":E.name}!`,m,m+3),E.strategies[C.id]===v.HOSTILE&&((y=i[E.id])==null?void 0:y[C.id])!==v.HOSTILE&&B(C.isPlayerControlled?`${E.name} has declared war on You!`:`${E.isPlayerControlled?"You have":E.name} declared war on ${C.name}!`,m,m+3,void 0,void 0,void 0,E.isPlayerControlled||C.isPlayerControlled);a(x)}},[m]),b.useEffect(()=>{e&&t.cities.forEach(h=>{const p=o.find(E=>E.id===h.id);if(!p)return;const g=h.population||0,y=p.population,x=Math.floor(y-g);x>0&&(h.stateId===e.id&&B(g===0?`Your city ${h.name} has been destroyed!`:[`Your city ${h.name} has been hit!`,`${x} casualties reported.`],m,m+3,void 0,void 0,!1,!0),X("cityDamage"))}),r(t.cities.map(h=>({...h})))},[m]),b.useEffect(()=>{if(e){const h=t.launchSites.filter(p=>p.stateId===e.id);l.length>0&&l.filter(g=>!h.some(y=>y.id===g.id)).forEach(()=>{B("One of your launch sites has been destroyed!",m,m+3,void 0,void 0,!1,!0)}),u(h)}},[m]),b.useEffect(()=>{if(e&&!c){const h=t.cities.filter(y=>y.stateId===e.id),p=t.launchSites.filter(y=>y.stateId===e.id);!h.some(y=>y.population>0)&&p.length===0&&(B(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],m,m+5,void 0,void 0,!1,!0),d(!0))}},[m]),null}function Dl({worldState:t}){const[e,n]=b.useState([]);Bn(o=>{n(r=>o.messageId&&r.find(l=>l.messageId===o.messageId)?[...r.map(l=>l.messageId===o.messageId?o:l)]:[o,...r])}),Ne(o=>{n(r=>r.filter(l=>l.messageId!==o.messageId))});const s=o=>Array.isArray(o)?o.map((r,l)=>f.jsx("div",{children:r},l)):o,i=(o,r)=>{const c=r-o;return c>60?0:c>50?1-(c-50)/10:1},a=b.useMemo(()=>{const o=t.timestamp,r=60;return e.filter(l=>{const u=l.startTimestamp||0;return o-u<=r}).map(l=>({...l,opacity:i(l.startTimestamp||0,o)}))},[e,t.timestamp]);return f.jsx(_l,{children:a.map((o,r)=>f.jsxs(Sl,{style:{opacity:o.opacity},children:[f.jsx("div",{children:s(o.message)}),o.prompt&&o.actions&&f.jsx(Ml,{children:o.actions.map((l,u)=>f.jsx(kl,{onClick:()=>wn(o.messageId,l.id),children:l.text},u))})]},r))})}const _l=F.div`
  position: fixed;
  right: 0;
  max-height: 300px;
  top: 10px;
  width: 300px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  overflow-y: auto;
  padding: 10px;
  font-size: 10px;
  display: flex;
  flex-direction: column-reverse;
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,Sl=F.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,Ml=F.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,kl=F.button`
  font-size: 10px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function wl({updateWorldTime:t,currentWorldTime:e}){const[n,s]=b.useState(!1),i=b.useRef(null);bn(o=>{if(!i.current){i.current=o;return}const r=o-i.current;i.current=o,!(r<=0)&&n&&t(r/1e3)},!0);const a=o=>{const r=Math.floor(o/86400),l=Math.floor(o%86400/3600),u=Math.floor(o%3600/60),c=Math.floor(o%60);return[[r,"d"],[l,"h"],[u,"m"],[c,"s"]].filter(([d])=>!!d).map(([d,m])=>String(d)+m).join(" ")};return f.jsx(Bl,{children:f.jsxs(Ll,{children:[f.jsxs(Rl,{children:[e>0?"Current Time: ":"Game not started yet",a(e)]}),f.jsx(Z,{onClick:()=>t(1),children:"+1s"}),f.jsx(Z,{onClick:()=>t(10),children:"+10s"}),f.jsx(Z,{onClick:()=>t(60),children:"+1m"}),f.jsx(Z,{onClick:()=>s(!n),children:n?"Stop":"Start"})]})})}const Bl=F.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,Ll=F.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,Z=F.button`
  background-color: #2c3e50;
  color: #ecf0f1;
  border: none;
  padding: 8px 12px;
  margin: 5px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;

  &:hover {
    background-color: #34495e;
  }

  &:active {
    background-color: #2980b9;
  }
`,Rl=F.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`;function jl({worldState:t}){const e=t.states.find(r=>r.isPlayerControlled);if(!e)return null;const n=(r,l,u=!1)=>{e.strategies[r.id]=l,u&&(r.strategies[e.id]=l)},s=r=>{if(r.id===e.id)return"#4CAF50";const l=e.strategies[r.id],u=r.strategies[e.id];return l===v.FRIENDLY&&u===v.FRIENDLY?"#4CAF50":l===v.HOSTILE||u===v.HOSTILE?"#F44336":"#9E9E9E"},i=gn(t),a=r=>{const l=t.cities.filter(h=>h.stateId===r),u=t.launchSites.filter(h=>h.stateId===r);if(l.length===0&&u.length===0){console.warn("No position information available for this state");return}const c=[...l.map(h=>h.position),...u.map(h=>h.position)],d=c.reduce((h,p)=>({x:h.x+p.x,y:h.y+p.y}),{x:0,y:0}),m={x:d.x/c.length,y:d.y/c.length};il(m)},o=r=>{const l=e.strategies[r.id],u=r.strategies[e.id];return f.jsxs(zl,{children:[(l===v.NEUTRAL&&u!==v.HOSTILE||l===v.FRIENDLY&&u!==v.FRIENDLY)&&f.jsx(J,{color:"#4CAF50",onClick:c=>{c.stopPropagation(),n(r,v.FRIENDLY)},disabled:l===v.FRIENDLY&&u!==v.FRIENDLY,children:"Alliance"}),(l===v.HOSTILE||u===v.HOSTILE)&&f.jsx(J,{color:"#9E9E9E",onClick:c=>{c.stopPropagation(),n(r,v.NEUTRAL)},disabled:l===v.NEUTRAL&&u!==v.NEUTRAL,children:"Peace"}),l===v.FRIENDLY&&u===v.FRIENDLY&&f.jsx(J,{color:"#9E9E9E",onClick:c=>{c.stopPropagation(),n(r,v.NEUTRAL,!0)},children:"Neutral"}),l===v.NEUTRAL&&u!==v.HOSTILE&&f.jsx(J,{color:"#F44336",onClick:c=>{c.stopPropagation(),n(r,v.HOSTILE,!0)},children:"Attack"})]})};return f.jsx(Ol,{children:t.states.map(r=>f.jsxs(Pl,{relationshipColor:s(r),onClick:()=>a(r.id),children:[f.jsx($l,{style:{color:r.color},children:r.name.charAt(0)}),f.jsxs(Nl,{children:[f.jsx(Ul,{children:r.name}),f.jsxs(Yl,{children:["👤 ",ne(i[r.id])]}),r.id!==e.id?o(r):f.jsx(Gl,{children:"This is you"})]})]},r.id))})}const Ol=F.div`
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 1;
  padding: 10px;
  color: white;
  background: rgba(0, 0, 0, 0.9);
  border-top: 1px solid rgb(0, 255, 0);
  display: flex;
  justify-content: space-around;
  flex-wrap: wrap;
`,Pl=F.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 10px;
  background: ${t=>`rgba(${parseInt(t.relationshipColor.slice(1,3),16)}, ${parseInt(t.relationshipColor.slice(3,5),16)}, ${parseInt(t.relationshipColor.slice(5,7),16)}, 0.2)`};
  border: 2px solid ${t=>t.relationshipColor};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,$l=F.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,Nl=F.div`
  display: flex;
  flex-direction: column;
`,Ul=F.span`
  font-weight: bold;
  margin-bottom: 5px;
`,Yl=F.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`,zl=F.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`,J=F.button`
  background-color: ${t=>t.color};
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8em;
  transition: opacity 0.3s ease;
  ${t=>t.disabled?"pointer-events: none; opacity: 0.5;":""}

  &:hover {
    opacity: 0.8;
  }
`,Gl=F.span`
  font-style: italic;
  color: #4caf50;
`,Hl=({setGameState:t})=>{const{state:{stateName:e}}=It(),{worldState:n,setWorldState:s,updateWorldState:i}=co(e);return f.jsxs(f.Fragment,{children:[f.jsx(ul,{worldState:n}),f.jsx(wl,{updateWorldTime:a=>i(n,a),currentWorldTime:n.timestamp??0}),f.jsx(vl,{worldState:n}),f.jsx(jl,{worldState:n}),f.jsx(Dl,{worldState:n}),f.jsx(ml,{worldState:n,onGameOver:a=>t(_e,{result:a})}),f.jsx(Tl,{worldState:n}),f.jsx(Il,{worldState:n,setWorldState:s})]})},ie={Component:Hl,path:"playing"},ql="/assets/play-background-BASXrsIB.png",Xl=F.div`
  height: 100vh;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: url(${ql});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.7;
    pointer-events: none;
    z-index: 0;
  }

  > div {
    background-color: rgba(0, 0, 0, 0.7);
    border-radius: 10px;
    z-index: 1;
    width: 600px;
    padding: 2em;
    box-shadow: 0px 0px 5px black;
  }

  input {
    font-size: 1.2rem;
    padding: 10px;
    margin-bottom: 20px;
    border: 2px solid #ff4500;
    border-radius: 5px;
    background-color: rgba(255, 255, 255, 0.8);
  }

  button {
    font-size: 1.5rem;
    padding: 10px 20px;
    background-color: #ff4500;
    color: #ffffff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s ease;

    &:hover {
      background-color: #ff6347;
    }

    &:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
    }
  }

  a {
    display: inline-block;
    margin-top: 1rem;
    font-size: 1.2rem;
    color: #ffffff;
    text-decoration: none;
    transition: color 0.3s ease;

    &:hover {
      color: #ff4500;
    }
  }
`,Vl=({setGameState:t})=>{const[e,n]=b.useState(pn(1)[0]),s=()=>{t(ie,{stateName:e})};return f.jsx(Xl,{children:f.jsxs("div",{children:[f.jsx("h1",{children:"Name your state:"}),f.jsx("input",{type:"text",placeholder:"Type your state name here",value:e,onChange:i=>n(i.currentTarget.value)}),f.jsx("br",{}),f.jsx("button",{onClick:s,disabled:!e,children:"Start game"}),f.jsx("br",{}),f.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Se={Component:Vl,path:"play"},Wl="/assets/intro-background-D_km5uka.png",Kl="/assets/nukes-game-title-vcFxx9vI.png",Zl=ae`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,Jl=ae`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,Ql=F.div`
  height: 100vh;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: url(${Wl});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${Zl} 60s ease-in-out infinite;
  }

  img {
    margin-left: -10px;
    margin-top: -20px;
    margin-right: -10px;
  }

  button {
    font-size: 2.5rem;
    padding: 10px 20px;
    background-color: #ff4500;
    color: #ffffff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    margin-top: 20px;

    &:hover {
      background-color: #ff6347;
    }
  }
`,ec=F.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${t=>t.isFlashing?1:0};
  animation: ${t=>t.isFlashing?Jl:"none"} 4.5s forwards;
`,tc=F.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,nc=F.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,sc=({setGameState:t})=>{const[e,n]=b.useState(!0);return b.useEffect(()=>{const s=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(s)},[]),f.jsxs(Ql,{children:[f.jsx(ec,{isFlashing:e}),!e&&f.jsxs(tc,{children:[f.jsx(nc,{src:Kl,alt:"Nukes game"}),f.jsx("button",{onClick:()=>t(Se),children:"Play"})]})]})},At={Component:sc,path:""},ic=Nn`
:root {
  font-family: 'Press Start 2P', system-ui;
  font-size: 13px;
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

input {
  font-family: 'Press Start 2P', system-ui;
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
`,ac=[{path:At.path,element:f.jsx(Q,{state:At})},{path:Se.path,element:f.jsx(Q,{state:Se})},{path:ie.path,element:f.jsx(Q,{state:ie})},{path:_e.path,element:f.jsx(Q,{state:_e})}];function lc(){var n;const[t]=Pn(),e=t.get("path")??"";return f.jsx(f.Fragment,{children:(n=ac.find(s=>s.path===e))==null?void 0:n.element})}function Q({state:t}){const e=$n();return f.jsxs(f.Fragment,{children:[f.jsx(ic,{}),f.jsx(t.Component,{setGameState:(n,s)=>e({search:"path="+n.path},{state:s})})]})}export{lc as NukesApp,ac as routes};
