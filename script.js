const apiKey = "7ef03bd0c305f128db814368cb78a12c";
const searchInput = document.getElementById("search");
const resultsDiv = document.getElementById("results");
let currentPage = 1;
let currentQuery = "";
let loading = false;
let newAdditionsPage = 1;
let newAdditionsLoading = false;
let currentVideoState = {
  id: null, mediaType: null, season: null, episode: null,
  itemTitle: null, totalEpisodesInSeason: 0, totalSeasons: 0
};
let currentPlaybackLinks = [];
let currentLinkIndex = 0;

// STORAGE KEYS
const STORAGE_WATCHED = "movieBrowser_watched";
const STORAGE_WATCHLIST = "movieBrowser_watchlist";

// ========== ALTERNATE VIDEO LINKS ==========
let alternateLinks = new Map();
let tvAlternateLinks = new Map();

async function loadAlternateLinks() {
  try {
    const response = await fetch('movielinks.csv');
    if (!response.ok) return;
    const csvText = await response.text();
    csvText.trim().split('\n').forEach((line, index) => {
      if (index === 0) return;
      const [tmdbId, links] = line.split(',').map(s => s.trim());
      if (tmdbId && links) {
        alternateLinks.set(tmdbId, links.split('|').map(l => l.trim()).filter(Boolean));
      }
    });
  } catch (e) { console.warn('movielinks.csv load failed:', e); }
}

async function loadTvAlternateLinks() {
  try {
    const response = await fetch('tvlinks.csv');
    if (!response.ok) return;
    const csvText = await response.text();
    csvText.trim().split('\n').forEach((line, index) => {
      if (index === 0) return;
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 4) {
        const [id, season, episode, links] = parts;
        const key = `${id}_${season}_${episode}`;
        tvAlternateLinks.set(key, links.split('|').map(l => l.trim()).filter(Boolean));
      }
    });
  } catch (e) { console.warn('tvlinks.csv load failed:', e); }
}

// ========== TRAILERDB INTEGRATION ==========
let trailerCache = new Map();

async function getImdbId(tmdbId, mediaType) {
  try {
    const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
    const res = await fetch(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${apiKey}&language=en-US`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.imdb_id || null;
  } catch (e) {
    console.warn(`Failed to fetch IMDB ID for ${mediaType} ${tmdbId}:`, e);
    return null;
  }
}

async function getTrailerFromTrailerDb(imdbId) {
  try {
    const res = await fetch(`https://trailerdb.org/data/movie/${imdbId}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const trailers = data.trailers || [];
    let best = trailers.find(t => t.type === 'trailer' && t.language === 'en' && t.is_official === true)
              || trailers.find(t => t.type === 'trailer' && t.language === 'en')
              || trailers.find(t => t.type === 'trailer' && t.is_official === true)
              || trailers.find(t => t.type === 'trailer');
    if (best?.youtube_id) {
      return `https://www.youtube.com/embed/${best.youtube_id}?rel=0&modestbranding=1&autoplay=1`;
    }
    return null;
  } catch (e) {
    console.warn(`Failed to fetch trailer for IMDB ${imdbId}:`, e);
    return null;
  }
}

async function fetchTrailerUrl(tmdbId, mediaType) {
  const cacheKey = `${tmdbId}_${mediaType}`;
  if (trailerCache.has(cacheKey)) return trailerCache.get(cacheKey);
  const imdbId = await getImdbId(tmdbId, mediaType);
  if (!imdbId) { trailerCache.set(cacheKey, null); return null; }
  const url = await getTrailerFromTrailerDb(imdbId);
  trailerCache.set(cacheKey, url || null);
  return url;
}

// ========== WATCH DATA MANAGEMENT ==========
function getWatchedData() { return JSON.parse(localStorage.getItem(STORAGE_WATCHED) || "{}"); }
function saveWatchedData(data) { localStorage.setItem(STORAGE_WATCHED, JSON.stringify(data)); }
function getWatchlist() { return JSON.parse(localStorage.getItem(STORAGE_WATCHLIST) || "[]"); }
function saveWatchlist(data) { localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(data)); }

function addToWatched(item, season = null, episode = null) {
  const watched = getWatchedData();
  const key = `${item.media_type}_${item.id}`;
  const existing = watched[key];
  if (season === 0) {
    if (existing) { existing.lastWatched = Date.now(); watched[key] = existing; saveWatchedData(watched); }
    return;
  }
  watched[key] = {
    id: item.id, media_type: item.media_type, title: item.title || item.name,
    poster_path: item.poster_path, currentSeason: season, currentEpisode: episode,
    addedAt: existing ? existing.addedAt : Date.now(), lastWatched: Date.now()
  };
  saveWatchedData(watched);
}

