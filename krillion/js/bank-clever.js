"use strict";
// "Too Clever" answers: outside the box, but still technically correct.
// Loaded after the prompt files; merged into the bank by tiersFor().

BANK_SOURCES.push({
  "Name a famous painter": {
    c: "adolf hitler/hitler|winston churchill/churchill|george w bush/george bush/w bush|king charles/prince charles/charles iii|dwight eisenhower/eisenhower|samuel morse|sylvester stallone/stallone|joni mitchell|bob dylan|david bowie|paul mccartney|john lennon|ronnie wood|tony bennett|jim carrey|viggo mortensen|pierce brosnan|anthony hopkins|captain beefheart|tom sawyer|a face painter|a nail artist|a sign painter|a decorator|a painting elephant|a painting robot",
  },
  "Name a type of rock or mineral": {
    c: "alcatraz|plymouth rock|chris rock|kid rock|rocky balboa/rocky|pop rocks|rock candy|space rock|kidney stone|gallstone|emma stone|sharon stone|joss stone|stone cold steve austin|fred flintstone|rosetta stone|philosopher's stone|infinity stone|stonehenge|blarney stone|stepping stone|milestone|keystone|cornerstone|table salt|ice|snow|a snowflake|diamond ring|pencil lead|a pencil|kitty litter|cat litter|toothpaste",
  },
  "Name a fruit": {
    c: "aubergine|chili pepper|courgette|okra|green bean|corn kernel|acorn|peanut|blackberry phone|fruit ninja|fruit of the loom|fruitcake",
  },
  "Name a dog breed": {
    c: "mongrel|heinz 57|crossbreed|good boy|doggo|pupper|puppy|dug|big red dog|bluey|bingo",
  },
  "Name a country in Africa": {
    c: "rhodesia|zaire|abyssinia|dahomey|upper volta|bechuanaland|gold coast|tanganyika|zanzibar|basutoland|nyasaland|somaliland|western sahara|sahrawi republic|biafra|carthage|kush|kingdom of kush|ancient egypt|mali empire|songhai|great zimbabwe|aksum|axum",
  },
  "Name a country in Asia": {
    c: "kampuchea|hyderabad|the soviet union|ussr|north vietnam|south vietnam|south yemen|tartary|cathay|hindustan|nippon|joseon|goryeo|babylon|assyria|sumer|akkad",
  },
  "Name a country in Europe": {
    c: "prussia|yugoslavia|czechoslovakia|east germany|west germany|the soviet union|ussr|austria hungary|the holy roman empire|bohemia|bavaria|saxony|republic of venice|venice|sardinia|the papal states|ladonia|liberland|seborga|gaul|hibernia|albion|caledonia|lusitania|byzantium|sparta|athens",
  },
  "Name a country in South America": {
    c: "gran colombia|new granada|the galapagos/galapagos|rapa nui|the inca empire|tawantinsuyu",
  },
  "Name a US president": {
    c: "peyton randolph|john hancock|sam houston|anson jones|mirabeau lamar|david g burnet|president whitmore|my class president|the student council president|potus|the commander in chief",
  },
  "Name a US state": {
    c: "franklin/state of franklin|deseret/state of deseret|jefferson/state of jefferson|sequoyah/state of sequoyah|westsylvania|absaroka|superior/state of superior|lincoln|nickajack|transylvania colony|new connecticut|vermont republic",
  },
  "Name a NATO phonetic alphabet word": {
    c: "niner|fower|fife|tree|nadazero|unaone|bissotwo|terrathree|kartefour|pantafive|soxisix|setteseven|oktoeight|novenine|decimal|stop|hundred|thousand",
  },
  "Name a Shakespeare play": {
    c: "love's labour's won|sir thomas more|double falsehood|arden of faversham",
  },
});

