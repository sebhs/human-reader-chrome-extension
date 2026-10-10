import {createBackground} from '../background.js';
const output=document.getElementById('results');
const record=text=>{output.textContent+=`\n${text}`;};
let listeners=[];
let offscreen=false;
let delayed=false;
const audioElements=[];
const NativeAudio=window.Audio;
window.Audio=class extends NativeAudio {constructor(){super();this.muted=true;audioElements.push(this);this.addEventListener('ended',()=>record(`ENDED ${this.currentTime.toFixed(2)} / ${this.duration.toFixed(2)}`));}};
const sender={id:'fixture',tab:{id:1},url:location.href};
const dispatch=(message,source)=>new Promise(resolve=>{
  let waiting=false, responded=false;
  const respond=result=>{responded=true;resolve(result)};
  for(const fn of listeners) if(fn(message,source,respond)===true)waiting=true;
  if(!waiting&&!responded)resolve();
});
const event=()=>({addListener(){}});
const data={apiKey:'fixture-secret',selectedVoiceId:'voice',mode:'eleven_v4',speed:1,models:[{id:'eleven_v4',maxCharacters:10000}]};
window.chrome={
 runtime:{id:'fixture',getURL:path=>`${location.origin}/${path}`,getContexts:async()=>offscreen?[{}]:[],onInstalled:event(),onMessage:{addListener(fn){listeners.push(fn)}},async sendMessage(message){
   const source=message.target==='offscreen'?{id:'fixture',url:`${location.origin}/background.js`}:message.action==='playerState'?{id:'fixture',url:`${location.origin}/offscreen.html`}:sender;
   if(message.action==='playbackState')record(`${message.state.status}: ${message.state.message}`);
   return dispatch(message,source);
 }},
 storage:{local:{async setAccessLevel(){},async get(keys){return keys==='showSelectionButton'?{showSelectionButton:true}:data}},onChanged:event()},
 offscreen:{async createDocument(){offscreen=true;await import('../offscreen.js')},async closeDocument(){offscreen=false;record('Offscreen closed')}},
 tabs:{query:async()=>[{id:1}],sendMessage:async(_id,message)=>dispatch(message,{id:'fixture'}),create:async()=>{}},
 contextMenus:{onClicked:event()},commands:{onCommand:event()},action:{openPopup:async()=>{record('Open settings requested')}},
};
const originalFetch=window.fetch.bind(window);
const bytes=new Uint8Array(await (await originalFetch('/media/error-no-api-key.mp3')).arrayBuffer());
window.fetch=async(url,options={})=>{
 if(!String(url).startsWith('https://api.elevenlabs.io/'))return originalFetch(url,options);
 record(`Speech body: ${options.body}`);
 const signal=options.signal;
 if(delayed)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,5000);signal.addEventListener('abort',()=>{clearTimeout(timer);record('Pending request ABORTED');reject(new DOMException('Stopped','AbortError'))},{once:true})});
 let offset=0;
 const stream=new ReadableStream({async pull(controller){
  if(signal.aborted){controller.error(new DOMException('Stopped','AbortError'));return}
  if(offset>=bytes.length){controller.close();return}
  await new Promise(resolve=>setTimeout(resolve,40));
  controller.enqueue(bytes.slice(offset,offset+8192));offset+=8192;
 },cancel(){record('Audio stream cancelled')}});
 return new Response(stream,{headers:{'content-type':'audio/mpeg'}});
};
createBackground(window.chrome);
await import('../content.js');
document.getElementById('select').onclick=()=>{const range=document.createRange();range.selectNodeContents(document.getElementById('passage'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)};
document.getElementById('slow').onclick=()=>{delayed=true;record('Next request delayed 5 seconds')};
document.getElementById('normal').onclick=()=>{delayed=false;record('Normal request timing')};
document.getElementById('state').onclick=()=>{const audio=audioElements.at(-1);record(JSON.stringify(audio?{paused:audio.paused,ended:audio.ended,time:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:null,speed:audio.playbackRate}:{}))};
