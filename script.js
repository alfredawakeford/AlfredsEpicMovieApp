// ============================================================================
// 1. CONFIGURATION & STATE VARIABLES
// ============================================================================

// TMDB API Key
const apiKey = "7ef03bd0c305f128db814368cb78a12c";

// DOM Elements
const searchInput = document.getElementById("search");
const resultsDiv = document.getElementById("results");

// Search & Pagination State
let currentPage = 1;
let currentQuery = "";
let currentFilter = "all"; // 'all', 'movie', or 'tv'
let lastSearchResults = [];
let loading = false;

// New Additions State
const tabState = {
  home: { page: 1, loading: false, seenIds: new Set() },
  movies: { page: 1, loading: false, seenIds: new Set() },
  tv: { page: 1, loading: false, seenIds: new Set() }
};

// Video Playback State
let currentVideoState = {
  id: null, mediaType: null, season: null, episode: null,
  itemTitle: null, totalEpisodesInSeason: 0, totalSeasons: 0
};
let currentPlaybackLinks = [];
let currentLinkIndex = 0;

// Search Mode State
let currentSearchMode = 'title'; // 'title', 'genre', or 'people'
let currentKeywordId = null;
let keywordSearchTimeout = null;
let isKeywordSearch = false;
let seenKeywordItems = new Set();
let isPersonSearch = false;
let personSearchTimeout = null;
let currentPersonResults = [];

// Local Storage Keys
const STORAGE_WATCHED = "movieBrowser_watched";
const STORAGE_WATCHLIST = "movieBrowser_watchlist";

// Data Maps for Custom CSV Links
let externalLinksMap = new Map();   // Maps TMDB ID to external streaming service links
let alternateLinks = new Map();     // Maps TMDB ID to direct MP4 video links (Movies)
let tvAlternateLinks = new Map();   // Maps "ID_Season_Episode" to direct MP4 links (TV)
let trailerCache = new Map();       // Caches trailer URLs to reduce API calls

// Configuration for External Streaming Service Logos/Colors
const externalServices = [
  { name: "BBC iPlayer", logo: "https://upload.wikimedia.org/wikipedia/en/f/fd/BBC_iPlayer_logo_%282021%29.svg", color: "#000000" },
  { name: "Netflix", logo: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg", color: "#101010" },
  { name: "Amazon Prime", logo: "https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg", color: "#1c252e" },
  { name: "Disney+", logo: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg", color: "#5be7f7" },
  { name: "YouTube", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg", color: "#e7e7e5" },
  { name: "Channel 4", logo: "https://upload.wikimedia.org/wikipedia/commons/4/46/All_4_%282019%29.svg", color: "#abff8a" },
  { name: "HBO MAX", logo: "https://upload.wikimedia.org/wikipedia/commons/7/7e/HBO_Max_May_2025_%28Horizontal%29.svg", color: "#ffffff" },
  { name: "Discovery+", logo: "https://upload.wikimedia.org/wikipedia/commons/6/61/Discovery_Plus_logo.svg", color: "#001682" },
  { name: "ITVX", logo: "https://upload.wikimedia.org/wikipedia/en/1/12/ITVX_logo.svg", color: "#083644" },
];


// ============================================================================
// 2. DATA LOADING & CSV PARSING
// ============================================================================

/** Loads direct MP4 links and external service links for movies from movielinks.csv */
async function loadAlternateLinks() {
  try {
    const response = await fetch('movielinks.csv');
    if (!response.ok) return;
    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    lines.forEach((line, index) => {
      if (index === 0) return; // Skip header
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 3) return; 

      const [tmdbId, externalInfo, mp4Links, subtitleLink] = parts;
      
      // Parse direct MP4 video links
      if (tmdbId && mp4Links) {
        alternateLinks.set(tmdbId, {
          videos: mp4Links.split('|').map(l => l.trim()).filter(Boolean),
          subtitle: subtitleLink?.trim() || null
        });
      }
      
      // Parse external streaming service links
      if (tmdbId && externalInfo) {
        if (externalInfo === 'Nowhere') {
          externalLinksMap.set(tmdbId, { nowhere: true });
        } else {
          const servicesMap = new Map();
          const services = externalInfo.split('|').map(s => s.trim()).filter(Boolean);
          
          services.forEach(serviceStr => {
            const colonIndex = serviceStr.indexOf(':');
            if (colonIndex === -1) return;
            
            const serviceName = serviceStr.substring(0, colonIndex).trim();
            const link = serviceStr.substring(colonIndex + 1).trim();
            if (!serviceName || !link) return;
            
            const config = externalServices.find(s => s.name === serviceName);
            if (!config) {
              console.warn(`Unknown service "${serviceName}" for TMDB ${tmdbId}`);
              return;
            }
            
            servicesMap.set(serviceName, { link: link, logo: config.logo, color: config.color });
          });
          
          externalLinksMap.set(tmdbId, { nowhere: false, services: servicesMap });
        }
      }
    });
    console.log(`✅ Loaded alternate links for ${alternateLinks.size} movies`);
  } catch (e) { 
    console.warn('movielinks.csv load failed:', e); 
  }
}

/** Loads external streaming service links for TV shows from tvexternallinks.csv */
async function loadTvExternalLinks() {
  try {
    const response = await fetch('tvexternallinks.csv');
    if (!response.ok) return;
    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    
    lines.forEach((line, index) => {
      if (index === 0) return; 
      const [tmdbId, externalInfo] = line.split(',').map(s => s.trim());
      if (!tmdbId || !externalInfo) return;
      
      if (externalInfo === 'Nowhere') {
        externalLinksMap.set(tmdbId, { nowhere: true });
      } else {
        const servicesMap = new Map();
        const services = externalInfo.split('|').map(s => s.trim()).filter(Boolean);
        
        services.forEach(serviceStr => {
          const colonIndex = serviceStr.indexOf(':');
          if (colonIndex === -1) return;
          
          const serviceName = serviceStr.substring(0, colonIndex).trim();
          const link = serviceStr.substring(colonIndex + 1).trim();
          if (!serviceName || !link) return;
          
          const config = externalServices.find(s => s.name === serviceName);
          if (!config) {
            console.warn(`Unknown service "${serviceName}" for TV TMDB ${tmdbId}`);
            return;
          }
          
          servicesMap.set(serviceName, { link: link, logo: config.logo, color: config.color });
        });
        
        externalLinksMap.set(tmdbId, { nowhere: false, services: servicesMap });
      }
    });
    console.log(`✅ Loaded external links for TV shows`);
  } catch (e) { 
    console.warn('tvexternallinks.csv failed:', e); 
  }
}

/** Loads direct MP4 links for specific TV episodes from tvlinks.csv */
async function loadTvAlternateLinks() {
  try {
    const response = await fetch('tvlinks.csv');
    if (!response.ok) return;
    const csvText = await response.text();
    
    csvText.trim().split('\n').forEach((line, index) => {
      if (index === 0) return;
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 4) {
        const [id, season, episode, links, subtitle] = parts;
        const key = `${id}_${season}_${episode}`;
        tvAlternateLinks.set(key, {
          videos: links.split('|').map(l => l.trim()).filter(Boolean),
          subtitle: subtitle || null
        });
      }
    });
  } catch (e) { 
    console.warn('tvlinks.csv load failed:', e); 
  }
}


// ============================================================================
// 3. TMDB & TRAILER API HELPERS
// ============================================================================

/** Fetches the IMDB ID for a given TMDB ID (required for TrailerDB API) */
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

/** Fetches an official English YouTube trailer URL from TrailerDB using an IMDB ID */
async function getTrailerFromTrailerDb(imdbId) {
  try {
    const res = await fetch(`https://trailerdb.org/data/movie/${imdbId}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const trailers = data.trailers || [];

    // Prioritize official English trailers, then fallback to any English, then any official, then any trailer
    let best = trailers.find(t => t.type === 'trailer' && t.language === 'en' && t.is_official === true) ||
               trailers.find(t => t.type === 'trailer' && t.language === 'en') ||
               trailers.find(t => t.type === 'trailer' && t.is_official === true) ||
               trailers.find(t => t.type === 'trailer');

    if (best?.youtube_id) {
      return `https://www.youtube.com/embed/${best.youtube_id}?rel=0&modestbranding=1&autoplay=1`;
    }
    return null;
  } catch (e) {
    console.warn(`Failed to fetch trailer for IMDB ${imdbId}:`, e);
    return null;
  }
}

/** Cached wrapper to fetch a trailer URL for a TMDB ID */
async function fetchTrailerUrl(tmdbId, mediaType) {
  const cacheKey = `${tmdbId}_${mediaType}`;
  if (trailerCache.has(cacheKey)) return trailerCache.get(cacheKey);
  
  const imdbId = await getImdbId(tmdbId, mediaType);
  if (!imdbId) {
    trailerCache.set(cacheKey, null);
    return null;
  }
  
  const trailerUrl = await getTrailerFromTrailerDb(imdbId);
  trailerCache.set(cacheKey, trailerUrl || null);
  return trailerUrl;
}

/** Converts seconds into a formatted HH:MM:SS or MM:SS string */
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}


// ============================================================================
// 4. LOCAL STORAGE & WATCHED/WATCHLIST MANAGEMENT
// ============================================================================

function getWatchedData() {
  return JSON.parse(localStorage.getItem(STORAGE_WATCHED) || "{}");
}

function saveWatchedData(data) {
  localStorage.setItem(STORAGE_WATCHED, JSON.stringify(data));
}

function getWatchlist() {
  return JSON.parse(localStorage.getItem(STORAGE_WATCHLIST) || "[]");
}

function saveWatchlist(data) {
  localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(data));
}

/** Adds or updates an item in the watched history */
function addToWatched(item, season = null, episode = null) {
  const watched = getWatchedData();
  const key = `${item.media_type}_${item.id}`;
  const existing = watched[key];
  
  if (season === 0) {
    if (existing) {
      existing.lastWatched = Date.now();
      watched[key] = existing;
      saveWatchedData(watched);
    }
    return;
  }

  watched[key] = {
    id: item.id,
    media_type: item.media_type,
    title: item.title || item.name,
    poster_path: item.poster_path,
    currentSeason: season,
    currentEpisode: episode,
    addedAt: existing ? existing.addedAt : Date.now(),
    lastWatched: Date.now()
  };
  saveWatchedData(watched);
}

/** Updates the current season/episode for a TV show in watched history */
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

/** Removes an item from watched history and clears its timestamps */
function removeFromWatched(id, mediaType, season = null, episode = null) {
  const watched = getWatchedData();
  const key = `${mediaType}_${id}`;
  if (season !== null && episode !== null) {
    clearVideoTimestamp(id, mediaType, season, episode);
  } else {
    clearAllTimestampsForItem(id, mediaType);
  }
  delete watched[key];
  saveWatchedData(watched);
}

function addToWatchlist(item) {
  const watchlist = getWatchlist();
  const exists = watchlist.find(w => w.id === item.id && w.media_type === item.media_type);
  if (!exists) {
    watchlist.push({
      id: item.id,
      media_type: item.media_type,
      title: item.title || item.name,
      poster_path: item.poster_path,
      addedAt: Date.now()
    });
    saveWatchlist(watchlist);
    updateFolderCounts();
  }
}

function removeFromWatchlist(item) {
  const watchlist = getWatchlist();
  const filtered = watchlist.filter(w => !(w.id === item.id && w.media_type === item.media_type));
  saveWatchlist(filtered);
  updateFolderCounts();
}

// --- Video Timestamp Helpers ---

function clearVideoTimestamp(id, mediaType, season, episode) {
  const key = `videoProgress_${mediaType}_${id}_${season || 0}_${episode || 0}`;
  localStorage.removeItem(key);
  console.log(`🗑️ Cleared timestamp: ${key}`);
}

function clearAllTimestampsForItem(id, mediaType) {
  const watched = getWatchedData();
  const itemKey = `${mediaType}_${id}`;
  const item = watched[itemKey];
  if (item) {
    if (item.currentSeason && item.currentEpisode) {
      clearVideoTimestamp(id, mediaType, item.currentSeason, item.currentEpisode);
    }
    clearVideoTimestamp(id, mediaType, 0, 0);
  }
}

function clearAllVideoProgressKeys() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('videoProgress_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log(`🗑️ Cleared ${keysToRemove.length} video progress entries.`);
}

function saveVideoTimestamp(id, mediaType, season, episode, timestamp) {
  const key = `videoProgress_${mediaType}_${id}_${season || 0}_${episode || 0}`;
  localStorage.setItem(key, timestamp.toString());
}

function loadVideoTimestamp(id, mediaType, season, episode) {
  const key = `videoProgress_${mediaType}_${id}_${season || 0}_${episode || 0}`;
  const saved = localStorage.getItem(key);
  return saved ? parseFloat(saved) : 0;
}

/** Attaches event listeners to a video element to auto-save playback progress */
function attachTimestampSaving(videoEl, id, mediaType, season, episode) {
  let lastSaved = 0;
  const save = () => {
    const t = videoEl.currentTime;
    if (t - lastSaved >= 5) {
      saveVideoTimestamp(id, mediaType, season, episode, t);
      lastSaved = t;
    }
  };
  videoEl.addEventListener('timeupdate', save);
  videoEl.addEventListener('pause', save);
  videoEl.addEventListener('ended', () => saveVideoTimestamp(id, mediaType, season, episode, videoEl.duration));
}

/** Displays debug info for video timeline and handles auto-resume logic */
function attachDebugTimeline(videoEl, id, mediaType, season, episode, autoResume = true) {
  const debugEl = document.getElementById('video-timeline-debug');
  if (!debugEl) return;
  
  debugEl.style.display = 'block';
  debugEl.textContent = '⏳ Loading...';
  const saved = loadVideoTimestamp(id, mediaType, season, episode);
  
  if (saved > 0 && autoResume) {
    debugEl.innerHTML = `🔍 Debug: Loading... <br>📍 Saved: ${formatTime(saved)} (auto-resuming)`;
    videoEl.addEventListener('loadedmetadata', () => {
      setTimeout(() => { videoEl.currentTime = saved; debugEl.innerHTML += ' ✅'; }, 300);
    });
  } else if (saved > 0) {
    debugEl.innerHTML = `🔍 Debug: Loading... <br>💾 Saved: ${formatTime(saved)} (starting fresh)`;
  }
  
  videoEl.addEventListener('loadedmetadata', () => {
    const cur = formatTime(videoEl.currentTime);
    const dur = formatTime(videoEl.duration);
    debugEl.innerHTML = `🔍 Debug: ${cur} / ${dur} | Raw: ${videoEl.currentTime.toFixed(2)}s <br>💾 Saved: ${formatTime(saved)}`;
  });
  
  videoEl.addEventListener('timeupdate', () => {
    const cur = formatTime(videoEl.currentTime);
    const dur = formatTime(videoEl.duration);
    debugEl.innerHTML = `🔍 Debug: ${cur} / ${dur} | Raw: ${videoEl.currentTime.toFixed(2)}s <br>💾 Saved: ${formatTime(saved)}`;
  });
  
  attachTimestampSaving(videoEl, id, mediaType, season, episode);
}


// ============================================================================
// 5. VIDEO PLAYER RENDERING & CONTROLS
// ============================================================================

function getAlternateLink(id) {
  return alternateLinks.get(String(id)) || null;
}

