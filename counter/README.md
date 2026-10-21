# View counter

Counts views on simeonmes.github.io/games, including visitors with ad blockers, and shows
how many people have the site open right now. Results: https://simeonmes.github.io/games/views/

- `worker.js` runs on a free Cloudflare Worker and stores the counts.
- `../site.js` is on every page. It counts the view and holds a connection open while the page
  is open, which is how "on now" is counted.
- `../views/` is the page that shows the numbers.

Ad blockers work from lists of known tracker addresses. This counter uses its own address,
which isn't on any list. It doesn't count visitors who have JavaScript turned off, and it
skips obvious bots and crawlers.

## Setup (once)

1. Make a free account at https://dash.cloudflare.com and open **Workers & Pages** once, so
   Cloudflare gives your account a `<something>.workers.dev` subdomain.
2. In Cloudflare, go to **My Profile → API Tokens → Create Token**, use the
   **Edit Cloudflare Workers** template, and copy the token.
3. In this GitHub repo, go to **Settings → Secrets and variables → Actions** and add:
   - `CLOUDFLARE_API_TOKEN`: the token
   - `CLOUDFLARE_ACCOUNT_ID`: the Account ID shown on the Workers & Pages overview page
4. Go to **Actions → Deploy view counter → Run workflow**. When it finishes, the log shows
   the address, like `https://games-live.<something>.workers.dev`.
5. In `site.js` and `views/index.html`, replace `YOUR-SUBDOMAIN` with `<something>`.

The Action redeploys by itself whenever `counter/` changes on `main`.

## Limits

The free Cloudflare plan allows 100,000 requests a day, which works out to roughly
50,000 page views a day. Counting starts the day this is deployed. Days are in UTC.
