const $=id=>document.getElementById(id);
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{notify('기기 저장 공간을 사용할 수 없습니다.');return false}}
let logs=load('tenor-logs',[]), states=load('tenor-states',{}), exams=load('tenor-exams',{}), meta=load('tenor-meta',{});
const dateKey=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let takeRevision=0, piece, exam=false, revealed=false, started, practiceSeconds=0, timerRunning=false, ctx, master, metro, playing=[], answerTimer, recorder, opening=false, takeUrl, messageTimer;
let examCueCount=0, examReadyAt=0;
const notify=msg=>{$('notice').textContent=msg;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('notice').textContent='',3500)};
const node=(tag,str)=>{const el=document.createElement(tag);el.textContent=str;return el};
function review(p){const state=states[p.id];const graded=logs.find(l=>l.id===p.id&&l.accuracy!=null);return state==='복습 필요'||(state!=='완료'&&(graded?.accuracy??100)<80)}
function tab(id){if(id!=='studio'&&(opening||recorder)){notify('녹음을 끝낸 뒤 화면을 이동해 주세요.');return}if(id!=='studio')$('take').pause();for(const name of ['studio','library','history'])$(name).hidden=name!==id;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));if(id!=='studio')stopSound();if(id==='history')historyView();if(id==='library')libraryView()}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
pieces.push(...load('tenor-generated',[]));
const choose=values=>values[Math.floor(Math.random()*values.length)];
function compose(level){
  const keys={
    'C장조':['C','D','E','F','G','A','B'],
    'G장조':['G','A','B','C','D','E','F#'],
    'D장조':['D','E','F#','G','A','B','C#'],
    'A장조':['A','B','C#','D','E','F#','G#'],
    'F장조':['F','G','A','Bb','C','D','E'],
    'G단조':['G','A','Bb','C','D','Eb','F'],
    'A단조':['A','B','C','D','E','F','G']
  };
  const selected=$('keySetting').value;
  const key=selected||choose(level==='초급'?['C장조','G장조','F장조','A단조']:Object.keys(keys));
  const low=Number($('lowSetting').value), high=Number($('highSetting').value);
  if(!Number.isInteger(low)||!Number.isInteger(high)||low<40||high>81||high-low<7)throw Error('음역은 최소 7반음 이상으로 설정해 주세요.');
  const scale=[];
  for(let octave=3;octave<=6;octave++)for(const name of keys[key]){
    const note=name+octave, midi=parse(note).midi-12;
    if(midi>=low&&midi<=high)scale.push(note);
  }
  const tonic=keys[key][0];
  const tonicIndexes=scale.map((note,index)=>note.startsWith(tonic)?index:-1).filter(index=>index>=0);
  if(scale.length<5||!tonicIndexes.length)throw Error('선택한 음역에 조성의 음이 부족합니다. 음역을 넓혀 주세요.');
  const root=choose(tonicIndexes);
  const beats=Number($('meterSetting').value[0])||choose([3,4]);
  const easy=level==='초급', advanced=level==='상급';
  const bars=[];
  let degree=root;
  for(let bar=0;bar<8;bar++){
    if(bar===7){bars.push([[scale[root],beats]]);break}
    const sync=!easy&&(bar===1||bar===5);
    const rhythm=sync?[.5,.5,1,...Array(beats-2).fill(1)]
      :choose([[...Array(beats).fill(1)],[1,beats-1],[.5,.5,...Array(beats-1).fill(1)]]);
    const notes=rhythm.map((length,index)=>{
      const last=index===rhythm.length-1;
      if(last&&(bar===3||bar===6))degree=bar===3?Math.min(scale.length-1,root+2):Math.min(scale.length-1,root+1);
      else if(!(sync&&index===2)&&!(bar===0&&index===0)){
        const moves=easy?[-1,0,1]:advanced?[-3,-2,-1,1,2,3]:[-2,-1,0,1,2];
        degree=choose(moves.map(move=>degree+move).filter(value=>value>=0&&value<scale.length));
      }
      let name=scale[degree];
      if(advanced&&bar===4&&index===0&&name[1]!=='#'&&name[1]!=='b'&&parse(name).midi-12<high){
        name=name.replace(/([A-G])(\d)/,'$1#$2');
      }
      if(!easy&&bar===2&&index===0)name='r';
      return sync&&index===1?[name,length,true]:[name,length];
    });
    bars.push(notes);
  }
  const requestedTempo=$('tempoSetting').value;
  const tempo=requestedTempo?Number(requestedTempo):(easy?72:advanced?96:84);
  if(!Number.isFinite(tempo)||tempo<35||tempo>180)throw Error('템포는 35~180 BPM으로 설정해 주세요.');
  return {id:'created-'+crypto.randomUUID(),title:'창작 시창',composer:'테너 시창실',work:level,
    key,meter:beats+'/4',range:'MIDI '+low+'–'+high,bpm:tempo,
    part:'테너',start:1,level,synthetic:true,bars};
}
function newProblem(dailyDate){
  if(opening||recorder){notify('먼저 녹음을 끝내 주세요.');return}
  const level=$('level').value;
  const previous=dailyDate&&pieces.find(p=>p.dailyDate===dailyDate&&p.level===level);
  if(previous){select(previous);return}
  let created;
  try{created=compose(level)}catch(error){notify(error.message);return}
  if(dailyDate)created.dailyDate=dailyDate;
  if(!save('tenor-generated',[...pieces.filter(p=>p.synthetic),created]))return;
  pieces.push(created);
  select(created);
}
$('generate').onclick=()=>newProblem();

