import{c as B,g as Tn,r as b,j as h,R as Y,u as pt,a as In,b as Sn}from"./index-sGBfTsjH.js";import{d as C,m as ae,f as kn}from"./styled-components.browser.esm-DYG-qRCI.js";const gt=20,J=gt*1.5,me=5,L=20,_n=1,Mn=5,Bn=L/Mn,wn=.5,Ln=500,X=.05,de=5,On=4,re=60,I=16,O=I*5,vt=1e3,De=O*4,jn=10;var g=(e=>(e.NEUTRAL="NEUTRAL",e.FRIENDLY="FRIENDLY",e.HOSTILE="HOSTILE",e))(g||{}),yt=(e=>(e.LAUNCH_SITE="LAUNCH_SITE",e))(yt||{}),_=(e=>(e.WATER="WATER",e.GROUND="GROUND",e))(_||{}),S=(e=>(e.ATTACK="ATTACK",e.DEFENCE="DEFENCE",e))(S||{});function Rn(e,t){const n=[];for(let a=0;a<t;a++)for(let s=0;s<e;s++)n.push({id:`${s*I},${a*I}`,position:{x:s*I,y:a*I},rect:{left:s*I,top:a*I,right:(s+1)*I,bottom:(a+1)*I},type:_.WATER,depth:0,height:0,population:0,cityId:""});return n}function Pn(e,t,n){const a=[],s=Array(n).fill(null).map(()=>Array(t).fill(!1));for(let o=0;o<n;o++)for(let r=0;r<t;r++){const i=o*t+r;e[i].type===_.WATER&&$n(r,o,t,n,e)&&(a.push([r,o,0]),s[o][r]=!0)}for(;a.length>0;){const[o,r,i]=a.shift(),l=r*t+o;e[l].type===_.WATER?e[l].depth=i+(Math.random()-Math.random())/5:e[l].type===_.GROUND&&(e[l].height=Math.sqrt(i)+(Math.random()-Math.random())/10);const c=[[-1,0],[1,0],[0,-1],[0,1]];for(const[u,f]of c){const m=o+u,d=r+f;Et(m,d,t,n)&&!s[d][m]&&(a.push([m,d,i+1]),s[d][m]=!0)}}}function $n(e,t,n,a,s){return[[-1,0],[1,0],[0,-1],[0,1]].some(([r,i])=>{const l=e+r,c=t+i;if(Et(l,c,n,a)){const u=c*n+l;return s[u].type===_.GROUND}return!1})}function Et(e,t,n,a){return e>=0&&e<n&&t>=0&&t<a}var bt={exports:{}},Nn=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(e){var t=Nn,n=t.filter(function(s){return!!s.css}),a=t.filter(function(s){return!!s.vga});e.exports=function(s){var o=e.exports.get(s);return o&&o.value},e.exports.get=function(s){return s=s||"",s=s.trim().toLowerCase(),t.filter(function(o){return o.name.toLowerCase()===s}).pop()},e.exports.all=e.exports.get.all=function(){return t},e.exports.get.css=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),n.filter(function(o){return o.name.toLowerCase()===s}).pop()):n},e.exports.get.vga=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),a.filter(function(o){return o.name.toLowerCase()===s}).pop()):a}})(bt);var Un=bt.exports,Yn=1/0,zn="[object Symbol]",Hn=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,xt="\\ud800-\\udfff",Gn="\\u0300-\\u036f\\ufe20-\\ufe23",Vn="\\u20d0-\\u20f0",Ct="\\u2700-\\u27bf",Ft="a-z\\xdf-\\xf6\\xf8-\\xff",Wn="\\xac\\xb1\\xd7\\xf7",Xn="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",qn="\\u2000-\\u206f",Kn=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",At="A-Z\\xc0-\\xd6\\xd8-\\xde",Zn="\\ufe0e\\ufe0f",Dt=Wn+Xn+qn+Kn,Tt="['’]",Le="["+Dt+"]",Jn="["+Gn+Vn+"]",It="\\d+",Qn="["+Ct+"]",St="["+Ft+"]",kt="[^"+xt+Dt+It+Ct+Ft+At+"]",ea="\\ud83c[\\udffb-\\udfff]",ta="(?:"+Jn+"|"+ea+")",na="[^"+xt+"]",_t="(?:\\ud83c[\\udde6-\\uddff]){2}",Mt="[\\ud800-\\udbff][\\udc00-\\udfff]",U="["+At+"]",aa="\\u200d",Oe="(?:"+St+"|"+kt+")",sa="(?:"+U+"|"+kt+")",je="(?:"+Tt+"(?:d|ll|m|re|s|t|ve))?",Re="(?:"+Tt+"(?:D|LL|M|RE|S|T|VE))?",Bt=ta+"?",wt="["+Zn+"]?",ia="(?:"+aa+"(?:"+[na,_t,Mt].join("|")+")"+wt+Bt+")*",ra=wt+Bt+ia,oa="(?:"+[Qn,_t,Mt].join("|")+")"+ra,la=RegExp([U+"?"+St+"+"+je+"(?="+[Le,U,"$"].join("|")+")",sa+"+"+Re+"(?="+[Le,U+Oe,"$"].join("|")+")",U+"?"+Oe+"+"+je,U+"+"+Re,It,oa].join("|"),"g"),ua=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,ca=typeof B=="object"&&B&&B.Object===Object&&B,ma=typeof self=="object"&&self&&self.Object===Object&&self,da=ca||ma||Function("return this")();function fa(e){return e.match(Hn)||[]}function ha(e){return ua.test(e)}function pa(e){return e.match(la)||[]}var ga=Object.prototype,va=ga.toString,Pe=da.Symbol,$e=Pe?Pe.prototype:void 0,Ne=$e?$e.toString:void 0;function ya(e){if(typeof e=="string")return e;if(ba(e))return Ne?Ne.call(e):"";var t=e+"";return t=="0"&&1/e==-Yn?"-0":t}function Ea(e){return!!e&&typeof e=="object"}function ba(e){return typeof e=="symbol"||Ea(e)&&va.call(e)==zn}function xa(e){return e==null?"":ya(e)}function Ca(e,t,n){return e=xa(e),t=n?void 0:t,t===void 0?ha(e)?pa(e):fa(e):e.match(t)||[]}var Fa=Ca,Aa=1/0,Da="[object Symbol]",Ta=/^\s+/,Te="\\ud800-\\udfff",Lt="\\u0300-\\u036f\\ufe20-\\ufe23",Ot="\\u20d0-\\u20f0",jt="\\ufe0e\\ufe0f",Ia="["+Te+"]",fe="["+Lt+Ot+"]",he="\\ud83c[\\udffb-\\udfff]",Sa="(?:"+fe+"|"+he+")",Rt="[^"+Te+"]",Pt="(?:\\ud83c[\\udde6-\\uddff]){2}",$t="[\\ud800-\\udbff][\\udc00-\\udfff]",Nt="\\u200d",Ut=Sa+"?",Yt="["+jt+"]?",ka="(?:"+Nt+"(?:"+[Rt,Pt,$t].join("|")+")"+Yt+Ut+")*",_a=Yt+Ut+ka,Ma="(?:"+[Rt+fe+"?",fe,Pt,$t,Ia].join("|")+")",Ba=RegExp(he+"(?="+he+")|"+Ma+_a,"g"),wa=RegExp("["+Nt+Te+Lt+Ot+jt+"]"),La=typeof B=="object"&&B&&B.Object===Object&&B,Oa=typeof self=="object"&&self&&self.Object===Object&&self,ja=La||Oa||Function("return this")();function Ra(e){return e.split("")}function Pa(e,t,n,a){for(var s=e.length,o=n+-1;++o<s;)if(t(e[o],o,e))return o;return-1}function $a(e,t,n){if(t!==t)return Pa(e,Na,n);for(var a=n-1,s=e.length;++a<s;)if(e[a]===t)return a;return-1}function Na(e){return e!==e}function Ua(e,t){for(var n=-1,a=e.length;++n<a&&$a(t,e[n],0)>-1;);return n}function Ya(e){return wa.test(e)}function Ue(e){return Ya(e)?za(e):Ra(e)}function za(e){return e.match(Ba)||[]}var Ha=Object.prototype,Ga=Ha.toString,Ye=ja.Symbol,ze=Ye?Ye.prototype:void 0,He=ze?ze.toString:void 0;function Va(e,t,n){var a=-1,s=e.length;t<0&&(t=-t>s?0:s+t),n=n>s?s:n,n<0&&(n+=s),s=t>n?0:n-t>>>0,t>>>=0;for(var o=Array(s);++a<s;)o[a]=e[a+t];return o}function zt(e){if(typeof e=="string")return e;if(qa(e))return He?He.call(e):"";var t=e+"";return t=="0"&&1/e==-Aa?"-0":t}function Wa(e,t,n){var a=e.length;return n=n===void 0?a:n,!t&&n>=a?e:Va(e,t,n)}function Xa(e){return!!e&&typeof e=="object"}function qa(e){return typeof e=="symbol"||Xa(e)&&Ga.call(e)==Da}function Ka(e){return e==null?"":zt(e)}function Za(e,t,n){if(e=Ka(e),e&&(n||t===void 0))return e.replace(Ta,"");if(!e||!(t=zt(t)))return e;var a=Ue(e),s=Ua(a,Ue(t));return Wa(a,s).join("")}var Ja=Za,pe=1/0,Qa=9007199254740991,es=17976931348623157e292,Ge=NaN,ts="[object Symbol]",ns=/^\s+|\s+$/g,as=/^[-+]0x[0-9a-f]+$/i,ss=/^0b[01]+$/i,is=/^0o[0-7]+$/i,Ie="\\ud800-\\udfff",Ht="\\u0300-\\u036f\\ufe20-\\ufe23",Gt="\\u20d0-\\u20f0",Vt="\\ufe0e\\ufe0f",rs="["+Ie+"]",ge="["+Ht+Gt+"]",ve="\\ud83c[\\udffb-\\udfff]",os="(?:"+ge+"|"+ve+")",Wt="[^"+Ie+"]",Xt="(?:\\ud83c[\\udde6-\\uddff]){2}",qt="[\\ud800-\\udbff][\\udc00-\\udfff]",Kt="\\u200d",Zt=os+"?",Jt="["+Vt+"]?",ls="(?:"+Kt+"(?:"+[Wt,Xt,qt].join("|")+")"+Jt+Zt+")*",us=Jt+Zt+ls,cs="(?:"+[Wt+ge+"?",ge,Xt,qt,rs].join("|")+")",ye=RegExp(ve+"(?="+ve+")|"+cs+us,"g"),ms=RegExp("["+Kt+Ie+Ht+Gt+Vt+"]"),ds=parseInt,fs=typeof B=="object"&&B&&B.Object===Object&&B,hs=typeof self=="object"&&self&&self.Object===Object&&self,ps=fs||hs||Function("return this")(),gs=ys("length");function vs(e){return e.split("")}function ys(e){return function(t){return t==null?void 0:t[e]}}function Se(e){return ms.test(e)}function Qt(e){return Se(e)?bs(e):gs(e)}function Es(e){return Se(e)?xs(e):vs(e)}function bs(e){for(var t=ye.lastIndex=0;ye.test(e);)t++;return t}function xs(e){return e.match(ye)||[]}var Cs=Object.prototype,Fs=Cs.toString,Ve=ps.Symbol,As=Math.ceil,Ds=Math.floor,We=Ve?Ve.prototype:void 0,Xe=We?We.toString:void 0;function qe(e,t){var n="";if(!e||t<1||t>Qa)return n;do t%2&&(n+=e),t=Ds(t/2),t&&(e+=e);while(t);return n}function Ts(e,t,n){var a=-1,s=e.length;t<0&&(t=-t>s?0:s+t),n=n>s?s:n,n<0&&(n+=s),s=t>n?0:n-t>>>0,t>>>=0;for(var o=Array(s);++a<s;)o[a]=e[a+t];return o}function en(e){if(typeof e=="string")return e;if(tn(e))return Xe?Xe.call(e):"";var t=e+"";return t=="0"&&1/e==-pe?"-0":t}function Is(e,t,n){var a=e.length;return n=n===void 0?a:n,!t&&n>=a?e:Ts(e,t,n)}function Ss(e,t){t=t===void 0?" ":en(t);var n=t.length;if(n<2)return n?qe(t,e):t;var a=qe(t,As(e/Qt(t)));return Se(t)?Is(Es(a),0,e).join(""):a.slice(0,e)}function Ke(e){var t=typeof e;return!!e&&(t=="object"||t=="function")}function ks(e){return!!e&&typeof e=="object"}function tn(e){return typeof e=="symbol"||ks(e)&&Fs.call(e)==ts}function _s(e){if(!e)return e===0?e:0;if(e=Bs(e),e===pe||e===-pe){var t=e<0?-1:1;return t*es}return e===e?e:0}function Ms(e){var t=_s(e),n=t%1;return t===t?n?t-n:t:0}function Bs(e){if(typeof e=="number")return e;if(tn(e))return Ge;if(Ke(e)){var t=typeof e.valueOf=="function"?e.valueOf():e;e=Ke(t)?t+"":t}if(typeof e!="string")return e===0?e:+e;e=e.replace(ns,"");var n=ss.test(e);return n||is.test(e)?ds(e.slice(2),n?2:8):as.test(e)?Ge:+e}function ws(e){return e==null?"":en(e)}function Ls(e,t,n){e=ws(e),t=Ms(t);var a=t?Qt(e):0;return t&&a<t?e+Ss(t-a,n):e}var Os=Ls,js=(e,t,n,a)=>{const s=(e+(a||"")).toString().includes("%");if(typeof e=="string"?[e,t,n,a]=e.match(/(0?\.?\d{1,3})%?\b/g).map(Number):a!==void 0&&(a=parseFloat(a)),typeof e!="number"||typeof t!="number"||typeof n!="number"||e>255||t>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof a=="number"){if(!s&&a>=0&&a<=1)a=Math.round(255*a);else if(s&&a>=0&&a<=100)a=Math.round(255*a/100);else throw new TypeError(`Expected alpha value (${a}) as a fraction or percentage`);a=(a|256).toString(16).slice(1)}else a="";return(n|t<<8|e<<16|1<<24).toString(16).slice(1)+a};const H="a-f\\d",Rs=`#?[${H}]{3}[${H}]?`,Ps=`#?[${H}]{6}([${H}]{2})?`,$s=new RegExp(`[^#${H}]`,"gi"),Ns=new RegExp(`^${Rs}$|^${Ps}$`,"i");var Us=(e,t={})=>{if(typeof e!="string"||$s.test(e)||!Ns.test(e))throw new TypeError("Expected a valid hex string");e=e.replace(/^#/,"");let n=1;e.length===8&&(n=Number.parseInt(e.slice(6,8),16)/255,e=e.slice(0,6)),e.length===4&&(n=Number.parseInt(e.slice(3,4).repeat(2),16)/255,e=e.slice(0,3)),e.length===3&&(e=e[0]+e[0]+e[1]+e[1]+e[2]+e[2]);const a=Number.parseInt(e,16),s=a>>16,o=a>>8&255,r=a&255,i=typeof t.alpha=="number"?t.alpha:n;if(t.format==="array")return[s,o,r,i];if(t.format==="css"){const l=i===1?"":` / ${Number((i*100).toFixed(2))}%`;return`rgb(${s} ${o} ${r}${l})`}return{red:s,green:o,blue:r,alpha:i}},Ys=Un,zs=Fa,Hs=Ja,Gs=Os,Vs=js,nn=Us;const oe=.75,le=.25,ue=16777215,Ws=49979693;var Xs=function(e){return"#"+Zs(String(JSON.stringify(e)))};function qs(e){var t=zs(e),n=[];return t.forEach(function(a){var s=Ys(a);s&&n.push(nn(Hs(s,"#"),{format:"array"}))}),n}function Ks(e){var t=[0,0,0];return e.forEach(function(n){for(var a=0;a<3;a++)t[a]+=n[a]}),[t[0]/e.length,t[1]/e.length,t[2]/e.length]}function Zs(e){var t,n=qs(e);n.length>0&&(t=Ks(n));var a=1,s=0,o=1;if(e.length>0)for(var r=0;r<e.length;r++)e[r].charCodeAt(0)>s&&(s=e[r].charCodeAt(0)),o=parseInt(ue/s),a=(a+e[r].charCodeAt(0)*o*Ws)%ue;var i=(a*e.length%ue).toString(16);i=Gs(i,6,i);var l=nn(i,{format:"array"});return t?Vs(le*l[0]+oe*t[0],le*l[1]+oe*t[1],le*l[2]+oe*t[2]):i}const Js=Tn(Xs);function Qs(e){return[...ei].sort(()=>Math.random()-Math.random()).slice(0,e)}const ei=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function an(e){return[...ti].sort(()=>Math.random()-Math.random()).slice(0,e)}const ti=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];function ni(){const e=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],t=Array.from({length:256},(s,o)=>o).sort(()=>Math.random()-.5),n=[...t,...t];function a(s,o,r){return s[0]*o+s[1]*r}return function(o,r){const i=Math.floor(o)&255,l=Math.floor(r)&255;o-=Math.floor(o),r-=Math.floor(r);const c=o*o*o*(o*(o*6-15)+10),u=r*r*r*(r*(r*6-15)+10),f=n[i]+l,m=n[i+1]+l;return(1+(a(e[n[f]&7],o,r)*(1-c)+a(e[n[m]&7],o-1,r)*c)*(1-u)+(a(e[n[f+1]&7],o,r-1)*(1-c)+a(e[n[m+1]&7],o-1,r-1)*c)*u)/2}}function Ee(e,t,n,a,s){const o=ni(),r=Math.floor(e.x/I),i=Math.floor(e.y/I),l=Math.floor(a/4),c=.5,u=.005,f=.7;for(let d=i-l;d<=i+l;d++)for(let p=r-l;p<=r+l;p++)if(p>=0&&p<a&&d>=0&&d<s){let E=p,v=d;for(let F=0;F<t;F++)Math.random()<f&&(E+=Math.random()>.5?1:-1,v+=Math.random()>.5?1:-1);E=Math.max(0,Math.min(a-1,E)),v=Math.max(0,Math.min(s-1,v));const x=Math.sqrt((E-r)*(E-r)+(v-i)*(v-i))/l,y=o(p*u,d*u);if(x<1&&y>c+x*.01){const F=d*a+p;n[F].type=_.GROUND,n[F].depth=void 0,n[F].height=(1-x)*2*(y-c)}}const m=Math.min(Math.max(i*a+r,0),a);n[m].type=_.GROUND,n[m].depth=void 0,n[m].height=1}function ai(e,t){return{x:Math.floor(Math.random()*(e*.8)+e*.1)*I,y:Math.floor(Math.random()*(t*.8)+t*.1)*I}}function si(e,t,n,a){if(e.x<0||e.y<0||e.x>=n||e.y>=a)return!1;const s=Math.floor(n/(Math.sqrt(t.length+1)*2));return t.every(o=>Math.abs(e.x-o.x)>s||Math.abs(e.y-o.y)>s)}function ii(e,t,n){return t.every(a=>Math.sqrt(Math.pow(e.x-a.position.x,2)+Math.pow(e.y-a.position.y,2))>=n)}function ri(e,t,n,a,s){const o=[],r=[],i=[],l=L*3,c=an(e*2).filter(d=>d!==t),u=5,f=Qs(e*u*2),m=[];for(let d=0;d<e;d++){const p=`state-${d+1}`,E=d===0?t:c.pop(),v=oi(p,E,d===0);o.push(v),o.forEach(y=>{v.strategies[y.id]=g.NEUTRAL,y.strategies[p]=g.NEUTRAL});const x=li(m,n,a);m.push(x),Ee(x,n/2,s,n,a),ui(p,x,u,f,r,i,l,s,n,a),v.population=r.filter(y=>y.stateId===p).reduce((y,F)=>y+F.population,0)}return ci(s,r),{states:o,cities:r,launchSites:i}}function oi(e,t,n){return{id:e,name:t,color:Js(t),isPlayerControlled:n,strategies:{},lastStrategyUpdate:0,generalStrategy:n?void 0:[g.NEUTRAL,g.HOSTILE,g.FRIENDLY].sort(()=>Math.random()-.5)[0],population:0}}function li(e,t,n){let a,s=10;do if(a=ai(t,n),s--<=0)break;while(!si(a,e,t,n));return a}function ui(e,t,n,a,s,o,r,i,l,c){const u=[];for(let f=0;f<n;f++){const m=Ze(t,u,r,30*I);u.push({position:m}),s.push({id:`city-${s.length+1}`,stateId:e,name:a.pop(),position:m,population:Math.floor(Math.random()*3e3)+1e3}),Ee(m,2,i,l,c)}for(const f of s){const m=i.filter(d=>{const p=d.position.x-f.position.x,E=d.position.y-f.position.y;return Math.sqrt(p*p+E*E)<O});for(const d of m){d.cityId=f.id;const p=d.position.x-f.position.x,E=d.position.y-f.position.y,v=Math.sqrt(p*p+E*E);d.population=Math.max(0,O-v)/O*vt}f.population=m.reduce((d,p)=>d+p.population,0)}for(let f=0;f<4;f++){const m=Ze(t,u,r,15*I);u.push({position:m}),o.push({type:yt.LAUNCH_SITE,id:`launch-site-${o.length+1}`,stateId:e,position:m,mode:Math.random()>.5?S.DEFENCE:S.ATTACK}),Ee(m,1,i,l,c)}return u}function Ze(e,t,n,a){let s,o=10;do if(s={x:e.x+(Math.random()-.5)*a,y:e.y+(Math.random()-.5)*a},o--<=0)break;while(!ii(s,t,n));return s}function ci(e,t){const n=new Map(e.map(s=>[s.id,s])),a=[];for(t.forEach(s=>{e.filter(r=>r.cityId===s.id).forEach(r=>{r.stateId=s.stateId,a.push(r)})});a.length>0;){const s=a.splice(0,1)[0];mi(s,n).forEach(r=>{!r.stateId&&r.type===_.GROUND&&(r.stateId=s.stateId,a.push(r))})}}function mi(e,t){const n=[];return[{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:-1},{dx:0,dy:1}].forEach(({dx:s,dy:o})=>{const r=`${e.position.x+s*I},${e.position.y+o*I}`,i=t.get(r);i&&n.push(i)}),n}function di({playerStateName:e,numberOfStates:t=3}){const n=Math.max(200,Math.ceil(Math.sqrt(t)*10)),a=n,s=Rn(n,a),{states:o,cities:r,launchSites:i}=ri(t,e,n,a,s);return Pn(s,n,a),{timestamp:0,states:o,cities:r,launchSites:i,sectors:s,missiles:[],explosions:[],interceptors:[]}}function k(e,t,n,a){return Math.sqrt(Math.pow(n-e,2)+Math.pow(a-t,2))}function fi(e){var n;const t=e.sectors.filter(a=>a.cityId&&a.population>0);for(const a of e.states){const s=e.cities.filter(u=>u.stateId===a.id),o=e.launchSites.filter(u=>u.stateId===a.id),r=e.cities.filter(u=>a.strategies[u.stateId]===g.HOSTILE&&u.stateId!==a.id&&u.population>0).map(u=>({...u,isCity:!0})),i=e.missiles.filter(u=>a.strategies[u.stateId]!==g.FRIENDLY&&u.stateId!==a.id),l=e.launchSites.filter(u=>a.strategies[u.stateId]===g.HOSTILE&&u.stateId!==a.id).map(u=>({...u,isCity:!1})),c=i.filter(u=>s.some(f=>be(u.target,f.position,L+O))||o.some(f=>be(u.target,f.position,L))).filter(u=>(e.timestamp-u.launchTimestamp)/(u.targetTimestamp-u.launchTimestamp)>.5);for(const u of e.launchSites.filter(f=>f.stateId===a.id)){if(u.nextLaunchTarget)continue;if(r.length===0&&l.length===0&&i.length===0)break;if(c.length===0&&u.mode===S.DEFENCE||c.length>0&&u.mode===S.ATTACK){u.modeChangeTimestamp||(u.modeChangeTimestamp=e.timestamp);continue}const f=Je(c.map(v=>({...v,isCity:!1})),u.position),m=e.missiles.filter(v=>v.stateId===a.id),d=e.interceptors.filter(v=>v.stateId===a.id),p=d.filter(v=>!v.targetMissileId&&u.id===v.launchSiteId),E=pi(d,f).filter(([,v])=>v<o.length);if(u.mode===S.DEFENCE&&E.length>0){const v=E[0][0];p.length>0?p[0].targetMissileId=v:u.nextLaunchTarget={type:"missile",missileId:v}}else if(u.mode===S.ATTACK){const v=hi(Je([...l,...r],u.position),m),x=(n=v==null?void 0:v[0])==null?void 0:n[0];if(x!=null&&x.position&&(x!=null&&x.isCity)){const y=gi(x,t);u.nextLaunchTarget={type:"position",position:y||{x:x.position.x+(Math.random()-Math.random())*O,y:x.position.y+(Math.random()-Math.random())*O}}}else u.nextLaunchTarget=x!=null&&x.position?{type:"position",position:x==null?void 0:x.position}:void 0}}}return e}function be(e,t,n){return k(e.x,e.y,t.x,t.y)<=n}function Je(e,t){return e.sort((n,a)=>k(n.position.x,n.position.y,t.x,t.y)-k(a.position.x,a.position.y,t.x,t.y))}function hi(e,t){const n=new Map;for(const a of e)n.set(a,t.filter(s=>be(s.target,a.position,L)).length);return Array.from(n).sort((a,s)=>a[1]-s[1])}function pi(e,t){const n=new Map;for(const a of t)n.set(a.id,0);for(const a of e)a.targetMissileId&&n.set(a.targetMissileId,(n.get(a.targetMissileId)??0)+1);return Array.from(n).sort((a,s)=>a[1]-s[1])}function gi(e,t){const n=t.filter(s=>s.cityId===e.id);return!n||n.length===0?null:n[Math.floor(Math.random()*n.length)].position}function vi(e){var t,n;for(const a of e.missiles.filter(s=>s.launchTimestamp===e.timestamp)){const s=e.states.find(r=>r.id===a.stateId),o=((t=e.cities.find(r=>k(r.position.x,r.position.y,a.target.x,a.target.y)<=L+O))==null?void 0:t.stateId)||((n=e.launchSites.find(r=>k(r.position.x,r.position.y,a.target.x,a.target.y)<=L))==null?void 0:n.stateId);if(s&&o&&s.id!==o){s.strategies[o]!==g.HOSTILE&&(s.strategies[o]=g.HOSTILE);const r=e.states.find(i=>i.id===o);r&&r.strategies[s.id]!==g.HOSTILE&&(r.strategies[s.id]=g.HOSTILE,e.states.forEach(i=>{i.id!==r.id&&i.strategies[r.id]===g.FRIENDLY&&r.strategies[i.id]===g.FRIENDLY&&(i.strategies[s.id]=g.HOSTILE,s.strategies[i.id]=g.HOSTILE)}))}}for(const a of e.states.filter(s=>!s.isPlayerControlled))yi(a,e);return e}function yi(e,t){if(e.lastStrategyUpdate&&t.timestamp-e.lastStrategyUpdate<jn)return;e.lastStrategyUpdate=t.timestamp;const n=t.states.filter(r=>r.id!==e.id),a=n.filter(r=>e.strategies[r.id]===g.FRIENDLY&&r.strategies[e.id]===g.FRIENDLY);e.strategies={...e.strategies},n.forEach(r=>{r.strategies[e.id]===g.FRIENDLY&&e.strategies[r.id]===g.NEUTRAL&&(e.generalStrategy!==g.HOSTILE?e.strategies[r.id]=g.FRIENDLY:r.strategies[e.id]=g.NEUTRAL)}),n.forEach(r=>{r.strategies[e.id]===g.NEUTRAL&&e.strategies[r.id]===g.HOSTILE&&(Qe(e,r,a,t)?e.strategies[r.id]=g.NEUTRAL:r.strategies[e.id]=g.HOSTILE)});const s=n.filter(r=>Object.values(r.strategies).every(i=>i!==g.HOSTILE)&&r.generalStrategy!==g.HOSTILE);if(s.length>0&&e.generalStrategy===g.FRIENDLY){const r=s[Math.floor(Math.random()*s.length)];e.strategies[r.id]=g.FRIENDLY}a.forEach(r=>{n.forEach(i=>{i.strategies[r.id]===g.HOSTILE&&e.strategies[i.id]!==g.HOSTILE&&(e.strategies[i.id]=g.HOSTILE)})}),n.filter(r=>r.strategies[e.id]!==g.FRIENDLY&&e.strategies[r.id]!==g.FRIENDLY).forEach(r=>{if(Qe(r,e,a,t)){const i=t.launchSites.filter(l=>l.stateId===e.id&&!l.lastLaunchTimestamp);if(i.length>0){const l=i[Math.floor(Math.random()*i.length)],c=[...t.cities.filter(u=>u.stateId===r.id),...t.launchSites.filter(u=>u.stateId===r.id)];if(c.length>0){const u=c[Math.floor(Math.random()*c.length)];l.nextLaunchTarget={type:"position",position:u.position}}}}})}function Qe(e,t,n,a){const s=a.states.filter(l=>e.strategies[l.id]===g.FRIENDLY&&l.strategies[e.id]===g.FRIENDLY&&l.id!==e.id),o=a.launchSites.filter(l=>l.stateId===e.id||s.some(c=>c.id===l.stateId)),r=a.launchSites.filter(l=>l.stateId===t.id||n.some(c=>c.id===l.stateId));return o.length<r.length?!0:a.missiles.some(l=>a.cities.some(c=>c.stateId===e.id&&k(c.position.x,c.position.y,l.target.x,l.target.y)<=L)||a.launchSites.some(c=>c.stateId===e.id&&k(c.position.x,c.position.y,l.target.x,l.target.y)<=L))}function Ei(e,t){for(;t>0;){const n=bi(e,t>X?X:t);t=t>X?t-X:0,e=n}return e}function bi(e,t){var o,r;const n=e.timestamp+t;let a={timestamp:n,states:e.states,cities:e.cities,launchSites:e.launchSites,missiles:e.missiles,interceptors:e.interceptors,explosions:e.explosions,sectors:e.sectors};for(const i of a.missiles){const l=(n-i.launchTimestamp)/(i.targetTimestamp-i.launchTimestamp);i.position={x:i.launch.x+(i.target.x-i.launch.x)*l,y:i.launch.y+(i.target.y-i.launch.y)*l}}for(const i of a.interceptors){const l=a.missiles.find(d=>d.id===i.targetMissileId);l||(i.targetMissileId=void 0);const c=l?l.position.x-i.position.x:Math.cos(i.direction),u=l?l.position.y-i.position.y:Math.sin(i.direction),f=Math.sqrt(c*c+u*u);if(i.direction=Math.atan2(u,c),l&&f<=J*t)i.position={...l.position};else{const d=J*t/f;i.position={x:i.position.x+c*d,y:i.position.y+u*d}}i.tail=[...i.tail.slice(-100),{timestamp:n,position:i.position}],J*(n-i.launchTimestamp)>i.maxRange&&(a.interceptors=a.interceptors.filter(d=>d.id!==i.id))}for(const i of a.interceptors){const l=a.missiles.find(c=>c.id===i.targetMissileId);l&&k(i.position.x,i.position.y,l.position.x,l.position.y)<_n&&(a.missiles=a.missiles.filter(u=>u.id!==l.id),a.interceptors=a.interceptors.filter(u=>u.id!==i.id))}for(const i of e.missiles.filter(l=>l.targetTimestamp<=n)){const l={id:`explosion-${Math.random()}`,missileId:i.id,startTimestamp:i.targetTimestamp,endTimestamp:i.targetTimestamp+Bn,position:i.target,radius:L};a.explosions.push(l);for(const m of e.sectors.filter(d=>k(d.position.x,d.position.y,l.position.x,l.position.y)<=l.radius))if(m.population){const d=Math.max(Ln,m.population*wn);m.population=Math.max(0,m.population-d)}const c=e.missiles.filter(m=>m.id!==l.missileId&&m.launchTimestamp<=l.startTimestamp&&m.targetTimestamp>=l.startTimestamp).filter(m=>k(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius),u=e.interceptors.filter(m=>m.launchTimestamp<=l.startTimestamp).filter(m=>k(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius);for(const m of c)m.targetTimestamp=l.startTimestamp;for(const m of u)a.interceptors=a.interceptors.filter(d=>d.id!==m.id);const f=e.launchSites.filter(m=>k(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius);for(const m of f)a.launchSites=e.launchSites.filter(d=>d.id!==m.id)}a.explosions=a.explosions.filter(i=>i.endTimestamp>=n),a.missiles=a.missiles.filter(i=>i.targetTimestamp>n);for(const i of a.launchSites)i.modeChangeTimestamp&&n>=i.modeChangeTimestamp+me&&(i.mode=i.mode===S.ATTACK?S.DEFENCE:S.ATTACK,i.modeChangeTimestamp=void 0);for(const i of e.launchSites){if(i.nextLaunchTarget){if(i.lastLaunchTimestamp&&n-i.lastLaunchTimestamp<(i.mode===S.ATTACK?de:On))continue}else continue;if(i.mode===S.ATTACK&&((o=i.nextLaunchTarget)==null?void 0:o.type)==="position"){const l={id:Math.random()+"",stateId:i.stateId,launchSiteId:i.id,launch:i.position,launchTimestamp:n,position:i.position,target:i.nextLaunchTarget.position,targetTimestamp:n+k(i.position.x,i.position.y,i.nextLaunchTarget.position.x,i.nextLaunchTarget.position.y)/gt};a.missiles.push(l)}else if(i.mode===S.DEFENCE&&((r=i.nextLaunchTarget)==null?void 0:r.type)==="missile"){const l=i.nextLaunchTarget.missileId;if(l){const c={id:Math.random()+"",stateId:i.stateId,launchSiteId:i.id,launch:i.position,launchTimestamp:n,position:i.position,direction:0,tail:[],targetMissileId:l,maxRange:De};a.interceptors.push(c)}}i.lastLaunchTimestamp=n,i.nextLaunchTarget=void 0}const s=a.sectors.reduce((i,l)=>(l.cityId&&(i[l.cityId]=i[l.cityId]?i[l.cityId]+(l.population??0):l.population??0),i),{});for(const i of a.cities)i.population=s[i.id];return a.states=a.states.map(i=>{const l=a.cities.filter(c=>c.stateId===i.id).reduce((c,u)=>c+u.population,0);return{...i,population:l}}),a=fi(a),a=vi(a),a}function xi(e){const[t,n]=b.useState(()=>di({playerStateName:e,numberOfStates:6})),a=b.useCallback((s,o)=>n(Ei(s,o)),[]);return{worldState:t,updateWorldState:a,setWorldState:n}}const sn={x:0,y:0,pointingObjects:[]},Ci=(e,t)=>t.type==="move"?{x:t.x,y:t.y,pointingObjects:e.pointingObjects}:t.type==="point"&&!e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:[...e.pointingObjects,t.object]}:t.type==="unpoint"&&e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:e.pointingObjects.filter(n=>n.id!==t.object.id)}:e,Fi=b.createContext(sn),ke=b.createContext(()=>{});function Ai({children:e}){const[t,n]=b.useReducer(Ci,sn);return h.jsx(Fi.Provider,{value:t,children:h.jsx(ke.Provider,{value:n,children:e})})}function Di(){const e=b.useContext(ke);return(t,n)=>e({type:"move",x:t,y:n})}function _e(){const e=b.useContext(ke);return[t=>e({type:"point",object:t}),t=>e({type:"unpoint",object:t})]}const Me={},Ti=(e,t)=>t.type==="clear"?Me:t.type==="set"?{...e,selectedObject:t.object}:e,rn=b.createContext(Me),on=b.createContext(()=>{});function Ii({children:e}){const[t,n]=b.useReducer(Ti,Me);return h.jsx(rn.Provider,{value:t,children:h.jsx(on.Provider,{value:n,children:e})})}function Si(e){var a;const t=b.useContext(on);return[((a=b.useContext(rn).selectedObject)==null?void 0:a.id)===e.id,()=>t({type:"set",object:e})]}function G(e,t){const n=new CustomEvent(e,{bubbles:!0,detail:t});document.dispatchEvent(n)}function se(e,t){b.useEffect(()=>{const n=a=>{t(a.detail)};return document.addEventListener(e,n,!1),()=>{document.removeEventListener(e,n,!1)}},[e,t])}const ki=Y.memo(({sectors:e,states:t})=>{const n=b.useRef(null),[a,s]=_e(),[o,r]=b.useState(0);return se("cityDamage",()=>{r(o+1)}),b.useEffect(()=>{const i=n.current,l=i==null?void 0:i.getContext("2d");if(!i||!l)return;const c=Math.min(...e.map(y=>y.rect.left)),u=Math.min(...e.map(y=>y.rect.top)),f=Math.max(...e.map(y=>y.rect.right)),m=Math.max(...e.map(y=>y.rect.bottom)),d=f-c,p=m-u;i.width=d,i.height=p,i.style.width=`${d}px`,i.style.height=`${p}px`;const E=Math.max(...e.filter(y=>y.type===_.WATER).map(y=>y.depth||0)),v=Math.max(...e.filter(y=>y.type===_.GROUND).map(y=>y.height||0)),x=new Map(t.map(y=>[y.id,y.color]));l.clearRect(0,0,d,p),e.forEach(y=>{const{fillStyle:F,drawSector:j}=_i(y,E,v,x);l.fillStyle=F,j(l,y.rect,c,u)})},[o]),b.useEffect(()=>{const i=n.current;let l;const c=u=>{const f=i==null?void 0:i.getBoundingClientRect(),m=u.clientX-((f==null?void 0:f.left)||0),d=u.clientY-((f==null?void 0:f.top)||0),p=e.find(E=>m>=E.rect.left&&m<=E.rect.right&&d>=E.rect.top&&d<=E.rect.bottom);p&&(l&&s(l),a(p),l=p)};return i==null||i.addEventListener("mousemove",c),()=>{i==null||i.removeEventListener("mousemove",c)}},[e,a,s]),h.jsx("canvas",{ref:n,style:{opacity:.5}})});function _i(e,t,n,a){const s=Mi(e,t,n),o=e.stateId?a.get(e.stateId):void 0;return{fillStyle:s,drawSector:(r,i,l,c)=>{r.fillStyle=s,r.fillRect(i.left-l,i.top-c,i.right-i.left,i.bottom-i.top),o&&(r.fillStyle=`${o}80`,r.fillRect(i.left-l,i.top-c,i.right-i.left,i.bottom-i.top)),e.cityId&&e.population>0&&wi(r,i,l,c)}}}function Mi(e,t,n){switch(e.type){case _.GROUND:return e.cityId?Bi(e):Li(e.height||0,n);case _.WATER:return Oi(e.depth||0,t);default:return"rgb(0, 34, 93)"}}function Bi(e){if(e.population===0)return"rgba(0,0,0,0.7)";const t=e.population?Math.min(e.population/vt,1):0,n=e.height?e.height/100:0,s=[200,200,200].map(o=>o-50*t+20*n);return`rgb(${s[0]}, ${s[1]}, ${s[2]})`}function wi(e,t,n,a){e.fillStyle="rgba(0, 0, 0, 0.2)",e.fillRect(t.left-n+2,t.top-a+2,t.right-t.left-4,t.bottom-t.top-4),e.fillStyle="rgba(255, 255, 255, 0.6)",e.fillRect(t.left-n+4,t.top-a+4,t.right-t.left-8,t.bottom-t.top-8)}function Li(e,t){const n=e/t;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const a=Math.round(34+67*((n-.5)/.3)),s=Math.round(100+-33*((n-.5)/.3)),o=Math.round(34+-1*((n-.5)/.3));return`rgb(${a}, ${s}, ${o})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}function Oi(e,t){const n=e/t,a=Math.round(0+34*(1-n)),s=Math.round(137+-103*n),o=Math.round(178+-85*n);return`rgb(${a}, ${s}, ${o})`}function ji({state:e,sectors:t}){const n=Y.useMemo(()=>{const a=t.filter(s=>s.stateId===e.id);return Pi(a)},[]);return h.jsx(h.Fragment,{children:h.jsx(Ri,{style:{transform:`translate(${n.x}px, ${n.y}px) translate(-50%, -50%)`,color:e.color},children:e.name})})}const Ri=C.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;function Pi(e){if(e.length===0)return{x:0,y:0};const t=e.reduce((n,a)=>({x:n.x+(a.rect.left+a.rect.right)/2,y:n.y+(a.rect.top+a.rect.bottom)/2}),{x:0,y:0});return{x:t.x/e.length,y:t.y/e.length}}function ln(e){return Object.fromEntries(e.states.map(t=>[t.id,t.population]))}function ee(e){return e>=1e3?`${(e/1e3).toFixed(1)}M`:`${e.toFixed(0)}K`}function $i({city:e}){const[t,n]=_e(),a=e.population;if(!a)return null;const s=ee(a);return h.jsxs(Ni,{onMouseEnter:()=>t(e),onMouseLeave:()=>n(e),style:{"--x":e.position.x,"--y":e.position.y},children:[h.jsx("span",{children:e.name}),h.jsxs(Ui,{children:[s," population"]})]})}const Ni=C.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`,Ui=C.div`
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
`;function Yi({launchSite:e,worldTimestamp:t,isPlayerControlled:n}){const[a,s]=Si(e),[o,r]=_e(),i=e.lastLaunchTimestamp&&e.lastLaunchTimestamp+de>t,l=i?(t-e.lastLaunchTimestamp)/de:0,c=e.modeChangeTimestamp&&t<e.modeChangeTimestamp+me,u=c?(t-e.modeChangeTimestamp)/me:0;return h.jsx(zi,{onMouseEnter:()=>o(e),onMouseLeave:()=>r(e),onClick:()=>n&&s(),style:{"--x":e.position.x,"--y":e.position.y,"--cooldown-progress":l,"--mode-change-progress":u},"data-selected":a,"data-cooldown":i,"data-mode":e.mode,"data-changing-mode":c,children:h.jsx(Hi,{children:e.mode===S.ATTACK?"A":"D"})})}const zi=C.div`
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
`,Hi=C.span`
  z-index: 1;
`;function un(e,t){t===void 0&&(t=!0);var n=b.useRef(null),a=b.useRef(!1),s=b.useRef(e);s.current=e;var o=b.useCallback(function(i){a.current&&(s.current(i),n.current=requestAnimationFrame(o))},[]),r=b.useMemo(function(){return[function(){a.current&&(a.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){a.current||(a.current=!0,n.current=requestAnimationFrame(o))},function(){return a.current}]},[]);return b.useEffect(function(){return t&&r[1](),r[0]},[]),r}function Gi(e,t,n){if(t.startTimestamp>n||t.endTimestamp<n)return;const a=Math.pow(Math.min(Math.max(0,(n-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);e.fillStyle=`rgb(${255*a}, ${255*(1-a)}, 0)`,e.beginPath(),e.arc(t.position.x,t.position.y,t.radius*a,0,2*Math.PI),e.fill()}function Vi(e,t,n){t.launchTimestamp>n||t.targetTimestamp<n||(e.fillStyle="rgb(255, 0, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,2,0,2*Math.PI),e.fill())}function Wi(e,t){e.fillStyle="rgb(0, 255, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,1,0,2*Math.PI),e.fill()}function et(e,t,n){if(!(t.launchTimestamp>n))if("targetTimestamp"in t){if(t.targetTimestamp<n)return;Xi(e,t,n)}else qi(e,t,n)}function Xi(e,t,n){const a=Math.min(Math.max(n-5,t.launchTimestamp)-t.launchTimestamp,t.targetTimestamp-t.launchTimestamp),s=t.targetTimestamp-t.launchTimestamp,o=s>0?a/s:0,r=t.launch.x+(t.position.x-t.launch.x)*o,i=t.launch.y+(t.position.y-t.launch.y)*o,l={x:r,y:i},c=e.createLinearGradient(l.x,l.y,t.position.x,t.position.y);c.addColorStop(0,"rgba(255, 255, 255, 0)"),c.addColorStop(1,"rgba(255, 255, 255, 0.5)"),e.strokeStyle=c,e.lineWidth=1,e.beginPath(),e.moveTo(l.x,l.y),e.lineTo(t.position.x,t.position.y),e.stroke()}function qi(e,t,n){const s=Math.max(n-5,t.launchTimestamp),o=t.tail.filter(i=>i.timestamp>=s);if(o.length<2)return;e.beginPath(),e.moveTo(o[0].position.x,o[0].position.y);for(let i=1;i<o.length;i++)e.lineTo(o[i].position.x,o[i].position.y);e.lineTo(t.position.x,t.position.y);const r=e.createLinearGradient(o[0].position.x,o[0].position.y,t.position.x,t.position.y);r.addColorStop(0,"rgba(0, 255, 0, 0)"),r.addColorStop(1,"rgba(0, 255, 0, 0.5)"),e.strokeStyle=r,e.lineWidth=1,e.stroke()}function Ki(e,t){if(Math.sqrt(Math.pow(t.position.x-t.launch.x,2)+Math.pow(t.position.y-t.launch.y,2))>De)for(let r=0;r<5;r++){const i=Math.PI*2/5*r,l=t.position.x+Math.cos(i)*3,c=t.position.y+Math.sin(i)*3;e.fillStyle="rgba(0, 255, 0, 0.5)",e.beginPath(),e.arc(l,c,1,0,2*Math.PI),e.fill()}}function Zi({state:e}){const t=b.useRef(null);return b.useLayoutEffect(()=>{const a=t.current;if(!a)return;const s=Math.min(...e.sectors.map(u=>u.rect.left)),o=Math.min(...e.sectors.map(u=>u.rect.top)),r=Math.max(...e.sectors.map(u=>u.rect.right)),i=Math.max(...e.sectors.map(u=>u.rect.bottom)),l=r-s,c=i-o;a.width=l,a.height=c,a.style.width=`${l}px`,a.style.height=`${c}px`},[e.sectors]),un(()=>{const a=t.current;if(!a)return;const s=a.getContext("2d");s&&(s.clearRect(0,0,a.width,a.height),e.missiles.forEach(o=>{et(s,o,e.timestamp)}),e.interceptors.forEach(o=>{et(s,o,e.timestamp)}),e.missiles.filter(o=>o.launchTimestamp<e.timestamp&&o.targetTimestamp>e.timestamp).forEach(o=>{Vi(s,o,e.timestamp)}),e.interceptors.filter(o=>o.launchTimestamp<e.timestamp).forEach(o=>{Wi(s,o),J*(e.timestamp-o.launchTimestamp+1)>De&&Ki(s,o)}),e.explosions.filter(o=>o.startTimestamp<e.timestamp&&o.endTimestamp>e.timestamp).forEach(o=>{Gi(s,o,e.timestamp)}))}),h.jsx(Ji,{ref:t})}const Ji=C.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function Qi({state:e}){const t=Di();return h.jsxs(er,{onMouseMove:n=>t(n.clientX,n.clientY),onClick:()=>G("world-click"),children:[h.jsx(ki,{sectors:e.sectors,states:e.states}),e.states.map(n=>h.jsx(ji,{state:n,cities:e.cities,launchSites:e.launchSites,sectors:e.sectors},n.id)),e.cities.map(n=>h.jsx($i,{city:n},n.id)),e.launchSites.map(n=>{var a;return h.jsx(Yi,{launchSite:n,worldTimestamp:e.timestamp,isPlayerControlled:n.stateId===((a=e.states.find(s=>s.isPlayerControlled))==null?void 0:a.id)},n.id)}),h.jsx(Zi,{state:e})]})}const er=C.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function tr(e,t,n){return Math.max(t,Math.min(e,n))}const A={toVector(e,t){return e===void 0&&(e=t),Array.isArray(e)?e:[e,e]},add(e,t){return[e[0]+t[0],e[1]+t[1]]},sub(e,t){return[e[0]-t[0],e[1]-t[1]]},addTo(e,t){e[0]+=t[0],e[1]+=t[1]},subTo(e,t){e[0]-=t[0],e[1]-=t[1]}};function tt(e,t,n){return t===0||Math.abs(t)===1/0?Math.pow(e,n*5):e*t*n/(t+n*e)}function nt(e,t,n,a=.15){return a===0?tr(e,t,n):e<t?-tt(t-e,n-t,a)+t:e>n?+tt(e-n,n-t,a)+n:e}function nr(e,[t,n],[a,s]){const[[o,r],[i,l]]=e;return[nt(t,o,r,a),nt(n,i,l,s)]}function ar(e,t){if(typeof e!="object"||e===null)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var a=n.call(e,t||"default");if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}function sr(e){var t=ar(e,"string");return typeof t=="symbol"?t:String(t)}function T(e,t,n){return t=sr(t),t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function at(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);t&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(e,s).enumerable})),n.push.apply(n,a)}return n}function D(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]!=null?arguments[t]:{};t%2?at(Object(n),!0).forEach(function(a){T(e,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):at(Object(n)).forEach(function(a){Object.defineProperty(e,a,Object.getOwnPropertyDescriptor(n,a))})}return e}const cn={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function st(e){return e?e[0].toUpperCase()+e.slice(1):""}const ir=["enter","leave"];function rr(e=!1,t){return e&&!ir.includes(t)}function or(e,t="",n=!1){const a=cn[e],s=a&&a[t]||t;return"on"+st(e)+st(s)+(rr(n,s)?"Capture":"")}const lr=["gotpointercapture","lostpointercapture"];function ur(e){let t=e.substring(2).toLowerCase();const n=!!~t.indexOf("passive");n&&(t=t.replace("passive",""));const a=lr.includes(t)?"capturecapture":"capture",s=!!~t.indexOf(a);return s&&(t=t.replace("capture","")),{device:t,capture:s,passive:n}}function cr(e,t=""){const n=cn[e],a=n&&n[t]||t;return e+a}function ie(e){return"touches"in e}function mn(e){return ie(e)?"touch":"pointerType"in e?e.pointerType:"mouse"}function mr(e){return Array.from(e.touches).filter(t=>{var n,a;return t.target===e.currentTarget||((n=e.currentTarget)===null||n===void 0||(a=n.contains)===null||a===void 0?void 0:a.call(n,t.target))})}function dr(e){return e.type==="touchend"||e.type==="touchcancel"?e.changedTouches:e.targetTouches}function dn(e){return ie(e)?dr(e)[0]:e}function xe(e,t){try{const n=t.clientX-e.clientX,a=t.clientY-e.clientY,s=(t.clientX+e.clientX)/2,o=(t.clientY+e.clientY)/2,r=Math.hypot(n,a);return{angle:-(Math.atan2(n,a)*180)/Math.PI,distance:r,origin:[s,o]}}catch{}return null}function fr(e){return mr(e).map(t=>t.identifier)}function it(e,t){const[n,a]=Array.from(e.touches).filter(s=>t.includes(s.identifier));return xe(n,a)}function ce(e){const t=dn(e);return ie(e)?t.identifier:t.pointerId}function z(e){const t=dn(e);return[t.clientX,t.clientY]}const rt=40,ot=800;function fn(e){let{deltaX:t,deltaY:n,deltaMode:a}=e;return a===1?(t*=rt,n*=rt):a===2&&(t*=ot,n*=ot),[t,n]}function hr(e){var t,n;const{scrollX:a,scrollY:s,scrollLeft:o,scrollTop:r}=e.currentTarget;return[(t=a??o)!==null&&t!==void 0?t:0,(n=s??r)!==null&&n!==void 0?n:0]}function pr(e){const t={};if("buttons"in e&&(t.buttons=e.buttons),"shiftKey"in e){const{shiftKey:n,altKey:a,metaKey:s,ctrlKey:o}=e;Object.assign(t,{shiftKey:n,altKey:a,metaKey:s,ctrlKey:o})}return t}function te(e,...t){return typeof e=="function"?e(...t):e}function gr(){}function vr(...e){return e.length===0?gr:e.length===1?e[0]:function(){let t;for(const n of e)t=n.apply(this,arguments)||t;return t}}function lt(e,t){return Object.assign({},t,e||{})}const yr=32;class hn{constructor(t,n,a){this.ctrl=t,this.args=n,this.key=a,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(t){this.ctrl.state[this.key]=t}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:t,shared:n,ingKey:a,args:s}=this;n[a]=t._active=t.active=t._blocked=t._force=!1,t._step=[!1,!1],t.intentional=!1,t._movement=[0,0],t._distance=[0,0],t._direction=[0,0],t._delta=[0,0],t._bounds=[[-1/0,1/0],[-1/0,1/0]],t.args=s,t.axis=void 0,t.memo=void 0,t.elapsedTime=t.timeDelta=0,t.direction=[0,0],t.distance=[0,0],t.overflow=[0,0],t._movementBound=[!1,!1],t.velocity=[0,0],t.movement=[0,0],t.delta=[0,0],t.timeStamp=0}start(t){const n=this.state,a=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=t.target,n.currentTarget=t.currentTarget,n.lastOffset=a.from?te(a.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=t.timeStamp)}computeValues(t){const n=this.state;n._values=t,n.values=this.config.transform(t)}computeInitial(){const t=this.state;t._initial=t._values,t.initial=t.values}compute(t){const{state:n,config:a,shared:s}=this;n.args=this.args;let o=0;if(t&&(n.event=t,a.preventDefault&&t.cancelable&&n.event.preventDefault(),n.type=t.type,s.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,s.locked=!!document.pointerLockElement,Object.assign(s,pr(t)),s.down=s.pressed=s.buttons%2===1||s.touches>0,o=t.timeStamp-n.timeStamp,n.timeStamp=t.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const R=n._delta.map(Math.abs);A.addTo(n._distance,R)}this.axisIntent&&this.axisIntent(t);const[r,i]=n._movement,[l,c]=a.threshold,{_step:u,values:f}=n;if(a.hasCustomTransform?(u[0]===!1&&(u[0]=Math.abs(r)>=l&&f[0]),u[1]===!1&&(u[1]=Math.abs(i)>=c&&f[1])):(u[0]===!1&&(u[0]=Math.abs(r)>=l&&Math.sign(r)*l),u[1]===!1&&(u[1]=Math.abs(i)>=c&&Math.sign(i)*c)),n.intentional=u[0]!==!1||u[1]!==!1,!n.intentional)return;const m=[0,0];if(a.hasCustomTransform){const[R,Dn]=f;m[0]=u[0]!==!1?R-u[0]:0,m[1]=u[1]!==!1?Dn-u[1]:0}else m[0]=u[0]!==!1?r-u[0]:0,m[1]=u[1]!==!1?i-u[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(m);const d=n.offset,p=n._active&&!n._blocked||n.active;p&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=s[this.ingKey]=n._active,t&&(n.first&&("bounds"in a&&(n._bounds=te(a.bounds,n)),this.setup&&this.setup()),n.movement=m,this.computeOffset()));const[E,v]=n.offset,[[x,y],[F,j]]=n._bounds;n.overflow=[E<x?-1:E>y?1:0,v<F?-1:v>j?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const An=n._active?a.rubberband||[0,0]:[0,0];if(n.offset=nr(n._bounds,n.offset,An),n.delta=A.sub(n.offset,d),this.computeMovement(),p&&(!n.last||o>yr)){n.delta=A.sub(n.offset,d);const R=n.delta.map(Math.abs);A.addTo(n.distance,R),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&o>0&&(n.velocity=[R[0]/o,R[1]/o],n.timeDelta=o)}}emit(){const t=this.state,n=this.shared,a=this.config;if(t._active||this.clean(),(t._blocked||!t.intentional)&&!t._force&&!a.triggerAllEvents)return;const s=this.handler(D(D(D({},n),t),{},{[this.aliasKey]:t.values}));s!==void 0&&(t.memo=s)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function Er([e,t],n){const a=Math.abs(e),s=Math.abs(t);if(a>s&&a>n)return"x";if(s>a&&s>n)return"y"}class V extends hn{constructor(...t){super(...t),T(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=A.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=A.sub(this.state.offset,this.state.lastOffset)}axisIntent(t){const n=this.state,a=this.config;if(!n.axis&&t){const s=typeof a.axisThreshold=="object"?a.axisThreshold[mn(t)]:a.axisThreshold;n.axis=Er(n._movement,s)}n._blocked=(a.lockDirection||!!a.axis)&&!n.axis||!!a.axis&&a.axis!==n.axis}restrictToAxis(t){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":t[1]=0;break;case"y":t[0]=0;break}}}const br=e=>e,ut=.15,pn={enabled(e=!0){return e},eventOptions(e,t,n){return D(D({},n.shared.eventOptions),e)},preventDefault(e=!1){return e},triggerAllEvents(e=!1){return e},rubberband(e=0){switch(e){case!0:return[ut,ut];case!1:return[0,0];default:return A.toVector(e)}},from(e){if(typeof e=="function")return e;if(e!=null)return A.toVector(e)},transform(e,t,n){const a=e||n.shared.transform;return this.hasCustomTransform=!!a,a||br},threshold(e){return A.toVector(e,0)}},xr=0,P=D(D({},pn),{},{axis(e,t,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(e=xr){return e},bounds(e={}){if(typeof e=="function")return o=>P.bounds(e(o));if("current"in e)return()=>e.current;if(typeof HTMLElement=="function"&&e instanceof HTMLElement)return e;const{left:t=-1/0,right:n=1/0,top:a=-1/0,bottom:s=1/0}=e;return[[t,n],[a,s]]}}),ct={ArrowRight:(e,t=1)=>[e*t,0],ArrowLeft:(e,t=1)=>[-1*e*t,0],ArrowUp:(e,t=1)=>[0,-1*e*t],ArrowDown:(e,t=1)=>[0,e*t]};class Cr extends V{constructor(...t){super(...t),T(this,"ingKey","dragging")}reset(){super.reset();const t=this.state;t._pointerId=void 0,t._pointerActive=!1,t._keyboardActive=!1,t._preventScroll=!1,t._delayed=!1,t.swipe=[0,0],t.tap=!1,t.canceled=!1,t.cancel=this.cancel.bind(this)}setup(){const t=this.state;if(t._bounds instanceof HTMLElement){const n=t._bounds.getBoundingClientRect(),a=t.currentTarget.getBoundingClientRect(),s={left:n.left-a.left+t.offset[0],right:n.right-a.right+t.offset[0],top:n.top-a.top+t.offset[1],bottom:n.bottom-a.bottom+t.offset[1]};t._bounds=P.bounds(s)}}cancel(){const t=this.state;t.canceled||(t.canceled=!0,t._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(t){const n=this.config,a=this.state;if(t.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(t.buttons):n.pointerButtons!==-1&&n.pointerButtons!==t.buttons))return;const s=this.ctrl.setEventIds(t);n.pointerCapture&&t.target.setPointerCapture(t.pointerId),!(s&&s.size>1&&a._pointerActive)&&(this.start(t),this.setupPointer(t),a._pointerId=ce(t),a._pointerActive=!0,this.computeValues(z(t)),this.computeInitial(),n.preventScrollAxis&&mn(t)!=="mouse"?(a._active=!1,this.setupScrollPrevention(t)):n.delay>0?(this.setupDelayTrigger(t),n.triggerAllEvents&&(this.compute(t),this.emit())):this.startPointerDrag(t))}startPointerDrag(t){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(t),this.emit()}pointerMove(t){const n=this.state,a=this.config;if(!n._pointerActive)return;const s=ce(t);if(n._pointerId!==void 0&&s!==n._pointerId)return;const o=z(t);if(document.pointerLockElement===t.target?n._delta=[t.movementX,t.movementY]:(n._delta=A.sub(o,n._values),this.computeValues(o)),A.addTo(n._movement,n._delta),this.compute(t),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(t);return}if(a.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===a.preventScrollAxis||a.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(t);return}else return;this.emit()}pointerUp(t){this.ctrl.setEventIds(t);try{this.config.pointerCapture&&t.target.hasPointerCapture(t.pointerId)&&t.target.releasePointerCapture(t.pointerId)}catch{}const n=this.state,a=this.config;if(!n._active||!n._pointerActive)return;const s=ce(t);if(n._pointerId!==void 0&&s!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(t);const[o,r]=n._distance;if(n.tap=o<=a.tapsThreshold&&r<=a.tapsThreshold,n.tap&&a.filterTaps)n._force=!0;else{const[i,l]=n._delta,[c,u]=n._movement,[f,m]=a.swipe.velocity,[d,p]=a.swipe.distance,E=a.swipe.duration;if(n.elapsedTime<E){const v=Math.abs(i/n.timeDelta),x=Math.abs(l/n.timeDelta);v>f&&Math.abs(c)>d&&(n.swipe[0]=Math.sign(i)),x>m&&Math.abs(u)>p&&(n.swipe[1]=Math.sign(l))}}this.emit()}pointerClick(t){!this.state.tap&&t.detail>0&&(t.preventDefault(),t.stopPropagation())}setupPointer(t){const n=this.config,a=n.device;n.pointerLock&&t.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,a,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(t){this.state._preventScroll&&t.cancelable&&t.preventDefault()}setupScrollPrevention(t){this.state._preventScroll=!1,Fr(t);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,t)}setupDelayTrigger(t){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(t)},this.config.delay)}keyDown(t){const n=ct[t.key];if(n){const a=this.state,s=t.shiftKey?10:t.altKey?.1:1;this.start(t),a._delta=n(this.config.keyboardDisplacement,s),a._keyboardActive=!0,A.addTo(a._movement,a._delta),this.compute(t),this.emit()}}keyUp(t){t.key in ct&&(this.state._keyboardActive=!1,this.setActive(),this.compute(t),this.emit())}bind(t){const n=this.config.device;t(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(t(n,"change",this.pointerMove.bind(this)),t(n,"end",this.pointerUp.bind(this)),t(n,"cancel",this.pointerUp.bind(this)),t("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(t("key","down",this.keyDown.bind(this)),t("key","up",this.keyUp.bind(this))),this.config.filterTaps&&t("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function Fr(e){"persist"in e&&typeof e.persist=="function"&&e.persist()}const W=typeof window<"u"&&window.document&&window.document.createElement;function gn(){return W&&"ontouchstart"in window}function Ar(){return gn()||W&&window.navigator.maxTouchPoints>1}function Dr(){return W&&"onpointerdown"in window}function Tr(){return W&&"exitPointerLock"in window.document}function Ir(){try{return"constructor"in GestureEvent}catch{return!1}}const M={isBrowser:W,gesture:Ir(),touch:gn(),touchscreen:Ar(),pointer:Dr(),pointerLock:Tr()},Sr=250,kr=180,_r=.5,Mr=50,Br=250,wr=10,mt={mouse:0,touch:0,pen:8},Lr=D(D({},P),{},{device(e,t,{pointer:{touch:n=!1,lock:a=!1,mouse:s=!1}={}}){return this.pointerLock=a&&M.pointerLock,M.touch&&n?"touch":this.pointerLock?"mouse":M.pointer&&!s?"pointer":M.touch?"touch":"mouse"},preventScrollAxis(e,t,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&e?Sr:void 0,!(!M.touchscreen||n===!1))return e||(n!==void 0?"y":void 0)},pointerCapture(e,t,{pointer:{capture:n=!0,buttons:a=1,keys:s=!0}={}}){return this.pointerButtons=a,this.keys=s,!this.pointerLock&&this.device==="pointer"&&n},threshold(e,t,{filterTaps:n=!1,tapsThreshold:a=3,axis:s=void 0}){const o=A.toVector(e,n?a:s?1:0);return this.filterTaps=n,this.tapsThreshold=a,o},swipe({velocity:e=_r,distance:t=Mr,duration:n=Br}={}){return{velocity:this.transform(A.toVector(e)),distance:this.transform(A.toVector(t)),duration:n}},delay(e=0){switch(e){case!0:return kr;case!1:return 0;default:return e}},axisThreshold(e){return e?D(D({},mt),e):mt},keyboardDisplacement(e=wr){return e}});function vn(e){const[t,n]=e.overflow,[a,s]=e._delta,[o,r]=e._direction;(t<0&&a>0&&o<0||t>0&&a<0&&o>0)&&(e._movement[0]=e._movementBound[0]),(n<0&&s>0&&r<0||n>0&&s<0&&r>0)&&(e._movement[1]=e._movementBound[1])}const Or=30,jr=100;class Rr extends hn{constructor(...t){super(...t),T(this,"ingKey","pinching"),T(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const t=this.state;t._touchIds=[],t.canceled=!1,t.cancel=this.cancel.bind(this),t.turns=0}computeOffset(){const{type:t,movement:n,lastOffset:a}=this.state;t==="wheel"?this.state.offset=A.add(n,a):this.state.offset=[(1+n[0])*a[0],n[1]+a[1]]}computeMovement(){const{offset:t,lastOffset:n}=this.state;this.state.movement=[t[0]/n[0],t[1]-n[1]]}axisIntent(){const t=this.state,[n,a]=t._movement;if(!t.axis){const s=Math.abs(n)*Or-Math.abs(a);s<0?t.axis="angle":s>0&&(t.axis="scale")}}restrictToAxis(t){this.config.lockDirection&&(this.state.axis==="scale"?t[1]=0:this.state.axis==="angle"&&(t[0]=0))}cancel(){const t=this.state;t.canceled||setTimeout(()=>{t.canceled=!0,t._active=!1,this.compute(),this.emit()},0)}touchStart(t){this.ctrl.setEventIds(t);const n=this.state,a=this.ctrl.touchIds;if(n._active&&n._touchIds.every(o=>a.has(o))||a.size<2)return;this.start(t),n._touchIds=Array.from(a).slice(0,2);const s=it(t,n._touchIds);s&&this.pinchStart(t,s)}pointerStart(t){if(t.buttons!=null&&t.buttons%2!==1)return;this.ctrl.setEventIds(t),t.target.setPointerCapture(t.pointerId);const n=this.state,a=n._pointerEvents,s=this.ctrl.pointerIds;if(n._active&&Array.from(a.keys()).every(r=>s.has(r))||(a.size<2&&a.set(t.pointerId,t),n._pointerEvents.size<2))return;this.start(t);const o=xe(...Array.from(a.values()));o&&this.pinchStart(t,o)}pinchStart(t,n){const a=this.state;a.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(t),this.emit()}touchMove(t){if(!this.state._active)return;const n=it(t,this.state._touchIds);n&&this.pinchMove(t,n)}pointerMove(t){const n=this.state._pointerEvents;if(n.has(t.pointerId)&&n.set(t.pointerId,t),!this.state._active)return;const a=xe(...Array.from(n.values()));a&&this.pinchMove(t,a)}pinchMove(t,n){const a=this.state,s=a._values[1],o=n.angle-s;let r=0;Math.abs(o)>270&&(r+=Math.sign(o)),this.computeValues([n.distance,n.angle-360*r]),a.origin=n.origin,a.turns=r,a._movement=[a._values[0]/a._initial[0]-1,a._values[1]-a._initial[1]],this.compute(t),this.emit()}touchEnd(t){this.ctrl.setEventIds(t),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(t),this.emit())}pointerEnd(t){const n=this.state;this.ctrl.setEventIds(t);try{t.target.releasePointerCapture(t.pointerId)}catch{}n._pointerEvents.has(t.pointerId)&&n._pointerEvents.delete(t.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(t),this.emit())}gestureStart(t){t.cancelable&&t.preventDefault();const n=this.state;n._active||(this.start(t),this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY],this.compute(t),this.emit())}gestureMove(t){if(t.cancelable&&t.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY];const a=n._movement;n._movement=[t.scale-1,t.rotation],n._delta=A.sub(n._movement,a),this.compute(t),this.emit()}gestureEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}wheel(t){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(a=>t[a]):!t[n])||(this.state._active?this.wheelChange(t):this.wheelStart(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(t){this.start(t),this.wheelChange(t)}wheelChange(t){"uv"in t||t.cancelable&&t.preventDefault();const a=this.state;a._delta=[-fn(t)[1]/jr*a.offset[0],0],A.addTo(a._movement,a._delta),vn(a),this.state.origin=[t.clientX,t.clientY],this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){const n=this.config.device;n&&(t(n,"start",this[n+"Start"].bind(this)),t(n,"change",this[n+"Move"].bind(this)),t(n,"end",this[n+"End"].bind(this)),t(n,"cancel",this[n+"End"].bind(this)),t("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&t("wheel","",this.wheel.bind(this),{passive:!1})}}const Pr=D(D({},pn),{},{device(e,t,{shared:n,pointer:{touch:a=!1}={}}){if(n.target&&!M.touch&&M.gesture)return"gesture";if(M.touch&&a)return"touch";if(M.touchscreen){if(M.pointer)return"pointer";if(M.touch)return"touch"}},bounds(e,t,{scaleBounds:n={},angleBounds:a={}}){const s=r=>{const i=lt(te(n,r),{min:-1/0,max:1/0});return[i.min,i.max]},o=r=>{const i=lt(te(a,r),{min:-1/0,max:1/0});return[i.min,i.max]};return typeof n!="function"&&typeof a!="function"?[s(),o()]:r=>[s(r),o(r)]},threshold(e,t,n){return this.lockDirection=n.axis==="lock",A.toVector(e,this.lockDirection?[.1,3]:0)},modifierKey(e){return e===void 0?"ctrlKey":e},pinchOnWheel(e=!0){return e}});class $r extends V{constructor(...t){super(...t),T(this,"ingKey","moving")}move(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.state._active?this.moveChange(t):this.moveStart(t),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(t){this.start(t),this.computeValues(z(t)),this.compute(t),this.computeInitial(),this.emit()}moveChange(t){if(!this.state._active)return;const n=z(t),a=this.state;a._delta=A.sub(n,a._values),A.addTo(a._movement,a._delta),this.computeValues(n),this.compute(t),this.emit()}moveEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}bind(t){t("pointer","change",this.move.bind(this)),t("pointer","leave",this.moveEnd.bind(this))}}const Nr=D(D({},P),{},{mouseOnly:(e=!0)=>e});class Ur extends V{constructor(...t){super(...t),T(this,"ingKey","scrolling")}scroll(t){this.state._active||this.start(t),this.scrollChange(t),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(t){t.cancelable&&t.preventDefault();const n=this.state,a=hr(t);n._delta=A.sub(a,n._values),A.addTo(n._movement,n._delta),this.computeValues(a),this.compute(t),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("scroll","",this.scroll.bind(this))}}const Yr=P;class zr extends V{constructor(...t){super(...t),T(this,"ingKey","wheeling")}wheel(t){this.state._active||this.start(t),this.wheelChange(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(t){const n=this.state;n._delta=fn(t),A.addTo(n._movement,n._delta),vn(n),this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("wheel","",this.wheel.bind(this))}}const Hr=P;class Gr extends V{constructor(...t){super(...t),T(this,"ingKey","hovering")}enter(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.start(t),this.computeValues(z(t)),this.compute(t),this.emit())}leave(t){if(this.config.mouseOnly&&t.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const a=z(t);n._movement=n._delta=A.sub(a,n._values),this.computeValues(a),this.compute(t),n.delta=n.movement,this.emit()}bind(t){t("pointer","enter",this.enter.bind(this)),t("pointer","leave",this.leave.bind(this))}}const Vr=D(D({},P),{},{mouseOnly:(e=!0)=>e}),Be=new Map,Ce=new Map;function Wr(e){Be.set(e.key,e.engine),Ce.set(e.key,e.resolver)}const Xr={key:"drag",engine:Cr,resolver:Lr},qr={key:"hover",engine:Gr,resolver:Vr},Kr={key:"move",engine:$r,resolver:Nr},Zr={key:"pinch",engine:Rr,resolver:Pr},Jr={key:"scroll",engine:Ur,resolver:Yr},Qr={key:"wheel",engine:zr,resolver:Hr};function eo(e,t){if(e==null)return{};var n={},a=Object.keys(e),s,o;for(o=0;o<a.length;o++)s=a[o],!(t.indexOf(s)>=0)&&(n[s]=e[s]);return n}function to(e,t){if(e==null)return{};var n=eo(e,t),a,s;if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);for(s=0;s<o.length;s++)a=o[s],!(t.indexOf(a)>=0)&&Object.prototype.propertyIsEnumerable.call(e,a)&&(n[a]=e[a])}return n}const no={target(e){if(e)return()=>"current"in e?e.current:e},enabled(e=!0){return e},window(e=M.isBrowser?window:void 0){return e},eventOptions({passive:e=!0,capture:t=!1}={}){return{passive:e,capture:t}},transform(e){return e}},ao=["target","eventOptions","window","enabled","transform"];function Q(e={},t){const n={};for(const[a,s]of Object.entries(t))switch(typeof s){case"function":n[a]=s.call(n,e[a],a,e);break;case"object":n[a]=Q(e[a],s);break;case"boolean":s&&(n[a]=e[a]);break}return n}function so(e,t,n={}){const a=e,{target:s,eventOptions:o,window:r,enabled:i,transform:l}=a,c=to(a,ao);if(n.shared=Q({target:s,eventOptions:o,window:r,enabled:i,transform:l},no),t){const u=Ce.get(t);n[t]=Q(D({shared:n.shared},c),u)}else for(const u in c){const f=Ce.get(u);f&&(n[u]=Q(D({shared:n.shared},c[u]),f))}return n}class yn{constructor(t,n){T(this,"_listeners",new Set),this._ctrl=t,this._gestureKey=n}add(t,n,a,s,o){const r=this._listeners,i=cr(n,a),l=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},c=D(D({},l),o);t.addEventListener(i,s,c);const u=()=>{t.removeEventListener(i,s,c),r.delete(u)};return r.add(u),u}clean(){this._listeners.forEach(t=>t()),this._listeners.clear()}}class io{constructor(){T(this,"_timeouts",new Map)}add(t,n,a=140,...s){this.remove(t),this._timeouts.set(t,window.setTimeout(n,a,...s))}remove(t){const n=this._timeouts.get(t);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(t=>void window.clearTimeout(t)),this._timeouts.clear()}}class ro{constructor(t){T(this,"gestures",new Set),T(this,"_targetEventStore",new yn(this)),T(this,"gestureEventStores",{}),T(this,"gestureTimeoutStores",{}),T(this,"handlers",{}),T(this,"config",{}),T(this,"pointerIds",new Set),T(this,"touchIds",new Set),T(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),oo(this,t)}setEventIds(t){if(ie(t))return this.touchIds=new Set(fr(t)),this.touchIds;if("pointerId"in t)return t.type==="pointerup"||t.type==="pointercancel"?this.pointerIds.delete(t.pointerId):t.type==="pointerdown"&&this.pointerIds.add(t.pointerId),this.pointerIds}applyHandlers(t,n){this.handlers=t,this.nativeHandlers=n}applyConfig(t,n){this.config=so(t,n,this.config)}clean(){this._targetEventStore.clean();for(const t of this.gestures)this.gestureEventStores[t].clean(),this.gestureTimeoutStores[t].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...t){const n=this.config.shared,a={};let s;if(!(n.target&&(s=n.target(),!s))){if(n.enabled){for(const r of this.gestures){const i=this.config[r],l=dt(a,i.eventOptions,!!s);if(i.enabled){const c=Be.get(r);new c(this,t,r).bind(l)}}const o=dt(a,n.eventOptions,!!s);for(const r in this.nativeHandlers)o(r,"",i=>this.nativeHandlers[r](D(D({},this.state.shared),{},{event:i,args:t})),void 0,!0)}for(const o in a)a[o]=vr(...a[o]);if(!s)return a;for(const o in a){const{device:r,capture:i,passive:l}=ur(o);this._targetEventStore.add(s,r,"",a[o],{capture:i,passive:l})}}}}function $(e,t){e.gestures.add(t),e.gestureEventStores[t]=new yn(e,t),e.gestureTimeoutStores[t]=new io}function oo(e,t){t.drag&&$(e,"drag"),t.wheel&&$(e,"wheel"),t.scroll&&$(e,"scroll"),t.move&&$(e,"move"),t.pinch&&$(e,"pinch"),t.hover&&$(e,"hover")}const dt=(e,t,n)=>(a,s,o,r={},i=!1)=>{var l,c;const u=(l=r.capture)!==null&&l!==void 0?l:t.capture,f=(c=r.passive)!==null&&c!==void 0?c:t.passive;let m=i?a:or(a,s,u);n&&f&&(m+="Passive"),e[m]=e[m]||[],e[m].push(o)},lo=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function uo(e){const t={},n={},a=new Set;for(let s in e)lo.test(s)?(a.add(RegExp.lastMatch),n[s]=e[s]):t[s]=e[s];return[n,t,a]}function N(e,t,n,a,s,o){if(!e.has(n)||!Be.has(a))return;const r=n+"Start",i=n+"End",l=c=>{let u;return c.first&&r in t&&t[r](c),n in t&&(u=t[n](c)),c.last&&i in t&&t[i](c),u};s[a]=l,o[a]=o[a]||{}}function co(e,t){const[n,a,s]=uo(e),o={};return N(s,n,"onDrag","drag",o,t),N(s,n,"onWheel","wheel",o,t),N(s,n,"onScroll","scroll",o,t),N(s,n,"onPinch","pinch",o,t),N(s,n,"onMove","move",o,t),N(s,n,"onHover","hover",o,t),{handlers:o,config:t,nativeHandlers:a}}function mo(e,t={},n,a){const s=Y.useMemo(()=>new ro(e),[]);if(s.applyHandlers(e,a),s.applyConfig(t,n),Y.useEffect(s.effect.bind(s)),Y.useEffect(()=>s.clean.bind(s),[]),t.target===void 0)return s.bind.bind(s)}function fo(e){return e.forEach(Wr),function(n,a){const{handlers:s,nativeHandlers:o,config:r}=co(n,a||{});return mo(s,r,void 0,o)}}function ho(e,t){return fo([Xr,Zr,Jr,Qr,Kr,qr])(e,t||{})}function po(e){G("translateViewport",e)}function go(e){se("translateViewport",e)}function vo({children:e,onGetViewportConfiguration:t}){const n=b.useRef(null),a=Y.useMemo(t,[t]),[s,o]=b.useState(a.initialZoom),[r,i]=b.useState(a.initialTranslate),[l,c]=b.useState(!1),u=b.useCallback((f,m)=>{const{minX:d,minY:p,maxX:E,maxY:v}=a,x=window.innerWidth,y=window.innerHeight,F=Math.min(Math.max(m,Math.max(x/(E-d),y/(v-p))),4),j={x:Math.min(Math.max(f.x,-(E-x/F)),-d),y:Math.min(Math.max(f.y,-(v-y/F)),-p)};i(j),o(F)},[a]);return b.useEffect(()=>{u(a.initialTranslate,a.initialZoom)},[]),ho({onPinch({origin:f,delta:m,pinching:d}){var y;c(d);const p=s+m[0],E=(y=n.current)==null?void 0:y.getBoundingClientRect(),v=f[0]-((E==null?void 0:E.left)??0),x=f[1]-((E==null?void 0:E.top)??0);u({x:r.x-(v/s-v/p),y:r.y-(x/s-x/p)},p)},onWheel({event:f,delta:[m,d],wheeling:p}){f.preventDefault(),c(p),u({x:r.x-m/s,y:r.y-d/s},s)}},{target:n,eventOptions:{passive:!1}}),go(f=>{const m=window.innerWidth,d=window.innerHeight,p=m/2-f.x*s,E=d/2-f.y*s;u({x:p/s,y:E/s},s)}),h.jsx(yo,{children:h.jsx(Eo,{ref:n,children:h.jsx(bo,{style:{"--zoom":s,"--translate-x":r.x,"--translate-y":r.y},"data-is-interacting":l,children:e})})})}const yo=C.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,Eo=C.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,bo=C.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function xo({worldState:e}){return h.jsx(Ii,{children:h.jsx(Ai,{children:h.jsx(vo,{onGetViewportConfiguration:()=>Co(e),children:h.jsx(Qi,{state:e})})})})}function Co(e){const t=e.states.find(v=>v.isPlayerControlled),n=window.innerWidth,a=window.innerHeight,s=t?e.sectors.filter(v=>v.stateId===t.id):e.sectors;let o=1/0,r=1/0,i=-1/0,l=-1/0;s.forEach(v=>{o=Math.min(o,v.rect.left),r=Math.min(r,v.rect.top),i=Math.max(i,v.rect.right),l=Math.max(l,v.rect.bottom)});const c=i-o+1,u=l-r+1,f=n/c,m=a/u,d=Math.min(f,m)*1,p=(o+i)/2,E=(r+l)/2;return e.sectors.forEach(v=>{o=Math.min(o,v.rect.left),r=Math.min(r,v.rect.top),i=Math.max(i,v.rect.right),l=Math.max(l,v.rect.bottom)}),{initialTranslate:{x:n/2-p*d,y:a/2-E*d},initialZoom:d,minX:o,minY:r,maxX:i,maxY:l}}const En="fullScreenMessage",bn="fullScreenMessageAction";function w(e,t,n,a="",s,o,r){G(En,{message:e,startTimestamp:t,endTimestamp:n,messageId:a,actions:s,prompt:o,fullScreen:r??!!(s!=null&&s.length)})}function xn(e,t){G(bn,{messageId:e,actionId:t})}function Cn(e){se(En,t=>{e(t)})}function we(e){se(bn,t=>{e(t)})}function Fo({worldState:e,onGameOver:t}){const[n,a]=b.useState(null),[s,o]=b.useState(!1);return b.useEffect(()=>{var d;if(s)return;const r=ln(e),i=Object.values(r).filter(p=>p>0).length,l=e.launchSites.length===0,c=e.timestamp,u=e.states.filter(p=>r[p.id]>0&&Object.entries(p.strategies).filter(([E,v])=>r[E]>0&&v===g.HOSTILE).length>0),f=e.launchSites.some(p=>p.lastLaunchTimestamp&&c-p.lastLaunchTimestamp<re),m=re-c;if(!u.length&&!f&&m>0&&m<=10&&(n?w(`Game will end in ${Math.ceil(m)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):a(c)),i<=1||l||!u.length&&!f&&c>re){const p=i===1?(d=e.states.find(E=>r[E.id]>0))==null?void 0:d.id:void 0;o(!0),w(["Game Over!","Results will be shown shortly..."],c,c+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{t({populations:r,winner:p,stateNames:Object.fromEntries(e.states.map(E=>[E.id,E.name])),playerStateId:e.states.find(E=>E.isPlayerControlled).id})},5e3)}},[e,t,n,s]),null}const Ao="/assets/player-lost-background-D2A_VJ6-.png",Do="/assets/player-won-background-CkXgF24i.png",ft="/assets/draw-background-EwLQ9g28.png",To=C.div`
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
`,Io=({setGameState:e})=>{const{state:{result:t}}=pt(),n=()=>{e(ne,{stateName:t.stateNames[t.playerStateId]})};let a,s;return t.winner?t.winner===t.playerStateId?(a=Do,s=`Congratulations! ${t.stateNames[t.playerStateId]} has won with ${ee(t.populations[t.playerStateId])} population alive.`):t.winner!==void 0?(a=Ao,s=`${t.stateNames[t.winner]} has won with ${ee(t.populations[t.winner])} population alive. Your state has fallen.`):(a=ft,s="The game has ended in an unexpected state."):(a=ft,s="It's a draw! The world is partially destroyed, but there's still hope."),h.jsx(To,{backgroundImage:a,children:h.jsxs("div",{children:[h.jsx("h2",{children:"Game Over"}),h.jsx("p",{children:s}),h.jsx("button",{onClick:n,children:"Play Again"}),h.jsx("br",{}),h.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Fe={Component:Io,path:"played"};function So({worldState:e}){var c;const[t,n]=b.useState([]),[a,s]=b.useState(null);Cn(u=>{n(f=>u.messageId&&f.find(m=>m.messageId===u.messageId)?[...f.map(m=>m.messageId===u.messageId?u:m)]:[u,...f])});const o=t.sort((u,f)=>u.actions&&!f.actions?-1:!u.actions&&f.actions?1:u.startTimestamp-f.startTimestamp);if(we(u=>{n(f=>f.filter(m=>m.messageId!==u.messageId))}),b.useEffect(()=>{const u=o.find(f=>f.fullScreen&&f.startTimestamp<=e.timestamp&&f.endTimestamp>e.timestamp);s(u||null)},[o,e.timestamp]),!a)return null;const i=((u,f)=>f<u.startTimestamp?"pre":f<u.startTimestamp+.5?"pre-in":f>u.endTimestamp-.5?"post-in":f>u.endTimestamp?"post":"active")(a,e.timestamp),l=u=>Array.isArray(u)?u.map((f,m)=>h.jsx("div",{children:f},m)):u;return h.jsxs(Mo,{"data-message-state":i,"data-action":(((c=a.actions)==null?void 0:c.length)??0)>0,children:[h.jsx(Bo,{children:l(a.message)}),a.prompt&&a.actions&&h.jsx(wo,{children:a.actions.map((u,f)=>h.jsx(Lo,{onClick:()=>xn(a.messageId,u.id),children:u.text},f))})]})}const ko=ae`
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
`,_o=ae`
  from {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: translateX(-50%) scale(0.9);
  }
`,Mo=C.div`
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
    animation: ${ko} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${_o} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,Bo=C.div`
  font-size: 1.5rem;
  color: white;
  text-align: center;
  white-space: pre-line;
`,wo=C.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,Lo=C.button`
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
`,Fn="ALLIANCEPROPOSAL";function Oo(e,t,n,a=!1){const s=`${Fn}_${e.id}_${t.id}`,o=a?`${e.name} has become friendly towards you. Do you want to form an alliance?`:`${e.name} proposes an alliance with ${t.name}. Do you accept?`,r=n.timestamp,i=r+10;w(o,r,i,s,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function jo({worldState:e,setWorldState:t}){return we(n=>{if(n.messageId.startsWith(Fn)){const[,a,s]=n.messageId.split("_"),o=e.states.find(i=>i.id===a),r=e.states.find(i=>i.id===s);if(!o||!(r!=null&&r.isPlayerControlled))return;if(n.actionId==="accept"){const i=e.states.map(l=>l.id===a||l.id===s?{...l,strategies:{...l.strategies,[a]:g.FRIENDLY,[s]:g.FRIENDLY}}:l);t({...e,states:i}),w(`Alliance formed between ${o.name} and ${r.name}!`,e.timestamp,e.timestamp+5)}else n.actionId==="reject"&&w(`${r.name} has rejected the alliance proposal from ${o.name}.`,e.timestamp,e.timestamp+5)}}),null}function Ro({worldState:e}){const t=e.states.find(d=>d.isPlayerControlled),[n,a]=b.useState(!1),[s,o]=b.useState({}),[r,i]=b.useState([]),[l,c]=b.useState([]),[u,f]=b.useState(!1),m=Math.round(e.timestamp*10)/10;return b.useEffect(()=>{!n&&e.timestamp>0&&(a(!0),w("The game has started!",e.timestamp,e.timestamp+3))},[m]),b.useEffect(()=>{var d,p,E,v;if(t){const x=Object.fromEntries(e.states.map(y=>[y.id,y.strategies]));for(const y of e.states)for(const F of e.states.filter(j=>j.id!==y.id))t&&F.id===t.id&&y.strategies[F.id]===g.FRIENDLY&&F.strategies[y.id]!==g.FRIENDLY&&((d=s[y.id])==null?void 0:d[F.id])!==g.FRIENDLY&&Oo(y,t,e,!0),F.strategies[y.id]===g.FRIENDLY&&y.strategies[F.id]===g.FRIENDLY&&(((p=s[F.id])==null?void 0:p[y.id])!==g.FRIENDLY||((E=s[y.id])==null?void 0:E[F.id])!==g.FRIENDLY)&&w(`${F.name} has formed alliance with ${y.isPlayerControlled?"you":y.name}!`,m,m+3),y.strategies[F.id]===g.HOSTILE&&((v=s[y.id])==null?void 0:v[F.id])!==g.HOSTILE&&w(F.isPlayerControlled?`${y.name} has declared war on You!`:`${y.isPlayerControlled?"You have":y.name} declared war on ${F.name}!`,m,m+3,void 0,void 0,void 0,y.isPlayerControlled||F.isPlayerControlled);o(x)}},[m]),b.useEffect(()=>{t&&e.cities.forEach(d=>{const p=r.find(y=>y.id===d.id);if(!p)return;const E=d.population||0,v=p.population,x=Math.floor(v-E);x>0&&(d.stateId===t.id&&w(E===0?`Your city ${d.name} has been destroyed!`:[`Your city ${d.name} has been hit!`,`${x} casualties reported.`],m,m+3,void 0,void 0,!1,!0),G("cityDamage"))}),i(e.cities.map(d=>({...d})))},[m]),b.useEffect(()=>{if(t){const d=e.launchSites.filter(p=>p.stateId===t.id);l.length>0&&l.filter(E=>!d.some(v=>v.id===E.id)).forEach(()=>{w("One of your launch sites has been destroyed!",m,m+3,void 0,void 0,!1,!0)}),c(d)}},[m]),b.useEffect(()=>{if(t&&!u){const d=e.cities.filter(v=>v.stateId===t.id),p=e.launchSites.filter(v=>v.stateId===t.id);!d.some(v=>v.population>0)&&p.length===0&&(w(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],m,m+5,void 0,void 0,!1,!0),f(!0))}},[m]),null}function Po({worldState:e}){const[t,n]=b.useState([]);Cn(r=>{n(i=>r.messageId&&i.find(l=>l.messageId===r.messageId)?[...i.map(l=>l.messageId===r.messageId?r:l)]:[r,...i])}),we(r=>{n(i=>i.filter(l=>l.messageId!==r.messageId))});const a=r=>Array.isArray(r)?r.map((i,l)=>h.jsx("div",{children:i},l)):r,s=(r,i)=>{const u=i-r;return u>60?0:u>50?1-(u-50)/10:1},o=b.useMemo(()=>{const r=e.timestamp,i=60;return t.filter(l=>{const c=l.startTimestamp||0;return r-c<=i}).map(l=>({...l,opacity:s(l.startTimestamp||0,r)}))},[t,e.timestamp]);return h.jsx($o,{children:o.map((r,i)=>h.jsxs(No,{style:{opacity:r.opacity},children:[h.jsx("div",{children:a(r.message)}),r.prompt&&r.actions&&h.jsx(Uo,{children:r.actions.map((l,c)=>h.jsx(Yo,{onClick:()=>xn(r.messageId,l.id),children:l.text},c))})]},i))})}const $o=C.div`
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
`,No=C.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,Uo=C.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,Yo=C.button`
  font-size: 10px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function zo({updateWorldTime:e,currentWorldTime:t}){const[n,a]=b.useState(!1),s=b.useRef(null);un(r=>{if(!s.current){s.current=r;return}const i=r-s.current;s.current=r,!(i<=0)&&n&&e(i/1e3)},!0);const o=r=>{const i=Math.floor(r/86400),l=Math.floor(r%86400/3600),c=Math.floor(r%3600/60),u=Math.floor(r%60);return[[i,"d"],[l,"h"],[c,"m"],[u,"s"]].filter(([f])=>!!f).map(([f,m])=>String(f)+m).join(" ")};return h.jsx(Ho,{children:h.jsxs(Go,{children:[h.jsxs(Vo,{children:[t>0?"Current Time: ":"Game not started yet",o(t)]}),h.jsx(q,{onClick:()=>e(1),children:"+1s"}),h.jsx(q,{onClick:()=>e(10),children:"+10s"}),h.jsx(q,{onClick:()=>e(60),children:"+1m"}),h.jsx(q,{onClick:()=>a(!n),children:n?"Stop":"Start"})]})})}const Ho=C.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,Go=C.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,q=C.button`
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
`,Vo=C.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`;function Wo({worldState:e}){const t=e.states.find(i=>i.isPlayerControlled);if(!t)return null;const n=(i,l,c=!1)=>{t.strategies[i.id]=l,c&&(i.strategies[t.id]=l)},a=i=>{if(i.id===t.id)return"#4CAF50";const l=t.strategies[i.id],c=i.strategies[t.id];return l===g.FRIENDLY&&c===g.FRIENDLY?"#4CAF50":l===g.HOSTILE||c===g.HOSTILE?"#F44336":"#9E9E9E"},s=ln(e),o=i=>{const l=e.cities.filter(d=>d.stateId===i),c=e.launchSites.filter(d=>d.stateId===i);if(l.length===0&&c.length===0){console.warn("No position information available for this state");return}const u=[...l.map(d=>d.position),...c.map(d=>d.position)],f=u.reduce((d,p)=>({x:d.x+p.x,y:d.y+p.y}),{x:0,y:0}),m={x:f.x/u.length,y:f.y/u.length};po(m)},r=i=>{const l=t.strategies[i.id],c=i.strategies[t.id];return h.jsxs(el,{children:[(l===g.NEUTRAL&&c!==g.HOSTILE||l===g.FRIENDLY&&c!==g.FRIENDLY)&&h.jsx(K,{color:"#4CAF50",onClick:u=>{u.stopPropagation(),n(i,g.FRIENDLY)},disabled:l===g.FRIENDLY&&c!==g.FRIENDLY,children:"Alliance"}),(l===g.HOSTILE||c===g.HOSTILE)&&h.jsx(K,{color:"#9E9E9E",onClick:u=>{u.stopPropagation(),n(i,g.NEUTRAL)},disabled:l===g.NEUTRAL&&c!==g.NEUTRAL,children:"Peace"}),l===g.FRIENDLY&&c===g.FRIENDLY&&h.jsx(K,{color:"#9E9E9E",onClick:u=>{u.stopPropagation(),n(i,g.NEUTRAL,!0)},children:"Neutral"}),l===g.NEUTRAL&&c!==g.HOSTILE&&h.jsx(K,{color:"#F44336",onClick:u=>{u.stopPropagation(),n(i,g.HOSTILE,!0)},children:"Attack"})]})};return h.jsx(Xo,{children:e.states.map(i=>h.jsxs(qo,{relationshipColor:a(i),onClick:()=>o(i.id),children:[h.jsx(Ko,{style:{color:i.color},children:i.name.charAt(0)}),h.jsxs(Zo,{children:[h.jsx(Jo,{children:i.name}),h.jsx(Qo,{children:ee(s[i.id])}),i.id!==t.id?r(i):h.jsx(tl,{children:"This is you"})]})]},i.id))})}const Xo=C.div`
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
`,qo=C.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 10px;
  background: ${e=>`rgba(${parseInt(e.relationshipColor.slice(1,3),16)}, ${parseInt(e.relationshipColor.slice(3,5),16)}, ${parseInt(e.relationshipColor.slice(5,7),16)}, 0.2)`};
  border: 2px solid ${e=>e.relationshipColor};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,Ko=C.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,Zo=C.div`
  display: flex;
  flex-direction: column;
`,Jo=C.span`
  font-weight: bold;
  margin-bottom: 5px;
`,Qo=C.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`,el=C.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`,K=C.button`
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
`,tl=C.span`
  font-style: italic;
  color: #4caf50;
`,nl=({setGameState:e})=>{const{state:{stateName:t}}=pt(),{worldState:n,setWorldState:a,updateWorldState:s}=xi(t);return h.jsxs(h.Fragment,{children:[h.jsx(xo,{worldState:n}),h.jsx(zo,{updateWorldTime:o=>s(n,o),currentWorldTime:n.timestamp??0}),h.jsx(So,{worldState:n}),h.jsx(Wo,{worldState:n}),h.jsx(Po,{worldState:n}),h.jsx(Fo,{worldState:n,onGameOver:o=>e(Fe,{result:o})}),h.jsx(Ro,{worldState:n}),h.jsx(jo,{worldState:n,setWorldState:a})]})},ne={Component:nl,path:"playing"},al="/assets/play-background-BASXrsIB.png",sl=C.div`
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
    background-image: url(${al});
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
`,il=({setGameState:e})=>{const[t,n]=b.useState(an(1)[0]),a=()=>{e(ne,{stateName:t})};return h.jsx(sl,{children:h.jsxs("div",{children:[h.jsx("h1",{children:"Name your state:"}),h.jsx("input",{type:"text",placeholder:"Type your state name here",value:t,onChange:s=>n(s.currentTarget.value)}),h.jsx("br",{}),h.jsx("button",{onClick:a,disabled:!t,children:"Start game"}),h.jsx("br",{}),h.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Ae={Component:il,path:"play"},rl="/assets/intro-background-D_km5uka.png",ol="/assets/nukes-game-title-vcFxx9vI.png",ll=ae`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,ul=ae`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,cl=C.div`
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
    background-image: url(${rl});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${ll} 60s ease-in-out infinite;
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
`,ml=C.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${e=>e.isFlashing?1:0};
  animation: ${e=>e.isFlashing?ul:"none"} 4.5s forwards;
`,dl=C.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,fl=C.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,hl=({setGameState:e})=>{const[t,n]=b.useState(!0);return b.useEffect(()=>{const a=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(a)},[]),h.jsxs(cl,{children:[h.jsx(ml,{isFlashing:t}),!t&&h.jsxs(dl,{children:[h.jsx(fl,{src:ol,alt:"Nukes game"}),h.jsx("button",{onClick:()=>e(Ae),children:"Play"})]})]})},ht={Component:hl,path:""},pl=kn`
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
`,gl=[{path:ht.path,element:h.jsx(Z,{state:ht})},{path:Ae.path,element:h.jsx(Z,{state:Ae})},{path:ne.path,element:h.jsx(Z,{state:ne})},{path:Fe.path,element:h.jsx(Z,{state:Fe})}];function El(){var n;const[e]=In(),t=e.get("path")??"";return h.jsx(h.Fragment,{children:(n=gl.find(a=>a.path===t))==null?void 0:n.element})}function Z({state:e}){const t=Sn();return h.jsxs(h.Fragment,{children:[h.jsx(pl,{}),h.jsx(e.Component,{setGameState:(n,a)=>t({search:"path="+n.path},{state:a})})]})}export{El as NukesApp,gl as routes};
