# skribbl.io: gameplay rules, mechanics and drawing tools (reference spec for an original game)

Method and source quality (read first)
- skribbl.io itself, skribbl-io.fandom.com, iogameguide.com and web.archive.org could not be reached from this session (proxy/DNS blocked). I did not load the live site or join any game.
- So the primary evidence is GitHub-hosted material, read directly:
  1. **ElijahKasler/website `projects/skribbl/js/game.js`**: a mirrored copy of the real (minified) skribbl.io client after the redesign (it has the room browser, votekick, the 26-colour palette and pressure input). Snapshot date unknown. Cited below as [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
  2. **Zpayer/Skribbl.io-Source-Code** (last commit 2026-10-17): a clone. Its `index.html` and client modules are a de-minified copy of the real client markup and constants. Its **server (`websocket/room.js`) is the author's own reimplementation, not skribbl's code**, so I do not cite it for server rules. Cited as [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html) and [Zpayer constants.js](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/src/core/constants.js).
  3. **MrDiamond64 protocol gist**: a reverse-engineered write-up of the protocol, abandoned 9 Aug 2024, with real example packets. Cited as [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
  4. **Skribblers/skribbler** (last commit 2026-10-24): a headless client library for the live protocol. Cited as [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js) and [Skribbler Client.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/client/Client.js).
  5. **toobeeh/skribbltypo** (last commit 2026-10-04): a popular skribbl.io extension. Used for the palette hex values. Cited as [skribbltypo color.ts](https://github.com/toobeeh/skribbltypo/blob/HEAD/src/util/color.ts) and [skribbltypo default-palettes.ts](https://github.com/toobeeh/skribbltypo/blob/HEAD/src/app/features/drawing-color-palettes/default-palettes.ts).
- **Server-side rules are closed source.** These include the scoring formula, when hints are revealed, how much the timer drops after a guess, the close-guess threshold and the votekick threshold. Nothing above can see them. Where I give them at all, they come from secondary sources and are flagged.

## Game loop: lobby, rounds, turns, word choice, timers, reveal, podium

### Takeaway
The server drives the game as a state machine with 8 states: waiting → starting → "Round N" splash → drawer picks a word (15 s; if time runs out the server picks one) → drawing (default 80 s, range 15–240 s) → word reveal and score deltas → … → podium with places 1–3. A turn ends in one of four ways: everyone guessed, time up, drawer left, or drawer skipped.

### Cited Findings
- Game states (protocol ids): 0 waiting for players, 1 game starting soon, 2 round start ("Round 1" splash), 3 user picking word, 4 drawing, 5 draw results (scoreboard for that drawing), 6 game results (podium), 7 private-lobby setup — [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js); same list in [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Each state packet carries `time`, the seconds left in that state. Real example packets include a round splash of `{"id":2,"time":2}`, word choice of `{"id":3,"time":15,"data":{"id":1,"words":["word1","word2","word3"]}}` and drawing of `{"id":4,"time":80,...}`. The last is captioned "Server auto-selected word due to timeout", so **word choice lasts 15 s, and on timeout the server picks a word for the drawer** — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Only the drawer receives the list of word options in state 3. Everyone else only learns who is choosing (on-screen text: "$ is choosing a word!") — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Starting a game needs at least 2 players (error "You need at least 2 players to start the game!"). The server can also refuse with "Server restarting in about $ seconds!" — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Overlay texts include "Waiting for players...", "Game starting in a few seconds...", "Round $ of $", "Choose a word", "DRAW THIS" (drawer) and "GUESS THIS" (guessers) — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- **Turn-end reasons** (shown above "The word was '$'"): 0 "Everyone guessed the word!", 1 "Time is up!", 2 "The drawer left the game!", 5 "Drawer got skipped!" — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js) (constants B=0, U=1, H=2, _=5 mapped in the switch). Ids 0–2 agree with [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js). The Zpayer clone swaps 1 and 2, which is wrong against the real client.
- Turn-end screen (state 5): the server sends `scores` as flat triplets `[playerId, newTotal, pointsAdded, …]`. The client lists players by points gained this turn ("+N"; 0 is greyed out) and shows at most 12 rows — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [Skribbler Client.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/client/Client.js).
- Sounds play at turn end: `roundEndSuccess.ogg` or `roundEndFailure.ogg` — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Game end (state 6): the data is a list of `[playerId, rank, title]`. The client fills podium slots 1, 2 and 3 plus a "ranks" list for everyone else, and **tied players share a podium slot**. Chat announces "$ won with a score of $!" or "$ and $ won with a score of $!" — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- In a private lobby, all scores reset to 0 when the game ends and the room returns to the setup screen (state 7) — [Skribbler Client.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/client/Client.js).
- The host can end a running game (packet 23 End Game), which sends everyone back to the waiting screen — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Ticking clock: `tick.ogg` plays and the clock icon wobbles during the last 10 s of drawing and the last 4 s of word choice (client constants `Qa = 10` for state 4, `eo = 4` for state 3) — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- The official About text: "A normal game consists of a few rounds, where every round a player has to draw their chosen word and others have to guess it to gain points! The person with the most points at the end of the game, will then be crowned as the winner!" — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html) (copied from the real page).
- Official 5-step tutorial: "When it's your turn, choose a word you want to draw!", "Try to draw your choosen word! No spelling!", "Let other players try to guess your drawn word!", "When it's not your turn, try to guess what other players are drawing!", "Score the most points and be crowned the winner at the end!" — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- People who join mid-game catch up from Lobby Data (packet 10). It includes the current state, time left, word lengths, hints already revealed and **every draw command so far**, so the canvas can be rebuilt — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Draw time of 80 s per turn is reported as the standard or default by several guides; the second source is a secondary-source snippet only — [CrazyGames](https://www.crazygames.com/game/skribblio); [mechanicsofmagic critical play](https://mechanicsofmagic.com/2024/04/24/critical-play-scribbl-io-2/).

### Inferences
- **Does every player draw once per round?** The state flow (one state-2 "Round N" splash, then repeated state 3/4/5 cycles, with "Round $ of $" counting up to the Rounds setting) and the About text fit the commonly described rule: in each round, every player in the room takes one drawing turn in sequence. I found no primary source that states the turn order (join order, for example) or how people who join mid-round are handled.
- The pause lengths before the turn-end screen and the podium are server-controlled. I saw no fixed values beyond the 2 s round splash.

### Gaps
- Default values for each setting (beyond the widely cited 80 s): rounds, word count, hints and public-room size. Likely 3 rounds and 3 words, but **unverified**.
- Turn order, and whether a player who joins mid-round still gets a turn that round.
- How long the turn-end and podium screens last, and whether public games restart on their own after the podium.

## Hints and word display

### Takeaway
Guessers see one underscore slot per character, with the letter count of each word printed after them (for example "_ _ _ _ _ _ _ _ _  5 3"). The server reveals random single letters as `[position, letter]` pairs, up to the Hints setting (0–5). Hidden mode shows "???" and "WORD HIDDEN" with no length. When you guess correctly, the full word is revealed to you.

### Cited Findings
- The server sends the word as an array of word lengths, e.g. `"word":[5]`. The client creates (sum of lengths + number of words − 1) slots, so the spaces between words get slots too, and appends a "word-length" label of the lengths joined by spaces — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js) (function `pa`); [Skribbler Client.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/client/Client.js).
- Hint packet 13 is a list of `[letterPosition, letter]`, e.g. `[[0,"l"]]`. The client puts the letter into that slot with an "uncover" animation — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- "If there are any spaces or plus symbols to seperate words, then the server will include it in the hint data", meaning separators come pre-revealed in the hints — [Skribbler Client.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/client/Client.js) (code comment).
- The Hints setting runs from 0 to 5, and 0 disables hints. The Nov 2022 update notes say "Set the amount of Hints or disable them completely" — [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js); [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- **Hidden word mode:** the client shows 3 "?" slots, the label "WORD HIDDEN" instead of "GUESS THIS", and no word-length numbers. The server sends an empty length array — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [Skribbler Client.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/client/Client.js).
- **Combination mode:** the drawer gets two choice screens, "Choose the first word" and "Choose the second word". State 3 sends 2 × WordCount words, split in half, and Select Word returns two indices, e.g. `[2,2]` — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- After a correct guess, the guesser's own packet 15 includes the word, and the client fills in every slot for that player. Others receive only the guesser's id — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js) (function `ga`).
- One secondary guide says the game "automatically reveals random letters as hints" — [search snippet, The Help Force](https://cphelpforce.com/2021/02/gamers-knowledge-skribbl-io/) (unverified).

### Inferences
- Combination mode seems to join the two chosen words into one compound target, probably shown with a "+" separator given the Skribbler comment about "plus symbols". The exact display string is **unverified**.
- Hyphens most likely count as revealed separators, like spaces, but no primary source shows this.

### Gaps
- **When hints are revealed** (evenly spaced over the draw time? starting only after a certain point?) is decided on the server. I found no primary source. The Zpayer clone reveals them evenly through the turn, but that is the clone's own guess.
- Whether hints stop once most players have guessed, and whether the hint count is capped by word length.

## Scoring

### Takeaway
No exact formula is public. Every source agrees on three points. Guessers score more the earlier they guess, by time and/or order. The drawer scores based on how many people guessed and how fast. Nobody scores if nobody guesses. The server sends totals and per-turn deltas, so a new game can pick its own formula freely.

### Cited Findings
- The server computes per-turn deltas (`[id, total, added]` triplets) and the client only displays them. Ties are decided by the server's `rank` field — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Guessers: "more players guessing correctly and faster earns more points", but the reviewer says they "don't know the exact formula" — [mechanicsofmagic, Critical Play](https://mechanicsofmagic.com/2021/04/26/critical-play-skribbl-io-3/) (via search snippet).
- A fan wiki reportedly says the first guesser gets the most points and the last the least, and that the drawer earns points once at least one player guesses and nothing if nobody guesses or the drawer leaves — [skribbl-io.fandom.com/wiki/Points](https://skribbl-io.fandom.com/wiki/Points) (search-engine summary only; the page could not be loaded).
- The drawer "gets points based on how many players successfully guess the phrase and the amount of time left when the last person guesses" — [mechanicsofmagic](https://mechanicsofmagic.com/2024/04/24/critical-play-scribbl-io-2/) (search snippet).
- "If nobody guesses the word before the timer runs out, no points are awarded for that round" — [CrazyGames](https://www.crazygames.com/game/skribblio) (search snippet).
- One article's fitted model (explicitly *not* the real code) puts a guess at roughly 100–500 points in proportion to time left, with a falling share for later guessers — [DEV Community, "Games like skribbl"](https://dev.to/board_it_b11ff7d58bf863f8/games-like-skribbl-what-they-share-and-what-to-look-for-in-a-table-19h3) (search snippet; treat as an estimate).
- The remaining time drops after a correct guess: "It is sent after someone correctly guesses the word, in which the time is reduced" (packet 14 example: `{"id":14,"data":32}`) — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- When everyone has guessed, the turn ends early with reason 0 — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).

### Inferences
- Because the clock drops after guesses, being early pays twice: under any time-based formula, later guessers have less time left and so score less.
- For an original design, a clear and defensible model is: guesser points = f(time remaining) × an order multiplier, and drawer points = the average or a fraction of guesser points, scaled by the share of players who guessed. This is a design suggestion, not skribbl's formula.

### Gaps
- The exact point values for guessers and drawers, and exactly how far and when the timer drops after guesses (to a fixed number of seconds? only once half the players have guessed?). These need live testing in a private room.

## Chat: correct guesses, close guesses, guessed-players channel, spam and filters

### Takeaway
Chat doubles as the guess box (100 characters max). A correct guess is never shown as text: everyone sees "X guessed the word!" plus a sound. After guessing, a player's messages go into a separate channel that only the drawer and other correct guessers can see. Near misses produce "'<text>' is close!". Sending messages too fast triggers a spam warning. Profanity filtering is a client-side toggle.

### Cited Findings
- Chat input: placeholder "Type your guess here...", `maxlength="100"` — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- A correct guess triggers the system message "$ guessed the word!" in the GUESSED colour, the `playerGuessed.ogg` sound and a guessed marker on the player list. The guessed text itself is not broadcast — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814) (packet 15 carries only the id to others).
- **Guessed-players channel:** the client shows a message only if the sender is not muted, and only if one of these holds: the viewer is the drawer, the viewer has already guessed, the sender is neither the drawer nor a guessed player, or the viewer is an admin. Messages from the drawer or from guessed players appear in a separate colour (chat colours: BASE, GUESSED, CLOSE, DRAWING, JOIN, LEAVE, OWNER, GUESSCHAT). So people still guessing **never see** messages from the drawer or from those who already guessed — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js) (function `Ba`, colour list `Re`).
- Close guess: server packet 16 carries the typed text, e.g. `"housr"`, and the client prints "$ is close!" in the CLOSE colour — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Spam: server packet 32 makes the client print "Spam detected! You're sending messages too quickly." — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Profanity: a client setting "Filter bad words in chat", stored as `filter` and on by default (`filterChat: 1`) — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Chat lines also pop up as speech bubbles next to the sender's avatar for 1.5 s, and a mobile "chat bubbles on drawing board" option exists — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js) (`setTimeout(..., 1500)`); [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Other system lines: "$ joined the room!", "$ left the room!", "$ is drawing now!", "$ is now the room owner!", "$ liked the drawing!" and "$ disliked the drawing!" — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).

### Inferences
- Matching guesses, close guesses and spam limits all happen on the server. The near-miss threshold is likely edit distance of about 1–2 characters, judging by the "housr" for "house" example, but the threshold is **unverified**. The Zpayer clone uses Levenshtein similarity, which is only its own choice.
- Whether the server blocks the drawer from typing the word, or blocks guessers from leaking it after guessing, is unknown. The guessed-only channel at least limits leaks to people who already know the word.

### Gaps
- The close-guess threshold, how many messages per second trigger spam, whether guesses ignore case or accents (likely), and what the server does with the drawer's own messages.

## Room settings, private rooms and matchmaking

### Takeaway
A private room has 8 server settings: Language (28), Players 2–20, Drawtime 15–240 s (15 fixed options), Rounds 2–10, Game Mode Normal/Hidden/Combination, Word Count 1–5, Hints 0–5, and a "Use custom words only" checkbox with a comma-separated custom word list (at least 10 words, 1–32 characters each). Players join private rooms through an invite link `skribbl.io/?<id>`. Public play uses per-language random matchmaking plus a room browser.

### Cited Findings
- Setting ids and server-enforced min/max: 0 Language 0–27, 1 Max players 2–20, 2 Draw time 15–240, 3 Rounds 2–10, 4 Word count 1–5, 5 Hints 0–5, 6 Word mode 0–2, 7 Use custom words only 0–1 — [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js); [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Dropdown values in the real lobby UI — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html):
  - Players: 2, 3, … 20 (every integer).
  - Drawtime (s): 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 210, 240.
  - Rounds: 2, 3, … 10.
  - Game Mode: Normal, Hidden, Combination.
  - Word Count: 1, 2, 3, 4, 5.
  - Hints: 0, 1, 2, 3, 4, 5.
- 28 languages (ids 0–27): English, German, Bulgarian, Czech, Danish, Dutch, Finnish, French, Estonian, Greek, Hebrew, Hungarian, Italian, Japanese, Korean, Latvian, Macedonian, Norwegian, Portuguese, Polish, Romanian, Russian, Serbian, Slovakian, Spanish, Swedish, Tagalog, Turkish — [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js); [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Custom words placeholder: "Minimum of 10 words. 1-32 characters per word! 20000 characters maximum. Separated by a , (comma)" with `maxlength="20000"` — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html). **Conflict:** the other client snapshot reads "…10000 characters maximum…" — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js). The limit was probably raised later (the Zpayer copy is the newer one), but this is unverified.
- With fewer than 10 custom words, the server ignores the custom list — [Skribbler Client.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/client/Client.js) (JSDoc on `startGame`).
- The custom words go to the server as one comma-separated string inside the Start Game packet, e.g. `"Angel,Bells,Birth,Blizzard,boots,bow,…,candy cane,…"`. Multi-word entries with spaces are allowed — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Only the host can change settings. Clients send `{id:"5",val:"5"}` as strings and the server broadcasts numbers back to everyone — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Joining: `POST https://skribbl.io/play` with `lang=<id>` (random public room or new private room) or `id=<lobbyId>` (invite link `skribbl.io/?XXXXXXXX`, an 8-character id in the examples). The server replies with a game-server URL, and the client sends `login {join, create, name, lang, avatar}` over socket.io — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Lobby type 0 is public and 1 is private. Public lobbies have no owner (`owner: -1`) — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Invite UI: "Invite your friends!", "Click to copy Invite", and "Hover over me to see the invite link!" (the link is hidden until hover, which protects streamers). The Nov 2022 notes also add "Invite your friends to public rooms" — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Room browser strings: "View Rooms", "Create Room", "Filter rooms by name here...", "No rooms found!" — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Join errors: room not found, room full, kick cooldown, banned from room, joining rooms too quickly, already connected (100), too many connections from your IP (200), kicked too many times (300) — [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js); messages in [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- In the Nov 2022 update, custom rooms were raised to 20 players — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html) (news post).

### Inferences
- Public rooms seem to use fixed server settings (language chosen on the home page), with no host to change them.

### Gaps
- Public-room maximum size and settings. A commercial comparison blog claims "official limit is 12"; that is unverified and may describe the old version or public rooms — [doodleduel.ai blog](https://doodleduel.ai/blog/doodle-duel-vs-skribbl-io-comparison) (search snippet).
- The default value of each private-room setting.

## Moderation

### Takeaway
After the redesign, any player can Votekick, Mute (client-side) or Report (with 3 reasons), and a private-room owner can directly Kick or Ban. The server sets the votekick threshold and shows it as "(current/required)". Secondary sources describe it as roughly half the lobby.

### Cited Findings
- Player modal buttons: Kick, Ban, Votekick, Mute, Report — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Report reasons are a bitfield: 1 "Inappropriate Messages / Drawings", 2 "Spam", 4 "Botting / Cheating" (e.g. spam + botting = 6) — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814); [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Votekick: the server broadcasts `[voterId, targetId, currentVotes, requiredVotes]` (example `[4,9,1,2]`). Chat shows "$ is voting to kick $ ($/$)". The owner is immune: "You can not votekick the lobby owner!" — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Threshold claims: "if half of the lobby votes to kick" versus "if more than half of the group votekicks". The two conflict and neither is primary — [mechanicsofmagic reviews](https://mechanicsofmagic.com/2024/04/24/critical-play-scribbl-io-2/) (search snippets).
- Outcomes: "$ has been kicked!", "$ has been banned!" and "You have been kicked!". Kicked players get a rejoin cooldown ("You are on a kick cooldown!") and eventually a "kicked too many times" lockout. Leave reasons: 0 disconnect, 1 kicked, 2 banned — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js).
- Mute hides that player's chat for you ("You muted '$'!"). The client drops messages from muted players — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- If the owner leaves, ownership moves to someone else (packet 17, "$ is now the room owner!") — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- A drawer can be skipped (end reason 5, "Drawer got skipped!"). This is probably linked to a votekick of the drawer or moderation, but the cause is unverified — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- An admin user flag (value 4) gives names a glow/hue-rotate effect, and admin messages show in a special colour — [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- News text (Nov 2022): "Ability to kick and ban any player as a room owner", "Votekick, Mute and Report naughty players" — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Site notice: "The owner of this site is not responsible for any user generated content (drawings, messages, usernames)" — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).

### Gaps
- The exact votekick formula (needs live testing across lobby sizes) and how long the kick cooldown lasts.
- There is no dedicated "report this drawing" button. Drawings are reported through the player Report option ("Inappropriate Messages / Drawings").

## Drawing tools, palette, canvas and stroke sync

### Takeaway
Tools are Brush (B) and Fill/bucket (F); actions are Undo (U) and Clear (C); Swap (S) swaps the two colours. There are 5 brush sizes (4, 10, 20, 32, 40 px) and 26 colours in 2 rows of 13, with left click drawing in the primary colour and right click in the secondary. The canvas is 800×600 (4:3). There is **no separate eraser in the current version**: you paint white. Strokes are sent as compact line/fill commands, batched 8 at a time every 50 ms.

### Cited Findings
- Tools and actions with default hotkeys: Brush "B" (pen.gif), Fill "F" (fill.gif with a bucket cursor), Undo "U", Clear "C", Swap "S" (swap primary and secondary colour). Hotkeys can be rebound and are saved in localStorage — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [Zpayer palette.js](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/src/draw/palette.js).
- Brush sizes are `[4, 10, 20, 32, 40]`, with min 4 and max 40 — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js) (`et`, `Je=4`, `Qe=40`); names Extra Small/Small/Medium/Large/Extra Large in [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js).
- Canvas: `<canvas width="800" height="600">` — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html). Draw coordinates are checked against `C.width`/`C.height` — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- **Palette: 26 colours, protocol index → hex** — RGB in [skribbltypo color.ts](https://github.com/toobeeh/skribbltypo/blob/HEAD/src/util/color.ts), names in [Skribbler constants.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/constants.js), hex in [skribbltypo default-palettes.ts](https://github.com/toobeeh/skribbltypo/blob/HEAD/src/app/features/drawing-color-palettes/default-palettes.ts):
  - 0 White #FFFFFF · 1 Black #000000
  - 2 Gray #C1C1C1 · 3 Dark gray #505050
  - 4 Red #EF130B · 5 Dark red #740B07
  - 6 Orange #FF7100 · 7 Dark orange #C23800
  - 8 Yellow #FFE400 · 9 Dark yellow #E8A200
  - 10 Lime #00CC00 · 11 Dark green #004619
  - 12 Mint #00FF91 · 13 Dark mint #00785D
  - 14 Cyan/sky #00B2FF · 15 Dark cyan #00569E
  - 16 Blue #231FD3 · 17 Dark blue #0E0865
  - 18 Magenta #A300BA · 19 Dark magenta #550069
  - 20 Pink #DF69A7 · 21 Dark pink #873554
  - 22 Peach #FFAC8E · 23 Dark peach #CC774D
  - 24 Brown #A0522D · 25 Dark brown #63300D
- Layout: 2 rows. Even indices (light colours) form the top row and odd indices (dark colours) the bottom row, 13 columns each — [Zpayer palette.js](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/src/draw/palette.js) (`createColor(2*i)` top, `createColor(2*i+1)` bottom); [skribbltypo default-palettes.ts](https://github.com/toobeeh/skribbltypo/blob/HEAD/src/app/features/drawing-color-palettes/default-palettes.ts) (`columns: 13`).
- Tooltip: "Left-/Rightclick to choose a color!". Primary and secondary colour previews exist, and the Nov 2022 notes add "Left- and rightclick to select colors and draw" — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Draw command formats: line `[0, colorIndex, brushSize, x1, y1, x2, y2]` and fill `[1, colorIndex, x, y]`. Example: `[[0,4,12,161,561,161,561]]` — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814); [Skribbler DrawBuilder.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/builders/DrawBuilder.js). Colours are sent as palette indices, not RGB.
- **Sync:** the drawer's client samples pointer moves at up to 90 Hz (`rn = 90`). It sends unsent commands every 50 ms in slices of up to 8 commands. **The server drops packets with more than 8 commands.** Viewers replay queued commands at one per millisecond — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [Skribbler DrawBuilder.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/builders/DrawBuilder.js); [Zpayer constants.js](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/src/core/constants.js) (`DRAW_SEND_BATCH = 8`, `DRAW_RATE_LIMIT = 90`).
- **Undo:** the client records the command count at each pointer-up as a stroke boundary. Undo pops the last boundary and sends packet 21 with the command index to roll back to. If nothing is left, it sends Clear (packet 20) instead — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814).
- Lines are rasterised by hand as filled circles of radius ceil(size/2) along the segment, with pixel writes to ImageData rather than canvas strokes. That gives hard, non-antialiased edges, which keeps flood fill clean — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Pressure: an optional "Brush Pressure Sensitivity" setting, for pen pointer types only, scales size as `(size − 4) × pressure + 4` — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Only the drawer can draw, clear or undo; the client and the server both check this — [Skribbler Canvas.js](https://github.com/Skribblers/skribbler/blob/HEAD/src/client/Canvas.js).
- An eraser tool is described in 2022-era reviews ("a brush tool that they can change the size of, an eraser tool, and a bucket tool"), so it belongs to the **old** toolbar. The current client has only Brush and Fill — [mechanicsofmagic 2022 critical play](https://mechanicsofmagic.com/2022/04/20/critical-play-skribbl-io-6/) (search snippet); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).

### Inferences
- Sending palette indices and integer coordinates keeps the protocol tiny and keeps every client's output pixel-identical. Combined with the 4:3 fixed resolution and CSS scaling, that lets mid-game joiners rebuild the canvas exactly from the command log.

### Gaps
- How the server stores commands for late joiners, whether it caps the log, and the exact flood-fill tolerance (it looks like exact colour match).

## Extras: likes and dislikes, avatars, sounds, settings

### Takeaway
Viewers can rate the current drawing with a thumbs up or down; the rating is announced in chat and a thumb icon appears by the voter. Avatars are built from 4 parts (28 colours, 57 eyes, 51 mouths, plus rare "special" accessories). There are 7 sound effects and a volume slider.

### Cited Findings
- Rating: packet 8, 0 dislike and 1 like. The client shows thumbsup.gif or thumbsdown.gif next to the voter and posts "$ liked the drawing!" or "$ disliked the drawing!" — [protocol gist](https://gist.github.com/MrDiamond64/b2081f2cb4ca6d11e848edaeb5ae1814); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js). The `#game-rate` widget has like and dislike buttons — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Avatar = `[colour, eyes, mouth, special]`, with counts of 28 colours, 57 eyes and 51 mouths (`P=28, Y=57, z=51`). `special = -1` means none. The randomize button has a 1% chance (`1000*rand < 10`) of adding a random special accessory from 0–19 — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js). The Zpayer copy lists 29 accessory ids — [Zpayer constants.js](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/src/core/constants.js). The Nov 2022 notes mention "A dozen new avatar options" — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).
- Sounds: roundStart.ogg, roundEndSuccess.ogg, roundEndFailure.ogg, join.ogg, leave.ogg, playerGuessed.ogg, tick.ogg — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Settings modal: Volume (0–100%), Hotkeys (rebind, with a reset), Mobile Keyboard (experimental, with language layouts such as QWERTY/AZERTY/QWERTZ/Turkish/Spanish), Mobile Chat Input Layout, Brush Pressure Sensitivity, Mobile Chat Bubbles — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html); [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js).
- Seasonal theming (Halloween background and logo) exists according to the clone's README, which is secondary — [Zpayer README](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/README.md).

### Gaps
- Whether likes and dislikes affect score. Nothing in the client suggests they do; they look purely social.

## 2022 redesign versus the original version

### Takeaway
The "Fresh paint" update of 9 November 2022 is the dividing line. It brought the redesign, mobile support, a new toolbar (undo, more colours, two-button colour select, pressure, hotkeys), owner kick/ban, votekick/mute/report, public-room invites, up to 20 players, adjustable word count (1–5), hint count (0–5), word modes, and new languages (Russian, Japanese).

### Cited Findings
- Full news post "Fresh paint – 9th November 2022": "Redesign of the page; Mobile support; Reworked toolbar (Undo button, More colors, Left- and rightclick to select colors and draw, Experimental support for pressure touch input, Configurable hotkeys); Better player interactions/moderation (Ability to kick and ban any player as a room owner, Votekick, Mute and Report naughty players); Invite your friends to public rooms; More room settings (Increased player count in custom rooms to 20, Set the amount of Words to choose from (1-5), Set the amount of Hints or disable them completely, Word modes: Normal, Hidden and Combination); Updated a bunch of Languages (Added lots of new words to English and German, Added Russian, Added Japanese); A dozen new avatar options" — signed "Mel" — [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html) (copied from the real site's News panel).
- Old-version specifics from secondary sources: an eraser tool [mechanicsofmagic 2022](https://mechanicsofmagic.com/2022/04/20/critical-play-skribbl-io-6/); private rooms of "only up to 12 players" and custom words of "at least 4 words, each with a maximum of 30 characters" [mytour.vn guide](https://mytour.vn/en/blog/kinh-nghiem-hay/how-to-create-a-private-room-in-skribblio-mytour.html) (search snippets; **old version**). Before the update the drawer chose from a fixed 3 words, the usual description at the time — [CrazyGames (UA)](https://www.crazygames.com/ua/game/skribblio) (search snippet).
- After the update the room browser appeared ("View Rooms" and "Create Room"), and the custom-word cap was 10,000 characters in one client snapshot versus 20,000 in a newer one — [client game.js](https://github.com/ElijahKasler/website/blob/HEAD/projects/skribbl/js/game.js); [Zpayer index.html](https://github.com/Zpayer/Skribbl.io-Source-Code/blob/HEAD/index.html).

### Inferences
- "More colors" plus the current 26-colour palette implies the old palette was smaller (about 22 colours is the common recollection, but **unverified**). The old toolbar had an eraser and probably 4 sizes; both are **unverified** for the old version.
- Brush sizes, palette and canvas resolution have stayed the same since the redesign: the 2024 gist and the 2026 libraries match the client snapshot.

### Gaps
- The old version's exact draw-time and rounds options, palette size and brush-size count. Archive.org was not reachable to confirm them.
- Changes after 2022, such as the room browser's release date and the raise from 10k to 20k characters. Undated.
