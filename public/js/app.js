(async () => {
    'use strict';
    await window.TShowAccount?.ready;
    const { nextEpisode, upcomingEpisodes, matchesSource, resumePosition } = await import('./watching-tools.mjs?v=20260915-6');
    const { uniqueHistory } = await import('./media-history.mjs?v=20260915-6');

    const STORAGE_KEYS = {
        watchlist: 'streamflix:watchlist:v1',
        continueWatching: 'streamflix:continue:v1',
        recentlyViewed: 'tshow:recent:v1',
        dataSaver: 'streamflix:data-saver:v1',
        addonURLs: 'streamflix:addons:v1',
        addonClientId: 'streamflix:addon-client:v1',
        region: 'tshow:region:v1',
        playerPreferences: 'tshow:player:v1'
    };
    const HOME_CACHE_KEY = 'tshow:home-catalog:v1';
    const STARTER_CATALOG = {
        movies: [
            ['tt0111161', 'The Shawshank Redemption', '1994', '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', '/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg', 8.7],
            ['tt0068646', 'The Godfather', '1972', '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg', 8.7],
            ['tt0468569', 'The Dark Knight', '2008', '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', '/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg', 8.5],
            ['tt0110912', 'Pulp Fiction', '1994', '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg', 8.5],
            ['tt0109830', 'Forrest Gump', '1994', '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', '/3h1JZGDhZ8nzxdgvkxha0qBqi05.jpg', 8.5],
            ['tt0093779', 'The Princess Bride', '1987', '/kTXxdNv44najTayFcrT487xWuDv.jpg', null, 7.7]
        ],
        series: [
            ['tt5180504', 'The Witcher', '2019', '/cZ0d3rtvXPVvuiX22sP79K3Hmjz.jpg', '/foGkPxpw9h8zln81j63mix5B7m8.jpg', 8.0],
            ['tt8111088', 'The Mandalorian', '2019', '/eU1i6eHXlzMOlEq0ku1Rzq7Y4wA.jpg', '/9ijMGlJKqcslswWUzTEwScm82Gs.jpg', 8.4],
            ['tt3581920', 'The Last of Us', '2023', '/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg', '/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg', 8.6],
            ['tt11280740', 'Severance', '2022', '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg', '/b1Y8SUb12gPHCSSSNlbX4nB3IKy.jpg', 8.4]
        ]
    };

    if (window.TShowAccount?.user) {
        for (const key of Object.keys(STORAGE_KEYS)) STORAGE_KEYS[key] = window.TShowAccount.storageKey(key);
    }
    const saveStored = (key, value) => window.TShowAccount ? window.TShowAccount.save(key, value) : (value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));

    const addonClientId = loadOrCreateAddonClientId();

    const state = {
        trending: [],
        movies: [],
        series: [],
        latestMovies: [],
        topMovies: [],
        topSeries: [],
        airingToday: [],
        featured: null,
        watchlist: loadStoredArray(STORAGE_KEYS.watchlist),
        recentlyViewed: loadStoredArray(STORAGE_KEYS.recentlyViewed),
        continueEntry: loadStoredValue(STORAGE_KEYS.continueWatching),
        addons: [],
        addonCatalogs: [],
        addonCatalogSignature: '',
        addonCatalogGeneration: 0,
        addonCatalogLoadPromise: null,
        activeView: 'home',
        activeMedia: null,
        activeDetails: null,
        activeVideoId: null,
        playerMedia: null,
        streams: [],
        sourceFilter: 'all',
        visibleStreamIndexes: [],
        activeStreamIndex: null,
        playerRequest: 0,
        playerRequestKey: null,
        hlsPlayer: null,
        activeExternalURL: null,
        activeExternalAppURL: null,
        activeAttemptIndex: null,
        activeHlsURL: null,
        transcodeTried: false,
        trailerMode: false,
        lastProgressSave: 0,
        subtitleLibrary: [],
        subtitleObjectURL: null,
        editingAddonId: null,
        addonURLs: loadStoredArray(STORAGE_KEYS.addonURLs)
            .filter((value) => typeof value === 'string' && value.length <= 8192)
            .slice(0, 20),
        lastAddonSync: 0,
        dataSaver: false,
        installPrompt: null,
        addonFilter: 'all',
        region: loadStoredRegion(),
        exploreItems: [],
        exploreFilter: 'all',
        tmdbConfigured: false,
        browseType: null,
        browseItems: [],
        browseNextPage: 3,
        browseNextSkip: 100,
        browseLoading: false,
        browseExhausted: false,
        browseEmptyPages: 0,
        browseGeneration: 0,
        browseObserver: null
    };

    const elements = {};

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else void init();

    async function init() {
        cacheElements();
        bindEvents();
        window.addEventListener('tshow:account-data-refreshed', (event) => {
            if (!event.detail?.keys?.includes('addonURLs')) return;
            state.addonURLs = loadStoredArray(STORAGE_KEYS.addonURLs)
                .filter(value => typeof value === 'string' && value.length <= 8192)
                .slice(0, 20);
            void initializeAddons();
        });
        setupWatchingTools();
        updateListCount();
        renderContinueWatching();
        renderRecentlyViewed();
        restoreFastHome();
        updateClock();
        setupHeroScroll();
        window.setInterval(updateClock, 30_000);
        registerPWA();
        const installRailControls = () => document.querySelectorAll('.media-rail').forEach(rail => {
            if (rail.dataset.controlsReady) return;
            rail.dataset.controlsReady = 'true';
            const controls = makeElement('div', 'rail-controls');
            const label = rail.closest('section')?.querySelector('h2, h3')?.textContent || 'Titles';
            for (const [direction, symbol] of [[-1, '‹'], [1, '›']]) {
                const button = makeElement('button', 'rail-arrow', symbol);
                button.type = 'button';
                button.setAttribute('aria-label', label + (direction < 0 ? ': previous titles' : ': next titles'));
                button.addEventListener('click', () => rail.scrollBy({ left: direction * Math.max(160, rail.clientWidth * .85), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
                controls.append(button);
            }
            rail.before(controls);
            const update = () => {
                controls.children[0].disabled = rail.scrollLeft < 2;
                controls.children[1].disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
                controls.hidden = rail.scrollWidth <= rail.clientWidth + 2;
            };
            rail.addEventListener('scroll', update, { passive: true });
            new ResizeObserver(update).observe(rail);
            new MutationObserver(update).observe(rail, { childList: true });
            update();
        });
        installRailControls();
        new MutationObserver(installRailControls).observe(document.getElementById('main-content'), { childList: true, subtree: true });
        const addonNotice = document.getElementById('addon-account-notice');
        if (addonNotice) addonNotice.hidden = Boolean(window.TShowAccount?.user);

        const searchParams = new URLSearchParams(window.location.search);
        const requestedView = searchParams.get('view');
        const requestedTitle = searchParams.get('title');
        const titleMatch = String(requestedTitle || '').match(/^(movie|tv):(\d{1,12}|tt\d{5,12})$/i);
        const isFullTitle = Boolean(titleMatch && searchParams.get('full') === '1');
        const homeReady = isFullTitle ? initializeAddons() : Promise.all([loadHome(), initializeAddons()]);

        const browsePath = window.location.pathname.replace(/\/$/, '');
        if (!isFullTitle && browsePath === '/movies') showBrowseView('movie');
        if (!isFullTitle && browsePath === '/series') showBrowseView('tv');
        if (!isFullTitle && ['home', 'explore', 'list', 'calendar', 'history', 'addons', 'settings', 'help'].includes(requestedView)) setView(requestedView);
        if (titleMatch) {
            if (isFullTitle) {
                state.titlePageActive = true;
                document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = true; });
                elements.titleDetailView.hidden = false;
                await homeReady;
            }
            const titleType = titleMatch[1].toLowerCase();
            const titleId = titleMatch[2];
            await openDetails(/^tt/i.test(titleId) ? {
                id: titleId,
                imdb_id: titleId,
                media_type: titleType,
                _stremioId: titleId,
                _stremioType: titleType === 'tv' ? 'series' : 'movie',
                _sourceAddonId: 'org.streamflix.cinemeta',
                _sourceAddonName: 'Cinemeta Search & Metadata',
                _addonCatalog: true
            } : { id: Number(titleId), media_type: titleType }, { fullPage: isFullTitle });
        }
        if (!isFullTitle) {
            await homeReady;
            const returnScroll = Number(sessionStorage.getItem('tshow:return-scroll'));
            if (Number.isFinite(returnScroll) && returnScroll > 0) {
                sessionStorage.removeItem('tshow:return-scroll');
                requestAnimationFrame(() => window.scrollTo({ top: returnScroll, behavior: 'instant' }));
            }
        }
    }

    function cacheElements() {
        const ids = [
            'site-header',
            'site-sidebar',
            'sidebar-scrim',
            'menu-button',
            'install-app-button',
            'header-clock',
            'search-form',
            'search-input',
            'search-clear',
            'list-count',
            'hero',
            'hero-art',
            'hero-title',
            'hero-meta',
            'hero-overview',
            'hero-play',
            'hero-info',
            'title-detail-view',
            'title-detail-content',
            'catalog-mode',
            'continue-section',
            'continue-rail',
            'trending-rail',
            'movies-rail',
            'series-rail',
            'latest-movies-rail',
            'top-movies-rail',
            'top-series-rail',
            'airing-today-rail',
            'recent-section',
            'recent-rail',
            'addon-catalogs-section',
            'addon-catalogs-container',
            'refresh-addon-catalogs',
            'list-grid',
            'list-empty',
            'calendar-board',
            'calendar-empty',
            'history-grid',
            'history-empty',
            'clear-history',
            'explore-tabs',
            'explore-grid',
            'search-title',
            'search-summary',
            'search-grid',
            'search-empty',
            'browse-toolbar',
            'browse-sort',
            'browse-loader',
            'browse-loader-title',
            'browse-loader-note',
            'browse-load-more',
            'addon-count',
            'addon-form',
            'manifest-url',
            'install-addon-button',
            'refresh-addons',
            'addon-grid',
            'addon-filter-group',
            'export-data-button',
            'import-data-button',
            'import-data-input',
            'contact-form',
            'contact-submit',
            'contact-status',
            'region-select',
            'details-dialog',
            'details-close',
            'details-content',
            'player-dialog',
            'player-close',
            'player-title',
            'player-pip',
            'player-fullscreen',
            'video-stage',
            'video-player',
            'trailer-frame',
            'video-loading',
            'external-source',
            'external-source-title',
            'external-source-note',
            'open-external-source',
            'try-direct-source',
            'source-summary',
            'source-filter-group',
            'source-compatibility-help',
            'stream-select',
            'speed-select',
            'data-saver-button',
            'external-player-actions',
            'open-in-desktop',
            'open-in-vlc',
            'open-in-outplayer',
            'open-in-source-app',
            'copy-source-link',
            'subtitle-select',
            'open-local-subtitle',
            'subtitle-file-input',
            'player-source-title',
            'player-source-note',
            'toast-region'
        ];

        for (const id of ids) {
            elements[toCamelCase(id)] = document.getElementById(id);
        }
    }

    function bindEvents() {
        document.querySelector('.title-back-link')?.addEventListener('click', (event) => {
            let sameSiteReferrer = false;
            try {
                sameSiteReferrer = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
            } catch {}
            if (sameSiteReferrer && window.history.length > 1) {
                event.preventDefault();
                window.history.back();
            }
        });
        document.querySelectorAll('.nav-trigger, .nav-link').forEach((button) => {
            if (!button.dataset.view) return;
            button.addEventListener('click', () => {
                setView(button.dataset.view);
                closeSidebar();
            });
        });

        document.querySelectorAll('[data-browse-collection]').forEach((button) => {
            button.addEventListener('click', () => {
                showBrowseView(button.dataset.browseCollection === 'movies' ? 'movie' : 'tv');
                closeSidebar();
            });
        });

        document.querySelectorAll('[data-browse-rail]').forEach((button) => {
            button.addEventListener('click', () => showCollectionView(button.dataset.browseRail));
        });

        document.querySelectorAll('[data-explore-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                state.exploreFilter = button.dataset.exploreFilter || 'all';
                renderExplore();
            });
        });

        elements.menuButton?.addEventListener('click', toggleSidebar);
        elements.sidebarScrim?.addEventListener('click', closeSidebar);
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeSidebar();
            if (!elements.playerDialog?.open || event.target.closest('input, textarea, select, button, summary')) return;
            if (event.key === ' ' && !elements.videoPlayer.hidden) {
                event.preventDefault();
                if (elements.videoPlayer.paused) elements.videoPlayer.play().catch(() => {});
                else elements.videoPlayer.pause();
            }
            if (['ArrowLeft','ArrowRight'].includes(event.key) && Number.isFinite(elements.videoPlayer.duration)) {event.preventDefault();elements.videoPlayer.currentTime=Math.max(0,Math.min(elements.videoPlayer.duration,elements.videoPlayer.currentTime+(event.key==='ArrowRight'?10:-10)));}
            if (event.key.toLocaleLowerCase() === 'm') elements.videoPlayer.muted = !elements.videoPlayer.muted;
            if (event.key.toLocaleLowerCase() === 'f' && document.fullscreenEnabled) {
                togglePlayerFullscreen();
            }
            if (event.key.toLocaleLowerCase() === 'p' && document.pictureInPictureEnabled && !elements.videoPlayer.hidden) {
                document.pictureInPictureElement
                    ? document.exitPictureInPicture()
                    : elements.videoPlayer.requestPictureInPicture?.().catch(() => {});
            }
        });

        elements.clearHistory?.addEventListener('click', clearHistory);
        elements.addonFilterGroup?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-addon-filter]');
            if (!button) return;
            state.addonFilter = button.dataset.addonFilter || 'all';
            elements.addonFilterGroup.querySelectorAll('[data-addon-filter]').forEach((candidate) => {
                candidate.classList.toggle('is-active', candidate === button);
            });
            renderAddons();
        });

        elements.searchForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            runSearch(elements.searchInput.value);
        });

        elements.searchInput?.addEventListener('input', () => {
            elements.searchClear.hidden = !elements.searchInput.value;
        });

        elements.searchClear?.addEventListener('click', () => {
            elements.searchInput.value = '';
            elements.searchClear.hidden = true;
            elements.searchInput.focus();
            if (state.activeView === 'search') setView('home');
        });

        elements.browseSort?.addEventListener('change', renderBrowseItems);
        elements.browseLoadMore?.addEventListener('click', () => loadMoreBrowse());
        if ('IntersectionObserver' in window && elements.browseLoader) {
            state.browseObserver = new IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) loadMoreBrowse();
            }, { rootMargin: '900px 0px' });
            state.browseObserver.observe(elements.browseLoader);
        }

        elements.regionSelect?.addEventListener('change', () => {
            state.region = elements.regionSelect.value;
            saveStored(STORAGE_KEYS.region, state.region);
            showToast(`Viewing region changed to ${elements.regionSelect.selectedOptions[0].textContent}.`);
        });

        elements.heroPlay?.addEventListener('click', () => {
            if (!state.featured) return;
            if (mediaType(state.featured) === 'tv' && state.featured._addonCatalog) {
                openDetails(state.featured);
            } else {
                playMedia(state.featured);
            }
        });
        elements.heroInfo?.addEventListener('click', () => {
            if (state.featured) openDetails(state.featured);
        });

        elements.addonForm?.addEventListener('submit', installAddon);
        elements.refreshAddons?.addEventListener('click', refreshAddons);
        elements.exportDataButton?.addEventListener('click', exportBrowserData);
        elements.importDataButton?.addEventListener('click', () => elements.importDataInput.click());
        elements.importDataInput?.addEventListener('change', importBrowserData);
        elements.contactForm?.addEventListener('submit', submitContactForm);

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            state.installPrompt = event;
            elements.installAppButton.hidden = false;
        });
        elements.installAppButton?.addEventListener('click', installPWA);
        window.addEventListener('appinstalled', () => {
            state.installPrompt = null;
            elements.installAppButton.hidden = true;
            showToast('TShow was installed successfully.');
        });
        elements.refreshAddonCatalogs?.addEventListener('click', () => {
            state.addonCatalogLoadPromise = loadAddonCatalogs({ force: true });
        });

        elements.detailsClose?.addEventListener('click', () => elements.detailsDialog.close());
        elements.detailsDialog?.addEventListener('close', () => {
            state.detailsRequest = (state.detailsRequest || 0) + 1;
        });
        elements.playerClose?.addEventListener('click', () => elements.playerDialog.close());
        elements.playerFullscreen?.addEventListener('click', togglePlayerFullscreen);
        elements.playerPip?.addEventListener('click', togglePlayerPictureInPicture);
        document.addEventListener('fullscreenchange', updatePlayerWindowActions);
        elements.videoPlayer?.addEventListener('enterpictureinpicture', updatePlayerWindowActions);
        elements.videoPlayer?.addEventListener('leavepictureinpicture', updatePlayerWindowActions);

        [elements.detailsDialog, elements.playerDialog].forEach((dialog) => {
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog) dialog.close();
            });
            dialog.addEventListener('close', updateDialogState);
        });

        elements.playerDialog?.addEventListener('close', closePlayer);
        elements.streamSelect?.addEventListener('change', () => {
            const index = Number.parseInt(elements.streamSelect.value, 10);
            if (Number.isInteger(index)) applyStream(index);
        });
        elements.sourceFilterGroup.querySelectorAll('[data-source-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                state.sourceFilter = button.dataset.sourceFilter || 'all';
                renderSourcePicker();
            });
        });
        elements.speedSelect?.addEventListener('change', () => {
            elements.videoPlayer.playbackRate = Number(elements.speedSelect.value) || 1;
        });
        elements.dataSaverButton?.addEventListener('click', toggleDataSaver);
        elements.openInDesktop?.addEventListener('click', openActiveStreamInDesktop);
        window.tshowDesktop?.onPlayback?.(event => {
            if (!state.nativePlayback || event.sessionId !== state.nativePlayback.id || state.nativePlayback.key !== state.playerRequestKey) return;
            if (event.type === 'progress') {
                state.nativePlayback.position = event.position;
                state.nativePlayback.duration = event.duration;
                state.playingScope = state.playerRequestKey;
                savePlaybackProgress();
            } else if (event.type === 'error') {
                savePlaybackProgress(true);
                elements.playerSourceNote.textContent = event.error;
                showToast(event.error, 'warning');
                document.getElementById('recover-source-button').hidden = false;
            } else if (event.type === 'closed') {
                savePlaybackProgress(true);
                elements.videoLoading.hidden = true;
                elements.playerSourceNote.textContent = 'Choose a source to play in the app. Esc returns here from video playback.';
                state.nativePlayback = null;
            }
        });
        elements.openInVlc?.addEventListener('click', openActiveStreamInVlc);
        elements.openInOutplayer?.addEventListener('click', openActiveStreamInOutplayer);
        elements.openInSourceApp?.addEventListener('click', openActiveStreamInSourceApp);
        elements.copySourceLink?.addEventListener('click', copyActiveSourceLink);
        updateDataSaverButton();
        elements.videoPlayer.textTracks?.addEventListener('addtrack', renderSubtitlePicker);
        elements.videoPlayer.textTracks?.addEventListener('removetrack', renderSubtitlePicker);
        document.getElementById('video-fit')?.addEventListener('change', (event) => { elements.videoStage.dataset.videoFit = event.target.value; });
        document.getElementById('subtitle-size')?.addEventListener('change', (event) => { elements.videoStage.dataset.subtitleSize = event.target.value; });
        elements.subtitleSelect?.addEventListener('change', () => {
            applySubtitleChoice(elements.subtitleSelect.value);
        });
        elements.openLocalSubtitle?.addEventListener('click', () => {
            elements.subtitleFileInput.click();
        });
        elements.subtitleFileInput?.addEventListener('change', openLocalSubtitle);
        elements.openExternalSource?.addEventListener('click', () => {
            if (state.activeExternalURL) {
                window.open(state.activeExternalURL, '_blank', 'noopener,noreferrer');
            }
        });
        elements.tryDirectSource?.addEventListener('click', () => {
            if (Number.isInteger(state.activeAttemptIndex)) {
                applyStream(state.activeAttemptIndex, { forceAttempt: true });
            }
        });

        elements.videoPlayer?.addEventListener('timeupdate', () => savePlaybackProgress());
        elements.videoPlayer?.addEventListener('pause', () => savePlaybackProgress(true));
        elements.videoPlayer?.addEventListener('ended', () => {
            if (state.playerMedia) {
                saveStored(STORAGE_KEYS.continueWatching, null);
                state.continueEntry = null;
                renderContinueWatching();
            }
        });
        elements.videoPlayer?.addEventListener('error', () => {
            if (!elements.videoPlayer.currentSrc || state.hlsPlayer) return;
            const stream = state.streams[state.activeStreamIndex];
            if (stream) { stream._browserChecked = false; stream._browserCheckDone = true; renderSourcePicker(); }
            document.getElementById('recover-source-button').hidden = false;
            if (browserAttemptURL(stream)) {
                updateExternalPlayerActions(stream);
                showUnsupportedSource(
                    elements.videoPlayer.error?.code === 2
                        ? 'The provider could not deliver this video. Its link may have expired or returned an access error. Choose another source.'
                        : 'This link did not return playable video. The provider may be returning an error page, or the video format may be unsupported. Try another source; H.264/AAC is usually the best browser option.'
                );
                return;
            }
            showToast('This source could not be played by the browser. Try another source or video format.', 'error');
        });

        window.addEventListener('scroll', () => {
            elements.siteHeader.classList.toggle('is-scrolled', window.scrollY > 18);
            if (state.browseType && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1200) {
                loadMoreBrowse();
            }
        }, { passive: true });
    }

    function starterItems(type) {
        const descriptor = { addon: { id: 'org.cvmturan.discovery', name: 'TShow Discovery' }, catalog: { id: 'top', name: 'Popular' }, type };
        return normalizeLiveCatalog({ metas: STARTER_CATALOG[type === 'movie' ? 'movies' : 'series'].map(([id, name, releaseInfo, poster, background, imdbRating]) => ({
            id, name, releaseInfo, imdbRating, type,
            poster: poster ? `https://image.tmdb.org/t/p/w500${poster}` : null,
            background: background ? `https://image.tmdb.org/t/p/original${background}` : null
        })) }, descriptor);
    }

    function restoreFastHome() {
        let cached;
        try { cached = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null'); } catch { cached = null; }
        const fresh = cached && Date.now() - Number(cached.savedAt) < 24 * 60 * 60 * 1000 && Array.isArray(cached.movies) && Array.isArray(cached.series);
        state.movies = fresh ? cached.movies : starterItems('movie');
        state.series = fresh ? cached.series : starterItems('series');
        state.trending = weaveCollections(state.movies, state.series);
        state.latestMovies = sortByLatest(state.movies);
        state.topMovies = sortByRating(state.movies);
        state.topSeries = sortByRating(state.series);
        state.airingToday = sortByLatest(state.series);
        renderHome(fresh ? 'Saved catalog · refreshing' : 'Ready · refreshing catalog', true);
    }

    function saveHomeCache() {
        try {
            localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
                savedAt: Date.now(),
                movies: state.movies.slice(0, 100),
                series: state.series.slice(0, 100)
            }));
        } catch { /* The live catalog still works when browser storage is unavailable. */ }
    }

    function renderHome(label, allowRepeats = false) {
        if (!state.trending.length) state.trending = weaveCollections(state.movies, state.series);
        state.featured = state.movies.find((media) => media.backdrop_path && media.overview) ||
            state.trending.find((media) => media.backdrop_path && media.overview) || state.movies[0] || state.series[0] || null;
        const homeRows = allowRepeats ? {
            trending: state.trending,
            movies: state.movies,
            latestMovies: state.latestMovies,
            topMovies: state.topMovies,
            series: state.series,
            topSeries: state.topSeries,
            airingToday: state.airingToday
        } : buildUniqueHomeRows(state.featured ? [state.featured] : []);
        renderHero(state.featured);
        renderRail(elements.trendingRail, homeRows.trending);
        renderRail(elements.moviesRail, homeRows.movies);
        renderRail(elements.latestMoviesRail, homeRows.latestMovies);
        renderRail(elements.topMoviesRail, homeRows.topMovies);
        renderRail(elements.seriesRail, homeRows.series);
        renderRail(elements.topSeriesRail, homeRows.topSeries);
        renderRail(elements.airingTodayRail, homeRows.airingToday);
        elements.catalogMode.textContent = label;
    }

    async function loadHome() {
        try {
            const tmdbHealth = await api('/api/tmdb/health').catch(() => ({ tmdbKey: false }));
            state.tmdbConfigured = Boolean(tmdbHealth.tmdbKey);
            let catalogLabel = 'Live public metadata';

            if (tmdbHealth.tmdbKey) {
                const [trendingData, moviesData, seriesData, latestMoviesData, topMoviesData, topSeriesData, airingData] = await Promise.all([
                    api('/api/tmdb/trending/all/week'),
                    loadPagedCatalog('/api/tmdb/popular/movies'),
                    loadPagedCatalog('/api/tmdb/popular/tv'),
                    loadPagedCatalog('/api/tmdb/now-playing/movies'),
                    loadPagedCatalog('/api/tmdb/top-rated/movies'),
                    loadPagedCatalog('/api/tmdb/top-rated/tv'),
                    loadPagedCatalog('/api/tmdb/airing-today/tv')
                ]);
                state.movies = normalizeCollection(moviesData.results, 'movie');
                state.series = normalizeCollection(seriesData.results, 'tv');
                state.trending = normalizeCollection(trendingData.results);
                state.latestMovies = normalizeCollection(latestMoviesData.results, 'movie');
                state.topMovies = normalizeCollection(topMoviesData.results, 'movie');
                state.topSeries = normalizeCollection(topSeriesData.results, 'tv');
                state.airingToday = normalizeCollection(airingData.results, 'tv');
                catalogLabel = 'Live movie & TV catalog';
            } else {
                try {
                    const [moviePages, seriesPages] = await Promise.all([
                        Promise.all([0].map((skip) => api(`/api/addons/catalog/org.cvmturan.discovery/movie/top?skip=${skip}`))),
                        Promise.all([0].map((skip) => api(`/api/addons/catalog/org.cvmturan.discovery/series/top?skip=${skip}`)))
                    ]);
                    const discoveryAddon = {
                        id: 'org.cvmturan.discovery',
                        name: 'TShow Discovery'
                    };
                    state.movies = normalizeLiveCatalog(
                        mergeAddonCatalogPages(moviePages),
                        { addon: discoveryAddon, catalog: { id: 'top', name: 'Popular movies' }, type: 'movie' }
                    );
                    state.series = normalizeLiveCatalog(
                        mergeAddonCatalogPages(seriesPages),
                        { addon: discoveryAddon, catalog: { id: 'top', name: 'Popular series' }, type: 'series' }
                    );
                    state.trending = weaveCollections(state.movies, state.series);
                    if (!state.movies.length || !state.series.length) {
                        throw new Error('The live catalog returned no titles.');
                    }
                } catch {
                    const [trendingData, moviesData, seriesData] = await Promise.all([
                        api('/api/tmdb/trending/all/week'),
                        api('/api/tmdb/discover/movies'),
                        api('/api/tmdb/discover/tv')
                    ]);
                    state.movies = normalizeCollection(moviesData.results, 'movie');
                    state.series = normalizeCollection(seriesData.results, 'tv');
                    state.trending = normalizeCollection(trendingData.results);
                    catalogLabel = 'Offline fallback catalog';
                }
                state.latestMovies = sortByLatest(state.movies);
                state.topMovies = sortByRating(state.movies);
                state.topSeries = sortByRating(state.series);
                state.airingToday = sortByLatest(state.series);
            }

            renderHome(catalogLabel);
            saveHomeCache();
        } catch (error) {
            elements.catalogMode.textContent = 'Saved catalog · live refresh unavailable';
            if (!state.movies.length && !state.series.length) showToast(error.message || 'Could not load the catalog.', 'error');
        }
    }

    async function loadPagedCatalog(path, pageCount = 2) {
        const pages = await Promise.all(
            Array.from({ length: pageCount }, (_, index) => api(`${path}?page=${index + 1}`))
        );
        return {
            results: pages.flatMap((page) => Array.isArray(page?.results) ? page.results : [])
        };
    }

    function mergeAddonCatalogPages(pages) {
        return {
            metas: pages.flatMap((page) => Array.isArray(page?.metas)
                ? page.metas
                : Array.isArray(page?.results) ? page.results : [])
        };
    }

    function sortByLatest(items) {
        return [...items].sort((left, right) => {
            const leftDate = Date.parse(left.release_date || left.first_air_date || left.releaseInfo || '') || 0;
            const rightDate = Date.parse(right.release_date || right.first_air_date || right.releaseInfo || '') || 0;
            return rightDate - leftDate || Number(right.popularity || 0) - Number(left.popularity || 0);
        });
    }

    function sortByRating(items) {
        return [...items].sort((left, right) =>
            Number(right.vote_average || 0) - Number(left.vote_average || 0) ||
            Number(right.popularity || 0) - Number(left.popularity || 0)
        );
    }

    function buildUniqueHomeRows(reservedItems = [], limit = 20) {
        const seen = new Set(reservedItems.map(homeMediaIdentity).filter(Boolean));
        const takeUnique = (items) => {
            const selected = [];
            for (const item of items) {
                const key = homeMediaIdentity(item);
                if (!key || seen.has(key)) continue;
                seen.add(key);
                selected.push(item);
                if (selected.length === limit) break;
            }
            return selected.length ? selected : uniqueMedia(items).slice(0, limit);
        };

        return {
            trending: takeUnique(state.trending),
            movies: takeUnique(state.movies),
            latestMovies: takeUnique(state.latestMovies),
            topMovies: takeUnique(state.topMovies),
            series: takeUnique(state.series),
            topSeries: takeUnique(state.topSeries),
            airingToday: takeUnique(state.airingToday)
        };
    }

    function homeMediaIdentity(media) {
        const type = mediaType(media);
        const rawId = String(media.imdb_id || media._stremioId || media.id || '').trim().toLowerCase();
        const imdbId = rawId.match(/tt\d+/)?.[0];
        if (imdbId) return `${type}:imdb:${imdbId}`;

        const title = mediaTitle(media)
            .toLocaleLowerCase()
            .normalize('NFKD')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
        const year = mediaYear(media);
        return title ? `${type}:title:${title}:${year}` : `${type}:id:${rawId}`;
    }

    function normalizeLiveCatalog(data, descriptor) {
        const metas = Array.isArray(data?.metas)
            ? data.metas
            : Array.isArray(data?.results)
                ? data.results
                : [];
        return uniqueMedia(
            metas
                .map((meta) => normalizeAddonMeta(meta, descriptor))
                .filter(Boolean)
        );
    }

    function weaveCollections(left, right) {
        const items = [];
        const length = Math.max(left.length, right.length);
        for (let index = 0; index < length; index += 1) {
            if (left[index]) items.push(left[index]);
            if (right[index]) items.push(right[index]);
        }
        return uniqueMedia(items);
    }

    function renderHero(media) {
        if (!media) return;

        const title = mediaTitle(media);
        const year = mediaYear(media);
        const score = formatRating(media.imdb_rating || media.vote_average);
        const backdrop = imageURL(media.backdrop_path, 'original');

        elements.heroTitle.textContent = title;
        elements.heroOverview.textContent = media.overview || 'Open the title to see more information.';
        const provider = (media._sourceAddonId === 'org.cvmturan.discovery' ? 'TShow' : null) ||
            media._catalogName ||
            media._sourceAddonName ||
            'Catalog title';
        elements.heroMeta.replaceChildren(
            makeElement('span', 'match', score ? `${ratingSource(media)} ${score}` : 'Featured'),
            makeElement('span', '', year || 'Catalog pick'),
            makeElement('span', '', mediaType(media) === 'movie' ? 'Movie' : 'Series'),
            makeElement('span', 'rating-pill', provider)
        );

        if (backdrop) {
            elements.heroArt.style.backgroundImage = `url("${backdrop}")`;
            elements.heroArt.classList.add('has-image');
        } else {
            elements.heroArt.style.backgroundImage = '';
            elements.heroArt.classList.remove('has-image');
        }
    }

    function renderLoadingCards(container, count) {
        const cards = Array.from({ length: count }, () => {
            const card = makeElement('div', 'skeleton-card');
            const poster = makeElement('div', 'poster-frame');
            const line = makeElement('div', 'skeleton-line');
            card.append(poster, line);
            return card;
        });
        container.replaceChildren(...cards);
    }

    function renderRail(container, mediaItems) {
        if (!mediaItems.length) {
            const message = makeElement('p', 'section-note', 'Nothing is available in this row yet.');
            container.replaceChildren(message);
            return;
        }

        container.replaceChildren(...mediaItems.slice(0, 20).map((media) => createMediaCard(media)));
    }

    function createMediaCard(media, progress = null) {
        const title = mediaTitle(media);
        const type = mediaType(media);
        const card = makeElement('button', 'media-card');
        card.type = 'button';
        card.setAttribute('aria-label', `Open details for ${title}`);

        const frame = makeElement('span', 'poster-frame');
        const fallback = makeElement('span', 'poster-fallback', title.slice(0, 1).toUpperCase() || 'S');
        frame.append(fallback);

        const sourceLabel = (media._sourceAddonId === 'org.cvmturan.discovery' ? 'TShow' : null) ||
            media._catalogName ||
            media._sourceAddonName;
        if (sourceLabel) {
            frame.append(makeElement('span', 'media-source-badge', sourceLabel));
        }

        const poster = imageURL(media.poster_path, 'w500');
        if (poster) {
            const image = document.createElement('img');
            image.className = 'poster-image';
            image.alt = `${title} poster`;
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('load', () => image.classList.add('is-loaded'));
            image.addEventListener('error', () => image.remove());
            if (/^\/[a-zA-Z0-9_./-]+$/.test(String(media.poster_path || ''))) {
                image.srcset = [
                    `${imageURL(media.poster_path, 'w342')} 342w`,
                    `${poster} 500w`,
                    `${imageURL(media.poster_path, 'w780')} 780w`
                ].join(', ');
                image.sizes = '(max-width: 640px) 145px, 208px';
            }
            image.src = poster;
            frame.append(image);
        }

        const overlay = makeElement('span', 'card-overlay');
        const play = makeElement('span', 'card-play');
        play.append(makeElement('span', 'play-icon'));
        overlay.append(play);
        frame.append(overlay);

        if (progress !== null && Number.isFinite(progress)) {
            const track = makeElement('span', 'progress-track');
            const fill = makeElement('span');
            fill.style.width = `${Math.min(100, Math.max(2, progress))}%`;
            track.append(fill);
            frame.append(track);
        }

        const copy = makeElement('span', 'card-copy');
        const cardTitle = makeElement('span', 'card-title', title);
        const meta = makeElement('span', 'card-meta');
        const ratingValue = formatRating(media.imdb_rating || media.vote_average);
        const rating = makeElement(
            'span',
            'card-rating',
            ratingValue ? `${ratingSource(media)} ${ratingValue}` : 'New'
        );
        meta.append(
            makeElement('span', '', mediaYear(media) || '—'),
            makeElement('span', '', type === 'movie' ? 'Movie' : 'Series'),
            rating
        );
        copy.append(cardTitle, meta);
        card.append(frame, copy);
        card.addEventListener('click', () => openDetails(media));
        return card;
    }

    async function openDetails(media, { fullPage = Boolean(state.titlePageActive) } = {}) {
        const requestId = state.detailsRequest = (state.detailsRequest || 0) + 1;
        const detailTarget = fullPage ? elements.titleDetailContent : elements.detailsContent;
        const loading = makeElement('div', 'details-status');
        const loadingTitle = makeElement('h2', '', 'Loading title…');
        loadingTitle.id = 'details-title';
        loading.append(loadingTitle, makeElement('p', '', 'Getting the story, episodes and watch options.'));
        loading.setAttribute('role', 'status');
        detailTarget.replaceChildren(loading);
        if (fullPage) {
            elements.titleDetailView.hidden = false;
            window.scrollTo({ top: 0, behavior: 'instant' });
        } else {
            openDialog(elements.detailsDialog);
            elements.detailsDialog.scrollTop = 0;
        }
        let activeMedia, activeDetails;
        const type = mediaType(media);

        try {
            if (media._addonCatalog) {
                const resolved = await resolveAddonDetails(media);
                if (requestId !== state.detailsRequest) return;
                activeMedia = resolved.media;
                activeDetails = resolved.details;
            } else {
                const endpoint = type === 'movie' ? 'movie' : 'tv';
                const details = await api(`/api/tmdb/${endpoint}/${encodeURIComponent(media.id)}`);
                if (requestId !== state.detailsRequest) return;
                activeMedia = normalizeMedia({ ...media, ...details }, type);
                activeDetails = details;
            }

            const imdbId = activeDetails?.external_ids?.imdb_id || activeDetails?.imdb_id || activeMedia?.imdb_id;
            if (/^tt\d{5,12}$/i.test(String(imdbId || ''))) {
                activeMedia.imdb_id = imdbId;
            }
            if (state.tmdbConfigured && activeMedia._addonCatalog && /^tt\d+$/.test(imdbId || activeMedia._stremioId || '')) {
                try {
                    const externalId = imdbId || activeMedia._stremioId;
                    const resolved = await api(`/api/tmdb/resolve/${externalId}?type=${type}`);
                    if (resolved.id) {
                        activeMedia._tmdbId = resolved.id;
                        const enriched = await api(`/api/tmdb/${type}/${resolved.id}`);
                        activeDetails = { ...enriched, ...activeDetails, credits: enriched.credits, recommendations: enriched.recommendations };
                    }
                } catch { /* The original add-on details remain usable. */ }
            }
            if (imdbId && !activeMedia.imdb_rating) {
                try {
                    const addonType = type === 'movie' ? 'movie' : 'series';
                    const ratingData = await api(`/api/addons/meta/org.streamflix.cinemeta/${addonType}/${encodeURIComponent(imdbId)}`);
                    const imdbRating = Number.parseFloat(ratingData?.meta?.imdbRating);
                    if (Number.isFinite(imdbRating) && imdbRating > 0) activeMedia.imdb_rating = imdbRating;
                } catch {
                    // The catalog rating remains available when the metadata add-on is offline.
                }
            }

            const tmdbId = activeMedia?._tmdbId || activeDetails?.id;
            if (/^\d+$/.test(String(tmdbId || ''))) {
                try {
                    activeDetails.watchProviders = await api(
                        `/api/tmdb/watch-providers/${type}/${encodeURIComponent(tmdbId)}?country=${encodeURIComponent(state.region)}`
                    );
                } catch {
                    activeDetails.watchProviders = null;
                }
            }

            if (requestId !== state.detailsRequest) return;
            state.activeMedia = activeMedia;
            state.activeDetails = activeDetails;
            renderDetails(activeMedia, activeDetails, detailTarget, fullPage);
            if (fullPage) document.title = `${mediaTitle(activeMedia)} · TShow`;
            rememberRecentlyViewed(activeMedia);
            if (!fullPage) openDialog(elements.detailsDialog);
        } catch (error) {
            if (requestId !== state.detailsRequest) return;
            loadingTitle.textContent = 'This title could not load';
            loading.querySelector('p').textContent = error.message || 'The metadata provider is unavailable. Please try again.';
            const retry = makeElement('button', 'button button-primary', 'Try again');
            retry.addEventListener('click', () => openDetails(media));
            loading.append(retry);
        }
    }

    async function resolveAddonDetails(media) {
        const stremioType = media._stremioType || (mediaType(media) === 'movie' ? 'movie' : 'series');
        const stremioId = String(media._stremioId || media.imdb_id || media.id);
        const sourceAddon = state.addons.find((addon) => addon.id === media._sourceAddonId);
        const descriptor = {
            addon: sourceAddon || {
                id: media._sourceAddonId,
                name: media._sourceAddonName || 'Installed add-on'
            },
            catalog: {
                id: media._catalogId || '',
                name: media._catalogName || ''
            },
            type: stremioType
        };
        const inlineMeta = {
            id: stremioId,
            type: stremioType,
            name: mediaTitle(media),
            poster: media.poster_path,
            background: media.backdrop_path,
            description: media.overview,
            releaseInfo: mediaYear(media),
            imdbRating: media.vote_average,
            genres: media._genres || [],
            runtime: media._runtime || null,
            trailerStreams: media._trailers || [],
            videos: media._stremioVideos || [],
            behaviorHints: media._behaviorHints || {},
            moviedb_id: media._tmdbId || null
        };

        const candidates = [];
        if (
            Array.isArray(sourceAddon?.resources) &&
            sourceAddon.resources.includes('meta') &&
            (sourceAddon.manifestURL || sourceAddon.id === 'org.cvmturan.tvmaze')
        ) {
            candidates.push(sourceAddon.id);
        }
        if (/^tt\d+$/i.test(stremioId)) {
            candidates.push('org.streamflix.cinemeta');
        }

        let remoteMeta = null;
        for (const addonId of [...new Set(candidates)]) {
            try {
                const data = await api(
                    `/api/addons/meta/${encodeURIComponent(addonId)}/${encodeURIComponent(stremioType)}/${encodeURIComponent(stremioId)}`
                );
                if (data?.meta && typeof data.meta === 'object') {
                    remoteMeta = data.meta;
                    break;
                }
            } catch {
                // Rich inline catalog data remains usable when a metadata service is unavailable.
            }
        }

        const combined = { ...inlineMeta, ...(remoteMeta || {}), id: stremioId, type: stremioType };
        const normalized = normalizeAddonMeta(combined, descriptor);
        const videos = Array.isArray(combined.videos) ? combined.videos : [];
        const seasons = summarizeAddonSeasons(videos);
        const details = {
            ...combined,
            imdb_id: combined.imdb_id || (/^tt\d+$/i.test(stremioId) ? stremioId : null),
            runtime: parseRuntimeMinutes(combined.runtime),
            genres: normalizeGenres(combined.genres || combined.genre),
            videos,
            trailerStreams: Array.isArray(combined.trailerStreams)
                ? combined.trailerStreams
                : Array.isArray(combined.trailers)
                    ? combined.trailers
                    : [],
            behaviorHints: combined.behaviorHints || {},
            seasons,
            number_of_seasons: seasons.length
        };

        return {
            media: normalizeMedia({ ...media, ...normalized, id: stremioId }, mediaType(media)),
            details
        };
    }

    function summarizeAddonSeasons(videos) {
        const counts = new Map();
        for (const video of videos) {
            const season = Number(video?.season);
            if (!Number.isInteger(season) || season < 0) continue;
            counts.set(season, (counts.get(season) || 0) + 1);
        }
        return [...counts.entries()]
            .sort(([left], [right]) => left - right)
            .map(([season, count]) => ({
                season_number: season,
                name: season === 0 ? 'Specials' : `Season ${season}`,
                episode_count: count
            }));
    }

    function renderDetails(media, details, detailTarget = elements.detailsContent, fullPage = false) {
        const title = mediaTitle(media);
        const type = mediaType(media);
        const year = mediaYear(media);
        const score = formatRating(media.imdb_rating || media.vote_average);
        const backdropURL = imageURL(media.backdrop_path, 'original');
        const posterURL = imageURL(media.poster_path, 'w500');

        const backdrop = makeElement('div', 'details-backdrop');
        if (backdropURL) backdrop.style.backgroundImage = `url("${backdropURL}")`;

        const layout = makeElement('div', 'details-layout');
        const poster = makeElement('div', 'details-poster');
        if (posterURL) {
            const image = document.createElement('img');
            image.alt = `${title} poster`;
            image.addEventListener('error', () => image.remove());
            image.src = posterURL;
            poster.append(image);
        } else {
            poster.append(makeElement('span', 'poster-fallback', title.slice(0, 1).toUpperCase()));
        }

        const main = makeElement('div', 'details-main');
        const eyebrow = media._sourceAddonName
            ? `${type === 'movie' ? 'Feature film' : 'Series'} · ${media._sourceAddonName}`
            : type === 'movie' ? 'Feature film' : 'Series';
        main.append(makeElement('p', 'modal-eyebrow', eyebrow));

        const heading = makeElement('h2', '', title);
        heading.id = 'details-title';
        main.append(heading);

        const meta = makeElement('div', 'details-meta');
        if (score) meta.append(makeElement('span', 'score', `${ratingSource(media)} ${score}`));
        if (year) meta.append(makeElement('span', '', year));
        if (type === 'movie' && details.runtime) {
            meta.append(makeElement('span', '', `${details.runtime} min`));
        }
        if (type === 'tv' && details.number_of_seasons) {
            meta.append(makeElement('span', '', pluralize(details.number_of_seasons, 'season')));
        }
        if (media.original_language) {
            meta.append(makeElement('span', '', String(media.original_language).toUpperCase()));
        }
        main.append(meta);

        const genres = normalizeGenres(details.genres).slice(0, 5);
        if (genres.length) {
            const genreList = makeElement('div', 'genre-list');
            genres.forEach((genre) => genreList.append(makeElement('span', '', genre.name)));
            main.append(genreList);
        }

        main.append(makeElement(
            'p',
            'details-overview',
            media.overview || 'No overview is available for this title.'
        ));

        const defaultVideoId = String(
            details.behaviorHints?.defaultVideoId ||
            details.imdb_id ||
            media._stremioId ||
            media.id ||
            ''
        );
        state.activeVideoId = defaultVideoId || null;

        if (type === 'tv') {
            const episodePicker = createEpisodePicker(details) || createCountedEpisodePicker(media, details);
            if (episodePicker) {
                main.append(episodePicker);
            } else {
                state.activeVideoId = null;
                main.append(makeElement(
                    'p',
                    'season-summary',
                    'Episode metadata is unavailable for this series. Try another catalog result with an IMDb ID.'
                ));
            }
        }

        const actions = makeElement('div', 'details-actions');
        const playButton = makeElement('button', 'button button-primary');
        playButton.type = 'button';
        playButton.append(makeElement('span', 'play-icon'), document.createTextNode('Watch options'));
        playButton.disabled = type === 'tv' && !state.activeVideoId;
        playButton.addEventListener('click', () => playMedia(media, details, type === 'tv' ? main.querySelector('[data-episode-picker]')?.value : null));

        const trailerButton = makeElement('button', 'button button-secondary', 'Watch trailer');
        trailerButton.type = 'button';
        trailerButton.addEventListener('click', () => openTrailer(media, details));

        const listButton = makeElement(
            'button',
            'button button-quiet',
            isInWatchlist(media) ? '✓ In my list' : '＋ My list'
        );
        listButton.type = 'button';
        listButton.addEventListener('click', () => {
            const added = toggleWatchlist(media);
            listButton.textContent = added ? '✓ In my list' : '＋ My list';
        });

        const shareButton = makeElement('button', 'button button-quiet', 'Share');
        shareButton.type = 'button';
        shareButton.addEventListener('click', () => shareMedia(media));

        actions.append(playButton, trailerButton, listButton, shareButton);
        const titleURL = publicTitleURL(media);
        if (titleURL && !fullPage) {
            const fullPageLink = makeElement('a', 'button button-quiet', 'Full page');
            fullPageLink.href = `${titleURL}?country=${encodeURIComponent(state.region)}`;
            fullPageLink.addEventListener('click', () => sessionStorage.setItem('tshow:return-scroll', String(window.scrollY)));
            actions.append(fullPageLink);
        }
        main.append(actions);
        main.append(makeElement(
            'p',
            'details-footnote',
            'The built-in Play source is a clearly labeled public demo. Installed legal add-ons may offer other direct web streams.'
        ));

        if (type === 'tv' && Array.isArray(details.seasons) && details.seasons.length) {
            const seasonText = details.seasons
                .filter((season) => Number(season.season_number) > 0)
                .slice(0, 6)
                .map((season) => `${season.name || `Season ${season.season_number}`} · ${pluralize(season.episode_count || 0, 'episode')}`)
                .join('  ·  ');
            if (seasonText) {
                main.append(makeElement('p', 'season-summary', seasonText));
            }
        }

        layout.append(poster, main);
        const extras = makeElement('div', 'details-extras');
        const providerSection = createWatchProviderSection(details.watchProviders);
        if (providerSection) extras.append(providerSection);
        const castSection = createCastSection(details.credits?.cast);
        if (castSection) extras.append(castSection);
        const recommendationItems = normalizeCollection([
            ...(details.recommendations?.results || []),
            ...(details.similar?.results || [])
        ], type).filter((item) => mediaKey(item) !== mediaKey(media)).slice(0, 14);
        if (recommendationItems.length) {
            const section = makeElement('section', 'detail-rail-section');
            section.append(makeElement('h3', '', 'More like this'));
            const rail = makeElement('div', 'media-rail compact-rail');
            rail.append(...recommendationItems.map((item) => createMediaCard(item)));
            section.append(rail);
            extras.append(section);
        }
        detailTarget.replaceChildren(backdrop, layout, extras);
    }

    function createWatchProviderSection(data) {
        if (!data?.available || !data.providers) return null;
        const groups = [
            ['stream', 'Stream'], ['free', 'Free'], ['ads', 'With ads'], ['rent', 'Rent'], ['buy', 'Buy']
        ].map(([key, label]) => [label, data.providers[key] || []]).filter(([, items]) => items.length);
        if (!groups.length) return null;

        const section = makeElement('section', 'watch-providers');
        const heading = makeElement('div', 'detail-section-heading');
        const headingCopy = makeElement('div');
        headingCopy.append(makeElement('p', 'section-kicker', `Availability · ${data.country}`), makeElement('h3', '', 'Where to watch'));
        const attribution = makeElement('a', 'provider-attribution', 'Powered by JustWatch');
        attribution.href = data.link || 'https://www.justwatch.com/';
        attribution.target = '_blank';
        attribution.rel = 'noopener noreferrer';
        heading.append(headingCopy, attribution);
        section.append(heading);
        const availabilityLink = makeElement('a', 'button button-secondary', 'Compare current offers ↗');
        availabilityLink.href = data.link || 'https://www.justwatch.com/';
        availabilityLink.target = '_blank';
        availabilityLink.rel = 'noopener noreferrer';
        section.append(availabilityLink);

        groups.forEach(([label, items]) => {
            const row = makeElement('div', 'provider-row');
            row.append(makeElement('strong', '', label));
            const list = makeElement('div', 'provider-list');
            items.forEach((provider) => {
                const providerLink = makeElement('div', 'provider-tile');
                providerLink.title = `${provider.name} · ${label}`;
                if (provider.logo_path) {
                    const image = document.createElement('img');
                    image.src = imageURL(provider.logo_path, 'original');
                    image.alt = '';
                    image.loading = 'lazy';
                    providerLink.append(image);
                }
                providerLink.append(makeElement('span', '', provider.name));
                list.append(providerLink);
            });
            row.append(list);
            section.append(row);
        });
        return section;
    }

    function createCastSection(cast) {
        const people = Array.isArray(cast) ? cast.filter((person) => person?.name).slice(0, 12) : [];
        if (!people.length) return null;
        const section = makeElement('section', 'cast-section');
        section.append(makeElement('h3', '', 'Cast'));
        const list = makeElement('div', 'cast-list');
        people.forEach((person) => {
            const card = makeElement('article', 'cast-card');
            const avatar = makeElement('div', 'cast-avatar', String(person.name).slice(0, 1));
            if (person.profile_path) {
                const image = document.createElement('img');
                image.src = imageURL(person.profile_path, 'w185');
                image.alt = '';
                image.loading = 'lazy';
                avatar.replaceChildren(image);
            }
            card.append(avatar, makeElement('strong', '', person.name), makeElement('span', '', person.character || 'Cast'));
            list.append(card);
        });
        section.append(list);
        return section;
    }

    function createEpisodePicker(details) {
        const videos = Array.isArray(details?.videos)
            ? details.videos
                .filter((video) =>
                    video &&
                    typeof video.id === 'string' &&
                    Number.isInteger(Number(video.season)) &&
                    Number.isInteger(Number(video.episode))
                )
                .map((video) => ({
                    ...video,
                    season: Number(video.season),
                    episode: Number(video.episode)
                }))
                .sort((left, right) =>
                    left.season - right.season ||
                    left.episode - right.episode
                )
            : [];
        if (!videos.length) return null;

        const picker = makeElement('div', 'episode-picker');
        picker.append(makeElement('p', 'episode-picker-title', 'Choose an episode'));
        const grid = makeElement('div', 'episode-picker-grid');
        const seasonLabel = makeElement('label', '', 'Season');
        const episodeLabel = makeElement('label', '', 'Episode');
        const seasonSelect = document.createElement('select');
        const episodeSelect = document.createElement('select');
        episodeSelect.dataset.episodePicker = 'true';
        const seasons = [...new Set(videos.map((video) => video.season))];

        seasons.forEach((season) => {
            const option = document.createElement('option');
            option.value = String(season);
            option.textContent = season === 0 ? 'Specials' : `Season ${season}`;
            seasonSelect.append(option);
        });

        const defaultId = String(details.behaviorHints?.defaultVideoId || '');
        const defaultVideo = videos.find((video) => video.id === defaultId) ||
            videos.find((video) => video.season > 0) ||
            videos[0];
        seasonSelect.value = String(defaultVideo.season);

        function renderEpisodes(preferredId = '') {
            const season = Number(seasonSelect.value);
            const episodes = videos.filter((video) => video.season === season);
            episodeSelect.replaceChildren(...episodes.map((video) => {
                const option = document.createElement('option');
                option.value = video.id;
                const label = video.title || video.name || `Episode ${video.episode}`;
                option.textContent = `E${String(video.episode).padStart(2, '0')} · ${label}`;
                return option;
            }));
            if (preferredId && episodes.some((video) => video.id === preferredId)) {
                episodeSelect.value = preferredId;
            }
            state.activeVideoId = episodeSelect.value || null;
        }

        renderEpisodes(defaultVideo.id);
        seasonSelect.addEventListener('change', () => renderEpisodes());
        episodeSelect.addEventListener('change', () => {
            state.activeVideoId = episodeSelect.value || null;
        });

        seasonLabel.append(seasonSelect);
        episodeLabel.append(episodeSelect);
        grid.append(seasonLabel, episodeLabel);
        picker.append(
            grid,
            makeElement('p', 'episode-picker-note', 'The selected episode ID is sent to compatible installed add-ons.')
        );
        return picker;
    }

    function createCountedEpisodePicker(media, details) {
        const imdbId = String(
            details?.external_ids?.imdb_id || details?.imdb_id || media?.imdb_id || media?._stremioId || ''
        );
        if (!/^tt\d{5,12}$/i.test(imdbId)) return null;
        const seasons = (Array.isArray(details?.seasons) ? details.seasons : [])
            .map((season) => ({
                number: Number(season?.season_number),
                count: Math.min(200, Number(season?.episode_count) || 0),
                name: String(season?.name || '')
            }))
            .filter((season) => Number.isInteger(season.number) && season.number >= 0 && season.count > 0)
            .sort((left, right) => left.number - right.number);
        if (!seasons.length) return null;

        const picker = makeElement('div', 'episode-picker');
        picker.append(makeElement('p', 'episode-picker-title', 'Choose an episode'));
        const grid = makeElement('div', 'episode-picker-grid');
        const seasonLabel = makeElement('label', '', 'Season');
        const episodeLabel = makeElement('label', '', 'Episode');
        const seasonSelect = document.createElement('select');
        const episodeSelect = document.createElement('select');
        episodeSelect.dataset.episodePicker = 'true';
        for (const season of seasons) {
            seasonSelect.append(makeOption(
                String(season.number),
                season.number === 0 ? 'Specials' : season.name || `Season ${season.number}`
            ));
        }
        const firstRegular = seasons.find((season) => season.number > 0) || seasons[0];
        seasonSelect.value = String(firstRegular.number);

        function renderEpisodes(preferred = 1) {
            const season = seasons.find((item) => item.number === Number(seasonSelect.value));
            if (!season) return;
            episodeSelect.replaceChildren(...Array.from({ length: season.count }, (_, index) => {
                const episode = index + 1;
                return makeOption(`${imdbId}:${season.number}:${episode}`, `Episode ${episode}`);
            }));
            episodeSelect.selectedIndex = Math.max(0, Math.min(season.count - 1, preferred - 1));
            state.activeVideoId = episodeSelect.value || null;
        }
        renderEpisodes();
        seasonSelect.addEventListener('change', () => renderEpisodes());
        episodeSelect.addEventListener('change', () => { state.activeVideoId = episodeSelect.value || null; });
        seasonLabel.append(seasonSelect);
        episodeLabel.append(episodeSelect);
        grid.append(seasonLabel, episodeLabel);
        picker.append(
            grid,
            makeElement('p', 'episode-picker-note', 'TShow sends the selected season and episode to compatible add-ons.')
        );
        return picker;
    }

    function openTrailer(media, details) {
        state.playerRequest += 1;
        const videos = details?.videos?.results;
        const tmdbTrailer = Array.isArray(videos)
            ? videos.find((video) =>
                String(video.site).toLowerCase() === 'youtube' &&
                String(video.type).toLowerCase() === 'trailer' &&
                /^[a-zA-Z0-9_-]{6,20}$/.test(video.key)
            )
            : null;
        const addonTrailers = [
            ...(Array.isArray(details?.trailerStreams) ? details.trailerStreams : []),
            ...(Array.isArray(details?.trailers) ? details.trailers : []),
            ...(Array.isArray(media?._trailers) ? media._trailers : [])
        ];
        const addonTrailer = addonTrailers
            .map((trailer) => trailer?.ytId || trailer?.source || trailer?.key)
            .find((value) => /^[a-zA-Z0-9_-]{6,20}$/.test(String(value || '')));
        const trailerId = tmdbTrailer?.key || addonTrailer;

        if (!trailerId) {
            showToast('No official trailer was returned by this title’s metadata provider.', 'warning');
            return;
        }

        clearVideoElement();
        state.trailerMode = true;
        state.playerMedia = null;
        state.streams = [];
        state.activeExternalURL = null;
        state.activeExternalAppURL = null;
        state.activeAttemptIndex = null;
        updateExternalPlayerActions(null);
        elements.playerDialog.classList.add('is-trailer');
        elements.playerTitle.textContent = `${mediaTitle(media)} · Official trailer`;
        elements.videoPlayer.hidden = true;
        elements.videoLoading.hidden = true;
        elements.externalSource.hidden = true;
        elements.trailerFrame.hidden = false;
        elements.trailerFrame.src =
            `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerId)}?autoplay=1&playsinline=1&rel=0`;
        elements.streamSelect.replaceChildren();
        elements.playerSourceTitle.textContent = 'Official trailer';
        elements.playerSourceNote.textContent =
            'Trailer metadata came from the title API and is playing inside TShow.';
        openDialog(elements.playerDialog);
    }

    async function playMedia(media, details = null, requestedVideoId = null) {
        savePlaybackProgress(true);
        clearVideoElement();
        state.pendingResume = null;
        state.recoveryTried = new Set();
        const requestId = ++state.playerRequest;
        const selectedVideoId = mediaType(media) === 'movie' ? null : (requestedVideoId || null);
        state.playerRequestKey = `pending:${requestId}`;
        resetTrailerFrame();
        state.playerMedia = serializeMedia(media);
        state.playerVideoId = selectedVideoId;
        state.playerDetails = null;
        document.getElementById("next-episode-button").hidden = true;
        elements.playerTitle.textContent = mediaTitle(media);
        elements.videoPlayer.poster = imageURL(media.backdrop_path, 'w1280') || '';
        elements.videoLoading.hidden = false;
        elements.videoPlayer.hidden = true;
        elements.externalSource.hidden = true;
        elements.tryDirectSource.hidden = true;
        state.activeExternalURL = null;
        state.activeExternalAppURL = null;
        state.activeAttemptIndex = null;
        updateExternalPlayerActions(null);
        state.activeStreamIndex = null;
        state.visibleStreamIndexes = [];
        stopSourceAutomation();
        state.autoTried = new Set();
        state.checksPaused = false;
        document.getElementById('check-sources-button').textContent = 'Pause link checks';
        state.sourceFilter = 'all';
        state.streams = [];
        state.subtitleLibrary = [];
        renderSourcePicker();
        renderSubtitlePicker();
        elements.sourceSummary.textContent = 'Finding sources…';
        elements.sourceCompatibilityHelp.textContent = 'Choose a source to see what the browser can do with it.';
        elements.speedSelect.disabled = true;
        elements.playerSourceTitle.textContent = 'Looking for sources';
        elements.playerSourceNote.textContent = 'Searching installed add-ons…';
        openDialog(elements.playerDialog);

        try {
            let resolvedDetails = details;
            if (!resolvedDetails) {
                if (media._addonCatalog) {
                    const resolved = await resolveAddonDetails(media);
                    if (requestId !== state.playerRequest) return;
                    resolvedDetails = resolved.details;
                } else {
                    const endpoint = mediaType(media) === 'movie' ? 'movie' : 'tv';
                    resolvedDetails = await api(`/api/tmdb/${endpoint}/${encodeURIComponent(media.id)}`);
                    if (requestId !== state.playerRequest) return;
                }
            }

            state.playerDetails = resolvedDetails;
            updateNextEpisode();
            const streamType = mediaType(media) === 'movie' ? 'movie' : 'series';
            const streamId = selectedVideoId ||
                (streamType === 'movie' ? null : resolvedDetails.behaviorHints?.defaultVideoId) ||
                resolvedDetails.external_ids?.imdb_id ||
                resolvedDetails.imdb_id ||
                media._stremioId ||
                media.id;
            if (streamType === 'series' && !selectedVideoId) {
                throw new Error('Choose a series episode before opening the player.');
            }
            const requestKey = `${streamType}:${streamId}:${requestId}`;
            state.playerRequestKey = requestKey;
            const result = await api(`/api/streams/${streamType}/${encodeURIComponent(streamId)}`);
            if (requestId !== state.playerRequest) return;
            const candidateStreams = Array.isArray(result.streams)
                ? result.streams.filter((stream) =>
                    stream &&
                    (stream.url || stream.attemptUrl || stream.externalUrl || stream.externalPlayerUrl || stream.externalAppUrl || stream.unsupportedReason)
                )
                : [];
            const conflictingMedia = [state.activeMedia, ...state.recentlyViewed]
                .filter((item) => item && mediaKey(item) !== mediaKey(media));
            const verifiedStreams = candidateStreams.filter((stream) =>
                streamMatchesSelectedTitle(stream, media, conflictingMedia)
            );
            const rejectedMismatches = candidateStreams.length - verifiedStreams.length;
            state.streams = verifiedStreams.map((stream) => ({
                ...stream,
                _requestKey: requestKey,
                _displayTitle: mediaTitle(media)
            }));
            if (rejectedMismatches > 0) {
                showToast(`${pluralize(rejectedMismatches, 'source')} labeled for another title ${rejectedMismatches === 1 ? 'was' : 'were'} removed.`, 'warning');
            }

            if (!state.streams.length) {
                const sourceErrors = Array.isArray(result.sources)
                    ? result.sources.filter((source) => source.error).map((source) => source.addonName).join(', ')
                    : '';
                throw new Error(sourceErrors
                    ? `No source was returned. These providers could not be reached: ${sourceErrors}.`
                    : 'No source was returned by the compatible installed add-ons.');
            }

            renderSourcePicker();

            loadSubtitleLibrary(streamType, streamId, requestId);

            const recommendedIndex = recommendedStreamIndex();
            if (recommendedIndex >= 0) {
                applyStream(recommendedIndex);
            } else {
                showSourceOverview(media);
            }
        } catch (error) {
            if (requestId !== state.playerRequest) return;
            elements.videoLoading.hidden = true;
            elements.playerSourceTitle.textContent = 'Sources could not be loaded';
            elements.playerSourceNote.textContent = error.message;
            showToast(error.message, 'error');
        }
    }

    function browserAttemptURL(stream) {
        return [stream?.url, stream?.attemptUrl, stream?.externalPlayerUrl].find(isSafeWebURL) || null;
    }

    function streamCompatibilityGroup(stream) {
        if (stream.isDemo) return 'demo';
        if (browserAttemptURL(stream)) return 'playable';
        if (isSafeExternalAppURL(stream.externalAppUrl)) return 'app-only';
        if (stream.externalUrl || stream.externalPlayerUrl) return 'external';
        return 'app-only';
    }

    function comparableSourceText(value) {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function mediaIdentityTerms(media) {
        if (!media) return [];
        const title = comparableSourceText(mediaTitle(media));
        const ids = [media.imdb_id, media._stremioId, media.id]
            .map((value) => comparableSourceText(value))
            .filter((value) => /^tt\d{5,12}$/.test(value));
        return [...new Set([title.length >= 4 ? title : '', ...ids].filter(Boolean))];
    }

    function streamMatchesSelectedTitle(stream, selectedMedia, conflictingMedia) {
        if (stream?.isDemo) return true;
        const text = comparableSourceText([
            stream?.name,
            stream?.title,
            stream?.description,
            stream?.behaviorHints?.filename,
            stream?.externalPlayerUrl,
            stream?.externalUrl
        ].filter(Boolean).join(' '));
        if (!text) return true;
        const hasTerm = (term) => (` ${text} `).includes(` ${term} `);
        const expected = mediaIdentityTerms(selectedMedia);
        const confirmsSelected = expected.some(hasTerm);
        const contradictsSelected = conflictingMedia.some((item) =>
            mediaIdentityTerms(item).some(hasTerm)
        );
        return !contradictsSelected || confirmsSelected;
    }

    function isLikelyMobileDevice() {
        return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
            (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    }

    function recommendedStreamIndex() {
        const candidates = state.streams.map((stream, index) => ({stream, index}))
            .filter(({stream}) => !stream.isDemo && browserAttemptURL(stream));
        const rank = stream => {
            if (stream._browserChecked) return 0;
            const label = [stream.title,stream.description,stream.behaviorHints?.filename].join(' ');
            if (/h[. ]?265|hevc|truehd|dts/i.test(label)) return 4;
            if (/^(mp4|webm|hls)$/.test(stream.format || '')) return 1;
            return /h[. ]?264|avc/i.test(label) ? 2 : 3;
        };
        candidates.sort((a,b) => rank(a.stream)-rank(b.stream) ||
            (Number(a.stream.sizeBytes)||Number.MAX_SAFE_INTEGER)-(Number(b.stream.sizeBytes)||Number.MAX_SAFE_INTEGER));
        return candidates[0]?.index ?? -1;
    }

    function sourceCounts() {
        const counts = {
            all: state.streams.length,
            playable: 0,
            external: 0,
            'app-only': 0,
            demo: 0
        };
        for (const stream of state.streams) {
            counts[streamCompatibilityGroup(stream)] += 1;
        }
        return counts;
    }

    function renderSourcePicker() {
        const counts = sourceCounts();
        const buttons = elements.sourceFilterGroup.querySelectorAll('[data-source-filter]');
        buttons.forEach((button) => {
            const filter = button.dataset.sourceFilter || 'all';
            const count = counts[filter] || 0;
            button.setAttribute('aria-pressed', String(state.sourceFilter === filter));
            button.querySelector('span').textContent = String(count);
            button.disabled = filter !== 'all' && count === 0;
        });

        state.visibleStreamIndexes = state.streams
            .map((_stream, index) => index)
            .filter((index) => state.sourceFilter === 'all' ||
                streamCompatibilityGroup(state.streams[index]) === state.sourceFilter
            ).filter(index => matchesSource(state.streams[index], state.extraSourceFilters));

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.textContent = state.visibleStreamIndexes.length
            ? `Choose a source (${state.visibleStreamIndexes.length} shown)`
            : 'No sources in this filter';

        const groups = [
            ['playable', window.tshowDesktop?.embeddedPlayback ? 'Play in app' : 'Try in browser'],
            ['external', 'External apps and provider links'],
            ['app-only', 'App-only or download sources'],
            ['demo', 'Player test — not the selected title']
        ];
        const options = [placeholder];
        const mirrorTotals = new Map();
        const mirrorSeen = new Map();

        for (const index of state.visibleStreamIndexes) {
            const stream = state.streams[index];
            const key = `${streamCompatibilityGroup(stream)}|${stream.sourceAddonName || ''}|${stream.name || ''}`;
            mirrorTotals.set(key, (mirrorTotals.get(key) || 0) + 1);
        }

        for (const [groupName, groupLabel] of groups) {
            const indexes = state.visibleStreamIndexes.filter((index) =>
                streamCompatibilityGroup(state.streams[index]) === groupName
            );
            if (!indexes.length) continue;
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${groupLabel} (${indexes.length})`;
            for (const index of indexes) {
                const stream = state.streams[index];
                const key = `${groupName}|${stream.sourceAddonName || ''}|${stream.name || ''}`;
                const mirrorNumber = (mirrorSeen.get(key) || 0) + 1;
                mirrorSeen.set(key, mirrorNumber);
                const option = document.createElement('option');
                option.value = String(index);
                option.textContent = streamOptionLabel(
                    stream,
                    index,
                    mirrorNumber,
                    mirrorTotals.get(key) || 1
                );
                option.selected = state.activeStreamIndex === index;
                optgroup.append(option);
            }
            options.push(optgroup);
        }

        if (!state.visibleStreamIndexes.includes(state.activeStreamIndex)) {
            placeholder.selected = true;
        }
        elements.streamSelect.replaceChildren(...options);
        elements.streamSelect.disabled = state.visibleStreamIndexes.length === 0;

        elements.sourceSummary.textContent =
            `${counts.all} entries for ${mediaTitle(state.playerMedia)}: ${counts.playable} browser links, ` +
            `${counts.external} provider links, ${counts['app-only']} app-only, ${counts.demo} player test.`;
        elements.sourceCompatibilityHelp.textContent = sourceFilterHelp(state.sourceFilter);
    }

    function sourceFilterHelp(filter) {
        if (filter === 'playable') return 'Every direct video link can be tried here. Your browser tests playback when you select it; compatibility is not guaranteed.';
        if (filter === 'external') return 'These entries provide a website or app link rather than a direct video URL.';
        if (filter === 'app-only') return 'These are downloads, redirects, torrents, or unknown formats intended for another app.';
        if (filter === 'demo') return 'The short CC0 flower video only tests the player. It is not the movie or episode you selected.';
        return 'Quality and language use provider labels. Size limits exclude entries without a known size. Link checks are optional; every direct link can be tried.';
    }

    function streamOptionLabel(stream, index, mirrorNumber = 1, mirrorTotal = 1) {
        const selectedTitle = String(stream._displayTitle || mediaTitle(state.playerMedia) || 'Selected title').slice(0,55);
        const size = stream.sizeLabel || 'size unknown';
        if (stream.isDemo) {
            return `${selectedTitle} · ${stream.title || stream.name || 'Public sample'} · ${size} · player test only`;
        }

        const rawName = String(stream.name || stream.title || `Source ${index + 1}`).replace(/\s+/g, ' ');
        const name = rawName.length > 80 ? rawName.slice(0,77) + '…' : rawName;
        const badges = [size];
        if (stream.playbackMode === 'proxy' && stream.transcodeLowUrl) {
            badges.push('proxied link');
        } else if (stream.browserReady) {
            badges.push(stream.format ? stream.format.toUpperCase() : 'browser attempt');
        }
        if (browserAttemptURL(stream) && !stream.browserReady) badges.push('browser attempt');
        if (stream.externalAppUrl && !stream.browserReady) badges.push('source app');
        if (stream.externalUrl && !stream.browserReady) badges.push('provider link');
        if (!stream.browserReady && !stream.externalUrl && !stream.externalPlayerUrl && !stream.externalAppUrl && !stream.attemptUrl) {
            badges.push(stream.format ? `${stream.format.toUpperCase()} · app-only` : 'app-only · format unknown');
        }
        if (mirrorTotal > 1) badges.push(`mirror ${mirrorNumber}`);
        return `${selectedTitle} · ${name} · ${badges.join(' · ')}`;
    }

    function showSourceOverview(media) {
        const counts = sourceCounts();
        clearVideoElement();
        elements.videoLoading.hidden = true;
        elements.videoPlayer.hidden = true;
        elements.externalSource.hidden = false;
        elements.openExternalSource.hidden = true;
        elements.tryDirectSource.hidden = true;
        elements.speedSelect.disabled = true;
        elements.externalSourceTitle.textContent = `Choose a source for ${mediaTitle(media)}`;
        elements.externalSourceNote.textContent = 'Direct video links try this browser first. Website and app links are listed separately.';
        elements.playerSourceTitle.textContent = 'Choose a source';
        elements.playerSourceNote.textContent =
            'Select a direct link to play in this browser. Link checking is optional and stops before playback.';
    }

    function applyStream(index, { forceAttempt = false } = {}) {
        let stream = state.streams[index];
        if (!stream || stream._requestKey !== state.playerRequestKey) return;
        savePlaybackProgress(true);
        stopSourceAutomation();
        state.activeStreamIndex = index;
        state.autoTried ||= new Set();
        state.autoTried.add(index);
        const attemptURL = browserAttemptURL(stream);
        if ((forceAttempt || !stream.browserReady) && attemptURL) {
            stream = {
                ...stream,
                url: attemptURL,
                browserReady: true,
                playbackMode: stream.format === 'hls' ? 'hls' : 'direct',
                directFromProvider: true,
                unsupportedReason: null
            };
        }

        elements.streamSelect.value = String(index);
        document.getElementById("recover-source-button").hidden = true;
        document.getElementById('resume-playback-button').hidden = true;
        clearVideoElement();
        state.transcodeTried = false;
        state.activeHlsURL = null;
        elements.videoLoading.hidden = true;
        elements.videoPlayer.hidden = true;
        elements.externalSource.hidden = true;
        elements.openExternalSource.hidden = false;
        elements.tryDirectSource.hidden = true;
        elements.speedSelect.disabled = true;
        state.activeExternalURL = null;
        state.activeExternalAppURL = null;
        state.activeAttemptIndex = null;
        updateExternalPlayerActions(stream);
        elements.playerSourceTitle.textContent = stream.title || stream.name || 'Web stream';
        elements.playerSourceNote.textContent = stream.directFromProvider
            ? `Direct from ${stream.sourceAddonName || 'the provider'} to this browser — TShow does not proxy or transcode it.`
            : stream.description || `Provided by ${stream.sourceAddonName || 'an installed add-on'}`;

        if (window.tshowDesktop?.embeddedPlayback && attemptURL) {
            playEmbeddedStream(stream, index, attemptURL);
            return;
        }

        if (!stream.browserReady) {
            const canOpenExternally = isSafeWebURL(stream.externalUrl);
            const canOpenPlayer = isSafeWebURL(stream.externalPlayerUrl);
            const canOpenApp = isSafeExternalAppURL(stream.externalAppUrl);
            const canTryDirect = isSafeWebURL(stream.attemptUrl);
            state.activeExternalURL = canOpenExternally ? stream.externalUrl : null;
            state.activeExternalAppURL = canOpenApp ? stream.externalAppUrl : null;
            state.activeAttemptIndex = canTryDirect ? index : null;
            elements.externalSourceTitle.textContent = canOpenExternally
                ? 'Open this source with its provider'
                : canOpenPlayer
                    ? 'Open this source in an external player'
                    : canOpenApp
                        ? 'Open this source in a compatible app'
                    : canTryDirect
                            ? 'Try this direct provider link in the browser'
                            : stream.notWebReady
                                ? 'App-only download or redirect'
                                : 'This source cannot play in a browser';
            elements.externalSourceNote.textContent = canOpenExternally
                ? 'The add-on supplied a provider page instead of a direct browser video.'
                : canOpenPlayer
                    ? 'This user-added source goes directly from its provider to your device. TShow does not proxy or transcode the video.'
                    : canOpenApp
                        ? stream.unsupportedReason || 'This source needs a compatible source app; it is not a direct video URL for Outplayer or VLC.'
                        : canTryDirect
                            ? 'This HTTPS link has no declared format. TShow can try it directly without proxying; it may still fail if it is a webpage or the provider blocks browsers.'
                            : stream.unsupportedReason ||
                                'The add-on must provide a direct MP4, WebM, HLS, or an external provider page.';
            elements.openExternalSource.hidden = !canOpenExternally;
            elements.tryDirectSource.hidden = !canTryDirect;
            elements.externalSource.hidden = false;
            return;
        }

        if (!stream.url) {
            showUnsupportedSource('This source did not include a direct video URL.');
            return;
        }

        removeExternalSubtitleTracks();
        elements.subtitleSelect.value = '';
        renderSubtitlePicker();
        if (state.subtitleObjectURL) {
            const select = elements.subtitleSelect;
            if (![...select.options].some((option) => option.value === 'local:file')) {
                select.append(makeOption('local:file', 'Local subtitles'));
            }
        }
        elements.speedSelect.disabled = false;
        elements.videoPlayer.playbackRate = Number(elements.speedSelect.value) || 1;

        elements.videoPlayer.hidden = false;

        const isHls = stream.playbackMode === 'hls' ||
            stream.format === 'hls' ||
            String(stream.type || '').toLowerCase().includes('mpegurl') ||
            /\.m3u8(?:$|[?#])/i.test(stream.url);

        armSourceTimeout(index);
        if (isHls) {
            playHlsStream(stream.url);
        } else {
            elements.videoPlayer.src = stream.url;
            elements.videoPlayer.load();
            attemptVideoPlay();
        }
    }

    async function playEmbeddedStream(stream, index, url) {
        const key = state.playerRequestKey;
        const id = crypto.randomUUID();
        const saved = state.continueEntry;
        const matching = saved?.media && mediaKey(saved.media) === mediaKey(state.playerMedia) && saved.videoId === state.playerVideoId;
        state.nativePlayback = { id, key, position: 0, duration: 0 };
        elements.playerSourceNote.textContent = 'Opening in the app… Esc returns to your sources. Subtitles and audio are in Playback.';
        try {
            const result = await window.tshowDesktop.play({ url, sessionId: id,
                title: stream._displayTitle || stream.title || elements.playerTitle.textContent || 'TShow',
                behaviorHints: stream.behaviorHints || {}, start: matching ? saved.currentTime : 0 });
            if (state.nativePlayback?.id !== id || key !== state.playerRequestKey || index !== state.activeStreamIndex) return;
            if (!result?.ok) throw new Error(result?.error || 'The video could not start.');
        } catch (error) {
            if (state.nativePlayback?.id !== id) return;
            elements.playerSourceNote.textContent = error.message || 'Try another source.';
            document.getElementById('recover-source-button').hidden = false;
            showToast(error.message || 'Try another source.', 'warning');
        }
    }

    function activeExternalPlayerURL() {
        const stream = state.streams[state.activeStreamIndex];
        return isSafeWebURL(stream?.externalPlayerUrl) ? stream.externalPlayerUrl : null;
    }

    function activeSourceLink() {
        const stream = state.streams[state.activeStreamIndex];
        if (isSafeWebURL(stream?.externalPlayerUrl)) return stream.externalPlayerUrl;
        if (isSafeExternalAppURL(stream?.externalAppUrl)) return stream.externalAppUrl;
        if (isSafeWebURL(stream?.externalUrl)) return stream.externalUrl;
        return null;
    }

    function updateExternalPlayerActions(stream) {
        const playerAvailable = isSafeWebURL(stream?.externalPlayerUrl);
        const appAvailable = isSafeExternalAppURL(stream?.externalAppUrl);
        const copyAvailable = Boolean(playerAvailable || appAvailable || isSafeWebURL(stream?.externalUrl));
        elements.externalPlayerActions.hidden = !copyAvailable;
        const desktopAvailable = Boolean(playerAvailable && window.tshowDesktop?.isDesktop && !window.tshowDesktop?.embeddedPlayback);
        elements.openInDesktop.hidden = !desktopAvailable;
        elements.openInDesktop.disabled = !desktopAvailable;
        elements.openInVlc.hidden = !playerAvailable;
        elements.openInOutplayer.hidden = !playerAvailable;
        elements.openInVlc.disabled = !playerAvailable;
        elements.openInOutplayer.disabled = !playerAvailable;
        elements.openInSourceApp.hidden = !appAvailable;
        elements.openInSourceApp.disabled = !appAvailable;
        elements.copySourceLink.disabled = !copyAvailable;
    }

    async function openActiveStreamInDesktop() {
        const stream = state.streams[state.activeStreamIndex];
        const url = activeExternalPlayerURL();
        if (!url || !window.tshowDesktop?.isDesktop || typeof window.tshowDesktop.play !== 'function') {
            return showToast('Open this page in TShow Desktop to use local PC playback.', 'warning');
        }
        elements.openInDesktop.disabled = true;
        try {
            const result = await window.tshowDesktop.play({
                url,
                title: stream?.title || stream?.name || elements.playerTitle.textContent || 'TShow',
                behaviorHints: stream?.behaviorHints || {}
            });
            if (!result?.ok) throw new Error(result?.error || 'The local player could not be opened.');
            showToast(`Opened securely in ${String(result.player || 'TShow Player')}.`, 'info');
        } catch (error) {
            showToast(error.message || 'The local player could not be opened.', 'error');
        } finally {
            elements.openInDesktop.disabled = false;
        }
    }

    async function openActiveStreamInVlc() {
        const url = activeExternalPlayerURL();
        if (!url) return showToast('This source has no direct external-player link.', 'warning');
        if (window.tshowDesktop?.isDesktop && typeof window.tshowDesktop.play === 'function') {
            elements.openInVlc.disabled = true;
            try {
                const stream = state.streams[state.activeStreamIndex];
                const result = await window.tshowDesktop.play({
                    url,
                    title: stream?._displayTitle || stream?.title || stream?.name || elements.playerTitle.textContent || 'TShow',
                    behaviorHints: stream?.behaviorHints || {},
                    preferredPlayer: 'vlc'
                });
                if (!result?.ok) throw new Error(result?.error || 'VLC could not be opened.');
                showToast('Opened directly in VLC.', 'info');
            } catch (error) {
                showToast(error.message || 'VLC could not be opened.', 'error');
            } finally {
                elements.openInVlc.disabled = false;
            }
            return;
        }
        if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) showToast('Direct VLC opening requires TShow Desktop or a registered VLC link handler. Without one, copy the source link into VLC Open Network Stream.', 'warning');
        window.location.href = /Android/i.test(navigator.userAgent)
            ? 'intent:' + url.slice(url.indexOf(':') + 1) + '#Intent;scheme=' + new URL(url).protocol.replace(':', '') + ';package=org.videolan.vlc;end'
            : /iPhone|iPad|iPod/i.test(navigator.userAgent)
                ? 'vlc-x-callback://x-callback-url/stream?url=' + encodeURIComponent(url)
                : 'vlc://' + url;
        setTimeout(() => {
            showToast('VLC was requested directly. If Windows did not open it, install the TShow Desktop player or register VLC links once.', 'info');
        }, 1000);
    }

    function openActiveStreamInOutplayer() {
        const url = activeExternalPlayerURL();
        if (!url) return showToast('This source has no direct external-player link.', 'warning');
        // Stop browser audio before handing the selected source to another app.
        elements.videoPlayer.pause();
        const requestKey = state.playerRequestKey;
        const streamIndex = state.activeStreamIndex;
        let leftPage = false;
        const onVisibility = () => { if (document.hidden) leftPage = true; };
        const onPageHide = () => { leftPage = true; };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', onPageHide, { once: true });
        window.location.href = `outplayer://x-callback-url/play?url=${encodeURIComponent(url)}`;
        setTimeout(() => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', onPageHide);
            if (!leftPage && !document.hidden && requestKey === state.playerRequestKey && streamIndex === state.activeStreamIndex) {
                showToast('Outplayer requires an Apple device with Outplayer installed. If it did not open, use Copy link in Outplayer’s Open URL option.', 'info');
            }
        }, 1800);
    }

    function openActiveStreamInSourceApp() {
        if (!isSafeExternalAppURL(state.activeExternalAppURL)) {
            return showToast('This entry has no safe external-app link.', 'warning');
        }
        window.location.href = state.activeExternalAppURL;
        setTimeout(() => {
            showToast('If no app opened, copy the source link and use an app you trust.', 'info');
        }, 800);
    }

    async function copyActiveSourceLink() {
        const link = activeSourceLink();
        if (!link) return showToast('This entry has no safe source link.', 'warning');
        try {
            await navigator.clipboard.writeText(link);
            showToast('Source link copied.', 'info');
        } catch {
            showToast('The browser could not copy this link.', 'warning');
        }
    }

    function subtitleTrackSrc(subtitle) {
        const proxyURL = String(subtitle?.proxyUrl || '');
        return proxyURL.startsWith('/api/proxy/subtitle?') ? proxyURL : '';
    }

    function subtitleOptions(activeStream) {
        const merged = [
            ...(Array.isArray(activeStream?.subtitles) ? activeStream.subtitles : []),
            ...state.subtitleLibrary
        ].filter((subtitle) => subtitle && isSafeWebURL(subtitle.url));

        const seen = new Set();
        return merged.filter((subtitle) => {
            const key = `${String(subtitle.lang || '').toLowerCase()}|${subtitle.url}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 60);
    }

    function embeddedSubtitleTracks() {
        const external = new Set([...elements.videoPlayer.querySelectorAll('track[data-external]')].map(node => node.track));
        return [...elements.videoPlayer.textTracks].filter(track => !external.has(track) && ['subtitles', 'captions'].includes(track.kind));
    }

    function renderSubtitlePicker() {
        const stream = state.streams[state.activeStreamIndex];
        const options = subtitleOptions(stream);
        const select = elements.subtitleSelect;
        const current = select.value;

        select.replaceChildren(
            makeOption('', options.length ? 'Off' : 'Off (none found)')
        );
        embeddedSubtitleTracks().forEach((track, index) => {
            select.append(makeOption('embedded:' + index, track.label || track.language || 'Embedded ' + (index + 1)));
        });
        if (state.subtitleObjectURL) select.append(makeOption('local:file', 'Local subtitle file'));
        options.forEach((subtitle, index) => {
            const language = String(subtitle.lang || '').toUpperCase() || '—';
            const provider = subtitle.provider ? ` · ${subtitle.provider}` : '';
            select.append(makeOption(String(index), `${language}${provider}`));
        });
        if ([...select.options].some((option) => option.value === current)) {
            select.value = current;
        }
        restorePreferredSubtitle();
    }


    function watchingPrefs() {
        const value=loadStoredValue(STORAGE_KEYS.playerPreferences);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }
    function saveWatchingPrefs(patch) { saveStored(STORAGE_KEYS.playerPreferences, JSON.stringify({...watchingPrefs(),...patch})); }
    function setupWatchingTools() {
        document.getElementById('check-sources-button').addEventListener('click',()=>{
            state.checksPaused=!state.checksPaused;
            document.getElementById('check-sources-button').textContent=state.checksPaused?'Resume link checks':'Pause link checks';
            if(state.checksPaused){clearTimeout(state.sourceScanTimer);state.browserProbes?.forEach(cancel=>cancel());}
            else checkBrowserSources(state.playerRequest);
        });
        elements.videoPlayer.addEventListener('playing',()=>{
            clearTimeout(state.sourceStartTimer);
            const stream=state.streams[state.activeStreamIndex];
            if(stream&&!stream.isDemo&&elements.videoPlayer.videoWidth>0){stream._browserChecked=true;stream._browserCheckDone=true;renderSourcePicker();}
            checkBrowserSources(state.playerRequest);
        });
        elements.videoPlayer.addEventListener('waiting',()=>{state.browserProbes?.forEach(cancel=>cancel());});
        const prefs=watchingPrefs();
        const theme=document.getElementById('theme-select');theme.value=['violet','blue','emerald','classic'].includes(prefs.theme)?prefs.theme:'violet';document.documentElement.dataset.theme=theme.value;
        theme.addEventListener('change',()=>{document.documentElement.dataset.theme=theme.value;saveWatchingPrefs({theme:theme.value});});
        const preferred=document.getElementById('preferred-subtitle');preferred.value=prefs.subtitleLanguage||'off';
        preferred.addEventListener('change',()=>{saveWatchingPrefs({subtitleLanguage:preferred.value});elements.subtitleSelect.value='';renderSubtitlePicker();});
        const size=document.getElementById('subtitle-size');size.value=['small','normal','large'].includes(prefs.subtitleSize)?prefs.subtitleSize:'normal';elements.videoStage.dataset.subtitleSize=size.value;
        size.addEventListener('change',()=>saveWatchingPrefs({subtitleSize:size.value}));
        elements.subtitleSelect.addEventListener('change',()=>{const value=elements.subtitleSelect.value;const lang=value.startsWith('embedded:')?embeddedSubtitleTracks()[Number(value.slice(9))]?.language:subtitleOptions(state.streams[state.activeStreamIndex])[Number(value)]?.lang;if(!value)saveWatchingPrefs({subtitleLanguage:'off'});else if(lang)saveWatchingPrefs({subtitleLanguage:lang});});
        for(const id of ['source-quality','source-language','source-size'])document.getElementById(id).addEventListener('input',()=>{state.extraSourceFilters={quality:document.getElementById('source-quality').value,language:document.getElementById('source-language').value,maxSize:document.getElementById('source-size').value};renderSourcePicker();});
        document.getElementById('reset-source-filters').addEventListener('click',()=>{for(const id of ['source-quality','source-language','source-size'])document.getElementById(id).value='';state.extraSourceFilters={};renderSourcePicker();});
        document.getElementById('next-episode-button').addEventListener('click',()=>{const next=nextEpisode(state.playerDetails,state.playerVideoId);if(next)playMedia(state.playerMedia,state.playerDetails,next.id);});
        document.getElementById('recover-source-button').addEventListener('click',()=>{
            const current=state.activeStreamIndex;
            state.recoveryTried ||= new Set();state.recoveryTried.add(current);
            const candidates=state.streams.map((stream,index)=>({stream,index})).filter(({stream,index})=>index!==current&&!state.recoveryTried.has(index)&&!stream.isDemo&&[stream.url,stream.attemptUrl,stream.externalPlayerUrl].some(isSafeWebURL)).sort((a,b)=>Number(Boolean(b.stream._browserChecked))-Number(Boolean(a.stream._browserChecked)));
            if(!candidates.length)return showToast('No alternative direct source is available.','warning');
            const saved=state.continueEntry;
            const matching=saved?.media&&mediaKey(saved.media)===mediaKey(state.playerMedia)&&saved.videoId===state.playerVideoId;
            const position=elements.videoPlayer.currentTime||(matching?saved.currentTime:0)||0;
            state.pendingResume={position,index:candidates[0].index,key:state.playerRequestKey};applyStream(candidates[0].index);
            showToast('Trying another source. The time position is restored when its timeline loads.');
        });
        elements.videoPlayer.addEventListener('loadedmetadata',()=>{
            state.playingScope = state.playerRequestKey;
            const pending=state.pendingResume;const saved=state.continueEntry;
            const position=pending?.key===state.playerRequestKey&&pending.index===state.activeStreamIndex?pending.position:saved?.media&&mediaKey(saved.media)===mediaKey(state.playerMedia)&&saved.videoId===state.playerVideoId?saved.currentTime:0;
            state.pendingResume=null;const target=resumePosition(position,elements.videoPlayer.duration);
            const resume=document.getElementById('resume-playback-button');resume.hidden=!target;resume.textContent='Resume at '+Math.floor(target/60)+':'+String(Math.floor(target%60)).padStart(2,'0');resume.onclick=()=>{try{elements.videoPlayer.currentTime=target;attemptVideoPlay();resume.hidden=true;}catch{showToast('This source does not support seeking yet.','warning');}};
        });
        let stalledTimer;
        elements.videoPlayer.addEventListener('waiting',()=>{clearTimeout(stalledTimer);const key=state.playerRequestKey;const index=state.activeStreamIndex;stalledTimer=setTimeout(()=>{if(elements.playerDialog.open&&key===state.playerRequestKey&&index===state.activeStreamIndex&&elements.videoPlayer.readyState<3)document.getElementById('recover-source-button').hidden=false;},15000);});
        elements.videoPlayer.addEventListener('playing',()=>{clearTimeout(stalledTimer);document.getElementById('recover-source-button').hidden=true;});
        document.getElementById('collection-select').addEventListener('change',event=>{state.collectionId=event.target.value;state.editCollection=false;renderWatchlist();});
        document.getElementById('edit-collection').addEventListener('click',()=>{state.editCollection=!state.editCollection;renderWatchlist();});
        document.getElementById('create-collection').addEventListener('click',()=>{const input=document.getElementById('collection-name');const name=input.value.trim();if(!name)return;const prefs=watchingPrefs();const collections=Array.isArray(prefs.collections)?prefs.collections:[];if(collections.length>=30)return showToast('You can keep up to 30 collections.','warning');const existing=collections.find(c=>c.name.toLowerCase()===name.toLowerCase());const id=existing?.id||crypto.randomUUID();if(!existing)collections.push({id,name,keys:[]});saveWatchingPrefs({collections});input.value='';state.collectionId=id;state.editCollection=true;renderWatchlist();});
        renderCollections();
    }
    function renderCollections() {
        const select=document.getElementById('collection-select');if(!select)return;
        const collections=watchingPrefs().collections||[];select.replaceChildren(makeOption('','All titles'),...collections.map(c=>makeOption(c.id,c.name)));select.value=state.collectionId||'';
        const edit=document.getElementById('edit-collection');edit.hidden=!state.collectionId;edit.textContent=state.editCollection?'Done':'Manage titles';
    }
    function updateNextEpisode() {
        const button=document.getElementById('next-episode-button');const next=nextEpisode(state.playerDetails,state.playerVideoId);button.hidden=!next;if(next)button.textContent='Next episode · S'+next.season+' E'+next.episode;
    }
    function restorePreferredSubtitle() {
        const select=elements.subtitleSelect;if(select.value)return;
        const language=watchingPrefs().subtitleLanguage;if(!language||language==='off')return;
        const aliases={en:'eng',hi:'hin',es:'spa',fr:'fra',de:'deu',ja:'jpn',ko:'kor',ta:'tam',te:'tel'};
        const match=lang=>lang && (lang.toLowerCase()===language.toLowerCase()||lang.toLowerCase()===aliases[language]);
        const embedded=embeddedSubtitleTracks().findIndex(t=>match(t.language));
        const remote=subtitleOptions(state.streams[state.activeStreamIndex]).findIndex(t=>match(t.lang));
        const value=embedded>=0?'embedded:'+embedded:remote>=0?String(remote):'';
        if(value){select.value=value;applySubtitleChoice(value);}
    }

    function makeOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function removeExternalSubtitleTracks() {
        if(state.remoteSubtitleURL){URL.revokeObjectURL(state.remoteSubtitleURL);state.remoteSubtitleURL=null;}
        elements.videoPlayer.querySelectorAll('track[data-external]').forEach((track) => {
            track.remove();
        });
    }

    function attachSubtitleTrack(src, label, language, marker) {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.src = src;
        track.label = String(label || 'Subtitles').slice(0, 60);
        track.srclang = String(language || '').slice(0, 12);
        track.dataset.external = marker;
        track.addEventListener('load', () => {
            track.track.mode = 'showing';
        }, { once: true });
        elements.videoPlayer.append(track);
        track.track.mode = 'showing';
        return track;
    }

    async function applySubtitleChoice(value) {
        const subtitleRequest = state.subtitleRequest = (state.subtitleRequest || 0) + 1;
        const playerRequest = state.playerRequest;
        removeExternalSubtitleTracks();
        for (const track of elements.videoPlayer.textTracks) track.mode = 'disabled';
        if (value.startsWith('embedded:')) {
            const track = embeddedSubtitleTracks()[Number(value.slice(9))];
            if (track) track.mode = 'showing';
            return;
        }
        if (!value) return;

        if (value.startsWith('local:')) {
            if (state.subtitleObjectURL) {
                attachSubtitleTrack(state.subtitleObjectURL, 'Local subtitles', '', 'local');
            }
            return;
        }

        const index = Number.parseInt(value, 10);
        const stream = state.streams[state.activeStreamIndex];
        const subtitle = subtitleOptions(stream)[index];
        if (!subtitle) return;
        const source = isSafeWebURL(subtitle.url) && subtitle.url.startsWith('https:') ? subtitle.url : subtitleTrackSrc(subtitle);
        if (!source) {
            showToast('This subtitle source could not be verified.', 'error');
            return;
        }
        try {
            const response = await fetch(source, { credentials: 'omit', signal: AbortSignal.timeout(12000) });
            if (!response.ok || Number(response.headers.get('content-length')) > 2000000) throw new Error('Subtitle request failed');
            const reader=response.body.getReader(); let size=0; const chunks=[];
            while(true){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.length;if(size>2000000){await reader.cancel();throw new Error('Subtitle file too large');}chunks.push(chunk);}
            const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
            let content=new TextDecoder().decode(bytes);
            if (!content.trimStart().startsWith('WEBVTT')) content=srtToVtt(content);
            if (subtitleRequest !== state.subtitleRequest || playerRequest !== state.playerRequest || elements.subtitleSelect.value !== value || !elements.playerDialog.open) return;
            if (state.remoteSubtitleURL) URL.revokeObjectURL(state.remoteSubtitleURL);
            state.remoteSubtitleURL=URL.createObjectURL(new Blob([content],{type:'text/vtt'}));
            attachSubtitleTrack(state.remoteSubtitleURL, subtitle.label, subtitle.lang, 'remote');
        } catch { showToast('This provider blocks browser subtitle access or the file is unavailable. Try another provider or load a local subtitle file.', 'warning'); }
    }

    function srtToVtt(text) {
        const body = String(text)
            .replace(/\r+\n/g, '\n')
            .replace(/^\uFEFF/, '')
            .replace(/^\d+\s*$/gm, '')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
            .trim();
        return `WEBVTT\n\n${body}\n`;
    }

    async function openLocalSubtitle(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const playerRequest = state.playerRequest;
        const selectedStream = state.streams[state.activeStreamIndex];
        if (file.size > 2000000) return showToast('Choose a subtitle file smaller than 2 MB.', 'warning');

        try {
            let content = await file.text();
            if (!elements.playerDialog.open || playerRequest !== state.playerRequest || selectedStream !== state.streams[state.activeStreamIndex]) return;
            if (!/^WEBVTT/.test(content.trim())) content = srtToVtt(content);
            else if (/(\d{2}:\d{2}:\d{2}),\d{3}/.test(content)) content = srtToVtt(content);

            if (state.subtitleObjectURL) URL.revokeObjectURL(state.subtitleObjectURL);
            state.subtitleObjectURL = URL.createObjectURL(
                new Blob([content], { type: 'text/vtt' })
            );
            const select = elements.subtitleSelect;
            if (![...select.options].some((option) => option.value === 'local:file')) {
                select.append(makeOption('local:file', `Local · ${file.name.slice(0, 30)}`));
            }
            select.value = 'local:file';
            applySubtitleChoice('local:file');
            showToast('Subtitles loaded from your file.');
        } catch {
            showToast('That subtitle file could not be read.', 'error');
        }
    }

    async function loadSubtitleLibrary(type, id, requestId = state.playerRequest) {
        try {
            const data = await api(`/api/streams/subtitles/${type}/${encodeURIComponent(id)}`);
            if (requestId !== state.playerRequest) return;
            state.subtitleLibrary = Array.isArray(data.subtitles) ? data.subtitles : [];
            const missing = data.providers
                ?.filter((provider) => provider.error)
                .map((provider) => provider.name);
            if (missing?.length) {
                showToast(`Subtitle provider(s) unavailable: ${missing.join(', ')}.`, 'warning');
            }
        } catch {
            if (requestId !== state.playerRequest) return;
            state.subtitleLibrary = [];
        }
        if (requestId !== state.playerRequest) return;
        renderSubtitlePicker();
    }

    function toggleDataSaver() {
        const panel = document.getElementById('playback-settings');
        panel.open = !panel.open;
        elements.dataSaverButton.setAttribute('aria-expanded', String(panel.open));
        if (panel.open) document.getElementById('subtitle-select').focus({ preventScroll: true });
    }

    function updateDataSaverButton() {}

    function stopSourceAutomation() {
        state.scanGeneration = (state.scanGeneration || 0) + 1;
        clearTimeout(state.sourceStartTimer);
        clearTimeout(state.sourceScanTimer);
        clearTimeout(state.sourceFailureTimer);
        state.browserProbes?.forEach(cancel => cancel());
    }

    function armSourceTimeout(index) {
        clearTimeout(state.sourceStartTimer);
        const request = state.playerRequest;
        state.sourceStartTimer = setTimeout(() => {
            if (request !== state.playerRequest || index !== state.activeStreamIndex || !elements.playerDialog.open) return;
            // An autoplay restriction is not a bad source: keep a decoded video ready for the Play button.
            if (elements.videoPlayer.readyState >= 2 && elements.videoPlayer.videoWidth > 0) return;
            showUnsupportedSource('This source took too long to start.');
        }, 20000);
    }

    function canCheckInBackground() {
        const video = elements.videoPlayer;
        if (state.checksPaused || video.hidden || video.readyState < 3 || video.videoWidth <= 0) return false;
        if (video.paused) return true;
        for (let i=0;i<video.buffered.length;i++) {
            if (video.buffered.start(i)<=video.currentTime && video.buffered.end(i)-video.currentTime>=12) return true;
        }
        return false;
    }

    function checkBrowserSources(requestId) {
        clearTimeout(state.sourceScanTimer);
        if (state.checksPaused || state.scanBusy || requestId !== state.playerRequest || !elements.playerDialog.open) return;
        const generation = state.scanGeneration;
        const current = () => generation === state.scanGeneration && requestId === state.playerRequest && elements.playerDialog.open && canCheckInBackground();
        state.sourceScanTimer = setTimeout(async()=>{
            if (generation !== state.scanGeneration || requestId !== state.playerRequest || !elements.playerDialog.open || state.checksPaused) return;
            const stream=state.streams.find((s,i)=>i!==state.activeStreamIndex && !s.isDemo && browserAttemptURL(s) && !s._browserCheckDone);
            if (!stream) return;
            if (!canCheckInBackground()) { checkBrowserSources(requestId); return; }
            state.scanBusy = true;
            const passed=await probeBrowserSource({...stream,url:browserAttemptURL(stream)},current);
            state.scanBusy = false;
            if (current()) {
                stream._browserChecked=passed;
                stream._browserCheckDone=true;
            }
            if (generation === state.scanGeneration) checkBrowserSources(requestId);
        }, 3000);
    }

    function probeBrowserSource(stream, current) {
        return new Promise(resolve => {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            let hls, done = false;
            state.browserProbes ||= new Set();
            const stop = () => finish(false);
            const finish = passed => {
                if (done) return;
                done = true;
                state.browserProbes.delete(stop);
                clearTimeout(timeout); clearInterval(cancel);
                video.onloadeddata = video.onerror = null;
                hls?.destroy(); video.pause(); video.removeAttribute('src'); video.load();
                resolve(passed);
            };
            state.browserProbes.add(stop);
            const timeout = setTimeout(() => finish(false), 12000);
            const cancel = setInterval(() => { if (!current()) finish(false); }, 250);
            video.onloadeddata = () => finish(video.videoWidth > 0 && video.readyState >= 2);
            video.onerror = () => finish(false);
            try {
                const isHls = stream.playbackMode === 'hls' || stream.format === 'hls' || /\.m3u8(?:$|[?#])/i.test(stream.url);
                if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
                    if (!window.Hls?.isSupported()) return finish(false);
                    hls = new window.Hls({ maxBufferLength: 1, maxMaxBufferLength: 2, maxBufferSize: 2000000, enableWorker: true });
                    hls.on(window.Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(stream.url));
                    hls.on(window.Hls.Events.ERROR, (_event, data) => { if (data.fatal) finish(false); });
                    hls.attachMedia(video);
                } else { video.src = stream.url; video.load(); }
            } catch { finish(false); }
        });
    }

    async function togglePlayerFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (elements.videoStage.requestFullscreen) {
                await elements.videoStage.requestFullscreen();
            } else if (elements.videoPlayer.webkitEnterFullscreen && !elements.videoPlayer.hidden) {
                elements.videoPlayer.webkitEnterFullscreen();
            } else {
                throw new Error('Fullscreen is not available on this device.');
            }
        } catch (error) {
            showToast(error.message || 'Fullscreen could not be opened.', 'warning');
        }
        updatePlayerWindowActions();
    }

    async function togglePlayerPictureInPicture() {
        if (elements.videoPlayer.hidden || !document.pictureInPictureEnabled || !elements.videoPlayer.requestPictureInPicture) {
            showToast('Picture in Picture is unavailable for this source or browser.', 'warning');
            return;
        }
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await elements.videoPlayer.requestPictureInPicture();
        } catch {
            showToast('Start the video before using Picture in Picture.', 'warning');
        }
        updatePlayerWindowActions();
    }

    function updatePlayerWindowActions() {
        const fullscreen = Boolean(document.fullscreenElement);
        const pip = Boolean(document.pictureInPictureElement);
        elements.playerFullscreen.setAttribute('aria-label', fullscreen ? 'Exit full screen' : 'Full screen');
        elements.playerFullscreen.title = fullscreen ? 'Exit full screen' : 'Full screen';
        elements.playerFullscreen.classList.toggle('is-active', fullscreen);
        elements.playerPip.setAttribute('aria-label', pip ? 'Exit Picture in Picture' : 'Picture in Picture');
        elements.playerPip.title = pip ? 'Exit Picture in Picture' : 'Picture in Picture';
        elements.playerPip.classList.toggle('is-active', pip);
    }

    function playHlsStream(url) {
        state.activeHlsURL = url;
        elements.videoLoading.hidden = false;
        const loadingText = elements.videoLoading.querySelector('p');
        if (loadingText) loadingText.textContent = 'Preparing the video stream…';
        const qualitySelect = document.getElementById('player-quality');
        if (qualitySelect) { qualitySelect.replaceChildren(makeOption('-1', 'Auto quality')); qualitySelect.disabled = true; }
        let networkRecoveries = 0, mediaRecoveries = 0;
        const nativeHls = elements.videoPlayer.canPlayType('application/vnd.apple.mpegurl');
        if (nativeHls) {
            const finishLoading = () => {
                elements.videoLoading.hidden = true;
            };
            elements.videoPlayer?.addEventListener('loadedmetadata', finishLoading, { once: true });
            elements.videoPlayer?.addEventListener('canplay', finishLoading, { once: true });
            elements.videoPlayer?.addEventListener('playing', finishLoading, { once: true });
            elements.videoPlayer.src = url;
            elements.videoPlayer.load();
            attemptVideoPlay();
            return;
        }

        if (!window.Hls?.isSupported()) {
            showUnsupportedSource(
                'This device does not provide the MediaSource support required for HLS. Choose another source or the public demo.'
            );
            return;
        }

        state.hlsPlayer = new window.Hls({
            enableWorker: true,
            backBufferLength: 60,
            maxBufferLength: 45,
            maxMaxBufferLength: 300,
            maxBufferSize: 120_000_000,
            fragLoadingMaxRetry: 8,
            manifestLoadingMaxRetry: 4,
            levelLoadingMaxRetry: 6,
            startLevel: -1,
            capLevelToPlayerSize: true
        });
        state.hlsPlayer.on(window.Hls.Events.MEDIA_ATTACHED, () => {
            state.hlsPlayer?.loadSource(url);
        });
        state.hlsPlayer.on(window.Hls.Events.MANIFEST_PARSED, () => {
            elements.videoLoading.hidden = true;
            attemptVideoPlay();
        });
        state.hlsPlayer.on(window.Hls.Events.ERROR, (_event, data) => {
            if (!data?.fatal) return;
            destroyHls();
            showUnsupportedSource(
                'This source could not be reached or its original format is not supported. Try another smaller MP4 or HLS source.'
            );
        });
        state.hlsPlayer.attachMedia(elements.videoPlayer);
    }

    function attemptVideoPlay() {
        const playPromise = elements.videoPlayer.play();
        if (playPromise?.catch) {
            playPromise.catch(() => {
                showToast('Press play when you are ready.', 'warning');
            });
        }
    }

    async function tryTranscodeFallback(stream) {
        const isMobile = isLikelyMobileDevice();
        const useLow = isMobile || state.dataSaver;
        const transcodeTarget = useLow && stream.transcodeLowUrl ? stream.transcodeLowUrl : stream.transcodeUrl;
        if (!transcodeTarget || state.transcodeTried) return;
        state.transcodeTried = true;
        const attemptedIndex = state.activeStreamIndex;
        showToast(useLow
            ? 'Direct playback failed — switching to mobile-friendly H.264 stream…'
            : 'Direct playback failed — converting this source on the server…', 'warning');
        clearVideoElement();
        elements.videoLoading.hidden = false;
        elements.videoPlayer.hidden = true;
        try {
            await fetch(transcodeTarget, { credentials: 'same-origin', cache: 'no-store' });
        } catch {
            // hls.js reports the real failure when it attaches.
        }
        if (!elements.playerDialog.open || state.activeStreamIndex !== attemptedIndex) return;
        elements.videoLoading.hidden = true;
        elements.videoPlayer.hidden = false;
        playHlsStream(transcodeTarget);
    }

    function showUnsupportedSource(message) {
        clearVideoElement();
        document.getElementById("recover-source-button").hidden = false;
        elements.videoLoading.hidden = true;
        elements.videoPlayer.hidden = true;
        elements.externalSourceTitle.textContent = 'This source cannot play here';
        elements.externalSourceNote.textContent = message;
        elements.openExternalSource.hidden = true;
        elements.tryDirectSource.hidden = true;
        state.activeAttemptIndex = null;
        elements.externalSource.hidden = false;
    }

    function closePlayer() {
        stopSourceAutomation();
        state.playerRequest += 1;
        state.playerRequestKey = null;
        savePlaybackProgress(true);
        clearVideoElement();
        resetTrailerFrame();
        elements.videoPlayer.removeAttribute('poster');
        elements.externalSource.hidden = true;
        elements.externalPlayerActions.hidden = true;
        state.activeExternalURL = null;
        state.activeExternalAppURL = null;
        state.activeAttemptIndex = null;
        state.transcodeTried = false;
        state.activeHlsURL = null;
        state.activeStreamIndex = null;
        state.visibleStreamIndexes = [];
        state.streams = [];
        state.playerMedia = null;
        elements.speedSelect.disabled = false;

        if (state.subtitleObjectURL) {
            URL.revokeObjectURL(state.subtitleObjectURL);
            state.subtitleObjectURL = null;
        }
        state.subtitleLibrary = [];
    }

    function resetTrailerFrame() {
        state.trailerMode = false;
        elements.playerDialog.classList.remove('is-trailer');
        elements.trailerFrame.hidden = true;
        elements.trailerFrame.removeAttribute('src');
    }

    function destroyHls() {
        if (!state.hlsPlayer) return;
        state.hlsPlayer.destroy();
        state.hlsPlayer = null;
        const quality=document.getElementById('player-quality');if(quality){quality.disabled=true;quality.replaceChildren(makeOption('-1','Auto quality'));}
    }

    function clearVideoElement() {
        if (window.tshowDesktop?.embeddedPlayback) {
            state.nativePlayback = null;
            window.tshowDesktop.stop().catch(() => {});
        }
        state.playingScope = null;
        state.subtitleRequest = (state.subtitleRequest || 0) + 1;
        document.getElementById("playback-settings")?.removeAttribute("open");
        elements.dataSaverButton?.setAttribute('aria-expanded', 'false');
        removeExternalSubtitleTracks();
        destroyHls();
        elements.videoPlayer.pause();
        elements.videoPlayer.removeAttribute('src');
        elements.videoPlayer.querySelectorAll('track').forEach((track) => track.remove());
        elements.videoPlayer.load();
    }

    function savePlaybackProgress(force = false) {
        const native = state.nativePlayback?.key === state.playerRequestKey ? state.nativePlayback : null;
        const duration = native ? native.duration : elements.videoPlayer.duration;
        const currentTime = native ? native.position : elements.videoPlayer.currentTime;
        if (!state.playerMedia || state.playingScope !== state.playerRequestKey || state.streams[state.activeStreamIndex]?.isDemo || !Number.isFinite(duration) || duration <= 0) return;

        const now = Date.now();
        if (!force && now - state.lastProgressSave < 15_000) return;
        if (currentTime < 2) return;

        const entry = {
            media: state.playerMedia,
            videoId: state.playerVideoId,
            currentTime: Math.round(currentTime),
            duration: Math.round(duration),
            updatedAt: now
        };

        state.lastProgressSave = now;
        state.continueEntry = entry;
        saveStored(STORAGE_KEYS.continueWatching, JSON.stringify(entry));
        renderContinueWatching();
    }

    function renderContinueWatching() {
        const entry = state.continueEntry;
        const valid = entry?.media && entry.duration > 0 && entry.currentTime < entry.duration * 0.98;

        if (!valid) {
            elements.continueSection.hidden = true;
            elements.continueRail.replaceChildren();
            return;
        }

        const progress = (entry.currentTime / entry.duration) * 100;
        elements.continueSection.hidden = false;
        elements.continueRail.replaceChildren(createMediaCard(normalizeMedia(entry.media), progress));
    }

    function toggleWatchlist(media) {
        const key = mediaKey(media);
        const index = state.watchlist.findIndex((item) => mediaKey(item) === key);
        let added;

        if (index >= 0) {
            state.watchlist.splice(index, 1);
            added = false;
            showToast('Removed from My list.');
        } else {
            state.watchlist.unshift(serializeMedia(media));
            state.watchlist = state.watchlist.slice(0, 100);
            added = true;
            showToast('Added to My list.');
        }

        saveStored(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
        updateListCount();
        renderWatchlist();
        return added;
    }

    function isInWatchlist(media) {
        const key = mediaKey(media);
        return state.watchlist.some((item) => mediaKey(item) === key);
    }

    function updateListCount() {
        const count = state.watchlist.length;
        elements.listCount.textContent = String(count);
        elements.listCount.hidden = count === 0;
    }

    function renderWatchlist() {
        renderCollections();
        const collection = watchingPrefs().collections?.find(c => c.id === state.collectionId);
        const items = state.watchlist.map((item) => normalizeMedia(item)).filter(item => !collection || state.editCollection || collection.keys.includes(mediaKey(item)));
        elements.listGrid.replaceChildren(...items.map((item) => {
            const wrapper = makeElement("div"); wrapper.append(createMediaCard(item));
            if (collection && state.editCollection) { const label = makeElement("label", "collection-toggle"); const box = document.createElement("input"); box.type="checkbox";box.checked=collection.keys.includes(mediaKey(item));box.addEventListener("change",()=>{collection.keys=box.checked?[...new Set([...collection.keys,mediaKey(item)])]:collection.keys.filter(k=>k!==mediaKey(item));const p=watchingPrefs();p.collections=p.collections.map(c=>c.id===collection.id?collection:c);saveWatchingPrefs(p);});label.append(box,document.createTextNode("In this collection"));wrapper.append(label); }
            return wrapper;
        }));
        elements.listEmpty.hidden = items.length > 0;
    }

    function rememberRecentlyViewed(media) {
        const serialized = serializeMedia(media);
        state.recentlyViewed = uniqueHistory([serialized, ...state.recentlyViewed]).slice(0, 20);
        saveStored(STORAGE_KEYS.recentlyViewed, JSON.stringify(state.recentlyViewed));
        renderRecentlyViewed();
    }

    function renderRecentlyViewed() {
        const cleaned = uniqueHistory(state.recentlyViewed);
        if (cleaned.length !== state.recentlyViewed.length) {
            state.recentlyViewed = cleaned;
            saveStored(STORAGE_KEYS.recentlyViewed, JSON.stringify(cleaned));
        }
        const items = uniqueHistory(state.recentlyViewed).map((item) => normalizeMedia(item)).filter(Boolean);
        elements.recentSection.hidden = items.length === 0;
        if (items.length) renderRail(elements.recentRail, items);
    }

    function renderHistory() {
        const items = uniqueHistory(state.recentlyViewed).map((item) => normalizeMedia(item)).filter(Boolean);
        elements.historyGrid?.replaceChildren(...items.map((item) => createMediaCard(item)));
        if (elements.historyEmpty) elements.historyEmpty.hidden = items.length > 0;
        if (elements.clearHistory) elements.clearHistory.hidden = items.length === 0;
    }

    function clearHistory() {
        if (!state.recentlyViewed.length || !window.confirm('Clear recently viewed titles from this browser?')) return;
        state.recentlyViewed = [];
        saveStored(STORAGE_KEYS.recentlyViewed, null);
        renderRecentlyViewed();
        renderHistory();
        showToast('History cleared.');
    }

    async function renderCalendar() {
        const generation = state.calendarGeneration = (state.calendarGeneration || 0) + 1;
        const series = state.watchlist.map(item => normalizeMedia(item)).filter(item => mediaType(item) === 'tv');
        elements.calendarEmpty.hidden = series.length > 0;
        elements.calendarBoard.replaceChildren(makeElement('p', '', series.length ? 'Checking upcoming episodes...' : 'Follow a series by adding it to My list.'));
        const entries = []; let failed = 0; const queue = [...series];
        const worker = async () => { while(queue.length && generation === state.calendarGeneration) { const media=queue.shift();try { const details=media._addonCatalog ? (await resolveAddonDetails(media)).details : await api('/api/tmdb/tv/'+encodeURIComponent(media.id)); for(const episode of upcomingEpisodes(details)) entries.push({media,episode}); } catch { failed++; } } };
        await Promise.all([worker(),worker(),worker()]);
        if(generation !== state.calendarGeneration)return;
        entries.sort((a,b)=>Date.parse(a.episode.date)-Date.parse(b.episode.date));
        const nodes=entries.map(({media,episode})=>{const row=makeElement('article','calendar-episode');const button=makeElement('button','button button-quiet',mediaTitle(media));button.addEventListener('click',()=>openDetails(media));row.append(button,makeElement('p','',new Date(episode.date).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+' · S'+episode.season+' E'+episode.episode+' · '+(episode.title||episode.name||'Upcoming episode')));return row;});
        if(!nodes.length)nodes.push(makeElement('p','','No announced episodes in the next 90 days.'));
        if(failed)nodes.push(makeElement('p','',failed+' series could not be refreshed. Try again later.'));
        elements.calendarBoard.replaceChildren(...nodes);
    }

    async function shareMedia(media) {
        const titleURL = publicTitleURL(media);
        const shareData = {
            title: `${mediaTitle(media)} · TShow`,
            text: `Discover ${mediaTitle(media)} on TShow`,
            url: titleURL ? new URL(titleURL, window.location.origin).href : window.location.href.split('#')[0]
        };
        try {
            if (navigator.share) await navigator.share(shareData);
            else {
                await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
                showToast('Share link copied.');
            }
        } catch (error) {
            if (error?.name !== 'AbortError') showToast('Could not share this title.', 'error');
        }
    }

    function publicTitleURL(media) {
        const imdbId = media?.imdb_id || media?._stremioId;
        const stableImdbId = /^tt\d{5,12}$/i.test(String(imdbId || ''))
            ? imdbId
            : null;
        const id = String(stableImdbId || media?._tmdbId || media?.id || '');
        if (!/^(?:\d{1,12}|tt\d{5,12})$/i.test(id)) return null;
        const kind = mediaType(media) === 'tv' ? 'series' : 'movie';
        const slug = mediaTitle(media).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'title';
        return `/${kind}/${id}/${slug}`;
    }

    async function runSearch(rawQuery) {
        const query = String(rawQuery || '').trim();
        if (query.length < 2) {
            showToast('Enter at least two characters to search.', 'warning');
            elements.searchInput.focus();
            return;
        }

        leaveBrowseMode();
        setView('search');
        elements.searchTitle.textContent = `Results for “${query}”`;
        elements.searchSummary.textContent = 'Searching movies and series…';
        elements.searchEmpty.hidden = true;
        renderGridLoading(elements.searchGrid, 10);

        if (state.addonCatalogLoadPromise) {
            await Promise.race([
                state.addonCatalogLoadPromise.catch(() => null),
                new Promise((resolve) => window.setTimeout(resolve, 4_000))
            ]);
        }

        const localResults = searchLoadedCatalogs(query);
        let apiResults = [];
        try {
            const data = await api(`/api/tmdb/search?query=${encodeURIComponent(query)}&type=multi`);
            apiResults = normalizeCollection(data.results)
                .filter((item) => item.id && ['movie', 'tv'].includes(mediaType(item)));
        } catch {
            // Connected catalogs remain searchable even when TMDB is not configured.
        }

        let globalResults = [];
        let searchProviders = [];
        try {
            const searchData = await api(`/api/addons/search?query=${encodeURIComponent(query)}`);
            searchProviders = Array.isArray(searchData.providers) ? searchData.providers : [];
            globalResults = (Array.isArray(searchData.groups) ? searchData.groups : [])
                .flatMap((group) => normalizeLiveCatalog(group.data, {
                    addon: group.addon,
                    catalog: group.catalog,
                    type: group.type
                }));
        } catch {
            // Permanent and user-installed search providers are best-effort.
        }

        const results = dedupeSearchResults([...localResults, ...globalResults, ...apiResults]).slice(0, 100);
        elements.searchGrid.replaceChildren(...results.map((item) => createMediaCard(item)));
        const providerSummary = searchProviders.length
            ? ` from ${searchProviders.join(', ')}`
            : '';
        elements.searchSummary.textContent = results.length
            ? `${pluralize(results.length, 'matching title')}${providerSummary}`
            : 'No matching title was found in the loaded catalogs.';
        elements.searchEmpty.hidden = results.length > 0;
    }

    function showBrowseView(type) {
        const isMovie = type === 'movie';
        const items = dedupeSearchResults(
            allLoadedCatalogItems().filter((item) => mediaType(item) === (isMovie ? 'movie' : 'tv'))
        );
        state.browseGeneration += 1;
        state.browseType = type;
        state.browseItems = items;
        state.browseNextPage = 3;
        state.browseNextSkip = 100;
        state.browseLoading = false;
        state.browseExhausted = false;
        state.browseEmptyPages = 0;
        setView('search');
        elements.searchTitle.textContent = isMovie ? 'Browse movies' : 'Browse series';
        elements.browseToolbar.hidden = false;
        elements.browseLoader.hidden = false;
        renderBrowseItems();
        history.replaceState(null, '', isMovie ? '/movies/' : '/series/');
    }

    function leaveBrowseMode() {
        state.browseGeneration += 1;
        state.browseType = null;
        state.browseItems = [];
        state.browseLoading = false;
        elements.browseToolbar.hidden = true;
        elements.browseLoader.hidden = true;
        elements.searchGrid.classList.remove('browse-grid');
    }

    function sortedBrowseItems() {
        const items = [...state.browseItems];
        const sort = elements.browseSort.value;
        if (sort === 'rating') return sortByRating(items);
        if (sort === 'latest') return sortByLatest(items);
        if (sort === 'title') return items.sort((left, right) => mediaTitle(left).localeCompare(mediaTitle(right)));
        return items.sort((left, right) => Number(right.popularity || 0) - Number(left.popularity || 0));
    }

    function renderBrowseItems() {
        if (!state.browseType) return;
        const items = sortedBrowseItems();
        const noun = state.browseType === 'movie' ? 'movies' : 'series';
        elements.searchGrid.classList.add('browse-grid');
        elements.searchGrid.replaceChildren(...items.map((item) => createMediaCard(item)));
        elements.searchEmpty.hidden = items.length > 0;
        elements.searchSummary.textContent = state.browseExhausted
            ? `${items.length} ${noun} loaded · end of the current catalog`
            : `${items.length} ${noun} loaded · more appear as you scroll`;
        updateBrowseLoader();
    }

    function updateBrowseLoader(errorMessage = '') {
        if (!state.browseType) return;
        elements.browseLoader.hidden = false;
        elements.browseLoader.classList.toggle('is-loading', state.browseLoading);
        elements.browseLoader.classList.toggle('is-complete', state.browseExhausted);
        elements.browseLoaderTitle.textContent = errorMessage
            ? 'More titles could not be loaded'
            : state.browseExhausted
                ? 'You’re all caught up'
                : state.browseLoading ? 'Loading more titles' : 'Keep scrolling';
        elements.browseLoaderNote.textContent = errorMessage || (state.browseExhausted
            ? 'This is the end of the currently connected public catalog.'
            : 'More results appear automatically as you scroll.');
        elements.browseLoadMore.hidden = state.browseLoading || state.browseExhausted;
        elements.browseLoadMore.disabled = state.browseLoading;
    }

    async function loadMoreBrowse() {
        if (!state.browseType || state.activeView !== 'search' || state.browseLoading || state.browseExhausted) return;
        const generation = state.browseGeneration;
        const type = state.browseType;
        let loadError = '';
        state.browseLoading = true;
        updateBrowseLoader();
        try {
            let incoming;
            if (state.tmdbConfigured) {
                const endpoint = type === 'movie' ? 'movies' : 'tv';
                const data = await api(`/api/tmdb/discover/${endpoint}?page=${state.browseNextPage}`);
                state.browseNextPage += 1;
                incoming = normalizeCollection(data.results, type);
            } else {
                const addonType = type === 'movie' ? 'movie' : 'series';
                const data = await api(`/api/addons/catalog/org.cvmturan.discovery/${addonType}/top?skip=${state.browseNextSkip}`);
                state.browseNextSkip += 100;
                incoming = normalizeLiveCatalog(data, {
                    addon: { id: 'org.cvmturan.discovery', name: 'TShow Discovery' },
                    catalog: { id: 'top', name: type === 'movie' ? 'Popular movies' : 'Popular series' },
                    type: addonType
                });
            }
            if (generation !== state.browseGeneration || type !== state.browseType) return;
            const previousCount = state.browseItems.length;
            state.browseItems = dedupeSearchResults([...state.browseItems, ...incoming]);
            const added = state.browseItems.length - previousCount;
            state.browseEmptyPages = added ? 0 : state.browseEmptyPages + 1;
            state.browseExhausted = incoming.length === 0 || state.browseEmptyPages >= 2 || state.browseItems.length >= 1200;
            renderBrowseItems();
        } catch (error) {
            loadError = error.message || 'Try again in a moment.';
        } finally {
            if (generation === state.browseGeneration) {
                state.browseLoading = false;
                updateBrowseLoader(loadError);
            }
        }
    }

    function showCollectionView(collectionName) {
        const collections = {
            trending: ['Trending now', state.trending],
            movies: ['Popular movies', state.movies],
            latestMovies: ['Latest movies', state.latestMovies],
            topMovies: ['Top-rated movies', state.topMovies],
            series: ['Popular series', state.series],
            topSeries: ['Top-rated series', state.topSeries],
            airingToday: ['Airing today', state.airingToday]
        };
        const [title, items] = collections[collectionName] || ['Browse', []];
        const results = dedupeSearchResults(items);
        leaveBrowseMode();
        setView('search');
        elements.searchTitle.textContent = title;
        elements.searchSummary.textContent = pluralize(results.length, 'title');
        elements.searchGrid.replaceChildren(...results.map((item) => createMediaCard(item)));
        elements.searchEmpty.hidden = results.length > 0;
    }

    function allLoadedCatalogItems() {
        return [
            ...state.movies,
            ...state.series,
            ...state.trending,
            ...state.latestMovies,
            ...state.topMovies,
            ...state.topSeries,
            ...state.airingToday,
            ...state.addonCatalogs.flatMap((catalog) => catalog.items || []),
            ...state.watchlist.map((item) => normalizeMedia(item))
        ].filter(Boolean);
    }

    function searchLoadedCatalogs(query) {
        const needle = query.toLocaleLowerCase();
        return allLoadedCatalogItems()
            .map((item) => {
                const title = mediaTitle(item).toLocaleLowerCase();
                const metadata = [
                    item.overview,
                    item._sourceAddonName,
                    item._catalogName,
                    ...(Array.isArray(item._genres) ? item._genres : [])
                ].join(' ').toLocaleLowerCase();
                let score = Number.POSITIVE_INFINITY;
                if (title === needle) score = 0;
                else if (title.startsWith(needle)) score = 1;
                else if (title.includes(needle)) score = 2;
                else if (metadata.includes(needle)) score = 3;
                return { item, score };
            })
            .filter((entry) => Number.isFinite(entry.score))
            .sort((left, right) =>
                left.score - right.score ||
                mediaTitle(left.item).localeCompare(mediaTitle(right.item))
            )
            .map((entry) => entry.item);
    }

    function dedupeSearchResults(items) {
        const seen = new Set();
        return items.filter((item) => {
            const identity = item._stremioId || item.imdb_id || item.id;
            const key = `${mediaType(item)}:${identity}`;
            if (!identity || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function renderGridLoading(container, count) {
        const items = Array.from({ length: count }, () => {
            const skeleton = makeElement('div', 'skeleton-card');
            skeleton.append(makeElement('div', 'poster-frame'), makeElement('div', 'skeleton-line'));
            return skeleton;
        });
        container.replaceChildren(...items);
    }

    function setView(view) {
        if (!view) return;
        const panel = document.querySelector(`[data-view-panel="${view}"]`);
        if (!panel) return;

        if (state.titlePageActive) {
            state.titlePageActive = false;
            state.detailsRequest = (state.detailsRequest || 0) + 1;
            elements.titleDetailView.hidden = true;
            document.title = 'TShow · Movies, series and trailers';
        }

        document.querySelectorAll('[data-view-panel]').forEach((candidate) => {
            candidate.hidden = candidate !== panel;
        });
        document.querySelectorAll('.nav-link').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.view === view);
        });

        state.activeView = view;
        if (view !== 'search') leaveBrowseMode();
        if (view !== 'search') history.replaceState(null, '', view === 'home' ? '/' : `/?view=${encodeURIComponent(view)}`);
        updateIndexingForView(view);
        if (view === 'list') renderWatchlist();
        if (view === 'explore') loadExplore();
        if (view === 'addons') loadAddons({ quiet: true });
        if (view === 'calendar') renderCalendar();
        if (view === 'history') renderHistory();
        if (view === 'settings') elements.regionSelect.value = state.region;
        window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }

    function updateIndexingForView(view) {
        const privateViews = new Set(['list', 'calendar', 'history', 'addons', 'settings', 'help']);
        const robots = document.querySelector('meta[name="robots"]');
        if (robots) robots.content = privateViews.has(view)
            ? 'noindex, nofollow, noarchive'
            : 'index, follow, max-image-preview:large';
    }

    async function loadExplore() {
        if (state.exploreItems.length) {
            renderExplore();
            return;
        }
        try {
            const response = await fetch('/data/editorial.json', { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('Editorial feed unavailable');
            const data = await response.json();
            state.exploreItems = Array.isArray(data.items) ? data.items : [];
            renderExplore();
        } catch {
            elements.exploreGrid.replaceChildren();
            const message = makeElement('div', 'empty-state');
            message.append(makeElement('h2', '', 'Stories are taking a short break'), makeElement('p', '', 'Movie discovery and your private features still work normally.'));
            elements.exploreGrid.append(message);
        }
    }

    function renderExplore() {
        document.querySelectorAll('[data-explore-filter]').forEach((button) => {
            const active = button.dataset.exploreFilter === state.exploreFilter;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        const items = state.exploreFilter === 'all'
            ? state.exploreItems
            : state.exploreItems.filter((item) => item.type === state.exploreFilter);
        const cards = items.map((item, index) => {
            const card = makeElement('article', `explore-card${index === 0 && state.exploreFilter === 'all' ? ' explore-card-featured' : ''}`);
            const label = makeElement('p', 'explore-card-label', item.label || item.type);
            const title = makeElement('h2');
            const link = makeElement('a', '', item.title || 'TShow story');
            link.href = `/news/${encodeURIComponent(item.slug)}/`;
            title.append(link);
            const summary = makeElement('p', 'explore-card-summary', item.summary || '');
            const meta = makeElement('div', 'explore-card-meta');
            meta.append(makeElement('span', '', item.readTime || 'Quick read'), makeElement('span', '', formatEditorialDate(item.published)));
            card.append(label, title, summary, meta);
            return card;
        });
        elements.exploreGrid.replaceChildren(...cards);
        if (!cards.length) elements.exploreGrid.append(makeElement('p', 'explore-loading', 'New stories are being reviewed.'));
    }

    function formatEditorialDate(value) {
        const date = new Date(`${value || ''}T00:00:00Z`);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    }

    function getAddonCatalogDescriptors() {
        const descriptors = [];
        for (const addon of state.addons) {
            if (!addon?.isCustom) continue;
            if (!addon?.manifestURL || !Array.isArray(addon.catalogs)) continue;
            if (!Array.isArray(addon.resources) || !addon.resources.includes('catalog')) continue;
            for (const catalog of addon.catalogs) {
                const type = catalog?.type === 'series' ? 'series' : catalog?.type;
                if (!catalog?.id || !['movie', 'series'].includes(type)) continue;
                descriptors.push({
                    key: `${addon.id}:${type}:${catalog.id}`,
                    addon,
                    catalog,
                    type
                });
            }
        }
        return descriptors.slice(0, 16);
    }

    function addonCatalogSignature() {
        return getAddonCatalogDescriptors()
            .map((descriptor) => descriptor.key)
            .sort()
            .join('|');
    }

    async function loadAddonCatalogs({ force = false } = {}) {
        const descriptors = getAddonCatalogDescriptors();
        const generation = ++state.addonCatalogGeneration;
        state.addonCatalogs = [];

        if (!descriptors.length) {
            elements.addonCatalogsSection.hidden = true;
            elements.addonCatalogsContainer.replaceChildren();
            return;
        }

        elements.addonCatalogsSection.hidden = false;
        if (force) setButtonBusy(elements.refreshAddonCatalogs, true, 'Reloading…');

        const rows = new Map();
        const rowElements = descriptors.map((descriptor) => {
            const row = makeElement('article', 'addon-catalog-row');
            const heading = makeElement('div', 'addon-catalog-heading');
            const copy = makeElement('div');
            const typeLabel = descriptor.type === 'movie' ? 'Movies' : 'Series';
            copy.append(
                makeElement('h3', '', descriptor.catalog.name || typeLabel),
                makeElement('p', '', `${descriptor.addon.name} · ${typeLabel}`)
            );
            heading.append(copy);
            const rail = makeElement('div', 'media-rail');
            rail.setAttribute('aria-label', `${descriptor.catalog.name || typeLabel} from ${descriptor.addon.name}`);
            renderLoadingCards(rail, 6);
            row.append(heading, rail);
            rows.set(descriptor.key, rail);
            return row;
        });
        elements.addonCatalogsContainer.replaceChildren(...rowElements);

        try {
            await runWithConcurrency(descriptors, 3, async (descriptor) => {
                const rail = rows.get(descriptor.key);
                try {
                    const data = await api(
                        `/api/addons/catalog/${encodeURIComponent(descriptor.addon.id)}/${encodeURIComponent(descriptor.type)}/${encodeURIComponent(descriptor.catalog.id)}`
                    );
                    if (generation !== state.addonCatalogGeneration) return;
                    const metas = Array.isArray(data?.metas)
                        ? data.metas
                        : Array.isArray(data?.results)
                            ? data.results
                            : [];
                    const items = uniqueMedia(
                        metas
                            .map((meta) => normalizeAddonMeta(meta, descriptor))
                            .filter(Boolean)
                    );
                    state.addonCatalogs.push({ ...descriptor, items });
                    if (items.length) {
                        renderRail(rail, items);
                    } else {
                        rail.replaceChildren(makeElement(
                            'p',
                            'catalog-row-error',
                            'This add-on returned no titles for this row.'
                        ));
                    }
                } catch (error) {
                    if (generation !== state.addonCatalogGeneration) return;
                    rail.replaceChildren(makeElement(
                        'p',
                        'catalog-row-error',
                        error.message || 'This catalog could not be loaded.'
                    ));
                }
            });
        } finally {
            const catalogOrder = new Map(
                descriptors.map((descriptor, index) => [descriptor.key, index])
            );
            state.addonCatalogs.sort((left, right) =>
                (catalogOrder.get(left.key) ?? 999) - (catalogOrder.get(right.key) ?? 999)
            );
            if (force && generation === state.addonCatalogGeneration) {
                setButtonBusy(elements.refreshAddonCatalogs, false, 'Reload catalogs');
            }
        }
    }

    async function runWithConcurrency(items, limit, worker) {
        let nextIndex = 0;
        const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (nextIndex < items.length) {
                const index = nextIndex;
                nextIndex += 1;
                await worker(items[index], index);
            }
        });
        await Promise.all(runners);
    }

    async function loadAddons({ quiet = false } = {}) {
        try {
            const data = await api('/api/addons');
            state.addons = Array.isArray(data.addons) ? data.addons : [];
            renderAddons();
            const signature = addonCatalogSignature();
            if (signature !== state.addonCatalogSignature) {
                state.addonCatalogSignature = signature;
                state.addonCatalogLoadPromise = loadAddonCatalogs({ force: true });
            }
        } catch (error) {
            if (!quiet) showToast(error.message || 'Could not load add-ons.', 'error');
        }
    }

    async function initializeAddons() {
        try {
            const result = await syncStoredAddons();
            if (result.errors?.length) {
                showToast(
                    `${result.errors.length} saved add-on${result.errors.length === 1 ? '' : 's'} could not be restored yet.`,
                    'warning'
                );
            }
        } catch (error) {
            showToast(error.message || 'Saved add-ons could not be restored.', 'warning');
        }
        await loadAddons({ quiet: true });
    }

    async function syncStoredAddons() {
        const result = await api('/api/addons/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manifestURLs: state.addonURLs })
        }, { skipAddonSync: true });
        state.lastAddonSync = Date.now();
        return result;
    }

    function saveAddonURLs() {
        saveStored(STORAGE_KEYS.addonURLs, JSON.stringify(state.addonURLs));
    }

    function rememberAddon(manifest, previousAddon) {
        const previousURL = previousAddon?.isCustom ? previousAddon.manifestURL : null;
        const nextURL = manifest?.manifestURL;
        if (!nextURL) return;
        state.addonURLs = state.addonURLs
            .filter((url) => url !== previousURL && url !== nextURL);
        state.addonURLs.push(nextURL);
        state.addonURLs = state.addonURLs.slice(-20);
        saveAddonURLs();
    }

    function forgetAddon(addon) {
        state.addonURLs = state.addonURLs.filter((url) => url !== addon.manifestURL);
        saveAddonURLs();
    }

    function renderAddons() {
        const count = state.addons.filter((addon) => addon.isCustom).length;
        elements.addonCount.textContent = pluralize(count, 'private add-on');

        const visibleAddons = state.addons.filter((addon) => {
            const resources = new Set((addon.resources || []).map((resource) => String(resource).toLowerCase()));
            const filterMatches = state.addonFilter === 'all' ||
                (state.addonFilter === 'custom' && addon.isCustom) ||
                (state.addonFilter === 'catalog' && (resources.has('catalog') || addon.catalogs?.length)) ||
                (state.addonFilter === 'stream' && resources.has('stream')) ||
                (state.addonFilter === 'subtitles' && resources.has('subtitles'));
            return filterMatches;
        });

        const cards = visibleAddons.map((addon) => {
            const card = makeElement('article', 'addon-card');
            const capability = addonCapability(addon);
            const configurationRequired = addon.behaviorHints?.configurationRequired === true;
            if (configurationRequired) card.classList.add('requires-configuration');
            const initials = String(addon.name || 'A')
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join('')
                .toUpperCase();
            const icon = makeElement('div', 'addon-icon', initials);
            const logoURL = imageURL(addon.logo, 'original');
            if (logoURL) {
                const image = document.createElement('img');
                image.src = logoURL;
                image.alt = '';
                image.loading = 'lazy';
                icon.replaceChildren(image);
            }

            const copy = makeElement('div', 'addon-copy');
            const topLine = makeElement('div', 'addon-topline');
            topLine.append(
                makeElement('h3', '', addon.name || addon.id),
                makeElement(
                    'span',
                    `source-chip capability-chip ${capability.className}`,
                    capability.label
                )
            );
            copy.append(
                topLine,
                makeElement('p', 'addon-description', addon.description || 'No description provided.')
            );

            const resources = makeElement('div', 'resource-list');
            (addon.resources || []).slice(0, 8).forEach((resource) => {
                resources.append(makeElement('span', 'resource-chip', resource));
            });
            copy.append(resources);

            if (configurationRequired) {
                const warning = makeElement('div', 'addon-configuration-warning');
                warning.setAttribute('role', 'note');
                warning.append(
                    makeElement('span', 'addon-warning-icon', '!'),
                    makeElement(
                        'span',
                        '',
                        'Configuration required. Finish this add-on\'s setup before its catalog or playback can work.'
                    )
                );
                copy.append(warning);
            }

            const footer = makeElement('div', 'addon-card-footer');
            footer.append(makeElement(
                'span',
                '',
                `${addon.isCustom ? 'Your add-on' : 'TShow verified'} · ${addon.id} · v${addon.version || '1.0.0'}`
            ));

            if (addon.isRemovable) {
                if (isConfigurableAddon(addon)) {
                    const configure = makeElement('button', 'remove-addon', 'Configure');
                    configure.type = 'button';
                    configure.title = "Open this add-on's configuration page";
                    configure.addEventListener('click', () => openAddonConfiguration(addon));
                    footer.append(configure);
                }
                const edit = makeElement('button', 'remove-addon', 'Edit');
                edit.type = 'button';
                edit.title = 'Replace this add-on with a different manifest URL';
                edit.addEventListener('click', () => beginAddonEdit(addon));
                const remove = makeElement('button', 'remove-addon', 'Remove');
                remove.type = 'button';
                remove.addEventListener('click', () => removeAddon(addon));
                footer.append(edit, remove);
            } else if (isConfigurableAddon(addon)) {
                const configure = makeElement('button', 'remove-addon', 'Configure');
                configure.type = 'button';
                configure.title = "Open this add-on's configuration page";
                configure.addEventListener('click', () => openAddonConfiguration(addon));
                footer.append(configure);
                footer.append(makeElement('span', '', 'Protected'));
            } else {
                footer.append(makeElement('span', '', 'Protected'));
            }

            card.append(icon, copy, footer);
            return card;
        });

        elements.addonGrid.replaceChildren(...(cards.length
            ? cards
            : [makeElement('p', 'addon-empty', 'No add-ons match this filter.')]
        ));
    }

    function addonCapability(addon) {
        const resources = new Set(
            (Array.isArray(addon?.resources) ? addon.resources : [])
                .map((resource) => String(resource || '').toLowerCase())
        );
        const hasCatalog = resources.has('catalog') || Boolean(addon?.catalogs?.length);
        const hasPlayback = resources.has('stream');

        if (hasCatalog && hasPlayback) {
            return { label: 'Catalog + playback', className: 'catalog-playback' };
        }
        if (hasCatalog) {
            return { label: 'Catalog only', className: 'catalog-only' };
        }
        if (hasPlayback) {
            return { label: 'Stream provider only', className: 'stream-only' };
        }
        return { label: 'Metadata/support', className: 'metadata-only' };
    }

    function isConfigurableAddon(addon) {
        const hints = addon?.behaviorHints || {};
        return hints.configurationRequired === true ||
            hints.configurable === true ||
            (Array.isArray(hints.configurable) && hints.configurable.length > 0);
    }

    function addonConfigureURL(manifestURL) {
        try {
            const url = new URL(manifestURL);
            if (!/\/manifest\.json$/i.test(url.pathname)) return null;
            url.pathname = url.pathname.replace(/\/manifest\.json$/i, '/configure');
            return url.toString();
        } catch {
            return null;
        }
    }

    function openAddonConfiguration(addon) {
        const target = addon.manifestURL ? addonConfigureURL(addon.manifestURL) : null;
        if (!target) {
            showToast('This add-on does not expose a configuration page.', 'warning');
            return;
        }
        window.open(target, '_blank', 'noopener');
    }

    function beginAddonEdit(addon) {
        state.editingAddonId = addon.id;
        elements.manifestUrl.value = addon.manifestURL || '';
        elements.installAddonButton.textContent = 'Update';
        elements.addonForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        elements.manifestUrl.focus();
        showToast(`Editing “${addon.name}”. Paste a new manifest URL and press Update, or clear the field to cancel.`);
    }

    function cancelAddonEdit() {
        state.editingAddonId = null;
        elements.installAddonButton.textContent = 'Install';
    }

    async function installAddon(event) {
        event.preventDefault();
        const manifestURL = elements.manifestUrl.value.trim();
        if (!manifestURL) {
            if (state.editingAddonId) cancelAddonEdit();
            return;
        }
        const isUpdate = Boolean(state.editingAddonId);
        const previousAddon = state.addons.find((addon) =>
            addon.id === state.editingAddonId || addon.manifestURL === manifestURL
        );

        setButtonBusy(elements.installAddonButton, true, isUpdate ? 'Updating…' : 'Installing…');
        try {
            const result = await api('/api/addons/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manifestURL })
            });
            rememberAddon(result.manifest, previousAddon || state.addons.find((addon) =>
                addon.id === result.manifest.id
            ));
            cancelAddonEdit();
            elements.addonForm.reset();
            await loadAddons({ quiet: true });
            const installedAddon = state.addons.find((addon) => addon.id === result.manifest.id) || result.manifest;
            const capability = addonCapability(installedAddon).label;
            const configurationRequired = installedAddon.behaviorHints?.configurationRequired === true;
            showToast(
                configurationRequired
                    ? `${result.manifest.name} was ${isUpdate ? 'updated' : 'installed'} as ${capability}, but configuration is still required.`
                    : `${result.manifest.name} was ${isUpdate ? 'updated' : 'installed'} as ${capability}.`,
                configurationRequired ? 'warning' : 'success'
            );
        } catch (error) {
            showToast(error.message || 'The add-on could not be installed.', 'error');
        } finally {
            setButtonBusy(elements.installAddonButton, false, state.editingAddonId ? 'Update' : 'Install');
        }
    }

    async function removeAddon(addon) {
        const confirmed = window.confirm(`Remove “${addon.name}” from TShow?`);
        if (!confirmed) return;

        try {
            await api(`/api/addons/${encodeURIComponent(addon.id)}`, { method: 'DELETE' });
            forgetAddon(addon);
            if (state.editingAddonId === addon.id) cancelAddonEdit();
            await loadAddons({ quiet: true });
            showToast(`${addon.name} was removed.`);
        } catch (error) {
            showToast(error.message || 'The add-on could not be removed.', 'error');
        }
    }

    async function refreshAddons() {
        setButtonBusy(elements.refreshAddons, true, 'Refreshing…');
        try {
            await window.TShowAccount?.refresh?.();
            state.addonURLs = loadStoredArray(STORAGE_KEYS.addonURLs)
                .filter(value => typeof value === 'string' && value.length <= 8192)
                .slice(0, 20);
            const result = await syncStoredAddons();
            state.addons = Array.isArray(result.addons) ? result.addons : [];
            renderAddons();
            state.addonCatalogSignature = addonCatalogSignature();
            state.addonCatalogLoadPromise = loadAddonCatalogs({ force: true });
            showToast('Add-on list refreshed.');
        } catch (error) {
            showToast(error.message || 'Could not refresh add-ons.', 'error');
        } finally {
            setButtonBusy(elements.refreshAddons, false, 'Refresh');
        }
    }

    async function api(path, options = {}, controls = {}) {
        const usesCustomAddons = /^\/api\/(?:streams\/|addons\/(?:search(?:\?|$)|(?:catalog|meta|streams)\/))/.test(path);
        if (
            !controls.skipAddonSync &&
            usesCustomAddons &&
            state.addonURLs.length &&
            Date.now() - state.lastAddonSync > 10 * 60 * 1000
        ) {
            await syncStoredAddons();
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 25_000);

        try {
            const response = await fetch(path, {
                ...options,
                signal: controller.signal,
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Cvm-Client-Id': addonClientId,
                    ...(options.headers || {})
                }
            });

            let data = {};
            const type = response.headers.get('content-type') || '';
            if (type.includes('application/json')) {
                data = await response.json();
            }

            if (!response.ok) {
                throw new Error(data.error || `Request failed with status ${response.status}`);
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('The request took too long. Please try again.');
            }
            throw error;
        } finally {
            window.clearTimeout(timer);
        }
    }

    function openDialog(dialog) {
        if (!dialog.open) dialog.showModal();
        updateDialogState();
    }

    function updateDialogState() {
        const anyOpen = elements.detailsDialog.open || elements.playerDialog.open;
        document.body.classList.toggle('is-dialog-open', anyOpen);
    }

    function showToast(message, type = 'success') {
        const toast = makeElement('div', `toast ${type}`);
        toast.append(
            makeElement('span', 'toast-dot'),
            makeElement('p', '', String(message || 'Done'))
        );
        elements.toastRegion.append(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));

        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => toast.remove(), 220);
        }, 4_200);
    }

    function setButtonBusy(button, busy, label) {
        button.disabled = busy;
        button.textContent = label;
    }

    function normalizeCollection(items, hint) {
        if (!Array.isArray(items)) return [];
        return uniqueMedia(
            items
                .filter((item) =>
                    item &&
                    typeof item === 'object' &&
                    item.id &&
                    item.media_type !== 'person'
                )
                .map((item) => normalizeMedia(item, hint))
                .filter((item) => ['movie', 'tv'].includes(mediaType(item)))
        );
    }

    function uniqueMedia(items) {
        const seen = new Set();
        return items.filter((item) => {
            const key = mediaKey(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function normalizeMedia(item, hint) {
        const inferred = hint || item.media_type || (item.title ? 'movie' : 'tv');
        return {
            ...item,
            media_type: inferred === 'series' ? 'tv' : inferred
        };
    }

    function normalizeAddonMeta(meta, descriptor = {}) {
        if (!meta || typeof meta !== 'object') return null;
        const id = String(meta.id || meta.imdb_id || '').trim();
        if (!id || id.length > 180) return null;

        const stremioType = meta.type || descriptor.type || 'movie';
        if (!['movie', 'series', 'tv'].includes(stremioType)) return null;
        const type = stremioType === 'series' ? 'tv' : stremioType;
        const title = String(meta.name || meta.title || 'Untitled').slice(0, 240);
        const dateText = String(
            meta.releaseInfo ||
            meta.year ||
            meta.released ||
            meta.release_date ||
            meta.first_air_date ||
            ''
        );
        const year = dateText.match(/\b(18|19|20|21)\d{2}\b/)?.[0] || '';
        const rating = Number.parseFloat(meta.imdbRating ?? meta.vote_average ?? 0);
        const genres = normalizeGenres(meta.genres || meta.genre);
        const addon = descriptor.addon || {};

        return normalizeMedia({
            id,
            imdb_id: meta.imdb_id || (/^tt\d+$/i.test(id) ? id : null),
            title: type === 'movie' ? title : null,
            name: type === 'tv' ? title : null,
            media_type: type,
            poster_path: meta.poster || meta.poster_path || null,
            backdrop_path: meta.background || meta.backdrop_path || null,
            overview: String(meta.description || meta.overview || '').slice(0, 3_000),
            release_date: type === 'movie' && year ? `${year}-01-01` : null,
            first_air_date: type === 'tv' && year ? `${year}-01-01` : null,
            vote_average: Number.isFinite(rating) ? rating : 0,
            imdb_rating: Number.isFinite(Number.parseFloat(meta.imdbRating))
                ? Number.parseFloat(meta.imdbRating)
                : null,
            original_language: meta.language || meta.original_language || null,
            _addonCatalog: true,
            _sourceAddonId: addon.id || meta._sourceAddonId || null,
            _sourceAddonName: addon.name || meta._sourceAddonName || 'Installed add-on',
            _catalogId: descriptor.catalog?.id || meta._catalogId || null,
            _catalogName: descriptor.catalog?.name || meta._catalogName || null,
            _stremioId: id,
            _stremioType: stremioType === 'tv' ? 'series' : stremioType,
            _tmdbId: meta.moviedb_id || meta.tmdb_id || meta._tmdbId || null,
            _genres: genres.map((genre) => genre.name),
            _trailers: Array.isArray(meta.trailerStreams)
                ? meta.trailerStreams
                : Array.isArray(meta.trailers)
                    ? meta.trailers
                    : [],
            _stremioVideos: Array.isArray(meta.videos) ? meta.videos : [],
            _runtime: meta.runtime || null,
            _behaviorHints: meta.behaviorHints || {}
        }, type);
    }

    function normalizeGenres(value) {
        const values = Array.isArray(value)
            ? value
            : typeof value === 'string'
                ? value.split(',')
                : [];
        return values
            .map((genre) => typeof genre === 'string' ? genre : genre?.name)
            .map((name) => String(name || '').trim())
            .filter(Boolean)
            .slice(0, 20)
            .map((name) => ({ name }));
    }

    function parseRuntimeMinutes(value) {
        if (Number.isFinite(Number(value)) && Number(value) > 0) {
            return Math.round(Number(value));
        }
        const text = String(value || '').toLowerCase();
        const hours = Number.parseInt(text.match(/(\d+)\s*h/)?.[1], 10) || 0;
        const minutes = Number.parseInt(text.match(/(\d+)\s*m/)?.[1], 10) || 0;
        if (hours || minutes) return hours * 60 + minutes;
        const firstNumber = Number.parseInt(text.match(/\d+/)?.[0], 10);
        return Number.isFinite(firstNumber) ? firstNumber : 0;
    }

    function serializeMedia(media) {
        return {
            id: media.id,
            imdb_id: media.imdb_id || null,
            title: media.title || null,
            name: media.name || null,
            media_type: mediaType(media),
            release_date: media.release_date || null,
            first_air_date: media.first_air_date || null,
            poster_path: media.poster_path || null,
            backdrop_path: media.backdrop_path || null,
            vote_average: Number(media.vote_average) || 0,
            imdb_rating: Number(media.imdb_rating) || null,
            overview: String(media.overview || '').slice(0, 1_500),
            original_language: media.original_language || null,
            _addonCatalog: Boolean(media._addonCatalog),
            _sourceAddonId: media._sourceAddonId || null,
            _sourceAddonName: media._sourceAddonName || null,
            _catalogId: media._catalogId || null,
            _catalogName: media._catalogName || null,
            _stremioId: media._stremioId || null,
            _stremioType: media._stremioType || null,
            _tmdbId: media._tmdbId || null,
            _genres: Array.isArray(media._genres) ? media._genres.slice(0, 20) : [],
            _trailers: Array.isArray(media._trailers) ? media._trailers.slice(0, 20) : [],
            _stremioVideos: Array.isArray(media._stremioVideos)
                ? media._stremioVideos.slice(0, 250).map((video) => ({
                    id: video.id,
                    title: video.title || video.name || null,
                    season: video.season,
                    episode: video.episode,
                    released: video.released || null
                }))
                : [],
            _runtime: media._runtime || null,
            _behaviorHints: media._behaviorHints || {}
        };
    }

    function mediaType(media) {
        if (media.media_type === 'movie') return 'movie';
        if (media.media_type === 'tv' || media.media_type === 'series') return 'tv';
        return media.title ? 'movie' : 'tv';
    }

    function mediaTitle(media) {
        return String(media.title || media.name || 'Untitled');
    }

    function mediaYear(media) {
        const date = media.release_date || media.first_air_date;
        return /^\d{4}/.test(String(date || '')) ? String(date).slice(0, 4) : '';
    }

    function mediaKey(media) {
        const provider = media._sourceAddonId ? `:${media._sourceAddonId}` : '';
        return `${mediaType(media)}:${media.id}${provider}`;
    }

    function formatRating(value) {
        const rating = Number(value);
        return Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : '';
    }

    function ratingSource(media) {
        return Number(media?.imdb_rating) > 0 ? 'IMDb' : 'TMDB';
    }

    function imageURL(path, size) {
        if (typeof path !== 'string') return null;
        if (/^\/[a-zA-Z0-9_./-]+$/.test(path)) {
            return `https://image.tmdb.org/t/p/${size}${path}`;
        }
        try {
            const url = new URL(path);
            return url.protocol === 'https:' ? url.href : null;
        } catch {
            return null;
        }
    }

    function isSafeWebURL(value) {
        try {
            const url = new URL(String(value || ''));
            return ['https:', 'http:'].includes(url.protocol);
        } catch {
            return false;
        }
    }

    function isSafeExternalAppURL(value) {
        try {
            const url = new URL(String(value || ''));
            if (url.protocol !== 'magnet:') return false;
            return /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(
                String(url.searchParams.get('xt') || '')
            );
        } catch {
            return false;
        }
    }

    function toggleSidebar() {
        const open = !document.body.classList.contains('sidebar-open');
        document.body.classList.toggle('sidebar-open', open);
        elements.menuButton.setAttribute('aria-expanded', String(open));
        elements.menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        elements.siteSidebar.setAttribute('aria-hidden', String(!open));
        elements.sidebarScrim.setAttribute('aria-hidden', String(!open));
        if (open) {
            window.requestAnimationFrame(() => {
                elements.siteSidebar.querySelector('.nav-link.is-active, .nav-link')?.focus({ preventScroll: true });
            });
        }
    }

    function closeSidebar() {
        document.body.classList.remove('sidebar-open');
        elements.menuButton.setAttribute('aria-expanded', 'false');
        elements.menuButton.setAttribute('aria-label', 'Open menu');
        elements.siteSidebar.setAttribute('aria-hidden', 'true');
        elements.sidebarScrim.setAttribute('aria-hidden', 'true');
    }

    function setupHeroScroll() {
        if (!elements.hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let scheduled = false;
        const update = () => {
            scheduled = false;
            const progress = Math.min(1, Math.max(0, window.scrollY / Math.max(1, elements.hero.offsetHeight * 0.72)));
            elements.hero.style.setProperty('--hero-scroll', progress.toFixed(3));
            const content = elements.hero.querySelector('.hero-content');
            if (content) {
                content.style.setProperty('transform', `translate3d(0, ${Math.round(progress * 58)}px, 0)`, 'important');
                content.style.setProperty('opacity', String(1 - progress * 0.92), 'important');
                content.style.setProperty('filter', `blur(${(progress * 2.2).toFixed(2)}px)`, 'important');
            }
            if (elements.heroArt) {
                elements.heroArt.style.transform = `translate3d(0, ${Math.round(progress * 28)}px, 0) scale(${(1.025 + progress * 0.055).toFixed(3)})`;
                elements.heroArt.style.opacity = String(0.76 - progress * 0.58);
            }
        };
        window.addEventListener('scroll', () => {
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });
        update();
    }

    function updateClock() {
        const now = new Date();
        const full = new Intl.DateTimeFormat(undefined, {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit'
        }).format(now);
        elements.headerClock.dateTime = now.toISOString();
        elements.headerClock.replaceChildren(
            makeElement('span', 'header-date', new Intl.DateTimeFormat(undefined, {
                weekday: 'short', day: 'numeric', month: 'short'
            }).format(now)),
            makeElement('span', 'header-time', new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit'
            }).format(now))
        );
        elements.headerClock.setAttribute('aria-label', full);
        elements.headerClock.title = full;
    }

    function registerPWA() {
        const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        elements.installAppButton.hidden = standalone;
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js?v=20260915-1').catch(() => {
                // The website remains fully usable if offline installation is unavailable.
            });
        }
    }

    async function installPWA() {
        closeSidebar();
        if (state.installPrompt) {
            state.installPrompt.prompt();
            await state.installPrompt.userChoice;
            state.installPrompt = null;
            return;
        }
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        showToast(
            isIOS
                ? 'In Safari, tap Share and then “Add to Home Screen”.'
                : 'Open your browser menu and choose “Install app” or “Add to Home screen”.',
            'warning'
        );
    }

    function exportBrowserData() {
        const payload = {
            version: 1,
            app: 'TShow',
            exportedAt: new Date().toISOString(),
            watchlist: state.watchlist.slice(0, 250),
            recentlyViewed: state.recentlyViewed.slice(0, 20),
            addonURLs: state.addonURLs.slice(0, 20)
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tshow-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
        showToast('Browser backup exported.');
    }

    async function importBrowserData(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > 1_000_000) {
            showToast('That backup is too large.', 'error');
            return;
        }
        try {
            const payload = JSON.parse(await file.text());
            if (payload?.app !== 'TShow' || payload?.version !== 1) {
                throw new Error('This is not a supported TShow backup.');
            }
            state.watchlist = Array.isArray(payload.watchlist) ? payload.watchlist.slice(0, 250) : [];
            state.recentlyViewed = Array.isArray(payload.recentlyViewed) ? uniqueHistory(payload.recentlyViewed).slice(0, 20) : [];
            state.addonURLs = Array.isArray(payload.addonURLs)
                ? payload.addonURLs.filter((value) => typeof value === 'string' && value.length <= 8192).slice(0, 20)
                : [];
            saveStored(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
            saveStored(STORAGE_KEYS.recentlyViewed, JSON.stringify(state.recentlyViewed));
            saveAddonURLs();
            updateListCount();
            renderRecentlyViewed();
            await syncStoredAddons();
            await loadAddons({ quiet: true });
            showToast('Backup restored in this browser.');
        } catch (error) {
            showToast(error.message || 'The backup could not be imported.', 'error');
        }
    }

    async function submitContactForm(event) {
        event.preventDefault();
        const formData = new FormData(elements.contactForm);
        const payload = {
            type: String(formData.get('type') || ''),
            name: String(formData.get('name') || ''),
            email: String(formData.get('email') || ''),
            message: String(formData.get('message') || ''),
            website: String(formData.get('website') || ''),
            consent: formData.get('consent') === 'on'
        };
        setButtonBusy(elements.contactSubmit, true, 'Sending…');
        elements.contactStatus.textContent = '';
        try {
            const result = await api('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (result.fallback === 'mailto') {
                const recipient = ({support:'support@showt.fun',feedback:'support@showt.fun',copyright:'copyright@showt.fun',security:'legal@showt.fun'})[payload.type] || 'support@showt.fun';
                const params = new URLSearchParams({
                    subject: result.subject || `[TShow ${payload.type}] Message from ${payload.name}`,
                    body: `${payload.message}\n\nFrom: ${payload.name} <${payload.email}>`
                });
                elements.contactStatus.textContent = result.message || 'Opening your email app…';
                window.location.href = `mailto:${encodeURIComponent(recipient)}?${params.toString()}`;
                showToast('Your email app is ready. Press Send there to finish.', 'success');
                return;
            }
            elements.contactForm.reset();
            elements.contactStatus.textContent = result.message || 'Your message was sent.';
            showToast('Message sent to TShow support.');
        } catch (error) {
            elements.contactStatus.textContent = error.message || 'The message could not be sent.';
            showToast(elements.contactStatus.textContent, 'error');
        } finally {
            setButtonBusy(elements.contactSubmit, false, 'Prepare email');
        }
    }

    function pluralize(count, singular) {
        const numeric = Number(count) || 0;
        if (singular === 'series') return `${numeric} series`;
        return `${numeric} ${singular}${numeric === 1 ? '' : 's'}`;
    }

    function makeElement(tag, className = '', text = null) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== null && text !== undefined) element.textContent = String(text);
        return element;
    }

    function toCamelCase(value) {
        return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }

    function loadStoredArray(key) {
        const value = loadStoredValue(key);
        return Array.isArray(value) ? value : [];
    }

    function loadStoredValue(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch {
            return null;
        }
    }

    function loadStoredRegion() {
        const saved = String(localStorage.getItem(STORAGE_KEYS.region) || '').toUpperCase();
        if (/^[A-Z]{2}$/.test(saved)) return saved;
        return String(navigator.language || '').match(/-([A-Z]{2})$/i)?.[1]?.toUpperCase() || 'IN';
    }

    function loadOrCreateAddonClientId() {
        const saved = String(localStorage.getItem(STORAGE_KEYS.addonClientId) || '').toLowerCase();
        if (/^[a-f0-9]{32}$/.test(saved)) return saved;

        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        const clientId = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
        saveStored(STORAGE_KEYS.addonClientId, clientId);
        return clientId;
    }
})();