function updateTVEpisode(id, mediaType, currentSeason, currentEpisode) {
  if (currentSeason === 0) return;
  const watched = getWatchedData();
  const key = `${mediaType}_${id}`;
  if (watched[key]) {
    watched[key].currentSeason = currentSeason;
    watched[key].currentEpisode = currentEpisode;
    watched[key].lastWatched = Date.now();
    saveWatchedData(watched);
  }
}

function removeFromWatched(id, mediaType, season = null, episode = null) {
  const watched = getWatchedData();
  delete watched[`${mediaType}_${id}`];
  saveWatchedData(watched);
}
function addToWatchlist(item) {
  const watchlist = getWatchlist();
  if (!watchlist.some(w => w.id === item.id && w.media_type === item.media_type)) {
    watchlist.push(item); saveWatchlist(watchlist);
  }
}
function removeFromWatchlist(item) {
  saveWatchlist(getWatchlist().filter(w => !(w.id === item.id && w.media_type === item.media_type)));
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function saveVideoTimestamp(id, mediaType, season, episode, timestamp) {
  localStorage.setItem(`videoProgress_${mediaType}_${id}_${season || 0}_${episode || 0}`, timestamp.toString());
}
function loadVideoTimestamp(id, mediaType, season, episode) {
  return parseFloat(localStorage.getItem(`videoProgress_${mediaType}_${id}_${season || 0}_${episode || 0}`)) || 0;
}

function attachTimestampSaving(videoEl, id, mediaType, season, episode) {
  let lastSaved = 0;
  const save = () => {
    const t = videoEl.currentTime;
    if (t - lastSaved >= 5) { saveVideoTimestamp(id, mediaType, season, episode, t); lastSaved = t; }
  };
  videoEl.addEventListener('timeupdate', save);
  videoEl.addEventListener('pause', save);
  videoEl.addEventListener('ended', () => saveVideoTimestamp(id, mediaType, season, episode, videoEl.duration));
}

function attachDebugTimeline(videoEl, id, mediaType, season, episode, autoResume = true) {
  const debugEl = document.getElementById('video-timeline-debug');
  if (!debugEl) return;
  debugEl.style.display = 'block';
  const saved = loadVideoTimestamp(id, mediaType, season, episode);
  if (saved > 0 && autoResume) {
    debugEl.innerHTML = `🔍 Debug: Loading... <br>📍 Saved: ${formatTime(saved)} (auto-resuming)`;
    videoEl.addEventListener('loadedmetadata', () => setTimeout(() => { videoEl.currentTime = saved; }, 300));
  }
  const updateDebug = () => debugEl.innerHTML = `🔍 Debug: ${formatTime(videoEl.currentTime)} / ${formatTime(videoEl.duration)}`;
  videoEl.addEventListener('loadedmetadata', updateDebug);
  videoEl.addEventListener('timeupdate', updateDebug);
  attachTimestampSaving(videoEl, id, mediaType, season, episode);
}

// ========== VIDEO PLAYER ==========
function renderVideoPlayer(src, id, mediaType, season, episode, autoResume = true) {
  const container = document.querySelector(".video-container");
  if (!container) return;
  container.innerHTML = '';
  const videoEl = document.createElement('video');
  videoEl.id = 'videoPlayer';
  videoEl.src = src;
  videoEl.controls = true;
  videoEl.autoplay = true;
  videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
  container.appendChild(videoEl);
  
  attachDebugTimeline(videoEl, id, mediaType, season, episode, autoResume);
  videoEl.addEventListener('ended', () => handleVideoEnded(id, mediaType, season, episode));

  if (currentPlaybackLinks.length > 1 && currentLinkIndex < currentPlaybackLinks.length - 1) {
    const btn = document.createElement('button');
    btn.className = 'fallback-link-btn';
    btn.textContent = '⚠️ Click if having loading problems';
    btn.onclick = () => { currentLinkIndex++; renderVideoPlayer(currentPlaybackLinks[currentLinkIndex], id, mediaType, season, episode, true); };
    container.appendChild(btn);
  }
}

function setVideoSource(id, mediaType, season, episode, fallbackUrl, autoResume = true) {
  const container = document.querySelector(".video-container");
  if (!container) return;
  container.innerHTML = '';
  const links = (mediaType === 'tv' && season !== null && episode !== null)
      ? tvAlternateLinks.get(`${id}_${season}_${episode}`)
      : alternateLinks.get(String(id));

  if (links && links.length > 0 && links[0].toLowerCase().endsWith('.mp4')) {
    currentPlaybackLinks = links;
    currentLinkIndex = 0;
    renderVideoPlayer(links[0], id, mediaType, season, episode, autoResume);
  } else {
    currentPlaybackLinks = [];
    const iframe = document.createElement('iframe');
    iframe.allowFullscreen = true;
    iframe.src = fallbackUrl;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
    container.appendChild(iframe);
  }
}

// ========== AUTO-PLAY COUNTDOWN POPUP ==========
let countdownInterval = null;

function cleanupCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  const el = document.getElementById('countdownPopup');
  if (el) el.remove();
}

