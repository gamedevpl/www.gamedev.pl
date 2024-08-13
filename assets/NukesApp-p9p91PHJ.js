import{c as B,g as $n,r as E,j as f,R as $,u as Tt,a as Nn,b as Un}from"./index-p3JpQwES.js";import{d as F,m as oe,f as Yn}from"./styled-components.browser.esm-Btt9BzWG.js";const ke=20,te=ke*1.5,ge=5,L=20,Gn=1,Hn=5,zn=L/Hn,Dt=.5,_t=500,Z=.05,ve=5,qn=4,le=60,C=16,O=C*5,St=1e3,Be=O*4,Vn=10,Xn=ke/10,Wn=1e3,Kn=1,Zn=.1,Jn=.1,Qn=.1,D=C*.7;var v=(e=>(e.NEUTRAL="NEUTRAL",e.FRIENDLY="FRIENDLY",e.HOSTILE="HOSTILE",e))(v||{}),Mt=(e=>(e.LAUNCH_SITE="LAUNCH_SITE",e))(Mt||{}),S=(e=>(e.WATER="WATER",e.GROUND="GROUND",e))(S||{}),M=(e=>(e.ATTACK="ATTACK",e.DEFENCE="DEFENCE",e))(M||{});function es(e,t){const n=[];for(let s=0;s<t;s++)for(let i=0;i<e;i++)n.push({id:`${i*C},${s*C}`,position:{x:i*C,y:s*C},rect:{left:i*C,top:s*C,right:(i+1)*C,bottom:(s+1)*C},type:S.WATER,depth:0,height:0,population:0});return n}function ts(e,t,n){const s=[],i=Array(n).fill(null).map(()=>Array(t).fill(!1));for(let a=0;a<n;a++)for(let o=0;o<t;o++){const r=a*t+o;e[r].type===S.WATER&&ns(o,a,t,n,e)&&(s.push([o,a,0]),i[a][o]=!0)}for(;s.length>0;){const[a,o,r]=s.shift(),c=o*t+a;e[c].type===S.WATER?e[c].depth=r+(Math.random()-Math.random())/5:e[c].type===S.GROUND&&(e[c].height=Math.sqrt(r)+(Math.random()-Math.random())/10);const u=[[-1,0],[1,0],[0,-1],[0,1]];for(const[l,d]of u){const m=a+l,h=o+d;kt(m,h,t,n)&&!i[h][m]&&(s.push([m,h,r+1]),i[h][m]=!0)}}}function ns(e,t,n,s,i){return[[-1,0],[1,0],[0,-1],[0,1]].some(([o,r])=>{const c=e+o,u=t+r;if(kt(c,u,n,s)){const l=u*n+c;return i[l].type===S.GROUND}return!1})}function kt(e,t,n,s){return e>=0&&e<n&&t>=0&&t<s}var Bt={exports:{}},ss=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(e){var t=ss,n=t.filter(function(i){return!!i.css}),s=t.filter(function(i){return!!i.vga});e.exports=function(i){var a=e.exports.get(i);return a&&a.value},e.exports.get=function(i){return i=i||"",i=i.trim().toLowerCase(),t.filter(function(a){return a.name.toLowerCase()===i}).pop()},e.exports.all=e.exports.get.all=function(){return t},e.exports.get.css=function(i){return i?(i=i||"",i=i.trim().toLowerCase(),n.filter(function(a){return a.name.toLowerCase()===i}).pop()):n},e.exports.get.vga=function(i){return i?(i=i||"",i=i.trim().toLowerCase(),s.filter(function(a){return a.name.toLowerCase()===i}).pop()):s}})(Bt);var is=Bt.exports,as=1/0,os="[object Symbol]",rs=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,wt="\\ud800-\\udfff",cs="\\u0300-\\u036f\\ufe20-\\ufe23",ls="\\u20d0-\\u20f0",Lt="\\u2700-\\u27bf",Rt="a-z\\xdf-\\xf6\\xf8-\\xff",us="\\xac\\xb1\\xd7\\xf7",ds="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",ms="\\u2000-\\u206f",fs=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",Ot="A-Z\\xc0-\\xd6\\xd8-\\xde",hs="\\ufe0e\\ufe0f",jt=us+ds+ms+fs,Pt="['’]",Ye="["+jt+"]",ps="["+cs+ls+"]",$t="\\d+",gs="["+Lt+"]",Nt="["+Rt+"]",Ut="[^"+wt+jt+$t+Lt+Rt+Ot+"]",vs="\\ud83c[\\udffb-\\udfff]",ys="(?:"+ps+"|"+vs+")",bs="[^"+wt+"]",Yt="(?:\\ud83c[\\udde6-\\uddff]){2}",Gt="[\\ud800-\\udbff][\\udc00-\\udfff]",H="["+Ot+"]",Es="\\u200d",Ge="(?:"+Nt+"|"+Ut+")",xs="(?:"+H+"|"+Ut+")",He="(?:"+Pt+"(?:d|ll|m|re|s|t|ve))?",ze="(?:"+Pt+"(?:D|LL|M|RE|S|T|VE))?",Ht=ys+"?",zt="["+hs+"]?",Fs="(?:"+Es+"(?:"+[bs,Yt,Gt].join("|")+")"+zt+Ht+")*",Cs=zt+Ht+Fs,As="(?:"+[gs,Yt,Gt].join("|")+")"+Cs,Is=RegExp([H+"?"+Nt+"+"+He+"(?="+[Ye,H,"$"].join("|")+")",xs+"+"+ze+"(?="+[Ye,H+Ge,"$"].join("|")+")",H+"?"+Ge+"+"+He,H+"+"+ze,$t,As].join("|"),"g"),Ts=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,Ds=typeof B=="object"&&B&&B.Object===Object&&B,_s=typeof self=="object"&&self&&self.Object===Object&&self,Ss=Ds||_s||Function("return this")();function Ms(e){return e.match(rs)||[]}function ks(e){return Ts.test(e)}function Bs(e){return e.match(Is)||[]}var ws=Object.prototype,Ls=ws.toString,qe=Ss.Symbol,Ve=qe?qe.prototype:void 0,Xe=Ve?Ve.toString:void 0;function Rs(e){if(typeof e=="string")return e;if(js(e))return Xe?Xe.call(e):"";var t=e+"";return t=="0"&&1/e==-as?"-0":t}function Os(e){return!!e&&typeof e=="object"}function js(e){return typeof e=="symbol"||Os(e)&&Ls.call(e)==os}function Ps(e){return e==null?"":Rs(e)}function $s(e,t,n){return e=Ps(e),t=n?void 0:t,t===void 0?ks(e)?Bs(e):Ms(e):e.match(t)||[]}var Ns=$s,Us=1/0,Ys="[object Symbol]",Gs=/^\s+/,we="\\ud800-\\udfff",qt="\\u0300-\\u036f\\ufe20-\\ufe23",Vt="\\u20d0-\\u20f0",Xt="\\ufe0e\\ufe0f",Hs="["+we+"]",ye="["+qt+Vt+"]",be="\\ud83c[\\udffb-\\udfff]",zs="(?:"+ye+"|"+be+")",Wt="[^"+we+"]",Kt="(?:\\ud83c[\\udde6-\\uddff]){2}",Zt="[\\ud800-\\udbff][\\udc00-\\udfff]",Jt="\\u200d",Qt=zs+"?",en="["+Xt+"]?",qs="(?:"+Jt+"(?:"+[Wt,Kt,Zt].join("|")+")"+en+Qt+")*",Vs=en+Qt+qs,Xs="(?:"+[Wt+ye+"?",ye,Kt,Zt,Hs].join("|")+")",Ws=RegExp(be+"(?="+be+")|"+Xs+Vs,"g"),Ks=RegExp("["+Jt+we+qt+Vt+Xt+"]"),Zs=typeof B=="object"&&B&&B.Object===Object&&B,Js=typeof self=="object"&&self&&self.Object===Object&&self,Qs=Zs||Js||Function("return this")();function ei(e){return e.split("")}function ti(e,t,n,s){for(var i=e.length,a=n+-1;++a<i;)if(t(e[a],a,e))return a;return-1}function ni(e,t,n){if(t!==t)return ti(e,si,n);for(var s=n-1,i=e.length;++s<i;)if(e[s]===t)return s;return-1}function si(e){return e!==e}function ii(e,t){for(var n=-1,s=e.length;++n<s&&ni(t,e[n],0)>-1;);return n}function ai(e){return Ks.test(e)}function We(e){return ai(e)?oi(e):ei(e)}function oi(e){return e.match(Ws)||[]}var ri=Object.prototype,ci=ri.toString,Ke=Qs.Symbol,Ze=Ke?Ke.prototype:void 0,Je=Ze?Ze.toString:void 0;function li(e,t,n){var s=-1,i=e.length;t<0&&(t=-t>i?0:i+t),n=n>i?i:n,n<0&&(n+=i),i=t>n?0:n-t>>>0,t>>>=0;for(var a=Array(i);++s<i;)a[s]=e[s+t];return a}function tn(e){if(typeof e=="string")return e;if(mi(e))return Je?Je.call(e):"";var t=e+"";return t=="0"&&1/e==-Us?"-0":t}function ui(e,t,n){var s=e.length;return n=n===void 0?s:n,!t&&n>=s?e:li(e,t,n)}function di(e){return!!e&&typeof e=="object"}function mi(e){return typeof e=="symbol"||di(e)&&ci.call(e)==Ys}function fi(e){return e==null?"":tn(e)}function hi(e,t,n){if(e=fi(e),e&&(n||t===void 0))return e.replace(Gs,"");if(!e||!(t=tn(t)))return e;var s=We(e),i=ii(s,We(t));return ui(s,i).join("")}var pi=hi,Ee=1/0,gi=9007199254740991,vi=17976931348623157e292,Qe=NaN,yi="[object Symbol]",bi=/^\s+|\s+$/g,Ei=/^[-+]0x[0-9a-f]+$/i,xi=/^0b[01]+$/i,Fi=/^0o[0-7]+$/i,Le="\\ud800-\\udfff",nn="\\u0300-\\u036f\\ufe20-\\ufe23",sn="\\u20d0-\\u20f0",an="\\ufe0e\\ufe0f",Ci="["+Le+"]",xe="["+nn+sn+"]",Fe="\\ud83c[\\udffb-\\udfff]",Ai="(?:"+xe+"|"+Fe+")",on="[^"+Le+"]",rn="(?:\\ud83c[\\udde6-\\uddff]){2}",cn="[\\ud800-\\udbff][\\udc00-\\udfff]",ln="\\u200d",un=Ai+"?",dn="["+an+"]?",Ii="(?:"+ln+"(?:"+[on,rn,cn].join("|")+")"+dn+un+")*",Ti=dn+un+Ii,Di="(?:"+[on+xe+"?",xe,rn,cn,Ci].join("|")+")",Ce=RegExp(Fe+"(?="+Fe+")|"+Di+Ti,"g"),_i=RegExp("["+ln+Le+nn+sn+an+"]"),Si=parseInt,Mi=typeof B=="object"&&B&&B.Object===Object&&B,ki=typeof self=="object"&&self&&self.Object===Object&&self,Bi=Mi||ki||Function("return this")(),wi=Ri("length");function Li(e){return e.split("")}function Ri(e){return function(t){return t==null?void 0:t[e]}}function Re(e){return _i.test(e)}function mn(e){return Re(e)?ji(e):wi(e)}function Oi(e){return Re(e)?Pi(e):Li(e)}function ji(e){for(var t=Ce.lastIndex=0;Ce.test(e);)t++;return t}function Pi(e){return e.match(Ce)||[]}var $i=Object.prototype,Ni=$i.toString,et=Bi.Symbol,Ui=Math.ceil,Yi=Math.floor,tt=et?et.prototype:void 0,nt=tt?tt.toString:void 0;function st(e,t){var n="";if(!e||t<1||t>gi)return n;do t%2&&(n+=e),t=Yi(t/2),t&&(e+=e);while(t);return n}function Gi(e,t,n){var s=-1,i=e.length;t<0&&(t=-t>i?0:i+t),n=n>i?i:n,n<0&&(n+=i),i=t>n?0:n-t>>>0,t>>>=0;for(var a=Array(i);++s<i;)a[s]=e[s+t];return a}function fn(e){if(typeof e=="string")return e;if(hn(e))return nt?nt.call(e):"";var t=e+"";return t=="0"&&1/e==-Ee?"-0":t}function Hi(e,t,n){var s=e.length;return n=n===void 0?s:n,!t&&n>=s?e:Gi(e,t,n)}function zi(e,t){t=t===void 0?" ":fn(t);var n=t.length;if(n<2)return n?st(t,e):t;var s=st(t,Ui(e/mn(t)));return Re(t)?Hi(Oi(s),0,e).join(""):s.slice(0,e)}function it(e){var t=typeof e;return!!e&&(t=="object"||t=="function")}function qi(e){return!!e&&typeof e=="object"}function hn(e){return typeof e=="symbol"||qi(e)&&Ni.call(e)==yi}function Vi(e){if(!e)return e===0?e:0;if(e=Wi(e),e===Ee||e===-Ee){var t=e<0?-1:1;return t*vi}return e===e?e:0}function Xi(e){var t=Vi(e),n=t%1;return t===t?n?t-n:t:0}function Wi(e){if(typeof e=="number")return e;if(hn(e))return Qe;if(it(e)){var t=typeof e.valueOf=="function"?e.valueOf():e;e=it(t)?t+"":t}if(typeof e!="string")return e===0?e:+e;e=e.replace(bi,"");var n=xi.test(e);return n||Fi.test(e)?Si(e.slice(2),n?2:8):Ei.test(e)?Qe:+e}function Ki(e){return e==null?"":fn(e)}function Zi(e,t,n){e=Ki(e),t=Xi(t);var s=t?mn(e):0;return t&&s<t?e+zi(t-s,n):e}var Ji=Zi,Qi=(e,t,n,s)=>{const i=(e+(s||"")).toString().includes("%");if(typeof e=="string"?[e,t,n,s]=e.match(/(0?\.?\d{1,3})%?\b/g).map(Number):s!==void 0&&(s=parseFloat(s)),typeof e!="number"||typeof t!="number"||typeof n!="number"||e>255||t>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof s=="number"){if(!i&&s>=0&&s<=1)s=Math.round(255*s);else if(i&&s>=0&&s<=100)s=Math.round(255*s/100);else throw new TypeError(`Expected alpha value (${s}) as a fraction or percentage`);s=(s|256).toString(16).slice(1)}else s="";return(n|t<<8|e<<16|1<<24).toString(16).slice(1)+s};const V="a-f\\d",ea=`#?[${V}]{3}[${V}]?`,ta=`#?[${V}]{6}([${V}]{2})?`,na=new RegExp(`[^#${V}]`,"gi"),sa=new RegExp(`^${ea}$|^${ta}$`,"i");var ia=(e,t={})=>{if(typeof e!="string"||na.test(e)||!sa.test(e))throw new TypeError("Expected a valid hex string");e=e.replace(/^#/,"");let n=1;e.length===8&&(n=Number.parseInt(e.slice(6,8),16)/255,e=e.slice(0,6)),e.length===4&&(n=Number.parseInt(e.slice(3,4).repeat(2),16)/255,e=e.slice(0,3)),e.length===3&&(e=e[0]+e[0]+e[1]+e[1]+e[2]+e[2]);const s=Number.parseInt(e,16),i=s>>16,a=s>>8&255,o=s&255,r=typeof t.alpha=="number"?t.alpha:n;if(t.format==="array")return[i,a,o,r];if(t.format==="css"){const c=r===1?"":` / ${Number((r*100).toFixed(2))}%`;return`rgb(${i} ${a} ${o}${c})`}return{red:i,green:a,blue:o,alpha:r}},aa=is,oa=Ns,ra=pi,ca=Ji,la=Qi,pn=ia;const ue=.75,de=.25,me=16777215,ua=49979693;var da=function(e){return"#"+ha(String(JSON.stringify(e)))};function ma(e){var t=oa(e),n=[];return t.forEach(function(s){var i=aa(s);i&&n.push(pn(ra(i,"#"),{format:"array"}))}),n}function fa(e){var t=[0,0,0];return e.forEach(function(n){for(var s=0;s<3;s++)t[s]+=n[s]}),[t[0]/e.length,t[1]/e.length,t[2]/e.length]}function ha(e){var t,n=ma(e);n.length>0&&(t=fa(n));var s=1,i=0,a=1;if(e.length>0)for(var o=0;o<e.length;o++)e[o].charCodeAt(0)>i&&(i=e[o].charCodeAt(0)),a=parseInt(me/i),s=(s+e[o].charCodeAt(0)*a*ua)%me;var r=(s*e.length%me).toString(16);r=ca(r,6,r);var c=pn(r,{format:"array"});return t?la(de*c[0]+ue*t[0],de*c[1]+ue*t[1],de*c[2]+ue*t[2]):r}const pa=$n(da);function ga(e){return[...va].sort(()=>Math.random()-Math.random()).slice(0,e)}const va=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function gn(e){return[...ya].sort(()=>Math.random()-Math.random()).slice(0,e)}const ya=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];function ba(){const e=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],t=Array.from({length:256},(i,a)=>a).sort(()=>Math.random()-.5),n=[...t,...t];function s(i,a,o){return i[0]*a+i[1]*o}return function(a,o){const r=Math.floor(a)&255,c=Math.floor(o)&255;a-=Math.floor(a),o-=Math.floor(o);const u=a*a*a*(a*(a*6-15)+10),l=o*o*o*(o*(o*6-15)+10),d=n[r]+c,m=n[r+1]+c;return(1+(s(e[n[d]&7],a,o)*(1-u)+s(e[n[m]&7],a-1,o)*u)*(1-l)+(s(e[n[d+1]&7],a,o-1)*(1-u)+s(e[n[m+1]&7],a-1,o-1)*u)*l)/2}}function Ae(e,t,n,s,i){const a=ba(),o=Math.floor(e.x/C),r=Math.floor(e.y/C),c=Math.floor(s/4),u=.5,l=.005,d=.7;for(let h=r-c;h<=r+c;h++)for(let p=o-c;p<=o+c;p++)if(p>=0&&p<s&&h>=0&&h<i){let g=p,y=h;for(let A=0;A<t;A++)Math.random()<d&&(g+=Math.random()>.5?1:-1,y+=Math.random()>.5?1:-1);g=Math.max(0,Math.min(s-1,g)),y=Math.max(0,Math.min(i-1,y));const x=Math.sqrt((g-o)*(g-o)+(y-r)*(y-r))/c,b=a(p*l,h*l);if(x<1&&b>u+x*.01){const A=h*s+p;n[A].type=S.GROUND,n[A].depth=void 0,n[A].height=(1-x)*2*(b-u)}}const m=Math.min(Math.max(r*s+o,0),s);n[m].type=S.GROUND,n[m].depth=void 0,n[m].height=1}function Ea(e,t){return{x:Math.floor(Math.random()*(e*.8)+e*.1)*C,y:Math.floor(Math.random()*(t*.8)+t*.1)*C}}function xa(e,t,n,s){if(e.x<0||e.y<0||e.x>=n||e.y>=s)return!1;const i=Math.floor(n/(Math.sqrt(t.length+1)*2));return t.every(a=>Math.abs(e.x-a.x)>i||Math.abs(e.y-a.y)>i)}function Fa(e,t,n){return t.every(s=>Math.sqrt(Math.pow(e.x-s.position.x,2)+Math.pow(e.y-s.position.y,2))>=n)}function Ca(e,t,n,s,i){const a=[],o=[],r=[],c=L*3,u=gn(e*2).filter(h=>h!==t),l=5,d=ga(e*l*2),m=[];for(let h=0;h<e;h++){const p=`state-${h+1}`,g=h===0?t:u.pop(),y=Aa(p,g,h===0);a.push(y),a.forEach(b=>{y.strategies[b.id]=v.NEUTRAL,b.strategies[p]=v.NEUTRAL});const x=Ia(m,n,s);m.push(x),Ae(x,n/2,i,n,s),Ta(p,x,l,d,o,r,c,i,n,s),y.population=o.filter(b=>b.stateId===p).reduce((b,A)=>b+A.population,0)}return Da(i,o),{states:a,cities:o,launchSites:r}}function Aa(e,t,n){return{id:e,name:t,color:pa(t),isPlayerControlled:n,strategies:{},lastStrategyUpdate:0,generalStrategy:n?void 0:[v.NEUTRAL,v.HOSTILE,v.FRIENDLY].sort(()=>Math.random()-.5)[0],population:0}}function Ia(e,t,n){let s,i=10;do if(s=Ea(t,n),i--<=0)break;while(!xa(s,e,t,n));return s}function Ta(e,t,n,s,i,a,o,r,c,u){const l=[];for(let d=0;d<n;d++){const m=at(t,l,o,30*C);l.push({position:m}),i.push({id:`city-${i.length+1}`,stateId:e,name:s.pop(),position:m,population:Math.floor(Math.random()*3e3)+1e3}),Ae(m,2,r,c,u)}for(const d of i){const m=r.filter(h=>{const p=h.position.x-d.position.x,g=h.position.y-d.position.y;return Math.sqrt(p*p+g*g)<O});for(const h of m){h.cityId=d.id;const p=h.position.x-d.position.x,g=h.position.y-d.position.y,y=Math.sqrt(p*p+g*g);h.population=Math.max(0,O-y)/O*St}d.population=m.reduce((h,p)=>h+p.population,0)}for(let d=0;d<4;d++){const m=at(t,l,o,15*C);l.push({position:m}),a.push({type:Mt.LAUNCH_SITE,id:`launch-site-${a.length+1}`,stateId:e,position:m,mode:Math.random()>.5?M.DEFENCE:M.ATTACK}),Ae(m,1,r,c,u)}return l}function at(e,t,n,s){let i,a=10;do if(i={x:e.x+(Math.random()-.5)*s,y:e.y+(Math.random()-.5)*s},a--<=0)break;while(!Fa(i,t,n));return i}function Da(e,t){const n=new Map(e.map(i=>[i.id,i])),s=[];for(t.forEach(i=>{e.filter(o=>o.cityId===i.id).forEach(o=>{o.stateId=i.stateId,s.push(o)})});s.length>0;){const i=s.splice(0,1)[0];_a(i,n).forEach(o=>{!o.stateId&&o.type===S.GROUND&&(o.stateId=i.stateId,s.push(o))})}}function _a(e,t){const n=[];return[{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:-1},{dx:0,dy:1}].forEach(({dx:i,dy:a})=>{const o=`${e.position.x+i*C},${e.position.y+a*C}`,r=t.get(o);r&&n.push(r)}),n}function vn(e){return Object.fromEntries(e.states.map(t=>[t.id,t.population]))}function se(e){return e>=1e3?`${(e/1e3).toFixed(1)}M`:`${e.toFixed(0)}K`}function Sa(e,t){const n=[],s=new Map;e.forEach(a=>{s.set(`${a.position.x},${a.position.y}`,a)});const i=(a,o)=>{const r=s.get(`${o.x},${o.y}`);if(r&&r.stateId&&r.stateId!==t.id){const c=n.find(()=>a.id===r.id)??{...a,adjacentStateIds:new Set};n.includes(c)||n.push(c),c.adjacentStateIds.add(r.stateId)}};return e.forEach(a=>{a.stateId===t.id&&[{x:a.position.x,y:a.position.y-C},{x:a.position.x,y:a.position.y+C},{x:a.position.x-C,y:a.position.y},{x:a.position.x+C,y:a.position.y}].forEach(r=>i(a,r))}),Array.from(n)}let Ma=0;function ka(e,t,n){const s=[],i=Sa(e,t),a={};i.forEach(r=>{for(const c of r.adjacentStateIds)a[c]=(a[c]||0)+1});const o=Object.values(a).reduce((r,c)=>r+c,0);return i.forEach(r=>{if(r.stateId&&r.stateId===t.id){const c=Array.from(r.adjacentStateIds).reduce((d,m)=>d+a[m],0),u=c/o,l=Math.round(n*u)/c*(Math.random()*.1+.9);l>0&&s.push({id:String(Ma++),quantity:l,position:{x:r.position.x+C/2,y:r.position.y+C/2},rect:{left:r.position.x-C/2,top:r.position.y-C/2,right:r.position.x+C/2,bottom:r.position.y+C/2},stateId:t.id,order:{type:"stay"}})}}),s}function Ba({playerStateName:e,numberOfStates:t=3,groundWarfare:n}){const s=Math.max(200,Math.ceil(Math.sqrt(t)*10)),i=s,a=es(s,i),{states:o,cities:r,launchSites:c}=Ca(t,e,s,i,a);ts(a,s,i);const u=[],l=[],d=[],m=[];if(n)for(const h of o)m.push(...ka(a,h,Wn));return{timestamp:0,states:o,cities:r,launchSites:c,sectors:a,units:m,missiles:u,explosions:l,interceptors:d}}function R(e,t,n,s){return Math.sqrt(Math.pow(n-e,2)+Math.pow(s-t,2))}function wa(e){var n;if(e.lastLaunchGenerationTimestamp&&e.timestamp-e.lastLaunchGenerationTimestamp>Jn)return;e.lastLaunchGenerationTimestamp=e.timestamp;const t=e.sectors.filter(s=>s.cityId&&s.population>0);for(const s of e.states){const i=e.cities.filter(l=>l.stateId===s.id),a=e.launchSites.filter(l=>l.stateId===s.id),o=e.cities.filter(l=>s.strategies[l.stateId]===v.HOSTILE&&l.stateId!==s.id&&l.population>0).map(l=>({...l,isCity:!0})),r=e.missiles.filter(l=>s.strategies[l.stateId]!==v.FRIENDLY&&l.stateId!==s.id),c=e.launchSites.filter(l=>s.strategies[l.stateId]===v.HOSTILE&&l.stateId!==s.id).map(l=>({...l,isCity:!1})),u=r.filter(l=>i.some(d=>Ie(l.target,d.position,L+O))||a.some(d=>Ie(l.target,d.position,L))).filter(l=>(e.timestamp-l.launchTimestamp)/(l.targetTimestamp-l.launchTimestamp)>.5);for(const l of e.launchSites.filter(d=>d.stateId===s.id)){if(l.nextLaunchTarget)continue;if(o.length===0&&c.length===0&&r.length===0)break;if(u.length===0&&l.mode===M.DEFENCE||u.length>0&&l.mode===M.ATTACK){l.modeChangeTimestamp||(l.modeChangeTimestamp=e.timestamp);continue}const d=ot(u.map(y=>({...y,isCity:!1})),l.position),m=e.missiles.filter(y=>y.stateId===s.id),h=e.interceptors.filter(y=>y.stateId===s.id),p=h.filter(y=>!y.targetMissileId&&l.id===y.launchSiteId),g=Ra(h,d).filter(([,y])=>y<a.length);if(l.mode===M.DEFENCE&&g.length>0){const y=g[0][0];p.length>0?p[0].targetMissileId=y:l.nextLaunchTarget={type:"missile",missileId:y}}else if(l.mode===M.ATTACK){const y=La(ot([...c,...o],l.position),m),x=(n=y==null?void 0:y[0])==null?void 0:n[0];if(x!=null&&x.position&&(x!=null&&x.isCity)){const b=Oa(x,t);l.nextLaunchTarget={type:"position",position:b||{x:x.position.x+(Math.random()-Math.random())*O,y:x.position.y+(Math.random()-Math.random())*O}}}else l.nextLaunchTarget=x!=null&&x.position?{type:"position",position:x==null?void 0:x.position}:void 0}}}}function Ie(e,t,n){return R(e.x,e.y,t.x,t.y)<=n}function ot(e,t){return e.sort((n,s)=>R(n.position.x,n.position.y,t.x,t.y)-R(s.position.x,s.position.y,t.x,t.y))}function La(e,t){const n=new Map;for(const s of e)n.set(s,t.filter(i=>Ie(i.target,s.position,L)).length);return Array.from(n).sort((s,i)=>s[1]-i[1])}function Ra(e,t){const n=new Map;for(const s of t)n.set(s.id,0);for(const s of e)s.targetMissileId&&n.set(s.targetMissileId,(n.get(s.targetMissileId)??0)+1);return Array.from(n).sort((s,i)=>s[1]-i[1])}function Oa(e,t){const n=t.filter(i=>i.cityId===e.id);return!n||n.length===0?null:n[Math.floor(Math.random()*n.length)].position}function ja(e){var t,n;if(!(e.lastStrategyUpdateTimestamp&&e.timestamp-e.lastStrategyUpdateTimestamp>Qn)){e.lastStrategyUpdateTimestamp=e.timestamp;for(const s of e.missiles.filter(i=>i.launchTimestamp===e.timestamp)){const i=e.states.find(o=>o.id===s.stateId),a=((t=e.cities.find(o=>R(o.position.x,o.position.y,s.target.x,s.target.y)<=L+O))==null?void 0:t.stateId)||((n=e.launchSites.find(o=>R(o.position.x,o.position.y,s.target.x,s.target.y)<=L))==null?void 0:n.stateId);if(i&&a&&i.id!==a){i.strategies[a]!==v.HOSTILE&&(i.strategies[a]=v.HOSTILE);const o=e.states.find(r=>r.id===a);o&&o.strategies[i.id]!==v.HOSTILE&&(o.strategies[i.id]=v.HOSTILE,e.states.forEach(r=>{r.id!==o.id&&r.strategies[o.id]===v.FRIENDLY&&o.strategies[r.id]===v.FRIENDLY&&(r.strategies[i.id]=v.HOSTILE,i.strategies[r.id]=v.HOSTILE)}))}}for(const s of e.states.filter(i=>!i.isPlayerControlled))Pa(s,e)}}function Pa(e,t){if(e.lastStrategyUpdate&&t.timestamp-e.lastStrategyUpdate<Vn)return;e.lastStrategyUpdate=t.timestamp;const n=t.states.filter(o=>o.id!==e.id),s=n.filter(o=>e.strategies[o.id]===v.FRIENDLY&&o.strategies[e.id]===v.FRIENDLY);e.strategies={...e.strategies},n.forEach(o=>{o.strategies[e.id]===v.FRIENDLY&&e.strategies[o.id]===v.NEUTRAL&&(e.generalStrategy!==v.HOSTILE?e.strategies[o.id]=v.FRIENDLY:o.strategies[e.id]=v.NEUTRAL)}),n.forEach(o=>{o.strategies[e.id]===v.NEUTRAL&&e.strategies[o.id]===v.HOSTILE&&(rt(e,o,s,t)?e.strategies[o.id]=v.NEUTRAL:o.strategies[e.id]=v.HOSTILE)});const i=n.filter(o=>Object.values(o.strategies).every(r=>r!==v.HOSTILE)&&o.generalStrategy!==v.HOSTILE);if(i.length>0&&e.generalStrategy===v.FRIENDLY){const o=i[Math.floor(Math.random()*i.length)];e.strategies[o.id]=v.FRIENDLY}s.forEach(o=>{n.forEach(r=>{r.strategies[o.id]===v.HOSTILE&&e.strategies[r.id]!==v.HOSTILE&&(e.strategies[r.id]=v.HOSTILE)})}),n.filter(o=>o.strategies[e.id]!==v.FRIENDLY&&e.strategies[o.id]!==v.FRIENDLY).forEach(o=>{if(rt(o,e,s,t)){const r=t.launchSites.filter(c=>c.stateId===e.id&&!c.lastLaunchTimestamp);if(r.length>0){const c=r[Math.floor(Math.random()*r.length)],u=[...t.cities.filter(l=>l.stateId===o.id),...t.launchSites.filter(l=>l.stateId===o.id)];if(u.length>0){const l=u[Math.floor(Math.random()*u.length)];c.nextLaunchTarget={type:"position",position:l.position}}}}})}function rt(e,t,n,s){const i=s.states.filter(c=>e.strategies[c.id]===v.FRIENDLY&&c.strategies[e.id]===v.FRIENDLY&&c.id!==e.id),a=s.launchSites.filter(c=>c.stateId===e.id||i.some(u=>u.id===c.stateId)),o=s.launchSites.filter(c=>c.stateId===t.id||n.some(u=>u.id===c.stateId));return a.length<o.length?!0:s.missiles.some(c=>s.cities.some(u=>u.stateId===e.id&&R(u.position.x,u.position.y,c.target.x,c.target.y)<=L)||s.launchSites.some(u=>u.stateId===e.id&&R(u.position.x,u.position.y,c.target.x,c.target.y)<=L))}function $a(e){for(const t of e.missiles){const n=(e.timestamp-t.launchTimestamp)/(t.targetTimestamp-t.launchTimestamp);t.position={x:t.launch.x+(t.target.x-t.launch.x)*n,y:t.launch.y+(t.target.y-t.launch.y)*n}}}function Na(e,t){e.interceptors=e.interceptors.filter(n=>{const s=e.missiles.find(c=>c.id===n.targetMissileId);s||(n.targetMissileId=void 0);const i=s?s.position.x-n.position.x:Math.cos(n.direction),a=s?s.position.y-n.position.y:Math.sin(n.direction),o=Math.sqrt(i*i+a*a);if(n.direction=Math.atan2(a,i),s&&o<=te*t)n.position={...s.position};else{const c=te*t/o;n.position={x:n.position.x+i*c,y:n.position.y+a*c}}return n.tail=[...n.tail.slice(-100),{timestamp:e.timestamp,position:n.position}],te*(e.timestamp-n.launchTimestamp)<=n.maxRange})}function Ua(e){for(const t of e.interceptors){const n=e.missiles.find(s=>s.id===t.targetMissileId);n&&R(t.position.x,t.position.y,n.position.x,n.position.y)<Gn&&(e.missiles=e.missiles.filter(i=>i.id!==n.id),e.interceptors=e.interceptors.filter(i=>i.id!==t.id))}}function Ya(e){for(const t of e.missiles.filter(n=>n.targetTimestamp<=e.timestamp)){const n=Ga(t);e.explosions.push(n),Ha(e,n),za(e,n),qa(e,n),Va(e,n)}e.explosions=e.explosions.filter(t=>t.endTimestamp>=e.timestamp),e.missiles=e.missiles.filter(t=>t.targetTimestamp>e.timestamp)}function Ga(e){return{id:`explosion-${Math.random()}`,missileId:e.id,startTimestamp:e.targetTimestamp,endTimestamp:e.targetTimestamp+zn,position:e.target,radius:L}}function Ha(e,t){for(const n of e.searchSector.byRadius(t.position,t.radius))if(n.population){const s=Math.max(_t,n.population*Dt);n.population=Math.max(0,n.population-s)}return e}function za(e,t){const n=e.searchMissile.byRadius(t.position,t.radius).filter(s=>s.id!==t.missileId&&s.launchTimestamp<=t.startTimestamp&&s.targetTimestamp>=t.startTimestamp);for(const s of n)s.targetTimestamp=t.startTimestamp;e.interceptors=e.interceptors.filter(s=>!(s.launchTimestamp<=t.startTimestamp&&R(s.position.x,s.position.y,t.position.x,t.position.y)<=t.radius))}function qa(e,t){const n=e.searchLaunchSite.byRadius(t.position,t.radius);e.launchSites=e.launchSites.filter(s=>!n.some(i=>i.id===s.id))}function Va(e,t){const n=e.searchUnit.byRadius(t.position,t.radius);e.units=e.units.map(s=>{if(n.find(a=>a.id===s.id)){const a=Math.max(_t,s.quantity*Dt),o=Math.max(0,s.quantity-a);return{...s,quantity:o}}return s}),e.units=e.units.filter(s=>s.quantity>0)}function Xa(e){for(const t of e.launchSites)t.modeChangeTimestamp&&e.timestamp>=t.modeChangeTimestamp+ge&&(t.mode=t.mode===M.ATTACK?M.DEFENCE:M.ATTACK,t.modeChangeTimestamp=void 0)}function Wa(e){var t,n;for(const s of e.launchSites)if(s.nextLaunchTarget&&!(s.lastLaunchTimestamp&&e.timestamp-s.lastLaunchTimestamp<(s.mode===M.ATTACK?ve:qn))){if(s.mode===M.ATTACK&&((t=s.nextLaunchTarget)==null?void 0:t.type)==="position")e.missiles.push(Ka(s,s.nextLaunchTarget.position,e.timestamp));else if(s.mode===M.DEFENCE&&((n=s.nextLaunchTarget)==null?void 0:n.type)==="missile"){const i=s.nextLaunchTarget.missileId,a=e.searchMissile.byProperty("id",i)[0];a&&e.interceptors.push(Za(s,e.timestamp,a))}s.lastLaunchTimestamp=e.timestamp,s.nextLaunchTarget=void 0}}function Ka(e,t,n){return{id:Math.random()+"",stateId:e.stateId,launchSiteId:e.id,launch:e.position,launchTimestamp:n,position:e.position,target:t,targetTimestamp:n+R(e.position.x,e.position.y,t.x,t.y)/ke}}function Za(e,t,n){return{id:Math.random()+"",stateId:e.stateId,launchSiteId:e.id,launch:e.position,launchTimestamp:t,position:e.position,direction:Math.atan2(e.position.y-n.position.y,e.position.x-n.position.x),tail:[],targetMissileId:n.id,maxRange:Be}}function Ja(e){const t=e.sectors.reduce((n,s)=>(s.cityId&&(n[s.cityId]=n[s.cityId]?n[s.cityId]+(s.population??0):s.population??0),n),{});for(const n of e.cities)n.population=t[n.id];e.states=e.states.map(n=>{const s=e.cities.filter(i=>i.stateId===n.id).reduce((i,a)=>i+a.population,0);return{...n,population:s}})}function Qa(e){const t=[];for(const n of e.units){for(const s of t)if(n.rect.left<s.rect.right&&n.rect.right>s.rect.left&&n.rect.top<s.rect.bottom&&n.rect.bottom>s.rect.top){s.units.push(n);break}for(const s of e.searchUnit.byRadius(n.position,D)){if(s.stateId==n.stateId)break;t.push({units:[n,s],rect:{left:Math.min(n.rect.left,s.rect.left),top:Math.min(n.rect.top,s.rect.top),right:Math.max(n.rect.right,s.rect.right),bottom:Math.max(n.rect.bottom,s.rect.bottom)}});break}}return t}function eo(e,t,n){for(const s of t){const i=s.units.reduce((o,r)=>(o[r.stateId]=(o[r.stateId]??0)+r.quantity,o),{}),a=Object.values(i).reduce((o,r)=>o=o+r,0);a&&s.units.forEach(o=>{o.quantity=Math.max(0,o.quantity-Math.max(Kn*n,i[o.stateId]/a*n*Zn*o.quantity))})}return e}function yn(e,t){for(const n of t)if(n.units.find(s=>s.id===e.id))return!0;return!1}function to(e,t){for(const n of e.units){if(n.lastOrderTimestamp&&e.timestamp-n.lastOrderTimestamp<10)return;const s=e.searchSector.byRadius(n.position,1)[0];if(!s)return;const i=no(n,e);if(i){n.order={type:"move",targetPosition:i.position},n.lastOrderTimestamp=e.timestamp;continue}if(yn(n,t)){const r=t.find(c=>c.units.includes(n));if(r&&so(n,r)){const c=io(n,e);if(c){n.order={type:"move",targetPosition:z(c)},n.lastOrderTimestamp=e.timestamp;continue}}}const a=e.searchSector.byRect({left:s.rect.left-C,top:s.rect.top-C,right:s.rect.right+C,bottom:s.rect.bottom+C}).filter(r=>r.type===S.GROUND),o=a.filter(r=>r.stateId!==n.stateId);if(o.length>0){const r=ao(n,o,a,e);n.order={type:"move",targetPosition:z(r)}}else{const r=co(n,e,e.searchSector.byRadius(n.position,C*5).filter(c=>c.type===S.GROUND));r?n.order={type:"move",targetPosition:r.position}:n.order={type:"stay"}}n.lastOrderTimestamp=e.timestamp}}function no(e,t){return t.searchUnit.byRadius(e.position,D*2).find(s=>s.stateId!==e.stateId&&s.quantity<e.quantity)}function so(e,t){const n=t.units.reduce((i,a)=>i+a.quantity,0);return e.quantity/n<.4}function io(e,t){var n;return(n=t.searchSector.byRadius(e.position,C*5).filter(s=>s.stateId===e.stateId&&s.type===S.GROUND).reduce((s,i)=>{const a=Math.sqrt((e.position.x-i.position.x)**2+(e.position.y-i.position.y)**2);return s&&s.distance<a?s:{sector:i,distance:a}},void 0))==null?void 0:n.sector}function ao(e,t,n,s){let i=t[0],a=-1,o=1/0;for(const r of t){const c=ro(e,r,n);let u=0;oo(r,s)&&(u+=3),r.population>0&&(u+=2),(u>a||u===a&&c<o)&&(a=u,o=c,i=r)}return i}function oo(e,t){return t.searchLaunchSite.byRect(e.rect).filter(n=>n.stateId!==e.stateId)[0]}function ro(e,t,n){const s=e.position,i=z(t),a={x:i.x-s.x,y:i.y-s.y};return n.filter(o=>{if(o.stateId===e.stateId)return!1;const r=z(o),c={x:r.x-s.x,y:r.y-s.y};return a.x*c.x+a.y*c.y<0}).length}function z(e){return{x:(e.rect.left+e.rect.right)/2,y:(e.rect.top+e.rect.bottom)/2}}function co(e,t,n){const s=t.launchSites.filter(r=>r.stateId!==e.stateId);if(s.length>0)return{position:s.reduce((c,u)=>{const l=Math.sqrt((e.position.x-u.position.x)**2+(e.position.y-u.position.y)**2);return c.distance<l?c:{site:u,distance:l}},{site:s[0],distance:1/0}).site.position,type:"launchSite"};const i=n.filter(r=>r.stateId!==e.stateId),a=i.reduce((r,c)=>{if(c.population>0){const u=Math.sqrt((e.position.x-c.position.x)**2+(e.position.y-c.position.y)**2);return r.distance<u?r:{sector:c,distance:u}}return r},{sector:null,distance:1/0});if(a.sector)return{position:z(a.sector),type:"sector"};const o=i.reduce((r,c)=>{const u=Math.sqrt((e.position.x-c.position.x)**2+(e.position.y-c.position.y)**2);return r.distance<u?r:{sector:c,distance:u}},{sector:null,distance:1/0});return o.sector?{position:z(o.sector),type:"sector"}:void 0}function lo(e,t){const n=Qa(e);eo(e.units,n,t),uo(e,t,n),mo(e),to(e,n),e.units=e.units.filter(s=>s.quantity>0)}function uo(e,t,n){for(const s of e.units){if(s.order.type!=="move"||yn(s,n)&&!fo(s,e))continue;const i={x:s.order.targetPosition.x-s.position.x,y:s.order.targetPosition.y-s.position.y},a=Math.sqrt(i.x**2+i.y**2),o=Xn*t;if(a<=o)s.position=s.order.targetPosition,s.order={type:"stay"};else{const r={x:i.x/a,y:i.y/a};s.position={x:s.position.x+r.x*o,y:s.position.y+r.y*o}}s.rect={left:s.position.x-D/2,top:s.position.y-D/2,right:s.position.x+D/2,bottom:s.position.y+D/2}}}function mo(e){e.units.forEach(t=>{const n=e.searchSector.byRadius(t.position,1)[0];if(!n||n.stateId===t.stateId)return;const s=e.searchUnit.byRect(n.rect);if(Object.values(s.reduce((a,o)=>(a[o.stateId]=!0,a),{[t.stateId]:!0})).length===1){if(n.stateId=t.stateId,n.cityId){const o=e.cities.find(r=>r.id===n.cityId);o&&o.stateId!==t.stateId&&e.searchSector.byRadius(o.position,O).filter(u=>u.cityId===o.id&&u.population>0).every(u=>u.stateId===t.stateId)&&(o.stateId=t.stateId)}const a=e.searchLaunchSite.byRect(n.rect).filter(o=>o.stateId!==t.stateId)[0];a&&(a.stateId=t.stateId)}})}function fo(e,t){if(e.order.type!=="move")return!1;const n=t.searchSector.byRadius(e.order.targetPosition,1)[0];if(!n||n.stateId!==e.stateId)return!1;const s=t.searchUnit.byRect(n.rect);for(const i of s)if(i.stateId!==e.stateId)return!1;return!0}class ho{constructor(){this.ids=[],this.values=[],this.length=0}clear(){this.length=0}push(t,n){let s=this.length++;for(;s>0;){const i=s-1>>1,a=this.values[i];if(n>=a)break;this.ids[s]=this.ids[i],this.values[s]=a,s=i}this.ids[s]=t,this.values[s]=n}pop(){if(this.length===0)return;const t=this.ids[0];if(this.length--,this.length>0){const n=this.ids[0]=this.ids[this.length],s=this.values[0]=this.values[this.length],i=this.length>>1;let a=0;for(;a<i;){let o=(a<<1)+1;const r=o+1;let c=this.ids[o],u=this.values[o];const l=this.values[r];if(r<this.length&&l<u&&(o=r,c=this.ids[r],u=l),u>=s)break;this.ids[a]=c,this.values[a]=u,a=o}this.ids[a]=n,this.values[a]=s}return t}peek(){if(this.length!==0)return this.ids[0]}peekValue(){if(this.length!==0)return this.values[0]}shrink(){this.ids.length=this.values.length=this.length}}const ct=[Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array],fe=3;class Oe{static from(t,n=0){if(n%8!==0)throw new Error("byteOffset must be 8-byte aligned.");if(!t||t.byteLength===void 0||t.buffer)throw new Error("Data must be an instance of ArrayBuffer or SharedArrayBuffer.");const[s,i]=new Uint8Array(t,n+0,2);if(s!==251)throw new Error("Data does not appear to be in a Flatbush format.");const a=i>>4;if(a!==fe)throw new Error(`Got v${a} data when expected v${fe}.`);const o=ct[i&15];if(!o)throw new Error("Unrecognized array type.");const[r]=new Uint16Array(t,n+2,1),[c]=new Uint32Array(t,n+4,1);return new Oe(c,r,o,void 0,t,n)}constructor(t,n=16,s=Float64Array,i=ArrayBuffer,a,o=0){if(t===void 0)throw new Error("Missing required argument: numItems.");if(isNaN(t)||t<=0)throw new Error(`Unexpected numItems value: ${t}.`);this.numItems=+t,this.nodeSize=Math.min(Math.max(+n,2),65535),this.byteOffset=o;let r=t,c=r;this._levelBounds=[r*4];do r=Math.ceil(r/this.nodeSize),c+=r,this._levelBounds.push(c*4);while(r!==1);this.ArrayType=s,this.IndexArrayType=c<16384?Uint16Array:Uint32Array;const u=ct.indexOf(this.ArrayType),l=c*4*this.ArrayType.BYTES_PER_ELEMENT;if(u<0)throw new Error(`Unexpected typed array class: ${s}.`);a&&a.byteLength!==void 0&&!a.buffer?(this.data=a,this._boxes=new this.ArrayType(this.data,o+8,c*4),this._indices=new this.IndexArrayType(this.data,o+8+l,c),this._pos=c*4,this.minX=this._boxes[this._pos-4],this.minY=this._boxes[this._pos-3],this.maxX=this._boxes[this._pos-2],this.maxY=this._boxes[this._pos-1]):(this.data=new i(8+l+c*this.IndexArrayType.BYTES_PER_ELEMENT),this._boxes=new this.ArrayType(this.data,8,c*4),this._indices=new this.IndexArrayType(this.data,8+l,c),this._pos=0,this.minX=1/0,this.minY=1/0,this.maxX=-1/0,this.maxY=-1/0,new Uint8Array(this.data,0,2).set([251,(fe<<4)+u]),new Uint16Array(this.data,2,1)[0]=n,new Uint32Array(this.data,4,1)[0]=t),this._queue=new ho}add(t,n,s=t,i=n){const a=this._pos>>2,o=this._boxes;return this._indices[a]=a,o[this._pos++]=t,o[this._pos++]=n,o[this._pos++]=s,o[this._pos++]=i,t<this.minX&&(this.minX=t),n<this.minY&&(this.minY=n),s>this.maxX&&(this.maxX=s),i>this.maxY&&(this.maxY=i),a}finish(){if(this._pos>>2!==this.numItems)throw new Error(`Added ${this._pos>>2} items when expected ${this.numItems}.`);const t=this._boxes;if(this.numItems<=this.nodeSize){t[this._pos++]=this.minX,t[this._pos++]=this.minY,t[this._pos++]=this.maxX,t[this._pos++]=this.maxY;return}const n=this.maxX-this.minX||1,s=this.maxY-this.minY||1,i=new Uint32Array(this.numItems),a=65535;for(let o=0,r=0;o<this.numItems;o++){const c=t[r++],u=t[r++],l=t[r++],d=t[r++],m=Math.floor(a*((c+l)/2-this.minX)/n),h=Math.floor(a*((u+d)/2-this.minY)/s);i[o]=go(m,h)}Te(i,t,this._indices,0,this.numItems-1,this.nodeSize);for(let o=0,r=0;o<this._levelBounds.length-1;o++){const c=this._levelBounds[o];for(;r<c;){const u=r;let l=t[r++],d=t[r++],m=t[r++],h=t[r++];for(let p=1;p<this.nodeSize&&r<c;p++)l=Math.min(l,t[r++]),d=Math.min(d,t[r++]),m=Math.max(m,t[r++]),h=Math.max(h,t[r++]);this._indices[this._pos>>2]=u,t[this._pos++]=l,t[this._pos++]=d,t[this._pos++]=m,t[this._pos++]=h}}}search(t,n,s,i,a){if(this._pos!==this._boxes.length)throw new Error("Data not yet indexed - call index.finish().");let o=this._boxes.length-4;const r=[],c=[];for(;o!==void 0;){const u=Math.min(o+this.nodeSize*4,ut(o,this._levelBounds));for(let l=o;l<u;l+=4){if(s<this._boxes[l]||i<this._boxes[l+1]||t>this._boxes[l+2]||n>this._boxes[l+3])continue;const d=this._indices[l>>2]|0;o>=this.numItems*4?r.push(d):(a===void 0||a(d))&&c.push(d)}o=r.pop()}return c}neighbors(t,n,s=1/0,i=1/0,a){if(this._pos!==this._boxes.length)throw new Error("Data not yet indexed - call index.finish().");let o=this._boxes.length-4;const r=this._queue,c=[],u=i*i;e:for(;o!==void 0;){const l=Math.min(o+this.nodeSize*4,ut(o,this._levelBounds));for(let d=o;d<l;d+=4){const m=this._indices[d>>2]|0,h=lt(t,this._boxes[d],this._boxes[d+2]),p=lt(n,this._boxes[d+1],this._boxes[d+3]),g=h*h+p*p;g>u||(o>=this.numItems*4?r.push(m<<1,g):(a===void 0||a(m))&&r.push((m<<1)+1,g))}for(;r.length&&r.peek()&1;)if(r.peekValue()>u||(c.push(r.pop()>>1),c.length===s))break e;o=r.length?r.pop()>>1:void 0}return r.clear(),c}}function lt(e,t,n){return e<t?t-e:e<=n?0:e-n}function ut(e,t){let n=0,s=t.length-1;for(;n<s;){const i=n+s>>1;t[i]>e?s=i:n=i+1}return t[n]}function Te(e,t,n,s,i,a){if(Math.floor(s/a)>=Math.floor(i/a))return;const o=e[s+i>>1];let r=s-1,c=i+1;for(;;){do r++;while(e[r]<o);do c--;while(e[c]>o);if(r>=c)break;po(e,t,n,r,c)}Te(e,t,n,s,c,a),Te(e,t,n,c+1,i,a)}function po(e,t,n,s,i){const a=e[s];e[s]=e[i],e[i]=a;const o=4*s,r=4*i,c=t[o],u=t[o+1],l=t[o+2],d=t[o+3];t[o]=t[r],t[o+1]=t[r+1],t[o+2]=t[r+2],t[o+3]=t[r+3],t[r]=c,t[r+1]=u,t[r+2]=l,t[r+3]=d;const m=n[s];n[s]=n[i],n[i]=m}function go(e,t){let n=e^t,s=65535^n,i=65535^(e|t),a=e&(t^65535),o=n|s>>1,r=n>>1^n,c=i>>1^s&a>>1^i,u=n&i>>1^a>>1^a;n=o,s=r,i=c,a=u,o=n&n>>2^s&s>>2,r=n&s>>2^s&(n^s)>>2,c^=n&i>>2^s&a>>2,u^=s&i>>2^(n^s)&a>>2,n=o,s=r,i=c,a=u,o=n&n>>4^s&s>>4,r=n&s>>4^s&(n^s)>>4,c^=n&i>>4^s&a>>4,u^=s&i>>4^(n^s)&a>>4,n=o,s=r,i=c,a=u,c^=n&i>>8^s&a>>8,u^=s&i>>8^(n^s)&a>>8,n=c^c>>1,s=u^u>>1;let l=e^t,d=s|65535^(l|n);return l=(l|l<<8)&16711935,l=(l|l<<4)&252645135,l=(l|l<<2)&858993459,l=(l|l<<1)&1431655765,d=(d|d<<8)&16711935,d=(d|d<<4)&252645135,d=(d|d<<2)&858993459,d=(d|d<<1)&1431655765,(d<<1|l)>>>0}function vo(e){return{...e,searchUnit:U(e.units),searchSector:U(e.sectors,"sectors"),searchCity:U(e.cities),searchLaunchSite:U(e.launchSites),searchMissile:U(e.missiles),searchInterceptor:U(e.interceptors)}}const he={};function U(e,t){if(t&&he[t])return he[t];e=[...e];const n=e.length===0?void 0:new Oe(e.length);for(const a of e)"rect"in a?n==null||n.add(a.rect.left,a.rect.top,a.rect.right,a.rect.bottom):"position"in a&&(n==null||n.add(a.position.x,a.position.y,a.position.x,a.position.y));n==null||n.finish();const s=new Map,i={byRect:a=>(n==null?void 0:n.search(a.left,a.top,a.right,a.bottom).map(o=>e[o]))??[],byRadius:(a,o)=>(n==null?void 0:n.neighbors(a.x,a.y,void 0,o).map(r=>e[r]))??[],byProperty:(a,o)=>{if(!s.has(a)){const r=s.set(a,new Map).get(a);e.forEach(c=>{if(a in c){const u=c[a];r.has(u)||r.set(u,[]),r.get(u).push(c)}})}return s.get(a).get(o)??[]},resetPropertyCache:()=>{s.clear()}};return t&&(he[t]=i),i}function yo(e,t){for(;t>0;){const n=bo(e,t>Z?Z:t);t=t>Z?t-Z:0,e=n}return e}function bo(e,t){const n=e.timestamp+t,s=vo({timestamp:n,states:e.states,cities:e.cities,launchSites:e.launchSites,missiles:e.missiles,interceptors:e.interceptors,units:e.units,explosions:e.explosions,sectors:e.sectors});return lo(s,t),$a(s),Na(s,t),Ua(s),Ya(s),Xa(s),Wa(s),Ja(s),wa(s),ja(s),s}function Eo(e,t,n){const[s,i]=E.useState(()=>Ba({playerStateName:e,numberOfStates:t+1,groundWarfare:n})),a=E.useCallback((o,r)=>i(yo(o,r)),[]);return{worldState:s,updateWorldState:a,setWorldState:i}}const bn={x:0,y:0,pointingObjects:[]},xo=(e,t)=>t.type==="move"?{x:t.x,y:t.y,pointingObjects:e.pointingObjects}:t.type==="point"&&!e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:[...e.pointingObjects,t.object]}:t.type==="unpoint"&&e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:e.pointingObjects.filter(n=>n.id!==t.object.id)}:e,Fo=E.createContext(bn),je=E.createContext(()=>{});function Co({children:e}){const[t,n]=E.useReducer(xo,bn);return f.jsx(Fo.Provider,{value:t,children:f.jsx(je.Provider,{value:n,children:e})})}function Ao(){const e=E.useContext(je);return(t,n)=>e({type:"move",x:t,y:n})}function Pe(){const e=E.useContext(je);return[t=>e({type:"point",object:t}),t=>e({type:"unpoint",object:t})]}const $e={},Io=(e,t)=>t.type==="clear"?$e:t.type==="set"?{...e,selectedObject:t.object}:e,En=E.createContext($e),xn=E.createContext(()=>{});function To({children:e}){const[t,n]=E.useReducer(Io,$e);return f.jsx(En.Provider,{value:t,children:f.jsx(xn.Provider,{value:n,children:e})})}function Do(e){var s;const t=E.useContext(xn);return[((s=E.useContext(En).selectedObject)==null?void 0:s.id)===e.id,()=>t({type:"set",object:e})]}function X(e,t){const n=new CustomEvent(e,{bubbles:!0,detail:t});document.dispatchEvent(n)}function re(e,t){E.useEffect(()=>{const n=s=>{t(s.detail)};return document.addEventListener(e,n,!1),()=>{document.removeEventListener(e,n,!1)}},[e,t])}const _o=$.memo(({sectors:e,states:t})=>{const n=E.useRef(null),[s,i]=Pe(),[a,o]=E.useState(0);return re("cityDamage",()=>{o(a+1)}),E.useEffect(()=>{const r=n.current,c=r==null?void 0:r.getContext("2d");if(!r||!c)return;const u=Math.min(...e.map(b=>b.rect.left)),l=Math.min(...e.map(b=>b.rect.top)),d=Math.max(...e.map(b=>b.rect.right)),m=Math.max(...e.map(b=>b.rect.bottom)),h=d-u,p=m-l;r.width=h,r.height=p,r.style.width=`${h}px`,r.style.height=`${p}px`;const g=Math.max(...e.filter(b=>b.type===S.WATER).map(b=>b.depth||0)),y=Math.max(...e.filter(b=>b.type===S.GROUND).map(b=>b.height||0)),x=new Map(t.map(b=>[b.id,b.color]));c.clearRect(0,0,h,p),e.forEach(b=>{const{fillStyle:A,drawSector:j}=So(b,g,y,x);c.fillStyle=A,j(c,b.rect,u,l)})},[a]),E.useEffect(()=>{const r=n.current;let c;const u=l=>{const d=r==null?void 0:r.getBoundingClientRect(),m=l.clientX-((d==null?void 0:d.left)||0),h=l.clientY-((d==null?void 0:d.top)||0),p=e.find(g=>m>=g.rect.left&&m<=g.rect.right&&h>=g.rect.top&&h<=g.rect.bottom);p&&(c&&i(c),s(p),c=p)};return r==null||r.addEventListener("mousemove",u),()=>{r==null||r.removeEventListener("mousemove",u)}},[e,s,i]),f.jsx("canvas",{ref:n,style:{opacity:.5}})});function So(e,t,n,s){const i=Mo(e,t,n),a=e.stateId?s.get(e.stateId):void 0;return{fillStyle:i,drawSector:(o,r,c,u)=>{o.fillStyle=i,o.fillRect(r.left-c,r.top-u,r.right-r.left,r.bottom-r.top),a&&(o.fillStyle=`${a}80`,o.fillRect(r.left-c,r.top-u,r.right-r.left,r.bottom-r.top)),e.cityId&&e.population>0&&Bo(o,r,c,u)}}}function Mo(e,t,n){switch(e.type){case S.GROUND:return e.cityId?ko(e):wo(e.height||0,n);case S.WATER:return Lo(e.depth||0,t);default:return"rgb(0, 34, 93)"}}function ko(e){if(e.population===0)return"rgba(0,0,0,0.7)";const t=e.population?Math.min(e.population/St,1):0,n=e.height?e.height/100:0,i=[200,200,200].map(a=>a-50*t+20*n);return`rgb(${i[0]}, ${i[1]}, ${i[2]})`}function Bo(e,t,n,s){e.fillStyle="rgba(0, 0, 0, 0.2)",e.fillRect(t.left-n+2,t.top-s+2,t.right-t.left-4,t.bottom-t.top-4),e.fillStyle="rgba(255, 255, 255, 0.6)",e.fillRect(t.left-n+4,t.top-s+4,t.right-t.left-8,t.bottom-t.top-8)}function wo(e,t){const n=e/t;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const s=Math.round(34+67*((n-.5)/.3)),i=Math.round(100+-33*((n-.5)/.3)),a=Math.round(34+-1*((n-.5)/.3));return`rgb(${s}, ${i}, ${a})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}function Lo(e,t){const n=e/t,s=Math.round(0+34*(1-n)),i=Math.round(137+-103*n),a=Math.round(178+-85*n);return`rgb(${s}, ${i}, ${a})`}function Ro({state:e,sectors:t}){const n=$.useMemo(()=>{const s=t.filter(i=>i.stateId===e.id);return jo(s)},[]);return f.jsx(f.Fragment,{children:f.jsx(Oo,{style:{transform:`translate(${n.x}px, ${n.y}px) translate(-50%, -50%)`,color:e.color},children:e.name})})}const Oo=F.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;function jo(e){if(e.length===0)return{x:0,y:0};const t=e.reduce((n,s)=>({x:n.x+(s.rect.left+s.rect.right)/2,y:n.y+(s.rect.top+s.rect.bottom)/2}),{x:0,y:0});return{x:t.x/e.length,y:t.y/e.length}}function Po({city:e}){const[t,n]=Pe(),s=e.population;if(!s)return null;const i=se(s);return f.jsxs($o,{onMouseEnter:()=>t(e),onMouseLeave:()=>n(e),style:{"--x":e.position.x,"--y":e.position.y},children:[f.jsx("span",{children:e.name}),f.jsxs(No,{children:[i," population"]})]})}const $o=F.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`,No=F.div`
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
`;function Uo({launchSite:e,worldTimestamp:t,isPlayerControlled:n}){const[s,i]=Do(e),[a,o]=Pe(),r=e.lastLaunchTimestamp&&e.lastLaunchTimestamp+ve>t,c=r?(t-e.lastLaunchTimestamp)/ve:0,u=e.modeChangeTimestamp&&t<e.modeChangeTimestamp+ge,l=u?(t-e.modeChangeTimestamp)/ge:0;return f.jsx(Yo,{onMouseEnter:()=>a(e),onMouseLeave:()=>o(e),onClick:()=>n&&i(),style:{"--x":e.position.x,"--y":e.position.y,"--cooldown-progress":c,"--mode-change-progress":l},"data-selected":s,"data-cooldown":r,"data-mode":e.mode,"data-changing-mode":u,children:f.jsx(Go,{children:e.mode===M.ATTACK?"A":"D"})})}const Yo=F.div`
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
`,Go=F.span`
  z-index: 1;
`;function Fn(e,t){t===void 0&&(t=!0);var n=E.useRef(null),s=E.useRef(!1),i=E.useRef(e);i.current=e;var a=E.useCallback(function(r){s.current&&(i.current(r),n.current=requestAnimationFrame(a))},[]),o=E.useMemo(function(){return[function(){s.current&&(s.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){s.current||(s.current=!0,n.current=requestAnimationFrame(a))},function(){return s.current}]},[]);return E.useEffect(function(){return t&&o[1](),o[0]},[]),o}function Ho(e,t,n){if(t.startTimestamp>n||t.endTimestamp<n)return;const s=Math.pow(Math.min(Math.max(0,(n-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);e.fillStyle=`rgb(${255*s}, ${255*(1-s)}, 0)`,e.beginPath(),e.arc(t.position.x,t.position.y,t.radius*s,0,2*Math.PI),e.fill()}function zo(e,t,n){t.launchTimestamp>n||t.targetTimestamp<n||(e.fillStyle="rgb(255, 0, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,2,0,2*Math.PI),e.fill())}function qo(e,t){e.fillStyle="rgb(0, 255, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,1,0,2*Math.PI),e.fill()}function dt(e,t,n){if(!(t.launchTimestamp>n))if("targetTimestamp"in t){if(t.targetTimestamp<n)return;Vo(e,t,n)}else Xo(e,t,n)}function Vo(e,t,n){const s=Math.min(Math.max(n-5,t.launchTimestamp)-t.launchTimestamp,t.targetTimestamp-t.launchTimestamp),i=t.targetTimestamp-t.launchTimestamp,a=i>0?s/i:0,o=t.launch.x+(t.position.x-t.launch.x)*a,r=t.launch.y+(t.position.y-t.launch.y)*a,c={x:o,y:r},u=e.createLinearGradient(c.x,c.y,t.position.x,t.position.y);u.addColorStop(0,"rgba(255, 255, 255, 0)"),u.addColorStop(1,"rgba(255, 255, 255, 0.5)"),e.strokeStyle=u,e.lineWidth=1,e.beginPath(),e.moveTo(c.x,c.y),e.lineTo(t.position.x,t.position.y),e.stroke()}function Xo(e,t,n){const i=Math.max(n-5,t.launchTimestamp),a=t.tail.filter(r=>r.timestamp>=i);if(a.length<2)return;e.beginPath(),e.moveTo(a[0].position.x,a[0].position.y);for(let r=1;r<a.length;r++)e.lineTo(a[r].position.x,a[r].position.y);e.lineTo(t.position.x,t.position.y);const o=e.createLinearGradient(a[0].position.x,a[0].position.y,t.position.x,t.position.y);o.addColorStop(0,"rgba(0, 255, 0, 0)"),o.addColorStop(1,"rgba(0, 255, 0, 0.5)"),e.strokeStyle=o,e.lineWidth=1,e.stroke()}function Wo(e,t){if(Math.sqrt(Math.pow(t.position.x-t.launch.x,2)+Math.pow(t.position.y-t.launch.y,2))>Be)for(let o=0;o<5;o++){const r=Math.PI*2/5*o,c=t.position.x+Math.cos(r)*3,u=t.position.y+Math.sin(r)*3;e.fillStyle="rgba(0, 255, 0, 0.5)",e.beginPath(),e.arc(c,u,1,0,2*Math.PI),e.fill()}}function Ko({state:e}){const t=E.useRef(null);return E.useLayoutEffect(()=>{const s=t.current;if(!s)return;const i=Math.min(...e.sectors.map(l=>l.rect.left)),a=Math.min(...e.sectors.map(l=>l.rect.top)),o=Math.max(...e.sectors.map(l=>l.rect.right)),r=Math.max(...e.sectors.map(l=>l.rect.bottom)),c=o-i,u=r-a;s.width=c,s.height=u,s.style.width=`${c}px`,s.style.height=`${u}px`},[e.sectors]),Fn(()=>{const s=t.current;if(!s)return;const i=s.getContext("2d");i&&(i.clearRect(0,0,s.width,s.height),e.missiles.forEach(a=>{dt(i,a,e.timestamp)}),e.interceptors.forEach(a=>{dt(i,a,e.timestamp)}),e.missiles.filter(a=>a.launchTimestamp<e.timestamp&&a.targetTimestamp>e.timestamp).forEach(a=>{zo(i,a,e.timestamp)}),e.interceptors.filter(a=>a.launchTimestamp<e.timestamp).forEach(a=>{qo(i,a),te*(e.timestamp-a.launchTimestamp+1)>Be&&Wo(i,a)}),e.explosions.filter(a=>a.startTimestamp<e.timestamp&&a.endTimestamp>e.timestamp).forEach(a=>{Ho(i,a,e.timestamp)}))}),f.jsx(Zo,{ref:t})}const Zo=F.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`,Jo=({worldStateRef:e})=>{const t=E.useRef(null);E.useEffect(()=>{const s=t.current;if(!s)return;const i=s.getContext("2d");if(!i)return;let a;const o=e.current;if(!o)return;const r=o.sectors,c=Math.min(...r.map(g=>g.rect.left)),u=Math.min(...r.map(g=>g.rect.top)),l=Math.max(...r.map(g=>g.rect.right)),d=Math.max(...r.map(g=>g.rect.bottom)),m=l-c,h=d-u;(s.width!==m||s.height!==h)&&(s.width=m,s.height=h,s.style.width=`${m}px`,s.style.height=`${h}px`);const p=()=>{const g=e.current;g&&(i.clearRect(0,0,s.width,s.height),i.save(),n(i,g),i.restore(),a=requestAnimationFrame(p))};return p(),()=>{cancelAnimationFrame(a)}},[e]);const n=(s,i)=>{const a={};i.units.forEach(o=>{const r=o.stateId;a[r]||(a[r]=[]),a[r].push(o)}),Object.entries(a).forEach(([o,r])=>{const c=i.states.find(l=>l.id===o),u=c?c.color:"#000000";s.fillStyle=u,s.strokeStyle="#000000",s.lineWidth=1,r.forEach(l=>{s.fillRect(l.position.x-D/2,l.position.y-D/2,D,D),s.strokeRect(l.position.x-D/2,l.position.y-D/2,D,D),s.beginPath(),s.moveTo(l.position.x-D/2,l.position.y-D/2),s.lineTo(l.position.x+D/2,l.position.y+D/2),s.moveTo(l.position.x+D/2,l.position.y-D/2),s.lineTo(l.position.x-D/2,l.position.y+D/2),s.stroke()})})};return f.jsx("canvas",{ref:t,style:{position:"absolute",top:0,left:0}})};function Qo({state:e}){const t=Ao(),n=E.useRef(e);return $.useEffect(()=>{n.current=e},[e]),f.jsxs(er,{onMouseMove:s=>t(s.clientX,s.clientY),onClick:()=>X("world-click"),children:[f.jsx(_o,{sectors:e.sectors,states:e.states}),e.states.map(s=>f.jsx(Ro,{state:s,cities:e.cities,launchSites:e.launchSites,sectors:e.sectors},s.id)),e.cities.map(s=>f.jsx(Po,{city:s},s.id)),e.launchSites.map(s=>{var i;return f.jsx(Uo,{launchSite:s,worldTimestamp:e.timestamp,isPlayerControlled:s.stateId===((i=e.states.find(a=>a.isPlayerControlled))==null?void 0:i.id)},s.id)}),f.jsx(Jo,{worldStateRef:n}),f.jsx(Ko,{state:e})]})}const er=F.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function tr(e,t,n){return Math.max(t,Math.min(e,n))}const I={toVector(e,t){return e===void 0&&(e=t),Array.isArray(e)?e:[e,e]},add(e,t){return[e[0]+t[0],e[1]+t[1]]},sub(e,t){return[e[0]-t[0],e[1]-t[1]]},addTo(e,t){e[0]+=t[0],e[1]+=t[1]},subTo(e,t){e[0]-=t[0],e[1]-=t[1]}};function mt(e,t,n){return t===0||Math.abs(t)===1/0?Math.pow(e,n*5):e*t*n/(t+n*e)}function ft(e,t,n,s=.15){return s===0?tr(e,t,n):e<t?-mt(t-e,n-t,s)+t:e>n?+mt(e-n,n-t,s)+n:e}function nr(e,[t,n],[s,i]){const[[a,o],[r,c]]=e;return[ft(t,a,o,s),ft(n,r,c,i)]}function sr(e,t){if(typeof e!="object"||e===null)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var s=n.call(e,t||"default");if(typeof s!="object")return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}function ir(e){var t=sr(e,"string");return typeof t=="symbol"?t:String(t)}function _(e,t,n){return t=ir(t),t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function ht(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(e);t&&(s=s.filter(function(i){return Object.getOwnPropertyDescriptor(e,i).enumerable})),n.push.apply(n,s)}return n}function T(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]!=null?arguments[t]:{};t%2?ht(Object(n),!0).forEach(function(s){_(e,s,n[s])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):ht(Object(n)).forEach(function(s){Object.defineProperty(e,s,Object.getOwnPropertyDescriptor(n,s))})}return e}const Cn={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function pt(e){return e?e[0].toUpperCase()+e.slice(1):""}const ar=["enter","leave"];function or(e=!1,t){return e&&!ar.includes(t)}function rr(e,t="",n=!1){const s=Cn[e],i=s&&s[t]||t;return"on"+pt(e)+pt(i)+(or(n,i)?"Capture":"")}const cr=["gotpointercapture","lostpointercapture"];function lr(e){let t=e.substring(2).toLowerCase();const n=!!~t.indexOf("passive");n&&(t=t.replace("passive",""));const s=cr.includes(t)?"capturecapture":"capture",i=!!~t.indexOf(s);return i&&(t=t.replace("capture","")),{device:t,capture:i,passive:n}}function ur(e,t=""){const n=Cn[e],s=n&&n[t]||t;return e+s}function ce(e){return"touches"in e}function An(e){return ce(e)?"touch":"pointerType"in e?e.pointerType:"mouse"}function dr(e){return Array.from(e.touches).filter(t=>{var n,s;return t.target===e.currentTarget||((n=e.currentTarget)===null||n===void 0||(s=n.contains)===null||s===void 0?void 0:s.call(n,t.target))})}function mr(e){return e.type==="touchend"||e.type==="touchcancel"?e.changedTouches:e.targetTouches}function In(e){return ce(e)?mr(e)[0]:e}function De(e,t){try{const n=t.clientX-e.clientX,s=t.clientY-e.clientY,i=(t.clientX+e.clientX)/2,a=(t.clientY+e.clientY)/2,o=Math.hypot(n,s);return{angle:-(Math.atan2(n,s)*180)/Math.PI,distance:o,origin:[i,a]}}catch{}return null}function fr(e){return dr(e).map(t=>t.identifier)}function gt(e,t){const[n,s]=Array.from(e.touches).filter(i=>t.includes(i.identifier));return De(n,s)}function pe(e){const t=In(e);return ce(e)?t.identifier:t.pointerId}function q(e){const t=In(e);return[t.clientX,t.clientY]}const vt=40,yt=800;function Tn(e){let{deltaX:t,deltaY:n,deltaMode:s}=e;return s===1?(t*=vt,n*=vt):s===2&&(t*=yt,n*=yt),[t,n]}function hr(e){var t,n;const{scrollX:s,scrollY:i,scrollLeft:a,scrollTop:o}=e.currentTarget;return[(t=s??a)!==null&&t!==void 0?t:0,(n=i??o)!==null&&n!==void 0?n:0]}function pr(e){const t={};if("buttons"in e&&(t.buttons=e.buttons),"shiftKey"in e){const{shiftKey:n,altKey:s,metaKey:i,ctrlKey:a}=e;Object.assign(t,{shiftKey:n,altKey:s,metaKey:i,ctrlKey:a})}return t}function ie(e,...t){return typeof e=="function"?e(...t):e}function gr(){}function vr(...e){return e.length===0?gr:e.length===1?e[0]:function(){let t;for(const n of e)t=n.apply(this,arguments)||t;return t}}function bt(e,t){return Object.assign({},t,e||{})}const yr=32;class Dn{constructor(t,n,s){this.ctrl=t,this.args=n,this.key=s,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(t){this.ctrl.state[this.key]=t}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:t,shared:n,ingKey:s,args:i}=this;n[s]=t._active=t.active=t._blocked=t._force=!1,t._step=[!1,!1],t.intentional=!1,t._movement=[0,0],t._distance=[0,0],t._direction=[0,0],t._delta=[0,0],t._bounds=[[-1/0,1/0],[-1/0,1/0]],t.args=i,t.axis=void 0,t.memo=void 0,t.elapsedTime=t.timeDelta=0,t.direction=[0,0],t.distance=[0,0],t.overflow=[0,0],t._movementBound=[!1,!1],t.velocity=[0,0],t.movement=[0,0],t.delta=[0,0],t.timeStamp=0}start(t){const n=this.state,s=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=t.target,n.currentTarget=t.currentTarget,n.lastOffset=s.from?ie(s.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=t.timeStamp)}computeValues(t){const n=this.state;n._values=t,n.values=this.config.transform(t)}computeInitial(){const t=this.state;t._initial=t._values,t.initial=t.values}compute(t){const{state:n,config:s,shared:i}=this;n.args=this.args;let a=0;if(t&&(n.event=t,s.preventDefault&&t.cancelable&&n.event.preventDefault(),n.type=t.type,i.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,i.locked=!!document.pointerLockElement,Object.assign(i,pr(t)),i.down=i.pressed=i.buttons%2===1||i.touches>0,a=t.timeStamp-n.timeStamp,n.timeStamp=t.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const P=n._delta.map(Math.abs);I.addTo(n._distance,P)}this.axisIntent&&this.axisIntent(t);const[o,r]=n._movement,[c,u]=s.threshold,{_step:l,values:d}=n;if(s.hasCustomTransform?(l[0]===!1&&(l[0]=Math.abs(o)>=c&&d[0]),l[1]===!1&&(l[1]=Math.abs(r)>=u&&d[1])):(l[0]===!1&&(l[0]=Math.abs(o)>=c&&Math.sign(o)*c),l[1]===!1&&(l[1]=Math.abs(r)>=u&&Math.sign(r)*u)),n.intentional=l[0]!==!1||l[1]!==!1,!n.intentional)return;const m=[0,0];if(s.hasCustomTransform){const[P,Pn]=d;m[0]=l[0]!==!1?P-l[0]:0,m[1]=l[1]!==!1?Pn-l[1]:0}else m[0]=l[0]!==!1?o-l[0]:0,m[1]=l[1]!==!1?r-l[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(m);const h=n.offset,p=n._active&&!n._blocked||n.active;p&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=i[this.ingKey]=n._active,t&&(n.first&&("bounds"in s&&(n._bounds=ie(s.bounds,n)),this.setup&&this.setup()),n.movement=m,this.computeOffset()));const[g,y]=n.offset,[[x,b],[A,j]]=n._bounds;n.overflow=[g<x?-1:g>b?1:0,y<A?-1:y>j?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const jn=n._active?s.rubberband||[0,0]:[0,0];if(n.offset=nr(n._bounds,n.offset,jn),n.delta=I.sub(n.offset,h),this.computeMovement(),p&&(!n.last||a>yr)){n.delta=I.sub(n.offset,h);const P=n.delta.map(Math.abs);I.addTo(n.distance,P),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&a>0&&(n.velocity=[P[0]/a,P[1]/a],n.timeDelta=a)}}emit(){const t=this.state,n=this.shared,s=this.config;if(t._active||this.clean(),(t._blocked||!t.intentional)&&!t._force&&!s.triggerAllEvents)return;const i=this.handler(T(T(T({},n),t),{},{[this.aliasKey]:t.values}));i!==void 0&&(t.memo=i)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function br([e,t],n){const s=Math.abs(e),i=Math.abs(t);if(s>i&&s>n)return"x";if(i>s&&i>n)return"y"}class W extends Dn{constructor(...t){super(...t),_(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=I.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=I.sub(this.state.offset,this.state.lastOffset)}axisIntent(t){const n=this.state,s=this.config;if(!n.axis&&t){const i=typeof s.axisThreshold=="object"?s.axisThreshold[An(t)]:s.axisThreshold;n.axis=br(n._movement,i)}n._blocked=(s.lockDirection||!!s.axis)&&!n.axis||!!s.axis&&s.axis!==n.axis}restrictToAxis(t){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":t[1]=0;break;case"y":t[0]=0;break}}}const Er=e=>e,Et=.15,_n={enabled(e=!0){return e},eventOptions(e,t,n){return T(T({},n.shared.eventOptions),e)},preventDefault(e=!1){return e},triggerAllEvents(e=!1){return e},rubberband(e=0){switch(e){case!0:return[Et,Et];case!1:return[0,0];default:return I.toVector(e)}},from(e){if(typeof e=="function")return e;if(e!=null)return I.toVector(e)},transform(e,t,n){const s=e||n.shared.transform;return this.hasCustomTransform=!!s,s||Er},threshold(e){return I.toVector(e,0)}},xr=0,N=T(T({},_n),{},{axis(e,t,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(e=xr){return e},bounds(e={}){if(typeof e=="function")return a=>N.bounds(e(a));if("current"in e)return()=>e.current;if(typeof HTMLElement=="function"&&e instanceof HTMLElement)return e;const{left:t=-1/0,right:n=1/0,top:s=-1/0,bottom:i=1/0}=e;return[[t,n],[s,i]]}}),xt={ArrowRight:(e,t=1)=>[e*t,0],ArrowLeft:(e,t=1)=>[-1*e*t,0],ArrowUp:(e,t=1)=>[0,-1*e*t],ArrowDown:(e,t=1)=>[0,e*t]};class Fr extends W{constructor(...t){super(...t),_(this,"ingKey","dragging")}reset(){super.reset();const t=this.state;t._pointerId=void 0,t._pointerActive=!1,t._keyboardActive=!1,t._preventScroll=!1,t._delayed=!1,t.swipe=[0,0],t.tap=!1,t.canceled=!1,t.cancel=this.cancel.bind(this)}setup(){const t=this.state;if(t._bounds instanceof HTMLElement){const n=t._bounds.getBoundingClientRect(),s=t.currentTarget.getBoundingClientRect(),i={left:n.left-s.left+t.offset[0],right:n.right-s.right+t.offset[0],top:n.top-s.top+t.offset[1],bottom:n.bottom-s.bottom+t.offset[1]};t._bounds=N.bounds(i)}}cancel(){const t=this.state;t.canceled||(t.canceled=!0,t._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(t){const n=this.config,s=this.state;if(t.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(t.buttons):n.pointerButtons!==-1&&n.pointerButtons!==t.buttons))return;const i=this.ctrl.setEventIds(t);n.pointerCapture&&t.target.setPointerCapture(t.pointerId),!(i&&i.size>1&&s._pointerActive)&&(this.start(t),this.setupPointer(t),s._pointerId=pe(t),s._pointerActive=!0,this.computeValues(q(t)),this.computeInitial(),n.preventScrollAxis&&An(t)!=="mouse"?(s._active=!1,this.setupScrollPrevention(t)):n.delay>0?(this.setupDelayTrigger(t),n.triggerAllEvents&&(this.compute(t),this.emit())):this.startPointerDrag(t))}startPointerDrag(t){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(t),this.emit()}pointerMove(t){const n=this.state,s=this.config;if(!n._pointerActive)return;const i=pe(t);if(n._pointerId!==void 0&&i!==n._pointerId)return;const a=q(t);if(document.pointerLockElement===t.target?n._delta=[t.movementX,t.movementY]:(n._delta=I.sub(a,n._values),this.computeValues(a)),I.addTo(n._movement,n._delta),this.compute(t),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(t);return}if(s.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===s.preventScrollAxis||s.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(t);return}else return;this.emit()}pointerUp(t){this.ctrl.setEventIds(t);try{this.config.pointerCapture&&t.target.hasPointerCapture(t.pointerId)&&t.target.releasePointerCapture(t.pointerId)}catch{}const n=this.state,s=this.config;if(!n._active||!n._pointerActive)return;const i=pe(t);if(n._pointerId!==void 0&&i!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(t);const[a,o]=n._distance;if(n.tap=a<=s.tapsThreshold&&o<=s.tapsThreshold,n.tap&&s.filterTaps)n._force=!0;else{const[r,c]=n._delta,[u,l]=n._movement,[d,m]=s.swipe.velocity,[h,p]=s.swipe.distance,g=s.swipe.duration;if(n.elapsedTime<g){const y=Math.abs(r/n.timeDelta),x=Math.abs(c/n.timeDelta);y>d&&Math.abs(u)>h&&(n.swipe[0]=Math.sign(r)),x>m&&Math.abs(l)>p&&(n.swipe[1]=Math.sign(c))}}this.emit()}pointerClick(t){!this.state.tap&&t.detail>0&&(t.preventDefault(),t.stopPropagation())}setupPointer(t){const n=this.config,s=n.device;n.pointerLock&&t.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,s,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,s,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,s,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(t){this.state._preventScroll&&t.cancelable&&t.preventDefault()}setupScrollPrevention(t){this.state._preventScroll=!1,Cr(t);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,t)}setupDelayTrigger(t){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(t)},this.config.delay)}keyDown(t){const n=xt[t.key];if(n){const s=this.state,i=t.shiftKey?10:t.altKey?.1:1;this.start(t),s._delta=n(this.config.keyboardDisplacement,i),s._keyboardActive=!0,I.addTo(s._movement,s._delta),this.compute(t),this.emit()}}keyUp(t){t.key in xt&&(this.state._keyboardActive=!1,this.setActive(),this.compute(t),this.emit())}bind(t){const n=this.config.device;t(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(t(n,"change",this.pointerMove.bind(this)),t(n,"end",this.pointerUp.bind(this)),t(n,"cancel",this.pointerUp.bind(this)),t("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(t("key","down",this.keyDown.bind(this)),t("key","up",this.keyUp.bind(this))),this.config.filterTaps&&t("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function Cr(e){"persist"in e&&typeof e.persist=="function"&&e.persist()}const K=typeof window<"u"&&window.document&&window.document.createElement;function Sn(){return K&&"ontouchstart"in window}function Ar(){return Sn()||K&&window.navigator.maxTouchPoints>1}function Ir(){return K&&"onpointerdown"in window}function Tr(){return K&&"exitPointerLock"in window.document}function Dr(){try{return"constructor"in GestureEvent}catch{return!1}}const k={isBrowser:K,gesture:Dr(),touch:Sn(),touchscreen:Ar(),pointer:Ir(),pointerLock:Tr()},_r=250,Sr=180,Mr=.5,kr=50,Br=250,wr=10,Ft={mouse:0,touch:0,pen:8},Lr=T(T({},N),{},{device(e,t,{pointer:{touch:n=!1,lock:s=!1,mouse:i=!1}={}}){return this.pointerLock=s&&k.pointerLock,k.touch&&n?"touch":this.pointerLock?"mouse":k.pointer&&!i?"pointer":k.touch?"touch":"mouse"},preventScrollAxis(e,t,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&e?_r:void 0,!(!k.touchscreen||n===!1))return e||(n!==void 0?"y":void 0)},pointerCapture(e,t,{pointer:{capture:n=!0,buttons:s=1,keys:i=!0}={}}){return this.pointerButtons=s,this.keys=i,!this.pointerLock&&this.device==="pointer"&&n},threshold(e,t,{filterTaps:n=!1,tapsThreshold:s=3,axis:i=void 0}){const a=I.toVector(e,n?s:i?1:0);return this.filterTaps=n,this.tapsThreshold=s,a},swipe({velocity:e=Mr,distance:t=kr,duration:n=Br}={}){return{velocity:this.transform(I.toVector(e)),distance:this.transform(I.toVector(t)),duration:n}},delay(e=0){switch(e){case!0:return Sr;case!1:return 0;default:return e}},axisThreshold(e){return e?T(T({},Ft),e):Ft},keyboardDisplacement(e=wr){return e}});function Mn(e){const[t,n]=e.overflow,[s,i]=e._delta,[a,o]=e._direction;(t<0&&s>0&&a<0||t>0&&s<0&&a>0)&&(e._movement[0]=e._movementBound[0]),(n<0&&i>0&&o<0||n>0&&i<0&&o>0)&&(e._movement[1]=e._movementBound[1])}const Rr=30,Or=100;class jr extends Dn{constructor(...t){super(...t),_(this,"ingKey","pinching"),_(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const t=this.state;t._touchIds=[],t.canceled=!1,t.cancel=this.cancel.bind(this),t.turns=0}computeOffset(){const{type:t,movement:n,lastOffset:s}=this.state;t==="wheel"?this.state.offset=I.add(n,s):this.state.offset=[(1+n[0])*s[0],n[1]+s[1]]}computeMovement(){const{offset:t,lastOffset:n}=this.state;this.state.movement=[t[0]/n[0],t[1]-n[1]]}axisIntent(){const t=this.state,[n,s]=t._movement;if(!t.axis){const i=Math.abs(n)*Rr-Math.abs(s);i<0?t.axis="angle":i>0&&(t.axis="scale")}}restrictToAxis(t){this.config.lockDirection&&(this.state.axis==="scale"?t[1]=0:this.state.axis==="angle"&&(t[0]=0))}cancel(){const t=this.state;t.canceled||setTimeout(()=>{t.canceled=!0,t._active=!1,this.compute(),this.emit()},0)}touchStart(t){this.ctrl.setEventIds(t);const n=this.state,s=this.ctrl.touchIds;if(n._active&&n._touchIds.every(a=>s.has(a))||s.size<2)return;this.start(t),n._touchIds=Array.from(s).slice(0,2);const i=gt(t,n._touchIds);i&&this.pinchStart(t,i)}pointerStart(t){if(t.buttons!=null&&t.buttons%2!==1)return;this.ctrl.setEventIds(t),t.target.setPointerCapture(t.pointerId);const n=this.state,s=n._pointerEvents,i=this.ctrl.pointerIds;if(n._active&&Array.from(s.keys()).every(o=>i.has(o))||(s.size<2&&s.set(t.pointerId,t),n._pointerEvents.size<2))return;this.start(t);const a=De(...Array.from(s.values()));a&&this.pinchStart(t,a)}pinchStart(t,n){const s=this.state;s.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(t),this.emit()}touchMove(t){if(!this.state._active)return;const n=gt(t,this.state._touchIds);n&&this.pinchMove(t,n)}pointerMove(t){const n=this.state._pointerEvents;if(n.has(t.pointerId)&&n.set(t.pointerId,t),!this.state._active)return;const s=De(...Array.from(n.values()));s&&this.pinchMove(t,s)}pinchMove(t,n){const s=this.state,i=s._values[1],a=n.angle-i;let o=0;Math.abs(a)>270&&(o+=Math.sign(a)),this.computeValues([n.distance,n.angle-360*o]),s.origin=n.origin,s.turns=o,s._movement=[s._values[0]/s._initial[0]-1,s._values[1]-s._initial[1]],this.compute(t),this.emit()}touchEnd(t){this.ctrl.setEventIds(t),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(t),this.emit())}pointerEnd(t){const n=this.state;this.ctrl.setEventIds(t);try{t.target.releasePointerCapture(t.pointerId)}catch{}n._pointerEvents.has(t.pointerId)&&n._pointerEvents.delete(t.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(t),this.emit())}gestureStart(t){t.cancelable&&t.preventDefault();const n=this.state;n._active||(this.start(t),this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY],this.compute(t),this.emit())}gestureMove(t){if(t.cancelable&&t.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY];const s=n._movement;n._movement=[t.scale-1,t.rotation],n._delta=I.sub(n._movement,s),this.compute(t),this.emit()}gestureEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}wheel(t){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(s=>t[s]):!t[n])||(this.state._active?this.wheelChange(t):this.wheelStart(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(t){this.start(t),this.wheelChange(t)}wheelChange(t){"uv"in t||t.cancelable&&t.preventDefault();const s=this.state;s._delta=[-Tn(t)[1]/Or*s.offset[0],0],I.addTo(s._movement,s._delta),Mn(s),this.state.origin=[t.clientX,t.clientY],this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){const n=this.config.device;n&&(t(n,"start",this[n+"Start"].bind(this)),t(n,"change",this[n+"Move"].bind(this)),t(n,"end",this[n+"End"].bind(this)),t(n,"cancel",this[n+"End"].bind(this)),t("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&t("wheel","",this.wheel.bind(this),{passive:!1})}}const Pr=T(T({},_n),{},{device(e,t,{shared:n,pointer:{touch:s=!1}={}}){if(n.target&&!k.touch&&k.gesture)return"gesture";if(k.touch&&s)return"touch";if(k.touchscreen){if(k.pointer)return"pointer";if(k.touch)return"touch"}},bounds(e,t,{scaleBounds:n={},angleBounds:s={}}){const i=o=>{const r=bt(ie(n,o),{min:-1/0,max:1/0});return[r.min,r.max]},a=o=>{const r=bt(ie(s,o),{min:-1/0,max:1/0});return[r.min,r.max]};return typeof n!="function"&&typeof s!="function"?[i(),a()]:o=>[i(o),a(o)]},threshold(e,t,n){return this.lockDirection=n.axis==="lock",I.toVector(e,this.lockDirection?[.1,3]:0)},modifierKey(e){return e===void 0?"ctrlKey":e},pinchOnWheel(e=!0){return e}});class $r extends W{constructor(...t){super(...t),_(this,"ingKey","moving")}move(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.state._active?this.moveChange(t):this.moveStart(t),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(t){this.start(t),this.computeValues(q(t)),this.compute(t),this.computeInitial(),this.emit()}moveChange(t){if(!this.state._active)return;const n=q(t),s=this.state;s._delta=I.sub(n,s._values),I.addTo(s._movement,s._delta),this.computeValues(n),this.compute(t),this.emit()}moveEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}bind(t){t("pointer","change",this.move.bind(this)),t("pointer","leave",this.moveEnd.bind(this))}}const Nr=T(T({},N),{},{mouseOnly:(e=!0)=>e});class Ur extends W{constructor(...t){super(...t),_(this,"ingKey","scrolling")}scroll(t){this.state._active||this.start(t),this.scrollChange(t),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(t){t.cancelable&&t.preventDefault();const n=this.state,s=hr(t);n._delta=I.sub(s,n._values),I.addTo(n._movement,n._delta),this.computeValues(s),this.compute(t),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("scroll","",this.scroll.bind(this))}}const Yr=N;class Gr extends W{constructor(...t){super(...t),_(this,"ingKey","wheeling")}wheel(t){this.state._active||this.start(t),this.wheelChange(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(t){const n=this.state;n._delta=Tn(t),I.addTo(n._movement,n._delta),Mn(n),this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("wheel","",this.wheel.bind(this))}}const Hr=N;class zr extends W{constructor(...t){super(...t),_(this,"ingKey","hovering")}enter(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.start(t),this.computeValues(q(t)),this.compute(t),this.emit())}leave(t){if(this.config.mouseOnly&&t.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const s=q(t);n._movement=n._delta=I.sub(s,n._values),this.computeValues(s),this.compute(t),n.delta=n.movement,this.emit()}bind(t){t("pointer","enter",this.enter.bind(this)),t("pointer","leave",this.leave.bind(this))}}const qr=T(T({},N),{},{mouseOnly:(e=!0)=>e}),Ne=new Map,_e=new Map;function Vr(e){Ne.set(e.key,e.engine),_e.set(e.key,e.resolver)}const Xr={key:"drag",engine:Fr,resolver:Lr},Wr={key:"hover",engine:zr,resolver:qr},Kr={key:"move",engine:$r,resolver:Nr},Zr={key:"pinch",engine:jr,resolver:Pr},Jr={key:"scroll",engine:Ur,resolver:Yr},Qr={key:"wheel",engine:Gr,resolver:Hr};function ec(e,t){if(e==null)return{};var n={},s=Object.keys(e),i,a;for(a=0;a<s.length;a++)i=s[a],!(t.indexOf(i)>=0)&&(n[i]=e[i]);return n}function tc(e,t){if(e==null)return{};var n=ec(e,t),s,i;if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);for(i=0;i<a.length;i++)s=a[i],!(t.indexOf(s)>=0)&&Object.prototype.propertyIsEnumerable.call(e,s)&&(n[s]=e[s])}return n}const nc={target(e){if(e)return()=>"current"in e?e.current:e},enabled(e=!0){return e},window(e=k.isBrowser?window:void 0){return e},eventOptions({passive:e=!0,capture:t=!1}={}){return{passive:e,capture:t}},transform(e){return e}},sc=["target","eventOptions","window","enabled","transform"];function ne(e={},t){const n={};for(const[s,i]of Object.entries(t))switch(typeof i){case"function":n[s]=i.call(n,e[s],s,e);break;case"object":n[s]=ne(e[s],i);break;case"boolean":i&&(n[s]=e[s]);break}return n}function ic(e,t,n={}){const s=e,{target:i,eventOptions:a,window:o,enabled:r,transform:c}=s,u=tc(s,sc);if(n.shared=ne({target:i,eventOptions:a,window:o,enabled:r,transform:c},nc),t){const l=_e.get(t);n[t]=ne(T({shared:n.shared},u),l)}else for(const l in u){const d=_e.get(l);d&&(n[l]=ne(T({shared:n.shared},u[l]),d))}return n}class kn{constructor(t,n){_(this,"_listeners",new Set),this._ctrl=t,this._gestureKey=n}add(t,n,s,i,a){const o=this._listeners,r=ur(n,s),c=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},u=T(T({},c),a);t.addEventListener(r,i,u);const l=()=>{t.removeEventListener(r,i,u),o.delete(l)};return o.add(l),l}clean(){this._listeners.forEach(t=>t()),this._listeners.clear()}}class ac{constructor(){_(this,"_timeouts",new Map)}add(t,n,s=140,...i){this.remove(t),this._timeouts.set(t,window.setTimeout(n,s,...i))}remove(t){const n=this._timeouts.get(t);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(t=>void window.clearTimeout(t)),this._timeouts.clear()}}class oc{constructor(t){_(this,"gestures",new Set),_(this,"_targetEventStore",new kn(this)),_(this,"gestureEventStores",{}),_(this,"gestureTimeoutStores",{}),_(this,"handlers",{}),_(this,"config",{}),_(this,"pointerIds",new Set),_(this,"touchIds",new Set),_(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),rc(this,t)}setEventIds(t){if(ce(t))return this.touchIds=new Set(fr(t)),this.touchIds;if("pointerId"in t)return t.type==="pointerup"||t.type==="pointercancel"?this.pointerIds.delete(t.pointerId):t.type==="pointerdown"&&this.pointerIds.add(t.pointerId),this.pointerIds}applyHandlers(t,n){this.handlers=t,this.nativeHandlers=n}applyConfig(t,n){this.config=ic(t,n,this.config)}clean(){this._targetEventStore.clean();for(const t of this.gestures)this.gestureEventStores[t].clean(),this.gestureTimeoutStores[t].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...t){const n=this.config.shared,s={};let i;if(!(n.target&&(i=n.target(),!i))){if(n.enabled){for(const o of this.gestures){const r=this.config[o],c=Ct(s,r.eventOptions,!!i);if(r.enabled){const u=Ne.get(o);new u(this,t,o).bind(c)}}const a=Ct(s,n.eventOptions,!!i);for(const o in this.nativeHandlers)a(o,"",r=>this.nativeHandlers[o](T(T({},this.state.shared),{},{event:r,args:t})),void 0,!0)}for(const a in s)s[a]=vr(...s[a]);if(!i)return s;for(const a in s){const{device:o,capture:r,passive:c}=lr(a);this._targetEventStore.add(i,o,"",s[a],{capture:r,passive:c})}}}}function Y(e,t){e.gestures.add(t),e.gestureEventStores[t]=new kn(e,t),e.gestureTimeoutStores[t]=new ac}function rc(e,t){t.drag&&Y(e,"drag"),t.wheel&&Y(e,"wheel"),t.scroll&&Y(e,"scroll"),t.move&&Y(e,"move"),t.pinch&&Y(e,"pinch"),t.hover&&Y(e,"hover")}const Ct=(e,t,n)=>(s,i,a,o={},r=!1)=>{var c,u;const l=(c=o.capture)!==null&&c!==void 0?c:t.capture,d=(u=o.passive)!==null&&u!==void 0?u:t.passive;let m=r?s:rr(s,i,l);n&&d&&(m+="Passive"),e[m]=e[m]||[],e[m].push(a)},cc=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function lc(e){const t={},n={},s=new Set;for(let i in e)cc.test(i)?(s.add(RegExp.lastMatch),n[i]=e[i]):t[i]=e[i];return[n,t,s]}function G(e,t,n,s,i,a){if(!e.has(n)||!Ne.has(s))return;const o=n+"Start",r=n+"End",c=u=>{let l;return u.first&&o in t&&t[o](u),n in t&&(l=t[n](u)),u.last&&r in t&&t[r](u),l};i[s]=c,a[s]=a[s]||{}}function uc(e,t){const[n,s,i]=lc(e),a={};return G(i,n,"onDrag","drag",a,t),G(i,n,"onWheel","wheel",a,t),G(i,n,"onScroll","scroll",a,t),G(i,n,"onPinch","pinch",a,t),G(i,n,"onMove","move",a,t),G(i,n,"onHover","hover",a,t),{handlers:a,config:t,nativeHandlers:s}}function dc(e,t={},n,s){const i=$.useMemo(()=>new oc(e),[]);if(i.applyHandlers(e,s),i.applyConfig(t,n),$.useEffect(i.effect.bind(i)),$.useEffect(()=>i.clean.bind(i),[]),t.target===void 0)return i.bind.bind(i)}function mc(e){return e.forEach(Vr),function(n,s){const{handlers:i,nativeHandlers:a,config:o}=uc(n,s||{});return dc(i,o,void 0,a)}}function fc(e,t){return mc([Xr,Zr,Jr,Qr,Kr,Wr])(e,t||{})}function hc(e){X("translateViewport",e)}function pc(e){re("translateViewport",e)}function gc({children:e,onGetViewportConfiguration:t}){const n=E.useRef(null),s=$.useMemo(t,[t]),[i,a]=E.useState(s.initialZoom),[o,r]=E.useState(s.initialTranslate),[c,u]=E.useState(!1),l=E.useCallback((d,m)=>{const{minX:h,minY:p,maxX:g,maxY:y}=s,x=window.innerWidth,b=window.innerHeight,A=Math.min(Math.max(m,Math.max(x/(g-h),b/(y-p))),4),j={x:Math.min(Math.max(d.x,-(g-x/A)),-h),y:Math.min(Math.max(d.y,-(y-b/A)),-p)};r(j),a(A)},[s]);return E.useEffect(()=>{l(s.initialTranslate,s.initialZoom)},[]),fc({onPinch({origin:d,delta:m,pinching:h}){var b;u(h);const p=i+m[0],g=(b=n.current)==null?void 0:b.getBoundingClientRect(),y=d[0]-((g==null?void 0:g.left)??0),x=d[1]-((g==null?void 0:g.top)??0);l({x:o.x-(y/i-y/p),y:o.y-(x/i-x/p)},p)},onWheel({event:d,delta:[m,h],wheeling:p}){d.preventDefault(),u(p),l({x:o.x-m/i,y:o.y-h/i},i)}},{target:n,eventOptions:{passive:!1}}),pc(d=>{const m=window.innerWidth,h=window.innerHeight,p=m/2-d.x*i,g=h/2-d.y*i;l({x:p/i,y:g/i},i)}),f.jsx(vc,{children:f.jsx(yc,{ref:n,children:f.jsx(bc,{style:{"--zoom":i,"--translate-x":o.x,"--translate-y":o.y},"data-is-interacting":c,children:e})})})}const vc=F.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,yc=F.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,bc=F.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function Ec({worldState:e}){const t=E.useRef(e);return f.jsx(To,{children:f.jsx(Co,{children:f.jsx(gc,{onGetViewportConfiguration:E.useCallback(()=>xc(t.current),[t]),children:f.jsx(Qo,{state:e})})})})}function xc(e){const t=e.states.find(y=>y.isPlayerControlled),n=window.innerWidth,s=window.innerHeight,i=t?e.sectors.filter(y=>y.stateId===t.id):e.sectors;let a=1/0,o=1/0,r=-1/0,c=-1/0;i.forEach(y=>{a=Math.min(a,y.rect.left),o=Math.min(o,y.rect.top),r=Math.max(r,y.rect.right),c=Math.max(c,y.rect.bottom)});const u=r-a+1,l=c-o+1,d=n/u,m=s/l,h=Math.min(d,m)*1,p=(a+r)/2,g=(o+c)/2;return e.sectors.forEach(y=>{a=Math.min(a,y.rect.left),o=Math.min(o,y.rect.top),r=Math.max(r,y.rect.right),c=Math.max(c,y.rect.bottom)}),{initialTranslate:{x:n/2-p*h,y:s/2-g*h},initialZoom:h,minX:a,minY:o,maxX:r,maxY:c}}const Bn="fullScreenMessage",wn="fullScreenMessageAction";function w(e,t,n,s="",i,a,o){X(Bn,{message:e,startTimestamp:t,endTimestamp:n,messageId:s,actions:i,prompt:a,fullScreen:o??!!(i!=null&&i.length)})}function Ln(e,t){X(wn,{messageId:e,actionId:t})}function Rn(e){re(Bn,t=>{e(t)})}function Ue(e){re(wn,t=>{e(t)})}function Fc({worldState:e,onGameOver:t}){const[n,s]=E.useState(null),[i,a]=E.useState(!1);return E.useEffect(()=>{var h;if(i)return;const o=vn(e),r=Object.values(o).filter(p=>p>0).length,c=e.launchSites.length===0,u=e.timestamp,l=e.states.filter(p=>o[p.id]>0&&Object.entries(p.strategies).filter(([g,y])=>o[g]>0&&y===v.HOSTILE).length>0),d=e.launchSites.some(p=>p.lastLaunchTimestamp&&u-p.lastLaunchTimestamp<le),m=le-u;if(!l.length&&!d&&m>0&&m<=10&&(n?w(`Game will end in ${Math.ceil(m)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):s(u)),r<=1||c||!l.length&&!d&&u>le){const p=r===1?(h=e.states.find(g=>o[g.id]>0))==null?void 0:h.id:void 0;a(!0),w(["Game Over!","Results will be shown shortly..."],u,u+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{t({populations:o,winner:p,stateNames:Object.fromEntries(e.states.map(g=>[g.id,g.name])),playerStateId:e.states.find(g=>g.isPlayerControlled).id})},5e3)}},[e,t,n,i]),null}const Cc="/assets/player-lost-background-D2A_VJ6-.png",Ac="/assets/player-won-background-CkXgF24i.png",At="/assets/draw-background-EwLQ9g28.png",Ic=F.div`
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
    background-image: url(${e=>e.backgroundImage});
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
`,Tc=({setGameState:e})=>{const{state:{result:t}}=Tt(),n=()=>{e(ae,{stateName:t.stateNames[t.playerStateId],numberOfOpponents:Object.values(t.stateNames).length-1,groundWarfare:!1})};let s,i;return t.winner?t.winner===t.playerStateId?(s=Ac,i=`Congratulations! ${t.stateNames[t.playerStateId]} has won with ${se(t.populations[t.playerStateId])} population alive.`):t.winner!==void 0?(s=Cc,i=`${t.stateNames[t.winner]} has won with ${se(t.populations[t.winner])} population alive. Your state has fallen.`):(s=At,i="The game has ended in an unexpected state."):(s=At,i="It's a draw! The world is partially destroyed, but there's still hope."),f.jsx(Ic,{backgroundImage:s,children:f.jsxs("div",{children:[f.jsx("h2",{children:"Game Over"}),f.jsx("p",{children:i}),f.jsx("button",{onClick:n,children:"Play Again"}),f.jsx("br",{}),f.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Se={Component:Tc,path:"played"};function Dc({worldState:e}){var u;const[t,n]=E.useState([]),[s,i]=E.useState(null);Rn(l=>{n(d=>l.messageId&&d.find(m=>m.messageId===l.messageId)?[...d.map(m=>m.messageId===l.messageId?l:m)]:[l,...d])});const a=t.sort((l,d)=>l.actions&&!d.actions?-1:!l.actions&&d.actions?1:l.startTimestamp-d.startTimestamp);if(Ue(l=>{n(d=>d.filter(m=>m.messageId!==l.messageId))}),E.useEffect(()=>{const l=a.find(d=>d.fullScreen&&d.startTimestamp<=e.timestamp&&d.endTimestamp>e.timestamp);i(l||null)},[a,e.timestamp]),!s)return null;const r=((l,d)=>d<l.startTimestamp?"pre":d<l.startTimestamp+.5?"pre-in":d>l.endTimestamp-.5?"post-in":d>l.endTimestamp?"post":"active")(s,e.timestamp),c=l=>Array.isArray(l)?l.map((d,m)=>f.jsx("div",{children:d},m)):l;return f.jsxs(Mc,{"data-message-state":r,"data-action":(((u=s.actions)==null?void 0:u.length)??0)>0,children:[f.jsx(kc,{children:c(s.message)}),s.prompt&&s.actions&&f.jsx(Bc,{children:s.actions.map((l,d)=>f.jsx(wc,{onClick:()=>Ln(s.messageId,l.id),children:l.text},d))})]})}const _c=oe`
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
`,Sc=oe`
  from {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: translateX(-50%) scale(0.9);
  }
`,Mc=F.div`
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
    animation: ${_c} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${Sc} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,kc=F.div`
  font-size: 1.5rem;
  color: white;
  text-align: center;
  white-space: pre-line;
`,Bc=F.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,wc=F.button`
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
`,On="ALLIANCEPROPOSAL";function Lc(e,t,n,s=!1){const i=`${On}_${e.id}_${t.id}`,a=s?`${e.name} has become friendly towards you. Do you want to form an alliance?`:`${e.name} proposes an alliance with ${t.name}. Do you accept?`,o=n.timestamp,r=o+10;w(a,o,r,i,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function Rc({worldState:e,setWorldState:t}){return Ue(n=>{if(n.messageId.startsWith(On)){const[,s,i]=n.messageId.split("_"),a=e.states.find(r=>r.id===s),o=e.states.find(r=>r.id===i);if(!a||!(o!=null&&o.isPlayerControlled))return;if(n.actionId==="accept"){const r=e.states.map(c=>c.id===s||c.id===i?{...c,strategies:{...c.strategies,[s]:v.FRIENDLY,[i]:v.FRIENDLY}}:c);t({...e,states:r}),w(`Alliance formed between ${a.name} and ${o.name}!`,e.timestamp,e.timestamp+5)}else n.actionId==="reject"&&w(`${o.name} has rejected the alliance proposal from ${a.name}.`,e.timestamp,e.timestamp+5)}}),null}function Oc({worldState:e}){const t=e.states.find(h=>h.isPlayerControlled),[n,s]=E.useState(!1),[i,a]=E.useState({}),[o,r]=E.useState([]),[c,u]=E.useState([]),[l,d]=E.useState(!1),m=Math.round(e.timestamp*10)/10;return E.useEffect(()=>{!n&&e.timestamp>0&&(s(!0),w("The game has started!",e.timestamp,e.timestamp+3))},[m]),E.useEffect(()=>{var h,p,g,y;if(t){const x=Object.fromEntries(e.states.map(b=>[b.id,b.strategies]));for(const b of e.states)for(const A of e.states.filter(j=>j.id!==b.id))t&&A.id===t.id&&b.strategies[A.id]===v.FRIENDLY&&A.strategies[b.id]!==v.FRIENDLY&&((h=i[b.id])==null?void 0:h[A.id])!==v.FRIENDLY&&Lc(b,t,e,!0),A.strategies[b.id]===v.FRIENDLY&&b.strategies[A.id]===v.FRIENDLY&&(((p=i[A.id])==null?void 0:p[b.id])!==v.FRIENDLY||((g=i[b.id])==null?void 0:g[A.id])!==v.FRIENDLY)&&w(`${A.name} has formed alliance with ${b.isPlayerControlled?"you":b.name}!`,m,m+3),b.strategies[A.id]===v.HOSTILE&&((y=i[b.id])==null?void 0:y[A.id])!==v.HOSTILE&&w(A.isPlayerControlled?`${b.name} has declared war on You!`:`${b.isPlayerControlled?"You have":b.name} declared war on ${A.name}!`,m,m+3,void 0,void 0,void 0,b.isPlayerControlled||A.isPlayerControlled);a(x)}},[m]),E.useEffect(()=>{t&&e.cities.forEach(h=>{const p=o.find(b=>b.id===h.id);if(!p)return;const g=h.population||0,y=p.population,x=Math.floor(y-g);x>0&&(h.stateId===t.id&&w(g===0?`Your city ${h.name} has been destroyed!`:[`Your city ${h.name} has been hit!`,`${x} casualties reported.`],m,m+3,void 0,void 0,!1,!0),X("cityDamage"))}),r(e.cities.map(h=>({...h})))},[m]),E.useEffect(()=>{if(t){const h=e.launchSites.filter(p=>p.stateId===t.id);c.length>0&&c.filter(g=>!h.some(y=>y.id===g.id)).forEach(()=>{w("One of your launch sites has been destroyed!",m,m+3,void 0,void 0,!1,!0)}),u(h)}},[m]),E.useEffect(()=>{if(t&&!l){const h=e.cities.filter(y=>y.stateId===t.id),p=e.launchSites.filter(y=>y.stateId===t.id);!h.some(y=>y.population>0)&&p.length===0&&(w(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],m,m+5,void 0,void 0,!1,!0),d(!0))}},[m]),null}function jc({worldState:e}){const[t,n]=E.useState([]);Rn(o=>{n(r=>o.messageId&&r.find(c=>c.messageId===o.messageId)?[...r.map(c=>c.messageId===o.messageId?o:c)]:[o,...r])}),Ue(o=>{n(r=>r.filter(c=>c.messageId!==o.messageId))});const s=o=>Array.isArray(o)?o.map((r,c)=>f.jsx("div",{children:r},c)):o,i=(o,r)=>{const l=r-o;return l>60?0:l>50?1-(l-50)/10:1},a=E.useMemo(()=>{const o=e.timestamp,r=60;return t.filter(c=>{const u=c.startTimestamp||0;return o-u<=r}).map(c=>({...c,opacity:i(c.startTimestamp||0,o)}))},[t,e.timestamp]);return f.jsx(Pc,{children:a.map((o,r)=>f.jsxs($c,{style:{opacity:o.opacity},children:[f.jsx("div",{children:s(o.message)}),o.prompt&&o.actions&&f.jsx(Nc,{children:o.actions.map((c,u)=>f.jsx(Uc,{onClick:()=>Ln(o.messageId,c.id),children:c.text},u))})]},r))})}const Pc=F.div`
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
`,$c=F.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,Nc=F.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,Uc=F.button`
  font-size: 10px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function Yc({updateWorldTime:e,currentWorldTime:t}){const[n,s]=E.useState(!1),i=E.useRef(null);Fn(o=>{if(!i.current){i.current=o;return}const r=o-i.current;i.current=o,!(r<=0)&&n&&e(r/1e3)},!0);const a=o=>{const r=Math.floor(o/86400),c=Math.floor(o%86400/3600),u=Math.floor(o%3600/60),l=Math.floor(o%60);return[[r,"d"],[c,"h"],[u,"m"],[l,"s"]].filter(([d])=>!!d).map(([d,m])=>String(d)+m).join(" ")};return f.jsx(Gc,{children:f.jsxs(Hc,{children:[f.jsxs(zc,{children:[t>0?"Current Time: ":"Game not started yet",a(t)]}),f.jsx(J,{onClick:()=>e(1),children:"+1s"}),f.jsx(J,{onClick:()=>e(10),children:"+10s"}),f.jsx(J,{onClick:()=>e(60),children:"+1m"}),f.jsx(J,{onClick:()=>s(!n),children:n?"Stop":"Start"})]})})}const Gc=F.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,Hc=F.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,J=F.button`
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
`,zc=F.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`;function qc({worldState:e}){const t=e.states.find(r=>r.isPlayerControlled);if(!t)return null;const n=(r,c,u=!1)=>{t.strategies[r.id]=c,u&&(r.strategies[t.id]=c)},s=r=>{if(r.id===t.id)return"#4CAF50";const c=t.strategies[r.id],u=r.strategies[t.id];return c===v.FRIENDLY&&u===v.FRIENDLY?"#4CAF50":c===v.HOSTILE||u===v.HOSTILE?"#F44336":"#9E9E9E"},i=vn(e),a=r=>{const c=e.cities.filter(h=>h.stateId===r),u=e.launchSites.filter(h=>h.stateId===r);if(c.length===0&&u.length===0){console.warn("No position information available for this state");return}const l=[...c.map(h=>h.position),...u.map(h=>h.position)],d=l.reduce((h,p)=>({x:h.x+p.x,y:h.y+p.y}),{x:0,y:0}),m={x:d.x/l.length,y:d.y/l.length};hc(m)},o=r=>{const c=t.strategies[r.id],u=r.strategies[t.id];return f.jsxs(Qc,{children:[(c===v.NEUTRAL&&u!==v.HOSTILE||c===v.FRIENDLY&&u!==v.FRIENDLY)&&f.jsx(Q,{color:"#4CAF50",onClick:l=>{l.stopPropagation(),n(r,v.FRIENDLY)},disabled:c===v.FRIENDLY&&u!==v.FRIENDLY,children:"Alliance"}),(c===v.HOSTILE||u===v.HOSTILE)&&f.jsx(Q,{color:"#9E9E9E",onClick:l=>{l.stopPropagation(),n(r,v.NEUTRAL)},disabled:c===v.NEUTRAL&&u!==v.NEUTRAL,children:"Peace"}),c===v.FRIENDLY&&u===v.FRIENDLY&&f.jsx(Q,{color:"#9E9E9E",onClick:l=>{l.stopPropagation(),n(r,v.NEUTRAL,!0)},children:"Neutral"}),c===v.NEUTRAL&&u!==v.HOSTILE&&f.jsx(Q,{color:"#F44336",onClick:l=>{l.stopPropagation(),n(r,v.HOSTILE,!0)},children:"Attack"})]})};return f.jsx(Vc,{children:e.states.map(r=>f.jsxs(Xc,{relationshipColor:s(r),onClick:()=>a(r.id),children:[f.jsx(Wc,{style:{color:r.color},children:r.name.charAt(0)}),f.jsxs(Kc,{children:[f.jsx(Zc,{children:r.name}),f.jsxs(Jc,{children:["👤 ",se(i[r.id])]}),r.id!==t.id?o(r):f.jsx(el,{children:"This is you"})]})]},r.id))})}const Vc=F.div`
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
`,Xc=F.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 10px;
  background: ${e=>`rgba(${parseInt(e.relationshipColor.slice(1,3),16)}, ${parseInt(e.relationshipColor.slice(3,5),16)}, ${parseInt(e.relationshipColor.slice(5,7),16)}, 0.2)`};
  border: 2px solid ${e=>e.relationshipColor};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,Wc=F.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,Kc=F.div`
  display: flex;
  flex-direction: column;
`,Zc=F.span`
  font-weight: bold;
  margin-bottom: 5px;
`,Jc=F.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`,Qc=F.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`,Q=F.button`
  background-color: ${e=>e.color};
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8em;
  transition: opacity 0.3s ease;
  ${e=>e.disabled?"pointer-events: none; opacity: 0.5;":""}

  &:hover {
    opacity: 0.8;
  }
`,el=F.span`
  font-style: italic;
  color: #4caf50;
`,tl=({setGameState:e})=>{const{state:{stateName:t,numberOfOpponents:n,groundWarfare:s}}=Tt(),{worldState:i,setWorldState:a,updateWorldState:o}=Eo(t,n,s);return f.jsxs(f.Fragment,{children:[f.jsx(Ec,{worldState:i}),f.jsx(Yc,{updateWorldTime:r=>o(i,r),currentWorldTime:i.timestamp??0}),f.jsx(Dc,{worldState:i}),f.jsx(qc,{worldState:i}),f.jsx(jc,{worldState:i}),f.jsx(Fc,{worldState:i,onGameOver:r=>e(Se,{result:r})}),f.jsx(Oc,{worldState:i}),f.jsx(Rc,{worldState:i,setWorldState:a})]})},ae={Component:tl,path:"playing"},nl="/assets/play-background-BASXrsIB.png",sl=F.div`
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
    background-image: url(${nl});
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

  input,
  select {
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
`,il=({setGameState:e})=>{const[t,n]=E.useState(gn(1)[0]),[s,i]=E.useState(2),[a,o]=E.useState(!1),r=()=>{e(ae,{stateName:t,numberOfOpponents:s,groundWarfare:a})};return f.jsx(sl,{children:f.jsxs("div",{children:[f.jsx("h2",{children:"Name your state:"}),f.jsx("input",{type:"text",placeholder:"Type your state name here",value:t,onChange:c=>n(c.currentTarget.value)}),f.jsx("br",{}),f.jsx("h2",{children:"How many opponents?"}),f.jsxs("select",{value:s,onChange:c=>i(Number(c.currentTarget.value)),children:[f.jsx("option",{value:1,children:"1"}),f.jsx("option",{value:2,children:"2"}),f.jsx("option",{value:3,children:"3"}),f.jsx("option",{value:4,children:"4"})]}),f.jsx("h2",{children:"Ground warfare? (WIP)"}),f.jsx("input",{type:"checkbox",checked:a,onChange:()=>o(!a)}),f.jsx("br",{}),f.jsx("br",{}),f.jsx("button",{onClick:r,disabled:!t,children:"Start game"}),f.jsx("br",{}),f.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Me={Component:il,path:"play"},al="/assets/intro-background-D_km5uka.png",ol="/assets/nukes-game-title-vcFxx9vI.png",rl=oe`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,cl=oe`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,ll=F.div`
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
    background-image: url(${al});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${rl} 60s ease-in-out infinite;
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
`,ul=F.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${e=>e.isFlashing?1:0};
  animation: ${e=>e.isFlashing?cl:"none"} 4.5s forwards;
`,dl=F.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,ml=F.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,fl=({setGameState:e})=>{const[t,n]=E.useState(!0);return E.useEffect(()=>{const s=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(s)},[]),f.jsxs(ll,{children:[f.jsx(ul,{isFlashing:t}),!t&&f.jsxs(dl,{children:[f.jsx(ml,{src:ol,alt:"Nukes game"}),f.jsx("button",{onClick:()=>e(Me),children:"Play"})]})]})},It={Component:fl,path:""},hl=Yn`
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
`,pl=[{path:It.path,element:f.jsx(ee,{state:It})},{path:Me.path,element:f.jsx(ee,{state:Me})},{path:ae.path,element:f.jsx(ee,{state:ae})},{path:Se.path,element:f.jsx(ee,{state:Se})}];function yl(){var n;const[e]=Nn(),t=e.get("path")??"";return f.jsx(f.Fragment,{children:(n=pl.find(s=>s.path===t))==null?void 0:n.element})}function ee({state:e}){const t=Un();return f.jsxs(f.Fragment,{children:[f.jsx(hl,{}),f.jsx(e.Component,{setGameState:(n,s)=>t({search:"path="+n.path},{state:s})})]})}export{yl as NukesApp,pl as routes};
