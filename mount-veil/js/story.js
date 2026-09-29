"use strict";
// The story: Wren's climb. Scenes are lists of steps (dialogue, title cards, characters
// appearing and leaving, pauses) that play while the game waits. Some lines are
// "whispers": subtitles that drift across the top of the screen while you keep playing.
//
// Characters stand at [column, floor row] in room tiles: their feet rest on top of that row.

const WHO = {
  wren: { name: "Wren", voice: 520 },
  echo: { name: "The Echo", voice: 330 },
  voice: { name: "???", voice: 330, portrait: "shadow" },
  tilly: { name: "Tilly", voice: 380 },
  radio: { name: "Tilly (radio)", voice: 380, portrait: "tilly", radio: true },
  pascal: { name: "Pascal", voice: 440 },
  lumen: { name: "Lumen", voice: 700 },
  memory: { name: "", voice: 0, portrait: null },
};

const SCENES = {
  // ================================================================ Chapter 1: The Foothills
  c1_open: [
    { card: ["Mount Veil", "The trailhead, just past midnight."] },
    { actor: "tilly", kind: "tilly", room: "1", at: [11, 18], facing: -1, stay: true },
    { wait: 0.6 },
    { say: "tilly", text: "Nobody comes up this path at midnight unless they're running from something." },
    { say: "wren", mood: "happy", text: "I'm running TO something. Big difference." },
    { say: "tilly", text: "Mm. The mountain will decide that." },
    { say: "wren", text: "I'm Wren. I'm climbing Veil. Tonight, if the path lets me." },
    { say: "tilly", text: "Ottilie Marsh. Tilly. I draw the maps up here. Forty years, and not one of them has ever been right." },
    { say: "wren", text: "Wrong how?" },
    { say: "tilly", text: "Veil changes for whoever climbs it. It shows you what you carried up with you." },
    { say: "wren", mood: "happy", text: "I carried a backpack and some granola bars." },
    { say: "tilly", text: "Sure you did." },
    { say: "tilly", text: "Wild strawberries grow on the slopes. Bring me some, if you're still yourself on the way down." },
    { say: "wren", mood: "shocked", text: "...If?" },
    { say: "tilly", text: "Take this old radio. I get lonely talking to maps. Go on, then." },
  ],
  c1_w5: { whisper: [
    { who: "wren", text: "Isla would have made this a race." },
    { who: "wren", text: "She always won. She always cheated. She'd laugh the whole way up." },
  ] },
  c1_w9: { whisper: [
    { who: "radio", text: "Crumbling rock up there. Don't stand around admiring the view." },
  ] },
  c1_end: [
    { say: "wren", mood: "happy", text: "Ha! First camp. Not bad, Calder." },
    { say: "wren", text: "Okay. Day one." },
    { say: "wren", text: "You'd have hated that first hill, Isla. You'd have complained the whole way, then beaten me to the top." },
    { say: "wren", mood: "happy", text: "I'm doing it. Like we always said. 'Someday' is today." },
    { wait: 1.2 },
    { say: "voice", text: "...someday was supposed to be both of us." },
    { say: "wren", mood: "shocked", text: "Who's there?" },
    { wait: 1 },
    { say: "wren", text: "...Great. Talking to a hairclip AND hearing voices. Go to sleep, Wren." },
    { fade: "out" },
  ],

  // ================================================================ Chapter 2: Windswept Ridge
  c2_open: [
    { say: "radio", text: "Wind's picking up on the ridge. When it gusts, crouch. It can't push you if you're low." },
    { say: "wren", text: "Crouch. Got it. Anything else?" },
    { say: "radio", text: "The wind carries voices up there. Don't answer them." },
    { say: "wren", mood: "shocked", text: "Why would I answer the wind?" },
    { say: "radio", text: "Everyone does." },
  ],
  c2_4: [
    { actor: "echo", kind: "echo", room: "4", at: [25, 17], facing: -1 },
    { wait: 0.8 },
    { say: "echo", text: "You're walking too fast. You always walk too fast when you don't want to think." },
    { say: "wren", mood: "shocked", text: "Who... who are you? Why do you look like me?" },
    { say: "echo", text: "I'm the part of you that's tired." },
    { say: "wren", mood: "angry", text: "I'm not tired." },
    { say: "echo", text: "I'm SO tired, Wren." },
    { say: "echo", text: "Eight months. You haven't stopped moving once." },
    { say: "wren", mood: "angry", text: "Get out of my way." },
    { say: "echo", text: "I'm not in your way. I'm behind you. I always am." },
    { remove: "echo" },
    { wait: 0.6 },
    { say: "wren", text: "...'The wind carries voices. Don't answer them.' Great advice, Tilly." },
  ],
  c2_w9: { whisper: [
    { who: "echo", text: "You told Tilly you were running TO something." },
    { who: "echo", text: "So what were you running from, the night you left?" },
  ] },
  c2_end: [
    { say: "wren", mood: "happy", text: "Top of the ridge. See? Fine. Totally fine." },
    { say: "voice", text: "Not fine." },
    { say: "wren", mood: "angry", text: "Stop it! Stop finishing my sentences!" },
    { actor: "echo", kind: "echo", room: "12", at: [26, 14], facing: 1 },
    { wait: 0.6 },
    { say: "echo", text: "I don't finish them. I just say the half you swallow." },
    { say: "wren", mood: "angry", text: "Then swallow this: I don't need you. I don't need anybody. I'm climbing this mountain on my own." },
    { say: "echo", text: "That's the first true thing you've said all day." },
    { remove: "echo" },
    { fade: "out" },
  ],

  // ================================================================ Chapter 3: The False Summit
  c3_open: [
    { say: "wren", mood: "happy", text: "There. That peak, right there. That's the top." },
    { say: "radio", text: "Wren. You're high now. The air plays tricks up there." },
    { say: "wren", mood: "happy", text: "It's RIGHT THERE, Tilly. I can see the snow on it." },
    { say: "radio", text: "The pink crystals up there... old climbers said they grow where two hearts beat close together." },
    { say: "radio", text: "Touch one and you'll have two dashes in you, not one." },
    { say: "wren", text: "There's only one heart up here." },
    { say: "voice", text: "Is there?" },
  ],
  c3_w7: { whisper: [
    { who: "echo", text: "Two dashes. One for you, one for me." },
    { who: "echo", text: "Go on, borrow mine. You always borrowed her things too." },
  ] },
  c3_end: [
    { say: "wren", mood: "happy", text: "I did it. I DID it! Isla, look, we're on top of the—" },
    { peak: true },
    { shake: 0.5 },
    { wait: 2 },
    { say: "wren", mood: "shocked", text: "...No." },
    { say: "wren", mood: "shocked", text: "No, no, no. That was the top. That was supposed to be the top." },
    { say: "radio", text: "Wren? Talk to me. What do you see?" },
    { say: "wren", mood: "sad", text: "Another mountain. Behind this one. So much higher." },
    { say: "radio", text: "The false summit. Everybody hits that one." },
    { say: "wren", mood: "angry", text: "It's not FAIR! I did everything right! I kept going, I didn't stop, I didn't—" },
    { actor: "echo", kind: "echo", room: "12", at: [1, 14], facing: 1 },
    { wait: 1.2 },
    { say: "wren", mood: "sad", text: "Aren't you going to say something? Tell me I'm not fine?" },
    { say: "echo", text: "No. I'm just going to sit here with you." },
    { wait: 1 },
    { say: "radio", text: "Sit a while, Wren. It'll still be there in the morning." },
    { say: "wren", text: "No. I'm not stopping. If I stop, I sink." },
    { say: "echo", text: "I know. That's why I'm so heavy." },
    { fade: "out" },
  ],

  // ================================================================ Chapter 4: Clockwork City
  c4_open: [
    { card: ["Below the false summit, half-buried in fog,", "there is a city made of gears."] },
    { actor: "pascal", kind: "pascal", room: "1", at: [35, 18], facing: -1, stay: true },
    { wait: 0.5 },
    { say: "pascal", text: "Oh! Oh— a person! Hello! Sorry. Hello. I'm Pascal. You're a person." },
    { say: "wren", text: "Last time I checked. What is this place?" },
    { say: "pascal", text: "Clockwork City! Well. It was a mining town, until the mountain... tidied it up. Into gears." },
    { say: "pascal", text: "The old ore carts still run. Stand on one, or grab its side, and it'll take you where it's going." },
    { say: "pascal", text: "Jump just as it stops and it throws you. Very reliable. More reliable than people." },
    { say: "wren", text: "Do you live here? On your own?" },
    { say: "pascal", text: "I keep the clocks wound. All four hundred and twelve of them. So it's the right time when my father gets home." },
    { say: "wren", text: "...When's he getting home?" },
    { say: "pascal", text: "Soon! Probably. Could you do me a favour? The great Clock Tower stopped. If you could start it again, the city would be ready." },
    { say: "wren", text: "Sure. Why not." },
  ],
  c4_w4: { whisper: [
    { who: "pascal", text: "(far below) Careful with the winged strawberries! They were the town's carrier birds!" },
    { who: "pascal", text: "(far below) They scare if you dash near them!" },
  ] },
  c4_10: [
    { actor: "pascal", kind: "pascal", room: "10", at: [5, 20], facing: -1 },
    { wait: 0.5 },
    { say: "pascal", text: "You're fast! I took the tram. I wanted to ask you something. You came up from the valley..." },
    { say: "pascal", text: "Did you see anyone on the way? A man, about fifty. Grey coat. Far too many tools." },
    { say: "wren", text: "No. Nobody." },
    { say: "pascal", text: "He went up twelve years ago. He said, 'Keep the clocks right, Pascal. I'll be back before you know it.'" },
    { say: "pascal", text: "So I've kept them right. Every single one." },
    { say: "wren", mood: "angry", text: "Pascal. People who go up this mountain don't come back." },
    { say: "wren", mood: "angry", text: "You're winding clocks for a ghost. He's not coming, and you're wasting your whole life waiting." },
    { wait: 1.2 },
    { say: "pascal", text: "...Oh." },
    { say: "voice", text: "You were talking to yourself just then." },
    { say: "wren", mood: "sad", text: "Pascal, I— I didn't mean—" },
    { say: "pascal", text: "No, it's... it's fine. I should go. The clocks need winding." },
    { remove: "pascal" },
  ],
  c4_end: [
    { say: "wren", text: "Okay. The Clock Tower. One favour, then I'm gone." },
    { wait: 0.6 },
    { sfx: "chime" },
    { shake: 0.4 },
    { card: ["For the first time in twelve years,", "the Clock Tower chimes over the city."] },
    { say: "wren", mood: "happy", text: "Pascal? It's working! Pascal!" },
    { wait: 1.6 },
    { say: "wren", mood: "sad", text: "...He's not coming out." },
    { actor: "echo", kind: "echo", room: "12", at: [37, 6], facing: -1 },
    { wait: 0.6 },
    { say: "echo", text: "You could go back. Say sorry." },
    { say: "wren", text: "I don't have time." },
    { say: "echo", text: "You have nothing BUT time. You just can't stand to spend it standing still." },
    { remove: "echo" },
    { fade: "out" },
  ],

  // ================================================================ Chapter 5: Dream Hollow
  c5_open: [
    { card: ["Wren walks until her legs give out,", "and falls asleep at the mouth of a starlit cave."] },
    { actor: "lumen", kind: "lumen", room: "1", at: [27, 19], facing: -1 },
    { wait: 0.8 },
    { say: "lumen", text: "Shhh. You're safe. You're dreaming." },
    { say: "wren", mood: "shocked", text: "Who are you?" },
    { say: "lumen", text: "I'm Lumen. I keep the dreams people leave behind on the mountain. So many lovely ones, left lying in the snow." },
    { say: "lumen", text: "You don't have to climb in here. Dash into the starry stones and they'll carry you through, and give your dash back." },
    { say: "lumen", text: "And at the end of the hollow there's a house. Your house. Someone's waiting at the kitchen table." },
    { say: "wren", mood: "shocked", text: "...Isla?" },
    { say: "lumen", text: "She's asking how the climb went. Go and tell her." },
    { remove: "lumen" },
  ],
  c5_4: [
    { actor: "lumen", kind: "lumen", room: "4", at: [20, 8], facing: 1 },
    { wait: 0.6 },
    { say: "lumen", text: "Ah. The waking lights. Please don't touch them." },
    { say: "lumen", text: "Each one is something true. True things are so heavy, Wren. Why would you carry them?" },
    { say: "wren", text: "The gate won't open unless I light them." },
    { say: "lumen", text: "Then don't open it. Stay. It's warm in here." },
    { remove: "lumen" },
  ],
  c5_w8: { whisper: [
    { who: "lumen", text: "Careful. Rocks hide inside dreams too." },
    { who: "lumen", text: "The things you won't look at are always the ones you run into." },
  ] },
  c5_end: [
    { say: "wren", text: "The house should be right here. Isla? ...ISLA?" },
    { actor: "lumen", kind: "lumen", room: "12", at: [29, 16], facing: -1 },
    { wait: 0.6 },
    { say: "lumen", text: "I'm sorry. You lit the lights. You can't un-know what they showed you." },
    { say: "lumen", text: "You'll wake now. I hope it doesn't hurt too much." },
    { remove: "lumen" },
    { fade: "out" },
    { card: ["Wren wakes up gasping.", "It's still dark."] },
    { actor: "echo", kind: "echo", room: "12", at: [31, 16], facing: 1 },
    { fade: "in" },
    { wait: 1 },
    { say: "echo", text: "You think she died angry at you." },
    { wait: 1.5 },
    { say: "wren", mood: "sad", text: "..." },
    { say: "echo", text: "You never played it. The voicemail. It's still on your phone." },
    { say: "wren", mood: "sad", text: "If I play it and she's angry, then that's the last thing she ever said to me. Forever." },
    { say: "echo", text: "And if you don't, you'll never know." },
    { say: "wren", mood: "sad", text: "...I know." },
    { fade: "out" },
    { card: ["Wren doesn't sleep again that night."] },
  ],

  // ================================================================ Chapter 6: The Lantern Terraces
  c6_open: [
    { card: ["Morning.", "Wren climbs out of the hollow onto old terraced fields, strung with paper lanterns."] },
    { actor: "echo", kind: "echo", room: "1", at: [6, 17], facing: -1 },
    { wait: 0.8 },
    { say: "wren", text: "You can walk with me. Just... quietly." },
    { say: "echo", text: "I'm always quiet. You're just listening now." },
    { say: "wren", mood: "angry", text: "That's not— fine. Whatever." },
    { say: "radio", text: "Wren? Oh, thank goodness. You've been off the air all night." },
    { say: "wren", text: "Sorry. Bad dream." },
    { say: "radio", text: "Terrace clouds ahead. They'll hold you, then spring back up. Jump as they rise and they'll throw you high." },
    { say: "radio", text: "The pink ones only hold you once." },
    { say: "echo", text: "Like most things." },
  ],
  c6_w3: { whisper: [
    { who: "echo", text: "You used to bounce on Isla's bed like this." },
    { who: "echo", text: "She'd pretend to be angry. She never was." },
  ] },
  c6_6: [
    { actor: "pascal", kind: "pascal", room: "6", at: [33, 20], facing: -1 },
    { wait: 0.5 },
    { say: "pascal", text: "Wren! Wait! Wait... hold on... I need a minute. Or ten." },
    { say: "wren", mood: "shocked", text: "Pascal? You left the city?" },
    { say: "pascal", text: "Twelve years, and the first time past the gate. I've fallen off three clouds and been glared at by a very rude goat." },
    { say: "pascal", text: "You were right, you know. Well. You were horrible. But you were a bit right." },
    { say: "wren", mood: "sad", text: "Pascal, what I said... I wasn't really talking about you. I was talking about me." },
    { say: "pascal", text: "I figured. Nobody gets that angry about somebody else's father." },
    { say: "wren", mood: "sad", text: "I'm sorry." },
    { say: "pascal", text: "Accepted. Completely. Now: the stone carts up ahead. Stand on one and it rolls the way its arrow points, until it hits something." },
    { say: "pascal", text: "Then it goes CRUNCH, and comes back a bit later. Don't be on it for the crunch." },
    { say: "pascal", text: "You go on. I climb at the speed of a very careful snail." },
  ],
  c6_w9: { whisper: [
    { who: "pascal", text: "(far below) I'm fine! That was on purpose!" },
  ] },
  c6_w10: { whisper: [
    { who: "radio", text: "Nice rolling, Calder. Mind the crunch." },
  ] },
  c6_end: [
    { say: "wren", text: "The top of the terraces. Look at all those lanterns down in the valley." },
    { card: ["Far below, one by one, lanterns flicker on.", "They spell out a word: PROUD."] },
    { say: "wren", mood: "shocked", text: "Tilly... she can't even see me from down there." },
    { actor: "echo", kind: "echo", room: "12", at: [29, 8], facing: 1 },
    { wait: 0.6 },
    { say: "echo", text: "She doesn't need to." },
    { say: "wren", mood: "sad", text: "Something's in my eye." },
    { say: "echo", mood: "sad", text: "Mine too. Both of mine." },
    { say: "radio", text: "Don't you two cry on my radio. It's older than both of you." },
    { fade: "out" },
  ],

  // ================================================================ Chapter 7: The Hall of Stillness
  c7_open: [
    { card: ["At the top of the terraces stands a temple of pale glass.", "Inside it, nothing moves at all."] },
    { actor: "pascal", kind: "pascal", room: "1", at: [6, 17], facing: -1 },
    { wait: 0.5 },
    { say: "pascal", text: "Oh, I don't like it in here. Listen. No clocks. Not one single tick." },
    { say: "wren", text: "It's just an old temple." },
    { say: "echo", text: "It's holding its breath." },
    { say: "radio", text: "Wr... -emple... don't stay... anything that stops in there... st..." },
    { say: "wren", mood: "shocked", text: "Tilly? Tilly!" },
    { say: "pascal", text: "The blocks in here only move when you do. Every time you dash, they swap places. All of them. At once." },
    { say: "wren", text: "Of course they do." },
  ],
  c7_3: [
    { actor: "pascal", kind: "pascal", room: "3", at: [4, 7], facing: 1 },
    { wait: 0.5 },
    { say: "pascal", text: "Wren, look. Over there. That's Dad's workbench. His tools. Exactly how he left them." },
    { say: "wren", text: "Pascal, it isn't real. Keep walking." },
    { say: "pascal", text: "Just one second. I only want to—" },
    { actor: "pascal", kind: "pascalFrozen", room: "3", at: [4, 7], facing: 1, stay: true },
    { sfx: "freeze" },
    { shake: 0.3 },
    { wait: 0.8 },
    { say: "wren", mood: "shocked", text: "Pascal? PASCAL!" },
    { say: "echo", text: "He's stuck inside the moment he can't let go of. This place keeps those." },
    { say: "wren", mood: "angry", text: "How do I get him out?" },
    { say: "echo", text: "Find out what really happened to his father. The truth is the only thing that moves in here." },
    { say: "echo", text: "The green bubbles hold you, then dash you. Go." },
  ],
  c7_w5: { whisper: [
    { who: "echo", text: "The red ones don't stop until you hit something." },
    { who: "echo", text: "You'd know all about that." },
  ] },
  c7_8: [
    { actor: "journal", kind: "journal", room: "8", at: [4, 9], facing: 1 },
    { wait: 0.6 },
    { say: "wren", text: "A journal. 'Property of Aurel Ferro, clockmaker.' That's Pascal's father." },
    { card: ["'Day 40. The summit, at last. I thought I'd feel finished.", "Instead, all I want is to see what's on the other side.'"] },
    { card: ["'Day 41. I'm not going back.", "Pascal will be fine. He was always more grown-up than me.'"] },
    { say: "wren", mood: "angry", text: "He didn't die. He just... didn't come back. He CHOSE not to." },
    { say: "echo", text: "Are you going to tell Pascal?" },
    { say: "wren", mood: "sad", text: "...Yes. Later. Gently. Not in here." },
    { remove: "journal" },
  ],
  c7_11: [
    { actor: "pascal", kind: "pascal", room: "11", at: [38, 8], facing: -1 },
    { wait: 0.5 },
    { say: "pascal", text: "Wren! There you are. I was standing at Dad's bench for... hours? Then everything just let go of me." },
    { say: "pascal", text: "Did you find anything? About him?" },
    { say: "wren", mood: "sad", text: "...Let's get out of this temple first. Then I'll tell you everything. I promise." },
    { say: "pascal", text: "That sounds like a sit-down-first kind of story." },
    { say: "wren", text: "It is." },
  ],
  c7_12: [
    { actor: "mirror", kind: "mirror", room: "12", at: [37, 16], facing: 1, stay: true },
    { wait: 0.6 },
    { say: "echo", text: "Wren. Stay away from that mirror." },
  ],
  c7_end: [
    { say: "wren", text: "It's a mirror. The whole heart of the temple is one big mirror." },
    { actor: "echo", kind: "echo", room: "12", at: [35, 16], facing: -1 },
    { actor: "pascal", kind: "pascal", room: "12", at: [29, 16], facing: 1 },
    { wait: 0.6 },
    { say: "wren", text: "It keeps reflections. That's what this whole place does. It keeps things." },
    { say: "echo", text: "Wren. Don't." },
    { say: "wren", mood: "angry", text: "I can't finish this climb with you screaming in my ear." },
    { say: "echo", text: "I haven't said a word since the terraces." },
    { say: "wren", mood: "angry", text: "You don't have to! I can feel you, every single step. It's so HEAVY." },
    { say: "echo", mood: "sad", text: "That's not me being heavy, Wren. That's her. I'm just the one carrying her." },
    { say: "wren", mood: "angry", text: "Then stay here and carry her." },
    { remove: "echo" },
    { sfx: "freeze" },
    { shake: 0.4 },
    { card: ["The mirror ripples once, and goes still.", "For the first time in eight months, Wren feels light."] },
    { say: "pascal", text: "Wren? Where did she go?" },
    { say: "wren", text: "Somewhere quiet." },
    { say: "pascal", text: "...Are you sure that was a good idea?" },
    { say: "wren", mood: "happy", text: "I feel fine." },
    { wait: 1.5 },
    { card: ["Nobody answers \"not fine\"."] },
  ],

  // Played when the story runs past the last chapter that's been built so far.
  fog: [
    { card: ["Above, the path disappears into thick fog.", "Wren will have to wait for it to lift."] },
    { card: ["(The rest of Wren's climb is on its way.", "Your progress is saved. Come back soon.)"] },
  ],
};

