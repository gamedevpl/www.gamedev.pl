import{c as S,g as yn,r as v,j as f,R as N,u as lt,a as bn,b as En}from"./index-CPZZpk5u.js";import{d as b,m as Z,f as xn}from"./styled-components.browser.esm-BqRiX7Yg.js";var y=(t=>(t.NEUTRAL="NEUTRAL",t.FRIENDLY="FRIENDLY",t.HOSTILE="HOSTILE",t))(y||{}),ct=(t=>(t.LAUNCH_SITE="LAUNCH_SITE",t))(ct||{}),T=(t=>(t.WATER="WATER",t.GROUND="GROUND",t))(T||{});function Fn(t,e,n){const a=[],s=Array(n).fill(null).map(()=>Array(e).fill(!1));for(let r=0;r<n;r++)for(let i=0;i<e;i++){const u=r*e+i;t[u].type===T.WATER&&Cn(i,r,e,n,t)&&(a.push([i,r,0]),s[r][i]=!0)}for(;a.length>0;){const[r,i,u]=a.shift(),o=i*e+r;t[o].type===T.WATER?t[o].depth=u+(Math.random()-Math.random())/5:t[o].type===T.GROUND&&(t[o].height=Math.sqrt(u)+(Math.random()-Math.random())/10);const c=[[-1,0],[1,0],[0,-1],[0,1]];for(const[l,d]of c){const h=r+l,g=i+d;mt(h,g,e,n)&&!s[g][h]&&(a.push([h,g,u+1]),s[g][h]=!0)}}}function Cn(t,e,n,a,s){return[[-1,0],[1,0],[0,-1],[0,1]].some(([i,u])=>{const o=t+i,c=e+u;if(mt(o,c,n,a)){const l=c*n+o;return s[l].type===T.GROUND}return!1})}function mt(t,e,n,a){return t>=0&&t<n&&e>=0&&e<a}var dt={exports:{}},An=[{value:"#B0171F",name:"indian red"},{value:"#DC143C",css:!0,name:"crimson"},{value:"#FFB6C1",css:!0,name:"lightpink"},{value:"#FFAEB9",name:"lightpink 1"},{value:"#EEA2AD",name:"lightpink 2"},{value:"#CD8C95",name:"lightpink 3"},{value:"#8B5F65",name:"lightpink 4"},{value:"#FFC0CB",css:!0,name:"pink"},{value:"#FFB5C5",name:"pink 1"},{value:"#EEA9B8",name:"pink 2"},{value:"#CD919E",name:"pink 3"},{value:"#8B636C",name:"pink 4"},{value:"#DB7093",css:!0,name:"palevioletred"},{value:"#FF82AB",name:"palevioletred 1"},{value:"#EE799F",name:"palevioletred 2"},{value:"#CD6889",name:"palevioletred 3"},{value:"#8B475D",name:"palevioletred 4"},{value:"#FFF0F5",name:"lavenderblush 1"},{value:"#FFF0F5",css:!0,name:"lavenderblush"},{value:"#EEE0E5",name:"lavenderblush 2"},{value:"#CDC1C5",name:"lavenderblush 3"},{value:"#8B8386",name:"lavenderblush 4"},{value:"#FF3E96",name:"violetred 1"},{value:"#EE3A8C",name:"violetred 2"},{value:"#CD3278",name:"violetred 3"},{value:"#8B2252",name:"violetred 4"},{value:"#FF69B4",css:!0,name:"hotpink"},{value:"#FF6EB4",name:"hotpink 1"},{value:"#EE6AA7",name:"hotpink 2"},{value:"#CD6090",name:"hotpink 3"},{value:"#8B3A62",name:"hotpink 4"},{value:"#872657",name:"raspberry"},{value:"#FF1493",name:"deeppink 1"},{value:"#FF1493",css:!0,name:"deeppink"},{value:"#EE1289",name:"deeppink 2"},{value:"#CD1076",name:"deeppink 3"},{value:"#8B0A50",name:"deeppink 4"},{value:"#FF34B3",name:"maroon 1"},{value:"#EE30A7",name:"maroon 2"},{value:"#CD2990",name:"maroon 3"},{value:"#8B1C62",name:"maroon 4"},{value:"#C71585",css:!0,name:"mediumvioletred"},{value:"#D02090",name:"violetred"},{value:"#DA70D6",css:!0,name:"orchid"},{value:"#FF83FA",name:"orchid 1"},{value:"#EE7AE9",name:"orchid 2"},{value:"#CD69C9",name:"orchid 3"},{value:"#8B4789",name:"orchid 4"},{value:"#D8BFD8",css:!0,name:"thistle"},{value:"#FFE1FF",name:"thistle 1"},{value:"#EED2EE",name:"thistle 2"},{value:"#CDB5CD",name:"thistle 3"},{value:"#8B7B8B",name:"thistle 4"},{value:"#FFBBFF",name:"plum 1"},{value:"#EEAEEE",name:"plum 2"},{value:"#CD96CD",name:"plum 3"},{value:"#8B668B",name:"plum 4"},{value:"#DDA0DD",css:!0,name:"plum"},{value:"#EE82EE",css:!0,name:"violet"},{value:"#FF00FF",vga:!0,name:"magenta"},{value:"#FF00FF",vga:!0,css:!0,name:"fuchsia"},{value:"#EE00EE",name:"magenta 2"},{value:"#CD00CD",name:"magenta 3"},{value:"#8B008B",name:"magenta 4"},{value:"#8B008B",css:!0,name:"darkmagenta"},{value:"#800080",vga:!0,css:!0,name:"purple"},{value:"#BA55D3",css:!0,name:"mediumorchid"},{value:"#E066FF",name:"mediumorchid 1"},{value:"#D15FEE",name:"mediumorchid 2"},{value:"#B452CD",name:"mediumorchid 3"},{value:"#7A378B",name:"mediumorchid 4"},{value:"#9400D3",css:!0,name:"darkviolet"},{value:"#9932CC",css:!0,name:"darkorchid"},{value:"#BF3EFF",name:"darkorchid 1"},{value:"#B23AEE",name:"darkorchid 2"},{value:"#9A32CD",name:"darkorchid 3"},{value:"#68228B",name:"darkorchid 4"},{value:"#4B0082",css:!0,name:"indigo"},{value:"#8A2BE2",css:!0,name:"blueviolet"},{value:"#9B30FF",name:"purple 1"},{value:"#912CEE",name:"purple 2"},{value:"#7D26CD",name:"purple 3"},{value:"#551A8B",name:"purple 4"},{value:"#9370DB",css:!0,name:"mediumpurple"},{value:"#AB82FF",name:"mediumpurple 1"},{value:"#9F79EE",name:"mediumpurple 2"},{value:"#8968CD",name:"mediumpurple 3"},{value:"#5D478B",name:"mediumpurple 4"},{value:"#483D8B",css:!0,name:"darkslateblue"},{value:"#8470FF",name:"lightslateblue"},{value:"#7B68EE",css:!0,name:"mediumslateblue"},{value:"#6A5ACD",css:!0,name:"slateblue"},{value:"#836FFF",name:"slateblue 1"},{value:"#7A67EE",name:"slateblue 2"},{value:"#6959CD",name:"slateblue 3"},{value:"#473C8B",name:"slateblue 4"},{value:"#F8F8FF",css:!0,name:"ghostwhite"},{value:"#E6E6FA",css:!0,name:"lavender"},{value:"#0000FF",vga:!0,css:!0,name:"blue"},{value:"#0000EE",name:"blue 2"},{value:"#0000CD",name:"blue 3"},{value:"#0000CD",css:!0,name:"mediumblue"},{value:"#00008B",name:"blue 4"},{value:"#00008B",css:!0,name:"darkblue"},{value:"#000080",vga:!0,css:!0,name:"navy"},{value:"#191970",css:!0,name:"midnightblue"},{value:"#3D59AB",name:"cobalt"},{value:"#4169E1",css:!0,name:"royalblue"},{value:"#4876FF",name:"royalblue 1"},{value:"#436EEE",name:"royalblue 2"},{value:"#3A5FCD",name:"royalblue 3"},{value:"#27408B",name:"royalblue 4"},{value:"#6495ED",css:!0,name:"cornflowerblue"},{value:"#B0C4DE",css:!0,name:"lightsteelblue"},{value:"#CAE1FF",name:"lightsteelblue 1"},{value:"#BCD2EE",name:"lightsteelblue 2"},{value:"#A2B5CD",name:"lightsteelblue 3"},{value:"#6E7B8B",name:"lightsteelblue 4"},{value:"#778899",css:!0,name:"lightslategray"},{value:"#708090",css:!0,name:"slategray"},{value:"#C6E2FF",name:"slategray 1"},{value:"#B9D3EE",name:"slategray 2"},{value:"#9FB6CD",name:"slategray 3"},{value:"#6C7B8B",name:"slategray 4"},{value:"#1E90FF",name:"dodgerblue 1"},{value:"#1E90FF",css:!0,name:"dodgerblue"},{value:"#1C86EE",name:"dodgerblue 2"},{value:"#1874CD",name:"dodgerblue 3"},{value:"#104E8B",name:"dodgerblue 4"},{value:"#F0F8FF",css:!0,name:"aliceblue"},{value:"#4682B4",css:!0,name:"steelblue"},{value:"#63B8FF",name:"steelblue 1"},{value:"#5CACEE",name:"steelblue 2"},{value:"#4F94CD",name:"steelblue 3"},{value:"#36648B",name:"steelblue 4"},{value:"#87CEFA",css:!0,name:"lightskyblue"},{value:"#B0E2FF",name:"lightskyblue 1"},{value:"#A4D3EE",name:"lightskyblue 2"},{value:"#8DB6CD",name:"lightskyblue 3"},{value:"#607B8B",name:"lightskyblue 4"},{value:"#87CEFF",name:"skyblue 1"},{value:"#7EC0EE",name:"skyblue 2"},{value:"#6CA6CD",name:"skyblue 3"},{value:"#4A708B",name:"skyblue 4"},{value:"#87CEEB",css:!0,name:"skyblue"},{value:"#00BFFF",name:"deepskyblue 1"},{value:"#00BFFF",css:!0,name:"deepskyblue"},{value:"#00B2EE",name:"deepskyblue 2"},{value:"#009ACD",name:"deepskyblue 3"},{value:"#00688B",name:"deepskyblue 4"},{value:"#33A1C9",name:"peacock"},{value:"#ADD8E6",css:!0,name:"lightblue"},{value:"#BFEFFF",name:"lightblue 1"},{value:"#B2DFEE",name:"lightblue 2"},{value:"#9AC0CD",name:"lightblue 3"},{value:"#68838B",name:"lightblue 4"},{value:"#B0E0E6",css:!0,name:"powderblue"},{value:"#98F5FF",name:"cadetblue 1"},{value:"#8EE5EE",name:"cadetblue 2"},{value:"#7AC5CD",name:"cadetblue 3"},{value:"#53868B",name:"cadetblue 4"},{value:"#00F5FF",name:"turquoise 1"},{value:"#00E5EE",name:"turquoise 2"},{value:"#00C5CD",name:"turquoise 3"},{value:"#00868B",name:"turquoise 4"},{value:"#5F9EA0",css:!0,name:"cadetblue"},{value:"#00CED1",css:!0,name:"darkturquoise"},{value:"#F0FFFF",name:"azure 1"},{value:"#F0FFFF",css:!0,name:"azure"},{value:"#E0EEEE",name:"azure 2"},{value:"#C1CDCD",name:"azure 3"},{value:"#838B8B",name:"azure 4"},{value:"#E0FFFF",name:"lightcyan 1"},{value:"#E0FFFF",css:!0,name:"lightcyan"},{value:"#D1EEEE",name:"lightcyan 2"},{value:"#B4CDCD",name:"lightcyan 3"},{value:"#7A8B8B",name:"lightcyan 4"},{value:"#BBFFFF",name:"paleturquoise 1"},{value:"#AEEEEE",name:"paleturquoise 2"},{value:"#AEEEEE",css:!0,name:"paleturquoise"},{value:"#96CDCD",name:"paleturquoise 3"},{value:"#668B8B",name:"paleturquoise 4"},{value:"#2F4F4F",css:!0,name:"darkslategray"},{value:"#97FFFF",name:"darkslategray 1"},{value:"#8DEEEE",name:"darkslategray 2"},{value:"#79CDCD",name:"darkslategray 3"},{value:"#528B8B",name:"darkslategray 4"},{value:"#00FFFF",name:"cyan"},{value:"#00FFFF",css:!0,name:"aqua"},{value:"#00EEEE",name:"cyan 2"},{value:"#00CDCD",name:"cyan 3"},{value:"#008B8B",name:"cyan 4"},{value:"#008B8B",css:!0,name:"darkcyan"},{value:"#008080",vga:!0,css:!0,name:"teal"},{value:"#48D1CC",css:!0,name:"mediumturquoise"},{value:"#20B2AA",css:!0,name:"lightseagreen"},{value:"#03A89E",name:"manganeseblue"},{value:"#40E0D0",css:!0,name:"turquoise"},{value:"#808A87",name:"coldgrey"},{value:"#00C78C",name:"turquoiseblue"},{value:"#7FFFD4",name:"aquamarine 1"},{value:"#7FFFD4",css:!0,name:"aquamarine"},{value:"#76EEC6",name:"aquamarine 2"},{value:"#66CDAA",name:"aquamarine 3"},{value:"#66CDAA",css:!0,name:"mediumaquamarine"},{value:"#458B74",name:"aquamarine 4"},{value:"#00FA9A",css:!0,name:"mediumspringgreen"},{value:"#F5FFFA",css:!0,name:"mintcream"},{value:"#00FF7F",css:!0,name:"springgreen"},{value:"#00EE76",name:"springgreen 1"},{value:"#00CD66",name:"springgreen 2"},{value:"#008B45",name:"springgreen 3"},{value:"#3CB371",css:!0,name:"mediumseagreen"},{value:"#54FF9F",name:"seagreen 1"},{value:"#4EEE94",name:"seagreen 2"},{value:"#43CD80",name:"seagreen 3"},{value:"#2E8B57",name:"seagreen 4"},{value:"#2E8B57",css:!0,name:"seagreen"},{value:"#00C957",name:"emeraldgreen"},{value:"#BDFCC9",name:"mint"},{value:"#3D9140",name:"cobaltgreen"},{value:"#F0FFF0",name:"honeydew 1"},{value:"#F0FFF0",css:!0,name:"honeydew"},{value:"#E0EEE0",name:"honeydew 2"},{value:"#C1CDC1",name:"honeydew 3"},{value:"#838B83",name:"honeydew 4"},{value:"#8FBC8F",css:!0,name:"darkseagreen"},{value:"#C1FFC1",name:"darkseagreen 1"},{value:"#B4EEB4",name:"darkseagreen 2"},{value:"#9BCD9B",name:"darkseagreen 3"},{value:"#698B69",name:"darkseagreen 4"},{value:"#98FB98",css:!0,name:"palegreen"},{value:"#9AFF9A",name:"palegreen 1"},{value:"#90EE90",name:"palegreen 2"},{value:"#90EE90",css:!0,name:"lightgreen"},{value:"#7CCD7C",name:"palegreen 3"},{value:"#548B54",name:"palegreen 4"},{value:"#32CD32",css:!0,name:"limegreen"},{value:"#228B22",css:!0,name:"forestgreen"},{value:"#00FF00",vga:!0,name:"green 1"},{value:"#00FF00",vga:!0,css:!0,name:"lime"},{value:"#00EE00",name:"green 2"},{value:"#00CD00",name:"green 3"},{value:"#008B00",name:"green 4"},{value:"#008000",vga:!0,css:!0,name:"green"},{value:"#006400",css:!0,name:"darkgreen"},{value:"#308014",name:"sapgreen"},{value:"#7CFC00",css:!0,name:"lawngreen"},{value:"#7FFF00",name:"chartreuse 1"},{value:"#7FFF00",css:!0,name:"chartreuse"},{value:"#76EE00",name:"chartreuse 2"},{value:"#66CD00",name:"chartreuse 3"},{value:"#458B00",name:"chartreuse 4"},{value:"#ADFF2F",css:!0,name:"greenyellow"},{value:"#CAFF70",name:"darkolivegreen 1"},{value:"#BCEE68",name:"darkolivegreen 2"},{value:"#A2CD5A",name:"darkolivegreen 3"},{value:"#6E8B3D",name:"darkolivegreen 4"},{value:"#556B2F",css:!0,name:"darkolivegreen"},{value:"#6B8E23",css:!0,name:"olivedrab"},{value:"#C0FF3E",name:"olivedrab 1"},{value:"#B3EE3A",name:"olivedrab 2"},{value:"#9ACD32",name:"olivedrab 3"},{value:"#9ACD32",css:!0,name:"yellowgreen"},{value:"#698B22",name:"olivedrab 4"},{value:"#FFFFF0",name:"ivory 1"},{value:"#FFFFF0",css:!0,name:"ivory"},{value:"#EEEEE0",name:"ivory 2"},{value:"#CDCDC1",name:"ivory 3"},{value:"#8B8B83",name:"ivory 4"},{value:"#F5F5DC",css:!0,name:"beige"},{value:"#FFFFE0",name:"lightyellow 1"},{value:"#FFFFE0",css:!0,name:"lightyellow"},{value:"#EEEED1",name:"lightyellow 2"},{value:"#CDCDB4",name:"lightyellow 3"},{value:"#8B8B7A",name:"lightyellow 4"},{value:"#FAFAD2",css:!0,name:"lightgoldenrodyellow"},{value:"#FFFF00",vga:!0,name:"yellow 1"},{value:"#FFFF00",vga:!0,css:!0,name:"yellow"},{value:"#EEEE00",name:"yellow 2"},{value:"#CDCD00",name:"yellow 3"},{value:"#8B8B00",name:"yellow 4"},{value:"#808069",name:"warmgrey"},{value:"#808000",vga:!0,css:!0,name:"olive"},{value:"#BDB76B",css:!0,name:"darkkhaki"},{value:"#FFF68F",name:"khaki 1"},{value:"#EEE685",name:"khaki 2"},{value:"#CDC673",name:"khaki 3"},{value:"#8B864E",name:"khaki 4"},{value:"#F0E68C",css:!0,name:"khaki"},{value:"#EEE8AA",css:!0,name:"palegoldenrod"},{value:"#FFFACD",name:"lemonchiffon 1"},{value:"#FFFACD",css:!0,name:"lemonchiffon"},{value:"#EEE9BF",name:"lemonchiffon 2"},{value:"#CDC9A5",name:"lemonchiffon 3"},{value:"#8B8970",name:"lemonchiffon 4"},{value:"#FFEC8B",name:"lightgoldenrod 1"},{value:"#EEDC82",name:"lightgoldenrod 2"},{value:"#CDBE70",name:"lightgoldenrod 3"},{value:"#8B814C",name:"lightgoldenrod 4"},{value:"#E3CF57",name:"banana"},{value:"#FFD700",name:"gold 1"},{value:"#FFD700",css:!0,name:"gold"},{value:"#EEC900",name:"gold 2"},{value:"#CDAD00",name:"gold 3"},{value:"#8B7500",name:"gold 4"},{value:"#FFF8DC",name:"cornsilk 1"},{value:"#FFF8DC",css:!0,name:"cornsilk"},{value:"#EEE8CD",name:"cornsilk 2"},{value:"#CDC8B1",name:"cornsilk 3"},{value:"#8B8878",name:"cornsilk 4"},{value:"#DAA520",css:!0,name:"goldenrod"},{value:"#FFC125",name:"goldenrod 1"},{value:"#EEB422",name:"goldenrod 2"},{value:"#CD9B1D",name:"goldenrod 3"},{value:"#8B6914",name:"goldenrod 4"},{value:"#B8860B",css:!0,name:"darkgoldenrod"},{value:"#FFB90F",name:"darkgoldenrod 1"},{value:"#EEAD0E",name:"darkgoldenrod 2"},{value:"#CD950C",name:"darkgoldenrod 3"},{value:"#8B6508",name:"darkgoldenrod 4"},{value:"#FFA500",name:"orange 1"},{value:"#FF8000",css:!0,name:"orange"},{value:"#EE9A00",name:"orange 2"},{value:"#CD8500",name:"orange 3"},{value:"#8B5A00",name:"orange 4"},{value:"#FFFAF0",css:!0,name:"floralwhite"},{value:"#FDF5E6",css:!0,name:"oldlace"},{value:"#F5DEB3",css:!0,name:"wheat"},{value:"#FFE7BA",name:"wheat 1"},{value:"#EED8AE",name:"wheat 2"},{value:"#CDBA96",name:"wheat 3"},{value:"#8B7E66",name:"wheat 4"},{value:"#FFE4B5",css:!0,name:"moccasin"},{value:"#FFEFD5",css:!0,name:"papayawhip"},{value:"#FFEBCD",css:!0,name:"blanchedalmond"},{value:"#FFDEAD",name:"navajowhite 1"},{value:"#FFDEAD",css:!0,name:"navajowhite"},{value:"#EECFA1",name:"navajowhite 2"},{value:"#CDB38B",name:"navajowhite 3"},{value:"#8B795E",name:"navajowhite 4"},{value:"#FCE6C9",name:"eggshell"},{value:"#D2B48C",css:!0,name:"tan"},{value:"#9C661F",name:"brick"},{value:"#FF9912",name:"cadmiumyellow"},{value:"#FAEBD7",css:!0,name:"antiquewhite"},{value:"#FFEFDB",name:"antiquewhite 1"},{value:"#EEDFCC",name:"antiquewhite 2"},{value:"#CDC0B0",name:"antiquewhite 3"},{value:"#8B8378",name:"antiquewhite 4"},{value:"#DEB887",css:!0,name:"burlywood"},{value:"#FFD39B",name:"burlywood 1"},{value:"#EEC591",name:"burlywood 2"},{value:"#CDAA7D",name:"burlywood 3"},{value:"#8B7355",name:"burlywood 4"},{value:"#FFE4C4",name:"bisque 1"},{value:"#FFE4C4",css:!0,name:"bisque"},{value:"#EED5B7",name:"bisque 2"},{value:"#CDB79E",name:"bisque 3"},{value:"#8B7D6B",name:"bisque 4"},{value:"#E3A869",name:"melon"},{value:"#ED9121",name:"carrot"},{value:"#FF8C00",css:!0,name:"darkorange"},{value:"#FF7F00",name:"darkorange 1"},{value:"#EE7600",name:"darkorange 2"},{value:"#CD6600",name:"darkorange 3"},{value:"#8B4500",name:"darkorange 4"},{value:"#FFA54F",name:"tan 1"},{value:"#EE9A49",name:"tan 2"},{value:"#CD853F",name:"tan 3"},{value:"#CD853F",css:!0,name:"peru"},{value:"#8B5A2B",name:"tan 4"},{value:"#FAF0E6",css:!0,name:"linen"},{value:"#FFDAB9",name:"peachpuff 1"},{value:"#FFDAB9",css:!0,name:"peachpuff"},{value:"#EECBAD",name:"peachpuff 2"},{value:"#CDAF95",name:"peachpuff 3"},{value:"#8B7765",name:"peachpuff 4"},{value:"#FFF5EE",name:"seashell 1"},{value:"#FFF5EE",css:!0,name:"seashell"},{value:"#EEE5DE",name:"seashell 2"},{value:"#CDC5BF",name:"seashell 3"},{value:"#8B8682",name:"seashell 4"},{value:"#F4A460",css:!0,name:"sandybrown"},{value:"#C76114",name:"rawsienna"},{value:"#D2691E",css:!0,name:"chocolate"},{value:"#FF7F24",name:"chocolate 1"},{value:"#EE7621",name:"chocolate 2"},{value:"#CD661D",name:"chocolate 3"},{value:"#8B4513",name:"chocolate 4"},{value:"#8B4513",css:!0,name:"saddlebrown"},{value:"#292421",name:"ivoryblack"},{value:"#FF7D40",name:"flesh"},{value:"#FF6103",name:"cadmiumorange"},{value:"#8A360F",name:"burntsienna"},{value:"#A0522D",css:!0,name:"sienna"},{value:"#FF8247",name:"sienna 1"},{value:"#EE7942",name:"sienna 2"},{value:"#CD6839",name:"sienna 3"},{value:"#8B4726",name:"sienna 4"},{value:"#FFA07A",name:"lightsalmon 1"},{value:"#FFA07A",css:!0,name:"lightsalmon"},{value:"#EE9572",name:"lightsalmon 2"},{value:"#CD8162",name:"lightsalmon 3"},{value:"#8B5742",name:"lightsalmon 4"},{value:"#FF7F50",css:!0,name:"coral"},{value:"#FF4500",name:"orangered 1"},{value:"#FF4500",css:!0,name:"orangered"},{value:"#EE4000",name:"orangered 2"},{value:"#CD3700",name:"orangered 3"},{value:"#8B2500",name:"orangered 4"},{value:"#5E2612",name:"sepia"},{value:"#E9967A",css:!0,name:"darksalmon"},{value:"#FF8C69",name:"salmon 1"},{value:"#EE8262",name:"salmon 2"},{value:"#CD7054",name:"salmon 3"},{value:"#8B4C39",name:"salmon 4"},{value:"#FF7256",name:"coral 1"},{value:"#EE6A50",name:"coral 2"},{value:"#CD5B45",name:"coral 3"},{value:"#8B3E2F",name:"coral 4"},{value:"#8A3324",name:"burntumber"},{value:"#FF6347",name:"tomato 1"},{value:"#FF6347",css:!0,name:"tomato"},{value:"#EE5C42",name:"tomato 2"},{value:"#CD4F39",name:"tomato 3"},{value:"#8B3626",name:"tomato 4"},{value:"#FA8072",css:!0,name:"salmon"},{value:"#FFE4E1",name:"mistyrose 1"},{value:"#FFE4E1",css:!0,name:"mistyrose"},{value:"#EED5D2",name:"mistyrose 2"},{value:"#CDB7B5",name:"mistyrose 3"},{value:"#8B7D7B",name:"mistyrose 4"},{value:"#FFFAFA",name:"snow 1"},{value:"#FFFAFA",css:!0,name:"snow"},{value:"#EEE9E9",name:"snow 2"},{value:"#CDC9C9",name:"snow 3"},{value:"#8B8989",name:"snow 4"},{value:"#BC8F8F",css:!0,name:"rosybrown"},{value:"#FFC1C1",name:"rosybrown 1"},{value:"#EEB4B4",name:"rosybrown 2"},{value:"#CD9B9B",name:"rosybrown 3"},{value:"#8B6969",name:"rosybrown 4"},{value:"#F08080",css:!0,name:"lightcoral"},{value:"#CD5C5C",css:!0,name:"indianred"},{value:"#FF6A6A",name:"indianred 1"},{value:"#EE6363",name:"indianred 2"},{value:"#8B3A3A",name:"indianred 4"},{value:"#CD5555",name:"indianred 3"},{value:"#A52A2A",css:!0,name:"brown"},{value:"#FF4040",name:"brown 1"},{value:"#EE3B3B",name:"brown 2"},{value:"#CD3333",name:"brown 3"},{value:"#8B2323",name:"brown 4"},{value:"#B22222",css:!0,name:"firebrick"},{value:"#FF3030",name:"firebrick 1"},{value:"#EE2C2C",name:"firebrick 2"},{value:"#CD2626",name:"firebrick 3"},{value:"#8B1A1A",name:"firebrick 4"},{value:"#FF0000",vga:!0,name:"red 1"},{value:"#FF0000",vga:!0,css:!0,name:"red"},{value:"#EE0000",name:"red 2"},{value:"#CD0000",name:"red 3"},{value:"#8B0000",name:"red 4"},{value:"#8B0000",css:!0,name:"darkred"},{value:"#800000",vga:!0,css:!0,name:"maroon"},{value:"#8E388E",name:"sgi beet"},{value:"#7171C6",name:"sgi slateblue"},{value:"#7D9EC0",name:"sgi lightblue"},{value:"#388E8E",name:"sgi teal"},{value:"#71C671",name:"sgi chartreuse"},{value:"#8E8E38",name:"sgi olivedrab"},{value:"#C5C1AA",name:"sgi brightgray"},{value:"#C67171",name:"sgi salmon"},{value:"#555555",name:"sgi darkgray"},{value:"#1E1E1E",name:"sgi gray 12"},{value:"#282828",name:"sgi gray 16"},{value:"#515151",name:"sgi gray 32"},{value:"#5B5B5B",name:"sgi gray 36"},{value:"#848484",name:"sgi gray 52"},{value:"#8E8E8E",name:"sgi gray 56"},{value:"#AAAAAA",name:"sgi lightgray"},{value:"#B7B7B7",name:"sgi gray 72"},{value:"#C1C1C1",name:"sgi gray 76"},{value:"#EAEAEA",name:"sgi gray 92"},{value:"#F4F4F4",name:"sgi gray 96"},{value:"#FFFFFF",vga:!0,css:!0,name:"white"},{value:"#F5F5F5",name:"white smoke"},{value:"#F5F5F5",name:"gray 96"},{value:"#DCDCDC",css:!0,name:"gainsboro"},{value:"#D3D3D3",css:!0,name:"lightgrey"},{value:"#C0C0C0",vga:!0,css:!0,name:"silver"},{value:"#A9A9A9",css:!0,name:"darkgray"},{value:"#808080",vga:!0,css:!0,name:"gray"},{value:"#696969",css:!0,name:"dimgray"},{value:"#696969",name:"gray 42"},{value:"#000000",vga:!0,css:!0,name:"black"},{value:"#FCFCFC",name:"gray 99"},{value:"#FAFAFA",name:"gray 98"},{value:"#F7F7F7",name:"gray 97"},{value:"#F2F2F2",name:"gray 95"},{value:"#F0F0F0",name:"gray 94"},{value:"#EDEDED",name:"gray 93"},{value:"#EBEBEB",name:"gray 92"},{value:"#E8E8E8",name:"gray 91"},{value:"#E5E5E5",name:"gray 90"},{value:"#E3E3E3",name:"gray 89"},{value:"#E0E0E0",name:"gray 88"},{value:"#DEDEDE",name:"gray 87"},{value:"#DBDBDB",name:"gray 86"},{value:"#D9D9D9",name:"gray 85"},{value:"#D6D6D6",name:"gray 84"},{value:"#D4D4D4",name:"gray 83"},{value:"#D1D1D1",name:"gray 82"},{value:"#CFCFCF",name:"gray 81"},{value:"#CCCCCC",name:"gray 80"},{value:"#C9C9C9",name:"gray 79"},{value:"#C7C7C7",name:"gray 78"},{value:"#C4C4C4",name:"gray 77"},{value:"#C2C2C2",name:"gray 76"},{value:"#BFBFBF",name:"gray 75"},{value:"#BDBDBD",name:"gray 74"},{value:"#BABABA",name:"gray 73"},{value:"#B8B8B8",name:"gray 72"},{value:"#B5B5B5",name:"gray 71"},{value:"#B3B3B3",name:"gray 70"},{value:"#B0B0B0",name:"gray 69"},{value:"#ADADAD",name:"gray 68"},{value:"#ABABAB",name:"gray 67"},{value:"#A8A8A8",name:"gray 66"},{value:"#A6A6A6",name:"gray 65"},{value:"#A3A3A3",name:"gray 64"},{value:"#A1A1A1",name:"gray 63"},{value:"#9E9E9E",name:"gray 62"},{value:"#9C9C9C",name:"gray 61"},{value:"#999999",name:"gray 60"},{value:"#969696",name:"gray 59"},{value:"#949494",name:"gray 58"},{value:"#919191",name:"gray 57"},{value:"#8F8F8F",name:"gray 56"},{value:"#8C8C8C",name:"gray 55"},{value:"#8A8A8A",name:"gray 54"},{value:"#878787",name:"gray 53"},{value:"#858585",name:"gray 52"},{value:"#828282",name:"gray 51"},{value:"#7F7F7F",name:"gray 50"},{value:"#7D7D7D",name:"gray 49"},{value:"#7A7A7A",name:"gray 48"},{value:"#787878",name:"gray 47"},{value:"#757575",name:"gray 46"},{value:"#737373",name:"gray 45"},{value:"#707070",name:"gray 44"},{value:"#6E6E6E",name:"gray 43"},{value:"#666666",name:"gray 40"},{value:"#636363",name:"gray 39"},{value:"#616161",name:"gray 38"},{value:"#5E5E5E",name:"gray 37"},{value:"#5C5C5C",name:"gray 36"},{value:"#595959",name:"gray 35"},{value:"#575757",name:"gray 34"},{value:"#545454",name:"gray 33"},{value:"#525252",name:"gray 32"},{value:"#4F4F4F",name:"gray 31"},{value:"#4D4D4D",name:"gray 30"},{value:"#4A4A4A",name:"gray 29"},{value:"#474747",name:"gray 28"},{value:"#454545",name:"gray 27"},{value:"#424242",name:"gray 26"},{value:"#404040",name:"gray 25"},{value:"#3D3D3D",name:"gray 24"},{value:"#3B3B3B",name:"gray 23"},{value:"#383838",name:"gray 22"},{value:"#363636",name:"gray 21"},{value:"#333333",name:"gray 20"},{value:"#303030",name:"gray 19"},{value:"#2E2E2E",name:"gray 18"},{value:"#2B2B2B",name:"gray 17"},{value:"#292929",name:"gray 16"},{value:"#262626",name:"gray 15"},{value:"#242424",name:"gray 14"},{value:"#212121",name:"gray 13"},{value:"#1F1F1F",name:"gray 12"},{value:"#1C1C1C",name:"gray 11"},{value:"#1A1A1A",name:"gray 10"},{value:"#171717",name:"gray 9"},{value:"#141414",name:"gray 8"},{value:"#121212",name:"gray 7"},{value:"#0F0F0F",name:"gray 6"},{value:"#0D0D0D",name:"gray 5"},{value:"#0A0A0A",name:"gray 4"},{value:"#080808",name:"gray 3"},{value:"#050505",name:"gray 2"},{value:"#030303",name:"gray 1"},{value:"#F5F5F5",css:!0,name:"whitesmoke"}];(function(t){var e=An,n=e.filter(function(s){return!!s.css}),a=e.filter(function(s){return!!s.vga});t.exports=function(s){var r=t.exports.get(s);return r&&r.value},t.exports.get=function(s){return s=s||"",s=s.trim().toLowerCase(),e.filter(function(r){return r.name.toLowerCase()===s}).pop()},t.exports.all=t.exports.get.all=function(){return e},t.exports.get.css=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),n.filter(function(r){return r.name.toLowerCase()===s}).pop()):n},t.exports.get.vga=function(s){return s?(s=s||"",s=s.trim().toLowerCase(),a.filter(function(r){return r.name.toLowerCase()===s}).pop()):a}})(dt);var Dn=dt.exports,kn=1/0,Sn="[object Symbol]",Tn=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,ft="\\ud800-\\udfff",_n="\\u0300-\\u036f\\ufe20-\\ufe23",Bn="\\u20d0-\\u20f0",ht="\\u2700-\\u27bf",pt="a-z\\xdf-\\xf6\\xf8-\\xff",In="\\xac\\xb1\\xd7\\xf7",wn="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",Mn="\\u2000-\\u206f",jn=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",gt="A-Z\\xc0-\\xd6\\xd8-\\xde",On="\\ufe0e\\ufe0f",vt=In+wn+Mn+jn,yt="['’]",Te="["+vt+"]",Ln="["+_n+Bn+"]",bt="\\d+",Pn="["+ht+"]",Et="["+pt+"]",xt="[^"+ft+vt+bt+ht+pt+gt+"]",Rn="\\ud83c[\\udffb-\\udfff]",$n="(?:"+Ln+"|"+Rn+")",Nn="[^"+ft+"]",Ft="(?:\\ud83c[\\udde6-\\uddff]){2}",Ct="[\\ud800-\\udbff][\\udc00-\\udfff]",R="["+gt+"]",Hn="\\u200d",_e="(?:"+Et+"|"+xt+")",Yn="(?:"+R+"|"+xt+")",Be="(?:"+yt+"(?:d|ll|m|re|s|t|ve))?",Ie="(?:"+yt+"(?:D|LL|M|RE|S|T|VE))?",At=$n+"?",Dt="["+On+"]?",Gn="(?:"+Hn+"(?:"+[Nn,Ft,Ct].join("|")+")"+Dt+At+")*",zn=Dt+At+Gn,Un="(?:"+[Pn,Ft,Ct].join("|")+")"+zn,Vn=RegExp([R+"?"+Et+"+"+Be+"(?="+[Te,R,"$"].join("|")+")",Yn+"+"+Ie+"(?="+[Te,R+_e,"$"].join("|")+")",R+"?"+_e+"+"+Be,R+"+"+Ie,bt,Un].join("|"),"g"),Xn=/[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,Wn=typeof S=="object"&&S&&S.Object===Object&&S,qn=typeof self=="object"&&self&&self.Object===Object&&self,Kn=Wn||qn||Function("return this")();function Zn(t){return t.match(Tn)||[]}function Jn(t){return Xn.test(t)}function Qn(t){return t.match(Vn)||[]}var ea=Object.prototype,ta=ea.toString,we=Kn.Symbol,Me=we?we.prototype:void 0,je=Me?Me.toString:void 0;function na(t){if(typeof t=="string")return t;if(sa(t))return je?je.call(t):"";var e=t+"";return e=="0"&&1/t==-kn?"-0":e}function aa(t){return!!t&&typeof t=="object"}function sa(t){return typeof t=="symbol"||aa(t)&&ta.call(t)==Sn}function ra(t){return t==null?"":na(t)}function ia(t,e,n){return t=ra(t),e=n?void 0:e,e===void 0?Jn(t)?Qn(t):Zn(t):t.match(e)||[]}var oa=ia,ua=1/0,la="[object Symbol]",ca=/^\s+/,be="\\ud800-\\udfff",kt="\\u0300-\\u036f\\ufe20-\\ufe23",St="\\u20d0-\\u20f0",Tt="\\ufe0e\\ufe0f",ma="["+be+"]",re="["+kt+St+"]",ie="\\ud83c[\\udffb-\\udfff]",da="(?:"+re+"|"+ie+")",_t="[^"+be+"]",Bt="(?:\\ud83c[\\udde6-\\uddff]){2}",It="[\\ud800-\\udbff][\\udc00-\\udfff]",wt="\\u200d",Mt=da+"?",jt="["+Tt+"]?",fa="(?:"+wt+"(?:"+[_t,Bt,It].join("|")+")"+jt+Mt+")*",ha=jt+Mt+fa,pa="(?:"+[_t+re+"?",re,Bt,It,ma].join("|")+")",ga=RegExp(ie+"(?="+ie+")|"+pa+ha,"g"),va=RegExp("["+wt+be+kt+St+Tt+"]"),ya=typeof S=="object"&&S&&S.Object===Object&&S,ba=typeof self=="object"&&self&&self.Object===Object&&self,Ea=ya||ba||Function("return this")();function xa(t){return t.split("")}function Fa(t,e,n,a){for(var s=t.length,r=n+-1;++r<s;)if(e(t[r],r,t))return r;return-1}function Ca(t,e,n){if(e!==e)return Fa(t,Aa,n);for(var a=n-1,s=t.length;++a<s;)if(t[a]===e)return a;return-1}function Aa(t){return t!==t}function Da(t,e){for(var n=-1,a=t.length;++n<a&&Ca(e,t[n],0)>-1;);return n}function ka(t){return va.test(t)}function Oe(t){return ka(t)?Sa(t):xa(t)}function Sa(t){return t.match(ga)||[]}var Ta=Object.prototype,_a=Ta.toString,Le=Ea.Symbol,Pe=Le?Le.prototype:void 0,Re=Pe?Pe.toString:void 0;function Ba(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var r=Array(s);++a<s;)r[a]=t[a+e];return r}function Ot(t){if(typeof t=="string")return t;if(Ma(t))return Re?Re.call(t):"";var e=t+"";return e=="0"&&1/t==-ua?"-0":e}function Ia(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:Ba(t,e,n)}function wa(t){return!!t&&typeof t=="object"}function Ma(t){return typeof t=="symbol"||wa(t)&&_a.call(t)==la}function ja(t){return t==null?"":Ot(t)}function Oa(t,e,n){if(t=ja(t),t&&(n||e===void 0))return t.replace(ca,"");if(!t||!(e=Ot(e)))return t;var a=Oe(t),s=Da(a,Oe(e));return Ia(a,s).join("")}var La=Oa,oe=1/0,Pa=9007199254740991,Ra=17976931348623157e292,$e=NaN,$a="[object Symbol]",Na=/^\s+|\s+$/g,Ha=/^[-+]0x[0-9a-f]+$/i,Ya=/^0b[01]+$/i,Ga=/^0o[0-7]+$/i,Ee="\\ud800-\\udfff",Lt="\\u0300-\\u036f\\ufe20-\\ufe23",Pt="\\u20d0-\\u20f0",Rt="\\ufe0e\\ufe0f",za="["+Ee+"]",ue="["+Lt+Pt+"]",le="\\ud83c[\\udffb-\\udfff]",Ua="(?:"+ue+"|"+le+")",$t="[^"+Ee+"]",Nt="(?:\\ud83c[\\udde6-\\uddff]){2}",Ht="[\\ud800-\\udbff][\\udc00-\\udfff]",Yt="\\u200d",Gt=Ua+"?",zt="["+Rt+"]?",Va="(?:"+Yt+"(?:"+[$t,Nt,Ht].join("|")+")"+zt+Gt+")*",Xa=zt+Gt+Va,Wa="(?:"+[$t+ue+"?",ue,Nt,Ht,za].join("|")+")",ce=RegExp(le+"(?="+le+")|"+Wa+Xa,"g"),qa=RegExp("["+Yt+Ee+Lt+Pt+Rt+"]"),Ka=parseInt,Za=typeof S=="object"&&S&&S.Object===Object&&S,Ja=typeof self=="object"&&self&&self.Object===Object&&self,Qa=Za||Ja||Function("return this")(),es=ns("length");function ts(t){return t.split("")}function ns(t){return function(e){return e==null?void 0:e[t]}}function xe(t){return qa.test(t)}function Ut(t){return xe(t)?ss(t):es(t)}function as(t){return xe(t)?rs(t):ts(t)}function ss(t){for(var e=ce.lastIndex=0;ce.test(t);)e++;return e}function rs(t){return t.match(ce)||[]}var is=Object.prototype,os=is.toString,Ne=Qa.Symbol,us=Math.ceil,ls=Math.floor,He=Ne?Ne.prototype:void 0,Ye=He?He.toString:void 0;function Ge(t,e){var n="";if(!t||e<1||e>Pa)return n;do e%2&&(n+=t),e=ls(e/2),e&&(t+=t);while(e);return n}function cs(t,e,n){var a=-1,s=t.length;e<0&&(e=-e>s?0:s+e),n=n>s?s:n,n<0&&(n+=s),s=e>n?0:n-e>>>0,e>>>=0;for(var r=Array(s);++a<s;)r[a]=t[a+e];return r}function Vt(t){if(typeof t=="string")return t;if(Xt(t))return Ye?Ye.call(t):"";var e=t+"";return e=="0"&&1/t==-oe?"-0":e}function ms(t,e,n){var a=t.length;return n=n===void 0?a:n,!e&&n>=a?t:cs(t,e,n)}function ds(t,e){e=e===void 0?" ":Vt(e);var n=e.length;if(n<2)return n?Ge(e,t):e;var a=Ge(e,us(t/Ut(e)));return xe(e)?ms(as(a),0,t).join(""):a.slice(0,t)}function ze(t){var e=typeof t;return!!t&&(e=="object"||e=="function")}function fs(t){return!!t&&typeof t=="object"}function Xt(t){return typeof t=="symbol"||fs(t)&&os.call(t)==$a}function hs(t){if(!t)return t===0?t:0;if(t=gs(t),t===oe||t===-oe){var e=t<0?-1:1;return e*Ra}return t===t?t:0}function ps(t){var e=hs(t),n=e%1;return e===e?n?e-n:e:0}function gs(t){if(typeof t=="number")return t;if(Xt(t))return $e;if(ze(t)){var e=typeof t.valueOf=="function"?t.valueOf():t;t=ze(e)?e+"":e}if(typeof t!="string")return t===0?t:+t;t=t.replace(Na,"");var n=Ya.test(t);return n||Ga.test(t)?Ka(t.slice(2),n?2:8):Ha.test(t)?$e:+t}function vs(t){return t==null?"":Vt(t)}function ys(t,e,n){t=vs(t),e=ps(e);var a=e?Ut(t):0;return e&&a<e?t+ds(e-a,n):t}var bs=ys,Es=(t,e,n,a)=>{const s=(t+(a||"")).toString().includes("%");if(typeof t=="string"?[t,e,n,a]=t.match(/(0?\.?\d{1,3})%?\b/g).map(Number):a!==void 0&&(a=parseFloat(a)),typeof t!="number"||typeof e!="number"||typeof n!="number"||t>255||e>255||n>255)throw new TypeError("Expected three numbers below 256");if(typeof a=="number"){if(!s&&a>=0&&a<=1)a=Math.round(255*a);else if(s&&a>=0&&a<=100)a=Math.round(255*a/100);else throw new TypeError(`Expected alpha value (${a}) as a fraction or percentage`);a=(a|256).toString(16).slice(1)}else a="";return(n|e<<8|t<<16|1<<24).toString(16).slice(1)+a};const H="a-f\\d",xs=`#?[${H}]{3}[${H}]?`,Fs=`#?[${H}]{6}([${H}]{2})?`,Cs=new RegExp(`[^#${H}]`,"gi"),As=new RegExp(`^${xs}$|^${Fs}$`,"i");var Ds=(t,e={})=>{if(typeof t!="string"||Cs.test(t)||!As.test(t))throw new TypeError("Expected a valid hex string");t=t.replace(/^#/,"");let n=1;t.length===8&&(n=Number.parseInt(t.slice(6,8),16)/255,t=t.slice(0,6)),t.length===4&&(n=Number.parseInt(t.slice(3,4).repeat(2),16)/255,t=t.slice(0,3)),t.length===3&&(t=t[0]+t[0]+t[1]+t[1]+t[2]+t[2]);const a=Number.parseInt(t,16),s=a>>16,r=a>>8&255,i=a&255,u=typeof e.alpha=="number"?e.alpha:n;if(e.format==="array")return[s,r,i,u];if(e.format==="css"){const o=u===1?"":` / ${Number((u*100).toFixed(2))}%`;return`rgb(${s} ${r} ${i}${o})`}return{red:s,green:r,blue:i,alpha:u}},ks=Dn,Ss=oa,Ts=La,_s=bs,Bs=Es,Wt=Ds;const ee=.75,te=.25,ne=16777215,Is=49979693;var ws=function(t){return"#"+Os(String(JSON.stringify(t)))};function Ms(t){var e=Ss(t),n=[];return e.forEach(function(a){var s=ks(a);s&&n.push(Wt(Ts(s,"#"),{format:"array"}))}),n}function js(t){var e=[0,0,0];return t.forEach(function(n){for(var a=0;a<3;a++)e[a]+=n[a]}),[e[0]/t.length,e[1]/t.length,e[2]/t.length]}function Os(t){var e,n=Ms(t);n.length>0&&(e=js(n));var a=1,s=0,r=1;if(t.length>0)for(var i=0;i<t.length;i++)t[i].charCodeAt(0)>s&&(s=t[i].charCodeAt(0)),r=parseInt(ne/s),a=(a+t[i].charCodeAt(0)*r*Is)%ne;var u=(a*t.length%ne).toString(16);u=_s(u,6,u);var o=Wt(u,{format:"array"});return e?Bs(te*o[0]+ee*e[0],te*o[1]+ee*e[1],te*o[2]+ee*e[2]):u}const Ls=yn(ws);function Ps(t){return[...Rs].sort(()=>Math.random()-Math.random()).slice(0,t)}const Rs=["Elloria","Velaris","Cairndor","Morthril","Silverkeep","Eaglebrook","Frostholm","Mournwind","Shadowfen","Sunspire","Tristfall","Winterhold","Duskendale","Ravenwood","Greenguard","Dragonfall","Stormwatch","Starhaven","Ironforge","Ironclad","Goldshire","Blacksand","Ashenvale","Whisperwind","Brightwater","Highrock","Stonegate","Thunderbluff","Dunewatch","Zephyrhills","Fallbrook","Lunarglade","Stormpeak","Cragmoor","Ridgewood","Mistvale","Eversong","Coldspring","Hawke's Hollow","Pinecrest","Thornfield","Emberfall","Stormholm","Myrkwater","Windstead","Feyberry","Duskmire","Elmshade","Stonemire","Willowdale","Grimmreach","Thundertop","Nighthaven","Sunfall","Ashenwood","Brightmire","Stoneridge","Ironoak","Mithrintor","Sablecross","Westwatch","Greendale","Dragonspire","Eagle's Perch","Stormhaven","Brightforge","Silverglade","Mournstone","Opalspire","Griffon's Roost","Sunshadow","Frostpeak","Thorncrest","Goldspire","Darkhollow","Eastgate","Wolf's Den","Shrouded Hollow","Brambleshire","Onyxbluff","Skystone","Cinderfall","Emberstone","Stormglen","Highfell","Silverbrook","Elmsreach","Lostbay","Gloomshade","Thundertree","Bywater","Nighthollow","Firefly Glen","Iceridge","Greenmont","Ashenshade","Winterfort","Duskhaven"];function qt(t){return[...$s].sort(()=>Math.random()-Math.random()).slice(0,t)}const $s=["Unittoria","Zaratopia","Novo Brasil","Industia","Chimerica","Ruslavia","Generistan","Eurasica","Pacifika","Afrigon","Arablend","Mexitana","Canadia","Germaine","Italica","Portugo","Francette","Iberica","Scotlund","Norgecia","Suedland","Fennia","Australis","Zealandia","Argentum","Chileon","Peruvio","Bolivar","Colombera","Venezuelaa","Arcticia","Antausia"],me=10,_=20,Ns=5,Hs=_/Ns,Ys=.5,Gs=500,z=.05,de=5,ae=60;function zs(){const t=[[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],e=Array.from({length:256},(s,r)=>r).sort(()=>Math.random()-.5),n=[...e,...e];function a(s,r,i){return s[0]*r+s[1]*i}return function(r,i){const u=Math.floor(r)&255,o=Math.floor(i)&255;r-=Math.floor(r),i-=Math.floor(i);const c=r*r*r*(r*(r*6-15)+10),l=i*i*i*(i*(i*6-15)+10),d=n[u]+o,h=n[u+1]+o;return(1+(a(t[n[d]&7],r,i)*(1-c)+a(t[n[h]&7],r-1,i)*c)*(1-l)+(a(t[n[d+1]&7],r,i-1)*(1-c)+a(t[n[h+1]&7],r-1,i-1)*c)*l)/2}}function fe(t,e,n,a,s,r){const i=zs(),u=Math.floor(t.x/r),o=Math.floor(t.y/r),c=Math.floor(a/4),l=.5,d=.005,h=.7;for(let m=o-c;m<=o+c;m++)for(let p=u-c;p<=u+c;p++)if(p>=0&&p<a&&m>=0&&m<s){let E=p,A=m;for(let w=0;w<e;w++)Math.random()<h&&(E+=Math.random()>.5?1:-1,A+=Math.random()>.5?1:-1);E=Math.max(0,Math.min(a-1,E)),A=Math.max(0,Math.min(s-1,A));const B=Math.sqrt((E-u)*(E-u)+(A-o)*(A-o))/c,M=i(p*d,m*d);if(B<1&&M>l+B*.01){const w=m*a+p;n[w].type=T.GROUND,n[w].depth=void 0,n[w].height=(1-B)*2*(M-l)}}const g=Math.min(Math.max(o*a+u,0),a);n[g].type=T.GROUND,n[g].depth=void 0,n[g].height=1}function Us(t,e,n){return{x:Math.floor(Math.random()*(t*.8)+t*.1)*n,y:Math.floor(Math.random()*(e*.8)+e*.1)*n}}function Vs(t,e,n,a){if(t.x<0||t.y<0||t.x>=n||t.y>=a)return!1;const s=Math.floor(n/(Math.sqrt(e.length+1)*2));return e.every(r=>Math.abs(t.x-r.x)>s||Math.abs(t.y-r.y)>s)}function Xs(t,e,n){return e.every(a=>Math.sqrt(Math.pow(t.x-a.position.x,2)+Math.pow(t.y-a.position.y,2))>=n)}function Ws(t,e,n,a,s,r){const i=[],u=[],o=[],c=_*3,l=qt(t*2).filter(m=>m!==e),d=5,h=Ps(t*d*2),g=[];for(let m=0;m<t;m++){const p=`state-${m+1}`,E=m===0?e:l.pop(),A=qs(p,E,m===0);i.push(A),i.forEach(M=>{A.strategies[M.id]=y.NEUTRAL,M.strategies[p]=y.NEUTRAL});const B=Ks(g,n,a,s);g.push(B),fe(B,n/2,r,n,a,s),Zs(p,B,d,h,u,o,c,s,r,n,a)}return{states:i,cities:u,launchSites:o}}function qs(t,e,n){return{id:t,name:e,color:Ls(e),isPlayerControlled:n,strategies:{},generalStrategy:n?void 0:[y.NEUTRAL,y.HOSTILE,y.FRIENDLY].sort(()=>Math.random()-.5)[0]}}function Ks(t,e,n,a){let s,r=10;do if(s=Us(e,n,a),r--<=0)break;while(!Vs(s,t,e,n));return s}function Zs(t,e,n,a,s,r,i,u,o,c,l){const d=[];for(let h=0;h<n;h++){const g=Ue(e,d,i,30*u);d.push({position:g}),s.push({id:`city-${s.length+1}`,stateId:t,name:a.pop(),position:g,populationHistogram:[{timestamp:0,population:Math.floor(Math.random()*3e3)+1e3}]}),fe(g,2,o,c,l,u)}for(let h=0;h<4;h++){const g=Ue(e,d,i,15*u);d.push({position:g}),r.push({type:ct.LAUNCH_SITE,id:`launch-site-${r.length+1}`,stateId:t,position:g}),fe(g,1,o,c,l,u)}return d}function Ue(t,e,n,a){let s,r=10;do if(s={x:t.x+(Math.random()-.5)*a,y:t.y+(Math.random()-.5)*a},r--<=0)break;while(!Xs(s,e,n));return s}function Js({playerStateName:t,numberOfStates:e=3}){const a=Math.max(200,Math.ceil(Math.sqrt(e)*10)),s=a,r=[];for(let d=0;d<s;d++)for(let h=0;h<a;h++)r.push({id:`sector-${r.length+1}`,position:{x:h*16,y:d*16},rect:{left:h*16,top:d*16,right:(h+1)*16,bottom:(d+1)*16},type:T.WATER,depth:0,height:0});const{states:i,cities:u,launchSites:o}=Ws(e,t,a,s,16,r);return Fn(r,a,s),{timestamp:0,states:i,cities:u,launchSites:o,sectors:r,missiles:[],explosions:[]}}function D(t,e,n,a){return Math.sqrt(Math.pow(n-t,2)+Math.pow(a-e,2))}function Qs(t){var e,n;for(const a of t.states){const s=t.cities.filter(l=>l.stateId===a.id),r=t.launchSites.filter(l=>l.stateId===a.id),i=t.cities.filter(l=>a.strategies[l.stateId]===y.HOSTILE&&l.stateId!==a.id&&l.populationHistogram.slice(-1)[0].population>0),u=t.missiles.filter(l=>a.strategies[l.stateId]!==y.FRIENDLY&&l.stateId!==a.id),o=t.launchSites.filter(l=>a.strategies[l.stateId]===y.HOSTILE&&l.stateId!==a.id),c=u.filter(l=>s.some(d=>he(l.target,d.position))||r.some(d=>he(l.target,d.position))).filter(l=>(t.timestamp-l.launchTimestamp)/(l.targetTimestamp-l.launchTimestamp)>.5);for(const l of t.launchSites.filter(d=>d.stateId===a.id)){if(l.nextLaunchTarget)continue;if(i.length===0&&o.length===0&&u.length===0)break;const d=Ve(c.map(m=>({...m,interceptionPoint:er(m,l.position)})),l.position),h=t.missiles.filter(m=>m.stateId===a.id),g=Xe(d,h).filter(([,m])=>m<r.length);if(g.length>0)l.nextLaunchTarget=g[0][0].interceptionPoint??void 0;else{const m=Xe(Ve([...o,...i],l.position),h);l.nextLaunchTarget=((n=(e=m==null?void 0:m[0])==null?void 0:e[0])==null?void 0:n.position)??void 0}}}return t}function er(t,e){const n=D(t.position.x,t.position.y,e.x,e.y);if(n<_)return null;const a=D(t.target.x,t.target.y,t.launch.x,t.launch.y),s=(t.target.x-t.launch.x)/a,r=(t.target.y-t.launch.y)/a,i={x:t.target.x-s*_*2,y:t.target.y-r*_*2},u=n/me,o=D(e.x,e.y,i.x,i.y)/me;return u<o||u>o+10?null:i}function he(t,e){const n=_;return D(t.x,t.y,e.x,e.y)<=n}function Ve(t,e){return t.sort((n,a)=>D(n.position.x,n.position.y,e.x,e.y)-D(a.position.x,a.position.y,e.x,e.y))}function Xe(t,e){const n=new Map;for(const a of t)n.set(a,e.filter(s=>he(s.target,a.position)).length);return Array.from(n).sort((a,s)=>a[1]-s[1])}function tr(t){var e,n;for(const a of t.missiles.filter(s=>s.launchTimestamp===t.timestamp)){const s=t.states.find(i=>i.id===a.stateId),r=((e=t.cities.find(i=>D(i.position.x,i.position.y,a.target.x,a.target.y)<=_))==null?void 0:e.stateId)||((n=t.launchSites.find(i=>D(i.position.x,i.position.y,a.target.x,a.target.y)<=_))==null?void 0:n.stateId);if(s&&r&&s.id!==r){s.strategies[r]!==y.HOSTILE&&(s.strategies[r]=y.HOSTILE);const i=t.states.find(u=>u.id===r);i&&i.strategies[s.id]!==y.HOSTILE&&(i.strategies[s.id]=y.HOSTILE,t.states.forEach(u=>{u.id!==i.id&&u.strategies[i.id]===y.FRIENDLY&&i.strategies[u.id]===y.FRIENDLY&&(u.strategies[s.id]=y.HOSTILE,s.strategies[u.id]=y.HOSTILE)}))}}for(const a of t.states.filter(s=>!s.isPlayerControlled))nr(a,t);return t}function nr(t,e){const n=e.states.filter(i=>i.id!==t.id);t.strategies={...t.strategies},t.generalStrategy!==y.HOSTILE&&n.forEach(i=>{i.strategies[t.id]===y.FRIENDLY&&t.strategies[i.id]===y.NEUTRAL&&(t.strategies[i.id]=y.FRIENDLY)});const a=n.filter(i=>Object.values(i.strategies).every(u=>u!==y.HOSTILE)&&i.generalStrategy!==y.HOSTILE);if(a.length>0&&t.generalStrategy===y.FRIENDLY){const i=a[Math.floor(Math.random()*a.length)];t.strategies[i.id]=y.FRIENDLY}const s=n.filter(i=>t.strategies[i.id]===y.FRIENDLY&&i.strategies[t.id]===y.FRIENDLY);s.forEach(i=>{n.forEach(u=>{u.strategies[i.id]===y.HOSTILE&&t.strategies[u.id]!==y.HOSTILE&&(t.strategies[u.id]=y.HOSTILE)})}),n.filter(i=>i.strategies[t.id]!==y.FRIENDLY&&t.strategies[i.id]!==y.FRIENDLY).forEach(i=>{if(ar(i,t,s,e)){const u=e.launchSites.filter(o=>o.stateId===t.id&&!o.lastLaunchTimestamp);if(u.length>0){const o=u[Math.floor(Math.random()*u.length)],c=[...e.cities.filter(l=>l.stateId===i.id),...e.launchSites.filter(l=>l.stateId===i.id)];if(c.length>0){const l=c[Math.floor(Math.random()*c.length)];o.nextLaunchTarget=l.position}}}})}function ar(t,e,n,a){const s=a.launchSites.filter(u=>u.stateId===t.id),r=a.launchSites.filter(u=>u.stateId===e.id||n.some(o=>o.id===u.stateId));return s.length<r.length?!0:a.missiles.some(u=>a.cities.some(o=>o.stateId===t.id&&D(o.position.x,o.position.y,u.target.x,u.target.y)<=_)||a.launchSites.some(o=>o.stateId===t.id&&D(o.position.x,o.position.y,u.target.x,u.target.y)<=_))}function sr(t,e){for(;e>0;){const n=rr(t,e>z?z:e);e=e>z?e-z:0,t=n}return t}function rr(t,e){const n=t.timestamp+e;let a={timestamp:n,states:t.states,cities:t.cities,launchSites:t.launchSites,missiles:t.missiles,explosions:t.explosions,sectors:t.sectors};for(const s of a.missiles){const r=(n-s.launchTimestamp)/(s.targetTimestamp-s.launchTimestamp);s.position={x:s.launch.x+(s.target.x-s.launch.x)*r,y:s.launch.y+(s.target.y-s.launch.y)*r}}for(const s of t.missiles.filter(r=>r.targetTimestamp<=n)){const r={id:`explosion-${Math.random()}`,missileId:s.id,startTimestamp:s.targetTimestamp,endTimestamp:s.targetTimestamp+Hs,position:s.target,radius:_};a.explosions.push(r);for(const o of t.cities.filter(c=>D(c.position.x,c.position.y,r.position.x,r.position.y)<=r.radius)){const c=o.populationHistogram[o.populationHistogram.length-1].population,l=Math.max(Gs,c*Ys);o.populationHistogram.push({timestamp:r.startTimestamp,population:Math.max(0,c-l)})}const i=t.missiles.filter(o=>o.id!==r.missileId&&o.launchTimestamp<=r.startTimestamp&&o.targetTimestamp>=r.startTimestamp).filter(o=>D(o.position.x,o.position.y,r.position.x,r.position.y)<=r.radius);for(const o of i)o.targetTimestamp=r.startTimestamp;const u=t.launchSites.filter(o=>D(o.position.x,o.position.y,r.position.x,r.position.y)<=r.radius);for(const o of u)a.launchSites=t.launchSites.filter(c=>c.id!==o.id)}a.explosions=a.explosions.filter(s=>s.endTimestamp>=n),a.missiles=a.missiles.filter(s=>s.targetTimestamp>n);for(const s of t.launchSites){if(s.nextLaunchTarget){if(s.lastLaunchTimestamp&&n-s.lastLaunchTimestamp<de)continue}else continue;const r=D(s.position.x,s.position.y,s.nextLaunchTarget.x,s.nextLaunchTarget.y),i={id:Math.random()+"",stateId:s.stateId,launchSiteId:s.id,launch:s.position,launchTimestamp:n,position:s.position,target:s.nextLaunchTarget,targetTimestamp:n+r/me};a.missiles.push(i),s.lastLaunchTimestamp=n,s.nextLaunchTarget=void 0}return a=Qs(a),a=tr(a),a}function ir(t){const[e,n]=v.useState(()=>Js({playerStateName:t,numberOfStates:6})),a=v.useCallback((s,r)=>n(sr(s,r)),[]);return{worldState:e,updateWorldState:a,setWorldState:n}}const Kt={x:0,y:0,pointingObjects:[]},or=(t,e)=>e.type==="move"?{x:e.x,y:e.y,pointingObjects:t.pointingObjects}:e.type==="point"&&!t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:[...t.pointingObjects,e.object]}:e.type==="unpoint"&&t.pointingObjects.some(n=>n.id===e.object.id)?{x:t.x,y:t.y,pointingObjects:t.pointingObjects.filter(n=>n.id!==e.object.id)}:t,ur=v.createContext(Kt),Fe=v.createContext(()=>{});function lr({children:t}){const[e,n]=v.useReducer(or,Kt);return f.jsx(ur.Provider,{value:e,children:f.jsx(Fe.Provider,{value:n,children:t})})}function cr(){const t=v.useContext(Fe);return(e,n)=>t({type:"move",x:e,y:n})}function Ce(){const t=v.useContext(Fe);return[e=>t({type:"point",object:e}),e=>t({type:"unpoint",object:e})]}const Ae={},mr=(t,e)=>e.type==="clear"?Ae:e.type==="set"?{...t,selectedObject:e.object}:t,Zt=v.createContext(Ae),Jt=v.createContext(()=>{});function dr({children:t}){const[e,n]=v.useReducer(mr,Ae);return f.jsx(Zt.Provider,{value:e,children:f.jsx(Jt.Provider,{value:n,children:t})})}function fr(t){var a;const e=v.useContext(Jt);return[((a=v.useContext(Zt).selectedObject)==null?void 0:a.id)===t.id,()=>e({type:"set",object:t})]}function J(t,e){const n=new CustomEvent(t,{bubbles:!0,detail:e});document.dispatchEvent(n)}function De(t,e){v.useEffect(()=>{const n=a=>{e(a.detail)};return document.addEventListener(t,n,!1),()=>{document.removeEventListener(t,n,!1)}},[t,e])}const hr=N.memo(({sectors:t})=>{const e=v.useRef(null),[n,a]=Ce();return v.useEffect(()=>{const s=e.current,r=s==null?void 0:s.getContext("2d");if(!s||!r)return;const i=Math.min(...t.map(m=>m.rect.left)),u=Math.min(...t.map(m=>m.rect.top)),o=Math.max(...t.map(m=>m.rect.right)),c=Math.max(...t.map(m=>m.rect.bottom)),l=o-i,d=c-u;s.width=l,s.height=d,s.style.width=`${l}px`,s.style.height=`${d}px`;const h=Math.max(...t.filter(m=>m.type===T.WATER).map(m=>m.depth||0)),g=Math.max(...t.filter(m=>m.type===T.GROUND).map(m=>m.height||0));r.clearRect(0,0,l,d),t.forEach(m=>{const{fillStyle:p,drawSector:E}=pr(m,h,g);r.fillStyle=p,E(r,m.rect,i,u)})},[t]),v.useEffect(()=>{const s=e.current;let r;const i=u=>{const o=s==null?void 0:s.getBoundingClientRect(),c=u.clientX-((o==null?void 0:o.left)||0),l=u.clientY-((o==null?void 0:o.top)||0),d=t.find(h=>c>=h.rect.left&&c<=h.rect.right&&l>=h.rect.top&&l<=h.rect.bottom);d&&(r&&a(r),n(d),r=d)};return s==null||s.addEventListener("mousemove",i),()=>{s==null||s.removeEventListener("mousemove",i)}},[t,n,a]),f.jsx("canvas",{ref:e})});function pr(t,e,n){switch(t.type){case T.GROUND:return{fillStyle:We(t.height||0,n),drawSector:(a,s,r,i)=>{a.fillStyle=We(t.height||0,n),a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}};case T.WATER:return{fillStyle:"rgb(0, 34, 93)",drawSector:(a,s,r,i)=>{const u=(t.depth||0)/e,o=Math.round(0+34*(1-u)),c=Math.round(137+-103*u),l=Math.round(178+-85*u);a.fillStyle=`rgb(${o}, ${c}, ${l})`,a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}};default:return{fillStyle:"rgb(0, 34, 93)",drawSector:(a,s,r,i)=>{a.fillStyle="rgb(0, 34, 93)",a.fillRect(s.left-r,s.top-i,s.right-s.left,s.bottom-s.top)}}}}function We(t,e){const n=t/e;if(n<.2)return`rgb(255, ${Math.round(223+-36*(n/.2))}, 128)`;if(n<.5)return`rgb(34, ${Math.round(200-100*((n-.2)/.3))}, 34)`;if(n<.95){const a=Math.round(34+67*((n-.5)/.3)),s=Math.round(100+-33*((n-.5)/.3)),r=Math.round(34+-1*((n-.5)/.3));return`rgb(${a}, ${s}, ${r})`}else return`rgb(255, 255, ${Math.round(255-55*((n-.8)/.2))})`}const U=_*2;function gr({state:t,cities:e,launchSites:n}){const{boundingBox:a,pathData:s}=N.useMemo(()=>{const r=[...e.filter(c=>c.stateId===t.id).map(c=>c.position),...n.filter(c=>c.stateId===t.id).map(c=>c.position)].map(({x:c,y:l})=>[{x:c,y:l},{x:c+U,y:l},{x:c,y:l+U},{x:c-U,y:l},{x:c,y:l-U}]).flat(),i=br(r),u=xr(i),o=i.map((c,l)=>`${l===0?"M":"L"} ${c.x-u.minX} ${c.y-u.minY}`).join(" ")+"Z";return{boundingBox:u,pathData:o}},[t,e,n]);return f.jsx(vr,{width:a.maxX-a.minX,height:a.maxY-a.minY,style:{transform:`translate(${a.minX}px, ${a.minY}px)`},children:f.jsx(yr,{d:s,fill:"none",stroke:t.color,strokeWidth:"2"})})}const vr=b.svg`
  position: absolute;
  pointer-events: none;
`,yr=b.path``;function br(t){if(t.length<3)return t;const e=t.reduce((s,r)=>r.y<s.y?r:s,t[0]),n=t.sort((s,r)=>{const i=Math.atan2(s.y-e.y,s.x-e.x),u=Math.atan2(r.y-e.y,r.x-e.x);return i-u}),a=[n[0],n[1]];for(let s=2;s<n.length;s++){for(;a.length>1&&!Er(a[a.length-2],a[a.length-1],n[s]);)a.pop();a.push(n[s])}return a}function Er(t,e,n){return(e.x-t.x)*(n.y-t.y)-(e.y-t.y)*(n.x-t.x)>0}function xr(t){return t.reduce((n,a)=>({minX:Math.min(n.minX,a.x),minY:Math.min(n.minY,a.y),maxX:Math.max(n.maxX,a.x),maxY:Math.max(n.maxY,a.y)}),{minX:1/0,minY:1/0,maxX:-1/0,maxY:-1/0})}function Fr({city:t}){const[e,n]=Ce(),a=t.populationHistogram[t.populationHistogram.length-1].population,s=Math.max(...t.populationHistogram.map(i=>i.population)),r=Math.max(5,10*(a/s));return f.jsx(Cr,{onMouseEnter:()=>e(t),onMouseLeave:()=>n(t),style:{"--x":t.position.x,"--y":t.position.y,"--size":r,"--opacity":a>0?1:.3},children:f.jsxs(Ar,{children:[t.name,": ",a.toLocaleString()," population"]})})}const Cr=b.div`
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
`,Ar=b.div`
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
`;function Dr({launchSite:t,worldTimestamp:e,isPlayerControlled:n}){const[a,s]=fr(t),[r,i]=Ce(),u=t.lastLaunchTimestamp&&t.lastLaunchTimestamp+de>e,o=u?(e-t.lastLaunchTimestamp)/de:0;return f.jsx(kr,{onMouseEnter:()=>r(t),onMouseLeave:()=>i(t),onClick:()=>n&&s(),style:{"--x":t.position.x,"--y":t.position.y,"--cooldown-progress":o},"data-selected":a,"data-cooldown":u})}const kr=b.div`
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
`;function Qt(t,e){e===void 0&&(e=!0);var n=v.useRef(null),a=v.useRef(!1),s=v.useRef(t);s.current=t;var r=v.useCallback(function(u){a.current&&(s.current(u),n.current=requestAnimationFrame(r))},[]),i=v.useMemo(function(){return[function(){a.current&&(a.current=!1,n.current&&cancelAnimationFrame(n.current))},function(){a.current||(a.current=!0,n.current=requestAnimationFrame(r))},function(){return a.current}]},[]);return v.useEffect(function(){return e&&i[1](),i[0]},[]),i}function Sr(t,e,n){if(e.startTimestamp>n||e.endTimestamp<n)return;const a=Math.pow(Math.min(Math.max(0,(n-e.startTimestamp)/(e.endTimestamp-e.startTimestamp)),1),.15);t.fillStyle=`rgb(${255*a}, ${255*(1-a)}, 0)`,t.beginPath(),t.arc(e.position.x,e.position.y,e.radius*a,0,2*Math.PI),t.fill()}function Tr(t,e,n){e.launchTimestamp>n||e.targetTimestamp<n||(t.fillStyle="rgb(0, 255, 0)",t.beginPath(),t.arc(e.position.x,e.position.y,1,0,2*Math.PI),t.fill())}function _r(t,e,n){if(e.launchTimestamp>n||e.targetTimestamp<n)return;const a=Math.min(Math.max(n-5,e.launchTimestamp)-e.launchTimestamp,e.targetTimestamp-e.launchTimestamp),s=e.targetTimestamp-e.launchTimestamp,r=a/s,i=e.launch.x+(e.target.x-e.launch.x)*r,u=e.launch.y+(e.target.y-e.launch.y)*r,o={x:i,y:u},c=e.position,l=t.createLinearGradient(o.x,o.y,c.x,c.y);l.addColorStop(0,"rgba(255, 255, 255, 0)"),l.addColorStop(1,"rgba(255, 255, 255, 0.5)"),t.strokeStyle=l,t.lineWidth=1,t.beginPath(),t.moveTo(o.x,o.y),t.lineTo(c.x,c.y),t.stroke()}function Br({state:t}){const e=v.useRef(null);return v.useLayoutEffect(()=>{const a=e.current;if(!a)return;const s=Math.min(...t.sectors.map(l=>l.rect.left)),r=Math.min(...t.sectors.map(l=>l.rect.top)),i=Math.max(...t.sectors.map(l=>l.rect.right)),u=Math.max(...t.sectors.map(l=>l.rect.bottom)),o=i-s,c=u-r;a.width=o,a.height=c,a.style.width=`${o}px`,a.style.height=`${c}px`},[t.sectors]),Qt(()=>{const a=e.current;if(!a)return;const s=a.getContext("2d");s&&(s.clearRect(0,0,a.width,a.height),t.missiles.forEach(r=>{_r(s,r,t.timestamp)}),t.missiles.filter(r=>r.launchTimestamp<t.timestamp&&r.targetTimestamp>t.timestamp).forEach(r=>{Tr(s,r,t.timestamp)}),t.explosions.filter(r=>r.startTimestamp<t.timestamp&&r.endTimestamp>t.timestamp).forEach(r=>{Sr(s,r,t.timestamp)}))}),f.jsx(Ir,{ref:e})}const Ir=b.canvas`
  position: absolute;
  top: 0;
  pointer-events: none;
`;function wr({state:t}){const e=cr();return f.jsxs(Mr,{onMouseMove:n=>e(n.clientX,n.clientY),onClick:()=>J("world-click"),children:[f.jsx(hr,{sectors:t.sectors}),t.states.map(n=>f.jsx(gr,{state:n,cities:t.cities,launchSites:t.launchSites},n.id)),t.cities.map(n=>f.jsx(Fr,{city:n},n.id)),t.launchSites.map(n=>{var a;return f.jsx(Dr,{launchSite:n,worldTimestamp:t.timestamp,isPlayerControlled:n.stateId===((a=t.states.find(s=>s.isPlayerControlled))==null?void 0:a.id)},n.id)}),f.jsx(Br,{state:t})]})}const Mr=b.div`
  position: absolute;

  background: black;

  > canvas {
    position: absolute;
  }
`;function jr(t,e){let n=t[0];for(const a of t)a.timestamp<e&&a.timestamp>n.timestamp&&(n=a);return n}function Or(t,e,n){return Math.max(e,Math.min(t,n))}const x={toVector(t,e){return t===void 0&&(t=e),Array.isArray(t)?t:[t,t]},add(t,e){return[t[0]+e[0],t[1]+e[1]]},sub(t,e){return[t[0]-e[0],t[1]-e[1]]},addTo(t,e){t[0]+=e[0],t[1]+=e[1]},subTo(t,e){t[0]-=e[0],t[1]-=e[1]}};function qe(t,e,n){return e===0||Math.abs(e)===1/0?Math.pow(t,n*5):t*e*n/(e+n*t)}function Ke(t,e,n,a=.15){return a===0?Or(t,e,n):t<e?-qe(e-t,n-e,a)+e:t>n?+qe(t-n,n-e,a)+n:t}function Lr(t,[e,n],[a,s]){const[[r,i],[u,o]]=t;return[Ke(e,r,i,a),Ke(n,u,o,s)]}function Pr(t,e){if(typeof t!="object"||t===null)return t;var n=t[Symbol.toPrimitive];if(n!==void 0){var a=n.call(t,e||"default");if(typeof a!="object")return a;throw new TypeError("@@toPrimitive must return a primitive value.")}return(e==="string"?String:Number)(t)}function Rr(t){var e=Pr(t,"string");return typeof e=="symbol"?e:String(e)}function C(t,e,n){return e=Rr(e),e in t?Object.defineProperty(t,e,{value:n,enumerable:!0,configurable:!0,writable:!0}):t[e]=n,t}function Ze(t,e){var n=Object.keys(t);if(Object.getOwnPropertySymbols){var a=Object.getOwnPropertySymbols(t);e&&(a=a.filter(function(s){return Object.getOwnPropertyDescriptor(t,s).enumerable})),n.push.apply(n,a)}return n}function F(t){for(var e=1;e<arguments.length;e++){var n=arguments[e]!=null?arguments[e]:{};e%2?Ze(Object(n),!0).forEach(function(a){C(t,a,n[a])}):Object.getOwnPropertyDescriptors?Object.defineProperties(t,Object.getOwnPropertyDescriptors(n)):Ze(Object(n)).forEach(function(a){Object.defineProperty(t,a,Object.getOwnPropertyDescriptor(n,a))})}return t}const en={pointer:{start:"down",change:"move",end:"up"},mouse:{start:"down",change:"move",end:"up"},touch:{start:"start",change:"move",end:"end"},gesture:{start:"start",change:"change",end:"end"}};function Je(t){return t?t[0].toUpperCase()+t.slice(1):""}const $r=["enter","leave"];function Nr(t=!1,e){return t&&!$r.includes(e)}function Hr(t,e="",n=!1){const a=en[t],s=a&&a[e]||e;return"on"+Je(t)+Je(s)+(Nr(n,s)?"Capture":"")}const Yr=["gotpointercapture","lostpointercapture"];function Gr(t){let e=t.substring(2).toLowerCase();const n=!!~e.indexOf("passive");n&&(e=e.replace("passive",""));const a=Yr.includes(e)?"capturecapture":"capture",s=!!~e.indexOf(a);return s&&(e=e.replace("capture","")),{device:e,capture:s,passive:n}}function zr(t,e=""){const n=en[t],a=n&&n[e]||e;return t+a}function Q(t){return"touches"in t}function tn(t){return Q(t)?"touch":"pointerType"in t?t.pointerType:"mouse"}function Ur(t){return Array.from(t.touches).filter(e=>{var n,a;return e.target===t.currentTarget||((n=t.currentTarget)===null||n===void 0||(a=n.contains)===null||a===void 0?void 0:a.call(n,e.target))})}function Vr(t){return t.type==="touchend"||t.type==="touchcancel"?t.changedTouches:t.targetTouches}function nn(t){return Q(t)?Vr(t)[0]:t}function pe(t,e){try{const n=e.clientX-t.clientX,a=e.clientY-t.clientY,s=(e.clientX+t.clientX)/2,r=(e.clientY+t.clientY)/2,i=Math.hypot(n,a);return{angle:-(Math.atan2(n,a)*180)/Math.PI,distance:i,origin:[s,r]}}catch{}return null}function Xr(t){return Ur(t).map(e=>e.identifier)}function Qe(t,e){const[n,a]=Array.from(t.touches).filter(s=>e.includes(s.identifier));return pe(n,a)}function se(t){const e=nn(t);return Q(t)?e.identifier:e.pointerId}function $(t){const e=nn(t);return[e.clientX,e.clientY]}const et=40,tt=800;function an(t){let{deltaX:e,deltaY:n,deltaMode:a}=t;return a===1?(e*=et,n*=et):a===2&&(e*=tt,n*=tt),[e,n]}function Wr(t){var e,n;const{scrollX:a,scrollY:s,scrollLeft:r,scrollTop:i}=t.currentTarget;return[(e=a??r)!==null&&e!==void 0?e:0,(n=s??i)!==null&&n!==void 0?n:0]}function qr(t){const e={};if("buttons"in t&&(e.buttons=t.buttons),"shiftKey"in t){const{shiftKey:n,altKey:a,metaKey:s,ctrlKey:r}=t;Object.assign(e,{shiftKey:n,altKey:a,metaKey:s,ctrlKey:r})}return e}function q(t,...e){return typeof t=="function"?t(...e):t}function Kr(){}function Zr(...t){return t.length===0?Kr:t.length===1?t[0]:function(){let e;for(const n of t)e=n.apply(this,arguments)||e;return e}}function nt(t,e){return Object.assign({},e,t||{})}const Jr=32;class sn{constructor(e,n,a){this.ctrl=e,this.args=n,this.key=a,this.state||(this.state={},this.computeValues([0,0]),this.computeInitial(),this.init&&this.init(),this.reset())}get state(){return this.ctrl.state[this.key]}set state(e){this.ctrl.state[this.key]=e}get shared(){return this.ctrl.state.shared}get eventStore(){return this.ctrl.gestureEventStores[this.key]}get timeoutStore(){return this.ctrl.gestureTimeoutStores[this.key]}get config(){return this.ctrl.config[this.key]}get sharedConfig(){return this.ctrl.config.shared}get handler(){return this.ctrl.handlers[this.key]}reset(){const{state:e,shared:n,ingKey:a,args:s}=this;n[a]=e._active=e.active=e._blocked=e._force=!1,e._step=[!1,!1],e.intentional=!1,e._movement=[0,0],e._distance=[0,0],e._direction=[0,0],e._delta=[0,0],e._bounds=[[-1/0,1/0],[-1/0,1/0]],e.args=s,e.axis=void 0,e.memo=void 0,e.elapsedTime=e.timeDelta=0,e.direction=[0,0],e.distance=[0,0],e.overflow=[0,0],e._movementBound=[!1,!1],e.velocity=[0,0],e.movement=[0,0],e.delta=[0,0],e.timeStamp=0}start(e){const n=this.state,a=this.config;n._active||(this.reset(),this.computeInitial(),n._active=!0,n.target=e.target,n.currentTarget=e.currentTarget,n.lastOffset=a.from?q(a.from,n):n.offset,n.offset=n.lastOffset,n.startTime=n.timeStamp=e.timeStamp)}computeValues(e){const n=this.state;n._values=e,n.values=this.config.transform(e)}computeInitial(){const e=this.state;e._initial=e._values,e.initial=e.values}compute(e){const{state:n,config:a,shared:s}=this;n.args=this.args;let r=0;if(e&&(n.event=e,a.preventDefault&&e.cancelable&&n.event.preventDefault(),n.type=e.type,s.touches=this.ctrl.pointerIds.size||this.ctrl.touchIds.size,s.locked=!!document.pointerLockElement,Object.assign(s,qr(e)),s.down=s.pressed=s.buttons%2===1||s.touches>0,r=e.timeStamp-n.timeStamp,n.timeStamp=e.timeStamp,n.elapsedTime=n.timeStamp-n.startTime),n._active){const j=n._delta.map(Math.abs);x.addTo(n._distance,j)}this.axisIntent&&this.axisIntent(e);const[i,u]=n._movement,[o,c]=a.threshold,{_step:l,values:d}=n;if(a.hasCustomTransform?(l[0]===!1&&(l[0]=Math.abs(i)>=o&&d[0]),l[1]===!1&&(l[1]=Math.abs(u)>=c&&d[1])):(l[0]===!1&&(l[0]=Math.abs(i)>=o&&Math.sign(i)*o),l[1]===!1&&(l[1]=Math.abs(u)>=c&&Math.sign(u)*c)),n.intentional=l[0]!==!1||l[1]!==!1,!n.intentional)return;const h=[0,0];if(a.hasCustomTransform){const[j,vn]=d;h[0]=l[0]!==!1?j-l[0]:0,h[1]=l[1]!==!1?vn-l[1]:0}else h[0]=l[0]!==!1?i-l[0]:0,h[1]=l[1]!==!1?u-l[1]:0;this.restrictToAxis&&!n._blocked&&this.restrictToAxis(h);const g=n.offset,m=n._active&&!n._blocked||n.active;m&&(n.first=n._active&&!n.active,n.last=!n._active&&n.active,n.active=s[this.ingKey]=n._active,e&&(n.first&&("bounds"in a&&(n._bounds=q(a.bounds,n)),this.setup&&this.setup()),n.movement=h,this.computeOffset()));const[p,E]=n.offset,[[A,B],[M,w]]=n._bounds;n.overflow=[p<A?-1:p>B?1:0,E<M?-1:E>w?1:0],n._movementBound[0]=n.overflow[0]?n._movementBound[0]===!1?n._movement[0]:n._movementBound[0]:!1,n._movementBound[1]=n.overflow[1]?n._movementBound[1]===!1?n._movement[1]:n._movementBound[1]:!1;const gn=n._active?a.rubberband||[0,0]:[0,0];if(n.offset=Lr(n._bounds,n.offset,gn),n.delta=x.sub(n.offset,g),this.computeMovement(),m&&(!n.last||r>Jr)){n.delta=x.sub(n.offset,g);const j=n.delta.map(Math.abs);x.addTo(n.distance,j),n.direction=n.delta.map(Math.sign),n._direction=n._delta.map(Math.sign),!n.first&&r>0&&(n.velocity=[j[0]/r,j[1]/r],n.timeDelta=r)}}emit(){const e=this.state,n=this.shared,a=this.config;if(e._active||this.clean(),(e._blocked||!e.intentional)&&!e._force&&!a.triggerAllEvents)return;const s=this.handler(F(F(F({},n),e),{},{[this.aliasKey]:e.values}));s!==void 0&&(e.memo=s)}clean(){this.eventStore.clean(),this.timeoutStore.clean()}}function Qr([t,e],n){const a=Math.abs(t),s=Math.abs(e);if(a>s&&a>n)return"x";if(s>a&&s>n)return"y"}class Y extends sn{constructor(...e){super(...e),C(this,"aliasKey","xy")}reset(){super.reset(),this.state.axis=void 0}init(){this.state.offset=[0,0],this.state.lastOffset=[0,0]}computeOffset(){this.state.offset=x.add(this.state.lastOffset,this.state.movement)}computeMovement(){this.state.movement=x.sub(this.state.offset,this.state.lastOffset)}axisIntent(e){const n=this.state,a=this.config;if(!n.axis&&e){const s=typeof a.axisThreshold=="object"?a.axisThreshold[tn(e)]:a.axisThreshold;n.axis=Qr(n._movement,s)}n._blocked=(a.lockDirection||!!a.axis)&&!n.axis||!!a.axis&&a.axis!==n.axis}restrictToAxis(e){if(this.config.axis||this.config.lockDirection)switch(this.state.axis){case"x":e[1]=0;break;case"y":e[0]=0;break}}}const ei=t=>t,at=.15,rn={enabled(t=!0){return t},eventOptions(t,e,n){return F(F({},n.shared.eventOptions),t)},preventDefault(t=!1){return t},triggerAllEvents(t=!1){return t},rubberband(t=0){switch(t){case!0:return[at,at];case!1:return[0,0];default:return x.toVector(t)}},from(t){if(typeof t=="function")return t;if(t!=null)return x.toVector(t)},transform(t,e,n){const a=t||n.shared.transform;return this.hasCustomTransform=!!a,a||ei},threshold(t){return x.toVector(t,0)}},ti=0,O=F(F({},rn),{},{axis(t,e,{axis:n}){if(this.lockDirection=n==="lock",!this.lockDirection)return n},axisThreshold(t=ti){return t},bounds(t={}){if(typeof t=="function")return r=>O.bounds(t(r));if("current"in t)return()=>t.current;if(typeof HTMLElement=="function"&&t instanceof HTMLElement)return t;const{left:e=-1/0,right:n=1/0,top:a=-1/0,bottom:s=1/0}=t;return[[e,n],[a,s]]}}),st={ArrowRight:(t,e=1)=>[t*e,0],ArrowLeft:(t,e=1)=>[-1*t*e,0],ArrowUp:(t,e=1)=>[0,-1*t*e],ArrowDown:(t,e=1)=>[0,t*e]};class ni extends Y{constructor(...e){super(...e),C(this,"ingKey","dragging")}reset(){super.reset();const e=this.state;e._pointerId=void 0,e._pointerActive=!1,e._keyboardActive=!1,e._preventScroll=!1,e._delayed=!1,e.swipe=[0,0],e.tap=!1,e.canceled=!1,e.cancel=this.cancel.bind(this)}setup(){const e=this.state;if(e._bounds instanceof HTMLElement){const n=e._bounds.getBoundingClientRect(),a=e.currentTarget.getBoundingClientRect(),s={left:n.left-a.left+e.offset[0],right:n.right-a.right+e.offset[0],top:n.top-a.top+e.offset[1],bottom:n.bottom-a.bottom+e.offset[1]};e._bounds=O.bounds(s)}}cancel(){const e=this.state;e.canceled||(e.canceled=!0,e._active=!1,setTimeout(()=>{this.compute(),this.emit()},0))}setActive(){this.state._active=this.state._pointerActive||this.state._keyboardActive}clean(){this.pointerClean(),this.state._pointerActive=!1,this.state._keyboardActive=!1,super.clean()}pointerDown(e){const n=this.config,a=this.state;if(e.buttons!=null&&(Array.isArray(n.pointerButtons)?!n.pointerButtons.includes(e.buttons):n.pointerButtons!==-1&&n.pointerButtons!==e.buttons))return;const s=this.ctrl.setEventIds(e);n.pointerCapture&&e.target.setPointerCapture(e.pointerId),!(s&&s.size>1&&a._pointerActive)&&(this.start(e),this.setupPointer(e),a._pointerId=se(e),a._pointerActive=!0,this.computeValues($(e)),this.computeInitial(),n.preventScrollAxis&&tn(e)!=="mouse"?(a._active=!1,this.setupScrollPrevention(e)):n.delay>0?(this.setupDelayTrigger(e),n.triggerAllEvents&&(this.compute(e),this.emit())):this.startPointerDrag(e))}startPointerDrag(e){const n=this.state;n._active=!0,n._preventScroll=!0,n._delayed=!1,this.compute(e),this.emit()}pointerMove(e){const n=this.state,a=this.config;if(!n._pointerActive)return;const s=se(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;const r=$(e);if(document.pointerLockElement===e.target?n._delta=[e.movementX,e.movementY]:(n._delta=x.sub(r,n._values),this.computeValues(r)),x.addTo(n._movement,n._delta),this.compute(e),n._delayed&&n.intentional){this.timeoutStore.remove("dragDelay"),n.active=!1,this.startPointerDrag(e);return}if(a.preventScrollAxis&&!n._preventScroll)if(n.axis)if(n.axis===a.preventScrollAxis||a.preventScrollAxis==="xy"){n._active=!1,this.clean();return}else{this.timeoutStore.remove("startPointerDrag"),this.startPointerDrag(e);return}else return;this.emit()}pointerUp(e){this.ctrl.setEventIds(e);try{this.config.pointerCapture&&e.target.hasPointerCapture(e.pointerId)&&e.target.releasePointerCapture(e.pointerId)}catch{}const n=this.state,a=this.config;if(!n._active||!n._pointerActive)return;const s=se(e);if(n._pointerId!==void 0&&s!==n._pointerId)return;this.state._pointerActive=!1,this.setActive(),this.compute(e);const[r,i]=n._distance;if(n.tap=r<=a.tapsThreshold&&i<=a.tapsThreshold,n.tap&&a.filterTaps)n._force=!0;else{const[u,o]=n._delta,[c,l]=n._movement,[d,h]=a.swipe.velocity,[g,m]=a.swipe.distance,p=a.swipe.duration;if(n.elapsedTime<p){const E=Math.abs(u/n.timeDelta),A=Math.abs(o/n.timeDelta);E>d&&Math.abs(c)>g&&(n.swipe[0]=Math.sign(u)),A>h&&Math.abs(l)>m&&(n.swipe[1]=Math.sign(o))}}this.emit()}pointerClick(e){!this.state.tap&&e.detail>0&&(e.preventDefault(),e.stopPropagation())}setupPointer(e){const n=this.config,a=n.device;n.pointerLock&&e.currentTarget.requestPointerLock(),n.pointerCapture||(this.eventStore.add(this.sharedConfig.window,a,"change",this.pointerMove.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"end",this.pointerUp.bind(this)),this.eventStore.add(this.sharedConfig.window,a,"cancel",this.pointerUp.bind(this)))}pointerClean(){this.config.pointerLock&&document.pointerLockElement===this.state.currentTarget&&document.exitPointerLock()}preventScroll(e){this.state._preventScroll&&e.cancelable&&e.preventDefault()}setupScrollPrevention(e){this.state._preventScroll=!1,ai(e);const n=this.eventStore.add(this.sharedConfig.window,"touch","change",this.preventScroll.bind(this),{passive:!1});this.eventStore.add(this.sharedConfig.window,"touch","end",n),this.eventStore.add(this.sharedConfig.window,"touch","cancel",n),this.timeoutStore.add("startPointerDrag",this.startPointerDrag.bind(this),this.config.preventScrollDelay,e)}setupDelayTrigger(e){this.state._delayed=!0,this.timeoutStore.add("dragDelay",()=>{this.state._step=[0,0],this.startPointerDrag(e)},this.config.delay)}keyDown(e){const n=st[e.key];if(n){const a=this.state,s=e.shiftKey?10:e.altKey?.1:1;this.start(e),a._delta=n(this.config.keyboardDisplacement,s),a._keyboardActive=!0,x.addTo(a._movement,a._delta),this.compute(e),this.emit()}}keyUp(e){e.key in st&&(this.state._keyboardActive=!1,this.setActive(),this.compute(e),this.emit())}bind(e){const n=this.config.device;e(n,"start",this.pointerDown.bind(this)),this.config.pointerCapture&&(e(n,"change",this.pointerMove.bind(this)),e(n,"end",this.pointerUp.bind(this)),e(n,"cancel",this.pointerUp.bind(this)),e("lostPointerCapture","",this.pointerUp.bind(this))),this.config.keys&&(e("key","down",this.keyDown.bind(this)),e("key","up",this.keyUp.bind(this))),this.config.filterTaps&&e("click","",this.pointerClick.bind(this),{capture:!0,passive:!1})}}function ai(t){"persist"in t&&typeof t.persist=="function"&&t.persist()}const G=typeof window<"u"&&window.document&&window.document.createElement;function on(){return G&&"ontouchstart"in window}function si(){return on()||G&&window.navigator.maxTouchPoints>1}function ri(){return G&&"onpointerdown"in window}function ii(){return G&&"exitPointerLock"in window.document}function oi(){try{return"constructor"in GestureEvent}catch{return!1}}const k={isBrowser:G,gesture:oi(),touch:on(),touchscreen:si(),pointer:ri(),pointerLock:ii()},ui=250,li=180,ci=.5,mi=50,di=250,fi=10,rt={mouse:0,touch:0,pen:8},hi=F(F({},O),{},{device(t,e,{pointer:{touch:n=!1,lock:a=!1,mouse:s=!1}={}}){return this.pointerLock=a&&k.pointerLock,k.touch&&n?"touch":this.pointerLock?"mouse":k.pointer&&!s?"pointer":k.touch?"touch":"mouse"},preventScrollAxis(t,e,{preventScroll:n}){if(this.preventScrollDelay=typeof n=="number"?n:n||n===void 0&&t?ui:void 0,!(!k.touchscreen||n===!1))return t||(n!==void 0?"y":void 0)},pointerCapture(t,e,{pointer:{capture:n=!0,buttons:a=1,keys:s=!0}={}}){return this.pointerButtons=a,this.keys=s,!this.pointerLock&&this.device==="pointer"&&n},threshold(t,e,{filterTaps:n=!1,tapsThreshold:a=3,axis:s=void 0}){const r=x.toVector(t,n?a:s?1:0);return this.filterTaps=n,this.tapsThreshold=a,r},swipe({velocity:t=ci,distance:e=mi,duration:n=di}={}){return{velocity:this.transform(x.toVector(t)),distance:this.transform(x.toVector(e)),duration:n}},delay(t=0){switch(t){case!0:return li;case!1:return 0;default:return t}},axisThreshold(t){return t?F(F({},rt),t):rt},keyboardDisplacement(t=fi){return t}});function un(t){const[e,n]=t.overflow,[a,s]=t._delta,[r,i]=t._direction;(e<0&&a>0&&r<0||e>0&&a<0&&r>0)&&(t._movement[0]=t._movementBound[0]),(n<0&&s>0&&i<0||n>0&&s<0&&i>0)&&(t._movement[1]=t._movementBound[1])}const pi=30,gi=100;class vi extends sn{constructor(...e){super(...e),C(this,"ingKey","pinching"),C(this,"aliasKey","da")}init(){this.state.offset=[1,0],this.state.lastOffset=[1,0],this.state._pointerEvents=new Map}reset(){super.reset();const e=this.state;e._touchIds=[],e.canceled=!1,e.cancel=this.cancel.bind(this),e.turns=0}computeOffset(){const{type:e,movement:n,lastOffset:a}=this.state;e==="wheel"?this.state.offset=x.add(n,a):this.state.offset=[(1+n[0])*a[0],n[1]+a[1]]}computeMovement(){const{offset:e,lastOffset:n}=this.state;this.state.movement=[e[0]/n[0],e[1]-n[1]]}axisIntent(){const e=this.state,[n,a]=e._movement;if(!e.axis){const s=Math.abs(n)*pi-Math.abs(a);s<0?e.axis="angle":s>0&&(e.axis="scale")}}restrictToAxis(e){this.config.lockDirection&&(this.state.axis==="scale"?e[1]=0:this.state.axis==="angle"&&(e[0]=0))}cancel(){const e=this.state;e.canceled||setTimeout(()=>{e.canceled=!0,e._active=!1,this.compute(),this.emit()},0)}touchStart(e){this.ctrl.setEventIds(e);const n=this.state,a=this.ctrl.touchIds;if(n._active&&n._touchIds.every(r=>a.has(r))||a.size<2)return;this.start(e),n._touchIds=Array.from(a).slice(0,2);const s=Qe(e,n._touchIds);s&&this.pinchStart(e,s)}pointerStart(e){if(e.buttons!=null&&e.buttons%2!==1)return;this.ctrl.setEventIds(e),e.target.setPointerCapture(e.pointerId);const n=this.state,a=n._pointerEvents,s=this.ctrl.pointerIds;if(n._active&&Array.from(a.keys()).every(i=>s.has(i))||(a.size<2&&a.set(e.pointerId,e),n._pointerEvents.size<2))return;this.start(e);const r=pe(...Array.from(a.values()));r&&this.pinchStart(e,r)}pinchStart(e,n){const a=this.state;a.origin=n.origin,this.computeValues([n.distance,n.angle]),this.computeInitial(),this.compute(e),this.emit()}touchMove(e){if(!this.state._active)return;const n=Qe(e,this.state._touchIds);n&&this.pinchMove(e,n)}pointerMove(e){const n=this.state._pointerEvents;if(n.has(e.pointerId)&&n.set(e.pointerId,e),!this.state._active)return;const a=pe(...Array.from(n.values()));a&&this.pinchMove(e,a)}pinchMove(e,n){const a=this.state,s=a._values[1],r=n.angle-s;let i=0;Math.abs(r)>270&&(i+=Math.sign(r)),this.computeValues([n.distance,n.angle-360*i]),a.origin=n.origin,a.turns=i,a._movement=[a._values[0]/a._initial[0]-1,a._values[1]-a._initial[1]],this.compute(e),this.emit()}touchEnd(e){this.ctrl.setEventIds(e),this.state._active&&this.state._touchIds.some(n=>!this.ctrl.touchIds.has(n))&&(this.state._active=!1,this.compute(e),this.emit())}pointerEnd(e){const n=this.state;this.ctrl.setEventIds(e);try{e.target.releasePointerCapture(e.pointerId)}catch{}n._pointerEvents.has(e.pointerId)&&n._pointerEvents.delete(e.pointerId),n._active&&n._pointerEvents.size<2&&(n._active=!1,this.compute(e),this.emit())}gestureStart(e){e.cancelable&&e.preventDefault();const n=this.state;n._active||(this.start(e),this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY],this.compute(e),this.emit())}gestureMove(e){if(e.cancelable&&e.preventDefault(),!this.state._active)return;const n=this.state;this.computeValues([e.scale,e.rotation]),n.origin=[e.clientX,e.clientY];const a=n._movement;n._movement=[e.scale-1,e.rotation],n._delta=x.sub(n._movement,a),this.compute(e),this.emit()}gestureEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}wheel(e){const n=this.config.modifierKey;n&&(Array.isArray(n)?!n.find(a=>e[a]):!e[n])||(this.state._active?this.wheelChange(e):this.wheelStart(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this)))}wheelStart(e){this.start(e),this.wheelChange(e)}wheelChange(e){"uv"in e||e.cancelable&&e.preventDefault();const a=this.state;a._delta=[-an(e)[1]/gi*a.offset[0],0],x.addTo(a._movement,a._delta),un(a),this.state.origin=[e.clientX,e.clientY],this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){const n=this.config.device;n&&(e(n,"start",this[n+"Start"].bind(this)),e(n,"change",this[n+"Move"].bind(this)),e(n,"end",this[n+"End"].bind(this)),e(n,"cancel",this[n+"End"].bind(this)),e("lostPointerCapture","",this[n+"End"].bind(this))),this.config.pinchOnWheel&&e("wheel","",this.wheel.bind(this),{passive:!1})}}const yi=F(F({},rn),{},{device(t,e,{shared:n,pointer:{touch:a=!1}={}}){if(n.target&&!k.touch&&k.gesture)return"gesture";if(k.touch&&a)return"touch";if(k.touchscreen){if(k.pointer)return"pointer";if(k.touch)return"touch"}},bounds(t,e,{scaleBounds:n={},angleBounds:a={}}){const s=i=>{const u=nt(q(n,i),{min:-1/0,max:1/0});return[u.min,u.max]},r=i=>{const u=nt(q(a,i),{min:-1/0,max:1/0});return[u.min,u.max]};return typeof n!="function"&&typeof a!="function"?[s(),r()]:i=>[s(i),r(i)]},threshold(t,e,n){return this.lockDirection=n.axis==="lock",x.toVector(t,this.lockDirection?[.1,3]:0)},modifierKey(t){return t===void 0?"ctrlKey":t},pinchOnWheel(t=!0){return t}});class bi extends Y{constructor(...e){super(...e),C(this,"ingKey","moving")}move(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.state._active?this.moveChange(e):this.moveStart(e),this.timeoutStore.add("moveEnd",this.moveEnd.bind(this)))}moveStart(e){this.start(e),this.computeValues($(e)),this.compute(e),this.computeInitial(),this.emit()}moveChange(e){if(!this.state._active)return;const n=$(e),a=this.state;a._delta=x.sub(n,a._values),x.addTo(a._movement,a._delta),this.computeValues(n),this.compute(e),this.emit()}moveEnd(e){this.state._active&&(this.state._active=!1,this.compute(e),this.emit())}bind(e){e("pointer","change",this.move.bind(this)),e("pointer","leave",this.moveEnd.bind(this))}}const Ei=F(F({},O),{},{mouseOnly:(t=!0)=>t});class xi extends Y{constructor(...e){super(...e),C(this,"ingKey","scrolling")}scroll(e){this.state._active||this.start(e),this.scrollChange(e),this.timeoutStore.add("scrollEnd",this.scrollEnd.bind(this))}scrollChange(e){e.cancelable&&e.preventDefault();const n=this.state,a=Wr(e);n._delta=x.sub(a,n._values),x.addTo(n._movement,n._delta),this.computeValues(a),this.compute(e),this.emit()}scrollEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("scroll","",this.scroll.bind(this))}}const Fi=O;class Ci extends Y{constructor(...e){super(...e),C(this,"ingKey","wheeling")}wheel(e){this.state._active||this.start(e),this.wheelChange(e),this.timeoutStore.add("wheelEnd",this.wheelEnd.bind(this))}wheelChange(e){const n=this.state;n._delta=an(e),x.addTo(n._movement,n._delta),un(n),this.compute(e),this.emit()}wheelEnd(){this.state._active&&(this.state._active=!1,this.compute(),this.emit())}bind(e){e("wheel","",this.wheel.bind(this))}}const Ai=O;class Di extends Y{constructor(...e){super(...e),C(this,"ingKey","hovering")}enter(e){this.config.mouseOnly&&e.pointerType!=="mouse"||(this.start(e),this.computeValues($(e)),this.compute(e),this.emit())}leave(e){if(this.config.mouseOnly&&e.pointerType!=="mouse")return;const n=this.state;if(!n._active)return;n._active=!1;const a=$(e);n._movement=n._delta=x.sub(a,n._values),this.computeValues(a),this.compute(e),n.delta=n.movement,this.emit()}bind(e){e("pointer","enter",this.enter.bind(this)),e("pointer","leave",this.leave.bind(this))}}const ki=F(F({},O),{},{mouseOnly:(t=!0)=>t}),ke=new Map,ge=new Map;function Si(t){ke.set(t.key,t.engine),ge.set(t.key,t.resolver)}const Ti={key:"drag",engine:ni,resolver:hi},_i={key:"hover",engine:Di,resolver:ki},Bi={key:"move",engine:bi,resolver:Ei},Ii={key:"pinch",engine:vi,resolver:yi},wi={key:"scroll",engine:xi,resolver:Fi},Mi={key:"wheel",engine:Ci,resolver:Ai};function ji(t,e){if(t==null)return{};var n={},a=Object.keys(t),s,r;for(r=0;r<a.length;r++)s=a[r],!(e.indexOf(s)>=0)&&(n[s]=t[s]);return n}function Oi(t,e){if(t==null)return{};var n=ji(t,e),a,s;if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(t);for(s=0;s<r.length;s++)a=r[s],!(e.indexOf(a)>=0)&&Object.prototype.propertyIsEnumerable.call(t,a)&&(n[a]=t[a])}return n}const Li={target(t){if(t)return()=>"current"in t?t.current:t},enabled(t=!0){return t},window(t=k.isBrowser?window:void 0){return t},eventOptions({passive:t=!0,capture:e=!1}={}){return{passive:t,capture:e}},transform(t){return t}},Pi=["target","eventOptions","window","enabled","transform"];function W(t={},e){const n={};for(const[a,s]of Object.entries(e))switch(typeof s){case"function":n[a]=s.call(n,t[a],a,t);break;case"object":n[a]=W(t[a],s);break;case"boolean":s&&(n[a]=t[a]);break}return n}function Ri(t,e,n={}){const a=t,{target:s,eventOptions:r,window:i,enabled:u,transform:o}=a,c=Oi(a,Pi);if(n.shared=W({target:s,eventOptions:r,window:i,enabled:u,transform:o},Li),e){const l=ge.get(e);n[e]=W(F({shared:n.shared},c),l)}else for(const l in c){const d=ge.get(l);d&&(n[l]=W(F({shared:n.shared},c[l]),d))}return n}class ln{constructor(e,n){C(this,"_listeners",new Set),this._ctrl=e,this._gestureKey=n}add(e,n,a,s,r){const i=this._listeners,u=zr(n,a),o=this._gestureKey?this._ctrl.config[this._gestureKey].eventOptions:{},c=F(F({},o),r);e.addEventListener(u,s,c);const l=()=>{e.removeEventListener(u,s,c),i.delete(l)};return i.add(l),l}clean(){this._listeners.forEach(e=>e()),this._listeners.clear()}}class $i{constructor(){C(this,"_timeouts",new Map)}add(e,n,a=140,...s){this.remove(e),this._timeouts.set(e,window.setTimeout(n,a,...s))}remove(e){const n=this._timeouts.get(e);n&&window.clearTimeout(n)}clean(){this._timeouts.forEach(e=>void window.clearTimeout(e)),this._timeouts.clear()}}class Ni{constructor(e){C(this,"gestures",new Set),C(this,"_targetEventStore",new ln(this)),C(this,"gestureEventStores",{}),C(this,"gestureTimeoutStores",{}),C(this,"handlers",{}),C(this,"config",{}),C(this,"pointerIds",new Set),C(this,"touchIds",new Set),C(this,"state",{shared:{shiftKey:!1,metaKey:!1,ctrlKey:!1,altKey:!1}}),Hi(this,e)}setEventIds(e){if(Q(e))return this.touchIds=new Set(Xr(e)),this.touchIds;if("pointerId"in e)return e.type==="pointerup"||e.type==="pointercancel"?this.pointerIds.delete(e.pointerId):e.type==="pointerdown"&&this.pointerIds.add(e.pointerId),this.pointerIds}applyHandlers(e,n){this.handlers=e,this.nativeHandlers=n}applyConfig(e,n){this.config=Ri(e,n,this.config)}clean(){this._targetEventStore.clean();for(const e of this.gestures)this.gestureEventStores[e].clean(),this.gestureTimeoutStores[e].clean()}effect(){return this.config.shared.target&&this.bind(),()=>this._targetEventStore.clean()}bind(...e){const n=this.config.shared,a={};let s;if(!(n.target&&(s=n.target(),!s))){if(n.enabled){for(const i of this.gestures){const u=this.config[i],o=it(a,u.eventOptions,!!s);if(u.enabled){const c=ke.get(i);new c(this,e,i).bind(o)}}const r=it(a,n.eventOptions,!!s);for(const i in this.nativeHandlers)r(i,"",u=>this.nativeHandlers[i](F(F({},this.state.shared),{},{event:u,args:e})),void 0,!0)}for(const r in a)a[r]=Zr(...a[r]);if(!s)return a;for(const r in a){const{device:i,capture:u,passive:o}=Gr(r);this._targetEventStore.add(s,i,"",a[r],{capture:u,passive:o})}}}}function L(t,e){t.gestures.add(e),t.gestureEventStores[e]=new ln(t,e),t.gestureTimeoutStores[e]=new $i}function Hi(t,e){e.drag&&L(t,"drag"),e.wheel&&L(t,"wheel"),e.scroll&&L(t,"scroll"),e.move&&L(t,"move"),e.pinch&&L(t,"pinch"),e.hover&&L(t,"hover")}const it=(t,e,n)=>(a,s,r,i={},u=!1)=>{var o,c;const l=(o=i.capture)!==null&&o!==void 0?o:e.capture,d=(c=i.passive)!==null&&c!==void 0?c:e.passive;let h=u?a:Hr(a,s,l);n&&d&&(h+="Passive"),t[h]=t[h]||[],t[h].push(r)},Yi=/^on(Drag|Wheel|Scroll|Move|Pinch|Hover)/;function Gi(t){const e={},n={},a=new Set;for(let s in t)Yi.test(s)?(a.add(RegExp.lastMatch),n[s]=t[s]):e[s]=t[s];return[n,e,a]}function P(t,e,n,a,s,r){if(!t.has(n)||!ke.has(a))return;const i=n+"Start",u=n+"End",o=c=>{let l;return c.first&&i in e&&e[i](c),n in e&&(l=e[n](c)),c.last&&u in e&&e[u](c),l};s[a]=o,r[a]=r[a]||{}}function zi(t,e){const[n,a,s]=Gi(t),r={};return P(s,n,"onDrag","drag",r,e),P(s,n,"onWheel","wheel",r,e),P(s,n,"onScroll","scroll",r,e),P(s,n,"onPinch","pinch",r,e),P(s,n,"onMove","move",r,e),P(s,n,"onHover","hover",r,e),{handlers:r,config:e,nativeHandlers:a}}function Ui(t,e={},n,a){const s=N.useMemo(()=>new Ni(t),[]);if(s.applyHandlers(t,a),s.applyConfig(e,n),N.useEffect(s.effect.bind(s)),N.useEffect(()=>s.clean.bind(s),[]),e.target===void 0)return s.bind.bind(s)}function Vi(t){return t.forEach(Si),function(n,a){const{handlers:s,nativeHandlers:r,config:i}=zi(n,a||{});return Ui(s,i,void 0,r)}}function Xi(t,e){return Vi([Ti,Ii,wi,Mi,Bi,_i])(t,e||{})}function Wi(t){J("translateViewport",t)}function qi(t){De("translateViewport",t)}function Ki({children:t}){const e=v.useRef(null),[n,a]=v.useState(1),[s,r]=v.useState({x:0,y:0}),[i,u]=v.useState(!1);return Xi({onPinch({delta:o,pinching:c}){u(c),a(Math.max(n+o[0],.1))},onWheel({event:o,delta:[c,l],wheeling:d}){o.preventDefault(),u(d),r({x:s.x-c/n,y:s.y-l/n})}},{target:e,eventOptions:{passive:!1}}),qi(o=>{const c=window.innerWidth,l=window.innerHeight,d=c/2-o.x*n,h=l/2-o.y*n;r({x:d/n,y:h/n})}),f.jsx(Zi,{children:f.jsx(Ji,{ref:e,children:f.jsx(Qi,{style:{"--zoom":n,"--translate-x":s.x,"--translate-y":s.y},"data-is-interacting":i,children:t})})})}const Zi=b.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`,Ji=b.div`
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`,Qi=b.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;function cn({worldState:t,setWorldState:e}){const n=t.states.find(o=>o.isPlayerControlled);if(!n)return null;const a=(o,c)=>{const l=t.states.map(d=>d.id===n.id?{...d,strategies:{...d.strategies,[o]:c}}:d);e({...t,states:l})},s=o=>{if(o===n.id)return"#4CAF50";switch(n.strategies[o]){case y.FRIENDLY:return"#4CAF50";case y.NEUTRAL:return"#FFC107";case y.HOSTILE:return"#F44336";default:return"#9E9E9E"}},r=Object.fromEntries(t.states.map(o=>[o.id,t.cities.filter(c=>c.stateId===o.id).map(c=>[c,jr(c.populationHistogram,t.timestamp).population])])),i=Object.fromEntries(t.states.map(o=>[o.id,r[o.id].reduce((c,[,l])=>c+l,0)])),u=o=>{const c=t.cities.filter(m=>m.stateId===o),l=t.launchSites.filter(m=>m.stateId===o);if(c.length===0&&l.length===0){console.warn("No position information available for this state");return}const d=[...c.map(m=>m.position),...l.map(m=>m.position)],h=d.reduce((m,p)=>({x:m.x+p.x,y:m.y+p.y}),{x:0,y:0}),g={x:h.x/d.length,y:h.y/d.length};Wi(g)};return f.jsx(eo,{children:t.states.map(o=>{var c;return f.jsxs(to,{relationshipColor:s(o.id),onClick:()=>u(o.id),children:[f.jsx(no,{children:o.name.charAt(0)}),f.jsxs(ao,{children:[f.jsx(so,{children:o.name}),f.jsx(ro,{children:((c=i[o.id])==null?void 0:c.toLocaleString())??"N/A"}),o.id!==n.id?f.jsx("select",{value:n.strategies[o.id],onClick:l=>l.stopPropagation(),onChange:l=>a(o.id,l.target.value),children:Object.values(y).map(l=>f.jsx("option",{value:l,children:l},l))}):"This is you"]})]},o.id)})})}const eo=b.div`
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
`,to=b.div`
  display: flex;
  align-items: center;
  margin: 5px;
  padding: 5px;
  background: ${t=>`rgba(${parseInt(t.relationshipColor.slice(1,3),16)}, ${parseInt(t.relationshipColor.slice(3,5),16)}, ${parseInt(t.relationshipColor.slice(5,7),16)}, 0.2)`};
  border-radius: 5px;
  transition: background 0.3s ease;
  cursor: pointer;
`,no=b.div`
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 10px;
  font-weight: bold;
`,ao=b.div`
  display: flex;
  flex-direction: column;
`,so=b.span`
  font-weight: bold;
  margin-bottom: 5px;
`,ro=b.span`
  font-size: 0.9em;
  margin-bottom: 5px;
`;function io({worldState:t,setWorldState:e}){return f.jsx(dr,{children:f.jsxs(lr,{children:[f.jsx(Ki,{children:f.jsx(wr,{state:t})}),f.jsx(cn,{worldState:t,setWorldState:e})]})})}const mn="fullScreenMessage",dn="fullScreenMessageAction";function I(t,e,n,a="",s,r,i){J(mn,{message:t,startTimestamp:e,endTimestamp:n,messageId:a,actions:s,prompt:r,fullScreen:i??!!(s!=null&&s.length)})}function fn(t,e){J(dn,{messageId:t,actionId:e})}function hn(t){De(mn,e=>{t(e)})}function Se(t){De(dn,e=>{t(e)})}function oo({worldState:t,onGameOver:e}){const[n,a]=v.useState(null),[s,r]=v.useState(!1);return v.useEffect(()=>{var g;if(s)return;const i=Object.fromEntries(t.states.map(m=>[m.id,t.cities.filter(p=>p.stateId===m.id).reduce((p,E)=>p+E.populationHistogram[E.populationHistogram.length-1].population,0)])),u=Object.values(i).filter(m=>m>0).length,o=t.launchSites.length===0,c=t.timestamp,l=t.states.filter(m=>i[m.id]>0&&Object.entries(m.strategies).filter(([p,E])=>i[p]>0&&E===y.HOSTILE).length>0),d=t.launchSites.some(m=>m.lastLaunchTimestamp&&c-m.lastLaunchTimestamp<ae),h=ae-c;if(!l.length&&!d&&h>0&&h<=10&&(n?I(`Game will end in ${Math.ceil(h)} seconds if no action is taken!`,n,n+10,"gameOverCountdown",void 0,!1,!0):a(c)),u<=1||o||!l.length&&!d&&c>ae){const m=u===1?(g=t.states.find(p=>i[p.id]>0))==null?void 0:g.id:void 0;r(!0),I(["Game Over!","Results will be shown shortly..."],c,c+5,"gameOverCountdown",void 0,!1,!0),setTimeout(()=>{e({populations:Object.fromEntries(t.states.map(p=>[p.id,i[p.id]])),winner:m,stateNames:Object.fromEntries(t.states.map(p=>[p.id,p.name])),playerStateId:t.states.find(p=>p.isPlayerControlled).id})},5e3)}},[t,e,n,s]),null}const uo="/assets/player-lost-background-D2A_VJ6-.png",lo="/assets/player-won-background-CkXgF24i.png",ot="/assets/draw-background-EwLQ9g28.png",co=b.div`
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
`,mo=({setGameState:t})=>{const{state:{result:e}}=lt(),n=()=>{t(K,{stateName:e.stateNames[e.playerStateId]})};let a,s;return e.winner?e.winner===e.playerStateId?(a=lo,s=`Congratulations! ${e.stateNames[e.playerStateId]} has won with ${e.populations[e.playerStateId]} population alive.`):e.winner!==void 0?(a=uo,s=`${e.stateNames[e.winner]} has won with ${e.populations[e.winner]} population alive. Your state has fallen.`):(a=ot,s="The game has ended in an unexpected state."):(a=ot,s="It's a draw! The world is partially destroyed, but there's still hope."),f.jsx(co,{backgroundImage:a,children:f.jsxs("div",{children:[f.jsx("h2",{children:"Game Over"}),f.jsx("p",{children:s}),f.jsx("button",{onClick:n,children:"Play Again"}),f.jsx("br",{}),f.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},ve={Component:mo,path:"played"};function fo({worldState:t}){var c;const[e,n]=v.useState([]),[a,s]=v.useState(null);hn(l=>{n(d=>l.messageId&&d.find(h=>h.messageId===l.messageId)?[...d.map(h=>h.messageId===l.messageId?l:h)]:[l,...d])});const r=e.sort((l,d)=>l.actions&&!d.actions?-1:!l.actions&&d.actions?1:l.startTimestamp-d.startTimestamp);if(Se(l=>{n(d=>d.filter(h=>h.messageId!==l.messageId))}),v.useEffect(()=>{const l=r.find(d=>d.fullScreen&&d.startTimestamp<=t.timestamp&&d.endTimestamp>t.timestamp);s(l||null)},[r,t.timestamp]),!a)return null;const u=((l,d)=>d<l.startTimestamp?"pre":d<l.startTimestamp+.5?"pre-in":d>l.endTimestamp-.5?"post-in":d>l.endTimestamp?"post":"active")(a,t.timestamp),o=l=>Array.isArray(l)?l.map((d,h)=>f.jsx("div",{children:d},h)):l;return f.jsxs(go,{"data-message-state":u,"data-action":(((c=a.actions)==null?void 0:c.length)??0)>0,children:[f.jsx(vo,{children:o(a.message)}),a.prompt&&a.actions&&f.jsx(yo,{children:a.actions.map((l,d)=>f.jsx(bo,{onClick:()=>fn(a.messageId,l.id),children:l.text},d))})]})}const ho=Z`
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`,po=Z`
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    display: none;
    transform: scale(0.9);
  }
`,go=b.div`
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
    animation: ${ho} 0.5s ease-in-out forwards;
  }

  &[data-message-state='active'] {
    display: flex;
  }

  &[data-message-state='post-in'] {
    display: flex;
    animation: ${po} 0.5s ease-in-out forwards;
  }

  &[data-message-state='post'] {
    display: none;
  }
`,vo=b.div`
  font-size: 4rem;
  color: white;
  text-align: center;
  max-width: 80%;
  white-space: pre-line;
`,yo=b.div`
  display: flex;
  justify-content: center;
  margin-top: 2rem;
`,bo=b.button`
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
`,pn="ALLIANCEPROPOSAL";function Eo(t,e,n,a=!1){const s=`${pn}_${t.id}_${e.id}`,r=a?`${t.name} has become friendly towards you. Do you want to form an alliance?`:`${t.name} proposes an alliance with ${e.name}. Do you accept?`,i=n.timestamp,u=i+10;I(r,i,u,s,[{id:"accept",text:"Accept"},{id:"reject",text:"Reject"}],!0)}function xo({worldState:t,setWorldState:e}){return Se(n=>{if(n.messageId.startsWith(pn)){const[,a,s]=n.messageId.split("_"),r=t.states.find(u=>u.id===a),i=t.states.find(u=>u.id===s);if(!r||!(i!=null&&i.isPlayerControlled))return;if(n.actionId==="accept"){const u=t.states.map(o=>o.id===a||o.id===s?{...o,strategies:{...o.strategies,[a]:y.FRIENDLY,[s]:y.FRIENDLY}}:o);e({...t,states:u}),I(`Alliance formed between ${r.name} and ${i.name}!`,t.timestamp,t.timestamp+5)}else n.actionId==="reject"&&I(`${i.name} has rejected the alliance proposal from ${r.name}.`,t.timestamp,t.timestamp+5)}}),null}function Fo({worldState:t}){const e=t.states.find(g=>g.isPlayerControlled),[n,a]=v.useState(!1),[s,r]=v.useState({}),[i,u]=v.useState([]),[o,c]=v.useState([]),[l,d]=v.useState(!1),h=Math.round(t.timestamp*10)/10;return v.useEffect(()=>{!n&&t.timestamp>0&&(a(!0),I("The game has started!",t.timestamp,t.timestamp+3))},[h]),v.useEffect(()=>{if(e){const g=Object.fromEntries(t.states.map(m=>[m.id,m.strategies]));for(const m of t.states)for(const p of t.states.filter(E=>E.id!==m.id))e&&p.id===e.id&&m.strategies[p.id]===y.FRIENDLY&&p.strategies[m.id]!==y.FRIENDLY&&s[m.id][p.id]!==y.FRIENDLY&&Eo(m,e,t,!0),p.strategies[m.id]===y.FRIENDLY&&m.strategies[p.id]===y.FRIENDLY&&(s[p.id][m.id]!==y.FRIENDLY||s[m.id][p.id]!==y.FRIENDLY)&&I(`${p.name} has formed alliance with ${m.isPlayerControlled?"you":m.name}!`,h,h+3),m.strategies[p.id]===y.HOSTILE&&s[m.id][p.id]!==y.HOSTILE&&I(p.isPlayerControlled?`${m.name} has declared war on You!`:`${m.isPlayerControlled?"You have":m.name} declared war on ${p.name}!`,h,h+3,void 0,void 0,void 0,m.isPlayerControlled||p.isPlayerControlled);r(g)}},[h]),v.useEffect(()=>{e&&t.cities.filter(g=>g.stateId===e.id).forEach(g=>{const m=i.find(B=>B.id===g.id);if(!m)return;const p=g.populationHistogram[g.populationHistogram.length-1].population,A=(m?m.populationHistogram[m.populationHistogram.length-1].population:p)-p;A>0&&I([`Your city ${g.name} has been hit!`,`${A} casualties reported.`],h,h+3,void 0,void 0,!1,!0)}),u(t.cities.map(g=>({...g,populationHistogram:[...g.populationHistogram]})))},[h]),v.useEffect(()=>{if(e){const g=t.launchSites.filter(m=>m.stateId===e.id);o.length>0&&o.filter(p=>!g.some(E=>E.id===p.id)).forEach(()=>{I("One of your launch sites has been destroyed!",h,h+3,void 0,void 0,!1,!0)}),c(g)}},[h]),v.useEffect(()=>{if(e&&!l){const g=t.cities.filter(E=>E.stateId===e.id),m=t.launchSites.filter(E=>E.stateId===e.id);!g.some(E=>E.populationHistogram[E.populationHistogram.length-1].population>0)&&m.length===0&&(I(["You have been defeated.","All your cities are destroyed.","You have no remaining launch sites."],h,h+5,void 0,void 0,!1,!0),d(!0))}},[h]),null}function Co({worldState:t}){const[e,n]=v.useState([]);hn(i=>{n(u=>i.messageId&&u.find(o=>o.messageId===i.messageId)?[...u.map(o=>o.messageId===i.messageId?i:o)]:[i,...u])}),Se(i=>{n(u=>u.filter(o=>o.messageId!==i.messageId))});const a=i=>Array.isArray(i)?i.map((u,o)=>f.jsx("div",{children:u},o)):i,s=(i,u)=>{const l=u-i;return l>60?0:l>50?1-(l-50)/10:1},r=v.useMemo(()=>{const i=t.timestamp,u=60;return e.filter(o=>{const c=o.startTimestamp||0;return i-c<=u}).map(o=>({...o,opacity:s(o.startTimestamp||0,i)}))},[e,t.timestamp]);return f.jsx(Ao,{children:r.map((i,u)=>f.jsxs(Do,{style:{opacity:i.opacity},children:[f.jsx("div",{children:a(i.message)}),i.prompt&&i.actions&&f.jsx(ko,{children:i.actions.map((o,c)=>f.jsx(So,{onClick:()=>fn(i.messageId,o.id),children:o.text},c))})]},u))})}const Ao=b.div`
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
`,Do=b.div`
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 5px;
  text-align: left;
  transition: opacity 0.5s ease-out;
`,ko=b.div`
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
`,So=b.button`
  font-size: 12px;
  padding: 5px 10px;
  margin-right: 10px;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
`;function To({updateWorldTime:t,currentWorldTime:e}){const[n,a]=v.useState(!1),s=v.useRef(null);Qt(i=>{if(!s.current){s.current=i;return}const u=i-s.current;s.current=i,!(u<=0)&&n&&t(u/1e3)},!0);const r=i=>{const u=Math.floor(i/86400),o=Math.floor(i%86400/3600),c=Math.floor(i%3600/60),l=Math.floor(i%60);return[[u,"d"],[o,"h"],[c,"m"],[l,"s"]].filter(([d])=>!!d).map(([d,h])=>String(d)+h).join(" ")};return f.jsx(_o,{children:f.jsxs(Bo,{children:[f.jsxs(Io,{children:[e>0?"Current Time: ":"Game not started yet",r(e)]}),f.jsx(V,{onClick:()=>t(1),children:"+1s"}),f.jsx(V,{onClick:()=>t(10),children:"+10s"}),f.jsx(V,{onClick:()=>t(60),children:"+1m"}),f.jsx(V,{onClick:()=>a(!n),children:n?"Stop":"Start"})]})})}const _o=b.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 0;
  z-index: 10;
  padding: 10px;
`,Bo=b.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid #444;
  border-radius: 10px;
  padding: 10px;
`,V=b.button`
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
`,Io=b.div`
  color: #ecf0f1;
  font-size: 16px;
  font-weight: bold;
  margin-right: 15px;
`,wo=({setGameState:t})=>{const{state:{stateName:e}}=lt(),{worldState:n,setWorldState:a,updateWorldState:s}=ir(e);return f.jsxs(f.Fragment,{children:[f.jsx(io,{worldState:n,setWorldState:a}),f.jsx(To,{updateWorldTime:r=>s(n,r),currentWorldTime:n.timestamp??0}),f.jsx(cn,{worldState:n,setWorldState:a}),f.jsx(fo,{worldState:n}),f.jsx(Co,{worldState:n}),f.jsx(oo,{worldState:n,onGameOver:r=>t(ve,{result:r})}),f.jsx(Fo,{worldState:n}),f.jsx(xo,{worldState:n,setWorldState:a})]})},K={Component:wo,path:"playing"},Mo="/assets/play-background-BASXrsIB.png",jo=b.div`
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
    background-image: url(${Mo});
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
`,Oo=({setGameState:t})=>{const[e,n]=v.useState(qt(1)[0]),a=()=>{t(K,{stateName:e})};return f.jsx(jo,{children:f.jsxs("div",{children:[f.jsx("h1",{children:"Name your state:"}),f.jsx("input",{type:"text",placeholder:"Type your state name here",value:e,onChange:s=>n(s.currentTarget.value)}),f.jsx("br",{}),f.jsx("button",{onClick:a,disabled:!e,children:"Start game"}),f.jsx("br",{}),f.jsx("a",{href:"/games/nukes/",children:"Back to main menu"})]})})},ye={Component:Oo,path:"play"},Lo="/assets/intro-background-D_km5uka.png",Po="/assets/nukes-game-title-vcFxx9vI.png",Ro=Z`
  0% {
    transform: scale(1.5);
  }
  50% {
    transform: scale(1);
  }
  100% {
    transform: scale(1.5);
  }
`,$o=Z`
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
`,No=b.div`
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
    background-image: url(${Lo});
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    image-rendering: pixelated;
    opacity: 0.5;
    pointer-events: none;
    z-index: 0;
    animation: ${Ro} 60s ease-in-out infinite;
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
`,Ho=b.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: white;
  z-index: 2;
  pointer-events: none;
  opacity: ${t=>t.isFlashing?1:0};
  animation: ${t=>t.isFlashing?$o:"none"} 4.5s forwards;
`,Yo=b.div`
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: rgba(0, 0, 0, 0.7);
  padding-bottom: 2em;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0px 0px 5px black;
`,Go=b.img`
  width: 600px;
  height: auto;
  image-rendering: pixelated;
`,zo=({setGameState:t})=>{const[e,n]=v.useState(!0);return v.useEffect(()=>{const a=setTimeout(()=>{n(!1)},5e3);return()=>clearTimeout(a)},[]),f.jsxs(No,{children:[f.jsx(Ho,{isFlashing:e}),!e&&f.jsxs(Yo,{children:[f.jsx(Go,{src:Po,alt:"Nukes game"}),f.jsx("button",{onClick:()=>t(ye),children:"Play"})]})]})},ut={Component:zo,path:""},Uo=xn`
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
`,Vo=[{path:ut.path,element:f.jsx(X,{state:ut})},{path:ye.path,element:f.jsx(X,{state:ye})},{path:K.path,element:f.jsx(X,{state:K})},{path:ve.path,element:f.jsx(X,{state:ve})}];function qo(){var n;const[t]=bn(),e=t.get("path")??"";return f.jsx(f.Fragment,{children:(n=Vo.find(a=>a.path===e))==null?void 0:n.element})}function X({state:t}){const e=En();return f.jsxs(f.Fragment,{children:[f.jsx(Uo,{}),f.jsx(t.Component,{setGameState:(n,a)=>e({search:"path="+n.path},{state:a})})]})}export{qo as NukesApp,Vo as routes};
