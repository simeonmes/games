"use strict";
// More prompts: stars, letters, legends and feelings.

addPrompts([
  ["Name a zodiac sign", "Mythology", {
    p: "leo|aries|scorpio|gemini|taurus|virgo|libra|cancer|pisces",
    s: "sagittarius/sagitarius|capricorn/capricornus|aquarius|the lion|the ram|the twins|the bull|the scales|the crab|the fish|the archer|the goat|the water bearer|the scorpion|the virgin/the maiden",
    r: "rat|ox|tiger|rabbit|dragon|snake|horse|monkey|rooster|dog|pig|sea goat|centaur|water carrier",
    d: "cetus|arachne|ascendant|rising sign|moon sign|sun sign|aries point|sidereal zodiac|tropical zodiac|celtic tree zodiac|birch|rowan|ash|alder|willow|hawthorn|oak|holly|hazel|vine|ivy|reed|elder",
    k: "ophiuchus/the serpent bearer",
    c: "stop sign|exit sign|road sign|street sign|neon sign|plus sign|minus sign|dollar sign|peace sign|for sale sign|sign language",
  }],
  ["Name an animal from the Chinese zodiac", "Mythology", {
    p: "dragon|tiger|rat|monkey|snake|horse|pig|dog|rabbit|ox",
    s: "rooster/chicken|goat/sheep/ram|boar|bunny|cow|bull|buffalo|water buffalo|mouse|hare|cockerel|hen|serpent|pony|puppy|piglet",
    r: "wood dragon|fire horse|metal rat|earth dog|water tiger|fire monkey|wood snake|metal ox|earth pig|water rabbit|golden pig",
    d: "white tiger|azure dragon|zi|chou|yin|mao|chen|wu|wei|shen|xu|hai",
    k: "cat/vietnamese cat/the cat",
    c: "mushu|sun wukong/monkey king|tigress|master viper|master monkey|tigger|tony the tiger|shere khan|peppa pig|babe|wilbur|mickey mouse|remy|bugs bunny|peter rabbit|snoopy|scooby doo|spirit|toothless|puff the magic dragon",
  }],
  ["Name a letter of the Greek alphabet", "Words", {
    p: "alpha|beta|gamma|delta|pi|omega|sigma|theta",
    s: "epsilon|zeta|eta|iota|kappa|lambda|mu|nu|xi|omicron|rho|tau|upsilon|phi|chi|psi",
    r: "digamma|wau|stigma|heta|san|koppa|qoppa|sampi|lunate sigma|final sigma",
    d: "yot|archaic koppa|archaic sampi|tsan|archaic qoppa",
    k: "sho",
    c: "a letter from greece|a postcard from greece|a letter from athens|a letter from my greek pen pal|a letter from zeus|a love letter from zeus",
  }],
  ["Name a legendary or lost place", "Mythology", {
    p: "atlantis|el dorado|camelot|narnia|neverland|avalon|olympus/mount olympus",
    s: "shangri la|asgard|valhalla|utopia|lemuria|mu|eden/garden of eden|troy|babel/tower of babel|hogwarts|middle earth|wonderland|oz|never never land|the lost city of z|lost city|fountain of youth|xanadu|hyperborea|elysium|the underworld|hades|tartarus|heaven|paradise",
    r: "lyonesse|ys|hy brasil|thule|agartha|shambhala|cibola|seven cities of gold|quivira|paititi|lost dutchman's mine|the island of saint brendan|antillia|kitezh|vineta|iram|ubar|the city of brass|lost city of the kalahari|land of punt|punt|ophir|king solomon's mines|prester john's kingdom|tir na nog|annwn|mag mell|jotunheim|alfheim|midgard|niflheim|muspelheim|vanaheim|svartalfheim|helheim|bifrost|yggdrasil",
    d: "mount meru|kunlun|penglai|jambudvipa|xibalba|aztlan|tamoanchan|mictlan|tlalocan|duat|aaru|field of reeds|tir tairngire|emain ablach|caer sidi|the isle of apples|isle of the blessed|fortunate isles|meropis|sunken city of dwarka|dwarka|kumari kandam|sannikov land|buss island|frisland|crocker land|bermeja|sandy island|pepys island|ultima thule",
    k: "sandy island",
    c: "the lost and found|the couch cushions|wherever my socks go|the backrooms|area 51|the bermuda triangle|the north pole|santa's workshop|candy land|bikini bottom|the shire|wakanda|gotham|hyrule|pallet town|the middle of nowhere",
  }],
  ["Name a superpower", "Fantasy", {
    p: "flying/flight|invisibility|super strength|super speed|teleportation|mind reading/telepathy|time travel",
    s: "x ray vision|laser eyes|heat vision|shapeshifting|healing|super healing|regeneration|immortality|force field|telekinesis|shrinking|growing|elasticity|stretching|freeze breath|ice powers|fire powers|pyrokinesis|weather control|super hearing|super jumping|wall crawling|web slinging|breathing underwater|talking to animals|night vision|mind control|time stopping|cloning|duplication|electricity|energy blasts|intangibility|phasing|danger sense|spider sense|super intelligence|precognition|seeing the future|clairvoyance|magic",
    r: "technopathy|power absorption|power mimicry|probability manipulation|luck|density control|sonic scream|matter manipulation|reality warping|gravity control|magnetism|hydrokinesis|aerokinesis|geokinesis|photokinesis|umbrakinesis|shadow manipulation|chlorokinesis|plant control|biokinesis|astral projection|possession|dream walking|portal creation|size shifting|animal mimicry|accelerated healing|invulnerability|bulletproof skin|adhesion|echolocation|omnilingualism|eidetic memory|photographic memory|enhanced reflexes|self duplication|hypnosis|empathy|emotion control|cryokinesis|electrokinesis",
    d: "chronokinesis|retrocognition|psychometry|ferrokinesis|thermokinesis|vitakinesis|umbramancy|necromancy|alchemy|transmutation|biokinetic armor|power negation|power bestowal|power sensing|omnipresence|omniscience|omnipotence|nigh invulnerability|healing factor|molecular combustion|toon force|fourth wall breaking|plot armor|cosmic awareness|matter ingestion|elemental fusion",
    k: "fourth wall breaking/breaking the fourth wall",
    c: "money|being rich|reading|sleeping in|napping|eating a whole pizza|never getting lost|patience|kindness|imagination|friendship|love|making people laugh|parallel parking|finding the remote|waking up early|being a mom|being a dad|teaching",
  }],
  ["Name an emotion or feeling", "Words", {
    p: "happy|sad|angry|scared|excited|love|fear|joy",
    s: "anger|sadness|happiness|surprise|disgust|jealousy|envy|pride|shame|guilt|embarrassment|anxiety|worry|nervous|calm|bored|boredom|lonely|loneliness|hope|grief|frustration|confusion|curiosity|relief|gratitude|contentment|nostalgia|hate|hatred|annoyance|amusement|awe|wonder|trust|sympathy|empathy|compassion|confident|confidence|shy|tired|hungry|grumpy|cheerful|proud",
    r: "melancholy|ennui|euphoria|elation|bliss|serenity|tranquility|dread|despair|anguish|remorse|regret|resentment|indignation|contempt|bitterness|apprehension|trepidation|exasperation|exhilaration|rapture|longing|yearning|homesickness|wistfulness|ambivalence|apathy|indifference|infatuation|adoration|affection|tenderness|admiration|pity|humility|vulnerability|insecurity|overwhelmed|ecstasy|glee|smugness|jubilation|fury|rage|irritation|panic|terror|horror|shock|bewilderment|hangry",
    d: "schadenfreude|saudade|hygge|weltschmerz|sehnsucht|fernweh|wanderlust|torschlusspanik|hiraeth|mono no aware|amae|ikigai|natsukashii|toska|litost|dolce far niente|gigil|kilig|han|jeong|compersion|frisson|sonder|anemoia|kenopsia|vemodalen|liberosis|opia|ellipsism|onism|acedia|limerence|abulia|anhedonia|alexithymia",
    k: "litost",
    c: "tickles|goosebumps|butterflies|the munchies|cold|warm|itchy|ouch|pins and needles|deja vu|feeling blue|seeing red|green with envy|on cloud nine|over the moon|down in the dumps|emo|sleepy|sore",
  }],
]);