function getTvAlternateLink(id, season, episode) {
  const key = `${id}_${season}_${episode}`;
  return tvAlternateLinks.get(key) || null;
}

/** Renders a direct MP4 video player with subtitle support and fallback buttons */
function renderVideoPlayer(src, id, mediaType, season, episode, subtitleUrl, autoResume = true) {
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
  
  if (subtitleUrl) {
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'English';
    track.srclang = 'en';
    track.src = subtitleUrl;
    track.default = true;
    videoEl.appendChild(track);
    videoEl.addEventListener('loadeddata', () => {
      if (videoEl.textTracks.length > 0) videoEl.textTracks[0].mode = 'showing';
    });
  }
  
  // Fallback button if the first link fails
  if (currentPlaybackLinks.length > 1 && currentLinkIndex < currentPlaybackLinks.length - 1) {
    const btn = document.createElement('button');
    btn.className = 'fallback-link-btn';
    btn.textContent = '⚠️ This is not loading';
    btn.onclick = () => {
      currentLinkIndex++;
      renderVideoPlayer(currentPlaybackLinks[currentLinkIndex], id, mediaType, season, episode, subtitleUrl, true);
    };
    container.appendChild(btn);
  }
}

/** Determines whether to use a direct MP4 link or an iframe fallback for playback */
function setVideoSource(id, mediaType, season, episode, fallbackUrl, autoResume = true) {
  const container = document.querySelector(".video-container");
  if (!container) return;
  container.innerHTML = '';
  
  const linkData = (mediaType === 'tv' && season !== null && episode !== null)
    ? getTvAlternateLink(id, season, episode)
    : getAlternateLink(id);
    
  if (linkData && linkData.videos.length > 0 && linkData.videos[0].toLowerCase().endsWith('.mp4')) {
    currentPlaybackLinks = linkData.videos;
    currentLinkIndex = 0;
    renderVideoPlayer(linkData.videos[0], id, mediaType, season, episode, linkData.subtitle, autoResume);
  } else {
    currentPlaybackLinks = [];
    const iframe = document.createElement('iframe');
    iframe.id = 'videoFrame';
    iframe.allowFullscreen = true;
    iframe.src = fallbackUrl;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
    container.appendChild(iframe);
  }
}

/** Sets up Previous/Next episode navigation buttons for TV shows */
async function setupVideoControls(id, mediaType, season, episode, itemTitle) {
  const oldWrapper = document.getElementById("videoControlsWrapper");
  if (oldWrapper) oldWrapper.remove();
  if (mediaType.trim() !== "tv" || season === null || episode === null) return;
  
  currentVideoState = { id, mediaType: mediaType.trim(), season, episode, itemTitle, totalEpisodesInSeason: 0, totalSeasons: 0 };
  
  const wrapper = document.createElement("div");
  wrapper.id = "videoControlsWrapper";
  wrapper.style.cssText = "width:90%; max-width:900px; margin:15px auto; display:flex; flex-direction:column; align-items:center;";
  
  const container = document.createElement("div");
  container.id = "videoControls";
  container.className = "video-controls";
  container.style.margin = "0";
  
  const prevBtn = document.createElement("button");
  prevBtn.className = "video-nav-btn";
  prevBtn.onclick = () => navigateEpisode(-1);
  
  const nextBtn = document.createElement("button");
  nextBtn.className = "video-nav-btn";
  nextBtn.onclick = () => navigateEpisode(1);
  
  if (season === 0) {
    prevBtn.textContent = "Previous Extra";
    nextBtn.textContent = "Next Extra";
  } else {
    prevBtn.textContent = "Previous Episode";
    nextBtn.textContent = "Next Episode";
  }
  
  container.appendChild(prevBtn);
  container.appendChild(nextBtn);
  
  const nextStatusEl = document.createElement("div");
  nextStatusEl.id = "nextEpisodeStatus";
  nextStatusEl.style.cssText = "color:#888; font-size:13px; margin-top:10px; min-height:20px;";
  
  wrapper.appendChild(container);
  wrapper.appendChild(nextStatusEl);
  document.getElementById("videoTitle").after(wrapper);
  
  try {
    const [seasonRes, showRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${apiKey}&language=en-US`),
      fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=en-US`)
    ]);
    const sData = await seasonRes.json();
    const shData = await showRes.json();
    currentVideoState.totalEpisodesInSeason = sData.episodes?.length || 0;
    currentVideoState.totalSeasons = shData.seasons?.filter(s => s.season_number > 0).length || 0;
    currentVideoState.episodes = sData.episodes || [];
  } catch (e) { 
    console.error("Control limits fetch failed:", e); 
  }
  updateButtonStates();
}

/** Handles navigating to the previous or next episode, fetching new data as needed */
async function navigateEpisode(direction) {
  let s = currentVideoState.season;
  let e = currentVideoState.episode;
  const id = currentVideoState.id;
  
  if (s === 0) {
    if (direction === 1) {
      if (e >= currentVideoState.totalEpisodesInSeason) { alert("End of extras!"); return; }
      e++;
    } else {
      if (e <= 1) { alert("First extra!"); return; }
      e--;
    }
    currentVideoState.season = s;
    currentVideoState.episode = e;
  } else {
    if (direction === 1) {
      if (e >= currentVideoState.totalEpisodesInSeason) {
        if (s >= currentVideoState.totalSeasons) { alert("End of series!"); return; }
        s++; e = 1;
        try { 
          const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`); 
          currentVideoState.totalEpisodesInSeason = (await r.json()).episodes?.length || 0; 
        } catch(err){}
      } else { 
        e++; 
      }
    } else {
      if (e <= 1) {
        if (s <= 1) { alert("First episode!"); return; }
        s--;
        try { 
          const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`); 
          currentVideoState.totalEpisodesInSeason = (await r.json()).episodes?.length || 0; 
        } catch(err){}
        e = currentVideoState.totalEpisodesInSeason;
      } else { 
        e--; 
      }
    }
    currentVideoState.season = s;
    currentVideoState.episode = e;
    updateTVEpisode(id, currentVideoState.mediaType, s, e);
    displayContinueWatching();
  }
  
  const container = document.querySelector(".video-container");
  container.innerHTML = '';
  const linkData = getTvAlternateLink(id, s, e);
  const defaultSrc = `https://www.vidking.net/embed/tv/${id}/${s}/${e}`;
  
  if (linkData && linkData.videos.length > 0 && linkData.videos[0].toLowerCase().endsWith('.mp4')) {
    currentPlaybackLinks = linkData.videos;
    currentLinkIndex = 0;
    renderVideoPlayer(linkData.videos[0], id, currentVideoState.mediaType, s, e, linkData.subtitle, false);
  } else {
    currentPlaybackLinks = [];
    const iframe = document.createElement('iframe');
    iframe.id = 'videoFrame';
    iframe.allowFullscreen = true;
    iframe.src = defaultSrc;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
    container.appendChild(iframe);
  }
  
  const titleEl = document.getElementById("videoTitle");
  const epTag = s === 0 ? `Extra ${e}` : `S${s}E${e}`;
  titleEl.textContent = `${currentVideoState.itemTitle} - ${epTag}`;
  
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`);
    const sd = await res.json();
    const ed = sd.episodes?.find(ep => ep.episode_number === e);
    if (ed?.name) titleEl.textContent = `${currentVideoState.itemTitle} - ${epTag}: ${ed.name}`;
  } catch(err) {}
  
  if (s > 0 && document.getElementById('movieModal')?.style.display === 'block') {
    try { updateModalUI(id, currentVideoState.mediaType, currentVideoState.itemTitle, s, e); } catch(e){}
  }
  updateButtonStates();
}

/** Updates the disabled state of Prev/Next buttons based on release dates and series bounds */
function updateButtonStates() {
  const c = document.getElementById("videoControls");
  if (!c) return;
  const [prev, next] = c.querySelectorAll("button");
  const statusEl = document.getElementById("nextEpisodeStatus");
  
  if (currentVideoState.season === 0) {
    prev.disabled = currentVideoState.episode <= 1;
    next.disabled = currentVideoState.episode >= currentVideoState.totalEpisodesInSeason;
    if (statusEl) statusEl.textContent = "";
  } else {
    const isLastEpisode = currentVideoState.season >= currentVideoState.totalSeasons &&
                          currentVideoState.episode >= currentVideoState.totalEpisodesInSeason;
    let nextEpisodeReleased = true;

    if (!isLastEpisode) {
      let nextS = currentVideoState.season;
      let nextE = currentVideoState.episode + 1;
      
      if (nextE > currentVideoState.totalEpisodesInSeason) {
        nextS++;
        nextE = 1;
      }
      
      if (nextS === currentVideoState.season) {
        const epData = currentVideoState.episodes?.find(ep => ep.episode_number === nextE);
        if (epData?.air_date) {
          const airDate = new Date(epData.air_date);
          const today = new Date(); today.setHours(0,0,0,0);
          if (airDate > today) nextEpisodeReleased = false;
        }
      } else {
        (async () => {
          try {
            const res = await fetch(`https://api.themoviedb.org/3/tv/${currentVideoState.id}/season/${nextS}?api_key=${apiKey}&language=en-US`);
            const sData = await res.json();
            const epData = sData.episodes?.find(ep => ep.episode_number === nextE);
            if (epData?.air_date) {
              const airDate = new Date(epData.air_date);
              const today = new Date(); today.setHours(0,0,0,0);
              if (airDate > today) {
                next.disabled = true;
                if (statusEl) {
                  statusEl.textContent = "⏳ Next episode not released yet";
                  statusEl.style.color = "#ff6b6b";
                }
              }
            }
          } catch(e) {}
        })();
      }
    }

    prev.disabled = currentVideoState.season <= 1 && currentVideoState.episode <= 1;
    next.disabled = isLastEpisode || !nextEpisodeReleased;

    if (statusEl) {
      if (!nextEpisodeReleased) {
        statusEl.textContent = "⏳ Next episode not released yet";
        statusEl.style.color = "#ff6b6b";
      } else if (isLastEpisode) {
        statusEl.textContent = "✓ End of series";
        statusEl.style.color = "#28a745";
      } else {
        statusEl.textContent = "";
      }
    }
  }
}

/** Closes the video modal, saves final progress, and cleans up the DOM */
function closeVideoModal() {
  const modal = document.getElementById("videoModal");
  const container = document.querySelector(".video-container");
  const videoEl = document.getElementById("videoPlayer");
  
  if (videoEl && currentVideoState.id) {
    const currentTime = videoEl.currentTime;
    const watched = getWatchedData();
    const key = `${currentVideoState.mediaType}_${currentVideoState.id}`;
    const isInWatched = watched[key] !== undefined;
    if (isInWatched && currentTime > 10) {
      saveVideoTimestamp(currentVideoState.id, currentVideoState.mediaType, currentVideoState.season, currentVideoState.episode, currentTime);
    }
  }
  
  if (modal) modal.style.display = "none";
  if (container) container.innerHTML = '';
  
  const debugEl = document.getElementById('video-timeline-debug');
  if (debugEl) {
    debugEl.textContent = '';
    debugEl.style.display = 'none';
    debugEl.style.color = '#aaa';
  }
  
  document.body.style.overflow = "";
  const controlsWrapper = document.getElementById("videoControlsWrapper");
  if (controlsWrapper) controlsWrapper.remove();
  
  currentVideoState = { id: null, mediaType: null, season: null, episode: null, itemTitle: null, totalEpisodesInSeason: 0, totalSeasons: 0 };
  
  if (document.getElementById("home-tab")?.classList.contains("active")) {
    displayContinueWatching();
  }
}


// ============================================================================
// 6. UI RENDERING: CONTINUE WATCHING & WATCHLIST
// ============================================================================

function displayContinueWatching(filter = 'all', containerId = 'continueWatching-home') {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const watched = getWatchedData();
  let items = Object.values(watched);
  
  if (filter !== 'all') {
    items = items.filter(item => item.media_type === filter);
  }
  items.sort((a, b) => (b.lastWatched || b.addedAt) - (a.lastWatched || a.addedAt));
  
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p>No watched content yet. Start watching now!</p>';
    return;
  }
  
  items.forEach(item => {
    const div = document.createElement('div');
    div.classList.add('movie', 'continue-card');
    const title = item.title || item.name;
    const type = item.media_type === 'movie' ? 'Movie' : 'TV';
    let episodeBadge = '';
    let episodeInfo = '';
    
    if (item.media_type === 'tv' && item.currentSeason && item.currentEpisode) {
      episodeBadge = `<div class="episode-badge">S${item.currentSeason}E${item.currentEpisode}</div>`;
      episodeInfo = ` - S${item.currentSeason}E${item.currentEpisode}`;
    }
    
    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      ${episodeBadge}
      <div class="movie-title">${title} (${type})${episodeInfo}</div>
    `;
    div.onclick = () => showMovieDetails(item, true);
    container.appendChild(div);
  });
}



// ============================================================================
// 7. SEARCH FUNCTIONALITY (TITLE, GENRE, PERSON)
// ============================================================================

/** Fetches keyword/genre matches from TMDB for the search dropdown */
async function fetchKeywordSearch(query) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/keyword?api_key=${apiKey}&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderKeywordDropdown(data.results.slice(0, 8));
  } catch (e) {
    console.warn("Keyword search failed:", e);
  }
}

function renderKeywordDropdown(results) {
  const dropdown = document.getElementById('search-dropdown');
  dropdown.innerHTML = '';
  if (!results || results.length === 0) {
    dropdown.style.display = 'none';
    return;
  }
  results.forEach(kw => {
    const div = document.createElement('div');
    div.className = 'search-dropdown-item';
    div.innerHTML = `
      <div class="search-dropdown-info" style="width:100%">
        <div class="search-dropdown-name">${kw.name}</div>
      </div>
    `;
    div.onclick = () => selectKeyword(kw.id, kw.name);
    dropdown.appendChild(div);
  });
  dropdown.style.display = 'block';
}

async function selectKeyword(keywordId, keywordName) {
  document.getElementById('search-dropdown').style.display = 'none';
  searchInput.value = keywordName;
  searchInput.placeholder = `Searching keyword: ${keywordName}...`;
  isKeywordSearch = true;
  currentKeywordId = keywordId;
  currentFilter = 'all';
  seenKeywordItems.clear();
  
  document.querySelectorAll('.search-filters .filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.search-filters .filter-btn[data-filter="all"]').classList.add('active');
  
  resultsDiv.innerHTML = '<p>Loading movies & shows...</p>';
  currentPage = 1;
  await loadKeywordResults(false);
}

async function loadKeywordResults(append = false) {
  if (!currentKeywordId) return;
  loading = true;
  try {
    const pagesToLoad = append ? [currentPage] : [currentPage, currentPage + 1];
    let newResults = [];
    
    for (const page of pagesToLoad) {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_keywords=${currentKeywordId}&page=${page}`),
        fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_keywords=${currentKeywordId}&page=${page}`)
      ]);
      
      const movieData = await movieRes.json();
      const tvData = await tvRes.json();
      
      const movies = movieData.results.map(m => ({ ...m, media_type: "movie" }));
      const tv = tvData.results.map(t => ({ ...t, media_type: "tv" }));
      const combined = [...movies, ...tv];
      
      const uniqueNew = combined.filter(item => {
        const key = `${item.media_type}_${item.id}`;
        if (seenKeywordItems.has(key)) return false;
        seenKeywordItems.add(key);
        return true;
      });
      newResults = [...newResults, ...uniqueNew];
    }

    newResults.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    displayKeywordResults(newResults, !append);
    currentPage += pagesToLoad.length;
  } catch (error) {
    console.error("Error loading keyword results:", error);
  }
  loading = false;
}

function displayKeywordResults(items, clear = true) {
  if (clear) resultsDiv.innerHTML = "";
  const filteredItems = items.filter(item => {
    if (currentFilter === "all") return true;
    return item.media_type === currentFilter;
  });
  
  if (filteredItems.length === 0 && clear) {
    resultsDiv.innerHTML = "<p>No results found for this filter.</p>";
    return;
  }
  
  filteredItems.forEach(item => {
    if (!item.poster_path) return;
    const div = document.createElement("div");
    div.classList.add("movie");
    const title = item.title || item.name;
    const type = item.media_type === "movie" ? "Movie" : "TV";
    const year = (item.release_date || item.first_air_date || " ").split("-")[0];
    
    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      <div class="movie-title">${title} (${type}) ${year}</div>
    `;

    div.onclick = () => showMovieDetails(item, false);
    resultsDiv.appendChild(div);
  });
}

