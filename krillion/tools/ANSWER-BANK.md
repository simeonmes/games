# Answer bank maintenance

The browser loads `bank-wikidata.js` and `bank-expanded.js` as local assets. Gameplay needs no database connection or API key. Live rooms send the host's merged bank to guests.

`bank-wikidata.js` contains category-specific records from [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access), whose structured data is CC0. Source queries, retrieval dates and raw records are retained in `wikidata-cache/`; `wikidata-report.txt` summarizes the import. Wikipedia language coverage estimates rarity; it is not a survey of player responses. Imports never introduce a new Plankton or Krillion tier.

`data/answer-supplement.json` contains reviewed additions for all prompts. Fixed sets such as states and alphabet letters gain alternative names rather than invented members. The compiler reuses an existing answer's tier for aliases. `data/answer-baseline.json` records the previous bank for coverage and score regression checks; `data/answer-coverage.json` reports each prompt's changes. Added spellings include canonical names of new answers as well as aliases.

Regenerate database additions from cached records (download missing records as needed):

```sh
node krillion/tools/wikidata.mjs --rebuild
node krillion/tools/expand-bank.cjs
```

Add `--refresh` to fetch fresh database records. `--only cheese` updates a selected category while retaining the others. `--dry-run` reports changes without writing files. Review database changes before shipping: several broad Wikidata classes contain unrelated objects, so these sources are deliberately excluded until more precise queries are available. Failed sources do not overwrite prior successful results during a partial update.

After editing supplements, run:

```sh
node krillion/tools/expand-bank.cjs
node krillion/tools/verify.js
node krillion/tools/expanded-bank-verify.cjs
node krillion/tools/room-verify.cjs
```

The optional `noillirk-verify.cjs` browser check needs Playwright and Chromium; pass an installed Chromium executable as its first argument if needed.