function select(p){if(opening||recorder){notify('먼저 녹음을 끝내 주세요.');return}if(piece)saveDraft();stopSound();piece=p;revealed=false;examCueCount=0;examReadyAt=exam?Date.now()+Math.max(0,Math.min(300,Number($('examPreparation').value)||0))*1000:0;practiceSeconds=0;timerRunning=false;started=Date.now();$('timerToggle').textContent='연습 시간 시작';$('timer').textContent='경과 0분 0초';$('log').reset();$('state').value=states[p.id]||'연습 중';$('bpm').value=p.bpm;$('bpm').oninput();$('score').hidden=false;$('sheet').textContent='악보 숨기기';$('badge').textContent=p.part+'  /  '+p.start+'–'+(p.start+7)+'마디  /  '+(meta[p.id]?.difficulty||p.level);$('title').textContent=p.title;$('details').textContent=[p.composer,p.work,p.key,p.meter,p.range].join(' · ');$('hint').textContent=p.synthetic?'창작 훈련 구절 · 실제 지정곡 미확정':(meta[p.id]?.exam||'실제 지정곡 미확정')+' · 원전 기준 발췌';renderScore();restoreTake(p);restoreDraft();mode();tab('studio');}
function mode(){$('practice').classList.toggle('active',!exam);$('exam').classList.toggle('active',exam);$('answer').hidden=exam&&!revealed;$('reveal').hidden=!exam||revealed}
$('practice').onclick=()=>{exam=false;$('examStatus').textContent='';mode()};
$('exam').onclick=()=>{exam=true;revealed=false;examCueCount=0;examReadyAt=Date.now()+Math.max(0,Math.min(300,Number($('examPreparation').value)||0))*1000;stopSound();mode();notify('조성을 듣고 시창한 뒤 제출하세요.')};
$('reveal').onclick=()=>{if(Date.now()<examReadyAt){notify('준비 시간이 끝난 뒤 제출할 수 있어요.');return}revealed=true;mode();notify('정답과 녹음을 비교해 보세요.')};
$('daily').onclick=()=>newProblem(dateKey());
$('next').onclick=()=>select(randomOriginal());
let recentOriginals=[];
function randomOriginal(){
  const originals=pieces.filter(p=>!p.synthetic&&p!==piece);
  const fresh=originals.filter(p=>!recentOriginals.includes(p.id));
  const pool=fresh.length?fresh:originals;
  const next=pool[Math.floor(Math.random()*pool.length)];
  if(!opening&&!recorder)recentOriginals=[next.id,...recentOriginals].slice(0,5);
  return next;
}
$('sheet').onclick=()=>{$('score').hidden=!$('score').hidden;$('sheet').textContent=$('score').hidden?'악보 보기':'악보 숨기기'};
$('bpm').oninput=()=>{$('bpmVal').value=$('bpm').value+' BPM';if(metro){stopMetro();startMetro()}};
const steps='CDEFGAB', chroma=[0,2,4,5,7,9,11];
function parse(s){if(s==='r')return null;const [,letter,acc,oct]=s.match(/^([A-G])([#bn]?)(\d)$/);const i=steps.indexOf(letter);return {step:Number(oct)*7+i,acc,midi:(Number(oct)+1)*12+chroma[i]+(acc==='#'?1:acc==='b'?-1:0)}}
function renderScore(){const bars=piece.bars;let markup='';
const keySig={'A장조':['F#5','C#5','G#5'],'D장조':['F#5','C#5'],'G장조':['F#5'],'G단조':['Bb4','Eb5'],'F장조':['Bb4']}[piece.key]||[];
const defaults=Object.fromEntries(keySig.map(n=>[n[0],n[1]]));
for(let row=0;row<bars.length;){const count=bars[row].length>5||bars[row+1]?.length>5?1:Math.min(2,bars.length-row);let svg='<svg viewBox="0 0 350 105" role="img" aria-label="'+(row+1)+'번째 마디부터 악보">';
for(let l=0;l<5;l++){let y=36+l*8;svg+=`<path d="M8 ${y}H342" stroke="#777" stroke-width=".8"/>`}
svg+='<text x="11" y="65" font-size="39" font-family="serif">𝄞</text><text x="19" y="82" font-size="9">8</text>';
svg+=`<text x="36" y="50" font-size="13" font-weight="bold">${piece.meter[0]}</text><text x="36" y="65" font-size="13" font-weight="bold">${piece.meter[2]}</text>`;
for(const [i,n] of keySig.entries())svg+=`<text x="${47+i*10}" y="${72-(parse(n).step-30)*4}" font-size="14">${n[1]==='#'?'♯':'♭'}</text>`;
for(let k=0;k<count;k++){const leftStart=51+keySig.length*10;
const width=(342-leftStart)/count;
const notes=bars[row+k],left=leftStart+k*width,right=left+width;
const accidentals={};svg+=`<path d="M${right} 36v32" stroke="#333"/><text x="${left+3}" y="20" font-size="9" fill="#805137">${piece.start+row+k}</text>`;
for(let n=0;n<notes.length;n++){const [name,d,tie]=notes[n];const x=left+14+n*(right-left-20)/notes.length;const p=parse(name);if(!p){if(d>=2&&d<=4)svg+=`<rect x="${x-5}" y="${d===2||d===3?48:52}" width="10" height="4"/>`;else if(d>=1)svg+=`<path d="M${x-2} 43l5 6-5 7q8 0 4 7" fill="none" stroke="currentColor" stroke-width="2"/>`;else {svg+=`<circle cx="${x-3}" cy="49" r="2.4"/><path d="M${x-3} 49q6 5 9-3l-6 16" fill="none" stroke="currentColor" stroke-width="1.3"/>`;if(d<=.375)svg+=`<circle cx="${x-4}" cy="55" r="2.4"/><path d="M${x-4} 55q6 5 9-3" fill="none" stroke="currentColor" stroke-width="1.3"/>`;}if([.375,.75,1.5,3].includes(d))svg+=`<circle cx="${x+9}" cy="50" r="1.4"/>`;continue}
const y=68-(p.step-30)*4;
for(let j=y<36?28:76;y<36?j>=y:j<=y;j+=y<36?-8:8)svg+=`<path d="M${x-8} ${j}h16" stroke="currentColor"/>`;
const prior=accidentals[p.step]??defaults[name[0]]??'';
accidentals[p.step]=p.acc;
if(prior!==p.acc)svg+=`<text x="${x-14}" y="${y+4}" font-size="13">${({b:'♭','#':'♯',n:'♮'})[p.acc||'n']}</text>`;
svg+=`<ellipse cx="${x}" cy="${y}" rx="${d>=4?6:5}" ry="3.2" transform="rotate(-16 ${x} ${y})" fill="${d>=2?'#fffcf4':'currentColor'}" stroke="currentColor" stroke-width="1.2"/>`;
if(d<4){const down=y<=52,sx=x+(down?-4:4),sy=y+(down?22:-22);svg+=`<path d="M${sx} ${y}V${sy}" stroke="currentColor"/>`;if(d<1){svg+=`<path d="M${sx} ${sy}q9 ${down?-5:5} 7 ${down?-12:12}" fill="none" stroke="currentColor" stroke-width="1.5"/>`;if(d<=.25)svg+=`<path d="M${sx} ${sy+(down?-5:5)}q9 ${down?-5:5} 7 ${down?-12:12}" fill="none" stroke="currentColor"/>`}}
if([.375,.75,1.5,3,6].includes(d))svg+=`<circle cx="${x+8}" cy="${y-2}" r="1.4"/>`;
if(tie){const span=notes[n+1]?(right-left-20)/notes.length:20;svg+=`<path d="M${x} ${y+6}q${span/2} 8 ${span} 0" fill="none" stroke="currentColor"/>`;}
}}
markup+=svg+'</svg>';row+=count}$('score').innerHTML=markup}
function setAudioStatus(message){$('audioStatus').textContent=message}
function audio(){
  try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch{}
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)throw new Error('AudioContext unavailable');
  if(!ctx||ctx.state==='closed'){
    ctx=new AC({latencyHint:'interactive'});
    master=ctx.createGain();
    const limiter=ctx.createDynamicsCompressor();
    master.gain.value=.95;
    limiter.threshold.value=-10;
    limiter.knee.value=12;
    limiter.ratio.value=8;
    limiter.attack.value=.003;
    limiter.release.value=.2;
    master.connect(limiter).connect(ctx.destination);
    ctx.onstatechange=()=>setAudioStatus(ctx.state==='running'?'소리 재생 준비됨':'오디오 상태 · '+ctx.state);
  }
  if(ctx.state!=='running'){
    const resumed=ctx.resume();
    resumed?.catch(()=>setAudioStatus('소리를 시작하지 못했습니다. Safari에서 다시 열어 주세요.'));
  }
  return ctx;
}
let mediaNotes=null, mediaUrl;
const practiceAudio=new Audio();
function stopMedia(){
  practiceAudio.pause();
  practiceAudio.removeAttribute('src');
  if(mediaUrl)URL.revokeObjectURL(mediaUrl);
  mediaUrl=null;
}
function playMedia(notes){
  const rate=22050;
  const start=ctx.currentTime;
  const count=Math.ceil(rate*Math.max(...notes.map(n=>n.time-start+n.length+.03)));
  const samples=new Float32Array(count);
  for(const n of notes){
    const offset=Math.round(Math.max(0,n.time-start)*rate);
    const frequency=440*2**((n.midi-69)/12);
    for(let i=0;i<Math.floor(n.length*rate);i++){
      const t=i/rate;
      const envelope=Math.min(1,t/.008,(n.length-t)/.05);
      const phase=2*Math.PI*frequency*t;
      const wave=(Math.sin(phase)+.32*Math.exp(-2.4*t)*Math.sin(2*phase)+.12*Math.exp(-4*t)*Math.sin(3*phase))/1.44;
      const decay=.58+.42*Math.exp(-1.7*t);
      samples[offset+i]+=wave*envelope*decay*n.volume;
    }
  }
  const wav=new ArrayBuffer(44+count*2);
  const view=new DataView(wav);
  for(const [offset,label] of [[0,'RIFF'],[8,'WAVEfmt '],[36,'data']]){
    for(let i=0;i<label.length;i++)view.setUint8(offset+i,label.charCodeAt(i));
  }
  for(const [offset,value] of [[4,36+count*2],[16,16],[24,rate],[28,rate*2],[40,count*2]])view.setUint32(offset,value,true);
  for(const [offset,value] of [[20,1],[22,1],[32,2],[34,16]])view.setUint16(offset,value,true);
  samples.forEach((sample,i)=>view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sample))*32767),true));
  stopMedia();
  mediaUrl=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
  practiceAudio.src=mediaUrl;
  const current=mediaUrl;
  practiceAudio.play().catch(()=>{
    if(current!==mediaUrl)return;
    stopAnswer();
    setAudioStatus('재생이 차단됐습니다. Safari에서 페이지를 열고 다시 눌러 주세요.');
  });
}
function tone(midi,time,length,volume,type='triangle',track=true){if(mediaNotes){mediaNotes.push({midi,time,length,volume,type});return}const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=440*2**((midi-69)/12);g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(volume,time+.012);g.gain.exponentialRampToValueAtTime(.0001,time+Math.max(.03,length));o.connect(g);g.connect(master);o.start(time);o.stop(time+length+.035);if(track){playing.push(o);o.onended=()=>playing=playing.filter(x=>x!==o)}}
function stopAnswer(){stopMedia();playing.forEach(o=>{try{o.stop()}catch{}});playing=[];clearTimeout(answerTimer);answerTimer=null;$('answer').textContent='▶ 정답 재생'}
function stopMetro(){clearInterval(metro);metro=null;$('metro').textContent='메트로놈'}
function stopSound(){stopAnswer();stopMetro()}
function startMetro(){try{audio();if(metro)return;let i=0;const beat=()=>tone(i++%Number(piece.meter[0])===0?89:81,ctx.currentTime+.025,.075,.32,'sine',false);beat();metro=setInterval(beat,60000/Number($('bpm').value));$('metro').textContent='메트로놈 끄기';setAudioStatus('메트로놈 재생 중')}catch{notify('오디오를 시작할 수 없습니다.')}}
$('metro').onclick=()=>metro?stopMetro():startMetro();
$('pitch').onclick=()=>{try{stopSound();audio();const first=piece.bars.flat().find(n=>n[0]!=='r');tone(parse(first[0]).midi-12,ctx.currentTime+.035,1,.42,'sine');setAudioStatus('시작음 재생 중')}catch{notify('시작음을 재생할 수 없습니다.')}};
$('keyCue').onclick=()=>{
  if(opening||recorder){notify('녹음을 끝낸 뒤 들을 수 있어요.');return}
  try{
    audio();
    stopSound();
    const first=piece.bars.flat().find(([name])=>name!=='r');
    const start=parse(first[0]).midi-12;
    const tonic=parse(piece.key[0]+'3').midi;
    const minor=piece.key.includes('단조');
    let time=ctx.currentTime+.05;
    if($('cue').value==='chords'){
      for(const chord of [[0,minor?3:4,7],[7,11,14,17],[0,minor?3:4,7]]){
        chord.forEach(interval=>tone(tonic+interval,time,.45,.13));
        time+=.53;
      }
    }
    if($('cue').value==='scale'||$('cue').value==='harmonic'){
      const scale=[0,2,minor?3:4,5,7,minor?8:9,minor&&$('cue').value!=='harmonic'?10:11,12];
      for(const interval of [...scale,...scale.slice(0,-1).reverse()]){
        tone(tonic+interval,time,.19,.28);
        time+=.22;
      }
    }
    tone(start,time,.85,.42,'sine');
    setAudioStatus('조성 안내 · '+piece.key);
  }catch{notify('조성 안내를 재생할 수 없습니다.')}
};
$('answer').onclick=()=>{if(opening||recorder){notify('녹음이 끝나면 정답을 들을 수 있어요.');return}if(answerTimer){stopAnswer();setAudioStatus('정답 재생을 멈췄습니다.');return}try{audio();stopMetro();const beat=60/Number($('bpm').value);let time=ctx.currentTime+.06;const seq=piece.bars.flat();for(let i=0;i<seq.length;i++){let [name,d,tie]=seq[i];while(tie&&seq[i+1]?.[0]===name){const next=seq[++i];d+=next[1];tie=next[2]}if(name!=='r')tone(parse(name).midi-12,time,d*beat*.94,.34,'triangle');time+=d*beat}$('answer').textContent='■ 정답 정지';setAudioStatus('정답 재생 중');answerTimer=setTimeout(()=>{stopAnswer();setAudioStatus('정답 재생 완료')},(time-ctx.currentTime)*1000+80)}catch{notify('정답을 재생할 수 없습니다.')}};
// Start native media playback inside the tap handler, including on iOS.
for(const id of ['pitch','keyCue','answer']){
  const action=$(id).onclick;
  $(id).onclick=()=>{
    if(exam&&!revealed&&(id==='pitch'||id==='keyCue')){
      const limit=Math.max(1,Math.min(10,Number($('examCueLimit').value)||1));
      if(examCueCount>=limit){notify('이번 실전의 조성 안내 횟수를 모두 사용했습니다.');return}
      examCueCount++;
    }
    mediaNotes=[];
    try{
      action();
      if(mediaNotes.length)playMedia(mediaNotes);
    }finally{mediaNotes=null}
  };
}
function clearTake() {
  $('take').pause();
  $('take').removeAttribute('src');
  $('take').hidden = true;
  $('deleteTake').hidden = true;
  $('compareTake').hidden = true;
  if (takeUrl) URL.revokeObjectURL(takeUrl);
  takeUrl = null;
}