/** Fetches person/actor matches from TMDB for the search dropdown */
async function fetchPersonSearch(query) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`);
    const data = await res.json();
    renderPersonDropdown(data.results.slice(0, 8));
  } catch (e) {
    console.warn("Person search failed:", e);
  }
}

function renderPersonDropdown(results) {
  const dropdown = document.getElementById('search-dropdown');
  dropdown.innerHTML = '';
  if (!results || results.length === 0) {
    dropdown.style.display = 'none';
    return;
  }
  results.forEach(person => {
    const div = document.createElement('div');
    div.className = 'search-dropdown-item';
    const imgUrl = person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : '';
    const name = person.name;
    const knownForText = person.known_for?.slice(0, 3).map(m => m.title || m.name).join(', ') || '';

    div.innerHTML = `
      ${imgUrl ? `<img src="${imgUrl}" alt="${name}">` : `<div style="width:40px;height:60px;background:#333;border-radius:4px;"></div>`}
      <div class="search-dropdown-info">
        <div class="search-dropdown-name">${name}</div>
        ${knownForText ? `<div class="search-dropdown-known">Known for: ${knownForText}</div>` : ''}
      </div>
    `;

    div.onclick = () => selectPerson(person.id, name);
    dropdown.appendChild(div);
  });
  dropdown.style.display = 'block';
}

async function selectPerson(personId, personName) {
  document.getElementById('search-dropdown').style.display = 'none';
  searchInput.value = personName;
  searchInput.placeholder = `Searching works by ${personName}...`;
  isPersonSearch = true;
  currentFilter = 'all';
  resultsDiv.innerHTML = '<p>Loading filmography...</p>';
  
  document.querySelectorAll('.search-filters .filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.search-filters .filter-btn[data-filter="all"]').classList.add('active');
  
  try {
    const res = await fetch(`https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${apiKey}`);
    const data = await res.json();
    const allWorks = new Map();

    data.cast?.forEach(item => {
      if (item.title || item.name) {
        const key = `${item.media_type}_${item.id}`;
        allWorks.set(key, { ...item, credit_type: 'cast', character: item.character });
      }
    });

    data.crew?.forEach(item => {
      if (item.title || item.name) {
        const key = `${item.media_type}_${item.id}`;
        if (allWorks.has(key)) {
          const existing = allWorks.get(key);
          existing.crew_job = item.job;
          existing.crew_department = item.department;
        } else {
          allWorks.set(key, { ...item, credit_type: 'crew', crew_job: item.job, crew_department: item.department });
        }
      }
    });

    let worksArray = Array.from(allWorks.values());
    worksArray.sort((a, b) => {
      const titleA = (a.title || a.name || '').toLowerCase();
      const titleB = (b.title || b.name || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });

    worksArray.forEach(w => w._personName = personName);
    currentPersonResults = worksArray;
    displayPersonResults(worksArray, false);
  } catch (e) {
    console.error("Failed to load filmography:", e);
    resultsDiv.innerHTML = '<p>Failed to load filmography.</p>';
  }
}

function displayPersonResults(items, append = false) {
  if (!append) resultsDiv.innerHTML = "";
  const filteredItems = items.filter(item => {
    if (currentFilter === "all") return true;
    return item.media_type === currentFilter;
  });
  
  if (filteredItems.length === 0 && !append) {
    resultsDiv.innerHTML = "<p>No results found for this filter.</p>";
    return;
  }
  
  filteredItems.forEach(item => {
    if (!item.poster_path) return;
    const div = document.createElement("div");
    div.classList.add("movie");
    const title = item.title || item.name;
    const type = item.media_type === "movie" ? "Movie" : "TV";
    const year = (item.release_date || item.first_air_date || " ").split("-")[0];
    let badgeHTML = '';
    
    if (currentSearchMode === 'people') {
      const roles = new Set();
      if (item.crew_department) roles.add(item.crew_department);
      if (item.crew_job && item.crew_job !== item.crew_department) roles.add(item.crew_job);
      if (item.credit_type === 'cast') roles.add('Acting');
      
      let roleText = '';
      if (roles.size === 0) roleText = 'Unknown';
      else if (roles.size === 1) roleText = Array.from(roles)[0];
      else roleText = 'Multiple';
      
      badgeHTML = `<div class="role-badge">${roleText}</div>`;
    }

    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      ${badgeHTML}
      <div class="movie-title">${title} (${type})</div>
    `;


    div.onclick = () => {
      const roles = new Set();
      if (item.crew_department) roles.add(item.crew_department);
      if (item.crew_job && item.crew_job !== item.crew_department) roles.add(item.crew_job);
      if (item.credit_type === 'cast') roles.add('Acting');

      const roleStr = roles.size > 0 ? Array.from(roles).join(', ') : 'Unknown';

      showMovieDetails(item, false, { 
        roles: roleStr, 
        personName: item._personName || 'This person' 
      });
    };
    resultsDiv.appendChild(div);
  });
}

/** Calculates a relevance score for search results to prioritize exact matches */
function score(item, query) {
  const title = (item.title || item.name || " ").toLowerCase();
  const q = query.toLowerCase();
  let score = item.popularity || 0;
  if (title === q) score += 1000;
  if (title.startsWith(q)) score += 500;
  if (title.includes(q)) score += 200;
  return score;
}

/** Main search input handler with debouncing for genre/person and immediate execution for title */
searchInput.addEventListener("input", async () => {
  const query = searchInput.value.trim();
  clearTimeout(personSearchTimeout);
  clearTimeout(keywordSearchTimeout);
  
  if (currentSearchMode === 'title') {
    document.getElementById('search-dropdown').style.display = 'none';
    isPersonSearch = false;
    isKeywordSearch = false;
    currentQuery = query;
    currentPage = 1;
    resultsDiv.innerHTML = "";
    if (query.length < 3) return;
    await loadResults();
    return;
  }
  
  if (currentSearchMode === 'genre') {
    isPersonSearch = false;
    if (query.length < 2) {
      document.getElementById('search-dropdown').style.display = 'none';
      return;
    }
    keywordSearchTimeout = setTimeout(() => fetchKeywordSearch(query), 300);
    return;
  }
  
  if (query.length < 2) {
    document.getElementById('search-dropdown').style.display = 'none';
    return;
  }
  personSearchTimeout = setTimeout(() => fetchPersonSearch(query), 300);
});

async function loadResults() {
  if (loading || !currentQuery) return;
  loading = true;
  try {
    const pagesToLoad = (currentPage === 1) ? [1, 2] : [currentPage];
    let allResults = [];
    
    for (const page of pagesToLoad) {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(currentQuery)}&page=${page}`),
        fetch(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(currentQuery)}&page=${page}`)
      ]);
      
      const movieData = await movieRes.json();
      const tvData = await tvRes.json();
      
      const movies = movieData.results.map(m => ({ ...m, media_type: "movie" }));
      const tv = tvData.results.map(t => ({ ...t, media_type: "tv" }));
      allResults = [...allResults, ...movies, ...tv];
    }

    allResults.sort((a, b) => score(b, currentQuery) - score(a, currentQuery));
    const uniqueResults = Array.from(new Map(allResults.map(item => [`${item.media_type}_${item.id}`, item])).values());

    displayResults(uniqueResults, currentPage === 1 ? false : true);
    currentPage += pagesToLoad.length;
  } catch (error) {
    console.error("Error:", error);
  }
  loading = false;
}

