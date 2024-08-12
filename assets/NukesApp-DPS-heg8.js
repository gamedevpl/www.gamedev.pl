import{c as B,g as Tn,r as b,j as d,R as Y,u as pt,a as In,b as Sn}from"./index-BIg5jLGM.js";import{d as x,m as ae,f as kn}from"./styled-components.browser.esm-TiTxIayR.js";const gt=20,J=gt*1.5,me=5,L=20,_n=1,Mn=5,Bn=L/Mn,wn=.5,Ln=500,X=.05,de=5,On=4,re=60,I=16,O=I*5,vt=1e3,De=O*4,jn=10;var g=(e=>(e.NEUTRAL="NEUTRAL",e.FRIENDLY="FRIENDLY",e.HOSTILE="HOSTILE",e))(g||{}),yt=(e=>(e.LAUNCH_SITE="LAUNCH_SITE",e))(yt||{}),k=(e=>(e.WATER="WATER",e.GROUND="GROUND",e))(k||{}),S=(e=>(e.ATTACK="ATTACK",e.DEFENCE="DEFENCE",e))(S||{});function Rn(e,t){const n=[];for(let a=0;a<t;a++)for(let s=0;s<e;s++)n.push({id:`${s*I},${a*I}`,position:{x:s*I,y:a*I},rect:{left:s*I,top:a*I,right:(s+1)*I,bottom:(a+1)*I},type:k.WATER,depth:0,height:0,population:0,cityId:""});return n}function Pn(e,t,n){const a=[],s=Array(n).fill(null).map(()=>Array(t).fill(!1));for(let i=0;i<n;i++)for(let r=0;r<t;r++){const o=i*t+r;e[o].type===k.WATER&&$n(r,i,t,n,e)&&(a.push([r,i,0]),s[i][r]=!0)}for(;a.length>0;){const[i,r,o]=a.shift(),u=r*t+i;e[u].type===k.WATER?e[u].depth=o+(Math.random()-Math.random())/5:e[u].type===k.GROUND&&(e[u].height=Math.sqrt(o)+(Math.random()-Math.random())/10);const c=[[-1,0],[1,0],[0,-1],[0,1]];for(const[l,m]of c){const h=i+l,f=r+m;Et(h,f,t,n)&&!s[f][h]&&(a.push([h,f,o+1]),s[f][h]=!0)}}}function $n(e,t,n,a,s){return[[-1,0],[1,0],[0,-1],[0,1]].some(([r,o])=>{const u=e+r,c=t+o;if(Et(u,c,n,a)){const l=c*n+u;return s[l].type===k.GROUND}return!1})}function Et(e,t,n,a){return e>=0&&e<n&&t>=0&&t<a}var bt={exports:{}},Nn=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(e){var t=Nn,n=t.filter(function(s){return!!s.css}),a=t.filter(function(s){return!!s.vga});e.exports=function(s){var i=e.exports.get(s);return i&&i.value},e.exports.get=function(s){return s=s||"",s=s.trim().toLowerCase(),t.filter(function(i){return i.name.toLowerCase()===s}).pop()},e.exports.all=e.exports.get.all=function(){return t},e.exports.get.css=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),n.filter(function(i){return i.name.toLowerCase()===s}).pop()):n},e.exports.get.vga=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),a.filter(function(i){return i.name.toLowerCase()===s}).pop()):a}})(bt);var Un=bt.exports,Yn=1/0,zn="[object Symbol]",Hn=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,Ct="\\ud800-\\udfff",Gn="\\u0300-\\u036f\\ufe20-\\ufe23",Vn="\\u20d0-\\u20f0",xt="\\u2700-\\u27bf",Ft="a-z\\xdf-\\xf6\\xf8-\\xff",Wn="\\xac\\xb1\\xd7\\xf7",Xn="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",qn="\\u2000-\\u206f",Kn=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",At="A-Z\\xc0-\\xd6\\xd8-\\xde",Zn="\\ufe0e\\ufe0f",Dt=Wn+Xn+qn+Kn,Tt="['’]",Le="["+Dt+"]",Jn="["+Gn+Vn+"]",It="\\d+",Qn="["+xt+"]",St="["+Ft+"]",kt="[^"+Ct+Dt+It+xt+Ft+At+"]",ea="\\ud83c[\\udffb-\\udfff]",ta="(?:"+Jn+"|"+ea+")",na="[^"+Ct+"]",_t="(?:\\ud83c[\\udde6-\\uddff]){2}",Mt="[\\ud800-\\udbff][\\udc00-\\udfff]",U="["+At+"]",aa="\\u200d",Oe="(?:"+St+"|"+kt+")",sa="(?:"+U+"|"+kt+")",je="(?:"+Tt+"(?:d|ll|m|re|s|t|ve))?",Re="(?:"+Tt+"(?:D|LL|M|RE|S|T|VE))?",Bt=ta+"?",wt="["+Zn+"]?",ia="(?:"+aa+"(?:"+[na,_t,Mt].join("|")+")"+wt+Bt+")*",ra=wt+Bt+ia,oa="(?:"+[Qn,_t,Mt].join("|")+")"+ra,la=RegExp([U+"?"+St+"+"+je+"(?="+[Le,U,"$"].join("|")+")",sa+"+"+Re+"(?="+[Le,U+Oe,"$"].join("|")+")",U+"?"+Oe+"+"+je,U+"+"+Re,It,oa].join("|"),"g"),ua=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,ca=typeof B=="object"&&B&&B.Object===Object&&B,ma=typeof self=="object"&&self&&self.Object===Object&&self,da=ca||ma||Function("return this")();function fa(e){return e.match(Hn)||[]}function ha(e){return ua.test(e)}function pa(e){return e.match(la)||[]}var ga=Object.prototype,va=ga.toString,Pe=da.Symbol,$e=Pe?Pe.prototype:void 0,Ne=$e?$e.toString:void 0;function ya(e){if(typeof e=="string")return e;if(ba(e))return Ne?Ne.call(e):"";var t=e+"";return t=="0"&&1/e==-Yn?"-0":t}function Ea(e){return!!e&&typeof e=="object"}function ba(e){return typeof e=="symbol"||Ea(e)&&va.call(e)==zn}function Ca(e){return e==null?"":ya(e)}function xa(e,t,n){return e=Ca(e),t=n?void 0:t,t===void 0?ha(e)?pa(e):fa(e):e.match(t)||[]}var Fa=xa,Aa=1/0,Da="[object Symbol]",Ta=/^\s+/,Te="\\ud800-\\udfff",Lt="\\u0300-\\u036f\\ufe20-\\ufe23",Ot="\\u20d0-\\u20f0",jt="\\ufe0e\\ufe0f",Ia="["+Te+"]",fe="["+Lt+Ot+"]",he="\\ud83c[\\udffb-\\udfff]",Sa="(?:"+fe+"|"+he+")",Rt="[^"+Te+"]",Pt="(?:\\ud83c[\\udde6-\\uddff]){2}",$t="[\\ud800-\\udbff][\\udc00-\\udfff]",Nt="\\u200d",Ut=Sa+"?",Yt="["+jt+"]?",ka="(?:"+Nt+"(?:"+[Rt,Pt,$t].join("|")+")"+Yt+Ut+")*",_a=Yt+Ut+ka,Ma="(?:"+[Rt+fe+"?",fe,Pt,$t,Ia].join("|")+")",Ba=RegExp(he+"(?="+he+")|"+Ma+_a,"g"),wa=RegExp("["+Nt+Te+Lt+Ot+jt+"]"),La=typeof B=="object"&&B&&B.Object===Object&&B,Oa=typeof self=="object"&&self&&self.Object===Object&&self,ja=La||Oa||Function("return this")();function Ra(e){return e.split("")}function Pa(e,t,n,a){for(var s=e.length,i=n+-1;++i<s;)if(t(e[i],i,e))return i;return-1}function $a(e,t,n){if(t!==t)return Pa(e,Na,n);for(var a=n-1,s=e.length;++a<s;)if(e[a]===t)return a;return-1}function Na(e){return e!==e}function Ua(e,t){for(var n=-1,a=e.length;++n<a&&$a(t,e[n],0)>-1;);return n}function Ya(e){return wa.test(e)}function Ue(e){return Ya(e)?za(e):Ra(e)}function za(e){return e.match(Ba)||[]}var Ha=Object.prototype,Ga=Ha.toString,Ye=ja.Symbol,ze=Ye?Ye.prototype:void 0,He=ze?ze.toString:void 0;function Va(e,t,n){var a=-1,s=e.length;t<0&&(t=-t>s?0:s+t),n=n>s?s:n,n<0&&(n+=s),s=t>n?0:n-t>>>0,t>>>=0;for(var i=Array(s);++a<s;)i[a]=e[a+t];return i}function zt(e){if(typeof e=="string")return e;if(qa(e))return He?He.call(e):"";var t=e+"";return t=="0"&&1/e==-Aa?"-0":t}function Wa(e,t,n){var a=e.length;return n=n===void 0?a:n,!t&&n>=a?e:Va(e,t,n)}function Xa(e){return!!e&&typeof e=="object"}function qa(e){return typeof e=="symbol"||Xa(e)&&Ga.call(e)==Da}function Ka(e){return e==null?"":zt(e)}function Za(e,t,n){if(e=Ka(e),e&&(n||t===void 0))return e.replace(Ta,"");if(!e||!(t=zt(t)))return e;var a=Ue(e),s=Ua(a,Ue(t));return Wa(a,s).join("")}var Ja=Za,pe=1/0,Qa=9007199254740991,es=17976931348623157e292,Ge=NaN,ts="[object Symbol]",ns=/^\s+|\s+$/g,as=/^[-+]0x[0-9a-f]+$/i,ss=/^0b[01]+$/i,is=/^0o[0-7]+$/i,Ie="\\ud800-\\udfff",Ht="\\u0300-\\u036f\\ufe20-\\ufe23",Gt="\\u20d0-\\u20f0",Vt="\\ufe0e\\ufe0f",rs="["+Ie+"]",ge="["+Ht+Gt+"]",ve="\\ud83c[\\udffb-\\udfff]",os="(?:"+ge+"|"+ve+")",Wt="[^"+Ie+"]",Xt="(?:\\ud83c[\\udde6-\\uddff]){2}",qt="[\\ud800-\\udbff][\\udc00-\\udfff]",Kt="\\u200d",Zt=os+"?",Jt="["+Vt+"]?",ls="(?:"+Kt+"(?:"+[Wt,Xt,qt].join("|")+")"+Jt+Zt+")*",us=Jt+Zt+ls,cs="(?:"+[Wt+ge+"?",ge,Xt,qt,rs].join("|")+")",ye=RegExp(ve+"(?="+ve+")|"+cs+us,"g"),ms=RegExp("["+Kt+Ie+Ht+Gt+Vt+"]"),ds=parseInt,fs=typeof B=="object"&&B&&B.Object===Object&&B,hs=typeof self=="object"&&self&&self.Object===Object&&self,ps=fs||hs||Function("return this")(),gs=ys("length");function vs(e){return e.split("")}function ys(e){return function(t){return t==null?void 0:t[e]}}function Se(e){return ms.test(e)}function Qt(e){return Se(e)?bs(e):gs(e)}function Es(e){return Se(e)?Cs(e):vs(e)}function bs(e){for(var t=ye.lastIndex=0;ye.test(e);)t++;return t}function Cs(e){return e.match(ye)||[]}var xs=Object.prototype,Fs=xs.toString,Ve=ps.Symbol,As=Math.ceil,Ds=Math.floor,We=Ve?Ve.prototype:void 0,Xe=We?We.toString:void 0;function qe(e,t){var n="";if(!e||t<1||t>Qa)return n;do t%2&&(n+=e),t=Ds(t/2),t&&(e+=e);while(t);return n}function Ts(e,t,n){var a=-1,s=e.length;t<0&&(t=-t>s?0:s+t),n=n>s?s:n,n<0&&(n+=s),s=t>n?0:n-t>>>0,t>>>=0;for(var i=Array(s);++a<s;)i[a]=e[a+t];return i}function en(e){if(typeof e=="string")return e;if(tn(e))return Xe?Xe.call(e):"";var t=e+"";return t=="0"&&1/e==-pe?"-0":t}function Is(e,t,n){var a=e.length;return n=n===void 0?a:n,!t&&n>=a?e:Ts(e,t,n)}function Ss(e,t){t=t===void 0?" ":en(t);var n=t.length;if(n<2)return n?qe(t,e):t;var a=qe(t,As(e/Qt(t)));return Se(t)?Is(Es(a),0,e).join(""):a.slice(0,e)}function Ke(e){var t=typeof e;return!!e&&(t=="object"||t=="function")}function ks(e){return!!e&&typeof e=="object"}function tn(e){return typeof e=="symbol"||ks(e)&&Fs.call(e)==ts}function _s(e){if(!e)return e===0?e:0;if(e=Bs(e),e===pe||e===-pe){var t=e<0?-1:1;return t*es}return e===e?e:0}function Ms(e){var t=_s(e),n=t%1;return t===t?n?t-n:t:0}function Bs(e){if(typeof e=="number")return e;if(tn(e))return Ge;if(Ke(e)){var t=typeof e.valueOf=="function"?e.valueOf():e;e=Ke(t)?t+"":t}if(typeof e!="string")return e===0?e:+e;e=e.replace(ns,"");var n=ss.test(e);return n||is.test(e)?ds(e.slice(2),n?2:8):as.test(e)?Ge:+e}function ws(e){return e==null?"":en(e)}function Ls(e,t,n){e=ws(e),t=Ms(t);var a=t?Qt(e):0;return t&&a<t?e+Ss(t-a,n):e}var Os=Ls,js=(e,t,n,a)=>{const s=(e+(a||"")).toString().includes("%");if(typeof e=="string"?[e,t,n,a]=e.match(/(0?\.?\d{1,3})%?\b/g).map(Number):a!==void 0&&(a=parseFloat(a)),typeof e!="number"||typeof t!="number"||typeof n!="number"||e>255||t>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof a=="number"){if(!s&&a>=0&&a<=1)a=Math.round(255*a);else if(s&&a>=0&&a<=100)a=Math.round(255*a/100);else throw new TypeError(`Expected alpha value (${a}) as a fraction or percentage`);a=(a|256).toString(16).slice(1)}else a="";return(n|t<<8|e<<16|1<<24).toString(16).slice(1)+a};const H="a-f\\d",Rs=`#?[${H}]{3}[${H}]?`,Ps=`#?[${H}]{6}([${H}]{2})?`,$s=new RegExp(`[^#${H}]`,"gi"),Ns=new RegExp(`^${Rs}$|^${Ps}$`,"i");var Us=(e,t={})=>{if(typeof e!="string"||$s.test(e)||!Ns.test(e))throw new TypeError("Expected a valid hex string");e=e.replace(/^#/,"");let n=1;e.length===8&&(n=Number.parseInt(e.slice(6,8),16)/255,e=e.slice(0,6)),e.length===4&&(n=Number.parseInt(e.slice(3,4).repeat(2),16)/255,e=e.slice(0,3)),e.length===3&&(e=e[0]+e[0]+e[1]+e[1]+e[2]+e[2]);const a=Number.parseInt(e,16),s=a>>16,i=a>>8&255,r=a&255,o=typeof t.alpha=="number"?t.alpha:n;if(t.format==="array")return[s,i,r,o];if(t.format==="css"){const u=o===1?"":` / ${Number((o*100).toFixed(2))}%`;return`rgb(${s} ${i} ${r}${u})`}return{red:s,green:i,blue:r,alpha:o}},Ys=Un,zs=Fa,Hs=Ja,Gs=Os,Vs=js,nn=Us;const oe=.75,le=.25,ue=16777215,Ws=49979693;var Xs=function(e){return"#"+Zs(String(JSON.stringify(e)))};function qs(e){var t=zs(e),n=[];return t.forEach(function(a){var s=Ys(a);s&&n.push(nn(Hs(s,"#"),{format:"array"}))}),n}function Ks(e){var t=[0,0,0];return e.forEach(function(n){for(var a=0;a<3;a++)t[a]+=n[a]}),[t[0]/e.length,t[1]/e.length,t[2]/e.length]}function Zs(e){var t,n=qs(e);n.length>0&&(t=Ks(n));var a=1,s=0,i=1;if(e.length>0)for(var r=0;r<e.length;r++)e[r].charCodeAt(0)>s&&(s=e[r].charCodeAt(0)),i=parseInt(ue/s),a=(a+e[r].charCodeAt(0)*i*Ws)%ue;var o=(a*e.length%ue).toString(16);o=Gs(o,6,o);var u=nn(o,{format:"array"});return t?Vs(le*u[0]+oe*t[0],le*u[1]+oe*t[1],le*u[2]+oe*t[2]):o}const Js=Tn(Xs);function Qs(e){return[...ei].sort(()=>Math.random()-Math.random()).slice(0,e)}const ei=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function an(e){return[...ti].sort(()=>Math.random()-Math.random()).slice(0,e)}const ti=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];function ni(){const e=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],t=Array.from({length:256},(s,i)=>i).sort(()=>Math.random()-.5),n=[...t,...t];function a(s,i,r){return s[0]*i+s[1]*r}return function(i,r){const o=Math.floor(i)&255,u=Math.floor(r)&255;i-=Math.floor(i),r-=Math.floor(r);const c=i*i*i*(i*(i*6-15)+10),l=r*r*r*(r*(r*6-15)+10),m=n[o]+u,h=n[o+1]+u;return(1+(a(e[n[m]&7],i,r)*(1-c)+a(e[n[h]&7],i-1,r)*c)*(1-l)+(a(e[n[m+1]&7],i,r-1)*(1-c)+a(e[n[h+1]&7],i-1,r-1)*c)*l)/2}}function Ee(e,t,n,a,s){const i=ni(),r=Math.floor(e.x/I),o=Math.floor(e.y/I),u=Math.floor(a/4),c=.5,l=.005,m=.7;for(let f=o-u;f<=o+u;f++)for(let p=r-u;p<=r+u;p++)if(p>=0&&p<a&&f>=0&&f<s){let E=p,v=f;for(let F=0;F<t;F++)Math.random()<m&&(E+=Math.random()>.5?1:-1,v+=Math.random()>.5?1:-1);E=Math.max(0,Math.min(a-1,E)),v=Math.max(0,Math.min(s-1,v));const C=Math.sqrt((E-r)*(E-r)+(v-o)*(v-o))/u,y=i(p*l,f*l);if(C<1&&y>c+C*.01){const F=f*a+p;n[F].type=k.GROUND,n[F].depth=void 0,n[F].height=(1-C)*2*(y-c)}}const h=Math.min(Math.max(o*a+r,0),a);n[h].type=k.GROUND,n[h].depth=void 0,n[h].height=1}function ai(e,t){return{x:Math.floor(Math.random()*(e*.8)+e*.1)*I,y:Math.floor(Math.random()*(t*.8)+t*.1)*I}}function si(e,t,n,a){if(e.x<0||e.y<0||e.x>=n||e.y>=a)return!1;const s=Math.floor(n/(Math.sqrt(t.length+1)*2));return t.every(i=>Math.abs(e.x-i.x)>s||Math.abs(e.y-i.y)>s)}function ii(e,t,n){return t.every(a=>Math.sqrt(Math.pow(e.x-a.position.x,2)+Math.pow(e.y-a.position.y,2))>=n)}function ri(e,t,n,a,s){const i=[],r=[],o=[],u=L*3,c=an(e*2).filter(f=>f!==t),l=5,m=Qs(e*l*2),h=[];for(let f=0;f<e;f++){const p=`state-${f+1}`,E=f===0?t:c.pop(),v=oi(p,E,f===0);i.push(v),i.forEach(y=>{v.strategies[y.id]=g.NEUTRAL,y.strategies[p]=g.NEUTRAL});const C=li(h,n,a);h.push(C),Ee(C,n/2,s,n,a),ui(p,C,l,m,r,o,u,s,n,a),v.population=r.filter(y=>y.stateId===p).reduce((y,F)=>y+F.population,0)}return ci(s,r),{states:i,cities:r,launchSites:o}}function oi(e,t,n){return{id:e,name:t,color:Js(t),isPlayerControlled:n,strategies:{},lastStrategyUpdate:0,generalStrategy:n?void 0:[g.NEUTRAL,g.HOSTILE,g.FRIENDLY].sort(()=>Math.random()-.5)[0],population:0}}function li(e,t,n){let a,s=10;do if(a=ai(t,n),s--<=0)break;while(!si(a,e,t,n));return a}function ui(e,t,n,a,s,i,r,o,u,c){const l=[];for(let m=0;m<n;m++){const h=Ze(t,l,r,30*I);l.push({position:h}),s.push({id:`city-${s.length+1}`,stateId:e,name:a.pop(),position:h,population:Math.floor(Math.random()*3e3)+1e3}),Ee(h,2,o,u,c)}for(const m of s){const h=o.filter(f=>{const p=f.position.x-m.position.x,E=f.position.y-m.position.y;return Math.sqrt(p*p+E*E)<O});for(const f of h){f.cityId=m.id;const p=f.position.x-m.position.x,E=f.position.y-m.position.y,v=Math.sqrt(p*p+E*E);f.population=Math.max(0,O-v)/O*vt}m.population=h.reduce((f,p)=>f+p.population,0)}for(let m=0;m<4;m++){const h=Ze(t,l,r,15*I);l.push({position:h}),i.push({type:yt.LAUNCH_SITE,id:`launch-site-${i.length+1}`,stateId:e,position:h,mode:Math.random()>.5?S.DEFENCE:S.ATTACK}),Ee(h,1,o,u,c)}return l}function Ze(e,t,n,a){let s,i=10;do if(s={x:e.x+(Math.random()-.5)*a,y:e.y+(Math.random()-.5)*a},i--<=0)break;while(!ii(s,t,n));return s}function ci(e,t){const n=new Map(e.map(s=>[s.id,s])),a=[];for(t.forEach(s=>{e.filter(r=>r.cityId===s.id).forEach(r=>{r.stateId=s.stateId,a.push(r)})});a.length>0;){const s=a.splice(0,1)[0];mi(s,n).forEach(r=>{!r.stateId&&r.type===k.GROUND&&(r.stateId=s.stateId,a.push(r))})}}function mi(e,t){const n=[];return[{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:-1},{dx:0,dy:1}].forEach(({dx:s,dy:i})=>{const r=`${e.position.x+s*I},${e.position.y+i*I}`,o=t.get(r);o&&n.push(o)}),n}function di({playerStateName:e,numberOfStates:t=3}){const n=Math.max(200,Math.ceil(Math.sqrt(t)*10)),a=n,s=Rn(n,a),{states:i,cities:r,launchSites:o}=ri(t,e,n,a,s);return Pn(s,n,a),{timestamp:0,states:i,cities:r,launchSites:o,sectors:s,missiles:[],explosions:[],interceptors:[]}}function _(e,t,n,a){return Math.sqrt(Math.pow(n-e,2)+Math.pow(a-t,2))}function fi(e){var n;const t=e.sectors.filter(a=>a.cityId&&a.population>0);for(const a of e.states){const s=e.cities.filter(l=>l.stateId===a.id),i=e.launchSites.filter(l=>l.stateId===a.id),r=e.cities.filter(l=>a.strategies[l.stateId]===g.HOSTILE&&l.stateId!==a.id&&l.population>0).map(l=>({...l,isCity:!0})),o=e.missiles.filter(l=>a.strategies[l.stateId]!==g.FRIENDLY&&l.stateId!==a.id),u=e.launchSites.filter(l=>a.strategies[l.stateId]===g.HOSTILE&&l.stateId!==a.id).map(l=>({...l,isCity:!1})),c=o.filter(l=>s.some(m=>be(l.target,m.position,L+O))||i.some(m=>be(l.target,m.position,L))).filter(l=>(e.timestamp-l.launchTimestamp)/(l.targetTimestamp-l.launchTimestamp)>.5);for(const l of e.launchSites.filter(m=>m.stateId===a.id)){if(l.nextLaunchTarget)continue;if(r.length===0&&u.length===0&&o.length===0)break;if(c.length===0&&l.mode===S.DEFENCE||c.length>0&&l.mode===S.ATTACK){l.modeChangeTimestamp||(l.modeChangeTimestamp=e.timestamp);continue}const m=Je(c.map(v=>({...v,isCity:!1})),l.position),h=e.missiles.filter(v=>v.stateId===a.id),f=e.interceptors.filter(v=>v.stateId===a.id),p=f.filter(v=>!v.targetMissileId&&l.id===v.launchSiteId),E=pi(f,m).filter(([,v])=>v<i.length);if(l.mode===S.DEFENCE&&E.length>0){const v=E[0][0];p.length>0?p[0].targetMissileId=v:l.nextLaunchTarget={type:"missile",missileId:v}}else if(l.mode===S.ATTACK){const v=hi(Je([...u,...r],l.position),h),C=(n=v==null?void 0:v[0])==null?void 0:n[0];if(C!=null&&C.position&&(C!=null&&C.isCity)){const y=gi(C,t);l.nextLaunchTarget={type:"position",position:y||{x:C.position.x+(Math.random()-Math.random())*O,y:C.position.y+(Math.random()-Math.random())*O}}}else l.nextLaunchTarget=C!=null&&C.position?{type:"position",position:C==null?void 0:C.position}:void 0}}}return e}function be(e,t,n){return _(e.x,e.y,t.x,t.y)<=n}function Je(e,t){return e.sort((n,a)=>_(n.position.x,n.position.y,t.x,t.y)-_(a.position.x,a.position.y,t.x,t.y))}function hi(e,t){const n=new Map;for(const a of e)n.set(a,t.filter(s=>be(s.target,a.position,L)).length);return Array.from(n).sort((a,s)=>a[1]-s[1])}function pi(e,t){const n=new Map;for(const a of t)n.set(a.id,0);for(const a of e)a.targetMissileId&&n.set(a.targetMissileId,(n.get(a.targetMissileId)??0)+1);return Array.from(n).sort((a,s)=>a[1]-s[1])}function gi(e,t){const n=t.filter(s=>s.cityId===e.id);return!n||n.length===0?null:n[Math.floor(Math.random()*n.length)].position}function vi(e){var t,n;for(const a of e.missiles.filter(s=>s.launchTimestamp===e.timestamp)){const s=e.states.find(r=>r.id===a.stateId),i=((t=e.cities.find(r=>_(r.position.x,r.position.y,a.target.x,a.target.y)<=L+O))==null?void 0:t.stateId)||((n=e.launchSites.find(r=>_(r.position.x,r.position.y,a.target.x,a.target.y)<=L))==null?void 0:n.stateId);if(s&&i&&s.id!==i){s.strategies[i]!==g.HOSTILE&&(s.strategies[i]=g.HOSTILE);const r=e.states.find(o=>o.id===i);r&&r.strategies[s.id]!==g.HOSTILE&&(r.strategies[s.id]=g.HOSTILE,e.states.forEach(o=>{o.id!==r.id&&o.strategies[r.id]===g.FRIENDLY&&r.strategies[o.id]===g.FRIENDLY&&(o.strategies[s.id]=g.HOSTILE,s.strategies[o.id]=g.HOSTILE)}))}}for(const a of e.states.filter(s=>!s.isPlayerControlled))yi(a,e);return e}function yi(e,t){if(e.lastStrategyUpdate&&t.timestamp-e.lastStrategyUpdate<jn)return;e.lastStrategyUpdate=t.timestamp;const n=t.states.filter(r=>r.id!==e.id),a=n.filter(r=>e.strategies[r.id]===g.FRIENDLY&&r.strategies[e.id]===g.FRIENDLY);e.strategies={...e.strategies},n.forEach(r=>{r.strategies[e.id]===g.FRIENDLY&&e.strategies[r.id]===g.NEUTRAL&&(e.generalStrategy!==g.HOSTILE?e.strategies[r.id]=g.FRIENDLY:r.strategies[e.id]=g.NEUTRAL)}),n.forEach(r=>{r.strategies[e.id]===g.NEUTRAL&&e.strategies[r.id]===g.HOSTILE&&(Qe(e,r,a,t)?e.strategies[r.id]=g.NEUTRAL:r.strategies[e.id]=g.HOSTILE)});const s=n.filter(r=>Object.values(r.strategies).every(o=>o!==g.HOSTILE)&&r.generalStrategy!==g.HOSTILE);if(s.length>0&&e.generalStrategy===g.FRIENDLY){const r=s[Math.floor(Math.random()*s.length)];e.strategies[r.id]=g.FRIENDLY}a.forEach(r=>{n.forEach(o=>{o.strategies[r.id]===g.HOSTILE&&e.strategies[o.id]!==g.HOSTILE&&(e.strategies[o.id]=g.HOSTILE)})}),n.filter(r=>r.strategies[e.id]!==g.FRIENDLY&&e.strategies[r.id]!==g.FRIENDLY).forEach(r=>{if(Qe(r,e,a,t)){const o=t.launchSites.filter(u=>u.stateId===e.id&&!u.lastLaunchTimestamp);if(o.length>0){const u=o[Math.floor(Math.random()*o.length)],c=[...t.cities.filter(l=>l.stateId===r.id),...t.launchSites.filter(l=>l.stateId===r.id)];if(c.length>0){const l=c[Math.floor(Math.random()*c.length)];u.nextLaunchTarget={type:"position",position:l.position}}}}})}function Qe(e,t,n,a){const s=a.states.filter(u=>e.strategies[u.id]===g.FRIENDLY&&u.strategies[e.id]===g.FRIENDLY&&u.id!==e.id),i=a.launchSites.filter(u=>u.stateId===e.id||s.some(c=>c.id===u.stateId)),r=a.launchSites.filter(u=>u.stateId===t.id||n.some(c=>c.id===u.stateId));return i.length<r.length?!0:a.missiles.some(u=>a.cities.some(c=>c.stateId===e.id&&_(c.position.x,c.position.y,u.target.x,u.target.y)<=L)||a.launchSites.some(c=>c.stateId===e.id&&_(c.position.x,c.position.y,u.target.x,u.target.y)<=L))}function Ei(e,t){for(;t>0;){const n=bi(e,t>X?X:t);t=t>X?t-X:0,e=n}return e}function bi(e,t){const n=e.timestamp+t;let a={timestamp:n,states:e.states,cities:e.cities,launchSites:e.launchSites,missiles:e.missiles,interceptors:e.interceptors,explosions:e.explosions,sectors:e.sectors};return a=Ci(a,n),a=xi(a,t),a=Fi(a),a=Ai(a,e,n),a=ki(a,n),a=_i(a,e,n),a=wi(a),a=fi(a),a=vi(a),a}function Ci(e,t){for(const n of e.missiles){const a=(t-n.launchTimestamp)/(n.targetTimestamp-n.launchTimestamp);n.position={x:n.launch.x+(n.target.x-n.launch.x)*a,y:n.launch.y+(n.target.y-n.launch.y)*a}}return e}function xi(e,t){return e.interceptors=e.interceptors.filter(n=>{const a=e.missiles.find(u=>u.id===n.targetMissileId);a||(n.targetMissileId=void 0);const s=a?a.position.x-n.position.x:Math.cos(n.direction),i=a?a.position.y-n.position.y:Math.sin(n.direction),r=Math.sqrt(s*s+i*i);if(n.direction=Math.atan2(i,s),a&&r<=J*t)n.position={...a.position};else{const u=J*t/r;n.position={x:n.position.x+s*u,y:n.position.y+i*u}}return n.tail=[...n.tail.slice(-100),{timestamp:e.timestamp,position:n.position}],J*(e.timestamp-n.launchTimestamp)<=n.maxRange}),e}function Fi(e){for(const t of e.interceptors){const n=e.missiles.find(a=>a.id===t.targetMissileId);n&&_(t.position.x,t.position.y,n.position.x,n.position.y)<_n&&(e.missiles=e.missiles.filter(s=>s.id!==n.id),e.interceptors=e.interceptors.filter(s=>s.id!==t.id))}return e}function Ai(e,t,n){for(const a of t.missiles.filter(s=>s.targetTimestamp<=n)){const s=Di(a);e.explosions.push(s),e=Ti(e,s),e=Ii(e,s,t),e=Si(e,s,t)}return e.explosions=e.explosions.filter(a=>a.endTimestamp>=n),e.missiles=e.missiles.filter(a=>a.targetTimestamp>n),e}function Di(e){return{id:`explosion-${Math.random()}`,missileId:e.id,startTimestamp:e.targetTimestamp,endTimestamp:e.targetTimestamp+Bn,position:e.target,radius:L}}function Ti(e,t){for(const n of e.sectors.filter(a=>_(a.position.x,a.position.y,t.position.x,t.position.y)<=t.radius))if(n.population){const a=Math.max(Ln,n.population*wn);n.population=Math.max(0,n.population-a)}return e}function Ii(e,t,n){const a=n.missiles.filter(s=>s.id!==t.missileId&&s.launchTimestamp<=t.startTimestamp&&s.targetTimestamp>=t.startTimestamp&&_(s.position.x,s.position.y,t.position.x,t.position.y)<=t.radius);for(const s of a)s.targetTimestamp=t.startTimestamp;return e.interceptors=e.interceptors.filter(s=>!(s.launchTimestamp<=t.startTimestamp&&_(s.position.x,s.position.y,t.position.x,t.position.y)<=t.radius)),e}function Si(e,t,n){const a=n.launchSites.filter(s=>_(s.position.x,s.position.y,t.position.x,t.position.y)<=t.radius);return e.launchSites=e.launchSites.filter(s=>!a.some(i=>i.id===s.id)),e}function ki(e,t){for(const n of e.launchSites)n.modeChangeTimestamp&&t>=n.modeChangeTimestamp+me&&(n.mode=n.mode===S.ATTACK?S.DEFENCE:S.ATTACK,n.modeChangeTimestamp=void 0);return e}function _i(e,t,n){var a,s;for(const i of t.launchSites)if(i.nextLaunchTarget&&!(i.lastLaunchTimestamp&&n-i.lastLaunchTimestamp<(i.mode===S.ATTACK?de:On))){if(i.mode===S.ATTACK&&((a=i.nextLaunchTarget)==null?void 0:a.type)==="position")e.missiles.push(Mi(i,i.nextLaunchTarget.position,n));else if(i.mode===S.DEFENCE&&((s=i.nextLaunchTarget)==null?void 0:s.type)==="missile"){const r=i.nextLaunchTarget.missileId;r&&e.interceptors.push(Bi(i,n,r))}i.lastLaunchTimestamp=n,i.nextLaunchTarget=void 0}return e}function Mi(e,t,n){return{id:Math.random()+"",stateId:e.stateId,launchSiteId:e.id,launch:e.position,launchTimestamp:n,position:e.position,target:t,targetTimestamp:n+_(e.position.x,e.position.y,t.x,t.y)/gt}}function Bi(e,t,n){return{id:Math.random()+"",stateId:e.stateId,launchSiteId:e.id,launch:e.position,launchTimestamp:t,position:e.position,direction:0,tail:[],targetMissileId:n,maxRange:De}}function wi(e){const t=e.sectors.reduce((n,a)=>(a.cityId&&(n[a.cityId]=n[a.cityId]?n[a.cityId]+(a.population??0):a.population??0),n),{});for(const n of e.cities)n.population=t[n.id];return e.states=e.states.map(n=>{const a=e.cities.filter(s=>s.stateId===n.id).reduce((s,i)=>s+i.population,0);return{...n,population:a}}),e}function Li(e){const[t,n]=b.useState(()=>di({playerStateName:e,numberOfStates:6})),a=b.useCallback((s,i)=>n(Ei(s,i)),[]);return{worldState:t,updateWorldState:a,setWorldState:n}}const sn={x:0,y:0,pointingObjects:[]},Oi=(e,t)=>t.type==="move"?{x:t.x,y:t.y,pointingObjects:e.pointingObjects}:t.type==="point"&&!e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:[...e.pointingObjects,t.object]}:t.type==="unpoint"&&e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:e.pointingObjects.filter(n=>n.id!==t.object.id)}:e,ji=b.createContext(sn),ke=b.createContext(()=>{});function Ri({children:e}){const[t,n]=b.useReducer(Oi,sn);return d.jsx(ji.Provider,{value:t,children:d.jsx(ke.Provider,{value:n,children:e})})}function Pi(){const e=b.useContext(ke);return(t,n)=>e({type:"move",x:t,y:n})}function _e(){const e=b.useContext(ke);return[t=>e({type:"point",object:t}),t=>e({type:"unpoint",object:t})]}const Me={},$i=(e,t)=>t.type==="clear"?Me:t.type==="set"?{...e,selectedObject:t.object}:e,rn=b.createContext(Me),on=b.createContext(()=>{});function Ni({children:e}){const[t,n]=b.useReducer($i,Me);return d.jsx(rn.Provider,{value:t,children:d.jsx(on.Provider,{value:n,children:e})})}function Ui(e){var a;const t=b.useContext(on);return[((a=b.useContext(rn).selectedObject)==null?void 0:a.id)===e.id,()=>t({type:"set",object:e})]}function G(e,t){const n=new CustomEvent(e,{bubbles:!0,detail:t});document.dispatchEvent(n)}function se(e,t){b.useEffect(()=>{const n=a=>{t(a.detail)};return document.addEventListener(e,n,!1),()=>{document.removeEventListener(e,n,!1)}},[e,t])}const Yi=Y.memo(({sectors:e,states:t})=>{const n=b.useRef(null),[a,s]=_e(),[i,r]=b.useState(0);return se("cityDamage",()=>{r(i+1)}),b.useEffect(()=>{const o=n.current,u=o==null?void 0:o.getContext("2d");if(!o||!u)return;const c=Math.min(...e.map(y=>y.rect.left)),l=Math.min(...e.map(y=>y.rect.top)),m=Math.max(...e.map(y=>y.rect.right)),h=Math.max(...e.map(y=>y.rect.bottom)),f=m-c,p=h-l;o.width=f,o.height=p,o.style.width=`${f}px`,o.style.height=`${p}px`;const E=Math.max(...e.filter(y=>y.type===k.WATER).map(y=>y.depth||0)),v=Math.max(...e.filter(y=>y.type===k.GROUND).map(y=>y.height||0)),C=new Map(t.map(y=>[y.id,y.color]));u.clearRect(0,0,f,p),e.forEach(y=>{const{fillStyle:F,drawSector:j}=zi(y,E,v,C);u.fillStyle=F,j(u,y.rect,c,l)})},[i]),b.useEffect(()=>{const o=n.current;let u;const c=l=>{const m=o==null?void 0:o.getBoundingClientRect(),h=l.clientX-((m==null?void 0:m.left)||0),f=l.clientY-((m==null?void 0:m.top)||0),p=e.find(E=>h>=E.rect.left&&h<=E.rect.right&&f>=E.rect.top&&f<=E.rect.bottom);p&&(u&&s(u),a(p),u=p)};return o==null||o.addEventListener("mousemove",c),()=>{o==null||o.removeEventListener("mousemove",c)}},[e,a,s]),d.jsx("canvas",{ref:n,style:{opacity:.5}})});function zi(e,t,n,a){const s=Hi(e,t,n),i=e.stateId?a.get(e.stateId):void 0;return{fillStyle:s,drawSector:(r,o,u,c)=>{r.fillStyle=s,r.fillRect(o.left-u,o.top-c,o.right-o.left,o.bottom-o.top),i&&(r.fillStyle=`${i}80`,r.fillRect(o.left-u,o.top-c,o.right-o.left,o.bottom-o.top)),e.cityId&&e.population>0&&Vi(r,o,u,c)}}}function Hi(e,t,n){switch(e.type){case k.GROUND:return e.cityId?Gi(e):Wi(e.height||0,n);case k.WATER:return Xi(e.depth||0,t);default:return"rgb(0, 34, 93)"}}function Gi(e){if(e.population===0)return"rgba(0,0,0,0.7)";const t=e.population?Math.min(e.population/vt,1):0,n=e.height?e.height/100:0,s=[200,200,200].map(i=>i-50*t+20*n);return`rgb(${s[0]}, ${s[1]}, ${s[2]})`}function Vi(e,t,n,a){e.fillStyle="rgba(0, 0, 0, 0.2)",e.fillRect(t.left-n+2,t.top-a+2,t.right-t.left-4,t.bottom-t.top-4),e.fillStyle="rgba(255, 255, 255, 0.6)",e.fillRect(t.left-n+4,t.top-a+4,t.right-t.left-8,t.bottom-t.top-8)}function Wi(e,t){const n=e/t;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const a=Math.round(34+67*((n-.5)/.3)),s=Math.round(100+-33*((n-.5)/.3)),i=Math.round(34+-1*((n-.5)/.3));return`rgb(${a}, ${s}, ${i})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}function Xi(e,t){const n=e/t,a=Math.round(0+34*(1-n)),s=Math.round(137+-103*n),i=Math.round(178+-85*n);return`rgb(${a}, ${s}, ${i})`}function qi({state:e,sectors:t}){const n=Y.useMemo(()=>{const a=t.filter(s=>s.stateId===e.id);return Zi(a)},[]);return d.jsx(d.Fragment,{children:d.jsx(Ki,{style:{transform:`translate(${n.x}px, ${n.y}px) translate(-50%, -50%)`,color:e.color},children:e.name})})}const Ki=x.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;function Zi(e){if(e.length===0)return{x:0,y:0};const t=e.reduce((n,a)=>({x:n.x+(a.rect.left+a.rect.right)/2,y:n.y+(a.rect.top+a.rect.bottom)/2}),{x:0,y:0});return{x:t.x/e.length,y:t.y/e.length}}function ln(e){return Object.fromEntries(e.states.map(t=>[t.id,t.population]))}function ee(e){return e>=1e3?`${(e/1e3).toFixed(1)}M`:`${e.toFixed(0)}K`}function Ji({city:e}){const[t,n]=_e(),a=e.population;if(!a)return null;const s=ee(a);return d.jsxs(Qi,{onMouseEnter:()=>t(e),onMouseLeave:()=>n(e),style:{"--x":e.position.x,"--y":e.position.y},children:[d.jsx("span",{children:e.name}),d.jsxs(er,{children:[s," population"]})]})}const Qi=x.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`,er=x.div`
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
`;function tr({launchSite:e,worldTimestamp:t,isPlayerControlled:n}){const[a,s]=Ui(e),[i,r]=_e(),o=e.lastLaunchTimestamp&&e.lastLaunchTimestamp+de>t,u=o?(t-e.lastLaunchTimestamp)/de:0,c=e.modeChangeTimestamp&&t<e.modeChangeTimestamp+me,l=c?(t-e.modeChangeTimestamp)/me:0;return d.jsx(nr,{onMouseEnter:()=>i(e),onMouseLeave:()=>r(e),onClick:()=>n&&s(),style:{"--x":e.position.x,"--y":e.position.y,"--cooldown-progress":u,"--mode-change-progress":l},"data-selected":a,"data-cooldown":o,"data-mode":e.mode,"data-changing-mode":c,children:d.jsx(ar,{children:e.mode===S.ATTACK?"A":"D"})})}const nr=x.div`
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
`,ar=x.span`
  z-index: 1;
`;function un(e,t){t===void 0&&(t=!0);var n=b.useRef(null),a=b.useRef(!1),s=b.useRef(e);s.current=e;var i=b.useCallback(function(o){a.current&&(s.current(o),n.current=requestAnimationFrame(i))},[]),r=b.useMemo(function(){return[function(){a.current&&(a.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){a.current||(a.current=!0,n.current=requestAnimationFrame(i))},function(){return a.current}]},[]);return b.useEffect(function(){return t&&r[1](),r[0]},[]),r}function sr(e,t,n){if(t.startTimestamp>n||t.endTimestamp<n)return;const a=Math.pow(Math.min(Math.max(0,(n-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);e.fillStyle=`rgb(${255*a}, ${255*(1-a)}, 0)`,e.beginPath(),e.arc(t.position.x,t.position.y,t.radius*a,0,2*Math.PI),e.fill()}function ir(e,t,n){t.launchTimestamp>n||t.targetTimestamp<n||(e.fillStyle="rgb(255, 0, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,2,0,2*Math.PI),e.fill())}function rr(e,t){e.fillStyle="rgb(0, 255, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,1,0,2*Math.PI),e.fill()}function et(e,t,n){if(!(t.launchTimestamp>n))if("targetTimestamp"in t){if(t.targetTimestamp<n)return;or(e,t,n)}else lr(e,t,n)}function or(e,t,n){const a=Math.min(Math.max(n-5,t.launchTimestamp)-t.launchTimestamp,t.targetTimestamp-t.launchTimestamp),s=t.targetTimestamp-t.launchTimestamp,i=s>0?a/s:0,r=t.launch.x+(t.position.x-t.launch.x)*i,o=t.launch.y+(t.position.y-t.launch.y)*i,u={x:r,y:o},c=e.createLinearGradient(u.x,u.y,t.position.x,t.position.y);c.addColorStop(0,"rgba(255, 255, 255, 0)"),c.addColorStop(1,"rgba(255, 255, 255, 0.5)"),e.strokeStyle=c,e.lineWidth=1,e.beginPath(),e.moveTo(u.x,u.y),e.lineTo(t.position.x,t.position.y),e.stroke()}function lr(e,t,n){const s=Math.max(n-5,t.launchTimestamp),i=t.tail.filter(o=>o.timestamp>=s);if(i.length<2)return;e.beginPath(),e.moveTo(i[0].position.x,i[0].position.y);for(let o=1;o<i.length;o++)e.lineTo(i[o].position.x,i[o].position.y);e.lineTo(t.position.x,t.position.y);const r=e.createLinearGradient(i[0].position.x,i[0].position.y,t.position.x,t.position.y);r.addColorStop(0,"rgba(0, 255, 0, 0)"),r.addColorStop(1,"rgba(0, 255, 0, 0.5)"),e.strokeStyle=r,e.lineWidth=1,e.stroke()}function ur(e,t){if(Math.sqrt(Math.pow(t.position.x-t.launch.x,2)+Math.pow(t.position.y-t.launch.y,2))>De)for(let r=0;r<5;r++){const o=Math.PI*2/5*r,u=t.position.x+Math.cos(o)*3,c=t.position.y+Math.sin(o)*3;e.fillStyle="rgba(0, 255, 0, 0.5)",e.beginPath(),e.arc(u,c,1,0,2*Math.PI),e.fill()}}function cr({state:e}){const t=b.useRef(null);return b.useLayoutEffect(()=>{const a=t.current;if(!a)return;const s=Math.min(...e.sectors.map(l=>l.rect.left)),i=Math.min(...e.sectors.map(l=>l.rect.top)),r=Math.max(...e.sectors.map(l=>l.rect.right)),o=Math.max(...e.sectors.map(l=>l.rect.bottom)),u=r-s,c=o-i;a.width=u,a.height=c,a.style.width=`${u}px`,a.style.height=`${c}px`},[e.sectors]),un(()=>{const a=t.current;if(!a)return;const s=a.getContext("2d");s&&(s.clearRect(0,0,a.width,a.height),e.missiles.forEach(i=>{et(s,i,e.timestamp)}),e.interceptors.forEach(i=>{et(s,i,e.timestamp)}),e.missiles.filter(i=>i.launchTimestamp<e.timestamp&&i.targetTimestamp>e.timestamp).forEach(i=>{ir(s,i,e.timestamp)}),e.interceptors.filter(i=>i.launchTimestamp<e.timestamp).forEach(i=>{rr(s,i),J*(e.timestamp-i.launchTimestamp+1)>De&&ur(s,i)}),e.explosions.filter(i=>i.startTimestamp<e.timestamp&&i.endTimestamp>e.timestamp).forEach(i=>{sr(s,i,e.timestamp)}))}),d.jsx(mr,{ref:t})}const mr=x.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function dr({state:e}){const t=Pi();return d.jsxs(fr,{onMouseMove:n=>t(n.clientX,n.clientY),onClick:()=>G("world-click"),children:[d.jsx(Yi,{sectors:e.sectors,states:e.states}),e.states.map(n=>d.jsx(qi,{state:n,cities:e.cities,launchSites:e.launchSites,sectors:e.sectors},n.id)),e.cities.map(n=>d.jsx(Ji,{city:n},n.id)),e.launchSites.map(n=>{var a;return d.jsx(tr,{launchSite:n,worldTimestamp:e.timestamp,isPlayerControlled:n.stateId===((a=e.states.find(s=>s.isPlayerControlled))==null?void 0:a.id)},n.id)}),d.jsx(cr,{state:e})]})}const fr=x.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function hr(e,t,n){return Math.max(t,Math.min(e,n))}const A={toVector(e,t){return e===void 0&&(e=t),Array.isArray(e)?e:[e,e]},add(e,t){return[e[0]+t[0],e[1]+t[1]]},sub(e,t){return[e[0]-t[0],e[1]-t[1]]},addTo(e,t){e[0]+=t[0],e[1]+=t[1]},subTo(e,t){e[0]-=t[0],e[1]-=t[1]}};function tt(e,t,n){return t===0||Math.abs(t)===1/0?Math.pow(e,n*5):e*t*n/(t+n*e)}function nt(e,t,n,a=.15){return a===0?hr(e,t,n):e<t?-tt(t-e,n-t,a)+t:e>n?+tt(e-n,n-t,a)+n:e}function pr(e,[t,n],[a,s]){const[[i,r],[o,u]]=e;return[nt(t,i,r,a),nt(n,o,u,s)]}function gr(e,t){if(typeof e!="object"||e===null)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var a=n.call(e,t||"default");if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}function vr(e){var t=gr(e,"string");return typeof t=="symbol"?t:String(t)}function T(e,t,n){return t=vr(t),t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function at(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);t&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(e,s).enumerable})),n.push.apply(n,a)}return n}function D(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]!=null?arguments[t]:{};t%2?at(Object(n),!0).forEach(function(a){T(e,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):at(Object(n)).forEach(function(a){Object.defineProperty(e,a,Object.getOwnPropertyDescriptor(n,a))})}return e}const cn={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function st(e){return e?e[0].toUpperCase()+e.slice(1):""}const yr=["enter","leave"];function Er(e=!1,t){return e&&!yr.includes(t)}function br(e,t="",n=!1){const a=cn[e],s=a&&a[t]||t;return"on"+st(e)+st(s)+(Er(n,s)?"Capture":"")}const Cr=["gotpointercapture","lostpointercapture"];function xr(e){let t=e.substring(2).toLowerCase();const n=!!~t.indexOf("passive");n&&(t=t.replace("passive",""));const a=Cr.includes(t)?"capturecapture":"capture",s=!!~t.indexOf(a);return s&&(t=t.replace("capture","")),{device:t,capture:s,passive:n}}function Fr(e,t=""){const n=cn[e],a=n&&n[t]||t;return e+a}function ie(e){return"touches"in e}function mn(e){return ie(e)?"touch":"pointerType"in e?e.pointerType:"mouse"}function Ar(e){return Array.from(e.touches).filter(t=>{var n,a;return t.target===e.currentTarget||((n=e.currentTarget)===null||n===void 0||(a=n.contains)===null||a===void 0?void 0:a.call(n,t.target))})}function Dr(e){return e.type==="touchend"||e.type==="touchcancel"?e.changedTouches:e.targetTouches}function dn(e){return ie(e)?Dr(e)[0]:e}function Ce(e,t){try{const n=t.clientX-e.clientX,a=t.clientY-e.clientY,s=(t.clientX+e.clientX)/2,i=(t.clientY+e.clientY)/2,r=Math.hypot(n,a);return{angle:-(Math.atan2(n,a)*180)/Math.PI,distance:r,origin:[s,i]}}catch{}return null}function Tr(e){return Ar(e).map(t=>t.identifier)}function it(e,t){const[n,a]=Array.from(e.touches).filter(s=>t.includes(s.identifier));return Ce(n,a)}function ce(e){const t=dn(e);return ie(e)?t.identifier:t.pointerId}function z(e){const t=dn(e);return[t.clientX,t.clientY]}const rt=40,ot=800;function fn(e){let{deltaX:t,deltaY:n,deltaMode:a}=e;return a===1?(t*=rt,n*=rt):a===2&&(t*=ot,n*=ot),[t,n]}function Ir(e){var t,n;const{scrollX:a,scrollY:s,scrollLeft:i,scrollTop:r}=e.currentTarget;return[(t=a??i)!==null&&t!==void 0?t:0,(n=s??r)!==null&&n!==void 0?n:0]}function Sr(e){const t={};if("buttons"in e&&(t.buttons=e.buttons),"shiftKey"in e){const{shiftKey:n,altKey:a,metaKey:s,ctrlKey:i}=e;Object.assign(t,{shiftKey:n,altKey:a,metaKey:s,ctrlKey:i})}return t}function te(e,...t){return typeof e=="function"?e(...t):e}function kr(){}function _r(...e){return e.length===0?kr:e.length===1?e[0]:function(){let t;for(const n of e)t=n.apply(this,arguments)||t;return t}}function lt(e,t){return Object.assign({},t,e||{})}const Mr=32;class hn{constructor(t,n,a){this.ctrl=t,this.args=n,this.key=a,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(t){this.ctrl.state[this.key]=t}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:t,shared:n,ingKey:a,args:s}=this;n[a]=t._active=t.active=t._blocked=t._force=!1,t._step=[!1,!1],t.intentional=!1,t._movement=[0,0],t._distance=[0,0],t._direction=[0,0],t._delta=[0,0],t._bounds=[[-1/0,1/0],[-1/0,1/0]],t.args=s,t.axis=void 0,t.memo=void 0,t.elapsedTime=t.timeDelta=0,t.direction=[0,0],t.distance=[0,0],t.overflow=[0,0],t._movementBound=[!1,!1],t.velocity=[0,0],t.movement=[0,0],t.delta=[0,0],t.timeStamp=0}start(t){const n=this.state,a=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=t.target,n.currentTarget=t.currentTarget,n.lastOffset=a.from?te(a.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=t.timeStamp)}computeValues(t){const n=this.state;n._values=t,n.values=this.config.transform(t)}computeInitial(){const t=this.state;t._initial=t._values,t.initial=t.values}compute(t){const{state:n,config:a,shared:s}=this;n.args=this.args;let i=0;if(t&&(n.event=t,a.preventDefault&&t.cancelable&&n.event.preventDefault(),n.type=t.type,s.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,s.locked=!!document.pointerLockElement,Object.assign(s,Sr(t)),s.down=s.pressed=s.buttons%2===1||s.touches>0,i=t.timeStamp-n.timeStamp,n.timeStamp=t.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const R=n._delta.map(Math.abs);A.addTo(n._distance,R)}this.axisIntent&&this.axisIntent(t);const[r,o]=n._movement,[u,c]=a.threshold,{_step:l,values:m}=n;if(a.hasCustomTransform?(l[0]===!1&&(l[0]=Math.abs(r)>=u&&m[0]),l[1]===!1&&(l[1]=Math.abs(o)>=c&&m[1])):(l[0]===!1&&(l[0]=Math.abs(r)>=u&&Math.sign(r)*u),l[1]===!1&&(l[1]=Math.abs(o)>=c&&Math.sign(o)*c)),n.intentional=l[0]!==!1||l[1]!==!1,!n.intentional)return;const h=[0,0];if(a.hasCustomTransform){const[R,Dn]=m;h[0]=l[0]!==!1?R-l[0]:0,h[1]=l[1]!==!1?Dn-l[1]:0}else h[0]=l[0]!==!1?r-l[0]:0,h[1]=l[1]!==!1?o-l[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(h);const f=n.offset,p=n._active&&!n._blocked||n.active;p&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=s[this.ingKey]=n._active,t&&(n.first&&("bounds"in a&&(n._bounds=te(a.bounds,n)),this.setup&&this.setup()),n.movement=h,this.computeOffset()));const[E,v]=n.offset,[[C,y],[F,j]]=n._bounds;n.overflow=[E<C?-1:E>y?1:0,v<F?-1:v>j?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const An=n._active?a.rubberband||[0,0]:[0,0];if(n.offset=pr(n._bounds,n.offset,An),n.delta=A.sub(n.offset,f),this.computeMovement(),p&&(!n.last||i>Mr)){n.delta=A.sub(n.offset,f);const R=n.delta.map(Math.abs);A.addTo(n.distance,R),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&i>0&&(n.velocity=[R[0]/i,R[1]/i],n.timeDelta=i)}}emit(){const t=this.state,n=this.shared,a=this.config;if(t._active||this.clean(),(t._blocked||!t.intentional)&&!t._force&&!a.triggerAllEvents)return;const s=this.handler(D(D(D({},n),t),{},{[this.aliasKey]:t.values}));s!==void 0&&(t.memo=s)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function Br([e,t],n){const a=Math.abs(e),s=Math.abs(t);if(a>s&&a>n)return"x";if(s>a&&s>n)return"y"}class V extends hn{constructor(...t){super(...t),T(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=A.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=A.sub(this.state.offset,this.state.lastOffset)}axisIntent(t){const n=this.state,a=this.config;if(!n.axis&&t){const s=typeof a.axisThreshold=="object"?a.axisThreshold[mn(t)]:a.axisThreshold;n.axis=Br(n._movement,s)}n._blocked=(a.lockDirection||!!a.axis)&&!n.axis||!!a.axis&&a.axis!==n.axis}restrictToAxis(t){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":t[1]=0;break;case"y":t[0]=0;break}}}const wr=e=>e,ut=.15,pn={enabled(e=!0){return e},eventOptions(e,t,n){return D(D({},n.shared.eventOptions),e)},preventDefault(e=!1){return e},triggerAllEvents(e=!1){return e},rubberband(e=0){switch(e){case!0:return[ut,ut];case!1:return[0,0];default:return A.toVector(e)}},from(e){if(typeof e=="function")return e;if(e!=null)return A.toVector(e)},transform(e,t,n){const a=e||n.shared.transform;return this.hasCustomTransform=!!a,a||wr},threshold(e){return A.toVector(e,0)}},Lr=0,P=D(D({},pn),{},{axis(e,t,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(e=Lr){return e},bounds(e={}){if(typeof e=="function")return i=>P.bounds(e(i));if("current"in e)return()=>e.current;if(typeof HTMLElement=="function"&&e instanceof HTMLElement)return e;const{left:t=-1/0,right:n=1/0,top:a=-1/0,bottom:s=1/0}=e;return[[t,n],[a,s]]}}),ct={ArrowRight:(e,t=1)=>[e*t,0],ArrowLeft:(e,t=1)=>[-1*e*t,0],ArrowUp:(e,t=1)=>[0,-1*e*t],ArrowDown:(e,t=1)=>[0,e*t]};class Or extends V{constructor(...t){super(...t),T(this,"ingKey","dragging")}reset(){super.reset();const t=this.state;t._pointerId=void 0,t._pointerActive=!1,t._keyboardActive=!1,t._preventScroll=!1,t._delayed=!1,t.swipe=[0,0],t.tap=!1,t.canceled=!1,t.cancel=this.cancel.bind(this)}setup(){const t=this.state;if(t._bounds instanceof HTMLElement){const n=t._bounds.getBoundingClientRect(),a=t.currentTarget.getBoundingClientRect(),s={left:n.left-a.left+t.offset[0],right:n.right-a.right+t.offset[0],top:n.top-a.top+t.offset[1],bottom:n.bottom-a.bottom+t.offset[1]};t._bounds=P.bounds(s)}}cancel(){const t=this.state;t.canceled||(t.canceled=!0,t._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(t){const n=this.config,a=this.state;if(t.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(t.buttons):n.pointerButtons!==-1&&n.pointerButtons!==t.buttons))return;const s=this.ctrl.setEventIds(t);n.pointerCapture&&t.target.setPointerCapture(t.pointerId),!(s&&s.size>1&&a._pointerActive)&&(this.start(t),this.setupPointer(t),a._pointerId=ce(t),a._pointerActive=!0,this.computeValues(z(t)),this.computeInitial(),n.preventScrollAxis&&mn(t)!=="mouse"?(a._active=!1,this.setupScrollPrevention(t)):n.delay>0?(this.setupDelayTrigger(t),n.triggerAllEvents&&(this.compute(t),this.emit())):this.startPointerDrag(t))}startPointerDrag(t){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(t),this.emit()}pointerMove(t){const n=this.state,a=this.config;if(!n._pointerActive)return;const s=ce(t);if(n._pointerId!==void 0&&s!==n._pointerId)return;const i=z(t);if(document.pointerLockElement===t.target?n._delta=[t.movementX,t.movementY]:(n._delta=A.sub(i,n._values),this.computeValues(i)),A.addTo(n._movement,n._delta),this.compute(t),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(t);return}if(a.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===a.preventScrollAxis||a.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(t);return}else return;this.emit()}pointerUp(t){this.ctrl.setEventIds(t);try{this.config.pointerCapture&&t.target.hasPointerCapture(t.pointerId)&&t.target.releasePointerCapture(t.pointerId)}catch{}const n=this.state,a=this.config;if(!n._active||!n._pointerActive)return;const s=ce(t);if(n._pointerId!==void 0&&s!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(t);const[i,r]=n._distance;if(n.tap=i<=a.tapsThreshold&&r<=a.tapsThreshold,n.tap&&a.filterTaps)n._force=!0;else{const[o,u]=n._delta,[c,l]=n._movement,[m,h]=a.swipe.velocity,[f,p]=a.swipe.distance,E=a.swipe.duration;if(n.elapsedTime<E){const v=Math.abs(o/n.timeDelta),C=Math.abs(u/n.timeDelta);v>m&&Math.abs(c)>f&&(n.swipe[0]=Math.sign(o)),C>h&&Math.abs(l)>p&&(n.swipe[1]=Math.sign(u))}}this.emit()}pointerClick(t){!this.state.tap&&t.detail>0&&(t.preventDefault(),t.stopPropagation())}setupPointer(t){const n=this.config,a=n.device;n.pointerLock&&t.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,a,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(t){this.state._preventScroll&&t.cancelable&&t.preventDefault()}setupScrollPrevention(t){this.state._preventScroll=!1,jr(t);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,t)}setupDelayTrigger(t){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(t)},this.config.delay)}keyDown(t){const n=ct[t.key];if(n){const a=this.state,s=t.shiftKey?10:t.altKey?.1:1;this.start(t),a._delta=n(this.config.keyboardDisplacement,s),a._keyboardActive=!0,A.addTo(a._movement,a._delta),this.compute(t),this.emit()}}keyUp(t){t.key in ct&&(this.state._keyboardActive=!1,this.setActive(),this.compute(t),this.emit())}bind(t){const n=this.config.device;t(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(t(n,"change",this.pointerMove.bind(this)),t(n,"end",this.pointerUp.bind(this)),t(n,"cancel",this.pointerUp.bind(this)),t("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(t("key","down",this.keyDown.bind(this)),t("key","up",this.keyUp.bind(this))),this.config.filterTaps&&t("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function jr(e){"persist"in e&&typeof e.persist=="function"&&e.persist()}const W=typeof window<"u"&&window.document&&window.document.createElement;function gn(){return W&&"ontouchstart"in window}function Rr(){return gn()||W&&window.navigator.maxTouchPoints>1}function Pr(){return W&&"onpointerdown"in window}function $r(){return W&&"exitPointerLock"in window.document}function Nr(){try{return"constructor"in GestureEvent}catch{return!1}}const M={isBrowser:W,gesture:Nr(),touch:gn(),touchscreen:Rr(),pointer:Pr(),pointerLock:$r()},Ur=250,Yr=180,zr=.5,Hr=50,Gr=250,Vr=10,mt={mouse:0,touch:0,pen:8},Wr=D(D({},P),{},{device(e,t,{pointer:{touch:n=!1,lock:a=!1,mouse:s=!1}={}}){return this.pointerLock=a&&M.pointerLock,M.touch&&n?"touch":this.pointerLock?"mouse":M.pointer&&!s?"pointer":M.touch?"touch":"mouse"},preventScrollAxis(e,t,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&e?Ur:void 0,!(!M.touchscreen||n===!1))return e||(n!==void 0?"y":void 0)},pointerCapture(e,t,{pointer:{capture:n=!0,buttons:a=1,keys:s=!0}={}}){return this.pointerButtons=a,this.keys=s,!this.pointerLock&&this.device==="pointer"&&n},threshold(e,t,{filterTaps:n=!1,tapsThreshold:a=3,axis:s=void 0}){const i=A.toVector(e,n?a:s?1:0);return this.filterTaps=n,this.tapsThreshold=a,i},swipe({velocity:e=zr,distance:t=Hr,duration:n=Gr}={}){return{velocity:this.transform(A.toVector(e)),distance:this.transform(A.toVector(t)),duration:n}},delay(e=0){switch(e){case!0:return Yr;case!1:return 0;default:return e}},axisThreshold(e){return e?D(D({},mt),e):mt},keyboardDisplacement(e=Vr){return e}});function vn(e){const[t,n]=e.overflow,[a,s]=e._delta,[i,r]=e._direction;(t<0&&a>0&&i<0||t>0&&a<0&&i>0)&&(e._movement[0]=e._movementBound[0]),(n<0&&s>0&&r<0||n>0&&s<0&&r>0)&&(e._movement[1]=e._movementBound[1])}const Xr=30,qr=100;class Kr extends hn{constructor(...t){super(...t),T(this,"ingKey","pinching"),T(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const t=this.state;t._touchIds=[],t.canceled=!1,t.cancel=this.cancel.bind(this),t.turns=0}computeOffset(){const{type:t,movement:n,lastOffset:a}=this.state;t==="wheel"?this.state.offset=A.add(n,a):this.state.offset=[(1+n[0])*a[0],n[1]+a[1]]}computeMovement(){const{offset:t,lastOffset:n}=this.state;this.state.movement=[t[0]/n[0],t[1]-n[1]]}axisIntent(){const t=this.state,[n,a]=t._movement;if(!t.axis){const s=Math.abs(n)*Xr-Math.abs(a);s<0?t.axis="angle":s>0&&(t.axis="scale")}}restrictToAxis(t){this.config.lockDirection&&(this.state.axis==="scale"?t[1]=0:this.state.axis==="angle"&&(t[0]=0))}cancel(){const t=this.state;t.canceled||setTimeout(()=>{t.canceled=!0,t._active=!1,this.compute(),this.emit()},0)}touchStart(t){this.ctrl.setEventIds(t);const n=this.state,a=this.ctrl.touchIds;if(n._active&&n._touchIds.every(i=>a.has(i))||a.size<2)return;this.start(t),n._touchIds=Array.from(a).slice(0,2);const s=it(t,n._touchIds);s&&this.pinchStart(t,s)}pointerStart(t){if(t.buttons!=null&&t.buttons%2!==1)return;this.ctrl.setEventIds(t),t.target.setPointerCapture(t.pointerId);const n=this.state,a=n._pointerEvents,s=this.ctrl.pointerIds;if(n._active&&Array.from(a.keys()).every(r=>s.has(r))||(a.size<2&&a.set(t.pointerId,t),n._pointerEvents.size<2))return;this.start(t);const i=Ce(...Array.from(a.values()));i&&this.pinchStart(t,i)}pinchStart(t,n){const a=this.state;a.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(t),this.emit()}touchMove(t){if(!this.state._active)return;const n=it(t,this.state._touchIds);n&&this.pinchMove(t,n)}pointerMove(t){const n=this.state._pointerEvents;if(n.has(t.pointerId)&&n.set(t.pointerId,t),!this.state._active)return;const a=Ce(...Array.from(n.values()));a&&this.pinchMove(t,a)}pinchMove(t,n){const a=this.state,s=a._values[1],i=n.angle-s;let r=0;Math.abs(i)>270&&(r+=Math.sign(i)),this.computeValues([n.distance,n.angle-360*r]),a.origin=n.origin,a.turns=r,a._movement=[a._values[0]/a._initial[0]-1,a._values[1]-a._initial[1]],this.compute(t),this.emit()}touchEnd(t){this.ctrl.setEventIds(t),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(t),this.emit())}pointerEnd(t){const n=this.state;this.ctrl.setEventIds(t);try{t.target.releasePointerCapture(t.pointerId)}catch{}n._pointerEvents.has(t.pointerId)&&n._pointerEvents.delete(t.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(t),this.emit())}gestureStart(t){t.cancelable&&t.preventDefault();const n=this.state;n._active||(this.start(t),this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY],this.compute(t),this.emit())}gestureMove(t){if(t.cancelable&&t.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY];const a=n._movement;n._movement=[t.scale-1,t.rotation],n._delta=A.sub(n._movement,a),this.compute(t),this.emit()}gestureEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}wheel(t){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(a=>t[a]):!t[n])||(this.state._active?this.wheelChange(t):this.wheelStart(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(t){this.start(t),this.wheelChange(t)}wheelChange(t){"uv"in t||t.cancelable&&t.preventDefault();const a=this.state;a._delta=[-fn(t)[1]/qr*a.offset[0],0],A.addTo(a._movement,a._delta),vn(a),this.state.origin=[t.clientX,t.clientY],this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){const n=this.config.device;n&&(t(n,"start",this[n+"Start"].bind(this)),t(n,"change",this[n+"Move"].bind(this)),t(n,"end",this[n+"End"].bind(this)),t(n,"cancel",this[n+"End"].bind(this)),t("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&t("wheel","",this.wheel.bind(this),{passive:!1})}}const Zr=D(D({},pn),{},{device(e,t,{shared:n,pointer:{touch:a=!1}={}}){if(n.target&&!M.touch&&M.gesture)return"gesture";if(M.touch&&a)return"touch";if(M.touchscreen){if(M.pointer)return"pointer";if(M.touch)return"touch"}},bounds(e,t,{scaleBounds:n={},angleBounds:a={}}){const s=r=>{const o=lt(te(n,r),{min:-1/0,max:1/0});return[o.min,o.max]},i=r=>{const o=lt(te(a,r),{min:-1/0,max:1/0});return[o.min,o.max]};return typeof n!="function"&&typeof a!="function"?[s(),i()]:r=>[s(r),i(r)]},threshold(e,t,n){return this.lockDirection=n.axis==="lock",A.toVector(e,this.lockDirection?[.1,3]:0)},modifierKey(e){return e===void 0?"ctrlKey":e},pinchOnWheel(e=!0){return e}});class Jr extends V{constructor(...t){super(...t),T(this,"ingKey","moving")}move(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.state._active?this.moveChange(t):this.moveStart(t),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(t){this.start(t),this.computeValues(z(t)),this.compute(t),this.computeInitial(),this.emit()}moveChange(t){if(!this.state._active)return;const n=z(t),a=this.state;a._delta=A.sub(n,a._values),A.addTo(a._movement,a._delta),this.computeValues(n),this.compute(t),this.emit()}moveEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}bind(t){t("pointer","change",this.move.bind(this)),t("pointer","leave",this.moveEnd.bind(this))}}const Qr=D(D({},P),{},{mouseOnly:(e=!0)=>e});class eo extends V{constructor(...t){super(...t),T(this,"ingKey","scrolling")}scroll(t){this.state._active||this.start(t),this.scrollChange(t),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(t){t.cancelable&&t.preventDefault();const n=this.state,a=Ir(t);n._delta=A.sub(a,n._values),A.addTo(n._movement,n._delta),this.computeValues(a),this.compute(t),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("scroll","",this.scroll.bind(this))}}const to=P;class no extends V{constructor(...t){super(...t),T(this,"ingKey","wheeling")}wheel(t){this.state._active||this.start(t),this.wheelChange(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(t){const n=this.state;n._delta=fn(t),A.addTo(n._movement,n._delta),vn(n),this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("wheel","",this.wheel.bind(this))}}const ao=P;class so extends V{constructor(...t){super(...t),T(this,"ingKey","hovering")}enter(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.start(t),this.computeValues(z(t)),this.compute(t),this.emit())}leave(t){if(this.config.mouseOnly&&t.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const a=z(t);n._movement=n._delta=A.sub(a,n._values),this.computeValues(a),this.compute(t),n.delta=n.movement,this.emit()}bind(t){t("pointer","enter",this.enter.bind(this)),t("pointer","leave",this.leave.bind(this))}}const io=D(D({},P),{},{mouseOnly:(e=!0)=>e}),Be=new Map,xe=new Map;function ro(e){Be.set(e.key,e.engine),xe.set(e.key,e.resolver)}const oo={key:"drag",engine:Or,resolver:Wr},lo={key:"hover",engine:so,resolver:io},uo={key:"move",engine:Jr,resolver:Qr},co={key:"pinch",engine:Kr,resolver:Zr},mo={key:"scroll",engine:eo,resolver:to},fo={key:"wheel",engine:no,resolver:ao};function ho(e,t){if(e==null)return{};var n={},a=Object.keys(e),s,i;for(i=0;i<a.length;i++)s=a[i],!(t.indexOf(s)>=0)&&(n[s]=e[s]);return n}function po(e,t){if(e==null)return{};var n=ho(e,t),a,s;if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(s=0;s<i.length;s++)a=i[s],!(t.indexOf(a)>=0)&&Object.prototype.propertyIsEnumerable.call(e,a)&&(n[a]=e[a])}return n}const go={target(e){if(e)return()=>"current"in e?e.current:e},enabled(e=!0){return e},window(e=M.isBrowser?window:void 0){return e},eventOptions({passive:e=!0,capture:t=!1}={}){return{passive:e,capture:t}},transform(e){return e}},vo=["target","eventOptions","window","enabled","transform"];function Q(e={},t){const n={};for(const[a,s]of Object.entries(t))switch(typeof s){case"function":n[a]=s.call(n,e[a],a,e);break;case"object":n[a]=Q(e[a],s);break;case"boolean":s&&(n[a]=e[a]);break}return n}function yo(e,t,n={}){const a=e,{target:s,eventOptions:i,window:r,enabled:o,transform:u}=a,c=po(a,vo);if(n.shared=Q({target:s,eventOptions:i,window:r,enabled:o,transform:u},go),t){const l=xe.get(t);n[t]=Q(D({shared:n.shared},c),l)}else for(const l in c){const m=xe.get(l);m&&(n[l]=Q(D({shared:n.shared},c[l]),m))}return n}class yn{constructor(t,n){T(this,"_listeners",new Set),this._ctrl=t,this._gestureKey=n}add(t,n,a,s,i){const r=this._listeners,o=Fr(n,a),u=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},c=D(D({},u),i);t.addEventListener(o,s,c);const l=()=>{t.removeEventListener(o,s,c),r.delete(l)};return r.add(l),l}clean(){this._listeners.forEach(t=>t()),this._listeners.clear()}}class Eo{constructor(){T(this,"_timeouts",new Map)}add(t,n,a=140,...s){this.remove(t),this._timeouts.set(t,window.setTimeout(n,a,...s))}remove(t){const n=this._timeouts.get(t);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(t=>void window.clearTimeout(t)),this._timeouts.clear()}}class bo{constructor(t){T(this,"gestures",new Set),T(this,"_targetEventStore",new yn(this)),T(this,"gestureEventStores",{}),T(this,"gestureTimeoutStores",{}),T(this,"handlers",{}),T(this,"config",{}),T(this,"pointerIds",new Set),T(this,"touchIds",new Set),T(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),Co(this,t)}setEventIds(t){if(ie(t))return this.touchIds=new Set(Tr(t)),this.touchIds;if("pointerId"in t)return t.type==="pointerup"||t.type==="pointercancel"?this.pointerIds.delete(t.pointerId):t.type==="pointerdown"&&this.pointerIds.add(t.pointerId),this.pointerIds}applyHandlers(t,n){this.handlers=t,this.nativeHandlers=n}applyConfig(t,n){this.config=yo(t,n,this.config)}clean(){this._targetEventStore.clean();for(const t of this.gestures)this.gestureEventStores[t].clean(),this.gestureTimeoutStores[t].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...t){const n=this.config.shared,a={};let s;if(!(n.target&&(s=n.target(),!s))){if(n.enabled){for(const r of this.gestures){const o=this.config[r],u=dt(a,o.eventOptions,!!s);if(o.enabled){const c=Be.get(r);new c(this,t,r).bind(u)}}const i=dt(a,n.eventOptions,!!s);for(const r in this.nativeHandlers)i(r,"",o=>this.nativeHandlers[r](D(D({},this.state.shared),{},{event:o,args:t})),void 0,!0)}for(const i in a)a[i]=_r(...a[i]);if(!s)return a;for(const i in a){const{device:r,capture:o,passive:u}=xr(i);this._targetEventStore.add(s,r,"",a[i],{capture:o,passive:u})}}}}function $(e,t){e.gestures.add(t),e.gestureEventStores[t]=new yn(e,t),e.gestureTimeoutStores[t]=new Eo}function Co(e,t){t.drag&&$(e,"drag"),t.wheel&&$(e,"wheel"),t.scroll&&$(e,"scroll"),t.move&&$(e,"move"),t.pinch&&$(e,"pinch"),t.hover&&$(e,"hover")}const dt=(e,t,n)=>(a,s,i,r={},o=!1)=>{var u,c;const l=(u=r.capture)!==null&&u!==void 0?u:t.capture,m=(c=r.passive)!==null&&c!==void 0?c:t.passive;let h=o?a:br(a,s,l);n&&m&&(h+="Passive"),e[h]=e[h]||[],e[h].push(i)},xo=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function Fo(e){const t={},n={},a=new Set;for(let s in e)xo.test(s)?(a.add(RegExp.lastMatch),n[s]=e[s]):t[s]=e[s];return[n,t,a]}function N(e,t,n,a,s,i){if(!e.has(n)||!Be.has(a))return;const r=n+"Start",o=n+"End",u=c=>{let l;return c.first&&r in t&&t[r](c),n in t&&(l=t[n](c)),c.last&&o in t&&t[o](c),l};s[a]=u,i[a]=i[a]||{}}function Ao(e,t){const[n,a,s]=Fo(e),i={};return N(s,n,"onDrag","drag",i,t),N(s,n,"onWheel","wheel",i,t),N(s,n,"onScroll","scroll",i,t),N(s,n,"onPinch","pinch",i,t),N(s,n,"onMove","move",i,t),N(s,n,"onHover","hover",i,t),{handlers:i,config:t,nativeHandlers:a}}function Do(e,t={},n,a){const s=Y.useMemo(()=>new bo(e),[]);if(s.applyHandlers(e,a),s.applyConfig(t,n),Y.useEffect(s.effect.bind(s)),Y.useEffect(()=>s.clean.bind(s),[]),t.target===void 0)return s.bind.bind(s)}function To(e){return e.forEach(ro),function(n,a){const{handlers:s,nativeHandlers:i,config:r}=Ao(n,a||{});return Do(s,r,void 0,i)}}function Io(e,t){return To([oo,co,mo,fo,uo,lo])(e,t||{})}function So(e){G("translateViewport",e)}function ko(e){se("translateViewport",e)}function _o({children:e,onGetViewportConfiguration:t}){const n=b.useRef(null),a=Y.useMemo(t,[t]),[s,i]=b.useState(a.initialZoom),[r,o]=b.useState(a.initialTranslate),[u,c]=b.useState(!1),l=b.useCallback((m,h)=>{const{minX:f,minY:p,maxX:E,maxY:v}=a,C=window.innerWidth,y=window.innerHeight,F=Math.min(Math.max(h,Math.max(C/(E-f),y/(v-p))),4),j={x:Math.min(Math.max(m.x,-(E-C/F)),-f),y:Math.min(Math.max(m.y,-(v-y/F)),-p)};o(j),i(F)},[a]);return b.useEffect(()=>{l(a.initialTranslate,a.initialZoom)},[]),Io({onPinch({origin:m,delta:h,pinching:f}){var y;c(f);const p=s+h[0],E=(y=n.current)==null?void 0:y.getBoundingClientRect(),v=m[0]-((E==null?void 0:E.left)??0),C=m[1]-((E==null?void 0:E.top)??0);l({x:r.x-(v/s-v/p),y:r.y-(C/s-C/p)},p)},onWheel({event:m,delta:[h,f],wheeling:p}){m.preventDefault(),c(p),l({x:r.x-h/s,y:r.y-f/s},s)}},{target:n,eventOptions:{passive:!1}}),ko(m=>{const h=window.innerWidth,f=window.innerHeight,p=h/2-m.x*s,E=f/2-m.y*s;l({x:p/s,y:E/s},s)}),d.jsx(Mo,{children:d.jsx(Bo,{ref:n,children:d.jsx(wo,{style:{"--zoom":s,"--translate-x":r.x,"--translate-y":r.y},"data-is-interacting":u,children:e})})})}const Mo=x.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,Bo=x.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,wo=x.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function Lo({worldState:e}){return d.jsx(Ni,{children:d.jsx(Ri,{children:d.jsx(_o,{onGetViewportConfiguration:()=>Oo(e),children:d.jsx(dr,{state:e})})})})}function Oo(e){const t=e.states.find(v=>v.isPlayerControlled),n=window.innerWidth,a=window.innerHeight,s=t?e.sectors.filter(v=>v.stateId===t.id):e.sectors;let i=1/0,r=1/0,o=-1/0,u=-1/0;s.forEach(v=>{i=Math.min(i,v.rect.left),r=Math.min(r,v.rect.top),o=Math.max(o,v.rect.right),u=Math.max(u,v.rect.bottom)});const c=o-i+1,l=u-r+1,m=n/c,h=a/l,f=Math.min(m,h)*1,p=(i+o)/2,E=(r+u)/2;return e.sectors.forEach(v=>{i=Math.min(i,v.rect.left),r=Math.min(r,v.rect.top),o=Math.max(o,v.rect.right),u=Math.max(u,v.rect.bottom)}),{initialTranslate:{x:n/2-p*f,y:a/2-E*f},initialZoom:f,minX:i,minY:r,maxX:o,maxY:u}}const En="fullScreenMessage",bn="fullScreenMessageAction";function w(e,t,n,a="",s,i,r){G(En,{message:e,startTimestamp:t,endTimestamp:n,messageId:a,actions:s,prompt:i,fullScreen:r??!!(s!=null&&s.length)})}function Cn(e,t){G(bn,{messageId:e,actionId:t})}function xn(e){se(En,t=>{e(t)})}function we(e){se(bn,t=>{e(t)})}function jo({worldState:e,onGameOver:t}){const[n,a]=b.useState(null),[s,i]=b.useState(!1);return b.useEffect(()=>{var f;if(s)return;const r=ln(e),o=Object.values(r).filter(p=>p>0).length,u=e.launchSites.length===0,c=e.timestamp,l=e.states.filter(p=>r[p.id]>0&&Object.entries(p.strategies).filter(([E,v])=>r[E]>0&&v===g.HOSTILE).length>0),m=e.launchSites.some(p=>p.lastLaunchTimestamp&&c-p.lastLaunchTimestamp<re),h=re-c;if(!l.length&&!m&&h>0&&h<=10&&(n?w(`Game will end in ${Math.ceil(h)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):a(c)),o<=1||u||!l.length&&!m&&c>re){const p=o===1?(f=e.states.find(E=>r[E.id]>0))==null?void 0:f.id:void 0;i(!0),w(["Game Over!","Results will be shown shortly..."],c,c+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{t({populations:r,winner:p,stateNames:Object.fromEntries(e.states.map(E=>[E.id,E.name])),playerStateId:e.states.find(E=>E.isPlayerControlled).id})},5e3)}},[e,t,n,s]),null}const Ro="/assets/player-lost-background-D2A_VJ6-.png",Po="/assets/player-won-background-CkXgF24i.png",ft="/assets/draw-background-EwLQ9g28.png",$o=x.div`
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
`,No=({setGameState:e})=>{const{state:{result:t}}=pt(),n=()=>{e(ne,{stateName:t.stateNames[t.playerStateId]})};let a,s;return t.winner?t.winner===t.playerStateId?(a=Po,s=`Congratulations! ${t.stateNames[t.playerStateId]} has won with ${ee(t.populations[t.playerStateId])} population alive.`):t.winner!==void 0?(a=Ro,s=`${t.stateNames[t.winner]} has won with ${ee(t.populations[t.winner])} population alive. Your state has fallen.`):(a=ft,s="The game has ended in an unexpected state."):(a=ft,s="It's a draw! The world is partially destroyed, but there's still hope."),d.jsx($o,{backgroundImage:a,children:d.jsxs("div",{children:[d.jsx("h2",{children:"Game Over"}),d.jsx("p",{children:s}),d.jsx("button",{onClick:n,children:"Play Again"}),d.jsx("br",{}),d.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Fe={Component:No,path:"played"};function Uo({worldState:e}){var c;const[t,n]=b.useState([]),[a,s]=b.useState(null);xn(l=>{n(m=>l.messageId&&m.find(h=>h.messageId===l.messageId)?[...m.map(h=>h.messageId===l.messageId?l:h)]:[l,...m])});const i=t.sort((l,m)=>l.actions&&!m.actions?-1:!l.actions&&m.actions?1:l.startTimestamp-m.startTimestamp);if(we(l=>{n(m=>m.filter(h=>h.messageId!==l.messageId))}),b.useEffect(()=>{const l=i.find(m=>m.fullScreen&&m.startTimestamp<=e.timestamp&&m.endTimestamp>e.timestamp);s(l||null)},[i,e.timestamp]),!a)return null;const o=((l,m)=>m<l.startTimestamp?"pre":m<l.startTimestamp+.5?"pre-in":m>l.endTimestamp-.5?"post-in":m>l.endTimestamp?"post":"active")(a,e.timestamp),u=l=>Array.isArray(l)?l.map((m,h)=>d.jsx("div",{children:m},h)):l;return d.jsxs(Ho,{"data-message-state":o,"data-action":(((c=a.actions)==null?void 0:c.length)??0)>0,children:[d.jsx(Go,{children:u(a.message)}),a.prompt&&a.actions&&d.jsx(Vo,{children:a.actions.map((l,m)=>d.jsx(Wo,{onClick:()=>Cn(a.messageId,l.id),children:l.text},m))})]})}const Yo=ae`
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
`,zo=ae`
  from {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: translateX(-50%) scale(0.9);
  }
`,Ho=x.div`
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
    animation: ${Yo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${zo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,Go=x.div`
  font-size: 1.5rem;
  color: white;
  text-align: center;
  white-space: pre-line;
`,Vo=x.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,Wo=x.button`
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
`,Fn="ALLIANCEPROPOSAL";function Xo(e,t,n,a=!1){const s=`${Fn}_${e.id}_${t.id}`,i=a?`${e.name} has become friendly towards you. Do you want to form an alliance?`:`${e.name} proposes an alliance with ${t.name}. Do you accept?`,r=n.timestamp,o=r+10;w(i,r,o,s,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function qo({worldState:e,setWorldState:t}){return we(n=>{if(n.messageId.startsWith(Fn)){const[,a,s]=n.messageId.split("_"),i=e.states.find(o=>o.id===a),r=e.states.find(o=>o.id===s);if(!i||!(r!=null&&r.isPlayerControlled))return;if(n.actionId==="accept"){const o=e.states.map(u=>u.id===a||u.id===s?{...u,strategies:{...u.strategies,[a]:g.FRIENDLY,[s]:g.FRIENDLY}}:u);t({...e,states:o}),w(`Alliance formed between ${i.name} and ${r.name}!`,e.timestamp,e.timestamp+5)}else n.actionId==="reject"&&w(`${r.name} has rejected the alliance proposal from ${i.name}.`,e.timestamp,e.timestamp+5)}}),null}function Ko({worldState:e}){const t=e.states.find(f=>f.isPlayerControlled),[n,a]=b.useState(!1),[s,i]=b.useState({}),[r,o]=b.useState([]),[u,c]=b.useState([]),[l,m]=b.useState(!1),h=Math.round(e.timestamp*10)/10;return b.useEffect(()=>{!n&&e.timestamp>0&&(a(!0),w("The game has started!",e.timestamp,e.timestamp+3))},[h]),b.useEffect(()=>{var f,p,E,v;if(t){const C=Object.fromEntries(e.states.map(y=>[y.id,y.strategies]));for(const y of e.states)for(const F of e.states.filter(j=>j.id!==y.id))t&&F.id===t.id&&y.strategies[F.id]===g.FRIENDLY&&F.strategies[y.id]!==g.FRIENDLY&&((f=s[y.id])==null?void 0:f[F.id])!==g.FRIENDLY&&Xo(y,t,e,!0),F.strategies[y.id]===g.FRIENDLY&&y.strategies[F.id]===g.FRIENDLY&&(((p=s[F.id])==null?void 0:p[y.id])!==g.FRIENDLY||((E=s[y.id])==null?void 0:E[F.id])!==g.FRIENDLY)&&w(`${F.name} has formed alliance with ${y.isPlayerControlled?"you":y.name}!`,h,h+3),y.strategies[F.id]===g.HOSTILE&&((v=s[y.id])==null?void 0:v[F.id])!==g.HOSTILE&&w(F.isPlayerControlled?`${y.name} has declared war on You!`:`${y.isPlayerControlled?"You have":y.name} declared war on ${F.name}!`,h,h+3,void 0,void 0,void 0,y.isPlayerControlled||F.isPlayerControlled);i(C)}},[h]),b.useEffect(()=>{t&&e.cities.forEach(f=>{const p=r.find(y=>y.id===f.id);if(!p)return;const E=f.population||0,v=p.population,C=Math.floor(v-E);C>0&&(f.stateId===t.id&&w(E===0?`Your city ${f.name} has been destroyed!`:[`Your city ${f.name} has been hit!`,`${C} casualties reported.`],h,h+3,void 0,void 0,!1,!0),G("cityDamage"))}),o(e.cities.map(f=>({...f})))},[h]),b.useEffect(()=>{if(t){const f=e.launchSites.filter(p=>p.stateId===t.id);u.length>0&&u.filter(E=>!f.some(v=>v.id===E.id)).forEach(()=>{w("One of your launch sites has been destroyed!",h,h+3,void 0,void 0,!1,!0)}),c(f)}},[h]),b.useEffect(()=>{if(t&&!l){const f=e.cities.filter(v=>v.stateId===t.id),p=e.launchSites.filter(v=>v.stateId===t.id);!f.some(v=>v.population>0)&&p.length===0&&(w(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],h,h+5,void 0,void 0,!1,!0),m(!0))}},[h]),null}function Zo({worldState:e}){const[t,n]=b.useState([]);xn(r=>{n(o=>r.messageId&&o.find(u=>u.messageId===r.messageId)?[...o.map(u=>u.messageId===r.messageId?r:u)]:[r,...o])}),we(r=>{n(o=>o.filter(u=>u.messageId!==r.messageId))});const a=r=>Array.isArray(r)?r.map((o,u)=>d.jsx("div",{children:o},u)):r,s=(r,o)=>{const l=o-r;return l>60?0:l>50?1-(l-50)/10:1},i=b.useMemo(()=>{const r=e.timestamp,o=60;return t.filter(u=>{const c=u.startTimestamp||0;return r-c<=o}).map(u=>({...u,opacity:s(u.startTimestamp||0,r)}))},[t,e.timestamp]);return d.jsx(Jo,{children:i.map((r,o)=>d.jsxs(Qo,{style:{opacity:r.opacity},children:[d.jsx("div",{children:a(r.message)}),r.prompt&&r.actions&&d.jsx(el,{children:r.actions.map((u,c)=>d.jsx(tl,{onClick:()=>Cn(r.messageId,u.id),children:u.text},c))})]},o))})}const Jo=x.div`
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
`,Qo=x.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,el=x.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,tl=x.button`
  font-size: 10px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function nl({updateWorldTime:e,currentWorldTime:t}){const[n,a]=b.useState(!1),s=b.useRef(null);un(r=>{if(!s.current){s.current=r;return}const o=r-s.current;s.current=r,!(o<=0)&&n&&e(o/1e3)},!0);const i=r=>{const o=Math.floor(r/86400),u=Math.floor(r%86400/3600),c=Math.floor(r%3600/60),l=Math.floor(r%60);return[[o,"d"],[u,"h"],[c,"m"],[l,"s"]].filter(([m])=>!!m).map(([m,h])=>String(m)+h).join(" ")};return d.jsx(al,{children:d.jsxs(sl,{children:[d.jsxs(il,{children:[t>0?"Current Time: ":"Game not started yet",i(t)]}),d.jsx(q,{onClick:()=>e(1),children:"+1s"}),d.jsx(q,{onClick:()=>e(10),children:"+10s"}),d.jsx(q,{onClick:()=>e(60),children:"+1m"}),d.jsx(q,{onClick:()=>a(!n),children:n?"Stop":"Start"})]})})}const al=x.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,sl=x.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,q=x.button`
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
`,il=x.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`;function rl({worldState:e}){const t=e.states.find(o=>o.isPlayerControlled);if(!t)return null;const n=(o,u,c=!1)=>{t.strategies[o.id]=u,c&&(o.strategies[t.id]=u)},a=o=>{if(o.id===t.id)return"#4CAF50";const u=t.strategies[o.id],c=o.strategies[t.id];return u===g.FRIENDLY&&c===g.FRIENDLY?"#4CAF50":u===g.HOSTILE||c===g.HOSTILE?"#F44336":"#9E9E9E"},s=ln(e),i=o=>{const u=e.cities.filter(f=>f.stateId===o),c=e.launchSites.filter(f=>f.stateId===o);if(u.length===0&&c.length===0){console.warn("No position information available for this state");return}const l=[...u.map(f=>f.position),...c.map(f=>f.position)],m=l.reduce((f,p)=>({x:f.x+p.x,y:f.y+p.y}),{x:0,y:0}),h={x:m.x/l.length,y:m.y/l.length};So(h)},r=o=>{const u=t.strategies[o.id],c=o.strategies[t.id];return d.jsxs(fl,{children:[(u===g.NEUTRAL&&c!==g.HOSTILE||u===g.FRIENDLY&&c!==g.FRIENDLY)&&d.jsx(K,{color:"#4CAF50",onClick:l=>{l.stopPropagation(),n(o,g.FRIENDLY)},disabled:u===g.FRIENDLY&&c!==g.FRIENDLY,children:"Alliance"}),(u===g.HOSTILE||c===g.HOSTILE)&&d.jsx(K,{color:"#9E9E9E",onClick:l=>{l.stopPropagation(),n(o,g.NEUTRAL)},disabled:u===g.NEUTRAL&&c!==g.NEUTRAL,children:"Peace"}),u===g.FRIENDLY&&c===g.FRIENDLY&&d.jsx(K,{color:"#9E9E9E",onClick:l=>{l.stopPropagation(),n(o,g.NEUTRAL,!0)},children:"Neutral"}),u===g.NEUTRAL&&c!==g.HOSTILE&&d.jsx(K,{color:"#F44336",onClick:l=>{l.stopPropagation(),n(o,g.HOSTILE,!0)},children:"Attack"})]})};return d.jsx(ol,{children:e.states.map(o=>d.jsxs(ll,{relationshipColor:a(o),onClick:()=>i(o.id),children:[d.jsx(ul,{style:{color:o.color},children:o.name.charAt(0)}),d.jsxs(cl,{children:[d.jsx(ml,{children:o.name}),d.jsxs(dl,{children:["👤 ",ee(s[o.id])]}),o.id!==t.id?r(o):d.jsx(hl,{children:"This is you"})]})]},o.id))})}const ol=x.div`
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
`,ll=x.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 10px;
  background: ${e=>`rgba(${parseInt(e.relationshipColor.slice(1,3),16)}, ${parseInt(e.relationshipColor.slice(3,5),16)}, ${parseInt(e.relationshipColor.slice(5,7),16)}, 0.2)`};
  border: 2px solid ${e=>e.relationshipColor};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,ul=x.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,cl=x.div`
  display: flex;
  flex-direction: column;
`,ml=x.span`
  font-weight: bold;
  margin-bottom: 5px;
`,dl=x.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`,fl=x.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`,K=x.button`
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
`,hl=x.span`
  font-style: italic;
  color: #4caf50;
`,pl=({setGameState:e})=>{const{state:{stateName:t}}=pt(),{worldState:n,setWorldState:a,updateWorldState:s}=Li(t);return d.jsxs(d.Fragment,{children:[d.jsx(Lo,{worldState:n}),d.jsx(nl,{updateWorldTime:i=>s(n,i),currentWorldTime:n.timestamp??0}),d.jsx(Uo,{worldState:n}),d.jsx(rl,{worldState:n}),d.jsx(Zo,{worldState:n}),d.jsx(jo,{worldState:n,onGameOver:i=>e(Fe,{result:i})}),d.jsx(Ko,{worldState:n}),d.jsx(qo,{worldState:n,setWorldState:a})]})},ne={Component:pl,path:"playing"},gl="/assets/play-background-BASXrsIB.png",vl=x.div`
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
    background-image: url(${gl});
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
`,yl=({setGameState:e})=>{const[t,n]=b.useState(an(1)[0]),a=()=>{e(ne,{stateName:t})};return d.jsx(vl,{children:d.jsxs("div",{children:[d.jsx("h1",{children:"Name your state:"}),d.jsx("input",{type:"text",placeholder:"Type your state name here",value:t,onChange:s=>n(s.currentTarget.value)}),d.jsx("br",{}),d.jsx("button",{onClick:a,disabled:!t,children:"Start game"}),d.jsx("br",{}),d.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Ae={Component:yl,path:"play"},El="/assets/intro-background-D_km5uka.png",bl="/assets/nukes-game-title-vcFxx9vI.png",Cl=ae`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,xl=ae`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,Fl=x.div`
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
    background-image: url(${El});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${Cl} 60s ease-in-out infinite;
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
`,Al=x.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${e=>e.isFlashing?1:0};
  animation: ${e=>e.isFlashing?xl:"none"} 4.5s forwards;
`,Dl=x.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,Tl=x.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,Il=({setGameState:e})=>{const[t,n]=b.useState(!0);return b.useEffect(()=>{const a=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(a)},[]),d.jsxs(Fl,{children:[d.jsx(Al,{isFlashing:t}),!t&&d.jsxs(Dl,{children:[d.jsx(Tl,{src:bl,alt:"Nukes game"}),d.jsx("button",{onClick:()=>e(Ae),children:"Play"})]})]})},ht={Component:Il,path:""},Sl=kn`
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
`,kl=[{path:ht.path,element:d.jsx(Z,{state:ht})},{path:Ae.path,element:d.jsx(Z,{state:Ae})},{path:ne.path,element:d.jsx(Z,{state:ne})},{path:Fe.path,element:d.jsx(Z,{state:Fe})}];function Bl(){var n;const[e]=In(),t=e.get("path")??"";return d.jsx(d.Fragment,{children:(n=kl.find(a=>a.path===t))==null?void 0:n.element})}function Z({state:e}){const t=Sn();return d.jsxs(d.Fragment,{children:[d.jsx(Sl,{}),d.jsx(e.Component,{setGameState:(n,a)=>t({search:"path="+n.path},{state:a})})]})}export{Bl as NukesApp,kl as routes};