function showTake(blob, saved) {
  clearTake();
  takeUrl = URL.createObjectURL(blob);
  $('take').src = takeUrl;
  $('take').hidden = false;
  $('deleteTake').hidden = !saved;
  $('compareTake').hidden = false;
  $('recInfo').textContent = saved
    ? '이 구절의 녹음이 기기에 저장됐어요.'
    : '녹음을 들을 수 있어요. 기기에 저장하지 못했습니다.';
}

async function restoreTake(p) {
  const revision = ++takeRevision;
  clearTake();
  $('recInfo').textContent = '이 구절의 최근 녹음을 확인하는 중…';
  try {
    const value = await getTake(p.id);
    if (revision !== takeRevision) return;
    const takes=value instanceof Blob?[{blob:value,date:null}]:Array.isArray(value)?value:[];
    $('takeList').replaceChildren();
    takes.forEach((take,index)=>{const option=node('option',take.date?new Date(take.date).toLocaleString('ko-KR'):'이전 녹음');option.value=String(index);$('takeList').append(option)});
    $('takeList').hidden=takes.length===0;
    $('takeList').onchange=()=>showTake(takes[Number($('takeList').value)].blob,true);
    if (takes.length) showTake(takes[0].blob, true);
    else $('recInfo').textContent = '마이크 권한을 허용하면 녹음하고 바로 들을 수 있어요.';
  } catch {
    if (revision === takeRevision) $('recInfo').textContent = '기기에서 이전 녹음을 읽을 수 없습니다. 새 녹음은 바로 들을 수 있어요.';
  }
}

