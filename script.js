const apiKey = "7ef03bd0c305f128db814368cb78a12c";
const searchInput = document.getElementById("search");
const resultsDiv = document.getElementById("results");
let currentPage = 1;
let currentQuery = "";
let loading = false;

// STORAGE KEYS
const STORAGE_WATCHED = "movieBrowser_watched";
const STORAGE_WATCHLIST = "movieBrowser_watchlist";

// ========== TAB NAVIGATION ==========

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add("active");
    
    if (btn.dataset.tab === "home") {
      displayContinueWatching();
    }
    
    if (btn.dataset.tab === "watchlist") {
      displayWatchlist();
    }
  });
});

// ========== WATCH DATA MANAGEMENT ==========

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

// Add to watched list (when Play is clicked)
function addToWatched(item, season = null, episode = null) {
  const watched = getWatchedData();
  const key = `${item.media_type}_${item.id}`;
  
  watched[key] = {
    id: item.id,
    media_type: item.media_type,
    title: item.title || item.name,
    poster_path: item.poster_path, // ✅ SAVE POSTER
    currentSeason: season,
    currentEpisode: episode,
    addedAt: Date.now(),
    lastWatched: Date.now()
  };
  
  saveWatchedData(watched);
}

// Update TV episode progress
function updateTVEpisode(id, mediaType, currentSeason, currentEpisode) {
  const watched = getWatchedData();
  const key = `${mediaType}_${id}`;
  
  if (watched[key]) {
    watched[key].currentSeason = currentSeason;
    watched[key].currentEpisode = currentEpisode;
    watched[key].lastWatched = Date.now();
    saveWatchedData(watched);
  }
}

// Remove from watched
function removeFromWatched(id, mediaType) {
  const watched = getWatchedData();
  const key = `${mediaType}_${id}`;
  delete watched[key];
  saveWatchedData(watched);
}

// Add to watchlist - ✅ MAKE SURE POSTER IS SAVED
function addToWatchlist(item) {
  const watchlist = getWatchlist();
  const exists = watchlist.find(w => w.id === item.id && w.media_type === item.media_type);
  if (!exists) {
    watchlist.push({ 
      id: item.id,
      media_type: item.media_type,
      title: item.title || item.name,
      poster_path: item.poster_path, // ✅ SAVE POSTER
      addedAt: Date.now() 
    });
    saveWatchlist(watchlist);
  }
}

// Remove from watchlist
function removeFromWatchlist(item) {
  const watchlist = getWatchlist();
  const filtered = watchlist.filter(w => !(w.id === item.id && w.media_type === item.media_type));
  saveWatchlist(filtered);
}

// ========== CONTINUE WATCHING DISPLAY ==========

function displayContinueWatching() {
  const container = document.getElementById("continueWatching");
  const watched = getWatchedData();
  const items = Object.values(watched);
  
  items.sort((a, b) => b.addedAt - a.addedAt);
  
  if (items.length === 0) {
    container.innerHTML = "<p style='color:#888;grid-column:1/-1;text-align:center;'>No watched content yet. Start watching from Search!</p>";
    return;
  }
  
  container.innerHTML = "";
  
  items.forEach(item => {
    const div = document.createElement("div");
    div.classList.add("movie", "continue-card");
    
    const title = item.title || item.name;
    const type = item.media_type === "movie" ? "Movie" : "TV";
    
    let episodeBadge = "";
    let episodeInfo = "";
    if (item.media_type === "tv" && item.currentSeason && item.currentEpisode) {
      episodeBadge = `<div class="episode-badge">S${item.currentSeason}E${item.currentEpisode}</div>`;
      episodeInfo = ` - S${item.currentSeason}E${item.currentEpisode}`;
    }
    
    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      ${episodeBadge}
      <div class="movie-title">${title} (${type})${episodeInfo}</div>
    `;
    
    div.onclick = () => {
      showMovieDetails(item, true);
    };
    
    container.appendChild(div);
  });
}

// ========== WATCHLIST DISPLAY ==========

function displayWatchlist() {
  const container = document.getElementById("watchlist");
  const watchlist = getWatchlist();
  
  if (watchlist.length === 0) {
    container.innerHTML = "<p style='color:#888;grid-column:1/-1;text-align:center;'>Your watchlist is empty. Right-click search results to add items!</p>";
    return;
  }
  
  container.innerHTML = "";
  
  watchlist.forEach(item => {
    const div = document.createElement("div");
    div.classList.add("movie");
    
    const title = item.title || item.name;
    const type = item.media_type === "movie" ? "Movie" : "TV";
    
    // ✅ USE SAVED poster_path
    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      <div class="movie-title">${title} (${type})</div>
    `;
    
    div.onclick = () => {
      showMovieDetails(item, false);
    };
    
    container.appendChild(div);
  });
}