function showCountdownPopup(text, onConfirm) {
  cleanupCountdown();
  const overlay = document.createElement('div');
  overlay.id = 'countdownPopup';
  overlay.className = 'countdown-overlay';
  overlay.innerHTML = `
    <div class="countdown-box">
      <div class="countdown-title" id="cd-title">${text}</div>
      <div class="countdown-timer" id="cd-timer">10</div>
      <div class="countdown-actions">
        <button class="countdown-btn btn-go" id="cd-go">Go now</button>
        <button class="countdown-btn btn-cancel" id="cd-cancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let count = 10;
  const timerEl = document.getElementById('cd-timer');
  const titleEl = document.getElementById('cd-title');

  countdownInterval = setInterval(() => {
    count--;
    if (count <= 0) { clearInterval(countdownInterval); cleanupCountdown(); onConfirm(); }
    else { timerEl.textContent = count; titleEl.textContent = `${text} ${count}...`; }
  }, 1000);

  document.getElementById('cd-go').onclick = () => { clearInterval(countdownInterval); cleanupCountdown(); onConfirm(); };
  document.getElementById('cd-cancel').onclick = cleanupCountdown;
  overlay.onclick = (e) => { if (e.target === overlay) cleanupCountdown(); };
}

function handleVideoEnded(id, mediaType, season, episode) {
  if (mediaType !== 'tv') return;
  const isExtra = season === 0;
  const nextE = episode + 1;
  let nextS = season;
  let isNewSeason = false;

  if (episode >= currentVideoState.totalEpisodesInSeason) {
    if (isExtra) return; // End of extras
    if (season >= currentVideoState.totalSeasons) return; // End of series
    nextS = season + 1;
    isNewSeason = true;
  }

  const currentHasLink = tvAlternateLinks.get(`${id}_${season}_${episode}`)?.some(l => l.endsWith('.mp4'));
  const nextHasLink = tvAlternateLinks.get(`${id}_${nextS}_${isExtra ? nextE : 1}`)?.some(l => l.endsWith('.mp4'));
  if (!currentHasLink || !nextHasLink) return;

  const msg = isExtra ? "Next extra playing in" : (isNewSeason ? "Next episode of a new season playing in" : "Next episode playing in");
  showCountdownPopup(msg, () => navigateEpisode(1));
}

// ========== NAVIGATION & CONTROLS ==========
async function navigateEpisode(direction) {
  let { season: s, episode: e, id } = currentVideoState;
  if (s === 0) {
    if (direction === 1) { if (e >= currentVideoState.totalEpisodesInSeason) return alert("End of extras!"); e++; }
    else { if (e <= 1) return alert("First extra!"); e--; }
    currentVideoState.season = s; currentVideoState.episode = e;
  } else {
    if (direction === 1) {
      if (e >= currentVideoState.totalEpisodesInSeason) {
        if (s >= currentVideoState.totalSeasons) return alert("End of series!");
        s++; e = 1;
        try { const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`); currentVideoState.totalEpisodesInSeason = (await r.json()).episodes?.length || 0; } catch(err){}
      } else e++;
    } else {
      if (e <= 1) {
        if (s <= 1) return alert("First episode!");
        s--;
        try { const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`); currentVideoState.totalEpisodesInSeason = (await r.json()).episodes?.length || 0; } catch(err){}
        e = currentVideoState.totalEpisodesInSeason;
      } else e--;
    }
    currentVideoState.season = s; currentVideoState.episode = e;
    updateTVEpisode(id, currentVideoState.mediaType, s, e);
    displayContinueWatching();
  }

  const container = document.querySelector(".video-container");
  container.innerHTML = '';
  const linkData = tvAlternateLinks.get(`${id}_${s}_${e}`);
  const defaultSrc = `https://vidsrc-embed.su/embed/tv/${id}/${s}-${e}`;

  if (linkData?.[0]?.toLowerCase().endsWith('.mp4')) {
    currentPlaybackLinks = linkData; currentLinkIndex = 0;
    renderVideoPlayer(linkData[0], id, currentVideoState.mediaType, s, e, false);
  } else {
    currentPlaybackLinks = [];
    const iframe = document.createElement('iframe');
    iframe.allowFullscreen = true; iframe.src = defaultSrc;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
    container.appendChild(iframe);
  }

  const titleEl = document.getElementById("videoTitle");
  const epTag = s === 0 ? `Extra ${e}` : `S${s}E${e}`;
  titleEl.textContent = `${currentVideoState.itemTitle} - ${epTag}`;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`);
    const ed = (await res.json()).episodes?.find(ep => ep.episode_number === e);
    if (ed?.name) titleEl.textContent = `${currentVideoState.itemTitle} - ${epTag}: ${ed.name}`;
  } catch(err){}
  
  if (s > 0 && document.getElementById('movieModal')?.style.display === 'block') {
    try { updateModalUI(id, currentVideoState.mediaType, currentVideoState.itemTitle, s, e); } catch(e){}
  }
  updateButtonStates();
}

function updateButtonStates() {
  const c = document.getElementById("videoControls"); if (!c) return;
  const [prev, next] = c.querySelectorAll("button");
  if (currentVideoState.season === 0) {
    prev.disabled = currentVideoState.episode <= 1;
    next.disabled = currentVideoState.episode >= currentVideoState.totalEpisodesInSeason;
  } else {
    prev.disabled = currentVideoState.season <= 1 && currentVideoState.episode <= 1;
    next.disabled = currentVideoState.season >= currentVideoState.totalSeasons && currentVideoState.episode >= currentVideoState.totalEpisodesInSeason;
  }
}

async function setupVideoControls(id, mediaType, season, episode, itemTitle) {
  const old = document.getElementById("videoControls"); if (old) old.remove();
  if (mediaType.trim() !== "tv" || season === null || episode === null) return;

  currentVideoState = { id, mediaType: mediaType.trim(), season, episode, itemTitle, totalEpisodesInSeason: 0, totalSeasons: 0 };
  const container = document.createElement("div");
  container.id = "videoControls"; container.className = "video-controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "video-nav-btn";
  prevBtn.onclick = () => navigateEpisode(-1);
  const nextBtn = document.createElement("button");
  nextBtn.className = "video-nav-btn";
  nextBtn.onclick = () => navigateEpisode(1);

  if (season === 0) { prevBtn.textContent = "Previous Extra"; nextBtn.textContent = "Next Extra"; }
  else { prevBtn.textContent = "Previous Episode"; nextBtn.textContent = "Next Episode"; }

  container.appendChild(prevBtn); container.appendChild(nextBtn);
  document.getElementById("videoTitle").after(container);

  try {
    const [sr, sh] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${apiKey}&language=en-US`),
      fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=en-US`)
    ]);
    currentVideoState.totalEpisodesInSeason = (await sr.json()).episodes?.length || 0;
    currentVideoState.totalSeasons = (await sh.json()).seasons?.filter(s => s.season_number > 0).length || 0;
  } catch(e){}
  updateButtonStates();
}

// ========== MODAL & TRAILERS ==========
function openTrailer(url, title) {
  const modal = document.getElementById("videoModal");
  const titleEl = document.getElementById("videoTitle");
  const container = document.querySelector(".video-container");
  if (!modal || !container) return;
  modal.style.display = "block"; titleEl.textContent = title || "Trailer";
  document.body.style.overflow = "hidden"; container.innerHTML = '';
  const dbg = document.getElementById('video-timeline-debug'); if (dbg) dbg.style.display = 'none';
  const ctrls = document.getElementById('videoControls'); if (ctrls) ctrls.remove();

  if (url.toLowerCase().endsWith('.mp4')) {
    const v = document.createElement('video'); v.src = url; v.controls = true; v.autoplay = true;
    v.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;'; container.appendChild(v);
  } else {
    const iframe = document.createElement('iframe');
    iframe.allowFullscreen = true; iframe.allow = "autoplay; encrypted-media"; iframe.src = url;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#000;';
    let t = setTimeout(() => { if (!iframe._loaded) container.innerHTML = `<div style="color:white;text-align:center;padding:40px;"><a href="${url.replace('/embed/','/watch?v=')}" target="_blank" style="background:#e50914;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;">▶ Watch externally</a></div>`; }, 5000);
    iframe.onload = () => { clearTimeout(t); iframe._loaded = true; };
    container.appendChild(iframe);
  }
}

function toggleWatchlistFromModal(id, mediaType, title, posterPath) {
  const item = { id, media_type: mediaType, title, poster_path: posterPath };
  getWatchlist().some(w => w.id === id && w.media_type === mediaType) ? removeFromWatchlist(item) : addToWatchlist(item);
  document.getElementById("movieModal").style.display = "none";
}

function removeFromContinueWatching(id, mediaType) {
  removeFromWatched(id, mediaType);
  document.getElementById("movieModal").style.display = "none";
  displayContinueWatching();
}

function updateModalUI(id, mediaType, title, ns, ne) {
  const poster = document.querySelector('.modal-poster')?.getAttribute('src')?.split('/w500')[1] || '';
  const actions = document.querySelector('.modal-actions');
  if (!actions) return;
  actions.innerHTML = `
    <button class="play-btn" id="tempPlayBtn" onclick="openVideoPlayer('https://vidsrc-embed.su/embed/tv/${id}/${ns}-${ne}', '${title} - S${ns}E${ne}', ${id}, '${mediaType}', '${title}', '${poster}', ${ns}, ${ne})">▶ Play S${ns}E${ne}</button>
    <div class="tv-action-group">
      <button class="episode-done-btn" onclick="markEpisodeDone(${id}, '${mediaType}', '${title}', ${ns}, ${ne})">✓ I watched this</button>
      <button class="watched-btn" onclick="removeFromContinueWatching(${id}, '${mediaType}')">Remove</button>
    </div>`;
  setTimeout(() => {
    const b = actions.querySelector('#tempPlayBtn');
    if (b) { b.classList.remove('pulse-yellow'); void b.offsetWidth; b.classList.add('pulse-yellow'); setTimeout(() => { b.innerHTML = `▶ Play S${ns}E${ne}`; b.removeAttribute('id'); }, 400); }
  }, 50);
}

function updateModalToUnwatchedState(id, title) {
  const poster = document.querySelector('.modal-poster')?.getAttribute('src')?.split('/w500')[1] || '';
  const actions = document.querySelector('.modal-actions');
  if (actions) actions.innerHTML = `<button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.su/embed/tv/${id}/1-1', '${title} - S1E1', ${id}, 'tv', '${title}', '${poster}', 1, 1)">▶ Play S1E1</button>`;
}

async function markEpisodeDone(id, mediaType, title, cs, ce) {
  if (cs === 0) return alert("Extras progress is not tracked.");
  try {
    const sr = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${cs}?api_key=${apiKey}`);
    const sd = await sr.json();
    const totE = sd.episodes?.length || 0;
    let ns = cs, ne = ce + 1;
    if (ce >= totE) {
      const hr = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}`);
      const totS = (await hr.json()).seasons?.filter(s => s.season_number > 0).length || 0;
      if (cs >= totS) { removeFromWatched(id, mediaType); displayContinueWatching(); updateModalToUnwatchedState(id, title); return; }
      ns++; ne = 1;
    }
    updateTVEpisode(id, mediaType, ns, ne); displayContinueWatching(); updateModalUI(id, mediaType, title, ns, ne);
  } catch(e) { alert("Failed to update progress."); }
}

