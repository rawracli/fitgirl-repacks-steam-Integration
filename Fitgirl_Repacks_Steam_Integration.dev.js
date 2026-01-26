// ==UserScript==
// @name         Fitgirl Repacks - Steam Integration
// @namespace    https://greasyfork.org/id/users/1217958
// @version      1.3
// @description  Adds Steam Store information (Reviews, Tags, System Requirements, Age Rating) directly to FitGirl Repacks game pages.
// @author       rawracli
// @match        https://fitgirl-repacks.site/*
// @icon         https://fitgirl-repacks.site/wp-content/uploads/2016/08/cropped-icon-32x32.jpg
// @grant        GM_xmlhttpRequest
// @connect      store.steampowered.com
// @license      GNU GPLv3
// ==/UserScript==

(function () {
    'use strict';

    const log = (msg, ...args) => console.log(`[FG-Steam] ${msg}`, ...args);

    // ==========================================
    // Core Logic: Checks and Initializers
    // ==========================================

    function run() {
        // Enforce Single Page Only
        const isSinglePage = document.body.classList.contains('single-post') ||
            // Local file check (simulated)
            (window.location.protocol === 'file:' && document.querySelector('h1.entry-title'));

        log("Is Single Page?", !!isSinglePage);

        if (!isSinglePage) {
            log("Not a single game page. Exiting.");
            return;
        }

        // 1. Try to find existing link or generate search term
        const existingLink = findExistingSteamLink();
        if (existingLink) {
            log("Direct link found:", existingLink);
            updateBasicLinks(existingLink);
            fetchSteamPage(existingLink);
        } else {
            const term = getSearchTerm();
            if (term) {
                log("Searching for term:", term);
                const placeholderUrl = 'https://store.steampowered.com/search/?term=' + encodeURIComponent(term);
                updateBasicLinks(placeholderUrl); // Fallback immediatly

                fetchSteamLinkBackground(term, (directUrl) => {
                    if (directUrl) {
                        updateBasicLinks(directUrl);
                        fetchSteamPage(directUrl); // Fetch full data
                    }
                });
            }
        }
    }

    // ==========================================
    // Helpers: URL & Content
    // ==========================================

    function getSearchTerm() {
        let term = "";
        const path = window.location.pathname;

        // 1. Try URL slug first
        if (path.length > 1 && !path.includes('index.php')) {
            term = path.replace(/^\/|\/$/g, '');
        }

        // 2. Fallback for local files or messy URLs
        if (!term || window.location.protocol === 'file:') {
            const h1 = document.querySelector('h1.entry-title');
            if (h1) {
                let raw = h1.textContent;
                // Remove common suffixes like " - Deluxe Edition", " + 5 DLCs"
                // FitGirl titles: "Game Name v1.0 + DLCs"
                term = raw.split(/ – | - |\+/)[0].trim();
                log("Extracted term from H1:", term);
            }
        }
        return term;
    }

    function findExistingSteamLink() {
        const steamLink = document.querySelector('a[href^="http://store.steampowered.com/app/"], a[href^="https://store.steampowered.com/app/"]');
        return steamLink ? steamLink.href : null;
    }

    function updateBasicLinks(url) {
        // Update Title Link
        const title = document.querySelector('h1.entry-title');
        if (title) {
            let link = title.querySelector('a');
            if (!link) {
                const inner = title.innerHTML;
                title.innerHTML = `<a href="${url}" target="_blank" title="Go to Steam">${inner}</a>`;
                link = title.querySelector('a');
            } else {
                link.href = url;
                link.target = "_blank";
            }
        }

        // Update Cover Image Link
        const content = document.querySelector('.entry-content');
        if (content) {
            const img = content.querySelector('img');
            if (img) {
                const parent = img.parentElement;
                if (parent.tagName === 'A') {
                    parent.href = url;
                    parent.target = "_blank";
                } else {
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = '_blank';
                    img.parentNode.insertBefore(a, img);
                    a.appendChild(img);
                }
            }
        }
    }

    // ==========================================
    // Fetching & Scraping
    // ==========================================

    function fetchSteamLinkBackground(term, callback) {
        if (typeof GM_xmlhttpRequest === 'undefined') { callback(null); return; }

        const searchUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(term)}&category1=998`;

        GM_xmlhttpRequest({
            method: "GET",
            url: searchUrl,
            onload: function (response) {
                if (response.status === 200) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, "text/html");
                    const firstResult = doc.querySelector('#search_resultsRows > a');
                    if (firstResult) {
                        log("Background search match:", firstResult.href);
                        callback(firstResult.href);
                    } else {
                        log("No Steam search results.");
                        callback(null);
                    }
                } else {
                    callback(null);
                }
            },
            onerror: () => callback(null)
        });
    }

    function fetchSteamPage(url) {
        log("Fetching Steam Page:", url);
        // Force cookie to bypass age check if possible (Steam often saves birthtime in cookie)
        // Note: GM_xmlhttpRequest manages cookies separately, hard to force without user interaction sometimes.

        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            headers: {
                "Cookie": "birthtime=568022401; lastagecheckage=1-0-1988; wants_mature_content=1"
            },
            onload: function (response) {
                if (response.status === 200) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, "text/html");
                    extractAndInject(doc);
                }
            }
        });
    }

    function extractAndInject(doc) {
        const data = {
            reviews: extractReviews(doc),
            tags: extractTags(doc),
            ageRating: extractAgeRating(doc),
            sysReqs: extractSysReqs(doc),
            metacritic: extractMetacritic(doc)
        };
        log("Extracted Data:", data);
        injectToFitGirl(data);
    }

    // --- Extractors ---

    function extractReviews(doc) {
        const reviews = Array.from(doc.querySelectorAll('.user_reviews_summary_row'));
        let targetRow = reviews.find(r => r.textContent.includes('All Reviews'));
        if (!targetRow) targetRow = reviews.find(r => r.textContent.includes('Recent Reviews'));

        if (targetRow) {
            const summary = targetRow.querySelector('.summary');
            if (summary) {
                // "Very Positive (1,234)" or "Mixed (123) - 61% of the..."
                // We want the text content, cleaned up
                let text = summary.textContent.replace(/\s+/g, ' ').trim();
                text = text.replace(/English Reviews\s*/i, '');

                // Remove the "All Reviews:" prefix if it got in somehow or just take the summary part
                // The structure is <div class="subtitle">...</div> <div class="summary">...</div>

                // The textContent of .summary includes "Very Positive (Count) - Description"
                return text;
            }
        }
        return null;
    }

    function extractTags(doc) {
        // .glance_tags.popular_tags a.app_tag
        const tags = Array.from(doc.querySelectorAll('.glance_tags.popular_tags .app_tag'))
            .map(t => t.textContent.trim())
            .filter(t => t !== '+');
        return tags;
    }

    function extractAgeRating(doc) {
        const rating = doc.querySelector('.shared_game_rating');
        return rating ? rating.outerHTML : null;
    }

    function extractMetacritic(doc) {
        const meta = doc.querySelector('#game_area_metascore');
        return meta ? meta.outerHTML : null;
    }

    function extractSysReqs(doc) {
        const container = doc.querySelector('.sysreq_contents');
        if (!container) return null;

        // Handle multiple OS tabs
        // Steam format: <div class="game_area_sys_req" data-os="win">
        let reqs = Array.from(container.querySelectorAll('.game_area_sys_req'));

        if (reqs.length === 0) {
            return container.innerHTML; // Fallback to raw if no specific blocks found
        }

        let html = '';
        reqs.forEach(req => {
            const os = req.getAttribute('data-os');
            let title = '';
            if (os === 'win') title = 'Windows System Requirements';
            else if (os === 'mac') title = 'macOS System Requirements';
            else if (os === 'linux') title = 'Linux / SteamOS System Requirements';

            // If we have a title, add it as H5
            if (title) {
                html += `<h5 class="sysreq-os-title" style="margin-bottom: 5px; margin-top: 15px; color: #66c0f4;">${title}</h5>`;
            }
            html += req.outerHTML;
        });

        return html;
    }

    // --- Injectors ---

    function injectToFitGirl(data) {
        const content = document.querySelector('.entry-content');
        if (!content) return;

        // 1. Inject Reviews (into .entry-meta)
        // Values: Date, Author, Comments. We want to add Steam Reviews there.
        const entryMeta = content.closest('article').querySelector('.entry-header .entry-meta');
        // Note: fitgirl has two .entry-meta. One above title (categories), one below (date/author).
        // The one below title usually has .entry-date or .byline children.

        const metaDivs = document.querySelectorAll('.entry-header .entry-meta');
        let targetMeta = null;
        for (let div of metaDivs) {
            if (div.querySelector('.entry-date') || div.querySelector('.byline')) {
                targetMeta = div;
                break;
            }
        }

        if (targetMeta && data.reviews) {
            const reviewSpan = document.createElement('span');
            reviewSpan.className = 'steam-reviews';
            const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="11" fill="currentColor" class="bi bi-star-fill" viewBox="0 0 16 16" style="margin-right: 1px;"><path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"></path></svg>`;

            reviewSpan.innerHTML = `${starSvg} ${data.reviews}`;
            targetMeta.appendChild(reviewSpan);
        }

        // 2. Inject Age Rating & Metacritic (Sidebar or after reviews)
        if (data.ageRating || data.metacritic) {
            // Fix some styles from Steam that might break and add Metacritic styles
            const style = document.createElement('style');
            style.textContent = `
                .shared_game_rating { display: flex; gap: 10px; font-family: Arial, sans-serif; color: #acb2b8; }
                .game_rating_icon img { width: 50px; }
                .game_rating_descriptors { font-size: 11px; }
                .descriptorText { margin: 0px; }

                /* Metacritic Styles */
                #game_area_metascore {
                    background-color: rgb(27, 40, 56);
                    border: 1px solid rgb(51, 51, 51);
                    display: inline-flex;
                    align-items: center;
                    padding-right: 10px;
                }
                #game_area_metascore .score {
                    font-size: 35px;
                    font-weight: bold;
                    color: #fff;
                    padding: 10px 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    box-sizing: border-box;
                    min-height: 52px;
                    min-width: 52px;
                }
                #game_area_metascore .score.high { background-color: #66cc33 !important; color: white !important; }
                #game_area_metascore .score.mixed { background-color: #ffcc33 !important; color: white !important; }
                #game_area_metascore .score.low { background-color: #ff3333 !important; color: white !important; }

                #game_area_metascore .logo {
                    background-image: url('https://store.fastly.steamstatic.com/public/images/v6/mc_logo_no_text.png');
                    background-repeat: no-repeat;
                    background-position: center;
                    background-size: contain;
                    width: 37px;
                    height: 37px;
                    margin-left: 10px;
                }

                #game_area_metascore .wordmark {
                    margin-left: 5px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    line-height: 1.1;
                }
                #game_area_metascore .metacritic {
                    color: #fff;
                    font-size: 26px;
                    font-weight: bold;
                }
                #game_area_metalink {
                     margin-top: -2px;
                }
                #game_area_metalink a {
                    color: #fff;
                    text-decoration: none;
                    opacity: 0.8;
                    font-size: 10px;
                }
                 #game_area_metalink a:hover {
                    text-decoration: underline;
                    opacity: 1;
                 }
            `;
            document.head.appendChild(style);

            const firstP = content.querySelector('p');
            if (firstP) {
                const combinedContainer = document.createElement('div');
                combinedContainer.style.marginTop = '10px';
                combinedContainer.style.display = 'flex';
                combinedContainer.style.gap = '15px';
                combinedContainer.style.flexWrap = 'wrap';
                combinedContainer.style.alignItems = 'flex-start';

                // Age Rating
                if (data.ageRating) {
                    const helperDiv = document.createElement('div');
                    helperDiv.innerHTML = data.ageRating;
                    const ratingRoot = helperDiv.querySelector('.shared_game_rating');
                    if (ratingRoot) {
                        const iconDiv = ratingRoot.querySelector('.game_rating_icon');
                        const agencyDiv = ratingRoot.querySelector('.game_rating_agency');
                        const descriptorsDiv = ratingRoot.querySelector('.game_rating_descriptors');
                        ratingRoot.innerHTML = '';

                        const detailsDiv = document.createElement('div');
                        detailsDiv.className = 'game_rating_details';
                        if (iconDiv) detailsDiv.appendChild(iconDiv);
                        ratingRoot.appendChild(detailsDiv);
                        if (agencyDiv) {
                            if (descriptorsDiv) agencyDiv.appendChild(descriptorsDiv);
                            ratingRoot.appendChild(agencyDiv);
                        }
                        ratingRoot.appendChild(document.createElement('br'));

                        const ageContainer = document.createElement('div');
                        ageContainer.style.border = '1px solid #333';
                        ageContainer.style.padding = '5px';
                        ageContainer.style.backgroundColor = '#1b2838';
                        ageContainer.style.display = 'inline-block';
                        ageContainer.appendChild(ratingRoot);

                        combinedContainer.appendChild(ageContainer);
                    }
                }

                // Metacritic
                if (data.metacritic) {
                    // Steam HTML structure:
                    /*
                       <div id="game_area_metascore">
                           <div class="score high">87</div>
                           <div class="logo"></div>
                           <div class="wordmark">
                               <span class="metacritic">metacritic</span>
                               <div id="game_area_metalink">
                                    <a href="...">Read Critic Reviews</a>
                                    <img src="https://store.fastly.steamstatic.com/public/images/ico/iconExternalLink.gif" border="0" align="bottom">
                               </div>
                           </div>
                       </div>
                    */

                    const metaContainer = document.createElement('div');
                    metaContainer.innerHTML = data.metacritic;
                    combinedContainer.appendChild(metaContainer);
                }

                if (combinedContainer.childNodes.length > 0) {
                    firstP.parentNode.insertBefore(combinedContainer, firstP.nextSibling);

                    // Cleanup
                    let nextElem = combinedContainer.nextElementSibling;
                    if (nextElem && nextElem.tagName === 'P') {
                        if (!nextElem.textContent.trim() || nextElem.innerHTML.includes('&nbsp;')) {
                            nextElem.remove();
                        }
                    }
                }
            }
        }

        // 3. Inject Tags
        // Locate "Genres/Tags: ..."
        if (data.tags && data.tags.length > 0) {
            const links = content.querySelectorAll('a');
            let tagsElement = null;

            // Heuristic: Find the text node "Genres/Tags:"
            const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
            while (walker.nextNode()) {
                if (walker.currentNode.textContent.includes('Genres/Tags:')) {
                    tagsElement = walker.currentNode.parentNode; // The <p> usually
                    break;
                }
            }

            if (tagsElement) {
                // Get existing tags to avoid duplicates
                const fullText = tagsElement.textContent.toLowerCase();

                // Count existing FitGirl tags (links in the tags line before Companies)
                const existingTagLinks = tagsElement.querySelectorAll('a[href*="/tag/"]');
                const existingTagCount = existingTagLinks.length;

                // Calculate how many Steam tags we can add (max 10 total)
                const maxSteamTags = Math.max(0, 10 - existingTagCount);

                const newTags = data.tags.filter(tag => {
                    // Check if tag already exists (case insensitive)
                    return !fullText.includes(tag.toLowerCase());
                });

                // Limit to remaining slots (10 - existing)
                const tagsToAdd = newTags.slice(0, maxSteamTags);

                if (tagsToAdd.length > 0) {
                    const steamTagsSpan = document.createElement('span');
                    steamTagsSpan.style.color = '#888';
                    steamTagsSpan.textContent = ', ' + tagsToAdd.join(', ');

                    // We need to append this after the existing tags.
                    const companyNode = Array.from(tagsElement.childNodes).find(n =>
                        n.textContent && (n.textContent.includes('Company:') || n.textContent.includes('Companies:'))
                    );

                    if (companyNode) {
                        // Try to insert before the <br> before Company
                        const prev = companyNode.previousSibling;
                        if (prev && prev.tagName === 'BR') {
                            tagsElement.insertBefore(steamTagsSpan, prev);
                        } else {
                            tagsElement.insertBefore(steamTagsSpan, companyNode);
                        }
                    } else {
                        // Fallback: append to end of paragraph if Company line not found
                        tagsElement.appendChild(steamTagsSpan);
                    }
                }
            }
        }

        // 4. Inject System Requirements Dropdown
        if (data.sysReqs) {
            // Create Sys Reqs SPOILER structure
            const newSpoiler = document.createElement('div');
            newSpoiler.className = 'su-spoiler su-spoiler-style-fancy su-spoiler-icon-plus';
            newSpoiler.setAttribute('data-scroll-offset', '0');

            newSpoiler.innerHTML = `
                <div class="su-spoiler-title" tabindex="0" role="button">
                    <span class="su-spoiler-icon"></span>System Requirements
                </div>
                <!-- Added steam-sys-reqs class here for styling context -->
                <div class="su-spoiler-content su-u-clearfix su-u-trim steam-sys-reqs">
                    ${data.sysReqs}
                </div>
            `;

            // Injection Logic: Try existing spoiler -> fallbacks
            const spoilers = content.querySelectorAll('.su-spoiler');
            let targetSpoiler = null;
            spoilers.forEach(s => {
                if (s.textContent.includes('Game Description')) targetSpoiler = s;
            });

            if (targetSpoiler) {
                targetSpoiler.parentNode.insertBefore(newSpoiler, targetSpoiler.nextSibling);
            } else {
                // FALLBACK REVISED: Repack Features (ul) > Screenshots (p) > Download Mirrors > End
                let injected = false;
                const findHeader = (text) => Array.from(content.querySelectorAll('h3, strong')).find(el => el.textContent.includes(text));

                // 1. Repack Features
                let elem = findHeader('Repack Features');
                if (elem) {
                    if (elem.tagName === 'STRONG') elem = elem.closest('p') || elem;
                    // Find next UL
                    let next = elem.nextElementSibling;
                    while (next) {
                        if (next.tagName === 'UL') {
                            next.parentNode.insertBefore(newSpoiler, next.nextSibling);
                            injected = true;
                            break;
                        }
                        // Stop if we hit safe-guard elements to avoid infinite scan
                        if (['H3', 'DIV'].includes(next.tagName) && next.textContent.trim().length > 5) break;
                        next = next.nextElementSibling;
                    }
                }

                // 2. Screenshots
                if (!injected) {
                    elem = findHeader('Screenshots');
                    if (elem) {
                        if (elem.tagName === 'STRONG') elem = elem.closest('p') || elem;
                        let next = elem.nextElementSibling;
                        if (next) {
                            next.parentNode.insertBefore(newSpoiler, next.nextSibling);
                            injected = true;
                        }
                    }
                }

                if (!injected) {
                    // 3. Fallback: Download Mirrors or End
                    const potentialHeaders = Array.from(content.querySelectorAll('h3, p strong, p'));
                    let fallback = null;

                    for (const el of potentialHeaders) {
                        if (el.textContent.includes('Download Mirrors') || el.textContent.includes('Selective Download')) {
                            // If it's a strong tag, get the parent P
                            fallback = (el.tagName === 'STRONG') ? el.closest('p') : el;
                            break;
                        }
                    }

                    if (fallback) {
                        fallback.parentNode.insertBefore(newSpoiler, fallback);
                    } else {
                        // Last resort: append to end of content
                        content.appendChild(newSpoiler);
                    }
                }
            }

            // slightly modified styles to handle OS titles + ensuring visibility
            const srStyle = document.createElement('style');
            srStyle.textContent = `
                /* Clean up potential junk from Steam HTML if any */
                .steam-sys-reqs br { display: none; }
                .steam-sys-reqs strong { color: #66c0f4; font-weight: normal; }

                .sysreq-os-title {
                    font-weight: bold;
                    border-bottom: 1px solid #333;
                    padding-bottom: 3px;
                }

                /* Layout for SysReqs columns */
                .steam-sys-reqs .game_area_sys_req {
                    display: block !important; /* Force visible */
                    margin-bottom: 15px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    padding-bottom: 10px;
                }
                .steam-sys-reqs .game_area_sys_req.active { display: block; }

                .steam-sys-reqs .game_area_sys_req_leftCol,
                .steam-sys-reqs .game_area_sys_req_rightCol {
                    float: left;
                    width: 48%;
                    margin-right: 2%;
                }

                .steam-sys-reqs ul { list-style: none; padding: 0; margin: 0; }
                .steam-sys-reqs ul.bb_ul { padding-left: 0; }
                .steam-sys-reqs li {
                    margin-bottom: 4px;
                    line-height: 1.4;
                    color: #acb2b8;
                    font-size: 12px;
                }

                /* Clearfix */
                .steam-sys-reqs::after, .steam-sys-reqs .game_area_sys_req::after {
                    content: ""; display: table; clear: both;
                }

                @media(max-width: 600px) {
                    .steam-sys-reqs .game_area_sys_req_leftCol,
                    .steam-sys-reqs .game_area_sys_req_rightCol {
                        float: none; width: 100%; margin-bottom: 10px;
                    }
                }
            `;
            document.head.appendChild(srStyle);
        }
    }

    run();
})();
