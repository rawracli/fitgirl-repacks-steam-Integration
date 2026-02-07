// ==UserScript==
// @name         Fitgirl Repacks - Steam Integration
// @namespace    https://greasyfork.org/id/users/1217958
// @version      1.7
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
                let validationTitle = "";
                if (titleElem) {
                    let raw = titleElem.innerText || titleElem.textContent;
                    raw = raw.replace(/FitGirl/i, "").replace(/Repack/i, "");
                    validationTitle = raw.split(/ – | - | \+|,\s/)[0].trim();
                }
                fetchSteamLinkBackground(term, validationTitle, (directUrl) => {
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
        let url = "";
        const titleLink = article.querySelector('.entry-title a');
        if (titleLink) {
            url = titleLink.href;
        } else {
            url = window.location.href;
        }
        if (url) {
            url = url.split('#')[0];
            const parts = url.split('/').filter(p => p.length > 0);
            const slug = parts[parts.length - 1];
            term = slug.replace(/-/g, ' ');
        }
        return term;
    }
    function findExistingSteamLink(article) {
        if (!article) return null;
        const steamLink = article.querySelector('a[href^="http://store.steampowered.com/app/"], a[href^="https://store.steampowered.com/app/"]');
        return steamLink ? cleanSteamUrl(steamLink.href) : null;
    }
    function cleanSteamUrl(url) {
        if (!url) return null;
        let clean = url.split('?snr=')[0];
        if (clean.endsWith('/')) {
        }
        return clean;
    }
    function updateBasicLinks(article, url) {
        if (!article) return;
        url = cleanSteamUrl(url);
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
    function fetchSteamLinkBackground(term, validationTitle, callback) {
        if (typeof GM_xmlhttpRequest === 'undefined') { callback(null); return; }
        const searchUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(term)}&category1=998`;
        const retryOrFail = (reason) => {
            const words = term.split(' ');
            if (words.length > 1) {
                words.pop();
                const newTerm = words.join(' ');
                fetchSteamLinkBackground(newTerm, validationTitle, callback);
            } else {
                callback(null);
            }
        };
        GM_xmlhttpRequest({
            method: "GET",
            url: searchUrl,
            onload: function (response) {
                if (response.status === 200) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, "text/html");
                    const firstResult = doc.querySelector('#search_resultsRows > a');
                    if (firstResult) {
                        const extractedUrl = firstResult.href;
                        if (extractedUrl.includes('/_/')) {
                            retryOrFail("Bad URL");
                            return;
                        }
                        if (validationTitle) {
                            const steamTitleElem = firstResult.querySelector('.title');
                            if (steamTitleElem) {
                                const steamTitle = steamTitleElem.textContent.trim();
                                const normalize = (str) => str.toLowerCase().replace(/’/g, "'").replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
                                const sT = normalize(steamTitle);
                                const vT = normalize(validationTitle);
                                if (sT.includes(vT) || vT.includes(sT)) {
                                    callback(cleanSteamUrl(extractedUrl));
                                } else {
                                    retryOrFail("Validation Failed");
                                }
                            } else {
                                callback(cleanSteamUrl(extractedUrl));
                            }
                        } else {
                            callback(cleanSteamUrl(extractedUrl));
                        }
                    } else {
                        retryOrFail("No Results");
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
            description: extractDescription(doc),
            metacritic: extractMetacritic(doc)
        };
        if (callback) callback(data);
    }
    function extractDescription(doc) {
        const desc = doc.querySelector('#game_area_description');
        if (desc) {
            desc.querySelectorAll('h2').forEach(h => {
                if (h.textContent.trim().toLowerCase() === 'about this game') {
                    h.remove();
                }
            });
            desc.querySelectorAll('span.bb_img_ctn').forEach(el => el.remove());
            let html = desc.innerHTML.trim();
            html = html.replace(/(<\/li>|<\/ul>)\s*(<br\s*\/?>)+/gi, '$1');
            html = html.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
            return html;
        }
        return null;
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
            } else {
            }
            if (data.steamUrl) {
                const steamLinkSpan = document.createElement('span');
                steamLinkSpan.className = 'steam-store-link';
                steamLinkSpan.style.marginLeft = '10px';
                const steamSvg = `<svg fill="currentColor" viewBox="0 -2 28 28" xmlns="http://www.w3.org/2000/svg" width="15" height="15" style="margin-right: 4px; vertical-align: text-top;" data-darkreader-inline-fill=""><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="m24.72 7.094c0 2.105-1.707 3.812-3.812 3.812-1.053 0-2.006-.427-2.696-1.117-.74-.697-1.201-1.684-1.201-2.778 0-2.105 1.707-3.812 3.812-3.812 1.094 0 2.08.461 2.776 1.199l.002.002c.691.669 1.12 1.605 1.12 2.641v.055-.003zm-12.033 11.593c0-.004 0-.008 0-.012 0-2.151-1.744-3.894-3.894-3.894-.004 0-.008 0-.013 0h.001c-.299 0-.59.034-.87.099l.026-.005 1.625.656c.778.303 1.387.897 1.704 1.644l.007.02c.164.356.26.772.26 1.21 0 .418-.087.816-.244 1.176l.007-.019c-.304.778-.901 1.386-1.652 1.696l-.02.007c-.355.161-.77.254-1.206.254-.422 0-.824-.088-1.188-.246l.019.007q-.328-.125-.969-.383l-.953-.383c.337.627.82 1.138 1.405 1.498l.017.01c.568.358 1.258.571 1.999.571h.034-.002.012c2.151 0 3.894-1.744 3.894-3.894 0-.004 0-.008 0-.013v.001zm12.969-11.577c-.005-2.63-2.136-4.761-4.765-4.766-2.631.002-4.763 2.135-4.763 4.766s2.134 4.766 4.766 4.766c1.313 0 2.503-.531 3.364-1.391.863-.834 1.399-2.003 1.399-3.296 0-.028 0-.056-.001-.083zm2.344 0v.001c0 3.926-3.183 7.109-7.109 7.109h-.001l-6.828 4.981c-.116 1.361-.749 2.556-1.698 3.402l-.005.004c-.914.863-2.151 1.394-3.512 1.394-.023 0-.046 0-.069 0h.004c-2.534-.002-4.652-1.777-5.181-4.152l-.007-.035-3.594-1.438v-6.703l6.08 2.453c.758-.471 1.679-.75 2.664-.75h.041-.002q.203 0 .547.031l4.438-6.359c.05-3.898 3.218-7.04 7.122-7.047h.001c3.924.006 7.104 3.185 7.11 7.109v.001z"></path></g></svg>`;
                steamLinkSpan.innerHTML = `<a href="${data.steamUrl}" target="_blank" style="color: inherit; text-decoration: none;">${steamSvg}Go to Steam Page</a>`;
                targetMeta.appendChild(steamLinkSpan);
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
                #game_area_metascore .score.medium { background-color: #ffcc33 !important; color: white !important; }
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
                #game_area_metascore .metacritic { color: #fff; font-size: 26px; font-weight: bold; }
                #game_area_metalink { margin-top: -2px; }
                #game_area_metalink a { color: #fff; text-decoration: none; opacity: 0.8; font-size: 10px; }
                #game_area_metalink a:hover { text-decoration: underline; opacity: 1; }
                .steam-store-link a:hover { color: #66cc33 !important; }
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
                    combinedContainer.style.clear = 'both';
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
        let tagsElement = null;
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
        while (walker.nextNode()) {
            if (walker.currentNode.textContent.includes('Genres/Tags:')) {
                tagsElement = walker.currentNode.parentNode;
                break;
            }
        }
        if (tagsElement) {
            if (!tagsElement.querySelector('.steam-tags-injected') && data.tags && data.tags.length > 0) {
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
        } else {
            let companyNode = null;
            const walker2 = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
            while (walker2.nextNode()) {
                if (walker2.currentNode.textContent.includes('Company:') || walker2.currentNode.textContent.includes('Companies:')) {
                    companyNode = walker2.currentNode;
                    break;
                }
            }
            if (companyNode && data.tags && data.tags.length > 0) {
                const container = companyNode.parentNode;
                const spanGenre = document.createElement('span');
                spanGenre.textContent = 'Genres/Tags: ';
                const steamTagsStrong = document.createElement('strong');
                steamTagsStrong.className = 'steam-tags-injected'
                steamTagsStrong.innerHTML = data.tags.slice(0, 10).join(', '); // Inject up to 10 tags since none exist
                const br = document.createElement('br');
                container.insertBefore(spanGenre, companyNode);
                container.insertBefore(steamTagsStrong, companyNode);
                container.insertBefore(br, companyNode);
            }
        }
        const hasExistingSpoilerStyles = document.querySelector('.su-spoiler') !== null;
        const createSpoiler = (title, htmlContent, extraClass = '') => {
            const newSpoiler = document.createElement('div');
            newSpoiler.className = `su-spoiler su-spoiler-style-fancy su-spoiler-icon-plus su-spoiler-closed ${extraClass}`;
            newSpoiler.setAttribute('data-scroll-offset', '0');
            newSpoiler.innerHTML = `
                 <div class="su-spoiler-title" tabindex="0" role="button">
                     <span class="su-spoiler-icon"></span>${title}
                 </div>
                 <div class="su-spoiler-content su-u-clearfix su-u-trim steam-content-injected">
                     ${htmlContent}
                 </div>
             `;
            newSpoiler.querySelector('.su-spoiler-title').addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const parent = this.parentNode;
                parent.classList.toggle('su-spoiler-closed');
            });
            return newSpoiler;
        };
        const injectSpoilerSafe = (spoilerElem, afterElem = null) => {
            if (afterElem && afterElem.parentNode === content) {
                afterElem.parentNode.insertBefore(spoilerElem, afterElem.nextSibling);
                return true;
            }
            const findElement = (selector, textMatch) => {
                let els = Array.from(content.querySelectorAll(selector));
                if (textMatch) {
                    return els.find(el => el.textContent.includes(textMatch));
                }
                return els[0];
            };
            let repackHeader = Array.from(content.querySelectorAll('h3, strong')).find(el => el.textContent.includes('Repack Features'));
            if (repackHeader) {
                let next = (repackHeader.tagName === 'STRONG' ? repackHeader.closest('p') : repackHeader).nextElementSibling;
                while (next) {
                    if (next.tagName === 'UL') {
                        next.parentNode.insertBefore(spoilerElem, next.nextSibling);
                        return true;
                    }
                    if (next.tagName === 'H3' || (next.tagName === 'DIV' && next.classList.contains('su-spoiler'))) break; // Stop if hit next section
                    next = next.nextElementSibling;
                }
            }
            let screenshotsHeader = Array.from(content.querySelectorAll('h3, a, strong')).find(el => el.textContent.includes('Screenshots'));
            if (screenshotsHeader) {
                let current = screenshotsHeader.tagName === 'STRONG' ? screenshotsHeader.closest('p') : screenshotsHeader;
                if (current.tagName === 'A') current = current.closest('p') || current;
                let next = current.nextElementSibling;
                while (next) {
                    if (next.tagName === 'P' && next.querySelector('img')) {
                        current = next;
                        break;
                    }
                    if (next.tagName === 'H3' || (next.tagName === 'DIV' && (next.classList.contains('su-spoiler') || next.id === 'jp-post-flair'))) {
                        break;
                    }
                    next = next.nextElementSibling;
                }
                if (current && current.parentNode === content) {
                    current.parentNode.insertBefore(spoilerElem, current.nextSibling);
                    return true;
                }
            }
            let mirrorsHeader = Array.from(content.querySelectorAll('h3, strong')).find(el => el.textContent.includes('Download Mirrors') || el.textContent.includes('Selective Download'));
            if (mirrorsHeader) {
                let next = (mirrorsHeader.tagName === 'STRONG' ? mirrorsHeader.closest('p') : mirrorsHeader).nextElementSibling;
                while (next) {
                    if (next.tagName === 'UL') {
                        next.parentNode.insertBefore(spoilerElem, next.nextSibling);
                        return true;
                    }
                    if (next.tagName === 'H3') break;
                    next = next.nextElementSibling;
                }
            }
            content.appendChild(spoilerElem);
            return true;
        };
        let gameDescSpoiler = Array.from(content.querySelectorAll('.su-spoiler-title')).find(el => el.textContent.includes('Game Description'));
        if (gameDescSpoiler) gameDescSpoiler = gameDescSpoiler.closest('.su-spoiler');
        if (!gameDescSpoiler && data.description) {
            gameDescSpoiler = createSpoiler("Game Description", data.description, 'su-spoiler-steam-desc');
            injectSpoilerSafe(gameDescSpoiler);
        }
        if (data.sysReqs && !content.querySelector('.su-spoiler-steam-reqs')) {
            const reqSpoiler = createSpoiler("System Requirements", data.sysReqs, 'su-spoiler-steam-reqs');
            if (gameDescSpoiler) {
                gameDescSpoiler.parentNode.insertBefore(reqSpoiler, gameDescSpoiler.nextSibling);
            } else {
                injectSpoilerSafe(reqSpoiler);
            }
        }
        const stylesId = 'steam-integration-spoiler-styles';
        if (!document.getElementById(stylesId)) {
            let css = `
                    .su-spoiler-steam-reqs br { display: none; }
                    .su-spoiler-steam-reqs strong { color: #2388c3; font-weight: normal; }
                    .sysreq-os-title { font-weight: bold; border-bottom: 1px solid #333; padding-bottom: 3px; }
                    .su-spoiler-steam-reqs .game_area_sys_req { display: block !important; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; }
                    .su-spoiler-steam-reqs .game_area_sys_req_leftCol, .su-spoiler-steam-reqs .game_area_sys_req_rightCol { float: left; width: 48%; margin-right: 2%; }
                    .su-spoiler-steam-reqs ul { list-style: none; padding: 0; margin: 0; }
                    .su-spoiler-steam-reqs li { margin-bottom: 4px; line-height: 1.4; font-size: 13px; }
                    .su-spoiler-steam-reqs::after, .su-spoiler-steam-reqs .game_area_sys_req::after { content: ""; display: table; clear: both; }
                    @media(max-width: 600px) {
                        .su-spoiler-steam-reqs .game_area_sys_req_leftCol, .su-spoiler-steam-reqs .game_area_sys_req_rightCol { float: none; width: 100%; margin-bottom: 10px; }
                    }
             `;
            if (!hasExistingSpoilerStyles) {
                css += `
                    .su-spoiler { margin-bottom: 1.5em; }
                    .su-spoiler-title { position: relative; cursor: pointer; min-height: 20px; line-height: 20px; padding: 7px 7px 7px 34px; font-weight: 700; font-size: 13px; }
                    .su-spoiler-title:focus { outline: currentColor thin dotted; }
                    .su-spoiler-icon { position: absolute; left: 7px; top: 7px; display: block; width: 20px; height: 20px; line-height: 21px; text-align: center; font-size: 14px; font-family: sans-serif;  font-weight: 400; font-style: normal; }
                    .su-spoiler-content { padding: 14px; transition: padding-top .2s; }
                    .su-spoiler.su-spoiler-closed > .su-spoiler-content { height: 0; margin: 0; padding-top: 0; padding-bottom: 0; overflow: hidden; border: none; opacity: 0; pointer-events: none; }
                    .su-spoiler.su-spoiler-closed > .su-spoiler-content iframe { display: none; }                    
                    .su-spoiler-icon-plus .su-spoiler-icon:before { content: '+'; font-weight: bold; }
                    .su-spoiler-icon-plus .su-spoiler-icon:before { content: '-'; font-family: monospace; font-size: 18px; }
                    .su-spoiler-icon-plus.su-spoiler-closed .su-spoiler-icon:before { content: '+'; font-family: monospace; font-size: 18px; }
                    .su-spoiler-style-fancy { border: 1px solid #ccc; border-radius: 10px; background: #fff; color: #333; }
                    .su-spoiler-style-fancy > .su-spoiler-title { border-bottom: 1px solid #ccc; border-radius: 10px; background: #f0f0f0; font-size: .9em; }
                    .su-spoiler-style-fancy.su-spoiler-closed > .su-spoiler-title { border: none; }
                    .su-spoiler-style-fancy > .su-spoiler-content { border-radius: 10px; }
                    .su-accordion .su-spoiler { margin-bottom:.5em }
                 `;
            }
            const style = document.createElement('style');
            style.id = stylesId;
            style.textContent = css;
            document.head.appendChild(style);
        }
    }
    run();
})();