import{c as _,g as En,r as g,j as d,R as N,u as ct,a as xn,b as Fn}from"./index-B1PeOR4d.js";import{d as b,m as J,f as Cn}from"./styled-components.browser.esm-BU2tf8Mk.js";var v=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(v||{}),mt=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(mt||{}),B=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(B||{});function An(t,e,n){const a=[],s=Array(n).fill(null).map(()=>Array(e).fill(!1));for(let r=0;r<n;r++)for(let i=0;i<e;i++){const o=r*e+i;t[o].type===B.WATER&&Dn(i,r,e,n,t)&&(a.push([i,r,0]),s[r][i]=!0)}for(;a.length>0;){const[r,i,o]=a.shift(),u=i*e+r;t[u].type===B.WATER?t[u].depth=o+(Math.random()-Math.random())/5:t[u].type===B.GROUND&&(t[u].height=Math.sqrt(o)+(Math.random()-Math.random())/10);const c=[[-1,0],[1,0],[0,-1],[0,1]];for(const[l,m]of c){const f=r+l,p=i+m;dt(f,p,e,n)&&!s[p][f]&&(a.push([f,p,o+1]),s[p][f]=!0)}}}function Dn(t,e,n,a,s){return[[-1,0],[1,0],[0,-1],[0,1]].some(([i,o])=>{const u=t+i,c=e+o;if(dt(u,c,n,a)){const l=c*n+u;return s[l].type===B.GROUND}return!1})}function dt(t,e,n,a){return t>=0&&t<n&&e>=0&&e<a}var ft={exports:{}},kn=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(t){var e=kn,n=e.filter(function(s){return!!s.css}),a=e.filter(function(s){return!!s.vga});t.exports=function(s){var r=t.exports.get(s);return r&&r.value},t.exports.get=function(s){return s=s||"",s=s.trim().toLowerCase(),e.filter(function(r){return r.name.toLowerCase()===s}).pop()},t.exports.all=t.exports.get.all=function(){return e},t.exports.get.css=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),n.filter(function(r){return r.name.toLowerCase()===s}).pop()):n},t.exports.get.vga=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),a.filter(function(r){return r.name.toLowerCase()===s}).pop()):a}})(ft);var Sn=ft.exports,Tn=1/0,_n="[object Symbol]",Bn=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,ht="\\ud800-\\udfff",In="\\u0300-\\u036f\\ufe20-\\ufe23",wn="\\u20d0-\\u20f0",pt="\\u2700-\\u27bf",gt="a-z\\xdf-\\xf6\\xf8-\\xff",Mn="\\xac\\xb1\\xd7\\xf7",jn="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",On="\\u2000-\\u206f",Ln=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",vt="A-Z\\xc0-\\xd6\\xd8-\\xde",Pn="\\ufe0e\\ufe0f",yt=Mn+jn+On+Ln,bt="['’]",_e="["+yt+"]",Rn="["+In+wn+"]",Et="\\d+",$n="["+pt+"]",xt="["+gt+"]",Ft="[^"+ht+yt+Et+pt+gt+vt+"]",Nn="\\ud83c[\\udffb-\\udfff]",Yn="(?:"+Rn+"|"+Nn+")",Gn="[^"+ht+"]",Ct="(?:\\ud83c[\\udde6-\\uddff]){2}",At="[\\ud800-\\udbff][\\udc00-\\udfff]",R="["+vt+"]",zn="\\u200d",Be="(?:"+xt+"|"+Ft+")",Un="(?:"+R+"|"+Ft+")",Ie="(?:"+bt+"(?:d|ll|m|re|s|t|ve))?",we="(?:"+bt+"(?:D|LL|M|RE|S|T|VE))?",Dt=Yn+"?",kt="["+Pn+"]?",Hn="(?:"+zn+"(?:"+[Gn,Ct,At].join("|")+")"+kt+Dt+")*",Xn=kt+Dt+Hn,Vn="(?:"+[$n,Ct,At].join("|")+")"+Xn,Wn=RegExp([R+"?"+xt+"+"+Ie+"(?="+[_e,R,"$"].join("|")+")",Un+"+"+we+"(?="+[_e,R+Be,"$"].join("|")+")",R+"?"+Be+"+"+Ie,R+"+"+we,Et,Vn].join("|"),"g"),qn=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,Kn=typeof _=="object"&&_&&_.Object===Object&&_,Zn=typeof self=="object"&&self&&self.Object===Object&&self,Jn=Kn||Zn||Function("return this")();function Qn(t){return t.match(Bn)||[]}function ea(t){return qn.test(t)}function ta(t){return t.match(Wn)||[]}var na=Object.prototype,aa=na.toString,Me=Jn.Symbol,je=Me?Me.prototype:void 0,Oe=je?je.toString:void 0;function sa(t){if(typeof t=="string")return t;if(ia(t))return Oe?Oe.call(t):"";var e=t+"";return e=="0"&&1/t==-Tn?"-0":e}function ra(t){return!!t&&typeof t=="object"}function ia(t){return typeof t=="symbol"||ra(t)&&aa.call(t)==_n}function oa(t){return t==null?"":sa(t)}function ua(t,e,n){return t=oa(t),e=n?void 0:e,e===void 0?ea(t)?ta(t):Qn(t):t.match(e)||[]}var la=ua,ca=1/0,ma="[object Symbol]",da=/^\s+/,Ee="\\ud800-\\udfff",St="\\u0300-\\u036f\\ufe20-\\ufe23",Tt="\\u20d0-\\u20f0",_t="\\ufe0e\\ufe0f",fa="["+Ee+"]",ie="["+St+Tt+"]",oe="\\ud83c[\\udffb-\\udfff]",ha="(?:"+ie+"|"+oe+")",Bt="[^"+Ee+"]",It="(?:\\ud83c[\\udde6-\\uddff]){2}",wt="[\\ud800-\\udbff][\\udc00-\\udfff]",Mt="\\u200d",jt=ha+"?",Ot="["+_t+"]?",pa="(?:"+Mt+"(?:"+[Bt,It,wt].join("|")+")"+Ot+jt+")*",ga=Ot+jt+pa,va="(?:"+[Bt+ie+"?",ie,It,wt,fa].join("|")+")",ya=RegExp(oe+"(?="+oe+")|"+va+ga,"g"),ba=RegExp("["+Mt+Ee+St+Tt+_t+"]"),Ea=typeof _=="object"&&_&&_.Object===Object&&_,xa=typeof self=="object"&&self&&self.Object===Object&&self,Fa=Ea||xa||Function("return this")();function Ca(t){return t.split("")}function Aa(t,e,n,a){for(var s=t.length,r=n+-1;++r<s;)if(e(t[r],r,t))return r;return-1}function Da(t,e,n){if(e!==e)return Aa(t,ka,n);for(var a=n-1,s=t.length;++a<s;)if(t[a]===e)return a;return-1}function ka(t){return t!==t}function Sa(t,e){for(var n=-1,a=t.length;++n<a&&Da(e,t[n],0)>-1;);return n}function Ta(t){return ba.test(t)}function Le(t){return Ta(t)?_a(t):Ca(t)}function _a(t){return t.match(ya)||[]}var Ba=Object.prototype,Ia=Ba.toString,Pe=Fa.Symbol,Re=Pe?Pe.prototype:void 0,$e=Re?Re.toString:void 0;function wa(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var r=Array(s);++a<s;)r[a]=t[a+e];return r}function Lt(t){if(typeof t=="string")return t;if(Oa(t))return $e?$e.call(t):"";var e=t+"";return e=="0"&&1/t==-ca?"-0":e}function Ma(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:wa(t,e,n)}function ja(t){return!!t&&typeof t=="object"}function Oa(t){return typeof t=="symbol"||ja(t)&&Ia.call(t)==ma}function La(t){return t==null?"":Lt(t)}function Pa(t,e,n){if(t=La(t),t&&(n||e===void 0))return t.replace(da,"");if(!t||!(e=Lt(e)))return t;var a=Le(t),s=Sa(a,Le(e));return Ma(a,s).join("")}var Ra=Pa,ue=1/0,$a=9007199254740991,Na=17976931348623157e292,Ne=NaN,Ya="[object Symbol]",Ga=/^\s+|\s+$/g,za=/^[-+]0x[0-9a-f]+$/i,Ua=/^0b[01]+$/i,Ha=/^0o[0-7]+$/i,xe="\\ud800-\\udfff",Pt="\\u0300-\\u036f\\ufe20-\\ufe23",Rt="\\u20d0-\\u20f0",$t="\\ufe0e\\ufe0f",Xa="["+xe+"]",le="["+Pt+Rt+"]",ce="\\ud83c[\\udffb-\\udfff]",Va="(?:"+le+"|"+ce+")",Nt="[^"+xe+"]",Yt="(?:\\ud83c[\\udde6-\\uddff]){2}",Gt="[\\ud800-\\udbff][\\udc00-\\udfff]",zt="\\u200d",Ut=Va+"?",Ht="["+$t+"]?",Wa="(?:"+zt+"(?:"+[Nt,Yt,Gt].join("|")+")"+Ht+Ut+")*",qa=Ht+Ut+Wa,Ka="(?:"+[Nt+le+"?",le,Yt,Gt,Xa].join("|")+")",me=RegExp(ce+"(?="+ce+")|"+Ka+qa,"g"),Za=RegExp("["+zt+xe+Pt+Rt+$t+"]"),Ja=parseInt,Qa=typeof _=="object"&&_&&_.Object===Object&&_,es=typeof self=="object"&&self&&self.Object===Object&&self,ts=Qa||es||Function("return this")(),ns=ss("length");function as(t){return t.split("")}function ss(t){return function(e){return e==null?void 0:e[t]}}function Fe(t){return Za.test(t)}function Xt(t){return Fe(t)?is(t):ns(t)}function rs(t){return Fe(t)?os(t):as(t)}function is(t){for(var e=me.lastIndex=0;me.test(t);)e++;return e}function os(t){return t.match(me)||[]}var us=Object.prototype,ls=us.toString,Ye=ts.Symbol,cs=Math.ceil,ms=Math.floor,Ge=Ye?Ye.prototype:void 0,ze=Ge?Ge.toString:void 0;function Ue(t,e){var n="";if(!t||e<1||e>$a)return n;do e%2&&(n+=t),e=ms(e/2),e&&(t+=t);while(e);return n}function ds(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var r=Array(s);++a<s;)r[a]=t[a+e];return r}function Vt(t){if(typeof t=="string")return t;if(Wt(t))return ze?ze.call(t):"";var e=t+"";return e=="0"&&1/t==-ue?"-0":e}function fs(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:ds(t,e,n)}function hs(t,e){e=e===void 0?" ":Vt(e);var n=e.length;if(n<2)return n?Ue(e,t):e;var a=Ue(e,cs(t/Xt(e)));return Fe(e)?fs(rs(a),0,t).join(""):a.slice(0,t)}function He(t){var e=typeof t;return!!t&&(e=="object"||e=="function")}function ps(t){return!!t&&typeof t=="object"}function Wt(t){return typeof t=="symbol"||ps(t)&&ls.call(t)==Ya}function gs(t){if(!t)return t===0?t:0;if(t=ys(t),t===ue||t===-ue){var e=t<0?-1:1;return e*Na}return t===t?t:0}function vs(t){var e=gs(t),n=e%1;return e===e?n?e-n:e:0}function ys(t){if(typeof t=="number")return t;if(Wt(t))return Ne;if(He(t)){var e=typeof t.valueOf=="function"?t.valueOf():t;t=He(e)?e+"":e}if(typeof t!="string")return t===0?t:+t;t=t.replace(Ga,"");var n=Ua.test(t);return n||Ha.test(t)?Ja(t.slice(2),n?2:8):za.test(t)?Ne:+t}function bs(t){return t==null?"":Vt(t)}function Es(t,e,n){t=bs(t),e=vs(e);var a=e?Xt(t):0;return e&&a<e?t+hs(e-a,n):t}var xs=Es,Fs=(t,e,n,a)=>{const s=(t+(a||"")).toString().includes("%");if(typeof t=="string"?[t,e,n,a]=t.match(/(0?\.?\d{1,3})%?\b/g).map(Number):a!==void 0&&(a=parseFloat(a)),typeof t!="number"||typeof e!="number"||typeof n!="number"||t>255||e>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof a=="number"){if(!s&&a>=0&&a<=1)a=Math.round(255*a);else if(s&&a>=0&&a<=100)a=Math.round(255*a/100);else throw new TypeError(`Expected alpha value (${a}) as a fraction or percentage`);a=(a|256).toString(16).slice(1)}else a="";return(n|e<<8|t<<16|1<<24).toString(16).slice(1)+a};const Y="a-f\\d",Cs=`#?[${Y}]{3}[${Y}]?`,As=`#?[${Y}]{6}([${Y}]{2})?`,Ds=new RegExp(`[^#${Y}]`,"gi"),ks=new RegExp(`^${Cs}$|^${As}$`,"i");var Ss=(t,e={})=>{if(typeof t!="string"||Ds.test(t)||!ks.test(t))throw new TypeError("Expected a valid hex string");t=t.replace(/^#/,"");let n=1;t.length===8&&(n=Number.parseInt(t.slice(6,8),16)/255,t=t.slice(0,6)),t.length===4&&(n=Number.parseInt(t.slice(3,4).repeat(2),16)/255,t=t.slice(0,3)),t.length===3&&(t=t[0]+t[0]+t[1]+t[1]+t[2]+t[2]);const a=Number.parseInt(t,16),s=a>>16,r=a>>8&255,i=a&255,o=typeof e.alpha=="number"?e.alpha:n;if(e.format==="array")return[s,r,i,o];if(e.format==="css"){const u=o===1?"":` / ${Number((o*100).toFixed(2))}%`;return`rgb(${s} ${r} ${i}${u})`}return{red:s,green:r,blue:i,alpha:o}},Ts=Sn,_s=la,Bs=Ra,Is=xs,ws=Fs,qt=Ss;const te=.75,ne=.25,ae=16777215,Ms=49979693;var js=function(t){return"#"+Ps(String(JSON.stringify(t)))};function Os(t){var e=_s(t),n=[];return e.forEach(function(a){var s=Ts(a);s&&n.push(qt(Bs(s,"#"),{format:"array"}))}),n}function Ls(t){var e=[0,0,0];return t.forEach(function(n){for(var a=0;a<3;a++)e[a]+=n[a]}),[e[0]/t.length,e[1]/t.length,e[2]/t.length]}function Ps(t){var e,n=Os(t);n.length>0&&(e=Ls(n));var a=1,s=0,r=1;if(t.length>0)for(var i=0;i<t.length;i++)t[i].charCodeAt(0)>s&&(s=t[i].charCodeAt(0)),r=parseInt(ae/s),a=(a+t[i].charCodeAt(0)*r*Ms)%ae;var o=(a*t.length%ae).toString(16);o=Is(o,6,o);var u=qt(o,{format:"array"});return e?ws(ne*u[0]+te*e[0],ne*u[1]+te*e[1],ne*u[2]+te*e[2]):o}const Rs=En(js);function $s(t){return[...Ns].sort(()=>Math.random()-Math.random()).slice(0,t)}const Ns=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function Kt(t){return[...Ys].sort(()=>Math.random()-Math.random()).slice(0,t)}const Ys=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"],de=10,I=20,Gs=5,zs=I/Gs,Us=.5,Hs=500,U=.05,fe=5,se=60;function Xs(){const t=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],e=Array.from({length:256},(s,r)=>r).sort(()=>Math.random()-.5),n=[...e,...e];function a(s,r,i){return s[0]*r+s[1]*i}return function(r,i){const o=Math.floor(r)&255,u=Math.floor(i)&255;r-=Math.floor(r),i-=Math.floor(i);const c=r*r*r*(r*(r*6-15)+10),l=i*i*i*(i*(i*6-15)+10),m=n[o]+u,f=n[o+1]+u;return(1+(a(t[n[m]&7],r,i)*(1-c)+a(t[n[f]&7],r-1,i)*c)*(1-l)+(a(t[n[m+1]&7],r,i-1)*(1-c)+a(t[n[f+1]&7],r-1,i-1)*c)*l)/2}}function he(t,e,n,a,s,r){const i=Xs(),o=Math.floor(t.x/r),u=Math.floor(t.y/r),c=Math.floor(a/4),l=.5,m=.005,f=.7;for(let h=u-c;h<=u+c;h++)for(let y=o-c;y<=o+c;y++)if(y>=0&&y<a&&h>=0&&h<s){let x=y,k=h;for(let M=0;M<e;M++)Math.random()<f&&(x+=Math.random()>.5?1:-1,k+=Math.random()>.5?1:-1);x=Math.max(0,Math.min(a-1,x)),k=Math.max(0,Math.min(s-1,k));const E=Math.sqrt((x-o)*(x-o)+(k-u)*(k-u))/c,A=i(y*m,h*m);if(E<1&&A>l+E*.01){const M=h*a+y;n[M].type=B.GROUND,n[M].depth=void 0,n[M].height=(1-E)*2*(A-l)}}const p=Math.min(Math.max(u*a+o,0),a);n[p].type=B.GROUND,n[p].depth=void 0,n[p].height=1}function Vs(t,e,n){return{x:Math.floor(Math.random()*(t*.8)+t*.1)*n,y:Math.floor(Math.random()*(e*.8)+e*.1)*n}}function Ws(t,e,n,a){if(t.x<0||t.y<0||t.x>=n||t.y>=a)return!1;const s=Math.floor(n/(Math.sqrt(e.length+1)*2));return e.every(r=>Math.abs(t.x-r.x)>s||Math.abs(t.y-r.y)>s)}function qs(t,e,n){return e.every(a=>Math.sqrt(Math.pow(t.x-a.position.x,2)+Math.pow(t.y-a.position.y,2))>=n)}function Ks(t,e,n,a,s,r){const i=[],o=[],u=[],c=I*3,l=Kt(t*2).filter(h=>h!==e),m=5,f=$s(t*m*2),p=[];for(let h=0;h<t;h++){const y=`state-${h+1}`,x=h===0?e:l.pop(),k=Zs(y,x,h===0);i.push(k),i.forEach(A=>{k.strategies[A.id]=v.NEUTRAL,A.strategies[y]=v.NEUTRAL});const E=Js(p,n,a,s);p.push(E),he(E,n/2,r,n,a,s),Qs(y,E,m,f,o,u,c,s,r,n,a)}return{states:i,cities:o,launchSites:u}}function Zs(t,e,n){return{id:t,name:e,color:Rs(e),isPlayerControlled:n,strategies:{},generalStrategy:n?void 0:[v.NEUTRAL,v.HOSTILE,v.FRIENDLY].sort(()=>Math.random()-.5)[0]}}function Js(t,e,n,a){let s,r=10;do if(s=Vs(e,n,a),r--<=0)break;while(!Ws(s,t,e,n));return s}function Qs(t,e,n,a,s,r,i,o,u,c,l){const m=[];for(let f=0;f<n;f++){const p=Xe(e,m,i,30*o);m.push({position:p}),s.push({id:`city-${s.length+1}`,stateId:t,name:a.pop(),position:p,population:Math.floor(Math.random()*3e3)+1e3}),he(p,2,u,c,l,o)}for(let f=0;f<4;f++){const p=Xe(e,m,i,15*o);m.push({position:p}),r.push({type:mt.LAUNCH_SITE,id:`launch-site-${r.length+1}`,stateId:t,position:p}),he(p,1,u,c,l,o)}return m}function Xe(t,e,n,a){let s,r=10;do if(s={x:t.x+(Math.random()-.5)*a,y:t.y+(Math.random()-.5)*a},r--<=0)break;while(!qs(s,e,n));return s}function er({playerStateName:t,numberOfStates:e=3}){const a=Math.max(200,Math.ceil(Math.sqrt(e)*10)),s=a,r=[];for(let m=0;m<s;m++)for(let f=0;f<a;f++)r.push({id:`sector-${r.length+1}`,position:{x:f*16,y:m*16},rect:{left:f*16,top:m*16,right:(f+1)*16,bottom:(m+1)*16},type:B.WATER,depth:0,height:0});const{states:i,cities:o,launchSites:u}=Ks(e,t,a,s,16,r);return An(r,a,s),{timestamp:0,states:i,cities:o,launchSites:u,sectors:r,missiles:[],explosions:[]}}function S(t,e,n,a){return Math.sqrt(Math.pow(n-t,2)+Math.pow(a-e,2))}function tr(t){var e,n;for(const a of t.states){const s=t.cities.filter(l=>l.stateId===a.id),r=t.launchSites.filter(l=>l.stateId===a.id),i=t.cities.filter(l=>a.strategies[l.stateId]===v.HOSTILE&&l.stateId!==a.id&&l.population>0),o=t.missiles.filter(l=>a.strategies[l.stateId]!==v.FRIENDLY&&l.stateId!==a.id),u=t.launchSites.filter(l=>a.strategies[l.stateId]===v.HOSTILE&&l.stateId!==a.id),c=o.filter(l=>s.some(m=>pe(l.target,m.position))||r.some(m=>pe(l.target,m.position))).filter(l=>(t.timestamp-l.launchTimestamp)/(l.targetTimestamp-l.launchTimestamp)>.5);for(const l of t.launchSites.filter(m=>m.stateId===a.id)){if(l.nextLaunchTarget)continue;if(i.length===0&&u.length===0&&o.length===0)break;const m=Ve(c.map(h=>({...h,interceptionPoint:nr(h,l.position)})),l.position),f=t.missiles.filter(h=>h.stateId===a.id),p=We(m,f).filter(([,h])=>h<r.length);if(p.length>0)l.nextLaunchTarget=p[0][0].interceptionPoint??void 0;else{const h=We(Ve([...u,...i],l.position),f);l.nextLaunchTarget=((n=(e=h==null?void 0:h[0])==null?void 0:e[0])==null?void 0:n.position)??void 0}}}return t}function nr(t,e){const n=S(t.position.x,t.position.y,e.x,e.y);if(n<I)return null;const a=S(t.target.x,t.target.y,t.launch.x,t.launch.y),s=(t.target.x-t.launch.x)/a,r=(t.target.y-t.launch.y)/a,i={x:t.target.x-s*I*2,y:t.target.y-r*I*2},o=n/de,u=S(e.x,e.y,i.x,i.y)/de;return o<u||o>u+10?null:i}function pe(t,e){const n=I;return S(t.x,t.y,e.x,e.y)<=n}function Ve(t,e){return t.sort((n,a)=>S(n.position.x,n.position.y,e.x,e.y)-S(a.position.x,a.position.y,e.x,e.y))}function We(t,e){const n=new Map;for(const a of t)n.set(a,e.filter(s=>pe(s.target,a.position)).length);return Array.from(n).sort((a,s)=>a[1]-s[1])}function ar(t){var e,n;for(const a of t.missiles.filter(s=>s.launchTimestamp===t.timestamp)){const s=t.states.find(i=>i.id===a.stateId),r=((e=t.cities.find(i=>S(i.position.x,i.position.y,a.target.x,a.target.y)<=I))==null?void 0:e.stateId)||((n=t.launchSites.find(i=>S(i.position.x,i.position.y,a.target.x,a.target.y)<=I))==null?void 0:n.stateId);if(s&&r&&s.id!==r){s.strategies[r]!==v.HOSTILE&&(s.strategies[r]=v.HOSTILE);const i=t.states.find(o=>o.id===r);i&&i.strategies[s.id]!==v.HOSTILE&&(i.strategies[s.id]=v.HOSTILE,t.states.forEach(o=>{o.id!==i.id&&o.strategies[i.id]===v.FRIENDLY&&i.strategies[o.id]===v.FRIENDLY&&(o.strategies[s.id]=v.HOSTILE,s.strategies[o.id]=v.HOSTILE)}))}}for(const a of t.states.filter(s=>!s.isPlayerControlled))sr(a,t);return t}function sr(t,e){const n=e.states.filter(i=>i.id!==t.id);t.strategies={...t.strategies},t.generalStrategy!==v.HOSTILE&&n.forEach(i=>{i.strategies[t.id]===v.FRIENDLY&&t.strategies[i.id]===v.NEUTRAL&&(t.strategies[i.id]=v.FRIENDLY)});const a=n.filter(i=>Object.values(i.strategies).every(o=>o!==v.HOSTILE)&&i.generalStrategy!==v.HOSTILE);if(a.length>0&&t.generalStrategy===v.FRIENDLY){const i=a[Math.floor(Math.random()*a.length)];t.strategies[i.id]=v.FRIENDLY}const s=n.filter(i=>t.strategies[i.id]===v.FRIENDLY&&i.strategies[t.id]===v.FRIENDLY);s.forEach(i=>{n.forEach(o=>{o.strategies[i.id]===v.HOSTILE&&t.strategies[o.id]!==v.HOSTILE&&(t.strategies[o.id]=v.HOSTILE)})}),n.filter(i=>i.strategies[t.id]!==v.FRIENDLY&&t.strategies[i.id]!==v.FRIENDLY).forEach(i=>{if(rr(i,t,s,e)){const o=e.launchSites.filter(u=>u.stateId===t.id&&!u.lastLaunchTimestamp);if(o.length>0){const u=o[Math.floor(Math.random()*o.length)],c=[...e.cities.filter(l=>l.stateId===i.id),...e.launchSites.filter(l=>l.stateId===i.id)];if(c.length>0){const l=c[Math.floor(Math.random()*c.length)];u.nextLaunchTarget=l.position}}}})}function rr(t,e,n,a){const s=a.launchSites.filter(o=>o.stateId===t.id),r=a.launchSites.filter(o=>o.stateId===e.id||n.some(u=>u.id===o.stateId));return s.length<r.length?!0:a.missiles.some(o=>a.cities.some(u=>u.stateId===t.id&&S(u.position.x,u.position.y,o.target.x,o.target.y)<=I)||a.launchSites.some(u=>u.stateId===t.id&&S(u.position.x,u.position.y,o.target.x,o.target.y)<=I))}function ir(t,e){for(;e>0;){const n=or(t,e>U?U:e);e=e>U?e-U:0,t=n}return t}function or(t,e){const n=t.timestamp+e;let a={timestamp:n,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,explosions:t.explosions,sectors:t.sectors};for(const s of a.missiles){const r=(n-s.launchTimestamp)/(s.targetTimestamp-s.launchTimestamp);s.position={x:s.launch.x+(s.target.x-s.launch.x)*r,y:s.launch.y+(s.target.y-s.launch.y)*r}}for(const s of t.missiles.filter(r=>r.targetTimestamp<=n)){const r={id:`explosion-${Math.random()}`,missileId:s.id,startTimestamp:s.targetTimestamp,endTimestamp:s.targetTimestamp+zs,position:s.target,radius:I};a.explosions.push(r);for(const u of t.cities.filter(c=>S(c.position.x,c.position.y,r.position.x,r.position.y)<=r.radius)){const c=Math.max(Hs,u.population*Us);u.population=Math.max(0,u.population-c)}const i=t.missiles.filter(u=>u.id!==r.missileId&&u.launchTimestamp<=r.startTimestamp&&u.targetTimestamp>=r.startTimestamp).filter(u=>S(u.position.x,u.position.y,r.position.x,r.position.y)<=r.radius);for(const u of i)u.targetTimestamp=r.startTimestamp;const o=t.launchSites.filter(u=>S(u.position.x,u.position.y,r.position.x,r.position.y)<=r.radius);for(const u of o)a.launchSites=t.launchSites.filter(c=>c.id!==u.id)}a.explosions=a.explosions.filter(s=>s.endTimestamp>=n),a.missiles=a.missiles.filter(s=>s.targetTimestamp>n);for(const s of t.launchSites){if(s.nextLaunchTarget){if(s.lastLaunchTimestamp&&n-s.lastLaunchTimestamp<fe)continue}else continue;const r=S(s.position.x,s.position.y,s.nextLaunchTarget.x,s.nextLaunchTarget.y),i={id:Math.random()+"",stateId:s.stateId,launchSiteId:s.id,launch:s.position,launchTimestamp:n,position:s.position,target:s.nextLaunchTarget,targetTimestamp:n+r/de};a.missiles.push(i),s.lastLaunchTimestamp=n,s.nextLaunchTarget=void 0}return a=tr(a),a=ar(a),a}function ur(t){const[e,n]=g.useState(()=>er({playerStateName:t,numberOfStates:6})),a=g.useCallback((s,r)=>n(ir(s,r)),[]);return{worldState:e,updateWorldState:a,setWorldState:n}}const Zt={x:0,y:0,pointingObjects:[]},lr=(t,e)=>e.type==="move"?{x:e.x,y:e.y,pointingObjects:t.pointingObjects}:e.type==="point"&&!t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,e.object]}:e.type==="unpoint"&&t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(n=>n.id!==e.object.id)}:t,cr=g.createContext(Zt),Ce=g.createContext(()=>{});function mr({children:t}){const[e,n]=g.useReducer(lr,Zt);return d.jsx(cr.Provider,{value:e,children:d.jsx(Ce.Provider,{value:n,children:t})})}function dr(){const t=g.useContext(Ce);return(e,n)=>t({type:"move",x:e,y:n})}function Ae(){const t=g.useContext(Ce);return[e=>t({type:"point",object:e}),e=>t({type:"unpoint",object:e})]}const De={},fr=(t,e)=>e.type==="clear"?De:e.type==="set"?{...t,selectedObject:e.object}:t,Jt=g.createContext(De),Qt=g.createContext(()=>{});function hr({children:t}){const[e,n]=g.useReducer(fr,De);return d.jsx(Jt.Provider,{value:e,children:d.jsx(Qt.Provider,{value:n,children:t})})}function pr(t){var a;const e=g.useContext(Qt);return[((a=g.useContext(Jt).selectedObject)==null?void 0:a.id)===t.id,()=>e({type:"set",object:t})]}function Q(t,e){const n=new CustomEvent(t,{bubbles:!0,detail:e});document.dispatchEvent(n)}function ke(t,e){g.useEffect(()=>{const n=a=>{e(a.detail)};return document.addEventListener(t,n,!1),()=>{document.removeEventListener(t,n,!1)}},[t,e])}const gr=N.memo(({sectors:t})=>{const e=g.useRef(null),[n,a]=Ae();return g.useEffect(()=>{const s=e.current,r=s==null?void 0:s.getContext("2d");if(!s||!r)return;const i=Math.min(...t.map(h=>h.rect.left)),o=Math.min(...t.map(h=>h.rect.top)),u=Math.max(...t.map(h=>h.rect.right)),c=Math.max(...t.map(h=>h.rect.bottom)),l=u-i,m=c-o;s.width=l,s.height=m,s.style.width=`${l}px`,s.style.height=`${m}px`;const f=Math.max(...t.filter(h=>h.type===B.WATER).map(h=>h.depth||0)),p=Math.max(...t.filter(h=>h.type===B.GROUND).map(h=>h.height||0));r.clearRect(0,0,l,m),t.forEach(h=>{const{fillStyle:y,drawSector:x}=vr(h,f,p);r.fillStyle=y,x(r,h.rect,i,o)})},[t]),g.useEffect(()=>{const s=e.current;let r;const i=o=>{const u=s==null?void 0:s.getBoundingClientRect(),c=o.clientX-((u==null?void 0:u.left)||0),l=o.clientY-((u==null?void 0:u.top)||0),m=t.find(f=>c>=f.rect.left&&c<=f.rect.right&&l>=f.rect.top&&l<=f.rect.bottom);m&&(r&&a(r),n(m),r=m)};return s==null||s.addEventListener("mousemove",i),()=>{s==null||s.removeEventListener("mousemove",i)}},[t,n,a]),d.jsx("canvas",{ref:e})});function vr(t,e,n){switch(t.type){case B.GROUND:return{fillStyle:qe(t.height||0,n),drawSector:(a,s,r,i)=>{a.fillStyle=qe(t.height||0,n),a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}};case B.WATER:return{fillStyle:"rgb(0, 34, 93)",drawSector:(a,s,r,i)=>{const o=(t.depth||0)/e,u=Math.round(0+34*(1-o)),c=Math.round(137+-103*o),l=Math.round(178+-85*o);a.fillStyle=`rgb(${u}, ${c}, ${l})`,a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(a,s,r,i)=>{a.fillStyle="rgb(0, 34, 93)",a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}}}}function qe(t,e){const n=t/e;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const a=Math.round(34+67*((n-.5)/.3)),s=Math.round(100+-33*((n-.5)/.3)),r=Math.round(34+-1*((n-.5)/.3));return`rgb(${a}, ${s}, ${r})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}const H=I*2;function yr({state:t,cities:e,launchSites:n}){const{boundingBox:a,pathData:s}=N.useMemo(()=>{const r=[...e.filter(c=>c.stateId===t.id).map(c=>c.position),...n.filter(c=>c.stateId===t.id).map(c=>c.position)].map(({x:c,y:l})=>[{x:c,y:l},{x:c+H,y:l},{x:c,y:l+H},{x:c-H,y:l},{x:c,y:l-H}]).flat(),i=xr(r),o=Cr(i),u=i.map((c,l)=>`${l===0?"M":"L"} ${c.x-o.minX} ${c.y-o.minY}`).join(" ")+"Z";return{boundingBox:o,pathData:u}},[t,e,n]);return d.jsx(br,{width:a.maxX-a.minX,height:a.maxY-a.minY,style:{transform:`translate(${a.minX}px, ${a.minY}px)`},children:d.jsx(Er,{d:s,fill:"none",stroke:t.color,strokeWidth:"2"})})}const br=b.svg`
  position: absolute;
  pointer-events: none;
`,Er=b.path``;function xr(t){if(t.length<3)return t;const e=t.reduce((s,r)=>r.y<s.y?r:s,t[0]),n=t.sort((s,r)=>{const i=Math.atan2(s.y-e.y,s.x-e.x),o=Math.atan2(r.y-e.y,r.x-e.x);return i-o}),a=[n[0],n[1]];for(let s=2;s<n.length;s++){for(;a.length>1&&!Fr(a[a.length-2],a[a.length-1],n[s]);)a.pop();a.push(n[s])}return a}function Fr(t,e,n){return(e.x-t.x)*(n.y-t.y)-(e.y-t.y)*(n.x-t.x)>0}function Cr(t){return t.reduce((n,a)=>({minX:Math.min(n.minX,a.x),minY:Math.min(n.minY,a.y),maxX:Math.max(n.maxX,a.x),maxY:Math.max(n.maxY,a.y)}),{minX:1/0,minY:1/0,maxX:-1/0,maxY:-1/0})}function Ar({city:t}){const[e,n]=Ae(),a=t.population,r=Math.max(5,10*(a/4e3));return d.jsx(Dr,{onMouseEnter:()=>e(t),onMouseLeave:()=>n(t),style:{"--x":t.position.x,"--y":t.position.y,"--size":r,"--opacity":a>0?1:.3},children:d.jsxs(kr,{children:[t.name,": ",a.toLocaleString()," population"]})})}const Dr=b.div`
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
`,kr=b.div`
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
`;function Sr({launchSite:t,worldTimestamp:e,isPlayerControlled:n}){const[a,s]=pr(t),[r,i]=Ae(),o=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+fe>e,u=o?(e-t.lastLaunchTimestamp)/fe:0;return d.jsx(Tr,{onMouseEnter:()=>r(t),onMouseLeave:()=>i(t),onClick:()=>n&&s(),style:{"--x":t.position.x,"--y":t.position.y,"--cooldown-progress":u},"data-selected":a,"data-cooldown":o})}const Tr=b.div`
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
`;function en(t,e){e===void 0&&(e=!0);var n=g.useRef(null),a=g.useRef(!1),s=g.useRef(t);s.current=t;var r=g.useCallback(function(o){a.current&&(s.current(o),n.current=requestAnimationFrame(r))},[]),i=g.useMemo(function(){return[function(){a.current&&(a.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){a.current||(a.current=!0,n.current=requestAnimationFrame(r))},function(){return a.current}]},[]);return g.useEffect(function(){return e&&i[1](),i[0]},[]),i}function _r(t,e,n){if(e.startTimestamp>n||e.endTimestamp<n)return;const a=Math.pow(Math.min(Math.max(0,(n-e.startTimestamp)/(e.endTimestamp-e.startTimestamp)),1),.15);t.fillStyle=`rgb(${255*a}, ${255*(1-a)}, 0)`,t.beginPath(),t.arc(e.position.x,e.position.y,e.radius*a,0,2*Math.PI),t.fill()}function Br(t,e,n){e.launchTimestamp>n||e.targetTimestamp<n||(t.fillStyle="rgb(0, 255, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,1,0,2*Math.PI),t.fill())}function Ir(t,e,n){if(e.launchTimestamp>n||e.targetTimestamp<n)return;const a=Math.min(Math.max(n-5,e.launchTimestamp)-e.launchTimestamp,e.targetTimestamp-e.launchTimestamp),s=e.targetTimestamp-e.launchTimestamp,r=a/s,i=e.launch.x+(e.target.x-e.launch.x)*r,o=e.launch.y+(e.target.y-e.launch.y)*r,u={x:i,y:o},c=e.position,l=t.createLinearGradient(u.x,u.y,c.x,c.y);l.addColorStop(0,"rgba(255, 255, 255, 0)"),l.addColorStop(1,"rgba(255, 255, 255, 0.5)"),t.strokeStyle=l,t.lineWidth=1,t.beginPath(),t.moveTo(u.x,u.y),t.lineTo(c.x,c.y),t.stroke()}function wr({state:t}){const e=g.useRef(null);return g.useLayoutEffect(()=>{const a=e.current;if(!a)return;const s=Math.min(...t.sectors.map(l=>l.rect.left)),r=Math.min(...t.sectors.map(l=>l.rect.top)),i=Math.max(...t.sectors.map(l=>l.rect.right)),o=Math.max(...t.sectors.map(l=>l.rect.bottom)),u=i-s,c=o-r;a.width=u,a.height=c,a.style.width=`${u}px`,a.style.height=`${c}px`},[t.sectors]),en(()=>{const a=e.current;if(!a)return;const s=a.getContext("2d");s&&(s.clearRect(0,0,a.width,a.height),t.missiles.forEach(r=>{Ir(s,r,t.timestamp)}),t.missiles.filter(r=>r.launchTimestamp<t.timestamp&&r.targetTimestamp>t.timestamp).forEach(r=>{Br(s,r,t.timestamp)}),t.explosions.filter(r=>r.startTimestamp<t.timestamp&&r.endTimestamp>t.timestamp).forEach(r=>{_r(s,r,t.timestamp)}))}),d.jsx(Mr,{ref:e})}const Mr=b.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function jr({state:t}){const e=dr();return d.jsxs(Or,{onMouseMove:n=>e(n.clientX,n.clientY),onClick:()=>Q("world-click"),children:[d.jsx(gr,{sectors:t.sectors}),t.states.map(n=>d.jsx(yr,{state:n,cities:t.cities,launchSites:t.launchSites},n.id)),t.cities.map(n=>d.jsx(Ar,{city:n},n.id)),t.launchSites.map(n=>{var a;return d.jsx(Sr,{launchSite:n,worldTimestamp:t.timestamp,isPlayerControlled:n.stateId===((a=t.states.find(s=>s.isPlayerControlled))==null?void 0:a.id)},n.id)}),d.jsx(wr,{state:t})]})}const Or=b.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function Lr(t,e,n){return Math.max(e,Math.min(t,n))}const F={toVector(t,e){return t===void 0&&(t=e),Array.isArray(t)?t:[t,t]},add(t,e){return[t[0]+e[0],t[1]+e[1]]},sub(t,e){return[t[0]-e[0],t[1]-e[1]]},addTo(t,e){t[0]+=e[0],t[1]+=e[1]},subTo(t,e){t[0]-=e[0],t[1]-=e[1]}};function Ke(t,e,n){return e===0||Math.abs(e)===1/0?Math.pow(t,n*5):t*e*n/(e+n*t)}function Ze(t,e,n,a=.15){return a===0?Lr(t,e,n):t<e?-Ke(e-t,n-e,a)+e:t>n?+Ke(t-n,n-e,a)+n:t}function Pr(t,[e,n],[a,s]){const[[r,i],[o,u]]=t;return[Ze(e,r,i,a),Ze(n,o,u,s)]}function Rr(t,e){if(typeof t!="object"||t===null)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var a=n.call(t,e||"default");if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function $r(t){var e=Rr(t,"string");return typeof e=="symbol"?e:String(e)}function D(t,e,n){return e=$r(e),e in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function Je(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(t);e&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(t,s).enumerable})),n.push.apply(n,a)}return n}function C(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?Je(Object(n),!0).forEach(function(a){D(t,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):Je(Object(n)).forEach(function(a){Object.defineProperty(t,a,Object.getOwnPropertyDescriptor(n,a))})}return t}const tn={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function Qe(t){return t?t[0].toUpperCase()+t.slice(1):""}const Nr=["enter","leave"];function Yr(t=!1,e){return t&&!Nr.includes(e)}function Gr(t,e="",n=!1){const a=tn[t],s=a&&a[e]||e;return"on"+Qe(t)+Qe(s)+(Yr(n,s)?"Capture":"")}const zr=["gotpointercapture","lostpointercapture"];function Ur(t){let e=t.substring(2).toLowerCase();const n=!!~e.indexOf("passive");n&&(e=e.replace("passive",""));const a=zr.includes(e)?"capturecapture":"capture",s=!!~e.indexOf(a);return s&&(e=e.replace("capture","")),{device:e,capture:s,passive:n}}function Hr(t,e=""){const n=tn[t],a=n&&n[e]||e;return t+a}function ee(t){return"touches"in t}function nn(t){return ee(t)?"touch":"pointerType"in t?t.pointerType:"mouse"}function Xr(t){return Array.from(t.touches).filter(e=>{var n,a;return e.target===t.currentTarget||((n=t.currentTarget)===null||n===void 0||(a=n.contains)===null||a===void 0?void 0:a.call(n,e.target))})}function Vr(t){return t.type==="touchend"||t.type==="touchcancel"?t.changedTouches:t.targetTouches}function an(t){return ee(t)?Vr(t)[0]:t}function ge(t,e){try{const n=e.clientX-t.clientX,a=e.clientY-t.clientY,s=(e.clientX+t.clientX)/2,r=(e.clientY+t.clientY)/2,i=Math.hypot(n,a);return{angle:-(Math.atan2(n,a)*180)/Math.PI,distance:i,origin:[s,r]}}catch{}return null}function Wr(t){return Xr(t).map(e=>e.identifier)}function et(t,e){const[n,a]=Array.from(t.touches).filter(s=>e.includes(s.identifier));return ge(n,a)}function re(t){const e=an(t);return ee(t)?e.identifier:e.pointerId}function $(t){const e=an(t);return[e.clientX,e.clientY]}const tt=40,nt=800;function sn(t){let{deltaX:e,deltaY:n,deltaMode:a}=t;return a===1?(e*=tt,n*=tt):a===2&&(e*=nt,n*=nt),[e,n]}function qr(t){var e,n;const{scrollX:a,scrollY:s,scrollLeft:r,scrollTop:i}=t.currentTarget;return[(e=a??r)!==null&&e!==void 0?e:0,(n=s??i)!==null&&n!==void 0?n:0]}function Kr(t){const e={};if("buttons"in t&&(e.buttons=t.buttons),"shiftKey"in t){const{shiftKey:n,altKey:a,metaKey:s,ctrlKey:r}=t;Object.assign(e,{shiftKey:n,altKey:a,metaKey:s,ctrlKey:r})}return e}function K(t,...e){return typeof t=="function"?t(...e):t}function Zr(){}function Jr(...t){return t.length===0?Zr:t.length===1?t[0]:function(){let e;for(const n of t)e=n.apply(this,arguments)||e;return e}}function at(t,e){return Object.assign({},e,t||{})}const Qr=32;class rn{constructor(e,n,a){this.ctrl=e,this.args=n,this.key=a,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(e){this.ctrl.state[this.key]=e}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:e,shared:n,ingKey:a,args:s}=this;n[a]=e._active=e.active=e._blocked=e._force=!1,e._step=[!1,!1],e.intentional=!1,e._movement=[0,0],e._distance=[0,0],e._direction=[0,0],e._delta=[0,0],e._bounds=[[-1/0,1/0],[-1/0,1/0]],e.args=s,e.axis=void 0,e.memo=void 0,e.elapsedTime=e.timeDelta=0,e.direction=[0,0],e.distance=[0,0],e.overflow=[0,0],e._movementBound=[!1,!1],e.velocity=[0,0],e.movement=[0,0],e.delta=[0,0],e.timeStamp=0}start(e){const n=this.state,a=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=e.target,n.currentTarget=e.currentTarget,n.lastOffset=a.from?K(a.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=e.timeStamp)}computeValues(e){const n=this.state;n._values=e,n.values=this.config.transform(e)}computeInitial(){const e=this.state;e._initial=e._values,e.initial=e.values}compute(e){const{state:n,config:a,shared:s}=this;n.args=this.args;let r=0;if(e&&(n.event=e,a.preventDefault&&e.cancelable&&n.event.preventDefault(),n.type=e.type,s.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,s.locked=!!document.pointerLockElement,Object.assign(s,Kr(e)),s.down=s.pressed=s.buttons%2===1||s.touches>0,r=e.timeStamp-n.timeStamp,n.timeStamp=e.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const j=n._delta.map(Math.abs);F.addTo(n._distance,j)}this.axisIntent&&this.axisIntent(e);const[i,o]=n._movement,[u,c]=a.threshold,{_step:l,values:m}=n;if(a.hasCustomTransform?(l[0]===!1&&(l[0]=Math.abs(i)>=u&&m[0]),l[1]===!1&&(l[1]=Math.abs(o)>=c&&m[1])):(l[0]===!1&&(l[0]=Math.abs(i)>=u&&Math.sign(i)*u),l[1]===!1&&(l[1]=Math.abs(o)>=c&&Math.sign(o)*c)),n.intentional=l[0]!==!1||l[1]!==!1,!n.intentional)return;const f=[0,0];if(a.hasCustomTransform){const[j,bn]=m;f[0]=l[0]!==!1?j-l[0]:0,f[1]=l[1]!==!1?bn-l[1]:0}else f[0]=l[0]!==!1?i-l[0]:0,f[1]=l[1]!==!1?o-l[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(f);const p=n.offset,h=n._active&&!n._blocked||n.active;h&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=s[this.ingKey]=n._active,e&&(n.first&&("bounds"in a&&(n._bounds=K(a.bounds,n)),this.setup&&this.setup()),n.movement=f,this.computeOffset()));const[y,x]=n.offset,[[k,E],[A,M]]=n._bounds;n.overflow=[y<k?-1:y>E?1:0,x<A?-1:x>M?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const yn=n._active?a.rubberband||[0,0]:[0,0];if(n.offset=Pr(n._bounds,n.offset,yn),n.delta=F.sub(n.offset,p),this.computeMovement(),h&&(!n.last||r>Qr)){n.delta=F.sub(n.offset,p);const j=n.delta.map(Math.abs);F.addTo(n.distance,j),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&r>0&&(n.velocity=[j[0]/r,j[1]/r],n.timeDelta=r)}}emit(){const e=this.state,n=this.shared,a=this.config;if(e._active||this.clean(),(e._blocked||!e.intentional)&&!e._force&&!a.triggerAllEvents)return;const s=this.handler(C(C(C({},n),e),{},{[this.aliasKey]:e.values}));s!==void 0&&(e.memo=s)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function ei([t,e],n){const a=Math.abs(t),s=Math.abs(e);if(a>s&&a>n)return"x";if(s>a&&s>n)return"y"}class G extends rn{constructor(...e){super(...e),D(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=F.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=F.sub(this.state.offset,this.state.lastOffset)}axisIntent(e){const n=this.state,a=this.config;if(!n.axis&&e){const s=typeof a.axisThreshold=="object"?a.axisThreshold[nn(e)]:a.axisThreshold;n.axis=ei(n._movement,s)}n._blocked=(a.lockDirection||!!a.axis)&&!n.axis||!!a.axis&&a.axis!==n.axis}restrictToAxis(e){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":e[1]=0;break;case"y":e[0]=0;break}}}const ti=t=>t,st=.15,on={enabled(t=!0){return t},eventOptions(t,e,n){return C(C({},n.shared.eventOptions),t)},preventDefault(t=!1){return t},triggerAllEvents(t=!1){return t},rubberband(t=0){switch(t){case!0:return[st,st];case!1:return[0,0];default:return F.toVector(t)}},from(t){if(typeof t=="function")return t;if(t!=null)return F.toVector(t)},transform(t,e,n){const a=t||n.shared.transform;return this.hasCustomTransform=!!a,a||ti},threshold(t){return F.toVector(t,0)}},ni=0,O=C(C({},on),{},{axis(t,e,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(t=ni){return t},bounds(t={}){if(typeof t=="function")return r=>O.bounds(t(r));if("current"in t)return()=>t.current;if(typeof HTMLElement=="function"&&t instanceof HTMLElement)return t;const{left:e=-1/0,right:n=1/0,top:a=-1/0,bottom:s=1/0}=t;return[[e,n],[a,s]]}}),rt={ArrowRight:(t,e=1)=>[t*e,0],ArrowLeft:(t,e=1)=>[-1*t*e,0],ArrowUp:(t,e=1)=>[0,-1*t*e],ArrowDown:(t,e=1)=>[0,t*e]};class ai extends G{constructor(...e){super(...e),D(this,"ingKey","dragging")}reset(){super.reset();const e=this.state;e._pointerId=void 0,e._pointerActive=!1,e._keyboardActive=!1,e._preventScroll=!1,e._delayed=!1,e.swipe=[0,0],e.tap=!1,e.canceled=!1,e.cancel=this.cancel.bind(this)}setup(){const e=this.state;if(e._bounds instanceof HTMLElement){const n=e._bounds.getBoundingClientRect(),a=e.currentTarget.getBoundingClientRect(),s={left:n.left-a.left+e.offset[0],right:n.right-a.right+e.offset[0],top:n.top-a.top+e.offset[1],bottom:n.bottom-a.bottom+e.offset[1]};e._bounds=O.bounds(s)}}cancel(){const e=this.state;e.canceled||(e.canceled=!0,e._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(e){const n=this.config,a=this.state;if(e.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(e.buttons):n.pointerButtons!==-1&&n.pointerButtons!==e.buttons))return;const s=this.ctrl.setEventIds(e);n.pointerCapture&&e.target.setPointerCapture(e.pointerId),!(s&&s.size>1&&a._pointerActive)&&(this.start(e),this.setupPointer(e),a._pointerId=re(e),a._pointerActive=!0,this.computeValues($(e)),this.computeInitial(),n.preventScrollAxis&&nn(e)!=="mouse"?(a._active=!1,this.setupScrollPrevention(e)):n.delay>0?(this.setupDelayTrigger(e),n.triggerAllEvents&&(this.compute(e),this.emit())):this.startPointerDrag(e))}startPointerDrag(e){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(e),this.emit()}pointerMove(e){const n=this.state,a=this.config;if(!n._pointerActive)return;const s=re(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;const r=$(e);if(document.pointerLockElement===e.target?n._delta=[e.movementX,e.movementY]:(n._delta=F.sub(r,n._values),this.computeValues(r)),F.addTo(n._movement,n._delta),this.compute(e),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(e);return}if(a.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===a.preventScrollAxis||a.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(e);return}else return;this.emit()}pointerUp(e){this.ctrl.setEventIds(e);try{this.config.pointerCapture&&e.target.hasPointerCapture(e.pointerId)&&e.target.releasePointerCapture(e.pointerId)}catch{}const n=this.state,a=this.config;if(!n._active||!n._pointerActive)return;const s=re(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(e);const[r,i]=n._distance;if(n.tap=r<=a.tapsThreshold&&i<=a.tapsThreshold,n.tap&&a.filterTaps)n._force=!0;else{const[o,u]=n._delta,[c,l]=n._movement,[m,f]=a.swipe.velocity,[p,h]=a.swipe.distance,y=a.swipe.duration;if(n.elapsedTime<y){const x=Math.abs(o/n.timeDelta),k=Math.abs(u/n.timeDelta);x>m&&Math.abs(c)>p&&(n.swipe[0]=Math.sign(o)),k>f&&Math.abs(l)>h&&(n.swipe[1]=Math.sign(u))}}this.emit()}pointerClick(e){!this.state.tap&&e.detail>0&&(e.preventDefault(),e.stopPropagation())}setupPointer(e){const n=this.config,a=n.device;n.pointerLock&&e.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,a,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(e){this.state._preventScroll&&e.cancelable&&e.preventDefault()}setupScrollPrevention(e){this.state._preventScroll=!1,si(e);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,e)}setupDelayTrigger(e){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(e)},this.config.delay)}keyDown(e){const n=rt[e.key];if(n){const a=this.state,s=e.shiftKey?10:e.altKey?.1:1;this.start(e),a._delta=n(this.config.keyboardDisplacement,s),a._keyboardActive=!0,F.addTo(a._movement,a._delta),this.compute(e),this.emit()}}keyUp(e){e.key in rt&&(this.state._keyboardActive=!1,this.setActive(),this.compute(e),this.emit())}bind(e){const n=this.config.device;e(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(e(n,"change",this.pointerMove.bind(this)),e(n,"end",this.pointerUp.bind(this)),e(n,"cancel",this.pointerUp.bind(this)),e("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(e("key","down",this.keyDown.bind(this)),e("key","up",this.keyUp.bind(this))),this.config.filterTaps&&e("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function si(t){"persist"in t&&typeof t.persist=="function"&&t.persist()}const z=typeof window<"u"&&window.document&&window.document.createElement;function un(){return z&&"ontouchstart"in window}function ri(){return un()||z&&window.navigator.maxTouchPoints>1}function ii(){return z&&"onpointerdown"in window}function oi(){return z&&"exitPointerLock"in window.document}function ui(){try{return"constructor"in GestureEvent}catch{return!1}}const T={isBrowser:z,gesture:ui(),touch:un(),touchscreen:ri(),pointer:ii(),pointerLock:oi()},li=250,ci=180,mi=.5,di=50,fi=250,hi=10,it={mouse:0,touch:0,pen:8},pi=C(C({},O),{},{device(t,e,{pointer:{touch:n=!1,lock:a=!1,mouse:s=!1}={}}){return this.pointerLock=a&&T.pointerLock,T.touch&&n?"touch":this.pointerLock?"mouse":T.pointer&&!s?"pointer":T.touch?"touch":"mouse"},preventScrollAxis(t,e,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&t?li:void 0,!(!T.touchscreen||n===!1))return t||(n!==void 0?"y":void 0)},pointerCapture(t,e,{pointer:{capture:n=!0,buttons:a=1,keys:s=!0}={}}){return this.pointerButtons=a,this.keys=s,!this.pointerLock&&this.device==="pointer"&&n},threshold(t,e,{filterTaps:n=!1,tapsThreshold:a=3,axis:s=void 0}){const r=F.toVector(t,n?a:s?1:0);return this.filterTaps=n,this.tapsThreshold=a,r},swipe({velocity:t=mi,distance:e=di,duration:n=fi}={}){return{velocity:this.transform(F.toVector(t)),distance:this.transform(F.toVector(e)),duration:n}},delay(t=0){switch(t){case!0:return ci;case!1:return 0;default:return t}},axisThreshold(t){return t?C(C({},it),t):it},keyboardDisplacement(t=hi){return t}});function ln(t){const[e,n]=t.overflow,[a,s]=t._delta,[r,i]=t._direction;(e<0&&a>0&&r<0||e>0&&a<0&&r>0)&&(t._movement[0]=t._movementBound[0]),(n<0&&s>0&&i<0||n>0&&s<0&&i>0)&&(t._movement[1]=t._movementBound[1])}const gi=30,vi=100;class yi extends rn{constructor(...e){super(...e),D(this,"ingKey","pinching"),D(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const e=this.state;e._touchIds=[],e.canceled=!1,e.cancel=this.cancel.bind(this),e.turns=0}computeOffset(){const{type:e,movement:n,lastOffset:a}=this.state;e==="wheel"?this.state.offset=F.add(n,a):this.state.offset=[(1+n[0])*a[0],n[1]+a[1]]}computeMovement(){const{offset:e,lastOffset:n}=this.state;this.state.movement=[e[0]/n[0],e[1]-n[1]]}axisIntent(){const e=this.state,[n,a]=e._movement;if(!e.axis){const s=Math.abs(n)*gi-Math.abs(a);s<0?e.axis="angle":s>0&&(e.axis="scale")}}restrictToAxis(e){this.config.lockDirection&&(this.state.axis==="scale"?e[1]=0:this.state.axis==="angle"&&(e[0]=0))}cancel(){const e=this.state;e.canceled||setTimeout(()=>{e.canceled=!0,e._active=!1,this.compute(),this.emit()},0)}touchStart(e){this.ctrl.setEventIds(e);const n=this.state,a=this.ctrl.touchIds;if(n._active&&n._touchIds.every(r=>a.has(r))||a.size<2)return;this.start(e),n._touchIds=Array.from(a).slice(0,2);const s=et(e,n._touchIds);s&&this.pinchStart(e,s)}pointerStart(e){if(e.buttons!=null&&e.buttons%2!==1)return;this.ctrl.setEventIds(e),e.target.setPointerCapture(e.pointerId);const n=this.state,a=n._pointerEvents,s=this.ctrl.pointerIds;if(n._active&&Array.from(a.keys()).every(i=>s.has(i))||(a.size<2&&a.set(e.pointerId,e),n._pointerEvents.size<2))return;this.start(e);const r=ge(...Array.from(a.values()));r&&this.pinchStart(e,r)}pinchStart(e,n){const a=this.state;a.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(e),this.emit()}touchMove(e){if(!this.state._active)return;const n=et(e,this.state._touchIds);n&&this.pinchMove(e,n)}pointerMove(e){const n=this.state._pointerEvents;if(n.has(e.pointerId)&&n.set(e.pointerId,e),!this.state._active)return;const a=ge(...Array.from(n.values()));a&&this.pinchMove(e,a)}pinchMove(e,n){const a=this.state,s=a._values[1],r=n.angle-s;let i=0;Math.abs(r)>270&&(i+=Math.sign(r)),this.computeValues([n.distance,n.angle-360*i]),a.origin=n.origin,a.turns=i,a._movement=[a._values[0]/a._initial[0]-1,a._values[1]-a._initial[1]],this.compute(e),this.emit()}touchEnd(e){this.ctrl.setEventIds(e),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(e),this.emit())}pointerEnd(e){const n=this.state;this.ctrl.setEventIds(e);try{e.target.releasePointerCapture(e.pointerId)}catch{}n._pointerEvents.has(e.pointerId)&&n._pointerEvents.delete(e.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(e),this.emit())}gestureStart(e){e.cancelable&&e.preventDefault();const n=this.state;n._active||(this.start(e),this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY],this.compute(e),this.emit())}gestureMove(e){if(e.cancelable&&e.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY];const a=n._movement;n._movement=[e.scale-1,e.rotation],n._delta=F.sub(n._movement,a),this.compute(e),this.emit()}gestureEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}wheel(e){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(a=>e[a]):!e[n])||(this.state._active?this.wheelChange(e):this.wheelStart(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(e){this.start(e),this.wheelChange(e)}wheelChange(e){"uv"in e||e.cancelable&&e.preventDefault();const a=this.state;a._delta=[-sn(e)[1]/vi*a.offset[0],0],F.addTo(a._movement,a._delta),ln(a),this.state.origin=[e.clientX,e.clientY],this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){const n=this.config.device;n&&(e(n,"start",this[n+"Start"].bind(this)),e(n,"change",this[n+"Move"].bind(this)),e(n,"end",this[n+"End"].bind(this)),e(n,"cancel",this[n+"End"].bind(this)),e("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&e("wheel","",this.wheel.bind(this),{passive:!1})}}const bi=C(C({},on),{},{device(t,e,{shared:n,pointer:{touch:a=!1}={}}){if(n.target&&!T.touch&&T.gesture)return"gesture";if(T.touch&&a)return"touch";if(T.touchscreen){if(T.pointer)return"pointer";if(T.touch)return"touch"}},bounds(t,e,{scaleBounds:n={},angleBounds:a={}}){const s=i=>{const o=at(K(n,i),{min:-1/0,max:1/0});return[o.min,o.max]},r=i=>{const o=at(K(a,i),{min:-1/0,max:1/0});return[o.min,o.max]};return typeof n!="function"&&typeof a!="function"?[s(),r()]:i=>[s(i),r(i)]},threshold(t,e,n){return this.lockDirection=n.axis==="lock",F.toVector(t,this.lockDirection?[.1,3]:0)},modifierKey(t){return t===void 0?"ctrlKey":t},pinchOnWheel(t=!0){return t}});class Ei extends G{constructor(...e){super(...e),D(this,"ingKey","moving")}move(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.state._active?this.moveChange(e):this.moveStart(e),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(e){this.start(e),this.computeValues($(e)),this.compute(e),this.computeInitial(),this.emit()}moveChange(e){if(!this.state._active)return;const n=$(e),a=this.state;a._delta=F.sub(n,a._values),F.addTo(a._movement,a._delta),this.computeValues(n),this.compute(e),this.emit()}moveEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}bind(e){e("pointer","change",this.move.bind(this)),e("pointer","leave",this.moveEnd.bind(this))}}const xi=C(C({},O),{},{mouseOnly:(t=!0)=>t});class Fi extends G{constructor(...e){super(...e),D(this,"ingKey","scrolling")}scroll(e){this.state._active||this.start(e),this.scrollChange(e),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(e){e.cancelable&&e.preventDefault();const n=this.state,a=qr(e);n._delta=F.sub(a,n._values),F.addTo(n._movement,n._delta),this.computeValues(a),this.compute(e),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("scroll","",this.scroll.bind(this))}}const Ci=O;class Ai extends G{constructor(...e){super(...e),D(this,"ingKey","wheeling")}wheel(e){this.state._active||this.start(e),this.wheelChange(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(e){const n=this.state;n._delta=sn(e),F.addTo(n._movement,n._delta),ln(n),this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("wheel","",this.wheel.bind(this))}}const Di=O;class ki extends G{constructor(...e){super(...e),D(this,"ingKey","hovering")}enter(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.start(e),this.computeValues($(e)),this.compute(e),this.emit())}leave(e){if(this.config.mouseOnly&&e.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const a=$(e);n._movement=n._delta=F.sub(a,n._values),this.computeValues(a),this.compute(e),n.delta=n.movement,this.emit()}bind(e){e("pointer","enter",this.enter.bind(this)),e("pointer","leave",this.leave.bind(this))}}const Si=C(C({},O),{},{mouseOnly:(t=!0)=>t}),Se=new Map,ve=new Map;function Ti(t){Se.set(t.key,t.engine),ve.set(t.key,t.resolver)}const _i={key:"drag",engine:ai,resolver:pi},Bi={key:"hover",engine:ki,resolver:Si},Ii={key:"move",engine:Ei,resolver:xi},wi={key:"pinch",engine:yi,resolver:bi},Mi={key:"scroll",engine:Fi,resolver:Ci},ji={key:"wheel",engine:Ai,resolver:Di};function Oi(t,e){if(t==null)return{};var n={},a=Object.keys(t),s,r;for(r=0;r<a.length;r++)s=a[r],!(e.indexOf(s)>=0)&&(n[s]=t[s]);return n}function Li(t,e){if(t==null)return{};var n=Oi(t,e),a,s;if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(s=0;s<r.length;s++)a=r[s],!(e.indexOf(a)>=0)&&Object.prototype.propertyIsEnumerable.call(t,a)&&(n[a]=t[a])}return n}const Pi={target(t){if(t)return()=>"current"in t?t.current:t},enabled(t=!0){return t},window(t=T.isBrowser?window:void 0){return t},eventOptions({passive:t=!0,capture:e=!1}={}){return{passive:t,capture:e}},transform(t){return t}},Ri=["target","eventOptions","window","enabled","transform"];function W(t={},e){const n={};for(const[a,s]of Object.entries(e))switch(typeof s){case"function":n[a]=s.call(n,t[a],a,t);break;case"object":n[a]=W(t[a],s);break;case"boolean":s&&(n[a]=t[a]);break}return n}function $i(t,e,n={}){const a=t,{target:s,eventOptions:r,window:i,enabled:o,transform:u}=a,c=Li(a,Ri);if(n.shared=W({target:s,eventOptions:r,window:i,enabled:o,transform:u},Pi),e){const l=ve.get(e);n[e]=W(C({shared:n.shared},c),l)}else for(const l in c){const m=ve.get(l);m&&(n[l]=W(C({shared:n.shared},c[l]),m))}return n}class cn{constructor(e,n){D(this,"_listeners",new Set),this._ctrl=e,this._gestureKey=n}add(e,n,a,s,r){const i=this._listeners,o=Hr(n,a),u=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},c=C(C({},u),r);e.addEventListener(o,s,c);const l=()=>{e.removeEventListener(o,s,c),i.delete(l)};return i.add(l),l}clean(){this._listeners.forEach(e=>e()),this._listeners.clear()}}class Ni{constructor(){D(this,"_timeouts",new Map)}add(e,n,a=140,...s){this.remove(e),this._timeouts.set(e,window.setTimeout(n,a,...s))}remove(e){const n=this._timeouts.get(e);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(e=>void window.clearTimeout(e)),this._timeouts.clear()}}class Yi{constructor(e){D(this,"gestures",new Set),D(this,"_targetEventStore",new cn(this)),D(this,"gestureEventStores",{}),D(this,"gestureTimeoutStores",{}),D(this,"handlers",{}),D(this,"config",{}),D(this,"pointerIds",new Set),D(this,"touchIds",new Set),D(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),Gi(this,e)}setEventIds(e){if(ee(e))return this.touchIds=new Set(Wr(e)),this.touchIds;if("pointerId"in e)return e.type==="pointerup"||e.type==="pointercancel"?this.pointerIds.delete(e.pointerId):e.type==="pointerdown"&&this.pointerIds.add(e.pointerId),this.pointerIds}applyHandlers(e,n){this.handlers=e,this.nativeHandlers=n}applyConfig(e,n){this.config=$i(e,n,this.config)}clean(){this._targetEventStore.clean();for(const e of this.gestures)this.gestureEventStores[e].clean(),this.gestureTimeoutStores[e].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...e){const n=this.config.shared,a={};let s;if(!(n.target&&(s=n.target(),!s))){if(n.enabled){for(const i of this.gestures){const o=this.config[i],u=ot(a,o.eventOptions,!!s);if(o.enabled){const c=Se.get(i);new c(this,e,i).bind(u)}}const r=ot(a,n.eventOptions,!!s);for(const i in this.nativeHandlers)r(i,"",o=>this.nativeHandlers[i](C(C({},this.state.shared),{},{event:o,args:e})),void 0,!0)}for(const r in a)a[r]=Jr(...a[r]);if(!s)return a;for(const r in a){const{device:i,capture:o,passive:u}=Ur(r);this._targetEventStore.add(s,i,"",a[r],{capture:o,passive:u})}}}}function L(t,e){t.gestures.add(e),t.gestureEventStores[e]=new cn(t,e),t.gestureTimeoutStores[e]=new Ni}function Gi(t,e){e.drag&&L(t,"drag"),e.wheel&&L(t,"wheel"),e.scroll&&L(t,"scroll"),e.move&&L(t,"move"),e.pinch&&L(t,"pinch"),e.hover&&L(t,"hover")}const ot=(t,e,n)=>(a,s,r,i={},o=!1)=>{var u,c;const l=(u=i.capture)!==null&&u!==void 0?u:e.capture,m=(c=i.passive)!==null&&c!==void 0?c:e.passive;let f=o?a:Gr(a,s,l);n&&m&&(f+="Passive"),t[f]=t[f]||[],t[f].push(r)},zi=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function Ui(t){const e={},n={},a=new Set;for(let s in t)zi.test(s)?(a.add(RegExp.lastMatch),n[s]=t[s]):e[s]=t[s];return[n,e,a]}function P(t,e,n,a,s,r){if(!t.has(n)||!Se.has(a))return;const i=n+"Start",o=n+"End",u=c=>{let l;return c.first&&i in e&&e[i](c),n in e&&(l=e[n](c)),c.last&&o in e&&e[o](c),l};s[a]=u,r[a]=r[a]||{}}function Hi(t,e){const[n,a,s]=Ui(t),r={};return P(s,n,"onDrag","drag",r,e),P(s,n,"onWheel","wheel",r,e),P(s,n,"onScroll","scroll",r,e),P(s,n,"onPinch","pinch",r,e),P(s,n,"onMove","move",r,e),P(s,n,"onHover","hover",r,e),{handlers:r,config:e,nativeHandlers:a}}function Xi(t,e={},n,a){const s=N.useMemo(()=>new Yi(t),[]);if(s.applyHandlers(t,a),s.applyConfig(e,n),N.useEffect(s.effect.bind(s)),N.useEffect(()=>s.clean.bind(s),[]),e.target===void 0)return s.bind.bind(s)}function Vi(t){return t.forEach(Ti),function(n,a){const{handlers:s,nativeHandlers:r,config:i}=Hi(n,a||{});return Xi(s,i,void 0,r)}}function Wi(t,e){return Vi([_i,wi,Mi,ji,Ii,Bi])(t,e||{})}function qi(t){Q("translateViewport",t)}function Ki(t){ke("translateViewport",t)}function Zi({children:t}){const e=g.useRef(null),[n,a]=g.useState(1),[s,r]=g.useState({x:0,y:0}),[i,o]=g.useState(!1);return Wi({onPinch({origin:u,delta:c,pinching:l}){var y;o(l);const m=Math.max(n+c[0],.1),f=(y=e.current)==null?void 0:y.getBoundingClientRect(),p=u[0]-((f==null?void 0:f.left)??0),h=u[1]-((f==null?void 0:f.top)??0);r({x:s.x-(p/n-p/m),y:s.y-(h/n-h/m)}),a(m)},onWheel({event:u,delta:[c,l],wheeling:m}){u.preventDefault(),o(m),r({x:s.x-c/n,y:s.y-l/n})}},{target:e,eventOptions:{passive:!1}}),Ki(u=>{const c=window.innerWidth,l=window.innerHeight,m=c/2-u.x*n,f=l/2-u.y*n;r({x:m/n,y:f/n})}),d.jsx(Ji,{children:d.jsx(Qi,{ref:e,children:d.jsx(eo,{style:{"--zoom":n,"--translate-x":s.x,"--translate-y":s.y},"data-is-interacting":i,children:t})})})}const Ji=b.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,Qi=b.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,eo=b.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function q(t,e){const n=t.cities.find(r=>r.id===e);if(!n)return 0;const a=t.explosions.filter(r=>r.startTimestamp<=t.timestamp&&r.endTimestamp>t.timestamp&&Math.hypot(r.position.x-n.position.x,r.position.y-n.position.y)<=r.radius);let s=n.population;for(const r of a){const o=1-Math.hypot(r.position.x-n.position.x,r.position.y-n.position.y)/r.radius;s*=1-o}return Math.floor(s)}function to(t,e){return t.cities.filter(n=>n.stateId===e).map(n=>[n,q(t,n.id)])}function mn(t){return Object.fromEntries(t.states.map(e=>[e.id,to(t,e.id).reduce((n,[,a])=>n+a,0)]))}function dn({worldState:t,setWorldState:e}){const n=t.states.find(o=>o.isPlayerControlled);if(!n)return null;const a=(o,u)=>{const c=t.states.map(l=>l.id===n.id?{...l,strategies:{...l.strategies,[o]:u}}:l);e({...t,states:c})},s=o=>{if(o===n.id)return"#4CAF50";switch(n.strategies[o]){case v.FRIENDLY:return"#4CAF50";case v.NEUTRAL:return"#FFC107";case v.HOSTILE:return"#F44336";default:return"#9E9E9E"}},r=mn(t),i=o=>{const u=t.cities.filter(p=>p.stateId===o),c=t.launchSites.filter(p=>p.stateId===o);if(u.length===0&&c.length===0){console.warn("No position information available for this state");return}const l=[...u.map(p=>p.position),...c.map(p=>p.position)],m=l.reduce((p,h)=>({x:p.x+h.x,y:p.y+h.y}),{x:0,y:0}),f={x:m.x/l.length,y:m.y/l.length};qi(f)};return d.jsx(no,{children:t.states.map(o=>{var u;return d.jsxs(ao,{relationshipColor:s(o.id),onClick:()=>i(o.id),children:[d.jsx(so,{children:o.name.charAt(0)}),d.jsxs(ro,{children:[d.jsx(io,{children:o.name}),d.jsx(oo,{children:((u=r[o.id])==null?void 0:u.toLocaleString())??"N/A"}),o.id!==n.id?d.jsx("select",{value:n.strategies[o.id],onClick:c=>c.stopPropagation(),onChange:c=>a(o.id,c.target.value),children:Object.values(v).map(c=>d.jsx("option",{value:c,children:c},c))}):"This is you"]})]},o.id)})})}const no=b.div`
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
`,ao=b.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 5px;
  background: ${t=>`rgba(${parseInt(t.relationshipColor.slice(1,3),16)}, ${parseInt(t.relationshipColor.slice(3,5),16)}, ${parseInt(t.relationshipColor.slice(5,7),16)}, 0.2)`};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,so=b.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,ro=b.div`
  display: flex;
  flex-direction: column;
`,io=b.span`
  font-weight: bold;
  margin-bottom: 5px;
`,oo=b.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`;function uo({worldState:t,setWorldState:e}){return d.jsx(hr,{children:d.jsxs(mr,{children:[d.jsx(Zi,{children:d.jsx(jr,{state:t})}),d.jsx(dn,{worldState:t,setWorldState:e})]})})}const fn="fullScreenMessage",hn="fullScreenMessageAction";function w(t,e,n,a="",s,r,i){Q(fn,{message:t,startTimestamp:e,endTimestamp:n,messageId:a,actions:s,prompt:r,fullScreen:i??!!(s!=null&&s.length)})}function pn(t,e){Q(hn,{messageId:t,actionId:e})}function gn(t){ke(fn,e=>{t(e)})}function Te(t){ke(hn,e=>{t(e)})}function lo({worldState:t,onGameOver:e}){const[n,a]=g.useState(null),[s,r]=g.useState(!1);return g.useEffect(()=>{var p;if(s)return;const i=mn(t),o=Object.values(i).filter(h=>h>0).length,u=t.launchSites.length===0,c=t.timestamp,l=t.states.filter(h=>i[h.id]>0&&Object.entries(h.strategies).filter(([y,x])=>i[y]>0&&x===v.HOSTILE).length>0),m=t.launchSites.some(h=>h.lastLaunchTimestamp&&c-h.lastLaunchTimestamp<se),f=se-c;if(!l.length&&!m&&f>0&&f<=10&&(n?w(`Game will end in ${Math.ceil(f)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):a(c)),o<=1||u||!l.length&&!m&&c>se){const h=o===1?(p=t.states.find(y=>i[y.id]>0))==null?void 0:p.id:void 0;r(!0),w(["Game Over!","Results will be shown shortly..."],c,c+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{e({populations:i,winner:h,stateNames:Object.fromEntries(t.states.map(y=>[y.id,y.name])),playerStateId:t.states.find(y=>y.isPlayerControlled).id})},5e3)}},[t,e,n,s]),null}const co="/assets/player-lost-background-D2A_VJ6-.png",mo="/assets/player-won-background-CkXgF24i.png",ut="/assets/draw-background-EwLQ9g28.png",fo=b.div`
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
`,ho=({setGameState:t})=>{const{state:{result:e}}=ct(),n=()=>{t(Z,{stateName:e.stateNames[e.playerStateId]})};let a,s;return e.winner?e.winner===e.playerStateId?(a=mo,s=`Congratulations! ${e.stateNames[e.playerStateId]} has won with ${e.populations[e.playerStateId]} population alive.`):e.winner!==void 0?(a=co,s=`${e.stateNames[e.winner]} has won with ${e.populations[e.winner]} population alive. Your state has fallen.`):(a=ut,s="The game has ended in an unexpected state."):(a=ut,s="It's a draw! The world is partially destroyed, but there's still hope."),d.jsx(fo,{backgroundImage:a,children:d.jsxs("div",{children:[d.jsx("h2",{children:"Game Over"}),d.jsx("p",{children:s}),d.jsx("button",{onClick:n,children:"Play Again"}),d.jsx("br",{}),d.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},ye={Component:ho,path:"played"};function po({worldState:t}){var c;const[e,n]=g.useState([]),[a,s]=g.useState(null);gn(l=>{n(m=>l.messageId&&m.find(f=>f.messageId===l.messageId)?[...m.map(f=>f.messageId===l.messageId?l:f)]:[l,...m])});const r=e.sort((l,m)=>l.actions&&!m.actions?-1:!l.actions&&m.actions?1:l.startTimestamp-m.startTimestamp);if(Te(l=>{n(m=>m.filter(f=>f.messageId!==l.messageId))}),g.useEffect(()=>{const l=r.find(m=>m.fullScreen&&m.startTimestamp<=t.timestamp&&m.endTimestamp>t.timestamp);s(l||null)},[r,t.timestamp]),!a)return null;const o=((l,m)=>m<l.startTimestamp?"pre":m<l.startTimestamp+.5?"pre-in":m>l.endTimestamp-.5?"post-in":m>l.endTimestamp?"post":"active")(a,t.timestamp),u=l=>Array.isArray(l)?l.map((m,f)=>d.jsx("div",{children:m},f)):l;return d.jsxs(yo,{"data-message-state":o,"data-action":(((c=a.actions)==null?void 0:c.length)??0)>0,children:[d.jsx(bo,{children:u(a.message)}),a.prompt&&a.actions&&d.jsx(Eo,{children:a.actions.map((l,m)=>d.jsx(xo,{onClick:()=>pn(a.messageId,l.id),children:l.text},m))})]})}const go=J`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`,vo=J`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: scale(0.9);
  }
`,yo=b.div`
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
    animation: ${go} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${vo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,bo=b.div`
  font-size: 4rem;
  color: white;
  text-align: center;
  max-width: 80%;
  white-space: pre-line;
`,Eo=b.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,xo=b.button`
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
`,vn="ALLIANCEPROPOSAL";function Fo(t,e,n,a=!1){const s=`${vn}_${t.id}_${e.id}`,r=a?`${t.name} has become friendly towards you. Do you want to form an alliance?`:`${t.name} proposes an alliance with ${e.name}. Do you accept?`,i=n.timestamp,o=i+10;w(r,i,o,s,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function Co({worldState:t,setWorldState:e}){return Te(n=>{if(n.messageId.startsWith(vn)){const[,a,s]=n.messageId.split("_"),r=t.states.find(o=>o.id===a),i=t.states.find(o=>o.id===s);if(!r||!(i!=null&&i.isPlayerControlled))return;if(n.actionId==="accept"){const o=t.states.map(u=>u.id===a||u.id===s?{...u,strategies:{...u.strategies,[a]:v.FRIENDLY,[s]:v.FRIENDLY}}:u);e({...t,states:o}),w(`Alliance formed between ${r.name} and ${i.name}!`,t.timestamp,t.timestamp+5)}else n.actionId==="reject"&&w(`${i.name} has rejected the alliance proposal from ${r.name}.`,t.timestamp,t.timestamp+5)}}),null}function Ao({worldState:t}){const e=t.states.find(p=>p.isPlayerControlled),[n,a]=g.useState(!1),[s,r]=g.useState({}),[i,o]=g.useState([]),[u,c]=g.useState([]),[l,m]=g.useState(!1),f=Math.round(t.timestamp*10)/10;return g.useEffect(()=>{!n&&t.timestamp>0&&(a(!0),w("The game has started!",t.timestamp,t.timestamp+3))},[f]),g.useEffect(()=>{var p,h,y,x;if(e){const k=Object.fromEntries(t.states.map(E=>[E.id,E.strategies]));for(const E of t.states)for(const A of t.states.filter(M=>M.id!==E.id))e&&A.id===e.id&&E.strategies[A.id]===v.FRIENDLY&&A.strategies[E.id]!==v.FRIENDLY&&((p=s[E.id])==null?void 0:p[A.id])!==v.FRIENDLY&&Fo(E,e,t,!0),A.strategies[E.id]===v.FRIENDLY&&E.strategies[A.id]===v.FRIENDLY&&(((h=s[A.id])==null?void 0:h[E.id])!==v.FRIENDLY||((y=s[E.id])==null?void 0:y[A.id])!==v.FRIENDLY)&&w(`${A.name} has formed alliance with ${E.isPlayerControlled?"you":E.name}!`,f,f+3),E.strategies[A.id]===v.HOSTILE&&((x=s[E.id])==null?void 0:x[A.id])!==v.HOSTILE&&w(A.isPlayerControlled?`${E.name} has declared war on You!`:`${E.isPlayerControlled?"You have":E.name} declared war on ${A.name}!`,f,f+3,void 0,void 0,void 0,E.isPlayerControlled||A.isPlayerControlled);r(k)}},[f]),g.useEffect(()=>{e&&t.cities.filter(p=>p.stateId===e.id).forEach(p=>{const h=i.find(E=>E.id===p.id);if(!h)return;const y=q(t,p.id)||0,k=(q({...t,cities:i},h.id)||0)-y;k>0&&w([`Your city ${p.name} has been hit!`,`${k} casualties reported.`],f,f+3,void 0,void 0,!1,!0)}),o(t.cities.map(p=>({...p})))},[f]),g.useEffect(()=>{if(e){const p=t.launchSites.filter(h=>h.stateId===e.id);u.length>0&&u.filter(y=>!p.some(x=>x.id===y.id)).forEach(()=>{w("One of your launch sites has been destroyed!",f,f+3,void 0,void 0,!1,!0)}),c(p)}},[f]),g.useEffect(()=>{if(e&&!l){const p=t.cities.filter(x=>x.stateId===e.id),h=t.launchSites.filter(x=>x.stateId===e.id);!p.some(x=>q(t,x.id)>0)&&h.length===0&&(w(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],f,f+5,void 0,void 0,!1,!0),m(!0))}},[f]),null}function Do({worldState:t}){const[e,n]=g.useState([]);gn(i=>{n(o=>i.messageId&&o.find(u=>u.messageId===i.messageId)?[...o.map(u=>u.messageId===i.messageId?i:u)]:[i,...o])}),Te(i=>{n(o=>o.filter(u=>u.messageId!==i.messageId))});const a=i=>Array.isArray(i)?i.map((o,u)=>d.jsx("div",{children:o},u)):i,s=(i,o)=>{const l=o-i;return l>60?0:l>50?1-(l-50)/10:1},r=g.useMemo(()=>{const i=t.timestamp,o=60;return e.filter(u=>{const c=u.startTimestamp||0;return i-c<=o}).map(u=>({...u,opacity:s(u.startTimestamp||0,i)}))},[e,t.timestamp]);return d.jsx(ko,{children:r.map((i,o)=>d.jsxs(So,{style:{opacity:i.opacity},children:[d.jsx("div",{children:a(i.message)}),i.prompt&&i.actions&&d.jsx(To,{children:i.actions.map((u,c)=>d.jsx(_o,{onClick:()=>pn(i.messageId,u.id),children:u.text},c))})]},o))})}const ko=b.div`
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
`,So=b.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,To=b.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,_o=b.button`
  font-size: 12px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function Bo({updateWorldTime:t,currentWorldTime:e}){const[n,a]=g.useState(!1),s=g.useRef(null);en(i=>{if(!s.current){s.current=i;return}const o=i-s.current;s.current=i,!(o<=0)&&n&&t(o/1e3)},!0);const r=i=>{const o=Math.floor(i/86400),u=Math.floor(i%86400/3600),c=Math.floor(i%3600/60),l=Math.floor(i%60);return[[o,"d"],[u,"h"],[c,"m"],[l,"s"]].filter(([m])=>!!m).map(([m,f])=>String(m)+f).join(" ")};return d.jsx(Io,{children:d.jsxs(wo,{children:[d.jsxs(Mo,{children:[e>0?"Current Time: ":"Game not started yet",r(e)]}),d.jsx(X,{onClick:()=>t(1),children:"+1s"}),d.jsx(X,{onClick:()=>t(10),children:"+10s"}),d.jsx(X,{onClick:()=>t(60),children:"+1m"}),d.jsx(X,{onClick:()=>a(!n),children:n?"Stop":"Start"})]})})}const Io=b.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,wo=b.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,X=b.button`
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
`,Mo=b.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`,jo=({setGameState:t})=>{const{state:{stateName:e}}=ct(),{worldState:n,setWorldState:a,updateWorldState:s}=ur(e);return d.jsxs(d.Fragment,{children:[d.jsx(uo,{worldState:n,setWorldState:a}),d.jsx(Bo,{updateWorldTime:r=>s(n,r),currentWorldTime:n.timestamp??0}),d.jsx(dn,{worldState:n,setWorldState:a}),d.jsx(po,{worldState:n}),d.jsx(Do,{worldState:n}),d.jsx(lo,{worldState:n,onGameOver:r=>t(ye,{result:r})}),d.jsx(Ao,{worldState:n}),d.jsx(Co,{worldState:n,setWorldState:a})]})},Z={Component:jo,path:"playing"},Oo="/assets/play-background-BASXrsIB.png",Lo=b.div`
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
    background-image: url(${Oo});
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
`,Po=({setGameState:t})=>{const[e,n]=g.useState(Kt(1)[0]),a=()=>{t(Z,{stateName:e})};return d.jsx(Lo,{children:d.jsxs("div",{children:[d.jsx("h1",{children:"Name your state:"}),d.jsx("input",{type:"text",placeholder:"Type your state name here",value:e,onChange:s=>n(s.currentTarget.value)}),d.jsx("br",{}),d.jsx("button",{onClick:a,disabled:!e,children:"Start game"}),d.jsx("br",{}),d.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},be={Component:Po,path:"play"},Ro="/assets/intro-background-D_km5uka.png",$o="/assets/nukes-game-title-vcFxx9vI.png",No=J`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,Yo=J`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,Go=b.div`
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
    background-image: url(${Ro});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${No} 60s ease-in-out infinite;
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
`,zo=b.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${t=>t.isFlashing?1:0};
  animation: ${t=>t.isFlashing?Yo:"none"} 4.5s forwards;
`,Uo=b.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,Ho=b.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,Xo=({setGameState:t})=>{const[e,n]=g.useState(!0);return g.useEffect(()=>{const a=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(a)},[]),d.jsxs(Go,{children:[d.jsx(zo,{isFlashing:e}),!e&&d.jsxs(Uo,{children:[d.jsx(Ho,{src:$o,alt:"Nukes game"}),d.jsx("button",{onClick:()=>t(be),children:"Play"})]})]})},lt={Component:Xo,path:""},Vo=Cn`
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
`,Wo=[{path:lt.path,element:d.jsx(V,{state:lt})},{path:be.path,element:d.jsx(V,{state:be})},{path:Z.path,element:d.jsx(V,{state:Z})},{path:ye.path,element:d.jsx(V,{state:ye})}];function Zo(){var n;const[t]=xn(),e=t.get("path")??"";return d.jsx(d.Fragment,{children:(n=Wo.find(a=>a.path===e))==null?void 0:n.element})}function V({state:t}){const e=Fn();return d.jsxs(d.Fragment,{children:[d.jsx(Vo,{}),d.jsx(t.Component,{setGameState:(n,a)=>e({search:"path="+n.path},{state:a})})]})}export{Zo as NukesApp,Wo as routes};