async function openVideoPlayer(url, title, id, mediaType, itemTitle, posterPath, season = null, episode = null) {
  const modal = document.getElementById("videoModal");
  if (!modal) return;
  removeFromWatchlist({ id, media_type: mediaType, title: itemTitle, poster_path: posterPath });
  addToWatched({ id, media_type: mediaType, title: itemTitle, poster_path: posterPath }, season, episode);
  setVideoSource(id, mediaType, season, episode, url, true);
  let displayTitle = title || "Now Playing";
  if (mediaType.trim() === "tv" && season === 0) displayTitle = displayTitle.replace(/ - S0E(\d+)/, ` - Extra $1`);
  document.getElementById("videoTitle").textContent = displayTitle;
  modal.style.display = "block"; document.body.style.overflow = "hidden";
  if (document.getElementById("watchlist-tab")?.classList.contains("active")) displayWatchlist();
  setupVideoControls(id, mediaType, season, episode, itemTitle);
}

function closeVideoModal() {
  const modal = document.getElementById("videoModal");
  const vid = document.getElementById("videoPlayer");
  if (vid && currentVideoState.id) {
    const t = vid.currentTime;
    if (getWatchedData()[`${currentVideoState.mediaType}_${currentVideoState.id}`] && t > 10) {
      saveVideoTimestamp(currentVideoState.id, currentVideoState.mediaType, currentVideoState.season, currentVideoState.episode, t);
    }
  }
  if (modal) modal.style.display = "none";
  document.querySelector(".video-container").innerHTML = "";
  const dbg = document.getElementById('video-timeline-debug'); if (dbg) { dbg.style.display='none'; dbg.textContent=''; }
  document.body.style.overflow = "";
  const ctrls = document.getElementById("videoControls"); if (ctrls) ctrls.remove();
  cleanupCountdown();
  currentVideoState = { id:null, mediaType:null, season:null, episode:null, itemTitle:null, totalEpisodesInSeason:0, totalSeasons:0 };
  if (document.getElementById("home-tab")?.classList.contains("active")) displayContinueWatching();
}

