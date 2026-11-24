import {requestedCount,codeNumber} from './program-spec.mjs';
export function objectProgram(prompt='') {
 const count=requestedCount(prompt,'numbers',null);
 const setup=count===null?'adad tadaad = budh("Ketira ang? ")\nwori (tadaad <= 0) { tadaad = budh("Hik ya vadheek ang likho: ") }':`adad tadaad = ${codeNumber(count)}`;
 return `// Class, independent object state, typed array fields and reusable methods.\nqism Hisab {\n    qatar dec ang = []\n    lafz naalo = "Hisab"\n    kam joryo(dec nayo_ang) {\n        paan.ang.joryo(nayo_ang)\n    }\n    kam kul() -> dec {\n        dec jama = 0.0\n        gin hik andar paan.ang { jama += hik }\n        wapas jama\n    }\n    kam ausat() -> dec {\n        jey (paan.ang.lambai == 0) { wapas 0.0 }\n        wapas paan.kul() / paan.ang.lambai\n    }\n}\n\nHisab natijo = naon Hisab()\n${setup}\ngin (adad soochi = 0; soochi < tadaad; soochi++) {\n    dec nayo_ang = budh("Ang " + (soochi + 1) + ": ")\n    natijo.joryo(nayo_ang)\n}\nbudhai "Kul: " + natijo.kul()\nbudhai "Ausat: " + natijo.ausat()\n`;
}
