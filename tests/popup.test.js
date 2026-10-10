import test from 'node:test';
import assert from 'node:assert/strict';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const catalog={voices:[{voice_id:'voice',name:'Voice',preview_url:'https://example.com/sample.mp3'}],has_more:false};
const models=[{model_id:'new-model',name:'New model',can_do_text_to_speech:true}];
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
let version=0;
async function setup(t,initial={}) {
  const setGlobal=(name,value)=>{const previous=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});t.after(()=>{if(previous)Object.defineProperty(globalThis,name,previous);else delete globalThis[name]})};
  const elements=new Map();
  const get=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',type:'password',listeners:{},classList:{toggle(){}},addEventListener(event,fn){this.listeners[event]=fn},setAttribute(){},replaceChildren(){},add(){},focus(){}});
    return elements.get(id);
  };
  const data=structuredClone(initial);
  const audio=[];
  t.mock.method(globalThis,'fetch',async url=>response(url.includes('/models')?models:catalog));
  setGlobal('document',{getElementById:get});
  setGlobal('window',{addEventListener(){}});
  setGlobal('Option',class {constructor(name,value){Object.assign(this,{name,value})}});
  setGlobal('Audio',class {constructor(url){this.url=url;this.paused=false;audio.push(this)}addEventListener(){}pause(){this.paused=true}async play(){}});
  const chrome={
    storage:{local:{async get(){return structuredClone(data)},async set(values){Object.assign(data,values)},async remove(keys){for(const key of keys)delete data[key]}}},
    runtime:{onMessage:{addListener(){}},async sendMessage(){return {ok:true,state:{status:'idle'}}}},
    commands:{async getAll(){return []}},tabs:{async create(){}},
  };
  setGlobal('chrome',chrome);
  await import(`../popup.js?test=${++version}`);
  await tick();
  return {get,data,audio,chrome};
}

test('failed replacement key keeps the working key and all preferences',async t=>{
  const {get,data}=await setup(t,{apiKey:'saved-secret',selectedVoiceId:'voice',mode:'new-model',speed:1.75});
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({detail:{status:'missing_permissions',message:'missing voices_read'}}),{status:403}));
  get('apiKey').value='candidate-key';
  get('connectForm').listeners.submit({preventDefault(){}});
  await tick();
  assert.equal(data.apiKey,'saved-secret');
  assert.equal(data.speed,1.75);
  assert.equal(data.selectedVoiceId,'voice');
  assert.match(get('notice').textContent,/Voices.*Read/);
  assert.equal(get('apiKey').value,'candidate-key');
});
test('voice change cancels a preview waiting for the old reading to stop',async t=>{
  const {get,audio,chrome}=await setup(t,{apiKey:'saved-secret',selectedVoiceId:'voice',mode:'new-model'});
  let finish;
  chrome.runtime.sendMessage=()=>new Promise(resolve=>{finish=resolve});
  const preview=get('preview').listeners.click();
  await get('voices').listeners.change({target:{value:'different-voice'}});
  finish({ok:true});
  await preview;
  assert.equal(audio.length,0);
});
test('rapid preview clicks start only the latest sample',async t=>{
  const {get,audio,chrome}=await setup(t,{apiKey:'saved-secret',selectedVoiceId:'voice',mode:'new-model'});
  const pending=[];
  chrome.runtime.sendMessage=()=>new Promise(resolve=>pending.push(resolve));
  const first=get('preview').listeners.click();
  const second=get('preview').listeners.click();
  pending[1]({ok:true});await second;
  pending[0]({ok:true});await first;
  assert.equal(audio.length,1);
});
