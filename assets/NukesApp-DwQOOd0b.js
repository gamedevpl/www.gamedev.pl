import{c as B,g as In,r as v,j as h,R as G,u as pt,a as Sn,b as kn}from"./index-Ds8X12tq.js";import{d as x,m as te,f as _n}from"./styled-components.browser.esm-zdro0n24.js";var y=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(y||{}),gt=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(gt||{}),M=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(M||{}),k=(t=>(t.ATTACK="ATTACK",t.DEFENCE="DEFENCE",t))(k||{});const vt=20,Z=vt*1.5,ce=5,j=20,Bn=1,Mn=5,wn=j/Mn,jn=.5,On=500,V=.05,me=5,Ln=4,ie=60,I=16,O=I*5,yt=1e3,Ae=O*4;function Pn(t,e,n){const a=[],s=Array(n).fill(null).map(()=>Array(e).fill(!1));for(let o=0;o<n;o++)for(let r=0;r<e;r++){const i=o*e+r;t[i].type===M.WATER&&Rn(r,o,e,n,t)&&(a.push([r,o,0]),s[o][r]=!0)}for(;a.length>0;){const[o,r,i]=a.shift(),l=r*e+o;t[l].type===M.WATER?t[l].depth=i+(Math.random()-Math.random())/5:t[l].type===M.GROUND&&(t[l].height=Math.sqrt(i)+(Math.random()-Math.random())/10);const c=[[-1,0],[1,0],[0,-1],[0,1]];for(const[u,d]of c){const m=o+u,f=r+d;bt(m,f,e,n)&&!s[f][m]&&(a.push([m,f,i+1]),s[f][m]=!0)}}}function Rn(t,e,n,a,s){return[[-1,0],[1,0],[0,-1],[0,1]].some(([r,i])=>{const l=t+r,c=e+i;if(bt(l,c,n,a)){const u=c*n+l;return s[u].type===M.GROUND}return!1})}function bt(t,e,n,a){return t>=0&&t<n&&e>=0&&e<a}var Et={exports:{}},$n=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(t){var e=$n,n=e.filter(function(s){return!!s.css}),a=e.filter(function(s){return!!s.vga});t.exports=function(s){var o=t.exports.get(s);return o&&o.value},t.exports.get=function(s){return s=s||"",s=s.trim().toLowerCase(),e.filter(function(o){return o.name.toLowerCase()===s}).pop()},t.exports.all=t.exports.get.all=function(){return e},t.exports.get.css=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),n.filter(function(o){return o.name.toLowerCase()===s}).pop()):n},t.exports.get.vga=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),a.filter(function(o){return o.name.toLowerCase()===s}).pop()):a}})(Et);var Nn=Et.exports,Yn=1/0,Gn="[object Symbol]",zn=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,xt="\\ud800-\\udfff",Un="\\u0300-\\u036f\\ufe20-\\ufe23",Hn="\\u20d0-\\u20f0",Ct="\\u2700-\\u27bf",Ft="a-z\\xdf-\\xf6\\xf8-\\xff",Xn="\\xac\\xb1\\xd7\\xf7",Vn="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",qn="\\u2000-\\u206f",Wn=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",At="A-Z\\xc0-\\xd6\\xd8-\\xde",Kn="\\ufe0e\\ufe0f",Dt=Xn+Vn+qn+Wn,Tt="['’]",we="["+Dt+"]",Zn="["+Un+Hn+"]",It="\\d+",Jn="["+Ct+"]",St="["+Ft+"]",kt="[^"+xt+Dt+It+Ct+Ft+At+"]",Qn="\\ud83c[\\udffb-\\udfff]",ea="(?:"+Zn+"|"+Qn+")",ta="[^"+xt+"]",_t="(?:\\ud83c[\\udde6-\\uddff]){2}",Bt="[\\ud800-\\udbff][\\udc00-\\udfff]",N="["+At+"]",na="\\u200d",je="(?:"+St+"|"+kt+")",aa="(?:"+N+"|"+kt+")",Oe="(?:"+Tt+"(?:d|ll|m|re|s|t|ve))?",Le="(?:"+Tt+"(?:D|LL|M|RE|S|T|VE))?",Mt=ea+"?",wt="["+Kn+"]?",sa="(?:"+na+"(?:"+[ta,_t,Bt].join("|")+")"+wt+Mt+")*",ia=wt+Mt+sa,ra="(?:"+[Jn,_t,Bt].join("|")+")"+ia,oa=RegExp([N+"?"+St+"+"+Oe+"(?="+[we,N,"$"].join("|")+")",aa+"+"+Le+"(?="+[we,N+je,"$"].join("|")+")",N+"?"+je+"+"+Oe,N+"+"+Le,It,ra].join("|"),"g"),la=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,ua=typeof B=="object"&&B&&B.Object===Object&&B,ca=typeof self=="object"&&self&&self.Object===Object&&self,ma=ua||ca||Function("return this")();function da(t){return t.match(zn)||[]}function fa(t){return la.test(t)}function ha(t){return t.match(oa)||[]}var pa=Object.prototype,ga=pa.toString,Pe=ma.Symbol,Re=Pe?Pe.prototype:void 0,$e=Re?Re.toString:void 0;function va(t){if(typeof t=="string")return t;if(ba(t))return $e?$e.call(t):"";var e=t+"";return e=="0"&&1/t==-Yn?"-0":e}function ya(t){return!!t&&typeof t=="object"}function ba(t){return typeof t=="symbol"||ya(t)&&ga.call(t)==Gn}function Ea(t){return t==null?"":va(t)}function xa(t,e,n){return t=Ea(t),e=n?void 0:e,e===void 0?fa(t)?ha(t):da(t):t.match(e)||[]}var Ca=xa,Fa=1/0,Aa="[object Symbol]",Da=/^\s+/,De="\\ud800-\\udfff",jt="\\u0300-\\u036f\\ufe20-\\ufe23",Ot="\\u20d0-\\u20f0",Lt="\\ufe0e\\ufe0f",Ta="["+De+"]",de="["+jt+Ot+"]",fe="\\ud83c[\\udffb-\\udfff]",Ia="(?:"+de+"|"+fe+")",Pt="[^"+De+"]",Rt="(?:\\ud83c[\\udde6-\\uddff]){2}",$t="[\\ud800-\\udbff][\\udc00-\\udfff]",Nt="\\u200d",Yt=Ia+"?",Gt="["+Lt+"]?",Sa="(?:"+Nt+"(?:"+[Pt,Rt,$t].join("|")+")"+Gt+Yt+")*",ka=Gt+Yt+Sa,_a="(?:"+[Pt+de+"?",de,Rt,$t,Ta].join("|")+")",Ba=RegExp(fe+"(?="+fe+")|"+_a+ka,"g"),Ma=RegExp("["+Nt+De+jt+Ot+Lt+"]"),wa=typeof B=="object"&&B&&B.Object===Object&&B,ja=typeof self=="object"&&self&&self.Object===Object&&self,Oa=wa||ja||Function("return this")();function La(t){return t.split("")}function Pa(t,e,n,a){for(var s=t.length,o=n+-1;++o<s;)if(e(t[o],o,t))return o;return-1}function Ra(t,e,n){if(e!==e)return Pa(t,$a,n);for(var a=n-1,s=t.length;++a<s;)if(t[a]===e)return a;return-1}function $a(t){return t!==t}function Na(t,e){for(var n=-1,a=t.length;++n<a&&Ra(e,t[n],0)>-1;);return n}function Ya(t){return Ma.test(t)}function Ne(t){return Ya(t)?Ga(t):La(t)}function Ga(t){return t.match(Ba)||[]}var za=Object.prototype,Ua=za.toString,Ye=Oa.Symbol,Ge=Ye?Ye.prototype:void 0,ze=Ge?Ge.toString:void 0;function Ha(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var o=Array(s);++a<s;)o[a]=t[a+e];return o}function zt(t){if(typeof t=="string")return t;if(qa(t))return ze?ze.call(t):"";var e=t+"";return e=="0"&&1/t==-Fa?"-0":e}function Xa(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:Ha(t,e,n)}function Va(t){return!!t&&typeof t=="object"}function qa(t){return typeof t=="symbol"||Va(t)&&Ua.call(t)==Aa}function Wa(t){return t==null?"":zt(t)}function Ka(t,e,n){if(t=Wa(t),t&&(n||e===void 0))return t.replace(Da,"");if(!t||!(e=zt(e)))return t;var a=Ne(t),s=Na(a,Ne(e));return Xa(a,s).join("")}var Za=Ka,he=1/0,Ja=9007199254740991,Qa=17976931348623157e292,Ue=NaN,es="[object Symbol]",ts=/^\s+|\s+$/g,ns=/^[-+]0x[0-9a-f]+$/i,as=/^0b[01]+$/i,ss=/^0o[0-7]+$/i,Te="\\ud800-\\udfff",Ut="\\u0300-\\u036f\\ufe20-\\ufe23",Ht="\\u20d0-\\u20f0",Xt="\\ufe0e\\ufe0f",is="["+Te+"]",pe="["+Ut+Ht+"]",ge="\\ud83c[\\udffb-\\udfff]",rs="(?:"+pe+"|"+ge+")",Vt="[^"+Te+"]",qt="(?:\\ud83c[\\udde6-\\uddff]){2}",Wt="[\\ud800-\\udbff][\\udc00-\\udfff]",Kt="\\u200d",Zt=rs+"?",Jt="["+Xt+"]?",os="(?:"+Kt+"(?:"+[Vt,qt,Wt].join("|")+")"+Jt+Zt+")*",ls=Jt+Zt+os,us="(?:"+[Vt+pe+"?",pe,qt,Wt,is].join("|")+")",ve=RegExp(ge+"(?="+ge+")|"+us+ls,"g"),cs=RegExp("["+Kt+Te+Ut+Ht+Xt+"]"),ms=parseInt,ds=typeof B=="object"&&B&&B.Object===Object&&B,fs=typeof self=="object"&&self&&self.Object===Object&&self,hs=ds||fs||Function("return this")(),ps=vs("length");function gs(t){return t.split("")}function vs(t){return function(e){return e==null?void 0:e[t]}}function Ie(t){return cs.test(t)}function Qt(t){return Ie(t)?bs(t):ps(t)}function ys(t){return Ie(t)?Es(t):gs(t)}function bs(t){for(var e=ve.lastIndex=0;ve.test(t);)e++;return e}function Es(t){return t.match(ve)||[]}var xs=Object.prototype,Cs=xs.toString,He=hs.Symbol,Fs=Math.ceil,As=Math.floor,Xe=He?He.prototype:void 0,Ve=Xe?Xe.toString:void 0;function qe(t,e){var n="";if(!t||e<1||e>Ja)return n;do e%2&&(n+=t),e=As(e/2),e&&(t+=t);while(e);return n}function Ds(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var o=Array(s);++a<s;)o[a]=t[a+e];return o}function en(t){if(typeof t=="string")return t;if(tn(t))return Ve?Ve.call(t):"";var e=t+"";return e=="0"&&1/t==-he?"-0":e}function Ts(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:Ds(t,e,n)}function Is(t,e){e=e===void 0?" ":en(e);var n=e.length;if(n<2)return n?qe(e,t):e;var a=qe(e,Fs(t/Qt(e)));return Ie(e)?Ts(ys(a),0,t).join(""):a.slice(0,t)}function We(t){var e=typeof t;return!!t&&(e=="object"||e=="function")}function Ss(t){return!!t&&typeof t=="object"}function tn(t){return typeof t=="symbol"||Ss(t)&&Cs.call(t)==es}function ks(t){if(!t)return t===0?t:0;if(t=Bs(t),t===he||t===-he){var e=t<0?-1:1;return e*Qa}return t===t?t:0}function _s(t){var e=ks(t),n=e%1;return e===e?n?e-n:e:0}function Bs(t){if(typeof t=="number")return t;if(tn(t))return Ue;if(We(t)){var e=typeof t.valueOf=="function"?t.valueOf():t;t=We(e)?e+"":e}if(typeof t!="string")return t===0?t:+t;t=t.replace(ts,"");var n=as.test(t);return n||ss.test(t)?ms(t.slice(2),n?2:8):ns.test(t)?Ue:+t}function Ms(t){return t==null?"":en(t)}function ws(t,e,n){t=Ms(t),e=_s(e);var a=e?Qt(t):0;return e&&a<e?t+Is(e-a,n):t}var js=ws,Os=(t,e,n,a)=>{const s=(t+(a||"")).toString().includes("%");if(typeof t=="string"?[t,e,n,a]=t.match(/(0?\.?\d{1,3})%?\b/g).map(Number):a!==void 0&&(a=parseFloat(a)),typeof t!="number"||typeof e!="number"||typeof n!="number"||t>255||e>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof a=="number"){if(!s&&a>=0&&a<=1)a=Math.round(255*a);else if(s&&a>=0&&a<=100)a=Math.round(255*a/100);else throw new TypeError(`Expected alpha value (${a}) as a fraction or percentage`);a=(a|256).toString(16).slice(1)}else a="";return(n|e<<8|t<<16|1<<24).toString(16).slice(1)+a};const z="a-f\\d",Ls=`#?[${z}]{3}[${z}]?`,Ps=`#?[${z}]{6}([${z}]{2})?`,Rs=new RegExp(`[^#${z}]`,"gi"),$s=new RegExp(`^${Ls}$|^${Ps}$`,"i");var Ns=(t,e={})=>{if(typeof t!="string"||Rs.test(t)||!$s.test(t))throw new TypeError("Expected a valid hex string");t=t.replace(/^#/,"");let n=1;t.length===8&&(n=Number.parseInt(t.slice(6,8),16)/255,t=t.slice(0,6)),t.length===4&&(n=Number.parseInt(t.slice(3,4).repeat(2),16)/255,t=t.slice(0,3)),t.length===3&&(t=t[0]+t[0]+t[1]+t[1]+t[2]+t[2]);const a=Number.parseInt(t,16),s=a>>16,o=a>>8&255,r=a&255,i=typeof e.alpha=="number"?e.alpha:n;if(e.format==="array")return[s,o,r,i];if(e.format==="css"){const l=i===1?"":` / ${Number((i*100).toFixed(2))}%`;return`rgb(${s} ${o} ${r}${l})`}return{red:s,green:o,blue:r,alpha:i}},Ys=Nn,Gs=Ca,zs=Za,Us=js,Hs=Os,nn=Ns;const re=.75,oe=.25,le=16777215,Xs=49979693;var Vs=function(t){return"#"+Ks(String(JSON.stringify(t)))};function qs(t){var e=Gs(t),n=[];return e.forEach(function(a){var s=Ys(a);s&&n.push(nn(zs(s,"#"),{format:"array"}))}),n}function Ws(t){var e=[0,0,0];return t.forEach(function(n){for(var a=0;a<3;a++)e[a]+=n[a]}),[e[0]/t.length,e[1]/t.length,e[2]/t.length]}function Ks(t){var e,n=qs(t);n.length>0&&(e=Ws(n));var a=1,s=0,o=1;if(t.length>0)for(var r=0;r<t.length;r++)t[r].charCodeAt(0)>s&&(s=t[r].charCodeAt(0)),o=parseInt(le/s),a=(a+t[r].charCodeAt(0)*o*Xs)%le;var i=(a*t.length%le).toString(16);i=Us(i,6,i);var l=nn(i,{format:"array"});return e?Hs(oe*l[0]+re*e[0],oe*l[1]+re*e[1],oe*l[2]+re*e[2]):i}const Zs=In(Vs);function Js(t){return[...Qs].sort(()=>Math.random()-Math.random()).slice(0,t)}const Qs=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function an(t){return[...ei].sort(()=>Math.random()-Math.random()).slice(0,t)}const ei=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"];function ti(){const t=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],e=Array.from({length:256},(s,o)=>o).sort(()=>Math.random()-.5),n=[...e,...e];function a(s,o,r){return s[0]*o+s[1]*r}return function(o,r){const i=Math.floor(o)&255,l=Math.floor(r)&255;o-=Math.floor(o),r-=Math.floor(r);const c=o*o*o*(o*(o*6-15)+10),u=r*r*r*(r*(r*6-15)+10),d=n[i]+l,m=n[i+1]+l;return(1+(a(t[n[d]&7],o,r)*(1-c)+a(t[n[m]&7],o-1,r)*c)*(1-u)+(a(t[n[d+1]&7],o,r-1)*(1-c)+a(t[n[m+1]&7],o-1,r-1)*c)*u)/2}}function ye(t,e,n,a,s){const o=ti(),r=Math.floor(t.x/I),i=Math.floor(t.y/I),l=Math.floor(a/4),c=.5,u=.005,d=.7;for(let f=i-l;f<=i+l;f++)for(let g=r-l;g<=r+l;g++)if(g>=0&&g<a&&f>=0&&f<s){let b=g,p=f;for(let F=0;F<e;F++)Math.random()<d&&(b+=Math.random()>.5?1:-1,p+=Math.random()>.5?1:-1);b=Math.max(0,Math.min(a-1,b)),p=Math.max(0,Math.min(s-1,p));const C=Math.sqrt((b-r)*(b-r)+(p-i)*(p-i))/l,E=o(g*u,f*u);if(C<1&&E>c+C*.01){const F=f*a+g;n[F].type=M.GROUND,n[F].depth=void 0,n[F].height=(1-C)*2*(E-c)}}const m=Math.min(Math.max(i*a+r,0),a);n[m].type=M.GROUND,n[m].depth=void 0,n[m].height=1}function ni(t,e){return{x:Math.floor(Math.random()*(t*.8)+t*.1)*I,y:Math.floor(Math.random()*(e*.8)+e*.1)*I}}function ai(t,e,n,a){if(t.x<0||t.y<0||t.x>=n||t.y>=a)return!1;const s=Math.floor(n/(Math.sqrt(e.length+1)*2));return e.every(o=>Math.abs(t.x-o.x)>s||Math.abs(t.y-o.y)>s)}function si(t,e,n){return e.every(a=>Math.sqrt(Math.pow(t.x-a.position.x,2)+Math.pow(t.y-a.position.y,2))>=n)}function ii(t,e,n,a,s){const o=[],r=[],i=[],l=j*3,c=an(t*2).filter(f=>f!==e),u=5,d=Js(t*u*2),m=[];for(let f=0;f<t;f++){const g=`state-${f+1}`,b=f===0?e:c.pop(),p=ri(g,b,f===0);o.push(p),o.forEach(E=>{p.strategies[E.id]=y.NEUTRAL,E.strategies[g]=y.NEUTRAL});const C=oi(m,n,a);m.push(C),ye(C,n/2,s,n,a),li(g,C,u,d,r,i,l,s,n,a),p.population=r.filter(E=>E.stateId===g).reduce((E,F)=>E+F.population,0)}return{states:o,cities:r,launchSites:i}}function ri(t,e,n){return{id:t,name:e,color:Zs(e),isPlayerControlled:n,strategies:{},generalStrategy:n?void 0:[y.NEUTRAL,y.HOSTILE,y.FRIENDLY].sort(()=>Math.random()-.5)[0],population:0}}function oi(t,e,n){let a,s=10;do if(a=ni(e,n),s--<=0)break;while(!ai(a,t,e,n));return a}function li(t,e,n,a,s,o,r,i,l,c){const u=[];for(let d=0;d<n;d++){const m=Ke(e,u,r,30*I);u.push({position:m}),s.push({id:`city-${s.length+1}`,stateId:t,name:a.pop(),position:m,population:Math.floor(Math.random()*3e3)+1e3}),ye(m,2,i,l,c)}for(const d of s){const m=i.filter(f=>{const g=f.position.x-d.position.x,b=f.position.y-d.position.y;return Math.sqrt(g*g+b*b)<O});for(const f of m){f.cityId=d.id;const g=f.position.x-d.position.x,b=f.position.y-d.position.y,p=Math.sqrt(g*g+b*b);f.population=Math.max(0,O-p)/O*yt}d.population=m.reduce((f,g)=>f+g.population,0)}for(let d=0;d<4;d++){const m=Ke(e,u,r,15*I);u.push({position:m}),o.push({type:gt.LAUNCH_SITE,id:`launch-site-${o.length+1}`,stateId:t,position:m,mode:Math.random()>.5?k.DEFENCE:k.ATTACK}),ye(m,1,i,l,c)}return u}function Ke(t,e,n,a){let s,o=10;do if(s={x:t.x+(Math.random()-.5)*a,y:t.y+(Math.random()-.5)*a},o--<=0)break;while(!si(s,e,n));return s}function ui({playerStateName:t,numberOfStates:e=3}){const n=Math.max(200,Math.ceil(Math.sqrt(e)*10)),a=n,s=[];for(let d=0;d<a;d++)for(let m=0;m<n;m++)s.push({id:`sector-${s.length+1}`,position:{x:m*I,y:d*I},rect:{left:m*I,top:d*I,right:(m+1)*I,bottom:(d+1)*I},type:M.WATER,depth:0,height:0});const{states:o,cities:r,launchSites:i}=ii(e,t,n,a,s);return Pn(s,n,a),{timestamp:0,states:o,cities:r,launchSites:i,sectors:s,missiles:[],explosions:[],interceptors:[]}}function S(t,e,n,a){return Math.sqrt(Math.pow(n-t,2)+Math.pow(a-e,2))}function ci(t){var n;const e=t.sectors.filter(a=>a.cityId&&a.population>0);for(const a of t.states){const s=t.cities.filter(u=>u.stateId===a.id),o=t.launchSites.filter(u=>u.stateId===a.id),r=t.cities.filter(u=>a.strategies[u.stateId]===y.HOSTILE&&u.stateId!==a.id&&u.population>0).map(u=>({...u,isCity:!0})),i=t.missiles.filter(u=>a.strategies[u.stateId]!==y.FRIENDLY&&u.stateId!==a.id),l=t.launchSites.filter(u=>a.strategies[u.stateId]===y.HOSTILE&&u.stateId!==a.id).map(u=>({...u,isCity:!1})),c=i.filter(u=>s.some(d=>be(u.target,d.position,j+O))||o.some(d=>be(u.target,d.position,j))).filter(u=>(t.timestamp-u.launchTimestamp)/(u.targetTimestamp-u.launchTimestamp)>.5);for(const u of t.launchSites.filter(d=>d.stateId===a.id)){if(u.nextLaunchTarget)continue;if(r.length===0&&l.length===0&&i.length===0)break;const d=Ze(c.map(p=>({...p,isCity:!1})),u.position),m=t.missiles.filter(p=>p.stateId===a.id),f=t.interceptors.filter(p=>p.stateId===a.id),g=f.filter(p=>!p.targetMissileId&&u.id===p.launchSiteId),b=di(f,d).filter(([,p])=>p<o.length);if(u.mode===k.DEFENCE&&b.length>0){const p=b[0][0];g.length>0?g[0].targetMissileId=p:u.nextLaunchTarget={type:"missile",missileId:p}}else if(u.mode===k.ATTACK){const p=mi(Ze([...l,...r],u.position),m),C=(n=p==null?void 0:p[0])==null?void 0:n[0];if(C!=null&&C.position&&(C!=null&&C.isCity)){const E=fi(C,e);u.nextLaunchTarget={type:"position",position:E||{x:C.position.x+(Math.random()-Math.random())*O,y:C.position.y+(Math.random()-Math.random())*O}}}else u.nextLaunchTarget=C!=null&&C.position?{type:"position",position:C==null?void 0:C.position}:void 0}}}return t}function be(t,e,n){return S(t.x,t.y,e.x,e.y)<=n}function Ze(t,e){return t.sort((n,a)=>S(n.position.x,n.position.y,e.x,e.y)-S(a.position.x,a.position.y,e.x,e.y))}function mi(t,e){const n=new Map;for(const a of t)n.set(a,e.filter(s=>be(s.target,a.position,j)).length);return Array.from(n).sort((a,s)=>a[1]-s[1])}function di(t,e){const n=new Map;for(const a of e)n.set(a.id,0);for(const a of t)a.targetMissileId&&n.set(a.targetMissileId,(n.get(a.targetMissileId)??0)+1);return Array.from(n).sort((a,s)=>a[1]-s[1])}function fi(t,e){const n=e.filter(s=>s.cityId===t.id);return!n||n.length===0?null:n[Math.floor(Math.random()*n.length)].position}function hi(t){var e,n;for(const a of t.missiles.filter(s=>s.launchTimestamp===t.timestamp)){const s=t.states.find(r=>r.id===a.stateId),o=((e=t.cities.find(r=>S(r.position.x,r.position.y,a.target.x,a.target.y)<=j))==null?void 0:e.stateId)||((n=t.launchSites.find(r=>S(r.position.x,r.position.y,a.target.x,a.target.y)<=j))==null?void 0:n.stateId);if(s&&o&&s.id!==o){s.strategies[o]!==y.HOSTILE&&(s.strategies[o]=y.HOSTILE);const r=t.states.find(i=>i.id===o);r&&r.strategies[s.id]!==y.HOSTILE&&(r.strategies[s.id]=y.HOSTILE,t.states.forEach(i=>{i.id!==r.id&&i.strategies[r.id]===y.FRIENDLY&&r.strategies[i.id]===y.FRIENDLY&&(i.strategies[s.id]=y.HOSTILE,s.strategies[i.id]=y.HOSTILE)}))}}for(const a of t.states.filter(s=>!s.isPlayerControlled))pi(a,t);return t}function pi(t,e){const n=e.states.filter(r=>r.id!==t.id);t.strategies={...t.strategies},t.generalStrategy!==y.HOSTILE&&n.forEach(r=>{r.strategies[t.id]===y.FRIENDLY&&t.strategies[r.id]===y.NEUTRAL&&(t.strategies[r.id]=y.FRIENDLY)});const a=n.filter(r=>Object.values(r.strategies).every(i=>i!==y.HOSTILE)&&r.generalStrategy!==y.HOSTILE);if(a.length>0&&t.generalStrategy===y.FRIENDLY){const r=a[Math.floor(Math.random()*a.length)];t.strategies[r.id]=y.FRIENDLY}const s=n.filter(r=>t.strategies[r.id]===y.FRIENDLY&&r.strategies[t.id]===y.FRIENDLY);s.forEach(r=>{n.forEach(i=>{i.strategies[r.id]===y.HOSTILE&&t.strategies[i.id]!==y.HOSTILE&&(t.strategies[i.id]=y.HOSTILE)})}),n.filter(r=>r.strategies[t.id]!==y.FRIENDLY&&t.strategies[r.id]!==y.FRIENDLY).forEach(r=>{if(gi(r,t,s,e)){const i=e.launchSites.filter(l=>l.stateId===t.id&&!l.lastLaunchTimestamp);if(i.length>0){const l=i[Math.floor(Math.random()*i.length)],c=[...e.cities.filter(u=>u.stateId===r.id),...e.launchSites.filter(u=>u.stateId===r.id)];if(c.length>0){const u=c[Math.floor(Math.random()*c.length)];l.nextLaunchTarget={type:"position",position:u.position}}}}})}function gi(t,e,n,a){const s=a.launchSites.filter(i=>i.stateId===t.id),o=a.launchSites.filter(i=>i.stateId===e.id||n.some(l=>l.id===i.stateId));return s.length<o.length?!0:a.missiles.some(i=>a.cities.some(l=>l.stateId===t.id&&S(l.position.x,l.position.y,i.target.x,i.target.y)<=j)||a.launchSites.some(l=>l.stateId===t.id&&S(l.position.x,l.position.y,i.target.x,i.target.y)<=j))}function vi(t,e){for(;e>0;){const n=yi(t,e>V?V:e);e=e>V?e-V:0,t=n}return t}function yi(t,e){var o,r;const n=t.timestamp+e;let a={timestamp:n,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,interceptors:t.interceptors,explosions:t.explosions,sectors:t.sectors};for(const i of a.missiles){const l=(n-i.launchTimestamp)/(i.targetTimestamp-i.launchTimestamp);i.position={x:i.launch.x+(i.target.x-i.launch.x)*l,y:i.launch.y+(i.target.y-i.launch.y)*l}}for(const i of a.interceptors){const l=a.missiles.find(f=>f.id===i.targetMissileId);l||(i.targetMissileId=void 0);const c=l?l.position.x-i.position.x:Math.cos(i.direction),u=l?l.position.y-i.position.y:Math.sin(i.direction),d=Math.sqrt(c*c+u*u);if(i.direction=Math.atan2(u,c),l&&d<=Z*e)i.position={...l.position};else{const f=Z*e/d;i.position={x:i.position.x+c*f,y:i.position.y+u*f}}i.tail=[...i.tail.slice(-100),{timestamp:n,position:i.position}],Z*(n-i.launchTimestamp)>i.maxRange&&(a.interceptors=a.interceptors.filter(f=>f.id!==i.id))}for(const i of a.interceptors){const l=a.missiles.find(c=>c.id===i.targetMissileId);l&&S(i.position.x,i.position.y,l.position.x,l.position.y)<Bn&&(a.missiles=a.missiles.filter(u=>u.id!==l.id),a.interceptors=a.interceptors.filter(u=>u.id!==i.id))}for(const i of t.missiles.filter(l=>l.targetTimestamp<=n)){const l={id:`explosion-${Math.random()}`,missileId:i.id,startTimestamp:i.targetTimestamp,endTimestamp:i.targetTimestamp+wn,position:i.target,radius:j};a.explosions.push(l);for(const m of t.sectors.filter(f=>S(f.position.x,f.position.y,l.position.x,l.position.y)<=l.radius))if(m.population){const f=Math.max(On,m.population*jn);m.population=Math.max(0,m.population-f)}const c=t.missiles.filter(m=>m.id!==l.missileId&&m.launchTimestamp<=l.startTimestamp&&m.targetTimestamp>=l.startTimestamp).filter(m=>S(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius),u=t.interceptors.filter(m=>m.launchTimestamp<=l.startTimestamp).filter(m=>S(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius);for(const m of c)m.targetTimestamp=l.startTimestamp;for(const m of u)a.interceptors=a.interceptors.filter(f=>f.id!==m.id);const d=t.launchSites.filter(m=>S(m.position.x,m.position.y,l.position.x,l.position.y)<=l.radius);for(const m of d)a.launchSites=t.launchSites.filter(f=>f.id!==m.id)}a.explosions=a.explosions.filter(i=>i.endTimestamp>=n),a.missiles=a.missiles.filter(i=>i.targetTimestamp>n);for(const i of a.launchSites)i.modeChangeTimestamp&&n>=i.modeChangeTimestamp+ce&&(i.mode=i.mode===k.ATTACK?k.DEFENCE:k.ATTACK,i.modeChangeTimestamp=void 0);for(const i of t.launchSites){if(i.nextLaunchTarget){if(i.lastLaunchTimestamp&&n-i.lastLaunchTimestamp<(i.mode===k.ATTACK?me:Ln))continue}else continue;if(i.mode===k.ATTACK&&((o=i.nextLaunchTarget)==null?void 0:o.type)==="position"){const l={id:Math.random()+"",stateId:i.stateId,launchSiteId:i.id,launch:i.position,launchTimestamp:n,position:i.position,target:i.nextLaunchTarget.position,targetTimestamp:n+S(i.position.x,i.position.y,i.nextLaunchTarget.position.x,i.nextLaunchTarget.position.y)/vt};a.missiles.push(l)}else if(i.mode===k.DEFENCE&&((r=i.nextLaunchTarget)==null?void 0:r.type)==="missile"){const l=i.nextLaunchTarget.missileId;if(l){const c={id:Math.random()+"",stateId:i.stateId,launchSiteId:i.id,launch:i.position,launchTimestamp:n,position:i.position,direction:0,tail:[],targetMissileId:l,maxRange:Ae};a.interceptors.push(c)}}i.lastLaunchTimestamp=n,i.nextLaunchTarget=void 0}const s=a.sectors.reduce((i,l)=>(l.cityId&&(i[l.cityId]=i[l.cityId]?i[l.cityId]+(l.population??0):l.population??0),i),{});for(const i of a.cities)i.population=s[i.id];return a.states=a.states.map(i=>{const l=a.cities.filter(c=>c.stateId===i.id).reduce((c,u)=>c+u.population,0);return{...i,population:l}}),a=ci(a),a=hi(a),a}function bi(t){const[e,n]=v.useState(()=>ui({playerStateName:t,numberOfStates:6})),a=v.useCallback((s,o)=>n(vi(s,o)),[]);return{worldState:e,updateWorldState:a,setWorldState:n}}const sn={x:0,y:0,pointingObjects:[]},Ei=(t,e)=>e.type==="move"?{x:e.x,y:e.y,pointingObjects:t.pointingObjects}:e.type==="point"&&!t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,e.object]}:e.type==="unpoint"&&t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(n=>n.id!==e.object.id)}:t,xi=v.createContext(sn),Se=v.createContext(()=>{});function Ci({children:t}){const[e,n]=v.useReducer(Ei,sn);return h.jsx(xi.Provider,{value:e,children:h.jsx(Se.Provider,{value:n,children:t})})}function Fi(){const t=v.useContext(Se);return(e,n)=>t({type:"move",x:e,y:n})}function ke(){const t=v.useContext(Se);return[e=>t({type:"point",object:e}),e=>t({type:"unpoint",object:e})]}const _e={},Ai=(t,e)=>e.type==="clear"?_e:e.type==="set"?{...t,selectedObject:e.object}:t,rn=v.createContext(_e),on=v.createContext(()=>{});function Di({children:t}){const[e,n]=v.useReducer(Ai,_e);return h.jsx(rn.Provider,{value:e,children:h.jsx(on.Provider,{value:n,children:t})})}function Ti(t){var a;const e=v.useContext(on);return[((a=v.useContext(rn).selectedObject)==null?void 0:a.id)===t.id,()=>e({type:"set",object:t})]}function U(t,e){const n=new CustomEvent(t,{bubbles:!0,detail:e});document.dispatchEvent(n)}function ne(t,e){v.useEffect(()=>{const n=a=>{e(a.detail)};return document.addEventListener(t,n,!1),()=>{document.removeEventListener(t,n,!1)}},[t,e])}const Ii=G.memo(({sectors:t})=>{const e=v.useRef(null),[n,a]=ke(),[s,o]=v.useState(0);return ne("cityDamage",()=>{o(s+1)}),v.useEffect(()=>{const r=e.current,i=r==null?void 0:r.getContext("2d");if(!r||!i)return;const l=Math.min(...t.map(p=>p.rect.left)),c=Math.min(...t.map(p=>p.rect.top)),u=Math.max(...t.map(p=>p.rect.right)),d=Math.max(...t.map(p=>p.rect.bottom)),m=u-l,f=d-c;r.width=m,r.height=f,r.style.width=`${m}px`,r.style.height=`${f}px`;const g=Math.max(...t.filter(p=>p.type===M.WATER).map(p=>p.depth||0)),b=Math.max(...t.filter(p=>p.type===M.GROUND).map(p=>p.height||0));i.clearRect(0,0,m,f),t.forEach(p=>{const{fillStyle:C,drawSector:E}=Si(p,g,b);i.fillStyle=C,E(i,p.rect,l,c)})},[t,s]),v.useEffect(()=>{const r=e.current;let i;const l=c=>{const u=r==null?void 0:r.getBoundingClientRect(),d=c.clientX-((u==null?void 0:u.left)||0),m=c.clientY-((u==null?void 0:u.top)||0),f=t.find(g=>d>=g.rect.left&&d<=g.rect.right&&m>=g.rect.top&&m<=g.rect.bottom);f&&(i&&a(i),n(f),i=f)};return r==null||r.addEventListener("mousemove",l),()=>{r==null||r.removeEventListener("mousemove",l)}},[t,n,a]),h.jsx("canvas",{ref:e,style:{opacity:.5}})});function Si(t,e,n){switch(t.type){case M.GROUND:return t.cityId?{fillStyle:Je(t),drawSector:(a,s,o,r)=>{a.fillStyle=Je(t),a.fillRect(s.left-o,s.top-r,s.right-s.left,s.bottom-s.top),t.population>0&&ki(a,s,o,r)}}:{fillStyle:Qe(t.height||0,n),drawSector:(a,s,o,r)=>{a.fillStyle=Qe(t.height||0,n),a.fillRect(s.left-o,s.top-r,s.right-s.left,s.bottom-s.top)}};case M.WATER:return{fillStyle:"rgb(0, 34, 93)",drawSector:(a,s,o,r)=>{const i=(t.depth||0)/e,l=Math.round(0+34*(1-i)),c=Math.round(137+-103*i),u=Math.round(178+-85*i);a.fillStyle=`rgb(${l}, ${c}, ${u})`,a.fillRect(s.left-o,s.top-r,s.right-s.left,s.bottom-s.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(a,s,o,r)=>{a.fillStyle="rgb(0, 34, 93)",a.fillRect(s.left-o,s.top-r,s.right-s.left,s.bottom-s.top)}}}}function Je(t){if(t.population===0)return"rgba(0,0,0,0.7)";const e=t.population?Math.min(t.population/yt,1):0,n=t.height?t.height/100:0,s=[200,200,200].map(o=>o-50*e+20*n);return`rgb(${s[0]}, ${s[1]}, ${s[2]})`}function ki(t,e,n,a){t.fillStyle="rgba(0, 0, 0, 0.2)",t.fillRect(e.left-n+2,e.top-a+2,e.right-e.left-4,e.bottom-e.top-4),t.fillStyle="rgba(255, 255, 255, 0.6)",t.fillRect(e.left-n+4,e.top-a+4,e.right-e.left-8,e.bottom-e.top-8)}function Qe(t,e){const n=t/e;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const a=Math.round(34+67*((n-.5)/.3)),s=Math.round(100+-33*((n-.5)/.3)),o=Math.round(34+-1*((n-.5)/.3));return`rgb(${a}, ${s}, ${o})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}const q=O;function _i({state:t,cities:e,launchSites:n}){const{boundingBox:a,pathData:s}=G.useMemo(()=>{const o=[...e.filter(c=>c.stateId===t.id&&c.population>0).map(c=>c.position),...n.filter(c=>c.stateId===t.id).map(c=>c.position)].map(({x:c,y:u})=>[{x:c,y:u},{x:c+q,y:u},{x:c,y:u+q},{x:c-q,y:u},{x:c,y:u-q}]).flat(),r=ji(o),i=Li(r),l=r.map((c,u)=>`${u===0?"M":"L"} ${c.x-i.minX} ${c.y-i.minY}`).join(" ")+"Z";return{boundingBox:i,pathData:l}},[t,e,n]);return h.jsxs(h.Fragment,{children:[h.jsx(Bi,{style:{transform:`translate(${(a.maxX+a.minX)/2}px, ${a.minY}px) translateX(-50%) translateY(-150%)`},children:t.name}),h.jsx(Mi,{width:a.maxX-a.minX,height:a.maxY-a.minY,style:{transform:`translate(${a.minX}px, ${a.minY}px)`},children:h.jsx(wi,{d:s,fill:"none",stroke:t.color,strokeWidth:"2"})})]})}const Bi=x.div`
  position: absolute;
  color: white;
  pointer-events: none;
  font-size: x-large;
`,Mi=x.svg`
  position: absolute;
  pointer-events: none;
`,wi=x.path``;function ji(t){if(t.length<3)return t;const e=t.reduce((s,o)=>o.y<s.y?o:s,t[0]),n=t.sort((s,o)=>{const r=Math.atan2(s.y-e.y,s.x-e.x),i=Math.atan2(o.y-e.y,o.x-e.x);return r-i}),a=[n[0],n[1]];for(let s=2;s<n.length;s++){for(;a.length>1&&!Oi(a[a.length-2],a[a.length-1],n[s]);)a.pop();a.push(n[s])}return a}function Oi(t,e,n){return(e.x-t.x)*(n.y-t.y)-(e.y-t.y)*(n.x-t.x)>0}function Li(t){return t.reduce((n,a)=>({minX:Math.min(n.minX,a.x),minY:Math.min(n.minY,a.y),maxX:Math.max(n.maxX,a.x),maxY:Math.max(n.maxY,a.y)}),{minX:1/0,minY:1/0,maxX:-1/0,maxY:-1/0})}function Pi({city:t}){const[e,n]=ke(),a=t.population;return a?h.jsxs(Ri,{onMouseEnter:()=>e(t),onMouseLeave:()=>n(t),style:{"--x":t.position.x,"--y":t.position.y},children:[h.jsx("span",{children:t.name}),h.jsxs($i,{children:[a<<0," population"]})]}):null}const Ri=x.div`
  transform: translate(calc(var(--x) * 1px), calc(var(--y) * 1px)) translate(-50%, -100%);
  position: absolute;
  width: calc(var(--size) * 1px);
  height: calc(var(--size) * 1px);
  color: white;

  &:hover > div {
    display: block;
  }
`,$i=x.div`
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
`;function Ni({launchSite:t,worldTimestamp:e,isPlayerControlled:n}){const[a,s]=Ti(t),[o,r]=ke(),i=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+me>e,l=i?(e-t.lastLaunchTimestamp)/me:0,c=t.modeChangeTimestamp&&e<t.modeChangeTimestamp+ce,u=c?(e-t.modeChangeTimestamp)/ce:0;return h.jsx(Yi,{onMouseEnter:()=>o(t),onMouseLeave:()=>r(t),onClick:()=>n&&s(),style:{"--x":t.position.x,"--y":t.position.y,"--cooldown-progress":l,"--mode-change-progress":u},"data-selected":a,"data-cooldown":i,"data-mode":t.mode,"data-changing-mode":c,children:h.jsx(Gi,{children:t.mode===k.ATTACK?"A":"D"})})}const Yi=x.div`
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
`,Gi=x.span`
  z-index: 1;
`;function ln(t,e){e===void 0&&(e=!0);var n=v.useRef(null),a=v.useRef(!1),s=v.useRef(t);s.current=t;var o=v.useCallback(function(i){a.current&&(s.current(i),n.current=requestAnimationFrame(o))},[]),r=v.useMemo(function(){return[function(){a.current&&(a.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){a.current||(a.current=!0,n.current=requestAnimationFrame(o))},function(){return a.current}]},[]);return v.useEffect(function(){return e&&r[1](),r[0]},[]),r}function zi(t,e,n){if(e.startTimestamp>n||e.endTimestamp<n)return;const a=Math.pow(Math.min(Math.max(0,(n-e.startTimestamp)/(e.endTimestamp-e.startTimestamp)),1),.15);t.fillStyle=`rgb(${255*a}, ${255*(1-a)}, 0)`,t.beginPath(),t.arc(e.position.x,e.position.y,e.radius*a,0,2*Math.PI),t.fill()}function Ui(t,e,n){e.launchTimestamp>n||e.targetTimestamp<n||(t.fillStyle="rgb(255, 0, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,2,0,2*Math.PI),t.fill())}function Hi(t,e){t.fillStyle="rgb(0, 255, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,1,0,2*Math.PI),t.fill()}function et(t,e,n){if(!(e.launchTimestamp>n))if("targetTimestamp"in e){if(e.targetTimestamp<n)return;Xi(t,e,n)}else Vi(t,e,n)}function Xi(t,e,n){const a=Math.min(Math.max(n-5,e.launchTimestamp)-e.launchTimestamp,e.targetTimestamp-e.launchTimestamp),s=e.targetTimestamp-e.launchTimestamp,o=s>0?a/s:0,r=e.launch.x+(e.position.x-e.launch.x)*o,i=e.launch.y+(e.position.y-e.launch.y)*o,l={x:r,y:i},c=t.createLinearGradient(l.x,l.y,e.position.x,e.position.y);c.addColorStop(0,"rgba(255, 255, 255, 0)"),c.addColorStop(1,"rgba(255, 255, 255, 0.5)"),t.strokeStyle=c,t.lineWidth=1,t.beginPath(),t.moveTo(l.x,l.y),t.lineTo(e.position.x,e.position.y),t.stroke()}function Vi(t,e,n){const s=Math.max(n-5,e.launchTimestamp),o=e.tail.filter(i=>i.timestamp>=s);if(o.length<2)return;t.beginPath(),t.moveTo(o[0].position.x,o[0].position.y);for(let i=1;i<o.length;i++)t.lineTo(o[i].position.x,o[i].position.y);t.lineTo(e.position.x,e.position.y);const r=t.createLinearGradient(o[0].position.x,o[0].position.y,e.position.x,e.position.y);r.addColorStop(0,"rgba(0, 255, 0, 0)"),r.addColorStop(1,"rgba(0, 255, 0, 0.5)"),t.strokeStyle=r,t.lineWidth=1,t.stroke()}function qi(t,e){if(Math.sqrt(Math.pow(e.position.x-e.launch.x,2)+Math.pow(e.position.y-e.launch.y,2))>Ae)for(let r=0;r<5;r++){const i=Math.PI*2/5*r,l=e.position.x+Math.cos(i)*3,c=e.position.y+Math.sin(i)*3;t.fillStyle="rgba(0, 255, 0, 0.5)",t.beginPath(),t.arc(l,c,1,0,2*Math.PI),t.fill()}}function Wi({state:t}){const e=v.useRef(null);return v.useLayoutEffect(()=>{const a=e.current;if(!a)return;const s=Math.min(...t.sectors.map(u=>u.rect.left)),o=Math.min(...t.sectors.map(u=>u.rect.top)),r=Math.max(...t.sectors.map(u=>u.rect.right)),i=Math.max(...t.sectors.map(u=>u.rect.bottom)),l=r-s,c=i-o;a.width=l,a.height=c,a.style.width=`${l}px`,a.style.height=`${c}px`},[t.sectors]),ln(()=>{const a=e.current;if(!a)return;const s=a.getContext("2d");s&&(s.clearRect(0,0,a.width,a.height),t.missiles.forEach(o=>{et(s,o,t.timestamp)}),t.interceptors.forEach(o=>{et(s,o,t.timestamp)}),t.missiles.filter(o=>o.launchTimestamp<t.timestamp&&o.targetTimestamp>t.timestamp).forEach(o=>{Ui(s,o,t.timestamp)}),t.interceptors.filter(o=>o.launchTimestamp<t.timestamp).forEach(o=>{Hi(s,o),Z*(t.timestamp-o.launchTimestamp+1)>Ae&&qi(s,o)}),t.explosions.filter(o=>o.startTimestamp<t.timestamp&&o.endTimestamp>t.timestamp).forEach(o=>{zi(s,o,t.timestamp)}))}),h.jsx(Ki,{ref:e})}const Ki=x.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function Zi({state:t}){const e=Fi();return h.jsxs(Ji,{onMouseMove:n=>e(n.clientX,n.clientY),onClick:()=>U("world-click"),children:[h.jsx(Ii,{sectors:t.sectors}),t.states.map(n=>h.jsx(_i,{state:n,cities:t.cities,launchSites:t.launchSites},n.id)),t.cities.map(n=>h.jsx(Pi,{city:n},n.id)),t.launchSites.map(n=>{var a;return h.jsx(Ni,{launchSite:n,worldTimestamp:t.timestamp,isPlayerControlled:n.stateId===((a=t.states.find(s=>s.isPlayerControlled))==null?void 0:a.id)},n.id)}),h.jsx(Wi,{state:t})]})}const Ji=x.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function Qi(t,e,n){return Math.max(e,Math.min(t,n))}const A={toVector(t,e){return t===void 0&&(t=e),Array.isArray(t)?t:[t,t]},add(t,e){return[t[0]+e[0],t[1]+e[1]]},sub(t,e){return[t[0]-e[0],t[1]-e[1]]},addTo(t,e){t[0]+=e[0],t[1]+=e[1]},subTo(t,e){t[0]-=e[0],t[1]-=e[1]}};function tt(t,e,n){return e===0||Math.abs(e)===1/0?Math.pow(t,n*5):t*e*n/(e+n*t)}function nt(t,e,n,a=.15){return a===0?Qi(t,e,n):t<e?-tt(e-t,n-e,a)+e:t>n?+tt(t-n,n-e,a)+n:t}function er(t,[e,n],[a,s]){const[[o,r],[i,l]]=t;return[nt(e,o,r,a),nt(n,i,l,s)]}function tr(t,e){if(typeof t!="object"||t===null)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var a=n.call(t,e||"default");if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function nr(t){var e=tr(t,"string");return typeof e=="symbol"?e:String(e)}function T(t,e,n){return e=nr(e),e in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function at(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(t);e&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(t,s).enumerable})),n.push.apply(n,a)}return n}function D(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?at(Object(n),!0).forEach(function(a){T(t,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):at(Object(n)).forEach(function(a){Object.defineProperty(t,a,Object.getOwnPropertyDescriptor(n,a))})}return t}const un={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function st(t){return t?t[0].toUpperCase()+t.slice(1):""}const ar=["enter","leave"];function sr(t=!1,e){return t&&!ar.includes(e)}function ir(t,e="",n=!1){const a=un[t],s=a&&a[e]||e;return"on"+st(t)+st(s)+(sr(n,s)?"Capture":"")}const rr=["gotpointercapture","lostpointercapture"];function or(t){let e=t.substring(2).toLowerCase();const n=!!~e.indexOf("passive");n&&(e=e.replace("passive",""));const a=rr.includes(e)?"capturecapture":"capture",s=!!~e.indexOf(a);return s&&(e=e.replace("capture","")),{device:e,capture:s,passive:n}}function lr(t,e=""){const n=un[t],a=n&&n[e]||e;return t+a}function ae(t){return"touches"in t}function cn(t){return ae(t)?"touch":"pointerType"in t?t.pointerType:"mouse"}function ur(t){return Array.from(t.touches).filter(e=>{var n,a;return e.target===t.currentTarget||((n=t.currentTarget)===null||n===void 0||(a=n.contains)===null||a===void 0?void 0:a.call(n,e.target))})}function cr(t){return t.type==="touchend"||t.type==="touchcancel"?t.changedTouches:t.targetTouches}function mn(t){return ae(t)?cr(t)[0]:t}function Ee(t,e){try{const n=e.clientX-t.clientX,a=e.clientY-t.clientY,s=(e.clientX+t.clientX)/2,o=(e.clientY+t.clientY)/2,r=Math.hypot(n,a);return{angle:-(Math.atan2(n,a)*180)/Math.PI,distance:r,origin:[s,o]}}catch{}return null}function mr(t){return ur(t).map(e=>e.identifier)}function it(t,e){const[n,a]=Array.from(t.touches).filter(s=>e.includes(s.identifier));return Ee(n,a)}function ue(t){const e=mn(t);return ae(t)?e.identifier:e.pointerId}function Y(t){const e=mn(t);return[e.clientX,e.clientY]}const rt=40,ot=800;function dn(t){let{deltaX:e,deltaY:n,deltaMode:a}=t;return a===1?(e*=rt,n*=rt):a===2&&(e*=ot,n*=ot),[e,n]}function dr(t){var e,n;const{scrollX:a,scrollY:s,scrollLeft:o,scrollTop:r}=t.currentTarget;return[(e=a??o)!==null&&e!==void 0?e:0,(n=s??r)!==null&&n!==void 0?n:0]}function fr(t){const e={};if("buttons"in t&&(e.buttons=t.buttons),"shiftKey"in t){const{shiftKey:n,altKey:a,metaKey:s,ctrlKey:o}=t;Object.assign(e,{shiftKey:n,altKey:a,metaKey:s,ctrlKey:o})}return e}function Q(t,...e){return typeof t=="function"?t(...e):t}function hr(){}function pr(...t){return t.length===0?hr:t.length===1?t[0]:function(){let e;for(const n of t)e=n.apply(this,arguments)||e;return e}}function lt(t,e){return Object.assign({},e,t||{})}const gr=32;class fn{constructor(e,n,a){this.ctrl=e,this.args=n,this.key=a,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(e){this.ctrl.state[this.key]=e}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:e,shared:n,ingKey:a,args:s}=this;n[a]=e._active=e.active=e._blocked=e._force=!1,e._step=[!1,!1],e.intentional=!1,e._movement=[0,0],e._distance=[0,0],e._direction=[0,0],e._delta=[0,0],e._bounds=[[-1/0,1/0],[-1/0,1/0]],e.args=s,e.axis=void 0,e.memo=void 0,e.elapsedTime=e.timeDelta=0,e.direction=[0,0],e.distance=[0,0],e.overflow=[0,0],e._movementBound=[!1,!1],e.velocity=[0,0],e.movement=[0,0],e.delta=[0,0],e.timeStamp=0}start(e){const n=this.state,a=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=e.target,n.currentTarget=e.currentTarget,n.lastOffset=a.from?Q(a.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=e.timeStamp)}computeValues(e){const n=this.state;n._values=e,n.values=this.config.transform(e)}computeInitial(){const e=this.state;e._initial=e._values,e.initial=e.values}compute(e){const{state:n,config:a,shared:s}=this;n.args=this.args;let o=0;if(e&&(n.event=e,a.preventDefault&&e.cancelable&&n.event.preventDefault(),n.type=e.type,s.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,s.locked=!!document.pointerLockElement,Object.assign(s,fr(e)),s.down=s.pressed=s.buttons%2===1||s.touches>0,o=e.timeStamp-n.timeStamp,n.timeStamp=e.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const L=n._delta.map(Math.abs);A.addTo(n._distance,L)}this.axisIntent&&this.axisIntent(e);const[r,i]=n._movement,[l,c]=a.threshold,{_step:u,values:d}=n;if(a.hasCustomTransform?(u[0]===!1&&(u[0]=Math.abs(r)>=l&&d[0]),u[1]===!1&&(u[1]=Math.abs(i)>=c&&d[1])):(u[0]===!1&&(u[0]=Math.abs(r)>=l&&Math.sign(r)*l),u[1]===!1&&(u[1]=Math.abs(i)>=c&&Math.sign(i)*c)),n.intentional=u[0]!==!1||u[1]!==!1,!n.intentional)return;const m=[0,0];if(a.hasCustomTransform){const[L,Tn]=d;m[0]=u[0]!==!1?L-u[0]:0,m[1]=u[1]!==!1?Tn-u[1]:0}else m[0]=u[0]!==!1?r-u[0]:0,m[1]=u[1]!==!1?i-u[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(m);const f=n.offset,g=n._active&&!n._blocked||n.active;g&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=s[this.ingKey]=n._active,e&&(n.first&&("bounds"in a&&(n._bounds=Q(a.bounds,n)),this.setup&&this.setup()),n.movement=m,this.computeOffset()));const[b,p]=n.offset,[[C,E],[F,se]]=n._bounds;n.overflow=[b<C?-1:b>E?1:0,p<F?-1:p>se?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const Dn=n._active?a.rubberband||[0,0]:[0,0];if(n.offset=er(n._bounds,n.offset,Dn),n.delta=A.sub(n.offset,f),this.computeMovement(),g&&(!n.last||o>gr)){n.delta=A.sub(n.offset,f);const L=n.delta.map(Math.abs);A.addTo(n.distance,L),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&o>0&&(n.velocity=[L[0]/o,L[1]/o],n.timeDelta=o)}}emit(){const e=this.state,n=this.shared,a=this.config;if(e._active||this.clean(),(e._blocked||!e.intentional)&&!e._force&&!a.triggerAllEvents)return;const s=this.handler(D(D(D({},n),e),{},{[this.aliasKey]:e.values}));s!==void 0&&(e.memo=s)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function vr([t,e],n){const a=Math.abs(t),s=Math.abs(e);if(a>s&&a>n)return"x";if(s>a&&s>n)return"y"}class H extends fn{constructor(...e){super(...e),T(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=A.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=A.sub(this.state.offset,this.state.lastOffset)}axisIntent(e){const n=this.state,a=this.config;if(!n.axis&&e){const s=typeof a.axisThreshold=="object"?a.axisThreshold[cn(e)]:a.axisThreshold;n.axis=vr(n._movement,s)}n._blocked=(a.lockDirection||!!a.axis)&&!n.axis||!!a.axis&&a.axis!==n.axis}restrictToAxis(e){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":e[1]=0;break;case"y":e[0]=0;break}}}const yr=t=>t,ut=.15,hn={enabled(t=!0){return t},eventOptions(t,e,n){return D(D({},n.shared.eventOptions),t)},preventDefault(t=!1){return t},triggerAllEvents(t=!1){return t},rubberband(t=0){switch(t){case!0:return[ut,ut];case!1:return[0,0];default:return A.toVector(t)}},from(t){if(typeof t=="function")return t;if(t!=null)return A.toVector(t)},transform(t,e,n){const a=t||n.shared.transform;return this.hasCustomTransform=!!a,a||yr},threshold(t){return A.toVector(t,0)}},br=0,P=D(D({},hn),{},{axis(t,e,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(t=br){return t},bounds(t={}){if(typeof t=="function")return o=>P.bounds(t(o));if("current"in t)return()=>t.current;if(typeof HTMLElement=="function"&&t instanceof HTMLElement)return t;const{left:e=-1/0,right:n=1/0,top:a=-1/0,bottom:s=1/0}=t;return[[e,n],[a,s]]}}),ct={ArrowRight:(t,e=1)=>[t*e,0],ArrowLeft:(t,e=1)=>[-1*t*e,0],ArrowUp:(t,e=1)=>[0,-1*t*e],ArrowDown:(t,e=1)=>[0,t*e]};class Er extends H{constructor(...e){super(...e),T(this,"ingKey","dragging")}reset(){super.reset();const e=this.state;e._pointerId=void 0,e._pointerActive=!1,e._keyboardActive=!1,e._preventScroll=!1,e._delayed=!1,e.swipe=[0,0],e.tap=!1,e.canceled=!1,e.cancel=this.cancel.bind(this)}setup(){const e=this.state;if(e._bounds instanceof HTMLElement){const n=e._bounds.getBoundingClientRect(),a=e.currentTarget.getBoundingClientRect(),s={left:n.left-a.left+e.offset[0],right:n.right-a.right+e.offset[0],top:n.top-a.top+e.offset[1],bottom:n.bottom-a.bottom+e.offset[1]};e._bounds=P.bounds(s)}}cancel(){const e=this.state;e.canceled||(e.canceled=!0,e._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(e){const n=this.config,a=this.state;if(e.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(e.buttons):n.pointerButtons!==-1&&n.pointerButtons!==e.buttons))return;const s=this.ctrl.setEventIds(e);n.pointerCapture&&e.target.setPointerCapture(e.pointerId),!(s&&s.size>1&&a._pointerActive)&&(this.start(e),this.setupPointer(e),a._pointerId=ue(e),a._pointerActive=!0,this.computeValues(Y(e)),this.computeInitial(),n.preventScrollAxis&&cn(e)!=="mouse"?(a._active=!1,this.setupScrollPrevention(e)):n.delay>0?(this.setupDelayTrigger(e),n.triggerAllEvents&&(this.compute(e),this.emit())):this.startPointerDrag(e))}startPointerDrag(e){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(e),this.emit()}pointerMove(e){const n=this.state,a=this.config;if(!n._pointerActive)return;const s=ue(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;const o=Y(e);if(document.pointerLockElement===e.target?n._delta=[e.movementX,e.movementY]:(n._delta=A.sub(o,n._values),this.computeValues(o)),A.addTo(n._movement,n._delta),this.compute(e),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(e);return}if(a.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===a.preventScrollAxis||a.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(e);return}else return;this.emit()}pointerUp(e){this.ctrl.setEventIds(e);try{this.config.pointerCapture&&e.target.hasPointerCapture(e.pointerId)&&e.target.releasePointerCapture(e.pointerId)}catch{}const n=this.state,a=this.config;if(!n._active||!n._pointerActive)return;const s=ue(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(e);const[o,r]=n._distance;if(n.tap=o<=a.tapsThreshold&&r<=a.tapsThreshold,n.tap&&a.filterTaps)n._force=!0;else{const[i,l]=n._delta,[c,u]=n._movement,[d,m]=a.swipe.velocity,[f,g]=a.swipe.distance,b=a.swipe.duration;if(n.elapsedTime<b){const p=Math.abs(i/n.timeDelta),C=Math.abs(l/n.timeDelta);p>d&&Math.abs(c)>f&&(n.swipe[0]=Math.sign(i)),C>m&&Math.abs(u)>g&&(n.swipe[1]=Math.sign(l))}}this.emit()}pointerClick(e){!this.state.tap&&e.detail>0&&(e.preventDefault(),e.stopPropagation())}setupPointer(e){const n=this.config,a=n.device;n.pointerLock&&e.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,a,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(e){this.state._preventScroll&&e.cancelable&&e.preventDefault()}setupScrollPrevention(e){this.state._preventScroll=!1,xr(e);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,e)}setupDelayTrigger(e){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(e)},this.config.delay)}keyDown(e){const n=ct[e.key];if(n){const a=this.state,s=e.shiftKey?10:e.altKey?.1:1;this.start(e),a._delta=n(this.config.keyboardDisplacement,s),a._keyboardActive=!0,A.addTo(a._movement,a._delta),this.compute(e),this.emit()}}keyUp(e){e.key in ct&&(this.state._keyboardActive=!1,this.setActive(),this.compute(e),this.emit())}bind(e){const n=this.config.device;e(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(e(n,"change",this.pointerMove.bind(this)),e(n,"end",this.pointerUp.bind(this)),e(n,"cancel",this.pointerUp.bind(this)),e("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(e("key","down",this.keyDown.bind(this)),e("key","up",this.keyUp.bind(this))),this.config.filterTaps&&e("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function xr(t){"persist"in t&&typeof t.persist=="function"&&t.persist()}const X=typeof window<"u"&&window.document&&window.document.createElement;function pn(){return X&&"ontouchstart"in window}function Cr(){return pn()||X&&window.navigator.maxTouchPoints>1}function Fr(){return X&&"onpointerdown"in window}function Ar(){return X&&"exitPointerLock"in window.document}function Dr(){try{return"constructor"in GestureEvent}catch{return!1}}const _={isBrowser:X,gesture:Dr(),touch:pn(),touchscreen:Cr(),pointer:Fr(),pointerLock:Ar()},Tr=250,Ir=180,Sr=.5,kr=50,_r=250,Br=10,mt={mouse:0,touch:0,pen:8},Mr=D(D({},P),{},{device(t,e,{pointer:{touch:n=!1,lock:a=!1,mouse:s=!1}={}}){return this.pointerLock=a&&_.pointerLock,_.touch&&n?"touch":this.pointerLock?"mouse":_.pointer&&!s?"pointer":_.touch?"touch":"mouse"},preventScrollAxis(t,e,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&t?Tr:void 0,!(!_.touchscreen||n===!1))return t||(n!==void 0?"y":void 0)},pointerCapture(t,e,{pointer:{capture:n=!0,buttons:a=1,keys:s=!0}={}}){return this.pointerButtons=a,this.keys=s,!this.pointerLock&&this.device==="pointer"&&n},threshold(t,e,{filterTaps:n=!1,tapsThreshold:a=3,axis:s=void 0}){const o=A.toVector(t,n?a:s?1:0);return this.filterTaps=n,this.tapsThreshold=a,o},swipe({velocity:t=Sr,distance:e=kr,duration:n=_r}={}){return{velocity:this.transform(A.toVector(t)),distance:this.transform(A.toVector(e)),duration:n}},delay(t=0){switch(t){case!0:return Ir;case!1:return 0;default:return t}},axisThreshold(t){return t?D(D({},mt),t):mt},keyboardDisplacement(t=Br){return t}});function gn(t){const[e,n]=t.overflow,[a,s]=t._delta,[o,r]=t._direction;(e<0&&a>0&&o<0||e>0&&a<0&&o>0)&&(t._movement[0]=t._movementBound[0]),(n<0&&s>0&&r<0||n>0&&s<0&&r>0)&&(t._movement[1]=t._movementBound[1])}const wr=30,jr=100;class Or extends fn{constructor(...e){super(...e),T(this,"ingKey","pinching"),T(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const e=this.state;e._touchIds=[],e.canceled=!1,e.cancel=this.cancel.bind(this),e.turns=0}computeOffset(){const{type:e,movement:n,lastOffset:a}=this.state;e==="wheel"?this.state.offset=A.add(n,a):this.state.offset=[(1+n[0])*a[0],n[1]+a[1]]}computeMovement(){const{offset:e,lastOffset:n}=this.state;this.state.movement=[e[0]/n[0],e[1]-n[1]]}axisIntent(){const e=this.state,[n,a]=e._movement;if(!e.axis){const s=Math.abs(n)*wr-Math.abs(a);s<0?e.axis="angle":s>0&&(e.axis="scale")}}restrictToAxis(e){this.config.lockDirection&&(this.state.axis==="scale"?e[1]=0:this.state.axis==="angle"&&(e[0]=0))}cancel(){const e=this.state;e.canceled||setTimeout(()=>{e.canceled=!0,e._active=!1,this.compute(),this.emit()},0)}touchStart(e){this.ctrl.setEventIds(e);const n=this.state,a=this.ctrl.touchIds;if(n._active&&n._touchIds.every(o=>a.has(o))||a.size<2)return;this.start(e),n._touchIds=Array.from(a).slice(0,2);const s=it(e,n._touchIds);s&&this.pinchStart(e,s)}pointerStart(e){if(e.buttons!=null&&e.buttons%2!==1)return;this.ctrl.setEventIds(e),e.target.setPointerCapture(e.pointerId);const n=this.state,a=n._pointerEvents,s=this.ctrl.pointerIds;if(n._active&&Array.from(a.keys()).every(r=>s.has(r))||(a.size<2&&a.set(e.pointerId,e),n._pointerEvents.size<2))return;this.start(e);const o=Ee(...Array.from(a.values()));o&&this.pinchStart(e,o)}pinchStart(e,n){const a=this.state;a.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(e),this.emit()}touchMove(e){if(!this.state._active)return;const n=it(e,this.state._touchIds);n&&this.pinchMove(e,n)}pointerMove(e){const n=this.state._pointerEvents;if(n.has(e.pointerId)&&n.set(e.pointerId,e),!this.state._active)return;const a=Ee(...Array.from(n.values()));a&&this.pinchMove(e,a)}pinchMove(e,n){const a=this.state,s=a._values[1],o=n.angle-s;let r=0;Math.abs(o)>270&&(r+=Math.sign(o)),this.computeValues([n.distance,n.angle-360*r]),a.origin=n.origin,a.turns=r,a._movement=[a._values[0]/a._initial[0]-1,a._values[1]-a._initial[1]],this.compute(e),this.emit()}touchEnd(e){this.ctrl.setEventIds(e),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(e),this.emit())}pointerEnd(e){const n=this.state;this.ctrl.setEventIds(e);try{e.target.releasePointerCapture(e.pointerId)}catch{}n._pointerEvents.has(e.pointerId)&&n._pointerEvents.delete(e.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(e),this.emit())}gestureStart(e){e.cancelable&&e.preventDefault();const n=this.state;n._active||(this.start(e),this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY],this.compute(e),this.emit())}gestureMove(e){if(e.cancelable&&e.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY];const a=n._movement;n._movement=[e.scale-1,e.rotation],n._delta=A.sub(n._movement,a),this.compute(e),this.emit()}gestureEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}wheel(e){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(a=>e[a]):!e[n])||(this.state._active?this.wheelChange(e):this.wheelStart(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(e){this.start(e),this.wheelChange(e)}wheelChange(e){"uv"in e||e.cancelable&&e.preventDefault();const a=this.state;a._delta=[-dn(e)[1]/jr*a.offset[0],0],A.addTo(a._movement,a._delta),gn(a),this.state.origin=[e.clientX,e.clientY],this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){const n=this.config.device;n&&(e(n,"start",this[n+"Start"].bind(this)),e(n,"change",this[n+"Move"].bind(this)),e(n,"end",this[n+"End"].bind(this)),e(n,"cancel",this[n+"End"].bind(this)),e("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&e("wheel","",this.wheel.bind(this),{passive:!1})}}const Lr=D(D({},hn),{},{device(t,e,{shared:n,pointer:{touch:a=!1}={}}){if(n.target&&!_.touch&&_.gesture)return"gesture";if(_.touch&&a)return"touch";if(_.touchscreen){if(_.pointer)return"pointer";if(_.touch)return"touch"}},bounds(t,e,{scaleBounds:n={},angleBounds:a={}}){const s=r=>{const i=lt(Q(n,r),{min:-1/0,max:1/0});return[i.min,i.max]},o=r=>{const i=lt(Q(a,r),{min:-1/0,max:1/0});return[i.min,i.max]};return typeof n!="function"&&typeof a!="function"?[s(),o()]:r=>[s(r),o(r)]},threshold(t,e,n){return this.lockDirection=n.axis==="lock",A.toVector(t,this.lockDirection?[.1,3]:0)},modifierKey(t){return t===void 0?"ctrlKey":t},pinchOnWheel(t=!0){return t}});class Pr extends H{constructor(...e){super(...e),T(this,"ingKey","moving")}move(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.state._active?this.moveChange(e):this.moveStart(e),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(e){this.start(e),this.computeValues(Y(e)),this.compute(e),this.computeInitial(),this.emit()}moveChange(e){if(!this.state._active)return;const n=Y(e),a=this.state;a._delta=A.sub(n,a._values),A.addTo(a._movement,a._delta),this.computeValues(n),this.compute(e),this.emit()}moveEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}bind(e){e("pointer","change",this.move.bind(this)),e("pointer","leave",this.moveEnd.bind(this))}}const Rr=D(D({},P),{},{mouseOnly:(t=!0)=>t});class $r extends H{constructor(...e){super(...e),T(this,"ingKey","scrolling")}scroll(e){this.state._active||this.start(e),this.scrollChange(e),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(e){e.cancelable&&e.preventDefault();const n=this.state,a=dr(e);n._delta=A.sub(a,n._values),A.addTo(n._movement,n._delta),this.computeValues(a),this.compute(e),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("scroll","",this.scroll.bind(this))}}const Nr=P;class Yr extends H{constructor(...e){super(...e),T(this,"ingKey","wheeling")}wheel(e){this.state._active||this.start(e),this.wheelChange(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(e){const n=this.state;n._delta=dn(e),A.addTo(n._movement,n._delta),gn(n),this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("wheel","",this.wheel.bind(this))}}const Gr=P;class zr extends H{constructor(...e){super(...e),T(this,"ingKey","hovering")}enter(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.start(e),this.computeValues(Y(e)),this.compute(e),this.emit())}leave(e){if(this.config.mouseOnly&&e.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const a=Y(e);n._movement=n._delta=A.sub(a,n._values),this.computeValues(a),this.compute(e),n.delta=n.movement,this.emit()}bind(e){e("pointer","enter",this.enter.bind(this)),e("pointer","leave",this.leave.bind(this))}}const Ur=D(D({},P),{},{mouseOnly:(t=!0)=>t}),Be=new Map,xe=new Map;function Hr(t){Be.set(t.key,t.engine),xe.set(t.key,t.resolver)}const Xr={key:"drag",engine:Er,resolver:Mr},Vr={key:"hover",engine:zr,resolver:Ur},qr={key:"move",engine:Pr,resolver:Rr},Wr={key:"pinch",engine:Or,resolver:Lr},Kr={key:"scroll",engine:$r,resolver:Nr},Zr={key:"wheel",engine:Yr,resolver:Gr};function Jr(t,e){if(t==null)return{};var n={},a=Object.keys(t),s,o;for(o=0;o<a.length;o++)s=a[o],!(e.indexOf(s)>=0)&&(n[s]=t[s]);return n}function Qr(t,e){if(t==null)return{};var n=Jr(t,e),a,s;if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(t);for(s=0;s<o.length;s++)a=o[s],!(e.indexOf(a)>=0)&&Object.prototype.propertyIsEnumerable.call(t,a)&&(n[a]=t[a])}return n}const eo={target(t){if(t)return()=>"current"in t?t.current:t},enabled(t=!0){return t},window(t=_.isBrowser?window:void 0){return t},eventOptions({passive:t=!0,capture:e=!1}={}){return{passive:t,capture:e}},transform(t){return t}},to=["target","eventOptions","window","enabled","transform"];function J(t={},e){const n={};for(const[a,s]of Object.entries(e))switch(typeof s){case"function":n[a]=s.call(n,t[a],a,t);break;case"object":n[a]=J(t[a],s);break;case"boolean":s&&(n[a]=t[a]);break}return n}function no(t,e,n={}){const a=t,{target:s,eventOptions:o,window:r,enabled:i,transform:l}=a,c=Qr(a,to);if(n.shared=J({target:s,eventOptions:o,window:r,enabled:i,transform:l},eo),e){const u=xe.get(e);n[e]=J(D({shared:n.shared},c),u)}else for(const u in c){const d=xe.get(u);d&&(n[u]=J(D({shared:n.shared},c[u]),d))}return n}class vn{constructor(e,n){T(this,"_listeners",new Set),this._ctrl=e,this._gestureKey=n}add(e,n,a,s,o){const r=this._listeners,i=lr(n,a),l=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},c=D(D({},l),o);e.addEventListener(i,s,c);const u=()=>{e.removeEventListener(i,s,c),r.delete(u)};return r.add(u),u}clean(){this._listeners.forEach(e=>e()),this._listeners.clear()}}class ao{constructor(){T(this,"_timeouts",new Map)}add(e,n,a=140,...s){this.remove(e),this._timeouts.set(e,window.setTimeout(n,a,...s))}remove(e){const n=this._timeouts.get(e);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(e=>void window.clearTimeout(e)),this._timeouts.clear()}}class so{constructor(e){T(this,"gestures",new Set),T(this,"_targetEventStore",new vn(this)),T(this,"gestureEventStores",{}),T(this,"gestureTimeoutStores",{}),T(this,"handlers",{}),T(this,"config",{}),T(this,"pointerIds",new Set),T(this,"touchIds",new Set),T(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),io(this,e)}setEventIds(e){if(ae(e))return this.touchIds=new Set(mr(e)),this.touchIds;if("pointerId"in e)return e.type==="pointerup"||e.type==="pointercancel"?this.pointerIds.delete(e.pointerId):e.type==="pointerdown"&&this.pointerIds.add(e.pointerId),this.pointerIds}applyHandlers(e,n){this.handlers=e,this.nativeHandlers=n}applyConfig(e,n){this.config=no(e,n,this.config)}clean(){this._targetEventStore.clean();for(const e of this.gestures)this.gestureEventStores[e].clean(),this.gestureTimeoutStores[e].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...e){const n=this.config.shared,a={};let s;if(!(n.target&&(s=n.target(),!s))){if(n.enabled){for(const r of this.gestures){const i=this.config[r],l=dt(a,i.eventOptions,!!s);if(i.enabled){const c=Be.get(r);new c(this,e,r).bind(l)}}const o=dt(a,n.eventOptions,!!s);for(const r in this.nativeHandlers)o(r,"",i=>this.nativeHandlers[r](D(D({},this.state.shared),{},{event:i,args:e})),void 0,!0)}for(const o in a)a[o]=pr(...a[o]);if(!s)return a;for(const o in a){const{device:r,capture:i,passive:l}=or(o);this._targetEventStore.add(s,r,"",a[o],{capture:i,passive:l})}}}}function R(t,e){t.gestures.add(e),t.gestureEventStores[e]=new vn(t,e),t.gestureTimeoutStores[e]=new ao}function io(t,e){e.drag&&R(t,"drag"),e.wheel&&R(t,"wheel"),e.scroll&&R(t,"scroll"),e.move&&R(t,"move"),e.pinch&&R(t,"pinch"),e.hover&&R(t,"hover")}const dt=(t,e,n)=>(a,s,o,r={},i=!1)=>{var l,c;const u=(l=r.capture)!==null&&l!==void 0?l:e.capture,d=(c=r.passive)!==null&&c!==void 0?c:e.passive;let m=i?a:ir(a,s,u);n&&d&&(m+="Passive"),t[m]=t[m]||[],t[m].push(o)},ro=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function oo(t){const e={},n={},a=new Set;for(let s in t)ro.test(s)?(a.add(RegExp.lastMatch),n[s]=t[s]):e[s]=t[s];return[n,e,a]}function $(t,e,n,a,s,o){if(!t.has(n)||!Be.has(a))return;const r=n+"Start",i=n+"End",l=c=>{let u;return c.first&&r in e&&e[r](c),n in e&&(u=e[n](c)),c.last&&i in e&&e[i](c),u};s[a]=l,o[a]=o[a]||{}}function lo(t,e){const[n,a,s]=oo(t),o={};return $(s,n,"onDrag","drag",o,e),$(s,n,"onWheel","wheel",o,e),$(s,n,"onScroll","scroll",o,e),$(s,n,"onPinch","pinch",o,e),$(s,n,"onMove","move",o,e),$(s,n,"onHover","hover",o,e),{handlers:o,config:e,nativeHandlers:a}}function uo(t,e={},n,a){const s=G.useMemo(()=>new so(t),[]);if(s.applyHandlers(t,a),s.applyConfig(e,n),G.useEffect(s.effect.bind(s)),G.useEffect(()=>s.clean.bind(s),[]),e.target===void 0)return s.bind.bind(s)}function co(t){return t.forEach(Hr),function(n,a){const{handlers:s,nativeHandlers:o,config:r}=lo(n,a||{});return uo(s,r,void 0,o)}}function mo(t,e){return co([Xr,Wr,Kr,Zr,qr,Vr])(t,e||{})}function fo(t){U("translateViewport",t)}function ho(t){ne("translateViewport",t)}function po({children:t}){const e=v.useRef(null),[n,a]=v.useState(1),[s,o]=v.useState({x:0,y:0}),[r,i]=v.useState(!1);return mo({onPinch({origin:l,delta:c,pinching:u}){var b;i(u);const d=Math.max(n+c[0],.1),m=(b=e.current)==null?void 0:b.getBoundingClientRect(),f=l[0]-((m==null?void 0:m.left)??0),g=l[1]-((m==null?void 0:m.top)??0);o({x:s.x-(f/n-f/d),y:s.y-(g/n-g/d)}),a(d)},onWheel({event:l,delta:[c,u],wheeling:d}){l.preventDefault(),i(d),o({x:s.x-c/n,y:s.y-u/n})}},{target:e,eventOptions:{passive:!1}}),ho(l=>{const c=window.innerWidth,u=window.innerHeight,d=c/2-l.x*n,m=u/2-l.y*n;o({x:d/n,y:m/n})}),h.jsx(go,{children:h.jsx(vo,{ref:e,children:h.jsx(yo,{style:{"--zoom":n,"--translate-x":s.x,"--translate-y":s.y},"data-is-interacting":r,children:t})})})}const go=x.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,vo=x.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,yo=x.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function yn(t){return Object.fromEntries(t.states.map(e=>[e.id,e.population]))}function bn({worldState:t,setWorldState:e}){const n=t.states.find(i=>i.isPlayerControlled);if(!n)return null;const a=(i,l)=>{const c=t.states.map(u=>u.id===n.id?{...u,strategies:{...u.strategies,[i]:l}}:u);e({...t,states:c})},s=i=>{if(i===n.id)return"#4CAF50";switch(n.strategies[i]){case y.FRIENDLY:return"#4CAF50";case y.NEUTRAL:return"#FFC107";case y.HOSTILE:return"#F44336";default:return"#9E9E9E"}},o=yn(t),r=i=>{const l=t.cities.filter(f=>f.stateId===i),c=t.launchSites.filter(f=>f.stateId===i);if(l.length===0&&c.length===0){console.warn("No position information available for this state");return}const u=[...l.map(f=>f.position),...c.map(f=>f.position)],d=u.reduce((f,g)=>({x:f.x+g.x,y:f.y+g.y}),{x:0,y:0}),m={x:d.x/u.length,y:d.y/u.length};fo(m)};return h.jsx(bo,{children:t.states.map(i=>h.jsxs(Eo,{relationshipColor:s(i.id),onClick:()=>r(i.id),children:[h.jsx(xo,{children:i.name.charAt(0)}),h.jsxs(Co,{children:[h.jsx(Fo,{children:i.name}),h.jsx(Ao,{children:o[i.id]<<0}),i.id!==n.id?h.jsx("select",{value:n.strategies[i.id],onClick:l=>l.stopPropagation(),onChange:l=>a(i.id,l.target.value),children:Object.values(y).map(l=>h.jsx("option",{value:l,children:l},l))}):"This is you"]})]},i.id))})}const bo=x.div`
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
`,Eo=x.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 5px;
  background: ${t=>`rgba(${parseInt(t.relationshipColor.slice(1,3),16)}, ${parseInt(t.relationshipColor.slice(3,5),16)}, ${parseInt(t.relationshipColor.slice(5,7),16)}, 0.2)`};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,xo=x.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,Co=x.div`
  display: flex;
  flex-direction: column;
`,Fo=x.span`
  font-weight: bold;
  margin-bottom: 5px;
`,Ao=x.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`;function Do({worldState:t,setWorldState:e}){return h.jsx(Di,{children:h.jsxs(Ci,{children:[h.jsx(po,{children:h.jsx(Zi,{state:t})}),h.jsx(bn,{worldState:t,setWorldState:e})]})})}const En="fullScreenMessage",xn="fullScreenMessageAction";function w(t,e,n,a="",s,o,r){U(En,{message:t,startTimestamp:e,endTimestamp:n,messageId:a,actions:s,prompt:o,fullScreen:r??!!(s!=null&&s.length)})}function Cn(t,e){U(xn,{messageId:t,actionId:e})}function Fn(t){ne(En,e=>{t(e)})}function Me(t){ne(xn,e=>{t(e)})}function To({worldState:t,onGameOver:e}){const[n,a]=v.useState(null),[s,o]=v.useState(!1);return v.useEffect(()=>{var f;if(s)return;const r=yn(t),i=Object.values(r).filter(g=>g>0).length,l=t.launchSites.length===0,c=t.timestamp,u=t.states.filter(g=>r[g.id]>0&&Object.entries(g.strategies).filter(([b,p])=>r[b]>0&&p===y.HOSTILE).length>0),d=t.launchSites.some(g=>g.lastLaunchTimestamp&&c-g.lastLaunchTimestamp<ie),m=ie-c;if(!u.length&&!d&&m>0&&m<=10&&(n?w(`Game will end in ${Math.ceil(m)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):a(c)),i<=1||l||!u.length&&!d&&c>ie){const g=i===1?(f=t.states.find(b=>r[b.id]>0))==null?void 0:f.id:void 0;o(!0),w(["Game Over!","Results will be shown shortly..."],c,c+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{e({populations:r,winner:g,stateNames:Object.fromEntries(t.states.map(b=>[b.id,b.name])),playerStateId:t.states.find(b=>b.isPlayerControlled).id})},5e3)}},[t,e,n,s]),null}const Io="/assets/player-lost-background-D2A_VJ6-.png",So="/assets/player-won-background-CkXgF24i.png",ft="/assets/draw-background-EwLQ9g28.png",ko=x.div`
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
`,_o=({setGameState:t})=>{const{state:{result:e}}=pt(),n=()=>{t(ee,{stateName:e.stateNames[e.playerStateId]})};let a,s;return e.winner?e.winner===e.playerStateId?(a=So,s=`Congratulations! ${e.stateNames[e.playerStateId]} has won with ${e.populations[e.playerStateId]<<0} population alive.`):e.winner!==void 0?(a=Io,s=`${e.stateNames[e.winner]} has won with ${e.populations[e.winner]<<0} population alive. Your state has fallen.`):(a=ft,s="The game has ended in an unexpected state."):(a=ft,s="It's a draw! The world is partially destroyed, but there's still hope."),h.jsx(ko,{backgroundImage:a,children:h.jsxs("div",{children:[h.jsx("h2",{children:"Game Over"}),h.jsx("p",{children:s}),h.jsx("button",{onClick:n,children:"Play Again"}),h.jsx("br",{}),h.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Ce={Component:_o,path:"played"};function Bo({worldState:t}){var c;const[e,n]=v.useState([]),[a,s]=v.useState(null);Fn(u=>{n(d=>u.messageId&&d.find(m=>m.messageId===u.messageId)?[...d.map(m=>m.messageId===u.messageId?u:m)]:[u,...d])});const o=e.sort((u,d)=>u.actions&&!d.actions?-1:!u.actions&&d.actions?1:u.startTimestamp-d.startTimestamp);if(Me(u=>{n(d=>d.filter(m=>m.messageId!==u.messageId))}),v.useEffect(()=>{const u=o.find(d=>d.fullScreen&&d.startTimestamp<=t.timestamp&&d.endTimestamp>t.timestamp);s(u||null)},[o,t.timestamp]),!a)return null;const i=((u,d)=>d<u.startTimestamp?"pre":d<u.startTimestamp+.5?"pre-in":d>u.endTimestamp-.5?"post-in":d>u.endTimestamp?"post":"active")(a,t.timestamp),l=u=>Array.isArray(u)?u.map((d,m)=>h.jsx("div",{children:d},m)):u;return h.jsxs(jo,{"data-message-state":i,"data-action":(((c=a.actions)==null?void 0:c.length)??0)>0,children:[h.jsx(Oo,{children:l(a.message)}),a.prompt&&a.actions&&h.jsx(Lo,{children:a.actions.map((u,d)=>h.jsx(Po,{onClick:()=>Cn(a.messageId,u.id),children:u.text},d))})]})}const Mo=te`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`,wo=te`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: scale(0.9);
  }
`,jo=x.div`
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
    animation: ${Mo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${wo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,Oo=x.div`
  font-size: 2rem;
  color: white;
  text-align: center;
  max-width: 80%;
  white-space: pre-line;
`,Lo=x.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,Po=x.button`
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
`,An="ALLIANCEPROPOSAL";function Ro(t,e,n,a=!1){const s=`${An}_${t.id}_${e.id}`,o=a?`${t.name} has become friendly towards you. Do you want to form an alliance?`:`${t.name} proposes an alliance with ${e.name}. Do you accept?`,r=n.timestamp,i=r+10;w(o,r,i,s,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function $o({worldState:t,setWorldState:e}){return Me(n=>{if(n.messageId.startsWith(An)){const[,a,s]=n.messageId.split("_"),o=t.states.find(i=>i.id===a),r=t.states.find(i=>i.id===s);if(!o||!(r!=null&&r.isPlayerControlled))return;if(n.actionId==="accept"){const i=t.states.map(l=>l.id===a||l.id===s?{...l,strategies:{...l.strategies,[a]:y.FRIENDLY,[s]:y.FRIENDLY}}:l);e({...t,states:i}),w(`Alliance formed between ${o.name} and ${r.name}!`,t.timestamp,t.timestamp+5)}else n.actionId==="reject"&&w(`${r.name} has rejected the alliance proposal from ${o.name}.`,t.timestamp,t.timestamp+5)}}),null}function No({worldState:t}){const e=t.states.find(f=>f.isPlayerControlled),[n,a]=v.useState(!1),[s,o]=v.useState({}),[r,i]=v.useState([]),[l,c]=v.useState([]),[u,d]=v.useState(!1),m=Math.round(t.timestamp*10)/10;return v.useEffect(()=>{!n&&t.timestamp>0&&(a(!0),w("The game has started!",t.timestamp,t.timestamp+3))},[m]),v.useEffect(()=>{var f,g,b,p;if(e){const C=Object.fromEntries(t.states.map(E=>[E.id,E.strategies]));for(const E of t.states)for(const F of t.states.filter(se=>se.id!==E.id))e&&F.id===e.id&&E.strategies[F.id]===y.FRIENDLY&&F.strategies[E.id]!==y.FRIENDLY&&((f=s[E.id])==null?void 0:f[F.id])!==y.FRIENDLY&&Ro(E,e,t,!0),F.strategies[E.id]===y.FRIENDLY&&E.strategies[F.id]===y.FRIENDLY&&(((g=s[F.id])==null?void 0:g[E.id])!==y.FRIENDLY||((b=s[E.id])==null?void 0:b[F.id])!==y.FRIENDLY)&&w(`${F.name} has formed alliance with ${E.isPlayerControlled?"you":E.name}!`,m,m+3),E.strategies[F.id]===y.HOSTILE&&((p=s[E.id])==null?void 0:p[F.id])!==y.HOSTILE&&w(F.isPlayerControlled?`${E.name} has declared war on You!`:`${E.isPlayerControlled?"You have":E.name} declared war on ${F.name}!`,m,m+3,void 0,void 0,void 0,E.isPlayerControlled||F.isPlayerControlled);o(C)}},[m]),v.useEffect(()=>{e&&t.cities.forEach(f=>{const g=r.find(E=>E.id===f.id);if(!g)return;const b=f.population||0,p=g.population,C=Math.floor(p-b);C>0&&(f.stateId===e.id&&w(b===0?`Your city ${f.name} has been destroyed!`:[`Your city ${f.name} has been hit!`,`${C} casualties reported.`],m,m+3,void 0,void 0,!1,!0),U("cityDamage"))}),i(t.cities.map(f=>({...f})))},[m]),v.useEffect(()=>{if(e){const f=t.launchSites.filter(g=>g.stateId===e.id);l.length>0&&l.filter(b=>!f.some(p=>p.id===b.id)).forEach(()=>{w("One of your launch sites has been destroyed!",m,m+3,void 0,void 0,!1,!0)}),c(f)}},[m]),v.useEffect(()=>{if(e&&!u){const f=t.cities.filter(p=>p.stateId===e.id),g=t.launchSites.filter(p=>p.stateId===e.id);!f.some(p=>p.population>0)&&g.length===0&&(w(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],m,m+5,void 0,void 0,!1,!0),d(!0))}},[m]),null}function Yo({worldState:t}){const[e,n]=v.useState([]);Fn(r=>{n(i=>r.messageId&&i.find(l=>l.messageId===r.messageId)?[...i.map(l=>l.messageId===r.messageId?r:l)]:[r,...i])}),Me(r=>{n(i=>i.filter(l=>l.messageId!==r.messageId))});const a=r=>Array.isArray(r)?r.map((i,l)=>h.jsx("div",{children:i},l)):r,s=(r,i)=>{const u=i-r;return u>60?0:u>50?1-(u-50)/10:1},o=v.useMemo(()=>{const r=t.timestamp,i=60;return e.filter(l=>{const c=l.startTimestamp||0;return r-c<=i}).map(l=>({...l,opacity:s(l.startTimestamp||0,r)}))},[e,t.timestamp]);return h.jsx(Go,{children:o.map((r,i)=>h.jsxs(zo,{style:{opacity:r.opacity},children:[h.jsx("div",{children:a(r.message)}),r.prompt&&r.actions&&h.jsx(Uo,{children:r.actions.map((l,c)=>h.jsx(Ho,{onClick:()=>Cn(r.messageId,l.id),children:l.text},c))})]},i))})}const Go=x.div`
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
`,zo=x.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,Uo=x.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,Ho=x.button`
  font-size: 12px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function Xo({updateWorldTime:t,currentWorldTime:e}){const[n,a]=v.useState(!1),s=v.useRef(null);ln(r=>{if(!s.current){s.current=r;return}const i=r-s.current;s.current=r,!(i<=0)&&n&&t(i/1e3)},!0);const o=r=>{const i=Math.floor(r/86400),l=Math.floor(r%86400/3600),c=Math.floor(r%3600/60),u=Math.floor(r%60);return[[i,"d"],[l,"h"],[c,"m"],[u,"s"]].filter(([d])=>!!d).map(([d,m])=>String(d)+m).join(" ")};return h.jsx(Vo,{children:h.jsxs(qo,{children:[h.jsxs(Wo,{children:[e>0?"Current Time: ":"Game not started yet",o(e)]}),h.jsx(W,{onClick:()=>t(1),children:"+1s"}),h.jsx(W,{onClick:()=>t(10),children:"+10s"}),h.jsx(W,{onClick:()=>t(60),children:"+1m"}),h.jsx(W,{onClick:()=>a(!n),children:n?"Stop":"Start"})]})})}const Vo=x.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,qo=x.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,W=x.button`
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
`,Wo=x.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`,Ko=({setGameState:t})=>{const{state:{stateName:e}}=pt(),{worldState:n,setWorldState:a,updateWorldState:s}=bi(e);return h.jsxs(h.Fragment,{children:[h.jsx(Do,{worldState:n,setWorldState:a}),h.jsx(Xo,{updateWorldTime:o=>s(n,o),currentWorldTime:n.timestamp??0}),h.jsx(bn,{worldState:n,setWorldState:a}),h.jsx(Bo,{worldState:n}),h.jsx(Yo,{worldState:n}),h.jsx(To,{worldState:n,onGameOver:o=>t(Ce,{result:o})}),h.jsx(No,{worldState:n}),h.jsx($o,{worldState:n,setWorldState:a})]})},ee={Component:Ko,path:"playing"},Zo="/assets/play-background-BASXrsIB.png",Jo=x.div`
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
    background-image: url(${Zo});
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
`,Qo=({setGameState:t})=>{const[e,n]=v.useState(an(1)[0]),a=()=>{t(ee,{stateName:e})};return h.jsx(Jo,{children:h.jsxs("div",{children:[h.jsx("h1",{children:"Name your state:"}),h.jsx("input",{type:"text",placeholder:"Type your state name here",value:e,onChange:s=>n(s.currentTarget.value)}),h.jsx("br",{}),h.jsx("button",{onClick:a,disabled:!e,children:"Start game"}),h.jsx("br",{}),h.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},Fe={Component:Qo,path:"play"},el="/assets/intro-background-D_km5uka.png",tl="/assets/nukes-game-title-vcFxx9vI.png",nl=te`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,al=te`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,sl=x.div`
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
    background-image: url(${el});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${nl} 60s ease-in-out infinite;
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
`,il=x.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${t=>t.isFlashing?1:0};
  animation: ${t=>t.isFlashing?al:"none"} 4.5s forwards;
`,rl=x.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,ol=x.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,ll=({setGameState:t})=>{const[e,n]=v.useState(!0);return v.useEffect(()=>{const a=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(a)},[]),h.jsxs(sl,{children:[h.jsx(il,{isFlashing:e}),!e&&h.jsxs(rl,{children:[h.jsx(ol,{src:tl,alt:"Nukes game"}),h.jsx("button",{onClick:()=>t(Fe),children:"Play"})]})]})},ht={Component:ll,path:""},ul=_n`
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
`,cl=[{path:ht.path,element:h.jsx(K,{state:ht})},{path:Fe.path,element:h.jsx(K,{state:Fe})},{path:ee.path,element:h.jsx(K,{state:ee})},{path:Ce.path,element:h.jsx(K,{state:Ce})}];function fl(){var n;const[t]=Sn(),e=t.get("path")??"";return h.jsx(h.Fragment,{children:(n=cl.find(a=>a.path===e))==null?void 0:n.element})}function K({state:t}){const e=kn();return h.jsxs(h.Fragment,{children:[h.jsx(ul,{}),h.jsx(t.Component,{setGameState:(n,a)=>e({search:"path="+n.path},{state:a})})]})}export{fl as NukesApp,cl as routes};
