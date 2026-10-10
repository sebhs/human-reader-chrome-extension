(() => {
  const scenario = new URLSearchParams(location.search).get('scenario') || 'setup';
  const voices = [
    {voice_id:'aria',name:'Aria',description:'A warm, clear voice.',labels:{language:'English',accent:'American'},preview_url:'https://fixture.invalid/aria.mp3'},
    {voice_id:'george',name:'George',description:'A measured British narrator.',labels:{language:'English',accent:'British'},preview_url:'https://fixture.invalid/george.mp3'},
    {voice_id:'lea',name:'Léa',description:'French storytelling.',labels:{language:'French',accent:'Parisian'},preview_url:null},
  ];
  const models = [
    {model_id:'eleven_v4',name:'Eleven v4',description:'Expressive speech in multiple languages.',can_do_text_to_speech:true,maximum_text_length_per_request:10000},
    {model_id:'eleven_flash_v2_5',name:'Eleven Flash v2.5',description:'Low latency for everyday reading.',can_do_text_to_speech:true,maximum_text_length_per_request:40000},
    {model_id:'eleven_v3',name:'Eleven v3',description:'Expressive speech.',can_do_text_to_speech:true,maximum_text_length_per_request:5000},
  ];
  const initial = scenario === 'setup' ? {} : {apiKey:'fixture-secret', selectedVoiceId:'george',mode:'eleven_v4',speed:1.25};
  let data = JSON.parse(sessionStorage.getItem(`fixture-${scenario}`) || JSON.stringify(initial));
  const listeners=[];
  let state = {status:'idle',message:'',sourceTabId:1};
  const log = document.createElement('output');log.id='fixtureLog';log.style.cssText='position:fixed;left:410px;top:20px;width:360px;white-space:pre-wrap;font:11px monospace;overflow-wrap:anywhere';log.textContent=`Local fixture: ${scenario}. No live API.`;document.body.append(log);
  const record = message => {log.textContent += `\n${message}`;};
  window.chrome = {
    storage:{local:{
      async get(){return structuredClone(data)},
      async set(values){Object.assign(data,values);sessionStorage.setItem(`fixture-${scenario}`,JSON.stringify(data));record(`Saved ${Object.keys(values).join(', ')}`)},
      async remove(keys){for(const key of keys)delete data[key];sessionStorage.setItem(`fixture-${scenario}`,JSON.stringify(data));record('Disconnected')},
    }},
    runtime:{onMessage:{addListener(fn){listeners.push(fn)}},async sendMessage(message){
      if(message.action==='readSelection')state={status:'playing',message:'Reading selected text.',sourceTabId:1};
      if(message.action==='stop')state={status:'idle',message:'',sourceTabId:1};
      if(message.action==='toggle')state={...state,status:state.status==='paused'?'playing':'paused',message:''};
      for(const fn of listeners)fn({target:'ui',action:'playbackState',state});
      return {ok:true,state};
    }},
    commands:{async getAll(){return [{name:'read-selection',shortcut:'Alt+Shift+R'}]}},
    tabs:{async create(){record('Shortcut settings opened')}},
  };
  const realFetch=window.fetch.bind(window);
  window.fetch=async(url,init)=>{
    if(!String(url).startsWith('https://api.elevenlabs.io/'))return realFetch(url,init);
    record(`Requested ${new URL(url).pathname}`);
    const key=init.headers['xi-api-key'];
    if(key==='offline')throw new TypeError('Offline');
    if(key==='invalid')return new Response(JSON.stringify({detail:{status:'invalid_api_key'}}),{status:401});
    if(key==='missing-voices' && String(url).includes('/voices'))return new Response(JSON.stringify({detail:{status:'missing_permissions',message:'voices_read is missing'}}),{status:401});
    return new Response(JSON.stringify(String(url).includes('/models')?models:{voices:scenario==='empty'?[]:voices,has_more:false}),{headers:{'content-type':'application/json'}});
  };
  const NativeAudio=window.Audio;
  window.Audio=class extends NativeAudio {constructor(){super('/media/error-no-api-key.mp3');this.muted=true;}};
})();