// ========== DISPLAY FUNCTIONS ==========
function displayContinueWatching() {
  const container = document.getElementById("continueWatching");
  const items = Object.values(getWatchedData());
  items.sort((a, b) => (b.lastWatched || b.addedAt) - (a.lastWatched || a.addedAt));
  container.innerHTML = items.length === 0 ? "<p>No watched content yet.</p>" : "";
  items.forEach(item => {
    const div = document.createElement("div"); div.className = "movie continue-card";
    const badge = (item.media_type === "tv" && item.currentSeason) ? `<div class="episode-badge">S${item.currentSeason}E${item.currentEpisode}</div>` : "";
    div.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title}">${badge}<div class="movie-title">${item.title} (${item.media_type})</div>`;
    div.onclick = () => showMovieDetails(item, true);
    container.appendChild(div);
  });
}

function displayWatchlist() {
  const container = document.getElementById("watchlist");
  const items = getWatchlist();
  container.innerHTML = items.length === 0 ? "<p>Your watchlist is empty.</p>" : "";
  items.forEach(item => {
    const div = document.createElement("div"); div.className = "movie";
    div.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title}"><div class="movie-title">${item.title} (${item.media_type})</div>`;
    div.onclick = () => showMovieDetails(item, false);
    container.appendChild(div);
  });
}

