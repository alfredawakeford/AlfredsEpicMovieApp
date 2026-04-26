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
        const lines = csvText.trim().split('\n');
        
        lines.forEach((line, index) => {
            if (index === 0) return;
            const [tmdbId, embedUrl] = line.split(',').map(s => s.trim());
            if (tmdbId && embedUrl) {
                alternateLinks.set(tmdbId, embedUrl);
            }
        });
    } catch (e) { console.warn('movielinks.csv load failed:', e); }
}

async function loadTvAlternateLinks() {
    try {
        const response = await fetch('tvlinks.csv');
        if (!response.ok) return;
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        lines.forEach((line, index) => {
            if (index === 0) return;
            const parts = line.split(',').map(s => s.trim());
            if (parts.length >= 4) {
                const [id, season, episode, embedUrl] = parts;
                const key = `${id}_${season}_${episode}`;
                tvAlternateLinks.set(key, embedUrl);
            }
        });
    } catch (e) { console.warn('tvlinks.csv load failed:', e); }
}

function getAlternateLink(id, mediaType) {
    if (mediaType === 'movie') {
        return alternateLinks.get(String(id)) || null;
    }
    return null;
}

function getTvAlternateLink(id, season, episode) {
    const key = `${id}_${season}_${episode}`;
    return tvAlternateLinks.get(key) || null;
}

// Helper: Sets video source (checks alternate links, handles .mp4 vs iframe)
function setVideoSource(id, mediaType, season, episode, url) {
    const container = document.querySelector(".video-container");
    const iframe = document.getElementById("videoFrame");
    if (!container) return;
    
    let alternateUrl = null;
    if (mediaType === 'tv' && season && episode) {
        alternateUrl = getTvAlternateLink(id, season, episode);
    } else if (mediaType === 'movie') {
        alternateUrl = getAlternateLink(id, mediaType);
    }
    
    container.innerHTML = '';
    
    if (alternateUrl) {
        if (alternateUrl.toLowerCase().endsWith('.mp4')) {
            const videoEl = document.createElement('video');
            videoEl.id = 'videoPlayer';
            videoEl.src = alternateUrl;
            videoEl.controls = true;
            videoEl.autoplay = true;
            videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
            container.appendChild(videoEl);
        } else {
            iframe.src = alternateUrl;
            iframe.style.display = 'block';
            container.appendChild(iframe);
        }
    } else {
        iframe.src = url;
        iframe.style.display = 'block';
        container.appendChild(iframe);
    }
}

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