function displayResults(items, append = false) {
  if (!append) {
    resultsDiv.innerHTML = "";
    lastSearchResults = items;
  }
  const filteredItems = items.filter(item => {
    if (currentFilter === "all") return true;
    return item.media_type === currentFilter;
  });
  
  filteredItems.forEach(item => {
    if (!item.poster_path) return;
    const div = document.createElement("div");
    div.classList.add("movie");
    const title = item.title || item.name;
    const type = item.media_type === "movie" ? "Movie" : "TV";
    
    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      <div class="movie-title">${title} (${type})</div>
    `;

    div.onclick = () => showMovieDetails(item, false);
    resultsDiv.appendChild(div);
  });
}

// Infinite scroll handler for search results
window.addEventListener("scroll", () => {
  if (isPersonSearch) return;
  if (isKeywordSearch) {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
      loadKeywordResults(true);
    }
    return;
  }
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
    loadResults();
  }
});


// ============================================================================
// 8. MODALS & DETAILS (Movie/TV Info, External Links, Trailers)
// ============================================================================

function renderExternalButtons(tmdbId, modalBody) {
  const data = externalLinksMap.get(String(tmdbId));
  if (!data) return;
  
  if (data.nowhere) {
    const section = document.createElement('div');
    section.className = 'external-services-section';
    section.innerHTML = '<h4 style="margin:10px 0; font-size:14px; color:#aaa;">This feature is on no other streaming services!</h4>';
    const poster = modalBody.querySelector('.modal-poster');
    if (poster) poster.parentNode.insertBefore(section, poster.nextSibling);
    else modalBody.appendChild(section);
    return;
  }
  
  const services = data.services;
  if (!services || services.size === 0) return;
  if (modalBody.querySelector('.external-services-section')) return;
  
  const section = document.createElement('div');
  section.className = 'external-services-section';
  section.innerHTML = '<h4 style="margin:10px 0; font-size:14px; color:#aaa;">Also on:</h4>';
  const btnContainer = document.createElement('div');
  btnContainer.className = 'external-buttons';
  
  services.forEach((serviceData, serviceName) => {
    const btn = document.createElement('button');
    btn.className = 'external-service-btn';
    btn.style.backgroundColor = serviceData.color;
    btn.title = serviceName;
    btn.onclick = (e) => {
      e.stopPropagation();
      window.open(serviceData.link, '_blank', 'noopener,noreferrer');
    };
    const img = document.createElement('img');
    img.src = serviceData.logo;
    img.alt = serviceName;
    img.className = 'service-logo';
    btn.appendChild(img);
    btnContainer.appendChild(btn);
  });
  
  section.appendChild(btnContainer);
  const actionsDiv = modalBody.querySelector('.modal-actions');
  if (actionsDiv) {
    const playBtn = actionsDiv.querySelector('.play-btn');
    if (playBtn) playBtn.after(section);
    else actionsDiv.appendChild(section);
  }
}

async function showMovieDetails(item, fromContinueWatching = false, personRoleData = null) {
  const modal = document.getElementById("movieModal");
  const modalBody = document.getElementById("modalBody");
  if (!modal || !modalBody) return;
  
  modalBody.innerHTML = "<p>Loading...</p>";
  modal.style.display = "block";
  
  try {
    const endpoint = item.media_type === "movie" ? "movie" : "tv";
    const res = await fetch(`https://api.themoviedb.org/3/${endpoint}/${item.id}?api_key=${apiKey}&language=en-US`);
    const data = await res.json();
    
    const title = data.title || data.name;
    const type = item.media_type === "movie" ? "Movie" : "TV Show";
    const releaseDate = data.release_date || data.first_air_date || "N/A";
    const year = releaseDate.split("-")[0];
    const rating = data.vote_average ? data.vote_average.toFixed(1) + "/10" : "N/A";
    const runtime = item.media_type === "movie" && data.runtime ? data.runtime + " min" :
                    item.media_type === "tv" && data.episode_run_time?.[0] ? data.episode_run_time[0] + " min/ep" : "N/A";
    const genres = data.genres?.map(g => g.name).join(", ") || "N/A";

    let roleHTML = '';
    if (personRoleData) {
      const { roles, personName } = personRoleData;
      const isPlural = roles.includes(',') || roles === 'Multiple';
      roleHTML = `<div class="modal-info"><strong>${personName}'s ${isPlural ? 'roles' : 'role'} in ${title} ${isPlural ? 'are' : 'is'}:</strong> ${roles}</div>`;
    }

    const watched = getWatchedData();
    const key = `${item.media_type}_${item.id}`;
    const tracked = watched[key];
    const currentSeason = tracked?.currentSeason || null;
    const currentEpisode = tracked?.currentEpisode || null;
    const isInWatched = tracked !== undefined;

    let isCurrentUnreleased = false;
    if (item.media_type === "tv" && currentSeason !== null && currentEpisode !== null) {
      try {
        const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${item.id}/season/${currentSeason}?api_key=${apiKey}&language=en-US`);
        const sData = await seasonRes.json();
        const ep = sData.episodes?.find(e => e.episode_number == currentEpisode);
        if (ep?.air_date) {
          const airDate = new Date(ep.air_date);
          const today = new Date(); today.setHours(0,0,0,0);
          if (airDate > today) isCurrentUnreleased = true;
        }
      } catch(e) { console.warn("Failed to check episode release date", e); }
    }

    let actionButtonsHTML = "";

    if (item.media_type === "movie") {
      if (isInWatched) {
        actionButtonsHTML = `
          <button class="play-btn" onclick="openVideoPlayer('https://www.vidking.net/embed/movie/${item.id}', '${title.replace(/'/g, "\\'")} (${year})', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}')">
            ▶ Play Movie
          </button>
          <div style="position: relative; display: inline-block;">
          <button class= "action-btn " onclick= "showCollectionDropdown(this, ${item.id}, '${item.media_type}', '${title.replace(/'/g,  "\\' ")}', '${data.poster_path || ''}') " >
            + Add to Collection
          </button >
          <div id="collection-dropdown-${item.id}" class="collection-dropdown" style="display: none; position: absolute; top: 100%; left: 0; background: #333; border-radius: 6px; margin-top: 5px; min-width: 200px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <!-- Options will be populated by JavaScript -->
          </div>
        </div>
        `;
      } else {
        actionButtonsHTML = `
          <button class="play-btn" onclick="openVideoPlayer('https://www.vidking.net/embed/movie/${item.id}', '${title.replace(/'/g, "\\'")} (${year})', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}')">
            ▶ Play Movie
          </button>
          <div style="position: relative; display: inline-block;">
            <button class= "action-btn " onclick= "showCollectionDropdown(this, ${item.id}, '${item.media_type}', '${title.replace(/'/g,  "\\' ")}', '${data.poster_path || ''}') " >
             + Add to Collection
            </button >
            <div id="collection-dropdown-${item.id}" class="collection-dropdown" style="display: none; position: absolute; top: 100%; left: 0; background: #333; border-radius: 6px; margin-top: 5px; min-width: 200px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
              <!-- Options will be populated by JavaScript -->
            </div>
          </div>
        `;
      }
    } else if (item.media_type === "tv") {
      if (isInWatched && currentSeason && currentEpisode) {
        if (isCurrentUnreleased) {
          actionButtonsHTML = `
            <button class="play-btn" disabled style="background:#555;cursor:not-allowed">
              ⏳ Episode has not released yet
            </button>
            <div class="tv-action-group">
              <button class="watched-btn" onclick="removeFromContinueWatching(${item.id}, '${item.media_type}')">
                Remove from Continue Watching
              </button>
            </div>
          `;
        } else {
          actionButtonsHTML = `
            <button class="play-btn" onclick="openVideoPlayer('https://www.vidking.net/embed/tv/${item.id}/${currentSeason}/${currentEpisode}', '${title} - S${currentSeason}E${currentEpisode}', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}', ${currentSeason}, ${currentEpisode})">
              ▶ Play Season ${currentSeason} Episode ${currentEpisode}
            </button>
            <div class="tv-action-group">
              <button class="episode-done-btn" onclick="markEpisodeDone(${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', ${currentSeason}, ${currentEpisode})">
                ✓ I watched this Episode
              </button>
              <button class="watched-btn" onclick="removeFromContinueWatching(${item.id}, '${item.media_type}')">
                Remove from Continue Watching
              </button>
            </div>
          `;
        }
      } else {
        actionButtonsHTML = `
          <button class="play-btn" onclick="openVideoPlayer('https://www.vidking.net/embed/tv/${item.id}/1/1', '${title} - S1E1', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}', 1, 1)">
            ▶ Play Season 1 Episode 1
          </button>
          <div style="position: relative; display: inline-block;">
            <button class= "action-btn " onclick= "showCollectionDropdown(this, ${item.id}, '${item.media_type}', '${title.replace(/'/g,  "\\' ")}', '${data.poster_path || ''}') " >
             + Add to Collection
            </button >
            <div id="collection-dropdown-${item.id}" class="collection-dropdown" style="display: none; position: absolute; top: 100%; left: 0; background: #333; border-radius: 6px; margin-top: 5px; min-width: 200px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
              <!-- Options will be populated by JavaScript -->
            </div>
          </div>
        `;
      }
    }

    let modalHTML = `
      ${data.poster_path ? `<img class="modal-poster" src="https://image.tmdb.org/t/p/w500${data.poster_path}" alt="${title}">` : ""}
      <h2 class="modal-title">${title} (${year})</h2>
      <div class="modal-info">${type} • ${rating} • ${runtime}</div>
      <div class="modal-info"><strong>Genres:</strong> ${genres}</div>
      ${roleHTML}
      <p class="modal-overview">${data.overview || "No overview available."}</p>
      <div class="modal-actions">
        ${actionButtonsHTML}
      </div>
    `;

    if (item.media_type === "tv" && data.seasons?.length > 0) {
      modalHTML += `<div class="seasons-container"><h3 style="margin:15px 0 10px;">Seasons & Episodes</h3>`;
      
      const numberedSeasons = data.seasons.filter(s => s.season_number > 0);
      const specialsSeason = data.seasons.find(s => s.season_number === 0);
      
      for (const season of numberedSeasons) {
        const isCurrentSeason = currentSeason === season.season_number;
        modalHTML += `
          <button class="season-toggle ${isCurrentSeason ? 'current' : ''}" data-season="${season.season_number}">
            ${season.name} <span style="color:#888;font-size:14px">(${season.episode_count || '?'} eps)</span>
          </button>
          <div class="episodes-list" id="episodes-s${season.season_number}">
            <div class="episode-loading">Loading episodes...</div>
          </div>
        `;
      }
      
      if (specialsSeason) {
        const isCurrentSeason = currentSeason === 0;
        modalHTML += `
          <button class="season-toggle ${isCurrentSeason ? 'current' : ''}" data-season="0">
            Extras <span style="color:#888;font-size:14px">(${specialsSeason.episode_count || '?'} Extras)</span>
          </button>
          <div class="episodes-list" id="episodes-s0">
            <div class="episode-loading">Loading episodes...</div>
          </div>
        `;
      }
      modalHTML += `</div>`;
    }

    modalBody.innerHTML = modalHTML;
    renderExternalButtons(item.id, modalBody);

    // Async trailer button injection
    (async () => {
      try {
        const trailerBtnContainer = document.createElement('div');
        trailerBtnContainer.id = 'trailer-btn-container';
        trailerBtnContainer.style.cssText = 'text-align:center;margin:15px 0;';
        trailerBtnContainer.innerHTML = '<button class="action-btn" disabled style="opacity:0.7">🎬 Loading trailer...</button>';
        
        const actionsEl = modalBody.querySelector('.modal-actions');
        if (actionsEl) actionsEl.appendChild(trailerBtnContainer);
        else modalBody.appendChild(trailerBtnContainer);
        
        const trailerUrl = await fetchTrailerUrl(item.id, item.media_type);
        
        if (trailerUrl) {
          const safeTitle = (data.title || data.name || 'Trailer').replace(/'/g, "\\'");
          trailerBtnContainer.innerHTML = `
            <button class="trailer-btn" onclick="openTrailer('${trailerUrl}', '${safeTitle} - Trailer')">
              🎬 Play Trailer
            </button>
          `;
        } else {
          trailerBtnContainer.innerHTML = '';
        }
      } catch (e) {
        console.warn('Trailer button injection failed:', e);
        const container = document.getElementById('trailer-btn-container');
        if (container) container.innerHTML = '';
      }
    })();

    // Season/Episode toggle logic
    if (item.media_type === "tv") {
      document.querySelectorAll('.season-toggle').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const seasonNum = parseInt(btn.dataset.season);
          const episodesContainer = document.getElementById(`episodes-s${seasonNum}`);
          const isActive = btn.classList.toggle('active');
          
          if (isActive && !episodesContainer.dataset.loaded) {
            try {
              const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${item.id}/season/${seasonNum}?api_key=${apiKey}&language=en-US`);
              const seasonData = await seasonRes.json();
              
              if (seasonData.episodes?.length > 0) {
                const today = new Date(); today.setHours(0,0,0,0);
                
                episodesContainer.innerHTML = seasonData.episodes.map(ep => {
                  const epTitle = (ep.name || 'Episode ' + ep.episode_number).replace(/'/g, "\\'");
                  const videoTitle = `${title} - S${seasonNum}E${ep.episode_number}: ${ep.name}`.replace(/'/g, "\\'");
                  const isCurrentEpisode = currentSeason == seasonNum && currentEpisode == ep.episode_number;
                  const episodeNumberDisplay = seasonNum == 0 ? '' : `<span class="episode-number">E${ep.episode_number}</span>`;
                  
                  const airDate = ep.air_date ? new Date(ep.air_date) : null;
                  const isUnreleased = airDate && airDate > today;
                  
                  const playBtnHTML = isUnreleased 
                    ? `<span class="episode-play disabled" title="Not released yet" style="background:#555;cursor:not-allowed">⏳</span>`
                    : `<button class="episode-play" title="Play episode"
                       onclick="openVideoPlayer('https://www.vidking.net/embed/tv/${item.id}/${seasonNum}/${ep.episode_number}', '${videoTitle}', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}', ${seasonNum}, ${ep.episode_number})">
                       ▶
                       </button>`;
                  
                  const unreleasedMsgHTML = isUnreleased 
                    ? `<span class="episode-unreleased" style="color:#ff6b6b;font-size:12px;font-weight:600;margin:0 8px">This episode has not released yet</span>` 
                    : '';
                  
                  return `
                    <div class="episode-item ${isCurrentEpisode ? 'current' : ''} ${isUnreleased ? 'unreleased' : ''}" ${isUnreleased ? 'style="opacity:0.7"' : ''}>
                      <div class="episode-actions">
                        ${playBtnHTML}
                      </div>
                      ${episodeNumberDisplay}
                      <span class="episode-title">${ep.name}</span>
                      ${unreleasedMsgHTML}
                      <span class="episode-date">${ep.air_date || 'TBA'}</span>
                    </div>
                  `;
                }).join('');
              } else {
                episodesContainer.innerHTML = '<div class="no-episodes">No episodes listed</div>';
              }
              episodesContainer.dataset.loaded = "true";
            } catch (err) {
              console.error("Error loading season: ", err);
              episodesContainer.innerHTML = '<div class="no-episodes" style="color:#e50914">Failed to load episodes</div>';
            }
          }
          episodesContainer.classList.toggle('show', isActive);
        };
      });
    }
  } catch (error) {
    console.error("Error fetching details: ", error);
    modalBody.innerHTML = "<p>Failed to load details. Please try again.</p>";
  }
}

function openTrailer(url, title) {
  const modal = document.getElementById("videoModal");
  const titleEl = document.getElementById("videoTitle");
  const container = document.querySelector(".video-container");
  if (!modal || !container) return;
  
  modal.style.display = "block";
  titleEl.textContent = title || "Trailer";
  document.body.style.overflow = "hidden";
  container.innerHTML = '';
  
  const debugEl = document.getElementById('video-timeline-debug');
  if (debugEl) debugEl.style.display = 'none';
  const controls = document.getElementById('videoControls');
  if (controls) controls.remove();
  
  if (url.toLowerCase().endsWith('.mp4')) {
    const videoEl = document.createElement('video');
    videoEl.src = url;
    videoEl.controls = true;
    videoEl.autoplay = true;
    videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
    container.appendChild(videoEl);
  } else {
    const iframe = document.createElement('iframe');
    iframe.allowFullscreen = true;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; clipboard-write";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.sandbox = "allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-presentation";
    iframe.loading = "lazy";
    iframe.src = url;
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#000;';
    
    let loadTimeout = setTimeout(() => {
      if (!iframe._loaded) {
        container.innerHTML = `
          <div style="color:white;text-align:center;padding:40px;font-family:sans-serif;">
            <p style="font-size:18px;margin-bottom:20px;">⚠️ Trailer cannot be embedded.</p>
            <a href="${url.replace('/embed/', '/watch?v=')}" target="_blank" 
              style="background:#e50914;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">
              ▶ Watch on YouTube instead
            </a>
          </div>
        `;
      }
    }, 5000);

    iframe.onload = () => { clearTimeout(loadTimeout); iframe._loaded = true; };
    iframe.onerror = () => {
      clearTimeout(loadTimeout);
      container.innerHTML = `<div style="color:white;text-align:center;padding:40px;">⚠️ Failed to load trailer.<br><a href="${url.replace('/embed/', '/watch?v=')}" target="_blank" style="color:#0d6efd;">Open externally →</a></div>`;
    };

    container.appendChild(iframe);
  }
}

function toggleWatchlistFromModal(id, mediaType, title, posterPath) {
    const item = { id, media_type: mediaType, title, poster_path: posterPath };
    const watchlist = getWatchlist();
    const exists = watchlist.some(w => w.id === id && w.media_type === mediaType);
    
    if (exists) {
        removeFromWatchlist(item);
    } else {
        addToWatchlist(item);
    }
    
    // Refresh collections view if it's currently open
    const collectionsWatchlistView = document.getElementById('collections-watchlist-view');
    if (collectionsWatchlistView && collectionsWatchlistView.style.display === 'block') {
        renderWatchlistInCollections();
    }
    
    // Also update folder counts
    updateFolderCounts();
    
    document.getElementById("movieModal").style.display = "none";
}

function removeFromContinueWatching(id, mediaType) {
  const watched = getWatchedData();
  const key = `${mediaType}_${id}`;
  const item = watched[key];
  let season = null;
  let episode = null;
  if (item) {
    season = item.currentSeason;
    episode = item.currentEpisode;
  }
  removeFromWatched(id, mediaType, season, episode);
  document.getElementById("movieModal").style.display = "none";
  displayContinueWatching();
}