// ========== CSV EXPORT ==========

document.getElementById("exportCsv")?.addEventListener("click", () => {
  const watched = getWatchedData();
  const items = Object.values(watched);
  
  if (items.length === 0) {
    alert("No watch history to export!");
    return;
  }
  
  const headers = ["ID", "Title", "Type", "Season", "Episode", "Date Added", "Last Watched"];
  const rows = items.map(item => {
    return [
      item.id,
      `"${(item.title || item.name).replace(/"/g, '""')}"`,
      item.media_type,
      item.currentSeason || "N/A",
      item.currentEpisode || "N/A",
      new Date(item.addedAt).toLocaleString(),
      item.lastWatched ? new Date(item.lastWatched).toLocaleString() : "N/A"
    ].join(",");
  });
  
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `watch-history-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clearData")?.addEventListener("click", () => {
  if (confirm("Are you sure? This will delete all watch history and watchlist!")) {
    localStorage.removeItem(STORAGE_WATCHED);
    localStorage.removeItem(STORAGE_WATCHLIST);
    displayContinueWatching();
    displayWatchlist();
    alert("All data cleared!");
  }
});

document.getElementById("clearContinueWatching")?.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all Continue Watching items?")) {
    localStorage.removeItem(STORAGE_WATCHED);
    displayContinueWatching();
    alert("Continue Watching cleared!");
  }
});

document.getElementById("clearWatchlist")?.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear your Watchlist?")) {
    localStorage.removeItem(STORAGE_WATCHLIST);
    displayWatchlist();
    alert("Watchlist cleared!");
  }
});
// ========== SEARCH & RESULTS ==========

function score(item, query) {
  const title = (item.title || item.name || "").toLowerCase();
  const q = query.toLowerCase();
  let score = item.popularity || 0;
  if (title === q) score += 1000;
  if (title.startsWith(q)) score += 500;
  if (title.includes(q)) score += 200;
  return score;
}

searchInput.addEventListener("input", async () => {
  const query = searchInput.value.trim();
  currentQuery = query;
  currentPage = 1;
  resultsDiv.innerHTML = "";
  
  if (query.length < 3) return;
  
  await loadResults();
});

async function loadResults() {
  if (loading || !currentQuery) return;
  loading = true;
  
  try {
    const [movieRes, tvRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(currentQuery)}&page=${currentPage}`),
      fetch(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(currentQuery)}&page=${currentPage}`)
    ]);
    
    const movieData = await movieRes.json();
    const tvData = await tvRes.json();
    
    const movies = movieData.results.map(m => ({ ...m, media_type: "movie" }));
    const tv = tvData.results.map(t => ({ ...t, media_type: "tv" }));
    
    let combined = [...movies, ...tv];
    combined.sort((a, b) => score(b, currentQuery) - score(a, currentQuery));
    
    displayResults(combined, currentPage === 1 ? false : true);
    currentPage++;
    
  } catch (error) {
    console.error("Error:", error);
  }
  loading = false;
}

function displayResults(items, append = false) {
  if (!append) resultsDiv.innerHTML = "";
  
  items.forEach(item => {
    if (!item.poster_path) return;
    
    const div = document.createElement("div");
    div.classList.add("movie");
    
    const title = item.title || item.name;
    const type = item.media_type === "movie" ? "Movie" : "TV";
    
    div.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
      <div class="movie-title">${title} (${type})</div>
    `;
    
    div.oncontextmenu = (e) => {
      e.preventDefault();
      const watchlist = getWatchlist();
      const inWatchlist = watchlist.some(w => w.id === item.id && w.media_type === item.media_type);
      
      if (inWatchlist) {
        removeFromWatchlist(item);
        alert("Removed from watchlist!");
      } else {
        addToWatchlist(item); // ✅ item has poster_path from search results
        alert("Added to watchlist!");
      }
      displayResults(items, append);
    };
    
    div.onclick = () => {
      showMovieDetails(item, false);
    };
    
    resultsDiv.appendChild(div);
  });
}