async function showMovieDetails(item, fromContinue = false) {
  const modal = document.getElementById("movieModal");
  const body = document.getElementById("modalBody");
  if (!modal || !body) return;
  body.innerHTML = "<p>Loading...</p>"; modal.style.display = "block";
  try {
    const type = item.media_type === "movie" ? "movie" : "tv";
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${item.id}?api_key=${apiKey}&language=en-US`);
    const data = await res.json();
    const title = data.title || data.name;
    const year = (data.release_date || data.first_air_date || "").split("-")[0];
    const watched = getWatchedData();
    const tracked = watched[`${item.media_type}_${item.id}`];
    const s = tracked?.currentSeason, e = tracked?.currentEpisode;
    const isInWatched = !!tracked;

    let btns = "";
    const vs = `https://vidsrc-embed.su/embed/${type === "tv" ? `tv/${item.id}/${s}-${e}` : `movie/${item.id}`}`;
    if (item.media_type === "movie") {
      btns = `<button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.su/embed/movie/${item.id}', '${title} (${year})', ${item.id}, 'movie', '${title}', '${data.poster_path||''}')">▶ Play</button>`;
      btns += isInWatched ? `<button class="watched-btn" onclick="removeFromContinueWatching(${item.id}, 'movie')">Remove</button>` : `<button class="action-btn" onclick="toggleWatchlistFromModal(${item.id}, 'movie', '${title}', '${data.poster_path||''}')">+ Add</button>`;
    } else {
      if (isInWatched && s) {
        btns = `<button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.su/embed/tv/${item.id}/${s}-${e}', '${title} - S${s}E${e}', ${item.id}, 'tv', '${title}', '${data.poster_path||''}', ${s}, ${e})">▶ Play S${s}E${e}</button>`;
        btns += `<div class="tv-action-group"><button class="episode-done-btn" onclick="markEpisodeDone(${item.id}, 'tv', '${title}', ${s}, ${e})">✓ Watched</button><button class="watched-btn" onclick="removeFromContinueWatching(${item.id}, 'tv')">Remove</button></div>`;
      } else {
        btns = `<button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.su/embed/tv/${item.id}/1-1', '${title} - S1E1', ${item.id}, 'tv', '${title}', '${data.poster_path||''}', 1, 1)">▶ Play S1E1</button><button class="action-btn" onclick="toggleWatchlistFromModal(${item.id}, 'tv', '${title}', '${data.poster_path||''}')">+ Add</button>`;
      }
    }

    let html = `${data.poster_path ? `<img class="modal-poster" src="https://image.tmdb.org/t/p/w500${data.poster_path}">` : ""}<h2 class="modal-title">${title} (${year})</h2><div class="modal-info">${type} • ${data.vote_average?.toFixed(1)}/10 • ${item.media_type==="movie"?data.runtime+" min":data.episode_run_time?.[0]+" min"}</div><div class="modal-info"><strong>Genres:</strong> ${data.genres?.map(g=>g.name).join(", ")}</div><p class="modal-overview">${data.overview||"No overview."}</p><div class="modal-actions">${btns}</div>`;

    if (item.media_type === "tv" && data.seasons?.length > 0) {
      html += `<div class="seasons-container"><h3>Seasons</h3>`;
      data.seasons.filter(s=>s.season_number>0).forEach(season => {
        html += `<button class="season-toggle" data-season="${season.season_number}">${season.name} <span style="color:#888">(${season.episode_count||'?'})</span></button><div class="episodes-list" id="episodes-s${season.season_number}"></div>`;
      });
      if (data.seasons.find(s=>s.season_number===0)) {
        html += `<button class="season-toggle" data-season="0">Extras <span style="color:#888">(${data.seasons.find(s=>s.season_number===0).episode_count||'?'})</span></button><div class="episodes-list" id="episodes-s0"></div>`;
      }
      html += `</div>`;
    }
    body.innerHTML = html;

    // Async Trailer
    (async () => {
      const actions = document.querySelector('.modal-actions'); if (!actions) return;
      const tBtn = document.createElement('div'); tBtn.id='trailer-btn-container'; tBtn.style.cssText='text-align:center;margin:10px 0;';
      tBtn.innerHTML = '<button class="action-btn" disabled>🎬 Loading...</button>';
      actions.appendChild(tBtn);
      const url = await fetchTrailerUrl(item.id, item.media_type);
      if (url) tBtn.innerHTML = `<button class="trailer-btn" onclick="openTrailer('${url}', '${title} - Trailer')">🎬 Play Trailer</button>`;
      else tBtn.innerHTML = '';
    })();

    if (item.media_type === "tv") {
      document.querySelectorAll('.season-toggle').forEach(btn => {
        btn.onclick = async (ev) => {
          ev.stopPropagation();
          const num = btn.dataset.season;
          const cont = document.getElementById(`episodes-s${num}`);
          if (btn.classList.toggle('active') && !cont.dataset.loaded) {
            const r = await fetch(`https://api.themoviedb.org/3/tv/${item.id}/season/${num}?api_key=${apiKey}`);
            const d = await r.json();
            cont.innerHTML = d.episodes?.map(ep => `<div class="episode-item"><button class="episode-play" onclick="openVideoPlayer('https://vidsrc-embed.su/embed/tv/${item.id}/${num}-${ep.episode_number}', '${title} - S${num}E${ep.episode_number}', ${item.id}, 'tv', '${title}', '${data.poster_path||''}', ${num}, ${ep.episode_number})">▶</button><span class="episode-number">E${ep.episode_number}</span><span class="episode-title">${ep.name}</span></div>`).join('') || '<div>No episodes</div>';
            cont.dataset.loaded = "true";
          }
          cont.classList.toggle('show', btn.classList.contains('active'));
        };
      });
    }
  } catch(e) { body.innerHTML = "<p>Failed to load details.</p>"; }
}

