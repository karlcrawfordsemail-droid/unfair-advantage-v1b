# Unfair Advantage — Stage 1 Deploy Guide

**Goal of Stage 1:** get your valuation tool live at a real web address, working on your phone, with your API key kept secret. No accounts or payments yet — that's Stage 2 and 3.

**What you'll set up (all free to start):**
1. GitHub — stores the code
2. Anthropic API key — runs the valuations
3. Netlify — hosts the live site

You do NOT need to understand the code. You're moving files into place and pasting a few settings. Take it one step at a time. If a step fails, don't push forward — that's when to ask for help in your fresh chat.

---

## BEFORE YOU START

- Be on a **computer** (not your phone).
- Have this folder of files handy (the one this guide came in).
- Set aside ~45 minutes for a first run.

---

## PART A — Get your Anthropic API key (~5 min)

1. Go to **console.anthropic.com** and sign in (or create an account — this is separate from your Claude chat subscription).
2. Add a payment method under **Billing** (valuations cost pennies; you only pay for what's used).
3. Go to **API Keys** → **Create Key**. Name it "unfair-advantage".
4. **Copy the key** (starts with `sk-ant-`) and paste it somewhere safe temporarily. You'll need it in Part C. You won't be able to see it again after you leave the page.

---

## PART B — Put the code on GitHub (~10 min)

1. Go to **github.com**, sign in (or create a free account).
2. Click **New repository** (green button, or the + top-right → New repository).
3. Name it `unfair-advantage`. Leave it **Private**. Do NOT check "add a README". Click **Create repository**.
4. On the next page, look for the link **"uploading an existing file"** (under "…or push an existing repository"). Click it.
5. **Drag the contents of this folder** into the upload box — but NOT the `node_modules` folder or `dist` folder if they exist (they're big and not needed; `.gitignore` handles this, but don't manually drag them).
   - The important things to upload: `src/`, `netlify/`, `public/`, `index.html`, `package.json`, `vite.config.js`, `netlify.toml`, `.gitignore`
6. Scroll down, click **Commit changes**.

Your code is now on GitHub.

---

## PART C — Deploy on Netlify (~15 min)

1. Go to **netlify.com**, sign up with your **GitHub account** (easiest — click "Sign up with GitHub").
2. Click **Add new site** → **Import an existing project**.
3. Choose **GitHub**, authorize it, and pick your `unfair-advantage` repository.
4. Netlify auto-detects the settings from `netlify.toml`. You should see:
   - Build command: `npm run build`
   - Publish directory: `dist`
   Leave those as-is.
5. **BEFORE deploying**, click **Add environment variables** (or "Advanced" → "New variable"):
   - Key: `ANTHROPIC_API_KEY`
   - Value: paste your `sk-ant-...` key from Part A
   - Save it.
   > This is the important step — it keeps your key secret on the server, never in the public code.
6. Click **Deploy**.
7. Wait 1–3 minutes. When it finishes, Netlify gives you a URL like `random-name-12345.netlify.app`.

---

## PART D — Turn on Blobs storage & rename your site (~5 min)

1. **Netlify Blobs** (where valuation results are briefly stored while processing) is enabled automatically for your site — no action usually needed. If valuations error out with a storage message, go to your site's **Configuration** and confirm Blobs is enabled, or ask in your fresh chat.
2. To rename the URL: **Site configuration** → **Site details** → **Change site name** → type `unfair-advantage` (or a variant if taken). Your URL becomes `unfair-advantage.netlify.app`.

---

## PART E — Test it (~5 min)

1. Open your new URL on your **computer** first.
2. Pick "I'm selling", add a photo of an item, hit the value button.
3. Wait — a collectible can take 30–60 seconds (the loading messages will cycle). A result should appear.
4. Now open the same URL on your **phone**. Test the camera/photo upload — this is the thing that didn't work in the prototype and SHOULD work now on the real site.

If you get a result on both computer and phone — **Stage 1 is done.** You have a live, working tool.

---

## IF SOMETHING GOES WRONG

- **Build failed on Netlify:** open the deploy log, copy the red error text, bring it to your fresh chat.
- **Site loads but valuation errors:** most likely the API key wasn't saved correctly in Part C step 5, or Blobs isn't enabled. Re-check the environment variable spelling: exactly `ANTHROPIC_API_KEY`.
- **"Taking longer than expected":** the background function may need Blobs enabled, or the API key is missing. Check both.
- **Anything else:** copy the exact error message and bring it to the fresh chat. Don't guess-fix — describe what you see.

---

## WHAT'S NEXT (later stages, not now)

- **Stage 2:** user accounts (sign up / log in)
- **Stage 3:** Stripe payments + the $9.99 subscription
- **Stage 4:** usage tracking + the ~500 cap + locking the tool to paying users

Get Stage 1 live and stable first. Everything else builds on top of it.
