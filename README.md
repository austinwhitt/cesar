<p align="center">
  <img src="assets/logo.svg" width="120" alt="Cesar logo: a thumbs up and a thumbs down">
</p>

<h1 align="center">Cesar</h1>
<p align="center"><em>Should I text this person while intoxicated? Let the panel decide.</em></p>

---

Cesar is your wingman for bad decisions. Put the people you shouldn't text after a few drinks on your **No-Go list**. When you're out at a bar or restaurant and try to text one of them, Cesar makes you **verify your face**. Then it sends your selfie and the text to your **panel**: three friends you picked ahead of time. Two thumbs up and it sends. Two thumbs down and it dies.

Like Caesar at the Colosseum. Thumbs up or thumbs down.

> **This is an interactive prototype.** No texts are actually sent, the location is simulated, and your camera image never leaves your device.

## Try the demo

1. You start out **at a bar** (simulated GPS). Tap the location card to switch places.
2. Tap **Text someone**, pick someone marked 🚫 (like *The Ex*), and write something regrettable.
3. Pass the **face scan**. If there's no camera, a stunt double stands in.
4. Watch the **panel** vote, or tap a thumb to vote on a judge's behalf.
5. Check the **Shame Log** for every verdict.

Edit your No-Go list and your three judges from the tabs at the bottom. Everything is saved in your browser.

## Run it locally

No build step. It's just HTML, CSS and JavaScript.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

The camera needs `localhost` or HTTPS, so serve it rather than double-clicking `index.html` if you want the real face-scan preview.

## Share it with GitHub Pages

1. Push this folder to a GitHub repo.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, pick **Deploy from a branch**, then choose `main` and `/ (root)`.
4. After a minute your link will be `https://<your-username>.github.io/<repo-name>/`.

## What's real vs. faked

| Feature | Prototype | Real app (later) |
| --- | --- | --- |
| Location | You pick from a list | GPS + venue lookup (e.g. Google Places) to spot bars and restaurants |
| Face scan | Camera preview + scripted checks | Real liveness / identity check |
| Blocking the text | Texts are written inside Cesar | Cesar is the messaging app for No-Go contacts (iOS won't let apps intercept iMessage) |
| Panel | Simulated judges | Judges get an SMS link and vote in the browser, no install needed |
| Timeout | — | No verdict in 15 minutes = the text dies |

## Project layout

```
index.html      page shell + phone frame
styles.css      all styling
app.js          screens, state, and the full send → scan → trial → verdict flow
assets/logo.svg the thumbs-up / thumbs-down logo
```

## Credits

Thumb icons from [Lucide](https://lucide.dev) (ISC license).
