import{c as _,g as yn,r as v,j as d,R as N,u as ut,a as bn,b as En}from"./index-BWNEuscw.js";import{d as E,m as K,f as xn}from"./styled-components.browser.esm-Dl7cJrR4.js";var y=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(y||{}),lt=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(lt||{}),B=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(B||{});function Fn(t,e,n){const a=[],s=Array(n).fill(null).map(()=>Array(e).fill(!1));for(let r=0;r<n;r++)for(let i=0;i<e;i++){const o=r*e+i;t[o].type===B.WATER&&Cn(i,r,e,n,t)&&(a.push([i,r,0]),s[r][i]=!0)}for(;a.length>0;){const[r,i,o]=a.shift(),l=i*e+r;t[l].type===B.WATER?t[l].depth=o+(Math.random()-Math.random())/5:t[l].type===B.GROUND&&(t[l].height=Math.sqrt(o)+(Math.random()-Math.random())/10);const c=[[-1,0],[1,0],[0,-1],[0,1]];for(const[u,f]of c){const h=r+u,g=i+f;ct(h,g,e,n)&&!s[g][h]&&(a.push([h,g,o+1]),s[g][h]=!0)}}}function Cn(t,e,n,a,s){return[[-1,0],[1,0],[0,-1],[0,1]].some(([i,o])=>{const l=t+i,c=e+o;if(ct(l,c,n,a)){const u=c*n+l;return s[u].type===B.GROUND}return!1})}function ct(t,e,n,a){return t>=0&&t<n&&e>=0&&e<a}var mt={exports:{}},Dn=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(t){var e=Dn,n=e.filter(function(s){return!!s.css}),a=e.filter(function(s){return!!s.vga});t.exports=function(s){var r=t.exports.get(s);return r&&r.value},t.exports.get=function(s){return s=s||"",s=s.trim().toLowerCase(),e.filter(function(r){return r.name.toLowerCase()===s}).pop()},t.exports.all=t.exports.get.all=function(){return e},t.exports.get.css=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),n.filter(function(r){return r.name.toLowerCase()===s}).pop()):n},t.exports.get.vga=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),a.filter(function(r){return r.name.toLowerCase()===s}).pop()):a}})(mt);var An=mt.exports,kn=1/0,_n="[object Symbol]",Bn=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,dt="\\ud800-\\udfff",Sn="\\u0300-\\u036f\\ufe20-\\ufe23",Tn="\\u20d0-\\u20f0",ft="\\u2700-\\u27bf",ht="a-z\\xdf-\\xf6\\xf8-\\xff",In="\\xac\\xb1\\xd7\\xf7",wn="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",Mn="\\u2000-\\u206f",jn=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",pt="A-Z\\xc0-\\xd6\\xd8-\\xde",On="\\ufe0e\\ufe0f",gt=In+wn+Mn+jn,vt="['’]",ke="["+gt+"]",Ln="["+Sn+Tn+"]",yt="\\d+",Pn="["+ft+"]",bt="["+ht+"]",Et="[^"+dt+gt+yt+ft+ht+pt+"]",Rn="\\ud83c[\\udffb-\\udfff]",$n="(?:"+Ln+"|"+Rn+")",Nn="[^"+dt+"]",xt="(?:\\ud83c[\\udde6-\\uddff]){2}",Ft="[\\ud800-\\udbff][\\udc00-\\udfff]",R="["+pt+"]",Hn="\\u200d",_e="(?:"+bt+"|"+Et+")",Yn="(?:"+R+"|"+Et+")",Be="(?:"+vt+"(?:d|ll|m|re|s|t|ve))?",Se="(?:"+vt+"(?:D|LL|M|RE|S|T|VE))?",Ct=$n+"?",Dt="["+On+"]?",Gn="(?:"+Hn+"(?:"+[Nn,xt,Ft].join("|")+")"+Dt+Ct+")*",zn=Dt+Ct+Gn,Un="(?:"+[Pn,xt,Ft].join("|")+")"+zn,Xn=RegExp([R+"?"+bt+"+"+Be+"(?="+[ke,R,"$"].join("|")+")",Yn+"+"+Se+"(?="+[ke,R+_e,"$"].join("|")+")",R+"?"+_e+"+"+Be,R+"+"+Se,yt,Un].join("|"),"g"),Vn=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,qn=typeof _=="object"&&_&&_.Object===Object&&_,Wn=typeof self=="object"&&self&&self.Object===Object&&self,Kn=qn||Wn||Function("return this")();function Zn(t){return t.match(Bn)||[]}function Jn(t){return Vn.test(t)}function Qn(t){return t.match(Xn)||[]}var ea=Object.prototype,ta=ea.toString,Te=Kn.Symbol,Ie=Te?Te.prototype:void 0,we=Ie?Ie.toString:void 0;function na(t){if(typeof t=="string")return t;if(sa(t))return we?we.call(t):"";var e=t+"";return e=="0"&&1/t==-kn?"-0":e}function aa(t){return!!t&&typeof t=="object"}function sa(t){return typeof t=="symbol"||aa(t)&&ta.call(t)==_n}function ra(t){return t==null?"":na(t)}function ia(t,e,n){return t=ra(t),e=n?void 0:e,e===void 0?Jn(t)?Qn(t):Zn(t):t.match(e)||[]}var oa=ia,ua=1/0,la="[object Symbol]",ca=/^\s+/,ve="\\ud800-\\udfff",At="\\u0300-\\u036f\\ufe20-\\ufe23",kt="\\u20d0-\\u20f0",_t="\\ufe0e\\ufe0f",ma="["+ve+"]",ae="["+At+kt+"]",se="\\ud83c[\\udffb-\\udfff]",da="(?:"+ae+"|"+se+")",Bt="[^"+ve+"]",St="(?:\\ud83c[\\udde6-\\uddff]){2}",Tt="[\\ud800-\\udbff][\\udc00-\\udfff]",It="\\u200d",wt=da+"?",Mt="["+_t+"]?",fa="(?:"+It+"(?:"+[Bt,St,Tt].join("|")+")"+Mt+wt+")*",ha=Mt+wt+fa,pa="(?:"+[Bt+ae+"?",ae,St,Tt,ma].join("|")+")",ga=RegExp(se+"(?="+se+")|"+pa+ha,"g"),va=RegExp("["+It+ve+At+kt+_t+"]"),ya=typeof _=="object"&&_&&_.Object===Object&&_,ba=typeof self=="object"&&self&&self.Object===Object&&self,Ea=ya||ba||Function("return this")();function xa(t){return t.split("")}function Fa(t,e,n,a){for(var s=t.length,r=n+-1;++r<s;)if(e(t[r],r,t))return r;return-1}function Ca(t,e,n){if(e!==e)return Fa(t,Da,n);for(var a=n-1,s=t.length;++a<s;)if(t[a]===e)return a;return-1}function Da(t){return t!==t}function Aa(t,e){for(var n=-1,a=t.length;++n<a&&Ca(e,t[n],0)>-1;);return n}function ka(t){return va.test(t)}function Me(t){return ka(t)?_a(t):xa(t)}function _a(t){return t.match(ga)||[]}var Ba=Object.prototype,Sa=Ba.toString,je=Ea.Symbol,Oe=je?je.prototype:void 0,Le=Oe?Oe.toString:void 0;function Ta(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var r=Array(s);++a<s;)r[a]=t[a+e];return r}function jt(t){if(typeof t=="string")return t;if(Ma(t))return Le?Le.call(t):"";var e=t+"";return e=="0"&&1/t==-ua?"-0":e}function Ia(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:Ta(t,e,n)}function wa(t){return!!t&&typeof t=="object"}function Ma(t){return typeof t=="symbol"||wa(t)&&Sa.call(t)==la}function ja(t){return t==null?"":jt(t)}function Oa(t,e,n){if(t=ja(t),t&&(n||e===void 0))return t.replace(ca,"");if(!t||!(e=jt(e)))return t;var a=Me(t),s=Aa(a,Me(e));return Ia(a,s).join("")}var La=Oa,re=1/0,Pa=9007199254740991,Ra=17976931348623157e292,Pe=NaN,$a="[object Symbol]",Na=/^\s+|\s+$/g,Ha=/^[-+]0x[0-9a-f]+$/i,Ya=/^0b[01]+$/i,Ga=/^0o[0-7]+$/i,ye="\\ud800-\\udfff",Ot="\\u0300-\\u036f\\ufe20-\\ufe23",Lt="\\u20d0-\\u20f0",Pt="\\ufe0e\\ufe0f",za="["+ye+"]",ie="["+Ot+Lt+"]",oe="\\ud83c[\\udffb-\\udfff]",Ua="(?:"+ie+"|"+oe+")",Rt="[^"+ye+"]",$t="(?:\\ud83c[\\udde6-\\uddff]){2}",Nt="[\\ud800-\\udbff][\\udc00-\\udfff]",Ht="\\u200d",Yt=Ua+"?",Gt="["+Pt+"]?",Xa="(?:"+Ht+"(?:"+[Rt,$t,Nt].join("|")+")"+Gt+Yt+")*",Va=Gt+Yt+Xa,qa="(?:"+[Rt+ie+"?",ie,$t,Nt,za].join("|")+")",ue=RegExp(oe+"(?="+oe+")|"+qa+Va,"g"),Wa=RegExp("["+Ht+ye+Ot+Lt+Pt+"]"),Ka=parseInt,Za=typeof _=="object"&&_&&_.Object===Object&&_,Ja=typeof self=="object"&&self&&self.Object===Object&&self,Qa=Za||Ja||Function("return this")(),es=ns("length");function ts(t){return t.split("")}function ns(t){return function(e){return e==null?void 0:e[t]}}function be(t){return Wa.test(t)}function zt(t){return be(t)?ss(t):es(t)}function as(t){return be(t)?rs(t):ts(t)}function ss(t){for(var e=ue.lastIndex=0;ue.test(t);)e++;return e}function rs(t){return t.match(ue)||[]}var is=Object.prototype,os=is.toString,Re=Qa.Symbol,us=Math.ceil,ls=Math.floor,$e=Re?Re.prototype:void 0,Ne=$e?$e.toString:void 0;function He(t,e){var n="";if(!t||e<1||e>Pa)return n;do e%2&&(n+=t),e=ls(e/2),e&&(t+=t);while(e);return n}function cs(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var r=Array(s);++a<s;)r[a]=t[a+e];return r}function Ut(t){if(typeof t=="string")return t;if(Xt(t))return Ne?Ne.call(t):"";var e=t+"";return e=="0"&&1/t==-re?"-0":e}function ms(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:cs(t,e,n)}function ds(t,e){e=e===void 0?" ":Ut(e);var n=e.length;if(n<2)return n?He(e,t):e;var a=He(e,us(t/zt(e)));return be(e)?ms(as(a),0,t).join(""):a.slice(0,t)}function Ye(t){var e=typeof t;return!!t&&(e=="object"||e=="function")}function fs(t){return!!t&&typeof t=="object"}function Xt(t){return typeof t=="symbol"||fs(t)&&os.call(t)==$a}function hs(t){if(!t)return t===0?t:0;if(t=gs(t),t===re||t===-re){var e=t<0?-1:1;return e*Ra}return t===t?t:0}function ps(t){var e=hs(t),n=e%1;return e===e?n?e-n:e:0}function gs(t){if(typeof t=="number")return t;if(Xt(t))return Pe;if(Ye(t)){var e=typeof t.valueOf=="function"?t.valueOf():t;t=Ye(e)?e+"":e}if(typeof t!="string")return t===0?t:+t;t=t.replace(Na,"");var n=Ya.test(t);return n||Ga.test(t)?Ka(t.slice(2),n?2:8):Ha.test(t)?Pe:+t}function vs(t){return t==null?"":Ut(t)}function ys(t,e,n){t=vs(t),e=ps(e);var a=e?zt(t):0;return e&&a<e?t+ds(e-a,n):t}var bs=ys,Es=(t,e,n,a)=>{const s=(t+(a||"")).toString().includes("%");if(typeof t=="string"?[t,e,n,a]=t.match(/(0?\.?\d{1,3})%?\b/g).map(Number):a!==void 0&&(a=parseFloat(a)),typeof t!="number"||typeof e!="number"||typeof n!="number"||t>255||e>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof a=="number"){if(!s&&a>=0&&a<=1)a=Math.round(255*a);else if(s&&a>=0&&a<=100)a=Math.round(255*a/100);else throw new TypeError(`Expected alpha value (${a}) as a fraction or percentage`);a=(a|256).toString(16).slice(1)}else a="";return(n|e<<8|t<<16|1<<24).toString(16).slice(1)+a};const H="a-f\\d",xs=`#?[${H}]{3}[${H}]?`,Fs=`#?[${H}]{6}([${H}]{2})?`,Cs=new RegExp(`[^#${H}]`,"gi"),Ds=new RegExp(`^${xs}$|^${Fs}$`,"i");var As=(t,e={})=>{if(typeof t!="string"||Cs.test(t)||!Ds.test(t))throw new TypeError("Expected a valid hex string");t=t.replace(/^#/,"");let n=1;t.length===8&&(n=Number.parseInt(t.slice(6,8),16)/255,t=t.slice(0,6)),t.length===4&&(n=Number.parseInt(t.slice(3,4).repeat(2),16)/255,t=t.slice(0,3)),t.length===3&&(t=t[0]+t[0]+t[1]+t[1]+t[2]+t[2]);const a=Number.parseInt(t,16),s=a>>16,r=a>>8&255,i=a&255,o=typeof e.alpha=="number"?e.alpha:n;if(e.format==="array")return[s,r,i,o];if(e.format==="css"){const l=o===1?"":` / ${Number((o*100).toFixed(2))}%`;return`rgb(${s} ${r} ${i}${l})`}return{red:s,green:r,blue:i,alpha:o}},ks=An,_s=oa,Bs=La,Ss=bs,Ts=Es,Vt=As;const J=.75,Q=.25,ee=16777215,Is=49979693;var ws=function(t){return"#"+Os(String(JSON.stringify(t)))};function Ms(t){var e=_s(t),n=[];return e.forEach(function(a){var s=ks(a);s&&n.push(Vt(Bs(s,"#"),{format:"array"}))}),n}function js(t){var e=[0,0,0];return t.forEach(function(n){for(var a=0;a<3;a++)e[a]+=n[a]}),[e[0]/t.length,e[1]/t.length,e[2]/t.length]}function Os(t){var e,n=Ms(t);n.length>0&&(e=js(n));var a=1,s=0,r=1;if(t.length>0)for(var i=0;i<t.length;i++)t[i].charCodeAt(0)>s&&(s=t[i].charCodeAt(0)),r=parseInt(ee/s),a=(a+t[i].charCodeAt(0)*r*Is)%ee;var o=(a*t.length%ee).toString(16);o=Ss(o,6,o);var l=Vt(o,{format:"array"});return e?Ts(Q*l[0]+J*e[0],Q*l[1]+J*e[1],Q*l[2]+J*e[2]):o}const Ls=yn(ws);function Ps(t){return[...Rs].sort(()=>Math.random()-Math.random()).slice(0,t)}const Rs=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function qt(t){return[...$s].sort(()=>Math.random()-Math.random()).slice(0,t)}const $s=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"],le=10,S=20,Ns=5,Hs=S/Ns,Ys=.5,Gs=500,z=.05,ce=5,te=60;function zs(){const t=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],e=Array.from({length:256},(s,r)=>r).sort(()=>Math.random()-.5),n=[...e,...e];function a(s,r,i){return s[0]*r+s[1]*i}return function(r,i){const o=Math.floor(r)&255,l=Math.floor(i)&255;r-=Math.floor(r),i-=Math.floor(i);const c=r*r*r*(r*(r*6-15)+10),u=i*i*i*(i*(i*6-15)+10),f=n[o]+l,h=n[o+1]+l;return(1+(a(t[n[f]&7],r,i)*(1-c)+a(t[n[h]&7],r-1,i)*c)*(1-u)+(a(t[n[f+1]&7],r,i-1)*(1-c)+a(t[n[h+1]&7],r-1,i-1)*c)*u)/2}}function me(t,e,n,a,s,r){const i=zs(),o=Math.floor(t.x/r),l=Math.floor(t.y/r),c=Math.floor(a/4),u=.5,f=.005,h=.7;for(let m=l-c;m<=l+c;m++)for(let p=o-c;p<=o+c;p++)if(p>=0&&p<a&&m>=0&&m<s){let b=p,D=m;for(let w=0;w<e;w++)Math.random()<h&&(b+=Math.random()>.5?1:-1,D+=Math.random()>.5?1:-1);b=Math.max(0,Math.min(a-1,b)),D=Math.max(0,Math.min(s-1,D));const T=Math.sqrt((b-o)*(b-o)+(D-l)*(D-l))/c,M=i(p*f,m*f);if(T<1&&M>u+T*.01){const w=m*a+p;n[w].type=B.GROUND,n[w].depth=void 0,n[w].height=(1-T)*2*(M-u)}}const g=Math.min(Math.max(l*a+o,0),a);n[g].type=B.GROUND,n[g].depth=void 0,n[g].height=1}function Us(t,e,n){return{x:Math.floor(Math.random()*(t*.8)+t*.1)*n,y:Math.floor(Math.random()*(e*.8)+e*.1)*n}}function Xs(t,e,n,a){if(t.x<0||t.y<0||t.x>=n||t.y>=a)return!1;const s=Math.floor(n/(Math.sqrt(e.length+1)*2));return e.every(r=>Math.abs(t.x-r.x)>s||Math.abs(t.y-r.y)>s)}function Vs(t,e,n){return e.every(a=>Math.sqrt(Math.pow(t.x-a.position.x,2)+Math.pow(t.y-a.position.y,2))>=n)}function qs(t,e,n,a,s,r){const i=[],o=[],l=[],c=S*3,u=qt(t*2).filter(m=>m!==e),f=5,h=Ps(t*f*2),g=[];for(let m=0;m<t;m++){const p=`state-${m+1}`,b=m===0?e:u.pop(),D=Ws(p,b,m===0);i.push(D),i.forEach(M=>{D.strategies[M.id]=y.NEUTRAL,M.strategies[p]=y.NEUTRAL});const T=Ks(g,n,a,s);g.push(T),me(T,n/2,r,n,a,s),Zs(p,T,f,h,o,l,c,s,r,n,a)}return{states:i,cities:o,launchSites:l}}function Ws(t,e,n){return{id:t,name:e,color:Ls(e),isPlayerControlled:n,strategies:{},generalStrategy:n?void 0:[y.NEUTRAL,y.HOSTILE,y.FRIENDLY].sort(()=>Math.random()-.5)[0]}}function Ks(t,e,n,a){let s,r=10;do if(s=Us(e,n,a),r--<=0)break;while(!Xs(s,t,e,n));return s}function Zs(t,e,n,a,s,r,i,o,l,c,u){const f=[];for(let h=0;h<n;h++){const g=Ge(e,f,i,30*o);f.push({position:g}),s.push({id:`city-${s.length+1}`,stateId:t,name:a.pop(),position:g,populationHistogram:[{timestamp:0,population:Math.floor(Math.random()*3e3)+1e3}]}),me(g,2,l,c,u,o)}for(let h=0;h<4;h++){const g=Ge(e,f,i,15*o);f.push({position:g}),r.push({type:lt.LAUNCH_SITE,id:`launch-site-${r.length+1}`,stateId:t,position:g}),me(g,1,l,c,u,o)}return f}function Ge(t,e,n,a){let s,r=10;do if(s={x:t.x+(Math.random()-.5)*a,y:t.y+(Math.random()-.5)*a},r--<=0)break;while(!Vs(s,e,n));return s}function Js({playerStateName:t,numberOfStates:e=3}){const a=Math.max(200,Math.ceil(Math.sqrt(e)*10)),s=a,r=[];for(let f=0;f<s;f++)for(let h=0;h<a;h++)r.push({id:`sector-${r.length+1}`,position:{x:h*16,y:f*16},rect:{left:h*16,top:f*16,right:(h+1)*16,bottom:(f+1)*16},type:B.WATER,depth:0,height:0});const{states:i,cities:o,launchSites:l}=qs(e,t,a,s,16,r);return Fn(r,a,s),{timestamp:0,states:i,cities:o,launchSites:l,sectors:r,missiles:[],explosions:[]}}function A(t,e,n,a){return Math.sqrt(Math.pow(n-t,2)+Math.pow(a-e,2))}function Qs(t){var e,n;for(const a of t.states){const s=t.cities.filter(u=>u.stateId===a.id),r=t.launchSites.filter(u=>u.stateId===a.id),i=t.cities.filter(u=>a.strategies[u.stateId]===y.HOSTILE&&u.stateId!==a.id&&u.populationHistogram.slice(-1)[0].population>0),o=t.missiles.filter(u=>a.strategies[u.stateId]!==y.FRIENDLY&&u.stateId!==a.id),l=t.launchSites.filter(u=>a.strategies[u.stateId]===y.HOSTILE&&u.stateId!==a.id),c=o.filter(u=>s.some(f=>de(u.target,f.position))||r.some(f=>de(u.target,f.position))).filter(u=>(t.timestamp-u.launchTimestamp)/(u.targetTimestamp-u.launchTimestamp)>.5);for(const u of t.launchSites.filter(f=>f.stateId===a.id)){if(u.nextLaunchTarget)continue;if(i.length===0&&l.length===0&&o.length===0)break;const f=ze(c.map(m=>({...m,interceptionPoint:er(m,u.position)})),u.position),h=t.missiles.filter(m=>m.stateId===a.id),g=Ue(f,h).filter(([,m])=>m<r.length);if(g.length>0)u.nextLaunchTarget=g[0][0].interceptionPoint??void 0;else{const m=Ue(ze([...l,...i],u.position),h);u.nextLaunchTarget=((n=(e=m==null?void 0:m[0])==null?void 0:e[0])==null?void 0:n.position)??void 0}}}return t}function er(t,e){const n=A(t.position.x,t.position.y,e.x,e.y);if(n<S)return null;const a=A(t.target.x,t.target.y,t.launch.x,t.launch.y),s=(t.target.x-t.launch.x)/a,r=(t.target.y-t.launch.y)/a,i={x:t.target.x-s*S*2,y:t.target.y-r*S*2},o=n/le,l=A(e.x,e.y,i.x,i.y)/le;return o<l||o>l+10?null:i}function de(t,e){const n=S;return A(t.x,t.y,e.x,e.y)<=n}function ze(t,e){return t.sort((n,a)=>A(n.position.x,n.position.y,e.x,e.y)-A(a.position.x,a.position.y,e.x,e.y))}function Ue(t,e){const n=new Map;for(const a of t)n.set(a,e.filter(s=>de(s.target,a.position)).length);return Array.from(n).sort((a,s)=>a[1]-s[1])}function tr(t){var e,n;for(const a of t.missiles.filter(s=>s.launchTimestamp===t.timestamp)){const s=t.states.find(i=>i.id===a.stateId),r=((e=t.cities.find(i=>A(i.position.x,i.position.y,a.target.x,a.target.y)<=S))==null?void 0:e.stateId)||((n=t.launchSites.find(i=>A(i.position.x,i.position.y,a.target.x,a.target.y)<=S))==null?void 0:n.stateId);if(s&&r&&s.id!==r){s.strategies[r]!==y.HOSTILE&&(s.strategies[r]=y.HOSTILE);const i=t.states.find(o=>o.id===r);i&&i.strategies[s.id]!==y.HOSTILE&&(i.strategies[s.id]=y.HOSTILE,t.states.forEach(o=>{o.id!==i.id&&o.strategies[i.id]===y.FRIENDLY&&i.strategies[o.id]===y.FRIENDLY&&(o.strategies[s.id]=y.HOSTILE,s.strategies[o.id]=y.HOSTILE)}))}}for(const a of t.states.filter(s=>!s.isPlayerControlled))nr(a,t);return t}function nr(t,e){const n=e.states.filter(i=>i.id!==t.id);t.strategies={...t.strategies},t.generalStrategy!==y.HOSTILE&&n.forEach(i=>{i.strategies[t.id]===y.FRIENDLY&&t.strategies[i.id]===y.NEUTRAL&&(t.strategies[i.id]=y.FRIENDLY)});const a=n.filter(i=>Object.values(i.strategies).every(o=>o!==y.HOSTILE)&&i.generalStrategy!==y.HOSTILE);if(a.length>0&&t.generalStrategy===y.FRIENDLY){const i=a[Math.floor(Math.random()*a.length)];t.strategies[i.id]=y.FRIENDLY}const s=n.filter(i=>t.strategies[i.id]===y.FRIENDLY&&i.strategies[t.id]===y.FRIENDLY);s.forEach(i=>{n.forEach(o=>{o.strategies[i.id]===y.HOSTILE&&t.strategies[o.id]!==y.HOSTILE&&(t.strategies[o.id]=y.HOSTILE)})}),n.filter(i=>i.strategies[t.id]!==y.FRIENDLY&&t.strategies[i.id]!==y.FRIENDLY).forEach(i=>{if(ar(i,t,s,e)){const o=e.launchSites.filter(l=>l.stateId===t.id&&!l.lastLaunchTimestamp);if(o.length>0){const l=o[Math.floor(Math.random()*o.length)],c=[...e.cities.filter(u=>u.stateId===i.id),...e.launchSites.filter(u=>u.stateId===i.id)];if(c.length>0){const u=c[Math.floor(Math.random()*c.length)];l.nextLaunchTarget=u.position}}}})}function ar(t,e,n,a){const s=a.launchSites.filter(o=>o.stateId===t.id),r=a.launchSites.filter(o=>o.stateId===e.id||n.some(l=>l.id===o.stateId));return s.length<r.length?!0:a.missiles.some(o=>a.cities.some(l=>l.stateId===t.id&&A(l.position.x,l.position.y,o.target.x,o.target.y)<=S)||a.launchSites.some(l=>l.stateId===t.id&&A(l.position.x,l.position.y,o.target.x,o.target.y)<=S))}function sr(t,e){for(;e>0;){const n=rr(t,e>z?z:e);e=e>z?e-z:0,t=n}return t}function rr(t,e){const n=t.timestamp+e;let a={timestamp:n,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,explosions:t.explosions,sectors:t.sectors};for(const s of a.missiles){const r=(n-s.launchTimestamp)/(s.targetTimestamp-s.launchTimestamp);s.position={x:s.launch.x+(s.target.x-s.launch.x)*r,y:s.launch.y+(s.target.y-s.launch.y)*r}}for(const s of t.missiles.filter(r=>r.targetTimestamp<=n)){const r={id:`explosion-${Math.random()}`,missileId:s.id,startTimestamp:s.targetTimestamp,endTimestamp:s.targetTimestamp+Hs,position:s.target,radius:S};a.explosions.push(r);for(const l of t.cities.filter(c=>A(c.position.x,c.position.y,r.position.x,r.position.y)<=r.radius)){const c=l.populationHistogram[l.populationHistogram.length-1].population,u=Math.max(Gs,c*Ys);l.populationHistogram.push({timestamp:r.startTimestamp,population:Math.max(0,c-u)})}const i=t.missiles.filter(l=>l.id!==r.missileId&&l.launchTimestamp<=r.startTimestamp&&l.targetTimestamp>=r.startTimestamp).filter(l=>A(l.position.x,l.position.y,r.position.x,r.position.y)<=r.radius);for(const l of i)l.targetTimestamp=r.startTimestamp;const o=t.launchSites.filter(l=>A(l.position.x,l.position.y,r.position.x,r.position.y)<=r.radius);for(const l of o)a.launchSites=t.launchSites.filter(c=>c.id!==l.id)}a.explosions=a.explosions.filter(s=>s.endTimestamp>=n),a.missiles=a.missiles.filter(s=>s.targetTimestamp>n);for(const s of t.launchSites){if(s.nextLaunchTarget){if(s.lastLaunchTimestamp&&n-s.lastLaunchTimestamp<ce)continue}else continue;const r=A(s.position.x,s.position.y,s.nextLaunchTarget.x,s.nextLaunchTarget.y),i={id:Math.random()+"",stateId:s.stateId,launchSiteId:s.id,launch:s.position,launchTimestamp:n,position:s.position,target:s.nextLaunchTarget,targetTimestamp:n+r/le};a.missiles.push(i),s.lastLaunchTimestamp=n,s.nextLaunchTarget=void 0}return a=Qs(a),a=tr(a),a}function ir(t){const[e,n]=v.useState(()=>Js({playerStateName:t,numberOfStates:6})),a=v.useCallback((s,r)=>n(sr(s,r)),[]);return{worldState:e,updateWorldState:a,setWorldState:n}}const Wt={x:0,y:0,pointingObjects:[]},or=(t,e)=>e.type==="move"?{x:e.x,y:e.y,pointingObjects:t.pointingObjects}:e.type==="point"&&!t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,e.object]}:e.type==="unpoint"&&t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(n=>n.id!==e.object.id)}:t,Kt=v.createContext(Wt),Ee=v.createContext(()=>{});function ur({children:t}){const[e,n]=v.useReducer(or,Wt);return d.jsx(Kt.Provider,{value:e,children:d.jsx(Ee.Provider,{value:n,children:t})})}function lr(){return v.useContext(Kt)}function cr(){const t=v.useContext(Ee);return(e,n)=>t({type:"move",x:e,y:n})}function xe(){const t=v.useContext(Ee);return[e=>t({type:"point",object:e}),e=>t({type:"unpoint",object:e})]}const Fe={},mr=(t,e)=>e.type==="clear"?Fe:e.type==="set"?{...t,selectedObject:e.object}:t,Zt=v.createContext(Fe),Jt=v.createContext(()=>{});function dr({children:t}){const[e,n]=v.useReducer(mr,Fe);return d.jsx(Zt.Provider,{value:e,children:d.jsx(Jt.Provider,{value:n,children:t})})}function fr(t){var a;const e=v.useContext(Jt);return[((a=v.useContext(Zt).selectedObject)==null?void 0:a.id)===t.id,()=>e({type:"set",object:t})]}function Ce(t,e){const n=new CustomEvent(t,{bubbles:!0,detail:e});document.dispatchEvent(n)}function Qt(t,e){v.useEffect(()=>{const n=a=>{e(a.detail)};return document.addEventListener(t,n,!1),()=>{document.removeEventListener(t,n,!1)}},[t,e])}const hr=N.memo(({sectors:t})=>{const e=v.useRef(null),[n,a]=xe();return v.useEffect(()=>{const s=e.current,r=s==null?void 0:s.getContext("2d");if(!s||!r)return;const i=Math.min(...t.map(m=>m.rect.left)),o=Math.min(...t.map(m=>m.rect.top)),l=Math.max(...t.map(m=>m.rect.right)),c=Math.max(...t.map(m=>m.rect.bottom)),u=l-i,f=c-o;s.width=u,s.height=f,s.style.width=`${u}px`,s.style.height=`${f}px`;const h=Math.max(...t.filter(m=>m.type===B.WATER).map(m=>m.depth||0)),g=Math.max(...t.filter(m=>m.type===B.GROUND).map(m=>m.height||0));r.clearRect(0,0,u,f),t.forEach(m=>{const{fillStyle:p,drawSector:b}=pr(m,h,g);r.fillStyle=p,b(r,m.rect,i,o)})},[t]),v.useEffect(()=>{const s=e.current;let r;const i=o=>{const l=s==null?void 0:s.getBoundingClientRect(),c=o.clientX-((l==null?void 0:l.left)||0),u=o.clientY-((l==null?void 0:l.top)||0),f=t.find(h=>c>=h.rect.left&&c<=h.rect.right&&u>=h.rect.top&&u<=h.rect.bottom);f&&(r&&a(r),n(f),r=f)};return s==null||s.addEventListener("mousemove",i),()=>{s==null||s.removeEventListener("mousemove",i)}},[t,n,a]),d.jsx("canvas",{ref:e})});function pr(t,e,n){switch(t.type){case B.GROUND:return{fillStyle:Xe(t.height||0,n),drawSector:(a,s,r,i)=>{a.fillStyle=Xe(t.height||0,n),a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}};case B.WATER:return{fillStyle:"rgb(0, 34, 93)",drawSector:(a,s,r,i)=>{const o=(t.depth||0)/e,l=Math.round(0+34*(1-o)),c=Math.round(137+-103*o),u=Math.round(178+-85*o);a.fillStyle=`rgb(${l}, ${c}, ${u})`,a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(a,s,r,i)=>{a.fillStyle="rgb(0, 34, 93)",a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}}}}function Xe(t,e){const n=t/e;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const a=Math.round(34+67*((n-.5)/.3)),s=Math.round(100+-33*((n-.5)/.3)),r=Math.round(34+-1*((n-.5)/.3));return`rgb(${a}, ${s}, ${r})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}const U=S*2;function gr({state:t,cities:e,launchSites:n}){const{boundingBox:a,pathData:s}=N.useMemo(()=>{const r=[...e.filter(c=>c.stateId===t.id).map(c=>c.position),...n.filter(c=>c.stateId===t.id).map(c=>c.position)].map(({x:c,y:u})=>[{x:c,y:u},{x:c+U,y:u},{x:c,y:u+U},{x:c-U,y:u},{x:c,y:u-U}]).flat(),i=br(r),o=xr(i),l=i.map((c,u)=>`${u===0?"M":"L"} ${c.x-o.minX} ${c.y-o.minY}`).join(" ")+"Z";return{boundingBox:o,pathData:l}},[t,e,n]);return d.jsx(vr,{width:a.maxX-a.minX,height:a.maxY-a.minY,style:{transform:`translate(${a.minX}px, ${a.minY}px)`},children:d.jsx(yr,{d:s,fill:"none",stroke:t.color,strokeWidth:"2"})})}const vr=E.svg`
  position: absolute;
  pointer-events: none;
`,yr=E.path``;function br(t){if(t.length<3)return t;const e=t.reduce((s,r)=>r.y<s.y?r:s,t[0]),n=t.sort((s,r)=>{const i=Math.atan2(s.y-e.y,s.x-e.x),o=Math.atan2(r.y-e.y,r.x-e.x);return i-o}),a=[n[0],n[1]];for(let s=2;s<n.length;s++){for(;a.length>1&&!Er(a[a.length-2],a[a.length-1],n[s]);)a.pop();a.push(n[s])}return a}function Er(t,e,n){return(e.x-t.x)*(n.y-t.y)-(e.y-t.y)*(n.x-t.x)>0}function xr(t){return t.reduce((n,a)=>({minX:Math.min(n.minX,a.x),minY:Math.min(n.minY,a.y),maxX:Math.max(n.maxX,a.x),maxY:Math.max(n.maxY,a.y)}),{minX:1/0,minY:1/0,maxX:-1/0,maxY:-1/0})}function Fr({city:t}){const[e,n]=xe(),a=t.populationHistogram[t.populationHistogram.length-1].population,s=Math.max(...t.populationHistogram.map(i=>i.population)),r=Math.max(5,10*(a/s));return d.jsx(Cr,{onMouseEnter:()=>e(t),onMouseLeave:()=>n(t),style:{"--x":t.position.x,"--y":t.position.y,"--size":r,"--opacity":a>0?1:.3},children:d.jsxs(Dr,{children:[t.name,": ",a.toLocaleString()," population"]})})}const Cr=E.div`
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
`,Dr=E.div`
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
`;function Ar({launchSite:t,worldTimestamp:e,isPlayerControlled:n}){const[a,s]=fr(t),[r,i]=xe(),o=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+ce>e,l=o?(e-t.lastLaunchTimestamp)/ce:0;return d.jsx(kr,{onMouseEnter:()=>r(t),onMouseLeave:()=>i(t),onClick:()=>n&&s(),style:{"--x":t.position.x,"--y":t.position.y,"--cooldown-progress":l},"data-selected":a,"data-cooldown":o})}const kr=E.div`
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
`;function en(t,e){e===void 0&&(e=!0);var n=v.useRef(null),a=v.useRef(!1),s=v.useRef(t);s.current=t;var r=v.useCallback(function(o){a.current&&(s.current(o),n.current=requestAnimationFrame(r))},[]),i=v.useMemo(function(){return[function(){a.current&&(a.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){a.current||(a.current=!0,n.current=requestAnimationFrame(r))},function(){return a.current}]},[]);return v.useEffect(function(){return e&&i[1](),i[0]},[]),i}function _r(t,e,n){if(e.startTimestamp>n||e.endTimestamp<n)return;const a=Math.pow(Math.min(Math.max(0,(n-e.startTimestamp)/(e.endTimestamp-e.startTimestamp)),1),.15);t.fillStyle=`rgb(${255*a}, ${255*(1-a)}, 0)`,t.beginPath(),t.arc(e.position.x,e.position.y,e.radius*a,0,2*Math.PI),t.fill()}function Br(t,e,n){e.launchTimestamp>n||e.targetTimestamp<n||(t.fillStyle="rgb(0, 255, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,1,0,2*Math.PI),t.fill())}function Sr(t,e,n){if(e.launchTimestamp>n||e.targetTimestamp<n)return;const a=Math.min(Math.max(n-5,e.launchTimestamp)-e.launchTimestamp,e.targetTimestamp-e.launchTimestamp),s=e.targetTimestamp-e.launchTimestamp,r=a/s,i=e.launch.x+(e.target.x-e.launch.x)*r,o=e.launch.y+(e.target.y-e.launch.y)*r,l={x:i,y:o},c=e.position,u=t.createLinearGradient(l.x,l.y,c.x,c.y);u.addColorStop(0,"rgba(255, 255, 255, 0)"),u.addColorStop(1,"rgba(255, 255, 255, 0.5)"),t.strokeStyle=u,t.lineWidth=1,t.beginPath(),t.moveTo(l.x,l.y),t.lineTo(c.x,c.y),t.stroke()}function Tr({state:t}){const e=v.useRef(null);return v.useLayoutEffect(()=>{const a=e.current;if(!a)return;const s=Math.min(...t.sectors.map(u=>u.rect.left)),r=Math.min(...t.sectors.map(u=>u.rect.top)),i=Math.max(...t.sectors.map(u=>u.rect.right)),o=Math.max(...t.sectors.map(u=>u.rect.bottom)),l=i-s,c=o-r;a.width=l,a.height=c,a.style.width=`${l}px`,a.style.height=`${c}px`},[t.sectors]),en(()=>{const a=e.current;if(!a)return;const s=a.getContext("2d");s&&(s.clearRect(0,0,a.width,a.height),t.missiles.forEach(r=>{Sr(s,r,t.timestamp)}),t.missiles.filter(r=>r.launchTimestamp<t.timestamp&&r.targetTimestamp>t.timestamp).forEach(r=>{Br(s,r,t.timestamp)}),t.explosions.filter(r=>r.startTimestamp<t.timestamp&&r.endTimestamp>t.timestamp).forEach(r=>{_r(s,r,t.timestamp)}))}),d.jsx(Ir,{ref:e})}const Ir=E.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function wr({state:t}){const e=cr();return d.jsxs(Mr,{onMouseMove:n=>e(n.clientX,n.clientY),onClick:()=>Ce("world-click"),children:[d.jsx(hr,{sectors:t.sectors}),t.states.map(n=>d.jsx(gr,{state:n,cities:t.cities,launchSites:t.launchSites},n.id)),t.cities.map(n=>d.jsx(Fr,{city:n},n.id)),t.launchSites.map(n=>{var a;return d.jsx(Ar,{launchSite:n,worldTimestamp:t.timestamp,isPlayerControlled:n.stateId===((a=t.states.find(s=>s.isPlayerControlled))==null?void 0:a.id)},n.id)}),d.jsx(Tr,{state:t})]})}const Mr=E.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function Ve(t,e){let n=t[0];for(const a of t)a.timestamp<e&&a.timestamp>n.timestamp&&(n=a);return n}function jr({worldState:t}){const e=lr(),n=Object.fromEntries(t.states.map(r=>[r.id,t.cities.filter(i=>i.stateId===r.id).map(i=>[i,Ve(i.populationHistogram,t.timestamp).population])])),a=t.states.map(r=>[r,n[r.id].reduce((i,[,o])=>i+o,0)]),s=t.cities.reduce((r,i)=>r+Ve(i.populationHistogram,t.timestamp).population,0);return d.jsx(Or,{children:d.jsxs("ul",{children:[d.jsxs("li",{children:["Time: ",t.timestamp.toFixed(2)]}),d.jsxs("li",{children:["Pointing object: ",e.pointingObjects.length]}),d.jsxs("li",{children:["World population: ",s]}),d.jsx("li",{children:"Population: "}),d.jsx("ul",{children:a.map(([r,i])=>d.jsxs("li",{children:[r.name,": ",i]},r.id))})]})})}const Or=E.div`
  position: fixed;
  left: 0;
  top: 0;
  z-index: 1;

  width: 250px;
  min-width: 200px;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgb(0, 255, 0);

  li {
    text-align: left;
  }
`;function Lr({worldState:t,setWorldState:e}){const n=t.states.find(s=>s.isPlayerControlled);if(!n)return null;const a=(s,r)=>{const i=t.states.map(o=>o.id===n.id?{...o,strategies:{...o.strategies,[s]:r}}:o);e({...t,states:i})};return d.jsx(Pr,{children:t.states.map(s=>s.id!==n.id?d.jsxs("div",{children:[d.jsx("span",{children:s.name}),d.jsx("select",{value:n.strategies[s.id],onChange:r=>a(s.id,r.target.value),children:Object.values(y).map(r=>d.jsx("option",{value:r,children:r},r))})]},s.id):null)})}const Pr=E.div`
  position: fixed;
  left: 0;
  bottom: 0;
  z-index: 1;

  max-width: 25%;
  min-width: 200px;
  min-height: 200px;
  overflow-y: auto;

  padding: 10px;

  color: white;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgb(0, 255, 0);
`;function Rr({updateWorldTime:t}){const[e,n]=v.useState(!1),a=v.useRef(null);return en(s=>{if(!a.current){a.current=s;return}const r=s-a.current;a.current=s,!(r<=0)&&e&&t(r/1e3)},!0),d.jsxs($r,{children:[d.jsx("button",{onClick:()=>t(1),children:"+1 Second"}),d.jsx("button",{onClick:()=>t(10),children:"+10 Seconds"}),d.jsx("button",{onClick:()=>t(60),children:"+60 seconds"}),d.jsx("button",{onClick:()=>n(!e),children:e?"Stop autoplay":"Start autoplay"})]})}const $r=E.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  flex-grow: 0;

  border: 1px solid rgb(0, 255, 0);
  padding: 5px 10px;

  text-align: left;
  color: white;
  z-index: 1;
`;function Nr(t,e,n){return Math.max(e,Math.min(t,n))}const x={toVector(t,e){return t===void 0&&(t=e),Array.isArray(t)?t:[t,t]},add(t,e){return[t[0]+e[0],t[1]+e[1]]},sub(t,e){return[t[0]-e[0],t[1]-e[1]]},addTo(t,e){t[0]+=e[0],t[1]+=e[1]},subTo(t,e){t[0]-=e[0],t[1]-=e[1]}};function qe(t,e,n){return e===0||Math.abs(e)===1/0?Math.pow(t,n*5):t*e*n/(e+n*t)}function We(t,e,n,a=.15){return a===0?Nr(t,e,n):t<e?-qe(e-t,n-e,a)+e:t>n?+qe(t-n,n-e,a)+n:t}function Hr(t,[e,n],[a,s]){const[[r,i],[o,l]]=t;return[We(e,r,i,a),We(n,o,l,s)]}function Yr(t,e){if(typeof t!="object"||t===null)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var a=n.call(t,e||"default");if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function Gr(t){var e=Yr(t,"string");return typeof e=="symbol"?e:String(e)}function C(t,e,n){return e=Gr(e),e in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function Ke(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(t);e&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(t,s).enumerable})),n.push.apply(n,a)}return n}function F(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?Ke(Object(n),!0).forEach(function(a){C(t,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):Ke(Object(n)).forEach(function(a){Object.defineProperty(t,a,Object.getOwnPropertyDescriptor(n,a))})}return t}const tn={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function Ze(t){return t?t[0].toUpperCase()+t.slice(1):""}const zr=["enter","leave"];function Ur(t=!1,e){return t&&!zr.includes(e)}function Xr(t,e="",n=!1){const a=tn[t],s=a&&a[e]||e;return"on"+Ze(t)+Ze(s)+(Ur(n,s)?"Capture":"")}const Vr=["gotpointercapture","lostpointercapture"];function qr(t){let e=t.substring(2).toLowerCase();const n=!!~e.indexOf("passive");n&&(e=e.replace("passive",""));const a=Vr.includes(e)?"capturecapture":"capture",s=!!~e.indexOf(a);return s&&(e=e.replace("capture","")),{device:e,capture:s,passive:n}}function Wr(t,e=""){const n=tn[t],a=n&&n[e]||e;return t+a}function Z(t){return"touches"in t}function nn(t){return Z(t)?"touch":"pointerType"in t?t.pointerType:"mouse"}function Kr(t){return Array.from(t.touches).filter(e=>{var n,a;return e.target===t.currentTarget||((n=t.currentTarget)===null||n===void 0||(a=n.contains)===null||a===void 0?void 0:a.call(n,e.target))})}function Zr(t){return t.type==="touchend"||t.type==="touchcancel"?t.changedTouches:t.targetTouches}function an(t){return Z(t)?Zr(t)[0]:t}function fe(t,e){try{const n=e.clientX-t.clientX,a=e.clientY-t.clientY,s=(e.clientX+t.clientX)/2,r=(e.clientY+t.clientY)/2,i=Math.hypot(n,a);return{angle:-(Math.atan2(n,a)*180)/Math.PI,distance:i,origin:[s,r]}}catch{}return null}function Jr(t){return Kr(t).map(e=>e.identifier)}function Je(t,e){const[n,a]=Array.from(t.touches).filter(s=>e.includes(s.identifier));return fe(n,a)}function ne(t){const e=an(t);return Z(t)?e.identifier:e.pointerId}function $(t){const e=an(t);return[e.clientX,e.clientY]}const Qe=40,et=800;function sn(t){let{deltaX:e,deltaY:n,deltaMode:a}=t;return a===1?(e*=Qe,n*=Qe):a===2&&(e*=et,n*=et),[e,n]}function Qr(t){var e,n;const{scrollX:a,scrollY:s,scrollLeft:r,scrollTop:i}=t.currentTarget;return[(e=a??r)!==null&&e!==void 0?e:0,(n=s??i)!==null&&n!==void 0?n:0]}function ei(t){const e={};if("buttons"in t&&(e.buttons=t.buttons),"shiftKey"in t){const{shiftKey:n,altKey:a,metaKey:s,ctrlKey:r}=t;Object.assign(e,{shiftKey:n,altKey:a,metaKey:s,ctrlKey:r})}return e}function q(t,...e){return typeof t=="function"?t(...e):t}function ti(){}function ni(...t){return t.length===0?ti:t.length===1?t[0]:function(){let e;for(const n of t)e=n.apply(this,arguments)||e;return e}}function tt(t,e){return Object.assign({},e,t||{})}const ai=32;class rn{constructor(e,n,a){this.ctrl=e,this.args=n,this.key=a,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(e){this.ctrl.state[this.key]=e}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:e,shared:n,ingKey:a,args:s}=this;n[a]=e._active=e.active=e._blocked=e._force=!1,e._step=[!1,!1],e.intentional=!1,e._movement=[0,0],e._distance=[0,0],e._direction=[0,0],e._delta=[0,0],e._bounds=[[-1/0,1/0],[-1/0,1/0]],e.args=s,e.axis=void 0,e.memo=void 0,e.elapsedTime=e.timeDelta=0,e.direction=[0,0],e.distance=[0,0],e.overflow=[0,0],e._movementBound=[!1,!1],e.velocity=[0,0],e.movement=[0,0],e.delta=[0,0],e.timeStamp=0}start(e){const n=this.state,a=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=e.target,n.currentTarget=e.currentTarget,n.lastOffset=a.from?q(a.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=e.timeStamp)}computeValues(e){const n=this.state;n._values=e,n.values=this.config.transform(e)}computeInitial(){const e=this.state;e._initial=e._values,e.initial=e.values}compute(e){const{state:n,config:a,shared:s}=this;n.args=this.args;let r=0;if(e&&(n.event=e,a.preventDefault&&e.cancelable&&n.event.preventDefault(),n.type=e.type,s.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,s.locked=!!document.pointerLockElement,Object.assign(s,ei(e)),s.down=s.pressed=s.buttons%2===1||s.touches>0,r=e.timeStamp-n.timeStamp,n.timeStamp=e.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const j=n._delta.map(Math.abs);x.addTo(n._distance,j)}this.axisIntent&&this.axisIntent(e);const[i,o]=n._movement,[l,c]=a.threshold,{_step:u,values:f}=n;if(a.hasCustomTransform?(u[0]===!1&&(u[0]=Math.abs(i)>=l&&f[0]),u[1]===!1&&(u[1]=Math.abs(o)>=c&&f[1])):(u[0]===!1&&(u[0]=Math.abs(i)>=l&&Math.sign(i)*l),u[1]===!1&&(u[1]=Math.abs(o)>=c&&Math.sign(o)*c)),n.intentional=u[0]!==!1||u[1]!==!1,!n.intentional)return;const h=[0,0];if(a.hasCustomTransform){const[j,vn]=f;h[0]=u[0]!==!1?j-u[0]:0,h[1]=u[1]!==!1?vn-u[1]:0}else h[0]=u[0]!==!1?i-u[0]:0,h[1]=u[1]!==!1?o-u[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(h);const g=n.offset,m=n._active&&!n._blocked||n.active;m&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=s[this.ingKey]=n._active,e&&(n.first&&("bounds"in a&&(n._bounds=q(a.bounds,n)),this.setup&&this.setup()),n.movement=h,this.computeOffset()));const[p,b]=n.offset,[[D,T],[M,w]]=n._bounds;n.overflow=[p<D?-1:p>T?1:0,b<M?-1:b>w?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const gn=n._active?a.rubberband||[0,0]:[0,0];if(n.offset=Hr(n._bounds,n.offset,gn),n.delta=x.sub(n.offset,g),this.computeMovement(),m&&(!n.last||r>ai)){n.delta=x.sub(n.offset,g);const j=n.delta.map(Math.abs);x.addTo(n.distance,j),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&r>0&&(n.velocity=[j[0]/r,j[1]/r],n.timeDelta=r)}}emit(){const e=this.state,n=this.shared,a=this.config;if(e._active||this.clean(),(e._blocked||!e.intentional)&&!e._force&&!a.triggerAllEvents)return;const s=this.handler(F(F(F({},n),e),{},{[this.aliasKey]:e.values}));s!==void 0&&(e.memo=s)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function si([t,e],n){const a=Math.abs(t),s=Math.abs(e);if(a>s&&a>n)return"x";if(s>a&&s>n)return"y"}class Y extends rn{constructor(...e){super(...e),C(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=x.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=x.sub(this.state.offset,this.state.lastOffset)}axisIntent(e){const n=this.state,a=this.config;if(!n.axis&&e){const s=typeof a.axisThreshold=="object"?a.axisThreshold[nn(e)]:a.axisThreshold;n.axis=si(n._movement,s)}n._blocked=(a.lockDirection||!!a.axis)&&!n.axis||!!a.axis&&a.axis!==n.axis}restrictToAxis(e){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":e[1]=0;break;case"y":e[0]=0;break}}}const ri=t=>t,nt=.15,on={enabled(t=!0){return t},eventOptions(t,e,n){return F(F({},n.shared.eventOptions),t)},preventDefault(t=!1){return t},triggerAllEvents(t=!1){return t},rubberband(t=0){switch(t){case!0:return[nt,nt];case!1:return[0,0];default:return x.toVector(t)}},from(t){if(typeof t=="function")return t;if(t!=null)return x.toVector(t)},transform(t,e,n){const a=t||n.shared.transform;return this.hasCustomTransform=!!a,a||ri},threshold(t){return x.toVector(t,0)}},ii=0,O=F(F({},on),{},{axis(t,e,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(t=ii){return t},bounds(t={}){if(typeof t=="function")return r=>O.bounds(t(r));if("current"in t)return()=>t.current;if(typeof HTMLElement=="function"&&t instanceof HTMLElement)return t;const{left:e=-1/0,right:n=1/0,top:a=-1/0,bottom:s=1/0}=t;return[[e,n],[a,s]]}}),at={ArrowRight:(t,e=1)=>[t*e,0],ArrowLeft:(t,e=1)=>[-1*t*e,0],ArrowUp:(t,e=1)=>[0,-1*t*e],ArrowDown:(t,e=1)=>[0,t*e]};class oi extends Y{constructor(...e){super(...e),C(this,"ingKey","dragging")}reset(){super.reset();const e=this.state;e._pointerId=void 0,e._pointerActive=!1,e._keyboardActive=!1,e._preventScroll=!1,e._delayed=!1,e.swipe=[0,0],e.tap=!1,e.canceled=!1,e.cancel=this.cancel.bind(this)}setup(){const e=this.state;if(e._bounds instanceof HTMLElement){const n=e._bounds.getBoundingClientRect(),a=e.currentTarget.getBoundingClientRect(),s={left:n.left-a.left+e.offset[0],right:n.right-a.right+e.offset[0],top:n.top-a.top+e.offset[1],bottom:n.bottom-a.bottom+e.offset[1]};e._bounds=O.bounds(s)}}cancel(){const e=this.state;e.canceled||(e.canceled=!0,e._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(e){const n=this.config,a=this.state;if(e.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(e.buttons):n.pointerButtons!==-1&&n.pointerButtons!==e.buttons))return;const s=this.ctrl.setEventIds(e);n.pointerCapture&&e.target.setPointerCapture(e.pointerId),!(s&&s.size>1&&a._pointerActive)&&(this.start(e),this.setupPointer(e),a._pointerId=ne(e),a._pointerActive=!0,this.computeValues($(e)),this.computeInitial(),n.preventScrollAxis&&nn(e)!=="mouse"?(a._active=!1,this.setupScrollPrevention(e)):n.delay>0?(this.setupDelayTrigger(e),n.triggerAllEvents&&(this.compute(e),this.emit())):this.startPointerDrag(e))}startPointerDrag(e){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(e),this.emit()}pointerMove(e){const n=this.state,a=this.config;if(!n._pointerActive)return;const s=ne(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;const r=$(e);if(document.pointerLockElement===e.target?n._delta=[e.movementX,e.movementY]:(n._delta=x.sub(r,n._values),this.computeValues(r)),x.addTo(n._movement,n._delta),this.compute(e),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(e);return}if(a.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===a.preventScrollAxis||a.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(e);return}else return;this.emit()}pointerUp(e){this.ctrl.setEventIds(e);try{this.config.pointerCapture&&e.target.hasPointerCapture(e.pointerId)&&e.target.releasePointerCapture(e.pointerId)}catch{}const n=this.state,a=this.config;if(!n._active||!n._pointerActive)return;const s=ne(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(e);const[r,i]=n._distance;if(n.tap=r<=a.tapsThreshold&&i<=a.tapsThreshold,n.tap&&a.filterTaps)n._force=!0;else{const[o,l]=n._delta,[c,u]=n._movement,[f,h]=a.swipe.velocity,[g,m]=a.swipe.distance,p=a.swipe.duration;if(n.elapsedTime<p){const b=Math.abs(o/n.timeDelta),D=Math.abs(l/n.timeDelta);b>f&&Math.abs(c)>g&&(n.swipe[0]=Math.sign(o)),D>h&&Math.abs(u)>m&&(n.swipe[1]=Math.sign(l))}}this.emit()}pointerClick(e){!this.state.tap&&e.detail>0&&(e.preventDefault(),e.stopPropagation())}setupPointer(e){const n=this.config,a=n.device;n.pointerLock&&e.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,a,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(e){this.state._preventScroll&&e.cancelable&&e.preventDefault()}setupScrollPrevention(e){this.state._preventScroll=!1,ui(e);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,e)}setupDelayTrigger(e){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(e)},this.config.delay)}keyDown(e){const n=at[e.key];if(n){const a=this.state,s=e.shiftKey?10:e.altKey?.1:1;this.start(e),a._delta=n(this.config.keyboardDisplacement,s),a._keyboardActive=!0,x.addTo(a._movement,a._delta),this.compute(e),this.emit()}}keyUp(e){e.key in at&&(this.state._keyboardActive=!1,this.setActive(),this.compute(e),this.emit())}bind(e){const n=this.config.device;e(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(e(n,"change",this.pointerMove.bind(this)),e(n,"end",this.pointerUp.bind(this)),e(n,"cancel",this.pointerUp.bind(this)),e("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(e("key","down",this.keyDown.bind(this)),e("key","up",this.keyUp.bind(this))),this.config.filterTaps&&e("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function ui(t){"persist"in t&&typeof t.persist=="function"&&t.persist()}const G=typeof window<"u"&&window.document&&window.document.createElement;function un(){return G&&"ontouchstart"in window}function li(){return un()||G&&window.navigator.maxTouchPoints>1}function ci(){return G&&"onpointerdown"in window}function mi(){return G&&"exitPointerLock"in window.document}function di(){try{return"constructor"in GestureEvent}catch{return!1}}const k={isBrowser:G,gesture:di(),touch:un(),touchscreen:li(),pointer:ci(),pointerLock:mi()},fi=250,hi=180,pi=.5,gi=50,vi=250,yi=10,st={mouse:0,touch:0,pen:8},bi=F(F({},O),{},{device(t,e,{pointer:{touch:n=!1,lock:a=!1,mouse:s=!1}={}}){return this.pointerLock=a&&k.pointerLock,k.touch&&n?"touch":this.pointerLock?"mouse":k.pointer&&!s?"pointer":k.touch?"touch":"mouse"},preventScrollAxis(t,e,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&t?fi:void 0,!(!k.touchscreen||n===!1))return t||(n!==void 0?"y":void 0)},pointerCapture(t,e,{pointer:{capture:n=!0,buttons:a=1,keys:s=!0}={}}){return this.pointerButtons=a,this.keys=s,!this.pointerLock&&this.device==="pointer"&&n},threshold(t,e,{filterTaps:n=!1,tapsThreshold:a=3,axis:s=void 0}){const r=x.toVector(t,n?a:s?1:0);return this.filterTaps=n,this.tapsThreshold=a,r},swipe({velocity:t=pi,distance:e=gi,duration:n=vi}={}){return{velocity:this.transform(x.toVector(t)),distance:this.transform(x.toVector(e)),duration:n}},delay(t=0){switch(t){case!0:return hi;case!1:return 0;default:return t}},axisThreshold(t){return t?F(F({},st),t):st},keyboardDisplacement(t=yi){return t}});function ln(t){const[e,n]=t.overflow,[a,s]=t._delta,[r,i]=t._direction;(e<0&&a>0&&r<0||e>0&&a<0&&r>0)&&(t._movement[0]=t._movementBound[0]),(n<0&&s>0&&i<0||n>0&&s<0&&i>0)&&(t._movement[1]=t._movementBound[1])}const Ei=30,xi=100;class Fi extends rn{constructor(...e){super(...e),C(this,"ingKey","pinching"),C(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const e=this.state;e._touchIds=[],e.canceled=!1,e.cancel=this.cancel.bind(this),e.turns=0}computeOffset(){const{type:e,movement:n,lastOffset:a}=this.state;e==="wheel"?this.state.offset=x.add(n,a):this.state.offset=[(1+n[0])*a[0],n[1]+a[1]]}computeMovement(){const{offset:e,lastOffset:n}=this.state;this.state.movement=[e[0]/n[0],e[1]-n[1]]}axisIntent(){const e=this.state,[n,a]=e._movement;if(!e.axis){const s=Math.abs(n)*Ei-Math.abs(a);s<0?e.axis="angle":s>0&&(e.axis="scale")}}restrictToAxis(e){this.config.lockDirection&&(this.state.axis==="scale"?e[1]=0:this.state.axis==="angle"&&(e[0]=0))}cancel(){const e=this.state;e.canceled||setTimeout(()=>{e.canceled=!0,e._active=!1,this.compute(),this.emit()},0)}touchStart(e){this.ctrl.setEventIds(e);const n=this.state,a=this.ctrl.touchIds;if(n._active&&n._touchIds.every(r=>a.has(r))||a.size<2)return;this.start(e),n._touchIds=Array.from(a).slice(0,2);const s=Je(e,n._touchIds);s&&this.pinchStart(e,s)}pointerStart(e){if(e.buttons!=null&&e.buttons%2!==1)return;this.ctrl.setEventIds(e),e.target.setPointerCapture(e.pointerId);const n=this.state,a=n._pointerEvents,s=this.ctrl.pointerIds;if(n._active&&Array.from(a.keys()).every(i=>s.has(i))||(a.size<2&&a.set(e.pointerId,e),n._pointerEvents.size<2))return;this.start(e);const r=fe(...Array.from(a.values()));r&&this.pinchStart(e,r)}pinchStart(e,n){const a=this.state;a.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(e),this.emit()}touchMove(e){if(!this.state._active)return;const n=Je(e,this.state._touchIds);n&&this.pinchMove(e,n)}pointerMove(e){const n=this.state._pointerEvents;if(n.has(e.pointerId)&&n.set(e.pointerId,e),!this.state._active)return;const a=fe(...Array.from(n.values()));a&&this.pinchMove(e,a)}pinchMove(e,n){const a=this.state,s=a._values[1],r=n.angle-s;let i=0;Math.abs(r)>270&&(i+=Math.sign(r)),this.computeValues([n.distance,n.angle-360*i]),a.origin=n.origin,a.turns=i,a._movement=[a._values[0]/a._initial[0]-1,a._values[1]-a._initial[1]],this.compute(e),this.emit()}touchEnd(e){this.ctrl.setEventIds(e),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(e),this.emit())}pointerEnd(e){const n=this.state;this.ctrl.setEventIds(e);try{e.target.releasePointerCapture(e.pointerId)}catch{}n._pointerEvents.has(e.pointerId)&&n._pointerEvents.delete(e.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(e),this.emit())}gestureStart(e){e.cancelable&&e.preventDefault();const n=this.state;n._active||(this.start(e),this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY],this.compute(e),this.emit())}gestureMove(e){if(e.cancelable&&e.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY];const a=n._movement;n._movement=[e.scale-1,e.rotation],n._delta=x.sub(n._movement,a),this.compute(e),this.emit()}gestureEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}wheel(e){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(a=>e[a]):!e[n])||(this.state._active?this.wheelChange(e):this.wheelStart(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(e){this.start(e),this.wheelChange(e)}wheelChange(e){"uv"in e||e.cancelable&&e.preventDefault();const a=this.state;a._delta=[-sn(e)[1]/xi*a.offset[0],0],x.addTo(a._movement,a._delta),ln(a),this.state.origin=[e.clientX,e.clientY],this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){const n=this.config.device;n&&(e(n,"start",this[n+"Start"].bind(this)),e(n,"change",this[n+"Move"].bind(this)),e(n,"end",this[n+"End"].bind(this)),e(n,"cancel",this[n+"End"].bind(this)),e("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&e("wheel","",this.wheel.bind(this),{passive:!1})}}const Ci=F(F({},on),{},{device(t,e,{shared:n,pointer:{touch:a=!1}={}}){if(n.target&&!k.touch&&k.gesture)return"gesture";if(k.touch&&a)return"touch";if(k.touchscreen){if(k.pointer)return"pointer";if(k.touch)return"touch"}},bounds(t,e,{scaleBounds:n={},angleBounds:a={}}){const s=i=>{const o=tt(q(n,i),{min:-1/0,max:1/0});return[o.min,o.max]},r=i=>{const o=tt(q(a,i),{min:-1/0,max:1/0});return[o.min,o.max]};return typeof n!="function"&&typeof a!="function"?[s(),r()]:i=>[s(i),r(i)]},threshold(t,e,n){return this.lockDirection=n.axis==="lock",x.toVector(t,this.lockDirection?[.1,3]:0)},modifierKey(t){return t===void 0?"ctrlKey":t},pinchOnWheel(t=!0){return t}});class Di extends Y{constructor(...e){super(...e),C(this,"ingKey","moving")}move(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.state._active?this.moveChange(e):this.moveStart(e),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(e){this.start(e),this.computeValues($(e)),this.compute(e),this.computeInitial(),this.emit()}moveChange(e){if(!this.state._active)return;const n=$(e),a=this.state;a._delta=x.sub(n,a._values),x.addTo(a._movement,a._delta),this.computeValues(n),this.compute(e),this.emit()}moveEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}bind(e){e("pointer","change",this.move.bind(this)),e("pointer","leave",this.moveEnd.bind(this))}}const Ai=F(F({},O),{},{mouseOnly:(t=!0)=>t});class ki extends Y{constructor(...e){super(...e),C(this,"ingKey","scrolling")}scroll(e){this.state._active||this.start(e),this.scrollChange(e),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(e){e.cancelable&&e.preventDefault();const n=this.state,a=Qr(e);n._delta=x.sub(a,n._values),x.addTo(n._movement,n._delta),this.computeValues(a),this.compute(e),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("scroll","",this.scroll.bind(this))}}const _i=O;class Bi extends Y{constructor(...e){super(...e),C(this,"ingKey","wheeling")}wheel(e){this.state._active||this.start(e),this.wheelChange(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(e){const n=this.state;n._delta=sn(e),x.addTo(n._movement,n._delta),ln(n),this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("wheel","",this.wheel.bind(this))}}const Si=O;class Ti extends Y{constructor(...e){super(...e),C(this,"ingKey","hovering")}enter(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.start(e),this.computeValues($(e)),this.compute(e),this.emit())}leave(e){if(this.config.mouseOnly&&e.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const a=$(e);n._movement=n._delta=x.sub(a,n._values),this.computeValues(a),this.compute(e),n.delta=n.movement,this.emit()}bind(e){e("pointer","enter",this.enter.bind(this)),e("pointer","leave",this.leave.bind(this))}}const Ii=F(F({},O),{},{mouseOnly:(t=!0)=>t}),De=new Map,he=new Map;function wi(t){De.set(t.key,t.engine),he.set(t.key,t.resolver)}const Mi={key:"drag",engine:oi,resolver:bi},ji={key:"hover",engine:Ti,resolver:Ii},Oi={key:"move",engine:Di,resolver:Ai},Li={key:"pinch",engine:Fi,resolver:Ci},Pi={key:"scroll",engine:ki,resolver:_i},Ri={key:"wheel",engine:Bi,resolver:Si};function $i(t,e){if(t==null)return{};var n={},a=Object.keys(t),s,r;for(r=0;r<a.length;r++)s=a[r],!(e.indexOf(s)>=0)&&(n[s]=t[s]);return n}function Ni(t,e){if(t==null)return{};var n=$i(t,e),a,s;if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(s=0;s<r.length;s++)a=r[s],!(e.indexOf(a)>=0)&&Object.prototype.propertyIsEnumerable.call(t,a)&&(n[a]=t[a])}return n}const Hi={target(t){if(t)return()=>"current"in t?t.current:t},enabled(t=!0){return t},window(t=k.isBrowser?window:void 0){return t},eventOptions({passive:t=!0,capture:e=!1}={}){return{passive:t,capture:e}},transform(t){return t}},Yi=["target","eventOptions","window","enabled","transform"];function V(t={},e){const n={};for(const[a,s]of Object.entries(e))switch(typeof s){case"function":n[a]=s.call(n,t[a],a,t);break;case"object":n[a]=V(t[a],s);break;case"boolean":s&&(n[a]=t[a]);break}return n}function Gi(t,e,n={}){const a=t,{target:s,eventOptions:r,window:i,enabled:o,transform:l}=a,c=Ni(a,Yi);if(n.shared=V({target:s,eventOptions:r,window:i,enabled:o,transform:l},Hi),e){const u=he.get(e);n[e]=V(F({shared:n.shared},c),u)}else for(const u in c){const f=he.get(u);f&&(n[u]=V(F({shared:n.shared},c[u]),f))}return n}class cn{constructor(e,n){C(this,"_listeners",new Set),this._ctrl=e,this._gestureKey=n}add(e,n,a,s,r){const i=this._listeners,o=Wr(n,a),l=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},c=F(F({},l),r);e.addEventListener(o,s,c);const u=()=>{e.removeEventListener(o,s,c),i.delete(u)};return i.add(u),u}clean(){this._listeners.forEach(e=>e()),this._listeners.clear()}}class zi{constructor(){C(this,"_timeouts",new Map)}add(e,n,a=140,...s){this.remove(e),this._timeouts.set(e,window.setTimeout(n,a,...s))}remove(e){const n=this._timeouts.get(e);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(e=>void window.clearTimeout(e)),this._timeouts.clear()}}class Ui{constructor(e){C(this,"gestures",new Set),C(this,"_targetEventStore",new cn(this)),C(this,"gestureEventStores",{}),C(this,"gestureTimeoutStores",{}),C(this,"handlers",{}),C(this,"config",{}),C(this,"pointerIds",new Set),C(this,"touchIds",new Set),C(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),Xi(this,e)}setEventIds(e){if(Z(e))return this.touchIds=new Set(Jr(e)),this.touchIds;if("pointerId"in e)return e.type==="pointerup"||e.type==="pointercancel"?this.pointerIds.delete(e.pointerId):e.type==="pointerdown"&&this.pointerIds.add(e.pointerId),this.pointerIds}applyHandlers(e,n){this.handlers=e,this.nativeHandlers=n}applyConfig(e,n){this.config=Gi(e,n,this.config)}clean(){this._targetEventStore.clean();for(const e of this.gestures)this.gestureEventStores[e].clean(),this.gestureTimeoutStores[e].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...e){const n=this.config.shared,a={};let s;if(!(n.target&&(s=n.target(),!s))){if(n.enabled){for(const i of this.gestures){const o=this.config[i],l=rt(a,o.eventOptions,!!s);if(o.enabled){const c=De.get(i);new c(this,e,i).bind(l)}}const r=rt(a,n.eventOptions,!!s);for(const i in this.nativeHandlers)r(i,"",o=>this.nativeHandlers[i](F(F({},this.state.shared),{},{event:o,args:e})),void 0,!0)}for(const r in a)a[r]=ni(...a[r]);if(!s)return a;for(const r in a){const{device:i,capture:o,passive:l}=qr(r);this._targetEventStore.add(s,i,"",a[r],{capture:o,passive:l})}}}}function L(t,e){t.gestures.add(e),t.gestureEventStores[e]=new cn(t,e),t.gestureTimeoutStores[e]=new zi}function Xi(t,e){e.drag&&L(t,"drag"),e.wheel&&L(t,"wheel"),e.scroll&&L(t,"scroll"),e.move&&L(t,"move"),e.pinch&&L(t,"pinch"),e.hover&&L(t,"hover")}const rt=(t,e,n)=>(a,s,r,i={},o=!1)=>{var l,c;const u=(l=i.capture)!==null&&l!==void 0?l:e.capture,f=(c=i.passive)!==null&&c!==void 0?c:e.passive;let h=o?a:Xr(a,s,u);n&&f&&(h+="Passive"),t[h]=t[h]||[],t[h].push(r)},Vi=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function qi(t){const e={},n={},a=new Set;for(let s in t)Vi.test(s)?(a.add(RegExp.lastMatch),n[s]=t[s]):e[s]=t[s];return[n,e,a]}function P(t,e,n,a,s,r){if(!t.has(n)||!De.has(a))return;const i=n+"Start",o=n+"End",l=c=>{let u;return c.first&&i in e&&e[i](c),n in e&&(u=e[n](c)),c.last&&o in e&&e[o](c),u};s[a]=l,r[a]=r[a]||{}}function Wi(t,e){const[n,a,s]=qi(t),r={};return P(s,n,"onDrag","drag",r,e),P(s,n,"onWheel","wheel",r,e),P(s,n,"onScroll","scroll",r,e),P(s,n,"onPinch","pinch",r,e),P(s,n,"onMove","move",r,e),P(s,n,"onHover","hover",r,e),{handlers:r,config:e,nativeHandlers:a}}function Ki(t,e={},n,a){const s=N.useMemo(()=>new Ui(t),[]);if(s.applyHandlers(t,a),s.applyConfig(e,n),N.useEffect(s.effect.bind(s)),N.useEffect(()=>s.clean.bind(s),[]),e.target===void 0)return s.bind.bind(s)}function Zi(t){return t.forEach(wi),function(n,a){const{handlers:s,nativeHandlers:r,config:i}=Wi(n,a||{});return Ki(s,i,void 0,r)}}function Ji(t,e){return Zi([Mi,Li,Pi,Ri,Oi,ji])(t,e||{})}function Qi({children:t}){const e=v.useRef(null),[n,a]=v.useState(1),[s,r]=v.useState({x:0,y:0}),[i,o]=v.useState(!1);return Ji({onPinch({delta:l,pinching:c}){o(c),a(Math.max(n+l[0],.1))},onWheel({event:l,delta:[c,u],wheeling:f}){l.preventDefault(),o(f),r({x:s.x-c/n,y:s.y-u/n})}},{target:e,eventOptions:{passive:!1}}),d.jsx(eo,{children:d.jsx(to,{ref:e,children:d.jsx(no,{style:{"--zoom":n,"--translate-x":s.x,"--translate-y":s.y},"data-is-interacting":i,children:t})})})}const eo=E.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,to=E.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,no=E.div`
  transform-origin: top center;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
  }
`;function ao({worldState:t,setWorldState:e,updateWorldState:n}){return d.jsx(dr,{children:d.jsxs(ur,{children:[d.jsx(Qi,{children:d.jsx(wr,{state:t})}),d.jsx(Rr,{updateWorldTime:a=>n(t,a)}),d.jsx(Lr,{worldState:t,setWorldState:e}),d.jsx(jr,{worldState:t})]})})}const mn="fullScreenMessage",dn="fullScreenMessageAction";function I(t,e,n,a="",s,r,i){Ce(mn,{message:t,startTimestamp:e,endTimestamp:n,messageId:a,actions:s,prompt:r,fullScreen:i??!!(s!=null&&s.length)})}function fn(t,e){Ce(dn,{messageId:t,actionId:e})}function hn(t){Qt(mn,e=>{t(e)})}function Ae(t){Qt(dn,e=>{t(e)})}function so({worldState:t,onGameOver:e}){const[n,a]=v.useState(null),[s,r]=v.useState(!1);return v.useEffect(()=>{var g;if(s)return;const i=Object.fromEntries(t.states.map(m=>[m.id,t.cities.filter(p=>p.stateId===m.id).reduce((p,b)=>p+b.populationHistogram[b.populationHistogram.length-1].population,0)])),o=Object.values(i).filter(m=>m>0).length,l=t.launchSites.length===0,c=t.timestamp,u=t.states.filter(m=>i[m.id]>0&&Object.entries(m.strategies).filter(([p,b])=>i[p]>0&&b===y.HOSTILE).length>0),f=t.launchSites.some(m=>m.lastLaunchTimestamp&&c-m.lastLaunchTimestamp<te),h=te-c;if(!u.length&&!f&&h>0&&h<=10&&(n?I(`Game will end in ${Math.ceil(h)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):a(c)),o<=1||l||!u.length&&!f&&c>te){const m=o===1?(g=t.states.find(p=>i[p.id]>0))==null?void 0:g.id:void 0;r(!0),I(["Game Over!","Results will be shown shortly..."],c,c+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{e({populations:Object.fromEntries(t.states.map(p=>[p.id,i[p.id]])),winner:m,stateNames:Object.fromEntries(t.states.map(p=>[p.id,p.name])),playerStateId:t.states.find(p=>p.isPlayerControlled).id})},5e3)}},[t,e,n,s]),null}const ro="/assets/player-lost-background-D2A_VJ6-.png",io="/assets/player-won-background-CkXgF24i.png",it="/assets/draw-background-EwLQ9g28.png",oo=E.div`
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
`,uo=({setGameState:t})=>{const{state:{result:e}}=ut(),n=()=>{t(W,{stateName:e.stateNames[e.playerStateId]})};let a,s;return e.winner?e.winner===e.playerStateId?(a=io,s=`Congratulations! ${e.stateNames[e.playerStateId]} has won with ${e.populations[e.playerStateId]} population alive.`):e.winner!==void 0?(a=ro,s=`${e.stateNames[e.winner]} has won with ${e.populations[e.winner]} population alive. Your state has fallen.`):(a=it,s="The game has ended in an unexpected state."):(a=it,s="It's a draw! The world is partially destroyed, but there's still hope."),d.jsx(oo,{backgroundImage:a,children:d.jsxs("div",{children:[d.jsx("h2",{children:"Game Over"}),d.jsx("p",{children:s}),d.jsx("button",{onClick:n,children:"Play Again"}),d.jsx("br",{}),d.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},pe={Component:uo,path:"played"};function lo({worldState:t}){var c;const[e,n]=v.useState([]),[a,s]=v.useState(null);hn(u=>{n(f=>u.messageId&&f.find(h=>h.messageId===u.messageId)?[...f.map(h=>h.messageId===u.messageId?u:h)]:[u,...f])});const r=e.sort((u,f)=>u.actions&&!f.actions?-1:!u.actions&&f.actions?1:u.startTimestamp-f.startTimestamp);if(Ae(u=>{n(f=>f.filter(h=>h.messageId!==u.messageId))}),v.useEffect(()=>{const u=r.find(f=>f.fullScreen&&f.startTimestamp<=t.timestamp&&f.endTimestamp>t.timestamp);s(u||null)},[r,t.timestamp]),!a)return null;const o=((u,f)=>f<u.startTimestamp?"pre":f<u.startTimestamp+.5?"pre-in":f>u.endTimestamp-.5?"post-in":f>u.endTimestamp?"post":"active")(a,t.timestamp),l=u=>Array.isArray(u)?u.map((f,h)=>d.jsx("div",{children:f},h)):u;return d.jsxs(fo,{"data-message-state":o,"data-action":(((c=a.actions)==null?void 0:c.length)??0)>0,children:[d.jsx(ho,{children:l(a.message)}),a.prompt&&a.actions&&d.jsx(po,{children:a.actions.map((u,f)=>d.jsx(go,{onClick:()=>fn(a.messageId,u.id),children:u.text},f))})]})}const co=K`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`,mo=K`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: scale(0.9);
  }
`,fo=E.div`
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
    animation: ${co} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${mo} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,ho=E.div`
  font-size: 4rem;
  color: white;
  text-align: center;
  max-width: 80%;
  white-space: pre-line;
`,po=E.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,go=E.button`
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
`,pn="ALLIANCEPROPOSAL";function vo(t,e,n,a=!1){const s=`${pn}_${t.id}_${e.id}`,r=a?`${t.name} has become friendly towards you. Do you want to form an alliance?`:`${t.name} proposes an alliance with ${e.name}. Do you accept?`,i=n.timestamp,o=i+10;I(r,i,o,s,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function yo({worldState:t,setWorldState:e}){return Ae(n=>{if(n.messageId.startsWith(pn)){const[,a,s]=n.messageId.split("_"),r=t.states.find(o=>o.id===a),i=t.states.find(o=>o.id===s);if(!r||!(i!=null&&i.isPlayerControlled))return;if(n.actionId==="accept"){const o=t.states.map(l=>l.id===a||l.id===s?{...l,strategies:{...l.strategies,[a]:y.FRIENDLY,[s]:y.FRIENDLY}}:l);e({...t,states:o}),I(`Alliance formed between ${r.name} and ${i.name}!`,t.timestamp,t.timestamp+5)}else n.actionId==="reject"&&I(`${i.name} has rejected the alliance proposal from ${r.name}.`,t.timestamp,t.timestamp+5)}}),null}function bo({worldState:t}){const e=t.states.find(g=>g.isPlayerControlled),[n,a]=v.useState(!1),[s,r]=v.useState({}),[i,o]=v.useState([]),[l,c]=v.useState([]),[u,f]=v.useState(!1),h=Math.round(t.timestamp*10)/10;return v.useEffect(()=>{!n&&t.timestamp>0&&(a(!0),I("The game has started!",t.timestamp,t.timestamp+3))},[h]),v.useEffect(()=>{if(e){const g=Object.fromEntries(t.states.map(m=>[m.id,m.strategies]));for(const m of t.states)for(const p of t.states.filter(b=>b.id!==m.id))e&&p.id===e.id&&m.strategies[p.id]===y.FRIENDLY&&p.strategies[m.id]!==y.FRIENDLY&&s[m.id][p.id]!==y.FRIENDLY&&vo(m,e,t,!0),p.strategies[m.id]===y.FRIENDLY&&m.strategies[p.id]===y.FRIENDLY&&(s[p.id][m.id]!==y.FRIENDLY||s[m.id][p.id]!==y.FRIENDLY)&&I(`${p.name} has formed alliance with ${m.isPlayerControlled?"you":m.name}!`,h,h+3),m.strategies[p.id]===y.HOSTILE&&s[m.id][p.id]!==y.HOSTILE&&I(p.isPlayerControlled?`${m.name} has declared war on You!`:`${m.isPlayerControlled?"You have":m.name} declared war on ${p.name}!`,h,h+3,void 0,void 0,void 0,m.isPlayerControlled||p.isPlayerControlled);r(g)}},[h]),v.useEffect(()=>{e&&t.cities.filter(g=>g.stateId===e.id).forEach(g=>{const m=i.find(T=>T.id===g.id);if(!m)return;const p=g.populationHistogram[g.populationHistogram.length-1].population,D=(m?m.populationHistogram[m.populationHistogram.length-1].population:p)-p;D>0&&I([`Your city ${g.name} has been hit!`,`${D} casualties reported.`],h,h+3,void 0,void 0,!1,!0)}),o(t.cities.map(g=>({...g,populationHistogram:[...g.populationHistogram]})))},[h]),v.useEffect(()=>{if(e){const g=t.launchSites.filter(m=>m.stateId===e.id);l.length>0&&l.filter(p=>!g.some(b=>b.id===p.id)).forEach(()=>{I("One of your launch sites has been destroyed!",h,h+3,void 0,void 0,!1,!0)}),c(g)}},[h]),v.useEffect(()=>{if(e&&!u){const g=t.cities.filter(b=>b.stateId===e.id),m=t.launchSites.filter(b=>b.stateId===e.id);!g.some(b=>b.populationHistogram[b.populationHistogram.length-1].population>0)&&m.length===0&&(I(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],h,h+5,void 0,void 0,!1,!0),f(!0))}},[h]),null}function Eo(){const[t,e]=v.useState([]);hn(a=>{e(s=>a.messageId&&s.find(r=>r.messageId===a.messageId)?[...s.map(r=>r.messageId===a.messageId?a:r)]:[a,...s])}),Ae(a=>{e(s=>s.filter(r=>r.messageId!==a.messageId))});const n=a=>Array.isArray(a)?a.map(s=>d.jsx("div",{children:s})):a;return d.jsx(xo,{children:t.map((a,s)=>d.jsxs(Fo,{children:[d.jsx("div",{children:n(a.message)}),a.prompt&&a.actions&&d.jsx(Co,{children:a.actions.map((r,i)=>d.jsx(Do,{onClick:()=>fn(a.messageId,r.id),children:r.text},i))})]},s))})}const xo=E.div`
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 300px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  overflow-y: auto;
  padding: 10px;
  font-size: 14px;
  display: flex;
  flex-direction: column-reverse;
`,Fo=E.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
`,Co=E.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,Do=E.button`
  font-size: 12px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`,Ao=({setGameState:t})=>{const{state:{stateName:e}}=ut(),{worldState:n,setWorldState:a,updateWorldState:s}=ir(e);return d.jsxs(d.Fragment,{children:[d.jsx(ao,{worldState:n,updateWorldState:s,setWorldState:a}),d.jsx(lo,{worldState:n}),d.jsx(Eo,{}),d.jsx(so,{worldState:n,onGameOver:r=>t(pe,{result:r})}),d.jsx(bo,{worldState:n}),d.jsx(yo,{worldState:n,setWorldState:a})]})},W={Component:Ao,path:"playing"},ko="/assets/play-background-BASXrsIB.png",_o=E.div`
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
    background-image: url(${ko});
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
`,Bo=({setGameState:t})=>{const[e,n]=v.useState(qt(1)[0]),a=()=>{t(W,{stateName:e})};return d.jsx(_o,{children:d.jsxs("div",{children:[d.jsx("h1",{children:"Name your state:"}),d.jsx("input",{type:"text",placeholder:"Type your state name here",value:e,onChange:s=>n(s.currentTarget.value)}),d.jsx("br",{}),d.jsx("button",{onClick:a,disabled:!e,children:"Start game"}),d.jsx("br",{}),d.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},ge={Component:Bo,path:"play"},So="/assets/intro-background-D_km5uka.png",To="/assets/nukes-game-title-vcFxx9vI.png",Io=K`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,wo=K`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,Mo=E.div`
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
    background-image: url(${So});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${Io} 60s ease-in-out infinite;
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
`,jo=E.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${t=>t.isFlashing?1:0};
  animation: ${t=>t.isFlashing?wo:"none"} 4.5s forwards;
`,Oo=E.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,Lo=E.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,Po=({setGameState:t})=>{const[e,n]=v.useState(!0);return v.useEffect(()=>{const a=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(a)},[]),d.jsxs(Mo,{children:[d.jsx(jo,{isFlashing:e}),!e&&d.jsxs(Oo,{children:[d.jsx(Lo,{src:To,alt:"Nukes game"}),d.jsx("button",{onClick:()=>t(ge),children:"Play"})]})]})},ot={Component:Po,path:""},Ro=xn`
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
`,$o=[{path:ot.path,element:d.jsx(X,{state:ot})},{path:ge.path,element:d.jsx(X,{state:ge})},{path:W.path,element:d.jsx(X,{state:W})},{path:pe.path,element:d.jsx(X,{state:pe})}];function Yo(){var n;const[t]=bn(),e=t.get("path")??"";return d.jsx(d.Fragment,{children:(n=$o.find(a=>a.path===e))==null?void 0:n.element})}function X({state:t}){const e=En();return d.jsxs(d.Fragment,{children:[d.jsx(Ro,{}),d.jsx(t.Component,{setGameState:(n,a)=>e({search:"path="+n.path},{state:a})})]})}export{Yo as NukesApp,$o as routes};