$('deleteTake').onclick = async () => {
  if (recorder || opening || !$('take').src) return;
  const p = piece;
  const revision = ++takeRevision;
  $('deleteTake').disabled = true;
  try {
    const old=await getTake(p.id);
    const takes=old instanceof Blob?[{blob:old,date:null}]:Array.isArray(old)?old:[];
    takes.splice(Number($('takeList').value)||0,1);
    if(takes.length)await putTake(p.id,takes);else await deleteTake(p.id);
    if (revision === takeRevision) {
      await restoreTake(p);
      notify('선택한 녹음을 지웠습니다.');
    }
  } catch {
    notify('녹음을 지우지 못했습니다.');
  } finally {
    $('deleteTake').disabled = false;
  }
};

function microphoneMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError': return '마이크 접근이 차단됐습니다. Safari의 이 웹사이트 마이크 권한을 확인해 주세요.';
    case 'NotFoundError': return '이 브라우저에서 사용할 수 있는 마이크를 찾지 못했습니다.';
    case 'NotReadableError': return '마이크를 열 수 없습니다. 다른 앱에서 마이크를 사용 중인지 확인해 주세요.';
    default: return '녹음을 시작하지 못했습니다. Safari에서 이 페이지를 직접 열어 다시 시도해 주세요.';
  }
}

