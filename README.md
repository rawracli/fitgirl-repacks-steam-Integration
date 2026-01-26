# Fitgirl Repacks - Steam Integration

**Enhance your FitGirl Repacks experience with real-time official data from the Steam Store!**

This script helps you see critical game details without having to open a new tab. All information is seamlessly integrated directly into the FitGirl page to match its original aesthetic.

## Key Features

- **Smart Linking**: Click the game title or cover image to go straight to its Steam Store page.
- **Steam Reviews**: View the game's overall rating (e.g., "Very Positive") directly at the top of the page.
- **Extra Tags**: Adds more comprehensive genre labels from Steam.
- **Age Rating**: Displays the age rating (PEGI/ESRB) complete with icons and descriptions if available.
- **System Requirements**: Shows official Minimum & Recommended specs from Steam in a clean, easy-to-read box below the game description.

## Installation

1. Install the [Violentmonkey](https://violentmonkey.github.io/get-it/) (or other userscript manager) extension for your browser.
2. [Install this script](https://update.greasyfork.org/scripts/563941/Fitgirl%20Repacks%20-%20Steam%20Integration.user.js)


## Technical Details

### Architecture
The script operates as a single-page application enhancer. It identifies game pages, fetches data from Steam, and updates the DOM to seamlessly integrate external information.

### Core Features
- **Dynamic Search & Link Generation**: If no direct Steam link exists, the script performs a category-filtered Steam search to find the correct application ID.
- **Data Injection**:
    - **Smart Linking**: Encapsulates the game title and cover image to point directly to the game's Steam page.
    - **Reviews**: Injects overall Steam review scores into the post metadata (entry-header).
    - **Tags**: Compares Steam's popular tags with FitGirl's existing tags, deduplicates them, and appends the top missing tags (capped at 10 total tags).
    - **Age Rating**: Dynamically rebuilds the PEGI/ESRB rating structure to match the FitGirl aesthetic, ensuring proper layout even when source HTML is complex.
    - **System Requirements**: Injects Steam system requirements into a clean, "spoiler" block positioned after the game description.

### Implementation Specifics
- **Security**: Uses `GM_xmlhttpRequest` to bypass Cross-Origin Resource Sharing (CORS) restrictions.
- **Bypass**: Includes age-verification cookies (`birthtime`, `lastagecheckage`) in headers to ensure mature content can be scraped without user intervention.
- **Optimization**: Minimal DOM footprints and efficient TreeWalker traversal for finding injection points.

## Project Structure
- `Fitgirl_Repacks_Steam_Integration.user.js`: The main userscript source.
- `Fitgirl_Repacks_Steam_Integration.dev.js` : Development version with comments and debug logs.

## Development
To contribute, ensure you follow the existing code style. The script is written in Vanilla JS (ES6+) for maximum compatibility and performance.

If you are working with the development file (`.dev.js`), make sure to run the conversion script **locally** to update the production file (`.user.js`) **if needed**:

```bash
node .github/scripts/convert_script.js
```

## License

This project is licensed under the [GNU GPLv3](LICENSE).

