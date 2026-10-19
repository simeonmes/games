"use strict";
// More answers for the prompts in data.js, keyed by prompt text and laid out the same way.
// Repeating an answer that's already in the bank adds its extra spellings (misspellings,
// short names) to that answer instead of creating a second one.

BANK_SOURCES.push({
  "Name a cheese": {
    p: "swiss/swiss cheese|parmesan/parmesian/parmasan/parmesean|mozzarella/mozzerella/mozarella/mozzarela|cheddar/chedder/cheddar cheese",
    s: "gouda/gowda|gruyere/gruyère/gruyer|camembert/camenbert|ricotta/ricota|provolone/provalone|string cheese|feta/feta cheese",
    r: "red windsor|smoked gouda|aged cheddar|white cheddar|sharp cheddar|baby swiss|farmer cheese|labneh|queso blanco|queso panela/panela|quark|cream havarti|danish blue|cambozola|saint agur|bel paese|grana padano|ricotta salata|smoked provolone|fresh mozzarella|bocconcini|ossau iraty|pecorino sardo|gloucester|cornish yarg|cotswold|shropshire blue|sage derby|brillat savarin|chaource|neufchatel|petit suisse",
    d: "abondance|banon|beaufort|bleu d auvergne|brie de meaux|cantal|crottin de chavignol|fourme d ambert|langres|maroilles|mont d or|pont l eveque|rocamadour|saint marcellin|saint nectaire|selles sur cher|tomme de savoie|valencay|appenzeller|sbrinz|tete de moine|vacherin fribourgeois|fontal|montasio|piave|castelmagno|bra|robiola|squacquerone|provola|idiazabal|mahon|roncal|tetilla|cabrales|torta del casar|zamorano|serra da estrela|queijo de azeitao|kefalotyri|graviera|kasseri|manouri|myzithra|anthotyros|leipajuusto/bread cheese|vasterbotten|herrgard|prastost|havarti dill|danbo|esrom|nokkelost|gamalost|sulguni|chechil|bryndza|oscypek|korbacik|liptauer|tvorog|paneer tikka|chhena|kalari|chhurpi|rubing|rushan|caciotta|stracciatella|burrata pugliese",
    c: "string theory|swiss cheese plant|cheesecake|cheese puffs|cheez its/cheez-its|mac and cheese|cheesy|cheeseburger|say cheese",
  },
  "Name a fish you can eat": {
    p: "salmon/salman/samon|tuna/tunafish/tuna fish|cod/codfish",
    s: "tilapia/talapia|catfish/cat fish|trout/rainbow trout|halibut/halibot|sardine/sardines/sardeen|mackerel/mackeral/makerel|sea bass/seabass|swordfish/sword fish|anchovy/anchovies/anchovie|haddock/hadock|mahi mahi/mahi-mahi/mahimahi|red snapper|flounder/flounders|herring/herrings|pollock/pollack|yellowfin tuna/yellowfin|bluefin tuna/bluefin|albacore|sockeye salmon/sockeye|king salmon/chinook|atlantic salmon|smoked salmon|lox",
    r: "dover sole|lemon sole|striped bass|black sea bass|chilean sea bass/patagonian toothfish|white perch|yellow perch|crappie|bluegill|sunfish|largemouth bass|smallmouth bass|carp|grass carp|silver carp|channel catfish|steelhead|brook trout|lake trout|coho salmon/coho|pink salmon|chum salmon|skipjack tuna/skipjack|bigeye tuna|ahi|red mullet|grey mullet/mullet|sea bream/bream|dorade|snoek|sprat/sprats|pilchard/pilchards|whiting|ling|coley/saithe|hoki|basa|swai|pangasius|milkfish|rohu|hilsa|pomfret|kingfish|king mackerel|spanish mackerel|wolffish|monkfish tail|redfish|ocean perch|rockfish|black cod/sablefish|sole fillet|plaice|brill|halibut cheeks",
    d: "barramundi cod|murray cod|blue grenadier|gemfish|leatherjacket|flathead|tailor|mulloway|trevally|dhufish|coral trout|nile perch|tigerfish|capelin|eulachon|smelt|whitebait|vendace|pollan|burbot|muskellunge|northern pike|sauger|freshwater drum|sheepshead|tautog|black drum|red drum|spotted seatrout|weakfish|croaker|spot|pigfish|grunt|triggerfish|hogfish|lionfish|cubera snapper|mutton snapper|lane snapper|vermilion snapper|scamp|gag grouper|red grouper|goliath grouper|snook|tarpon|ladyfish|sheepshead minnow",
    c: "fish sticks|goldfish crackers|fish and chips|tuna sandwich|sushi|fishsticks",
  },
  "Name a type of nut": {
    p: "peanut/peanuts/penut|almond/almonds/almound|cashew/cashews/cashue|walnut/walnuts",
    s: "pecan/pecans/pecan nut|pistachio/pistachios/pistacio/pistachio nut|hazelnut/hazelnuts/hazel nut|macadamia/macadamia nut/macadamia nuts/macademia|brazil nut/brazil nuts|chestnut/chestnuts/chesnut|pine nut/pine nuts/pinenut|coconut/coconuts",
    r: "english walnut|marcona almonds|honey roasted peanuts|boiled peanuts|spanish peanut|valencia peanut|virginia peanut|jumbo cashew|candied pecans|beech nut/beechnut|hickory nut/hickory nuts|pignoli|sweet chestnut|roasted chestnut|butternut/white walnut|heartnut|carya|pili nut/pili",
    d: "nangai|ngali nut|marula nut|baobab seed|safou|bitter kola|palm nut|chilean hazelnut/chilean hazel|gevuina|pequi|cumaru|cutia nut|sapucaia/sapucaia nut|paradise nut|beaked hazel|corylus|siberian pine nut|korean pine nut|stone pine nut|pinyon|torreya nut|hickory shagbark|mockernut|pignut|bitternut|black walnut kernel|japanese walnut|manchurian walnut|persian walnut|buartnut",
    c: "donut/doughnut|nutella|nutmeg|wingnut|nutcracker|nut case/nutcase|peanut butter|nut house|butternut squash|coco puffs",
  },
});