// ========== CLEAR MOVIES FROM WATCHING ==========
document.getElementById("clearMoviesFromWatching")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to remove all MOVIES from Continue Watching? TV shows will remain.")) {
        const watched = getWatchedData();
        let removedCount = 0;
        for (const key in watched) {
            if (watched[key].media_type === "movie") {
                delete watched[key];
                removedCount++;
            }
        }
        saveWatchedData(watched);
        displayContinueWatching();
    }
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
function addToWatched(item, season = null, episode = null) {
    const watched = getWatchedData();
    const key = `${item.media_type}_${item.id}`;
    watched[key] = {
        id: item.id,
        media_type: item.media_type,
        title: item.title || item.name,
        poster_path: item.poster_path,
        currentSeason: season,
        currentEpisode: episode,
        addedAt: Date.now(),
        lastWatched: Date.now()
    };
    saveWatchedData(watched);
}
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
function removeFromWatched(id, mediaType) {
    const watched = getWatchedData();
    const key = `${mediaType}_${id}`;
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
    }
}
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
        container.innerHTML = "<p>No watched content yet. Start watching now!</p>";
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
        container.innerHTML = "<p>Your watchlist is empty. Right-click search results to add items!</p>";
        return;
    }
    
    container.innerHTML = "";
    watchlist.forEach(item => {
        const div = document.createElement("div");
        div.classList.add("movie");
        const title = item.title || item.name;
        const type = item.media_type === "movie" ? "Movie" : "TV";
        
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
            } else {
                addToWatchlist(item);
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
        
        const watched = getWatchedData();
        const key = `${item.media_type}_${item.id}`;
        const tracked = watched[key];
        const currentSeason = tracked?.currentSeason || null;
        const currentEpisode = tracked?.currentEpisode || null;
        const isInWatched = tracked !== undefined;
        
        let actionButtonsHTML = "";
        
        if (item.media_type === "movie") {
            if (isInWatched) {
                actionButtonsHTML = `
                    <button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/movie/${item.id}', '${title.replace(/'/g, "\\'")} (${year})', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}')">
                        ▶ Play Movie
                    </button>
                    <button class="watched-btn" onclick="removeFromContinueWatching(${item.id}, '${item.media_type}')">
                        Remove from Continue Watching
                    </button>
                `;
            } else {
                actionButtonsHTML = `
                    <button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/movie/${item.id}', '${title.replace(/'/g, "\\'")} (${year})', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}')">
                        ▶ Play Movie
                    </button>
                    <button class="action-btn" onclick="toggleWatchlistFromModal(${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}')">
                        + Add to Watchlist
                    </button>
                `;
            }
        } else if (item.media_type === "tv") {
            if (isInWatched && currentSeason && currentEpisode) {
                actionButtonsHTML = `
                    <button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/tv/${item.id}/${currentSeason}-${currentEpisode}', '${title} - S${currentSeason}E${currentEpisode}', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}', ${currentSeason}, ${currentEpisode})">
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
            } else {
                actionButtonsHTML = `
                    <button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/tv/${item.id}/1-1', '${title} - S1E1', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}', 1, 1)">
                        ▶ Play Season 1 Episode 1
                    </button>
                    <button class="action-btn" onclick="toggleWatchlistFromModal(${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}')">
                        + Add to Watchlist
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
                                    const episodeNumberDisplay = seasonNum == 0 ? '' : `<span class="episode-number">E${ep.episode_number}</span>`;
                                    
                                    return `
                                        <div class="episode-item ${isCurrentEpisode ? 'current' : ''}">
                                            <div class="episode-actions">
                                                <button class="episode-play" title="Play episode"
                                                    onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/tv/${item.id}/${seasonNum}-${ep.episode_number}', '${videoTitle}', ${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${data.poster_path || ''}', ${seasonNum}, ${ep.episode_number})">
                                                    ▶
                                                </button>
                                            </div>
                                            ${episodeNumberDisplay}
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
        modalBody.innerHTML = "<p>Failed to load details. Please try again.</p>";
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
    document.getElementById("movieModal").style.display = "none";
}

function removeFromContinueWatching(id, mediaType) {
    removeFromWatched(id, mediaType);
    document.getElementById("movieModal").style.display = "none";
    displayContinueWatching();
}

async function markEpisodeDone(id, mediaType, title, currentSeason, currentEpisode) {
    let nextSeason, nextEpisode;
    
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
        } else {
            nextSeason = currentSeason;
            nextEpisode = currentEpisode + 1;
        }
        
        updateTVEpisode(id, mediaType, nextSeason, nextEpisode);
    } catch (error) {
        console.error("Data save failed:", error);
        alert("Failed to update progress. Please try again.");
        return;
    }
    
    try {
        displayContinueWatching();
        updateModalUI(id, mediaType, title, nextSeason, nextEpisode);
    } catch (uiError) {
        console.warn("UI refresh skipped (data saved successfully):", uiError);
    }
}

function updateModalUI(id, mediaType, title, nextSeason, nextEpisode) {
    const posterPath = document.querySelector('.modal-poster')?.getAttribute('src')?.split('/w500')[1] || '';
    const modalActions = document.querySelector('.modal-actions');
    
    if (modalActions) {
        modalActions.innerHTML = `
            <button class="play-btn" id="tempPlayBtn" onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/tv/${id}/${nextSeason}-${nextEpisode}', '${title.replace(/'/g, "\\'")} - S${nextSeason}E${nextEpisode}', ${id}, '${mediaType}', '${title.replace(/'/g, "\\'")}', '${posterPath}', ${nextSeason}, ${nextEpisode})">
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
            <button class="play-btn" onclick="openVideoPlayer('https://vidsrc-embed.ru/embed/tv/${id}/1-1', '${title.replace(/'/g, "\\'")} - S1E1', ${id}, 'tv', '${title.replace(/'/g, "\\'")}', '${posterPath}', 1, 1)">
                ▶ Play Season 1 Episode 1
            </button>
            <button class="action-btn" onclick="toggleWatchlistFromModal(${id}, 'tv', '${title.replace(/'/g, "\\'")}', '${posterPath}')">
                + Add to Watchlist
            </button>
        `;
    }
    
    document.querySelectorAll('.episode-item.current, .season-toggle.current').forEach(el => el.classList.remove('current'));
}

async function openVideoPlayer(url, title, id, mediaType, itemTitle, posterPath, season = null, episode = null) {
    const modal = document.getElementById("videoModal");
    const titleEl = document.getElementById("videoTitle");
    if (!modal) return;
    
    const watchlistItem = { id, media_type: mediaType, title: itemTitle, poster_path: posterPath };
    removeFromWatchlist(watchlistItem);
    addToWatched({ id, media_type: mediaType, title: itemTitle, poster_path: posterPath }, season, episode);
    
    setVideoSource(id, mediaType, season, episode, url);
    
    titleEl.textContent = title || "Now Playing";
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
    
    if (document.getElementById("watchlist-tab")?.classList.contains("active")) {
        displayWatchlist();
    }
    
    if (mediaType.trim() === "tv" && season && episode) {
        try {
            const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${apiKey}&language=en-US`);
            const seasonData = await res.json();
            const epData = seasonData.episodes?.find(ep => ep.episode_number === episode);
            if (epData && epData.name) {
                titleEl.textContent = `${itemTitle} - S${season}E${episode}: ${epData.name}`;
            }
        } catch (err) { console.warn("Failed to fetch episode name:", err); }
    }
    
    setupVideoControls(id, mediaType, season, episode, itemTitle);
}

