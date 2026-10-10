import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog, requestSpeech, errorMessage, safePreviewUrl} from '../api.js';
import {normalizeSettings, catalogSettings} from '../settings.js';
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'content-type':'application/json'}});
const models = [{model_id:'eleven_future',name:'Future model',can_do_text_to_speech:true, maximum_text_length_per_request:1234},{model_id:'transcribe',name:'Transcription',can_do_text_to_speech:false}];
const settings = {apiKey:'fixture-secret',selectedVoiceId:'my-voice',mode:'eleven_future',speed:1,maxCharacters:1234};

test('restricted key loads paginated voices and current TTS models without User access', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch',async (url, init) => {
    calls.push(url);
    assert.equal(init.headers['xi-api-key'],'fixture-secret');
    if(url.endsWith('/v1/models')) return json(models);
    assert.match(url,/\/v2\/voices\?/);
    return url.includes('next_page_token=next') ? json({voices:[{voice_id:'b',name:'Bella',preview_url:'https://example.com/b.mp3',labels:{accent:'British'}}],has_more:false}) : json({voices:[{voice_id:'a',name:'Aria'}],has_more:true,next_page_token:'next'});
  });
  const catalog=await loadCatalog(' fixture-secret ');
  assert.deepEqual(catalog.voices.map(v=>v.name),['Aria','Bella']);
  assert.deepEqual(catalog.models,[{id:'eleven_future',name:'Future model',description:'',maxCharacters:1234}]);
  assert.equal(catalog.voices[1].labels.accent,'British');
  assert.equal(calls.some(url=>url.includes('/user')),false);
});

test('speech preserves new model IDs and omits incompatible voice settings', async t => {
  let request;
  t.mock.method(globalThis,'fetch',async(url,init)=>{request={url,...init};return new Response(new Uint8Array([1]),{headers:{'content-type':'audio/mpeg'}})});
  const controller=new AbortController();
  await requestSpeech(settings,' Hello world ',controller.signal);
  assert.deepEqual(JSON.parse(request.body),{text:'Hello world',model_id:'eleven_future'});
  assert.equal(request.signal,controller.signal);
  assert.match(request.url,/my-voice\/stream\?output_format=mp3_44100_128/);
});

for(const [status,code,message,expected] of [
  [401,'missing_permissions','Missing models_read permission',/Text to Speech.*Access/],
  [401,'invalid_api_key','Invalid API key',/full secret API key/],
  [401,'quota_exceeded','quota exceeded',/account credits.*credit cap/],
  [403,'','Forbidden',/IP restrictions/],
  [429,'too_many_concurrent_requests','Too many requests',/too many requests/],
  [500,'','Internal failure',/temporarily unavailable/],
  [404,'voice_not_found','Voice not found',/Refresh your voices/],
]) test(`speech error ${code || status} gives actionable guidance`,async t=>{
  t.mock.method(globalThis,'fetch',async()=>json({detail:{status:code,message}},status));
  await assert.rejects(requestSpeech(settings,'Hello'), expected);
});

test('catalog permission failures name the actual missing endpoint',async t=>{
  t.mock.method(globalThis,'fetch',async url=>url.endsWith('/v1/models')?json(models):json({detail:{status:'missing_permissions',message:'voices_read missing'}},401));
  await assert.rejects(loadCatalog('fixture-secret'),/Voices.*Read/);
});
test('empty voice library is valid and cannot crash setup',async t=>{
  t.mock.method(globalThis,'fetch',async url=>url.endsWith('/v1/models')?json(models):json({voices:[],has_more:false}));
  assert.deepEqual((await loadCatalog('fixture-secret')).voices,[]);
});
test('broken pagination fails visibly instead of saving a partial catalog',async t=>{
  t.mock.method(globalThis,'fetch',async url=>url.endsWith('/v1/models')?json(models):json({voices:[],has_more:true,next_page_token:'repeat'}));
  await assert.rejects(loadCatalog('fixture-secret'),/incomplete/);
});
test('oversized or empty text never starts a billable request',async t=>{
  const mock=t.mock.method(globalThis,'fetch',()=>{throw new Error('Must not fetch')});
  await assert.rejects(requestSpeech({...settings,maxCharacters:3},'long text'),/up to 3/);
  await assert.rejects(requestSpeech(settings,'  '),/Select some text/);
  assert.equal(mock.mock.callCount(),0);
});
test('successful JSON is not handed to the audio decoder',async t=>{
  t.mock.method(globalThis,'fetch',async()=>json({detail:'not audio'}));
  await assert.rejects(requestSpeech(settings,'Hello'),/playable audio/);
});
test('network errors contain recovery guidance, not secrets',()=>{
  assert.match(errorMessage(new TypeError('fixture-secret')),/connection/);
  assert.doesNotMatch(errorMessage(new TypeError('fixture-secret')),/fixture-secret/);
});
test('preview URLs require HTTPS and never credentials',()=>{
  assert.equal(safePreviewUrl('javascript:alert(1)'),null);
  assert.equal(safePreviewUrl('https://secret@example.com/a'),null);
  assert.equal(safePreviewUrl('https://example.com/a.mp3'),'https://example.com/a.mp3');
});
test('legacy preferences migrate without resetting the voice or speed',()=>{
  assert.equal(normalizeSettings({mode:'multilingual',speed:'1.75',selectedVoiceId:'saved'}).mode,'eleven_multilingual_v2');
  assert.equal(normalizeSettings({speed:'1.75'}).speed,1.75);
  assert.equal(normalizeSettings({speed:'nonsense'}).speed,1);
  const result=catalogSettings(normalizeSettings({mode:'removed',selectedVoiceId:'removed-voice'}),{models:[{id:'new'}],voices:[{id:'new-voice'}]});
  assert.equal(result.mode,'removed');
  assert.equal(result.selectedVoiceId,'removed-voice');
});


test('new setups prefer v4 Turbo while saved model choices survive refresh', () => {
  const catalog = { voices: [{ id: 'voice' }], models: [{ id: 'eleven_flash_v2_5' }, { id: 'eleven_v4_turbo' }] };
  assert.equal(catalogSettings(normalizeSettings(), catalog).mode, 'eleven_v4_turbo');
  assert.equal(catalogSettings(normalizeSettings({ mode: 'eleven_flash_v2_5' }), catalog).mode, 'eleven_flash_v2_5');
  assert.equal(catalogSettings(normalizeSettings(), { ...catalog, models: [{ id: 'eleven_flash_v2_5' }] }).mode, 'eleven_flash_v2_5');
});