window.addEventListener("scroll", () => {
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
    loadResults();
  }
});

// ========== MODAL & VIDEO FUNCTIONS ==========

async function showMovieDetails(item, fromContinueWatching = false) {
  const modal = document.getElementById("movieModal");
  const modalBody = document.getElementById("modalBody");
  
  if (!modal || !modalBody) return;
  
  modalBody.innerHTML = "<p style='text-align:center'>Loading...</p>";
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
    
    const watched = getWatchedData();
    const key = `${item.media_type}_${item.id}`;
    const tracked = watched[key];
    const currentSeason = tracked?.currentSeason || null;
    const currentEpisode = tracked?.currentEpisode || null;
    
    let actionButtonsHTML = `
      <button class="action-btn" onclick="toggleWatchlistFromModal(${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}')">
        ${getWatchlist().some(w => w.id === item.id && w.media_type === item.media_type) ? "✓ In Watchlist" : "+ Add to Watchlist"}
      </button>
    `;
    
    if (fromContinueWatching) {
      actionButtonsHTML += `
        <button class="watched-btn" onclick="removeFromContinueWatching(${item.id}, '${item.media_type}')">
          Remove from Continue Watching
        </button>
      `;
      
      if (item.media_type === "tv" && currentSeason && currentEpisode) {
        actionButtonsHTML += `
          <button class="episode-done-btn" onclick="markEpisodeDone(${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', ${currentSeason}, ${currentEpisode})">
            ✓ I Finished S${currentSeason}E${currentEpisode}
          </button>
        `;
      }
    }
    
    let modalHTML = `
      ${data.poster_path ? `<img class="modal-poster" src="https://image.tmdb.org/t/p/w500${data.poster_path}" alt="${title}">` : ""}
      <h2 class="modal-title">${title} (${year})</h2>
      <div class="modal-info">${type} • ${rating} • ${runtime}</div>
      <div class="modal-info"><strong>Genres:</strong> ${genres}</div>
      <p class="modal-overview">${data.overview || "No overview available."}</p>
    `;
    
    if (item.media_type === "movie") {
      modalHTML += `
        <div style="text-align:center;margin:15px 0;">
          <button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/movie/${item.id}', '${title.replace(/'/g, "\\'")} (${year})', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}')">
            ▶ Play Movie
          </button>
        </div>
      `;
    }
    
    modalHTML += `
      
      <div class="modal-actions">
        ${actionButtonsHTML}
      </div>
    `;
    
    if (item.media_type === "tv" && data.seasons?.length > 0) {
      modalHTML += `<div class="seasons-container"><h3 style="margin:15px 0 10px;">[TV] Seasons & Episodes</h3>`;
      
      for (const season of data.seasons) {
        if (season.season_number === 0) continue;
        
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
      modalHTML += `</div>`;
    }
    
    modalBody.innerHTML = modalHTML;
    
    if (item.media_type === "tv") {
      document.querySelectorAll('.season-toggle').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const seasonNum = btn.dataset.season;
          const episodesContainer = document.getElementById(`episodes-s${seasonNum}`);
          const isActive = btn.classList.toggle('active');
          
          if (isActive && !episodesContainer.dataset.loaded) {
            try {
              const seasonRes = await fetch(`https://api.themoviedb.org/3/tv/${item.id}/season/${seasonNum}?api_key=${apiKey}&language=en-US`);
              const seasonData = await seasonRes.json();
              
              if (seasonData.episodes?.length > 0) {
                episodesContainer.innerHTML = seasonData.episodes.map(ep => {
                  const epTitle = (ep.name || 'Episode ' + ep.episode_number).replace(/'/g, "\\'");
                  const videoTitle = `${title} - S${seasonNum}E${ep.episode_number}: ${ep.name}`.replace(/'/g, "\\'");
                  
                  const isCurrentEpisode = currentSeason == seasonNum && currentEpisode == ep.episode_number;
                  
                  return `
                    <div class="episode-item ${isCurrentEpisode ? 'current' : ''}">
                      <div class="episode-actions">
                        <button class="episode-play" title="Play episode"
                          onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/tv/${item.id}/${seasonNum}-${ep.episode_number}', '${videoTitle}', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}', ${seasonNum}, ${ep.episode_number})">
                          ▶
                        </button>
                      </div>
                      <span class="episode-number">E${ep.episode_number}</span>
                      <span class="episode-title">${ep.name}</span>
                      <span class="episode-date">${ep.air_date || 'TBA'}</span>
                    </div>
                  `;
                }).join('');
              } else {
                episodesContainer.innerHTML = '<div class="no-episodes">No episodes listed</div>';
              }
              episodesContainer.dataset.loaded = "true";
            } catch (err) {
              console.error("Error loading season:", err);
              episodesContainer.innerHTML = '<div class="no-episodes" style="color:#e50914">Failed to load episodes</div>';
            }
          }
          episodesContainer.classList.toggle('show', isActive);
        };
      });
    }
    
  } catch (error) {
    console.error("Error fetching details:", error);
    modalBody.innerHTML = "<p style='text-align:center;color:#e50914'>Failed to load details. Please try again.</p>";
  }
}