async function markEpisodeDone(id, mediaType, title, currentSeason, currentEpisode) {
  if (currentSeason === 0) {
    alert("Extras progress is not tracked in Continue Watching.");
    return;
  }
  let nextSeason, nextEpisode;
  let isNextUnreleased = false;
  
  try {
    const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${currentSeason}?api_key=${apiKey}&language=en-US`);
    if (!seasonRes.ok) throw new Error("Failed to fetch season data");
    const seasonData = await seasonRes.json();
    const totalEpisodes = seasonData.episodes?.length || 0;
    
    if (currentEpisode >= totalEpisodes) {
      const showRes = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=en-US`);
      if (!showRes.ok) throw new Error("Failed to fetch show data");
      const showData = await showRes.json();
      const totalSeasons = showData.seasons?.filter(s => s.season_number > 0).length || 0;
      
      if (currentSeason >= totalSeasons) {
        removeFromWatched(id, mediaType);
        displayContinueWatching();
        updateModalToUnwatchedState(id, title);
        return;
      }
      nextSeason = currentSeason + 1;
      nextEpisode = 1;
      
      try {
        const nextSeasonRes = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${nextSeason}?api_key=${apiKey}&language=en-US`);
        const nextSeasonData = await nextSeasonRes.json();
        const firstEp = nextSeasonData.episodes?.[0];
        if (firstEp?.air_date) {
          const airDate = new Date(firstEp.air_date);
          const today = new Date(); today.setHours(0,0,0,0);
          if (airDate > today) isNextUnreleased = true;
        }
      } catch(e) { console.warn("Failed to check next season release", e); }
      
    } else {
      nextSeason = currentSeason;
      nextEpisode = currentEpisode + 1;
      
      const nextEp = seasonData.episodes?.find(ep => ep.episode_number === nextEpisode);
      if (nextEp?.air_date) {
        const airDate = new Date(nextEp.air_date);
        const today = new Date(); today.setHours(0,0,0,0);
        if (airDate > today) isNextUnreleased = true;
      }
    }

    updateTVEpisode(id, mediaType, nextSeason, nextEpisode);
  } catch (error) {
    console.error("Data save failed:", error);
    alert("Failed to update progress. Please try again.");
    return;
  }
  
  try {
    displayContinueWatching();
    if (isNextUnreleased) {
      updateModalToUnreleasedState(id, title, nextSeason, nextEpisode);
    } else {
      updateModalUI(id, mediaType, title, nextSeason, nextEpisode);
    }
  } catch (uiError) {
    console.warn("UI refresh skipped (data saved successfully): ", uiError);
  }
}

function updateModalUI(id, mediaType, title, nextSeason, nextEpisode) {
  const posterPath = document.querySelector('.modal-poster')?.getAttribute('src')?.split('/w500')[1] || '';
  const modalActions = document.querySelector('.modal-actions');
  
  if (modalActions) {
    modalActions.innerHTML = `
      <button class="play-btn" id="tempPlayBtn" onclick="openVideoPlayer('https://www.vidking.net/embed/tv/${id}/${nextSeason}/${nextEpisode}', '${title.replace(/'/g, "\\'")} - S${nextSeason}E${nextEpisode}', ${id}, '${mediaType}', '${title.replace(/'/g, "\\'")}', '${posterPath}', ${nextSeason}, ${nextEpisode})">
        ▶ Play Season ${nextSeason} Episode ${nextEpisode}
      </button>
      <div class="tv-action-group">
        <button class="episode-done-btn" onclick="markEpisodeDone(${id}, '${mediaType}', '${title.replace(/'/g, "\\'")}', ${nextSeason}, ${nextEpisode})">
          ✓ I watched this Episode
        </button>
        <button class="watched-btn" onclick="removeFromContinueWatching(${id}, '${mediaType}')">
          Remove from Continue Watching
        </button>
      </div>
    `;
    
    setTimeout(() => {
      const playBtn = modalActions.querySelector('#tempPlayBtn');
      if (playBtn) {
        playBtn.classList.remove('pulse-yellow');
        void playBtn.offsetWidth;
        playBtn.classList.add('pulse-yellow');
        
        setTimeout(() => {
          playBtn.innerHTML = `▶ Play Season ${nextSeason} Episode ${nextEpisode}`;
          playBtn.removeAttribute('id');
        }, 400);
        
        playBtn.addEventListener('animationend', () => {
          playBtn.classList.remove('pulse-yellow');
        }, { once: true });
      }
    }, 50);
  }
  
  document.querySelectorAll('.episode-item.current').forEach(el => el.classList.remove('current'));
  const seasonContainer = document.getElementById(`episodes-s${nextSeason}`);
  if (seasonContainer) {
    if (!seasonContainer.classList.contains('show')) {
      seasonContainer.classList.add('show');
      const btn = document.querySelector(`.season-toggle[data-season="${nextSeason}"]`);
      if (btn) btn.classList.add('active');
    }
    const epItems = seasonContainer.querySelectorAll('.episode-item');
    epItems.forEach(item => {
      const numSpan = item.querySelector('.episode-number');
      if (numSpan && numSpan.textContent.trim() === `E${nextEpisode}`) {
        item.classList.add('current');
      } else if (!numSpan && nextSeason == 0) {
        const index = Array.from(epItems).indexOf(item);
        if (index === nextEpisode - 1) item.classList.add('current');
      }
    });
  }
  
  document.querySelectorAll('.season-toggle.current').forEach(el => el.classList.remove('current'));
  const nextSeasonBtn = document.querySelector(`.season-toggle[data-season="${nextSeason}"]`);
  if (nextSeasonBtn) nextSeasonBtn.classList.add('current');
}

function updateModalToUnwatchedState(id, title) {
  const posterPath = document.querySelector('.modal-poster')?.getAttribute('src')?.split('/w500')[1] || '';
  const modalActions = document.querySelector('.modal-actions');
  if (modalActions) {
    modalActions.innerHTML = `
      <button class="play-btn" onclick="openVideoPlayer('https://www.vidking.net/embed/tv/${id}/1/1', '${title.replace(/'/g, "\\'")} - S1E1', ${id}, 'tv', '${title.replace(/'/g, "\\'")}', '${posterPath}', 1, 1)">
        ▶ Play Season 1 Episode 1
      </button>
      <div style="position: relative; display: inline-block;">
        <button class="action-btn" onclick="showCollectionDropdown(this, ${id}, 'tv', '${title.replace(/'/g, "\\'")}', '${posterPath}')">
          + Add to Collection
        </button>
        <div id="collection-dropdown-${id}" class="collection-dropdown" style="display: none; position: absolute; top: 100%; left: 0; background: #333; border-radius: 6px; margin-top: 5px; min-width: 200px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <!-- Options will be populated by JavaScript -->
        </div>
      </div>
    `;
  }
  document.querySelectorAll('.episode-item.current, .season-toggle.current').forEach(el => el.classList.remove('current'));
}

function updateModalToUnreleasedState(id, title, nextSeason, nextEpisode) {
  const modalActions = document.querySelector('.modal-actions');
  if (modalActions) {
    modalActions.innerHTML = `
      <button class="play-btn" disabled style="background:#555;cursor:not-allowed">
        ⏳ Episode has not released yet
      </button>
      <div class="tv-action-group">
        <button class="watched-btn" onclick="removeFromContinueWatching(${id}, 'tv')">
          Remove from Continue Watching
        </button>
      </div>
    `;
  }
  document.querySelectorAll('.episode-item.current').forEach(el => el.classList.remove('current'));
  const seasonContainer = document.getElementById(`episodes-s${nextSeason}`);
  if (seasonContainer) {
    if (!seasonContainer.classList.contains('show')) {
      seasonContainer.classList.add('show');
      const btn = document.querySelector(`.season-toggle[data-season="${nextSeason}"]`);
      if (btn) btn.classList.add('active');
    }
    const epItems = seasonContainer.querySelectorAll('.episode-item');
    epItems.forEach(item => {
      const numSpan = item.querySelector('.episode-number');
      if (numSpan && numSpan.textContent.trim() === `E${nextEpisode}`) {
        item.classList.add('current');
      }
    });
  }
  document.querySelectorAll('.season-toggle.current').forEach(el => el.classList.remove('current'));
  const nextSeasonBtn = document.querySelector(`.season-toggle[data-season="${nextSeason}"]`);
  if (nextSeasonBtn) nextSeasonBtn.classList.add('current');
}

async function openVideoPlayer(url, title, id, mediaType, itemTitle, posterPath, season = null, episode = null) {
  const modal = document.getElementById("videoModal");
  const titleEl = document.getElementById("videoTitle");
  if (!modal) return;
  
  const watchlistItem = { id, media_type: mediaType, title: itemTitle, poster_path: posterPath };
  removeFromWatchlist(watchlistItem);
  addToWatched({ id, media_type: mediaType, title: itemTitle, poster_path: posterPath }, season, episode);
  
  setVideoSource(id, mediaType, season, episode, url, true);
  
  let displayTitle = title || "Now Playing";
  if (mediaType.trim() === "tv" && season === 0) {
    displayTitle = displayTitle.replace(/ - S0E(\d+)/, `- Extra $1`);
  }
  titleEl.textContent = displayTitle;
  modal.style.display = "block";
  document.body.style.overflow = "hidden";
  
  
  if (mediaType.trim() === "tv" && season !== null && episode !== null) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${apiKey}&language=en-US`);
      const seasonData = await res.json();
      const epData = seasonData.episodes?.find(ep => ep.episode_number === episode);
      if (epData && epData.name) {
        const epTag = season === 0 ? `Extra ${episode}` : `S${season}E${episode}`;
        titleEl.textContent = `${itemTitle} - ${epTag}: ${epData.name}`;
      }
    } catch (err) { console.warn("Failed to fetch episode name: ", err); }
  }
  
  setupVideoControls(id, mediaType, season, episode, itemTitle);
}


// ============================================================================
// 9. NEW ADDITIONS & TAB MANAGEMENT
// ============================================================================

async function loadNewAdditions(tabName = 'home', append = false) {
  const state = tabState[tabName];
  if (!state || state.loading) return;
  state.loading = true;
  const containerId = `newAdditions-${tabName}`;
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`⚠️ Container #${containerId} not found.`);
    state.loading = false;
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const cacheKey = `newReleasesCache_${tabName}`;
  const cache = JSON.parse(localStorage.getItem(cacheKey) || "{}");

  if (!append && cache.date === todayStr && cache.data) {
    console.log(`📦 Using cached new releases for ${tabName} (${todayStr})`);
    state.seenIds.clear();
    cache.data.forEach(item => state.seenIds.add(`${item.media_type}_${item.id}`));
    displayNewAdditions(cache.data, true, container, tabName === 'movies');
    state.loading = false;
    return;
  }

  if (!append) {
    state.seenIds.clear();
    container.innerHTML = "<p>Loading...</p>";
    state.page = 1;
  }

  try {
    const [moviesRes, tvRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${apiKey}&page=${state.page}`),
      fetch(`https://api.themoviedb.org/3/tv/on_the_air?api_key=${apiKey}&page=${state.page}`)
    ]);
    const moviesData = await moviesRes.json();
    const tvData = await tvRes.json();
    
    let combined = [
      ...(moviesData.results || []).map(m => ({...m, media_type: 'movie'})),
      ...(tvData.results || []).map(t => ({...t, media_type: 'tv'}))
    ];

    const filters = { home: 'all', movies: 'movie', tv: 'tv' };
    const filter = filters[tabName] || 'all';
    if (filter !== 'all') combined = combined.filter(i => i.media_type === filter);

    const uniqueCombined = combined.filter(item => {
      const key = `${item.media_type}_${item.id}`;
      if (state.seenIds.has(key)) return false;
      state.seenIds.add(key);
      return true;
    });

    uniqueCombined.sort((a, b) => new Date(b.release_date || b.first_air_date || 0) - new Date(a.release_date || a.first_air_date || 0));

    if (state.page === 1) {
      localStorage.setItem(cacheKey, JSON.stringify({ date: todayStr, data: uniqueCombined }));
    }

    displayNewAdditions(uniqueCombined, !append, container, tabName === 'movies');
    state.page++;
  } catch (e) {
    console.error("Error loading new additions:", e);
    if (!append) container.innerHTML = '<p>Failed to load new additions</p>';
  }
  state.loading = false;
}

function displayNewAdditions(items, clear = true, container, hideMovieBadge = false) {
  if (clear) container.innerHTML = '';
  const currentYear = new Date().getFullYear();
  
  items.forEach(item => {
    if (!item.poster_path) return;
    const div = document.createElement('div');
    div.classList.add('movie');
    const title = item.title || item.name;
    const type = item.media_type === 'movie' ? 'Movie' : 'TV';
    const releaseDate = item.release_date || item.first_air_date || '';
    const year = releaseDate.split('-')[0];
    let badgeHTML = '';
    
    if (!(hideMovieBadge && item.media_type === 'movie')) {
      let badgeText = "New Movie";
      let badgeClass = "release-badge movie";

      if (item.media_type === "tv") {
        badgeText = (year === String(currentYear)) ? "New Show" : "New Episodes";
        badgeClass = badgeText === "New Show" ? "release-badge show" : "release-badge episodes";
      }
      badgeHTML = `<div class="${badgeClass}">${badgeText}</div>`;
    }

    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      ${badgeHTML}
      <div class="movie-title">${title} (${type}) ${year}</div>
    `;
    div.onclick = () => showMovieDetails(item, false);
    container.appendChild(div);
  });
}

// ============================================================================
// COLLECTIONS LOGIC
// ============================================================================

// --- State Variables ---
let currentEditingFolder = 'watchlist'; 
let folderDisplaySettings = new Map(); 
let currentIconType = 'text';
let currentFolderIcon = '📁'; 

// Get all collections (watchlist + custom folders)
function getAllCollections() {
  const collections = [];
  
  // Add watchlist as default collection
  collections.push({ id: 'watchlist', name: 'My Watchlist' });
  
  // Get custom collections from DOM
  const customFolders = document.querySelectorAll('.collection-folder.custom-folder');
  customFolders.forEach(folder => {
    const folderId = folder.id;
    const folderName = folder.querySelector('.folder-name').textContent;
    collections.push({ id: folderId, name: folderName });
  });
  
  return collections;
}

// Get items in a specific collection
function getCollectionItems(collectionId) {
    if (collectionId === 'watchlist') {
        return getWatchlist();
    }
    const key = `collection_${collectionId}`;
    return JSON.parse(localStorage.getItem(key) || "[]");
}

// Save items to a specific collection
function saveCollectionItems(collectionId, items) {
    if (collectionId === 'watchlist') {
        saveWatchlist(items);
        return;
    }
    const key = `collection_${collectionId}`;
    localStorage.setItem(key, JSON.stringify(items));
}

// Check if item is in collection
function isInCollection(collectionId, item) {
  const items = getCollectionItems(collectionId);
  return items.some(i => i.id === item.id && i.media_type === item.media_type);
}

// Add item to collection
function addToCollection(collectionId, item) {
    if (isInCollection(collectionId, item)) return;
    const items = getCollectionItems(collectionId);
    items.push({ id: item.id, media_type: item.media_type, title: item.title, poster_path: item.poster_path, addedAt: Date.now() });
    saveCollectionItems(collectionId, items);
    updateFolderCounts();
    saveCollectionsState(); // ✅ Sync to string array
}

function removeFromCollection(collectionId, item) {
    const items = getCollectionItems(collectionId);
    const filtered = items.filter(i => !(i.id === item.id && i.media_type === item.media_type));
    saveCollectionItems(collectionId, filtered);
    updateFolderCounts();
    saveCollectionsState(); // ✅ Sync to string array
}

// Show collection dropdown
function showCollectionDropdown(button, id, mediaType, title, posterPath) {
  const dropdownId = `collection-dropdown-${id}`;
  const dropdown = document.getElementById(dropdownId);
  const collections = getAllCollections();
  
  // Toggle dropdown visibility
  if (dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
    return;
  }
  
  // Hide all other dropdowns
  document.querySelectorAll('.collection-dropdown').forEach(d => d.style.display = 'none');
  
  // Populate dropdown
  let optionsHTML = '';
  collections.forEach(collection => {
    const inCollection = isInCollection(collection.id, { id, media_type: mediaType });
    const checkmark = inCollection ? '✓ ' : '';
    optionsHTML += `
      <div onclick="addToCollectionFromDropdown('${collection.id}', ${id}, '${mediaType}', '${title.replace(/'/g, "\\'")}', '${posterPath}', '${collection.name}')" 
           style="padding: 10px 15px; cursor: pointer; border-bottom: 1px solid #444; display: flex; justify-content: space-between; align-items: center;">
        <span>${checkmark}${collection.name}</span>
        ${inCollection ? '<span style="color: #28a745; font-size: 12px;">Added</span>' : ''}
      </div>
    `;
  });
  
  dropdown.innerHTML = optionsHTML;
  dropdown.style.display = 'block';
  
  // Close dropdown when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closeDropdown(e) {
      if (!dropdown.contains(e.target) && e.target !== button) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeDropdown);
      }
    });
  }, 100);
}

// Add item to collection from dropdown
function addToCollectionFromDropdown(collectionId, id, mediaType, title, posterPath, collectionName) {
  const item = { id, media_type: mediaType, title, poster_path: posterPath };
  
  if (isInCollection(collectionId, item)) {
    // Remove from collection
    removeFromCollection(collectionId, item);
  } else {
    // Add to collection
    addToCollection(collectionId, item);
  }
  
  // Hide dropdown
  const dropdown = document.getElementById(`collection-dropdown-${id}`);
  if (dropdown) {
    dropdown.style.display = 'none';
  }
  
  // Refresh modal to update button state
  const modal = document.getElementById("movieModal");
  if (modal && modal.style.display === "block") {
    const currentItem = { id, media_type: mediaType, title, poster_path: posterPath };
    showMovieDetails(currentItem, false);
  }
}

// --- Folder Navigation ---
function openCollection(type) {
  if (type === 'watchlist') {
    document.getElementById('collections-folder-view').style.display = 'none';
    document.getElementById('collections-watchlist-view').style.display = 'block';
    renderWatchlistInCollections();
  }
}

function closeCollection() {
  document.getElementById('collections-watchlist-view').style.display = 'none';
  document.getElementById('collections-folder-view').style.display = 'grid';
  updateFolderCounts();
  currentEditingFolder = 'watchlist';
}

function openCustomCollection(folderId, folderName) {
  currentEditingFolder = folderId;
  document.getElementById('collections-folder-view').style.display = 'none';
  document.getElementById('collections-custom-view').style.display = 'block';
  const folderEl = document.getElementById(folderId);
  const currentFolderName = folderEl?.querySelector('.folder-name')?.textContent || folderName;
  document.getElementById('custom-collection-title').textContent = currentFolderName;
  renderCustomCollection();
}

function closeCustomCollection() {
  document.getElementById('collections-custom-view').style.display = 'none';
  document.getElementById('collections-folder-view').style.display = 'grid';
  currentEditingFolder = 'watchlist';
}

// --- Rendering ---
function renderWatchlistInCollections() {
  const container = document.getElementById('collections-watchlist-grid');
  const watchlist = getWatchlist();
  container.innerHTML = '';
  
  if (watchlist.length === 0) {
    container.innerHTML = '<p class="empty-state">Your watchlist is empty.</p>';
    return;
  }

  watchlist.forEach(item => {
    const div = document.createElement('div');
    div.classList.add('movie');
    const title = item.title || item.name;
    const type = item.media_type === 'movie' ? 'Movie' : 'TV';
    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      <div class="movie-title">${title} (${type})</div>
    `;
    div.onclick = () => showMovieDetails(item, false);
    container.appendChild(div);
  });
}