$('record').onclick = async () => {
  if(exam&&!revealed&&!$('examRecording').checked){notify('실전 설정에서 녹음 사용을 켜 주세요.');return}
  if (recorder?.state === 'recording') {
    stopMetro();
    recorder.stop();
    $('record').disabled = true;
    return;
  }
  if (opening || recorder) return;
  opening = true;
  $('record').disabled = true;
  const p = piece;
  let stream;
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Error();
    try{if(navigator.audioSession)navigator.audioSession.type='auto'}catch{}
    stream = await navigator.mediaDevices.getUserMedia({audio: true});
    stopSound();
    $('take').pause();
    const revision = ++takeRevision;
    const chunks = [];
    let failed = false;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      failed = true;
      notify('녹음 중 마이크 연결이 끊겼습니다.');
    };
    recorder.onstop = async () => {
      const type = recorder.mimeType;
      stream.getTracks().forEach(track => track.stop());
      try {
        if (chunks.length && !failed) {
          const blob = new Blob(chunks, {type: type || chunks[0].type});
          try {
            const old=await getTake(p.id);
            const takes=old instanceof Blob?[{blob:old,date:null}]:Array.isArray(old)?old:[];
            await putTake(p.id,[{blob,date:new Date().toISOString()},...takes]);
            if (revision === takeRevision) await restoreTake(p);
          } catch {
            if (revision === takeRevision) showTake(blob, false);
          }
        } else {
          notify('저장할 녹음이 없습니다.');
          await restoreTake(p);
        }
      } finally {
        recorder = null;
        $('record').disabled = false;
        $('record').textContent = '● 녹음 시작';
      }
    };
    if($('countIn').checked){
      audio();
      const beats=Number(piece.meter[0]), beatLength=60000/Number($('bpm').value);
      for(let i=0;i<beats;i++){
        tone(i===0?89:81,ctx.currentTime+.02,.075,.25,'sine',false);
        await new Promise(resolve=>setTimeout(resolve,beatLength));
      }
    }
    recorder.start();
    if($('recordMetro').checked)startMetro();
    $('record').textContent = '■ 녹음 종료';
    $('recInfo').textContent = '녹음 중…';
  } catch (error) {
    recorder = null;
    stream?.getTracks().forEach(track => track.stop());
    notify(microphoneMessage(error));
  } finally {
    opening = false;
    $('record').disabled = false;
  }
};