// When scenes play: at the start and end of a chapter, the first time you enter a room,
// and (in Dream Hollow) as each waking light is lit.
const TRIGGERS = {
  c6: { start: "c6_open", end: "c6_end", enter: { 3: "c6_w3", 6: "c6_6", 9: "c6_w9", 10: "c6_w10" } },
  c7: { start: "c7_open", end: "c7_end", enter: { 3: "c7_3", 5: "c7_w5", 8: "c7_8", 11: "c7_11", 12: "c7_12" } },
  c1: { start: "c1_open", end: "c1_end", enter: { 5: "c1_w5", 9: "c1_w9" } },
  c2: { start: "c2_open", end: "c2_end", enter: { 4: "c2_4", 9: "c2_w9" } },
  c3: { start: "c3_open", end: "c3_end", enter: { 7: "c3_w7" } },
  c4: { start: "c4_open", end: "c4_end", enter: { 4: "c4_w4", 10: "c4_10" } },
  c5: {
    start: "c5_open", end: "c5_end", enter: { 4: "c5_4", 8: "c5_w8" },
    switches: {
      4: [
        { who: "memory", text: "'You stretched my green jacket.' 'It's a jacket, Wren.' 'It's MY jacket, Isla.'" },
        { who: "memory", text: "The phone buzzing on the counter. ISLA CALLING. Wren turns it face down." },
        { who: "memory", text: "One new voicemail. Swipe to dismiss. Every day, for eight months." },
      ],
      6: [
        { who: "memory", text: "The funeral. Everyone saying 'she loved you so much'. Wren nodding. Not believing them." },
        { who: "memory", text: "Isla's climbing boots by the door. Wren still hasn't moved them." },
      ],
      9: [
        { who: "memory", text: "Isla, age ten, dragging her up the hill behind the house: 'Someday we'll climb a real one.'" },
        { who: "memory", text: "The last text Wren sent her: 'whatever.'" },
        { who: "memory", text: "The call came at 11:52. Wren was awake. She watched it ring." },
      ],
    },
  },
};