function renderCustomCollection() {
    const container = document.getElementById('collections-custom-grid');
    const items = getCollectionItems(currentEditingFolder);
    container.innerHTML = '';
    
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="empty-state">This collection is empty.</p>';
        return;
    }
    
    items.forEach(item => {
        const div = document.createElement('div');
        div.classList.add('movie');
        const title = item.title || item.name;
        const type = item.media_type === 'movie' ? 'Movie' : 'TV';
        div.innerHTML = `
            <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
            <div class="movie-title">${title} (${type})</div>
        `;
        div.onclick = () => showMovieDetails(item, false);
        container.appendChild(div);
    });
}

function updateFolderCounts() {
    // 1. Update Watchlist count
    const watchlist = getWatchlist();
    const watchlistCountEl = document.getElementById('watchlist-folder-count');
    if (watchlistCountEl) {
        watchlistCountEl.textContent = `${watchlist.length} item${watchlist.length !== 1 ? 's' : ''}`;
    }
    
    // 2. Update Custom Folder counts
    const customFolders = document.querySelectorAll('.collection-folder.custom-folder');
    customFolders.forEach(folder => {
        const folderId = folder.id;
        const countEl = folder.querySelector('.folder-count');
        if (countEl) {
            const items = getCollectionItems(folderId);
            countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
        }
    });
}