function toggleWatchlistFromModal(id, mediaType, title, posterPath) {
  const item = { id, media_type: mediaType, title, poster_path: posterPath };
  const watchlist = getWatchlist();
  const exists = watchlist.some(w => w.id === id && w.media_type === mediaType);
  
  if (exists) {
    removeFromWatchlist(item);
    alert("Removed from watchlist!");
  } else {
    addToWatchlist(item);
    alert("Added to watchlist!");
  }
  
  document.getElementById("movieModal").style.display = "none";
}

function removeFromContinueWatching(id, mediaType) {
  removeFromWatched(id, mediaType);
  document.getElementById("movieModal").style.display = "none";
  displayContinueWatching();
  alert("Removed from Continue Watching!");
}

function markEpisodeDone(id, mediaType, title, currentSeason, currentEpisode) {
  const nextEpisode = currentEpisode + 1;
  updateTVEpisode(id, mediaType, currentSeason, nextEpisode);
  
  document.getElementById("movieModal").style.display = "none";
  displayContinueWatching();
  alert(`Marked S${currentSeason}E${currentEpisode} as complete! Now tracking S${currentSeason}E${nextEpisode}`);
}

function openVideoPlayer(url, title, id, mediaType, itemTitle, posterPath, season = null, episode = null) {
  const modal = document.getElementById("videoModal");
  const iframe = document.getElementById("videoFrame");
  const titleEl = document.getElementById("videoTitle");
  
  if (!modal || !iframe) return;
  
  addToWatched({ id, media_type: mediaType, title: itemTitle, poster_path: posterPath }, season, episode);
  
  iframe.src = url;
  titleEl.textContent = title || "Now Playing";
  modal.style.display = "block";
  document.body.style.overflow = "hidden";
}

function closeVideoModal() {
  const modal = document.getElementById("videoModal");
  const iframe = document.getElementById("videoFrame");
  
  if (modal) modal.style.display = "none";
  if (iframe) iframe.src = "";
  document.body.style.overflow = "";
  
  if (document.getElementById("home-tab").classList.contains("active")) {
    displayContinueWatching();
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeVideoModal();
    document.getElementById("movieModal").style.display = "none";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  displayContinueWatching();
  
  const movieModal = document.getElementById("movieModal");
  const closeBtn = document.querySelector(".close-btn");
  
  if (closeBtn && movieModal) {
    closeBtn.onclick = () => {
      movieModal.style.display = "none";
    };
  }
  
  if (movieModal) {
    window.onclick = (event) => {
      if (event.target === movieModal) {
        movieModal.style.display = "none";
      }
    };
  }
  
  const videoModal = document.getElementById("videoModal");
  if (videoModal) {
    videoModal.onclick = (e) => {
      if (e.target === videoModal) closeVideoModal();
    };
  }
});