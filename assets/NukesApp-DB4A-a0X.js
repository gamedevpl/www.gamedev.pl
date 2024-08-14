import{c as B,g as Gn,r as E,j as f,R as N,u as St,a as Hn,b as qn}from"./index-RFQMyoWT.js";import{d as C,m as re,f as Xn}from"./styled-components.browser.esm-nmtzLBB6.js";const we=20,ee=we*1.5,ve=5,R=20,Vn=1,Wn=5,Kn=R/Wn,_t=.5,Mt=500,K=.05,ye=5,Zn=4,ue=60,F=16,O=F*5,kt=1e3,Re=O*6,Jn=10,Qn=we/10,es=1e3,ts=.5,ns=.05,ss=.1,is=.1,D=F*.7,as=5;var p=(e=>(e.NEUTRAL="NEUTRAL",e.FRIENDLY="FRIENDLY",e.HOSTILE="HOSTILE",e))(p||{}),Bt=(e=>(e.LAUNCH_SITE="LAUNCH_SITE",e))(Bt||{}),_=(e=>(e.WATER="WATER",e.GROUND="GROUND",e))(_||{}),M=(e=>(e.ATTACK="ATTACK",e.DEFENCE="DEFENCE",e))(M||{});function os(e,t){const n=[];for(let s=0;s<t;s++)for(let i=0;i<e;i++)n.push({id:`${i*F},${s*F}`,position:{x:i*F,y:s*F},rect:{left:i*F,top:s*F,right:(i+1)*F,bottom:(s+1)*F},type:_.WATER,depth:0,height:0,population:0});return n}function rs(e,t,n){const s=[],i=Array(n).fill(null).map(()=>Array(t).fill(!1));for(let a=0;a<n;a++)for(let o=0;o<t;o++){const r=a*t+o;e[r].type===_.WATER&&cs(o,a,t,n,e)&&(s.push([o,a,0]),i[a][o]=!0)}for(;s.length>0;){const[a,o,r]=s.shift(),c=o*t+a;e[c].type===_.WATER?e[c].depth=r+(Math.random()-Math.random())/5:e[c].type===_.GROUND&&(e[c].height=Math.sqrt(r)+(Math.random()-Math.random())/10);const u=[[-1,0],[1,0],[0,-1],[0,1]];for(const[l,d]of u){const m=a+l,h=o+d;wt(m,h,t,n)&&!i[h][m]&&(s.push([m,h,r+1]),i[h][m]=!0)}}}function cs(e,t,n,s,i){return[[-1,0],[1,0],[0,-1],[0,1]].some(([o,r])=>{const c=e+o,u=t+r;if(wt(c,u,n,s)){const l=u*n+c;return i[l].type===_.GROUND}return!1})}function wt(e,t,n,s){return e>=0&&e<n&&t>=0&&t<s}var Rt={exports:{}},ls=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(e){var t=ls,n=t.filter(function(i){return!!i.css}),s=t.filter(function(i){return!!i.vga});e.exports=function(i){var a=e.exports.get(i);return a&&a.value},e.exports.get=function(i){return i=i||"",i=i.trim().toLowerCase(),t.filter(function(a){return a.name.toLowerCase()===i}).pop()},e.exports.all=e.exports.get.all=function(){return t},e.exports.get.css=function(i){return i?(i=i||"",i=i.trim().toLowerCase(),n.filter(function(a){return a.name.toLowerCase()===i}).pop()):n},e.exports.get.vga=function(i){return i?(i=i||"",i=i.trim().toLowerCase(),s.filter(function(a){return a.name.toLowerCase()===i}).pop()):s}})(Rt);var us=Rt.exports,ds=1/0,ms="[object Symbol]",fs=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,Lt="\\ud800-\\udfff",hs="\\u0300-\\u036f\\ufe20-\\ufe23",ps="\\u20d0-\\u20f0",Ot="\\u2700-\\u27bf",jt="a-z\\xdf-\\xf6\\xf8-\\xff",gs="\\xac\\xb1\\xd7\\xf7",vs="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",ys="\\u2000-\\u206f",bs=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",Pt="A-Z\\xc0-\\xd6\\xd8-\\xde",Es="\\ufe0e\\ufe0f",Nt=gs+vs+ys+bs,$t="['’]",Ge="["+Nt+"]",xs="["+hs+ps+"]",Ut="\\d+",Fs="["+Ot+"]",Yt="["+jt+"]",zt="[^"+Lt+Nt+Ut+Ot+jt+Pt+"]",Cs="\\ud83c[\\udffb-\\udfff]",Is="(?:"+xs+"|"+Cs+")",As="[^"+Lt+"]",Gt="(?:\\ud83c[\\udde6-\\uddff]){2}",Ht="[\\ud800-\\udbff][\\udc00-\\udfff]",G="["+Pt+"]",Ts="\\u200d",He="(?:"+Yt+"|"+zt+")",Ds="(?:"+G+"|"+zt+")",qe="(?:"+$t+"(?:d|ll|m|re|s|t|ve))?",Xe="(?:"+$t+"(?:D|LL|M|RE|S|T|VE))?",qt=Is+"?",Xt="["+Es+"]?",Ss="(?:"+Ts+"(?:"+[As,Gt,Ht].join("|")+")"+Xt+qt+")*",_s=Xt+qt+Ss,Ms="(?:"+[Fs,Gt,Ht].join("|")+")"+_s,ks=RegExp([G+"?"+Yt+"+"+qe+"(?="+[Ge,G,"$"].join("|")+")",Ds+"+"+Xe+"(?="+[Ge,G+He,"$"].join("|")+")",G+"?"+He+"+"+qe,G+"+"+Xe,Ut,Ms].join("|"),"g"),Bs=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,ws=typeof B=="object"&&B&&B.Object===Object&&B,Rs=typeof self=="object"&&self&&self.Object===Object&&self,Ls=ws||Rs||Function("return this")();function Os(e){return e.match(fs)||[]}function js(e){return Bs.test(e)}function Ps(e){return e.match(ks)||[]}var Ns=Object.prototype,$s=Ns.toString,Ve=Ls.Symbol,We=Ve?Ve.prototype:void 0,Ke=We?We.toString:void 0;function Us(e){if(typeof e=="string")return e;if(zs(e))return Ke?Ke.call(e):"";var t=e+"";return t=="0"&&1/e==-ds?"-0":t}function Ys(e){return!!e&&typeof e=="object"}function zs(e){return typeof e=="symbol"||Ys(e)&&$s.call(e)==ms}function Gs(e){return e==null?"":Us(e)}function Hs(e,t,n){return e=Gs(e),t=n?void 0:t,t===void 0?js(e)?Ps(e):Os(e):e.match(t)||[]}var qs=Hs,Xs=1/0,Vs="[object Symbol]",Ws=/^\s+/,Le="\\ud800-\\udfff",Vt="\\u0300-\\u036f\\ufe20-\\ufe23",Wt="\\u20d0-\\u20f0",Kt="\\ufe0e\\ufe0f",Ks="["+Le+"]",be="["+Vt+Wt+"]",Ee="\\ud83c[\\udffb-\\udfff]",Zs="(?:"+be+"|"+Ee+")",Zt="[^"+Le+"]",Jt="(?:\\ud83c[\\udde6-\\uddff]){2}",Qt="[\\ud800-\\udbff][\\udc00-\\udfff]",en="\\u200d",tn=Zs+"?",nn="["+Kt+"]?",Js="(?:"+en+"(?:"+[Zt,Jt,Qt].join("|")+")"+nn+tn+")*",Qs=nn+tn+Js,ei="(?:"+[Zt+be+"?",be,Jt,Qt,Ks].join("|")+")",ti=RegExp(Ee+"(?="+Ee+")|"+ei+Qs,"g"),ni=RegExp("["+en+Le+Vt+Wt+Kt+"]"),si=typeof B=="object"&&B&&B.Object===Object&&B,ii=typeof self=="object"&&self&&self.Object===Object&&self,ai=si||ii||Function("return this")();function oi(e){return e.split("")}function ri(e,t,n,s){for(var i=e.length,a=n+-1;++a<i;)if(t(e[a],a,e))return a;return-1}function ci(e,t,n){if(t!==t)return ri(e,li,n);for(var s=n-1,i=e.length;++s<i;)if(e[s]===t)return s;return-1}function li(e){return e!==e}function ui(e,t){for(var n=-1,s=e.length;++n<s&&ci(t,e[n],0)>-1;);return n}function di(e){return ni.test(e)}function Ze(e){return di(e)?mi(e):oi(e)}function mi(e){return e.match(ti)||[]}var fi=Object.prototype,hi=fi.toString,Je=ai.Symbol,Qe=Je?Je.prototype:void 0,et=Qe?Qe.toString:void 0;function pi(e,t,n){var s=-1,i=e.length;t<0&&(t=-t>i?0:i+t),n=n>i?i:n,n<0&&(n+=i),i=t>n?0:n-t>>>0,t>>>=0;for(var a=Array(i);++s<i;)a[s]=e[s+t];return a}function sn(e){if(typeof e=="string")return e;if(yi(e))return et?et.call(e):"";var t=e+"";return t=="0"&&1/e==-Xs?"-0":t}function gi(e,t,n){var s=e.length;return n=n===void 0?s:n,!t&&n>=s?e:pi(e,t,n)}function vi(e){return!!e&&typeof e=="object"}function yi(e){return typeof e=="symbol"||vi(e)&&hi.call(e)==Vs}function bi(e){return e==null?"":sn(e)}function Ei(e,t,n){if(e=bi(e),e&&(n||t===void 0))return e.replace(Ws,"");if(!e||!(t=sn(t)))return e;var s=Ze(e),i=ui(s,Ze(t));return gi(s,i).join("")}var xi=Ei,xe=1/0,Fi=9007199254740991,Ci=17976931348623157e292,tt=NaN,Ii="[object Symbol]",Ai=/^\s+|\s+$/g,Ti=/^[-+]0x[0-9a-f]+$/i,Di=/^0b[01]+$/i,Si=/^0o[0-7]+$/i,Oe="\\ud800-\\udfff",an="\\u0300-\\u036f\\ufe20-\\ufe23",on="\\u20d0-\\u20f0",rn="\\ufe0e\\ufe0f",_i="["+Oe+"]",Fe="["+an+on+"]",Ce="\\ud83c[\\udffb-\\udfff]",Mi="(?:"+Fe+"|"+Ce+")",cn="[^"+Oe+"]",ln="(?:\\ud83c[\\udde6-\\uddff]){2}",un="[\\ud800-\\udbff][\\udc00-\\udfff]",dn="\\u200d",mn=Mi+"?",fn="["+rn+"]?",ki="(?:"+dn+"(?:"+[cn,ln,un].join("|")+")"+fn+mn+")*",Bi=fn+mn+ki,wi="(?:"+[cn+Fe+"?",Fe,ln,un,_i].join("|")+")",Ie=RegExp(Ce+"(?="+Ce+")|"+wi+Bi,"g"),Ri=RegExp("["+dn+Oe+an+on+rn+"]"),Li=parseInt,Oi=typeof B=="object"&&B&&B.Object===Object&&B,ji=typeof self=="object"&&self&&self.Object===Object&&self,Pi=Oi||ji||Function("return this")(),Ni=Ui("length");function $i(e){return e.split("")}function Ui(e){return function(t){return t==null?void 0:t[e]}}function je(e){return Ri.test(e)}function hn(e){return je(e)?zi(e):Ni(e)}function Yi(e){return je(e)?Gi(e):$i(e)}function zi(e){for(var t=Ie.lastIndex=0;Ie.test(e);)t++;return t}function Gi(e){return e.match(Ie)||[]}var Hi=Object.prototype,qi=Hi.toString,nt=Pi.Symbol,Xi=Math.ceil,Vi=Math.floor,st=nt?nt.prototype:void 0,it=st?st.toString:void 0;function at(e,t){var n="";if(!e||t<1||t>Fi)return n;do t%2&&(n+=e),t=Vi(t/2),t&&(e+=e);while(t);return n}function Wi(e,t,n){var s=-1,i=e.length;t<0&&(t=-t>i?0:i+t),n=n>i?i:n,n<0&&(n+=i),i=t>n?0:n-t>>>0,t>>>=0;for(var a=Array(i);++s<i;)a[s]=e[s+t];return a}function pn(e){if(typeof e=="string")return e;if(gn(e))return it?it.call(e):"";var t=e+"";return t=="0"&&1/e==-xe?"-0":t}function Ki(e,t,n){var s=e.length;return n=n===void 0?s:n,!t&&n>=s?e:Wi(e,t,n)}function Zi(e,t){t=t===void 0?" ":pn(t);var n=t.length;if(n<2)return n?at(t,e):t;var s=at(t,Xi(e/hn(t)));return je(t)?Ki(Yi(s),0,e).join(""):s.slice(0,e)}function ot(e){var t=typeof e;return!!e&&(t=="object"||t=="function")}function Ji(e){return!!e&&typeof e=="object"}function gn(e){return typeof e=="symbol"||Ji(e)&&qi.call(e)==Ii}function Qi(e){if(!e)return e===0?e:0;if(e=ta(e),e===xe||e===-xe){var t=e<0?-1:1;return t*Ci}return e===e?e:0}function ea(e){var t=Qi(e),n=t%1;return t===t?n?t-n:t:0}function ta(e){if(typeof e=="number")return e;if(gn(e))return tt;if(ot(e)){var t=typeof e.valueOf=="function"?e.valueOf():e;e=ot(t)?t+"":t}if(typeof e!="string")return e===0?e:+e;e=e.replace(Ai,"");var n=Di.test(e);return n||Si.test(e)?Li(e.slice(2),n?2:8):Ti.test(e)?tt:+e}function na(e){return e==null?"":pn(e)}function sa(e,t,n){e=na(e),t=ea(t);var s=t?hn(e):0;return t&&s<t?e+Zi(t-s,n):e}var ia=sa,aa=(e,t,n,s)=>{const i=(e+(s||"")).toString().includes("%");if(typeof e=="string"?[e,t,n,s]=e.match(/(0?\.?\d{1,3})%?\b/g).map(Number):s!==void 0&&(s=parseFloat(s)),typeof e!="number"||typeof t!="number"||typeof n!="number"||e>255||t>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof s=="number"){if(!i&&s>=0&&s<=1)s=Math.round(255*s);else if(i&&s>=0&&s<=100)s=Math.round(255*s/100);else throw new TypeError(`Expected alpha value (${s}) as a fraction or percentage`);s=(s|256).toString(16).slice(1)}else s="";return(n|t<<8|e<<16|1<<24).toString(16).slice(1)+s};const q="a-f\\d",oa=`#?[${q}]{3}[${q}]?`,ra=`#?[${q}]{6}([${q}]{2})?`,ca=new RegExp(`[^#${q}]`,"gi"),la=new RegExp(`^${oa}$|^${ra}$`,"i");var ua=(e,t={})=>{if(typeof e!="string"||ca.test(e)||!la.test(e))throw new TypeError("Expected a valid hex string");e=e.replace(/^#/,"");let n=1;e.length===8&&(n=Number.parseInt(e.slice(6,8),16)/255,e=e.slice(0,6)),e.length===4&&(n=Number.parseInt(e.slice(3,4).repeat(2),16)/255,e=e.slice(0,3)),e.length===3&&(e=e[0]+e[0]+e[1]+e[1]+e[2]+e[2]);const s=Number.parseInt(e,16),i=s>>16,a=s>>8&255,o=s&255,r=typeof t.alpha=="number"?t.alpha:n;if(t.format==="array")return[i,a,o,r];if(t.format==="css"){const c=r===1?"":` / ${Number((r*100).toFixed(2))}%`;return`rgb(${i} ${a} ${o}${c})`}return{red:i,green:a,blue:o,alpha:r}},da=us,ma=qs,fa=xi,ha=ia,pa=aa,vn=ua;const de=.75,me=.25,fe=16777215,ga=49979693;var va=function(e){return"#"+Ea(String(JSON.stringify(e)))};function ya(e){var t=ma(e),n=[];return t.forEach(function(s){var i=da(s);i&&n.push(vn(fa(i,"#"),{format:"array"}))}),n}function ba(e){var t=[0,0,0];return e.forEach(function(n){for(var s=0;s<3;s++)t[s]+=n[s]}),[t[0]/e.length,t[1]/e.length,t[2]/e.length]}function Ea(e){var t,n=ya(e);n.length>0&&(t=ba(n));var s=1,i=0,a=1;if(e.length>0)for(var o=0;o<e.length;o++)e[o].charCodeAt(0)>i&&(i=e[o].charCodeAt(0)),a=parseInt(fe/i),s=(s+e[o].charCodeAt(0)*a*ga)%fe;var r=(s*e.length%fe).toString(16);r=ha(r,6,r);var c=vn(r,{format:"array"});return t?pa(me*c[0]+de*t[0],me*c[1]+de*t[1],me*c[2]+de*t[2]):r}const xa=Gn(va);function Fa(e){return[...Ca].sort(()=>Math.random()-Math.random()).slice(0,e)}const Ca=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function yn(e){return[...Ia].sort(()=>Math.random()-Math.random()).slice(0,e)}const Ia=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];function Aa(){const e=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],t=Array.from({length:256},(i,a)=>a).sort(()=>Math.random()-.5),n=[...t,...t];function s(i,a,o){return i[0]*a+i[1]*o}return function(a,o){const r=Math.floor(a)&255,c=Math.floor(o)&255;a-=Math.floor(a),o-=Math.floor(o);const u=a*a*a*(a*(a*6-15)+10),l=o*o*o*(o*(o*6-15)+10),d=n[r]+c,m=n[r+1]+c;return(1+(s(e[n[d]&7],a,o)*(1-u)+s(e[n[m]&7],a-1,o)*u)*(1-l)+(s(e[n[d+1]&7],a,o-1)*(1-u)+s(e[n[m+1]&7],a-1,o-1)*u)*l)/2}}function Ae(e,t,n,s,i){const a=Aa(),o=Math.floor(e.x/F),r=Math.floor(e.y/F),c=Math.floor(s/4),u=.5,l=.005,d=.7;for(let h=r-c;h<=r+c;h++)for(let g=o-c;g<=o+c;g++)if(g>=0&&g<s&&h>=0&&h<i){let v=g,y=h;for(let I=0;I<t;I++)Math.random()<d&&(v+=Math.random()>.5?1:-1,y+=Math.random()>.5?1:-1);v=Math.max(0,Math.min(s-1,v)),y=Math.max(0,Math.min(i-1,y));const x=Math.sqrt((v-o)*(v-o)+(y-r)*(y-r))/c,b=a(g*l,h*l);if(x<1&&b>u+x*.01){const I=h*s+g;n[I].type=_.GROUND,n[I].depth=void 0,n[I].height=(1-x)*2*(b-u)}}const m=Math.min(Math.max(r*s+o,0),s);n[m].type=_.GROUND,n[m].depth=void 0,n[m].height=1}function Ta(e,t){return{x:Math.floor(Math.random()*(e*.8)+e*.1)*F,y:Math.floor(Math.random()*(t*.8)+t*.1)*F}}function Da(e,t,n,s){if(e.x<0||e.y<0||e.x>=n||e.y>=s)return!1;const i=Math.floor(n/(Math.sqrt(t.length+1)*2));return t.every(a=>Math.abs(e.x-a.x)>i||Math.abs(e.y-a.y)>i)}function Sa(e,t,n){return t.every(s=>Math.sqrt(Math.pow(e.x-s.position.x,2)+Math.pow(e.y-s.position.y,2))>=n)}function _a(e,t,n,s,i){const a=[],o=[],r=[],c=R*3,u=yn(e*2).filter(h=>h!==t),l=5,d=Fa(e*l*2),m=[];for(let h=0;h<e;h++){const g=`state-${h+1}`,v=h===0?t:u.pop(),y=Ma(g,v,h===0);a.push(y),a.forEach(b=>{y.strategies[b.id]=p.NEUTRAL,b.strategies[g]=p.NEUTRAL});const x=ka(m,n,s);m.push(x),Ae(x,n/2,i,n,s),Ba(g,x,l,d,o,r,c,i,n,s),y.population=o.filter(b=>b.stateId===g).reduce((b,I)=>b+I.population,0)}return wa(i,o),{states:a,cities:o,launchSites:r}}function Ma(e,t,n){return{id:e,name:t,color:xa(t),isPlayerControlled:n,strategies:{},lastStrategyUpdate:0,generalStrategy:n?void 0:[p.NEUTRAL,p.HOSTILE,p.FRIENDLY].sort(()=>Math.random()-.5)[0],population:0}}function ka(e,t,n){let s,i=10;do if(s=Ta(t,n),i--<=0)break;while(!Da(s,e,t,n));return s}function Ba(e,t,n,s,i,a,o,r,c,u){const l=[];for(let d=0;d<n;d++){const m=rt(t,l,o,30*F);l.push({position:m}),i.push({id:`city-${i.length+1}`,stateId:e,name:s.pop(),position:m,population:Math.floor(Math.random()*3e3)+1e3}),Ae(m,2,r,c,u)}for(const d of i){const m=r.filter(h=>{const g=h.position.x-d.position.x,v=h.position.y-d.position.y;return Math.sqrt(g*g+v*v)<O});for(const h of m){h.cityId=d.id;const g=h.position.x-d.position.x,v=h.position.y-d.position.y,y=Math.sqrt(g*g+v*v);h.population=Math.max(0,O-y)/O*kt}d.population=m.reduce((h,g)=>h+g.population,0)}for(let d=0;d<4;d++){const m=rt(t,l,o,15*F);l.push({position:m}),a.push({type:Bt.LAUNCH_SITE,id:`launch-site-${a.length+1}`,stateId:e,position:m,mode:Math.random()>.5?M.DEFENCE:M.ATTACK}),Ae(m,1,r,c,u)}return l}function rt(e,t,n,s){let i,a=10;do if(i={x:e.x+(Math.random()-.5)*s,y:e.y+(Math.random()-.5)*s},a--<=0)break;while(!Sa(i,t,n));return i}function wa(e,t){const n=new Map(e.map(i=>[i.id,i])),s=[];for(t.forEach(i=>{e.filter(o=>o.cityId===i.id).forEach(o=>{o.stateId=i.stateId,s.push(o)})});s.length>0;){const i=s.splice(0,1)[0];Ra(i,n).forEach(o=>{!o.stateId&&o.type===_.GROUND&&(o.stateId=i.stateId,s.push(o))})}}function Ra(e,t){const n=[];return[{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:-1},{dx:0,dy:1}].forEach(({dx:i,dy:a})=>{const o=`${e.position.x+i*F},${e.position.y+a*F}`,r=t.get(o);r&&n.push(r)}),n}function bn(e){return Object.fromEntries(e.states.map(t=>[t.id,t.population]))}function se(e){return e>=1e3?`${(e/1e3).toFixed(1)}M`:`${e.toFixed(0)}K`}function La(e,t){const n=[],s=new Map;e.forEach(a=>{s.set(`${a.position.x},${a.position.y}`,a)});const i=(a,o)=>{const r=s.get(`${o.x},${o.y}`);if(r&&r.stateId&&r.stateId!==t.id){const c=n.find(()=>a.id===r.id)??{...a,adjacentStateIds:new Set};n.includes(c)||n.push(c),c.adjacentStateIds.add(r.stateId)}};return e.forEach(a=>{a.stateId===t.id&&[{x:a.position.x,y:a.position.y-F},{x:a.position.x,y:a.position.y+F},{x:a.position.x-F,y:a.position.y},{x:a.position.x+F,y:a.position.y}].forEach(r=>i(a,r))}),Array.from(n)}let Oa=0;function ja(e,t,n){const s=[],i=La(e,t),a={};i.forEach(r=>{for(const c of r.adjacentStateIds)a[c]=(a[c]||0)+1});const o=Object.values(a).reduce((r,c)=>r+c,0);return i.forEach(r=>{if(r.stateId&&r.stateId===t.id){const c=Array.from(r.adjacentStateIds).reduce((d,m)=>d+a[m],0),u=c/o,l=Math.round(n*u)/c*(Math.random()*.1+.9);l>0&&s.push({id:String(Oa++),quantity:l,position:{x:r.position.x+F/2,y:r.position.y+F/2},rect:{left:r.position.x-F/2,top:r.position.y-F/2,right:r.position.x+F/2,bottom:r.position.y+F/2},stateId:t.id,order:{type:"stay"}})}}),s}function Pa({playerStateName:e,numberOfStates:t=3,groundWarfare:n}){const s=Math.max(200,Math.ceil(Math.sqrt(t)*10)),i=s,a=os(s,i),{states:o,cities:r,launchSites:c}=_a(t,e,s,i,a);rs(a,s,i);const u=[],l=[],d=[],m=[],h=[];if(n)for(const g of o)m.push(...ja(a,g,es));return{timestamp:0,states:o,cities:r,launchSites:c,sectors:a,units:m,missiles:u,explosions:l,interceptors:d,battles:h}}function L(e,t,n,s){return Math.sqrt(Math.pow(n-e,2)+Math.pow(s-t,2))}function Na(e){var n;if(e.lastLaunchGenerationTimestamp&&e.timestamp-e.lastLaunchGenerationTimestamp>ss)return;e.lastLaunchGenerationTimestamp=e.timestamp;const t=e.sectors.filter(s=>s.cityId&&s.population>0);for(const s of e.states){const i=e.cities.filter(l=>l.stateId===s.id),a=e.launchSites.filter(l=>l.stateId===s.id),o=e.cities.filter(l=>s.strategies[l.stateId]===p.HOSTILE&&l.stateId!==s.id&&l.population>0).map(l=>({...l,isCity:!0})),r=e.missiles.filter(l=>s.strategies[l.stateId]!==p.FRIENDLY&&l.stateId!==s.id),c=e.launchSites.filter(l=>s.strategies[l.stateId]===p.HOSTILE&&l.stateId!==s.id).map(l=>({...l,isCity:!1})),u=r.filter(l=>i.some(d=>Te(l.target,d.position,R+O))||a.some(d=>Te(l.target,d.position,R))).filter(l=>(e.timestamp-l.launchTimestamp)/(l.targetTimestamp-l.launchTimestamp)>.5);for(const l of e.launchSites.filter(d=>d.stateId===s.id)){if(l.nextLaunchTarget)continue;if(o.length===0&&c.length===0&&r.length===0)break;if(u.length===0&&l.mode===M.DEFENCE||u.length>0&&l.mode===M.ATTACK){l.modeChangeTimestamp||(l.modeChangeTimestamp=e.timestamp);continue}const d=ct(u.map(y=>({...y,isCity:!1})),l.position),m=e.missiles.filter(y=>y.stateId===s.id),h=e.interceptors.filter(y=>y.stateId===s.id),g=h.filter(y=>!y.targetMissileId&&l.id===y.launchSiteId),v=Ua(h,d).filter(([,y])=>y<a.length);if(l.mode===M.DEFENCE&&v.length>0){const y=v[0][0];g.length>0?g[0].targetMissileId=y:l.nextLaunchTarget={type:"missile",missileId:y}}else if(l.mode===M.ATTACK){const y=$a(ct([...c,...o],l.position),m),x=(n=y==null?void 0:y[0])==null?void 0:n[0];if(x!=null&&x.position&&(x!=null&&x.isCity)){const b=Ya(x,t);l.nextLaunchTarget={type:"position",position:b||{x:x.position.x+(Math.random()-Math.random())*O,y:x.position.y+(Math.random()-Math.random())*O}}}else l.nextLaunchTarget=x!=null&&x.position?{type:"position",position:x==null?void 0:x.position}:void 0}}}}function Te(e,t,n){return L(e.x,e.y,t.x,t.y)<=n}function ct(e,t){return e.sort((n,s)=>L(n.position.x,n.position.y,t.x,t.y)-L(s.position.x,s.position.y,t.x,t.y))}function $a(e,t){const n=new Map;for(const s of e)n.set(s,t.filter(i=>Te(i.target,s.position,R)).length);return Array.from(n).sort((s,i)=>s[1]-i[1])}function Ua(e,t){const n=new Map;for(const s of t)n.set(s.id,0);for(const s of e)s.targetMissileId&&n.set(s.targetMissileId,(n.get(s.targetMissileId)??0)+1);return Array.from(n).sort((s,i)=>s[1]-i[1])}function Ya(e,t){const n=t.filter(i=>i.cityId===e.id);return!n||n.length===0?null:n[Math.floor(Math.random()*n.length)].position}function za(e){var t,n;if(!(e.lastStrategyUpdateTimestamp&&e.timestamp-e.lastStrategyUpdateTimestamp>is)){e.lastStrategyUpdateTimestamp=e.timestamp;for(const s of e.missiles.filter(i=>i.launchTimestamp===e.timestamp)){const i=e.states.find(o=>o.id===s.stateId),a=((t=e.cities.find(o=>L(o.position.x,o.position.y,s.target.x,s.target.y)<=R+O))==null?void 0:t.stateId)||((n=e.launchSites.find(o=>L(o.position.x,o.position.y,s.target.x,s.target.y)<=R))==null?void 0:n.stateId);if(i&&a&&i.id!==a){i.strategies[a]!==p.HOSTILE&&(i.strategies[a]=p.HOSTILE);const o=e.states.find(r=>r.id===a);o&&o.strategies[i.id]!==p.HOSTILE&&(o.strategies[i.id]=p.HOSTILE,e.states.forEach(r=>{r.id!==o.id&&r.strategies[o.id]===p.FRIENDLY&&o.strategies[r.id]===p.FRIENDLY&&(r.strategies[i.id]=p.HOSTILE,i.strategies[r.id]=p.HOSTILE)}))}}for(const s of e.states.filter(i=>!i.isPlayerControlled))Ga(s,e)}}function Ga(e,t){if(e.lastStrategyUpdate&&t.timestamp-e.lastStrategyUpdate<Jn)return;e.lastStrategyUpdate=t.timestamp;const n=t.states.filter(o=>o.id!==e.id),s=n.filter(o=>e.strategies[o.id]===p.FRIENDLY&&o.strategies[e.id]===p.FRIENDLY);e.strategies={...e.strategies},n.forEach(o=>{o.strategies[e.id]===p.FRIENDLY&&e.strategies[o.id]===p.NEUTRAL&&(e.generalStrategy!==p.HOSTILE?e.strategies[o.id]=p.FRIENDLY:o.strategies[e.id]=p.NEUTRAL)}),n.forEach(o=>{o.strategies[e.id]===p.NEUTRAL&&e.strategies[o.id]===p.HOSTILE&&(lt(e,o,s,t)?e.strategies[o.id]=p.NEUTRAL:o.strategies[e.id]=p.HOSTILE)});const i=n.filter(o=>Object.values(o.strategies).every(r=>r!==p.HOSTILE)&&o.generalStrategy!==p.HOSTILE);if(i.length>0&&e.generalStrategy===p.FRIENDLY){const o=i[Math.floor(Math.random()*i.length)];e.strategies[o.id]=p.FRIENDLY}s.forEach(o=>{n.forEach(r=>{r.strategies[o.id]===p.HOSTILE&&e.strategies[r.id]!==p.HOSTILE&&(e.strategies[r.id]=p.HOSTILE)})}),n.filter(o=>o.strategies[e.id]!==p.FRIENDLY&&e.strategies[o.id]!==p.FRIENDLY).forEach(o=>{if(lt(o,e,s,t)){const r=t.launchSites.filter(c=>c.stateId===e.id&&!c.lastLaunchTimestamp);if(r.length>0){const c=r[Math.floor(Math.random()*r.length)],u=[...t.cities.filter(l=>l.stateId===o.id),...t.launchSites.filter(l=>l.stateId===o.id)];if(u.length>0){const l=u[Math.floor(Math.random()*u.length)];c.nextLaunchTarget={type:"position",position:l.position}}}}})}function lt(e,t,n,s){const i=s.states.filter(c=>e.strategies[c.id]===p.FRIENDLY&&c.strategies[e.id]===p.FRIENDLY&&c.id!==e.id),a=s.launchSites.filter(c=>c.stateId===e.id||i.some(u=>u.id===c.stateId)),o=s.launchSites.filter(c=>c.stateId===t.id||n.some(u=>u.id===c.stateId));return a.length<o.length?!0:s.missiles.some(c=>s.cities.some(u=>u.stateId===e.id&&L(u.position.x,u.position.y,c.target.x,c.target.y)<=R)||s.launchSites.some(u=>u.stateId===e.id&&L(u.position.x,u.position.y,c.target.x,c.target.y)<=R))}function Ha(e){for(const t of e.missiles){const n=(e.timestamp-t.launchTimestamp)/(t.targetTimestamp-t.launchTimestamp);t.position={x:t.launch.x+(t.target.x-t.launch.x)*n,y:t.launch.y+(t.target.y-t.launch.y)*n}}}function qa(e,t){e.interceptors=e.interceptors.filter(n=>{const s=e.missiles.find(c=>c.id===n.targetMissileId);s||(n.targetMissileId=void 0);const i=s?s.position.x-n.position.x:Math.cos(n.direction),a=s?s.position.y-n.position.y:Math.sin(n.direction),o=Math.sqrt(i*i+a*a);if(n.direction=Math.atan2(a,i),s&&o<=ee*t)n.position={...s.position};else{const c=ee*t/o;n.position={x:n.position.x+i*c,y:n.position.y+a*c}}return n.tail=[...n.tail.slice(-100),{timestamp:e.timestamp,position:n.position}],ee*(e.timestamp-n.launchTimestamp)<=n.maxRange})}function Xa(e){for(const t of e.interceptors){const n=e.missiles.find(s=>s.id===t.targetMissileId);n&&L(t.position.x,t.position.y,n.position.x,n.position.y)<Vn&&(e.missiles=e.missiles.filter(i=>i.id!==n.id),e.interceptors=e.interceptors.filter(i=>i.id!==t.id))}}function Va(e){for(const t of e.missiles.filter(n=>n.targetTimestamp<=e.timestamp)){const n=Wa(t);e.explosions.push(n),Ka(e,n),Za(e,n),Ja(e,n),Qa(e,n)}e.explosions=e.explosions.filter(t=>t.endTimestamp>=e.timestamp),e.missiles=e.missiles.filter(t=>t.targetTimestamp>e.timestamp)}function Wa(e){return{id:`explosion-${Math.random()}`,missileId:e.id,startTimestamp:e.targetTimestamp,endTimestamp:e.targetTimestamp+Kn,position:e.target,radius:R}}function Ka(e,t){for(const n of e.searchSector.byRadius(t.position,t.radius))if(n.population){const s=Math.max(Mt,n.population*_t);n.population=Math.max(0,n.population-s)}return e}function Za(e,t){const n=e.searchMissile.byRadius(t.position,t.radius).filter(s=>s.id!==t.missileId&&s.launchTimestamp<=t.startTimestamp&&s.targetTimestamp>=t.startTimestamp);for(const s of n)s.targetTimestamp=t.startTimestamp;e.interceptors=e.interceptors.filter(s=>!(s.launchTimestamp<=t.startTimestamp&&L(s.position.x,s.position.y,t.position.x,t.position.y)<=t.radius))}function Ja(e,t){const n=e.searchLaunchSite.byRadius(t.position,t.radius);e.launchSites=e.launchSites.filter(s=>!n.some(i=>i.id===s.id))}function Qa(e,t){const n=e.searchUnit.byRadius(t.position,t.radius);e.units=e.units.map(s=>{if(n.find(a=>a.id===s.id)){const a=Math.max(Mt,s.quantity*_t),o=Math.max(0,s.quantity-a);return{...s,quantity:o}}return s}),e.units=e.units.filter(s=>s.quantity>0)}function eo(e){for(const t of e.launchSites)t.modeChangeTimestamp&&e.timestamp>=t.modeChangeTimestamp+ve&&(t.mode=t.mode===M.ATTACK?M.DEFENCE:M.ATTACK,t.modeChangeTimestamp=void 0)}function to(e){var t,n;for(const s of e.launchSites)if(s.nextLaunchTarget&&!(s.lastLaunchTimestamp&&e.timestamp-s.lastLaunchTimestamp<(s.mode===M.ATTACK?ye:Zn))){if(s.mode===M.ATTACK&&((t=s.nextLaunchTarget)==null?void 0:t.type)==="position")e.missiles.push(no(s,s.nextLaunchTarget.position,e.timestamp));else if(s.mode===M.DEFENCE&&((n=s.nextLaunchTarget)==null?void 0:n.type)==="missile"){const i=s.nextLaunchTarget.missileId,a=e.searchMissile.byProperty("id",i)[0];a&&e.interceptors.push(so(s,e.timestamp,a))}s.lastLaunchTimestamp=e.timestamp,s.nextLaunchTarget=void 0}}function no(e,t,n){return{id:Math.random()+"",stateId:e.stateId,launchSiteId:e.id,launch:e.position,launchTimestamp:n,position:e.position,target:t,targetTimestamp:n+L(e.position.x,e.position.y,t.x,t.y)/we}}function so(e,t,n){return{id:Math.random()+"",stateId:e.stateId,launchSiteId:e.id,launch:e.position,launchTimestamp:t,position:e.position,direction:Math.atan2(e.position.y-n.position.y,e.position.x-n.position.x),tail:[],targetMissileId:n.id,maxRange:Re}}function io(e){const t=e.sectors.reduce((n,s)=>(s.cityId&&(n[s.cityId]=n[s.cityId]?n[s.cityId]+(s.population??0):s.population??0),n),{});for(const n of e.cities)n.population=t[n.id];e.states=e.states.map(n=>{const s=e.cities.filter(i=>i.stateId===n.id).reduce((i,a)=>i+a.population,0);return{...n,population:s}})}function ao(e){const t=[];for(const n of e.units){for(const i of t)if(n.rect.left<i.rect.right&&n.rect.right>i.rect.left&&n.rect.top<i.rect.bottom&&n.rect.bottom>i.rect.top){i.units.push(n),i.rect={left:Math.min(i.rect.left,n.rect.left),top:Math.min(i.rect.top,n.rect.top),right:Math.max(i.rect.right,n.rect.right),bottom:Math.max(i.rect.bottom,n.rect.bottom)},i.position={x:(i.rect.left+i.rect.right)/2,y:(i.rect.top+i.rect.bottom)/2},i.size=Math.max(i.rect.right-i.rect.left,i.rect.bottom-i.rect.top);break}const s=e.states.find(i=>i.id===n.stateId);for(const i of e.searchUnit.byRect(n.rect)){if(i.stateId===n.stateId||(s==null?void 0:s.strategies[i.stateId])!==p.HOSTILE)continue;const a={units:[n,i],rect:{left:Math.min(n.rect.left,i.rect.left),top:Math.min(n.rect.top,i.rect.top),right:Math.max(n.rect.right,i.rect.right),bottom:Math.max(n.rect.bottom,i.rect.bottom)},position:{x:(Math.min(n.rect.left,i.rect.left)+Math.max(n.rect.right,i.rect.right))/2,y:(Math.min(n.rect.top,i.rect.top)+Math.max(n.rect.bottom,i.rect.bottom))/2},size:Math.max(Math.abs(n.rect.right-i.rect.left),Math.abs(n.rect.bottom-i.rect.top))};t.push(a);break}}return t}function oo(e,t,n){for(const s of t){const i=s.units.reduce((o,r)=>(o[r.stateId]=(o[r.stateId]??0)+r.quantity,o),{}),a=Object.values(i).reduce((o,r)=>o=o+r,0);a&&s.units.forEach(o=>{o.quantity=Math.max(0,o.quantity-Math.max(ts*n,i[o.stateId]/a*n*ns*o.quantity))})}return e}function En(e,t){for(const n of t)if(n.units.find(s=>s.id===e.id))return!0;return!1}const xn=2;function Fn(e,t,n,s){const i=s.states.find(h=>h.id===t.stateId);if(!i||!e.stateId)return 0;const a=i.strategies[e.stateId];if(a!==p.HOSTILE&&e.stateId!==t.stateId)return-1e3;let o=0;uo(e,s)&&(o+=100),e.population>0&&(o+=50);const c=ro(e,t.stateId,n,i.strategies);o+=c*10;const u=co(e,t.stateId,n,i.strategies);o+=u*5;const l=lo(e,t.stateId,n);o+=l*20;const m=(ie(e,s)+mo(e,s))/xn;switch(o-=m*30,a){case p.HOSTILE:o*=1.5;break;case p.FRIENDLY:o*=.5;break;case p.NEUTRAL:o*=.25;break}return o}function ro(e,t,n,s){return n.filter(a=>Math.abs(a.position.x-e.position.x)<=F&&Math.abs(a.position.y-e.position.y)<=F&&(a.stateId===t||a.stateId&&s[a.stateId]===p.FRIENDLY)).length}function co(e,t,n,s){const i=n.filter(o=>Math.abs(o.position.x-e.position.x)<=F&&Math.abs(o.position.y-e.position.y)<=F);return i.filter(o=>o.stateId===t||o.stateId&&s[o.stateId]===p.FRIENDLY).length/i.length}function lo(e,t,n){const s=n.filter(u=>u.stateId===t),i=s.reduce((u,l)=>u+l.position.x,0)/s.length,a=s.reduce((u,l)=>u+l.position.y,0)/s.length,o=Math.sqrt((e.position.x-i)**2+(e.position.y-a)**2),r=Math.sqrt(F*F*2)*Math.sqrt(n.length);return 1-o/r}function uo(e,t){return t.searchLaunchSite.byRect(e.rect).filter(n=>n.stateId!==e.stateId)[0]}function ie(e,t){return t.searchUnit.byRect(e.rect).length}function mo(e,t){return t.units.filter(n=>n.order.type==="move"&&fo(n.order.targetPosition,e)).length}function fo(e,t){return e.x>=t.rect.left&&e.x<=t.rect.right&&e.y>=t.rect.top&&e.y<=t.rect.bottom}function ho(e,t){for(const n of e.units){if(n.lastOrderTimestamp&&e.timestamp-n.lastOrderTimestamp<as)continue;const s=e.searchSector.byRadius(n.position,1)[0];if(!s)continue;const i=e.states.find(c=>c.id===n.stateId);if(!i)continue;if(En(n,t)){const c=t.find(u=>u.units.includes(n));if(c&&go(n,c)){const u=vo(n,e,t);if(u){n.order={type:"move",targetPosition:te(u)},n.lastOrderTimestamp=e.timestamp;continue}}}const a=po(n,i,e);if(a){n.order={type:"move",targetPosition:a.position},n.lastOrderTimestamp=e.timestamp;continue}const o=e.searchSector.byRect({left:s.rect.left-F,top:s.rect.top-F,right:s.rect.right+F,bottom:s.rect.bottom+F}).filter(c=>c.type===_.GROUND&&c.stateId),r=o.filter(c=>c.stateId!==n.stateId&&i.strategies[c.stateId]===p.HOSTILE);if(r.length>0){const c=yo(n,r,o,e);n.order={type:"move",targetPosition:te(c)}}else if(Cn(s,e)){const u=xo(n,i,o,e);u?n.order={type:"move",targetPosition:te(u)}:n.order={type:"stay"}}else{const u=bo(n,i,e,e.searchSector.byRadius(n.position,F*5).filter(l=>l.type===_.GROUND));u?n.order={type:"move",targetPosition:u.position}:n.order={type:"stay"}}n.lastOrderTimestamp=e.timestamp}}function po(e,t,n){return n.searchUnit.byRadius(e.position,D*2).find(i=>i.stateId!==e.stateId&&t.strategies[i.stateId]===p.HOSTILE&&i.quantity<e.quantity)}function go(e,t){const n=t.units.reduce((i,a)=>i+a.quantity,0);return e.quantity/n<.4}function vo(e,t,n){var i;return(i=t.searchSector.byRadius(e.position,F*5).filter(a=>a.stateId===e.stateId&&a.type===_.GROUND).reduce((a,o)=>{const r=Math.sqrt((e.position.x-o.position.x)**2+(e.position.y-o.position.y)**2),u=t.searchUnit.byRect(o.rect).some(d=>d.stateId!==e.stateId),l=n.some(d=>d.units.some(m=>m.rect.left<o.rect.right&&m.rect.right>o.rect.left&&m.rect.top<o.rect.bottom&&m.rect.bottom>o.rect.top));return!u&&!l&&(!a||r<a.distance)?{sector:o,distance:r}:a},void 0))==null?void 0:i.sector}function yo(e,t,n,s){let i=t[0],a=-1/0;for(const o of t){const r=Fn(o,e,n,s);r>a&&(a=r,i=o)}return i}function te(e){return{x:(e.rect.left+e.rect.right)/2,y:(e.rect.top+e.rect.bottom)/2}}function bo(e,t,n,s){const a=s.filter(r=>r.stateId!==e.stateId&&r.stateId&&t.strategies[r.stateId]===p.HOSTILE).map(r=>({sector:r,value:Fn(r,e,s,n),distance:Math.sqrt((e.position.x-r.position.x)**2+(e.position.y-r.position.y)**2)}));a.sort((r,c)=>c.value!==r.value?c.value-r.value:r.distance-c.distance);const o=a[0];if(o)return{position:te(o.sector),type:"sector"}}function Cn(e,t){return ie(e,t)+De(e,t)>xn}function De(e,t){return t.units.filter(n=>n.order.type==="move"&&Eo(n.order.targetPosition,e)).length}function Eo(e,t){return e.x>=t.rect.left&&e.x<=t.rect.right&&e.y>=t.rect.top&&e.y<=t.rect.bottom}function xo(e,t,n,s){const i=n.filter(a=>a.stateId===e.stateId||a.stateId&&t.strategies[a.stateId]===p.FRIENDLY);return i.sort((a,o)=>{const r=ie(a,s)+De(a,s),c=ie(o,s)+De(o,s);return r-c}),i.find(a=>!Cn(a,s)&&!Fo(a,t,s))}function Fo(e,t,n){return n.searchUnit.byRect(e.rect).some(i=>i.stateId!==e.stateId&&t.strategies[i.stateId]===p.NEUTRAL)}function Co(e,t){const n=ao(e);oo(e.units,n,t),Io(e,t,n),Ao(e),ho(e,n),e.units=e.units.filter(s=>s.quantity>0),e.battles=n.map(s=>({...s,position:{x:(s.rect.left+s.rect.right)/2,y:(s.rect.top+s.rect.bottom)/2}}))}function Io(e,t,n){for(const s of e.units){if(s.order.type!=="move"||En(s,n)&&!To(s,e))continue;const i={x:s.order.targetPosition.x-s.position.x,y:s.order.targetPosition.y-s.position.y},a=Math.sqrt(i.x**2+i.y**2),o=Qn*t;if(a<=o)s.position=s.order.targetPosition,s.order={type:"stay"};else{const r={x:i.x/a,y:i.y/a};s.position={x:s.position.x+r.x*o,y:s.position.y+r.y*o}}s.rect={left:s.position.x-D/2,top:s.position.y-D/2,right:s.position.x+D/2,bottom:s.position.y+D/2}}}function Ao(e){e.units.forEach(t=>{const n=e.searchSector.byRadius(t.position,1)[0];if(!n||n.stateId===t.stateId)return;const s=e.searchUnit.byRect(n.rect);if(Object.values(s.reduce((a,o)=>(a[o.stateId]=!0,a),{[t.stateId]:!0})).length===1){if(n.stateId=t.stateId,n.cityId){const o=e.cities.find(r=>r.id===n.cityId);o&&o.stateId!==t.stateId&&e.searchSector.byRadius(o.position,O).filter(u=>u.cityId===o.id&&u.population>0).every(u=>u.stateId===t.stateId)&&(o.stateId=t.stateId)}const a=e.searchLaunchSite.byRect(n.rect).filter(o=>o.stateId!==t.stateId)[0];a&&(a.stateId=t.stateId)}})}function To(e,t){if(e.order.type!=="move")return!1;const n=t.searchSector.byRadius(e.order.targetPosition,1)[0];if(!n||n.stateId!==e.stateId)return!1;const s=t.searchUnit.byRect(n.rect);for(const i of s)if(i.stateId!==e.stateId)return!1;return!0}class Do{constructor(){this.ids=[],this.values=[],this.length=0}clear(){this.length=0}push(t,n){let s=this.length++;for(;s>0;){const i=s-1>>1,a=this.values[i];if(n>=a)break;this.ids[s]=this.ids[i],this.values[s]=a,s=i}this.ids[s]=t,this.values[s]=n}pop(){if(this.length===0)return;const t=this.ids[0];if(this.length--,this.length>0){const n=this.ids[0]=this.ids[this.length],s=this.values[0]=this.values[this.length],i=this.length>>1;let a=0;for(;a<i;){let o=(a<<1)+1;const r=o+1;let c=this.ids[o],u=this.values[o];const l=this.values[r];if(r<this.length&&l<u&&(o=r,c=this.ids[r],u=l),u>=s)break;this.ids[a]=c,this.values[a]=u,a=o}this.ids[a]=n,this.values[a]=s}return t}peek(){if(this.length!==0)return this.ids[0]}peekValue(){if(this.length!==0)return this.values[0]}shrink(){this.ids.length=this.values.length=this.length}}const ut=[Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array],he=3;class Pe{static from(t,n=0){if(n%8!==0)throw new Error("byteOffset must be 8-byte aligned.");if(!t||t.byteLength===void 0||t.buffer)throw new Error("Data must be an instance of ArrayBuffer or SharedArrayBuffer.");const[s,i]=new Uint8Array(t,n+0,2);if(s!==251)throw new Error("Data does not appear to be in a Flatbush format.");const a=i>>4;if(a!==he)throw new Error(`Got v${a} data when expected v${he}.`);const o=ut[i&15];if(!o)throw new Error("Unrecognized array type.");const[r]=new Uint16Array(t,n+2,1),[c]=new Uint32Array(t,n+4,1);return new Pe(c,r,o,void 0,t,n)}constructor(t,n=16,s=Float64Array,i=ArrayBuffer,a,o=0){if(t===void 0)throw new Error("Missing required argument: numItems.");if(isNaN(t)||t<=0)throw new Error(`Unexpected numItems value: ${t}.`);this.numItems=+t,this.nodeSize=Math.min(Math.max(+n,2),65535),this.byteOffset=o;let r=t,c=r;this._levelBounds=[r*4];do r=Math.ceil(r/this.nodeSize),c+=r,this._levelBounds.push(c*4);while(r!==1);this.ArrayType=s,this.IndexArrayType=c<16384?Uint16Array:Uint32Array;const u=ut.indexOf(this.ArrayType),l=c*4*this.ArrayType.BYTES_PER_ELEMENT;if(u<0)throw new Error(`Unexpected typed array class: ${s}.`);a&&a.byteLength!==void 0&&!a.buffer?(this.data=a,this._boxes=new this.ArrayType(this.data,o+8,c*4),this._indices=new this.IndexArrayType(this.data,o+8+l,c),this._pos=c*4,this.minX=this._boxes[this._pos-4],this.minY=this._boxes[this._pos-3],this.maxX=this._boxes[this._pos-2],this.maxY=this._boxes[this._pos-1]):(this.data=new i(8+l+c*this.IndexArrayType.BYTES_PER_ELEMENT),this._boxes=new this.ArrayType(this.data,8,c*4),this._indices=new this.IndexArrayType(this.data,8+l,c),this._pos=0,this.minX=1/0,this.minY=1/0,this.maxX=-1/0,this.maxY=-1/0,new Uint8Array(this.data,0,2).set([251,(he<<4)+u]),new Uint16Array(this.data,2,1)[0]=n,new Uint32Array(this.data,4,1)[0]=t),this._queue=new Do}add(t,n,s=t,i=n){const a=this._pos>>2,o=this._boxes;return this._indices[a]=a,o[this._pos++]=t,o[this._pos++]=n,o[this._pos++]=s,o[this._pos++]=i,t<this.minX&&(this.minX=t),n<this.minY&&(this.minY=n),s>this.maxX&&(this.maxX=s),i>this.maxY&&(this.maxY=i),a}finish(){if(this._pos>>2!==this.numItems)throw new Error(`Added ${this._pos>>2} items when expected ${this.numItems}.`);const t=this._boxes;if(this.numItems<=this.nodeSize){t[this._pos++]=this.minX,t[this._pos++]=this.minY,t[this._pos++]=this.maxX,t[this._pos++]=this.maxY;return}const n=this.maxX-this.minX||1,s=this.maxY-this.minY||1,i=new Uint32Array(this.numItems),a=65535;for(let o=0,r=0;o<this.numItems;o++){const c=t[r++],u=t[r++],l=t[r++],d=t[r++],m=Math.floor(a*((c+l)/2-this.minX)/n),h=Math.floor(a*((u+d)/2-this.minY)/s);i[o]=_o(m,h)}Se(i,t,this._indices,0,this.numItems-1,this.nodeSize);for(let o=0,r=0;o<this._levelBounds.length-1;o++){const c=this._levelBounds[o];for(;r<c;){const u=r;let l=t[r++],d=t[r++],m=t[r++],h=t[r++];for(let g=1;g<this.nodeSize&&r<c;g++)l=Math.min(l,t[r++]),d=Math.min(d,t[r++]),m=Math.max(m,t[r++]),h=Math.max(h,t[r++]);this._indices[this._pos>>2]=u,t[this._pos++]=l,t[this._pos++]=d,t[this._pos++]=m,t[this._pos++]=h}}}search(t,n,s,i,a){if(this._pos!==this._boxes.length)throw new Error("Data not yet indexed - call index.finish().");let o=this._boxes.length-4;const r=[],c=[];for(;o!==void 0;){const u=Math.min(o+this.nodeSize*4,mt(o,this._levelBounds));for(let l=o;l<u;l+=4){if(s<this._boxes[l]||i<this._boxes[l+1]||t>this._boxes[l+2]||n>this._boxes[l+3])continue;const d=this._indices[l>>2]|0;o>=this.numItems*4?r.push(d):(a===void 0||a(d))&&c.push(d)}o=r.pop()}return c}neighbors(t,n,s=1/0,i=1/0,a){if(this._pos!==this._boxes.length)throw new Error("Data not yet indexed - call index.finish().");let o=this._boxes.length-4;const r=this._queue,c=[],u=i*i;e:for(;o!==void 0;){const l=Math.min(o+this.nodeSize*4,mt(o,this._levelBounds));for(let d=o;d<l;d+=4){const m=this._indices[d>>2]|0,h=dt(t,this._boxes[d],this._boxes[d+2]),g=dt(n,this._boxes[d+1],this._boxes[d+3]),v=h*h+g*g;v>u||(o>=this.numItems*4?r.push(m<<1,v):(a===void 0||a(m))&&r.push((m<<1)+1,v))}for(;r.length&&r.peek()&1;)if(r.peekValue()>u||(c.push(r.pop()>>1),c.length===s))break e;o=r.length?r.pop()>>1:void 0}return r.clear(),c}}function dt(e,t,n){return e<t?t-e:e<=n?0:e-n}function mt(e,t){let n=0,s=t.length-1;for(;n<s;){const i=n+s>>1;t[i]>e?s=i:n=i+1}return t[n]}function Se(e,t,n,s,i,a){if(Math.floor(s/a)>=Math.floor(i/a))return;const o=e[s+i>>1];let r=s-1,c=i+1;for(;;){do r++;while(e[r]<o);do c--;while(e[c]>o);if(r>=c)break;So(e,t,n,r,c)}Se(e,t,n,s,c,a),Se(e,t,n,c+1,i,a)}function So(e,t,n,s,i){const a=e[s];e[s]=e[i],e[i]=a;const o=4*s,r=4*i,c=t[o],u=t[o+1],l=t[o+2],d=t[o+3];t[o]=t[r],t[o+1]=t[r+1],t[o+2]=t[r+2],t[o+3]=t[r+3],t[r]=c,t[r+1]=u,t[r+2]=l,t[r+3]=d;const m=n[s];n[s]=n[i],n[i]=m}function _o(e,t){let n=e^t,s=65535^n,i=65535^(e|t),a=e&(t^65535),o=n|s>>1,r=n>>1^n,c=i>>1^s&a>>1^i,u=n&i>>1^a>>1^a;n=o,s=r,i=c,a=u,o=n&n>>2^s&s>>2,r=n&s>>2^s&(n^s)>>2,c^=n&i>>2^s&a>>2,u^=s&i>>2^(n^s)&a>>2,n=o,s=r,i=c,a=u,o=n&n>>4^s&s>>4,r=n&s>>4^s&(n^s)>>4,c^=n&i>>4^s&a>>4,u^=s&i>>4^(n^s)&a>>4,n=o,s=r,i=c,a=u,c^=n&i>>8^s&a>>8,u^=s&i>>8^(n^s)&a>>8,n=c^c>>1,s=u^u>>1;let l=e^t,d=s|65535^(l|n);return l=(l|l<<8)&16711935,l=(l|l<<4)&252645135,l=(l|l<<2)&858993459,l=(l|l<<1)&1431655765,d=(d|d<<8)&16711935,d=(d|d<<4)&252645135,d=(d|d<<2)&858993459,d=(d|d<<1)&1431655765,(d<<1|l)>>>0}function Mo(e){return{...e,searchUnit:U(e.units),searchSector:U(e.sectors,"sectors"),searchCity:U(e.cities),searchLaunchSite:U(e.launchSites),searchMissile:U(e.missiles),searchInterceptor:U(e.interceptors)}}const pe={};function U(e,t){if(t&&pe[t])return pe[t];e=[...e];const n=e.length===0?void 0:new Pe(e.length);for(const a of e)"rect"in a?n==null||n.add(a.rect.left,a.rect.top,a.rect.right,a.rect.bottom):"position"in a&&(n==null||n.add(a.position.x,a.position.y,a.position.x,a.position.y));n==null||n.finish();const s=new Map,i={byRect:a=>(n==null?void 0:n.search(a.left,a.top,a.right,a.bottom).map(o=>e[o]))??[],byRadius:(a,o)=>(n==null?void 0:n.neighbors(a.x,a.y,void 0,o).map(r=>e[r]))??[],byProperty:(a,o)=>{if(!s.has(a)){const r=s.set(a,new Map).get(a);e.forEach(c=>{if(a in c){const u=c[a];r.has(u)||r.set(u,[]),r.get(u).push(c)}})}return s.get(a).get(o)??[]},resetPropertyCache:()=>{s.clear()}};return t&&(pe[t]=i),i}function ko(e,t){for(;t>0;){const n=Bo(e,t>K?K:t);t=t>K?t-K:0,e=n}return e}function Bo(e,t){const n=e.timestamp+t,s=Mo({timestamp:n,states:e.states,cities:e.cities,launchSites:e.launchSites,missiles:e.missiles,interceptors:e.interceptors,units:e.units,explosions:e.explosions,sectors:e.sectors,battles:e.battles});return Co(s,t),Ha(s),qa(s,t),Xa(s),Va(s),eo(s),to(s),io(s),Na(s),za(s),s}function wo(e,t,n){const[s,i]=E.useState(()=>Pa({playerStateName:e,numberOfStates:t+1,groundWarfare:n})),a=E.useCallback((o,r)=>i(ko(o,r)),[]);return{worldState:s,updateWorldState:a,setWorldState:i}}const In={x:0,y:0,pointingObjects:[]},Ro=(e,t)=>t.type==="move"?{x:t.x,y:t.y,pointingObjects:e.pointingObjects}:t.type==="point"&&!e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:[...e.pointingObjects,t.object]}:t.type==="unpoint"&&e.pointingObjects.some(n=>n.id===t.object.id)?{x:e.x,y:e.y,pointingObjects:e.pointingObjects.filter(n=>n.id!==t.object.id)}:e,Lo=E.createContext(In),Ne=E.createContext(()=>{});function Oo({children:e}){const[t,n]=E.useReducer(Ro,In);return f.jsx(Lo.Provider,{value:t,children:f.jsx(Ne.Provider,{value:n,children:e})})}function jo(){const e=E.useContext(Ne);return(t,n)=>e({type:"move",x:t,y:n})}function $e(){const e=E.useContext(Ne);return[t=>e({type:"point",object:t}),t=>e({type:"unpoint",object:t})]}const Ue={},Po=(e,t)=>t.type==="clear"?Ue:t.type==="set"?{...e,selectedObject:t.object}:e,An=E.createContext(Ue),Tn=E.createContext(()=>{});function No({children:e}){const[t,n]=E.useReducer(Po,Ue);return f.jsx(An.Provider,{value:t,children:f.jsx(Tn.Provider,{value:n,children:e})})}function $o(e){var s;const t=E.useContext(Tn);return[((s=E.useContext(An).selectedObject)==null?void 0:s.id)===e.id,()=>t({type:"set",object:e})]}function X(e,t){const n=new CustomEvent(e,{bubbles:!0,detail:t});document.dispatchEvent(n)}function ce(e,t){E.useEffect(()=>{const n=s=>{t(s.detail)};return document.addEventListener(e,n,!1),()=>{document.removeEventListener(e,n,!1)}},[e,t])}const Uo=N.memo(({sectors:e,states:t})=>{const n=E.useRef(null),[s,i]=$e(),[a,o]=E.useState(0);return ce("cityDamage",()=>{o(a+1)}),E.useEffect(()=>{const r=n.current,c=r==null?void 0:r.getContext("2d");if(!r||!c)return;const u=Math.min(...e.map(b=>b.rect.left)),l=Math.min(...e.map(b=>b.rect.top)),d=Math.max(...e.map(b=>b.rect.right)),m=Math.max(...e.map(b=>b.rect.bottom)),h=d-u,g=m-l;r.width=h,r.height=g,r.style.width=`${h}px`,r.style.height=`${g}px`;const v=Math.max(...e.filter(b=>b.type===_.WATER).map(b=>b.depth||0)),y=Math.max(...e.filter(b=>b.type===_.GROUND).map(b=>b.height||0)),x=new Map(t.map(b=>[b.id,b.color]));c.clearRect(0,0,h,g),e.forEach(b=>{const{fillStyle:I,drawSector:j}=Yo(b,v,y,x);c.fillStyle=I,j(c,b.rect,u,l)})},[a]),E.useEffect(()=>{const r=n.current;let c;const u=l=>{const d=r==null?void 0:r.getBoundingClientRect(),m=l.clientX-((d==null?void 0:d.left)||0),h=l.clientY-((d==null?void 0:d.top)||0),g=e.find(v=>m>=v.rect.left&&m<=v.rect.right&&h>=v.rect.top&&h<=v.rect.bottom);g&&(c&&i(c),s(g),c=g)};return r==null||r.addEventListener("mousemove",u),()=>{r==null||r.removeEventListener("mousemove",u)}},[e,s,i]),f.jsx("canvas",{ref:n,style:{opacity:.5}})});function Yo(e,t,n,s){const i=zo(e,t,n),a=e.stateId?s.get(e.stateId):void 0;return{fillStyle:i,drawSector:(o,r,c,u)=>{o.fillStyle=i,o.fillRect(r.left-c,r.top-u,r.right-r.left,r.bottom-r.top),a&&(o.fillStyle=`${a}80`,o.fillRect(r.left-c,r.top-u,r.right-r.left,r.bottom-r.top)),e.cityId&&e.population>0&&Ho(o,r,c,u)}}}function zo(e,t,n){switch(e.type){case _.GROUND:return e.cityId?Go(e):qo(e.height||0,n);case _.WATER:return Xo(e.depth||0,t);default:return"rgb(0, 34, 93)"}}function Go(e){if(e.population===0)return"rgba(0,0,0,0.7)";const t=e.population?Math.min(e.population/kt,1):0,n=e.height?e.height/100:0,i=[200,200,200].map(a=>a-50*t+20*n);return`rgb(${i[0]}, ${i[1]}, ${i[2]})`}function Ho(e,t,n,s){e.fillStyle="rgba(0, 0, 0, 0.2)",e.fillRect(t.left-n+2,t.top-s+2,t.right-t.left-4,t.bottom-t.top-4),e.fillStyle="rgba(255, 255, 255, 0.6)",e.fillRect(t.left-n+4,t.top-s+4,t.right-t.left-8,t.bottom-t.top-8)}function qo(e,t){const n=e/t;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const s=Math.round(34+67*((n-.5)/.3)),i=Math.round(100+-33*((n-.5)/.3)),a=Math.round(34+-1*((n-.5)/.3));return`rgb(${s}, ${i}, ${a})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}function Xo(e,t){const n=e/t,s=Math.round(0+34*(1-n)),i=Math.round(137+-103*n),a=Math.round(178+-85*n);return`rgb(${s}, ${i}, ${a})`}function Vo({state:e,sectors:t}){const n=N.useMemo(()=>{const s=t.filter(i=>i.stateId===e.id);return Ko(s)},[]);return f.jsx(f.Fragment,{children:f.jsx(Wo,{style:{transform:`translate(${n.x}px, ${n.y}px) translate(-50%, -50%)`,color:e.color},children:e.name})})}const Wo=C.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;function Ko(e){if(e.length===0)return{x:0,y:0};const t=e.reduce((n,s)=>({x:n.x+(s.rect.left+s.rect.right)/2,y:n.y+(s.rect.top+s.rect.bottom)/2}),{x:0,y:0});return{x:t.x/e.length,y:t.y/e.length}}function Zo({city:e}){const[t,n]=$e(),s=e.population;if(!s)return null;const i=se(s);return f.jsxs(Jo,{onMouseEnter:()=>t(e),onMouseLeave:()=>n(e),style:{"--x":e.position.x,"--y":e.position.y},children:[f.jsx("span",{children:e.name}),f.jsxs(Qo,{children:[i," population"]})]})}const Jo=C.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`,Qo=C.div`
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
`;function er({launchSite:e,worldTimestamp:t,isPlayerControlled:n}){const[s,i]=$o(e),[a,o]=$e(),r=e.lastLaunchTimestamp&&e.lastLaunchTimestamp+ye>t,c=r?(t-e.lastLaunchTimestamp)/ye:0,u=e.modeChangeTimestamp&&t<e.modeChangeTimestamp+ve,l=u?(t-e.modeChangeTimestamp)/ve:0;return f.jsx(tr,{onMouseEnter:()=>a(e),onMouseLeave:()=>o(e),onClick:()=>n&&i(),style:{"--x":e.position.x,"--y":e.position.y,"--cooldown-progress":c,"--mode-change-progress":l},"data-selected":s,"data-cooldown":r,"data-mode":e.mode,"data-changing-mode":u,children:f.jsx(nr,{children:e.mode===M.ATTACK?"A":"D"})})}const tr=C.div`
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
`,nr=C.span`
  z-index: 1;
`;function Dn(e,t){t===void 0&&(t=!0);var n=E.useRef(null),s=E.useRef(!1),i=E.useRef(e);i.current=e;var a=E.useCallback(function(r){s.current&&(i.current(r),n.current=requestAnimationFrame(a))},[]),o=E.useMemo(function(){return[function(){s.current&&(s.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){s.current||(s.current=!0,n.current=requestAnimationFrame(a))},function(){return s.current}]},[]);return E.useEffect(function(){return t&&o[1](),o[0]},[]),o}function sr(e,t,n){if(t.startTimestamp>n||t.endTimestamp<n)return;const s=Math.pow(Math.min(Math.max(0,(n-t.startTimestamp)/(t.endTimestamp-t.startTimestamp)),1),.15);e.fillStyle=`rgb(${255*s}, ${255*(1-s)}, 0)`,e.beginPath(),e.arc(t.position.x,t.position.y,t.radius*s,0,2*Math.PI),e.fill()}function ir(e,t,n){t.launchTimestamp>n||t.targetTimestamp<n||(e.fillStyle="rgb(255, 0, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,2,0,2*Math.PI),e.fill())}function ar(e,t){e.fillStyle="rgb(0, 255, 0)",e.beginPath(),e.arc(t.position.x,t.position.y,1,0,2*Math.PI),e.fill()}function ft(e,t,n){if(!(t.launchTimestamp>n))if("targetTimestamp"in t){if(t.targetTimestamp<n)return;or(e,t,n)}else rr(e,t,n)}function or(e,t,n){const s=Math.min(Math.max(n-5,t.launchTimestamp)-t.launchTimestamp,t.targetTimestamp-t.launchTimestamp),i=t.targetTimestamp-t.launchTimestamp,a=i>0?s/i:0,o=t.launch.x+(t.position.x-t.launch.x)*a,r=t.launch.y+(t.position.y-t.launch.y)*a,c={x:o,y:r},u=e.createLinearGradient(c.x,c.y,t.position.x,t.position.y);u.addColorStop(0,"rgba(255, 255, 255, 0)"),u.addColorStop(1,"rgba(255, 255, 255, 0.5)"),e.strokeStyle=u,e.lineWidth=1,e.beginPath(),e.moveTo(c.x,c.y),e.lineTo(t.position.x,t.position.y),e.stroke()}function rr(e,t,n){const i=Math.max(n-5,t.launchTimestamp),a=t.tail.filter(r=>r.timestamp>=i);if(a.length<2)return;e.beginPath(),e.moveTo(a[0].position.x,a[0].position.y);for(let r=1;r<a.length;r++)e.lineTo(a[r].position.x,a[r].position.y);e.lineTo(t.position.x,t.position.y);const o=e.createLinearGradient(a[0].position.x,a[0].position.y,t.position.x,t.position.y);o.addColorStop(0,"rgba(0, 255, 0, 0)"),o.addColorStop(1,"rgba(0, 255, 0, 0.5)"),e.strokeStyle=o,e.lineWidth=1,e.stroke()}function cr(e,t){if(Math.sqrt(Math.pow(t.position.x-t.launch.x,2)+Math.pow(t.position.y-t.launch.y,2))>Re)for(let o=0;o<5;o++){const r=Math.PI*2/5*o,c=t.position.x+Math.cos(r)*3,u=t.position.y+Math.sin(r)*3;e.fillStyle="rgba(0, 255, 0, 0.5)",e.beginPath(),e.arc(c,u,1,0,2*Math.PI),e.fill()}}function lr({state:e}){const t=E.useRef(null);return E.useLayoutEffect(()=>{const s=t.current;if(!s)return;const i=Math.min(...e.sectors.map(l=>l.rect.left)),a=Math.min(...e.sectors.map(l=>l.rect.top)),o=Math.max(...e.sectors.map(l=>l.rect.right)),r=Math.max(...e.sectors.map(l=>l.rect.bottom)),c=o-i,u=r-a;s.width=c,s.height=u,s.style.width=`${c}px`,s.style.height=`${u}px`},[e.sectors]),Dn(()=>{const s=t.current;if(!s)return;const i=s.getContext("2d");i&&(i.clearRect(0,0,s.width,s.height),e.missiles.forEach(a=>{ft(i,a,e.timestamp)}),e.interceptors.forEach(a=>{ft(i,a,e.timestamp)}),e.missiles.filter(a=>a.launchTimestamp<e.timestamp&&a.targetTimestamp>e.timestamp).forEach(a=>{ir(i,a,e.timestamp)}),e.interceptors.filter(a=>a.launchTimestamp<e.timestamp).forEach(a=>{ar(i,a),ee*(e.timestamp-a.launchTimestamp+1)>Re&&cr(i,a)}),e.explosions.filter(a=>a.startTimestamp<e.timestamp&&a.endTimestamp>e.timestamp).forEach(a=>{sr(i,a,e.timestamp)}),e.battles.forEach(a=>{ur(i,a)}))}),f.jsx(dr,{ref:t})}function ur(e,t){const{position:n,size:s}=t;e.strokeStyle="rgba(255, 0, 0, 0.5)",e.lineWidth=2;const i=1+.2*Math.sin(Date.now()/200),a=s/2*i;e.beginPath(),e.arc(n.x,n.y,a,0,2*Math.PI),e.stroke();const o=s/4,r=o/10;e.fillStyle="rgba(255, 0, 0, 0.7)",e.save(),e.translate(n.x,n.y),e.rotate(Math.PI/4),e.fillRect(-r/2,-o/2,r,o),e.restore(),e.save(),e.translate(n.x,n.y),e.rotate(-Math.PI/4),e.fillRect(-r/2,-o/2,r,o),e.restore()}const dr=C.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`,mr=({worldStateRef:e})=>{const t=E.useRef(null);E.useEffect(()=>{const s=t.current;if(!s)return;const i=s.getContext("2d");if(!i)return;let a;const o=e.current;if(!o)return;const r=o.sectors,c=Math.min(...r.map(v=>v.rect.left)),u=Math.min(...r.map(v=>v.rect.top)),l=Math.max(...r.map(v=>v.rect.right)),d=Math.max(...r.map(v=>v.rect.bottom)),m=l-c,h=d-u;(s.width!==m||s.height!==h)&&(s.width=m,s.height=h,s.style.width=`${m}px`,s.style.height=`${h}px`);const g=()=>{const v=e.current;v&&(i.clearRect(0,0,s.width,s.height),i.save(),n(i,v),i.restore(),a=requestAnimationFrame(g))};return g(),()=>{cancelAnimationFrame(a)}},[e]);const n=(s,i)=>{const a={};i.units.forEach(o=>{const r=o.stateId;a[r]||(a[r]=[]),a[r].push(o)}),Object.entries(a).forEach(([o,r])=>{const c=i.states.find(l=>l.id===o),u=c?c.color:"#000000";s.fillStyle=u,s.strokeStyle="#000000",s.lineWidth=1,r.forEach(l=>{s.fillRect(l.position.x-D/2,l.position.y-D/2,D,D),s.strokeRect(l.position.x-D/2,l.position.y-D/2,D,D),s.beginPath(),s.moveTo(l.position.x-D/2,l.position.y-D/2),s.lineTo(l.position.x+D/2,l.position.y+D/2),s.moveTo(l.position.x+D/2,l.position.y-D/2),s.lineTo(l.position.x-D/2,l.position.y+D/2),s.stroke()})})};return f.jsx("canvas",{ref:t,style:{position:"absolute",top:0,left:0}})};function fr({state:e}){const t=jo(),n=E.useRef(e);return N.useEffect(()=>{n.current=e},[e]),f.jsxs(hr,{onMouseMove:s=>t(s.clientX,s.clientY),onClick:()=>X("world-click"),children:[f.jsx(Uo,{sectors:e.sectors,states:e.states}),e.states.map(s=>f.jsx(Vo,{state:s,cities:e.cities,launchSites:e.launchSites,sectors:e.sectors},s.id)),e.cities.map(s=>f.jsx(Zo,{city:s},s.id)),e.launchSites.map(s=>{var i;return f.jsx(er,{launchSite:s,worldTimestamp:e.timestamp,isPlayerControlled:s.stateId===((i=e.states.find(a=>a.isPlayerControlled))==null?void 0:i.id)},s.id)}),f.jsx(mr,{worldStateRef:n}),f.jsx(lr,{state:e})]})}const hr=C.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function pr(e,t,n){return Math.max(t,Math.min(e,n))}const A={toVector(e,t){return e===void 0&&(e=t),Array.isArray(e)?e:[e,e]},add(e,t){return[e[0]+t[0],e[1]+t[1]]},sub(e,t){return[e[0]-t[0],e[1]-t[1]]},addTo(e,t){e[0]+=t[0],e[1]+=t[1]},subTo(e,t){e[0]-=t[0],e[1]-=t[1]}};function ht(e,t,n){return t===0||Math.abs(t)===1/0?Math.pow(e,n*5):e*t*n/(t+n*e)}function pt(e,t,n,s=.15){return s===0?pr(e,t,n):e<t?-ht(t-e,n-t,s)+t:e>n?+ht(e-n,n-t,s)+n:e}function gr(e,[t,n],[s,i]){const[[a,o],[r,c]]=e;return[pt(t,a,o,s),pt(n,r,c,i)]}function vr(e,t){if(typeof e!="object"||e===null)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var s=n.call(e,t||"default");if(typeof s!="object")return s;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}function yr(e){var t=vr(e,"string");return typeof t=="symbol"?t:String(t)}function S(e,t,n){return t=yr(t),t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function gt(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(e);t&&(s=s.filter(function(i){return Object.getOwnPropertyDescriptor(e,i).enumerable})),n.push.apply(n,s)}return n}function T(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]!=null?arguments[t]:{};t%2?gt(Object(n),!0).forEach(function(s){S(e,s,n[s])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):gt(Object(n)).forEach(function(s){Object.defineProperty(e,s,Object.getOwnPropertyDescriptor(n,s))})}return e}const Sn={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function vt(e){return e?e[0].toUpperCase()+e.slice(1):""}const br=["enter","leave"];function Er(e=!1,t){return e&&!br.includes(t)}function xr(e,t="",n=!1){const s=Sn[e],i=s&&s[t]||t;return"on"+vt(e)+vt(i)+(Er(n,i)?"Capture":"")}const Fr=["gotpointercapture","lostpointercapture"];function Cr(e){let t=e.substring(2).toLowerCase();const n=!!~t.indexOf("passive");n&&(t=t.replace("passive",""));const s=Fr.includes(t)?"capturecapture":"capture",i=!!~t.indexOf(s);return i&&(t=t.replace("capture","")),{device:t,capture:i,passive:n}}function Ir(e,t=""){const n=Sn[e],s=n&&n[t]||t;return e+s}function le(e){return"touches"in e}function _n(e){return le(e)?"touch":"pointerType"in e?e.pointerType:"mouse"}function Ar(e){return Array.from(e.touches).filter(t=>{var n,s;return t.target===e.currentTarget||((n=e.currentTarget)===null||n===void 0||(s=n.contains)===null||s===void 0?void 0:s.call(n,t.target))})}function Tr(e){return e.type==="touchend"||e.type==="touchcancel"?e.changedTouches:e.targetTouches}function Mn(e){return le(e)?Tr(e)[0]:e}function _e(e,t){try{const n=t.clientX-e.clientX,s=t.clientY-e.clientY,i=(t.clientX+e.clientX)/2,a=(t.clientY+e.clientY)/2,o=Math.hypot(n,s);return{angle:-(Math.atan2(n,s)*180)/Math.PI,distance:o,origin:[i,a]}}catch{}return null}function Dr(e){return Ar(e).map(t=>t.identifier)}function yt(e,t){const[n,s]=Array.from(e.touches).filter(i=>t.includes(i.identifier));return _e(n,s)}function ge(e){const t=Mn(e);return le(e)?t.identifier:t.pointerId}function H(e){const t=Mn(e);return[t.clientX,t.clientY]}const bt=40,Et=800;function kn(e){let{deltaX:t,deltaY:n,deltaMode:s}=e;return s===1?(t*=bt,n*=bt):s===2&&(t*=Et,n*=Et),[t,n]}function Sr(e){var t,n;const{scrollX:s,scrollY:i,scrollLeft:a,scrollTop:o}=e.currentTarget;return[(t=s??a)!==null&&t!==void 0?t:0,(n=i??o)!==null&&n!==void 0?n:0]}function _r(e){const t={};if("buttons"in e&&(t.buttons=e.buttons),"shiftKey"in e){const{shiftKey:n,altKey:s,metaKey:i,ctrlKey:a}=e;Object.assign(t,{shiftKey:n,altKey:s,metaKey:i,ctrlKey:a})}return t}function ae(e,...t){return typeof e=="function"?e(...t):e}function Mr(){}function kr(...e){return e.length===0?Mr:e.length===1?e[0]:function(){let t;for(const n of e)t=n.apply(this,arguments)||t;return t}}function xt(e,t){return Object.assign({},t,e||{})}const Br=32;class Bn{constructor(t,n,s){this.ctrl=t,this.args=n,this.key=s,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(t){this.ctrl.state[this.key]=t}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:t,shared:n,ingKey:s,args:i}=this;n[s]=t._active=t.active=t._blocked=t._force=!1,t._step=[!1,!1],t.intentional=!1,t._movement=[0,0],t._distance=[0,0],t._direction=[0,0],t._delta=[0,0],t._bounds=[[-1/0,1/0],[-1/0,1/0]],t.args=i,t.axis=void 0,t.memo=void 0,t.elapsedTime=t.timeDelta=0,t.direction=[0,0],t.distance=[0,0],t.overflow=[0,0],t._movementBound=[!1,!1],t.velocity=[0,0],t.movement=[0,0],t.delta=[0,0],t.timeStamp=0}start(t){const n=this.state,s=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=t.target,n.currentTarget=t.currentTarget,n.lastOffset=s.from?ae(s.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=t.timeStamp)}computeValues(t){const n=this.state;n._values=t,n.values=this.config.transform(t)}computeInitial(){const t=this.state;t._initial=t._values,t.initial=t.values}compute(t){const{state:n,config:s,shared:i}=this;n.args=this.args;let a=0;if(t&&(n.event=t,s.preventDefault&&t.cancelable&&n.event.preventDefault(),n.type=t.type,i.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,i.locked=!!document.pointerLockElement,Object.assign(i,_r(t)),i.down=i.pressed=i.buttons%2===1||i.touches>0,a=t.timeStamp-n.timeStamp,n.timeStamp=t.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const P=n._delta.map(Math.abs);A.addTo(n._distance,P)}this.axisIntent&&this.axisIntent(t);const[o,r]=n._movement,[c,u]=s.threshold,{_step:l,values:d}=n;if(s.hasCustomTransform?(l[0]===!1&&(l[0]=Math.abs(o)>=c&&d[0]),l[1]===!1&&(l[1]=Math.abs(r)>=u&&d[1])):(l[0]===!1&&(l[0]=Math.abs(o)>=c&&Math.sign(o)*c),l[1]===!1&&(l[1]=Math.abs(r)>=u&&Math.sign(r)*u)),n.intentional=l[0]!==!1||l[1]!==!1,!n.intentional)return;const m=[0,0];if(s.hasCustomTransform){const[P,zn]=d;m[0]=l[0]!==!1?P-l[0]:0,m[1]=l[1]!==!1?zn-l[1]:0}else m[0]=l[0]!==!1?o-l[0]:0,m[1]=l[1]!==!1?r-l[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(m);const h=n.offset,g=n._active&&!n._blocked||n.active;g&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=i[this.ingKey]=n._active,t&&(n.first&&("bounds"in s&&(n._bounds=ae(s.bounds,n)),this.setup&&this.setup()),n.movement=m,this.computeOffset()));const[v,y]=n.offset,[[x,b],[I,j]]=n._bounds;n.overflow=[v<x?-1:v>b?1:0,y<I?-1:y>j?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const Yn=n._active?s.rubberband||[0,0]:[0,0];if(n.offset=gr(n._bounds,n.offset,Yn),n.delta=A.sub(n.offset,h),this.computeMovement(),g&&(!n.last||a>Br)){n.delta=A.sub(n.offset,h);const P=n.delta.map(Math.abs);A.addTo(n.distance,P),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&a>0&&(n.velocity=[P[0]/a,P[1]/a],n.timeDelta=a)}}emit(){const t=this.state,n=this.shared,s=this.config;if(t._active||this.clean(),(t._blocked||!t.intentional)&&!t._force&&!s.triggerAllEvents)return;const i=this.handler(T(T(T({},n),t),{},{[this.aliasKey]:t.values}));i!==void 0&&(t.memo=i)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function wr([e,t],n){const s=Math.abs(e),i=Math.abs(t);if(s>i&&s>n)return"x";if(i>s&&i>n)return"y"}class V extends Bn{constructor(...t){super(...t),S(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=A.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=A.sub(this.state.offset,this.state.lastOffset)}axisIntent(t){const n=this.state,s=this.config;if(!n.axis&&t){const i=typeof s.axisThreshold=="object"?s.axisThreshold[_n(t)]:s.axisThreshold;n.axis=wr(n._movement,i)}n._blocked=(s.lockDirection||!!s.axis)&&!n.axis||!!s.axis&&s.axis!==n.axis}restrictToAxis(t){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":t[1]=0;break;case"y":t[0]=0;break}}}const Rr=e=>e,Ft=.15,wn={enabled(e=!0){return e},eventOptions(e,t,n){return T(T({},n.shared.eventOptions),e)},preventDefault(e=!1){return e},triggerAllEvents(e=!1){return e},rubberband(e=0){switch(e){case!0:return[Ft,Ft];case!1:return[0,0];default:return A.toVector(e)}},from(e){if(typeof e=="function")return e;if(e!=null)return A.toVector(e)},transform(e,t,n){const s=e||n.shared.transform;return this.hasCustomTransform=!!s,s||Rr},threshold(e){return A.toVector(e,0)}},Lr=0,$=T(T({},wn),{},{axis(e,t,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(e=Lr){return e},bounds(e={}){if(typeof e=="function")return a=>$.bounds(e(a));if("current"in e)return()=>e.current;if(typeof HTMLElement=="function"&&e instanceof HTMLElement)return e;const{left:t=-1/0,right:n=1/0,top:s=-1/0,bottom:i=1/0}=e;return[[t,n],[s,i]]}}),Ct={ArrowRight:(e,t=1)=>[e*t,0],ArrowLeft:(e,t=1)=>[-1*e*t,0],ArrowUp:(e,t=1)=>[0,-1*e*t],ArrowDown:(e,t=1)=>[0,e*t]};class Or extends V{constructor(...t){super(...t),S(this,"ingKey","dragging")}reset(){super.reset();const t=this.state;t._pointerId=void 0,t._pointerActive=!1,t._keyboardActive=!1,t._preventScroll=!1,t._delayed=!1,t.swipe=[0,0],t.tap=!1,t.canceled=!1,t.cancel=this.cancel.bind(this)}setup(){const t=this.state;if(t._bounds instanceof HTMLElement){const n=t._bounds.getBoundingClientRect(),s=t.currentTarget.getBoundingClientRect(),i={left:n.left-s.left+t.offset[0],right:n.right-s.right+t.offset[0],top:n.top-s.top+t.offset[1],bottom:n.bottom-s.bottom+t.offset[1]};t._bounds=$.bounds(i)}}cancel(){const t=this.state;t.canceled||(t.canceled=!0,t._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(t){const n=this.config,s=this.state;if(t.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(t.buttons):n.pointerButtons!==-1&&n.pointerButtons!==t.buttons))return;const i=this.ctrl.setEventIds(t);n.pointerCapture&&t.target.setPointerCapture(t.pointerId),!(i&&i.size>1&&s._pointerActive)&&(this.start(t),this.setupPointer(t),s._pointerId=ge(t),s._pointerActive=!0,this.computeValues(H(t)),this.computeInitial(),n.preventScrollAxis&&_n(t)!=="mouse"?(s._active=!1,this.setupScrollPrevention(t)):n.delay>0?(this.setupDelayTrigger(t),n.triggerAllEvents&&(this.compute(t),this.emit())):this.startPointerDrag(t))}startPointerDrag(t){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(t),this.emit()}pointerMove(t){const n=this.state,s=this.config;if(!n._pointerActive)return;const i=ge(t);if(n._pointerId!==void 0&&i!==n._pointerId)return;const a=H(t);if(document.pointerLockElement===t.target?n._delta=[t.movementX,t.movementY]:(n._delta=A.sub(a,n._values),this.computeValues(a)),A.addTo(n._movement,n._delta),this.compute(t),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(t);return}if(s.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===s.preventScrollAxis||s.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(t);return}else return;this.emit()}pointerUp(t){this.ctrl.setEventIds(t);try{this.config.pointerCapture&&t.target.hasPointerCapture(t.pointerId)&&t.target.releasePointerCapture(t.pointerId)}catch{}const n=this.state,s=this.config;if(!n._active||!n._pointerActive)return;const i=ge(t);if(n._pointerId!==void 0&&i!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(t);const[a,o]=n._distance;if(n.tap=a<=s.tapsThreshold&&o<=s.tapsThreshold,n.tap&&s.filterTaps)n._force=!0;else{const[r,c]=n._delta,[u,l]=n._movement,[d,m]=s.swipe.velocity,[h,g]=s.swipe.distance,v=s.swipe.duration;if(n.elapsedTime<v){const y=Math.abs(r/n.timeDelta),x=Math.abs(c/n.timeDelta);y>d&&Math.abs(u)>h&&(n.swipe[0]=Math.sign(r)),x>m&&Math.abs(l)>g&&(n.swipe[1]=Math.sign(c))}}this.emit()}pointerClick(t){!this.state.tap&&t.detail>0&&(t.preventDefault(),t.stopPropagation())}setupPointer(t){const n=this.config,s=n.device;n.pointerLock&&t.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,s,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,s,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,s,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(t){this.state._preventScroll&&t.cancelable&&t.preventDefault()}setupScrollPrevention(t){this.state._preventScroll=!1,jr(t);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,t)}setupDelayTrigger(t){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(t)},this.config.delay)}keyDown(t){const n=Ct[t.key];if(n){const s=this.state,i=t.shiftKey?10:t.altKey?.1:1;this.start(t),s._delta=n(this.config.keyboardDisplacement,i),s._keyboardActive=!0,A.addTo(s._movement,s._delta),this.compute(t),this.emit()}}keyUp(t){t.key in Ct&&(this.state._keyboardActive=!1,this.setActive(),this.compute(t),this.emit())}bind(t){const n=this.config.device;t(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(t(n,"change",this.pointerMove.bind(this)),t(n,"end",this.pointerUp.bind(this)),t(n,"cancel",this.pointerUp.bind(this)),t("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(t("key","down",this.keyDown.bind(this)),t("key","up",this.keyUp.bind(this))),this.config.filterTaps&&t("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function jr(e){"persist"in e&&typeof e.persist=="function"&&e.persist()}const W=typeof window<"u"&&window.document&&window.document.createElement;function Rn(){return W&&"ontouchstart"in window}function Pr(){return Rn()||W&&window.navigator.maxTouchPoints>1}function Nr(){return W&&"onpointerdown"in window}function $r(){return W&&"exitPointerLock"in window.document}function Ur(){try{return"constructor"in GestureEvent}catch{return!1}}const k={isBrowser:W,gesture:Ur(),touch:Rn(),touchscreen:Pr(),pointer:Nr(),pointerLock:$r()},Yr=250,zr=180,Gr=.5,Hr=50,qr=250,Xr=10,It={mouse:0,touch:0,pen:8},Vr=T(T({},$),{},{device(e,t,{pointer:{touch:n=!1,lock:s=!1,mouse:i=!1}={}}){return this.pointerLock=s&&k.pointerLock,k.touch&&n?"touch":this.pointerLock?"mouse":k.pointer&&!i?"pointer":k.touch?"touch":"mouse"},preventScrollAxis(e,t,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&e?Yr:void 0,!(!k.touchscreen||n===!1))return e||(n!==void 0?"y":void 0)},pointerCapture(e,t,{pointer:{capture:n=!0,buttons:s=1,keys:i=!0}={}}){return this.pointerButtons=s,this.keys=i,!this.pointerLock&&this.device==="pointer"&&n},threshold(e,t,{filterTaps:n=!1,tapsThreshold:s=3,axis:i=void 0}){const a=A.toVector(e,n?s:i?1:0);return this.filterTaps=n,this.tapsThreshold=s,a},swipe({velocity:e=Gr,distance:t=Hr,duration:n=qr}={}){return{velocity:this.transform(A.toVector(e)),distance:this.transform(A.toVector(t)),duration:n}},delay(e=0){switch(e){case!0:return zr;case!1:return 0;default:return e}},axisThreshold(e){return e?T(T({},It),e):It},keyboardDisplacement(e=Xr){return e}});function Ln(e){const[t,n]=e.overflow,[s,i]=e._delta,[a,o]=e._direction;(t<0&&s>0&&a<0||t>0&&s<0&&a>0)&&(e._movement[0]=e._movementBound[0]),(n<0&&i>0&&o<0||n>0&&i<0&&o>0)&&(e._movement[1]=e._movementBound[1])}const Wr=30,Kr=100;class Zr extends Bn{constructor(...t){super(...t),S(this,"ingKey","pinching"),S(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const t=this.state;t._touchIds=[],t.canceled=!1,t.cancel=this.cancel.bind(this),t.turns=0}computeOffset(){const{type:t,movement:n,lastOffset:s}=this.state;t==="wheel"?this.state.offset=A.add(n,s):this.state.offset=[(1+n[0])*s[0],n[1]+s[1]]}computeMovement(){const{offset:t,lastOffset:n}=this.state;this.state.movement=[t[0]/n[0],t[1]-n[1]]}axisIntent(){const t=this.state,[n,s]=t._movement;if(!t.axis){const i=Math.abs(n)*Wr-Math.abs(s);i<0?t.axis="angle":i>0&&(t.axis="scale")}}restrictToAxis(t){this.config.lockDirection&&(this.state.axis==="scale"?t[1]=0:this.state.axis==="angle"&&(t[0]=0))}cancel(){const t=this.state;t.canceled||setTimeout(()=>{t.canceled=!0,t._active=!1,this.compute(),this.emit()},0)}touchStart(t){this.ctrl.setEventIds(t);const n=this.state,s=this.ctrl.touchIds;if(n._active&&n._touchIds.every(a=>s.has(a))||s.size<2)return;this.start(t),n._touchIds=Array.from(s).slice(0,2);const i=yt(t,n._touchIds);i&&this.pinchStart(t,i)}pointerStart(t){if(t.buttons!=null&&t.buttons%2!==1)return;this.ctrl.setEventIds(t),t.target.setPointerCapture(t.pointerId);const n=this.state,s=n._pointerEvents,i=this.ctrl.pointerIds;if(n._active&&Array.from(s.keys()).every(o=>i.has(o))||(s.size<2&&s.set(t.pointerId,t),n._pointerEvents.size<2))return;this.start(t);const a=_e(...Array.from(s.values()));a&&this.pinchStart(t,a)}pinchStart(t,n){const s=this.state;s.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(t),this.emit()}touchMove(t){if(!this.state._active)return;const n=yt(t,this.state._touchIds);n&&this.pinchMove(t,n)}pointerMove(t){const n=this.state._pointerEvents;if(n.has(t.pointerId)&&n.set(t.pointerId,t),!this.state._active)return;const s=_e(...Array.from(n.values()));s&&this.pinchMove(t,s)}pinchMove(t,n){const s=this.state,i=s._values[1],a=n.angle-i;let o=0;Math.abs(a)>270&&(o+=Math.sign(a)),this.computeValues([n.distance,n.angle-360*o]),s.origin=n.origin,s.turns=o,s._movement=[s._values[0]/s._initial[0]-1,s._values[1]-s._initial[1]],this.compute(t),this.emit()}touchEnd(t){this.ctrl.setEventIds(t),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(t),this.emit())}pointerEnd(t){const n=this.state;this.ctrl.setEventIds(t);try{t.target.releasePointerCapture(t.pointerId)}catch{}n._pointerEvents.has(t.pointerId)&&n._pointerEvents.delete(t.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(t),this.emit())}gestureStart(t){t.cancelable&&t.preventDefault();const n=this.state;n._active||(this.start(t),this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY],this.compute(t),this.emit())}gestureMove(t){if(t.cancelable&&t.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([t.scale,t.rotation]),n.origin=[t.clientX,t.clientY];const s=n._movement;n._movement=[t.scale-1,t.rotation],n._delta=A.sub(n._movement,s),this.compute(t),this.emit()}gestureEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}wheel(t){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(s=>t[s]):!t[n])||(this.state._active?this.wheelChange(t):this.wheelStart(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(t){this.start(t),this.wheelChange(t)}wheelChange(t){"uv"in t||t.cancelable&&t.preventDefault();const s=this.state;s._delta=[-kn(t)[1]/Kr*s.offset[0],0],A.addTo(s._movement,s._delta),Ln(s),this.state.origin=[t.clientX,t.clientY],this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){const n=this.config.device;n&&(t(n,"start",this[n+"Start"].bind(this)),t(n,"change",this[n+"Move"].bind(this)),t(n,"end",this[n+"End"].bind(this)),t(n,"cancel",this[n+"End"].bind(this)),t("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&t("wheel","",this.wheel.bind(this),{passive:!1})}}const Jr=T(T({},wn),{},{device(e,t,{shared:n,pointer:{touch:s=!1}={}}){if(n.target&&!k.touch&&k.gesture)return"gesture";if(k.touch&&s)return"touch";if(k.touchscreen){if(k.pointer)return"pointer";if(k.touch)return"touch"}},bounds(e,t,{scaleBounds:n={},angleBounds:s={}}){const i=o=>{const r=xt(ae(n,o),{min:-1/0,max:1/0});return[r.min,r.max]},a=o=>{const r=xt(ae(s,o),{min:-1/0,max:1/0});return[r.min,r.max]};return typeof n!="function"&&typeof s!="function"?[i(),a()]:o=>[i(o),a(o)]},threshold(e,t,n){return this.lockDirection=n.axis==="lock",A.toVector(e,this.lockDirection?[.1,3]:0)},modifierKey(e){return e===void 0?"ctrlKey":e},pinchOnWheel(e=!0){return e}});class Qr extends V{constructor(...t){super(...t),S(this,"ingKey","moving")}move(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.state._active?this.moveChange(t):this.moveStart(t),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(t){this.start(t),this.computeValues(H(t)),this.compute(t),this.computeInitial(),this.emit()}moveChange(t){if(!this.state._active)return;const n=H(t),s=this.state;s._delta=A.sub(n,s._values),A.addTo(s._movement,s._delta),this.computeValues(n),this.compute(t),this.emit()}moveEnd(t){this.state._active&&(this.state._active=!1,this.compute(t),this.emit())}bind(t){t("pointer","change",this.move.bind(this)),t("pointer","leave",this.moveEnd.bind(this))}}const ec=T(T({},$),{},{mouseOnly:(e=!0)=>e});class tc extends V{constructor(...t){super(...t),S(this,"ingKey","scrolling")}scroll(t){this.state._active||this.start(t),this.scrollChange(t),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(t){t.cancelable&&t.preventDefault();const n=this.state,s=Sr(t);n._delta=A.sub(s,n._values),A.addTo(n._movement,n._delta),this.computeValues(s),this.compute(t),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("scroll","",this.scroll.bind(this))}}const nc=$;class sc extends V{constructor(...t){super(...t),S(this,"ingKey","wheeling")}wheel(t){this.state._active||this.start(t),this.wheelChange(t),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(t){const n=this.state;n._delta=kn(t),A.addTo(n._movement,n._delta),Ln(n),this.compute(t),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(t){t("wheel","",this.wheel.bind(this))}}const ic=$;class ac extends V{constructor(...t){super(...t),S(this,"ingKey","hovering")}enter(t){this.config.mouseOnly&&t.pointerType!=="mouse"||(this.start(t),this.computeValues(H(t)),this.compute(t),this.emit())}leave(t){if(this.config.mouseOnly&&t.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const s=H(t);n._movement=n._delta=A.sub(s,n._values),this.computeValues(s),this.compute(t),n.delta=n.movement,this.emit()}bind(t){t("pointer","enter",this.enter.bind(this)),t("pointer","leave",this.leave.bind(this))}}const oc=T(T({},$),{},{mouseOnly:(e=!0)=>e}),Ye=new Map,Me=new Map;function rc(e){Ye.set(e.key,e.engine),Me.set(e.key,e.resolver)}const cc={key:"drag",engine:Or,resolver:Vr},lc={key:"hover",engine:ac,resolver:oc},uc={key:"move",engine:Qr,resolver:ec},dc={key:"pinch",engine:Zr,resolver:Jr},mc={key:"scroll",engine:tc,resolver:nc},fc={key:"wheel",engine:sc,resolver:ic};function hc(e,t){if(e==null)return{};var n={},s=Object.keys(e),i,a;for(a=0;a<s.length;a++)i=s[a],!(t.indexOf(i)>=0)&&(n[i]=e[i]);return n}function pc(e,t){if(e==null)return{};var n=hc(e,t),s,i;if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(e);for(i=0;i<a.length;i++)s=a[i],!(t.indexOf(s)>=0)&&Object.prototype.propertyIsEnumerable.call(e,s)&&(n[s]=e[s])}return n}const gc={target(e){if(e)return()=>"current"in e?e.current:e},enabled(e=!0){return e},window(e=k.isBrowser?window:void 0){return e},eventOptions({passive:e=!0,capture:t=!1}={}){return{passive:e,capture:t}},transform(e){return e}},vc=["target","eventOptions","window","enabled","transform"];function ne(e={},t){const n={};for(const[s,i]of Object.entries(t))switch(typeof i){case"function":n[s]=i.call(n,e[s],s,e);break;case"object":n[s]=ne(e[s],i);break;case"boolean":i&&(n[s]=e[s]);break}return n}function yc(e,t,n={}){const s=e,{target:i,eventOptions:a,window:o,enabled:r,transform:c}=s,u=pc(s,vc);if(n.shared=ne({target:i,eventOptions:a,window:o,enabled:r,transform:c},gc),t){const l=Me.get(t);n[t]=ne(T({shared:n.shared},u),l)}else for(const l in u){const d=Me.get(l);d&&(n[l]=ne(T({shared:n.shared},u[l]),d))}return n}class On{constructor(t,n){S(this,"_listeners",new Set),this._ctrl=t,this._gestureKey=n}add(t,n,s,i,a){const o=this._listeners,r=Ir(n,s),c=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},u=T(T({},c),a);t.addEventListener(r,i,u);const l=()=>{t.removeEventListener(r,i,u),o.delete(l)};return o.add(l),l}clean(){this._listeners.forEach(t=>t()),this._listeners.clear()}}class bc{constructor(){S(this,"_timeouts",new Map)}add(t,n,s=140,...i){this.remove(t),this._timeouts.set(t,window.setTimeout(n,s,...i))}remove(t){const n=this._timeouts.get(t);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(t=>void window.clearTimeout(t)),this._timeouts.clear()}}class Ec{constructor(t){S(this,"gestures",new Set),S(this,"_targetEventStore",new On(this)),S(this,"gestureEventStores",{}),S(this,"gestureTimeoutStores",{}),S(this,"handlers",{}),S(this,"config",{}),S(this,"pointerIds",new Set),S(this,"touchIds",new Set),S(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),xc(this,t)}setEventIds(t){if(le(t))return this.touchIds=new Set(Dr(t)),this.touchIds;if("pointerId"in t)return t.type==="pointerup"||t.type==="pointercancel"?this.pointerIds.delete(t.pointerId):t.type==="pointerdown"&&this.pointerIds.add(t.pointerId),this.pointerIds}applyHandlers(t,n){this.handlers=t,this.nativeHandlers=n}applyConfig(t,n){this.config=yc(t,n,this.config)}clean(){this._targetEventStore.clean();for(const t of this.gestures)this.gestureEventStores[t].clean(),this.gestureTimeoutStores[t].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...t){const n=this.config.shared,s={};let i;if(!(n.target&&(i=n.target(),!i))){if(n.enabled){for(const o of this.gestures){const r=this.config[o],c=At(s,r.eventOptions,!!i);if(r.enabled){const u=Ye.get(o);new u(this,t,o).bind(c)}}const a=At(s,n.eventOptions,!!i);for(const o in this.nativeHandlers)a(o,"",r=>this.nativeHandlers[o](T(T({},this.state.shared),{},{event:r,args:t})),void 0,!0)}for(const a in s)s[a]=kr(...s[a]);if(!i)return s;for(const a in s){const{device:o,capture:r,passive:c}=Cr(a);this._targetEventStore.add(i,o,"",s[a],{capture:r,passive:c})}}}}function Y(e,t){e.gestures.add(t),e.gestureEventStores[t]=new On(e,t),e.gestureTimeoutStores[t]=new bc}function xc(e,t){t.drag&&Y(e,"drag"),t.wheel&&Y(e,"wheel"),t.scroll&&Y(e,"scroll"),t.move&&Y(e,"move"),t.pinch&&Y(e,"pinch"),t.hover&&Y(e,"hover")}const At=(e,t,n)=>(s,i,a,o={},r=!1)=>{var c,u;const l=(c=o.capture)!==null&&c!==void 0?c:t.capture,d=(u=o.passive)!==null&&u!==void 0?u:t.passive;let m=r?s:xr(s,i,l);n&&d&&(m+="Passive"),e[m]=e[m]||[],e[m].push(a)},Fc=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function Cc(e){const t={},n={},s=new Set;for(let i in e)Fc.test(i)?(s.add(RegExp.lastMatch),n[i]=e[i]):t[i]=e[i];return[n,t,s]}function z(e,t,n,s,i,a){if(!e.has(n)||!Ye.has(s))return;const o=n+"Start",r=n+"End",c=u=>{let l;return u.first&&o in t&&t[o](u),n in t&&(l=t[n](u)),u.last&&r in t&&t[r](u),l};i[s]=c,a[s]=a[s]||{}}function Ic(e,t){const[n,s,i]=Cc(e),a={};return z(i,n,"onDrag","drag",a,t),z(i,n,"onWheel","wheel",a,t),z(i,n,"onScroll","scroll",a,t),z(i,n,"onPinch","pinch",a,t),z(i,n,"onMove","move",a,t),z(i,n,"onHover","hover",a,t),{handlers:a,config:t,nativeHandlers:s}}function Ac(e,t={},n,s){const i=N.useMemo(()=>new Ec(e),[]);if(i.applyHandlers(e,s),i.applyConfig(t,n),N.useEffect(i.effect.bind(i)),N.useEffect(()=>i.clean.bind(i),[]),t.target===void 0)return i.bind.bind(i)}function Tc(e){return e.forEach(rc),function(n,s){const{handlers:i,nativeHandlers:a,config:o}=Ic(n,s||{});return Ac(i,o,void 0,a)}}function Dc(e,t){return Tc([cc,dc,mc,fc,uc,lc])(e,t||{})}function Sc(e){X("translateViewport",e)}function _c(e){ce("translateViewport",e)}function Mc({children:e,onGetViewportConfiguration:t}){const n=E.useRef(null),s=N.useMemo(t,[t]),[i,a]=E.useState(s.initialZoom),[o,r]=E.useState(s.initialTranslate),[c,u]=E.useState(!1),l=E.useCallback((d,m)=>{const{minX:h,minY:g,maxX:v,maxY:y}=s,x=window.innerWidth,b=window.innerHeight,I=Math.min(Math.max(m,Math.max(x/(v-h),b/(y-g))),4),j={x:Math.min(Math.max(d.x,-(v-x/I)),-h),y:Math.min(Math.max(d.y,-(y-b/I)),-g)};r(j),a(I)},[s]);return E.useEffect(()=>{l(s.initialTranslate,s.initialZoom)},[]),Dc({onPinch({origin:d,delta:m,pinching:h}){var b;u(h);const g=i+m[0],v=(b=n.current)==null?void 0:b.getBoundingClientRect(),y=d[0]-((v==null?void 0:v.left)??0),x=d[1]-((v==null?void 0:v.top)??0);l({x:o.x-(y/i-y/g),y:o.y-(x/i-x/g)},g)},onWheel({event:d,delta:[m,h],wheeling:g}){d.preventDefault(),u(g),l({x:o.x-m/i,y:o.y-h/i},i)}},{target:n,eventOptions:{passive:!1}}),_c(d=>{const m=window.innerWidth,h=window.innerHeight,g=m/2-d.x*i,v=h/2-d.y*i;l({x:g/i,y:v/i},i)}),f.jsx(kc,{children:f.jsx(Bc,{ref:n,children:f.jsx(wc,{style:{"--zoom":i,"--translate-x":o.x,"--translate-y":o.y},"data-is-interacting":c,children:e})})})}const kc=C.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,Bc=C.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,wc=C.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function Rc({worldState:e}){const t=E.useRef(e);return f.jsx(No,{children:f.jsx(Oo,{children:f.jsx(Mc,{onGetViewportConfiguration:E.useCallback(()=>Lc(t.current),[t]),children:f.jsx(fr,{state:e})})})})}function Lc(e){const t=e.states.find(y=>y.isPlayerControlled),n=window.innerWidth,s=window.innerHeight,i=t?e.sectors.filter(y=>y.stateId===t.id):e.sectors;let a=1/0,o=1/0,r=-1/0,c=-1/0;i.forEach(y=>{a=Math.min(a,y.rect.left),o=Math.min(o,y.rect.top),r=Math.max(r,y.rect.right),c=Math.max(c,y.rect.bottom)});const u=r-a+1,l=c-o+1,d=n/u,m=s/l,h=Math.min(d,m)*1,g=(a+r)/2,v=(o+c)/2;return e.sectors.forEach(y=>{a=Math.min(a,y.rect.left),o=Math.min(o,y.rect.top),r=Math.max(r,y.rect.right),c=Math.max(c,y.rect.bottom)}),{initialTranslate:{x:n/2-g*h,y:s/2-v*h},initialZoom:h,minX:a,minY:o,maxX:r,maxY:c}}const jn="fullScreenMessage",Pn="fullScreenMessageAction";function w(e,t,n,s="",i,a,o){X(jn,{message:e,startTimestamp:t,endTimestamp:n,messageId:s,actions:i,prompt:a,fullScreen:o??!!(i!=null&&i.length)})}function Nn(e,t){X(Pn,{messageId:e,actionId:t})}function $n(e){ce(jn,t=>{e(t)})}function ze(e){ce(Pn,t=>{e(t)})}function Oc({worldState:e,onGameOver:t}){const[n,s]=E.useState(null),[i,a]=E.useState(!1);return E.useEffect(()=>{var h;if(i)return;const o=bn(e),r=Object.values(o).filter(g=>g>0).length,c=e.launchSites.length===0,u=e.timestamp,l=e.states.filter(g=>o[g.id]>0&&Object.entries(g.strategies).filter(([v,y])=>o[v]>0&&y===p.HOSTILE).length>0),d=e.launchSites.some(g=>g.lastLaunchTimestamp&&u-g.lastLaunchTimestamp<ue),m=ue-u;if(!l.length&&!d&&m>0&&m<=10&&(n?w(`Game will end in ${Math.ceil(m)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):s(u)),r<=1||c||!l.length&&!d&&u>ue){const g=r===1?(h=e.states.find(v=>o[v.id]>0))==null?void 0:h.id:void 0;a(!0),w(["Game Over!","Results will be shown shortly..."],u,u+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{t({populations:o,winner:g,stateNames:Object.fromEntries(e.states.map(v=>[v.id,v.name])),playerStateId:e.states.find(v=>v.isPlayerControlled).id})},5e3)}},[e,t,n,i]),null}const jc="/assets/player-lost-background-D2A_VJ6-.png",Pc="/assets/player-won-background-CkXgF24i.png",Tt="/assets/draw-background-EwLQ9g28.png",Nc=C.div`
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
`,$c=({setGameState:e})=>{const{state:{result:t}}=St(),n=()=>{e(oe,{stateName:t.stateNames[t.playerStateId],numberOfOpponents:Object.values(t.stateNames).length-1,groundWarfare:!1})};let s,i;return t.winner?t.winner===t.playerStateId?(s=Pc,i=`Congratulations! ${t.stateNames[t.playerStateId]} has won with ${se(t.populations[t.playerStateId])} population alive.`):t.winner!==void 0?(s=jc,i=`${t.stateNames[t.winner]} has won with ${se(t.populations[t.winner])} population alive. Your state has fallen.`):(s=Tt,i="The game has ended in an unexpected state."):(s=Tt,i="It's a draw! The world is partially destroyed, but there's still hope."),f.jsx(Nc,{backgroundImage:s,children:f.jsxs("div",{children:[f.jsx("h2",{children:"Game Over"}),f.jsx("p",{children:i}),f.jsx("button",{onClick:n,children:"Play Again"}),f.jsx("br",{}),f.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},ke={Component:$c,path:"played"};function Uc({worldState:e}){var u;const[t,n]=E.useState([]),[s,i]=E.useState(null);$n(l=>{n(d=>l.messageId&&d.find(m=>m.messageId===l.messageId)?[...d.map(m=>m.messageId===l.messageId?l:m)]:[l,...d])});const a=t.sort((l,d)=>l.actions&&!d.actions?-1:!l.actions&&d.actions?1:l.startTimestamp-d.startTimestamp);if(ze(l=>{n(d=>d.filter(m=>m.messageId!==l.messageId))}),E.useEffect(()=>{const l=a.find(d=>d.fullScreen&&d.startTimestamp<=e.timestamp&&d.endTimestamp>e.timestamp);i(l||null)},[a,e.timestamp]),!s)return null;const r=((l,d)=>d<l.startTimestamp?"pre":d<l.startTimestamp+.5?"pre-in":d>l.endTimestamp-.5?"post-in":d>l.endTimestamp?"post":"active")(s,e.timestamp),c=l=>Array.isArray(l)?l.map((d,m)=>f.jsx("div",{children:d},m)):l;return f.jsxs(Gc,{"data-message-state":r,"data-action":(((u=s.actions)==null?void 0:u.length)??0)>0,children:[f.jsx(Hc,{children:c(s.message)}),s.prompt&&s.actions&&f.jsx(qc,{children:s.actions.map((l,d)=>f.jsx(Xc,{onClick:()=>Nn(s.messageId,l.id),children:l.text},d))})]})}const Yc=re`
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
`,zc=re`
  from {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: translateX(-50%) scale(0.9);
  }
`,Gc=C.div`
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
    animation: ${Yc} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${zc} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,Hc=C.div`
  font-size: 1.5rem;
  color: white;
  text-align: center;
  white-space: pre-line;
`,qc=C.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,Xc=C.button`
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
`,Un="ALLIANCEPROPOSAL";function Vc(e,t,n,s=!1){const i=`${Un}_${e.id}_${t.id}`,a=s?`${e.name} has become friendly towards you. Do you want to form an alliance?`:`${e.name} proposes an alliance with ${t.name}. Do you accept?`,o=n.timestamp,r=o+10;w(a,o,r,i,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function Wc({worldState:e,setWorldState:t}){return ze(n=>{if(n.messageId.startsWith(Un)){const[,s,i]=n.messageId.split("_"),a=e.states.find(r=>r.id===s),o=e.states.find(r=>r.id===i);if(!a||!(o!=null&&o.isPlayerControlled))return;if(n.actionId==="accept"){const r=e.states.map(c=>c.id===s||c.id===i?{...c,strategies:{...c.strategies,[s]:p.FRIENDLY,[i]:p.FRIENDLY}}:c);t({...e,states:r}),w(`Alliance formed between ${a.name} and ${o.name}!`,e.timestamp,e.timestamp+5)}else n.actionId==="reject"&&w(`${o.name} has rejected the alliance proposal from ${a.name}.`,e.timestamp,e.timestamp+5)}}),null}function Kc({worldState:e}){const t=e.states.find(h=>h.isPlayerControlled),[n,s]=E.useState(!1),[i,a]=E.useState({}),[o,r]=E.useState([]),[c,u]=E.useState([]),[l,d]=E.useState(!1),m=Math.round(e.timestamp*10)/10;return E.useEffect(()=>{!n&&e.timestamp>0&&(s(!0),w("The game has started!",e.timestamp,e.timestamp+3))},[m]),E.useEffect(()=>{var h,g,v,y;if(t){const x=Object.fromEntries(e.states.map(b=>[b.id,b.strategies]));for(const b of e.states)for(const I of e.states.filter(j=>j.id!==b.id))t&&I.id===t.id&&b.strategies[I.id]===p.FRIENDLY&&I.strategies[b.id]!==p.FRIENDLY&&((h=i[b.id])==null?void 0:h[I.id])!==p.FRIENDLY&&Vc(b,t,e,!0),I.strategies[b.id]===p.FRIENDLY&&b.strategies[I.id]===p.FRIENDLY&&(((g=i[I.id])==null?void 0:g[b.id])!==p.FRIENDLY||((v=i[b.id])==null?void 0:v[I.id])!==p.FRIENDLY)&&w(`${I.name} has formed alliance with ${b.isPlayerControlled?"you":b.name}!`,m,m+3),b.strategies[I.id]===p.HOSTILE&&((y=i[b.id])==null?void 0:y[I.id])!==p.HOSTILE&&w(I.isPlayerControlled?`${b.name} has declared war on You!`:`${b.isPlayerControlled?"You have":b.name} declared war on ${I.name}!`,m,m+3,void 0,void 0,void 0,b.isPlayerControlled||I.isPlayerControlled);a(x)}},[m]),E.useEffect(()=>{t&&e.cities.forEach(h=>{const g=o.find(b=>b.id===h.id);if(!g)return;const v=h.population||0,y=g.population,x=Math.floor(y-v);x>0&&(h.stateId===t.id&&w(v===0?`Your city ${h.name} has been destroyed!`:[`Your city ${h.name} has been hit!`,`${x} casualties reported.`],m,m+3,void 0,void 0,!1,!0),X("cityDamage"))}),r(e.cities.map(h=>({...h})))},[m]),E.useEffect(()=>{if(t){const h=e.launchSites.filter(g=>g.stateId===t.id);c.length>0&&c.filter(v=>!h.some(y=>y.id===v.id)).forEach(()=>{w("One of your launch sites has been destroyed!",m,m+3,void 0,void 0,!1,!0)}),u(h)}},[m]),E.useEffect(()=>{if(t&&!l){const h=e.cities.filter(y=>y.stateId===t.id),g=e.launchSites.filter(y=>y.stateId===t.id);!h.some(y=>y.population>0)&&g.length===0&&(w(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],m,m+5,void 0,void 0,!1,!0),d(!0))}},[m]),null}function Zc({worldState:e}){const[t,n]=E.useState([]);$n(o=>{n(r=>o.messageId&&r.find(c=>c.messageId===o.messageId)?[...r.map(c=>c.messageId===o.messageId?o:c)]:[o,...r])}),ze(o=>{n(r=>r.filter(c=>c.messageId!==o.messageId))});const s=o=>Array.isArray(o)?o.map((r,c)=>f.jsx("div",{children:r},c)):o,i=(o,r)=>{const l=r-o;return l>60?0:l>50?1-(l-50)/10:1},a=E.useMemo(()=>{const o=e.timestamp,r=60;return t.filter(c=>{const u=c.startTimestamp||0;return o-u<=r}).map(c=>({...c,opacity:i(c.startTimestamp||0,o)}))},[t,e.timestamp]);return f.jsx(Jc,{children:a.map((o,r)=>f.jsxs(Qc,{style:{opacity:o.opacity},children:[f.jsx("div",{children:s(o.message)}),o.prompt&&o.actions&&f.jsx(el,{children:o.actions.map((c,u)=>f.jsx(tl,{onClick:()=>Nn(o.messageId,c.id),children:c.text},u))})]},r))})}const Jc=C.div`
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
`,Qc=C.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,el=C.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,tl=C.button`
  font-size: 10px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function nl({updateWorldTime:e,currentWorldTime:t}){const[n,s]=E.useState(!1),i=E.useRef(null);Dn(o=>{if(!i.current){i.current=o;return}const r=o-i.current;i.current=o,!(r<=0)&&n&&e(r/1e3)},!0);const a=o=>{const r=Math.floor(o/86400),c=Math.floor(o%86400/3600),u=Math.floor(o%3600/60),l=Math.floor(o%60);return[[r,"d"],[c,"h"],[u,"m"],[l,"s"]].filter(([d])=>!!d).map(([d,m])=>String(d)+m).join(" ")};return f.jsx(sl,{children:f.jsxs(il,{children:[f.jsxs(al,{children:[t>0?"Current Time: ":"Game not started yet",a(t)]}),f.jsx(Z,{onClick:()=>e(1),children:"+1s"}),f.jsx(Z,{onClick:()=>e(10),children:"+10s"}),f.jsx(Z,{onClick:()=>e(60),children:"+1m"}),f.jsx(Z,{onClick:()=>s(!n),children:n?"Stop":"Start"})]})})}const sl=C.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,il=C.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,Z=C.button`
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
`,al=C.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`;function ol({worldState:e}){const t=e.states.find(r=>r.isPlayerControlled);if(!t)return null;const n=(r,c,u=!1)=>{t.strategies[r.id]=c,u&&(r.strategies[t.id]=c)},s=r=>{if(r.id===t.id)return"#4CAF50";const c=t.strategies[r.id],u=r.strategies[t.id];return c===p.FRIENDLY&&u===p.FRIENDLY?"#4CAF50":c===p.HOSTILE||u===p.HOSTILE?"#F44336":"#9E9E9E"},i=bn(e),a=r=>{const c=e.cities.filter(h=>h.stateId===r),u=e.launchSites.filter(h=>h.stateId===r);if(c.length===0&&u.length===0){console.warn("No position information available for this state");return}const l=[...c.map(h=>h.position),...u.map(h=>h.position)],d=l.reduce((h,g)=>({x:h.x+g.x,y:h.y+g.y}),{x:0,y:0}),m={x:d.x/l.length,y:d.y/l.length};Sc(m)},o=r=>{const c=t.strategies[r.id],u=r.strategies[t.id];return f.jsxs(fl,{children:[(c===p.NEUTRAL&&u!==p.HOSTILE||c===p.FRIENDLY&&u!==p.FRIENDLY)&&f.jsx(J,{color:"#4CAF50",onClick:l=>{l.stopPropagation(),n(r,p.FRIENDLY)},disabled:c===p.FRIENDLY&&u!==p.FRIENDLY,children:"Alliance"}),(c===p.HOSTILE||u===p.HOSTILE)&&f.jsx(J,{color:"#9E9E9E",onClick:l=>{l.stopPropagation(),n(r,p.NEUTRAL)},disabled:c===p.NEUTRAL&&u!==p.NEUTRAL,children:"Peace"}),c===p.FRIENDLY&&u===p.FRIENDLY&&f.jsx(J,{color:"#9E9E9E",onClick:l=>{l.stopPropagation(),n(r,p.NEUTRAL,!0)},children:"Neutral"}),c===p.NEUTRAL&&u!==p.HOSTILE&&f.jsx(J,{color:"#F44336",onClick:l=>{l.stopPropagation(),n(r,p.HOSTILE,!0)},children:"Attack"})]})};return f.jsx(rl,{children:e.states.map(r=>f.jsxs(cl,{relationshipColor:s(r),onClick:()=>a(r.id),children:[f.jsx(ll,{style:{color:r.color},children:r.name.charAt(0)}),f.jsxs(ul,{children:[f.jsx(dl,{children:r.name}),f.jsxs(ml,{children:["👤 ",se(i[r.id])]}),r.id!==t.id?o(r):f.jsx(hl,{children:"This is you"})]})]},r.id))})}const rl=C.div`
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
`,cl=C.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 10px;
  background: ${e=>`rgba(${parseInt(e.relationshipColor.slice(1,3),16)}, ${parseInt(e.relationshipColor.slice(3,5),16)}, ${parseInt(e.relationshipColor.slice(5,7),16)}, 0.2)`};
  border: 2px solid ${e=>e.relationshipColor};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,ll=C.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,ul=C.div`
  display: flex;
  flex-direction: column;
`,dl=C.span`
  font-weight: bold;
  margin-bottom: 5px;
`,ml=C.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`,fl=C.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`,J=C.button`
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
`,hl=C.span`
  font-style: italic;
  color: #4caf50;
`,pl=({setGameState:e})=>{const{state:{stateName:t,numberOfOpponents:n,groundWarfare:s}}=St(),{worldState:i,setWorldState:a,updateWorldState:o}=wo(t,n,s);return f.jsxs(f.Fragment,{children:[f.jsx(Rc,{worldState:i}),f.jsx(nl,{updateWorldTime:r=>o(i,r),currentWorldTime:i.timestamp??0}),f.jsx(Uc,{worldState:i}),f.jsx(ol,{worldState:i}),f.jsx(Zc,{worldState:i}),f.jsx(Oc,{worldState:i,onGameOver:r=>e(ke,{result:r})}),f.jsx(Kc,{worldState:i}),f.jsx(Wc,{worldState:i,setWorldState:a})]})},oe={Component:pl,path:"playing"},gl="/assets/play-background-BASXrsIB.png",vl=C.div`
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
`,yl=({setGameState:e})=>{const[t,n]=E.useState(yn(1)[0]),[s,i]=E.useState(2),[a,o]=E.useState(!1),r=()=>{e(oe,{stateName:t,numberOfOpponents:s,groundWarfare:a})};return f.jsx(vl,{children:f.jsxs("div",{children:[f.jsx("h2",{children:"Name your state:"}),f.jsx("input",{type:"text",placeholder:"Type your state name here",value:t,onChange:c=>n(c.currentTarget.value)}),f.jsx("br",{}),f.jsx("h2",{children:"How many opponents?"}),f.jsxs("select",{value:s,onChange:c=>i(Number(c.currentTarget.value)),children:[f.jsx("option",{value:1,children:"1"}),f.jsx("option",{value:2,children:"2"}),f.jsx("option",{value:3,children:"3"}),f.jsx("option",{value:4,children:"4"})]}),f.jsx("h2",{children:"Ground warfare? (WIP)"}),f.jsx("input",{type:"checkbox",checked:a,onChange:()=>o(!a)}),f.jsx("br",{}),f.jsx("br",{}),f.jsx("button",{onClick:r,disabled:!t,children:"Start game"}),f.jsx("br",{}),f.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Be={Component:yl,path:"play"},bl="/assets/intro-background-D_km5uka.png",El="/assets/nukes-game-title-vcFxx9vI.png",xl=re`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,Fl=re`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,Cl=C.div`
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
    background-image: url(${bl});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${xl} 60s ease-in-out infinite;
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
`,Il=C.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${e=>e.isFlashing?1:0};
  animation: ${e=>e.isFlashing?Fl:"none"} 4.5s forwards;
`,Al=C.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,Tl=C.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,Dl=({setGameState:e})=>{const[t,n]=E.useState(!0);return E.useEffect(()=>{const s=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(s)},[]),f.jsxs(Cl,{children:[f.jsx(Il,{isFlashing:t}),!t&&f.jsxs(Al,{children:[f.jsx(Tl,{src:El,alt:"Nukes game"}),f.jsx("button",{onClick:()=>e(Be),children:"Play"})]})]})},Dt={Component:Dl,path:""},Sl=Xn`
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
`,_l=[{path:Dt.path,element:f.jsx(Q,{state:Dt})},{path:Be.path,element:f.jsx(Q,{state:Be})},{path:oe.path,element:f.jsx(Q,{state:oe})},{path:ke.path,element:f.jsx(Q,{state:ke})}];function Bl(){var n;const[e]=Hn(),t=e.get("path")??"";return f.jsx(f.Fragment,{children:(n=_l.find(s=>s.path===t))==null?void 0:n.element})}function Q({state:e}){const t=qn();return f.jsxs(f.Fragment,{children:[f.jsx(Sl,{}),f.jsx(e.Component,{setGameState:(n,s)=>t({search:"path="+n.path},{state:s})})]})}export{Bl as NukesApp,_l as routes};