/** Escapes a string for safe CSV storage (handles commas/quotes in names or URLs) */
function escapeCSV(str) {
    if (str === null || str === undefined) return '""';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** Exports ONE specific collection to a single independent string */
function exportCollectionToString(collectionId) {
    const isWatchlist = collectionId === 'watchlist';
    const collectionName = isWatchlist ? 'My Watchlist' : 
        (document.getElementById(collectionId)?.querySelector('.folder-name')?.textContent || 'Unknown');
    
    const folderEl = document.getElementById(isWatchlist ? 'folder-watchlist' : collectionId);
    let iconType = 'Text';
    let iconInfo = '📁';
    let iconSize = 100; // Default to 100 for custom folders

    if (isWatchlist) {
        // ✅ Bug Fix 2: Watchlist icon size should always be 0
        iconSize = 0;
    } else if (folderEl) {
        const iconEl = folderEl.querySelector('.folder-icon');
        const img = iconEl?.querySelector('img');
        
        if (img && img.src) {
            iconType = 'Image';
            iconInfo = img.src;
            iconSize = parseInt(img.style.width) || 100;
        } else {
            iconType = 'Text';
            iconInfo = iconEl?.textContent.trim() || '📁';
            
            // ✅ Bug Fix 1: Use inline style if available, otherwise default to 100. 
            // This prevents accidentally capturing the browser's default 16px font size.
            iconSize = parseInt(iconEl?.style.fontSize) || 100;
        }
    }

    // 2. Get Display Toggles (T/F)
    let showName = 'T';
    let showCount = 'T';
    if (!isWatchlist) {
        const settings = folderDisplaySettings.get(collectionId) || { showName: true, showCount: true };
        showName = settings.showName ? 'T' : 'F';
        showCount = settings.showCount ? 'T' : 'F';
    }

    // 3. Get Items (T{id} or M{id})
    const items = getCollectionItems(collectionId);
    const itemStrings = items.map(item => {
        const prefix = item.media_type === 'tv' ? 'T' : 'M';
        return `${prefix}${item.id}`;
    });

    // 4. Combine into ONE single string
    const row = [
        escapeCSV(collectionId),
        escapeCSV(collectionName),
        escapeCSV(iconType),
        escapeCSV(iconInfo),
        iconSize,
        showName,
        showCount,
        ...itemStrings
    ].join(',');
    
    return row;
}

/** Parses a single CSV line, respecting quoted fields */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++; 
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

/** Imports a SINGLE collection from a string, with strict validation */
/** Imports collections from a CSV string, fetching metadata for each item */
async function importCollectionFromString(csvString) {
    if (!csvString || !csvString.trim()) {
        alert("Import string is empty.");
        return;
    }

    const lines = csvString.trim().split('\n');
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        if (!line.trim()) continue;
        
        try {
            const fields = parseCSVLine(line);
            
            // ✅ FIX: Detect format and shift indices accordingly
            const isNewFormat = fields.length >= 7 && (fields[0].trim() === 'watchlist' || fields[0].trim().startsWith('folder-'));
            let folderId, name, iconType, iconInfo, iconSizeStr, showNameStr, showCountStr, itemsRaw;

            if (isNewFormat) {
                folderId = fields[0].trim();
                name = fields[1].trim();
                iconType = fields[2].trim();
                iconInfo = fields[3].trim();
                iconSizeStr = fields[4].trim();
                showNameStr = fields[5].trim().toUpperCase();
                showCountStr = fields[6].trim().toUpperCase();
                itemsRaw = fields.slice(7);
            } else {
                folderId = 'folder-' + Date.now() + Math.random().toString(36).substr(2, 5);
                name = fields[0].trim();
                iconType = fields[1].trim();
                iconInfo = fields[2].trim();
                iconSizeStr = fields[3].trim();
                showNameStr = fields[4].trim().toUpperCase();
                showCountStr = fields[5].trim().toUpperCase();
                itemsRaw = fields.slice(6);
            }

            // --- STRICT VALIDATION ---
            if (iconType !== 'Text' && iconType !== 'Image') throw new Error(`Invalid IconType: "${iconType}".`);
            if (iconType === 'Text' && iconInfo.length > 3) throw new Error(`IconInfo for Text must be ≤ 3 chars. Got: "${iconInfo}".`);
            
            const iconSize = parseInt(iconSizeStr, 10);
            if (isNaN(iconSize) || iconSize < 0 || iconSize > 120) throw new Error(`Invalid IconSize: "${iconSizeStr}". Must be 0-120.`);
            if (showNameStr !== 'T' && showNameStr !== 'F') throw new Error(`Invalid ShowCollectionName: "${showNameStr}". Must be 'T' or 'F'.`);
            if (showCountStr !== 'T' && showCountStr !== 'F') throw new Error(`Invalid ShowItemCount: "${showCountStr}". Must be 'T' or 'F'.`);

            // --- FETCH METADATA ---
            const parsedItems = [];
            for (const itemStr of itemsRaw) {
                const match = itemStr.trim().match(/^([TM])(\d+)$/);
                if (!match) throw new Error(`Invalid item format: "${itemStr}". Must be 'T' or 'M' + numbers.`);
                
                const mediaType = match[1] === 'T' ? 'tv' : 'movie';
                const id = parseInt(match[2], 10);
                
                try {
                    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${apiKey}&language=en-US`);
                    if (res.ok) {
                        const data = await res.json();
                        parsedItems.push({
                            id: id, media_type: mediaType,
                            title: data.title || data.name || "Unknown",
                            poster_path: data.poster_path, addedAt: Date.now()
                        });
                    } else {
                        parsedItems.push({ id, media_type: mediaType, title: "Unknown", poster_path: null, addedAt: Date.now() });
                    }
                } catch (e) {
                    parsedItems.push({ id, media_type: mediaType, title: "Unknown", poster_path: null, addedAt: Date.now() });
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // --- APPLY TO APP ---
            if (name.toLowerCase() === 'my watchlist' || folderId === 'watchlist') {
                saveCollectionItems('watchlist', parsedItems);
            } else {
                // ✅ FIX: Use the stable folderId
                saveCollectionItems(folderId, parsedItems);
                folderDisplaySettings.set(folderId, { showName: showNameStr === 'T', showCount: showCountStr === 'T' });

                const folderHTML = `
                    <div class="collection-folder custom-folder" id="${folderId}" onclick="openCustomCollection('${folderId}', '${name.replace(/'/g, "\\'")}')">
                        <div class="folder-icon" style="font-size: ${iconSize}px;">${iconType === 'Text' ? iconInfo : `<img src="${iconInfo}" alt="icon" style="width: ${iconSize}px; height: ${iconSize}px; object-fit: contain;">`}</div>
                        <div class="folder-name">${name}</div>
                        <div class="folder-count">${parsedItems.length} item${parsedItems.length !== 1 ? 's' : ''}</div>
                    </div>
                `;
                document.getElementById('add-folder-btn').insertAdjacentHTML('beforebegin', folderHTML);
            }
            successCount++;

        } catch (err) {
            errorCount++;
            errors.push(`Line ${lineIndex + 1}: ${err.message}`);
        }
    }

    updateFolderCounts();
    
    let message = `✅ Successfully imported: ${successCount} collection(s).`;
    if (errorCount > 0) message += `\n\n❌ Failed: ${errorCount} collection(s).\nErrors:\n- ${errors.join('\n- ')}`;
    alert(message);
    
    // Refresh views if open
    if (document.getElementById('collections-custom-view').style.display === 'block') renderCustomCollection();
    if (document.getElementById('collections-watchlist-view').style.display === 'block') renderWatchlistInCollections();
}

// --- Watchlist & Folder Management ---
function clearWatchlistFromCollections() {
    if (confirm("Are you sure you want to clear your entire Watchlist? This cannot be undone!")) {
        localStorage.removeItem(STORAGE_WATCHLIST);
        renderWatchlistInCollections();
        updateFolderCounts();
        closeCollectionsSettings();
        saveCollectionsState(); // ✅ Sync to string array
    }
}

document.getElementById('add-folder-btn').onclick = (e) => {
    e.stopPropagation();
    const name = "New Collection";
    if (name && name.trim() !== "") {
        const folderId = 'folder-' + Date.now();
        const folderName = name.trim();
        const folderHTML = `<div class="collection-folder custom-folder" id="${folderId}" onclick="openCustomCollection('${folderId}', '${folderName.replace(/'/g, "\\'")}')"> <div class="folder-icon" style="font-size: 100px;">📁</div> <div class="folder-name">${folderName}</div> <div class="folder-count">0 items</div> </div>`;
        document.getElementById('add-folder-btn').insertAdjacentHTML('beforebegin', folderHTML);
        
        const slider = document.getElementById('iconSizeSlider');
        if (slider) {
            slider.value = 100;
            document.getElementById('iconSizeValue').textContent = '100';
        }
        currentEditingFolder = folderId;
        openCollectionsSettings();
        saveCollectionsState(); // ✅ Sync to string array
    }
};

function deleteCustomFolder() {
    if (confirm("Are you sure you want to delete this folder? This cannot be undone!")) {
        const folderEl = document.getElementById(currentEditingFolder);
        if (folderEl) folderEl.remove();
        
        // ✅ FIX 1: Remove the deleted folder from the pinned list if it was pinned
        let pinned = getPinnedCollections();
        const pinnedIndex = pinned.indexOf(currentEditingFolder);
        if (pinnedIndex > -1) {
            pinned.splice(pinnedIndex, 1);
            savePinnedCollections(pinned);
        }
        
        closeCollectionsSettings();
        closeCustomCollection(); 
        saveCollectionsState(); // ✅ Sync to string array
        
        // ✅ FIX 2: Instantly refresh the pinned collections UI across all tabs
        renderPinnedCollections('all');
        renderPinnedCollections('movie');
        renderPinnedCollections('tv');
    }
}

// --- Settings Modal Logic ---
function openCollectionsSettings() {
  const modal = document.getElementById('collectionsSettingsModal');
  const dangerTitle = document.getElementById('settings-danger-title');
  const dangerDesc = document.getElementById('settings-danger-desc');
  const dangerBtn = document.getElementById('settings-danger-btn');
  const nameToggle = document.getElementById('toggleCollectionName');
  const countToggle = document.getElementById('toggleItemCount');

  const dataEditor = document.getElementById('collectionDataEditor');
  if (dataEditor) {
    dataEditor.style.display = 'none';
  }

  modal.style.display = 'block';

  selectIconType(currentIconType);

  // Handle Display Toggles visibility and state
  if (currentEditingFolder === 'watchlist') {
    nameToggle.parentElement.parentElement.style.display = 'none';
    countToggle.parentElement.parentElement.style.display = 'none';
  } else {
    nameToggle.parentElement.parentElement.style.display = 'flex';
    countToggle.parentElement.parentElement.style.display = 'flex';
    const settings = folderDisplaySettings.get(currentEditingFolder);
    if (settings) {
      nameToggle.checked = settings.showName !== false;
      countToggle.checked = settings.showCount !== false;
    } else {
      nameToggle.checked = true;
      countToggle.checked = true;
    }
  }

  // Handle Technical Zone
  if (currentEditingFolder === 'watchlist') {
    dangerTitle.textContent = 'Technical Settings';
    dangerDesc.textContent = 'This will permanently remove all items from your watchlist. This action cannot be undone.';
    dangerBtn.textContent = 'Clear Watchlist';
    dangerBtn.onclick = clearWatchlistFromCollections;
  } else {
    dangerTitle.textContent = 'Technical Settings';
    dangerDesc.textContent = 'This will permanently delete this collection. This action cannot be undone.';
    dangerBtn.textContent = 'Delete Collection';
    dangerBtn.onclick = deleteCustomFolder;
  }

  // ✅ FIX: Sync the currentFolderIcon variable with the actual folder's current icon when opening
  const actualFolderId = currentEditingFolder === 'watchlist' ? 'folder-watchlist' : currentEditingFolder;
  const actualFolderEl = document.getElementById(actualFolderId);
  if (actualFolderEl) {
      const iconEl = actualFolderEl.querySelector('.folder-icon');
      // Only update if it's a text icon (not an image)
      if (iconEl && !iconEl.querySelector('img')) {
          currentFolderIcon = iconEl.textContent.trim() || '📁';
      }
  }

  updateFolderPreview();
  updatePinButtonState();
}

function closeCollectionsSettings() {
  document.getElementById('collectionsSettingsModal').style.display = 'none';
}

function updateFolderPreview() {
  const previewIcon = document.getElementById('previewIcon');
  const previewName = document.getElementById('previewName');
  const previewCount = document.getElementById('previewCount');
  const previewEl = document.getElementById('folderPreview');
  
  if (!previewIcon || !previewName || !previewCount || !previewEl) return;
  
  // Update icon based on current type
  if (currentIconType === 'text') {
    previewIcon.innerHTML = currentFolderIcon;
    // ✅ FIX: Read the current size from the slider instead of hardcoding 100px
    const currentSize = document.getElementById('iconSizeSlider')?.value || 100;
    previewIcon.style.fontSize = `${currentSize}px`; 
  } else if (currentIconType === 'image') {
    const imageUrl = document.getElementById('folderImageUrl').value.trim();
    const currentSize = document.getElementById('iconSizeSlider')?.value || 100;
    
    if (imageUrl) {
      previewIcon.innerHTML = `<img src="${imageUrl}" alt="icon" style="width: ${currentSize}px; height: ${currentSize}px; object-fit: contain;">`;
    } else {
      previewIcon.innerHTML = currentFolderIcon;
      previewIcon.style.fontSize = `${currentSize}px`;
    }
  }
  
  // Update name
  const folderEl = currentEditingFolder === 'watchlist' ? 
    document.getElementById('folder-watchlist') : 
    document.getElementById(currentEditingFolder);
    
  if (folderEl) {
    const nameEl = folderEl.querySelector('.folder-name');
    if (nameEl) {
      previewName.textContent = nameEl.textContent;
    }
    
    const countEl = folderEl.querySelector('.folder-count');
    if (countEl) {
      previewCount.textContent = countEl.textContent;
    }
  }
  
  // Apply hide/show classes based on toggles
  const nameToggle = document.getElementById('toggleCollectionName');
  const countToggle = document.getElementById('toggleItemCount');
  
  if (nameToggle && !nameToggle.checked) {
    previewEl.classList.add('hide-name');
  } else {
    previewEl.classList.remove('hide-name');
  }
  
  if (countToggle && !countToggle.checked) {
    previewEl.classList.add('hide-count');
  } else {
    previewEl.classList.remove('hide-count');
  }
}

function renameCollection() {
    const newName = document.getElementById('collectionRenameInput').value.trim();
    if (!newName) return;
    const folderId = currentEditingFolder === 'watchlist' ? 'folder-watchlist' : currentEditingFolder;
    const folderEl = document.getElementById(folderId);
    if (folderEl) {
        const nameEl = folderEl.querySelector('.folder-name');
        if (nameEl) nameEl.textContent = newName;
    }
    const previewName = document.getElementById('previewName');
    if (previewName) previewName.textContent = newName;
    document.getElementById('collectionRenameInput').value = '';
    saveCollectionsState(); // ✅ Sync to string array
}

function selectIconType(type) {
  currentIconType = type;
  
  // Update button states
  document.querySelectorAll('.icon-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  
  // Show/hide option panels
  document.querySelectorAll('.icon-option').forEach(panel => {
    panel.style.display = 'none';
  });
  
  if (type === 'text') {
    document.getElementById('textSelector').style.display = 'block';
  } else if (type === 'image') {
    document.getElementById('imageSelector').style.display = 'block';
  } else if (type === 'custom') {
    document.getElementById('customSelector').style.display = 'block';
  }
}

function saveTextIcon() {
    const text = document.getElementById('folderTextIcon').value.trim();
    if (text.length <= 3) {
        const targetId = currentEditingFolder === 'watchlist' ? 'folder-watchlist' : currentEditingFolder;
        const folderIcon = document.querySelector(`#${targetId} .folder-icon`);
        
        const currentSize = document.getElementById('iconSizeSlider')?.value || 100; 
        
        if (folderIcon) { 
            folderIcon.innerHTML = text; 
            folderIcon.style.fontSize = `${currentSize}px`; 
            currentFolderIcon = text; // ✅ FIX: Sync the global state variable
        }
        updateFolderPreview();
        saveCollectionsState(); 
    } else {
        alert("Please enter up to 3 characters.");
    }
}

function updateTextPreview(text) {
  if (text.length <= 3) {
    const previewIcon = document.querySelector('.preview-folder .folder-icon');
    if (previewIcon) {
      previewIcon.innerHTML = text;
      const currentSize = document.getElementById('iconSizeSlider')?.value || 100;
      previewIcon.style.fontSize = `${currentSize}px`; 
      currentFolderIcon = text; // ✅ FIX: Sync the state variable while typing too
    }
  }
}

function saveImageIcon() {
    const url = document.getElementById('folderImageUrl').value.trim();
    const size = document.getElementById('iconSizeSlider')?.value || 100;
    if (url) {
        const targetId = currentEditingFolder === 'watchlist' ? 'folder-watchlist' : currentEditingFolder;
        const folderIcon = document.querySelector(`#${targetId} .folder-icon`);
        if (folderIcon) { folderIcon.innerHTML = `<img src="${url}" alt="icon" style="width: 100px; height: 100px; object-fit: contain;">`; }
        const previewIcon = document.querySelector('.preview-folder .folder-icon');
        if (previewIcon) { previewIcon.innerHTML = `<img src="${url}" alt="icon" style="width: ${size}px; height: ${size}px; object-fit: contain;">`; }
        saveCollectionsState(); // ✅ Sync to string array
    } else {
        alert("Please enter a valid image URL.");
    }
}

function updateIconSize(size) {
    document.getElementById('iconSizeValue').textContent = size;
    const previewIcon = document.querySelector('.preview-folder .folder-icon');
    if (previewIcon) {
        const img = previewIcon.querySelector('img');
        if (img) { img.style.width = `${size}px`; img.style.height = `${size}px`; } 
        else { previewIcon.style.fontSize = `${size}px`; }
    }
    const targetId = currentEditingFolder === 'watchlist' ? 'folder-watchlist' : currentEditingFolder;
    const folderIcon = document.querySelector(`#${targetId} .folder-icon`);
    if (folderIcon) {
        const img = folderIcon.querySelector('img');
        if (img) { img.style.width = `${size}px`; img.style.height = `${size}px`; } 
        else { folderIcon.style.fontSize = `${size}px`; }
    }
    saveCollectionsState(); // ✅ Sync to string array
}

function toggleCollectionNameDisplay() {
    const checkbox = document.getElementById('toggleCollectionName');
    const folderId = currentEditingFolder;
    if (folderId === 'watchlist') return;
    const folderEl = document.getElementById(folderId);
    if (folderEl) folderEl.classList.toggle('hide-name', !checkbox.checked);
    if (!folderDisplaySettings.has(folderId)) folderDisplaySettings.set(folderId, { showName: true, showCount: true });
    folderDisplaySettings.get(folderId).showName = checkbox.checked;
    updateFolderPreview();
    saveCollectionsState(); // ✅ Sync to string array
}

function toggleItemCountDisplay() {
    const checkbox = document.getElementById('toggleItemCount');
    const folderId = currentEditingFolder;
    if (folderId === 'watchlist') return;
    const folderEl = document.getElementById(folderId);
    if (folderEl) folderEl.classList.toggle('hide-count', !checkbox.checked);
    if (!folderDisplaySettings.has(folderId)) folderDisplaySettings.set(folderId, { showName: true, showCount: true });
    folderDisplaySettings.get(folderId).showCount = checkbox.checked;
    updateFolderPreview();
    saveCollectionsState(); // ✅ Sync to string array
}

// --- Pinning Logic ---
const STORAGE_PINNED = "movieBrowser_pinned_ids";

function getPinnedCollections() {
    return JSON.parse(localStorage.getItem(STORAGE_PINNED) || "[]");
}

function savePinnedCollections(ids) {
    localStorage.setItem(STORAGE_PINNED, JSON.stringify(ids));
}

function togglePinCollection() {
    const folderId = currentEditingFolder;
    let pinned = getPinnedCollections();
    
    const index = pinned.indexOf(folderId);
    
    if (index > -1) {
        // Already pinned, so unpin it
        pinned.splice(index, 1);
    } else {
        // Not pinned, so pin it
        pinned.push(folderId);
    }
    
    savePinnedCollections(pinned);
    updatePinButtonState();
    renderPinnedCollections('all');
    renderPinnedCollections('movie');
    renderPinnedCollections('tv');
}

function updatePinButtonState() {
    const btn = document.getElementById('pinCollectionBtn');
    if (!btn) return;
    
    const pinned = getPinnedCollections();
    const isPinned = pinned.includes(currentEditingFolder);
    
    if (isPinned) {
        btn.textContent = "📌 Unpin from Home Page";
        btn.style.background = "#dc3545"; // Red
    } else {
        btn.textContent = "📌 Pin to Home Page";
        btn.style.background = "#333"; // Default
    }
}

function renderPinnedCollections(filterType = 'all') {
    // Determine which container to use based on the filter type
    let containerId = 'pinnedCollectionsContainer'; // Default for Home tab
    if (filterType === 'movie') containerId = 'pinnedCollectionsContainer-movies';
    if (filterType === 'tv') containerId = 'pinnedCollectionsContainer-tv';

    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    const pinnedIds = getPinnedCollections();
    if (pinnedIds.length === 0) return;
    
    pinnedIds.forEach(folderId => {
        let name = "Unknown Collection";
        if (folderId === 'watchlist') {
            name = "My Watchlist";
        } else {
            const folderEl = document.getElementById(folderId);
            if (folderEl) {
                const nameEl = folderEl.querySelector('.folder-name');
                if (nameEl) name = nameEl.textContent;
            }
        }
        
        let items = getCollectionItems(folderId);
        
        // ✅ FILTER ITEMS: Only keep items that match the current tab
        if (filterType === 'movie') {
            items = items.filter(item => item.media_type === 'movie');
        } else if (filterType === 'tv') {
            items = items.filter(item => item.media_type === 'tv');
        }
        
        // ✅ SKIP EMPTY: If no items match the filter, don't render this collection at all
        if (items.length === 0) return;
        
        const section = document.createElement('div');
        section.style.marginBottom = '30px';
        
        const header = document.createElement('h2');
        header.textContent = `${name}`;
        header.style.marginBottom = '10px';
        section.appendChild(header);
        
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'horizontal-scroll';
        
        items.forEach(item => {
            const div = document.createElement('div');
            div.classList.add('movie');
            const title = item.title || item.name;
            const type = item.media_type === 'movie' ? 'Movie' : 'TV';
            div.innerHTML = `
                <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
                <div class="movie-title">${title} (${type})</div>
            `;
            div.onclick = () => showMovieDetails(item, false);
            scrollContainer.appendChild(div);
        });
        
        section.appendChild(scrollContainer);
        container.appendChild(section);
    });
}

// ============================================================================
// ARRANGE PINNED COLLECTIONS LOGIC
// ============================================================================

function openArrangePinnedModal() {
    const modal = document.getElementById('arrangePinnedModal');
    const list = document.getElementById('arrangePinnedList');
    list.innerHTML = '';
    
    const pinnedIds = getPinnedCollections();
    
    // Filter out any pinned IDs that no longer exist (e.g., deleted folders)
    const validPinnedIds = pinnedIds.filter(id => {
        if (id === 'watchlist') return true;
        return document.getElementById(id) !== null;
    });
    
    // Clean up localStorage if a deleted folder was still pinned
    if (validPinnedIds.length !== pinnedIds.length) {
        savePinnedCollections(validPinnedIds);
    }

    if (validPinnedIds.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#888; padding: 20px;">No collections are currently pinned.</p>';
    } else {
        validPinnedIds.forEach((folderId, index) => {
            let name = folderId === 'watchlist' ? 'My Watchlist' : (document.getElementById(folderId)?.querySelector('.folder-name')?.textContent || 'Unknown Collection');
            
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: #222; padding: 12px 15px; border-radius: 6px; border: 1px solid #333;';
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = name;
            nameSpan.style.cssText = 'flex: 1; font-weight: bold; font-size: 15px;';
            
            const controls = document.createElement('div');
            controls.style.cssText = 'display: flex; gap: 8px;';
            
            const upBtn = document.createElement('button');
            upBtn.textContent = '▲';
            upBtn.className = 'action-btn';
            upBtn.style.cssText = 'padding: 6px 12px; margin: 0; font-size: 12px;';
            upBtn.disabled = index === 0;
            upBtn.onclick = () => movePinnedItem(index, -1);
            
            const downBtn = document.createElement('button');
            downBtn.textContent = '▼';
            downBtn.className = 'action-btn';
            downBtn.style.cssText = 'padding: 6px 12px; margin: 0; font-size: 12px;';
            downBtn.disabled = index === validPinnedIds.length - 1;
            downBtn.onclick = () => movePinnedItem(index, 1);
            
            controls.appendChild(upBtn);
            controls.appendChild(downBtn);
            
            item.appendChild(nameSpan);
            item.appendChild(controls);
            list.appendChild(item);
        });
    }
    
    modal.style.display = 'block';
}

function closeArrangePinnedModal() {
    document.getElementById('arrangePinnedModal').style.display = 'none';
}

function movePinnedItem(index, direction) {
    const pinnedIds = getPinnedCollections();
    const newIndex = index + direction;
    
    if (newIndex >= 0 && newIndex < pinnedIds.length) {
        // Swap the items
        const temp = pinnedIds[index];
        pinnedIds[index] = pinnedIds[newIndex];
        pinnedIds[newIndex] = temp;
        
        // Save immediately to localStorage
        savePinnedCollections(pinnedIds);
        
        // Re-render the modal list to update button disabled states
        openArrangePinnedModal();
    }
}

function savePinnedOrder() {
    closeArrangePinnedModal();
    // Refresh all pinned views across all tabs instantly
    renderPinnedCollections('all');
    renderPinnedCollections('movie');
    renderPinnedCollections('tv');
}

// ============================================================================
// COLLECTION DATA EDITOR (Show & Save)
// ============================================================================

/** Validates, fetches metadata, and updates an existing collection from a CSV string */
async function updateCollectionFromString(csvString, targetFolderId) {
    if (!csvString || !csvString.trim()) {
        alert("Data string is empty.");
        return false;
    }

    try {
        const fields = parseCSVLine(csvString.trim());
        
        // ✅ FIX: Detect format and shift indices accordingly
        const isNewFormat = fields.length >= 7 && (fields[0].trim() === 'watchlist' || fields[0].trim().startsWith('folder-'));
        let name, iconType, iconInfo, iconSizeStr, showNameStr, showCountStr, itemsRaw;

        if (isNewFormat) {
            name = fields[1].trim();
            iconType = fields[2].trim();
            iconInfo = fields[3].trim();
            iconSizeStr = fields[4].trim();
            showNameStr = fields[5].trim().toUpperCase();
            showCountStr = fields[6].trim().toUpperCase();
            itemsRaw = fields.slice(7);
        } else {
            name = fields[0].trim();
            iconType = fields[1].trim();
            iconInfo = fields[2].trim();
            iconSizeStr = fields[3].trim();
            showNameStr = fields[4].trim().toUpperCase();
            showCountStr = fields[5].trim().toUpperCase();
            itemsRaw = fields.slice(6);
        }

        // --- STRICT VALIDATION ---
        if (iconType !== 'Text' && iconType !== 'Image') {
            throw new Error(`Invalid IconType: "${iconType}". Must be 'Text' or 'Image'.`);
        }
        if (iconType === 'Text' && iconInfo.length > 3) {
            throw new Error(`IconInfo for Text must be 3 characters or less. Got: "${iconInfo}" (${iconInfo.length} chars).`);
        }
        const iconSize = parseInt(iconSizeStr, 10);
        if (isNaN(iconSize) || iconSize < 0 || iconSize > 120) {
            throw new Error(`Invalid IconSize: "${iconSizeStr}". Must be a number between 0 and 120.`);
        }
        if (showNameStr !== 'T' && showNameStr !== 'F') {
            throw new Error(`Invalid ShowCollectionName: "${showNameStr}". Must be 'T' or 'F'.`);
        }
        if (showCountStr !== 'T' && showCountStr !== 'F') {
            throw new Error(`Invalid ShowItemCount: "${showCountStr}". Must be 'T' or 'F'.`);
        }

        // --- FETCH METADATA FOR EACH ITEM ---
        const parsedItems = [];
        const saveBtn = document.getElementById("saveCollectionDataBtn");
        const originalBtnText = saveBtn ? saveBtn.textContent : "Save";
        
        if (saveBtn) {
            saveBtn.textContent = `Fetching details (0/${itemsRaw.length})...`;
            saveBtn.disabled = true;
        }

        for (let i = 0; i < itemsRaw.length; i++) {
            const itemStr = itemsRaw[i].trim(); // ✅ FIXED: was "trimا()"
            const match = itemStr.match(/^([TM])(\d+)$/);
            
            if (!match) {
                throw new Error(`Invalid item format: "${itemStr}". Must be 'T' or 'M' followed by numbers (e.g., T123).`);
            }
            
            const mediaType = match[1] === 'T' ? 'tv' : 'movie';
            const id = parseInt(match[2], 10);
            
            if (saveBtn) saveBtn.textContent = `Fetching details (${i + 1}/${itemsRaw.length})...`;

            try {
                const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${apiKey}&language=en-US`);
                if (res.ok) {
                    const data = await res.json();
                    parsedItems.push({
                        id: id,
                        media_type: mediaType, // ✅ FIXED: was "media _type"
                        title: data.title || data.name || "Unknown Title",
                        poster_path: data.poster_path,
                        addedAt: Date.now()
                    });
                } else {
                    parsedItems.push({ id, media_type: mediaType, title: "Unknown Title", poster_path: null, addedAt: Date.now() });
                }
            } catch (e) {
                console.warn(`Failed to fetch metadata for ${mediaType} ${id}`, e);
                parsedItems.push({ id, media_type: mediaType, title: "Unknown Title", poster_path: null, addedAt: Date.now() }); // ✅ FIXED: was "parsed Items"
            }
            
            // Tiny delay to prevent TMDB API rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (saveBtn) {
            saveBtn.textContent = originalBtnText;
            saveBtn.disabled = false;
        }

        // --- APPLY CHANGES IN-PLACE ---
        const isWatchlist = targetFolderId === 'watchlist';
        const folderIdToUpdate = isWatchlist ? 'folder-watchlist' : targetFolderId;
        const folderEl = document.getElementById(folderIdToUpdate); // ✅ FIXED: was "getElementByI d"

        // 1. Save Items to LocalStorage
        saveCollectionItems(targetFolderId, parsedItems);

        // 2. Update DOM
        if (folderEl) { // ✅ FIXED: was "f olderEl"
            const nameEl = folderEl.querySelector('.folder-name');
            if (nameEl && !isWatchlist) nameEl.textContent = name;

            const iconEl = folderEl.querySelector('.folder-icon');
            if (iconEl) {
                if (iconType === 'Text') {
                    iconEl.innerHTML = iconInfo;
                    iconEl.style.fontSize = `${iconSize}px`;
                    const img = iconEl.querySelector('img');
                    if (img) img.remove(); // ✅ FIXED: was "remo ve"
                } else {
                    iconEl.innerHTML = `<img src="${iconInfo}" alt="icon" style="width: ${iconSize}px; height: ${iconSize}px; object-fit: contain;">`;
                }
            }

            if (!isWatchlist) {
                folderEl.classList.toggle('hide-name', showNameStr !== 'T');
                folderEl.classList.toggle('hide-count', showCountStr !== 'T');
                folderDisplaySettings.set(targetFolderId, { showName: showNameStr === 'T', showCount: showCountStr === 'T' });
            }
        }

        // 3. Refresh UI
        updateFolderCounts();
        updateFolderPreview();
        
        if (!isWatchlist && document.getElementById('collections-custom-view').style.display === 'block') {
            renderCustomCollection();
        } else if (isWatchlist && document.getElementById('collections-watchlist-view').style.display === 'block') {
            renderWatchlistInCollections();
        }

        alert(`✅ Collection data saved successfully!\n\nItems updated with metadata: ${parsedItems.length}`);
        saveCollectionsState();
        return true;

    } catch (err) {
        const saveBtn = document.getElementById("saveCollectionDataBtn");
        if (saveBtn) {
            saveBtn.textContent = "💾 Save Data Changes";
            saveBtn.disabled = false;
        }
        alert(`❌ Invalid Data String:\n\n${err.message}\n\nPlease check your formatting and try again.`);
        return false;
    }
}

/** Saves ALL collections (Watchlist + Custom) as a single array of CSV strings */
function saveCollectionsState() {
    const collections = getAllCollections();
    const stringsArray = collections.map(collection => exportCollectionToString(collection.id));
    localStorage.setItem('movieBrowser_collections_strings', JSON.stringify(stringsArray));
}

async function loadCollectionsState() {
    const savedStrings = localStorage.getItem('movieBrowser_collections_strings');
    if (!savedStrings) return; 
    
    try {
        const stringsArray = JSON.parse(savedStrings);
        if (!Array.isArray(stringsArray)) return;
        
        document.querySelectorAll('.collection-folder.custom-folder').forEach(el => el.remove());
        folderDisplaySettings.clear();
        
        for (const csvString of stringsArray) {
            if (!csvString || !csvString.trim()) continue;
            
            const fields = parseCSVLine(csvString.trim());
            
            // ✅ FIX: Detect if it's the new format (starts with 'watchlist' or 'folder-')
            const isNewFormat = fields.length >= 7 && (fields[0].trim() === 'watchlist' || fields[0].trim().startsWith('folder-'));
            
            let folderId, name, iconType, iconInfo, iconSizeStr, showNameStr, showCountStr, itemsRaw;

            if (isNewFormat) {
                folderId = fields[0].trim();
                name = fields[1].trim();
                iconType = fields[2].trim();
                iconInfo = fields[3].trim();
                iconSizeStr = fields[4].trim();
                showNameStr = fields[5].trim().toUpperCase();
                showCountStr = fields[6].trim().toUpperCase();
                itemsRaw = fields.slice(7);
            } else {
                // Fallback for old format (pre-fix)
                folderId = 'folder-' + Date.now() + Math.random().toString(36).substr(2, 5);
                name = fields[0].trim();
                iconType = fields[1].trim();
                iconInfo = fields[2].trim();
                iconSizeStr = fields[3].trim();
                showNameStr = fields[4].trim().toUpperCase();
                showCountStr = fields[5].trim().toUpperCase();
                itemsRaw = fields.slice(6);
            }
             
            const parsedItems = [];
            for (const itemStr of itemsRaw) {
                const match = itemStr.trim().match(/^([TM])(\d+)$/);
                if (match) {
                    const mediaType = match[1] === 'T' ? 'tv' : 'movie';
                    const id = parseInt(match[2], 10);
                    
                    let cachedItem = null;
                    const allColls = getAllCollections();
                    for (const coll of allColls) {
                        const items = getCollectionItems(coll.id);
                        const found = items.find(i => i.id === id && i.media_type === mediaType);
                        if (found && found.title && found.title !== "Unknown" && found.title !== "Imported Item") {
                            cachedItem = found;
                            break;
                        }
                    }
                    
                    if (cachedItem) {
                        parsedItems.push(cachedItem);
                    } else {
                        try {
                            const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${apiKey}&language=en-US`);
                            if (res.ok) {
                                const data = await res.json();
                                parsedItems.push({
                                    id: id, media_type: mediaType,
                                    title: data.title || data.name || "Unknown",
                                    poster_path: data.poster_path, addedAt: Date.now()
                                });
                            } else {
                                parsedItems.push({ id, media_type: mediaType, title: "Unknown", poster_path: null, addedAt: Date.now() });
                            }
                        } catch (e) {
                            parsedItems.push({ id, media_type: mediaType, title: "Unknown", poster_path: null, addedAt: Date.now() });
                        }
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            }
            
            if (name.toLowerCase() === 'my watchlist' || folderId === 'watchlist') {
                saveCollectionItems('watchlist', parsedItems);
            } else {
                // ✅ FIX: Use the stable folderId instead of generating a new random one!
                saveCollectionItems(folderId, parsedItems);
                folderDisplaySettings.set(folderId, { 
                    showName: showNameStr === 'T', 
                    showCount: showCountStr === 'T'  
                });
                
                const folderHTML = `
                    <div class="collection-folder custom-folder" id="${folderId}" onclick="openCustomCollection('${folderId}', '${name.replace(/'/g, "\\'")}')">
                        <div class="folder-icon" style="font-size: ${iconSizeStr}px;">${iconType === 'Text' ? iconInfo : `<img src="${iconInfo}" alt="icon" style="width: ${iconSizeStr}px; height: ${iconSizeStr}px; object-fit: contain;">`}</div>
                        <div class="folder-name">${name}</div>
                        <div class="folder-count">${parsedItems.length} item${parsedItems.length !== 1 ? 's' : ''}</div>
                    </div>
                `;
                document.getElementById('add-folder-btn').insertAdjacentHTML('beforebegin', folderHTML);
            }
        }
        updateFolderCounts();
        renderPinnedCollections('all');
        
    } catch (e) {
        console.error("Failed to load collections from strings:", e);
    }
}

