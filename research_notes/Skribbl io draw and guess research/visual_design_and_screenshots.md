# Visual design and UI of skribbl.io (plus reference screenshots)

> Reference only, for designing an ORIGINAL pixel-art draw-and-guess game. Do not reuse skribbl.io's logo, art, avatar sprites or branding.

**How this was researched, and what was blocked.** This cloud session's network policy blocked skribbl.io, garticphone.com, gartic.io, drawasaurus.org, en.wikipedia.org, web.archive.org, i.imgur.com, i.ytimg.com, play-lh.googleusercontent.com and Google Fonts. Playwright got `net::ERR_TUNNEL_CONNECTION_FAILED`, curl got `CONNECT tunnel failed, response 403`, and WebFetch got `ENOTFOUND`. As a result **no live screenshots of skribbl.io or its competitors could be taken**: no home page at desktop or phone size, no avatar customizer, no private lobby, no drawing screen. To capture them, these hosts have to be allowed in the session's network settings. Only WebSearch and github.com (git and raw.githubusercontent.com) could be reached. The findings below therefore come from:
1. **toobeeh/skribbltypo**, an actively maintained skribbl.io browser extension (last commit 4 Oct 2026). It ships the default skribbl CSS theme variables and a patched copy of skribbl.io's own client JavaScript (`assets/gamePatch.js`).
2. **Zpayer/Skribbl.io-Source-Code**, a self-described "self-hosted, full-stack clone" (last commit 17 Oct 2026). Its `index.html`, `public/css/style.css` and `public/img/*` are evidently copied from the live skribbl.io front end: same ad tags, same meta text, and CSS variables that match the skribbltypo defaults. Treat it as a third-party copy of the real assets, not an official source.
3. **galehouse5/skribbl-io-autodraw**, whose real 1280x800 screenshots show the old (pre-Nov-2022) skribbl.io UI.
4. Web search results for competitors.

I tried to render the copied front end locally in Playwright to get stand-in screenshots of the current UI. The session's permission classifier denied that step, and I did not work around it.

### Screenshot and reference image files saved
Folder: `/home/user/games/research_notes/Skribbl io draw and guess research/screenshots/`