// ---------------------------------------------------------------------------- the runner

const Story = {
  active: null,     // the scene playing: { id, steps, i, t, onDone, typed, full }
  actors: [],       // characters standing in the world: { id, kind, room, x, y, facing, alpha, target, stay }
  whispers: [],     // queued subtitle lines
  whisperT: 0,
  game: null,
  el: {},

  init() {
    for (const id of ["dialog", "dPortrait", "dName", "dText", "dMore", "card", "cardText", "whisper", "fade"]) this.el[id] = document.getElementById(id);
    const adv = (e) => { e.preventDefault(); this.press(); };
    this.el.dialog.addEventListener("pointerdown", adv);
    this.el.card.addEventListener("pointerdown", adv);
  },

  reset(game) {
    this.game = game;
    this.actors.length = 0;
    this.whispers.length = 0;
    this.whisperT = 0;
    this.el.whisper.classList.remove("show");
    if (this.active) this.finish(true);
    this.setFade(0);
  },

  // Run a scene; onDone is called when it ends (or is skipped).
  play(id, game, onDone, prefix) {
    const sc = SCENES[id] || (prefix ? [] : null);
    if (!sc || sc.whisper) { if (sc) this.whisper(sc.whisper); if (onDone) onDone(); return; }
    this.game = game || this.game;
    this.active = { id, steps: (prefix || []).concat(sc), i: -1, t: 0, onDone, pressed: false };
    this.next();
  },

  whisper(lines) {
    for (const l of lines) this.whispers.push(l);
  },

  press() { if (this.active) this.active.pressed = true; },

  next() {
    const a = this.active;
    a.i++; a.t = 0; a.pressed = false;
    this.el.dialog.classList.remove("show");
    if (a.i >= a.steps.length) { this.finish(); return; }
    const s = a.steps[a.i];
    if (s.say) {
      const w = WHO[s.say];
      this.el.dName.textContent = w.name;
      this.el.dName.hidden = !w.name;
      this.el.dialog.classList.toggle("radio", !!w.radio);
      this.el.dialog.classList.toggle("memory", s.say === "memory");
      const pk = w.portrait === undefined ? s.say : w.portrait;
      this.el.dPortrait.hidden = !pk;
      if (pk) drawPortrait(this.el.dPortrait, pk, s.mood || "normal");
      a.full = s.text; a.typed = 0;
      this.el.dText.textContent = "";
      this.el.dMore.hidden = true;
      // Keep the box out of the way: if the characters are low on screen, show it at the top.
      const g = this.game, cam = typeof Render !== "undefined" ? Render.cam : null;
      let low = false;
      if (g && cam) {
        const ys = [g.p.y].concat(this.actors.filter((x) => x.target > 0 && x.room === g.room.id).map((x) => x.y));
        low = Math.max(...ys) - cam.y > VIEW_H * 0.58;
      }
      this.el.dialog.classList.toggle("top", low);
      this.el.dialog.classList.add("show");
    } else if (s.card) {
      this.el.cardText.innerHTML = s.card.map((l) => `<p>${esc(l)}</p>`).join("");
      this.el.card.classList.toggle("chapter", !!s.chapter);
      this.el.card.classList.add("show");
    } else if (s.actor) {
      const g = this.game, room = g.roomIndex[s.room];
      const old = this.actors.find((x) => x.id === s.actor);   // replacing someone keeps them visible
      this.actors = this.actors.filter((x) => x !== old);
      this.actors.push({
        id: s.actor, kind: s.kind, room: s.room, stay: !!s.stay, facing: s.facing || 1,
        x: (room.tx + s.at[0]) * TILE + 4, y: (room.ty + s.at[1]) * TILE, alpha: old ? old.alpha : 0, target: 1,
      });
      if (typeof Render !== "undefined") Render.effect({ type: "actorIn", x: (room.tx + s.at[0]) * TILE + 4, y: (room.ty + s.at[1]) * TILE - 6, kind: s.kind }, g);
      this.next();
    } else if (s.remove) {
      const act = this.actors.find((x) => x.id === s.remove);
      if (act) { act.target = 0; if (typeof Render !== "undefined") Render.effect({ type: "actorOut", x: act.x, y: act.y - 6, kind: act.kind }, this.game); }
      this.next();
    } else if (s.peak) {
      Render.farPeakTarget = 1;
      this.next();
    } else if (s.shake) {
      Render.shake(s.shake, 2);
      this.next();
    } else if (s.sfx) {
      Sound.play({ type: s.sfx });
      this.next();
    }
    // wait and fade steps are handled in update()
  },

  update(dt, pressed) {
    const a = this.active;
    if (!a) return;
    if (pressed) a.pressed = true;
    const s = a.steps[a.i];
    a.t += dt;
    if (s.say) {
      if (a.typed < a.full.length) {
        const before = Math.floor(a.typed);
        a.typed = Math.min(a.full.length, a.typed + dt * 55);
        const now = Math.floor(a.typed);
        this.el.dText.textContent = a.full.slice(0, now);
        if (now !== before && now % 3 === 0 && /\w/.test(a.full[now - 1] || "")) Sound.play({ type: "blip", pitch: WHO[s.say].voice });
        if (a.pressed) { a.typed = a.full.length; this.el.dText.textContent = a.full; a.pressed = false; }
        if (a.typed >= a.full.length) this.el.dMore.hidden = false;
      } else if (a.pressed) {
        this.next();
      }
    } else if (s.card) {
      if (a.pressed && a.t > 0.5) { this.el.card.classList.remove("show"); this.next(); }
      else a.pressed = false;
    } else if (s.wait !== undefined) {
      a.pressed = false;
      if (a.t >= s.wait) this.next();
    } else if (s.fade) {
      a.pressed = false;
      const k = Math.min(1, a.t / 0.7);
      this.setFade(s.fade === "out" ? k : 1 - k);
      if (k >= 1) this.next();
    }
  },

  // Every frame, scene or not: fade characters in and out, and run the whispers.
  tick(dt) {
    for (const act of this.actors) act.alpha += Math.sign(act.target - act.alpha) * Math.min(Math.abs(act.target - act.alpha), dt * 2.5);
    this.actors = this.actors.filter((x) => x.target > 0 || x.alpha > 0);
    if (this.whisperT > 0) {
      this.whisperT -= dt;
      if (this.whisperT <= 0.4) this.el.whisper.classList.remove("show");
    }
    if (this.whisperT <= 0 && this.whispers.length) {
      const l = this.whispers.shift();
      const w = WHO[l.who];
      this.el.whisper.innerHTML = (w.name && l.who !== "memory" ? `<b>${esc(w.name)}</b> ` : "") + esc(l.text);
      this.el.whisper.className = "whisper show" + (l.who === "memory" ? " memory" : "") + (w.radio ? " radio" : "");
      this.whisperT = 2.6 + l.text.length * 0.045;
    }
  },

  finish(silent) {
    const a = this.active;
    this.active = null;
    this.el.dialog.classList.remove("show");
    this.el.card.classList.remove("show");
    // Characters leave with the scene unless they live in that spot.
    for (const act of this.actors) if (!act.stay) act.target = 0;
    this.setFade(0);
    if (!silent && a && a.onDone) a.onDone();
  },

  // Skip the rest of the scene, keeping its lasting effects.
  skip() {
    const a = this.active;
    if (!a) return;
    for (let i = a.i + 1; i < a.steps.length; i++) if (a.steps[i].peak) Render.farPeakTarget = 1;
    this.finish();
  },

  setFade(v) { this.el.fade.style.opacity = String(v); },
};

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

