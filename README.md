# DefVetBridge website

The one-page public website for DefVetBridge (DVB): what it is, how it works, and a free guide for veterans getting ready for a DVA claim.

- Live at https://www.defvetbridge.com (Cloudflare Pages project `defvetbridge-website`, deployed automatically from the `main` branch).
- Plain HTML and CSS, no build step. Edit `index.html`, commit, push: Cloudflare redeploys in about a minute.
- No donations or payment buttons. The site is free to use.

## What is in this repo

| File | What it is |
|---|---|
| `index.html` | The whole site |
| `DVB_Getting_Ready_For_Your_DVA_Claim.pdf` | Free 2-page fill-in guide |
| `VeteransGuide.pdf` | 4-page plain-English guide for veterans using DVB |
| `functions/api/interest.js` | Register-interest endpoint (Cloudflare D1 storage, confirmation email via Resend) |
| `*.png`, `*.jpg`, `favicon.ico` | Logo, share image and icons |

DVB is an independent tool that helps veterans organise their own evidence. It does not give legal or medical advice and is not affiliated with, or endorsed by, the Department of Veterans' Affairs.

This repository holds only the public website. The DVB application itself lives elsewhere.

