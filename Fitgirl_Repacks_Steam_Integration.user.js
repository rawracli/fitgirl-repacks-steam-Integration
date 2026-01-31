// ==UserScript==
// @name         Fitgirl Repacks - Steam Integration
// @namespace    https://greasyfork.org/id/users/1217958
// @version      1.4
// @description  Adds Steam Store information (Reviews, Tags, System Requirements, Age Rating) directly to FitGirl Repacks.
// @author       rawracli
// @match        https://fitgirl-repacks.site/*
// @icon         https://fitgirl-repacks.site/wp-content/uploads/2016/08/cropped-icon-32x32.jpg
// @grant        GM_xmlhttpRequest
// @connect      store.steampowered.com
// @license      GNU GPLv3
// @downloadURL https://update.greasyfork.org/scripts/563941/Fitgirl%20Repacks%20-%20Steam%20Integration.user.js
// @updateURL https://update.greasyfork.org/scripts/563941/Fitgirl%20Repacks%20-%20Steam%20Integration.meta.js
// ==/UserScript==
(function () {
    'use strict';
    function run() {
        const articles = document.querySelectorAll('article.post');
        if (articles.length === 0) {
            return;
        }
        articles.forEach(article => {
            processArticle(article);
        });
    }
    function processArticle(article) {
        const titleElem = article.querySelector('.entry-title');
        if (titleElem) {
            const titleText = titleElem.innerText || titleElem.textContent;
            if (titleText.toLowerCase().includes('updates digest') || titleText.toLowerCase().includes('upcoming repacks')) {
                return;
            }
        }
        const existingLink = findExistingSteamLink(article);
        if (existingLink) {
            updateBasicLinks(article, existingLink);
            fetchSteamPage(existingLink, (data) => {
                data.steamUrl = existingLink;
                injectToFitGirl(article, data);
            });
        } else {
            const term = getSearchTerm(article);
            if (term) {
                fetchSteamLinkBackground(term, (directUrl) => {
                    if (directUrl) {
                        updateBasicLinks(article, directUrl);
                        fetchSteamPage(directUrl, (data) => {
                            data.steamUrl = directUrl;
                            injectToFitGirl(article, data);
                        }); // Fetch full data
                    }
                });
            }
        }
    }
    function getSearchTerm(article) {
        let term = "";
        const titleElem = article.querySelector('.entry-title');
        if (titleElem) {
            let raw = titleElem.innerText || titleElem.textContent; // innerText often formatted better
            raw = raw.replace(/FitGirl/i, "").replace(/Repack/i, "");
            term = raw.split(/ – | - | \+|:/)[0].trim();
            const suffixes = [
                "Ultimate Edition",
                "Digital Deluxe Edition",
                "Deluxe Edition",
                "GOTY Edition",
                "Game of the Year Edition",
                "Complete Edition",
                "Enhanced Edition",
                "Director's Cut"
            ];
            const regex = new RegExp(`(${suffixes.join('|')})`, 'gi');
            term = term.replace(regex, "").trim();
        }
        return term;
    }
    function findExistingSteamLink(article) {
        if (!article) return null;
        const steamLink = article.querySelector('a[href^="http://store.steampowered.com/app/"], a[href^="https://store.steampowered.com/app/"]');
        return steamLink ? steamLink.href : null;
    }
    function updateBasicLinks(article, url) {
        if (!article) return;
        const content = article.querySelector('.entry-content');
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
                    if (img.parentNode) {
                        img.parentNode.insertBefore(a, img);
                        a.appendChild(img);
                    }
                }
            }
        }
    }
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
                        callback(firstResult.href);
                    } else {
                        callback(null);
                    }
                } else {
                    callback(null);
                }
            },
            onerror: () => callback(null)
        });
    }
    function fetchSteamPage(url, callback) {
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
                    extractAndInject(doc, callback);
                }
            }
        });
    }
    function extractAndInject(doc, callback) {
        const data = {
            reviews: extractReviews(doc),
            tags: extractTags(doc),
            ageRating: extractAgeRating(doc),
            sysReqs: extractSysReqs(doc),
            metacritic: extractMetacritic(doc)
        };
        if (callback) callback(data);
    }
    function extractReviews(doc) {
        const reviews = Array.from(doc.querySelectorAll('.user_reviews_summary_row'));
        let targetRow = reviews.find(r => r.textContent.includes('All Reviews'));
        if (!targetRow) targetRow = reviews.find(r => r.textContent.includes('Recent Reviews'));
        if (targetRow) {
            const summary = targetRow.querySelector('.summary');
            if (summary) {
                let text = summary.textContent.replace(/\s+/g, ' ').trim();
                text = text.replace(/English Reviews\s*/i, '');
                const match = text.match(/^(.+?)\s+\(([\d,.]+)\)\s+-\s+(\d+%)\s+of/);
                if (match) {
                    text = `${match[1]} (${match[3]} OF ${match[2]})`;
                }
                return text;
            }
        }
        return null;
    }
    function extractTags(doc) {
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
        let reqs = Array.from(container.querySelectorAll('.game_area_sys_req'));
        if (reqs.length === 0) {
            return container.innerHTML;
        }
        let html = '';
        reqs.forEach(req => {
            const os = req.getAttribute('data-os');
            let title = '';
            if (os === 'win') title = 'Windows System Requirements';
            else if (os === 'mac') title = 'macOS System Requirements';
            else if (os === 'linux') title = 'Linux / SteamOS System Requirements';
            if (title) {
                html += `<h5 class="sysreq-os-title" style="margin-bottom: 5px; margin-top: 15px; color: #66c0f4;">${title}</h5>`;
            }
            html += req.outerHTML;
        });
        return html;
    }
    function injectToFitGirl(article, data) {
        const content = article.querySelector('.entry-content');
        if (!content) return;
        const metaDivs = article.querySelectorAll('.entry-header .entry-meta');
        let targetMeta = null;
        for (let div of metaDivs) {
            if (div.querySelector('.entry-date') || div.querySelector('.byline')) {
                targetMeta = div;
                break;
            }
        }
        if (targetMeta && data.reviews) {
            if (!targetMeta.querySelector('.steam-reviews')) {
                const reviewSpan = document.createElement('span');
                reviewSpan.className = 'steam-reviews';
                reviewSpan.style.marginLeft = '10px';
                const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="11" fill="currentColor" class="bi bi-star-fill" viewBox="0 0 16 16" style="margin-right: 1px;"><path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"></path></svg>`;
                reviewSpan.innerHTML = `${starSvg} ${data.reviews}`;
                targetMeta.appendChild(reviewSpan);
            }
        }
        if (!document.getElementById('steam-integration-styles')) {
            const style = document.createElement('style');
            style.id = 'steam-integration-styles';
            style.textContent = `
                .shared_game_rating { display: flex; gap: 10px; font-family: Arial, sans-serif; color: #acb2b8; }
                .game_rating_icon img { width: 50px; }
                .game_rating_descriptors { font-size: 11px; }
                .descriptorText { margin: 0px; }
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
        }
        if (data.ageRating || data.metacritic || data.steamUrl) {
            if (!content.querySelector('.steam-rating-meta-container')) {
                const firstP = content.querySelector('p');
                if (firstP) {
                    const combinedContainer = document.createElement('div');
                    combinedContainer.className = 'steam-rating-meta-container';
                    combinedContainer.style.marginTop = '10px';
                    combinedContainer.style.display = 'flex';
                    combinedContainer.style.gap = '15px';
                    combinedContainer.style.flexWrap = 'wrap';
                    combinedContainer.style.alignItems = 'flex-start';
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
                    if (data.metacritic) {
                        const metaContainer = document.createElement('div');
                        metaContainer.innerHTML = data.metacritic;
                        combinedContainer.appendChild(metaContainer);
                    }
                    if (combinedContainer.childNodes.length > 0) {
                        firstP.parentNode.insertBefore(combinedContainer, firstP.nextSibling);
                        let nextElem = combinedContainer.nextElementSibling;
                        if (nextElem && nextElem.tagName === 'P' && (!nextElem.textContent.trim() || nextElem.innerHTML.includes('&nbsp;'))) {
                            nextElem.remove();
                        }
                    }
                }
            }
        }
        if (data.tags && data.tags.length > 0) {
            let tagsElement = null;
            const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
            while (walker.nextNode()) {
                if (walker.currentNode.textContent.includes('Genres/Tags:')) {
                    tagsElement = walker.currentNode.parentNode;
                    break;
                }
            }
            if (tagsElement && !tagsElement.querySelector('.steam-tags-injected')) {
                const fullText = tagsElement.textContent.toLowerCase();
                const existingTagLinks = tagsElement.querySelectorAll('a[href*="/tag/"]');
                const existingTagCount = existingTagLinks.length;
                const maxSteamTags = Math.max(0, 10 - existingTagCount);
                const newTags = data.tags.filter(tag => !fullText.includes(tag.toLowerCase()));
                const tagsToAdd = newTags.slice(0, maxSteamTags);
                if (tagsToAdd.length > 0) {
                    const steamTagsSpan = document.createElement('span');
                    steamTagsSpan.className = 'steam-tags-injected';
                    steamTagsSpan.style.color = '#888';
                    steamTagsSpan.textContent = ', ' + tagsToAdd.join(', ');
                    const companyNode = Array.from(tagsElement.childNodes).find(n =>
                        n.textContent && (n.textContent.includes('Company:') || n.textContent.includes('Companies:'))
                    );
                    if (companyNode) {
                        const prev = companyNode.previousSibling;
                        if (prev && prev.tagName === 'BR') {
                            tagsElement.insertBefore(steamTagsSpan, prev);
                        } else {
                            tagsElement.insertBefore(steamTagsSpan, companyNode);
                        }
                    } else {
                        tagsElement.appendChild(steamTagsSpan);
                    }
                }
            }
        }
        if (data.sysReqs && !content.querySelector('.su-spoiler-steam-reqs')) {
            const newSpoiler = document.createElement('div');
            newSpoiler.className = 'su-spoiler su-spoiler-style-fancy su-spoiler-icon-plus su-spoiler-steam-reqs su-spoiler-closed';
            newSpoiler.setAttribute('data-scroll-offset', '0');
            newSpoiler.innerHTML = `
                <div class="su-spoiler-title" tabindex="0" role="button">
                    <span class="su-spoiler-icon"></span>System Requirements
                </div>
                <div class="su-spoiler-content su-u-clearfix su-u-trim steam-sys-reqs" style="display:none"> 
                    ${data.sysReqs}
                </div>
            `;
            newSpoiler.querySelector('.su-spoiler-title').addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const parent = this.parentNode;
                const content = parent.querySelector('.su-spoiler-content');
                if (parent.classList.contains('su-spoiler-closed')) {
                    parent.classList.remove('su-spoiler-closed');
                    content.style.display = 'block';
                } else {
                    parent.classList.add('su-spoiler-closed');
                    content.style.display = 'none';
                }
            });
            let injected = false;
            const findHeader = (text) => Array.from(content.querySelectorAll('h3, strong')).find(el => el.textContent.includes(text));
            let elem = findHeader('Repack Features');
            if (elem) {
                if (elem.tagName === 'STRONG') elem = elem.closest('p') || elem;
                let next = elem.nextElementSibling;
                while (next) {
                    if (next.tagName === 'UL') {
                        next.parentNode.insertBefore(newSpoiler, next.nextSibling);
                        injected = true;
                        break;
                    }
                    if (['H3', 'DIV'].includes(next.tagName) && next.textContent.trim().length > 5) break;
                    next = next.nextElementSibling;
                }
            }
            if (!injected) {
                const potentialHeaders = Array.from(content.querySelectorAll('h3, p strong, p'));
                let fallback = null;
                for (const el of potentialHeaders) {
                    if (el.textContent.includes('Download Mirrors') || el.textContent.includes('Selective Download') || el.textContent.includes('Screenshots')) {
                        fallback = (el.tagName === 'STRONG') ? el.closest('p') : el;
                        break;
                    }
                }
                if (fallback) {
                    fallback.parentNode.insertBefore(newSpoiler, fallback);
                } else {
                    content.appendChild(newSpoiler);
                }
            }
            if (!document.getElementById('steam-sysreqs-styles')) {
                const srStyle = document.createElement('style');
                srStyle.id = 'steam-sysreqs-styles';
                srStyle.textContent = `
                    .steam-sys-reqs br { display: none; }
                    .steam-sys-reqs strong { color: #66c0f4; font-weight: normal; }
                    .sysreq-os-title { font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 3px; }
                    .steam-sys-reqs .game_area_sys_req { display: block !important; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
                    .steam-sys-reqs .game_area_sys_req_leftCol, .steam-sys-reqs .game_area_sys_req_rightCol { float: left; width: 48%; margin-right: 2%; }
                    .steam-sys-reqs ul { list-style: none; padding: 0; margin: 0; }
                    .steam-sys-reqs li { margin-bottom: 4px; line-height: 1.4; color: #acb2b8; font-size: 12px; }
                    .steam-sys-reqs::after, .steam-sys-reqs .game_area_sys_req::after { content: ""; display: table; clear: both; }
                    @media(max-width: 600px) {
                        .steam-sys-reqs .game_area_sys_req_leftCol, .steam-sys-reqs .game_area_sys_req_rightCol { float: none; width: 100%; margin-bottom: 10px; }
                    }
                 `;
                document.head.appendChild(srStyle);
            }
        }
    }
    run();
})();