async function setupVideoControls(id, mediaType, season, episode, itemTitle) {
    const oldControls = document.getElementById("videoControls");
    if (oldControls) oldControls.remove();
    
    if (mediaType.trim() !== "tv" || !season || !episode) return;
    
    currentVideoState = { id, mediaType: mediaType.trim(), season, episode, itemTitle, totalEpisodesInSeason: 0, totalSeasons: 0 };
    
    const container = document.createElement("div");
    container.id = "videoControls";
    container.className = "video-controls";
    
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "Previous Episode";
    prevBtn.className = "video-nav-btn";
    prevBtn.onclick = () => navigateEpisode(-1);
    
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next Episode";
    nextBtn.className = "video-nav-btn";
    nextBtn.onclick = () => navigateEpisode(1);
    
    container.appendChild(prevBtn);
    container.appendChild(nextBtn);
    
    document.getElementById("videoTitle").after(container);
    
    try {
        const [seasonRes, showRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}?api_key=${apiKey}&language=en-US`),
            fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=en-US`)
        ]);
        const sData = await seasonRes.json();
        const shData = await showRes.json();
        currentVideoState.totalEpisodesInSeason = sData.episodes?.length || 0;
        currentVideoState.totalSeasons = shData.seasons?.filter(s => s.season_number > 0).length || 0;
    } catch (e) { console.error("Control limits fetch failed:", e); }
    
    updateButtonStates();
}

