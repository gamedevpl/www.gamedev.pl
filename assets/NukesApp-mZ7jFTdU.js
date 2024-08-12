import{c as w,g as Tn,r as b,j as m,R as $,u as gt,a as Sn,b as kn}from"./index-cZR1Iroa.js";import{d as C,m as se,f as Mn}from"./styled-components.browser.esm-BwyWQxWf.js";const vt=20,Q=vt*1.5,me=5,L=20,_n=1,Bn=5,wn=L/Bn,jn=.5,Ln=500,q=.05,fe=5,On=4,oe=60,I=16,O=I*5,yt=1e3,Ie=O*4,Rn=10;var g=(e=>(e.NEUTRAL="NEUTRAL",e.FRIENDLY="FRIENDLY",e.HOSTILE="HOSTILE",e))(g||{}),Et=(e=>(e.LAUNCH_SITE="LAUNCH_SITE",e))(Et||{}),M=(e=>(e.WATER="WATER",e.GROUND="GROUND",e))(M||{}),k=(e=>(e.ATTACK="ATTACK",e.DEFENCE="DEFENCE",e))(k||{});function Pn(e,t){const n=[];for(let a=0;a<t;a++)for(let s=0;s<e;s++)n.push({id:`${s*I},${a*I}`,position:{x:s*I,y:a*I},rect:{left:s*I,top:a*I,right:(s+1)*I,bottom:(a+1)*I},type:M.WATER,depth:0,height:0,population:0});return n}function $n(e,t,n){const a=[],s=Array(n).fill(null).map(()=>Array(t).fill(!1));for(let i=0;i<n;i++)for(let r=0;r<t;r++){const o=i*t+r;e[o].type===M.WATER&&Nn(r,i,t,n,e)&&(a.push([r,i,0]),s[i][r]=!0)}for(;a.length>0;){const[i,r,o]=a.shift(),u=r*t+i;e[u].type===M.WATER?e[u].depth=o+(Math.random()-Math.random())/5:e[u].type===M.GROUND&&(e[u].height=Math.sqrt(o)+(Math.random()-Math.random())/10);const c=[[-1,0],[1,0],[0,-1],[0,1]];for(const[l,d]of c){const f=i+l,h=r+d;bt(f,h,t,n)&&!s[h][f]&&(a.push([f,h,o+1]),s[h][f]=!0)}}}function Nn(e,t,n,a,s){return[[-1,0],[1,0],[0,-1],[0,1]].some(([r,o])=>{const u=e+r,c=t+o;if(bt(u,c,n,a)){const l=c*n+u;return s[l].type===M.GROUND}return!1})}function bt(e,t,n,a){return e>=0&&e<n&&t>=0&&t<a}var xt={exports:{}},Un=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(e){var t=Un,n=t.filter(function(s){return!!s.css}),a=t.filter(function(s){return!!s.vga});e.exports=function(s){var i=e.exports.get(s);return i&&i.value},e.exports.get=function(s){return s=s||"",s=s.trim().toLowerCase(),t.filter(function(i){return i.name.toLowerCase()===s}).pop()},e.exports.all=e.exports.get.all=function(){return t},e.exports.get.css=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),n.filter(function(i){return i.name.toLowerCase()===s}).pop()):n},e.exports.get.vga=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),a.filter(function(i){return i.name.toLowerCase()===s}).pop()):a}})(xt);var Yn=xt.exports,zn=1/0,Hn="[object Symbol]",Gn=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,Ct="\\ud800-\\udfff",Vn="\\u0300-\\u036f\\ufe20-\\ufe23",Wn="\\u20d0-\\u20f0",Ft="\\u2700-\\u27bf",At="a-z\\xdf-\\xf6\\xf8-\\xff",Xn="\\xac\\xb1\\xd7\\xf7",qn="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",Kn="\\u2000-\\u206f",Zn=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",Dt="A-Z\\xc0-\\xd6\\xd8-\\xde",Jn="\\ufe0e\\ufe0f",It=Xn+qn+Kn+Zn,Tt="['’]",Le="["+It+"]",Qn="["+Vn+Wn+"]",St="\\d+",ea="["+Ft+"]",kt="["+At+"]",Mt="[^"+Ct+It+St+Ft+At+Dt+"]",ta="\\ud83c[\\udffb-\\udfff]",na="(?:"+Qn+"|"+ta+")",aa="[^"+Ct+"]",_t="(?:\\ud83c[\\udde6-\\uddff]){2}",Bt="[\\ud800-\\udbff][\\udc00-\\udfff]",z="["+Dt+"]",sa="\\u200d",Oe="(?:"+kt+"|"+Mt+")",ia="(?:"+z+"|"+Mt+")",Re="(?:"+Tt+"(?:d|ll|m|re|s|t|ve))?",Pe="(?:"+Tt+"(?:D|LL|M|RE|S|T|VE))?",wt=na+"?",jt="["+Jn+"]?",ra="(?:"+sa+"(?:"+[aa,_t,Bt].join("|")+")"+jt+wt+")*",oa=jt+wt+ra,la="(?:"+[ea,_t,Bt].join("|")+")"+oa,ua=RegExp([z+"?"+kt+"+"+Re+"(?="+[Le,z,"$"].join("|")+")",ia+"+"+Pe+"(?="+[Le,z+Oe,"$"].join("|")+")",z+"?"+Oe+"+"+Re,z+"+"+Pe,St,la].join("|"),"g"),ca=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,da=typeof w=="object"&&w&&w.Object===Object&&w,ma=typeof self=="object"&&self&&self.Object===Object&&self,fa=da||ma||Function("return this")();function ha(e){return e.match(Gn)||[]}function pa(e){return ca.test(e)}function ga(e){return e.match(ua)||[]}var va=Object.prototype,ya=va.toString,$e=fa.Symbol,Ne=$e?$e.prototype:void 0,Ue=Ne?Ne.toString:void 0;function Ea(e){if(typeof e=="string")return e;if(xa(e))return Ue?Ue.call(e):"";var t=e+"";return t=="0"&&1/e==-zn?"-0":t}function ba(e){return!!e&&typeof e=="object"}function xa(e){return typeof e=="symbol"||ba(e)&&ya.call(e)==Hn}function Ca(e){return e==null?"":Ea(e)}function Fa(e,t,n){return e=Ca(e),t=n?void 0:t,t===void 0?pa(e)?ga(e):ha(e):e.match(t)||[]}var Aa=Fa,Da=1/0,Ia="[object Symbol]",Ta=/^\s+/,Te="\\ud800-\\udfff",Lt="\\u0300-\\u036f\\ufe20-\\ufe23",Ot="\\u20d0-\\u20f0",Rt="\\ufe0e\\ufe0f",Sa="["+Te+"]",he="["+Lt+Ot+"]",pe="\\ud83c[\\udffb-\\udfff]",ka="(?:"+he+"|"+pe+")",Pt="[^"+Te+"]",$t="(?:\\ud83c[\\udde6-\\uddff]){2}",Nt="[\\ud800-\\udbff][\\udc00-\\udfff]",Ut="\\u200d",Yt=ka+"?",zt="["+Rt+"]?",Ma="(?:"+Ut+"(?:"+[Pt,$t,Nt].join("|")+")"+zt+Yt+")*",_a=zt+Yt+Ma,Ba="(?:"+[Pt+he+"?",he,$t,Nt,Sa].join("|")+")",wa=RegExp(pe+"(?="+pe+")|"+Ba+_a,"g"),ja=RegExp("["+Ut+Te+Lt+Ot+Rt+"]"),La=typeof w=="object"&&w&&w.Object===Object&&w,Oa=typeof self=="object"&&self&&self.Object===Object&&self,Ra=La||Oa||Function("return this")();function Pa(e){return e.split("")}function $a(e,t,n,a){for(var s=e.length,i=n+-1;++i<s;)if(t(e[i],i,e))return i;return-1}function Na(e,t,n){if(t!==t)return $a(e,Ua,n);for(var a=n-1,s=e.length;++a<s;)if(e[a]===t)return a;return-1}function Ua(e){return e!==e}function Ya(e,t){for(var n=-1,a=e.length;++n<a&&Na(t,e[n],0)>-1;);return n}function za(e){return ja.test(e)}function Ye(e){return za(e)?Ha(e):Pa(e)}function Ha(e){return e.match(wa)||[]}var Ga=Object.prototype,Va=Ga.toString,ze=Ra.Symbol,He=ze?ze.prototype:void 0,Ge=He?He.toString:void 0;function Wa(e,t,n){var a=-1,s=e.length;t<0&&(t=-t>s?0:s+t),n=n>s?s:n,n<0&&(n+=s),s=t>n?0:n-t>>>0,t>>>=0;for(var i=Array(s);++a<s;)i[a]=e[a+t];return i}function Ht(e){if(typeof e=="string")return e;if(Ka(e))return Ge?Ge.call(e):"";var t=e+"";return t=="0"&&1/e==-Da?"-0":t}function Xa(e,t,n){var a=e.length;return n=n===void 0?a:n,!t&&n>=a?e:Wa(e,t,n)}function qa(e){return!!e&&typeof e=="object"}function Ka(e){return typeof e=="symbol"||qa(e)&&Va.call(e)==Ia}function Za(e){return e==null?"":Ht(e)}function Ja(e,t,n){if(e=Za(e),e&&(n||t===void 0))return e.replace(Ta,"");if(!e||!(t=Ht(t)))return e;var a=Ye(e),s=Ya(a,Ye(t));return Xa(a,s).join("")}var Qa=Ja,ge=1/0,es=9007199254740991,ts=17976931348623157e292,Ve=NaN,ns="[object Symbol]",as=/^\s+|\s+$/g,ss=/^[-+]0x[0-9a-f]+$/i,is=/^0b[01]+$/i,rs=/^0o[0-7]+$/i,Se="\\ud800-\\udfff",Gt="\\u0300-\\u036f\\ufe20-\\ufe23",Vt="\\u20d0-\\u20f0",Wt="\\ufe0e\\ufe0f",os="["+Se+"]",ve="["+Gt+Vt+"]",ye="\\ud83c[\\udffb-\\udfff]",ls="(?:"+ve+"|"+ye+")",Xt="[^"+Se+"]",qt="(?:\\ud83c[\\udde6-\\uddff]){2}",Kt="[\\ud800-\\udbff][\\udc00-\\udfff]",Zt="\\u200d",Jt=ls+"?",Qt="["+Wt+"]?",us="(?:"+Zt+"(?:"+[Xt,qt,Kt].join("|")+")"+Qt+Jt+")*",cs=Qt+Jt+us,ds="(?:"+[Xt+ve+"?",ve,qt,Kt,os].join("|")+")",Ee=RegExp(ye+"(?="+ye+")|"+ds+cs,"g"),ms=RegExp("["+Zt+Se+Gt+Vt+Wt+"]"),fs=parseInt,hs=typeof w=="object"&&w&&w.Object===Object&&w,ps=typeof self=="object"&&self&&self.Object===Object&&self,gs=hs||ps||Function("return this")(),vs=Es("length");function ys(e){return e.split("")}function Es(e){return function(t){return t==null?void 0:t[e]}}function ke(e){return ms.test(e)}function en(e){return ke(e)?xs(e):vs(e)}function bs(e){return ke(e)?Cs(e):ys(e)}function xs(e){for(var t=Ee.lastIndex=0;Ee.test(e);)t++;return t}function Cs(e){return e.match(Ee)||[]}var Fs=Object.prototype,As=Fs.toString,We=gs.Symbol,Ds=Math.ceil,Is=Math.floor,Xe=We?We.prototype:void 0,qe=Xe?Xe.toString:void 0;function Ke(e,t){var n="";if(!e||t<1||t>es)return n;do t%2&&(n+=e),t=Is(t/2),t&&(e+=e);while(t);return n}function Ts(e,t,n){var a=-1,s=e.length;t<0&&(t=-t>s?0:s+t),n=n>s?s:n,n<0&&(n+=s),s=t>n?0:n-t>>>0,t>>>=0;for(var i=Array(s);++a<s;)i[a]=e[a+t];return i}function tn(e){if(typeof e=="string")return e;if(nn(e))return qe?qe.call(e):"";var t=e+"";return t=="0"&&1/e==-ge?"-0":t}function Ss(e,t,n){var a=e.length;return n=n===void 0?a:n,!t&&n>=a?e:Ts(e,t,n)}function ks(e,t){t=t===void 0?" ":tn(t);var n=t.length;if(n<2)return n?Ke(t,e):t;var a=Ke(t,Ds(e/en(t)));return ke(t)?Ss(bs(a),0,e).join(""):a.slice(0,e)}function Ze(e){var t=typeof e;return!!e&&(t=="object"||t=="function")}function Ms(e){return!!e&&typeof e=="object"}function nn(e){return typeof e=="symbol"||Ms(e)&&As.call(e)==ns}function _s(e){if(!e)return e===0?e:0;if(e=ws(e),e===ge||e===-ge){var t=e<0?-1:1;return t*ts}return e===e?e:0}function Bs(e){var t=_s(e),n=t%1;return t===t?n?t-n:t:0}function ws(e){if(typeof e=="number")return e;if(nn(e))return Ve;if(Ze(e)){var t=typeof e.valueOf=="function"?e.valueOf():e;e=Ze(t)?t+"":t}if(typeof e!="string")return e===0?e:+e;e=e.replace(as,"");var n=is.test(e);return n||rs.test(e)?fs(e.slice(2),n?2:8):ss.test(e)?Ve:+e}function js(e){return e==null?"":tn(e)}function Ls(e,t,n){e=js(e),t=Bs(t);var a=t?en(e):0;return t&&a<t?e+ks(t-a,n):e}var Os=Ls,Rs=(e,t,n,a)=>{const s=(e+(a||"")).toString().includes("%");if(typeof e=="string"?[e,t,n,a]=e.match(/(0?\.?\d{1,3})%?\b/g).map(Number):a!==void 0&&(a=parseFloat(a)),typeof e!="number"||typeof t!="number"||typeof n!="number"||e>255||t>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof a=="number"){if(!s&&a>=0&&a<=1)a=Math.round(255*a);else if(s&&a>=0&&a<=100)a=Math.round(255*a/100);else throw new TypeError(`Expected alpha value (${a}) as a fraction or percentage`);a=(a|256).toString(16).slice(1)}else a="";return(n|t<<8|e<<16|1<<24).toString(16).slice(1)+a};const G="a-f\\d",Ps=`#?[${G}]{3}[${G}]?`,$s=`#?[${G}]{6}([${G}]{2})?`,Ns=new RegExp(`[^#${G}]`,"gi"),Us=new RegExp(`^${Ps}$|^${$s}$`,"i");var Ys=(e,t={})=>{if(typeof e!="string"||Ns.test(e)||!Us.test(e))throw new TypeError("Expected a valid hex string");e=e.replace(/^#/,"");let n=1;e.length===8&&(n=Number.parseInt(e.slice(6,8),16)/255,e=e.slice(0,6)),e.length===4&&(n=Number.parseInt(e.slice(3,4).repeat(2),16)/255,e=e.slice(0,3)),e.length===3&&(e=e[0]+e[0]+e[1]+e[1]+e[2]+e[2]);const a=Number.parseInt(e,16),s=a>>16,i=a>>8&255,r=a&255,o=typeof t.alpha=="number"?t.alpha:n;if(t.format==="array")return[s,i,r,o];if(t.format==="css"){const u=o===1?"":` / ${Number((o*100).toFixed(2))}%`;return`rgb(${s} ${i} ${r}${u})`}return{red:s,green:i,blue:r,alpha:o}},zs=Yn,Hs=Aa,Gs=Qa,Vs=Os,Ws=Rs,an=Ys;const le=.75,ue=.25,ce=16777215,Xs=49979693;var qs=function(e){return"#"+Js(String(JSON.stringify(e)))};function Ks(e){var t=Hs(e),n=[];return t.forEach(function(a){var s=zs(a);s&&n.push(an(Gs(s,"#"),{format:"array"}))}),n}function Zs(e){var t=[0,0,0];return e.forEach(function(n){for(var a=0;a<3;a++)t[a]+=n[a]}),[t[0]/e.length,t[1]/e.length,t[2]/e.length]}function Js(e){var t,n=Ks(e);n.length>0&&(t=Zs(n));var a=1,s=0,i=1;if(e.length>0)for(var r=0;r<e.length;r++)e[r].charCodeAt(0)>s&&(s=e[r].charCodeAt(0)),i=parseInt(ce/s),a=(a+e[r].charCodeAt(0)*i*Xs)%ce;var o=(a*e.length%ce).toString(16);o=Vs(o,6,o);var u=an(o,{format:"array"});return t?Ws(ue*u[0]+le*t[0],ue*u[1]+le*t[1],ue*u[2]+le*t[2]):o}const Qs=Tn(qs);function ei(e){return[...ti].sort(()=>Math.random()-Math.random()).slice(0,e)}const ti=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function sn(e){return[...ni].sort(()=>Math.random()-Math.random()).slice(0,e)}const ni=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];function ai(){const e=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],t=Array.from({length:256},(s,i)=>i).sort(()=>Math.random()-.5),n=[...t,...t];function a(s,i,r){return s[0]*i+s[1]*r}return function(i,r){const o=Math.floor(i)&255,u=Math.floor(r)&255;i-=Math.floor(i),r-=Math.floor(r);const c=i*i*i*(i*(i*6-15)+10),l=r*r*r*(r*(r*6-15)+10),d=n[o]+u,f=n[o+1]+u;return(1+(a(e[n[d]&7],i,r)*(1-c)+a(e[n[f]&7],i-1,r)*c)*(1-l)+(a(e[n[d+1]&7],i,r-1)*(1-c)+a(e[n[f+1]&7],i-1,r-1)*c)*l)/2}}function be(e,t,n,a,s){const i=ai(),r=Math.floor(e.x/I),o=Math.floor(e.y/I),u=Math.floor(a/4),c=.5,l=.005,d=.7;for(let h=o-u;h<=o+u;h++)for(let p=r-u;p<=r+u;p++)if(p>=0&&p<a&&h>=0&&h<s){let y=p,v=h;for(let F=0;F<t;F++)Math.random()<d&&(y+=Math.random()>.5?1:-1,v+=Math.random()>.5?1:-1);y=Math.max(0,Math.min(a-1,y)),v=Math.max(0,Math.min(s-1,v));const x=Math.sqrt((y-r)*(y-r)+(v-o)*(v-o))/u,E=i(p*l,h*l);if(x<1&&E>c+x*.01){const F=h*a+p;n[F].type=M.GROUND,n[F].depth=void 0,n[F].height=(1-x)*2*(E-c)}}const f=Math.min(Math.max(o*a+r,0),a);n[f].type=M.GROUND,n[f].depth=void 0,n[f].height=1}function si(e,t){return{x:Math.floor(Math.random()*(e*.8)+e*.1)*I,y:Math.floor(Math.random()*(t*.8)+t*.1)*I}}function ii(e,t,n,a){if(e.x<0||e.y<0||e.x>=n||e.y>=a)return!1;const s=Math.floor(n/(Math.sqrt(t.length+1)*2));return t.every(i=>Math.abs(e.x-i.x)>s||Math.abs(e.y-i.y)>s)}function ri(e,t,n){return t.every(a=>Math.sqrt(Math.pow(e.x-a.position.x,2)+Math.pow(e.y-a.position.y,2))>=n)}function oi(e,t,n,a,s){const i=[],r=[],o=[],u=L*3,c=sn(e*2).filter(h=>h!==t),l=5,d=ei(e*l*2),f=[];for(let h=0;h<e;h++){const p=`state-${h+1}`,y=h===0?t:c.pop(),v=li(p,y,h===0);i.push(v),i.forEach(E=>{v.strategies[E.id]=g.NEUTRAL,E.strategies[p]=g.NEUTRAL});const x=ui(f,n,a);f.push(x),be(x,n/2,s,n,a),ci(p,x,l,d,r,o,u,s,n,a),v.population=r.filter(E=>E.stateId===p).reduce((E,F)=>E+F.population,0)}return di(s,r),{states:i,cities:r,launchSites:o}}function li(e,t,n){return{id:e,name:t,color:Qs(t),isPlayerControlled:n,strategies:{},lastStrategyUpdate:0,generalStrategy:n?void 0:[g.NEUTRAL,g.HOSTILE,g.FRIENDLY].sort(()=>Math.random()-.5)[0],population:0}}function ui(e,t,n){let a,s=10;do if(a=si(t,n),s--<=0)break;while(!ii(a,e,t,n));return a}function ci(e,t,n,a,s,i,r,o,u,c){const l=[];for(let d=0;d<n;d++){const f=Je(t,l,r,30*I);l.push({position:f}),s.push({id:`city-${s.length+1}`,stateId:e,name:a.pop(),position:f,population:Math.floor(Math.random()*3e3)+1e3}),be(f,2,o,u,c)}for(const d of s){const f=o.filter(h=>{const p=h.position.x-d.position.x,y=h.position.y-d.position.y;return Math.sqrt(p*p+y*y)<O});for(const h of f){h.cityId=d.id;const p=h.position.x-d.position.x,y=h.position.y-d.position.y,v=Math.sqrt(p*p+y*y);h.population=Math.max(0,O-v)/O*yt}d.population=f.reduce((h,p)=>h+p.population,0)}for(let d=0;d<4;d++){const f=Je(t,l,r,15*I);l.push({position:f}),i.push({type:Et.LAUNCH_SITE,id:`launch-site-${i.length+1}`,stateId:e,position:f,mode:Math.random()>.5?k.DEFENCE:k.ATTACK}),be(f,1,o,u,c)}return l}function Je(e,t,n,a){let s,i=10;do if(s={x:e.x+(Math.random()-.5)*a,y:e.y+(Math.random()-.5)*a},i--<=0)break;while(!ri(s,t,n));return s}function di(e,t){const n=new Map(e.map(s=>[s.id,s])),a=[];for(t.forEach(s=>{e.filter(r=>r.cityId===s.id).forEach(r=>{r.stateId=s.stateId,a.push(r)})});a.length>0;){const s=a.splice(0,1)[0];mi(s,n).forEach(r=>{!r.stateId&&r.type===M.GROUND&&(r.stateId=s.stateId,a.push(r))})}}function mi(e,t){const n=[];return[{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:-1},{dx:0,dy:1}].forEach(({dx:s,dy:i})=>{const r=`${e.position.x+s*I},${e.position.y+i*I}`,o=t.get(r);o&&n.push(o)}),n}function rn(e){return Object.fromEntries(e.states.map(t=>[t.id,t.population]))}function te(e){return e>=1e3?`${(e/1e3).toFixed(1)}M`:`${e.toFixed(0)}K`}function fi(e,t){const n=[],a=new Map;e.forEach(i=>{a.set(`${i.position.x},${i.position.y}`,i)});const s=(i,r)=>{const o=a.get(`${r.x},${r.y}`);if(o&&o.stateId&&o.stateId!==t.id){const u=n.find(()=>i.id===o.id)??{...i,adjacentStateIds:new Set};n.includes(u)||n.push(u),u.adjacentStateIds.add(o.stateId)}};return e.forEach(i=>{i.stateId===t.id&&[{x:i.position.x,y:i.position.y-I},{x:i.position.x,y:i.position.y+I},{x:i.position.x-I,y:i.position.y},{x:i.position.x+I,y:i.position.y}].forEach(o=>s(i,o))}),Array.from(n)}function hi(e,t,n){const a=[],s=fi(e,t),i={};s.forEach(o=>{for(const u of o.adjacentStateIds)i[u]=(i[u]||0)+1});const r=Object.values(i).reduce((o,u)=>o+u,0);return s.forEach(o=>{if(o.stateId&&o.stateId===t.id){const u=Array.from(o.adjacentStateIds).reduce((d,f)=>d+i[f],0),c=u/r,l=Math.round(n*c)/u;l>0&&a.push({quantity:l,position:o.position,stateId:t.id,order:{type:"stay"}})}}),a}function pi({playerStateName:e,numberOfStates:t=3}){const n=Math.max(200,Math.ceil(Math.sqrt(t)*10)),a=n,s=Pn(n,a),{states:i,cities:r,launchSites:o}=oi(t,e,n,a,s);$n(s,n,a);const u=[],c=[],l=[],d=[];for(const f of i)d.push(...hi(s,f,1e3));return{timestamp:0,states:i,cities:r,launchSites:o,sectors:s,units:d,missiles:u,explosions:c,interceptors:l}}function _(e,t,n,a){return Math.sqrt(Math.pow(n-e,2)+Math.pow(a-t,2))}function gi(e){var n;const t=e.sectors.filter(a=>a.cityId&&a.population>0);for(const a of e.states){const s=e.cities.filter(l=>l.stateId===a.id),i=e.launchSites.filter(l=>l.stateId===a.id),r=e.cities.filter(l=>a.strategies[l.stateId]===g.HOSTILE&&l.stateId!==a.id&&l.population>0).map(l=>({...l,isCity:!0})),o=e.missiles.filter(l=>a.strategies[l.stateId]!==g.FRIENDLY&&l.stateId!==a.id),u=e.launchSites.filter(l=>a.strategies[l.stateId]===g.HOSTILE&&l.stateId!==a.id).map(l=>({...l,isCity:!1})),c=o.filter(l=>s.some(d=>xe(l.target,d.position,L+O))||i.some(d=>xe(l.target,d.position,L))).filter(l=>(e.timestamp-l.launchTimestamp)/(l.targetTimestamp-l.launchTimestamp)>.5);for(const l of e.launchSites.filter(d=>d.stateId===a.id)){if(l.nextLaunchTarget)continue;if(r.length===0&&u.length===0&&o.length===0)break;if(c.length===0&&l.mode===k.DEFENCE||c.length>0&&l.mode===k.ATTACK){l.modeChangeTimestamp||(l.modeChangeTimestamp=e.timestamp);continue}const d=Qe(c.map(v=>({...v,isCity:!1})),l.position),f=e.missiles.filter(v=>v.stateId===a.id),h=e.interceptors.filter(v=>v.stateId===a.id),p=h.filter(v=>!v.targetMissileId&&l.id===v.launchSiteId),y=yi(h,d).filter(([,v])=>v<i.length);if(l.mode===k.DEFENCE&&y.length>0){const v=y[0][0];p.length>0?p[0].targetMissileId=v:l.nextLaunchTarget={type:"missile",missileId:v}}else if(l.mode===k.ATTACK){const v=vi(Qe([...u,...r],l.position),f),x=(n=v==null?void 0:v[0])==null?void 0:n[0];if(x!=null&&x.position&&(x!=null&&x.isCity)){const E=Ei(x,t);l.nextLaunchTarget={type:"position",position:E||{x:x.position.x+(Math.random()-Math.random())*O,y:x.position.y+(Math.random()-Math.random())*O}}}else l.nextLaunchTarget=x!=null&&x.position?{type:"position",position:x==null?void 0:x.position}:void 0}}}return e}function xe(e,t,n){return _(e.x,e.y,t.x,t.y)<=n}function Qe(e,t){return e.sort((n,a)=>_(n.position.x,n.position.y,t.x,t.y)-_(a.position.x,a.position.y,t.x,t.y))}function vi(e,t){const n=new Map;for(const a of e)n.set(a,t.filter(s=>xe(s.target,a.position,L)).length);return Array.from(n).sort((a,s)=>a[1]-s[1])}function yi(e,t){const n=new Map;for(const a of t)n.set(a.id,0);for(const a of e)a.targetMissileId&&n.set(a.targetMissileId,(n.get(a.targetMissileId)??0)+1);return Array.from(n).sort((a,s)=>a[1]-s[1])}function Ei(e,t){const n=t.filter(s=>s.cityId===e.id);return!n||n.length===0?null:n[Math.floor(Math.random()*n.length)].position}function bi(e){var t,n;for(const a of e.missiles.filter(s=>s.launchTimestamp===e.timestamp)){const s=e.states.find(r=>r.id===a.stateId),i=((t=e.cities.find(r=>_(r.position.x,r.position.y,a.target.x,a.target.y)<=L+O))==null?void 0:t.stateId)||((n=e.launchSites.find(r=>_(r.position.x,r.position.y,a.target.x,a.target.y)<=L))==null?void 0:n.stateId);if(s&&i&&s.id!==i){s.strategies[i]!==g.HOSTILE&&(s.strategies[i]=g.HOSTILE);const r=e.states.find(o=>o.id===i);r&&r.strategies[s.id]!==g.HOSTILE&&(r.strategies[s.id]=g.HOSTILE,e.states.forEach(o=>{o.id!==r.id&&o.strategies[r.id]===g.FRIENDLY&&r.strategies[o.id]===g.FRIENDLY&&(o.strategies[s.id]=g.HOSTILE,s.strategies[o.id]=g.HOSTILE)}))}}for(const a of e.states.filter(s=>!s.isPlayerControlled))xi(a,e);return e}function xi(e,t){if(e.lastStrategyUpdate&&t.timestamp-e.lastStrategyUpdate<Rn)return;e.lastStrategyUpdate=t.timestamp;const n=t.states.filter(r=>r.id!==e.id),a=n.filter(r=>e.strategies[r.id]===g.FRIENDLY&&r.strategies[e.id]===g.FRIENDLY);e.strategies={...e.strategies},n.forEach(r=>{r.strategies[e.id]===g.FRIENDLY&&e.strategies[r.id]===g.NEUTRAL&&(e.generalStrategy!==g.HOSTILE?e.strategies[r.id]=g.FRIENDLY:r.strategies[e.id]=g.NEUTRAL)}),n.forEach(r=>{r.strategies[e.id]===g.NEUTRAL&&e.strategies[r.id]===g.HOSTILE&&(et(e,r,a,t)?e.strategies[r.id]=g.NEUTRAL:r.strategies[e.id]=g.HOSTILE)});const s=n.filter(r=>Object.values(r.strategies).every(o=>o!==g.HOSTILE)&&r.generalStrategy!==g.HOSTILE);if(s.length>0&&e.generalStrategy===g.FRIENDLY){const r=s[Math.floor(Math.random()*s.length)];e.strategies[r.id]=g.FRIENDLY}a.forEach(r=>{n.forEach(o=>{o.strategies[r.id]===g.HOSTILE&&e.strategies[o.id]!==g.HOSTILE&&(e.strategies[o.id]=g.HOSTILE)})}),n.filter(r=>r.strategies[e.id]!==g.FRIENDLY&&e.strategies[r.id]!==g.FRIENDLY).forEach(r=>{if(et(r,e,a,t)){const o=t.launchSites.filter(u=>u.stateId===e.id&&!u.lastLaunchTimestamp);if(o.length>0){const u=o[Math.floor(Math.random()*o.length)],c=[...t.cities.filter(l=>l.stateId===r.id),...t.launchSites.filter(l=>l.stateId===r.id)];if(c.length>0){const l=c[Math.floor(Math.random()*c.length)];u.nextLaunchTarget={type:"position",position:l.position}}}}})}function et(e,t,n,a){const s=a.states.filter(u=>e.strategies[u.id]===g.FRIENDLY&&u.strategies[e.id]===g.FRIENDLY&&u.id!==e.id),i=a.launchSites.filter(u=>u.stateId===e.id||s.some(c=>c.id===u.stateId)),r=a.launchSites.filter(u=>u.stateId===t.id||n.some(c=>c.id===u.stateId));return i.length<r.length?!0:a.missiles.some(u=>a.cities.some(c=>c.stateId===e.id&&_(c.position.x,c.position.y,u.target.x,u.target.y)<=L)||a.launchSites.some(c=>c.stateId===e.id&&_(c.position.x,c.position.y,u.target.x,u.target.y)<=L))}function Ci(e,t){for(const n of e.missiles){const a=(t-n.launchTimestamp)/(n.targetTimestamp-n.launchTimestamp);n.position={x:n.launch.x+(n.target.x-n.launch.x)*a,y:n.launch.y+(n.target.y-n.launch.y)*a}}return e}function Fi(e,t){return e.interceptors=e.interceptors.filter(n=>{const a=e.missiles.find(u=>u.id===n.targetMissileId);a||(n.targetMissileId=void 0);const s=a?a.position.x-n.position.x:Math.cos(n.direction),i=a?a.position.y-n.position.y:Math.sin(n.direction),r=Math.sqrt(s*s+i*i);if(n.direction=Math.atan2(i,s),a&&r<=Q*t)n.position={...a.position};else{const u=Q*t/r;n.position={x:n.position.x+s*u,y:n.position.y+i*u}}return n.tail=[...n.tail.slice(-100),{timestamp:e.timestamp,position:n.position}],Q*(e.timestamp-n.launchTimestamp)<=n.maxRange}),e}function Ai(e){for(const t of e.interceptors){const n=e.missiles.find(a=>a.id===t.targetMissileId);n&&_(t.position.x,t.position.y,n.position.x,n.position.y)<_n&&(e.missiles=e.missiles.filter(s=>s.id!==n.id),e.interceptors=e.interceptors.filter(s=>s.id!==t.id))}return e}function Di(e,t,n){for(const a of t.missiles.filter(s=>s.targetTimestamp<=n)){const s=Ii(a);e.explosions.push(s),e=Ti(e,s),e=Si(e,s,t),e=ki(e,s,t)}return e.explosions=e.explosions.filter(a=>a.endTimestamp>=n),e.missiles=e.missiles.filter(a=>a.targetTimestamp>n),e}function Ii(e){return{id:`explosion-${Math.random()}`,missileId:e.id,startTimestamp:e.targetTimestamp,endTimestamp:e.targetTimestamp+wn,position:e.target,radius:L}}function Ti(e,t){for(const n of e.sectors.filter(a=>_(a.position.x,a.position.y,t.position.x,t.position.y)<=t.radius))if(n.population){const a=Math.max(Ln,n.population*jn);n.population=Math.max(0,n.population-a)}return e}function Si(e,t,n){const a=n.missiles.filter(s=>s.id!==t.missileId&&s.launchTimestamp<=t.startTimestamp&&s.targetTimestamp>=t.startTimestamp&&_(s.position.x,s.position.y,t.position.x,t.position.y)<=t.radius);for(const s of a)s.targetTimestamp=t.startTimestamp;return e.interceptors=e.interceptors.filter(s=>!(s.launchTimestamp<=t.startTimestamp&&_(s.position.x,s.position.y,t.position.x,t.position.y)<=t.radius)),e}function ki(e,t,n){const a=n.launchSites.filter(s=>_(s.position.x,s.position.y,t.position.x,t.position.y)<=t.radius);return e.launchSites=e.launchSites.filter(s=>!a.some(i=>i.id===s.id)),e}function Mi(e,t){for(const n of e.launchSites)n.modeChangeTimestamp&&t>=n.modeChangeTimestamp+me&&(n.mode=n.mode===k.ATTACK?k.DEFENCE:k.ATTACK,n.modeChangeTimestamp=void 0);return e}function _i(e,t,n){var a,s;for(const i of t.launchSites)if(i.nextLaunchTarget&&!(i.lastLaunchTimestamp&&n-i.lastLaunchTimestamp<(i.mode===k.ATTACK?fe:On))){if(i.mode===k.ATTACK&&((a=i.nextLaunchTarget)==null?void 0:a.type)==="position")e.missiles.push(Bi(i,i.nextLaunchTarget.position,n));else if(i.mode===k.DEFENCE&&((s=i.nextLaunchTarget)==null?void 0:s.type)==="missile"){const r=i.nextLaunchTarget.missileId;r&&e.interceptors.push(wi(i,n,r))}i.lastLaunchTimestamp=n,i.nextLaunchTarget=void 0}return e}function Bi(e,t,n){return{id:Math.random()+"",stateId:e.stateId,launchSiteId:e.id,launch:e.position,launchTimestamp:n,position:e.position,target:t,targetTimestamp:n+_(e.position.x,e.position.y,t.x,t.y)/vt}}function wi(e,t,n){return{id:Math.random()+"",stateId:e.stateId,launchSiteId:e.id,launch:e.position,launchTimestamp:t,position:e.position,direction:0,tail:[],targetMissileId:n,maxRange:Ie}}function ji(e){const t=e.sectors.reduce((n,a)=>(a.cityId&&(n[a.cityId]=n[a.cityId]?n[a.cityId]+(a.population??0):a.population??0),n),{});for(const n of e.cities)n.population=t[n.id];return e.states=e.states.map(n=>{const a=e.cities.filter(s=>s.stateId===n.id).reduce((s,i)=>s+i.population,0);return{...n,population:a}}),e}function Li(e,t){for(;t>0;){const n=Oi(e,t>q?q:t);t=t>q?t-q:0,e=n}return e}function Oi(e,t){const n=e.timestamp+t;let a={timestamp:n,states:e.states,cities:e.cities,launchSites:e.launchSites,missiles:e.missiles,interceptors:e.interceptors,units:e.units,explosions:e.explosions,sectors:e.sectors};return a=Ci(a,n),a=Fi(a,t),a=Ai(a),a=Di(a,e,n),a=Mi(a,n),a=_i(a,e,n),a=ji(a),a=gi(a),a=bi(a),a}function Ri(e){const[t,n]=b.useState(()=>pi({playerStateName:e,numberOfStates:6})),a=b.useCallback((s,i)=>n(Li(s,i)),[]);return{worldState:t,updateWorldState:a,setWorldState:n}}const on={x:0,y:0,pointingObjects:[]},Pi=(e,t)=>t.type==="move"?{x:t.x,y:t.y,pointingObjects:e.pointingObjects}:t.type==="point"&&!e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:[...e.pointingObjects,t.object]}:t.type==="unpoint"&&e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:e.pointingObjects.filter(n=>n.id!==t.object.id)}:e,$i=b.createContext(on),Me=b.createContext(()=>{});function Ni({children:e}){const[t,n]=b.useReducer(Pi,on);return m.jsx($i.Provider,{value:t,children:m.jsx(Me.Provider,{value:n,children:e})})}function Ui(){const e=b.useContext(Me);return(t,n)=>e({type:"move",x:t,y:n})}function _e(){const e=b.useContext(Me);return[t=>e({type:"point",object:t}),t=>e({type:"unpoint",object:t})]}const Be={},Yi=(e,t)=>t.type==="clear"?Be:t.type==="set"?{...e,selectedObject:t.object}:e,ln=b.createContext(Be),un=b.createContext(()=>{});function zi({children:e}){const[t,n]=b.useReducer(Yi,Be);return m.jsx(ln.Provider,{value:t,children:m.jsx(un.Provider,{value:n,children:e})})}function Hi(e){var a;const t=b.useContext(un);return[((a=b.useContext(ln).selectedObject)==null?void 0:a.id)===e.id,()=>t({type:"set",object:e})]}function V(e,t){const n=new CustomEvent(e,{bubbles:!0,detail:t});document.dispatchEvent(n)}function ie(e,t){b.useEffect(()=>{const n=a=>{t(a.detail)};return document.addEventListener(e,n,!1),()=>{document.removeEventListener(e,n,!1)}},[e,t])}const Gi=$.memo(({sectors:e,states:t})=>{const n=b.useRef(null),[a,s]=_e(),[i,r]=b.useState(0);return ie("cityDamage",()=>{r(i+1)}),b.useEffect(()=>{const o=n.current,u=o==null?void 0:o.getContext("2d");if(!o||!u)return;const c=Math.min(...e.map(E=>E.rect.left)),l=Math.min(...e.map(E=>E.rect.top)),d=Math.max(...e.map(E=>E.rect.right)),f=Math.max(...e.map(E=>E.rect.bottom)),h=d-c,p=f-l;o.width=h,o.height=p,o.style.width=`${h}px`,o.style.height=`${p}px`;const y=Math.max(...e.filter(E=>E.type===M.WATER).map(E=>E.depth||0)),v=Math.max(...e.filter(E=>E.type===M.GROUND).map(E=>E.height||0)),x=new Map(t.map(E=>[E.id,E.color]));u.clearRect(0,0,h,p),e.forEach(E=>{const{fillStyle:F,drawSector:R}=Vi(E,y,v,x);u.fillStyle=F,R(u,E.rect,c,l)})},[i]),b.useEffect(()=>{const o=n.current;let u;const c=l=>{const d=o==null?void 0:o.getBoundingClientRect(),f=l.clientX-((d==null?void 0:d.left)||0),h=l.clientY-((d==null?void 0:d.top)||0),p=e.find(y=>f>=y.rect.left&&f<=y.rect.right&&h>=y.rect.top&&h<=y.rect.bottom);p&&(u&&s(u),a(p),u=p)};return o==null||o.addEventListener("mousemove",c),()=>{o==null||o.removeEventListener("mousemove",c)}},[e,a,s]),m.jsx("canvas",{ref:n,style:{opacity:.5}})});function Vi(e,t,n,a){const s=Wi(e,t,n),i=e.stateId?a.get(e.stateId):void 0;return{fillStyle:s,drawSector:(r,o,u,c)=>{r.fillStyle=s,r.fillRect(o.left-u,o.top-c,o.right-o.left,o.bottom-o.top),i&&(r.fillStyle=`${i}80`,r.fillRect(o.left-u,o.top-c,o.right-o.left,o.bottom-o.top)),e.cityId&&e.population>0&&qi(r,o,u,c)}}}function Wi(e,t,n){switch(e.type){case M.GROUND:return e.cityId?Xi(e):Ki(e.height||0,n);case M.WATER:return Zi(e.depth||0,t);default:return"rgb(0, 34, 93)"}}function Xi(e){if(e.population===0)return"rgba(0,0,0,0.7)";const t=e.population?Math.min(e.population/yt,1):0,n=e.height?e.height/100:0,s=[200,200,200].map(i=>i-50*t+20*n);return`rgb(${s[0]}, ${s[1]}, ${s[2]})`}function qi(e,t,n,a){e.fillStyle="rgba(0, 0, 0, 0.2)",e.fillRect(t.left-n+2,t.top-a+2,t.right-t.left-4,t.bottom-t.top-4),e.fillStyle="rgba(255, 255, 255, 0.6)",e.fillRect(t.left-n+4,t.top-a+4,t.right-t.left-8,t.bottom-t.top-8)}function Ki(e,t){const n=e/t;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const a=Math.round(34+67*((n-.5)/.3)),s=Math.round(100+-33*((n-.5)/.3)),i=Math.round(34+-1*((n-.5)/.3));return`rgb(${a}, ${s}, ${i})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}function Zi(e,t){const n=e/t,a=Math.round(0+34*(1-n)),s=Math.round(137+-103*n),i=Math.round(178+-85*n);return`rgb(${a}, ${s}, ${i})`}function Ji({state:e,sectors:t}){const n=$.useMemo(()=>{const a=t.filter(s=>s.stateId===e.id);return er(a)},[]);return m.jsx(m.Fragment,{children:m.jsx(Qi,{style:{transform:`translate(${n.x}px, ${n.y}px) translate(-50%, -50%)`,color:e.color},children:e.name})})}const Qi=C.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;function er(e){if(e.length===0)return{x:0,y:0};const t=e.reduce((n,a)=>({x:n.x+(a.rect.left+a.rect.right)/2,y:n.y+(a.rect.top+a.rect.bottom)/2}),{x:0,y:0});return{x:t.x/e.length,y:t.y/e.length}}function tr({city:e}){const[t,n]=_e(),a=e.population;if(!a)return null;const s=te(a);return m.jsxs(nr,{onMouseEnter:()=>t(e),onMouseLeave:()=>n(e),style:{"--x":e.position.x,"--y":e.position.y},children:[m.jsx("span",{children:e.name}),m.jsxs(ar,{children:[s," population"]})]})}const nr=C.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`,ar=C.div`
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
`;function sr({launchSite:e,worldTimestamp:t,isPlayerControlled:n}){const[a,s]=Hi(e),[i,r]=_e(),o=e.lastLaunchTimestamp&&e.lastLaunchTimestamp+fe>t,u=o?(t-e.lastLaunchTimestamp)/fe:0,c=e.modeChangeTimestamp&&t<e.modeChangeTimestamp+me,l=c?(t-e.modeChangeTimestamp)/me:0;return m.jsx(ir,{onMouseEnter:()=>i(e),onMouseLeave:()=>r(e),onClick:()=>n&&s(),style:{"--x":e.position.x,"--y":e.position.y,"--cooldown-progress":u,"--mode-change-progress":l},"data-selected":a,"data-cooldown":o,"data-mode":e.mode,"data-changing-mode":c,children:m.jsx(rr,{children:e.mode===k.ATTACK?"A":"D"})})}const ir=C.div`
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
`,rr=C.span`
  z-index: 1;
`;function cn(e,t){t===void 0&&(t=!0);var n=b.useRef(null),a=b.useRef(!1),s=b.useRef(e);s.current=e;var i=b.useCallback(function(o){a.current&&(s.current(o),n.current=requestAnimationFrame(i))},[]),r=b.useMemo(function(){return[function(){a.current&&(a.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){a.current||(a.current=!0,n.current=requestAnimationFrame(i))},function(){return a.current}]},[]);return b.useEffect(function(){return t&&r[1](),r[0]},[]),r}function or(e,t,n){if(t.startTimestamp>n||t.endTimestamp<n)return;const a=Math.pow(Math.min(Math.max(0,(n-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);e.fillStyle=`rgb(${255*a}, ${255*(1-a)}, 0)`,e.beginPath(),e.arc(t.position.x,t.position.y,t.radius*a,0,2*Math.PI),e.fill()}function lr(e,t,n){t.launchTimestamp>n||t.targetTimestamp<n||(e.fillStyle="rgb(255, 0, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,2,0,2*Math.PI),e.fill())}function ur(e,t){e.fillStyle="rgb(0, 255, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,1,0,2*Math.PI),e.fill()}function tt(e,t,n){if(!(t.launchTimestamp>n))if("targetTimestamp"in t){if(t.targetTimestamp<n)return;cr(e,t,n)}else dr(e,t,n)}function cr(e,t,n){const a=Math.min(Math.max(n-5,t.launchTimestamp)-t.launchTimestamp,t.targetTimestamp-t.launchTimestamp),s=t.targetTimestamp-t.launchTimestamp,i=s>0?a/s:0,r=t.launch.x+(t.position.x-t.launch.x)*i,o=t.launch.y+(t.position.y-t.launch.y)*i,u={x:r,y:o},c=e.createLinearGradient(u.x,u.y,t.position.x,t.position.y);c.addColorStop(0,"rgba(255, 255, 255, 0)"),c.addColorStop(1,"rgba(255, 255, 255, 0.5)"),e.strokeStyle=c,e.lineWidth=1,e.beginPath(),e.moveTo(u.x,u.y),e.lineTo(t.position.x,t.position.y),e.stroke()}function dr(e,t,n){const s=Math.max(n-5,t.launchTimestamp),i=t.tail.filter(o=>o.timestamp>=s);if(i.length<2)return;e.beginPath(),e.moveTo(i[0].position.x,i[0].position.y);for(let o=1;o<i.length;o++)e.lineTo(i[o].position.x,i[o].position.y);e.lineTo(t.position.x,t.position.y);const r=e.createLinearGradient(i[0].position.x,i[0].position.y,t.position.x,t.position.y);r.addColorStop(0,"rgba(0, 255, 0, 0)"),r.addColorStop(1,"rgba(0, 255, 0, 0.5)"),e.strokeStyle=r,e.lineWidth=1,e.stroke()}function mr(e,t){if(Math.sqrt(Math.pow(t.position.x-t.launch.x,2)+Math.pow(t.position.y-t.launch.y,2))>Ie)for(let r=0;r<5;r++){const o=Math.PI*2/5*r,u=t.position.x+Math.cos(o)*3,c=t.position.y+Math.sin(o)*3;e.fillStyle="rgba(0, 255, 0, 0.5)",e.beginPath(),e.arc(u,c,1,0,2*Math.PI),e.fill()}}function fr({state:e}){const t=b.useRef(null);return b.useLayoutEffect(()=>{const a=t.current;if(!a)return;const s=Math.min(...e.sectors.map(l=>l.rect.left)),i=Math.min(...e.sectors.map(l=>l.rect.top)),r=Math.max(...e.sectors.map(l=>l.rect.right)),o=Math.max(...e.sectors.map(l=>l.rect.bottom)),u=r-s,c=o-i;a.width=u,a.height=c,a.style.width=`${u}px`,a.style.height=`${c}px`},[e.sectors]),cn(()=>{const a=t.current;if(!a)return;const s=a.getContext("2d");s&&(s.clearRect(0,0,a.width,a.height),e.missiles.forEach(i=>{tt(s,i,e.timestamp)}),e.interceptors.forEach(i=>{tt(s,i,e.timestamp)}),e.missiles.filter(i=>i.launchTimestamp<e.timestamp&&i.targetTimestamp>e.timestamp).forEach(i=>{lr(s,i,e.timestamp)}),e.interceptors.filter(i=>i.launchTimestamp<e.timestamp).forEach(i=>{ur(s,i),Q*(e.timestamp-i.launchTimestamp+1)>Ie&&mr(s,i)}),e.explosions.filter(i=>i.startTimestamp<e.timestamp&&i.endTimestamp>e.timestamp).forEach(i=>{or(s,i,e.timestamp)}))}),m.jsx(hr,{ref:t})}const hr=C.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`,S=10,pr=({worldStateRef:e})=>{const t=b.useRef(null);b.useEffect(()=>{const a=t.current;if(!a)return;const s=a.getContext("2d");if(!s)return;let i;const r=e.current;if(!r)return;const o=r.sectors,u=Math.min(...o.map(y=>y.rect.left)),c=Math.min(...o.map(y=>y.rect.top)),l=Math.max(...o.map(y=>y.rect.right)),d=Math.max(...o.map(y=>y.rect.bottom)),f=l-u,h=d-c;(a.width!==f||a.height!==h)&&(a.width=f,a.height=h,a.style.width=`${f}px`,a.style.height=`${h}px`);const p=()=>{const y=e.current;y&&(s.clearRect(0,0,a.width,a.height),s.save(),n(s,y),s.restore(),i=requestAnimationFrame(p))};return p(),()=>{cancelAnimationFrame(i)}},[e]);const n=(a,s)=>{const i={};s.units.forEach(r=>{const o=r.stateId;i[o]||(i[o]=[]),i[o].push(r)}),Object.entries(i).forEach(([r,o])=>{const u=s.states.find(l=>l.id===r),c=u?u.color:"#000000";a.fillStyle=c,a.strokeStyle="#000000",a.lineWidth=1,o.forEach(l=>{a.fillRect(l.position.x-S/2,l.position.y-S/2,S,S),a.strokeRect(l.position.x-S/2,l.position.y-S/2,S,S),a.beginPath(),a.moveTo(l.position.x-S/2,l.position.y-S/2),a.lineTo(l.position.x+S/2,l.position.y+S/2),a.moveTo(l.position.x+S/2,l.position.y-S/2),a.lineTo(l.position.x-S/2,l.position.y+S/2),a.stroke()})})};return m.jsx("canvas",{ref:t,style:{position:"absolute",top:0,left:0}})};function gr({state:e}){const t=Ui(),n=b.useRef(e);return $.useEffect(()=>{n.current=e},[e]),m.jsxs(vr,{onMouseMove:a=>t(a.clientX,a.clientY),onClick:()=>V("world-click"),children:[m.jsx(Gi,{sectors:e.sectors,states:e.states}),e.states.map(a=>m.jsx(Ji,{state:a,cities:e.cities,launchSites:e.launchSites,sectors:e.sectors},a.id)),e.cities.map(a=>m.jsx(tr,{city:a},a.id)),e.launchSites.map(a=>{var s;return m.jsx(sr,{launchSite:a,worldTimestamp:e.timestamp,isPlayerControlled:a.stateId===((s=e.states.find(i=>i.isPlayerControlled))==null?void 0:s.id)},a.id)}),m.jsx(fr,{state:e}),m.jsx(pr,{worldStateRef:n})]})}const vr=C.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function yr(e,t,n){return Math.max(t,Math.min(e,n))}const A={toVector(e,t){return e===void 0&&(e=t),Array.isArray(e)?e:[e,e]},add(e,t){return[e[0]+t[0],e[1]+t[1]]},sub(e,t){return[e[0]-t[0],e[1]-t[1]]},addTo(e,t){e[0]+=t[0],e[1]+=t[1]},subTo(e,t){e[0]-=t[0],e[1]-=t[1]}};function nt(e,t,n){return t===0||Math.abs(t)===1/0?Math.pow(e,n*5):e*t*n/(t+n*e)}function at(e,t,n,a=.15){return a===0?yr(e,t,n):e<t?-nt(t-e,n-t,a)+t:e>n?+nt(e-n,n-t,a)+n:e}function Er(e,[t,n],[a,s]){const[[i,r],[o,u]]=e;return[at(t,i,r,a),at(n,o,u,s)]}function br(e,t){if(typeof e!="object"||e===null)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var a=n.call(e,t||"default");if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}function xr(e){var t=br(e,"string");return typeof t=="symbol"?t:String(t)}function T(e,t,n){return t=xr(t),t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function st(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);t&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(e,s).enumerable})),n.push.apply(n,a)}return n}function D(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]!=null?arguments[t]:{};t%2?st(Object(n),!0).forEach(function(a){T(e,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):st(Object(n)).forEach(function(a){Object.defineProperty(e,a,Object.getOwnPropertyDescriptor(n,a))})}return e}const dn={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function it(e){return e?e[0].toUpperCase()+e.slice(1):""}const Cr=["enter","leave"];function Fr(e=!1,t){return e&&!Cr.includes(t)}function Ar(e,t="",n=!1){const a=dn[e],s=a&&a[t]||t;return"on"+it(e)+it(s)+(Fr(n,s)?"Capture":"")}const Dr=["gotpointercapture","lostpointercapture"];function Ir(e){let t=e.substring(2).toLowerCase();const n=!!~t.indexOf("passive");n&&(t=t.replace("passive",""));const a=Dr.includes(t)?"capturecapture":"capture",s=!!~t.indexOf(a);return s&&(t=t.replace("capture","")),{device:t,capture:s,passive:n}}function Tr(e,t=""){const n=dn[e],a=n&&n[t]||t;return e+a}function re(e){return"touches"in e}function mn(e){return re(e)?"touch":"pointerType"in e?e.pointerType:"mouse"}function Sr(e){return Array.from(e.touches).filter(t=>{var n,a;return t.target===e.currentTarget||((n=e.currentTarget)===null||n===void 0||(a=n.contains)===null||a===void 0?void 0:a.call(n,t.target))})}function kr(e){return e.type==="touchend"||e.type==="touchcancel"?e.changedTouches:e.targetTouches}function fn(e){return re(e)?kr(e)[0]:e}function Ce(e,t){try{const n=t.clientX-e.clientX,a=t.clientY-e.clientY,s=(t.clientX+e.clientX)/2,i=(t.clientY+e.clientY)/2,r=Math.hypot(n,a);return{angle:-(Math.atan2(n,a)*180)/Math.PI,distance:r,origin:[s,i]}}catch{}return null}function Mr(e){return Sr(e).map(t=>t.identifier)}function rt(e,t){const[n,a]=Array.from(e.touches).filter(s=>t.includes(s.identifier));return Ce(n,a)}function de(e){const t=fn(e);return re(e)?t.identifier:t.pointerId}function H(e){const t=fn(e);return[t.clientX,t.clientY]}const ot=40,lt=800;function hn(e){let{deltaX:t,deltaY:n,deltaMode:a}=e;return a===1?(t*=ot,n*=ot):a===2&&(t*=lt,n*=lt),[t,n]}function _r(e){var t,n;const{scrollX:a,scrollY:s,scrollLeft:i,scrollTop:r}=e.currentTarget;return[(t=a??i)!==null&&t!==void 0?t:0,(n=s??r)!==null&&n!==void 0?n:0]}function Br(e){const t={};if("buttons"in e&&(t.buttons=e.buttons),"shiftKey"in e){const{shiftKey:n,altKey:a,metaKey:s,ctrlKey:i}=e;Object.assign(t,{shiftKey:n,altKey:a,metaKey:s,ctrlKey:i})}return t}function ne(e,...t){return typeof e=="function"?e(...t):e}function wr(){}function jr(...e){return e.length===0?wr:e.length===1?e[0]:function(){let t;for(const n of e)t=n.apply(this,arguments)||t;return t}}function ut(e,t){return Object.assign({},t,e||{})}const Lr=32;class pn{constructor(t,n,a){this.ctrl=t,this.args=n,this.key=a,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(t){this.ctrl.state[this.key]=t}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:t,shared:n,ingKey:a,args:s}=this;n[a]=t._active=t.active=t._blocked=t._force=!1,t._step=[!1,!1],t.intentional=!1,t._movement=[0,0],t._distance=[0,0],t._direction=[0,0],t._delta=[0,0],t._bounds=[[-1/0,1/0],[-1/0,1/0]],t.args=s,t.axis=void 0,t.memo=void 0,t.elapsedTime=t.timeDelta=0,t.direction=[0,0],t.distance=[0,0],t.overflow=[0,0],t._movementBound=[!1,!1],t.velocity=[0,0],t.movement=[0,0],t.delta=[0,0],t.timeStamp=0}start(t){const n=this.state,a=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=t.target,n.currentTarget=t.currentTarget,n.lastOffset=a.from?ne(a.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=t.timeStamp)}computeValues(t){const n=this.state;n._values=t,n.values=this.config.transform(t)}computeInitial(){const t=this.state;t._initial=t._values,t.initial=t.values}compute(t){const{state:n,config:a,shared:s}=this;n.args=this.args;let i=0;if(t&&(n.event=t,a.preventDefault&&t.cancelable&&n.event.preventDefault(),n.type=t.type,s.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,s.locked=!!document.pointerLockElement,Object.assign(s,Br(t)),s.down=s.pressed=s.buttons%2===1||s.touches>0,i=t.timeStamp-n.timeStamp,n.timeStamp=t.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const P=n._delta.map(Math.abs);A.addTo(n._distance,P)}this.axisIntent&&this.axisIntent(t);const[r,o]=n._movement,[u,c]=a.threshold,{_step:l,values:d}=n;if(a.hasCustomTransform?(l[0]===!1&&(l[0]=Math.abs(r)>=u&&d[0]),l[1]===!1&&(l[1]=Math.abs(o)>=c&&d[1])):(l[0]===!1&&(l[0]=Math.abs(r)>=u&&Math.sign(r)*u),l[1]===!1&&(l[1]=Math.abs(o)>=c&&Math.sign(o)*c)),n.intentional=l[0]!==!1||l[1]!==!1,!n.intentional)return;const f=[0,0];if(a.hasCustomTransform){const[P,In]=d;f[0]=l[0]!==!1?P-l[0]:0,f[1]=l[1]!==!1?In-l[1]:0}else f[0]=l[0]!==!1?r-l[0]:0,f[1]=l[1]!==!1?o-l[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(f);const h=n.offset,p=n._active&&!n._blocked||n.active;p&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=s[this.ingKey]=n._active,t&&(n.first&&("bounds"in a&&(n._bounds=ne(a.bounds,n)),this.setup&&this.setup()),n.movement=f,this.computeOffset()));const[y,v]=n.offset,[[x,E],[F,R]]=n._bounds;n.overflow=[y<x?-1:y>E?1:0,v<F?-1:v>R?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const Dn=n._active?a.rubberband||[0,0]:[0,0];if(n.offset=Er(n._bounds,n.offset,Dn),n.delta=A.sub(n.offset,h),this.computeMovement(),p&&(!n.last||i>Lr)){n.delta=A.sub(n.offset,h);const P=n.delta.map(Math.abs);A.addTo(n.distance,P),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&i>0&&(n.velocity=[P[0]/i,P[1]/i],n.timeDelta=i)}}emit(){const t=this.state,n=this.shared,a=this.config;if(t._active||this.clean(),(t._blocked||!t.intentional)&&!t._force&&!a.triggerAllEvents)return;const s=this.handler(D(D(D({},n),t),{},{[this.aliasKey]:t.values}));s!==void 0&&(t.memo=s)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function Or([e,t],n){const a=Math.abs(e),s=Math.abs(t);if(a>s&&a>n)return"x";if(s>a&&s>n)return"y"}class W extends pn{constructor(...t){super(...t),T(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=A.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=A.sub(this.state.offset,this.state.lastOffset)}axisIntent(t){const n=this.state,a=this.config;if(!n.axis&&t){const s=typeof a.axisThreshold=="object"?a.axisThreshold[mn(t)]:a.axisThreshold;n.axis=Or(n._movement,s)}n._blocked=(a.lockDirection||!!a.axis)&&!n.axis||!!a.axis&&a.axis!==n.axis}restrictToAxis(t){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":t[1]=0;break;case"y":t[0]=0;break}}}const Rr=e=>e,ct=.15,gn={enabled(e=!0){return e},eventOptions(e,t,n){return D(D({},n.shared.eventOptions),e)},preventDefault(e=!1){return e},triggerAllEvents(e=!1){return e},rubberband(e=0){switch(e){case!0:return[ct,ct];case!1:return[0,0];default:return A.toVector(e)}},from(e){if(typeof e=="function")return e;if(e!=null)return A.toVector(e)},transform(e,t,n){const a=e||n.shared.transform;return this.hasCustomTransform=!!a,a||Rr},threshold(e){return A.toVector(e,0)}},Pr=0,N=D(D({},gn),{},{axis(e,t,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(e=Pr){return e},bounds(e={}){if(typeof e=="function")return i=>N.bounds(e(i));if("current"in e)return()=>e.current;if(typeof HTMLElement=="function"&&e instanceof HTMLElement)return e;const{left:t=-1/0,right:n=1/0,top:a=-1/0,bottom:s=1/0}=e;return[[t,n],[a,s]]}}),dt={ArrowRight:(e,t=1)=>[e*t,0],ArrowLeft:(e,t=1)=>[-1*e*t,0],ArrowUp:(e,t=1)=>[0,-1*e*t],ArrowDown:(e,t=1)=>[0,e*t]};class $r extends W{constructor(...t){super(...t),T(this,"ingKey","dragging")}reset(){super.reset();const t=this.state;t._pointerId=void 0,t._pointerActive=!1,t._keyboardActive=!1,t._preventScroll=!1,t._delayed=!1,t.swipe=[0,0],t.tap=!1,t.canceled=!1,t.cancel=this.cancel.bind(this)}setup(){const t=this.state;if(t._bounds instanceof HTMLElement){const n=t._bounds.getBoundingClientRect(),a=t.currentTarget.getBoundingClientRect(),s={left:n.left-a.left+t.offset[0],right:n.right-a.right+t.offset[0],top:n.top-a.top+t.offset[1],bottom:n.bottom-a.bottom+t.offset[1]};t._bounds=N.bounds(s)}}cancel(){const t=this.state;t.canceled||(t.canceled=!0,t._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(t){const n=this.config,a=this.state;if(t.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(t.buttons):n.pointerButtons!==-1&&n.pointerButtons!==t.buttons))return;const s=this.ctrl.setEventIds(t);n.pointerCapture&&t.target.setPointerCapture(t.pointerId),!(s&&s.size>1&&a._pointerActive)&&(this.start(t),this.setupPointer(t),a._pointerId=de(t),a._pointerActive=!0,this.computeValues(H(t)),this.computeInitial(),n.preventScrollAxis&&mn(t)!=="mouse"?(a._active=!1,this.setupScrollPrevention(t)):n.delay>0?(this.setupDelayTrigger(t),n.triggerAllEvents&&(this.compute(t),this.emit())):this.startPointerDrag(t))}startPointerDrag(t){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(t),this.emit()}pointerMove(t){const n=this.state,a=this.config;if(!n._pointerActive)return;const s=de(t);if(n._pointerId!==void 0&&s!==n._pointerId)return;const i=H(t);if(document.pointerLockElement===t.target?n._delta=[t.movementX,t.movementY]:(n._delta=A.sub(i,n._values),this.computeValues(i)),A.addTo(n._movement,n._delta),this.compute(t),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(t);return}if(a.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===a.preventScrollAxis||a.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(t);return}else return;this.emit()}pointerUp(t){this.ctrl.setEventIds(t);try{this.config.pointerCapture&&t.target.hasPointerCapture(t.pointerId)&&t.target.releasePointerCapture(t.pointerId)}catch{}const n=this.state,a=this.config;if(!n._active||!n._pointerActive)return;const s=de(t);if(n._pointerId!==void 0&&s!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(t);const[i,r]=n._distance;if(n.tap=i<=a.tapsThreshold&&r<=a.tapsThreshold,n.tap&&a.filterTaps)n._force=!0;else{const[o,u]=n._delta,[c,l]=n._movement,[d,f]=a.swipe.velocity,[h,p]=a.swipe.distance,y=a.swipe.duration;if(n.elapsedTime<y){const v=Math.abs(o/n.timeDelta),x=Math.abs(u/n.timeDelta);v>d&&Math.abs(c)>h&&(n.swipe[0]=Math.sign(o)),x>f&&Math.abs(l)>p&&(n.swipe[1]=Math.sign(u))}}this.emit()}pointerClick(t){!this.state.tap&&t.detail>0&&(t.preventDefault(),t.stopPropagation())}setupPointer(t){const n=this.config,a=n.device;n.pointerLock&&t.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,a,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(t){this.state._preventScroll&&t.cancelable&&t.preventDefault()}setupScrollPrevention(t){this.state._preventScroll=!1,Nr(t);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,t)}setupDelayTrigger(t){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(t)},this.config.delay)}keyDown(t){const n=dt[t.key];if(n){const a=this.state,s=t.shiftKey?10:t.altKey?.1:1;this.start(t),a._delta=n(this.config.keyboardDisplacement,s),a._keyboardActive=!0,A.addTo(a._movement,a._delta),this.compute(t),this.emit()}}keyUp(t){t.key in dt&&(this.state._keyboardActive=!1,this.setActive(),this.compute(t),this.emit())}bind(t){const n=this.config.device;t(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(t(n,"change",this.pointerMove.bind(this)),t(n,"end",this.pointerUp.bind(this)),t(n,"cancel",this.pointerUp.bind(this)),t("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(t("key","down",this.keyDown.bind(this)),t("key","up",this.keyUp.bind(this))),this.config.filterTaps&&t("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function Nr(e){"persist"in e&&typeof e.persist=="function"&&e.persist()}const X=typeof window<"u"&&window.document&&window.document.createElement;function vn(){return X&&"ontouchstart"in window}function Ur(){return vn()||X&&window.navigator.maxTouchPoints>1}function Yr(){return X&&"onpointerdown"in window}function zr(){return X&&"exitPointerLock"in window.document}function Hr(){try{return"constructor"in GestureEvent}catch{return!1}}const B={isBrowser:X,gesture:Hr(),touch:vn(),touchscreen:Ur(),pointer:Yr(),pointerLock:zr()},Gr=250,Vr=180,Wr=.5,Xr=50,qr=250,Kr=10,mt={mouse:0,touch:0,pen:8},Zr=D(D({},N),{},{device(e,t,{pointer:{touch:n=!1,lock:a=!1,mouse:s=!1}={}}){return this.pointerLock=a&&B.pointerLock,B.touch&&n?"touch":this.pointerLock?"mouse":B.pointer&&!s?"pointer":B.touch?"touch":"mouse"},preventScrollAxis(e,t,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&e?Gr:void 0,!(!B.touchscreen||n===!1))return e||(n!==void 0?"y":void 0)},pointerCapture(e,t,{pointer:{capture:n=!0,buttons:a=1,keys:s=!0}={}}){return this.pointerButtons=a,this.keys=s,!this.pointerLock&&this.device==="pointer"&&n},threshold(e,t,{filterTaps:n=!1,tapsThreshold:a=3,axis:s=void 0}){const i=A.toVector(e,n?a:s?1:0);return this.filterTaps=n,this.tapsThreshold=a,i},swipe({velocity:e=Wr,distance:t=Xr,duration:n=qr}={}){return{velocity:this.transform(A.toVector(e)),distance:this.transform(A.toVector(t)),duration:n}},delay(e=0){switch(e){case!0:return Vr;case!1:return 0;default:return e}},axisThreshold(e){return e?D(D({},mt),e):mt},keyboardDisplacement(e=Kr){return e}});function yn(e){const[t,n]=e.overflow,[a,s]=e._delta,[i,r]=e._direction;(t<0&&a>0&&i<0||t>0&&a<0&&i>0)&&(e._movement[0]=e._movementBound[0]),(n<0&&s>0&&r<0||n>0&&s<0&&r>0)&&(e._movement[1]=e._movementBound[1])}const Jr=30,Qr=100;class eo extends pn{constructor(...t){super(...t),T(this,"ingKey","pinching"),T(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const t=this.state;t._touchIds=[],t.canceled=!1,t.cancel=this.cancel.bind(this),t.turns=0}computeOffset(){const{type:t,movement:n,lastOffset:a}=this.state;t==="wheel"?this.state.offset=A.add(n,a):this.state.offset=[(1+n[0])*a[0],n[1]+a[1]]}computeMovement(){const{offset:t,lastOffset:n}=this.state;this.state.movement=[t[0]/n[0],t[1]-n[1]]}axisIntent(){const t=this.state,[n,a]=t._movement;if(!t.axis){const s=Math.abs(n)*Jr-Math.abs(a);s<0?t.axis="angle":s>0&&(t.axis="scale")}}restrictToAxis(t){this.config.lockDirection&&(this.state.axis==="scale"?t[1]=0:this.state.axis==="angle"&&(t[0]=0))}cancel(){const t=this.state;t.canceled||setTimeout(()=>{t.canceled=!0,t._active=!1,this.compute(),this.emit()},0)}touchStart(t){this.ctrl.setEventIds(t);const n=this.state,a=this.ctrl.touchIds;if(n._active&&n._touchIds.every(i=>a.has(i))||a.size<2)return;this.start(t),n._touchIds=Array.from(a).slice(0,2);const s=rt(t,n._touchIds);s&&this.pinchStart(t,s)}pointerStart(t){if(t.buttons!=null&&t.buttons%2!==1)return;this.ctrl.setEventIds(t),t.target.setPointerCapture(t.pointerId);const n=this.state,a=n._pointerEvents,s=this.ctrl.pointerIds;if(n._active&&Array.from(a.keys()).every(r=>s.has(r))||(a.size<2&&a.set(t.pointerId,t),n._pointerEvents.size<2))return;this.start(t);const i=Ce(...Array.from(a.values()));i&&this.pinchStart(t,i)}pinchStart(t,n){const a=this.state;a.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(t),this.emit()}touchMove(t){if(!this.state._active)return;const n=rt(t,this.state._touchIds);n&&this.pinchMove(t,n)}pointerMove(t){const n=this.state._pointerEvents;if(n.has(t.pointerId)&&n.set(t.pointerId,t),!this.state._active)return;const a=Ce(...Array.from(n.values()));a&&this.pinchMove(t,a)}pinchMove(t,n){const a=this.state,s=a._values[1],i=n.angle-s;let r=0;Math.abs(i)>270&&(r+=Math.sign(i)),this.computeValues([n.distance,n.angle-360*r]),a.origin=n.origin,a.turns=r,a._movement=[a._values[0]/a._initial[0]-1,a._values[1]-a._initial[1]],this.compute(t),this.emit()}touchEnd(t){this.ctrl.setEventIds(t),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(t),this.emit())}pointerEnd(t){const n=this.state;this.ctrl.setEventIds(t);try{t.target.releasePointerCapture(t.pointerId)}catch{}n._pointerEvents.has(t.pointerId)&&n._pointerEvents.delete(t.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(t),this.emit())}gestureStart(t){t.cancelable&&t.preventDefault();const n=this.state;n._active||(this.start(t),this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY],this.compute(t),this.emit())}gestureMove(t){if(t.cancelable&&t.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY];const a=n._movement;n._movement=[t.scale-1,t.rotation],n._delta=A.sub(n._movement,a),this.compute(t),this.emit()}gestureEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}wheel(t){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(a=>t[a]):!t[n])||(this.state._active?this.wheelChange(t):this.wheelStart(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(t){this.start(t),this.wheelChange(t)}wheelChange(t){"uv"in t||t.cancelable&&t.preventDefault();const a=this.state;a._delta=[-hn(t)[1]/Qr*a.offset[0],0],A.addTo(a._movement,a._delta),yn(a),this.state.origin=[t.clientX,t.clientY],this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){const n=this.config.device;n&&(t(n,"start",this[n+"Start"].bind(this)),t(n,"change",this[n+"Move"].bind(this)),t(n,"end",this[n+"End"].bind(this)),t(n,"cancel",this[n+"End"].bind(this)),t("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&t("wheel","",this.wheel.bind(this),{passive:!1})}}const to=D(D({},gn),{},{device(e,t,{shared:n,pointer:{touch:a=!1}={}}){if(n.target&&!B.touch&&B.gesture)return"gesture";if(B.touch&&a)return"touch";if(B.touchscreen){if(B.pointer)return"pointer";if(B.touch)return"touch"}},bounds(e,t,{scaleBounds:n={},angleBounds:a={}}){const s=r=>{const o=ut(ne(n,r),{min:-1/0,max:1/0});return[o.min,o.max]},i=r=>{const o=ut(ne(a,r),{min:-1/0,max:1/0});return[o.min,o.max]};return typeof n!="function"&&typeof a!="function"?[s(),i()]:r=>[s(r),i(r)]},threshold(e,t,n){return this.lockDirection=n.axis==="lock",A.toVector(e,this.lockDirection?[.1,3]:0)},modifierKey(e){return e===void 0?"ctrlKey":e},pinchOnWheel(e=!0){return e}});class no extends W{constructor(...t){super(...t),T(this,"ingKey","moving")}move(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.state._active?this.moveChange(t):this.moveStart(t),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(t){this.start(t),this.computeValues(H(t)),this.compute(t),this.computeInitial(),this.emit()}moveChange(t){if(!this.state._active)return;const n=H(t),a=this.state;a._delta=A.sub(n,a._values),A.addTo(a._movement,a._delta),this.computeValues(n),this.compute(t),this.emit()}moveEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}bind(t){t("pointer","change",this.move.bind(this)),t("pointer","leave",this.moveEnd.bind(this))}}const ao=D(D({},N),{},{mouseOnly:(e=!0)=>e});class so extends W{constructor(...t){super(...t),T(this,"ingKey","scrolling")}scroll(t){this.state._active||this.start(t),this.scrollChange(t),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(t){t.cancelable&&t.preventDefault();const n=this.state,a=_r(t);n._delta=A.sub(a,n._values),A.addTo(n._movement,n._delta),this.computeValues(a),this.compute(t),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("scroll","",this.scroll.bind(this))}}const io=N;class ro extends W{constructor(...t){super(...t),T(this,"ingKey","wheeling")}wheel(t){this.state._active||this.start(t),this.wheelChange(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(t){const n=this.state;n._delta=hn(t),A.addTo(n._movement,n._delta),yn(n),this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("wheel","",this.wheel.bind(this))}}const oo=N;class lo extends W{constructor(...t){super(...t),T(this,"ingKey","hovering")}enter(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.start(t),this.computeValues(H(t)),this.compute(t),this.emit())}leave(t){if(this.config.mouseOnly&&t.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const a=H(t);n._movement=n._delta=A.sub(a,n._values),this.computeValues(a),this.compute(t),n.delta=n.movement,this.emit()}bind(t){t("pointer","enter",this.enter.bind(this)),t("pointer","leave",this.leave.bind(this))}}const uo=D(D({},N),{},{mouseOnly:(e=!0)=>e}),we=new Map,Fe=new Map;function co(e){we.set(e.key,e.engine),Fe.set(e.key,e.resolver)}const mo={key:"drag",engine:$r,resolver:Zr},fo={key:"hover",engine:lo,resolver:uo},ho={key:"move",engine:no,resolver:ao},po={key:"pinch",engine:eo,resolver:to},go={key:"scroll",engine:so,resolver:io},vo={key:"wheel",engine:ro,resolver:oo};function yo(e,t){if(e==null)return{};var n={},a=Object.keys(e),s,i;for(i=0;i<a.length;i++)s=a[i],!(t.indexOf(s)>=0)&&(n[s]=e[s]);return n}function Eo(e,t){if(e==null)return{};var n=yo(e,t),a,s;if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(s=0;s<i.length;s++)a=i[s],!(t.indexOf(a)>=0)&&Object.prototype.propertyIsEnumerable.call(e,a)&&(n[a]=e[a])}return n}const bo={target(e){if(e)return()=>"current"in e?e.current:e},enabled(e=!0){return e},window(e=B.isBrowser?window:void 0){return e},eventOptions({passive:e=!0,capture:t=!1}={}){return{passive:e,capture:t}},transform(e){return e}},xo=["target","eventOptions","window","enabled","transform"];function ee(e={},t){const n={};for(const[a,s]of Object.entries(t))switch(typeof s){case"function":n[a]=s.call(n,e[a],a,e);break;case"object":n[a]=ee(e[a],s);break;case"boolean":s&&(n[a]=e[a]);break}return n}function Co(e,t,n={}){const a=e,{target:s,eventOptions:i,window:r,enabled:o,transform:u}=a,c=Eo(a,xo);if(n.shared=ee({target:s,eventOptions:i,window:r,enabled:o,transform:u},bo),t){const l=Fe.get(t);n[t]=ee(D({shared:n.shared},c),l)}else for(const l in c){const d=Fe.get(l);d&&(n[l]=ee(D({shared:n.shared},c[l]),d))}return n}class En{constructor(t,n){T(this,"_listeners",new Set),this._ctrl=t,this._gestureKey=n}add(t,n,a,s,i){const r=this._listeners,o=Tr(n,a),u=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},c=D(D({},u),i);t.addEventListener(o,s,c);const l=()=>{t.removeEventListener(o,s,c),r.delete(l)};return r.add(l),l}clean(){this._listeners.forEach(t=>t()),this._listeners.clear()}}class Fo{constructor(){T(this,"_timeouts",new Map)}add(t,n,a=140,...s){this.remove(t),this._timeouts.set(t,window.setTimeout(n,a,...s))}remove(t){const n=this._timeouts.get(t);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(t=>void window.clearTimeout(t)),this._timeouts.clear()}}class Ao{constructor(t){T(this,"gestures",new Set),T(this,"_targetEventStore",new En(this)),T(this,"gestureEventStores",{}),T(this,"gestureTimeoutStores",{}),T(this,"handlers",{}),T(this,"config",{}),T(this,"pointerIds",new Set),T(this,"touchIds",new Set),T(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),Do(this,t)}setEventIds(t){if(re(t))return this.touchIds=new Set(Mr(t)),this.touchIds;if("pointerId"in t)return t.type==="pointerup"||t.type==="pointercancel"?this.pointerIds.delete(t.pointerId):t.type==="pointerdown"&&this.pointerIds.add(t.pointerId),this.pointerIds}applyHandlers(t,n){this.handlers=t,this.nativeHandlers=n}applyConfig(t,n){this.config=Co(t,n,this.config)}clean(){this._targetEventStore.clean();for(const t of this.gestures)this.gestureEventStores[t].clean(),this.gestureTimeoutStores[t].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...t){const n=this.config.shared,a={};let s;if(!(n.target&&(s=n.target(),!s))){if(n.enabled){for(const r of this.gestures){const o=this.config[r],u=ft(a,o.eventOptions,!!s);if(o.enabled){const c=we.get(r);new c(this,t,r).bind(u)}}const i=ft(a,n.eventOptions,!!s);for(const r in this.nativeHandlers)i(r,"",o=>this.nativeHandlers[r](D(D({},this.state.shared),{},{event:o,args:t})),void 0,!0)}for(const i in a)a[i]=jr(...a[i]);if(!s)return a;for(const i in a){const{device:r,capture:o,passive:u}=Ir(i);this._targetEventStore.add(s,r,"",a[i],{capture:o,passive:u})}}}}function U(e,t){e.gestures.add(t),e.gestureEventStores[t]=new En(e,t),e.gestureTimeoutStores[t]=new Fo}function Do(e,t){t.drag&&U(e,"drag"),t.wheel&&U(e,"wheel"),t.scroll&&U(e,"scroll"),t.move&&U(e,"move"),t.pinch&&U(e,"pinch"),t.hover&&U(e,"hover")}const ft=(e,t,n)=>(a,s,i,r={},o=!1)=>{var u,c;const l=(u=r.capture)!==null&&u!==void 0?u:t.capture,d=(c=r.passive)!==null&&c!==void 0?c:t.passive;let f=o?a:Ar(a,s,l);n&&d&&(f+="Passive"),e[f]=e[f]||[],e[f].push(i)},Io=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function To(e){const t={},n={},a=new Set;for(let s in e)Io.test(s)?(a.add(RegExp.lastMatch),n[s]=e[s]):t[s]=e[s];return[n,t,a]}function Y(e,t,n,a,s,i){if(!e.has(n)||!we.has(a))return;const r=n+"Start",o=n+"End",u=c=>{let l;return c.first&&r in t&&t[r](c),n in t&&(l=t[n](c)),c.last&&o in t&&t[o](c),l};s[a]=u,i[a]=i[a]||{}}function So(e,t){const[n,a,s]=To(e),i={};return Y(s,n,"onDrag","drag",i,t),Y(s,n,"onWheel","wheel",i,t),Y(s,n,"onScroll","scroll",i,t),Y(s,n,"onPinch","pinch",i,t),Y(s,n,"onMove","move",i,t),Y(s,n,"onHover","hover",i,t),{handlers:i,config:t,nativeHandlers:a}}function ko(e,t={},n,a){const s=$.useMemo(()=>new Ao(e),[]);if(s.applyHandlers(e,a),s.applyConfig(t,n),$.useEffect(s.effect.bind(s)),$.useEffect(()=>s.clean.bind(s),[]),t.target===void 0)return s.bind.bind(s)}function Mo(e){return e.forEach(co),function(n,a){const{handlers:s,nativeHandlers:i,config:r}=So(n,a||{});return ko(s,r,void 0,i)}}function _o(e,t){return Mo([mo,po,go,vo,ho,fo])(e,t||{})}function Bo(e){V("translateViewport",e)}function wo(e){ie("translateViewport",e)}function jo({children:e,onGetViewportConfiguration:t}){const n=b.useRef(null),a=$.useMemo(t,[t]),[s,i]=b.useState(a.initialZoom),[r,o]=b.useState(a.initialTranslate),[u,c]=b.useState(!1),l=b.useCallback((d,f)=>{const{minX:h,minY:p,maxX:y,maxY:v}=a,x=window.innerWidth,E=window.innerHeight,F=Math.min(Math.max(f,Math.max(x/(y-h),E/(v-p))),4),R={x:Math.min(Math.max(d.x,-(y-x/F)),-h),y:Math.min(Math.max(d.y,-(v-E/F)),-p)};o(R),i(F)},[a]);return b.useEffect(()=>{l(a.initialTranslate,a.initialZoom)},[]),_o({onPinch({origin:d,delta:f,pinching:h}){var E;c(h);const p=s+f[0],y=(E=n.current)==null?void 0:E.getBoundingClientRect(),v=d[0]-((y==null?void 0:y.left)??0),x=d[1]-((y==null?void 0:y.top)??0);l({x:r.x-(v/s-v/p),y:r.y-(x/s-x/p)},p)},onWheel({event:d,delta:[f,h],wheeling:p}){d.preventDefault(),c(p),l({x:r.x-f/s,y:r.y-h/s},s)}},{target:n,eventOptions:{passive:!1}}),wo(d=>{const f=window.innerWidth,h=window.innerHeight,p=f/2-d.x*s,y=h/2-d.y*s;l({x:p/s,y:y/s},s)}),m.jsx(Lo,{children:m.jsx(Oo,{ref:n,children:m.jsx(Ro,{style:{"--zoom":s,"--translate-x":r.x,"--translate-y":r.y},"data-is-interacting":u,children:e})})})}const Lo=C.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,Oo=C.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,Ro=C.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function Po({worldState:e}){return m.jsx(zi,{children:m.jsx(Ni,{children:m.jsx(jo,{onGetViewportConfiguration:()=>$o(e),children:m.jsx(gr,{state:e})})})})}function $o(e){const t=e.states.find(v=>v.isPlayerControlled),n=window.innerWidth,a=window.innerHeight,s=t?e.sectors.filter(v=>v.stateId===t.id):e.sectors;let i=1/0,r=1/0,o=-1/0,u=-1/0;s.forEach(v=>{i=Math.min(i,v.rect.left),r=Math.min(r,v.rect.top),o=Math.max(o,v.rect.right),u=Math.max(u,v.rect.bottom)});const c=o-i+1,l=u-r+1,d=n/c,f=a/l,h=Math.min(d,f)*1,p=(i+o)/2,y=(r+u)/2;return e.sectors.forEach(v=>{i=Math.min(i,v.rect.left),r=Math.min(r,v.rect.top),o=Math.max(o,v.rect.right),u=Math.max(u,v.rect.bottom)}),{initialTranslate:{x:n/2-p*h,y:a/2-y*h},initialZoom:h,minX:i,minY:r,maxX:o,maxY:u}}const bn="fullScreenMessage",xn="fullScreenMessageAction";function j(e,t,n,a="",s,i,r){V(bn,{message:e,startTimestamp:t,endTimestamp:n,messageId:a,actions:s,prompt:i,fullScreen:r??!!(s!=null&&s.length)})}function Cn(e,t){V(xn,{messageId:e,actionId:t})}function Fn(e){ie(bn,t=>{e(t)})}function je(e){ie(xn,t=>{e(t)})}function No({worldState:e,onGameOver:t}){const[n,a]=b.useState(null),[s,i]=b.useState(!1);return b.useEffect(()=>{var h;if(s)return;const r=rn(e),o=Object.values(r).filter(p=>p>0).length,u=e.launchSites.length===0,c=e.timestamp,l=e.states.filter(p=>r[p.id]>0&&Object.entries(p.strategies).filter(([y,v])=>r[y]>0&&v===g.HOSTILE).length>0),d=e.launchSites.some(p=>p.lastLaunchTimestamp&&c-p.lastLaunchTimestamp<oe),f=oe-c;if(!l.length&&!d&&f>0&&f<=10&&(n?j(`Game will end in ${Math.ceil(f)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):a(c)),o<=1||u||!l.length&&!d&&c>oe){const p=o===1?(h=e.states.find(y=>r[y.id]>0))==null?void 0:h.id:void 0;i(!0),j(["Game Over!","Results will be shown shortly..."],c,c+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{t({populations:r,winner:p,stateNames:Object.fromEntries(e.states.map(y=>[y.id,y.name])),playerStateId:e.states.find(y=>y.isPlayerControlled).id})},5e3)}},[e,t,n,s]),null}const Uo="/assets/player-lost-background-D2A_VJ6-.png",Yo="/assets/player-won-background-CkXgF24i.png",ht="/assets/draw-background-EwLQ9g28.png",zo=C.div`
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
`,Ho=({setGameState:e})=>{const{state:{result:t}}=gt(),n=()=>{e(ae,{stateName:t.stateNames[t.playerStateId]})};let a,s;return t.winner?t.winner===t.playerStateId?(a=Yo,s=`Congratulations! ${t.stateNames[t.playerStateId]} has won with ${te(t.populations[t.playerStateId])} population alive.`):t.winner!==void 0?(a=Uo,s=`${t.stateNames[t.winner]} has won with ${te(t.populations[t.winner])} population alive. Your state has fallen.`):(a=ht,s="The game has ended in an unexpected state."):(a=ht,s="It's a draw! The world is partially destroyed, but there's still hope."),m.jsx(zo,{backgroundImage:a,children:m.jsxs("div",{children:[m.jsx("h2",{children:"Game Over"}),m.jsx("p",{children:s}),m.jsx("button",{onClick:n,children:"Play Again"}),m.jsx("br",{}),m.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Ae={Component:Ho,path:"played"};function Go({worldState:e}){var c;const[t,n]=b.useState([]),[a,s]=b.useState(null);Fn(l=>{n(d=>l.messageId&&d.find(f=>f.messageId===l.messageId)?[...d.map(f=>f.messageId===l.messageId?l:f)]:[l,...d])});const i=t.sort((l,d)=>l.actions&&!d.actions?-1:!l.actions&&d.actions?1:l.startTimestamp-d.startTimestamp);if(je(l=>{n(d=>d.filter(f=>f.messageId!==l.messageId))}),b.useEffect(()=>{const l=i.find(d=>d.fullScreen&&d.startTimestamp<=e.timestamp&&d.endTimestamp>e.timestamp);s(l||null)},[i,e.timestamp]),!a)return null;const o=((l,d)=>d<l.startTimestamp?"pre":d<l.startTimestamp+.5?"pre-in":d>l.endTimestamp-.5?"post-in":d>l.endTimestamp?"post":"active")(a,e.timestamp),u=l=>Array.isArray(l)?l.map((d,f)=>m.jsx("div",{children:d},f)):l;return m.jsxs(Xo,{"data-message-state":o,"data-action":(((c=a.actions)==null?void 0:c.length)??0)>0,children:[m.jsx(qo,{children:u(a.message)}),a.prompt&&a.actions&&m.jsx(Ko,{children:a.actions.map((l,d)=>m.jsx(Zo,{onClick:()=>Cn(a.messageId,l.id),children:l.text},d))})]})}const Vo=se`
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
`,Wo=se`
  from {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: translateX(-50%) scale(0.9);
  }
`,Xo=C.div`
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
    animation: ${Vo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${Wo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,qo=C.div`
  font-size: 1.5rem;
  color: white;
  text-align: center;
  white-space: pre-line;
`,Ko=C.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,Zo=C.button`
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
`,An="ALLIANCEPROPOSAL";function Jo(e,t,n,a=!1){const s=`${An}_${e.id}_${t.id}`,i=a?`${e.name} has become friendly towards you. Do you want to form an alliance?`:`${e.name} proposes an alliance with ${t.name}. Do you accept?`,r=n.timestamp,o=r+10;j(i,r,o,s,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function Qo({worldState:e,setWorldState:t}){return je(n=>{if(n.messageId.startsWith(An)){const[,a,s]=n.messageId.split("_"),i=e.states.find(o=>o.id===a),r=e.states.find(o=>o.id===s);if(!i||!(r!=null&&r.isPlayerControlled))return;if(n.actionId==="accept"){const o=e.states.map(u=>u.id===a||u.id===s?{...u,strategies:{...u.strategies,[a]:g.FRIENDLY,[s]:g.FRIENDLY}}:u);t({...e,states:o}),j(`Alliance formed between ${i.name} and ${r.name}!`,e.timestamp,e.timestamp+5)}else n.actionId==="reject"&&j(`${r.name} has rejected the alliance proposal from ${i.name}.`,e.timestamp,e.timestamp+5)}}),null}function el({worldState:e}){const t=e.states.find(h=>h.isPlayerControlled),[n,a]=b.useState(!1),[s,i]=b.useState({}),[r,o]=b.useState([]),[u,c]=b.useState([]),[l,d]=b.useState(!1),f=Math.round(e.timestamp*10)/10;return b.useEffect(()=>{!n&&e.timestamp>0&&(a(!0),j("The game has started!",e.timestamp,e.timestamp+3))},[f]),b.useEffect(()=>{var h,p,y,v;if(t){const x=Object.fromEntries(e.states.map(E=>[E.id,E.strategies]));for(const E of e.states)for(const F of e.states.filter(R=>R.id!==E.id))t&&F.id===t.id&&E.strategies[F.id]===g.FRIENDLY&&F.strategies[E.id]!==g.FRIENDLY&&((h=s[E.id])==null?void 0:h[F.id])!==g.FRIENDLY&&Jo(E,t,e,!0),F.strategies[E.id]===g.FRIENDLY&&E.strategies[F.id]===g.FRIENDLY&&(((p=s[F.id])==null?void 0:p[E.id])!==g.FRIENDLY||((y=s[E.id])==null?void 0:y[F.id])!==g.FRIENDLY)&&j(`${F.name} has formed alliance with ${E.isPlayerControlled?"you":E.name}!`,f,f+3),E.strategies[F.id]===g.HOSTILE&&((v=s[E.id])==null?void 0:v[F.id])!==g.HOSTILE&&j(F.isPlayerControlled?`${E.name} has declared war on You!`:`${E.isPlayerControlled?"You have":E.name} declared war on ${F.name}!`,f,f+3,void 0,void 0,void 0,E.isPlayerControlled||F.isPlayerControlled);i(x)}},[f]),b.useEffect(()=>{t&&e.cities.forEach(h=>{const p=r.find(E=>E.id===h.id);if(!p)return;const y=h.population||0,v=p.population,x=Math.floor(v-y);x>0&&(h.stateId===t.id&&j(y===0?`Your city ${h.name} has been destroyed!`:[`Your city ${h.name} has been hit!`,`${x} casualties reported.`],f,f+3,void 0,void 0,!1,!0),V("cityDamage"))}),o(e.cities.map(h=>({...h})))},[f]),b.useEffect(()=>{if(t){const h=e.launchSites.filter(p=>p.stateId===t.id);u.length>0&&u.filter(y=>!h.some(v=>v.id===y.id)).forEach(()=>{j("One of your launch sites has been destroyed!",f,f+3,void 0,void 0,!1,!0)}),c(h)}},[f]),b.useEffect(()=>{if(t&&!l){const h=e.cities.filter(v=>v.stateId===t.id),p=e.launchSites.filter(v=>v.stateId===t.id);!h.some(v=>v.population>0)&&p.length===0&&(j(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],f,f+5,void 0,void 0,!1,!0),d(!0))}},[f]),null}function tl({worldState:e}){const[t,n]=b.useState([]);Fn(r=>{n(o=>r.messageId&&o.find(u=>u.messageId===r.messageId)?[...o.map(u=>u.messageId===r.messageId?r:u)]:[r,...o])}),je(r=>{n(o=>o.filter(u=>u.messageId!==r.messageId))});const a=r=>Array.isArray(r)?r.map((o,u)=>m.jsx("div",{children:o},u)):r,s=(r,o)=>{const l=o-r;return l>60?0:l>50?1-(l-50)/10:1},i=b.useMemo(()=>{const r=e.timestamp,o=60;return t.filter(u=>{const c=u.startTimestamp||0;return r-c<=o}).map(u=>({...u,opacity:s(u.startTimestamp||0,r)}))},[t,e.timestamp]);return m.jsx(nl,{children:i.map((r,o)=>m.jsxs(al,{style:{opacity:r.opacity},children:[m.jsx("div",{children:a(r.message)}),r.prompt&&r.actions&&m.jsx(sl,{children:r.actions.map((u,c)=>m.jsx(il,{onClick:()=>Cn(r.messageId,u.id),children:u.text},c))})]},o))})}const nl=C.div`
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
`,al=C.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,sl=C.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,il=C.button`
  font-size: 10px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function rl({updateWorldTime:e,currentWorldTime:t}){const[n,a]=b.useState(!1),s=b.useRef(null);cn(r=>{if(!s.current){s.current=r;return}const o=r-s.current;s.current=r,!(o<=0)&&n&&e(o/1e3)},!0);const i=r=>{const o=Math.floor(r/86400),u=Math.floor(r%86400/3600),c=Math.floor(r%3600/60),l=Math.floor(r%60);return[[o,"d"],[u,"h"],[c,"m"],[l,"s"]].filter(([d])=>!!d).map(([d,f])=>String(d)+f).join(" ")};return m.jsx(ol,{children:m.jsxs(ll,{children:[m.jsxs(ul,{children:[t>0?"Current Time: ":"Game not started yet",i(t)]}),m.jsx(K,{onClick:()=>e(1),children:"+1s"}),m.jsx(K,{onClick:()=>e(10),children:"+10s"}),m.jsx(K,{onClick:()=>e(60),children:"+1m"}),m.jsx(K,{onClick:()=>a(!n),children:n?"Stop":"Start"})]})})}const ol=C.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,ll=C.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,K=C.button`
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
`,ul=C.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`;function cl({worldState:e}){const t=e.states.find(o=>o.isPlayerControlled);if(!t)return null;const n=(o,u,c=!1)=>{t.strategies[o.id]=u,c&&(o.strategies[t.id]=u)},a=o=>{if(o.id===t.id)return"#4CAF50";const u=t.strategies[o.id],c=o.strategies[t.id];return u===g.FRIENDLY&&c===g.FRIENDLY?"#4CAF50":u===g.HOSTILE||c===g.HOSTILE?"#F44336":"#9E9E9E"},s=rn(e),i=o=>{const u=e.cities.filter(h=>h.stateId===o),c=e.launchSites.filter(h=>h.stateId===o);if(u.length===0&&c.length===0){console.warn("No position information available for this state");return}const l=[...u.map(h=>h.position),...c.map(h=>h.position)],d=l.reduce((h,p)=>({x:h.x+p.x,y:h.y+p.y}),{x:0,y:0}),f={x:d.x/l.length,y:d.y/l.length};Bo(f)},r=o=>{const u=t.strategies[o.id],c=o.strategies[t.id];return m.jsxs(vl,{children:[(u===g.NEUTRAL&&c!==g.HOSTILE||u===g.FRIENDLY&&c!==g.FRIENDLY)&&m.jsx(Z,{color:"#4CAF50",onClick:l=>{l.stopPropagation(),n(o,g.FRIENDLY)},disabled:u===g.FRIENDLY&&c!==g.FRIENDLY,children:"Alliance"}),(u===g.HOSTILE||c===g.HOSTILE)&&m.jsx(Z,{color:"#9E9E9E",onClick:l=>{l.stopPropagation(),n(o,g.NEUTRAL)},disabled:u===g.NEUTRAL&&c!==g.NEUTRAL,children:"Peace"}),u===g.FRIENDLY&&c===g.FRIENDLY&&m.jsx(Z,{color:"#9E9E9E",onClick:l=>{l.stopPropagation(),n(o,g.NEUTRAL,!0)},children:"Neutral"}),u===g.NEUTRAL&&c!==g.HOSTILE&&m.jsx(Z,{color:"#F44336",onClick:l=>{l.stopPropagation(),n(o,g.HOSTILE,!0)},children:"Attack"})]})};return m.jsx(dl,{children:e.states.map(o=>m.jsxs(ml,{relationshipColor:a(o),onClick:()=>i(o.id),children:[m.jsx(fl,{style:{color:o.color},children:o.name.charAt(0)}),m.jsxs(hl,{children:[m.jsx(pl,{children:o.name}),m.jsxs(gl,{children:["👤 ",te(s[o.id])]}),o.id!==t.id?r(o):m.jsx(yl,{children:"This is you"})]})]},o.id))})}const dl=C.div`
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
`,ml=C.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 10px;
  background: ${e=>`rgba(${parseInt(e.relationshipColor.slice(1,3),16)}, ${parseInt(e.relationshipColor.slice(3,5),16)}, ${parseInt(e.relationshipColor.slice(5,7),16)}, 0.2)`};
  border: 2px solid ${e=>e.relationshipColor};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,fl=C.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,hl=C.div`
  display: flex;
  flex-direction: column;
`,pl=C.span`
  font-weight: bold;
  margin-bottom: 5px;
`,gl=C.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`,vl=C.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`,Z=C.button`
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
`,yl=C.span`
  font-style: italic;
  color: #4caf50;
`,El=({setGameState:e})=>{const{state:{stateName:t}}=gt(),{worldState:n,setWorldState:a,updateWorldState:s}=Ri(t);return m.jsxs(m.Fragment,{children:[m.jsx(Po,{worldState:n}),m.jsx(rl,{updateWorldTime:i=>s(n,i),currentWorldTime:n.timestamp??0}),m.jsx(Go,{worldState:n}),m.jsx(cl,{worldState:n}),m.jsx(tl,{worldState:n}),m.jsx(No,{worldState:n,onGameOver:i=>e(Ae,{result:i})}),m.jsx(el,{worldState:n}),m.jsx(Qo,{worldState:n,setWorldState:a})]})},ae={Component:El,path:"playing"},bl="/assets/play-background-BASXrsIB.png",xl=C.div`
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
    background-image: url(${bl});
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
`,Cl=({setGameState:e})=>{const[t,n]=b.useState(sn(1)[0]),a=()=>{e(ae,{stateName:t})};return m.jsx(xl,{children:m.jsxs("div",{children:[m.jsx("h1",{children:"Name your state:"}),m.jsx("input",{type:"text",placeholder:"Type your state name here",value:t,onChange:s=>n(s.currentTarget.value)}),m.jsx("br",{}),m.jsx("button",{onClick:a,disabled:!t,children:"Start game"}),m.jsx("br",{}),m.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},De={Component:Cl,path:"play"},Fl="/assets/intro-background-D_km5uka.png",Al="/assets/nukes-game-title-vcFxx9vI.png",Dl=se`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,Il=se`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,Tl=C.div`
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
    background-image: url(${Fl});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${Dl} 60s ease-in-out infinite;
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
`,Sl=C.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${e=>e.isFlashing?1:0};
  animation: ${e=>e.isFlashing?Il:"none"} 4.5s forwards;
`,kl=C.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,Ml=C.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,_l=({setGameState:e})=>{const[t,n]=b.useState(!0);return b.useEffect(()=>{const a=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(a)},[]),m.jsxs(Tl,{children:[m.jsx(Sl,{isFlashing:t}),!t&&m.jsxs(kl,{children:[m.jsx(Ml,{src:Al,alt:"Nukes game"}),m.jsx("button",{onClick:()=>e(De),children:"Play"})]})]})},pt={Component:_l,path:""},Bl=Mn`
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
`,wl=[{path:pt.path,element:m.jsx(J,{state:pt})},{path:De.path,element:m.jsx(J,{state:De})},{path:ae.path,element:m.jsx(J,{state:ae})},{path:Ae.path,element:m.jsx(J,{state:Ae})}];function Ol(){var n;const[e]=Sn(),t=e.get("path")??"";return m.jsx(m.Fragment,{children:(n=wl.find(a=>a.path===t))==null?void 0:n.element})}function J({state:e}){const t=kn();return m.jsxs(m.Fragment,{children:[m.jsx(Bl,{}),m.jsx(e.Component,{setGameState:(n,a)=>t({search:"path="+n.path},{state:a})})]})}export{Ol as NukesApp,wl as routes};