BANK_SOURCES.push({
  "Name a musical instrument": {
    c: "your voice|vocal cords|hands|jug|musical saw|saw|wine glasses|glass harp|rubber band|a bucket|pots and pans|air drums|car horn|a leaf|blade of grass|typewriter|a stomp|a cup|cup game|bottle|bottle blowing|bike bell",
  },
  "Name a planet, moon or dwarf planet": {
    c: "planet hollywood|animal planet|namek|cybertron|hoth|endor|gallifrey|that's no moon|harvest moon|moonwalk|moonlight|blood moon",
  },
  "Name a bird": {
    c: "woodstock|zazu|iago|flappy bird|angry birds|red|toucan sam|woody woodpecker|daffy duck|donald duck|scrooge mcduck|hawkeye|hawkman|the mighty ducks|seahawks|larry the twitter bird|the twitter bird|any dinosaur",
  },
  "Name a chemical element": {
    c: "earth|aether/ether|the fifth element|heart|the element of surprise|mithril|unobtainium|dilithium|naquadah|a periodic table",
  },
  "Name a dinosaur": {
    c: "emu|hummingbird|robin|duck|penguin|parrot|cera|petrie|ducky|spike|reptar|arlo|toronto raptors|grandpa|my grandpa|a fossil",
  },
  "Name a vegetable": {
    c: "pizza|crisps|mr potato head|bob the tomato|larry the cucumber|popeye's spinach|vegetable soup",
  },
  "Name a sport": {
    c: "cheese rolling|toe wrestling|bog snorkelling|extreme ironing|calvinball|rock paper scissors|staring contest|thumb wrestling|speedcubing|sport stacking|cup stacking|tag|hide and seek|musical chairs|duck duck goose|competitive napping|pooh sticks|egg and spoon race|sack race|three legged race",
  },
  "Name a color": {
    c: "grue|bleen|blurple|vantablack|unmellow yellow|macaroni and cheese|tickle me pink|purple mountains majesty|fuzzy wuzzy|millennial pink|international klein blue|klein blue|the color purple|true colors|colour of money|transparent",
  },
  "Name a tree": {
    c: "phone tree|an ent|whomping willow|the great deku tree|deku tree|grandmother willow|truffula tree|yggdrasil|the faraway tree|the magic faraway tree",
  },
  "Name a flower": {
    c: "a river|a tap|a faucet|broccoli|artichoke|saffron|cloves|capers|flower from bambi|daisy duck|princess daisy|rose tyler|lily potter|flower power|a flowerpot|a sunflower seed",
  },
  "Name an ocean creature": {
    c: "patrick star|squidward|mr krabs|sebastian|flounder|ursula|namor|moby dick|jaws|bruce the shark|crush|a scuba diver|a surfer|michael phelps|a submarine captain|captain nemo",
  },
  "Name a fish you can eat": {
    c: "fish cake|crab sticks|surimi|cod liver oil|tuna melt|fish taco|sashimi|kipper|caviar",
  },
});

BANK_SOURCES.push({
  "Name a board game": {
    c: "jumanji|zathura|wizard chess/wizard's chess|dejarik/holochess|cyvasse|pai sho|a bored game",
  },
  "Name a Greek god or goddess": {
    c: "nike shoes|nike swoosh|hermes bags|olympus camera|pandora's box|apollo creed|apollo 11|achilles heel",
  },
  "Name a spice or herb": {
    c: "melange|the spice from dune|herbie|herbie the love bug|basil of baker street|basil fawlty|sugar and spice|sugar",
  },
  "Name an insect": {
    c: "flik|atta|hopper|the very hungry caterpillar|the green hornet|beetlejuice|maya the bee|barry b benson|bugs bunny",
  },
  "Name something you'd find at the beach": {
    c: "sandy cheeks|freckles|a treasure map|pirate treasure|a mermaid|a shipwreck|baywatch|ice cream drips|sandy feet|sand in your sandwich|a seagull stealing chips|a lost flip flop|moana|the horizon|sunset|sunrise",
  },
  "Name a word that starts with 'Z'": {
    c: "zoinks|zippity doo dah|zelda|zuko|zeus|zendaya|zayn|zoboomafoo|zig and zag",
  },
  "Name an NFL team": {
    c: "brooklyn dodgers",
  },
  "Name an NBA team": {
    c: "",
  },
  "Name a programming language": {
    c: "json|yaml|markdown|latex|plain english|machine code|chef|piet|rockstar|emojicode|turtle|minecraft redstone/redstone|excel|excel formulas|powerpoint|magic the gathering|scratch jr",
  },
  "Name a superhero": {
    c: "my dad|my mom|a lifeguard|a paramedic|dog man|bananaman|superted|danger mouse|super mario|super grover|underdog",
  },
  "Name a type of weather": {
    c: "frozone|jack frost|frosty the snowman|meatball rain|a hail mary|fair weather|a stormy mood|indoor rain|the weather girl|snow white|a rain check",
  },
  "Name a word that rhymes with 'cat'": {
    c: "the cat in the hat|aristocat|top cat|this and that",
  },
  "Name a word that rhymes with 'ring'": {
    c: "ka ching|cha ching|bling bling|burger king|the lion king|stephen king|yao ming|ming the merciless|bing",
  },
});