async function navigateEpisode(direction) {
    let s = currentVideoState.season;
    let e = currentVideoState.episode;
    const id = currentVideoState.id;

    // --- Calculate Next/Prev Episode ---
    if (direction === 1) { // Next
        if (e >= currentVideoState.totalEpisodesInSeason) {
            if (s >= currentVideoState.totalSeasons) { alert("End of series!"); return; }
            s++; e = 1;
            try { const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`); currentVideoState.totalEpisodesInSeason = (await r.json()).episodes?.length || 0; } catch(err){}
        } else { e++; }
    } else { // Previous
        if (e <= 1) {
            if (s <= 1) { alert("First episode!"); return; }
            s--;
            try { const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`); const d = await r.json(); currentVideoState.totalEpisodesInSeason = d.episodes?.length || 0; } catch(err){}
            e = currentVideoState.totalEpisodesInSeason;
        } else { e--; }
    }

    currentVideoState.season = s;
    currentVideoState.episode = e;

    updateTVEpisode(id, currentVideoState.mediaType, s, e);
    displayContinueWatching();

    // ✅ FIX: Clear container and check for alternate links
    const container = document.querySelector(".video-container");
    container.innerHTML = ''; // Remove old iframe or video

    let defaultSrc = `https://vidsrc-embed.ru/embed/tv/${id}/${s}-${e}`;
    const alternateUrl = getTvAlternateLink(id, s, e); // Check TV links CSV

    if (alternateUrl && alternateUrl.toLowerCase().endsWith('.mp4')) {
        // 🎬 Direct Video
        const videoEl = document.createElement('video');
        videoEl.id = 'videoPlayer';
        videoEl.src = alternateUrl;
        videoEl.controls = true;
        videoEl.autoplay = true;
        videoEl.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;';
        container.appendChild(videoEl);
    } else {
        // 🖼️ Iframe (Alternate or Default)
        const iframe = document.createElement('iframe');
        iframe.id = 'videoFrame';
        iframe.allowFullscreen = true;
        iframe.src = alternateUrl || defaultSrc;
        iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';
        container.appendChild(iframe);
    }

    document.getElementById("videoTitle").textContent = `${currentVideoState.itemTitle} - S${s}E${e}`;

    // Fetch episode name for title
    try {
        const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${s}?api_key=${apiKey}`);
        const sd = await res.json();
        const ed = sd.episodes?.find(ep => ep.episode_number === e);
        if (ed?.name) document.getElementById("videoTitle").textContent = `${currentVideoState.itemTitle} - S${s}E${e}: ${ed.name}`;
    } catch(err){}

    // Sync background modal
    if (document.getElementById('movieModal')?.style.display === 'block') {
        try { updateModalUI(id, currentVideoState.mediaType, currentVideoState.itemTitle, s, e); } catch(e){}
    }

    updateButtonStates();
}

function updateButtonStates() {
    const c = document.getElementById("videoControls");
    if (!c) return;
    const [prev, next] = c.querySelectorAll("button");
    prev.disabled = currentVideoState.season <= 1 && currentVideoState.episode <= 1;
    next.disabled = currentVideoState.season >= currentVideoState.totalSeasons &&
                    currentVideoState.episode >= currentVideoState.totalEpisodesInSeason;
}

function closeVideoModal() {
    const modal = document.getElementById("videoModal");
    const container = document.querySelector(".video-container"); // ✅ Target container
    
    if (modal) modal.style.display = "none";
    
    // ✅ Clear all content (video or iframe)
    if (container) container.innerHTML = ''; 
    
    document.body.style.overflow = "";
    const controls = document.getElementById("videoControls");
    if (controls) controls.remove();
    
    currentVideoState = { id: null, mediaType: null, season: null, episode: null, itemTitle: null, totalEpisodesInSeason: 0, totalSeasons: 0 };

    if (document.getElementById("home-tab")?.classList.contains("active")) {
        displayContinueWatching();
    }
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeVideoModal();
        document.getElementById("movieModal").style.display = "none";
    }
});

// ========== NEW ADDITIONS ==========
async function loadNewAdditions(append = false) {
    if (newAdditionsLoading) return;
    const container = document.getElementById("newAdditions");
    
    if (!append) {
        container.innerHTML = "<p>Loading...</p>";
        newAdditionsPage = 1;
    }
    
    newAdditionsLoading = true;
    
    try {
        const [moviesRes, tvRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${apiKey}&page=${newAdditionsPage}`),
            fetch(`https://api.themoviedb.org/3/tv/on_the_air?api_key=${apiKey}&page=${newAdditionsPage}`)
        ]);
        
        const moviesData = await moviesRes.json();
        const tvData = await tvRes.json();
        
        const movies = moviesData.results.map(m => ({ ...m, media_type: "movie" }));
        const tv = tvData.results.map(t => ({ ...t, media_type: "tv" }));
        
        let combined = [...movies, ...tv];
        combined.sort((a, b) => {
            const dateA = new Date(a.release_date || a.first_air_date || 0);
            const dateB = new Date(b.release_date || b.first_air_date || 0);
            return dateB - dateA;
        });
        
        displayNewAdditions(combined, !append);
        newAdditionsPage++;
    } catch (error) {
        console.error("Error loading new additions:", error);
        if (!append) {
            container.innerHTML = "<p>Failed to load new additions</p>";
        }
    }
    
    newAdditionsLoading = false;
}

function displayNewAdditions(items, clear = true) {
    const container = document.getElementById("newAdditions");
    
    if (clear) {
        container.innerHTML = "";
    }
    
    items.forEach(item => {
        if (!item.poster_path) return;
        
        const div = document.createElement("div");
        div.classList.add("movie");
        
        const title = item.title || item.name;
        const type = item.media_type === "movie" ? "Movie" : "TV";
        const releaseDate = item.release_date || item.first_air_date || "";
        const year = releaseDate.split("-")[0];
        
        const badgeText = item.media_type === "tv" ? "New Episodes" : "New Movie";
        const badgeClass = item.media_type === "tv" ? "release-badge tv" : "release-badge movie";
        
        div.innerHTML = `
            <img src="https://image.tmdb.org/t/p/w300${item.poster_path}" alt="${title}">
            <div class="${badgeClass}">${badgeText}</div>
            <div class="movie-title">${title} (${type}) ${year}</div>
        `;
        
        div.onclick = () => {
            showMovieDetails(item, false);
        };
        
        container.appendChild(div);
    });
    
    if (!clear || newAdditionsPage > 1) {
        const loader = document.createElement("div");
        loader.className = "new-additions-loader";
        loader.innerHTML = "Loading more...";
        container.appendChild(loader);
    }
}

// ========== DOMContentLoaded ==========
document.addEventListener("DOMContentLoaded", () => {
    loadAlternateLinks();
    loadTvAlternateLinks();
    displayContinueWatching();
    loadNewAdditions();
    
    const newAdditionsContainer = document.getElementById("newAdditions");
    if (newAdditionsContainer) {
        newAdditionsContainer.addEventListener("scroll", () => {
            const scrollLeft = newAdditionsContainer.scrollLeft;
            const scrollWidth = newAdditionsContainer.scrollWidth;
            const clientWidth = newAdditionsContainer.clientWidth;
            
            if (scrollLeft + clientWidth >= scrollWidth * 0.8) {
                loadNewAdditions(true);
            }
        });
    }
    
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
