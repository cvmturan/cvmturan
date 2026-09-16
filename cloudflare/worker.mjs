import { accountRoute, cleanAccounts, readBody } from './accounts.mjs';
const SECURITY = { 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
const PRIVATE_ROBOTS = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
const MAX_ADDONS = 20;
const MAX_URLS_HEADER = 16000;
const BUILT_INS = [
  { id:'org.streamflix.catalog', name:'TShow Offline Catalog', resources:['catalog','meta'], types:['movie','series'], catalogs:[{type:'movie',id:'streamflix_movies',name:'Movies'},{type:'series',id:'streamflix_series',name:'Series'}], isBuiltIn:true },
  { id:'org.cvmturan.discovery', name:'TShow Discovery', resources:['catalog'], types:['movie','series'], idPrefixes:['tt'], catalogs:[{type:'movie',id:'top',name:'Popular movies'},{type:'series',id:'top',name:'Popular series'}], manifestURL:'https://cinemeta-catalogs.strem.io/top/manifest.json', isBuiltIn:true },
  { id:'org.streamflix.open-samples', name:'TShow Open Samples', resources:['stream'], types:['movie','series'], isBuiltIn:true },
  { id:'org.streamflix.cinemeta', name:'Cinemeta Search & Metadata', resources:['catalog','meta'], types:['movie','series'], idPrefixes:['tt'], catalogs:[{type:'movie',id:'top',name:'Movie search',extra:[{name:'search'}]},{type:'series',id:'top',name:'Series search',extra:[{name:'search'}]}], manifestURL:'https://v3-cinemeta.strem.io/manifest.json', isBuiltIn:true },
  { id:'org.stremio.watchhub', name:'WatchHub', resources:['stream'], types:['movie','series'], idPrefixes:['tt'], manifestURL:'https://watchhub.strem.io/manifest.json', isBuiltIn:true },
  { id:'org.stremio.opensubtitlesv3', name:'OpenSubtitles v3', resources:['subtitles'], types:['movie','series'], idPrefixes:['tt'], manifestURL:'https://opensubtitles-v3.strem.io/manifest.json', isBuiltIn:true },
  { id:'org.cvmturan.tvmaze', name:'TVmaze Series Search', resources:['catalog','meta'], types:['series'], idPrefixes:['tt','tvmaze:'], catalogs:[{type:'series',id:'search',name:'TVmaze search',extra:[{name:'search',isRequired:true}]}], isBuiltIn:true }
].map(normalizeManifest);

function json(value,status=200,headers={}) { return Response.json(value,{status,headers:{...SECURITY,...headers}}); }
async function browserResult(request, env) {
  if (request.method !== 'POST' || request.headers.get('origin') !== (env.APP_ORIGIN || 'https://showt.fun') || request.headers.get('x-tshow-request') !== '1') return error('Invalid request origin', 403);
  try {
    const body = JSON.parse(await readBody(request, 1024 * 1024));
    const manifestURL = remoteURL(body.manifestURL).href;
    if (!validManifest(body.manifest) || BUILT_INS.some(a => a.id === body.manifest.id)) return error('Invalid custom manifest');
    const manifest = normalizeManifest({ ...body.manifest, manifestURL }, { custom: true });
    if (body.resource === 'manifest') return json({ success: true, manifest });
    if (body.resource === 'stream') {
      const raw = Array.isArray(body.data?.streams) ? body.data.streams.slice(0, 100) : [];
      const streams = raw.map((s, i) => streamShape(s, manifest, i)).filter(Boolean).map(({_index, ...s}) => s);
      return json({ streams, source: { addonId: manifest.id, addonName: manifest.name, returned: raw.length, actionable: streams.length, unsupported: raw.length - streams.length, connection: 'browser' } });
    }
    return error('Unsupported browser resource');
  } catch { return error('Could not validate the browser add-on response', 400); }
}
async function contactDraft(request) {
  let body;
  try { body=JSON.parse(await readBody(request,8192)); } catch { return error('Invalid contact message',400); }
  if(!body || typeof body!=='object')return error('Invalid contact message',400);
  if(body.website)return json({message:'Your message was received.'},202);
  const recipients={support:'support@showt.fun',feedback:'support@showt.fun',copyright:'copyright@showt.fun',security:'legal@showt.fun'};
  if(!Object.hasOwn(recipients,body.type))return error('Choose a valid message type.');
  if(typeof body.name!=='string'||body.name.trim().length<2)return error('Enter your name.');
  if(typeof body.email!=='string'||! /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email))return error('Enter a valid email address.');
  if(typeof body.message!=='string'||body.message.trim().length<10||body.message.length>4000)return error('Enter a message of 10 to 4000 characters.');
  if(body.consent!==true)return error('Consent is required before preparing an email.');
  return json({success:true,fallback:'mailto',recipient:recipients[body.type],message:'Your email app will open. Press Send there to finish.'});
}
function error(message,status=400) { return json({error:message},status); }
function b64decode(value) { try { return new TextDecoder().decode(Uint8Array.from(atob(String(value).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))); } catch { return ''; } }
function customEntries(request) { const raw=request.headers.get('x-tshow-addon-urls')||''; if(!raw||raw.length>MAX_URLS_HEADER)return []; try { const values=JSON.parse(b64decode(raw));if(!Array.isArray(values))return [];const seen=new Set(),entries=[];for(const value of values){const manifestURL=typeof value==='string'?value:value?.manifestURL;if(typeof manifestURL!=='string'||manifestURL.length>8192||seen.has(manifestURL))continue;seen.add(manifestURL);entries.push({manifestURL,manifest:value?.manifest});if(entries.length===MAX_ADDONS)break;}return entries;} catch { return []; } }
function normalizeManifest(candidate,options={}) { const resources=Array.isArray(candidate?.resources)?candidate.resources.map(x=>typeof x==='string'?x:x?.name).filter(x=>typeof x==='string').map(x=>x.slice(0,80)).slice(0,30):[]; const catalogs=Array.isArray(candidate?.catalogs)?candidate.catalogs.filter(x=>x?.type&&x?.id).slice(0,100).map(x=>({type:String(x.type).slice(0,40),id:String(x.id).slice(0,120),name:String(x.name||x.id).slice(0,120),genres:Array.isArray(x.genres)?x.genres.map(String).slice(0,100):[],extra:Array.isArray(x.extra)?x.extra.filter(e=>e&&typeof e.name==='string').slice(0,30).map(e=>({name:e.name.slice(0,80),isRequired:e.isRequired===true,options:Array.isArray(e.options)?e.options.map(String).slice(0,100):[]})):[]})):[]; const h=candidate?.behaviorHints&&typeof candidate.behaviorHints==='object'?candidate.behaviorHints:{}; return {id:String(candidate?.id||''),name:String(candidate?.name||''),version:String(candidate?.version||'1.0.0').slice(0,40),description:String(candidate?.description||'').slice(0,500),resources,types:Array.isArray(candidate?.types)?candidate.types.map(String).slice(0,30):[],idPrefixes:Array.isArray(candidate?.idPrefixes)?candidate.idPrefixes.map(String).slice(0,50):[],catalogs,logo:typeof candidate?.logo==='string'?candidate.logo.slice(0,4000):null,behaviorHints:{configurable:h.configurable===true,configurationRequired:h.configurationRequired===true},manifestURL:candidate?.manifestURL||null,isBuiltIn:candidate?.isBuiltIn===true,isCustom:options.custom===true,isRemovable:options.custom===true}; }
function validManifest(x) { return x&&/^[a-z0-9._-]{3,120}$/i.test(x.id)&&x.name&&x.name.length<=100&&Array.isArray(x.resources)&&Array.isArray(x.types); }
function remoteURL(value) { let url; try { url=new URL(String(value||'').trim().replace(/^stremio:\/\//i,'https://')); } catch { throw new Error('Enter a complete HTTPS manifest URL'); } const host=url.hostname.toLowerCase(); if(url.protocol!=='https:'||url.username||url.password||url.href.length>8192||!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||/^[\d.:[\]]+$/.test(host)||/(^|\.)(internal|localdomain)(\.|$)/.test(host)) throw new Error('Only public HTTPS add-on URLs are allowed'); return url; }
async function remoteJSON(start,label='Add-on request failed',maxBytes=4*1024*1024) {
  let url=remoteURL(start);
  for(let redirectCount=0;redirectCount<=3;redirectCount++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    let response;
    try{
      response=await fetch(url,{
        headers:{Accept:'application/json, text/plain, */*'},
        redirect:'manual',
        signal:controller.signal
      });
      if(response.status===403){
        response.body?.cancel();
        response=await fetch(url,{
          headers:{
            Accept:'application/json, text/plain, */*',
            'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36'
          },
          redirect:'manual',
          signal:controller.signal
        });
      }
    }catch{
      throw new Error(label+': request failed');
    }finally{
      clearTimeout(timer);
    }
    if(response.status>=300&&response.status<400){
      if(redirectCount===3||!response.headers.get('location'))throw new Error(label+': too many redirects');
      url=remoteURL(new URL(response.headers.get('location'),url).href);
      continue;
    }
    if(response.status===403)throw new Error(label+': this provider blocks Cloudflare web requests (403)');
    if(!response.ok)throw new Error(label+': provider returned '+response.status);
    if(Number(response.headers.get('content-length')||0)>maxBytes)throw new Error(label+': response is too large');
    const text=await readBody(response,maxBytes);
    if(text.length>maxBytes)throw new Error(label+': response is too large');
    try{return {data:JSON.parse(text),finalURL:url.href};}
    catch{throw new Error(label+': provider did not return JSON');}
  }
}
function resourceURL(manifestURL,resource,type,id,extra={}) { const url=remoteURL(manifestURL);url.hash='';url.search='';url.pathname=url.pathname.replace(/\/manifest\.json\/?$/i,'');const base=`${url.pathname.replace(/\/$/,'')}/${encodeURIComponent(resource)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;const args=Object.entries(extra).filter(([,v])=>v!=null&&String(v).length<=300).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');url.pathname=resource==='catalog'&&args?`${base}/${args}.json`:`${base}.json`;return url.href; }
async function contextAddons(request) { const results=await Promise.all(customEntries(request).map(async entry=>{try{const manifestURL=remoteURL(entry.manifestURL).href;if(validManifest(entry.manifest)&&!BUILT_INS.some(x=>x.id===entry.manifest.id))return normalizeManifest({...entry.manifest,manifestURL},{custom:true});const r=await remoteJSON(manifestURL,'Could not fetch the manifest',1024*1024);if(!validManifest(r.data)||BUILT_INS.some(x=>x.id===r.data.id))return null;return normalizeManifest({...r.data,manifestURL:r.finalURL},{custom:true});}catch{return null;}}));return [...BUILT_INS,...results.filter(Boolean)]; }
function addonFor(addons,id) { return addons.find(x=>x.id===id); }
async function tmdb(env,path,params={}) { if(!env.TMDB_API_KEY)throw new Error('TMDB metadata is temporarily unavailable');const url=new URL('https://api.themoviedb.org/3'+path);for(const[k,v]of Object.entries(params))if(v!=null&&String(v).length<=500)url.searchParams.set(k,v);url.searchParams.set('api_key',env.TMDB_API_KEY);const response=await fetch(url);if(!response.ok)throw new Error('TMDB metadata is temporarily unavailable');return response.json(); }
export function cacheTTL(request) { if(request.method!=='GET'||request.headers.has('authorization')||request.headers.has('cookie')||request.headers.has('range'))return 0;const p=new URL(request.url).pathname;if(p==='/api/health'||p==='/api/tmdb/health')return 60;if(p.startsWith('/api/tmdb/')&&!p.includes('/search')&&!p.includes('/image/'))return 900;if(p.startsWith('/api/addons/catalog/org.cvmturan.discovery/'))return 14400;return 0; }
function security(response,url,cacheStatus) { const h=new Headers(response.headers);for(const[k,v]of Object.entries(SECURITY))h.set(k,v);if(url.pathname.startsWith('/api/')||['list','calendar','history','addons','settings','help'].includes(url.searchParams.get('view')))h.set('X-Robots-Tag',PRIVATE_ROBOTS);if(cacheStatus)h.set('X-TShow-Edge-Cache',cacheStatus);return new Response(response.body,{status:response.status,headers:h}); }
async function cached(request,ctx,handler) { const ttl=cacheTTL(request),url=new URL(request.url),key=new Request(url.href,{headers:{Accept:'application/json'}}),store=globalThis.caches?.default;if(ttl&&store){const hit=await store.match(key);if(hit)return security(hit,url,'HIT');}const response=await handler();const result=security(response,url,ttl?'MISS':'BYPASS');if(ttl&&store&&result.ok){const copy=result.clone();copy.headers.set('Cache-Control',`public, max-age=60, s-maxage=${ttl}`);ctx.waitUntil(store.put(key,copy));}return result; }
function safeURL(v) { try { const u=new URL(String(v||''));return ['https:','http:'].includes(u.protocol)&&u.href.length<=8000?u.href:null;}catch{return null;} }
function magnet(v) { try{const u=new URL(String(v||''));return u.protocol==='magnet:'&&/^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(u.searchParams.get('xt')||'')?u.href:null;}catch{return null;} }
function parseSizeHint(...values) {
  for (const value of values) {
    const match = String(value || '').match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB|TiB|GiB|MiB|KiB)(?:\s|$)/i);
    if (!match) continue;
    const unit = match[2].toUpperCase().replace('IB', 'B');
    const factor = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit];
    const bytes = Number(match[1]) * factor;
    if (Number.isFinite(bytes) && bytes > 0) return Math.round(bytes);
  }
  return null;
}
function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** order);
  return `${value >= 10 || order === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[order]}`;
}
function streamShape(raw, addon, index) {
  if (!raw || typeof raw !== 'object') return null;
  const source = safeURL(raw.url);
  const external = safeURL(raw.externalUrl) || (raw.ytId && /^[\w-]{6,20}$/.test(raw.ytId) ? `https://www.youtube.com/watch?v=${raw.ytId}` : null);
  const app = magnet(raw.url) || (/^(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(String(raw.infoHash || '')) ? `magnet:?xt=urn:btih:${raw.infoHash}` : null);
  const path = (source || '').split(/[?#]/)[0].toLowerCase();
  const declared = String(raw.type || raw.mimeType || '').toLowerCase();
  const format = /m3u8$/.test(path) || /mpegurl|hls/.test(declared) ? 'hls' : /\.(mp4|m4v)$/.test(path) || /mp4/.test(declared) ? 'mp4' : /\.webm$/.test(path) || /webm/.test(declared) ? 'webm' : /\.mkv$/.test(path) || /matroska/.test(declared) ? 'mkv' : '';
  const hints = raw.behaviorHints && typeof raw.behaviorHints === 'object' ? raw.behaviorHints : {};
  const requestedHeaders = hints.proxyHeaders?.request;
  const headers = requestedHeaders && typeof requestedHeaders === 'object' && Object.keys(requestedHeaders).length ? requestedHeaders : null;
  const notWebReady = hints.notWebReady === true;
  // notWebReady is advisory; let the browser determine actual codec support.
  const nonVideo = /\.(?:html?|xhtml|zip|rar|7z|tar|gz|mpd)$/.test(path) || /text\/html|application\/(?:zip|x-rar|dash)/.test(declared);
  const direct = Boolean(source && source.startsWith('https:') && !headers && !nonVideo);
  const attempt = false;
  const mode = direct ? (format === 'hls' ? 'hls' : 'direct') : app ? 'external-app' : external ? 'external' : source ? 'external-player' : 'unsupported';
  const reportedBytes = [hints.videoSize, raw.sizeBytes, raw.size].map(Number).find((value) => Number.isFinite(value) && value > 0);
  const sizeBytes = reportedBytes || parseSizeHint(raw.name, raw.title, raw.description, hints.filename);
  if (!source && !external && !app) return null;
  return {url:direct?source:null,externalPlayerUrl:source,externalAppUrl:app,attemptUrl:attempt?source:null,externalUrl:external,ytId:raw.ytId||null,name:String(raw.name||raw.title||addon.name).slice(0,140),title:String(raw.title||raw.name||'Web stream').slice(0,240),description:String(raw.description||'').slice(0,500),quality:String(raw.quality||'').slice(0,20),sizeBytes:sizeBytes||null,sizeLabel:formatSize(sizeBytes),type:format==='hls'?'application/vnd.apple.mpegurl':format==='mp4'?'video/mp4':format==='webm'?'video/webm':'',format,playbackMode:mode,browserReady:direct,requiresHeaders:Boolean(headers),notWebReady,unsupportedReason:direct||attempt?null:headers?'This source requires provider-specific headers, so TShow will not relay it.':source?'Open this source in the local TShow Player or another external player.':app?'This is a torrent-only result. Outplayer and VLC need the add-on to return a direct HTTP video URL, usually through a configured debrid provider.':null,subtitles:Array.isArray(raw.subtitles)?raw.subtitles.filter(x=>safeURL(x?.url)).slice(0,30):[],directFromProvider:direct,behaviorHints:hints,isDemo:addon.id==='org.streamflix.open-samples',sourceAddon:addon.id,sourceAddonName:addon.name,_index:index};
}
function compactCatalog(data, typeHint = '') {
  const items = Array.isArray(data?.metas) ? data.metas : Array.isArray(data?.results) ? data.results : [];
  const metas = items.slice(0, 100).map((meta) => {
    if (!meta || typeof meta !== 'object') return null;
    const id = String(meta.id || meta.imdb_id || '').slice(0, 180);
    const name = String(meta.name || meta.title || '').slice(0, 240);
    if (!id || !name) return null;
    const rating = Number(meta.imdbRating ?? meta.vote_average);
    return {
      id,
      imdb_id: /^tt\d+$/i.test(String(meta.imdb_id || id)) ? String(meta.imdb_id || id) : null,
      type: ['movie', 'series'].includes(meta.type) ? meta.type : typeHint,
      name,
      poster: safeURL(meta.poster || meta.poster_path),
      background: safeURL(meta.background || meta.backdrop_path),
      description: String(meta.description || meta.overview || '').slice(0, 1500),
      releaseInfo: String(meta.releaseInfo || meta.release_date || meta.first_air_date || meta.year || '').slice(0, 40),
      imdbRating: Number.isFinite(rating) ? rating : 0,
      moviedb_id: Number(meta.moviedb_id || meta.tmdb_id) || null,
      genres: (Array.isArray(meta.genres) ? meta.genres : []).map(String).slice(0, 12),
      runtime: Number(meta.runtime) || null
    };
  }).filter(Boolean);
  return { metas, hasMore: Boolean(data?.hasMore), cacheMaxAge: Math.max(0, Number(data?.cacheMaxAge) || 0) };
}
async function addonResource(addons,addonId,resource,type,id,extra={}) { const addon=addonFor(addons,addonId);if(!addon)throw new Error('Add-on is unavailable');if(addon.id==='org.streamflix.open-samples'&&resource==='stream')return {streams:[{url:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',type:'mp4',name:'Player test · 540p',title:'Flower · MDN CC0 sample'}]};if(!addon.manifestURL)throw new Error('This offline add-on does not provide a remote endpoint');const data=(await remoteJSON(resourceURL(addon.manifestURL,resource,type,id,extra))).data;return resource==='catalog'?compactCatalog(data,type):data; }
function tvmazeMeta(show,requestedId=null) { if(!show?.id||!show?.name)return null;const imdb=/^tt\d+$/i.test(show.externals?.imdb||'')?show.externals.imdb:null,id=imdb||requestedId||`tvmaze:${show.id}`;return {id,imdb_id:imdb,type:'series',name:String(show.name).slice(0,240),description:String(show.summary||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(),releaseInfo:String(show.premiered||'').slice(0,4),poster:show.image?.original||show.image?.medium||null,background:show.image?.original||null,imdbRating:Number(show.rating?.average)||0,genres:Array.isArray(show.genres)?show.genres.slice(0,20):[],runtime:Number(show.averageRuntime||show.runtime)||null,videos:[],behaviorHints:{},links:show.url?[{name:'TVmaze',category:'source',url:show.url}]:[]}; }
async function tvmazeSearch(query) { const r=await fetch('https://api.tvmaze.com/search/shows?q='+encodeURIComponent(String(query||'').slice(0,120)));if(!r.ok)throw new Error('TVmaze search failed');return {metas:(await r.json()).slice(0,20).map(x=>tvmazeMeta(x.show)).filter(Boolean)}; }
async function apiRoute(request,env) { const url=new URL(request.url),p=url.pathname,method=request.method;if(p==='/api/health')return json({status:'ok',hostScope:'cloudflare',tmdbConfigured:Boolean(env.TMDB_API_KEY),mediaRelay:false});if(p==='/api/contact'&&method==='POST')return contactDraft(request);if(p.startsWith('/api/proxy')||p.startsWith('/api/transcode')||p.startsWith('/api/debrid'))return error('This route is intentionally unavailable. TShow does not proxy, transcode, download, or debrid media.',410);if(p==='/api/tmdb/health')return json({status:'ok',tmdbKey:Boolean(env.TMDB_API_KEY)});
 if(p.startsWith('/api/tmdb/')){const rest=p.slice(10),bits=rest.split('/').filter(Boolean);try{let data;if(rest.startsWith('resolve/')){const id=bits[1],type=url.searchParams.get('type');if(!/^tt\d{5,12}$/.test(id)||!['movie','tv'].includes(type))return error('Invalid title identifier');data=await tmdb(env,`/find/${id}`,{external_source:'imdb_id'});return json({id:data[type==='tv'?'tv_results':'movie_results']?.[0]?.id||null,type});}if(rest.startsWith('trending/'))data=await tmdb(env,`/trending/${bits[1]||'all'}/${bits[2]||'week'}`);else if(rest==='popular/movies')data=await tmdb(env,'/movie/popular',{page:url.searchParams.get('page')||1});else if(rest==='popular/tv')data=await tmdb(env,'/tv/popular',{page:url.searchParams.get('page')||1});else if(rest==='top-rated/movies')data=await tmdb(env,'/movie/top_rated',{page:url.searchParams.get('page')||1});else if(rest==='top-rated/tv')data=await tmdb(env,'/tv/top_rated',{page:url.searchParams.get('page')||1});else if(rest==='now-playing/movies')data=await tmdb(env,'/movie/now_playing',{page:url.searchParams.get('page')||1});else if(rest==='airing-today/tv')data=await tmdb(env,'/tv/airing_today',{page:url.searchParams.get('page')||1});else if(rest==='search'){const q=url.searchParams.get('query');if(!q||q.length>120)return error('Query parameter required');const t=url.searchParams.get('type')||'multi';data=await tmdb(env,`/search/${t==='tv'?'tv':t==='movie'?'movie':'multi'}`,{query:q,page:url.searchParams.get('page')||1});}else if(rest.startsWith('discover/'))data=await tmdb(env,`/discover/${bits[1]==='tv'?'tv':'movie'}`,Object.fromEntries(url.searchParams));else if(rest.startsWith('genres/'))data=await tmdb(env,`/genre/${bits[1]==='tv'?'tv':'movie'}/list`);else if(rest.startsWith('watch-providers/')){const[type,id]=[bits[1],bits[2]],country=(url.searchParams.get('country')||'IN').toUpperCase();if(!['movie','tv'].includes(type)||!/^\d+$/.test(id)||!/^[A-Z]{2}$/.test(country))return error('A valid title and country are required');const x=await tmdb(env,`/${type}/${id}/watch/providers`),region=x.results?.[country]||{},list=a=>Array.isArray(a)?a.slice(0,30).map(v=>({id:v.provider_id,name:v.provider_name,logo_path:v.logo_path,priority:v.display_priority})):[];return json({available:true,country,link:region.link||null,providers:{stream:list(region.flatrate),free:list(region.free),ads:list(region.ads),rent:list(region.rent),buy:list(region.buy)},attribution:'Watch availability data powered by JustWatch via TMDB.'});}else if(bits[0]==='movie'&&/^\d+$/.test(bits[1]))data=await tmdb(env,`/movie/${bits[1]}`,{append_to_response:url.searchParams.get('append_to_response')||'credits,videos,images,recommendations,similar,keywords,external_ids'});else if(bits[0]==='tv'&&/^\d+$/.test(bits[1])){const suffix=bits.slice(2).join('/');data=await tmdb(env,`/tv/${bits[1]}${suffix?'/'+suffix:''}`,suffix?{}:{append_to_response:url.searchParams.get('append_to_response')||'credits,videos,images,recommendations,similar,keywords,external_ids'});}else if(bits[0]==='person'&&/^\d+$/.test(bits[1]))data=await tmdb(env,`/person/${bits[1]}${bits[2]==='credits'?'/combined_credits':''}`);else return error('API route not found',404);return json(data);}catch(e){return error(e.message,503);}}
 if(p.startsWith('/api/addons')){const addons=await contextAddons(request);if(p==='/api/addons'&&method==='GET')return json({addons,count:addons.length});if(p==='/api/addons/manifests')return json({manifests:addons,count:addons.length});if(p==='/api/addons/install'&&method==='POST'){try{const body=await request.json(),r=await remoteJSON(body.manifestURL,'Could not fetch the manifest',1024*1024);if(!validManifest(r.data)||BUILT_INS.some(x=>x.id===r.data.id))return error('Invalid or reserved add-on manifest');return json({success:true,manifest:normalizeManifest({...r.data,manifestURL:r.finalURL},{custom:true})});}catch(e){return error(e.message,502);}}if(p==='/api/addons/sync'&&method==='POST'){try{const body=await request.json(),urls=Array.isArray(body.manifestURLs)?body.manifestURLs.slice(0,MAX_ADDONS):[],manifests=(await Promise.all(urls.map(async u=>{try{const saved=addons.find(a=>a.isCustom&&a.manifestURL===u);if(saved)return saved;const r=await remoteJSON(u,'Could not fetch the manifest',1024*1024);return validManifest(r.data)&&!BUILT_INS.some(x=>x.id===r.data.id)?normalizeManifest({...r.data,manifestURL:r.finalURL},{custom:true}):null;}catch{return null;}}))).filter(Boolean);return json({success:true,addons:[...BUILT_INS,...manifests],errors:[]});}catch{return error('Could not restore saved add-ons',502);}}if(/^\/api\/addons\/[^/]+$/.test(p)&&method==='DELETE')return json({success:true});const b=p.slice(12).split('/');try{if(b[0]==='search'){const q=url.searchParams.get('query')||'',groups=[];for(const addon of addons)for(const catalog of addon.catalogs||[])if(catalog.extra?.some(x=>x.name==='search'))try{groups.push({addon:{id:addon.id,name:addon.name},catalog:{id:catalog.id,name:catalog.name},type:catalog.type,data:addon.id==='org.cvmturan.tvmaze'?await tvmazeSearch(q):await addonResource(addons,addon.id,'catalog',catalog.type,catalog.id,{search:q})});}catch{}return json({groups,errors:[],providers:[...new Set(groups.map(x=>x.addon.name))]});}if(b[0]==='catalog'){const data=b[1]==='org.cvmturan.tvmaze'?await tvmazeSearch(url.searchParams.get('search')):await addonResource(addons,b[1],'catalog',b[2],b[3],Object.fromEntries(url.searchParams));return json(data);}if(b[0]==='meta')return json(await addonResource(addons,b[1],'meta',b[2],b[3]));if(b[0]==='streams')return json(await addonResource(addons,b[1],'stream',b[2],b[3]));if(b[0]==='manifest'){const a=addonFor(addons,b[1]);return a?json(a):error('Addon not found',404);}}catch(e){return error(e.message,502);}return error('API route not found',404);}

 if(p.startsWith('/api/streams/subtitles/')){
   const parts=p.split('/');const type=parts[4];let id;try{id=decodeURIComponent(parts[5]||'');}catch{return error('Invalid media id');}
   if(!['movie','series','tv'].includes(type)||!id)return error('Invalid media id');
   const addons=(await contextAddons(request)).filter(a=>a.resources.includes('subtitles')&&(!a.types.length||a.types.includes(type==='tv'?'series':type)));
   const groups=await Promise.all(addons.slice(0,20).map(async addon=>{try{const data=await addonResource(addons,addon.id,'subtitles',type==='tv'?'series':type,id);return {name:addon.name,subtitles:(Array.isArray(data.subtitles)?data.subtitles:[]).filter(s=>safeURL(s?.url)?.startsWith('https:')).slice(0,60).map(s=>({url:s.url,lang:String(s.lang||'').slice(0,12),label:String(s.lang||'Subtitles').slice(0,60),provider:addon.name}))};}catch(e){return {name:addon.name,subtitles:[],error:e.message};}}));
   return json({subtitles:groups.flatMap(g=>g.subtitles).slice(0,120),providers:groups.map(({subtitles,...g})=>g)});
 }
 if(p.startsWith('/api/streams/')){const[,,,type,encodedId]=p.split('/');let id;try{id=decodeURIComponent(encodedId||'');}catch{return error('Invalid media id');}if(!['movie','series','tv'].includes(type)||!id)return error('Invalid media id');const addons=await contextAddons(request),selected=(url.searchParams.get('addonIds')||'').split(',').filter(Boolean),usable=addons.filter(a=>(!selected.length||selected.includes(a.id))&&a.resources.includes('stream')&&(!a.types.length||a.types.includes(type==='tv'?'series':type))&&(!a.idPrefixes.length||a.idPrefixes.some(x=>id.startsWith(x))));const sources=await Promise.all(usable.slice(0,20).map(async a=>{try{const raw=(await addonResource(addons,a.id,'stream',type==='tv'?'series':type,id)).streams||[],streams=raw.map((s,i)=>streamShape(s,a,i)).filter(Boolean).slice(0,100);return {addonId:a.id,addonName:a.name,streams,returned:raw.length,actionable:streams.length,unsupported:Math.max(0,raw.length-streams.length)};}catch(e){return {addonId:a.id,addonName:a.name,streams:[],returned:0,actionable:0,unsupported:0,error:e.message};}})),streams=sources.flatMap(x=>x.streams).sort((a,b)=>Number(b.browserReady)-Number(a.browserReady)||String(a.name).localeCompare(String(b.name))).map(({_index,...x})=>x);return json({streams,sources:sources.map(({streams,...x})=>x),count:streams.length});}return error('API route not found',404); }
export default { async scheduled(_event,env,ctx) { ctx.waitUntil(cleanAccounts(env)); }, async fetch(request,env,ctx) { const url=new URL(request.url);if(url.hostname==='www.showt.fun'){url.hostname='showt.fun';return Response.redirect(url.href,308);}if(url.pathname==='/api/addons/browser-result')return browserResult(request,env);if(url.pathname.startsWith('/api/auth/')||url.pathname.startsWith('/api/account'))return accountRoute(request,env);if(url.pathname==='/api'||url.pathname.startsWith('/api/'))return cached(request,ctx,()=>apiRoute(request,env));const title=url.pathname.match(/^\/(movie|series)\/(\d{1,12}|tt\d{5,12})(?:\/[^/]*)?\/?$/i);if(title){const target=new URL('/',url);target.searchParams.set('title',`${title[1].toLowerCase()==='series'?'tv':'movie'}:${title[2]}`);target.searchParams.set('full','1');return new Response(null,{status:302,headers:{Location:target.href,...SECURITY}});}return security(await env.ASSETS.fetch(request),url); } };