// ============================================================================
// 10. EVENT LISTENERS & INITIALIZATION
// ============================================================================
document.getElementById("pinCollectionBtn")?.addEventListener("click", togglePinCollection);

document.getElementById("showCollectionDataBtn")?.addEventListener("click", () => {
    const textarea = document.getElementById('collectionDataTextarea');
    const editor = document.getElementById('collectionDataEditor');
    
    // Generate the current string and show it
    textarea.value = exportCollectionToString(currentEditingFolder);
    editor.style.display = 'block';
});

document.getElementById("saveCollectionDataBtn")?.addEventListener("click", async () => {
    const textarea = document.getElementById('collectionDataTextarea');
    const csvString = textarea.value.trim();
    
    const success = await updateCollectionFromString(csvString, currentEditingFolder);
    if (success) {
        document.getElementById('collectionDataEditor').style.display = 'none';
    }
});

document.getElementById("cancelDataEditBtn")?.addEventListener("click", () => {
    document.getElementById('collectionDataEditor').style.display = 'none';
});

document.addEventListener("DOMContentLoaded", () => {
  loadCollectionsState();
  renderPinnedCollections('all');
  // Initialize tabs
  ['home', 'movies', 'tv'].forEach(tab => {
    loadNewAdditions(tab, false);
    displayContinueWatching(
      tab === 'home' ? 'all' : tab === 'movies' ? 'movie' : 'tv',
      `continueWatching-${tab}`
    );
  });
  
  // Infinite scroll for horizontal new additions containers
  ['home', 'movies', 'tv'].forEach(tab => {
    const container = document.getElementById(`newAdditions-${tab}`);
    if (!container) return;
    container.addEventListener('scroll', () => {
      const state = tabState[tab];
      if (state.loading) return;
      if (container.scrollLeft + container.clientWidth >= container.scrollWidth * 0.8) {
        loadNewAdditions(tab, true);
      }
    });
  });
  
  // Load CSV data
  loadAlternateLinks();
  loadTvAlternateLinks();
  loadTvExternalLinks();
  
  // Modal close handlers
  const movieModal = document.getElementById("movieModal");
  const closeBtn = document.querySelector(".close-btn");
  const videoModal = document.getElementById("videoModal");
  const videoCloseBtn = document.querySelector(".video-close");
  
  if (closeBtn && movieModal) closeBtn.onclick = () => movieModal.style.display = "none";
  if (videoCloseBtn && videoModal) videoCloseBtn.onclick = closeVideoModal;
  if (movieModal) movieModal.onclick = e => { if (e.target === movieModal) movieModal.style.display = "none"; };
  if (videoModal) videoModal.onclick = e => { if (e.target === videoModal) closeVideoModal(); };
  // Collections Settings Modal click-off handler
  const collectionsSettingsModal = document.getElementById("collectionsSettingsModal");
  if (collectionsSettingsModal) {
    collectionsSettingsModal.onclick = e => {
      if (e.target === collectionsSettingsModal) {
        closeCollectionsSettings();
      }
    };
  }
  const imageUrlInput = document.getElementById('folderImageUrl');
  if (imageUrlInput) {
    imageUrlInput.addEventListener('input', () => {
      if (currentIconType === 'image') {
        updateFolderPreview();
      }
    });
  }
});

// Tab switching logic
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    
    const tabId = `${btn.dataset.tab}-tab`;
    document.getElementById(tabId)?.classList.add('active');

    const tabName = btn.dataset.tab;
    if (['home', 'movies', 'tv'].includes(tabName)) {
      const filters = { home: 'all', movies: 'movie', tv: 'tv' };
      displayContinueWatching(filters[tabName], `continueWatching-${tabName}`);
      loadNewAdditions(tabName, false);

      if (tabName === 'home') {
        renderPinnedCollections('all');
      } else if (tabName === 'movies') {
        renderPinnedCollections('movie');
      } else if (tabName === 'tv') {
        renderPinnedCollections('tv');
      }
    }
  });
});

// Search mode switching (Title / Genre / People)
document.querySelectorAll('.search-mode-buttons .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.search-mode-buttons .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSearchMode = btn.dataset.type;
    document.getElementById('search-dropdown').style.display = 'none';
    isPersonSearch = false;
    isKeywordSearch = false;
    currentKeywordId = null;
    searchInput.value = '';
    resultsDiv.innerHTML = '';
    lastSearchResults = [];
    currentPersonResults = [];

    if (currentSearchMode === 'title') {
      searchInput.placeholder = "Search movies or TV shows...";
    } else if (currentSearchMode === 'genre') {
      searchInput.placeholder = "Search for a genre (e.g. Horror, Sci-Fi)...";
    } else {
      searchInput.placeholder = "Search for a person...";
    }
  });
});

// Search result filtering (All / Movies / TV)
document.querySelectorAll('.search-filters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.search-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    
    if (isPersonSearch) {
      displayPersonResults(currentPersonResults, false);
    } else if (isKeywordSearch) {
      currentPage = 1;
      seenKeywordItems.clear();
      resultsDiv.innerHTML = '<p>Loading...</p>';
      loadKeywordResults(false);
    } else if (lastSearchResults.length > 0) {
      displayResults(lastSearchResults, false);
    }
  });
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('search-dropdown');
  const wrapper = document.querySelector('.search-input-wrapper');
  if (dropdown && wrapper && !wrapper.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// Keyboard escape to close modals
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeVideoModal();
    document.getElementById("movieModal").style.display = "none";
  }
});

// Data Management Button Listeners
document.getElementById("clearMoviesFromWatching")?.addEventListener("click", () => {
  if (confirm("Are you sure you want to remove all MOVIES from Continue Watching? TV shows will remain.")) {
    const watched = getWatchedData();
    let removedCount = 0;
    for (const key in watched) {
      if (watched[key].media_type === "movie") {
        clearAllTimestampsForItem(watched[key].id, watched[key].media_type);
        delete watched[key];
        removedCount++;
      }
    }
    saveWatchedData(watched);
    displayContinueWatching();
  }
});

document.getElementById("clearContinueWatching")?.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all Continue Watching items?")) {
    localStorage.removeItem(STORAGE_WATCHED);
    clearAllVideoProgressKeys();
    displayContinueWatching();
    alert("Continue Watching cleared!");
  }
});