$('compareTake').onclick=()=>{
  if(exam&&!revealed){notify('실전 모드를 제출한 뒤 정답을 비교할 수 있어요.');return}
  $('take').onended=()=>{$('take').onended=null;$('answer').click()};
  $('take').play().catch(()=>notify('녹음을 재생하지 못했습니다. 다시 눌러 주세요.'));
};
$('cue').append(node('option','화성단음계 + 시작음'));
$('cue').lastChild.value='harmonic';

const savedKeys=['tenor-logs','tenor-states','tenor-exams','tenor-meta','tenor-generated','tenor-drafts'];
function downloadBackup(data,name){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('exportData').onclick=()=>{
  const data={};
  for(const key of savedKeys)data[key]=load(key,key==='tenor-logs'||key==='tenor-generated'?[]:{});
  downloadBackup({format:'tenor-studio-records',version:1,data},'tenor-records.json');
};
function blobAsData(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
$('exportAudio').onclick=async()=>{
  try{
    const records=await getAllRecordings(), output=[];
    for(const record of records){
      const takes=record.value instanceof Blob?[{blob:record.value,date:null}]:record.value;
      if(!Array.isArray(takes))continue;
      const converted=[];
      for(const take of takes)converted.push({date:take.date,data:await blobAsData(take.blob)});
      output.push({id:record.id,takes:converted});
    }
    downloadBackup({format:'tenor-studio-audio',version:1,recordings:output},'tenor-recordings.json');
  }catch{notify('녹음 백업에 실패했습니다. 저장 공간과 권한을 확인해 주세요.')}
};
$('importData').onchange=async event=>{
  const file=event.target.files[0];
  if(!file)return;
  try{
    const backup=JSON.parse(await file.text());
    if(!confirm('기존 데이터와 백업 데이터를 합칩니다. 같은 항목은 기존 내용을 유지합니다. 계속할까요?'))return;
    if(backup.format==='tenor-studio-records'){
      if(!backup.data||typeof backup.data!=='object')throw Error('기록 형식이 올바르지 않습니다.');
      const current=Object.fromEntries(savedKeys.map(key=>[key,load(key,key==='tenor-logs'||key==='tenor-generated'?[]:{})]));
      const incoming=backup.data;
      for(const key of ['tenor-logs','tenor-generated'])if(incoming[key]!==undefined&&!Array.isArray(incoming[key]))throw Error('기록 형식이 올바르지 않습니다.');
      for(const key of ['tenor-states','tenor-exams','tenor-meta','tenor-drafts'])if(incoming[key]!==undefined&&(!incoming[key]||typeof incoming[key]!=='object'||Array.isArray(incoming[key])))throw Error('설정 형식이 올바르지 않습니다.');
      const generated=[...current['tenor-generated']];
      for(const p of incoming['tenor-generated']||[])if(p.id&&!generated.some(existing=>existing.id===p.id))generated.push(p);
      const logsMerged=[...current['tenor-logs']];
      const known=new Set(logsMerged.map(item=>JSON.stringify(item)));
      for(const item of incoming['tenor-logs']||[]){const signature=JSON.stringify(item);if(!known.has(signature)){known.add(signature);logsMerged.push(item)}}
      const merged={'tenor-logs':logsMerged,'tenor-generated':generated};
      for(const key of ['tenor-states','tenor-exams','tenor-meta','tenor-drafts'])merged[key]={...incoming[key],...current[key]};
      try{for(const key of savedKeys)localStorage.setItem(key,JSON.stringify(merged[key]))}
      catch(error){for(const key of savedKeys)localStorage.setItem(key,JSON.stringify(current[key]));throw error}
      $('backupStatus').textContent='기록을 합쳤습니다. 화면을 다시 엽니다.';
      location.reload();
    }else if(backup.format==='tenor-studio-audio'){
      if(!Array.isArray(backup.recordings))throw Error('녹음 형식이 올바르지 않습니다.');
      for(const record of backup.recordings){
        if(typeof record.id!=='string'||!Array.isArray(record.takes))throw Error('녹음 형식이 올바르지 않습니다.');
        const old=await getTake(record.id);
        const takes=old instanceof Blob?[{blob:old,date:null}]:Array.isArray(old)?old:[];
        for(const take of record.takes){
          if(typeof take.data!=='string'||!take.data.startsWith('data:audio/'))throw Error('녹음 데이터가 올바르지 않습니다.');
          if(!takes.some(existing=>existing.date&&existing.date===take.date))takes.push({date:take.date,blob:await(await fetch(take.data)).blob()});
        }
        await putTake(record.id,takes);
      }
      $('backupStatus').textContent='녹음을 합쳤습니다.';
      await restoreTake(piece);
    }else throw Error('지원하지 않는 백업 파일입니다.');
  }catch(error){$('backupStatus').textContent='가져오기 실패 · '+error.message}
  finally{event.target.value=''}
};

function elapsed(){return Math.floor(practiceSeconds+(timerRunning?(Date.now()-started)/1000:0))}
$('timerToggle').onclick=()=>{
  if(timerRunning){practiceSeconds=elapsed();timerRunning=false;$('timerToggle').textContent='연습 시간 계속'}
  else{started=Date.now();timerRunning=true;$('timerToggle').textContent='일시정지'}
};
$('timerEnd').onclick=()=>{if(timerRunning)practiceSeconds=elapsed();timerRunning=false;$('timerToggle').textContent='연습 시간 계속'};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&timerRunning)$('timerEnd').click()});
function saveDraft(){
  const drafts=load('tenor-drafts',{});
  drafts[piece.id]={memo:$('memo').value,accuracy:$('accuracy').value,repeats:$('repeats').value,state:$('state').value,reasons:[...document.querySelectorAll('[name=reason]:checked')].map(el=>el.value)};
  save('tenor-drafts',drafts);
}
function restoreDraft(){
  const draft=load('tenor-drafts',{})[piece.id];
  if(!draft)return;
  for(const id of ['memo','accuracy','repeats','state'])if(draft[id]!=null)$(id).value=draft[id];
  document.querySelectorAll('[name=reason]').forEach(el=>el.checked=(draft.reasons||[]).includes(el.value));
}
$('log').addEventListener('input',()=>{if(piece)saveDraft()});
function duration(sec){return Math.floor(sec/60)+'분 '+sec%60+'초'}
setInterval(()=>$('timer').textContent='경과 '+duration(elapsed()),1000);
setInterval(()=>{if(exam&&!revealed)$('examStatus').textContent=Date.now()<examReadyAt?'준비 시간 '+Math.ceil((examReadyAt-Date.now())/1000)+'초':'시창 후 제출하세요.'},1000);
$('log').onsubmit=e=>{e.preventDefault();const entry={id:piece.id,date:dateKey(),accuracy:$('accuracy').value===''?null:Number($('accuracy').value),seconds:elapsed(),repeats:Number($('repeats').value),memo:$('memo').value,reasons:[...document.querySelectorAll('[name=reason]:checked')].map(el=>el.value),state:$('state').value,mode:exam?'실전':'연습'};const nextLogs=[entry,...logs];if(save('tenor-logs',nextLogs)){logs=nextLogs;states={...states,[piece.id]:entry.state};save('tenor-states',states);practiceSeconds=0;timerRunning=false;started=Date.now();$('timerToggle').textContent='연습 시간 시작';$('memo').value='';$('accuracy').value='';$('repeats').value='1';document.querySelectorAll('[name=reason]').forEach(el=>el.checked=false);saveDraft();notify('연습을 저장했습니다.')}};
function opener(p,label){const b=node('button',label);b.onclick=()=>{select(p);window.scrollTo(0,0)};return b}
function pieceLabel(p){return p&&p.title+' · '+p.part+' · '+p.start+'–'+(p.start+7)+'마디'}
function historyView(){const queue=pieces.filter(review);$('reviews').replaceChildren(...(queue.length?queue.map(p=>opener(p,pieceLabel(p))): [node('p','복습할 구절이 없습니다.')]));$('logs').replaceChildren(...(logs.length?logs.map(l=>{const div=node('div','');div.className='row';div.append(node('strong',pieceLabel(pieces.find(p=>p.id===l.id))||l.id),node('p',[l.date,l.mode,l.accuracy==null?'미평가':l.accuracy+'%',duration(l.seconds),l.repeats+'회',l.state].join(' · ')));if(l.reasons?.length)div.append(node('p','복습 항목 · '+l.reasons.join(', ')));if(l.memo)div.append(node('p',l.memo));const savedPiece=pieces.find(p=>p.id===l.id);if(savedPiece)div.append(opener(savedPiece,'다시 풀기'));return div}):[node('p','저장한 연습이 없습니다.')]))}
function field(label,values,current,change){const wrap=node('label',label), el=document.createElement(values?'select':'input');if(values)for(const v of values)el.append(node('option',v));el.value=current;el.onchange=()=>change(el.value);wrap.append(el);return wrap}
function libraryView(){
$('exams').replaceChildren(...['서산시립합창단','보령시립합창단'].map(name=>{const div=node('div','');div.className='row';div.append(node('strong',name));const fields=node('div','');fields.className='fields';for(const [key,label] of [['date','시험 일정'],['song','지정곡']])fields.append(field(label,null,exams[name]?.[key]||'미확정',v=>{const updated={...exams,[name]:{...exams[name],[key]:v||'미확정'}};if(save('tenor-exams',updated))exams=updated}));div.append(fields);return div}));
$('pieces').replaceChildren(...pieces.filter(p=>!p.synthetic&&[p.title,p.composer,p.work,meta[p.id]?.difficulty||p.level,states[p.id]||'미시작'].join(' ').toLowerCase().includes($('librarySearch').value.trim().toLowerCase())).map(p=>{const div=node('div','');div.className='row';div.append(node('strong',p.title),node('p',[p.composer,p.work,p.part,p.start+'–'+(p.start+7)+'마디',p.range,p.key,p.bpm+' BPM'].join(' · ')));const fields=node('div','');fields.className='fields';const edit=(key,v)=>{const updated={...meta,[p.id]:{...meta[p.id],[key]:v}};if(save('tenor-meta',updated))meta=updated};fields.append(field('난이도',['초급','중급','상급'],meta[p.id]?.difficulty||p.level,v=>edit('difficulty',v)),field('시험용 여부',['미확정','시험 대비용','확인한 지정곡','시험 외 연습'],meta[p.id]?.exam||'미확정',v=>edit('exam',v)),field('연습 상태',['미시작','연습 중','복습 필요','완료'],states[p.id]||'미시작',v=>{const updated={...states,[p.id]:v};if(save('tenor-states',updated)){states=updated;if(piece.id===p.id)$('state').value=v}}));div.append(fields,opener(p,'이 구절 연습'));if(p.source){const link=node('a',' 원전 악보 ↗');link.href=p.source;link.target='_blank';link.rel='noopener';div.append(link);if(p.credit){const credit=node('p',p.credit+' ');const license=node('a','라이선스');license.href=p.credit.includes('4.0')?'https://creativecommons.org/licenses/by/4.0/':'https://creativecommons.org/licenses/by/3.0/';credit.append(license);div.append(credit)}}return div}));
}
$('librarySearch').oninput=libraryView;
newProblem(dateKey());
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(sessionStorage.getItem('tenor-sw-v9'))return;
    sessionStorage.setItem('tenor-sw-v9','1');
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then(registration=>{if(navigator.onLine)registration.update().catch(()=>{});return navigator.serviceWorker.ready}).then(()=>$('offline').textContent='오프라인 사용 가능').catch(()=>$('offline').textContent='오프라인 준비 실패')
}else $('offline').textContent='오프라인 미지원';