| File | What it shows |
|---|---|
| `skribbl-old-ui-pre2022-ingame-drawing-1280x800.png` | Real 1280x800 screenshot of the **old (pre-redesign)** skribbl.io in-game screen while drawing "starfish". Small rainbow logo top-left, light-gray header bar (alarm-clock timer "63", "Round 1 of 3", word "starfish" spaced out in the center). Player list on the left (rank "#1", name, "Points: 0", avatar; crown on one avatar, pencil icon next to the drawer). Big white canvas in the center, light-gray chat on the right ("me is drawing now!" in blue, input "Type your guess here..."). Brown "Votekick" button bottom-left. Bottom toolbar: current-color swatch, 11x2 palette, brush/eraser/fill buttons (brush active in purple), 4 round size dots, trash-can clear. All on a dark-blue doodle-wallpaper background. Source: [galehouse5/skribbl-io-autodraw screenshots](https://github.com/galehouse5/skribbl-io-autodraw/tree/master/screenshots) |
| `skribbl-old-ui-pre2022-ingame-drawing-later-frame.png` | Same session a moment later. The timer reads 13, the finished starfish is on the canvas, and the current-color swatch is dark red. It shows how a filled drawing looks in the old frame. Same source. |
| `skribbl-reference-assets-logo-background-icons.png` | Contact sheet I made of skribbl.io image assets, taken from the third-party copy: the `logo.gif` wordmark (each letter a different rainbow color with a thick black outline, ending in an orange pencil), the 400x400 `background.png` tile (dark-blue wallpaper of lighter-blue line doodles: sun, house, fish, bike, cake, heart, umbrella, skull), the crown, owner, pen, alarm clock, trophy, fill-bucket, undo, clear (trash), size, randomize (die) and thumbs-up icons. Source: [Zpayer/Skribbl.io-Source-Code public/img](https://github.com/Zpayer/Skribbl.io-Source-Code/tree/main/public/img) |
| `skribbl-reference-assets-avatar-color-and-eyes-atlases.png` | Avatar sprite atlases: 28 body colors (round head and shoulders blob with a thick black outline; the last 10 are hatched/striped variants), and 57 eye styles drawn as small black doodles (dots, lines, glasses, sunglasses, monocle, hearts, "$$", X-eyes). Same source. |
| `skribbl-reference-assets-avatar-mouth-and-special-atlases.png` | 51 mouth doodles (smiles, mustaches, teeth, tongue, ":3", cat mouth) and the "special" accessory atlas (hats, crowns, wizard hat, pirate hat, rainbow, Santa and elf hats, horns, pumpkin, and so on). Same source. |
| `skribbl-reference-assets-howtoplay-tutorial-doodles.png` | The five "How to play" tutorial images: white chalk-like line doodles ("CHOOSE A WORD!", drawing a house with a pencil, player list plus guess "HOUSE", pear plus chat lines and the "PEAR" answer, "WINNER" stick figure with crown and #1). Same source. |

No screenshots of the current-UI home page (desktop or phone), the avatar customizer, the lobby or the drawing screen, nor of Gartic Phone, Gartic.io or Drawasaurus, could be saved. See the Gaps sections below.

---

## 1. Layout of the in-game screen and the home/lobby screen

### Takeaway
The current skribbl.io (redesigned 9 Nov 2022) uses a CSS grid. A big logo sits on top, then a full-width game bar (timer, round, word), then three columns: **players | canvas | chat**, with the drawing toolbar under the canvas. On portrait phones it stacks: bar, canvas, tools, then players and chat side by side, then the input. The home page is one centered blue translucent panel (name, language, avatar customizer, big "Play!" and "Create Private Room" buttons) under a big logo. Below it sit About / News / How to play panels.

### Cited Findings
- The skribbl.io News panel lists "Fresh paint — 9th November 2022: Redesign of the page, Mobile support, Undo button, More colors, Left- and rightclick to select colors and draw, Experimental support for pressure touch input, Configurable hotkeys". This dates the current look to Nov 2022. — [index.html in Zpayer copy](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html)
- The in-game grid is `grid-template-areas: "logo logo logo" "bar bar bar" "players canvas chat" "footer tools ."` with `grid-template-columns: min-content auto auto`, a 6px gap (`--BORDER_GAP`), a 48px base unit (`--UNIT`) and a 14px base font. — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- Portrait layout (`@media (max-aspect-ratio:1)`): `"bar bar" "canvasA canvasB" "toolsA toolsB" "players chat" "input input"`, with an alternative order that puts the input above the tools. The toolbar is `"preview colors sizes tools actions"` on desktop and wraps to two rows on narrow landscape screens. — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- DOM areas in the real client: `#game-logo`, `#game-bar` (contains `#game-clock`, `#game-round`, `#game-word`, `#game-settings`), `#game-players` (plus `#game-players-footer` with Votekick/Invite), `#game-canvas` (with `.overlay-content` for word choice, round results and the final podium), `#game-chat` (`.chat-content`, `form.chat-form input`), `#game-toolbar` (`.colors`, `.sizes`, `.toolbar-group-tools`, `.toolbar-group-actions`), `#game-rate` (thumbs up/down). — [skribbltypo elements.setup.ts](https://github.com/toobeeh/skribbltypo/blob/main/src/app/setups/elements/elements.setup.ts); [index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html)
- Canvas resolution is 800x600. Drawing coordinates are encoded on that grid. — [skribbltypo gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- Home page structure: `.logo-big`, an avatar row, then `.panel-left` with `input.input-name` ("Enter your name"), a language select (28 languages), `.avatar-customizer` (left/right arrow columns, avatar in the middle, `.randomize` die), `.button-play` "Play!" and `.button-create` "Create Private Room". A right-hand ad slot (336x280). Below a diagonal SVG divider sit footer panels "About", "News" and "How to play" (5 tutorial doodles). — [index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html)
- Private room settings (shown in the canvas area to the owner): Players (2–20), Language, Drawtime (15–240 s), Rounds (2–10), Game Mode (Normal / Hidden / Combination), Word Count (1–5), Hints, Custom words ("Minimum of 10 words…, Separated by a , (comma)"), "Use custom words only", a "Start!" button and an invite-link box ("Hover over me to see the invite link!", "Copy"). Each setting has a small doodle icon (`setting_0..6.gif`). — [index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html); [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- A game cannot start alone: "You need at least 2 players to start the game!". — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- Old (pre-2022) in-game layout from a real screenshot: small logo top-left, light-gray header bar, white player cards on the left, canvas in the center, light-gray chat on the right, toolbar along the bottom. The overall arrangement is the same as today. — [galehouse5 screenshot](https://github.com/galehouse5/skribbl-io-autodraw/tree/master/screenshots)
- Third-party reviews describe the layout as "drawing canvas, a chat box, and a scoreboard", with ranking on the left. — [Mechanics of Magic critical play](https://mechanicsofmagic.com/2024/04/24/critical-play-skribbl-io-26/)

### Inferences
- The players | canvas | chat triptych with a word/timer bar on top is the genre convention. It works well for an original game, and a pixel-art version can keep it while changing every visual element.
- Because the canvas is a fixed 800x600 (4:3) logical grid scaled to fit, a pixel-art game could similarly use a fixed low-res logical canvas, for example 160x120 or 200x150, scaled up with nearest-neighbor filtering.

### Gaps
- No live screenshot of the current (post-2022) home page, lobby or in-game screen could be taken, because skribbl.io and all image CDNs were blocked. The layout above comes from the CSS grid definitions and DOM, not from a rendered view.

---

## 2. Color palette, fonts and logo

### Takeaway
The UI is **saturated royal blue**: translucent panels (`rgba(12,44,150,0.75)`, about #0C2C96) over a #124DA5 doodle-wallpaper background. Game surfaces are white or light gray with black text. Accents: purple (#AB66EB) for the active tool, green (#56CE27 / #5BDD4A) for correct guesses, yellow (#E2CB00) for "close", blue (#3975CE) for drawer messages, orange (#FFA844 / #EE9631) for owner and focus. The font is **Nunito** (rounded sans, weights 400–800). The logo is a hand-drawn rainbow wordmark with thick black outlines and a pencil.

### Cited Findings
- `body { font-family: Nunito, sans-serif; background-color: #124da5; background-image: url(/img/background.png); background-repeat: repeat; }`. Google Fonts loads Nunito (400/600/700/800, italic 400), Inconsolata and Material Icons. — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css); [index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html)
- Shape tokens: `--BORDER_RADIUS: 3px` (nearly square corners), `--DROPSHADOW: drop-shadow(3px 3px 0px rgba(0,0,0,0.25))` (hard offset shadow, no blur), and text shadows such as `2px 2px 0 #0000002b`. — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- Default light-theme `:root` CSS variables, verbatim from style.css. They match the "Original Skribbl" theme defaults stored as HSL in [skribbltypo colors.ts](https://github.com/toobeeh/skribbltypo/blob/main/src/util/typo/themes/colors.ts) to within rounding. — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)

| Variable | Value | Role |
|---|---|---|
| page background | #124DA5 + doodle tile | page |
| --COLOR_PANEL_BG | rgba(12,44,150,0.75) | translucent blue panels |
| --COLOR_PANEL_LO | rgba(7,36,131,0.75) | darker panel areas |
| --COLOR_PANEL_HI | #1640C9 | highlighted panel |
| --COLOR_PANEL_BUTTON / HOVER / ACTIVE | #2A51D1 / #1E44BE / #1D40B4 | panel buttons |
| --COLOR_PANEL_FOCUS | #EE9631 | orange focus |
| --COLOR_PANEL_BORDER | #040A33 | near-black navy border |
| --COLOR_PANEL_BORDER_FOCUS | #56B2FD | light-blue focus ring |
| --COLOR_PANEL_TEXT | #F0F0F0 | text on blue |
| --COLOR_TOOL_BASE / HOVER | white / #C5C5C5 | tool buttons |
| --COLOR_TOOL_ACTIVE, --COLOR_TOOL_SIZE_ACTIVE | #AB66EB | selected tool or size (purple) |
| --COLOR_TOOL_TIP_BG | #4571FF | tooltips |
| --COLOR_INPUT_BG / TEXT / BORDER | #FFFFFF / #2C2C2C / #707070 | inputs |
| --COLOR_GAMEBAR_TEXT / WORD_DESCRIPTION | #000 / #363636 | game bar |
| --COLOR_CHAT_BG_BASE / ALT | #FFF / #ECECEC | zebra-striped chat |
| --COLOR_CHAT_TEXT_GUESSED / JOIN | #56CE27 | "X guessed the word!", joins |
| --COLOR_CHAT_TEXT_CLOSE | #E2CB00 | "X is close!" |
| --COLOR_CHAT_TEXT_DRAWING | #3975CE | "X is drawing now!" |
| --COLOR_CHAT_TEXT_LEAVE | #CE4F0A | leaves, kicks |
| --COLOR_CHAT_TEXT_OWNER | #FFA844 | owner messages |
| --COLOR_CHAT_TEXT_GUESSCHAT | #7DAD3F | chat among people who have guessed |
| --COLOR_CHAT_BG_GUESSED_BASE / ALT | #E7FFDF / #CFFFBD | pale-green chat rows for guessed-only chat |
| --COLOR_PLAYER_BG_BASE / ALT | #FFF / #ECECEC | zebra player rows |
| --COLOR_PLAYER_BG_GUESSED_BASE / ALT | #5BDD4A / #48C737 | player row turns green after guessing |
| --COLOR_PLAYER_ME / ME_GUESSED | #4998FF / #0048B5 | your own name |
| --COLOR_BUTTON_SUBMIT_BG (Play!) | #53E236 (hsl 110,75%,55%) | green CTA |
| --COLOR_BUTTON_NORMAL_BG | #2C90E8 (hsl 208,80%,54%) | blue button (e.g. Create Private Room) |
| --COLOR_BUTTON_DANGER_BG | #E7B11D (hsl 44,81%,51%) | votekick/danger (amber, not red) |

  (The three button colors come from [skribbltypo colors.ts](https://github.com/toobeeh/skribbltypo/blob/main/src/util/typo/themes/colors.ts), HSL converted by me. The rest are from style.css.)
- A built-in dark theme (`html[data-theme=dark]`) darkens the panels (e.g. `--COLOR_PANEL_BG: rgba(8,36,129,0.75)`), uses dark-green rows for guessed players (`rgba(2,97,48,0.75)`) and swaps in `background_dark.png`. There is also a seasonal `background_halloween.png` / `logo_halloween.gif` and a `snow.gif` effect. The settings bar has a "Turn the lights off/on" bulb toggle. — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css); [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js); [README](https://github.com/Zpayer/Skribbl.io-Source-Code)
- The logo (`logo.gif`, 469x94) is the lowercase hand-lettered word "skribbl.io". Each letter is a different saturated color (red, orange, yellow, green, cyan, blue, purple, pink, white) with a thick black marker outline, ending in a tilted orange pencil with a pink eraser. The in-game logo is a smaller copy (`#game-logo img`). — asset viewed from [public/img/logo.gif](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/img/logo.gif); saved as `skribbl-reference-assets-logo-background-icons.png`
- The background tile is dark blue with slightly lighter blue hand-drawn line doodles (sun, house, fish, bicycle, umbrella, cake, heart, skull, cars, trophy "1"). — [public/img/background.png](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/img/background.png)

### Inferences
- The visual identity is "kid's marker doodles on a school-blue page". The only rounded, friendly typography is the font (Nunito). UI chrome is almost square (3px radius) with flat hard shadows, so it reads as slightly retro and web-1.0. That actually suits a pixel-art game well.
- An original game should avoid royal blue with a rainbow outlined wordmark and a doodle wallpaper, since that combination is skribbl's signature. Consider a different dominant hue (e.g. warm teal, plum or cream paper) and a pixel font.

### Gaps
- Exact rendered colors couldn't be eyedropped from a live page. The values are from CSS source. Button colors in style.css itself were not cross-checked line by line, so I relied on skribbltypo's defaults.

---

## 3. Avatar system

### Takeaway
An avatar is a layered sprite: **body color (28) + eyes (57) + mouth (51) + optional "special" accessory**, each picked with left/right arrows on the home page or randomized with a die button. Everything is hand-drawn with black outlines. A **crown** sits on the room owner's avatar and on the winner's avatar on the podium. The winner bounces with a squash-and-stretch animation.

### Cited Findings
- The client defines atlas sizes `P = 28` (colors), `Y = 57` (eyes), `z = 51` (mouths). The avatar is `[color, eyes, mouth, special]`, each a 10-column sprite atlas selected with `background-position`. `special` is hidden when below 0. — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- Avatar DOM is `.avatar > .color, .eyes, .mouth, .special, .owner`. `.special` is drawn at 166% size offset by -33%, so hats can overflow the head. `.owner` is `crown.gif` at 50% size, placed top-left at `left:-5%; top:-22%`. — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- Atlases are 480x480 GIFs (48 px cells, 10x10 grid) for color, eyes and mouth, and an 800x800 GIF for specials. Bodies are a round head plus shoulders with a thick black outline in flat colors; 10 have diagonal hatching. Eyes and mouths are tiny black doodles (glasses, sunglasses, monocle, "$$", hearts, X eyes, mustache, ":3"). Specials include a wizard hat, pirate hat, rainbow, crowns, and Santa and elf hats. — [public/img/avatar](https://github.com/Zpayer/Skribbl.io-Source-Code/tree/main/public/img/avatar); saved contact sheets
- The customizer has four arrow rows (left and right) around the big avatar plus a "Randomize your Avatar!" die. Avatar CSS animations include `avatar_bounce` and `avatar_clicked`, and filter effects (`filter_hue_rotate`, `filter_blink`, `filter_alien`, `filter_glow`). — [index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html); [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- Players flagged admin get an animated player-card background (7 rising `background-bubble`s, or 3 `background-wave`s), red name text and an "ADMIN" tag. — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js); [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- The final results podium: places #1–#3 each show avatar(s), "#n", names and "$ points". Rank 1 gets `trophy.gif` behind it and avatars with class `winner` (crown shown), animated by `player_winner` (3.8 s loop of squash, stretch and hop with ±20° tilt). Up to 5 more players are listed below. — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js); [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- The skribbl.io copy: "Score the most points and be crowned the winner at the end!" — [index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html)

### Inferences
- The mix-and-match layered face (body color, eyes, mouth, hat) on a 48 px cell maps naturally onto pixel art, e.g. a 16x16 or 24x24 sprite with separate eye, mouth and hat layers. An original game should design its own silhouette (not the round head-and-shoulders blob) and its own face set.

### Gaps
- No screenshot of the live customizer could be taken. The arrangement above comes from the DOM and CSS.

---

## 4. Drawing toolbar

### Takeaway
The current toolbar runs left to right: **current-color preview | 26-color palette in 2 rows of 13 | 5 brush-size buttons | tools (Brush, Fill) | actions (Undo, Clear)**. Each is a white square 48 px button with a hand-drawn GIF icon and a hotkey letter, and the active tool or size is highlighted purple (#AB66EB). The old (pre-2022) UI had 22 colors, 4 sizes, an eraser, and no undo.

### Cited Findings
- Tools: `Brush` (key B, `pen.gif`), `Fill` (key F, `fill.gif`, custom bucket cursor `fill_cur.png`). Actions: `Undo` (key U, `undo.gif`), `Clear` (key C, `clear.gif`). Each button is `.tool.clickable` with `.icon` and `.key` children and a tooltip. A color picker ("Colorpick") appears as a translatable string. — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- Brush sizes: `[4, 10, 20, 32, 40]` px (min 4, max 40). Each size button shows `size.gif` (white blob) scaled from 20% to 100% of the button. — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js); [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- The 26-color palette, laid out as top row = even indices and bottom row = odd indices, i.e. light over dark pairs. — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)

| Light (top row) | Dark (bottom row) |
|---|---|
| White #FFFFFF | Black #000000 |
| Light Gray #C1C1C1 | Gray #505050 |
| Red #EF130B | Dark Red #740B07 |
| Orange #FF7100 | Dark Orange #C23800 |
| Yellow #FFE400 | Dark Yellow #E8A200 |
| Green #00CC00 | Dark Green #004619 |
| Mint #00FF91 | Dark Mint #00785D |
| Skyblue #00B2FF | Dark Skyblue #00569E |
| Seablue #231FD3 | Dark Seablue #0E0865 |
| Purple #A300BA | Dark Purple #550069 |
| Pink #DF69A7 | Dark Pink #873554 |
| Beige #FFAC8E | Dark Beige #CC774D |
| Brown #A0522D | Dark Brown #63300D |

- Left-click and right-click select primary and secondary colors (since Nov 2022). On mobile the palette collapses behind a `.color-preview-mobile` button that opens it. — [index.html News](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html); [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- Old UI (real screenshot): a big current-color square, an 11x2 palette, white square buttons for brush (pencil, active = purple background), eraser and fill bucket, 4 black size dots on white squares, and a gray trash-can clear icon. No undo. — [galehouse5 screenshot](https://github.com/galehouse5/skribbl-io-autodraw/tree/master/screenshots)
- Icon art style: chunky hand-drawn GIFs with thick black outlines and flat fills (orange pencil, gray bucket with orange paint, blue curved undo arrow, gray trash can). — [public/img](https://github.com/Zpayer/Skribbl.io-Source-Code/tree/main/public/img)

### Inferences
- The light-over-dark paired palette is very readable and is a common convention. An original pixel game might use its own curated palette (e.g. 16–24 colors) laid out the same way. The palette hex values above should not be copied wholesale.

### Gaps
- Whether a color-picker (eyedropper) tool button is exposed in the vanilla UI couldn't be confirmed. Only the string "Colorpick" was found, and skribbltypo adds its own pipette.

---

## 5. How correct guesses, close guesses, the drawer and the timer are indicated

### Takeaway
Feedback is mostly **color plus chat text**. Guessers' player rows turn green, chat shows a green "X guessed the word!" line, and near-misses show a yellow "X is close!" line visible only to that player. The drawer gets an animated pencil icon on their avatar and a blue "X is drawing now!" line. The word bar shows "GUESS THIS" with underscores that pop to orange as hints reveal, or "DRAW THIS" with the full word for the drawer. The timer is a number inside an alarm-clock icon.

### Cited Findings
- Chat strings: "$ guessed the word!", "$ is close!", "$ is drawing now!", "$ is choosing a word!", "$ joined the room!", "$ left the room!", "$ liked the drawing!" / "$ disliked the drawing!", "Everyone guessed the word!", "Time is up!", "The drawer left the game!", "The word was '$'", "$ won with a score of $!", "Nobody won!". — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- Colors: guessed #56CE27, close #E2CB00, drawing #3975CE, leave #CE4F0A, owner #FFA844. After guessing, a player's chat goes to other guessers only (pale-green row background #E7FFDF / #CFFFBD, text #7DAD3F). — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- Player list: `#game-players .player.guessed` switches the row background to #5BDD4A / #48C737 (alternating). Each row shows "#rank", name (yours in blue, "(You)" suffix), "$ points", the avatar, and icons for owner (`owner.gif`) and muted (`mute.gif`). The drawer's avatar gets a `.drawing` overlay showing `pen.gif` with an `icon_drawing` animation (1 s loop). — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css); [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- Word display (`#game-word`): the description text is "GUESS THIS", "DRAW THIS" or "WORD HIDDEN" (Hidden mode), with "WAITING" before the game. Guessers see `.hints .container .hint` letter slots (1ch wide, underscores) plus a small superscript `.word-length` count. A revealed hint plays `hint_uncover`: the letter turns orange (#FFA844), scales to 1.35, jumps 8 px and settles over 0.8 s. The drawer sees the full word. — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js); [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- Timer: `#game-clock` uses `clock.gif`, a white alarm clock with gray bells and the seconds number drawn inside. A `tick.ogg` sound plays near the end. Round text reads "Round $ of $". — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css); [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js); old-UI screenshot shows "63" in the clock and "Round 1 of 3".
- Sounds: join, leave, playerGuessed, roundStart, roundEndSuccess, roundEndFailure, tick (.ogg). — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js)
- Canvas overlays: "Choose a word" (word-choice buttons shown to the drawer), "$ is choosing a word!", the end-of-turn "The word was" reveal with each player's points gained, and the final podium. On mobile, chat messages can appear as `canvas_bubble` speech bubbles on the board ("Mobile Chat Bubbles"). Mid-round, guessers can rate the drawing with large thumbs-up/down icons (`#game-rate`, `rate_introduce` animation). — [gamePatch.js](https://github.com/toobeeh/skribbltypo/blob/main/assets/gamePatch.js); [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css); [index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/index.html)

### Inferences
- The strongest at-a-glance cue is the whole player row turning green. Chat colors back it up. In a pixel game, a green row flash, a checkmark sprite and a sound would give the same clarity.

### Gaps
- The exact visual of the word-choice overlay and the per-turn results overlay could not be seen, because no live screenshot was possible.

---

## 6. Feel, tone and what makes it recognizable

### Takeaway
Playful, scrappy and doodle-like: hand-drawn marker icons and logo, a doodle wallpaper, bouncy avatars. All of it sits in a fairly plain, functional web layout of blue panels and white boxes. Reviewers call it simple and minimal, and some call it old-fashioned.

### Cited Findings
- Hallmarks seen in the assets: the rainbow outlined hand-lettered logo with a pencil, the blue doodle wallpaper, chalky white "How to play" doodles, and thick-outlined GIF icons and avatar blobs with tiny doodle faces. — [public/img](https://github.com/Zpayer/Skribbl.io-Source-Code/tree/main/public/img); saved contact sheets
- Motion adds charm: squash-and-stretch winner dance, hint letters popping, bouncing avatars on click, an animated drawing pencil, rising bubbles on admin cards. — [style.css](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/main/public/css/style.css)
- Reviewers praise "simple drawing tools and a clean interface". One player found the design "old-fashioned" with distracting ads. — summarized from [Mechanics of Magic](https://mechanicsofmagic.com/2024/04/24/critical-play-skribbl-io-26/) and related reviews via search (secondary sources, quality varies)
- skribbl.io was created by "ticedev", with a release listed around March 2017 (aggregator). — [MobyGames](https://www.mobygames.com/game/skribblio) (via search snippet; not fetched)

### Inferences
- What makes it recognizable: (1) the rainbow marker logo, (2) the royal-blue doodle wallpaper, (3) blob avatars with doodle faces and crowns, (4) white boxes with a purple active tool. An original pixel-art game should differ on all four, for example a pixel wordmark in a limited palette, a non-blue backdrop such as a cork board, desk or sky, distinct pixel creature avatars, and a different accent color for selection.

### Gaps
- No first-hand UX writing or official design statement from the developer was found.

---

## 7. Competitors' visual style, for contrast

### Takeaway
Little reliable visual detail could be fetched, because the competitor sites and stores were blocked. Gartic Phone's identity is a bold **purple-and-white** palette with an old-school phone emblem and rounded, outlined lettering. Gartic.io is a skribbl-like competitive guess game with a leaderboard. Drawasaurus is a simpler Pictionary-style site praised as easy to navigate.

### Cited Findings
- Gartic Phone: the logo is a "modern and bold purple and white composition" with an old-style landline phone. "Phone" is in bold white with the "O" drawn as a rotary dial, and "Gartic" is in a white rounded sans-serif with a bold purple outline. — [1000logos](https://1000logos.net/gartic-phone-logo/); [Logos-World](https://logos-world.net/gartic-phone-logo/) (third-party logo sites; placement details differ between them)
- Gartic Phone is a cooperative telephone game with many modes, while Gartic.io is a competitive guessing game with a leaderboard. — [Mechanics of Magic competitive analysis](https://mechanicsofmagic.com/2023/04/21/critical-play-competitive-analysis_janet/); [Medium: Gartic Phone modes guide](https://medium.com/gartic/the-ultimate-gartic-phone-guide-all-modes-explained-805404f94948)
- Gartic.io app review: drawing tools are hard to use, with undo buried in a menu and limited to two steps. — [App Store listing](https://apps.apple.com/us/app/gartic-io/id1270393677) (via search snippet)
- Drawasaurus: one player draws while others guess over multiple rounds. One reviewer found the interface easy to navigate and attractive; another found trackpad drawing hard. — [Mechanics of Magic: Drawasaurus](https://mechanicsofmagic.com/2021/04/12/critical-play-competitive-analysis-drawasaurus/); [topbestalternatives](https://www.topbestalternatives.com/drawasaurus/)

### Inferences
- From general familiarity, not verified this session: Gartic Phone uses a purple gradient background, chunky rounded white cards, cartoony illustrated characters and big rounded outlined type. Gartic.io uses a lighter, flatter cartoon look. Drawasaurus is plain and flat with a dinosaur mascot. Treat these as unverified until screenshots can be captured.

### Gaps
- No competitor home-page screenshots could be taken, because garticphone.com, gartic.io and drawasaurus.org were blocked by the network policy. No hex colors or fonts for competitors were found. Fallback image sources to try once network access is granted: the Gartic Phone and Gartic.io App Store and Google Play pages, a Steam store page that came up in search (store.steampowered.com/app/1483870, not verified as Gartic), Wikipedia, and YouTube gameplay thumbnails (i.ytimg.com).
