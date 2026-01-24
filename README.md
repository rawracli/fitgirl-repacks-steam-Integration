# Fitgirl Repacks - Steam Integration

A powerful Tampermonkey/Userscript that enhances [FitGirl Repacks](https://fitgirl-repacks.site/) by injecting real-time data from the Steam Store.

## Technical Details

### Architecture
The script operates as a single-page application enhancer. It identifies game pages, fetches data from Steam, and updates the DOM to seamlessly integrate external information.

### Core Features
- **Dynamic Search & Link Generation**: If no direct Steam link exists, the script performs a category-filtered Steam search to find the correct application ID.
- **Data Injection**:
    - **Reviews**: Injects overall Steam review scores into the post metadata (entry-header).
    - **Tags**: Compares Steam's popular tags with FitGirl's existing tags, deduplicates them, and appends the top missing tags (capped at 10 total tags).
    - **Age Rating**: Dynamically rebuilds the PEGI/ESRB rating structure to match the FitGirl aesthetic, ensuring proper layout even when source HTML is complex.
    - **System Requirements**: Injects Steam system requirements into a clean, permanently open "spoiler" block positioned after the game description.

### Implementation Specifics
- **Security**: Uses `GM_xmlhttpRequest` to bypass Cross-Origin Resource Sharing (CORS) restrictions.
- **Bypass**: Includes age-verification cookies (`birthtime`, `lastagecheckage`) in headers to ensure mature content can be scraped without user intervention.
- **Optimization**: Minimal DOM footprints and efficient TreeWalker traversal for finding injection points.

## Project Structure
- `Fitgirl-Repacks Direct Steam Link.js`: The main userscript source (minified/comment-free version is recommended for distribution).

## Development
To contribute, ensure you follow the existing code style. The script is written in Vanilla JS (ES6+) for maximum compatibility and performance.

---
**License**: MIT  
**Author**: rawracli
