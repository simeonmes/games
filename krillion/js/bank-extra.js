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

BANK_SOURCES.push({
  "Name a cut of beef": {
    p: "ribeye/rib-eye/rib eye steak/ribeye steak/rib eye|sirloin/sirloin steak/surloin|filet mignon/filet minion/fillet mignon/filet mignone|t bone/t-bone steak/tbone steak",
    s: "brisket/briskett/beef brisket|porterhouse/porterhouse steak|strip loin/striploin/kansas city strip/kc strip|flank/flank steak|skirt/skirt steak|tri tip/tri-tip|chuck roast|pot roast|chuck steak|rump steak|round steak|short ribs/beef short ribs|beef ribs/ribs|ground chuck|ground round|ground sirloin|stew meat/stewing beef|sirloin tip|tenderloin steak",
    r: "top sirloin cap|blade steak|top blade|minute steak|standing rib roast|back ribs|plate short ribs|delmonico/delmonico steak|club steak|shell steak|petite sirloin|ball tip|rump roast|knuckle|flap meat/flap steak|inside skirt|outside skirt|beef shin|neck|brisket point|brisket flat|burnt ends|tenderloin tips|tournedos|beef medallions|bone in ribeye|cowboy steak|tri tip roast|top round roast|eye round roast|chuck short ribs|flanken",
    d: "denver cut|sierra cut|thin flank|thick rib|chuck tender|shoulder clod|shoulder tender|top butt|bottom butt|sirloin flap|tensor fasciae latae|tri tip triangle|rib fingers|intercostals|navel end|short plate|hanging tender|oyster blade|bolar blade|chuck eye roll|cross rib|english roast|silver tip|rump cap|knuckle steak|baseball steak|coulotte steak|bistro steak|merlot steak|teres major steak|vacio",
    c: "wagyu|kobe/kobe beef|angus|corned beef|steak frites|hamburger patty|beef jerky|beefeater|beef stew",
  },
  "Name a dinosaur": {
    p: "tyrannosaurus/tyranosaurus/tyrannosaur/tyrannasaurus|triceratops/tricerotops/triceratop|velociraptor/velocirapter/velociraptors",
    s: "stegosaurus/stegasaurus/stegosaur|brachiosaurus/brachiosaur/brachyosaurus|pterodactyl/pteradactyl/terodactyl/pterodactyle|spinosaurus/spinosaur/spinasaurus|ankylosaurus/ankylosaur/ankylosarus|diplodocus/diplodicus|brontosaurus/brontosaur|allosaurus/allosaur|parasaurolophus/parasaurolophis|iguanodon/iguanadon|raptor/raptors",
    r: "acrocanthosaurus|ceratosaurus|chasmosaurus|centrosaurus|camarasaurus|edmontonia|euoplocephalus|giraffatitan|hadrosaurus|hypsilophodon|ornithomimus|pachyrhinosaurus|pentaceratops|plateosaurus|psittacosaurus|struthiomimus|supersaurus|tenontosaurus|thescelosaurus|torosaurus|titanosaurus|patagotitan|alamosaurus|anchisaurus|bambiraptor|coelurus|dracorex|gigantoraptor|guanlong|kosmoceratops|megaraptor|monolophosaurus|neovenator|saurolophus|sinraptor|torvosaurus|yangchuanosaurus|concavenator|deinocheirus|citipati|dilong",
    d: "avaceratops|beipiaosaurus|dacentrurus|diabloceratops|eotyrannus|gastonia|hesperosaurus|huayangosaurus|lesothosaurus|lufengosaurus|masiakasaurus|mussaurus|nothronychus|pinacosaurus|regaliceratops|rugops|saichania|sauropelta|sauroposeidon|scelidosaurus|scutellosaurus|segnosaurus|shunosaurus|siats|sinornithosaurus|talarurus|tsintaosaurus|tuojiangosaurus|velafrons|wuerhosaurus|xenotarsosaurus|zalmoxes|zuul|leaellynasaura|muttaburrasaurus|spinophorosaurus|achillobator|alioramus|balaur|caudipteryx|dromaeosaurus|halszkaraptor|incisivosaurus|linhenykus|mononykus|pegomastax|qianzhousaurus|rajasaurus|tawa|unenlagia",
    c: "bird/birds|pigeon|ostrich|turkey|godzilla jr|dino nuggets/dinosaur nuggets|jurassic park|dinosaur jr",
  },
  "Name a word that rhymes with 'cat'": {
    p: "hat/hats|bat/bats|mat/mats|rat/rats",
    s: "gnat|spat|splat|chat|scat|vat|tat|that|flat|brat|sprat|drat|frat|stat|sat|pat|fat",
    r: "chitchat/chit chat|meerkat|muskrat|wombat|acrobat|diplomat|habitat|thermostat|copycat|pussycat|kitty cat|alley cat|tomcat|wildcat|bobcat|polecat|fat cat|pack rat|top hat|hard hat|old hat|welcome mat|place mat|doormat|laundromat|format|combat|cravat|hazmat|nonfat|lowfat|fruit bat|vampire bat|dingbat|brickbat|at bat",
    d: "aristocrat|autocrat|bureaucrat|democrat|technocrat|plutocrat|photostat|rheostat|hydrostat|ziggurat|caveat|begat|cowpat|mudflat|standpat|pitapat|tit for tat|rat a tat|scaredy cat|hellcat|civet cat|habitat loss|sabbat|ararat|rabat|surat|kitkat/kit kat",
    c: "cat|katt|caat|kat|catt|hat trick",
  },
});