// ========== SEARCH & SCROLL ==========
function score(item, query) {
  const t = (item.title || item.name || "").toLowerCase(), q = query.toLowerCase();
  let s = item.popularity || 0;
  if (t === q) s += 1000; else if (t.startsWith(q)) s += 500; else if (t.includes(q)) s += 200;
  return s;
}
searchInput.addEventListener("input", async () => {
  const q = searchInput.value.trim(); if (q.length < 3) { resultsDiv.innerHTML = ""; return; }
  currentQuery = q; currentPage = 1; resultsDiv.innerHTML = ""; await loadResults();
});
async function loadResults() {
  if (loading || !currentQuery) return; loading = true;
  try {
    const [m, t] = await Promise.all([fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(currentQuery)}&page=${currentPage}`), fetch(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(currentQuery)}&page=${currentPage}`)]);
    const data = [...(await m.json()).results.map(x=>({...x,media_type:"movie"})), ...(await t.json()).results.map(x=>({...x,media_type:"tv"}))];
    displayResults(data.sort((a,b) => score(b, currentQuery) - score(a, currentQuery)), currentPage > 1);
    currentPage++;
  } catch(e) { console.error(e); }
  loading = false;
}
function displayResults(items, append = false) {
  if (!append) resultsDiv.innerHTML = "";
  items.forEach(item => {
    if (!item.poster_path) return;
    const div = document.createElement("div"); div.className = "movie";
    div.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title}"><div class="movie-title">${item.title} (${item.media_type})</div>`;
    div.oncontextmenu = (e) => { e.preventDefault(); const exists = getWatchlist().some(w => w.id === item.id && w.media_type === item.media_type); exists ? removeFromWatchlist(item) : addToWatchlist(item); displayResults(items, append); };
    div.onclick = () => showMovieDetails(item, false);
    resultsDiv.appendChild(div);
  });
}
window.addEventListener("scroll", () => { if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) loadResults(); });