BANK_SOURCES.push({
  "Name a cocktail": {
    c: "prawn cocktail|cocktail sauce|a mocktail|virgin mojito|virgin pina colada|cocktail sausage|cocktail stick|a milkshake|a smoothie",
  },
  "Name a famous ship": {
    c: "the going merry|the thousand sunny|serenity|planet express ship|the starship enterprise|the jolly roger|the dawn treader|spaceship earth|a ship in a bottle|the hispaniola",
  },
  "Name a Disney animated movie": {
    c: "steamboat willie|flowers and trees|the skeleton dance|the three little pigs|paperman|feast|get a horse|the lion king 1½|cinderella iii|lilo and stitch 2|the old mill|ferdinand the bull",
  },
  "Name a fabric": {
    c: "the fabric of society|kevlar|nomex|tyvek|dyneema|mithril|unstable molecules|cotton candy|paper",
  },
  "Name something in a kitchen": {
    c: "mom|dad|grandma|crumbs|grease|smoke alarm|the smell of cookies|a fridge magnet|the cat on the counter|remy the rat|the dog begging|hunger|a midnight snack|a mess",
  },
  "Name an Olympic event": {
    c: "painting|sculpture|literature|architecture|hot air ballooning|breakdancing|the olympics itself",
  },
  "Name a dessert": {
    c: "second dessert|seconds|fruit|an apple|a cheese plate|cheese board|a mint|after dinner mint|fortune cookie|a breath mint",
  },
  "Name a soup": {
    c: "pea souper|soup kitchen|tag soup|word soup|soup of the day|cup a soup|milk and cereal|melted ice cream",
  },
  "Name a famous scientist": {
    c: "dr frankenstein/victor frankenstein|doc brown/emmett brown|professor utonium|dr bunsen honeydew|beaker|professor frink|ms frizzle|doofenshmirtz/dr heinz doofenshmirtz|dr nefario|tony stark|bruce banner|reed richards|sheldon cooper|princess bubblegum|q",
  },
  "Name a car brand": {
    c: "lightning mcqueen|herbie|kitt|flintmobile|the mystery machine|bumblebee|optimus prime|chitty chitty bang bang|cozy coupe|little tikes|power wheels|tonka|lego technic",
  },
  "Name a mythical creature": {
    c: "the boogeyman|jack frost|a unicorn startup|a mythical pokemon|mew|celebi|jirachi|a quiet toddler|a tidy teenager",
  },
  "Name a card game": {
    c: "52 card pickup/fifty two pickup|house of cards|building a house of cards|card tricks|a magic trick|top trumps|the card game of life",
  },
  "Name a musical genre": {
    c: "lift music|hold music|on hold music|muzak|lullaby/lullabies|nursery rhymes|kids songs|whale song|birdsong|sea shanty/shanties|video game music|8 bit|jingles|national anthems|nerdcore|lofi hip hop|elevator jazz",
  },
});

BANK_SOURCES.push({
  "Name a unit of measurement": {
    c: "mickey|beard second|double decker buses|candlepower|dog years|baker's dozen|scoville|helen|millihelen|the kardashev scale|a moment|a sec|kessel run",
  },
  "Name a mammal": {
    c: "you|me|my teacher|my brother|my sister|mickey mouse|simba|bambi|dumbo|babe|winnie the pooh|paddington|clifford|garfield",
  },
  "Name a famous composer": {
    c: "schroeder|schroeder from peanuts|toby fox|lena raine|c418|a dj|a songwriter|a music teacher|the conductor",
  },
  "Name a candy": {
    c: "sugar|a sugar cube|cough drops|throat lozenges|tic tac|breath mints|mints|candy floss",
  },
  "Name a Harry Potter character": {
    c: "nagini|fluffy|norbert|the knight bus|the fat lady|the grey lady|the bloody baron|the fat friar|the giant squid|the hogwarts express|the marauder's map|the mirror of erised|rupert grint",
  },
  "Name a phobia": {
    c: "mondays|homework|bedtime|vegetables|broccoli|the dentist|baths|the vacuum cleaner|luposlipaphobia",
  },
  "Name a type of mushroom": {
    c: "mega mushroom|poison mushroom|toadette|captain toad|a smurf house|mushroom soup|shroomish|parasect|foongus|amoonguss|breloom",
  },
  "Name a pizza topping": {
    c: "more cheese|nothing|the box|a pizza saver|the little table|garlic dip|ranch dip|ketchup|leftovers",
  },
  "Name a type of cloud": {
    c: "cloud storage|a cloud of dust|cloud 9|a speech bubble|smoke|steam|cotton wool|a cloudy day|lakitu's cloud|flying nimbus",
  },
  "Name a constellation": {
    c: "a star sign|the plough|the saucepan|orion's belt|the summer triangle|the winter hexagon|the teapot|the kite|the false cross|glow in the dark stars|stars on my ceiling|the emu in the sky|the seven sisters|pleiades|subaru|the starbucks logo",
  },
  "Name a muscle": {
    c: "your tongue|jean claude van damme|popeye|the hulk|guns",
  },
});