BANK_SOURCES.push({
  "Name an organ in the human body": {
    p: "intestines/intestine/guts/bowels|kidney/kidneys|lung/lungs|stomach/stomache/tummy|heart/hearts|brain/brains|skin/epidermis",
    s: "pancreas/pancrease/pancrious|appendix/apendix|gall bladder/gallbladder/gal bladder|esophagus/oesophagus/esophogus/gullet|thyroid/thyroid gland|bladder/urinary bladder|uterus/womb|ovaries/ovary|eyes/eyeball/eyeballs|ears/ear|nose|tongue|colon/large bowel|small bowel|tonsils|spinal cord|liver/livers|spleen/spleens",
    r: "larynx/voice box|trachea/windpipe|pharynx/throat|diaphragm|prostate gland|testes/testicles|pituitary gland/hypophysis|pineal gland|hypothalamus|adrenal glands/adrenals|salivary glands|parotid gland|sweat glands|mammary glands|lymph nodes/lymph glands|thymus gland|placenta|cerebrum|cerebellum|brainstem/brain stem|medulla|retina|cornea|cochlea|eardrum|sinuses|gums|fallopian tubes|cervix|ureters|urethra|arteries|veins|blood vessels|nerves|bone marrow|muscles",
    d: "omentum|peritoneum|pleura|pericardium|meninges|dura mater|islets of langerhans|corpus luteum|seminal vesicles|bulbourethral glands|vestibular system|semicircular canals|olfactory bulb|basal ganglia|thalamus|pons|amygdala|hippocampus|vermiform appendix|gallbladder duct|bile duct|lacrimal gland|meibomian glands|sebaceous glands|ceruminous glands|enteric nervous system|mesentery fold|choroid|sclera|conjunctiva|uvula|epiglottis|adenoid",
    c: "organ donor|pipe organ|church organ|organ grinder|organic|blood|hair|fingernails/nails|teeth",
  },
  "Name a gemstone": {
    p: "diamond/diamonds/dimond|emerald/emeralds/emrald|ruby/rubies|sapphire/sapphires/saphire",
    s: "amethyst/amethist/amythest/amatheyst|topaz/topaz stone|opal/opals|pearl/pearls|turquoise/turqoise/turquois|aquamarine/aqua marine|garnet/garnets|peridot/peridots|citrine/citrine quartz|onyx/black onyx|jade/jadeite/nephrite|moonstone/moon stone|rose quartz|tanzanite/tanzinite|amber stone",
    r: "black opal|fire opal|star sapphire|pink sapphire|yellow sapphire|smoky quartz|clear quartz/rock crystal|tourmaline/tourmalines|watermelon tourmaline|rubellite|zircon|moissanite|spinel/red spinel|alexandrite|chrysoberyl|cats eye|kunzite|morganite|heliodor|beryl|iolite/cordierite|sunstone|labradorite|amazonite|aventurine|carnelian/cornelian|chalcedony|chrysoprase|sardonyx|obsidian|hematite|malachite|azurite|rhodonite|rhodochrosite|sodalite|lepidolite|fluorite|apatite|tiger eye/tigers eye|lapis|bloodstone/heliotrope|agate/agates|jasper/red jasper|ametrine|mother of pearl/nacre|coral|jet|ammolite",
    d: "chrome diopside|diopside|enstatite|kyanite|andalusite|titanite/sphene|prehnite|variscite|sugilite|charoite|seraphinite|prasiolite|danburite|hiddenite|euclase|phenakite|demantoid|tsavorite|spessartine|rhodolite|pyrope|almandine|hessonite|uvarovite|chrysocolla|shattuckite|dumortierite|ekanite|zultanite|hackmanite|scapolite|sinhalite|kornerupine|petalite|pollucite|bixbite|goshenite|indicolite|paraiba|imperial topaz|blue john|thulite|larvikite|picasso jasper|ocean jasper|dendritic agate|moss agate|fire agate|bumblebee jasper",
    c: "cubic zirconia|rhinestones|glass|fools gold/pyrite|the hope diamond|diamond in the rough|ruby slippers|gem|precious|birthstone",
  },
  "Name a martial art": {
    p: "karate/karati|kung fu/kungfu/gung fu|taekwondo/tae kwon do/taekwando/tae kwon doe/tkd|judo",
    s: "jiu jitsu/jujitsu/ju jitsu/jujutsu/jiujitsu/brazilian jujitsu|muay thai/thai boxing|kick boxing|mixed martial arts|krav maga/kravmaga|capoeira/capoera|tai chi/taichi/tai chi chuan/taiji|aikido/akido|kendo|sumo wrestling|wing chun/wing tsun/ving tsun|boxing|wrestling/greco roman wrestling/freestyle wrestling|fencing|kyokushin karate",
    r: "goju ryu|wado ryu|shito ryu|uechi ryu|isshin ryu|shorin ryu|kenpo/kempo/american kenpo|praying mantis/mantis kung fu|white crane|eagle claw|monkey kung fu|drunken boxing/zui quan|wudang|hwa rang do|kumdo|escrima|arnis|pencak silat|combat sambo|kushti/pehlwani|la canne/canne de combat|shoot boxing|luta livre|bujinkan|battojutsu|naginatajutsu|kobudo|aiki jujutsu|thai chi|dim mak",
    d: "haidong gumdo|kuntao|pradal serey|bando|banshay|varma kalai|jogo do pau|juego del palo|lucha canaria|kapap|defendu|hojojutsu|tessenjutsu|shurikenjutsu|sojutsu|kusarigamajutsu|hakko ryu|taido|kudo|shootfighting|khuresh|musti yuddha|lathi khela|adimurai|kuttu varisai|malla yuddha|sqay|bokator kun khmer|tomoi|tarung derajat|kendo kata|yoseikan budo|nippon kempo|kyusho jitsu|hung kuen|lau gar|mok gar|li gar|pak mei|bak mei|five animals|tiger crane|southern mantis|bajiquan form",
    c: "thumb wrestling|arm wrestling|karate chop|sword fighting|pillow fighting|slap fighting|tickling|wii boxing",
  },
});