BANK_SOURCES.push({
  "Name a pasta shape": {
    p: "spaghetti/spagetti/spaghettti/spagehtti|penne/pene/penne rigate|macaroni/macaronni/macarroni|lasagna/lasagne/lasanga|fettuccine/fettucine/fetuccine/fettucini",
    s: "rigatoni/rigatone|linguine/linguini/linguene|ravioli/raviolli/raviloli|farfalle/farfale/bow ties|fusilli/fusili/corkscrew|tortellini/tortelini/tortellinni|angel hair/angel hair pasta|ziti/baked ziti|orzo/risoni|elbow macaroni|shells/shell pasta/seashells/jumbo shells|gnocchi/nocchi/gnochi|tagliatelle/tagliatele|manicotti/manacotti|cannelloni/canneloni|pappardelle/papardelle|spirals|wagon wheels|alphabet pasta|stuffed shells",
    r: "bucatini/bucatinni|orecchiette/orecchiete|ditalini/ditali|gemelli/gemmeli|cavatappi/cellentani|campanelle/gigli|radiatori|stelline/stars|vermicelli/vermicelli pasta|paccheri/pacheri|mafaldine/reginette|lumaconi|conchiglioni|tortiglioni|mezze maniche|cappelletti|anolini|spaghettini|maltagliati|quadrucci|farfalline|fideo/fideos|egg noodles|ziti rigati",
    d: "calamarata|candele|casarecce|cencioni|ciriole|corzetti stampati|fainelle|fileja|fregula/fregola sarda|garganelli|gramigna|lagane|lanterne|lorighittas|lumache|maccheroncini|mafalda corta|malloreddus|marille|mezzelune|occhi di lupo|pasta mista|pennoni|pici|pizzoccheri|quadrefiore|radiatore|sagne|scialatielli|spaccatelle|testaroli|tripoline|tubetti|umbricelli|vesuvio|zitoni",
    c: "ramen/ramen noodles|instant noodles|pasta sauce|pastafarian|pastor|top ramen|pot noodle|spaghetti code",
  },
  "Name a bone in the human body": {
    p: "femur/thigh bone/thighbone|skull/scull|rib/ribs/rib bone|spine/backbone/spinal column",
    s: "tibia/shinbone/shin bone|fibula/fibia|humerus/humorous/upper arm bone|radius|ulna|clavicle/collar bone|pelvis/pelvic bone|sternum/breastbone/breast bone|patella/knee cap|scapula/shoulderblade|vertebrae|jaw bone|cranium/skull cap|hip/hipbone|coccyx/tail bone|wrist bone|ankle bone|finger bone|toe bone",
    r: "metacarpals/metacarpal bone|metatarsals/metatarsal bone|phalanges/finger bones/toe bones|sacrum/sacral bone|maxilla/upper jaw|stapes|incus|malleus|ear bones/ossicles|calcaneus/calcaneum|talus/astragalus|carpals/carpal bones|tarsals/tarsal bones|hyoid/hyoid bone|ilium/iliac bone|ischium|pubis/pubic bone|zygomatic/zygomatic bone/zygoma|frontal bone/frontal|occipital/occipital bone|parietal/parietal bone|temporal/temporal bone|nasal bones|atlas vertebra|axis vertebra|cervical vertebrae|thoracic vertebrae|lumbar vertebrae|floating ribs|costal cartilage",
    d: "scaphoid/scaphoid bone|lunate/lunate bone|triquetral|pisiform/pisiform bone|trapezium/trapezium bone|trapezoid/trapezoid bone|capitate/capitate bone|hamate/hamate bone|navicular/navicular bone|cuboid/cuboid bone|medial cuneiform|intermediate cuneiform|lateral cuneiform|sphenoid/sphenoid bone|ethmoid/ethmoid bone|vomer/vomer bone|lacrimal/lacrimal bone|palatine/palatine bone|inferior nasal concha|sesamoid/sesamoid bones|xiphoid process|manubrium|olecranon|acromion|coracoid process|glenoid|acetabulum|greater trochanter|lesser trochanter|medial malleolus|lateral malleolus|mastoid process|styloid process|odontoid process/dens|sella turcica|cribriform plate|hallux|pollex|true ribs|false ribs",
    c: "funny bone|lazy bones|skeleton|bone marrow|t-bone steak|dog bone|bone dry|bone appetit",
  },
  "Name a planet, moon or dwarf planet": {
    p: "earth/planet earth|mars/the red planet|jupiter/jupitor|saturn/saturne|the moon/luna",
    s: "venus|mercury|neptune/neptun|uranus/urnaus|pluto/plutoe",
    r: "io/io moon|europa/europa moon|ganymede/ganymeade|callisto/calisto|titan/titan moon|enceladus/enceladas|triton/triton moon|charon/sharon|ceres/ceres dwarf planet|eris/eris dwarf planet|phobos moon|deimos moon|mimas moon|rhea/rhea moon|iapetus/iapetus moon|dione/dione moon|tethys moon|miranda/miranda moon|oberon/oberon moon|titania/titania moon|ariel/ariel moon|umbriel/umbriel moon",
    d: "hyperion/hyperion moon|phoebe/phoebe moon|janus|epimetheus|pandora|prometheus moon|atlas moon|pan moon|daphnis|helene|calypso moon|telesto|methone|pallene|anthe|amalthea/amalthea moon|himalia|elara|pasiphae|sinope|lysithea|carme|ananke|leda|thebe|adrastea|metis|puck|portia|juliet moon|belinda|cressida|desdemona|rosalind|bianca|cordelia|ophelia|mab|cupid|perdita|sycorax|caliban|prospero|setebos|stephano|trinculo|francisco|margaret|ferdinand|nereid/nereid moon|proteus/proteus moon|larissa|galatea|despina|thalassa|naiad|halimede|sao|laomedeia|psamathe|neso|hippocamp|nix|hydra moon|kerberos|styx moon|dysnomia|hiiaka|namaka|weywot|vanth|orcus|ixion|varuna|salacia|arrokoth|vesta|pallas|hygiea|sedna/sedna dwarf planet|makemake/makemake dwarf planet|haumea/haumea dwarf planet",
    c: "planet x|planet of the apes|planet fitness|daily planet|captain planet|death star|moon pie|honeymoon|full moon|blue moon|half moon|sailor moon",
  },
});