// ---------------------------------------------------------------------------- portraits

// Pixel-art portraits, 32×32, drawn in code (shown enlarged with crisp pixels).
function drawPortrait(canvas, who, mood) {
  const g = canvas.getContext("2d");
  canvas.width = 32; canvas.height = 32;
  const r = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const bg = { wren: ["#4a2a4a", "#2a1830"], echo: ["#2a2850", "#161430"], shadow: ["#15121f", "#0a0810"], tilly: ["#2f4a3a", "#1a2a20"], pascal: ["#4a3624", "#261a10"], lumen: ["#3a3070", "#1c1840"] }[who] || ["#333", "#111"];
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, bg[0]); grad.addColorStop(1, bg[1]);
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);

  if (who === "lumen") {
    // A moth spirit: soft wings, a fluffy round face, big dark eyes, feathery antennae.
    r("rgba(230,220,255,0.35)", 1, 8, 9, 16); r("rgba(230,220,255,0.35)", 22, 8, 9, 16);
    r("rgba(255,240,200,0.5)", 3, 12, 5, 6); r("rgba(255,240,200,0.5)", 24, 12, 5, 6);
    r("#efe8ff", 9, 9, 14, 14); r("#efe8ff", 8, 11, 16, 10); r("#ffffff", 11, 8, 10, 2);
    r("#1a1430", 11, 14, 4, 4); r("#1a1430", 17, 14, 4, 4); r("#ffffff", 12, 14, 1, 1); r("#ffffff", 18, 14, 1, 1);
    r("#d9c9ff", 12, 3, 1, 5); r("#d9c9ff", 19, 3, 1, 5); r("#d9c9ff", 10, 2, 2, 1); r("#d9c9ff", 20, 2, 2, 1);
    r("#cbb8f5", 14, 20, 4, 1);
    r("#e9dfff", 10, 23, 12, 9);
    return;
  }
  const P = {
    wren: { hair: "#AC3232", hairD: "#7a2020", skin: "#f5cfa6", eye: "#1b1726", coat: "#f0a13c" },
    echo: { hair: "#c9c0ee", hairD: "#9b92c8", skin: "#eceaff", eye: "#3b2f70", coat: "#d7d3ee" },
    shadow: { hair: "#2a2438", hairD: "#1c1828", skin: "#2e2840", eye: "#b8b0e0", coat: "#24202f" },
    tilly: { hair: "#d9d6d0", hairD: "#a9a6a0", skin: "#e8c39e", eye: "#2a2020", coat: "#3e6b52" },
    pascal: { hair: "#3a281c", hairD: "#24180f", skin: "#d9a57a", eye: "#1a1410", coat: "#8a5a3a" },
  }[who];
  // Shoulders and coat
  r(P.coat, 5, 26, 22, 6);
  if (who === "pascal") { r("#e8e0d0", 12, 26, 8, 6); r(P.coat, 13, 27, 6, 5); }
  if (who === "tilly") { r("#2f5540", 5, 27, 22, 1); }
  // Neck and face
  r(P.skin, 13, 22, 6, 4);
  r(P.skin, 9, 9, 14, 14); r(P.skin, 10, 23, 12, 1);
  // Hair
  if (who === "wren" || who === "echo" || who === "shadow") {
    r(P.hair, 8, 5, 16, 5); r(P.hair, 7, 8, 3, 12); r(P.hair, 22, 8, 3, 10); r(P.hairD, 6, 14, 2, 10);
    r(P.hair, 10, 9, 6, 2);
    if (who === "wren") { r("#e8e8f0", 20, 7, 3, 2); r("#d8323f", 21, 7, 2, 1); }   // Isla's hairclip
  } else if (who === "tilly") {
    r(P.hair, 9, 5, 14, 5); r(P.hair, 12, 2, 8, 4); r(P.hairD, 8, 8, 2, 7); r(P.hairD, 22, 8, 2, 7);
    r("#6a5a4a", 10, 13, 5, 1); r("#6a5a4a", 17, 13, 5, 1); r("#6a5a4a", 15, 14, 2, 1);   // glasses
  } else if (who === "pascal") {
    r(P.hair, 8, 4, 16, 6); r(P.hair, 7, 6, 2, 5); r(P.hair, 23, 6, 2, 5);
    r(P.hairD, 9, 4, 2, 2); r(P.hairD, 14, 3, 3, 2); r(P.hairD, 20, 4, 2, 2);
    r("#c9a25a", 9, 8, 14, 2); r("#8fd3e8", 11, 8, 3, 2); r("#8fd3e8", 18, 8, 3, 2);   // goggles
    r("#b8805a", 11, 17, 1, 1); r("#b8805a", 20, 17, 1, 1); r("#b8805a", 12, 18, 1, 1);  // freckles
  }
  // Eyes, brows and mouth by mood
  const ey = 14;
  const eyeH = mood === "shocked" ? 3 : mood === "sad" ? 1 : 2;
  r(P.eye, 12, ey + (mood === "sad" ? 1 : 0), 2, eyeH); r(P.eye, 18, ey + (mood === "sad" ? 1 : 0), 2, eyeH);
  if (who !== "shadow") { r("#ffffff", 12, ey, 1, 1); r("#ffffff", 18, ey, 1, 1); }
  const brow = who === "tilly" ? "#a9a6a0" : P.hairD;
  if (mood === "angry") { r(brow, 11, 11, 2, 1); r(brow, 13, 12, 1, 1); r(brow, 19, 11, 2, 1); r(brow, 18, 12, 1, 1); }
  else if (mood === "sad") { r(brow, 11, 12, 1, 1); r(brow, 12, 11, 2, 1); r(brow, 18, 11, 2, 1); r(brow, 20, 12, 1, 1); }
  else if (mood === "shocked") { r(brow, 11, 10, 3, 1); r(brow, 18, 10, 3, 1); }
  else { r(brow, 11, 11, 3, 1); r(brow, 18, 11, 3, 1); }
  const m = "#8a3a3a";
  if (who === "shadow") return;
  if (mood === "happy") { r(m, 13, 19, 6, 1); r(m, 12, 18, 1, 1); r(m, 19, 18, 1, 1); }
  else if (mood === "sad") { r(m, 14, 19, 4, 1); r(m, 13, 20, 1, 1); r(m, 18, 20, 1, 1); }
  else if (mood === "angry") { r(m, 13, 19, 6, 1); }
  else if (mood === "shocked") { r(m, 14, 18, 4, 3); }
  else r(m, 14, 19, 4, 1);
  if (who === "echo") { g.fillStyle = "rgba(20,16,40,0.25)"; for (let y = 0; y < 32; y += 2) g.fillRect(0, y, 32, 1); }
}
