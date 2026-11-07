import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

type Track={id:string,title:string,artist:string,album:string,genre:string,year:number,number:number,duration:number,bitrate:number,cover:string,size:number,added:number};
type Playlist={id:string,name:string,description:string,cover:string,ids:string[],created:number};
type History={id:string,date:number};
const initial={tracks:[] as Track[],playlists:[] as Playlist[],liked:[] as string[],history:[] as History[],seconds:0,light:false,accent:'#bd9aff',volume:.8,muted:false,shuffle:false,repeat:'Off',autoplay:true,visual:'Frequency'};
const database=new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open('aftertone',1);
 request.onupgradeneeded=()=>{request.result.createObjectStore('audio');request.result.createObjectStore('settings')};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
async function read(store:string,key:string){
 const db=await database;
 return new Promise<any>((resolve,reject)=>{const request=db.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
}
async function save(state:typeof initial, audio?:{id:string,file?:File}){
 const db=await database;
 return new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(audio?['settings','audio']:['settings'],'readwrite');
  tx.objectStore('settings').put(state,'library');
  if(audio){const store=tx.objectStore('audio');audio.file?store.put(audio.file,audio.id):store.delete(audio.id)}
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
 });
}
const format=(s:number)=>[Math.floor(s/60),String(Math.floor(s%60)).padStart(2,'0')].join(':');
const picture=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)});
const sections=['Home','Search','Your Library','Liked Songs','Playlists','Albums','Artists','Recently Played','Listening Statistics','Settings'];
const icons=['⌂','⌕','▤','♡','≡','◉','♙','◷','▥','⚙'];
const albumKey=(t:Track)=>JSON.stringify([t.artist,t.album]);
function Cover({src,large=false}:{src?:string,large?:boolean}){return src?<img className={'cover '+(large?'large':'')} src={src} alt="" loading="lazy"/>:<span className={'cover fallback '+(large?'large':'')}>♫</span>}

