import{c as M,g as Dn,r as y,j as h,R as z,u as ft,a as Tn,b as In}from"./index-B29SoCp5.js";import{d as C,m as ne,f as Sn}from"./styled-components.browser.esm-Bd3SShOX.js";const ht=20,J=ht*1.5,ce=5,j=20,kn=1,_n=5,Bn=j/_n,Mn=.5,wn=500,q=.05,me=5,jn=4,ie=60,I=16,O=I*5,pt=1e3,Ae=O*4;var E=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(E||{}),gt=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(gt||{}),k=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(k||{}),_=(t=>(t.ATTACK="ATTACK",t.DEFENCE="DEFENCE",t))(_||{});function On(t,e){const n=[];for(let a=0;a<e;a++)for(let s=0;s<t;s++)n.push({id:`${s*I},${a*I}`,position:{x:s*I,y:a*I},rect:{left:s*I,top:a*I,right:(s+1)*I,bottom:(a+1)*I},type:k.WATER,depth:0,height:0,population:0,cityId:""});return n}function Ln(t,e,n){const a=[],s=Array(n).fill(null).map(()=>Array(e).fill(!1));for(let r=0;r<n;r++)for(let o=0;o<e;o++){const i=r*e+o;t[i].type===k.WATER&&Pn(o,r,e,n,t)&&(a.push([o,r,0]),s[r][o]=!0)}for(;a.length>0;){const[r,o,i]=a.shift(),l=o*e+r;t[l].type===k.WATER?t[l].depth=i+(Math.random()-Math.random())/5:t[l].type===k.GROUND&&(t[l].height=Math.sqrt(i)+(Math.random()-Math.random())/10);const c=[[-1,0],[1,0],[0,-1],[0,1]];for(const[u,d]of c){const m=r+u,f=o+d;vt(m,f,e,n)&&!s[f][m]&&(a.push([m,f,i+1]),s[f][m]=!0)}}}function Pn(t,e,n,a,s){return[[-1,0],[1,0],[0,-1],[0,1]].some(([o,i])=>{const l=t+o,c=e+i;if(vt(l,c,n,a)){const u=c*n+l;return s[u].type===k.GROUND}return!1})}function vt(t,e,n,a){return t>=0&&t<n&&e>=0&&e<a}var yt={exports:{}},Rn=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(t){var e=Rn,n=e.filter(function(s){return!!s.css}),a=e.filter(function(s){return!!s.vga});t.exports=function(s){var r=t.exports.get(s);return r&&r.value},t.exports.get=function(s){return s=s||"",s=s.trim().toLowerCase(),e.filter(function(r){return r.name.toLowerCase()===s}).pop()},t.exports.all=t.exports.get.all=function(){return e},t.exports.get.css=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),n.filter(function(r){return r.name.toLowerCase()===s}).pop()):n},t.exports.get.vga=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),a.filter(function(r){return r.name.toLowerCase()===s}).pop()):a}})(yt);var $n=yt.exports,Nn=1/0,Yn="[object Symbol]",Gn=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,bt="\\ud800-\\udfff",zn="\\u0300-\\u036f\\ufe20-\\ufe23",Un="\\u20d0-\\u20f0",Et="\\u2700-\\u27bf",xt="a-z\\xdf-\\xf6\\xf8-\\xff",Hn="\\xac\\xb1\\xd7\\xf7",Vn="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",Xn="\\u2000-\\u206f",qn=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",Ct="A-Z\\xc0-\\xd6\\xd8-\\xde",Wn="\\ufe0e\\ufe0f",Ft=Hn+Vn+Xn+qn,At="['’]",we="["+Ft+"]",Kn="["+zn+Un+"]",Dt="\\d+",Zn="["+Et+"]",Tt="["+xt+"]",It="[^"+bt+Ft+Dt+Et+xt+Ct+"]",Jn="\\ud83c[\\udffb-\\udfff]",Qn="(?:"+Kn+"|"+Jn+")",ea="[^"+bt+"]",St="(?:\\ud83c[\\udde6-\\uddff]){2}",kt="[\\ud800-\\udbff][\\udc00-\\udfff]",N="["+Ct+"]",ta="\\u200d",je="(?:"+Tt+"|"+It+")",na="(?:"+N+"|"+It+")",Oe="(?:"+At+"(?:d|ll|m|re|s|t|ve))?",Le="(?:"+At+"(?:D|LL|M|RE|S|T|VE))?",_t=Qn+"?",Bt="["+Wn+"]?",aa="(?:"+ta+"(?:"+[ea,St,kt].join("|")+")"+Bt+_t+")*",sa=Bt+_t+aa,ia="(?:"+[Zn,St,kt].join("|")+")"+sa,ra=RegExp([N+"?"+Tt+"+"+Oe+"(?="+[we,N,"$"].join("|")+")",na+"+"+Le+"(?="+[we,N+je,"$"].join("|")+")",N+"?"+je+"+"+Oe,N+"+"+Le,Dt,ia].join("|"),"g"),oa=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,la=typeof M=="object"&&M&&M.Object===Object&&M,ua=typeof self=="object"&&self&&self.Object===Object&&self,ca=la||ua||Function("return this")();function ma(t){return t.match(Gn)||[]}function da(t){return oa.test(t)}function fa(t){return t.match(ra)||[]}var ha=Object.prototype,pa=ha.toString,Pe=ca.Symbol,Re=Pe?Pe.prototype:void 0,$e=Re?Re.toString:void 0;function ga(t){if(typeof t=="string")return t;if(ya(t))return $e?$e.call(t):"";var e=t+"";return e=="0"&&1/t==-Nn?"-0":e}function va(t){return!!t&&typeof t=="object"}function ya(t){return typeof t=="symbol"||va(t)&&pa.call(t)==Yn}function ba(t){return t==null?"":ga(t)}function Ea(t,e,n){return t=ba(t),e=n?void 0:e,e===void 0?da(t)?fa(t):ma(t):t.match(e)||[]}var xa=Ea,Ca=1/0,Fa="[object Symbol]",Aa=/^\s+/,De="\\ud800-\\udfff",Mt="\\u0300-\\u036f\\ufe20-\\ufe23",wt="\\u20d0-\\u20f0",jt="\\ufe0e\\ufe0f",Da="["+De+"]",de="["+Mt+wt+"]",fe="\\ud83c[\\udffb-\\udfff]",Ta="(?:"+de+"|"+fe+")",Ot="[^"+De+"]",Lt="(?:\\ud83c[\\udde6-\\uddff]){2}",Pt="[\\ud800-\\udbff][\\udc00-\\udfff]",Rt="\\u200d",$t=Ta+"?",Nt="["+jt+"]?",Ia="(?:"+Rt+"(?:"+[Ot,Lt,Pt].join("|")+")"+Nt+$t+")*",Sa=Nt+$t+Ia,ka="(?:"+[Ot+de+"?",de,Lt,Pt,Da].join("|")+")",_a=RegExp(fe+"(?="+fe+")|"+ka+Sa,"g"),Ba=RegExp("["+Rt+De+Mt+wt+jt+"]"),Ma=typeof M=="object"&&M&&M.Object===Object&&M,wa=typeof self=="object"&&self&&self.Object===Object&&self,ja=Ma||wa||Function("return this")();function Oa(t){return t.split("")}function La(t,e,n,a){for(var s=t.length,r=n+-1;++r<s;)if(e(t[r],r,t))return r;return-1}function Pa(t,e,n){if(e!==e)return La(t,Ra,n);for(var a=n-1,s=t.length;++a<s;)if(t[a]===e)return a;return-1}function Ra(t){return t!==t}function $a(t,e){for(var n=-1,a=t.length;++n<a&&Pa(e,t[n],0)>-1;);return n}function Na(t){return Ba.test(t)}function Ne(t){return Na(t)?Ya(t):Oa(t)}function Ya(t){return t.match(_a)||[]}var Ga=Object.prototype,za=Ga.toString,Ye=ja.Symbol,Ge=Ye?Ye.prototype:void 0,ze=Ge?Ge.toString:void 0;function Ua(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var r=Array(s);++a<s;)r[a]=t[a+e];return r}function Yt(t){if(typeof t=="string")return t;if(Xa(t))return ze?ze.call(t):"";var e=t+"";return e=="0"&&1/t==-Ca?"-0":e}function Ha(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:Ua(t,e,n)}function Va(t){return!!t&&typeof t=="object"}function Xa(t){return typeof t=="symbol"||Va(t)&&za.call(t)==Fa}function qa(t){return t==null?"":Yt(t)}function Wa(t,e,n){if(t=qa(t),t&&(n||e===void 0))return t.replace(Aa,"");if(!t||!(e=Yt(e)))return t;var a=Ne(t),s=$a(a,Ne(e));return Ha(a,s).join("")}var Ka=Wa,he=1/0,Za=9007199254740991,Ja=17976931348623157e292,Ue=NaN,Qa="[object Symbol]",es=/^\s+|\s+$/g,ts=/^[-+]0x[0-9a-f]+$/i,ns=/^0b[01]+$/i,as=/^0o[0-7]+$/i,Te="\\ud800-\\udfff",Gt="\\u0300-\\u036f\\ufe20-\\ufe23",zt="\\u20d0-\\u20f0",Ut="\\ufe0e\\ufe0f",ss="["+Te+"]",pe="["+Gt+zt+"]",ge="\\ud83c[\\udffb-\\udfff]",is="(?:"+pe+"|"+ge+")",Ht="[^"+Te+"]",Vt="(?:\\ud83c[\\udde6-\\uddff]){2}",Xt="[\\ud800-\\udbff][\\udc00-\\udfff]",qt="\\u200d",Wt=is+"?",Kt="["+Ut+"]?",rs="(?:"+qt+"(?:"+[Ht,Vt,Xt].join("|")+")"+Kt+Wt+")*",os=Kt+Wt+rs,ls="(?:"+[Ht+pe+"?",pe,Vt,Xt,ss].join("|")+")",ve=RegExp(ge+"(?="+ge+")|"+ls+os,"g"),us=RegExp("["+qt+Te+Gt+zt+Ut+"]"),cs=parseInt,ms=typeof M=="object"&&M&&M.Object===Object&&M,ds=typeof self=="object"&&self&&self.Object===Object&&self,fs=ms||ds||Function("return this")(),hs=gs("length");function ps(t){return t.split("")}function gs(t){return function(e){return e==null?void 0:e[t]}}function Ie(t){return us.test(t)}function Zt(t){return Ie(t)?ys(t):hs(t)}function vs(t){return Ie(t)?bs(t):ps(t)}function ys(t){for(var e=ve.lastIndex=0;ve.test(t);)e++;return e}function bs(t){return t.match(ve)||[]}var Es=Object.prototype,xs=Es.toString,He=fs.Symbol,Cs=Math.ceil,Fs=Math.floor,Ve=He?He.prototype:void 0,Xe=Ve?Ve.toString:void 0;function qe(t,e){var n="";if(!t||e<1||e>Za)return n;do e%2&&(n+=t),e=Fs(e/2),e&&(t+=t);while(e);return n}function As(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var r=Array(s);++a<s;)r[a]=t[a+e];return r}function Jt(t){if(typeof t=="string")return t;if(Qt(t))return Xe?Xe.call(t):"";var e=t+"";return e=="0"&&1/t==-he?"-0":e}function Ds(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:As(t,e,n)}function Ts(t,e){e=e===void 0?" ":Jt(e);var n=e.length;if(n<2)return n?qe(e,t):e;var a=qe(e,Cs(t/Zt(e)));return Ie(e)?Ds(vs(a),0,t).join(""):a.slice(0,t)}function We(t){var e=typeof t;return!!t&&(e=="object"||e=="function")}function Is(t){return!!t&&typeof t=="object"}function Qt(t){return typeof t=="symbol"||Is(t)&&xs.call(t)==Qa}function Ss(t){if(!t)return t===0?t:0;if(t=_s(t),t===he||t===-he){var e=t<0?-1:1;return e*Ja}return t===t?t:0}function ks(t){var e=Ss(t),n=e%1;return e===e?n?e-n:e:0}function _s(t){if(typeof t=="number")return t;if(Qt(t))return Ue;if(We(t)){var e=typeof t.valueOf=="function"?t.valueOf():t;t=We(e)?e+"":e}if(typeof t!="string")return t===0?t:+t;t=t.replace(es,"");var n=ns.test(t);return n||as.test(t)?cs(t.slice(2),n?2:8):ts.test(t)?Ue:+t}function Bs(t){return t==null?"":Jt(t)}function Ms(t,e,n){t=Bs(t),e=ks(e);var a=e?Zt(t):0;return e&&a<e?t+Ts(e-a,n):t}var ws=Ms,js=(t,e,n,a)=>{const s=(t+(a||"")).toString().includes("%");if(typeof t=="string"?[t,e,n,a]=t.match(/(0?\.?\d{1,3})%?\b/g).map(Number):a!==void 0&&(a=parseFloat(a)),typeof t!="number"||typeof e!="number"||typeof n!="number"||t>255||e>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof a=="number"){if(!s&&a>=0&&a<=1)a=Math.round(255*a);else if(s&&a>=0&&a<=100)a=Math.round(255*a/100);else throw new TypeError(`Expected alpha value (${a}) as a fraction or percentage`);a=(a|256).toString(16).slice(1)}else a="";return(n|e<<8|t<<16|1<<24).toString(16).slice(1)+a};const U="a-f\\d",Os=`#?[${U}]{3}[${U}]?`,Ls=`#?[${U}]{6}([${U}]{2})?`,Ps=new RegExp(`[^#${U}]`,"gi"),Rs=new RegExp(`^${Os}$|^${Ls}$`,"i");var $s=(t,e={})=>{if(typeof t!="string"||Ps.test(t)||!Rs.test(t))throw new TypeError("Expected a valid hex string");t=t.replace(/^#/,"");let n=1;t.length===8&&(n=Number.parseInt(t.slice(6,8),16)/255,t=t.slice(0,6)),t.length===4&&(n=Number.parseInt(t.slice(3,4).repeat(2),16)/255,t=t.slice(0,3)),t.length===3&&(t=t[0]+t[0]+t[1]+t[1]+t[2]+t[2]);const a=Number.parseInt(t,16),s=a>>16,r=a>>8&255,o=a&255,i=typeof e.alpha=="number"?e.alpha:n;if(e.format==="array")return[s,r,o,i];if(e.format==="css"){const l=i===1?"":` / ${Number((i*100).toFixed(2))}%`;return`rgb(${s} ${r} ${o}${l})`}return{red:s,green:r,blue:o,alpha:i}},Ns=$n,Ys=xa,Gs=Ka,zs=ws,Us=js,en=$s;const re=.75,oe=.25,le=16777215,Hs=49979693;var Vs=function(t){return"#"+Ws(String(JSON.stringify(t)))};function Xs(t){var e=Ys(t),n=[];return e.forEach(function(a){var s=Ns(a);s&&n.push(en(Gs(s,"#"),{format:"array"}))}),n}function qs(t){var e=[0,0,0];return t.forEach(function(n){for(var a=0;a<3;a++)e[a]+=n[a]}),[e[0]/t.length,e[1]/t.length,e[2]/t.length]}function Ws(t){var e,n=Xs(t);n.length>0&&(e=qs(n));var a=1,s=0,r=1;if(t.length>0)for(var o=0;o<t.length;o++)t[o].charCodeAt(0)>s&&(s=t[o].charCodeAt(0)),r=parseInt(le/s),a=(a+t[o].charCodeAt(0)*r*Hs)%le;var i=(a*t.length%le).toString(16);i=zs(i,6,i);var l=en(i,{format:"array"});return e?Us(oe*l[0]+re*e[0],oe*l[1]+re*e[1],oe*l[2]+re*e[2]):i}const Ks=Dn(Vs);function Zs(t){return[...Js].sort(()=>Math.random()-Math.random()).slice(0,t)}const Js=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function tn(t){return[...Qs].sort(()=>Math.random()-Math.random()).slice(0,t)}const Qs=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];function ei(){const t=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],e=Array.from({length:256},(s,r)=>r).sort(()=>Math.random()-.5),n=[...e,...e];function a(s,r,o){return s[0]*r+s[1]*o}return function(r,o){const i=Math.floor(r)&255,l=Math.floor(o)&255;r-=Math.floor(r),o-=Math.floor(o);const c=r*r*r*(r*(r*6-15)+10),u=o*o*o*(o*(o*6-15)+10),d=n[i]+l,m=n[i+1]+l;return(1+(a(t[n[d]&7],r,o)*(1-c)+a(t[n[m]&7],r-1,o)*c)*(1-u)+(a(t[n[d+1]&7],r,o-1)*(1-c)+a(t[n[m+1]&7],r-1,o-1)*c)*u)/2}}function ye(t,e,n,a,s){const r=ei(),o=Math.floor(t.x/I),i=Math.floor(t.y/I),l=Math.floor(a/4),c=.5,u=.005,d=.7;for(let f=i-l;f<=i+l;f++)for(let p=o-l;p<=o+l;p++)if(p>=0&&p<a&&f>=0&&f<s){let b=p,v=f;for(let F=0;F<e;F++)Math.random()<d&&(b+=Math.random()>.5?1:-1,v+=Math.random()>.5?1:-1);b=Math.max(0,Math.min(a-1,b)),v=Math.max(0,Math.min(s-1,v));const x=Math.sqrt((b-o)*(b-o)+(v-i)*(v-i))/l,g=r(p*u,f*u);if(x<1&&g>c+x*.01){const F=f*a+p;n[F].type=k.GROUND,n[F].depth=void 0,n[F].height=(1-x)*2*(g-c)}}const m=Math.min(Math.max(i*a+o,0),a);n[m].type=k.GROUND,n[m].depth=void 0,n[m].height=1}function ti(t,e){return{x:Math.floor(Math.random()*(t*.8)+t*.1)*I,y:Math.floor(Math.random()*(e*.8)+e*.1)*I}}function ni(t,e,n,a){if(t.x<0||t.y<0||t.x>=n||t.y>=a)return!1;const s=Math.floor(n/(Math.sqrt(e.length+1)*2));return e.every(r=>Math.abs(t.x-r.x)>s||Math.abs(t.y-r.y)>s)}function ai(t,e,n){return e.every(a=>Math.sqrt(Math.pow(t.x-a.position.x,2)+Math.pow(t.y-a.position.y,2))>=n)}function si(t,e,n,a,s){const r=[],o=[],i=[],l=j*3,c=tn(t*2).filter(f=>f!==e),u=5,d=Zs(t*u*2),m=[];for(let f=0;f<t;f++){const p=`state-${f+1}`,b=f===0?e:c.pop(),v=ii(p,b,f===0);r.push(v),r.forEach(g=>{v.strategies[g.id]=E.NEUTRAL,g.strategies[p]=E.NEUTRAL});const x=ri(m,n,a);m.push(x),ye(x,n/2,s,n,a),oi(p,x,u,d,o,i,l,s,n,a),v.population=o.filter(g=>g.stateId===p).reduce((g,F)=>g+F.population,0)}return li(s,o),{states:r,cities:o,launchSites:i}}function ii(t,e,n){return{id:t,name:e,color:Ks(e),isPlayerControlled:n,strategies:{},generalStrategy:n?void 0:[E.NEUTRAL,E.HOSTILE,E.FRIENDLY].sort(()=>Math.random()-.5)[0],population:0}}function ri(t,e,n){let a,s=10;do if(a=ti(e,n),s--<=0)break;while(!ni(a,t,e,n));return a}function oi(t,e,n,a,s,r,o,i,l,c){const u=[];for(let d=0;d<n;d++){const m=Ke(e,u,o,30*I);u.push({position:m}),s.push({id:`city-${s.length+1}`,stateId:t,name:a.pop(),position:m,population:Math.floor(Math.random()*3e3)+1e3}),ye(m,2,i,l,c)}for(const d of s){const m=i.filter(f=>{const p=f.position.x-d.position.x,b=f.position.y-d.position.y;return Math.sqrt(p*p+b*b)<O});for(const f of m){f.cityId=d.id;const p=f.position.x-d.position.x,b=f.position.y-d.position.y,v=Math.sqrt(p*p+b*b);f.population=Math.max(0,O-v)/O*pt}d.population=m.reduce((f,p)=>f+p.population,0)}for(let d=0;d<4;d++){const m=Ke(e,u,o,15*I);u.push({position:m}),r.push({type:gt.LAUNCH_SITE,id:`launch-site-${r.length+1}`,stateId:t,position:m,mode:Math.random()>.5?_.DEFENCE:_.ATTACK}),ye(m,1,i,l,c)}return u}function Ke(t,e,n,a){let s,r=10;do if(s={x:t.x+(Math.random()-.5)*a,y:t.y+(Math.random()-.5)*a},r--<=0)break;while(!ai(s,e,n));return s}function li(t,e){const n=new Map(t.map(s=>[s.id,s])),a=[];for(e.forEach(s=>{t.filter(o=>o.cityId===s.id).forEach(o=>{o.stateId=s.stateId,a.push(o)})});a.length>0;){const s=a.splice(0,1)[0];ui(s,n).forEach(o=>{!o.stateId&&o.type===k.GROUND&&(o.stateId=s.stateId,a.push(o))})}}function ui(t,e){const n=[];return[{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:-1},{dx:0,dy:1}].forEach(({dx:s,dy:r})=>{const o=`${t.position.x+s*I},${t.position.y+r*I}`,i=e.get(o);i&&n.push(i)}),n}function ci({playerStateName:t,numberOfStates:e=3}){const n=Math.max(200,Math.ceil(Math.sqrt(e)*10)),a=n,s=On(n,a),{states:r,cities:o,launchSites:i}=si(e,t,n,a,s);return Ln(s,n,a),{timestamp:0,states:r,cities:o,launchSites:i,sectors:s,missiles:[],explosions:[],interceptors:[]}}function S(t,e,n,a){return Math.sqrt(Math.pow(n-t,2)+Math.pow(a-e,2))}function mi(t){var n;const e=t.sectors.filter(a=>a.cityId&&a.population>0);for(const a of t.states){const s=t.cities.filter(u=>u.stateId===a.id),r=t.launchSites.filter(u=>u.stateId===a.id),o=t.cities.filter(u=>a.strategies[u.stateId]===E.HOSTILE&&u.stateId!==a.id&&u.population>0).map(u=>({...u,isCity:!0})),i=t.missiles.filter(u=>a.strategies[u.stateId]!==E.FRIENDLY&&u.stateId!==a.id),l=t.launchSites.filter(u=>a.strategies[u.stateId]===E.HOSTILE&&u.stateId!==a.id).map(u=>({...u,isCity:!1})),c=i.filter(u=>s.some(d=>be(u.target,d.position,j+O))||r.some(d=>be(u.target,d.position,j))).filter(u=>(t.timestamp-u.launchTimestamp)/(u.targetTimestamp-u.launchTimestamp)>.5);for(const u of t.launchSites.filter(d=>d.stateId===a.id)){if(u.nextLaunchTarget)continue;if(o.length===0&&l.length===0&&i.length===0)break;const d=Ze(c.map(v=>({...v,isCity:!1})),u.position),m=t.missiles.filter(v=>v.stateId===a.id),f=t.interceptors.filter(v=>v.stateId===a.id),p=f.filter(v=>!v.targetMissileId&&u.id===v.launchSiteId),b=fi(f,d).filter(([,v])=>v<r.length);if(u.mode===_.DEFENCE&&b.length>0){const v=b[0][0];p.length>0?p[0].targetMissileId=v:u.nextLaunchTarget={type:"missile",missileId:v}}else if(u.mode===_.ATTACK){const v=di(Ze([...l,...o],u.position),m),x=(n=v==null?void 0:v[0])==null?void 0:n[0];if(x!=null&&x.position&&(x!=null&&x.isCity)){const g=hi(x,e);u.nextLaunchTarget={type:"position",position:g||{x:x.position.x+(Math.random()-Math.random())*O,y:x.position.y+(Math.random()-Math.random())*O}}}else u.nextLaunchTarget=x!=null&&x.position?{type:"position",position:x==null?void 0:x.position}:void 0}}}return t}function be(t,e,n){return S(t.x,t.y,e.x,e.y)<=n}function Ze(t,e){return t.sort((n,a)=>S(n.position.x,n.position.y,e.x,e.y)-S(a.position.x,a.position.y,e.x,e.y))}function di(t,e){const n=new Map;for(const a of t)n.set(a,e.filter(s=>be(s.target,a.position,j)).length);return Array.from(n).sort((a,s)=>a[1]-s[1])}function fi(t,e){const n=new Map;for(const a of e)n.set(a.id,0);for(const a of t)a.targetMissileId&&n.set(a.targetMissileId,(n.get(a.targetMissileId)??0)+1);return Array.from(n).sort((a,s)=>a[1]-s[1])}function hi(t,e){const n=e.filter(s=>s.cityId===t.id);return!n||n.length===0?null:n[Math.floor(Math.random()*n.length)].position}function pi(t){var e,n;for(const a of t.missiles.filter(s=>s.launchTimestamp===t.timestamp)){const s=t.states.find(o=>o.id===a.stateId),r=((e=t.cities.find(o=>S(o.position.x,o.position.y,a.target.x,a.target.y)<=j))==null?void 0:e.stateId)||((n=t.launchSites.find(o=>S(o.position.x,o.position.y,a.target.x,a.target.y)<=j))==null?void 0:n.stateId);if(s&&r&&s.id!==r){s.strategies[r]!==E.HOSTILE&&(s.strategies[r]=E.HOSTILE);const o=t.states.find(i=>i.id===r);o&&o.strategies[s.id]!==E.HOSTILE&&(o.strategies[s.id]=E.HOSTILE,t.states.forEach(i=>{i.id!==o.id&&i.strategies[o.id]===E.FRIENDLY&&o.strategies[i.id]===E.FRIENDLY&&(i.strategies[s.id]=E.HOSTILE,s.strategies[i.id]=E.HOSTILE)}))}}for(const a of t.states.filter(s=>!s.isPlayerControlled))gi(a,t);return t}function gi(t,e){const n=e.states.filter(o=>o.id!==t.id);t.strategies={...t.strategies},t.generalStrategy!==E.HOSTILE&&n.forEach(o=>{o.strategies[t.id]===E.FRIENDLY&&t.strategies[o.id]===E.NEUTRAL&&(t.strategies[o.id]=E.FRIENDLY)});const a=n.filter(o=>Object.values(o.strategies).every(i=>i!==E.HOSTILE)&&o.generalStrategy!==E.HOSTILE);if(a.length>0&&t.generalStrategy===E.FRIENDLY){const o=a[Math.floor(Math.random()*a.length)];t.strategies[o.id]=E.FRIENDLY}const s=n.filter(o=>t.strategies[o.id]===E.FRIENDLY&&o.strategies[t.id]===E.FRIENDLY);s.forEach(o=>{n.forEach(i=>{i.strategies[o.id]===E.HOSTILE&&t.strategies[i.id]!==E.HOSTILE&&(t.strategies[i.id]=E.HOSTILE)})}),n.filter(o=>o.strategies[t.id]!==E.FRIENDLY&&t.strategies[o.id]!==E.FRIENDLY).forEach(o=>{if(vi(o,t,s,e)){const i=e.launchSites.filter(l=>l.stateId===t.id&&!l.lastLaunchTimestamp);if(i.length>0){const l=i[Math.floor(Math.random()*i.length)],c=[...e.cities.filter(u=>u.stateId===o.id),...e.launchSites.filter(u=>u.stateId===o.id)];if(c.length>0){const u=c[Math.floor(Math.random()*c.length)];l.nextLaunchTarget={type:"position",position:u.position}}}}})}function vi(t,e,n,a){const s=a.launchSites.filter(i=>i.stateId===t.id),r=a.launchSites.filter(i=>i.stateId===e.id||n.some(l=>l.id===i.stateId));return s.length<r.length?!0:a.missiles.some(i=>a.cities.some(l=>l.stateId===t.id&&S(l.position.x,l.position.y,i.target.x,i.target.y)<=j)||a.launchSites.some(l=>l.stateId===t.id&&S(l.position.x,l.position.y,i.target.x,i.target.y)<=j))}function yi(t,e){for(;e>0;){const n=bi(t,e>q?q:e);e=e>q?e-q:0,t=n}return t}function bi(t,e){var r,o;const n=t.timestamp+e;let a={timestamp:n,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,interceptors:t.interceptors,explosions:t.explosions,sectors:t.sectors};for(const i of a.missiles){const l=(n-i.launchTimestamp)/(i.targetTimestamp-i.launchTimestamp);i.position={x:i.launch.x+(i.target.x-i.launch.x)*l,y:i.launch.y+(i.target.y-i.launch.y)*l}}for(const i of a.interceptors){const l=a.missiles.find(f=>f.id===i.targetMissileId);l||(i.targetMissileId=void 0);const c=l?l.position.x-i.position.x:Math.cos(i.direction),u=l?l.position.y-i.position.y:Math.sin(i.direction),d=Math.sqrt(c*c+u*u);if(i.direction=Math.atan2(u,c),l&&d<=J*e)i.position={...l.position};else{const f=J*e/d;i.position={x:i.position.x+c*f,y:i.position.y+u*f}}i.tail=[...i.tail.slice(-100),{timestamp:n,position:i.position}],J*(n-i.launchTimestamp)>i.maxRange&&(a.interceptors=a.interceptors.filter(f=>f.id!==i.id))}for(const i of a.interceptors){const l=a.missiles.find(c=>c.id===i.targetMissileId);l&&S(i.position.x,i.position.y,l.position.x,l.position.y)<kn&&(a.missiles=a.missiles.filter(u=>u.id!==l.id),a.interceptors=a.interceptors.filter(u=>u.id!==i.id))}for(const i of t.missiles.filter(l=>l.targetTimestamp<=n)){const l={id:`explosion-${Math.random()}`,missileId:i.id,startTimestamp:i.targetTimestamp,endTimestamp:i.targetTimestamp+Bn,position:i.target,radius:j};a.explosions.push(l);for(const m of t.sectors.filter(f=>S(f.position.x,f.position.y,l.position.x,l.position.y)<=l.radius))if(m.population){const f=Math.max(wn,m.population*Mn);m.population=Math.max(0,m.population-f)}const c=t.missiles.filter(m=>m.id!==l.missileId&&m.launchTimestamp<=l.startTimestamp&&m.targetTimestamp>=l.startTimestamp).filter(m=>S(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius),u=t.interceptors.filter(m=>m.launchTimestamp<=l.startTimestamp).filter(m=>S(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius);for(const m of c)m.targetTimestamp=l.startTimestamp;for(const m of u)a.interceptors=a.interceptors.filter(f=>f.id!==m.id);const d=t.launchSites.filter(m=>S(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius);for(const m of d)a.launchSites=t.launchSites.filter(f=>f.id!==m.id)}a.explosions=a.explosions.filter(i=>i.endTimestamp>=n),a.missiles=a.missiles.filter(i=>i.targetTimestamp>n);for(const i of a.launchSites)i.modeChangeTimestamp&&n>=i.modeChangeTimestamp+ce&&(i.mode=i.mode===_.ATTACK?_.DEFENCE:_.ATTACK,i.modeChangeTimestamp=void 0);for(const i of t.launchSites){if(i.nextLaunchTarget){if(i.lastLaunchTimestamp&&n-i.lastLaunchTimestamp<(i.mode===_.ATTACK?me:jn))continue}else continue;if(i.mode===_.ATTACK&&((r=i.nextLaunchTarget)==null?void 0:r.type)==="position"){const l={id:Math.random()+"",stateId:i.stateId,launchSiteId:i.id,launch:i.position,launchTimestamp:n,position:i.position,target:i.nextLaunchTarget.position,targetTimestamp:n+S(i.position.x,i.position.y,i.nextLaunchTarget.position.x,i.nextLaunchTarget.position.y)/ht};a.missiles.push(l)}else if(i.mode===_.DEFENCE&&((o=i.nextLaunchTarget)==null?void 0:o.type)==="missile"){const l=i.nextLaunchTarget.missileId;if(l){const c={id:Math.random()+"",stateId:i.stateId,launchSiteId:i.id,launch:i.position,launchTimestamp:n,position:i.position,direction:0,tail:[],targetMissileId:l,maxRange:Ae};a.interceptors.push(c)}}i.lastLaunchTimestamp=n,i.nextLaunchTarget=void 0}const s=a.sectors.reduce((i,l)=>(l.cityId&&(i[l.cityId]=i[l.cityId]?i[l.cityId]+(l.population??0):l.population??0),i),{});for(const i of a.cities)i.population=s[i.id];return a.states=a.states.map(i=>{const l=a.cities.filter(c=>c.stateId===i.id).reduce((c,u)=>c+u.population,0);return{...i,population:l}}),a=mi(a),a=pi(a),a}function Ei(t){const[e,n]=y.useState(()=>ci({playerStateName:t,numberOfStates:6})),a=y.useCallback((s,r)=>n(yi(s,r)),[]);return{worldState:e,updateWorldState:a,setWorldState:n}}const nn={x:0,y:0,pointingObjects:[]},xi=(t,e)=>e.type==="move"?{x:e.x,y:e.y,pointingObjects:t.pointingObjects}:e.type==="point"&&!t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,e.object]}:e.type==="unpoint"&&t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(n=>n.id!==e.object.id)}:t,Ci=y.createContext(nn),Se=y.createContext(()=>{});function Fi({children:t}){const[e,n]=y.useReducer(xi,nn);return h.jsx(Ci.Provider,{value:e,children:h.jsx(Se.Provider,{value:n,children:t})})}function Ai(){const t=y.useContext(Se);return(e,n)=>t({type:"move",x:e,y:n})}function ke(){const t=y.useContext(Se);return[e=>t({type:"point",object:e}),e=>t({type:"unpoint",object:e})]}const _e={},Di=(t,e)=>e.type==="clear"?_e:e.type==="set"?{...t,selectedObject:e.object}:t,an=y.createContext(_e),sn=y.createContext(()=>{});function Ti({children:t}){const[e,n]=y.useReducer(Di,_e);return h.jsx(an.Provider,{value:e,children:h.jsx(sn.Provider,{value:n,children:t})})}function Ii(t){var a;const e=y.useContext(sn);return[((a=y.useContext(an).selectedObject)==null?void 0:a.id)===t.id,()=>e({type:"set",object:t})]}function H(t,e){const n=new CustomEvent(t,{bubbles:!0,detail:e});document.dispatchEvent(n)}function ae(t,e){y.useEffect(()=>{const n=a=>{e(a.detail)};return document.addEventListener(t,n,!1),()=>{document.removeEventListener(t,n,!1)}},[t,e])}const Si=z.memo(({sectors:t,states:e})=>{const n=y.useRef(null),[a,s]=ke(),[r,o]=y.useState(0);return ae("cityDamage",()=>{o(r+1)}),y.useEffect(()=>{const i=n.current,l=i==null?void 0:i.getContext("2d");if(!i||!l)return;const c=Math.min(...t.map(g=>g.rect.left)),u=Math.min(...t.map(g=>g.rect.top)),d=Math.max(...t.map(g=>g.rect.right)),m=Math.max(...t.map(g=>g.rect.bottom)),f=d-c,p=m-u;i.width=f,i.height=p,i.style.width=`${f}px`,i.style.height=`${p}px`;const b=Math.max(...t.filter(g=>g.type===k.WATER).map(g=>g.depth||0)),v=Math.max(...t.filter(g=>g.type===k.GROUND).map(g=>g.height||0)),x=new Map(e.map(g=>[g.id,g.color]));l.clearRect(0,0,f,p),t.forEach(g=>{const{fillStyle:F,drawSector:G}=ki(g,b,v,x);l.fillStyle=F,G(l,g.rect,c,u)})},[r]),y.useEffect(()=>{const i=n.current;let l;const c=u=>{const d=i==null?void 0:i.getBoundingClientRect(),m=u.clientX-((d==null?void 0:d.left)||0),f=u.clientY-((d==null?void 0:d.top)||0),p=t.find(b=>m>=b.rect.left&&m<=b.rect.right&&f>=b.rect.top&&f<=b.rect.bottom);p&&(l&&s(l),a(p),l=p)};return i==null||i.addEventListener("mousemove",c),()=>{i==null||i.removeEventListener("mousemove",c)}},[t,a,s]),h.jsx("canvas",{ref:n,style:{opacity:.5}})});function ki(t,e,n,a){const s=_i(t,e,n),r=t.stateId?a.get(t.stateId):void 0;return{fillStyle:s,drawSector:(o,i,l,c)=>{o.fillStyle=s,o.fillRect(i.left-l,i.top-c,i.right-i.left,i.bottom-i.top),r&&(o.fillStyle=`${r}80`,o.fillRect(i.left-l,i.top-c,i.right-i.left,i.bottom-i.top)),t.cityId&&t.population>0&&Mi(o,i,l,c)}}}function _i(t,e,n){switch(t.type){case k.GROUND:return t.cityId?Bi(t):wi(t.height||0,n);case k.WATER:return ji(t.depth||0,e);default:return"rgb(0, 34, 93)"}}function Bi(t){if(t.population===0)return"rgba(0,0,0,0.7)";const e=t.population?Math.min(t.population/pt,1):0,n=t.height?t.height/100:0,s=[200,200,200].map(r=>r-50*e+20*n);return`rgb(${s[0]}, ${s[1]}, ${s[2]})`}function Mi(t,e,n,a){t.fillStyle="rgba(0, 0, 0, 0.2)",t.fillRect(e.left-n+2,e.top-a+2,e.right-e.left-4,e.bottom-e.top-4),t.fillStyle="rgba(255, 255, 255, 0.6)",t.fillRect(e.left-n+4,e.top-a+4,e.right-e.left-8,e.bottom-e.top-8)}function wi(t,e){const n=t/e;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const a=Math.round(34+67*((n-.5)/.3)),s=Math.round(100+-33*((n-.5)/.3)),r=Math.round(34+-1*((n-.5)/.3));return`rgb(${a}, ${s}, ${r})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}function ji(t,e){const n=t/e,a=Math.round(0+34*(1-n)),s=Math.round(137+-103*n),r=Math.round(178+-85*n);return`rgb(${a}, ${s}, ${r})`}const W=O;function Oi({state:t,cities:e,launchSites:n}){const{boundingBox:a}=z.useMemo(()=>{const s=[...e.filter(l=>l.stateId===t.id&&l.population>0).map(l=>l.position),...n.filter(l=>l.stateId===t.id).map(l=>l.position)].map(({x:l,y:c})=>[{x:l,y:c},{x:l+W,y:c},{x:l,y:c+W},{x:l-W,y:c},{x:l,y:c-W}]).flat(),r=Pi(s),o=$i(r),i=r.map((l,c)=>`${c===0?"M":"L"} ${l.x-o.minX} ${l.y-o.minY}`).join(" ")+"Z";return{boundingBox:o,pathData:i}},[t,e,n]);return h.jsx(h.Fragment,{children:h.jsx(Li,{style:{transform:`translate(${(a.maxX+a.minX)/2}px, ${a.minY}px) translateX(-50%) translateY(-150%)`,color:t.color},children:t.name})})}const Li=C.div`
  position: absolute;
  color: white;
  text-shadow: 2px 2px 0px white;
  pointer-events: none;
  font-size: x-large;
`;function Pi(t){if(t.length<3)return t;const e=t.reduce((s,r)=>r.y<s.y?r:s,t[0]),n=t.sort((s,r)=>{const o=Math.atan2(s.y-e.y,s.x-e.x),i=Math.atan2(r.y-e.y,r.x-e.x);return o-i}),a=[n[0],n[1]];for(let s=2;s<n.length;s++){for(;a.length>1&&!Ri(a[a.length-2],a[a.length-1],n[s]);)a.pop();a.push(n[s])}return a}function Ri(t,e,n){return(e.x-t.x)*(n.y-t.y)-(e.y-t.y)*(n.x-t.x)>0}function $i(t){return t.reduce((n,a)=>({minX:Math.min(n.minX,a.x),minY:Math.min(n.minY,a.y),maxX:Math.max(n.maxX,a.x),maxY:Math.max(n.maxY,a.y)}),{minX:1/0,minY:1/0,maxX:-1/0,maxY:-1/0})}function Ni({city:t}){const[e,n]=ke(),a=t.population;return a?h.jsxs(Yi,{onMouseEnter:()=>e(t),onMouseLeave:()=>n(t),style:{"--x":t.position.x,"--y":t.position.y},children:[h.jsx("span",{children:t.name}),h.jsxs(Gi,{children:[a<<0," population"]})]}):null}const Yi=C.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`,Gi=C.div`
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
`;function zi({launchSite:t,worldTimestamp:e,isPlayerControlled:n}){const[a,s]=Ii(t),[r,o]=ke(),i=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+me>e,l=i?(e-t.lastLaunchTimestamp)/me:0,c=t.modeChangeTimestamp&&e<t.modeChangeTimestamp+ce,u=c?(e-t.modeChangeTimestamp)/ce:0;return h.jsx(Ui,{onMouseEnter:()=>r(t),onMouseLeave:()=>o(t),onClick:()=>n&&s(),style:{"--x":t.position.x,"--y":t.position.y,"--cooldown-progress":l,"--mode-change-progress":u},"data-selected":a,"data-cooldown":i,"data-mode":t.mode,"data-changing-mode":c,children:h.jsx(Hi,{children:t.mode===_.ATTACK?"A":"D"})})}const Ui=C.div`
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
`;function rn(t,e){e===void 0&&(e=!0);var n=y.useRef(null),a=y.useRef(!1),s=y.useRef(t);s.current=t;var r=y.useCallback(function(i){a.current&&(s.current(i),n.current=requestAnimationFrame(r))},[]),o=y.useMemo(function(){return[function(){a.current&&(a.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){a.current||(a.current=!0,n.current=requestAnimationFrame(r))},function(){return a.current}]},[]);return y.useEffect(function(){return e&&o[1](),o[0]},[]),o}function Vi(t,e,n){if(e.startTimestamp>n||e.endTimestamp<n)return;const a=Math.pow(Math.min(Math.max(0,(n-e.startTimestamp)/(e.endTimestamp-e.startTimestamp)),1),.15);t.fillStyle=`rgb(${255*a}, ${255*(1-a)}, 0)`,t.beginPath(),t.arc(e.position.x,e.position.y,e.radius*a,0,2*Math.PI),t.fill()}function Xi(t,e,n){e.launchTimestamp>n||e.targetTimestamp<n||(t.fillStyle="rgb(255, 0, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,2,0,2*Math.PI),t.fill())}function qi(t,e){t.fillStyle="rgb(0, 255, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,1,0,2*Math.PI),t.fill()}function Je(t,e,n){if(!(e.launchTimestamp>n))if("targetTimestamp"in e){if(e.targetTimestamp<n)return;Wi(t,e,n)}else Ki(t,e,n)}function Wi(t,e,n){const a=Math.min(Math.max(n-5,e.launchTimestamp)-e.launchTimestamp,e.targetTimestamp-e.launchTimestamp),s=e.targetTimestamp-e.launchTimestamp,r=s>0?a/s:0,o=e.launch.x+(e.position.x-e.launch.x)*r,i=e.launch.y+(e.position.y-e.launch.y)*r,l={x:o,y:i},c=t.createLinearGradient(l.x,l.y,e.position.x,e.position.y);c.addColorStop(0,"rgba(255, 255, 255, 0)"),c.addColorStop(1,"rgba(255, 255, 255, 0.5)"),t.strokeStyle=c,t.lineWidth=1,t.beginPath(),t.moveTo(l.x,l.y),t.lineTo(e.position.x,e.position.y),t.stroke()}function Ki(t,e,n){const s=Math.max(n-5,e.launchTimestamp),r=e.tail.filter(i=>i.timestamp>=s);if(r.length<2)return;t.beginPath(),t.moveTo(r[0].position.x,r[0].position.y);for(let i=1;i<r.length;i++)t.lineTo(r[i].position.x,r[i].position.y);t.lineTo(e.position.x,e.position.y);const o=t.createLinearGradient(r[0].position.x,r[0].position.y,e.position.x,e.position.y);o.addColorStop(0,"rgba(0, 255, 0, 0)"),o.addColorStop(1,"rgba(0, 255, 0, 0.5)"),t.strokeStyle=o,t.lineWidth=1,t.stroke()}function Zi(t,e){if(Math.sqrt(Math.pow(e.position.x-e.launch.x,2)+Math.pow(e.position.y-e.launch.y,2))>Ae)for(let o=0;o<5;o++){const i=Math.PI*2/5*o,l=e.position.x+Math.cos(i)*3,c=e.position.y+Math.sin(i)*3;t.fillStyle="rgba(0, 255, 0, 0.5)",t.beginPath(),t.arc(l,c,1,0,2*Math.PI),t.fill()}}function Ji({state:t}){const e=y.useRef(null);return y.useLayoutEffect(()=>{const a=e.current;if(!a)return;const s=Math.min(...t.sectors.map(u=>u.rect.left)),r=Math.min(...t.sectors.map(u=>u.rect.top)),o=Math.max(...t.sectors.map(u=>u.rect.right)),i=Math.max(...t.sectors.map(u=>u.rect.bottom)),l=o-s,c=i-r;a.width=l,a.height=c,a.style.width=`${l}px`,a.style.height=`${c}px`},[t.sectors]),rn(()=>{const a=e.current;if(!a)return;const s=a.getContext("2d");s&&(s.clearRect(0,0,a.width,a.height),t.missiles.forEach(r=>{Je(s,r,t.timestamp)}),t.interceptors.forEach(r=>{Je(s,r,t.timestamp)}),t.missiles.filter(r=>r.launchTimestamp<t.timestamp&&r.targetTimestamp>t.timestamp).forEach(r=>{Xi(s,r,t.timestamp)}),t.interceptors.filter(r=>r.launchTimestamp<t.timestamp).forEach(r=>{qi(s,r),J*(t.timestamp-r.launchTimestamp+1)>Ae&&Zi(s,r)}),t.explosions.filter(r=>r.startTimestamp<t.timestamp&&r.endTimestamp>t.timestamp).forEach(r=>{Vi(s,r,t.timestamp)}))}),h.jsx(Qi,{ref:e})}const Qi=C.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function er({state:t}){const e=Ai();return h.jsxs(tr,{onMouseMove:n=>e(n.clientX,n.clientY),onClick:()=>H("world-click"),children:[h.jsx(Si,{sectors:t.sectors,states:t.states}),t.states.map(n=>h.jsx(Oi,{state:n,cities:t.cities,launchSites:t.launchSites},n.id)),t.cities.map(n=>h.jsx(Ni,{city:n},n.id)),t.launchSites.map(n=>{var a;return h.jsx(zi,{launchSite:n,worldTimestamp:t.timestamp,isPlayerControlled:n.stateId===((a=t.states.find(s=>s.isPlayerControlled))==null?void 0:a.id)},n.id)}),h.jsx(Ji,{state:t})]})}const tr=C.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function nr(t,e,n){return Math.max(e,Math.min(t,n))}const A={toVector(t,e){return t===void 0&&(t=e),Array.isArray(t)?t:[t,t]},add(t,e){return[t[0]+e[0],t[1]+e[1]]},sub(t,e){return[t[0]-e[0],t[1]-e[1]]},addTo(t,e){t[0]+=e[0],t[1]+=e[1]},subTo(t,e){t[0]-=e[0],t[1]-=e[1]}};function Qe(t,e,n){return e===0||Math.abs(e)===1/0?Math.pow(t,n*5):t*e*n/(e+n*t)}function et(t,e,n,a=.15){return a===0?nr(t,e,n):t<e?-Qe(e-t,n-e,a)+e:t>n?+Qe(t-n,n-e,a)+n:t}function ar(t,[e,n],[a,s]){const[[r,o],[i,l]]=t;return[et(e,r,o,a),et(n,i,l,s)]}function sr(t,e){if(typeof t!="object"||t===null)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var a=n.call(t,e||"default");if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function ir(t){var e=sr(t,"string");return typeof e=="symbol"?e:String(e)}function T(t,e,n){return e=ir(e),e in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function tt(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(t);e&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(t,s).enumerable})),n.push.apply(n,a)}return n}function D(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?tt(Object(n),!0).forEach(function(a){T(t,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):tt(Object(n)).forEach(function(a){Object.defineProperty(t,a,Object.getOwnPropertyDescriptor(n,a))})}return t}const on={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function nt(t){return t?t[0].toUpperCase()+t.slice(1):""}const rr=["enter","leave"];function or(t=!1,e){return t&&!rr.includes(e)}function lr(t,e="",n=!1){const a=on[t],s=a&&a[e]||e;return"on"+nt(t)+nt(s)+(or(n,s)?"Capture":"")}const ur=["gotpointercapture","lostpointercapture"];function cr(t){let e=t.substring(2).toLowerCase();const n=!!~e.indexOf("passive");n&&(e=e.replace("passive",""));const a=ur.includes(e)?"capturecapture":"capture",s=!!~e.indexOf(a);return s&&(e=e.replace("capture","")),{device:e,capture:s,passive:n}}function mr(t,e=""){const n=on[t],a=n&&n[e]||e;return t+a}function se(t){return"touches"in t}function ln(t){return se(t)?"touch":"pointerType"in t?t.pointerType:"mouse"}function dr(t){return Array.from(t.touches).filter(e=>{var n,a;return e.target===t.currentTarget||((n=t.currentTarget)===null||n===void 0||(a=n.contains)===null||a===void 0?void 0:a.call(n,e.target))})}function fr(t){return t.type==="touchend"||t.type==="touchcancel"?t.changedTouches:t.targetTouches}function un(t){return se(t)?fr(t)[0]:t}function Ee(t,e){try{const n=e.clientX-t.clientX,a=e.clientY-t.clientY,s=(e.clientX+t.clientX)/2,r=(e.clientY+t.clientY)/2,o=Math.hypot(n,a);return{angle:-(Math.atan2(n,a)*180)/Math.PI,distance:o,origin:[s,r]}}catch{}return null}function hr(t){return dr(t).map(e=>e.identifier)}function at(t,e){const[n,a]=Array.from(t.touches).filter(s=>e.includes(s.identifier));return Ee(n,a)}function ue(t){const e=un(t);return se(t)?e.identifier:e.pointerId}function Y(t){const e=un(t);return[e.clientX,e.clientY]}const st=40,it=800;function cn(t){let{deltaX:e,deltaY:n,deltaMode:a}=t;return a===1?(e*=st,n*=st):a===2&&(e*=it,n*=it),[e,n]}function pr(t){var e,n;const{scrollX:a,scrollY:s,scrollLeft:r,scrollTop:o}=t.currentTarget;return[(e=a??r)!==null&&e!==void 0?e:0,(n=s??o)!==null&&n!==void 0?n:0]}function gr(t){const e={};if("buttons"in t&&(e.buttons=t.buttons),"shiftKey"in t){const{shiftKey:n,altKey:a,metaKey:s,ctrlKey:r}=t;Object.assign(e,{shiftKey:n,altKey:a,metaKey:s,ctrlKey:r})}return e}function ee(t,...e){return typeof t=="function"?t(...e):t}function vr(){}function yr(...t){return t.length===0?vr:t.length===1?t[0]:function(){let e;for(const n of t)e=n.apply(this,arguments)||e;return e}}function rt(t,e){return Object.assign({},e,t||{})}const br=32;class mn{constructor(e,n,a){this.ctrl=e,this.args=n,this.key=a,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(e){this.ctrl.state[this.key]=e}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:e,shared:n,ingKey:a,args:s}=this;n[a]=e._active=e.active=e._blocked=e._force=!1,e._step=[!1,!1],e.intentional=!1,e._movement=[0,0],e._distance=[0,0],e._direction=[0,0],e._delta=[0,0],e._bounds=[[-1/0,1/0],[-1/0,1/0]],e.args=s,e.axis=void 0,e.memo=void 0,e.elapsedTime=e.timeDelta=0,e.direction=[0,0],e.distance=[0,0],e.overflow=[0,0],e._movementBound=[!1,!1],e.velocity=[0,0],e.movement=[0,0],e.delta=[0,0],e.timeStamp=0}start(e){const n=this.state,a=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=e.target,n.currentTarget=e.currentTarget,n.lastOffset=a.from?ee(a.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=e.timeStamp)}computeValues(e){const n=this.state;n._values=e,n.values=this.config.transform(e)}computeInitial(){const e=this.state;e._initial=e._values,e.initial=e.values}compute(e){const{state:n,config:a,shared:s}=this;n.args=this.args;let r=0;if(e&&(n.event=e,a.preventDefault&&e.cancelable&&n.event.preventDefault(),n.type=e.type,s.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,s.locked=!!document.pointerLockElement,Object.assign(s,gr(e)),s.down=s.pressed=s.buttons%2===1||s.touches>0,r=e.timeStamp-n.timeStamp,n.timeStamp=e.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const L=n._delta.map(Math.abs);A.addTo(n._distance,L)}this.axisIntent&&this.axisIntent(e);const[o,i]=n._movement,[l,c]=a.threshold,{_step:u,values:d}=n;if(a.hasCustomTransform?(u[0]===!1&&(u[0]=Math.abs(o)>=l&&d[0]),u[1]===!1&&(u[1]=Math.abs(i)>=c&&d[1])):(u[0]===!1&&(u[0]=Math.abs(o)>=l&&Math.sign(o)*l),u[1]===!1&&(u[1]=Math.abs(i)>=c&&Math.sign(i)*c)),n.intentional=u[0]!==!1||u[1]!==!1,!n.intentional)return;const m=[0,0];if(a.hasCustomTransform){const[L,An]=d;m[0]=u[0]!==!1?L-u[0]:0,m[1]=u[1]!==!1?An-u[1]:0}else m[0]=u[0]!==!1?o-u[0]:0,m[1]=u[1]!==!1?i-u[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(m);const f=n.offset,p=n._active&&!n._blocked||n.active;p&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=s[this.ingKey]=n._active,e&&(n.first&&("bounds"in a&&(n._bounds=ee(a.bounds,n)),this.setup&&this.setup()),n.movement=m,this.computeOffset()));const[b,v]=n.offset,[[x,g],[F,G]]=n._bounds;n.overflow=[b<x?-1:b>g?1:0,v<F?-1:v>G?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const Fn=n._active?a.rubberband||[0,0]:[0,0];if(n.offset=ar(n._bounds,n.offset,Fn),n.delta=A.sub(n.offset,f),this.computeMovement(),p&&(!n.last||r>br)){n.delta=A.sub(n.offset,f);const L=n.delta.map(Math.abs);A.addTo(n.distance,L),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&r>0&&(n.velocity=[L[0]/r,L[1]/r],n.timeDelta=r)}}emit(){const e=this.state,n=this.shared,a=this.config;if(e._active||this.clean(),(e._blocked||!e.intentional)&&!e._force&&!a.triggerAllEvents)return;const s=this.handler(D(D(D({},n),e),{},{[this.aliasKey]:e.values}));s!==void 0&&(e.memo=s)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function Er([t,e],n){const a=Math.abs(t),s=Math.abs(e);if(a>s&&a>n)return"x";if(s>a&&s>n)return"y"}class V extends mn{constructor(...e){super(...e),T(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=A.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=A.sub(this.state.offset,this.state.lastOffset)}axisIntent(e){const n=this.state,a=this.config;if(!n.axis&&e){const s=typeof a.axisThreshold=="object"?a.axisThreshold[ln(e)]:a.axisThreshold;n.axis=Er(n._movement,s)}n._blocked=(a.lockDirection||!!a.axis)&&!n.axis||!!a.axis&&a.axis!==n.axis}restrictToAxis(e){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":e[1]=0;break;case"y":e[0]=0;break}}}const xr=t=>t,ot=.15,dn={enabled(t=!0){return t},eventOptions(t,e,n){return D(D({},n.shared.eventOptions),t)},preventDefault(t=!1){return t},triggerAllEvents(t=!1){return t},rubberband(t=0){switch(t){case!0:return[ot,ot];case!1:return[0,0];default:return A.toVector(t)}},from(t){if(typeof t=="function")return t;if(t!=null)return A.toVector(t)},transform(t,e,n){const a=t||n.shared.transform;return this.hasCustomTransform=!!a,a||xr},threshold(t){return A.toVector(t,0)}},Cr=0,P=D(D({},dn),{},{axis(t,e,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(t=Cr){return t},bounds(t={}){if(typeof t=="function")return r=>P.bounds(t(r));if("current"in t)return()=>t.current;if(typeof HTMLElement=="function"&&t instanceof HTMLElement)return t;const{left:e=-1/0,right:n=1/0,top:a=-1/0,bottom:s=1/0}=t;return[[e,n],[a,s]]}}),lt={ArrowRight:(t,e=1)=>[t*e,0],ArrowLeft:(t,e=1)=>[-1*t*e,0],ArrowUp:(t,e=1)=>[0,-1*t*e],ArrowDown:(t,e=1)=>[0,t*e]};class Fr extends V{constructor(...e){super(...e),T(this,"ingKey","dragging")}reset(){super.reset();const e=this.state;e._pointerId=void 0,e._pointerActive=!1,e._keyboardActive=!1,e._preventScroll=!1,e._delayed=!1,e.swipe=[0,0],e.tap=!1,e.canceled=!1,e.cancel=this.cancel.bind(this)}setup(){const e=this.state;if(e._bounds instanceof HTMLElement){const n=e._bounds.getBoundingClientRect(),a=e.currentTarget.getBoundingClientRect(),s={left:n.left-a.left+e.offset[0],right:n.right-a.right+e.offset[0],top:n.top-a.top+e.offset[1],bottom:n.bottom-a.bottom+e.offset[1]};e._bounds=P.bounds(s)}}cancel(){const e=this.state;e.canceled||(e.canceled=!0,e._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(e){const n=this.config,a=this.state;if(e.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(e.buttons):n.pointerButtons!==-1&&n.pointerButtons!==e.buttons))return;const s=this.ctrl.setEventIds(e);n.pointerCapture&&e.target.setPointerCapture(e.pointerId),!(s&&s.size>1&&a._pointerActive)&&(this.start(e),this.setupPointer(e),a._pointerId=ue(e),a._pointerActive=!0,this.computeValues(Y(e)),this.computeInitial(),n.preventScrollAxis&&ln(e)!=="mouse"?(a._active=!1,this.setupScrollPrevention(e)):n.delay>0?(this.setupDelayTrigger(e),n.triggerAllEvents&&(this.compute(e),this.emit())):this.startPointerDrag(e))}startPointerDrag(e){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(e),this.emit()}pointerMove(e){const n=this.state,a=this.config;if(!n._pointerActive)return;const s=ue(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;const r=Y(e);if(document.pointerLockElement===e.target?n._delta=[e.movementX,e.movementY]:(n._delta=A.sub(r,n._values),this.computeValues(r)),A.addTo(n._movement,n._delta),this.compute(e),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(e);return}if(a.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===a.preventScrollAxis||a.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(e);return}else return;this.emit()}pointerUp(e){this.ctrl.setEventIds(e);try{this.config.pointerCapture&&e.target.hasPointerCapture(e.pointerId)&&e.target.releasePointerCapture(e.pointerId)}catch{}const n=this.state,a=this.config;if(!n._active||!n._pointerActive)return;const s=ue(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(e);const[r,o]=n._distance;if(n.tap=r<=a.tapsThreshold&&o<=a.tapsThreshold,n.tap&&a.filterTaps)n._force=!0;else{const[i,l]=n._delta,[c,u]=n._movement,[d,m]=a.swipe.velocity,[f,p]=a.swipe.distance,b=a.swipe.duration;if(n.elapsedTime<b){const v=Math.abs(i/n.timeDelta),x=Math.abs(l/n.timeDelta);v>d&&Math.abs(c)>f&&(n.swipe[0]=Math.sign(i)),x>m&&Math.abs(u)>p&&(n.swipe[1]=Math.sign(l))}}this.emit()}pointerClick(e){!this.state.tap&&e.detail>0&&(e.preventDefault(),e.stopPropagation())}setupPointer(e){const n=this.config,a=n.device;n.pointerLock&&e.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,a,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(e){this.state._preventScroll&&e.cancelable&&e.preventDefault()}setupScrollPrevention(e){this.state._preventScroll=!1,Ar(e);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,e)}setupDelayTrigger(e){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(e)},this.config.delay)}keyDown(e){const n=lt[e.key];if(n){const a=this.state,s=e.shiftKey?10:e.altKey?.1:1;this.start(e),a._delta=n(this.config.keyboardDisplacement,s),a._keyboardActive=!0,A.addTo(a._movement,a._delta),this.compute(e),this.emit()}}keyUp(e){e.key in lt&&(this.state._keyboardActive=!1,this.setActive(),this.compute(e),this.emit())}bind(e){const n=this.config.device;e(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(e(n,"change",this.pointerMove.bind(this)),e(n,"end",this.pointerUp.bind(this)),e(n,"cancel",this.pointerUp.bind(this)),e("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(e("key","down",this.keyDown.bind(this)),e("key","up",this.keyUp.bind(this))),this.config.filterTaps&&e("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function Ar(t){"persist"in t&&typeof t.persist=="function"&&t.persist()}const X=typeof window<"u"&&window.document&&window.document.createElement;function fn(){return X&&"ontouchstart"in window}function Dr(){return fn()||X&&window.navigator.maxTouchPoints>1}function Tr(){return X&&"onpointerdown"in window}function Ir(){return X&&"exitPointerLock"in window.document}function Sr(){try{return"constructor"in GestureEvent}catch{return!1}}const B={isBrowser:X,gesture:Sr(),touch:fn(),touchscreen:Dr(),pointer:Tr(),pointerLock:Ir()},kr=250,_r=180,Br=.5,Mr=50,wr=250,jr=10,ut={mouse:0,touch:0,pen:8},Or=D(D({},P),{},{device(t,e,{pointer:{touch:n=!1,lock:a=!1,mouse:s=!1}={}}){return this.pointerLock=a&&B.pointerLock,B.touch&&n?"touch":this.pointerLock?"mouse":B.pointer&&!s?"pointer":B.touch?"touch":"mouse"},preventScrollAxis(t,e,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&t?kr:void 0,!(!B.touchscreen||n===!1))return t||(n!==void 0?"y":void 0)},pointerCapture(t,e,{pointer:{capture:n=!0,buttons:a=1,keys:s=!0}={}}){return this.pointerButtons=a,this.keys=s,!this.pointerLock&&this.device==="pointer"&&n},threshold(t,e,{filterTaps:n=!1,tapsThreshold:a=3,axis:s=void 0}){const r=A.toVector(t,n?a:s?1:0);return this.filterTaps=n,this.tapsThreshold=a,r},swipe({velocity:t=Br,distance:e=Mr,duration:n=wr}={}){return{velocity:this.transform(A.toVector(t)),distance:this.transform(A.toVector(e)),duration:n}},delay(t=0){switch(t){case!0:return _r;case!1:return 0;default:return t}},axisThreshold(t){return t?D(D({},ut),t):ut},keyboardDisplacement(t=jr){return t}});function hn(t){const[e,n]=t.overflow,[a,s]=t._delta,[r,o]=t._direction;(e<0&&a>0&&r<0||e>0&&a<0&&r>0)&&(t._movement[0]=t._movementBound[0]),(n<0&&s>0&&o<0||n>0&&s<0&&o>0)&&(t._movement[1]=t._movementBound[1])}const Lr=30,Pr=100;class Rr extends mn{constructor(...e){super(...e),T(this,"ingKey","pinching"),T(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const e=this.state;e._touchIds=[],e.canceled=!1,e.cancel=this.cancel.bind(this),e.turns=0}computeOffset(){const{type:e,movement:n,lastOffset:a}=this.state;e==="wheel"?this.state.offset=A.add(n,a):this.state.offset=[(1+n[0])*a[0],n[1]+a[1]]}computeMovement(){const{offset:e,lastOffset:n}=this.state;this.state.movement=[e[0]/n[0],e[1]-n[1]]}axisIntent(){const e=this.state,[n,a]=e._movement;if(!e.axis){const s=Math.abs(n)*Lr-Math.abs(a);s<0?e.axis="angle":s>0&&(e.axis="scale")}}restrictToAxis(e){this.config.lockDirection&&(this.state.axis==="scale"?e[1]=0:this.state.axis==="angle"&&(e[0]=0))}cancel(){const e=this.state;e.canceled||setTimeout(()=>{e.canceled=!0,e._active=!1,this.compute(),this.emit()},0)}touchStart(e){this.ctrl.setEventIds(e);const n=this.state,a=this.ctrl.touchIds;if(n._active&&n._touchIds.every(r=>a.has(r))||a.size<2)return;this.start(e),n._touchIds=Array.from(a).slice(0,2);const s=at(e,n._touchIds);s&&this.pinchStart(e,s)}pointerStart(e){if(e.buttons!=null&&e.buttons%2!==1)return;this.ctrl.setEventIds(e),e.target.setPointerCapture(e.pointerId);const n=this.state,a=n._pointerEvents,s=this.ctrl.pointerIds;if(n._active&&Array.from(a.keys()).every(o=>s.has(o))||(a.size<2&&a.set(e.pointerId,e),n._pointerEvents.size<2))return;this.start(e);const r=Ee(...Array.from(a.values()));r&&this.pinchStart(e,r)}pinchStart(e,n){const a=this.state;a.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(e),this.emit()}touchMove(e){if(!this.state._active)return;const n=at(e,this.state._touchIds);n&&this.pinchMove(e,n)}pointerMove(e){const n=this.state._pointerEvents;if(n.has(e.pointerId)&&n.set(e.pointerId,e),!this.state._active)return;const a=Ee(...Array.from(n.values()));a&&this.pinchMove(e,a)}pinchMove(e,n){const a=this.state,s=a._values[1],r=n.angle-s;let o=0;Math.abs(r)>270&&(o+=Math.sign(r)),this.computeValues([n.distance,n.angle-360*o]),a.origin=n.origin,a.turns=o,a._movement=[a._values[0]/a._initial[0]-1,a._values[1]-a._initial[1]],this.compute(e),this.emit()}touchEnd(e){this.ctrl.setEventIds(e),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(e),this.emit())}pointerEnd(e){const n=this.state;this.ctrl.setEventIds(e);try{e.target.releasePointerCapture(e.pointerId)}catch{}n._pointerEvents.has(e.pointerId)&&n._pointerEvents.delete(e.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(e),this.emit())}gestureStart(e){e.cancelable&&e.preventDefault();const n=this.state;n._active||(this.start(e),this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY],this.compute(e),this.emit())}gestureMove(e){if(e.cancelable&&e.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY];const a=n._movement;n._movement=[e.scale-1,e.rotation],n._delta=A.sub(n._movement,a),this.compute(e),this.emit()}gestureEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}wheel(e){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(a=>e[a]):!e[n])||(this.state._active?this.wheelChange(e):this.wheelStart(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(e){this.start(e),this.wheelChange(e)}wheelChange(e){"uv"in e||e.cancelable&&e.preventDefault();const a=this.state;a._delta=[-cn(e)[1]/Pr*a.offset[0],0],A.addTo(a._movement,a._delta),hn(a),this.state.origin=[e.clientX,e.clientY],this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){const n=this.config.device;n&&(e(n,"start",this[n+"Start"].bind(this)),e(n,"change",this[n+"Move"].bind(this)),e(n,"end",this[n+"End"].bind(this)),e(n,"cancel",this[n+"End"].bind(this)),e("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&e("wheel","",this.wheel.bind(this),{passive:!1})}}const $r=D(D({},dn),{},{device(t,e,{shared:n,pointer:{touch:a=!1}={}}){if(n.target&&!B.touch&&B.gesture)return"gesture";if(B.touch&&a)return"touch";if(B.touchscreen){if(B.pointer)return"pointer";if(B.touch)return"touch"}},bounds(t,e,{scaleBounds:n={},angleBounds:a={}}){const s=o=>{const i=rt(ee(n,o),{min:-1/0,max:1/0});return[i.min,i.max]},r=o=>{const i=rt(ee(a,o),{min:-1/0,max:1/0});return[i.min,i.max]};return typeof n!="function"&&typeof a!="function"?[s(),r()]:o=>[s(o),r(o)]},threshold(t,e,n){return this.lockDirection=n.axis==="lock",A.toVector(t,this.lockDirection?[.1,3]:0)},modifierKey(t){return t===void 0?"ctrlKey":t},pinchOnWheel(t=!0){return t}});class Nr extends V{constructor(...e){super(...e),T(this,"ingKey","moving")}move(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.state._active?this.moveChange(e):this.moveStart(e),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(e){this.start(e),this.computeValues(Y(e)),this.compute(e),this.computeInitial(),this.emit()}moveChange(e){if(!this.state._active)return;const n=Y(e),a=this.state;a._delta=A.sub(n,a._values),A.addTo(a._movement,a._delta),this.computeValues(n),this.compute(e),this.emit()}moveEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}bind(e){e("pointer","change",this.move.bind(this)),e("pointer","leave",this.moveEnd.bind(this))}}const Yr=D(D({},P),{},{mouseOnly:(t=!0)=>t});class Gr extends V{constructor(...e){super(...e),T(this,"ingKey","scrolling")}scroll(e){this.state._active||this.start(e),this.scrollChange(e),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(e){e.cancelable&&e.preventDefault();const n=this.state,a=pr(e);n._delta=A.sub(a,n._values),A.addTo(n._movement,n._delta),this.computeValues(a),this.compute(e),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("scroll","",this.scroll.bind(this))}}const zr=P;class Ur extends V{constructor(...e){super(...e),T(this,"ingKey","wheeling")}wheel(e){this.state._active||this.start(e),this.wheelChange(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(e){const n=this.state;n._delta=cn(e),A.addTo(n._movement,n._delta),hn(n),this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("wheel","",this.wheel.bind(this))}}const Hr=P;class Vr extends V{constructor(...e){super(...e),T(this,"ingKey","hovering")}enter(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.start(e),this.computeValues(Y(e)),this.compute(e),this.emit())}leave(e){if(this.config.mouseOnly&&e.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const a=Y(e);n._movement=n._delta=A.sub(a,n._values),this.computeValues(a),this.compute(e),n.delta=n.movement,this.emit()}bind(e){e("pointer","enter",this.enter.bind(this)),e("pointer","leave",this.leave.bind(this))}}const Xr=D(D({},P),{},{mouseOnly:(t=!0)=>t}),Be=new Map,xe=new Map;function qr(t){Be.set(t.key,t.engine),xe.set(t.key,t.resolver)}const Wr={key:"drag",engine:Fr,resolver:Or},Kr={key:"hover",engine:Vr,resolver:Xr},Zr={key:"move",engine:Nr,resolver:Yr},Jr={key:"pinch",engine:Rr,resolver:$r},Qr={key:"scroll",engine:Gr,resolver:zr},eo={key:"wheel",engine:Ur,resolver:Hr};function to(t,e){if(t==null)return{};var n={},a=Object.keys(t),s,r;for(r=0;r<a.length;r++)s=a[r],!(e.indexOf(s)>=0)&&(n[s]=t[s]);return n}function no(t,e){if(t==null)return{};var n=to(t,e),a,s;if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(s=0;s<r.length;s++)a=r[s],!(e.indexOf(a)>=0)&&Object.prototype.propertyIsEnumerable.call(t,a)&&(n[a]=t[a])}return n}const ao={target(t){if(t)return()=>"current"in t?t.current:t},enabled(t=!0){return t},window(t=B.isBrowser?window:void 0){return t},eventOptions({passive:t=!0,capture:e=!1}={}){return{passive:t,capture:e}},transform(t){return t}},so=["target","eventOptions","window","enabled","transform"];function Q(t={},e){const n={};for(const[a,s]of Object.entries(e))switch(typeof s){case"function":n[a]=s.call(n,t[a],a,t);break;case"object":n[a]=Q(t[a],s);break;case"boolean":s&&(n[a]=t[a]);break}return n}function io(t,e,n={}){const a=t,{target:s,eventOptions:r,window:o,enabled:i,transform:l}=a,c=no(a,so);if(n.shared=Q({target:s,eventOptions:r,window:o,enabled:i,transform:l},ao),e){const u=xe.get(e);n[e]=Q(D({shared:n.shared},c),u)}else for(const u in c){const d=xe.get(u);d&&(n[u]=Q(D({shared:n.shared},c[u]),d))}return n}class pn{constructor(e,n){T(this,"_listeners",new Set),this._ctrl=e,this._gestureKey=n}add(e,n,a,s,r){const o=this._listeners,i=mr(n,a),l=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},c=D(D({},l),r);e.addEventListener(i,s,c);const u=()=>{e.removeEventListener(i,s,c),o.delete(u)};return o.add(u),u}clean(){this._listeners.forEach(e=>e()),this._listeners.clear()}}class ro{constructor(){T(this,"_timeouts",new Map)}add(e,n,a=140,...s){this.remove(e),this._timeouts.set(e,window.setTimeout(n,a,...s))}remove(e){const n=this._timeouts.get(e);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(e=>void window.clearTimeout(e)),this._timeouts.clear()}}class oo{constructor(e){T(this,"gestures",new Set),T(this,"_targetEventStore",new pn(this)),T(this,"gestureEventStores",{}),T(this,"gestureTimeoutStores",{}),T(this,"handlers",{}),T(this,"config",{}),T(this,"pointerIds",new Set),T(this,"touchIds",new Set),T(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),lo(this,e)}setEventIds(e){if(se(e))return this.touchIds=new Set(hr(e)),this.touchIds;if("pointerId"in e)return e.type==="pointerup"||e.type==="pointercancel"?this.pointerIds.delete(e.pointerId):e.type==="pointerdown"&&this.pointerIds.add(e.pointerId),this.pointerIds}applyHandlers(e,n){this.handlers=e,this.nativeHandlers=n}applyConfig(e,n){this.config=io(e,n,this.config)}clean(){this._targetEventStore.clean();for(const e of this.gestures)this.gestureEventStores[e].clean(),this.gestureTimeoutStores[e].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...e){const n=this.config.shared,a={};let s;if(!(n.target&&(s=n.target(),!s))){if(n.enabled){for(const o of this.gestures){const i=this.config[o],l=ct(a,i.eventOptions,!!s);if(i.enabled){const c=Be.get(o);new c(this,e,o).bind(l)}}const r=ct(a,n.eventOptions,!!s);for(const o in this.nativeHandlers)r(o,"",i=>this.nativeHandlers[o](D(D({},this.state.shared),{},{event:i,args:e})),void 0,!0)}for(const r in a)a[r]=yr(...a[r]);if(!s)return a;for(const r in a){const{device:o,capture:i,passive:l}=cr(r);this._targetEventStore.add(s,o,"",a[r],{capture:i,passive:l})}}}}function R(t,e){t.gestures.add(e),t.gestureEventStores[e]=new pn(t,e),t.gestureTimeoutStores[e]=new ro}function lo(t,e){e.drag&&R(t,"drag"),e.wheel&&R(t,"wheel"),e.scroll&&R(t,"scroll"),e.move&&R(t,"move"),e.pinch&&R(t,"pinch"),e.hover&&R(t,"hover")}const ct=(t,e,n)=>(a,s,r,o={},i=!1)=>{var l,c;const u=(l=o.capture)!==null&&l!==void 0?l:e.capture,d=(c=o.passive)!==null&&c!==void 0?c:e.passive;let m=i?a:lr(a,s,u);n&&d&&(m+="Passive"),t[m]=t[m]||[],t[m].push(r)},uo=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function co(t){const e={},n={},a=new Set;for(let s in t)uo.test(s)?(a.add(RegExp.lastMatch),n[s]=t[s]):e[s]=t[s];return[n,e,a]}function $(t,e,n,a,s,r){if(!t.has(n)||!Be.has(a))return;const o=n+"Start",i=n+"End",l=c=>{let u;return c.first&&o in e&&e[o](c),n in e&&(u=e[n](c)),c.last&&i in e&&e[i](c),u};s[a]=l,r[a]=r[a]||{}}function mo(t,e){const[n,a,s]=co(t),r={};return $(s,n,"onDrag","drag",r,e),$(s,n,"onWheel","wheel",r,e),$(s,n,"onScroll","scroll",r,e),$(s,n,"onPinch","pinch",r,e),$(s,n,"onMove","move",r,e),$(s,n,"onHover","hover",r,e),{handlers:r,config:e,nativeHandlers:a}}function fo(t,e={},n,a){const s=z.useMemo(()=>new oo(t),[]);if(s.applyHandlers(t,a),s.applyConfig(e,n),z.useEffect(s.effect.bind(s)),z.useEffect(()=>s.clean.bind(s),[]),e.target===void 0)return s.bind.bind(s)}function ho(t){return t.forEach(qr),function(n,a){const{handlers:s,nativeHandlers:r,config:o}=mo(n,a||{});return fo(s,o,void 0,r)}}function po(t,e){return ho([Wr,Jr,Qr,eo,Zr,Kr])(t,e||{})}function go(t){H("translateViewport",t)}function vo(t){ae("translateViewport",t)}function yo({children:t}){const e=y.useRef(null),[n,a]=y.useState(1),[s,r]=y.useState({x:0,y:0}),[o,i]=y.useState(!1);return po({onPinch({origin:l,delta:c,pinching:u}){var b;i(u);const d=Math.max(n+c[0],.1),m=(b=e.current)==null?void 0:b.getBoundingClientRect(),f=l[0]-((m==null?void 0:m.left)??0),p=l[1]-((m==null?void 0:m.top)??0);r({x:s.x-(f/n-f/d),y:s.y-(p/n-p/d)}),a(d)},onWheel({event:l,delta:[c,u],wheeling:d}){l.preventDefault(),i(d),r({x:s.x-c/n,y:s.y-u/n})}},{target:e,eventOptions:{passive:!1}}),vo(l=>{const c=window.innerWidth,u=window.innerHeight,d=c/2-l.x*n,m=u/2-l.y*n;r({x:d/n,y:m/n})}),h.jsx(bo,{children:h.jsx(Eo,{ref:e,children:h.jsx(xo,{style:{"--zoom":n,"--translate-x":s.x,"--translate-y":s.y},"data-is-interacting":o,children:t})})})}const bo=C.div`
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
`,xo=C.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function gn(t){return Object.fromEntries(t.states.map(e=>[e.id,e.population]))}function vn({worldState:t,setWorldState:e}){const n=t.states.find(i=>i.isPlayerControlled);if(!n)return null;const a=(i,l)=>{const c=t.states.map(u=>u.id===n.id?{...u,strategies:{...u.strategies,[i]:l}}:u);e({...t,states:c})},s=i=>{if(i===n.id)return"#4CAF50";switch(n.strategies[i]){case E.FRIENDLY:return"#4CAF50";case E.NEUTRAL:return"#FFC107";case E.HOSTILE:return"#F44336";default:return"#9E9E9E"}},r=gn(t),o=i=>{const l=t.cities.filter(f=>f.stateId===i),c=t.launchSites.filter(f=>f.stateId===i);if(l.length===0&&c.length===0){console.warn("No position information available for this state");return}const u=[...l.map(f=>f.position),...c.map(f=>f.position)],d=u.reduce((f,p)=>({x:f.x+p.x,y:f.y+p.y}),{x:0,y:0}),m={x:d.x/u.length,y:d.y/u.length};go(m)};return h.jsx(Co,{children:t.states.map(i=>h.jsxs(Fo,{relationshipColor:s(i.id),onClick:()=>o(i.id),children:[h.jsx(Ao,{style:{color:i.color},children:i.name.charAt(0)}),h.jsxs(Do,{children:[h.jsx(To,{children:i.name}),h.jsx(Io,{children:r[i.id]<<0}),i.id!==n.id?h.jsx("select",{value:n.strategies[i.id],onClick:l=>l.stopPropagation(),onChange:l=>a(i.id,l.target.value),children:Object.values(E).map(l=>h.jsx("option",{value:l,children:l},l))}):"This is you"]})]},i.id))})}const Co=C.div`
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
`,Fo=C.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 5px;
  background: ${t=>`rgba(${parseInt(t.relationshipColor.slice(1,3),16)}, ${parseInt(t.relationshipColor.slice(3,5),16)}, ${parseInt(t.relationshipColor.slice(5,7),16)}, 0.2)`};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,Ao=C.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,Do=C.div`
  display: flex;
  flex-direction: column;
`,To=C.span`
  font-weight: bold;
  margin-bottom: 5px;
`,Io=C.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`;function So({worldState:t,setWorldState:e}){return h.jsx(Ti,{children:h.jsxs(Fi,{children:[h.jsx(yo,{children:h.jsx(er,{state:t})}),h.jsx(vn,{worldState:t,setWorldState:e})]})})}const yn="fullScreenMessage",bn="fullScreenMessageAction";function w(t,e,n,a="",s,r,o){H(yn,{message:t,startTimestamp:e,endTimestamp:n,messageId:a,actions:s,prompt:r,fullScreen:o??!!(s!=null&&s.length)})}function En(t,e){H(bn,{messageId:t,actionId:e})}function xn(t){ae(yn,e=>{t(e)})}function Me(t){ae(bn,e=>{t(e)})}function ko({worldState:t,onGameOver:e}){const[n,a]=y.useState(null),[s,r]=y.useState(!1);return y.useEffect(()=>{var f;if(s)return;const o=gn(t),i=Object.values(o).filter(p=>p>0).length,l=t.launchSites.length===0,c=t.timestamp,u=t.states.filter(p=>o[p.id]>0&&Object.entries(p.strategies).filter(([b,v])=>o[b]>0&&v===E.HOSTILE).length>0),d=t.launchSites.some(p=>p.lastLaunchTimestamp&&c-p.lastLaunchTimestamp<ie),m=ie-c;if(!u.length&&!d&&m>0&&m<=10&&(n?w(`Game will end in ${Math.ceil(m)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):a(c)),i<=1||l||!u.length&&!d&&c>ie){const p=i===1?(f=t.states.find(b=>o[b.id]>0))==null?void 0:f.id:void 0;r(!0),w(["Game Over!","Results will be shown shortly..."],c,c+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{e({populations:o,winner:p,stateNames:Object.fromEntries(t.states.map(b=>[b.id,b.name])),playerStateId:t.states.find(b=>b.isPlayerControlled).id})},5e3)}},[t,e,n,s]),null}const _o="/assets/player-lost-background-D2A_VJ6-.png",Bo="/assets/player-won-background-CkXgF24i.png",mt="/assets/draw-background-EwLQ9g28.png",Mo=C.div`
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
`,wo=({setGameState:t})=>{const{state:{result:e}}=ft(),n=()=>{t(te,{stateName:e.stateNames[e.playerStateId]})};let a,s;return e.winner?e.winner===e.playerStateId?(a=Bo,s=`Congratulations! ${e.stateNames[e.playerStateId]} has won with ${e.populations[e.playerStateId]<<0} population alive.`):e.winner!==void 0?(a=_o,s=`${e.stateNames[e.winner]} has won with ${e.populations[e.winner]<<0} population alive. Your state has fallen.`):(a=mt,s="The game has ended in an unexpected state."):(a=mt,s="It's a draw! The world is partially destroyed, but there's still hope."),h.jsx(Mo,{backgroundImage:a,children:h.jsxs("div",{children:[h.jsx("h2",{children:"Game Over"}),h.jsx("p",{children:s}),h.jsx("button",{onClick:n,children:"Play Again"}),h.jsx("br",{}),h.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Ce={Component:wo,path:"played"};function jo({worldState:t}){var c;const[e,n]=y.useState([]),[a,s]=y.useState(null);xn(u=>{n(d=>u.messageId&&d.find(m=>m.messageId===u.messageId)?[...d.map(m=>m.messageId===u.messageId?u:m)]:[u,...d])});const r=e.sort((u,d)=>u.actions&&!d.actions?-1:!u.actions&&d.actions?1:u.startTimestamp-d.startTimestamp);if(Me(u=>{n(d=>d.filter(m=>m.messageId!==u.messageId))}),y.useEffect(()=>{const u=r.find(d=>d.fullScreen&&d.startTimestamp<=t.timestamp&&d.endTimestamp>t.timestamp);s(u||null)},[r,t.timestamp]),!a)return null;const i=((u,d)=>d<u.startTimestamp?"pre":d<u.startTimestamp+.5?"pre-in":d>u.endTimestamp-.5?"post-in":d>u.endTimestamp?"post":"active")(a,t.timestamp),l=u=>Array.isArray(u)?u.map((d,m)=>h.jsx("div",{children:d},m)):u;return h.jsxs(Po,{"data-message-state":i,"data-action":(((c=a.actions)==null?void 0:c.length)??0)>0,children:[h.jsx(Ro,{children:l(a.message)}),a.prompt&&a.actions&&h.jsx($o,{children:a.actions.map((u,d)=>h.jsx(No,{onClick:()=>En(a.messageId,u.id),children:u.text},d))})]})}const Oo=ne`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`,Lo=ne`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: scale(0.9);
  }
`,Po=C.div`
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
    animation: ${Oo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${Lo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,Ro=C.div`
  font-size: 2rem;
  color: white;
  text-align: center;
  max-width: 80%;
  white-space: pre-line;
`,$o=C.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,No=C.button`
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
`,Cn="ALLIANCEPROPOSAL";function Yo(t,e,n,a=!1){const s=`${Cn}_${t.id}_${e.id}`,r=a?`${t.name} has become friendly towards you. Do you want to form an alliance?`:`${t.name} proposes an alliance with ${e.name}. Do you accept?`,o=n.timestamp,i=o+10;w(r,o,i,s,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function Go({worldState:t,setWorldState:e}){return Me(n=>{if(n.messageId.startsWith(Cn)){const[,a,s]=n.messageId.split("_"),r=t.states.find(i=>i.id===a),o=t.states.find(i=>i.id===s);if(!r||!(o!=null&&o.isPlayerControlled))return;if(n.actionId==="accept"){const i=t.states.map(l=>l.id===a||l.id===s?{...l,strategies:{...l.strategies,[a]:E.FRIENDLY,[s]:E.FRIENDLY}}:l);e({...t,states:i}),w(`Alliance formed between ${r.name} and ${o.name}!`,t.timestamp,t.timestamp+5)}else n.actionId==="reject"&&w(`${o.name} has rejected the alliance proposal from ${r.name}.`,t.timestamp,t.timestamp+5)}}),null}function zo({worldState:t}){const e=t.states.find(f=>f.isPlayerControlled),[n,a]=y.useState(!1),[s,r]=y.useState({}),[o,i]=y.useState([]),[l,c]=y.useState([]),[u,d]=y.useState(!1),m=Math.round(t.timestamp*10)/10;return y.useEffect(()=>{!n&&t.timestamp>0&&(a(!0),w("The game has started!",t.timestamp,t.timestamp+3))},[m]),y.useEffect(()=>{var f,p,b,v;if(e){const x=Object.fromEntries(t.states.map(g=>[g.id,g.strategies]));for(const g of t.states)for(const F of t.states.filter(G=>G.id!==g.id))e&&F.id===e.id&&g.strategies[F.id]===E.FRIENDLY&&F.strategies[g.id]!==E.FRIENDLY&&((f=s[g.id])==null?void 0:f[F.id])!==E.FRIENDLY&&Yo(g,e,t,!0),F.strategies[g.id]===E.FRIENDLY&&g.strategies[F.id]===E.FRIENDLY&&(((p=s[F.id])==null?void 0:p[g.id])!==E.FRIENDLY||((b=s[g.id])==null?void 0:b[F.id])!==E.FRIENDLY)&&w(`${F.name} has formed alliance with ${g.isPlayerControlled?"you":g.name}!`,m,m+3),g.strategies[F.id]===E.HOSTILE&&((v=s[g.id])==null?void 0:v[F.id])!==E.HOSTILE&&w(F.isPlayerControlled?`${g.name} has declared war on You!`:`${g.isPlayerControlled?"You have":g.name} declared war on ${F.name}!`,m,m+3,void 0,void 0,void 0,g.isPlayerControlled||F.isPlayerControlled);r(x)}},[m]),y.useEffect(()=>{e&&t.cities.forEach(f=>{const p=o.find(g=>g.id===f.id);if(!p)return;const b=f.population||0,v=p.population,x=Math.floor(v-b);x>0&&(f.stateId===e.id&&w(b===0?`Your city ${f.name} has been destroyed!`:[`Your city ${f.name} has been hit!`,`${x} casualties reported.`],m,m+3,void 0,void 0,!1,!0),H("cityDamage"))}),i(t.cities.map(f=>({...f})))},[m]),y.useEffect(()=>{if(e){const f=t.launchSites.filter(p=>p.stateId===e.id);l.length>0&&l.filter(b=>!f.some(v=>v.id===b.id)).forEach(()=>{w("One of your launch sites has been destroyed!",m,m+3,void 0,void 0,!1,!0)}),c(f)}},[m]),y.useEffect(()=>{if(e&&!u){const f=t.cities.filter(v=>v.stateId===e.id),p=t.launchSites.filter(v=>v.stateId===e.id);!f.some(v=>v.population>0)&&p.length===0&&(w(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],m,m+5,void 0,void 0,!1,!0),d(!0))}},[m]),null}function Uo({worldState:t}){const[e,n]=y.useState([]);xn(o=>{n(i=>o.messageId&&i.find(l=>l.messageId===o.messageId)?[...i.map(l=>l.messageId===o.messageId?o:l)]:[o,...i])}),Me(o=>{n(i=>i.filter(l=>l.messageId!==o.messageId))});const a=o=>Array.isArray(o)?o.map((i,l)=>h.jsx("div",{children:i},l)):o,s=(o,i)=>{const u=i-o;return u>60?0:u>50?1-(u-50)/10:1},r=y.useMemo(()=>{const o=t.timestamp,i=60;return e.filter(l=>{const c=l.startTimestamp||0;return o-c<=i}).map(l=>({...l,opacity:s(l.startTimestamp||0,o)}))},[e,t.timestamp]);return h.jsx(Ho,{children:r.map((o,i)=>h.jsxs(Vo,{style:{opacity:o.opacity},children:[h.jsx("div",{children:a(o.message)}),o.prompt&&o.actions&&h.jsx(Xo,{children:o.actions.map((l,c)=>h.jsx(qo,{onClick:()=>En(o.messageId,l.id),children:l.text},c))})]},i))})}const Ho=C.div`
  position: fixed;
  right: 0;
  max-height: 100%;
  bottom: 0;
  width: 300px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  overflow-y: auto;
  padding: 10px;
  font-size: 14px;
  display: flex;
  flex-direction: column-reverse;
`,Vo=C.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,Xo=C.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,qo=C.button`
  font-size: 12px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function Wo({updateWorldTime:t,currentWorldTime:e}){const[n,a]=y.useState(!1),s=y.useRef(null);rn(o=>{if(!s.current){s.current=o;return}const i=o-s.current;s.current=o,!(i<=0)&&n&&t(i/1e3)},!0);const r=o=>{const i=Math.floor(o/86400),l=Math.floor(o%86400/3600),c=Math.floor(o%3600/60),u=Math.floor(o%60);return[[i,"d"],[l,"h"],[c,"m"],[u,"s"]].filter(([d])=>!!d).map(([d,m])=>String(d)+m).join(" ")};return h.jsx(Ko,{children:h.jsxs(Zo,{children:[h.jsxs(Jo,{children:[e>0?"Current Time: ":"Game not started yet",r(e)]}),h.jsx(K,{onClick:()=>t(1),children:"+1s"}),h.jsx(K,{onClick:()=>t(10),children:"+10s"}),h.jsx(K,{onClick:()=>t(60),children:"+1m"}),h.jsx(K,{onClick:()=>a(!n),children:n?"Stop":"Start"})]})})}const Ko=C.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,Zo=C.div`
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
`,Jo=C.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`,Qo=({setGameState:t})=>{const{state:{stateName:e}}=ft(),{worldState:n,setWorldState:a,updateWorldState:s}=Ei(e);return h.jsxs(h.Fragment,{children:[h.jsx(So,{worldState:n,setWorldState:a}),h.jsx(Wo,{updateWorldTime:r=>s(n,r),currentWorldTime:n.timestamp??0}),h.jsx(vn,{worldState:n,setWorldState:a}),h.jsx(jo,{worldState:n}),h.jsx(Uo,{worldState:n}),h.jsx(ko,{worldState:n,onGameOver:r=>t(Ce,{result:r})}),h.jsx(zo,{worldState:n}),h.jsx(Go,{worldState:n,setWorldState:a})]})},te={Component:Qo,path:"playing"},el="/assets/play-background-BASXrsIB.png",tl=C.div`
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
    background-image: url(${el});
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
`,nl=({setGameState:t})=>{const[e,n]=y.useState(tn(1)[0]),a=()=>{t(te,{stateName:e})};return h.jsx(tl,{children:h.jsxs("div",{children:[h.jsx("h1",{children:"Name your state:"}),h.jsx("input",{type:"text",placeholder:"Type your state name here",value:e,onChange:s=>n(s.currentTarget.value)}),h.jsx("br",{}),h.jsx("button",{onClick:a,disabled:!e,children:"Start game"}),h.jsx("br",{}),h.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Fe={Component:nl,path:"play"},al="/assets/intro-background-D_km5uka.png",sl="/assets/nukes-game-title-vcFxx9vI.png",il=ne`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,rl=ne`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,ol=C.div`
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
    animation: ${il} 60s ease-in-out infinite;
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
`,ll=C.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${t=>t.isFlashing?1:0};
  animation: ${t=>t.isFlashing?rl:"none"} 4.5s forwards;
`,ul=C.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,cl=C.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,ml=({setGameState:t})=>{const[e,n]=y.useState(!0);return y.useEffect(()=>{const a=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(a)},[]),h.jsxs(ol,{children:[h.jsx(ll,{isFlashing:e}),!e&&h.jsxs(ul,{children:[h.jsx(cl,{src:sl,alt:"Nukes game"}),h.jsx("button",{onClick:()=>t(Fe),children:"Play"})]})]})},dt={Component:ml,path:""},dl=Sn`
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
`,fl=[{path:dt.path,element:h.jsx(Z,{state:dt})},{path:Fe.path,element:h.jsx(Z,{state:Fe})},{path:te.path,element:h.jsx(Z,{state:te})},{path:Ce.path,element:h.jsx(Z,{state:Ce})}];function gl(){var n;const[t]=Tn(),e=t.get("path")??"";return h.jsx(h.Fragment,{children:(n=fl.find(a=>a.path===e))==null?void 0:n.element})}function Z({state:t}){const e=In();return h.jsxs(h.Fragment,{children:[h.jsx(dl,{}),h.jsx(t.Component,{setGameState:(n,a)=>e({search:"path="+n.path},{state:a})})]})}export{gl as NukesApp,fl as routes};
