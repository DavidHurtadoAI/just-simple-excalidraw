import assert from 'node:assert/strict';
import { build } from 'esbuild';

const mocks = {
  obsidian: `
    export class Plugin {
      constructor(){this.app=globalThis.fontApp;}
      async loadData(){return globalThis.fontSettings;}
      registerView(){} registerExtensions(){} addCommand(){} addRibbonIcon(){} addSettingTab(){}
    }
    export class FileView {} export class PluginSettingTab {} export class Setting {}
    export class TFile {} export class WorkspaceLeaf {}
    export class Notice {constructor(message){globalThis.fontNotices.push(message);}}
    export const normalizePath=p=>p.replaceAll('\\\\','/');
    export const arrayBufferToBase64=bytes=>Buffer.from(bytes).toString('base64');
  `,
  react: 'export const createElement=()=>{};export const useEffect=()=>{};export const useState=()=>{};',
  'react-dom/client': 'export const createRoot=()=>{};',
  '@excalidraw/excalidraw': 'export const Excalidraw=()=>{};export const serializeAsJSON=()=>"";'
};
const bundle = await build({entryPoints:['main.ts'],bundle:true,format:'esm',write:false,
  banner:{js:'let __JSE_APPLY_CUSTOM_FONT__=()=>{};globalThis.applyTestFont=registry=>__JSE_APPLY_CUSTOM_FONT__(registry);'},
  plugins:[{name:'font-loading',setup(builder){
    builder.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'mock'}:undefined);
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}]});
globalThis.document={fonts:new Set()};
globalThis.FontFace=class {
  constructor(family,bytes){this.family=family;this.bytes=bytes;this.status='unloaded';}
  async load(){if(globalThis.rejectFont)throw Error('Invalid font payload');this.status='loaded';return this;}
};
const {default:Plugin}=await import(`data:text/javascript,${encodeURIComponent(bundle.outputFiles[0].text)}`);
let checks=0;
class Face {constructor(family,uri){this.urls=[uri];this.fontFace={family};}}
const bytes=Uint8Array.from([119,79,70,50,1,2,3,4]).buffer;
for(const scenario of [
  {path:'Fonts/custom.woff2',valid:true},
  {path:'../escape.woff2'}, {path:'C:/outside.woff2'}, {path:'https://remote/font.woff2'},
  {path:'Fonts/missing.woff2',missing:true}, {path:'Fonts/huge.woff2',size:3*1024*1024},
  {path:'Fonts/corrupt.woff2',reject:true}, {path:'Fonts/wrong.ttf'}, {path:''}
]){
  globalThis.fontSettings={fontPath:scenario.path};globalThis.fontNotices=[];globalThis.rejectFont=!!scenario.reject;
  let reads=0;
  // Intentionally no getAbstractFileByPath: this runs before the index exists.
  globalThis.fontApp={vault:{adapter:{
    async stat(){return scenario.missing?null:{type:'file',size:scenario.size??bytes.byteLength};},
    async readBinary(){reads++;return bytes;}
  }}};
  const plugin=new Plugin();await plugin.onload();
  const original=new Face('Excalifont','default');const other={fontFaces:[new Face('Other','keep')]};
  const registry=new Map([[5,{metadata:{test:true},fontFaces:[original]}],[2,other]]);
  globalThis.applyTestFont(registry);
  const face=registry.get(5).fontFaces[0];
  if(scenario.valid){
    assert.equal(plugin.fontError,'');assert.equal(reads,1);assert.match(face.urls[0],/^data:font\/woff2;base64,/);
    assert.equal(face.fontFace.status,'loaded');assert.equal(document.fonts.has(face.fontFace),true);
    globalThis.applyTestFont(registry);assert.equal(registry.get(5).fontFaces[0],face);
    checks+=6;
  }else{
    assert.equal(face,original);assert.equal(fontNotices.length,scenario.path?1:0);checks+=2;
    if(scenario.path.includes(':')||scenario.path.startsWith('../')||scenario.missing||scenario.size){assert.equal(reads,0);checks++;}
  }
  assert.equal(registry.get(2),other);checks++;
}
console.log(`Font startup, validation, fallback and isolation checks passed: ${checks}.`);