// ========== NEW ADDITIONS ==========
async function loadNewAdditions(append = false) {
  if (newAdditionsLoading) return;
  const cont = document.getElementById("newAdditions");
  if (!append) { cont.innerHTML = "<p>Loading...</p>"; newAdditionsPage = 1; }
  newAdditionsLoading = true;
  try {
    const [mr, tr] = await Promise.all([fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${apiKey}&page=${newAdditionsPage}`), fetch(`https://api.themoviedb.org/3/tv/on_the_air?api_key=${apiKey}&page=${newAdditionsPage}`)]);
    const items = [...(await mr.json()).results.map(x=>({...x,media_type:"movie"})), ...(await tr.json()).results.map(x=>({...x,media_type:"tv"}))].sort((a,b) => new Date(b.release_date||b.first_air_date||0) - new Date(a.release_date||a.first_air_date||0));
    displayNewAdditions(items, !append); newAdditionsPage++;
  } catch(e) { if (!append) cont.innerHTML="<p>Failed to load</p>"; }
  newAdditionsLoading = false;
}
function displayNewAdditions(items, clear=true) {
  const cont = document.getElementById("newAdditions"); if (clear) cont.innerHTML = "";
  items.forEach(item => {
    if (!item.poster_path) return;
    const div = document.createElement("div"); div.className="movie";
    const y = (item.release_date||item.first_air_date||"").split("-")[0];
    div.innerHTML = `<img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${item.title}"><div class="release-badge ${item.media_type==="tv"?"tv":"movie"}">${item.media_type==="tv"?"New Ep":"New Movie"}</div><div class="movie-title">${item.title} (${item.media_type}) ${y}</div>`;
    div.onclick = () => showMovieDetails(item, false); cont.appendChild(div);
  });
}

// ========== DOMContentLoaded ==========
document.addEventListener("DOMContentLoaded", () => {
  loadAlternateLinks(); loadTvAlternateLinks(); displayContinueWatching(); loadNewAdditions();
  
  const newCont = document.getElementById("newAdditions");
  if (newCont) newCont.addEventListener("scroll", () => { if (newCont.scrollLeft + newCont.clientWidth >= newCont.scrollWidth * 0.8) loadNewAdditions(true); });
  
  const movieModal = document.getElementById("movieModal");
  const videoModal = document.getElementById("videoModal");
  const closeBtn = document.querySelector(".close-btn");
  const videoCloseBtn = document.querySelector(".video-close");
  
  if (closeBtn && movieModal) closeBtn.onclick = () => movieModal.style.display = "none";
  if (videoCloseBtn) videoCloseBtn.onclick = closeVideoModal;
  
  window.onclick = (e) => {
    if (e.target === movieModal) movieModal.style.display = "none";
    if (e.target === videoModal) closeVideoModal();
  };
  
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active"); document.getElementById(`${btn.dataset.tab}-tab`).classList.add("active");
      if (btn.dataset.tab === "home") displayContinueWatching();
      if (btn.dataset.tab === "watchlist") displayWatchlist();
    };
  });

  document.getElementById("exportCsv")?.onclick = () => {
    const w = getWatchedData(); if (!Object.keys(w).length) return alert("No history!");
    const rows = Object.values(w).map(i => [i.id, `"${(i.title||i.name).replace(/"/g,'""')}"`, i.media_type, i.currentSeason||"N/A", i.currentEpisode||"N/A", new Date(i.addedAt).toLocaleString()].join(", "));
    const blob = new Blob(["ID,Title,Type,Season,Episode,Date Added\n" + rows.join("\n")], {type:"text/csv"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`history-${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };
  document.getElementById("clearMoviesFromWatching")?.onclick = () => { if (confirm("Clear all MOVIES?")) { const w = getWatchedData(); Object.keys(w).filter(k => w[k].media_type==="movie").forEach(k => delete w[k]); saveWatchedData(w); displayContinueWatching(); } };
  document.getElementById("clearData")?.onclick = () => { if (confirm("Clear ALL data?")) { localStorage.clear(); displayContinueWatching(); displayWatchlist(); alert("Cleared!"); } };
  document.getElementById("clearContinueWatching")?.onclick = () => { if (confirm("Clear Continue Watching?")) { localStorage.removeItem(STORAGE_WATCHED); displayContinueWatching(); alert("Cleared!"); } };
  document.getElementById("clearWatchlist")?.onclick = () => { if (confirm("Clear Watchlist?")) { localStorage.removeItem(STORAGE_WATCHLIST); displayWatchlist(); alert("Cleared!"); } };
});
