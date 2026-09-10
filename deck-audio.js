/* Audio du diaporama M2 : sons voyelles (synthèse par formants) + mots (synthèse vocale en-GB). */
(function(){
const FORMANTS={
'ɪ':{t:[[360,2100,2700]],d:.26},'e':{t:[[570,1970,2600]],d:.28},'æ':{t:[[750,1750,2500]],d:.32},
'ɒ':{t:[[560,920,2560]],d:.28},'ʊ':{t:[[380,940,2300]],d:.26},'ʌ':{t:[[680,1080,2540]],d:.28},
'iː':{t:[[285,2250,2900]],d:.46},'ɑː':{t:[[700,1080,2540]],d:.48},'ɔː':{t:[[390,700,2500]],d:.48},
'uː':{t:[[310,1100,2300]],d:.46},'ɜː':{t:[[520,1450,2500]],d:.48},
'eɪ':{t:[[570,1950,2600],[380,2150,2700]],d:.5},'aɪ':{t:[[760,1330,2500],[380,2150,2700]],d:.52},
'ɔɪ':{t:[[400,700,2500],[380,2100,2700]],d:.52},'eə':{t:[[600,1900,2550],[520,1480,2500]],d:.5},
'əʊ':{t:[[520,1300,2450],[380,940,2300]],d:.5},'aʊ':{t:[[760,1300,2500],[380,940,2300]],d:.52},
'ɪə':{t:[[370,2100,2700],[520,1480,2500]],d:.5},'ə':{t:[[520,1480,2500]],d:.2}
};
let ac=null,voice=null;
function ctx(){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;if(!ac)ac=new AC();if(ac.state==='suspended')ac.resume();return ac}
function loadVoices(){if(!window.speechSynthesis)return;const v=window.speechSynthesis.getVoices()||[];const en=v.filter(x=>/^en/i.test(x.lang||''));const gb=en.filter(x=>/en[-_]GB/i.test(x.lang||''));voice=gb.find(x=>/female|Serena|Kate|Daniel|Sonia/i.test(x.name))||gb[0]||en[0]||null}
if(window.speechSynthesis){loadVoices();window.speechSynthesis.onvoiceschanged=loadVoices}
function playPhoneme(ipa){const F=FORMANTS[ipa],a=ctx();if(!F||!a)return;if(window.speechSynthesis)window.speechSynthesis.cancel();
const t0=a.currentTime+.03,dur=F.d,glide=F.t.length>1;
const src=a.createOscillator();src.type='sawtooth';src.frequency.setValueAtTime(134,t0);src.frequency.linearRampToValueAtTime(106,t0+dur);
const vib=a.createOscillator();vib.type='sine';vib.frequency.value=4.6;const vg=a.createGain();vg.gain.value=2.2;vib.connect(vg);vg.connect(src.frequency);
const tilt=a.createBiquadFilter();tilt.type='lowpass';tilt.frequency.value=3900;tilt.Q.value=.4;src.connect(tilt);
const mix=a.createGain();mix.gain.value=.9;const GAIN=[1,.5,.2],BW=[70,105,145];
for(let k=0;k<3;k++){const p=F.t[0][k],q=F.t[F.t.length-1][k];const bp=a.createBiquadFilter();bp.type='bandpass';bp.Q.value=p/BW[k];bp.frequency.setValueAtTime(p,t0);
if(glide){bp.frequency.setValueAtTime(p,t0+dur*.3);bp.frequency.linearRampToValueAtTime(q,t0+dur*.82)}
const g=a.createGain();g.gain.value=GAIN[k];tilt.connect(bp);bp.connect(g);g.connect(mix)}
const env=a.createGain();env.gain.setValueAtTime(1e-4,t0);env.gain.linearRampToValueAtTime(.85,t0+.035);env.gain.setValueAtTime(.85,t0+dur-.08);env.gain.linearRampToValueAtTime(1e-4,t0+dur);
mix.connect(env);env.connect(a.destination);src.start(t0);vib.start(t0);src.stop(t0+dur+.05);vib.stop(t0+dur+.05)}
let sayTimer=null,noticeShown=false;
/* Dans un aperçu embarqué (iframe), certains navigateurs acceptent speak() sans jamais démarrer la lecture. */
function notice(){if(noticeShown)return;noticeShown=true;
const d=document.createElement('div');
d.setAttribute('role','status');
d.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;max-width:min(680px,92vw);background:#1a2744;color:#fff;border:2px solid #f5b60f;border-radius:14px;padding:14px 20px;font:16px/1.4 Georgia,serif;box-shadow:0 6px 24px rgba(0,0,0,.3);display:flex;gap:14px;align-items:center';
const t=document.createElement('span');
t.textContent="La lecture des mots est bloquée dans cet aperçu. Ouvrez la page dans un navigateur (Chrome, Edge, Safari) pour entendre les mots ; les sons voyelles, eux, fonctionnent partout.";
const b=document.createElement('button');
b.textContent='Fermer';
b.style.cssText='flex:0 0 auto;background:#f5b60f;color:#0f1a33;border:0;border-radius:8px;padding:8px 14px;font:600 15px Georgia,serif;cursor:pointer';
b.onclick=function(){d.remove()};
d.appendChild(t);d.appendChild(b);document.body.appendChild(d);
setTimeout(function(){d.remove()},12000)}
function speakNow(text){const s=window.speechSynthesis;if(!voice)loadVoices();
const u=new SpeechSynthesisUtterance(text);u.lang='en-GB';if(voice){u.voice=voice;u.lang=voice.lang}u.rate=.85;u.pitch=1;
let started=false;
u.onstart=function(){started=true};
u.onerror=function(){setTimeout(function(){try{s.resume();s.speak(new SpeechSynthesisUtterance(text))}catch(e){}},120)};
try{s.resume()}catch(e){}
s.speak(u);
/* Chrome/Safari abandonnent parfois l'énoncé juste après un cancel : on relance si rien ne démarre. */
setTimeout(function(){if(started)return;
  if(!s.speaking&&!s.pending){try{s.resume();s.speak(new SpeechSynthesisUtterance(text))}catch(e){}return}
  /* speaking=true mais aucun démarrage : lecture bloquée (aperçu embarqué). */
  s.cancel();notice();},900)}
function say(text){const s=window.speechSynthesis;if(!s)return;
if(sayTimer){clearTimeout(sayTimer);sayTimer=null}
s.cancel();
sayTimer=setTimeout(function(){sayTimer=null;speakNow(text)},90)}
function flash(el){el.classList.add('is-playing');setTimeout(()=>el.classList.remove('is-playing'),520)}
document.addEventListener('click',function(e){
  const t=e.target.closest('[data-phon],[data-say]');if(!t)return;
  e.preventDefault();flash(t);
  if(t.hasAttribute('data-phon'))playPhoneme(t.getAttribute('data-phon'));
  else say(t.getAttribute('data-say')||t.textContent.trim());
});
window.M2Audio={playPhoneme:playPhoneme,say:say};
})();