function App(){
 const [data,setData]=useState(initial), latest=useRef(initial), writes=useRef(Promise.resolve());
 const [loaded,load]=useState(false),[page,go]=useState('Home'),[query,search]=useState(''),[message,notice]=useState(''),[busy,setBusy]=useState(false);
 const uploading=useRef(false), uploadInput=useRef<HTMLInputElement>(null);
 const [trackId,setTrack]=useState(''),[queue,setQueue]=useState<string[]>([]),[index,setIndex]=useState(-1),[playing,setPlaying]=useState(false),[time,setTime]=useState(0);
 const [compact,setCompact]=useState(false),[showQueue,setShowQueue]=useState(false),[now,setNow]=useState(false),[limit,setLimit]=useState(60),[sort,setSort]=useState('Newest');
 const [editor,edit]=useState<Track|Playlist|null>(null),[color,setColor]=useState('');
 const audio=useRef<HTMLAudioElement>(null), context=useRef<AudioContext|null>(null), analyser=useRef<AnalyserNode|null>(null), canvas=useRef<HTMLCanvasElement>(null), url=useRef(''), token=useRef(0), drag=useRef('');
 const byId=React.useMemo(()=>new Map(data.tracks.map(t=>[t.id,t])),[data.tracks]);
 const current=byId.get(trackId);
 function update(change:(s:typeof initial)=>typeof initial,blob?:{id:string,file?:File}){
  const next=change(latest.current);latest.current=next;setData(next);
  const result=writes.current.then(()=>save(next,blob));
  writes.current=result.catch(e=>notice('Could not save changes. '+(e?.message||'')));
  return result;
 }
 useEffect(()=>{read('settings','library').then(s=>{latest.current={...initial,...s};setData(latest.current);load(true)}).catch(()=>notice('Browser storage is unavailable.'))},[]);
 useEffect(()=>{document.body.classList.toggle('light',data.light);document.documentElement.style.setProperty('--accent',data.accent)},[data.light,data.accent]);
 useEffect(()=>{if(audio.current){audio.current.volume=data.volume;audio.current.muted=data.muted}},[data.volume,data.muted]);
 useEffect(()=>{setLimit(60)},[page,query]);
 function navigate(p:string){go(p);search('');setNow(false)}
 async function upload(files:File[]){
  if(uploading.current||!loaded||!files.length)return;
  uploading.current=true;setBusy(true);let added=0,duplicates=0,failed=0;
  try{
   const {parseBlob}=await import('music-metadata');
   for(const [i,file] of files.entries()){
    notice(`Importing ${i+1}/${files.length} · ${file.name}`);
    try{
     if(!/\.mp3$/i.test(file.name))throw Error('Choose MP3 files');
     const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
     const id=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
     if(latest.current.tracks.some(t=>t.id===id)){duplicates++;continue}
     const {common,format:info}=await parseBlob(file,{duration:true});
     if(!info.duration)throw Error('No playable audio found');
     const art=common.picture?.[0];
     const cover=art?await picture(new Blob([new Uint8Array(art.data)],{type:art.format})):'';
     const t={id,title:common.title||file.name.replace(/\.mp3$/i,''),artist:common.artist||'Unknown artist',album:common.album||'Unknown album',genre:common.genre?.join(', ')||'',year:common.year||0,number:common.track.no||0,duration:info.duration,bitrate:info.bitrate||0,cover,size:file.size,added:Date.now()};
     try{await update(s=>({...s,tracks:[t,...s.tracks]}),{id,file});added++}catch{await update(s=>({...s,tracks:s.tracks.filter(track=>track.id!==id)}));failed++}
    }catch{failed++}
   }
   notice(`${added} imported · ${duplicates} duplicates · ${failed} failed`);
  }catch{notice('The MP3 importer could not load. Try refreshing.')}finally{uploading.current=false;setBusy(false)}
 }
 function enableAudio(){
  const a=audio.current!;
  if(!context.current&&window.AudioContext){const c=new AudioContext();const source=c.createMediaElementSource(a);const meter=c.createAnalyser();meter.fftSize=1024;source.connect(meter);meter.connect(c.destination);context.current=c;analyser.current=meter}
  return context.current?.resume();
 }
 async function start(id:string,ids:string[],position=ids.indexOf(id)){
  if(!id)return;
  const call=++token.current;
  try{
   await enableAudio();
   const file=await read('audio',id);
   if(call!==token.current)return;
   if(!file)throw Error('Import this MP3 again to play it.');
   const a=audio.current!;
   URL.revokeObjectURL(url.current);url.current=URL.createObjectURL(file);
   a.src=url.current;setTrack(id);setQueue(ids);setIndex(position);setTime(0);
   await a.play();
   update(s=>({...s,history:[{id,date:Date.now()},...s.history].slice(0,10000)}));
  }catch(e){if(call===token.current)notice('Playback unavailable. '+(e as Error).message)}
 }
 function play(t:Track,tracks:Track[],shuffle=data.shuffle){
  const rest=tracks.filter(x=>x.id!==t.id).map(x=>x.id);
  if(shuffle){for(let i=rest.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]]}}
  start(t.id,shuffle?[t.id,...rest]:tracks.map(x=>x.id));
 }
 function toggle(){const a=audio.current!;if(!current){if(data.tracks[0])play(data.tracks[0],data.tracks);return}if(a.paused){enableAudio();a.play().catch(()=>notice('Tap play again to resume.'))}else a.pause()}
 function step(direction:number,ended=false){
  const a=audio.current!;
  if(ended&&data.repeat==='Track'){a.currentTime=0;a.play().catch(()=>notice('Could not repeat this track.'));return}
  if(ended&&!data.autoplay)return;
  if(direction<0&&a.currentTime>3){a.currentTime=0;return}
  let next=index+direction;
  if(data.repeat==='Queue'&&queue.length)next=(next+queue.length)%queue.length;
  if(queue[next])start(queue[next],queue,next);
 }
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.target as HTMLElement).closest('input,textarea,select,button,[contenteditable]'))return;if(e.code==='Space'){e.preventDefault();toggle()}if(e.code==='ArrowRight'||e.code==='ArrowLeft'){const a=audio.current!;if(Number.isFinite(a.duration)){e.preventDefault();a.currentTime=Math.max(0,Math.min(a.duration,a.currentTime+(e.code==='ArrowRight'?5:-5)))}}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)});
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>update(s=>({...s,seconds:s.seconds+5})),5000);return()=>clearInterval(timer)},[playing]);
 useEffect(()=>{
  if(!now||data.visual==='Off')return;
  const c=canvas.current!,g=c.getContext('2d')!;let frame=0;
  function paint(){
   frame=requestAnimationFrame(paint);g.clearRect(0,0,c.width,c.height);
   const a=analyser.current;if(!a||!playing)return;
   const bytes=new Uint8Array(a.frequencyBinCount);const wave=data.visual==='Waveform';wave?a.getByteTimeDomainData(bytes):a.getByteFrequencyData(bytes);
   g.fillStyle=data.accent;g.strokeStyle=data.accent;g.lineWidth=2;g.beginPath();
   const n=data.visual==='Minimal'?7:72;
   for(let i=0;i<n;i++){const v=bytes[Math.floor(i*(wave?bytes.length:180)/n)]/255;
    if(wave)g.lineTo(i*c.width/(n-1),v*c.height);
    else if(data.visual==='Circular'){const angle=i*2*Math.PI/n;const radius=30+v*38;g.lineTo(c.width/2+Math.cos(angle)*radius,c.height/2+Math.sin(angle)*radius)}
    else g.fillRect(i*c.width/n,c.height-v*c.height,c.width/n-3,v*c.height);
   }
   if(data.visual==='Circular')g.closePath();g.stroke();
  }
  paint();return()=>cancelAnimationFrame(frame);
 },[now,playing,data.visual,data.accent]);
 useEffect(()=>{if(!current?.cover){setColor('');return}const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=1;const g=c.getContext('2d')!;g.drawImage(img,0,0,1,1);const [r,gc,b]=g.getImageData(0,0,1,1).data;setColor(`rgb(${r} ${gc} ${b})`)};img.src=current.cover;return()=>{img.onload=null}},[current?.cover]);
 const likes=new Set(data.liked);
 const plays=React.useMemo(()=>{const counts=new Map<string,number>();data.history.forEach(h=>counts.set(h.id,(counts.get(h.id)||0)+1));return counts},[data.history]);
 const recent=[...new Set(data.history.map(h=>h.id))].map(id=>byId.get(id)).filter(Boolean) as Track[];
 const ranked=data.tracks.filter(t=>plays.has(t.id)).sort((a,b)=>plays.get(b.id)!-plays.get(a.id)!);
 const groups=(tracks:Track[],key:(t:Track)=>string)=>{const m=new Map<string,Track[]>();for(const t of tracks){const group=key(t);if(!m.has(group))m.set(group,[]);m.get(group)!.push(t)}return m};
 const albums=React.useMemo(()=>groups(data.tracks,albumKey),[data.tracks]);
 const artists=React.useMemo(()=>groups(data.tracks,t=>t.artist),[data.tracks]);
 const playlist=data.playlists.find(p=>page==='p:'+p.id);
 const album=page.startsWith('a:')?albums.get(page.slice(2)):undefined;
 const artist=page.startsWith('r:')?artists.get(page.slice(2)):undefined;
 const term=query.trim().toLowerCase();
 const matches=(t:Track)=>[t.title,t.artist,t.album,t.genre].some(x=>x.toLowerCase().includes(term));
 const foundPlaylists=data.playlists.filter(p=>[p.name,p.description].some(x=>x.toLowerCase().includes(term))).sort((a,b)=>sort==='Alphabetical'?a.name.localeCompare(b.name):b.created-a.created);
 const playlistTracks=playlist?.ids.map(id=>byId.get(id)).filter(Boolean) as Track[]|undefined;
 const list=(playlistTracks||album?.slice().sort((a,b)=>a.number-b.number)||artist||(page==='Recently Played'?recent:page==='Liked Songs'?data.tracks.filter(t=>likes.has(t.id)):data.tracks)).filter(t=>matches(t)||(page==='Search'&&foundPlaylists.some(p=>p.ids.includes(t.id))));
 function like(id:string){update(s=>({...s,liked:s.liked.includes(id)?s.liked.filter(x=>x!==id):[...s.liked,id]}))}
 function changePlaylist(id:string,change:(p:Playlist)=>Playlist){update(s=>({...s,playlists:s.playlists.map(p=>p.id===id?change(p):p)}))}
 function reorder(target:string){if(!playlist||!drag.current||drag.current===target||!playlist.ids.includes(drag.current))return;const source=drag.current;changePlaylist(playlist.id,p=>{const ids=p.ids.filter(id=>id!==source);ids.splice(ids.indexOf(target),0,source);return {...p,ids}});drag.current=''}
 function newPlaylist(){edit({id:crypto.randomUUID(),name:'',description:'',ids:[],cover:'',created:Date.now()})}
 const tile=(title:string,sub:string,cover:string|undefined,action:()=>void)=> <button key={title+sub} className="tile" onClick={action}><Cover src={cover} large/><strong>{title}</strong><small>{sub}</small></button>;
 const albumTiles=(m:Map<string,Track[]>)=>Array.from(m,([k,ts])=>tile(ts[0].album,ts[0].artist,ts.find(t=>t.cover)?.cover,()=>navigate('a:'+k)));
 const artistTiles=(m:Map<string,Track[]>)=>Array.from(m,([k,ts])=>tile(k,`${ts.length} tracks · ${ts.reduce((n,t)=>n+(plays.get(t.id)||0),0)} plays`,ts.find(t=>t.cover)?.cover,()=>navigate('r:'+k)));
 const playlistTiles=()=>foundPlaylists.map(p=>tile(p.name,`${p.ids.length} tracks`,p.cover,()=>navigate('p:'+p.id)));
 function rows(items:Track[],count=limit){return <div className="rows">{items.slice(0,count).map((t,i)=><div key={t.id} className={'row '+(trackId===t.id?'active':'')} draggable={!!playlist} onDragStart={e=>{drag.current=t.id;e.dataTransfer.setData('text/plain',t.id)}} onDragOver={e=>playlist&&e.preventDefault()} onDrop={e=>{if(!e.dataTransfer.files.length)reorder(t.id)}}>
  <button aria-label={'Play '+t.title} onClick={()=>trackId===t.id?toggle():play(t,items)}>{trackId===t.id&&playing?'Ⅱ':'▶'}</button><Cover src={t.cover}/><div className="trackname"><strong>{t.title}</strong><button onClick={()=>navigate('r:'+t.artist)}>{t.artist}</button></div>
  <button className="albumname" onClick={()=>navigate('a:'+albumKey(t))}>{t.album}</button><button aria-label={likes.has(t.id)?'Unlike':'Like'} onClick={()=>like(t.id)}>{likes.has(t.id)?'♥':'♡'}</button><small>{format(t.duration)}</small>
  <select aria-label={'Actions for '+t.title} value="" onChange={e=>{const action=e.target.value;if(action==='edit')edit(t);if(action==='queue'){setQueue(q=>[...q,t.id]);notice('Added to the queue')}if(action==='remove'&&playlist)changePlaylist(playlist.id,p=>({...p,ids:p.ids.filter(id=>id!==t.id)}));if(action.startsWith('p:'))changePlaylist(action.slice(2),p=>({...p,ids:[...new Set([...p.ids,t.id])]}))}}>
   <option value="">•••</option><option value="queue">Add to queue</option><option value="edit">Edit track</option>{playlist&&<option value="remove">Remove from playlist</option>}{data.playlists.map(p=><option key={p.id} value={'p:'+p.id}>Add to {p.name}</option>)}
  </select></div>)}{!items.length&&<div className="empty">No tracks here yet.</div>}{count===limit&&items.length>count&&<button onClick={()=>setLimit(n=>n+60)}>Show more tracks</button>}</div>}
 const controls=<><button aria-label="Shuffle" aria-pressed={data.shuffle} onClick={()=>{const on=!data.shuffle;update(s=>({...s,shuffle:on}));if(on)setQueue(q=>[...q.slice(0,index+1),...q.slice(index+1).map(id=>({id,key:Math.random()})).sort((a,b)=>a.key-b.key).map(x=>x.id)])}}>⤨</button><button aria-label="Previous" onClick={()=>step(-1)}>◀❘</button><button className="play" aria-label={playing?'Pause':'Play'} onClick={toggle}>{playing?'Ⅱ':'▶'}</button><button aria-label="Next" onClick={()=>step(1)}>❘▶</button><button aria-label={'Repeat '+data.repeat} aria-pressed={data.repeat!=='Off'} onClick={()=>update(s=>({...s,repeat:s.repeat==='Off'?'Queue':s.repeat==='Queue'?'Track':'Off'}))}>↻{data.repeat==='Track'?'¹':''}</button></>;
 function startList(items:Track[],shuffle=false){if(items.length)play(shuffle?items[Math.floor(Math.random()*items.length)]:items[0],items,shuffle)}
 function exportData(){
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(latest.current)],{type:'application/json'}));link.download='aftertone-library.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
 }
 async function importData(file?:File){
  if(!file)return;
  try{
   const backup=JSON.parse(await file.text());
   if(!Array.isArray(backup.tracks)||!Array.isArray(backup.playlists)||!Array.isArray(backup.liked))throw Error();
   const metadata=new Map<string,Track>(backup.tracks.filter(t=>t&&typeof t.id==='string'&&['title','artist','album','genre','cover'].every(k=>typeof t[k]==='string')).map(t=>[t.id,t]));
   await update(s=>({...s,tracks:s.tracks.map(t=>{const m=metadata.get(t.id);return m?{...t,title:m.title,artist:m.artist,album:m.album,genre:m.genre,cover:m.cover,year:Number(m.year)||0,number:Number(m.number)||0}:t}),liked:[...new Set([...s.liked,...backup.liked.filter(id=>typeof id==='string')])],playlists:[...new Map([...s.playlists,...backup.playlists.filter(p=>p&&['id','name','description','cover'].every(k=>typeof p[k]==='string')&&Array.isArray(p.ids)&&p.ids.every(id=>typeof id==='string'))].map(p=>[p.id,p])).values()]}));
   notice('Metadata imported. Add the original MP3s to restore audio.');
  }catch{notice('Could not import this metadata file.')}
 }
 const title=playlist?.name||album?.[0].album||artist?.[0].artist||page;
 const favoriteArtists=Array.from(artists).sort((a,b)=>b[1].reduce((n,t)=>n+(plays.get(t.id)||0),0)-a[1].reduce((n,t)=>n+(plays.get(t.id)||0),0)).filter(([,ts])=>ts.some(t=>plays.has(t.id)||likes.has(t.id))).slice(0,6);
 const affinities=new Map(favoriteArtists.map(([name,ts])=>[name,ts.reduce((n,t)=>n+(plays.get(t.id)||0)+(likes.has(t.id)?3:0),0)]));
 const recommended=data.tracks.slice().sort((a,b)=>((affinities.get(b.artist)||0)-(plays.get(b.id)||0))-((affinities.get(a.artist)||0)-(plays.get(a.id)||0))).slice(0,6);
 return <div className={compact?'app compact':'app'} onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();upload(Array.from(e.dataTransfer.files))}}}>
  <input ref={uploadInput} hidden type="file" accept=".mp3,audio/mpeg" multiple onChange={e=>{upload(Array.from(e.target.files||[]));e.target.value=''}}/>
  <audio ref={audio} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>step(1,true)}/>
  <aside><button className="brand" onClick={()=>navigate('Home')}><span>◒</span><b>Aftertone</b></button><div className="side-label">COLLECTION</div><nav>{sections.map((s,i)=><button key={s} title={s} aria-current={page===s?'page':undefined} onClick={()=>navigate(s)}><i>{icons[i]}</i><span>{s}</span></button>)}</nav><button className="accent upload" disabled={!loaded||busy} onClick={()=>uploadInput.current?.click()}>＋ <span>Upload music</span></button></aside>
  <main><header><button aria-label="Toggle sidebar" onClick={()=>setCompact(!compact)}>☰</button><input aria-label="Search music" placeholder="Search tracks, artists, albums…" value={query} onChange={e=>{search(e.target.value);if(!playlist&&page!=='Search')go('Search')}}/><span>◉ Local library</span></header>
  <div className="content">{!loaded?<p>Opening your library…</p>:page==='Home'?<>
    <div className="hero"><div><small>YOUR PERSONAL MUSIC PLAYER</small><h1>Make it<br/>your frequency.</h1><p>All your music, together in one place.</p><button className="accent" onClick={()=>data.tracks.length?startList(data.tracks):uploadInput.current?.click()}>{data.tracks.length?'▶ Play library':'＋ Upload your MP3s'}</button></div><div className="disc"><span>◒</span></div></div>
    <h2>Recently added</h2>{rows(data.tracks,5)}
    <div className="shortcuts">{['Recently Played','Liked Songs','Playlists'].map((s,i)=><button key={s} onClick={()=>navigate(s)}>{['◷','♥','≡'][i]}　{s} <span>↗</span></button>)}</div>
    {recent.length>0&&<><h2>Recently played</h2>{rows(recent,5)}<h2>Frequently played</h2>{rows(ranked,5)}</>}
    {likes.size>0&&<><h2>Favorite songs</h2>{rows(data.tracks.filter(t=>likes.has(t.id)),5)}</>}
    {data.playlists.length>0&&<><h2>Your playlists</h2><div className="grid">{playlistTiles()}</div></>}
    {favoriteArtists.length>0&&<><h2>Favorite artists</h2><div className="grid">{artistTiles(new Map(favoriteArtists))}</div></>}
    {recommended.length>0&&<><h2>Recommended from your library</h2>{rows(recommended,6)}</>}
   </>:<><h1>{title}</h1>
   {page==='Settings'?<div className="settings">
    <h2>Appearance</h2><label>Light mode <input type="checkbox" checked={data.light} onChange={e=>update(s=>({...s,light:e.target.checked}))}/></label>
    <label>Accent color <input type="color" value={data.accent} onChange={e=>update(s=>({...s,accent:e.target.value}))}/><input aria-label="Hex accent" key={data.accent} defaultValue={data.accent} onBlur={e=>/^#[0-9a-f]{6}$/i.test(e.target.value)&&update(s=>({...s,accent:e.target.value}))}/></label>
    <h2>Playback</h2><label>Autoplay next track <input type="checkbox" checked={data.autoplay} onChange={e=>update(s=>({...s,autoplay:e.target.checked}))}/></label><p>Original MP3 audio{current?.bitrate?` · ${Math.round(current.bitrate/1000)} kbps`:''}</p>
    <h2>Library storage</h2><p>{(data.tracks.reduce((n,t)=>n+t.size,0)/1048576).toFixed(1)} MB of audio on this browser</p>
    <button onClick={exportData}>Export metadata</button><label>Import metadata <input type="file" accept=".json" onChange={e=>importData(e.target.files?.[0])}/></label>
    <button onClick={()=>confirm('Clear listening history and time?')&&update(s=>({...s,history:[],seconds:0}))}>Clear listening history</button>
    <h2>Keyboard shortcuts</h2><p>Space plays or pauses. Left and right arrows seek five seconds.</p>
   </div>:page==='Listening Statistics'?<>
    <div className="shortcuts"><div><strong>{format(data.seconds)}</strong> Listening time</div><div><strong>{data.tracks.length}</strong> Tracks</div><div><strong>{format(data.tracks.reduce((n,t)=>n+t.duration,0))}</strong> Library duration</div></div>
    <h2>Playback activity</h2><div className="chart">{Array.from({length:7},(_,i)=>{const date=new Date();date.setDate(date.getDate()-(6-i));const count=data.history.filter(h=>new Date(h.date).toDateString()===date.toDateString()).length;return <div key={i}><b>{count}</b><span style={{height:Math.max(3,Math.min(140,count*14))}}/><small>{date.toLocaleDateString(undefined,{weekday:'short'})}</small></div>})}</div>
    <h2>Most played tracks</h2>{rows(ranked,8)}<h2>Most played artists</h2><div className="grid">{artistTiles(new Map(favoriteArtists))}</div><h2>Most played albums</h2><div className="grid">{albumTiles(new Map(Array.from(groups(ranked,albumKey)).sort((a,b)=>b[1].reduce((n,t)=>n+(plays.get(t.id)||0),0)-a[1].reduce((n,t)=>n+(plays.get(t.id)||0),0)).slice(0,6)))}</div><h2>Recently played</h2>{rows(recent,8)}
   </>:page==='Albums'?<div className="grid">{albumTiles(albums)}</div>:page==='Artists'?<div className="grid">{artistTiles(artists)}</div>:page==='Playlists'?<>
    <button className="accent" onClick={newPlaylist}>＋ Create playlist</button> <select aria-label="Sort playlists" value={sort} onChange={e=>setSort(e.target.value)}><option>Newest</option><option>Alphabetical</option></select>
    <div className="grid">{tile('Liked Songs',`${likes.size} tracks`,undefined,()=>navigate('Liked Songs'))}{playlistTiles()}</div>
   </>:<>
    {(playlist||album||artist)&&<div className="detail"><Cover src={playlist?.cover||[...(album||artist||[])].find(t=>t.cover)?.cover} large/><div><p>{playlist?.description|| (album?`${album[0].artist} · ${album.find(t=>t.year)?.year||'Unknown year'}`:artist?`${artist.reduce((n,t)=>n+(plays.get(t.id)||0),0)} plays`:'')}</p><small>{list.length} tracks · {format(list.reduce((n,t)=>n+t.duration,0))}</small>{playlist&&<><input aria-label="Search playlist" placeholder="Search this playlist" value={query} onChange={e=>search(e.target.value)}/><button onClick={()=>edit(playlist)}>Edit playlist</button><button onClick={()=>{if(confirm('Delete this playlist?')){update(s=>({...s,playlists:s.playlists.filter(p=>p.id!==playlist.id)}));navigate('Playlists')}}}>Delete playlist</button></>}</div></div>}
    {page==='Search'&&term&&foundPlaylists.length>0&&<><h2>Playlists</h2><div className="grid">{playlistTiles()}</div></>}
    {list.length>0&&<div className="actions"><button className="accent" onClick={()=>startList(list)}>▶ Play {album?'album':''}</button><button onClick={()=>startList(list,true)}>⤨ Shuffle {album?'album':''}</button></div>}
    {rows(list)}
    {artist&&<><h2>Albums</h2><div className="grid">{albumTiles(groups(artist,albumKey))}</div></>}
   </>}</>}</div></main>
  <footer><button className="current" onClick={()=>setNow(true)}><Cover src={current?.cover}/><span><strong>{current?.title||'Nothing playing'}</strong><small>{current?.artist||'Upload music to get started'}</small></span></button><div className="transport"><div>{controls}</div><label><small>{format(time)}</small><input aria-label="Seek" type="range" min="0" max={audio.current?.duration||current?.duration||1} step=".1" value={time} disabled={!current} onChange={e=>audio.current!.currentTime=+e.target.value}/><small>{format(current?.duration||0)}</small></label></div><div className="extras"><button aria-label="Queue" onClick={()=>setShowQueue(!showQueue)}>≡</button><button aria-label={data.muted?'Unmute':'Mute'} onClick={()=>update(s=>({...s,muted:!s.muted}))}>{data.muted?'♩×':'♩'}</button><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={data.volume} onChange={e=>update(s=>({...s,volume:+e.target.value}))}/></div></footer>
  {now&&<section className="now" style={{'--art':color||data.accent} as React.CSSProperties}><div className="now-top"><button onClick={()=>setNow(false)}>↓ Back</button><button onClick={()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.().catch(()=>notice('Fullscreen is unavailable.'))}>⛶ Full screen</button><button onClick={()=>setShowQueue(!showQueue)}>≡ Queue</button></div><Cover src={current?.cover} large/><h1>{current?.title||'Nothing playing'}</h1><p>{current?.artist}</p>{data.visual!=='Off'&&<canvas width="640" height="150" ref={canvas}/>}<select aria-label="Visualizer style" value={data.visual} onChange={e=>update(s=>({...s,visual:e.target.value}))}>{['Frequency','Waveform','Circular','Minimal','Off'].map(s=><option key={s}>{s}</option>)}</select></section>}
  {showQueue&&<section className="queue"><button onClick={()=>setShowQueue(false)}>× Close</button><h2>Playback queue</h2>{queue.map((id,i)=>{const t=byId.get(id);return t&&<div key={i}><button onClick={()=>start(id,queue,i)}>{i===index?'▶ ':''}{t.title}</button><button aria-label="Remove from queue" onClick={()=>{setQueue(q=>q.filter((_,n)=>n!==i));if(i<=index)setIndex(n=>n-1)}}>×</button></div>})}</section>}
  {message&&<div className="toast" role="status">{message}<button onClick={()=>notice('')} aria-label="Dismiss">×</button></div>}
  {editor&&<div className="overlay"><form onSubmit={e=>{e.preventDefault();const saved=editor;if('title' in saved)update(s=>({...s,tracks:s.tracks.map(t=>t.id===saved.id?saved:t)}));else update(s=>({...s,playlists:s.playlists.some(p=>p.id===saved.id)?s.playlists.map(p=>p.id===saved.id?saved:p):[...s.playlists,saved]}));edit(null)}}><h2>{'title' in editor?'Edit track':'Playlist details'}</h2>
   {('title' in editor?['title','artist','album','genre','year','number']:['name','description']).map(k=><label key={k}>{k}<input required={k==='title'||k==='name'} type={k==='year'||k==='number'?'number':'text'} value={editor[k]} onChange={e=>edit({...editor,[k]:e.target.type==='number'?+e.target.value:e.target.value})}/></label>)}
   <label>Custom cover <input type="file" accept="image/*" onChange={async e=>{const file=e.target.files?.[0];if(file)try{const cover=await picture(file);edit(value=>value?.id===editor.id?{...value,cover}:value)}catch{notice('Could not load the cover.')}}}/></label><button className="accent" type="submit">Save</button><button type="button" onClick={()=>edit(null)}>Cancel</button></form></div>}
 </div>
}
createRoot(document.getElementById('root')!).render(<App/>);
